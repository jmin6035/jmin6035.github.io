/* 05 생산·출하(11/4 개편, docs/22): 계획 대비 실적 KPI 4 · 라인별 실적과 휴지 원인 · 가동(최근 자료 기준) · 판매그룹별 출하·제품 재고
   원천: portal(lines·groups·acc·sr·shipDay·week) · plating_actual(daily·dayStops·stops) · color_actual(daily·downAct·stops) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  let per = 'month';
  try { per = localStorage.getItem('ct-prod-per') || 'month'; } catch (e) { /* 무시 */ }
  const CCAT = { color: '색상교체·청소', test: '테스트·도막조정', roll: '폭·롤·두께 전환', gap: '기록 없는 정지', etc: '기타' };
  const SHIPK = { 도금판매: 'G국내', 도금수출: 'G수출', 자동차강판: 'G자동차', 컬러수출: 'C수출', 컬러건재: 'C건재' };
  CT.boot(['portal.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json'], render);

  function render(D) {
    const P = D.portal, GA = D.plating_actual || {}, CA = D.color_actual || {};
    const asOfG = P.asOf, asOfC = CA.asOf || asOfG, mon = String(asOfG).slice(0, 7);
    const lines = (P.lines || []).filter((l) => CT.inScope(l.pl));
    const inPer = (d, asOf) => (per === 'month' ? String(d).slice(0, 7) === String(asOf).slice(0, 7) && d <= asOf : d > CT.addD(asOf, -7) && d <= asOf);
    const daily = (pl) => (pl === 'G' ? GA.daily : CA.daily) || [];
    const accLast = (l) => ((P.acc || {})[l] || {}).last || [];
    // 라인별 기간 실적·계획
    const L = lines.map((l) => {
      const asOf = l.pl === 'G' ? asOfG : asOfC;
      const act = daily(l.pl).filter((r) => inPer(r.d, asOf)).reduce((a, r) => a + (+r[l.line] || 0), 0);
      let plan = null, planSrc = '';
      if (l.pl === 'G') {
        if (per === 'month') { plan = l.sched; planSrc = '판생속보 일정 누계'; }
        else { const A = accLast(l.line).filter((x) => inPer(x[0], asOf)); if (A.length) { plan = A.reduce((a, x) => a + x[2], 0); planSrc = `그날 아침 계획 ${A.length}일`; } }
      }
      const actP = l.pl === 'G' && per === 'week' ? accLast(l.line).filter((x) => inPer(x[0], asOf)).reduce((a, x) => a + x[3], 0) : act;
      const cause = topStop(l, asOf, GA, CA, inPer);
      return { ...l, act: per === 'week' && plan != null ? actP : act, plan, planSrc, cause, asOfL: asOf };
    });
    // KPI 4: 판매그룹 기준(도금·컬러 같은 기준 — 그룹 월 계획 = 최신 가동계획, 남은 계획 = 재계획·편성)
    const Gs = (P.groups || []).filter((g) => CT.inScope(g.pl) && g.prod);
    const mPlan = Gs.reduce((a, g) => a + (g.prod.month || 0), 0), mAct = Gs.reduce((a, g) => a + (g.prod.actual || 0), 0);
    const carry = Gs.reduce((a, g) => a + Math.max(0, (g.prod.month || 0) - (g.prod.actual || 0) - (g.prod.after || 0)), 0);
    const Lp = L.filter((x) => x.plan != null), dPlan = Lp.reduce((a, x) => a + x.plan, 0), dAct = Lp.reduce((a, x) => a + x.act, 0);
    const pAct = L.reduce((a, x) => a + x.act, 0);
    const noC = CT.inScope('C') && L.some((x) => x.pl === 'C');
    const k = [
      { label: per === 'month' ? `${+mon.slice(5)}월 생산계획` : '이번 주 생산계획', v: per === 'month' ? n0(mPlan) : (Lp.length ? n0(dPlan) : '-'), unit: 't', tone: 'info', sub: per === 'month' ? '최신 가동계획 · 판매그룹 합' : (noC ? '도금만(컬러 일별 계획 없음)' : '그날 아침 계획 합') },
      { label: per === 'month' ? '생산실적(누계)' : '이번 주 생산실적', v: n0(per === 'month' ? mAct : pAct), unit: 't', tone: 'info', sub: `MES 실적 ~${md(asOfG)}${noC && asOfC !== asOfG ? ` · 컬러 ~${md(asOfC)}` : ''}` },
      { label: '계획 대비 차이', v: Lp.length ? `${dAct - dPlan >= 0 ? '+' : '−'}${n0(Math.abs(dAct - dPlan))}` : '-', unit: 't', tone: !Lp.length ? '' : dAct >= dPlan ? 'ok' : dAct >= dPlan * 0.95 ? 'warn' : 'bad',
        sub: Lp.length ? `${Lp.map((x) => x.line).join('·')} · ${per === 'month' ? '일정 누계 대비' : '아침 계획 대비'} ${dPlan ? Math.round(dAct / dPlan * 100) : 0}%` : '같은 기간 라인 계획 없음' },
      { label: '이월 예상', v: n0(carry), unit: 't', tone: carry >= 1 ? 'warn' : 'ok', sub: '월 계획 − 실적 − 남은 계획' },
    ];
    const seg = CT.tabs('pp-per', [['month', `${+mon.slice(5)}월`], ['week', '최근 7일']], per);
    const basis = CT.basis([{ name: '도금 실적', at: asOfG, kind: '실적' }, CT.inScope('C') && { name: '컬러 실적', at: asOfC, kind: '실적' }, { name: '판생속보', at: P.sr && P.sr.asOf, kind: '확정계획' }, { name: '그룹 월 계획', at: P.built, kind: '재계획' }]);
    const tr = (x) => { const d = x.plan != null ? x.act - x.plan : null, r = x.plan ? x.act / x.plan : null;
      return `<tr class="ck" data-l="${esc(x.line)}"><td class="id">${esc(x.line)}<small>${x.pl === 'G' ? '도금' : '컬러'}${x.fam ? ` · ${esc(x.fam)}` : ''}</small></td>`
        + `<td class="r">${x.plan != null ? n0(x.plan) : '<span class="sub">계획 없음</span>'}</td><td class="r"><b>${n0(x.act)}</b></td>`
        + `<td class="r ${d == null ? '' : d >= 0 ? 'pos' : 'neg'}">${d == null ? '-' : `${d >= 0 ? '+' : '−'}${n0(Math.abs(d))}`}</td>`
        + `<td class="r">${r == null ? '-' : `<b class="${r >= 1 ? 'pos' : r >= 0.95 ? 'wrn' : 'neg'}">${Math.round(r * 100)}%</b>`}</td>`
        + `<td class="w">${x.cause.length ? x.cause.slice(0, 2).map(([c, h]) => `<span class="pp-c">${esc(c)} <b>${n1(h)}h</b></span>`).join('') : '<span class="sub">기록 없음</span>'}</td></tr>`; };
    const tbl = `<div class="ct-wrap"><table class="ct-t pp-t"><thead><tr><th>라인</th><th class="r" title="${per === 'month' ? '도금 = 판생속보 일정 누계, 컬러 = 라인 계획 없음' : '도금 = 그날 아침 계획 합'}">계획</th><th class="r">실적</th><th class="r">차이</th><th class="r">달성률</th><th>휴지 상위(시간)</th></tr></thead><tbody>${L.map(tr).join('')}</tbody></table></div>`;
    // 가동(실시간 아님 — 최근 자료 기준)
    const ev = (P.week && P.week.events) || [];
    const runRow = (x) => { const last = (x.days || []).slice(-3), nxt = x.pl === 'G' ? x.next : (() => { const e = ev.find((e_) => e_.pl === 'C' && e_.text.startsWith(x.line)); return e ? [e.d, e.text.replace(x.line + ' ', '')] : null; })();
      const st = lastStops(x, GA, CA);
      return `<tr><td class="id">${esc(x.line)}</td><td>${md(x.asOfL)} 기준</td><td class="r">${last.length ? last.map((dd) => `<span class="pp-d">${md(dd[0])} <b>${n0(dd[1])}</b></span>`).join('') : (() => { const dd = daily(x.pl).slice(-3); return dd.map((r) => `<span class="pp-d">${md(r.d)} <b>${n0(r[x.line])}</b></span>`).join(''); })()}</td>`
        + `<td class="w">${st || '<span class="sub">기록 없음</span>'}</td><td>${nxt ? `<b>${md(nxt[0])}</b> ${esc(nxt[1])}` : '<span class="sub">-</span>'}</td></tr>`; };
    const run = `<div class="ct-wrap"><table class="ct-t"><thead><tr><th>라인</th><th>최근 자료</th><th class="r">최근 3일 생산(t)</th><th>최근 휴지</th><th>다음 일정</th></tr></thead><tbody>${L.map(runRow).join('')}</tbody></table></div>`;
    // 출하·제품 재고
    const SD = (P.shipDay && P.shipDay.g) || {};
    const ships = ((P.sr && P.sr.ship) || []).filter((s) => s.name !== '합계' && SHIPK[s.name] && CT.inScope(SHIPK[s.name][0]));
    const shipAct = (key) => Object.entries(SD[key] || {}).filter(([dd]) => dd.slice(0, 7) === mon).reduce((a, [, v]) => a + v, 0);
    const shRow = (s) => { const k_ = SHIPK[s.name], a = SD[k_] ? shipAct(k_) : s.actual, r = s.month ? a / s.month : 0;
      return `<tr><td class="id">${esc(s.name)}</td><td class="r">${n0(s.month)}</td><td class="r">${n0(s.sched)}</td><td class="r"><b>${n0(a)}</b></td><td class="r ${a >= s.sched ? 'pos' : 'neg'}">${a - s.sched >= 0 ? '+' : '−'}${n0(Math.abs(a - s.sched))}</td><td class="r">${Math.round(r * 100)}%</td><td class="pp-bar"><i style="width:${Math.min(100, r * 100).toFixed(1)}%"></i></td></tr>`; };
    const sh = `<div class="ct-wrap"><table class="ct-t"><thead><tr><th>판매그룹</th><th class="r" title="판매생산속보 월 출하 계획(확정)">월 출하계획</th><th class="r" title="판생속보 오늘까지 출하 일정 누계">일정 누계</th><th class="r">출하 실적</th><th class="r">일정 대비</th><th class="r">월 진도</th><th></th></tr></thead><tbody>${ships.map(shRow).join('')}</tbody></table></div>`;
    const stk = ((P.sr && P.sr.stock) || []).filter((s) => CT.inScope(/^도금/.test(s.name) ? 'G' : 'C'));
    const skRow = (s) => { const r = s.target ? s.current / s.target : null;
      return `<tr><td class="id">${esc(s.name)}</td><td class="r"><b>${n0(s.current)}</b></td><td class="r">${s.target ? n0(s.target) : '<span class="sub">목표 없음</span>'}</td><td class="r ${r == null ? '' : r > 1.1 ? 'neg' : r < 0.7 ? 'wrn' : 'pos'}">${r == null ? '-' : Math.round(r * 100) + '%'}</td><td class="r">${s.target ? `${s.current - s.target >= 0 ? '+' : '−'}${n0(Math.abs(s.current - s.target))}` : '-'}</td></tr>`; };
    const sk = `<div class="ct-wrap"><table class="ct-t"><thead><tr><th>재고</th><th class="r" title="판매생산속보 실재고">실재고</th><th class="r" title="월말 목표(판생 상한)">목표</th><th class="r">목표 대비</th><th class="r">차이</th></tr></thead><tbody>${stk.map(skRow).join('')}</tbody></table></div>`;
    const m = document.getElementById('ct-main');
    m.innerHTML = basis + `<section class="card"><h2>생산 실적 <small>계획 대비</small><span class="unit">톤</span></h2>${seg}${CT.kpis(k)}${tbl}</section>`
      + `<section class="card"><h2>가동 현황 <small>실시간 연결 아님 — 최근 자료 기준</small></h2>${run}</section>`
      + `<div class="pp-2"><section class="card"><h2>출하 <small>판매생산속보 ${md(P.sr && P.sr.asOf)} · 실적 MES 출하</small><span class="unit">톤</span></h2>${sh}</section>`
      + `<section class="card"><h2>제품·소재 재고 <small>실재고 vs 목표</small><span class="unit">톤</span></h2>${sk}</section></div>`;
    m.querySelectorAll('#pp-per button').forEach((b) => b.onclick = () => { per = b.dataset.k; try { localStorage.setItem('ct-prod-per', per); } catch (e) { /* 무시 */ } render(D); });
    m.querySelectorAll('tr[data-l]').forEach((t) => t.onclick = () => { const x = L.find((y) => y.line === t.dataset.l); CT.panel(lineDetail(x, D, inPer), `${x.line} ${per === 'month' ? `${+mon.slice(5)}월` : '최근 7일'}`); });
  }

  /* 휴지 상위 원인(기간 합, 시간): 도금 = 일별 휴지 기록, 컬러 = MES 실제 휴지 */
  function topStop(l, asOf, GA, CA, inPer) {
    const c = {};
    if (l.pl === 'G') {
      for (const [d, v] of Object.entries(GA.dayStops || {})) if (inPer(d, asOf)) for (const s of v[l.line] || []) c[s[0]] = (c[s[0]] || 0) + s[1] / 60;
    } else {
      for (const [d, v] of Object.entries((CA.downAct || {}).days || {})) if (inPer(d, asOf)) for (const s of v[l.line] || []) { const k = CCAT[s[0]] || s[0]; c[k] = (c[k] || 0) + s[1] / 60; }
    }
    return Object.entries(c).filter(([, h]) => h >= 0.05).sort((a, b) => b[1] - a[1]);
  }
  function lastStops(l, GA, CA) {
    if (l.pl === 'G') {
      const E = Object.entries(GA.dayStops || {}).filter(([, v]) => (v[l.line] || []).length).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
      return E ? `${md(E[0])} ${E[1][l.line].slice(0, 2).map((s) => `${esc(s[2] || s[0])} ${n0(s[1])}분`).join(' · ')}` : '';
    }
    const E = Object.entries((CA.downAct || {}).days || {}).filter(([, v]) => (v[l.line] || []).length).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
    return E ? `${md(E[0])} ${E[1][l.line].slice(0, 3).map((s) => `${esc(CCAT[s[0]] || s[0])} ${n0(s[1])}분`).join(' · ')}` : '';
  }
  function lineDetail(x, D, inPer) {
    const GA = D.plating_actual || {}, CA = D.color_actual || {}, P = D.portal;
    const days = ((x.pl === 'G' ? GA.daily : CA.daily) || []).filter((r) => inPer(r.d, x.asOfL));
    const plan = Object.fromEntries((((P.acc || {})[x.line] || {}).last || []).map((a) => [a[0], a[2]]));
    const mx = Math.max(1, ...days.map((r) => Math.max(+r[x.line] || 0, plan[r.d] || 0)));
    const bars = days.map((r) => { const a = +r[x.line] || 0, p = plan[r.d];
      return `<div class="pp-dr"><span class="d">${md(r.d)}</span><span class="b"><i style="width:${(a / mx * 100).toFixed(1)}%"></i>${p != null ? `<u style="left:${(p / mx * 100).toFixed(1)}%" title="아침 계획 ${n0(p)}t"></u>` : ''}</span><span class="v">${n0(a)}${p != null ? `<small> / ${n0(p)}</small>` : ''}</span></div>`; }).join('');
    const st = [];
    if (x.pl === 'G') for (const [d, v] of Object.entries(GA.dayStops || {})) { if (inPer(d, x.asOfL)) for (const s of v[x.line] || []) st.push([d, s[2] || s[0], s[1]]); }
    else for (const [d, v] of Object.entries((CA.downAct || {}).days || {})) { if (inPer(d, x.asOfL)) for (const s of v[x.line] || []) st.push([d, CCAT[s[0]] || s[0], s[1]]); }
    st.sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return `<div class="ct-kv"><span>계획</span><b>${x.plan != null ? n0(x.plan) + 't' : '계획 없음'}</b></div><div class="ct-kv"><span>실적</span><b>${n0(x.act)}t</b></div>`
      + `<div class="ct-kv"><span>계획 기준</span><b>${esc(x.planSrc || '-')}</b></div><h4>일별 생산 <small>막대 = 실적 · 세로선 = 그날 아침 계획</small></h4>${bars || '<p class="ct-note">자료 없음</p>'}`
      + `<h4>휴지 기록</h4>${st.length ? `<table class="ct-t"><tbody>${st.slice(0, 40).map((s) => `<tr><td>${md(s[0])}</td><td class="w">${esc(s[1])}</td><td class="r">${n0(s[2])}분</td></tr>`).join('')}</tbody></table>` : '<p class="ct-note">기록 없음</p>'}`;
  }
})();
