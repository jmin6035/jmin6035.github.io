/* 관제 공용(11/3): UI.ctl(O, MO) → 관제판 표 HTML(홈), UI.ctlStrip(O, MO, page) → 모든 화면 위 한 줄 신호 띠 */
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const dim = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  let MO = null;
  /* 관제판(11/3 사용자 '우린 관제다 — 한눈에 전체, 그룹별로'): 판매그룹 줄 × 생산·출하·재고·소재·납기 신호. 칸을 누르면 그 메뉴로 */
  const TFD = { G수출: 15, G국내: 20, G자동차: 30, C수출: 15, C건재: 20 };   // TF 목표 재고 일수(판생 기준 — 자동차는 AL-STS 30, 건재는 주문재 20)
  const MOG = { G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차'], G자가재: ['자가재'], C수출: ['컬러수출(건재)', '컬러수출(가전)', '가전내수'], C건재: ['컬러건재 주문재', '컬러건재 계획재'], C수요: ['수요개발'] };
  const SBN = { G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차내수', '자동차수출'], G자가재: ['자가재'] };
  function rowsOf(O) {
    const G = (O.groups || []).filter((g) => UI.inScope(g.pl)); if (!G.length) return '';
    const SR = O.stockRoll || {}, wi = (SR.weeks || []).findIndex((w) => w >= (SR.asOf || '')) , cur = (k) => { const a = (SR.v || {})[k] || []; for (let i = Math.max(0, wi); i >= 0; i--) if (a[i] != null) return a[i]; return null; };
    const SB = ((O.plating || {}).now || {}).shortBy || [];
    const sig = (tone, big, sub, href) => `<td class="ct ${tone}"><a href="${href}"><b>${big}</b>${sub ? `<small>${sub}</small>` : ''}</a></td>`;
    const rank = { bad: 0, warn: 1, ok: 2, na: 3 }, worst = [];
    const row = (g) => {
      const P = g.prod || {}, fin = (P.actual || 0) + (P.after || 0), pp = P.month > 0 ? fin / P.month : null;
      const prod = pp == null ? ['na', '–', ''] : [pp < 0.95 ? 'bad' : pp < 1 ? 'warn' : 'ok', `${Math.round(pp * 100)}%`, `월말 ${n0(fin)} / ${n0(P.month)}`];
      const S = g.ship, sp = S && S.month > 0 ? S.actual / Math.max(1, S.sched) : null;
      const ship = !S ? ['na', '–', ''] : [S.sched < 1 ? 'ok' : sp < 0.9 ? 'bad' : sp < 1 ? 'warn' : 'ok', n0(S.actual), `오늘까지 계획 ${n0(S.sched)} · 월 ${n0(S.month)}`];
      const st = cur(g.key), d = TFD[g.key], dly = S && S.month ? S.month / dim((O.today || O.asOf).slice(0, 7)) : 0, cov = st != null && dly ? st / dly : null;
      const stock = cov == null || !d ? ['na', st != null ? n0(st) : '–', ''] : [cov < d * 0.5 ? 'bad' : cov > d * 2 ? 'warn' : 'ok', `${Math.round(cov)}일`, `${n0(st)}t · 목표 ${d}일`];
      const mg = (MO && MO.groups ? MO.groups.groups : []).filter((x) => (MOG[g.key] || []).includes(x.group));
      const mw = mg.sort((a, b) => ({ late: 0, soon: 1, plan: 2, ok: 3 }[a.st] - { late: 0, soon: 1, plan: 2, ok: 3 }[b.st]))[0];
      const mat = !mw ? ['na', '–', ''] : [{ late: 'bad', soon: 'warn', plan: 'ok', ok: 'ok' }[mw.st], { late: '마감 지남', soon: '2주 안 발주', plan: '발주 예정', ok: '충당' }[mw.st], mw.act ? `${esc(mw.act.name)} ${md(mw.act.deadline)}까지` : ''];
      const sh = SB.filter((x) => (SBN[g.key] || []).some((n) => x.startsWith(n + ' '))).map((x) => +(x.match(/([\d,]+)t$/) || [0, '0'])[1].replace(/,/g, ''));
      const due = g.pl !== 'G' ? ['na', '–', ''] : sh.length ? ['bad', `결품 ${n0(sh.reduce((a, b) => a + b, 0))}t`, `${sh.length}건`] : ['ok', '결품 0', ''];
      const all = [prod, ship, stock, mat, due]; worst.push(...all.map((x) => x[0]));
      const w = all.reduce((a, x) => (rank[x[0]] < rank[a] ? x[0] : a), 'na');
      return `<tr><td class="cg"><span class="cdot ${w}"></span><b>${esc(g.name.replace(/\(.*\)/, ''))}</b></td>`
        + sig(prod[0], prod[1], prod[2], 'supply.html') + sig(ship[0], ship[1], ship[2], 'supply.html') + sig(stock[0], stock[1], stock[2], 'integrated.html')
        + sig(mat[0], mat[1], mat[2], 'matcal.html') + sig(due[0], due[1], due[2], 'cg_order.html') + '</tr>';
    };
    const sec = (pl, lab) => { const gs = G.filter((g) => g.pl === pl); return gs.length ? `<tr class="csec"><td colspan="6">${lab}</td></tr>` + gs.map(row).join('') : ''; };
    if (O.__rowsOnly) return G.map((g) => { worst.length = 0; row(g); return { key: g.key, pl: g.pl, name: g.name.replace(/\(.*\)/, ''), w: worst.reduce((a, x) => (rank[x] < rank[a] ? x : a), 'na'), cells: worst.slice() }; });
    const body = sec('G', '도금') + sec('C', '컬러');
    const c = (t) => worst.filter((x) => x === t).length;
    return `<h2>관제판 <small>실적 ~${md(O.asOf)} · 판매그룹 × 상태 · 칸을 누르면 해당 화면</small></h2>
      <div class="csum"><span class="cdot bad"></span>조치 ${c('bad')} <span class="cdot warn"></span>주의 ${c('warn')} <span class="cdot ok"></span>정상 ${c('ok')}</div>
      <table class="ctl"><colgroup><col style="width:16%"><col><col><col><col><col></colgroup><thead><tr><th>판매그룹</th><th title="월말 예상 = 실적 + 남은 기간 계획 ÷ 월 계획">생산 (월말 예상)</th><th title="이번 달 출하 실적 ÷ 오늘까지 계획">출하 (이번 달)</th><th title="지금 재고 ÷ 하루 판매 = 며칠분, TF 목표 일수와 비교">재고 (며칠분)</th><th title="3달 소재 — 가장 급한 소재 상태">소재</th><th title="오늘 재계획 결품">납기</th></tr></thead><tbody>${body}</tbody></table>`;
  }


  /* 달 선택(11/3 사용자 '월별로 끊어라'): 지난 달 = 월말 결산(생산·출하 실적 / 월 계획, 월말 재고), 다음 달 = 계획(생산·출하 계획, 월말 예상 재고 vs 목표, 그 달 결품) */
  const PMAP = { 도금수출: 'G수출', 도금국내: 'G국내', 자동차내수: 'G자동차', 자동차수출: 'G자동차', 자가재: 'G자가재' };
  const CMAP = { 건재수출: 'C수출', 가전수출: 'C수출', 가전내수: 'C수출', 주문재: 'C건재', 계획재: 'C건재', 수요개발: 'C수요' };
  UI.ctlMonth = (O, mo, X, m) => {
    const cur = (O.today || O.asOf).slice(0, 7), past = m < cur, IG = X.IG, V = IG && (IG.variants[IG.rec] || IG.variants.V1), mi = (IG && IG.months || O.months || []).indexOf(m);
    const MPn = (O.monthPlan || {})[m] || {};
    const plan = (g, k) => { const x = MPn[g] || {}; if (k === 'prod' && x.prod != null) return x.prod; if (k === 'sales' && x.ship != null) return x.ship; const r = V && V.plan && (V.plan[g] || [])[mi]; return r ? r[k] || 0 : null; };   // 생산 = 확정 계획, 출하 = 그 달 판생속보(없으면 TF 판매계획)
    const act = {};
    const R = X.LP && (X.LP.result || X.LP); const t0 = R && R.replan ? R.replan.t0 : '';
    if (R) for (const [d, , , c, t] of R.rows || []) if (d.slice(0, 7) === m && d <= t0 && PMAP[c]) act[PMAP[c]] = (act[PMAP[c]] || 0) + t;
    const BD = X.CA && X.CA.byGroup && X.CA.byGroup.days || {};
    for (const [d, L] of Object.entries(BD)) if (d.slice(0, 7) === m) for (const v of Object.values(L)) for (const [c, t] of Object.entries(v[0] || {})) if (CMAP[c]) act[CMAP[c]] = (act[CMAP[c]] || 0) + t;
    const SD = O.shipDay || {}, ship = (g) => Object.entries((SD.g || {})[g] || {}).filter(([d]) => d.slice(0, 7) === m).reduce((a, [, v]) => a + v, 0);
    const eom = m + '-' + String(dim(m)).padStart(2, '0'), stEnd = {};
    for (const [d, k, v] of O.stockTrend || []) if (d === eom && k.startsWith('g:')) stEnd[k.slice(2)] = v;
    const SB = ((O.plating || {}).now || {}).shortBy || [], mm = +m.slice(5);
    const G = (O.groups || []).filter((g) => UI.inScope(g.pl));
    const sig = (tone, big, sub, href) => `<td class="ct ${tone}"><a href="${href}"><b>${big}</b>${sub ? `<small>${sub}</small>` : ''}</a></td>`;
    const pct = (a, p) => (p > 0 ? a / p : null), tone = (r) => (r == null ? 'na' : r < 0.95 ? 'bad' : r < 1 ? 'warn' : 'ok');
    const row = (g) => {
      const pp = plan(g.key, 'prod'), sp = plan(g.key, 'sales');
      let c1, c2, c3, c4, c5;
      if (past) {
        const a = act[g.key] || 0, sa = ship(g.key);
        c1 = [tone(pct(a, pp)), pp ? `${Math.round(a / pp * 100)}%` : n0(a), `실적 ${n0(a)} / 계획 ${n0(pp || 0)}`];
        c2 = g.key === 'G자가재' || g.key === 'C수요' ? ['na', '–', ''] : [tone(pct(sa, sp)), sp ? `${Math.round(sa / sp * 100)}%` : n0(sa), `실적 ${n0(sa)} / 계획 ${n0(sp || 0)}`];
        const se = stEnd[g.key]; c3 = se == null ? ['na', '–', ''] : ['ok', n0(se), `${mm}월 말 재고`];
        c4 = ['na', '–', '']; c5 = ['na', '–', ''];
      } else {
        c1 = ['ok', n0(pp || 0), '생산 계획']; c2 = g.key === 'G자가재' || g.key === 'C수요' ? ['na', '–', ''] : ['ok', n0(sp || 0), '출하 계획'];
        const r = V && V.plan && (V.plan[g.key] || [])[mi], e = r ? r.end : null, tg = r ? r.target : null;
        c3 = e == null ? ['na', '–', ''] : [tg && e < tg * 0.7 ? 'bad' : tg && e > tg * 1.5 ? 'warn' : 'ok', n0(e), `월말 예상 · 목표 ${n0(tg || 0)}`];
        const mg = (mo && mo.groups ? mo.groups.groups : []).filter((x) => ({ G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차'], G자가재: ['자가재'], C수출: ['컬러수출(건재)', '컬러수출(가전)', '가전내수'], C건재: ['컬러건재 주문재', '컬러건재 계획재'], C수요: ['수요개발'] }[g.key] || []).includes(x.group));
        const ms = mg.flatMap((x) => x.mats).filter((x) => x.first && x.first.slice(0, 7) <= m && x.st !== 'ok').sort((a, b) => (a.deadline < b.deadline ? -1 : 1))[0];
        c4 = ms ? [{ late: 'bad', soon: 'warn', plan: 'ok' }[ms.st] || 'ok', `${esc(ms.name)}`, `${md(ms.deadline)}까지 발주 · ${md(ms.first)}부터 부족`] : ['ok', '충당', ''];
        const nm = { G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차내수', '자동차수출'], G자가재: ['자가재'] }[g.key] || [];
        const sh = SB.filter((x) => nm.some((n) => x.startsWith(n + ' ')) && +(x.match(/ (\d+)\/\d+ /) || [0, 0])[1] === mm).map((x) => +(x.match(/([\d,]+)t$/) || [0, '0'])[1].replace(/,/g, ''));
        c5 = g.pl !== 'G' ? ['na', '–', ''] : sh.length ? ['bad', `결품 ${n0(sh.reduce((a, b) => a + b, 0))}t`, `${sh.length}건`] : ['ok', '결품 0', ''];
      }
      const all = [c1, c2, c3, c4, c5], rk = { bad: 0, warn: 1, ok: 2, na: 3 }, w = all.reduce((a, x) => (rk[x[0]] < rk[a] ? x[0] : a), 'na');
      return `<tr><td class="cg"><span class="cdot ${w}"></span><b>${esc(g.name.replace(/\(.*\)/, ''))}</b></td>` + sig(c1[0], c1[1], c1[2], 'supply.html') + sig(c2[0], c2[1], c2[2], 'supply.html') + sig(c3[0], c3[1], c3[2], 'integrated.html') + sig(c4[0], c4[1], c4[2], 'matcal.html') + sig(c5[0], c5[1], c5[2], 'cg_order.html') + '</tr>';
    };
    const sec = (pl, lab) => { const gs = G.filter((g) => g.pl === pl); return gs.length ? `<tr class="csec"><td colspan="6">${lab}</td></tr>` + gs.map(row).join('') : ''; };
    const H = past ? ['생산 (실적/계획)', '출하 (실적/계획)', `재고 (${mm}월 말)`, '소재', '납기'] : ['생산 계획', '출하 계획', '재고 (월말 예상)', `소재 (${mm}월 부족분)`, `납기 (${mm}월 결품)`];
    return `<table class="ctl"><colgroup><col style="width:16%"><col><col><col><col><col></colgroup><thead><tr><th>판매그룹</th>${H.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${sec('G', '도금')}${sec('C', '컬러')}</tbody></table>`;
  };
  UI.ctl = (O, mo) => { MO = mo || null; return rowsOf(O); };
  UI.ctlRows = (O, mo) => { MO = mo || null; return rowsOf(Object.assign({}, O, { __rowsOnly: true })); };
  const COL = ['생산', '출하', '재고', '소재', '납기'];
  UI.ctlStrip = (O, mo) => {
    const R = UI.ctlRows(O, mo); if (!R || !R.length) return '';
    return `<a class="cs-home" href="index.html" title="관제판">관제</a>` + R.map((r) => `<a class="cs-g" href="index.html" title="${esc(r.name)}: ${r.cells.map((c, i) => COL[i] + ' ' + ({ bad: '조치', warn: '주의', ok: '정상', na: '–' }[c])).join(' · ')}"><span class="cdot ${r.w}"></span>${esc(r.name)}<span class="cs-c">${r.cells.map((c) => `<i class="${c}"></i>`).join('')}</span></a>`).join('');
  };
})();
