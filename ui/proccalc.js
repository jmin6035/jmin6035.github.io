/* 소재 발주 계산(소재 발주 화면 · 가동·소재 캘린더 공용): 필요 주차 × 소재 → 재고·입고예정 충당 → 부족분을 27년 배정 비중대로 업체별로 나눔
   ProcCalc.make(() => ({ D, S })) — D = procure.enc.json 복호화 자료, S = 이 브라우저 저장 상태(localStorage 'cgl-procure-v0') */
(function () {
  'use strict';
  const ST_KEY = 'cgl-procure-v0';
  const addD = (s, k) => { const d = new Date(s + 'T00:00:00Z'); if (isNaN(d)) return ''; d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
  const G_CODES = 'FHNTY';
  const plantOf = (code) => (G_CODES.includes(code) ? 'G' : 'C');
  // 11/9 회의 F14·E3·E4: 발주 마감 = 정해진 발주일 — 창구(매월 a~b일) 유형은 그 창구, P-FH 는 매주 화요일, 그 외 매주 월요일(tools/mat_order_spec.py order_day 와 같은 규칙)
  const ORDER_WIN = { '수입-FH': [10, 20], '수입AZ': [10, 20], '수입GI': [10, 20], '서림GI': [1, 10], '동종AZ': [10, 15], '동종GI': [10, 15], 'P-MAC': [1, 5] };
  const orderDay = (x, cls) => {
    if (!x) return x;
    const w = ORDER_WIN[cls], d = +x.slice(8, 10);
    if (w) { if (d > w[1]) return x.slice(0, 8) + String(w[1]).padStart(2, '0'); if (d >= w[0]) return x; const p = addD(x.slice(0, 8) + '01', -1); return p.slice(0, 8) + String(w[1]).padStart(2, '0'); }
    const wd = (new Date(x + 'T00:00:00Z').getUTCDay() + 6) % 7, k = (wd - (/^P-FH/.test(cls || '') ? 1 : 0) + 7) % 7;
    return addD(x, -k);
  };
  function make(ctx) {
    /* ---------- 저장 상태 ---------- */
    function defaults() {
      const { D } = ctx();
      return { today: D.today, supBasis: D.supplierBasis || '', safetyC: 7, safetyG: 5, dueLead: 7, sup: D.suppliers.map((s) => ({ ...s, on: true, memo: '' })), arr: [], orders: [], dec: {} };
    }
    function load() { const { D } = ctx(); try { const x = JSON.parse(localStorage.getItem(ST_KEY) || 'null'); if (x && x.sup) { const o = { ...defaults(), ...x, today: D.today }; if ((D.supplierBasis || '') !== (x.supBasis || '')) { o.sup = defaults().sup; o.supBasis = D.supplierBasis || ''; } if (o.safetyC == null) { o.safetyC = 7; o.safetyG = 5; } return o; } } catch (e) { /* 무시 */ } return defaults(); }
    function save() { const { S } = ctx(); try { localStorage.setItem(ST_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } }

    /* ---------- 계산 ---------- */
    function units() {
      const { D, S } = ctx();
      // 주문재 목록이 있으면 그 목록의 마지막 필요일까지 '주문재(추정)'을 빼고 목록으로 대체
      const cut = S.orders.length ? S.orders.map((o) => o.need).sort().pop() : null;
      const M = new Map();
      const get = (wk, plant, code) => { const k = `${wk}|${plant}|${code}`; if (!M.has(k)) M.set(k, { key: k, wk, plant, code, first: null, t: 0, use: [], thk: null, est: 0, ord: 0 }); return M.get(k); };
      D.units.forEach((u0) => {
        // 날짜별 소요(days)가 있으면 오늘 이전 몫은 뺌 — 재고는 이미 어제까지 실적 사용을 뺀 값이라 지난 날 수요를 남기면 이중 계산(2026-10-15)
        let u = u0;
        if (u0.days) {
          const keep = Object.entries(u0.days).filter(([d]) => d >= S.today), kt = keep.reduce((a, [, t]) => a + t, 0);
          if (kt < 0.5) return;
          const r = kt / u0.t, src = {}; Object.entries(u0.src).forEach(([k, v]) => { src[k] = v * r; });
          u = { ...u0, t: kt, first: keep.map(([d]) => d).sort()[0], src, use: u0.use.map((x) => [x[0], x[1], x[2], x[3] * r]) };
        }
        const est = u.src['주문재(추정)'] || 0;
        const drop = cut && u.wk <= cut ? est : 0;
        const x = get(u.wk, u.plant, u.code);
        x.t += u.t - drop; x.est += est - drop; x.first = x.first && x.first < u.first ? x.first : u.first;
        x.use.push(...u.use.filter((r) => !(drop && r[0] === '주문재(추정)')));
        if (u.thk) x.thk = u.thk;
      });
      S.orders.forEach((o) => {
        const wk = monday(o.need), x = get(wk, plantOf(o.code), o.code);
        x.t += o.mat; x.ord += o.mat; x.first = x.first && x.first < o.need ? x.first : o.need;
        x.use.push(['주문재(목록)', o.cust || '-', o.prod + (o.con ? ' ' + o.con : ''), o.mat]);
        if (o.thk) x.thk = x.thk ? [Math.min(x.thk[0], o.thk), Math.max(x.thk[1], o.thk)] : [o.thk, o.thk];
      });
      return [...M.values()].filter((x) => x.t >= 1).sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.code < b.code ? -1 : 1));
    }
    function monday(s) { const d = new Date(s + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); }

    /* MES 미입고 발주(사내 PC 가 매일 계산, 화면 자료 known) — 직접 넣은 입고예정과 발주번호가 같으면 직접 넣은 것을 씀 */
    function autoArr() { const { D, S } = ctx(); const own = new Set(S.arr.map((a) => String(a.po || '').trim()).filter(Boolean)); return (D.known || []).filter((a) => a.date >= S.today && !own.has(String(a.po || ''))); }
    function judge() {
      const { D, S } = ctx();
      const U = units();
      const lots = {};                                              // 공장:코드 → [{date, t}] (재고 = 오늘)
      Object.entries(D.stock).forEach(([k, t]) => { (lots[k] = lots[k] || []).push({ date: S.today, t, src: '재고' }); });
      S.arr.forEach((a) => { const k = `${plantOf(a.code)}:${a.code}`; (lots[k] = lots[k] || []).push({ date: a.date, t: +a.t || 0, src: a.sup || '입고예정' }); });
      autoArr().forEach((a) => { const k = `${a.plant}:${a.code}`; (lots[k] = lots[k] || []).push({ date: a.date, t: a.t, src: 'MES 기발주' }); });
      Object.values(lots).forEach((L) => L.sort((a, b) => (a.date < b.date ? -1 : 1)));
      return U.map((u) => {
        const POS = u.plant === 'G' && u.code === 'N';                // 임가공(AL-STS F/H) = 포스코 지급 — 우리 발주 아님
        const needBy = addD(u.first, -(u.plant === 'C' ? S.safetyC : S.safetyG)), left = diff(needBy, S.today);
        let rem = u.t; const L = lots[`${u.plant}:${u.code}`] || [];
        const cutoff = needBy > S.today ? needBy : S.today;          // 이미 늦은 주는 지금 있는 재고·도착분으로 충당
        for (const l of L) { if (rem <= 0) break; if (l.date > cutoff || l.t <= 0) continue; const q = Math.min(l.t, rem); l.t -= q; rem -= q; }
        const short = Math.max(0, rem), cover = u.t - short;
        const cand = S.sup.filter((s) => s.on && s.plant === u.plant && s.code === u.code).sort((a, b) => a.prio - b.prio);
        const specOk = (s) => !u.thk || !s.thk || (u.thk[0] >= s.thk[0] - 0.005 && u.thk[1] <= s.thk[1] + 0.005);
        const feas = cand.filter((s) => +s.lt <= left && specOk(s));
        const dec = S.dec[u.key] || {};
        // 업체별 나눔(2026-10-14): 부족량을 27년 배정 비중대로 나눔(사양 맞는 업체만, 배정 없으면 균등) → 리드타임 안에 못 맞추는 업체 몫은 맞추는 업체로 넘김(배정 비중대로) → 담당자가 업체별 수량을 고치면 그 값
        const elig = cand.filter(specOk), wsum = elig.reduce((a, x) => a + (+x.share || 0), 0);
        const split = elig.map((x) => { const dl = orderDay(addD(needBy, -x.lt), x.cls); return { s: x, t: short * (wsum > 0 ? (+x.share || 0) / wsum : 1 / elig.length), late: dl < S.today, moved: 0, dl }; });
        const okP = split.filter((x) => !x.late), lateT = split.filter((x) => x.late).reduce((a, x) => a + x.t, 0);
        if (lateT > 0 && okP.length) {
          const ow = okP.reduce((a, x) => a + (+x.s.share || 0), 0);
          okP.forEach((x) => { x.moved = lateT * (ow > 0 ? (+x.s.share || 0) / ow : 1 / okP.length); x.t += x.moved; });
          split.forEach((x) => { if (x.late) { x.from = x.t; x.t = 0; } });
        }
        split.forEach((x) => { const q = dec['q:' + x.s.sup]; if (q != null && q !== '') x.t = +q || 0; });
        const parts = split.filter((x) => x.t >= 1 && !x.late);
        const rec = parts.slice().sort((a, b) => b.t - a.t)[0]?.s || feas[0] || null;
        let kind;
        if (POS) kind = 'pos';
        else if (short < 1) kind = 'ok';
        else if (!cand.length) kind = 'nosup';
        else if (!okP.length) kind = S.arr.some((a) => a.code === u.code && plantOf(a.code) === u.plant) || autoArr().some((a) => a.code === u.code && a.plant === u.plant) ? 'adjust' : 'check';   // 그 소재 기발주를 넣었으면 '조정', 아니면 '기발주 확인'
        else if (lateT >= 1) kind = 'alt';
        else kind = 'normal';
        const deadline = parts.length ? parts.map((x) => x.dl).sort()[0] : (cand[0] ? orderDay(addD(needBy, -cand[0].lt), cand[0].cls) : null);
        return { ...u, needBy, left, short: POS ? 0 : short, cover, cand, feas, rec, kind, deadline, dec, specOk, split, parts: POS || short < 1 ? [] : parts };
      });
    }
    return { defaults, load, save, units, monday, autoArr, judge };
  }
  window.ProcCalc = { make, ST_KEY, plantOf, addD, diff, orderDay };
})();
