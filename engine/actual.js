/* 실적 입력(엑셀) ↔ 재계획 입력. 사내 MES 연동 시 이 형식으로 API 결과를 넣으면 된다.
   시트 '실적'    : 날짜 | 라인 | 세부강종 | 부서 | 마감일 | 생산량(t)   — 마감일 비면 같은 부서·강종의 가장 이른 미완료 마감에 배정
   시트 '설비정지': 라인 | 시작일 | 종료일 | 분/일(비우면 종일)        — 기준일 이후 예정 정지
   시트 '현재상태': 라인 | 강종                                        — 기준일 마지막 강종(비우면 계획 기준) */
(function (root) {
  const GP = root.GP || (root.GP = {});
  const toStr = (v) => {
    if (v == null) return '';
    if (v instanceof Date) return GP.ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
    if (typeof v === 'object' && 'result' in v) return toStr(v.result);
    if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
    return String(v).trim();
  };
  const toDate = (v) => {
    const s = toStr(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})/.exec(s);
    if (m) return GP.ymd(+m[1], +m[2], +m[3]);
    if (typeof v === 'number' && v > 30000) { const d = new Date(Math.round((v - 25569) * 86400000)); return GP.ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return '';
  };

  GP.buildActualTemplate = function (ExcelJS, R, t0) {
    const wb = new ExcelJS.Workbook();
    const hdr = (ws, cols) => { ws.addRow(cols); ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; };
    const w1 = wb.addWorksheet('실적');
    hdr(w1, ['날짜', '라인', '세부강종', '부서', '마감일', '생산량(t)']);
    for (const [d, l, a, c, t, du] of R.rows.filter((r) => r[0] <= t0)) w1.addRow([d, l, a, c, du, t]);
    [11, 7, 9, 11, 11, 11].forEach((w, i) => { w1.getColumn(i + 1).width = w; });
    const w2 = wb.addWorksheet('설비정지');
    hdr(w2, ['라인', '시작일', '종료일', '분/일(비우면 종일)']);
    [7, 11, 11, 18].forEach((w, i) => { w2.getColumn(i + 1).width = w; });
    const w3 = wb.addWorksheet('현재상태');
    hdr(w3, ['라인', '강종']);
    for (const l of R.P.lines) { const c = R.cal.find((x) => x.line === l && x.date === t0); w3.addRow([l, c ? c.fam : '']); }
    const w4 = wb.addWorksheet('설명');
    [`기준일 ${t0}까지 기존 계획을 그대로 채운 양식입니다. 실제와 다른 날만 고치세요(설비고장·불량으로 못 만든 물량은 줄이거나 행 삭제).`,
      '실적: 마감일은 계획의 부서·강종·마감일 묶음입니다. 모르면 비워두면 가장 이른 미완료 마감에 배정합니다.',
      '설비정지: 기준일 이후 예정된 정지(수리·고장 복구 등). 분/일을 비우면 종일 정지.',
      '현재상태: 기준일 마지막 코일의 강종(AL/AZ/MAC).',
      '사내 MES 연동 시 이 세 시트를 API 결과로 자동 생성하면 됩니다.'].forEach((t) => w4.addRow([t]));
    w4.getColumn(1).width = 120;
    return wb;
  };

  /* 반환 {t0, rows, state, extraDown, notes, checks} */
  GP.parseActualWorkbook = function (wb, R, t0Given) {
    const P = R.P, checks = [], rows = [], extraDown = {}, notes = [];
    const ws = GP.findSheet([wb], '실적');
    if (!ws) return { checks: [{ level: 'error', msg: "'실적' 시트 없음" }] };
    const raw = [];
    ws.eachRow((row, r) => {
      if (r === 1) return;
      const d = toDate(row.getCell(1).value), l = toStr(row.getCell(2).value), a = toStr(row.getCell(3).value), c = toStr(row.getCell(4).value);
      const du = toDate(row.getCell(5).value), t = +toStr(row.getCell(6).value).replace(/,/g, '');
      if (!d && !l) return;
      if (!d || !P.lines.includes(l) || !P.alloyFamily[a] || !GP.DEPTS_ALL.includes(c) || !(t > 0)) { checks.push({ level: 'warn', msg: `실적 ${r}행 해석 불가 — 제외 (${[d, l, a, c, t].join(', ')})` }); return; }
      raw.push({ d, l, a, c, du, t });
    });
    const t0 = t0Given || raw.reduce((m, x) => (x.d > m ? x.d : m), '');
    if (!t0) return { checks: checks.concat([{ level: 'error', msg: '실적 행이 없음' }]) };
    // 마감일 빈 행 → 같은 부서·강종의 가장 이른 미완료 버킷
    const left = {}; for (const b of R.buckets) left[`${b.cls}|${b.alloy}|${b.due}`] = b.orig;
    for (const x of raw.filter((x) => x.du)) { const k = `${x.c}|${x.a}|${x.du}`; if (!(k in left)) checks.push({ level: 'warn', msg: `실적 ${x.d} ${x.l} ${x.c} ${x.a}: 마감일 ${x.du} 묶음이 계획에 없음 — 그대로 반영` }); left[k] = (left[k] || 0) - x.t; }
    for (const x of raw.filter((x) => !x.du).sort((p, q) => (p.d < q.d ? -1 : 1))) {
      let t = x.t;
      for (const b of R.buckets.filter((b) => b.cls === x.c && b.alloy === x.a).sort((p, q) => (p.due < q.due ? -1 : 1))) {
        const k = `${b.cls}|${b.alloy}|${b.due}`, take = Math.min(t, Math.max(0, left[k]));
        if (take > 0) { raw.push({ d: x.d, l: x.l, a: x.a, c: x.c, du: b.due, t: take }); left[k] -= take; t -= take; }
        if (t <= 1e-6) break;
      }
      if (t > 1e-6) checks.push({ level: 'warn', msg: `실적 ${x.d} ${x.l} ${x.c} ${x.a} ${GP.fmt(t)}t: 배정할 미완료 수요 없음(초과 생산)` });
    }
    for (const x of raw) if (x.du && x.d <= t0) rows.push([x.d, x.l, x.a, x.c, GP.round(x.t, 2), x.du]);
    const w2 = GP.findSheet([wb], '설비정지');
    if (w2) w2.eachRow((row, r) => {
      if (r === 1) return;
      const l = toStr(row.getCell(1).value), a = toDate(row.getCell(2).value), b = toDate(row.getCell(3).value) || a, m = +toStr(row.getCell(4).value) || 0;
      if (!l && !a) return;
      if (!P.lines.includes(l) || !a) { checks.push({ level: 'warn', msg: `설비정지 ${r}행 해석 불가 — 제외` }); return; }
      for (const d of GP.dateRange(a, b)) if (d > t0) extraDown[`${l}|${d}`] = (extraDown[`${l}|${d}`] || 0) + (m || 1440);
      notes.push(`${l} ${GP.md(a)}~${GP.md(b)} 설비정지 예정${m ? ` ${GP.fmt(m)}분/일` : '(종일)'}`);
    });
    const state = {};
    const w3 = GP.findSheet([wb], '현재상태');
    if (w3) w3.eachRow((row, r) => { if (r > 1) { const l = toStr(row.getCell(1).value), f = toStr(row.getCell(2).value); if (P.lines.includes(l) && P.lineFamilies[l].includes(f)) state[l] = f; } });
    for (const l of P.lines) if (!state[l]) {
      const last = rows.filter((r) => r[1] === l && r[0] === t0);
      const c = R.cal.find((x) => x.line === l && x.date === t0);
      state[l] = last.length ? P.alloyFamily[last[0][2]] : (c ? c.fam : P.initFamily[l]);
    }
    // 계획 대비 실적 차이 요약
    const planT = GP.sum(R.rows.filter((r) => r[0] <= t0), (r) => r[4]), actT = GP.sum(rows, (r) => r[4]);
    notes.unshift(`실적 ${GP.md(t0)}까지: ${GP.fmt(actT)}t (계획 ${GP.fmt(planT)}t, 차이 ${GP.fmt(actT - planT)}t)`);
    checks.push({ level: 'info', msg: `실적 ${rows.length}행, 기준일 ${t0}, 현재 강종 ` + P.lines.map((l) => `${l} ${state[l]}`).join('·') });
    return { t0, rows, state, extraDown, notes, checks };
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
