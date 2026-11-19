/* 판생 작업판 ↔ 엑셀(docs/40 7단계): 내보내기 = 지금 판 전체(입력 칸 연노랑), 가져오기 = 연노랑 칸만 읽어 지금 판과 다른 것만 보여 주고 확인 뒤 반영
   시트: 안내 · 원장 · 월차 설정 · 도금 n월(보기) · 도금 소재 · 컬러 가동시간 · 주 롤링 결정. 같은 양식이면 시트 순서·서식이 바뀌어도 머리 글자로 찾음 */
(function () {
  'use strict';
  const IO = (window.PSIO = {});
  const mNo = (m) => +m.slice(5);
  const byNo = (n) => PS.base().months.find((m) => mNo(m) === +n);
  const H = (v) => ({ v, s: 'h' });
  const IN = (v) => ({ v, s: 'in' });

  IO.export = () => {
    const B = PS.base(), L = PS.ledger(), P = PS.plating(L), ms = B.months, pms = Object.keys(P).sort();
    const S = [];
    S.push({ name: '안내', cols: [90], rows: [
      [{ v: `판생 작업판 내보내기 · ${new Date().toLocaleString('ko-KR')} · 기준판 ${B.rev} · 입력 기록 ${PS.logs().length}건`, s: 'b' }],
      ['연노랑 칸 = 입력 칸. 여기를 고쳐 저장한 뒤 작업판 위 줄의 [엑셀 가져오기]로 올리면 바뀐 칸만 보여 주고, 확인하면 반영(누가·언제 기록).'],
      ['흰 칸(합계·재고·월차 일별)은 계산 결과라 가져올 때 읽지 않음. 줄 번호(A열)·머리 글자는 지우거나 바꾸지 말 것.'],
      ['월차 설정: 전환 날짜는 2026-12-11 처럼, 두 번 이상이면 쉼표로(2026-12-11,2026-12-26). 비우면 자동 전환.'],
    ] });
    // 원장
    const hd = [H('줄'), H('강종'), H('구분'), ...ms.flatMap((m) => [H(`${mNo(m)}월 생산`), H(`${mNo(m)}월 판매`), H(`${mNo(m)}월 재고 전망`)])];
    const rows = [hd];
    for (const x of B.ledger.rows) {
      const isIn = L[ms[0]][x.r] && L[ms[0]][x.r].in;
      rows.push([x.r, x.kind === 'sec' ? x.name : x.kind === 'sum' ? '합계' : '', { v: x.lab, s: x.kind === 'sec' || x.kind === 'mkt' ? 'b' : '' },
        ...ms.flatMap((m) => { const c = L[m][x.r]; return [isIn ? IN(c.p) : c.p, isIn ? IN(c.s) : c.s, Math.round(c.sf)]; })]);
    }
    S.push({ name: '원장', rows, cols: [5, 7, 22, ...ms.flatMap(() => [9, 9, 10])], freeze: [1, 3] });
    // 월차 설정
    const set = [[H('달'), H('라인'), H('전환 날짜'), H('AZ·MAC 하루 톤'), H('AL 하루 톤'), H('STS 시작'), H('STS 하루 톤'), H('자동 전환(참고)')]];
    for (const m of pms) for (const l of Object.keys(PS.LINES)) {
      const Pm = P[m][l], g = PS.LINES[l];
      set.push([`${mNo(m)}월`, l, IN(Pm.manual ? Pm.sw.join(',') : ''), IN(PS.rate(m, l, g[0])), IN(PS.rate(m, l, 'AL')), l === '2CGL' ? IN(Pm.sts && Pm.sts.manual ? Pm.sts.a : '') : '', l === '2CGL' ? IN(PS.stsRate(m)) : '', Pm.auto.join(',')]);
    }
    S.push({ name: '월차 설정', rows: set, cols: [6, 7, 26, 14, 12, 12, 12, 26] });
    // 도금 n월(보기)
    for (const m of pms) {
      const D = PS.days(m), r = [[H('라인'), H('강종'), ...D.map((d) => H(+d.slice(8))), H('계')]];
      for (const l of Object.keys(PS.LINES)) {
        const X = P[m][l].days;
        for (const g of [...PS.LINES[l], ...(l === '2CGL' ? ['STS'] : [])]) { const v = X.map((x) => ((g === 'STS' ? x.sts : x.g === g && !x.sts) ? x.t : '')); r.push([l, g, ...v, v.reduce((a, b) => a + (+b || 0), 0)]); }
        r.push([l, '전환·휴지', ...X.map((x) => x.ev), '']);
        r.push([{ v: l, s: 'b' }, { v: '계', s: 'b' }, ...X.map((x) => x.t || ''), { v: X.reduce((a, x) => a + x.t, 0), s: 'b' }]);
      }
      S.push({ name: `도금 ${mNo(m)}월`, rows: r, cols: [7, 9, ...D.map(() => 6), 9], freeze: [1, 2] });
    }
    // 소재
    const MT = PS.mat(L, P, false), mm = B.mat.months;
    const mr = [[H('줄'), H('항목'), ...mm.map((m) => H(`${mNo(m)}월`))]];
    for (const x of B.mat.rows) { const inp = PS.MAT_IN.includes(x.lab); mr.push([x.r, x.lab, ...mm.map((m) => (inp ? IN(PS.inputValue(`M|${x.r}|${m}`)) : x.v[m]))]); }
    mr.push(['', { v: '월말 재고(지금 판)', s: 'b' }, ...mm.map((m) => Math.round(MT[m].st))]);
    S.push({ name: '도금 소재', rows: mr, cols: [5, 26, ...mm.map(() => 10)] });
    // 컬러 가동시간
    const cm = Object.keys(B.color).sort().filter((m) => m >= ms[1]);
    const cr = [[H('달'), H('라인'), ...Array.from({ length: 31 }, (_, i) => H(i + 1))]];
    for (const m of cm) { const C = PS.color(m); for (const l of PS.CLINES) cr.push([`${mNo(m)}월`, l, ...C[l].map((x) => IN(x.h))]); }
    S.push({ name: '컬러 가동시간', rows: cr, cols: [6, 7, ...Array(31).fill(5)] });
    // 주 롤링 결정
    const wr = [[H('주(월요일)'), H('라인'), H('강종'), H('수주 결정 톤(+더 받기 −빼기)'), H('메모')]];
    const W = {}; for (const e of PS.logs()) for (const [k] of e.cells) if (k.startsWith('W|')) W[k.split('|').slice(0, 4).join('|')] = 1;
    for (const k of Object.keys(W).sort()) { const [, w, l, g] = k.split('|'); wr.push([w, l, g, IN(PS.get(`${k}|pull`, 0)), IN(PS.get(`${k}|note`, ''))]); }
    S.push({ name: '주 롤링 결정', rows: wr, cols: [12, 7, 7, 24, 50] });
    XL.save(XL.write(S), `판생작업판_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* 가져오기: 시트 → [칸, 새 값, 지금 값, 설명] */
  IO.diff = (WB) => {
    const B = PS.base(), L = PS.ledger(), P = PS.plating(L), out = [], num = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')));
    const push = (k, nv, cur, lab) => { if (nv == null || Number.isNaN(nv)) return; if (typeof nv === 'number' && typeof cur === 'number' && Math.abs(nv - cur) < 0.001) return; if (nv === cur) return; out.push([k, nv, cur, lab]); };
    const sd = (v) => { if (v == null || v === '') return ''; if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.toISOString().slice(0, 10); } return String(v).trim().replace(/\s+/g, '').replace(/\./g, '-'); };
    const R = WB['원장'];
    if (R) {
      const hd = R[0] || [], cols = [];
      hd.forEach((h, i) => { const m = /^(\d+)월 (생산|판매)$/.exec(String(h || '').trim()); if (m && byNo(m[1])) cols.push([i, byNo(m[1]), m[2] === '생산' ? 'p' : 's']); });
      for (const row of R.slice(1)) {
        const r = row[0], x = B.ledger.rows.find((y) => String(y.r) === String(r)); if (!x) continue;
        for (const [i, m, k] of cols) { const c = L[m][x.r]; if (!c || !c.in) continue; push(`L|${x.r}|${m}|${k}`, num(row[i]), c[k], `원장 ${x.lab} ${mNo(m)}월 ${k === 'p' ? '생산' : '판매'}`); }
      }
    }
    const M = WB['도금 소재'];
    if (M) {
      const cols = []; (M[0] || []).forEach((h, i) => { const m = /^(\d+)월$/.exec(String(h || '').trim()); const mm = m && B.mat.months.find((z) => mNo(z) === +m[1]); if (mm) cols.push([i, mm]); });
      for (const row of M.slice(1)) { const x = B.mat.rows.find((y) => String(y.r) === String(row[0])); if (!x || !PS.MAT_IN.includes(x.lab)) continue; for (const [i, m] of cols) push(`M|${x.r}|${m}`, num(row[i]), PS.inputValue(`M|${x.r}|${m}`), `소재 ${x.lab} ${mNo(m)}월`); }
    }
    const S = WB['월차 설정'];
    if (S) for (const row of S.slice(1)) {
      const m = byNo(String(row[0] || '').replace('월', '')), l = String(row[1] || '').trim(); if (!m || !P[m] || !P[m][l]) continue;
      const Pm = P[m][l], sw = String(row[2] == null ? '' : typeof row[2] === 'number' ? sd(row[2]) : row[2]).split(/[,，]/).map(sd).filter(Boolean).sort().join(',');
      const cur = Pm.manual ? Pm.sw.join(',') : '';
      if (sw !== cur) out.push([`P|${m}|${l}|sw`, sw || null, cur || null, `${mNo(m)}월 ${l} 전환 날짜`]);
      push(`P|${m}|${l}|${PS.LINES[l][0]}|rate`, num(row[3]), PS.rate(m, l, PS.LINES[l][0]), `${mNo(m)}월 ${l} ${PS.LINES[l][0]} 하루 톤`);
      push(`P|${m}|${l}|AL|rate`, num(row[4]), PS.rate(m, l, 'AL'), `${mNo(m)}월 ${l} AL 하루 톤`);
      if (l === '2CGL') {
        const a = sd(row[5]), ca = Pm.sts && Pm.sts.manual ? Pm.sts.a : '';
        if (a !== ca) out.push([`P|${m}|2CGL|stsA`, a || null, ca || null, `${mNo(m)}월 STS 시작`]);
        push(`P|${m}|2CGL|STS|rate`, num(row[6]), PS.stsRate(m), `${mNo(m)}월 STS 하루 톤`);
      }
    }
    const C = WB['컬러 가동시간'];
    if (C) for (const row of C.slice(1)) {
      const m = byNo(String(row[0] || '').replace('월', '')), l = String(row[1] || '').trim(); if (!m || !B.color[m] || !PS.CLINES.includes(l)) continue;
      const X = PS.color(m)[l]; X.forEach((x, i) => push(`C|${m}|${l}|${x.d}|h`, num(row[i + 2]), x.h, `컬러 ${l} ${PS.md(x.d)} 가동시간`));
    }
    const W = WB['주 롤링 결정'];
    if (W) for (const row of W.slice(1)) {
      const w = sd(row[0]), l = String(row[1] || '').trim(), g = String(row[2] || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(w) || !l || !g) continue;
      push(`W|${w}|${l}|${g}|pull`, num(row[3]), PS.get(`W|${w}|${l}|${g}|pull`, 0), `주 ${PS.md(w)} ${l} ${g} 수주 결정`);
      const nt = row[4] == null ? '' : String(row[4]); if (nt !== PS.get(`W|${w}|${l}|${g}|note`, '')) out.push([`W|${w}|${l}|${g}|note`, nt || null, PS.get(`W|${w}|${l}|${g}|note`, '') || null, `주 ${PS.md(w)} ${l} ${g} 메모`]);
    }
    return out;
  };

  IO.import = async (file) => {
    let WB; try { WB = await XL.read(file); } catch (e) { PSG.toast('엑셀을 못 읽음: ' + e.message); return; }
    const D = IO.diff(WB);
    if (!D.length) { PSG.toast('바뀐 입력 칸 없음(지금 판과 같음)'); return; }
    const f = (v) => (v == null || v === '' ? '(비움)' : typeof v === 'number' ? PS.n0(v) : v);
    let dlg = document.getElementById('ps-imp'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'ps-imp'; document.body.appendChild(dlg); }
    dlg.innerHTML = `<h3>${file.name} · 바뀐 칸 ${D.length}개</h3><div class="ps-impl"><table class="psg"><thead><tr><th>칸</th><th>지금</th><th>엑셀</th></tr></thead><tbody>${D.slice(0, 200).map(([, nv, cur, lab]) => `<tr><td>${lab}</td><td>${f(cur)}</td><td><b>${f(nv)}</b></td></tr>`).join('')}</tbody></table>${D.length > 200 ? `<p>그 밖 ${D.length - 200}개</p>` : ''}</div>
      <div class="ps-ctl"><button type="button" class="btn" id="ps-imp-ok">${D.length}개 반영</button><button type="button" class="btn sub" id="ps-imp-no">취소</button></div>`;
    dlg.showModal();
    dlg.querySelector('#ps-imp-no').onclick = () => dlg.close();
    dlg.querySelector('#ps-imp-ok').onclick = () => { dlg.close(); if (!CT.me()) { const n = prompt('입력하는 사람 이름(기록에 남음)'); if (!n) return; try { localStorage.setItem('cgl-me', n.trim()); } catch (e) { /* 무시 */ } } PS.setMany(D.map(([k, nv]) => [k, nv]), `엑셀 가져오기 ${file.name}`); PSG.toast(`${D.length}칸 반영함`); };
  };
})();
