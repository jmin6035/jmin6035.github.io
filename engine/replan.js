/* 롤링 재계획: 실적(t0까지)을 반영해 남은 기간을 다시 최적화한다.
   lateW = 지연 1톤·일의 M/C 환산(기본 0.01 = M/C 1회 ↔ 100톤·일). 2026-10 시험: 2CGL 이틀 고장 시 M/C +2회로 지연 907t·1,139톤·일 감소 — 기준은 사업 판단.
   stabW = 기존 계획과 강종이 다른 라인·일 1일당 M/C 환산(기본 0.1 = 10일 ↔ M/C 1회). 0.01이면 12월 재가동 강종까지 바꿔 M/C 환산 0.33을 아끼는 등
   교란과 먼 일정이 흔들렸음(지연 동일) → 0.1로 상향. 1이면 사실상 고정(지연 +335톤·일).
   - 남은 수요 = 계획 수요 − 실적(부서·강종·마감일 버킷 단위)
   - t0 당일 라인 강종 = 현재 상태, t0+1 ~ t0+동결일수는 기존 계획 강종 유지(소재 준비 등 현장 제약)
   - 지연·결품을 M/C보다 우선해 최소화, 같은 조건이면 기존 계획과 가까운 일정 선호(계획 안정성)
   - lockMC(기본 켬): 기준 계획의 M/C·S/D 재가동 강종 변경 날짜와 강종을 강제 고정(인원 편성). 고정 조건으로 지연·결품이 생기면
     고정을 푼 계산을 한 번 더 해 '이동 제안'(replan.proposal)으로만 보여줌 — 게시 계획은 고정안
   사내에서는 MES 실적(코일 → 주문 → 버킷 매핑)과 설비정지 예정을 actual로 넣는다. */
(function (root) {
  const GP = root.GP || (root.GP = {});

  // timeLimit 1e7초 = 사실상 무제한: 재계획은 오래 걸려도 최적 증명까지(시간 제한에 걸리면 최적이 아닌 해가 조용히 나옴). phase2Mode 'exact' = 2단계도 전체 탐색
  GP.REPLAN_DEFAULTS = { lockMC: true, freezeDays: 2, freezeTo: null, allowLate: true, maxLate: 14, lateW: 0.01, shortW: 1000, stabW: 0.1, stabW2: 500, timeLimit: 1e7, phase2Mode: 'exact' };

  /* 시험용 가짜 실적: 기존 계획을 t0까지 그대로 생산했다고 보고 교란을 적용.
     교란: {type:'down', line, from, to, minutes?} 설비정지(과거면 실적 감소, 미래면 가동가능시간 차감, minutes 없으면 종일)
           {type:'reject', line, date, tons} 불량(해당일 실적에서 제외 → 다시 만들어야 함) */
  GP.simulateActuals = function (R, t0, disruptions = []) {
    const P = R.P;
    let rows = R.rows.filter((r) => r[0] <= t0).map((r) => r.slice());
    const extraDown = {}, notes = [];
    for (const x of disruptions) {
      if (x.type === 'down') {
        for (const d of GP.dateRange(x.from, x.to)) {
          if (d <= t0) {
            const frac = x.minutes ? Math.min(1, x.minutes / Math.max(1, (R.cal.find((c) => c.line === x.line && c.date === d) || { cap: 1440 }).cap)) : 1;
            rows.forEach((r) => { if (r[1] === x.line && r[0] === d) r[4] = GP.round(r[4] * (1 - frac), 2); });
          } else extraDown[`${x.line}|${d}`] = (extraDown[`${x.line}|${d}`] || 0) + (x.minutes || 1440);
        }
        notes.push(`${x.line} ${GP.md(x.from)}~${GP.md(x.to)} 설비정지${x.minutes ? ` ${GP.fmt(x.minutes)}분/일` : '(종일)'}`);
      } else if (x.type === 'reject') {
        const day = rows.filter((r) => r[1] === x.line && r[0] === x.date), tot = GP.sum(day, (r) => r[4]);
        day.forEach((r) => { r[4] = GP.round(r[4] * Math.max(0, 1 - x.tons / tot), 2); });
        notes.push(`${x.line} ${GP.md(x.date)} 불량 ${GP.fmt(x.tons)}t (재생산 필요)`);
      }
    }
    rows = rows.filter((r) => r[4] > 0.05);
    const state = {};
    for (const l of P.lines) { const c = R.cal.find((c) => c.line === l && c.date === t0); state[l] = c ? c.fam : P.initFamily[l]; }
    return { t0, rows, state, extraDown, notes };
  };

  /* M/C 고정 조건: 기준 계획(R.cal)에서 t0 다음 날부터 강종이 바뀌는 날 = 확정 M/C(또는 S/D 재가동 강종 변경).
     현재 강종이 기준 계획과 같은 라인만 다음 날부터 고정, 다르면(현장이 기준 계획과 어긋남) 고정하지 않고 알림.
     확정 M/C 날에 추가 정지가 겹쳐 전환 더미를 넣을 수 없으면 그 라인은 고정하지 않음(알림). */
  GP.mcLock = function (P, H, R, act, notes) {
    const base = {};
    for (const c of R.cal) base[`${c.line}|${c.date}`] = c.fam;
    const ds = GP.dateRange(act.t0, H.D1), XD = act.extraDown || {}, lock = {};
    for (const l of P.lines) {
      const days = {};
      for (let i = 1; i < ds.length; i++) { const a = base[`${l}|${ds[i - 1]}`], b = base[`${l}|${ds[i]}`]; if (a && b && a !== b) days[ds[i]] = b; }
      const sw = Object.keys(days).sort();
      const clash = sw.find((d) => (XD[`${l}|${d}`] || 0) > 1440 - P.equipDown[l] - Math.max(P.switchDummy[l], P.restartFamchg[l]));
      if (clash) { notes.push(`${l} 확정 M/C ${GP.md(clash)}에 추가 정지가 겹쳐 이 라인은 M/C 고정 안 함 — 일정 재검토`); continue; }
      if (act.state[l] !== base[`${l}|${act.t0}`]) { notes.push(`${l} 현재 강종 ${act.state[l]} ≠ 기준 계획 ${base[`${l}|${act.t0}`]} — 이 라인 M/C 고정 안 함(기준 계획 재수립 필요)`); continue; }
      lock[l] = { from: ds[1], days };
    }
    return lock;
  };

  /* 11/13 사용자 승인: 2CGL MAC 월 1회 창 + AL-STS 칸 — cglplan/macrule.py 와 같은 규칙(params.js macRule, 재계획 옵션 macRule 로 켬)
     ① MAC: from 부터 그 라인 강종 = MAC 창(매달 day일 ~ day+len−1일)이면 MAC, 아니면 AL — 다른 M/C 금지(M/C 고정 lock 으로)
     ② AL-STS: from 부터 칸 날짜(MAC→AL 복귀 뒤 gap일·정지 날 뺌)에만, 칸당 cap t 이하 ③ AL-STS 지연 기준 = 칸 끝(행에는 원래 납기) */
  const MR = (GP.macRule = {});
  MR.months = (a, b) => { const out = []; let y = +a.slice(0, 4), m = +a.slice(5, 7); while (`${y}-${String(m).padStart(2, '0')}` <= b.slice(0, 7)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (m === 12) { y++; m = 1; } else m++; } return out; };
  MR.windows = (rule, D1) => MR.months(rule.from, D1).map((m) => { const s = `${m}-${String(+((rule.dayOf || {})[m] || rule.day || 11)).padStart(2, '0')}`; return [s, GP.addDays(s, rule.len)]; });
  MR.setup = function (P, H, act, rule, MO, notes) {
    const l = rule.line, t0 = act.t0, D1 = H.D1, fam = rule.fam, base = rule.base, mac = rule.mac !== false;
    const lock = mac ? (MO.lock = MO.lock || {}) : (MO.lock || {});
    const k = lock[l] || { from: GP.addDays(t0, 1), days: {} }, W = MR.windows(rule, D1);
    if (mac) {
      const want = (d) => (W.some(([s, e]) => s <= d && d < e) ? fam : base);
      const st0 = GP.addDays(MO.freezeUntil || t0, 1), start = rule.from > st0 ? rule.from : st0;
      const days = {}; for (const [d, f] of Object.entries(k.days)) if (d < rule.from) days[d] = f;
      let prev = null;
      for (const d of GP.dateRange(start, D1)) { if (GP.isBlackout(P, l, d)) continue; const w = want(d); if (w !== prev) days[d] = w; prev = w; }
      lock[l] = { from: k.from, days, to: D1 };
      notes.push(`${l} MAC 월 1회 규칙(${GP.md(rule.from)}~): ` + W.filter(([s, e]) => e > t0).map(([s, e]) => `${GP.md(s)}~${GP.md(GP.addDays(e, -1))}`).join(', ') + ' — 그 외 M/C 없음');
    }
    if (rule.sts === false) return [];
    let st = act.state[l]; const rets = [], ld = (lock[l] || {}).days || {};
    for (const d of Object.keys(ld).sort()) { const f = ld[d]; if (st === fam && f === base) rets.push(d); st = f; }
    const gapd = new Set(); for (const r of rets) for (let i = 0; i < (+rule.gap || 0); i++) gapd.add(GP.addDays(r, i));
    const made = {}; for (const [d, ln, a, c, t] of act.rows) if (ln === l && a === rule.alloy) made[d] = (made[d] || 0) + t;
    const slots = [];
    for (const m of MR.months(rule.from, D1)) for (const [a, b] of rule.slots) {
      const s0 = `${m}-${String(a).padStart(2, '0')}`, s1 = `${m}-${String(b).padStart(2, '0')}`;
      const ds = GP.dateRange(s0, s1 < D1 ? s1 : D1).filter((d) => d > t0 && !gapd.has(d) && !GP.isBlackout(P, l, d));
      if (ds.length) slots.push({ from: s0, to: s1, days: ds, cap: Math.max(0, rule.cap - Object.entries(made).filter(([d]) => s0 <= d && d <= s1).reduce((p, [, v]) => p + v, 0)) });
    }
    const day = {}; slots.forEach((s, i) => s.days.forEach((d) => { day[d] = i; }));
    MO.slots = { line: l, alloy: rule.alloy, from: rule.from, day, cap: slots.map((s) => s.cap) };
    notes.push(`${l} ${rule.alloy} 칸: ` + slots.map((s) => `${GP.md(s.days[0])}~${GP.md(s.days[s.days.length - 1])}(${GP.fmt(s.cap)}t)`).join(', ') + ` — MAC→AL 복귀 뒤 ${rule.gap}일 금지`);
    return slots;
  };
  MR.slotDue = (slots, due, rel) => { const ends = [...new Set(slots.filter((s) => !rel || s.to >= rel).map((s) => s.to))].sort(); const le = ends.filter((e) => e <= due); return le.length ? le[le.length - 1] : ends.length ? ends[0] : due; };
  MR.remap = function (rem, slots, rule) {
    const ref = {};
    const out = rem.map((b) => {
      if (!(slots.length && b.alloy === rule.alloy && b.orig > 1e-6)) return b;
      const r = MR.slotDue(slots, b.due, b.rel), k = `${b.cls}|${b.due}`;
      ref[k] = k in ref && ref[k] > r ? ref[k] : r;
      return r !== b.due ? Object.assign({}, b, { due: r, due0: b.due }) : b;
    });
    return { rem: out, ref };
  };
  MR.summary = function (rows, items, t0, rule, slots, ref) {
    const tot = {}, res = {}, day = {};
    for (const it of items || []) { if (it.alloy !== rule.alloy || it.dest === '생산 완료') continue; const k = `${it.cls}|${it.due}`; tot[k] = (tot[k] || 0) + it.tons; if (it.src !== '주문') res[k] = (res[k] || 0) + it.tons; }
    for (const [d, l, a, c, t, du] of rows) {
      if (a !== rule.alloy || d <= t0) continue;
      const k = `${c}|${du}`, x = (day[`${d}|${l}`] = day[`${d}|${l}`] || [0, 0]);
      x[0] += t; x[1] += t * (tot[k] > 0 ? (res[k] || 0) / tot[k] : 1);
    }
    return { line: rule.line, alloy: rule.alloy, slots: slots.map((s) => [s.days[0], s.days[s.days.length - 1], GP.round(s.cap, 1)]), ref,
      days: Object.keys(day).sort().map((k) => { const [d, l] = k.split('|'); return [d, l, GP.round(day[k][0], 1), GP.round(day[k][1], 1)]; }) };
  };

  /* R: 기준 계획 결과, act: {t0, rows, state, extraDown, notes}. 반환: 같은 형식의 결과(과거=실적 + 미래=재계획) */
  GP.DEPTS_ALL = ['도금수출', '자동차수출', '도금국내', '자동차내수', '자가재'];   // report.js DEPTS 와 같은 순서(워커엔 report.js 없음)
  GP.replan = function (highs, R, act, opts = {}, log) {
    const P = R.P, H = GP.horizon(P), O = Object.assign({}, GP.REPLAN_DEFAULTS, opts);
    if (act.t0 < H.D0 || act.t0 >= H.D1) throw new Error(`실적 기준일 ${act.t0}이 계획 기간 밖`);
    const done = {};
    for (const [d, l, a, c, t, du] of act.rows) done[`${c}|${a}|${du}`] = (done[`${c}|${a}|${du}`] || 0) + t;
    const over = [];
    let rem = R.buckets.map((b) => {
      const k = `${b.cls}|${b.alloy}|${b.due}`, left = b.orig - (done[k] || 0);
      if (left < -0.5) over.push(`${b.cls} ${b.alloy} ${GP.md(b.due)} +${GP.fmt(-left)}t`);
      return Object.assign({}, b, { orig: Math.max(0, left) });
    });
    const baseState = {};
    for (const c of R.cal) baseState[`${c.line}|${c.date}`] = c.fam;
    let fu = O.freezeDays > 0 ? GP.addDays(act.t0, O.freezeDays) : null;
    if (O.freezeTo && O.freezeTo > (fu || act.t0)) fu = O.freezeTo;   // 11/9 옵션(기본 끔): 동결을 확정 창(이번 주 작업지시가 있는 날)까지 — cglplan/replan.py 와 같음
    for (const [l, cur] of Object.entries(act.state || {})) {          // 기준 계획 강종이 실제와 어긋난 라인은 동결 기간을 지금 강종으로(이미 나간 지시 = 지금 강종)
      if (!fu || baseState[`${l}|${act.t0}`] === cur) continue;
      for (let d = GP.addDays(act.t0, 1); d <= fu; d = GP.addDays(d, 1)) if (`${l}|${d}` in baseState) baseState[`${l}|${d}`] = cur;
    }
    const lockNotes = [], XD = act.extraDown || {};
    if (fu) for (const l of P.lines) {                                // 11/9: 동결 기간 안 M/C 날에 추가 정지가 겹쳐 전환 시간이 안 나오면 그날부터 동결 풀기(안 풀면 해 없음 — mcLock 의 clash 와 같은 기준)
      for (let d = GP.addDays(act.t0, 1); d <= fu; d = GP.addDays(d, 1)) {
        const a = baseState[`${l}|${GP.addDays(d, -1)}`], b = baseState[`${l}|${d}`];
        if (a && b && a !== b && (XD[`${l}|${d}`] || 0) > 1440 - P.equipDown[l] - Math.max(P.switchDummy[l], P.restartFamchg[l])) {
          for (let z = d; z <= fu; z = GP.addDays(z, 1)) delete baseState[`${l}|${z}`];
          lockNotes.push(`${l} 동결 기간 M/C ${GP.md(d)}에 추가 정지가 겹쳐 그날부터 동결 해제 — 전환일 재검토`);
          break;
        }
      }
    }
    const MO = { t0: act.t0, init: act.state, freezeUntil: fu, baseState, allowLate: O.allowLate, maxLate: O.maxLate, lateW: O.lateW, shortW: O.shortW, stabW: O.stabW, stabW2: O.stabW2, extraDown: XD };
    if (O.lockMC) MO.lock = GP.mcLock(P, H, R, act, lockNotes);
    let rule = O.macRule, slots = [], stsRef = {};
    if (rule === true) rule = O.macRule = P.macRule || GP.DEFAULT_PARAMS.macRule;
    if (rule && (rule.mac !== false || rule.sts !== false)) {           // 11/13 사용자: 2CGL MAC 월 1회 창 + AL-STS 칸
      slots = MR.setup(P, H, act, rule, MO, lockNotes);
      const m = MR.remap(rem, slots, rule); rem = m.rem; stsRef = m.ref;
    }
    log && log(`실적 ${GP.fmt(GP.sum(act.rows, (r) => r[4]))}t 반영(~${GP.md(act.t0)}), 남은 수요 ${GP.fmt(GP.sum(rem, (b) => b.orig))}t, 강종 동결 ~${MO.freezeUntil ? GP.md(MO.freezeUntil) : '없음'}`);
    const PS = Object.assign({}, P, { timeLimit1: O.timeLimit, timeLimit2: O.timeLimit, phase2Mode: O.phase2Mode });
    let milp, proposal = null;
    try { milp = GP.runMILP(highs, rem, PS, log, MO); }
    catch (e) {
      if (!MO.lock) throw e;
      lockNotes.push(`M/C 고정으로는 풀리지 않아 고정을 풀고 계산(${String(e.message || e).slice(0, 80)}) — M/C 일정 변경 검토 필요`);
      log && log(lockNotes[lockNotes.length - 1]);
      delete MO.lock; milp = GP.runMILP(highs, rem, PS, log, MO);
    }
    if (MO.lock && (milp.late > 0.5 || milp.short > 0.5)) {
      // 고정안에 지연·결품 → M/C 를 옮기면 얼마나 줄어드는지 계산(게시하지 않음, 사람이 결정)
      log && log(`M/C 고정안: 지연 ${GP.fmt(milp.late)}톤·일, 결품 ${GP.fmt(milp.short)}t → 고정을 푼 경우 계산(제안용)`);
      let free = null;
      try { free = GP.runMILP(highs, rem, Object.assign({}, PS, { timeLimit1: 120, timeLimit2: 120, phase2Mode: 'fast' }), log, Object.assign({}, MO, { lock: null })); }   // 제안용 — 2분 제한
      catch (e) {                                                  // 2026-10-28: 2분 안에 해를 못 찾으면 제안만 빼고 고정안으로 계속(예전엔 전체가 멈춤)
        lockNotes.push(`M/C 이동 제안 계산이 2분 안에 안 끝나 생략(${String(e.message || e).slice(0, 60)}) — 고정안 그대로`);
        log && log(lockNotes[lockNotes.length - 1]);
      }
      if (free) {
      const sw = (st) => { const o = []; for (const l of P.lines) { const ds = GP.dateRange(act.t0, H.D1); for (let i = 1; i < ds.length; i++) { const a = st[`${l}|${ds[i - 1]}`], b = st[`${l}|${ds[i]}`]; if (a && b && a !== b) o.push(`${ds[i]}|${l}|${a}→${b}`); } } return o; };
      const A = sw(milp.state), B = sw(free.state);
      proposal = { lockedLate: milp.late, lockedShort: milp.short, lockedK: milp.K, freeLate: free.late, freeShort: free.short, freeK: free.K,
        drop: A.filter((x) => !B.includes(x)), add: B.filter((x) => !A.includes(x)) };
      log && log(`이동 제안: M/C ${milp.K}→${free.K}회, 지연 ${GP.fmt(milp.late)}→${GP.fmt(free.late)}톤·일, 결품 ${GP.fmt(milp.short)}→${GP.fmt(free.short)}t (빼기 ${proposal.drop.join(', ') || '-'} / 넣기 ${proposal.add.join(', ') || '-'})`);
      }
    }
    const lev = GP.runLevel(highs, rem, PS, milp.state, log, MO);
    const rows = act.rows.concat(lev.rows).sort((p, q) => (p.join('\u0001') < q.join('\u0001') ? -1 : 1));
    const actDay = {};
    for (const r of act.rows) actDay[`${r[1]}|${r[0]}`] = (actDay[`${r[1]}|${r[0]}`] || 0) + r[4];
    const planDay = {};
    // 계획 대비 실적은 기준 결과에서 '계획'이었던 날만(기준이 재계획이면 그 기준일 b0 까지는 이미 실적) — Python 과 동일
    const b0 = R.replan ? R.replan.t0 : null, inwin = (d) => d <= act.t0 && (b0 == null || d > b0);
    for (const r of R.rows) if (inwin(r[0])) planDay[`${r[1]}|${r[0]}`] = (planDay[`${r[1]}|${r[0]}`] || 0) + r[4];
    // 지난 날짜(~t0)는 실적 기준: 강종 = 그날 실적의 주 강종, 전환 표시는 실적 강종이 바뀐 날만(예전 계획의 'M/C 예정'은 지움) — Python 과 동일
    const famT = {}, famAct = {};
    for (const r of act.rows) { const k = `${r[1]}|${r[0]}|${P.alloyFamily[r[2]]}`; famT[k] = (famT[k] || 0) + r[4]; }
    for (const [k, t] of Object.entries(famT)) { const [l, d, fm] = k.split('|'); const kk = `${l}|${d}`; if (!famAct[kk] || t > famAct[kk][1]) famAct[kk] = [fm, t]; }
    const prevF = {};
    const past = R.cal.filter((c) => c.date <= act.t0).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((c) => {
      const l = c.line, d = c.date, k = `${l}|${d}`;
      const parts = (c.event || '').split(' · ').filter((x) => x && !/^(M\/C|S\/D 재가동|실적 미달)/.test(x));
      const fa = famAct[k] ? famAct[k][0] : null;
      if (fa) { if (prevF[l] && prevF[l] !== fa) parts.unshift(`M/C(${prevF[l]}→${fa})`); prevF[l] = fa; }
      else if (/^(M\/C|S\/D 재가동)/.test(c.event || '') && !(l in prevF)) parts.unshift(c.event.split(' · ')[0]);
      const gap = inwin(d) ? (planDay[k] || 0) - (actDay[k] || 0) : 0;
      if (gap > 1) parts.push(`실적 미달 ${GP.fmt(gap)}t`);
      return Object.assign({}, c, { fam: fa || c.fam, event: parts.join(' · ') });
    });
    const cal = past.concat(lev.cal).sort((a, b) => (a.date + a.line < b.date + b.line ? -1 : 1));
    const dest = GP.splitDest(rows, R.items, P);
    // 기존 대비 전환 일정 변화(t0 이후)
    const ev = (cal_) => cal_.filter((c) => c.date > act.t0 && /M\/C|재가동/.test(c.event || '')).map((c) => `${c.date}|${c.line}|${c.event.split(' · ')[0]}`);
    const before = ev(R.cal), after = ev(cal);
    const shortBy = (lev.shortBy.length ? lev.shortBy : milp.shortBy).map(([id, t]) => { const b = rem.find((x) => x.id === id); return `${b.cls} ${b.alloy} ${GP.md(b.due)} ${GP.fmt(t)}t`; });
    const replan = {
      t0: act.t0, freezeUntil: MO.freezeUntil, notes: act.notes || [], actualT: GP.sum(act.rows, (r) => r[4]),
      planToDateT: GP.sum(R.rows.filter((r) => inwin(r[0])), (r) => r[4]), actualWinT: GP.sum(act.rows.filter((r) => inwin(r[0])), (r) => r[4]), vsFrom: b0,
      removed: before.filter((x) => !after.includes(x)), added: after.filter((x) => !before.includes(x)),
      over, shortBy, late: milp.late, baseMC: R.milp && R.milp.K, options: O, lockMC: !!MO.lock, lockNotes, proposal, optimal: !!(milp.optimal1 && milp.optimal2 && milp.phase2Exact),
    };
    if (slots.length) replan.sts = MR.summary(rows, R.items, act.t0, rule, slots, stsRef);
    // 계획 대비 실적(대시보드): 라인×일, 부서 누계
    replan.vsPlan = [];
    for (const d of GP.dateRange(H.D0, act.t0)) if (inwin(d)) for (const l of P.lines) replan.vsPlan.push([d, l, GP.round(planDay[`${l}|${d}`] || 0, 1), GP.round(actDay[`${l}|${d}`] || 0, 1)]);
    replan.byDept = GP.DEPTS_ALL.map((c) => [c, GP.round(GP.sum(R.rows.filter((r) => inwin(r[0]) && r[3] === c), (r) => r[4]), 1), GP.round(GP.sum(act.rows.filter((r) => inwin(r[0]) && r[3] === c), (r) => r[4]), 1)]);
    log && log(`M/C 고정 ${MO.lock ? '켬' : '끔'}` + (lockNotes.length ? ' — ' + lockNotes.join(' / ') : ''));
    log && log(`재계획${replan.optimal ? '(최적 증명)' : '(최적 미증명 — 시간 제한)'}: M/C(남은 기간) ${milp.K}회, 지연 ${GP.fmt(milp.late)}톤·일, 결품 ${GP.fmt(milp.short)}t, 전환 변경 −${replan.removed.length}/+${replan.added.length}`);
    return Object.assign({}, R, { rows, cal, dest: dest.rows, destBad: dest.bad, slack: lev.slack, milp: Object.assign({}, milp, { base: R.milp }), replan });
  };
  /* 납기 지연(톤·일) = 기준일 뒤 생산 중 원래 납기(수출 선적창 끝·월말)를 넘긴 양 × 일수. 결과 행으로 계산 —
     재계획 MILP 의 지연 값에는 자가재 반순 납기(가중 0.01)도 섞여 있어 화면에는 이 값을 씀 */
  GP.dueLate = function (R) {
    const t0 = (R && R.replan && R.replan.t0) || '';
    const S = (R && R.replan && R.replan.sts) || {}, ref = S.ref || {}, du = (r) => (r[2] === S.alloy && ref[`${r[3]}|${r[5]}`]) || r[5];   // AL-STS = 칸 끝 기준(11/13)
    return GP.sum((R && R.rows || []).filter((r) => r[0] > t0 && r[0] > du(r)), (r) => r[4] * GP.diffDays(r[0], du(r)));
  };
  /* 화면·보고 공용 문구: M/C 고정 상태와 이동 제안 */
  GP.lockLines = function (rp) {
    if (!rp || rp.lockMC == null) return [];
    const ev = (x) => { const [d, l, e] = x.split('|'); return `${GP.md(d)} ${l} ${e}`; };
    const o = [rp.lockMC ? 'M/C 고정: 확정된 M/C·S/D 재가동 날짜를 바꾸지 않고 계산(인원 편성 유지)' : 'M/C 고정 해제 — M/C 일자 변경 가능'];
    for (const n of rp.lockNotes || []) o.push('⚠ ' + n);
    const q = rp.proposal;
    const sw = (rp.lockNotes || []).some((n) => n.indexOf('자가재 반순') >= 0);   // 자가재 반순 납기를 쓴 재계획: 지연 값 = 직판재 톤·일 + 자가재 반순 톤·일 × 0.01
    if (q) o.push(`검토 요청 — M/C 이동 시: M/C ${q.lockedK}→${q.freeK}회, ${sw ? '지연 점수(직판재 톤·일 + 자가재 반순 톤·일×0.01)' : '지연'} ${GP.fmt(q.lockedLate)}→${GP.fmt(q.freeLate)}${sw ? '' : '톤·일'}, 결품 ${GP.fmt(q.lockedShort)}→${GP.fmt(q.freeShort)}t`
      + ` (빼기 ${q.drop.map(ev).join(', ') || '-'} / 넣기 ${q.add.map(ev).join(', ') || '-'}). 게시 계획은 고정안 — 바꾸려면 결정 후 기준 계획 수정`);
    return o;
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
