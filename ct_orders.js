/* 02 수주·납기 통합(11/4 2차 진단 2·5·11장): 도금 주문진도 + 컬러 주문·납기 → 한 주문 모델(ui/ct.js CT.orders)
   하위 화면 = 주소 #뒤(메뉴 탭과 같음, 화면 안 탭 없음): #status 수주 현황 · #risk 납기 위험 · #track 주문 추적 · #cal 납기 캘린더
   출하 확인 불가(출하 실적 연결 없음)는 완료로 보지 않음 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['status', 'risk', 'track', 'cal'];
  const OPEN = ['위험', '주의', '판정 불가'];
  const F = { grp: '', pl: '', risk: '', ful: '', q: '', done: false, by: false, sk: 'risk', dir: 1, lim: 200 };
  const R = { cause: '', sk: 'risk', dir: 1, lim: 200 };
  const T = { id: null, q: '' };
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
    const done = M.G.filter((o) => CT.inScope('G') && !['생산 전', '생산 중'].includes(o.ful));
    const lk = done.filter((o) => (o.fwdT || 0) > 0.5).length;
    return `<p class="ct-note co-sn">도금 출하 실적 연결 ${n0(lk)}/${n0(done.length)}건 · 컬러 주문별 출하 없음</p>`;
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
  const HEAD_S = () => `<thead><tr>${th('risk', '위험', F, 'sk s1')}${th('id', '주문번호', F, 'sk s2')}${th('grp', '판매그룹', F)}${th('item', '품명·규격', F)}${th('remT', '수주잔량(t)', F, 'r')}`
    + `${th('mat', '소재 확보', F)}${th('eta', '생산완료 예상일', F)}${th('need', '생산요청일', F, '', '수출 출항 −1 · 내수 납기 −1 · 컬러 = 납기')}${th('due', '출하완료일', F, '', '납기(수출은 출항일 같이 표시)')}${th('ful', '이행 단계', F)}</tr></thead>`;
  const rowS = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="sk s1">${CT.badge(o.risk)}</td>${idCell(o, plName(o))}`
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
    const asOf = M.asOf, wk = CT.addD(asOf, 7), act = L.filter((o) => !o.closed);
    const risk = act.filter((o) => o.risk === '위험');
    const wP = act.filter((o) => leq(o.needProd, wk) && (o.ful === '생산 전' || o.ful === '생산 중'));
    const wS = act.filter((o) => o.pl === 'G' && leq(o.due, wk));
    const wC = act.filter((o) => o.pl === 'C' && leq(o.due, wk));
    const k = CT.kpis([
      { label: '수주잔량', v: n0(sum(act, (o) => o.remT)), unit: 't', sub: `${n0(act.length)}건 · 출하 완료 제외`, tone: 'info' },
      { label: '금주 생산완료 필요', v: n0(sum(wP, (o) => o.remT)), unit: 't', sub: `${n0(wP.length)}건 · ~${md(wk)} · 지난 것 포함`, tone: wP.length ? 'warn' : 'ok' },
      { label: '금주 출하 필요(도금)', v: n0(sum(wS, (o) => o.unshipT)), unit: 't', sub: `${n0(wS.length)}건 · 출하 확인 불가 ${n0(wS.filter((o) => o.ful === '출하 확인 불가').length)}건 포함${wC.length ? `<br>컬러 ${n0(wC.length)}건 출하 확인 불가` : ''}`, tone: 'info' },
      { label: '납기 위험', v: n0(risk.length), unit: '건', sub: `${n0(sum(risk, imp))}t`, tone: risk.length ? 'bad' : 'ok', href: '#risk' },
    ]);
    const grps = [...new Set(L.map((o) => o.grp))].sort();
    const sc = CT.scope(), plLock = sc !== 'all';
    if (plLock) F.pl = '';
    const sel = (id, lab, cur, opts) => `<label class="co-sel"><span>${lab}</span><select id="${id}"${id === 'co-pl' && plLock ? ' disabled title="상단 범위(도금/컬러)를 따름"' : ''}><option value="">전체</option>${opts.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    return k + shipNote()
      + `<div class="co-f1">${sel('co-grp', '판매그룹', F.grp, grps.map((g) => [g, g]))}${sel('co-pl', '공정', plLock ? sc : F.pl, [['G', '도금'], ['C', '컬러']])}`
      + `${sel('co-risk', '위험 상태', F.risk, CT.RISK.map((r) => [r, r]))}${sel('co-ful', '이행 단계', F.ful, CT.FUL.map((r) => [r, r]))}</div>`
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
    const rows = V.map((o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="sk s1">${CT.badge(o.risk)}</td>`
      + `<td>${o.last ? `<b>${md(o.last)}</b> <span class="lf">${CT.leftTxt(o)}</span>` : '<span class="mu">-</span>'}</td>${idCell(o, o.grp + ' · ' + plName(o))}`
      + `<td class="r"><b>${n1(imp(o))}</b></td><td>${md(o.needProd) || '<span class="mu">-</span>'}</td><td>${dueCell(o)}</td>`
      + `<td>${esc(o.cause === 'data' ? (o.dataWhy || CT.CAUSE.data) : CT.CAUSE[o.cause] || '-')}</td><td>${esc(o.dept || '-')}</td><td><span class="co-act">미조치</span></td></tr>`).join('');
    $('co-tbl').innerHTML = `<table class="ct-t co-t"><thead><tr>${th('risk', '위험 등급', R, 'sk s1')}${th('last', '마지막 조정 가능일', R, '', '이 날까지 조치해야 납기를 지킬 수 있는 마지막 날')}${th('id', '주문번호·판매그룹', R, 'sk s2')}`
      + `${th('imp', '영향(t)', R, 'r', '생산 끝난 도금 = 미출하 · 그 외 = 잔량')}${th('need', '생산요청일', R)}${th('due', '출하완료일', R)}${th('cause', '위험 원인', R)}${th('dept', '담당 부서', R)}<th>조치 상태</th></tr></thead>`
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
      { label: '위험', v: n0(red.length), unit: '건', sub: `주의 ${n0(warn.length)}건`, tone: red.length ? 'bad' : 'ok' },
      { label: '영향 톤(위험+주의)', v: n0(sum(red.concat(warn), imp)), unit: 't', sub: `위험 ${n0(sum(red, imp))}t`, tone: red.length ? 'bad' : 'ok' },
      { label: '조치 기한 경과', v: n0(past.length), unit: '건', sub: `${n0(sum(past, imp))}t · 마지막 조정일 지남`, tone: past.length ? 'bad' : 'ok' },
      { label: '판정 불가', v: n0(na.length), unit: '건', sub: '자료 확인 필요', tone: na.length ? 'warn' : 'ok' },
    ]);
    const chips = [['', '전체', A.length], ...Object.keys(CT.CAUSE).map((c) => [c, CT.CAUSE[c], A.filter((o) => o.cause === c).length])]
      .map(([c, n, cnt]) => `<button type="button" class="co-chip" data-c="${c}" aria-pressed="${c === R.cause}"${cnt || !c ? '' : ' disabled'}>${esc(n)} <b>${n0(cnt)}</b></button>`).join('');
    return k + shipNote() + `<div class="co-chips" role="group" aria-label="위험 원인">${chips}<span class="cnt" id="co-cnt"></span></div><div class="co-tw" id="co-tbl"></div>`;
  }
  function bindRisk() {
    document.querySelectorAll('.co-chip').forEach((b) => b.onclick = () => { R.cause = b.dataset.c; R.lim = 200; drawRisk(); });
    drawRisk();
  }

  /* ---------- #track 주문 추적 ---------- */
  function trackList() {
    if (T.q) { const q = T.q.toUpperCase(); return L.filter((o) => [o.id, o.item, o.cus, o.man].join(' ').toUpperCase().includes(q)).sort(CT.riskSort).slice(0, 200); }
    return L.filter((o) => OPEN.includes(o.risk)).sort(CT.riskSort);
  }
  function drawTrackList() {
    const A = trackList();
    $('co-tl').innerHTML = A.length ? A.slice(0, 300).map((o) => `<li class="ck${o.id === T.id ? ' on' : ''}" data-id="${esc(o.id)}" role="option" aria-selected="${o.id === T.id}">`
      + `<div class="a">${CT.badge(o.risk)}<b>${esc(o.id)}</b></div><div class="b">${esc(o.grp)} · ${esc(plName(o))}<span>${md(o.due) ? '출하 ' + md(o.due) : ''}</span></div></li>`).join('')
      : '<li class="mu">해당 주문이 없습니다.</li>';
    $('co-tn').textContent = T.q ? `찾기 ${n0(A.length)}건` : `위험·주의·판정 불가 ${n0(A.length)}건`;
    $('co-tl').querySelectorAll('li.ck').forEach((li) => { li.onclick = () => pickTrack(li.dataset.id); });
    CT.keyRows($('co-tl'));
  }
  function drawTrackDetail() {
    const o = T.id && byId[T.id], box = $('co-td');
    if (!o) { box.innerHTML = '<p class="ct-note">왼쪽에서 주문을 고르거나 주문번호로 찾으세요.</p>'; return; }
    box.innerHTML = `<div class="co-th"><div class="h1"><b>${esc(o.id)}</b>${CT.badge(o.risk)}${CT.fulBadge(o.ful)}</div>`
      + `<div class="h2"><span>${esc(o.grp)} · ${esc(plName(o))}</span><span>생산요청 <b>${md(o.needProd) || '-'}</b></span><span>출하완료 <b>${md(o.due) || '-'}</b>${o.pl === 'G' && o.exp && o.ship ? ` <small>출항 ${md(o.ship)}</small>` : ''}</span></div></div>`
      + `<div class="co-tdb">${CT.orderDetail(o)}</div>`;
  }
  function pickTrack(id) {
    T.id = id;
    $('co-tl').querySelectorAll('li.ck').forEach((li) => { const on = li.dataset.id === id; li.classList.toggle('on', on); li.setAttribute('aria-selected', String(on)); });
    drawTrackDetail();
    if (matchMedia('(max-width: 900px)').matches) $('co-td').scrollIntoView({ block: 'start' });
  }
  function viewTrack() {
    if (!T.id) { const f = L.filter((o) => OPEN.includes(o.risk)).sort(CT.riskSort)[0]; T.id = f ? f.id : null; }
    return `<div class="co-trk"><div class="co-tlw"><input id="co-tq" type="search" placeholder="주문번호·품명·고객·담당 (Enter)" value="${esc(T.q)}" aria-label="주문 찾기">`
      + `<div class="co-tn" id="co-tn"></div><ul class="co-tl" id="co-tl" role="listbox" aria-label="주문 목록"></ul></div><section class="co-td" id="co-td"></section></div>`;
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
        + (c.rk ? `<div class="mk r">위험 <b>${c.rk}</b>건</div>` : '') + '</div>';
    }
    return shipNote() + `<div class="co-calh"><button type="button" class="lnk" id="co-prev" aria-label="이전 주">◀ 이전 주</button><b>${md(s0)} ~ ${md(s1)}</b>`
      + `<button type="button" class="lnk" id="co-next" aria-label="다음 주">다음 주 ▶</button>${calOff ? '<button type="button" class="lnk" id="co-now">이번 주</button>' : ''}`
      + '<span class="co-lg"><i class="p">■</i> 생산요청일 · <i class="s">▲</i> 출하완료일 · <i class="r">위험</i></span></div>'
      + `<div class="co-cal"><div class="co-wh">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<div>${x}</div>`).join('')}</div><div class="co-cg">${cells}</div></div>`;
  }
  function dayPanel(d) {
    const c = calDay(d);
    const tbl = (A, t, tf) => (A.length ? `<h4>${t} ${A.length}건 · ${n0(sum(A, tf))}t</h4><table class="ct-t"><tbody>${A.sort(CT.riskSort).map((o) => `<tr class="ck" data-id="${esc(o.id)}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${esc(plName(o))}</small></td><td class="r">${n1(tf(o))}t</td></tr>`).join('')}</tbody></table>` : '');
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
    document.title = `${({ status: '수주 현황', risk: '납기 위험', track: '주문 추적', cal: '납기 캘린더' })[v]} · 수주·납기`;
  }
  CT.onView(() => { if (D0) { CT.panel(null); render(D0); } });
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'], render);
})();
