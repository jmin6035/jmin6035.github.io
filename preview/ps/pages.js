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
    const seq = (l) => runs(Pm[l].days).map((r) => `${r.ev ? `<b class="sw">${r.ev} ${md(r.a)}</b> ` : ''}<span class="sq ${r.g === '휴지' ? 'off' : r.g.toLowerCase()}">${r.g} ${md(r.a)}~${md(r.b)}</span>`).join(' ');
    const swEd = (l) => `${Pm[l].sw.map((d, i) => `<label>${i + 1}차 전환 <input type="date" data-l="${l}" data-i="${i}" value="${d}" min="${m}-01" max="${D[D.length - 1]}"></label>`).join(' ')}${Pm[l].manual ? ` <button type="button" class="btn sub sm" data-auto="${l}">자동으로</button>` : ''}`;
    const wk = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const head = [[{ v: '라인' }, { v: '강종' }, ...D.map((d) => ({ v: `${+d.slice(8)}<br>${'일월화수목금토'[wk(d)]}`, raw: true, cls: [0, 6].includes(wk(d)) ? 'we' : '' })), { v: '계' }, { v: '목표' }, { v: '차이' }, { v: '작업일' }]];
    const rows = [];
    for (const [l, gs] of Object.entries(PS.LINES)) {
      const Ld = Pm[l].days;
      for (const g of gs) {
        const tg = g === MUST[l] ? T[g] : null, s = PS.sumG(Ld, g);
        rows.push({ cells: [{ v: l, t: 'lab' }, { v: g, t: 'lab' }, ...Ld.map((x) => ({ v: x.g === g && x.t ? x.t : '', cls: x.g === g && x.t ? g.toLowerCase() : '' })), { v: s }, { v: tg }, { v: tg != null ? s - tg : null, f: 'sg' }, { v: PS.daysG(Ld, g), f: 'd1' }] });
        if (g === gs[0]) rows.push({ cells: [{ v: l, t: 'lab' }, { v: '전환·휴지', t: 'lab' }, ...Ld.map((x) => ({ v: x.ev, cls: `evc ${x.ev === '휴지' ? 'off' : x.ev ? 'ev' : ''}`, title: '누르면 휴지 넣기/빼기', k: `P|${m}|${l}|${x.d}|down` })), { v: '' }, { v: '' }, { v: '' }, { v: '' }] });
      }
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '가동시간', t: 'lab' }, ...Ld.map((x) => ({ v: x.h })), { v: Ld.reduce((a, x) => a + x.h, 0) }, { v: '' }, { v: '' }, { v: '' }] });
      rows.push({ cls: 'sec', cells: [{ v: l, t: 'lab' }, { v: '계', t: 'lab' }, ...Ld.map((x) => ({ v: x.t || '' })), { v: Ld.reduce((a, x) => a + x.t, 0) }, { v: '' }, { v: '' }, { v: '' }] });
    }
    const rateRows = [{ cells: Object.entries(PS.LINES).flatMap(([l, gs]) => gs.map((g) => ({ v: PS.rate(m, l, g), t: 'in', k: `P|${m}|${l}|${g}|rate`, title: `${l} ${g} 하루 톤` }))) }];
    const MT = PS.mat(L, P, true), cap = PS.capa(P);
    const chk = [];
    for (const [l, g] of [['1CGL', 'AZ'], ['2CGL', 'MAC']]) { const d = PS.sumG(Pm[l].days, g) - T[g]; if (Math.abs(d) >= 1) chk.push(['bad', `${l} ${g} 목표 ${n0(T[g])}t 대비 ${sg(d)}t. 전환 날짜를 옮기거나 하루 톤을 고칠 것`]); }
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
      <div class="ps-seq">${Object.keys(PS.LINES).map((l) => `<div><b>${l}</b> ${seq(l)}</div><div>${swEd(l)}</div>`).join('')}</div>
      <ul class="ps-chk">${chk.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('')}</ul></section>
      <section class="card"><h2>하루 톤 <small>판생 제원 작업일수(주문별 MES 톤파워)에서 낸 값 · 고치면 월차 다시 계산</small></h2>${PSG.table({ id: 'tr', head: [Object.entries(PS.LINES).flatMap(([l, gs]) => gs.map((g) => ({ v: `${l} ${g}` })))], rows: rateRows })}</section>
      <section class="card"><h2>일별 가동계획 <small>전환·휴지 줄 칸을 두 번 누르면 휴지 넣기/빼기</small></h2>${PSG.table({ id: 'tp', cls: 'pl', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
    document.querySelectorAll('.ps-seq input[type=date]').forEach((inp) => inp.addEventListener('change', () => { const l = inp.dataset.l, cur = Pm[l].sw.slice(); cur[+inp.dataset.i] = inp.value; cur.sort(); PS.set(`P|${m}|${l}|sw`, cur.join(','), '전환 날짜'); }));
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
    const m = st.m, D = PS.days(m), L = PS.ledger(), tg = L[m] ? L[m][PS.secRow('컬러').r].p : null, wk = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const head = [[{ v: '라인' }, { v: '구분' }, ...D.map((d) => ({ v: `${+d.slice(8)}<br>${'일월화수목금토'[wk(d)]}`, raw: true, cls: [0, 6].includes(wk(d)) ? 'we' : '' })), { v: '계' }]];
    const rows = []; let tot = 0;
    const lab = { plan: '휴지', test: 'Test', clean: '청소', sd: 'S/D', sample: '샘플' };
    for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) {
      const X = Object.fromEntries((B.color[m][l] || []).map((r) => [r[0], r]));
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '휴지·Test', t: 'lab' }, ...D.map((d) => { const e = (B.colorEv[`${l}|${d}`] || []).map(([k, mm]) => `${lab[k] || k}${mm >= 1440 ? '' : '<br>' + Math.round(mm / 60) + 'h'}`).join('<br>'); return { v: e, raw: true, cls: e ? 'ev kev' : '' }; }), { v: '' }] });
      rows.push({ cells: [{ v: l, t: 'lab' }, { v: '가동시간', t: 'lab' }, ...D.map((d) => ({ v: X[d] ? X[d][1] : '', f: 'd1', cls: X[d] && X[d][1] ? '' : 'off' })), { v: Object.values(X).reduce((a, r) => a + r[1], 0) }] });
      const s = Object.values(X).reduce((a, r) => a + r[2], 0); tot += s;
      rows.push({ cls: 'sec', cells: [{ v: l, t: 'lab' }, { v: '생산량', t: 'lab' }, ...D.map((d) => ({ v: X[d] ? X[d][2] : '' })), { v: s }] });
    }
    $('ct-main').innerHTML = `${PSG.bar()}
      <section class="card"><h2>${mL(m)} 컬러 월차 <small>우리 컬러 엔진 일별 배정(${esc(B.colorAsOf)}) · 판생 컬러가동 양식</small>
        <span class="seg">${ms.map((x) => `<button type="button" data-m="${x}" aria-pressed="${x === m}">${mL(x)}</button>`).join('')}</span></h2>
      <div class="ps-k"><div><span>컬러 계(엔진)</span><b>${n0(tot)}</b><em>원장 목표 ${n0(tg)} · ${sg(tot - (tg || 0))}</em></div></div>
      ${PSG.table({ id: 'tk', cls: 'pl', head, rows })}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; keep(); draw(); }));
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

  const VIEWS = { psledger: ledger, psplating: plating, pscapa: capa, psmat: mat, pscolor: color, pslog: log };
  function draw() {
    const B = PS.base(); if (!B) return;
    const y = scrollY; (VIEWS[PAGE] || ledger)(B); PSG.bind($('ct-main')); PSG.bindBar(); scrollTo(0, y);
    if (window.UI && UI.sub) UI.sub(`기준판 ${B.rev} · 입력 기록 ${PS.logs().length}건`);
  }
  document.addEventListener('ps-redraw', draw);
  PS.on(draw);
  PS.boot((B) => { if (!B) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; } draw(); });
})();
