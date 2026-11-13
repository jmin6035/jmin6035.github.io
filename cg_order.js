/* 도금 주문진도: published/cg_order_progress.enc.json (tools/cg_order_progress.py)
   10/28 사용자: MES 주문진도(SSCHA1060)처럼 주문서 전체 흐름 — 소재매치(수요일 오전 확정 = 입고일 확정분)·포스코 앞당김 판단용
   10/28 사용자: 무작정 나열 금지 — 크게는 판매그룹별, 세세하게는 목적지·고객사·담당자별로 묶어서. 도금량·후처리·수출·강종은 크게 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', BY_KEY = 'cgl-order-by';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));   // 250.0 → 250, 24.4 → 24.4(10/28 사용자)
  const md = (s) => { if (!s) return ''; s = String(s); const y = O && O.asOf && s.slice(0, 4) < O.asOf.slice(0, 4);   // 기준일보다 앞 해면 YY/MM/DD(작년 발주가 올해 입고 뒤로 보이지 않게)
    return y ? `${s.slice(2, 4)}/${s.slice(5, 7)}/${s.slice(8, 10)}` : `${+s.slice(5, 7)}/${+s.slice(8, 10)}`; };
  const ymd8 = (s) => (s && String(s).length >= 8 ? md(`${String(s).slice(0, 4)}-${String(s).slice(4, 6)}-${String(s).slice(6, 8)}`) : '');
  let CAL = null;                                            // 계약번호-행번 → 2주 캘린더 생산일
  let O = null, flt = 'act', q = '', ln = '', ex = '', by = 'dst';
  try { by = localStorage.getItem(BY_KEY) || 'dst'; } catch (e) { /* 무시 */ }
  const F = {
    act: ['조치 필요', (x) => x.hurry || x.lateIn || x.chk || x.st === '미발주'],
    late: ['소재 지연', (x) => x.lateIn],
    hurry: ['포스코 독촉', (x) => x.hurry],
    chk: ['입고 확인 필요', (x) => x.chk],
    nopo: ['미발주', (x) => x.st === '미발주'],          // 조치 필요 = 소재 지연 + 독촉 + 입고 확인 + 미발주(카드 합이 맞게)
    posco: ['포스코 진행', (x) => x.st === '포스코 진행' || x.st.startsWith('발주')],
    ready: ['입고 완료', (x) => x.st === '입고 완료'],
    prod: ['생산 중', (x) => x.st === '생산 중'],
    done: ['생산 완료', (x) => x.st === '생산 완료'],
    all: ['전체', () => true],
  };
  const BY = {
    dst: ['목적지', (x) => x.dst, () => (O.hasFull ? '목적지 코드 없음' : '목적지 — 다음 자동 실행부터')],
    cus: ['고객사', (x) => x.cus, () => (O.hasCus ? '고객사 미확인' : '고객사 — 다음 자동 실행부터')],
    man: ['담당자', (x) => x.man, () => (O.hasCus ? '담당자 미확인' : '담당자 — 다음 자동 실행부터')],
  };
  if (!BY[by]) by = 'dst';
  function stBadge(x) {
    if (x.lateIn) return '<span class="st late">소재 지연</span>';
    if (x.hurry) return '<span class="st hurry" title="필요 입고 3주 이내 · 열연 이전 — 포스코에 진행 단축 요청">포스코 독촉</span>';
    if (x.chk) return '<span class="st hurry">입고 확인</span>';
    const c = { '입고 완료': 'ok', '생산 중': 'mid', '생산 완료': 'ok', '미발주': 'late' }[x.st] || 'na';
    return `<span class="st ${c}">${esc(x.st)}</span>`;
  }
  // 포스코 진행 = 단계 띠(10/29 사용자 '막대 띠로 열연·냉연·출하·입고 단계별로 직관적으로'): 접수 → 제강 → 열연 → 냉연 → 출하 → 입고
  const PH = [['접수', ['요수배']], ['제강', ['출강대', 'SLAB']], ['열연', ['열연압연', '열연정정']], ['냉연', ['냉연대기', '3차압연', '소둔', '포스코 도금', '냉연정정', '판정대']],
    ['출하', ['입고대기', '운송지시대기', '운송', '유통기지 입고', '유통기지 출하지시', '유통기지 운송']], ['입고', []]];
  function stages(x) {
    const s = x.stg || {}, has = Object.keys(s).length;
    const pt = PH.map(([, L]) => L.reduce((a, nm) => a + (s[nm] || 0), 0));
    pt[5] = x.entT || 0;
    let st, note = '';                                        // st[i] = done(지남) · cur(물량 있음) · todo(아직) · in(입고됨)
    const fill = (k) => PH.map((_, i) => (i < k ? 'done' : 'todo'));
    if (x.remIn <= 0.5 && (x.entT || 0) >= 0.5) { st = fill(5); st[5] = 'in'; note = `<span class="sub">입고 끝 ${n1(x.entT)}t</span>`; }
    else if (has) {
      const first = pt.findIndex((v, i) => i < 5 && v >= 0.05);
      st = fill(first).map((v, i) => (i < 5 && pt[i] >= 0.05 ? 'cur' : v));
      if (pt[5] >= 0.5) st[5] = 'in';
      const cur = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([nm, t]) => `${nm} ${n1(t)}t`).join(' · ');
      note = `<span class="pn">${esc(cur)}</span>`;
    } else if (!O.hasRun) { st = fill(0); note = '<span class="sub">다음 자동 실행부터</span>'; }
    else if (x.runSt === 'done') { st = fill(5); st[4] = 'cur'; if (pt[5] >= 0.5) st[5] = 'in'; note = '<span class="sub" title="포스코 생산은 끝났고 우리 입고 전(운송·입고 처리 중)">포스코 생산 끝 · 입고 전</span>'; }
    else if (x.runRow) { st = fill(1); st[0] = 'cur'; note = '<span class="rem" title="포스코 주문 접수 · 전 공정 물량 없음 = 생산 투입 전">포스코 착수 전</span>'; }
    else {
      st = fill(0);
      const old = x.purDt && (Date.parse(O.asOf) - Date.parse(`${x.purDt.slice(0, 4)}-${x.purDt.slice(4, 6)}-${x.purDt.slice(6, 8)}`)) / 864e5 > 14;
      note = `<span class="sub" title="F/H 발주 완료 · 포스코 주문진행 미등록(최근 발주는 수일 소요)">포스코 접수 전</span>${old ? '<div class="rem">발주 2주 경과 · 확인</div>' : ''}`;
    }
    const tip = (i) => `${PH[i][0]}${i < 5 && PH[i][1].length ? `(${PH[i][1].join('·')})` : ''}${pt[i] >= 0.05 ? ` — ${n1(pt[i])}t` : ''}`;
    return `<div class="pbar">${PH.map(([nm], i) => `<span class="ps ${st[i]}" title="${esc(tip(i))}"></span>`).join('')}</div>${note}`;   // 단계 이름은 머리글 한 줄(같은 칸 너비로 맞춤)
  }
  function prodChips(x) {
    const c = [];
    if (x.fam) c.push(`<span class="ch fam fam-${esc(String(x.fam).replace(/[^A-Z]/g, ''))}">${esc(x.fam)}${x.pdt ? ` <small>${esc(x.pdt)}</small>` : ''}</span>`);
    c.push(x.exp ? '<span class="ch exp">수출</span>' : '<span class="ch dom">내수</span>');
    if (x.cot) c.push(`<span class="ch">도금량 ${esc(x.cot)}</span>`);
    if (x.aft) c.push(`<span class="ch">후처리 ${esc(x.aft)}</span>`);
    return c.join('');
  }
  function calTxt(x) {                                       // 2주 캘린더(cg_calendar)에 잡힌 생산일 — 지시(확정)·소재 있음·입고 예정 모두
    const c = CAL && CAL[x.con];
    if (!c || x.st === '생산 완료') return x.woN ? `<div class="sub">지시 ${x.woN}코일</div>` : '';
    const mv = c.line && x.line && c.line !== x.line;            // 캘린더가 다른 라인 빈 날로 옮긴 주문(AL)
    return `<div class="${c.late ? 'rem' : ''}" style="white-space:nowrap">생산 <b>${md(c.from)}</b>${c.to !== c.from ? `~${String(c.to).slice(0, 7) === String(c.from).slice(0, 7) ? +String(c.to).slice(8, 10) : md(c.to)}` : ''}</div><div class="sub"${mv ? ` title="계약 라인 ${esc(x.line)} → 생산 캘린더에서 ${esc(c.line)} 빈 날로 옮김"` : ''}>${mv ? `→ ${esc(c.line)}` : esc(c.line || '')} ${n1(c.t)}t</div>${x.woN ? `<div class="sub">지시 ${x.woN}코일</div>` : ''}`;
  }
const spk = (c) => (window.UI && UI.specHtml ? UI.specHtml(c) : esc(c));   // 규격 코드 → 한글(ui/spec_ko.js), 원코드는 마우스 올림
const GRN = { CQ: 'CQ', DQ: 'DQ', DDQ: 'DDQ', EDDQ: 'EDDQ', LFQ: 'LFQ', GRC: 'Gr.C', GRD: 'Gr.D', GRE: 'Gr.E', GRA: 'Gr.A', GRB: 'Gr.B', GrC: 'Gr.C', GrD: 'Gr.D', GrE: 'Gr.E', GrA: 'Gr.A', GrB: 'Gr.B' };
  function row(x) {
    const past = x.lateIn && x.needIn ? Math.round((Date.parse(O.asOf) - Date.parse(x.needIn)) / 864e5) : 0;   // 소재 지연이면 '여유' 대신 필요 입고일이 며칠 지났는지
    const est = x.etaSrc === '예상 입고';                        // 여유 = 필요 입고일 − 포스코 입고예정(없으면 인도기한 + 실적 중앙값 = 예상 입고)
    const etaPast = x.eta && x.remIn > 0.5 && x.eta < O.asOf;   // 예상 입고일이 지났는데 아직 다 안 들어옴 → '여유' 대신 확인
    const sl = past > 0 ? `<div class="sl neg">${past}일 지남</div>` : etaPast ? `<div class="sl neg" title="F/H 예상 입고일(인도기한 기준) 경과 · 미입고 — 포스코에 진행 확인">예상 ${md(x.eta)} 지남</div><div class="sub">→ 포스코 확인</div>` : (x.slack == null ? '' : `<div class="sl ${x.slack < 0 ? 'neg' : est ? '' : 'pos'}">${x.slack < 0 ? `${-x.slack}일 지연` : `${x.slack}일 여유`}</div>${x.eta ? `<div class="sub">${est ? '예상' : '입고예정'} ${md(x.eta)}</div>` : ''}`);
    const needOn = x.remIn > 0.5;                                 // 소재가 다 들어왔으면(입고 완료·생산) 필요 입고일은 의미 없음
    const nm = (t, pre) => `<span class="nmw" title="${esc(t)}">${pre || ''}${esc(t).replace(/-/g, '\u2011').replace(/\(/g, '\u200b(')}</span>`;   // 이름은 띄어쓰기·괄호 앞에서만 줄 바꿈(하이픈에서 안 끊음)
    const who = [by !== 'cus' && x.cus ? nm(x.cus) : '', x.lcus && x.lcus !== x.cus ? nm(x.lcus, '최종\u00a0') : '', by !== 'man' && x.man ? `<span class="nw">담당 ${esc(x.man)}</span>` : '', by !== 'dst' && x.dst ? `<span class="nw">→ ${esc(x.dst)}</span>` : ''].filter(Boolean);
    return `<tr class="${x.lateIn ? 'f-late ' : ''}${x.hurry ? 'f-hurry ' : ''}${x.chk ? 'f-chk' : ''}"><td>${stBadge(x)}${x.woWait ? '<div class="sub">작업지시됨</div>' : ''}</td>`
      + `<td><div class="con">${esc(x.con)}</div><div class="sub">${[x.line, x.pln, x.usg && `<span title="용도 코드"><span class="nw">용도 ${esc(x.usg)}</span>${x.usgNm ? ` ${esc(x.usgNm)}` : ''}</span>`].filter(Boolean).join(' · ')}</div></td>`
      + `<td><div class="chips">${prodChips(x)}</div><div class="sz">${x.thk != null ? `<span class="nw">${(+x.thk).toFixed(2)} × ${n0(x.wdt)}</span>` : ''}${x.ordT ? ` <span class="sub">· 주문 ${n1(x.ordT)}t</span>` : ''}</div>${x.pspec || x.spec ? `<div class="sub spc">${x.pspec ? `<span class="nw">제품 ${spk(x.pspec)}${x.grade && !(window.UI && UI.specKo && (UI.specKo(x.pspec) || {}).ko) ? ` <b>${esc(GRN[x.grade] || x.grade)}</b>` : ''}</span>` : ''}${x.pspec && x.spec ? ' · ' : ''}${x.spec ? `<span class="nw" title="소재(F/H) 규격 — 포스코 강종 약호">소재 ${esc(x.spec)}${x.specGr ? ` ${esc(GRN[x.specGr] || x.specGr)}` : ''}</span>` : ''}</div>` : ''}</td>`
      + `<td>${who.length ? who.map((w) => `<div>${w}</div>`).join('') : '<span class="sub">-</span>'}</td>`
      + `<td class="nw">납기 <b>${md(x.due) || '-'}</b>${x.dept ? `<div>출항 <b>${md(x.dept)}</b></div>` : x.arr ? `<div>입항 <b>${md(x.arr)}</b></div>` : ''}${x.shp && !/^TBN/i.test(x.shp) ? `<div class="sub" style="white-space:normal;overflow-wrap:anywhere">${esc(String(x.shp).split('_')[0])}</div>` : ''}${x.shipMiss ? '<div><span class="st late" title="입항일 경과 · 미생산 — 배선 변경 확인">입항 지남</span></div>' : ''}</td>`
      + `<td class="num">${x.purT ? `<b>${n1(x.purT)}t</b><div class="sub">발주 ${ymd8(x.purDt)}</div>${x.dle ? `<div class="sub">인도기한 ${md(x.dle)}</div>` : ''}` : '<span class="sub">미발주</span>'}</td>`
      + `<td>${stages(x)}${x.early && x.remIn > 0.5 ? `<div class="rem">열연 이전 ${n1(x.early)}t</div>` : ''}</td>`
      + `<td class="num">${x.entT ? `<b>${n1(x.entT)}t</b>${x.entFirst ? `<div class="sub">첫 입고 ${md(x.entFirst)}</div>` : ''}` : '<span class="sub">0</span>'}${x.remIn ? `<div class="rem">미입고 ${n1(x.remIn)}t</div>` : ''}</td>`
      + `<td class="num">${calTxt(x)}${x.sche && !(CAL && CAL[x.con]) ? `<div>예정 <b>${md(x.sche)}</b></div>` : ''}${x.prodT ? `<b>${n1(x.prodT)}t</b>${x.prodLast ? `<div class="${x.st === '생산 완료' ? 'done' : 'sub'}">${x.st === '생산 완료' ? '완료' : '마지막'} ${md(x.prodLast)}</div>` : ''}` : (x.sche || (CAL && CAL[x.con]) ? '' : '<span class="sub">-</span>')}${x.fwdT ? `<div class="sub">출하 ${n1(x.fwdT)}t${x.fwdLast ? ` ${md(x.fwdLast)}` : ''}</div>` : ''}</td>`
      + `<td class="num">${needOn && x.needIn ? `<b>${md(x.needIn)}</b>${sl}` : '<span class="sub">-</span>'}</td></tr>`;
  }
  const COLS = '<colgroup>' + [8.5, 13, 12.5, 11, 8, 9, 12, 8, 9.5, 8.5].map((w) => `<col style="width:${w}%">`).join('') + '</colgroup>';
  const HEAD = '<thead><tr><th>상태</th><th>계약번호-행번</th><th>제품 · 두께×폭</th><th>고객사·담당·목적지</th><th>납기 · 입항</th><th class="num">F/H 발주</th><th title="접수 → 제강(출강·SLAB) → 열연 → 냉연(압연·소둔·정정·판정) → 출하(운송) → 입고 · 파랑 = 지남 · 주황 = 지금 물량 있음 · 초록 = 입고">포스코 진행<div class="pbar ph"><span>접수</span><span>제강</span><span>열연</span><span>냉연</span><span>출하</span><span>입고</span></div></th><th class="num">입고 · 미입고</th><th class="num">생산</th><th class="num">필요 입고</th></tr></thead>';
  const sumOf = (L) => ({ n: L.length, rem: L.reduce((s, x) => s + (x.remIn || 0), 0), hurry: L.filter((x) => x.hurry).length, chk: L.filter((x) => x.chk).length, late: L.filter((x) => x.lateIn).length, est: L.filter((x) => x.grpSrc && x.grpSrc !== '주문').length, need: L.filter((x) => x.remIn > 0.5).map((x) => x.needIn).filter(Boolean).sort()[0] });
  /* 11/11 회의 '소재 지연 누르면 그것만 나올 줄 알았는데 전부 나온다': 묶음 머리의 건수 칩 = 그 묶음 안 거르기(다시 누르거나 'N건' 누르면 전체) */
  const stat = (S) => `<button type="button" class="gs gf" data-sf="" title="이 묶음 전체">${'<b>' + n0(S.n) + '</b>'}건</button><span class="gs">미입고 <b>${n0(S.rem)}</b>t</span>`
    + (S.late ? `<button type="button" class="gs gf bad" data-sf="late" title="이 묶음에서 소재 지연만">소재 지연 <b>${S.late}</b></button>` : '') + (S.hurry ? `<button type="button" class="gs gf warn" data-sf="hurry" title="이 묶음에서 포스코 독촉만">독촉 <b>${S.hurry}</b></button>` : '') + (S.chk ? `<button type="button" class="gs gf warn" data-sf="chk" title="이 묶음에서 입고 확인만">입고 확인 <b>${S.chk}</b></button>` : '')
    + (S.need ? `<span class="gs">가장 이른 필요 입고 <b>${md(S.need)}</b></span>` : '');
  /* 판매그룹별 수치 + 합계 막대(10/29 사용자 '그룹별로 수치 · 합계로 그래프'): 주문 톤 = 생산 완료 + 소재 있음(생산 전) + 미입고 — 지금 고른 묶음·필터 그대로 */
  // 최근 2주 실제 생산이 필요 생산일 안에 끝난 비율(그룹별, 필터와 무관) — 수출은 실제 실린 배의 출항일 기준도 같이
  function perfLine(gs) {                                  // 최근 2주 실제 생산 중 필요 생산일(수출 출항 −1 · 내수 납기 −1) 안에 끝난 톤 비율
    const P = O.perf;
    if (!P || !P.groups) return '';
    const E = Object.entries(P.groups).filter(([, g]) => g.known >= 1).sort((a, b) => b[1].t - a[1].t);
    return `<div class="perf"><b>최근 2주 생산 · 필요일 안 완료</b><div class="perf-r">`
      + E.map(([g, x]) => `<span class="pchip"><b>${esc(gs(g))}</b> ${Math.round(100 * x.ok / x.known)}% <small class="bk">${n0(x.t)}t</small></span>`).join('') + '</div></div>';
  }
  function grpChart(byG) {
    if (!byG.length) return '';
    const sm = (L) => { const o = L.reduce((s, x) => s + (x.ordT || x.purT || 0), 0), p = L.reduce((s, x) => s + Math.min(x.prodT || 0, x.ordT || x.purT || 0), 0), r = L.reduce((s, x) => s + (x.remIn || 0), 0);
      return { o, p, r, h: Math.max(0, o - p - r), ...sumOf(L) }; };
    const R = [['합계', sm(byG.flatMap(([, v]) => v))], ...byG.map(([g, v]) => [g, sm(v)])], mx = Math.max(1, ...R.map(([, s]) => s.o));
    const P = (v) => (100 * v / mx).toFixed(2) + '%';
    const gs = (g) => ({ 도금수출그룹: '도금수출', 도금판매그룹: '도금국내', 자동차강판판매그룹: '자동차강판', 컬러수출그룹: '컬러수출', 컬러건재판매그룹: '컬러건재', 수요개발그룹: '수요개발' }[g] || g);
    const tr = ([g, s], i) => `<tr${i === 0 ? ' class="tot"' : ''}><td>${i ? `<a href="#og-${i - 1}"><b>${esc(gs(g))}</b></a>` : `<b>${esc(gs(g))}</b>`}</td><td class="num">${n0(s.n)}</td>`
      + `<td class="gbcell"><div class="gb" title="${esc(g)} · 주문 ${n0(s.o)}t = 생산 완료 ${n0(s.p)} + 소재 있음 ${n0(s.h)} + 미입고 ${n0(s.r)}"><span class="gbr"><i class="a" style="width:${P(s.p)}"></i><i class="m" style="width:${P(s.h)}"></i><i class="b" style="width:${P(s.r)}"></i></span><span class="gbv"><b>${n0(s.o)}</b>t</span></div></td>`
      + `<td class="num">${n0(s.p)} <small class="sub">${s.o ? Math.round(100 * s.p / s.o) : 0}%</small></td><td class="num">${n0(s.h)}</td><td class="num">${n0(s.r)}</td>${[['late', s.late, 'bad'], ['hurry', s.hurry, 'warn'], ['chk', s.chk, '']].map(([f, v, c]) => `<td class="num ${v ? c : ''}">${v ? `<button type="button" class="gcn" data-gf="${f}" data-g="${i ? esc(g) : ''}" title="${esc(gs(g))} ${F[f][0]} ${v}건만 보기">${v}</button>` : '-'}</td>`).join('')}</tr>`;
    return '<div class="gcard"><div class="gbl"><span><i class="a"></i>생산 완료</span><span><i class="m"></i>소재 있음(생산 전)</span><span><i class="b"></i>미입고(포스코 진행·미발주)</span><span class="sub">주문 톤</span></div>'
      + '<div class="scroll"><table class="t gtab"><thead><tr><th>그룹</th><th>건</th><th>주문 톤</th><th>생산 완료</th><th>소재 있음</th><th>미입고</th><th title="필요 입고일 대비 소재 지연">소재 지연</th><th title="필요 입고 3주 이내 · 열연 이전">포스코 독촉</th><th title="인도기한 지났는데 입고 기록 없음">입고 확인</th></tr></thead>'
      + `<tbody>${R.map((x, i) => tr(x, i)).join('')}</tbody></table></div>${perfLine(gs)}</div>`;
  }
  /* ── 새 양식(UI.v2, ?ui=v2) — 11/12 사용자 '표 구성 자체가 안 바뀌었다·한눈에 안 들어온다': 계약 한 줄 = 한 줄 높이, 세부는 줄을 누르면 펼침.
     칸 순서·이름은 컬러 주문진도(cc_order.js)와 같게. 숫자·계산은 기존 그대로(표시만) ── */
  const V2 = () => !!(window.UI && UI.v2);
  const GV2 = { 도금수출그룹: '도금수출', 도금판매그룹: '도금국내', 자동차강판판매그룹: '자동차', '자가재(컬러 투입)': '도금 자가재' };
  const gv2 = (g) => GV2[g] || g;
  const dPast = (a) => Math.round((Date.parse(O.asOf) - Date.parse(a)) / 864e5);
  const s2 = (t, c, tip) => `<span class="s2${c ? ' ' + c : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${t}</span>`;
  function badgeV2(x) {
    const [t, c, tip] = x.lateIn ? ['소재 지연', 'w', '필요 입고일 지남 · 미입고'] : x.hurry ? ['포스코 독촉', 'w', '필요 입고 3주 이내 · 열연 이전 — 포스코에 진행 단축 요청'] : x.chk ? ['입고 확인', 'w', '필요 입고 2주 안 미입고 · 인도기한 지났는데 입고 기록 없음']
      : x.st === '미발주' ? ['미발주', 'w', '소재(F/H) 발주 전'] : [x.st.startsWith('발주') ? '포스코 진행' : x.st, x.st === '생산 완료' || x.st === '입고 완료' ? 'ok' : '', x.st];
    return `<span class="st2 ${c}" title="${esc(tip)}">${esc(t)}</span>`;
  }
  function rowV2(x) {
    const needOn = x.remIn > 0.5, past = needOn && x.lateIn && x.needIn ? dPast(x.needIn) : 0;
    const etaPast = x.eta && needOn && x.eta < O.asOf;
    const gr = [x.fam, x.cot, x.aft].filter(Boolean).join(' · ');
    const grTip = `강종 ${x.fam || '-'}${x.pdt ? ` ${x.pdt}` : ''} · 도금량 ${x.cot || '-'} · 후처리 ${x.aft || '-'} · ${x.exp ? '수출' : '내수'}`;
    const c = CAL && CAL[x.con];
    const prod = x.st === '생산 완료' ? `완료${x.prodLast ? ` ${md(x.prodLast)}` : ''}`
      : c ? `${md(c.from)}${c.to !== c.from ? `~${String(c.to).slice(0, 7) === String(c.from).slice(0, 7) ? +String(c.to).slice(8, 10) : md(c.to)}` : ''}`
      : x.sche ? md(x.sche) : '-';
    const need = !(needOn && x.needIn) ? '<span class="mu">-</span>'
      : md(x.needIn) + (past > 0 ? `<span class="dd">지남 ${past}일</span>`
        : etaPast ? s2(`예상 ${md(x.eta)} 경과`, 'wn', 'F/H 예상 입고일 경과 · 미입고 — 포스코에 진행 확인')
        : x.slack == null ? '' : x.slack < 0 ? s2(`입고 ${-x.slack}일 늦음`, 'wn', `${x.etaSrc === '예상 입고' ? '예상' : '입고예정'} ${md(x.eta)}`) : s2(`여유 ${x.slack}일`, '', `${x.etaSrc === '예상 입고' ? '예상' : '입고예정'} ${md(x.eta)}`));
    const fc = `${x.lateIn ? 'f-late ' : ''}${x.hurry ? 'f-hurry ' : ''}${x.chk ? 'f-chk' : ''}`;
    return `<tr class="r ${fc}" title="누르면 상세"><td>${badgeV2(x)}</td>`
      + `<td class="cn">${esc(x.con)}</td>`
      + `<td class="gr" title="${esc(grTip)}">${esc(gr || '-')}</td>`
      + `<td class="n">${x.thk != null ? `${(+x.thk).toFixed(2)}×${n0(x.wdt)}` : '-'}</td>`
      + `<td class="n">${n1(x.ordT || x.purT)}</td>`
      + `<td>${md(x.due) || '-'}${x.dept ? s2(`출항 ${md(x.dept)}`) : x.arr ? s2(`입항 ${md(x.arr)}`) : ''}</td>`
      + `<td class="n">${!(x.purT || x.entT) ? '<span class="mu">미발주</span>' : (x.entT || 0) < 0.05 ? `<span class="mu">미입고</span> ${n1(x.remIn)}` : n1(x.entT) + (needOn ? s2(`미입고 ${n1(x.remIn)}`) : '')}</td>`
      + `<td class="n">${prod === '-' && x.prodT ? `<span class="mu">${n1(x.prodT)}t 생산</span>` : prod + (x.st !== '생산 완료' && x.prodT ? s2(`${n1(x.prodT)}t 생산`) : '')}</td>`
      + `<td class="n">${need}</td></tr>`
      + `<tr class="dt ${fc}" hidden><td colspan="9">${detailV2(x)}</td></tr>`;
  }
  function detailV2(x) {
    const it = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
    const spc = [x.pspec && `제품 ${spk(x.pspec)}${x.grade && !(window.UI && UI.specKo && (UI.specKo(x.pspec) || {}).ko) ? ` ${esc(GRN[x.grade] || x.grade)}` : ''}`, x.spec && `소재 ${esc(x.spec)}${x.specGr ? ` ${esc(GRN[x.specGr] || x.specGr)}` : ''}`].filter(Boolean).join(' · ');
    return '<dl class="dtg">'
      + it('고객사', [x.cus && esc(x.cus), x.lcus && x.lcus !== x.cus && `최종 ${esc(x.lcus)}`].filter(Boolean).join(' · '))
      + it('담당 · 목적지', [x.man && `담당 ${esc(x.man)}`, x.dst && esc(x.dst)].filter(Boolean).join(' · '))
      + it('라인 · 용도', [x.line, x.pln && esc(x.pln), x.usg && `용도 ${esc(x.usg)}${x.usgNm ? ` ${esc(x.usgNm)}` : ''}`].filter(Boolean).join(' · '))
      + it('제품', [x.fam && `${esc(x.fam)}${x.pdt ? ` ${esc(x.pdt)}` : ''}`, x.exp ? '수출' : '내수', x.cot && `도금량 ${esc(x.cot)}`, x.aft && `후처리 ${esc(x.aft)}`].filter(Boolean).join(' · '))
      + it('규격', spc)
      + it('납기 · 선적', [`납기 ${md(x.due) || '-'}`, x.dept && `출항 ${md(x.dept)}`, x.arr && `입항 ${md(x.arr)}`, x.shp && !/^TBN/i.test(x.shp) && esc(String(x.shp).split('_')[0]), x.shipMiss && '입항일 경과 · 미생산 — 배선 변경 확인'].filter(Boolean).join(' · '))
      + it('F/H 발주', x.purT ? [`${n1(x.purT)}t`, `발주 ${ymd8(x.purDt)}`, x.dle && `인도기한 ${md(x.dle)}`].filter(Boolean).join(' · ') : '미발주')
      + `<div class="wide"><dt>포스코 진행 <span class="phl">접수 · 제강 · 열연 · 냉연 · 출하 · 입고</span></dt><dd>${stages(x)}${x.early && x.remIn > 0.5 ? `<div class="rem">열연 이전 ${n1(x.early)}t</div>` : ''}</dd></div>`
      + it('입고', [`${n1(x.entT || 0)}t`, x.entFirst && `첫 입고 ${md(x.entFirst)}`, x.remIn > 0.5 && `미입고 ${n1(x.remIn)}t`, x.eta && x.remIn > 0.5 && `${x.etaSrc === '예상 입고' ? '예상' : '입고예정'} ${md(x.eta)}`].filter(Boolean).join(' · '))
      + it('생산', [calTxt(x).replace(/<\/?div[^>]*>/g, ' ').trim(), x.sche && !(CAL && CAL[x.con]) && `예정 ${md(x.sche)}`, x.prodT && `생산 ${n1(x.prodT)}t${x.prodLast ? ` (마지막 ${md(x.prodLast)})` : ''}`, x.fwdT && `출하 ${n1(x.fwdT)}t${x.fwdLast ? ` ${md(x.fwdLast)}` : ''}`, x.woWait && '작업지시됨'].filter(Boolean).join(' · '))
      + it('필요 입고', x.remIn > 0.5 && x.needIn ? `${md(x.needIn)}${x.slack != null ? ` · ${x.slack < 0 ? `입고 예정 ${md(x.eta)}(필요일보다 ${-x.slack}일 늦음)` : `여유 ${x.slack}일`}` : ''}` : '')
      + '</dl>';
  }
  const COLS2 = '<colgroup>' + [112, 236, null, 128, 72, 138, 146, 160, 170].map((w) => `<col${w ? ` style="width:${w}px"` : ''}>`).join('') + '</colgroup>';
  const HEAD2 = '<thead><tr><th>상태</th><th>계약번호-행</th><th title="강종 · 도금량 · 후처리">강종 · 도금량 · 후처리</th><th class="n">두께×폭</th><th class="n">주문 t</th><th>납기</th><th class="n" title="입고 t · 미입고 t">입고 · 미입고</th><th class="n" title="생산 캘린더 생산일 · 없으면 도금생산예정일">생산(예정)</th><th class="n" title="내수 납기 · 수출 출항 기준 필요 입고일 · 지남 = 필요 입고일 지남(소재 지연)">필요 입고</th></tr></thead>';
  // 묶음 머리 한 줄(칸 맞춤): 이름 | 건 | 미입고 | 소재 지연 | 독촉 | 입고 확인 | 가장 이른 필요 입고
  const statV2 = (S) => `<span class="c1"><button type="button" class="gs gf" data-sf="" title="이 묶음 전체"><b>${n0(S.n)}</b>건</button></span><span class="c2">미입고 <b>${n0(S.rem)}</b>t</span>`
    + `<span class="c3">${S.late ? `<button type="button" class="gs gf bad" data-sf="late" title="이 묶음에서 소재 지연만">소재 지연 <b>${S.late}</b></button>` : ''}</span>`
    + `<span class="c4">${S.hurry ? `<button type="button" class="gs gf" data-sf="hurry" title="이 묶음에서 포스코 독촉만">독촉 <b>${S.hurry}</b></button>` : ''}</span>`
    + `<span class="c5">${S.chk ? `<button type="button" class="gs gf" data-sf="chk" title="이 묶음에서 입고 확인만">입고 확인 <b>${S.chk}</b></button>` : ''}</span>`
    + `<span class="c6">${S.need ? `필요 입고 <b>${md(S.need)}</b>` : ''}</span>`;
  // 판매그룹 요약(컬러와 같은 칸): 그룹 | 건 | 주문 t | 생산 진도(막대 하나) | 생산 완료 | 소재 있음 | 미입고 | 문제 3칸
  function grpChartV2(byG) {
    if (!byG.length) return '';
    const sm = (L) => { const o = L.reduce((s, x) => s + (x.ordT || x.purT || 0), 0), p = L.reduce((s, x) => s + Math.min(x.prodT || 0, x.ordT || x.purT || 0), 0), r = L.reduce((s, x) => s + (x.remIn || 0), 0);
      return { o, p, r, h: Math.max(0, o - p - r), ...sumOf(L) }; };
    const R = [['합계', sm(byG.flatMap(([, v]) => v))], ...byG.map(([g, v]) => [g, sm(v)])];
    const cnt = (f, v, g, i, cls) => `<td class="n">${v ? `<button type="button" class="gcn ${cls || ''}" data-gf="${f}" data-g="${i ? esc(g) : ''}" title="${esc(gv2(g))} ${F[f][0]} ${v}건만 보기">${v}</button>` : '<span class="mu">-</span>'}</td>`;
    const tr = ([g, s], i) => `<tr${i === 0 ? ' class="tot"' : ''}><td>${i ? `<a href="#og-${i - 1}">${esc(gv2(g))}</a>` : '합계'}</td><td class="n">${n0(s.n)}</td><td class="n">${n0(s.o)}</td>`
      + `<td><div class="pb2" title="생산 완료 ${n0(s.p)}t ÷ 주문 ${n0(s.o)}t"><i style="width:${s.o ? (100 * s.p / s.o).toFixed(1) : 0}%"></i></div><span class="pbv">${s.o ? Math.round(100 * s.p / s.o) : 0}%</span></td>`
      + `<td class="n">${n0(s.p)}</td><td class="n">${n0(s.h)}</td><td class="n">${n0(s.r)}</td>`
      + cnt('late', s.late, g, i, 'bad') + cnt('hurry', s.hurry, g, i) + cnt('chk', s.chk, g, i) + '</tr>';
    return `<div class="scroll"><table class="t og2">${OG2COLS}<thead><tr><th>판매그룹</th><th class="n">건</th><th class="n">주문 t</th><th>생산 진도</th><th class="n">생산 완료 t</th><th class="n" title="입고됐으나 생산 전">소재 있음 t</th><th class="n" title="포스코 진행·미발주">미입고 t</th><th class="n" title="필요 입고일 지남 · 미입고">소재 지연</th><th class="n" title="필요 입고 3주 이내 · 열연 이전">포스코 독촉</th><th class="n" title="인도기한 지났는데 입고 기록 없음">입고 확인</th></tr></thead>`
      + `<tbody>${R.map((x, i) => tr(x, i)).join('')}</tbody></table></div>${perfLine(gv2)}`;
  }
  const OG2COLS = '<colgroup>' + [130, 64, 92, null, 108, 104, 96, 96, 104, 96].map((w) => `<col${w ? ` style="width:${w}px"` : ''}>`).join('') + '</colgroup>';
  function sub(name, L, i) {
    const S = sumOf(L);
    L.sort((a, b) => (b.lateIn - a.lateIn) || (b.hurry - a.hurry) || (b.chk - a.chk) || String(a.needIn || a.due || '9').localeCompare(String(b.needIn || b.due || '9')) || a.con.localeCompare(b.con));
    const open = S.late > 0 && L.length <= 40 && i < 2;   // 11/11: 조치 필요한 묶음 중 위 2개만 펼침(화면이 수십 장 길어지던 것)
    if (V2()) return `<details class="sg sg2${S.late ? ' h-late' : ''}${S.hurry ? ' h-hurry' : ''}${S.chk ? ' h-chk' : ''}"${open ? ' open' : ''}><summary><span class="sn" title="${esc(name)}">${esc(name)}</span>${statV2(S)}</summary>`
      + `<div class="scroll od-wrap2"><table class="t od2">${COLS2}${HEAD2}<tbody>${L.map(rowV2).join('')}</tbody></table></div></details>`;
    return `<details class="sg${S.late ? ' h-late' : ''}${S.hurry ? ' h-hurry' : ''}${S.chk ? ' h-chk' : ''}"${open ? ' open' : ''}><summary><span class="sn">${esc(name)}</span><span class="ss">${stat(S)}</span></summary>`
      + `<div class="scroll od-wrap"><table class="t od">${COLS}${HEAD}<tbody>${L.map(row).join('')}</tbody></table></div></details>`;
  }
  function group(g, L, gi) {
    const S = sumOf(L);
    const m = new Map();
    for (const x of L) { const k = BY[by][1](x) || BY[by][2](); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    const subs = [...m.entries()].map((e) => [e[0], e[1], sumOf(e[1])])
      .sort((a, b) => (b[2].late - a[2].late) || (b[2].hurry - a[2].hurry) || (b[2].chk - a[2].chk) || (b[2].n - a[2].n) || String(a[0]).localeCompare(String(b[0])));
    if (V2()) return `<section class="og og2" id="og-${gi}" data-g="${esc(g)}"><header class="og-h"><h2 title="${esc(g)}${S.est ? ` · 판매그룹 추정 ${S.est}건(주문서 판매부서 없음 — 실적·계약번호·용도로 정함)` : ''}">${esc(gv2(g))}</h2>${statV2(S)}</header>`
      + `<div class="og-b">${subs.map(([k, v], i) => sub(k, v, i)).join('')}</div></section>`;
    return `<section class="og" id="og-${gi}" data-g="${esc(g)}"><header class="og-h"><h2>${esc(g)}</h2><div class="og-s">${stat(S)}${S.est ? `<span class="gs est" title="주문서 판매부서가 없어 실적·계약번호·용도로 판매그룹을 정한 계약">그룹 추정 ${S.est}</span>` : ''}</div></header>`
      + `<div class="og-b">${subs.map(([k, v], i) => sub(k, v, i)).join('')}</div></section>`;
  }
  // 주문 충당(10/28 사용자: 2주치 주문이 깔려 있어야 — 라인별 캐파, 목표 = 월차). 핵심 숫자만(사용자 '부연설명 많다')
  function coverCard() {
    const C = O.cover;
    if (!C || !C.lines || !C.lines.length) return '';
    const tone = (r) => (r == null ? '' : r >= 1 ? '' : r >= 0.8 ? 'warn' : 'bad');
    const L = C.lines.filter((x) => x.line !== '공용'), U = C.lines.find((x) => x.line === '공용');
    let i = 0;
    const row = (x, tot) => {
      const r = x.need ? (x.have + x.soon) / x.need : null, r0 = x.need ? x.have / x.need : null, dd = x.need ? x.have / (x.need / C.days) : null;
      const hp = x.need ? Math.min(100, x.have / x.need * 100) : 0, sp = x.need ? Math.min(100 - hp, x.soon / x.need * 100) : 0;   // 막대 = 2주 생산량 100% 기준(넘으면 꽉 참)
      return `<tr class="${tot ? 'tot' : ''}"><td class="nm">${tot ? '' : `<i class="${tone(r)}"></i>`}${esc(x.line)}</td>`
        + `<td class="gbar">${x.need ? `<div class="hb hb100" data-tip="소재 있음 ${Math.round(r0 * 100)}%" data-sub="2주 안 입고까지 ${Math.round(r * 100)}%"><i style="width:${hp}%;--i:${i++}"></i><u style="left:${hp}%;width:${sp}%"></u></div>` : ''}</td>`
        + `<td title="${x.need ? (x.spec ? `2주 생산량 ${n0(x.spec)} = 재계획 하루 톤 합(속도 = 2026.1월~ 실적 하루 생산량${(x.specDown || []).length ? ` · 정기수리 ${x.specDown.length}일 제외` : ''}) · 참고: 월차 기준 ${n0(x.tgt)}` : `월차 기준 ${n0(x.tgt)} · 재계획 ${n0(x.cap)} 중 작은 값`) : ''}">${x.need ? `<b>${n0(x.need)}</b><div class="sub">하루 ${n0(x.specDay || x.need / C.days)}</div>` : '-'}</td>`
        + `<td><b>${n0(x.have)}</b></td><td>${n0(x.soon)}</td>`
        + `<td class="ea" title="필요 생산일이 2주 뒤이고 다음 같은 강종 가동 때 만들어도 늦지 않는 주문 — 지금 만들면 재고만 늘어남(충당률에 안 넣음)">${(x.eHave || 0) + (x.eSoon || 0) >= 1 ? `${n0((x.eHave || 0) + (x.eSoon || 0))}${x.eHave >= 1 ? `<div class="sub">소재 있음 ${n0(x.eHave)}</div>` : ''}` : '-'}</td>`
        + `<td><b class="${tone(r) === 'bad' ? 'neg' : tone(r) === 'warn' ? 'wrn' : 'pos'}">${r == null ? '-' : Math.round(r * 100) + '%'}</b>${r0 == null ? '' : `<div class="sub">소재만 ${Math.round(r0 * 100)}%</div>`}</td>`
        + `<td title="${x.runStop ? `지금 소재로 오늘부터 하루씩 채움(주문별 같은 두께·폭 T/Hr, 재계획 강종 순서·정기수리 반영) → ${md(x.runStop.date)} ${x.runStop.fam} 소재 부족으로 중단${Object.keys(x.runStop.left || {}).length ? ` · 남은 소재 ${Object.entries(x.runStop.left).map(([k, v]) => `${k} ${v}시간`).join(', ')}(그 강종 가동 때 사용)` : ''}` : ''}"><b class="${(x.runDays ?? dd) != null && (x.runDays ?? dd) < 7 ? 'neg' : ''}">${x.runDays != null ? `${n1(x.runDays)}일` : dd == null ? '-' : Math.round(dd) + '일'}</b>${x.runStop ? `<div class="sub">${md(x.runStop.date)} ${esc(x.runStop.fam)} 소재 끝</div>` : ''}</td></tr>`;
    };
    const sum = (k) => L.reduce((a, x) => a + (x[k] || 0), 0);
    const T = { line: '도금 계', need: sum('need'), specDay: sum('specDay'), have: sum('have') + (U ? U.have : 0), soon: sum('soon') + (U ? U.soon : 0), eHave: sum('eHave') + (U ? U.eHave || 0 : 0), eSoon: sum('eSoon') + (U ? U.eSoon || 0 : 0), runDays: L.every((x) => x.runDays != null) ? Math.min(...L.map((x) => x.runDays)) : null };   // 계 = 먼저 멈추는 라인
    const rT = T.need ? (T.have + T.soon) / T.need : null, stop = L.filter((x) => x.runStop && x.runDays === T.runDays)[0];
    return `<details class="fold cov-f"><summary><b>2주 주문 충당</b> <span>${md(C.from)}~${md(C.to)}</span>${rT == null ? '' : ` · 충당률 <b class="${tone(rT) === 'bad' ? 'neg' : tone(rT) === 'warn' ? 'wrn' : ''}">${Math.round(rT * 100)}%</b>`}${T.runDays != null ? ` · 작업 가능 <b class="${T.runDays < 7 ? 'neg' : ''}">${n1(T.runDays)}일</b>${stop ? ` (${esc(stop.line)} ${md(stop.runStop.date)} ${esc(stop.runStop.fam)} 소재 끝)` : ''}` : ''}</summary><div class="cov">
      <div class="scroll"><table class="gt"><thead><tr class="cgh"><th colspan="3"></th><th colspan="2" class="gh" title="필요 생산일이 2주 안이거나, 2주 뒤라도 다음 같은 강종 가동일 전에 필요한 주문(지금 미생산 시 지연)">이번 2주 생산 대상</th><th></th><th colspan="2"></th></tr><tr><th class="l">라인</th><th class="l"></th><th title="재계획 하루 톤 합(속도 = 2026.1월~ 실적 하루 생산량) · 오늘은 자료 시각부터 남은 몫 · 생산 캘린더·가동 캘린더와 같은 값">2주 생산량</th><th>소재 있음</th><th>2주 안 입고</th><th class="ea">미뤄도 되는 주문<div class="sub">다음 같은 강종 때 · 충당률에 안 넣음</div></th><th title="(소재 있음 + 2주 안 입고) ÷ 2주 생산량">충당률</th><th title="지금 소재로 오늘부터 라인을 채울 수 있는 날수 — 주문별 T/Hr · 재계획 강종 순서 · 제원치 가동률, 그 강종 소재 소진일에 중단">작업 가능 일수</th></tr></thead>`
      + `<tbody>${L.map((x) => row(x)).join('')}${U && (U.have >= 1 || U.soon >= 500) ? `<tr><td class="nm">라인 미정</td><td></td><td></td><td><b>${n0(U.have)}</b></td><td>${n0(U.soon)}</td><td class="ea">${(U.eHave || 0) + (U.eSoon || 0) >= 1 ? n0((U.eHave || 0) + (U.eSoon || 0)) : '-'}</td><td></td><td></td></tr>` : ''}${row(T, true)}</tbody></table></div>`
      + `<p class="od-note" style="margin:8px 0 0">막대 = 2주 생산량 100% 기준 · 진한 칸 = 소재 있음 · 빗금 = 2주 안 입고 · 머리글·숫자에 마우스를 올리면 계산 근거</p></div></details>`;
  }
  /* 첫 화면 결론(11/11): 조치가 필요한 묶음(건·미입고 t)을 크게 → 누르면 아래 목록이 그 묶음만. 이번 주(수~화) 필요 입고 도래분 한 줄 · 2주 충당은 접기 */
  const TOP = ['late', 'nopo', 'hurry', 'chk', 'act'], TIP = { late: '필요 입고일 지남 · 미입고', nopo: '소재(F/H) 발주 전', hurry: '필요 입고 3주 이내 · 열연 이전 — 포스코에 진행 단축 요청', chk: '필요 입고 2주 안 · 미입고 — 입고 일정 확인', act: '소재 지연 + 미발주 + 포스코 독촉 + 입고 확인' };
  const wed = (s) => { const d = new Date(s + 'T00:00:00Z'); return new Date(d.getTime() - ((d.getUTCDay() + 4) % 7) * 864e5).toISOString().slice(0, 10); };
  const addD = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const matT = (x) => (x.st === '미발주' ? Math.max(0, (x.ordT || 0) - (x.prodT || 0)) : x.remIn || 0);   // 소재 미확보 = 미입고(발주분) + 미발주 주문의 미생산 잔량
  function topCard(R) {
    const sm = (X) => ({ n: X.length, t: X.reduce((a, x) => a + matT(x), 0) });
    const tiles = TOP.map((f) => { const S = sm(R.filter(F[f][1])), tone = f === 'late' || (f === 'nopo' && !V2()) ? 'bad' : 'warn';
      return `<button type="button" data-f="${f}" aria-pressed="${f === flt}" class="${S.n ? tone : ''}${f === 'act' ? ' all' : ''}" title="${esc(TIP[f])}"><div class="l">${F[f][0]}</div><div class="v">${n0(S.n)}<small>건</small></div><div class="s">소재 미확보 ${n0(S.t)}t</div></button>`; }).join('');
    const td = window.UI && UI.today ? UI.today(O.asOf) : O.asOf, w0 = wed(td), w1 = addD(w0, 6), W = R.filter((x) => matT(x) > 0.5 && x.needIn && x.needIn >= w0 && x.needIn <= w1), WL = W.filter((x) => x.lateIn || x.hurry || x.chk || x.st === '미발주');
    return `<section class="card od-top"><h2>지금 문제 · 할 일 <small>누르면 아래 목록이 그 계약만</small></h2><div class="od-kpi od-k5" id="od-kpi">${tiles}</div>`
      + `<p class="od-wk">이번 주(${md(w0)}~${md(w1)}) 필요 입고 도래 소재 미확보 <b>${n0(W.reduce((a, x) => a + matT(x), 0))}t</b> · ${n0(W.length)}건${!WL.length ? '' : WL.length === W.length ? ' · <b class="neg">모두 조치 필요</b>' : ` · 그중 지연·독촉·확인·미발주 <b class="neg">${n0(WL.reduce((a, x) => a + matT(x), 0))}t</b>`}</p>${coverCard()}</section>`;
  }
  function basisFold() {
    const B = O.basis || {}, li = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    return `<details class="fold od-fold"><summary>기준·사양</summary><dl class="od-def">`
      + li('기준일', `${UI.fmtDate(O.asOf)} · 자료 ${esc(O.dataAt || '')} · 생산 남은 계약 전부(납기 무관)`)
      + li('필요 입고일', `내수 납기 −${B.leadIn + B.prep}일 · 수출 출항 −${B.leadIn + B.prep}일(입고 ${B.leadIn}일 + 준비 ${B.prep}일)`)
      + li('예상 입고', `F/H 인도기한 ${O.dleOff}일(실적 ${n0(O.dleOffN)}건 중앙값) — 포스코 입고예정이 없을 때`)
      + li('소재 지연', '필요 입고일 지남 · 미입고') + li('포스코 독촉', '필요 입고 3주 이내 · 열연 이전') + li('입고 확인', '필요 입고 2주 안 미입고 · 인도기한 지났는데 입고 기록 없음') + li('미발주', '소재(F/H) 발주 전') + li('소재 미확보', '미입고(발주한 소재 중 아직 안 들어온 양) + 미발주 주문의 미생산 잔량')
      + li('최근 2주 생산', '실제 생산 중 필요 생산일(수출 출항 −1 · 내수 납기 −1) 안에 끝난 톤 비율')
      + li('규격 이름', 'MES 코드표(주문규격기준)의 규격 번호·품질 등급(CQ 일반용 · DQ 가공용 · DDQ 심가공용 · EDDQ 초심가공용 · Gr 구조용)으로 붙인 이름 — 마우스를 올리면 원코드')
      + li('참고', '<a href="leadtime.html">소재 리드타임 표 →</a> · <a href="risk.html">납기 위험 →</a>')
      + '</dl></details>';
  }
  function render() {
    const R = O.rows;
    let L = R.filter(F[flt][1]);
    if (ln) L = L.filter((x) => x.line === ln);
    if (ex) L = L.filter((x) => (ex === 'E') === !!x.exp);
    if (q) { const qq = q.toUpperCase(); L = L.filter((x) => [x.con, x.cus, x.lcus, x.man, x.dst, x.spec, x.pspec, window.UI && UI.specKo && (UI.specKo(x.pspec) || {}).ko, x.pdt, x.grp].join(' ').toUpperCase().includes(qq)); }
    const G0 = O.groups || [];
    const groups = G0.concat([...new Set(L.map((x) => x.grp || '그룹 미상'))].filter((g) => !G0.includes(g)));
    const byG = groups.map((g) => [g, L.filter((x) => (x.grp || '그룹 미상') === g)]).filter((e) => e[1].length);
    const S = sumOf(L);
    $('od-meta').textContent = `${UI.fmtDate(O.asOf)} 기준 · 생산 남은 계약 전부(납기 무관)`;
    const wait = [!O.hasRun && '포스코 진행', !O.hasCus && '고객사·담당자', !O.hasFull && '목적지'].filter(Boolean);
    const scN = window.UI && UI.scope && UI.scope() === 'C' ? '<p class="od-wait">이 화면은 도금 주문입니다 — <a href="cc_order.html?pl=C">컬러 주문진도 →</a></p>' : '';
    $('od-main').innerHTML = scN + topCard(R) + `<section class="card"><h2>판매그룹 → ${BY[by][0]}별 주문진도</h2>`
      + (wait.length ? `<p class="od-wait">⏳ ${wait.join(' · ')}: 다음 자동 실행(07:35) 뒤</p>` : '')
      + `<div class="od-flt"><span class="lb">묶음</span><span class="seg" id="od-by">${Object.keys(BY).map((b) => `<button type="button" data-b="${b}" aria-pressed="${b === by}">${BY[b][0]}별</button>`).join('')}</span>`
      + `<select id="od-f" aria-label="상태">${Object.keys(F).map((f) => `<option value="${f}"${f === flt ? ' selected' : ''}>${F[f][0]} ${n0(R.filter(F[f][1]).length)}</option>`).join('')}</select>`
      + `<select id="od-ln" aria-label="라인"><option value="">라인 전체</option><option${ln === '1CGL' ? ' selected' : ''}>1CGL</option><option${ln === '2CGL' ? ' selected' : ''}>2CGL</option></select>`
      + `<select id="od-ex" aria-label="내수·수출"><option value="">내수·수출</option><option value="E"${ex === 'E' ? ' selected' : ''}>수출</option><option value="D"${ex === 'D' ? ' selected' : ''}>내수</option></select>`
      + `<input id="od-q" placeholder="계약번호·고객사·담당자·목적지·규격 찾기" value="${esc(q)}"><span class="cnt">${n0(S.n)}건 · 미입고 ${n0(S.rem)}t</span>`
      + '<button type="button" class="lnk" id="od-open">모두 펼치기</button><button type="button" class="lnk" id="od-close">모두 접기</button></div>'
      + (byG.length ? '' : '<p class="od-note">해당 계약이 없습니다.</p>')
      + (V2() ? grpChartV2(byG) : grpChart(byG)) + byG.map(([g, v], gi) => group(g, v, gi)).join('') + '</section>' + basisFold();
    $('od-kpi').querySelectorAll('button').forEach((b) => b.onclick = () => { flt = flt === b.dataset.f ? 'all' : b.dataset.f; render(); });
    $('od-f').onchange = (e) => { flt = e.target.value; render(); };
    $('od-main').querySelectorAll('.gf').forEach((b) => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const box = b.closest('details.sg') || b.closest('section.og'), f = box.dataset.sf === b.dataset.sf ? '' : b.dataset.sf;
      box.dataset.sf = f;
      box.querySelectorAll(':scope > summary .gf, :scope > header .gf').forEach((x) => x.setAttribute('aria-pressed', String(!!f && x.dataset.sf === f)));
      if (box.tagName === 'DETAILS') box.open = true; else if (f) box.querySelectorAll(`details.sg.h-${f}`).forEach((d) => { d.open = true; });
    });
    $('od-main').querySelectorAll('.gcn').forEach((b) => b.onclick = () => {
      const g = b.dataset.g; flt = b.dataset.gf; render();
      const sec = g ? [...document.querySelectorAll('section.og')].find((x) => x.dataset.g === g) : null;
      if (sec) { sec.querySelectorAll('details.sg').forEach((d) => { d.open = true; }); sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
    $('od-by').querySelectorAll('button').forEach((b) => b.onclick = () => { by = b.dataset.b; try { localStorage.setItem(BY_KEY, by); } catch (e) { /* 무시 */ } render(); });
    $('od-q').oninput = (e) => { q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); const i = $('od-q'); i.focus(); i.setSelectionRange(q.length, q.length); }, 250); };
    $('od-ln').onchange = (e) => { ln = e.target.value; render(); };
    $('od-ex').onchange = (e) => { ex = e.target.value; render(); };
    $('od-open').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = true; });
    $('od-close').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = false; });
    if (V2() && !render.tg) { render.tg = 1; $('od-main').addEventListener('click', (e) => {   // 계약 줄 누르면 상세 줄 펼침
      const tr = e.target.closest('table.od2 tr.r'); if (!tr || e.target.closest('a, button')) return;
      const d = tr.nextElementSibling; if (d && d.classList.contains('dt')) { d.hidden = !d.hidden; tr.classList.toggle('on', !d.hidden); }
    }); }
    if (window.UI) UI.reveal($('od-main'));
  }
  /* 11/11 회의 '도금 주문진도에 컬러가 나온다 — 치워라': 판매그룹이 컬러수출·컬러건재·수요개발인 도금 계약은 컬러 공장 투입용 도금(자가재, tools/order_demand.order_cls 와 같음)
     → '자가재(컬러 투입)' 한 묶음으로 맨 뒤에(컬러 판매그룹 이름이 도금 화면에 안 나오게 · 도금 라인이 만들어야 하는 물량이라 지우지는 않음) */
  const SELF = '자가재(컬러 투입)', isSelf = (g) => /^컬러|^수요/.test(String(g || ''));
  function selfGroups() {
    if (O._self) return; O._self = true;
    O.rows.forEach((x) => { if (isSelf(x.grp)) { x.grpOrg = x.grp; x.grp = SELF; } });
    O.groups = (O.groups || []).filter((g) => !isSelf(g)).concat(O.rows.some((x) => x.grp === SELF) ? [SELF] : []);
    const P = O.perf && O.perf.groups;
    if (P) { const m = { t: 0, known: 0, ok: 0, shipT: 0, shipOk: 0 }; let has = false;
      Object.keys(P).filter(isSelf).forEach((g) => { has = true; Object.keys(m).forEach((k) => { m[k] += P[g][k] || 0; }); delete P[g]; });
      if (has) P[SELF] = m; }
  }
  // 11/11 회의 '도금·컬러 나누는 거 — 컬러 눌러도 똑같다': 위 보기에서 컬러를 누르면 컬러 주문진도로
  if (window.UI && UI.onScope) UI.onScope(() => { if (UI.scope() === 'C') location.href = 'cc_order.html?pl=C'; });
  const envReady = GP.latest('cg_order_progress.enc.json'), calReady = GP.latest('cg_calendar.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('od-msg').textContent = '게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('od-form').hidden = false; $('od-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    try { const ce = await calReady; if (ce) CAL = (await GP.decryptJSON(ce, pw)).contracts || null; } catch (e) { CAL = null; }
    selfGroups();
    render();
  }
  $('od-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('od-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('od-form').hidden = false; });
})();
