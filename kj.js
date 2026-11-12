/* 관제(11/12 회의·화이트보드 '# 관제', 5차 — 검토자 '상' 13건 반영)

   이 화면에서 볼 것 · 보는 순서(위 → 아래)
   0. 달 탭 11월 실적 · 12월 계획 · 1월 계획 — 화면 전체(카드·그래프·표·캘린더·조치)가 같이 바뀜
   1. 운영 일정 한 줄
   2. 결론 카드 4개 — 수주 진도(판매계획 대비) · 생산 달성(오늘까지 계획 대비) · 소재 결품 위험 · 창고 재고(소재·제품 / 상한)
   3. 도금 전체 | 컬러 전체(같은 축) — 판매계획 · 수주 · 생산 · 출하 · 재고(소재·제품)
   4. 그룹별 같은 그래프(그룹 7개 같은 축)
   5. 관제 매트릭스 — 3·4 의 숫자를 표로(공장 전체 = 그룹 합, 합계 줄)
   6. 소재 — 그 달 생산에 맞춰 들어와야 할 양 대비 입고 · 발주 · 발주 안 함 · 발주 시기 전 + 결품 위험(카드와 같은 목록)
   7. 일별 계획 캘린더 — 라인·그룹 × 날짜
   8. 조치할 사항(그 달 것만, 할 일까지)

   숫자 기준(한 화면 안에서 모두 같은 값)
   · 수주 진도 = 확정(다음 달 = 그 달 납기 주문) ÷ 판매계획. 오늘 기준(기준선) = 1일~주문 마감 생산주 끝(cut)까지 통합 계획 편성량 — 눈금선·색에만 씀
   · 생산 = 계획 화면 '지금' 판과 같은 출처·반올림: 도금 = 매일 재계획(latest.plan, 지난 날 = MES 실적 + plating_actual), 컬러 = 지난 날 color_actual · 앞날 통합 계획 color
     월 계획 = 지난 날 실적 + 앞날 계획 · 오늘까지 계획(달성 기준) = 월초 계획(수주 관제 일별 p0) · 그룹 계획 = 일별 그룹 배정 합 → 공장 = 그룹 합 = 라인 합
   · 출하(이번 달) = 판생속보 그룹 출하. 다음 달 출하 계획은 따로 없음(판매계획과 같은 값이라 그리지 않음)
   · 제품 재고: 이번 달 = 그룹 실재고(bridge) · 다음 달 = 통합 계획 일별 재고(stockDay·자가재 self)의 그 달 말일, 목표 = stockTgt(제품 재고 목표)
   · 소재 재고: 이번 달 = 판생속보 5.소재 표의 발주 부서(판매그룹) 줄(portal.sr.stock[].grp — 도금 F/H 컬러 부서 발주 = 도금 자가재, DUMMY/포장재 = 미배정 grpNa 공장 줄에만)
     다음 달 = 그룹 소재 계획 자료 없음 → 공장 단위(통합 계획 FH·CMAT 월말)
   · 재고 비율 = (소재 + 제품) ÷ (소재 목표 + 제품 목표) — 목표 = '27 판생 그룹 적정재고(고정값), 공장 = 그룹 합 + 도금 더미 500
     그룹 소재가 없는 달(다음 달 계획)은 그룹 비율 = 제품 ÷ 제품 목표('제품만') · 제품 재고는 도금 자가재 포함(목표 없음 '–') */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const FILES = ['suju.enc.json', 'portal.enc.json', 'integrated.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'procure.enc.json', 'latest.plan.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json'];
  // 그룹 = 판매그룹 합 단위(회의 [272]~[277]: 컬러건재 주문재·계획재 나누지 않음) · cal = 계획 일별 자료의 그룹(클래스) 이름
  const GRP = [
    { k: 'G수출', pl: 'G', nm: '도금수출', sj: ['도금수출'], od: ['도금수출그룹'], cal: ['도금수출'] },
    { k: 'G국내', pl: 'G', nm: '도금국내', sj: ['도금국내'], od: ['도금판매그룹'], cal: ['도금국내'] },
    { k: 'G자동차', pl: 'G', nm: '자동차', sj: ['자동차'], od: ['자동차강판판매그룹'], cal: ['자동차', '자동차내수', '자동차수출'] },
    { k: 'G자가재', pl: 'G', nm: '도금 자가재', sj: ['자가재'], od: null, cal: ['자가재'], self: true },
    { k: 'C수출', pl: 'C', nm: '컬러수출', sj: ['건재수출', '가전수출', '가전내수'], od: ['컬러수출그룹'], cal: ['건재수출', '가전수출', '가전내수'] },
    { k: 'C건재', pl: 'C', nm: '컬러건재', sj: ['주문재', '계획재'], od: ['컬러건재판매그룹'], cal: ['주문재', '계획재'] },
    { k: 'C수요', pl: 'C', nm: '수요개발', sj: ['수요개발'], od: ['수요개발그룹'], cal: ['수요개발'] },
  ];
  const PN = { G: '도금', C: '컬러' }, LINES = { G: ['1CGL', '2CGL'], C: ['1CCL', '2CCL', '3CCL', '4CCL'] };
  const FLOW = ['sales', 'ord', 'off', 'offPo', 'offNo', 'gap', 'base', 'pPlan', 'pAct', 'pDue', 'sPlan', 'sAct', 'sDue', 'stk'];   // 공장 = 그룹 합인 값
  let X = null, A = null, mSel = null, bound = false, TIPS = [];
  const LS = 'kj-month';

  CT.boot(FILES, (D) => { if (D !== X) { X = D; A = prep(D); } draw(); });

  const inPl = (p) => CT.inScope(p);
  const sum = (L, f) => { let s = 0, any = false; for (const x of L) { const v = f(x); if (v != null && !isNaN(v)) { s += +v; any = true; } } return any ? s : null; };
  const addM = (ym, k) => { const d = new Date(ym + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
  const mLab = (m) => `${+m.slice(5)}월`;
  const nDays = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
  const daysOf = (m) => Array.from({ length: nDays(m) }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
  const pctOf = (a, b) => (a != null && b ? a / b * 100 : null);
  const P0 = (v) => (v == null ? '–' : `${Math.round(v)}%`);
  // 색 뜻은 둘뿐(범례에 그대로): 빨강 = 오늘 기준보다 모자람 · 주황 = 재고 상한(목표) 초과
  const shortT = (v, due) => (v != null && due != null && v + 0.5 < due ? 'bad' : '');
  const overT = (v, cap) => (v != null && cap && v > cap ? 'ov' : '');

  /* ---------- 자료 준비(한 번) ---------- */
  function prep(D) {
    const S = D.suju, P = D.portal || {}, I = D.integrated || {};
    if (!S) throw new Error('수주 관제 자료(suju)가 없습니다');
    const M0 = S.month, months = [M0, addM(M0, 1), addM(M0, 2)];
    const SG = Object.fromEntries(S.groups.map((g) => [g.key, g]));
    const BR = Object.fromEntries((S.bridge || []).map((b) => [b.eng, b]));
    const V = ((I.variants || {})[I.rec || I.confirmed || 'V1'] || {});
    const pmIdx = (m) => (P.months || []).indexOf(m);
    const gOf = (k) => (GRP.find((G) => G.cal.includes(k)) || {}).k;

    // 일별 계획(캘린더 = 그래프·매트릭스 생산의 출처) = 계획 화면 '지금' 판과 같은 자료·같은 반올림(gyehoek.js curCell·cellT)
    //  도금 = 매일 재계획(latest.plan rows, 지난 날 = MES 실적 + plating_actual) · 강종별 반올림 합
    //  컬러 = 지난 날 color_actual(그룹별), 앞날 통합 계획 color · 라인·일 반올림 — 그룹 칸은 그 반올림 합에 맞춰 나눔(그룹 합 = 라인 합)
    const FAM = (a) => (/^AZ/.test(a) ? 'AZ' : /^MAC/.test(a) ? 'MAC' : 'AL');
    const LR = D['latest.plan'] && (D['latest.plan'].result || D['latest.plan']), PA = D.plating_actual, CB = (D.color_actual || {}).byGroup;
    const cell = {}, cOf = (l, d) => (cell[`${l}|${d}`] = cell[`${l}|${d}`] || { t: 0, f: {}, g: {} });
    const put = (l, d, f, k, t) => { const x = cOf(l, d); x.t += t; if (f) x.f[f] = (x.f[f] || 0) + t; x.g[k] = (x.g[k] || 0) + t; };
    if (LR && LR.rows) {
      for (const [d, l, a, k, t] of LR.rows) put(l, d, FAM(a), k, +t || 0);
      const t0 = (LR.replan || {}).t0 || '';
      if (PA && PA.asOf && Array.isArray(PA.daily) && t0) for (const r of PA.daily) {   // 재계획 뒤 들어온 MES 실적 = 라인 합(그룹은 수주 관제 그룹 실적을 라인 몫으로)
        if (!(r.d > t0 && r.d <= PA.asOf)) continue;
        const ga = {}; for (const G of GRP.filter((g) => g.pl === 'G')) for (const k of G.cal) for (const [d, , a] of (S.gdaily || {})[k] || []) if (d === r.d && a) ga[k] = (ga[k] || 0) + a;
        const gt = sum(Object.values(ga), (v) => v) || 0;
        for (const l of LINES.G) { const f = cell[`${l}|${r.d}`] ? cell[`${l}|${r.d}`].f : {}, ft = sum(Object.values(f), (v) => v) || 0; delete cell[`${l}|${r.d}`]; const t = +r[l] || 0;
          const x = cOf(l, r.d); x.t = t; for (const [k, v] of Object.entries(f)) x.f[k] = ft ? v * t / ft : 0; for (const [k, v] of Object.entries(ga)) x.g[k] = gt ? v * t / gt : 0; }
      }
    } else for (const x of V.plating || []) { for (const [a, t] of Object.entries(x.alloy || {})) cOf(x.l, x.d).f[FAM(a)] = (cOf(x.l, x.d).f[FAM(a)] || 0) + t; for (const [k, t] of Object.entries(x.cls || {})) { const c = cOf(x.l, x.d); c.t += t; c.g[k] = (c.g[k] || 0) + t; } }
    const actC = CB && CB.days ? CB.asOf || '' : '';
    for (const x of I.color || []) if (!(x.d <= actC)) for (const [k, t] of Object.entries(x.g || {})) put(x.l, x.d, null, k, +t || 0);
    if (actC) for (const [d, o] of Object.entries(CB.days)) if (d <= actC) for (const [l, v] of Object.entries(o || {})) for (const [k, t] of Object.entries((v || [])[0] || {})) put(l, d, null, k, +t || 0);
    // 칸 값(계획 화면 표와 같은 반올림) + 그룹 몫(큰 나머지 순으로 정수 — 합 = 칸 값)
    const cellV = (l, d) => { const x = cell[`${l}|${d}`]; if (!x || x.t < 0.5) return { T: 0, g: {} };
      const T = /CGL$/.test(l) && Object.keys(x.f).length ? Object.values(x.f).reduce((a, v) => a + (v >= 0.5 ? Math.round(v) : 0), 0) : Math.round(x.t);
      const E = Object.entries(x.g).filter(([, v]) => v > 0), g = {}; let left = T - E.reduce((a, [k, v]) => a + (g[k] = Math.floor(v)), 0);
      const ord = E.slice().sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])) || b[1] - a[1]);
      for (let i = 0, n = 0; left !== 0 && ord.length && n < 1000; i = (i + 1) % ord.length, n++) { const k = ord[i][0]; if (left > 0) { g[k]++; left--; } else if (g[k] > 0) { g[k]--; left++; } }
      return { T, g }; };
    const cal = {};
    for (const m of months) {
      const days = daysOf(m), lineR = {}, grpR = {}, ev = {}, cur = m === M0, asOf = S.asOf;
      for (const l of [...LINES.G, ...LINES.C]) lineR[l] = days.map(() => ({ p: 0, a: null, p0: null }));
      for (const G of GRP) grpR[G.k] = days.map(() => ({ p: 0, a: null, p0: null }));
      days.forEach((d, i) => { for (const l of [...LINES.G, ...LINES.C]) { const v = cellV(l, d); lineR[l][i].p = v.T; for (const [k, t] of Object.entries(v.g)) { const g = gOf(k); if (g) grpR[g][i].p += t; } } });
      if (cur) {   // 지난 날: 실적 = 계획 화면 '지금' 판 값 · 월초 계획(p0) = 수주 관제 일별(오늘까지 계획)
        const past = (i) => days[i] <= asOf;
        for (const l of [...LINES.G, ...LINES.C]) { const P0 = Object.fromEntries((S.daily[l] || []).map(([d, p0]) => [d, p0])); lineR[l].forEach((r, i) => { if (past(i)) { r.a = r.p; r.p0 = P0[days[i]] || 0; } }); }
        for (const G of GRP) { const P0 = {}; for (const k of G.cal) for (const [d, p] of (S.gdaily || {})[k] || []) P0[d] = (P0[d] || 0) + (p || 0); grpR[G.k].forEach((r, i) => { if (past(i)) { r.a = r.p; r.p0 = P0[days[i]] || 0; } }); }
      }
      // 정지 사유: 도금 = 재계획 cal 이벤트(없으면 통합 계획) · 컬러 = 정지 장부(하루 전체 정지만) — '휴' 대신 '수리' 표시
      for (const x of V.plating || []) if (x.ev && days.includes(x.d)) ev[`${x.l}|${x.d}`] = x.ev;
      for (const c of (LR && LR.cal) || []) if (c.event && days.includes(c.date)) ev[`${c.line}|${c.date}`] = c.event;
      for (const [d, l, k, mn] of I.colorDown || []) if (days.includes(d) && mn >= 1439 && { sd: 1, repair: 1, jr: 1 }[k]) ev[`${l}|${d}`] = { sd: 'S/D', repair: '수리', jr: '정기수리' }[k];
      cal[m] = { days, lineR, grpR, ev };
    }
    // 오늘 기준(기준선) = 통합 계획 그룹 배정 1일~cut 합(수주 관제 base 와 같은 계산 — 컬러건재는 계획재 포함)
    const baseG = {};
    for (const x of V.plating || []) if (x.d.slice(0, 7) === M0 && x.d <= S.cut) for (const [k, t] of Object.entries(x.cls || {})) { const g = gOf(k); if (g) baseG[g] = (baseG[g] || 0) + t; }
    for (const x of I.color || []) if (x.d.slice(0, 7) === M0 && x.d <= S.cut) for (const [k, t] of Object.entries(x.g || {})) { const g = gOf(k); if (g) baseG[g] = (baseG[g] || 0) + t; }
    // 그 달 납기 주문(도금 수출 배선 주문 = 출항·입항일, 없으면 납기 — 회의 [25]~[32]·[183]~[185])
    const ordDue = {};
    for (const [pl, R] of [['G', (D.cg_order_progress || {}).rows], ['C', (D.cc_order_progress || {}).rows]]) for (const r of R || []) {
      const d = pl === 'G' ? r.dept || r.arr || r.due : r.due, m = String(d || '').slice(0, 7), g = GRP.find((x) => x.pl === pl && x.od && x.od.includes(r.grp)); if (!g || !m) continue;
      ordDue[`${g.k}|${m}`] = (ordDue[`${g.k}|${m}`] || 0) + (+r.ordT || 0); }
    const hasOrd = { G: !!(D.cg_order_progress && D.cg_order_progress.rows), C: !!(D.cc_order_progress && D.cc_order_progress.rows) };
    // 소재 OFF 나눔(11/12 회의): 수주 관제 OFF(suju_build — 마감 생산주(cut)까지 만들 남은 등록 주문 − 소재 매치)와 같은 주문·같은 기준으로 다시 세어 미발주만 뽑음
    //  도금 미발주 = 주문에 F/H 발주(snap_raw_ask 발주번호)도 소재 연결도 없음(cg_order_progress st '미발주') · 그 밖(포스코 진행·발주 진행 정보 없음 등) = 발주 진행
    //  컬러 미발주 = 주문에 연결된 소재 발주번호(snap_ord_raw_link)·자가재 계약·배정 소재가 모두 없음 — 컬러는 재고기반 주문이 많아 '발주 확정 누락'이 아니라 공용 재고 매치 대기일 수 있음
    const wedOf = (d) => { const x = new Date(d.slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 4) % 7)); return x.toISOString().slice(0, 10); };
    const addD = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const cutW = S.cut ? wedOf(S.cut) : null, inCut = (due, sche, back) => { const pd = sche || (due ? addD(due, -back) : null); return !!(cutW && pd && due >= `${M0}-01` && wedOf(pd > S.today ? pd : S.today) <= cutW); };
    const offNo = {};
    for (const r of (D.cg_order_progress || {}).rows || []) { const g = GRP.find((x) => x.pl === 'G' && x.od && x.od.includes(r.grp)), rr = Math.max(0, (+r.ordT || 0) - (+r.prodT || 0));
      if (g && rr > 0.5 && r.st === '미발주' && inCut(r.due || '', r.sche, 7)) offNo[g.k] = (offNo[g.k] || 0) + rr; }
    for (const r of (D.cc_order_progress || {}).rows || []) { const g = GRP.find((x) => x.pl === 'C' && x.od && x.od.includes(r.grp)), rr = +r.remT || 0, o = rr - Math.min(rr, (+r.mchT || 0) + (+r.woT || 0));
      if (g && rr > 0.5 && o > 0 && !(r.po || r.self || r.matT > 0.0005) && inCut(r.due || '', r.sche, 10)) offNo[g.k] = (offNo[g.k] || 0) + o; }
    // 통합 계획 일별 재고(stockDay: P.months 첫날부터) · 자가재(self: 강종별 [월-일, …, 재고])
    const d0 = (P.months || [])[0] ? `${P.months[0]}-01` : null;
    const dayIdx = (d) => (d0 ? Math.round((Date.parse(d) - Date.parse(d0)) / 864e5) : -1);
    const stockEnd = (k, m) => { const L = (V.stockDay || {})[k], i = dayIdx(`${m}-${String(nDays(m)).padStart(2, '0')}`); return L && i >= 0 && i < L.length ? L[i] : null; };
    const selfEnd = (m) => { const key = `${m.slice(5)}-${String(nDays(m)).padStart(2, '0')}`; const v = sum(Object.values(V.self || {}), (L) => { const r = (L || []).find((x) => x[0] === key); return r ? r[3] : null; }); return v; };
    const one = (gs, k, gk) => (gs[0] && gs[0][gk] ? gs[0][k] : sum(gs, (g) => g[k]));   // 컬러수출 3그룹·컬러건재 2그룹은 출하가 첫 그룹에 합으로 한 번만
    const grp = {}, dept = {};
    for (const G of GRP) {
      const gs = G.sj.map((k) => SG[k]).filter(Boolean), b = BR[G.k] || {}, out = {};
      dept[G.k] = (gs[0] || {}).dept || '';
      for (const m of months) {
        const C_ = cal[m], R = C_.grpR[G.k], cur = m === M0, past = (i) => cur && C_.days[i] <= S.asOf;
        const pPlan = sum(R, (r) => r.p), pAct = cur ? sum(R.filter((r, i) => past(i)), (r) => r.a) : null, pDue = cur ? sum(R.filter((r, i) => past(i)), (r) => r.p0) : null;   // 오늘까지 계획 = 월초 계획(지난 날 칸은 실적)
        const i = pmIdx(m), pl = (V.plan || {})[G.k], x = i >= 0 && pl ? pl[i] : null;
        if (cur) { const sales = G.self ? null : sum(gs, (g) => g.sales), ord = G.self ? null : sum(gs, (g) => g.orders), off = G.self ? null : Math.max(0, sum(gs, (g) => (g.ordReg || 0) - (g.orders || 0)));
          const oN = G.self || !hasOrd[G.pl] || off == null ? null : Math.min(off, Math.round(offNo[G.k] || 0));   // 미발주 · 발주 진행 = OFF − 미발주(합 = OFF)
          out[m] = { sales, ord, off, offNo: oN, offPo: oN == null ? null : off - oN, gap: sales == null || ord == null ? null : sales - ord - (off || 0),   // gap = 미수주(음수 = 판매계획 넘침)
          base: G.self ? null : (baseG[G.k] != null ? Math.round(baseG[G.k]) : null),
          pPlan, pAct, pDue, sPlan: G.self ? null : one(gs, 'shipMon', 'shipGrp'), sAct: G.self ? null : one(gs, 'shipAct', 'shipGrp'), sDue: G.self ? null : one(gs, 'shipDue', 'shipGrp'),
          stk: b.begin != null ? b.begin : null, cap: b.target != null ? b.target : null }; }
        else { const tg = (V.stockTgt || {})[G.k], st = G.self ? selfEnd(m) : stockEnd(G.k, m);
          out[m] = { sales: G.self || !x ? null : x.sales, ord: G.self || !hasOrd[G.pl] ? null : Math.round(ordDue[`${G.k}|${m}`] || 0), base: null, pPlan, pAct: null, pDue: null,
            sPlan: null, sAct: null, sDue: null, stk: st != null ? Math.round(st) : null, cap: st == null ? null : tg && i >= 0 && tg[i] != null ? tg[i] : x ? Math.round(x.target) : null, safety: x ? x.safety : null }; }
      }
      grp[G.k] = out;
    }
    // 재고 목표 = '27 판생그룹 적정재고량(11/12 사용자 사진, 합 = 공장 소재 12,600·20,940 / 제품 22,300·19,320 = 75,160)
    //  [소재, 제품] — 컬러수출 = 건재수출(1섹션) + 가전수출(2섹션) · 자가재 목표 없음
    //  도금 소재 12,600 = 더미재 500 + 그룹 12,100 — 그룹 몫은 그룹 제품 목표 비율로 나눔(11/12 사용자 '도금 소재는 그룹별 제품재고 비율만큼 나눠'): 수출 12,100·국내 4,600·자동차 5,600 / 22,300
    const GM = (t) => Math.round(12100 * t / 22300);
    const T27 = { G수출: [12100 - GM(4600) - GM(5600), 12100], G국내: [GM(4600), 4600], G자동차: [GM(5600), 5600], G자가재: [null, null], C수출: [4910 + 6630, 5070 + 5950], C건재: [9100, 8000], C수요: [300, 300] };
    for (const G of GRP) for (const m of months) { const o = grp[G.k][m], t = T27[G.k]; if (!t) continue; o.matT = t[0]; o.cap = t[1]; }   // 고정 목표 — 재고 계획이 없는 달도 씀
    const DUMMY = { G: 500, C: 0 };   // 공장 소재 목표 중 더미재 몫(그룹 배정 없음): 도금 12,600 = 그룹 12,100 + 더미 500
    const SELFX = ['sales', 'ord', 'off', 'offPo', 'offNo', 'gap', 'base', 'sPlan', 'sAct', 'sDue'];   // 자가재가 빠지는 값(판매·수주·출하) — 생산·재고는 자가재 포함
    // 공장 전체 = 그룹 합(자가재는 판매·수주·출하에서만 빠짐 — 내부 투입) · 공장 소재 = 속보 공장 줄(그룹 합 + 미배정)
    const SR = P.sr || {}, stkOf = (re) => (SR.stock || []).find((x) => re.test(x.name)) || {}, SM = I.stockMax || {};
    const matEnd = (key, m) => { const R = (((V.mat || {})[key] || {}).rows || []), md_ = m.slice(5) + '-'; const L = R.filter((r) => String(r[0]).startsWith(md_)); return L.length ? L[L.length - 1][4] : null; };
    const plant = {}, chk = [];
    for (const pl of ['G', 'C']) {
      const Gs = GRP.filter((g) => g.pl === pl), ms = stkOf(pl === 'G' ? /^도금 소재/ : /^컬러 소재/), pd = stkOf(pl === 'G' ? /^도금 제품\(판매재\)/ : /^컬러 제품/), out = {};
      for (const m of months) {
        const o = {};
        for (const k of FLOW) o[k] = sum(Gs.filter((G) => !(G.self && SELFX.includes(k))), (G) => grp[G.k][m][k]);
        o.mat = m === M0 ? ms.current : matEnd(pl === 'G' ? 'FH' : 'CMAT', m);
        o.matCap = ms.target || SM[pl === 'G' ? '도금 소재(F/H)' : '컬러 소재'] || null; o.dummy = DUMMY[pl];
        // 그룹별 소재 재고(이번 달만 — 속보 발주 부서 줄) · 그룹 합 + 미배정 = 공장
        if (m === M0 && ms.grp && o.mat != null) { o.matGrp = true; o.matNa = ms.grpNa || 0;
          for (const G of Gs) grp[G.k][m].mat = ms.grp[G.k] || 0;
          const s = sum(Gs, (G) => grp[G.k][m].mat) + o.matNa, ok = Math.abs(s - o.mat) < 1.5;   // 속보 줄마다 반올림 — 1t 차이 허용
          console.assert(ok, `관제 그룹 소재 합 + 미배정 ≠ 공장 소재: ${pl} ${m}`); chk.push({ pl, m, k: 'mat', ok, grp: s, plant: o.mat }); }
        o.cap = sum(Gs, (G) => grp[G.k][m].cap);   // 제품 목표 = 그룹 목표 합(11/12 사용자 '상한 말고 목표')
        // 목표 그룹 합 = 공장: 소재 = 그룹 소재 목표 + 더미 · 제품 = 그룹 제품 목표
        { const sm = sum(Gs, (G) => grp[G.k][m].matT) + o.dummy, ok = o.matCap == null || Math.abs(sm - o.matCap) < 0.5; console.assert(ok, `관제 그룹 소재 목표 + 더미 ≠ 공장: ${pl} ${m}`); chk.push({ pl, m, k: 'matT', ok, grp: sm, plant: o.matCap }); }
        out[m] = o;
        // 그룹 합 = 전체(눈으로 확인하는 숫자가 서로 맞는지 화면이 스스로 검사)
        for (const k of FLOW) { const s = sum(Gs.filter((G) => !(G.self && SELFX.includes(k))), (G) => grp[G.k][m][k]); const ok = s == null ? o[k] == null : Math.abs(s - o[k]) < 0.5; console.assert(ok, `관제 그룹 합 ≠ 전체: ${pl} ${m} ${k}`); chk.push({ pl, m, k, ok }); }
        // 생산 계획 = 라인 합(캘린더 합계 행)과 같은지
        const lp = sum(LINES[pl], (l) => sum(cal[m].lineR[l], (r) => r.p)), ok2 = lp == null ? o.pPlan == null : Math.abs(lp - o.pPlan) < 1; console.assert(ok2, `관제 생산 계획 그룹 합 ≠ 라인 합: ${pl} ${m}`); chk.push({ pl, m, k: 'pPlan=line', ok: ok2, line: lp, grp: o.pPlan });
      }
      plant[pl] = out;
    }
    window.KJ_CHECK = chk;
    return { S, P, I, V, D, M0, months, grp, plant, cal, dept, split: hasOrd.G && hasOrd.C, mat: matMonths(D, months) };
  }

  /* 계획 › 소재 탭 '소재 종합'과 같은 계산(gyehoek.js readMat ← supply.js matPlan 소재 유형 캘린더 '입고' 줄 월 합계)
     칸 = 소재 유형 × 날짜: 입고 완료 = 지난 날 MES 입고 실적(portal.matAct.inb) · 발주 = MES 기발주 입고 예정(입고일) · 미발주 = 새 발주분(입고 필요일, 지난 건 오늘)
     칸마다 반올림해 더함(소재 탭 숫자와 같게) · 미발주는 발주 마감이 지난 몫(아직 발주 안 함)과 마감 전(발주 시기 전)으로 나눔 · 임가공 도금 N(포스코 지급) 제외
     소재 계획이 있는 달 = 소재 탭(supply.js prep days = V.self 날짜)과 같은 달 */
  function matMonths(D, months) {
    const P = D.procure, PO = D.portal || {}, V = (((D.integrated || {}).variants || {})[(D.integrated || {}).rec || 'V1']) || {}, cell = {};
    if (!P || !window.ProcCalc) return null;
    let St = null; const C = ProcCalc.make(() => ({ D: P, S: St })); St = C.load();
    const today = St.today, J = C.judge(), cls = {}, top = {}, T = {};
    for (const s_ of P.suppliers || []) { cls[`${s_.plant}:${s_.code}:${s_.sup}`] = s_.cls; const k = `${s_.plant}:${s_.code}`; if (!top[k] || (s_.share || 0) > (top[k].share || 0)) top[k] = s_; }
    const clsOf = (pl, code, sup) => ((P.supTypes || {})[sup] || {})[code] || cls[`${pl}:${code}:${sup}`] || (top[`${pl}:${code}`] || {}).cls || '기타';
    const push = (pl, c, d, e) => { const k = `${pl}|${c}|${d}`; (T[k] = T[k] || []).push(e); };
    for (const j of J) { if (j.kind === 'pos' || j.short < 1) continue; for (const x of j.split) if (x.t >= 1) push(j.plant, x.s.cls || clsOf(j.plant, j.code, x.s.sup), j.needBy < today ? today : j.needBy, { kind: 'new', t: x.t, late: x.dl < today, dl: x.dl }); }
    for (const a of [...C.autoArr(), ...St.arr.map((a) => ({ ...a, plant: ProcCalc.plantOf(a.code), t: +a.t || 0 }))]) { if (a.plant === 'G' && a.code === 'N') continue; push(a.plant, clsOf(a.plant, a.code, a.sup), a.date, { kind: 'arr', t: +a.t || 0 }); }
    for (const [k, t] of Object.entries((PO.matAct || {}).inb || {})) { const [pl, code, sup, d] = k.split('|'); if (d >= today || (pl === 'G' && code === 'N') || t < 0.05) continue; push(pl, clsOf(pl, code, sup), d, { kind: 'act', t: +t }); }
    const Y = String((D.integrated || {}).asOf || '2026').slice(0, 4), planM = new Set((((V.self || {}).AZ) || []).map((r) => `${Y}-${String(r[0]).slice(0, 2)}`)), rd = (v) => Math.round(v || 0), tsum = (L) => L.reduce((a, e) => a + e.t, 0);
    for (const [k, L] of Object.entries(T)) {
      const [pl, , d] = k.split('|'), m = d.slice(0, 7); if (!months.includes(m) || !planM.has(m) || tsum(L) < 0.5) continue;
      const x = (cell[`${pl}|${m}`] = cell[`${pl}|${m}`] || { rec: 0, ord: 0, nw: 0, pre: 0, dl: null });
      if (L.every((e) => e.kind === 'act')) { x.rec += rd(tsum(L)); continue; }
      const N = L.filter((e) => e.kind === 'new'), nw = rd(tsum(N)), late = Math.min(nw, rd(tsum(N.filter((e) => e.late))));
      x.ord += rd(tsum(L.filter((e) => e.kind === 'arr'))); x.nw += late; x.pre += nw - late;
      for (const e of N) if (!e.late && e.dl && (!x.dl || e.dl < x.dl)) x.dl = e.dl;
    }
    return { cell, today, planM };
  }

  /* 결품 위험 목록 — 카드 건수·소재 구역 목록·조치가 모두 이 목록 하나에서 셈
     이번 달 = 월말 재고 5일분 미만(수주 관제 '경고') + 발주 마감 지난 부족 중 첫 부족일이 그 달인 것 */
  function riskList(m) {
    const out = [];
    if (m === A.M0) for (const x of A.S.mats.filter((y) => inPl(y.plant) && y.st === '경고')) out.push({ kind: 'days', name: x.name, plant: x.plant, t: x.end, days: x.days });
    for (const it of ((A.S.matLate || {}).items || [])) { if (!inPl(it.plant)) continue;
      const f = it.first || (it.sizes || []).map((s) => s[3]).filter(Boolean).sort()[0]; if (f && f.slice(0, 7) === m) out.push({ kind: 'late', name: it.name, plant: it.plant, t: it.t, f, deadline: it.deadline }); }
    return out;
  }
  // 마감 앞둔 발주(아직 결품 위험 아님) — 카드 보조 줄·조치가 같은 목록: 소재별(matNear, 첫 부족일이 그 달) + 소재 묶음(F/H·구매)의 발주 시기 전 물량 중 마감이 14일 안
  function soonList(m) {
    const RL = riskList(m), out = [];
    for (const x of (A.S.matNear || [])) if (inPl(x.plant) && String(x.first).slice(0, 7) === m && !RL.some((y) => y.name === x.mat)) out.push({ name: x.mat, t: x.t, first: x.first, dl: x.deadline });
    const NM = { G: '도금 소재 F/H', C: '컬러 구매 소재' }, lim = new Date(Date.parse(A.S.today) + 14 * 864e5).toISOString().slice(0, 10);
    for (const p of ['G', 'C'].filter(inPl)) { const c = A.mat && A.mat.cell[`${p}|${m}`]; if (c && c.pre >= 1 && c.dl && c.dl <= lim) out.push({ name: NM[p], t: c.pre, first: null, dl: c.dl }); }
    return out;
  }
  // 그 달 판매계획이 없을 때 이유와 채워지는 때(운영 일정 '판매계획 수취' — 전달 그 날짜)
  function salesWhy(m) {
    const s = ((A.S.cfg || {}).schedule || []).find((x) => /판매계획 수취/.test(x.label)), pm = +addM(m, -1).slice(5);
    return `${mLab(m)} 판매계획 미수령 — ${s ? `${pm}/${s.from}~${s.to} 수취 후 채움` : '수취 후 채움'}`;
  }

  /* ---------- 그리기 ---------- */
  function draw() {
    const m = document.getElementById('ct-main');
    if (!A) return;
    const { months } = A;
    if (!mSel || !months.includes(mSel)) { let s = null; try { s = localStorage.getItem(LS); } catch (e) { /* 무시 */ } mSel = months.includes(s) ? s : months[0]; }
    const cur = mSel === A.M0, pls = ['G', 'C'].filter(inPl);
    TIPS = [];
    const tabs = `<div class="kj-tabs" role="tablist" aria-label="달">${months.map((x, i) => `<button type="button" role="tab" data-m="${x}" aria-selected="${x === mSel}">${mLab(x)} <span>${i ? '계획' : '실적'}</span></button>`).join('')}</div>`;
    const noSales = !cur && pls.every((p) => A.plant[p][mSel].sales == null);
    const noStk = !cur && pls.every((p) => A.plant[p][mSel].mat == null && A.plant[p][mSel].stk == null);
    const basis = cur ? `실적 ~${md(A.S.asOf)} · 재고 ${md(A.S.asOf)} 실재고`
      : `${mLab(mSel)} 납기 주문 · 생산 = 통합 계획 · ${noStk ? `${mLab(mSel)} 재고 계획 없음` : '재고 = 월말 계획'}`;
    const CH = [];
    let h = `<div class="kj-top">${tabs}<p class="kj-basis">${basis}</p>${noSales ? `<p class="kj-why">${esc(salesWhy(mSel))}</p>` : ''}</div>` + sched() + cards(cur);
    h += `<h2 class="kj-h">${pls.map((p) => PN[p]).join(' · ')} 전체</h2>` + legend(cur) + '<div class="kj-two">'
      + pls.map((p) => { const id = CH.push({ x: A.plant[p][mSel], big: true, name: `${PN[p]} 전체`, noStk }) - 1;
        return `<section class="kj-c big"><h3>${PN[p]} 전체</h3><div class="kj-ch" data-ch="${id}"></div></section>`; }).join('') + '</div>';
    h += `<h2 class="kj-h">그룹별 <small>${mLab(mSel)} · 톤</small></h2><div class="kj-gg">` + pls.flatMap((p) => GRP.filter((g) => g.pl === p)).map((G) => { const id = CH.push({ x: A.grp[G.k][mSel], big: false, name: G.nm, self: !!G.self, grp: true, noStk }) - 1;
        return `<section class="kj-c"><h3>${esc(G.nm)}</h3><div class="kj-ch" data-ch="${id}"></div></section>`; }).join('') + '</div>';
    h += matrix(cur, pls) + matSec(pls) + calendar(cur, pls) + actions(cur, pls);
    m.innerHTML = h;
    m.querySelectorAll('.kj-tabs button').forEach((b) => (b.onclick = () => { mSel = b.dataset.m; try { localStorage.setItem(LS, mSel); } catch (e) { /* 무시 */ } draw(); }));
    // 같은 축: 전체 두 그래프끼리 · 그룹 그래프끼리
    { const L = CH.filter((c) => c.big), mx = Math.max(1, ...L.flatMap((c) => cols(c, cur).flatMap((k) => [k.p, k.a])).filter((v) => v != null && !isNaN(v))); L.forEach((c) => (c.mx = mx)); }   // 전체 두 그래프만 같은 축(그룹은 % 로 비교)
    // 그룹 그래프 한 줄 수: 글자(16px)가 기둥 칸에 들어가는 가장 많은 수(4 → 3 → 2 → 1)
    const gg = m.querySelector('.kj-gg'), gW = gg.clientWidth, gap = parseFloat(getComputedStyle(gg).columnGap) || 16, pad = 34;
    const gc = CH.filter((c) => !c.big), nCol = [4, 3, 2].find((n) => [0, 1].some((l) => gc.every((c) => chart(c, cur, (gW - gap * (n - 1)) / n - pad, l, true)))) || 1;   // 한 줄에 많이(두 줄 글자까지 허용)
    gg.style.gridTemplateColumns = `repeat(${nCol}, minmax(0, 1fr))`;
    const els = [...m.querySelectorAll('[data-ch]')];
    for (const big of [true, false]) {   // 같은 묶음은 같은 단계로
      const E = els.filter((el) => CH[+el.dataset.ch].big === big), W = (el) => el.clientWidth || 400;
      const lv = [0, 1, 2].find((l) => E.every((el) => chart(CH[+el.dataset.ch], cur, W(el), l, true))) ?? 2;
      E.forEach((el) => { el.innerHTML = chart(CH[+el.dataset.ch], cur, W(el), lv); if (lv >= 1) { const h3 = el.parentNode.querySelector('h3'); if (h3 && !h3.querySelector('small')) h3.insertAdjacentHTML('beforeend', ' <small>천t</small>'); } });
    }
    bindTips(m);
    m.querySelectorAll('.kj-ms .bar i span').forEach((sp) => { if (sp.offsetWidth > sp.parentNode.clientWidth - 4) sp.style.visibility = 'hidden'; });
    const cw = m.querySelector('.kj-calw'), cn = cw && cw.querySelector('th.now');   // 캘린더: 오늘 칸이 보이게
    if (cn && cw.scrollWidth > cw.clientWidth) cw.scrollLeft = Math.max(0, cn.offsetLeft - cw.clientWidth / 2);
    if (!bound) { bound = true; let rt = null, w0 = innerWidth; addEventListener('resize', () => { if (innerWidth === w0) return; w0 = innerWidth; clearTimeout(rt); rt = setTimeout(draw, 250); }); }
  }

  // 그래프 범례 — 막대 모양 + 글자 색 뜻 + 눈금선 두 가지
  function legend(cur) {
    return `<div class="kj-lg" aria-label="범례"><span><i class="sl"></i>${cur ? '판매계획 · 월 계획 · 목표' : '판매계획 · 생산 계획 · 목표'}</span><span><i class="ac"></i>${cur ? '확정 주문 · 실적' : '납기 주문'}</span><span><i class="stk"></i>재고</span><span><i class="ov"></i>목표 초과</span>`
      + (cur ? '<span><b class="bad">빨강 %</b>오늘까지 계획보다 늦음(생산·출하)</span>' : '') + '<span><b class="ov">주황 %</b>목표 초과</span></div>';
  }

  /* 1. 운영 일정 — 12·1월은 같은 월 일정을 준용(운영 일정 근거 = 수주팀 PDF 월 주기 일정, 달별 일정 없음) */
  function sched() {
    const S = A.S, nd = nDays(mSel), mo = +mSel.slice(5), cur = mSel === A.M0, day = cur ? +S.today.slice(8) : 0;
    const it = ((S.cfg || {}).schedule || []).slice().sort((a, b) => a.from - b.from || a.to - b.to).map((s) => { const z = Math.min(s.to, nd), st = !cur ? ['', 'next'] : day > z ? ['완료', 'done'] : day >= s.from ? ['진행 중', 'now'] : [`D-${s.from - day}`, 'next'];
      return `<li class="${st[1]}"><b>${mo}/${s.from}${s.to !== s.from ? '~' + z : ''}${st[0] ? ` <span>${st[0]}</span>` : ''}</b><div>${esc(s.label)}</div></li>`; }).join('');
    return it ? `<section class="kj-c kj-sch"><h3>${mo}월 운영 일정 <small>${cur ? `오늘 ${md(S.today)}` : `예정(${+A.M0.slice(5)}월 일정 준용)`}</small></h3><ol>${it}</ol></section>` : '';
  }

  /* 2. 결론 카드 4개 — 그래프·매트릭스와 같은 값(A.plant) */
  function cards(cur) {
    const pls = ['G', 'C'].filter(inPl), PL = pls.map((p) => A.plant[p][mSel]), T = (k) => sum(PL, (x) => x[k]);
    const kc = (h, t, sub, cls, v, s, tip) => `<a class="kj-kl" href="${h}" title="${esc(tip)} — 누르면 자세히"><div class="ct-kpi kj-k"><div class="l">${t}${sub ? ` <small>${sub}</small>` : ''}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div></a>`;
    const pc = (v) => (v == null ? '–' : `${(+v).toFixed(1)}<small>%</small>`);
    const sales = T('sales'), ord = T('ord'), base = T('base');
    const k1 = kc(cur ? 'suju.html#order' : 'cg_order.html', '수주 진도', '판매계획 대비', '', pc(pctOf(ord, sales)),
      sales == null ? '판매계획 미수령' : `${cur ? '소재 ON' : '주문'} ${n0(ord)} / 판매계획 ${n0(sales)}t`,
      cur ? '소재 ON(소재 매치 끝난 주문) ÷ 판매계획' : `${mLab(mSel)} 납기 주문 ÷ ${mLab(mSel)} 판매계획`);
    let k2;
    if (cur) { const act = T('pAct'), due = T('pDue');
      k2 = kc('suju.html#prod', '생산 달성', '오늘까지 계획 대비', shortT(act, due), pc(pctOf(act, due)), `실적 ${n0(act)} / 오늘까지 계획 ${n0(due)}t`, `생산 실적 ÷ 1일~${md(A.S.asOf)} 월초 계획`); }
    else { const prod = T('pPlan'); k2 = kc('integrated.html', '생산 계획', '', '', prod == null ? '–' : `${n0(prod)}<small>t</small>`, pls.map((p, i) => `${PN[p]} ${n0(PL[i].pPlan)}`).join(' · '), `${mLab(mSel)} 통합 계획(아래 캘린더 합)`); }
    const rl = riskList(mSel);
    const k3 = kc('suju.html#mat', '소재 결품 위험', '', rl.length ? 'bad' : '', `${rl.length}<small>건</small>`, (rl.length ? esc(rl.slice(0, 2).map((x) => x.name).join(' · ')) + (rl.length > 2 ? ` 외 ${rl.length - 2}건` : '') : `${mLab(mSel)} 결품 위험 소재 없음`) + (soonList(mSel).length ? ` · 마감 앞둔 발주 ${soonList(mSel).length}건` : ''), '아래 소재 구역 결품 위험 목록과 같은 목록');
    // 창고 재고: 소재 · 제품 + 상한('27 판생 월말 최대) — 자료가 없으면 상한도 쓰지 않음
    const mc = T('mat'), mC = T('matCap'), pcur = T('stk'), pC = T('cap'), tot = mc != null && pcur != null ? mc + pcur : null;
    const line = (nm, v, c) => (v == null ? `<div>${nm} <span class="na">자료 없음</span></div>` : `<div>${nm} <b>${n0(v)}</b> / 목표 ${n0(c)} <b class="${overT(v, c)}">(${Math.round(v / c * 100)}%)</b></div>`);
    const k4 = `<a class="kj-kl" href="suju.html#stock" title="목표 = '27 판생 적정재고(소재 + 제품) · 제품 재고는 도금 자가재 포함 — 누르면 자세히"><div class="ct-kpi kj-k"><div class="l">창고 재고${cur ? '' : ' <small>월말 계획</small>'}</div><div class="v ${overT(tot, (mC || 0) + (pC || 0))}">${tot == null ? '–' : `${n0(tot)}<small>t</small>`}</div>`
      + `<div class="kj-wh">${mc == null && pcur == null ? `<div class="na">${mLab(mSel)} 월말 재고 계획 없음</div>` : line('소재', mc, mC) + line('제품', pcur, pC)}</div></div></a>`;
    return `<div class="kj-k4">${k1}${k2}${k3}${k4}</div>`;
  }

  /* ---------- 3·4. 세로 기둥(SVG) — 판매계획 · 수주 · 생산 · 출하 · 재고(소재 · 제품)
     판매계획 = 회색 기둥 · 수주 = 진한 파랑(확정) · 생산·출하 = 옅은 바탕(월 계획) 안에 진한 채움(실적) · 재고 = 회색 바탕(상한·목표) 안에 진한 회색(재고), 넘친 부분만 주황
     눈금: 수주 = 점선(기준선 = 오늘까지 확정 필요), 생산·출하 = 실선(오늘까지 계획) · 기둥 위 = %(16px) + 값(16px) · 아래 = 이름(16px) ---------- */
  let MC = null;
  const tw = (t, sz = 16, wt = 700) => { if (!MC) MC = document.createElement('canvas').getContext('2d'); MC.font = `${wt} ${sz}px ${getComputedStyle(document.body).fontFamily}`; return MC.measureText(t).width; };
  // 기둥 묶음(화이트보드 그림 그대로): 항목마다 회색 = 계획·판매계획·상한, 파랑 = 실적·주문, 진회색 = 재고(상한 넘으면 주황). 막대 위 숫자 하나씩, 아래 이름 · 진도 %
  function cols(c, cur) {
    const x = c.x || {}, T = [], M = mLab(mSel);
    const r = (k, v, cls) => [k, v == null ? '자료 없음' : `${n0(v)}t`, cls || ''];
    const na = (nm, t) => ({ nm, na: t, tip: [[nm, t, '']] });
    if (c.self) T.push(na('수주', '주문 없음'));
    else if (x.sales == null && x.ord == null) T.push(na('수주', '자료 없음'));
    else if (cur) T.push({ nm: '수주', p: x.sales, a: x.ord, pct: pctOf(x.ord, x.sales), tip: [r('판매계획', x.sales), r('소재 ON(매치 끝난 주문)', x.ord), r('소재 OFF(매치 전 주문)', x.off), ...(x.offNo != null ? [r('OFF 중 발주 진행', x.offPo), r('OFF 중 미발주', x.offNo)] : []), r('미수주(판매계획 − ON − OFF)', x.gap != null && x.gap < 0 ? 0 : x.gap), ['진도(ON ÷ 판매계획)', P0(pctOf(x.ord, x.sales)), '']] });
    else T.push({ nm: '수주', p: x.sales, a: x.ord, pct: pctOf(x.ord, x.sales), tip: [r(`${M} 판매계획`, x.sales), r(`${M} 납기 주문`, x.ord), ['진도', P0(pctOf(x.ord, x.sales)), '']] });
    if (cur) {
      T.push({ nm: '생산', p: x.pPlan, a: x.pAct, pct: pctOf(x.pAct, x.pPlan), pcls: shortT(x.pAct, x.pDue), tip: [r('월 계획', x.pPlan), r('실적', x.pAct), ['진도', P0(pctOf(x.pAct, x.pPlan)), shortT(x.pAct, x.pDue)], r('오늘까지 계획(월초)', x.pDue)] });
      T.push(x.sPlan == null ? na('출하', c.self ? '출하 없음' : '자료 없음') : { nm: '출하', p: x.sPlan, a: x.sAct, pct: pctOf(x.sAct, x.sPlan), pcls: shortT(x.sAct, x.sDue), tip: [r('월 계획', x.sPlan), r('실적', x.sAct), ['진도', P0(pctOf(x.sAct, x.sPlan)), shortT(x.sAct, x.sDue)], r('오늘까지 계획', x.sDue)] });
    } else T.push(x.pPlan == null ? na('생산', '자료 없음') : { nm: '생산', p: x.pPlan, a: null, tip: [r(`${M} 생산 계획`, x.pPlan)] });
    // 재고: 공장 = 소재·제품 따로 · 그룹 = 매트릭스 비율과 같은 값(소재 + 제품 ÷ 소재 목표 + 제품 목표, 그룹 소재가 없으면 제품 ÷ 제품 목표) · 재고 계획이 없는 달은 빼고 기준 줄에 씀
    if (c.noStk) return T;
    const cn = '목표', st = (nm, v, cp, more) => (v == null ? na(nm, '자료 없음')
      : { nm, p: cp, a: v, stock: true, pct: pctOf(v, cp), pcls: overT(v, cp), tip: [cp == null ? [cn, '–', ''] : r(cn, cp), r(cur ? `재고 ${md(A.S.asOf)}` : '월말 재고 계획', v), ...(more || []), [`${cn} 대비`, P0(pctOf(v, cp)), overT(v, cp)]] });
    if (!c.grp) { T.push(st('소재 재고', x.mat, x.matCap)); T.push(st('제품 재고', x.stk, x.cap)); }
    else if (x.mat != null && x.stk != null) T.push(st('재고(소재+제품)', x.mat + x.stk, x.matT == null ? null : x.matT + (x.cap || 0), [r('소재', x.mat), r('제품', x.stk)]));
    else T.push(st('제품 재고', x.stk, x.cap));
    return T;
  }
  // lv: 0 = 막대마다 숫자(톤) · 1 = 숫자를 천 톤(소수 한 자리) · 2 = 파랑 막대 숫자만(천 톤) — 두 숫자 사이는 막대 간격을 벌려 띄움
  function chart(c, cur, W, lv, probe) {
    const C = cols(c, cur), n = C.length, slot = W / n, BW = Math.max(14, Math.min(34, Math.round(slot * 0.24)));
    const mx = c.mx || Math.max(1, ...C.flatMap((k) => [k.p, k.a]).filter((v) => v != null && !isNaN(v)));
    const H = c.big ? 300 : 250, T = 30, y0 = H - 56, Y = (v) => T + (y0 - T) * (1 - Math.min(Math.max(0, v), mx) / mx);
    const nf = (v) => (lv >= 1 ? (v / 1000).toFixed(1) : n0(v));
    const BX = [], txt = (cls, x, y, t, wt = 700) => { const w = tw(t, 16, wt); BX.push([x - w / 2, x + w / 2]); return `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${t}</text>`; };
    const bar = (cx, y1, cls) => { const h = y0 - y1; if (h <= 0.3) return ''; const r = Math.min(4, h / 2), x = cx - BW / 2;
      return `<path class="${cls}" d="M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + BW - r}Q${x + BW} ${y1} ${x + BW} ${y1 + r}V${y0}Z"/>`; };
    let g = '', hits = '', fit = true;
    C.forEach((k, i) => {
      const cx = slot * i + slot / 2, id = probe ? 0 : TIPS.push({ t: `${c.name} · ${k.nm}`, rows: k.tip }) - 1;
      if (k.na) g += `<text class="na" x="${cx}" y="${y0 - 10}" text-anchor="middle">${k.na}</text>`;
      else {
        const two = k.a != null, lw = two && k.p != null && lv < 2 ? Math.max(tw(nf(k.p), 16, 600), tw(nf(k.a))) : 0, GAP = Math.max(4, lw + 10 - BW);   // 두 숫자가 안 겹치게 막대 사이를 벌림
        const xp = two ? cx - BW / 2 - GAP / 2 : cx, xa = cx + BW / 2 + GAP / 2;
        const aCls = k.stock ? (k.p && k.a > k.p ? 'bo' : 'bs') : 'ba';
        if (k.p != null) g += bar(xp, Y(k.p), 'bp');
        if (two) g += bar(xa, Y(k.a), aCls);
        BX.length = 0;
        if (k.p != null && !(two && lv >= 2)) g += txt('vp', xp, Y(k.p) - 8, nf(k.p), 600);
        if (two) g += txt('va', xa, Y(k.a) - 8, nf(k.a));
        if (BX.length === 2 && BX[0][1] + 6 > BX[1][0]) fit = false;
        if (BX.some((b) => b[0] < slot * i + 2 || b[1] > slot * (i + 1) - 2)) fit = false;
      }
      g += `<text class="nm" x="${cx}" y="${y0 + 24}" text-anchor="middle">${k.nm}</text>`;
      if (k.pct != null) g += `<text class="pc ${k.pcls || ''}" x="${cx}" y="${y0 + 46}" text-anchor="middle">${P0(k.pct)}</text>`;
      hits += `<rect class="hit" data-tip="${id}" tabindex="0" role="img" aria-label="${esc(k.nm)}" x="${slot * i + 1}" y="0" width="${slot - 2}" height="${H}"/>`;
    });
    if (probe) return fit;
    g += `<line class="base" x1="0" x2="${W}" y1="${y0}" y2="${y0}"/>`;
    return `<svg class="kj-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(c.name)} — ${C.map((k) => k.nm).join(' · ')}">${hits}${g}</svg>`;
  }

  /* 툴팁: 기둥 칸 전체가 마우스·키보드 대상 · 글은 textContent */
  function bindTips(root) {
    let tip = document.getElementById('kj-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'kj-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip); }
    const fill = (d) => { tip.textContent = ''; const h = document.createElement('div'); h.className = 't'; h.textContent = d.t; tip.appendChild(h);
      for (const [k, v, cls] of d.rows) { const r = document.createElement('div'); r.className = 'r'; const b = document.createElement('b'); b.textContent = v; if (cls) b.className = cls; const s = document.createElement('span'); s.textContent = k; r.append(b, s); tip.appendChild(r); } };
    const place = (x, y) => { tip.hidden = false; const w = tip.offsetWidth, hh = tip.offsetHeight; let l = x + 16, t = y + 14; if (l + w > innerWidth - 8) l = x - w - 16; if (t + hh > innerHeight - 8) t = y - hh - 14; tip.style.left = Math.max(8, l) + 'px'; tip.style.top = Math.max(8, t) + 'px'; };
    root.querySelectorAll('[data-tip]').forEach((el) => {
      const d = TIPS[+el.dataset.tip]; if (!d) return;
      el.onpointerenter = (e) => { fill(d); place(e.clientX, e.clientY); };
      el.onpointermove = (e) => place(e.clientX, e.clientY);
      el.onpointerleave = () => { tip.hidden = true; };
      el.onfocus = () => { fill(d); const r = el.getBoundingClientRect(); place(r.right - 8, r.top + 8); };
      el.onblur = () => { tip.hidden = true; };
    });
  }

  /* ---------- 5. 관제 매트릭스: 그래프 숫자를 표로(계획 대비 실적만 · 공장 전체 = 그룹 합 · 합계 줄) ---------- */
  function matrix(cur, pls) {
    const cl = (...c) => { const t = c.filter(Boolean).join(' '); return t ? ` class="${t}"` : ''; };
    const na = (n, txt, gs) => `<td colspan="${n}"${cl('na', gs && 'gs')}>${txt}</td>`;
    const nb = (v, gs, cls, empty) => `<td${cl(gs && 'gs', cls)}>${v == null ? `<span class="na">${empty || '자료 없음'}</span>` : n0(v)}</td>`;
    const pc = (v, cls) => `<td${cl('kp', cls)}>${v == null ? '–' : P0(v)}</td>`;
    // 재고 = 목표 | 소재 | 제품 | 비율 (11/12 사용자 '소재 발주한 사람 추적하면 그룹 나온다, 합 더해서 목표랑 비교하는 비율') — 비율 = (소재 + 제품) ÷ (소재 목표 + 제품 목표), 100% 넘으면 주황
    // 그룹 소재가 없을 때(다음 달 계획·속보 그룹 줄 없음)는 공장 소재 칸을 그룹 줄까지 세로로 합치고 그룹 비율 = 제품 ÷ 제품 목표('제품만')
    // 재고 계획이 없는 달(noStk)은 공장 블록의 소재·제품·비율을 한 칸으로
    const stock = (x, grp, span, noStk) => {
      const tg = grp ? (x.matT == null ? null : x.matT + (x.cap || 0)) : (x.matCap != null || x.cap != null ? (x.matCap || 0) + (x.cap || 0) : null);
      const tgC = `<td class="gs">${tg == null ? '<span class="na">–</span>' : n0(tg)}${!grp && x.dummy >= 1 ? `<small class="kj-mna">더미 ${n0(x.dummy)} 포함</small>` : ''}</td>`;
      if (noStk) return tgC + (grp ? '' : `<td colspan="3"${span > 1 ? ` rowspan="${span}"` : ''} class="na mspan">${mLab(mSel)} 재고 계획 없음</td>`);
      const both = x.mat != null && x.stk != null, r = both ? pctOf(x.mat + x.stk, tg) : grp && x.stk != null && x.cap ? pctOf(x.stk, x.cap) : null, po = !both && r != null;
      return tgC
        + (grp ? (x.mat !== undefined ? nb(x.mat) : '') : `<td${span > 1 ? ` rowspan="${span}" class="mspan"` : ''}>${x.mat == null ? '<span class="na">자료 없음</span>' : n0(x.mat)}${x.matNa >= 1 ? `<small class="kj-mna">미배정 ${n0(x.matNa)}</small>` : ''}</td>`)
        + (x.stk == null ? '<td><span class="na">자료 없음</span></td>' : nb(x.stk))
        + `<td class="kp${r != null && r > 100 ? ' ov' : ''}">${r == null ? '–' : P0(r)}${po ? '<small class="kj-mna">제품만</small>' : ''}</td>`; };
    // 수주 = 판매계획 | 소재 ON | 소재 OFF(발주 진행 · 미발주) | 미수주(판매계획 − ON − OFF) | 진도 — 미발주 1t 이상 · 미수주 판매계획 10% 이상 = 주황 글자
    //  미수주 음수 = 판매계획 넘침 → '+초과 n' · 공장·합계 줄 = 그룹 합(넘친 그룹은 상계 — 그 양을 작게 표시)
    const SP = A.split, nQ = SP ? 6 : 5;
    const miss = (x, grp) => { if (x.gap == null) return nb(null); const g = Math.round(x.gap);
      if (g < 0) return `<td>+초과 ${n0(-g)}</td>`;
      const ov = grp ? 0 : Math.round(x.over || 0);
      return `<td${cl(x.sales && g >= x.sales * 0.1 && 'ov')}>${n0(g)}${ov >= 1 ? `<small class="kj-mna">그룹 초과 ${n0(ov)} 상계</small>` : ''}</td>`; };
    const offC = (x) => (SP ? `${nb(x.offPo)}${nb(x.offNo, 0, x.offNo >= 1 ? 'ov' : '')}` : nb(x.off));
    const rowCur = (nm, x, cls, grp, self, span, noStk) => `<tr${cl(cls)}><th scope="row">${nm}</th>`
      + (self ? na(nQ, '내부 투입 — 주문 없음', 1) : `${nb(x.sales, 1)}${nb(x.ord)}${offC(x)}${miss(x, grp)}${pc(pctOf(x.ord, x.sales))}`)
      + `${nb(x.pPlan, 1)}${nb(x.pAct)}${pc(pctOf(x.pAct, x.pPlan), shortT(x.pAct, x.pDue))}`
      + (x.sPlan == null ? na(3, self ? '출하 없음' : '자료 없음', 1) : `${nb(x.sPlan, 1)}${nb(x.sAct)}${pc(pctOf(x.sAct, x.sPlan), shortT(x.sAct, x.sDue))}`)
      + stock(x, grp, span, noStk) + '</tr>';
    const rowFut = (nm, x, cls, grp, self, span, noStk) => `<tr${cl(cls)}><th scope="row">${nm}</th>`
      + (self ? na(3, '내부 투입 — 주문 없음', 1) : `${nb(x.sales, 1, '', '미수령')}${nb(x.ord)}${pc(pctOf(x.ord, x.sales))}`)
      + `${nb(x.pPlan, 1)}` + stock(x, grp, span, noStk) + '</tr>';
    const rowOf = cur ? rowCur : rowFut, rows = [];
    for (const p of pls) {
      const X0 = A.plant[p][mSel]; if (cur) X0.over = sum(GRP.filter((g) => g.pl === p), (G) => Math.max(0, -(A.grp[G.k][mSel].gap || 0)));
      const noStk = !cur && X0.mat == null && X0.stk == null, nG = GRP.filter((g) => g.pl === p).length;
      rows.push(rowOf(`${PN[p]} 전체`, X0, 'pt', false, false, X0.matGrp && !noStk ? 1 : 1 + nG, noStk));   // 그룹 소재가 없으면 공장 칸을 그룹 줄까지 세로로 합침
      for (const G of GRP.filter((g) => g.pl === p)) rows.push(rowOf(G.nm, A.grp[G.k][mSel], '', true, G.self, 1, noStk));
    }
    if (pls.length > 1) { const P = pls.map((p) => A.plant[p][mSel]), T = {};
      for (const k of [...FLOW, 'mat', 'matCap', 'cap', 'matNa', 'dummy', 'over']) T[k] = sum(P, (x) => x[k]);
      rows.push(rowOf('합계', T, 'tot', false, false, 1, !cur && T.mat == null && T.stk == null)); }
    const STH = '<th class="gs">목표<br><small>소재 + 제품<br>(\'27 판생)</small></th><th>소재</th><th>제품</th><th>비율<br><small>소재+제품<br>÷ 목표</small></th>';
    const hd = cur
      ? `<tr><th rowspan="2" scope="col">구분</th><th colspan="${nQ}" class="gs" scope="colgroup">수주 <small>판매계획 대비</small></th><th colspan="3" class="gs" scope="colgroup">생산 <small>월 계획 대비</small></th><th colspan="3" class="gs" scope="colgroup">출하 <small>월 계획 대비</small></th><th colspan="4" class="gs" scope="colgroup">재고 <small>${md(A.S.asOf)}</small></th></tr>`
        + `<tr><th class="gs">판매계획</th><th>소재 ON<br><small>매치 끝난 주문</small></th>${SP ? '<th>OFF 발주 진행<br><small>발주 · 매치 전</small></th><th>OFF 미발주<br><small>발주 확정 안 함</small></th>' : '<th>소재 OFF<br><small>매치 전 주문</small></th>'}<th>미수주<br><small>판매계획<br>− ON − OFF</small></th><th>진도<br><small>ON ÷ 판매계획</small></th><th class="gs">월 계획<br><small>실적 + 남은 계획</small></th><th>실적</th><th>진도</th><th class="gs">월 계획</th><th>실적</th><th>진도</th>${STH}</tr>`
      : `<tr><th rowspan="2" scope="col">구분</th><th colspan="3" class="gs" scope="colgroup">수주 <small>${mLab(mSel)} 납기</small></th><th rowspan="2" class="gs">생산 계획</th><th colspan="4" class="gs" scope="colgroup">재고 <small>월말 계획</small></th></tr>`
        + `<tr><th class="gs">판매계획</th><th>주문</th><th>진도</th>${STH}</tr>`;
    const lg = `<div class="kj-lg in">${cur ? '<span><b class="bad">빨강</b>오늘까지 계획보다 모자람(생산·출하)</span>' : ''}<span><b class="ov">주황</b>${cur ? `${SP ? '미발주 있음 · ' : ''}미수주 판매계획의 10% 이상 · ` : ''}재고 비율 100% 넘음</span></div>`;
    return `<h2 class="kj-h">관제 매트릭스 <small>${mLab(mSel)} · 톤</small></h2>${lg}`
      + `<section class="kj-c kj-tb"><div class="ct-wrap"><table class="kj-mx"><thead>${hd}</thead><tbody>${rows.join('')}</tbody></table></div></section>`;
  }

  /* ---------- 6. 소재: 그 달 생산에 맞춰 들어와야 할 양 = 입고 완료(진한) + 발주(옅은) + 아직 발주 안 함(빨강 테두리) + 발주 시기 전(점선) · 결품 위험 ---------- */
  function matSec(pls) {
    const M = A.mat, m = mSel, NM = { G: '도금 소재 F/H', C: '컬러 구매 소재' };
    let body = '';
    if (!M) body = UI.empty('소재 발주 자료 없음', '다음 자동 실행 때 들어옵니다');
    else if (!M.planM.has(m)) body = `<p class="kj-none">${mLab(m)} 소재 계획 없음 — 소재 계획은 ${mLab([...M.planM].sort().pop() || m)}까지</p>`;
    else {
      const R = pls.map((p) => ({ p, ...(M.cell[`${p}|${m}`] || { rec: 0, ord: 0, nw: 0, pre: 0, dl: null }) })).map((x) => ({ ...x, need: x.rec + x.ord + x.nw + x.pre }));
      const seg = (cls, t, need, nm, who) => { if (!(t >= 0.5) || !need) return ''; const w = t / need * 100, id = TIPS.push({ t: `${NM[who]} · ${nm}`, rows: [[nm, `${n0(t)}t`, ''], ['들어와야 할 양 대비', P0(w), '']] }) - 1;
        return `<i class="${cls}" style="flex:${t} 1 0" data-tip="${id}" tabindex="0" aria-label="${nm} ${n0(t)}t"><span>${nm} ${n0(t)}</span></i>`; };
      const st = (x) => (x.nw >= 1 ? `<span class="bad">아직 발주 안 함 ${n0(x.nw)}t</span>` : x.pre >= 1 ? `<span>발주 시기 전 ${n0(x.pre)}t${x.dl ? ` · 마감 ${md(x.dl)}` : ''}</span>` : '<span>모두 발주</span>');
      body = `<div class="kj-ms">${R.map((x) => { const got = x.rec + x.ord, p = x.need ? Math.min(got / x.need * 100, x.nw + x.pre >= 0.5 ? 99 : 100) : null;   // 남은 양이 있으면 100% 아님
        return `<div class="row"><div class="nm"><b>${NM[x.p]}</b><span>들어와야 할 양 ${n0(x.need)}t</span></div><div class="bar" role="img" aria-label="${NM[x.p]} 들어와야 할 양 ${n0(x.need)}t 중 입고 ${n0(x.rec)} · 발주 ${n0(x.ord)} · 아직 발주 안 함 ${n0(x.nw)} · 발주 시기 전 ${n0(x.pre)}">${x.need ? seg('r', x.rec, x.need, '입고 완료', x.p) + seg('o', x.ord, x.need, '발주', x.p) + seg('e', x.nw, x.need, '발주 안 함', x.p) + seg('q', x.pre, x.need, '발주 시기 전', x.p) : '<em>들어올 소재 없음</em>'}</div>`
          + `<div class="pc"><b>확보 ${P0(p)}</b>${st(x)}</div></div>`; }).join('')}</div>`
        + `<div class="kj-lg in"><span><i class="ac"></i>입고 완료</span><span><i class="pl"></i>발주(입고 예정)</span><span><i class="e"></i>아직 발주 안 함(마감 지남)</span><span><i class="q"></i>발주 시기 전</span></div>`
        + `<details class="kj-tv"><summary>표로 보기</summary><div class="ct-wrap"><table><thead><tr><th>소재</th><th>들어와야 할 양</th><th>입고 완료</th><th>발주</th><th>아직 발주 안 함</th><th>발주 시기 전</th><th>확보</th></tr></thead><tbody>`
        + R.map((x) => `<tr><th scope="row">${NM[x.p]}</th><td>${n0(x.need)}</td><td>${n0(x.rec)}</td><td>${n0(x.ord)}</td><td class="${x.nw >= 1 ? 'bad' : ''}">${n0(x.nw)}</td><td>${n0(x.pre)}</td><td>${P0(x.need ? Math.min((x.rec + x.ord) / x.need * 100, x.nw + x.pre >= 0.5 ? 99 : 100) : null)}</td></tr>`).join('') + '</tbody></table></div></details>';
    }
    const rk = riskList(m).map((x) => (x.kind === 'days' ? `<span><b class="bad">${esc(x.name)}</b> 월말 ${x.days}일분 · ${n0(x.t)}t</span>` : `<span><b class="bad">${esc(x.name)} ${n0(x.t)}t</b> ${md(x.f)}부터 부족 · 발주 마감 ${md(x.deadline)} 지남</span>`));
    return `<h2 class="kj-h">소재 <small>${mLab(m)} 생산에 맞춰 들어와야 할 양 · 톤</small></h2><section class="kj-c">${body}<p class="kj-risk"><b>결품 위험 ${rk.length}건</b>${rk.join('') || '<span>없음</span>'}</p></section>`;
  }

  /* ---------- 7. 일별 계획 캘린더: 라인 · 그룹 × 날짜 — 칸 위 계획, 아래 실적(지난 날) ---------- */
  // 일별 계획 캘린더 — 이번 달 = 줄마다 '계획' 행(위)·'실적' 행(아래)으로 칸을 나눔(11/12 사용자 '위에 계획 밑에 실적, 옆에 계획·실적') · 빨강 없음
  //  라인이 안 도는 날은 이어지는 날을 한 칸으로 묶어 가운데에 이름(휴지 = 노랑 · 수리 = 진회색), 계획·실적 두 행을 세로로 합침
  function calendar(cur, pls) {
    const S = A.S, m = mSel, { days, lineR, grpR, ev } = A.cal[m], nd = days.length;
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay(), td = S.today, asOf = S.asOf;
    const nf = (v) => String(Math.round(v)), done = (d) => cur && d <= asOf;
    const cc = (d) => (d === td ? ' now' : '') + (dow(d) === 3 ? ' wst' : '');
    // 그 날 라인이 안 돌면 '휴' 또는 '수리'(정지 사유) — 그룹 행은 없음
    const offOf = (r, d, key, isGrp) => { if (isGrp) return null; const e = ev[key + '|' + d];
      const run = done(d) ? (r.a > 0.5 || r.p > 0.5 || r.p0 > 0.5) : r.p > 0.5; if (run) return null; return e && /수리|S\/D/.test(e) ? (/정기/.test(e) ? '정기수리' : '수리') : '휴지'; };
    const two = cur;   // 이번 달만 실적 행
    const rowOf = (nm, R, key, cls = '', isGrp) => {
      const off = R.map((r, i) => offOf(r, days[i], key, isGrp)), P = [], Q = [];
      for (let i = 0; i < nd;) {
        if (off[i]) { let j = i; while (j + 1 < nd && off[j + 1] === off[i]) j++;
          const lab = off[i], t = j > i ? `${lab} ${+days[i].slice(8)}~${+days[j].slice(8)}일` : lab;
          P.push(`<td colspan="${j - i + 1}" class="${lab === '휴지' ? 'idl' : 'rep'} o1${dow(days[i]) === 3 ? ' wst' : ''}" title="${md(days[i])}~${md(days[j])} ${lab}">${t}</td>`);
          if (two) Q.push(`<td colspan="${j - i + 1}" class="${lab === '휴지' ? 'idl' : 'rep'} o2${dow(days[i]) === 3 ? ' wst' : ''}"></td>`); i = j + 1; continue; }
        const r = R[i], d = days[i], pv = done(d) && r.p0 != null ? r.p0 : r.p;   // 지난 날 계획 행 = 월초 계획(실적 행과 겹치지 않게)
        P.push(`<td class="${done(d) ? 'pp' : 'pl'}${cc(d)}">${pv > 0.5 ? nf(pv) : '–'}</td>`);
        if (two) Q.push(`<td class="aa${cc(d)}">${done(d) ? (r.a == null ? '–' : r.a > 0.5 ? nf(r.a) : '–') : ''}</td>`);
        i++;
      }
      const mp = sum(R.map((r, i) => (done(days[i]) && r.p0 != null ? r.p0 : r.p)), (v) => v) || 0, ca = sum(R, (r) => r.a) || 0;
      const nmC = `<th scope="row" class="lab${two ? ' l1' : ''}"><b>${esc(nm)}</b></th>`;
      if (!two) return `<tr class="${cls}">${nmC}<th class="kd">계획</th>${P.join('')}<td class="pl sumc"><b>${n0(mp)}</b></td></tr>`;
      return `<tr class="${cls} r1">${nmC}<th class="kd">계획</th>${P.join('')}<td class="pp sumc"><b>${n0(mp)}</b></td></tr>`
        + `<tr class="${cls} r2"><th scope="row" class="lab l2"></th><th class="kd ka">실적</th>${Q.join('')}<td class="aa sumc"><b>${n0(ca)}</b></td></tr>`; };
    const sumR = (Rs) => days.map((d, i) => ({ p: sum(Rs, (R) => R[i].p), p0: done(d) ? sum(Rs, (R) => (R[i].p0 != null ? R[i].p0 : R[i].p)) : null, a: done(d) ? sum(Rs, (R) => R[i].a) : null }));
    const sec = (t) => `<tr class="sec"><th colspan="${nd + 3}" scope="rowgroup"><span>${t}</span></th></tr>`;
    let body = '';
    for (const p of pls) {
      body += sec(`${PN[p]} · 라인`) + LINES[p].map((l) => rowOf(l, lineR[l], l)).join('') + rowOf(`${PN[p]} 합계`, sumR(LINES[p].map((l) => lineR[l])), '', 'tot');
      body += sec(`${PN[p]} · 그룹`) + GRP.filter((G) => G.pl === p).map((G) => rowOf(G.nm, grpR[G.k], G.k, '', true)).join('');
    }
    const hd = `<tr><th class="lab" scope="col">구분</th><th class="kd" scope="col"></th>${days.map((d) => `<th scope="col" class="${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}${dow(d) === 3 ? ' wst' : ''}${d === td ? ' now' : ''}"><b>${+d.slice(8)}</b><span>${'일월화수목금토'[dow(d)]}</span></th>`).join('')}<th scope="col" class="sumc"><b>계</b><span>월 합</span></th></tr>`;
    const lg = `<div class="kj-lg in"><span><i class="idl"></i>휴지</span><span><i class="rep"></i>수리</span><span><i class="now"></i>오늘</span></div>`;
    return `<h2 class="kj-h">일별 계획 캘린더 <small>${mLab(m)} · 톤</small></h2>${lg}`
      + `<section class="kj-c kj-tb"><div class="ct-wrap kj-calw"><table class="kj-cal v2-grid${two ? ' kjpa' : ''}"><thead>${hd}</thead><tbody>${body}</tbody></table></div></section>`;
  }

  /* ---------- 8. 조치할 사항 — 그 달 것만 · 숫자는 매트릭스와 같은 값 · '→ 할 일'까지 · 모두 펼침 ---------- */
  function actions(cur, pls) {
    const L = [], m = mSel, nextDl = ((A.S.weeks || []).find((w) => w.deadline >= A.S.today) || {}).deadline || null;
    const add = (lvl, area, text, todo, due, dept) => L.push({ lvl, area, text, todo, due, dept });
    const Gs = GRP.filter((G) => inPl(G.pl));
    if (cur) {
      for (const G of Gs) { const x = A.grp[G.k][m]; if (G.self) continue;
        if (x.ord != null && x.base != null && x.ord + 0.5 < x.base) add(x.ord < x.base * 0.9 ? '경고' : '주의', '수주', `${G.nm} 수주 ${P0(pctOf(x.ord, x.sales))} — 소재 ON ${n0(x.ord)} / 판매계획 ${n0(x.sales)}t · 소재 OFF ${n0(x.off)}t`, x.off >= 1 ? '소재 매치 당김' : '주문 확보 요청', nextDl, A.dept[G.k]);
        // 11/12 회의: 미발주(주문은 있는데 소재 발주 확정 안 함) · 미수주(판매계획 − ON − OFF = 아직 안 들어온 주문) — 매트릭스와 같은 값
        if (x.offNo >= 1) add('주의', '수주', `${G.nm} 미발주 ${n0(x.offNo)}t — 주문은 등록, 소재 발주 확정 안 됨`, '소재 발주 확정 요청', nextDl, A.dept[G.k]);
        if (x.gap >= 1 && !(x.off < 1 && x.ord != null && x.base != null && x.ord + 0.5 < x.base)) add(x.sales && x.gap >= x.sales * 0.1 ? '경고' : '주의', '수주', `${G.nm} 미수주 ${n0(x.gap)}t — 판매계획 ${n0(x.sales)} − ON ${n0(x.ord)} − OFF ${n0(x.off)}t`, '주문 확보 요청', nextDl, A.dept[G.k]); }
      for (const G of Gs) { const x = A.grp[G.k][m];
        if (x.pAct != null && x.pDue && x.pAct + 0.5 < x.pDue) add(x.pAct < x.pDue * 0.9 ? '경고' : '주의', '생산', `${G.nm} 생산 ${P0(pctOf(x.pAct, x.pPlan))} — 실적 ${n0(x.pAct)} / 월 계획 ${n0(x.pPlan)}t, 오늘까지 계획 ${n0(x.pDue)}t보다 ${n0(x.pDue - x.pAct)}t 적음`, '생산 순서 당김', null, '수주팀·공정출하'); }
      // 재고: 매트릭스와 같은 값(그룹 실재고 ÷ 재고 목표) — 목표를 넘은 그룹
      for (const G of Gs) { const x = A.grp[G.k][m]; if (x.stk != null && x.cap && x.stk > x.cap) add('주의', '재고', `${G.nm} 제품 재고 ${n0(x.stk)}t — 제품 목표 ${n0(x.cap)}t의 ${P0(pctOf(x.stk, x.cap))}`, G.self ? '컬러 투입 당김 검토' : '출하 당김 · 생산 조정 검토', null, G.self ? '수주팀' : A.dept[G.k]); }
      // 창고: 카드·매트릭스와 같은 값(소재 + 제품 / 목표 합)
      for (const p of pls) { const x = A.plant[p][m], v = (x.mat || 0) + (x.stk || 0), c = (x.matCap || 0) + (x.cap || 0);
        if (c && v > c) add('주의', '재고', `${PN[p]} 창고 ${n0(v)}t — 목표 ${n0(c)}t의 ${P0(pctOf(v, c))} (소재 ${n0(x.mat)} · 제품 ${n0(x.stk)})`, '출하 당김 · 입고 조정', null, '수주팀·판생'); }
    } else {
      for (const p of pls) { const P = A.plant[p][m], pp = pctOf(P.ord, P.sales); if (pp == null) continue;
        for (const G of Gs.filter((g) => g.pl === p && !g.self)) { const x = A.grp[G.k][m], gp = pctOf(x.ord, x.sales);
          if (gp != null && gp < pp * 0.6) add('주의', '수주', `${G.nm} ${mLab(m)} 납기 주문 ${P0(gp)} — ${n0(x.ord)} / 판매계획 ${n0(x.sales)}t (${PN[p]} 전체 ${P0(pp)})`, '주문 확보 요청', null, A.dept[G.k]); } }
      for (const G of Gs.filter((g) => !g.self)) { const x = A.grp[G.k][m]; if (x.stk == null) continue;
        if (x.safety && x.stk < x.safety) add('경고', '재고', `${G.nm} ${mLab(m)} 말 재고 계획 ${n0(x.stk)}t — 안전재고 ${n0(x.safety)}t 미만`, '생산 당김 검토', null, '수주팀');
        else if (x.cap && x.stk > x.cap * 1.1) add('주의', '재고', `${G.nm} ${mLab(m)} 말 재고 계획 ${n0(x.stk)}t — 목표 ${n0(x.cap)}t의 ${P0(pctOf(x.stk, x.cap))}`, '생산 조정 검토', null, '수주팀'); }
    }
    // 소재: 결품 위험 목록(카드와 같은 목록) + 마감 앞둔 발주(첫 부족일이 그 달)
    // 같은 소재의 '마감 앞둔 발주'는 결품 위험 줄에 붙임(같은 소재 두 줄 금지)
    const near = (A.S.matNear || []).filter((x) => inPl(x.plant) && String(x.first).slice(0, 7) === m), RL = riskList(m);
    for (const x of RL) { const nx = near.find((y) => y.mat === x.name), more = nx ? ` · 추가 ${n0(nx.t)}t 마감 ${md(nx.deadline)}` : '';
      add('경고', '소재', x.kind === 'days' ? `${x.name} 월말 재고 ${n0(x.t)}t · ${x.days}일분` : `${x.name} ${n0(x.t)}t ${md(x.f)}부터 부족 — 발주 마감 ${md(x.deadline)} 지남${more}`, x.kind === 'days' ? '소재 발주 당김' : '긴급 발주 · 대체 소재 확인', nx ? nx.deadline : null, '소재구매'); }
    for (const x of soonList(m)) add('주의', '소재', `${x.name} ${n0(x.t)}t${x.first ? ` ${md(x.first)}부터 부족` : ' 아직 발주 전'} — 발주 마감 ${md(x.dl)}`, '마감 전 발주', x.dl, '소재구매');
    if (!L.length) return '';
    L.sort((a, b) => (a.lvl === b.lvl ? 0 : a.lvl === '경고' ? -1 : 1) || String(a.due || '9').localeCompare(String(b.due || '9')));
    const nb = L.filter((a) => a.lvl === '경고').length;
    const rows = L.map((a) => `<tr><td><b class="${a.lvl === '경고' ? 'bad' : ''}">${esc(a.lvl)}</b></td><td>${esc(a.area)}</td><td>${esc(a.text)}</td><td><b>${esc(a.todo)}</b></td><td>${a.due ? md(a.due) : '–'}</td><td>${esc(a.dept || '')}</td></tr>`).join('');
    return `<h2 class="kj-h">조치할 사항 <small>${mLab(m)} · 경고 ${nb} · 주의 ${L.length - nb}</small></h2><section class="kj-c kj-tb kj-act"><div class="ct-wrap"><table><thead><tr><th>신호</th><th>영역</th><th>내용</th><th>할 일</th><th>마감</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
})();
