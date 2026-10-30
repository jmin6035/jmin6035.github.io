/* 포털(홈): published/portal.enc.json (cglplan/pages.py) — 오너 한눈에(상태 4칸 = 주간보고 기준) · 월말·분기말 전망 · 그룹별 이번 달, 실무 상세는 접어 둠 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    plan: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h8"/>'),
    gantt: svg('<path d="M4 5h9M7 10h11M5 15h7M9 20h11"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    report: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
    box: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>'),
    truck: svg('<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    book: svg('<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6"/><path d="M14 7v13M20 4v14h-6"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h0"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  };
  const pc = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  const sg = (v) => `<span class="${v < 0 ? 'neg' : 'pos'}">${v < 0 ? '−' : '+'}${n0(Math.abs(v))}</span>`;
  const dim = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  let lastO = null;

  // 라인 타일: 월차·누계·일정 대비 + 이번 달 일별 추이(선이 그려지는 애니메이션) + 다음 전환
  function spark(days) {
    const v = days.map((d) => d[1]), mx = Math.max(...v, 1), W = 140, H = 34, n = v.length;
    const xy = v.map((y, i) => [n > 1 ? i * W / (n - 1) : W / 2, H - 3 - y / mx * (H - 6)]);
    const li = 'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
    const dots = xy.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="pt"><title>${md(days[i][0])} ${n0(days[i][1])}t</title></circle>`).join('');
    return `<svg class="sp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="이번 달 하루 생산량"><path class="ar" d="${li} L${W},${H} L0,${H} Z"/><path class="li" d="${li}"/>${dots}</svg>`;
  }
  function lines(O) {
    return (O.lines || []).filter((x) => UI.inScope(x.pl)).map((x) => {
      const r = x.sched ? x.actual / x.sched : null, cls = r == null ? '' : r >= 0.98 ? 'good' : r >= 0.9 ? 'warn' : 'bad';
      const t = x.days.map((d) => `${md(d[0])} ${n0(d[1])}t`).join(' · ');
      return `<div class="ln" data-dom="${x.pl}" title="이번 달: ${t}"><div class="hd"><b>${x.line}</b>${x.fam ? `<span class="fam">${esc(x.fam)}</span>` : ''}<span class="pc ${cls}">${r == null ? '-' : Math.round(r * 100) + '%'}</span></div>
        <div class="nums"><b>${x.actual != null ? n0(x.actual) : '-'}</b> / 월차 ${x.month != null ? n0(x.month) : '-'}t · 일정 ${x.sched != null ? n0(x.sched) : '-'}</div>
        ${x.month ? `<div class="pb"><i style="width:${Math.min(100, x.actual / x.month * 100)}%"></i><em style="left:${Math.min(100, x.sched / x.month * 100)}%"></em></div>` : ''}
        <div class="sp-cap small muted">이번 달 하루 생산(t) · 최고 ${n0(Math.max(...x.days.map((d) => d[1])))} · 평균 ${n0(x.days.reduce((a, d) => a + d[1], 0) / x.days.length)}</div>
        ${spark(x.days)}<div class="sp-ax small muted"><span>${md(x.days[0][0])} ${n0(x.days[0][1])}</span><span>어제 ${n0(x.days[x.days.length - 1][1])}</span></div><div class="nx">${x.next ? `다음 ${md(x.next[0])} ${esc(x.next[1])}` : `어제 ${n0(x.days[x.days.length - 1][1])}t`}</div></div>`;
    }).join('');
  }
  // 마케팅 그룹 표: 생산(실적/계획·남은·하루 필요·월말 예상) · 출하(실적/월차·일정 대비)
  function grp(O) {
    const G = (O.groups || []).filter((g) => UI.inScope(g.pl));
    if (!G.length) return '';
    let i = 0;
    const row = (g) => {
      const P = g.prod, D = dim(P.asOf.slice(0, 7)), el = +P.asOf.slice(8, 10), rem = D - el, left = Math.max(0, P.month - P.actual);
      const proj = P.actual + (P.after || 0), r = P.month ? proj / P.month : 1, st = left <= 0 || r >= 0.98 ? '' : r >= 0.9 ? 'warn' : 'bad';
      const w = Math.max(P.month, proj, 1) * 1.02, S = g.ship;
      return `<tr data-dom="${g.pl}"><td class="nm"><i class="${st}"></i>${esc(g.name.replace('(컬러 소재)', ''))}</td>
        <td class="gbar"><div class="hb" title="실적 ${n0(P.actual)} · 남은 계획대로면 ${n0(proj)} · 월 계획 ${n0(P.month)}"><i style="width:${P.actual / w * 100}%;--i:${i}"></i><u style="left:${P.actual / w * 100}%;width:${Math.max(0, proj - P.actual) / w * 100}%"></u><em style="left:${P.month / w * 100}%"></em></div></td>
        <td><b>${n0(P.actual)}</b><span class="mu"> / ${n0(P.month)}</span></td><td class="hide-m">${n0(left)}</td><td class="hide-m">${rem ? n0(left / rem) : '-'}</td>
        <td>${pc(proj, P.month)}%</td>
        <td>${S ? `<b>${n0(S.actual)}</b><span class="mu"> / ${n0(S.month)}</span>` : '<span class="mu">-</span>'}</td><td class="hide-m">${S ? sg(S.actual - S.sched) : ''}</td></tr>`.replace('--i:' + i, '--i:' + (i++));
    };
    const tot = (pl, t, L) => {                                // 공장 합계(도금 계에는 컬러 소재로 가는 자가재 포함 — 도금+컬러 생산 합은 이중 계상이라 만들지 않음)
      const P = L.reduce((a, g) => ({ month: a.month + g.prod.month, actual: a.actual + g.prod.actual, after: a.after + (g.prod.after || 0) }), { month: 0, actual: 0, after: 0 });
      const S = L.filter((g) => g.ship).reduce((a, g) => ({ month: a.month + g.ship.month, sched: a.sched + g.ship.sched, actual: a.actual + g.ship.actual }), { month: 0, sched: 0, actual: 0 });
      const D = dim(L[0].prod.asOf.slice(0, 7)), rem = D - +L[0].prod.asOf.slice(8, 10), left = Math.max(0, P.month - P.actual), proj = P.actual + P.after;
      return `<tr class="tot" data-dom="${pl}"><td class="nm">${t} 계</td><td class="gbar"></td><td><b>${n0(P.actual)}</b><span class="mu"> / ${n0(P.month)}</span></td><td class="hide-m">${n0(left)}</td><td class="hide-m">${rem ? n0(left / rem) : '-'}</td><td>${pc(proj, P.month)}%</td><td>${S.month ? `<b>${n0(S.actual)}</b><span class="mu"> / ${n0(S.month)}</span>` : '<span class="mu">-</span>'}</td><td class="hide-m">${S.month ? sg(S.actual - S.sched) : ''}</td></tr>`;
    };
    const sec = (pl, t) => { const L = G.filter((g) => g.pl === pl); return L.length ? `<tr class="sec" data-dom="${pl}"><td colspan="8">${t}</td></tr>` + L.map(row).join('') + tot(pl, t, L) : ''; };
    const g0 = G.find((g) => g.pl === 'G'), c0 = G.find((g) => g.pl === 'C'), s0 = (G.find((g) => g.ship) || {}).ship;
    return `<h2>마케팅 그룹별 이번 달 <small>${g0 ? `도금 ~${md(g0.prod.asOf)}` : ''}${c0 ? ` · 컬러 ~${md(c0.prod.asOf)}` : ''}${s0 ? ` · 출하 ${esc(String(s0.asOf).slice(5, 10).replace('-', '/'))} 속보` : ''}</small><span class="unit">톤</span></h2>
      <div class="scroll"><table class="gt"><thead><tr><th class="l">그룹</th><th class="l">생산 진도 <span style="font-weight:400">(줄무늬 = 남은 계획, 선 = 월 계획)</span></th><th>실적 / 생산계획</th><th class="hide-m">잔여 생산량</th><th class="hide-m">하루 필요</th><th>월말 예상</th><th>출하 / 월차</th><th class="hide-m">출하 일정 대비</th></tr></thead>
      <tbody>${sec('G', '도금')}${sec('C', '컬러')}</tbody></table></div>
      <p class="small" style="margin:6px 0 0">생산계획 = 확정 계획(계획 엔진)의 이번 달 그룹 생산량(판매계획 아님 — 판매계획은 아래 표) · 잔여 생산량 = 생산계획 − 실적 · 월말 예상 = (실적 + 남은 날 재계획 생산) ÷ 생산계획 · 출하 일정 대비 = 출하 실적 − 판매생산속보 출하 일정누계(오늘까지 나갔어야 할 양). 도금 계에는 컬러 소재로 가는 자가재가 들어 있어 도금 + 컬러 생산을 더하면 이중 계상</p>`;
  }

  // ---------- 그룹별 판매계획 → 필요 생산 → 진도(10/22 사용자: 판매계획·필요생산량(월차)·진도율 그룹별, 도금·컬러) ----------
  let IG = null;                                               // 통합 계획(integrated.enc.json) — 그룹 월 판매·필요 생산(계획 엔진 월 물량 LP)
  const GN = { G국내: '도금판매(국내)', G수출: '도금수출', G자동차: '자동차강판', G자가재: '도금 자가재(컬러 소재)', C건재: '컬러건재', C수출: '컬러수출', C수요: '수요개발' };
  function needCard(O) {
    if (!IG || !IG.variants) return '';
    const V = IG.variants[IG.rec || 'V1'] || IG.variants.V1, PL = V && V.plan;
    if (!PL) return '';
    const M = O.months || ['2026-10', '2026-11', '2026-12'], cur = String(O.asOf || '').slice(0, 7), mi = Math.max(0, M.indexOf(cur));
    const el = +String(O.asOf).slice(8, 10), D = dim(cur), er = el / D;      // 오늘까지 경과율(실적 마지막 날 기준)
    const act = {}; for (const g of O.groups || []) act[g.key] = g.prod ? g.prod.actual : null;
    const L = O.lines || [], mon = (pl) => L.filter((x) => x.pl === pl).reduce((a, x) => a + (x.month || 0), 0);
    const tone = (r) => (r == null ? '' : r >= er - 0.03 ? 'pos' : r >= er - 0.1 ? 'warn' : 'neg');
    // 재고(10/22 사용자: 그룹별 이번 달 재고 수준) — 어제 실제(판매생산속보 원천 표) · 월말 예상(재고 추이와 같은 매일 롤링) · 월말 재고 일수(÷ 다음 달 하루 판매) vs 목표 일수(계획 엔진 기준)
    const SK = { 'G자가재': '도금 제품(자가재)' }, ST0 = {}; let sd = '';
    for (const [d, k, t] of O.stockTrend || []) { if (d >= sd) sd = d; }
    for (const [d, k, t] of O.stockTrend || []) if (d === sd) ST0[k] = t;
    const stNow = (g) => (ST0['g:' + g] != null ? ST0['g:' + g] : SK[g] && ST0[SK[g]] != null ? ST0[SK[g]] : null);
    const mEnd = `${cur}-${String(D).padStart(2, '0')}`, stEnd = (g) => rollAt(O, [g], mEnd);
    const nm1 = M[Math.min(mi + 1, M.length - 1)], TR = IG.tfRules || {};
    const tgtD = (g) => (g[0] === 'C' ? (IG.targets && IG.targets[g] ? IG.targets[g].days : null) : IG.tfDays && IG.tfDays[g] ? IG.tfDays[g][mi] : (TR.days || {})[g]);
    const sdays = (c) => { const n = (c.ds != null ? c.ds : c.sales[Math.min(mi + 1, M.length - 1)]) / dim(nm1); return c.end != null && n > 0 ? c.end / n : null; };
    const dTone = (v, t) => (v == null || !t ? '' : v < t * 0.7 ? 'neg' : v > t * 1.3 ? 'warn' : 'pos');
    const cell = (g) => { const p = PL[g] || []; const a = act[g]; const need = (p[mi] || {}).prod || 0; const r = a != null && need > 0 ? a / need : null;
      return { sales: p.map((x) => x.sales || 0), prod: p.map((x) => x.prod || 0), a, r, now: stNow(g), end: stEnd(g), tgt: tgtD(g) }; };
    const row = (g, cls) => { const c = typeof g === 'string' ? cell(g) : g; const nm = typeof g === 'string' ? GN[g] : g.nm;
      const q = (k) => c[k].reduce((x, y) => x + y, 0);
      return `<tr class="${cls || ''}"><td class="l">${nm}</td>`
        + M.map((m, i) => `<td class="${i === mi ? 'cm' : ''}">${n0(c.sales[i])}</td><td class="${i === mi ? 'cm' : ''}"><b>${n0(c.prod[i])}</b></td>`
          + (i === mi ? `<td class="cm">${c.mon != null ? n0(c.mon) : '<span class="mu">-</span>'}</td><td class="cm">${c.a != null ? n0(c.a) : '-'}</td><td class="cm"><b class="${tone(c.r)}">${c.r != null ? Math.round(c.r * 100) + '%' : '-'}</b></td>`
            + `<td class="cm sk">${c.now != null ? n0(c.now) : '-'}</td><td class="cm">${c.end != null ? n0(c.end) : '-'}</td><td class="cm">${(() => { const v = sdays(c); return v == null ? '-' : `<b class="${dTone(v, c.tgt)}">${Math.round(v)}일</b>${c.tgt ? ` <small class="mu">/ ${Math.round(c.tgt)}</small>` : ''}`; })()}</td>` : '')).join('')
        + `<td class="q">${n0(q('sales'))}</td><td class="q"><b>${n0(q('prod'))}</b></td></tr>`; };
    const sec = (pl, t, gs) => { if (!UI.inScope(pl)) return ''; const C = gs.map(cell);
      const CS = C.filter((c) => c.now != null && c.end != null), sm = (k) => (CS.length ? CS.reduce((a, c) => a + c[k], 0) : null);   // 재고 계 = 어제·월말 둘 다 있는 그룹만(도금 = 판매재, 자가재 제외)
      const T = { nm: `${t} 계`, sales: M.map((_, i) => C.reduce((a, c) => a + c.sales[i], 0)), prod: M.map((_, i) => C.reduce((a, c) => a + c.prod[i], 0)), a: C.reduce((a, c) => a + (c.a || 0), 0), mon: mon(pl), now: sm('now'), end: sm('end'), tgt: null, ds: CS.reduce((a, c) => a + c.sales[Math.min(mi + 1, M.length - 1)], 0) };
      T.r = T.prod[mi] ? T.a / T.prod[mi] : null;
      return `<tr class="sec"><td colspan="${3 + M.length * 2 + 6}">${t}</td></tr>` + gs.map((g) => row(g)).join('') + row(T, 'tot'); };
    const hd = M.map((m, i) => `<th colspan="${i === mi ? 8 : 2}" class="${i === mi ? 'cm' : ''}">${+m.slice(5)}월${i === mi ? ` <small>(진행 중 · 경과 ${Math.round(er * 100)}%)</small>` : ''}</th>`).join('') + '<th colspan="2" class="q">4분기</th>';
    const hd2 = M.map((m, i) => '<th>판매계획</th><th>필요 생산</th>' + (i === mi ? `<th>월차</th><th>생산 실적</th><th>진도율</th><th class="sk">재고 <small>${sd ? +sd.slice(5, 7) + '/' + +sd.slice(8, 10) : ''}</small></th><th>월말 예상</th><th>월말 재고 일수 <small>/ 목표</small></th>` : '')).join('') + '<th class="q">판매계획</th><th class="q">필요 생산</th>';
    return `<h2>그룹별 판매계획 → 필요 생산 → 진도 <small>필요 생산 = 판매계획 + 월말 목표 재고 − 월초 재고(계획 엔진 월 물량) · 진도율 = 이번 달 생산 실적 ÷ 필요 생산</small><span class="unit">톤</span></h2>
      <div class="scroll"><table class="gt nd"><thead><tr><th class="l" rowspan="2">그룹</th>${hd}</tr><tr>${hd2}</tr></thead>
      <tbody>${sec('G', '도금', ['G국내', 'G수출', 'G자동차', 'G자가재'])}${sec('C', '컬러', ['C건재', 'C수출', 'C수요'])}</tbody></table></div>
      <p class="small" style="margin:6px 0 0">진도율 색: 경과율(${Math.round(er * 100)}%) 이상 초록 · 10%p 안쪽 노랑 · 그보다 낮으면 빨강. 월차 = 판매생산속보 라인 월차 합(그룹별 월차는 속보에 없어 계에만). 재고 = 판매생산속보 원천 표 실제 재고(자가재 = 도금 제품 자가재 전체, 도금 계는 자가재 빼고 판매재만), 월말 예상 = 재고 추이와 같은 매일 롤링(어제 실제 + 남은 생산 − 남은 출하), 월말 재고 일수 = 월말 예상 ÷ 다음 달 하루 판매 — 목표 일수 대비 70% 미만 빨강 · 130% 넘으면 노랑. 목표 재고: 도금 = TF 목표 일수(자동차 약 30·수출 15·국내 20일), 컬러 = 생산주기 기준. 도금 자가재 판매계획 = 컬러 공장이 쓸 자가재 소재</p>`;
  }

  // ---------- 오너 한눈에: 상태 4칸 — 주간보고(report.html)와 같은 숫자·기준(생산 98/90 · 출하 95/80 · 재고 110/130%) ----------
  const ST = { good: '양호', warn: '주의', bad: '조치' };
  const toneP = (r) => (r >= 0.98 ? 'good' : r >= 0.9 ? 'warn' : 'bad');
  const toneS = (r) => (r >= 0.95 ? 'good' : r >= 0.8 ? 'warn' : 'bad');
  const toneK = (r) => (r <= 1.1 ? 'good' : r <= 1.3 ? 'warn' : 'bad');
  const kt = (v) => (Math.abs(v) >= 10000 ? (v / 1000).toFixed(1) + '천' : n0(v));
  function rollAt(O, keys, d) {                               // 매일 롤링 재고(재고 추이·가동 캘린더와 같은 값)의 그날 그룹 합
    const R = O.stockRoll; if (!R || !R.days) return null;
    const i = Math.round((Date.parse(d) - Date.parse(R.d0)) / 864e5);
    let s = 0, n = 0; keys.forEach((k) => { const v = (R.days[k] || [])[i]; if (v != null) { s += v; n++; } });
    return n ? s : null;
  }
  const CK = ['C건재', 'C수출', 'C수요'], GK = ['G국내', 'G수출', 'G자동차'];
  const MAXN = { c: '컬러 제품', g: '도금 제품(판매재)' };
  function tile(href, name, tone, big, unit, lb, bar, mark, l1, l2) {
    return `<a class="ot ${tone}" href="${href}"><div class="hd">${name}<span class="st">${ST[tone]}</span></div>
      <div class="big">${big}<small>${unit}</small></div><div class="lb">${lb}</div>
      <div class="bar"><i style="width:${Math.max(0, Math.min(100, bar))}%"></i>${mark != null ? `<u style="left:${Math.max(0, Math.min(100, mark))}%"></u>` : ''}</div>
      <div class="ln1">${l1}</div><div class="ln2">${l2}</div></a>`;
  }
  const FC = {};
  function owner(O) {
    const L = O.lines || [], sr = O.sr || {}, G = O.groups || [];
    const sum = (pl, k) => L.filter((x) => x.pl === pl).reduce((a, x) => a + (x[k] || 0), 0);
    const after = (pl) => G.filter((g) => g.pl === pl).reduce((a, g) => a + ((g.prod || {}).after || 0), 0);
    const out = [];
    for (const [pl, nm, href] of [['G', '도금 생산', 'plating_actual.html'], ['C', '컬러 생산', 'color_actual.html']]) {
      if (!UI.inScope(pl)) continue;
      const a = sum(pl, 'actual'), sc = sum(pl, 'sched'), m = sum(pl, 'month'); if (!sc) continue;
      const fc = a + after(pl), r = a / sc;
      FC[pl] = { fc, m };                                       // 전망 표 이번 달 칸도 같은 값(타일과 표 숫자가 다르지 않게)
      out.push(tile(href, nm, toneP(r), Math.round(r * 100), '%', '이번 달 일정 대비', m ? a / Math.max(m, fc) * 100 : 0, m ? sc / Math.max(m, fc) * 100 : null,
        `<b>${n0(a)}</b>t / 일정 ${n0(sc)}t (${sg(a - sc)})`, `월말 예상 <b>${n0(fc)}</b>t · 속보 월차 ${n0(m)}t (${pc(fc, m)}%)`));
    }
    const ship = (sr.ship || []), sh = ship.find((x) => x.name === '합계');
    if (sh && sh.sched) {
      const low = ship.filter((x) => x.name !== '합계' && x.sched).map((x) => [x.name, x.actual / x.sched]).sort((p, q) => p[1] - q[1]).slice(0, 2);
      out.push(tile('report.html', '출하', toneS(sh.actual / sh.sched), Math.round(sh.actual / sh.sched * 100), '%', '이번 달 출하 일정 대비', sh.actual / sh.month * 100, sh.sched / sh.month * 100,
        `<b>${n0(sh.actual)}</b>t / 일정 ${n0(sh.sched)}t (${sg(sh.actual - sh.sched)})`, `가장 뒤처짐: ${low.map(([n, r]) => `${esc(n)} <b>${Math.round(r * 100)}%</b>`).join(' · ')}`));
    }
    const st = {}; (sr.stock || []).forEach((x) => { st[x.name] = x; });
    const c = st[MAXN.c], g = st[MAXN.g];
    if (c && c.target) {
      const rc = c.current / c.target, rg = g && g.target ? g.current / g.target : 0, worst = Math.max(rc, rg);
      const e12c = rollAt(O, CK, '2026-12-31');
      out.push(tile('integrated.html', '제품 재고', toneK(worst), Math.round(rc * 100), '%', `컬러 제품 · 월말 최대 ${n0(c.target)}t 대비`, rc / Math.max(rc, 1.5) * 100, 1 / Math.max(rc, 1.5) * 100,
        `컬러 <b>${n0(c.current)}</b>t (${sg(c.current - c.target)}) · 도금 판매재 <b>${Math.round(rg * 100)}%</b>`, e12c != null ? `12월 말 예상 컬러 <b>${kt(e12c)}</b>t (계획대로 갈 때)` : '목표 = \'27 판생그룹 월말 최대'));
    }
    return out.join('');
  }
  // 월말·4분기 전망(사용자 10/21: 표 → 한눈에) — 왼쪽 = 달마다 생산 예상 vs 계획 막대, 오른쪽 = 제품 재고 지금 → 월말 기둥 + 월말 최대 선
  function fcCard(O) {
    const M = O.months || [], pm = O.planMonth, pl = O.plating || {}, cl = (O.color || {}).lines || {};
    const ends = M.map((m) => `${m}-${String(dim(m)).padStart(2, '0')}`);
    const prod = [];
    if (pm && UI.inScope('G')) prod.push(['도금', 'G', M.map((m, i) => (i === 0 && FC.G ? [FC.G.fc, FC.G.m, '속보 월차'] : [pm.g1[i] + pm.g2[i], (pl.g1 || [])[i] + (pl.g2 || [])[i], '확정 계획']))]);
    if (UI.inScope('C') && Object.keys(cl).length) { const tot = (m, k) => Object.values(cl[m] || {}).reduce((a, x) => a + (x[k] || 0), 0);
      prod.push(['컬러', 'C', M.map((m, i) => (i === 0 && FC.C ? [FC.C.fc, FC.C.m, '속보 월차'] : [tot(m, 'placed'), tot(m, 'plan'), '월차']))]); }
    const pbar = ([nm, pl_, R]) => `<div class="fp-g"><div class="fp-gh">${nm} 생산 <small>4분기 ${n0(R.reduce((a, r) => a + r[0], 0))}t / 계획 ${n0(R.reduce((a, r) => a + (r[1] || 0), 0))}t</small></div>`
      + R.map(([v, ref, lb], i) => { const r = ref ? v / ref : 0, t = toneP(r), mx = Math.max(v, ref, 1) * 1.04;
        return `<div class="fp-r ${t}" title="${+M[i].slice(5)}월 ${nm} 예상 ${n0(v)}t / ${lb} ${n0(ref)}t"><span class="fp-m">${+M[i].slice(5)}월</span><span class="fp-b"><i style="width:${v / mx * 100}%"></i><u style="left:${ref / mx * 100}%"></u></span><span class="fp-v"><b>${Math.round(r * 100)}%</b> ${n0(v)}t</span></div>`; }).join('') + '</div>';
    const st = {}; ((O.sr || {}).stock || []).forEach((x) => { st[x.name] = x; });
    const stk = [];
    for (const [keys, nm, k, pl_] of [[CK, '컬러 제품', 'c', 'C'], [GK, '도금 판매재', 'g', 'G']]) {
      if (!UI.inScope(pl_)) continue;
      const S = st[MAXN[k]] || {}, mx = S.target, cur = S.current;
      const pts = [['지금', cur]].concat(ends.map((d, i) => [`${+M[i].slice(5)}월 말`, rollAt(O, keys, d)])).filter((p) => p[1] != null);
      if (!pts.length || !mx) continue;
      const top = Math.max(mx, ...pts.map((p) => p[1])) * 1.12;
      stk.push(`<div class="fs-g"><div class="fp-gh">${nm} 재고 <small>월말 최대 ${n0(mx)}t</small></div><div class="fs-c"><em class="fs-max" style="bottom:${mx / top * 100}%"><span>최대 ${n0(mx)}</span></em>`
        + pts.map(([lb, v]) => { const r = v / mx, t = toneK(r); return `<div class="fs-col ${t}" title="${nm} ${lb} ${n0(v)}t · 월말 최대의 ${Math.round(r * 100)}%"><div class="fs-bar" style="height:${Math.max(0, v) / top * 100}%"><b>${(v / 1000).toFixed(1)}천</b></div><span>${lb}</span></div>`; }).join('') + '</div></div>');
    }
    const now = pl.now || {};
    const due = !UI.inScope('G') ? '' : now.fillShort != null
      ? `<p class="fp-due ${now.orderShort ? 'bad' : now.orderLateT ? 'warn' : 'good'}" title="${esc((now.shortBy || []).join(', '))}">도금 납기 — 주문 결품 <b>${n0(now.orderShort)}t</b> · 늦는 주문 <b>${n0(now.orderLateT)}t</b> · 판매계획 보충 미편성 ${n0(now.fillShort)}t</p>`
      : `<p class="fp-due ${now.short ? 'bad' : now.late ? 'warn' : 'good'}" title="${esc((now.shortBy || []).join(', '))}">도금 납기 — 결품 <b>${n0(now.short || 0)}t</b> · 지연 <b>${n0(now.late || 0)}톤·일</b></p>`;
    if (!prod.length && !stk.length) return '';
    return `<h2>월말·4분기 전망 <small>생산 = 이번 달 실적 + 남은 계획(막대 = 예상, 세로선 = 계획) · 재고 = 어제 실제에서 계획대로 굴린 월말 값</small></h2>
      <div class="fp-wrap"><div class="fp-l">${prod.map(pbar).join('')}</div><div class="fp-rgt">${stk.join('')}</div></div>${due}`;
  }
  function loadCard(O) {
    const p = O.planMonth || O.plating, mx = Math.max(...O.months.map((m, i) => p.g1[i] + p.g2[i])) * 1.04;
    return `<h2>월별 도금 계획 <small>${O.planMonth ? '실적 + 최신 재계획' : O.rec}</small><span class="unit">톤</span></h2><div class="legend"><span><i style="background:var(--c1)"></i>1CGL</span><span><i style="background:var(--c2)"></i>2CGL</span></div>
      ${O.months.map((m, i) => { const a = p.g1[i], b = p.g2[i]; return `<div class="lrow"><span>${+m.slice(5)}월</span><div class="track"><i class="seg s1" style="width:${a / mx * 100}%;--i:${i}" data-tip="${+m.slice(5)}월 1CGL ${n0(a)}t"></i><i class="seg s2" style="left:${a / mx * 100}%;width:${b / mx * 100}%;--i:${i}" data-tip="${+m.slice(5)}월 2CGL ${n0(b)}t"></i></div><span class="pct">${n0(a + b)}</span></div>`; }).join('')}`;
  }
  function colorCard(O) {
    const cl = O.color.lines;
    return `<h2>컬러 월차 편성률 <small>편성 / 월차</small></h2><div class="crow hd"><span></span>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => `<span>${l}</span>`).join('')}</div>
      ${O.months.map((m, i) => `<div class="crow"><span>${+m.slice(5)}월</span>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l, j) => { const x = (cl[m] || {})[l] || { plan: 0, placed: 0 }; const r = x.plan ? x.placed / x.plan : 0; return `<div class="cl" title="${+m.slice(5)}월 ${l} 편성 ${n0(x.placed)} / 월차 ${n0(x.plan)}t"><i class="${r < 0.995 ? 'short' : ''}" style="width:${Math.min(100, r * 100)}%;--i:${i * 4 + j}"></i><span>${(r * 100).toFixed(r < 0.995 ? 1 : 0)}%</span></div>`; }).join('')}</div>`).join('')}`;
  }
  function dueCard(O) {
    const sc = UI.scope(), q = sc === 'all' ? O.procure : (O.procureBy || {})[sc] || O.procure;
    if (!q) return '';
    return `<h2>발주 마감 임박 <small>기본 업체(27년 배정 최대) · 2주 내</small><span class="unit">톤</span></h2>
      <table class="mini"><tbody>${(q.nearTop || []).slice(0, 6).map((x) => `<tr><td><b>${md(x.deadline)}</b></td><td>${esc(x.mat)}</td><td class="r">${n0(x.t)}</td><td class="small">${esc(String(x.sup || '').slice(0, 10))}</td></tr>`).join('') || '<tr><td class="small">없음</td></tr>'}</tbody></table>
      <a class="more" href="procure.html">소재 발주 →</a>`;
  }
  function basis(O) {
    const now = (O.plating || {}).now || {};
    return `<summary>산출 기준 · 알림</summary><ul>
      <li>생산·출하 누계, 월차, 일정 = 판매생산속보(공식). 월차 = 이번 달 전체 계획, 일정 = 1일~어제 계획 누계. 원형 % = 진도(누계 ÷ 월차), 점 색·라인 타일 % = 일정 대비(누계 ÷ 일정, 98%↑ 초록 · 90%↑ 노랑). 라인 이번 달 일별 추이 = MES 코일(도금 더미 제외, 1일부터).</li>
      <li>그룹 실적 = MES 판매그룹. 계획 = 도금 확정 계획 일별 합 · 컬러 편성. 월말 예상 = 실적 + 남은 계획(도금 매일 재계획).</li>
      <li>그룹별 날짜 계획 누계는 비교하지 않음(부서 배정일은 계획 모델상 정해지지 않음). 컬러 그룹 합은 MES 코일 합이라 속보 누계와 다를 수 있음.</li>
      ${(now.lockNotes || []).map((n) => `<li>재계획: ${esc(n)}</li>`).join('')}${(now.shortBy || []).length ? `<li>결품 예상: ${now.shortBy.map(esc).join(', ')}</li>` : ''}</ul>`;
  }

  // 작업지시(MES) vs 계획: 도금 = 대기 코일 강종 ↔ 계획 다음 3일 강종, 컬러 = 라인별 앞으로 7일 예정 톤
  function woCard(O) {
    const W = O.wo; if (!W) return '';
    const G = (W.plating || {}).lines || [], C = W.color;
    const ymd = (s) => (s && s.length === 8 ? `${+s.slice(4, 6)}/${+s.slice(6)}` : md(s));
    const gl = G.filter((x) => UI.inScope('G')).map((x) => `<div class="wo-l ${x.mismatch.length ? 'bad' : ''}"><b>${x.line}</b>
      <span>대기 ${x.coils}코일 · ${x.byAlloy.map((a) => `${esc(a[0])} ${a[1]}코일(약 ${n0(a[2])}t)`).join(', ') || '없음'}</span>
      <span class="small">계획 ${x.plan.map((p) => `${md(p[0])} ${esc(p[1] || '-')}`).join(' → ')}</span>
      <em class="${x.mismatch.length ? 'no' : 'ok'}">${x.mismatch.length ? `불일치: ${esc(x.mismatch.join('·'))}` : '계획과 맞음'}</em></div>`).join('');
    const cl = C && UI.inScope('C') ? `<table class="gt wo-c"><thead><tr><th class="l">컬러 예정(t)</th>${C.days.map((d, i) => `<th>${md(d)}</th>`).join('')}<th>확정</th><th>예정 끝</th></tr></thead><tbody>${C.lines.map((x) => `<tr><td class="l">${x.line}</td>${x.days.map((v) => `<td>${v ? n0(v) : '·'}</td>`).join('')}<td>${x.confRate == null ? '-' : Math.round(x.confRate * 100) + '%'}</td><td>${x.until ? md(x.until) : '-'}</td></tr>`).join('')}</tbody></table>` : '';
    if (!gl && !cl) return '';
    return `<h2>현장 작업지시 vs 계획 <small>MES 작업지시 ${ymd((W.plating || {}).asOf)} 기준</small></h2><div class="wo-g">${gl}</div>${cl}
      <p class="small">도금: 미완료 지시 코일의 강종(생산번호로 판별, 톤은 최근 코일 평균으로 추정)이 계획의 향후 3일 강종 안에 있으면 '맞음'. 도금 지시는 보통 1~2일치만 나옴. 컬러 = 작업 예정일별 지시 예정 중량 — 첫날 값이 하루 능력보다 큰 것(예: 1CCL)은 밀린 지시가 그날로 잡힌 것으로 보여 확인 중.</p>`;
  }

  // ---------- 2주 일정: 이번 주 월요일부터 14일, 날짜마다 할 일(도금 M/C·정지 / 컬러 S/D·수리 / 소재 발주 / 계획재 발주) ----------
  const WK = { plating: ['도금 M/C·정지', 'var(--s1)'], color: ['컬러 S/D·수리', 'var(--s3)'], order: ['소재 발주 마감', 'var(--bad)'], plan: ['계획재 소재 발주', 'var(--s4)'] };
  function weekCard(O) {
    const W = O.week; if (!W) return '';
    const today = O.today || W.from;
    const t = new Date(today + 'T00:00:00Z'), mon = new Date(t); mon.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i); return d.toISOString().slice(0, 10); });
    const ev = W.events.filter((e) => UI.inScope(e.pl));
    const cells = days.map((d, i) => { const es = ev.filter((e) => e.d === d);
      return `<div class="calc ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" style="--ci:${i}"><span class="dn ${i % 7 >= 5 ? 'we' : ''}">${+d.slice(5, 7)}/${+d.slice(8)}</span>${es.slice(0, 4).map((e) => `<span class="chip" style="--kc:${WK[e.kind][1]}" title="${esc(e.text)}">${esc(e.text)}</span>`).join('')}${es.length > 4 ? `<span class="more">+${es.length - 4}건</span>` : ''}</div>`; }).join('');
    const cnt = (k) => ev.filter((e) => e.kind === k && e.d >= today).length;
    return `<h2>2주 일정 <small>금주·차주 주요 일정 (상세는 각 화면)</small></h2>
      <div class="cal-lg" style="margin-bottom:10px">${Object.entries(WK).map(([k, [n, c]]) => `<span class="lg" style="--kc:${c};cursor:default"><i></i>${n} <small>${cnt(k)}</small></span>`).join('')}</div>
      <div class="calg wk2">${['월', '화', '수', '목', '금', '토', '일'].map((w, i) => `<div class="calh ${i >= 5 ? 'we' : ''}">${w}</div>`).join('')}${cells}</div>
      <p class="small" style="margin:10px 0 0">바로 가기: <a href="status.html">도금 가동 현황</a> · <a href="color_status.html">컬러 가동 현황</a> · <a href="procure.html">소재 발주</a> · <a href="planstock.html">계획재</a></p>`;
  }
  function render(O) {
    lastO = O;
    $('h-meta').innerHTML = `실적 <b>~${md(O.asOf)}</b> · 계획 <b>확정 계획 · 도금은 매일 실적 반영 재계산</b> · 계산 ${esc(String(O.built).replace('T', ' ').slice(5, 16))}`;
    $('h-own').innerHTML = owner(O);
    const fc = fcCard(O); $('h-fc').innerHTML = fc; $('h-fc').hidden = !fc;
    const gh = grp(O); $('h-grp').innerHTML = gh; $('h-grp').hidden = !gh;
    const nd = needCard(O); $('h-need').innerHTML = nd; $('h-need').hidden = !nd;
    $('h-lines').innerHTML = lines(O);
    const wh = woCard(O); $('h-wo').innerHTML = wh; $('h-wo').hidden = !wh;
    const wk = weekCard(O); $('h-week').innerHTML = wk; $('h-week').hidden = !wk;
    $('h-load').innerHTML = loadCard(O); $('h-load').hidden = false;
    const du = dueCard(O); $('h-due').innerHTML = du; $('h-due').hidden = !du;
    $('h-basis').innerHTML = basis(O); $('h-basis').hidden = false;
    UI.reveal(document); UI.count(document);
    const tip = $('h-tip');
    document.querySelectorAll('[data-tip]').forEach((s) => {
      s.addEventListener('mousemove', (e) => { tip.textContent = s.dataset.tip; tip.style.display = 'block'; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 34) + 'px'; });
      s.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }

  let env = null;
  const envReady = GP.latest('portal.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    try { const O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } $('h-lock').hidden = true; render(O); UI.onScope(() => render(lastO));
      GP.latest('integrated.enc.json').then((e) => (e ? GP.decryptJSON(e, pw) : null)).then((x) => { if (x) { IG = x; render(lastO); } }).catch(() => { /* 통합 계획 없으면 표 생략 */ }); }
    catch (e) { $('h-own').innerHTML = ''; $('h-lock').hidden = false; $('h-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('h-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('h-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else { $('h-own').innerHTML = ''; $('h-lock').hidden = false; }
  }).catch(() => { $('h-own').innerHTML = ''; $('h-lock').hidden = false; $('h-msg').textContent = '요약 자료를 찾을 수 없습니다'; });
})();
