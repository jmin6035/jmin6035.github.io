/* 01 통합 관제(11/4 2차 진단 4장): 10초 안에 위험 인지, 30초 안에 우선 조치 결정
   메뉴 탭 = 기간(#day 금일 · #week 수요일 시작 7일 · #month 이번 달). KPI 6 · 조치 TOP10 + 공정별 상태 · 기간 전망 · (접힘) 수주 이행 흐름·자료 예외 */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD, diff } = CT;
  const PER = { day: 1, week: 7, month: 30 };
  const FILES = ['portal.enc.json', 'latest.plan.enc.json', 'plan_prev.enc.json', 'integrated.enc.json', 'mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'];
  let DATA = null, ST = {};
  const WD = '일월화수목금토', wd = (d) => WD[new Date(d + 'T00:00:00Z').getUTCDay()];

  function render(D) {
    DATA = D;
    const view = CT.view('day', Object.keys(PER)), per = PER[view];
    const P = D.portal || {}, L = (D['latest.plan'] || {}).result || {}, LP = (D.plan_prev || {}).result || {}, W = D.integrated || {}, MO = D.mat_order || {};
    const M = CT.orders(D), asOf = M.asOf;
    // 기간(11/5 사용자): 금일 = 오늘 · 7일 = 수요일 시작 한 주 · 월간 = 이번 달(월 단위로 끊음)
    const ndM = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
    const p0 = view === 'day' ? asOf : view === 'week' ? CT.wed(asOf) : asOf.slice(0, 8) + '01';
    const p1 = view === 'day' ? asOf : view === 'week' ? addD(p0, 6) : asOf.slice(0, 8) + String(ndM(asOf)).padStart(2, '0');
    const pLbl = view === 'day' ? `${md(asOf)} ${wd(asOf)}` : view === 'week' ? `${md(p0)}(수)~${md(p1)}(화)` : `${+asOf.slice(5, 7)}월(${md(p0)}~${md(p1)})`;
    const until = p1, inP = (d) => d && d >= p0 && d <= p1;
    const open = M.all.filter((o) => !o.closed && CT.inScope(o.pl));
    const inWin = (o) => inP(o.last || o.needProd);
    const risk = open.filter((o) => o.risk === '위험' && inWin(o)), warn = open.filter((o) => o.risk === '주의' && inWin(o)), nd = open.filter((o) => o.risk === '판정 불가');
    const overdue = open.filter((o) => (o.risk === '위험' || o.risk === '주의') && (o.last || o.needProd) && (o.last || o.needProd) < p0);
    const T = (xs) => xs.reduce((a, o) => a + (o.remT || 0), 0);
    const SCN = ({ all: '전체', G: '도금', C: '컬러' })[CT.scope()];

    // ① 자료 상태: 한 줄 요약 + 펼침
    const rp = L.replan || {};
    const src = [
      { name: '도금 실적', at: P.asOf, kind: '실적' },
      { name: '컬러 실적', at: (P.groups || []).find((g) => g.pl === 'C' && g.prod)?.prod?.asOf, kind: '실적' },
      { name: '도금 계획', at: rp.t0 || (D['latest.plan'] || {}).savedAt, kind: '재계획' },
      { name: '컬러 계획', at: W.built, kind: '확정 계획' },
      { name: '판생속보', at: (P.sr || {}).asOf, kind: '실적·계획' },
      { name: '도금 주문', at: M.cgAt, kind: '실적' },
      { name: '컬러 주문', at: M.ccAt, kind: M.ccMissing.length ? `${M.ccLines.join('·')}만` : '실적', ok: !M.ccMissing.length, tip: M.ccMissing.length ? `${M.ccMissing.join('·')} 자료 없음` : '' },
      { name: '소재', at: MO.today, kind: '추정' },
    ];
    src.forEach((x) => { if (x.ok !== false && (!x.at || diff(String(x.at).slice(0, 10), asOf) < -1)) { x.ok = false; x.tip = x.tip || (x.at ? '이틀 이상 지난 자료' : '자료 없음'); } });
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
      const ds = (x.days || []).map((r) => r[0]).filter((d) => d <= lastFull(x) && (view === 'day' ? d === lastFull(x) : inP(d)));
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
    const mats = ((MO.groups || {}).mats || []).filter((m) => CT.inScope(m.plant) && m.short > 0 && (m.st === 'late' || m.st === 'soon'));
    const mAll = ((MO.groups || {}).mats || []).filter((m) => CT.inScope(m.plant) && m.short > 0.5);
    const mSure = mAll.filter((m) => m.first && m.first < addD(MO.today || asOf, (m.lt || 0) + (m.safe || 0))), mExp = mAll.filter((m) => !mSure.includes(m));   // 04 부족·조치와 같은 기준
    const mPer = mAll.filter((m) => m.first && m.first <= p1), mPerNew = mPer.filter((m) => m.first >= p0);   // 기간 안(또는 이미) 부족이 시작되는 소재
    const sT = (xs) => xs.reduce((a, m) => a + m.short, 0);
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
      { label: '소재 부족', v: n0(sT(mPerNew)), unit: 't', sub: `기간 안 부족 시작 ${mPerNew.length}종${mPerNew.length ? `(${mPerNew.slice(0, 3).map((m) => esc(m.name)).join('·')})` : ''} · 이미 부족 ${mPer.length - mPerNew.length}종 · 리드타임 안 확정 ${mSure.length}종`, tone: mPerNew.some((m) => mSure.includes(m)) ? 'bad' : mPerNew.length ? 'warn' : 'ok', href: 'ct_mat.html' },
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
    for (const m of mats) acts.push({ id: CT.issueId('mat|' + m.key), risk: m.st === 'late' ? '위험' : '주의', type: '소재 발주', what: `${m.name} 부족 ${n0(m.short)}t · ${md(m.first)}부터`, t: m.short, last: m.deadline, dept: CT.DEPT.mat, href: 'ct_mat.html' });
    for (const x of (P.exceptions || []).filter((x) => x.lvl === 'bad' || x.lvl === 'warn')) {
      if (!CT.inScope(/도금/.test(x.area) ? 'G' : /컬러/.test(x.area) ? 'C' : 'all')) continue;
      acts.push({ id: CT.issueId('exc|' + x.text), risk: x.lvl === 'bad' ? '위험' : '주의', type: x.area, what: x.text, t: null, last: null, dept: x.who, href: x.link });
    }
    acts.sort((a, b) => (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || String(a.last || '9').localeCompare(String(b.last || '9')) || (b.t || 0) - (a.t || 0));
    const top = acts.slice(0, 10);
    const left = (d) => (d == null ? '-' : diff(d, asOf) < 0 ? `<b class="ct-neg">${md(d)} · ${-diff(d, asOf)}일 지남</b>` : `${md(d)} <small class="ct-dd">D-${diff(d, asOf)}</small>`);
    const stCell = (a) => `<span class="ct-new" data-id="${a.id}">${esc(ST[a.id] || '신규')}</span>`;
    const actTbl = top.length ? `<div class="ct-wrap"><table class="ct-t"><colgroup><col style="width:150px"><col><col style="width:84px"><col style="width:136px"><col style="width:108px"><col style="width:72px"></colgroup><thead><tr><th>무엇이 문제</th><th>대상</th><th class="r">해당 물량</th><th>조치 마감</th><th>조치 부서</th><th>진행</th></tr></thead><tbody>${top.map((a, i) => `<tr class="ck" tabindex="0" data-i="${i}"><td class="nw">${CT.badgeT(a.risk, a.type)}</td><td class="w">${esc(a.what)}</td><td class="r">${a.t == null ? '' : n0(a.t)}</td><td class="nw">${left(a.last)}</td><td class="nw">${esc(a.dept || '')}</td><td class="nw">${stCell(a)}</td></tr>`).join('')}</tbody></table></div>${acts.length > 10 ? `<p class="ct-note">상위 10건 / 전체 ${acts.length}건 · <a href="ct_issue.html#now">이슈·조정에서 전체 보기</a></p>` : ''}` : '<p class="ct-note">기간 안 조치 대상 없음</p>';

    // ④ 공정별 상태(도금/컬러/소재/출하 같은 크기)
    const rk = (pl) => open.filter((o) => o.pl === pl && o.risk === '위험').length;
    const proc = [];
    if (CT.inScope('G')) proc.push({ n: '도금', v: pct(cgA, cgP), u: '%', tone: tone(pct(cgA, cgP)), s: [`실적 ${n0(cgA)} / 계획 ${n0(cgP)}t`, `납기 지연 예상 ${rk('G')}건`, gl.some((x) => x.sched && x.actual < x.sched * 0.95) ? `미달 ${gl.filter((x) => x.sched && x.actual < x.sched * 0.95).map((x) => x.line).join('·')}` : '라인 미달 없음'], href: 'ct_prod.html#perf' });
    if (CT.inScope('C')) proc.push({ n: '컬러', v: pct(ccA, ccP), u: '%', tone: tone(pct(ccA, ccP)), s: [`실적 ${n0(ccA)} / 계획 ${n0(ccP)}t`, `납기 지연 예상 ${rk('C')}건`, M.ccMissing.length ? `주문 자료 ${M.ccLines.join('·')}만` : '4개 라인 주문 반영'], href: 'ct_prod.html#perf' });
    proc.push({ n: '소재', v: mSure.length, u: '개 확정', tone: mSure.length ? 'bad' : mExp.length ? 'warn' : 'ok', s: [`예상 ${mExp.length}개 · 마감 지남 ${mats.filter((m) => m.st === 'late').length}개`, `소재 원인 주문 ${matOrd.length}건`], href: 'ct_mat.html' });
    const mGap = ship.reduce((a, x) => a + Math.max(0, (x.sched || 0) - (x.actual || 0)), 0), mBad = ship.filter((x) => (x.sched || 0) - (x.actual || 0) > 0.5);
    proc.push({ n: '출하', v: n0(mGap), u: 't 미달', tone: mGap > 500 ? 'bad' : mGap > 0.5 ? 'warn' : 'ok', s: [mBad.length ? `미달 ${mBad.map((x) => x.name).join('·')}` : '일정 누계 충족', `출하 실적 없음 ${noShip.length}건`], href: 'ct_prod.html#ship' });
    const procHtml = `<div class="ct-proc">${proc.map((x) => `<a class="ct-pc ${x.tone}" href="${x.href}"><div class="h"><b>${x.n}</b><span class="v">${x.v == null ? '-' : x.v}<small>${x.u}</small></span></div>${x.s.map((t) => `<div class="s">${esc(t)}</div>`).join('')}</a>`).join('')}</div>`;

    // ⑤ 기간 전망: 당일(오늘·내일) · 7일(일별) · 30일(주별)
    const days = view === 'day' ? [asOf, addD(asOf, 1)] : Array.from({ length: diff(p1, p0) + 1 }, (_, i) => addD(p0, i));
    const gT = {}, cT = {};
    for (const r of L.rows || []) if (days.includes(r[0])) gT[r[0]] = (gT[r[0]] || 0) + (+r[4] || 0);
    for (const x of W.color || []) if (days.includes(x.d) && !x.act) cT[x.d] = (cT[x.d] || 0) + Object.values(x.g || {}).reduce((a, v) => a + v, 0);
    const ev = {}; for (const e of ((P.week || {}).events || [])) if (days.includes(e.d) && CT.inScope(e.pl)) (ev[e.d] = ev[e.d] || []).push(e.text);
    const buckets = view === 'month' ? Object.values(days.reduce((m, d) => ((m[CT.wed(d)] = m[CT.wed(d)] || []).push(d), m), {})) : days.map((d) => [d]);   // 월간 = 수요일 시작 주로 끊음(월 경계에서 자름)
    const fRow = (ds) => {
      const o = open.filter((x) => ds.includes(x.needProd)), r = o.filter((x) => x.risk === '위험');
      const sum = (m) => ds.reduce((a, d) => a + (m[d] || 0), 0), es = ds.flatMap((d) => ev[d] || []);
      const lbl = ds.length > 1 ? `${md(ds[0])}~${md(ds[ds.length - 1])}` : `${md(ds[0])} <small class="ct-wd">${wd(ds[0])}${ds[0] === asOf ? ' · 오늘' : ''}</small>`;
      return `<tr><td class="nw"><b>${lbl}</b></td>${CT.inScope('G') ? `<td class="r">${n0(sum(gT))}</td>` : ''}${CT.inScope('C') ? `<td class="r">${n0(sum(cT))}</td>` : ''}<td class="r">${o.length ? `${o.length}건 · ${n0(T(o))}t` : '-'}</td><td class="r">${r.length ? `<b class="ct-neg">${r.length}</b>` : '-'}</td><td class="w">${esc(es.slice(0, 3).join(' · '))}${es.length > 3 ? ` 외 ${es.length - 3}` : ''}</td></tr>`;
    };
    const fc = `<table class="ct-t ct-fc"><thead><tr><th>${view === 'month' ? '주(수~화)' : '날짜'}</th>${CT.inScope('G') ? '<th class="r">도금 계획 t</th>' : ''}${CT.inScope('C') ? '<th class="r">컬러 계획 t</th>' : ''}<th class="r">생산 필요 주문</th><th class="r">지연 예상</th><th>주요 일정</th></tr></thead><tbody>${buckets.map(fRow).join('')}</tbody></table>`;

    // ⑥ (접힘) 수주 이행 흐름 — 도금·컬러 따로, 출하 확인 불가 분리
    const flow = (pl, nm) => {
      const os = M.all.filter((o) => o.pl === pl);
      if (!os.length || !CT.inScope(pl)) return '';
      const op = os.filter((o) => !o.closed), F = (f) => os.filter((o) => o.ful === f).length;
      const cells = [
        ['수주 진행', `${n0(T(op))}<small>t 잔량</small>`, `${op.length}건`],
        ['소재 확보', `${n0(op.filter((o) => o.matSt === '확보' || o.matSt === '재고 있음').length)}<small>건</small>`, `미확보 <b class="bad">${op.filter((o) => o.matSt !== '확보' && o.matSt !== '재고 있음').length}</b>건`],
        ['생산 중', `${n0(F('생산 중'))}<small>건</small>`, `생산 전 ${F('생산 전')}건`],
        ['생산 완료', `${n0(F('출하 확인 불가') + F('부분 출하') + F('출하 완료'))}<small>건</small>`, `생산 ${n0(os.reduce((a, o) => a + Math.min(o.prodT || 0, o.ordT || 0), 0))}t`],
        ['출하', pl === 'G' ? `${n0(F('출하 완료'))}<small>건 완료</small>` : '<small>자료 없음</small>', pl === 'G' ? `부분 ${F('부분 출하')} · <b class="bad">실적 없음 ${F('출하 확인 불가')}</b>건` : `실적 없음 ${F('출하 확인 불가')}건(컬러 출하 연결 전)`],
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
      + `<div class="ct-2c"><section class="card"><h2>우선 조치 10건 <small>납기 지연 예상 → 마감 빠른 순</small></h2>${actTbl}</section><section class="card"><h2>라인별 진도 <small>${+asOf.slice(5, 7)}월 누계</small></h2>${procHtml}</section></div>`
      + `<section class="card"><h2>${view === 'day' ? '오늘·내일' : view === 'week' ? '이번 주' : `${+asOf.slice(5, 7)}월`} 생산 계획 <small>${pLbl} · 계획량 · 생산 필요일이 그날인 주문${view === 'month' ? ' · 수요일 시작 주 단위' : ''}</small></h2><div class="ct-wrap">${fc}</div></section>`
      + `<details class="card ct-fold"><summary><h2>주문 진행 현황 <small>${cnt}</small></h2></summary>${flow('G', '도금')}${flow('C', '컬러')}</details>`
      + (exc.length ? `<details class="card ct-fold"><summary><h2>자료 확인 필요 <small>${exc.length}종 · ${nd.length}건</small></h2></summary><ul class="ct-ul">${exc.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : '');

    const open1 = (a) => {
      if (a.os) {
        const os = a.os.slice().sort(CT.riskSort);
        CT.panel(`<p class="ct-note">${esc(a.dept || '')} · 마감 ${md(a.last) || '-'} · <a href="ct_orders.html#risk">수주·납기에서 보기</a></p><table class="ct-t"><thead><tr><th>문제</th><th>주문</th><th>진행 단계</th><th class="r">잔량</th><th>마감</th></tr></thead><tbody>${os.map((o, j) => `<tr class="ck" tabindex="0" data-j="${j}"><td class="nw">${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.item)}</small></td><td>${CT.fulBadge(o.ful)}</td><td class="r">${n1(o.remT)}</td><td class="nw">${md(o.last) || '-'}</td></tr>`).join('')}</tbody></table>`, `${a.type} · ${a.grp || ''}`,
          (p) => { p.querySelectorAll('tr.ck').forEach((r) => r.onclick = () => { const o = os[+r.dataset.j]; CT.panel(CT.orderDetail(o), o.id); }); CT.keyRows(p); });
      } else if (a.href) location.href = a.href;
    };
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
