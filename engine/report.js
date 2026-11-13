/* 결과 분석(부하·캠페인·선생산) + 설명 문구 자동 생성 + 엑셀(ExcelJS) 작성.
   원본: gadong-plan code/build_final_v4.py, build_asis_part.py (문구는 하드코딩 → 계산값으로 자동 생성) */
(function (root) {
  const GP = root.GP || (root.GP = {});
  const DEPTS = ['도금수출', '자동차수출', '도금국내', '자동차내수', '자가재'];
  GP.DEPTS = DEPTS;
  const famOrder = (P, l) => P.lineFamilies[l].slice().sort((a, b) => (a === 'AL') - (b === 'AL'));   // AL을 아래로
  GP.famOrder = famOrder;
  const FAMLABEL = { AL: 'A L', AZ: 'A Z', MAC: 'MACOSTA' };
  GP.FAMLABEL = FAMLABEL;

  function winLabel(cls, due, win) {
    const m = +due.slice(5, 7);
    if (!['도금수출', '자동차수출'].includes(cls)) return `${m}월 월말`;
    if (win === '1~30일') return `${m}월 중 수시(F.TERM)`;
    return `${m}월 ${win} 선적`;
  }
  GP.winLabel = winLabel;

  GP.analyze = function (R) {
    const P = R.P, H = GP.horizon(P), L = P.lines, FAM = P.alloyFamily;
    const mIdx = (d) => H.ym.findIndex(([y, m]) => +d.slice(0, 4) === y && +d.slice(5, 7) === m);
    const used = {}, prodLD = {};
    for (const [d, l, a, c, t] of R.rows) {
      const k = `${l}|${d}`;
      used[k] = (used[k] || 0) + t / GP.rateFor(P, l, a, c);
      prodLD[k] = (prodLD[k] || 0) + t;
    }
    const calBy = {}; for (const c of R.cal) calBy[`${c.line}|${c.date}`] = c;
    // 월별 부하 = 소요시간 ÷ 가동가능시간(정기수리일 제외)
    const load = {}, capM = {}, usedM = {}, idle = [];
    for (const c of R.cal) {
      const k = `${c.line}|${mIdx(c.date)}`;
      if (c.blackout) continue;
      capM[k] = (capM[k] || 0) + c.cap; usedM[k] = (usedM[k] || 0) + (used[`${c.line}|${c.date}`] || 0);
      if ((used[`${c.line}|${c.date}`] || 0) < 1 && !GP.isDown(c)) idle.push([c.date, c.line]);
    }
    for (const k of Object.keys(capM)) load[k] = usedM[k] / capM[k];
    const events = R.cal.filter((c) => GP.isSwitch(c)).map((c) => {
      const m = /\((.+)→(.+)\)/.exec(c.event);
      return { date: c.date, line: c.line, kind: c.event.startsWith('M/C') ? 'M/C' : 'S/D 재가동', from: m ? m[1] : c.fam, to: m ? m[2] : c.fam, loss: c.mcdummy, event: c.event.split(' · ')[0] };
    }).sort((a, b) => (a.date + a.line < b.date + b.line ? -1 : 1));
    const mc = Object.fromEntries(L.map((l) => [l, events.filter((e) => e.line === l && (e.kind === 'M/C' || e.from !== e.to)).length]));
    // 캠페인: 정기수리일을 끊는 기준으로 같은 강종 연속 가동일
    const campaigns = [];
    for (const l of L) {
      let cur = null;
      for (const d of H.days) {
        const c = calBy[`${l}|${d}`];
        if (c.blackout) { cur = null; continue; }
        if (!cur || cur.fam !== c.fam) { cur = { line: l, fam: c.fam, start: d, end: d, tons: 0, by: {} }; campaigns.push(cur); }
        cur.end = d;
      }
    }
    const campOf = (l, d) => campaigns.find((c) => c.line === l && c.start <= d && d <= c.end);
    for (const [d, l, a, c, t, du] of R.rows) {
      const cp = campOf(l, d); cp.tons += t;
      const k = `${c}|${a}|${du}`; cp.by[k] = (cp.by[k] || 0) + t;
    }
    const early = R.rows.filter((r) => mIdx(r[0]) < mIdx(r[5]));
    const S = (R.replan && R.replan.sts) || {}, sref = S.ref || {};          // AL-STS 지연 = 칸 끝 기준(11/13 macRule)
    const late = R.rows.filter((r) => r[0] > ((r[2] === S.alloy && sref[`${r[3]}|${r[5]}`]) || r[5]));
    const earlyT = GP.sum(early, (r) => r[4]), lateT = GP.sum(late, (r) => r[4]);
    const demand = GP.sum(R.buckets, (b) => b.orig), prod = GP.sum(R.rows, (r) => r[4]);
    // 화면 가동시간(분): 하루 1,440분을 넘지 않게. 실적 날은 MES 실제 가동시간(actMin, 화면이 도금 실적 자료로 채움)을 우선, 없으면 생산 t ÷ 계획 속도(최대 1,440)
    const dayMin = function (l, d) { const a = this.actMin && this.actMin[`${l}|${d}`]; return Math.min(1440, a != null ? a : (used[`${l}|${d}`] || 0)); };
    return { dayMin, actMin: null, H, mIdx, used, prodLD, calBy, load, capM, usedM, idle, events, mc, campaigns, campOf, early, earlyT, late, lateT, demand, prod, short: Math.max(0, demand - prod) };
  };

  const topBy = (by, n) => Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, n);
  const descKey = (k, t) => { const [c, a, du] = k.split('|'); return `${c} ${a} ${GP.md(du)} 마감 ${GP.fmt(t)}t`; };

  /* 전환 이유: 전환 전후 캠페인의 실제 생산 내역으로 작성 */
  GP.eventReason = function (R, A, e) {
    const P = R.P;
    const after = A.campaigns.find((c) => c.line === e.line && c.start === e.date);
    const before = A.campaigns.filter((c) => c.line === e.line && c.end < e.date).pop();
    const parts = [];
    if (e.kind === 'S/D 재가동') {
      parts.push(e.from === e.to
        ? `정기수리 전과 같은 ${e.to}로 재가동 — 재가동 더미 ${P.restartSame[e.line]}분(강종을 바꾸면 ${P.restartFamchg[e.line]}분).`
        : `정기수리 후 ${e.to}로 바꿔 재가동 — 재가동 더미 ${P.restartFamchg[e.line]}분(같은 강종이면 ${P.restartSame[e.line]}분). ${e.to} 물량 마감이 더 급해 강종 변경이 M/C 한 번보다 유리.`);
    } else if (before) {
      parts.push(`${e.from} 캠페인(${GP.md(before.start)}~${GP.md(before.end)}, ${GP.fmt(before.tons)}t) 종료.`);
    }
    if (after) {
      const firstDue = Object.keys(after.by).map((k) => k.split('|')[2]).sort()[0];
      parts.push(`${e.to} 캠페인 ${GP.md(after.start)}~${GP.md(after.end)} ${GP.fmt(after.tons)}t: ` + topBy(after.by, 3).map(([k, t]) => descKey(k, t)).join(', ') + (Object.keys(after.by).length > 3 ? ' 등' : '') + '.');
      if (firstDue && e.kind === 'M/C') parts.push(`${e.to} 첫 마감 ${GP.md(firstDue)}.`);
    }
    return parts.join(' ');
  };

  /* 선생산 이유: 납기월에 그 라인이 그 강종을 얼마나 돌리는지·부하로 판정 */
  GP.earlyReasons = function (R, A) {
    const P = R.P, agg = {};
    for (const [d, l, a, c, t, du] of A.early) {
      const k = `${l}|${a}|${c}|${A.mIdx(d)}|${du}`;
      agg[k] = (agg[k] || 0) + t;
    }
    return Object.entries(agg).sort().map(([k, t]) => {
      const [l, a, c, pm, du] = k.split('|');
      const f = P.alloyFamily[a], dm = A.mIdx(du), [, mm] = A.H.ym[dm];
      const fd = R.cal.filter((x) => x.line === l && A.mIdx(x.date) === dm && !x.blackout && x.fam === f && x.date <= du);
      const famDays = fd.length;
      const famLoad = famDays ? GP.sum(fd, (x) => A.used[`${l}|${x.date}`] || 0) / GP.sum(fd, (x) => x.cap) : 0;
      const ld = A.load[`${l}|${dm}`] || 0;
      const cp = A.campaigns.filter((x) => x.line === l && x.fam === f && A.mIdx(x.start) <= +pm && A.mIdx(x.end) >= +pm).map((x) => `${GP.md(x.start)}~${GP.md(x.end)}`).join(', ');
      let why;
      if (famDays === 0) why = `M/C 절감: ${mm}월 마감(${GP.md(du)}) 전 ${l}의 ${f} 생산일 없음(타 강종 캠페인·정기수리) → ${f} 캠페인(${cp})에서 선행 생산.`;
      else if (ld >= 0.995) why = `능력 부족: ${mm}월 ${l} 부하 ${GP.fmt(ld * 100, 1)}% — 마감 전 ${f} 생산일 ${famDays}일로 부족하여 전월 ${f} 캠페인(${cp})에서 선행 생산.`;
      else if (famLoad >= 0.99) why = `캠페인 능력 부족: ${mm}월 ${l} ${f} 생산일은 ${GP.md(fd[0].date)}~${GP.md(fd[fd.length - 1].date)} ${famDays}일(그 기간 부하 ${GP.fmt(famLoad * 100, 1)}%)에 그쳐 ${mm}월 ${f} 물량 충족 불가 — ${f} 추가 전환 없이 전월 ${f} 캠페인(${cp})에서 선행 생산.`;
      else why = `평준화(유휴 방지): 납기월 ${f} 생산일 ${famDays}일은 여유가 있으나(해당 기간 부하 ${GP.fmt(famLoad * 100, 1)}%), 전월 ${f} 캠페인(${cp})의 일 여유시간을 ${R.slack && R.slack[l] != null ? GP.fmt(R.slack[l]) + '분' : '최소 수준'} 이하로 유지하기 위해 주문 확정 범위(마감 ${P.releaseDays}일 전) 내 물량을 선행 생산. 선생산 축소 시 전월 여유시간 허용 필요.`;
      return { line: l, alloy: a, cls: c, prodMonth: A.H.ym[+pm][1], due: du, tons: t, why };
    });
  };

  GP.summaryLines = function (R, A) {
    const P = R.P, L = P.lines;
    const evTxt = (l) => A.events.filter((e) => e.line === l && e.kind === 'M/C').map((e) => `${GP.md(e.date)} ${e.from}→${e.to}`).join(', ') || '없음';
    const rst = A.events.filter((e) => e.kind === 'S/D 재가동').map((e) => `${GP.md(e.date)} ${e.line} ${e.from === e.to ? `${e.to} 유지(더미 ${e.loss}분)` : `${e.from}→${e.to}(더미 ${e.loss}분)`}`);
    const lines = [
      `• M/C 합계 ${GP.sum(L, (l) => A.mc[l])}회: ` + L.map((l) => `${l} ${A.mc[l]}회(${evTxt(l)})`).join(' / ') + (rst.length ? `. S/D 재가동: ${rst.join(', ')}` : ''),
      `• 결품 ${GP.fmt(A.short)}t, 지연 ${GP.fmt(A.lateT)}t (수출은 선적창 마지막날, 그 외 월말 기준). 유휴일 ${A.idle.length}일.`,
      `• 전월 선생산 ${GP.fmt(A.earlyT)}t — 사유는 "선생산_사유" 시트.`,
      `• 부하: ` + L.map((l) => `${l} ` + A.H.ym.map((_, i) => `${GP.fmt((A.load[`${l}|${i}`] || 0) * 100, 1)}%`).join('/')).join(', '),
      `• 전제: ① 첫 달 1~5일 선적분 ${GP.fmt(GP.sum(R.sept, (s) => s.tons))}t은 전월 생산${P.firstWindowPrevMonth ? '' : '(미적용)'} ② 첫날 강종 ` + L.map((l) => `${l} ${P.initFamily[l] || '자유'}`).join('·') + ` ③ 주문재는 마감 ${P.releaseDays}일 전부터 생산 가능 ④ 정기수리 ` + (P.shutdowns.map((s) => `${s.line} ${GP.md(s.start)}~${GP.md(s.end)}`).join(', ') || '없음'),
    ];
    if (R.replan) {
      const rp = R.replan, ev = (x) => { const [d, l, e] = x.split('|'); return `${GP.md(d)} ${l} ${e}`; };
      lines.unshift(`• 재계획: ${GP.md(rp.t0)}까지 실적 반영(${rp.notes.join(' / ')}). 전환 변경 — 취소 ${rp.removed.map(ev).join(', ') || '없음'}, 신규 ${rp.added.map(ev).join(', ') || '없음'}. 납기 지연 ${GP.fmt(GP.dueLate ? GP.dueLate(R) : rp.late)}톤·일.`);
      if (GP.lockLines) GP.lockLines(rp).reverse().forEach((t) => lines.splice(1, 0, '• ' + t));
    }
    if (!R.milp.optimal1 || !R.milp.optimal2) lines.push('• ⚠ 시간 제한으로 최적성 증명 전에 멈춘 단계가 있음 — 결과는 그때까지 찾은 최선해(다시 실행하면 달라질 수 있음).');
    return lines;
  };

  // ---------------- 엑셀 ----------------
  const AR = 'Arial';
  const F9 = { name: AR, size: 9 }, F9B = { name: AR, size: 9, bold: true }, FT = { name: AR, size: 13, bold: true };
  const FN = { name: AR, size: 9, italic: true, color: { argb: 'FF7F6000' } };
  const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
  const HF = fill('1F3864'), HFONT = { name: AR, size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  const MCF = fill('FFF36B'), SDF = fill('C7C7C0'), SUBF = fill('EEF0F2'), SAT = fill('F4C07A'), SUN = fill('F2A3A3');
  const DOWNF = fill('F4CCCC'), JAF = fill('DDEBF7'), DML = fill('D9D9D9'), DMH = fill('F8CBAD'), EARLYF = fill('FCE4D6');
  const th = { style: 'thin', color: { argb: 'FFBFBFBF' } }, BD = { top: th, left: th, bottom: th, right: th };
  const CEN = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const LEFT = { horizontal: 'left', vertical: 'top', wrapText: true };
  const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));

  function put(ws, r, c, v, st = {}) {
    const cell = ws.getCell(r, c);
    cell.value = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? toDate(v) : v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) cell.numFmt = 'yyyy-mm-dd';
    cell.font = st.font || F9;
    if (st.border !== false) cell.border = BD;
    if (st.fill) cell.fill = st.fill;
    if (st.fmt) cell.numFmt = st.fmt;
    cell.alignment = st.align || CEN;
    return cell;
  }
  function title(ws, r, text, font = FT, span = 8) {
    const c = ws.getCell(r, 1); c.value = text; c.font = font; c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: span > 1 };
    if (span > 1) ws.mergeCells(r, 1, r, span);
    if (span > 1 && text.length > span * 12) ws.getRow(r).height = 15 * Math.ceil(text.length / (span * 12));
  }
  function hdr(ws, r, cols, h = 30) {
    cols.forEach((t, i) => put(ws, r, i + 1, t, { font: HFONT, fill: HF }));
    ws.getRow(r).height = h;
  }
  const widths = (ws, ws_) => ws_.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  GP.buildWorkbook = function (ExcelJS, R, meta = {}) {
    const P = R.P, A = GP.analyze(R), L = P.lines, H = A.H, FAM = P.alloyFamily;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CGL 가동계획 웹'; wb.created = new Date();
    const qLabel = `'${String(H.ym[0][0]).slice(2)}.${H.ym.map(([, m]) => m).join('·')}월`;
    const NUM = '#,##0;-#,##0;-', NUM1 = '#,##0.0;-#,##0.0;-';

    // 요약
    const w0 = wb.addWorksheet('요약');
    title(w0, 1, `${qLabel} 도금공장 가동계획 요약`, { name: AR, size: 15, bold: true }, 8);
    let r = 3;
    for (const t of GP.summaryLines(R, A)) { title(w0, r, t, r < 5 ? F9B : F9, 8); r++; }
    if (meta.asOf) { title(w0, r, `입력 판매계획 기준일: ${meta.asOf}   |   생성: ${new Date().toLocaleString('ko-KR')}`, FN, 8); r++; }
    r++;
    title(w0, r, '■ 월별 라인×강종 생산량(t) — 생산일 기준', F9B, 6); r++;
    hdr(w0, r, ['라인', '강종'].concat(H.ym.map(([, m]) => `${m}월`), ['분기'])); r++;
    const prodLAm = {};
    for (const [d, l, a, c, t] of R.rows) { const k = `${l}|${a}|${A.mIdx(d)}`; prodLAm[k] = (prodLAm[k] || 0) + t; }
    const r0 = r, colTot = new Array(H.ym.length + 1).fill(0);
    for (const l of L) for (const a of P.allowed[l]) {
      put(w0, r, 1, l); put(w0, r, 2, a);
      let s = 0; H.ym.forEach((_, i) => { const v = prodLAm[`${l}|${a}|${i}`] || 0; s += v; colTot[i] += v; put(w0, r, 3 + i, GP.round(v, 1), { fmt: NUM }); });
      colTot[H.ym.length] += s; put(w0, r, 3 + H.ym.length, GP.round(s, 1), { fmt: NUM }); r++;
    }
    put(w0, r, 2, '합계', { font: F9B }); colTot.forEach((v, i) => put(w0, r, 3 + i, GP.round(v, 1), { fmt: NUM, font: F9B })); r += 2;
    title(w0, r, '■ 월별 부하(소요시간 ÷ 가동가능시간, 정기수리일 제외)', F9B, 6); r++;
    hdr(w0, r, ['라인'].concat(H.ym.map(([, m]) => `${m}월`), ['M/C 횟수'])); r++;
    for (const l of L) {
      put(w0, r, 1, l);
      H.ym.forEach((_, i) => { const v = A.load[`${l}|${i}`] || 0; put(w0, r, 2 + i, v, { fmt: '0.0%', font: v >= 0.995 ? { name: AR, size: 9, bold: true, color: { argb: 'FFC00000' } } : F9 }); });
      put(w0, r, 2 + H.ym.length, A.mc[l]); r++;
    }
    r++;
    title(w0, r, '■ 부서별 요구량 vs 배분(t) — 납기월 기준', F9B, 6); r++;
    hdr(w0, r, ['부서', '요구량(파일)', '전월 생산 가정', '계획 배분', '차이']); r++;
    for (const dep of DEPTS) {
      const dem = GP.sum(R.items.filter((i) => i.cls === dep), (i) => i.tons);
      const sp = GP.sum(R.sept.filter((i) => i.cls === dep), (i) => i.tons);
      const al = GP.sum(R.rows.filter((x) => x[3] === dep), (x) => x[4]);
      [dep, GP.round(dem, 1), GP.round(sp, 1), GP.round(al, 1), GP.round(al + sp - dem, 0)].forEach((v, j) => put(w0, r, 1 + j, v, { fmt: j ? '#,##0;-#,##0;0' : undefined }));
      r++;
    }
    r++;
    title(w0, r, '■ 여유 캐파(평준화 후 남는 시간, 분)', F9B, 6); r++;
    for (const l of L) {
      const sl = GP.sum(R.cal.filter((c) => c.line === l && !c.blackout), (c) => c.cap - (A.used[`${l}|${c.date}`] || 0));
      put(w0, r, 1, `${l} 여유시간 합`); w0.mergeCells(r, 1, r, 2); put(w0, r, 3, GP.round(sl), { fmt: '#,##0' }); r++;
    }
    const warns = (meta.checks || []).filter((c) => c.level !== 'info');
    if (warns.length) { r++; title(w0, r, `■ 입력 검증 경고 ${warns.length}건 — "입력검증" 시트 확인`, { name: AR, size: 9, bold: true, color: { argb: 'FFC00000' } }, 8); r++; }
    widths(w0, [14, 12, 12, 12, 12, 12, 10, 10]);

    // 일별상세_납기별
    const wd = wb.addWorksheet('일별상세_납기별', { views: [{ state: 'frozen', ySplit: 4 }] });
    title(wd, 1, '일별 생산 상세 — 어떤 날, 어느 라인이, 어느 부서·목적지의 어떤 납기 물량을 만드는지', FT, 17);
    title(wd, 2, '목적지: 수출=판매계획 권역(대표 항구는 배선일정 기준) / 도금국내=용도 / 자동차내수=고객군 / 자가재=컬러 섹션. 마감일: 수출=선적창 마지막날, 그 외=월말. t/hr=라인×강종×부서 실적속도.', FN, 17);
    hdr(wd, 4, ['날짜', '요일', '라인', '강종군', '세부강종', '부서', '목적지', '대표 항구', '생산량(t)', 't/hr', '소요시간(분)', '마감일', '선적창/납기', '마감까지(일)', '생산월', '납기월', '구분']);
    r = 5;
    for (const [d, l, a, c, dest, port, win, t, du] of R.dest) {
      const rt = GP.rateFor(P, l, a, c) * 60;
      const kind = A.mIdx(d) < A.mIdx(du) ? '선생산(전월)' : (d > du ? '지연' : '당월');
      const self = c === '자가재';
      const st = { font: self ? F9B : F9, fill: self ? JAF : (kind !== '당월' ? EARLYF : undefined) };
      [d, GP.weekday(d), l, FAM[a], a, c, dest, port, t, GP.round(rt, 1), GP.round(t / rt * 60, 0), du, winLabel(c, du, win), GP.diffDays(du, d), +d.slice(5, 7), +du.slice(5, 7), kind]
        .forEach((v, j) => put(wd, r, j + 1, v, Object.assign({}, st, { fmt: j === 8 ? '#,##0.0' : j === 9 ? '0.0' : j === 10 ? '#,##0' : undefined })));
      r++;
    }
    wd.autoFilter = { from: { row: 4, column: 1 }, to: { row: r - 1, column: 17 } };
    widths(wd, [11, 5, 7, 7, 8, 10, 18, 22, 10, 7, 9, 11, 18, 9, 7, 7, 12]);

    // 일별계획
    const wp = wb.addWorksheet('일별계획', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
    title(wp, 1, `${qLabel} 도금공장 일별 가동계획`, FT, 12);
    title(wp, 2, '라인×일 1행. 가동가능(분)=1440−정기수리−설비정지−비강종더미−M/C·재가동더미. 여유시간=가동가능−소요시간.', FN, 12);
    const cols = ['날짜', '요일', '월', '라인', '강종', '이벤트', '정기수리(분)', '설비정지(분)', '비강종더미(분)', 'M/C·재가동\n더미(분)', '가동가능(분)'].concat(DEPTS.map((x) => `${x}(t)`), ['생산합계(t)', '소요시간(분)', '여유시간(분)', '가동률', '선생산(전월)(t)', 't/hr']);
    hdr(wp, 4, cols, 34);
    const depLD = {}, earlyLD = {};
    for (const [d, l, a, c, t, du] of R.rows) {
      depLD[`${l}|${d}|${c}`] = (depLD[`${l}|${d}|${c}`] || 0) + t;
      if (A.mIdx(d) < A.mIdx(du)) earlyLD[`${l}|${d}`] = (earlyLD[`${l}|${d}`] || 0) + t;
    }
    r = 5;
    for (const c of R.cal.slice().sort((a, b) => (a.date + a.line < b.date + b.line ? -1 : 1))) {
      const k = `${c.line}|${c.date}`, u = A.used[k] || 0, p = A.prodLD[k] || 0;
      const st = { fill: c.blackout ? SDF : GP.isSwitch(c) ? MCF : GP.isDown(c) ? DOWNF : undefined };
      const vals = [c.date, GP.weekday(c.date), +c.date.slice(5, 7), c.line, c.blackout ? '' : c.fam, c.event, c.blackout, GP.round(c.equip, 2), GP.round(c.nonfam, 2), c.mcdummy, GP.round(c.cap, 1)]
        .concat(DEPTS.map((dp) => GP.round(depLD[`${k}|${dp}`] || 0, 1)), [GP.round(p, 1), GP.round(u, 1), c.cap > 0 ? GP.round(c.cap - u, 1) : 0, c.cap > 0 ? u / c.cap : '', GP.round(earlyLD[k] || 0, 1), u > 0 ? GP.round(p / (u / 60), 1) : '']);
      vals.forEach((v, j) => put(wp, r, j + 1, v, Object.assign({}, st, { fmt: j === 19 ? '0%' : j === 21 ? '0.0' : (j >= 6 ? NUM : undefined) })));
      r++;
    }
    wp.autoFilter = { from: { row: 4, column: 1 }, to: { row: r - 1, column: cols.length } };
    widths(wp, [11, 5, 4, 7, 6, 20, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 9, 9, 7, 10, 7]);

    // 가동계획(회사 양식: 월별 일자 가로형)
    const wg = wb.addWorksheet('가동계획', { views: [{ state: 'frozen', xSplit: 2 }] });
    wg.getColumn(1).width = 8; wg.getColumn(2).width = 13;
    for (let j = 3; j <= 33; j++) wg.getColumn(j).width = 6.3;
    wg.getColumn(34).width = 9;
    title(wg, 1, `${qLabel} 도금공장 가동계획(안)`, { name: AR, size: 14, bold: true }, 20);
    title(wg, 2, '굵은 글씨·파란 배경 = 자가재(“└ 자가재(t)” 행). 노란색 = M/C·S/D 재가동일. 회색 = 정기수리(S/D). 더미시간: 연회색 = 비강종 더미, 주황 = M/C·재가동 더미. 생산가능시간 = 총시간 − 설비정지 − 더미시간. t/hr = 생산량 ÷ 실가동시간.', FN, 34);
    r = 4;
    const famLD = {}, selfLD = {};
    for (const [d, l, a, c, t] of R.rows) {
      famLD[`${l}|${d}|${FAM[a]}`] = (famLD[`${l}|${d}|${FAM[a]}`] || 0) + t;
      if (c === '자가재') selfLD[`${l}|${d}`] = (selfLD[`${l}|${d}`] || 0) + t;
    }
    H.ym.forEach(([y, m], mi) => {
      const nd = GP.daysInMonth(y, m);
      title(wg, r, `■ '${String(y).slice(2)}.${m}월 도금공장 가동계획(안)`, { name: AR, size: 12, bold: true }, 20);
      const evs = A.events.filter((e) => A.mIdx(e.date) === mi).map((e) => `${e.line} ${+e.date.slice(8)}일 ${e.event}`);
      let cap = evs.join('   |   ') || '강종전환 없음';
      if (mi === 0 && P.firstWindowPrevMonth) cap += `   |   ${m}/1~5 선적분(${GP.fmt(GP.sum(R.sept, (s) => s.tons))}t)은 전월 생산 가정`;
      title(wg, r + 1, cap, { name: AR, size: 9, bold: true, color: { argb: 'FF8A4B00' } }, 34);
      const h1 = r + 2, h2 = r + 3;
      put(wg, h1, 1, '라인', { font: F9B, fill: SUBF }); put(wg, h1, 2, '구분', { font: F9B, fill: SUBF });
      put(wg, h2, 1, '', { fill: SUBF }); put(wg, h2, 2, '', { fill: SUBF });
      wg.mergeCells(h1, 1, h2, 1); wg.mergeCells(h1, 2, h2, 2);
      for (let dd = 1; dd <= nd; dd++) {
        const wk = GP.weekday(GP.ymd(y, m, dd));
        put(wg, h1, 2 + dd, dd, { font: F9B, fill: SUBF });
        put(wg, h2, 2 + dd, wk, { font: F9B, fill: wk === '토' ? SAT : wk === '일' ? SUN : SUBF });
      }
      put(wg, h1, 34, '계', { font: F9B, fill: SUBF }); put(wg, h2, 34, '', { fill: SUBF }); wg.mergeCells(h1, 34, h2, 34);
      let rr = h2 + 1;
      for (const l of L) {
        const start = rr, fams = famOrder(P, l);
        const famRows = [];
        for (const f of fams) {
          put(wg, rr, 2, FAMLABEL[f] || f); let s = 0;
          for (let dd = 1; dd <= nd; dd++) {
            const d = GP.ymd(y, m, dd), v = famLD[`${l}|${d}|${f}`] || 0; s += v;
            put(wg, rr, 2 + dd, v > 0.5 ? Math.round(v) : '', { font: (selfLD[`${l}|${d}`] || 0) > 0.5 ? F9B : F9, fmt: NUM });
          }
          put(wg, rr, 34, Math.round(s), { font: F9B, fmt: '#,##0' }); famRows.push(rr); rr++;
        }
        const jaRow = rr; put(wg, rr, 2, '└ 자가재(t)', { font: F9B, fill: JAF }); let sj = 0;
        for (let dd = 1; dd <= nd; dd++) { const v = selfLD[`${l}|${GP.ymd(y, m, dd)}`] || 0; sj += v; put(wg, rr, 2 + dd, v > 0.5 ? Math.round(v) : '', { font: F9B, fill: JAF, fmt: NUM }); }
        put(wg, rr, 34, Math.round(sj), { font: F9B, fill: JAF, fmt: '#,##0' }); rr++;
        const labs = [['tot', '총시간(h)'], ['eq', '설비정지(h)'], ['dm', '더미시간(h)'], ['av', '생산가능시간(h)'], ['run', '실가동시간(h)'], ['tph', 't/hr']];
        const sums = {};
        for (const [key, lab] of labs) {
          put(wg, rr, 2, lab, { fill: SUBF, font: (key === 'av' || key === 'tph') ? F9B : F9 });
          sums[key] = 0;
          for (let dd = 1; dd <= nd; dd++) {
            const d = GP.ymd(y, m, dd), c = A.calBy[`${l}|${d}`];
            const u = (A.used[`${l}|${d}`] || 0) / 60, pr = A.prodLD[`${l}|${d}`] || 0;
            const v = { tot: 24 - c.blackout / 60, eq: c.equip / 60, dm: (c.nonfam + c.mcdummy) / 60, av: c.cap / 60, run: u, tph: u > 0 ? pr / u : null }[key];
            if (key !== 'tph') sums[key] += v;
            const st = { fmt: '0.0;-0.0;""', font: (key === 'av' || key === 'tph') ? F9B : F9 };
            if (key === 'dm' && !c.blackout) { st.fill = c.mcdummy ? DMH : DML; if (c.mcdummy) st.font = { name: AR, size: 9, bold: true, color: { argb: 'FF9C3D00' } }; }
            put(wg, rr, 2 + dd, v == null ? '' : GP.round(v, 1), st);
          }
          const tp = sums.run > 0 ? GP.sum(famRows, (fr) => wg.getCell(fr, 34).value || 0) / sums.run : '';
          put(wg, rr, 34, key === 'tph' ? (tp === '' ? '' : GP.round(tp, 1)) : GP.round(sums[key], 1), { font: F9B, fmt: '#,##0.0' });
          rr++;
        }
        put(wg, start, 1, l, { font: F9B }); for (let x = start + 1; x < rr; x++) put(wg, x, 1, '');
        wg.mergeCells(start, 1, rr - 1, 1);
        // M/C·재가동일 노란색, 정기수리 회색 블록
        const bo = [];
        for (let dd = 1; dd <= nd; dd++) {
          const d = GP.ymd(y, m, dd), c = A.calBy[`${l}|${d}`];
          if (c.blackout) { bo.push(2 + dd); continue; }
          if (GP.isSwitch(c)) {
            for (let x = start; x < rr; x++) if (x !== jaRow) wg.getCell(x, 2 + dd).fill = MCF;
            const mm = /\((.+)→/.exec(c.event);
            if (mm) fams.forEach((f, k) => { if (f === mm[1] && !wg.getCell(start + k, 2 + dd).value) wg.getCell(start + k, 2 + dd).value = c.event.startsWith('M/C') ? 'M/C' : '재가동'; });
          }
        }
        if (bo.length) {
          for (let x = start; x < rr; x++) for (const cc of bo) { wg.getCell(x, cc).value = null; wg.getCell(x, cc).fill = SDF; }
          const sd = P.shutdowns.find((s) => s.line === l && s.start <= GP.ymd(y, m, bo[0] - 2) && GP.ymd(y, m, bo[0] - 2) <= s.end);
          wg.mergeCells(start, bo[0], rr - 1, bo[bo.length - 1]);
          const c0 = wg.getCell(start, bo[0]);
          c0.value = `정기수리(S/D)\n${sd ? `${GP.md(sd.start)}~${GP.md(sd.end)}` : ''}`; c0.font = { name: AR, size: 10, bold: true, color: { argb: 'FF8A4B00' } }; c0.alignment = CEN;
        }
      }
      r = rr + 2;
    });

    // MC_SD일정
    const wm = wb.addWorksheet('MC_SD일정');
    title(wm, 1, '강종 전환(M/C)·정기수리(S/D) 일정과 사유 (계획 결과로 자동 작성)', FT, 6);
    hdr(wm, 3, ['일자', '라인', '구분', '전환', '더미·정지 손실(분)', '사유']);
    r = 4;
    for (const e of A.events) {
      [e.date, e.line, e.kind, e.from === e.to ? `${e.to} 유지` : `${e.from}→${e.to}`, e.loss, GP.eventReason(R, A, e)].forEach((v, j) => put(wm, r, j + 1, v, { align: j === 5 ? LEFT : CEN }));
      r++;
    }
    r++;
    for (const s of P.shutdowns) { title(wm, r, `${s.line} 정기수리(S/D): ${GP.md(s.start)}~${GP.md(s.end)} (${GP.diffDays(s.end, s.start) + 1}일)`, F9B, 6); r++; }
    title(wm, r, '첫날 강종: ' + L.map((l) => `${l} ${P.initFamily[l] || '자유(모델이 선택)'}`).join(', ') + '. 실제 전월 말 라인 상태와 다르면 첫 M/C가 달라지므로 파라미터를 고쳐 다시 계산.', FN, 6);
    widths(wm, [11, 7, 11, 11, 12, 95]);

    // 선생산_사유
    const we = wb.addWorksheet('선생산_사유');
    title(we, 1, '선행 생산 사유 — 납기월 이전 생산 물량과 사유 (자동 판정)', FT, 7);
    hdr(we, 3, ['라인', '세부강종', '부서', '생산월', '납기(마감일)', '물량(t)', '사유']);
    r = 4;
    const er = GP.earlyReasons(R, A);
    for (const x of er) { [x.line, x.alloy, x.cls, `${x.prodMonth}월`, x.due, GP.round(x.tons, 1), x.why].forEach((v, j) => put(we, r, j + 1, v, { align: j === 6 ? LEFT : CEN, fmt: j === 5 ? '#,##0.0' : undefined })); r++; }
    put(we, r, 5, '합계', { font: F9B }); put(we, r, 6, GP.round(A.earlyT, 1), { font: F9B, fmt: '#,##0.0' });
    widths(we, [7, 8, 10, 7, 11, 10, 95]);

    // 수요대사: 파일 항목별 요구량 vs 배분
    const wq = wb.addWorksheet('수요대사', { views: [{ state: 'frozen', ySplit: 3 }] });
    title(wq, 1, '수요 대사 — 판매계획·자가재계획 항목별 요구량과 계획 배분(목적지 단위)', FT, 12);
    hdr(wq, 3, ['부서', '강종', '목적지', '대표 항구', '선적창/납기', '마감일', '요구량(t)', '전월 생산 가정(t)', '배분(t)', '1CGL(t)', '2CGL(t)', '차이(t)']);
    const alloc = {};
    for (const [d, l, a, c, dest, port, win, t, du] of R.dest) {
      const k = [c, a, dest, port, win, du].join('|');
      const o = alloc[k] || (alloc[k] = { t: 0, '1CGL': 0, '2CGL': 0 }); o.t += t; o[l] = (o[l] || 0) + t;
    }
    const ikey = (i) => [i.cls, i.alloy, i.dest, i.port, i.window || '', i.due, GP.round(i.tons, 6)].join('|');
    const septK = new Set(R.sept.map(ikey));
    r = 4;
    const itemsSorted = R.items.slice().sort((a, b) => (DEPTS.indexOf(a.cls) - DEPTS.indexOf(b.cls)) || (a.alloy < b.alloy ? -1 : a.alloy > b.alloy ? 1 : 0) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    for (const it of itemsSorted) {
      const k = [it.cls, it.alloy, it.dest, it.port, it.window || '', it.due].join('|');
      const o = alloc[k] || { t: 0 }; const sp = septK.has(ikey(it)) ? it.tons : 0;
      [it.cls, it.alloy, it.dest, it.port, winLabel(it.cls, it.due, it.window), it.due, GP.round(it.tons, 1), GP.round(sp, 1), GP.round(o.t, 1), GP.round(o['1CGL'] || 0, 1), GP.round(o['2CGL'] || 0, 1), GP.round(o.t + sp - it.tons, 1)]
        .forEach((v, j) => put(wq, r, j + 1, v, { fmt: j >= 6 ? '#,##0.0;-#,##0.0;0' : undefined }));
      r++;
    }
    wq.autoFilter = { from: { row: 3, column: 1 }, to: { row: r - 1, column: 12 } };
    widths(wq, [10, 8, 22, 22, 18, 11, 10, 11, 10, 9, 9, 9]);

    // 시간파라미터 + 계획전제
    const wt = wb.addWorksheet('시간파라미터');
    title(wt, 1, '가동시간 계산에 쓴 더미·정지 시간과 계획 전제', FT, 6);
    hdr(wt, 3, ['항목'].concat(L, ['단위', '적용']));
    r = 4;
    for (const [lab, key, unit, how] of [['강종전환(M/C) 손실', 'switchDummy', '분/회', 'M/C 당일 차감(비강종더미 대신)'], ['비강종 더미(두께·폭·도금량 변경)', 'nonfamDummy', '분/일', '매 가동일'], ['설비고장·부품교체 정지', 'equipDown', '분/일', '매 가동일'], ['S/D 재가동 더미 — 강종 바뀜', 'restartFamchg', '분/회', '정기수리 다음날'], ['S/D 재가동 더미 — 같은 강종', 'restartSame', '분/회', '정기수리 다음날']]) {
      [lab].concat(L.map((l) => P[key][l]), [unit, how]).forEach((v, j) => put(wt, r, j + 1, v)); r++;
    }
    r++;
    title(wt, r, '일반 가동일 가동가능 = 1440 − 설비정지 − 비강종더미 / M/C일 = 1440 − 설비정지 − M/C손실 / S/D 재가동일 = 1440 − 설비정지 − 재가동더미', F9B, 6); r += 2;
    title(wt, r, '■ 계획 전제', F9B, 6); r++;
    const prem = [
      ['계획 기간', `${H.D0} ~ ${H.D1}`], ['첫날 강종', L.map((l) => `${l} ${P.initFamily[l] || '자유'}`).join(', ')],
      ['주문재 생산 가능 시점', `마감 ${P.releaseDays}일 전부터` + Object.entries(Object.assign({}, P.releaseDaysCls, P.releaseDaysAlloy)).map(([k, v]) => ` · ${k} ${v}일`).join('') + ` (${P.releaseExempt.join('·')}는 제한 없음)`],
      ['첫 달 1~5일 선적분', P.firstWindowPrevMonth ? '전월 생산으로 가정(계획에서 제외)' : '계획에 포함'],
      ['정기수리', P.shutdowns.map((s) => `${s.line} ${s.start}~${s.end}`).join(', ') || '없음'],
      ['라인 생산 가능 강종', L.map((l) => `${l}: ${P.allowed[l].join(', ')}`).join(' / ')],
      ['최적화', `1단계 M/C 최소(재가동 강종변경은 M/C 환산 가중) → 2단계 M/C·재가동 판단 고정 후 선생산(톤·일) 최소 → 평준화 LP(유휴 최소화). 1단계 ${GP.round(R.milp.sec[0])}초·2단계 ${GP.round(R.milp.sec[1])}초${!(R.milp.optimal1 && R.milp.optimal2) ? ', ⚠ 시간 제한 도달' : R.milp.phase2Exact === false ? ' (2단계 빠른 모드: 전환일 ±7일 창 반복 — 전체 최적 증명은 정밀 모드)' : ', 모두 최적 증명'}`],
    ];
    for (const [a, b] of prem) { put(wt, r, 1, a, { font: F9B }); put(wt, r, 2, b, { align: LEFT }); wt.mergeCells(r, 2, r, 6); r++; }
    widths(wt, [30, 12, 12, 8, 30, 30]);

    // 속도
    const wr = wb.addWorksheet('속도_t_hr');
    title(wr, 1, '라인×강종×부서별 생산속도(t/hr) — 실적 달성속도 기준', FT, 5);
    hdr(wr, 3, ['라인', '강종', '부서', 't/hr', 't/분']);
    r = 4;
    for (const [k, v] of Object.entries(P.rateDept).sort()) { const [l, a, c] = k.split('|'); [l, a, c, GP.round(v * 60, 1), v].forEach((x, j) => put(wr, r, j + 1, x, { fmt: j === 4 ? '0.0000' : undefined })); r++; }
    for (const [k, v] of Object.entries(P.rateBase).sort()) { const [l, a] = k.split('|'); [l, a, '(기본값)', GP.round(v * 60, 1), v].forEach((x, j) => put(wr, r, j + 1, x, { fmt: j === 4 ? '0.0000' : undefined })); r++; }
    title(wr, r + 1, '부서별 값이 없으면 같은 강종군 값, 그것도 없으면 (기본값) 적용.', FN, 5);
    widths(wr, [8, 9, 12, 9, 9]);

    // 입력검증
    const wv = wb.addWorksheet('입력검증');
    title(wv, 1, '입력 파일 해석 결과·경고', FT, 3);
    hdr(wv, 3, ['수준', '내용']);
    r = 4;
    for (const c of meta.checks || []) { put(wv, r, 1, { error: '오류', warn: '경고', info: '정보' }[c.level], { font: c.level === 'info' ? F9 : { name: AR, size: 9, bold: true, color: { argb: 'FFC00000' } } }); put(wv, r, 2, c.msg, { align: LEFT }); r++; }
    widths(wv, [8, 120]);

    const order = ['요약', '가동계획', '일별계획', '일별상세_납기별', 'MC_SD일정', '선생산_사유', '수요대사', '시간파라미터', '속도_t_hr', '입력검증'];
    wb.eachSheet((w) => { w.orderNo = order.indexOf(w.name); });
    return { wb, A };
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
