/* 07 성과 분석(11/4 2차 진단 10장): #ops 운영 성과(숫자) · #cause 편차 원인(근거 등급: 확인된 원인 / 연관 가능 요인 / 추가 확인 필요)
   원천: cg_order_progress(perf) + cc_order_progress(CT.orders) · portal(acc·roll·sr·groups·lines) · plating_actual(daily·dayStops·stops) · color_actual · mat_order · latest.plan(cal 가동시간·rows 계획) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['ops', 'cause'];
  let bound = false;
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'portal.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json', 'mat_order.enc.json', 'latest.plan.enc.json', 'integrated.enc.json', 'suju.enc.json'], draw);
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const tone = (p, g = 95, w = 85) => (p == null ? '' : p >= g ? 'pos' : p >= w ? 'wrn' : 'neg');
  const card = (title, sub, body) => `<section class="card pf-c"><h2>${esc(title)} <small>${esc(sub)}</small></h2>${body}</section>`;
  const tbl = (head, rows) => `<div class="ct-wrap"><table class="ct-t"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const big = (p, cls, s) => `<div class="pf-big ${cls}">${p == null ? '-' : p}<span class="u">%</span><span class="pf-s">${s}</span></div>`;
  const MN = (m) => `${+m.slice(5)}월`;
  const lastDay = (m) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)); return d.toISOString().slice(0, 10); };
  // 월 안을 수요일 시작 2주 단위로(11/5 사용자 '월 단위로 끊고 그 안에서 수요일 기준 2주') — 기준 수요일 = 그 달 1일이 속한 주의 수요일
  const buckets = (m) => { const a = m + '-01', z = lastDay(m), out = []; let s0 = CT.wed(a); while (s0 <= z) { const e0 = CT.addD(s0, 13); out.push([s0 < a ? a : s0, e0 > z ? z : e0]); s0 = CT.addD(s0, 14); } return out; };
  const LV = { ok: ['확인된 원인', 'c1'], rel: ['연관 가능 요인', 'c2'], chk: ['추가 확인 필요', 'c3'] };

  function draw(D) {
    const m = document.getElementById('ct-main'), v = CT.view('ops', VIEWS), A = calc(D);
    m.innerHTML = CT.basis([{ name: '주문 진도', at: A.M.asOf, kind: '실적' }, { name: '생산 실적', at: A.P.asOf, kind: '실적' }, { name: '판매생산속보', at: A.P.sr && A.P.sr.asOf, kind: '확정계획' }, A.LP && { name: '가동계획', at: A.LP.savedAt, kind: '재계획' }])
      + (v === 'cause' ? cause(A) : `<p class="pf-top"><a class="pf-btn" href="report.html">주간 보고 →</a></p><div class="pf-g">${A.cards.join('')}</div>`);
    if (!bound) { bound = true; CT.onView(() => { draw(D); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }

  function calc(D) {
    const P = D.portal || {}, cg = D.cg_order_progress || {}, GA = D.plating_actual || {}, CA = D.color_actual || {}, LP = D['latest.plan'];
    const M = CT.orders(D), cards = [], why = [];   // why: [지표, 등급, 문장]
    const mon = String(P.asOf || '').slice(0, 7);
    // ① 납기 내 생산: 월별 · 그 안 수요일 시작 2주 — 주문 생산 완료일(마지막 생산일) 기준, 생산 필요일 안이면 기한 안
    const months = [...new Set([String(P.asOf || M.asOf).slice(0, 7), CT.addD(String(P.asOf || M.asOf).slice(0, 7) + '-01', -1).slice(0, 7)])].sort();
    const done = M.G.filter((o) => CT.inScope('G') && o.src.prodLast && o.prodT > 0.5 && o.ful !== '생산 전' && o.ful !== '생산 중' && o.needProd);
    if (done.length) {
      const sumB = (L) => L.reduce((a, o) => [a[0] + o.prodT, a[1] + (o.src.prodLast <= o.needProd ? o.prodT : 0)], [0, 0]);
      const rowsB = [], gAll = {};
      for (const m of months) {
        const Lm = done.filter((o) => String(o.src.prodLast).slice(0, 7) === m);
        if (!Lm.length) continue;
        const [t, ok] = sumB(Lm), q = pc(ok, t);
        rowsB.push(`<tr class="pf-m"><td class="id"><b>${MN(m)}</b></td><td class="r"><b>${n0(t)}</b></td><td class="r"><b>${n0(ok)}</b></td><td class="r"><b class="${tone(q)}">${q}%</b></td></tr>`);
        for (const [a, z] of buckets(m)) {
          const Lb = Lm.filter((o) => o.src.prodLast >= a && o.src.prodLast <= z);
          if (!Lb.length) continue;
          const [tb, ob] = sumB(Lb), qb = pc(ob, tb);
          rowsB.push(`<tr><td class="id pf-sub">${md(a)}~${md(z)}</td><td class="r">${n0(tb)}</td><td class="r">${n0(ob)}</td><td class="r"><b class="${tone(qb)}">${qb}%</b></td></tr>`);
        }
        Lm.forEach((o) => { const g = gAll[`${m}|${o.grp}`] = gAll[`${m}|${o.grp}`] || [0, 0]; g[0] += o.prodT; if (o.src.prodLast <= o.needProd) g[1] += o.prodT; });
      }
      const cm = months[months.length - 1], cur = sumB(done.filter((o) => String(o.src.prodLast).slice(0, 7) === cm)), pcur = pc(cur[1], cur[0]);
      cards.push(card('납기 내 생산', `도금 주문 · 생산 완료일이 생산 필요일 안 · 월별, 수요일 시작 2주`, big(pcur, tone(pcur), `${MN(cm)} ${n0(cur[1])} / ${n0(cur[0])}t`)
        + tbl(['기간', '생산 완료(t)', '기한 안(t)', '준수율'], rowsB)
        + `<p class="pf-n">컬러 주문은 주문별 생산 완료일 자료가 없어 제외(컬러 주문 진도에 완료일 칸 없음). 도금 주문 진도에 든 주문(생산 남은 주문 전부)만</p>`));
      const g1 = Object.entries(gAll).filter(([k]) => k.startsWith(cm) && gAll[k][0] >= 50).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0])[0];
      if (g1) {
        const gn = g1[0].split('|')[1], cz = M.all.filter((o) => o.grp === gn && o.risk === '위험'), cc = {};
        cz.forEach((o) => { cc[o.cause] = (cc[o.cause] || 0) + (o.remT || 0); });
        const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0];
        why.push(['납기 내 생산', `${MN(cm)} ${gn} ${pc(g1[1][1], g1[1][0])}% 가장 낮음`, top ? 'rel' : 'chk',
          top ? `지금 같은 그룹 지연 예상 주문의 주원인 ${CT.CAUSE[top[0]]} ${n0(top[1])}t — 지금 상태 기준이라 지난 미준수의 직접 원인은 아님` : '같은 그룹 지연 예상 주문 없음 — 미준수 주문별 지연 사유 자료 없음']);
      }
    }
    // ② 생산계획 정확도: 월별(11/5 사용자 '누계 말고 10월·11월') — 지난 달 = 기준 계획 월 생산 vs 실적, 이번 달 = 오늘까지 일정 vs 실적
    const acc = Object.entries(P.acc || {}).filter(([l]) => CT.inScope(/CGL/.test(l) ? 'G' : 'C'));
    const MP = P.monthPlan || {}, cm2 = String(P.asOf || '').slice(0, 7);
    const mSum = (m, pl) => Object.entries(MP[m] || {}).filter(([g]) => g[0] === pl).reduce((a, [, x]) => a + (x.prod || 0), 0);
    const actM = (src, m) => { const r = ((src && src.monthly) || []).find((x) => x.m === m) || {}; return Object.entries(r).filter(([k]) => k !== 'm').reduce((a, [, v]) => a + (+v || 0), 0); };
    const gl = (P.lines || []).filter((l) => l.pl === 'G'), cgp = (P.groups || []).filter((g) => g.pl === 'C' && g.prod);
    const accRows = [];
    for (const m of months) {
      for (const pl of ['G', 'C']) {
        if (!CT.inScope(pl)) continue;
        let plan, act, how;
        if (m < cm2) { plan = mSum(m, pl); act = actM(pl === 'G' ? GA : CA, m); how = '기준 계획 월 생산'; }
        else if (D.suju && D.suju.daily) { const pmx = UI.prodMon(D.suju, pl === 'G' ? ['1CGL', '2CGL'] : ['1CCL', '2CCL', '3CCL', '4CCL']); plan = pmx.due0; act = pmx.act; how = `월차(이달 첫 계획) ~${md(D.suju.asOf)} · 월 계획 ${n0(pmx.mon)}t 중 ${pc(pmx.act, pmx.mon)}%`; }   // 11/13: 모든 화면 같은 식(UI.prodMon)
        else if (pl === 'G') { plan = gl.reduce((a, l) => a + (l.sched || 0), 0); act = gl.reduce((a, l) => a + (l.actual || 0), 0); how = `판매생산속보 일정(~${md(P.asOf)})`; }
        else { plan = cgp.reduce((a, g) => a + Math.max(0, (g.prod.month || 0) - (g.prod.after || 0)), 0); act = cgp.reduce((a, g) => a + (g.prod.actual || 0), 0); how = `그룹 계획(~${md(cgp[0] && cgp[0].prod.asOf || P.asOf)})`; }
        if (!plan && !act) continue;
        const q = pc(act, plan);
        accRows.push(`<tr><td class="id"><b>${MN(m)}</b> ${pl === 'G' ? '도금' : '컬러'}<small>${esc(how)}</small></td><td class="r">${n0(plan)}</td><td class="r"><b>${n0(act)}</b></td><td class="r"><b class="${q == null ? '' : Math.abs(q - 100) <= 5 ? 'pos' : Math.abs(q - 100) <= 15 ? 'wrn' : 'neg'}">${q == null ? '-' : q + '%'}</b></td></tr>`);
      }
    }
    // 그날 아침 계획 대비(도금, 월별) — GA.accHist [날짜, 라인, 계획, 실적]
    const AH = (GA.accHist || []).filter((a) => CT.inScope('G'));
    const dayRows = [];
    for (const m of months) for (const l of ['1CGL', '2CGL']) {
      const H = AH.filter((a) => a[1] === l && String(a[0]).slice(0, 7) === m);
      if (!H.length) continue;
      const pl_ = H.reduce((a, x) => a + x[2], 0), ac = H.reduce((a, x) => a + x[3], 0), bias = pl_ ? (ac - pl_) / pl_ * 100 : 0;
      const mae = pl_ ? H.reduce((a, x) => a + Math.abs(x[3] - x[2]), 0) / pl_ * 100 : 0, un = H.filter((x) => x[3] < x[2] * 0.95).length;
      dayRows.push(`<tr><td class="id"><b>${MN(m)}</b> ${l}<small>${md(H[0][0])}~${md(H[H.length - 1][0])} · ${H.length}일</small></td><td class="r">${n0(pl_)}</td><td class="r">${n0(ac)}</td><td class="r"><b class="${Math.abs(bias) <= 5 ? 'pos' : Math.abs(bias) <= 15 ? 'wrn' : 'neg'}">${bias >= 0 ? '+' : ''}${n1(bias)}%</b></td><td class="r">${n1(mae)}%</td><td class="r">${un}일</td></tr>`);
    }
    if (accRows.length || dayRows.length) {
      cards.push(card('생산계획 정확도', '월별 · 계획 대비 실적', tbl(['월 · 공정', '계획(t)', '실적(t)', '달성'], accRows)
        + (dayRows.length ? `<h3 class="pf-h">그날 아침 계획 대비(도금)</h3>` + tbl(['월 · 라인', '계획(t)', '실적(t)', '차이', '하루 오차', '미달 일수'], dayRows) : '')
        + (CT.inScope('C') ? '<p class="pf-n">컬러 그날 아침 계획 대비는 자료 없음 — 컬러 계획은 매일 지난 날을 실적으로 덮어 게시해, 그날 아침 계획을 따로 보관한 기록이 없음(도금은 사내 PC가 매일 보관)</p>' : '')));
    }
    if (acc.length) {
      // 라인별: 미달이 큰 날에 MES 휴지 기록이 있으면 확인된 원인, 없으면 추가 확인 필요(편차 큰 라인의 휴지를 원인으로 단정하지 않음)
      for (const [l, x] of acc) {
        const H = (GA.accHist || []).filter((a) => a[1] === l && a[3] < a[2] * 0.9);   // 계획의 90% 미만인 날
        const st = H.map((a) => [a[0], a[3] - a[2], (((GA.dayStops || {})[a[0]] || {})[l] || [])]);
        const withS = st.filter((s) => s[2].length), noS = st.filter((s) => !s[2].length);
        withS.slice(0, 3).forEach((s) => why.push(['생산계획', `${l} ${md(s[0])} 계획 대비 ${n0(s[1])}t`, 'ok', `MES 휴지 ${s[2].map((z) => `${z[2] || z[0]} ${n0(z[1])}분`).join(' · ')}`]));
        if (noS.length) why.push(['생산계획', `${l} 미달 ${noS.length}일(${noS.slice(0, 4).map((s) => md(s[0])).join('·')})`, 'chk', '그날 휴지 기록 없음 — 속도·두께·폭 등 확인 필요']);
        if (x.bias > 15) why.push(['생산계획', `${l} 실적이 계획보다 ${n1(x.bias)}% 많음`, 'chk', '초과 생산 근거 자료 없음 — 아침 계획 속도 설정 확인 필요']);
      }
    }
    // ③ 생산능력: 가용 능력(캘린더 가동시간 × t/h) vs 계획 부하(최신 계획) vs 실제 생산
    const cal = (LP && LP.result && LP.result.cal) || [], rows = (LP && LP.result && LP.result.rows) || [];
    const IW = D.integrated || {}, CDN = {};
    for (const [d, l, , mn] of IW.colorDown || []) CDN[`${d}|${l}`] = (CDN[`${d}|${l}`] || 0) + (+mn || 0);
    const capL = (P.lines || []).filter((l) => CT.inScope(l.pl)).map((l) => {
      if (l.pl !== 'G') {   // 컬러: 능력 = (1,440분 − 계획 휴지) × 계획 평균 t/h, 부하 = 지난 날 실적 + 남은 날 계획 편성
        const days = []; for (let d = mon + '-01'; d <= lastDay(mon); d = CT.addD(d, 1)) days.push(d);
        const C = (IW.color || []).filter((c) => c.l === l.line && String(c.d).slice(0, 7) === mon);
        if (!C.length) return { l, na: true };
        const h = days.reduce((a, d) => a + Math.max(0, 1440 - Math.min(1440, CDN[`${d}|${l.line}`] || 0)), 0) / 60;
        const F = C.filter((c) => !c.act), ft = F.reduce((a, c) => a + c.rows.reduce((b, r) => b + (+r[5] || 0), 0), 0), fm = F.reduce((a, c) => a + c.rows.reduce((b, r) => b + (+r[6] || 0), 0), 0);
        const tph = fm ? ft / fm * 60 : (l.tph || 0);
        const load = C.reduce((a, c) => a + c.rows.reduce((b, r) => b + (+r[5] || 0), 0), 0);
        const act = ((CA.monthly || []).find((r) => r.m === mon) || {})[l.line];
        return { l, h, cap: h * tph, load, act, tph };
      }
      const h = cal.filter((c) => c.line === l.line && String(c.date).slice(0, 7) === mon).reduce((a, c) => a + c.cap, 0) / 60;
      const load = rows.filter((r) => r[1] === l.line && String(r[0]).slice(0, 7) === mon).reduce((a, r) => a + r[4], 0);
      const act = ((GA.monthly || []).find((r) => r.m === mon) || {})[l.line];
      return { l, h, cap: h * (l.tph || 0), load, act };
    });
    if (capL.length) {
      const G = capL.filter((x) => !x.na), sub = (pl) => G.filter((x) => x.l.pl === pl), ps = (pl) => { const L = sub(pl); return [L.reduce((a, x) => a + x.load, 0), L.reduce((a, x) => a + x.cap, 0)]; };
      const [lg, cgc] = ps('G'), [lc, ccc] = ps('C'), pg = pc(lg, cgc), pcc = pc(lc, ccc), tn = (p) => (p > 100 ? 'neg' : p >= 90 ? 'wrn' : 'pos');
      cards.push(card('생산능력', `${+mon.slice(5)}월 · 도금 능력 = 계획 캘린더 가동시간 × 판생 t/h · 컬러 = (1,440분 − 계획 휴지) × 계획 평균 t/h`,
        `<div class="pf-two">${sub('G').length ? big(pg, tn(pg), `도금 부하율 · ${n0(lg)} / ${n0(cgc)}t`) : ''}${sub('C').length ? big(pcc, tn(pcc), `컬러 부하율 · ${n0(lc)} / ${n0(ccc)}t`) : ''}</div>`
        + tbl(['라인', '가동시간(h)', '가용 능력(t)', '계획 부하(t)', '부하율', '실적(t)'], capL.filter((x) => !x.na).map((x) => (`<tr><td class="id">${esc(x.l.line)}</td><td class="r">${n0(x.h)}</td><td class="r">${n0(x.cap)}</td><td class="r">${n0(x.load)}</td><td class="r"><b class="${pc(x.load, x.cap) > 100 ? 'neg' : pc(x.load, x.cap) >= 90 ? 'wrn' : 'pos'}">${pc(x.load, x.cap)}%</b></td><td class="r">${x.act == null ? '-' : n0(x.act)}</td></tr>`)).concat(capL.some((x) => x.na) ? [`<tr><td class="id">${capL.filter((x) => x.na).map((x) => x.l.line).join('·')}</td><td class="r" colspan="5"><span class="sub">이번 달 계획 편성 없음</span></td></tr>`] : []))));
      G.filter((x) => x.l.pl === 'G' && x.load > x.cap).forEach((x) => why.push(['생산능력', `${x.l.line} 계획 부하가 능력의 ${pc(x.load, x.cap)}%`, 'chk', `계획 엔진 속도(제품별)와 판생 t/h ${n1(x.l.tph)} 차이 가능 — 같은 속도 기준 확인 필요`]));
      const cst = CA.stops && CA.stops.w1 && CT.inScope('C') ? Object.entries(CA.stops.w1).map(([l, v]) => [l, Object.entries(v).sort((a, b) => b[1] - a[1])[0]]).sort((a, b) => b[1][1] - a[1][1])[0] : null;
      if (cst) why.push(['생산능력', `컬러 ${cst[0]} 지난주 ${cst[1][0]} 하루 ${n1(cst[1][1])}h`, 'ok', `MES 휴지 기록 유형 1위(라인 휴지 전체 아님)`]);   // 11/10 점검: '휴지 하루 6h'가 전체 휴지(12.5h)처럼 읽힘
    }
    // ④ 주문 소재 지연 비중(도금): 필요 입고일보다 소재 입고(예정)가 늦은 미완료 주문 비중 — 입고 정시율 아님
    const G = CT.inScope('G') ? M.G.filter((o) => !o.closed && !CT.isStale(o) && o.remT > 0.5) : [];
    if (G.length) {
      const by = {}; G.forEach((o) => { const b = by[o.grp] = by[o.grp] || { n: 0, t: 0, ln: 0, lt: 0 }; b.n++; b.t += o.remT; if (o.src.lateIn) { b.ln++; b.lt += o.remT; } });
      const R = Object.entries(by).sort((a, b) => b[1].t - a[1].t), lt = G.filter((o) => o.src.lateIn), p = pc(lt.length, G.length);
      cards.push(card('주문 소재 지연 비중', '도금 미완료 주문 중 필요 입고일 대비 소재 지연 비중 · 입고 정시율 아님', big(p, p <= 5 ? 'pos' : p <= 15 ? 'wrn' : 'neg', `지연 ${n0(lt.length)} / ${n0(G.length)}건 · ${n0(lt.reduce((a, o) => a + o.remT, 0))}t`)
        + tbl(['판매그룹', '주문', '소재 지연', '지연 잔량(t)', '지연 비중'], R.map(([g, x]) => { const q = pc(x.ln, x.n); return `<tr><td class="id">${esc(g)}</td><td class="r">${n0(x.n)}</td><td class="r">${n0(x.ln)}</td><td class="r">${n0(x.lt)}</td><td class="r"><b class="${q <= 5 ? 'pos' : q <= 15 ? 'wrn' : 'neg'}">${q}%</b></td></tr>`; }))));
      const wz = R.slice().sort((a, b) => b[1].lt - a[1].lt)[0];
      if (wz && wz[1].lt) why.push(['소재 지연', `${wz[0]} 지연 잔량 ${n0(wz[1].lt)}t 가장 큼`, 'ok', `F/H 입고 이력·예정일이 필요 입고일 지남(${wz[1].ln}건)`]);
      const MO = (D.mat_order && D.mat_order.groups && D.mat_order.groups.mats) || [];
      const late = (window.UI && UI.matView ? UI.matView(D.mat_order, D.portal) : MO).filter((x) => x.st === 'late' && CT.inScope(x.plant || 'G'));   // 11/10 점검: 소재 화면과 같은 공통 기준(마감 지남 4개 vs 6개)
      if (late.length) { const ls = late.slice().sort((a, b) => (b.lateT || 0) - (a.lateT || 0)); why.push(['소재 지연', `소재 발주 마감 지남 ${late.length}개`, 'rel', `${ls.map((x) => `${x.name}${x.lateT >= 0.5 ? ` ${n0(x.lateT)}t` : ''}`).join(' · ')} — 발주 지연이 입고 지연으로 이어질 수 있음`]); }   // 11/13 점검: 5개 중 3개만 쓰던 것 → 전부(큰 순)
    }
    // ⑤ 제품 재고
    const stk = ((P.sr && P.sr.stock) || []).filter((s) => !/소재/.test(s.name) && CT.inScope(/^도금/.test(s.name) ? 'G' : 'C'));
    if (stk.length) {
      cards.push(card('제품 재고', `판매생산속보 ${md(P.sr.asOf)} 실재고 vs 월말 목표`,
        tbl(['재고', '실재고(t)', '목표(t)', '목표 대비'], stk.map((s) => { const q = s.target ? pc(s.current, s.target) : null; return `<tr><td class="id">${esc(s.name)}</td><td class="r"><b>${n0(s.current)}</b></td><td class="r">${s.target ? n0(s.target) : '-'}</td><td class="r"><b class="${q == null ? '' : q > 100 ? 'wrn' : 'pos'}">${q == null ? '-' : q + '%'}</b></td></tr>`; }))));
      stk.filter((s) => s.target && s.current > s.target).forEach((s) => {
        const pl = /^도금/.test(s.name) ? 'G' : 'C', sh = (P.groups || []).filter((g) => g.pl === pl && g.ship && g.ship.actual < g.ship.sched);
        const dim = new Date(+mon.slice(0, 4), +mon.slice(5), 0).getDate(), el = +String(P.asOf).slice(8, 10) / dim;
        const ov = (P.groups || []).filter((g) => g.pl === pl && g.ship && g.prod && g.prod.month && g.prod.actual > g.prod.month * el * 1.1);
        const ev = sh.map((g) => `${g.name} 출하 일정 미달 ${n0(g.ship.sched - g.ship.actual)}t`).concat(ov.map((g) => `${g.name} 생산 진도 초과 ${n0(g.prod.actual - g.prod.month * el)}t`));
        why.push(['제품 재고', `${s.name} 목표의 ${pc(s.current, s.target)}%`, ev.length ? 'rel' : 'chk', ev.length ? ev.join(' · ') : '같은 공정 출하 미달·생산 초과 없음 — 재고 구성(장기·대기재) 확인 필요']);
      });
    }
    // ⑥ 출하
    const sh = (P.groups || []).filter((g) => g.ship && CT.inScope(g.pl));
    if (sh.length) {
      cards.push(card('출하', `판매생산속보 일정 누계 대비 실적 · ${md(String(sh[0].ship.asOf).slice(0, 10))}`,
        tbl(['판매그룹', '월 계획(t)', '일정 누계', '실적', '차이'], sh.map((g) => { const d = g.ship.actual - g.ship.sched; return `<tr><td class="id">${esc(g.name)}</td><td class="r">${n0(g.ship.month)}</td><td class="r">${n0(g.ship.sched)}</td><td class="r"><b>${n0(g.ship.actual)}</b></td><td class="r ${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : '−'}${n0(Math.abs(d))}</td></tr>`; }))));
      sh.filter((g) => g.ship.actual < g.ship.sched).forEach((g) => why.push(['출하', `${g.name} 일정보다 ${n0(g.ship.sched - g.ship.actual)}t 적게 출하`, 'chk', '출하 지연 사유(선적·배차) 자료 없음']));
    }
    return { P, M, LP, cards, why };
  }

  /* #cause 편차 원인 — 근거 등급 표시 */
  function cause(A) {
    const n = (k) => A.why.filter((w) => w[2] === k).length;
    const ks = Object.keys(LV);
    const rows = A.why.slice().sort((a, b) => ks.indexOf(a[2]) - ks.indexOf(b[2]));
    const met = [...new Set(rows.map((w) => w[0]))];
    return `<section class="card"><h2>미달 원인 <small>근거 확인 정도별</small></h2>`
      + `<div class="pf-lv">${ks.map((k) => `<span class="pf-l ${LV[k][1]}">${LV[k][0]} <b>${n(k)}</b></span>`).join('')}<span class="sub">확인된 원인 = MES 휴지코드·입고 이력 근거 · 연관 가능 = 같은 시기 관찰 · 추가 확인 = 근거 없음</span></div>`
      + met.map((mt) => `<h3 class="pf-h">${esc(mt)}</h3><div class="ct-wrap"><table class="ct-t pf-t"><thead><tr><th>차이</th><th>근거 확인</th><th>근거</th></tr></thead><tbody>${rows.filter((w) => w[0] === mt).map((w) => `<tr><td class="w1"><b>${esc(w[1])}</b></td><td><span class="pf-l ${LV[w[2]][1]}">${LV[w[2]][0]}</span></td><td class="w">${esc(w[3])}</td></tr>`).join('')}</tbody></table></div>`).join('')
      + (rows.length ? '' : '<p class="ct-note">차이 없음</p>') + '</section>';
  }
})();
