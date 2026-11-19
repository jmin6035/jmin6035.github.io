/* 판생 작업판 화면들(판생 계획표 · 도금 월차 · 생산 가능 · 소재 · 컬러 월차 · 이력·회차) — 어느 화면인지는 <header data-page> 로 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PAGE = (document.getElementById('shell') || {}).dataset.page;
  const IN_PAN = /\/pan\//.test(location.pathname);   // 판생 작업장(새 사이트) 안이면 화면 주소를 pan/ 으로
  const PANF = { pstoday: 'index', psorders: 'orders', psdecide: 'decide', psfit: 'fit', psplating: 'plating', psmat: 'mat', psweek: 'week', pscolor: 'color', psledger: 'ledger', pslog: 'log', psflow: 'flow' };
  const HREF = (pid) => (IN_PAN ? `pan/${PANF[pid] || 'index'}.html` : `preview/ps_${{ pstoday: 'today', psorders: 'orders', psdecide: 'decide', psfit: 'fit', psplating: 'plating', psmat: 'mat', psweek: 'week', pscolor: 'color', psledger: 'ledger', pslog: 'log', psflow: 'flow' }[pid] || 'today'}.html`);
  const GRPN = (g) => { g = String(g || ''); return /수출/.test(g) && !/컬러/.test(g) ? '도금수출' : /자동차/.test(g) ? '자동차' : /도금판매/.test(g) ? '도금국내' : /컬러|자가/.test(g) ? '자가재' : /수요/.test(g) ? '수요개발' : g || '기타'; };
  const LB = (x) => String(x == null ? '' : x).replace(/자동차강판판매|자동차강판/g, '자동차').replace(/도금판매/g, '도금국내');   // 용어 기준(docs/32): 그룹 이름
  const n0 = PS.n0, sg = PS.sg, md = PS.md, mL = PS.mLab;
  let st = { m0: null, cmp: 0, m: null, src: 'ledger' };
  try { Object.assign(st, JSON.parse(localStorage.getItem('ps-ui-' + PAGE) || '{}')); } catch (e) { /* 무시 */ }
  const keep = () => { try { localStorage.setItem('ps-ui-' + PAGE, JSON.stringify(st)); } catch (e) { /* 무시 */ } };
  PSG.valueOf = PS.inputValue;

  /* ---------- 생산 결정(시뮬레이션) — 11/19 사용자 '그룹 재고 얼마, 판매계획 얼마, 재고출하 얼마 → 이번 달 생산은 이거. 판매가 바뀌면 줄이고 늘려서 총 생산이 맞나' ----------
     줄 = 강종 × 판매그룹(판생 계획표 맨 아래 줄). 생산 = 판매 − 재고 출하, 월말 재고 = 월초 재고 − 재고 출하. 월초 재고 = 전달 월말(첫 달은 MES 10월 말 실제 재고에서 판생 11월 계획으로 굴린 값)
     능력 = 도금 월차(1CGL AZ·2CGL MAC 먼저, 남는 날 AL) — AL 여유가 곧 '총 생산이 맞나' */
  function decide(B) {
    const ms = B.months.slice(1); if (!ms.includes(st.m)) st.m = ms[0];
    const m = st.m, pm = PS.prevM(m), nd = PS.days(m).length, follow = st.follow !== 'stock';
    const L = PS.ledger(), P = PS.plating(L), L0 = PS.ledger(PS.baseOver()), P0 = PS.simOn() ? PS.plating(L0) : P;
    const R = B.ledger.rows, byR = Object.fromEntries(R.map((x) => [x.r, x]));
    const open = (Lx, r) => (Lx[pm] ? Lx[pm][r].sf : (Lx[m][r].sf - Lx[m][r].p + Lx[m][r].s));
    const seed = (r) => ((((B.ledger.v[m] || {}).cells || {})[r]) || {}).p || 0;
    const cap = (Px) => { const Pm = Px[m], T = Pm.T, az = PS.sumG(Pm['1CGL'].days, 'AZ'), mac = PS.sumG(Pm['2CGL'].days, 'MAC'), al = PS.sumG(Pm['1CGL'].days, 'AL') + PS.sumG(Pm['2CGL'].days, 'AL');
      return { T, az, mac, al, need: T.total, made: az + mac + al, dAZ: az - T.AZ, dMAC: mac - T.MAC, dAL: al - T.AL }; };
    const C = cap(P), C0 = cap(P0), AS = PS.assign(P), famOf = (x) => (/STS/.test(x.lab) ? 'STS' : (R.find((y) => y.r === x.sec) || {}).name), grpOf = (x) => { const l = x.lab.replace(/\s/g, ''); return /도금수출/.test(l) ? '도금수출' : /자동차/.test(l) ? '자동차' : /도금판매|RM/.test(l) ? '도금국내' : /자가/.test(l) ? '자가재' : /수요/.test(l) ? '수요개발' : l; };
    const ordG = {}; for (const x of R) { if (!L[m][x.r] || !L[m][x.r].in) continue; const k = `${m}|${grpOf(x)}|${famOf(x)}`; (ordG[k] = ordG[k] || []).push(x.r); }
    const ordOf = (x) => { const k = `${m}|${grpOf(x)}|${famOf(x)}`, rs = ordG[k] || [x.r], tot = rs.reduce((a, r) => a + Math.max(0, L[m][r].p), 0) || rs.length; return Math.round((AS.om[k] || 0) * (tot === rs.length ? 1 / rs.length : Math.max(0, L[m][x.r].p) / tot)); };
    // 판매그룹 줄
    const FAM = [['MAC', 'MAC'], ['AZ', 'AZ'], ['AL', 'AL']], rows = [], items = [];
    const nm = (x) => { const mk = byR[x.mkt] || (x.kind === 'mkt' ? x : null), a = mk ? mk.lab.replace(/\s/g, '') : ''; return x.kind === 'mkt' ? a : `${a} ${LB(x.lab)}`; };
    for (const [g] of FAM) {
      const sec = PS.secRow(g), leaf = R.filter((x) => x.sec === sec.r && L[m][x.r] && L[m][x.r].in && !(x.hid && !L[m][x.r].p && !L[m][x.r].s && !L[m][x.r].sf));
      const S = L[m][sec.r], o = leaf.reduce((a, x) => a + open(L, x.r), 0), sp = leaf.reduce((a, x) => a + seed(x.r), 0);
      rows.push({ cls: 'sec', cells: [{ v: g, t: 'lab' }, { v: `${g} 계`, t: 'lab' }, { v: o, fx: `= ${g} 아래 줄 월초 재고 합` }, { v: leaf.reduce((a, x) => a + L[m][x.r].s, 0), fx: `= ${g} 아래 줄 판매 합(자가 = 컬러로 넘김 포함)` }, { v: leaf.reduce((a, x) => a + L[m][x.r].s - L[m][x.r].p, 0), f: 'sg', fx: `= ${g} 아래 줄 재고 출하 합` }, { v: S.p, cls: 'pv', fx: `= ${g} 아래 줄 생산 합 = ${n0(S.p)}` }, { v: leaf.reduce((a, x) => a + ordOf(x), 0) }, { v: S.sf }, { v: '' }, { v: sp }, { v: S.p - sp, f: 'sg', cls: S.p - sp > 0 ? 'up' : S.p - sp < 0 ? 'dn' : '' }] });
      for (const x of leaf) {
        const c = L[m][x.r], o1 = open(L, x.r), out = c.s - c.p, dd = c.s / nd, days = dd > 0 ? c.sf / dd : null, own = /자가/.test(nm(x));
        items.push({ g, x, nm: nm(x), c, o1, out, days });
        rows.push({ cells: [{ v: '', t: 'lab' }, { v: nm(x) + (own ? ' (컬러로)' : ''), t: 'lab' }, { v: o1, cls: o1 < 0 ? 'neg' : '', fx: `= ${mL(pm)} 월말 재고 ${n0(o1)}` }, { v: c.s, t: 'in', k: `L|${x.r}|${m}|s`, fx: `입력: 판매 계획 · ${st.follow !== 'stock' ? '고치면 생산이 같은 만큼 따라감' : '고치면 재고가 받음'}` }, { v: out, f: 'sg', t: 'in', k: `X|${x.r}|${m}`, title: '재고에서 내보낼 양(+) · 재고로 쌓을 양(−)', fx: `입력: 재고 출하(+ 재고에서 · − 쌓기) = 판매 ${n0(c.s)} − 생산 ${n0(c.p)}` }, { v: c.p, cls: 'pv', fx: `= 판매 ${n0(c.s)} − 재고 출하 ${sg(out)} = ${n0(c.p)}` }, { v: ordOf(x), cls: ordOf(x) > c.p + 30 ? 'dn' : '', title: '생산 필요일이 이 달인 미생산 주문(같은 그룹·강종 줄이 여럿이면 생산 비율로 나눔)', fx: `= MES 미생산 주문 중 생산 필요일이 ${mL(m)}인 것(${esc(B.ordersAsOf || '')})` }, { v: c.sf, cls: c.sf < 0 ? 'neg' : '', fx: `= 월초 재고 ${n0(o1)} − 재고 출하 ${sg(out)} = ${n0(c.sf)}` }, { v: days == null || own ? '' : Math.round(days) + '일', cls: !own && days != null && days < 7 ? 'dn' : '', fx: days == null || own ? '' : `= 월말 재고 ${n0(c.sf)} ÷ (판매 ${n0(c.s)} ÷ ${nd}일)` }, { v: seed(x.r), fx: '= 판생 엑셀(11/17) 이 달 생산 계획' }, { v: c.p - seed(x.r), f: 'sg', fx: `= 생산 ${n0(c.p)} − 판생 ${n0(seed(x.r))}`, cls: c.p - seed(x.r) > 0 ? 'up' : c.p - seed(x.r) < 0 ? 'dn' : '' }] });
      }
    }
    // 판단
    const adv = [];
    const lineDays = (l) => P[m][l].days.filter((x) => x.g).length;
    if (C.dAZ < -1) adv.push(['bad', `AZ ${n0(-C.dAZ)}t 부족: 1CGL ${lineDays('1CGL')}일을 다 AZ 로 돌려도 부족. AZ 판매를 줄이거나 AZ 재고 출하를 늘릴 것`]);
    if (C.dMAC < -1) adv.push(['bad', `MAC ${n0(-C.dMAC)}t 부족: 2CGL MAC 가능 날(포트 재축조 뒤)이 부족. MAC 판매를 줄이거나 MAC 재고 출하를 늘릴 것`]);
    if (C.dAL < 0) {
      const sh = -C.dAL, cand = items.filter((i) => i.g === 'AL' && !/자가/.test(i.nm) && i.days != null).map((i) => ({ ...i, spare: Math.round(i.c.sf - 15 * i.c.s / nd) })).filter((i) => i.spare > 50).sort((a, b) => b.spare - a.spare).slice(0, 3);
      adv.push(['bad', `AL ${n0(sh)}t 부족(AZ·MAC 날을 빼고 남는 날로는 AL ${n0(C.al)}t 까지)`]);
      if (cand.length) adv.push(['warn', `① 재고 출하 늘리기(월말 재고를 판매 15일분까지 쓰면): ${cand.map((i) => `${i.nm} ${n0(i.spare)}t 더 뺄 수 있음(월말 ${n0(i.c.sf)}t)`).join(' · ')}`]);
      adv.push(['warn', `② AZ·MAC 날 줄이기: 1CGL AZ 하루 줄이면 AZ −${n0(PS.rate(m, '1CGL', 'AZ'))}t · AL +${n0(PS.rate(m, '1CGL', 'AL'))}t, 2CGL MAC 하루 줄이면 MAC −${n0(PS.rate(m, '2CGL', 'MAC'))}t · AL +${n0(PS.rate(m, '2CGL', 'AL'))}t`]);
      adv.push(['warn', `③ AL 판매 조정: 큰 그룹 ${items.filter((i) => i.g === 'AL').sort((a, b) => b.c.s - a.c.s).slice(0, 3).map((i) => `${i.nm} ${n0(i.c.s)}t`).join(' · ')}`]);
    } else {
      const low = items.filter((i) => i.g === 'AL' && i.days != null && i.c.s > 200 && !/자가/.test(i.nm)).sort((a, b) => a.days - b.days).slice(0, 2);
      adv.push(['ok', `AL ${n0(C.dAL)}t 더 만들 수 있음. 판매를 더 받거나${low.length ? `, 재고가 얇은 ${low.map((i) => `${i.nm}(${Math.round(i.days)}일분)`).join(' · ')} 재고를 쌓을 수 있음` : ''}`]);
    }
    const ch = PS.simChanges().filter(([k]) => k.startsWith('L|') && k.endsWith(`|${m}|s`) || k.startsWith('L|') && k.endsWith(`|${m}|p`));
    const lab = (k) => { const [, r, , pp] = k.split('|'); const x = byR[r]; return `${(R.find((y) => y.kind === 'sec' && y.r === x.sec) || {}).name || ''} ${nm(x)} ${pp === 's' ? '판매' : '생산'}`; };
    const kp = (a, b, unit = 't') => `${n0(a)}에서 <b>${n0(b)}</b>${unit}로 (${sg(b - a)})`;
    const simBox = PS.simOn() ? `<div class="ps-sim"><b>시험 중</b> · 바꾼 칸 ${PS.simChanges().length}개 · 저장 안 됨
        <button type="button" class="btn" id="ps-sim-ok">이대로 반영</button><button type="button" class="btn sub" id="ps-sim-no">버리기</button>
        ${ch.length ? `<p class="ps-note">${ch.filter(([k]) => k.endsWith('|s')).map(([k, v]) => `${esc(lab(k))} ${n0(v)}t`).join(' · ')}</p>` : ''}
        <table class="psg simc"><thead><tr><th>강종</th><th>생산 필요</th><th>월차로 만들 수 있는 양</th><th>남음·부족</th></tr></thead><tbody>
        ${[['AZ', C0.T.AZ, C.T.AZ, C0.az, C.az], ['MAC', C0.T.MAC, C.T.MAC, C0.mac, C.mac], ['AL', C0.T.AL, C.T.AL, C0.al, C.al], ['도금 계', C0.need, C.need, C0.made, C.made]].map(([g, a0, a1, b0, b1]) => `<tr><td><b>${g}</b></td><td>${kp(a0, a1)}</td><td>${kp(b0, b1)}</td><td class="${b1 - a1 < -1 ? 'dn' : 'up'}">${sg(b0 - a0)}에서 <b>${sg(b1 - a1)}</b>t로</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="ps-ctl"><button type="button" class="btn" id="ps-sim-go">시험해 보기(저장 안 됨)</button><span class="ps-note">판매·재고 출하를 마음대로 바꿔 보고, 맞으면 [이대로 반영]</span></div>`;
    const card = (t, need, made, d, sub) => `<div class="${d < -1 ? 'bad' : 'ok'}"><span>${t}</span><b>${d < -1 ? '−' + n0(-d) : '+' + n0(d)}</b><em>필요 ${n0(need)} · 만들 수 있음 ${n0(made)}${sub ? ' · ' + sub : ''}</em></div>`;
    const head = [[{ v: '강종' }, { v: '판매그룹' }, { v: `월초 재고<br><small>${mL(pm)} 말</small>`, raw: true }, { v: '판매 계획' }, { v: '재고 출하<br><small>+ 재고에서 · − 쌓기</small>', raw: true }, { v: '생산<br><small>= 판매 − 재고 출하</small>', raw: true }, { v: '들어온 주문<br><small>이 달 생산 필요</small>', raw: true }, { v: '월말 재고' }, { v: '월말 재고<br><small>판매 며칠분</small>', raw: true }, { v: '판생 생산' }, { v: '판생 대비' }]];
    const GS = {}; for (const it of items) { const g = grpOf(it.x); (GS[g] = GS[g] || { s: 0, out: 0, p: 0, o1: 0, sf: 0, ord: 0, f: {} }); const z = GS[g]; z.s += it.c.s; z.out += it.out; z.p += it.c.p; z.o1 += it.o1; z.sf += it.c.sf; z.ord += ordOf(it.x); z.f[it.g] = (z.f[it.g] || 0) + it.c.p; }
    const grpHtml = `<div class="psg-w"><table class="psg"><thead><tr><th>판매그룹</th><th>월초 재고</th><th>판매 계획</th><th>재고 출하</th><th>생산</th><th>강종별 생산</th><th>들어온 주문</th><th>주문 확보율</th><th>월말 재고</th></tr></thead><tbody>${Object.entries(GS).sort((a, b) => b[1].p - a[1].p).map(([g, z]) => `<tr><td><b>${esc(g)}</b></td><td>${n0(z.o1)}</td><td>${n0(z.s)}</td><td>${sg(z.out)}</td><td><b>${n0(z.p)}</b></td><td>${Object.entries(z.f).filter(([, v]) => v).map(([f, v]) => `${f} ${n0(v)}`).join(' · ')}</td><td>${n0(z.ord)}</td><td class="${z.p && z.ord / z.p < 0.6 ? 'warn' : ''}">${z.p ? Math.round(z.ord / z.p * 100) + '%' : ''}</td><td>${n0(z.sf)}</td></tr>`).join('')}</tbody></table></div>`;
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 생산 결정 <small>판매 계획과 재고 출하를 넣으면 생산이 나오고, 도금 월차 능력으로 강종별 남음·부족을 바로 계산</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
        <div class="ps-k">${card('도금 계', C.need, C.made, C.made - C.need)}${card('AZ · 1CGL', C.T.AZ, C.az, C.dAZ)}${card('MAC · 2CGL', C.T.MAC, C.mac, C.dMAC)}${card('AL · 1·2CGL', C.T.AL, C.al, C.dAL, 'AZ·MAC 뒤 남는 날')}</div>
        ${simBox}
        <ul class="ps-chk">${adv.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>
        <h3 class="fh">판매그룹별</h3>${grpHtml}
        <h3 class="fh">강종 × 판매그룹 (입력)</h3>
        <div class="ps-ctl"><label>판매를 바꾸면 <select id="ps-fol"><option value="prod"${follow ? ' selected' : ''}>생산이 따라감(재고 출하 그대로)</option><option value="stock"${!follow ? ' selected' : ''}>재고가 받음(생산 그대로)</option></select></label></div>
        ${PSG.table({ id: 'td', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
    $('ps-fol').onchange = (e) => { st.follow = e.target.value; keep(); };
    if ($('ps-sim-go')) $('ps-sim-go').onclick = () => PS.simStart();
    if ($('ps-sim-no')) $('ps-sim-no').onclick = () => PS.simDrop();
    if ($('ps-sim-ok')) $('ps-sim-ok').onclick = () => { const n = PS.simCommit('생산 결정 시험 반영'); PSG.toast(`${n}칸 반영함`); };
  }
  /* 생산 결정 칸 규칙: X|줄|월 = 재고 출하 → 생산 = 판매 − 재고 출하 · 판매를 고치면 '생산이 따라감'이면 생산도 같은 만큼 */
  function decideSet(pairs, why) {
    const L = PS.ledger(), out = [];
    for (const [k, v] of pairs) {
      const p = k.split('|');
      if (p[0] === 'X') { const c = L[p[2]][p[1]]; out.push([`L|${p[1]}|${p[2]}|p`, v == null ? null : c.s - v]); }
      else if (p[0] === 'L' && p[3] === 's' && st.follow !== 'stock') { const c = L[p[2]][p[1]], nv = v == null ? PS.inputValue(k) : v; out.push([k, v]); out.push([`L|${p[1]}|${p[2]}|p`, c.p + ((v == null ? (((B0().ledger.v[p[2]] || {}).cells || {})[p[1]] || {}).s || 0 : nv) - c.s)]); }
      else out.push([k, v]);
    }
    PS.setMany(out, why);
  }
  const B0 = () => PS.base();

  /* ---------- 오늘 할 일(판생 대응, docs/44) — 주문 변경 → 영향 → 대안 → 채택 → 알림 문안 ---------- */
  const KN = { arr: '배 입항', dept: '배 출항', need: '생산 필요일', due: '납기', eta: '소재 입고 예정', qty: '주문 톤', new: '새 주문', gone: '목록에서 빠짐' };
  function today(B) {
    PS.pastMode = st.past === 'in' ? 'in' : 'out';   // 기본 = 빼고 봄(맨 위에 지난 납기 미생산 톤을 늘 보여 줌)
    const pastAll = (() => { const m = PS.pastMode; PS.pastMode = 'in'; const I = PS.items(); PS.pastMode = m; const r = {}; for (const it of I.items) if (it.k === 'o' && it.need < I.asOf) { const f = it.fam === 'STS' ? 'AL' : it.fam; r[f] = (r[f] || 0) + it.t; } return r; })();
    const C = PS.ctx(), CH = B.changes || { events: [], runs: [] }, E = CH.events || [];
    const lastRun = (CH.runs || []).slice(-1)[0], win = st.win || '3', since = win === 'run' && lastRun ? lastRun[0] : PS.addD(C.today, -(+win || 3)) + 'T00:00';
    const ev = E.filter((e) => e[0] >= since);
    // 주문마다 가장 최근 바뀜만(같은 판에서 입항·출항·필요일이 같이 바뀌면 입항을 이유로)
    const byCon = {}; for (const e of ev) { const [at, con, k] = e; const z = (byCon[con] = byCon[con] || {}); if (!z[k] || z[k][0] <= at) z[k] = e; }
    const cards = {};
    for (const [con, z] of Object.entries(byCon)) {
      const it = C.itemOf[con]; const main = z.arr || z.due || z.need || z.dept || z.new || z.eta || z.qty || z.gone; if (!main) continue;
      const [at, , k, fr, to, t, grp, fam, dst, man, shp] = main;
      if (k === 'gone') { (cards.gone = cards.gone || { k: 'gone', cons: [], t: 0 }); cards.gone.cons.push(con); cards.gone.t += t; continue; }
      if (!it) continue;
      if (k === 'eta') { const pd = (C.at[con] || [])[0]; if (!pd || to.slice(0, 10) <= pd.d) continue; }
      const key = k === 'new' ? `new|${grp}|${dst}|${it.fam}` : `${k}|${shp || dst}|${fr}|${to}|${it.fam}`;
      const cd = (cards[key] = cards[key] || { k, at, fr, to, grp: GRPN(grp), fam: it.fam, place: shp || dst, cons: [], t: 0, man: new Set() });
      cd.cons.push(con); cd.t += it.t; if (man) cd.man.add(man); if (at > cd.at) cd.at = at;
    }
    const list = Object.values(cards).filter((c) => c.k !== 'gone').map((c) => {
      const its = c.cons.map((x) => C.itemOf[x]), need = its.map((x) => x.need).sort()[0], cur = its.map((x) => (C.at[x.con] || []).slice(-1)[0]).filter(Boolean), last = cur.map((x) => x.d).sort().pop();
      const later = (c.k === 'arr' || c.k === 'dept' || c.k === 'need' || c.k === 'due') && c.to > c.fr;
      c.need = need; c.last = last; c.lateD = last ? Math.round((new Date(last) - new Date(need)) / 864e5) : null; c.later = later;
      const st0 = its.reduce((a, x) => a + (C.A.stockUsed[x.con] || 0), 0); c.fromStock = st0;
      c.state = st0 >= c.t * 0.95 ? '재고에서 출하' : !last ? '배정 없음' : c.lateD > 0 ? '지연 위험' : later && c.lateD < -7 ? '미뤄도 됨' : '맞음';
      c.rank = c.state === '지연 위험' ? 0 : c.state === '배정 없음' ? 1 : c.state === '미뤄도 됨' ? 2 : 3;
      return c; }).sort((a, b) => a.rank - b.rank || b.t - a.t);
    const nRisk = list.filter((c) => c.rank <= 1), tRisk = nRisk.reduce((a, c) => a + c.t, 0);
    const shown = list.filter((c) => st.only !== 'risk' || c.rank <= 2).slice(0, st.more ? 200 : 25);
    const card = (c, i) => {
      const title = c.k === 'new' ? `${esc(c.grp)} 새 주문 · ${esc(c.place)}` : `${esc(c.grp)} · ${esc(c.place)} ${KN[c.k]} <b class="dt">${md(c.fr.slice(0, 10))}</b>에서 <b class="dt">${md(c.to.slice(0, 10))}</b>로 ${c.to > c.fr ? '늦춰짐' : '당겨짐'}`;
      let body = c.state === '재고에서 출하' ? `<p>같은 사양 재고(${esc((B.stockLots || {}).month || '')})로 나감 · ${n0(c.fromStock)}t · 새로 만들 것 없음</p>` : `<p>${c.fromStock ? `같은 사양 재고 ${n0(c.fromStock)}t 는 재고로 · ` : ''}지금 순서: ${c.last ? `<b class="dt">${md(c.last)}</b>까지 생산` : '<b class="dn">생산 계획에 없음</b>'} · 생산 필요일 <b class="dt">${md(c.need)}</b>${c.lateD > 0 ? ` · <em class="dn">${c.lateD}일 지연</em>` : c.lateD != null && c.lateD < 0 ? ` · ${-c.lateD}일 여유` : ''}</p>`;
      let opts = [];
      if (c.state === '지연 위험' || c.state === '배정 없음') { const O = PS.options(C, c.cons, c.need); opts = O.opts; }
      else if (c.state === '미뤄도 됨') { const F = PS.fillers(C, c.cons, c.last), fam = c.fam, ln = linesForP(c);
        const late = Object.keys(C.A.out).filter((k) => ln.includes(k.split('|')[0]) && C.A.out[k].g === fam && k.split('|')[1] <= c.need && k.split('|')[1] > c.last).map((k) => k.split('|')[1]).sort().pop();
        if (late) opts.push({ kind: '미루기', txt: `${md(late)}로 미룸(새 필요일 ${md(c.need)})${F.length ? `, 빈 자리에 ${F.map((f) => `${f.it.grp} ${f.it.who === '컬러 투입' ? f.it.cus : f.it.who} ${n0(f.it.t)}t(${f.late > 0 ? f.late + '일 지연 중' : '필요 ' + md(f.it.need)})`).join(' · ')} 당겨옴` : ''}`,
          pins: c.cons.map((x) => [x, late]).concat(F.map((f) => [f.it.con, c.last])), moved: F.map((f) => ({ con: f.it.con, from: f.pd ? f.pd.d : '', to: c.last, slack: null, grp: f.it.grp, who: f.it.who === '컬러 투입' ? f.it.cus : f.it.who, man: f.it.man, t: f.it.t })), lock: c.last <= C.lockEnd }); }
      const optHtml = opts.map((o, j) => `<div class="op${j ? '' : ' rec'}"><b>${j ? '다른 안' : '추천'} · ${o.kind}</b> ${esc(o.txt)}${o.lock ? ' <span class="lk">이번 주 작업지시 구간이라 작업지시 담당 확인</span>' : ''}
        ${o.pins.length ? `<button type="button" class="btn sm" data-acc="${i}|${j}">채택</button>` : ''}</div>`).join('');
      return `<div class="tc ${c.rank === 0 ? 'risk' : c.rank === 1 ? 'warn' : ''}"><div class="th">${title} <span class="ps-note">${c.cons.length}건 ${n0(c.t)}t · ${c.fam === 'STS' ? 'AL-STS' : c.fam} · 담당 ${esc([...c.man].join(', ') || '미정')} · ${esc(String(c.at).slice(5, 16).replace('T', ' '))} 자료</span> <b class="st">${c.state}</b></div>${body}${optHtml}
        <details><summary>주문 ${c.cons.length}건</summary>${c.cons.map((x) => { const it = C.itemOf[x], pd = (C.at[x] || []).slice(-1)[0]; return `<div class="ln">${esc(x)} · ${it.thk ? it.thk + '×' + it.wdt : ''} · ${n0(it.t)}t · 필요 ${md(it.need)} · 지금 ${pd ? `${pd.l} ${md(pd.d)}` : '없음'}</div>`; }).join('')}</details></div>`;
    };
    st._opts = shown.map((c) => (c.state === '미뤄도 됨' ? null : c));
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>오늘 할 일 <small>주문 자료가 2시간마다 들어올 때 바로 전 자료와 비교해 바뀐 것을 찾고, 지금 생산 순서에서의 영향과 대안을 계산</small></h2>
        <div class="ps-k"><div class="${nRisk.length ? 'bad' : 'ok'}"><span>지연 위험·배정 없음</span><b>${nRisk.length}건</b><em>${n0(tRisk)}t</em></div><div><span>바뀐 주문</span><b>${Object.keys(byCon).length}</b><em>${list.length}묶음</em></div><div><span>미뤄도 되는 묶음</span><b>${list.filter((c) => c.rank === 2).length}</b><em>빈 자리에 다른 주문</em></div><div><span>이번 주 잠금</span><b>${md(C.lockEnd)}</b><em>작업지시 확정 구간</em></div></div>
        <ul class="ps-chk"><li class="warn">출발점 확인: 필요일이 지났는데 아직 안 만든 주문(${md(PS.prevM(C.today.slice(0, 7)) + '-01')} 이후 필요분) AZ ${n0(pastAll.AZ || 0)}t · MAC ${n0(pastAll.MAC || 0)}t · AL ${n0(pastAll.AL || 0)}t. 이걸 다 새로 만들어야 하면 앞으로 순서가 밀림. 재고로 나간 것·보류는 빼야 정확</li></ul>
        <div class="ps-ctl"><label>지난 납기 미생산 <select id="ps-past"><option value="in"${PS.pastMode === 'in' ? ' selected' : ''}>생산할 것으로 넣음</option><option value="out"${PS.pastMode === 'out' ? ' selected' : ''}>빼고 봄(결정한 주문만 넣음)</option></select></label>
          <label>기간 <select id="ps-win">${[['run', '마지막 갱신'], ['1', '어제부터'], ['3', '3일'], ['7', '7일'], ['14', '14일']].map(([v, t]) => `<option value="${v}"${win === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>보기 <select id="ps-only"><option value="">전부</option><option value="risk"${st.only === 'risk' ? ' selected' : ''}>할 일만</option></select></label></div></section>
      <section class="card"><h2>직접 묻기 <small>계약번호·목적지·배 이름 일부와 원하는 생산 완료일을 넣으면 가능한지와 방법</small></h2>
        <div class="ps-ctl"><input id="ask-q" placeholder="예: MUMBAI 또는 PGXXKM26A019" value="${esc(st.askQ || '')}" style="min-width:280px"><input type="date" id="ask-d" value="${esc(st.askD || '')}"><button type="button" class="btn" id="ask-go">묻기</button></div>
        <div id="ask-out"></div></section>
      <section class="card"><h2>바뀐 것과 대안 <small>지연 위험 먼저 · 추천 순서: 지연 없음, 밀리는 주문의 여유 큰 것(주문 없는 판매계획분 먼저), 이번 주 작업지시 구간은 가급적 안 건드림</small></h2>
        ${shown.map(card).join('') || '<p class="ps-chk">이 기간 바뀐 것 없음</p>'}
        ${list.length > shown.length ? `<div class="ps-ctl"><button type="button" class="btn sub" id="ps-more">나머지 ${list.length - shown.length}묶음 보기</button></div>` : ''}
        ${cards.gone ? `<p class="ps-note">목록에서 빠진 주문 ${cards.gone.cons.length}건 ${n0(cards.gone.t)}t(생산 끝·취소·변경)</p>` : ''}</section>
      <section class="card" id="ps-note-card"${st.note ? '' : ' hidden'}><h2>알림 문안 <small>채택한 내용 · 그룹·담당자에게 복사해서 보내기</small></h2><textarea id="ps-note" rows="8" style="width:100%;font:inherit;font-size:15px">${esc(st.note || '')}</textarea><div class="ps-ctl"><button type="button" class="btn sub" id="ps-note-x">지우기</button></div></section>`;
    if ($('ps-note-x')) $('ps-note-x').onclick = () => { st.note = ''; keep(); draw(); };
    if (st.note && st.noteJump) { st.noteJump = 0; setTimeout(() => $('ps-note-card').scrollIntoView({ block: 'center' }), 50); }
    $('ps-win').onchange = (e) => { st.win = e.target.value; keep(); draw(); };
    $('ps-past').onchange = (e) => { st.past = e.target.value; keep(); draw(); };
    $('ps-only').onchange = (e) => { st.only = e.target.value; keep(); draw(); };
    if ($('ps-more')) $('ps-more').onclick = () => { st.more = 1; draw(); };
    const accept = (c, o) => { const note = () => 0; PS.setMany(o.pins.map(([con, d]) => [`D|${con}`, `d:${d}`]), `판생 대응: ${c.k === 'new' ? '새 주문' : KN[c.k] + ' 바뀜'} ${c.place || ''} ${o.kind}`);
      const lines = [`[판생] ${c.grp} ${c.place || ''} ${c.k === 'new' ? '새 주문' : `${KN[c.k]} ${md(c.fr.slice(0, 10))}에서 ${md(c.to.slice(0, 10))}로 바뀜`} ${c.cons.length}건 ${n0(c.t)}t`, `조치(${o.kind}): ${o.txt}`,
        ...o.moved.map((m) => `· ${m.grp} ${m.who} ${m.con} ${n0(m.t)}t: ${m.from ? md(m.from) : '미정'}에서 ${md(m.to)}로 생산 변경${m.slack != null && m.slack < 999 ? `(납기 여유 ${m.slack}일)` : ''}, 담당 ${m.man || '미정'}`)];
      st.note = (st.note ? st.note + '\n\n' : '') + lines.join('\n'); st.noteJump = 1; keep(); draw(); };
    document.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => { const [i, j] = b.dataset.acc.split('|').map(Number), c = shown[i]; let o;
      if (c.state === '미뤄도 됨') { o = null; } const os = c.state === '지연 위험' || c.state === '배정 없음' ? PS.options(C, c.cons, c.need).opts : null; o = os ? os[j] : null;
      if (!o) { const F = PS.fillers(C, c.cons, c.last), ln = linesForP(c), late = Object.keys(C.A.out).filter((k) => ln.includes(k.split('|')[0]) && C.A.out[k].g === c.fam && k.split('|')[1] <= c.need && k.split('|')[1] > c.last).map((k) => k.split('|')[1]).sort().pop();
        o = { kind: '미루기', txt: `${md(late)}로 미룸`, pins: c.cons.map((x) => [x, late]).concat(F.map((f) => [f.it.con, c.last])), moved: F.map((f) => ({ con: f.it.con, from: f.pd ? f.pd.d : '', to: c.last, grp: f.it.grp, who: f.it.who === '컬러 투입' ? f.it.cus : f.it.who, man: f.it.man, t: f.it.t })) }; }
      accept(c, o); }));
    $('ask-go').onclick = () => { st.askQ = $('ask-q').value.trim(); st.askD = $('ask-d').value; keep(); ask(C); };
    if (st.askQ && st.askD) ask(C);
  }
  const linesForP = (c) => (c.fam === 'AZ' ? ['1CGL'] : c.fam === 'MAC' || c.fam === 'STS' ? ['2CGL'] : ['1CGL', '2CGL']);
  function ask(C) {
    const q = (st.askQ || '').toUpperCase(), d = st.askD, o = $('ask-out'); if (!q || !d) { o.innerHTML = '<p class="ps-note">무엇을(계약번호·목적지·배 이름)과 날짜를 넣어 주세요</p>'; return; }
    const hit = Object.values(C.itemOf).filter((it) => [it.con, it.who, it.dst, it.cus, it.why].some((x) => String(x || '').toUpperCase().includes(q)));
    if (!hit.length) { o.innerHTML = '<p class="ps-note">맞는 미생산 주문 없음</p>'; return; }
    const byF = {}; for (const it of hit) (byF[it.fam] = byF[it.fam] || []).push(it.con);
    o.innerHTML = Object.entries(byF).map(([f, cons]) => { const R = PS.options(C, cons, d), t = cons.reduce((a, c) => a + C.itemOf[c].t, 0);
      const head = `<b>${f === 'STS' ? 'AL-STS' : f} ${cons.length}건 ${n0(t)}t</b> · 가동 ${R.hrs ? R.hrs.toFixed(1) : '-'}시간 · 지금 순서 ${R.last ? `${md(R.last)}까지` : '계획 없음'}`;
      const ans = R.state === 'ok' ? '<b class="up">가능: 지금 순서로 맞음</b>' : R.opts.length && !R.opts[0].needSw ? '<b class="warn">조건부 가능</b>' : '<b class="dn">지금 자리로는 어려움</b>';
      return `<div class="tc"><div class="th">${ans} · ${head} · ${md(d)}까지</div>${R.opts.map((x, j) => `<div class="op${j ? '' : ' rec'}"><b>${j ? '다른 안' : '추천'} · ${x.kind}</b> ${esc(x.txt)}${x.lock ? ' <span class="lk">이번 주 작업지시 구간이라 작업지시 담당 확인</span>' : ''}${x.pins.length ? ` <button type="button" class="btn sm" data-ask="${f}|${j}">채택</button>` : ''}</div>`).join('')}</div>`; }).join('');
    o.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => { const [f, j] = b.dataset.ask.split('|'); const R = PS.options(C, byF[f], d), x = R.opts[+j]; PS.setMany(x.pins.map(([con, dd]) => [`D|${con}`, `d:${dd}`]), `판생 대응: 직접 묻기 ${st.askQ} ${md(d)}까지 ${x.kind}`);
      st.noteJump = 1; st.note = (st.note ? st.note + '\n\n' : '') + [`[판생] ${st.askQ} ${f} ${n0(R.t)}t ${md(d)}까지 생산 요청`, `조치(${x.kind}): ${x.txt}`, ...x.moved.map((m) => `· ${m.grp} ${m.who} ${m.con} ${n0(m.t)}t: ${md(m.from)}에서 ${md(m.to)}로 생산 변경(납기 여유 ${m.slack}일), 담당 ${m.man || '미정'}`)].join('\n'); keep(); draw(); }));
  }

  /* ---------- 주문 전체(11/19 사용자 '실제 계약번호들도 전부 다') — 미생산 도금 주문 하나하나: 언제·어느 라인·지연·재고로·배정 없음 ---------- */
  function orders(B) {
    PS.pastMode = st.past === 'in' ? 'in' : 'out';
    const C = PS.ctx(), IT0 = (() => { const m = PS.pastMode; PS.pastMode = 'in'; const I = PS.items(); PS.pastMode = m; return I; })();
    const rows = [];
    for (const it of IT0.items) { if (it.k !== 'o') continue;
      const pd = C.at[it.con] || [], last = pd.length ? pd[pd.length - 1].d : '', first = pd.length ? pd[0].d : '', stk = C.A.stockUsed[it.con] || 0, past = PS.pastMode === 'out' && it.need < C.today && !it.dec;
      const late = last ? Math.round((new Date(last) - new Date(it.need)) / 864e5) : null;
      const state = past ? '지난 납기(빼고 봄)' : stk >= it.t * 0.95 ? '재고에서 출하' : !last ? '배정 없음' : late > 0 ? `${late}일 지연` : '맞음';
      rows.push({ it, pd, first, last, late, stk, state, lines: [...new Set(pd.map((x) => x.l))].join('·') }); }
    for (const o of IT0.stale) rows.push({ it: { con: o[0], grp: GRPN(o[3]), fam: o[2], t: o[4], need: o[13] || o[6], who: o[9], cus: o[18], thk: +o[20] || 0, wdt: +o[21] || 0, cot: o[22], aft: o[23], why: `납기 ${o[6] ? md(o[6]) : ''}`, man: o[8] }, pd: [], state: '오래된 미생산', late: null, stk: 0, lines: '' });
    const q = (st.oq || '').toUpperCase(), fg = st.og || '', ff = st.of || '', fs = st.os || '';
    const vis = rows.filter((r) => (!q || [r.it.con, r.it.who, r.it.cus, r.it.dst, r.it.why, r.it.man].some((x) => String(x || '').toUpperCase().includes(q))) && (!fg || r.it.grp === fg) && (!ff || r.it.fam === ff)
      && (!fs || (fs === 'late' ? /지연|배정 없음/.test(r.state) : fs === 'stock' ? r.state === '재고에서 출하' : fs === 'past' ? /지난|오래된/.test(r.state) : r.state === '맞음')))
      .sort((a, b) => (a.first || '9999') < (b.first || '9999') ? -1 : (a.first || '9999') > (b.first || '9999') ? 1 : a.it.need < b.it.need ? -1 : 1);
    const sum = (f) => rows.filter(f).reduce((a, r) => a + r.it.t, 0), cnt = (f) => rows.filter(f).length;
    const groups = [...new Set(rows.map((r) => r.it.grp))].sort();
    const LIM = st.oall ? 3000 : 300;
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>주문 전체 <small>미생산 도금 주문 ${n0(rows.length)}건(${esc(B.ordersAsOf || '')}) · 생산 예정 = 지금 생산 순서(사양 톤파워·그룹 생산량·결정 반영) · 계약번호·고객·목적지·배·담당으로 찾기</small></h2>
        <div class="ps-k"><div><span>맞음</span><b>${n0(cnt((r) => r.state === '맞음'))}</b><em>${n0(sum((r) => r.state === '맞음'))}t</em></div><div class="bad"><span>지연·배정 없음</span><b>${n0(cnt((r) => /지연|배정 없음/.test(r.state)))}</b><em>${n0(sum((r) => /지연|배정 없음/.test(r.state)))}t</em></div><div><span>재고에서 출하</span><b>${n0(cnt((r) => r.state === '재고에서 출하'))}</b><em>${n0(sum((r) => r.state === '재고에서 출하'))}t</em></div><div class="warn"><span>지난 납기·오래된 미생산</span><b>${n0(cnt((r) => /지난|오래된/.test(r.state)))}</b><em>${n0(sum((r) => /지난|오래된/.test(r.state)))}t</em></div></div>
        <div class="ps-ctl"><input id="o-q" placeholder="계약번호·고객·목적지·배·담당" value="${esc(st.oq || '')}" style="min-width:260px">
          <select id="o-g"><option value="">그룹 전부</option>${groups.map((g) => `<option${fg === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>
          <select id="o-f"><option value="">강종 전부</option>${['AZ', 'MAC', 'AL', 'STS'].map((f) => `<option value="${f}"${ff === f ? ' selected' : ''}>${f === 'STS' ? 'AL-STS' : f}</option>`).join('')}</select>
          <select id="o-s"><option value="">상태 전부</option>${[['late', '지연·배정 없음'], ['ok', '맞음'], ['stock', '재고에서 출하'], ['past', '지난 납기·오래된']].map(([v, t]) => `<option value="${v}"${fs === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <label>지난 납기 미생산 <select id="o-p"><option value="out"${PS.pastMode === 'out' ? ' selected' : ''}>빼고 봄</option><option value="in"${PS.pastMode === 'in' ? ' selected' : ''}>생산할 것으로 넣음</option></select></label>
          <span class="ps-note">${n0(vis.length)}건 ${n0(vis.reduce((a, r) => a + r.it.t, 0))}t</span></div>
        <div class="psg-w"><table class="psg why ord"><thead><tr><th>생산 예정</th><th>라인</th><th>계약번호</th><th>그룹</th><th>고객·목적지</th><th>강종</th><th>사이즈</th><th>도금량·후처리</th><th>톤</th><th>생산 필요일 · 이유</th><th>상태</th><th>담당</th><th>결정</th></tr></thead><tbody>
        ${vis.slice(0, LIM).map((r) => `<tr class="${/지연|배정 없음/.test(r.state) ? 'late' : ''}"><td>${r.first ? `<b class="dt">${md(r.first)}</b>${r.last !== r.first ? `~${md(r.last)}` : ''}` : ''}</td><td>${esc(r.lines)}</td><td>${esc(r.it.con)}</td><td><b>${esc(r.it.grp)}</b></td><td>${esc(r.it.who === '컬러 투입' ? r.it.cus : r.it.who || r.it.cus || '')}</td><td>${r.it.fam === 'STS' ? 'AL-STS' : esc(r.it.fam)}</td><td>${r.it.thk ? `${r.it.thk}×${r.it.wdt}` : ''}</td><td>${esc([r.it.cot, r.it.aft].filter(Boolean).join(' · '))}</td><td>${n0(r.it.t)}</td><td class="wrap"><b class="dt">${r.it.need ? md(r.it.need) : ''}</b> · ${esc(r.it.why || '')}</td><td class="${/지연|배정 없음/.test(r.state) ? 'dn' : ''}">${esc(r.state)}</td><td>${esc(r.it.man || '')}</td>
          <td>${r.state === '오래된 미생산' ? '' : `<select class="decs" data-con="${esc(r.it.con)}">${[['', '자동'], ['in', '이번 달 꼭'], ['stock', '재고에서 출하'], ['next', '다음 달로']].map(([x, t]) => `<option value="${x}"${(r.it.dec || '') === x ? ' selected' : ''}>${t}</option>`).join('')}${r.it.dec && r.it.dec.startsWith('d:') ? `<option selected value="${esc(r.it.dec)}">${md(r.it.dec.slice(2))} 고정</option>` : ''}</select>`}</td></tr>`).join('')}</tbody></table></div>
        ${vis.length > LIM ? `<div class="ps-ctl"><button type="button" class="btn sub" id="o-all">나머지 ${n0(vis.length - LIM)}건 보기</button></div>` : ''}</section>`;
    let tm; $('o-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { st.oq = e.target.value; keep(); draw(); const x = $('o-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 400); };
    $('o-g').onchange = (e) => { st.og = e.target.value; keep(); draw(); }; $('o-f').onchange = (e) => { st.of = e.target.value; keep(); draw(); };
    $('o-s').onchange = (e) => { st.os = e.target.value; keep(); draw(); }; $('o-p').onchange = (e) => { st.past = e.target.value; keep(); draw(); };
    if ($('o-all')) $('o-all').onclick = () => { st.oall = 1; draw(); };
    document.querySelectorAll('select.decs').forEach((b) => b.addEventListener('change', () => PS.set(`D|${b.dataset.con}`, b.value || null, `주문 결정: ${b.selectedOptions[0].textContent}`)));
  }

  /* ---------- 주문 맞추기(docs/43 M1·M2) — 그룹×강종: 생산(판생 계획표) vs 이 달 생산 필요 주문, 주문마다 사양·가동시간·소재·같은 사양 재고, 사람이 이번 달/재고/다음 달 결정 ---------- */
  function fit(B) {
    const L = PS.ledger(), IT = PS.items(L), ms = B.months.filter((x) => x >= IT.m0); if (!ms.includes(st.m)) st.m = ms[1] || ms[0];
    const m = st.m, R = B.ledger.rows, FN = (f) => (f === 'STS' ? 'AL-STS' : f);
    const lineOf = (it) => it.line || (it.fam === 'AZ' ? '1CGL' : '2CGL');
    const lots = ((B.stockLots || {}).rows) || [];
    const stockFor = (it) => { let ex = 0, nr = 0; for (const [g, f, th, wd, , , t] of lots) { if (g !== it.grp || f !== it.fam || !it.thk) continue; const dt = Math.abs(th - it.thk), dw = Math.abs(wd - it.wdt); if (dt <= 0.005 && dw <= 5) ex += t; else if (dt <= 0.05 && dw <= 50) nr += t; } return { ex, nr }; };
    // 그룹×강종 묶음
    const G = {};
    for (const [k, q] of Object.entries(IT.quota)) if (k.startsWith(m + '|')) { const [, g, f] = k.split('|'); (G[`${g}|${f}`] = G[`${g}|${f}`] || { g, f, q: 0, its: [], stock: 0 }).q += q; }
    for (const it of IT.items) if (it.m === m && it.k === 'o') { const k = `${it.grp}|${it.fam}`; (G[k] = G[k] || { g: it.grp, f: it.fam, q: 0, its: [], stock: 0 }).its.push(it); }
    for (const [k, v] of Object.entries(IT.stockUse)) if (k.startsWith(m + '|')) { const [, g, f] = k.split('|'); if (G[`${g}|${f}`]) G[`${g}|${f}`].stock += v; }
    // 다음 달로 넘긴 것(이 달 생산 필요였는데 'next')
    const pushed = {}; for (const o of B.orders) { const d = PS.get(`D|${o[0]}`, null); if (d !== 'next') continue; const it = IT.items.find((x) => x.con === o[0]); if (it && PS.prevM(it.m) === m) { const k = `${it.grp}|${it.fam}`; pushed[k] = (pushed[k] || 0) + it.t; } }
    for (const v of Object.values(G)) { v.its.sort((a, b) => (a.must !== b.must ? (a.must ? -1 : 1) : a.need < b.need ? -1 : 1)); let c = 0; for (const it of v.its) { if (it.must) { it.auto = '이번 달(결정)'; c += it.t; continue; } c += it.t; it.auto = c <= v.q + 0.5 ? '이번 달' : '넘침'; } v.ord = v.its.reduce((a, it) => a + it.t, 0); v.over = Math.max(0, v.ord - v.q); v.gap = Math.max(0, v.q - v.ord); }
    const keys = Object.keys(G).filter((k) => G[k].q > 0 || G[k].ord > 0).sort((a, b) => (G[b].over - G[a].over) || (G[b].gap - G[a].gap));
    if (!keys.includes(st.fk)) st.fk = keys[0];
    const sumRows = keys.map((k) => { const v = G[k]; return `<tr class="${k === st.fk ? 'on' : ''}" data-fk="${esc(k)}"><td><b>${esc(v.g)}</b></td><td><span class="sq ${v.f.toLowerCase()}">${FN(v.f)}</span></td><td>${n0(v.q)}</td><td>${n0(v.ord)}</td><td class="${v.over > 30 ? 'dn' : ''}">${v.over > 30 ? '+' + n0(v.over) : ''}</td><td class="${v.gap > 30 ? 'warn' : ''}">${v.gap > 30 ? n0(v.gap) : ''}</td><td>${v.stock ? n0(v.stock) : ''}</td><td>${pushed[k] ? n0(pushed[k]) : ''}</td><td>${v.over > 30 ? '<b class="dn">뺄 것 고르기</b>' : v.gap > 30 ? '<b class="warn">주문 받아야</b>' : '맞음'}</td></tr>`; }).join('');
    const v = G[st.fk] || { its: [], q: 0, ord: 0, g: '', f: 'AL' };
    const bandSum = (its, pick) => { const b = {}; for (const it of its.filter(pick)) { const k = it.thk ? PS.band(it.thk) : '사양 미정', tp = PS.tph(lineOf(it), it.fam, it.thk, it.wdt) || 30; (b[k] = b[k] || { t: 0, h: 0 }); b[k].t += it.t; b[k].h += it.t / tp; } return [...PS.BANDS, '사양 미정'].filter((k) => b[k]).map((k) => `${k} ${n0(b[k].t)}t(${(b[k].h / 24).toFixed(1)}일)`).join(' · '); };
    const rows = v.its.map((it, i) => { const sk = stockFor(it), tp = PS.tph(lineOf(it), it.fam, it.thk, it.wdt) || 30;
      return `<tr class="${it.auto === '넘침' && !it.dec ? 'over' : ''}"><td>${i + 1}</td><td>${esc(it.con)}</td><td>${esc(it.who === '컬러 투입' ? it.cus : it.who)}</td><td>${it.thk ? `${it.thk}×${it.wdt}` : ''}<br><small>${it.thk ? PS.band(it.thk) : ''}</small></td><td>${esc([it.cot, it.aft].filter(Boolean).join(' · '))}</td><td>${n0(it.t)}</td><td>${(it.t / tp).toFixed(1)}시간<br><small>${Math.round(tp)}t/시간</small></td><td class="wrap">${md(it.need)}까지 · ${esc(it.why)}</td><td>${it.ready ? `입고 예정 ${md(it.ready)}` : it.eta ? `입고 ${md(it.eta)}` : '<span class="ps-note">정보 없음</span>'}</td><td>${sk.ex ? `<b>같은 사양 ${n0(sk.ex)}t</b>` : ''}${sk.nr ? `${sk.ex ? '<br>' : ''}비슷(두께±0.05·폭±50) ${n0(sk.nr)}t` : ''}</td><td><b class="${it.auto === '넘침' ? 'dn' : ''}">${it.auto}</b></td>
        <td><select class="decs" data-con="${esc(it.con)}">${[['', '자동'], ['in', '이번 달 꼭'], ['stock', '재고에서 출하'], ['next', '다음 달로']].map(([x, t]) => `<option value="${x}"${(it.dec || '') === x ? ' selected' : ''}>${t}</option>`).join('')}</select></td></tr>`; }).join('');
    const ph = IT.items.filter((it) => it.k === 'p' && it.m === m && `${it.grp}|${it.fam}` === st.fk);
    const phTxt = ph.length ? (() => { const bb = {}; for (const it of ph) { const k = it.why.match(/(\d)반순/)[1]; (bb[k] = bb[k] || { t: 0, need: it.need, sp: [] }).t += it.t; if (it.band) bb[k].sp.push(`${it.band} ${it.thk}×${it.wdt}`); } return Object.entries(bb).map(([k, z]) => `<li>${k}반순 ${n0(z.t)}t · 보통 사양 ${[...new Set(z.sp)].slice(0, 2).join(', ')} · 생산 필요 ${md(z.need)} · <b>주문 마감(소재 리드 약 35일) ${md(PS.addD(z.need, -35))}</b></li>`).join(''); })() : '';
    const leaf = R.filter((x) => L[m] && L[m][x.r] && L[m][x.r].in && PS.famOfRow(x) === v.f && PS.grpOfRow(x) === v.g).sort((a, b) => L[m][b.r].p - L[m][a.r].p)[0];
    const decT = (d) => v.its.filter((it) => it.dec === d).reduce((a, it) => a + it.t, 0);
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 주문 맞추기 <small>그룹×강종: 생산(생산 결정) vs 생산 필요일이 이 달인 미생산 주문(${esc(B.ordersAsOf)}, 밀린 것 포함). 넘치면 무엇을 뺄지, 비면 무엇을 받을지</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
        <div class="psg-w"><table class="psg fitS"><thead><tr><th>그룹</th><th>강종</th><th>생산</th><th>주문</th><th>넘침</th><th>주문 부족</th><th>재고로</th><th>다음 달로</th><th>할 일</th></tr></thead><tbody>${sumRows}</tbody></table></div></section>
      <section class="card"><h2>${esc(v.g)} ${FN(v.f)} · 생산 ${n0(v.q)}t · 주문 ${n0(v.ord)}t ${v.over > 30 ? `<b class="dn">넘침 ${n0(v.over)}t</b>` : v.gap > 30 ? `<b class="warn">주문 부족 ${n0(v.gap)}t</b>` : ''}</h2>
        <ul class="ps-chk"><li>주문 사양: ${bandSum(v.its, () => true) || '없음'}</li><li>이 중 자동 이번 달: ${bandSum(v.its, (it) => it.auto !== '넘침') || '없음'}</li>
          ${v.over > 30 ? `<li class="bad">넘친 ${n0(v.over)}t: ① 같은 사양 재고가 있는 주문은 '재고에서 출하' ② 필요일이 늦거나 소재가 월말 입고인 주문은 '다음 달로' ③ 꼭 이번 달이면 '이번 달 꼭' 후 아래 [생산량 맞춤] (그만큼 다른 그룹·강종을 줄여야 하는지는 생산 결정 화면 위 카드)</li>` : ''}</ul>
        <div class="ps-ctl">${leaf && v.over > 30 ? `<button type="button" class="btn" id="fit-up">생산량을 주문에 맞춤: ${esc(LB(leaf.lab))} 생산 +${n0(v.over)}t</button>` : ''}${leaf && decT('stock') ? `<button type="button" class="btn sub" id="fit-st">재고에서 출하 ${n0(decT('stock'))}t 를 ${esc(LB(leaf.lab))} 재고 출하에 반영(생산 −${n0(decT('stock'))}t)</button>` : ''}</div>
        <div class="psg-w"><table class="psg why fit"><thead><tr><th>순서</th><th>계약번호</th><th>고객·목적지</th><th>사이즈</th><th>도금량·후처리</th><th>톤</th><th>가동</th><th>생산 필요일 · 이유</th><th>소재</th><th>같은 사양 재고<br><small>${esc((B.stockLots || {}).month || '')} 말</small></th><th>자동 판정</th><th>결정</th></tr></thead><tbody>${rows || '<tr><td colspan="12">이 달 생산 필요 주문 없음</td></tr>'}</tbody></table></div>
        ${phTxt ? `<h3 class="fh">아직 주문이 없는 생산량(주문 부족) — 그룹에 요청할 것</h3><ul class="ps-chk">${phTxt}</ul>` : ''}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
    document.querySelectorAll('tr[data-fk]').forEach((r) => r.addEventListener('click', () => { st.fk = r.dataset.fk; keep(); draw(); }));
    document.querySelectorAll('select.decs').forEach((b) => b.addEventListener('change', () => PS.set(`D|${b.dataset.con}`, b.value || null, `주문 결정: ${b.selectedOptions[0].textContent}`)));
    if ($('fit-up')) $('fit-up').onclick = () => PS.set(`L|${leaf.r}|${m}|p`, L[m][leaf.r].p + Math.round(v.over), `주문 맞추기: ${v.g} ${FN(v.f)} 생산을 주문에 맞춤`);
    if ($('fit-st')) $('fit-st').onclick = () => PS.set(`L|${leaf.r}|${m}|p`, L[m][leaf.r].p - Math.round(decT('stock')), `주문 맞추기: ${v.g} ${FN(v.f)} 재고 출하분만큼 생산 줄임`);
  }

  /* ---------- 판생 계획표 ---------- */
  function ledger(B) {
    const ms = B.months, i0 = Math.max(0, ms.indexOf(st.m0 || ms[1])), M = ms.slice(i0, i0 + 4), L = PS.ledger();
    const revs = PS.revs(), cmpRev = typeof st.cmp === 'string' ? revs.find((r) => r.at === st.cmp) : null, LR = cmpRev ? PS.ledger(PS.overAt(cmpRev.at)) : null;
    const baseNm = (m) => (cmpRev ? cmpRev.name : ((B.ledger.v[m] || {}).base || [])[st.cmp] || '기준');
    const has = (m) => LR || Object.values((B.ledger.v[m] || {}).cells || {}).some((c) => ((c.bp || [])[st.cmp] || 0) !== 0);   // 판생 엑셀에 아직 안 채운 달(예: 2월 이후 판생 발표)은 비교 칸을 비움
    const cmpV = (m, r) => (LR ? LR[m][r].p : has(m) ? ((((B.ledger.v[m] || {}).cells || {})[r] || {}).bp || [])[st.cmp] : null);
    const head = [[{ v: '강종', rs: 2 }, { v: '구분', rs: 2 }, ...M.flatMap((m) => [{ v: `${mL(m)}`, cs: 5, cls: 'mb' }])],
      M.flatMap((m) => [{ v: '생산', cls: 'mb' }, { v: has(m) ? baseNm(m) : `${baseNm(m)}(없음)` }, { v: '증감' }, { v: '판매' }, { v: '재고 전망' }])];
    const rows = B.ledger.rows.map((x) => {
      const isIn = L[M[0]][x.r] && L[M[0]][x.r].in, ind = x.kind === 'dept' ? '　　' : x.kind === 'mkt' ? '　' : '';
      const cells = [{ v: x.kind === 'sec' || x.kind === 'sum' ? (x.kind === 'sum' ? '합계' : x.name) : '', t: 'lab' }, { v: ind + LB(x.lab) + (x.hid ? ' (숨김 줄)' : ''), t: 'lab' }];
      for (const m of M) {
        const c = L[m][x.r], cv = cmpV(m, x.r), d = cv == null ? null : c.p - cv;
        cells.push({ v: c.p, t: 'calc', cls: 'mb', fx: isIn ? `= 생산 결정에서 입력한 값 ${n0(c.p)}` : `= 아래 줄 생산 합 ${n0(c.p)}` });
        cells.push({ v: cv, t: 'auto' });
        cells.push({ v: d, f: 'sg', cls: d > 0 ? 'up' : d < 0 ? 'dn' : '' });
        cells.push({ v: c.s, t: 'calc', fx: isIn ? `= 생산 결정에서 입력한 판매 ${n0(c.s)}` : `= 아래 줄 판매 합 ${n0(c.s)}` });
        cells.push({ v: c.sf, cls: c.sf < 0 ? 'neg' : '', fx: isIn ? `= 전월 재고 전망 + 생산 ${n0(c.p)} − 판매 ${n0(c.s)} = ${n0(c.sf)}` : `= 아래 줄 재고 전망 합 ${n0(c.sf)}` });
      }
      return { cls: x.kind + (x.hid ? ' hid' : ''), cells };
    });
    const sec = (nm) => L[M[0]][PS.secRow(nm).r];
    const opts = (B.ledger.v[M[0]] || {}).base || [];
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>판생 계획표 <small>판생 엑셀 양식 보기(회의·비교용) · 입력은 <a href="${HREF('psdecide')}">생산 결정</a>에서 하면 여기도 같이 바뀜</small></h2>
      <div class="ps-ctl"><label>보는 달 <select id="ps-m0">${ms.map((m) => `<option value="${m}"${m === M[0] ? ' selected' : ''}>${mL(m)}부터</option>`).join('')}</select></label>
        <label>비교 기준 <select id="ps-cmp">${opts.map((n, i) => `<option value="${i}"${st.cmp === i ? ' selected' : ''}>${esc(n)}(판생 엑셀)</option>`).join('')}${revs.map((r) => `<option value="${esc(r.at)}"${st.cmp === r.at ? ' selected' : ''}>회차: ${esc(r.name)}</option>`).join('')}</select></label></div>
      <div class="ps-k">${['도금', 'MAC', 'AZ', 'AL', '컬러'].map((nm) => `<div><span>${nm} ${mL(M[0])} 생산</span><b>${n0(sec(nm).p)}</b><em>판매 ${n0(sec(nm).s)} · 재고 ${n0(sec(nm).sf)}</em></div>`).join('')}</div>
      ${PSG.table({ id: 'tl', cls: 'ld', head, rows })}</section>`;
    $('ps-m0').onchange = (e) => { st.m0 = e.target.value; keep(); draw(); };
    $('ps-cmp').onchange = (e) => { const v = e.target.value; st.cmp = /^\d+$/.test(v) ? +v : v; keep(); draw(); };
  }

  /* ---------- 도금 월차 ---------- */
  function plating(B) {
    const ms = B.months.slice(1); if (!ms.includes(st.m)) st.m = ms[0];
    const m = st.m, L = PS.ledger(), P = PS.plating(L), Pm = P[m], T = Pm.T, D = PS.days(m), MUST = { '1CGL': 'AZ', '2CGL': 'MAC' };
    const tot = ['1CGL', '2CGL'].reduce((a, l) => a + Pm[l].days.reduce((b, x) => b + x.t, 0), 0), al = PS.sumG(Pm['1CGL'].days, 'AL') + PS.sumG(Pm['2CGL'].days, 'AL');
    const runs = (days) => { const r = []; for (const x of days) { const g = x.g || '휴지'; if (!r.length || r[r.length - 1].g !== g) r.push({ g, a: x.d, b: x.d, ev: x.ev === '휴지' ? '' : x.ev }); else r[r.length - 1].b = x.d; } return r; };
    const seq = (l) => runs(Pm[l].days.map((x) => (x.sts ? { ...x, g: 'STS' } : x))).map((r) => `${r.ev ? `<b class="sw">${r.ev} ${md(r.a)}</b> ` : ''}<span class="sq ${r.g === '휴지' ? 'off' : r.g.toLowerCase()}">${r.g === 'STS' ? 'AL-STS' : r.g} ${md(r.a)}~${md(r.b)}</span>`).join(' ');
    const stsEd = () => { const S = Pm['2CGL'].sts || {}; return S.need ? ` <label>STS 시작 <input type="date" id="ps-sts" value="${S.a || ''}" min="${m}-01" max="${D[D.length - 1]}"></label> <span class="ps-note">${S.need}일 필요 · ${S.n}일 배정</span>${S.manual ? ' <button type="button" class="btn sub sm" id="ps-sts-auto">자동으로</button>' : ''}` : ''; };
    const swEd = (l) => `${Pm[l].sw.map((d, i) => `<label>${i + 1}차 전환 <input type="date" data-l="${l}" data-i="${i}" value="${d}" min="${m}-01" max="${D[D.length - 1]}"></label>`).join(' ')}${Pm[l].manual ? ` <button type="button" class="btn sub sm" data-auto="${l}">자동으로</button>` : ''}`;
    const wk = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const head = [[{ v: '라인' }, { v: '강종' }, ...D.map((d) => ({ v: `${+d.slice(8)}<br>${'일월화수목금토'[wk(d)]}`, raw: true, cls: [0, 6].includes(wk(d)) ? 'we' : '' })), { v: '계' }, { v: '목표' }, { v: '차이' }, { v: '작업일' }]];
    const rows = [];
    for (const [l, gs] of Object.entries(PS.LINES)) {
      const Ld = Pm[l].days;
      for (const g of gs) {
        const tg = g === MUST[l] ? T[g] : null, s = Ld.reduce((a, x) => a + (x.g === g && !x.sts ? x.t : 0), 0);
        rows.push({ cells: [{ v: l, t: 'lab' }, { v: g, t: 'lab' }, ...Ld.map((x) => ({ v: x.g === g && x.t && !x.sts ? x.t : '', cls: x.g === g && x.t && !x.sts ? g.toLowerCase() : '', fx: x.g === g && x.t && !x.sts ? (x.ev ? `전환한 날: 첫날 ${n0(x.t)}t(가동 15시간)` : g === MUST[l] ? `= ${g} 목표 ${n0(T[g])}를 남은 ${g} 날에 고르게(하루 최대 ${n0(PS.rate(m, l, g))}t, ${PS.rateSrc(m, l, g)})` : `= ${l} ${g} 하루 톤 ${n0(PS.rate(m, l, g))}t(${PS.rateSrc(m, l, g)})`) : '' })), { v: s, fx: `= ${l} ${g} 이 달 합` }, { v: tg, fx: tg != null ? `= 생산 결정 ${g} 생산 합` : '' }, { v: tg != null ? s - tg : null, f: 'sg', fx: tg != null ? `= 합 ${n0(s)} − 목표 ${n0(tg)}` : '' }, { v: Ld.reduce((a, x) => a + (x.g === g && !x.sts ? (x.ev && x.ev !== '휴지' ? 0.5 : 1) : 0), 0), f: 'd1' }] });
        if (g === 'AL' && l === '2CGL') { const ss = Ld.reduce((a, x) => a + (x.sts ? x.t : 0), 0); rows.push({ cells: [{ v: l, t: 'lab' }, { v: 'AL-STS', t: 'lab' }, ...Ld.map((x) => ({ v: x.sts ? x.t : '', cls: x.sts ? 'sts' : '' })), { v: ss }, { v: T.STS }, { v: ss - T.STS, f: 'sg' }, { v: Ld.filter((x) => x.sts).length, f: 'd1' }] }); }
        if (g === gs[0]) rows.push({ cells: [{ v: l, t: 'lab' }, { v: '전환·휴지', t: 'lab' }, ...Ld.map((x) => ({ v: x.ev, cls: `evc ${x.ev === '휴지' ? 'off' : x.ev ? 'ev' : ''}`, title: '누르면 휴지 넣기/빼기', k: `P|${m}|${l}|${x.d}|down` })), { v: '' }, { v: '' }, { v: '' }, { v: '' }] });
      }
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '가동시간', t: 'lab' }, ...Ld.map((x) => ({ v: x.h })), { v: Ld.reduce((a, x) => a + x.h, 0) }, { v: '' }, { v: '' }, { v: '' }] });
      rows.push({ cls: 'sec', cells: [{ v: l, t: 'lab' }, { v: '계', t: 'lab' }, ...Ld.map((x) => ({ v: x.t || '' })), { v: Ld.reduce((a, x) => a + x.t, 0) }, { v: '' }, { v: '' }, { v: '' }] });
    }
    const rateRows = [{ cells: [...Object.entries(PS.LINES).flatMap(([l, gs]) => gs.map((g) => ({ v: PS.rate(m, l, g), t: 'in', k: `P|${m}|${l}|${g}|rate`, title: `${l} ${g} 하루 톤` }))), { v: PS.stsRate(m), t: 'in', k: `P|${m}|2CGL|STS|rate`, title: '2CGL AL-STS 하루 톤' }] }];
    const MT = PS.mat(L, P, true), cap = PS.capa(P);
    const chk = [];
    for (const [l, g] of [['1CGL', 'AZ'], ['2CGL', 'MAC']]) { const d = PS.sumG(Pm[l].days, g) - T[g]; if (Math.abs(d) >= 1) chk.push(['bad', `${l} ${g} 목표 ${n0(T[g])}t 대비 ${sg(d)}t. 전환 날짜를 옮기거나 하루 톤을 고칠 것`]); }
    { const S = Pm['2CGL'].sts || {}; if (S.need && S.n < S.need) chk.push(['bad', `AL-STS ${S.need}일 필요한데 ${S.n}일만 배정됨. STS 시작일을 2CGL AL 기간 안으로 옮길 것`]); }
    chk.push([al - T.AL >= 0 ? 'ok' : 'bad', `AL ${al - T.AL >= 0 ? `여유 ${n0(al - T.AL)}t (판매를 더 받을 수 있음)` : `부족 ${n0(T.AL - al)}t (목표 못 채움)`}`]);
    if (MT[m]) chk.push([MT[m].st < 0 ? 'bad' : 'ok', `F/H 소재 ${mL(m)}말 재고 ${n0(MT[m].st)}t(판생 ${n0(MT[m].ref)}t, 이 월차 생산 기준)`]);
    for (const a of cap.filter((x) => x.ln !== '공용' && x.fam !== 'MAC' || x.ln === '2CGL')) { const hit = a.by.find((x) => x.m === m); if (hit && a.until && a.until < m) chk.push(['warn', `${a.ln} ${a.fam}: 들어온 주문은 ${mL(a.until)} 안에 다 만들어짐. ${mL(m)} 은 주문을 더 받아야 함`]); }
    const AS = PS.assign(P), dl = (d) => `${md(d)}(${'일월화수목금토'[wk(d)]})`;
    const top = (got, n) => { const g = {}; for (const y of got) { const k = `${y.it.grp}|${y.it.who}`; (g[k] = g[k] || { grp: y.it.grp, who: y.it.who, t: 0, why: y.it.why, need: y.it.need, late: 0, plan: y.it.k === 'p' }); g[k].t += y.t; g[k].late = Math.max(g[k].late, y.late); if (y.it.need < g[k].need) { g[k].need = y.it.need; g[k].why = y.it.why; } }
      return Object.values(g).sort((a, b) => b.t - a.t).slice(0, n); };
    const ent = (e) => `<div class="wy${e.late ? ' late' : ''}${e.plan ? ' pl' : ''}"><b>${esc(e.grp)} ${esc(e.who === '판매계획' ? '판매계획(주문 전)' : e.who)} ${n0(e.t)}t</b> <span>${esc(e.why)} · ${md(e.need)}까지 생산${e.late ? ` · <em>${e.late}일 지연</em>` : ''}</span></div>`;
    const bandTxt = (got) => { const b = {}; for (const y of got) { const k = y.it.thk ? PS.band(y.it.thk) : '사양 미정'; b[k] = (b[k] || 0) + y.t; } return [...PS.BANDS, '사양 미정'].filter((k) => b[k] > 1).map((k) => `${k} ${n0(b[k])}`).join(' · '); };
    const runRows = [];
    for (const l of Object.keys(PS.LINES)) {
      let cur = null; const rs = [];
      for (const x of Pm[l].days) { const g = x.sts ? 'STS' : x.g; if (!g || !x.t) { cur = null; continue; } if (!cur || cur.g !== g) { cur = { l, g, a: x.d, b: x.d, got: [], t: 0, free: 0, tons: 0 }; rs.push(cur); } cur.b = x.d; const A = AS.out[`${l}|${x.d}`]; if (A) { cur.got.push(...A.got); cur.free += A.freeH; cur.tons += A.tons; } cur.t += x.t; }
      runRows.push(...rs);
    }
    const whyRun = runRows.map((r) => { const T = top(r.got, 4), late = r.got.reduce((a, y) => a + (y.late ? y.t : 0), 0), urgent = r.got.filter((y) => y.it.k === 'o').sort((a, b) => (a.it.need < b.it.need ? -1 : 1))[0];
      return `<tr><td><b>${r.l}</b></td><td><span class="sq ${r.g.toLowerCase()}">${r.g === 'STS' ? 'AL-STS' : r.g}</span></td><td>${md(r.a)}~${md(r.b)}</td><td>${n0(r.tons || r.t)}${r.tons && Math.abs(r.tons - r.t) > 30 ? `<br><small>하루 톤 기준 ${n0(r.t)}</small>` : ''}<br><small>${bandTxt(r.got)}</small></td>
        <td class="wrap">${T.map(ent).join('') || '<span class="ps-note">이 기간 넣을 주문·판매계획 없음</span>'}</td>
        <td class="wrap">${urgent ? `가장 급한 것: ${esc(urgent.it.grp)} ${urgent.it.who === '컬러 투입' || /배 입항/.test(urgent.it.why) ? '' : esc(urgent.it.who) + ' '}${esc(urgent.it.why)}, ${md(urgent.it.need)}까지 생산` : ''}${late ? `<br><em class="dn">지연 생산량 ${n0(late)}t</em>` : ''}${r.free > 0.5 ? `<br>남는 시간 ${r.free.toFixed(1)}시간(넣을 주문·판매계획 없음. 박물을 넣거나 재고 생산)` : ''}</td></tr>`; }).join('');
    const sel = st.day && st.day.startsWith(m) ? st.day : (D.find((d) => d > AS.asOf) || D[0]);
    const short = (it) => (it.k === 'p' ? `${it.grp} 계획분` : `${it.grp === '도금수출' ? '수출' : it.grp === '도금국내' ? '국내' : it.grp} ${it.who}`);
    const cellLine = (l, d) => { const x = Pm[l].days.find((y) => y.d === d), A = AS.out[`${l}|${d}`];
      if (!x || !x.t) return `<div class="cl off">${l.slice(0, 1)} ${x && x.ev ? esc(x.ev) : '휴지'}</div>`;
      const g = x.sts ? 'STS' : x.g, T = A && A.got.length ? A.got.slice().sort((a, b) => b.t - a.t)[0] : null, late = A ? A.got.some((y) => y.late) : false;
      return `<div class="cl"><span class="sq ${g.toLowerCase()}">${l.slice(0, 1)} ${g}</span> <b>${n0(A ? A.tons : x.t)}</b>${x.ev ? ` <i>${x.ev}</i>` : ''}${late ? ' <em>지연</em>' : ''}<br><span>${T ? esc(short(T.it)) : A ? '' : '실적'}</span></div>`; };
    const lead0 = (new Date(D[0] + 'T00:00:00Z').getUTCDay() + 6) % 7, cells = [...Array(lead0).fill(''), ...D]; while (cells.length % 7) cells.push('');
    const calHtml = `<div class="ps-cal">${'월화수목금토일'.split('').map((w, i) => `<div class="hd${i > 4 ? ' we' : ''}">${w}</div>`).join('')}${cells.map((d) => (d ? `<button type="button" class="cd${d === sel ? ' on' : ''}${[0, 6].includes(wk(d)) ? ' we' : ''}${d <= AS.asOf ? ' past' : ''}" data-day="${d}"><div class="dn">${+d.slice(8)}</div>${Object.keys(PS.LINES).map((l) => cellLine(l, d)).join('')}</button>` : '<div class="cd empty"></div>')).join('')}</div>`;
    const decBtn = (it) => (it.k !== 'o' ? '<span class="ps-note">주문 전</span>' : `<select class="decs" data-con="${esc(it.con)}">${[['', '자동(필요일 순)'], ['in', '이번 달 꼭'], ['stock', '재고에서 출하'], ['next', '다음 달로'], [`d:${sel}`, `${md(sel)} 고정`]].map(([v, t]) => `<option value="${v}"${(it.dec || '') === v || (v.startsWith('d:') && (it.dec || '').startsWith('d:')) ? ' selected' : ''}>${t}</option>`).join('')}</select>`);
    const panel = Object.keys(PS.LINES).map((l) => { const x = Pm[l].days.find((y) => y.d === sel), A = AS.out[`${l}|${sel}`];
      if (!x || !x.t) return `<h3>${l} · ${x && x.ev ? esc(x.ev) : '휴지'}</h3>`;
      if (!A) return `<h3>${l} · ${x.sts ? 'AL-STS' : x.g} ${n0(x.t)}t</h3><p class="ps-note">지난 날 = 실적(MES)</p>`;
      return `<h3>${l} · <span class="sq ${x.sts ? 'sts' : x.g.toLowerCase()}">${x.sts ? 'AL-STS' : x.g}</span> ${n0(A.tons)}t · ${A.got.length}건 · 가동 ${(A.capH - A.freeH).toFixed(1)}/${A.capH.toFixed(1)}시간${x.ev ? ` · ${x.ev}` : ''}${A.freeH > 0.5 ? ` · <em>남는 ${A.freeH.toFixed(1)}시간</em>` : ''}</h3>
        <div class="psg-w"><table class="psg why day"><thead><tr><th>순서</th><th>계약번호</th><th>그룹 · 고객·목적지</th><th>사이즈</th><th>도금량·후처리</th><th>톤</th><th>시간</th><th>앞 코일과</th><th>이유 · 생산 필요일</th><th>결정</th></tr></thead><tbody>
        ${A.got.map((y, i) => `<tr${y.late ? ' class="late"' : ''}><td>${i + 1}</td><td>${y.it.k === 'o' ? esc(y.it.con) : '판매계획'}</td><td><b>${esc(y.it.grp)}</b> ${esc(y.it.k === 'o' ? (y.it.who === '컬러 투입' ? y.it.cus : y.it.who) : '')}</td><td>${y.it.thk ? `${y.it.thk}×${y.it.wdt}` : ''}<br><small>${y.it.thk ? PS.band(y.it.thk) : ''}</small></td><td>${esc([y.it.cot, y.it.aft].filter(Boolean).join(' · '))}</td><td>${n0(y.t)}</td><td>${y.h.toFixed(1)}<br><small>${Math.round(y.tp)}t/시간</small></td><td class="${y.rt > 1.3 || y.dw > 300 ? 'dn' : ''}">${y.rt ? `폭 ${y.dw > 0 ? '+' : ''}${y.dw}<br><small>두께 ×${y.rt.toFixed(2)}${y.cc ? ' · 도금량·후처리 바뀜' : ''}</small>` : ''}</td><td class="wrap">${esc(y.it.why)} · ${md(y.it.need)}까지${y.late ? ` · <em>${y.late}일 지연</em>` : ''}</td><td>${decBtn(y.it)}</td></tr>`).join('')}</tbody></table></div>`; }).join('');

    const staleT = AS.stale.reduce((a, o) => a + o[4], 0), ovm = Object.entries(AS.over).filter(([k, v]) => k.startsWith(m) && v > 30).sort((a, b) => b[1] - a[1]);
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 도금 월차 <small>목표 = 생산 결정 · 전환 날짜·하루 톤은 고칠 수 있음</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
      <div class="ps-k"><div><span>도금 계</span><b>${n0(tot)}</b><em>목표 ${n0(T.total)} · ${sg(tot - T.total)}</em></div>
        <div><span>AZ · 1CGL</span><b>${n0(PS.sumG(Pm['1CGL'].days, 'AZ'))}</b><em>목표 ${n0(T.AZ)}</em></div>
        <div><span>MAC · 2CGL</span><b>${n0(PS.sumG(Pm['2CGL'].days, 'MAC'))}</b><em>목표 ${n0(T.MAC)}</em></div>
        <div class="${al - T.AL >= 0 ? 'ok' : 'bad'}"><span>AL · 1·2CGL</span><b>${n0(al)}</b><em>목표 ${n0(T.AL)} · ${al - T.AL >= 0 ? '여유' : '부족'} ${n0(Math.abs(al - T.AL))}</em></div></div>
      <div class="ps-seq">${Object.keys(PS.LINES).map((l) => `<div><b>${l}</b> ${seq(l)}</div><div>${swEd(l)}${l === '2CGL' ? stsEd() : ''}</div>`).join('')}</div>
      <ul class="ps-chk">${chk.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul></section>
      <section class="card"><h2>${mL(m)} 강종 구간마다 무엇을 왜 <small>미생산 주문(${esc(B.ordersAsOf)})을 생산 필요일(수출 = 배 출항 전, 국내 = 납기, 자가재 = 컬러 투입) 이른 순으로 넣고, 주문이 아직 없는 판매계획은 그 그룹 과거 출고 시기(반순)에 맞춰 넣음. 소재 입고 전 주문은 입고 뒤로</small></h2>
        <div class="psg-w"><table class="psg why"><thead><tr><th>라인</th><th>강종</th><th>기간</th><th>톤</th><th>주로 만드는 것 · 이유</th><th>판단</th></tr></thead><tbody>${whyRun}</tbody></table></div>
        ${ovm.length ? `<ul class="ps-chk"><li class="bad">${mL(m)} 생산 계획(그룹별)보다 주문이 많아 못 넣은 것: ${ovm.map(([k, v]) => `${k.split('|')[1]} ${k.split('|')[2] === 'STS' ? 'AL-STS' : k.split('|')[2]} ${n0(v)}t`).join(' · ')}. 생산 결정에서 그 그룹 재고 출하를 늘리거나 생산을 늘릴 것</li></ul>` : ''}
        ${staleT ? `<p class="ps-note">${md(AS.cut)} 전에 필요했는데 아직 안 만든 주문 ${AS.stale.length}건 ${n0(staleT)}t 은 보류·취소일 수 있어 배정에서 뺌(수주 확인)</p>` : ''}</section>
      <section class="card" id="ps-calcard"><h2>${mL(m)} 달력 <small>칸 = 라인별 강종·배정 톤·주된 그룹 · 누르면 아래에 그 날 주문(계약번호·사이즈·순서·이유). 순서 = 폭 넓은 것부터. 결정 버튼을 누르면 달력·생산량이 바로 다시 계산</small></h2>
        ${calHtml}
        <div class="ps-day" id="ps-day"><h2 class="dh">${dl(sel)} 생산</h2>${panel}</div></section>
      <section class="card"><h2>하루 톤 <small>판생 제원 작업일수(주문별 MES 톤파워)에서 낸 값 · 고치면 월차 다시 계산</small></h2>${PSG.table({ id: 'tr', head: [[...Object.entries(PS.LINES).flatMap(([l, gs]) => gs.map((g) => ({ v: `${l} ${g}` }))), { v: '2CGL AL-STS' }]], rows: rateRows })}</section>
      <section class="card"><h2>일별 가동계획 <small>판생 도금가동 양식 · 설비 정지가 생기면 전환·휴지 줄 그 날 칸을 두 번 눌러 휴지</small></h2>${PSG.table({ id: 'tp', cls: 'pl', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
    document.querySelectorAll('.ps-seq input[type=date]').forEach((inp) => inp.addEventListener('change', () => { const l = inp.dataset.l, cur = Pm[l].sw.slice(); cur[+inp.dataset.i] = inp.value; cur.sort(); PS.set(`P|${m}|${l}|sw`, cur.join(','), '전환 날짜'); }));
    document.querySelectorAll('.ps-cal [data-day]').forEach((b) => b.addEventListener('click', () => { st.day = b.dataset.day; keep(); draw(); const p = $('ps-day'); if (p) p.scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
    document.querySelectorAll('select.decs').forEach((b) => b.addEventListener('change', () => PS.set(`D|${b.dataset.con}`, b.value || null, `주문 결정: ${b.selectedOptions[0].textContent}`)));
    if ($('ps-sts')) $('ps-sts').onchange = (e) => PS.set(`P|${m}|2CGL|stsA`, e.target.value || null, 'STS 시작일');
    if ($('ps-sts-auto')) $('ps-sts-auto').onclick = () => PS.set(`P|${m}|2CGL|stsA`, null, 'STS 자동으로');
    document.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => PS.set(`P|${m}|${b.dataset.auto}|sw`, null, '자동 전환으로')));
    document.querySelectorAll('#tp td.evc').forEach((td) => td.addEventListener('dblclick', (e) => { e.stopPropagation(); const k = td.dataset.k, l = k.split('|')[2], d = k.split('|')[3]; PS.set(k, PS.isDown(l, d) ? 0 : 1, PS.isDown(l, d) ? '휴지 뺌' : '휴지 넣음'); }, true));
  }

  /* ---------- 생산 가능(CAPA) ---------- */
  function capa(B) {
    const L = PS.ledger(), P = PS.plating(L), C = PS.capa(P), ms = Object.keys(P).sort();
    const head = [[{ v: '라인' }, { v: '강종' }, { v: '주문 건수' }, { v: '미생산(t)' }, { v: '필요 일수' }, ...ms.flatMap((m) => [{ v: `${mL(m)} 가용일`, cls: 'mb' }, { v: `${mL(m)}까지` }]), { v: '주문으로 차는 곳' }, { v: '판매그룹별 미생산(전부)' }]];
    const rows = C.map((a) => ({ cells: [{ v: a.ln, t: 'lab' }, { v: a.fam, t: 'lab' }, { v: a.n }, { v: a.t }, { v: a.need, f: 'd1' },
      ...a.by.flatMap((x) => [{ v: x.av, f: 'd1', cls: 'mb' }, { v: x.cum, f: 'd1', cls: x.cum <= a.need ? 'up' : 'dn' }]),
      { v: a.ln === '공용' ? '1·2CGL 공용' : !a.by.some((x) => x.av) ? '월차에 이 강종 없음' : a.until ? `${mL(a.until)} 안` : '그 뒤까지' },
      { v: Object.entries(a.grp).sort((x, y) => y[1] - x[1]).map(([g, t]) => `${LB(g)} ${n0(t)}`).join(' · '), cls: 'wrap' }] }));
    const tg = ms.map((m) => { const T = P[m].T; return { cells: [{ v: mL(m), t: 'lab' }, ...['AZ', 'MAC', 'AL'].flatMap((g) => { const l = g === 'AZ' ? ['1CGL'] : g === 'MAC' ? ['2CGL'] : ['1CGL', '2CGL']; const av = l.reduce((a, x) => a + PS.daysG(P[m][x].days, g), 0), made = l.reduce((a, x) => a + PS.sumG(P[m][x].days, g), 0); return [{ v: T[g], cls: 'mb' }, { v: av, f: 'd1' }, { v: made - T[g], f: 'sg', cls: made - T[g] < -1 ? 'dn' : '' }]; })] }; });
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>주문으로 어디까지 차 있나 <small>미생산 주문(${esc(B.ordersAsOf)}) × 주문별 MES 톤파워로 낸 필요 일수와 도금 월차 강종 가용일(누적) 비교 · 판생 '종합' 시트 방식</small></h2>
      ${PSG.table({ id: 'tc', head, rows })}</section>
      <section class="card"><h2>달 목표와 월차 <small>판생 계획표 · 월차 가용일 · 월차가 만든 양 − 목표</small></h2>
      ${PSG.table({ id: 'tt', head: [[{ v: '달' }, ...['AZ', 'MAC', 'AL'].flatMap((g) => [{ v: `${g} 목표`, cls: 'mb' }, { v: '가용일' }, { v: '차이' }])]], rows: tg })}</section>`;
  }

  /* ---------- 소재 ---------- */
  function mat(B) {
    const L = PS.ledger(), P = PS.plating(L), useW = st.src === 'wolcha', MT = PS.mat(L, P, useW), ms = B.mat.months;
    const rows = B.mat.rows.map((x) => { const isIn = PS.MAT_IN.includes(x.lab); return { cls: /계|재고/.test(x.lab) ? 'sec' : '', cells: [{ v: x.lab, t: 'lab' }, ...ms.map((m) => ({ v: isIn ? PS.inputValue(`M|${x.r}|${m}`) : x.lab === '구매량 계(임가공제외)' ? MT[m].buy : x.v[m], t: isIn ? 'in' : x.lab === '구매량 계(임가공제외)' ? 'calc' : 'auto', k: isIn ? `M|${x.r}|${m}` : null }))] }; });
    rows.push({ cls: 'sec', cells: [{ v: useW ? '도금 생산(월차)' : '도금 생산(판생 계획표)', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].prod }))] });
    rows.push({ cells: [{ v: '소재 사용 = (생산 − 임가공) ÷ 수율', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].use }))] });
    rows.push({ cls: 'sec', cells: [{ v: '월말 재고(지금 판)', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].st, cls: MT[m].st < 0 ? 'neg' : '' }))] });
    rows.push({ cells: [{ v: '판생 엑셀 월말 재고 대비', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].st - (MT[m].ref || 0), f: 'sg' }))] });
    // 그룹·소재 종류별(docs/43 M7): 생산 결정의 그룹×강종 생산 ÷ 그 달 수율 → 소재 종류(AL·STS = F/H(AL용)·도금용 SUS, AZ·MAC = F/H(GI/GL용)), 재고·입고·발주 마감은 소재 발주 화면 자료
    const MO = B.matOrder || {}, mo = {}; for (const g of ((MO.groups || {}).groups || [])) for (const x of g.mats || []) if (x.plant === 'G') mo[x.name] = x;
    const TYP = (f) => (f === 'STS' ? '도금용 SUS' : f === 'AL' ? 'F/H(AL용)' : 'F/H(GI/GL용)');
    const m0 = String(B.actualAsOf || '').slice(0, 7) || B.months[0], M3 = B.months.filter((x) => x > m0).slice(0, 3), need = {};
    for (const m of M3) { const yl = ((B.ledger.v[m] || {}).yield) || B.yield.plating; for (const x of B.ledger.rows) { if (!L[m] || !L[m][x.r] || !L[m][x.r].in) continue; const f = PS.famOfRow(x); if (!f) continue; const t = TYP(f), g = PS.grpOfRow(x); (need[t] = need[t] || { t: 0, g: {}, m: {} }); const u = L[m][x.r].p / (yl / 100); need[t].t += u; need[t].g[g] = (need[t].g[g] || 0) + u; need[t].m[m] = (need[t].m[m] || 0) + u; } }
    const matRows = Object.entries(need).sort((a, b) => b[1].t - a[1].t).map(([t, z]) => { const o = mo[t] || {}, have = (o.stock || 0) + (o.arr || 0), short = z.t - have;
      return `<tr><td><b>${esc(t)}</b></td>${M3.map((m) => `<td>${n0(z.m[m] || 0)}</td>`).join('')}<td><b>${n0(z.t)}</b></td><td>${n0(o.stock)}</td><td>${n0(o.arr)}</td><td class="${short > 0 ? 'dn' : 'up'}">${short > 0 ? n0(short) : '여유 ' + n0(-short)}</td><td>${o.first ? `<b class="dt">${md(o.first)}</b>` : ''}</td><td>${o.deadline ? `<b class="dt">${md(o.deadline)}</b>` : ''}</td><td>${o.next ? `<b class="dt">${md(o.next)}</b> ${n0(o.nextT)}t` : esc(String(o.rule || '').replace(/\s*—\s*/g, ', '))}</td><td class="wrap">${Object.entries(z.g).sort((a, b) => b[1] - a[1]).map(([g, v]) => `${esc(g)} ${n0(v)}`).join(' · ')}</td></tr>`; }).join('');
    const matHtml = `<section class="card"><h2>그룹·소재 종류별 ${M3.map(mL).join('·')} 필요와 발주 <small>필요 = 생산 결정의 그룹·강종 생산 ÷ 그 달 수율 · 재고·입고 예정·첫 부족일·발주 마감·다음 발주 = 소재 발주 화면(${esc(MO.today || '')}, 게시 계획 기준)</small></h2>
      <div class="psg-w"><table class="psg"><thead><tr><th>소재</th>${M3.map((m) => `<th>${mL(m)} 필요</th>`).join('')}<th>3달 필요</th><th>재고</th><th>입고 예정</th><th>부족량</th><th>첫 부족일</th><th>발주 마감</th><th>다음 발주</th><th>그룹별 필요</th></tr></thead><tbody>${matRows}</tbody></table></div></section>`;
    $('ct-main').innerHTML = `${PSG.bar()}${matHtml}
      <section class="card"><h2>도금 소재(F/H) <small>연노랑 = 구매 입력(P사·수입·외부) · 사용 = 생산 ÷ 그 달 수율 · 판생 도금소재수급 식</small></h2>
      <div class="ps-ctl"><label>사용량 기준 <select id="ps-src"><option value="ledger"${!useW ? ' selected' : ''}>판생 계획표 도금 생산(판생 방식)</option><option value="wolcha"${useW ? ' selected' : ''}>도금 월차 생산(AL full 가동)</option></select></label></div>
      ${PSG.table({ id: 'tm', head: [[{ v: '항목' }, ...ms.map((m) => ({ v: mL(m) }))]], rows })}</section>`;
    $('ps-src').onchange = (e) => { st.src = e.target.value; keep(); draw(); };
  }

  /* ---------- 컬러 월차 ---------- */
  function color(B) {
    const ms = Object.keys(B.color).sort().filter((m) => m >= B.months[1]); if (!ms.includes(st.m)) st.m = ms[0];
    const m = st.m, D = PS.days(m), L = PS.ledger(), tg = L[m] ? L[m][PS.secRow('컬러').r].p : null, wk = (d) => new Date(d + 'T00:00:00Z').getUTCDay(), C = PS.color(m);
    const head = [[{ v: '라인' }, { v: '구분' }, ...D.map((d) => ({ v: `${+d.slice(8)}<br>${'일월화수목금토'[wk(d)]}`, raw: true, cls: [0, 6].includes(wk(d)) ? 'we' : '' })), { v: '계' }]];
    const rows = []; let tot = 0; const per = {};
    const lab = { plan: '휴지', test: '시험', clean: '청소', sd: 'S/D', sample: '샘플' };
    for (const l of PS.CLINES) {
      const X = C[l];
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '휴지·시험', t: 'lab' }, ...X.map((x) => { const e = x.ev.map(([k, mm]) => `${lab[k] || k}${mm >= 1440 ? '' : '<br>' + Math.round(mm / 60) + '시간'}`).join('<br>'); return { v: e, raw: true, cls: e ? 'ev kev' : '' }; }), { v: '' }] });
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '가동시간', t: 'lab' }, ...X.map((x) => ({ v: x.h, f: 'h', t: 'in', k: `C|${m}|${l}|${x.d}|h`, cls: x.h ? '' : 'off', title: `${l} ${md(x.d)} 가동시간(엔진 ${x.h0}시간)` })), { v: X.reduce((a, x) => a + x.h, 0) }] });
      const s = X.reduce((a, x) => a + x.t, 0); tot += s; per[l] = s;
      rows.push({ cls: 'sec', cells: [{ v: l, t: 'lab' }, { v: '생산량', t: 'lab' }, ...X.map((x) => ({ v: x.t || '' })), { v: s }] });
    }
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 컬러 월차 <small>컬러 엔진 일별 배정(${esc(B.colorAsOf)}) · 가동시간(연노랑)을 고치면 그 날 생산량 = 시간당 톤 × 시간</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
      <div class="ps-k"><div class="${tot - (tg || 0) >= 0 ? 'ok' : 'bad'}"><span>컬러 계</span><b>${n0(tot)}</b><em>판생 계획표 ${n0(tg)} · ${sg(tot - (tg || 0))}</em></div>${PS.CLINES.map((l) => `<div><span>${l}</span><b>${n0(per[l])}</b><em>가동 ${n0(C[l].reduce((a, x) => a + x.h, 0))}시간</em></div>`).join('')}</div>
      ${PSG.table({ id: 'tk', cls: 'pl', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
  }

  /* ---------- 주간 조정 ---------- */
  function week(B) {
    const L = PS.ledger(), P = PS.plating(L), DP = PS.dayPlan(P), A = B.actual || {}, asOf = String(B.actualAsOf || '').slice(0, 10) || Object.keys(A).sort().pop() || B.months[0] + '-01';
    const m0 = asOf.slice(0, 7), last = (() => { const i = B.months.indexOf(m0); const mm = B.months[Math.min(i + 2, B.months.length - 1)]; return PS.days(mm).pop(); })();
    const W = []; for (let w = PS.monday(m0 + '-01'); w <= last; w = PS.addD(w, 7)) W.push(w);
    const LN = Object.keys(PS.LINES), cur = PS.monday(asOf);
    const wkDays = (w) => Array.from({ length: 7 }, (_, i) => PS.addD(w, i));
    const plan = (l, d) => DP[`${l}|${d}`] || { g: '', t: 0, ev: '' };
    // 1. 이번 달 진행
    const MD = PS.days(m0), mrow = LN.map((l) => { const pm = MD.reduce((a, d) => a + plan(l, d).t, 0), pa = MD.filter((d) => d <= asOf).reduce((a, d) => a + plan(l, d).t, 0), ac = MD.filter((d) => d <= asOf).reduce((a, d) => a + ((A[d] || {})[l] || 0), 0), rest = pm - pa;
      return { cells: [{ v: l, t: 'lab' }, { v: pm }, { v: pa }, { v: ac }, { v: ac - pa, f: 'sg', cls: ac - pa < 0 ? 'dn' : 'up' }, { v: rest }, { v: ac + rest }, { v: ac + rest - pm, f: 'sg', cls: ac + rest - pm < 0 ? 'dn' : 'up' }] }; });
    // 2. 주별 라인 계획·실적
    const runTxt = (l, w) => { const r = []; for (const d of wkDays(w)) { const x = plan(l, d), g = x.g && x.t ? x.g : '휴지'; if (!g) continue; if (!r.length || r[r.length - 1].g !== g) r.push({ g, a: d }); } return r.map((x) => `${x.g === 'STS' ? 'AL-STS' : x.g} ${md(x.a)}`).join(' · '); };
    const wrows = W.map((w) => { const dd = wkDays(w), past = dd.filter((d) => d <= asOf);
      return { cls: w === cur ? 'now' : '', cells: [{ v: `${md(w)}~${md(PS.addD(w, 6))}${w === cur ? ' (이번 주)' : ''}`, t: 'lab' }, ...LN.flatMap((l) => { const pt = dd.reduce((a, d) => a + plan(l, d).t, 0), pp = past.reduce((a, d) => a + plan(l, d).t, 0), ac = past.reduce((a, d) => a + ((A[d] || {})[l] || 0), 0);
        return [{ v: runTxt(l, w), cls: 'mb rtx' }, { v: pt }, { v: past.length ? ac : null }, { v: past.length ? ac - pp : null, f: 'sg', cls: ac - pp < 0 ? 'dn' : 'up' }]; })] }; });
    // 3. 강종별 주문 확보 — 계획(그 주) vs 납기가 그 주인 미생산 주문, 누적 여유 = 이번 주부터 계획 누계 − 납기 누계(지난 납기 포함)
    const FAM = ['AZ', 'MAC', 'AL'], fam = (x) => (x.g === 'STS' ? 'AL' : x.g);
    const cut = PS.prevM(m0) + '-01';   // 지난달 1일 전 납기 = 오래된 미생산(보류·취소 확인 대상) → 누계에서 빼고 따로 보임
    const due = {}; for (const o of B.orders) { const w = !o[6] || o[6] >= cur ? PS.monday(o[6] || cur) : o[6] >= cut ? 'old' : 'stale'; (due[w] = due[w] || {})[o[2]] = (due[w][o[2]] || 0) + o[4]; }
    const cum = Object.fromEntries(FAM.map((g) => [g, (due.old || {})[g] || 0])), cp = Object.fromEntries(FAM.map((g) => [g, 0]));
    const frows = [{ cls: 'old', cells: [{ v: `${md(cut)} 전 납기(누계 제외)`, t: 'lab', title: '오래된 미생산 주문. 보류·취소·소재 대기인지 수주 담당 확인' }, ...FAM.flatMap((g) => [{ v: '', cls: 'mb' }, { v: (due.stale || {})[g] || 0 }, { v: '' }, { v: '' }, { v: '' }])] },
      { cls: 'old', cells: [{ v: `${md(cut)}~${md(PS.addD(cur, -1))} 납기 지남`, t: 'lab' }, ...FAM.flatMap((g) => [{ v: '', cls: 'mb' }, { v: (due.old || {})[g] || 0 }, { v: '' }, { v: '' }, { v: '' }])] }];
    for (const w of W.filter((x) => x >= cur)) {
      const pl = {}; for (const d of wkDays(w)) for (const l of LN) { const x = plan(l, d); if (x.t && d > asOf) pl[fam(x)] = (pl[fam(x)] || 0) + x.t; }
      frows.push({ cls: w === cur ? 'now' : '', cells: [{ v: `${md(w)}~${md(PS.addD(w, 6))}`, t: 'lab' }, ...FAM.flatMap((g) => { cp[g] += pl[g] || 0; cum[g] += (due[w] || {})[g] || 0; const free = cp[g] - cum[g], k = `W|${w}|도금|${g}`;
        return [{ v: pl[g] || 0, cls: 'mb' }, { v: (due[w] || {})[g] || 0 }, { v: free, f: 'sg', cls: free < 0 ? 'neg' : 'up' }, { v: PS.get(`${k}|pull`, 0) || '', t: 'in', k: `${k}|pull`, title: `${md(w)} 주 ${g} 수주 결정 톤(+더 받기 −빼기·당기기)` }, { v: PS.get(`${k}|note`, '') ? '메모' : '+', raw: false, cls: 'memo', title: PS.get(`${k}|note`, '') || '누르면 메모', k: `${k}|note` }]; })] });
    }
    const advice = [];
    for (const g of FAM) { let c1 = 0, c2 = (due.old || {})[g] || 0, worst = [null, 0], back = null, lastFree = 0;
      for (const w of W.filter((x) => x >= cur)) { for (const d of wkDays(w)) for (const l of LN) { const x = plan(l, d); if (fam(x) === g && d > asOf) c1 += x.t; } c2 += (due[w] || {})[g] || 0; const f = c1 - c2; if (f < worst[1]) { worst = [w, f]; back = null; } if (f >= 0 && worst[0] && !back) back = w; lastFree = f; }
      if (worst[0]) advice.push(['bad', `${g}: 납기 지난 주문까지 합쳐 ${md(worst[0])} 주에 ${n0(-worst[1])}t 부족, ${back ? `${md(back)} 주에 따라잡음` : '보이는 기간 안에 못 따라잡음'}. 그 사이 납기 주문은 당기기·납기 협의, 또는 도금 월차에서 ${g} 날을 앞으로`]);
      if (lastFree > 0) advice.push(['ok', `${g}: ${md(W[W.length - 1])} 주까지 계획이 들어온 주문보다 ${n0(lastFree)}t 많음. 이만큼 주문을 더 받을 수 있음`]); }
    const hd2 = [[{ v: '주', rs: 2 }, ...LN.map((l) => ({ v: l, cs: 4, cls: 'mb' }))], LN.flatMap(() => [{ v: '강종 흐름', cls: 'mb' }, { v: '계획' }, { v: '실적' }, { v: '차이' }])];
    const hd3 = [[{ v: '주', rs: 2 }, ...FAM.map((g) => ({ v: g, cs: 5, cls: 'mb' }))], FAM.flatMap(() => [{ v: '계획', cls: 'mb' }, { v: '납기 주문' }, { v: '누적 여유' }, { v: '수주 결정' }, { v: '메모' }])];
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m0)} 진행 <small>실적 ${esc(asOf)}까지(MES) · 계획 = ${m0 === B.months[0] ? '판생 손 계획' : '도금 월차'}</small></h2>
        ${PSG.table({ id: 'wm', head: [[{ v: '라인' }, { v: '월 계획' }, { v: '오늘까지 계획' }, { v: '오늘까지 실적' }, { v: '차이' }, { v: '남은 계획' }, { v: '월말 전망' }, { v: '월 계획 대비' }]], rows: mrow })}</section>
      <section class="card"><h2>주문 확보와 수주 결정 <small>계획 = 그 주 남은 날 도금 계획(강종별) · 납기 주문 = 미생산 주문(${esc(B.ordersAsOf)}) · 누적 여유 = 이번 주부터 계획 누계 − 납기 누계(${md(cut)} 이후 지난 납기 포함) · 수주 결정 칸에 톤, 메모 칸은 두 번 눌러 사유</small></h2>
        <ul class="ps-chk">${advice.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul>
        ${PSG.table({ id: 'wf', head: hd3, rows: frows })}</section>
      <section class="card"><h2>주별 라인 계획과 실적 <small>계획 = 그 주 7일 · 실적·차이 = ${md(asOf)}까지 지난 날만 · 전환 날짜를 바꾸려면 도금 월차에서</small></h2>
        ${PSG.table({ id: 'ww', head: hd2, rows: wrows })}</section>`;
    // ---- 누적 여유가 − 인 원인 주문과 조치(docs/43 M1·M5) · 남는 능력의 그룹별 수주 배분(M8) ----
    const AS = PS.assign(P), prodDay = {}, freeDays = {};
    for (const [k, x] of Object.entries(AS.out)) { const [l, d] = k.split('|'); for (const y of x.got) if (y.it.k === 'o') { const c = y.it.con; if (!prodDay[c] || d < prodDay[c].d) prodDay[c] = { d, l }; } if (x.freeH > 0.5) (freeDays[`${l}|${x.g}`] = freeDays[`${l}|${x.g}`] || []).push([d, x.freeH]); }
    const famK = (f) => (f === 'STS' ? 'AL' : f);
    const sel = st.wsel || (() => { for (const w of W.filter((x) => x >= cur)) for (const g of FAM) { const c = frows.find((r) => r.cells[0].v.startsWith(md(w))); if (c) { const i = 1 + FAM.indexOf(g) * 5 + 2; if (c.cells[i] && c.cells[i].v < 0) return `${w}|${g}`; } } return ''; })();
    let causeHtml = '';
    if (sel) {
      const [sw, sg] = sel.split('|'), wEnd = PS.addD(sw, 6);
      const late = AS.items.filter((it) => it.k === 'o' && famK(it.fam) === sg && it.need <= wEnd && (!prodDay[it.con] || prodDay[it.con].d > it.need || it.left > 1)).sort((a, b) => (a.need < b.need ? -1 : 1));
      const tot = late.reduce((a, it) => a + it.t, 0);
      const act = (it) => { const pd = prodDay[it.con], lines = it.line ? [it.line] : sg === 'AZ' ? ['1CGL'] : sg === 'MAC' ? ['2CGL'] : ['1CGL', '2CGL'], hrs = it.t / (PS.tph(lines[0], it.fam, it.thk, it.wdt) || 30);
        const fd = lines.flatMap((l) => (freeDays[`${l}|${it.fam}`] || []).map(([d, h]) => [d, h, l])).filter(([d, h]) => d < (pd ? pd.d : '9999') && h >= Math.min(hrs, 2)).sort()[0];
        if (fd) return `<b>당기기</b>: ${md(fd[0])} ${fd[2]} 남는 ${fd[1].toFixed(1)}시간 <button type="button" class="btn sub sm" data-pin="${esc(it.con)}" data-d="${fd[0]}">${md(fd[0])}로</button>`;
        if (!pd) return `<b>이 달 생산 계획에 없음</b>: 주문 맞추기에서 '이번 달 꼭' 또는 생산량 늘리기`;
        if (it.need <= asOf) return `<b>납기 지남</b>: 가장 빠른 ${sg} 생산일 ${pd.l} ${md(pd.d)}. 납기 협의(담당 ${esc(it.man || '미정')})`;
        return `<b>${sg} 구간이 뒤에 있음</b>: ${pd.l} ${md(pd.d)} 생산, 필요일 ${md(it.need)}. 전환을 ${Math.max(1, Math.round((new Date(pd.d) - new Date(it.need)) / 864e5))}일 당기거나 납기 협의(담당 ${esc(it.man || '미정')})`; };
      causeHtml = `<section class="card"><h2>${md(sw)} 주 ${sg} 누적 여유 − 의 원인 주문 ${late.length}건 ${n0(tot)}t <small>생산 필요일이 이 주까지인데 계획상 늦게 만들거나 못 넣은 주문 · 조치를 누르면 달력·여유가 바로 다시 계산</small></h2>
        <div class="psg-w"><table class="psg why"><thead><tr><th>계약번호</th><th>그룹 · 고객·목적지</th><th>사이즈</th><th>톤</th><th>생산 필요일 · 이유</th><th>계획상 생산</th><th>할 수 있는 조치</th><th>결정</th></tr></thead><tbody>
        ${late.slice(0, 60).map((it) => { const pd = prodDay[it.con]; return `<tr><td>${esc(it.con)}</td><td><b>${esc(it.grp)}</b> ${esc(it.who === '컬러 투입' ? it.cus : it.who)}</td><td>${it.thk ? `${it.thk}×${it.wdt}` : ''}</td><td>${n0(it.t)}</td><td class="wrap"><b class="dt">${md(it.need)}</b> · ${esc(it.why)}</td><td>${pd ? `${pd.l} <b class="dt">${md(pd.d)}</b><br><small>${Math.round((new Date(pd.d) - new Date(it.need)) / 864e5)}일 지연</small>` : '<b class="dn">없음</b>'}</td><td class="wrap">${act(it)}</td>
          <td><select class="decs" data-con="${esc(it.con)}">${[['', '자동'], ['in', '이번 달 꼭'], ['stock', '재고에서 출하'], ['next', '다음 달로']].map(([x, t]) => `<option value="${x}"${(it.dec || '') === x ? ' selected' : ''}>${t}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table></div>${late.length > 60 ? `<p class="ps-note">그 밖 ${late.length - 60}건</p>` : ''}</section>`;
    }
    // 수주 배분: 이번 달·다음 달 판매계획 중 주문이 아직 없는 양(그룹별) — 남는 능력이 있으면 이 그룹들에서 받음
    const mNext = B.months[B.months.indexOf(m0) + 1] || m0;
    const gap = {}; for (const it of AS.items) if (it.k === 'p' && (it.m === m0 || it.m === mNext)) { const k = `${it.grp}|${famK(it.fam)}`; (gap[k] = gap[k] || { [m0]: 0, [mNext]: 0 }); gap[k][it.m] += it.t; }
    const lastFree = {}; for (const g of FAM) { const r = frows[frows.length - 1]; const i = 1 + FAM.indexOf(g) * 5 + 2; lastFree[g] = r && r.cells[i] ? r.cells[i].v : 0; }
    const alloc = FAM.map((g) => { const ks = Object.keys(gap).filter((k) => k.endsWith('|' + g)), tg = ks.reduce((a, k) => a + gap[k][m0] + gap[k][mNext], 0);
      return ks.sort((a, b) => (gap[b][m0] + gap[b][mNext]) - (gap[a][m0] + gap[a][mNext])).map((k) => { const v = gap[k][m0] + gap[k][mNext], key = `W|${cur}|${k.split('|')[0]}|${g}|pull`;
        return `<tr><td><span class="sq ${g.toLowerCase()}">${g}</span></td><td><b>${esc(k.split('|')[0])}</b></td><td>${n0(gap[k][m0])}</td><td>${n0(gap[k][mNext])}</td><td>${tg && lastFree[g] > 0 ? n0(lastFree[g] * v / tg) : ''}</td><td data-k="${esc(key)}" class="t-in">${PS.get(key, '') === '' ? '' : n0(PS.get(key, 0))}</td></tr>`; }).join(''); }).join('');
    const extra = `${causeHtml}<section class="card"><h2>그룹별 수주 배분 <small>판매계획 중 아직 주문이 없는 양 · 강종 남는 능력(누적 여유 마지막 주)을 그 비율로 나눈 제안 · 결정 칸에 받을 톤(그룹에 주문 요청)</small></h2>
      <div class="psg-w"><table class="psg"><thead><tr><th>강종</th><th>그룹</th><th>${mL(m0)} 주문 부족</th><th>${mL(mNext)} 주문 부족</th><th>남는 능력 제안</th><th>받을 톤(결정)</th></tr></thead><tbody>${alloc}</tbody></table></div></section>`;
    $('ct-main').insertAdjacentHTML('beforeend', extra);
    document.querySelectorAll('select.decs').forEach((b) => b.addEventListener('change', () => PS.set(`D|${b.dataset.con}`, b.value || null, `주문 결정: ${b.selectedOptions[0].textContent}`)));
    document.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', () => PS.set(`D|${b.dataset.pin}`, `d:${b.dataset.d}`, '주간 조정: 당기기')));
    document.querySelectorAll('#wf td').forEach((td) => { const tr = td.parentElement, i = [...tr.children].indexOf(td), gi = Math.floor((i - 1) / 5), lab = tr.children[0].textContent; if (i >= 1 && (i - 1) % 5 === 2 && gi < FAM.length) { td.style.cursor = 'pointer'; td.addEventListener('click', () => { const w = W.find((x) => lab.startsWith(md(x))); if (w) { st.wsel = `${w}|${FAM[gi]}`; keep(); draw(); } }); } });
    document.querySelectorAll('#wf td.memo').forEach((td) => td.addEventListener('dblclick', (e) => { e.stopPropagation(); const k = td.dataset.k, v = prompt('메모(수주 결정 사유)', PS.get(k, '')); if (v != null) PS.set(k, v.trim() || null, '주간 조정 메모'); }, true));
  }

  /* ---------- 업무 순서 ---------- */
  const LINK = { psdecide: ['ps_decide.html', '생산 결정'], psfit: ['ps_fit.html', '주문 맞추기'], psledger: ['ps_ledger.html', '판생 계획표'], psplating: ['ps_plating.html', '도금 월차'], pscolor: ['ps_color.html', '컬러 월차'], psweek: ['ps_week.html', '주간 조정'], pscapa: ['ps_capa.html', '생산 가능'], psmat: ['ps_mat.html', '도금 소재'], pslog: ['ps_log.html', '이력·회차'], wseq: ['pyeonseong.html', '주간 편성'] };
  const FLOW = {
    day: { t: '매일', when: '평일 아침', rows: [
      ['07:35', '자동 갱신', '', 'MES 주문·생산·휴지·재고를 올림. 주문·컬러 배정·도금 실적 칸이 저절로 바뀜', '위 줄 \'실적 ○/○까지\'가 어제 날짜'],
      ['08:00', '판생 담당', 'psweek', '이번 달 진행 표에서 라인별 \'오늘까지 실적 − 계획\'과 \'월말 전망\'을 봄', '월말 전망이 월 계획보다 −500t 넘게 모자라면 그 라인 남은 날 하루 톤·휴지를 도금 월차에서 다시 봄'],
      ['08:05', '판생 담당', 'psplating', '가장 앞 달 탭부터 위 점검 줄(빨강)을 봄. 목표 차이·AL-STS 배정·소재 월말 재고', '빨강 0. 남으면 전환 날짜(날짜 칸)·하루 톤(연노랑)을 고침'],
      ['수시', '작업지시 담당', 'psplating', '설비 정지·롤 손상으로 쉬는 날이 생기면 전환·휴지 줄 그 날 칸을 두 번 눌러 휴지 넣기', '남은 날 계획이 다시 계산되고 목표 차이가 점검 줄에 뜸'],
      ['수시', '컬러 담당', 'pscolor', '컬러 휴지·샘플·시험 로 가동시간이 바뀌면 그 날 가동시간 칸(연노랑)을 고침', '컬러 계가 판생 계획표 대비 몇 t 인지 위 카드로 확인'],
    ] },
    wed: { t: '매주 수요일(작업 순서 셋업 날)', when: '수요일', rows: [
      ['09:00', '판생 담당', 'psweek', '주간 조정 열기. 주문 확보와 수주 결정 표의 빨강(누적 여유 −) 강종과 주를 확인', '빨강 강종·주를 수주 담당에게 넘김(화면 주소 공유)'],
      ['10:00', '수주 담당', 'psweek', '빨강 주는 당기기·납기 협의, 초록(여유 +) 주는 더 받기. 결정 톤을 \'수주 결정\' 칸에 +/−로, \'메모\' 칸을 두 번 눌러 사유', '결정 칸에 값이 있고 메모가 있음. 이력·회차에 남음'],
      ['11:00', '판생 담당', 'psplating', '수주 결정 때문에 강종 날 수를 바꿔야 하면 전환 날짜를 옮김(자동 전환 대비 며칠)', '점검 줄 빨강 0 · 주간 조정 누적 여유가 0 이상으로 돌아옴'],
      ['오후', '작업지시 담당', 'wseq', '다음 주 강종 흐름(주간 조정 \'주별 라인 계획\')대로 주간 편성·작업 순서 확정', '주간 편성 강종 순서 = 도금 월차 강종 흐름'],
      ['퇴근 전', '판생 담당', 'pslog', '\'○/○ 주간 조정\' 이름으로 회차 저장', '회차 목록에 이번 주가 생김. 다음 주 판생 계획표 비교 기준으로 고를 수 있음'],
    ] },
    mon: { t: '매월 판생', when: '판매계획 마감 무렵(11일 경)', rows: [
      ['마감 날', '판생 담당', 'psledger', '판매그룹이 낸 다음 3달 판매·생산 계획을 판생 계획표 연노랑 칸에(판매그룹 엑셀에서 복사해 붙여넣기 가능) 또는 [엑셀로 내보내기] 한 파일의 판생 계획표 시트에 쓰고 [엑셀 가져오기]', '판생 계획표 위 카드 도금·MAC·AZ·AL·컬러 생산 = 판매그룹 합'],
      ['마감 +1일', '판생 담당', 'pscapa', '생산 가능 화면에서 강종별 \'주문으로 차는 곳\'과 달 목표·가용일·차이 확인', '차이 빨강(목표 못 채움) 달이 있으면 판생 계획표를 줄이거나 월차에서 날을 늘림'],
      ['마감 +1일', '판생 담당', 'psmat', '도금 소재 월말 재고(지금 판)가 음수인 달이 없는지. 사용량 기준을 \'도금 월차 생산\'으로도 바꿔 봄', '월말 재고 0 이상. 모자라면 P사·수입 구매 칸(연노랑)을 고쳐 구매팀에 요청'],
      ['마감 +2일', '판생 담당', 'psplating', '다음 달 탭: 자동 전환안을 보고 M/C·S/D 날짜 확정, 하루 톤 확인, AL-STS 시작일 확정', '점검 줄 빨강 0, 1CGL AZ·2CGL MAC 목표 차이 0'],
      ['마감 +2일', '컬러 담당', 'pscolor', '다음 달 컬러 휴지·샘플·시험 를 가동시간 칸에 반영', '컬러 계 ≥ 판생 계획표 컬러 목표'],
      ['판생 회의', '팀장·임원', 'psledger', '판생 계획표(비교 기준 = 지난 판생)·도금 월차·생산 가능 화면으로 회의. 배포가 필요하면 [엑셀로 내보내기]', '회의 결정을 바로 연노랑 칸에 고침'],
      ['회의 직후', '판생 담당', 'pslog', '\'○월 판생 확정\' 이름으로 회차 저장. 다음 달 판생 계획표 비교 기준이 됨', '회차 목록에 확정판이 생김'],
    ] },
    start: { t: '처음 옮겨 오기(병행)', when: '12월 판생 ~ 1월 판생', rows: [
      ['1주', '판생 담당', 'psledger', '11/17 판생 엑셀과 판생 계획표·도금 월차·소재 숫자가 같은지 눈으로 대조(작업판 모델 검산 97건 일치)', '다른 칸이 있으면 의견 버튼으로 알림'],
      ['1달', '판생 담당', 'psledger', '자기 엑셀도 쓰고 같은 입력을 작업판에도. 매주 수요일 두 판 차이를 봄', '차이 0 또는 사유가 설명됨'],
      ['그 뒤', '판생 담당', '', '작업판이 원본, 엑셀은 내보내기로만. 판생 회의를 작업판 화면으로', '판생 엑셀 중단(가격·손익 시트만 사내 엑셀)'],
    ] },
  };
  const GUIDE = [
    ['psledger', '다음 달들 강종·시장별로 얼마 만들고 얼마 팔고 재고가 얼마 남나', '부서·시장 줄의 생산·판매(연노랑)', '위 카드 = 보는 첫 달 도금·MAC·AZ·AL·컬러. 비교 기준(지난 판생·R/P·경영·우리 회차) 대비 증감, 재고 전망 빨강 = 음수'],
    ['psplating', '이 달 1·2CGL 은 언제 AZ·AL·MAC·STS 를 돌리고 M/C·S/D 는 언제인가', '전환 날짜, AL-STS 시작일, 하루 톤, 휴지(전환·휴지 줄 두 번 누름)', '색 띠 = 강종 순서. 점검 줄 빨강 = 목표 차이·STS 부족·소재 음수. 목표는 판생 계획표에서 자동'],
    ['pscolor', '이 달 컬러 라인별 가동시간과 생산량이 판생 계획표를 채우나', '라인·날짜별 가동시간', '노랑 칸 = 휴지·청소·샘플·시험(엔진). 위 카드 컬러 계 vs 판생 계획표'],
    ['psweek', '이번 달은 계획대로 가고 있나, 강종별로 주문이 계획을 채우나', '주×강종 수주 결정 톤, 메모(두 번 누름)', '월말 전망 · 누적 여유 빨강 = 납기 주문이 계획보다 많음(당기기·납기 협의), 초록 = 더 받을 수 있음'],
    ['pscapa', '들어온 미생산 주문을 다 만들려면 강종별로 며칠 필요하고 몇 월까지 차 있나', '없음(보기)', '필요 일수 vs 달별 가용일 누계. \'주문으로 차는 곳\' 이 다음 달이면 그 뒤 달은 주문을 더 받아야 함'],
    ['psmat', '도금 소재(F/H)가 달마다 모자라지 않나', 'P사·수입·외부 구매량', '월말 재고(지금 판). 사용량 기준을 판생 계획표/월차로 바꿔 볼 수 있음. 마지막 줄 = 판생 엑셀과 차이'],
    ['pslog', '누가 언제 무엇을 바꿨나, 확정 판은 무엇인가', '회차 이름', '회차 = 그 시점 판을 얼림. 판생 계획표 비교 기준으로 고를 수 있음'],
  ];
  /* ---------- 업무 순서(11/19 사용자 '이미지로, 이해하기 쉽게, 매일·수요일 표 말고 전체 그림') ---------- */
  const STEPS = [
    { n: '①', p: 'psdecide', t: '생산 결정', q: '그룹마다 이번 달 얼마 만드나', see: ['그룹·강종별 월초 재고 · 판매 계획 · 들어온 주문'], dec: ['판매 계획과 재고 출하를 넣으면 생산 = 판매 − 재고 출하', '위 카드: 강종별 남음·부족(사양 톤파워로 계산)', '부족하면 재고 출하 늘리기 · AZ·MAC 날 줄이기 · 판매 조정', '[시험해 보기]로 맞춰 본 뒤 반영'] },
    { n: '②', p: 'psfit', t: '주문 맞추기', q: '그 생산량에 어떤 주문을 넣나', see: ['그룹×강종 생산 vs 주문, 주문마다 사이즈·사양·소재·같은 사양 재고'], dec: ['주문이 넘치면 주문마다 이번 달 · 재고에서 출하 · 다음 달', '주문이 모자라면 그룹에 주문 요청(반순·사양·주문 마감일)', '꼭 넣어야 하면 생산량 맞춤(①로)'] },
    { n: '③', p: 'psplating', t: '도금 월차', q: '며칠에 무엇을, 왜 만드나', see: ['강종 구간·M/C·S/D 날짜, 날짜 칸 = 강종·톤·주된 그룹'], dec: ['날짜를 누르면 계약번호·사이즈·순서·이유(배 입항·납기·컬러 투입)', '박물·후물 배치: 주문을 그 날 고정 · 다음 달로', '전환 날짜를 옮기면 지연 주문이 바로 바뀜'] },
    { n: '④', p: 'psmat', t: '도금 소재', q: '소재가 제때 들어오나', see: ['소재 종류별 3달 필요 vs 재고·입고 예정'], dec: ['첫 부족일 · 발주 마감 · 다음 발주 확인', '늦으면 발주 요청, 못 맞추면 그 주문을 다음 달로(②)'] },
    { n: '⑤', p: 'psweek', t: '주간 조정', q: '계획대로 가고 있나', see: ['이번 달 실적 vs 계획 · 월말 전망', '강종별 누적 여유(계획 − 납기 주문)'], dec: ['− 칸을 누르면 원인 주문과 조치(당기기 · 전환 당김 · 납기 협의)', '남는 능력은 그룹별 수주 배분'] },
  ];
  function flow(B) {
    const W = 1540, H = 930, bx = (i) => 40 + i * 300, by = 200, bw = 260, bh = 390;
    const box = (s, i) => `<a class="wf-b" href="${HREF(s.p)}" style="left:${bx(i)}px;top:${by}px;width:${bw}px;height:${bh}px"><div class="wf-n">${s.n} ${s.t}</div><div class="wf-q">${s.q}</div><div class="wf-s">${s.see.map((x) => `<p>${x}</p>`).join('')}</div><ul>${s.dec.map((x) => `<li>${x}</li>`).join('')}</ul></a>`;
    const arrows = STEPS.slice(0, -1).map((_, i) => `<line x1="${bx(i) + bw + 2}" y1="${by + 70}" x2="${bx(i + 1) - 6}" y2="${by + 70}" class="ar"/>`).join('')
      + STEPS.map((_, i) => `<line x1="${bx(i) + bw / 2}" y1="132" x2="${bx(i) + bw / 2}" y2="${by - 6}" class="ad"/>`).join('');
    const yA = by + bh + 45, yB = by + bh + 95;
    const loops = `<path d="M${bx(3) + bw / 2} ${by + bh + 4} V${yA} H${bx(1) + bw / 2} V${by + bh + 10}" class="lp"/><text x="${bx(1) + bw / 2 + 150}" y="${yA - 10}" class="lt">소재가 모자라면 주문을 다음 달로</text>
      <path d="M${bx(4) + bw / 2} ${by + bh + 4} V${yB} H${bx(0) + bw / 2} V${by + bh + 10}" class="lp"/><text x="${bx(3) + bw / 2}" y="${yB - 10}" class="lt">판매·주문·실적이 바뀌면 ①부터 다시 (시험해 보기로 먼저 맞춰 봄)</text>
      <path d="M${bx(2) + bw / 2} ${by + bh + 4} V${yB + 60}" class="ad2"/>`;
    const html = `<div class="wf-wrap"><div class="wf" style="width:${W}px;height:${H}px">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#1f5fae"/></marker><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b45309"/></marker><marker id="ah3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#98a2b3"/></marker></defs>${arrows}${loops}</svg>
      <div class="wf-top" style="left:40px;top:20px;width:${W - 80}px"><b>자동으로 들어오는 자료(2시간마다 MES)</b><span>미생산 주문(사이즈·사양·배 일정·납기)</span><span>그룹·강종·사양별 재고(코일)</span><span>라인 생산 실적</span><span>소재 재고·발주·입고</span><span>판생 엑셀 기준판(11/17)</span></div>
      ${STEPS.map(box).join('')}
      <a class="wf-b wf-end" href="${HREF('pslog')}" style="left:${bx(1) + 30}px;top:${yB + 70}px;width:${bx(3) - bx(1) + bw - 60}px;height:140px"><div class="wf-n">⑥ 확정·공유</div><div class="wf-q">판생 회의 뒤 '○월 판생 확정'으로 회차 저장 · 판생 계획표(판생 엑셀 양식)로 회의 · 엑셀로 내보내기</div><ul><li>칸을 고칠 때마다 누가·언제·이전 값이 남음 · 시험해 보기 중에는 저장 안 됨</li></ul></a>
    </div></div>`;
    $('ct-main').innerHTML = `${PSG.bar()}<section class="card"><h2>판생 일하는 순서 <small>위 자료가 자동으로 들어오고, ①에서 ⑤로 결정. 상자를 누르면 그 화면으로</small></h2>${html}</section>`;
    const fit = () => { const w = document.querySelector('.wf-wrap'), f = document.querySelector('.wf'); if (!w || !f) return; const k = Math.min(1, w.clientWidth / W); f.style.transform = `scale(${k})`; w.style.height = `${H * k}px`; };
    fit(); addEventListener('resize', fit);
  }


  /* ---------- 이력·회차 ---------- */
  function log(B) {
    const L = PS.logs().slice().reverse(), R = PS.revs().slice().reverse();
    const lab = (k) => { const p = k.split('|'); if (p[0] === 'L') { const x = B.ledger.rows.find((y) => String(y.r) === p[1]); const sec = x ? B.ledger.rows.find((y) => y.r === x.sec) : null; return `판생 계획표 ${mL(p[2])} ${sec ? sec.name + ' ' : ''}${x ? x.lab : p[1]} ${p[3] === 'p' ? '생산' : '판매'}`; } if (p[0] === 'M') { const x = B.mat.rows.find((y) => String(y.r) === p[1]); return `소재 ${mL(p[2])} ${x ? x.lab : ''}`; } if (p[0] === 'P') return p[4] === 'rate' ? `월차 ${mL(p[1])} ${p[2]} ${p[3]} 하루 톤` : p[3] === 'sw' ? `월차 ${mL(p[1])} ${p[2]} 전환 날짜` : `월차 ${p[2]} ${md(p[3])} 휴지`; return k; };
    const val = (v) => (v == null ? '기준판' : typeof v === 'number' ? n0(v) : String(v).split(',').map((d) => (/^\d{4}-/.test(d) ? md(d) : d)).join(', '));
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>회차 <small>지금 판에 이름을 붙여 남김. 판생 계획표 비교 기준으로 고를 수 있음</small></h2>
        <div class="ps-ctl"><input id="ps-rn" placeholder="예: 12월 판생 확정" style="min-width:240px"><button type="button" class="btn" id="ps-rs">지금 판을 회차로 저장</button></div>
        ${R.length ? PSG.table({ id: 'trv', head: [[{ v: '회차' }, { v: '저장 시각' }, { v: '누가' }]], rows: R.map((r) => ({ cells: [{ v: r.name, t: 'lab' }, { v: String(r.at).slice(0, 16).replace('T', ' ') }, { v: r.by || '' }] })) }) : '<p class="ps-ctl">저장한 회차 없음</p>'}</section>
      <section class="card"><h2>입력 이력 <small>${L.length}건 · 최신부터</small></h2>
        ${L.length ? '' : '<p class="ps-chk">아직 고친 칸 없음. 판생 계획표·월차·소재 화면에서 연노랑 칸을 고치면 여기에 쌓임</p>'}${PSG.table({ id: 'tg', head: [[{ v: '시각' }, { v: '누가' }, { v: '고친 칸' }, { v: '이전' }, { v: '지금' }, { v: '사유' }]], rows: L.slice(0, 300).flatMap((e) => e.cells.slice(0, 20).map(([k, v, p], i) => ({ cells: [{ v: i ? '' : String(e.at).slice(5, 16).replace('T', ' ') }, { v: i ? '' : e.by }, { v: lab(k) }, { v: val(p) }, { v: val(v) }, { v: i ? '' : e.why || '' }] }))) })}</section>`;
    $('ps-rs').onclick = async () => { const n = $('ps-rn').value.trim(); if (!n) { PSG.toast('회차 이름을 넣어 주세요'); return; } try { await PS.saveRev(n); PSG.toast('회차 저장함'); } catch (e) { PSG.toast('저장 실패 ' + e.message); } };
  }

  const VIEWS = { psorders: orders, pstoday: today, psfit: fit, psdecide: decide, psledger: ledger, psplating: plating, pscapa: capa, psmat: mat, pscolor: color, pslog: log, psweek: week, psflow: flow };
  function draw() {
    const B = PS.base(); if (!B) return;
    if (PAGE === 'psdecide') { PSG.onSet = (k, v, why) => decideSet([[k, v]], why); PSG.onSetMany = (pairs, why) => decideSet(pairs, why); PSG.valueOf = (k) => { if (k.startsWith('X|')) { const [, r, m] = k.split('|'), c = PS.ledger()[m][r]; return c.s - c.p; } return PS.inputValue(k); }; }
    const y = scrollY; (VIEWS[PAGE] || ledger)(B); PSG.bind($('ct-main')); PSG.bindBar(); scrollTo(0, y);
    if (window.UI && UI.sub) UI.sub(`기준판 ${B.rev} · 입력 기록 ${PS.logs().length}건`);
    if ($('pan-s')) $('pan-s').textContent = `주문 ${B.ordersAsOf || ''} · 실적 ${String(B.actualAsOf || '').slice(0, 10)}까지 · 변경 감지 ${String((B.changes || {}).built || '').slice(5, 16).replace('T', ' ')}`;
  }
  document.addEventListener('ps-redraw', draw);
  PS.on(draw);
  PS.boot((B) => { if (!B) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; } draw(); });
})();
