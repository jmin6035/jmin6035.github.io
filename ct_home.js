/* 01 통합 관제(11/4 2차 진단 4장): 10초 안에 위험 인지, 30초 안에 우선 조치 결정
   기간 = 화면 안 단추(11/11 회의: 하위 화면 셋 → 한 화면) — #day 금일 · #week 수요일 시작 7일 · #month 이번 달(주소 그대로 열림). KPI 6 · 조치 TOP10 + 공정별 상태 · 기간 전망 · (접힘) 수주 이행 흐름·자료 예외 */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD, diff } = CT;
  const PER = { day: 1, week: 7, month: 30 };
  const FILES = ['portal.enc.json', 'latest.plan.enc.json', 'plan_prev.enc.json', 'integrated.enc.json', 'mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'cc_calendar.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json', 'risk.enc.json'];
  let DATA = null, ST = {};
  const WD = '일월화수목금토', wd = (d) => WD[new Date(d + 'T00:00:00Z').getUTCDay()];

  /* 11/12 사용자 '금일·7일·월간 합치라고 녹음에 있다': 기간 단추로 바꾸는 대신 한 화면 — 기간마다 다른 숫자(납기 위험·생산 진도·출하 미달)는 카드 안에 금일·7일·월간 나란히,
     나머지(그룹별 납기 위험·라인 진도·생산 계획)는 이번 달 기준 + 오늘·내일 생산 계약 접기 */
  function render(D, vOverride, dry) {
    if (!dry) DATA = D;
    const view = vOverride || 'month', per = PER[view];
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
    const open = M.all.filter((o) => CT.isOpen(o) && !CT.isStale(o) && CT.inScope(o.pl));   // 종결 확인 필요(납기 60일+ 미종결) 제외(11/8)
    const inWin = (o) => inP(o.last || o.needProd);
    const risk = open.filter((o) => o.risk === '위험' && inWin(o)), warn = open.filter((o) => o.risk === '주의' && inWin(o)), nd = open.filter((o) => o.risk === '판정 불가');
    const overdue = open.filter((o) => (o.risk === '위험' || o.risk === '주의') && (o.last || o.needProd) && (o.last || o.needProd) < asOf);
    const T = (xs) => xs.reduce((a, o) => a + (o.remT || 0), 0);
    const SCN = ({ all: '전체', G: '도금', C: '컬러' })[CT.scope()];

    // ① 자료 상태(맨 아래 기준 접기 · 문제 있으면 맨 위 한 줄)
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

    // ② 핵심 지표 6 — 납기·소재·생산 차질 우선
    const lines = (P.lines || []).filter((x) => CT.inScope(x.pl));
    const cg = (P.groups || []).filter((g) => g.pl === 'C' && g.prod && CT.inScope('C'));
    const gl = lines.filter((x) => x.pl === 'G');
    const cgP = gl.reduce((a, x) => a + (x.sched || 0), 0), cgA = gl.reduce((a, x) => a + (x.actual || 0), 0);
    const ccP = cg.reduce((a, g) => a + Math.max(0, (g.prod.month || 0) - (g.prod.after || 0)), 0), ccA = cg.reduce((a, g) => a + (g.prod.actual || 0), 0);
    const pct = (a, p) => (p ? Math.round(a / p * 100) : null);
    const tone = UI.rate;   // 달성률 색 = 공통 기준(ui/shell.js UI.rate: 98% 이상 ok · 90% 이상 warn · 그 아래 bad)
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
    if (view === 'month') { plan = cgP + ccP; act = cgA + ccA; prSub = `실적 ${n0(act)} / 일정 누계 ${n0(plan)}t`; }
    else {
      const ok = perLine.filter((r) => r.p != null);
      plan = ok.reduce((a, r) => a + r.p, 0); act = ok.reduce((a, r) => a + r.a, 0);
      const dd = [...new Set(perLine.flatMap((r) => r.ds || []))].sort();
      prSub = dd.length ? `${dd.length > 1 ? `${md(dd[0])}~${md(dd[dd.length - 1])}` : md(dd[0])} 도금 ${n0(act)} / 계획 ${n0(plan)}t` : `${pLbl} 실적 집계 전`;
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
    const GSH = { 도금판매: 'G국내', 도금수출: 'G수출', 자동차강판: 'G자동차', 컬러수출: 'C수출', 컬러건재: 'C건재' };
    const shipOf = (x) => {
      if (view === 'month') { const g = (P.groups || []).find((q) => q.key === GSH[x.name]), S = g && g.ship; return S ? { n: x.name, p: S.due != null ? S.due : S.sched || 0, a: S.actual || 0 } : { n: x.name, p: x.sched || 0, a: x.actual || 0 }; }   // 11/11: 월간 = 판매그룹 관제판과 같은 기준선(그룹 출하 실적 패턴)
      const g = SK[x.name], ds = [];
      for (let d = view === 'day' ? (SD.asOf || asOf) : p0; d <= (view === 'day' ? (SD.asOf || asOf) : p1) && d <= (SD.asOf || ''); d = addD(d, 1)) ds.push(d);
      const p = ds.reduce((a, d) => a + (((RO.out || {})[g] || [])[diff(d, RO.d0)] || 0), 0), a = ds.reduce((s_, d) => s_ + (((SD.g || {})[g] || {})[d] || 0), 0);
      return { n: x.name, p, a, ds };
    };
    const shp = ship.map(shipOf), shipDays = [...new Set(shp.flatMap((x) => x.ds || []))].sort();
    const shipGap = shp.reduce((a, x) => a + Math.max(0, x.p - x.a), 0), shipBad = shp.filter((x) => x.p - x.a > 0.5);
    const shA = shp.reduce((a, x) => a + x.a, 0), shP = shp.reduce((a, x) => a + x.p, 0);
    const shipSub = view !== 'month' && !shipDays.length ? `${pLbl} 출하 실적 집계 전(전날까지)` : `${view === 'month' ? `실적 ${n0(shA)} / 기준 ${n0(shP)}t` : `${shipDays.length > 1 ? `${md(shipDays[0])}~${md(shipDays[shipDays.length - 1])}` : md(shipDays[0])} 실적 ${n0(shA)} / 계획 ${n0(shP)}t`}${shipBad.length ? ` · 미달 ${shipBad.map((x) => x.n).join('·')}` : ''}`;
    const noShip = open.filter((o) => o.ful === '출하 확인 불가');
    const past = overdue;
    // 11/10 사용자: 납기 위험은 한 곳(risk.enc.json — 납기 위험 화면과 같은 숫자). 전체 먼저 → 그룹별 문제(계약 나열 대신)
    const RK = D.risk || null, rsc = (window.UI && UI.scope ? UI.scope() : 'all'), RKT = RK ? (RK.tot[rsc] || RK.tot.all) : null;
    const RKG = RK ? RK.groups.filter((g) => (rsc === 'all' || g.pl === rsc) && g.risk >= 0.5).sort((a, b) => b.risk - a.risk) : [];
    const rkBar = (g) => `<div class="hm-st">${[['ok', 'var(--good)'], ['warn', '#c9a227'], ['will', '#e07b39'], ['past', 'var(--bad)'], ['stale', '#9aa5b1']].map(([k, c]) => (g[k] > 0 ? `<i style="flex:${g[k]};background:${c}"></i>` : '')).join('')}</div>`;
    // 11/11 사용자 '주요 원인 더 잘 보이게': 원인 이름 칩 · 톤 굵게 · 언제 풀리나(다음 생산일·입고 예정일) 칸으로 나눔 — 원인 2개까지(ui/ctl.js UI.causeHtml, 관제판과 같은 모양)
    const rkLeg = `<span class="hm-lg">${[['var(--good)', '정상'], ['#c9a227', '점검'], ['#e07b39', '지연 예상'], ['var(--bad)', '납기 지남'], ['#9aa5b1', '종결 확인']].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</span>`;
    const rkTbl = RK ? `<div class="ct-wrap"><table class="ct-t hm-rk"><colgroup><col style="width:92px"><col style="width:88px"><col style="width:150px"><col style="width:84px"><col style="width:60px"><col></colgroup><thead><tr><th>그룹</th><th class="r">미결</th><th>상태</th><th class="r">위험</th><th class="r">비율</th><th>주요 원인 <small>· 언제 풀리나</small></th></tr></thead><tbody>${RKG.slice(0, 9).map((g) => { const tn = UI.riskTone(g.risk, g.t); return `<tr onclick="location.href='risk.html'" style="cursor:pointer"><td class="nw"><span class="cdot ${tn}"></span><b>${esc(g.g)}</b></td><td class="r">${n0(g.t)}t</td><td>${rkBar(g)}</td><td class="r"><b class="${tn}">${n0(g.risk)}t</b></td><td class="r"><b class="${tn}">${Math.round(g.risk / g.t * 100)}%</b></td><td class="hm-w">${g.cz ? UI.causeHtml(RK, g.cz, 2, 2) : esc(g.msg)}</td></tr>`; }).join('') || '<tr><td colspan="6">위험 없음</td></tr>'}</tbody></table></div>` : null;
    // 새 양식(?ui=v2, 11/12): 그룹 = 공통 순서(도금 → 컬러 → 수요개발), 칸 = 그룹 | 미결 | 위험 | 비율 | 주요 원인(1개) | 언제 풀리나 — 나머지 원인은 줄 눌러 펼침. 상태 막대·원인 칩 없음
    const V2 = !!(window.UI && UI.v2);
    const RKNM = { 자가재: '도금 자가재', 건재수출: '컬러건재수출', 가전수출: '컬러가전수출', 가전내수: '컬러가전내수' };
    const RKO = ['도금수출', '도금국내', '자동차', '자가재', '건재수출', '가전수출', '가전내수', '컬러건재', '수요개발'];
    const rkTbl2 = RK && V2 ? (() => {
      const oi = (g) => { const i = RKO.indexOf(g.g); return i < 0 ? (g.pl === 'G' ? 50 : 80) : i; };
      const gs = RK.groups.filter((g) => (rsc === 'all' || g.pl === rsc) && g.t >= 0.5).sort((a, b) => oi(a) - oi(b));
      const cn = (c) => (RK.causeNm || {})[c] || c;
      const when = (it) => { const w = (it || []).filter((x) => x[0] && x[1] >= 0.5)[0]; return !w ? '–' : w[3] ? esc(w[0]) : `<span class="k2-m0">${esc(w[0])}</span>`; };   // 날짜 없는 몫(입고 예정일 지남·적합 소재 없음 등)은 회색   // 가장 큰 몫이 풀리는 때(다음 생산일·입고 예정일)
      const itTip = (it) => (it || []).filter((x) => x[0] && x[1] >= 0.5).map((x) => `${x[0]} ${n0(x[1])}t · ${x[2]}건`).join('\n');
      const row = (g, i) => {
        const tn = UI.riskTone(g.risk, g.t), cz = (g.cz || []).filter((z) => z[1] >= 0.5), z = cz[0], has = g.risk >= 0.5;
        const det = cz.map((y, j) => `<div class="k2-dr"><b>${esc(cn(y[0]))}</b><span class="n">${j ? `${n0(y[1])}t` : ''}</span><span>${esc((y[4] || []).filter((x) => x[0] && x[1] >= 0.5).slice(0, 4).map((x) => `${x[0]} ${n0(x[1])}t`).join(' · '))}</span><span class="k2-dd">${esc((RK.dept || {})[y[0]] || '')}</span></div>`).join('');
        return `<tr class="k2-rk${cz.length ? ' ck' : ''}" data-r="${i}" tabindex="0" title="${esc(cz.length ? '눌러서 원인 전체 보기' : '')}"><td><span class="k2-car">${cz.length ? '▸' : ''}</span><b>${esc(RKNM[g.g] || g.g)}</b></td><td class="n">${n0(g.t)}t</td><td class="n"><b class="${has ? tn : ''}">${n0(g.risk)}t</b></td><td class="n">${g.t ? Math.round(g.risk / g.t * 100) : 0}%</td>`
          + `<td>${z ? `<span title="${esc((RK.causeDef || {})[z[0]] || '')}">${esc(cn(z[0]))}</span> <b class="k2-t">${n0(z[1])}t</b>${cz.length > 1 ? ` <span class="k2-m">외 ${cz.length - 1}</span>` : ''}` : '–'}</td><td title="${esc(z ? itTip(z[4]) : '')}">${z ? when(z[4]) : '–'}</td></tr>`
          + (cz.length ? `<tr class="k2-det" data-r="${i}" hidden><td colspan="6">${det}<a class="k2-go" href="risk.html">납기 위험 화면에서 주문 보기 →</a></td></tr>` : '');
      };
      return `<div class="ct-wrap"><table class="ct-t k2-rkt"><colgroup><col style="width:170px"><col style="width:110px"><col style="width:110px"><col style="width:80px"><col style="width:330px"><col></colgroup><thead><tr><th>그룹</th><th class="n">미결</th><th class="n">위험</th><th class="n">비율</th><th>주요 원인</th><th>언제 풀리나</th></tr></thead><tbody>${gs.map(row).join('') || '<tr><td colspan="6">미결 주문 없음</td></tr>'}</tbody></table></div>`;
    })() : null;
    const K = [
      RKT ? { label: '납기 위험', v: n0(RKT.will + RKT.past), unit: 't', sub: `미결 ${n0(RKT.t)}t 중 ${RKT.t ? Math.round((RKT.will + RKT.past) / RKT.t * 100) : 0}% · 납기 지남 ${n0(RKT.past)} · 지연 예상 ${n0(RKT.will)}`, tone: RKT.will + RKT.past >= 0.5 ? 'bad' : 'ok', href: 'risk.html' }
        : { label: '납기 지연 예상', v: n0(risk.length), unit: '건', sub: `${n0(T(risk))}t · 점검 ${warn.length}건 · 이미 지난 ${n0(overdue.length)}건 별도`, tone: risk.length ? 'bad' : 'ok', href: 'risk.html' },
      { label: '소재 부족', v: n0(lateSum), unit: 't', sub: lateM.length ? `발주 마감 지난 부족 ${lateM.length}종(${lateM.slice().sort((x, y) => (y.lateT || 0) - (x.lateT || 0)).slice(0, 3).map((m) => esc(m.name)).join('·')})` : '발주 마감 지난 부족 없음', tone: lateSum >= 0.5 ? 'bad' : mats.length ? 'warn' : 'ok', href: 'matcal.html#mt-orders' },   // 11/10 점검(F13): 소재 부족 = 마감 지난 부족(lateT)만 — 월간 55,518t(3달 합)·금일 0t(기간 안 시작만)이던 것 → 모든 소재 화면 공통값
      { label: view === 'day' ? '어제 생산 진도' : '생산 진도율', v: pr == null ? '-' : pr, unit: pr == null ? '' : '%', sub: prSub + (lag.length ? ` · 미달 ${lag.map((x) => `${x.line} −${n0(x.gap)}t`).join(' · ')}` : ''), tone: tone(pr), href: 'ct_prod.html#perf' },   // 11/11: '생산 미달' 카드를 여기 합침(같은 실적·계획)
      { label: '출하 미달', v: n0(shipGap), unit: 't', sub: shipSub, tone: shipGap > 500 ? 'bad' : shipGap > 0.5 ? 'warn' : 'ok', href: 'ct_prod.html#ship' },
      { label: '자료 확인 필요', v: n0(nd.length), unit: '건', sub: `출하 실적 없음 ${noShip.length}건 별도`, tone: nd.length ? 'warn' : 'ok', href: 'ct_orders.html#risk' },
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
    for (const m of mats) acts.push({ id: CT.issueId('mat|' + m.key), risk: m.st === 'late' ? '위험' : '주의', type: '소재 발주', what: m.st === 'late' ? `${m.name} 마감 지남 ${n0(m.lateT)}t` : `${m.name} 부족 ${n0(m.short)}t · ${md(m.first)}부터`, t: m.st === 'late' ? m.lateT : m.short, last: m.deadline, dept: CT.DEPT.mat, href: 'matcal.html#mt-orders' });   // 11/9: 마감 지남 = matLate 몫
    for (const x of (P.exceptions || []).filter((x) => (x.lvl === 'bad' || x.lvl === 'warn') && !CT.idleSkip(D, x.text))) {   // 계획 휴지 라인 경보 제외(11/8)
      if (!CT.inScope(/도금/.test(x.area) ? 'G' : /컬러/.test(x.area) ? 'C' : 'all')) continue;
      acts.push({ id: CT.issueId('exc|' + x.text), risk: x.lvl === 'bad' ? '위험' : '주의', type: x.area, what: x.text, t: null, last: null, dept: x.who, href: x.link });
    }
    acts.sort((a, b) => (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || String(a.last || '9').localeCompare(String(b.last || '9')) || (b.t || 0) - (a.t || 0));
    const top = acts.slice(0, 10);
    const left = (d) => (d == null ? '-' : diff(d, asOf) < 0 ? `<b class="ct-neg">${md(d)} · ${-diff(d, asOf)}일 지남</b>` : `${md(d)} <small class="ct-dd">${diff(d, asOf) ? `D-${diff(d, asOf)}` : '오늘'}</small>`);
    const stCell = (a) => `<span class="ct-new" data-id="${a.id}">${esc(ST[a.id] || '신규')}</span>`;
    const actTbl = top.length ? `<div class="ct-wrap"><table class="ct-t"><colgroup><col style="width:150px"><col><col style="width:84px"><col style="width:136px"><col style="width:108px"><col style="width:72px"></colgroup><thead><tr><th>무엇이 문제</th><th>대상</th><th class="r">물량 t</th><th>조치 마감</th><th>조치 부서</th><th>진행</th></tr></thead><tbody>${top.map((a, i) => `<tr class="ck" tabindex="0" data-i="${i}"><td class="nw">${CT.badgeT(a.risk, a.type)}</td><td class="w">${esc(a.what)}</td><td class="r">${a.t == null ? '' : n0(a.t)}</td><td class="nw">${left(a.last)}</td><td class="nw">${esc(a.dept || '')}</td><td class="nw">${stCell(a)}</td></tr>`).join('')}</tbody></table></div>${acts.length > 10 ? `<p class="ct-note">상위 10건 / 전체 ${acts.length}건 · <a href="ct_issue.html#now">이슈·조정에서 전체 보기</a></p>` : ''}` : '<p class="ct-note">기간 안 조치 대상 없음</p>';

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
      let big, bigU = '%', sub, max, act, mark, markL, diffT = null, tn = '', mpV = null, elV = null;
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
          big = mp ? Math.round(act / mp * 100) : null; diffT = act - mark; mpV = mp; elV = el;
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
          sub = `${md(lf)} 실적 ${n0(act)}t${pDone != null ? ` / 계획 ${n0(pDone)}t` : ''}`;
        } else {
          mark = pDone || 0; max = Math.max((pDone || 0) + pFut, act + pFut); markL = '지난 날 계획';
          big = done.length && pDone ? Math.round(act / pDone * 100) : null; diffT = done.length && pDone != null ? act - pDone : null; tn = tone(big);
          sub = done.length ? `실적 ${n0(act)}t(${md(done[0].d)}~${md(done[done.length - 1].d)})${pDone != null ? ` / 계획 ${n0(pDone)}t` : ''} · 남은 계획 ${n0(pFut)}t` : `실적 집계 전 · 이번 주 계획 ${n0(pFut)}t`;
        }
        if (big == null && !(view === 'week' && !done.length)) { big = n0(act); bigU = 't'; }
      }
      const stopDays = x.pl === 'C' ? Array.from({ length: ndays }, (_, i) => `${mon}-${String(i + 1).padStart(2, '0')}`).filter((d) => (cdown[`${x.line}|${d}`] || 0) >= 1380).length : 0;
      const foot = x.pl === 'G' ? `현재 ${x.fam || '-'}${x.next ? ` · 다음 ${md(x.next[0])} ${x.next[1]}` : ''}` : `${+mon.slice(5)}월 계획 휴지 ${stopDays}일`;
      return { x, dd, status, big, bigU, sub, max, act, mark, markL, diffT, tn, foot, mpV, elV };
    });
    const bar = (r) => {
      if (!r.max || r.mark == null) return `<div class="ln-bar e"><span>${!r.max ? '계획 없음' : '일 계획 기록 없음 · 진도는 월간'}</span></div><div class="ln-bl"><span></span><span></span></div>`;
      const w = Math.min(100, r.act / r.max * 100), m = r.mark != null ? Math.min(100, r.mark / r.max * 100) : null;
      return `<div class="ln-bar"><i class="${r.tn}" style="width:${w.toFixed(1)}%"></i>${m != null && r.mark > 0 ? `<em style="left:${m.toFixed(1)}%" title="${esc(r.markL)} ${n0(r.mark)}t"></em>` : ''}</div>`
        + `<div class="ln-bl"><span>${r.mark != null && r.mark > 0 ? `▼ ${esc(r.markL)} ${n0(r.mark)}t` : ''}</span><span>${n0(r.max)}t</span></div>`;
    };
    // 일별 생산 그래프(11/5 사용자 '성의 없는 그래프' → 축·눈금·날짜·값·범례가 있는 막대): HTML 막대라 글자 크기가 화면 폭과 무관
    const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
    const nC = LN.filter((r) => r.x.pl === 'C').length;
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
        const narrow = r.x.pl === 'C' && nC > 2;   // 11/11: 컬러 4라인 한 줄 — 좁은 카드는 1일·오늘·말일만
        const showD = !many || z.d === asOf || ((dn === 1 || (!narrow && dn % 5 === 0) || i === n - 1) && (ti < 0 || Math.abs(i - ti) > (narrow ? 3 : 1)));
        const off = (z.past ? z.stop : !z.p) && (rest(z.d) || (!z.past && r.x.pl === 'G'));
        const inP = view === 'month' || (view === 'day' ? z.d === lastFull(r.x) : z.d >= p0 && z.d <= p1);
        return `<div class="ch-c${z.d === asOf ? ' today' : ''}${z.past ? '' : ' fut'}${inP && view !== 'month' ? ' sel' : ''}${off ? ' off' : ''}" title="${esc(tip)}"><div class="ch-v${lo ? ' lo' : ''}">${many ? '' : val}</div><div class="ch-b">${body}</div>`
          + `<div class="ch-x">${showD ? `${+z.d.slice(5, 7)}/${+z.d.slice(8)}<small>${z.d === asOf ? '오늘' : wd(z.d)}</small>` : ''}</div></div>`;
      }).join('');
      return `<div class="ch${many ? ' many' : ''}"><div class="ch-in">${grid}<div class="ch-cols" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${cols}</div></div></div>`;
    };
    // 11/10: 범례는 라인 카드마다(6번) 말고 '라인별 진도' 머리 아래 한 번
    const leg = `<div class="ch-leg"><span><b class="k a"></b>실적</span><span><b class="k lo"></b>계획 95% 미만</span><span><b class="k p"></b>그날 계획</span><span><b class="k f"></b>앞으로 계획</span>${RUN ? '<span><b class="k r"></b>오늘 진행 중</span>' : ''}<span><b class="k o"></b>휴지·정비</span><span class="u">단위 t</span></div>`;
    const runLine = (r) => {                                                                      // 오늘 진행분(07시~ 마감 전) — 진도율에는 안 넣고 참고로(11/5 사용자 '화면에 보여줘')
      if (!RUN || RUN.d <= lastFull(r.x)) return '';
      const t = +(RUN.lines || {})[r.x.line] || 0, p = futPlan(r.x, RUN.d);
      const tm = (r.x.pl === 'C' ? RUN.ccUpto : RUN.at) ? `07:00~${r.x.pl === 'C' ? RUN.ccUpto : RUN.at}` : '07시부터';
      return `<div class="ln-run" title="${esc(tm)} · 마감 전(진도율에 넣지 않음)">오늘 진행 중 <b>${n0(t)}t</b>${p ? ` / 계획 ${n0(p)}t` : ''}</div>`;
    };
    const card = (r) => `<a class="ln-c ${r.tn}" href="ct_prod.html#perf"><div class="ln-h"><b>${r.x.line}</b><span class="ln-st ${r.status[1]}">${r.status[0]}</span><span class="ln-big">${r.big == null ? '<small>집계 전</small>' : `${r.big}<small>${r.bigU}</small>`}</span></div>`
      + `<div class="ln-sub">${esc(r.sub)}${r.diffT != null ? ` <b class="${r.diffT >= 0 ? 'pos' : 'neg'}">${sig(r.diffT)}t</b>` : ''}</div>${runLine(r)}${bar(r)}${spark(r)}<div class="ln-ft">${esc(r.foot)}</div></a>`;
    // 새 양식(?ui=v2): 진도 기준은 공장 머리에 한 번, 카드 = 라인·상태·진도율 한 줄 → 실적·기준·차이 세 칸(같은 자리 같은 크기) → 막대·일별 그래프
    const cardV2 = (r) => {
      const C = r.x.pl === 'C' && r.mpV != null;
      const cells = C ? [['실적', `${n0(r.act)}t`], ['월 계획', `${n0(r.mpV)}t`], ['가동일 경과', `${Math.round(r.elV * 100)}%`]]
        : [['실적', `${n0(r.act || 0)}t`], ['기준', r.mark != null ? `${n0(r.mark)}t` : '–'], ['차이', r.diffT != null ? `<span class="${r.diffT < -0.5 ? 'neg' : ''}">${sig(r.diffT)}t</span>` : '–']];
      return `<a class="ln-c k2-lc ${r.tn}" href="ct_prod.html#perf" title="${esc(r.sub)}"><div class="ln-h"><b>${r.x.line}</b><span class="ln-st ${r.status[1]}">${r.status[0]}</span><span class="ln-big">${r.big == null ? '<small>집계 전</small>' : `${r.big}<small>${r.bigU}</small>`}</span></div>`
        + `<div class="k2-lv">${cells.map(([l, v]) => `<span><i>${l}</i><b>${v}</b></span>`).join('')}</div>${runLine(r)}${bar(r)}${spark(r)}<div class="ln-ft">${esc(r.foot)}</div></a>`;
    };
    const plantV2 = (pl, nm) => {
      const rs = LN.filter((r) => r.x.pl === pl); if (!rs.length) return '';
      const pa = rs.reduce((a, r) => a + (r.act || 0), 0), pm = rs.reduce((a, r) => a + (r.mark || 0), 0), hp = pm ? Math.round(pa / pm * 100) : null;
      const basis = pl === 'G' ? '진도 = 실적 ÷ 일정 누계(오늘까지 재계획 일정)' : '진도 = 실적 ÷ 월 계획 · 가동일 경과율과 비교(계획 휴지일 제외)';
      return `<div class="ln-pl"><div class="ln-ph k2-ph"><b>${nm}</b><span>${basis}</span>${hp != null ? `<span class="k2-pt">실적 ${n0(pa)}t · ${pl === 'G' ? '기준' : '경과 기준'} ${n0(pm)}t · <b class="${tone(hp)}">${hp}%</b></span>` : ''}</div><div class="ln-grid n${rs.length}">${rs.map(cardV2).join('')}</div></div>`;
    };
    const plant = (pl, nm) => {
      if (V2 && view === 'month') return plantV2(pl, nm);
      const rs = LN.filter((r) => r.x.pl === pl);
      if (!rs.length) return '';
      const pa = rs.reduce((a, r) => a + (r.act || 0), 0), pm = rs.reduce((a, r) => a + (r.mark || 0), 0), pmax = rs.reduce((a, r) => a + (r.max || 0), 0);
      if (view === 'week' && !pa && !pm) return `<div class="ln-pl"><div class="ln-ph"><b>${nm}</b><span>실적 집계 전 · 이번 주 계획 ${n0(pmax)}t</span></div><div class="ln-grid n${rs.length}">${rs.map(card).join('')}</div></div>`;
      const hp = pm ? Math.round(pa / pm * 100) : null;
      const lbl = view === 'month' ? (pl === 'G' ? '일정 누계' : '가동일 경과 기준') : '계획';
      return `<div class="ln-pl"><div class="ln-ph"><b>${nm}</b><span>실적 ${n0(pa)}t${pm ? ` / ${lbl} ${n0(pm)}t · <b class="${tone(hp)}">${hp}%</b>` : ''}</span></div><div class="ln-grid n${rs.length}">${rs.map(card).join('')}</div></div>`;
    };
    const lineSec = V2 ? `<section class="card ln-sec k2-ls"><h2 title="막대 = 이번 달 실적(▼ 기준), 아래 = 일별 실적과 계획">라인별 진도 <small>${pLbl}</small></h2>${leg}${plant('G', '도금')}${plant('C', '컬러')}</section>` : `<section class="card ln-sec"><h2>라인별 진도 <small>${pLbl} · 공장 → 라인 · 막대 = 기간 실적(▼ 계획), 아래 = 일별 실적과 계획</small></h2>${leg}${plant('G', '도금 공장')}${plant('C', '컬러 공장')}</section>`;

    // ⑤-1 오늘·내일 라인별 생산 계약(11/5 사용자 '오늘 내일 생산계획도 실 계약을 보여줘야'): 도금 = 생산 캘린더(확정·편성·예상), 컬러 = 생산 캘린더(작업지시·계획 편성)
    const CG = D.cg_calendar || {}, CC = D.cc_calendar || {};
    const KO = { 확정: 0, 작업지시: 0, 작업대기량: 0, 작업대기: 0, 편성: 1, 지시대기: 1, 예상: 2, '부자재 입고대기': 2, '계획 편성': 3, 계획편성: 3 };   // 11/5 컬러 캘린더 구분명(작업대기량·지시대기·부자재 입고대기·계획편성) 추가
    const GNM2 = { 수출: '도금수출', 국내: '도금국내', 자가재: '도금 자가재' }, CNM2 = { 건재수출: '컬러건재수출', 가전수출: '컬러가전수출', 가전내수: '컬러가전내수', 주문재: '컬러건재 주문재', 계획재: '컬러건재 계획재' };   // 새 양식 그룹 이름(표시만)
    const conDay = (d) => ['1CGL', '2CGL', '1CCL', '2CCL', '3CCL', '4CCL'].filter((ln) => CT.inScope(/CGL/.test(ln) ? 'G' : 'C')).map((ln) => {
      const pl = /CGL/.test(ln) ? 'G' : 'C', src = pl === 'G' ? CG : CC, cell = ((src.lines || {})[ln] || []).find((x) => x.d === d);
      const CS = V2 ? 7 : 9;
      if (!cell) return `<tr class="cd-h"><td colspan="${CS}"><b>${ln}</b> <span class="cd-s">생산 캘린더에 ${md(d)} 칸 없음(${md(src.asOf)} 기준)</span></td></tr>`;
      const by = new Map();
      for (const it of cell.items || []) {
        const k = it.con ? `${it.kind}|${it.con}` : `${it.kind}|${it.grp}`;
        if (!by.has(k)) by.set(k, Object.assign({}, it, { t: 0 }));
        by.get(k).t += it.t || 0;
      }
      const rows = [...by.values()].sort((a, b) => (KO[a.kind] ?? 9) - (KO[b.kind] ?? 9) || String(a.start || a.seq || '').localeCompare(String(b.start || b.seq || '')) || b.t - a.t);
      const tot = rows.reduce((a, x) => a + x.t, 0), kinds = {}; for (const x of rows) kinds[x.kind] = (kinds[x.kind] || 0) + x.t;
      if (V2) {   // 새 양식: 라인 머리 = 라인·강종·총 톤(구분별 톤은 title), 줄 = 구분 | 주문번호(아래 납기) | 판매그룹 | 고객사·목적지 | 강종·사양 | 두께×폭 | 톤
        const hd = `<tr class="cd-h"><td colspan="7" title="${esc(cell.stop ? '' : Object.entries(kinds).map(([k, v]) => `${k} ${n0(v)}t`).join(' · ') + (cell.cap ? ` · 능력 ${n0(cell.cap)}t` : '') + (pl === 'C' && (cell.planItems || []).length ? ` · 품명 ${cell.planItems.map((p_) => `${p_[0]} ${n0(p_[1])}t`).join(' · ')}` : ''))}"><b>${ln}</b>${pl === 'G' && cell.fam ? ` <span class="k2-fam">${esc(cell.fam)}</span>` : ''}${cell.event ? ` <span class="cd-e">${esc(cell.event)}</span>` : ''}<span class="k2-tot">${cell.stop ? '정지' : `${n0(tot)}t`}</span></td></tr>`;
        if (!rows.length) return hd + `<tr><td colspan="7" class="cd-none">${cell.why ? esc(cell.why) : '배정된 계약 없음'}</td></tr>`;
        return hd + rows.map((x) => `<tr title="${esc([x.need ? `필요 ${md(x.need)}` : '', x.start ? `시작 ${UI.fmtDateTime(x.start)}` : ''].filter(Boolean).join(' · '))}"><td><span class="cd-k k${KO[x.kind] ?? 9}">${esc(x.kind)}</span></td><td class="id">${x.con ? esc(x.con) : '<span class="cd-s">주문 연결 전</span>'}${x.due ? `<small class="k2-sm">납기 ${md(x.due)}</small>` : ''}</td>`
          + `<td>${esc((pl === 'G' ? GNM2 : CNM2)[x.grp] || x.grp || '')}</td><td class="w">${esc([x.cus, x.dst].filter(Boolean).join(' · ') || (pl === 'C' && !x.con ? '판매그룹 편성 물량' : ''))}</td>`
          + `<td>${esc(pl === 'G' ? [x.fam, x.grade].filter(Boolean).join(' ') : [x.item, x.color].filter(Boolean).join(' · '))}</td>`
          + `<td class="n">${x.thk != null ? `${(+x.thk).toFixed(2)}×${n0(x.wdt)}` : ''}</td><td class="n"><b>${n1(x.t)}</b></td></tr>`).join('');
      }
      const head = `<tr class="cd-h"><td colspan="9"><b>${ln}</b>${pl === 'G' && cell.fam ? ` <span class="cd-f">${esc(cell.fam)}</span>` : ''}${cell.event ? ` <span class="cd-e">${esc(cell.event)}</span>` : ''}`
        + ` <span class="cd-s">${cell.stop ? '정지' : `${n0(tot)}t · ${Object.entries(kinds).map(([k, v]) => `${k} ${n0(v)}`).join(' · ')}`}${cell.cap ? ` · 능력 ${n0(cell.cap)}t` : ''}${pl === 'C' && (cell.planItems || []).length ? ` · 품명 ${cell.planItems.map((p_) => `${p_[0]} ${n0(p_[1])}t`).join(' · ')}` : ''}</span></td></tr>`;
      if (!rows.length) return head + `<tr><td colspan="9" class="cd-none">${cell.why ? esc(cell.why) : '배정된 계약 없음'}</td></tr>`;
      return head + rows.map((x) => `<tr><td class="nw"><span class="cd-k k${KO[x.kind] ?? 9}">${esc(x.kind)}</span></td><td class="id">${x.con ? esc(x.con) : '<span class="cd-s">주문 연결 전</span>'}</td>`
        + `<td class="nw">${esc(x.grp || '')}</td><td class="w">${esc([x.cus, x.dst].filter(Boolean).join(' · ') || (pl === 'C' && !x.con ? '판매그룹 편성 물량(주문 연결 전)' : ''))}</td>`
        + `<td class="nw">${esc(pl === 'G' ? [x.fam, x.grade].filter(Boolean).join(' ') : [x.item, x.color].filter(Boolean).join(' · '))}</td>`
        + `<td class="r nw">${x.thk != null ? `${(+x.thk).toFixed(2)}×${n0(x.wdt)}` : ''}</td><td class="r"><b>${n1(x.t)}</b></td>`
        + `<td class="nw">${x.due ? `납기 ${md(x.due)}` : ''}${x.need ? ` · 필요 ${md(x.need)}` : ''}</td><td class="nw">${x.start ? esc(UI.fmtDateTime(x.start)) : ''}</td></tr>`).join('');
    }).join('');
    const conSec = view === 'day' ? (() => {
      const d0 = asOf, d1 = addD(asOf, 1);
      const tbl = (d) => V2 ? `<div class="ct-wrap cd-wrap" data-d="${d}"${d === d0 ? '' : ' hidden'}><table class="ct-t cd-t k2-cd"><colgroup><col style="width:96px"><col style="width:200px"><col style="width:150px"><col><col style="width:150px"><col style="width:120px"><col style="width:90px"></colgroup><thead><tr><th>구분</th><th>주문번호</th><th>판매그룹</th><th>고객사 · 목적지</th><th>강종 · 사양</th><th class="n">두께×폭</th><th class="n">톤</th></tr></thead><tbody>${conDay(d)}</tbody></table></div>`
        : `<div class="ct-wrap cd-wrap" data-d="${d}"${d === d0 ? '' : ' hidden'}><table class="ct-t cd-t"><thead><tr><th>구분</th><th>주문번호</th><th>판매그룹</th><th>고객사 · 목적지</th><th>강종 · 사양</th><th class="r">두께×폭</th><th class="r">톤</th><th>납기 · 필요일</th><th>시작</th></tr></thead><tbody>${conDay(d)}</tbody></table></div>`;
      return `<section class="card"><h2>오늘·내일 라인별 생산 계약 <small>생산 캘린더 ${md(CG.asOf || CC.asOf)} 기준</small></h2>`
        + `${V2 ? '' : '<p class="ct-note">확정·작업지시 = 현장 지시 · 편성 = 소재 있는 주문 · 예상 = 2주 안 입고 소재 · 계획 편성 = 컬러 판매그룹 편성(주문 연결 전)</p>'}<div class="seg ct-seg cd-seg" role="group"${V2 ? ' title="확정·작업지시 = 현장 지시 · 편성 = 소재 있는 주문 · 예상 = 2주 안 입고 소재 · 계획 편성 = 컬러 판매그룹 편성(주문 연결 전)"' : ''}><button type="button" data-d="${d0}" aria-pressed="true">오늘 ${md(d0)}(${wd(d0)})</button><button type="button" data-d="${d1}" aria-pressed="false">내일 ${md(d1)}(${wd(d1)})</button></div>${tbl(d0)}${tbl(d1)}</section>`;
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
      if (V2) return `<tr><td><b>${lbl}</b>${tag}</td>${CT.inScope('G') ? `<td class="n">${n0(sum('G', gT))}</td>` : ''}${CT.inScope('C') ? `<td class="n">${n0(sum('C', cT))}</td>` : ''}<td class="n" title="${o.length}건">${o.length ? `${n0(T(o))}t` : '–'}</td><td class="n">${r.length ? `<b class="ct-neg">${r.length}건</b>` : allPast ? '<span class="ct-wd">지남</span>' : '–'}</td><td title="${esc(es.join(' · '))}">${esc(es.slice(0, 2).join(' · '))}${es.length > 2 ? ` <span class="k2-m">외 ${es.length - 2}</span>` : ''}</td></tr>`;
      return `<tr><td class="nw"><b>${lbl}</b>${tag}</td>${CT.inScope('G') ? `<td class="r">${n0(sum('G', gT))}</td>` : ''}${CT.inScope('C') ? `<td class="r">${n0(sum('C', cT))}</td>` : ''}<td class="r">${o.length ? `${o.length}건 · ${n0(T(o))}t` : '-'}</td><td class="r">${r.length ? `<b class="ct-neg">${r.length}</b>` : allPast ? '<span class="ct-wd">지남</span>' : '-'}</td><td class="w">${esc(es.slice(0, 3).join(' · '))}${es.length > 3 ? ` 외 ${es.length - 3}` : ''}</td></tr>`;
    };
    const fc = V2 ? `<table class="ct-t ct-fc k2-fc"><colgroup><col style="width:190px">${CT.inScope('G') ? '<col style="width:110px">' : ''}${CT.inScope('C') ? '<col style="width:110px">' : ''}<col style="width:150px"><col style="width:110px"><col></colgroup><thead><tr><th>${view === 'month' ? '주(수~화)' : '날짜'}</th>${CT.inScope('G') ? '<th class="n">도금 t</th>' : ''}${CT.inScope('C') ? '<th class="n">컬러 t</th>' : ''}<th class="n">생산 필요 주문</th><th class="n">지연 예상</th><th>주요 일정</th></tr></thead><tbody>${buckets.map(fRow).join('')}</tbody></table>` : `<table class="ct-t ct-fc"><thead><tr><th>${view === 'month' ? '주(수~화)' : '날짜'}</th>${CT.inScope('G') ? '<th class="r">도금 t</th>' : ''}${CT.inScope('C') ? '<th class="r">컬러 t</th>' : ''}<th class="r">생산 필요 주문</th><th class="r">지연 예상</th><th>주요 일정</th></tr></thead><tbody>${buckets.map(fRow).join('')}</tbody></table>`;

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
      return `<div class="ct-flh">${nm} <small>${pl === 'G' ? `생산 남은 주문 전부 · ${md(M.cgAt)}` : `${M.ccLines.join('·')} 작업지시대상 · ${md(M.ccAt)}`}</small></div><div class="ct-flow">${cells.map(([l, v, s]) => `<div class="ct-fs"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>`;
    };
    const why = {}; for (const o of nd) why[o.dataWhy || '기타'] = (why[o.dataWhy || '기타'] || 0) + 1;
    const exc = Object.entries(why).map(([k, v]) => `${k} ${v}건`).concat(badSrc.map((x) => `${x.name} ${x.tip}`));
    const gOpen = open.filter((o) => o.pl === 'G').length, cOpen = open.filter((o) => o.pl === 'C').length;
    const cnt = [CT.inScope('G') ? `도금 진행 ${gOpen}건` : '', CT.inScope('C') ? `컬러 진행 ${cOpen}건` : '', `출하 실적 없음 ${noShip.length}건`].filter(Boolean).join(' · ');

    if (dry) return { K, conSec: typeof conSec === 'string' ? conSec : '' };
    const Dd = render(D, 'day', true), Dw = render(D, 'week', true);
    // 새 양식 결론 카드(?ui=v2): 다섯 장 모두 [작은 머리 → 같은 크기 숫자 → 한 줄 설명]. 긴 설명은 title
    const kpiV2 = () => {
      const strip = (s) => String(s || '').replace(/<[^>]+>/g, '');
      const cell = (lab, k) => `<span class="k2-c ${k.tone || ''}"><i>${lab}</i><b>${k.v}<u>${esc(k.v === '-' ? '' : k.unit || '')}</u></b></span>`;
      const top3 = lateM.slice().sort((x, y) => (y.lateT || 0) - (x.lateT || 0));
      const C = [
        [K[0], [['지연 예상 + 납기 지남', K[0]]], RKT ? `미결 ${n0(RKT.t)}t 중 ${RKT.t ? Math.round((RKT.will + RKT.past) / RKT.t * 100) : 0}%` : `${n0(T(risk))}t`],
        [K[1], [['발주 마감 지난 부족', K[1]]], top3.length ? `${top3.length}종 · ${top3[0].name}${top3.length > 1 ? ' 외' : ''}` : '없음'],
        [K[2], [['금일', Dd.K[2]], ['7일', Dw.K[2]], ['월간', K[2]]], `월간 ${n0(act)} / ${n0(plan)}t`],
        [K[3], [['금일', Dd.K[3]], ['7일', Dw.K[3]], ['월간', K[3]]], `월간 ${n0(shA)} / ${n0(shP)}t`],
        [K[4], [['판정 불가 주문', K[4]]], `출하 실적 없음 ${noShip.length}건 별도`],
      ];
      return `<div class="ct-kpis k2-kp">${C.filter(([k, cs]) => k && cs.every(([, x]) => x)).map(([k, cs, s]) => `<a href="${k.href}" class="ct-kpi k2-k" title="${esc(strip(k.sub))}"><div class="l">${esc(k.label === '생산 진도율' ? '생산 진도' : k.label)}</div><div class="k2-n">${cs.map(([l, x]) => cell(l, x)).join('')}</div><div class="s">${esc(s)}</div></a>`).join('')}</div>`;
    };
    const kHtml = V2 ? kpiV2() : null;
    [2, 3].forEach((i) => {   // 납기 위험·소재 부족·자료 확인은 기간과 무관(같은 값) → 한 값만
 const ks = [['금일', Dd.K[i]], ['7일', Dw.K[i]], ['월간', K[i]]];
      if (!K[i] || ks.some(([, k]) => !k)) return;
      K[i] = Object.assign({}, K[i], { label: i === 2 ? '생산 진도' : K[i].label, unit: '', v: `<span class="kp3">${ks.map(([t, k]) => `<span class="${k.tone || ''}"><i>${t}</i><em><b>${k.v}</b><u>${esc(k.v === '-' ? '' : k.unit || '')}</u></em></span>`).join('')}</span>` }); });
    const main = document.getElementById('ct-main');
    // 11/11 개편(사용자 '처음 보는 게 결론'): 핵심 숫자 → 납기 위험 그룹·원인 → 라인 진도 → (기간별) 계획 → 접기(계약·주문 흐름·기준). 판매그룹 생산·출하·재고는 관제판 한 곳(복제 안 함)
    const warnSrc = badSrc.length ? `<p class="ct-srcw">자료 확인 필요: ${badSrc.map((x) => `<b>${esc(x.name)}</b> ${esc(x.tip || '')}`).join(' · ')}</p>` : '';
    const fold = (title, sub, body, open) => `<details class="fold ct-f"${open ? ' open' : ''}><summary>${title}${sub ? ` <small>${sub}</small>` : ''}</summary>${body}</details>`;
    const defs = `<ul class="ct-ul">`
      + `<li><b>납기 위험</b> = 지연 예상 + 납기 지남(미결 주문, 납기 60일 넘게 지난 미종결 제외) — 납기 위험 화면과 같은 판정${RK ? `(${md(RK.asOf)})` : ''}. ${V2 ? '위험 숫자 색' : '그룹 색'}: 위험 ÷ 미결 30% 이상 빨강 · 15% 이상 주황</li>`
      + `<li><b>주요 원인</b> = ${V2 ? '위험 톤이 가장 큰 원인(나머지는 줄을 눌러 펼침), 언제 풀리나 = 그 원인 중 가장 큰 몫의 다음 생산일·입고 예정일' : '위험 톤이 큰 원인 2개, 옆 = 언제 풀리나(다음 생산일·입고 예정일)'}${RK ? `<ul>${Object.entries(RK.causeNm || {}).map(([k, v]) => `<li><b>${esc(v)}</b>${(RK.causeDef || {})[k] ? ` = ${esc(RK.causeDef[k])}` : ''} → ${esc((RK.dept || {})[k] || '')}</li>`).join('')}</ul>` : ''}</li>`
      + `<li><b>생산 진도</b> = ${view === 'month' ? '라인 실적 ÷ 일정 누계(도금 = 재계획 일정, 컬러 = 월 계획)' : '하루가 끝난 날의 도금 실적 ÷ 그날 아침 계획(컬러는 지난 날 일 계획 기록이 없어 월간에서)'} · 98% 이상 정상 · 90% 이상 주의</li>`
      + `<li><b>출하 미달</b> = ${view === 'month' ? '판매그룹 출하 실적 ÷ 오늘까지 기준(월 계획 × 그룹 월중 출하 실적 패턴) — 판매그룹 관제판과 같은 값' : '전날까지 MES 출하 실적 vs 하루 출고 계획(재고 추이와 같은 값)'}</li>`
      + `<li><b>소재 부족</b> = 발주 마감이 지난 부족(소재 화면과 같은 값)</li></ul>`;
    const conFold = (Dd.conSec || '') && Dd.conSec.replace(/^<section class="card"><h2>오늘·내일 라인별 생산 계약 <small>/, '<details class="fold ct-f"><summary>오늘·내일 라인별 생산 계약 <small>').replace(/<\/small><\/h2>/, '</small></summary>').replace(/<\/section>$/, '</details>');
    main.innerHTML = warnSrc
      + `<div class="ct-bar"><span class="ct-per"><span class="ct-note"><b>${pLbl}</b> · ${SCN} · 기준 ${md(asOf)}</span></span><a class="ct-note" href="board.html">판매그룹별 생산·출하·재고 → 관제판</a></div>`
      + (kHtml || CT.kpis(K))
      + (rkTbl2 ? `<section class="card ct-act k2-rks"><h2>판매그룹별 납기 위험 <small><a href="risk.html">납기 위험 화면 →</a></small></h2>${rkTbl2}</section>` : rkTbl ? `<section class="card ct-act"><h2>판매그룹별 납기 위험 <small>위험 많은 순 · <a href="risk.html">납기 위험 화면 →</a></small>${rkLeg}</h2>${rkTbl}</section>` : `<section class="card ct-act"><h2>우선 조치 10건 <small>납기 지연 예상 → 마감 빠른 순</small></h2>${actTbl}</section>`)
      + lineSec
      + conFold + (false ? '' : `<section class="card"><h2>${view === 'week' ? '이번 주' : `${+asOf.slice(5, 7)}월`} 생산 계획 <small${V2 ? ` title="지난 날 = 실적, 오늘부터 = 계획 · 생산 필요 주문 = 생산 필요일이 그 기간인 주문${view === 'month' ? ' · 수요일 시작 주' : ''}"` : ''}>${V2 ? `${md(p0)}~${md(p1)}` : pLbl}${V2 ? '' : ` · 지난 날 = 실적, 오늘부터 = 계획 · 생산 필요일이 그날인 주문${view === 'month' ? ' · 수요일 시작 주' : ''}`}</small></h2><div class="ct-wrap">${fc}</div></section>`)
      + fold('주문 진행 현황', cnt, `${flow('G', '도금')}${flow('C', '컬러')}`)
      + fold('기준·자료 상태', `자료 ${src.length}개 중 ${badSrc.length ? `확인 필요 ${badSrc.length}` : '모두 최신'}${exc.length ? ` · 자료 확인 필요 ${nd.length}건` : ''}`, `${CT.basis(src)}${defs}${exc.length ? `<div class="ct-flh">자료 확인 필요 <small>${exc.length}종 · ${nd.length}건</small></div><ul class="ct-ul">${exc.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`);

    const open1 = (a) => {
      if (a.os) {
        const os = a.os.slice().sort(CT.riskSort);
        CT.panel(`<p class="ct-note">${esc(a.dept || '')} · 마감 ${md(a.last) || '-'} · <a href="ct_orders.html#risk">수주·납기에서 보기</a></p><table class="ct-t"><thead><tr><th>문제</th><th>주문</th><th>진행 단계</th><th class="r">잔량</th><th>마감</th></tr></thead><tbody>${os.map((o, j) => `<tr class="ck" tabindex="0" data-j="${j}"><td class="nw">${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.item)}</small></td><td>${CT.fulBadge(o.ful)}</td><td class="r">${n1(o.remT)}</td><td class="nw">${md(o.last) || '-'}</td></tr>`).join('')}</tbody></table>`, `${a.type} · ${a.grp || ''}`,
          (p) => { p.querySelectorAll('tr.ck').forEach((r) => r.onclick = () => { const o = os[+r.dataset.j]; CT.panel(CT.orderDetail(o), o.id); }); CT.keyRows(p); });
      } else if (a.href) location.href = a.href;
    };
    main.querySelectorAll('.ct-pseg button').forEach((bt) => bt.onclick = () => { if (bt.dataset.v !== view) location.hash = bt.dataset.v; });   // 11/11 회의 '금일·7일·월간 따로 하지 말고 한 화면에서': 기간만 바꿈(주소 #day·#week·#month 그대로)
    main.querySelectorAll('.cd-seg button').forEach((bt) => bt.onclick = () => { main.querySelectorAll('.cd-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === bt))); main.querySelectorAll('.cd-wrap').forEach((w) => { w.hidden = w.dataset.d !== bt.dataset.d; }); });
    main.querySelectorAll('tr.ck:not(.k2-rk)').forEach((tr) => tr.onclick = () => open1(top[+tr.dataset.i]));
    main.querySelectorAll('tr.k2-rk.ck').forEach((tr) => { tr.onclick = () => { const d = tr.nextElementSibling; if (d && d.classList.contains('k2-det')) { d.hidden = !d.hidden; tr.classList.toggle('on', !d.hidden); } }; });
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
