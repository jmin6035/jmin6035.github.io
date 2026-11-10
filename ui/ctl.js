/* 관제 공용(11/3 → 11/11 개편): 판매그룹 신호 한 곳 — 관제판(board.html) · 통합 관제(ct_home.js) · 모든 화면 위 관제 띠(ui/shell.js)가 같은 값을 씀
   UI.ctlRows(O, MO, IG, RK) → 그룹마다 { key, pl, name, w(가장 나쁜 신호), cells[5], vals[5], d{due, prod, ship, stock, mat} }
     납기 = risk.enc.json(납기 위험 화면과 같은 판정) · 생산·출하·재고 = portal.enc.json · 재고 목표 = integrated(통합 계획 월말 목표) · 소재 = mat_order
   UI.ctlStrip(O, MO) → 관제 띠 HTML. 납기 위험·재고 목표 자료는 여기서 뒤에서 받아 오고, 받으면 띠를 다시 그림 */
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const dim = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  let MO = null, IGc = null, RKc = null;
  const TFD = { G수출: 15, G국내: 20, G자동차: 30, C수출: 15, C건재: 20 };   // 상한 일수 — 엔진 값(integrated tfRules.days)이 없을 때만
  const TFK = { G수출: 'G수출', G국내: 'G국내', G자동차: 'AL-STS', C수출: '건재수출', C건재: '주문재' };
  UI.ctlTfd = (k, IG) => { const v = (((IG || IGc || {}).tfRules || {}).days || {})[TFK[k]]; return v != null ? v : TFD[k]; };
  const MOG = { G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차'], G자가재: ['자가재'], C수출: ['컬러수출(건재)', '컬러수출(가전)', '가전내수'], C건재: ['컬러건재 주문재', '컬러건재 계획재'], C수요: ['수요개발'] };
  /* 판매그룹(portal) → 납기 위험 그룹(risk.enc.json). 컬러수출 = 건재수출 + 가전수출 + 가전내수 */
  const RKN = UI.ctlRiskGroups = { G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차'], G자가재: ['자가재'], C수출: ['건재수출', '가전수출', '가전내수'], C건재: ['컬러건재'], C수요: ['수요개발'] };
  /* 납기 위험 비율 색(통합 관제 표와 같은 기준): 위험 ÷ 미결 30% 이상 조치 · 15% 이상 주의 */
  UI.riskTone = (risk, t) => (!(risk >= 0.5) ? 'ok' : !t ? 'bad' : risk / t >= 0.3 ? 'bad' : risk / t >= 0.15 ? 'warn' : 'ok');
  /* 그룹 납기 위험 합치기(여러 위험 그룹 → 한 판매그룹): 원인 칩(cz)도 원인별로 합침 */
  UI.ctlRisk = (RK, key) => {
    const gs = RK && RKN[key] ? RK.groups.filter((x) => RKN[key].includes(x.g) && x.pl === key[0]) : null; if (!gs || !gs.length) return null;
    const s = { subs: gs, t: 0, n: 0, risk: 0, will: 0, past: 0, warn: 0, ok: 0, cz: [] }, cz = new Map();
    for (const g of gs) {
      for (const k of ['t', 'n', 'risk', 'will', 'past', 'warn', 'ok']) s[k] += g[k] || 0;
      for (const [c, t, n, act, it] of g.cz || []) {
        const z = cz.get(c) || [c, 0, 0, null, new Map()]; z[1] += t; z[2] += n; z[3] = z[3] && act ? (act < z[3] ? act : z[3]) : z[3] || act;
        for (const [w, wt, wn, wa] of it || []) { const y = z[4].get(w) || [w, 0, 0, null]; y[1] += wt; y[2] += wn; y[3] = y[3] && wa ? (wa < y[3] ? wa : y[3]) : y[3] || wa; z[4].set(w, y); }
        cz.set(c, z);
      }
    }
    s.cz = [...cz.values()].map((z) => [z[0], z[1], z[2], z[3], [...z[4].values()].sort((a, b) => b[1] - a[1])]).sort((a, b) => b[1] - a[1]);
    s.tone = UI.riskTone(s.risk, s.t);
    return s;
  };
  /* 원인 칩 HTML(통합 관제·관제판 공용): [원인 이름] 굵은 톤 · 짧은 사유(언제 풀리는지) */
  UI.causeHtml = (RK, cz, max = 2, items = 2) => (cz || []).filter((z) => z[1] >= 0.5).slice(0, max).map(([c, t, n, act, it]) => `<div class="rc-l"><span class="rc rc-${esc(c)}" title="${esc(((RK || {}).dept || {})[c] ? `조치: ${RK.dept[c]}` : '')}">${esc(((RK || {}).causeNm || {})[c] || c)}</span><b class="rc-t">${n0(t)}t</b>`
    + `${(it || []).filter((w) => w[0] && w[1] >= 0.5).slice(0, items).map((w) => `<span class="rc-w" title="${esc(`${w[0]} ${n0(w[1])}t · ${w[2]}건`)}">${esc(w[0])} <i class="rc-n">${n0(w[1])}t</i></span>`).join('')}</div>`).join('');

  function rowsOf(O) {
    const G = (O.groups || []).filter((g) => UI.inScope(g.pl)); if (!G.length) return [];
    const asOf = O.asOf || O.today, mon = String(O.today || asOf).slice(0, 7), nd = dim(mon), eom = `${mon}-${String(nd).padStart(2, '0')}`;
    const SR = O.stockRoll || {}, SM = (SR.month && SR.month.ym === mon && SR.month.g) || null;
    const nowSt = (k) => { if (SM && SM[k] && SM[k].begin != null) return SM[k].begin; const kk = k === 'G자가재' ? '도금 제품(자가재)' : 'g:' + k; let bd = '', bv = null; for (const [d, q, v] of O.stockTrend || []) if (q === kk && d >= bd && d <= asOf) { bd = d; bv = v; } return bv; };
    const endSt = (k) => { if (SM && SM[k] && SM[k].end != null) return SM[k].end; const a = (SR.days || {})[k], i = SR.d0 ? Math.round((Date.parse(eom) - Date.parse(SR.d0)) / 864e5) : -1; return a && i >= 0 && a[i] != null ? a[i] : null; };
    const IG = IGc, V = IG && IG.variants && (IG.variants[IG.rec] || IG.variants.V1), mi = (IG && IG.months || O.months || []).indexOf(mon), TR = (IG && IG.tfRules) || {};
    const UT = {}; for (const x of (MO && MO.groups ? MO.groups.groups : [])) for (const m of x.mats || []) UT[m.key] = (UT[m.key] || 0) + (m.use || 0);   // 소재 총 사용량 → 그룹 몫
    const VM = new Map(UI.matView(MO, O).map((m) => [m.key, m])), SR_ = { late: 0, soon: 1, plan: 2, ok: 3 };
    const rank = { bad: 0, warn: 1, ok: 2, na: 3 };
    return G.map((g) => {
      // 생산: 월말 예상(실적 + 남은 계획) ÷ 월 계획
      const P = g.prod || {}, fin = (P.actual || 0) + (P.after || 0), pp = P.month > 0 ? fin / P.month : null;
      const prod = { actual: P.actual || 0, month: P.month || 0, fin, pct: pp, tone: pp == null ? 'na' : UI.rate(pp * 100), note: P.note };
      prod.v = pp == null ? (P.note ? ['na', '계획 0', `실적 ${n0(P.actual || 0)}t`] : ['na', '–', '']) : [prod.tone, `${Math.round(pp * 100)}%`, `월말 예상 ${n0(fin)} / ${n0(P.month)}t`];
      // 출하: 실적 ÷ 오늘까지 기준선(그룹 출하 실적 패턴, portal ship.due — 없으면 일정 누계)
      const S = g.ship, base = S ? (S.due != null ? S.due : S.sched) : null, sp = S && base >= 1 ? S.actual / base : null;
      const ship = S ? { actual: S.actual || 0, base: base || 0, month: S.month || 0, pct: sp, by: S.due != null ? (S.dueBy || '출하 실적 패턴') : '판생 일정 누계', to: S.dueTo, tone: base < 1 ? 'ok' : UI.rate(sp * 100) } : null;
      if (ship) ship.v = [ship.tone, sp != null ? `${Math.round(sp * 100)}%` : `${n0(S.actual)}t`, `실적 ${n0(S.actual)} / 기준 ${n0(base || 0)}t · 월 ${n0(S.month)}t`];   // 관제판과 같은 표기(기준 대비 %)
      // 재고: 오늘 → 월말 예상(재고 추이 롤링) vs 월말 목표(통합 계획). 목표 없으면 하루 출하 기준 일수 vs 상한
      const now = nowSt(g.key), end = endSt(g.key), r = V && V.plan && mi >= 0 && (V.plan[g.key] || [])[mi], tg = r ? r.target : null;
      const dy = (TR.days || {})[g.key], tt = (TR.target || {})[g.key], over = dy && tt ? dy / tt : 1.3;   // 과잉 = 통합 계획 재고 추이와 같은 기준(상한 ÷ 목표, 없으면 1.3배)
      const stock = { now, end, target: tg, over };
      if (end != null && tg) { stock.tone = end < tg * 0.7 ? 'bad' : end > tg * over ? 'warn' : 'ok'; stock.v = [stock.tone, `월말 ${n0(end)}t`, `목표 ${n0(tg)} · 오늘 ${now != null ? n0(now) : '–'}`]; }
      else {
        const d = UI.ctlTfd(g.key), dly = S && S.month ? S.month / nd : 0, cov = now != null && dly ? now / dly : null;
        stock.tone = cov == null || !d ? 'na' : cov < d * 0.5 ? 'bad' : cov > d ? 'warn' : 'ok';
        stock.v = cov == null || !d ? ['na', now != null ? n0(now) + 't' : '–', ''] : [stock.tone, `${Math.round(cov)}일`, `${n0(now)}t · 상한 ${d}일`];
      }
      // 소재: 이 그룹이 쓰는 소재 중 가장 급한 것(공통 기준 UI.matView), 부족 톤 = 소재 부족 × 이 그룹 사용 비중
      const mg = (MO && MO.groups ? MO.groups.groups : []).filter((x) => (MOG[g.key] || []).includes(x.group));
      const gu = {}; mg.forEach((x) => (x.mats || []).forEach((m) => { gu[m.key] = (gu[m.key] || 0) + (m.use || 0); }));
      const ma = mg.flatMap((x) => x.mats || []).filter((x) => !(x.use < 1)).filter((x, i, A) => A.findIndex((y) => y.key === x.key) === i).map((x) => { const v = VM.get(x.key) || x; return Object.assign({}, v, { lateT: Math.round((v.lateT || 0) * (UT[x.key] ? gu[x.key] / UT[x.key] : 1)) }); }).sort((a, b) => SR_[a.st] - SR_[b.st] || (b.lateT || 0) - (a.lateT || 0) || String(a.deadline || '9').localeCompare(String(b.deadline || '9')))[0];
      const mat = { m: ma, v: !mg.length ? ['na', '–', ''] : !ma || ma.st === 'ok' ? ['ok', '충당', ''] : [{ late: 'bad', soon: 'warn', plan: 'ok' }[ma.st], { late: '마감 지남', soon: '2주 안 발주', plan: '발주 예정' }[ma.st], ma.st === 'late' ? `${ma.name} ${n0(ma.lateT)}t` : `${ma.name} ${md(ma.deadline)}까지`] };
      // 납기: 납기 위험(위험 = 지연 예상 + 납기 지남) — 자료 없으면 '–'
      const due = UI.ctlRisk(RKc, g.key);
      const dv = due ? [due.tone, due.risk >= 0.5 ? `위험 ${n0(due.risk)}t` : '위험 0', due.t ? `미결 ${n0(due.t)}t 중 ${Math.round(due.risk / due.t * 100)}%` : ''] : ['na', '–', ''];
      const all = [prod.v, ship ? ship.v : ['na', '–', ''], stock.v, mat.v, dv];
      const w4 = [all[0], all[1], all[2], all[4]].reduce((a, x) => (rank[x[0]] < rank[a] ? x[0] : a), 'na');   // 관제판 줄 색 = 납기·생산·출하·재고(소재는 소재 화면 신호 — 같은 F/H 부족이 모든 그룹을 빨갛게 덮던 것)
      return { key: g.key, pl: g.pl, name: g.name.replace(/\(.*\)/, ''), w: w4, w4, w5: all.reduce((a, x) => (rank[x[0]] < rank[a] ? x[0] : a), 'na'), cells: all.map((x) => x[0]), vals: all.map((x) => [x[1], x[2]]), d: { due, prod, ship, stock, mat }, g };
    });
  }

  /* 달 선택(11/3 사용자 '월별로 끊어라'): 지난 달 = 월말 결산(생산·출하 실적 / 월 계획, 월말 재고), 다음 달 = 계획(생산·출하 계획, 월말 예상 재고 vs 목표, 그 달 결품) */
  const PMAP = { 도금수출: 'G수출', 도금국내: 'G국내', 자동차내수: 'G자동차', 자동차수출: 'G자동차', 자가재: 'G자가재' };
  const CMAP = { 건재수출: 'C수출', 가전수출: 'C수출', 가전내수: 'C수출', 주문재: 'C건재', 계획재: 'C건재', 수요개발: 'C수요' };
  UI.ctlMonth = (O, mo, X, m) => {
    const cur = (O.today || O.asOf).slice(0, 7), past = m < cur, IG = X.IG, V = IG && (IG.variants[IG.rec] || IG.variants.V1), mi = (IG && IG.months || O.months || []).indexOf(m);
    const MPn = (O.monthPlan || {})[m] || {};
    const plan = (g, k) => { const x = MPn[g] || {}; if (k === 'prod' && x.prod != null) return x.prod; if (k === 'sales' && x.ship != null) return x.ship; const r = V && V.plan && (V.plan[g] || [])[mi]; return r ? r[k] || 0 : null; };   // 생산 = 기준 계획, 출하 = 그 달 판생속보(없으면 TF 판매계획)
    const act = {};
    const R = X.LP && (X.LP.result || X.LP); const t0 = R && R.replan ? R.replan.t0 : '';
    if (R) for (const [d, , , c, t] of R.rows || []) if (d.slice(0, 7) === m && d <= t0 && PMAP[c]) act[PMAP[c]] = (act[PMAP[c]] || 0) + t;
    const BD = X.CA && X.CA.byGroup && X.CA.byGroup.days || {};
    for (const [d, L] of Object.entries(BD)) if (d.slice(0, 7) === m) for (const v of Object.values(L)) for (const [c, t] of Object.entries(v[0] || {})) if (CMAP[c]) act[CMAP[c]] = (act[CMAP[c]] || 0) + t;
    const SD = O.shipDay || {}, ship = (g) => Object.entries((SD.g || {})[g] || {}).filter(([d]) => d.slice(0, 7) === m).reduce((a, [, v]) => a + v, 0);
    const eom = m + '-' + String(dim(m)).padStart(2, '0'), stEnd = {};
    for (const [d, k, v] of O.stockTrend || []) if (d === eom && k.startsWith('g:')) stEnd[k.slice(2)] = v;
    const NW = (O.plating || {}).now || {}, SB = NW.shortOrder || NW.shortBy || [], SF = NW.shortFill || [], mm = +m.slice(5);
    const G = (O.groups || []).filter((g) => UI.inScope(g.pl));
    const sig = (tone, big, sub, href) => `<td class="ct ${tone}"><a href="${href}"><b>${big}</b>${sub ? `<small>${sub}</small>` : ''}</a></td>`;
    const pct = (a, p) => (p > 0 ? a / p : null), tone = (r) => (r == null ? 'na' : UI.rate(r * 100));
    const row = (g) => {
      const pp = plan(g.key, 'prod'), sp = plan(g.key, 'sales');
      let c1, c2, c3, c4, c5;
      if (past) {
        const a = act[g.key] || 0, sa = ship(g.key);
        c1 = [tone(pct(a, pp)), pp ? `${Math.round(a / pp * 100)}%` : n0(a), `실적 ${n0(a)} / 계획 ${n0(pp || 0)}`];
        c2 = g.key === 'G자가재' || g.key === 'C수요' ? ['na', '–', ''] : [tone(pct(sa, sp)), sp ? `${Math.round(sa / sp * 100)}%` : n0(sa), `실적 ${n0(sa)} / 계획 ${n0(sp || 0)}`];
        const se = stEnd[g.key]; c3 = se == null ? ['na', '–', ''] : ['ok', `${n0(se)}t`, `${mm}월 말 재고`];
        c4 = ['na', '–', '']; c5 = ['na', '–', ''];
      } else {
        c1 = ['ok', `${n0(pp || 0)}t`, '생산 계획']; c2 = g.key === 'G자가재' || g.key === 'C수요' ? ['na', '–', ''] : ['ok', `${n0(sp || 0)}t`, '출하 계획'];
        const r = V && V.plan && (V.plan[g.key] || [])[mi], e = r ? r.end : null, tg = r ? r.target : null;
        const TR = (IG && IG.tfRules) || {}, dy = (TR.days || {})[g.key], tt = (TR.target || {})[g.key];
        c3 = e == null ? ['na', '–', ''] : [tg && e < tg * 0.7 ? 'bad' : tg && e > tg * (dy && tt ? dy / tt : 1.3) ? 'warn' : 'ok', `${n0(e)}t`, `월말 예상 · 목표 ${n0(tg || 0)}`];
        const mg = (mo && mo.groups ? mo.groups.groups : []).filter((x) => (MOG[g.key] || []).includes(x.group));
        const VM = new Map(UI.matView(mo, O).map((x) => [x.key, x]));
        const ms = mg.flatMap((x) => x.mats).map((x) => VM.get(x.key) || x).filter((x) => x.first && x.first.slice(0, 7) <= m && x.st !== 'ok').sort((a, b) => (a.deadline < b.deadline ? -1 : 1))[0];
        c4 = ms ? [{ late: 'bad', soon: 'warn', plan: 'ok' }[ms.st] || 'ok', `${esc(ms.name)}`, `${md(ms.deadline)}까지 발주 · ${md(ms.first)}부터 부족`] : ['ok', '충당', ''];
        const nm = { G수출: ['도금수출'], G국내: ['도금국내'], G자동차: ['자동차내수', '자동차수출'], G자가재: ['자가재'] }[g.key] || [];
        const pick = (L) => L.filter((x) => nm.some((n) => x.startsWith(n + ' ')) && +(x.match(/ (\d+)\/\d+ /) || [0, 0])[1] === mm).map((x) => +(x.match(/([\d,]+)t$/) || [0, '0'])[1].replace(/,/g, ''));
        const sh = pick(SB), sf = pick(SF), sm = (L) => n0(L.reduce((a, b) => a + b, 0));
        c5 = g.pl !== 'G' ? ['na', '–', ''] : sh.length ? ['bad', `결품 ${sm(sh)}t`, `주문 ${sh.length}건`] : sf.length ? ['warn', `미편성 ${sm(sf)}t`, `판매계획 보충 ${sf.length}건`] : ['ok', '결품 0', ''];
      }
      const all = [c1, c2, c3, c4, c5], rk = { bad: 0, warn: 1, ok: 2, na: 3 }, w = all.reduce((a, x) => (rk[x[0]] < rk[a] ? x[0] : a), 'na');
      return `<tr><td class="cg"><span class="cdot ${w}"></span><b>${esc(g.name.replace(/\(.*\)/, ''))}</b></td>` + sig(c1[0], c1[1], c1[2], 'supply.html') + sig(c2[0], c2[1], c2[2], 'supply.html') + sig(c3[0], c3[1], c3[2], 'integrated.html') + sig(c4[0], c4[1], c4[2], 'matcal.html') + sig(c5[0], c5[1], c5[2], 'cg_order.html') + '</tr>';
    };
    const sec = (pl, lab) => { const gs = G.filter((g) => g.pl === pl); return gs.length ? `<tr class="csec"><td colspan="6">${lab}</td></tr>` + gs.map(row).join('') : ''; };
    const H = past ? ['생산 (실적/계획)', '출하 (실적/계획)', `재고 (${mm}월 말)`, '소재', '납기'] : ['생산 계획', '출하 계획', '재고 (월말 예상)', `소재 (${mm}월 부족분)`, `납기 (${mm}월 결품)`];
    return `<table class="ctl"><colgroup><col style="width:16%"><col><col><col><col><col></colgroup><thead><tr><th>판매그룹</th>${H.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${sec('G', '도금')}${sec('C', '컬러')}</tbody></table>`;
  };
  UI.ctlRows = (O, mo, ig, rk) => { MO = mo || MO; IGc = ig || IGc; RKc = rk || RKc; return rowsOf(O); };

  /* 관제 띠: 홈 밖 모든 화면 머리 아래(ui/shell.js). 납기 위험(risk)·재고 목표(integrated)는 여기서 받아 오고, 받으면 띠를 다시 그림 */
  const COL = ['생산', '출하', '재고', '소재', '납기'];
  let extra = null;
  const loadExtra = () => {
    if (extra || !(window.GP && GP.latest)) return extra;
    let pw = null; for (const k of ['cgl-analysis-pw', 'cgl-supply-pw']) { try { pw = pw || localStorage.getItem(k); } catch (e) { /* 무시 */ } }
    if (!pw) return null;
    const get = (n) => GP.latest(n).then((e) => (e ? GP.decryptJSON(e, pw) : null)).catch(() => null);
    extra = Promise.all([get('risk.enc.json'), get('integrated.enc.json')]).then(([rk, ig]) => {
      if (!rk && !ig) return;
      RKc = RKc || rk; IGc = IGc || ig;
      const b = document.querySelector('#ui-ctl .cs-sum');   // 띠를 그리는 ui/shell.js draw() 를 다시 부름(펼침 상태는 두 번 눌러 그대로)
      if (b) { b.click(); const b2 = document.querySelector('#ui-ctl .cs-sum'); if (b2) b2.click(); }
    });
    return extra;
  };
  UI.ctlStrip = (O, mo) => {   // 11/5 사용자 '진행 단계별로 값이 안 나온다' → 단계마다 값(생산·출하·재고·소재·납기)
    loadExtra();
    const R = UI.ctlRows(O, mo); if (!R || !R.length) return '';
    const seg = (r, i) => (r.cells[i] === 'na' && (r.vals[i] || [])[0] === '–') ? '' : `<span class="cs-v ${r.cells[i]}" title="${esc(COL[i] + ' ' + ((r.vals[i] || [])[1] || ''))}"><em>${COL[i]}</em>${esc((r.vals[i] || [])[0] || '–')}</span>`;
    return `<a class="cs-home" href="board.html">관제판 →</a>` + R.map((r) => `<a class="cs-g" href="board.html"><span class="cdot ${r.w}"></span><b>${esc(r.name)}</b>${r.cells.map((c, i) => seg(r, i)).join('')}</a>`).join('');
  };
})();
