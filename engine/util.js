/* 날짜·숫자 공통 함수. 날짜는 'YYYY-MM-DD' 문자열로 다룬다(시간대 영향 없음). */
(function (root) {
  const GP = root.GP || (root.GP = {});
  const pad = (n) => String(n).padStart(2, '0');
  const toUTC = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const fromUTC = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  GP.ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  GP.addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000);
  GP.diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);   // a - b
  GP.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  GP.monthEnd = (y, m) => GP.ymd(y, m, GP.daysInMonth(y, m));
  GP.weekday = (s) => ['일', '월', '화', '수', '목', '금', '토'][new Date(toUTC(s)).getUTCDay()];
  GP.dateRange = (a, b) => { const out = []; for (let d = a; d <= b; d = GP.addDays(d, 1)) out.push(d); return out; };
  GP.md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  GP.round = (x, k = 0) => { const p = 10 ** k; return Math.round(x * p) / p; };
  GP.fmt = (x, k = 0) => (x == null || isNaN(x)) ? '' : Number(x).toLocaleString('ko-KR', { minimumFractionDigits: k, maximumFractionDigits: k });
  GP.sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

  // 계획 기간 관련 파생값
  GP.horizon = (P) => {
    const y0 = P.year, ms = P.months;
    // 연도 넘어가는 분기(예: 12,1,2) 지원: 월이 작아지면 다음 해
    const ym = []; let y = y0;
    ms.forEach((m, i) => { if (i > 0 && m < ms[i - 1]) y += 1; ym.push([y, m]); });
    const D0 = GP.ymd(ym[0][0], ym[0][1], 1);
    const D1 = GP.monthEnd(ym[ym.length - 1][0], ym[ym.length - 1][1]);
    return { ym, D0, D1, days: GP.dateRange(D0, D1) };
  };
  // 캘린더 이벤트 구분: 강종 전환(M/C·정기수리 후 재가동) vs 설비정지·실적 미달
  GP.isSwitch = (c) => !!(c && c.event) && /^(M\/C|S\/D 재가동)/.test(c.event);
  GP.isDown = (c) => !!(c && c.event) && /추가정지|실적 미달/.test(c.event);
  GP.isBlackout = (P, line, d) => P.shutdowns.some((s) => s.line === line && s.start <= d && d <= s.end);
  // 라인별 S/D 재가동일(정기수리 끝난 다음날, 기간 안인 것만)
  GP.restartDays = (P, H) => {
    const out = {};
    for (const s of P.shutdowns) {
      const r = GP.addDays(s.end, 1);
      if (r > H.D0 && r <= H.D1 && !GP.isBlackout(P, s.line, r)) out[`${s.line}|${r}`] = { line: s.line, day: r, sd: s };
    }
    return out;
  };
  GP.rateFor = (P, line, alloy, cls, b) => {
    if (b && b.rate && b.rate[line]) return b.rate[line];   // 11/10: 묶음별 속도(주문 두께·폭) — 서버 엔진 util.rate_for 와 같음
    const k1 = `${line}|${alloy}|${cls}`, k2 = `${line}|${P.alloyFamily[alloy]}|${cls}`;
    if (P.rateDept[k1] != null) return P.rateDept[k1];
    if (P.rateDept[k2] != null) return P.rateDept[k2];
    const b = P.rateBase[`${line}|${alloy}`];
    if (b == null) throw new Error(`속도 없음: ${line} ${alloy} ${cls}`);
    return b;
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
