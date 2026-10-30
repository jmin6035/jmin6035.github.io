/* 수요 버킷 → MILP 2단계(① M/C 최소 ② M/C·재가동 판단 고정 후 선생산 최소) → 평준화 LP → 목적지 배정.
   원본: gadong-plan code/allocator_v29.py(버킷), milp_v29.py, level_v29.py, split_dest_v29.py.
   솔버: highs-js(HiGHS WASM). LP 파일 텍스트를 만들어 넘긴다. */
(function (root) {
  const GP = root.GP || (root.GP = {});

  // ---------------- LP 파일 작성기 ----------------
  const numStr = (c) => { const s = String(+c.toPrecision(12)); return s; };
  class LP {
    constructor() { this.cons = []; this.bounds = {}; this.bins = []; this.n = 0; }
    v(prefix, { lb = 0, ub = Infinity, bin = false } = {}) {
      const name = prefix + (this.n++);
      if (bin) this.bins.push(name); else if (lb !== 0 || ub !== Infinity) this.bounds[name] = [lb, ub];
      return name;
    }
    fix(name, lb, ub) { this.bounds[name] = [lb, ub]; }
    con(terms, sense, rhs) { this.cons.push([terms, sense, rhs]); }
    static expr(terms) {
      const parts = []; let line = '';
      for (const [c, v] of terms) {
        if (c === 0) continue;
        const t = (c < 0 ? ' - ' : ' + ') + numStr(Math.abs(c)) + ' ' + v;
        if (line.length + t.length > 200) { parts.push(line); line = ''; }
        line += t;
      }
      parts.push(line);
      const s = parts.join('\n').trim();
      return s.startsWith('+ ') ? s.slice(2) : s;
    }
    text(objTerms, extra = [], extraBounds = {}) {
      const out = ['Minimize', ' obj: ' + LP.expr(objTerms), 'Subject To'];
      let k = 0;
      for (const [t, s, r] of this.cons.concat(extra)) out.push(` c${k++}: ${LP.expr(t)} ${s} ${numStr(r)}`);
      out.push('Bounds');
      for (const [n, [lb, ub]] of Object.entries(Object.assign({}, this.bounds, extraBounds))) out.push(` ${numStr(lb)} <= ${n} <= ${ub === Infinity ? '+inf' : numStr(ub)}`);
      if (this.bins.length) { out.push('Binary'); for (let i = 0; i < this.bins.length; i += 20) out.push(' ' + this.bins.slice(i, i + 20).join(' ')); }
      out.push('End');
      return out.join('\n');
    }
  }
  GP.LP = LP;

  function solve(highs, text, opts, log, label) {
    const t0 = Date.now();
    const res = highs.solve(text, Object.assign({ output_flag: false }, opts, GP.solverExtra || {}));
    const sec = (Date.now() - t0) / 1000;
    const ok = res.Status === 'Optimal';
    const hasSol = res.Columns && Object.keys(res.Columns).length && isFinite(res.ObjectiveValue);
    log && log(`${label}: ${res.Status}, 목적함수 ${GP.round(res.ObjectiveValue, 4)}, ${sec.toFixed(0)}초`);
    if (!ok && !hasSol) throw new Error(`${label} 실패: ${res.Status} (해 없음 — 수요가 캐파를 넘거나 제약이 모순)`);
    return { res, sec, optimal: ok, val: (n) => (res.Columns[n] ? res.Columns[n].Primal : 0) };
  }

  // ---------------- 수요 버킷 ----------------
  GP.buildBuckets = function (items, P) {
    const agg = new Map(), sept = [];
    for (const it of items) {
      if (P.firstWindowPrevMonth && it.mi === 0 && it.window === '1~5일') { sept.push(it); continue; }
      const k = `${it.cls}|${it.alloy}|${it.due}`;
      agg.set(k, (agg.get(k) || 0) + it.tons);
    }
    const buckets = [...agg.entries()].map(([k, t]) => { const [cls, alloy, due] = k.split('|'); return { cls, alloy, due, orig: t }; });
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    buckets.sort((a, b) => cmp(a.due, b.due) || cmp(a.cls, b.cls) || cmp(a.alloy, b.alloy));
    buckets.forEach((b, i) => { b.id = i; });
    return { buckets, sept };
  };

  // ---------------- MILP ----------------
  /* O(선택, 롤링 재계획용): t0 = 실적이 끝난 날(이날 강종 O.init 고정, 생산 변수 없음), freezeUntil = 이날까지 강종 동결(O.baseState),
     allowLate/maxLate/lateW = 지연 허용(톤·일당 M/C 환산 가중), shortW = 결품(톤당), stabW/stabW2 = 기존 계획과 다른 라인·일 벌점(1·2단계),
     extraDown = {"라인|날짜": 분} 추가 정지, lock = M/C 고정(아래). O가 없으면 분기 계획(v30과 동일한 모델). */
  GP.planDays = (P, H, O) => (O && O.t0 ? GP.dateRange(O.t0, H.D1) : H.days);
  function xAllowed(P, b, l, d, O) {
    if (GP.isBlackout(P, l, d)) return false;
    if (b.rel && d < b.rel) return false;                    // 주문 소재 입고 + 투입 전에는 못 만듦(tools/order_demand, 10/30)
    if (d > b.due) return !!(O && O.allowLate) && GP.diffDays(d, b.due) <= (b.maxLate || O.maxLate || 14);
    return P.releaseExempt.includes(b.cls) || GP.diffDays(b.due, d) <= P.releaseDays;
  }
  GP.runMILP = function (highs, buckets, P, log, O = {}) {
    const H = GP.horizon(P), days = GP.planDays(P, H, O), D0 = days[0], L = P.lines, LF = P.lineFamilies, FAM = P.alloyFamily;
    const prodDays = O.t0 ? days.slice(1) : days;
    const FS = P.switchDummy, ND = P.nonfamDummy, EQ = P.equipDown, RSF = P.restartFamchg, RSS = P.restartSame;
    const RST = GP.restartDays(P, H), XD = O.extraDown || {};
    const blk = (l, d) => GP.isBlackout(P, l, d);
    const lp = new LP();
    const x = [], short = {};                       // {b, l, d, v}
    for (const b of buckets) {
      if (!(b.orig > 1e-6)) continue;
      let n = 0;
      for (const l of L) {
        if (!P.allowed[l].includes(b.alloy)) continue;
        for (const d of prodDays) if (xAllowed(P, b, l, d, O)) { x.push({ b, l, d, v: lp.v('x') }); n++; }
      }
      if (O.allowLate) short[b.id] = lp.v('q');
      else if (!n) throw new Error(`${b.cls} ${b.alloy} 마감 ${b.due} ${GP.fmt(b.orig)}t: 생산 가능한 날이 없음`);
    }
    const z = {}, s = {}, sr = {};
    for (const l of L) for (const f of LF[l]) for (const d of days) z[`${l}|${f}|${d}`] = lp.v('z', { bin: true });
    // s·r은 이진으로 선언: 목적함수가 정수가 되어 하한 올림으로 최적성 증명이 빨라짐(실측 246초→97초)
    for (const l of L) for (const d of days.slice(1)) s[`${l}|${d}`] = lp.v('s', { bin: true });
    for (const k of Object.keys(RST)) if (RST[k].day > D0) sr[k] = lp.v('r', { bin: true });

    const byB = new Map();
    for (const e of x) { if (!byB.has(e.b.id)) byB.set(e.b.id, []); byB.get(e.b.id).push(e); }
    for (const b of buckets) {
      if (!(b.orig > 1e-6)) continue;
      const t = (byB.get(b.id) || []).map((e) => [1, e.v]);
      if (short[b.id]) t.push([1, short[b.id]]);
      lp.con(t, '=', b.orig);
    }
    for (const l of L) {
      for (const d of days) lp.con(LF[l].map((f) => [1, z[`${l}|${f}|${d}`]]), '=', 1);
      days.forEach((d, i) => {
        if (i === 0) return;
        const p = days[i - 1], sv = s[`${l}|${d}`];
        if (blk(l, d)) {
          for (const f of LF[l]) lp.con([[1, z[`${l}|${f}|${d}`]], [-1, z[`${l}|${f}|${p}`]]], '=', 0);
          lp.fix(sv, 0, 0);
        } else if (sr[`${l}|${d}`]) {
          for (const f of LF[l]) lp.con([[1, z[`${l}|${f}|${d}`]], [-1, z[`${l}|${f}|${p}`]], [-1, sr[`${l}|${d}`]]], '<=', 0);
          lp.fix(sv, 0, 0);
        } else {
          for (const f of LF[l]) lp.con([[1, z[`${l}|${f}|${d}`]], [-1, z[`${l}|${f}|${p}`]], [-1, sv]], '<=', 0);
        }
      });
    }
    const byLD = new Map();
    for (const e of x) { const k = `${e.l}|${e.d}`; if (!byLD.has(k)) byLD.set(k, []); byLD.get(k).push(e); }
    const rate = (e) => GP.rateFor(P, e.l, e.b.alloy, e.b.cls);
    for (const [k, lst] of byLD) {
      const [l, d] = k.split('|');
      const t = lst.map((e) => [1 / rate(e), e.v]), xd = Math.min(XD[k] || 0, 1440 - EQ[l] - ND[l]);
      if (sr[k]) lp.con(t.concat([[RSF[l] - RSS[l], sr[k]]]), '<=', 1440 - EQ[l] - RSS[l] - xd);
      else if (d === D0) lp.con(t, '<=', 1440 - EQ[l] - ND[l] - xd);
      else lp.con(t.concat([[FS[l] - ND[l], s[k]]]), '<=', 1440 - EQ[l] - ND[l] - xd);
      for (const f of LF[l]) {
        const fl = lst.filter((e) => FAM[e.b.alloy] === f);
        if (!fl.length) continue;
        const r = Math.max(...fl.map(rate));
        lp.con(fl.map((e) => [1, e.v]).concat([[-1440 * r, z[`${l}|${f}|${d}`]]]), '<=', 0);
      }
    }
    if (O.t0) { for (const l of L) lp.fix(z[`${l}|${O.init[l]}|${O.t0}`], 1, 1); }
    else for (const l of L) if (P.initFamily[l]) lp.con([[1, z[`${l}|${P.initFamily[l]}|${D0}`]]], '=', 1);
    // 최소 캠페인 길이(선택): 전환한 강종은 m일 이상 유지. 정기수리를 걸치는 구간은 제외
    const m = P.minCampaign || 0;
    if (m > 1) for (const l of L) for (let i = 1; i < days.length; i++) {
      const d = days[i]; if (blk(l, d) || (O.t0 && i === 0)) continue;
      for (let k = 1; k < m && i + k < days.length; k++) {
        const dk = days[i + k]; if (blk(l, dk)) break;
        for (const f of LF[l]) lp.con([[1, z[`${l}|${f}|${d}`]], [-1, z[`${l}|${f}|${days[i - 1]}`]], [-1, z[`${l}|${f}|${dk}`]]], '<=', 0);
      }
    }
    const base = O.baseState || {};
    if (O.freezeUntil) for (const l of L) for (const d of prodDays) if (d <= O.freezeUntil && base[`${l}|${d}`]) lp.fix(z[`${l}|${base[`${l}|${d}`]}|${d}`], 1, 1);
    // M/C 고정(재계획, 강제 조건): O.lock = {라인: {from, days: {날짜: 강종}}}. from 이후에는 days 의 날에만 강종이 바뀌고(그날 강종 = 확정 계획),
    // 그 밖의 날은 M/C·S/D 재가동 강종 변경 금지. 인원 편성이 끝난 M/C 를 재계획이 옮기지 않게 함(바꿀지는 사람이 결정 → replan.proposal)
    if (O.lock) for (const l of L) {
      const k = O.lock[l];
      if (!k) continue;
      for (const d of days.slice(1)) {
        if (d < k.from || blk(l, d)) continue;
        const key = `${l}|${d}`;
        if (k.days[d]) lp.fix(z[`${l}|${k.days[d]}|${d}`], 1, 1);
        else if (sr[key]) lp.fix(sr[key], 0, 0);
        else lp.fix(s[key], 0, 0);
      }
    }
    // 안정성: 동결 뒤 날짜에서 기존 계획 강종을 유지하면 보상(= 다르면 벌점, 상수항 생략)
    const STAB = [];
    for (const l of L) for (const d of prodDays) if (base[`${l}|${d}`] && !(O.freezeUntil && d <= O.freezeUntil)) STAB.push(z[`${l}|${base[`${l}|${d}`]}|${d}`]);

    const MC = Object.values(s).map((v) => [1, v]);
    const INV = x.map((e) => [Math.max(0, GP.diffDays(e.b.due, e.d)), e.v]);
    const LATE = x.filter((e) => e.d > e.b.due).map((e) => [GP.diffDays(e.d, e.b.due) * (e.b.lateK || 1), e.v]);
    const BK = new Map(buckets.map((b) => [b.id, b]));
    const SHORT = Object.entries(short).map(([id, v]) => [BK.get(+id).shortK || 1, v]);   // shortK: 주문 없는 판매계획 보충(tools/order_demand)은 주문보다 먼저 결품
    const SR = Object.entries(sr).map(([k, v]) => { const l = RST[k].line; return [Math.round(1000 * (RSF[l] - RSS[l]) / FS[l]) / 1000, v]; });
    log && log(`MILP 모델: 변수 ${lp.n} (이진 ${lp.bins.length}), 제약 ${lp.cons.length}${O.t0 ? ` — 재계획 ${GP.md(prodDays[0])}~` : ''}`);

    // 1단계: (지연·결품 최소) → M/C + 재가동 강종변경(M/C 환산) 최소
    const lateW = O.lateW == null ? 1 : O.lateW, shortW = O.shortW == null ? 1000 : O.shortW;
    // 1000배 정수 계수(M/C 1000, 재가동 강종변경 668). 선생산 타이브레이크는 2단계가 담당하므로 넣지 않음
    const obj1 = MC.concat(SR).concat(LATE.map(([c, v]) => [lateW * c, v])).concat(SHORT.map(([c, v]) => [shortW * c, v]))
      .concat(STAB.map((v) => [-(O.stabW || 0), v])).map(([c, v]) => [1000 * c, v]);
    const r1 = solve(highs, lp.text(obj1), { time_limit: P.timeLimit1, mip_rel_gap: 0 }, log, O.t0 ? '1단계(지연→M/C 최소)' : '1단계(M/C 최소)');
    const K = Math.round(GP.sum(MC, ([, v]) => r1.val(v)));
    const srFix = Object.fromEntries(Object.entries(sr).map(([k, v]) => [k, Math.round(r1.val(v))]));
    const late1 = GP.sum(LATE, ([c, v]) => c * r1.val(v)), short1 = GP.sum(SHORT, ([c, v]) => c * r1.val(v));
    // 2단계: M/C ≤ K, 재가동 판단·지연·결품 고정, 선생산(톤·일) 최소. gapRel 0 — 허용오차를 두면 PC마다 다른 해가 나옴
    const extra = [[MC, '<=', K + 1e-6]].concat(Object.entries(sr).map(([k, v]) => [[[1, v]], '<=', srFix[k] + 1e-6]));
    // 1단계 지연·결품 수준 유지(수치 오차 0.5톤·일/0.5t 허용 — 창 고정 시 1단계 해가 반드시 들어오도록)
    if (LATE.length) extra.push([LATE, '<=', late1 * (1 + 1e-6) + 0.5]);
    if (SHORT.length) extra.push([SHORT, '<=', short1 * (1 + 1e-6) + 0.5]);
    // 허용오차(0.5)를 선생산 절감에 쓰지 못하도록 지연·결품에 큰 벌점(톤·일당 1,000 / 톤당 100만)
    const obj2 = INV.concat(Object.values(sr).map((v) => [P.restartPenalty, v])).concat(STAB.map((v) => [-(O.stabW2 || 0), v]))
      .concat(LATE.map(([c, v]) => [1000 * c, v])).concat(SHORT.map(([c, v]) => [1e6 * c, v]));
    let r2;
    const stateOf = (r) => { const st = {}; for (const l of L) for (const d of days) st[`${l}|${d}`] = LF[l].find((f) => r.val(z[`${l}|${f}|${d}`]) > 0.5); return st; };
    if ((P.phase2Mode || 'fast') === 'fast') {
      // 빠른 모드: 현재 해의 전환일 ±W일 창 안에서만 강종을 바꿀 수 있게 하고(창 밖 z 고정) 풀기를 개선이 없을 때까지 반복.
      // 2026 4분기 실측: 창 ±7일 3회 반복으로 전체 탐색(256초)과 같은 최적해(1,156,913.67)를 21초에 찾음. 전역 최적 증명은 아님 → 정밀 모드
      const W = P.phase2Window || 7;
      let st = stateOf(r1), best = Infinity, tot2 = 0;
      for (let it = 0; it < 12; it++) {
        const sw = {};
        for (const l of L) sw[l] = days.filter((d, i) => i > 0 && st[`${l}|${d}`] !== st[`${l}|${days[i - 1]}`]);
        const fixB = {};
        for (const l of L) for (const d of days) {
          if (sw[l].some((x) => Math.abs(GP.diffDays(d, x)) <= W)) continue;
          for (const f of LF[l]) { const v = st[`${l}|${d}`] === f ? 1 : 0; fixB[z[`${l}|${f}|${d}`]] = [v, v]; }
        }
        const r = solve(highs, lp.text(obj2, extra, fixB), { time_limit: P.timeLimit2, mip_rel_gap: 0 }, log, `2단계(선생산 최소) ${it + 1}회`);
        tot2 += r.sec;
        if (!r.optimal && !isFinite(r.res.ObjectiveValue)) break;
        const improved = r.res.ObjectiveValue < best - 1e-6 * Math.max(1, Math.abs(best));
        if (improved || !r2) { r2 = r; best = r.res.ObjectiveValue; st = stateOf(r); }
        if (!improved && it > 0) break;
      }
      r2.windowed = true; r2.sec = tot2;
    } else {
      r2 = solve(highs, lp.text(obj2, extra), { time_limit: P.timeLimit2, mip_rel_gap: 0 }, log, '2단계(선생산 최소)');
    }
    const state = {};
    for (const l of L) for (const d of days) state[`${l}|${d}`] = LF[l].find((f) => r2.val(z[`${l}|${f}|${d}`]) > 0.5);
    const INVv = GP.sum(x, (e) => r2.val(e.v) * Math.max(0, GP.diffDays(e.b.due, e.d)));
    const shortBy = Object.entries(short).map(([id, v]) => [+id, r2.val(v)]).filter(([, v]) => v > 0.05);
    return { state, K, srFix, INV: INVv, late: GP.sum(LATE, ([c, v]) => c * r2.val(v)), short: GP.sum(shortBy, ([, v]) => v), shortBy,
      optimal1: r1.optimal, optimal2: r2.optimal, phase2Exact: !r2.windowed, sec: [r1.sec, r2.sec], obj1: r1.res.ObjectiveValue / 1000 };
  };

  // ---------------- 캘린더(더미·정지) ----------------
  GP.dayLoss = function (P, H, state, l, d, O = {}) {
    const st = (dd) => state[`${l}|${dd}`];
    const xd = (O.extraDown || {})[`${l}|${d}`] || 0, xev = xd ? ` · 추가정지 ${GP.fmt(xd)}분` : '';
    if (GP.isBlackout(P, l, d)) return { blackout: 1440, equip: 0, nonfam: 0, mcdummy: 0, event: '정기수리(S/D)' };
    const p = GP.addDays(d, -1), RST = GP.restartDays(P, H), first = GP.planDays(P, H, O)[0];
    if (RST[`${l}|${d}`] && d > first) {
      const pf = st(p), chg = pf !== st(d);
      return { blackout: 0, equip: P.equipDown[l] + xd, nonfam: 0, mcdummy: chg ? P.restartFamchg[l] : P.restartSame[l], event: (chg ? `S/D 재가동(${pf}→${st(d)})` : 'S/D 재가동') + xev };
    }
    if (d !== first && st(p) && st(p) !== st(d)) return { blackout: 0, equip: P.equipDown[l] + xd, nonfam: 0, mcdummy: P.switchDummy[l], event: `M/C(${st(p)}→${st(d)})` + xev };
    return { blackout: 0, equip: P.equipDown[l] + xd, nonfam: P.nonfamDummy[l], mcdummy: 0, event: xev ? xev.slice(3) : '' };
  };

  // ---------------- 평준화 LP ----------------
  GP.runLevel = function (highs, buckets, P, state, log, O = {}) {
    const H = GP.horizon(P), days = GP.planDays(P, H, O), L = P.lines, FAM = P.alloyFamily;
    const prodDays = O.t0 ? days.slice(1) : days;
    const cal = [], cap = {};
    for (const l of L) for (const d of prodDays) {
      const dl = GP.dayLoss(P, H, state, l, d, O);
      const c = Math.max(0, 1440 - dl.blackout - dl.equip - dl.nonfam - dl.mcdummy);
      cap[`${l}|${d}`] = c;
      cal.push(Object.assign({ date: d, line: l, fam: state[`${l}|${d}`], cap: c }, dl));
    }
    const lp = new LP(), x = [], short = {};
    for (const b of buckets) {
      if (!(b.orig > 1e-6)) continue;
      for (const l of L) {
        if (!P.allowed[l].includes(b.alloy)) continue;
        for (const d of prodDays) if (FAM[b.alloy] === state[`${l}|${d}`] && xAllowed(P, b, l, d, O)) x.push({ b, l, d, v: lp.v('x') });
      }
      if (O.allowLate) short[b.id] = lp.v('q');
    }
    const byB = new Map();
    for (const e of x) { if (!byB.has(e.b.id)) byB.set(e.b.id, []); byB.get(e.b.id).push(e); }
    for (const b of buckets) {
      if (!(b.orig > 1e-6)) continue;
      if (!byB.has(b.id) && !short[b.id]) throw new Error(`평준화: ${b.cls} ${b.alloy} ${b.due} 배정 가능 일 없음`);
      const t = (byB.get(b.id) || []).map((e) => [1, e.v]);
      if (short[b.id]) t.push([1, short[b.id]]);
      lp.con(t, '=', b.orig);
    }
    const used = new Map();
    for (const e of x) { const k = `${e.l}|${e.d}`; if (!used.has(k)) used.set(k, []); used.get(k).push([1 / GP.rateFor(P, e.l, e.b.alloy, e.b.cls), e.v]); }
    const U = Object.fromEntries(L.map((l) => [l, lp.v('U')]));
    for (const l of L) for (const d of prodDays) {
      if (GP.isBlackout(P, l, d)) continue;
      const u = used.get(`${l}|${d}`) || [];
      const c = cap[`${l}|${d}`];
      if (u.length) lp.con(u, '<=', c);
      lp.con(u.concat([[1, U[l]]]), '>=', c);
    }
    const INV = x.map((e) => [Math.max(0, GP.diffDays(e.b.due, e.d)), e.v]);
    const LATE = x.filter((e) => e.d > e.b.due).map((e) => [GP.diffDays(e.d, e.b.due) * (e.b.lateK || 1), e.v]);
    const BK = new Map(buckets.map((b) => [b.id, b]));
    const SHORT = Object.entries(short).map(([id, v]) => [BK.get(+id).shortK || 1, v]);   // shortK: 주문 없는 판매계획 보충(tools/order_demand)은 주문보다 먼저 결품
    const pen = LATE.map(([c, v]) => [1e4 * c, v]).concat(SHORT.map(([c, v]) => [1e7 * c, v]));
    const a = solve(highs, lp.text(L.map((l) => [1, U[l]]).concat(pen)), {}, log, '평준화 1(최대 여유 최소)');
    const extra = L.map((l) => [[[1, U[l]]], '<=', a.val(U[l]) + 1.0]);
    const b2 = solve(highs, lp.text(INV.concat(pen), extra), {}, log, '평준화 2(선생산 최소)');
    const rows = [];
    for (const e of x) { const v = b2.val(e.v); if (v > 0.05) rows.push([e.d, e.l, e.b.alloy, e.b.cls, GP.round(v, 2), e.b.due]); }
    rows.sort((p, q) => (p.join('\u0001') < q.join('\u0001') ? -1 : 1));
    const shortBy = Object.entries(short).map(([id, v]) => [+id, b2.val(v)]).filter(([, v]) => v > 0.05);
    return { rows, cal, slack: Object.fromEntries(L.map((l) => [l, a.val(U[l])])), shortBy };
  };

  // ---------------- 목적지 배정 ----------------
  GP.SELF_SECTION_ORDER = ['컬러건재', '컬러수출-건재', '컬러수출-가전', '컬러수출-가전(수출)', '컬러수출-가전(LG향)', '수요개발'];
  GP.splitDest = function (rows, items, P) {
    const groups = new Map();
    for (const it of items) {
      if (P.firstWindowPrevMonth && it.mi === 0 && it.window === '1~5일') continue;
      const k = `${it.cls}|${it.alloy}|${it.due}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(Object.assign({}, it, { rem: it.tons }));
    }
    const ord = (d) => { const i = GP.SELF_SECTION_ORDER.indexOf(d); return i < 0 ? 99 : i; };
    for (const [k, lst] of groups) {
      if (k.startsWith('자가재|')) lst.sort((a, b) => ord(a.dest) - ord(b.dest));
      else lst.sort((a, b) => b.tons - a.tons);
    }
    const prod = new Map();
    for (const r of rows) { const k = `${r[3]}|${r[2]}|${r[5]}`; if (!prod.has(k)) prod.set(k, []); prod.get(k).push(r); }
    const out = [];
    for (const [k, lst] of prod) {
      lst.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
      const subs = groups.get(k); let i = 0;
      for (const [d, l, a, c, t, du] of lst) {
        let left = t;
        while (left > 1e-6) {
          while (i < subs.length - 1 && subs[i].rem <= 1e-6) i++;
          const s = subs[i];
          const take = i === subs.length - 1 ? left : Math.min(left, s.rem);
          s.rem -= take; left -= take;
          out.push([d, l, a, c, s.dest, s.port, s.window || '', GP.round(take, 2), du]);
        }
      }
    }
    out.sort((p, q) => (p[0] + p[1] + p[3] + p[2] < q[0] + q[1] + q[3] + q[2] ? -1 : 1));
    const bad = [];
    for (const lst of groups.values()) for (const s of lst) if (Math.abs(s.rem) > 0.5) bad.push(`${s.cls} ${s.alloy} ${s.dest} ${GP.round(s.rem, 1)}`);
    return { rows: out, bad };
  };

  /* 전체 실행. highs: highs-js 인스턴스. 반환: 결과 객체(보고서·간트 입력) */
  GP.runPlan = function (highs, items, P, log) {
    const { buckets, sept } = GP.buildBuckets(items, P);
    log && log(`수요 버킷 ${buckets.length}개, ${GP.fmt(GP.sum(buckets, (b) => b.orig), 1)}t (첫 달 1~5일 선적분 ${GP.fmt(GP.sum(sept, (s) => s.tons), 1)}t는 전월 생산 가정)`);
    const milp = GP.runMILP(highs, buckets, P, log);
    const lev = GP.runLevel(highs, buckets, P, milp.state, log);
    const dest = GP.splitDest(lev.rows, items, P);
    return { P, items, buckets, sept, milp, rows: lev.rows, cal: lev.cal, slack: lev.slack, dest: dest.rows, destBad: dest.bad };
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
