/* 수주 관제(11/7 사용자 '수주팀 PDF 양식 그대로 탭 하나 새로 만들어') — 6개 화면 = 주소 #dash #order #prod #mat #stock #close
   자료: published/suju.enc.json(gadong-plan tools/suju_build.py) · 조치 상태·원인·체크리스트·포스코 Room 입력 = 공유 저장소(CT.store, t:'suju')
   숫자 = 실제 자료(양식의 예시 숫자 안 씀). 자료가 아직 없는 칸은 '자료 연결 대기'로 둠 */
(function () {
  'use strict';
  const { esc, n0, md } = CT;
  const VIEWS = ['dash', 'order', 'prod', 'mat', 'stock', 'close'];
  const TITLE = { dash: ['종합 관제판', '이번 달 판매계획만큼 주문이 들어오고, 계획대로 만들고, 소재가 제때 들어오고, 재고가 상한 안에 있는가'],
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
  const B = (st) => (st ? `<span class="sj-b ${{ 정상: 'ok', 주의: 'w', 경고: 'bad' }[st] || 'na'}">● ${esc(st)}</span>` : '<span class="sj-b na">–</span>');
  const pct = (v) => (v == null ? '–' : `${(+v).toFixed(1)}%`);
  const T = (v) => (v == null ? '–' : n0(v));
  const kt = (v) => (v == null ? '–' : `${(v / 1000).toFixed(1)}천톤`);
  const card = (n, title, sub, body, cls = '') => `<section class="card ${cls}"><h3><span class="sj-n">${n}</span>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h3>${body}</section>`;
  const tbl = (head, rows, cls = '') => `<div class="sj-wrap"><table class="sj-t ${cls}"><thead><tr>${head.map((h) => (Array.isArray(h) ? `<th class="${h[1]}">${h[0]}</th>` : `<th>${h}</th>`)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
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
    if (!bound) { bound = true; CT.onView(() => { draw(); window.scrollTo(0, 0); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }

  /* ---------- 공통 머리: 기준월·기준일·자료 시각 · 필터 · 이번 주 마감 · 월간 운영 일정 ---------- */
  function head() {
    const C = D.cfg, td = D.today, ym = D.month, nd = D.nDays, day = +td.slice(8);
    const stale = CT.diff(td, D.asOf) > 1;
    const top = `<div class="sj-top"><span class="sj-pill">기준월 <b>${ym.slice(0, 4)}.${ym.slice(5)}</b></span>`
      + `<span class="sj-pill b">기준일 ${md(td)}(${'일월화수목금토'[new Date(td + 'T00:00:00Z').getUTCDay()]}) · 경과 ${day - 1} / ${nd}일</span>`
      + `<span class="sj-pill s">실적 ~${md(D.asOf)} · 주문 ${esc(String(D.dataAt.order || '').slice(5, 16))} 갱신${stale ? ' · <b class="neg">사내 PC 자료 멈춤</b>' : ''}</span></div>`;
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
    const X = (d) => ((d - 1) / nd * 100);
    const bars = C.schedule.map((s) => `<div class="bar" style="left:${X(s.from)}%;width:${Math.max(2.2, (Math.min(s.to, nd) - s.from + 1) / nd * 100)}%;top:${s.row * 27}px;background:${s.color}" title="${esc(s.label)}">${s.from}${s.to !== s.from ? '~' + Math.min(s.to, nd) : ''} ${esc(s.label)}</div>`).join('');
    const ax = [1, 5, 10, 15, 20, 25, nd].map((d) => `<span style="left:${X(d)}%">${d}일</span>`).join('');
    const sch = `<div class="sj-sch"><div class="cap"><span>월간 운영 일정 (${+ym.slice(5)}월)</span><span>▼ 오늘 ${md(td)}</span></div><div class="rows">${bars}<div class="now" style="left:${X(day)}%"></div></div><div class="ax">${ax}</div></div>`;
    return top + flt + sch;
  }

  /* ---------- ① 종합 관제판 ---------- */
  function dash() {
    const G = groups(), K = D.kpi;
    const dem = G.filter((g) => g.base != null), sb = dem.reduce((a, g) => a + g.base, 0), so = dem.reduce((a, g) => a + g.orders, 0);
    const prog = sb ? so / sb * 100 : null, gapN = dem.filter((g) => g.progSt === '경고').length, gapT = dem.reduce((a, g) => a + (g.gap || 0), 0);
    const G2 = G.filter((g) => g.key !== '자가재'), pc = G2.reduce((a, g) => a + (g.planCum || 0), 0), ac = G2.reduce((a, g) => a + (g.actCum || 0), 0), ach = pc ? ac / pc * 100 : null;
    const mats = D.mats.filter((x) => inPl(x.plant)), mw = mats.filter((x) => x.st === '경고'), mo = mats.filter((x) => x.st === '주의');
    const wh = ['C', 'G'].filter(inPl).map((p) => D.wh[p]), whCur = wh.reduce((a, x) => a + x.cur, 0), whCap = wh.reduce((a, x) => a + x.cap, 0);
    const kpi = (n, t, st, v, s) => `<div class="sj-k"><div class="t"><span><span class="sj-n">${n}</span>${t}</span>${B(st)}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const k1 = kpi(1, '수주 진도', prog == null ? null : prog >= 100 ? '정상' : prog >= 90 ? '주의' : '경고', pct(prog),
      `기준선 ${T(sb)}톤 대비 확정 ${T(so)}톤<br>월 판매계획 대비 ${pct(dem.reduce((a, g) => a + (g.sales || 0), 0) ? so / dem.reduce((a, g) => a + (g.sales || 0), 0) * 100 : null)} · 미수주 갭 ${T(gapT)}톤(${gapN}개 그룹 경고)`);
    const k2 = kpi(1, '생산 달성률', ach == null ? null : ach >= 95 && ach <= 105 ? '정상' : ach >= 90 && ach <= 110 ? '주의' : '경고', pct(ach),
      `월초 계획 누계 ${T(pc)}톤 대비 실적 ${T(ac)}톤(자가재 제외)<br>~${md(D.asOf)} 실적 · 월초 계획 = ${D.planStartAt ? md(D.planStartAt.slice(0, 10)) : '-'} 게시본`);
    const k3 = kpi(1, '소재 결품 위험', mw.length ? '경고' : mo.length ? '주의' : '정상', `${mw.length}건 · ${T(mw.reduce((a, x) => a + Math.max(0, (x.use || 0) / D.nDays * 7 - (x.end || 0)), 0))}톤`,
      `주의 ${mo.length}건 · ${mw.concat(mo).slice(0, 3).map((x) => `${esc(x.name)} ${x.days}일`).join(', ') || '없음'}<br>월말 재고일수 7일 미만 = 7일분까지 부족량`);
    const k4 = kpi(1, '창고 재고', whCur / whCap > 1 ? '경고' : whCur / whCap > 0.9 ? '주의' : '정상', kt(whCur),
      `상한 ${kt(whCap)}의 ${Math.round(whCur / whCap * 100)}% (상한 = PDF 예시값, 판생 값 대기)<br>${wh.map((x) => x.parts.map((p) => `${p[0]} ${kt(p[1])}`).join(' · ')).join(' / ')}`);
    // ② 그룹 관제 매트릭스
    const rows = G.map((g) => `<tr><td class="sub">${g.plant === 'C' ? '컬러' : '도금'}</td><td class="nm">${esc(g.name)}</td><td><span class="sj-tag">${esc(g.type)}</span></td>`
      + `<td class="r" title="${esc(g.salesSrc)}">${T(g.sales)}</td><td class="r">${T(g.orders)}</td><td class="r">${T(g.base)}</td><td class="c">${g.prog == null ? '<span class="sj-b na">–</span>' : `${B(g.progSt).replace('● ' + g.progSt, '● ' + pct(g.prog))}`}</td>`
      + `<td class="r">${T(g.planCum)}</td><td class="r">${T(g.actCum)}</td><td class="c">${g.ach == null ? '<span class="sj-b na" title="계획 누계 300t 미만 — 판정 보류">보류</span>' : B(g.achSt).replace('● ' + g.achSt, '● ' + pct(g.ach))}</td>`
      + `<td class="r">${T(g.end)}</td><td class="r">${g.endDays == null ? (g.key === '계획재' ? '목표 대비' : '–') : `${g.endDays} / ${g.cap || '-'}일`}</td><td class="c">${B(g.stockSt)}</td></tr>`);
    const sum = (k) => G.filter((g) => g.key !== '자가재').reduce((a, g) => a + (g[k] || 0), 0);   // 자가재 = 컬러 투입(내부) — 합계에서 빼야 이중 계산 없음
    rows.push(`<tr class="tot"><td></td><td>합계</td><td class="sub">자가재 제외(내부 투입)</td><td class="r">${T(sum('sales'))}</td><td class="r">${T(sum('orders'))}</td><td class="r">${T(sum('base'))}</td><td class="c">${pct(prog)}</td><td class="r">${T(pc)}</td><td class="r">${T(ac)}</td><td class="c">${pct(ach)}</td><td class="r">${T(sum('end'))}</td><td></td><td></td></tr>`);
    const mx = card(2, '그룹 관제 매트릭스', `${+D.month.slice(5)}월 누계 · 기준일 ${md(D.today)} · 기준선 = 이달 1일~${md(D.cut)}(W+1) 편성`,
      tbl(['공장', '그룹', '운영유형', ['판매계획', 'r'], ['수주 누계', 'r'], ['기준선', 'r'], ['수주 진도', 'c'], ['생산 계획누계', 'r'], ['생산 실적', 'r'], ['달성률', 'c'], ['예상 월말재고', 'r'], ['재고일수/상한', 'r'], ['재고', 'c']], rows)
      + `<p class="sj-foot">수주 누계 = 기준선 기간에 생산할 주문 중 <b>소재 매치(도금: 소재 입고·생산 중·완료)</b>된 톤 · 판매계획 = 판생속보 월차(도금) · 통합 계획 판매(컬러, 세부 그룹은 이달 편성 비율) · 계획재 = R15 생산계획 · 자가재 = 컬러 투입 필요 · 컬러 세부 그룹 생산 실적은 실적 코일의 그룹 기준이라 계획 그룹과 섞일 수 있음 · 재고 = 통합 계획 예상 월말(컬러 수출 3개 그룹·주문재는 그룹 합으로만 계산 — ⑤ 재고 화면)</p>`);
    return `<div class="sj-kpis">${k1}${k2}${k3}${k4}</div>` + mx + calendar() + actions() + signals();
  }

  /* ③ 일별 계획 캘린더: 라인 가동(지난 날 실적·달성률, 오늘 이후 계획) + 소재 재고일수 전망 */
  function calendar() {
    const nd = D.nDays, ym = D.month, td = D.today, days = Array.from({ length: nd }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const hd = `<tr><th class="lab">라인 / 구분</th>${days.map((d) => `<th class="${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}${d === td ? ' now' : ''}">${+d.slice(8)}<br><small>${'일월화수목금토'[dow(d)]}</small></th>`).join('')}</tr>`;
    // 생산주·주문 마감 줄
    const wkRow = `<tr><td class="lab">생산주·주문 마감</td>${days.map((d) => { const w = D.weeks.find((x) => d >= x.wFrom && d <= CT.addD(x.wFrom, 6)); return `<td class="${d === td ? 'now' : ''}" style="background:${w && w.state === '마감' ? '#e7f5ec' : w && w.state === '진행 중' ? '#fdf0d8' : 'transparent'}">${w && d === (w.wFrom < D.month + '-01' ? D.month + '-01' : w.wFrom) ? `<small>${esc(w.state)}</small>` : ''}</td>`; }).join('')}</tr>`;
    const lineRow = (l, lab) => {
      const R = D.daily[l] || [];
      return `<tr><td class="lab">${esc(l)}<small>${esc(lab)}</small></td>${R.map(([d, p0, p, a]) => {
        if (d <= D.asOf && a != null) { const r = p0 ? a / p0 * 100 : null, c = r == null ? '' : r >= 95 ? '' : r >= 90 ? ' w' : ' bad'; return `<td class="ac${c}${d === td ? ' now' : ''}" title="${md(d)} 실적 ${n0(a)}t · 월초 계획 ${n0(p0)}t">${n0(a)}${r != null && p0 >= 20 ? `<small>${Math.round(r)}%</small>` : ''}</td>`; }
        if (d <= D.asOf) return `<td class="zero${d === td ? ' now' : ''}">–</td>`;
        return p ? `<td class="pl${d === td ? ' now' : ''}" title="${md(d)} 계획 ${n0(p)}t">${n0(p)}</td>` : `<td class="zero${d === td ? ' now' : ''}" title="계획 없음(휴지·정지)">휴</td>`;
      }).join('')}</tr>`;
    };
    const LC = { '1CCL': 'PVS 등', '2CCL': '건재', '3CCL': 'STS·POR·PLY', '4CCL': 'PPG·PPH·Al', '1CGL': 'AZ·AL', '2CGL': 'AL·MAC' };
    let body = wkRow;
    if (inPl('C')) body += `<tr class="sec"><td colspan="${nd + 1}">컬러공장 가동 — 1~4라인 · 일 생산량(톤), 지난 날 = 실적(작은 글씨 = 월초 계획 대비)</td></tr>` + ['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => lineRow(l, LC[l])).join('');
    if (inPl('G')) body += `<tr class="sec"><td colspan="${nd + 1}">도금공장 가동 — 1·2라인 · 일 생산량(톤)</td></tr>` + ['1CGL', '2CGL'].map((l) => lineRow(l, LC[l])).join('');
    const MD = Object.entries(D.matDaily).filter(([k]) => inPl(k[0]));
    if (MD.length) {
      body += `<tr class="sec"><td colspan="${nd + 1}">소재 수급 — 재고일수 전망(오늘 실재고 + 입고 예정 − 계획 소요) · 배경 = 7일↑ 정상 / 5~7 주의 / 5↓ 경고 · 숫자 = 재고일수, 작은 +숫자 = 그날 입고 예정(톤)</td></tr>`;
      body += MD.map(([k, x]) => `<tr><td class="lab">${esc(x.name)}<small>${k[0] === 'G' ? '도금' : '컬러'} · ${n0(x.avgUse)}톤/일</small></td>${days.map((d) => { const r = x.rows.find((y) => y[0] === d); if (!r) return `<td class="zero">–</td>`; const c = r[1] >= 7 ? 'ok' : r[1] >= 5 ? 'w' : 'bad'; return `<td class="md ${c}${d === td ? ' now' : ''}" title="${md(d)} 재고 ${r[1]}일분${r[2] ? ` · 입고 예정 ${n0(r[2])}t` : ''}">${r[2] >= 50 ? `${r[1]}<small>+${n0(r[2])}</small>` : r[1]}</td>`; }).join('')}</tr>`).join('');
    }
    return card(3, `${+D.month.slice(5)}월 일별 계획 캘린더 — 컬러·도금 가동 / 소재 수급`, '지난 날 = 실적 · 오늘 이후 = 현재 계획 · 셀에 마우스 = 상세',
      `<div class="sj-wrap"><table class="sj-cal"><thead>${hd}</thead><tbody>${body}</tbody></table></div><p class="sj-foot">소재 재고일수 = 하루 평균 소요(이달 계획) 기준. 입고 예정은 MES에 등록된 미입고 발주만(아직 발주 안 한 물량은 빠짐) — 월말로 갈수록 낮게 보일 수 있음</p>`);
  }

  function actions() {
    const S = evMap('act'), L = D.actions.filter((a) => grpSel === 'all' || (a.text || '').includes((D.groups.find((g) => g.key === grpSel) || {}).name || '#'));
    const rows = L.map((a) => { const id = CT.issueId(a.area + '|' + a.text.replace(/[\d,.]+/g, '#')); const st = (S[id] || {}).val || '미조치';
      return `<tr><td>${B(a.lvl)}</td><td>${esc(a.area || '')}</td><td>${esc(a.text)}</td><td class="c">${a.due ? md(a.due) : '–'}</td><td>${esc(a.dept || '')}</td><td><select class="sj-in" data-act="${id}" aria-label="조치 상태">${['미조치', '진행', '완료'].map((x) => `<option${x === st ? ' selected' : ''}>${x}</option>`).join('')}</select>${S[id] ? `<small class="muted"> ${esc(S[id].by || '')} ${md(String(S[id].at || '').slice(0, 10))}</small>` : ''}</td></tr>`; });
    return card(4, '이번 주 조치 필요', '각 화면 경고·주의 항목 자동 생성 · 정렬: 경고 → 주의 · 상태는 공유 저장(담당자·시각 기록)',
      rows.length ? tbl(['신호', '영역', '내용', ['마감일', 'c'], '담당부서', '상태'], rows) : '<p class="muted">경고·주의 항목 없음</p>');
  }

  function signals() {
    return card(5, '신호등 기준 (전 화면 공통)', `기준값 출처: ${D.cfg.src}`,
      tbl(['지표', '산식', '정상', '주의', '경고'], D.cfg.signals.map((s) => `<tr><td class="nm">${esc(s.name)}</td><td>${esc(s.calc)}</td><td class="pos">${esc(s.ok)}</td><td class="wrn">${esc(s.warn)}</td><td class="neg">${esc(s.bad)}</td></tr>`))
      + `<p class="sj-foot">창고 상한(컬러 ${kt(D.cfg.warehouse.C.cap)} · 도금 ${kt(D.cfg.warehouse.G.cap)}) = PDF 예시값으로 임시 설정 — 판생 확정값 받으면 바꿈</p>`);
  }

  /* ---------- ② 수주 진도 ---------- */
  function order() {
    const W = D.weekOrders, dem = groups().filter((g) => g.base != null), keys = dem.map((g) => g.key);
    const sumW = (w, k) => keys.reduce((a, g) => a + ((w.g[g] || {})[k] || 0), 0);
    const nextDl = W.find((w) => w.deadline >= D.today);
    const wc = W.map((w) => { const cur = nextDl && w.deadline === nextDl.deadline; const run = w.state === '진행 중';
      return `<div class="sj-wc ${cur ? 'cur' : run ? 'run' : ''}"><b>생산주 ${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}</b><div class="s">주문 마감 ${md(w.deadline)}(수) ${w.deadline >= D.today ? dday(w.deadline) : ''}</div><div>${w.state === '마감' ? '마감 · 확정돼야 함' : w.state === '진행 중' ? '<b class="wrn">수주 진행 중</b>' : '마감 전'}</div><div class="s">편성 ${T(sumW(w, 'plan'))}톤 · 확정 ${T(sumW(w, 'mat'))}톤</div></div>`; }).join('');
    const sb = dem.reduce((a, g) => a + g.base, 0), so = dem.reduce((a, g) => a + g.orders, 0);
    const c1 = card(1, '수주 진도 기준선 = 오늘까지 확정됐어야 하는 주문량', '', `<div class="sj-wk">${wc}</div>`
      + `<p class="sj-foot" style="font-size:13.5px;color:var(--ink)">기준선(${md(D.today)}) = Σ 일별가동계획 편성량 [생산일 ${md(D.month + '-01')} ~ ${md(D.cut)}] = <b>${T(sb)}톤</b> · 확정 주문(소재 매치) <b>${T(so)}톤</b> → 진도 <b class="${so >= sb ? 'pos' : so >= sb * 0.9 ? 'wrn' : 'neg'}">${pct(sb ? so / sb * 100 : null)}</b> · 미수주 갭 <b class="neg">${T(Math.max(0, sb - so))}톤</b><br>기준선은 수요일 마감마다 다음 생산주 끝까지 늘어남(계단) · 편성 = 현재 통합 계획 · 생산주 = 수~화</p>`);
    // ② 월 수주 누적(그룹 선택): 판매계획 선 · 기준선 계단 · 확정 점
    const gsel = curveG && keys.includes(curveG) ? curveG : keys[0];
    const g = D.groups.find((x) => x.key === gsel);
    const segs = `<div class="sj-seg">${dem.map((x) => `<button type="button" data-cg="${x.key}" aria-pressed="${x.key === gsel}">${esc(x.name)}</button>`).join('')}</div>`;
    const c2 = card(2, '월 수주 누적 — 판매계획 · 기준선 · 확정', '그룹 선택', g ? segs + curve(g) : '');
    // ③ 그룹별 진도 막대
    const bars = dem.slice().sort((a, b) => (a.prog || 0) - (b.prog || 0)).map((x) => { const p = Math.min(120, x.prog || 0);
      return `<div class="sj-gb"><div class="h"><span>${esc(x.name)}</span><b class="${x.progSt === '정상' ? 'pos' : x.progSt === '주의' ? 'wrn' : 'neg'}">${pct(x.prog)} · 갭 ${T(x.gap)}t</b></div><div class="sj-bar"><i style="width:${p / 120 * 100}%;background:${x.progSt === '정상' ? 'var(--good)' : x.progSt === '주의' ? 'var(--warn)' : 'var(--bad)'}"></i><u style="left:${100 / 120 * 100}%"></u></div></div>`; }).join('');
    const c3 = card(3, '그룹별 수주 진도', '', bars + '<p class="sj-foot">막대 = 확정 ÷ 기준선, 검은 선 = 100% (최대 120% 표시)</p>');
    // ④ 주차별 마감 캘린더(선택 그룹)
    const rows4 = W.map((w) => { const x = w.g[gsel] || {}; const gap = Math.max(0, (x.plan || 0) - (x.mat || 0)); const r = x.plan ? x.mat / x.plan * 100 : null;
      const st = w.state === '마감' ? (gap > 0 && r < 95 ? ['마감·미달', 'bad'] : ['마감·충족', 'ok']) : w.state === '진행 중' ? ['진행 중 ' + dday(w.deadline), 'w'] : ['마감 전', 'na'];
      return `<tr><td>${md(w.deadline)}(수)</td><td>${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}</td><td class="r">${T(x.plan)}</td><td class="r">${T(x.ord)}</td><td class="r">${T(x.mat)}</td><td class="r"><b>${T(gap)}</b></td><td class="r">${pct(r)}</td><td><span class="sj-b ${st[1]}">● ${st[0]}</span></td></tr>`; });
    const c4 = card(4, `주차별 주문 마감 캘린더 — ${g ? g.name : ''}`, '소재 매치된 주문만 "확정" 집계', tbl(['주문 마감', '대상 생산주(W+1)', ['일별계획 편성량', 'r'], ['등록 주문', 'r'], ['소재 매치 완료', 'r'], ['갭', 'r'], ['확정률', 'r'], '상태'], rows4)
      + '<p class="sj-foot">주문을 생산주에 놓는 기준 = MES 생산 예정일, 없으면 납기 −7일(도금)·−10일(컬러) · 등록 주문 = 같은 생산주의 주문 전체</p>');
    // ⑤ 수출 선적
    const ex = D.export.map((x) => `<tr><td class="nm">${esc(x.dst)}</td><td class="r">${T(x.t)}</td><td>${md(x.firstDue)}</td><td>${Object.entries(x.st).map(([k, v]) => `<span class="sj-tag">${esc(k)} ${n0(v)}</span>`).join(' ')}</td></tr>`);
    const c5 = card(5, '수출 선적 기준 수주 현황 — 도금수출', `${+D.month.slice(5)}월 납기(선적) 주문 · 목적지별`, ex.length ? tbl(['목적지(착지)', ['주문량', 'r'], '첫 납기', '진행 상태(톤)'], ex) + '<p class="sj-foot">선적창·배선 형태(벌크/컨테이너)·선생산 구분은 배선일정 자료를 붙이는 다음 단계에서 추가</p>' : wait('도금수출 이달 주문 없음'));
    // ⑥ 미수주 위험(마감 2주 이내 · 확정률 70% 미만)
    const risk = [];
    for (const w of W) { if (CT.diff(w.deadline, D.today) > 14 || w.state === '마감') continue; for (const k of keys) { const x = w.g[k] || {}; if (!x.plan || x.plan < 50) continue; const r = x.mat / x.plan * 100; if (r < 70) risk.push(`<tr><td class="nm">${esc(D.groups.find((y) => y.key === k).name)}</td><td>${md(w.wFrom)}~${md(CT.addD(w.wFrom, 6))}</td><td>${md(w.deadline)}</td><td class="r">${T(x.plan)}</td><td class="r">${T(x.mat)}</td><td class="r"><b class="neg">${pct(r)}</b></td><td>${esc(D.groups.find((y) => y.key === k).dept)}</td></tr>`); } }
    const c6 = card(6, '미수주 위험 리스트', '마감 2주 이내 · 확정률 70% 미만 그룹·생산주', risk.length ? tbl(['그룹', '생산주', '마감', ['편성', 'r'], ['확정', 'r'], ['확정률', 'r'], '담당'], risk) : '<p class="muted">해당 없음</p>');
    return c1 + `<div class="sj-g2">${c2}${c3}</div>` + c4 + c5 + c6;
  }

  function curve(g) {
    const W = 760, H = 250, L = 52, R = 14, Tp = 14, Bt = 30, nd = D.nDays, steps = D.baseSteps[g.key] || [];
    const ymax = Math.max(g.sales || 0, ...steps.map((s) => s[1] || 0), g.orders || 0, 1) * 1.08;
    const x = (d) => L + (d - 1) / (nd - 1) * (W - L - R), y = (v) => Tp + (1 - v / ymax) * (H - Tp - Bt);
    const dn = (s) => Math.max(1, Math.min(nd, s.slice(0, 7) === D.month ? +s.slice(8) : s < D.month ? 1 : nd));
    let path = '', prev = 0;
    steps.forEach(([d, v]) => { const xd = x(dn(d)); path += path ? ` L${xd},${y(prev)} L${xd},${y(v)}` : `M${x(1)},${y(v)}`; prev = v; });
    path += ` L${x(nd)},${y(prev)}`;
    const td = +D.today.slice(8), gx = [0, .25, .5, .75, 1].map((k) => `<line x1="${L}" x2="${W - R}" y1="${y(ymax * k)}" y2="${y(ymax * k)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(ymax * k) + 4}" text-anchor="end">${n0(ymax * k)}</text>`).join('');
    const xl = [1, 5, 10, 15, 20, 25, nd].map((d) => `<text x="${x(d)}" y="${H - 10}" text-anchor="middle">${+D.month.slice(5)}/${d}</text>`).join('');
    return `<svg class="sj-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(g.name)} 수주 누적">${gx}${xl}`
      + `<rect x="${x(1)}" y="${Tp}" width="${x(td) - x(1)}" height="${H - Tp - Bt}" fill="var(--tint)" opacity=".6"/>`
      + (g.sales ? `<line x1="${x(1)}" x2="${x(nd)}" y1="${y(g.sales)}" y2="${y(g.sales)}" stroke="var(--ink-2)" stroke-dasharray="5 4"/><text x="${W - R}" y="${y(g.sales) - 5}" text-anchor="end">판매계획 ${n0(g.sales)}</text>` : '')
      + `<path d="${path}" fill="none" stroke="#c46a12" stroke-width="2"/>`
      + `<line x1="${x(td)}" x2="${x(td)}" y1="${Tp}" y2="${H - Bt}" stroke="#c0262d"/><text x="${x(td) + 4}" y="${Tp + 10}" fill="#c0262d">오늘 ${md(D.today)}</text>`
      + `<circle cx="${x(td)}" cy="${y(g.orders || 0)}" r="5" fill="#2457c5"/><text x="${x(td) + 8}" y="${y(g.orders || 0) + 4}" fill="#2457c5">확정 ${n0(g.orders)} · 갭 ${n0(g.gap)}</text></svg>`
      + '<p class="sj-foot">— 판매계획(점선) · 기준선(주황 계단, 수 마감마다 상승) · 확정(파란 점, 오늘 값) · 날짜별 확정 누계 선은 주문 확정일 자료 연결 후 추가</p>';
  }

  /* ---------- ③ 생산 ---------- */
  function prod() {
    const L = D.lines.filter((l) => inPl(l.pl));
    const cards = L.map((l) => { const st = l.ach == null ? 'na' : l.ach >= 95 ? '' : l.ach >= 90 ? 'w' : 'bad';
      return `<div class="sj-k ${st}"><div class="t"><span>${esc(l.line)}</span>${l.month ? B(l.ach == null ? null : l.ach >= 95 && l.ach <= 105 ? '정상' : l.ach >= 90 && l.ach <= 110 ? '주의' : '경고') : '<span class="sj-b na">휴지</span>'}</div><div class="v">${pct(l.ach)}</div><div class="s">달성률(실적 ÷ 일정 누계)</div>`
        + `<div class="sj-kv"><span>월 계획(판생)</span><b>${T(l.month)}</b></div><div class="sj-kv"><span>일정 누계</span><b>${T(l.sched)}</b></div><div class="sj-kv"><span>실적</span><b>${T(l.actual)}</b></div><div class="sj-kv"><span>가동률</span><b>${l.run == null ? '–' : l.run + '%'}</b></div><div class="sj-kv"><span>T/hr</span><b>${l.tph ?? '–'}</b></div>${l.next ? `<div class="s" style="margin-top:4px">다음: ${md(l.next[0])} ${esc(l.next[1])}</div>` : ''}</div>`; }).join('');
    const c1 = card(1, '라인별 월 가동 현황', `${+D.month.slice(5)}월 · 판생속보 ~${esc(String(D.dataAt.sr || '').slice(5, 16))}`, `<div class="sj-lc">${cards}</div>`);
    const ls = L.map((l) => l.line), sel = ls.includes(lineSel) ? lineSel : ls[0];
    const c2 = card(2, `일별 계획 vs 실적 — ${sel}`, '막대 = 일 계획(월초 판) / 일 실적 · 점선 = 계획 누계 진도', `<div class="sj-seg">${ls.map((l) => `<button type="button" data-line="${l}" aria-pressed="${l === sel}">${l}</button>`).join('')}</div>` + dayChart(sel));
    const R = D.woWeek.rows.filter((r) => inPl(/CCL/.test(r[1]) ? 'C' : 'G')), wd = [...new Set(R.map((r) => r[0]))].sort(), wl = [...new Set(R.map((r) => r[1]))].sort();
    const pv = wl.map((l) => `<tr><td class="nm">${esc(l)}</td>${wd.map((d) => `<td>${R.filter((r) => r[0] === d && r[1] === l).map((r) => `<span class="it">${esc(r[2])} <b>${esc(r[3])}</b> ${n0(r[4])}</span>`).join('') || '<span class="muted">–</span>'}</td>`).join('')}</tr>`);
    const c3 = card(3, `1주 작업 편성 — 생산주 ${md(D.woWeek.from)}~${md(D.woWeek.to)}`, '현재 계획 품목(20t 이상) · 그룹 품명 톤', R.length ? tbl(['라인', ...wd.map((d) => `${md(d)}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})`)], pv, 'sj-pv')
      + '<p class="sj-foot">확정 주문·소재 매치·부원료·소재 이송·작업지시 단계 표시는 주문 진도(주문진도 화면)와 품목을 잇는 다음 단계에서 추가</p>' : wait('다음 주 계획 품목 없음'));
    const th = D.thr.filter((x) => inPl('C'));
    const c4 = card(4, 'T/hr 실적', '컬러 라인·주요 품명(이번 달 실적)', th.length ? tbl(['라인', '품명', ['두께', 'r'], ['생산 톤', 'r'], ['실적 T/hr', 'r']], th.map((x) => `<tr><td>${esc(x.line)}</td><td class="nm">${esc(x.pdt)}</td><td class="r">${x.thk}</td><td class="r">${n0(x.t)}</td><td class="r"><b>${x.tph}</b></td></tr>`))
      + '<p class="sj-foot">기준 T/hr 대비 편차·판정(±10% 갱신 대상)은 품명·두께×폭 구간 기준표 연결 후 추가</p>' : wait('컬러 실적 없음'));
    return c1 + c2 + c3 + c4;
  }

  function dayChart(l) {
    const R = D.daily[l] || [], W = 900, H = 230, Lp = 46, Rp = 14, Tp = 12, Bp = 26, n = R.length;
    const ymax = Math.max(1, ...R.map((r) => Math.max(r[1] || 0, r[2] || 0, r[3] || 0))) * 1.1, bw = (W - Lp - Rp) / n;
    const x = (i) => Lp + i * bw, y = (v) => Tp + (1 - v / ymax) * (H - Tp - Bp);
    let bars = '', tot = R.reduce((a, r) => a + (r[1] || 0), 0), cum = 0, pts = [];
    R.forEach((r, i) => { const pv = r[3] != null ? r[1] : r[2]; bars += `<rect x="${x(i) + 2}" y="${y(pv || 0)}" width="${bw - 4}" height="${H - Bp - y(pv || 0)}" fill="#c9d8f2"><title>${md(r[0])} 계획 ${n0(pv)}t</title></rect>`;
      if (r[3] != null) bars += `<rect x="${x(i) + bw * 0.28}" y="${y(r[3])}" width="${bw * 0.44}" height="${H - Bp - y(r[3])}" fill="#2457c5"><title>${md(r[0])} 실적 ${n0(r[3])}t</title></rect>`;
      if (!pv) bars += `<rect x="${x(i) + 2}" y="${Tp}" width="${bw - 4}" height="${H - Tp - Bp}" fill="var(--sub)" opacity=".7"><title>${md(r[0])} 휴지·수리·계획 없음</title></rect>`;
      cum += r[1] || 0; pts.push(`${x(i) + bw / 2},${Tp + (1 - (tot ? cum / tot : 0)) * (H - Tp - Bp)}`); });
    const td = R.findIndex((r) => r[0] === D.today);
    const ax = [0, 4, 9, 14, 19, 24, n - 1].map((i) => `<text x="${x(i) + bw / 2}" y="${H - 8}" text-anchor="middle">${i + 1}</text>`).join('');
    const gy = [0, .5, 1].map((k) => `<text x="${Lp - 6}" y="${y(ymax * k) + 4}" text-anchor="end">${n0(ymax * k)}</text><line x1="${Lp}" x2="${W - Rp}" y1="${y(ymax * k)}" y2="${y(ymax * k)}" stroke="var(--line)"/>`).join('');
    return `<svg class="sj-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(l)} 일별 계획 실적">${gy}${bars}<polyline points="${pts.join(' ')}" fill="none" stroke="var(--ink)" stroke-dasharray="4 3"/>${td >= 0 ? `<line x1="${x(td)}" x2="${x(td)}" y1="${Tp}" y2="${H - Bp}" stroke="#c0262d"/><text x="${x(td) + 4}" y="${Tp + 10}" fill="#c0262d">오늘 ${md(D.today)}</text>` : ''}${ax}</svg>`
      + '<p class="sj-foot">연한 막대 = 계획(지난 날은 월초 판, 오늘 이후는 현재 판) · 진한 막대 = 실적 · 회색 = 휴지·수리 · 점선 = 월 계획 누계 진도(0~100%)</p>';
  }

  /* ---------- ④ 소재 ---------- */
  function mat() {
    const M = D.mats.filter((x) => inPl(x.plant));
    const rows = M.map((x) => `<tr><td class="nm">${esc(x.name)}<div class="sub">${x.cls.map((c) => `<span class="sj-tag">${esc(c)}</span>`).join(' ')}</div></td><td>${x.plant === 'G' ? '도금' : '컬러'}</td><td class="r">${x.lt}</td><td class="r">${T(x.stock)}</td><td class="r">${T(x.use)}</td><td class="r">${T(x.recv)}</td><td class="r">${T(x.dueIn)}</td><td class="r"><b>${T(x.end)}</b></td><td class="r"><b class="${x.st === '경고' ? 'neg' : x.st === '주의' ? 'wrn' : ''}">${x.days == null ? '–' : x.days + '일'}</b></td><td class="c">${B(x.st)}</td></tr>`);
    const c1 = card(1, '소재별 월 수급표', `${+D.month.slice(5)}월 · 단위 톤 · 재고일수 최소 7일 관리`, tbl(['소재(포함 발주구분)', '공장', ['L/T(일)', 'r'], ['현재 재고', 'r'], ['월 소요(계획)', 'r'], ['이달 입고 실적', 'r'], ['입고 예정(잔여)', 'r'], ['예상 월말 재고', 'r'], ['재고일수', 'r'], ['상태', 'c']], rows)
      + `<p class="sj-foot">예상 월말 = 현재 재고 + 입고 예정(MES 미입고 발주) − 남은 날 계획 소요 · 월 소요 = 컬러 계획 × 품명별 소재 비중, 도금 = F/H 계획 사용 · 행은 소재 코드 단위(포함 발주구분 표시) — PDF의 소재발주구분 13종 행(${D.cfg.matClasses.map((c) => c.key).join('·')})은 MES 발주구분 코드표를 받아 공급사·용도로 나누는 다음 단계에서 바꿈</p>`);
    const S = D.matShort.filter((x) => (x.gap || 0) > 0);
    const c2 = card(2, '결품 위험 — 규격별 부족(컬러 소재)', '발주 검토 화면 기준', S.length ? tbl(['소재', '두께×폭', ['필요', 'r'], ['부족', 'r'], '판정', '첫 부족일', '발주 권장', '입고 예상', '내용'], S.map((x) => `<tr><td class="nm">${esc(x.mat)}</td><td>${esc(x.size)}</td><td class="r">${T(x.need)}</td><td class="r"><b class="neg">${T(x.gap)}</b></td><td>${esc(x.judge || '')}</td><td>${md(x.first)}</td><td>${(x.order || []).map(md).join('~')}</td><td>${md(x.arrive)}</td><td class="sub">${esc(x.why || '')}</td></tr>`)) : '<p class="muted">부족 없음</p>');
    const N = D.matNear.filter((x) => inPl(x.plant));
    const c3 = card(3, '이번 주·다음 주 발주 대상', '발주 마감 = 사용일 − 리드타임 · 2주 안 마감', N.length ? tbl(['공장', '소재', '공급사', '첫 사용일', '발주 마감', ['수량', 'r'], '상태'], N.map((x) => `<tr><td>${x.plant === 'G' ? '도금' : '컬러'}</td><td class="nm">${esc(x.mat)}</td><td>${esc(x.sup)}</td><td>${md(x.first)}</td><td><b>${md(x.deadline)}</b> ${dday(x.deadline)}</td><td class="r">${T(x.t)}</td><td><span class="sj-b ${CT.diff(x.deadline, D.today) <= 3 ? 'bad' : 'w'}">● 발주 대기</span></td></tr>`)) : '<p class="muted">2주 안 발주 마감 없음</p>');
    const V = evMap('val'), val = (k) => (V[k] || {}).val || '';
    const c4 = card(4, '포스코 Room vs 대상량', '수주팀 입력 · 대상량 > Room 이면 경고', `<div class="sj-kv"><span>다음 달 Room(톤)</span><input class="sj-in" data-val="room" value="${esc(val('room'))}" placeholder="입력" size="8"></div><div class="sj-kv"><span>수주집 선정 대상량(톤)</span><input class="sj-in" data-val="roomTarget" value="${esc(val('roomTarget'))}" placeholder="입력" size="8"></div>`
      + (val('room') && val('roomTarget') ? `<p><b class="${+val('roomTarget') > +val('room') ? 'neg' : 'pos'}">${+val('roomTarget') > +val('room') ? '초과 +' + n0(val('roomTarget') - val('room')) + '톤 → 마케팅 협의 필요' : '여유 ' + n0(val('room') - val('roomTarget')) + '톤'}</b></p>` : '<p class="sj-foot">입력하면 바로 판정</p>'));
    const lg = D.cfg.matClasses.filter((c) => c.lt >= 60);
    const c5 = card(5, '장납기 월차 발주량 전달', '매월 10~15일 · 15일까지 미작성 시 경고', tbl(['발주구분', ['수량(톤)', 'r'], '상태'], lg.map((c) => `<tr><td class="nm">${esc(c.key)}</td><td class="r"><input class="sj-in" data-val="${esc('lg|' + c.key)}" value="${esc(val('lg|' + c.key))}" size="7" placeholder="톤"></td><td>${val('lg|' + c.key) ? '<span class="sj-b ok">● 작성</span>' : +D.today.slice(8) > 15 ? '<span class="sj-b bad">● 미작성</span>' : '<span class="sj-b w">● 작성 대기</span>'}</td></tr>`)));
    return c1 + c2 + `<div class="sj-g2">${c3}<div>${c4}${c5}</div></div>`;
  }

  /* ---------- ⑤ 재고 ---------- */
  function stock() {
    const Bk = D.bridge.filter((x) => inPl(x.eng[0]));
    const rows = Bk.map((x) => { const st = x.endDays == null || !x.cap ? null : x.endDays <= x.cap ? '정상' : x.endDays <= x.cap + 5 ? '주의' : '경고'; const w = x.cap ? Math.min(100, (x.endDays || 0) / (x.cap * 1.6) * 100) : 0;
      return `<tr><td class="nm">${esc(x.name)}</td><td><span class="sj-tag">${esc(x.type)}</span></td><td class="r">${T(x.begin)}</td><td class="r">+${T(x.prod)}</td><td class="r">−${T(x.sales)}</td><td class="r"><b>${T(x.end)}</b></td><td class="r">${T(x.target)}</td><td style="min-width:160px"><div class="sj-bar"><i style="width:${w}%;background:${st === '경고' ? 'var(--bad)' : st === '주의' ? 'var(--warn)' : 'var(--good)'}"></i>${x.cap ? `<u style="left:${100 / 1.6}%"></u>` : ''}</div><small>${x.endDays ?? '–'} / ${x.cap ?? '–'}일</small></td><td class="c">${B(st)}</td></tr>`; });
    const c1 = card(1, `그룹별 재고 브릿지 — ${+D.month.slice(5)}월 예상`, '기초 + 생산 계획 − 판매 계획 = 예상 기말 E · 막대 = 재고일수 vs 상한(검은 선)', tbl(['그룹', '유형', ['기초', 'r'], ['+ 생산', 'r'], ['− 판매', 'r'], ['= 예상 기말', 'r'], ['목표 T', 'r'], '재고일수 / 상한', ['상태', 'c']], rows)
      + '<p class="sj-foot">통합 계획(엔진) 7개 그룹 단위 — 컬러 수출 3개 그룹(건재수출·가전수출·가전내수)·컬러건재 주문재/계획재는 엔진이 합쳐 계산해 그룹 합으로 표시. 계획재 단독은 아래 ④</p>');
    const t = D.trend, ks = Object.keys(t.v).filter((k) => inPl(k[0]));
    const col = { G수출: '#2457c5', G국내: '#1d7a5a', G자동차: '#6b7280', G자가재: '#a2560a', C수출: '#7c3aed', C건재: '#c0262d', C수요: '#0e7490' };
    const NM = { G수출: '도금수출', G국내: '도금국내', G자동차: '자동차', G자가재: '도금 자가재', C수출: '컬러수출', C건재: '컬러건재', C수요: '수요개발' };
    const W = 620, H = 230, L = 40, R = 14, Tp = 12, Bt = 28, n = t.months.length, ymax = 35;
    const x = (i) => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R), y = (v) => Tp + (1 - Math.min(v, ymax) / ymax) * (H - Tp - Bt);
    const svg = `<svg class="sj-svg" viewBox="0 0 ${W} ${H}" width="100%">${[0, 10, 20, 30].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}일</text>`).join('')}`
      + t.months.map((m, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${m.slice(2).replace('-', '.')}</text>`).join('')
      + ks.map((k) => `<polyline points="${t.v[k].map((v, i) => (v == null ? '' : `${x(i)},${y(v)}`)).join(' ')}" fill="none" stroke="${col[k]}" stroke-width="2"/>${t.v[k].map((v, i) => (v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${col[k]}"><title>${NM[k]} ${t.months[i]} ${v}일</title></circle>`)).join('')}`).join('') + '</svg>'
      + `<div class="legend" style="font-size:13px">${ks.map((k) => `<span style="margin-right:12px"><i style="display:inline-block;width:14px;height:3px;background:${col[k]};vertical-align:middle;margin-right:4px"></i>${NM[k]}${t.cap[k] ? ` (상한 ${t.cap[k]}일)` : ''}</span>`).join('')}</div>`;
    const c2 = card(2, '월별 재고일수 추이', `${t.months[0]} ~ ${t.months[n - 1]} 통합 계획 예상 월말`, svg);
    const whc = ['C', 'G'].filter(inPl).map((p) => { const w = D.wh[p], r = w.cur / w.cap * 100; return `<div class="sj-gb"><div class="h"><span>${p === 'C' ? '컬러' : '도금'} 창고</span><b class="${r > 100 ? 'neg' : r > 90 ? 'wrn' : 'pos'}">${kt(w.cur)} / ${kt(w.cap)} (${Math.round(r)}%)</b></div><div class="sj-bar"><i style="width:${Math.min(100, r / 1.3)}%;background:${r > 100 ? 'var(--bad)' : r > 90 ? 'var(--warn)' : 'var(--good)'}"></i><u style="left:${100 / 1.3}%"></u></div><div class="sj-foot" style="margin:2px 0 0">${w.parts.map((q) => `${esc(q[0])} ${kt(q[1])}`).join(' · ')}</div></div>`; }).join('');
    const c3 = card(3, '창고 상한 (max 목표재고)', '판생속보 현재 재고(소재+제품) ÷ 상한', whc + '<p class="sj-foot">검은 선 = 100% · 90% 이상 주의 · 100% 초과 시 판생 경영층 보고 · 상한 = PDF 예시값(임시)</p>');
    const r = D.r15, cnt = r.cnt || {};
    const c4 = card(4, '계획재 사양 상태', `R15 ${r.n || '-'}개 사양 · 실재고 ${T(r.stock)} / 목표 ${T(r.target)}톤 (${r.target ? Math.round(r.stock / r.target * 100) : '-'}%)`,
      `<div class="sj-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:0">${[['정상 생산', cnt.ok], ['목표 초과(생산 중단 대상)', cnt.over], ['생산 뒤처짐', cnt.behind], ['부족·결품 우려', cnt.short]].map(([k, v]) => `<div class="sj-k"><div class="t">${k}</div><div class="v">${v ?? 0}</div></div>`).join('')}</div><p class="sj-foot">계획재 화면(R15 운영안) 판정 기준 · 재개 예정·제외(6개월 6톤 미만) 구분은 R15 지침서 규칙 연결 후 추가</p>`);
    const c5 = card(5, '출하 예정 없는 재고', '출하오더 비연결 가용재고 · 180일 도달 전 처리', wait('재고 ↔ 출하오더 연결 조회(MES 재고현황 재고구분·재고일수) 추가 필요 — 원격 조회 목록에 넣어 사내 PC 다음 실행부터 받음'));
    return c1 + `<div class="sj-g2">${c2}<div>${c3}${c4}</div></div>` + c5;
  }

  /* ---------- ⑥ 월 실적 마감 ---------- */
  function close() {
    const C = D.close, R = C.rows.filter((x) => inPl(x.eng[0]));
    const df = (a, p) => (a == null || p == null ? '–' : `<span class="${a - p < -p * 0.05 ? 'neg' : a - p > p * 0.1 ? 'wrn' : ''}">${a - p >= 0 ? '+' : ''}${n0(a - p)}</span>`);
    const rows = R.map((x) => `<tr><td class="nm">${esc(x.name)}</td><td class="r">${T(x.salesPlan)}</td><td class="r">${T(x.salesAct)}</td><td class="r">${df(x.salesAct, x.salesPlan)}</td><td class="r">${T(x.prodPlan)}</td><td class="r">${T(x.prodAct)}</td><td class="r">${df(x.prodAct, x.prodPlan)}</td><td class="r">${T(x.endPlan)}</td><td class="r">${T(x.endAct)}</td><td class="r">${df(x.endAct, x.endPlan)}</td></tr>`);
    const R2 = R.filter((x) => x.eng !== 'G자가재'), s = (k) => R2.reduce((a, x) => a + (x[k] || 0), 0), sb = (k1, k2) => R2.filter((x) => x[k1] != null && x[k2] != null).reduce((a, x) => [a[0] + x[k1], a[1] + x[k2]], [0, 0]);
    rows.push(`<tr class="tot"><td>합계<small class="muted"> 자가재 제외</small></td><td class="r">${T(s('salesPlan'))}</td><td class="r">${T(s('salesAct'))}</td><td class="r">${df(s('salesAct'), s('salesPlan'))}</td><td class="r">${T(s('prodPlan'))}</td><td class="r">${T(s('prodAct'))}</td><td class="r">${df(s('prodAct'), s('prodPlan'))}</td><td class="r">${T(s('endPlan'))}</td><td class="r">${T(s('endAct'))}</td><td class="r">${df(s('endAct'), s('endPlan'))}</td></tr>`);
    const c1 = card(1, `판매·생산·재고 대사표 — ${C.month.slice(2).replace('-', '.')}월`, '단위 톤 · 차이 = 실적 − 계획 · 판매 −5% 이하 빨강, 재고 +10% 이상 주황', tbl(['그룹', ['판매 계획', 'r'], ['판매 실적', 'r'], ['차이', 'r'], ['생산 계획', 'r'], ['생산 실적', 'r'], ['차이', 'r'], ['기말재고 계획', 'r'], ['기말재고 실적', 'r'], ['차이', 'r']], rows)
      + `<p class="sj-foot">판매 실적 = MES 출하(선적월) · 생산 실적 = 실적 코일 그룹 합(도금은 재계획 때 실적으로 맞춘 날) · 기말재고 실적 = ${+D.month.slice(5)}월 기초(재고현황) · 계획 = 현재 통합 계획의 ${+C.month.slice(5)}월 값(월초 확정 판 이력은 11월부터 쌓음 — 다음 달 마감부터 월초 판 기준)</p>`);
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
