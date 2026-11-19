/* 판생 작업판 화면들(원장 · 도금 월차 · 생산 가능 · 소재 · 컬러 월차 · 이력·회차) — 어느 화면인지는 <header data-page> 로 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PAGE = (document.getElementById('shell') || {}).dataset.page;
  const n0 = PS.n0, sg = PS.sg, md = PS.md, mL = PS.mLab;
  let st = { m0: null, cmp: 0, m: null, src: 'ledger' };
  try { Object.assign(st, JSON.parse(localStorage.getItem('ps-ui-' + PAGE) || '{}')); } catch (e) { /* 무시 */ }
  const keep = () => { try { localStorage.setItem('ps-ui-' + PAGE, JSON.stringify(st)); } catch (e) { /* 무시 */ } };
  PSG.valueOf = PS.inputValue;

  /* ---------- 원장 ---------- */
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
      const cells = [{ v: x.kind === 'sec' || x.kind === 'sum' ? (x.kind === 'sum' ? '합계' : x.name) : '', t: 'lab' }, { v: ind + x.lab + (x.hid ? ' (숨김 줄)' : ''), t: 'lab' }];
      for (const m of M) {
        const c = L[m][x.r], cv = cmpV(m, x.r), d = cv == null ? null : c.p - cv;
        cells.push({ v: c.p, t: isIn ? 'in' : 'calc', k: isIn ? `L|${x.r}|${m}|p` : null, cls: 'mb' });
        cells.push({ v: cv, t: 'auto' });
        cells.push({ v: d, f: 'sg', cls: d > 0 ? 'up' : d < 0 ? 'dn' : '' });
        cells.push({ v: x.lab.replace(/\s/g, '') === '자가' && x.kind === 'mkt' ? c.s : c.s, t: isIn ? 'in' : 'calc', k: isIn ? `L|${x.r}|${m}|s` : null });
        cells.push({ v: c.sf, cls: c.sf < 0 ? 'neg' : '' });
      }
      return { cls: x.kind + (x.hid ? ' hid' : ''), cells };
    });
    const sec = (nm) => L[M[0]][PS.secRow(nm).r];
    const opts = (B.ledger.v[M[0]] || {}).base || [];
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>판생 원장 <small>강종×시장 월 생산·판매·재고(톤) · 연노랑 = 입력 · 생산·판매를 고치면 재고·합계·월차·소재가 바로 바뀜</small></h2>
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
        rows.push({ cells: [{ v: l, t: 'lab' }, { v: g, t: 'lab' }, ...Ld.map((x) => ({ v: x.g === g && x.t && !x.sts ? x.t : '', cls: x.g === g && x.t && !x.sts ? g.toLowerCase() : '' })), { v: s }, { v: tg }, { v: tg != null ? s - tg : null, f: 'sg' }, { v: Ld.reduce((a, x) => a + (x.g === g && !x.sts ? (x.ev && x.ev !== '휴지' ? 0.5 : 1) : 0), 0), f: 'd1' }] });
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
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 도금 월차 <small>목표 = 원장 · 하루 톤·전환 날짜·휴지는 고칠 수 있음</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
      <div class="ps-k"><div><span>도금 계</span><b>${n0(tot)}</b><em>목표 ${n0(T.total)} · ${sg(tot - T.total)}</em></div>
        <div><span>AZ · 1CGL</span><b>${n0(PS.sumG(Pm['1CGL'].days, 'AZ'))}</b><em>목표 ${n0(T.AZ)}</em></div>
        <div><span>MAC · 2CGL</span><b>${n0(PS.sumG(Pm['2CGL'].days, 'MAC'))}</b><em>목표 ${n0(T.MAC)}</em></div>
        <div class="${al - T.AL >= 0 ? 'ok' : 'bad'}"><span>AL · 1·2CGL</span><b>${n0(al)}</b><em>목표 ${n0(T.AL)} · ${al - T.AL >= 0 ? '여유' : '부족'} ${n0(Math.abs(al - T.AL))}</em></div></div>
      <div class="ps-seq">${Object.keys(PS.LINES).map((l) => `<div><b>${l}</b> ${seq(l)}</div><div>${swEd(l)}${l === '2CGL' ? stsEd() : ''}</div>`).join('')}</div>
      <ul class="ps-chk">${chk.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul></section>
      <section class="card"><h2>하루 톤 <small>판생 제원 작업일수(주문별 MES 톤파워)에서 낸 값 · 고치면 월차 다시 계산</small></h2>${PSG.table({ id: 'tr', head: [[...Object.entries(PS.LINES).flatMap(([l, gs]) => gs.map((g) => ({ v: `${l} ${g}` }))), { v: '2CGL AL-STS' }]], rows: rateRows })}</section>
      <section class="card"><h2>일별 가동계획 <small>전환·휴지 줄 칸을 두 번 누르면 휴지 넣기/빼기</small></h2>${PSG.table({ id: 'tp', cls: 'pl', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
    document.querySelectorAll('.ps-seq input[type=date]').forEach((inp) => inp.addEventListener('change', () => { const l = inp.dataset.l, cur = Pm[l].sw.slice(); cur[+inp.dataset.i] = inp.value; cur.sort(); PS.set(`P|${m}|${l}|sw`, cur.join(','), '전환 날짜'); }));
    if ($('ps-sts')) $('ps-sts').onchange = (e) => PS.set(`P|${m}|2CGL|stsA`, e.target.value || null, 'STS 시작일');
    if ($('ps-sts-auto')) $('ps-sts-auto').onclick = () => PS.set(`P|${m}|2CGL|stsA`, null, 'STS 자동으로');
    document.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => PS.set(`P|${m}|${b.dataset.auto}|sw`, null, '자동 전환으로')));
    document.querySelectorAll('#tp td.evc').forEach((td) => td.addEventListener('dblclick', (e) => { e.stopPropagation(); const k = td.dataset.k, l = k.split('|')[2], d = k.split('|')[3]; PS.set(k, PS.isDown(l, d) ? 0 : 1, PS.isDown(l, d) ? '휴지 뺌' : '휴지 넣음'); }, true));
  }

  /* ---------- 생산 가능(CAPA) ---------- */
  function capa(B) {
    const L = PS.ledger(), P = PS.plating(L), C = PS.capa(P), ms = Object.keys(P).sort();
    const head = [[{ v: '라인' }, { v: '강종' }, { v: '주문 건수' }, { v: '미생산(t)' }, { v: '필요 일수' }, ...ms.flatMap((m) => [{ v: `${mL(m)} 가용일`, cls: 'mb' }, { v: `${mL(m)}까지` }]), { v: '주문으로 차는 곳' }, { v: '많은 판매그룹' }]];
    const rows = C.map((a) => ({ cells: [{ v: a.ln, t: 'lab' }, { v: a.fam, t: 'lab' }, { v: a.n }, { v: a.t }, { v: a.need, f: 'd1' },
      ...a.by.flatMap((x) => [{ v: x.av, f: 'd1', cls: 'mb' }, { v: x.cum, f: 'd1', cls: x.cum <= a.need ? 'up' : 'dn' }]),
      { v: a.ln === '공용' ? '1·2CGL 공용' : !a.by.some((x) => x.av) ? '월차에 이 강종 없음' : a.until ? `${mL(a.until)} 안` : '그 뒤까지' },
      { v: Object.entries(a.grp).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([g, t]) => `${g} ${n0(t)}`).join(' · ') }] }));
    const tg = ms.map((m) => { const T = P[m].T; return { cells: [{ v: mL(m), t: 'lab' }, ...['AZ', 'MAC', 'AL'].flatMap((g) => { const l = g === 'AZ' ? ['1CGL'] : g === 'MAC' ? ['2CGL'] : ['1CGL', '2CGL']; const av = l.reduce((a, x) => a + PS.daysG(P[m][x].days, g), 0), made = l.reduce((a, x) => a + PS.sumG(P[m][x].days, g), 0); return [{ v: T[g], cls: 'mb' }, { v: av, f: 'd1' }, { v: made - T[g], f: 'sg', cls: made - T[g] < -1 ? 'dn' : '' }]; })] }; });
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>주문으로 어디까지 차 있나 <small>미생산 주문(${esc(B.ordersAsOf)}) × 주문별 MES 톤파워로 낸 필요 일수와 도금 월차 강종 가용일(누적) 비교 · 판생 '종합' 시트 방식</small></h2>
      ${PSG.table({ id: 'tc', head, rows })}</section>
      <section class="card"><h2>달 목표와 월차 <small>원장 목표 · 월차 가용일 · 월차가 만든 양 − 목표</small></h2>
      ${PSG.table({ id: 'tt', head: [[{ v: '달' }, ...['AZ', 'MAC', 'AL'].flatMap((g) => [{ v: `${g} 목표`, cls: 'mb' }, { v: '가용일' }, { v: '차이' }])]], rows: tg })}</section>`;
  }

  /* ---------- 소재 ---------- */
  function mat(B) {
    const L = PS.ledger(), P = PS.plating(L), useW = st.src === 'wolcha', MT = PS.mat(L, P, useW), ms = B.mat.months;
    const rows = B.mat.rows.map((x) => { const isIn = PS.MAT_IN.includes(x.lab); return { cls: /계|재고/.test(x.lab) ? 'sec' : '', cells: [{ v: x.lab, t: 'lab' }, ...ms.map((m) => ({ v: isIn ? PS.inputValue(`M|${x.r}|${m}`) : x.lab === '구매량 계(임가공제외)' ? MT[m].buy : x.v[m], t: isIn ? 'in' : x.lab === '구매량 계(임가공제외)' ? 'calc' : 'auto', k: isIn ? `M|${x.r}|${m}` : null }))] }; });
    rows.push({ cls: 'sec', cells: [{ v: useW ? '도금 생산(월차)' : '도금 생산(원장)', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].prod }))] });
    rows.push({ cells: [{ v: '소재 사용 = (생산 − 임가공) ÷ 수율', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].use }))] });
    rows.push({ cls: 'sec', cells: [{ v: '월말 재고(지금 판)', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].st, cls: MT[m].st < 0 ? 'neg' : '' }))] });
    rows.push({ cells: [{ v: '판생 엑셀 월말 재고 대비', t: 'lab' }, ...ms.map((m) => ({ v: MT[m].st - (MT[m].ref || 0), f: 'sg' }))] });
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>도금 소재(F/H) <small>연노랑 = 구매 입력(P사·수입·외부) · 사용 = 생산 ÷ 그 달 수율 · 판생 도금소재수급 식</small></h2>
      <div class="ps-ctl"><label>사용량 기준 <select id="ps-src"><option value="ledger"${!useW ? ' selected' : ''}>원장 도금 생산(판생 방식)</option><option value="wolcha"${useW ? ' selected' : ''}>도금 월차 생산(AL full 가동)</option></select></label></div>
      ${PSG.table({ id: 'tm', head: [[{ v: '항목' }, ...ms.map((m) => ({ v: mL(m) }))]], rows })}</section>`;
    $('ps-src').onchange = (e) => { st.src = e.target.value; keep(); draw(); };
  }

  /* ---------- 컬러 월차 ---------- */
  function color(B) {
    const ms = Object.keys(B.color).sort().filter((m) => m >= B.months[1]); if (!ms.includes(st.m)) st.m = ms[0];
    const m = st.m, D = PS.days(m), L = PS.ledger(), tg = L[m] ? L[m][PS.secRow('컬러').r].p : null, wk = (d) => new Date(d + 'T00:00:00Z').getUTCDay(), C = PS.color(m);
    const head = [[{ v: '라인' }, { v: '구분' }, ...D.map((d) => ({ v: `${+d.slice(8)}<br>${'일월화수목금토'[wk(d)]}`, raw: true, cls: [0, 6].includes(wk(d)) ? 'we' : '' })), { v: '계' }]];
    const rows = []; let tot = 0; const per = {};
    const lab = { plan: '휴지', test: 'Test', clean: '청소', sd: 'S/D', sample: '샘플' };
    for (const l of PS.CLINES) {
      const X = C[l];
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '휴지·Test', t: 'lab' }, ...X.map((x) => { const e = x.ev.map(([k, mm]) => `${lab[k] || k}${mm >= 1440 ? '' : '<br>' + Math.round(mm / 60) + 'h'}`).join('<br>'); return { v: e, raw: true, cls: e ? 'ev kev' : '' }; }), { v: '' }] });
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '가동시간', t: 'lab' }, ...X.map((x) => ({ v: x.h, f: 'h', t: 'in', k: `C|${m}|${l}|${x.d}|h`, cls: x.h ? '' : 'off', title: `${l} ${md(x.d)} 가동시간(엔진 ${x.h0}h)` })), { v: X.reduce((a, x) => a + x.h, 0) }] });
      const s = X.reduce((a, x) => a + x.t, 0); tot += s; per[l] = s;
      rows.push({ cls: 'sec', cells: [{ v: l, t: 'lab' }, { v: '생산량', t: 'lab' }, ...X.map((x) => ({ v: x.t || '' })), { v: s }] });
    }
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 컬러 월차 <small>컬러 엔진 일별 배정(${esc(B.colorAsOf)}) · 가동시간(연노랑)을 고치면 그 날 생산량 = 시간당 톤 × 시간</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
      <div class="ps-k"><div class="${tot - (tg || 0) >= 0 ? 'ok' : 'bad'}"><span>컬러 계</span><b>${n0(tot)}</b><em>원장 목표 ${n0(tg)} · ${sg(tot - (tg || 0))}</em></div>${PS.CLINES.map((l) => `<div><span>${l}</span><b>${n0(per[l])}</b><em>가동 ${n0(C[l].reduce((a, x) => a + x.h, 0))}시간</em></div>`).join('')}</div>
      ${PSG.table({ id: 'tk', cls: 'pl', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
  }

  /* ---------- 주 롤링 ---------- */
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
      if (worst[0]) advice.push(['bad', `${g}: 납기 지난 주문까지 합쳐 ${md(worst[0])} 주에 ${n0(-worst[1])}t 모자람, ${back ? `${md(back)} 주에 따라잡음` : '보이는 기간 안에 못 따라잡음'}. 그 사이 납기 주문은 당기기·납기 협의, 또는 도금 월차에서 ${g} 날을 앞으로`]);
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
    document.querySelectorAll('#wf td.memo').forEach((td) => td.addEventListener('dblclick', (e) => { e.stopPropagation(); const k = td.dataset.k, v = prompt('메모(수주 결정 사유)', PS.get(k, '')); if (v != null) PS.set(k, v.trim() || null, '주 롤링 메모'); }, true));
  }

  /* ---------- 업무 순서 ---------- */
  const LINK = { psledger: ['ps_ledger.html', '원장'], psplating: ['ps_plating.html', '도금 월차'], pscolor: ['ps_color.html', '컬러 월차'], psweek: ['ps_week.html', '주 롤링'], pscapa: ['ps_capa.html', '생산 가능'], psmat: ['ps_mat.html', '도금 소재'], pslog: ['ps_log.html', '이력·회차'], wseq: ['pyeonseong.html', '주간 편성'] };
  const FLOW = {
    day: { t: '매일', when: '평일 아침', rows: [
      ['07:35', '사내 PC(자동)', '', 'MES 주문·생산·휴지·재고를 올림. 주문·컬러 배정·도금 실적 칸이 저절로 바뀜', '위 줄 \'실적 ○/○까지\'가 어제 날짜'],
      ['08:00', '판생 담당', 'psweek', '이번 달 진행 표에서 라인별 \'오늘까지 실적 − 계획\'과 \'월말 전망\'을 봄', '월말 전망이 월 계획보다 −500t 넘게 모자라면 그 라인 남은 날 하루 톤·휴지를 도금 월차에서 다시 봄'],
      ['08:05', '판생 담당', 'psplating', '가장 앞 달 탭부터 위 점검 줄(빨강)을 봄. 목표 차이·AL-STS 배정·소재 월말 재고', '빨강 0. 남으면 전환 날짜(날짜 칸)·하루 톤(연노랑)을 고침'],
      ['수시', '작업지시 담당', 'psplating', '설비 정지·롤 손상으로 쉬는 날이 생기면 전환·휴지 줄 그 날 칸을 두 번 눌러 휴지 넣기', '남은 날 계획이 다시 계산되고 목표 차이가 점검 줄에 뜸'],
      ['수시', '컬러 담당', 'pscolor', '컬러 휴지·샘플·Test 로 가동시간이 바뀌면 그 날 가동시간 칸(연노랑)을 고침', '컬러 계가 원장 목표 대비 몇 t 인지 위 카드로 확인'],
    ] },
    wed: { t: '매주 수요일(작업 순서 셋업 날)', when: '수요일', rows: [
      ['09:00', '판생 담당', 'psweek', '주 롤링 열기. 주문 확보와 수주 결정 표의 빨강(누적 여유 −) 강종과 주를 확인', '빨강 강종·주를 수주 담당에게 넘김(화면 주소 공유)'],
      ['10:00', '수주 담당', 'psweek', '빨강 주는 당기기·납기 협의, 초록(여유 +) 주는 더 받기. 결정 톤을 \'수주 결정\' 칸에 +/−로, \'메모\' 칸을 두 번 눌러 사유', '결정 칸에 값이 있고 메모가 있음. 이력·회차에 남음'],
      ['11:00', '판생 담당', 'psplating', '수주 결정 때문에 강종 날 수를 바꿔야 하면 전환 날짜를 옮김(자동 전환 대비 며칠)', '점검 줄 빨강 0 · 주 롤링 누적 여유가 0 이상으로 돌아옴'],
      ['오후', '작업지시 담당', 'wseq', '다음 주 강종 흐름(주 롤링 \'주별 라인 계획\')대로 주간 편성·작업 순서 확정', '주간 편성 강종 순서 = 도금 월차 강종 흐름'],
      ['퇴근 전', '판생 담당', 'pslog', '\'○/○ 주 롤링\' 이름으로 회차 저장', '회차 목록에 이번 주가 생김. 다음 주 원장 비교 기준으로 고를 수 있음'],
    ] },
    mon: { t: '매월 판생', when: '판매계획 마감 무렵(11일 경)', rows: [
      ['마감 날', '판생 담당', 'psledger', '판매그룹이 낸 다음 3달 판매·생산 계획을 원장 연노랑 칸에(판매그룹 엑셀에서 복사해 붙여넣기 가능) 또는 [엑셀로 내보내기] 한 파일의 원장 시트에 쓰고 [엑셀 가져오기]', '원장 위 카드 도금·MAC·AZ·AL·컬러 생산 = 판매그룹 합'],
      ['마감 +1일', '판생 담당', 'pscapa', '생산 가능 화면에서 강종별 \'주문으로 차는 곳\'과 달 목표·가용일·차이 확인', '차이 빨강(목표 못 채움) 달이 있으면 원장 목표를 줄이거나 월차에서 날을 늘림'],
      ['마감 +1일', '판생 담당', 'psmat', '도금 소재 월말 재고(지금 판)가 음수인 달이 없는지. 사용량 기준을 \'도금 월차 생산\'으로도 바꿔 봄', '월말 재고 0 이상. 모자라면 P사·수입 구매 칸(연노랑)을 고쳐 구매팀에 요청'],
      ['마감 +2일', '판생 담당', 'psplating', '다음 달 탭: 자동 전환안을 보고 M/C·S/D 날짜 확정, 하루 톤 확인, AL-STS 시작일 확정', '점검 줄 빨강 0, 1CGL AZ·2CGL MAC 목표 차이 0'],
      ['마감 +2일', '컬러 담당', 'pscolor', '다음 달 컬러 휴지·샘플·Test 를 가동시간 칸에 반영', '컬러 계 ≥ 원장 컬러 목표'],
      ['판생 회의', '팀장·임원', 'psledger', '원장(비교 기준 = 지난 판생)·도금 월차·생산 가능 화면으로 회의. 배포가 필요하면 [엑셀로 내보내기]', '회의 결정을 바로 연노랑 칸에 고침'],
      ['회의 직후', '판생 담당', 'pslog', '\'○월 판생 확정\' 이름으로 회차 저장. 다음 달 원장 비교 기준이 됨', '회차 목록에 확정판이 생김'],
    ] },
    start: { t: '처음 옮겨 오기(병행)', when: '12월 판생 ~ 1월 판생', rows: [
      ['1주', '판생 담당', 'psledger', '11/17 판생 엑셀과 원장·도금 월차·소재 숫자가 같은지 눈으로 대조(작업판 모델 검산 97건 일치)', '다른 칸이 있으면 의견 버튼으로 알림'],
      ['1달', '판생 담당', 'psledger', '자기 엑셀도 쓰고 같은 입력을 작업판에도. 매주 수요일 두 판 차이를 봄', '차이 0 또는 사유가 설명됨'],
      ['그 뒤', '판생 담당', '', '작업판이 원본, 엑셀은 내보내기로만. 판생 회의를 작업판 화면으로', '판생 엑셀 중단(가격·손익 시트만 사내 엑셀)'],
    ] },
  };
  const GUIDE = [
    ['psledger', '다음 달들 강종·시장별로 얼마 만들고 얼마 팔고 재고가 얼마 남나', '부서·시장 줄의 생산·판매(연노랑)', '위 카드 = 보는 첫 달 도금·MAC·AZ·AL·컬러. 비교 기준(지난 판생·R/P·경영·우리 회차) 대비 증감, 재고 전망 빨강 = 음수'],
    ['psplating', '이 달 1·2CGL 은 언제 AZ·AL·MAC·STS 를 돌리고 M/C·S/D 는 언제인가', '전환 날짜, AL-STS 시작일, 하루 톤, 휴지(전환·휴지 줄 두 번 누름)', '색 띠 = 강종 순서. 점검 줄 빨강 = 목표 차이·STS 부족·소재 음수. 목표는 원장에서 자동'],
    ['pscolor', '이 달 컬러 라인별 가동시간과 생산량이 원장 목표를 채우나', '라인·날짜별 가동시간', '노랑 칸 = 휴지·청소·샘플·Test(엔진). 위 카드 컬러 계 vs 원장 목표'],
    ['psweek', '이번 달은 계획대로 가고 있나, 강종별로 주문이 계획을 채우나', '주×강종 수주 결정 톤, 메모(두 번 누름)', '월말 전망 · 누적 여유 빨강 = 납기 주문이 계획보다 많음(당기기·납기 협의), 초록 = 더 받을 수 있음'],
    ['pscapa', '들어온 미생산 주문을 다 만들려면 강종별로 며칠 필요하고 몇 월까지 차 있나', '없음(보기)', '필요 일수 vs 달별 가용일 누계. \'주문으로 차는 곳\' 이 다음 달이면 그 뒤 달은 주문을 더 받아야 함'],
    ['psmat', '도금 소재(F/H)가 달마다 모자라지 않나', 'P사·수입·외부 구매량', '월말 재고(지금 판). 사용량 기준을 원장/월차로 바꿔 볼 수 있음. 마지막 줄 = 판생 엑셀과 차이'],
    ['pslog', '누가 언제 무엇을 바꿨나, 확정 판은 무엇인가', '회차 이름', '회차 = 그 시점 판을 얼림. 원장 비교 기준으로 고를 수 있음'],
  ];
  function flow(B) {
    const td = (CT.today && CT.today()) || new Date().toISOString().slice(0, 10), dow = new Date(td + 'T00:00:00Z').getUTCDay(), dd = +td.slice(8);
    const today = ['day', ...(dow === 3 ? ['wed'] : []), ...(dd >= 9 && dd <= 16 ? ['mon'] : [])];
    const lk = (p) => (p && LINK[p] ? `<a class="btn sub sm" href="preview/${LINK[p][0]}">${LINK[p][1]}</a>` : '');
    const tbl = (key) => { const F = FLOW[key]; return `<section class="card${today.includes(key) ? ' today' : ''}" id="f-${key}"><h2>${F.t} <small>${F.when}${today.includes(key) ? ' · 오늘 할 일' : ''}</small></h2>
      <div class="psg-w"><table class="psg flow"><thead><tr><th>순서</th><th>언제</th><th>누가</th><th>화면</th><th>할 일</th><th>끝 기준</th></tr></thead><tbody>${F.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r[0])}</td><td><b>${esc(r[1])}</b></td><td>${lk(r[2])}</td><td class="wrap">${esc(r[3])}</td><td class="wrap">${esc(r[4])}</td></tr>`).join('')}</tbody></table></div></section>`; };
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>오늘(${md(td)} ${'일월화수목금토'[dow]}) 할 일</h2><div class="ps-today">${today.map((k) => `<a href="#f-${k}">${FLOW[k].t} ${FLOW[k].rows.length}가지</a>`).join('')}</div>
        <p class="ps-rule">입력은 연노랑 칸만 · 고친 칸은 파란 삼각형, 오른쪽 클릭 = 누가 언제 고쳤나 · 화면 위 줄 [엑셀로 내보내기]·[엑셀 가져오기]로 엑셀에서 일해도 같음</p></section>
      ${['day', 'wed', 'mon', 'start'].map(tbl).join('')}
      <section class="card" id="f-guide"><h2>화면 안내 <small>화면마다 답하는 질문 · 입력 칸 · 보는 법</small></h2>
      <div class="psg-w"><table class="psg flow"><thead><tr><th>화면</th><th>답하는 질문</th><th>입력 칸(연노랑)</th><th>보는 법</th></tr></thead><tbody>${GUIDE.map((r) => `<tr><td>${lk(r[0])}</td><td class="wrap"><b>${esc(r[1])}</b></td><td class="wrap">${esc(r[2])}</td><td class="wrap">${esc(r[3])}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ---------- 이력·회차 ---------- */
  function log(B) {
    const L = PS.logs().slice().reverse(), R = PS.revs().slice().reverse();
    const lab = (k) => { const p = k.split('|'); if (p[0] === 'L') { const x = B.ledger.rows.find((y) => String(y.r) === p[1]); const sec = x ? B.ledger.rows.find((y) => y.r === x.sec) : null; return `원장 ${mL(p[2])} ${sec ? sec.name + ' ' : ''}${x ? x.lab : p[1]} ${p[3] === 'p' ? '생산' : '판매'}`; } if (p[0] === 'M') { const x = B.mat.rows.find((y) => String(y.r) === p[1]); return `소재 ${mL(p[2])} ${x ? x.lab : ''}`; } if (p[0] === 'P') return p[4] === 'rate' ? `월차 ${mL(p[1])} ${p[2]} ${p[3]} 하루 톤` : p[3] === 'sw' ? `월차 ${mL(p[1])} ${p[2]} 전환 날짜` : `월차 ${p[2]} ${md(p[3])} 휴지`; return k; };
    const val = (v) => (v == null ? '기준판' : typeof v === 'number' ? n0(v) : String(v).split(',').map((d) => (/^\d{4}-/.test(d) ? md(d) : d)).join(', '));
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>회차 <small>지금 판에 이름을 붙여 남김. 원장 비교 기준으로 고를 수 있음</small></h2>
        <div class="ps-ctl"><input id="ps-rn" placeholder="예: 12월 판생 확정" style="min-width:240px"><button type="button" class="btn" id="ps-rs">지금 판을 회차로 저장</button></div>
        ${R.length ? PSG.table({ id: 'trv', head: [[{ v: '회차' }, { v: '저장 시각' }, { v: '누가' }]], rows: R.map((r) => ({ cells: [{ v: r.name, t: 'lab' }, { v: String(r.at).slice(0, 16).replace('T', ' ') }, { v: r.by || '' }] })) }) : '<p class="ps-ctl">저장한 회차 없음</p>'}</section>
      <section class="card"><h2>입력 이력 <small>${L.length}건 · 최신부터</small></h2>
        ${L.length ? '' : '<p class="ps-chk">아직 고친 칸 없음. 원장·월차·소재 화면에서 연노랑 칸을 고치면 여기에 쌓임</p>'}${PSG.table({ id: 'tg', head: [[{ v: '시각' }, { v: '누가' }, { v: '고친 칸' }, { v: '이전' }, { v: '지금' }, { v: '사유' }]], rows: L.slice(0, 300).flatMap((e) => e.cells.slice(0, 20).map(([k, v, p], i) => ({ cells: [{ v: i ? '' : String(e.at).slice(5, 16).replace('T', ' ') }, { v: i ? '' : e.by }, { v: lab(k) }, { v: val(p) }, { v: val(v) }, { v: i ? '' : e.why || '' }] }))) })}</section>`;
    $('ps-rs').onclick = async () => { const n = $('ps-rn').value.trim(); if (!n) { PSG.toast('회차 이름을 넣어 주세요'); return; } try { await PS.saveRev(n); PSG.toast('회차 저장함'); } catch (e) { PSG.toast('저장 실패 ' + e.message); } };
  }

  const VIEWS = { psledger: ledger, psplating: plating, pscapa: capa, psmat: mat, pscolor: color, pslog: log, psweek: week, psflow: flow };
  function draw() {
    const B = PS.base(); if (!B) return;
    const y = scrollY; (VIEWS[PAGE] || ledger)(B); PSG.bind($('ct-main')); PSG.bindBar(); scrollTo(0, y);
    if (window.UI && UI.sub) UI.sub(`기준판 ${B.rev} · 입력 기록 ${PS.logs().length}건`);
  }
  document.addEventListener('ps-redraw', draw);
  PS.on(draw);
  PS.boot((B) => { if (!B) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; } draw(); });
})();
