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
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const ymd8 = (s) => (s && String(s).length >= 8 ? `${+String(s).slice(4, 6)}/${+String(s).slice(6, 8)}` : '');
  let CAL = null;                                            // 계약번호-행번 → 2주 캘린더 생산일
  let O = null, flt = 'act', q = '', ln = '', ex = '', by = 'dst';
  try { by = localStorage.getItem(BY_KEY) || 'dst'; } catch (e) { /* 무시 */ }
  const F = {
    act: ['조치 필요', (x) => x.hurry || x.lateIn || x.chk || x.st === '미발주'],
    late: ['소재 지연', (x) => x.lateIn],
    hurry: ['포스코 독촉', (x) => x.hurry],
    chk: ['입고 확인 필요', (x) => x.chk],
    posco: ['포스코 진행', (x) => x.st === '포스코 진행' || x.st.startsWith('발주')],
    ready: ['입고 완료', (x) => x.st === '입고 완료'],
    prod: ['생산 중', (x) => x.st === '생산 중'],
    done: ['생산 완료', (x) => x.st === '생산 완료'],
    all: ['전체', () => true],
  };
  const BY = {
    dst: ['목적지', (x) => x.dst, () => (O.hasFull ? '목적지 코드 없음' : '목적지 — 다음 자동 실행부터')],
    cus: ['고객사', (x) => x.cus, () => (O.hasCus ? '고객사 확인 안 됨' : '고객사 — 다음 자동 실행부터')],
    man: ['담당자', (x) => x.man, () => (O.hasCus ? '담당자 확인 안 됨' : '담당자 — 다음 자동 실행부터')],
  };
  if (!BY[by]) by = 'dst';
  function stBadge(x) {
    if (x.lateIn) return '<span class="st late">소재 지연</span>';
    if (x.hurry) return '<span class="st hurry" title="필요 입고 3주 안인데 아직 열연 이전 — 포스코에 진행을 당겨 달라고 요청">포스코 독촉</span>';
    if (x.chk) return '<span class="st hurry">입고 확인</span>';
    const c = { '입고 완료': 'ok', '생산 중': 'mid', '생산 완료': 'ok', '미발주': 'late' }[x.st] || 'na';
    return `<span class="st ${c}">${esc(x.st)}</span>`;
  }
  function stages(x) {
    const s = x.stg || {};
    const k = Object.keys(s);
    if (!k.length) return !O.hasRun ? '<span class="sub">다음 자동 실행부터</span>' : x.remIn <= 0.5 ? '<span class="sub">-</span>' : x.runSt === 'done' ? '<span class="sub nw" title="포스코 생산은 끝났고 우리 입고 전(운송·입고 처리 중)">포스코 생산 끝 · 입고 전</span>' : x.runRow ? '<span class="rem nw" title="포스코 주문은 접수됐지만 아직 어느 공정에도 물량 없음 = 생산 투입 전">포스코 착수 전</span>' : `<span class="sub nw" title="F/H 발주는 했는데 포스코 주문진행에 아직 안 올라옴(최근 발주는 며칠 걸림)">포스코 접수 전</span>${x.purDt && (Date.parse(O.asOf) - Date.parse(`${x.purDt.slice(0, 4)}-${x.purDt.slice(4, 6)}-${x.purDt.slice(6, 8)}`)) / 864e5 > 14 ? '<div class="rem nw">발주 2주 넘음 · 확인</div>' : ''}`;
    return k.map((nm) => `<span class="stg${nm === x.stage ? ' cur' : ''}">${esc(nm)} ${n1(s[nm])}t</span>`).join('');
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
    return `<div class="${c.late ? 'rem' : ''}">생산 <b>${md(c.from)}</b>${c.to !== c.from ? `~${md(c.to)}` : ''}</div><div class="sub">${esc(c.line || '')} ${n1(c.t)}t${x.woN ? ` · 지시 ${x.woN}코일` : ''}</div>`;
  }
const GRN = { CQ: 'CQ', DQ: 'DQ', DDQ: 'DDQ', EDDQ: 'EDDQ', LFQ: 'LFQ', GRC: 'Gr.C', GRD: 'Gr.D', GRE: 'Gr.E', GRA: 'Gr.A', GRB: 'Gr.B', GrC: 'Gr.C', GrD: 'Gr.D', GrE: 'Gr.E', GrA: 'Gr.A', GrB: 'Gr.B' };
  function row(x) {
    const past = x.lateIn && x.needIn ? Math.round((Date.parse(O.asOf) - Date.parse(x.needIn)) / 864e5) : 0;   // 소재 지연이면 '여유' 대신 필요 입고일이 며칠 지났는지
    const est = x.etaSrc === '예상 입고';                        // 여유 = 필요 입고일 − 포스코 입고예정(없으면 인도기한 + 실적 중앙값 = 예상 입고)
    const etaPast = x.eta && x.remIn > 0.5 && x.eta < O.asOf;   // 예상 입고일이 지났는데 아직 다 안 들어옴 → '여유' 대신 확인
    const sl = past > 0 ? `<div class="sl neg">${past}일 지남</div>` : etaPast ? `<div class="sl neg" title="F/H 예상 입고일(인도기한 기준)이 지났는데 아직 안 들어옴 — 포스코에 진행 확인">예상 ${md(x.eta)} 지남</div><div class="sub">미입고 → 포스코 확인</div>` : (x.slack == null ? '' : `<div class="sl ${x.slack < 0 ? 'neg' : est ? '' : 'pos'}">${x.slack < 0 ? `${-x.slack}일 늦음` : `${x.slack}일 여유`}</div>${x.eta ? `<div class="sub">${est ? '예상' : '입고예정'} ${md(x.eta)}</div>` : ''}`);
    const needOn = x.remIn > 0.5;                                 // 소재가 다 들어왔으면(입고 완료·생산) 필요 입고일은 의미 없음
    const nm = (t, pre) => `<span class="nmw" title="${esc(t)}">${pre || ''}${esc(t).replace(/-/g, '\u2011').replace(/\(/g, '\u200b(')}</span>`;   // 이름은 띄어쓰기·괄호 앞에서만 줄 바꿈(하이픈에서 안 끊음)
    const who = [by !== 'cus' && x.cus ? nm(x.cus) : '', x.lcus && x.lcus !== x.cus ? nm(x.lcus, '최종\u00a0') : '', by !== 'man' && x.man ? `<span class="nw">담당 ${esc(x.man)}</span>` : '', by !== 'dst' && x.dst ? `<span class="nw">→ ${esc(x.dst)}</span>` : ''].filter(Boolean);
    return `<tr><td>${stBadge(x)}${x.woWait ? '<div class="sub">작업지시됨</div>' : ''}</td>`
      + `<td><div class="con">${esc(x.con)}</div><div class="sub">${[x.line, x.pln, x.usg && `<span class="nw" title="용도 코드">용도 ${esc(x.usg)}${x.usgNm ? ` ${esc(x.usgNm)}` : ''}</span>`].filter(Boolean).join(' · ')}</div></td>`
      + `<td><div class="chips">${prodChips(x)}</div><div class="sz">${x.thk != null ? `${(+x.thk).toFixed(2)} × ${n0(x.wdt)}` : ''}${x.ordT ? ` <span class="sub">· 주문 ${n1(x.ordT)}t</span>` : ''}</div>${x.pspec || x.spec ? `<div class="sub">${x.pspec ? `<span class="nw" title="주문 제품 규격">제품 ${esc(x.pspec)}${x.grade ? ` <b>${esc(GRN[x.grade] || x.grade)}</b>` : ''}</span>` : ''}${x.pspec && x.spec ? ' · ' : ''}${x.spec ? `<span class="nw" title="소재(F/H) 규격 — 포스코 강종 약호">소재 ${esc(x.spec)}${x.specGr ? ` ${esc(GRN[x.specGr] || x.specGr)}` : ''}</span>` : ''}</div>` : ''}</td>`
      + `<td>${who.length ? who.map((w) => `<div>${w}</div>`).join('') : '<span class="sub">-</span>'}</td>`
      + `<td class="nw">납기 <b>${md(x.due) || '-'}</b>${x.arr ? `<div>입항 <b>${md(x.arr)}</b></div>` : ''}${x.shp && !/^TBN/i.test(x.shp) ? `<div class="sub">${esc(String(x.shp).split('_')[0])}</div>` : ''}${x.shipMiss ? '<div><span class="st late" title="배 입항일이 지났는데 아직 생산 전 — 배선 변경 확인">입항 지남</span></div>' : ''}</td>`
      + `<td class="num">${x.purT ? `<b>${n1(x.purT)}t</b><div class="sub">발주 ${ymd8(x.purDt)}</div>${x.dle ? `<div class="sub">인도기한 ${md(x.dle)}</div>` : ''}` : '<span class="sub">미발주</span>'}</td>`
      + `<td>${stages(x)}${x.early && x.remIn > 0.5 ? `<div class="rem">열연 이전 ${n1(x.early)}t</div>` : ''}</td>`
      + `<td class="num">${x.entT ? `<b>${n1(x.entT)}t</b>${x.entFirst ? `<div class="sub">첫 입고 ${md(x.entFirst)}</div>` : ''}` : '<span class="sub">0</span>'}${x.remIn ? `<div class="rem">미입고 ${n1(x.remIn)}t</div>` : ''}</td>`
      + `<td class="num">${calTxt(x)}${x.sche && !(CAL && CAL[x.con]) ? `<div>예정 <b>${md(x.sche)}</b></div>` : ''}${x.prodT ? `<b>${n1(x.prodT)}t</b>${x.prodLast ? `<div class="${x.st === '생산 완료' ? 'done' : 'sub'}">${x.st === '생산 완료' ? '완료' : '마지막'} ${md(x.prodLast)}</div>` : ''}` : (x.sche || (CAL && CAL[x.con]) ? '' : '<span class="sub">-</span>')}${x.fwdT ? `<div class="sub">출하 ${n1(x.fwdT)}t${x.fwdLast ? ` ${md(x.fwdLast)}` : ''}</div>` : ''}</td>`
      + `<td class="num">${needOn && x.needIn ? `<b>${md(x.needIn)}</b>${sl}` : '<span class="sub">-</span>'}</td></tr>`;
  }
  const COLS = '<colgroup>' + [8, 12.5, 15, 13, 8, 8, 10.5, 8.5, 7.5, 9].map((w) => `<col style="width:${w}%">`).join('') + '</colgroup>';
  const HEAD = '<thead><tr><th>상태</th><th>계약번호-행번</th><th>제품 · 두께×폭</th><th>고객사·담당·목적지</th><th>납기 · 입항</th><th class="num">F/H 발주</th><th>포스코 진행</th><th class="num">입고 · 미입고</th><th class="num">생산</th><th class="num">필요 입고</th></tr></thead>';
  const sumOf = (L) => ({ n: L.length, rem: L.reduce((s, x) => s + (x.remIn || 0), 0), hurry: L.filter((x) => x.hurry).length, chk: L.filter((x) => x.chk).length, late: L.filter((x) => x.lateIn).length, est: L.filter((x) => x.grpSrc && x.grpSrc !== '주문').length, need: L.filter((x) => x.remIn > 0.5).map((x) => x.needIn).filter(Boolean).sort()[0] });
  const stat = (S) => `<span class="gs"><b>${n0(S.n)}</b>건</span><span class="gs">미입고 <b>${n0(S.rem)}</b>t</span>`
    + (S.late ? `<span class="gs bad">소재 지연 <b>${S.late}</b></span>` : '') + (S.hurry ? `<span class="gs warn">독촉 <b>${S.hurry}</b></span>` : '') + (S.chk ? `<span class="gs warn">입고 확인 <b>${S.chk}</b></span>` : '')
    + (S.need ? `<span class="gs">가장 급한 필요 입고 <b>${md(S.need)}</b></span>` : '');
  function sub(name, L) {
    const S = sumOf(L);
    L.sort((a, b) => (b.lateIn - a.lateIn) || (b.hurry - a.hurry) || (b.chk - a.chk) || String(a.needIn || a.due || '9').localeCompare(String(b.needIn || b.due || '9')) || a.con.localeCompare(b.con));
    const open = S.late > 0 && L.length <= 40;
    return `<details class="sg"${open ? ' open' : ''}><summary><span class="sn">${esc(name)}</span><span class="ss">${stat(S)}</span></summary>`
      + `<div class="scroll"><table class="t od">${COLS}${HEAD}<tbody>${L.map(row).join('')}</tbody></table></div></details>`;
  }
  function group(g, L, gi) {
    const S = sumOf(L);
    const m = new Map();
    for (const x of L) { const k = BY[by][1](x) || BY[by][2](); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    const subs = [...m.entries()].map((e) => [e[0], e[1], sumOf(e[1])])
      .sort((a, b) => (b[2].late - a[2].late) || (b[2].hurry - a[2].hurry) || (b[2].chk - a[2].chk) || (b[2].n - a[2].n) || String(a[0]).localeCompare(String(b[0])));
    return `<section class="og" id="og-${gi}"><header class="og-h"><h2>${esc(g)}</h2><div class="og-s">${stat(S)}${S.est ? `<span class="gs est" title="주문서 판매부서가 없어 실적·계약번호·용도로 판매그룹을 정한 계약">그룹 추정 ${S.est}</span>` : ''}</div></header>`
      + `<div class="og-b">${subs.map(([k, v]) => sub(k, v)).join('')}</div></section>`;
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
        + `<td class="gbar">${x.need ? `<div class="hb hb100" title="소재 있음 ${Math.round(r0 * 100)}% + 2주 안 입고 → ${Math.round(r * 100)}%"><i style="width:${hp}%;--i:${i++}"></i><u style="left:${hp}%;width:${sp}%"></u></div>` : ''}</td>`
        + `<td title="${x.need ? (x.spec ? `제원치 2주 ${n0(x.spec)}(판생점검 제원치: 라인 월 생산량 ÷ 가동일 × 14일${(x.specDown || []).length ? ` − 정기수리 ${x.specDown.length}일` : ''}) · 참고: 월차 기준 ${n0(x.tgt)} · 재계획 ${n0(x.cap)}` : `월차 기준 ${n0(x.tgt)} · 재계획 ${n0(x.cap)} 중 작은 값`) : ''}">${x.need ? `<b>${n0(x.need)}</b><div class="sub">하루 ${n0(x.need / C.days)}</div>` : '-'}</td>`
        + `<td><b>${n0(x.have)}</b></td><td>${n0(x.soon)}</td>`
        + `<td><b class="${tone(r) === 'bad' ? 'neg' : tone(r) === 'warn' ? 'wrn' : 'pos'}">${r == null ? '-' : Math.round(r * 100) + '%'}</b>${r0 == null ? '' : `<div class="sub">소재만 ${Math.round(r0 * 100)}%</div>`}</td>`
        + `<td title="${x.runStop ? `지금 소재로 오늘부터 하루씩 채움(주문별 같은 두께·폭 T/Hr, 재계획 강종 순서·정기수리 반영) → ${md(x.runStop.date)} ${x.runStop.fam} 소재가 모자라 멈춤${Object.keys(x.runStop.left || {}).length ? ` · 남은 소재 ${Object.entries(x.runStop.left).map(([k, v]) => `${k} ${v}시간`).join(', ')}(그 강종 가동 때 사용)` : ''}` : ''}"><b class="${(x.runDays ?? dd) != null && (x.runDays ?? dd) < 7 ? 'neg' : ''}">${x.runDays != null ? `${n1(x.runDays)}일` : dd == null ? '-' : Math.round(dd) + '일'}</b>${x.runStop ? `<div class="sub">${md(x.runStop.date)} ${esc(x.runStop.fam)} 소재 끝</div>` : ''}</td></tr>`;
    };
    const sum = (k) => L.reduce((a, x) => a + (x[k] || 0), 0);
    const T = { line: '도금 계', need: sum('need'), have: sum('have') + (U ? U.have : 0), soon: sum('soon') + (U ? U.soon : 0), runDays: L.every((x) => x.runDays != null) ? Math.min(...L.map((x) => x.runDays)) : null };   // 계 = 먼저 멈추는 라인
    return `<section class="card cov"><h2>2주 주문 충당 <small>${md(C.from)}~${md(C.to)}</small><span class="unit">톤</span></h2>
      <div class="scroll"><table class="gt"><thead><tr><th class="l">라인</th><th class="l"></th><th>2주 생산량</th><th>소재 있음</th><th>2주 안 입고</th><th>충당률</th><th>작업 가능 일수</th></tr></thead>`
      + `<tbody>${L.map((x) => row(x)).join('')}${U && (U.have >= 1 || U.soon >= 500) ? `<tr><td class="nm">라인 미정</td><td></td><td></td><td><b>${n0(U.have)}</b></td><td>${n0(U.soon)}</td><td></td><td></td></tr>` : ''}${row(T, true)}</tbody></table></div>`
      + `<p class="od-note" style="margin:8px 0 0">막대 = 2주 생산량을 100%로 · 진한 칸 = 소재 있음 · 빗금 = 2주 안 입고 · 꽉 차면 충분 — 2주 생산량(라인 하나) = 제원치(판생점검 '제원치 검토' 라인 월 생산량 ÷ 가동일) × 2주 가동일 · 숫자에 마우스를 올리면 계산 · 충당률 = (소재 있음 + 2주 안 입고) ÷ 2주 생산량 · 작업 가능 일수 = 지금 소재로 오늘부터 라인을 채울 수 있는 날수(주문별 T/Hr · 재계획 강종 순서 · 제원치 가동률, 그 강종 소재가 떨어지는 날에서 멈춤)</p></section>`;
  }
  function render() {
    const R = O.rows;
    const cnt = (f) => R.filter(F[f][1]).length;
    const kpi = Object.keys(F).map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === flt}"><div class="l">${F[f][0]}</div><div class="v${f === 'late' ? ' bad' : f === 'hurry' || f === 'chk' || f === 'act' ? ' warn' : ''}">${n0(cnt(f))}</div></button>`).join('');
    let L = R.filter(F[flt][1]);
    if (ln) L = L.filter((x) => x.line === ln);
    if (ex) L = L.filter((x) => (ex === 'E') === !!x.exp);
    if (q) { const qq = q.toUpperCase(); L = L.filter((x) => [x.con, x.cus, x.lcus, x.man, x.dst, x.spec, x.pdt, x.grp].join(' ').toUpperCase().includes(qq)); }
    const G0 = O.groups || [];
    const groups = G0.concat([...new Set(L.map((x) => x.grp || '그룹 미상'))].filter((g) => !G0.includes(g)));
    const byG = groups.map((g) => [g, L.filter((x) => (x.grp || '그룹 미상') === g)]).filter((e) => e[1].length);
    const S = sumOf(L);
    $('od-meta').textContent = `${O.asOf} 기준 · 납기 −30일 ~ +90일 계약`;
    const wait = [!O.hasRun && '포스코 진행', !O.hasCus && '고객사·담당자', !O.hasFull && '목적지'].filter(Boolean);
    $('od-main').innerHTML = coverCard() + `<section class="card"><h2>판매그룹 → ${BY[by][0]}별 주문진도</h2><div class="od-kpi" id="od-kpi">${kpi}</div>`
      + `<p class="od-note">필요 입고일 = 내수 납기 −${O.basis.leadIn + O.basis.prep}일 · 수출 입항 −${O.basis.leadIn + O.basis.prep + 1}일 · 예상 입고 = F/H 인도기한 ${O.dleOff}일 · 포스코 독촉 = 필요 입고 3주 안인데 아직 열연 이전 · 입고 확인 = 필요 입고 2주 안 미입고 · 소재 지연 = 필요 입고일 지남</p>`
      + (wait.length ? `<p class="od-wait">⏳ ${wait.join(' · ')}: 다음 자동 실행(07:35) 뒤</p>` : '')
      + `<div class="od-flt"><span class="lb">묶음</span><span class="seg" id="od-by">${Object.keys(BY).map((b) => `<button type="button" data-b="${b}" aria-pressed="${b === by}">${BY[b][0]}별</button>`).join('')}</span>`
      + `<select id="od-ln" aria-label="라인"><option value="">라인 전체</option><option${ln === '1CGL' ? ' selected' : ''}>1CGL</option><option${ln === '2CGL' ? ' selected' : ''}>2CGL</option></select>`
      + `<select id="od-ex" aria-label="내수·수출"><option value="">내수·수출</option><option value="E"${ex === 'E' ? ' selected' : ''}>수출</option><option value="D"${ex === 'D' ? ' selected' : ''}>내수</option></select>`
      + `<input id="od-q" placeholder="계약번호·고객사·담당자·목적지 찾기" value="${esc(q)}"><span class="cnt">${n0(S.n)}건 · 미입고 ${n0(S.rem)}t</span>`
      + '<button type="button" class="lnk" id="od-open">모두 펼치기</button><button type="button" class="lnk" id="od-close">모두 접기</button></div>'
      + (byG.length ? `<nav class="og-sum">${byG.map(([g, v], gi) => { const s = sumOf(v); return `<a href="#og-${gi}" class="og-chip"><b>${esc(g)}</b> ${n0(s.n)}건${s.late ? ` · <span class="bad">지연 ${s.late}</span>` : ''}${s.hurry ? ` · <span class="warn">독촉 ${s.hurry}</span>` : ''}${s.chk ? ` · <span class="warn">입고 확인 ${s.chk}</span>` : ''}</a>`; }).join('')}</nav>` : '<p class="od-note">해당 계약이 없습니다.</p>')
      + byG.map(([g, v], gi) => group(g, v, gi)).join('') + '</section>';
    $('od-kpi').querySelectorAll('button').forEach((b) => b.onclick = () => { flt = b.dataset.f; render(); });
    $('od-by').querySelectorAll('button').forEach((b) => b.onclick = () => { by = b.dataset.b; try { localStorage.setItem(BY_KEY, by); } catch (e) { /* 무시 */ } render(); });
    $('od-q').oninput = (e) => { q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); const i = $('od-q'); i.focus(); i.setSelectionRange(q.length, q.length); }, 250); };
    $('od-ln').onchange = (e) => { ln = e.target.value; render(); };
    $('od-ex').onchange = (e) => { ex = e.target.value; render(); };
    $('od-open').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = true; });
    $('od-close').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = false; });
    if (window.UI) UI.reveal($('od-main'));
  }
  const envReady = GP.latest('cg_order_progress.enc.json'), calReady = GP.latest('cg_calendar.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('od-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('od-form').hidden = false; $('od-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    try { const ce = await calReady; if (ce) CAL = (await GP.decryptJSON(ce, pw)).contracts || null; } catch (e) { CAL = null; }
    render();
  }
  $('od-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('od-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('od-form').hidden = false; });
})();
