/* 수주 관제(11/7 사용자 '수주팀 PDF 양식 그대로 탭 하나 새로 만들어') — 6개 화면 = 주소 #dash #order #prod #mat #stock #close
   자료: published/suju.enc.json(gadong-plan tools/suju_build.py) · 조치 상태·원인·체크리스트·포스코 Room 입력 = 공유 저장소(CT.store, t:'suju')
   숫자 = 실제 자료(양식의 예시 숫자 안 씀). 자료가 아직 없는 칸은 '자료 연결 대기'로 둠 */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const VIEWS = ['dash', 'order', 'prod', 'mat', 'stock', 'close'];
  const TITLE = { dash: ['종합 관제판', '월 기준(이번 달 1일 ~ 오늘 누계) — 판매계획만큼 주문이 들어오고, 계획대로 만들고, 소재가 제때 들어오고, 재고가 상한 안에 있는가. 주문 확정만 주 단위(수요일 마감 → 다음 생산주)로 따짐'],
    order: ['수주 진도 관제', '언제까지 얼마를 더 받아야 하는가 — 주문 마감(매주 수 오전, W+1 생산) 기준으로 확정돼야 할 물량과 실제 확정 주문 비교'],
    prod: ['생산 관제', '확정된 주문을 계획대로 만들고 있는가 — 라인별 월 가동, 일별 계획 대비 실적, 다음 주 편성, T/hr 실적'],
    mat: ['소재 관제', '만들 소재가 제때 들어오는가 — 소재별 월 수급, 결품 위험, 이번 주 발주 대상'],
    stock: ['재고 관제', '결과로 남는 재고가 상한 안에 있는가 — 목표재고일수는 쌓는 기준이 아니라 넘지 않는 상한'],
    close: ['월 실적 마감', '매월 1~5일 전월 실적·재고 마감 후 판매·생산·재고 대사, 편차 원인 분류, 관리지표 추이, 다음 달 갱신 확인'] };
  let D = null, EV = [], bound = false, grpSel = 'all', lineSel = null, curveG = null;
  CT.boot(['suju.enc.json'], (X) => { D = X.suju; load(); });

  async function load() { try { EV = (await CT.store.events()).filter((e) => e && e.t === 'suju'); } catch (e) { EV = []; } draw(); }
  const evMap = (kind) => { const m = {}; for (const e of EV) if (e.kind === kind && e.id) m[e.id] = e; return m; };
  async function save(kind, id, val) { try { await CT.store.push({ t: 'suju', kind, id, val }); UI.toast && UI.toast('저장했습니다'); await load(); } catch (e) { alert('저장 실패: ' + e.message); } }

  const pl = () => CT.scope();
  const inPl = (p) => pl() === 'all' || pl() === p;
  const SC = { 정상: 'ok', 주의: 'warn', 경고: 'bad', 부족: 'bad', 확인: 'warn' };
  const B = (st, txt) => (st ? `<span class="ct-b ${SC[st] || 'na'}">${esc(txt || st)}</span>` : '<span class="ct-b na">–</span>');
  const pct = (v) => (v == null ? '–' : `${(+v).toFixed(1)}%`);
  const T = (v) => (v == null ? '–' : n0(v));
  const kt = (v) => (v == null ? '–' : `${(v / 1000).toFixed(1)}천톤`);
  const card = (n, title, sub, body, cls = '', nf = false) => `<section class="card ${cls}"><h2>${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ''}${nf && grpSel !== 'all' ? ' <small>· 그룹 선택 미적용(라인·소재 단위)</small>' : ''}</h2>${body}</section>`;
  const tbl = (head, rows, cls = '') => `<div class="ct-wrap"><table class="ct-t ${cls}"><thead><tr>${head.map((h) => (Array.isArray(h) ? `<th class="${h[1]}">${h[0]}</th>` : `<th>${h}</th>`)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const CW = (f) => Math.round(Math.max(480, ((document.getElementById('ct-main') || {}).clientWidth || 1200) * f - 50));   // 차트 = 실제 칸 너비(px) — 글자가 늘어나지 않게
  const wait = (txt) => `<div class="sj-wait">자료 연결 대기 — ${esc(txt)}</div>`;
  const dday = (d) => { const n = CT.diff(d, D.today); return n == null ? '' : n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };
  const groups = () => D.groups.filter((g) => inPl(g.plant) && (grpSel === 'all' || g.key === grpSel));

  function draw() {
    const m = document.getElementById('ct-main'), v = CT.view('dash', VIEWS);
    m.innerHTML = head() + `<div class="sj-h"><div><h2>${esc(TITLE[v][0])}</h2><p>${esc(TITLE[v][1])}</p></div></div>`
      + ({ dash, order, prod, mat, stock, close }[v])();
    m.querySelector('#sj-grp') && (m.querySelector('#sj-grp').onchange = (e) => { grpSel = e.target.value; draw(); });
    m.querySelectorAll('[data-act]').forEach((s) => (s.onchange = () => save('act', s.dataset.act, s.value)));
    m.querySelectorAll('[data-ck]').forEach((s) => (s.onchange = () => save('ck', s.dataset.ck, s.value)));
    m.querySelectorAll('[data-val]').forEach((s) => (s.onchange = () => save('val', s.dataset.val, s.value)));
    m.querySelectorAll('[data-line]').forEach((b) => (b.onclick = () => { lineSel = b.dataset.line; draw(); }));
    m.querySelectorAll('[data-cg]').forEach((b) => (b.onclick = () => { curveG = b.dataset.cg; draw(); }));
    if (!bound) { let rt = null; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); });
      bound = true; CT.onView(() => { draw(); window.scrollTo(0, 0); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }

  /* ---------- 공통 머리: 기준월·기준일·자료 시각 · 필터 · 이번 주 마감 · 월간 운영 일정 ---------- */
  function head() {
    const C = D.cfg, td = D.today, ym = D.month, nd = D.nDays, day = +td.slice(8);
        const top = `<div class="sj-top"><span class="sj-pill">기준월 <b>${ym.slice(0, 4)}.${ym.slice(5)}</b></span>`
      + `<span class="sj-pill b">기준일 ${md(td)}(${'일월화수목금토'[new Date(td + 'T00:00:00Z').getUTCDay()]}) · 경과 ${day - 1} / ${nd}일</span>`
      + `<span class="sj-pill s">실적·재고 ~${md(D.asOf)} · 주문 ${(() => { const t = String(D.dataAt.orderLatest || D.dataAt.order || ''); return t ? `${md(t)} ${esc(t.slice(11, 16))}` : '-'; })()}</span></div>`;
    // 이번 주 마감 칩: 운영 일정(이번 주 안에 걸린 것) + 주문 마감(수요일)
    const chips = [];
    const nextWed = D.weeks.map((w) => w.deadline).find((d) => d >= td);
    for (const s of C.schedule) {
      const a = `${ym}-${String(s.from).padStart(2, '0')}`, z = `${ym}-${String(Math.min(s.to, nd)).padStart(2, '0')}`;
      const k = CT.diff(a, td);
      if (z >= td && k <= 7) chips.push([a, `<span class="sj-chip ${k <= 2 ? 'r' : 'o'}"><span class="d">${k <= 0 ? '진행' : 'D-' + k}</span>${esc(s.label)} ${md(a)}${s.to !== s.from ? '~' + md(z) : ''}</span>`]);
    }
    if (nextWed) chips.push([nextWed, `<span class="sj-chip n"><span class="d">${dday(nextWed)}</span>주문 마감 ${md(nextWed)}(수) 오전 → 생산주 ${md(CT.addD(nextWed, 7))}~${md(CT.addD(nextWed, 13))}</span>`]);
    chips.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const gopt = ['<option value="all">전체 10개 그룹</option>', ...D.groups.filter((g) => inPl(g.plant)).map((g) => `<option value="${esc(g.key)}"${grpSel === g.key ? ' selected' : ''}>${esc(g.name)}</option>`)].join('');
    const flt = `<div class="sj-flt"><span>그룹</span><select id="sj-grp" aria-label="그룹">${gopt}</select><span class="small muted">컬러·도금은 위 공통 보기(전체/도금/컬러)로 거름</span>`
      + `<div class="sj-dl"><b class="h">이번 주 마감</b>${chips.map((c) => c[1]).join('') || '<span class="muted small">없음</span>'}</div></div>`;
    // 월간 운영 일정 띠
    // 월간 운영 일정: 왼쪽 = 일정 이름 · 상태, 오른쪽 = 날짜 막대(11/7 점검: 막대 안 글자가 잘리고 겹치던 것 → 이름 칸 분리)
    const X = (d) => ((d - 1) / nd * 100);
    const it = C.schedule.slice().sort((a, b) => a.from - b.from || a.to - b.to).map((s) => { const z = Math.min(s.to, nd), st = day > z ? ['완료', 'na'] : day >= s.from ? ['진행', 'warn'] : [`D-${s.from - day}`, 'ok'];
      return `<div class="sj-gr"><div class="nm"><span class="ct-b ${st[1]}">${st[0]}</span> <b class="dt">${+ym.slice(5)}/${s.from}${s.to !== s.from ? '~' + z : ''}</b> ${esc(s.label)}</div><div class="tl"><div class="sb" style="left:${X(s.from)}%;width:${Math.max(1.6, (z - s.from + 1) / nd * 100)}%;background:${s.color}" title="${s.from}${s.to !== s.from ? '~' + z : ''}일 ${esc(s.label)}"><span>${s.from}${s.to !== s.from ? '~' + z : ''}</span></div><div class="now" style="left:${X(day) + 0.5 / nd * 100}%"></div></div></div>`; }).join('');
    const ax = [1, 5, 10, 15, 20, 25, nd].map((d) => `<span style="left:${X(d)}%">${d}일</span>`).join('');
    const sch = `<div class="sj-sch"><div class="cap"><span>월간 운영 일정 (${+ym.slice(5)}월) — 매달 같은 날짜에 하는 수주팀 업무 · 막대 = 그 일을 하는 기간(일)</span><span>빨간 선 = 오늘 ${md(td)} · 완료 = 기간 지남 · 진행 = 기간 중 · D-n = 시작까지 남은 날</span></div>${it}<div class="sj-gr"><div class="nm"></div><div class="tl ax">${ax}</div></div></div>`;
    return top + flt + (CT.view('dash', VIEWS) === 'dash' ? sch : '');
  }

  /* ---------- ① 종합 관제판 ---------- */
  function dash() {
    const G = groups(), K = D.kpi;
    const dem = G.filter((g) => g.base != null), sb = dem.reduce((a, g) => a + g.base, 0), so = dem.reduce((a, g) => a + g.orders, 0);
    const prog = sb ? so / sb * 100 : null, gapN = new Set(dem.filter((g) => g.progSt === '경고').map((g) => g.progGrp ? 'C수출' : g.key)).size, gapT = dem.reduce((a, g) => a + (g.gap || 0), 0);
    const G2 = G.filter((g) => g.key !== '자가재'), pc = G2.reduce((a, g) => a + (g.planCum || 0), 0), ac = G2.reduce((a, g) => a + (g.actCum || 0), 0);
    const LN = D.lines.filter((l) => inPl(l.pl)), lsch = LN.reduce((a, l) => a + (l.sched || 0), 0), lact = LN.reduce((a, l) => a + (l.actual || 0), 0), ach = lsch ? lact / lsch * 100 : null;   // 생산 달성률 = 판생 일정누계 대비(③ 라인 카드와 같은 기준)
    const mats = D.mats.filter((x) => inPl(x.plant)), mw = mats.filter((x) => x.st === '경고'), mo = mats.filter((x) => x.st === '주의');
    const wh = ['C', 'G'].filter(inPl).map((p) => D.wh[p]), whCur = wh.reduce((a, x) => a + x.cur, 0), whCap = wh.reduce((a, x) => a + x.cap, 0);
    const kpi = (n, t, st, v, s) => `<div class="ct-kpi ${SC[st] || ''}"><div class="l">${t} ${B(st)}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const k1 = kpi(1, '수주 진도', prog == null ? null : prog >= 100 ? '정상' : prog >= 90 ? '주의' : '경고', pct(prog),
      `기준선 ${T(sb)}톤 대비 확정 ${T(so)}톤<br>월 판매계획 대비 ${pct(dem.reduce((a, g) => a + (g.sales || 0), 0) ? so / dem.reduce((a, g) => a + (g.sales || 0), 0) * 100 : null)} · 기준선 대비 부족 ${T(gapT)}톤(${gapN}개 그룹 경고)`);
    const k2 = kpi(1, '생산 달성률', ach == null ? null : ach >= 95 && ach <= 105 ? '정상' : ach >= 90 && ach <= 110 ? '주의' : '경고', pct(ach),
      `판생 일정누계 ${T(lsch)}톤 대비 실적 ${T(lact)}톤(~${md(D.asOf)})<br>${LN.filter((l) => l.ach != null && (l.ach < 90 || l.ach > 110)).map((l) => `${l.line} ${pct(l.ach)}`).join(' · ') || '라인 모두 90~110%'}`);
    const k3 = kpi(1, '소재 결품 위험', mw.length ? '경고' : mo.length ? '주의' : '정상', `경고 ${mw.length} · 주의 ${mo.length}`,
      `${mw.concat(mo).map((x) => `<b>${esc(x.name)}</b> 월말 ${x.days}일분(${T(x.end)}t)`).join('<br>') || '모든 소재 월말 7일분 이상'}<br>7일분 미만 주의 · 5일분 미만 경고`);
    const k4 = kpi(1, '창고 재고', whCur / whCap > 1 ? '경고' : whCur / whCap > 0.9 ? '주의' : '정상', kt(whCur),
      `상한 ${kt(whCap)}의 ${Math.round(whCur / whCap * 100)}% (상한 = PDF 예시값, 판생 값 대기)<br>판생속보 ${wh.map((x) => x.parts.map((p) => `${p[0]} ${kt(p[1])}`).join(' · ')).join(' / ')}`);   // 11/9: 재고 원천 표기(판생속보)
    // ② 그룹 관제 매트릭스
    const rows = G.map((g) => `<tr><td class="sub">${g.plant === 'C' ? '컬러' : '도금'}</td><td class="nm">${esc(g.name)}</td><td><span class="sj-tag">${esc(g.type)}</span></td>`
      + `<td class="r" title="${esc(g.key === '자가재' ? '도금 자가재 생산 계획(이달 편성)' : g.salesSrc)}">${T(g.sales)}</td><td class="r">${T(g.base)}</td><td class="r" title="등록 주문(실적+잔량) ${T(g.ordReg)}t">${T(g.orders)}</td><td class="c"${g.progGrp ? ` title="판정 = ${esc(g.progGrp)}(세부 그룹은 품명으로 추정해 섞임)"` : g.progSt === '확인' ? ' title="확정 주문이 계획 편성보다 훨씬 많음 — 주문이 계획에 안 들어감"' : ''}>${g.prog == null ? '<span class="ct-b na">–</span>' : `${B(g.progSt, pct(g.prog))}${g.progGrp ? '<sup>합</sup>' : ''}`}</td>`   // 11/9: 자가재 판매계획 칸 = 도금 자가재 편성(라벨 '컬러 투입 필요' 정정)
      + `<td class="r">${T(g.planCum)}</td><td class="r">${T(g.actCum)}</td><td class="c"${g.achGrp ? ` title="${esc(g.achGrp)}로 판정 — 계획판과 실적의 세부 분류가 달라 세부 그룹끼리는 비교 불가"` : ''}>${g.ach == null ? '<span class="ct-b na" title="계획 누계 300t 미만 — 판정 보류">보류</span>' : `${B(g.achSt, pct(g.ach))}${g.achGrp ? '<sup>합</sup>' : ''}`}</td>`
      + `<td class="r">${T(g.end)}</td><td class="r">${g.endDays == null ? (g.key === '계획재' ? '목표 대비' : '–') : `${g.endDays} / ${g.cap || '-'}일`}</td><td class="c"${g.stockSt === '부족' ? ` title="예상 월말 ${T(g.end)}t < 안전재고 ${T(g.safety)}t"` : ''}>${B(g.stockSt)}</td></tr>`);
    const sum = (k) => G.filter((g) => g.key !== '자가재').reduce((a, g) => a + (g[k] || 0), 0);   // 자가재 = 컬러 투입(내부) — 합계에서 빼야 이중 계산 없음
    rows.push(`<tr class="tot"><td></td><td>합계</td><td class="sub">자가재 제외(내부 투입)</td><td class="r">${T(sum('sales'))}</td><td class="r">${T(sum('base'))}</td><td class="r">${T(sum('orders'))}</td><td class="c">${pct(prog)}</td><td class="r">${T(pc)}</td><td class="r">${T(ac)}</td><td class="c">${pct(pc ? ac / pc * 100 : null)}</td><td></td><td></td><td></td></tr>`);
    const mx = card(2, '그룹 관제 매트릭스', `월 기준 · ${+D.month.slice(5)}월 1일~오늘 누계 · 기준일 ${md(D.today)} · 기준선 = 이달 1일~${md(D.cut)}(W+1) 편성`,
      tbl(['공장', '그룹', '운영유형', ['판매계획<small>이달 판매(출하) 목표</small>', 'r'], [`기준선<small>${md(D.month + '-01')}~${md(D.cut)} 생산 편성</small>`, 'r'], ['확정 주문<small>실적 + 소재 매치</small>', 'r'], ['수주 진도<small>확정 ÷ 기준선</small>', 'c'], [`생산 계획<small>월초 판 ${md(D.month + '-01')}~${md(D.asOf)}</small>`, 'r'], [`생산 실적<small>${md(D.month + '-01')}~${md(D.asOf)}</small>`, 'r'], ['생산 진도<small>실적 ÷ 계획</small>', 'c'], ['재고<small>예상 월말</small>', 'r'], ['재고일수<small>예상 / 상한</small>', 'r'], ['재고', 'c']], rows, 'sj-mx')
      + `<div class="sj-def"><div><b>기준선</b> 오늘까지 주문이 확정돼 있어야 할 양 = 이달 1일부터 ${md(D.cut)}(지난 수요일 마감으로 확정되는 다음 생산주의 끝)까지 일별가동계획에 편성된 생산량</div><div><b>확정 주문</b> 이달 이미 생산한 양 + ${md(D.cut)}까지 만들 주문 잔량 중 소재가 매치된 양(도금 = 소재 입고·생산 중) · 숫자에 마우스 = 소재 매치 전 포함 등록 주문</div><div><b>생산 계획·실적</b> <u>생산</u> 기준(출하 아님) · 계획 = 이달 초 게시 계획의 1일~${md(D.asOf)} 생산 계획 합 · 실적 = 같은 기간 생산 실적 · 생산 진도는 그룹별 판생 계획이 없어 엔진 계획 대비(KPI·③ 라인은 판생 일정누계 기준)</div></div><p class="sj-foot">판매계획 = 판생속보 월차(도금) · 통합 계획 판매(컬러, 세부 그룹은 이달 편성 비율) · 계획재 = R15 생산계획 · 자가재 = 도금 자가재 생산 계획 · <sup>합</sup> = 묶음 합으로 판정(컬러수출 3그룹 수주·생산, 컬러건재 생산 — 세부 분류가 계획판·실적·주문마다 달라 세부끼리 비교하면 틀림) · 수주 진도 150% 초과 = '확인'(주문이 계획 편성에 안 들어감) · 재고 = ${md(D.asOf)} 실재고 + 남은 편성 − 남은 판매(⑤ 재고 브릿지와 같은 값), 안전재고 밑이면 '부족' · 컬러 세부 그룹 재고는 그룹 합으로만(⑤)</p>`);
    return `<div class="ct-kpis sj-k4">${k1}${k2}${k3}${k4}</div>` + mx + calendar() + actions() + signals();
  }

  /* ③ 일별 계획 캘린더: 라인 가동(지난 날 실적·달성률, 오늘 이후 계획) + 소재 재고일수 전망 */
  function calendar() {
    /* 11/7 사용자 '글자 크기·칸이 안 맞고, 마감 줄과 가동 칸 색이 같다' → 칸 글자 한 크기(12.5px), 숫자 쉼표 없음, 생산주 줄 = 주 단위로 합친 칸·파란 계열(가동 칸의 초록·노랑·빨강과 다른 색),
       구역 머리 = 진한 띠, 라인 이름 칸 왼쪽 맞춤, 범례를 표 위에 */
    const nd = D.nDays, ym = D.month, td = D.today, days = Array.from({ length: nd }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay(), nf = (v) => (v == null ? '' : String(Math.round(v)));
    const wcls = (d) => (dow(d) === 3 ? ' wst' : '') + (d === td ? ' now' : '');      // 수요일 = 생산주 시작 굵은 선
    const hd = `<tr><th class="lab">라인</th>${days.map((d) => `<th class="${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}${wcls(d)}"><b>${+d.slice(8)}</b><span>${'일월화수목금토'[dow(d)]}</span></th>`).join('')}</tr>`;
    // 생산주 줄: 주마다 한 칸(colspan)
    const seg = [];
    days.forEach((d) => { const w = D.weekOrders.find((x) => d >= x.wFrom && d <= CT.addD(x.wFrom, 6)); const k = w ? w.wFrom : d; if (seg.length && seg[seg.length - 1].k === k) seg[seg.length - 1].n++; else seg.push({ k, n: 1, w, d }); });
    const wkRow = `<tr class="wk"><td class="lab">생산주</td>${seg.map(({ n, w, d }) => { if (!w) return `<td colspan="${n}"></td>`;
      const [t, c] = w.past ? ['지난 주(실적)', 'w0'] : w.state === '마감' ? ['마감 · 확정', 'w1'] : w.state === '진행 중' ? [`수주 중 · 마감 ${md(w.deadline)}`, 'w2'] : [`마감 전 · ${md(w.deadline)}`, 'w3'];
      return `<td colspan="${n}" class="${c}${dow(d) === 3 ? ' wst' : ''}" title="생산주 ${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))} · 주문 마감 ${md(w.deadline)}(수)">${n >= 3 ? t : ''}</td>`; }).join('')}</tr>`;
    const lineRow = (l, lab) => {
      const R = D.daily[l] || [];
      return `<tr><td class="lab"><b>${esc(l)}</b><span>${esc(lab)}</span></td>${R.map(([d, p0, p, a]) => {
        const k = wcls(d);
        // 11/9 사용자: 실적 색 삭제 · 지난 날 실적 0 이고 계획도 없던 날 = 휴(0 아님)
        if (d <= D.asOf && a != null) return !(a > 0.5) && !(p0 > 0.5) ? `<td class="id${k}" title="${md(d)} 휴지(계획·실적 없음)">휴</td>` : `<td class="ac${k}" title="${md(d)} 실적 ${n0(a)}t · 월초 계획 ${n0(p0)}t">${nf(a)}</td>`;
        if (d <= D.asOf) return `<td class="nd${k}">–</td>`;
        return p ? `<td class="pl${k}" title="${md(d)} 계획 ${n0(p)}t">${nf(p)}</td>` : `<td class="id${k}" title="계획 없음(휴지·정지)">휴</td>`;
      }).join('')}</tr>`;
    };
    const LC = { '1CCL': 'PVS 등', '2CCL': '건재', '3CCL': 'STS·POR·PLY', '4CCL': 'PPG·PPH·Al', '1CGL': 'AZ·AL', '2CGL': 'AL·MAC' };
    const sec = (t) => `<tr class="sec"><td colspan="${nd + 1}">${t}</td></tr>`;
    let body = wkRow;
    if (inPl('C')) body += sec('컬러공장 · 일 생산량(톤)') + ['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => lineRow(l, LC[l])).join('');
    if (inPl('G')) body += sec('도금공장 · 일 생산량(톤)') + ['1CGL', '2CGL'].map((l) => lineRow(l, LC[l])).join('');
    // 11/9 사용자: 그룹별 일 생산량 — 윗줄 계획(엔진 일별 계획, 지난 날 = 월초 계획) · 아랫줄 실제 생산
    const GN = Object.fromEntries((D.groups || []).map((g) => [g.key, g.name])), GC = ['건재수출', '가전수출', '가전내수', '수요개발', '주문재', '계획재'], GG = ['도금수출', '도금국내', '자동차', '자가재'];
    // 11/10 사용자: 계획을 그룹별로 먼저 다 보여 주고, 그다음 실적을 그룹별로 · 실적 옆에 계획 대비 차이(+123 / △134)
    const dif = (v) => (Math.abs(v) < 0.5 ? '±0' : v > 0 ? `+${Math.round(v)}` : `△${Math.round(-v)}`);
    const gk = (ks) => ks.filter((g) => (D.gdaily || {})[g] && D.gdaily[g].some((r) => r[1] > 0.5 || r[2] > 0.5));
    const pRows = (ks) => gk(ks).map((g) => { const R = D.gdaily[g], sm = R.reduce((a, r) => a + r[1], 0);
      return `<tr><td class="lab"><b>${esc(GN[g] || g)}</b><span>월 ${n0(sm)}t</span></td>${R.map(([d, p]) => `<td class="pl${wcls(d)}" title="${md(d)} ${esc(GN[g] || g)} 계획 ${n0(p)}t">${p > 0.5 ? nf(p) : '·'}</td>`).join('')}</tr>`; }).join('');
    const aRows = (ks) => gk(ks).map((g) => { const R = D.gdaily[g], sp = R.reduce((a, r) => a + (r[0] <= D.asOf ? r[1] : 0), 0), sa = R.reduce((a, r) => a + (r[2] || 0), 0);
      return `<tr class="ga"><td class="lab" title="1일~${md(D.asOf)} 계획 ${n0(sp)}t · 실적 ${n0(sa)}t"><b>${esc(GN[g] || g)}</b><span>${n0(sa)}t <em class="${sa - sp < -0.5 ? 'dn' : 'up'}">${dif(sa - sp)}</em></span></td>${R.map(([d, p, a]) => a == null ? `<td class="nd${wcls(d)}"></td>`
        : `<td class="ac${wcls(d)}" title="${md(d)} ${esc(GN[g] || g)} 실적 ${n0(a)}t · 계획 ${n0(p)}t · ${dif(a - p)}"><b>${a > 0.5 ? nf(a) : '0'}</b><em class="${a - p < -0.5 ? 'dn' : 'up'}">${dif(a - p)}</em></td>`).join('')}</tr>`; }).join('');
    if (D.gdaily) {
      if (inPl('C')) body += sec('컬러 그룹별 계획(톤) — 지난 날 = 월초 계획') + pRows(GC) + sec('컬러 그룹별 실적(톤) — 계획 대비 +초과 · △부족') + aRows(GC);
      if (inPl('G')) body += sec('도금 그룹별 계획(톤) — 지난 날 = 월초 계획') + pRows(GG) + sec('도금 그룹별 실적(톤) — 계획 대비 +초과 · △부족') + aRows(GG);
    }
    const bad = new Set(D.mats.filter((x) => x.st === '경고' || x.st === '주의').map((x) => x.key)), MD = Object.entries(D.matDaily).filter(([k]) => inPl(k[0]) && bad.has(k));
    if (MD.length) {
      body += sec('소재 수급 · 재고일수(일) — 월말 7일분 미만 소재만, 전체는 ④ 소재');
      body += MD.map(([k, x]) => `<tr><td class="lab"><b>${esc(x.name)}</b><span>하루 ${n0(x.avgUse)}t</span></td>${days.map((d) => { const r = x.rows.find((y) => y[0] === d), w = wcls(d); if (!r) return `<td class="nd${w}">–</td>`; const c = r[1] >= 7 ? 'm1' : r[1] >= 5 ? 'm2' : 'm3'; return `<td class="${c}${w}" title="${md(d)} 재고 ${r[1]}일분${r[2] ? ` · 입고 예정 ${n0(r[2])}t` : ''}">${Math.round(r[1])}${r[2] >= 50 ? '<i>▲</i>' : ''}</td>`; }).join('')}</tr>`).join('');
    }
    const lg = `<div class="sj-clg"><span><i class="ac"></i>실적(지난 날)</span><span><i class="pl"></i>계획</span><span><i class="id"></i>휴지</span>`
      + `<span class="gap"><i class="w1"></i>확정된 생산주</span><span><i class="w2"></i>수주 중</span><span><i class="w3"></i>마감 전</span><span class="gap"><i class="nowk"></i>오늘</span>${MD.length ? '<span class="gap">소재 ▲ = 그날 입고 예정</span>' : ''}</div>`;
    return card(3, `${+D.month.slice(5)}월 일별 계획 캘린더 — 컬러·도금 가동 / 소재 수급`, '칸에 마우스 = 상세',
      lg + `<div class="ct-wrap scroll"><table class="sj-cal"><thead>${hd}</thead><tbody>${body}</tbody></table></div><p class="sj-foot">굵은 세로선 = 생산주 시작(수요일) · 소재 재고일수 = 오늘 실재고 + MES 등록 입고 예정 − 계획 소요(아직 발주 안 한 물량은 빠져 월말로 갈수록 낮게 보일 수 있음)</p>`, '', true);
  }

  function actions() {
    const S = evMap('act'), gn = (D.groups.find((g) => g.key === grpSel) || {}).name, L = D.actions.filter((a) => grpSel === 'all' || (gn && (a.text || '').startsWith(gn)));
    const rows = L.map((a) => { const id = CT.issueId(a.area + '|' + a.text.replace(/[\d,.]+/g, '#')); const st = (S[id] || {}).val || '미조치';
      return `<tr><td>${B(a.lvl)}</td><td>${esc(a.area || '')}</td><td class="wrap">${esc(a.text)}</td><td class="c">${a.due ? md(a.due) : '–'}</td><td>${esc(a.dept || '')}</td><td><select class="sj-in" data-act="${id}" aria-label="조치 상태">${['미조치', '진행', '완료'].map((x) => `<option${x === st ? ' selected' : ''}>${x}</option>`).join('')}</select>${S[id] ? `<small class="muted"> ${esc(S[id].by || '')} ${md(String(S[id].at || '').slice(0, 10))}</small>` : ''}</td></tr>`; });
    return card(4, `이번 주 조치 필요 ${L.length}건`, '수주 진도·생산 미달·소재·재고 경고/주의 자동 생성 · 경고 먼저 · 상태는 공유 저장(담당자·시각 기록)',
      rows.length ? tbl(['신호', '영역', '내용', ['마감일', 'c'], '담당부서', '상태'], rows) : '<p class="muted">경고·주의 항목 없음</p>');
  }

  function signals() {
    return card(5, '신호등 기준 (전 화면 공통)', `기준값 출처: ${D.cfg.src}`,
      tbl(['지표', '산식', '정상', '주의', '경고'], D.cfg.signals.map((s) => `<tr><td class="nm">${esc(s.name)}</td><td class="wrap">${esc(s.calc)}</td><td class="pos">${esc(s.ok)}</td><td class="wrn">${esc(s.warn)}</td><td class="neg">${esc(s.bad)}</td></tr>`))
      + `<p class="sj-foot">창고 상한(컬러 ${kt(D.cfg.warehouse.C.cap)} · 도금 ${kt(D.cfg.warehouse.G.cap)}) = PDF 예시값으로 임시 설정 — 판생 확정값 받으면 바꿈</p>`);
  }

  /* ---------- ② 수주 진도 ---------- */
  function order() {
    const W = D.weekOrders, dem = groups().filter((g) => g.base != null), keys = dem.map((g) => g.key);
    const sb = dem.reduce((a, g) => a + g.base, 0), so = dem.reduce((a, g) => a + g.orders, 0);
    const gsel = curveG && (curveG === 'all' || keys.includes(curveG)) ? curveG : 'all';
    const g = D.groups.find((x) => x.key === gsel);
    const segs = (all) => `<div class="seg ct-seg">${all ? `<button type="button" data-cg="all" aria-pressed="${gsel === 'all'}">전체 그룹</button>` : ''}${dem.map((x) => `<button type="button" data-cg="${x.key}" aria-pressed="${x.key === gsel}">${esc(x.name)}</button>`).join('')}</div>`;
    const wv = (w, k) => (gsel === 'all' ? keys.reduce((a, q) => a + ((w.g[q] || {})[k] || 0), 0) : (w.g[gsel] || {})[k] || 0);
    const nextDl = W.find((w) => w.deadline >= D.today);
    const rows1 = W.map((w) => { const pl_ = wv(w, 'plan'), mt = wv(w, 'mat'), rg = wv(w, 'ord'), gap = Math.max(0, pl_ - mt), r = pl_ ? mt / pl_ * 100 : null;
      const st = w.past ? ['지난 주 — 실적', 'na'] : w.state === '마감' ? (r != null && r < 95 ? ['마감 · 미달', 'bad'] : ['마감 · 충족', 'ok']) : w.state === '진행 중' ? [`수주 진행 중 ${dday(w.deadline)}`, 'w'] : ['마감 전', 'na'];
      const cur = nextDl && w.deadline === nextDl.deadline;
      return `<tr${cur ? ' style="background:var(--tint)"' : ''}><td>${md(w.deadline)}(수)</td><td class="nm">${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}</td><td><span class="ct-b ${{ ok: 'ok', w: 'warn', bad: 'bad', na: 'na' }[st[1]]}">${st[0]}</span></td><td class="r">${T(pl_)}</td><td class="r">${T(rg)}</td><td class="r"><b>${T(mt)}</b></td><td class="r"><b class="${gap > 0 && !w.past ? 'neg' : ''}">${T(gap)}</b></td><td class="r">${pct(r)}</td></tr>`; });
    const c1 = card(1, `주차별 수주 — 주문 마감(수 오전) → W+1 생산주 확정`, gsel === 'all' ? '전체 그룹 합' : g.name, segs(true)
      + tbl(['주문 마감', '생산주(수~화)', '상태', ['일별계획 편성', 'r'], ['등록 주문', 'r'], ['확정(소재 매치)', 'r'], ['부족', 'r'], ['확정률', 'r']], rows1)
      + `<p class="sj-foot" style="font-size:13.5px;color:var(--ink)">기준선(${md(D.today)}) = Σ 일별가동계획 편성량 [${md(D.month + '-01')} ~ ${md(D.cut)}] = <b>${T(sb)}톤</b> · 확정 <b>${T(so)}톤</b> → 진도 <b class="${so >= sb ? 'pos' : so >= sb * 0.9 ? 'wrn' : 'neg'}">${pct(sb ? so / sb * 100 : null)}</b> · 부족(기준선 − 확정) <b class="neg">${T(dem.reduce((a, x) => a + (x.gap || 0), 0))}톤</b> (전체 그룹)</p>`
      + '<p class="sj-foot">확정 = 그 주 생산 실적 + 그 주에 만들 잔량 중 소재 매치 · 잔량은 생산 예정일(없으면 납기 −7일 도금·−10일 컬러)의 주, 예정일이 지났으면 이번 주 · 지난 주는 실적이라 판정 안 함 · 지난 달 납기(밀린 주문)는 빼고 셈</p>');
    // 11/7 사용자 '수주 누적 그래프 직관적으로 · 숫자 보이게 · 크게 안 해도 됨 · 갭이 뭐냐' → 그룹마다 한 줄 막대(숫자 표시) + 그룹별 진도 카드와 합침
    // 막대 = 0 ~ 판매계획: 진한 = 확정, 빗금 빨강 = 기준선까지 모자란 양(부족), 연한 = 기준선 뒤 남은 판매계획, 검은 선 = 기준선(오늘까지 확정됐어야 할 양)
    const mx = Math.max(...dem.map((x) => Math.max(x.sales || 0, x.base || 0, x.orders || 0)), 1);
    const gr = dem.slice().sort((a, b) => (a.prog ?? 999) - (b.prog ?? 999)).map((x) => {
      const rm = Math.max(x.sales || 0, x.base || 0, x.orders || 0, 1), W = (v) => `${Math.min(100, Math.max(0, v) / rm * 100)}%`, o = Math.min(x.orders || 0, x.sales || x.orders || 0), short = Math.max(0, (x.base || 0) - (x.orders || 0));
      const col = x.progSt === '정상' ? 'var(--good)' : x.progSt === '주의' ? 'var(--warn)' : 'var(--bad)';
      return `<tr><td class="nm">${esc(x.name)}</td><td class="sj-cb"><div class="tr"><i class="s" style="width:${W(x.sales || 0)}"></i><i class="o" style="width:${W(o)};background:${col}"></i>${short ? `<i class="g" style="left:${W(x.orders || 0)};width:${W(short)}"></i>` : ''}<u style="left:${W(x.base || 0)}"></u></div></td>`
        + `<td class="r"><b>${T(x.orders)}</b></td><td class="r">${T(x.base)}</td><td class="r">${T(x.sales)}</td><td class="r"><b class="${short ? 'neg' : ''}">${short ? T(short) : '–'}</b></td><td>${B(x.progSt, pct(x.prog))}</td></tr>`; });
    const c2 = card(3, '그룹별 수주 누적', `${md(D.today)} 기준 · 정렬 = 진도 낮은 순`,
      `<div class="sj-clg"><span>막대 전체 = 그 그룹 판매계획</span><span><i style="background:var(--good)"></i>확정(소재 매치)</span><span><i class="gsh"></i>부족 = 기준선 − 확정</span><span><i style="background:var(--sub)"></i>남은 판매계획</span><span><i class="bl"></i>기준선 = 오늘까지 확정됐어야 할 양(~${md(D.cut)} 편성)</span></div>`
      + tbl(['그룹', '진행', ['확정', 'r'], ['기준선', 'r'], ['판매계획', 'r'], ['부족', 'r'], '진도'], gr, 'sj-cbt'));
    const ex = D.export.map((x) => `<tr><td class="nm">${esc(x.dst)}</td><td class="r">${T(x.t)}</td><td>${md(x.firstDue)}</td><td>${Object.entries(x.st).map(([k, v]) => `<span class="sj-tag">${esc(k)} ${n0(v)}</span>`).join(' ')}</td></tr>`);
    const c5 = card(5, '수출 선적 기준 수주 현황 — 도금수출', `${+D.month.slice(5)}월 납기(선적) 주문 · 목적지별`, ex.length ? tbl(['목적지(착지)', ['주문량', 'r'], '첫 납기', '진행 상태(톤)'], ex) + '<p class="sj-foot">선적창·배선 형태(벌크/컨테이너)·선생산 구분은 배선일정 자료를 붙이는 다음 단계에서 추가</p>' : wait('도금수출 이달 주문 없음'));
    // ⑥ 미수주 위험(마감 2주 이내 · 확정률 70% 미만)
    const risk = [];
    for (const w of W) { if (CT.diff(w.deadline, D.today) > 14 || w.state === '마감' || w.past) continue; for (const k of keys) { const x = w.g[k] || {}; if (!x.plan || x.plan < 50) continue; const r = x.mat / x.plan * 100; if (r < 70) risk.push(`<tr><td class="nm">${esc(D.groups.find((y) => y.key === k).name)}</td><td>${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}</td><td>${md(w.deadline)} ${dday(w.deadline)}</td><td class="r">${T(x.plan)}</td><td class="r">${T(x.mat)}</td><td class="r"><b class="neg">${T(x.plan - x.mat)}</b></td><td class="r"><b class="neg">${pct(r)}</b></td><td>${esc(D.groups.find((y) => y.key === k).dept)}</td></tr>`); } }
    const c6 = card(4, '미수주 위험 리스트', '마감 2주 이내 · 확정률 70% 미만 그룹·생산주', risk.length ? tbl(['그룹', '생산주', '마감', ['편성', 'r'], ['확정', 'r'], ['부족', 'r'], ['확정률', 'r'], '담당'], risk) : '<p class="muted">해당 없음</p>');
    // 11/9 사용자 '왜 전체로 안 나오고 수요개발로 나오냐' → 전체 그룹 = 그룹 합(계단은 날마다 그룹 계단 값의 합)
    const allG = () => { const ds = [...new Set(dem.flatMap((x) => (D.baseSteps[x.key] || []).map((q) => q[0])))].sort();
      const at = (k, d) => { let v = 0; (D.baseSteps[k] || []).forEach((q) => { if (q[0] <= d) v = q[1] || 0; }); return v; };
      D.baseSteps.all = ds.map((d) => [d, keys.reduce((a, k) => a + at(k, d), 0)]);
      const sum = (f) => dem.reduce((a, x) => a + (x[f] || 0), 0), sales = sum('sales'), prog = sb ? so / sb * 100 : null;
      return { key: 'all', name: '전체 그룹', sales, base: sb, orders: so, gap: sum('gap'), prog, progSt: prog == null ? '' : prog >= 100 ? '정상' : prog >= 90 ? '주의' : '경고' }; };
    const gc = gsel === 'all' ? allG() : g;
    const kv = (k, v, c) => `<div class="sj-kv"><span>${k}</span><b${c ? ` class="${c}"` : ''}>${v}</b></div>`;
    const cc = gc ? card(2, `월 수주 누적 — ${gc.name}`, gsel === 'all' ? '전체 그룹 합 · 위 버튼으로 그룹 선택' : '판매계획 · 기준선 · 확정',
      `<div class="sj-cv"><div>${curveChart(gc)}</div><div class="sd">${kv('판매계획', T(gc.sales) + 't')}${kv('기준선(~' + md(D.cut) + ')', T(gc.base) + 't')}${kv('확정', T(gc.orders) + 't')}${kv('부족', gc.gap ? T(gc.gap) + 't' : '없음', gc.gap ? 'neg' : 'pos')}${kv('진도', B(gc.progSt, pct(gc.prog)))}<p class="sj-foot">주황 계단 = 기준선(수요일 마감마다 다음 생산주 끝까지 늘어남) · 점선 = 판매계획 · 파란 점 = 오늘 확정</p></div></div>`) : '';
    return c1 + cc + c2.replace('<h2>', '<h2>').replace('그룹별 수주 누적', '그룹별 수주 누적 — 전체 비교') + c6 + c5;
  }


  /* ---------- 그래프(11/7 사용자 '없애지 말고 이쁘게') — 크기 작게, 숫자를 그래프 위에 직접 ---------- */
  const SV = (W, H, body, lab) => `<svg class="sj-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(lab)}">${body}</svg>`;
  const tx = (x, y, t, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}"${o.c ? ` style="fill:${o.c}"` : ''}${o.w ? ` font-weight="${o.w}"` : ''}${o.s ? ` font-size="${o.s}"` : ''}>${t}</text>`;
  const kfmt = (v) => (v >= 10000 ? (v / 1000).toFixed(1) + '천' : n0(v));
  // 수주 누적: 기준선(계단·면) · 판매계획(점선) · 오늘 확정(점) · 부족(빨간 화살)
  function curveChart(g) {
    const W = CW(0.7), H = 230, L = 46, R = 20, Tp = 18, Bt = 26, nd = D.nDays, st = D.baseSteps[g.key] || [];
    const ymax = Math.max(g.sales || 0, ...st.map((q) => q[1] || 0), g.orders || 0, 1) * 1.12;
    const x = (d) => L + (d - 1) / (nd - 1) * (W - L - R), y = (v) => Tp + (1 - v / ymax) * (H - Tp - Bt);
    const dn = (q) => Math.max(1, Math.min(nd, q.slice(0, 7) === D.month ? +q.slice(8) : q < D.month ? 1 : nd));
    let path = '', area = '', prev = null; const lbl = [];
    st.forEach(([d, v]) => { const xd = x(dn(d)); if (prev == null) { path = `M${x(1)},${y(v)}`; } else { path += ` L${xd},${y(prev)} L${xd},${y(v)}`; } if (v !== prev) lbl.push([xd, v]); prev = v; });
    path += ` L${x(nd)},${y(prev || 0)}`; area = path + ` L${x(nd)},${y(0)} L${x(1)},${y(0)} Z`;
    const td = Math.min(nd, +D.today.slice(8)), xo = x(td), yo = y(g.orders || 0), yb = y(Math.max(0, ...st.filter((q) => q[0] <= D.today).map((q) => q[1] || 0), g.base || 0));
    let b = [0, .5, 1].map((k) => `<line x1="${L}" x2="${W - R}" y1="${y(ymax * k / 1.12)}" y2="${y(ymax * k / 1.12)}" stroke="var(--grid, var(--line))"/>` + tx(L - 6, y(ymax * k / 1.12) + 4, kfmt(ymax * k / 1.12), { a: 'end' })).join('');
    b += [1, 8, 15, 22, nd].map((d) => tx(x(d), H - 8, `${+D.month.slice(5)}/${d}`)).join('');
    b += `<path d="${area}" fill="#f6dcc0" opacity=".55"/><path d="${path}" fill="none" stroke="#c46a12" stroke-width="2.5"/>`;
    b += lbl.map(([xx, v]) => tx(xx + 4, y(v) - 6, kfmt(v), { a: 'start', c: '#9a4f08', w: 700 })).join('');
    if (g.sales) b += `<line x1="${L}" x2="${W - R}" y1="${y(g.sales)}" y2="${y(g.sales)}" stroke="var(--ink-2)" stroke-dasharray="6 4"/>` + tx(W - R, y(g.sales) - 6, `판매계획 ${kfmt(g.sales)}`, { a: 'end', w: 700 });
    b += `<line x1="${xo}" x2="${xo}" y1="${Tp}" y2="${H - Bt}" stroke="var(--bad)" stroke-dasharray="3 3"/>` + tx(xo, Tp - 4, `오늘 ${md(D.today)}`, { c: 'var(--bad)', w: 700 });
    if (g.gap > 0) b += `<line x1="${xo + 10}" x2="${xo + 10}" y1="${yb}" y2="${yo}" stroke="var(--bad)" stroke-width="2" marker-end="url(#ar)" marker-start="url(#ar)"/>` + tx(xo + 16, (yb + yo) / 2 + 4, `부족 ${n0(g.gap)}`, { a: 'start', c: 'var(--bad)', w: 800 });
    b += `<circle cx="${xo}" cy="${yo}" r="6" fill="#2457c5" stroke="#fff" stroke-width="2"/>` + tx(xo - 10, yo + 4, `확정 ${n0(g.orders)}`, { a: 'end', c: '#2457c5', w: 800 });
    b = `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--bad)"/></marker></defs>` + b;
    return SV(W, H, b, g.name + ' 수주 누적');
  }
  // 일별 계획 vs 실적: 계획(연한 막대) · 실적(진한 막대 + 숫자) · 휴지(빗금) · 오늘
  function dayChart(l) {
    const R = D.daily[l] || [], W = CW(1), H = 210, L = 40, Rp = 10, Tp = 20, Bp = 24, n = R.length;
    const ymax = Math.max(1, ...R.map((r) => Math.max(r[1] || 0, r[2] || 0, r[3] || 0))) * 1.18, bw = (W - L - Rp) / n;
    const x = (i) => L + i * bw, y = (v) => Tp + (1 - v / ymax) * (H - Tp - Bp);
    let b = `<defs><pattern id="hz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--sub)"/></pattern></defs>`;
    b += [0, .5, 1].map((k) => `<line x1="${L}" x2="${W - Rp}" y1="${y(ymax / 1.18 * k)}" y2="${y(ymax / 1.18 * k)}" stroke="var(--grid, var(--line))"/>` + tx(L - 6, y(ymax / 1.18 * k) + 4, n0(ymax / 1.18 * k), { a: 'end' })).join('');
    R.forEach((r, i) => { const d = r[0], past = d <= D.asOf, pv = past ? r[1] : r[2], we = [0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay());
      if (!pv && !(past && r[3])) { b += `<rect x="${x(i) + 1}" y="${Tp}" width="${bw - 2}" height="${H - Tp - Bp}" fill="url(#hz)"><title>${md(d)} 휴지·정지</title></rect>`; }
      else b += `<rect x="${x(i) + bw * 0.12}" y="${y(pv || 0)}" width="${bw * 0.76}" height="${H - Bp - y(pv || 0)}" rx="2" fill="#d6e2f5"><title>${md(d)} 계획 ${n0(pv)}t</title></rect>`;
      if (past && r[3] != null) { const ok = !r[1] || r[3] >= r[1] * 0.95; b += `<rect x="${x(i) + bw * 0.28}" y="${y(r[3])}" width="${bw * 0.44}" height="${H - Bp - y(r[3])}" rx="2" fill="${ok ? '#2457c5' : '#c0392b'}"><title>${md(d)} 실적 ${n0(r[3])}t · 계획 ${n0(r[1])}t</title></rect>` + tx(x(i) + bw / 2, y(r[3]) - 4, n0(r[3]), { c: ok ? '#2457c5' : '#c0392b', w: 700, s: 11 }); }
      b += tx(x(i) + bw / 2, H - 8, String(i + 1), we ? { c: 'var(--bad)' } : {}); });
    const ti = R.findIndex((r) => r[0] === D.today);
    if (ti >= 0) b += `<line x1="${x(ti)}" x2="${x(ti)}" y1="${Tp - 6}" y2="${H - Bp}" stroke="var(--bad)" stroke-dasharray="3 3"/>` + tx(x(ti) + 4, Tp - 8, `오늘 ${md(D.today)}`, { a: 'start', c: 'var(--bad)', w: 700 });
    return SV(W, H, b, l + ' 일별 계획 실적');
  }
  // 재고일수 추이: 그룹마다 작은 그래프(점 위 숫자 · 상한 점선 · 상태 색)
  // 일별 재고일수(11/7 사용자 '날짜가 중요 — 월말은 예측'): 실선 = 실제(어제까지) · 점선 = 전망 · 가로 점선 = 상한
  function dayStock(e, nm) {
    const x0 = D.stockDaily[e]; if (!x0 || !x0.rows.length) return '';
    const n5 = Math.max(1, Object.keys(D.stockDaily).filter((k) => inPl(k[0])).length), R = x0.rows, cap = x0.cap, W = Math.max(200, Math.floor((CW(1) - 12 * (n5 - 1)) / n5) - 18), H = 140, L = 26, Rp = 10, Tp = 16, Bt = 20, nd = D.nDays;
    const vs = R.map((r) => r[2]).concat(cap ? [cap] : []), lo = Math.max(0, Math.floor(Math.min(...vs) - 3)), hi = Math.ceil(Math.max(...vs) + 3);
    const x = (d) => L + (+d.slice(8) - 1) / (nd - 1) * (W - L - Rp), y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - Bt);
    const col = (v) => (!cap ? '#2457c5' : v <= cap ? '#1e7a46' : v <= cap + 5 ? '#b7791f' : '#c0392b');
    const A = R.filter((r) => r[3] === 'a'), F = R.filter((r) => r[3] === 'f'), la = A[A.length - 1], lf = F[F.length - 1];
    let b = [lo, Math.round((lo + hi) / 2), hi].map((v) => `<line x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid, var(--line))"/>` + tx(L - 4, y(v) + 4, v, { a: 'end', s: 10.5 })).join('');
    if (cap) b += `<line x1="${L}" x2="${W - Rp}" y1="${y(cap)}" y2="${y(cap)}" stroke="var(--ink-2)" stroke-dasharray="5 3"/>` + tx(W - Rp, y(cap) - 4, `상한 ${cap}일`, { a: 'end', s: 10.5 });
    if (A.length) b += `<polyline points="${A.map((r) => `${x(r[0])},${y(r[2])}`).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2.4"/>`;
    if (F.length) b += `<polyline points="${(la ? [la] : []).concat(F).map((r) => `${x(r[0])},${y(r[2])}`).join(' ')}" fill="none" stroke="#7d8aa0" stroke-width="1.8" stroke-dasharray="4 3"/>`;
    const td = D.today; if (td.slice(0, 7) === D.month) b += `<line x1="${x(td)}" x2="${x(td)}" y1="${Tp}" y2="${H - Bt}" stroke="var(--bad)" stroke-dasharray="2 3"/>`;
    if (la) b += `<circle cx="${x(la[0])}" cy="${y(la[2])}" r="4.5" fill="${col(la[2])}" stroke="#fff" stroke-width="1.5"/>` + tx(x(la[0]), y(la[2]) - 8, la[2], { c: col(la[2]), w: 800, s: 12.5 });
    if (lf) b += `<circle cx="${x(lf[0])}" cy="${y(lf[2])}" r="3.5" fill="#fff" stroke="${col(lf[2])}" stroke-width="2"/>` + tx(x(lf[0]) - 2, y(lf[2]) - 7, lf[2], { a: 'end', c: col(lf[2]), w: 700, s: 11.5 });
    b += [1, 10, 20, nd].map((d, i, A) => tx(L + (d - 1) / (nd - 1) * (W - L - Rp), H - 5, `${+D.month.slice(5)}/${d}`, { s: 10.5, a: i === A.length - 1 ? 'end' : i === 0 ? 'start' : 'middle' })).join('');
    const st = la ? (!cap ? null : la[2] <= cap ? '정상' : la[2] <= cap + 5 ? '주의' : '경고') : null;
    return `<div class="sj-mt"><div class="h"><b>${esc(nm)}</b>${B(st, la ? `${md(la[0])} ${la[2]}일` : '–')}</div>${SV(W, H, b, nm)}<div class="ft"><span>재고 ${la ? n0(la[1]) : '–'}t · 하루 판매 ${n0(x0.dem)}t</span><span>월말 전망 ${lf ? lf[2] + '일' : '–'}</span></div></div>`;
  }
  /* ---------- ③ 생산 ---------- */
  function prod() {
    const L = D.lines.filter((l) => inPl(l.pl));
    const cards = L.map((l) => { const st = l.ach == null ? null : l.ach >= 95 && l.ach <= 105 ? '정상' : l.ach >= 90 && l.ach <= 110 ? '주의' : '경고';
      return `<div class="ct-kpi ${l.month ? SC[st] || '' : ''}"><div class="l">${esc(l.line)} ${l.month ? B(st) : '<span class="ct-b na">휴지</span>'}</div><div class="v">${pct(l.ach)}</div><div class="s">실적 ${T(l.actual)} / 일정 누계 ${T(l.sched)}t</div>`
        + `<div class="sj-kv"><span>월 계획(판생)</span><b>${T(l.month)}</b></div><div class="sj-kv"><span>가동률</span><b>${l.run == null ? '–' : l.run + '%'}</b></div><div class="sj-kv"><span>T/hr</span><b>${l.tph ?? '–'}</b></div>${l.next ? `<div class="sj-kv"><span>다음</span><b>${md(l.next[0])} ${esc(String(l.next[1]).replace(/M\/C\((.*)\)/, '$1'))}</b></div>` : ''}</div>`; }).join('');
    const c1 = card(1, '라인별 월 가동 현황', `${+D.month.slice(5)}월 · 판생속보 ~${esc(String(D.dataAt.sr || '').slice(5, 16))} · 달성률 = 실적 ÷ 일정 누계`, `<div class="ct-kpis sj-lc">${cards}</div>`, '', true);
    // 11/7 사용자 '일별 계획 vs 실적도 바꿔' → 큰 막대 그림 대신 라인별 누계 진도 표(숫자 그대로) + 한 줄 막대. 일별 칸은 ① 캘린더에 있음
    const rows2 = L.map((l) => { const R = D.daily[l.line] || [], past = R.filter((r) => r[0] <= D.asOf), fut = R.filter((r) => r[0] > D.asOf);
      const p0c = l.sched || 0, ac = l.actual || 0, m0 = l.month || 0;   // 판생속보 기준(위 라인 카드와 같은 숫자)
      const rem = Math.max(0, m0 - ac), wd = fut.filter((r) => r[2] > 0).length, need = wd ? rem / wd : null, plan = wd ? fut.reduce((a, r) => a + (r[2] || 0), 0) / wd : null;
      const r = p0c ? ac / p0c * 100 : null, st = r == null ? null : r >= 95 && r <= 105 ? '정상' : r >= 90 && r <= 110 ? '주의' : '경고', mx = Math.max(m0, ac, 1);
      const col = st === '정상' ? 'var(--good)' : st === '주의' ? 'var(--warn)' : st ? 'var(--bad)' : 'var(--ink-3)';
      return `<tr><td class="nm">${esc(l.line)}</td><td class="sj-cb"><div class="tr"><i class="s" style="width:100%"></i><i class="o" style="width:${Math.min(100, ac / mx * 100)}%;background:${col}"></i><u style="left:${p0c / mx * 100}%"></u></div></td>`
        + `<td class="r">${T(p0c)}</td><td class="r"><b>${T(ac)}</b></td><td class="r"><b class="${ac - p0c < 0 ? 'neg' : ''}">${ac - p0c >= 0 ? '+' : ''}${T(ac - p0c)}</b></td><td>${m0 ? B(st, pct(r)) : '<span class="ct-b na">휴지</span>'}</td>`
        + `<td class="r">${T(m0)}</td><td class="r">${T(rem)}</td><td class="r">${wd}</td><td class="r"><b class="${need && plan && need > plan * 1.05 ? 'neg' : ''}">${T(need)}</b></td><td class="r">${T(plan)}</td></tr>`; });
    const c2 = card(2, '라인별 생산 누계 — 남은 기간 하루 필요량', `판생속보 월차계획·일정 누계 대비 · ~${md(D.asOf)} 실적`,
      `<div class="sj-clg"><span><i style="background:var(--good)"></i>실적 누계(월 계획 대비 길이)</span><span><i class="bl"></i>오늘까지 일정 누계</span></div>`
      + tbl(['라인', '진행', ['일정 누계', 'r'], ['실적 누계', 'r'], ['차이', 'r'], '달성률', ['월 계획(판생)', 'r'], ['남은 양', 'r'], ['남은 가동일', 'r'], ['필요 일평균', 'r'], ['계획 일평균', 'r']], rows2, 'sj-cbt')
      + '<p class="sj-foot">숫자 = 판생속보(위 라인 카드와 같음) · 계획 일평균 = 현재 통합 계획의 남은 날 평균 · 남은 가동일 = 현재 계획에서 생산이 잡힌 날 · 필요 일평균이 계획 일평균보다 5% 넘게 크면 빨강(남은 날 계획대로 해도 월 계획 못 채움) · 날짜별 칸은 ① 종합 관제판 캘린더</p>');
    const R = D.woWeek.rows.filter((r) => inPl(/CCL/.test(r[1]) ? 'C' : 'G')), wd = [...new Set(R.map((r) => r[0]))].sort(), wl = [...new Set(R.map((r) => r[1]))].sort();
    const pv = wl.map((l) => `<tr><td class="nm">${esc(l)}</td>${wd.map((d) => `<td>${R.filter((r) => r[0] === d && r[1] === l).map((r) => `<span class="it">${esc(r[2])} <b>${esc(r[3])}</b> ${n0(r[4])}</span>`).join('') || '<span class="muted">–</span>'}</td>`).join('')}</tr>`);
    const c3 = card(3, `1주 작업 편성 — 생산주 ${md(D.woWeek.from)}~${md(D.woWeek.to)}`, '현재 계획 품목(20t 이상) · 그룹 품명 톤', R.length ? tbl(['라인', ...wd.map((d) => `${md(d)}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})`)], pv, 'sj-pv')
      + '<p class="sj-foot">확정 주문·소재 매치·부원료·소재 이송·작업지시 단계 표시는 주문 진도(주문진도 화면)와 품목을 잇는 다음 단계에서 추가</p>' : wait('다음 주 계획 품목 없음'));
    const th = D.thr.filter((x) => inPl('C'));
    const c4 = card(4, 'T/hr 실적 vs 기준', `컬러 라인·주요 품명 · 실적 ${md(D.thrFrom)}~${md(D.asOf)}`, th.length ? tbl(['라인', '품명', ['평균 두께', 'r'], ['생산 톤', 'r'], ['실적 T/hr', 'r'], ['기준 T/hr', 'r'], ['편차', 'r']], th.map((x) => `<tr><td>${esc(x.line)}</td><td class="nm">${esc(x.pdt)}</td><td class="r">${x.thk}</td><td class="r">${n0(x.t)}</td><td class="r"><b>${x.tph}</b></td><td class="r">${x.std ?? '–'}</td><td class="r">${x.dev == null ? '–' : `<span class="${Math.abs(x.dev) > 10 ? 'neg' : Math.abs(x.dev) > 5 ? 'wrn' : ''}">${x.dev > 0 ? '+' : ''}${x.dev}%</span>`}</td></tr>`))
      + '<p class="sj-foot">기준 = 컬러 품목별 단위생산량(25.8~26.7, 품명·라인 평균) — 두께×폭 구간이 섞여 있어 편차는 참고만(판정 안 함). 구간별 기준표 받으면 ±10% 판정 추가</p>' : wait('컬러 실적 없음'), '', true);
    const ls = L.map((l) => l.line), sel = ls.includes(lineSel) ? lineSel : ls[0];
    const cd = card(3, `일별 계획 vs 실적 — ${sel}`, '연한 막대 = 계획 · 진한 막대 = 실적(파랑 95%↑ · 빨강 미만, 숫자 = 실적 톤) · 빗금 = 휴지', `<div class="seg ct-seg">${ls.map((l) => `<button type="button" data-line="${l}" aria-pressed="${l === sel}">${l}</button>`).join('')}</div>` + dayChart(sel));
    return c1 + c2 + cd + c3 + c4;
  }

  /* ---------- ④ 소재 ---------- */
  function mat() {
    const M = D.mats.filter((x) => inPl(x.plant));
    const rows = M.map((x) => `<tr><td class="nm">${esc(x.name)}<div class="sub">${x.cls.map((c) => `<span class="sj-tag">${esc(c)}</span>`).join(' ')}</div></td><td>${x.plant === 'G' ? '도금' : '컬러'}</td><td class="r">${x.lt}</td><td class="r">${T(x.stock)}</td><td class="r">${T(x.use)}</td><td class="r">${T(x.recv)}</td><td class="r">${T(x.dueIn)}</td><td class="r"><b>${T(x.end)}</b></td><td class="r"><b class="${x.st === '경고' ? 'neg' : x.st === '주의' ? 'wrn' : ''}">${x.days == null ? '–' : x.days + '일'}</b></td><td class="c">${B(x.st)}</td></tr>`);
    const c1 = card(1, '소재별 월 수급표', `${+D.month.slice(5)}월 · 단위 톤 · 재고일수 최소 7일 관리`, tbl(['소재(포함 발주구분)', '공장', ['L/T(일)', 'r'], [`${md(D.asOf)} 재고<small>MES 소재재고</small>`, 'r'], ['월 소요(계획)', 'r'], ['이달 입고 실적', 'r'], ['입고 예정(잔여)', 'r'], ['예상 월말 재고', 'r'], ['재고일수', 'r'], ['상태', 'c']], rows)   // 11/9: 재고 원천 표기(MES 소재재고 — 창고·판생속보와 정의 다름)
      + `<p class="sj-foot">${D.matsNoUse && D.matsNoUse.length ? `계획 소요가 없어 뺀 소재: ${D.matsNoUse.join('·')} · ` : ''}예상 월말 = 재고(MES ${md(D.asOf)} 마감) + 입고 예정(MES 미입고 발주) − 남은 날 계획 소요 · 재고는 MES 소재 코드 합이라 ⑤ 창고(판생속보 분류)와 수백~천 t 다름 · 월 소요 = 컬러 계획 × 품명별 소재 비중, 도금 = F/H 계획 사용 · 행은 소재 코드 단위(포함 발주구분 표시) — PDF의 소재발주구분 13종 행(${D.cfg.matClasses.map((c) => c.key).join('·')})은 MES 발주구분 코드표를 받아 공급사·용도로 나누는 다음 단계에서 바꿈</p>`);
    const S = D.matShort.filter((x) => (x.gap || 0) > 0);
    const LT = UI.matLate(D.matLate);                       // 발주 마감 지남 = 공통 기준(ui/shell.js UI.matLate, 11/8)
    const c2 = card(2, '결품 위험 — 규격별 부족(컬러 소재)', LT ? `발주 마감 지남 ${T(LT.t)}톤(전 소재) · 규격별 = 컬러건재 계획재 소재` : '발주 검토 화면 기준', S.length ? tbl(['소재', '두께×폭', ['필요', 'r'], ['부족', 'r'], ['마감 지남', 'r'], '판정', '첫 부족일', '발주 권장', '입고 예상', '내용'], S.map((x) => `<tr><td class="nm">${esc(x.mat)}</td><td>${esc(x.size)}</td><td class="r">${T(x.need)}</td><td class="r"><b class="neg">${T(x.gap)}</b></td><td class="r">${x.late == null ? '–' : x.late >= 1 ? `<b class="neg">${T(x.late)}</b>` : '–'}</td><td>${esc(x.judge || '')}</td><td>${md(x.first)}</td><td>${(x.order || []).map(md).join('~')}</td><td>${md(x.arrive)}</td><td class="wrap">${esc(x.why || '')}</td></tr>`)) : '<p class="muted">부족 없음</p>');
    const N = D.matNear.filter((x) => inPl(x.plant));
    const c3 = card(3, '이번 주·다음 주 발주 대상', '발주 마감 = 사용일 − 리드타임 · 2주 안 마감', N.length ? tbl(['공장', '소재', '공급사', '첫 사용일', '발주 마감', ['수량', 'r'], '상태'], N.map((x) => `<tr><td>${x.plant === 'G' ? '도금' : '컬러'}</td><td class="nm">${esc(x.mat)}</td><td>${esc(x.sup)}</td><td>${md(x.first)}</td><td><b>${md(x.deadline)}</b> ${dday(x.deadline)}</td><td class="r">${T(x.t)}</td><td><span class="ct-b ${CT.diff(x.deadline, D.today) <= 3 ? 'bad' : 'warn'}">발주 대기</span></td></tr>`)) : '<p class="muted">2주 안 발주 마감 없음</p>');
    const V = evMap('val'), val = (k) => (V[k] || {}).val || '';
    const c4 = card(4, '포스코 Room vs 대상량', '수주팀 입력 · 대상량 > Room 이면 경고', `<div class="sj-kv"><span>다음 달 Room(톤)</span><input class="sj-in" data-val="room" value="${esc(val('room'))}" placeholder="입력" size="8"></div><div class="sj-kv"><span>수주집 선정 대상량(톤)</span><input class="sj-in" data-val="roomTarget" value="${esc(val('roomTarget'))}" placeholder="입력" size="8"></div>`
      + (val('room') && val('roomTarget') ? `<p><b class="${+val('roomTarget') > +val('room') ? 'neg' : 'pos'}">${+val('roomTarget') > +val('room') ? '초과 +' + n0(val('roomTarget') - val('room')) + '톤 → 마케팅 협의 필요' : '여유 ' + n0(val('room') - val('roomTarget')) + '톤'}</b></p>` : '<p class="sj-foot">입력하면 바로 판정</p>'));
    const lg = D.cfg.matClasses.filter((c) => c.lt >= 60);
    const c5 = card(5, '장납기 월차 발주량 전달', '매월 10~15일 · 15일까지 미작성 시 경고', tbl(['발주구분', ['수량(톤)', 'r'], '상태'], lg.map((c) => `<tr><td class="nm">${esc(c.key)}</td><td class="r"><input class="sj-in" data-val="${esc('lg|' + c.key)}" value="${esc(val('lg|' + c.key))}" size="7" placeholder="톤"></td><td>${val('lg|' + c.key) ? '<span class="ct-b ok">작성</span>' : +D.today.slice(8) > 15 ? '<span class="ct-b bad">미작성</span>' : '<span class="ct-b warn">작성 대기</span>'}</td></tr>`)));
    return c1 + c2 + `<div class="sj-g2">${c3}<div>${c4}${c5}</div></div>`;
  }

  /* ---------- ⑤ 재고 ---------- */
  function stock() {
    const Bk = D.bridge.filter((x) => inPl(x.eng[0]));
    const rows = Bk.map((x) => { const st = x.safety && x.end < x.safety ? '부족' : x.endDays == null || !x.cap ? null : x.endDays <= x.cap ? '정상' : x.endDays <= x.cap + 5 ? '주의' : '경고'; const w = x.cap ? Math.min(100, (x.endDays || 0) / (x.cap * 1.6) * 100) : 0;
      return `<tr><td class="nm">${esc(x.name)}</td><td><span class="sj-tag">${esc(x.type)}</span></td><td class="r">${T(x.begin)}</td><td class="r">+${T(x.prod)}</td><td class="r" title="판매계획 ${T(x.salesM)}t − ${md(D.month + '-01')}~${md(D.asOf)} 출고 ${T(x.shipped)}t(재고 변화로 계산 · MES 출하 ${T(x.shipMes)}t)">−${T(x.sales)}</td><td class="r"><b>${T(x.end)}</b></td><td class="r">${T(x.safety)}</td><td class="r">${T(x.target)}</td><td style="min-width:160px"><div class="sj-bar"><i style="width:${w}%;background:${st === '경고' || st === '부족' ? 'var(--bad)' : st === '주의' ? 'var(--warn)' : 'var(--good)'}"></i>${x.cap ? `<u style="left:${100 / 1.6}%"></u>` : ''}</div><small>${x.endDays ?? '–'} / ${x.cap ?? '–'}일</small></td><td class="c">${B(st)}</td></tr>`; });
    const c1 = card(1, `그룹별 재고 브릿지 — ${+D.month.slice(5)}월 예상`, `${md(D.asOf)} 실재고 + 남은 생산(말일까지 일별 편성) − 남은 판매(판매계획 − 이달 출고) = 예상 월말 · 막대 = 재고일수 vs 상한(검은 선)`, tbl(['그룹', '유형', [`${md(D.asOf)} 실재고`, 'r'], ['+ 남은 생산', 'r'], ['− 남은 판매', 'r'], ['= 예상 월말', 'r'], ['안전재고', 'r'], ['목표', 'r'], '재고일수 / 상한', ['상태', 'c']], rows)
      + '<p class="sj-foot">실재고 = 판생속보 그룹 재고(장기재고 포함 — 컬러건재 일수가 높게 보임) · 남은 생산 = 통합 계획 일별 편성(엔진 월 물량과 다를 수 있음) · 남은 판매 = 판매계획 − 이달 출고(월초 실재고 + 생산 − 오늘 실재고로 계산 · MES 출하는 선적일 기준이라 도금수출이 크게 작음, 마우스) · 재고일수 = 월말 재고 ÷ 이달 판매계획 하루 평균 · 상태: 안전재고 밑 = 부족, 상한 초과 = 주의·경고 · 엔진 7개 그룹 단위 — 컬러 수출 3개 그룹(건재수출·가전수출·가전내수)·컬러건재 주문재/계획재는 엔진이 합쳐 계산해 그룹 합으로 표시. 계획재 단독은 아래 ④</p>');
    // 11/7 사용자 '월별 재고일수 추이 이것도' → 선 그림 대신 그룹 × 월 표(숫자 + 상한 대비 색)
    const t = D.trend, ks = Object.keys(t.v).filter((k) => inPl(k[0]));
    const NM = { G수출: '도금수출', G국내: '도금국내', G자동차: '자동차', G자가재: '도금 자가재', C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' };
    const cell = (v, cap) => { if (v == null) return '<td class="r">–</td>'; const c = !cap ? '' : v <= cap ? 'a1' : v <= cap + 5 ? 'a2' : 'a3'; return `<td class="r sj-dc ${c}"><b>${v}</b>일</td>`; };
    const trow = ks.map((k) => { const v = t.v[k], cap = t.cap[k], d = v.length > 1 && v[v.length - 1] != null && v[0] != null ? v[v.length - 1] - v[0] : null;
      return `<tr><td class="nm">${NM[k] || k}</td><td class="r">${cap ? cap + '일' : '–'}</td>${v.map((x) => cell(x, cap)).join('')}<td class="r">${d == null ? '–' : `<span class="${d > 0 ? 'wrn' : 'pos'}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d).toFixed(1)}일</span>`}</td></tr>`; });
    const c2 = card(3, '월말 재고일수 전망 — 표', '칸 색 = 상한 대비(초록 이하 · 노랑 +5일까지 · 빨강 초과)',
      tbl(['그룹', ['상한', 'r'], ...t.months.map((m) => [`${m.slice(2).replace('-', '.')}월말`, 'r']), [`${t.months[0].slice(5)}→${t.months[t.months.length - 1].slice(5)}월 변화`, 'r']], trow)
      + '<p class="sj-foot">재고일수 = 월말 재고 ÷ (그 달 판매계획 ÷ 일수) · 지난 달 = 월말 실재고 · 이달 = 위 브릿지 예상 월말과 같은 값 · 다음 달 = 이달 예상 + 일별 편성 − 판매계획</p>');
    const whc = ['C', 'G'].filter(inPl).map((p) => { const w = D.wh[p], r = w.cur / w.cap * 100; return `<div class="sj-gb"><div class="h"><span>${p === 'C' ? '컬러' : '도금'} 창고</span><b class="${r > 100 ? 'neg' : r > 90 ? 'wrn' : 'pos'}">${kt(w.cur)} / ${kt(w.cap)} (${Math.round(r)}%)</b></div><div class="sj-bar"><i style="width:${Math.min(100, r / 1.3)}%;background:${r > 100 ? 'var(--bad)' : r > 90 ? 'var(--warn)' : 'var(--good)'}"></i><u style="left:${100 / 1.3}%"></u></div><div class="sj-foot" style="margin:2px 0 0">${w.parts.map((q) => `${esc(q[0])} ${kt(q[1])}`).join(' · ')}</div></div>`; }).join('');
    const c3 = card(3, '창고 상한 (max 목표재고)', '판생속보 현재 재고(소재+제품) ÷ 상한', whc + '<p class="sj-foot">검은 선 = 100% · 90% 이상 주의 · 100% 초과 시 판생 경영층 보고 · 상한 = PDF 예시값(임시)</p>');
    const r = D.r15, cnt = r.cnt || {};
    const c4 = card(4, '계획재 사양 상태', `R15 ${r.n || '-'}개 사양 · 실재고 ${T(r.stock)} / 목표 ${T(r.target)}톤 (${r.target ? Math.round(r.stock / r.target * 100) : '-'}%)`,
      `<div class="ct-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:0">${[['정상 생산', cnt.ok], ['목표 초과(생산 중단 대상)', cnt.over], ['생산 뒤처짐', cnt.behind], ['부족·결품 우려', cnt.short]].map(([k, v], i) => `<div class="ct-kpi ${['ok', 'bad', 'warn', 'bad'][i]}"><div class="l">${k}</div><div class="v">${v ?? 0}<small>개</small></div></div>`).join('')}</div><p class="sj-foot">계획재 화면(R15 운영안) 판정 기준 · 재개 예정·제외(6개월 6톤 미만) 구분은 R15 지침서 규칙 연결 후 추가</p>`);
    const NM2 = { G수출: '도금수출', G국내: '도금국내', G자동차: '자동차', G자가재: '도금 자가재', C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' };
    const cm = card(2, '일별 재고일수', `${md(D.asOf)}까지 실제(실선) · 이후 전망(점선, 위 브릿지와 같은 식 — 마지막 날 = 예상 월말) · 점 = 최근 실제 · 가로 점선 = 상한 · 재고일수 = 재고 ÷ 이달 판매계획 하루 평균`,
      `<div class="sj-mts" style="grid-template-columns:repeat(${Math.max(1, Object.keys(D.stockDaily || {}).filter((k) => inPl(k[0])).length)},minmax(0,1fr))">${Object.keys(D.stockDaily || {}).filter((k) => inPl(k[0])).map((k) => dayStock(k, NM2[k] || k)).join('')}</div>`
      + '<p class="sj-foot">출고 = 남은 판매를 엔진 선적·납기일 모양대로 나눔(도금수출은 선적일에 크게 떨어짐) · 도금국내·자동차는 엔진 출고일이 말일에 몰려 있어 남은 날에 고르게 · 자가재·수요개발은 일별 자료 없음</p>');
    return c1 + cm + c2.replace("'월별 재고일수 추이'", '') + `<div class="sj-g2e">${c3}${c4}</div>` + '<p class="sj-foot">출하 예정 없는 재고(출하오더 비연결 가용재고 · 180일) = 재고↔출하오더 연결 조회 추가 후 표시</p>';
  }

  /* ---------- ⑥ 월 실적 마감 ---------- */
  function close() {
    const C = D.close, R = C.rows.filter((x) => inPl(x.eng[0]));
    const df = (a, p) => (a == null || p == null ? '–' : `<span class="${a - p < -p * 0.05 ? 'neg' : a - p > p * 0.1 ? 'wrn' : ''}">${a - p >= 0 ? '+' : ''}${n0(a - p)}</span>`);
    const rows = R.map((x) => `<tr><td class="nm">${esc(x.name)}</td><td class="r">${T(x.salesPlan)}</td><td class="r">${T(x.salesAct)}</td><td class="r">${df(x.salesAct, x.salesPlan)}</td><td class="r">${T(x.prodPlan)}</td><td class="r">${T(x.prodAct)}</td><td class="r">${df(x.prodAct, x.prodPlan)}</td><td class="r">${T(x.endPlan)}</td><td class="r">${T(x.endAct)}</td><td class="r">${df(x.endAct, x.endPlan)}</td></tr>`);
    const R2 = R.filter((x) => x.eng !== 'G자가재'), s = (k) => R2.reduce((a, x) => a + (x[k] || 0), 0), sb = (k1, k2) => R2.filter((x) => x[k1] != null && x[k2] != null).reduce((a, x) => [a[0] + x[k1], a[1] + x[k2]], [0, 0]);
    const [sA, sP] = sb('salesAct', 'salesPlan'), [pA, pP] = sb('prodAct', 'prodPlan'), [eA, eP] = sb('endAct', 'endPlan');   // 합계 = 계획·실적이 둘 다 있는 그룹끼리
    rows.push(`<tr class="tot"><td>합계<small class="muted"> 자가재 제외 · 양쪽 다 있는 그룹</small></td><td class="r">${T(sP)}</td><td class="r">${T(sA)}</td><td class="r">${df(sA, sP)}</td><td class="r">${T(pP)}</td><td class="r">${T(pA)}</td><td class="r">${df(pA, pP)}</td><td class="r">${T(eP)}</td><td class="r">${T(eA)}</td><td class="r">${df(eA, eP)}</td></tr>`);
    const c1 = card(1, `판매·생산·재고 대사표 — ${C.month.slice(2).replace('-', '.')}월`, '단위 톤 · 차이 = 실적 − 계획 · 판매 −5% 이하 빨강, 재고 +10% 이상 주황', tbl(['그룹', ['판매 계획', 'r'], ['판매 실적', 'r'], ['차이', 'r'], ['생산 계획<small>엔진 월 물량(참고)</small>', 'r'], ['생산 실적', 'r'], ['차이', 'r'], ['기말재고 계획', 'r'], ['기말재고 실적', 'r'], ['차이', 'r']], rows)
      + `<p class="sj-foot">판매 실적 = MES 출하(선적월) · 생산 실적 = 실적 코일 그룹 합(도금은 재계획 때 실적으로 맞춘 날) · 기말재고 실적 = ${C.month.slice(5)}/말 판생속보 재고(장기재고 포함) · 계획 = 현재 통합 계획의 ${+C.month.slice(5)}월 값(월초 확정 판 이력은 11월부터 쌓음 — 다음 달 마감부터 월초 판 기준)</p>`);
    const V = evMap('val'), cs = (kind, list) => list.map((c) => `<div class="sj-kv"><span>${esc(c)}</span><input class="sj-in" data-val="${esc(kind + '|' + C.month + '|' + c)}" value="${esc((V[kind + '|' + C.month + '|' + c] || {}).val || '')}" size="7" placeholder="톤"></div>`).join('');
    const c2 = card(2, '판매 미달 원인', '수주팀 입력(그룹·품명 단위 미달분에 원인 코드)', cs('salesCause', D.cfg.causes.sales));
    const c3 = card(3, '재고 초과 원인', '수주팀 입력', cs('stockCause', D.cfg.causes.stock));
    const [sa, sp] = sb('salesAct', 'salesPlan'), [sa2, pa] = sb('salesAct', 'prodAct');
    const kp = [['판매 / 생산비', 'Σ판매 실적 ÷ Σ생산 실적(출하 실적 있는 그룹)', pa ? (sa2 / pa).toFixed(2) : '–', '1.00 ± 0.03'], ['판매 달성률', 'Σ판매 실적 ÷ Σ판매 계획(출하 실적 있는 그룹)', pct(sp ? sa / sp * 100 : null), '95% 이상']];
    const c4 = card(4, '관리지표', `${C.month.slice(2).replace('-', '.')}월 · 수주팀 목표 관리 지표`, tbl(['지표', '산식', ['값', 'r'], '목표'], kp.map((r) => `<tr><td class="nm">${r[0]}</td><td class="sub">${r[1]}</td><td class="r"><b>${r[2]}</b></td><td>${r[3]}</td></tr>`))
      + '<p class="sj-foot">계획재 판매·생산 비중, 재고일수(컬러·도금), 소재 입고 준수율, 주문 마감 준수율, 출하 예정 없는 재고 — 월말 값을 매달 저장하기 시작해 다음 달부터 4개월 추이로 표시</p>');
    const K = evMap('ck');
    const ck = D.cfg.checklist.map((c) => { const id = D.month + '|' + c.step, e = K[id] || {}, st = e.val || (+D.today.slice(8) > c.to ? '확인 필요' : +D.today.slice(8) >= c.from ? '진행' : '예정');
      return `<tr><td class="c">${c.step}</td><td class="nm">${esc(c.text)}</td><td>${esc(c.dept)}</td><td>${+D.month.slice(5)}/${c.from}~${c.to}</td><td>${e.val === '완료' ? `${md(String(e.at || '').slice(0, 10))} ${esc(e.by || '')}` : '–'}</td><td><select class="sj-in" data-ck="${esc(id)}">${['예정', '진행', '완료', '지연', '확인 필요'].map((x) => `<option${x === st ? ' selected' : ''}>${x}</option>`).join('')}</select></td></tr>`; });
    const c5 = card(5, `이번 달(${+D.month.slice(5)}월) 갱신 체크리스트`, '월간 운영 일정 연동 · 완료 시 담당자·일시 기록', tbl([['단계', 'c'], '내용', '담당', '기한', '완료일', '상태'], ck));
    return c1 + `<div class="sj-g2e">${c2}${c3}</div>` + c4 + c5;
  }
})();
