/* 수주 관제(11/7 사용자 '수주팀 PDF 양식 그대로 탭 하나 새로 만들어') — 6개 화면 = 주소 #dash #order #prod #mat #stock #close
   자료: published/suju.enc.json(gadong-plan tools/suju_build.py) · 조치 상태·원인·체크리스트·포스코 Room 입력 = 공유 저장소(CT.store, t:'suju')
   11/11 전면 개편: 화면마다 첫 줄 = 결론(문제·톤), 그다음 묶음별, 맨 아래 '기준·사양' 접기 */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const VIEWS = ['dash', 'order', 'prod', 'mat', 'stock', 'close'];
  const TITLE = { order: ['수주 진도', '판매계획만큼 주문이 확정되고 있는가'],
    prod: ['생산', '확정된 주문을 계획대로 만들고 있는가'],
    mat: ['소재', '만들 소재가 제때 들어오는가'],
    stock: ['재고', '재고가 안전재고와 상한 사이에 있는가'],
    close: ['월 실적 마감', '전월 판매·생산·재고 대사 · 매월 1~5일'] };
  let D = null, EV = [], bound = false, grpSel = 'all', lineSel = null, curveG = null;
  CT.boot(['suju.enc.json'], (X) => { D = X.suju; const GO = ['도금수출', '도금국내', '자동차', '자가재', '건재수출', '가전수출', '가전내수', '주문재', '계획재', '수요개발'];   // 11/11 회의: 모든 화면 도금 먼저 · 수요개발 맨 뒤
    if (D) D.elapsedPct = D.asOf && D.nDays ? +String(D.asOf).slice(8, 10) / D.nDays * 100 : null;
    if (D && D.groups) D.groups.sort((a, b) => (GO.indexOf(a.key) + 1 || 99) - (GO.indexOf(b.key) + 1 || 99)); load(); });

  async function load() { try { EV = (await CT.store.events()).filter((e) => e && e.t === 'suju'); } catch (e) { EV = []; } draw(); }
  const evMap = (kind) => { const m = {}; for (const e of EV) if (e.kind === kind && e.id) m[e.id] = e; return m; };
  async function save(kind, id, val) { try { await CT.store.push({ t: 'suju', kind, id, val }); UI.toast && UI.toast('저장했습니다'); await load(); } catch (e) { alert('저장 실패: ' + e.message); } }

  const pl = () => CT.scope();
  const inPl = (p) => pl() === 'all' || pl() === p;
  const SC = { 정상: 'ok', 주의: 'warn', 경고: 'bad', 부족: 'bad', 확인: 'warn' };
  const B = (st, txt) => (st ? `<span class="ct-b ${SC[st] || 'na'}">${esc(txt || st)}</span>` : '<span class="ct-b na">–</span>');
  // 계획보다 많이 만든 쪽(경고·주의 수준은 그대로) = 빨강 아님 · '초과'(주황) — 빨강은 모자람·뒤처짐에만
  const isOver = (st, v) => (st === '경고' || st === '주의') && v != null && v > 100;
  const BA = (st, v, txt) => (isOver(st, v) ? `<span class="ct-b ${st === '경고' ? 'ov' : 'warn'}" title="계획보다 많이 생산 — ${st} 수준">${esc(txt ? txt + ' 초과' : '초과')}</span>` : B(st, txt));
  const OP = {};   // 접어 둔 칸을 펼친 상태 — 다시 그려도 유지
  const pct = (v) => (v == null ? '–' : `${(+v).toFixed(1)}%`);
  const T = (v) => (v == null ? '–' : n0(v));
  const kt = (v) => UI.fmtT(v);
  const PN = (p) => (p === 'G' ? '도금' : '컬러');
  const card = (n, title, sub, body, cls = '', nf = false) => `<section class="card ${cls}"><h2>${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ''}${nf && grpSel !== 'all' ? ' <small>· 그룹 선택 미적용(라인·소재 단위)</small>' : ''}</h2>${body}</section>`;
  const tbl = (head, rows, cls = '') => `<div class="ct-wrap"><table class="ct-t ${cls}"><thead><tr>${head.map((h) => (Array.isArray(h) ? `<th class="${h[1]}"${h[2] ? ` title="${esc(h[2])}"` : ''}>${h[0]}</th>` : `<th>${h}</th>`)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const CW = (f) => Math.round(Math.max(480, ((document.getElementById('ct-main') || {}).clientWidth || 1200) * f - 50));   // 차트 = 실제 칸 너비(px)
  const wait = (txt) => UI.empty('자료 연결 대기', txt);
  const dday = (d) => { const n = CT.diff(d, D.today); return n == null ? '' : n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };
  const groups = () => D.groups.filter((g) => inPl(g.plant) && (grpSel === 'all' || g.key === grpSel));
  const kpi = (t, tone, v, s, tip) => `<div class="ct-kpi ${tone || ''}"${tip ? ` title="${esc(tip)}"` : ''}><div class="l">${t}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const toneOf = (st) => SC[st] || '';
  // 맨 아래 기준·사양 접기(모든 하위 화면 공통)
  const fold = (k, body) => `<details class="fold sj-dt sj-spec" data-k="${k}"${OP[k] ? ' open' : ''}><summary>기준·사양</summary><div class="sj-spb">${body}</div></details>`;
  const defs = (L) => `<div class="sj-def">${L.map(([a, b]) => `<div><b>${a}</b> ${b}</div>`).join('')}</div>`;
  const bar = (v, mx, col, mark) => `<div class="sj-bar"><i style="width:${Math.max(0, Math.min(100, v / mx * 100))}%;background:${col}"></i>${mark != null ? `<u style="left:${Math.min(100, mark / mx * 100)}%"></u>` : ''}</div>`;
  const stCol = (st, ov) => (ov ? 'var(--warn)' : st === '정상' ? 'var(--good)' : st === '주의' || st === '확인' ? 'var(--warn)' : st ? 'var(--bad)' : 'var(--ink-3)');

  function draw() {
    const m = document.getElementById('ct-main'), v = CT.view('dash', VIEWS);
    const H = head();
    m.innerHTML = v === 'dash' ? H.top + dash(H)
      : H.top + H.dl + `<div class="sj-h"><h2>${esc(TITLE[v][0])}</h2><p>${esc(TITLE[v][1])}</p></div>` + ({ order, prod, mat, stock, close }[v])();
    m.querySelectorAll('details[data-k]').forEach((d) => (d.ontoggle = () => { OP[d.dataset.k] = d.open; }));
    const cw = m.querySelector('.sj-cal'), cn = cw && cw.querySelector('th.now');     // 일별 캘린더: 오늘 칸이 보이게
    if (cn && cw.parentNode.scrollWidth > cw.parentNode.clientWidth) { const wr = cw.parentNode, lab = cw.querySelector('th.lab'), lw = lab ? lab.offsetWidth : 0, x = cn.offsetLeft - lw - (wr.clientWidth - lw) / 2;
      const th = [...cw.querySelectorAll('thead th:not(.lab)')].filter((t) => t.offsetLeft - lw <= x).pop(); wr.scrollLeft = th ? th.offsetLeft - lw : 0; }
    m.querySelector('#sj-grp') && (m.querySelector('#sj-grp').onchange = (e) => { grpSel = e.target.value; draw(); });
    m.querySelectorAll('[data-act]').forEach((s) => (s.onchange = () => save('act', s.dataset.act, s.value)));
    m.querySelectorAll('[data-ck]').forEach((s) => (s.onchange = () => save('ck', s.dataset.ck, s.value)));
    m.querySelectorAll('[data-val]').forEach((s) => (s.onchange = () => save('val', s.dataset.val, s.value)));
    m.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => { OP[b.dataset.more] = !OP[b.dataset.more]; draw(); }));
    m.querySelectorAll('[data-line]').forEach((b) => (b.onclick = () => { lineSel = b.dataset.line; draw(); }));
    m.querySelectorAll('[data-cg]').forEach((b) => (b.onclick = () => { curveG = b.dataset.cg; draw(); }));
    if (!bound) { let rt = null; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); });
      bound = true; CT.onView(() => { draw(); window.scrollTo(0, 0); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }

  /* ---------- 공통 머리: 기준월·기준일·자료 시각 · 그룹 · 이번 주 마감 · 월간 운영 일정 ---------- */
  function head() {
    const C = D.cfg, td = D.today, ym = D.month, nd = D.nDays, day = +td.slice(8);
    const top0 = `<span class="sj-pill">기준월 <b>${ym.slice(0, 4)}.${ym.slice(5)}</b></span>`
      + `<span class="sj-pill b">기준일 ${md(td)}(${'일월화수목금토'[new Date(td + 'T00:00:00Z').getUTCDay()]}) · 경과 ${day - 1} / ${nd}일</span>`
      + `<span class="sj-pill s">실적·재고 ~${md(D.asOf)} · 주문 ${(() => { const t = String(D.dataAt.orderLatest || D.dataAt.order || ''); return t ? `${md(t)} ${esc(t.slice(11, 16))}` : '-'; })()}</span>`;
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
    const top = `<div class="sj-top">${top0}<label class="sj-gs"><span>그룹</span><select id="sj-grp" aria-label="그룹" title="컬러·도금은 위 공통 보기(전체/도금/컬러)로 거름">${gopt}</select></label></div>`;
    const dl = `<div class="sj-flt"><div class="sj-dl"><b class="h">이번 주 마감</b>${chips.map((c) => c[1]).join('') || '<span class="muted">없음</span>'}</div></div>`;
    // 11/11 사용자 '월간 운영일정을 맨 위로' → 접기 없이 단계 띠(날짜순 8단계 · 완료 회색 / 진행 주황 / 예정 D-n) + 이달 경과 막대
    const it = C.schedule.slice().sort((a, b) => a.from - b.from || a.to - b.to).map((s) => { const z = Math.min(s.to, nd), st = day > z ? ['완료', 'done'] : day >= s.from ? ['진행', 'now'] : [`D-${s.from - day}`, 'next'];
      return `<div class="sj-stp ${st[1]}" title="${esc(s.label)} · ${+ym.slice(5)}/${s.from}${s.to !== s.from ? '~' + z : ''}"><div class="h"><b class="dt">${+ym.slice(5)}/${s.from}${s.to !== s.from ? '~' + z : ''}</b><span class="ct-b ${st[1] === 'done' ? 'na' : st[1] === 'now' ? 'warn' : 'ok'}">${st[0]}</span></div><div class="t">${esc(s.label)}</div></div>`; }).join('');
    const sch = `<section class="sj-sch2"><div class="cap"><b>${+ym.slice(5)}월 운영 일정</b><div class="sj-mb" title="이달 경과 ${day - 1} / ${nd}일"><i style="width:${(day - 1) / nd * 100}%"></i></div><span>오늘 ${md(td)}</span></div><div class="sj-stps">${it}</div></section>`;
    return { top, dl, sch };
  }

  /* ---------- ① 종합 관제판 ---------- */
  function dash(H) {
    const G = groups();
    const dem = G.filter((g) => g.base != null), sb = dem.reduce((a, g) => a + g.base, 0), so = dem.reduce((a, g) => a + g.orders, 0);
    const prog = sb ? so / sb * 100 : null, gapN = new Set(dem.filter((g) => g.progSt === '경고').map((g) => g.progGrp ? 'C수출' : g.key)).size, gapT = dem.reduce((a, g) => a + (g.gap || 0), 0);
    const LN = D.lines.filter((l) => inPl(l.pl)), lsch = LN.reduce((a, l) => a + (l.sched || 0), 0), lact = LN.reduce((a, l) => a + (l.actual || 0), 0), ach = lsch ? lact / lsch * 100 : null;   // 생산 달성률 = 판생 일정누계 대비(③ 생산과 같은 기준)
    const mats = D.mats.filter((x) => inPl(x.plant)), mw = mats.filter((x) => x.st === '경고'), mo = mats.filter((x) => x.st === '주의');
    const wh = ['G', 'C'].filter(inPl).map((p) => D.wh[p]), whCur = wh.reduce((a, x) => a + x.cur, 0), whCap = wh.reduce((a, x) => a + x.cap, 0);
    const salesD = dem.reduce((a, g) => a + (g.sales || 0), 0);
    const pctK = (v) => (v == null ? '–' : `${(+v).toFixed(1)}<small>%</small>`);
    const st1 = prog == null ? null : prog >= 100 ? '정상' : prog >= 90 ? '주의' : '경고';
    const st2 = ach == null ? null : ach >= 95 && ach <= 105 ? '정상' : ach >= 90 && ach <= 110 ? '주의' : '경고';
    const st3 = mw.length ? '경고' : mo.length ? '주의' : '정상', r4 = whCur / whCap, st4 = r4 > 1 ? '경고' : r4 > 0.9 ? '주의' : '정상';
    const k1 = kpi(`수주 진도 ${B(st1)}`, toneOf(st1), pctK(prog), `확정 ${T(so)} / 기준선 ${T(sb)}t<br>부족 <b class="neg">${T(gapT)}t</b> · 경고 ${gapN}개 그룹`,
      `월 판매계획(주문 받는 그룹 ${T(salesD)}t — 계획재·자가재 제외) 대비 ${pct(salesD ? so / salesD * 100 : null)}`);
    const k2 = kpi(`생산 달성률 ${ach > 105 ? BA(st2, ach) : B(st2)}`, ach > 105 ? 'warn' : toneOf(st2), pctK(ach),
      `실적 ${T(lact)} / 일정 누계 ${T(lsch)}t<br>${LN.filter((l) => l.ach != null && (l.ach < 90 || l.ach > 110)).map((l) => `${l.line} ${pct(l.ach)}`).join(' · ') || '라인 모두 90~110%'}`, `판매생산속보 일정 누계 대비 · 실적 ~${md(D.asOf)}`);
    const k3 = kpi(`소재 결품 위험 ${B(st3)}`, toneOf(st3), `경고 ${mw.length}<small>· 주의 ${mo.length}</small>`,
      `${mw.concat(mo).map((x) => `<b>${esc(x.name)}</b> 월말 ${x.days}일분(${T(x.end)}t)`).join('<br>') || '모든 소재 월말 7일분 이상'}`, '월말 재고 7일분 미만 주의 · 5일분 미만 경고');
    const k4 = kpi(`창고 재고 ${B(st4)}`, toneOf(st4), `${T(whCur)}<small>t</small>`, `상한 ${T(whCap)}t의 <b class="${r4 > 1 ? 'neg' : ''}">${Math.round(r4 * 100)}%</b>`,
      `상한 = '27 판생 월말 최대(계획 규칙) · 판생속보 ${wh.map((x) => x.parts.map((p) => `${p[0]} ${kt(p[1])}`).join(' · ')).join(' / ')}`);
    const spec = fold('fd', `<h3>신호등 기준</h3>` + tbl(['지표', '산식', '정상', '주의', '경고'], D.cfg.signals.map((s) => `<tr><td class="nm">${esc(s.name)}</td><td class="wrap">${esc(s.calc)}</td><td class="pos">${esc(s.ok)}</td><td class="wrn">${esc(s.warn)}</td><td class="neg">${esc(s.bad)}</td></tr>`))
      + `<h3>용어·산식</h3>` + defs([['기준선', `오늘까지 주문이 확정돼 있어야 할 양 = 이달 1일 ~ ${md(D.cut)}(지난 수요일 마감으로 확정되는 다음 생산주의 끝) 일별가동계획 편성량`],
        ['확정 주문', `이달 생산 실적 + ${md(D.cut)}까지 만들 잔량 중 소재 매치(도금 = 소재 입고·생산 중) · 숫자에 마우스 = 소재 매치 전 포함 등록 주문`],
        ['생산 계획·실적', `생산 기준(출하 아님) · 계획 = 이달 초 게시 계획의 1일~${md(D.asOf)} 합 · 그룹별 판생 계획이 없어 엔진 계획 대비(위 KPI·생산 화면은 판생 일정 누계 기준)`],
        ['합으로 판정', '컬러수출 3그룹(수주·생산)·컬러건재 주문재+계획재(생산)는 계획판·실적·주문의 세부 분류가 서로 달라 묶음 합으로 판정 — 표에서 한 칸으로 합쳐 표시'],
        ['재고', `${md(D.asOf)} 실재고 + 남은 편성 − 남은 판매(재고 화면과 같은 값) · 안전재고 밑 = 부족 · 상한 초과 = 과다`],
        ['창고 상한', `'27 판생 월말 최대(계획 규칙) — 컬러 ${kt(D.wh.C.cap)} · 도금 ${kt(D.wh.G.cap)}(도금 자가재는 상한 항목이 없어 제외)`],
        ['수주 진도 150% 초과', "'확인' — 확정 주문이 계획 편성보다 훨씬 많음(주문이 계획에 미반영)"]]));
    // 11/11 사용자: 월간 운영일정 맨 위 · 조치 필요는 맨 밑
    const lk = (h, k) => `<a class="sj-kl" href="${h}" title="누르면 자세히">${k}</a>`;   // 11/11 회의 '경고를 눌러도 아무것도 안 나온다' → 카드마다 해당 탭으로
    return H.sch + `<div class="ct-kpis sj-k4">${lk('#order', k1)}${lk('#prod', k2)}${lk('#mat', k3)}${lk('#stock', k4)}</div>` + H.dl + matrix(G, prog) + calendar() + actions() + spec;
  }

  /* ② 그룹 관제 매트릭스(11/11 사용자 '칸 늘려도 되니 더 직관적으로') — 수주 · 생산 · 재고 세 묶음, 공장별 소계, 합으로 판정하는 그룹은 한 칸으로 합침, 첫 칸 = 문제 */
  function matrix(G, prog) {
    // 11/11 검토: 생산 판정 = 표시 숫자와 같은 기준(실적 ÷ 월 계획 − 경과 위치) · ±5%p 정상 · ±10%p 주의 · 그 밖 경고(넘으면 초과)
    const mGap = (g) => (g.planMon ? (g.actMon - g.planMonCum) / g.planMon * 100 : null), mSt = (g) => { const d = mGap(g); return d == null ? null : Math.abs(d) <= 5 ? '정상' : Math.abs(d) <= 10 ? '주의' : '경고'; };
    const ISS = (g) => { const a = [];
      if (g.progSt === '경고' || g.progSt === '주의') a.push([SC[g.progSt], '수주 부족']);
      if (g.progSt === '확인') a.push(['warn', '주문 확인']);
      if (mSt(g) === '경고' || mSt(g) === '주의') a.push(mGap(g) > 0 ? ['warn', '생산 초과'] : [SC[mSt(g)], '생산 미달']);
      if (g.stockSt === '부족') a.push(['bad', '재고 부족']); else if (g.stockSt === '경고' || g.stockSt === '주의') a.push([SC[g.stockSt], '재고 과다']);
      return a; };
    const span = (L, i, k) => { const v = L[i][k]; if (!v) return 1; if (i > 0 && L[i - 1][k] === v) return 0; let n = 1; while (L[i + n] && L[i + n][k] === v) n++; return n; };
    const pc = (v, st, ov, n, note) => `<td class="bk pcol"${n > 1 ? ` rowspan="${n}"` : ''}>${v == null ? '<span class="ct-b na" title="계획 누계 300t 미만 — 판정 보류">–</span>' : `<div class="sj-pc">${ov ? BA(st, v, pct(v)) : B(st, pct(v))}${bar(v, 150, stCol(st, ov), 100)}${note ? `<span class="nt">${note}</span>` : ''}</div>`}</td>`;
    const row = (L, i) => { const g = L[i], is = ISS(g), ps = span(L, i, 'progGrp'), as = span(L, i, 'achGrp');
      const pcell = ps === 0 ? '' : g.base == null ? '<td class="bk pcol"><span class="muted">주문 없음</span></td>' : pc(g.progJ != null ? g.progJ : g.prog, g.progSt, false, ps, g.progGrp ? '3그룹 합' : '');
      // 11/11 회의: 생산 진도 = 월 계획 대비 실적(막대 검은 선 = 오늘까지 계획 위치) · 판정 색은 1일~어제 계획 대비
      const mv = g.planMon ? g.actMon / g.planMon * 100 : null, mk = g.planMon ? g.planMonCum / g.planMon * 100 : null;
      const acell = as === 0 ? '' : `<td class="bk pcol"${as > 1 ? ` rowspan="${as}"` : ''}>${mv == null ? (g.planMon === 0 ? '<span class="muted" title="이달 그룹 월 계획 0(재고가 목표보다 많음)">월 계획 0</span>' : '<span class="ct-b na">–</span>') : `<div class="sj-pc" title="월 계획 ${T(g.planMon)}t 중 실적 ${T(g.actMon)}t · 경과 위치 ${T(g.planMonCum)}t(${pct(mk)}) · 차이 ${mGap(g) >= 0 ? '+' : ''}${(mGap(g) || 0).toFixed(1)}%p">${B(mSt(g), pct(mv))}<span class="nt2">기준 ${pct(mk)}</span>${bar(mv, 100, stCol(mSt(g), mGap(g) > 5), mk)}${g.achGrp ? `<span class="nt">${g.achGrp.startsWith('컬러수출') ? '3그룹 합' : '건재 합'}</span>` : ''}</div>`}</td>`;
      // 출하: 판매생산속보 월 계획 · 실적 · 진도(검은 선 = 출하 기준선 = 그룹 출하 실적 패턴) — 컬러는 수출 3그룹·건재 2그룹 합
      const ss = span(L, i, 'shipGrp'), sv = g.shipMon ? g.shipAct / g.shipMon * 100 : null, sk = g.shipMon && g.shipDue != null ? g.shipDue / g.shipMon * 100 : null, sst = sv == null || sk == null ? null : sv - sk >= -5 ? '정상' : sv - sk >= -15 ? '주의' : '경고';
      const shcell = ss === 0 ? '' : g.shipMon == null ? '<td class="r bk"><span class="muted">출하 없음</span></td><td></td><td class="pcol"></td>'
        : `<td class="r bk"${ss > 1 ? ` rowspan="${ss}"` : ''}>${T(g.shipMon)}</td><td class="r"${ss > 1 ? ` rowspan="${ss}"` : ''}><b>${T(g.shipAct)}</b></td><td class="pcol"${ss > 1 ? ` rowspan="${ss}"` : ''}><div class="sj-pc" title="출하 실적 ${T(g.shipAct)}t / 월 계획 ${T(g.shipMon)}t · 기준선 ${T(g.shipDue)}t(${esc(g.shipBy || '')})">${B(sst, pct(sv))}<span class="nt2">기준 ${pct(sk)}</span>${bar(sv, 100, stCol(sst), sk)}${g.shipGrp ? `<span class="nt">${g.shipGrp.startsWith('컬러수출') ? '3그룹 합' : '건재 합'}</span>` : ''}</div></td>`;
      const ts = span(L, i, 'stockGrp');
      const stcell = ts === 0 ? '' : `<td class="r bk"${ts > 1 ? ` rowspan="${ts}"` : ''}>${T(g.end)}${g.stockGrp ? '<span class="nt">3그룹 합</span>' : ''}</td><td class="r"${ts > 1 ? ` rowspan="${ts}"` : ''}>${g.endDays == null ? (g.key === '계획재' ? '<span class="muted">목표 대비</span>' : '–') : `${g.endDays} / ${g.cap || '-'}일`}</td><td class="c"${ts > 1 ? ` rowspan="${ts}"` : ''}${g.stockSt === '부족' ? ` title="예상 월말 ${T(g.end)}t < 안전재고 ${T(g.safety)}t"` : ''}>${B(g.stockSt)}</td>`;
      return `<tr><td class="nm" title="${esc(g.type)} · ${esc(g.dept)}"><b>${esc(g.name)}</b></td>`
        + `<td class="iss">${is.map(([c, t]) => `<span class="ct-b ${c}">${t}</span>`).join('') || '<span class="ct-b ok">정상</span>'}</td>`
        + `<td class="r bk" title="${esc(g.salesSrc || '')}">${T(g.sales)}</td><td class="r">${T(g.base)}</td><td class="r" title="등록 주문(소재 매치 전 포함) ${T(g.ordReg)}t"><b>${T(g.orders)}</b></td>${pcell}`
        + (g.achGrp ? (as === 0 ? '' : `<td class="r bk"${as > 1 ? ` rowspan="${as}"` : ''} title="그룹 월 계획(판매 + 목표 − 기초)">${T(g.planMon)}<span class="nt">${g.achGrp.startsWith('컬러수출') ? '3그룹 합' : '건재 합'}</span></td>`) : `<td class="r bk" title="그룹 월 계획(판매 + 목표 − 기초)">${T(g.planMon)}</td>`) + `<td class="r"><b>${T(g.actCum)}</b></td>${acell}`
        + shcell + stcell + '</tr>'; };
    const sub = (nm, L) => { const s = (k) => L.reduce((a, g) => a + (g[k] || 0), 0), dm = L.filter((g) => g.base != null), b = dm.reduce((a, g) => a + g.base, 0), o = dm.reduce((a, g) => a + g.orders, 0), p = s('planCum'), a = s('actCum');
      const pv = b ? o / b * 100 : null, av = p ? a / p * 100 : null;
      const pmU = [...new Map(L.map((g) => [g.achGrp || g.key, g])).values()], pmS = pmU.reduce((x, g) => x + (g.planMon || 0), 0), shU = [...new Map(L.filter((g) => g.shipMon != null).map((g) => [g.shipGrp || g.key, g])).values()], shM = shU.reduce((x, g) => x + g.shipMon, 0), shA = shU.reduce((x, g) => x + g.shipAct, 0);
      return `<tr class="sj-sub"><td colspan="2">${nm}</td><td class="r bk">${T(s('sales'))}</td><td class="r">${T(b)}</td><td class="r">${T(o)}</td><td class="bk pcol"><b class="${pv != null && pv < 90 ? 'neg' : ''}">${pct(pv)}</b></td><td class="r bk">${T(pmS)}</td><td class="r">${T(a)}</td><td class="bk pcol"><b>${pct(pmS ? a / pmS * 100 : null)}</b> <span class="nt2">기준 ${pct(D.elapsedPct)}</span></td><td class="r bk">${T(shM)}</td><td class="r">${T(shA)}</td><td class="pcol"><b>${pct(shM ? shA / shM * 100 : null)}</b></td><td class="bk" colspan="3"></td></tr>`; };
    let body = '';
    for (const p of ['G', 'C']) { const L = G.filter((g) => g.plant === p); if (!L.length) continue;
      const Ls = L.filter((g) => g.key !== '자가재');
      body += sub(`${PN(p)} 소계${p === 'G' ? ' <small>자가재 제외</small>' : ''}`, Ls) + L.map((_, i) => row(L, i)).join(''); }
    if (G.some((g) => g.plant === 'C') && G.some((g) => g.plant === 'G')) body += sub('전체 합계 <small>자가재 제외(내부 투입)</small>', G.filter((g) => g.key !== '자가재'));
    const hd = `<tr class="g"><th rowspan="2">그룹</th><th rowspan="2">문제</th><th colspan="4" class="bk">수주 <small>~${md(D.cut)} 편성 기준</small></th><th colspan="3" class="bk">생산 <small>월 계획 대비 · 실적 ~${md(D.asOf)}</small></th><th colspan="3" class="bk">출하 <small>판생 월 계획 대비</small></th><th colspan="3" class="bk">재고 <small>예상 월말</small></th></tr>`
      + `<tr><th class="r bk" title="이달 판매(출하) 목표">판매계획</th><th class="r" title="${md(D.month + '-01')}~${md(D.cut)} 생산 편성 — 오늘까지 확정됐어야 할 양">기준선</th><th class="r" title="실적 + 소재 매치 잔량">확정</th><th class="bk" title="확정 ÷ 기준선 · 검은 선 = 100%">진도</th>`
      + `<th class="r bk" title="이달 생산 계획(월 전체)">월 계획</th><th class="r">실적</th><th class="bk" title="실적 ÷ 월 계획 · 검은 선 = 오늘까지 계획 위치 · 색 = 오늘까지 계획 대비">진도</th><th class="r bk" title="판매생산속보 이달 출하 계획">월 계획</th><th class="r">실적</th><th title="출하 실적 ÷ 월 계획 · 검은 선 = 출하 기준선(그룹 출하 실적 패턴) · 출하 실적 = MES 출하(선적·출고 확정 기준, 월간 가동과 같은 값) — 재고 탭의 출고(재고 변화로 계산)와 기준이 다름">진도</th><th class="r bk">재고(t)</th><th class="r" title="예상 / 상한">일수</th><th class="c">상태</th></tr>`;
    return card(2, '그룹 관제 매트릭스', `수주 · 생산 · 출하 · 재고 · ${+D.month.slice(5)}월 · 막대 검은 선 = 오늘 있어야 할 위치`,
      `<div class="ct-wrap"><table class="ct-t sj-mx2"><colgroup><col class="c-nm"><col class="c-is"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-pc"><col class="c-n"><col class="c-n"><col class="c-pc"><col class="c-n"><col class="c-n"><col class="c-pc"><col class="c-n"><col class="c-d"><col class="c-st"></colgroup><thead>${hd}</thead><tbody>${body}</tbody></table></div>`);
  }

  /* ③ 일별 계획 캘린더: 라인 가동(지난 날 실적, 오늘 이후 계획) + 그룹별 계획·실적 + 소재 재고일수 */
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
    const LC = { '1CCL': 'PVS 등', '2CCL': '건재', '3CCL': 'STS·POR·PLY', '4CCL': 'PPG·PPH·Al', '1CGL': 'AZ·AL', '2CGL': 'AL·MAC' };
    const sec = (t) => `<tr class="sec"><td colspan="${nd + 1}">${t}</td></tr>`;
    let body = wkRow;
    /* 11/11 회의: 한 칸에 위 = 계획 · 아래 = 실적(차이는 안 씀) · 라인 합계 줄 · 그룹도 같은 모양 · 도금 먼저 · 소재 재고일수는 소재 탭으로 */
    const cell2 = (d, p, a) => { const k = wcls(d);
      if (d <= D.asOf) { if (a == null) return `<td class="nd${k}">–</td>`; if (!(a > 0.5) && !(p > 0.5)) return `<td class="id${k}" title="${md(d)} 휴지">휴</td>`;
        return `<td class="pa${k}${a + 0.5 < p ? ' lo' : ''}" title="${md(d)} 계획 ${n0(p)}t · 실적 ${n0(a)}t"><span>${nf(p)}</span><b>${nf(a)}</b></td>`; }
      return p > 0.5 ? `<td class="pl${k}" title="${md(d)} 계획 ${n0(p)}t"><span>${nf(p)}</span><b class="fu">·</b></td>` : `<td class="id${k}" title="계획 없음(휴지·정지)">휴</td>`; };
    const labOf = (nm, sub, R) => { const mp = R.reduce((s_, r) => s_ + (r.p || 0), 0), cp = R.reduce((s_, r) => s_ + (r.d <= D.asOf ? r.p || 0 : 0), 0), ca = R.reduce((s_, r) => s_ + (r.a || 0), 0);
      return `<td class="lab" title="월 계획 ${n0(mp)}t · 1일~${md(D.asOf)} 계획 ${n0(cp)}t · 실적 ${n0(ca)}t"><b>${esc(nm)}</b><span>${sub ? esc(sub) + ' · ' : ''}월 ${n0(mp)}t</span><span class="pa2">누계 ${n0(cp)} → ${n0(ca)}</span></td>`; };
    const rowOf = (nm, sub, R, cls = '') => `<tr class="r2${cls}">${labOf(nm, sub, R)}${R.map((r) => cell2(r.d, r.p, r.a)).join('')}</tr>`;
    const lineR = (l) => (D.daily[l] || []).map(([d, p0, p, a]) => ({ d, p: d <= D.asOf ? p0 : p, a: d <= D.asOf ? a : null }));
    const sumR = (Ls) => days.map((d, i) => { const xs = Ls.map((R) => R[i]).filter(Boolean); return { d, p: xs.reduce((s_, x) => s_ + (x.p || 0), 0), a: d <= D.asOf && xs.some((x) => x.a != null) ? xs.reduce((s_, x) => s_ + (x.a || 0), 0) : null }; });
    const plantBlock = (pl, nm, lines) => { if (!inPl(pl)) return ''; const Rs = lines.map(lineR); return sec(`${nm} · 라인별 일 생산(톤) — 칸 위 계획 · 아래 실적`) + lines.map((l, i) => rowOf(l, LC[l], Rs[i])).join('') + rowOf(`${nm} 합계`, '', sumR(Rs), ' tot'); };
    body += plantBlock('G', '도금', ['1CGL', '2CGL']) + plantBlock('C', '컬러', ['1CCL', '2CCL', '3CCL', '4CCL']);
    const GN = Object.fromEntries((D.groups || []).map((g) => [g.key, g.name])), GC = ['건재수출', '가전수출', '가전내수', '주문재', '계획재', '수요개발'], GG = ['도금수출', '도금국내', '자동차', '자가재'];
    const gk = (ks) => ks.filter((g) => (D.gdaily || {})[g] && D.gdaily[g].some((r) => r[1] > 0.5 || r[2] > 0.5));
    const gR = (g) => D.gdaily[g].map(([d, p, a]) => ({ d, p, a: d <= D.asOf ? (a == null ? 0 : a) : null }));
    if (D.gdaily) {
      if (inPl('G')) body += sec('도금 그룹별(톤) — 칸 위 계획(지난 날 = 월초 계획) · 아래 실적') + gk(GG).map((g) => rowOf(GN[g] || g, '', gR(g))).join('');
      if (inPl('C')) body += sec('컬러 그룹별(톤) — 칸 위 계획(지난 날 = 월초 계획) · 아래 실적') + gk(GC).map((g) => rowOf(GN[g] || g, '', gR(g))).join('');
    }
    const MD = [];
    const lg = `<div class="sj-clg"><span><i class="ac"></i>실적(지난 날)</span><span><i class="pl"></i>계획</span><span><i class="id"></i>휴지</span>`
      + `<span class="gap"><i class="w1"></i>확정된 생산주</span><span><i class="w2"></i>수주 중</span><span><i class="w3"></i>마감 전</span><span class="gap"><i class="nowk"></i>오늘</span>${MD.length ? '<span class="gap">소재 ▲ = 그날 입고 예정</span>' : ''}</div>`;
    return card(3, `${+D.month.slice(5)}월 일별 계획 캘린더 — 도금·컬러 계획 대비 실적`, '칸에 마우스 = 상세',
      lg + `<div class="ct-wrap scroll"><table class="sj-cal"><thead>${hd}</thead><tbody>${body}</tbody></table></div><p class="sj-foot">굵은 세로선 = 생산주 시작(수요일) · 소재 = 오늘 실재고 + MES 입고 예정 − 계획 소요(미발주 제외) → <a href="#mat">소재 화면</a></p>`, '', true);
  }

  function actions() {
    const S = evMap('act'), gn = (D.groups.find((g) => g.key === grpSel) || {}).name, L = D.actions.filter((a) => grpSel === 'all' || (gn && (a.text || '').startsWith(gn)));
    const NA = 6, rows = L.map((a, i) => { const id = CT.issueId(a.area + '|' + a.text.replace(/[\d,.]+/g, '#')); const st = (S[id] || {}).val || '미조치';
      return `<tr${i >= NA ? ' class="x"' : ''}><td>${B(a.lvl)}</td><td>${esc(a.area || '')}</td><td class="wrap">${esc(a.text)}</td><td class="c">${a.due ? md(a.due) : '–'}</td><td>${esc(a.dept || '')}</td><td><select class="sj-in" data-act="${id}" aria-label="조치 상태">${['미조치', '진행', '완료'].map((x) => `<option${x === st ? ' selected' : ''}>${x}</option>`).join('')}</select>${S[id] ? `<small class="muted"> ${esc(S[id].by || '')} ${md(String(S[id].at || '').slice(0, 10))}</small>` : ''}</td></tr>`; });
    const nb = L.filter((a) => a.lvl === '경고').length;
    return card(4, `이번 주 조치 필요 ${L.length}건`, `경고 ${nb} · 주의 ${L.length - nb} · 경고 먼저`,
      rows.length ? tbl(['신호', '영역', '내용', ['마감일', 'c'], '담당부서', '상태'], rows) + (L.length > NA ? `<button type="button" class="btn sm sj-more" data-more="act" aria-expanded="${!!OP.act}">${OP.act ? '접기' : `나머지 ${L.length - NA}건 보기`}</button>` : '') : UI.empty('경고·주의 항목 없음'), `sj-act${OP.act ? ' all' : ''}`);
  }

  /* ---------- ② 수주 진도 ---------- */
  const STG = [['생산 완료', '#1e7a46'], ['생산 중', '#2457c5'], ['소재 확보', '#7fa6e3'], ['소재 대기', '#d9962b'], ['소재 없음', '#c0392b']];
  function order() {
    const W = D.weekOrders, dem = groups().filter((g) => g.base != null), keys = dem.map((g) => g.key);
    const sb = dem.reduce((a, g) => a + g.base, 0), so = dem.reduce((a, g) => a + g.orders, 0), gapT = dem.reduce((a, x) => a + (x.gap || 0), 0), prog = sb ? so / sb * 100 : null;
    const gsel = curveG && (curveG === 'all' || keys.includes(curveG)) ? curveG : 'all';
    const wv = (w, k) => (gsel === 'all' ? keys.reduce((a, q) => a + ((w.g[q] || {})[k] || 0), 0) : (w.g[gsel] || {})[k] || 0);
    const nextDl = W.find((w) => w.deadline >= D.today && w.state !== '마감');
    // 미수주 위험(마감 2주 이내 · 확정률 70% 미만)
    const risk = [];
    for (const w of W) { if (CT.diff(w.deadline, D.today) > 14 || w.state === '마감' || w.past) continue; for (const k of keys) { const x = w.g[k] || {}; if (!x.plan || x.plan < 50) continue; const r = x.mat / x.plan * 100; if (r < 70) risk.push([w, k, x, r]); } }
    // 결론 KPI
    const st1 = prog == null ? null : prog >= 100 ? '정상' : prog >= 90 ? '주의' : '경고';
    const nw = nextDl ? keys.reduce((a, k) => [a[0] + ((nextDl.g[k] || {}).plan || 0), a[1] + ((nextDl.g[k] || {}).mat || 0)], [0, 0]) : null;
    const k1 = kpi(`수주 진도 ${B(st1)}`, toneOf(st1), `${prog == null ? '–' : prog.toFixed(1)}<small>%</small>`, `확정 ${T(so)} / 기준선 ${T(sb)}t`);
    const k2 = kpi('기준선 대비 부족', gapT > 0 ? 'bad' : 'ok', `${T(gapT)}<small>t</small>`, `${dem.filter((g) => (g.gap || 0) > 0).map((g) => `${esc(g.name)} ${T(g.gap)}`).slice(0, 4).join(' · ') || '없음'}`);
    const k3 = nextDl ? kpi(`마감 ${md(nextDl.deadline)} <span class="ct-b warn">${dday(nextDl.deadline)}</span>`, nw[0] && nw[1] / nw[0] < 0.7 ? 'warn' : '', `${nw[0] ? Math.round(nw[1] / nw[0] * 100) : '–'}<small>% 확정</small>`, `생산주 ${md(nextDl.wFrom)}~${md(CT.addD(nextDl.wFrom, 6))} · 편성 ${T(nw[0])} 중 확정 ${T(nw[1])}t`) : kpi('다음 마감', '', '–', '이달 남은 마감 없음');
    const k4 = kpi('미수주 위험', risk.length ? 'bad' : 'ok', `${risk.length}<small>건</small>`, risk.length ? `${[...new Set(risk.map((r) => D.groups.find((y) => y.key === r[1]).name))].join(' · ')}` : '마감 2주 안 확정률 70% 미만 없음');
    // 그룹별 진도
    // 11/12 사용자 '계획재 어디 갔냐 · 통일해라': 그룹 순서·칸 순서를 위 매트릭스와 같게(판매계획 → 기준선 → 확정 → 부족 → 진도), 주문 없는 그룹(자가재·계획재)도 줄로
    const gr = groups().map((x) => {
      if (x.base == null) return `<tr><td class="nm"><b>${esc(x.name)}</b></td><td class="sj-cb"><span class="muted">주문 없이 계획 생산</span></td><td class="r">${T(x.sales)}</td><td class="r">–</td><td class="r">–</td><td class="r">–</td><td><span class="muted">주문 없음</span></td></tr>`;
      const rm = Math.max(x.sales || 0, x.base || 0, x.orders || 0, 1), Wd = (v) => `${Math.min(100, Math.max(0, v) / rm * 100)}%`, o = Math.min(x.orders || 0, x.sales || x.orders || 0), short = Math.max(0, (x.base || 0) - (x.orders || 0));
      return `<tr><td class="nm"><b>${esc(x.name)}</b></td><td class="sj-cb"><div class="tr"><i class="s" style="width:${Wd(x.sales || 0)}"></i><i class="o" style="width:${Wd(o)};background:${stCol(x.progSt)}"></i>${short ? `<i class="g" style="left:${Wd(x.orders || 0)};width:${Wd(short)}"></i>` : ''}<u style="left:${Wd(x.base || 0)}"></u></div></td>`
        + `<td class="r">${T(x.sales)}</td><td class="r">${T(x.base)}</td><td class="r"><b>${T(x.orders)}</b></td><td class="r"><b class="${short ? 'neg' : ''}">${short ? T(short) : '–'}</b></td><td>${B(x.progSt, pct(x.progJ != null ? x.progJ : x.prog))}${x.progGrp ? '<sup title="컬러수출 3그룹 합으로 판정">합</sup>' : ''}</td></tr>`; });
    const c2 = card(2, '그룹별 수주 — 도금 · 컬러', `${md(D.today)} 기준`,
      `<div class="sj-clg"><span><i style="background:var(--good)"></i>확정</span><span><i class="gsh"></i>부족 = 기준선 − 확정</span><span><i style="background:var(--sub)"></i>남은 판매계획</span><span><i class="bl"></i>기준선(~${md(D.cut)} 편성)</span></div>`
      + tbl(['그룹', '진행', ['판매계획', 'r'], ['기준선', 'r'], ['확정', 'r'], ['부족', 'r'], '진도'], gr, 'sj-cbt'));
    // 월 수주 누적(11/11 사용자 '더 직관적으로') — 생산주마다 누적 막대: 회색 틀 = 그 주까지 편성(있어야 할 주문), 채움 = 확정, 빨강 빗금 = 마감됐는데 모자란 양
    const segs = `<div class="seg ct-seg">${`<button type="button" data-cg="all" aria-pressed="${gsel === 'all'}">전체 그룹</button>`}${dem.map((x) => `<button type="button" data-cg="${x.key}" aria-pressed="${x.key === gsel}">${esc(x.name)}</button>`).join('')}</div>`;
    const gs = gsel === 'all' ? { name: '전체 그룹', sales: dem.reduce((a, x) => a + (x.sales || 0), 0) } : D.groups.find((x) => x.key === gsel);
    const c1 = card(1, `월 수주 누적 — ${gs.name}`, '생산주별 누적 · 수요일 마감 → 다음 생산주 확정', segs + cumChart(W, wv, gs.sales)
      + `<details class="fold sj-dt in" data-k="wk"${OP.wk ? ' open' : ''}><summary>주차별 숫자</summary>` + weekTable(W, wv, nextDl) + '</details>');
    const c6 = risk.length ? card(4, `미수주 위험 ${risk.length}건`, '마감 2주 이내 · 확정률 70% 미만', tbl(['그룹', '마감 · 생산주', ['편성', 'r'], ['확정', 'r'], ['부족', 'r'], ['확정률', 'r'], '담당'],
      risk.map(([w, k, x, r]) => `<tr><td class="nm"><b>${esc(D.groups.find((y) => y.key === k).name)}</b></td><td class="nw" title="생산주 ${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}">${md(w.deadline)} ${dday(w.deadline)}</td><td class="r">${T(x.plan)}</td><td class="r">${T(x.mat)}</td><td class="r"><b class="neg">${T(x.plan - x.mat)}</b></td><td class="r"><b class="neg">${pct(r)}</b></td><td class="nw" title="${esc(D.groups.find((y) => y.key === k).dept)}">${esc(String(D.groups.find((y) => y.key === k).dept || '').replace(/^마케팅\((.*)\)$/, '$1'))}</td></tr>`))) : '';
    const spec = fold('fo', '<h3>판매계획 기준</h3>' + tbl(['공장', '그룹', '운영유형', ['이달 판매계획(t)', 'r'], '출처', '담당'], D.groups.filter((g) => inPl(g.plant)).map((g) => `<tr><td>${PN(g.plant)}</td><td class="nm"><b>${esc(g.name)}</b></td><td><span class="sj-tag">${esc(g.type)}</span></td><td class="r">${T(g.sales)}</td><td class="wrap">${esc(g.key === '자가재' ? '도금 자가재 생산 계획(이달 편성 — 컬러 투입)' : g.salesSrc || '')}</td><td>${esc(g.dept)}</td></tr>`))
      + '<h3>용어</h3>' + defs([['기준선', `이달 1일 ~ ${md(D.cut)} 일별가동계획 편성 합 = 오늘까지 주문이 확정돼 있어야 할 양`], ['확정', '그 주 생산 실적 + 그 주에 만들 잔량 중 소재 매치'],
        ['등록 주문', '소재 매치 전 포함한 주문 잔량 + 실적'], ['주 배정', '잔량은 생산 예정일(없으면 납기 −7일 도금·−10일 컬러)의 주, 예정일이 지났으면 이번 주 · 지난 달 납기(지연 주문) 제외'],
        ['운영유형', 'A 배선·납기 역산(주문 받아 생산) · B 반복 사양 · C 재고 보충·캠페인(주문 없이 계획 생산)'],
        ['수출 선적', `이달 출항(도금 = 출항 기준 필요일, 컬러 = 배선지시 출항일) 계약의 진행 단계 · 도금 주문 ${esc(String((D.exportAt || {}).G || '').slice(5, 16))} · 컬러 = 컬러 주문진도(잔량) + 배선 자료`]]));
    return `<div class="ct-kpis sj-k4">${k1}${k2}${k3}${k4}</div>` + c2 + (c6 ? `<div class="sj-2c">${c1}${c6}</div>` : c1) + exportCard() + spec;   // 11/11 회의 '박스 줄이고 옆에 붙여라': 미수주 위험을 월 수주 누적 옆으로
  }

  function weekTable(W, wv, nextDl) {
    const rows1 = W.map((w) => { const pl_ = wv(w, 'plan'), mt = wv(w, 'mat'), rg = wv(w, 'ord'), gap = Math.max(0, pl_ - mt), r = pl_ ? mt / pl_ * 100 : null;
      const st = w.past ? ['지난 주 — 실적', 'na'] : w.state === '마감' ? (r != null && r < 95 ? ['마감 · 미달', 'bad'] : ['마감 · 충족', 'ok']) : w.state === '진행 중' ? [`수주 중 ${dday(w.deadline)}`, 'warn'] : ['마감 전', 'na'];
      const cur = nextDl && w.deadline === nextDl.deadline;
      return `<tr${cur ? ' class="cur"' : ''}><td>${md(w.deadline)}(수)</td><td class="nm">${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}</td><td><span class="ct-b ${st[1]}">${st[0]}</span></td><td class="r">${T(pl_)}</td><td class="r">${T(rg)}</td><td class="r"><b>${T(mt)}</b></td><td class="r"><b class="${gap > 0 && !w.past ? 'neg' : ''}">${T(gap)}</b></td><td class="r">${pct(r)}</td></tr>`; });
    return tbl(['주문 마감', '생산주(수~화)', '상태', ['편성', 'r'], ['등록 주문', 'r'], ['확정', 'r'], ['부족', 'r'], ['확정률', 'r']], rows1);
  }

  // 수출 선적(11/11 사용자 '도금만 있으면 컬러도 · 진행 상태를 더 직관적으로') — 도금·컬러 같은 5단계, 목적지별 쌓은 막대, 남은 곳 먼저
  function exportCard() {
    const lg = `<div class="sj-clg">${STG.map(([k, c]) => `<span><i style="background:${c};border-color:${c}"></i>${k}</span>`).join('')}</div>`;
    const blk = (p, nm, L) => {
      if (!inPl(p)) return '';
      if (!L || !L.length) return `<div class="sj-exb"><h3>${nm}</h3>${p === 'C' ? wait('컬러 배선 자료 — 다음 자동 실행부터') : UI.empty('이달 출항 주문 없음')}</div>`;
      const sum = (f) => L.reduce((a, x) => a + f(x), 0), tot = sum((x) => x.t), done = sum((x) => (x.st['생산 완료'] || 0)), ng = sum((x) => (x.st['소재 대기'] || 0) + (x.st['소재 없음'] || 0));
      const open = L.filter((x) => x.t - (x.st['생산 완료'] || 0) >= 1), fin = L.filter((x) => x.t - (x.st['생산 완료'] || 0) < 1);
      const sb = (x) => `<div class="sj-sb" title="${STG.filter(([k]) => x.st[k]).map(([k]) => `${k} ${n0(x.st[k])}t`).join(' · ')}">${STG.map(([k, c]) => x.st[k] ? `<i style="width:${x.st[k] / x.t * 100}%;background:${c}"></i>` : '').join('')}</div>`;
      const rw = (x) => { const rem = x.t - (x.st['생산 완료'] || 0), nx = rem >= 1 ? x.nextDue || x.firstDue : null, dd = CT.diff(nx, D.today), hot = dd != null && dd <= 7;
        return `<tr${hot ? ' class="hot"' : ''}><td class="nw" title="이달 첫 선적 ${md(x.firstDue)} · 계약 ${x.n || '-'}건">${nx ? `<b>${md(nx)}</b> <span class="${hot ? 'neg' : 'muted'}">${dday(nx)}</span>` : `<span class="muted">${md(x.firstDue)}</span>`}</td><td class="nm"><b>${esc(x.dst)}</b></td><td class="sbc">${sb(x)}</td><td class="r">${T(x.t)}</td><td class="r"><b class="${hot ? 'neg' : ''}">${rem >= 1 ? T(rem) : '–'}</b></td>`
          + `<td class="stl">${STG.slice(1).filter(([k]) => x.st[k]).map(([k, c]) => `<span class="sj-st" style="--c:${c}">${k} ${n0(x.st[k])}</span>`).join('') || '<span class="muted">완료</span>'}</td></tr>`; };
      const hd = [['다음 선적', '', '생산 안 끝난 계약 중 가장 이른 선적(도금 = 출항 기준 필요일 · 컬러 = 출항일)'], '목적지', '진행', ['이달 주문(t)', 'r'], ['남은(t)', 'r'], '남은 단계(t)'];
      return `<div class="sj-exb"><h3>${nm} <small>${L.length}곳 · ${T(tot)}t</small></h3>`
        + `<div class="sj-exk"><span>생산 완료 <b>${Math.round(done / tot * 100)}%</b> ${T(done)}t</span><span>남은 <b>${T(tot - done)}t</b></span><span>소재 대기·없음 <b class="${ng >= 1 ? 'neg' : ''}">${T(ng)}t</b></span></div>`
        + (open.length ? tbl(hd, open.map(rw), 'sj-ext') : UI.empty('모두 생산 완료'))
        + (fin.length ? `<details class="fold sj-dt in" data-k="ex${p}"${OP['ex' + p] ? ' open' : ''}><summary>생산 완료 ${fin.length}곳 · ${T(sum((x) => (x.t - (x.st['생산 완료'] || 0) < 1 ? x.t : 0)))}t</summary>${tbl(hd, fin.map(rw), 'sj-ext')}</details>` : '') + '</div>';
    };
    return card(5, '수출 선적 — 이달 출항 주문 진행', '목적지별 · 다음 선적 7일 안(지난 것 포함)인데 남은 물량 = 빨강', lg + `<div class="sj-exg">${blk('G', '도금수출', D.exportG || [])}${blk('C', '컬러수출', D.exportC)}</div>`);
  }

  /* ---------- 그래프(11/7 사용자 '없애지 말고 이쁘게') — 크기 작게, 숫자를 그래프 위에 직접 ---------- */
  const SV = (W, H, body, lab) => `<svg class="sj-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(lab)}">${body}</svg>`;
  const tx = (x, y, t, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}"${o.c ? ` style="fill:${o.c}"` : ''}${o.w ? ` font-weight="${o.w}"` : ''}${o.s ? ` font-size="${o.s}"` : ''}>${t}</text>`;
  const kfmt = (v) => n0(v);   // 11/10 서식: '35.0천' 과 '6,587' 이 한 그래프에 섞이던 것 → 모두 천 단위 쉼표
  // 일별 계획 vs 실적: 계획(연한 막대) · 실적(진한 막대 + 숫자) · 휴지(빗금) · 오늘
  function dayChart(l) {
    const R = D.daily[l] || [], W = CW(1), H = 210, L = 48, Rp = 10, Tp = 20, Bp = 24, n = R.length;
    const ymax = Math.max(1, ...R.map((r) => Math.max(r[1] || 0, r[2] || 0, r[3] || 0))) * 1.18, bw = (W - L - Rp) / n;
    const x = (i) => L + i * bw, y = (v) => Tp + (1 - v / ymax) * (H - Tp - Bp);
    let b = `<defs><pattern id="hz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--sub)"/></pattern></defs>`;
    b += [0, .5, 1].map((k) => `<line x1="${L}" x2="${W - Rp}" y1="${y(ymax / 1.18 * k)}" y2="${y(ymax / 1.18 * k)}" stroke="var(--grid, var(--line))"/>` + tx(L - 6, y(ymax / 1.18 * k) + 4, n0(ymax / 1.18 * k), { a: 'end' })).join('');
    R.forEach((r, i) => { const d = r[0], past = d <= D.asOf, pv = past ? r[1] : r[2], we = [0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay());
      if (!pv && !(past && r[3])) { b += `<rect x="${x(i) + 1}" y="${Tp}" width="${bw - 2}" height="${H - Tp - Bp}" fill="url(#hz)"><title>${md(d)} 휴지·정지</title></rect>`; }
      else b += `<rect x="${x(i) + bw * 0.12}" y="${y(pv || 0)}" width="${bw * 0.76}" height="${H - Bp - y(pv || 0)}" rx="2" fill="#d6e2f5"><title>${md(d)} 계획 ${n0(pv)}t</title></rect>`;
      if (past && r[3] != null) { const ok = !r[1] || r[3] >= r[1] * 0.95; b += `<rect x="${x(i) + bw * 0.28}" y="${y(r[3])}" width="${bw * 0.44}" height="${H - Bp - y(r[3])}" rx="2" fill="${ok ? '#2457c5' : '#c0392b'}"><title>${md(d)} 실적 ${n0(r[3])}t · 계획 ${n0(r[1])}t</title></rect>` + tx(x(i) + bw / 2, y(r[3]) - 4, n0(r[3]), { c: ok ? '#2457c5' : '#c0392b', w: 700, s: 12.5 }); }
      if (bw >= 20 || i % 2 === 0) b += tx(x(i) + bw / 2, H - 8, String(i + 1), we ? { c: 'var(--bad)' } : {}); });
    const ti = R.findIndex((r) => r[0] === D.today);
    if (ti >= 0) b += `<line x1="${x(ti)}" x2="${x(ti)}" y1="${Tp - 6}" y2="${H - Bp}" stroke="var(--bad)" stroke-dasharray="3 3"/>` + tx(x(ti) + 4, Tp - 8, `오늘 ${md(D.today)}`, { a: 'start', c: 'var(--bad)', w: 700 });
    return SV(W, H, b, l + ' 일별 계획 실적');
  }
  // 재고일수 추이: 그룹마다 작은 그래프(점 위 숫자 · 상한 점선 · 상태 색)
  // 일별 재고일수(11/7 사용자 '날짜가 중요 — 월말은 예측'): 실선 = 실제(어제까지) · 점선 = 전망 · 가로 점선 = 상한
  function dayStock(e, nm) {
    const x0 = D.stockDaily[e]; if (!x0 || !x0.rows.length) return '';
    const n5 = Math.max(1, Object.keys(D.stockDaily).filter((k) => inPl(k[0])).length), R = x0.rows, cap = x0.cap, W = Math.max(200, Math.floor((CW(1) - 12 * (n5 - 1)) / n5) - 18), H = 146, L = 28, Rp = 10, Tp = 18, Bt = 22, nd = D.nDays;
    const vs = R.map((r) => r[2]).concat(cap ? [cap] : []), lo = Math.max(0, Math.floor(Math.min(...vs) - 3)), hi = Math.ceil(Math.max(...vs) + 3);
    const x = (d) => L + (+d.slice(8) - 1) / (nd - 1) * (W - L - Rp), y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - Bt);
    const col = (v) => (!cap ? '#2457c5' : v <= cap ? '#1e7a46' : v <= cap + 5 ? '#b7791f' : '#c0392b');
    const A = R.filter((r) => r[3] === 'a'), F = R.filter((r) => r[3] === 'f'), la = A[A.length - 1], lf = F[F.length - 1];
    let b = [lo, Math.round((lo + hi) / 2), hi].map((v) => `<line x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid, var(--line))"/>` + tx(L - 4, y(v) + 4, v, { a: 'end', s: 12.5 })).join('');
    if (cap) b += `<line x1="${L}" x2="${W - Rp}" y1="${y(cap)}" y2="${y(cap)}" stroke="var(--ink-2)" stroke-dasharray="5 3"/>` + (() => { const dv = (hi - lo) * 17 / (H - Tp - Bt), k = 64 / ((W - L - Rp) / (nd - 1));   // 상한 이름 자리: 왼쪽·오른쪽 × 선 위·아래 중 실적·전망 선과 안 겹치는 곳(11/10 점검: 월말 전망 숫자·실적 선과 겹치던 것)
          const busy = (side, up) => R.some((r) => { const d = +r[0].slice(8); if (side === 'L' ? d > 1 + k : d < nd - k) return false; const v = r[2]; return up ? v >= cap - dv * 0.2 && v <= cap + dv * 1.6 : v <= cap + dv * 0.2 && v >= cap - dv * 1.4; })
            || (up ? y(cap) < Tp + 14 : y(cap) > H - Bt - 14);
          const c = [['L', true], ['L', false], ['R', false], ['R', true]].find(([sd, up]) => !busy(sd, up)) || ['L', true];
          return tx(c[0] === 'L' ? L + 4 : W - Rp - 14, c[1] ? y(cap) - 4 : y(cap) + 13, `상한 ${cap}일`, { a: c[0] === 'L' ? 'start' : 'end', s: 12.5 }); })();   // 11/10 점검: 상한 이름을 왼쪽에 — 오른쪽 끝 월말 전망 숫자와 겹치던 것
    if (A.length) b += `<polyline points="${A.map((r) => `${x(r[0])},${y(r[2])}`).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2.4"/>`;
    if (F.length) b += `<polyline points="${(la ? [la] : []).concat(F).map((r) => `${x(r[0])},${y(r[2])}`).join(' ')}" fill="none" stroke="#7d8aa0" stroke-width="1.8" stroke-dasharray="4 3"/>`;
    const td = D.today; if (td.slice(0, 7) === D.month) b += `<line x1="${x(td)}" x2="${x(td)}" y1="${Tp}" y2="${H - Bt}" stroke="var(--bad)" stroke-dasharray="2 3"/>`;
    if (la) b += `<circle cx="${x(la[0])}" cy="${y(la[2])}" r="4.5" fill="${col(la[2])}" stroke="#fff" stroke-width="1.5"/>` + tx(x(la[0]), y(la[2]) - 8, la[2], { c: col(la[2]), w: 800, s: 13.5 });
    if (lf) b += `<circle cx="${x(lf[0])}" cy="${y(lf[2])}" r="3.5" fill="#fff" stroke="${col(lf[2])}" stroke-width="2"/>` + tx(x(lf[0]) - 2, y(lf[2]) - 7, lf[2], { a: 'end', c: col(lf[2]), w: 700, s: 13.5 });
    b += [1, 10, 20, nd].map((d, i, A) => tx(L + (d - 1) / (nd - 1) * (W - L - Rp), H - 5, `${+D.month.slice(5)}/${d}`, { s: 12.5, a: i === A.length - 1 ? 'end' : i === 0 ? 'start' : 'middle' })).join('');
    const st = la ? (!cap ? null : la[2] <= cap ? '정상' : la[2] <= cap + 5 ? '주의' : '경고') : null;
    return `<div class="sj-mt"><div class="h"><b>${esc(nm)}</b>${B(st, la ? `${md(la[0])} ${la[2]}일` : '–')}</div>${SV(W, H, b, nm)}<div class="ft"><span>재고 ${la ? n0(la[1]) : '–'}t · 하루 판매 ${n0(x0.dem)}t</span><span>월말 전망 ${lf ? lf[2] + '일' : '–'}</span></div></div>`;
  }

  /* 월 수주 누적 — 생산주 누적 막대. 막대 높이 = 그 주 끝까지 편성 누계(있어야 할 주문), 진한 = 확정 누계, 연한 = 소재 매치 전 등록, 빨강 빗금 = 마감된 주인데 모자람, 회색 = 아직 마감 전 */
  function cumChart(W, wv, sales) {
    /* 11/12 사용자 '그래프 모양이 이게 최선이냐' — 겹친 틀·빗금 대신 생산주마다 막대 두 개를 나란히: 회색 = 있어야 할 주문(편성 누계) · 파랑 = 확정 누계(위 연한 부분 = 소재 매치 전 등록)
       확정이 편성보다 모자라면 파랑 숫자 빨강 · 위 % = 확정 ÷ 편성 누계 · 가로 점선 = 월 판매계획 */
    const n = W.length, Wd = CW(innerWidth > 1280 ? 0.58 : 1), H = 320, L = 64, R = 16, Tp = 62, Bt = 56;
    let cp = 0, cm = 0, co = 0;
    const P = W.map((w) => { cp += wv(w, 'plan'); cm += wv(w, 'mat'); co += Math.max(wv(w, 'ord'), wv(w, 'mat')); return { w, cp, cm, co }; });
    const ymax = Math.max(sales || 0, ...P.map((p) => Math.max(p.cp, p.co)), 1) * 1.12, y = (v) => Tp + (1 - v / ymax) * (H - Tp - Bt), h = (v) => Math.max(0, H - Bt - y(v));
    const bw = (Wd - L - R) / n, gw = Math.min(46, bw * 0.3), gap = 6;
    let b = [0, 0.5, 1].map((k) => { const v = ymax / 1.12 * k; return `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>` + tx(L - 8, y(v) + 5, n0(v), { a: 'end' }); }).join('');
    if (sales) b += `<line x1="${L}" x2="${Wd - R}" y1="${y(sales)}" y2="${y(sales)}" stroke="var(--ink-2)" stroke-dasharray="6 4"/>` + tx(L + 6, y(sales) - 7, `월 판매계획 ${n0(sales)}t`, { a: 'start', w: 700, c: 'var(--ink-2)' });
    P.forEach((p, i) => { const { w } = p, cx = L + i * bw + bw / 2, x1 = cx - gw - gap / 2, x2 = cx + gap / 2;
      const mt = p.cm, reg = Math.max(0, p.co - p.cm), r = p.cp ? p.cm / p.cp * 100 : null, short = p.cp - p.cm >= 1, past = w.past;
      b += `<rect x="${x1}" y="${y(p.cp)}" width="${gw}" height="${h(p.cp)}" fill="${past ? '#d5dbe4' : '#c3cad5'}" rx="3"><title>${md(w.wFrom)}~ 있어야 할 주문(편성 누계) ${n0(p.cp)}t</title></rect>`;
      b += tx(x1 + gw / 2, y(p.cp) - 6, n0(p.cp), { c: 'var(--ink-2)', s: 13 });
      b += `<rect x="${x2}" y="${y(mt)}" width="${gw}" height="${h(mt)}" fill="${past ? '#6f8fc4' : '#2457c5'}" rx="3"><title>확정 누계(소재 매치) ${n0(p.cm)}t</title></rect>`;
      if (reg >= 1) b += `<rect x="${x2}" y="${y(mt + reg)}" width="${gw}" height="${h(mt + reg) - h(mt)}" fill="#b9cdee" rx="3"><title>소재 매치 전 등록 ${n0(reg)}t</title></rect>`;
      const top = Math.min(y(p.cp), y(mt + reg));
      b += tx(x2 + gw / 2, y(mt + reg) - 6, n0(p.cm), { w: 800, c: short && !past ? 'var(--bad)' : 'var(--ink)', s: 14 });
      if (r != null) b += tx(cx, top - 24, `${Math.round(r)}%`, { w: 800, s: 14, c: Math.round(r) >= 100 ? 'var(--good)' : r >= 90 ? 'var(--warn)' : 'var(--bad)' });
      b += tx(cx, H - Bt + 20, `${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}`, { w: 700, c: 'var(--ink)' });
      const lab = past ? '지난 주(실적)' : w.state === '마감' ? `확정 · 마감 ${md(w.deadline)}` : w.state === '진행 중' ? `수주 중 · 마감 ${md(w.deadline)}` : `마감 전 · ${md(w.deadline)}`;
      b += tx(cx, H - Bt + 40, lab, { c: w.state === '진행 중' ? '#b45309' : 'var(--ink-2)', w: w.state === '진행 중' ? 700 : 500 });
    });
    const lg = `<div class="sj-clg"><span><i style="background:#c3cad5;border-color:#c3cad5"></i>있어야 할 주문(편성 누계)</span><span><i style="background:#2457c5;border-color:#2457c5"></i>확정 누계(소재 매치)</span><span><i style="background:#b9cdee;border-color:#b9cdee"></i>소재 매치 전 등록</span><span>% = 확정 ÷ 있어야 할 주문 · 빨간 숫자 = 모자람</span></div>`;
    return lg + `<div class="sj-cum">${SV(Wd, H, b, '월 수주 누적')}</div>`;
  }

  /* ---------- ③ 생산 ---------- */
  const LSPEC = { '1CCL': 'PVS 등', '2CCL': '건재', '3CCL': 'STS·POR·PLY', '4CCL': 'PPG·PPH·Al', '1CGL': 'AZ·AL', '2CGL': 'AL·MAC' };
  const GCOL = { 건재수출: '#2457c5', 가전수출: '#0e8a8a', 가전내수: '#7c3aed', 수요개발: '#b45309', 주문재: '#be185d', 계획재: '#64748b', 도금수출: '#1e7a46', 도금국내: '#c2410c', 자동차: '#0369a1', 자가재: '#a16207' };
  const achSt = (r) => (r == null ? null : r >= 95 && r <= 105 ? '정상' : r >= 90 && r <= 110 ? '주의' : '경고');
  function prod() {
    const L = D.lines.filter((l) => inPl(l.pl));
    const lr = (l) => { const R = D.daily[l.line] || [], fut = R.filter((r) => r[0] > D.asOf);
      const p0c = l.sched || 0, ac = l.actual || 0, m0 = l.month || 0, rem = Math.max(0, m0 - ac), wd = fut.filter((r) => r[2] > 0).length;
      const need = wd ? rem / wd : null, plan = wd ? fut.reduce((a, r) => a + (r[2] || 0), 0) / wd : null, r = p0c ? ac / p0c * 100 : null;
      return { l, p0c, ac, m0, rem, wd, need, plan, r, st: achSt(r), risk: need && plan && need > plan * 1.05 }; };
    const X = L.map(lr);
    // 결론: 공장별 달성률 + 월 계획 미달 위험 라인
    const pk = (p) => { const Y = X.filter((x) => x.l.pl === p), s = Y.reduce((a, x) => a + x.p0c, 0), a = Y.reduce((q, x) => q + x.ac, 0), r = s ? a / s * 100 : null, st = achSt(r);
      return kpi(`${PN(p)} 달성률 ${r > 105 ? BA(st, r) : B(st)}`, r > 105 ? 'warn' : toneOf(st), `${r == null ? '–' : r.toFixed(1)}<small>%</small>`, `실적 ${T(a)} / 일정 누계 ${T(s)}t<br>${Y.filter((x) => x.st && x.st !== '정상').map((x) => `${x.l.line} ${pct(x.r)}`).join(' · ') || '라인 모두 95~105%'}`); };
    const rk = X.filter((x) => x.risk);
    const k3 = kpi('월 계획 미달 위험', rk.length ? 'bad' : 'ok', `${rk.length}<small>개 라인</small>`, rk.map((x) => `<b>${x.l.line}</b> 하루 ${T(x.need)}t 필요(계획 ${T(x.plan)}t)`).join('<br>') || '남은 날 계획대로면 월 계획 달성');
    const tg = (D.thrG || []).filter(() => inPl('G')), slow = tg.concat(D.thr.filter(() => inPl('C'))).filter((x) => x.dev != null && x.dev <= -10);
    const k4 = kpi('속도 10% 넘게 느림', slow.length ? 'warn' : 'ok', `${slow.length}<small>개 품목</small>`, slow.slice(0, 3).map((x) => `${x.line} ${esc(x.pdt)} ${x.dev}%`).join('<br>') || '실적 t/hr 기준 대비 정상');
    const kp = `<div class="ct-kpis sj-k4">${['G', 'C'].filter(inPl).map(pk).join('')}${k3}</div>`;   // 11/11 회의: t/hr 기준 대비(속도 느림) 카드 삭제 — 기준은 휴지 포함·실적은 순작업시간이라 비교 의미 없음
    // 라인별 가동(공장 묶음) — 예전 라인 카드 + 누계 표를 한 표로(같은 숫자 두 번 → 한 번)
    const rw = (x) => { const l = x.l, mx = Math.max(x.m0, x.ac, 1);
      return `<tr><td class="nm"><b>${esc(l.line)}</b> <span class="muted">${esc(LSPEC[l.line] || '')}</span></td><td class="sj-cb"><div class="tr"><i class="s" style="width:100%"></i><i class="o" style="width:${Math.min(100, x.ac / mx * 100)}%;background:${stCol(x.st, isOver(x.st, x.r))}"></i><u style="left:${x.p0c / mx * 100}%"></u></div></td>`
        + `<td class="r">${T(x.p0c)}</td><td class="r"><b>${T(x.ac)}</b></td><td class="r"><b class="${x.ac - x.p0c < 0 ? 'neg' : ''}">${x.ac - x.p0c >= 0 ? '+' : ''}${T(x.ac - x.p0c)}</b></td><td>${x.m0 ? BA(x.st, x.r, pct(x.r)) : '<span class="ct-b na">휴지</span>'}</td>`
        + `<td class="r">${T(x.m0)}</td><td class="r">${T(x.rem)}</td><td class="r">${x.wd}</td><td class="r"><b class="${x.risk ? 'neg' : ''}">${T(x.need)}</b></td><td class="r">${T(x.plan)}</td>`
        + `<td class="r">${l.run == null ? '–' : l.run + '%'}</td><td class="nx">${l.next ? `${md(l.next[0])} ${esc(String(l.next[1]).replace(/M\/C\((.*)\)/, '$1'))}` : '–'}</td></tr>`; };
    const secR = (t, n) => `<tr class="sj-sec"><td colspan="${n}">${t}</td></tr>`;
    let lb = '';
    for (const p of ['G', 'C']) { const Y = X.filter((x) => x.l.pl === p); if (Y.length) lb += secR(`${PN(p)}공장`, 13) + Y.map(rw).join(''); }
    const c1 = card(1, '라인별 가동 — 누계와 남은 기간', `판생속보 월 계획·일정 누계 대비 · 실적 ~${md(D.asOf)}`,
      `<div class="sj-clg"><span><i style="background:var(--good)"></i>실적 누계(월 계획 대비 길이)</span><span><i class="bl"></i>오늘까지 일정 누계</span><span>필요 일평균 빨강 = 남은 날 계획대로 해도 월 계획 미달</span></div>`
      + `<div class="ct-wrap"><table class="ct-t sj-cbt sj-ln"><thead><tr><th>라인</th><th>진행</th><th class="r">일정 누계</th><th class="r">실적 누계</th><th class="r">차이</th><th>달성률</th><th class="r">월 계획</th><th class="r">남은 양</th><th class="r" title="현재 계획에서 생산이 잡힌 날">남은 가동일</th><th class="r">필요 일평균</th><th class="r" title="현재 통합 계획의 남은 날 평균">계획 일평균</th><th class="r" title="판생속보 작업률 누계(작업 시간 ÷ 달력 시간)">작업률</th><th>다음 정지</th></tr></thead><tbody>${lb}</tbody></table></div>`, '', true);
    const ls = L.map((l) => l.line), sel = ls.includes(lineSel) ? lineSel : ls[0];
    const cd = card(3, `일별 계획 vs 실적 — ${sel}`, '연한 막대 = 계획 · 진한 막대 = 실적(파랑 95%↑ · 빨강 미만) · 빗금 = 휴지', `<div class="seg ct-seg">${ls.map((l) => `<button type="button" data-line="${l}" aria-pressed="${l === sel}">${l}</button>`).join('')}</div>` + dayChart(sel));
    // 1주 작업 편성(11/11 사용자 '더 직관적으로 구분 잘 되게') — 공장 → 라인 줄, 날짜 칸, 그룹 = 색, 품명·강종 굵게
    const R = D.woWeek.rows.filter((r) => inPl(/CCL/.test(r[1]) ? 'C' : 'G')), days = Array.from({ length: 7 }, (_, i) => CT.addD(D.woWeek.from, i));
    const gUsed = [...new Set(R.map((r) => r[2]))], GN = Object.fromEntries(D.groups.map((g) => [g.key, g.name]));
    const wl = (l) => { const Rl = R.filter((r) => r[1] === l), tot = Rl.reduce((a, r) => a + r[4], 0);
      return `<tr><td class="lab"><b>${l}</b><span>${T(tot)}t</span></td>${days.map((d) => { const C = Rl.filter((r) => r[0] === d), dt = C.reduce((a, r) => a + r[4], 0);
        return `<td>${C.length ? `<div class="dt">${T(dt)}t</div>` + C.map((r) => `<span class="wo" style="--c:${GCOL[r[2]] || '#64748b'}" title="${esc(GN[r[2]] || r[2])} · ${esc(r[3])} ${n0(r[4])}t"><b>${esc(r[3])}</b><span>${n0(r[4])}</span></span>`).join('') : '<span class="muted">–</span>'}</td>`; }).join('')}</tr>`; };
    let wb = '';
    for (const [p, Ls] of [['G', ['1CGL', '2CGL']], ['C', ['1CCL', '2CCL', '3CCL', '4CCL']]]) if (inPl(p)) wb += `<tr class="sj-sec"><td colspan="8">${PN(p)}공장</td></tr>` + Ls.map(wl).join('');
    const c3 = card(3, `1주 작업 편성 — 생산주 ${md(D.woWeek.from)}~${md(D.woWeek.to)}`, '색 = 판매그룹 · 굵은 글씨 = 품명(컬러)·강종(도금) · 20t 이상',
      R.length ? `<div class="sj-clg">${gUsed.map((g) => `<span><i style="background:${GCOL[g] || '#64748b'};border-color:${GCOL[g] || '#64748b'}"></i>${esc(GN[g] || g)}</span>`).join('')}</div>`
        + `<div class="ct-wrap"><table class="ct-t sj-wo"><thead><tr><th class="lab">라인</th>${days.map((d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return `<th class="${w === 0 || w === 6 ? 'we' : ''}">${md(d)}(${'일월화수목금토'[w]})</th>`; }).join('')}</tr></thead><tbody>${wb}</tbody></table></div>` : wait('다음 주 계획 품목 없음'));
    // T/hr(11/11 사용자 '도금도 넣고 도금/컬러 구분') — 도금 = 라인 × 강종(속도표 기준), 컬러 = 라인 × 품명(단위생산량 기준)
    const dv = (x) => (x.dev == null ? '–' : `<b class="${x.dev >= 5 ? 'pos' : x.dev <= -10 ? 'neg' : x.dev <= -5 ? 'wrn' : ''}">${x.dev > 0 ? '+' : ''}${x.dev}%</b>`);
    const tr = (x) => `<tr><td><b>${esc(x.line)}</b></td><td class="nm"><b>${esc(x.pdt)}</b></td><td class="r">${x.thk}</td><td class="r">${n0(x.t)}</td><td class="r"><b>${x.tph}</b></td><td class="r">${x.std ?? '–'}</td><td class="r">${dv(x)}</td></tr>`;
    let tb = '';
    if (inPl('G')) tb += `<tr class="sj-sec"><td colspan="7">도금 — 라인 × 강종 · 실적 ${md(D.month + '-01')}~${md(D.asOf)}</td></tr>` + ((D.thrG || []).map(tr).join('') || '<tr><td colspan="7" class="muted">도금 코일 실적 없음</td></tr>');
    if (inPl('C')) tb += `<tr class="sj-sec"><td colspan="7">컬러 — 라인 × 주요 품명 · 실적 ${md(D.thrFrom)}~${md(D.asOf)}</td></tr>` + (D.thr.map(tr).join('') || '<tr><td colspan="7" class="muted">컬러 실적 없음</td></tr>');
    const c4 = card(4, 't/hr 실적 vs 기준', '편차 초록 = 5% 이상 빠름 · 노랑 5~10% 느림 · 빨강 10% 넘게 느림',
      `<div class="ct-wrap"><table class="ct-t sj-thr"><thead><tr><th>라인</th><th>강종·품명</th><th class="r">평균 두께(mm)</th><th class="r">생산(t)</th><th class="r">실적 t/hr</th><th class="r">기준 t/hr</th><th class="r">편차</th></tr></thead><tbody>${tb}</tbody></table></div>`);
    const spec = fold('fp', '<h3>라인 사양</h3>' + tbl(['라인', '공장', '주력 품목', ['월 계획(t)', 'r'], ['작업률', 'r']], L.map((l) => `<tr><td><b>${l.line}</b></td><td>${PN(l.pl)}</td><td>${esc(LSPEC[l.line] || '')}</td><td class="r">${T(l.month)}</td><td class="r">${l.run == null ? '–' : l.run + '%'}</td></tr>`))
      + '<h3>기준</h3>' + defs([['달성률', '실적 ÷ 판생속보 일정 누계 · 95~105% 정상 · 90~110% 주의 · 그 밖 경고(초과는 주황)'], ['실적', L.some((l) => l.src === 'MES') ? 'MES 코일' : '판생속보'],
        ['계획 일평균', '현재 통합 계획의 남은 날 평균 · 남은 가동일 = 생산이 잡힌 날'], ['작업 편성', '현재 계획의 다음 생산주 품목(그룹·품명별 20t 이상)'],
        ['도금 기준 t/hr', `도금 속도표(${esc(D.thrGStd || '')} 코일 실적, 라인·강종·두께대·폭대) — 이달 만든 코일을 그 표 속도로 만들었을 때 시간으로 나눈 값(두께·폭 구성 차이 제거)`],
        ['컬러 기준 t/hr', "컬러 품목별 단위생산량('25.8~'26.7 실적, 품명·라인 평균) · 두께×폭이 섞여 참고만"]]));
    const c3l = `<p class="sj-foot">다음 생산주 작업 편성은 <a href="ct_plan.html">생산 일정</a> · <a href="week_seq.html">작업 순서</a>에서</p>`;   // 11/11 회의: 1주 작업 편성·t/hr 실적 vs 기준 삭제(생산 일정과 중복 · 톤파워 비교 의미 없음)
    return kp + c1 + cd + c3l + spec;
  }

  /* ---------- ④ 소재(11/11 사용자 '뭐부터 봐야 하는지') — 첫 줄 = 부족·지연 결론, 그다음 도금 소재 / 컬러 소재 ---------- */
  function mat() {
    const M = D.mats.filter((x) => inPl(x.plant)).slice().sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    const mw = M.filter((x) => x.st === '경고' || x.st === '주의');
    const LT = UI.matLate(D.matLate);                       // 발주 마감 지남 = 공통 기준(ui/shell.js UI.matLate)
    const N = D.matNear.filter((x) => inPl(x.plant)), S = D.matShort.filter((x) => (x.gap || 0) > 0), SL = S.reduce((a, x) => a + (x.late >= 1 ? x.late : 0), 0);
    const k1 = kpi(`결품 위험 소재 ${B(mw.some((x) => x.st === '경고') ? '경고' : mw.length ? '주의' : '정상')}`, mw.some((x) => x.st === '경고') ? 'bad' : mw.length ? 'warn' : 'ok', `${mw.length}<small>종</small>`,
      mw.map((x) => `<b>${esc(x.name)}</b>(${PN(x.plant)}) 월말 ${x.days}일분 · ${T(x.end)}t`).join('<br>') || '모든 소재 월말 7일분 이상', '예상 월말 재고 7일분 미만 주의 · 5일분 미만 경고');
    const k2 = kpi('발주 마감 지난 부족', LT && LT.t >= 1 ? 'bad' : 'ok', `${LT ? T(LT.t) : '–'}<small>t</small>`, LT ? (LT.items || []).slice(0, 3).map((i) => esc(typeof i === 'string' ? i : `${i.name || i.key || ''} ${n0(i.t || 0)}t`)).join(' · ') || '없음' : '자료 대기', LT ? LT.tip : '');
    const k3 = kpi('2주 안 발주', N.some((x) => x.orderNow) ? 'warn' : '', `${N.length}<small>건</small>`, N.slice(0, 3).map((x) => `${esc(x.mat)} ${md(x.deadline)} ${T(x.t)}t`).join('<br>') || '없음');
    const di = M.reduce((a, x) => a + (x.dueIn || 0), 0);
    const k4 = kpi('남은 달 입고 예정', '', `${T(di)}<small>t</small>`, `MES 미입고 발주 · ${md(D.asOf)} 다음 날 ~ 월말`);
    // 소재 그룹별 표
    const row = (x) => `<tr><td class="c">${B(x.st)}</td><td class="nm"><b>${esc(x.name)}</b><div class="tags">${x.cls.map((c) => `<span class="sj-tag">${esc(c)}</span>`).join('')}</div></td>`
      + `<td class="dcol"><div class="sj-dv"><b class="${x.st === '경고' ? 'neg' : x.st === '주의' ? 'wrn' : ''}">${x.days == null ? '–' : x.days >= 100 ? '99+' : x.days}<small>일</small></b>${bar(Math.min(x.days || 0, 30), 30, stCol(x.st), 7)}</div></td>`
      + `<td class="r">${T(x.stock)}</td><td class="r">${T(x.use)}</td><td class="r">${T(x.recv)}</td><td class="r">${T(x.dueIn)}</td><td class="r"><b>${T(x.end)}</b></td><td class="r">${x.lt == null ? '<span class="muted">자사</span>' : x.lt + '일'}</td></tr>`;
    const hd = `<thead><tr><th class="c">상태</th><th>소재 · 발주구분</th><th title="예상 월말 재고 ÷ 하루 평균 소요 · 검은 선 = 7일">월말 재고일수</th><th class="r" title="MES 소재재고(${md(D.asOf)} 마감)">재고</th><th class="r">월 소요</th><th class="r">이달 입고</th><th class="r" title="MES 미입고 발주 중 이달 남은 날">입고 예정</th><th class="r">예상 월말</th><th class="r">리드타임</th></tr></thead>`;
    const grp = (p) => { const Y = M.filter((x) => x.plant === p); if (!inPl(p) || !Y.length) return '';
      const sh = p === 'C' && S.length ? `<details class="fold sj-dt in" data-k="msh"${OP.msh || SL >= 1 ? ' open' : ''}><summary>규격별 부족 — 컬러건재 계획재 규격 ${S.length}건${SL >= 1 ? ` · 마감 지남 ${T(SL)}t` : ''}</summary>`
        + tbl(['소재', '두께×폭', ['필요', 'r'], ['3달 발주 필요', 'r'], ['마감 지난 부족', 'r'], '판정', '첫 부족일', '발주일', '입고 예상'], S.map((x) => `<tr title="${esc(String(x.why || '').replace(/\b(\d{2})-(\d{2})\b/g, (m, a, b) => `${+a}/${+b}`))}"><td class="nm">${esc(x.mat)}</td><td class="nw">${esc(x.size)}</td><td class="r">${T(x.need)}</td><td class="r">${T(x.gap)}</td><td class="r">${x.late >= 1 ? `<b class="neg">${T(x.late)}</b>` : '–'}</td><td>${x.late >= 1 ? '<span class="ct-b bad">마감 지남</span>' : '<span class="ct-b warn">발주</span>'}</td><td>${md(x.first)}</td><td>${[...new Set(x.order || [])].map(md).join('~')}</td><td>${md(x.arrive)}</td></tr>`)) + '</details>' : '';
      // 11/11 회의 '컬러 소재는 자가재가 나와야지': 도금 자가재(AZ·MAC·AL — 도금이 만들어 컬러에 넣는 소재) 한 줄 — 재고 = 지금 자가재 실재고, 월 소요 = 이달 컬러 투입 필요, 이달 입고 = 이달 도금 자가재 생산, 예상 월말 = 그룹 관제 매트릭스와 같은 값
      const sg = p === 'C' ? D.groups.find((g) => g.key === '자가재') : null, sw_ = (D.kpi && D.kpi.whG) || {};
      const sb_ = (D.bridge || []).find((x) => x.eng === 'G자가재') || {};   // 재고 탭과 같은 값: 지금 재고 + 남은 도금 생산 − 남은 컬러 투입 = 예상 월말
      const sr = sg ? row({ st: sg.stockSt, name: '도금 자가재(AZ·MAC·AL)', cls: ['자사 도금 생산 · 월 소요 = 남은 컬러 투입 · 입고 예정 = 남은 도금 생산'], days: sg.endDays, stock: sb_.begin ?? sw_.self, use: sb_.sales, recv: sg.actCum, dueIn: sb_.prod, end: sb_.end ?? sg.end, lt: null }) : '';
      const bd = Y.filter((x) => x.st && x.st !== '정상').length;
      return card(p === 'G' ? 1 : 2, `${PN(p)} 소재`, `${Y.length}종${bd ? ` · 위험 ${bd}` : ' · 모두 7일분 이상'} · 재고일수 낮은 순`, `<div class="ct-wrap"><table class="ct-t sj-mt2">${hd}<tbody>${sr}${Y.map(row).join('')}</tbody></table></div>` + sh); };
    const c3 = card(3, '2주 안 발주 대상', '발주일 가까운 순 · 소재 발주 화면과 같은 발주일', N.length ? tbl(['소재', '공급사', '발주일', ['이번 발주량', 'r'], '상태'], N.map((x) => `<tr><td class="nm" title="${PN(x.plant)} · 부족 시작 ${md(x.first)} · 3달 발주 필요 ${T(x.short)}t"><b>${esc(x.mat)}</b></td><td>${esc(x.sup)}</td><td class="nw" title="${esc(x.rule || '')}"><b>${md(x.deadline)}</b> ${dday(x.deadline)}</td><td class="r"><b>${T(x.t)}</b></td><td><span class="ct-b ${x.orderNow ? 'bad' : 'warn'}">${x.orderNow ? '발주 기간' : '대기'}</span></td></tr>`)) + '<p class="sj-foot"><a href="procure.html">→ 소재 발주 화면</a></p>' : UI.empty('2주 안 발주일 없음'));
    const V = evMap('val'), val = (k) => (V[k] || {}).val || '';
    const c4 = card(4, '포스코 Room vs 대상량', '수주팀 입력 · 대상량 > Room 이면 경고', `<div class="sj-kv"><span>다음 달 Room(톤)</span><input class="sj-in" data-val="room" value="${esc(val('room'))}" placeholder="입력" size="8"></div><div class="sj-kv"><span>수주집 선정 대상량(톤)</span><input class="sj-in" data-val="roomTarget" value="${esc(val('roomTarget'))}" placeholder="입력" size="8"></div>`
      + (val('room') && val('roomTarget') ? `<p><b class="${+val('roomTarget') > +val('room') ? 'neg' : 'pos'}">${+val('roomTarget') > +val('room') ? '초과 +' + n0(val('roomTarget') - val('room')) + '톤 → 마케팅 협의 필요' : '여유 ' + n0(val('room') - val('roomTarget')) + '톤'}</b></p>` : ''));
    const lg = D.cfg.matClasses.filter((c) => c.lt >= 60);
    const c5 = card(5, '장납기 월차 발주량 전달', '매월 10~15일 · 15일까지 미작성 시 경고', tbl(['발주구분', ['수량(톤)', 'r'], '상태'], lg.map((c) => `<tr><td class="nm">${esc(c.key)}</td><td class="r"><input class="sj-in" data-val="${esc('lg|' + c.key)}" value="${esc(val('lg|' + c.key))}" size="7" placeholder="톤"></td><td>${val('lg|' + c.key) ? '<span class="ct-b ok">작성</span>' : +D.today.slice(8) > 15 ? '<span class="ct-b bad">미작성</span>' : '<span class="ct-b warn">대기</span>'}</td></tr>`)));
    const spec = fold('fm', '<h3>소재 리드타임 — 발주구분별</h3>' + tbl(['발주구분', '용도', ['리드타임(일)', 'r']], D.cfg.matClasses.map((c) => `<tr><td class="nm"><b>${esc(c.key)}</b></td><td>${esc(c.use)}</td><td class="r">${c.lt}</td></tr>`))
      + '<h3>소재 코드별(위 표 리드타임 = 발주 화면과 같은 값)</h3>' + tbl(['소재', '공장', '포함 발주구분', ['리드타임(일)', 'r']], D.mats.map((x) => `<tr><td class="nm">${esc(x.name)}</td><td>${PN(x.plant)}</td><td>${x.cls.map((c) => `<span class="sj-tag">${esc(c)}</span>`).join('')}</td><td class="r">${x.lt}</td></tr>`))
      + '<h3>산식</h3>' + defs([['예상 월말', `재고(MES ${md(D.asOf)} 마감) + 입고 예정(MES 미입고 발주) − 남은 날 계획 소요 · 미발주 물량 제외`], ['월 소요', '컬러 = 컬러 계획 × 품명별 소재 비중(자가재 몫 제외) · 도금 F/H = 계획 사용 · 도금용 SUS = AL-STS 도금 계획'],
        ['재고', 'MES 소재 코드 합 — 창고(판생속보 분류)와 수백~천 t 다름 · 도금 F/H 만 판생속보 실재고'], ['판정', '월말 7일분 이상 정상 · 5~7일 주의 · 5일 미만 경고'],
        ['이달 소요 없어 제외', (D.matsNoUse || []).join(' · ') || '없음']]));
    return `<div class="ct-kpis sj-k4">${k1}${k2}${k3}${k4}</div>` + grp('G') + grp('C') + `<div class="sj-g2">${c3}<div>${c4}${c5}</div></div>` + spec;
  }

  /* ---------- ⑤ 재고 ---------- */
  const stSt = (x) => (x.safety && x.end < x.safety ? '부족' : x.endDays == null || !x.cap ? null : x.endDays <= x.cap ? '정상' : x.endDays <= x.cap + 5 ? '주의' : '경고');
  function stock() {
    const Bk = D.bridge.filter((x) => inPl(x.eng[0])).map((x) => Object.assign({}, x, { st: stSt(x) }));
    const lo = Bk.filter((x) => x.st === '부족'), hi = Bk.filter((x) => x.st === '경고' || x.st === '주의');
    const k1 = kpi('안전재고 밑', lo.length ? 'bad' : 'ok', `${lo.length}<small>개 그룹</small>`, lo.map((x) => `<b>${esc(x.name)}</b> ${T(x.end)} / 안전 ${T(x.safety)}t`).join('<br>') || '없음');
    const k2 = kpi('상한 초과', hi.some((x) => x.st === '경고') ? 'bad' : hi.length ? 'warn' : 'ok', `${hi.length}<small>개 그룹</small>`, hi.map((x) => `<b>${esc(x.name.replace(/\(.*\)/, ''))}</b> ${x.endDays} / ${x.cap}일`).join('<br>') || '없음');
    const whk = ['G', 'C'].filter(inPl).map((p) => { const w = D.wh[p], r = w.cur / w.cap * 100;
      return kpi(`${PN(p)} 창고`, r > 100 ? 'bad' : r > 90 ? 'warn' : 'ok', `${Math.round(r)}<small>%</small>`, `${T(w.cur)} / 상한 ${T(w.cap)}t<br>${w.parts.map((q) => `${esc(q[0])} ${T(q[1])}`).join(' · ')}`); }).join('');
    const rows = Bk.map((x) => { const w = x.cap ? Math.min(100, (x.endDays || 0) / (x.cap * 1.6) * 100) : 0;
      return `<tr><td class="c">${B(x.st)}</td><td class="nm"><b>${esc(x.name)}</b></td><td class="r">${T(x.begin)}</td><td class="r">+${T(x.prod)}</td><td class="r" title="판매계획 ${T(x.salesM)}t − ${md(D.month + '-01')}~${md(D.asOf)} 출고 ${T(x.shipped)}t(재고 변화로 계산 · MES 출하 ${T(x.shipMes)}t)">−${T(x.sales)}</td><td class="r"><b>${T(x.end)}</b></td><td class="r">${T(x.safety)}</td><td style="min-width:170px"><div class="sj-bar"><i style="width:${w}%;background:${stCol(x.st)}"></i>${x.cap ? `<u style="left:${100 / 1.6}%"></u>` : ''}</div><small class="nw">${x.endDays ?? '–'} / ${x.cap ?? '–'}일</small></td></tr>`; });
    const c1 = card(1, `그룹별 재고 — ${+D.month.slice(5)}월말 예상`, '막대 = 예상 월말 재고일수 · 검은 선 = 상한', tbl(['상태', '그룹', [`${md(D.asOf)} 실재고`, 'r'], ['+ 남은 생산', 'r'], ['− 남은 판매', 'r'], ['= 예상 월말', 'r'], ['안전재고', 'r'], '재고일수 / 상한'], rows));
    const NM2 = { G수출: '도금수출', G국내: '도금국내', G자동차: '자동차', G자가재: '도금 자가재', C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' };
    const ks = Object.keys(D.stockDaily || {}).filter((k) => inPl(k[0])).sort((a, b) => (a[0] === b[0] ? 0 : a[0] === 'G' ? -1 : 1));   // 11/11 회의: 도금 먼저
    const cm = card(2, '일별 재고일수', `실선 = 실제(~${md(D.asOf)}) · 점선 = 전망 · 가로 점선 = 상한`, `<div class="sj-mts" style="grid-template-columns:repeat(${Math.max(1, ks.length)},minmax(0,1fr))">${ks.map((k) => dayStock(k, NM2[k] || k)).join('')}</div>`);
    const r = D.r15, cnt = r.cnt || {};
    const c4 = card(4, '계획재 사양 상태', `R15 ${r.n || '-'}개 사양 · 실재고 ${T(r.stock)} / 목표 ${T(r.target)}t (${r.target ? Math.round(r.stock / r.target * 100) : '-'}%)`,
      `<div class="ct-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin:0">${[['정상 생산', cnt.ok], ['목표 초과', cnt.over], ['생산 뒤처짐', cnt.behind], ['부족·결품 우려', cnt.short]].map(([k, v], i) => `<div class="ct-kpi ${v ? ['ok', 'warn', 'warn', 'bad'][i] : ''}"><div class="l">${k}</div><div class="v">${v ?? 0}<small>개</small></div></div>`).join('')}</div><p class="sj-foot"><a href="planstock.html">→ 계획재 화면</a></p>`);
    const spec = fold('fs', '<h3>목표 재고 기준</h3>' + tbl(['그룹', '운영유형', ['안전재고(t)', 'r'], ['목표 재고(t)', 'r'], ['상한(일)', 'r']], Bk.map((x) => `<tr><td class="nm"><b>${esc(x.name)}</b></td><td><span class="sj-tag">${esc(x.type)}</span></td><td class="r">${T(x.safety)}</td><td class="r">${T(x.target)}</td><td class="r">${x.cap ?? '–'}</td></tr>`))
      + '<h3>판정·산식</h3>' + defs([['상태', '예상 월말 < 안전재고 = 부족 · 재고일수 ≤ 상한 정상 · 상한 +5일까지 주의 · 그 위 경고'], ['재고일수', '예상 월말 재고 ÷ 이달 판매계획 하루 평균'],
        ['실재고', '판생속보 그룹 재고(장기재고 포함 — 컬러건재 일수가 높게 보임)'], ['남은 생산', '통합 계획 일별 편성(엔진 월 물량과 다를 수 있음)'],
        ['남은 판매', '판매계획 − 이달 출고(월초 실재고 + 생산 − 오늘 실재고) · MES 출하는 선적일 기준이라 도금수출이 크게 작음(마우스)'],
        ['상한(일)', '계획 규칙 TF 목표 일수 — 컬러수출 = 건재·가전수출 값, 컬러건재 = 주문재 값, 자동차 = AL-STS 값'], ['창고 상한', `'27 판생 월말 최대(계획 규칙) — 컬러 ${kt(D.wh.C.cap)} · 도금 ${kt(D.wh.G.cap)} · 도금 자가재 제외`],
        ['일별 그래프', '출고 = 남은 판매를 엔진 선적·납기일 모양대로 · 도금국내·자동차는 남은 날 균등 · 자가재·수요개발은 일별 자료 없음'],
        ['그룹 단위', '엔진 7개 그룹 — 컬러수출 3그룹·컬러건재 주문재/계획재는 합쳐 계산'], ['출하 예정 없는 재고', '재고↔출하오더 연결 조회 추가 후 표시']]));
    return `<div class="ct-kpis sj-k4">${k1}${k2}${whk}</div>` + c1 + cm + c4 + spec;
  }

  /* ---------- ⑥ 월 실적 마감 ---------- */
  function close() {
    const C = D.close, R = C.rows.filter((x) => inPl(x.eng[0]));
    const df = (a, p) => (a == null || p == null ? '–' : `<span class="${a - p < -p * 0.05 ? 'neg' : a - p > p * 0.1 ? 'wrn' : ''}">${a - p >= 0 ? '+' : ''}${n0(a - p)}</span>`);
    const rows = R.map((x) => `<tr><td class="nm">${esc(x.name)}</td><td class="r">${T(x.salesPlan)}</td><td class="r">${T(x.salesAct)}</td><td class="r">${df(x.salesAct, x.salesPlan)}</td><td class="r">${T(x.prodPlan)}</td><td class="r">${T(x.prodAct)}</td><td class="r">${df(x.prodAct, x.prodPlan)}</td><td class="r">${T(x.endPlan)}</td><td class="r">${T(x.endAct)}</td><td class="r">${df(x.endAct, x.endPlan)}</td></tr>`);
    const R2 = R.filter((x) => x.eng !== 'G자가재'), s = (k) => R2.reduce((a, x) => a + (x[k] || 0), 0), sb = (k1, k2) => R2.filter((x) => x[k1] != null && x[k2] != null).reduce((a, x) => [a[0] + x[k1], a[1] + x[k2]], [0, 0]);
    const [sA, sP] = sb('salesAct', 'salesPlan'), [pA, pP] = sb('prodAct', 'prodPlan'), [eA, eP] = sb('endAct', 'endPlan');   // 합계 = 계획·실적이 둘 다 있는 그룹끼리
    rows.push(`<tr class="tot"><td>합계<small class="muted"> 자가재 제외 · 양쪽 다 있는 그룹</small></td><td class="r">${T(sP)}</td><td class="r">${T(sA)}</td><td class="r">${df(sA, sP)}</td><td class="r">${T(pP)}</td><td class="r">${T(pA)}</td><td class="r">${df(pA, pP)}</td><td class="r">${T(eP)}</td><td class="r">${T(eA)}</td><td class="r">${df(eA, eP)}</td></tr>`);
    const c1 = card(1, `판매·생산·재고 대사표 — ${+C.month.slice(5)}월`, '단위 톤 · 차이 = 실적 − 계획', tbl(['그룹', ['판매 계획', 'r'], ['판매 실적', 'r'], ['차이', 'r'], ['생산 계획', 'r', '계획 엔진의 월 물량(참고)'], ['생산 실적', 'r'], ['차이', 'r'], ['기말재고 계획', 'r'], ['기말재고 실적', 'r'], ['차이', 'r']], rows)
    );
    const closeDef = [['판매 실적', 'MES 출하(선적월)'], ['생산 실적', '실적 코일 그룹 합(도금은 재계획 때 실적으로 맞춘 날)'], ['기말재고 실적', `${C.month.slice(5)}/말 판생속보 재고(장기재고 포함)`],
      ['계획', `현재 통합 계획의 ${+C.month.slice(5)}월 값(월초 확정 판 이력은 11월부터 쌓음 — 다음 달 마감부터 월초 판 기준)`], ['차이 색', '판매 −5% 이하 빨강 · 재고 +10% 이상 주황'],
      ['관리지표 추이', '계획재 판매·생산 비중, 재고일수, 소재 입고 준수율, 주문 마감 준수율, 출하 예정 없는 재고 — 월말 값을 매달 저장해 다음 달부터 4개월 추이']];
    const V = evMap('val'), cs = (kind, list) => list.map((c) => `<div class="sj-kv"><span>${esc(c)}</span><input class="sj-in" data-val="${esc(kind + '|' + C.month + '|' + c)}" value="${esc((V[kind + '|' + C.month + '|' + c] || {}).val || '')}" size="7" placeholder="톤"></div>`).join('');
    const c2 = card(2, '판매 미달 원인', '수주팀 입력(그룹·품명 단위 미달분에 원인 코드)', cs('salesCause', D.cfg.causes.sales));
    const c3 = card(3, '재고 초과 원인', '수주팀 입력', cs('stockCause', D.cfg.causes.stock));
    const [sa, sp] = sb('salesAct', 'salesPlan'), [sa2, pa] = sb('salesAct', 'prodAct');
    const kp = [['판매 / 생산비', 'Σ판매 실적 ÷ Σ생산 실적(출하 실적 있는 그룹)', pa ? (sa2 / pa).toFixed(2) : '–', '1.00 ± 0.03'], ['판매 달성률', 'Σ판매 실적 ÷ Σ판매 계획(출하 실적 있는 그룹)', pct(sp ? sa / sp * 100 : null), '95% 이상']];
    const c4 = card(4, '관리지표', `${+C.month.slice(5)}월 · 수주팀 목표 관리 지표`, tbl(['지표', '산식', ['값', 'r'], '목표'], kp.map((r) => `<tr><td class="nm">${r[0]}</td><td class="sub">${r[1]}</td><td class="r"><b>${r[2]}</b></td><td>${r[3]}</td></tr>`))
      );
    const K = evMap('ck');
    const ck = D.cfg.checklist.map((c) => { const id = D.month + '|' + c.step, e = K[id] || {}, st = e.val || (+D.today.slice(8) > c.to ? '확인 필요' : +D.today.slice(8) >= c.from ? '진행' : '예정');
      return `<tr><td class="c">${c.step}</td><td class="nm">${esc(c.text)}</td><td>${esc(c.dept)}</td><td>${+D.month.slice(5)}/${c.from}~${c.to}</td><td>${e.val === '완료' ? `${md(String(e.at || '').slice(0, 10))} ${esc(e.by || '')}` : '–'}</td><td><select class="sj-in" data-ck="${esc(id)}">${['예정', '진행', '완료', '지연', '확인 필요'].map((x) => `<option${x === st ? ' selected' : ''}>${x}</option>`).join('')}</select></td></tr>`; });
    const c5 = card(5, `이번 달(${+D.month.slice(5)}월) 갱신 체크리스트`, '월간 운영 일정 연동 · 완료 시 담당자·일시 기록', tbl([['단계', 'c'], '내용', '담당', '기한', '완료일', '상태'], ck));
    return c1 + c4 + `<div class="sj-g2e">${c2}${c3}</div>` + c5 + fold('fc', '<h3>정의</h3>' + defs(closeDef));
  }
})();
