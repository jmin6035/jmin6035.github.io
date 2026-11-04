/* 07 성과 분석(11/4 개편, docs/22 · PRD 9A): 수주 이행 · 계획 대비 실적 · 생산능력 · 소재 적기 입고 · 재고 · 출하 — 숫자 몇 개 + 편차 이유(자료에서 뽑은 한 줄)
   원천: cg_order_progress(perf) + cc_order_progress(CT.orders) · portal(acc·roll·sr·groups) · plating_actual/color_actual(monthly·stops) · mat_order */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'portal.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json', 'mat_order.enc.json'], render);
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const tone = (p, g = 95, w = 85) => (p == null ? '' : p >= g ? 'pos' : p >= w ? 'wrn' : 'neg');
  const card = (title, sub, body, why) => `<section class="card pf-c"><h2>${esc(title)} <small>${esc(sub)}</small></h2>${body}${why ? `<p class="pf-why"><b>편차 이유</b> ${why}</p>` : ''}</section>`;
  const tbl = (head, rows) => `<div class="ct-wrap"><table class="ct-t"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

  function render(D) {
    const P = D.portal || {}, cg = D.cg_order_progress || {}, GA = D.plating_actual || {}, CA = D.color_actual || {};
    const M = CT.orders(D), out = [];
    // ① 수주 이행: 최근 2주 생산이 생산 필요일 안에 끝난 비율(톤)
    const pf = (cg.perf && cg.perf.groups) || {};
    const pr = Object.entries(pf).filter(([g]) => CT.inScope(/^컬러|^수요/.test(g) ? 'C' : 'G')).sort((a, b) => b[1].t - a[1].t);
    if (pr.length) {
      const worst = pr.filter(([, x]) => x.known >= 50).sort((a, b) => a[1].ok / a[1].known - b[1].ok / b[1].known)[0];
      const cz = worst ? M.all.filter((o) => o.grp === CT.grpName(worst[0]) && o.risk === '위험') : [];
      const cc = {}; cz.forEach((o) => { cc[o.cause] = (cc[o.cause] || 0) + (o.remT || 0); });
      const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0];
      const tot = pr.reduce((a, [, x]) => [a[0] + x.ok, a[1] + x.known], [0, 0]);
      out.push(card('수주 이행', `최근 2주 생산 · 생산 필요일 안 완료 · ${md(cg.perf.from)}~`,
        `<div class="pf-big ${tone(pc(tot[0], tot[1]))}">${pc(tot[0], tot[1])}<span class="u">%</span><span class="pf-s">${n0(tot[0])} / ${n0(tot[1])}t</span></div>`
        + tbl(['판매그룹', '생산(t)', '기한 안(t)', '준수율'], pr.map(([g, x]) => { const p = pc(x.ok, x.known); return `<tr><td class="id">${esc(CT.grpName(g))}</td><td class="r">${n0(x.t)}</td><td class="r">${n0(x.ok)}</td><td class="r"><b class="${tone(p)}">${p}%</b></td></tr>`; })),
        worst ? `${esc(CT.grpName(worst[0]))} ${pc(worst[1].ok, worst[1].known)}%가 가장 낮음${top ? ` — 지금 위험 주문의 주원인 <b>${esc(CT.CAUSE[top[0]])}</b> ${n0(top[1])}t` : ''}` : ''));
    }
    // ② 생산계획: 그날 아침 계획 대비 실적(최근 14일) · 10/1부터 누계
    const acc = Object.entries(P.acc || {}).filter(([l]) => CT.inScope(/CGL/.test(l) ? 'G' : 'C'));
    if (acc.length) {
      const big = acc.slice().sort((a, b) => Math.abs(b[1].bias) - Math.abs(a[1].bias))[0];
      const dayW = (big[1].last || []).map((x) => [x[0], x[3] - x[2]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      const st = (GA.stops && GA.stops.w1 && GA.stops.w1[big[0]]) || {}, stTop = Object.entries(st).sort((a, b) => b[1] - a[1])[0];
      const roll = P.roll;
      out.push(card('생산계획', `그날 아침 계획 대비 실적 · 최근 ${big[1].days}일`,
        (roll ? `<div class="pf-big ${tone(pc(roll.actual, roll.plan), 98, 90)}">${pc(roll.actual, roll.plan)}<span class="u">%</span><span class="pf-s">도금 10/1~${md(roll.asOf)} 실적 ${n0(roll.actual)} / 계획 ${n0(roll.plan)}t</span></div>` : '')
        + tbl(['라인', '계획(t)', '실적(t)', '편차', '하루 오차', '미달 일수'], acc.map(([l, x]) => `<tr><td class="id">${esc(l)}</td><td class="r">${n0(x.plan)}</td><td class="r">${n0(x.actual)}</td><td class="r"><b class="${Math.abs(x.bias) <= 5 ? 'pos' : Math.abs(x.bias) <= 15 ? 'wrn' : 'neg'}">${x.bias >= 0 ? '+' : ''}${n1(x.bias)}%</b></td><td class="r">${n1(x.mae)}%</td><td class="r">${x.under}일</td></tr>`)),
        `${esc(big[0])} 편차 ${big[1].bias >= 0 ? '+' : ''}${n1(big[1].bias)}% 가장 큼${dayW ? ` — ${md(dayW[0])} 하루 ${dayW[1] >= 0 ? '+' : '−'}${n0(Math.abs(dayW[1]))}t` : ''}${stTop && stTop[1] >= 0.1 ? ` · 지난주 휴지 상위 ${esc(stTop[0])} 하루 ${n1(stTop[1])}h` : ''}`));
    }
    // ③ 생산능력: 월별 실적 추이(라인)
    const mon = [];
    if (CT.inScope('G')) mon.push(['G', GA.monthly || [], ['1CGL', '2CGL']]);
    if (CT.inScope('C')) mon.push(['C', CA.monthly || [], ['1CCL', '2CCL', '3CCL', '4CCL']]);
    const ms = [...new Set(mon.flatMap(([, R]) => R.map((r) => r.m)))].sort().slice(-6);
    if (ms.length) {
      const full = ms.filter((m) => m < String(P.asOf || '').slice(0, 7));
      const chg = []; mon.forEach(([, R, Ls]) => Ls.forEach((l) => { const a = R.find((r) => r.m === full[full.length - 2]), b = R.find((r) => r.m === full[full.length - 1]); if (a && b && a[l]) chg.push([l, b[l] - a[l], full[full.length - 1]]); }));
      const cw = chg.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      const cst = CA.stops && CA.stops.w1 ? Object.entries(CA.stops.w1).map(([l, v]) => [l, Object.entries(v).sort((a, b) => b[1] - a[1])[0]]).sort((a, b) => b[1][1] - a[1][1])[0] : null;
      out.push(card('생산능력', '라인별 월 생산(t) · 이번 달은 누계',
        tbl(['라인', ...ms.map((m) => `${+m.slice(5)}월`)], mon.flatMap(([, R, Ls]) => Ls.map((l) => `<tr><td class="id">${l}</td>${ms.map((m) => { const r = R.find((x) => x.m === m); return `<td class="r">${r && r[l] != null ? n0(r[l]) : '-'}</td>`; }).join('')}</tr>`))),
        (cw ? `${esc(cw[0])} ${+cw[2].slice(5)}월이 전월보다 ${cw[1] >= 0 ? '+' : '−'}${n0(Math.abs(cw[1]))}t 변동 가장 큼` : '') + (cst && CT.inScope('C') ? ` · 컬러 지난주 휴지 상위 ${esc(cst[0])} ${esc(cst[1][0])} 하루 ${n1(cst[1][1])}h` : '')));
    }
    // ④ 소재 적기 입고(도금 F/H): 소재 지연 주문 비중 · 소재 발주 마감
    const G = M.G.filter((o) => o.risk !== '완료' && CT.inScope('G'));
    if (G.length) {
      const by = {}; G.forEach((o) => { const b = by[o.grp] = by[o.grp] || { n: 0, t: 0, ln: 0, lt: 0 }; b.n++; b.t += o.remT; if (o.src.lateIn) { b.ln++; b.lt += o.remT; } });
      const R = Object.entries(by).sort((a, b) => b[1].t - a[1].t), lt = G.filter((o) => o.src.lateIn), wz = R.slice().sort((a, b) => b[1].lt - a[1].lt)[0];
      const MO = (D.mat_order && D.mat_order.groups && D.mat_order.groups.mats) || [];
      const late = MO.filter((m) => m.st === 'late').length, soon = MO.filter((m) => m.st === 'soon').length;
      out.push(card('소재 적기 입고', '도금 미완료 주문 중 필요 입고일보다 소재가 늦은 비중',
        `<div class="pf-big ${tone(100 - pc(lt.length, G.length))}">${100 - pc(lt.length, G.length)}<span class="u">%</span><span class="pf-s">적기 · 지연 ${n0(lt.length)} / ${n0(G.length)}건</span></div>`
        + tbl(['판매그룹', '주문', '소재 지연', '지연 잔량(t)', '적기율'], R.map(([g, x]) => { const p = 100 - pc(x.ln, x.n); return `<tr><td class="id">${esc(g)}</td><td class="r">${n0(x.n)}</td><td class="r">${n0(x.ln)}</td><td class="r">${n0(x.lt)}</td><td class="r"><b class="${tone(p)}">${p}%</b></td></tr>`; })),
        `${wz && wz[1].lt ? `${esc(wz[0])} 지연 잔량 ${n0(wz[1].lt)}t 가장 큼` : ''}${MO.length ? ` · 소재 발주 마감 지남 ${late} · 2주 안 ${soon}개 소재` : ''}`));
    }
    // ⑤ 재고: 실재고 vs 목표
    const stk = ((P.sr && P.sr.stock) || []).filter((s) => CT.inScope(/^도금/.test(s.name) ? 'G' : 'C'));
    if (stk.length) {
      const ov = stk.filter((s) => s.target).sort((a, b) => b.current / b.target - a.current / a.target)[0];
      out.push(card('재고', `판매생산속보 ${md(P.sr.asOf)} 실재고 vs 월말 목표`,
        tbl(['재고', '실재고(t)', '목표(t)', '목표 대비'], stk.map((s) => { const p = s.target ? pc(s.current, s.target) : null; return `<tr><td class="id">${esc(s.name)}</td><td class="r"><b>${n0(s.current)}</b></td><td class="r">${s.target ? n0(s.target) : '-'}</td><td class="r"><b class="${p == null ? '' : p > 110 ? 'neg' : p < 70 ? 'wrn' : 'pos'}">${p == null ? '-' : p + '%'}</b></td></tr>`; })),
        ov ? `${esc(ov.name)} 목표의 ${pc(ov.current, ov.target)}% (${ov.current >= ov.target ? '+' : '−'}${n0(Math.abs(ov.current - ov.target))}t)` : ''));
    }
    // ⑥ 출하: 판생속보 일정 누계 대비 출하 실적
    const sh = (P.groups || []).filter((g) => g.ship && CT.inScope(g.pl));
    if (sh.length) {
      const wz = sh.slice().sort((a, b) => (a.ship.actual - a.ship.sched) - (b.ship.actual - b.ship.sched))[0];
      out.push(card('출하', `판매생산속보 일정 누계 대비 실적 · ${md(String(sh[0].ship.asOf).slice(0, 10))}`,
        tbl(['판매그룹', '월 계획(t)', '일정 누계', '실적', '차이'], sh.map((g) => { const d = g.ship.actual - g.ship.sched; return `<tr><td class="id">${esc(g.name)}</td><td class="r">${n0(g.ship.month)}</td><td class="r">${n0(g.ship.sched)}</td><td class="r"><b>${n0(g.ship.actual)}</b></td><td class="r ${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : '−'}${n0(Math.abs(d))}</td></tr>`; })),
        wz && wz.ship.actual < wz.ship.sched ? `${esc(wz.name)} 일정보다 ${n0(wz.ship.sched - wz.ship.actual)}t 적게 출하` : '전 그룹 일정 이상 출하'));
    }
    document.getElementById('ct-main').innerHTML = CT.basis([{ name: '주문 진도', at: M.asOf, kind: '실적' }, { name: '생산 실적', at: P.asOf, kind: '실적' }, { name: '판생속보', at: P.sr && P.sr.asOf, kind: '확정계획' }])
      + `<p class="pf-top"><a class="pf-btn" href="report.html">주간 보고 →</a></p><div class="pf-g">${out.join('')}</div>`;
  }
})();
