/* 07 성과 분석(11/4 2차 진단 10장): #ops 운영 성과(숫자) · #cause 편차 원인(근거 등급: 확인된 원인 / 연관 가능 요인 / 추가 확인 필요)
   원천: cg_order_progress(perf) + cc_order_progress(CT.orders) · portal(acc·roll·sr·groups·lines) · plating_actual(daily·dayStops·stops) · color_actual · mat_order · latest.plan(cal 가동시간·rows 계획) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['ops', 'cause'];
  let bound = false;
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'portal.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json', 'mat_order.enc.json', 'latest.plan.enc.json'], draw);
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const tone = (p, g = 95, w = 85) => (p == null ? '' : p >= g ? 'pos' : p >= w ? 'wrn' : 'neg');
  const card = (title, sub, body) => `<section class="card pf-c"><h2>${esc(title)} <small>${esc(sub)}</small></h2>${body}</section>`;
  const tbl = (head, rows) => `<div class="ct-wrap"><table class="ct-t"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const big = (p, cls, s) => `<div class="pf-big ${cls}">${p == null ? '-' : p}<span class="u">%</span><span class="pf-s">${s}</span></div>`;
  const LV = { ok: ['확인된 원인', 'c1'], rel: ['연관 가능 요인', 'c2'], chk: ['추가 확인 필요', 'c3'] };

  function draw(D) {
    const m = document.getElementById('ct-main'), v = CT.view('ops', VIEWS), A = calc(D);
    m.innerHTML = CT.basis([{ name: '주문 진도', at: A.M.asOf, kind: '실적' }, { name: '생산 실적', at: A.P.asOf, kind: '실적' }, { name: '판생속보', at: A.P.sr && A.P.sr.asOf, kind: '확정계획' }, A.LP && { name: '가동계획', at: A.LP.savedAt, kind: '재계획' }])
      + (v === 'cause' ? cause(A) : `<p class="pf-top"><a class="pf-btn" href="report.html">주간 보고 →</a></p><div class="pf-g">${A.cards.join('')}</div>`);
    if (!bound) { bound = true; CT.onView(() => { draw(D); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }

  function calc(D) {
    const P = D.portal || {}, cg = D.cg_order_progress || {}, GA = D.plating_actual || {}, CA = D.color_actual || {}, LP = D['latest.plan'];
    const M = CT.orders(D), cards = [], why = [];   // why: [지표, 등급, 문장]
    const mon = String(P.asOf || '').slice(0, 7);
    // ① 수주 이행
    const pf = (cg.perf && cg.perf.groups) || {};
    const pr = Object.entries(pf).filter(([g]) => CT.inScope(/^컬러|^수요/.test(g) ? 'C' : 'G')).sort((a, b) => b[1].t - a[1].t);
    if (pr.length) {
      const tot = pr.reduce((a, [, x]) => [a[0] + x.ok, a[1] + x.known], [0, 0]), p = pc(tot[0], tot[1]);
      cards.push(card('수주 이행', `최근 2주 생산 · 생산 필요일 안 완료 · ${md(cg.perf.from)}~`, big(p, tone(p), `${n0(tot[0])} / ${n0(tot[1])}t`)
        + tbl(['판매그룹', '생산(t)', '기한 안(t)', '준수율'], pr.map(([g, x]) => { const q = pc(x.ok, x.known); return `<tr><td class="id">${esc(CT.grpName(g))}</td><td class="r">${n0(x.t)}</td><td class="r">${n0(x.ok)}</td><td class="r"><b class="${tone(q)}">${q}%</b></td></tr>`; }))));
      const worst = pr.filter(([, x]) => x.known >= 50).sort((a, b) => a[1].ok / a[1].known - b[1].ok / b[1].known)[0];
      if (worst) {
        const cz = M.all.filter((o) => o.grp === CT.grpName(worst[0]) && o.risk === '위험'), cc = {};
        cz.forEach((o) => { cc[o.cause] = (cc[o.cause] || 0) + (o.remT || 0); });
        const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0];
        why.push(['수주 이행', `${CT.grpName(worst[0])} ${pc(worst[1].ok, worst[1].known)}% 가장 낮음`, top ? 'rel' : 'chk',
          top ? `지금 같은 그룹 위험 주문의 주원인 ${CT.CAUSE[top[0]]} ${n0(top[1])}t — 현재 판정이라 지난 2주 미준수의 직접 원인은 아님` : '같은 그룹 위험 주문 없음 — 미준수 주문별 지연 사유 자료 없음']);
      }
    }
    // ② 생산계획(도금: 그날 아침 계획 대비)
    const acc = Object.entries(P.acc || {}).filter(([l]) => CT.inScope(/CGL/.test(l) ? 'G' : 'C'));
    if (acc.length) {
      const roll = P.roll, p = roll ? pc(roll.actual, roll.plan) : null;
      cards.push(card('생산계획 정확도', `그날 아침 계획 대비 실적 · 최근 ${acc[0][1].days}일`, (roll ? big(p, tone(p, 98, 90), `도금 10/1~${md(roll.asOf)} 실적 ${n0(roll.actual)} / 계획 ${n0(roll.plan)}t`) : '')
        + tbl(['라인', '계획(t)', '실적(t)', '편차', '하루 오차', '미달 일수'], acc.map(([l, x]) => `<tr><td class="id">${esc(l)}</td><td class="r">${n0(x.plan)}</td><td class="r">${n0(x.actual)}</td><td class="r"><b class="${Math.abs(x.bias) <= 5 ? 'pos' : Math.abs(x.bias) <= 15 ? 'wrn' : 'neg'}">${x.bias >= 0 ? '+' : ''}${n1(x.bias)}%</b></td><td class="r">${n1(x.mae)}%</td><td class="r">${x.under}일</td></tr>`))));
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
    const capL = (P.lines || []).filter((l) => CT.inScope(l.pl)).map((l) => {
      if (l.pl !== 'G') return { l, na: true };
      const h = cal.filter((c) => c.line === l.line && String(c.date).slice(0, 7) === mon).reduce((a, c) => a + c.cap, 0) / 60;
      const load = rows.filter((r) => r[1] === l.line && String(r[0]).slice(0, 7) === mon).reduce((a, r) => a + r[4], 0);
      const act = ((GA.monthly || []).find((r) => r.m === mon) || {})[l.line];
      return { l, h, cap: h * (l.tph || 0), load, act };
    });
    if (capL.length) {
      const G = capL.filter((x) => !x.na), cap = G.reduce((a, x) => a + x.cap, 0), load = G.reduce((a, x) => a + x.load, 0), p = pc(load, cap);
      cards.push(card('생산능력', `${+mon.slice(5)}월 · 능력 = 계획 캘린더 가동시간 × 판생 t/h`, (G.length ? big(p, p > 100 ? 'neg' : p >= 90 ? 'wrn' : 'pos', `도금 부하율 · 계획 ${n0(load)} / 능력 ${n0(cap)}t`) : '')
        + tbl(['라인', '가동시간(h)', '가용 능력(t)', '계획 부하(t)', '부하율', '실제 생산 누계(t)'], capL.filter((x) => !x.na).map((x) => (`<tr><td class="id">${esc(x.l.line)}</td><td class="r">${n0(x.h)}</td><td class="r">${n0(x.cap)}</td><td class="r">${n0(x.load)}</td><td class="r"><b class="${pc(x.load, x.cap) > 100 ? 'neg' : pc(x.load, x.cap) >= 90 ? 'wrn' : 'pos'}">${pc(x.load, x.cap)}%</b></td><td class="r">${x.act == null ? '-' : n0(x.act)}</td></tr>`)).concat(capL.some((x) => x.na) ? [`<tr><td class="id">컬러 ${capL.filter((x) => x.na).length}라인</td><td class="r" colspan="5"><span class="sub">자료 없음 — 컬러 가동 캘린더 없음</span></td></tr>`] : []))));
      G.filter((x) => x.load > x.cap).forEach((x) => why.push(['생산능력', `${x.l.line} 계획 부하가 능력의 ${pc(x.load, x.cap)}%`, 'chk', `계획 엔진 속도(제품별)와 판생 t/h ${n1(x.l.tph)} 차이 가능 — 같은 속도 기준 확인 필요`]));
      const cst = CA.stops && CA.stops.w1 && CT.inScope('C') ? Object.entries(CA.stops.w1).map(([l, v]) => [l, Object.entries(v).sort((a, b) => b[1] - a[1])[0]]).sort((a, b) => b[1][1] - a[1][1])[0] : null;
      if (cst) why.push(['생산능력', `컬러 ${cst[0]} 지난주 휴지 하루 ${n1(cst[1][1])}h`, 'ok', `MES 휴지 기록 상위 ${cst[1][0]} — 능력 비교는 컬러 캘린더가 없어 불가`]);
    }
    // ④ 주문 소재 지연 비중(도금): 필요 입고일보다 소재 입고(예정)가 늦은 미완료 주문 비중 — 입고 정시율 아님
    const G = CT.inScope('G') ? M.G.filter((o) => !o.closed && o.remT > 0.5) : [];
    if (G.length) {
      const by = {}; G.forEach((o) => { const b = by[o.grp] = by[o.grp] || { n: 0, t: 0, ln: 0, lt: 0 }; b.n++; b.t += o.remT; if (o.src.lateIn) { b.ln++; b.lt += o.remT; } });
      const R = Object.entries(by).sort((a, b) => b[1].t - a[1].t), lt = G.filter((o) => o.src.lateIn), p = pc(lt.length, G.length);
      cards.push(card('주문 소재 지연 비중', '도금 미완료 주문 중 소재가 필요 입고일보다 늦은 비중 · 입고 정시율 아님', big(p, p <= 5 ? 'pos' : p <= 15 ? 'wrn' : 'neg', `지연 ${n0(lt.length)} / ${n0(G.length)}건 · ${n0(lt.reduce((a, o) => a + o.remT, 0))}t`)
        + tbl(['판매그룹', '주문', '소재 지연', '지연 잔량(t)', '지연 비중'], R.map(([g, x]) => { const q = pc(x.ln, x.n); return `<tr><td class="id">${esc(g)}</td><td class="r">${n0(x.n)}</td><td class="r">${n0(x.ln)}</td><td class="r">${n0(x.lt)}</td><td class="r"><b class="${q <= 5 ? 'pos' : q <= 15 ? 'wrn' : 'neg'}">${q}%</b></td></tr>`; }))));
      const wz = R.slice().sort((a, b) => b[1].lt - a[1].lt)[0];
      if (wz && wz[1].lt) why.push(['소재 지연', `${wz[0]} 지연 잔량 ${n0(wz[1].lt)}t 가장 큼`, 'ok', `F/H 입고 이력·예정일이 필요 입고일보다 늦음(${wz[1].ln}건)`]);
      const MO = (D.mat_order && D.mat_order.groups && D.mat_order.groups.mats) || [];
      const late = MO.filter((x) => x.st === 'late');
      if (late.length) why.push(['소재 지연', `소재 발주 마감 지남 ${late.length}개`, 'rel', `${late.slice(0, 3).map((x) => x.name).join('·')} — 발주 지연이 입고 지연으로 이어질 수 있음`]);
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
    return `<section class="card"><h2>편차 원인 <small>근거 등급별</small></h2>`
      + `<div class="pf-lv">${ks.map((k) => `<span class="pf-l ${LV[k][1]}">${LV[k][0]} <b>${n(k)}</b></span>`).join('')}<span class="sub">확인된 원인 = MES 휴지코드·입고 이력 근거 · 연관 가능 = 같은 시기 관찰 · 추가 확인 = 근거 없음</span></div>`
      + met.map((mt) => `<h3 class="pf-h">${esc(mt)}</h3><div class="ct-wrap"><table class="ct-t pf-t"><thead><tr><th>편차</th><th>근거 등급</th><th>근거</th></tr></thead><tbody>${rows.filter((w) => w[0] === mt).map((w) => `<tr><td class="w1"><b>${esc(w[1])}</b></td><td><span class="pf-l ${LV[w[2]][1]}">${LV[w[2]][0]}</span></td><td class="w">${esc(w[3])}</td></tr>`).join('')}</tbody></table></div>`).join('')
      + (rows.length ? '' : '<p class="ct-note">편차 없음</p>') + '</section>';
  }
})();
