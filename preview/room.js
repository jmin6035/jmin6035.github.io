/* 예시(통합안) 수주 조정 — 11/18 사장님 회의 원칙(gadong-plan docs/36)을 화면으로.
   #board 주별 할 일(11/19 사용자 '주 단위로 · 들어가자마자 뭘 할지'): 할 일 목록(차례대로) → 주별 판(주 × 1·3·4CCL 가동 막대·2CCL·자가재) → 줄을 누르면 라인별·결정 칸
          (옛 순 단위 룸판: 라인 × 순(10일) — 컬러 = 내수(순 고정) · 수출·가전(빈 룸 채움) · 빈 룸 / 2CCL = 최후(가동 시 사장님 결정) / 도금 = 자가재(고정 몫) · 판매재
          칸을 누르면 그 칸 배정·당길 수 있는 수출 오더·결정 기록(공유 저장소, 수주가 결정·책임)
   #test  시험 계산: 내수(건재 등)를 순 단위로 고르게 고정하고 ±물량을 바꿔 보면 → 수출·가전 그대로, 빈 룸 = 당길 오더, 넘치면 2CCL(사장님 결정), 도금 자가재 영향
   #grp   판매그룹별: 그룹 × 순 배정 · 컬러수출 수주 확보 · 담당자별 당길 수 있는 오더
   자료 = published/preview_ops.enc.json(gadong-plan tools/preview_build.py) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const n1 = (v) => (+v || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + n0(Math.abs(v));
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const SN = ['상순', '중순', '하순'];
  const isW = (s) => s && s[0] === 'W';
  const addD = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  const wkOf = (d) => { const t = new Date(Date.parse(d + 'T00:00:00Z')), w = (t.getUTCDay() + 6) % 7; return 'W' + addD(d, -w); };
  const wkLab = (s) => { const th = addD(s.slice(1), 3); return `${+th.slice(5, 7)}월 ${Math.ceil(+th.slice(8) / 7)}주`; };   // 주 이름 = 목요일이 속한 달의 몇째 주
  const wkRng = (s) => `${md(s.slice(1))}~${md(addD(s.slice(1), 6))}`;
  const sunLab = (s) => (isW(s) ? `${wkLab(s)}(${wkRng(s)})` : `${+s.slice(5, 7)}월 ${SN[+s.slice(8) - 1]}`);
  const sun = (d) => { const n = +d.slice(8, 10); return d.slice(0, 7) + (n <= 10 ? '-1' : n <= 20 ? '-2' : '-3'); };
  const sunEnd = (s) => { if (isW(s)) return addD(s.slice(1), 6); const y = +s.slice(0, 4), m = +s.slice(5, 7), k = +s.slice(8); return k === 1 ? `${s.slice(0, 7)}-10` : k === 2 ? `${s.slice(0, 7)}-20` : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const sunStart = (s) => isW(s) ? s.slice(1) : `${s.slice(0, 7)}-${['01', '11', '21'][+s.slice(8) - 1]}`;
  const nextMon = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  const CCL = ['1CCL', '3CCL', '4CCL', '2CCL'], CGL = ['1CGL', '2CGL'], MAIN = ['1CCL', '3CCL', '4CCL'];
  const ST = (st) => (/매치 완료|소재 있음/.test(st) ? ['ok', '소재 확보'] : /입고 대기/.test(st) ? ['wait', '소재 입고 대기'] : ['no', '소재 없음']);
  let X = null, EV = [], SEL = null;

  const suns = () => [...new Set([...Object.values(X.color), ...Object.values(X.cgl)].flatMap((o) => Object.keys(o)))].sort();
  const cc = (l, s) => ((isW(s) ? X.colorW : X.color)[l] || {})[s] || null;
  const cg = (l, s) => ((isW(s) ? X.cglW : X.cgl)[l] || {})[s];
  const weeks = () => [...new Set([...Object.values(X.colorW), ...Object.values(X.cglW)].flatMap((o) => Object.keys(o)))].sort();
  const sibs = (s) => { if (!isW(s)) return [1, 2, 3].map((k) => `${s.slice(0, 7)}-${k}`); const W = weeks(), i = W.indexOf(s); return W.slice(Math.max(0, i - 2), i + 3); };   // 옮길 수 있는 이웃 칸(순 = 같은 달 세 순, 주 = 앞뒤 2주)
  const mSibs = (s) => (isW(s) ? weeks().filter((w) => addD(w.slice(1), 3).slice(0, 7) === addD(s.slice(1), 3).slice(0, 7)) : [1, 2, 3].map((k) => `${s.slice(0, 7)}-${k}`));
  const room = (c) => (c ? Math.max(0, c.free != null ? c.free : c.cap - c.dom - c.exp) : 0);   // 빈 룸 = 남는 가동 시간 × 라인 평균 속도
  const used = (c) => (c ? c.dom + c.exp : 0);
  function selfAdj() {   // 자가재 재고 = 계획 + 결정한 판매재→자가재 전환(그 순 첫날부터 누적, 보류 제외)
    const add = {}; for (const e of EV) if (e.t === 'room' && e.kind === 'self' && stOf(e) !== '보류' && e.conv) { const k = e.al || (e.line === '1CGL' ? 'AZ' : 'MAC'); (add[k] = add[k] || []).push([sunStart(e.sun), e.conv]); }
    const out = {}; for (const [al, ser] of Object.entries(X.self || {})) out[al] = ser.map((r) => [r[0], r[1] + (add[al] || []).filter((x) => x[0] <= r[0]).reduce((a, x) => a + x[1], 0)]);
    return out;
  }
  function selfMin(s, adj) {   // 그 순 안 강종별 자가재 재고 최저(음수만)
    const a = sunStart(s), z = sunEnd(s), out = [];
    for (const [al, ser] of Object.entries(adj ? selfAdj() : X.self || {})) {
      let mn = null; for (const r of ser) if (r[0] >= a && r[0] <= z && (mn == null || r[1] < mn[1])) mn = r;
      if (mn && mn[1] < -0.5) out.push([al, mn[1], mn[0]]);
    }
    return out;
  }
  const PR = () => X.pull.rows.filter((r) => r.exp);   // 당길 오더 = 수출만(컬러수출그룹의 가전내수 주문은 내수 = 순 고정 몫)
  const pullFor = (line, s) => PR().filter((r) => (!line || r.line === line) && r.due > sunEnd(s));
  const decs = (key) => EV.filter((e) => e.t === 'room' && (!key || e.key === key));

  /* ---------- 결정(공유 저장소): {t:'room', key, kind, st, …} + 상태 바꿈 {t:'roomSt', ref, st} — 칸마다 마지막 결정이 판에 반영 ---------- */
  const DID = (e) => CT.issueId(`${e.at}|${e.by}|${e.key}`);
  const stOf = (e) => { let st = e.st || '제안'; for (const x of EV) if (x.t === 'roomSt' && x.ref === DID(e)) st = x.st; return st; };
  const DONE = (st) => st === '확정' || st === '사장님 승인';
  const decOf = (key) => { const L = decs(key).filter((e) => e.kind); return L.length ? Object.assign({}, L[L.length - 1], { st: stOf(L[L.length - 1]) }) : null; };
  const pulledSet = () => { const m = new Map(); for (const e of EV) if (e.t === 'room' && e.pulls && stOf(e) !== '보류') for (const [con] of e.pulls) m.set(con, e.key); return m; };
  const capOf = (c) => (c ? c.dom + c.exp + room(c) : 0);   // 능력 = 지금 배정 + 남는 시간
  function sugg(l, s) {   // 순 고정 몫(주 = 자료의 fair: 그 달 내수를 가용 분 비율로)
    if (isW(s)) return (cc(l, s) || {}).fair || 0;   // 순 = 그 라인 그 달 내수 합을 순별 능력 비율로
    const S = [1, 2, 3].map((k) => `${s.slice(0, 7)}-${k}`), C = S.map((x) => capOf(cc(l, x))), T = S.reduce((a, x) => a + ((cc(l, x) || {}).dom || 0), 0), CT_ = C.reduce((a, v) => a + v, 0);
    return CT_ ? T * C[S.indexOf(s)] / CT_ : 0;
  }
  const after = (l, s) => {   // 결정 반영 뒤 칸 값
    const c = cc(l, s); if (!c) return null; const d = decOf(`${l}|${s}`);
    if (!d || d.st === '보류' || d.kind !== 'adj') return { dom: c.dom, exp: c.exp + mvIn(l, s), cap: capOf(c), d };
    const pt = (d.pulls || []).reduce((a, x) => a + x[1], 0);
    return { dom: d.dom != null ? d.dom : c.dom, exp: c.exp + pt - (d.mv ? d.mv[1] : 0) + mvIn(l, s), cap: capOf(c), d };
  };
  function mvIn(l, s) {   // 다른 순에서 이 순으로 옮겨 온 수출(결정, 보류 제외)
    let t = 0; for (const x of sibs(s)) { const k = `${l}|${x}`, d = decOf(k); if (d && d.kind === 'adj' && d.st !== '보류' && d.mv && d.mv[0] === s) t += d.mv[1]; } return t;
  }
  const selfLine = (al) => (al === 'AZ' ? '1CGL' : '2CGL');
  function selfFrom(s, l) {   // 그 주부터 그 라인 강종 자가재 최저(음수만) — 전환은 부족이 시작되기 전에
    const out = []; for (const [al, ser] of Object.entries(X.self || {})) { if (selfLine(al) !== l) continue; let mn = null; for (const r of ser) if (r[0] >= sunStart(s) && (mn == null || r[1] < mn[1])) mn = r; if (mn && mn[1] < -0.5) out.push([al, mn[1], mn[0]]); }
    return out;
  }
  const ourPlan = (s) => sunEnd(s) >= '2027-01-01';   // 1월~ = 우리 계획(12월까지 = 판생 배포 그대로)
  const appl = (d) => d && (X.applied || []).includes(DID(d));
  const chip = (d) => (d ? `${appl(d) ? '<span class="chip ok">계획 반영</span> ' : ''}<span class="chip ${DONE(d.st) ? 'ok' : d.st === '보류' ? 'na' : d.st === '사장님 결정 요청' ? 'bad' : 'warn'}">${esc(d.st)}</span>` : '<span class="chip">미결정</span>');

  /* ---------- 주별 가동표(11/19 사용자 '처음부터 다시' → 고른 모양 '라인×주 가동표': 칸마다 계획 톤과 그중 주문 확보 톤, 주문이 모자란 칸만 색)
     자료 ordW(gadong-plan tools/preview_build.py ord_week): 주문을 납기 7일 전 주에 놓고 납기 순으로 그 주 계획(계획재 제외)까지 채움 ---------- */
  let OPEN = null;
  const OW = () => X.ordW || { lines: {}, rows: [] };
  const pulls = () => { const m = new Map(); for (const e of EV) if (e.t === 'room' && e.pulls && stOf(e) !== '보류') for (const [con, t] of e.pulls) m.set(con, { to: e.key.split('|')[1], t }); return m; };
  function ordCell(l, s) {   // 결정(당김) 반영: 당겨 온 주는 +, 원래 놓였던 주는 −
    const o = (OW().lines[l] || {})[s]; if (!o) return null; const P = pulls(); let add = 0;
    for (const r of OW().rows) { if (r.line !== l) continue; const p = P.get(r.con); if (!p) continue; if (p.to === s && r.w !== s) add += p.t; else if (r.w === s && p.to !== s) add -= p.t; }
    return { cap: o.cap, ord: Math.max(0, o.ord + add), plt: o.plt };
  }
  const shortOf = (c) => (c ? c.cap - c.ord : 0);
  const isShort = (c) => c && shortOf(c) >= Math.max(100, c.cap * 0.1);
  function orderDetail(l, s) {
    const c = ordCell(l, s) || { cap: 0, ord: 0 }, P = pulls(), key = `${l}|${s}`, d0 = decOf(key);
    const R = OW().rows.filter((r) => r.line === l);
    const inW = R.filter((r) => (P.get(r.con) ? P.get(r.con).to === s : r.w === s));
    const can = R.filter((r) => r.grp === '컬러수출그룹' && !inW.includes(r) && (!r.w || r.w > s)).sort((a, b) => (a.due < b.due ? -1 : 1));
    const pre = new Set(d0 && d0.pulls ? d0.pulls.map((x) => x[0]) : []);
    const tr = (r, ck) => `<tr>${ck ? `<td><input type="checkbox" class="w-p" data-con="${esc(r.con)}" data-t="${r.t}"${pre.has(r.con) ? ' checked' : ''}></td>` : ''}<td>${esc(r.con)}</td><td>${esc(r.cus || '-')}</td><td>${esc(r.pdt)}</td><td>${esc(r.size)}</td><td>${n1(r.t)}</td><td>${md(r.due)}</td><td>${esc(r.man || '-')}</td><td>${esc(ST(r.st)[1])}</td></tr>`;
    const hd = (ck) => `<thead><tr>${ck ? '<th></th>' : ''}<th>계약</th><th>고객사</th><th>품명</th><th>두께×폭</th><th>t</th><th>납기</th><th>담당</th><th>소재</th></tr></thead>`;
    const sh = shortOf(c);
    return `<form class="od" id="w-f" novalidate><h3>${l} ${wkLab(s)} <b class="dt">${wkRng(s)}</b> <span>계획 ${n0(c.cap)}t · 주문 ${n0(c.ord)}t${sh >= 50 ? ` · <b class="warn">부족 ${n0(sh)}t</b>` : ''}</span></h3>
      <div class="od-g"><div><h4>이 주 주문 ${inW.length}건</h4><div class="od-t"><table class="op-t">${hd(false)}<tbody>${inW.map((r) => tr(r, false)).join('') || '<tr><td colspan="8">없음</td></tr>'}</tbody></table></div></div>
      <div><h4>당길 수 있는 수출 주문 ${can.length}건</h4><div class="od-t"><table class="op-t">${hd(true)}<tbody>${can.map((r) => tr(r, true)).join('') || '<tr><td colspan="9">없음, 주문 더 받기 필요</td></tr>'}</tbody></table></div></div></div>
      <div class="row od-f"><span id="w-sel"></span><label>상태 <select id="w-st">${['제안', '확정'].map((x) => `<option${d0 && d0.st === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label><input id="dec-by" placeholder="이름" value="${esc(CT.me())}"><input id="w-tx" placeholder="메모" value="${esc(d0 && d0.text || '')}"><button class="btn" type="submit">당김 저장</button><span class="note" id="dec-m"></span></div></form>`;
  }
  function board() {
    const W = weeks().filter((w) => w >= wkOf(X.today)), now = wkOf(X.today);
    let mPrev = '';
    const mb = W.map((s) => { const m = addD(s.slice(1), 3).slice(0, 7), b = mPrev && m !== mPrev; mPrev = m; return b ? ' mb' : ''; });
    const on = (k) => (OPEN === k ? ' on' : '');
    const head = `<tr><th class="ln">라인</th><th class="kd">구분</th>${W.map((s, i) => `<th class="${mb[i]}">${s === now ? '이번 주' : wkLab(s)}<b class="dt">${wkRng(s).replace('~', '~<wbr>')}</b></th>`).join('')}</tr>`;
    const lineRows = (l) => {
      const plan = W.map((s, i) => { const c = cc(l, s); if (!c || c.cap < 1) return `<td class="${mb[i]} off">휴지</td>`; const o = ordCell(l, s) || { cap: 0 }; const own = l === '2CCL' && ourPlan(s) ? (sunStart(s) >= '2027-01-01' ? used(c) : c.own || 0) : 0; return `<td class="${mb[i]}${own >= 0.5 ? ' bad' : ''}"><button type="button" class="cl${on(`${l}|${s}`)}" data-k="${l}|${s}">${n0(o.cap)}${own >= 0.5 ? '<em>결정 필요</em>' : ''}</button></td>`; }).join('');
      const ord = W.map((s, i) => { const c = cc(l, s); if (!c || c.cap < 1) return `<td class="${mb[i]} off"></td>`; const o = ordCell(l, s); return `<td class="${mb[i]}${isShort(o) ? ' warn' : ''}"><button type="button" class="cl${on(`${l}|${s}`)}" data-k="${l}|${s}"${isShort(o) ? ` title="부족 ${n0(shortOf(o))}t"` : ''}>${n0(o ? o.ord : 0)}</button></td>`; }).join('');
      return `<tr class="p"><th class="ln" rowspan="2">${l}</th><th class="kd">계획</th>${plan}</tr><tr class="o"><th class="kd">주문</th>${ord}</tr>`;
    };
    const pltRow = `<tr class="s"><th class="ln">계획재</th><th class="kd">1~4CCL</th>${W.map((s, i) => { const t = [...MAIN, '2CCL'].reduce((a, l) => a + ((ordCell(l, s) || {}).plt || 0), 0); return `<td class="${mb[i]}">${t >= 0.5 ? n0(t) : ''}</td>`; }).join('')}</tr>`;
    const selfRow = `<tr class="s"><th class="ln">자가재</th><th class="kd">부족</th>${W.map((s, i) => { const neg = selfMin(s, true); if (!neg.length) return `<td class="${mb[i]}"></td>`; const al = neg.slice().sort((a, b) => a[1] - b[1])[0][0]; return `<td class="${mb[i]} bad"><button type="button" class="cl${on(`${selfLine(al)}|${s}`)}" data-k="${selfLine(al)}|${s}">${neg.map((x) => `${x[0]} <b>${sg(x[1])}</b>`).join('<br>')}</button></td>`; }).join('')}</tr>`;
    const tot = (f) => W.map((s, i) => `<td class="${mb[i]}">${n0([...MAIN, '2CCL'].reduce((a, l) => a + (((ordCell(l, s) || {})[f]) || 0), 0))}</td>`).join('');
    const sumRows = `<tr class="t p"><th class="ln" rowspan="2">합계</th><th class="kd">계획</th>${tot('cap')}</tr><tr class="t o"><th class="kd">주문</th>${tot('ord')}</tr>`;
    const mats = ((X.matLate || {}).items || []).filter((m) => (m.t || 0) >= 300);
    const matH = mats.length ? `<p class="od-mat">소재 발주 마감 지남 ${mats.map((m) => `<button type="button" class="lnk" data-k="mat|${esc(m.key)}">${esc(m.name)} ${n0(m.t)}t</button>`).join(' ')}</p>` : '';
    const log = decs().filter((e) => e.kind);
    return `<section class="card" id="wk-card"><h2>주별 가동표 <small>${md(X.today)}부터 · 칸을 누르면 그 주 주문</small></h2>
      <p class="wk-lg"><span><i class="lg w"></i>주문이 계획보다 모자람</span><span><i class="lg b"></i>사장님 결정·자가재 부족</span></p>
      <div class="gt-w"><table class="gt"><thead>${head}</thead><tbody>${MAIN.map(lineRows).join('')}${lineRows('2CCL')}${sumRows}${pltRow}${selfRow}</tbody></table></div>
      ${matH}<div id="rb-pd"></div></section>
      <section class="card"><h2>결정 기록 <small>${log.length}건</small></h2>${logList(log)}</section>`;
  }
  const keyLab = (k) => (k ? k.replace('|', ' ').replace(/W(\d{4}-\d{2}-\d{2})$/, (m) => sunLab(m)).replace(/(\d{4}-\d{2}-\d)$/, (m) => sunLab(m)).replace(/^grp (\d{4})-(\d{2})$/, (m, y, mo) => `컬러수출 ${+mo}월 수주`).replace(/^mat /, '소재 ') : '');
  const what = (e) => (e.kind === 'adj' ? `내수 ${e.dom != null ? n0(e.dom) + 't' : '그대로'}${(e.pulls || []).length ? ` · 수출 ${e.pulls.length}건 ${n0(e.pulls.reduce((a, x) => a + x[1], 0))}t 당김` : ''}${e.mv ? ` · 수출 ${n0(e.mv[1])}t → ${sunLab(e.mv[0])}` : ''}` : e.kind === '2ccl' ? (e.choice === 'stop' ? `2CCL 세움 · ${n0(e.move || 0)}t 다른 CCL 로` : '2CCL 가동') : e.kind === 'self' ? `판매재 → 자가재 ${n0(e.conv || 0)}t` : e.kind === 'order' ? `수주 목표 ${n0(e.goal || 0)}t · ${esc(e.who || '')}` : e.kind === 'mat' ? `${esc(e.act || '')} ${n0(e.qty || 0)}t · ${esc(e.who || '')}` : '');
  const logList = (L) => (L.length ? `<ul class="dlog">${L.slice().reverse().map((e) => { const st = stOf(e), id = DID(e); return `<li><div><small>${esc(String(e.at || '').slice(5, 16).replace('T', ' '))}</small><small>${esc(e.by || '')}</small><b>${esc(keyLab(e.key))}</b> ${chip({ st })} ${what(e)}${e.text ? ` (${esc(e.text)})` : ''}</div><div class="sts">${['확정', '사장님 승인', '보류'].filter((x) => x !== st).map((x) => `<button type="button" class="btn sub sm" data-ref="${id}" data-st="${x}">${x}</button>`).join('')}</div></li>`; }).join('')}</ul>` : '<p class="q">아직 없음</p>');

  async function save(ev, msgEl) {
    try { localStorage.setItem('cgl-me', ($('dec-by') || {}).value || CT.me()); } catch (x) { /* 무시 */ }
    if (msgEl) msgEl.textContent = '저장 중…';
    try { await CT.store.push(ev); EV = await CT.store.events(); draw(); } catch (x) { if (msgEl) msgEl.textContent = '⚠ ' + x.message; else alert(x.message); }
  }

  /* 칸 작업대: 숫자를 바꿔 보면 바로 결과 → 상태(제안·확정·사장님 결정 요청)와 함께 저장 */
  function detail(key) {
    const [l, s] = key.split('|'), el = $('rb-pd'); if (!el) return;
    const d0 = decOf(key), PS = pulledSet();
    const stSel = (def) => `<label>상태 <select id="w-st">${['제안', '확정', '사장님 결정 요청'].map((x) => `<option${x === def ? ' selected' : ''}>${x}</option>`).join('')}</select></label>`;
    const foot = (def) => `<div class="row">${stSel(def)}<input id="dec-by" placeholder="이름" value="${esc(CT.me())}"><input id="w-tx" placeholder="메모(근거·담당 확인 등)" style="flex:1;min-width:200px"><button class="btn" type="submit">저장</button><span class="note" id="dec-m"></span></div>`;
    let html = '';
    if (MAIN.includes(l)) {
      const c = cc(l, s) || { g: {}, cap: 0, dom: 0, exp: 0, days: 0 }, sg0 = sugg(l, s), cap = capOf(c);
      const P = pullFor(l, s), pre = new Set(d0 && d0.kind === 'adj' ? (d0.pulls || []).map((x) => x[0]) : []);
      html = `<div class="wb"><div><h3>${l} ${sunLab(s)} <small>${c.days}일 · 능력 ${n0(cap)}t</small></h3>
        <ul>${Object.entries(c.g).sort((a, b) => b[1] - a[1]).map(([g, t]) => `<li>${esc(g)} ${n0(t)}t <small>${X.dom.includes(g) ? '내수' : '수출·가전'}</small></li>`).join('') || '<li>배정 없음</li>'}</ul>
        <label class="fld">내수(t) <input type="number" id="w-dom" step="any" value="${Math.round(d0 && d0.kind === 'adj' && d0.dom != null ? d0.dom : c.dom)}"></label>
        <div class="row"><button type="button" class="btn sub sm" id="w-fair">주 평균 ${n0(sg0)}t</button><button type="button" class="btn sub sm" id="w-cur">지금 계획 ${n0(c.dom)}t</button></div>
        <div class="row"><button type="button" class="btn sm" id="w-mon">${l} ${isW(s) ? wkLab(s).split(' ')[0] + ' 모든 주' : +s.slice(5, 7) + '월 세 순 모두'} 주 평균으로</button></div><p class="note" id="w-mon-t">${mSibs(s).map((x) => { const cx = cc(l, x); return cx ? `${isW(x) ? wkLab(x).split(' ')[1] : SN[+x.slice(8) - 1]} ${n0(cx.dom)}→${n0(sugg(l, x))}` : ''; }).filter(Boolean).join(' · ')}</p>
        <label class="fld">수출 옮기기 <input type="number" id="w-mvt" step="any" value="${Math.round(d0 && d0.mv ? d0.mv[1] : 0)}">t → <select id="w-mvs">${sibs(s).filter((x) => x !== s && cc(l, x)).map((x) => `<option value="${x}"${d0 && d0.mv && d0.mv[0] === x ? ' selected' : ''}>${sunLab(x)}</option>`).join('')}</select></label>
        <div class="pv" id="w-pv"></div></div>
        <div><h3>당길 수출 오더 <small>${l} · 납기 ${md(sunEnd(s))} 이후 · 골라서 넣기</small></h3>
        <div class="row"><label><input type="checkbox" id="w-ok"> 소재 확보만</label><span class="note" id="w-sel"></span></div>
        <div class="pick">${P.length ? `<table class="op-t"><thead><tr><th></th><th class="l">납기</th><th class="l">계약</th><th class="l">품명·규격</th><th>t</th><th class="l">소재</th><th class="l">담당</th></tr></thead><tbody>${P.map((r) => { const [k, n] = ST(r.st), other = PS.get(r.con), dis = other && other !== key; return `<tr data-ok="${k === 'ok'}"${dis ? ' class="z"' : ''}><td><input type="checkbox" class="w-p" data-con="${esc(r.con)}" data-t="${r.t}"${pre.has(r.con) ? ' checked' : ''}${dis ? ' disabled title="다른 칸으로 당김 결정됨"' : ''}></td><td class="l">${md(r.due)}</td><td class="l">${esc(r.con)}</td><td class="l">${esc(r.pdt)} ${esc(r.size)}</td><td>${n0(r.t)}</td><td class="l"><span class="st ${k}">${n}</span></td><td class="l">${esc(r.man)}${dis ? ` <small>(${esc(keyLab(other))})</small>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="q">당길 수출 오더 없음</p>'}</div></div></div>`;
      el.innerHTML = `<form class="pd" id="w-f" novalidate>${html}${foot(d0 ? d0.st : '제안')}</form>`;
      const pv = () => {
        const dm = +$('w-dom').value || 0, sel = [...el.querySelectorAll('.w-p:checked')], pt = sel.reduce((a, x) => a + +x.dataset.t, 0), mo = ($('w-mvs') && $('w-mvs').value) ? +$('w-mvt').value || 0 : 0, ex = c.exp - mo + mvIn(l, s), r = cap - dm - ex - pt, g = dm - sg0;
        const tg = mo && $('w-mvs').value ? (() => { const a2 = after(l, $('w-mvs').value); return a2 ? a2.cap - a2.dom - a2.exp - mo : null; })() : null;
        $('w-sel').textContent = sel.length ? `${sel.length}건 ${n0(pt)}t 선택` : '';
        $('w-pv').innerHTML = `<div class="ans"><div>배정 = 내수 ${n0(dm)} + 수출 ${n0(ex)} + 당김 ${n0(pt)} = <b>${n0(dm + ex + pt)}t</b> / 능력 ${n0(cap)}t</div>${tg != null ? `<div>옮겨 받는 ${sunLab($('w-mvs').value)}: ${tg >= 50 ? `빈 ${n0(tg)}t 남음` : tg <= -50 ? `<b class="bad">넘침 ${n0(-tg)}t</b>` : '꽉 참'}</div>` : ''}`
          + `<div>${r >= 50 ? `여유 <b>${n0(r)}t</b>, 오더를 당기거나 주문을 더 받음` : r <= -50 ? `<b class="bad">초과 ${n0(-r)}t</b>, 다른 주로 옮기거나 2CCL(사장님 결정)` : '<b>여유 없음</b>, 확정 가능'}</div>`
          + `<div>주 평균 ${n0(sg0)}t 대비 내수 ${sg(g)}t · 도금 자가재 소요 ${sg((dm - c.dom) * 0.65)}t</div></div>`;
      };
      $('w-fair').onclick = () => { $('w-dom').value = Math.round(sg0); pv(); };
      $('w-mon').onclick = async () => {   // 그 달 세 순을 한 번에(한 결정 묶음) — 같은 상태·메모
        const st = $('w-st').value, tx = $('w-tx').value.trim() || `${l} ${+s.slice(5, 7)}월 내수 순 고정`; $('dec-m').textContent = '저장 중…';
        try { localStorage.setItem('cgl-me', $('dec-by').value || CT.me()); } catch (x) { /* 무시 */ }
        try { for (const x of mSibs(s)) { const cx = cc(l, x); if (!cx) continue; const dx = decOf(`${l}|${x}`); await CT.store.push({ t: 'room', key: `${l}|${x}`, line: l, sun: x, kind: 'adj', dom: Math.round(sugg(l, x)), pulls: dx && dx.kind === 'adj' ? dx.pulls || [] : [], st, text: tx }); } EV = await CT.store.events(); draw(); } catch (x) { $('dec-m').textContent = '⚠ ' + x.message; }
      };
      $('w-cur').onclick = () => { $('w-dom').value = Math.round(c.dom); pv(); };
      $('w-ok').onchange = () => el.querySelectorAll('.pick tbody tr').forEach((tr) => { tr.hidden = $('w-ok').checked && tr.dataset.ok !== 'true'; });
      $('w-f').addEventListener('input', pv); pv();
      $('w-f').addEventListener('submit', (e) => { e.preventDefault(); const dm = +$('w-dom').value; save({ t: 'room', key, line: l, sun: s, kind: 'adj', dom: dm === Math.round(c.dom) ? null : dm, pulls: [...el.querySelectorAll('.w-p:checked')].map((x) => [x.dataset.con, +x.dataset.t]), mv: $('w-mvs') && +$('w-mvt').value ? [$('w-mvs').value, +$('w-mvt').value] : null, st: $('w-st').value, text: $('w-tx').value.trim() }, $('dec-m')); });
    } else if (l === '2CCL') {
      const c = cc(l, s) || {}, u = used(c), mv = u - (c.fix || 0), ps = !ourPlan(s);
      html = `<div class="wb"><div><h3>2CCL ${sunLab(s)} <small>${n0(u)}t 가동 계획${ps ? ' · 판생 배포 계획(확정)' : ''}</small></h3><ul>${Object.entries(c.g || {}).map(([g, t]) => `<li>${esc(g)} ${n0(t)}t</li>`).join('')}</ul>
        <p class="note">다른 CCL 가능 ${n0(mv)}t, 2CCL 전용 ${n0(c.fix || 0)}t</p></div>
        <div><h3>결정</h3><label class="fld"><input type="radio" name="w-c" value="run"${!d0 || d0.choice !== 'stop' ? ' checked' : ''}> 가동(사장님 결정 요청)</label>
        <label class="fld"><input type="radio" name="w-c" value="stop"${d0 && d0.choice === 'stop' ? ' checked' : ''}> 세움, <input type="number" id="w-mv" step="any" value="${Math.round(d0 && d0.move != null ? d0.move : mv)}" style="width:110px">t 를 다른 CCL(같은 달)로</label>
        <p class="note">세우면 1·3·4CCL 에 옮길 여유가 있어야 함(시험 계산 탭)</p></div></div>`;
      el.innerHTML = `<form class="pd" id="w-f" novalidate>${html}${foot(d0 ? d0.st : ps ? '확정' : '사장님 결정 요청')}</form>`;
      $('w-f').addEventListener('submit', (e) => { e.preventDefault(); const ch = el.querySelector('input[name=w-c]:checked').value; save({ t: 'room', key, line: l, sun: s, kind: '2ccl', choice: ch, move: ch === 'stop' ? +$('w-mv').value : null, st: $('w-st').value, text: $('w-tx').value.trim() }, $('dec-m')); });
    } else if (l === 'mat') {
      const m = ((X.matLate || {}).items || []).find((y) => y.key === s) || {};
      el.innerHTML = `<form class="pd" id="w-f" novalidate><div class="wb"><div><h3>${esc(m.name || s)} <small>발주 마감 ${md(m.deadline)}, 첫 사용 ${md(m.first)}</small></h3><p class="q">${n0(m.t)}t 미발주. 지금 발주해도 첫 사용일에 못 들어올 수 있음</p></div>
        <div><label class="fld">조치 <select id="w-act">${['지금 발주(긴급)', '그 생산을 뒤로 미룸', '대체 소재로', '판생 계획 조정 요청'].map((x) => `<option${d0 && d0.act === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="fld">양(t) <input type="number" id="w-mt" step="any" value="${Math.round(d0 && d0.qty != null ? d0.qty : m.t || 0)}"></label><label class="fld">담당·기한 <input id="w-who" value="${esc(d0 && d0.who || '소재 구매')}"></label></div></div>${foot(d0 ? d0.st : '제안')}</form>`;
      $('w-f').addEventListener('submit', (e) => { e.preventDefault(); save({ t: 'room', key, kind: 'mat', act: $('w-act').value, qty: +$('w-mt').value, who: $('w-who').value.trim(), st: $('w-st').value, text: $('w-tx').value.trim() }, $('dec-m')); });
      return;
    } else if (l === 'grp') {
      const m = s, x = (X.sales.C수출 || []).find((y) => y.m === m) || {}, o = X.pull.rows.filter((r) => r.due.slice(0, 7) === m).reduce((a, r) => a + r.t, 0);
      el.innerHTML = `<form class="pd" id="w-f" novalidate><div class="wb"><div><h3>${+m.slice(5)}월 컬러수출 수주 <small>판매계획 ${n0(x.sales)}t · 미결 수주 ${n0(o)}t</small></h3><p class="q">부족 ${n0((x.sales || 0) - o)}t 을 누가 언제까지 받아 올지</p></div>
        <div><label class="fld">받아 올 목표(t) <input type="number" id="w-goal" step="any" value="${Math.round(d0 && d0.goal != null ? d0.goal : Math.max(0, (x.sales || 0) - o))}"></label><label class="fld">담당·기한 <input id="w-who" value="${esc(d0 && d0.who || '')}" placeholder="예: 수출1섹션 · 11/28까지"></label></div></div>${foot(d0 ? d0.st : '제안')}</form>`;
      $('w-f').addEventListener('submit', (e) => { e.preventDefault(); save({ t: 'room', key: `grp|${m}`, kind: 'order', goal: +$('w-goal').value, who: $('w-who').value.trim(), st: $('w-st').value, text: $('w-tx').value.trim() }, $('dec-m')); });
      return;
    } else {
      const c = cg(l, s) || { self: {}, sale: 0 }, neg = (isW(s) ? selfFrom(s, l) : selfMin(s).filter((x) => selfLine(x[0]) === l)), need = neg.reduce((a, x) => a + Math.ceil(-x[1] / 10) * 10, 0);
      html = `<div class="wb"><div><h3>${l} ${sunLab(s)} <small>컬러용 자가재</small></h3><ul>${Object.entries(c.self).map(([a, t]) => `<li>자가재 ${esc(a)} ${n0(t)}t</li>`).join('') || '<li>자가재 없음</li>'}<li>판매재 ${n0(c.sale)}t</li></ul>
        ${neg.length ? `<p class="bad">${neg.map((x) => `${x[0]} 자가재 ${sg(x[1])}t(${md(x[2])} 최저)`).join(' · ')}</p>` : '<p class="q">이 순 자가재 부족 없음</p>'}</div>
        <div><h3>조정</h3><label class="fld">판매재 → 자가재 전환(t) <input type="number" id="w-cv" step="any" value="${Math.round(d0 && d0.conv != null ? d0.conv : need)}"></label><div class="pv" id="w-pv"></div></div></div>`;
      el.innerHTML = `<form class="pd" id="w-f" novalidate>${html}${foot(d0 ? d0.st : '제안')}</form>`;
      const pv = () => { const v = +$('w-cv').value || 0, lo = neg.length ? Math.min(...neg.map((x) => x[1])) : null; $('w-pv').innerHTML = `<div class="ans"><div>자가재 ${n0(Object.values(c.self).reduce((a, x) => a + x, 0) + v)}t · 판매재 ${n0(c.sale - v)}t</div>${lo != null ? `<div>최저 ${sg(lo)} → <b>${sg(lo + v)}t</b>${lo + v >= 0 ? ', 부족 풀림' : ', 아직 부족'}</div>` : ''}<div>판매재 ${n0(v)}t 는 ${isW(s) ? '다른 주' : '다른 순'}으로 미룸</div></div>`; };
      $('w-f').addEventListener('input', pv); pv();
      $('w-f').addEventListener('submit', (e) => { e.preventDefault(); save({ t: 'room', key, line: l, sun: s, kind: 'self', al: neg.length ? neg.slice().sort((x, y) => x[1] - y[1])[0][0] : (l === '1CGL' ? 'AZ' : 'MAC'), conv: +$('w-cv').value, st: $('w-st').value, text: $('w-tx').value.trim() }, $('dec-m')); });
    }
  }

  /* ---------- 시험 계산 ---------- */
  function testView() {
    const M = [...new Set(suns().map((s) => s.slice(0, 7)))].filter((m) => [1, 2, 3].every((k) => MAIN.some((l) => cc(l, `${m}-${k}`))));
    const m0 = M.includes(TM) ? TM : M[0];
    return `<section class="card"><h2>시험 계산 <small>내수 물량이 바뀌면 다른 라인과 도금은</small></h2>
      
      <div class="tc"><label>달 <select id="tc-m">${M.map((m) => `<option${m === m0 ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>내수 물량 변동 <input type="range" id="tc-d" min="-5000" max="5000" step="500" value="${TD}"> <output id="tc-o">${sg(TD)}t</output></label></div>
      <div id="tc-r"></div></section>`;
  }
  let TM = null, TD = 0;
  function testCalc() {
    const m = $('tc-m').value, d = +$('tc-d').value; TM = m; TD = d; $('tc-o').textContent = sg(d) + 't';
    const S = [1, 2, 3].map((k) => `${m}-${k}`);
    // 분 단위: 능력 = 가동 분(계획상 가동일), 내수·수출 분 = 그 순 품목의 실제 t/분으로 환산(라인 평균이 아님)
    const sumL = (s, Ls, k) => Ls.reduce((a, l) => a + ((cc(l, s) || {})[k] || 0), 0);
    const capM = S.map((s) => sumL(s, MAIN, 'availMin')), cap2M = S.map((s) => sumL(s, ['2CCL'], 'availMin'));
    const D0 = S.map((s) => sumL(s, CCL, 'dom')), X0 = S.map((s) => sumL(s, CCL, 'exp'));
    const dR = S.map((s) => { const m = sumL(s, MAIN, 'domMin'); return m > 1 ? sumL(s, MAIN, 'dom') / m : 0.2; }), xR = S.map((s) => { const m = sumL(s, MAIN, 'expMin'); return m > 1 ? sumL(s, MAIN, 'exp') / m : 0.2; });   // 1·3·4CCL 에서 실제로 나오는 t/분
    const u2now = S.reduce((a, s) => a + used(cc('2CCL', s)), 0);
    const roomNow = S.map((s) => MAIN.reduce((a, l) => a + room(cc(l, s)), 0));
    const calc = (dd) => {
    const TDsum = Math.max(0, D0.reduce((a, v) => a + v, 0) + dd), C1 = capM.reduce((a, v) => a + v, 0) || 1;
    const D1 = capM.map((c) => TDsum * c / C1), needM = S.map((s, i) => D1[i] / dR[i] + X0[i] / xR[i]);
    const cap1 = S.map((s, i) => capM[i] * xR[i]);   // 표시용 t(수출 속도 환산)
    // 넘치는 순의 수출은 같은 달 다른 순 빈 시간으로(가까운 순부터) → 그래도 넘치면 2CCL(사장님 결정) → 그 뒤 능력 초과
    const rmM = S.map((s, i) => Math.max(0, capM[i] - needM[i])), ovM = S.map((s, i) => Math.max(0, needM[i] - capM[i])), mvM = S.map(() => 0);
    S.forEach((s, i) => { [...S.keys()].filter((j) => j !== i).sort((a, b) => Math.abs(a - i) - Math.abs(b - i)).forEach((j) => { const t = Math.min(ovM[i], rmM[j]); ovM[i] -= t; rmM[j] -= t; mvM[i] -= t; mvM[j] += t; }); });
    // 2CCL 능력 = 2CCL 가동 분 × 2CCL 자체 속도(t) — 넘친 톤을 2CCL 로(가까운 순부터)
    const r2 = S.map((s) => { const c = cc('2CCL', s) || {}, m = (c.domMin || 0) + (c.expMin || 0); return m > 1 ? used(c) / m : ((X.tph || {})['2CCL'] || 14) / 60; });
    const ovT = ovM.map((v, i) => v * xR[i]), c2 = cap2M.map((v, i) => v * r2[i]), u2T = S.map(() => 0);
    S.forEach((s, i) => { [...S.keys()].sort((a, b) => Math.abs(a - i) - Math.abs(b - i)).forEach((j) => { const t = Math.min(ovT[i], c2[j]); ovT[i] -= t; c2[j] -= t; u2T[j] += t; }); });
    const R = S.map((s, i) => ({ s, d0: D0[i], d1: D1[i], x: X0[i] + mvM[i] * xR[i], cap: cap1[i], room: rmM[i] * xR[i], u2: u2T[i], beyond: ovT[i], roomNow: roomNow[i], mv: mvM[i] * xR[i] }));
      return R;
    };
    const R = calc(d), B0 = calc(0);   // 변동 0 결과(= 지금 계획의 2CCL·넘침)를 기준으로 맞춤 — 모델 오차가 결과에 섞이지 않게
    R.forEach((r, i) => { r.beyond = Math.max(0, r.beyond - B0[i].beyond); });
    const mv = R.map((r) => r.mv);
    const moved = mv.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const sum = (k) => R.reduce((a, r) => a + r[k], 0);
    const P = PR().filter((r) => r.due >= nextMon(m) + '-01'), pT = P.reduce((a, r) => a + r.t, 0), pOk = P.filter((r) => ST(r.st)[0] === 'ok').reduce((a, r) => a + r.t, 0);
    const mi = Math.max(0, (X.sales.C건재 || []).findIndex((x) => x.m === m)), coef = ((X.selfCoef || {}).C건재 || [0.65])[Math.min(mi, ((X.selfCoef || {}).C건재 || [0.65]).length - 1)] || 0.65;
    const share0 = sum('d0') ? R[0].d0 / sum('d0') * 100 : 0, share1 = sum('d1') ? R[0].d1 / sum('d1') * 100 : 0;
    let low = {}; for (const [al, ser] of Object.entries(X.self || {})) low[al] = Math.min(...ser.filter((r) => r[0].slice(0, 7) >= m).map((r) => r[1]));
    const roomT = sum('room'), u2 = sum('u2'), bey = sum('beyond');
    const ans = `<div class="ans">
      <div>① ${d ? `내수 ${sg(d)}t 바뀌면 → <b>순마다 ${sg(d / 3)}t 안팎만</b> 움직임` : '내수 물량 그대로 순마다 고르게 나눔'}. 수출·가전 ${n0(sum('x'))}t 은 그대로${moved >= 0.5 ? `(그중 ${n0(moved)}t 은 같은 달 다른 순으로 옮김)` : ''}.</div>
      <div>② ${roomT >= 50 ? `빈 룸 <b>${n0(roomT)}t</b> → 납기 ${+nextMon(m).slice(5)}월 이후 미결 수출 오더 ${n0(pT)}t(소재 확보 ${n0(pOk)}t)로 채움${pT < roomT ? `, <b>수출 주문 ${n0(roomT - pT)}t 더 받아야 함</b>` : ''}` : '빈 룸 없음'}.</div>
      <div>③ ${u2 >= 0.5 ? `<b>2CCL ${n0(u2)}t 가동(사장님 결정)</b>` : '2CCL 세움(나머지 CCL 로 소화)'}${bey >= 0.5 ? ` · <b>능력 초과 ${n0(bey)}t 다음 달로</b>` : ''}. 지금 계획의 2CCL 가동 ${n0(u2now)}t.</div>
      <div>④ 도금 영향: 자가재 소요 ${sg(d * coef)}t(내수 1t 당 ${coef.toFixed(2)}t). 지금 계획 자가재 최저 ${Object.entries(low).map(([a, v]) => `${a} ${sg(v)}t`).join(' · ')}.</div>
      <div>⑤ 상순 내수 비중: 지금 계획 ${share0.toFixed(0)}% → 순 고정 ${share1.toFixed(0)}%.</div></div>`;
    const tb = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">순</th><th>지금 내수</th><th>순 평균 내수</th><th>수출·가전</th><th>1·3·4CCL 능력(t)</th><th>여유</th><th>2CCL 필요</th><th>지금 여유</th></tr></thead><tbody>`
      + R.map((r) => `<tr><td class="l">${sunLab(r.s)}</td><td>${n0(r.d0)}</td><td><b>${n0(r.d1)}</b></td><td>${n0(r.x)}</td><td>${n0(r.cap)}</td><td>${r.room >= 0.5 ? n0(r.room) : '–'}</td><td class="${r.u2 >= 0.5 ? 'bad' : 'z'}">${r.u2 >= 0.5 ? n0(r.u2) : '–'}</td><td class="z">${n0(r.roomNow)}</td></tr>`).join('')
      + `<tr class="tot"><td class="l">합계</td><td>${n0(sum('d0'))}</td><td>${n0(sum('d1'))}</td><td>${n0(sum('x'))}</td><td>${n0(sum('cap'))}</td><td>${n0(roomT)}</td><td>${u2 >= 0.5 ? n0(u2) : '–'}</td><td>${n0(sum('roomNow'))}</td></tr></tbody></table></div>`;
    $('tc-r').innerHTML = ans + tb + ``;
  }

  /* ---------- 판매그룹별 ---------- */
  function grpView() {
    const S = suns(), G = {};
    for (const l of CCL) for (const [s, c] of Object.entries(X.color[l] || {})) for (const [g, t] of Object.entries(c.g)) { const k = X.salesGrp[g] || g; (G[k] = G[k] || {})[s] = (G[k][s] || 0) + t; }
    const order = ['컬러수출', '컬러수출(가전내수)', '컬러건재판매', '수요개발'];
    const t1 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">판매그룹</th>${S.map((s) => `<th>${sunLab(s)}</th>`).join('')}</tr></thead><tbody>${order.filter((g) => G[g]).map((g) => `<tr><td class="l"><b>${g}</b></td>${S.map((s) => `<td>${G[g][s] >= 0.5 ? n0(G[g][s]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const SL = X.sales.C수출 || [], byM = {}; for (const r of X.pull.rows) byM[r.due.slice(0, 7)] = (byM[r.due.slice(0, 7)] || 0) + r.t;
    const t2 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">달</th><th>컬러수출 판매계획</th><th>미결 수주(남은 양, 가전내수 포함)</th><th>더 받아야 할 양</th></tr></thead><tbody>${SL.filter((x) => x.m >= X.pull.from.slice(0, 7)).map((x) => { const o = byM[x.m] || 0, g = Math.max(0, x.sales - o); return `<tr><td class="l">${+x.m.slice(5)}월</td><td>${n0(x.sales)}</td><td>${n0(o)}</td><td class="${g >= 0.5 ? 'bad' : ''}">${g >= 0.5 ? n0(g) : '–'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const MN = {}; for (const r of PR()) { const k = r.man || '담당 미상', o = (MN[k] = MN[k] || { t: 0, n: 0, ok: 0, due: r.due, lines: new Set() }); o.t += r.t; o.n++; if (ST(r.st)[0] === 'ok') o.ok += r.t; if (r.due < o.due) o.due = r.due; if (r.line) o.lines.add(r.line); }
    const t3 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">담당</th><th>건수</th><th>남은 t</th><th>그중 소재 확보</th><th class="l">가장 이른 납기</th><th class="l">라인</th></tr></thead><tbody>${Object.entries(MN).sort((a, b) => b[1].t - a[1].t).map(([k, o]) => `<tr><td class="l"><b>${esc(k)}</b></td><td>${o.n}</td><td>${n0(o.t)}</td><td>${o.ok >= 0.5 ? n0(o.ok) : '–'}</td><td class="l">${md(o.due)}</td><td class="l">${[...o.lines].sort().join(' · ')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<section class="card"><h2>판매그룹 × 순 배정 <small>t · 이번 순은 오늘부터</small></h2>${t1}</section>
      <section class="card"><h2>컬러수출 받아 올 주문 <small>판매계획 대비 주문</small></h2>${t2}</section>
      <section class="card"><h2>담당자별 당길 수 있는 수출 오더 <small>납기 ${md(X.pull.from)} 이후 미결 수출 · ${PR().length}건</small></h2>${t3}</section>`;
  }

  function draw() {
    const v = CT.view('board', ['board', 'test', 'grp']), main = $('ct-main');
    main.innerHTML = v === 'test' ? testView() : v === 'grp' ? grpView() : board();
    if (v === 'board') {
      const show = (k) => { if (!k) return; const [l, w] = k.split('|'); if (MAIN.includes(l)) { const el = $('rb-pd'); el.innerHTML = orderDetail(l, w); const f = $('w-f'), cnt = () => { const c = [...el.querySelectorAll('.w-p:checked')]; $('w-sel').textContent = c.length ? `${c.length}건 ${n0(c.reduce((a, x) => a + +x.dataset.t, 0))}t 선택` : ''; }; f.addEventListener('change', cnt); cnt(); f.addEventListener('submit', (e) => { e.preventDefault(); save({ t: 'room', key: k, line: l, sun: w, kind: 'adj', dom: null, pulls: [...el.querySelectorAll('.w-p:checked')].map((x) => [x.dataset.con, +x.dataset.t]), st: $('w-st').value, text: $('w-tx').value.trim() }, $('dec-m')); }); } else detail(k); };
      main.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { OPEN = OPEN === b.dataset.k ? null : b.dataset.k; draw(); const p = $('rb-pd'); if (p && OPEN) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
      main.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => save({ t: 'roomSt', ref: b.dataset.ref, st: b.dataset.st }, null)));
      show(OPEN);
    }
    if (v === 'test') { ['tc-m', 'tc-d'].forEach((id) => $(id).addEventListener('input', testCalc)); testCalc(); }
    if (window.UI && UI.sub) UI.sub(`기준 ${md(X.today)} · 자료 ${String(X.built).slice(5, 16).replace('T', ' ')} · 11/18 사장님 회의 원칙`);
  }
  CT.onView(draw);
  CT.boot(['preview_ops.enc.json'], async (D) => {
    X = D.preview_ops; if (!X) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; }
    draw();
    try { EV = await CT.store.events(); draw(); } catch (e) { /* 공유 저장소 못 읽음 — 기록 없이 */ }
  });
})();
