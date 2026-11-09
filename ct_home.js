/* 01 통합 관제(11/4 2차 진단 4장): 10초 안에 위험 인지, 30초 안에 우선 조치 결정
   메뉴 탭 = 기간(#day 금일 · #week 수요일 시작 7일 · #month 이번 달). KPI 6 · 조치 TOP10 + 공정별 상태 · 기간 전망 · (접힘) 수주 이행 흐름·자료 예외 */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD, diff } = CT;
  const PER = { day: 1, week: 7, month: 30 };
  const FILES = ['portal.enc.json', 'latest.plan.enc.json', 'plan_prev.enc.json', 'integrated.enc.json', 'mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'cc_calendar.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json'];
  let DATA = null, ST = {};
  const WD = '일월화수목금토', wd = (d) => WD[new Date(d + 'T00:00:00Z').getUTCDay()];

  function render(D) {
    DATA = D;
    const view = CT.view('day', Object.keys(PER)), per = PER[view];
    const P = D.portal || {}, L = (D['latest.plan'] || {}).result || {}, LP = (D.plan_prev || {}).result || {}, W = D.integrated || {}, MO = D.mat_order || {};
    const M = CT.orders(D), asOf = M.asOf;
    // 기간(11/5 사용자): 금일 = 오늘 · 7일 = 수요일 시작 한 주 · 월간 = 이번 달(월 단위로 끊음)
    const ndM = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
    const m0 = asOf.slice(0, 8) + '01';
    const p0 = view === 'day' ? asOf : view === 'week' ? (CT.wed(asOf) < m0 ? m0 : CT.wed(asOf)) : m0;   // 주도 달 경계에서 자름(11/5 '월별로 끊어라')
    const mEnd = asOf.slice(0, 8) + String(ndM(asOf)).padStart(2, '0');
    const p1 = view === 'day' ? asOf : view === 'week' ? (addD(CT.wed(asOf), 6) > mEnd ? mEnd : addD(CT.wed(asOf), 6)) : mEnd;
    const pLbl = view === 'day' ? `${md(asOf)} ${wd(asOf)}` : view === 'week' ? `${md(p0)}(수)~${md(p1)}(화)` : `${+asOf.slice(5, 7)}월(${md(p0)}~${md(p1)})`;
    const until = p1, inP = (d) => d && d >= (p0 > asOf ? p0 : asOf) && d <= p1;   // 11/7 점검: 이미 지난 납기는 '기간 안'에서 빼고 아래 overdue 로
    const open = M.all.filter((o) => !o.closed && !CT.isStale(o) && CT.inScope(o.pl));   // 종결 확인 필요(납기 60일+ 미종결) 제외(11/8)
    const inWin = (o) => inP(o.last || o.needProd);
    const risk = open.filter((o) => o.risk === '위험' && inWin(o)), warn = open.filter((o) => o.risk === '주의' && inWin(o)), nd = open.filter((o) => o.risk === '판정 불가');
    const overdue = open.filter((o) => (o.risk === '위험' || o.risk === '주의') && (o.last || o.needProd) && (o.last || o.needProd) < asOf);
    const T = (xs) => xs.reduce((a, o) => a + (o.remT || 0), 0);
    const SCN = ({ all: '전체', G: '도금', C: '컬러' })[CT.scope()];

    // ① 자료 상태: 한 줄 요약 + 펼침
    const rp = L.replan || {};
    const src = [
      { name: '도금 실적', at: P.asOf, kind: '실적' },
      { name: '컬러 실적', at: (P.groups || []).find((g) => g.pl === 'C' && g.prod)?.prod?.asOf, kind: '실적' },
      { name: '도금 계획', at: rp.t0 || (D['latest.plan'] || {}).savedAt, kind: '재계획' },
      { name: '컬러 계획', at: W.built, kind: '기준 계획' },
      { name: '판생속보', at: (P.sr || {}).asOf, kind: '실적·계획' },
      { name: '도금 주문', at: M.cgAt, kind: '실적' },
      { name: '컬러 주문', at: M.ccAt, kind: M.ccMissing.length ? `${M.ccLines.join('·')}만` : '실적', ok: !M.ccMissing.length, tip: M.ccMissing.length ? `${M.ccMissing.join('·')} 자료 없음` : '' },
      { name: '소재', at: MO.today, kind: '추정' },
    ];
    src.forEach((x) => { if (x.ok !== false && (!x.at || diff(String(x.at).slice(0, 10), CT.today()) < -1)) { x.ok = false; x.tip = x.tip || (x.at ? '이틀 이상 지난 자료' : '자료 없음'); } });
    const badSrc = src.filter((x) => x.ok === false);
    const basis = `<details class="ct-ds"><summary><b>자료 상태</b> 기준 ${md(asOf)} · ${src.length}개 중 ${badSrc.length ? `<b class="ct-neg">확인 필요 ${badSrc.length}</b> (${badSrc.map((x) => esc(x.name)).join('·')})` : '모두 최신'} <span class="ct-more">자세히</span></summary>${CT.basis(src)}</details>`;

    // ② 핵심 지표 6 — 납기·소재·생산 차질 우선
    const lines = (P.lines || []).filter((x) => CT.inScope(x.pl));
    const cg = (P.groups || []).filter((g) => g.pl === 'C' && g.prod && CT.inScope('C'));
    const gl = lines.filter((x) => x.pl === 'G');
    const cgP = gl.reduce((a, x) => a + (x.sched || 0), 0), cgA = gl.reduce((a, x) => a + (x.actual || 0), 0);
    const ccP = cg.reduce((a, g) => a + Math.max(0, (g.prod.month || 0) - (g.prod.after || 0)), 0), ccA = cg.reduce((a, g) => a + (g.prod.actual || 0), 0);
    const pct = (a, p) => (p ? Math.round(a / p * 100) : null);
    const tone = (v) => (v == null ? '' : v >= 98 ? 'ok' : v >= 90 ? 'warn' : 'bad');
    // 기간 생산 진도: 실적 = 라인 일 실적(MES, 어제까지) · 계획 = 그날 아침 도금 계획(최신 재계획 → 직전 재계획 → 그날 아침 계획 기록). 컬러는 지난 날 일 계획 기록이 없어 월간만
    const accPlan = {}; for (const l of Object.keys(P.acc || {})) for (const r of (P.acc[l].last || [])) accPlan[`${r[1]}|${r[0]}`] = r[2];
    const sumRows = (rows, from) => { const m = {}; for (const r of rows || []) if (r[0] > from) m[`${r[1]}|${r[0]}`] = (m[`${r[1]}|${r[0]}`] || 0) + (+r[4] || 0); return m; };
    const pl1 = sumRows(L.rows, ((L.replan || {}).t0) || ''), pl0 = sumRows(LP.rows, ((LP.replan || {}).t0) || '');
    const planOn = (x, d) => pl1[`${x.line}|${d}`] ?? pl0[`${x.line}|${d}`] ?? accPlan[`${x.line}|${d}`] ?? null;
    const lastFull = (x) => (x.asOf < asOf ? x.asOf : addD(asOf, -1));                     // 하루가 끝난 날만(오늘 실적은 중간값)
    const perLine = lines.map((x) => {
      if (view === 'month') return { x, p: x.pl === 'G' ? x.sched || 0 : null, a: x.actual || 0 };
      if (x.pl === 'C') return { x, p: null, a: 0, ds: [] };                                // 컬러는 지난 날 일 계획 기록이 없어 월간에서만
      const ds = (x.days || []).map((r) => r[0]).filter((d) => d <= lastFull(x) && (view === 'day' ? d === lastFull(x) : d >= p0 && d <= p1));   // 11/10 점검: 주간 진도가 '오늘 이후'(주문 창 inP)로 걸러져 지난 날 실적이 빠지고 '-'(본문 라인 카드엔 실적)
      let p = 0, a = 0, miss = false;
      for (const d of ds) { const v = planOn(x, d); if (v == null) miss = true; p += v || 0; a += +((x.days.find((r) => r[0] === d) || [])[1] || 0); }
      return { x, p: ds.length && !miss ? p : null, a, ds };
    });
    let plan, act, prSub;
    if (view === 'month') { plan = cgP + ccP; act = cgA + ccA; prSub = `${+asOf.slice(5, 7)}월 실적 ${n0(act)} / 일정 누계 ${n0(plan)}t`; }
    else {
      const ok = perLine.filter((r) => r.p != null);
      plan = ok.reduce((a, r) => a + r.p, 0); act = ok.reduce((a, r) => a + r.a, 0);
      const dd = [...new Set(perLine.flatMap((r) => r.ds || []))].sort();
      prSub = dd.length ? `${dd.length > 1 ? `${md(dd[0])}~${md(dd[dd.length - 1])}` : md(dd[0])} 도금 실적 ${n0(act)} / 계획 ${n0(plan)}t${CT.inScope('C') ? ' · 컬러는 월간에서' : ''}` : `${pLbl} 실적 집계 전(MES 실적은 전날까지)`;
      if (!dd.length) plan = 0;
    }
    const pr = pct(act, plan);
    const lag = view === 'month' ? gl.filter((x) => x.sched && x.actual < x.sched * 0.95).map((x) => ({ line: x.line, gap: x.sched - x.actual }))
      : perLine.filter((r) => r.p && r.a < r.p * 0.95).map((r) => ({ line: r.x.line, gap: r.p - r.a }));
    const MV = UI.matView(MO, P);   // 11/9: 소재 상태·마감 = 공통 기준(ui/shell.js UI.matView — 마감 지남은 matLate 만, 마감일은 업체별 리드타임)
    const mats = MV.filter((m) => CT.inScope(m.plant) && (m.st === 'late' || m.st === 'soon'));
    const mAll = MV.filter((m) => CT.inScope(m.plant) && m.short > 0.5);
    const mSure = mAll.filter((m) => m.st === 'late'), mExp = mAll.filter((m) => !mSure.includes(m));   // 11/9: 확정 = 발주 마감 지남(matLate) — 04 부족·조치와 같은 기준
    const mPer = mAll.filter((m) => m.first && m.first <= p1), mPerNew = mPer.filter((m) => m.first >= p0);   // 기간 안(또는 이미) 부족이 시작되는 소재
    const sT = (xs) => xs.reduce((a, m) => a + m.short, 0);
    const lateM = MV.filter((m) => CT.inScope(m.plant) && m.st === 'late' && (m.lateT || 0) >= 0.5), lateSum = lateM.reduce((a, m) => a + (m.lateT || 0), 0);
    const matOrd = open.filter((o) => o.cause === 'mat' && (o.risk === '위험' || o.risk === '주의'));
    const SG = { 도금판매: 'G', 도금수출: 'G', 자동차강판: 'G', 컬러수출: 'C', 컬러건재: 'C' };
    const ship = ((P.sr || {}).ship || []).filter((x) => SG[x.name] && CT.inScope(SG[x.name]));
    // 출하: 월간 = 판생속보 일정 누계 대비 · 금일·주 = 하루 출고 계획(재고 추이와 같은 값, MES 월중 패턴) 대비 MES 출하 실적(전날까지)
    const SK = { 도금판매: 'G국내', 도금수출: 'G수출', 자동차강판: 'G자동차', 컬러수출: 'C수출', 컬러건재: 'C건재' };
    const RO = P.stockRoll || {}, SD = P.shipDay || {};
    const shipOf = (x) => {
      if (view === 'month') return { n: x.name, p: x.sched || 0, a: x.actual || 0 };
      const g = SK[x.name], ds = [];
      for (let d = view === 'day' ? (SD.asOf || asOf) : p0; d <= (view === 'day' ? (SD.asOf || asOf) : p1) && d <= (SD.asOf || ''); d = addD(d, 1)) ds.push(d);
      const p = ds.reduce((a, d) => a + (((RO.out || {})[g] || [])[diff(d, RO.d0)] || 0), 0), a = ds.reduce((s_, d) => s_ + (((SD.g || {})[g] || {})[d] || 0), 0);
      return { n: x.name, p, a, ds };
    };
    const shp = ship.map(shipOf), shipDays = [...new Set(shp.flatMap((x) => x.ds || []))].sort();
    const shipGap = shp.reduce((a, x) => a + Math.max(0, x.p - x.a), 0), shipBad = shp.filter((x) => x.p - x.a > 0.5);
    const shipSub = view !== 'month' && !shipDays.length ? `${pLbl} 출하 실적 집계 전(전날까지)` : `${view === 'month' ? '일정 누계' : shipDays.length > 1 ? `${md(shipDays[0])}~${md(shipDays[shipDays.length - 1])} 계획` : `${md(shipDays[0])} 계획`} ${shipBad.length ? `미달 ${shipBad.map((x) => x.n).join('·')}` : '충족'}`;
    const noShip = open.filter((o) => o.ful === '출하 확인 불가');
    const past = overdue;
    const K = [
      { label: '납기 지연 예상', v: n0(risk.length), unit: '건', sub: `${n0(T(risk))}t · 점검 ${warn.length}건 · 이미 지난 ${n0(overdue.length)}건 별도`, tone: risk.length ? 'bad' : 'ok', href: 'ct_orders.html#risk' },
      { label: '소재 부족', v: n0(lateSum), unit: 't', sub: lateM.length ? `발주 마감 지난 부족 ${lateM.length}종(${lateM.slice().sort((x, y) => (y.lateT || 0) - (x.lateT || 0)).slice(0, 3).map((m) => esc(m.name)).join('·')})` : '발주 마감 지난 부족 없음', tone: lateSum >= 0.5 ? 'bad' : mats.length ? 'warn' : 'ok', href: 'ct_mat.html' },   // 11/10 점검(F13): 소재 부족 = 마감 지난 부족(lateT)만 — 월간 55,518t(3달 합)·금일 0t(기간 안 시작만)이던 것 → 모든 소재 화면 공통값
      { label: '생산 진도율', v: pr == null ? '-' : pr, unit: pr == null ? '' : '%', sub: prSub, tone: tone(pr), href: 'ct_prod.html#perf' },
      { label: '출하 미달', v: n0(shipGap), unit: 't', sub: shipSub, tone: shipGap > 500 ? 'bad' : shipGap > 0.5 ? 'warn' : 'ok', href: 'ct_prod.html#ship' },
      { label: '생산 미달', v: view !== 'month' && !plan ? '-' : lag.length, unit: view !== 'month' && !plan ? '' : '라인', sub: lag.length ? lag.map((x) => `${x.line} −${n0(x.gap)}t`).join(' · ') : view !== 'month' && !plan ? '실적 집계 전' : '계획 대비 95% 이상', tone: lag.length ? 'warn' : 'ok', href: 'ct_prod.html#run' },
      { label: '자료 확인 필요', v: n0(nd.length), unit: '건', sub: `전체 · 출하 실적 없음 ${noShip.length}건`, tone: nd.length ? 'warn' : 'ok', href: 'ct_orders.html#risk' },
    ];

    // ③ 조치 우선순위 TOP10: 원인 × 판매그룹 묶음 + 소재 마감 + 현장 예외
    const acts = [], by = new Map();
    for (const o of risk.concat(warn)) {
      const k = `${o.cause}|${o.pl}|${o.grp}`;
      if (!by.has(k)) by.set(k, { k, type: CT.CAUSE[o.cause], grp: o.grp, os: [], dept: o.dept, last: null, risk: '주의' });
      const a = by.get(k); a.os.push(o);
      if (o.last && (!a.last || o.last < a.last)) a.last = o.last;
      if (o.risk === '위험') a.risk = '위험';
    }
    for (const a of by.values()) acts.push({ id: CT.issueId('ord|' + a.k), risk: a.risk, type: a.type, grp: a.grp, what: `${a.grp} ${a.os.length}건`, t: T(a.os), last: a.last, dept: a.dept, os: a.os });
    for (const m of mats) acts.push({ id: CT.issueId('mat|' + m.key), risk: m.st === 'late' ? '위험' : '주의', type: '소재 발주', what: m.st === 'late' ? `${m.name} 마감 지남 ${n0(m.lateT)}t` : `${m.name} 부족 ${n0(m.short)}t · ${md(m.first)}부터`, t: m.st === 'late' ? m.lateT : m.short, last: m.deadline, dept: CT.DEPT.mat, href: 'ct_mat.html' });   // 11/9: 마감 지남 = matLate 몫
    for (const x of (P.exceptions || []).filter((x) => (x.lvl === 'bad' || x.lvl === 'warn') && !CT.idleSkip(D, x.text))) {   // 계획 휴지 라인 경보 제외(11/8)
      if (!CT.inScope(/도금/.test(x.area) ? 'G' : /컬러/.test(x.area) ? 'C' : 'all')) continue;
      acts.push({ id: CT.issueId('exc|' + x.text), risk: x.lvl === 'bad' ? '위험' : '주의', type: x.area, what: x.text, t: null, last: null, dept: x.who, href: x.link });
    }
    acts.sort((a, b) => (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || String(a.last || '9').localeCompare(String(b.last || '9')) || (b.t || 0) - (a.t || 0));
    const top = acts.slice(0, 10);
    const left = (d) => (d == null ? '-' : diff(d, asOf) < 0 ? `<b class="ct-neg">${md(d)} · ${-diff(d, asOf)}일 지남</b>` : `${md(d)} <small class="ct-dd">D-${diff(d, asOf)}</small>`);
    const stCell = (a) => `<span class="ct-new" data-id="${a.id}">${esc(ST[a.id] || '신규')}</span>`;
    const actTbl = top.length ? `<div class="ct-wrap"><table class="ct-t"><colgroup><col style="width:150px"><col><col style="width:84px"><col style="width:136px"><col style="width:108px"><col style="width:72px"></colgroup><thead><tr><th>무엇이 문제</th><th>대상</th><th class="r">해당 물량</th><th>조치 마감</th><th>조치 부서</th><th>진행</th></tr></thead><tbody>${top.map((a, i) => `<tr class="ck" tabindex="0" data-i="${i}"><td class="nw">${CT.badgeT(a.risk, a.type)}</td><td class="w">${esc(a.what)}</td><td class="r">${a.t == null ? '' : n0(a.t)}</td><td class="nw">${left(a.last)}</td><td class="nw">${esc(a.dept || '')}</td><td class="nw">${stCell(a)}</td></tr>`).join('')}</tbody></table></div>${acts.length > 10 ? `<p class="ct-note">상위 10건 / 전체 ${acts.length}건 · <a href="ct_issue.html#now">이슈·조정에서 전체 보기</a></p>` : ''}` : '<p class="ct-note">기간 안 조치 대상 없음</p>';

    // ④ 라인별 진도(11/5 사용자 '라인별 진도를 키우고 한눈에, 공장별 라인별로'): 공장 → 라인 카드(진도율 · 계획 대비 막대 · 일별 막대)
    const ndays = ndM(asOf), mon = asOf.slice(0, 7), RUN = P.running && P.running.lines && P.running.d === asOf ? P.running : null;   // 진행 중 = 기준일 것만(11/8 날짜 통일)
    const futG = {}; for (const r of L.rows || []) if (r[0] > (((L.replan || {}).t0) || '')) futG[`${r[1]}|${r[0]}`] = (futG[`${r[1]}|${r[0]}`] || 0) + (+r[4] || 0);
    const colP = {}, colA = {}; for (const c of W.color || []) { const t = Object.values(c.g || {}).reduce((a, v) => a + v, 0); (c.act ? colA : colP)[`${c.l}|${c.d}`] = ((c.act ? colA : colP)[`${c.l}|${c.d}`] || 0) + t; }
    const cdown = {}; for (const r of W.colorDown || []) if (r[2] !== 'test') cdown[`${r[1]}|${r[0]}`] = (cdown[`${r[1]}|${r[0]}`] || 0) + (+r[3] || 0);
    const accAct = {}; for (const l of Object.keys(P.acc || {})) for (const r of (P.acc[l].last || [])) accAct[`${r[1]}|${r[0]}`] = r[3];
    const dayAct = {}; for (const src of [D.plating_actual, D.color_actual]) for (const r of ((src || {}).daily || [])) for (const [k, v] of Object.entries(r)) if (k !== 'd') dayAct[`${k}|${r.d}`] = +v || 0;   // 지난달 일별 실적(MES)
    for (const r of ((D.plating_actual || {}).accHist || [])) if (accPlan[`${r[1]}|${r[0]}`] == null) accPlan[`${r[1]}|${r[0]}`] = r[2];
    const actOn = (x, d) => { const r = (x.days || []).find((z) => z[0] === d); return r ? +r[1] || 0 : (accAct[`${x.line}|${d}`] ?? dayAct[`${x.line}|${d}`] ?? null); };   // 지난달 날은 도금 계획 대비 기록(acc)에서
    const futPlan = (x, d) => (x.pl === 'G' ? (futG[`${x.line}|${d}`] ?? null) : (colP[`${x.line}|${d}`] ?? null));
    const pastPlan = (x, d) => (x.pl === 'G' ? planOn(x, d) : null);                                  // 컬러는 지난 날 일 계획 기록 없음(실적으로 덮어 게시)
    const chartDays = Array.from({ length: ndays }, (_, i) => `${mon}-${String(i + 1).padStart(2, '0')}`);   // 그래프는 항상 이번 달(11/5 사용자 '월별로 끊어라') — 고른 기간은 칸 배경으로
    const sig = (v) => `${v >= 0 ? '+' : '−'}${n0(Math.abs(v))}`;
    const LN = ['1CGL', '2CGL', '1CCL', '2CCL', '3CCL', '4CCL'].map((ln) => (P.lines || []).find((x) => x.line === ln)).filter((x) => x && CT.inScope(x.pl)).map((x) => {
      const lf = lastFull(x);
      const dd = chartDays.map((d) => {
        const past = d <= lf, a = past ? actOn(x, d) : null, pp = past ? pastPlan(x, d) : futPlan(x, d);
        const stop = past && a != null && !a;
        return { d, a, p: pp, past, stop };
      });
      const st0 = actOn(x, lf), stopD = x.pl === 'C' && (cdown[`${x.line}|${addD(lf, 1)}`] || 0) >= 1380;
      const dnT = x.pl === 'C' && (W.colorDown || []).find((r) => r[0] === asOf && r[1] === x.line && r[2] !== 'test' && +r[3] >= 1380);   // 11/10 점검: 상태 = 오늘(계획 수리·휴지 종일이면 그것) — 4CCL 11/9 수리 종일인데 어제 생산으로 '가동'
      const status = dnT ? [({ repair: '수리', plan: '계획 휴지', sd: 'S/D' })[dnT[2]] || '휴지', 'na'] : st0 > 0.5 ? ['가동', 'ok'] : stopD || (cdown[`${x.line}|${lf}`] || 0) >= 1380 ? ['휴지', 'na'] : ['정지', 'bad'];
      let big, bigU = '%', sub, max, act, mark, markL, diffT = null, tn = '';
      if (view === 'month') {
        if (x.pl === 'G') {
          act = x.actual || 0; mark = x.sched || 0; max = Math.max(x.month || 0, act); markL = '일정 누계';
          big = mark ? Math.round(act / mark * 100) : null; diffT = act - mark; tn = tone(big);
          sub = `실적 ${n0(act)} / 일정 누계 ${n0(mark)}t · 월차 ${n0(x.month)}t`;
        } else {
          const mp = chartDays.reduce((a, d) => a + (d <= lf ? (actOn(x, d) || 0) : (colP[`${x.line}|${d}`] || 0)), 0);
          const run = chartDays.filter((d) => (cdown[`${x.line}|${d}`] || 0) < 1380);                    // 계획 휴지 날 빼고 경과(휴지 많은 라인을 고르게 경과로 나누면 과소평가)
          const el = run.length ? run.filter((d) => d <= lf).length / run.length : 0;
          act = x.actual || 0; max = Math.max(mp, act); mark = mp * el; markL = `경과 ${Math.round(el * 100)}%`;
          big = mp ? Math.round(act / mp * 100) : null; diffT = act - mark;
          tn = big == null ? '' : big >= el * 100 ? 'ok' : big >= el * 100 - 10 ? 'warn' : 'bad';
          sub = mp ? `실적 ${n0(act)} / 월 계획 ${n0(mp)}t · 가동일 경과 ${Math.round(el * 100)}%` : '이번 달 계획 없음';
        }
      } else {
        const ds = view === 'day' ? [lf] : chartDays.filter((d) => d >= p0 && d <= p1);
        const done = dd.filter((z) => ds.includes(z.d) && z.past), fut = dd.filter((z) => ds.includes(z.d) && !z.past);
        act = done.reduce((a, z) => a + (z.a || 0), 0);
        const pDone = done.every((z) => z.p != null) ? done.reduce((a, z) => a + (z.p || 0), 0) : null;
        const pFut = fut.reduce((a, z) => a + (z.p || 0), 0);
        if (view === 'day') {
          mark = pDone; max = Math.max(pDone || 0, act); markL = '계획';
          big = pDone ? Math.round(act / pDone * 100) : null; diffT = pDone != null ? act - pDone : null; tn = tone(big);
          sub = `${md(lf)} 실적 ${n0(act)}t${pDone != null ? ` / 계획 ${n0(pDone)}t` : ' · 지난 날 일 계획 기록 없음'}`;
        } else {
          mark = pDone || 0; max = Math.max((pDone || 0) + pFut, act + pFut); markL = '지난 날 계획';
          big = done.length && pDone ? Math.round(act / pDone * 100) : null; diffT = done.length && pDone != null ? act - pDone : null; tn = tone(big);
          sub = done.length ? `실적 ${n0(act)}t(${md(done[0].d)}~${md(done[done.length - 1].d)})${pDone != null ? ` / 계획 ${n0(pDone)}t` : ''} · 남은 계획 ${n0(pFut)}t` : `실적 집계 전 · 이번 주 계획 ${n0(pFut)}t`;
        }
        if (big == null && !(view === 'week' && !done.length)) { big = n0(act); bigU = 't'; }
      }
      const stopDays = x.pl === 'C' ? Array.from({ length: ndays }, (_, i) => `${mon}-${String(i + 1).padStart(2, '0')}`).filter((d) => (cdown[`${x.line}|${d}`] || 0) >= 1380).length : 0;
      const foot = x.pl === 'G' ? `현재 ${x.fam || '-'}${x.next ? ` · 다음 ${md(x.next[0])} ${x.next[1]}` : ''}` : `${+mon.slice(5)}월 계획 휴지 ${stopDays}일`;
      return { x, dd, status, big, bigU, sub, max, act, mark, markL, diffT, tn, foot };
    });
    const bar = (r) => {
      if (!r.max || r.mark == null) return `<div class="ln-bar e"><span>${!r.max ? '계획 없음' : '지난 날 일 계획 기록 없음 — 진도는 월간에서'}</span></div><div class="ln-bl"><span></span><span></span></div>`;
      const w = Math.min(100, r.act / r.max * 100), m = r.mark != null ? Math.min(100, r.mark / r.max * 100) : null;
      return `<div class="ln-bar"><i class="${r.tn}" style="width:${w.toFixed(1)}%"></i>${m != null && r.mark > 0 ? `<em style="left:${m.toFixed(1)}%" title="${esc(r.markL)} ${n0(r.mark)}t"></em>` : ''}</div>`
        + `<div class="ln-bl"><span>${r.mark != null && r.mark > 0 ? `▼ ${esc(r.markL)} ${n0(r.mark)}t` : ''}</span><span>${n0(r.max)}t</span></div>`;
    };
    // 일별 생산 그래프(11/5 사용자 '성의 없는 그래프' → 축·눈금·날짜·값·범례가 있는 막대): HTML 막대라 글자 크기가 화면 폭과 무관
    const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
    const spark = (r) => {
      const n = r.dd.length, many = n > 16;
      const mx = nice(Math.max(100, ...r.dd.map((z) => Math.max(z.a || 0, z.p || 0))) * 1.12);
      const rest = (d) => r.x.pl === 'C' && (cdown[`${r.x.line}|${d}`] || 0) >= 1380;
      const pc = (v) => `${Math.min(100, Math.max(0, v) / mx * 100).toFixed(1)}%`;
      const grid = [1, 0.5, 0].map((f) => `<div class="ch-g" style="bottom:${f * 100}%"><span>${n0(mx * f)}</span></div>`).join('');
      const cols = r.dd.map((z, i) => {
        const lo = z.past && z.a != null && z.p != null && z.p > 0 && z.a < z.p * 0.95;
        const tip = `${md(z.d)}(${wd(z.d)}) ${!z.past && RUN && z.d === RUN.d ? `진행 중 ${n0(+(RUN.lines || {})[r.x.line] || 0)}t(07:00~${RUN.at || ''}, 마감 전) · ` : ''}${z.past ? (z.a == null ? '실적 자료 없음' : `실적 ${n0(z.a)}t${z.p != null ? ` · 계획 ${n0(z.p)}t` : ''}${z.stop ? ' · 정지/휴지' : ''}`) : `계획 ${n0(z.p || 0)}t`}`;
        const rt = !z.past && RUN && z.d === RUN.d ? (+(RUN.lines || {})[r.x.line] || 0) : null;
        let body = '', val = '';
        if (z.past && z.a == null) body = '<i class="ch-na">자료<br>없음</i>';
        else if (z.past && z.stop) body = `<i class="ch-na">${rest(z.d) ? '계획<br>휴지' : '정지'}</i>`;
        else if (z.past) { body = `<b class="ch-a${lo ? ' lo' : ''}" style="height:${pc(z.a)}"></b>`; val = n0(z.a); }
        else if (z.p) { body = `<b class="ch-f" style="height:${pc(z.p)}"></b>`; val = n0(z.p); }
        if (rt != null) { body = (z.p ? `<b class="ch-f" style="height:${pc(z.p)}"></b>` : '') + `<b class="ch-r" style="height:${pc(rt)}"></b>`; val = n0(rt); }   // 오늘 진행분(마감 전, 11/5 사용자)
        else if (!body) body = `<i class="ch-na">${rest(z.d) ? '계획<br>휴지' : '계획<br>없음'}</i>`;   // 11/7 점검: else 로 모든 칸을 덮던 것
        if (z.past && z.p != null && z.p > 0) body += `<em class="ch-p" style="bottom:${pc(z.p)}"></em>`;
        const ti = r.dd.findIndex((q) => q.d === asOf), dn = +z.d.slice(8);
        const showD = !many || z.d === asOf || ((dn === 1 || dn % 5 === 0 || i === n - 1) && (ti < 0 || Math.abs(i - ti) > 1));
        const off = (z.past ? z.stop : !z.p) && (rest(z.d) || (!z.past && r.x.pl === 'G'));
        const inP = view === 'month' || (view === 'day' ? z.d === lastFull(r.x) : z.d >= p0 && z.d <= p1);
        return `<div class="ch-c${z.d === asOf ? ' today' : ''}${z.past ? '' : ' fut'}${inP && view !== 'month' ? ' sel' : ''}${off ? ' off' : ''}" title="${esc(tip)}"><div class="ch-v${lo ? ' lo' : ''}">${many ? '' : val}</div><div class="ch-b">${body}</div>`
          + `<div class="ch-x">${showD ? `${+z.d.slice(5, 7)}/${+z.d.slice(8)}<small>${z.d === asOf ? '오늘' : wd(z.d)}</small>` : ''}</div></div>`;
      }).join('');
      const leg = `<div class="ch-leg"><span><b class="k a"></b>실적</span><span><b class="k lo"></b>계획 95% 미만</span><span><b class="k p"></b>그날 계획</span><span><b class="k f"></b>앞으로 계획</span>${RUN ? '<span><b class="k r"></b>오늘 진행 중</span>' : ''}<span><b class="k o"></b>휴지·정비</span><span class="u">단위 t</span></div>`;
      return `${leg}<div class="ch${many ? ' many' : ''}"><div class="ch-in">${grid}<div class="ch-cols" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${cols}</div></div></div>`;
    };
    const runLine = (r) => {                                                                      // 오늘 진행분(07시~ 마감 전) — 진도율에는 안 넣고 참고로(11/5 사용자 '화면에 보여줘')
      if (!RUN || RUN.d <= lastFull(r.x)) return '';
      const t = +(RUN.lines || {})[r.x.line] || 0, p = futPlan(r.x, RUN.d);
      return `<div class="ln-run">오늘 ${md(RUN.d)} 진행 중 <b>${n0(t)}t</b>${p ? ` / 계획 ${n0(p)}t` : ''}<span>${(r.x.pl === 'C' ? RUN.ccUpto : RUN.at) ? `07:00~${r.x.pl === 'C' ? RUN.ccUpto : RUN.at}` : "07시부터"} · 마감 전</span></div>`;
    };
    const card = (r) => `<a class="ln-c ${r.tn}" href="ct_prod.html#perf"><div class="ln-h"><b>${r.x.line}</b><span class="ln-st ${r.status[1]}">${r.status[0]}</span><span class="ln-big">${r.big == null ? '<small>집계 전</small>' : `${r.big}<small>${r.bigU}</small>`}</span></div>`
      + `<div class="ln-sub">${esc(r.sub)}${r.diffT != null ? ` <b class="${r.diffT >= 0 ? 'pos' : 'neg'}">${sig(r.diffT)}t</b>` : ''}</div>${runLine(r)}${bar(r)}${spark(r)}<div class="ln-ft">${esc(r.foot)}</div></a>`;
    const plant = (pl, nm) => {
      const rs = LN.filter((r) => r.x.pl === pl);
      if (!rs.length) return '';
      const pa = rs.reduce((a, r) => a + (r.act || 0), 0), pm = rs.reduce((a, r) => a + (r.mark || 0), 0), pmax = rs.reduce((a, r) => a + (r.max || 0), 0);
      if (view === 'week' && !pa && !pm) return `<div class="ln-pl"><div class="ln-ph"><b>${nm}</b><span>실적 집계 전 · 이번 주 계획 ${n0(pmax)}t</span></div><div class="ln-grid n${rs.length > 2 ? 2 : rs.length}">${rs.map(card).join('')}</div></div>`;
      const hp = pm ? Math.round(pa / pm * 100) : null;
      const lbl = view === 'month' ? (pl === 'G' ? '일정 누계' : '가동일 경과 기준') : '계획';
      return `<div class="ln-pl"><div class="ln-ph"><b>${nm}</b><span>실적 ${n0(pa)}t${pm ? ` / ${lbl} ${n0(pm)}t · <b class="${tone(hp)}">${hp}%</b>` : ''}</span></div><div class="ln-grid n${rs.length > 2 ? 2 : rs.length}">${rs.map(card).join('')}</div></div>`;
    };
    // ④-2 판매그룹별 현황(11/5 사용자 '통합관제에 그룹별로 표현해'): 관제 띠(ui/ctl.js)와 같은 값 — 생산·출하·재고·소재·납기
    const GROUP_ORD = { G수출: '도금수출', G국내: '도금국내', G자동차: '자동차강판', C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' };
    const CR = (window.UI && UI.ctlRows) ? (UI.ctlRows(P, MO, W) || []) : [];   // 11/9: W = 상한일수(tfRules)
    const ndG = ndM(asOf), elapsed = Math.min(1, (+asOf.slice(8) - 1) / ndG);
    const TFD = new Proxy({}, { get: (o, k) => UI.ctlTfd(k, W) });   // 11/9: 상한일수 = 엔진 값(integrated tfRules.days, ui/ctl.js UI.ctlTfd) — 고정표는 자료 없을 때만   // TF 목표 일수 = 상한(11/5 운영 개선: 계획 목표는 실측 출하 대기 — 도금국내 7·주문재 8·컬러수출 10일, 계획 규칙 화면)
    const SRv = (k) => { const kk = k === 'G자가재' ? '도금 제품(자가재)' : 'g:' + k; let bd = '', bv = null; for (const [d, q, v] of P.stockTrend || []) if (q === kk && d <= asOf && d >= bd) { bd = d; bv = v; } if (bv != null) return bv; const SR = P.stockRoll || {}, wi = (SR.weeks || []).findIndex((w) => w >= (SR.asOf || '')), a = (SR.v || {})[k] || []; for (let i = Math.max(0, wi); i >= 0; i--) if (a[i] != null) return a[i]; return null; };   // 11/7 점검: 주말 예상치 대신 판생 실재고
    const SLB = { bad: '조치', warn: '주의', ok: '정상', na: '–' };
    const meter = (v, max, mark, tone, aria) => `<div class="gm" role="img" aria-label="${esc(aria)}"><i class="${tone}" style="width:${max > 0 ? Math.min(100, v / max * 100).toFixed(1) : 0}%"></i>${mark != null && max > 0 ? `<em style="left:${Math.min(100, mark / max * 100).toFixed(1)}%"></em>` : ''}</div>`;
    const gcard = (g) => {
      const r = CR.find((x) => x.key === g.key) || { cells: ['na', 'na', 'na', 'na', 'na'], vals: [], w: 'na' };
      const Pd = g.prod || {}, S = g.ship;
      const fin = (Pd.actual || 0) + (Pd.after || 0), pace = (Pd.month || 0) * elapsed;
      const prod = `<div class="gr"><span class="gk">생산</span><div class="gv">${meter(Pd.actual || 0, Pd.month || 0, pace, r.cells[0], `생산 실적 ${n0(Pd.actual || 0)}t / 월 계획 ${n0(Pd.month || 0)}t`)}`
        + `<div class="gt"><b>${n0(Pd.actual || 0)}</b> / ${n0(Pd.month || 0)}t <span class="${r.cells[0]}">월말 예상 ${Pd.month ? Math.round(fin / Pd.month * 100) : '-'}%</span></div></div></div>`;
      const ship = !S ? '' : `<div class="gr"><span class="gk">출하</span><div class="gv">${meter(S.actual || 0, S.month || 0, S.sched || null, r.cells[1], `출하 실적 ${n0(S.actual || 0)}t / 월 ${n0(S.month || 0)}t`)}`
        + `<div class="gt"><b>${n0(S.actual || 0)}</b> / ${n0(S.month || 0)}t <span class="${r.cells[1]}">${S.sched ? (S.actual >= S.sched ? `일정 누계 ${n0(S.sched)}t 충족` : `일정 누계 대비 −${n0(S.sched - S.actual)}t`) : '일정 누계 없음'}</span></div></div></div>`;
      const st = SRv(g.key), dly = S && S.month ? S.month / ndG : 0, cov = st != null && dly ? st / dly : null, tg = TFD[g.key];
      const stock = st == null ? '' : `<div class="gr"><span class="gk">재고</span><div class="gv">${cov != null && tg ? meter(cov, tg * 2, tg, r.cells[2], `재고 ${Math.round(cov)}일 / 상한 ${tg}일`) : ''}<div class="gt"><b>${n0(st)}t</b>${cov != null ? ` · <span class="${r.cells[2]}">${Math.round(cov)}일</span>${tg ? ` / 상한 ${tg}일` : ''}` : ''}</div></div></div>`;
      const mv = r.vals[3] || [], mat = r.cells[3] === 'na' && (!mv[0] || mv[0] === '–') ? '' : `<div class="gr"><span class="gk">소재</span><div class="gv"><div class="gt"><span class="${r.cells[3]}"><b>${esc(mv[0] || '–')}</b></span>${mv[1] ? ` · ${mv[1]}` : ''}</div></div></div>`;
      const gn = GROUP_ORD[g.key], os = g.key === 'G자가재' ? open.filter((o) => o.pl === 'G' && /^자가재/.test(o.grp)) : open.filter((o) => o.grp === gn && o.pl === g.pl);
      const late = os.filter((o) => o.risk === '위험' && inWin(o)), dv = r.vals[4] || [];   // 11/10 점검: 위 '납기 지연 예상' 카드와 같은 기간(그룹 합 = 카드 값)
      const due = `<div class="gr"><span class="gk">납기</span><div class="gv"><div class="gt">${late.length ? `<span class="bad"><b>지연 예상 ${n0(late.length)}건</b></span> · ${n0(late.reduce((a, o) => a + (o.remT || 0), 0))}t` : '<span class="ok"><b>지연 예상 0건</b></span>'}${g.pl === 'G' && dv[0] && dv[0] !== '–' ? ` · <span class="${r.cells[4]}">${esc(dv[0])}</span>` : ''}</div></div></div>`;
      return `<a class="gc ${r.w}" href="board.html"><div class="gh"><b>${esc(g.name.replace(/\(.*\)/, ''))}</b><span class="gs ${r.w}">${SLB[r.w]}</span></div>${prod}${ship}${stock}${mat}${due}</a>`;
    };
    const gsec = (pl, nm) => { const gs = (P.groups || []).filter((g) => g.pl === pl && CT.inScope(pl)); return gs.length ? `<div class="gp"><div class="ln-ph"><b>${nm}</b><span>${gs.length}개 판매그룹</span></div><div class="gg">${gs.map(gcard).join('')}</div></div>` : ''; };
    const grpSec = `<section class="card g-sec"><h2>판매그룹별 현황 <small>${view === 'month' ? '' : '이번 달 누계 · '}생산·출하 = 실적 / 월 계획(▼ ${view === 'month' ? '경과일 기준 예상 위치 · 출하는 일정 누계' : '경과일·일정 누계'}) · 재고 = 하루 출하 기준 일수(▼ 상한) · 카드 색 = 가장 나쁜 신호</small></h2>${gsec('G', '도금')}${gsec('C', '컬러')}</section>`;
    const lineSec = `<section class="card ln-sec"><h2>라인별 진도 <small>${pLbl} · 공장 → 라인 · 막대 = 기간 실적(▼ 계획), 아래 = 일별 실적과 계획</small></h2>${plant('G', '도금 공장')}${plant('C', '컬러 공장')}</section>`;

    // ⑤-1 오늘·내일 라인별 생산 계약(11/5 사용자 '오늘 내일 생산계획도 실 계약을 보여줘야'): 도금 = 생산 캘린더(확정·편성·예상), 컬러 = 생산 캘린더(작업지시·계획 편성)
    const CG = D.cg_calendar || {}, CC = D.cc_calendar || {};
    const KO = { 확정: 0, 작업지시: 0, 작업대기량: 0, 작업대기: 0, 편성: 1, 지시대기: 1, 예상: 2, '부자재 입고대기': 2, '계획 편성': 3, 계획편성: 3 };   // 11/5 컬러 캘린더 구분명(작업대기량·지시대기·부자재 입고대기·계획편성) 추가
    const conDay = (d) => ['1CGL', '2CGL', '1CCL', '2CCL', '3CCL', '4CCL'].filter((ln) => CT.inScope(/CGL/.test(ln) ? 'G' : 'C')).map((ln) => {
      const pl = /CGL/.test(ln) ? 'G' : 'C', src = pl === 'G' ? CG : CC, cell = ((src.lines || {})[ln] || []).find((x) => x.d === d);
      if (!cell) return `<tr class="cd-h"><td colspan="9"><b>${ln}</b> <span class="cd-s">생산 캘린더에 ${md(d)} 칸 없음(${md(src.asOf)} 기준)</span></td></tr>`;
      const by = new Map();
      for (const it of cell.items || []) {
        const k = it.con ? `${it.kind}|${it.con}` : `${it.kind}|${it.grp}`;
        if (!by.has(k)) by.set(k, Object.assign({}, it, { t: 0 }));
        by.get(k).t += it.t || 0;
      }
      const rows = [...by.values()].sort((a, b) => (KO[a.kind] ?? 9) - (KO[b.kind] ?? 9) || String(a.start || a.seq || '').localeCompare(String(b.start || b.seq || '')) || b.t - a.t);
      const tot = rows.reduce((a, x) => a + x.t, 0), kinds = {}; for (const x of rows) kinds[x.kind] = (kinds[x.kind] || 0) + x.t;
      const head = `<tr class="cd-h"><td colspan="9"><b>${ln}</b>${pl === 'G' && cell.fam ? ` <span class="cd-f">${esc(cell.fam)}</span>` : ''}${cell.event ? ` <span class="cd-e">${esc(cell.event)}</span>` : ''}`
        + ` <span class="cd-s">${cell.stop ? '정지' : `${n0(tot)}t · ${Object.entries(kinds).map(([k, v]) => `${k} ${n0(v)}`).join(' · ')}`}${cell.cap ? ` · 능력 ${n0(cell.cap)}t` : ''}${pl === 'C' && (cell.planItems || []).length ? ` · 품명 ${cell.planItems.map((p_) => `${p_[0]} ${n0(p_[1])}t`).join(' · ')}` : ''}</span></td></tr>`;
      if (!rows.length) return head + `<tr><td colspan="9" class="cd-none">${cell.why ? esc(cell.why) : '배정된 계약 없음'}</td></tr>`;
      return head + rows.map((x) => `<tr><td class="nw"><span class="cd-k k${KO[x.kind] ?? 9}">${esc(x.kind)}</span></td><td class="id">${x.con ? esc(x.con) : '<span class="cd-s">주문 연결 전</span>'}</td>`
        + `<td class="nw">${esc(x.grp || '')}</td><td class="w">${esc([x.cus, x.dst].filter(Boolean).join(' · ') || (pl === 'C' && !x.con ? '판매그룹 편성 물량(주문 연결 전)' : ''))}</td>`
        + `<td class="nw">${esc(pl === 'G' ? [x.fam, x.grade].filter(Boolean).join(' ') : [x.item, x.color].filter(Boolean).join(' · '))}</td>`
        + `<td class="r nw">${x.thk != null ? `${(+x.thk).toFixed(2)}×${n0(x.wdt)}` : ''}</td><td class="r"><b>${n1(x.t)}</b></td>`
        + `<td class="nw">${x.due ? `납기 ${md(x.due)}` : ''}${x.need ? ` · 필요 ${md(x.need)}` : ''}</td><td class="nw">${esc(x.start || '')}</td></tr>`).join('');
    }).join('');
    const conSec = view === 'day' ? (() => {
      const d0 = asOf, d1 = addD(asOf, 1);
      const tbl = (d) => `<div class="ct-wrap cd-wrap" data-d="${d}"${d === d0 ? '' : ' hidden'}><table class="ct-t cd-t"><thead><tr><th>구분</th><th>주문번호</th><th>판매그룹</th><th>고객사 · 목적지</th><th>강종 · 사양</th><th class="r">두께×폭</th><th class="r">톤</th><th>납기 · 필요일</th><th>시작</th></tr></thead><tbody>${conDay(d)}</tbody></table></div>`;
      return `<section class="card"><h2>오늘·내일 라인별 생산 계약 <small>생산 캘린더 ${md(CG.asOf || CC.asOf)} 기준 · 확정·작업지시 = 현장 지시, 편성 = 소재 있는 주문, 예상 = 2주 안 입고 소재, 계획 편성 = 컬러 판매그룹 편성(주문 연결 전)</small></h2>`
        + `<div class="seg ct-seg cd-seg" role="group"><button type="button" data-d="${d0}" aria-pressed="true">오늘 ${md(d0)}(${wd(d0)})</button><button type="button" data-d="${d1}" aria-pressed="false">내일 ${md(d1)}(${wd(d1)})</button></div>${tbl(d0)}${tbl(d1)}</section>`;
    })() : '';

    // ⑤ 기간 전망: 당일(오늘·내일) · 7일(일별) · 30일(주별)
    const days = view === 'day' ? [asOf, addD(asOf, 1)] : Array.from({ length: diff(p1, p0) + 1 }, (_, i) => addD(p0, i));
    const gT = {}, cT = {};
    for (const r of L.rows || []) if (days.includes(r[0])) gT[r[0]] = (gT[r[0]] || 0) + (+r[4] || 0);
    for (const x of W.color || []) if (days.includes(x.d) && !x.act) cT[x.d] = (cT[x.d] || 0) + Object.values(x.g || {}).reduce((a, v) => a + v, 0);
    const ev = {}; for (const e of ((P.week || {}).events || [])) if (days.includes(e.d) && CT.inScope(e.pl)) (ev[e.d] = ev[e.d] || []).push(e.text);
    const buckets = view === 'month' ? Object.values(days.reduce((m, d) => ((m[CT.wed(d)] = m[CT.wed(d)] || []).push(d), m), {})) : days.map((d) => [d]);   // 월간 = 수요일 시작 주로 끊음(월 경계에서 자름)
    // 11/10 점검: 지난 날 = MES 실적(도금 칸에 재계획의 실적 행, 컬러 0 이던 것), 같은 일정이 주 칸에 날마다 반복되던 것 → 한 번(기간)
    const actPl = (pl, d) => (P.lines || []).filter((x) => x.pl === pl).reduce((a, x) => a + (actOn(x, d) || 0), 0);
    const pastD = (d) => d < asOf;
    const fRow = (ds) => {
      const o = open.filter((x) => ds.includes(x.needProd)), r = o.filter((x) => x.risk === '위험' && !pastD(x.needProd));
      const sum = (pl, m) => ds.reduce((a, d) => a + (pastD(d) ? actPl(pl, d) : m[d] || 0), 0);
      const eg = new Map(); for (const d of ds) for (const t of ev[d] || []) { const z = eg.get(t) || [d, d]; z[1] = d; eg.set(t, z); }
      const es = [...eg.entries()].map(([t, [a, b]]) => (ds.length > 1 && a !== b ? `${t}(${md(a)}~${md(b)})` : t));
      const allPast = ds.every(pastD), somePast = ds.some(pastD);
      const lbl = ds.length > 1 ? `${md(ds[0])}~${md(ds[ds.length - 1])}` : `${md(ds[0])} <small class="ct-wd">${wd(ds[0])}${ds[0] === asOf ? ' · 오늘' : ''}</small>`;
      const tag = allPast ? ' <small class="ct-wd">실적</small>' : somePast ? ' <small class="ct-wd">실적+계획</small>' : '';
      return `<tr><td class="nw"><b>${lbl}</b>${tag}</td>${CT.inScope('G') ? `<td class="r">${n0(sum('G', gT))}</td>` : ''}${CT.inScope('C') ? `<td class="r">${n0(sum('C', cT))}</td>` : ''}<td class="r">${o.length ? `${o.length}건 · ${n0(T(o))}t` : '-'}</td><td class="r">${r.length ? `<b class="ct-neg">${r.length}</b>` : allPast ? '<span class="ct-wd">지남</span>' : '-'}</td><td class="w">${esc(es.slice(0, 3).join(' · '))}${es.length > 3 ? ` 외 ${es.length - 3}` : ''}</td></tr>`;
    };
    const fc = `<table class="ct-t ct-fc"><thead><tr><th>${view === 'month' ? '주(수~화)' : '날짜'}</th>${CT.inScope('G') ? '<th class="r">도금 t</th>' : ''}${CT.inScope('C') ? '<th class="r">컬러 t</th>' : ''}<th class="r">생산 필요 주문</th><th class="r">지연 예상</th><th>주요 일정</th></tr></thead><tbody>${buckets.map(fRow).join('')}</tbody></table>`;

    // ⑥ (접힘) 수주 이행 흐름 — 도금·컬러 따로, 출하 확인 불가 분리
    const flow = (pl, nm) => {
      const os = M.all.filter((o) => o.pl === pl);
      if (!os.length || !CT.inScope(pl)) return '';
      const op = os.filter((o) => !o.closed), F = (f) => os.filter((o) => o.ful === f).length;
      const cells = [
        ['수주 진행', `${n0(T(op))}<small>t 잔량</small>`, `${op.length}건`],
        ['소재 확보', `${n0(op.filter((o) => o.matSt === '확보' || o.matSt === '재고 있음').length)}<small>건</small>`, `미확보 <b class="bad">${op.filter((o) => o.matSt !== '확보' && o.matSt !== '재고 있음').length}</b>건`],
        ['생산 중', `${n0(F('생산 중'))}<small>건</small>`, `생산 전 ${F('생산 전')}건`],
        ['생산 완료', `${n0(F('출하 확인 불가') + F('부분 출하') + F('생산 완료') + F('출하 완료'))}<small>건</small>`, `생산 ${n0(os.reduce((a, o) => a + Math.min(o.prodT || 0, o.ordT || 0), 0))}t`],
        ['출하', `${n0(F('출하 완료'))}<small>건 완료</small>`, `부분 ${F('부분 출하')} · <b class="bad">출하 실적 없음 ${F('출하 확인 불가')}</b>건`],
      ];
      return `<div class="ct-flh">${nm} <small>${pl === 'G' ? `납기 −30~+90일 주문 · ${md(M.cgAt)}` : `${M.ccLines.join('·')} 작업지시대상 · ${md(M.ccAt)}`}</small></div><div class="ct-flow">${cells.map(([l, v, s]) => `<div class="ct-fs"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>`;
    };
    const why = {}; for (const o of nd) why[o.dataWhy || '기타'] = (why[o.dataWhy || '기타'] || 0) + 1;
    const exc = Object.entries(why).map(([k, v]) => `${k} ${v}건`).concat(badSrc.map((x) => `${x.name} ${x.tip}`));
    const gOpen = open.filter((o) => o.pl === 'G').length, cOpen = open.filter((o) => o.pl === 'C').length;
    const cnt = [CT.inScope('G') ? `도금 진행 ${gOpen}건` : '', CT.inScope('C') ? `컬러 진행 ${cOpen}건` : '', `출하 실적 없음 ${noShip.length}건`].filter(Boolean).join(' · ');

    const main = document.getElementById('ct-main');
    main.innerHTML = basis
      + `<div class="ct-bar"><span class="ct-note"><b>${({ day: '금일 현황', week: '7일 전망', month: '월간 전망' })[view]}</b> · ${pLbl} · ${SCN}</span><a class="ct-note" href="board.html">상세 관제판 →</a></div>`
      + CT.kpis(K)
      + lineSec
      + grpSec
      + (view === 'day' ? conSec : `<section class="card"><h2>${view === 'day' ? '오늘·내일' : view === 'week' ? '이번 주' : `${+asOf.slice(5, 7)}월`} 생산 계획 <small>${pLbl} · 지난 날 = 실적, 오늘부터 = 계획 · 생산 필요일이 그날인 주문${view === 'month' ? ' · 수요일 시작 주 단위' : ''}</small></h2><div class="ct-wrap">${fc}</div></section>`)
      + `<section class="card"><h2>우선 조치 10건 <small>납기 지연 예상 → 마감 빠른 순</small></h2>${actTbl}</section>`
      + `<details class="card ct-fold"><summary><h2>주문 진행 현황 <small>${cnt}</small></h2></summary>${flow('G', '도금')}${flow('C', '컬러')}</details>`
      + (exc.length ? `<details class="card ct-fold"><summary><h2>자료 확인 필요 <small>${exc.length}종 · ${nd.length}건</small></h2></summary><ul class="ct-ul">${exc.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : '');

    const open1 = (a) => {
      if (a.os) {
        const os = a.os.slice().sort(CT.riskSort);
        CT.panel(`<p class="ct-note">${esc(a.dept || '')} · 마감 ${md(a.last) || '-'} · <a href="ct_orders.html#risk">수주·납기에서 보기</a></p><table class="ct-t"><thead><tr><th>문제</th><th>주문</th><th>진행 단계</th><th class="r">잔량</th><th>마감</th></tr></thead><tbody>${os.map((o, j) => `<tr class="ck" tabindex="0" data-j="${j}"><td class="nw">${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.item)}</small></td><td>${CT.fulBadge(o.ful)}</td><td class="r">${n1(o.remT)}</td><td class="nw">${md(o.last) || '-'}</td></tr>`).join('')}</tbody></table>`, `${a.type} · ${a.grp || ''}`,
          (p) => { p.querySelectorAll('tr.ck').forEach((r) => r.onclick = () => { const o = os[+r.dataset.j]; CT.panel(CT.orderDetail(o), o.id); }); CT.keyRows(p); });
      } else if (a.href) location.href = a.href;
    };
    main.querySelectorAll('.cd-seg button').forEach((bt) => bt.onclick = () => { main.querySelectorAll('.cd-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === bt))); main.querySelectorAll('.cd-wrap').forEach((w) => { w.hidden = w.dataset.d !== bt.dataset.d; }); });
    main.querySelectorAll('tr.ck').forEach((tr) => tr.onclick = () => open1(top[+tr.dataset.i]));
    CT.keyRows(main);
  }

  // 조치 상태(공유 저장소 t:'issue') — 불러오면 상태 칸만 갱신
  function loadState() {
    CT.store.events().then((evs) => {
      ST = CT.issueState(evs);
      document.querySelectorAll('#ct-main .ct-new[data-id]').forEach((s) => { s.textContent = ST[s.dataset.id] || '신규'; });
    }).catch(() => { /* 저장소 못 읽으면 '신규' 유지 */ });
  }
  CT.onView(() => DATA && render(DATA));
  CT.boot(FILES, (D) => { render(D); loadState(); });
})();
