/* 관제(11/12 회의·화이트보드 '# 관제', 4차 — 처음부터 다시 그림)

   이 화면에서 볼 것 · 보는 순서(위 → 아래)
   0. 달 탭 11월 실적 · 12월 계획 · 1월 계획 — 화면 전체(카드·그래프·표·캘린더)가 같이 바뀜
   1. 운영 일정 한 줄 — 이달 운영이 어디쯤인가
   2. 결론 카드 4개(가장 큰 숫자) — 수주 진도 · 생산 달성 · 소재 결품 위험 · 창고 재고(소재·제품 / 상한)
   3. 도금 전체 | 컬러 전체 — 판매계획 · 수주 · 생산 · 출하 · 재고(소재·제품). 옅은 = 계획, 진한 = 실적(확정), 가로선 = 오늘까지 계획·재고 상한
   4. 그룹별 같은 그래프 — 어느 그룹이 수주·생산·출하가 모자라고 재고가 많은가
   5. 관제 매트릭스 — 3·4 의 숫자를 표로(계획 대비 실적, 공장 전체·합계 줄) = 그래프의 '표로 보기'
   6. 소재 — 그 달 생산에 맞춰 들어와야 할 양 대비 입고 완료 · 발주 · 아직 발주 안 함, 결품 위험
   7. 일별 계획 캘린더 — 라인·그룹 × 날짜(칸 위 계획 · 아래 실적)
   8. 조치할 사항

   숫자는 기존 화면 계산을 그대로 씀: 이번 달 = 수주 관제(suju) · 다음 달 = 통합 계획(integrated)·월간 가동(portal.monthPlan)
   · 주문(납기) = 주문진도(cg/cc_order_progress, 도금 수출 = 출항·입항일 우선) · 소재 = 소재 관제 '월별 소재 입고 계획'(ui/proccalc.js) */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const FILES = ['suju.enc.json', 'portal.enc.json', 'integrated.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'procure.enc.json'];
  // 그룹 = 판매그룹 합 단위(회의: 컬러건재 주문재·계획재 나누지 않음)
  const GRP = [
    { k: 'G수출', pl: 'G', nm: '도금수출', sj: ['도금수출'], od: ['도금수출그룹'], cal: ['도금수출'] },
    { k: 'G국내', pl: 'G', nm: '도금국내', sj: ['도금국내'], od: ['도금판매그룹'], cal: ['도금국내'] },
    { k: 'G자동차', pl: 'G', nm: '자동차', sj: ['자동차'], od: ['자동차강판판매그룹'], cal: ['자동차', '자동차내수', '자동차수출'] },
    { k: 'G자가재', pl: 'G', nm: '도금 자가재', sj: ['자가재'], od: null, cal: ['자가재'] },
    { k: 'C수출', pl: 'C', nm: '컬러수출', sj: ['건재수출', '가전수출', '가전내수'], od: ['컬러수출그룹'], cal: ['건재수출', '가전수출', '가전내수'] },
    { k: 'C건재', pl: 'C', nm: '컬러건재', sj: ['주문재', '계획재'], od: ['컬러건재판매그룹'], cal: ['주문재', '계획재'] },
    { k: 'C수요', pl: 'C', nm: '수요개발', sj: ['수요개발'], od: ['수요개발그룹'], cal: ['수요개발'] },
  ];
  const PN = { G: '도금', C: '컬러' }, LINES = { G: ['1CGL', '2CGL'], C: ['1CCL', '2CCL', '3CCL', '4CCL'] };
  let X = null, A = null, mSel = null, bound = false, TIPS = [];
  const LS = 'kj-month';

  CT.boot(FILES, (D) => { if (D !== X) { X = D; A = prep(D); } draw(); });

  const inPl = (p) => CT.inScope(p);
  const sum = (L, f) => { let s = 0, any = false; for (const x of L) { const v = f(x); if (v != null && !isNaN(v)) { s += +v; any = true; } } return any ? s : null; };
  const addM = (ym, k) => { const d = new Date(ym + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
  const mLab = (m) => `${+m.slice(5)}월`;
  const pctOf = (a, b) => (a != null && b ? a / b * 100 : null);
  const P0 = (v) => (v == null ? '–' : `${Math.round(v)}%`);
  // 진도 글자 색: 계획(오늘까지) 대비 못 미치면 빨강·주황, 크게 넘으면 주황 — 상태색은 글자에만
  const tone = (p) => (p == null ? '' : p < 90 ? 'bad' : p < 97 || p > 110 ? 'warn' : '');
  const capTone = (v, c) => (v == null || !c ? '' : v / c > 1.1 ? 'bad' : v / c > 1 ? 'warn' : '');

  /* ---------- 자료 준비(한 번) ---------- */
  function prep(D) {
    const S = D.suju, P = D.portal || {}, I = D.integrated || {};
    if (!S) throw new Error('수주 관제 자료(suju)가 없습니다');
    const M0 = S.month, months = [M0, addM(M0, 1), addM(M0, 2)];
    const SG = Object.fromEntries(S.groups.map((g) => [g.key, g]));
    const BR = Object.fromEntries((S.bridge || []).map((b) => [b.eng, b]));
    const V = ((I.variants || {})[I.rec || I.confirmed || 'V1'] || {});
    const pmIdx = (m) => (P.months || []).indexOf(m);
    // 주문(그 달에 내야 할 주문) — 도금 수출 배선 주문은 출항·입항일, 없으면 납기(회의 25~32·183~185)
    const ordDue = {};
    for (const [pl, R] of [['G', (D.cg_order_progress || {}).rows], ['C', (D.cc_order_progress || {}).rows]]) for (const r of R || []) {
      const d = pl === 'G' ? r.dept || r.arr || r.due : r.due, m = String(d || '').slice(0, 7), g = GRP.find((x) => x.pl === pl && x.od && x.od.includes(r.grp)); if (!g || !m) continue;
      ordDue[`${g.k}|${m}`] = (ordDue[`${g.k}|${m}`] || 0) + (+r.ordT || 0); }
    const hasOrd = { G: !!(D.cg_order_progress && D.cg_order_progress.rows), C: !!(D.cc_order_progress && D.cc_order_progress.rows) };
    // 묶음 값(컬러수출 3그룹·컬러건재 2그룹은 생산·출하가 첫 그룹에 합으로 한 번만 들어 있음)
    const one = (gs, k, gk) => (gs[0] && gs[0][gk] ? gs[0][k] : sum(gs, (g) => g[k]));
    const grp = {};
    for (const G of GRP) {
      const gs = G.sj.map((k) => SG[k]).filter(Boolean), b = BR[G.k] || {}, out = {};
      out[M0] = { sales: sum(gs, (g) => g.sales), ord: G.od ? sum(gs, (g) => g.orders) : null, base: G.od ? sum(gs, (g) => g.base) : null,
        pPlan: one(gs, 'planMon', 'achGrp'), pAct: one(gs, 'actMon', 'achGrp'), pDue: one(gs, 'planMonCum', 'achGrp'),
        sPlan: one(gs, 'shipMon', 'shipGrp'), sAct: one(gs, 'shipAct', 'shipGrp'), sDue: one(gs, 'shipDue', 'shipGrp'),
        mat: null, stk: b.begin, cap: b.target };
      for (const m of months.slice(1)) { const i = pmIdx(m), pl = (V.plan || {})[G.k], x = i >= 0 && pl ? pl[i] : null, mp = ((P.monthPlan || {})[m] || {})[G.k] || {};
        out[m] = { sales: x ? x.sales : null, ord: G.od && hasOrd[G.pl] ? Math.round(ordDue[`${G.k}|${m}`] || 0) : null, pPlan: mp.prod != null ? mp.prod : null,
          sPlan: G.od && x ? x.sales : null, mat: null, stk: x ? x.end : null, cap: x ? x.target : null }; }
      grp[G.k] = out;
    }
    // 공장 전체(회사 양): 생산 = 라인 · 출하·재고 = 판생속보 · 판매·수주 = 판매그룹 합(자가재는 내부 투입이라 뺌)
    const SR = P.sr || {}, shipNm = { G: ['도금판매', '도금수출', '자동차강판'], C: ['컬러수출', '컬러건재'] };
    const stkOf = (re) => (SR.stock || []).find((x) => re.test(x.name)) || {};
    const matEnd = (key, m) => { const R = (((V.mat || {})[key] || {}).rows || []), md_ = m.slice(5) + '-'; const L = R.filter((r) => String(r[0]).startsWith(md_)); return L.length ? L[L.length - 1][4] : null; };
    const plant = {};
    for (const pl of ['G', 'C']) {
      const Gs = GRP.filter((g) => g.pl === pl && g.k !== 'G자가재'), LN = (S.lines || []).filter((l) => l.pl === pl), out = {};
      const ms = stkOf(pl === 'G' ? /^도금 소재/ : /^컬러 소재/), pd = stkOf(pl === 'G' ? /^도금 제품\(판매재\)/ : /^컬러 제품/);
      const sh = (SR.ship || []).filter((x) => shipNm[pl].includes(x.name)), pg = (P.groups || []).filter((g) => g.pl === pl && g.ship);
      out[M0] = { sales: sum(Gs, (g) => grp[g.k][M0].sales), ord: sum(Gs.filter((g) => g.od), (g) => grp[g.k][M0].ord), base: sum(Gs.filter((g) => g.od), (g) => grp[g.k][M0].base),
        pPlan: sum(LN, (l) => l.month), pAct: sum(LN, (l) => l.actual), pDue: sum(LN, (l) => l.sched),
        sPlan: sum(sh, (x) => x.month), sAct: sum(sh, (x) => x.actual), sDue: sum(pg, (g) => g.ship.due),
        mat: ms.current, matCap: ms.target, stk: pd.current, cap: pd.target };
      for (const m of months.slice(1)) {
        const lm = V.lineMonth || {}, mo = +m.slice(5), cl = (I.colorLines || {})[m];
        const prod = pl === 'G' ? sum(LINES.G, (l) => lm[`${l}|${mo}`]) : cl ? sum(Object.values(cl), (x) => (x.plan != null ? x.plan : x.placed)) : null;
        out[m] = { sales: sum(Gs, (g) => grp[g.k][m].sales), ord: sum(Gs.filter((g) => g.od), (g) => grp[g.k][m].ord), pPlan: prod, sPlan: sum(Gs, (g) => grp[g.k][m].sPlan),
          mat: matEnd(pl === 'G' ? 'FH' : 'CMAT', m), matCap: ms.target, stk: sum(Gs, (g) => grp[g.k][m].stk), cap: pd.target }; }
      plant[pl] = out;
    }
    return { S, P, I, V, D, M0, months, grp, plant, mat: matMonths(D, months) };
  }

  /* 소재 관제 '월별 소재 입고 계획'과 같은 계산(supply.js monthSum): 들어와야 할 양 = 입고 완료 + 발주(입고 예정) + 아직 발주 안 함(임가공 도금 N 제외) */
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
    return { cell };
  }

  /* ---------- 그리기 ---------- */
  function draw() {
    const m = document.getElementById('ct-main');
    if (!A) return;
    const { months } = A;
    if (!mSel || !months.includes(mSel)) { let s = null; try { s = localStorage.getItem(LS); } catch (e) { /* 무시 */ } mSel = months.includes(s) ? s : months[0]; }
    const cur = mSel === A.M0, pls = ['G', 'C'].filter(inPl);
    TIPS = [];
    const tabs = `<div class="kj-tabs" role="tablist" aria-label="달">${months.map((x, i) => `<button type="button" role="tab" data-m="${x}" aria-selected="${x === mSel}">${mLab(x)} <span>${i ? '계획' : '실적'}</span></button>`).join('')}</div>`;
    const basis = cur ? `실적 ~${md(A.S.asOf)} · 재고 ${md(A.S.asOf)} 실재고 · 자료 ${esc(String((A.P.sr || {}).asOf || '').slice(5).replace('-', '/'))}`
      : `${mLab(mSel)} 계획 대비 주문 · 수주 = ${mLab(mSel)} 납기 주문(수출 = 출항·입항일) · 재고 = 월말 계획`;
    const CH = [];
    let h = `<div class="kj-top">${tabs}<p class="kj-basis">${basis}</p></div>` + sched() + cards(cur)
      + `<div class="kj-lg" aria-label="범례"><span><i class="ac"></i>${cur ? '실적 · 확정 주문' : '납기 주문'}</span><span><i class="pl"></i>계획(판매 · 생산 · 출하)</span><span><i class="stk"></i>${cur ? '재고' : '재고 월말 계획'}</span><span><i class="sbg"></i>상한(재고)</span><span><i class="ov"></i>상한 초과</span>${cur ? '<span><i class="tk"></i>오늘 기준</span>' : ''}</div>`;
    h += `<h2 class="kj-h">${pls.map((p) => PN[p]).join(' · ')} 전체 <small>${mLab(mSel)} · 톤</small></h2><div class="kj-two">`
      + pls.map((p) => { const id = CH.push({ x: A.plant[p][mSel], big: true, name: `${PN[p]} 전체` }) - 1;
        return `<section class="kj-c big"><h3>${PN[p]} 전체</h3><div class="kj-ch" data-ch="${id}"></div></section>`; }).join('') + '</div>';
    h += `<h2 class="kj-h">그룹별 <small>${mLab(mSel)} · 톤</small></h2><div class="kj-gg">` + pls.flatMap((p) => GRP.filter((g) => g.pl === p)).map((G) => { const id = CH.push({ x: A.grp[G.k][mSel], big: false, name: G.nm, self: G.k === 'G자가재', grp: true }) - 1;
        return `<section class="kj-c"><h3>${esc(G.nm)}</h3><div class="kj-ch" data-ch="${id}"></div></section>`; }).join('') + '</div>';
    h += matrix(cur, pls) + matSec(pls) + calendar(cur, pls) + actions();
    m.innerHTML = h;
    m.querySelectorAll('.kj-tabs button').forEach((b) => (b.onclick = () => { mSel = b.dataset.m; try { localStorage.setItem(LS, mSel); } catch (e) { /* 무시 */ } draw(); }));
    // 그룹 그래프 한 줄 수: 숫자(15px)가 기둥 칸에 들어가는 가장 많은 수(4 → 3 → 2 → 1) — 글자를 줄이지 않고 줄 수를 줄임
    const gg = m.querySelector('.kj-gg'), gW = gg.clientWidth, gap = parseFloat(getComputedStyle(gg).columnGap) || 16, pad = 34;
    const gc = CH.filter((c) => !c.big), nCol = [4, 3, 2].find((n) => gc.every((c) => chart(c, cur, (gW - gap * (n - 1)) / n - pad, false, true))) || 1;
    gg.style.gridTemplateColumns = `repeat(${nCol}, minmax(0, 1fr))`;
    // 그래도 '실적 / 계획t'가 칸보다 넓으면(휴대폰) 그 묶음은 숫자 하나만(계획은 툴팁·표)
    const els = [...m.querySelectorAll('[data-ch]')];
    for (const big of [true, false]) {
      const E = els.filter((el) => CH[+el.dataset.ch].big === big), W = (el) => el.clientWidth || 400;
      const compact = E.some((el) => !chart(CH[+el.dataset.ch], cur, W(el), false, true));
      E.forEach((el) => { const c = CH[+el.dataset.ch]; el.innerHTML = chart(c, cur, W(el), compact);  });
    }
    bindTips(m);
    m.querySelectorAll('.kj-ms .bar i span').forEach((sp) => { if (sp.offsetWidth > sp.parentNode.clientWidth - 4) sp.style.visibility = 'hidden'; });
    const cw = m.querySelector('.kj-calw'), cn = cw && cw.querySelector('th.now');   // 캘린더: 오늘 칸이 보이게
    if (cn && cw.scrollWidth > cw.clientWidth) cw.scrollLeft = Math.max(0, cn.offsetLeft - cw.clientWidth / 2);
    m.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => { const s = b.closest('section'); s.classList.toggle('all'); b.textContent = s.classList.contains('all') ? '접기' : b.dataset.more; }));
    if (!bound) { bound = true; let rt = null, w0 = innerWidth; addEventListener('resize', () => { if (innerWidth === w0) return; w0 = innerWidth; clearTimeout(rt); rt = setTimeout(draw, 250); }); }
  }

  /* 1. 운영 일정(수주 관제 종합 관제판과 같은 일정) — 지난 단계 흐리게, 진행 중 굵게 */
  function sched() {
    const S = A.S, nd = new Date(Date.UTC(+mSel.slice(0, 4), +mSel.slice(5), 0)).getUTCDate(), mo = +mSel.slice(5), cur = mSel === A.M0, day = cur ? +S.today.slice(8) : 0;
    const it = ((S.cfg || {}).schedule || []).slice().sort((a, b) => a.from - b.from || a.to - b.to).map((s) => { const z = Math.min(s.to, nd), st = !cur ? ['', 'next'] : day > z ? ['완료', 'done'] : day >= s.from ? ['진행 중', 'now'] : [`D-${s.from - day}`, 'next'];
      return `<li class="${st[1]}"><b>${mo}/${s.from}${s.to !== s.from ? '~' + z : ''}${st[0] ? ` <span>${st[0]}</span>` : ''}</b><div>${esc(s.label)}</div></li>`; }).join('');
    return it ? `<section class="kj-c kj-sch"><h3>${mo}월 운영 일정${cur ? `<span class="u">오늘 ${md(S.today)}</span>` : ''}</h3><ol>${it}</ol></section>` : '';
  }

  /* 2. 결론 카드 4개 — 이번 달 = 수주 관제 종합 관제판과 같은 계산 · 다음 달 = 그 달 계획 대비 주문·월말 재고 계획 */
  function cards(cur) {
    const S = A.S, pls = ['G', 'C'].filter(inPl), PL = pls.map((p) => A.plant[p][mSel]);
    const kc = (h, t, cls, v, s, tip) => `<a class="kj-kl" href="${h}" title="${esc(tip)} — 누르면 자세히"><div class="ct-kpi kj-k"><div class="l">${t}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div></a>`;
    const pc = (v) => (v == null ? '–' : `${(+v).toFixed(1)}<small>%</small>`);
    let k1, k2, k3;
    if (cur) {
      const G = S.groups.filter((g) => inPl(g.plant)), dem = G.filter((g) => g.base != null), sb = sum(dem, (g) => g.base) || 0, so = sum(dem, (g) => g.orders) || 0, prog = pctOf(so, sb);
      const LN = S.lines.filter((l) => inPl(l.pl)), lsch = sum(LN, (l) => l.sched) || 0, lact = sum(LN, (l) => l.actual) || 0, ach = pctOf(lact, lsch);
      const mats = S.mats.filter((x) => inPl(x.plant)), mw = mats.filter((x) => x.st === '경고'), mx = mw.concat(mats.filter((x) => x.st === '주의'));
      k1 = kc('suju.html#order', '수주 진도', tone(prog), pc(prog), `확정 ${n0(so)} / 기준선 ${n0(sb)}t`, `확정 주문 ÷ 기준선(이달 1일~${md(S.cut)} 편성량)`);
      k2 = kc('suju.html#prod', '생산 달성', tone(ach), pc(ach), `실적 ${n0(lact)} / 오늘까지 계획 ${n0(lsch)}t`, `판매생산속보 일정 누계 대비 · 실적 ~${md(S.asOf)}`);
      k3 = kc('suju.html#mat', '소재 결품 위험', mw.length ? 'bad' : '', `${mw.length}<small>건</small>`,
        mx.length ? `${esc(mx[0].name)} 월말 ${mx[0].days}일분${mx.length > 1 ? ` 외 ${mx.length - 1}` : ''}` : '모든 소재 월말 7일분 이상', '월말 재고 5일분 미만 = 결품 위험 · 7일분 미만 = 주의');
    } else {
      const so = sum(PL, (x) => x.ord), ss = sum(PL, (x) => x.sales), prod = sum(PL, (x) => x.pPlan), late = lateIn(mSel);
      k1 = kc('cg_order.html', '수주 진도', '', pc(pctOf(so, ss)), ss ? `주문 ${n0(so)} / 판매계획 ${n0(ss)}t` : '판매계획 자료 없음', `${mLab(mSel)} 납기 주문 ÷ ${mLab(mSel)} 판매계획`);
      k2 = kc('integrated.html', '생산 계획', '', prod == null ? '–' : `${n0(prod)}<small>t</small>`, pls.map((p, i) => `${PN[p]} ${n0(PL[i].pPlan)}`).join(' · '), `${mLab(mSel)} 라인 생산 계획(통합 계획)`);
      k3 = kc('suju.html#mat', '소재 결품 위험', late.length ? 'bad' : '', `${late.length}<small>건</small>`, late.length ? `${esc(late[0].name)} ${md(late[0].f)}부터 부족` : `${mLab(mSel)} 부족 예상 소재 없음`, '발주 마감이 지났는데 아직 발주 안 한 부족 소재(첫 부족일이 그 달)');
    }
    // 창고 재고: 소재 · 제품을 카드에 바로 + 상한('27 판생 월말 최대)
    const mc = sum(PL, (x) => x.mat), mC = sum(PL, (x) => x.matCap), pcur = sum(PL, (x) => x.stk), pC = sum(PL, (x) => x.cap), tot = mc != null && pcur != null ? mc + pcur : null;
    const line = (nm, v, c) => `<div>${nm} <b>${v == null ? '자료 없음' : n0(v)}</b> / 상한 ${n0(c)} ${v != null && c ? `<b class="${capTone(v, c)}">(${Math.round(v / c * 100)}%)</b>` : ''}</div>`;
    const k4 = `<a class="kj-kl" href="suju.html#stock" title="상한 = '27 판생 월말 최대(계획 규칙) · 도금 자가재 제외 — 누르면 자세히"><div class="ct-kpi kj-k"><div class="l">창고 재고${cur ? '' : ' (월말 계획)'}</div><div class="v ${capTone(tot, (mC || 0) + (pC || 0))}">${tot == null ? '–' : `${n0(tot)}<small>t</small>`}</div>`
      + `<div class="kj-wh">${line('소재', mc, mC)}${line('제품', pcur, pC)}</div></div></a>`;
    return `<div class="kj-k4">${k1}${k2}${k3}${k4}</div>`;
  }
  // 그 달에 처음 모자라는 소재(발주 마감 지남) — 소재 관제 matLate 와 같은 목록
  function lateIn(m) {
    const out = [];
    for (const it of ((A.S.matLate || {}).items || [])) { if (!inPl(it.plant)) continue;
      const f = it.first || (it.sizes || []).map((s) => s[3]).filter(Boolean).sort()[0]; if (f && f.slice(0, 7) === m) out.push({ ...it, f }); }
    return out;
  }

  /* ---------- 3·4. 총알(bullet) 세로 기둥(SVG): 수주 · 생산 · 출하 · 재고(소재 · 제품)
     바탕(옅은) = 계획(수주 = 판매계획, 생산·출하 = 월 계획, 재고 = 상한) · 안쪽 채움(진한) = 실적·확정·재고 · 짧은 실선 = 오늘 기준
     기둥 위 = 진도 %(16px) + '실적 / 계획t'(14px) · 기둥 아래 = 이름(15px) · 재고가 상한을 넘으면 넘친 부분만 주황 · 축 없음(모든 값을 글자로) ---------- */
  let MC = null;
  const tw = (t, sz = 15, wt = 700) => { if (!MC) MC = document.createElement('canvas').getContext('2d'); MC.font = `${wt} ${sz}px ${getComputedStyle(document.body).fontFamily}`; return MC.measureText(t).width; };
  // 진도 색: 오늘 기준보다 5%p 넘게 모자라면 빨강, 조금 모자라면 주황(계획 대비 못 미침에만)
  const paceTone = (act, due, plan) => { if (act == null || due == null || !plan) return ''; const d = (due - act) / plan * 100; return d > 5 ? 'bad' : d > 0 ? 'warn' : ''; };
  function cols(c, cur) {
    const x = c.x || {}, T = [], M = mLab(mSel);
    const r = (k, v, cls) => [k, v == null ? '자료 없음' : typeof v === 'string' ? v : `${n0(v)}t`, cls || ''];
    const flow = (nm, bg, fill, tick, tips, plan) => ({ nm, bg, fill, tick, plan, pct: plan ? null : pctOf(fill, bg), pcls: cur ? paceTone(fill, tick, bg) : '', tip: tips });
    if (c.self) T.push({ nm: '수주', na: '주문 없음', tip: [['수주', '내부 투입(주문 없음)', '']] });
    else if (cur) T.push(flow('수주', x.sales, x.ord, x.base, [r('판매계획', x.sales), r('확정 주문', x.ord), r('오늘 기준(기준선)', x.base), ['진도(판매계획 대비)', P0(pctOf(x.ord, x.sales)), paceTone(x.ord, x.base, x.sales)], ['기준선 대비', P0(pctOf(x.ord, x.base)), '']]));
    else T.push(flow('수주', x.sales, x.ord, null, [r('판매계획', x.sales), r(`${M} 납기 주문`, x.ord), ['판매계획 대비', P0(pctOf(x.ord, x.sales)), '']]));
    if (cur) {
      T.push(flow('생산', x.pPlan, x.pAct, x.pDue, [r('월 생산계획', x.pPlan), r('생산 실적', x.pAct), r('오늘 기준', x.pDue), ['진도(월 계획 대비)', P0(pctOf(x.pAct, x.pPlan)), paceTone(x.pAct, x.pDue, x.pPlan)], ['오늘 기준 대비', P0(pctOf(x.pAct, x.pDue)), '']]));
      if (x.sPlan == null) T.push({ nm: '출하', na: c.self ? '출하 없음' : '자료 없음', tip: [['출하', c.self ? '출하 없음(내부 투입)' : '자료 없음', '']] });
      else T.push(flow('출하', x.sPlan, x.sAct, x.sDue, [r('월 출하계획', x.sPlan), r('출하 실적', x.sAct), r('오늘 기준', x.sDue), ['진도(월 계획 대비)', P0(pctOf(x.sAct, x.sPlan)), paceTone(x.sAct, x.sDue, x.sPlan)], ['오늘 기준 대비', P0(pctOf(x.sAct, x.sDue)), '']]));
    } else {
      T.push(x.pPlan == null ? { nm: '생산', na: '자료 없음', tip: [['생산', '자료 없음', '']] } : flow('생산', x.pPlan, null, null, [r(`${M} 생산계획`, x.pPlan)], true));
      T.push(x.sPlan == null ? { nm: '출하', na: c.self ? '출하 없음' : '자료 없음', tip: [['출하', c.self ? '출하 없음(내부 투입)' : '자료 없음', '']] } : flow('출하', x.sPlan, null, null, [r(`${M} 출하계획(= 판매계획)`, x.sPlan)], true));
    }
    const cn = c.grp ? '재고 목표' : '상한', st = (nm, v, cp) => (v == null && cp == null ? { nm, na: '자료 없음', tip: [[nm, '자료 없음', '']] }
      : { nm, stock: true, bg: cp, fill: v, pct: pctOf(v, cp), pcls: capTone(v, cp), tip: [r(cur ? `${nm} (${md(A.S.asOf)})` : `${nm} (월말 계획)`, v), r(cn, cp), [`${cn} 대비`, P0(pctOf(v, cp)), capTone(v, cp)]] });
    if (!c.grp) T.push(st('소재 재고', x.mat, x.matCap));   // 그룹별 소재 재고는 자료가 없어 기둥을 뺌(매트릭스에 '자료 없음')
    T.push(st('제품 재고', x.stk, x.cap));
    return T;
  }
  function chart(c, cur, W, compact, probe) {
    const C = cols(c, cur), n = C.length, slot = W / n, BW = Math.min(44, Math.round(slot * 0.42)), IN = 5;
    const vals = C.flatMap((k) => [k.bg, k.fill, k.tick]).filter((v) => v != null && !isNaN(v)), mx = Math.max(1, ...vals);
    const H = c.big ? 250 : 226, T = 48, y0 = H - 32, Y = (v) => T + (y0 - T) * (1 - Math.max(0, v) / mx);
    const BX = [], txt = (cls, x, y, t, sz) => { const w = tw(t, sz, 700); BX.push([x - w / 2, x + w / 2, y - sz + 2, y + 3]); return `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${t}</text>`; };
    const col = (cx, w, y1, y2, cls, round) => { const h = y2 - y1; if (h <= 0.3) return ''; const r = round ? Math.min(4, h / 2) : 0, x = cx - w / 2;   // 위끝 4px 둥글게 · 바닥 각지게
      return `<path class="${cls}" d="M${x} ${y2}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + w - r}Q${x + w} ${y1} ${x + w} ${y1 + r}V${y2}Z"/>`; };
    let g = '', hits = '';
    C.forEach((k, i) => {
      const cx = slot * i + slot / 2, id = probe ? 0 : TIPS.push({ t: `${c.name} · ${k.nm}`, rows: k.tip }) - 1;
      if (k.na) { g += txt('na', cx, y0 - 10, k.na, 14); }
      else {
        const pre = k.stock ? 's' : 'f';
        if (k.bg != null) g += col(cx, BW, Y(k.bg), y0, `${pre}bg`, true);
        if (k.fill != null && k.fill > 0) {
          if (k.stock && k.bg != null && k.fill > k.bg) g += col(cx, BW - IN * 2, Y(k.bg), y0, 'sfill', false) + col(cx, BW - IN * 2, Y(k.fill), Y(k.bg) - 2, 'over', true);   // 상한 넘친 부분만 주황(2px 틈)
          else g += col(cx, BW - IN * 2, Y(k.fill), y0, `${pre}fill`, true);
        }
        if (k.tick != null && k.tick > 0) g += `<line class="tk" x1="${cx - BW / 2 - 6}" x2="${cx + BW / 2 + 6}" y1="${Y(k.tick)}" y2="${Y(k.tick)}"/>`;
        const top = Math.min(...[k.bg, k.fill, k.tick].filter((v) => v != null).map(Y));
        const l2 = k.plan ? `${n0(k.bg)}t` : compact ? n0(k.fill != null ? k.fill : k.bg) : k.fill != null && k.bg != null ? `${n0(k.fill)} / ${n0(k.bg)}t` : `${n0(k.fill != null ? k.fill : k.bg)}t`;
        const l1 = k.plan ? '계획' : k.pct != null ? P0(k.pct) : '';
        g += txt('l2', cx, top - 8, l2, 14);
        if (l1) g += txt(`l1 ${k.pcls || ''}`, cx, top - 28, l1, 16);
      }
      g += txt('nm', cx, y0 + 22, k.nm, 15);
      hits += `<rect class="hit" data-tip="${id}" tabindex="0" role="img" aria-label="${esc(k.nm)}" x="${slot * i + 1}" y="0" width="${slot - 2}" height="${H}"/>`;
    });
    g += `<line class="base" x1="0" x2="${W}" y1="${y0}" y2="${y0}"/>`;
    if (probe) return BX.every((a, i) => a[0] >= 0 && a[1] <= W && a[2] >= 0 && BX.every((b, j) => j <= i || a[1] + 6 <= b[0] || b[1] + 6 <= a[0] || a[3] <= b[2] || b[3] <= a[2]));
    return `<svg class="kj-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(c.name)} — ${C.map((k) => k.nm).join(' · ')}">${hits}${g}</svg>`;
  }

  /* 툴팁: 기둥(항목) 칸 전체가 마우스·키보드 대상 · 값이 앞, 이름이 뒤 · 글은 textContent */
  function bindTips(root) {
    let tip = document.getElementById('kj-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'kj-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip); }
    const fill = (d) => { tip.textContent = ''; const h = document.createElement('div'); h.className = 't'; h.textContent = d.t; tip.appendChild(h);
      for (const [k, v, cls] of d.rows) { const r = document.createElement('div'); r.className = 'r'; const b = document.createElement('b'); b.textContent = v; if (cls) b.className = cls; const s = document.createElement('span'); s.textContent = k; r.append(b, s); tip.appendChild(r); } };
    const place = (x, y) => { tip.hidden = false; const w = tip.offsetWidth, hh = tip.offsetHeight; let l = x + 16, t = y + 14; if (l + w > innerWidth - 8) l = x - w - 16; if (t + hh > innerHeight - 8) t = y - hh - 14; tip.style.left = Math.max(8, l) + 'px'; tip.style.top = Math.max(8, t) + 'px'; };
    root.querySelectorAll('[data-tip]').forEach((el) => {
      const d = TIPS[+el.dataset.tip]; if (!d) return;
      el.onpointerenter = (e) => { fill(d); place(e.clientX, e.clientY); };
      el.onpointermove = (e) => place(e.clientX, e.clientY);
      el.onpointerleave = () => { tip.hidden = true; };
      el.onfocus = () => { fill(d); const r = el.getBoundingClientRect(); place(r.right - 8, r.top + 8); };
      el.onblur = () => { tip.hidden = true; };
    });
  }

  /* ---------- 5. 관제 매트릭스: 그래프 숫자를 표로(계획 대비 실적만 · 공장 전체·합계 줄) ---------- */
  function matrix(cur, pls) {
    const cl = (...c) => { const t = c.filter(Boolean).join(' '); return t ? ` class="${t}"` : ''; };
    const na = (n, txt, gs) => `<td colspan="${n}"${cl('na', gs && 'gs')}>${txt}</td>`;
    const nb = (v, gs, cls, tip) => `<td${cl(gs && 'gs', cls)}${tip ? ` title="${esc(tip)}"` : ''}>${v == null ? '<span class="na">자료 없음</span>' : n0(v)}</td>`;
    const pc = (v, cls) => `<td${cl('kp', cls)}>${v == null ? '–' : P0(v)}</td>`;
    const stock = (x, grp) => (grp ? na(2, '자료 없음', 1) : `${nb(x.mat, 1, capTone(x.mat, x.matCap))}${nb(x.matCap)}`) + `${nb(x.stk, grp, capTone(x.stk, x.cap))}${nb(x.cap)}`;
    const rowCur = (nm, x, cls, grp, self) => `<tr${cl(cls)}><th scope="row">${nm}</th>`
      + (self ? na(4, '내부 투입 — 주문 없음', 1) : `${nb(x.sales, 1)}${nb(x.base)}${nb(x.ord)}${pc(pctOf(x.ord, x.sales), paceTone(x.ord, x.base, x.sales))}`)
      + `${nb(x.pPlan, 1)}${nb(x.pAct, 0, '', `오늘까지 계획 ${n0(x.pDue)}t`)}${pc(pctOf(x.pAct, x.pPlan), paceTone(x.pAct, x.pDue, x.pPlan))}`
      + (x.sPlan == null ? na(3, self ? '출하 없음' : '자료 없음', 1) : `${nb(x.sPlan, 1)}${nb(x.sAct, 0, '', `오늘까지 계획 ${n0(x.sDue)}t`)}${pc(pctOf(x.sAct, x.sPlan), paceTone(x.sAct, x.sDue, x.sPlan))}`)
      + stock(x, grp) + '</tr>';
    const rowFut = (nm, x, cls, grp, self) => `<tr${cl(cls)}><th scope="row">${nm}</th>`
      + (self ? na(3, '내부 투입 — 주문 없음', 1) : `${nb(x.sales, 1)}${nb(x.ord)}${pc(pctOf(x.ord, x.sales))}`)
      + `${nb(x.pPlan, 1)}${x.sPlan == null ? na(1, self ? '출하 없음' : '자료 없음', 1) : nb(x.sPlan, 1)}` + stock(x, grp) + '</tr>';
    const rowOf = cur ? rowCur : rowFut, rows = [];
    for (const p of pls) {
      rows.push(rowOf(`${PN[p]} 전체`, A.plant[p][mSel], 'pt'));
      for (const G of GRP.filter((g) => g.pl === p)) rows.push(rowOf(G.nm, A.grp[G.k][mSel], '', true, G.k === 'G자가재'));
    }
    if (pls.length > 1) { const P = pls.map((p) => A.plant[p][mSel]), T = {};
      for (const k of ['sales', 'base', 'ord', 'pPlan', 'pAct', 'pDue', 'sPlan', 'sAct', 'sDue', 'mat', 'matCap', 'stk', 'cap']) T[k] = sum(P, (x) => x[k]);
      rows.push(rowOf('합계', T, 'tot')); }
    const hd = cur
      ? `<tr><th rowspan="2" scope="col">구분</th><th colspan="4" class="gs" scope="colgroup">수주</th><th colspan="3" class="gs" scope="colgroup">생산</th><th colspan="3" class="gs" scope="colgroup">출하</th><th colspan="4" class="gs" scope="colgroup">재고 <small>${md(A.S.asOf)}</small></th></tr>`
        + `<tr><th class="gs">판매계획</th><th title="오늘 기준: 오늘까지 확정돼야 할 양(이달 1일~${md(A.S.cut)} 편성)">기준선</th><th>확정</th><th title="확정 ÷ 판매계획 · 색 = 기준선보다 모자람">진도</th><th class="gs">월 계획</th><th>실적</th><th title="실적 ÷ 월 계획 · 색 = 오늘 기준보다 모자람">진도</th><th class="gs">월 계획</th><th>실적</th><th title="실적 ÷ 월 계획 · 색 = 오늘 기준보다 모자람">진도</th><th class="gs">소재</th><th>상한</th><th>제품</th><th title="공장 = 상한 · 그룹 = 재고 목표">상한·목표</th></tr>`
      : `<tr><th rowspan="2" scope="col">구분</th><th colspan="3" class="gs" scope="colgroup">수주 <small>${mLab(mSel)} 납기</small></th><th rowspan="2" class="gs">생산 계획</th><th rowspan="2" class="gs">출하 계획</th><th colspan="4" class="gs" scope="colgroup">재고 <small>월말 계획</small></th></tr>`
        + `<tr><th class="gs">판매계획</th><th>주문</th><th title="주문 ÷ 판매계획">진도</th><th class="gs">소재</th><th>상한</th><th>제품</th><th title="공장 = 상한 · 그룹 = 재고 목표">상한·목표</th></tr>`;
    return `<h2 class="kj-h">관제 매트릭스 <small>${mLab(mSel)} · 톤 · ${cur ? '진도 = 실적 ÷ 계획 · 빨강·주황 = 오늘 기준보다 모자람' : '계획 대비 주문'}</small></h2>`
      + `<section class="kj-c kj-tb"><div class="ct-wrap"><table class="kj-mx"><thead>${hd}</thead><tbody>${rows.join('')}</tbody></table></div></section>`;
  }

  /* ---------- 6. 소재: 그 달 생산에 맞춰 들어와야 할 양 = 입고 완료(진한) + 발주(옅은) + 아직 발주 안 함(빈 칸) · 결품 위험 ---------- */
  function matSec(pls) {
    const M = A.mat, m = mSel, NM = { G: '도금 소재 F/H', C: '컬러 구매 소재' };
    let body = '';
    if (!M) body = UI.empty('소재 발주 자료 없음', '다음 자동 실행 때 들어옵니다');
    else {
      const R = pls.map((p) => ({ p, ...(M.cell[`${p}|${m}`] || { rec: 0, ord: 0, nw: 0 }) })).map((x) => ({ ...x, need: x.rec + x.ord + x.nw }));
      const seg = (cls, t, need, nm, who) => { if (!(t >= 0.5) || !need) return ''; const w = t / need * 100, id = TIPS.push({ t: `${NM[who]} · ${nm}`, rows: [[nm, `${n0(t)}t`, ''], ['들어와야 할 양 대비', P0(w), '']] }) - 1;
        return `<i class="${cls}" style="flex:${t} 1 0" data-tip="${id}" tabindex="0" aria-label="${nm} ${n0(t)}t"><span>${nm} ${n0(t)}</span></i>`; };
      body = `<div class="kj-ms">${R.map((x) => { const got = x.rec + x.ord, p = x.need ? got / x.need * 100 : null;
        return `<div class="row"><div class="nm"><b>${NM[x.p]}</b><span>들어와야 할 양 ${n0(x.need)}t</span></div><div class="bar" role="img" aria-label="${NM[x.p]} 들어와야 할 양 ${n0(x.need)}t 중 입고 ${n0(x.rec)} · 발주 ${n0(x.ord)} · 아직 발주 안 함 ${n0(x.nw)}">${x.need ? seg('r', x.rec, x.need, '입고 완료', x.p) + seg('o', x.ord, x.need, '발주', x.p) + seg('e', x.nw, x.need, '발주 안 함', x.p) : '<em>들어올 소재 없음</em>'}</div>`
          + `<div class="pc"><b class="${tone(p)}">확보 ${P0(p)}</b><span class="${x.nw >= 1 ? 'warn' : ''}">아직 발주 안 함 ${n0(x.nw)}t</span></div></div>`; }).join('')}</div>`
        + `<div class="kj-lg in"><span><i class="ac"></i>입고 완료</span><span><i class="pl"></i>발주(입고 예정)</span><span><i class="e"></i>아직 발주 안 함</span></div>`
        + `<details class="kj-tv"><summary>표로 보기</summary><div class="ct-wrap"><table><thead><tr><th>소재</th><th>들어와야 할 양</th><th>입고 완료</th><th>발주</th><th>아직 발주 안 함</th><th>확보</th></tr></thead><tbody>`
        + R.map((x) => `<tr><th scope="row">${NM[x.p]}</th><td>${n0(x.need)}</td><td>${n0(x.rec)}</td><td>${n0(x.ord)}</td><td class="${x.nw >= 1 ? 'warn' : ''}">${n0(x.nw)}</td><td>${P0(x.need ? (x.rec + x.ord) / x.need * 100 : null)}</td></tr>`).join('') + '</tbody></table></div></details>';
    }
    // 결품 위험: 이번 달 = 월말 재고일수(수주 관제와 같은 판정) · 모든 달 = 발주 마감 지난 부족(첫 부족일이 그 달)
    const rk = [];
    if (m === A.M0) for (const x of A.S.mats.filter((y) => inPl(y.plant) && (y.st === '경고' || y.st === '주의'))) rk.push(`<span><b class="${x.st === '경고' ? 'bad' : 'warn'}">${esc(x.name)}</b> 월말 ${x.days}일분 · ${n0(x.end)}t</span>`);
    for (const it of lateIn(m)) rk.push(`<span><b class="bad">${esc(it.name)} ${n0(it.t)}t</b> ${md(it.f)}부터 부족 · 발주 마감 ${md(it.deadline)} 지남</span>`);
    return `<h2 class="kj-h">소재 <small>${mLab(m)} 생산에 맞춰 들어와야 할 양 · 톤</small></h2><section class="kj-c">${body}<p class="kj-risk"><b>결품 위험</b>${rk.join('') || '<span>없음</span>'}</p></section>`;
  }

  /* ---------- 7. 일별 계획 캘린더: 라인 · 그룹 × 날짜 — 칸 위 계획, 아래 실적(지난 날) ---------- */
  function calendar(cur, pls) {
    const S = A.S, m = mSel, nd = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate(), days = Array.from({ length: nd }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay(), td = S.today, asOf = S.asOf;
    const lineR = {}, grpR = {}, ev = {};
    if (cur) {
      for (const l of [...LINES.G, ...LINES.C]) { const M = Object.fromEntries((S.daily[l] || []).map(([d, p0, p, a]) => [d, { p: d <= asOf ? p0 : p, a: d <= asOf ? a : null }])); lineR[l] = days.map((d) => M[d] || { p: null, a: null }); }
      for (const G of GRP) { const Ms = G.cal.map((k) => Object.fromEntries(((S.gdaily || {})[k] || []).map(([d, p, a]) => [d, { p, a: d <= asOf ? a || 0 : null }])));
        grpR[G.k] = days.map((d) => { const xs = Ms.map((M) => M[d]).filter(Boolean); return xs.length ? { p: sum(xs, (x) => x.p), a: d <= asOf ? sum(xs, (x) => x.a) : null } : { p: null, a: null }; }); }
    } else {
      const add = (R, i, t) => { R[i] = R[i] || { p: 0, a: null }; R[i].p += t; };
      for (const l of [...LINES.G, ...LINES.C]) lineR[l] = days.map(() => ({ p: 0, a: null }));
      for (const G of GRP) grpR[G.k] = days.map(() => ({ p: 0, a: null }));
      const gk = (k) => (GRP.find((G) => G.cal.includes(k)) || {}).k;
      for (const x of A.V.plating || []) { const i = days.indexOf(x.d); if (i < 0) continue; for (const [k, t] of Object.entries(x.cls || {})) { add(lineR[x.l], i, t); const g = gk(k); if (g) add(grpR[g], i, t); } if (x.ev) ev[`${x.l}|${x.d}`] = x.ev; }
      for (const x of A.I.color || []) { const i = days.indexOf(x.d); if (i < 0 || !lineR[x.l]) continue; for (const [k, t] of Object.entries(x.g || {})) { add(lineR[x.l], i, t); const g = gk(k); if (g) add(grpR[g], i, t); } }
    }
    const nf = (v) => String(Math.round(v));
    const cell = (r, d, key) => { const now = d === td ? ' now' : '', wst = dow(d) === 3 ? ' wst' : '', c = now + wst, e = ev[key + '|' + d];
      if (cur && d <= asOf) { if (r.a == null) return `<td class="nd${c}">–</td>`; if (!(r.a > 0.5) && !(r.p > 0.5)) return `<td class="id${c}">휴</td>`;
        return `<td class="pa${c}" title="${md(d)} 계획 ${n0(r.p)}t · 실적 ${n0(r.a)}t"><span>${nf(r.p || 0)}</span><b class="${r.a + 0.5 < (r.p || 0) * 0.9 ? 'bad' : ''}">${nf(r.a)}</b></td>`; }
      return r.p > 0.5 ? `<td class="pl${c}" title="${md(d)} 계획 ${n0(r.p)}t"><b>${nf(r.p)}</b></td>` : `<td class="id${c}"${e ? ` title="${esc(e)}"` : ''}>${e && /수리|S\/D/.test(e) ? '수리' : '휴'}</td>`; };
    const labOf = (nm, R) => { const mp = sum(R, (r) => r.p), ca = sum(R, (r) => r.a), cp = sum(R.filter((r, i) => days[i] <= asOf), (r) => r.p);
      return `<th scope="row" class="lab"><b>${esc(nm)}</b><span>${cur ? `${n0(cp)} → <b class="${ca != null && ca + 0.5 < (cp || 0) * 0.97 ? 'bad' : ''}">${n0(ca)}</b>` : `월 ${n0(mp)}`}</span></th>`; };
    const rowOf = (nm, R, key, cls = '') => `<tr class="${cls}">${labOf(nm, R)}${R.map((r, i) => cell(r, days[i], key)).join('')}</tr>`;
    const sumR = (Rs) => days.map((d, i) => ({ p: sum(Rs, (R) => R[i].p), a: cur && d <= asOf ? sum(Rs, (R) => R[i].a) : null }));
    const sec = (t) => `<tr class="sec"><th colspan="${nd + 1}" scope="rowgroup"><span>${t}</span></th></tr>`;
    let body = '';
    for (const p of pls) {
      body += sec(`${PN[p]} · 라인`) + LINES[p].map((l) => rowOf(l, lineR[l], l)).join('') + rowOf(`${PN[p]} 합계`, sumR(LINES[p].map((l) => lineR[l])), '', 'tot');
      body += sec(`${PN[p]} · 그룹`) + GRP.filter((G) => G.pl === p).map((G) => rowOf(G.nm, grpR[G.k], G.k)).join('');
    }
    const hd = `<tr><th class="lab" scope="col">구분</th>${days.map((d) => `<th scope="col" class="${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}${dow(d) === 3 ? ' wst' : ''}${d === td ? ' now' : ''}"><b>${+d.slice(8)}</b><span>${'일월화수목금토'[dow(d)]}</span></th>`).join('')}</tr>`;
    return `<h2 class="kj-h">일별 계획 캘린더 <small>${mLab(m)} · 톤 · ${cur ? `칸 위 계획 · 아래 실적(빨강 = 계획의 90% 미만) · 이름 아래 = 1일~${md(asOf)} 계획 → 실적` : '계획 · 이름 아래 = 월 합계'} · 굵은 세로선 = 생산주 시작(수)</small></h2>`
      + `<section class="kj-c kj-tb"><div class="ct-wrap kj-calw"><table class="kj-cal v2-grid"><thead>${hd}</thead><tbody>${body}</tbody></table></div></section>`;
  }

  /* ---------- 8. 조치할 사항(수주 관제 '이번 주 조치'와 같은 목록 · 문장은 짧게, 전체 문장은 마우스) ---------- */
  function actions() {
    const L = (A.S.actions || []).filter((a) => { const t = a.text || ''; const pl = /^(도금|자동차|자가재)/.test(t) ? 'G' : /^(컬러|건재|가전|주문재|계획재|수요개발|[1-4]CCL)/.test(t) ? 'C' : null; return !pl || inPl(pl); });
    if (!L.length) return '';
    const short = (t) => String(t).split(' — ')[0].replace(/\s*\([^)]*\)/g, '');
    const NA = 6, nb = L.filter((a) => a.lvl === '경고').length;
    const rows = L.map((a, i) => `<tr${i >= NA ? ' class="x"' : ''}><td><b class="${a.lvl === '경고' ? 'bad' : 'warn'}">${esc(a.lvl)}</b></td><td>${esc(a.area || '')}</td><td title="${esc(a.text)}">${esc(short(a.text))}</td><td>${a.due ? md(a.due) : '–'}</td><td>${esc(a.dept || '')}</td></tr>`).join('');
    return `<h2 class="kj-h">조치할 사항 <small>오늘 기준 · 경고 ${nb} · 주의 ${L.length - nb}</small></h2><section class="kj-c kj-tb kj-act"><div class="ct-wrap"><table><thead><tr><th>신호</th><th>영역</th><th>내용</th><th>마감</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + (L.length > NA ? `<button type="button" class="kj-more" data-more="나머지 ${L.length - NA}건">나머지 ${L.length - NA}건</button>` : '') + '</section>';
  }
})();
