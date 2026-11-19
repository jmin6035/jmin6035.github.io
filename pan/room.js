/* 판생 관제실(docs/45, 11/19 사용자 '아예 다르게, 누가 봐도 우와') — 바뀐 것(왼쪽) · 항로 띠 + 생산 순서(가운데) · 대안(오른쪽).
   계산은 지금 PS 엔진 그대로: 바뀐 것 = ps_changes, 영향 = PS.ctx, 대안 = PS.options·PS.fillers, 미리보기 = 시험(PS.simStart) 위에서 PS.ctx 다시(기록 안 함), 채택 = D|계약 날짜 고정(공유 저장소) */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => PS.n0(v), md = (d) => (d ? PS.md(String(d).slice(0, 10)) : '');
  const KEY = 'pan-room';
  let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { st = {}; }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ past: st.past, win: st.win, note: st.note, theme: st.theme })); } catch (e) { /* 무시 */ } };
  const KN = { arr: '배 입항', dept: '배 출항', need: '생산 필요일', due: '납기', eta: '소재 입고 예정', qty: '주문 톤', new: '새 주문' };
  const FN = (f) => (f === 'STS' ? 'AL-STS' : f);
  const FC = { AZ: 'az', MAC: 'mac', AL: 'al', STS: 'sts' };
  const GRP = (g) => { g = String(g || ''); return /수출/.test(g) && !/컬러/.test(g) ? '도금수출' : /자동차/.test(g) ? '자동차' : /도금판매|도금국내/.test(g) ? '도금국내' : /컬러|자가/.test(g) ? '자가재' : /수요/.test(g) ? '수요개발' : g || '그룹 미확인'; };
  const linesOf = (fam) => (fam === 'AZ' ? ['1CGL'] : fam === 'MAC' || fam === 'STS' ? ['2CGL'] : ['1CGL', '2CGL']);
  const dd = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
  let B, C, list = [], sel = 0, pv = -1, quiet = false, asks = [], pk = '', pkFor = '';
  const cache = {};

  /* ---------- 바뀐 것 → 묶음 카드(pages.js 오늘 할 일과 같은 규칙) ---------- */
  function build() {
    PS.pastMode = st.past === 'in' ? 'in' : 'out';
    C = PS.ctx();
    const CH = B.changes || { events: [], runs: [] }, win = st.win || '3', lastRun = (CH.runs || []).slice(-1)[0];
    const since = win === 'run' && lastRun ? lastRun[0] : PS.addD(C.today, -(+win || 3)) + 'T00:00';
    const byCon = {}; for (const e of CH.events || []) { if (e[0] < since) continue; const z = (byCon[e[1]] = byCon[e[1]] || {}); if (!z[e[2]] || z[e[2]][0] <= e[0]) z[e[2]] = e; }
    const cards = {}; let gone = 0, goneT = 0;
    for (const [con, z] of Object.entries(byCon)) {
      const main = z.arr || z.due || z.need || z.dept || z.new || z.eta || z.qty || z.gone; if (!main) continue;
      const [at, , k, fr, to, t, grp, , dst, man, shp] = main;
      if (k === 'gone') { gone++; goneT += t; continue; }
      const it = C.itemOf[con]; if (!it) continue;
      if (k === 'eta') { const pd = (C.at[con] || [])[0]; if (!pd || to.slice(0, 10) <= pd.d) continue; }
      const place = String(shp || dst || '').replace(/\s*\d순$/, '').trim();
      const key = k === 'new' ? `new|${grp}|${place}|${it.fam}` : `${k}|${place}|${fr}|${to}|${it.fam}`;
      const cd = (cards[key] = cards[key] || { k, at, fr, to, grp: GRP(grp), fam: it.fam, place, cons: [], t: 0, man: new Set() });
      cd.cons.push(con); cd.t += it.t; if (man) cd.man.add(man); if (at > cd.at) cd.at = at;
    }
    list = Object.values(cards).map(judge).sort((a, b) => a.rank - b.rank || b.t - a.t);
    list.unshift(...asks.map(judge));
    list.gone = [gone, goneT]; list.nCon = Object.keys(byCon).length;
  }
  function judge(c) {
    const its = c.cons.map((x) => C.itemOf[x]).filter(Boolean);
    c.need = c.k === 'ask' ? c.need : its.map((x) => x.need).sort()[0];
    const last = its.map((x) => (C.at[x.con] || []).slice(-1)[0]).filter(Boolean).map((x) => x.d).sort().pop();
    c.last = last; c.lateD = last ? dd(last, c.need) : null; c.t = its.reduce((a, x) => a + x.t, 0);
    c.later = ['arr', 'dept', 'need', 'due'].includes(c.k) && c.to > c.fr;
    c.fromStock = its.reduce((a, x) => a + (C.A.stockUsed[x.con] || 0), 0);
    c.state = c.fromStock >= c.t * 0.95 ? '재고에서 출하' : !last ? '배정 없음' : c.lateD > 0 ? '지연 위험' : c.later && c.lateD < -7 ? '미뤄도 됨' : '맞음';
    c.rank = c.k === 'ask' ? -1 : c.state === '지연 위험' ? 0 : c.state === '배정 없음' ? 1 : c.state === '미뤄도 됨' ? 2 : 3;
    c.id = c.k === 'ask' ? `ask|${c.q}|${c.need}|${c.fam}` : `${c.k}|${c.place}|${c.fr}|${c.to}|${c.fam}`;
    return c;
  }
  function optsOf(c) {
    if (c.state === '지연 위험' || c.state === '배정 없음') return PS.options(C, c.cons, c.need).opts || [];
    if (c.k === 'ask') { const R = PS.options(C, c.cons, c.need); return R.opts || []; }
    if (c.state !== '미뤄도 됨') return [];
    const F = PS.fillers(C, c.cons, c.last), ln = linesOf(c.fam);
    const late = Object.keys(C.A.out).filter((k) => ln.includes(k.split('|')[0]) && C.A.out[k].g === c.fam && k.split('|')[1] <= c.need && k.split('|')[1] > c.last).map((k) => k.split('|')[1]).sort().pop();
    if (!late) return [];
    return [{ kind: '미루기', txt: `${md(late)}로 미룸(새 필요일 ${md(c.need)})${F.length ? `. 빈 자리에 ${F.map((f) => `${f.it.grp} ${f.it.who === '컬러 투입' ? f.it.cus : f.it.who} ${n0(f.it.t)}t(${f.late > 0 ? f.late + '일 지연 중' : '필요 ' + md(f.it.need)})`).join(' · ')} 당겨옴` : ''}`,
      pins: c.cons.map((x) => [x, late]).concat(F.map((f) => [f.it.con, c.last])), pull: F.reduce((a, f) => a + f.it.t, 0),
      moved: [], pulled: F.map((f) => ({ con: f.it.con, from: f.pd ? f.pd.d : '', to: c.last, grp: f.it.grp, who: f.it.who === '컬러 투입' ? f.it.cus : f.it.who, man: f.it.man, t: f.it.t })), lock: c.last <= C.lockEnd }];
  }
  /* 미리보기: 시험 모드에서 대안 고정 → 다시 계산 → 시험 버림(기록 없음) */
  function preview(c, o) {
    const k = `${c.id}|${o.kind}|${o.pins.length}`; if (cache[k]) return cache[k];
    quiet = true; let C2;
    try { PS.simStart(); PS.setMany(o.pins.map(([con, d]) => [`D|${con}`, `d:${d}`]), '미리보기'); C2 = PS.ctx(); } finally { PS.simDrop(); quiet = false; }
    const last = c.cons.map((x) => (C2.at[x] || []).slice(-1)[0]).filter(Boolean).map((x) => x.d).sort().pop();
    const movedNow = (o.moved || []).map((m) => ({ ...m, newD: ((C2.at[m.con] || []).slice(-1)[0] || {}).d }));
    return (cache[k] = { C2, last, slack: last ? dd(c.need, last) : null, movedNow });
  }

  /* ---------- 그리기 ---------- */
  function shell() {
    $('ct-main').innerHTML = `<div class="rm">
      <section class="rm-in" aria-label="바뀐 것"><header><h2>바뀐 것</h2><div class="rm-ctl">
        <select id="r-win" aria-label="기간">${[['run', '마지막 갱신'], ['1', '어제부터'], ['3', '3일'], ['7', '7일'], ['14', '14일']].map(([v, t]) => `<option value="${v}"${(st.win || '3') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <select id="r-past" aria-label="지난 납기 미생산"><option value="out"${st.past !== 'in' ? ' selected' : ''}>지난 납기 미생산 빼고</option><option value="in"${st.past === 'in' ? ' selected' : ''}>지난 납기 미생산 넣고</option></select></div></header>
        <div id="r-list" class="rm-list" tabindex="0"></div></section>
      <section class="rm-mid"><div id="r-route" class="rm-route"></div><div id="r-tl" class="rm-tl"></div></section>
      <section class="rm-op" aria-label="대안"><div id="r-op"></div><div id="r-note" class="rm-note" hidden></div></section></div>
      <div id="r-k" class="rm-k" hidden></div>`;
    $('r-win').onchange = (e) => { st.win = e.target.value; keep(); sel = 0; refresh(); };
    $('r-past').onchange = (e) => { st.past = e.target.value; keep(); sel = 0; for (const k in cache) delete cache[k]; refresh(); };
  }
  function top() {
    const risk = list.filter((c) => c.rank === 0 || c.rank === 1), t = risk.reduce((a, c) => a + c.t, 0);
    $('r-sum').innerHTML = `<b class="${risk.length ? 'bad' : 'ok'}">지연 위험·배정 없음 ${risk.length}묶음 ${n0(t)}t</b><span>바뀐 주문 ${n0(list.nCon)}건</span><span>미뤄도 되는 묶음 ${list.filter((c) => c.rank === 2).length}</span><span>이번 주 잠금 ${md(C.lockEnd)}까지</span>`;
    $('r-at').textContent = `주문 자료 ${String(B.ordersAsOf || '').replace('T', ' ').slice(5, 16)}`;
  }
  function chip(c) { const cl = c.rank <= 0 && c.k !== 'ask' ? 'bad' : c.rank === 1 ? 'bad' : c.rank === 2 ? 'amb' : c.state === '재고에서 출하' ? 'sky' : 'ok'; return `<i class="chip ${c.k === 'ask' ? 'amb' : cl}">${c.k === 'ask' ? '직접 묻기' : c.state}</i>`; }
  function head(c) {
    if (c.k === 'ask') return `<b>${esc(c.q)}</b> ${md(c.need)}까지 되나`;
    if (c.k === 'new') return `<b>${esc(c.grp)}</b> 새 주문 · ${esc(c.place)}`;
    return `<b>${esc(c.grp)}</b> · ${esc(c.place)} ${KN[c.k]} <em>${md(c.fr)}</em>에서 <em>${md(c.to)}</em>로 ${c.to > c.fr ? '늦춰짐' : '당겨짐'}`;
  }
  function drawList() {
    const box = $('r-list'), shown = list.slice(0, st.more ? 400 : 60);
    box.innerHTML = shown.map((c, i) => `<button type="button" class="ic ${i === sel ? 'on' : ''} ${c.rank <= 1 ? 'risk' : ''}" data-i="${i}">
      <span class="ih">${head(c)}</span><span class="im">${chip(c)}<span>${c.cons.length}건 ${n0(c.t)}t · ${FN(c.fam)}</span>${c.lateD > 0 ? `<b class="bad">${c.lateD}일 지연</b>` : c.lateD != null && c.k !== 'new' ? `<span>${-c.lateD}일 여유</span>` : ''}</span></button>`).join('')
      + (list.length > shown.length ? `<button type="button" class="more" id="r-more">나머지 ${list.length - shown.length}묶음</button>` : '')
      + (list.gone && list.gone[0] ? `<p class="gone">목록에서 빠진 주문 ${list.gone[0]}건 ${n0(list.gone[1])}t(생산 끝·취소·변경)</p>` : '')
      + (!list.length ? '<p class="gone">이 기간 바뀐 것 없음</p>' : '');
    box.querySelectorAll('.ic').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.i)));
    if ($('r-more')) $('r-more').onclick = () => { st.more = 1; drawList(); };
  }
  function pick(i) { sel = Math.max(0, Math.min(list.length - 1, i)); pv = -1; drawList(); drawSel(); const b = $('r-list').querySelector('.ic.on'); if (b) b.scrollIntoView({ block: 'nearest' }); }
  function drawSel() { const c = list[sel]; drawRoute(c); drawOpts(c); drawTL(c, null, null); }

  /* ---------- 항로 띠: 포항에서 목적지로 ---------- */
  const W = window.WORLD, PT = window.PORTS || {};
  const xy = (ll) => { let x = ll[1] - (W.C - 180); x = ((x % 360) + 360) % 360; return [x / 360 * W.W, (W.LAT0 - ll[0]) / (W.LAT0 - W.LAT1) * W.H]; };
  const portOf = (p) => { const u = String(p || '').toUpperCase().trim(); if (PT[u]) return PT[u]; const k = Object.keys(PT).find((x) => u.startsWith(x) || x.startsWith(u.split(' ')[0])); return k ? PT[k] : null; };
  function drawRoute(c) {
    const box = $('r-route'); if (!W) { box.hidden = true; return; }
    const home = xy(PT['포항']); let svg = '';
    const ports = {}; for (const x of list) { if (x.k === 'ask') continue; const p = portOf(x.place); if (!p) continue; const k = x.place; (ports[k] = ports[k] || { p, t: 0, risk: false }).t += x.t; if (x.rank <= 1) ports[k].risk = true; }
    for (const [k, v] of Object.entries(ports)) { const [x, y] = xy(v.p), r = Math.max(2.5, Math.min(9, Math.sqrt(v.t) / 4)); svg += `<circle class="pd ${v.risk ? 'risk' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"><title>${esc(k)} ${n0(v.t)}t</title></circle>`; }
    const p = c && portOf(c.place); let info = '';
    if (p) { const [x, y] = xy(p), mx = (home[0] + x) / 2, my = Math.min(home[1], y) - Math.abs(home[0] - x) * 0.18 - 14;
      svg += `<path class="arc" d="M${home[0].toFixed(1)} ${home[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}"/><circle class="pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/><circle class="dst" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`; }
    svg += `<circle class="home" cx="${home[0].toFixed(1)}" cy="${home[1].toFixed(1)}" r="4.5"/>`;
    if (c) {
      const dates = c.k === 'ask' ? `<div class="rt-d"><span>요청 완료일</span><b class="amb">${md(c.need)}</b></div>`
        : ['arr', 'dept', 'need', 'due', 'eta'].includes(c.k) ? `<div class="rt-d"><span>${KN[c.k]}</span><s>${md(c.fr)}</s><b class="${c.to < c.fr ? 'bad' : 'sky'}">${md(c.to)}</b></div>` : `<div class="rt-d"><span>새 주문</span><b class="sky">${c.cons.length}건</b></div>`;
      info = `<div class="rt-i"><div class="rt-p">${esc(c.place || c.q || '')}</div><div class="rt-g">${esc(c.grp || '')} · ${FN(c.fam)} · ${n0(c.t)}t · 담당 ${esc([...(c.man || [])].join(', ') || '미정')}</div>${dates}
        <div class="rt-d"><span>생산 필요일</span><b>${md(c.need)}</b></div><div class="rt-d"><span>지금 순서 끝</span><b class="${c.lateD > 0 ? 'bad' : 'ok'}">${c.last ? md(c.last) : '계획 없음'}</b></div></div>`;
    }
    box.innerHTML = `<svg viewBox="0 30 ${W.W} ${W.H - 60}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="포항에서 목적지 항구까지"><path class="land" d="${W.d}"/>${svg}</svg>${info}`;
  }

  /* ---------- 생산 순서: 1CGL·2CGL × 6주 ---------- */
  function days0(c, P) {   // 오늘 주 월요일부터 6주, 고른 묶음의 필요일·생산일이 더 뒤면 거기까지(최대 12주)
    const a = PS.monday(C.today); let end = PS.addD(a, 41);
    if (c) { const ds = [c.need, c.last, P && P.last].filter(Boolean); for (const d of ds) if (d > end) end = PS.addD(d, 3); }
    const out = []; for (let i = 0; i < 84; i++) { const d = PS.addD(a, i); if (d > end) break; out.push(d); } return out; }
  function drawTL(c, o, P) {
    const D = days0(c, P), box = $('r-tl'), mine = new Set(c ? c.cons : []), moved = new Set(((o && o.moved) || []).map((m) => m.con)), pulled = new Set(((o && o.pulled) || []).map((m) => m.con));
    const X = (d) => `${(D.indexOf(d) / D.length * 100).toFixed(3)}%`;
    if (c && (!pk || pkFor !== c.id)) { const f = c.cons.map((x) => (C.at[x] || [])[0]).filter(Boolean).sort((a, b) => (a.d < b.d ? -1 : 1))[0]; pk = f ? `${f.l}|${f.d}` : `1CGL|${C.today}`; pkFor = c.id; }
    const rowFor = (l) => D.map((d) => {
      const x = C.A.out[`${l}|${d}`], y = P ? P.C2.A.out[`${l}|${d}`] : null; if (!x) return '<div class="dy off"></div>';
      const tMine = x.got.filter((g) => mine.has(g.it.con)).reduce((a, g) => a + g.t, 0), tNew = y ? y.got.filter((g) => mine.has(g.it.con)).reduce((a, g) => a + g.t, 0) : 0;
      const tMv = y ? y.got.filter((g) => moved.has(g.it.con) || pulled.has(g.it.con)).reduce((a, g) => a + g.t, 0) : 0, tMvOld = P ? x.got.filter((g) => moved.has(g.it.con) || pulled.has(g.it.con)).reduce((a, g) => a + g.t, 0) : 0;
      const cls = [FC[x.g] || 'off', d <= C.lockEnd && d >= C.today ? 'lk' : '', d < C.today ? 'past' : '', tMine > 0.5 && !P ? 'hit' : '', P && tNew > 0.5 ? 'gh' : '', P && tMine > 0.5 && tNew < 0.5 ? 'was' : '', P && tMv > 0.5 && tMvOld < 0.5 ? 'mv' : ''].filter(Boolean).join(' ');
      const lab = P ? (tNew > 0.5 ? n0(tNew) : '') : tMine > 0.5 ? n0(tMine) : '';
      return `<div class="dy ${cls}${pk === `${l}|${d}` ? ' pk' : ''}" data-k="${l}|${d}" title="${l} ${md(d)} ${FN(x.g)} ${n0(x.tons)}t${x.freeH > 0.3 ? ` · 남는 ${x.freeH.toFixed(1)}시간` : ''}${x.ev ? ' · ' + esc(x.ev) : ''}">${lab ? `<b>${lab}</b>` : ''}</div>`; }).join('');
    const hd = D.map((d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return `<div class="dh ${w === 0 || w === 6 ? 'we' : ''} ${d === C.today ? 'td' : ''} ${w === 1 || d === C.today ? 'mon' : ''}">${+d.slice(8) === 1 || d === D[0] ? `<i>${+d.slice(5, 7)}월</i>` : ''}${+d.slice(8)}</div>`; }).join('');
    const marks = [];
    if (c && c.need && D.includes(c.need)) marks.push(`<div class="mk need" style="left:${X(c.need)}"><span>필요 ${md(c.need)}</span></div>`);
    if (c && c.k === 'arr') { for (const [d, cl] of [[c.fr.slice(0, 10), 'old'], [c.to.slice(0, 10), 'ship']]) if (D.includes(d)) marks.push(`<div class="mk ${cl}" style="left:${X(d)}"><span>${cl === 'old' ? '옛 입항' : '입항'} ${md(d)}</span></div>`); }
    const fams = ['AZ', 'MAC', 'AL', 'STS'].map((f) => `<span><i class="sw ${FC[f]}"></i>${FN(f)}</span>`).join('');
    let foot = '';
    if (P && o) { const okD = P.last ? dd(c.need, P.last) : null, mt = (o.moved || []).reduce((a, m) => a + m.t, 0);
      foot = `<div class="tl-pv"><b class="amb">미리보기 · ${esc(o.kind)}</b> 이 묶음 ${P.last ? `${md(P.last)}까지 생산` : '배정 안 됨'}${okD != null ? (okD >= 0 ? ` · 필요일 ${okD}일 전` : ` · <b class="bad">${-okD}일 늦음</b>`) : ''}${mt ? ` · 밀리는 주문 ${o.moved.length}건 ${n0(mt)}t` : ''}${o.pulled && o.pulled.length ? ` · 당겨오는 주문 ${o.pulled.length}건 ${n0(o.pull)}t` : ''} <span class="dim">채택 전에는 기록 안 됨</span></div>`; }
    box.innerHTML = `<header><h2>생산 순서 <small>${md(D[0])}부터 ${Math.round(D.length / 7)}주 · 빗금 = 이번 주(작업지시 확정)</small></h2><div class="lg">${fams}<span><i class="sw hitk"></i>고른 묶음</span>${P ? '<span><i class="sw ghk"></i>옮겨 갈 날</span><span><i class="sw mvk"></i>밀리는 주문</span>' : ''}</div></header>
      <div class="tl"><div class="tl-l"><div></div><div>1CGL</div><div>2CGL</div></div><div class="tl-g ${D.length > 45 ? 'dense' : ''}" style="--n:${D.length}"><div class="tl-h">${hd}</div><div class="tl-r">${rowFor('1CGL')}</div><div class="tl-r">${rowFor('2CGL')}</div>${marks.join('')}</div></div>${foot}<div class="day" id="r-day"></div>`;
    box.querySelectorAll('.dy[data-k]').forEach((b) => b.addEventListener('click', () => { pk = b.dataset.k; box.querySelectorAll('.dy.pk').forEach((x) => x.classList.remove('pk')); b.classList.add('pk'); drawDay(c, P); }));
    drawDay(c, P);
  }

  /* 그날 무엇을 왜: 그룹·목적지로 묶어(나열 금지) */
  function drawDay(c, P) {
    const box = $('r-day'); if (!box || !pk) return; const [l, d] = pk.split('|'), A = P ? P.C2.A : C.A, x = A.out[pk], mine = new Set(c ? c.cons : []);
    if (!x) { box.innerHTML = `<h3>${l} ${md(d)}<span>계획 없음</span></h3>`; return; }
    const g = {}; for (const y of x.got) { const it = y.it, who = it.k === 'p' ? '판매계획(주문 없음)' : it.who === '컬러 투입' ? it.cus : it.who || it.cus || '';
      const k = `${it.grp}|${who}`; const z = (g[k] = g[k] || { grp: it.grp, who, n: 0, t: 0, need: '', spec: new Set(), me: false, why: it.k === 'p' ? '' : it.why });
      z.n += it.k === 'o' ? 1 : 0; z.t += y.t; if (it.need && (!z.need || it.need < z.need)) z.need = it.need; if (it.thk) z.spec.add(`${it.thk}×${it.wdt}`); if (mine.has(it.con)) z.me = true; }
    const rows = Object.values(g).sort((a, b) => b.me - a.me || (a.grp < b.grp ? -1 : a.grp > b.grp ? 1 : b.t - a.t));
    const sp = (z) => { const a = [...z.spec]; return a.length > 2 ? `${a.slice(0, 2).join(' · ')} 외 ${a.length - 2}` : a.join(' · '); };
    box.innerHTML = `<h3>${l} ${md(d)} ${FN(x.g)} ${n0(x.tons)}t<span>${P ? '미리보기 기준 · ' : ''}그룹·목적지별 · 필요일이 이 날보다 이르면 빨강${x.freeH > 0.3 ? ` · 남는 ${x.freeH.toFixed(1)}시간` : ''}</span></h3>
      <table><thead><tr><th>그룹</th><th>목적지·고객</th><th>건</th><th>사이즈</th><th class="n">톤</th><th>생산 필요일</th></tr></thead><tbody>
      ${rows.map((z) => `<tr class="${z.me ? 'me' : ''}"><td><b>${esc(z.grp)}</b></td><td>${esc(z.who)}</td><td>${z.n || ''}</td><td>${esc(sp(z))}</td><td class="n">${n0(z.t)}</td><td class="${z.need && z.need < d ? 'late' : ''}">${z.need ? md(z.need) : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  /* ---------- 대안 ---------- */
  function drawOpts(c) {
    const box = $('r-op'); if (!c) { box.innerHTML = '<header><h2>대안</h2></header><p class="dim">왼쪽에서 바뀐 것을 고르면 대안이 나옵니다</p>'; return; }
    const os = (c._os = optsOf(c));
    const why = c.state === '재고에서 출하' ? `같은 사양 재고 ${n0(c.fromStock)}t 로 나감. 새로 만들 것 없음` : c.state === '맞음' ? `지금 순서로 ${md(c.last)}까지 생산, 필요일 ${md(c.need)}보다 ${-c.lateD}일 먼저. 할 일 없음`
      : c.state === '미뤄도 됨' ? `필요일이 ${md(c.need)}로 늦춰져 지금 ${md(c.last)} 생산은 ${-c.lateD}일 이름. 미루고 빈 자리에 급한 주문을 당길 수 있음`
      : c.k === 'ask' ? (c.lateD != null && c.lateD <= 0 ? `지금 순서로 ${md(c.last)}까지 생산. 요청일 맞음` : `지금 순서 ${c.last ? md(c.last) + '까지' : '계획 없음'}. 요청일 ${md(c.need)}`) : `지금 순서 ${c.last ? `${md(c.last)}까지 생산, 필요일보다 ${c.lateD}일 늦음` : '계획에 없음'}`;
    box.innerHTML = `<header><h2>대안</h2><span class="dim">${os.length ? '1·2·3 키로 미리보기' : ''}</span></header><p class="why">${why}</p>
      ${os.map((o, j) => { const mt = (o.moved || []).reduce((a, m) => a + m.t, 0), big = o.needSw ? '사람 판단' : o.kind === '미루기' ? `${n0(o.pull)}t` : mt ? `${n0(mt)}t` : '0t';
        const sub = o.needSw ? '전환일·납기·배 일정 협의' : o.kind === '미루기' ? '빈 자리에 당겨오는 주문' : mt ? `밀리는 주문 ${o.moved.length}건` : '밀리는 주문 없음';
        return `<div class="oc ${j ? '' : 'rec'} ${pv === j ? 'on' : ''}" data-j="${j}"><div class="oh"><i class="chip ${j ? 'dim' : 'amb'}">${j ? '다른 안' : '추천'}</i><b>${esc(o.kind)}</b>${o.lock ? '<i class="chip bad">이번 주 구간</i>' : ''}</div>
          <div class="on2"><b class="${o.needSw ? 'amb' : mt || o.kind === '미루기' ? '' : 'ok'}">${big}</b><span>${sub}</span></div><p>${esc(o.txt)}</p>
          ${o.pins.length ? `<div class="ob"><button type="button" class="b2" data-pv="${j}">미리보기</button><button type="button" class="b1" data-acc="${j}">채택</button></div>` : ''}</div>`; }).join('')}
      <details class="cons"><summary>주문 ${c.cons.length}건 보기</summary>${c.cons.map((x) => { const it = C.itemOf[x], pd = (C.at[x] || []).slice(-1)[0]; return it ? `<div><b>${esc(x)}</b><span>${it.thk ? it.thk + '×' + it.wdt : ''} · ${n0(it.t)}t · 필요 ${md(it.need)} · 지금 ${pd ? `${pd.l} ${md(pd.d)}` : '없음'}</span></div>` : ''; }).join('')}</details>`;
    box.querySelectorAll('[data-pv]').forEach((b) => b.addEventListener('click', () => show(+b.dataset.pv)));
    box.querySelectorAll('.oc').forEach((b) => b.addEventListener('mouseenter', () => { if (c._os[+b.dataset.j].pins.length) show(+b.dataset.j); }));
    box.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => accept(+b.dataset.acc)));
  }
  function show(j) {
    const c = list[sel], o = c && c._os && c._os[j]; if (!o || !o.pins.length) return;
    pv = j; document.querySelectorAll('.oc').forEach((x) => x.classList.toggle('on', +x.dataset.j === j));
    $('r-tl').classList.add('busy');
    setTimeout(() => { const P = preview(c, o); drawTL(c, o, P); $('r-tl').classList.remove('busy'); }, 10);
  }
  function accept(j) {
    const c = list[sel], o = c && c._os && c._os[j]; if (!o || !o.pins.length) return;
    PS.setMany(o.pins.map(([con, d]) => [`D|${con}`, `d:${d}`]), `판생 관제실: ${c.k === 'ask' ? '직접 묻기 ' + c.q : c.k === 'new' ? '새 주문' : KN[c.k] + ' 바뀜'} ${c.place || ''} ${o.kind}`);
    const ln = [`[판생] ${c.grp || ''} ${c.place || c.q || ''} ${c.k === 'ask' ? `${md(c.need)}까지 생산 요청` : c.k === 'new' ? '새 주문' : `${KN[c.k]} ${md(c.fr)}에서 ${md(c.to)}로 바뀜`} ${c.cons.length}건 ${n0(c.t)}t`, `조치(${o.kind}): ${o.txt}`,
      ...(o.moved || []).map((m) => `· ${m.grp} ${m.who} ${m.con} ${n0(m.t)}t: ${m.from ? md(m.from) : '미정'}에서 ${md(m.to)}로 생산 변경${m.slack != null && m.slack < 999 ? `(납기 여유 ${m.slack}일)` : ''}, 담당 ${m.man || '미정'}`),
      ...(o.pulled || []).map((m) => `· ${m.grp} ${m.who} ${m.con} ${n0(m.t)}t: ${m.from ? md(m.from) : '미정'}에서 ${md(m.to)}로 당겨 생산, 담당 ${m.man || '미정'}`)];
    st.note = (st.note ? st.note + '\n\n' : '') + ln.join('\n'); keep();
    if (c.k === 'ask') asks = asks.filter((a) => a !== c);
    for (const k in cache) delete cache[k];
    refresh(); note(true);
  }
  function note(open) {
    const box = $('r-note'); if (!st.note) { box.hidden = true; return; } box.hidden = false;
    box.innerHTML = `<header><h2>알림 문안</h2><span class="dim">채택한 내용 · 그룹·담당자에게 보내기</span></header><textarea id="r-nt" rows="7" aria-label="알림 문안">${esc(st.note)}</textarea>
      <div class="ob"><button type="button" class="b1" id="r-cp">복사</button><button type="button" class="b2" id="r-undo">마지막 채택 되돌리기</button><button type="button" class="b2" id="r-nx">문안 지우기</button></div>`;
    $('r-nt').oninput = (e) => { st.note = e.target.value; keep(); };
    $('r-cp').onclick = () => { const t = $('r-nt'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } $('r-cp').textContent = '복사함'; };
    $('r-undo').onclick = () => { if (PS.undo()) { for (const k in cache) delete cache[k]; refresh(); } };
    $('r-nx').onclick = () => { st.note = ''; keep(); note(); };
    if (open) box.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 찾기(Ctrl+K): 계약번호·목적지·배 이름 + 날짜 → 직접 묻기 ---------- */
  function palette() {
    const k = $('r-k'); k.hidden = false;
    k.innerHTML = `<div class="kb" role="dialog" aria-label="찾기"><div class="kr"><input id="k-q" placeholder="계약번호·목적지·고객·배 이름" autocomplete="off"><input id="k-d" type="date" aria-label="원하는 생산 완료일" value="${esc(st.kd || '')}"><button type="button" class="b1" id="k-go">되나?</button></div><div id="k-l" class="kl"></div><p class="dim">원하는 날짜까지 만들 수 있는지와 방법을 계산 · Esc 닫기</p></div>`;
    const q = $('k-q'); q.focus();
    const its = Object.values(C.itemOf);
    const hits = () => { const u = q.value.trim().toUpperCase(); if (u.length < 2) return []; const g = {};
      for (const it of its) for (const f of [it.con, it.who, it.dst, it.cus]) { const s = String(f || ''); if (!s.toUpperCase().includes(u)) continue; const key = f === it.con ? it.con : s; (g[key] = g[key] || { key, t: 0, n: 0, fam: new Set() }); g[key].t += it.t; g[key].n++; g[key].fam.add(FN(it.fam)); break; }
      return Object.values(g).sort((a, b) => b.t - a.t).slice(0, 8); };
    let pickKey = '';
    q.oninput = () => { const H = hits(); $('k-l').innerHTML = H.map((h, i) => `<button type="button" class="kh ${i ? '' : 'on'}" data-k="${esc(h.key)}"><b>${esc(h.key)}</b><span>${h.n}건 ${n0(h.t)}t · ${[...h.fam].join('·')}</span></button>`).join('') || (q.value.length > 1 ? '<p class="dim">맞는 미생산 주문 없음</p>' : '');
      pickKey = H[0] ? H[0].key : ''; $('k-l').querySelectorAll('.kh').forEach((b) => b.addEventListener('click', () => { pickKey = b.dataset.k; $('k-l').querySelectorAll('.kh').forEach((x) => x.classList.toggle('on', x === b)); $('k-d').focus(); })); };
    const go = () => { const d = $('k-d').value; if (!pickKey || !d) { $('k-d').focus(); return; } st.kd = d;
      const u = pickKey.toUpperCase(), hit = its.filter((it) => [it.con, it.who, it.dst, it.cus].some((x) => String(x || '').toUpperCase() === u || (u.length > 8 && String(x || '').toUpperCase().includes(u))));
      const byF = {}; for (const it of hit) (byF[it.fam] = byF[it.fam] || []).push(it.con);
      const nw = Object.entries(byF).map(([f, cons]) => ({ k: 'ask', q: pickKey, need: d, fam: f, cons, grp: GRP(C.itemOf[cons[0]].grp), place: C.itemOf[cons[0]].who === '컬러 투입' ? '' : C.itemOf[cons[0]].who, man: new Set(cons.map((x) => C.itemOf[x].man).filter(Boolean)) }));
      asks = nw.concat(asks).slice(0, 6); k.hidden = true; refresh(); pick(0); };
    $('k-go').onclick = go; q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('k-d').focus(); } }; $('k-d').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    k.onclick = (e) => { if (e.target === k) k.hidden = true; };
  }

  function refresh() { const id = list[sel] && list[sel].id; build(); const i = list.findIndex((c) => c.id === id); sel = i >= 0 ? i : Math.min(sel, Math.max(0, list.length - 1)); pv = -1; top(); drawList(); drawSel(); note(); }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (C) palette(); return; }
    if (e.key === 'Escape' && $('r-k')) { $('r-k').hidden = true; return; }
    if (!C || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); pick(sel + 1); } else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); pick(sel - 1); }
    else if (/^[1-3]$/.test(e.key)) show(+e.key - 1); else if (e.key === 'Enter' && pv >= 0) accept(pv);
  });
  const theme = () => { document.body.dataset.theme = st.theme === 'light' ? 'light' : 'dark'; const b = $('r-th'); if (b) b.textContent = st.theme === 'light' ? '어둡게' : '밝게'; };
  theme();
  $('r-th').onclick = () => { st.theme = st.theme === 'light' ? 'dark' : 'light'; keep(); theme(); };
  $('r-find').onclick = () => { if (C) palette(); };
  PS.on(() => { if (!quiet && B) refresh(); });
  PS.boot((b) => { if (!b) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; } B = b; shell(); refresh(); });
})();
