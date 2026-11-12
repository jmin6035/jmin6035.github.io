/* 관제(11/12 회의·화이트보드 '# 관제') — 달 탭(이번 달부터 3달) · 결론 카드 4개 · 도금 전체 | 컬러 전체 막대 · 그룹별 같은 막대 · 소재 입고
   이번 달 = 실적 기준, 다음 두 달 = 계획 대비 주문서(납기 기준). 숫자는 기존 화면 자료·계산을 그대로 씀:
   카드·그룹 이번 달 = 수주 관제(suju.enc.json) · 다음 달 계획 = 통합 계획(integrated)·월간 가동(portal.monthPlan) · 주문(납기) = 주문진도(cg/cc_order_progress, 수주 관제 ordMonth 와 같은 합)
   소재 = 소재 관제 '월별 소재 입고 계획'과 같은 계산(입고 완료 + 발주(입고 예정) + 아직 발주 안 함, ui/proccalc.js) */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const FILES = ['suju.enc.json', 'portal.enc.json', 'integrated.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'procure.enc.json'];
  // 그룹 = 판매그룹 합 단위(회의: 컬러건재 주문재·계획재 나누지 않음, 컬러수출 3그룹은 계획·재고가 합으로만 있음)
  const GRP = [
    { k: 'G수출', pl: 'G', nm: '도금수출', sj: ['도금수출'], od: ['도금수출그룹'] },
    { k: 'G국내', pl: 'G', nm: '도금국내', sj: ['도금국내'], od: ['도금판매그룹'] },
    { k: 'G자동차', pl: 'G', nm: '자동차', sj: ['자동차'], od: ['자동차강판판매그룹'] },
    { k: 'G자가재', pl: 'G', nm: '도금 자가재', sub: '컬러 소재', sj: ['자가재'], od: null },
    { k: 'C수출', pl: 'C', nm: '컬러수출', sub: '건재수출 · 가전수출 · 가전내수', sj: ['건재수출', '가전수출', '가전내수'], od: ['컬러수출그룹'] },
    { k: 'C건재', pl: 'C', nm: '컬러건재', sub: '주문재 + 계획재', sj: ['주문재', '계획재'], od: ['컬러건재판매그룹'] },
    { k: 'C수요', pl: 'C', nm: '수요개발', sj: ['수요개발'], od: ['수요개발그룹'] },
  ];
  const PN = { G: '도금', C: '컬러' };
  let X = null, A = null, mSel = null, bound = false;
  const LS = 'kj-month';

  CT.boot(FILES, (D) => { if (D !== X) { X = D; A = prep(D); } draw(); });

  const inPl = (p) => CT.inScope(p);
  const sum = (L, f) => { let s = 0, any = false; for (const x of L) { const v = f(x); if (v != null && !isNaN(v)) { s += +v; any = true; } } return any ? s : null; };
  const addM = (ym, k) => { const d = new Date(ym + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
  const mLab = (m) => `${+m.slice(5)}월`;

  /* ---------- 자료 준비(한 번) ---------- */
  function prep(D) {
    const S = D.suju, P = D.portal || {}, I = D.integrated || {};
    if (!S) throw new Error('수주 관제 자료(suju)가 없습니다');
    const M0 = S.month, months = [M0, addM(M0, 1), addM(M0, 2)];
    const SG = Object.fromEntries(S.groups.map((g) => [g.key, g]));
    const BR = Object.fromEntries((S.bridge || []).map((b) => [b.eng, b]));
    const V = ((I.variants || {})[I.rec || I.confirmed || 'V1'] || {});
    const pmIdx = (m) => (P.months || []).indexOf(m);
    // 주문(납기 달별) — 수주 관제 ordMonth 와 같은 합(주문 톤, 납기 기준)
    const ordDue = {};
    for (const [pl, R] of [['G', (D.cg_order_progress || {}).rows], ['C', (D.cc_order_progress || {}).rows]]) for (const r of R || []) {
      const m = String(r.due || '').slice(0, 7), g = GRP.find((x) => x.pl === pl && x.od && x.od.includes(r.grp)); if (!g || !m) continue;
      ordDue[`${g.k}|${m}`] = (ordDue[`${g.k}|${m}`] || 0) + (+r.ordT || 0); }
    const hasOrd = { G: !!(D.cg_order_progress && D.cg_order_progress.rows), C: !!(D.cc_order_progress && D.cc_order_progress.rows) };
    // 묶음 값(컬러수출 3그룹·컬러건재 2그룹은 계획·실적·출하가 합으로 한 번만 들어 있음)
    const one = (gs, k, gk) => (gs[0] && gs[0][gk] ? gs[0][k] : sum(gs, (g) => g[k]));
    const grp = {};
    for (const G of GRP) {
      const gs = G.sj.map((k) => SG[k]).filter(Boolean), b = BR[G.k] || {}, out = {};
      // 이번 달(실적)
      out[M0] = { sales: sum(gs, (g) => g.sales), ord: G.od ? sum(gs, (g) => g.orders) : null,
        pPlan: one(gs, 'planMon', 'achGrp'), pAct: one(gs, 'actMon', 'achGrp'), pDue: one(gs, 'planMonCum', 'achGrp'),
        sPlan: one(gs, 'shipMon', 'shipGrp'), sAct: one(gs, 'shipAct', 'shipGrp'), sDue: one(gs, 'shipDue', 'shipGrp'),
        stk: b.begin, tgt: b.target, ship: G.k !== 'G자가재' && G.k !== 'C수요' };
      // 다음 두 달(계획 대비 주문)
      for (const m of months.slice(1)) { const i = pmIdx(m), pl = (V.plan || {})[G.k], x = i >= 0 && pl ? pl[i] : null, mp = ((P.monthPlan || {})[m] || {})[G.k] || {};
        out[m] = { sales: x ? x.sales : null, ord: G.od && hasOrd[G.pl] ? Math.round(ordDue[`${G.k}|${m}`] || 0) : null, pPlan: mp.prod != null ? mp.prod : null, stk: x ? x.end : null, tgt: x ? x.target : null }; }
      grp[G.k] = out;
    }
    // 공장 전체(그룹 합이 아니라 회사 양): 생산 = 라인, 출하·재고 = 판생속보, 판매·수주 = 판매그룹 합(자가재는 내부 투입이라 뺌)
    const SR = P.sr || {}, shipNm = { G: ['도금판매', '도금수출', '자동차강판'], C: ['컬러수출', '컬러건재'] };
    const stkOf = (re) => (SR.stock || []).find((x) => re.test(x.name)) || {};
    const plant = {};
    for (const pl of ['G', 'C']) {
      const Gs = GRP.filter((g) => g.pl === pl && g.k !== 'G자가재'), LN = (S.lines || []).filter((l) => l.pl === pl), out = {};
      const ms = stkOf(pl === 'G' ? /^도금 소재/ : /^컬러 소재/), pd = stkOf(pl === 'G' ? /^도금 제품\(판매재\)/ : /^컬러 제품/);
      const sh = (SR.ship || []).filter((x) => shipNm[pl].includes(x.name));
      const pg = (P.groups || []).filter((g) => g.pl === pl && g.ship);
      out[M0] = { sales: sum(Gs, (g) => grp[g.k][M0].sales), ord: sum(Gs.filter((g) => g.od), (g) => grp[g.k][M0].ord),
        pPlan: sum(LN, (l) => l.month), pAct: sum(LN, (l) => l.actual), pDue: sum(LN, (l) => l.sched),
        sPlan: sum(sh, (x) => x.month), sAct: sum(sh, (x) => x.actual), sDue: sum(pg, (g) => g.ship.due),
        mat: ms.current, matCap: ms.target, stk: pd.current, cap: pd.target, ship: true };
      for (const m of months.slice(1)) {
        const lm = V.lineMonth || {}, mo = +m.slice(5), cl = (I.colorLines || {})[m];
        const prod = pl === 'G' ? sum(['1CGL', '2CGL'], (l) => lm[`${l}|${mo}`]) : cl ? sum(Object.values(cl), (x) => (x.plan != null ? x.plan : x.placed)) : null;
        out[m] = { sales: sum(Gs, (g) => grp[g.k][m].sales), ord: sum(Gs.filter((g) => g.od), (g) => grp[g.k][m].ord), pPlan: prod,
          mat: null, matCap: ms.target, stk: sum(Gs, (g) => grp[g.k][m].stk), cap: pd.target }; }
      plant[pl] = out;
    }
    return { S, P, I, M0, months, grp, plant, mat: matMonths(D, months) };
  }

  /* 소재 관제 '월별 소재 입고 계획'과 같은 계산(supply.js monthSum · 소재 유형별): 그 달 들어와야 할 양 = 입고 완료 + 발주(입고 예정) + 아직 발주 안 함
     입고 완료 = MES 입고(portal.matRecv) · 발주 = MES 미입고 발주 + 직접 넣은 입고 예정(ProcCalc.autoArr) · 아직 발주 안 함 = 재고·기발주로 못 채운 부족(ProcCalc.judge) — 임가공(도금 N)은 뺌 */
  function matMonths(D, months) {
    const P = D.procure, PO = D.portal || {}, cell = {};
    if (!P || !window.ProcCalc) return null;
    let St = null; const C = ProcCalc.make(() => ({ D: P, S: St })); St = C.load();
    const today = St.today, ym = (d) => String(d).slice(0, 7);
    const add = (pl, m, k, t) => { if (!months.includes(m) || !(t >= 0.01)) return; const x = (cell[`${pl}|${m}`] = cell[`${pl}|${m}`] || { rec: 0, ord: 0, nw: 0 }); x[k] += t; };
    for (const [k, t] of Object.entries(PO.matRecv || {})) { const [pl, c, d] = k.split('|'); if (pl === 'G' && c === 'N') continue; add(pl, ym(d), 'rec', +t); }
    const arrs = [...C.autoArr(), ...St.arr.map((a) => ({ ...a, plant: ProcCalc.plantOf(a.code), t: +a.t || 0 }))];
    for (const a of arrs) { if (a.plant === 'G' && a.code === 'N') continue; add(a.plant, ym(a.date < today ? today : a.date), 'ord', +a.t || 0); }
    for (const j of C.judge()) { if (j.kind === 'pos' || j.short < 1) continue; for (const x of j.split) if (x.t >= 1) add(j.plant, ym(j.needBy < today ? today : j.needBy), 'nw', x.t); }
    return { cell, hasRecv: !!PO.matRecv };
  }

  /* ---------- 그리기 ---------- */
  function draw() {
    const m = document.getElementById('ct-main');
    if (!A) return;
    const { months } = A;
    if (!mSel || !months.includes(mSel)) { let s = null; try { s = localStorage.getItem(LS); } catch (e) { /* 무시 */ } mSel = months.includes(s) ? s : months[0]; }
    const cur = mSel === A.M0, CH = [];
    const tabs = `<div class="kj-tabs" role="tablist" aria-label="달">${months.map((x, i) => `<button type="button" role="tab" data-m="${x}" aria-selected="${x === mSel}">${mLab(x)}<small>${i ? '계획' : '실적'}</small></button>`).join('')}</div>`;
    const mode = cur ? `<span class="kj-mode"><b>실적 ~${md(A.S.asOf)}</b> · 수주 = 확정 주문 · 재고 = ${md(A.S.asOf)} 실재고 · 계획 막대 안 검은 선 = 오늘까지 계획</span>`
      : `<span class="kj-mode"><b>${mLab(mSel)} 계획 대비 주문서</b> · 수주 = 납기 ${mLab(mSel)} 주문 · 재고 = 월말 계획</span>`;
    let h = `<div class="kj-top">${tabs}${mode}</div>` + cards();
    // 도금 전체 | 컬러 전체
    const pls = ['G', 'C'].filter(inPl);
    h += `<div class="kj-sec">${pls.map((p) => PN[p]).join(' · ')} 전체 <small>${mLab(mSel)} · 회사 전체 양</small></div><div class="kj-two">`
      + pls.map((p) => { const id = CH.push({ x: A.plant[p][mSel], big: true, plant: true }) - 1; const x = A.plant[p][mSel];
        return `<section class="kj-c big"><div class="h"><b>${PN[p]} 전체</b><span class="u" data-u="${id}"></span></div><div class="kj-ch" data-ch="${id}"></div>`
          + `<p class="ft">재고 상한 · 소재 <b>${n0(x.matCap)}</b>t · 제품 <b>${n0(x.cap)}</b>t</p></section>`; }).join('') + '</div>';
    // 그룹별
    h += `<div class="kj-sec">그룹별 <small>${mLab(mSel)} · 계획 대비 실적</small></div>`;
    for (const p of pls) {
      h += `<div class="kj-gg">` + GRP.filter((g) => g.pl === p).map((G) => { const x = A.grp[G.k][mSel], id = CH.push({ x, big: false, plant: false, self: G.k === 'G자가재' }) - 1;
        return `<section class="kj-c"><div class="h"><b>${esc(G.nm)}${G.sub ? `<small>${esc(G.sub)}</small>` : ''}</b><span class="u" data-u="${id}"></span></div><div class="kj-ch" data-ch="${id}"></div>`
          + `<p class="ft">${x.tgt != null ? `재고 목표 <b>${n0(x.tgt)}</b>t` : '재고 목표 자료 없음'}</p></section>`; }).join('') + '</div>';
    }
    h += matSec();
    m.innerHTML = h;
    m.querySelectorAll('.kj-tabs button').forEach((b) => (b.onclick = () => { mSel = b.dataset.m; try { localStorage.setItem(LS, mSel); } catch (e) { /* 무시 */ } draw(); }));
    // 단위는 묶음(공장 전체 · 그룹별)마다 하나로: 한 그래프라도 칸이 좁으면 그 묶음 전체를 천t 로
    const els = [...m.querySelectorAll('[data-ch]')];
    for (const big of [true, false]) {
      const E = els.filter((el) => CH[+el.dataset.ch].big === big), W = (el) => el.clientWidth || 400;
      const compact = E.some((el) => !chart(CH[+el.dataset.ch], cur, W(el)).wide);
      E.forEach((el) => { const r = chart(CH[+el.dataset.ch], cur, W(el), compact); el.innerHTML = r.svg; const u = m.querySelector(`[data-u="${el.dataset.ch}"]`); if (u) u.textContent = r.unit; });
    }
    if (!bound) { bound = true; let rt = null; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); }); }
  }

  /* 결론 카드 4개 — 수주 관제 종합 관제판(새 양식)과 같은 계산. 창고 재고는 소재 · 제품을 카드 안에 바로 + 상한 */
  function cards() {
    const D = A.S, inP = (p) => inPl(p);
    const G = D.groups.filter((g) => inP(g.plant));
    const dem = G.filter((g) => g.base != null), sb = sum(dem, (g) => g.base) || 0, so = sum(dem, (g) => g.orders) || 0;
    const prog = sb ? so / sb * 100 : null;
    const LN = D.lines.filter((l) => inP(l.pl)), lsch = sum(LN, (l) => l.sched) || 0, lact = sum(LN, (l) => l.actual) || 0, ach = lsch ? lact / lsch * 100 : null;
    const mats = D.mats.filter((x) => inP(x.plant)), mw = mats.filter((x) => x.st === '경고'), mo = mats.filter((x) => x.st === '주의'), mx = mw.concat(mo);
    const st1 = prog == null ? null : prog >= 100 ? 'ok' : prog >= 90 ? 'warn' : 'bad';
    const st2 = ach == null ? null : ach > 105 ? 'warn' : ach >= 95 ? 'ok' : ach >= 90 ? 'warn' : 'bad';
    const st3 = mw.length ? 'bad' : mo.length ? 'warn' : 'ok';
    const pc = (v) => (v == null ? '–' : `${(+v).toFixed(1)}<small>%</small>`);
    const kc = (h, t, tone, v, s, tip) => `<a class="kj-kl" href="${h}"><div class="ct-kpi ${tone || ''}" title="${esc(tip)} — 누르면 자세히"><div class="l">${t}</div><div class="v">${v}</div><div class="s">${s}</div></div></a>`;
    const k1 = kc('suju.html#order', '수주 진도', st1, pc(prog), `확정 ${n0(so)} / 기준선 ${n0(sb)}t`, `확정 주문 ÷ 기준선(이달 1일~${md(D.cut)} 편성량)`);
    const k2 = kc('suju.html#prod', '생산 달성', st2, pc(ach), `실적 ${n0(lact)} / 일정 누계 ${n0(lsch)}t`, `판매생산속보 일정 누계 대비 · 실적 ~${md(D.asOf)}`);
    const k3 = kc('suju.html#mat', '소재 결품 위험', st3, `${mw.length}<small>건</small>`,
      mx.length ? `${esc(mx[0].name)} 월말 ${mx[0].days}일분${mx.length > 1 ? ` 외 ${mx.length - 1}` : ''}` : '모든 소재 월말 7일분 이상', '월말 재고 5일분 미만 = 결품 위험(경고) · 7일분 미만 = 주의');
    // 창고 재고: 판생속보 소재·제품 실재고와 '27 판생 월말 최대(상한)
    const SR = (A.P.sr || {}).stock || [], pick = (re) => SR.filter((x) => re.test(x.name) && x.target != null && ['G', 'C'].some((p) => inP(p) && x.name.startsWith(PN[p])));
    const ms = pick(/소재/), pd = pick(/제품/), mc = sum(ms, (x) => x.current) || 0, mC = sum(ms, (x) => x.target) || 0, pcur = sum(pd, (x) => x.current) || 0, pC = sum(pd, (x) => x.target) || 0;
    const tot = mc + pcur, cap = mC + pC, r = cap ? tot / cap : 0, st4 = r > 1 ? 'bad' : r > 0.9 ? 'warn' : 'ok';
    const line = (nm, v, c) => `<span>${nm}</span><b class="${v > c ? 'ov' : ''}">${n0(v)}t</b><em>상한 ${n0(c)}t</em>`;
    const k4 = `<a class="kj-kl" href="suju.html#stock"><div class="ct-kpi ${st4}" title="상한 = '27 판생 월말 최대(계획 규칙) · 도금 자가재 제외 — 누르면 자세히"><div class="l">창고 재고</div><div class="v">${n0(tot)}<small>t</small></div>`
      + `<div class="kj-wh">${line('소재', mc, mC)}${line('제품', pcur, pC)}</div></div></a>`;
    return `<div class="ct-kpis kj-k4">${k1}${k2}${k3}${k4}</div>`;
  }

  /* ---------- 막대그래프(SVG) — 판매계획 · 수주 · 생산(계획·실적) · 출하(계획·실적) · 재고(소재·제품) ---------- */
  function chart(c, cur, W, compact) {
    const x = c.x || {}, C = {
      sal: 'var(--kj-sal)', ord: 'var(--kj-ord)', pr: 'var(--kj-pr)', sh: 'var(--kj-sh)', ms: 'var(--kj-ms)', pd: 'var(--kj-pd)' };
    const pctOf = (a, b) => (a != null && b ? `${Math.round(a / b * 100)}%` : '');
    const cats = [];
    cats.push({ nm: '판매계획', short: '판매', bars: [{ v: x.sales, col: C.sal, k: 'sal', tip: '판매계획' }] });
    cats.push({ nm: '수주', bars: [{ v: c.self ? null : x.ord, col: C.ord, k: 'ord', na: c.self ? '내부' : null, sub: c.self ? '' : pctOf(x.ord, x.sales), tip: cur ? '확정 주문' : `납기 ${mLab(mSel)} 주문` }] });
    if (cur) {
      cats.push({ nm: '생산', pct: pctOf(x.pAct, x.pPlan), bars: [{ v: x.pPlan, col: C.pr, plan: true, sub: '계획', tick: x.pDue, tip: '생산 계획(월)' }, { v: x.pAct, col: C.pr, sub: '실적', tip: '생산 실적' }] });
      if (x.ship !== false || c.plant) cats.push({ nm: '출하', pct: pctOf(x.sAct, x.sPlan), bars: [{ v: x.sPlan, col: C.sh, plan: true, sub: '계획', tick: x.sDue, tip: '출하 계획(월)' }, { v: x.sAct, col: C.sh, sub: '실적', tip: '출하 실적' }] });
    } else cats.push({ nm: '생산', bars: [{ v: x.pPlan, col: C.pr, plan: true, sub: '계획', tip: '생산 계획(월)' }] });
    if (c.plant) cats.push({ nm: '재고', bars: [{ v: x.mat, col: C.ms, sub: '소재', cap: x.matCap, tip: '소재 재고' }, { v: x.stk, col: C.pd, sub: '제품', cap: x.cap, tip: '제품 재고' }] });
    else cats.push({ nm: '재고', bars: [{ v: x.stk, col: C.pd, sub: '제품', cap: x.tgt, tip: '제품 재고' }] });
    const nb = cats.reduce((a, k) => a + k.bars.length, 0), narrow = W < 520;
    const H = c.big ? (narrow ? 250 : 280) : (narrow ? 220 : 230), L = 2, R = 2, T = 24, B = 50, gap = narrow ? 8 : 16;
    const slot = (W - L - R - gap * (cats.length - 1)) / nb, bw = Math.min(c.big ? 58 : 46, slot * 0.8);
    const vals = cats.flatMap((k) => k.bars.flatMap((b) => [b.v, b.cap, b.tick])).filter((v) => v != null && !isNaN(v));
    const mx = Math.max(1, ...vals) * 1.04, y0 = H - B, Y = (v) => T + (y0 - T) * (1 - Math.max(0, v) / mx);
    // 숫자: 칸이 좁으면 천t 한 자리
    const tw = (t) => [...t].reduce((a, ch) => a + (ch === ',' || ch === '.' ? 4 : 8.3), 0);   // 14px 굵은 숫자 폭(대략)
    const fits = vals.every((v) => tw(n0(v)) <= slot + 4), wide = compact == null ? fits : !compact;
    const fmt = (v) => (wide ? n0(v) : Math.abs(v) < 50 ? '0' : (Math.round(v / 100) / 10).toFixed(1));
    let g = `<line class="gl" x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}"/>`, xs = L;
    for (const k of cats) {
      const x0 = xs;
      k.bars.forEach((b, i) => {
        const bx = xs + i * slot + (slot - bw) / 2, cx = bx + bw / 2;
        if (b.v == null || isNaN(b.v)) { g += `<text class="na" x="${cx}" y="${y0 - 8}" text-anchor="middle">${b.na || (slot < 70 ? '없음' : '자료 없음')}</text>`; }
        else {
          const yt = Y(b.v), h = Math.max(b.v > 0 ? 1.5 : 0, y0 - yt), r = Math.min(4, h / 2);
          g += b.plan ? `<rect x="${bx + 0.75}" y="${y0 - h + 0.75}" width="${bw - 1.5}" height="${Math.max(0, h - 0.75)}" rx="${r}" fill="color-mix(in srgb, ${b.col} 20%, var(--surface))" stroke="${b.col}" stroke-width="1.5"><title>${b.tip} ${n0(b.v)}t</title></rect>`
            : `<rect x="${bx}" y="${y0 - h}" width="${bw}" height="${h}" rx="${r}" fill="${b.col}"><title>${b.tip} ${n0(b.v)}t</title></rect>`;
          if (b.tick != null && b.tick > 0) g += `<line class="tk" x1="${bx - 3}" x2="${bx + bw + 3}" y1="${Y(b.tick)}" y2="${Y(b.tick)}"><title>오늘까지 계획 ${n0(b.tick)}t</title></line>`;
          let ly = yt - 6;
          if (b.cap != null) { const yc = Y(b.cap); g += `<line class="cap" x1="${bx - 5}" x2="${bx + bw + 5}" y1="${yc}" y2="${yc}"><title>${c.plant ? '상한' : '목표'} ${n0(b.cap)}t</title></line>`; if (Math.abs(yc - ly + 5) < 14) ly = Math.min(yt, yc) - 7; }
          if (b.tick != null && Math.abs(Y(b.tick) - ly + 5) < 14) ly = Math.min(yt, Y(b.tick)) - 7;
          g += `<text class="v" x="${cx}" y="${Math.max(13, ly)}" text-anchor="middle">${fmt(b.v)}</text>`;
        }
        if (b.sub) g += `<text x="${cx}" y="${y0 + 18}" text-anchor="middle">${b.sub}</text>`;
      });
      xs += k.bars.length * slot;
      const nm = slot * k.bars.length < 70 && k.short ? k.short : k.nm;
      g += `<text class="c" x="${(x0 + xs) / 2}" y="${y0 + 40}" text-anchor="middle">${nm}${k.pct ? ` ${k.pct}` : ''}</text>`;
      xs += gap;
    }
    return { svg: `<svg class="kj-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cats.map((k) => k.nm).join(' · '))}">${g}</svg>`, unit: wide ? '단위 t' : '단위 천t', wide: fits };
  }

  /* ---------- 소재: 그 달 생산 계획에 맞춰 들어와야 할 양 = 입고 완료 + 발주(입고 예정) + 아직 발주 안 함 · 결품 위험 ---------- */
  function matSec() {
    const M = A.mat, m = mSel, pls = ['G', 'C'].filter(inPl), NM = { G: '도금 소재(F/H)', C: '컬러 구매 소재' };
    let body = '';
    if (!M) body = UI.empty('소재 발주 자료 없음', '다음 자동 실행 때 들어옵니다');
    else {
      const rows = pls.map((p) => { const x = M.cell[`${p}|${m}`] || { rec: 0, ord: 0, nw: 0 }, need = x.rec + x.ord + x.nw, got = x.rec + x.ord, w = (t) => (need ? (t / need * 100).toFixed(1) : 0);
        return `<tr><td class="l v2-l"><b>${NM[p]}</b></td><td data-l="들어와야 할 양"><b>${n0(need)}</b></td><td data-l="입고 완료">${n0(x.rec)}</td><td data-l="발주(입고 예정)">${n0(x.ord)}</td><td data-l="아직 발주 안 함" class="${x.nw >= 1 ? 'nw' : ''}">${n0(x.nw)}</td>`
          + `<td class="bc" data-l="확보"><div class="kj-sbp" title="확보(입고+발주) ${n0(got)} / 들어와야 할 양 ${n0(need)}t"><div class="kj-sb"><i class="r" style="width:${w(x.rec)}%"></i><i class="o" style="width:${w(x.ord)}%"></i></div><b>${need ? Math.round(got / need * 100) : 0}%</b></div></td></tr>`; });
      body = `<div class="kj-mw"><table class="kj-mt"><thead><tr><th class="l v2-l">소재</th><th>들어와야 할 양</th><th>입고 완료</th><th>발주(입고 예정)</th><th>아직 발주 안 함</th><th>확보</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
        + `<div class="kj-lg"><span><i class="r"></i>입고 완료</span><span><i class="o"></i>발주(입고 예정)</span><span><i class="e"></i>아직 발주 안 함</span></div>`;
    }
    // 결품 위험 소재: 이번 달 = 월말 재고일수(수주 관제와 같은 판정) · 모든 달 = 발주 마감 지난 부족(첫 부족일이 그 달)
    const S = A.S, rk = [];
    if (m === A.M0) for (const x of S.mats.filter((y) => inPl(y.plant) && (y.st === '경고' || y.st === '주의'))) rk.push(`<span class="${x.st === '경고' ? 'bad' : 'warn'}"><b>${esc(x.name)}</b> <em>월말 ${x.days}일분 · ${n0(x.end)}t</em></span>`);
    for (const it of ((S.matLate || {}).items || [])) { if (!inPl(it.plant)) continue;
      const f = it.first || (it.sizes || []).map((s) => s[3]).filter(Boolean).sort()[0]; if (!f || f.slice(0, 7) !== m) continue;
      rk.push(`<span class="bad"><b>${esc(it.name)} ${n0(it.t)}t</b> <em>${md(f)}부터 부족 · 발주 마감 ${md(it.deadline)} 지남</em></span>`); }
    const risk = `<div class="kj-risk"><b>결품 위험</b>${rk.join('') || '<span><em>없음</em></span>'}</div>`;
    return `<div class="kj-sec">소재 <small>${mLab(m)} 생산 계획에 맞춰 들어와야 할 양 · 톤</small></div><section class="card" data-noexport>${body}${risk}</section>`;
  }
})();
