/* 판매그룹 관제판(board.html, 11/11 전면 개편 — 사용자 '들어가자마자 판매그룹별로 지금 문제·이번 달 진도·재고가 한 화면에'):
   첫 화면 = 판매그룹 줄 × [납기 위험 · 주요 원인 · 생산 · 출하 · 재고 · 소재]. 값은 모두 ui/ctl.js UI.ctlRows(관제 띠·통합 관제와 같은 계산)
     납기 위험 = risk.enc.json(납기 위험 화면과 같은 판정) · 생산·출하·재고 = portal.enc.json(groups·stockRoll) · 재고 목표 = integrated(통합 계획 월말 목표) · 소재 = mat_order
   오른쪽 = 4분기 생산·재고 전망(11/11 회의 '줄여서 위 오른쪽') · 아래(접기) = 다른 달(지난 달 결산·다음 달 계획) · 기준·사양(그룹별 판매계획 → 필요 생산) */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const FILES = ['portal.enc.json', 'mat_order.enc.json', 'integrated.enc.json', 'risk.enc.json'];
  const dim = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const PCT = (a, b) => (b > 0 ? Math.round(a / b * 100) : null);
  let D = null, CM = null, X = null;

  const SLB = { bad: '조치', warn: '주의', ok: '정상', na: '–' };
  const meter = (v, max, mark, tone) => `<div class="bm"><i class="${tone}" style="width:${max > 0 ? Math.min(100, Math.max(0, v) / max * 100).toFixed(1) : 0}%"></i>${mark != null && max > 0 ? `<em style="left:${Math.min(100, mark / max * 100).toFixed(1)}%"></em>` : ''}</div>`;
  const stack = (s) => `<div class="hm-st" title="${esc(`정상 ${n0(s.ok)}t · 점검 ${n0(s.warn)}t · 지연 예상 ${n0(s.will)}t · 납기 지남 ${n0(s.past)}t`)}">${[['ok', 'var(--good)'], ['warn', '#c9a227'], ['will', '#e07b39'], ['past', 'var(--bad)']].map(([k, c]) => (s[k] > 0 ? `<i style="flex:${s[k]};background:${c}"></i>` : '')).join('')}</div>`;

  function board(O, RK, IG, MO) {
    const R = UI.ctlRows(O, MO, IG, RK) || [];
    if (!R.length) return UI.empty('판매그룹 자료 없음', '다음 자동 실행 때 채워짐');
    const mon = String(O.today || O.asOf).slice(0, 7), nd = dim(mon), el = Math.min(1, +String(O.asOf).slice(8, 10) / nd);
    const cell = (href, tone, html, title) => `<td class="bc ${tone || ''}"${title ? ` title="${esc(title)}"` : ''}><a href="${href}">${html}</a></td>`;
    const row = (r) => {
      const { due, prod, ship, stock, mat } = r.d;
      const cDue = !due ? cell('risk.html', 'na', '<span class="bv">–</span><span class="bs">납기 위험 자료 없음</span>')
        : cell('risk.html', due.tone, `<span class="bl1"><span class="bv ${due.tone}">${due.risk >= 0.5 ? `${n0(due.risk)}<small>t</small>` : '0<small>t</small>'}</span>${stack(due)}</span><span class="bs"><b>${PCT(due.risk, due.t) || 0}%</b> / 미결 ${n0(due.t)}t</span>`,
          due.subs.length > 1 ? due.subs.map((s) => `${s.g} ${n0(s.risk)}t`).join(' · ') : '');
      const cWhy = `<td class="bw">${due && due.risk >= 0.5 ? `<a href="risk.html">${UI.causeHtml(RK, due.cz, 2, 1)}</a>` : `<span class="ok-t">${due ? '위험 없음' : ''}</span>`}</td>`;
      const cProd = prod.pct == null ? cell('ct_prod.html#perf', 'na', `<span class="bv">${prod.note ? '계획 0' : '–'}</span><span class="bs">실적 ${n0(prod.actual)}t</span>`, prod.note || '')
        : cell('ct_prod.html#perf', prod.tone, `<span class="bl1"><span class="bv ${prod.tone}">${Math.round(prod.pct * 100)}<small>%</small></span>${meter(prod.actual, Math.max(prod.month, prod.fin), prod.month * el, prod.tone)}</span><span class="bs"><b>${n0(prod.actual)}</b> / 월 ${n0(prod.month)}t</span>`,
          `월말 예상 = 실적 ${n0(prod.actual)} + 남은 계획 ${n0(prod.fin - prod.actual)} → ${n0(prod.fin)}t ÷ 월 계획 ${n0(prod.month)}t · 막대 표시 = 오늘까지 경과(${Math.round(el * 100)}%)`);
      const cShip = !ship ? cell('ct_prod.html#ship', 'na', '<span class="bv">–</span><span class="bs">출하 없음</span>')
        : cell('ct_prod.html#ship', ship.tone, `<span class="bl1"><span class="bv ${ship.tone}">${ship.pct == null ? '–' : `${Math.round(ship.pct * 100)}<small>%</small>`}</span>${meter(ship.actual, Math.max(ship.month, ship.actual), ship.base, ship.tone)}</span><span class="bs"><b>${n0(ship.actual)}</b> / 기준 ${n0(ship.base)}t</span>`,
          `실적 ${n0(ship.actual)}t − 기준 ${n0(ship.base)}t = ${ship.actual >= ship.base ? '+' : '−'}${n0(Math.abs(ship.actual - ship.base))}t · 기준 = ${ship.to ? md(ship.to) + '까지 ' : ''}나갔어야 할 누계(월 ${n0(ship.month)}t × ${ship.by}) · 막대 표시 = 기준`);
      const sT = stock.target, sMax = Math.max(stock.end || 0, stock.now || 0, (sT || 0) * stock.over) * 1.05;
      const cStock = stock.end == null || !sT ? cell('integrated.html', stock.tone, `<span class="bv ${stock.tone}">${esc(r.vals[2][0])}</span><span class="bs">${esc(r.vals[2][1])}</span>`)
        : cell('integrated.html', stock.tone, `<span class="bl1"><span class="bv ${stock.tone}">${n0(stock.end)}<small>t</small></span><div class="bm st"><i class="${stock.tone}" style="width:${(stock.end / sMax * 100).toFixed(1)}%"></i><em style="left:${(sT / sMax * 100).toFixed(1)}%"></em>${stock.now != null ? `<u style="left:${Math.min(100, stock.now / sMax * 100).toFixed(1)}%"></u>` : ''}</div></span><span class="bs">목표 <b>${n0(sT)}</b> · 오늘 ${stock.now != null ? n0(stock.now) : '–'}</span>`,
          `월말 예상 ${n0(stock.end)}t(오늘 실재고에서 남은 생산·출하 계획대로) · 월말 목표 ${n0(sT)}t(통합 계획) · 목표의 70% 미만 조치, ${Math.round(stock.over * 100)}% 초과 주의 · 막대 표시 = 목표, 점선 = 오늘`);
      return `<tr class="${r.w4}"><th scope="row" class="bg" title="${esc(SLB[r.w4])}"><span class="cdot ${r.w4}"></span><b>${esc(r.name)}</b></th>${cDue}${cWhy}${cProd}${cShip}${cStock}</tr>`;
    };
    const sec = (pl, nm) => { const rs = R.filter((r) => r.pl === pl); return rs.length ? `<tr class="bsec"><td colspan="6">${nm}</td></tr>${rs.map(row).join('')}` : ''; };
    const cnt = (t) => R.filter((r) => r.w4 === t).length;
    const rk = R.filter((r) => r.d.due), rT = rk.reduce((a, r) => a + r.d.due.risk, 0), oT = rk.reduce((a, r) => a + r.d.due.t, 0);
    const sh = R.filter((r) => r.d.ship), sa = sh.reduce((a, r) => a + r.d.ship.actual, 0), sb = sh.reduce((a, r) => a + r.d.ship.base, 0);
    const matLate = R.filter((r) => r.cells[3] === 'bad').length;
    const head = `<div class="bsum"><span class="bn bad"><i class="cdot bad"></i>조치 <b>${cnt('bad')}</b></span><span class="bn warn"><i class="cdot warn"></i>주의 <b>${cnt('warn')}</b></span><span class="bn ok"><i class="cdot ok"></i>정상 <b>${cnt('ok')}</b></span>`
      + `<span class="bk">납기 위험 <b class="neg">${n0(rT)}t</b> <small>미결 ${n0(oT)}t 중 ${PCT(rT, oT) || 0}%</small></span>`
      + (sb ? `<span class="bk">출하 <b class="${UI.rate(sa / sb * 100)}">${Math.round(sa / sb * 100)}%</b> <small>${n0(sa)} / 기준 ${n0(sb)}t</small></span>` : '')
      + (matLate ? `<a class="bk" href="matcal.html#mt-orders">소재 발주 마감 지남 <b class="neg">${matLate}개 그룹</b></a>` : '')
      + `<span class="bd">실적 ~${md(O.asOf)} · 납기 판정 ${RK ? md(RK.asOf) : '–'}</span></div>`;
    return head + `<div class="ct-wrap"><table class="bt"><colgroup><col class="c-g"><col class="c-d"><col class="c-w"><col class="c-p"><col class="c-s"><col class="c-k"></colgroup>`
      + `<thead><tr><th>판매그룹</th><th title="지연 예상 + 납기 지남(납기 위험 화면과 같은 판정)">납기 위험</th><th>주요 원인 <small>· 언제 풀리나</small></th><th title="월말 예상 = 실적 + 남은 계획, ÷ 월 계획">생산 <small>월말 예상</small></th><th title="실적 ÷ 오늘까지 기준(그룹 출하 실적 패턴)">출하 <small>기준 대비</small></th><th title="월말 예상 재고 vs 월말 목표">재고 <small>월말 예상</small></th></tr></thead>`
      + `<tbody>${sec('G', '도금')}${sec('C', '컬러')}</tbody></table></div>`;
  }

  /* 다른 달: 지난 달 결산 · 다음 달 계획(UI.ctlMonth) — 지난 달 실적은 최신 재계획·컬러 실적에서(펼칠 때 받음) */
  function monthSec(O) {
    const cur = String(O.today || O.asOf).slice(0, 7), ms = ((D.integrated && D.integrated.months) || O.months || [cur]).filter((m) => m !== cur);
    if (!ms.length) return '';
    CM = CM && ms.includes(CM) ? CM : ms.find((m) => m > cur) || ms[ms.length - 1];
    const tabs = `<div class="seg ct-seg bm-tabs" role="group" aria-label="달">${ms.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === CM}">${+m.slice(5)}월 ${m < cur ? '결산' : '계획'}</button>`).join('')}</div>`;
    const body = CM < cur && !X ? UI.empty('지난 달 실적 불러오는 중') : UI.ctlMonth(O, D.mat_order, Object.assign({ IG: D.integrated }, X || {}), CM);
    return `<details class="fold" id="b-month"${openM ? ' open' : ''}><summary>다른 달 <small>${ms.map((m) => `${+m.slice(5)}월 ${m < cur ? '결산' : '계획'}`).join(' · ')}</small></summary>${tabs}<div class="ct-wrap">${body}</div></details>`;
  }
  let openM = false;

  /* 4분기 전망: 달마다 생산 예상 vs 월 계획(도금·컬러) · 제품 재고 지금 → 월말 vs 월말 최대 */
  function qSec(O) {
    const M = O.months || [], cur = String(O.asOf).slice(0, 7), CMi = M.indexOf(cur), MP = O.monthPlan || {}, IG = D.integrated || {};
    const mpl = (m, p) => Object.entries(MP[m] || {}).filter(([g]) => g[0] === p).reduce((a, [, x]) => a + (x.prod || 0), 0);
    const G = O.groups || [], pm = O.planMonth, pl = O.plating || {}, cl = IG.colorLines || (O.color || {}).lines || {};
    const fc = (p) => { const L = G.filter((g) => g.pl === p && g.prod); return { a: L.reduce((s, g) => s + (g.prod.actual || 0), 0), f: L.reduce((s, g) => s + (g.prod.actual || 0) + (g.prod.after || 0), 0), m: L.reduce((s, g) => s + (g.prod.month || 0), 0) }; };
    const rows = [];
    if (pm && UI.inScope('G')) { const F = fc('G'); rows.push(['도금', M.map((m, i) => (i === CMi ? [F.f, F.m] : [pm.g1[i] + pm.g2[i], mpl(m, 'G') || (pl.g1 || [])[i] + (pl.g2 || [])[i]]))]); }
    if (UI.inScope('C') && Object.keys(cl).length) { const F = fc('C'), tot = (m, k) => Object.values(cl[m] || {}).reduce((a, x) => a + (x[k] || 0), 0); rows.push(['컬러', M.map((m, i) => (i === CMi ? [F.f, F.m] : [tot(m, 'placed'), mpl(m, 'C') || tot(m, 'plan')]))]); }
    if (!rows.length) return '';
    const rollAt = (keys, d) => { const R = O.stockRoll; if (!R || !R.days) return null; const i = Math.round((Date.parse(d) - Date.parse(R.d0)) / 864e5); let s = 0, n = 0; keys.forEach((k) => { const v = (R.days[k] || [])[i]; if (v != null) { s += v; n++; } }); return n ? s : null; };
    const st = {}; ((O.sr || {}).stock || []).forEach((x) => { st[x.name] = x; });
    const SK = [['도금 제품(판매재)', ['G국내', 'G수출', 'G자동차'], 'G'], ['컬러 제품', ['C건재', 'C수출', 'C수요'], 'C']].filter(([, , p]) => UI.inScope(p));
    // 11/11 회의 '4분기 생산·재고 전망 줄여서 위 오른쪽에 붙여라': 접기 → 관제판 오른쪽 작은 표(칸마다 두 줄: 값·% / 기준)
    const th = M.map((m) => `<th>${+m.slice(5)}월${m === cur ? '<small>예상</small>' : ''}</th>`).join('');
    const c2 = (top, sub) => `<td><span class="q1">${top}</span><span class="q-s">${sub}</span></td>`;
    const pr = rows.map(([nm, R]) => `<tr><th class="l" scope="row">${nm} 생산</th>${R.map(([v, p]) => { const r = p ? v / p * 100 : null; return c2(`${n0(v)} <b class="${r == null ? '' : UI.rate(r)}">${r == null ? '–' : Math.round(r) + '%'}</b>`, `/ ${n0(p || 0)}t`); }).join('')}${c2(n0(R.reduce((a, r) => a + r[0], 0)), `/ ${n0(R.reduce((a, r) => a + (r[1] || 0), 0))}t`)}</tr>`).join('');
    const sr = SK.map(([nm, keys]) => { const S = st[nm] || {}, mx = S.target; return `<tr><th class="l" scope="row">${nm === '컬러 제품' ? '컬러 제품' : '도금 판매재'} 재고<span class="q-s">지금 ${S.current != null ? n0(S.current) + 't' : '–'}</span></th>${M.map((m) => { const v = rollAt(keys, `${m}-${String(dim(m)).padStart(2, '0')}`); const t = v == null || !mx ? '' : v / mx > 1.3 ? 'bad' : v / mx > 1.1 ? 'warn' : 'ok'; return c2(v == null ? '–' : `<b class="${t}">${n0(v)}</b>`, mx ? `/ 최대 ${n0(mx)}t` : ''); }).join('')}<td></td></tr>`; }).join('');
    return `<section class="card b-q"><h2>4분기 생산·재고 전망 <small>생산 예상 / 월 계획 · 월말 재고 / 최대</small></h2><div class="ct-wrap"><table class="qt q4"><thead><tr><th class="l"></th>${th}<th>4분기</th></tr></thead><tbody>${pr}${sr}</tbody></table></div></section>`;
  }

  /* 기준·사양: 숫자 정의 + 그룹별 판매계획 → 필요 생산(3달, 통합 계획) */
  function basisSec(O) {
    const IG = D.integrated || {}, V = IG.variants && (IG.variants[IG.rec] || IG.variants.V1), M = IG.months || O.months || [], MP = O.monthPlan || {};
    const GN = { G국내: '도금국내', G수출: '도금수출', G자동차: '자동차강판', G자가재: '도금 자가재', C건재: '컬러건재', C수출: '컬러수출', C수요: '수요개발' };
    const gp = (g, m, i) => { const x = (MP[m] || {})[g]; return x && x.prodSrc ? x.prod : ((V.plan[g] || [])[i] || {}).prod || 0; };
    const tb = V && V.plan ? `<div class="ct-wrap"><table class="ct-t qt"><thead><tr><th class="l">판매그룹</th>${M.map((m) => `<th>${+m.slice(5)}월 판매</th><th>필요 생산</th><th>월말 목표</th>`).join('')}</tr></thead><tbody>`
      + Object.keys(GN).filter((g) => V.plan[g] && UI.inScope(g[0])).map((g) => `<tr><td class="l"><b>${GN[g]}</b></td>${M.map((m, i) => { const r = (V.plan[g] || [])[i] || {}; return `<td>${n0(r.sales || 0)}</td><td><b>${n0(gp(g, m, i))}</b></td><td>${r.target != null ? n0(r.target) : '–'}</td>`; }).join('')}</tr>`).join('')
      + `</tbody></table></div>` : '';
    const RK = D.risk || {};
    return `<details class="fold"><summary>기준·사양 <small>숫자 정의 · 그룹별 판매계획 → 필요 생산 · 원인 이름</small></summary><ul class="b-ul">`
      + `<li><b>납기 위험</b> = 지연 예상 + 납기 지남(미결 주문, 종결 확인 제외) — 납기 위험 화면과 같은 판정 ${RK.asOf ? `(${md(RK.asOf)})` : ''}. 색: 위험 ÷ 미결 30% 이상 조치 · 15% 이상 주의</li>`
      + `<li><b>주요 원인</b> = 위험 톤이 큰 원인 2개, 원인 옆 = 언제 풀리는지(다음 생산일·입고 예정일)<ul>${Object.entries(RK.causeNm || {}).map(([k, v]) => `<li><b>${esc(v)}</b>${(RK.causeDef || {})[k] ? ` = ${esc(RK.causeDef[k])}` : ''} → ${esc((RK.dept || {})[k] || '')}</li>`).join('')}</ul></li>`
      + `<li><b>생산</b> = 월말 예상(이번 달 실적 + 남은 계획) ÷ 월 계획(TF 월 생산량). 98% 이상 정상 · 90% 이상 주의</li>`
      + `<li><b>출하</b> = 이번 달 출하 실적(MES) ÷ 오늘까지 기준(월 계획 × 그룹 월중 출하 실적 패턴 누계 비율)</li>`
      + `<li><b>재고</b> = 월말 예상(오늘 실재고 + 남은 생산 − 남은 출하) vs 월말 목표(통합 계획). 목표의 70% 미만 조치 · 상한 넘으면 주의</li>`
      + `<li><b>소재</b> = 그룹이 쓰는 소재 중 가장 급한 것(발주 마감 지남 → 2주 안 발주 → 발주 예정)</li></ul>`
      + (tb ? `<div class="b-cap">그룹별 판매계획 → 필요 생산(t) <small>필요 생산 = 판매 + 월말 목표 − 월초 재고</small></div>${tb}` : '') + '</details>';
  }

  function render(d) {
    D = d;
    const O = D.portal; if (!O) { document.getElementById('ct-main').innerHTML = UI.empty('관제판 자료 없음', '다음 자동 실행 때 채워짐'); return; }
    const main = document.getElementById('ct-main');
    main.innerHTML = `<div class="b-top"><section class="card b-main">${board(O, D.risk, D.integrated, D.mat_order)}</section>${qSec(O)}</div>${monthSec(O)}${basisSec(O)}`;
    const bm = document.getElementById('b-month');
    if (bm) {
      bm.addEventListener('toggle', () => { openM = bm.open; if (bm.open && !X) loadX(); });
      bm.querySelectorAll('.bm-tabs button').forEach((b) => b.onclick = () => { CM = b.dataset.m; render(D); });
    }
  }
  function loadX() {
    let pw = null; try { pw = localStorage.getItem('cgl-analysis-pw'); } catch (e) { /* 무시 */ }
    const get = (n) => GP.latest(n).then((e) => (e && pw ? GP.decryptJSON(e, pw) : null)).catch(() => null);
    Promise.all([get('latest.plan.enc.json'), get('color_actual.enc.json')]).then(([LP, CA]) => { X = { LP, CA }; render(D); });
  }
  CT.boot(FILES, render);
})();
