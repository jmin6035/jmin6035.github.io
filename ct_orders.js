/* 02 수주·납기 통합(11/4 2차 진단 2·5·11장): 도금 주문진도 + 컬러 주문·납기 → 한 주문 모델(ui/ct.js CT.orders)
   하위 화면 = 주소 #뒤(메뉴 탭과 같음, 화면 안 탭 없음): #status 수주 현황 · #risk 납기 위험 · #track 주문진도 · #cal 납기 캘린더
   출하 확인 불가(출하 실적 연결 없음)는 완료로 보지 않음 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['status', 'risk', 'track', 'cal'];
  const OPEN = ['위험', '주의', '판정 불가'];
  const F = { grp: '', pl: '', risk: '', ful: '', q: '', done: false, by: false, sk: 'risk', dir: 1, lim: 200 };
  const R = { cause: '', sk: 'risk', dir: 1, lim: 200 };
  const T = { id: null, q: '', tag: '' };
  let calOff = 0, D0 = null, M = null, L = [], byId = {};
  const plName = (o) => `${o.pl === 'G' ? '도금' : '컬러'} ${o.line || ''}`.trim();
  const imp = (o) => (o.pl === 'G' && o.ful !== '생산 전' && o.ful !== '생산 중' ? (o.unshipT || 0) : (o.remT || 0));   // 영향 톤: 생산 끝난 도금 = 미출하, 그 외 = 잔량
  const sum = (A, f) => A.reduce((s, o) => s + (f(o) || 0), 0);
  const leq = (d, lim) => d && d <= lim;
  const dow = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (s) => dow[new Date(s + 'T00:00:00Z').getUTCDay()];
  const open = (o) => CT.panel(CT.orderDetail(o), o.id);

  /* 출하 근거 한 줄 — 출하가 나오는 곳마다 */
  function shipNote() {
    const part = (L, nm) => { const d_ = L.filter((o) => CT.inScope(o.pl) && !['생산 전', '생산 중'].includes(o.ful)); return d_.length ? `${nm} 생산 끝난 ${n0(d_.length)}건 중 출하 연결 ${n0(d_.filter((o) => (o.fwdT || 0) > 0.5).length)}건` : ''; };
    return `<p class="ct-note co-sn">${[part(M.G, '도금'), part(M.C, '컬러')].filter(Boolean).join(' · ')} — MES 출고 실적(7/1~)을 코일번호로 주문에 연결</p>`;
  }

  /* ---------- 정렬 ---------- */
  const ACC = { id: (o) => o.id, grp: (o) => o.grp, item: (o) => o.item, remT: (o) => o.remT, imp, mat: (o) => o.matSt, eta: (o) => o.etaDone, need: (o) => o.needProd,
    due: (o) => o.due, ful: (o) => CT.FUL.indexOf(o.ful), last: (o) => o.last, cause: (o) => o.cause, dept: (o) => o.dept };
  function sorter(sk, dir, tonF) {
    if (sk === 'risk') return (a, b) => dir * ((CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || ((a.left == null ? 999 : a.left) - (b.left == null ? 999 : b.left))) || (tonF(b) - tonF(a));
    const f = ACC[sk];
    return (a, b) => { const x = f(a), y = f(b); if (x == null || x === '') return y == null || y === '' ? 0 : 1; if (y == null || y === '') return -1; return dir * (x < y ? -1 : x > y ? 1 : 0); };
  }
  const th = (k, label, st, cls = '', tip = '') => `<th class="${cls}${st.sk === k ? ' on' : ''}" data-sk="${k}" aria-sort="${st.sk === k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"${tip ? ` title="${esc(tip)}"` : ''}><button type="button">${esc(label)}<i>${st.sk === k ? (st.dir > 0 ? '▲' : '▼') : ''}</i></button></th>`;
  function bindSort(root, st, redraw) {
    root.querySelectorAll('th[data-sk] button').forEach((b) => b.onclick = () => { const k = b.parentNode.dataset.sk; if (st.sk === k) st.dir = -st.dir; else { st.sk = k; st.dir = ['remT', 'imp'].includes(k) ? -1 : 1; } st.lim = 200; redraw(); });
  }
  /* 첫 두 칸(위험·주문번호) 왼쪽 고정 — 첫 칸 폭만큼 둘째 칸을 띄움 */
  const pinLeft = (tb) => { const c = tb && tb.querySelector('thead th'); if (c) tb.style.setProperty('--c1', c.offsetWidth + 'px'); };
  function bindRows(root) {
    root.querySelectorAll('tr.ck').forEach((tr) => { tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) open(o); }; });
    CT.keyRows(root);
  }
  const more = (n, lim) => (n > lim ? `<div class="co-more"><button type="button" class="lnk" id="co-more">더 보기 (${n0(Math.min(200, n - lim))}건 더 · 남은 ${n0(n - lim)}건)</button></div>` : '');
  const matCell = (o) => `<span class="${['확보', '재고 있음'].includes(o.matSt) ? '' : o.matSt === '입고 대기' || o.matSt === '진행' ? 'co-w' : 'co-b'}">${esc(o.matSt || '-')}</span>`;
  const dueCell = (o) => `${md(o.due) || '<span class="mu">-</span>'}${o.pl === 'G' && o.exp && o.ship ? `<small>출항 ${md(o.ship)}</small>` : ''}`;
  const idCell = (o, sub) => `<td class="id sk s2">${esc(o.id)}<small>${esc(sub)}</small></td>`;

  /* ---------- #status 수주 현황 ---------- */
  function statusRows() {
    let A = L.filter((o) => (F.done || !o.closed) && (!F.grp || o.grp === F.grp) && (!F.pl || o.pl === F.pl) && (!F.risk || o.risk === F.risk) && (!F.ful || o.ful === F.ful));
    if (F.q) { const q = F.q.toUpperCase(); A = A.filter((o) => [o.id, o.item, o.size, o.cus, o.man, o.grp].join(' ').toUpperCase().includes(q)); }
    const s = sorter(F.sk, F.dir, (o) => o.remT || 0);
    return F.by ? A.sort((a, b) => (a.grp < b.grp ? -1 : a.grp > b.grp ? 1 : 0) || s(a, b)) : A.sort(s);
  }
  const HEAD_S = () => `<thead><tr>${th('risk', '상태', F, 'sk s1')}${th('id', '주문번호', F, 'sk s2')}${th('grp', '판매그룹', F)}${th('item', '품명·규격', F)}${th('remT', '수주잔량(t)', F, 'r')}`
    + `${th('mat', '소재 확보', F)}${th('eta', '생산 완료 예정일', F)}${th('need', '생산요청일', F, '', '수출 출항 −1 · 내수 납기 −1 · 컬러 = 납기')}${th('due', '출하완료일', F, '', '납기(수출은 출항일 같이 표시)')}${th('ful', '진행 단계', F)}</tr></thead>`;
  const rowS = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="sk s1">${CT.badge(o)}</td>${idCell(o, plName(o))}`
    + `<td>${esc(o.grp)}${o.grpEst ? '<small>추정</small>' : ''}</td><td class="w">${esc(o.item || '-')}<small>${esc(o.size)}</small></td><td class="r"><b>${n1(o.remT)}</b></td>`
    + `<td>${matCell(o)}</td><td>${o.etaDone ? md(o.etaDone) : '<span class="mu">-</span>'}${o.etaSrc ? `<small>${esc(o.etaSrc)}</small>` : ''}</td>`
    + `<td>${md(o.needProd) || '<span class="mu">-</span>'}</td><td>${dueCell(o)}</td><td>${CT.fulBadge(o.ful)}</td></tr>`;
  function drawStatus() {
    const A = statusRows(), V = A.slice(0, F.lim);
    let body = '', g = null;
    for (const o of V) {
      if (F.by && o.grp !== g) { g = o.grp; const G = A.filter((x) => x.grp === g); body += `<tr class="co-gh"><td colspan="10"><b>${esc(g)}</b> ${n0(G.length)}건 · 잔량 ${n0(sum(G, (x) => x.remT))}t${G.some((x) => x.risk === '위험') ? ` · <span class="co-b">위험 ${G.filter((x) => x.risk === '위험').length}</span>` : ''}</td></tr>`; }
      body += rowS(o);
    }
    $('co-cnt').textContent = `${n0(A.length)}건 · 잔량 ${n0(sum(A, (o) => o.remT))}t`;
    $('co-tbl').innerHTML = `<table class="ct-t co-t">${HEAD_S()}<tbody>${body || '<tr><td colspan="10" class="mu">해당 주문이 없습니다.</td></tr>'}</tbody></table>` + more(A.length, F.lim);
    const tb = $('co-tbl').querySelector('table'); pinLeft(tb); bindSort($('co-tbl'), F, drawStatus); bindRows($('co-tbl'));
    const mb = $('co-more'); if (mb) mb.onclick = () => { F.lim += 200; drawStatus(); };
  }
  function viewStatus() {
    const asOf = M.asOf, w0 = CT.wed(asOf), w1 = CT.addD(w0, 6), act = L.filter((o) => !o.closed);   // 금주 = 수요일 시작 7일(11/5 사용자)
    const risk = act.filter((o) => o.risk === '위험');
    const inW = (d) => d && d >= w0 && d <= w1;
    const wP = act.filter((o) => inW(o.needProd) && (o.ful === '생산 전' || o.ful === '생산 중') && o.risk !== '판정 불가');
    const shipD = (o) => o.ship || o.due;                                        // 출하 일정 = 출항(수출) · 납기(내수)
    const wAll = act.filter((o) => o.pl === 'G' && inW(shipD(o)));
    const wS = wAll.filter((o) => o.ful !== '출하 확인 불가' && o.risk !== '판정 불가');
    const wNo = wAll.filter((o) => o.ful === '출하 확인 불가');
    const wC = act.filter((o) => o.pl === 'C' && inW(o.due));
    const wl = `${md(w0)}(수)~${md(w1)}(화)`;
    const k = CT.kpis([
      { label: '수주잔량', v: n0(sum(act, (o) => o.remT)), unit: 't', sub: `${n0(act.length)}건 · 출하 완료 제외`, tone: 'info' },
      { label: '금주 생산완료 필요', v: n0(sum(wP, (o) => o.remT)), unit: 't', sub: `${n0(wP.length)}건 · ${wl} 생산 필요일`, tone: wP.length ? 'warn' : 'ok' },
      ...(CT.inScope('G') ? [{ label: '금주 출하 필요(도금)', v: n0(sum(wS, (o) => o.unshipT)), unit: 't', sub: `${n0(wS.length)}건 · ${wl} 출항·납기${wNo.length ? `<br>출하 실적 없음 ${n0(wNo.length)}건 별도(생산 완료)` : ''}${wC.length ? `<br>컬러 ${n0(wC.length)}건 출하 실적 없음` : ''}`, tone: 'info' }] : [{ label: '금주 납기(컬러)', v: n0(sum(wC, (o) => o.remT)), unit: 't', sub: `${n0(wC.length)}건 · ${wl} 납기 · 컬러 주문별 출하 자료 없음` }]),
      { label: '납기 지연 예상', v: n0(risk.length), unit: '건', sub: `${n0(sum(risk, imp))}t`, tone: risk.length ? 'bad' : 'ok', href: '#risk' },
    ]);
    const grps = [...new Set(L.map((o) => o.grp))].sort();
    const sc = CT.scope(), plLock = sc !== 'all';
    if (plLock) F.pl = '';
    const sel = (id, lab, cur, opts) => `<label class="co-sel"><span>${lab}</span><select id="${id}"${id === 'co-pl' && plLock ? ' disabled title="상단 범위(도금/컬러)를 따름"' : ''}><option value="">전체</option>${opts.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    return k + shipNote()
      + `<div class="co-f1">${sel('co-grp', '판매그룹', F.grp, grps.map((g) => [g, g]))}${sel('co-pl', '공정', plLock ? sc : F.pl, [['G', '도금'], ['C', '컬러']])}`
      + `${sel('co-risk', '상태', F.risk, CT.RISK.map((r) => [r, CT.rl(r)]))}${sel('co-ful', '진행 단계', F.ful, CT.FUL.map((r) => [r, CT.fl(r)]))}</div>`
      + `<div class="co-f2"><input id="co-q" type="search" placeholder="주문번호·품명·고객·담당" value="${esc(F.q)}" aria-label="주문 찾기">`
      + `<label class="nw"><input type="checkbox" id="co-done"${F.done ? ' checked' : ''}> 완료 포함</label><label class="nw"><input type="checkbox" id="co-by"${F.by ? ' checked' : ''}> 판매그룹 묶음</label><span class="cnt" id="co-cnt"></span></div>`
      + '<div class="co-tw" id="co-tbl"></div>';
  }
  function bindStatus() {
    const on = (id, f) => { const e = $(id); if (e) e.onchange = (ev) => { f(ev.target); F.lim = 200; drawStatus(); }; };
    on('co-grp', (e) => { F.grp = e.value; }); on('co-pl', (e) => { F.pl = e.value; }); on('co-risk', (e) => { F.risk = e.value; }); on('co-ful', (e) => { F.ful = e.value; });
    on('co-done', (e) => { F.done = e.checked; }); on('co-by', (e) => { F.by = e.checked; });
    $('co-q').oninput = (e) => { F.q = e.target.value.trim(); F.lim = 200; clearTimeout(bindStatus.t); bindStatus.t = setTimeout(drawStatus, 200); };
    drawStatus();
  }

  /* ---------- #risk 납기 위험 ---------- */
  const riskAll = () => L.filter((o) => OPEN.includes(o.risk));
  function drawRisk() {
    const A = riskAll().filter((o) => !R.cause || o.cause === R.cause).sort(sorter(R.sk, R.dir, imp)), V = A.slice(0, R.lim);
    const rows = V.map((o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="sk s1">${CT.badge(o)}</td>`
      + `<td>${o.last ? `<b>${md(o.last)}</b> <span class="lf">${CT.leftTxt(o)}</span>` : '<span class="mu">-</span>'}</td>${idCell(o, o.grp + ' · ' + plName(o))}`
      + `<td class="r"><b>${n1(imp(o))}</b></td><td>${md(o.needProd) || '<span class="mu">-</span>'}</td><td>${dueCell(o)}</td>`
      + `<td>${esc(CT.why(o) || '-')}</td><td>${esc(o.dept || '-')}</td><td><span class="co-act">미조치</span></td></tr>`).join('');
    $('co-tbl').innerHTML = `<table class="ct-t co-t"><thead><tr>${th('risk', '상태', R, 'sk s1')}${th('last', '조치 마감일', R, '', '이 날까지 조치해야 납기를 지킬 수 있는 마지막 날')}${th('id', '주문번호·판매그룹', R, 'sk s2')}`
      + `${th('imp', '해당 물량(t)', R, 'r', '생산 끝난 도금 = 미출하 · 그 외 = 잔량')}${th('need', '생산요청일', R)}${th('due', '출하완료일', R)}${th('cause', '근거', R)}${th('dept', '조치 부서', R)}<th>조치 상태</th></tr></thead>`
      + `<tbody>${rows || '<tr><td colspan="9" class="mu">해당 주문이 없습니다.</td></tr>'}</tbody></table>` + more(A.length, R.lim);
    $('co-cnt').textContent = `${n0(A.length)}건 · ${n0(sum(A, imp))}t`;
    pinLeft($('co-tbl').querySelector('table')); bindSort($('co-tbl'), R, drawRisk); bindRows($('co-tbl'));
    const mb = $('co-more'); if (mb) mb.onclick = () => { R.lim += 200; drawRisk(); };
    document.querySelectorAll('.co-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === R.cause)));
  }
  function viewRisk() {
    const A = riskAll(), asOf = M.asOf;
    const red = A.filter((o) => o.risk === '위험'), warn = A.filter((o) => o.risk === '주의'), past = A.filter((o) => o.last && o.last < asOf && o.risk !== '판정 불가'), na = A.filter((o) => o.risk === '판정 불가');
    const k = CT.kpis([
      { label: '납기 지연 예상', v: n0(red.length), unit: '건', sub: `점검 필요 ${n0(warn.length)}건`, tone: red.length ? 'bad' : 'ok' },
      { label: '해당 물량', v: n0(sum(red.concat(warn), imp)), unit: 't', sub: `지연 예상 ${n0(sum(red, imp))}t · 점검 필요 포함`, tone: red.length ? 'bad' : 'ok' },
      { label: '조치일 지남', v: n0(past.length), unit: '건', sub: `${n0(sum(past, imp))}t · 조치 마감일 지남`, tone: past.length ? 'bad' : 'ok' },
      { label: '자료 확인 필요', v: n0(na.length), unit: '건', sub: '납기·주문량 없음 · 장기 미종결 · 출하 실적 없음', tone: na.length ? 'warn' : 'ok' },
    ]);
    const chips = [['', '전체', A.length], ...Object.keys(CT.CAUSE).map((c) => [c, CT.CAUSE[c], A.filter((o) => o.cause === c).length])]
      .map(([c, n, cnt]) => `<button type="button" class="co-chip" data-c="${c}" aria-pressed="${c === R.cause}"${cnt || !c ? '' : ' disabled'}>${esc(n)} <b>${n0(cnt)}</b></button>`).join('');
    return k + shipNote() + `<div class="co-chips" role="group" aria-label="원인">${chips}<span class="cnt" id="co-cnt"></span></div><div class="co-tw" id="co-tbl"></div>`;
  }
  function bindRisk() {
    document.querySelectorAll('.co-chip').forEach((b) => b.onclick = () => { R.cause = b.dataset.c; R.lim = 200; drawRisk(); });
    drawRisk();
  }

  /* ---------- #track 주문진도 ---------- */
  // 11/5 사용자 '왜 이런 식으로 화면 구성을 한 거지?' — 상세를 한 줄 상황 → 단계 흐름(가로) → 핵심 숫자 → 속성 격자 순으로, 화면 폭 전체 사용
  /* 매치없음 컬러 주문의 소재: 소재발주현황(SMMTA1080 = 발주·입고 표) 발주처·발주일·입고납기 / 재고기반(계약번호 6번째 C) / 발주 없음 */
  function poLine(o) {
    if (o.pl !== 'C' || (o.mchT || 0) > 0.0005) return '';
    if (o.po && o.po.no) return `발주 ${esc(o.po.sup || '')} · ${md(o.po.ordDt) || '-'} 발주 · 입고납기 <b>${md(o.po.dle) || '-'}</b>${o.po.entT ? ` · 입고 ${n1(o.po.entT)}t` : ''}`;
    if (o.route === '재고기반') return `재고기반 주문서 · 소재 재고 ${n1(o.matT || 0)}t`;
    if (o.self) return `자가재(도금) ${esc(o.self)}`;
    return '<span class="ct-neg">소재 발주 없음</span>';
  }
  /* 아래 목록 필터 = 위 요약과 같은 단계(11/5 사용자 '밑에 필터링하는 것도 해당 분류로 바꿔'): 컬러 = 매치 전 → 매치 완료 → 부자재 대기 → 작업지시, 도금 = 소재 상태 */
  const stageOf = (o) => (o.pl === 'C' ? catC(o.src || o) : catG(o));
  const STAGES = () => [...(CT.inScope('C') ? CATC : []), ...(CT.inScope('G') ? CATG : [])].map(([k, c]) => [k, c]);
  function trackBase() {
    if (T.q) { const q = T.q.toUpperCase(); return L.filter((o) => [o.id, o.item, o.cus, o.man].join(' ').toUpperCase().includes(q)).sort(CT.riskSort).slice(0, 200); }
    return L.filter((o) => !o.closed && (o.remT || 0) > (o.pl === 'C' ? 0.0005 : 0.5) && (!PS.line || o.line === PS.line)).sort(CT.riskSort);   // 위 요약과 같은 범위
  }
  function trackList() { const A = trackBase(); return T.tag ? A.filter((o) => stageOf(o) === T.tag) : A; }
  function drawTrackList() {
    const B = trackBase(), A = trackList(), cnt = {}, ton = {};
    B.forEach((o) => { const k = stageOf(o); cnt[k] = (cnt[k] || 0) + 1; ton[k] = (ton[k] || 0) + (o.remT || 0); });
    if (T.tag && !cnt[T.tag]) T.tag = '';
    $('co-tc').innerHTML = [['', '전체', B.length, B.reduce((a, o) => a + (o.remT || 0), 0), '']].concat(STAGES().filter(([k]) => cnt[k]).map(([k, c]) => [k, k, cnt[k], ton[k], c]))
      .map(([k, nm, v, t, c]) => `<button type="button" class="co-chip" data-k="${esc(k)}" aria-pressed="${(T.tag || '') === k}">${c ? `<i class="sw" style="background:${c}"></i>` : ''}${esc(nm)}<b>${n0(v)}</b><small>${n0(t)}t</small></button>`).join('');
    $('co-tc').querySelectorAll('button').forEach((b) => { b.onclick = () => { T.tag = b.dataset.k; drawTrackList(); const f = trackList()[0]; if (f && !trackList().some((o) => o.id === T.id)) pickTrack(f.id); }; });
    const A2 = trackList();
    const A3 = A2.slice(0, 300).sort((x, y) => String(x.grp).localeCompare(String(y.grp)) || CT.riskSort(x, y)); let gp = null;   // 판매그룹별로 묶어(11/5 주문진도)
    $('co-tl').innerHTML = A2.length ? A3.map((o) => `${o.grp !== gp ? `<li class="co-gh" role="presentation">${esc(gp = o.grp)} <small>${n0(A3.filter((x) => x.grp === o.grp).length)}건</small></li>` : ''}<li class="ck${o.id === T.id ? ' on' : ''}" data-id="${esc(o.id)}" role="option" aria-selected="${o.id === T.id}">`
      + `<div class="a">${CT.badge(o)}<b>${esc(o.id)}</b></div><div class="b"><span>${esc(o.grp)} · ${esc(plName(o))}</span><span>납기 <b>${md(o.due) || '-'}</b> · 잔량 <b>${n1(o.remT || 0)}t</b></span></div>${poLine(o) ? `<div class="b po">${poLine(o)}</div>` : ''}</li>`).join('')
      : '<li class="mu">해당 주문이 없습니다.</li>';
    $('co-tn').textContent = T.q ? `찾기 ${n0(A2.length)}건` : `${T.tag || '잔여 있는 주문 전체'} ${n0(A2.length)}건 · ${n0(A2.reduce((a, o) => a + (o.remT || 0), 0))}t${A2.length > 300 ? ' · 앞 300건 표시' : ''}`;
    $('co-tl').querySelectorAll('li.ck').forEach((li) => { li.onclick = () => pickTrack(li.dataset.id); });
    CT.keyRows($('co-tl'));
    return A;
  }
  /* 한 줄 상황: 왜 · 납기와 오늘 · 물량 */
  function storyOf(o) {
    const asOf = M.asOf, dd = o.due ? CT.diff(o.due, asOf) : null;
    const why = o.risk === '정상' ? '정상 진행 중' : o.cause === 'data' ? `자료 확인 필요(${o.dataWhy || '자료 누락'})`
      : ({ mat: o.matSt === '미발주' ? '소재를 아직 발주하지 않아' : o.pl === 'C' && o.matSt === '미확보' ? '소재가 없어' : '소재 입고가 늦어',
        cap: '생산 편성일이 생산 필요일보다 늦어', plate: '자가재(도금) 생산이 늦어', ship: '생산은 끝났지만 출하가 늦어' })[o.cause] || '확인 필요';
    const due = dd == null ? '납기 없음' : dd < 0 ? `${md(o.due)} 납기에서 <b class="ct-neg">${-dd}일 지남</b>` : dd === 0 ? `<b class="ct-neg">오늘 납기</b>` : `${md(o.due)} 납기까지 ${dd}일`;
    const pdone = !['생산 전', '생산 중'].includes(o.ful);
    const qty = pdone ? `${n1(o.ordT || 0)}t 중 ${n1(o.prodT || 0)}t 생산 — 생산 완료 처리됨` : `${n1(o.ordT || 0)}t 중 ${n1(o.prodT || 0)}t 생산, ${n1(o.remT || 0)}t 남음`;
    const sh = o.unshipT == null ? '생산 전' : o.ful === '출하 확인 불가' ? '출하 실적 없음' : o.ful === '출하 완료' ? '출하 완료' : (o.fwdT || 0) > 0.5 ? `출하 ${n1(o.fwdT)}t · 미출하 ${n1(o.unshipT)}t` : '아직 출하 전';
    return `${esc(why)} — ${due} · ${qty} · ${sh}`;
  }
  function drawTrackDetail() {
    const o = T.id && byId[T.id], box = $('co-td');
    if (!o) { box.innerHTML = '<p class="ct-note">왼쪽에서 주문을 고르거나 주문번호로 찾으세요.</p>'; return; }
    const asOf = M.asOf, ST = { done: '완료', cur: '진행 중', todo: '대기', na: '해당 없음' };
    const dateCell = (d, plan, st) => {
      if (!d && !plan) return '';
      const late = d && plan && d > plan, lb = st === 'done' ? '실제' : d && d < asOf ? '예정(지남)' : '예정';
      return `${d ? `<span class="${late ? 'ct-neg' : ''}">${lb} <b>${md(d)}</b></span>` : ''}${plan ? `<span>필요 <b>${md(plan)}</b></span>` : ''}`;
    };
    const steps = o.steps.filter((s) => s.st !== 'na' || /출하/.test(s.k));
    const tl = `<ol class="co-flow" style="--n:${steps.length}">${steps.map((s) => `<li class="${s.st}"><i></i><div class="k">${esc(s.k)}</div>`
      + `<div class="s">${s.st === 'na' && /출하/.test(s.k) ? '실적 없음' : ST[s.st]}</div><div class="d">${dateCell(s.d, s.plan, s.st)}</div>${s.note ? `<div class="n">${esc(s.note)}</div>` : ''}</li>`).join('')}</ol>`;
    const left = o.last ? (CT.diff(o.last, asOf) < 0 ? `<em class="ct-neg">${-CT.diff(o.last, asOf)}일 지남</em>` : (CT.diff(o.last, asOf) === 0 ? `<em class="ct-neg">오늘</em>` : `<em>D-${CT.diff(o.last, asOf)}</em>`)) : '';
    const fig = (k, v, u, sub) => `<div class="f"><span>${k}</span><b>${v}${u ? `<small>${u}</small>` : ''}</b>${sub ? `<div>${sub}</div>` : ''}</div>`;
    const figs = `<div class="co-figs">${fig('수주량', n1(o.ordT || 0), 't')}${fig('생산', n1(o.prodT || 0), 't')}${fig('잔량', n1(o.remT || 0), 't')}`
      + fig('미출하', o.unshipT == null ? '-' : n1(o.unshipT), o.unshipT == null ? '' : 't', o.unshipT == null || o.ful === '출하 확인 불가' ? '출하 실적 없음' : '')
      + fig('납기', md(o.due) || '-', '', o.pl === 'G' && o.exp && o.ship ? `출항 ${md(o.ship)}` : '') + fig('생산 필요일', md(o.needProd) || '-', '')
      + fig('조치 마감일', md(o.last) || '-', '', left) + '</div>';
    const kv = (k, v) => (v == null || v === '' ? '' : `<div class="g"><span>${esc(k)}</span><b>${v}</b></div>`);
    const grid = `<div class="co-grid">${kv('판매그룹', esc(o.grp) + (o.grpEst ? ' <small>(추정)</small>' : ''))}${kv('고객사', esc(o.cus || ''))}${kv('담당', esc(o.man || ''))}`
      + kv('공정·라인', esc(plName(o))) + kv('품목', esc(o.item)) + kv('두께×폭', esc(o.size)) + kv('지연 근거', o.cause ? esc(CT.why(o)) : '')
      + kv('조치 부서', esc(o.dept || '')) + kv('진행 단계', CT.fulBadge(o.ful)) + kv('생산 완료 예정', o.etaDone ? `${md(o.etaDone)} <small>${esc(o.etaSrc || '')}</small>` : '')
      + kv('소재', esc(o.matSt || '')) + (o.self ? kv('자가재(도금 주문)', esc(o.self)) : '') + (poLine(o) ? kv('소재 발주(SMMTA1080)', poLine(o)) : '') + (o.src && o.src.wst ? kv('작업 상태', esc(o.src.wst)) : '') + '</div>';
    box.innerHTML = `<div class="co-th"><div class="h1"><b>${esc(o.id)}</b>${CT.badge(o)}<span class="who">${[o.cus, o.grp, plName(o)].filter(Boolean).map(esc).join(' · ')}</span></div>`
      + `<p class="co-story">${storyOf(o)}</p></div>${tl}${figs}${grid}`;
  }
  function pickTrack(id) {
    T.id = id;
    $('co-tl').querySelectorAll('li.ck').forEach((li) => { const on = li.dataset.id === id; li.classList.toggle('on', on); li.setAttribute('aria-selected', String(on)); });
    drawTrackDetail();
    if (matchMedia('(max-width: 900px)').matches) $('co-td').scrollIntoView({ block: 'start' });
  }
  /* 주문진도 요약(11/5 사용자 'SSCHC1010 작업지시대상선정 요약 — 우리로 치면 주문진도'): 라인별 · 전체
     원본 전체 = 잔여 있음 + 1,000kg 이하(제외) + 잔여 없음(제외). 매치있음 = 매치량>0(이미 생산에 쓴 소재 제외), 아래 작업 상태 4줄은 안 끝난 작업지시(PF_CC_WORK_ORD) 기준.
     작업가능일 = 매치된 소재로 만들 수 있는 양(주문별 min(잔여, 매치)) ÷ 라인 하루 능력 */
  const CAPC = { '1CCL': 480, '2CCL': 400, '3CCL': 200, '4CCL': 250 }, CAPG = { '1CGL': 719, '2CGL': 927 };
  let PS = { line: '' };
  /* 범주(11/5 사용자 '주문진도 표 다시 이쁘게'): 잔여량을 상태별로 나눠 한 막대(작업 가능 쪽 = 초록 계열, 대기 = 노랑, 없음 = 빨강) */
  /* 11/5 사용자 '주문 잔여량(총량) - 소재 매치 전 - 소재 매치 완료 - 부자재 대기 - 작업지시 내려간 양 이렇게로 바꿔': 단계 순서대로 나눔(주문마다 한 단계, 합 = 총량) */
  const CATC = [['소재 매치 전', '#d03b3b', '매치된 소재 없음 — 아래는 소재 상태'], ['소재 매치 완료', '#2a78d6', '매치 끝, 작업지시 확정 전(편성 중 포함)'], ['부자재 대기', '#eda100', '작업지시 있으나 도료·PF 입고 대기'], ['작업지시 내려감', '#008300', '확정된 작업지시(작업대기) — 바로 생산']];
  const MSUB = [['재고 있음', '규격 맞는 소재 재고 있음 — 매치만 하면 됨'], ['발주 진행', '소재 발주됨 — 입고 대기'], ['발주 없음', '재고·발주 모두 없음 — 소재 발주 필요']];
  const msub = (r) => (r.st === '소재 있음' ? '재고 있음' : r.po || r.st === '입고 대기' ? '발주 진행' : '발주 없음');
  const CATG = [['소재 입고 완료', '#008300', '소재가 들어와 바로 생산 가능'], ['소재 진행', '#2a78d6', 'F/H 발주·포스코 진행 중'], ['소재 입고 지연', '#eb6834', '필요 입고일보다 늦음'], ['소재 미발주', '#d03b3b', '소재 발주 전']];
  const catC = (r) => (!(r.mchT > 0.0005) ? '소재 매치 전' : r.wst === '작업대기' ? '작업지시 내려감' : r.wst === '부자재입고대기' ? '부자재 대기' : '소재 매치 완료');
  const catG = (o) => ({ 확보: '소재 입고 완료', 진행: '소재 진행', 지연: '소재 입고 지연', 미발주: '소재 미발주' })[o.matSt] || '소재 진행';
  function psData(sel) {   // sel = 라인 목록 → {pl, rows[{cat,rem,n}], tot, can, cap, ex, tbl}
    const cc = (D0 || {}).cc_order_progress, out = [];
    const cl = sel.filter((l) => CAPC[l]), gl = sel.filter((l) => CAPG[l]);
    if (cc && cl.length) {
      const shut = new Set((M.C || M.all || []).filter((o) => o.pl === 'C' && o.closed).map((o) => o.src));   // 전량 출하·잔량 미생산 마감(MES 종결 전) — 아래 목록과 같게 뺌
      const R0 = (cc.rows || []).filter((r) => cl.includes(r.line)), R = R0.filter((r) => !shut.has(r)), cap = cl.reduce((a, l) => a + CAPC[l], 0);
      const ex = cl.reduce((a, l) => { const e = (cc.excl || {})[l] || {}; return { zero: a.zero + ((e.zero || [])[0] || 0), small: a.small + ((e.small || [])[0] || 0), zT: a.zT + ((e.zero || [])[1] || 0), sT: a.sT + ((e.small || [])[1] || 0) }; }, { zero: 0, small: 0, zT: 0, sT: 0 });
      const can = R.filter((r) => r.mchT > 0.0005).reduce((a, r) => a + Math.min(+r.remT || 0, +r.mchT || 0), 0);
      const exA = (k) => cl.reduce((a, l) => { const e = (((cc.excl || {})[l] || {})[k]) || []; return a.map((v, i) => v + (+e[i] || 0)); }, [0, 0, 0, 0, 0]);
      out.push({ pl: 'C', nm: '컬러', R, cap, can, ex: Object.assign(ex, { shut: R0.length - R.length }), exZ: exA('zero'), exS: exA('small'), cats: CATC.map(([k, c, t]) => { const rs = R.filter((r) => catC(r) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, r) => a + (+r.remT || 0), 0), rs }; }) });
    }
    if (gl.length && (D0 || {}).cg_order_progress) {
      const G = (M.G || []).filter((o) => gl.includes(o.line)), R = G.filter((o) => !o.closed && (o.remT || 0) > 0.5), cap = gl.reduce((a, l) => a + CAPG[l], 0);
      const can = R.filter((o) => o.matSt === '확보').reduce((a, o) => a + o.remT, 0);
      out.push({ pl: 'G', nm: '도금', R, cap, can, ex: { zero: G.length - R.length, small: 0, zT: 0, sT: 0 }, all: G, cats: CATG.map(([k, c, t]) => { const rs = R.filter((o) => catG(o) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, o) => a + (o.remT || 0), 0), rs }; }) });
    }
    return out;
  }
  const segBar = (cats, tall) => { const T_ = cats.reduce((a, c) => a + c.rem, 0) || 1;
    return `<div class="sb${tall ? ' tall' : ''}" role="img" aria-label="${esc(cats.filter((c) => c.rem > 0.5).map((c) => `${c.k} ${n0(c.rem)}t`).join(', '))}">${cats.filter((c) => c.rem > 0.5).map((c) => { const w = c.rem / T_ * 100;
      return `<span style="flex:${c.rem.toFixed(1)} 0 0;background:${c.c}" title="${esc(`${c.k} ${n0(c.rem)}t · ${c.n}건 (${Math.round(w)}%)`)}">${tall && w >= 7 ? `${Math.round(w)}%` : ''}</span>`; }).join('')}</div>`; };
  function psCard(d, title) {
    const tot = d.cats.reduce((a, c) => a + c.rem, 0), n = d.cats.reduce((a, c) => a + c.n, 0), days = d.cap ? d.can / d.cap : null;
    const bad = d.cats.find((c) => /없음|미발주/.test(c.k)) || { n: 0, rem: 0 }, wait = d.cats.filter((c) => !/작업대기|지시대기|입고 완료|없음|미발주/.test(c.k));
    const tile = (k, v, u, sub, tone = '') => `<div class="pt ${tone}"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div><div class="s">${sub}</div></div>`;
    const cat = (k) => d.cats.find((c) => c.k === k) || { n: 0, rem: 0, rs: [] };
    const tiles = d.pl === 'C' ? (() => {                       // 컬러: 총량 → 매치 전 → 매치 완료 → 부자재 대기 → 작업지시(단계 순서)
      const m0 = cat('소재 매치 전'), no = m0.rs.filter((r) => msub(r) === '발주 없음'), wo = cat('작업지시 내려감'), wd = d.cap ? wo.rem / d.cap : null;
      return `<div class="pts p5">${tile('주문 잔여량(총량)', n0(tot), 't', `${n0(n)}건 · 1,000kg 넘는 미생산분`)}`
        + tile('소재 매치 전', n0(m0.rem), 't', `${n0(m0.n)}건${no.length ? ` · <span class="bad">발주 없음 ${n0(no.reduce((a, r) => a + (+r.remT || 0), 0))}t</span>` : ''}`, m0.rem > 0.5 ? 'bad' : '')
        + tile('소재 매치 완료', n0(cat('소재 매치 완료').rem), 't', `${n0(cat('소재 매치 완료').n)}건 · 작업지시 확정 전`, '')
        + tile('부자재 대기', n0(cat('부자재 대기').rem), 't', `${n0(cat('부자재 대기').n)}건 · 도료·PF 입고 대기`, cat('부자재 대기').rem > 0.5 ? 'warn' : '')
        + tile('작업지시 내려간 양', n0(wo.rem), 't', `${n0(wo.n)}건${wd != null ? ` · 하루 ${n0(d.cap)}t 기준 <b>${wd.toFixed(1)}일</b>분` : ''}`, 'ok') + '</div>';
    })() : `<div class="pts">${tile('주문잔여량', n0(tot), 't', `${n0(n)}건 · 미생산 주문`)}`
      + tile('소재 입고 → 바로 생산 가능', n0(d.can), 't', days == null ? '' : `작업가능일 <b>${days.toFixed(1)}일</b> = ${n0(d.can)} ÷ 하루 ${n0(d.cap)}t`, 'ok')
      + tile('소재 미발주', n0(bad.rem), 't', `${n0(bad.n)}건 — 소재 발주 필요`, bad.n ? 'bad' : '')
      + tile('대기', n0(wait.reduce((a, c) => a + c.rem, 0)), 't', wait.filter((c) => c.n).map((c) => `${c.k} ${n0(c.n)}건`).join(' · ') || '없음', 'warn') + '</div>';
    const leg = `<table class="ct-t pl-t"><thead><tr><th>상태</th><th class="r">건수</th><th class="r">잔여량(t)</th><th class="r">비중</th><th>뜻</th></tr></thead><tbody>${d.cats.map((c) => `<tr${c.n ? '' : ' class="mu"'}><td class="nw"><i class="sw" style="background:${c.c}"></i>${esc(c.k)}</td><td class="r">${n0(c.n)}</td><td class="r"><b>${n0(c.rem)}</b></td><td class="r">${tot ? Math.round(c.rem / tot * 100) : 0}%</td><td class="mu2">${esc(c.t)}</td></tr>`
      + (d.pl === 'C' && c.k === '소재 매치 전' ? MSUB.map(([k, t]) => { const rs = c.rs.filter((r) => msub(r) === k), v = rs.reduce((a, r) => a + (+r.remT || 0), 0); return `<tr class="sub2${rs.length ? '' : ' mu'}"><td class="nw">└ ${esc(k)}</td><td class="r">${n0(rs.length)}</td><td class="r">${n0(v)}</td><td class="r">${tot ? Math.round(v / tot * 100) : 0}%</td><td class="mu2">${esc(t)}</td></tr>`; }).join('') : '')).join('')}`
      + `<tr class="tot"><td>합계</td><td class="r">${n0(n)}</td><td class="r"><b>${n0(tot)}</b></td><td class="r">100%</td><td class="mu2">제외: ${d.pl === 'C' ? `1,000kg 이하 ${n0(d.ex.small)}건 · 잔여 없음 ${n0(d.ex.zero)}건${d.ex.shut ? ` · 전량 출하·잔량 마감 ${n0(d.ex.shut)}건` : ''}` : `잔여 없음·생산 완료 ${n0(d.ex.zero)}건`}</td></tr></tbody></table>`;
    // 상세 표(SSCHC1010 양식): 들여쓰기 단계, 소재량 합계는 주문 간 중복이라 뺌
    const ag = (rs) => [rs.length, ...['ordT', 'prodT', 'remT', 'mchT'].map((k) => rs.reduce((a, r) => a + (+r[k] || 0), 0))];
    const tr = (lv, nm, v, dy, cls = '') => `<tr class="lv${lv} ${cls}"><td class="nm">${nm}</td>${v.map((x, i) => `<td class="r">${x == null || (i === 4 && d.pl === 'G') ? '<span class="mu">–</span>' : n0(x)}</td>`).join('')}<td class="r">${dy == null ? '<span class="mu">–</span>' : `<b>${dy.toFixed(1)}</b>`}</td></tr>`;
    const canOf = (rs) => (d.pl === 'C' ? rs.reduce((a, r) => a + Math.min(+r.remT || 0, +r.mchT || 0), 0) : rs.reduce((a, o) => a + (o.remT || 0), 0));
    const add = (x, y) => x.map((v, i) => v + (y[i] || 0));
    let body = d.pl === 'C' ? tr(0, '원본 전체', add(add(ag(d.R), d.exS), d.exZ), null, 'b') : tr(0, '원본 전체', ag(d.all || d.R), null, 'b');
    body += tr(0, '주문잔여량 있음', d.pl === 'C' ? add(ag(d.R), d.exS) : ag(d.R), null, 'b');
    if (d.pl === 'C') {
      const mR = d.R.filter((r) => r.mchT > 0.0005), nR = d.R.filter((r) => !(r.mchT > 0.0005));
      body += tr(1, '소재 매치 전', ag(nR), null, 'b') + MSUB.map(([k]) => tr(2, k, ag(nR.filter((r) => msub(r) === k)), null)).join('')
        + tr(1, '소재 매치 완료 이후', ag(mR), d.cap ? canOf(mR) / d.cap : null, 'b') + d.cats.slice(1).map((c) => tr(2, c.k, ag(c.rs), d.cap && c.n ? canOf(c.rs) / d.cap : null)).join('')
        + tr(1, '1,000kg 이하(제외)', d.exS, null, 'mu') + tr(0, '주문잔여량 없음(제외)', d.exZ, null, 'mu');
    } else body += d.cats.map((c, i) => tr(1, c.k, ag(c.rs), i === 0 && d.cap ? canOf(c.rs) / d.cap : null)).join('') + tr(0, '잔여 없음·생산 완료(제외)', ag((d.all || []).filter((o) => !d.R.includes(o))), null, 'mu');
    const det = `<details class="pd"><summary>상세 표 <small>${d.pl === 'C' ? 'SSCHC1010 양식 — ' : ''}건수·주문량·생산량·잔여량·매치량·작업가능일</small></summary><div class="ct-wrap"><table class="ct-t pdt"><thead><tr><th>구분</th><th class="r">건수</th><th class="r">주문량(t)</th><th class="r">생산량(t)</th><th class="r">잔여량(t)</th><th class="r">매치량(t)</th><th class="r">작업가능일</th></tr></thead><tbody>${body}</tbody></table></div>`
      + `<p class="ct-note">작업가능일 = 바로 생산 가능한 양 ÷ 라인 하루 능력(${d.pl === 'C' ? '1CCL 480 · 2CCL 400 · 3CCL 200 · 4CCL 250t' : '1CGL 719 · 2CGL 927t'}). 소재량(규격 맞는 재고)은 같은 재고가 여러 주문에 겹쳐 잡혀 합계를 내지 않고 주문별로만 보여줍니다.</p></details>`;
    return `<section class="pc"><div class="pch"><b>${esc(title)}</b><span>${md(((D0 || {})[d.pl === 'C' ? 'cc_order_progress' : 'cg_order_progress'] || {}).asOf)} 기준 · ${d.pl === 'C' ? 'MES 작업지시대상(SSCHC1010) 기준' : '도금 주문진도(납기 −30~+90일)'}</span></div>${tiles}${segBar(d.cats, true)}${leg}${det}</section>`;
  }
  function progSum() {
    const cc = (D0 || {}).cc_order_progress;
    const lines = (CT.inScope('G') ? ['1CGL', '2CGL'] : []).concat(CT.inScope('C') ? ((cc || {}).lines || []) : []);
    if (!lines.length) return '';
    if (PS.line && !lines.includes(PS.line)) PS.line = '';
    const tabs = `<div class="seg ct-seg ps-seg" role="group" aria-label="라인">${[['', '전체']].concat(lines.map((l) => [l, l])).map(([k, n]) => `<button type="button" data-l="${k}" aria-pressed="${PS.line === k}">${n}</button>`).join('')}</div>`;
    let body = '';
    if (!PS.line) {
      const mini = lines.map((l) => { const d = psData([l])[0]; if (!d) return ''; const tot = d.cats.reduce((a, c) => a + c.rem, 0), days = d.cap ? d.can / d.cap : null, none = d.cats.find((c) => /없음|미발주/.test(c.k)) || { n: 0 };
        return `<button type="button" class="pm" data-l="${l}"><div class="h"><b>${l}</b><span>${n0(d.cats.reduce((a, c) => a + c.n, 0))}건</span></div><div class="v">${n0(tot)}<small>t 잔여</small></div>${segBar(d.cats, false)}<div class="s">${d.pl === 'C' ? (() => { const g = (k) => (d.cats.find((c) => c.k === k) || { rem: 0 }).rem; return `<span class="nw">매치 전 <b class="bad">${n0(g('소재 매치 전'))}t</b></span> · <span class="nw">작업지시 <b>${n0(g('작업지시 내려감'))}t</b></span>`; })() : `<span class="nw">바로 생산 <b>${n0(d.can)}t</b>${days != null ? ` · ${days.toFixed(1)}일` : ''}</span>${none.n ? ` · <span class="bad nw">${none.k} ${n0(none.n)}건</span>` : ''}`}</div></button>`; }).join('');
      body = `<div class="pms">${mini}</div>` + psData(lines).map((d) => psCard(d, `${d.nm} 전체 주문진도`)).join('');
    } else body = psData([PS.line]).map((d) => psCard(d, `${PS.line} 주문진도`)).join('');
    return `<div class="ps">${tabs}${body}</div>`;
  }
  function viewTrack() {
    if (!T.id) { const f = L.filter((o) => !o.closed && (o.remT || 0) > 0.5).sort(CT.riskSort)[0]; T.id = f ? f.id : null; }
    return `<div id="co-ps">${progSum()}</div><div class="co-trk"><div class="co-tlw"><input id="co-tq" type="search" placeholder="주문번호·품명·고객·담당 (Enter)" value="${esc(T.q)}" aria-label="주문 찾기">`
      + `<div class="co-tc" id="co-tc"></div><div class="co-tn" id="co-tn"></div><ul class="co-tl" id="co-tl" role="listbox" aria-label="주문 목록"></ul></div><section class="co-td" id="co-td"></section></div>`;
  }
  function bindTrack() {
    const qi = $('co-tq');
    qi.oninput = (e) => { T.q = e.target.value.trim(); clearTimeout(bindTrack.t); bindTrack.t = setTimeout(drawTrackList, 200); };
    qi.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); T.q = qi.value.trim(); const ex = byId[T.q] || byId[T.q.toUpperCase()]; drawTrackList(); const f = ex || trackList()[0]; if (f) pickTrack(f.id); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const f = $('co-tl').querySelector('li.ck'); if (f) f.focus(); }
    };
    $('co-tl').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault(); const it = [...$('co-tl').querySelectorAll('li.ck')], i = it.indexOf(document.activeElement);
      const n = it[Math.max(0, Math.min(it.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus();
      if (e.key === 'ArrowUp' && i <= 0) qi.focus();
    });
    const bindPS = () => document.querySelectorAll('.ps-seg button, .pm').forEach((bt) => bt.onclick = () => { PS.line = bt.dataset.l; $('co-ps').innerHTML = progSum(); bindPS(); drawTrackList(); const f = trackList()[0]; if (f && !trackList().some((o) => o.id === T.id)) pickTrack(f.id); });
    bindPS();
    drawTrackList(); drawTrackDetail();
  }

  /* ---------- #cal 납기 캘린더 ---------- */
  const monday = (s) => { const d = new Date(s + 'T00:00:00Z'), w = (d.getUTCDay() + 6) % 7; return CT.addD(s, -w); };
  function calDay(d) {
    const act = L.filter((o) => !o.closed);
    const P = act.filter((o) => o.needProd === d && (o.ful === '생산 전' || o.ful === '생산 중'));
    const S = act.filter((o) => o.due === d);
    const rk = [...new Set(P.concat(S).filter((o) => o.risk === '위험').map((o) => o.id))].length;
    return { P, S, rk };
  }
  const shipT = (o) => (o.pl === 'G' ? o.unshipT || 0 : o.remT || 0);
  function viewCal() {
    const asOf = M.asOf, s0 = CT.addD(monday(asOf), calOff * 7), s1 = CT.addD(s0, 27);
    let cells = '';
    for (let i = 0; i < 28; i++) {
      const d = CT.addD(s0, i), c = calDay(d), past = d < asOf, today = d === asOf;
      const has = c.P.length || c.S.length;
      cells += `<div class="co-cd${today ? ' td' : ''}${past ? ' ps' : ''}${i % 7 > 4 ? ' we' : ''}${has ? ' ck' : ''}" data-d="${d}"${has ? ` role="button" aria-label="${md(d)} 주문 ${c.P.length + c.S.length}건"` : ''}>`
        + `<div class="dt"><b>${md(d)}</b><span>${wd(d)}</span>${today ? '<em>오늘</em>' : ''}</div>`
        + (c.P.length ? `<div class="mk p"><i>■</i>생산요청 <b>${c.P.length}</b>건 <span>${n0(sum(c.P, (o) => o.remT))}t</span></div>` : '')
        + (c.S.length ? `<div class="mk s"><i>▲</i>출하완료 <b>${c.S.length}</b>건 <span>${n0(sum(c.S, shipT))}t</span></div>` : '')
        + (c.rk ? `<div class="mk r">지연 예상 <b>${c.rk}</b>건</div>` : '') + '</div>';
    }
    return shipNote() + `<div class="co-calh"><button type="button" class="lnk" id="co-prev" aria-label="이전 주">◀ 이전 주</button><b>${md(s0)} ~ ${md(s1)}</b>`
      + `<button type="button" class="lnk" id="co-next" aria-label="다음 주">다음 주 ▶</button>${calOff ? '<button type="button" class="lnk" id="co-now">이번 주</button>' : ''}`
      + '<span class="co-lg"><i class="p">■</i> 생산요청일 · <i class="s">▲</i> 출하완료일 · <i class="r">지연 예상</i></span></div>'
      + `<div class="co-cal"><div class="co-wh">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<div>${x}</div>`).join('')}</div><div class="co-cg">${cells}</div></div>`;
  }
  function dayPanel(d) {
    const c = calDay(d);
    const tbl = (A, t, tf) => (A.length ? `<h4>${t} ${A.length}건 · ${n0(sum(A, tf))}t</h4><table class="ct-t"><tbody>${A.sort(CT.riskSort).map((o) => `<tr class="ck" data-id="${esc(o.id)}"><td>${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${esc(plName(o))}</small></td><td class="r">${n1(tf(o))}t</td></tr>`).join('')}</tbody></table>` : '');
    CT.panel(tbl(c.P, '■ 생산요청', (o) => o.remT) + tbl(c.S, '▲ 출하완료', shipT), `${md(d)}(${wd(d)}) 주문`, (p) => {
      p.querySelectorAll('tr.ck').forEach((tr) => { tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) CT.panel(CT.orderDetail(o), o.id); }; });
    });
  }
  function bindCal() {
    const re = () => { $('co-body').innerHTML = viewCal(); bindCal(); };
    $('co-prev').onclick = () => { calOff--; re(); }; $('co-next').onclick = () => { calOff++; re(); };
    const nw = $('co-now'); if (nw) nw.onclick = () => { calOff = 0; re(); };
    document.querySelectorAll('.co-cd.ck').forEach((el) => { el.onclick = () => dayPanel(el.dataset.d); });
    CT.keyRows($('co-body'));
  }

  /* ---------- 공통 ---------- */
  function render(D) {
    D0 = D; M = CT.orders(D);
    L = M.all.filter((o) => CT.inScope(o.pl));
    byId = Object.fromEntries(M.all.map((o) => [o.id, o]));
    const v = CT.view('status', VIEWS);
    const cg = D.cg_order_progress, cc = D.cc_order_progress;
    const basis = CT.basis([
      cg && { name: '도금 주문', at: cg.asOf, kind: '실적·재계획' },
      cc && { name: '컬러 주문', at: cc.asOf, kind: (cc.lines || []).join('·') },
      ...(M.ccMissing || []).map((l) => ({ name: l, at: null, ok: false, tip: '작업지시대상 자료 없음' })),
    ]);
    const body = v === 'risk' ? viewRisk() : v === 'track' ? viewTrack() : v === 'cal' ? viewCal() : viewStatus();
    $('ct-main').innerHTML = basis + `<section class="card co-card co-${v}" id="co-body">${body}</section>`;
    ({ status: bindStatus, risk: bindRisk, track: bindTrack, cal: bindCal })[v]();
    document.title = `${({ status: '수주 현황', risk: '납기 지연 예상', track: '주문진도', cal: '납기 캘린더' })[v]} · 수주·납기`;
  }
  CT.onView(() => { if (D0) { CT.panel(null); render(D0); } });
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'], render);
})();
