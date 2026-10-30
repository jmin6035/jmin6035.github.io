/* 가동 캘린더(supply.html) · 소재 캘린더(matcal.html): published/integrated.enc.json(확정 통합 계획 V1) — 일별 가동·자가재·구매 소재(발주·입고·재고)·제품 재고 + 날짜 상세
   매일 바뀌는 부분(2026-10-15): 도금 = 사내 PC 아침 재계획(latest.plan — 지난 날 = MES 실적, 이후 = 재계획), 컬러 지난 날 = MES 실적(color_actual), 제품 재고 = 매일 롤링(portal.stockRoll). 자가재·구매 소재는 확정 계획 */
(function () {
  'use strict';
  const NOEL = document.createElement('div');                      // 가동 캘린더(supply.html)·소재 캘린더(matcal.html)가 같은 코드 — 없는 칸은 빈 자리로
  const $ = (id) => document.getElementById(id) || NOEL;
  const PAGE = (document.getElementById('shell') || {}).dataset ? document.getElementById('shell').dataset.page : 'supply';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00').getDay();
  const add = (d, k) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + k); return x.toLocaleDateString('sv-SE'); };
  const today = new Date(Date.now() - 7 * 3600e3).toLocaleDateString('sv-SE');   // 생산일 = 07시 기준(MES 일수 기준, 10/22)
  const diff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
  const dayC = (d) => (d < today ? ' past' : d === today ? ' tb' : '');   // 지난 날(실적) 옅은 바탕 · 오늘 앞 파란 경계선(기울임 대신, 사용자 10/21)
  const FAM = (a) => (/^AZ/.test(a) ? 'AZ' : /^MAC/.test(a) ? 'MAC' : 'AL');
  const KEY = 'cgl-analysis-pw';
  let D = null, PM = null, MP = null, mon = null, sel = null;
  let FHP = null;                                                        // 발주번호-행번 → [계약, 톤, 판매그룹, 목적지, 고객사, 수출, 필요일]

  // ---------- 자료 정리: 날짜(YYYY-MM-DD) 기준 표 ----------
  function prep(W) {
    const V = W.variants[W.rec] || W.variants.V1, Y = (W.asOf || '2026').slice(0, 4);
    const full = (mmdd) => `${Y}-${mmdd}`;
    const days = V.self.AZ.map((r) => full(r[0]));
    const pl = {}, co = {}, self = {}, mat = {}, ord = { FH: {}, CMAT: {} }, sw = {};
    for (const x of V.plating) {
      const t = Object.values(x.cls).reduce((a, v) => a + v, 0), fa = {};
      for (const [a, v] of Object.entries(x.alloy)) fa[FAM(a)] = (fa[FAM(a)] || 0) + v;
      pl[`${x.l}|${x.d}`] = { t, fam: Object.keys(fa).sort((a, b) => fa[b] - fa[a])[0], ev: x.ev || '', cls: x.cls, items: x.items || [], why: x.why || [] };
    }
    for (const x of W.color) co[`${x.l}|${x.d}`] = { t: Object.values(x.g).reduce((a, v) => a + v, 0), g: x.g, act: x.act, rows: x.rows || [] };
    for (const [a, rows] of Object.entries(V.self)) for (const r of rows) self[`${a}|${full(r[0])}`] = { use: r[1], prod: r[2], stock: r[3] };
    for (const [k, m] of Object.entries(V.mat)) for (const r of m.rows) {
      const d = full(r[0]);
      mat[`${k}|${d}`] = { use: r[1], inb: r[2], od: r[3] ? full(r[3]) : '', stock: r[4] };
      if (r[2] > 0.5 && r[3]) { const o = full(r[3]); (ord[k][o] = ord[k][o] || []).push([d, r[2]]); }
    }
    const est = {};                                                      // 계획 기간(12/31) 너머 1월분을 추정해 낸 12월 발주
    for (const [k, e] of Object.entries(V.matExt || {})) for (const [o, a, t] of e.orders) { (ord[k][o] = ord[k][o] || []).push([a, t, 1]); est[`${k}|${o}`] = 1; }
    if (V.stockDay) for (const [g, arr] of Object.entries(V.stockDay)) days.forEach((d, i) => { sw[`${g}|${d}`] = { v: arr[i], tgt: V.stockTgt[g][+d.slice(5, 7) - 10] }; });
    else W.weeks.forEach((w, i) => { for (const s of V.stockWeek) if (!/자가재|FH|구매소재/.test(s.k)) sw[`${s.k}|${w}`] = { v: s.v[i], tgt: s.tgt[i] }; });
    const flow = (V.selfFlow || []).map((f, i) => Object.assign({ i }, f)), fMade = {}, fUse = {};
    for (const f of flow) { for (const [d, l, t] of f.made) (fMade[`${l}|${d}`] = fMade[`${l}|${d}`] || []).push([f, t]); for (const [d, l, t] of f.use) (fUse[`${l}|${d}`] = fUse[`${l}|${d}`] || []).push([f, t]); }
    const months = [...new Set(days.map((d) => d.slice(0, 7)))];
    return { W, V, days, months, pl, co, self, mat, ord, sw, est, flow, fMade, fUse, selfEst: V.selfEstFrom || '9999', matInfo: V.mat, groups: V.stockWeek.filter((s) => !/자가재|FH|구매소재/.test(s.k)).map((s) => s.k) };
  }

  // ---------- 매일 재계획 반영(2026-10-15 사용자: 가동 캘린더 매일 재계획) ----------
  async function live(pw) {
    const get = async (n) => { try { const e = await GP.latest(n); return e ? await GP.decryptJSON(e, pw) : null; } catch (x) { return null; } };
    const [LP, CA, PO] = await Promise.all([get('latest.plan.enc.json'), get('color_actual.enc.json'), get('portal.enc.json')]);
    const inQ = (d) => d >= D.days[0] && d <= D.days[D.days.length - 1], info = {};
    const R = LP && (LP.result || LP);
    if (R && R.rows && R.cal) {                                          // 도금: 확정 계획 화면과 같은 칸 구성(tools/integrated_web.plating_view)
      const t0 = (R.replan || {}).t0 || '', cells = {}, ev = {}, runs = {};
      const cell = (l, d) => (cells[`${l}|${d}`] = cells[`${l}|${d}`] || { cls: {}, alloy: {}, items: [] });
      for (const [d, l, a, c, t] of R.rows) { const x = cell(l, d); x.cls[c] = (x.cls[c] || 0) + t; x.alloy[a] = (x.alloy[a] || 0) + t; }
      for (const [d, l, a, c, dest, port, win, t, due] of R.dest || []) cell(l, d).items.push([a, c, dest, port || '', win || '', Math.round(t * 10) / 10, due]);
      for (const c of R.cal.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
        ev[`${c.line}|${c.date}`] = c;
        const L = (runs[c.line] = runs[c.line] || []), z = L[L.length - 1];
        if (z && z[2] === c.fam) z[1] = c.date; else L.push([c.date, c.date, c.fam]);
      }
      const pl = {};
      for (const k of new Set([...Object.keys(cells), ...Object.keys(ev)])) {
        const [l, d] = k.split('|'); if (!inQ(d)) continue;
        const x = cells[k] || { cls: {}, alloy: {}, items: [] }, e = ev[k] || {}, fa = {};
        const t = Object.values(x.cls).reduce((a, v) => a + v, 0);
        if (t < 0.5 && !e.event) continue;
        for (const [a, v] of Object.entries(x.alloy)) fa[FAM(a)] = (fa[FAM(a)] || 0) + v;
        const act = d <= t0, cp = (runs[l] || []).find((r) => r[0] <= d && d <= r[1]), why = [];
        if (act) why.push('MES 생산 실적(사내 PC 재계획 파일에 반영된 값)');
        else {
          if (cp) why.push(`${l} ${cp[2]} 캠페인 ${cp[0].slice(5)}~${cp[1].slice(5)} — 오늘 아침 재계획의 강종 구간(M/C 횟수 최소화)`);
          const early = x.items.filter((it) => diff(it[6], d) > 14);
          why.push(early.length ? `납기보다 15일 이상 앞선 생산 ${n0(early.reduce((a, it) => a + it[5], 0))}t — 해당 강종의 이 라인 생산 가능 구간이 이 캠페인뿐이거나 후반 능력 부족` : '납기 근접 배치(선행 생산량 톤·일 최소화)');
        }
        pl[k] = { t, fam: Object.keys(fa).sort((a, b) => fa[b] - fa[a])[0] || FAM(e.fam || 'AL'), ev: e.event || '', bo: e.blackout || 0, mcd: e.mcdummy || 0, cls: x.cls, items: x.items.sort((a, b) => (a[6] < b[6] ? -1 : 1)), why, act };
      }
      D.pl = pl;
      const kst = LP.savedAt ? new Date(new Date(LP.savedAt).getTime() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ') : '';   // 한국 시각
      info.pl = { t0, at: kst, notes: (R.replan || {}).notes || [] };
    }
    D.downAct = (CA && CA.downAct) || null;
    const BD = CA && CA.byGroup && CA.byGroup.days;
    if (BD) {                                                            // 컬러: 지난 날은 MES 실적으로 덮음(확정 계획 계산 뒤의 실적일)
      const last = CA.byGroup.asOf;
      for (const d of D.days) {
        if (d > last) break;
        for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) {
          const v = (BD[d] || {})[l];
          if (!v) { delete D.co[`${l}|${d}`]; continue; }
          const t = Object.values(v[0]).reduce((a, x) => a + x, 0);
          D.co[`${l}|${d}`] = { t, g: v[0], act: true, rows: (v[2] || []).map(([p, tt]) => ['실적', p, '', '', '실적', tt, 0, 0, 'MES 생산 실적', '', p, 0, [], '']) };
        }
      }
      info.co = last;
    }
    D.PO = PO || null;
    const SR = PO && PO.stockRoll;
    if (SR && SR.days && SR.d0) {                                        // 제품 재고: 어제 말 실제 → 재계획 생산 − 계획 출고(매일 롤링)
      for (const [g, arr] of Object.entries(SR.days)) arr.forEach((v, i) => { const d = add(SR.d0, i), k = `${g}|${d}`; if (v == null || !D.sw[k]) return; D.sw[k] = { ...D.sw[k], v, act: d <= SR.asOf }; });
      info.st = SR.asOf;
    }
    return info;
  }

  // ---------- 구매 소재: 오늘 재고(소재재고List·FH 추정) − 계획 필요량(주 단위를 7일에 고르게) + 알려진 입고(수입 FH 기발주) — 새 발주 없다고 보면 언제 바닥나나 ----------
  const SAFE = { C: 7, G: 5 };
  function prepMat(P) {
    if (!P) return null;
    const ds = D.days.filter((d) => d >= today), out = [];
    const keys = [...new Set(P.units.map((u) => `${u.plant}:${u.code}`))];
    for (const k of keys) {
      const [plant, code] = k.split(':');
      if (plant === 'G' && code === 'N') continue;                     // 임가공(포스코 지급)
      const use = {}, arr = {};
      for (const u of P.units) if (`${u.plant}:${u.code}` === k) for (let i = 0; i < 7; i++) { const d = add(u.wk, i); if (d >= today) use[d] = (use[d] || 0) + u.t / 7; }
      let past = 0;                                                     // 오늘 이전 날짜의 기발주 = 이미 들어온 것 → 오늘 재고에 더함(FH 재고는 입고 자료가 없어서)
      for (const a of P.known || []) if (`${a.plant}:${a.code}` === k) { if (a.date <= today) past += a.t; else arr[a.date] = (arr[a.date] || 0) + a.t; }
      const s0 = (P.stock[k] || 0) + past;
      let st = s0, run = null; const stock = {};
      for (const d of ds) { st += (arr[d] || 0) - (use[d] || 0); stock[d] = st; if (run == null && st < 0) run = d; }
      const tot = Object.values(use).reduce((a, v) => a + v, 0); if (tot < 5) continue;
      const u28 = ds.slice(0, 28).reduce((a, d) => a + (use[d] || 0), 0) / 28;
      const sup = P.suppliers.filter((x) => x.plant === plant && x.code === code).sort((a, b) => a.prio - b.prio)[0];
      const needBy = run ? add(run, -SAFE[plant]) : null, dl = needBy && sup ? add(needBy, -sup.lt) : null;
      const kg = {}; for (const a of P.known || []) if (`${a.plant}:${a.code}` === k) kg[a.date] = (kg[a.date] || 0) + a.t;
      const rows = (P.known || []).filter((a) => `${a.plant}:${a.code}` === k && a.date > today);   // 입고 예정 발주별(업체·발주번호·근거)
      out.push({ k, plant, code, nm: (P.matCode || {})[code] || code, stock0: s0, past, use, arr, stock, run, u28, tot, sup, needBy, dl, rows,
        known: Object.entries(kg).sort().map(([d, t]) => ({ date: d, t })) });
    }
    SUPN = P.supNames || {};
    return out.sort((a, b) => (a.plant < b.plant ? 1 : a.plant > b.plant ? -1 : b.tot - a.tot));
  }
  let SUPN = {};
  const PLN = { G: '도금 FH', C: '컬러 구매' };
  const calAll = (sel = '[data-d]') => document.querySelectorAll(`#s-cal ${sel}, #s-cal2 ${sel}`);
  const ordSum = (k, d) => (D.ord[k][d] || []).reduce((a, x) => a + x[1], 0);
  const useNext = (a, d, n) => { let s = 0; for (let i = 1; i <= n; i++) { const x = D.self[`${a}|${add(d, i)}`]; if (x) s += x.use; } return s; };

  // ---------- 소재 유형 캘린더(2026-10-14 회의): 줄 = 팀 리드타임 표 소재 유형, 칸 = 그날 발주할 양 · 들어올 양 ----------
  // 발주 = 소재 발주 화면과 같은 계산(ui/proccalc.js: 재고·기발주 충당 후 부족분을 27년 배정 비중대로 업체별로 나눔) — 업체별 발주 마감일에 놓음, 마감이 지난 몫은 오늘 칸(빨강)
  // 입고 = MES 기발주 입고 예정 + 새 발주분이 들어와야 할 날(입고 필요일 = 첫 사용일 − 투입 여유)
  const TYPES = { G: ['P-FH', '수입-FH', '동종-FH', 'P-FH(STS)', '외부FH(STS)'], C: ['P-GI', '서림GI', '외부GI', '수입GI', '동종GI', 'P-EG', '외부EG', 'P-CR', '동종AZ', '수입AZ', 'P-MAC', 'P-SUS', '외부SUS', '외부Alu'] };
  const TPL = { G: '도금 소재', C: '컬러 소재' };
  function matPlan(P) {
    let S = null;
    const C = ProcCalc.make(() => ({ D: P, S }));
    S = C.load();
    const J = C.judge(), cls = {}, top = {}, T = {};
    for (const s_ of P.suppliers) { cls[`${s_.plant}:${s_.code}:${s_.sup}`] = s_.cls; const k = `${s_.plant}:${s_.code}`; if (!top[k] || (s_.share || 0) > (top[k].share || 0)) top[k] = s_; }
    const clsOf = (plant, code, sup) => ((P.supTypes || {})[sup] || {})[code] || cls[`${plant}:${code}:${sup}`] || (top[`${plant}:${code}`] || {}).cls || '기타(코드표에 없는 업체)';   // 제조사 코드(발주번호 앞 2자리) × 소재그룹 → 코드조회 소재제조업체의 소재유형
    const get = (plant, c) => (T[c] = T[c] || { plant, ord: {}, inb: {}, use: {} });
    const push = (o, d, e) => (o[d] = o[d] || []).push(e);
    for (const j of J) {                                                 // 생산 투입 = 그 주 소요(첫 사용일~주말에 고르게) × 업체 배정 비중 → 유형별
      if (j.kind === 'pos') continue;
      const el = j.cand.filter(j.specOk), ws = el.reduce((a, x) => a + (+x.share || 0), 0), end = add(j.wk, 6), nd = Math.max(1, diff(end, j.first < j.wk ? j.wk : j.first) + 1);
      for (const x of el) { const t = j.t * (ws > 0 ? (+x.share || 0) / ws : 1 / el.length) / nd; if (t < 0.01) continue; for (let i = 0; i < nd; i++) push(get(j.plant, x.cls || clsOf(j.plant, j.code, x.sup)).use, add(j.first < j.wk ? j.wk : j.first, i), { j, s: x, t, kind: 'use' }); }
    }
    for (const j of J) {
      if (j.kind === 'pos' || j.short < 1) continue;
      for (const x of j.split) {
        if (x.t < 1) continue;
        const R = get(j.plant, x.s.cls || clsOf(j.plant, j.code, x.s.sup)), late = x.dl < today;
        push(R.ord, late ? today : x.dl, { j, x, t: x.t, late });
        push(R.inb, j.needBy < today ? today : j.needBy, { j, x, t: x.t, kind: 'new' });
      }
    }
    const arrs = [...C.autoArr(), ...S.arr.map((a) => ({ ...a, plant: ProcCalc.plantOf(a.code), t: +a.t || 0 }))];
    for (const a of arrs) {
      if (a.plant === 'G' && a.code === 'N') continue;                     // 임가공(포스코 지급)
      push(get(a.plant, clsOf(a.plant, a.code, a.sup)).inb, a.date, { a, t: a.t, kind: 'arr' });
    }
    const act = (D && D.PO || {}).matAct || {};                            // 지난 날 = MES 실적(발주 원장 발주일 · 입고 원장 실입고일), 사용자 10/21
    for (const k of ['ord', 'inb']) for (const [key, t] of Object.entries(act[k] || {})) {
      const [pl, code, sup, d] = key.split('|');
      if (d >= today || (pl === 'G' && code === 'N') || t < 0.05) continue;
      push(get(pl, clsOf(pl, code, sup))[k], d, { t, kind: 'act', a: { code, sup, date: d, t } });
    }
    return { T, J, P, arrs, codeNm: (c) => (P.matCode || {})[c] || c, supNm: (s_) => (s_ ? ((P.supNames || {})[s_.sup] || s_.name || s_.sup) : '-') };
  }
  const sumT = (L) => (L || []).reduce((x, e) => x + e.t, 0);
  const typeList = () => ['G', 'C'].filter((pl) => UI.inScope(pl)).flatMap((pl) => [...TYPES[pl], ...Object.keys(MP.T).filter((c) => MP.T[c].plant === pl && !TYPES[pl].includes(c))].filter((c) => MP.T[c] && MP.T[c].plant === pl).map((c) => [pl, c]));
  function weekBox() {
    if (!MP) { $('s-mcal').innerHTML = '<p class="small">소재 발주 자료가 없습니다.</p>'; return; }
    const w0 = mondayOf(today), w1 = add(w0, 6);
    const rows = typeList().map(([pl, c]) => { const R = MP.T[c]; let t = 0, late = 0; for (const [d, L] of Object.entries(R.ord)) if (d >= w0 && d <= w1) { t += sumT(L); late += sumT(L.filter((e) => e.late)); } return { pl, c, t, late }; }).filter((r) => r.t >= 1);
    const tot = rows.reduce((x, r) => x + r.t, 0);
    $('s-mcal').innerHTML = `<div class="wkbox"><div class="wkh">이번 주 발주 <small>${md(w0)}~${md(w1)} · 소재 유형별 합계(마감 지난 몫 포함)</small> <b>${n0(tot)}t</b></div>
      <div class="wkl">${rows.map((r) => `<button type="button" class="wkc" data-c="${esc(r.c)}" data-d="${today}"><span>${esc(r.c)}</span><b>${n0(r.t)}t</b>${r.late >= 1 ? `<small class="neg">마감 지남 ${n0(r.late)}t</small>` : ''}</button>`).join('') || '<span class="muted">이번 주 발주할 소재 없음</span>'}</div></div>`;
    $('s-mcal').querySelectorAll('.wkc').forEach((b) => b.onclick = () => typeDetail(b.dataset.c, null, 'ord'));
  }
  const MK = [['ord', '발주', 'm-ord'], ['inb', '입고', 'm-inb'], ['use', '생산 투입', 'm-use']];
  function typeCal(ds, head) {
    if (!MP) { $('s-cal3').innerHTML = ''; return; }
    let h = '', last = '';
    for (const [pl, c] of typeList()) {
      const R = MP.T[c];
      if (!ds.some((d) => MK.some(([k]) => sumT(R[k][d]) >= 0.5))) continue;   // 이 달에 발주·입고·투입이 모두 없는 유형은 숨김
      if (pl !== last) { h += `<tr class="sec" data-dom="${pl}"><td class="lb">${TPL[pl]}</td><td colspan="${ds.length + 1}"></td></tr>`; last = pl; }
      MK.forEach(([k, nm, cl], ri) => {
        let s_ = 0;
        h += `<tr class="mt-r ${cl} ${ri === 0 ? 'first' : ''} ${ri === 2 ? 'last' : ''}"><td class="lb"><span class="tn">${ri === 0 ? esc(c) : ''}</span><span class="kd ${cl}">${nm}</span></td>${ds.map((d, i) => {
          const L = R[k][d] || [], t = sumT(L); s_ += t;
          const mon_ = wd(d) === 1 ? ' wk' : '';
          if (t < 0.5) return `<td class="e${mon_}${dayC(d)}" style="--ci:${i}"></td>`;
          const late = L.some((e) => e.late), nw = L.some((e) => e.kind === 'new');
          const isAct = L.every((e) => e.kind === 'act');
          const tip = isAct ? `${md(d)} ${c} ${k === 'ord' ? '발주' : '입고'} 실적 ${n0(t)}t (MES)` : k === 'ord' ? `${md(d)} ${c} 발주 ${n0(t)}t${late ? ' — 마감 지난 몫 포함' : ''}` : k === 'inb' ? `${md(d)} ${c} 입고 ${n0(t)}t (기발주 ${n0(sumT(L.filter((e) => e.kind === 'arr')))}t · 새 발주분 ${n0(sumT(L.filter((e) => e.kind === 'new')))}t)` : `${md(d)} ${c} 생산 투입 ${n0(t)}t`;
          return `<td data-c="${esc(c)}" data-k="${k}" data-d="${d}" class="v${mon_}${late ? ' late' : ''}${isAct ? ' act' : ''}${k === 'inb' && nw ? ' nw' : ''}${t >= 999.5 ? ' w4' : ''}${dayC(d)}" style="--ci:${i}" title="${esc(tip)}">${n0(t)}</td>`;
        }).join('')}<td class="tot">${s_ >= 0.5 ? n0(s_) : ''}</td></tr>`;
      });
    }
    $('s-cal3').innerHTML = head.replace(/<th data-d="([^"]+)" class="/g, (m, d) => `<th data-d="${d}" class="${wd(d) === 1 ? 'wk ' : ''}`) + '<tbody>' + h + '</tbody>';
    $('s-cal3').querySelectorAll('td[data-c]').forEach((el) => el.onclick = () => typeDetail(el.dataset.c, el.dataset.d, el.dataset.k));
  }
  // 소재 유형 칸 상세: 어떤 소재(코드)를 어느 업체에 얼마 — 언제 들어와 언제 쓰고, 무엇을 만드는지(역으로 생산·용도)
  // 발주 → 어느 판매그룹·목적지를 위한 것인지(10/29 사용자): 판매그룹 → 목적지별 톤, 펼치면 계약별
  const pdtNm = (p) => (p ? String(p).split(' ').slice(1).join(' ') || String(p) : '');   // 'CGT PGS (폴리에스테르)' → 'PGS (폴리에스테르)'
  function forWhom(pos) {
    const L = (pos || []).map((p) => FHP && FHP.po[p]).filter(Boolean);
    if (!L.length) return '';
    const G = {};
    const dk = (dst, exp) => dst || (exp ? '수출(목적지 미확인)' : '국내(목적지 미확인)');
    L.forEach(([con, t, g, dst, , exp]) => { const x = (G[g] = G[g] || { t: 0, d: {} }); x.t += t; const k = dk(dst, exp); x.d[k] = (x.d[k] || 0) + t; });
    const sum = Object.entries(G).sort((a, b) => b[1].t - a[1].t).map(([g, x]) => `<div class="fw"><b>${esc(g)}</b> ${n0(x.t)}t <span class="muted">— ${Object.entries(x.d).sort((a, b) => b[1] - a[1]).map(([dd, t]) => `${esc(dd)} ${n0(t)}`).join(' · ')}</span></div>`).join('');
    const det = L.length > 1 ? `<details class="fwd"><summary>계약 ${L.length}건 보기</summary><table class="t fwt"><tbody>${L.sort((a, b) => (G[b[2]].t - G[a[2]].t) || dk(a[3], a[5]).localeCompare(dk(b[3], b[5])) || b[1] - a[1]).map(([con, t, g, dst, cus, exp, need, usg, ns, pdt]) => `<tr><td class="l nw">${esc(con || '-')}</td><td class="l">${esc(g)}${pdt || usg ? ` <small class="muted">${[pdtNm(pdt), usg].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</td><td class="l">${esc(cus || '')}${cus ? ' → ' : ''}${esc(dk(dst, exp))}</td><td>${n0(t)}t</td><td class="nw">${need ? `${ns || (exp ? '입항' : '납기')} ${md(need)}` : ''}</td></tr>`).join('')}</tbody></table></details>`
      : (() => { const [con, , , , cus, exp, need, usg, ns, pdt] = L[0]; return `<div class="muted">${esc(con || '')}${pdt ? ` · ${esc(pdtNm(pdt))}` : ''}${usg ? ` · ${esc(usg)}` : ''}${cus ? ` · ${esc(cus)}` : ''}${need ? ` · ${ns || (exp ? '입항' : '납기')} ${md(need)}` : ''}</div>`; })();
    return sum + det;
  }
  function typeDetail(c, d, k) {
    const R = MP.T[c]; if (!R) return;
    const w0 = mondayOf(today), inRange = (x) => (d ? x === d : x >= w0 && x <= add(w0, 6));
    const L = Object.entries(R[k]).filter(([x]) => inRange(x)).flatMap(([x, es]) => es.map((e) => ({ d: x, ...e })));
    const when = d ? `${md(d)}(${WD[wd(d)]})` : `이번 주(${md(w0)}~${md(add(w0, 6))})`;
    const useTxt = (j) => j.use.slice().sort((a, b) => b[3] - a[3]).slice(0, 4).map((r) => `${esc(r[0])} ${esc(r[1])} ${esc(r[2])} ${n0(r[3])}t`).join(' · ');
    const rows = L.sort((a, b) => b.t - a.t).map((e) => {
      if (e.kind === 'use') { const j = e.j; return `<tr><td class="l"><b>${esc(MP.codeNm(j.code))}</b></td><td class="l">${esc(MP.supNm(e.s))} <small class="muted">배정 ${Math.round((e.s.share || 0) * 100)}%</small></td><td>${n0(e.t)}</td><td>-</td><td>생산 투입</td><td>-</td><td>${md(j.first)}</td><td class="l small wfor">${useTxt(j)}</td></tr>`; }
      if (e.kind === 'act') { const a = e.a; return `<tr><td class="l"><b>${esc(MP.codeNm(a.code))}</b></td><td class="l">${esc((MP.P.supNames || {})[a.sup] || a.sup || '-')}</td><td>${n0(e.t)}</td><td>-</td><td><b>${k === 'ord' ? '발주 실적' : '입고 실적'}</b> (MES)</td><td>${md(e.d)}</td><td>-</td><td class="l small wfor">${k === 'ord' && FHP ? forWhom(FHP.ord[`${R.plant}|${a.code}|${a.sup}|${e.d}`]) : ''}</td></tr>`; }
      if (e.kind === 'arr') { const a = e.a; return `<tr><td class="l"><b>${esc(MP.codeNm(a.code))}</b></td><td class="l">${esc((MP.P.supNames || {})[a.sup] || a.sup || '-')}</td><td>${n0(e.t)}</td><td>${a.po ? esc(a.po) : '-'}</td><td><span class="pos">입고 예정(기발주)</span></td><td>${md(e.d)}</td><td>-</td><td class="l small wfor">${forWhom([a.po]) || esc(a.note || '')}</td></tr>`; }
      const j = e.j, x = e.x;
      const st = k === 'ord' ? (e.late ? `<span class="neg">마감 ${md(x.dl)} 지남</span>` : `발주 마감 ${md(x.dl)}`) : (j.needBy < today ? `<span class="neg">입고 필요 ${md(j.needBy)} 지남</span>` : '입고 예정(새 발주분)');
      return `<tr><td class="l"><b>${esc(MP.codeNm(j.code))}</b>${j.thk ? ` <small class="muted">${j.thk[0]}~${j.thk[1]}mm</small>` : ''}</td><td class="l">${esc(MP.supNm(x.s))} <small class="muted">LT ${x.s.lt}일</small></td><td>${n0(e.t)}</td><td>${md(x.dl)}</td><td>${st}</td><td>${md(j.needBy)}</td><td>${md(j.first)}</td><td class="l small wfor">${useTxt(j)}</td></tr>`;
    }).join('');
    $('s-det2').innerHTML = `<div class="dethd m"><span>${esc(c)} ${k === 'ord' ? '발주' : k === 'inb' ? '입고' : '생산 투입'} · ${when} <small>${TPL[R.plant]} — 업체·양·일정과 무엇을 만들려고 쓰는지. 업체·수량을 바꾸려면 <a href="procure.html">소재 발주</a></small></span></div>
      <section class="card wide"><div class="scroll"><table class="t mt"><thead><tr><th class="l">소재</th><th class="l">업체</th><th>톤</th><th>발주 마감</th><th>상태</th><th>입고 필요일</th><th>첫 사용일</th><th class="l" title="발주 실적·입고 예정 = 발주에 걸린 계약의 판매그룹 → 목적지 · 톤 / 새로 낼 발주 = 그 주 생산 계획 용도">무엇을 위해 <small>판매그룹 → 목적지 · 톤</small></th></tr></thead><tbody>${rows || '<tr><td colspan="8">없음</td></tr>'}</tbody>
      <tfoot><tr><td class="l"><b>합계</b></td><td></td><td><b>${n0(sumT(L))}</b></td><td colspan="5"></td></tr></tfoot></table></div>
      <p class="small">발주 마감 = 입고 필요일 − 업체 리드타임(팀 리드타임 표). 입고 필요일 = 첫 사용일 − 투입 여유(컬러 7일 · 도금 5일). 양은 재고·기발주를 먼저 쓰고 모자라는 만큼을 27년 배정 비중대로 나눈 것.</p></section>`;
    $('s-det2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- 차트 공통(2026-10-21 사용자: 막대그래프 다시 — 한 색조 단계·2px 칸 사이·4px 둥근 끝·가는 격자·글자 안 늘어남) ----------
  const kf = (v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}K` : String(Math.round(v)));
  // 세로 막대: cats = [{ name, a(진한 칸), b(옅은 칸), plan(높이 기준 — 모자라는 몫은 회색 트랙), cap(위 숫자 HTML), sub(아래 작은 글), neg(sub 빨강), tip }]
  // 세로 막대(사용자 10/21: 막대 위 숫자 두 줄이 아마추어 같음) — 막대 위엔 달성률 하나, 계획은 가로 표시선, 숫자는 막대 아래 정렬된 표(행 = labels)
  function colChart(cats, vh = 180, labels = ['실적', '계획', '잔여']) {
    const mx = Math.max(1, ...cats.map((c) => Math.max(c.plan || 0, (c.a || 0) + (c.b || 0)))), sc = UI.scale(mx * 1.15, 0), P = (v) => (v / sc.hi * 100).toFixed(2);
    const y = sc.ticks.map((t) => `<span style="bottom:${P(t)}%">${kf(t)}</span>`).join(''), gl = sc.ticks.filter((t) => t > 0).map((t) => `<i class="gl" style="bottom:${P(t)}%"></i>`).join('');
    const col = (c) => { const a = c.a || 0, b = c.b || 0, top = a + b, pl = c.plan || 0;
      const seg = [[a, 'a'], [b, 'b']].filter(([v]) => v > Math.max(top, pl) * 0.004).map(([v, k]) => `<i class="${k}" style="flex:${v} 0 0"></i>`).join('');
      const pc = pl ? Math.round(top / pl * 100) : null;
      return `<div class="vz-c" title="${esc(c.tip || '')}"><div class="vz-st" style="height:${P(top)}%">${seg}</div>${pl ? `<em class="vz-pl" style="bottom:${P(pl)}%"></em>` : ''}`
        + `<div class="vz-cap${c.neg ? ' neg' : ''}" style="bottom:${P(Math.max(top, pl))}%">${pc == null ? '' : pc + '%'}</div></div>`; };
    const tbl = labels.map((lb, i) => `<div class="vz-r"><span class="vz-rl">${lb}</span><div class="vz-rv">${cats.map((c) => { const v = (c.vals || [])[i]; return `<span class="${i === labels.length - 1 && c.neg ? 'neg' : ''}${i === 0 ? ' b' : ''}">${v == null ? '-' : n0(v)}</span>`; }).join('')}</div></div>`).join('');
    return `<div class="vz-col" style="--vh:${vh}px"><div class="vz-y">${y}</div><div class="vz-plot">${gl}${cats.map(col).join('')}</div>`
      + `<div class="vz-x">${cats.map((c) => `<div><b>${esc(c.name)}</b></div>`).join('')}</div></div><div class="vz-tbl">${tbl}</div>`;
  }
  const vzLegend = (items) => `<div class="vz-lg">${items.map(([k, t]) => `<span><i class="${k}"></i>${t}</span>`).join('')}</div>`;

  // ---------- 캘린더 ----------
  function tabs() {
    $('s-mon').innerHTML = D.months.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === mon}">${+m.slice(5)}월</button>`).join('');
    $('s-mon').querySelectorAll('button').forEach((b) => b.onclick = () => { mon = b.dataset.m; tabs(); cal(); if (PAGE === 'matcal') monthSum(); });
  }
  const kt = (v) => { const a = Math.abs(v) / 1000; return (v < -0.5 ? '−' : '') + (a >= 1 ? a.toFixed(1) : a.toFixed(2)); };   // 재고 표 천t(사용자 10/21: 5자리 넘침 → 한 달 한 화면 유지)
  function cal() {
    const ds = D.days.filter((d) => d.slice(0, 7) === mon);
    const head = `<thead><tr><th class="lb">구분</th>${ds.map((d) => `<th data-d="${d}" class="${wd(d) === 6 ? 'sat' : wd(d) === 0 ? 'sun' : ''} ${d === today ? 'today tb' : ''}">${+d.slice(8)} <span style="font-weight:500;font-size:13.5px">${WD[wd(d)]}</span></th>`).join('')}<th class="tot">계</th></tr></thead>`;
    const H = { a: '', b: '' }; let tg = 'a', ci = 0;
    const sec = (t, dom) => { H[tg] += `<tr class="sec" data-dom="${dom}"><td class="lb">${t}</td><td colspan="${ds.length + 1}"></td></tr>`; };
    const row = (lb, cell, tot, cls = '') => { let s = 0, h = ''; h += `<tr class="${cls}"><td class="lb">${lb}</td>`; ds.forEach((d, i) => { const c = cell(d); s += c.n || 0; h += `<td data-d="${d}" data-l="${esc(lb.replace(/<[^>]+>/g, ' ').trim())}" class="${(c.c || '') + (String(c.x || '').length > 4 ? ' w4' : '') + dayC(d)}" style="--ci:${i}"${c.tip ? ` title="${esc(c.tip)}"` : ''}>${c.x == null ? '' : c.x}</td>`; }); h += `<td class="tot">${tot === false ? '' : n0(tot != null ? tot : s)}</td></tr>`; ci++;  H[tg] += h; };
    const SD = (D.PO || {}).shipDay, OD = D.V.outDay || {};
    const RO = ((D.PO || {}).stockRoll || {});                           // 계획 출고 = 재고 롤링과 같은 값(국내·컬러는 날마다 고르게, 이번 달은 속보 월차 − 실적 — 사용자 10/21: 월말 하루에 몰려 보이던 것)
    const gship = (g, d) => { if (SD && SD.asOf && d <= SD.asOf) return { t: ((SD.g || {})[g] || {})[d] || 0, act: true };
      if (RO.out && RO.out[g]) { const v = RO.out[g][diff(d, RO.d0)]; return { t: v || 0, act: false }; }
      const i = diff(d, D.days[0]); const v = (OD[g] || [])[i]; return { t: v || 0, act: false }; };
    const NM = { G수출: '도금수출', G국내: '도금국내', G자동차: '자동차강판', G자가재: '자가재(→ 컬러 소재)', C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' };
    // 2026-10-21 사용자: 가동 캘린더 = 가동 현황 캘린더를 라인별로만 — 라인마다 생산(t)·휴지(h), M/C 날 노랑, 종일 정지는 블록. 출하·재고는 아래 따로(s-ship)
    const W1 = ['일', '월', '화', '수', '목', '금', '토'], KN = { plan: '계획휴지', sd: 'S/D', repair: '수리', clean: '청소', test: 'Test', sample: '샘플', jr: '정기수리', color: '색상교체·청소', roll: '폭·롤 전환', etc: '기타 정지', gap: '기록 없는 정지(TEST 등)' }, HARD = ['plan', 'sd', 'repair', 'jr'];
    const headG = (lab) => `<colgroup><col class="cc0"><col class="cc1">${ds.map(() => '<col>').join('')}<col class="ctot"></colgroup><thead><tr><th class="c0" colspan="2" rowspan="2">${lab}</th>`
      + ds.map((d) => `<th data-d="${d}" class="${d === today ? 'today tb' : ''}">${+d.slice(8)}</th>`).join('') + '<th class="tot" rowspan="2">계</th></tr><tr>'
      + ds.map((d) => `<th class="wk ${wd(d) === 6 ? 'sat' : wd(d) === 0 ? 'sun' : ''}${d === today ? ' tb' : ''}">${W1[wd(d)]}</th>`).join('') + '</tr></thead><tbody>';
    const dayCls = (d) => (d < today ? ' past' : d === today ? ' today tb' : '');   // 지난 날(실적) 옅은 바탕 · 오늘 앞 파란 경계선 — 기울임 대신(사용자 10/21)
    const dn = {};                                                       // 라인|날짜 → [[종류, 분]]
    for (const [d, l, k, mn] of D.W.colorDown || []) if (d.slice(0, 7) === mon) (dn[`${l}|${d}`] = dn[`${l}|${d}`] || []).push([k, mn]);
    const dnPlan = Object.assign({}, dn);                                // 휴지계획(실적으로 덮기 전) — 생산 없는 날 이유 찾기용
    const DA = D.downAct;                                                // 지난 날 컬러 = MES 실제 휴지(휴지계획 아님, 사용자 10/21) — 종일 기록 없고 계획이 S/D·수리면 계획 이름 유지
    if (DA && DA.days) for (const d of ds) { if (d > DA.asOf) break; for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) { const k = `${l}|${d}`, act = (DA.days[d] || {})[l] || [], gap = act.filter((x) => x[0] === 'gap').reduce((a, x) => a + x[1], 0), plan = (dn[k] || []).filter((x) => HARD.includes(x[0]));
      if (gap >= 1439 && plan.length) dn[k] = plan; else if (act.length) dn[k] = act.map((x) => [x[0], x[1]]); else delete dn[k]; } }
    for (const l of ['1CGL', '2CGL']) for (const d of ds) { const x = D.pl[`${l}|${d}`]; if (!x) continue; const L_ = [];
      if (x.bo > 0.5) L_.push([/정기수리/.test(x.ev) ? 'jr' : 'plan', x.bo]); if (/M\/C/.test(x.ev) && x.mcd > 0.5) L_.push(['mc', x.mcd]); if (L_.length) dn[`${l}|${d}`] = L_; }
    const full = (l, d) => (dn[`${l}|${d}`] || []).filter((x) => HARD.includes(x[0])).reduce((a, x) => a + x[1], 0) >= 1439;
    const dTxt = (l, d) => (dn[`${l}|${d}`] || []).map((x) => `${x[0] === 'mc' ? 'M/C' : KN[x[0]]} ${n0(x[1])}분`).join(', ');
    let G2 = headG('라인');
    // 2026-10-21 사용자: 도금/컬러 구분 + 색 줄이기 — 색은 강종(AL·AZ·MAC 막대)·M/C·종일 정지만, 숫자 칸은 무채색
    const kindOf = (l, d) => { const k0 = (dn[`${l}|${d}`] || []).filter((x) => HARD.includes(x[0])).sort((a, b) => b[1] - a[1])[0]; return k0 ? k0[0] : 'plan'; };
    const runsOf = (l) => { const rs = [];                               // [시작, 끝, 종류] — 종류가 바뀌면 다른 칸(휴지·수리 구분, 10/22 사용자)
      const src = /CGL$/.test(l) ? D.pl : D.co;                         // 생산 없는 날도 이유를 붙여 합침(10/22 사용자: 왜 생산 없는지 · 붙은 휴지와 왜 따로냐)
      const K = ds.map((d) => { const x = src[`${l}|${d}`];
        if (full(l, d)) return [kindOf(l, d), 0];
        if ((x && (x.t || 0) >= 0.5) || (x && /M\/C/.test(x.ev || ''))) return [null, 0];
        const pk = (dnPlan[`${l}|${d}`] || []).filter((y) => HARD.includes(y[0])).sort((a, b) => b[1] - a[1])[0];
        if (pk) return [pk[0], 1];                                       // 그날 휴지계획(계획휴지·S/D·수리)
        const past = DA && DA.asOf && d <= DA.asOf;
        return [past ? 'plan' : 'idle', past ? 2 : 3]; });               // 2 = 지난 날 실적 없음(MES 사유 기록 없음) → 휴지, 3 = 앞날 계획 물량 없음
      const hard = (k) => k[0] && k[0] !== 'idle' && k[1] !== 2;
      for (let i = 1; i < K.length; i++) if (K[i][1] >= 2 && hard(K[i - 1])) K[i] = [K[i - 1][0], 1];     // 바로 앞 휴지·수리에 붙임(이어진 날까지)
      for (let i = K.length - 2; i >= 0; i--) if (K[i][1] >= 2 && hard(K[i + 1])) K[i] = [K[i + 1][0], 1];  // 바로 뒤 휴지·수리에 붙임
      for (let i = 1; i < K.length; i++) if (K[i][1] === 3 && K[i - 1][0] === 'plan') K[i] = ['plan', 2];   // 실적 없는 휴지에 이어지는 앞날(계획 물량 없음) = 휴지가 이어지는 것
      ds.forEach((d, i) => { const kk = K[i][0]; if (!kk) return;
        const r = rs[rs.length - 1]; if (r && r[1] === i - 1 && r[2] === kk) r[1] = i; else rs.push([i, i, kk]); }); return rs; };
    const SDK = new Set();
    const sdCell = (ls, run) => { const d = ds[run[0]], kk = run[2], n = run[1] - run[0] + 1;
      if (kk === 'idle') return `<td class="idle idleblk" colspan="${n}" rowspan="${ls.length}" title="${esc(`계획 물량 없음(이 라인에 배정된 생산 없음) ${md(ds[run[0]])}${n > 1 ? '~' + md(ds[run[1]]) : ''} · ${ls.join('·')}`)}" data-d="${d}">${n >= 3 ? `<span class="idl">계획 물량 없음 ${md(ds[run[0]])}~${md(ds[run[1]])}</span>` : ''}</td>`;
      SDK.add(kk);
      const SH = { plan: '휴지', sd: 'S/D', repair: '수리', jr: '정기수리' }, nm = n === 1 ? (SH[kk] || KN[kk]) : n === 2 && KN[kk].length > 3 ? SH[kk] || KN[kk] : KN[kk];
      return `<td class="sdblock sk-${kk}${n === 1 ? ' one' : ''}" colspan="${n}" rowspan="${ls.length}" title="${esc(`${KN[kk]} ${md(ds[run[0]])}${n > 1 ? '~' + md(ds[run[1]]) : ''} · ${ls.map((l) => `${l} ${dTxt(l, d) || '생산 실적 없음(MES 휴지 사유 기록 없음)'}`).join(' / ')}`)}" data-d="${d}">${nm}<small>${md(ds[run[0]])}${n > 1 ? '~' + md(ds[run[1]]) : ''}</small></td>`; };
    const isMC = (x) => x && /M\/C/.test(x.ev || '');
    const CGM = { 가전수출: 'C수출', 가전내수: 'C수출', 건재수출: 'C수출', 계획재: 'C건재', 주문재: 'C건재', 수요개발: 'C수요' }, CGN = { C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' }, CGS = { C수출: '수출', C건재: '건재', C수요: '수요' };
    const cTop = (x) => { const a = {}; for (const [g, t] of Object.entries(x.g || {})) { const k = CGM[g] || (/^C/.test(g) ? g : 'C건재'); a[k] = (a[k] || 0) + t; } return Object.entries(a).sort((p, q) => q[1] - p[1])[0][0]; };
    const cMix = (x) => { const a = {}; for (const [g, t] of Object.entries(x.g || {})) { const k = CGN[CGM[g] || g] || g; a[k] = (a[k] || 0) + t; } return Object.entries(a).sort((p, q) => q[1] - p[1]).filter(([, t]) => t >= 0.5).map(([k, t]) => `${k} ${n0(t)}t`).join(' · '); };
    const barKey = (pl, x) => (!x || (x.t || 0) < 0.5 ? '' : pl === 'G' ? x.fam || 'AL' : cTop(x));
    // 2026-10-21 사용자: 가동 현황 표와 같은 모양 — 라인당 한 줄, 칸 = 생산량만, 강종(도금)·판매그룹(컬러)은 글자 없이 칸 색으로, M/C 날 노랑, 종일 정지 회색 블록
    const RUN = {}; for (const l of ['1CGL', '2CGL', '1CCL', '2CCL', '3CCL', '4CCL']) RUN[l] = runsOf(l);
    const PLN = { G: ['1CGL', '2CGL'], C: ['1CCL', '2CCL', '3CCL', '4CCL'] };
    const hasRun = (l, r) => !!l && RUN[l].some((x) => x[0] === r[0] && x[1] === r[1] && x[2] === r[2]);   // 위아래 라인이 같은 날 같은 휴지면 한 칸으로 합침
    const lineBlock = (pl, l) => {
      const src = pl === 'G' ? D.pl : D.co, runs = RUN[l], LS = PLN[pl], li = LS.indexOf(l);
      G2 += `<tr class="r-p first"><th class="c0 line ${pl}" colspan="2">${l}</th>`;
      let tot = 0, nmc = 0;
      ds.forEach((d, i) => {
        const run = runs.find((r) => r[0] <= i && i <= r[1]);
        if (run) { if (i === run[0] && !hasRun(LS[li - 1], run)) { let j = li + 1; while (j < LS.length && hasRun(LS[j], run)) j++; G2 += sdCell(LS.slice(li, j), run); } return; }
        const x = src[`${l}|${d}`], t = x ? x.t || 0 : 0, mc = pl === 'G' && isMC(x), key = barKey(pl, x), part = dn[`${l}|${d}`], tip = [];
        if (x) tip.push(`${md(d)} ${l} ${pl === 'G' ? (x.fam || '') : CGN[key] || ''} 생산 ${n0(t)}t${x.act ? '(실적)' : '(계획)'}`);
        if (pl === 'C' && x && x.g) tip.push(cMix(x));
        if (mc) { nmc++; tip.push(x.ev.split(' · ')[0]); }
        if (part) tip.push('휴지: ' + dTxt(l, d));
        tot += t;
        const cls = [mc ? 'mcc' : key ? `fc f-${key}` : 'idle'];
        if (t >= 999.5) cls.push('w4');
        G2 += `<td class="${cls.join(' ')}${d === today ? ' tb' : ''}" style="--ci:${i}" data-d="${d}"${tip.length ? ` title="${esc(tip.join(' · '))}"` : ''}>${t >= 0.5 ? n0(t) : ''}</td>`;
      });
      G2 += `<td class="tot"${nmc ? ` title="${l} M/C ${nmc}회"` : ''}>${n0(tot)}</td></tr>`;
    };
    const grpRow = (pl, lines) => { const src = pl === 'G' ? D.pl : D.co; let T = 0;                     // 공장 띠 = 일별 공장 생산 합(사용자 10/21)
      G2 += `<tr class="grp ${pl}"><th class="c0 gh" colspan="2">${pl === 'G' ? '도금 합' : '컬러 합'}<small>${pl === 'G' ? '1·2CGL' : '1~4CCL'}</small></th>` + ds.map((d) => { const t = lines.reduce((a, l) => a + ((src[`${l}|${d}`] || {}).t || 0), 0); T += t;
        return `<td class="${t >= 999.5 ? 'w4' : ''}${d === today ? ' tb' : ''}" data-d="${d}" title="${md(d)} ${pl === 'G' ? '도금' : '컬러'} 생산 합 ${n0(t)}t">${t >= 0.5 ? n0(t) : ''}</td>`; }).join('') + `<td class="tot gt">${n0(T)}</td></tr>`; };
    if (UI.inScope('G')) { grpRow('G', ['1CGL', '2CGL']); for (const l of ['1CGL', '2CGL']) lineBlock('G', l); }
    if (UI.inScope('C')) { if (UI.inScope('G')) G2 += `<tr class="gap"><td colspan="${ds.length + 3}"></td></tr>`; grpRow('C', ['1CCL', '2CCL', '3CCL', '4CCL']); for (const l of ['1CCL', '2CCL', '3CCL', '4CCL']) lineBlock('C', l); }
    const sw = (c, t) => `<span><i class="sw ${c}"></i>${t}</span>`, sep = '<i class="gsep"></i>';
    $('s-calleg').innerHTML = (UI.inScope('G') ? '<span class="muted">도금 강종</span>' + sw('f-AL', 'AL') + sw('f-AZ', 'AZ') + sw('f-MAC', 'MAC') + sw('mcsw', 'M/C(강종 교체)') + sep : '')
      + (UI.inScope('C') ? '<span class="muted">컬러 판매그룹</span>' + sw('f-C수출', '컬러수출') + sw('f-C건재', '컬러건재') + sw('f-C수요', '수요개발') + sep : '')
      + ['plan', 'repair', 'sd', 'jr'].filter((k) => SDK.has(k)).map((k) => sw(`sk-${k}`, `${KN[k]}(종일)`)).join('') + sw("idsw", "계획 물량 없음") + sep + sw('tbsw', '오늘') + '<span class="muted">칸 숫자 = 생산(t) · 오늘 이전 = 실적 · 칸에 마우스를 올리면 강종·판매그룹·휴지</span>';
    $('s-shipleg').innerHTML = '<span class="muted">재고 칸 색 = 목표 대비</span>' + sw('hiw', '100~130%') + sw('hi2w', '130% 넘음') + sep + sw('tbsw', '오늘') + '<span class="muted">출하(t) · 재고(천t) · 오늘 이전 = 실적</span>';
    // 판매그룹 출하·재고(라인 구분 없는 자료 — 사용자 10/21: 밑으로 따로 하나 더)
    let S2 = headG('판매그룹');
    const shipBlock = (pl, gs) => gs.forEach((g, gi) => {
      [['s', '출하(t)'], ['k', '재고(천t)']].forEach(([rk, lb], ri) => {
        S2 += `<tr class="${rk === 's' ? 'r-s' : 'r-k'}${ri === 0 ? ' first' : ''}">` + (ri === 0 ? `<th class="c0 line ${pl}" rowspan="2">${NM[g]}</th>` : '') + `<th class="c1">${lb}</th>`;
        let tot = 0;
        ds.forEach((d, i) => {
          let txt = '', cls = [], tip = '';
          if (rk === 's') { const x = gship(g, d); tot += x.t; if (x.t >= 0.5) { txt = n0(x.t); cls.push('sh'); if (x.t >= 999.5) cls.push(x.t >= 9999.5 ? 'w5' : 'w4'); tip = `${md(d)} ${NM[g]} 출하 ${n0(x.t)}t${x.act ? ' (MES 출하 실적)' : ' (계획 출고)'}`; } }
          else { const x = D.sw[`${g}|${d}`]; if (x) { const r = x.tgt ? x.v / x.tgt : 0; txt = (x.v / 1000).toFixed(1); tip = `${md(d)} ${NM[g]} 기말 재고 ${n0(x.v)}t / 목표 ${n0(x.tgt)}t (${x.tgt ? Math.round(r * 100) : '-'}%)`; cls.push(x.v < 0 ? 'neg' : !x.tgt ? '' : r > 1.3 ? 'hi2' : r > 1 ? 'hi' : 'ok'); } }
          S2 += `<td class="${cls.join(' ')}${dayCls(d)}" style="--ci:${i}" data-d="${d}"${tip ? ` title="${esc(tip)}"` : ''}>${txt}</td>`;
        });
        S2 += `<td class="tot">${rk === 's' ? n0(tot) : ''}</td></tr>`;
      });
    });
    const shipSum = (cls, lab, gs) => [['s', '출하(t)'], ['k', '재고(천t)']].forEach(([rk, lb], ri) => {   // 출하·재고 합(사용자 10/21: 도금·컬러 합)
      S2 += `<tr class="grp ${cls}${ri === 0 ? ' first' : ''}">` + (ri === 0 ? `<th class="c0 gh" rowspan="2">${lab}</th>` : '') + `<th class="c1 gh2">${lb}</th>`;
      let tot = 0;
      ds.forEach((d) => { let txt = '', tip = '';
        if (rk === 's') { const t = gs.reduce((a, g) => a + gship(g, d).t, 0); tot += t; if (t >= 0.5) { txt = n0(t); tip = `${md(d)} ${lab} 출하 ${n0(t)}t`; } S2 += `<td class="${t >= 9999.5 ? 'w5' : t >= 999.5 ? 'w4' : ''}${d === today ? ' tb' : ''}" data-d="${d}"${tip ? ` title="${esc(tip)}"` : ''}>${txt}</td>`; return; }
        const xs = gs.map((g) => D.sw[`${g}|${d}`]).filter(Boolean); if (xs.length) { const v = xs.reduce((a, x) => a + x.v, 0), tg = xs.reduce((a, x) => a + (x.tgt || 0), 0); txt = (v / 1000).toFixed(1); tip = `${md(d)} ${lab} 기말 재고 ${n0(v)}t / 목표 ${n0(tg)}t (${tg ? Math.round(v / tg * 100) : '-'}%)`; }
        S2 += `<td class="${d === today ? 'tb' : ''}" data-d="${d}"${tip ? ` title="${esc(tip)}"` : ''}>${txt}</td>`; });
      S2 += `<td class="tot gt">${rk === 's' ? n0(tot) : ''}</td></tr>`;
    });
    const GG = ['G수출', 'G국내', 'G자동차'], CC = ['C수출', 'C건재'];
    // 합계 줄은 각 묶음 맨 아래, 전체(도금+컬러)는 표 맨 아래(사용자 10/21)
    if (UI.inScope('G')) { shipBlock('G', GG); shipSum('G', '도금 합', GG); }
    if (UI.inScope('C')) { if (UI.inScope('G')) S2 += `<tr class="gap"><td colspan="${ds.length + 3}"></td></tr>`; shipBlock('C', CC); shipSum('C', '컬러 합', CC); }
    if (UI.inScope('G') && UI.inScope('C')) { S2 += `<tr class="gap"><td colspan="${ds.length + 3}"></td></tr>`; shipSum('A', '도금+컬러', [...GG, ...CC]); }
    tg = 'b';
    sec('자가재 재고 (도금 → 컬러 소재, 기말)', 'C');
    for (const a of ['AZ', 'MAC', 'AL']) row(`자가재 ${a}`, (d) => { const x = D.self[`${a}|${d}`]; if (!x) return {}; const nx = useNext(a, d, 3); return { x: kt(x.stock), c: (x.stock < 0 ? 'neg' : nx > 0 && x.stock < nx ? 'lo' : '') + (d >= D.selfEst ? ' est' : ''), tip: `${d >= D.selfEst ? '[추정: 1월 초 컬러 출고 = 12월 일평균] ' : ''}${md(d)} 자가재 ${a}: 도금 입고 +${n0(x.prod)} · 컬러 출고 −${n0(x.use)} → 기말 재고 ${n0(x.stock)}t (향후 3일 소요 ${n0(nx)}t)` }; }, false, 'sub');
    if (PM && PM.length) {
      sec('구매 소재 (기말 예상 재고 — 추가 발주 없음 가정)', 'M');
      for (const m of PM) {
        if (!UI.inScope(m.plant)) continue;
        row(`${m.nm}`, (d) => {
          if (d < today) return { x: '', c: 'nd' };
          const v = m.stock[d], a = m.arr[d] || 0, u = m.use[d] || 0;
          const c = [v < 0 ? 'neg' : v < u * 7 ? 'lo' : '', a > 0.5 ? 'inb2' : '', d === m.dl ? 'dl' : ''].filter(Boolean).join(' ');
          return { x: kt(v), c, tip: `${md(d)} ${PLN[m.plant]} ${m.nm}: 소요 −${n0(u)}${a ? ` · 입고 +${n0(a)}(기발주)` : ''} → 기말 재고 ${n0(v)}t${d === m.dl ? ` · 발주 마감: ${m.sup ? m.sup.name : ''}(리드타임 ${m.sup ? m.sup.lt : '-'}일)` : ''}${m.run && d >= m.run ? ' · 재고 소진(추가 발주 필요)' : ''}` };
        }, false, 'sub');
      }
    }
    $('s-cal').innerHTML = G2 + '</tbody>';
    $('s-ship').innerHTML = S2 + '</tbody>';
    document.querySelectorAll('#s-ship [data-d]').forEach((el) => el.onclick = () => pick(el.dataset.d, 'g'));
    for (const t_ of [$('s-cal'), $('s-ship')]) { const r0 = t_.tHead && t_.tHead.rows[0]; if (r0) t_.style.setProperty('--h1', r0.getBoundingClientRect().height + 'px'); }
    $('s-cal2').innerHTML = head + '<tbody>' + H.b + '</tbody>';
    typeCal(ds, head);
    document.querySelectorAll('#s-cal [data-d]').forEach((el) => el.onclick = () => pick(el.dataset.d, 'g'));      // 가동 캘린더 → 생산 상세
    document.querySelectorAll('#s-cal2 [data-d]').forEach((el) => el.onclick = () => pick(el.dataset.d, 'm'));     // 소재 캘린더 → 소재 상세
    const snap = () => { for (const [w, t] of [[$('s-calw'), $('s-cal')], [$('s-shw'), $('s-ship')], [$('s-calw3'), $('s-cal3')], [$('s-calw2'), $('s-cal2')]]) { if (!w || !t || !w.offsetParent) continue; w.style.maxWidth = ''; const th = t.querySelector(`thead th[data-d="${add(today, -2)}"]`); if (!th || w.scrollWidth <= w.clientWidth) continue;
      const r0 = t.querySelector('thead tr:first-child'), t0 = t.getBoundingClientRect().left;
      const st = [...r0.querySelectorAll(':is(.c0,.c1,.lb)')].reduce((a, x) => a + x.getBoundingClientRect().width, 0) || 122, tw = (r0.querySelector('.tot') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width;
      const cols = [...r0.querySelectorAll('th[data-d]')].map((x) => { const r = x.getBoundingClientRect(); return [r.left - t0 - st, r.right - t0 - st]; });
      const A = w.clientWidth - st - tw, want = th.getBoundingClientRect().left - t0 - st;   // 날짜 칸이 들어갈 폭
      let i = cols.findIndex((c) => c[0] >= want - 0.5); if (i < 0) i = 0;
      while (i > 0 && cols[cols.length - 1][1] - cols[i - 1][0] <= A + 0.5) i--;               // 끝까지 다 보이면 앞 칸을 더 보여 줌
      let j = i; while (j + 1 < cols.length && cols[j + 1][1] - cols[i][0] <= A + 0.5) j++;
      w.style.maxWidth = Math.floor(st + tw + cols[j][1] - cols[i][0]) + 'px';                 // 보이는 폭을 날짜 칸 경계에 맞춤 — 왼쪽(라인)·오른쪽(계) 고정 칸에 날짜가 반쯤 가려지지 않게(10/21 사용자: 겹친다)
      w.scrollLeft = Math.max(0, Math.round(cols[i][0])); } };
    if (!cal.snapR) { const ro = new ResizeObserver(() => { clearTimeout(cal.snapT); cal.snapT = setTimeout(() => cal.snap && cal.snap(), 120); }); ['s-calw', 's-shw', 's-calw3', 's-calw2'].forEach((id) => { const e = document.getElementById(id); if (e && e.parentElement) ro.observe(e.parentElement); }); document.querySelectorAll('details.tv').forEach((x) => x.addEventListener('toggle', () => setTimeout(() => cal.snap(), 30))); cal.snapR = true; }
    cal.snap = snap; snap(); requestAnimationFrame(snap); setTimeout(snap, 400);
    const sync = (a, b) => a.addEventListener('scroll', () => { if (Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft; });   // 두 달력 가로 스크롤 함께
    if (!cal.synced) { const W3 = [$('s-calw'), $('s-calw3'), $('s-calw2')]; for (const x of W3) for (const y of W3) if (x !== y) sync(x, y); cal.synced = true; }
    charts(ds);
    const pm = PAGE === 'matcal' ? 'm' : 'g';
    if (sel && sel.slice(0, 7) === mon) pick(sel, pm, true); else pick(ds.includes(today) ? today : ds[0], pm, true);   // 자동 선택(달 바꿈·다시 그림)은 스크롤하지 않음(10/22 사용자)
  }

  // ---------- 자가재 도우미(도금 생산 → 컬러 투입 연결) ----------
  const span = (L) => { if (!L.length) return '-'; const ds = L.map((x) => x[0]).sort(); const ls = [...new Set(L.map((x) => x[1]))].sort(); return `${md(ds[0])}${ds.length > 1 && ds[ds.length - 1] !== ds[0] ? '~' + md(ds[ds.length - 1]) : ''} ${ls.join('·')}`; };
  const sum3 = (L) => L.reduce((a, x) => a + x[2], 0);
  const flowOf = (due, sec, a) => D.flow.find((f) => f.due === due && f.sec === sec && f.a === a);
  // ---------- 팀 소재 리드타임 표(2026-10-12) → 입고 예정일·발주일 ----------
  // need = 입고 필요일(컬러 생산 − 7일). 고정 일수형은 need 에 맞춰 입고, 달력형(○일 발주 → 차차월 ○일 입고)은 need 이전 가장 늦은 입고일
  const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const mondayOf = (s_) => add(s_, -((wd(s_) + 6) % 7));
  const eom = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  function cal2(need, arrDay, ordFrom, ordTo, ok = () => true) {        // 차차월 arrDay 입고, ordFrom~ordTo 일 발주
    let y = +need.slice(0, 4), m = +need.slice(5, 7);
    for (let k = 0; k < 4; k++) {
      const a = ymd(y, m, Math.min(arrDay, eom(y, m)));
      if (a <= need && ok(m)) { const om = m - 2 <= 0 ? m + 10 : m - 2, oy = m - 2 <= 0 ? y - 1 : y; return { arrive: a, ord: ymd(oy, om, ordFrom), ordTo: ymd(oy, om, ordTo) }; }
      m -= 1; if (m === 0) { m = 12; y -= 1; }
    }
    return null;
  }
  function teamRule(code, cust, need) {
    const lg = /엘지|LG/i.test(cust || '');
    const fix = (type, days, weekly) => { const o = add(need, -days); return { type, arrive: need, ord: weekly ? mondayOf(o) : o, rule: `${weekly ? '매주 발주 · ' : ''}+${days % 7 === 0 ? days / 7 + '주' : days + '일'}` }; };
    switch (code) {
      case 'G': return fix('P-GI', 35, true);
      case 'E': return fix('P-EG', 35, true);
      case 'C': return fix('P-CR', 32, true);
      case 'S': return lg ? fix('외부SUS(LG)', 2) : fix('외부SUS', 28);
      case 'L': return fix('외부Alu', 45);
      case 'V': { const r = cal2(need, 20, 10, 15); return r && { type: '동종-AZ', ...r, rule: '10~15일 발주 → 차차월 20일 입고' }; }
      case 'O': { const r = cal2(need, 30, 1, 7, (m) => m % 2 === 0); return r && { type: 'MAC(P) 1.5', ...r, rule: '매월 초 발주 → 차차월 30일(1.5는 짝수달 생산)' }; }
      case 'W': { const r = cal2(need, 30, 1, 7, (m) => m % 2 === 1); return r && { type: 'MAC(P) 3.0', ...r, rule: '매월 초 발주 → 차차월 30일(3.0은 홀수달 생산)' }; }
      default: return null;
    }
  }

  // ---------- 품목 한 줄: 요청 납기 → 생산 → 소재(자가재: 도금 생산·컬러 입고 / 구매: 발주 시한·입고 필요일) → 판정 ----------
  // r = [구분, 품명, 규격/지역, 목적지, 선적, 톤, 분, t/h, 이유, 납기, 기본품명, 자가재비중, [[구역, 강종, 1t당]], 고객]
  function matLine(r, d, l) {
    const M = D.W.mat || {}, IN = (M.inLead || {}).C || 7, TL = M.selfLeadTeam || 8, out = [];
    const sh = r[11] || 0, base = r[10] || r[1];
    if (sh > 0.02) {
      for (const [sec, a, w] of r[12] || []) {
        const f = D.flow.find((x) => x.sec === sec && x.a === a && x.use.some((u) => u[0] === d && u[1] === l));
        const made = f ? f.made.map((m) => m[0]).sort() : [];
        const last = made[made.length - 1];
        const gap = last ? Math.round((new Date(d) - new Date(last)) / 864e5) : null;
        const st = !last ? ['warn', '도금 생산 연결 없음(재고에서)'] : gap >= TL ? ['ok', `여유 (도금 ${gap}일 전)`] : gap >= 1 ? ['warn', `빠듯 (도금 ${gap}일 전, 기준 ${TL}일)`] : ['warn', '재고 선사용 — 도금 생산이 더 늦음'];
        out.push({ kind: '자가재', what: `${a} ${Math.round(w * 100)}%`, src: last ? `도금 ${span(f.made)}` : '-', inb: last ? md(add(last, 1)) + ' 컬러 입고' : '-', ord: '-', st, f, steps: last ? [['도금 생산', span(f.made), made[0]], [add(last, 1) <= today ? '입고 완료' : '입고 예정', md(add(last, 1)), add(last, 1)]] : [['재고에서', '-', null]] });
      }
    }
    if (1 - sh > 0.02) {
      const mix = (M.codeMix || {})[base] || (M.codeMix || {})[String(base).slice(0, 3)] || null;
      const codes = mix ? Object.entries(mix).sort((x, y) => y[1] - x[1]) : [];
      const need = add(d, -IN);
      if (!codes.length) out.push({ kind: '구매', what: `${Math.round((1 - sh) * 100)}% (소재 미확인)`, src: '-', inb: `${md(need)}까지`, ord: '-', st: ['warn', '품명 → 소재 연결 없음'], steps: [[need <= today ? '입고 완료' : '입고 필요', md(need), need]] });
      for (const [code, w] of codes.slice(0, 2)) {
        const nm = (M.matCode || {})[code] || code;
        // 업체 유형별(27년 배정 업체 — P-GI·서림GI·수입GI 등) 발주일: 달력형(동종AZ·P-MAC)은 팀 규칙, 나머지는 입고 필요 − 리드타임
        const sups = MP ? MP.P.suppliers.filter((x) => x.plant === 'C' && x.code === code && (x.share || 0) > 0) : [];
        const byT = {}; for (const x of sups) { const t = (byT[x.cls] = byT[x.cls] || { lt: x.lt, sh: 0, n: [] }); t.sh += x.share || 0; t.n.push(MP.supNm(x)); }
        const tr0 = teamRule(code, r[13], need);
        let TT = Object.entries(byT).sort((x, y) => y[1].sh - x[1].sh).map(([c, t]) => { const cal = /동종|MAC/.test(c) && tr0 ? tr0 : null; return { c, sh: t.sh, n: t.n, ord: cal ? cal.ord : add(need, -t.lt), ordTo: cal ? cal.ordTo : null, arrive: cal ? cal.arrive : need }; });
        if (!TT.length && tr0) TT = [{ c: tr0.type, sh: 1, n: [], ord: tr0.ord, ordTo: tr0.ordTo, arrive: tr0.arrive }];
        const oTxt = (t) => (t.ordTo ? `${md(t.ord)}~${md(t.ordTo)}` : md(t.ord));
        const ordTxt = TT.length ? TT.map((t) => (TT.length > 1 ? `${esc(t.c)} ${oTxt(t)}` : oTxt(t))).join(' · ') : '-';
        const first = TT.length ? TT.map((t) => t.ordTo || t.ord).sort()[0] : null, last = TT.length ? TT.map((t) => t.ordTo || t.ord).sort().pop() : null;
        const st = !TT.length ? ['warn', '팀 리드타임 표에 없는 소재'] : first >= today ? ['ok', `발주 예정 ${md(first)}~`] : last >= today ? ['warn', '일부 업체 발주 시점 지남(기발주 확인)'] : ['info', '발주 시점 지남(기발주 확인)'];
        const arr = TT.length ? TT.map((t) => t.arrive).sort()[0] : need;
        const src = TT.length ? TT.map((t) => `${esc(t.c)} ${Math.round(t.sh * 100)}%${t.n.length ? ` (${esc(t.n.slice(0, 3).join('·'))}${t.n.length > 3 ? ` 외 ${t.n.length - 3}` : ''})` : ''}`).join(' · ') : '-';
        out.push({ kind: '구매', what: `${esc(nm)} ${Math.round((1 - sh) * w * 100)}%`, src, inb: `${md(arr)} 입고 예정`, ord: ordTxt, st, steps: [[last && last < today ? '발주(지난 시점)' : '발주', ordTxt, first], [arr <= today ? '입고 완료' : '입고 예정', md(arr), arr]] });
      }
    }
    return out;
  }

  // ---------- 일정 흐름(칩 → 칩): 지난 날짜 = 완료(회색 ✓), 오늘 생산 = 강조 ----------
  const flowHtml = (steps) => `<div class="flw">${steps.map(([lb, v, dt, cl], i) => `${i ? '<i>›</i>' : ''}<span class="fs ${cl || ''} ${dt && dt < today && !cl ? 'done' : ''}"><small>${esc(lb)}</small><b>${v}</b></span>`).join('')}</div>`;
  // 도금 소재(F/H): 강종 → 소재 코드, 입고 필요 = 생산일 − 투입 여유 5일, 발주 마감 = 입고 필요 − 업체 유형별 리드타임(27년 배정 업체)
  function matG(r, d) {
    const a = r[0] || '', code = /STS/.test(a) ? 'N' : /^AL/.test(a) ? 'H' : 'F', need = add(d, -5);
    if (code === 'N') return { what: '도금용 SUS', steps: [['포스코 지급(임가공)', '-', null]], st: ['info', '발주 대상 아님'] };
    const P = MP && MP.P, nm = P ? (P.matCode || {})[code] || code : code;
    const sups = P ? P.suppliers.filter((x) => x.plant === 'G' && x.code === code && (x.share || 0) > 0) : [];
    const byT = {}; for (const x of sups) { const t = (byT[x.cls] = byT[x.cls] || { lt: x.lt, sh: 0 }); t.sh += x.share || 0; }
    const ords = Object.entries(byT).sort((x, y) => y[1].sh - x[1].sh).map(([c, t]) => `${esc(c)} ${md(add(need, -t.lt))}`).join(' · ') || '-';
    const j = MP && MP.J.find((x) => x.plant === 'G' && x.code === code && x.wk === mondayOf(d));
    const st = !j ? ['info', '-'] : j.short < 1 ? ['ok', '재고·기발주로 충당'] : ['warn', `그 주 부족 ${n0(j.short)}t — 소재 발주에서 확인`];
    return { what: nm, steps: [['발주 마감', ords, null], [need <= today ? '입고 완료' : '입고 필요', md(need), need]], st };
  }

  // ---------- 날짜 상세 ----------
  function pick(d, mode = 'g', auto = false) {
    sel = d;
    calAll('.sel').forEach((el) => el.classList.remove('sel'));
    document.querySelectorAll(`${mode === 'm' ? '#s-cal2' : '#s-cal'} [data-d="${d}"]`).forEach((el) => el.classList.add('sel'));
    if (mode === 'm') { $('s-det').innerHTML = ''; matDetail(d, auto); return; }
    $('s-det2').innerHTML = '';
    const pcard = (l) => { const x = D.pl[`${l}|${d}`]; if (!x) return ''; return `<section class="card rv wide" data-noexport data-dom="G"><h3>${l} · ${x.t > 0.5 ? `${x.fam} ${n0(x.t)}t` : '생산 없음'} ${x.act ? '<small>(실적)</small>' : ''} ${x.ev ? `<small style="color:#8a5a00">${esc(x.ev)}</small>` : ''}</h3>
      <div class="scroll"><table class="dt mt fl"><thead><tr><th>강종 · 부서</th><th>목적지</th><th class="r">톤</th><th>소재</th><th>일정 (소재 → 생산 → 납기)</th><th>판정</th></tr></thead><tbody>${x.items.map((r) => { const f = r[1] === '자가재' ? flowOf(r[6], r[2], r[0]) : null, m = matG(r, d);
        const steps = [...m.steps, ['도금 생산', md(d), d, 'now'], ...(f ? [['컬러 투입', span(f.use), null]] : [['납기', md(r[6]), r[6]]])];
        return `<tr><td><b>${esc(r[0])}</b> <small>${esc(r[1])}</small></td><td>${esc([r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r">${n0(r[5])}</td><td>${esc(m.what)}</td><td>${flowHtml(steps)}</td><td class="st ${m.st[0]}">${esc(m.st[1])}</td></tr>`; }).join('') || '<tr><td colspan="6" class="small">생산 없음</td></tr>'}</tbody></table></div>
      ${x.why.length ? `<div class="why">${x.why.map(esc).join('<br>')}</div>` : ''}</section>`; };
    const ccard = (l) => { const x = D.co[`${l}|${d}`]; if (!x || x.t < 0.5) return ''; const fu = D.fUse[`${l}|${d}`] || []; return `<section class="card rv wide" data-noexport data-dom="C"><h3>${l} · ${n0(x.t)}t ${x.act ? '<small>(실적)</small>' : ''}</h3>
      ${fu.length ? `<div class="fin">${fu.map(([f, t]) => `<span>자가재 ${esc(f.a)} ${n0(t)}t ← 도금 ${span(f.made)}</span>`).join('')}</div>` : ''}
      ${x.rows.length ? `<div class="scroll"><table class="dt mt fl"><thead><tr><th>품명 · 구분</th><th>고객·지역</th><th class="r">톤</th><th>소재</th><th>일정 (소재 → 생산 → 납기)</th><th>판정</th></tr></thead><tbody>${x.rows.slice(0, 12).map((r) => { const ML = x.act ? [] : matLine(r, d, l); const n = Math.max(1, ML.length); const due = r[9] ? md(r[9]) : esc(r[4] || '-'); const head_ = (k) => (k ? '' : `<td rowspan="${n}"><b>${esc(r[1])}</b> <small>${esc(r[0] === '주문재' ? '건재 주문재' : r[0])}</small></td><td rowspan="${n}">${esc([r[13] || r[2], r[3]].filter(Boolean).join(' · '))}</td><td class="r" rowspan="${n}">${n0(r[5])}</td>`); return ML.length ? ML.map((m, k) => `<tr class="${k ? 'cont' : ''}"${r[8] ? ` title="배치 사유: ${esc(r[8])}"` : ''}>${head_(k)}<td><small class="kd2 ${m.kind === '자가재' ? 'self' : 'buy'}">${m.kind}</small> ${m.what}${m.src !== '-' && m.kind === '구매' ? `<div class="srcl">${m.src}</div>` : ''}</td><td>${flowHtml([...(m.steps || []), ['컬러 생산', md(d), d, 'now'], ['납기', due, r[9] || null]])}</td><td class="st ${m.st[0]}">${m.st[1]}</td></tr>`).join('') : `<tr>${head_(0)}<td colspan="3" class="small">실적일</td></tr>`; }).join('')}</tbody></table></div>${x.rows.length > 12 ? `<div class="why">외 ${x.rows.length - 12}건</div>` : ''}` : `<div class="why">${Object.entries(x.g).map(([k, v]) => `${esc(k)} ${n0(v)}t`).join(' · ')}</div>`}</section>`; };
    const sc = `<section class="card rv" data-noexport data-dom="C"><h3>자가재 (당일)</h3><table class="dt"><thead><tr><th>강종</th><th class="r">도금 입고</th><th class="r">컬러 출고</th><th class="r">기말 재고</th><th class="r">향후 3일 출고</th></tr></thead><tbody>${['AZ', 'MAC', 'AL'].map((a) => { const x = D.self[`${a}|${d}`] || {}; return `<tr><td>${a}</td><td class="r">${n0(x.prod)}</td><td class="r">${n0(x.use)}</td><td class="r"><b>${n0(x.stock)}</b></td><td class="r">${n0(useNext(a, d, 3))}</td></tr>`; }).join('')}</tbody></table></section>`;
    const mc = PM && PM.length ? `<section class="card rv" data-noexport data-dom="M"><h3>구매 소재 (당일, 추가 발주 없음 가정)</h3><table class="dt"><thead><tr><th>소재</th><th class="r">사용</th><th class="r">입고(기발주)</th><th class="r">재고</th><th>발주 마감</th></tr></thead><tbody>${PM.filter((m) => UI.inScope(m.plant)).slice(0, 10).map((m) => `<tr><td>${esc(m.nm)}</td><td class="r">${d < today ? '-' : n0(m.use[d] || 0)}</td><td class="r">${m.arr[d] ? n0(m.arr[d]) : ''}</td><td class="r">${d < today ? '-' : `<b class="${m.stock[d] < 0 ? 'neg' : ''}">${n0(m.stock[d])}</b>`}</td><td>${m.dl ? md(m.dl) : '-'}</td></tr>`).join('')}</tbody></table><div class="why">자세한 업체 판단·구매 요청은 <a href="procure.html">소재 발주</a></div></section>` : '';
    $('s-det').innerHTML = `<div class="dethd g"><span>${md(d)}(${WD[wd(d)]}) 가동 상세 <small>도금·컬러 라인별 품목 · 납기 · 소재 연결 — 소재 발주·입고는 <a href="matcal.html">소재 캘린더</a>에서</small></span>${foldBtn('s-det')}</div>` + ['1CGL', '2CGL'].map(pcard).join('') + ['1CCL', '2CCL', '3CCL', '4CCL'].map(ccard).join('');
    UI.reveal($('s-det'));
  }


  // ---------- 상세 접기·펼치기(상태는 이 브라우저에 기억, 날짜를 다시 골라도 유지) ----------
  const FKEY = 'cgl-supply-fold';
  let fold = {}; try { fold = JSON.parse(localStorage.getItem(FKEY) || '{}'); } catch (e) { /* 무시 */ }
  const foldBtn = (id) => { $(id).classList.toggle('folded', !!fold[id]); return `<button type="button" class="fold noprint" data-fold="${id}" aria-expanded="${!fold[id]}">${fold[id] ? '펼치기 ▾' : '접기 ▴'}</button>`; };
  ['s-det', 's-det2'].forEach((id) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-fold]'); if (!b) return;
    fold[id] = !fold[id]; try { localStorage.setItem(FKEY, JSON.stringify(fold)); } catch (x) { /* 무시 */ }
    $(id).classList.toggle('folded', fold[id]); b.textContent = fold[id] ? '펼치기 ▾' : '접기 ▴'; b.setAttribute('aria-expanded', String(!fold[id]));
  }));

  // ---------- 소재 상세(소재 캘린더에서 날짜를 누를 때): 자가재 입출고 · 구매 소재 재고·입고·발주 마감 · 당일 투입 소재 ----------
  function matDetail(d, auto = false) {
    const M = D.W.mat || {};
    // ① 자가재: 그날 도금 생산(라인) → 언제 컬러에 투입 / 그날 컬러 사용(라인) ← 언제 도금 생산
    const selfRows = ['AZ', 'MAC', 'AL'].map((a) => { const x = D.self[`${a}|${d}`] || {};
      const made = ['1CGL', '2CGL'].flatMap((l) => (D.fMade[`${l}|${d}`] || []).filter(([f]) => f.a === a).map(([f, t]) => `${l} ${n0(t)}t → 컬러 ${span(f.use)}`));
      const used = ['1CCL', '2CCL', '3CCL', '4CCL'].flatMap((l) => (D.fUse[`${l}|${d}`] || []).filter(([f]) => f.a === a).map(([f, t]) => `${l} ${n0(t)}t ← 도금 ${span(f.made)}`));
      return `<tr><td><b>${a}</b></td><td>${n0(x.prod)}</td><td>${n0(x.use)}</td><td class="${x.stock < 0 ? 'neg' : ''}"><b>${n0(x.stock)}</b></td><td>${n0(useNext(a, d, 3))}</td><td class="para">${made.join('<br>') || '-'}</td><td class="para">${used.join('<br>') || '-'}</td></tr>`; }).join('');
    const sc = `<section class="card rv wide" data-noexport><h3>자가재 (도금 → 컬러)</h3><div class="scroll"><table class="dt"><thead><tr><th>강종</th><th>입고 <small>(도금 생산)</small></th><th>출고 <small>(컬러 투입 8일 전)</small></th><th>기말 재고</th><th>향후 3일 출고</th><th>당일 입고분 → 컬러 투입일</th><th>당일 컬러 투입분 ← 도금 생산일</th></tr></thead><tbody>${selfRows}</tbody></table></div></section>`;
    // ② 구매 소재: 전 소재
    const pm = (PM || []).filter((m) => UI.inScope(m.plant)).map((m) => { const past = d < today, v = m.stock[d], u = m.use[d] || 0, a = m.arr[d] || 0;
      const left = !past && m.u28 > 0 ? Math.round(v / m.u28) : null;
      const flags = [a > 0.5 ? `<span class="tag good">입고 ${n0(a)}t</span>` : '', d === m.dl ? '<span class="tag bad">발주 마감</span>' : '', m.run && !past && d >= m.run ? '<span class="tag bad">소진</span>' : ''].filter(Boolean).join(' ');
      return `<tr><td><b>${esc(m.nm)}</b> <small class="muted">${PLN[m.plant]}</small></td><td>${past ? '-' : n0(u)}</td><td>${past ? '-' : `<b class="${v < 0 ? 'neg' : ''}">${n0(v)}</b>`}</td><td>${left != null ? left + '일' : '-'}</td><td>${m.run ? md(m.run) : '없음'}</td><td>${m.dl ? md(m.dl) : '-'}</td><td>${m.sup ? `${esc(m.sup.name)} · ${m.sup.lt}일` : '-'}</td><td>${flags || '-'}</td></tr>`; }).join('');
    const mc = PM && PM.length ? `<section class="card rv wide" data-noexport><h3>구매 소재 <small>${d < today ? '과거 일자 — 예상 재고는 당일부터 표시' : '추가 발주 없음 가정'}</small></h3><div class="scroll"><table class="dt"><thead><tr><th>소재</th><th>당일 사용</th><th>기말 재고</th><th>재고 일수</th><th>소진 예정일</th><th>발주 마감</th><th>기본 업체 · 리드타임</th><th>당일 조치</th></tr></thead><tbody>${pm}</tbody></table></div></section>` : '';
    // ③ 그날 컬러가 쓰는 소재(라인 × 소재): 자가재 = 품명별 강종 비중, 구매 = 품명 → 소재 코드 비중(13주 실적)
    const use = {}, lines = ['1CCL', '2CCL', '3CCL', '4CCL'];
    for (const l of lines) { const x = D.co[`${l}|${d}`]; if (!x) continue;
      for (const r of x.rows || []) { const t = +r[5] || 0, sh = r[11] || 0, base = r[10] || r[1];
        for (const [sec, a, w] of r[12] || []) { const k = `자가재 ${a}`; (use[k] = use[k] || {})[l] = (use[k][l] || 0) + t * w; }
        const mix = (M.codeMix || {})[base] || (M.codeMix || {})[String(base).slice(0, 3)] || null;
        if (1 - sh > 0.02) { if (mix) for (const [c, w] of Object.entries(mix)) { const k = (M.matCode || {})[c] || c; (use[k] = use[k] || {})[l] = (use[k][l] || 0) + t * (1 - sh) * w; } else { (use['소재 미확인'] = use['소재 미확인'] || {})[l] = (use['소재 미확인'][l] || 0) + t * (1 - sh); } } } }
    const keys = Object.keys(use).sort((a, b) => lines.reduce((s_, l) => s_ + (use[b][l] || 0), 0) - lines.reduce((s_, l) => s_ + (use[a][l] || 0), 0)).filter((k) => lines.reduce((s_, l) => s_ + (use[k][l] || 0), 0) >= 0.5);
    const uc = keys.length ? `<section class="card rv wide" data-noexport><h3>당일 컬러 생산 투입 소재 <small>라인별 · 제품 톤 기준(품명별 소재 비중) — 자가재 표의 출고는 투입 8일 전 기준이라 수치가 다름</small></h3><div class="scroll"><table class="dt"><thead><tr><th>소재</th>${lines.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead><tbody>${keys.map((k) => `<tr><td><b>${esc(k)}</b></td>${lines.map((l) => `<td>${use[k][l] ? n0(use[k][l]) : ''}</td>`).join('')}<td><b>${n0(lines.reduce((s_, l) => s_ + (use[k][l] || 0), 0))}</b></td></tr>`).join('')}</tbody></table></div></section>` : '';
    $('s-det2').innerHTML = `<div class="dethd m"><span>${md(d)}(${WD[wd(d)]}) 소재 상세 <small>자가재 입출고 · 구매 소재 재고·입고·발주 마감 · 당일 투입 소재 — 라인별 품목은 <a href="supply.html">가동 캘린더</a>에서</small></span>${foldBtn('s-det2')}</div>` + sc + mc + uc;
    UI.reveal($('s-det2'));
    if (!auto) $('s-det2').scrollIntoView({ behavior: 'smooth', block: 'start' });   // 칸을 눌렀을 때만 상세로 스크롤(처음 열 때·달 바꿀 때 자동 선택은 그대로)
  }

  // ---------- 추이 그래프(달 단위) ----------
  function lineChart(title, series, ds, tgt) {   // 10/21: 글자·선이 늘어나지 않게(비율 고정 viewBox), 2px 선, 오른쪽 끝 값, 오늘 세로선, 가는 격자
    const W = 640, H = 230, L = 44, R = 78, T = 14, B = 26, all = series.flatMap((s_) => s_.v).concat(tgt ? tgt.map((t) => t.v) : []).filter((v) => v != null);
    const sc = UI.scale(Math.max(...all, 1), Math.min(0, ...all)), mx = sc.hi, mn = sc.lo;
    const X = (i) => L + i * (W - L - R) / Math.max(1, ds.length - 1), Y = (v) => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
    let g = '';
    for (const v of sc.ticks) g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${kf(v)}</text>`;
    g += `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(Math.max(0, mn))}" y2="${Y(Math.max(0, mn))}"/>`;
    ds.forEach((d, i) => { if (i % 5 === 0 || i === ds.length - 1) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${+d.slice(8)}</text>`; });
    const ti = ds.indexOf(today); if (ti >= 0) g += `<line x1="${X(ti)}" x2="${X(ti)}" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1"/><text x="${X(ti) + 3}" y="${T + 9}">오늘</text>`;
    (tgt || []).forEach((t) => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(t.v)}" y2="${Y(t.v)}" stroke="${t.c}" stroke-width="1"/>`; });
    const ends = [];
    for (const s_ of series) { const pts = s_.v.map((v, i) => (v == null ? null : [X(i), Y(v), v, i])).filter(Boolean); if (!pts.length) continue;
      g += `<path d="M${pts.map((p_) => `${p_[0].toFixed(1)},${p_[1].toFixed(1)}`).join(' L')}" fill="none" stroke="${s_.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><title>${s_.n}</title></path>`;
      const e = pts[pts.length - 1]; g += `<circle cx="${e[0]}" cy="${e[1]}" r="4" fill="${s_.c}" stroke="var(--surface)" stroke-width="2"/>`; ends.push({ y: e[1], t: `${s_.n} ${n0(e[2])}`, c: s_.c });
      pts.forEach((p_) => { g += `<circle cx="${p_[0].toFixed(1)}" cy="${p_[1].toFixed(1)}" r="6" fill="transparent"><title>${md(ds[p_[3]])} ${s_.n} ${n0(p_[2])}t</title></circle>`; }); }
    ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;   // 끝 글자 겹침 방지(짧은 이동만)
    ends.forEach((e) => { g += `<text class="v" x="${W - R + 8}" y="${e.y + 4}">${e.t}</text>`; });
    return `<h2>${title}<span class="unit">톤</span></h2><div class="vz-lg" style="margin-left:0">${series.map((s_) => `<span><i style="background:${s_.c};height:3px;vertical-align:3px"></i>${s_.n}</span>`).join('')}</div><svg class="vz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}">${g}</svg>`;
  }
  // 주별 발주량(소재 유형별 누적 막대): 이번 주부터 13주 — 구매팀이 주마다 낼 양. 이번 주 막대에는 마감 지난 몫(빗금)이 포함
  function weekOrdChart() {   // 10/21: 유형이 11개라 색이 겹쳐 못 읽음 → 13주 합 상위 5개 + 기타(회색), 고정 색 순서, 늘어남 없는 viewBox
    const w0 = mondayOf(today), WK = Array.from({ length: 13 }, (_, i) => add(w0, i * 7)), TL = typeList().map((x) => x[1]);
    const V = WK.map((w) => TL.map((c) => { let t = 0, late = 0; for (const [d, L] of Object.entries(MP.T[c].ord)) if (d >= w && d < add(w, 7)) { t += sumT(L); late += sumT(L.filter((e) => e.late)); } return { c, t, late }; }));
    const totc = TL.map((c, k) => V.reduce((a, r) => a + r[k].t, 0)), top = TL.map((c, k) => [c, totc[k]]).filter((x) => x[1] >= 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
    const KEYS = [...top, ...(TL.some((c, k) => totc[k] >= 1 && !top.includes(c)) ? ['기타'] : [])], CV = ['--vz-c1', '--vz-c2', '--vz-c3', '--vz-c4', '--vz-c5'];
    const colr = (k) => (k === '기타' ? 'var(--vz-other)' : `var(${CV[top.indexOf(k)]})`);
    const Wk = V.map((r) => KEYS.map((k) => { const es = k === '기타' ? r.filter((e) => !top.includes(e.c)) : r.filter((e) => e.c === k); return { k, t: es.reduce((a, e) => a + e.t, 0), late: es.reduce((a, e) => a + e.late, 0) }; }));
    const tot = Wk.map((r) => r.reduce((x, e) => x + e.t, 0)), W = 640, H = 240, L = 44, R = 8, T = 18, B = 26, sc = UI.scale(Math.max(...tot, 1) * 1.08, 0), slot = (W - L - R) / WK.length, bw = Math.min(24, slot * 0.55);
    const Y = (v) => T + (H - T - B) * (1 - v / sc.hi);
    let g = '<defs><pattern id="hz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="6" fill="var(--surface)" opacity=".7"/></pattern></defs>';
    for (const v of sc.ticks) g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${kf(v)}</text>`;
    g += `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    WK.forEach((w, i) => {
      const x = L + i * slot + (slot - bw) / 2, segs = Wk[i].filter((e) => e.t >= 1); let y0 = 0;
      segs.forEach((e, j) => { const y1 = y0 + e.t, yt = Y(y1), yb = Y(y0) - (j ? 2 : 0), h = Math.max(0, yb - yt), last = j === segs.length - 1;
        const r = last ? Math.min(4, h) : 0;
        g += last ? `<path d="M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${yb} Z" fill="${colr(e.k)}"><title>${md(w)} 주 ${e.k} ${n0(e.t)}t${e.late >= 1 ? ` (마감 지난 몫 ${n0(e.late)}t)` : ''}</title></path>`
          : `<rect x="${x}" y="${yt}" width="${bw}" height="${h}" fill="${colr(e.k)}"><title>${md(w)} 주 ${e.k} ${n0(e.t)}t${e.late >= 1 ? ` (마감 지난 몫 ${n0(e.late)}t)` : ''}</title></rect>`;
        if (e.late >= 1) g += `<rect x="${x}" y="${Y(y0 + e.late)}" width="${bw}" height="${Math.max(0, Y(y0) - Y(y0 + e.late) - (j ? 2 : 0))}" fill="url(#hz)" pointer-events="none"/>`;
        y0 = y1; });
      if (tot[i] >= 1) g += `<text class="v" x="${x + bw / 2}" y="${Y(tot[i]) - 5}" text-anchor="middle">${kf(tot[i])}</text>`;
      if (i % 2 === 0) g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${md(w)}</text>`;
    });
    return `<h2>주별 발주량 <small>이번 주부터 13주 · 빗금 = 마감 지난 몫(이번 주에 모음)</small><span class="unit">톤</span></h2><div class="vz-lg" style="margin-left:0">${KEYS.map((k) => `<span><i style="background:${colr(k)}"></i>${esc(k)}</span>`).join('')}</div><svg class="vz" viewBox="0 0 ${W} ${H}" role="img" aria-label="주별 발주량">${g}</svg>`;
  }
  function charts(ds) {
    $('s-ch1').innerHTML = lineChart('자가재 재고 추이 <small>도금 → 컬러 소재, 계획 기준 기말 재고</small>', [['AL', 'var(--vz-c1)'], ['AZ', 'var(--vz-c2)'], ['MAC', 'var(--vz-c3)']].map(([a, c]) => ({ n: a, c, v: ds.map((d) => (D.self[`${a}|${d}`] || {}).stock) })), ds);
    $('s-ch2').innerHTML = MP ? weekOrdChart() : '';
  }

  // ---------- 소재 월별 요약(2026-10-20 회의: 위는 월로 — 그 달에 들어와야 할 양 중 입고·발주된 양과 남은 양, 소재 그룹별 막대) ----------
  let msMode = 'grp';
  const USE_G = (pl, lb) => (pl === 'G' ? ({ 도금국내: '도금국내', 도금수출: '도금수출', 자가재: '자가재', 자동차: '자동차강판', 자동차내수: '자동차강판', 자동차수출: '자동차강판' }[lb] || '미상')
    : (/계획재|주문재/.test(lb) ? '컬러건재' : /수요/.test(lb) ? '수요개발' : /건재수출/.test(lb) ? '건재수출' : /내수/.test(lb) ? '가전내수' : '가전수출'));   // 10/20: 소재 발주엔 색이 없어(컬러건재 669건 중 21건) 계획재·주문재를 소재 단계에서 못 나눔 → 한 줄
  const GORD = { G: ['도금수출', '도금국내', '자동차강판', '자가재'], C: ['가전수출', '가전내수', '건재수출', '컬러건재', '수요개발'] };
  const GLB = { 컬러건재: '컬러건재', 미상: '미상', '컬러수출(세부 대기)': '컬러수출(세부?)', '컬러건재(세부 대기)': '컬러건재(세부?)' };
  // 월별 막대(2026-10-20 사용자: 알아보기 쉽게) — 막대 통 높이 = 그 달 들어와야 할 양, 아래부터 입고(진하게)·발주(연하게)로 차오르고 빈 곳(빨간 점선) = 아직 발주 안 한 양
  function fillChart(pl, codes, cell, ms, nmf) {   // 월 × 그룹 칸: 확보(입고+발주)/계획 톤 + 막대(입고·발주·남음) — 사용자 10/20: 글자 겹침·%만으로는 톤을 모름 → 칸 표로
    const v = (c, m) => cell[`${pl}|${c}|${m}`] || { rec: 0, ord: 0, nw: 0 };
    const sum = (m) => codes.reduce((a, c) => { const x = v(c, m); a.rec += x.rec; a.ord += x.ord; a.nw += x.nw; return a; }, { rec: 0, ord: 0, nw: 0 });
    const td = (x, tot) => {
      const p = x.rec + x.ord + x.nw;
      if (p < 0.5) return '<td class="fm-c fm-0">-</td>';
      const f = x.rec + x.ord, pc = Math.round(f / p * 100), w = (t) => (t / p * 100).toFixed(1);
      const cls = pc >= 100 ? 'ok' : pc >= 60 ? 'mid' : 'lo';
      return `<td class="fm-c${tot ? ' fm-t' : ''}" title="${esc(`계획 ${n0(p)}t = 입고 완료 ${n0(x.rec)} + 발주(입고 예정) ${n0(x.ord)} + 아직 발주 안 함 ${n0(x.nw)}`)}">`
        + `<div class="fm-h"><b>${n0(f)}</b><span> / ${n0(p)}t</span><em class="${cls}">${pc}%</em></div>`
        + `<div class="fm-b"><i class="r" style="width:${w(x.rec)}%"></i><i class="o" style="width:${w(x.ord)}%"></i></div>`
        + `<div class="fm-s"><span class="r">입고 ${n0(x.rec)}</span><span class="o">발주 ${n0(x.ord)}</span><span class="${x.nw >= 1 ? 'n' : ''}">잔여 ${n0(x.nw)}</span></div></td>`;
    };
    return `<div class="scroll"><table class="fm fm-${pl}"><thead><tr><th class="l">${msMode === 'grp' ? '판매그룹' : '소재 유형'}</th>${ms.map((m) => `<th>${+m.slice(5)}월</th>`).join('')}</tr></thead><tbody>`
      + `<tr class="fm-tr"><td class="l"><b>합계</b></td>${ms.map((m) => td(sum(m), true)).join('')}</tr>`
      + codes.map((c) => `<tr${/^미상|대기/.test(c) ? ' class="unk"' : ''}><td class="l">${esc(nmf(c))}</td>${ms.map((m) => td(v(c, m))).join('')}</tr>`).join('')
      + '</tbody></table></div>'
      + '<div class="fm-lg"><span><i class="r"></i>입고 완료</span><span><i class="o"></i>발주(입고 예정)</span><span><i class="e"></i>잔여 = 아직 발주 안 한 양</span><span>굵은 숫자 = 확보(입고+발주) / 그 달 들어와야 할 양</span></div>';
  }
  function vMat(pl, codes, cell, m, nmf) {   // 사용자 10/21: 세로 막대로 도금·컬러를 한 화면에 — 선택한 달(위 월 탭): 진한 = 입고 완료, 옅은 = 발주(입고 예정), 회색 = 잔여(아직 발주 안 함), 높이 = 그 달 들어와야 할 양
    const v = (c) => cell[`${pl}|${c}|${m}`] || { rec: 0, ord: 0, nw: 0 };
    const cs = codes.filter((c) => { const x = v(c); return x.rec + x.ord + x.nw >= 1; });
    const T = cs.reduce((a, c) => { const x = v(c); a.rec += x.rec; a.ord += x.ord; a.nw += x.nw; return a; }, { rec: 0, ord: 0, nw: 0 });
    const P = T.rec + T.ord + T.nw, F = T.rec + T.ord, pc = P ? Math.round(F / P * 100) : 0;
    return `<div class="mv-h"><b>${pl === 'G' ? '도금 소재 (F/H)' : '컬러 구매 소재'}</b><span>${+m.slice(5)}월 확보 <b>${n0(F)}</b> / ${n0(P)}t (${pc}%)</span><span class="mv-s">입고 ${n0(T.rec)} · 발주 ${n0(T.ord)} · <span class="${T.nw >= 1 ? 'n' : ''}">잔여 ${n0(T.nw)}</span></span></div>`
      + (cs.length ? colChart(cs.map((c) => { const x = v(c), p = x.rec + x.ord + x.nw;
        return { name: nmf(c), a: x.rec, b: x.ord, plan: p, vals: [x.rec + x.ord, p, x.nw], neg: x.nw >= 1,
          tip: `${nmf(c)} ${+m.slice(5)}월: 들어와야 할 양 ${n0(p)}t = 입고 완료 ${n0(x.rec)} + 발주(입고 예정) ${n0(x.ord)} + 잔여(아직 발주 안 함) ${n0(x.nw)}` }; }), 170, ['확보', '필요', '잔여']) : '<p class="small muted">이 달 들어와야 할 소재 없음</p>');
  }
  function monthSum() {
    if (!$('s-msum').id) return;
    if (!MP) { $('s-msum').innerHTML = '<p class="small">소재 발주 자료가 없습니다.</p>'; return; }
    const PO_ = D.PO || {}, RV = msMode === 'grp' ? ((PO_.matGrp || {}).recv) : PO_.matRecv, POG = (PO_.matGrp || {}).po || {}, ms = D.months, ym = (d) => d.slice(0, 7);
    const cell = {}, add_ = (pl, c, m, k, t) => { if (!ms.includes(m) || t < 0.01) return; if (msMode === 'grp' && /^미상/.test(c)) c = '미상'; const x = (cell[`${pl}|${c}|${m}`] = cell[`${pl}|${c}|${m}`] || { rec: 0, ord: 0, nw: 0 }); x[k] += t; };
    for (const [k, t] of Object.entries(RV || {})) { const [pl, c, d] = k.split('|'); if (msMode !== 'grp' && pl === 'G' && c === 'N') continue; add_(pl, c, ym(d), 'rec', t); }
    for (const a of MP.arrs || []) { if (a.plant === 'G' && a.code === 'N') continue; add_(a.plant, msMode === 'grp' ? (POG[a.po] || '미상(계약 부서 없음)') : a.code, ym(a.date < today ? today : a.date), 'ord', +a.t || 0); }
    for (const j of MP.J) {
      if (j.kind === 'pos' || j.short < 1) continue;
      const tot = (j.use || []).reduce((a, r) => a + (+r[3] || 0), 0), sh = {};
      for (const r of j.use || []) { const g = USE_G(j.plant, r[1]); sh[g] = (sh[g] || 0) + (tot > 0 ? (+r[3] || 0) / tot : 0); }
      if (!Object.keys(sh).length) sh['미상'] = 1;
      for (const x of j.split) if (x.t >= 1) { const m = ym(j.needBy < today ? today : j.needBy); if (msMode === 'grp') for (const [g, w] of Object.entries(sh)) add_(j.plant, g, m, 'nw', x.t * w); else add_(j.plant, j.code, m, 'nw', x.t); }
    }
    const nm = (c) => (msMode === 'grp' ? c : MP.codeNm(c)), html = [];
    for (const pl of ['G', 'C'].filter((p_) => UI.inScope(p_))) {
      const all = [...new Set(Object.keys(cell).filter((k) => k[0] === pl).map((k) => k.split('|')[1]))];
      const val = (c) => ms.reduce((a, m) => { const x = cell[`${pl}|${c}|${m}`]; return a + (x ? x.rec + x.ord + x.nw : 0); }, 0);
      const codes = (msMode === 'grp' ? [...GORD[pl].filter((g) => all.includes(g)), ...all.filter((g) => !GORD[pl].includes(g))] : all.sort((a, b) => val(b) - val(a))).filter((c) => val(c) >= 1);
      if (!codes.length) continue;
      html.push(`<div class="mss" data-dom="${pl}">${vMat(pl, codes, cell, ms.includes(mon) ? mon : ms[0], (c) => (msMode === 'grp' ? (GLB[c] || c) : MP.codeNm(c)))}</div>`);
    }
    const unk = Object.entries(cell).filter(([k]) => /\|미상/.test(k)).reduce((a, [, x]) => a + x.rec + x.ord, 0);
    $('s-msum').innerHTML = `<h2>월별 소재 입고 계획 <small>그 달에 들어와야 할 양 = 입고 완료 + 발주(입고 예정) + 잔여(아직 발주 안 한 양) — 업체 구분 없이</small><span class="unit">톤</span></h2>`
      + `<div class="seg" id="s-msm" style="margin:2px 0 8px"><button type="button" data-m="grp" aria-pressed="${msMode === 'grp'}">판매그룹별</button><button type="button" data-m="code" aria-pressed="${msMode === 'code'}">소재 유형별</button></div>`
      + (msMode === 'grp' ? `<p class="small muted">판매그룹: 잔여 = 그 소재를 쓰는 생산 계획의 판매그룹 비중으로 나눔 · 입고·발주 = 소재 발주의 판매 계약 → 계약 부서. 도금 소재인데 컬러 부서 계약이면 자가재.${unk >= 1 ? ` <b style="color:var(--warn)">판매그룹을 못 정한 입고·발주 ${n0(unk)}t는 "미상" — 대부분 발주를 찾지 못한 입고(조회 범위 180일보다 오래된 발주, 또는 발주 없이 들어온 입고).</b>` : ''}</p>` : '')
      + (RV ? '' : '<p class="small" style="color:var(--warn)">입고 실적(MES 소재 입고)이 아직 게시되지 않았습니다 — 다음 자동 실행부터 들어옵니다.</p>')

      + `<div class="mss2">${html.join('')}</div>`
      + vzLegend([['a', '입고 완료'], ['b', '발주(입고 예정)'], ['t', '잔여 = 아직 발주 안 한 양']]) + '<p class="small muted" style="margin:2px 0 0 46px">위 숫자 = 확보(입고+발주) / 그 달 들어와야 할 양 · 달은 위 월 탭</p>';
    $('s-msm').querySelectorAll('button').forEach((b) => b.onclick = () => { msMode = b.dataset.m; monthSum(); });
  }

  // ---------- 이번 달 진행(2026-10-20 회의: 도금 생산·출하, 컬러 생산·출하 4개 그래프) ----------
  function progress() {
    const PO = D.PO; if (!PO || !$('s-prog').id) return;
    const L = PO.lines || [], SH = ((PO.sr || {}).ship) || [], G = PO.groups || [];
    const sum = (xs, k) => xs.reduce((a, x) => a + (+x[k] || 0), 0);
    const shp = (names) => SH.filter((x) => names.includes(x.name));
    const card = (pl, kind, nm, m, sc, ac, asOf, sub) => {
      const pct = m > 0 ? ac / m * 100 : 0, sp = m > 0 ? Math.min(100, sc / m * 100) : 0, gap = ac - sc;
      return `<div class="pg" data-dom="${pl}"><div class="pg-h"><b>${nm}</b><small>${esc(asOf || '')} 기준</small></div>
        <div class="pg-v">${n0(ac)}<small>t</small> <span class="pg-p">${pct.toFixed(0)}%</span></div>
        <div class="vz-meter" title="실적 ${n0(ac)}t / 월 계획 ${n0(m)}t · 세로선 = 오늘까지 계획 ${n0(sc)}t"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i><em style="left:${sp.toFixed(1)}%"></em></div>
        <div class="pg-s">월 계획 ${n0(m)}t · 오늘까지 계획 ${n0(sc)}t → <b class="${gap >= 0 ? 'pos' : 'neg'}">${gap >= 0 ? '+' : '−'}${n0(Math.abs(gap))}t</b> · 남은 ${n0(Math.max(0, m - ac))}t</div>
        ${sub ? `<div class="pg-g">${sub}</div>` : ''}</div>`;
    };
    // 출하 실적 = MES 출하(판매 출고) 기준(사용자 10/20) — 월 계획·오늘까지 계획은 판매생산속보
    const SDp = PO.shipDay, m0 = today.slice(0, 7);
    const mesShip = (g) => (SDp && SDp.g && SDp.g[g] ? Object.entries(SDp.g[g]).filter(([d]) => d.slice(0, 7) === m0).reduce((a, [, v]) => a + v, 0) : null);
    const gl = (pl, kind) => G.filter((g) => g.pl === pl && g[kind] && g.key !== 'G자가재').map((g) => { const x = g[kind], ac = kind === 'ship' && mesShip(g.key) != null ? mesShip(g.key) : x.actual; return `<span>${esc(g.name)} <b>${n0(ac)}</b>/${n0(x.month)}</span>`; }).join('');
    const shipAct = (keys, fb) => { const v = keys.map(mesShip); return v.every((x) => x == null) ? fb : v.reduce((a, x) => a + (x || 0), 0); };
    const out = [];
    if (UI.inScope('G')) {
      const l = L.filter((x) => x.pl === 'G'), s_ = shp(['도금판매', '도금수출', '자동차강판']);
      out.push(card('G', 'prod', '도금 생산 (1·2CGL)', sum(l, 'month'), sum(l, 'sched'), sum(l, 'actual'), l[0] && md(l[0].asOf), gl('G', 'prod')));
      out.push(card('G', 'ship', '도금 출하', sum(s_, 'month'), sum(s_, 'sched'), shipAct(['G수출', 'G국내', 'G자동차'], sum(s_, 'actual')), SDp && SDp.asOf ? md(SDp.asOf) : (PO.sr || {}).asOf && md((PO.sr.asOf).slice(0, 10)), gl('G', 'ship')));
    }
    if (UI.inScope('C')) {
      const l = L.filter((x) => x.pl === 'C'), s_ = shp(['컬러수출', '컬러건재']);
      out.push(card('C', 'prod', '컬러 생산 (1~4CCL)', sum(l, 'month'), sum(l, 'sched'), sum(l, 'actual'), l[0] && md(l[0].asOf), gl('C', 'prod')));
      out.push(card('C', 'ship', '컬러 출하', sum(s_, 'month'), sum(s_, 'sched'), shipAct(['C수출', 'C건재'], sum(s_, 'actual')), SDp && SDp.asOf ? md(SDp.asOf) : (PO.sr || {}).asOf && md((PO.sr.asOf).slice(0, 10)), gl('C', 'ship')));
    }
    // 판매그룹별 생산 진행(사용자 10/21: 월 계획 얼마에 그룹별로 얼마 생산, 얼마 잔여 — 세로 막대): 진한 = 생산 실적, 옅은 = 남은 기간 계획 생산(재계획·편성), 회색 = 월 계획까지 모자라는 몫
    const grpPanel = (pl, title) => { const gs = G.filter((g) => g.pl === pl && g.prod && g.prod.month > 0); if (!gs.length || !UI.inScope(pl)) return '';
      return `<div class="pgv" data-dom="${pl}"><h3>${title}</h3>` + colChart(gs.map((g) => { const x = g.prod, rem = Math.max(0, x.month - x.actual), fin = x.actual + (x.after || 0);
        return { name: g.name.replace(/\(.*\)/, '').replace('도금 자가재', '자가재'), a: x.actual, b: x.after || 0, plan: x.month, vals: [x.actual, x.month, rem, fin], neg: fin < x.month - 0.5,
          tip: `${g.name}: 월 계획 ${n0(x.month)}t · 생산 ${n0(x.actual)}t · 잔여 ${n0(rem)}t · 남은 기간 계획 생산 ${n0(x.after || 0)}t → 월말 예상 ${n0(fin)}t (${fin >= x.month ? '+' : '−'}${n0(Math.abs(fin - x.month))}t)` }; }), 170, ['생산', '월 계획', '잔여', '월말 예상']) + '</div>'; };
    const gv = grpPanel('G', '도금 판매그룹별 생산') + grpPanel('C', '컬러 판매그룹별 생산');
    $('s-prog').innerHTML = `<h2>이번 달 진행 <small>계획 대비 실적 — 막대 = 실적 / 월 계획, 세로선 = 오늘까지 계획</small><span class="unit">톤</span></h2><div class="pgs">${out.join('')}</div>`
      + (gv ? `<div class="pgvs">${gv}</div>${vzLegend([['a', '생산 실적'], ['b', '남은 기간 계획 생산'], ['p', '월 계획']])}<p class="small muted" style="margin:2px 0 0 46px">막대 위 % = 월말 예상 ÷ 월 계획 · 빨강 = 남은 기간 계획을 다 만들어도 월 계획 미달</p>` : '') + `
      <p class="small muted" style="margin:8px 2px 0">생산 = MES 실적 · 출하 실적 = MES 출하(판매 출고, 부서 → 판매그룹) · 월 계획·오늘까지 계획 = 판매생산속보. 라인별 상세는 <a href="status.html">도금 가동 현황</a> · <a href="color_status.html">컬러 가동 현황</a></p>`;
  }

  async function render(W, pw) {
    D = prep(W);
    D.live = await live(pw);
    if ($('s-det2')) { try { const fe = await GP.latest('fh_po.enc.json'); FHP = fe ? await GP.decryptJSON(fe, pw) : null; } catch (e) { FHP = null; } }   // 소재 발주 → 계약·판매그룹·목적지(tools/fh_po_detail.py)
    try { const pe = await GP.latest('procure.enc.json'); const P = pe ? await GP.decryptJSON(pe, pw) : null; PM = P ? prepMat(P) : null; MP = P ? matPlan(P) : null; } catch (e) { PM = null; MP = null; }
    mon = D.months.includes(today.slice(0, 7)) ? today.slice(0, 7) : D.months[0];
    const LV = D.live || {};
    $('s-meta').innerHTML = LV.pl ? `실적 ~${md(LV.pl.t0)} · 재계획 ${esc(LV.pl.at.slice(5))}` : `기준 <b>확정 계획</b> · 계산 ${esc(String(W.built).replace('T', ' '))} · 실적 ~${esc(W.asOf)}`;
    $('main').hidden = false; $('lock').hidden = true;
    tabs(); weekBox(); progress(); monthSum(); cal(); UI.reveal(document);
  }
  let env = null;
  async function open(pw) {
    try { const W = await GP.decryptJSON(env, pw); try { localStorage.setItem(KEY, pw); } catch (e) { /* 무시 */ } await render(W, pw); }
    catch (e) { console.error(e); $('lock').hidden = false; $('msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('f').onsubmit = (e) => { e.preventDefault(); open($('pw').value); };
  GP.latest('integrated.enc.json').then((e) => { if (!e) throw new Error(); env = e; let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ } if (s) open(s); else $('lock').hidden = false; })
    .catch(() => { $('lock').hidden = false; $('msg').textContent = '자료를 찾을 수 없습니다'; });
})();
