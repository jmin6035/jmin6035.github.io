/* 02 수주·납기 통합(11/4 2차 진단 2·5·11장): 도금 주문진도 + 컬러 주문·납기 → 한 주문 모델(ui/ct.js CT.orders)
   하위 화면 = 주소 #뒤(메뉴 탭과 같음, 화면 안 탭 없음): #status 수주 현황 · #risk 납기 위험 · #track 주문진도 · #cal 납기 캘린더
   출하 확인 불가(출하 실적 연결 없음)는 완료로 보지 않음 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['status', 'risk', 'track', 'cal'];
  const OPEN = ['위험', '주의', '판정 불가'];
  const F = { grp: '', pl: '', risk: '', ful: '', q: '', done: false, by: true, stale: false, sk: 'risk', dir: 1, lim: 200, open: null, glim: {} };   // by = 판매그룹 묶음(기본, docs/16 '묶어서 보여 준다')
  const R = { cause: '', by: true, sk: 'risk', dir: 1, lim: 200, open: null, glim: {} };
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
  /* 판매그룹 묶음: 조치가 필요한 묶음 먼저(지연 예상 → 점검 필요 → 톤) · 처음엔 첫 묶음만 펼침 · 머리줄 = 건수·톤·조치 건수·가장 급한 조치 마감일 */
  function grouped(A, st, cols, row, tonF) {
    const G = new Map(); for (const o of A) { if (!G.has(o.grp)) G.set(o.grp, []); G.get(o.grp).push(o); }
    const info = [...G].map(([g, X]) => ({ g, X, t: sum(X, tonF), red: X.filter((o) => o.risk === '위험').length, warn: X.filter((o) => o.risk === '주의').length,
      first: X.filter((o) => (o.risk === '위험' || o.risk === '주의') && o.last).map((o) => o.last).sort()[0] })).sort((a, b) => b.red - a.red || b.warn - a.warn || b.t - a.t);
    const all = info.length === 1 || A.length <= 60;      // 한 묶음뿐이거나 찾은 줄이 적으면 다 펼침
    st.groups = info.map((x) => x.g);
    st.cur = new Set(all ? st.groups : st.open ? st.groups.filter((g) => st.open.has(g)) : st.groups.slice(0, 1));   // 직접 여닫기 전에는 조치가 가장 많은 첫 묶음만
    return info.map((x) => { const op = st.cur.has(x.g), lim = st.glim[x.g] || 100;
      return `<tr class="co-gh" data-g="${esc(x.g)}" tabindex="0" role="button" aria-expanded="${op}"><td colspan="${cols}"><div class="gh"><i aria-hidden="true">${op ? '▾' : '▸'}</i><b>${esc(x.g || '-')}</b><span>${n0(x.X.length)}건 · ${n0(x.t)}t</span>`
        + `${x.red ? `<span class="ct-b bad">${esc(CT.rl('위험'))} ${n0(x.red)}</span>` : ''}${x.warn ? `<span class="ct-b warn">${esc(CT.rl('주의'))} ${n0(x.warn)}</span>` : ''}${x.first ? `<span>가장 급한 조치 <b>${md(x.first)}</b></span>` : ''}</div></td></tr>`
        + (op ? x.X.slice(0, lim).map(row).join('') + (x.X.length > lim ? `<tr class="co-gm"><td colspan="${cols}"><button type="button" class="lnk" data-gm="${esc(x.g)}">더 보기 (남은 ${n0(x.X.length - lim)}건)</button></td></tr>` : '') : ''); }).join('');
  }
  function bindGroups(root, st, redraw) {
    const keep = (f) => { const y = root.scrollTop; f(); redraw(); root.scrollTop = y; };
    root.querySelectorAll('tr.co-gh').forEach((tr) => { const go = () => keep(() => { const g = tr.dataset.g; st.open = new Set(st.cur); if (st.open.has(g)) st.open.delete(g); else st.open.add(g); });
      tr.onclick = go; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    root.querySelectorAll('[data-gm]').forEach((b) => (b.onclick = () => keep(() => { st.glim[b.dataset.gm] = (st.glim[b.dataset.gm] || 100) + 200; })));
    const th = root.querySelector('thead th'); if (th) root.style.setProperty('--hh', th.offsetHeight + 'px');
  }
  const allBtn = (id) => `<button type="button" class="lnk" id="${id}">모두 펼치기</button>`;
  function bindAll(id, st, redraw) { const b = $(id); if (!b) return; const on = st.by && (st.groups || []).length > 1; b.hidden = !on; if (!on) return;
    const full = st.groups.every((g) => st.cur.has(g)); b.textContent = full ? '모두 접기' : '모두 펼치기'; b.onclick = () => { st.open = new Set(full ? [] : st.groups); redraw(); }; }
  const more = (n, lim) => (n > lim ? `<div class="co-more"><button type="button" class="lnk" id="co-more">더 보기 (${n0(Math.min(200, n - lim))}건 더 · 남은 ${n0(n - lim)}건)</button></div>` : '');
  const matCell = (o) => `<span class="${['확보', '재고 있음'].includes(o.matSt) ? '' : o.matSt === '입고 대기' || o.matSt === '진행' ? 'co-w' : 'co-b'}">${esc(o.matSt || '-')}</span>`;
  const dueCell = (o) => `${md(o.due) || '<span class="mu">-</span>'}${o.pl === 'G' && o.exp && o.ship ? `<small>출항 ${md(o.ship)}</small>` : ''}`;
  const idCell = (o, sub) => `<td class="id sk s2">${esc(o.id)}<small>${esc(sub)}</small></td>`;

  // '납기 지연 예상' 기준: 여기 = 미결 주문 전부(기간 제한 없음, 조치 마감일이 이미 지난 주문 포함) · 통합 관제 카드 = 조치 마감일이 고른 기간(금일·7일·월) 안인 주문만, 이미 지난 주문은 별도
  const BASIS = '미결 주문 전부 — 조치 마감일이 이미 지난 주문 포함 · 통합 관제 카드는 고른 기간(금일·7일·월) 안에 조치 마감일이 있는 주문만 셈';
  /* ---------- #status 수주 현황 ---------- */
  function statusRows() {
    let A = L.filter((o) => (F.stale ? CT.isStale(o) : !CT.isStale(o)) && (F.done || !o.closed) && (!F.grp || o.grp === F.grp) && (!F.pl || o.pl === F.pl) && (!F.risk || o.risk === F.risk) && (!F.ful || o.ful === F.ful));
    if (F.q) { const q = F.q.toUpperCase(); A = A.filter((o) => [o.id, o.item, o.size, o.cus, o.man, o.grp].join(' ').toUpperCase().includes(q)); }
    return A.sort(sorter(F.sk, F.dir, (o) => o.remT || 0));
  }
  const HEAD_S = () => `<thead><tr>${th('risk', '상태', F, 'sk s1')}${th('id', '주문번호', F, 'sk s2')}${F.by ? '' : th('grp', '판매그룹', F)}${th('item', '품명·규격', F)}${th('remT', '잔량(t)', F, 'r', '수주잔량')}`
    + `${th('mat', '소재', F, '', '소재 확보')}${th('eta', '생산 완료 예정', F)}${th('need', '생산요청일', F, 'c-need', '수출 출항 −1 · 내수 납기 −1 · 컬러 = 납기')}${th('due', '출하완료일', F, '', '납기(수출은 출항일 같이 표시)')}${th('ful', '진행', F, '', '진행 단계')}</tr></thead>`;
  const rowS = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="sk s1">${CT.badge(o)}</td>${idCell(o, plName(o))}`
    + `${F.by ? '' : `<td>${esc(o.grp)}${o.grpEst ? '<small>추정</small>' : ''}</td>`}<td class="w">${esc(o.item || '-')}<small>${esc(o.size)}</small></td><td class="r"><b>${n1(o.remT)}</b></td>`
    + `<td>${matCell(o)}</td><td>${o.etaDone ? md(o.etaDone) : '<span class="mu">-</span>'}${o.etaSrc ? `<small>${esc(o.etaSrc)}</small>` : ''}</td>`
    + `<td class="c-need">${md(o.needProd) || '<span class="mu">-</span>'}</td><td>${dueCell(o)}</td><td>${CT.fulBadge(o.ful)}</td></tr>`;
  function drawStatus() {
    const A = statusRows();
    const body = F.by ? grouped(A, F, 9, rowS, (o) => o.remT) : A.slice(0, F.lim).map(rowS).join('');
    $('co-cnt').textContent = `${n0(A.length)}건 · 잔량 ${n0(sum(A, (o) => o.remT))}t`;
    $('co-tbl').innerHTML = `<table class="ct-t co-t${F.by ? ' by' : ''}">${HEAD_S()}<tbody>${body || '<tr><td colspan="10" class="mu">해당 주문이 없습니다.</td></tr>'}</tbody></table>` + (F.by ? '' : more(A.length, F.lim));
    const tb = $('co-tbl').querySelector('table'); pinLeft(tb); bindSort($('co-tbl'), F, drawStatus); bindRows($('co-tbl')); bindGroups($('co-tbl'), F, drawStatus); bindAll('co-all', F, drawStatus);
    const mb = $('co-more'); if (mb) mb.onclick = () => { F.lim += 200; drawStatus(); };
  }
  function viewStatus() {
    const asOf = M.asOf, w0 = CT.wed(asOf), w1 = CT.addD(w0, 6), act = L.filter((o) => !o.closed && !CT.isStale(o));   // 금주 = 수요일 시작 7일(11/5 사용자) · 종결 확인 필요는 따로(11/8)
    const stale = L.filter(CT.isStale);
    const risk = act.filter((o) => o.risk === '위험');
    const actSelf = act.filter((o) => /^자가재\(/.test(o.grp || '')), actS = act.filter((o) => !/^자가재\(/.test(o.grp || ''));   // 11/7 점검: 자가재 + 컬러 주문 = 이중 계상(docs/22)
    const inW = (d) => d && d >= w0 && d <= w1;
    const wP = act.filter((o) => inW(o.needProd) && (o.ful === '생산 전' || o.ful === '생산 중') && o.risk !== '판정 불가');
    const shipD = (o) => o.ship || o.due;                                        // 출하 일정 = 출항(수출) · 납기(내수)
    const wAll = act.filter((o) => o.pl === 'G' && inW(shipD(o)));
    const wS = wAll.filter((o) => o.ful !== '출하 확인 불가' && o.risk !== '판정 불가');
    const wNo = wAll.filter((o) => o.ful === '출하 확인 불가');
    const wC = act.filter((o) => o.pl === 'C' && inW(o.due));
    const wl = `${md(w0)}(수)~${md(w1)}(화)`;
    const k = CT.kpis([
      { label: '수주잔량', v: n0(sum(actS, (o) => o.remT)), unit: 't', sub: `${n0(actS.length)}건 · 출하 완료 제외${actSelf.length ? `<br>자가재(컬러 투입용 도금) ${n0(actSelf.length)}건 ${n0(sum(actSelf, (o) => o.remT))}t 별도 — 컬러 주문과 겹침` : ''}`, tone: 'info' },
      { label: '금주 생산완료 필요', v: n0(sum(wP, (o) => o.remT)), unit: 't', sub: `${n0(wP.length)}건 · ${wl} 생산 필요일`, tone: wP.length ? 'warn' : 'ok' },
      ...(CT.inScope('G') ? [{ label: '금주 출하 필요(도금)', v: n0(sum(wS, (o) => o.unshipT)), unit: 't', sub: `${n0(wS.length)}건 · ${wl} 출항·납기${wNo.length ? `<br>출하 실적 없음 ${n0(wNo.length)}건 별도(생산 완료)` : ''}${wC.length ? `<br>컬러 ${n0(wC.length)}건 출하 실적 없음` : ''}`, tone: 'info' }] : [{ label: '금주 납기(컬러)', v: n0(sum(wC, (o) => o.remT)), unit: 't', sub: `${n0(wC.length)}건 · ${wl} 납기 · 컬러 주문별 출하 자료 없음` }]),
      { label: '납기 지연 예상(전 기간)', v: n0(risk.length), unit: '건', sub: `<span title="${BASIS}">${n0(sum(risk, imp))}t · 조치일 지난 ${n0(risk.filter((o) => o.last && o.last < asOf).length)}건 포함</span>`, tone: risk.length ? 'bad' : 'ok', href: '#risk' },
      { label: '종결 확인 필요', v: n0(stale.length), unit: '건', sub: `${n0(sum(stale, (o) => o.remT))}t · 납기 60일 넘게 지난 미종결(잔량·지연 제외)`, tone: stale.length ? 'warn' : 'ok' },
    ]);
    const grps = [...new Set(L.map((o) => o.grp))].sort();
    const sc = CT.scope(), plLock = sc !== 'all';
    if (plLock) F.pl = '';
    const sel = (id, lab, cur, opts) => `<label class="co-sel"><span>${lab}</span><select id="${id}"${id === 'co-pl' && plLock ? ' disabled title="상단 범위(도금/컬러)를 따름"' : ''}><option value="">전체</option>${opts.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    return k + shipNote()
      + `<div class="co-f1">${sel('co-grp', '판매그룹', F.grp, grps.map((g) => [g, g]))}${sel('co-pl', '공정', plLock ? sc : F.pl, [['G', '도금'], ['C', '컬러']])}`
      + `${sel('co-risk', '상태', F.risk, CT.RISK.map((r) => [r, CT.rl(r)]))}${sel('co-ful', '진행 단계', F.ful, CT.FUL.map((r) => [r, CT.fl(r)]))}</div>`
      + `<div class="co-f2"><input id="co-q" type="search" placeholder="주문번호·품명·고객·담당" value="${esc(F.q)}" aria-label="주문 찾기">`
      + `<label class="nw"><input type="checkbox" id="co-stale"${F.stale ? ' checked' : ''}> 종결 확인 필요만</label><label class="nw"><input type="checkbox" id="co-done"${F.done ? ' checked' : ''}> 완료 포함</label><label class="nw"><input type="checkbox" id="co-by"${F.by ? ' checked' : ''}> 판매그룹 묶음</label>${allBtn('co-all')}<span class="cnt" id="co-cnt"></span></div>`
      + '<div class="co-tw" id="co-tbl"></div>';
  }
  function bindStatus() {
    const on = (id, f) => { const e = $(id); if (e) e.onchange = (ev) => { f(ev.target); F.lim = 200; drawStatus(); }; };
    on('co-grp', (e) => { F.grp = e.value; }); on('co-pl', (e) => { F.pl = e.value; }); on('co-risk', (e) => { F.risk = e.value; }); on('co-ful', (e) => { F.ful = e.value; });
    on('co-done', (e) => { F.done = e.checked; }); on('co-stale', (e) => { F.stale = e.checked; }); on('co-by', (e) => { F.by = e.checked; });
    $('co-q').oninput = (e) => { F.q = e.target.value.trim(); F.lim = 200; clearTimeout(bindStatus.t); bindStatus.t = setTimeout(drawStatus, 200); };
    drawStatus();
  }

  /* ---------- #risk 납기 위험 ---------- */
  const riskAll = () => L.filter((o) => OPEN.includes(o.risk) && !CT.isStale(o));   // 종결 확인 필요(납기 60일+ 미종결)는 수주 현황에서 따로(11/8)
  function drawRisk() {
    const A = riskAll().filter((o) => !R.cause || o.cause === R.cause).sort(sorter(R.sk, R.dir, imp));
    const row = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="sk s1">${CT.badge(o)}</td>`
      + `<td>${o.last ? `<b>${md(o.last)}</b> <span class="lf">${CT.leftTxt(o)}</span>` : '<span class="mu">-</span>'}</td>${idCell(o, R.by ? plName(o) : o.grp + ' · ' + plName(o))}`
      + `<td class="r"><b>${Math.abs(imp(o)) >= 100 ? n0(imp(o)) : n1(imp(o))}</b></td><td class="c-need">${md(o.needProd) || '<span class="mu">-</span>'}</td><td>${dueCell(o)}</td>`
      + `<td class="w">${esc(CT.why(o) || '-')}</td><td>${esc(o.dept || '-')}</td><td class="c-act"><span class="co-act">미조치</span></td></tr>`;
    const rows = R.by ? grouped(A, R, 9, row, imp) : A.slice(0, R.lim).map(row).join('');
    $('co-tbl').innerHTML = `<table class="ct-t co-t${R.by ? ' by' : ''}"><thead><tr>${th('risk', '상태', R, 'sk s1')}${th('last', '조치 마감일', R, '', '이 날까지 조치해야 납기를 지킬 수 있는 마지막 날')}${th('id', R.by ? '주문번호' : '주문번호·판매그룹', R, 'sk s2')}`
      + `${th('imp', '물량(t)', R, 'r', '해당 물량: 생산 끝난 도금 = 미출하 · 그 외 = 잔량')}${th('need', '생산요청일', R, 'c-need')}${th('due', '출하완료일', R)}${th('cause', '근거', R)}${th('dept', '조치 부서', R)}<th class="c-act">조치 상태</th></tr></thead>`
      + `<tbody>${rows || '<tr><td colspan="9" class="mu">해당 주문이 없습니다.</td></tr>'}</tbody></table>` + (R.by ? '' : more(A.length, R.lim));
    $('co-cnt').textContent = `${n0(A.length)}건 · ${n0(sum(A, imp))}t`;
    pinLeft($('co-tbl').querySelector('table')); bindSort($('co-tbl'), R, drawRisk); bindRows($('co-tbl')); bindGroups($('co-tbl'), R, drawRisk); bindAll('co-rall', R, drawRisk);
    const mb = $('co-more'); if (mb) mb.onclick = () => { R.lim += 200; drawRisk(); };
    document.querySelectorAll('.co-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === R.cause)));
  }
  function viewRisk() {
    const A = riskAll(), asOf = M.asOf;
    const red = A.filter((o) => o.risk === '위험'), warn = A.filter((o) => o.risk === '주의'), past = A.filter((o) => o.last && o.last < asOf && o.risk !== '판정 불가'), na = A.filter((o) => o.risk === '판정 불가');
    const k = CT.kpis([
      { label: '납기 지연 예상(전 기간)', v: n0(red.length), unit: '건', sub: `<span title="${BASIS}">조치일 지난 ${n0(red.filter((o) => o.last && o.last < asOf).length)}건 포함 · 점검 필요 ${n0(warn.length)}건 별도</span>`, tone: red.length ? 'bad' : 'ok' },
      { label: '해당 물량', v: n0(sum(red.concat(warn), imp)), unit: 't', sub: `지연 예상 ${n0(sum(red, imp))}t · 점검 필요 포함`, tone: red.length ? 'bad' : 'ok' },
      { label: '조치일 지남', v: n0(past.length), unit: '건', sub: `${n0(sum(past, imp))}t`, tone: past.length ? 'bad' : 'ok' },
      { label: '자료 확인 필요', v: n0(na.length), unit: '건', sub: '납기·주문량 없음 · 출하 실적 없음', tone: na.length ? 'warn' : 'ok' },
    ]);
    const chips = [['', '전체', A.length], ...Object.keys(CT.CAUSE).map((c) => [c, CT.CAUSE[c], A.filter((o) => o.cause === c).length])]
      .map(([c, n, cnt]) => `<button type="button" class="co-chip" data-c="${c}" aria-pressed="${c === R.cause}"${cnt || !c ? '' : ' disabled'}>${esc(n)} <b>${n0(cnt)}</b></button>`).join('');
    return k + `<div class="co-chips" role="group" aria-label="원인">${chips}<label class="nw"><input type="checkbox" id="co-rby"${R.by ? ' checked' : ''}> 판매그룹 묶음</label>${allBtn('co-rall')}<span class="cnt" id="co-cnt"></span></div><div class="co-tw" id="co-tbl"></div>` + shipNote().replace('co-sn"', 'co-sn" style="margin:12px 2px 0"');
  }
  function bindRisk() {
    $('co-rby').onchange = (e) => { R.by = e.target.checked; R.lim = 200; drawRisk(); };
    document.querySelectorAll('.co-chip').forEach((b) => b.onclick = () => { R.cause = b.dataset.c; R.lim = 200; drawRisk(); });
    drawRisk();
  }

  /* ---------- #track 주문진도 ---------- */
  // 11/5 사용자 '왜 이런 식으로 화면 구성을 한 거지?' — 상세를 한 줄 상황 → 단계 흐름(가로) → 핵심 숫자 → 속성 격자 순으로, 화면 폭 전체 사용
  /* 매치없음 컬러 주문의 소재: 소재발주현황(SMMTA1080 = 발주·입고 표 — 화면에는 코드를 쓰지 않음) 발주처·발주일·입고납기 / 재고기반(계약번호 6번째 C) / 발주 없음 */
  function poLine(o) {
    if (o.pl !== 'C' || (o.mchT || 0) > 0.0005) return '';
    if (o.po && o.po.no) return `발주 ${esc(o.po.sup || '')} · ${md(o.po.ordDt) || '-'} 발주 · 입고납기 <b>${md(o.po.dle) || '-'}</b>${o.po.entT ? ` · 입고 ${n1(o.po.entT)}t` : ''}`;
    if (o.route === '재고기반') return `재고기반 주문서 · 소재 재고 ${n1(o.matT || 0)}t`;
    if (o.self) return `자가재(도금) ${esc(o.self)}`;
    return '<span class="ct-neg">소재 발주 없음</span>';
  }
  /* 아래 목록 필터 = 위 요약과 같은 단계(11/5 사용자 '밑에 필터링하는 것도 해당 분류로 바꿔'): 컬러 = 매치 전 → 매치 완료 → 부자재 대기 → 작업지시, 도금 = 소재 상태 */
  const stageOf = (o) => (o.pl === 'C' ? catC(o.src || o) : catG(o));
  const STAGES = () => { const seen = new Map(); [...(CT.inScope('C') ? CFG.C.leaves : []), ...(CT.inScope('G') ? CFG.G.leaves : [])].forEach(([k, c]) => { if (!seen.has(k)) seen.set(k, c); }); return [K0, ...MATCHED, KW].filter((k) => seen.has(k)).map((k) => [k, seen.get(k)]); };
  function trackBase() {
    if (T.q) { const q = T.q.toUpperCase(); return L.filter((o) => [o.id, o.item, o.cus, o.man].join(' ').toUpperCase().includes(q)).sort(CT.riskSort).slice(0, 200); }
    const inSum = (o) => (o.pl === 'C' ? (o.remT || 0) > 0.0005 && CAPC[o.line] : CAPG[o.line] && ((o.remT || 0) > 1 || (/^[TQ]$/.test(String(o.id || '').charAt(4)) && (o.remT || 0) > 0.0005)));   // 위 요약(psData)과 같은 범위: 도금 = 1·2CGL · 1,000kg 넘는 것(T·Q 포함)
    return L.filter((o) => !o.closed && !(o.src && o.src.dummy) && inSum(o) && (!PS.line || o.line === PS.line)).sort(CT.riskSort);
  }
  function trackList() { const A = trackBase(); return !T.tag ? A : T.tag === KP ? A.filter((o) => MATCHED.includes(stageOf(o))) : A.filter((o) => stageOf(o) === T.tag); }
  function drawTrackList() {
    const B = trackBase(), A = trackList(), cnt = {}, ton = {};
    B.forEach((o) => { const k = stageOf(o); cnt[k] = (cnt[k] || 0) + 1; ton[k] = (ton[k] || 0) + (o.remT || 0); });
    MATCHED.forEach((k) => { if (cnt[k]) { cnt[KP] = (cnt[KP] || 0) + cnt[k]; ton[KP] = (ton[KP] || 0) + ton[k]; } });
    if (T.tag && !cnt[T.tag]) T.tag = '';
    const st0 = STAGES(), stg = st0.flatMap(([k, c]) => (k === (st0.find((x) => MATCHED.includes(x[0])) || [])[0] ? [[KP, KP, '']] : []).concat([[k, MATCHED.includes(k) ? `└ ${k}` : k, c]]));
    $('co-tc').innerHTML = [['', '전체', B.length, B.reduce((a, o) => a + (o.remT || 0), 0), '']].concat(stg.filter(([k]) => cnt[k]).map(([k, nm, c]) => [k, nm, cnt[k], ton[k], c]))
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
    const sh = o.unshipT == null ? ((o.fwdT || 0) > 0.5 ? `출하 ${n1(o.fwdT)}t` : o.ful === '생산 중' ? '아직 출하 전' : '생산 전') : o.ful === '출하 확인 불가' ? '출하 실적 없음' : o.ful === '출하 완료' ? '출하 완료' : (o.fwdT || 0) > 0.5 ? `출하 ${n1(o.fwdT)}t · 미출하 ${n1(o.unshipT)}t` : '아직 출하 전';
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
      + fig('미출하', o.unshipT == null ? '-' : n1(o.unshipT), o.unshipT == null ? '' : 't', (o.fwdT || 0) > 0.5 ? `출하 ${n1(o.fwdT)}t` : o.unshipT == null || o.ful === '출하 확인 불가' ? '출하 실적 없음' : '')
      + fig('납기', md(o.due) || '-', '', o.pl === 'G' && o.exp && o.ship ? `출항 ${md(o.ship)}` : '') + fig('생산 필요일', md(o.needProd) || '-', '')
      + fig('조치 마감일', md(o.last) || '-', '', left) + '</div>';
    const kv = (k, v) => (v == null || v === '' ? '' : `<div class="g"><span>${esc(k)}</span><b>${v}</b></div>`);
    const grid = `<div class="co-grid">${kv('판매그룹', esc(o.grp) + (o.grpEst ? ' <small>(추정)</small>' : ''))}${kv('고객사', esc(o.cus || ''))}${kv('담당', esc(o.man || ''))}`
      + kv('공정·라인', esc(plName(o))) + kv('품목', esc(o.item)) + kv('두께×폭', esc(o.size)) + kv('지연 근거', o.cause ? esc(CT.why(o)) : '')
      + kv('조치 부서', esc(o.dept || '')) + kv('진행 단계', CT.fulBadge(o.ful)) + kv('생산 완료 예정', o.etaDone ? `${md(o.etaDone)} <small>${esc(o.etaSrc || '')}</small>` : '')
      + kv('소재', esc(o.matSt || '')) + (o.self ? kv('자가재(도금 주문)', esc(o.self)) : '') + (poLine(o) ? kv('소재 발주', poLine(o)) : '') + (o.src && o.src.wst ? kv('작업 상태', esc(o.src.wst)) : '') + '</div>';
    box.innerHTML = `<div class="co-th"><div class="h1"><b>${esc(o.id)}</b>${CT.badge(o)}<span class="who">${[o.cus, o.grp, plName(o)].filter(Boolean).map(esc).join(' · ')}</span></div>`
      + `<p class="co-story">${storyOf(o)}</p></div>${tl}${o.pl === 'G' && o.src && (o.src.purT || o.src.stg) ? `<div class="co-posco"><h4>포스코 진행 <small>F/H ${n1(o.src.purT || 0)}t · 입고 ${n1(o.src.entT || 0)}t${o.src.needIn ? ` · 필요 입고일 ${md(o.src.needIn)}` : ''}</small></h4>${CT.poscoBar(o.src)}</div>` : ''}${figs}${grid}`;
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
  let PS = { line: '', open: '', sk: '', dir: 1 };
  /* 주문진도 단계(11/5 사용자): 주문 총량 → 소재 매치 전 → 소재 매치 후(→ 컬러는 부원료 발주라 부자재 대기 같이) → 작업 대기 → 작업지시량.
     '도금도 컬러랑 동일하게 단어 매칭' — 도금의 소재 매치 = 소재(F/H) 입고 완료, 작업지시량 = 현장 작업지시 목록에 오른 주문. 주문마다 한 칸, 합 = 총량 */
  const K0 = '소재 매치 전', KP = '소재 매치 후';
  const MSUB = [['재고 있음', '규격 맞는 소재 재고 있음 — 매치만 하면 됨'], ['발주 진행', '소재 발주됨 — 입고 대기'], ['발주 없음', '재고·발주 모두 없음 — 소재 발주 필요']];
  const msub = (r) => (r.st === '소재 있음' ? '재고 있음' : r.po || r.st === '입고 대기' ? '발주 진행' : '발주 없음');
  const GSUB = [['포스코 진행', 'F/H 발주·포스코 진행 중 — 필요 입고일 안'], ['입고 지연', '필요 입고일보다 늦음'], ['미발주', '소재 발주 전 — 발주 필요']];
  const gsub = (o) => (o.matSt === '지연' ? '입고 지연' : o.matSt === '미발주' && CT.posco(o.src || {}).pre === '미발주' ? '미발주' : '포스코 진행');   // F/H 발주 기록은 없어도 포스코 주문이 진행 중이면 포스코 진행(아래 포스코 진행 단계 표 '미발주'와 같게)
  const ccAsOf = () => (((D0 || {}).cc_order_progress || {}).asOf || '');
  const paintWait = (r) => r.wst === '부자재입고대기' || (/도료/.test(r.canBy || '') && r.can && r.can > ccAsOf());
  /* 11/5 컬러 담당 피드백: 매치 후 = 부자재 대기 + 작업 대기, 작업지시량 = SSCHC1030 확정 지시(DUMMY 제외)는 따로. 부자재 일정 없는 건 = 부자재 대기 */
  const catC = (r) => {
    if (r.s1030 !== undefined || r.smat !== undefined) {     // 11/9 컬러 담당 기준: 1030 확정 지시 → 작업지시량, 1020 부자재 상태(입고대기·불량·공란) → 부자재 대기·불량·작업 대기
      if (r.s1030) return '작업지시량';
      return (r.mchT > 0.0005) ? (r.smat || '작업 대기') : K0; }
    const cf = (+r.cfmT || 0) > 0.05;   // (예전 자료) 1030 확정 지시가 있으면 작업지시량
    if (cf) return '작업지시량';
    if (!(r.mchT > 0.0005)) return K0;
    if (r.subWait != null) return r.subWait ? '부자재 대기' : '작업 대기';   // 11/9 사용자: 1020 = 매치, PF·도료 입고예정 날짜·시간이 지났으면 작업 대기
    if (r.in1020 === false) return K0;                       // 매치 소재는 있지만 1020 지시가 없음(끝난 지시의 잔량) — 새 지시 필요
    if (paintWait(r)) return '부자재 대기';
    return r.can ? '작업 대기' : '부자재 대기'; };
  const catG = (o) => ((o.src && o.src.woWait) ? '작업지시량' : o.matSt !== '확보' ? K0 : '작업 대기');   // 현장 작업지시에 올랐으면 소재는 있는 것
  const CFG = {
    C: { cat: catC, sub: MSUB, subOf: msub, tiles: ['부자재 대기', '불량', '작업 대기'], leaves: [[K0, '#d03b3b', '매치된 소재 없음 — 아래는 소재 상태'], ['부자재 대기', '#eda100', '작업지시 편성 — 부자재 입고 대기'],
      ['불량', '#9b2c6a', '작업지시 편성 — 부자재 불량'], ['작업 대기', '#2a78d6', '작업지시 편성 — 부자재 준비됨(확정 전)'], ['작업지시량', '#008300', '확정 지시 — DUMMY 고객사 제외 · 지시중량 기준']] },
    G: { cat: catG, sub: GSUB, subOf: gsub, tiles: ['작업 대기'], leaves: [[K0, '#d03b3b', '소재(F/H) 입고 전 — 아래는 소재 상태'], ['작업 대기', '#2a78d6', '소재 입고 끝 — 현장 작업지시 전'], ['작업지시량', '#008300', '현장 작업지시 목록에 오름 — 바로 생산']] },
  };
  const MATCHED = ['부자재 대기', '불량', '작업 대기'], KW = '작업지시량';
  // MES 화면번호는 화면 글자에 쓰지 않고 말풍선(title)에만
  const CODE = { C: { '': 'MES SSCHC1010 작업지시대상선정', '부자재 대기': 'MES SSCHC1020 작업지시 편성 및 확정 — 부자재 상태 입고대기', '불량': 'MES SSCHC1020 — 부자재 상태 불량', '작업 대기': 'MES SSCHC1020 — 부자재 상태 공란', '작업지시량': 'MES SSCHC1030 생산우선순위 확정 지시 — 작업시간 = 지시중량 ÷ 계약 라인 스피드' }, G: {} };
  // 작업시간(h, 24시간 기준): 컬러 = 계약별 실적 t/h(cc_order_progress tph), 작업지시량은 확정 지시 남은 양 기준 · 도금 = 라인 하루 능력 ÷ 24
  const hrsOf = (r, k) => (r.pl === 'G' || r.src ? ((r.remT || 0) / ((r.src && r.src.tph) || (CAPG[r.line] || 800) / 24)) : k === KW ? (r.s1030 ? r.s1030.h : r.cfmHrs != null ? r.cfmHrs : r.hrs) || 0 : MATCHED.includes(k) && r.subT != null && r.tph ? r.subT / r.tph : (r.hrs || 0));
  const tonOf = (r, k) => (!r.src && r.pl !== 'G' && k === KW ? (r.s1030 ? +r.s1030.t : (+r.cfmT || 0)) : !r.src && r.pl !== 'G' && MATCHED.includes(k) && r.subT != null ? +r.subT : (+r.remT || 0));   // 11/10: 1020 단계 = 1020 지시 잔량(1020 화면 지시중량과 같음)   // 11/9: 작업지시량 = 1030 지시중량, 그 밖 = 1010 주문잔여량
  const byLine = (rs, k) => { const o = {}; rs.forEach((r) => { o[r.line] = (o[r.line] || 0) + hrsOf(r, k); }); return o; };
  const dayTxt = (rs, k) => { const h = byLine(rs, k), ls = Object.keys(h).sort(); if (!ls.length) return ''; if (ls.length === 1) return `<b>${(h[ls[0]] / 24).toFixed(1)}일</b>`;
    const mx = ls.reduce((a, l) => (h[l] > h[a] ? l : a), ls[0]); return `최대 <b>${(h[mx] / 24).toFixed(1)}일</b>(${mx})`; };
  function psData(sel) {   // sel = 라인 목록 → {pl, rows[{cat,rem,n}], tot, can, cap, ex, tbl}
    const cc = (D0 || {}).cc_order_progress, out = [];
    const cl = sel.filter((l) => CAPC[l]), gl = sel.filter((l) => CAPG[l]);
    if (cc && cl.length) {
      const shut = new Set((M.C || M.all || []).filter((o) => o.pl === 'C' && o.closed).map((o) => o.src));   // 전량 출하·잔량 미생산 마감(MES 종결 전) — 아래 목록과 같게 뺌
      const R0 = (cc.rows || []).filter((r) => cl.includes(r.line)), R = R0.filter((r) => !shut.has(r) && !r.dummy), cap = cl.reduce((a, l) => a + CAPC[l], 0);
      const ex = cl.reduce((a, l) => { const e = (cc.excl || {})[l] || {}; return { zero: a.zero + ((e.zero || [])[0] || 0), small: a.small + ((e.small || [])[0] || 0), zT: a.zT + ((e.zero || [])[1] || 0), sT: a.sT + ((e.small || [])[1] || 0) }; }, { zero: 0, small: 0, zT: 0, sT: 0 });
      const can = R.filter((r) => r.mchT > 0.0005).reduce((a, r) => a + Math.min(+r.remT || 0, +r.mchT || 0), 0);
      const exA = (k) => cl.reduce((a, l) => { const e = (((cc.excl || {})[l] || {})[k]) || []; return a.map((v, i) => v + (+e[i] || 0)); }, [0, 0, 0, 0, 0]);
      out.push({ pl: 'C', nm: '컬러', R, cap, can, ex: Object.assign(ex, { shut: R0.filter((r) => shut.has(r)).length, dummy: R0.filter((r) => r.dummy && !shut.has(r)).length }), cusLoaded: !!cc.cusLoaded, exZ: exA('zero'), exS: exA('small'), cats: CFG.C.leaves.map(([k, c, t]) => { const rs = R.filter((r) => catC(r) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, r) => a + tonOf(r, k), 0), rs }; }) });   // 11/9: 단계별 톤 = 그 단계의 근거(1030 확정 남은 양·1020 지시 남은 양·그 밖 주문 잔량)
    }
    if (gl.length && (D0 || {}).cg_order_progress) {
      // 11/9 도금도 컬러와 같게: 주문잔여량 1,000kg 넘는 것(계약번호 5번째 T·Q 는 포함)
      const tq = (o) => /^[TQ]$/.test(String(o.id || '').charAt(4));
      const G = (M.G || []).filter((o) => gl.includes(o.line)), R = G.filter((o) => !o.closed && ((o.remT || 0) > 1 || (tq(o) && (o.remT || 0) > 0.0005))), capL = Object.fromEntries((((D0 || {}).cg_order_progress || {}).cover || {}).lines?.filter((x) => x.specDay).map((x) => [x.line, x.specDay]) || []), cap = gl.reduce((a, l) => a + (capL[l] || CAPG[l]), 0);   // 11/9: 하루 능력 = 재계획 하루 톤(도금 주문진도와 같은 값) — 고정 927t 였음
      const gSmall = G.filter((o) => !o.closed && (o.remT || 0) > 0.0005 && (o.remT || 0) <= 1 && !tq(o));
      const can = R.filter((o) => catG(o) !== K0).reduce((a, o) => a + o.remT, 0);
      out.push({ pl: 'G', nm: '도금', R, cap, can, ex: { zero: G.length - R.length - gSmall.length, small: gSmall.length, zT: 0, sT: gSmall.reduce((a, o) => a + (o.remT || 0), 0) }, all: G, cats: CFG.G.leaves.map(([k, c, t]) => { const rs = R.filter((o) => catG(o) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, o) => a + (o.remT || 0), 0), rs }; }) });
    }
    return out;
  }
  const segBar = (cats, tall) => { const T_ = cats.reduce((a, c) => a + c.rem, 0) || 1;
    return `<div class="sb${tall ? ' tall' : ''}" role="img" aria-label="${esc(cats.filter((c) => c.rem > 0.5).map((c) => `${c.k} ${n0(c.rem)}t`).join(', '))}">${cats.filter((c) => c.rem > 0.5).map((c) => { const w = c.rem / T_ * 100;
      return `<span style="flex:${c.rem.toFixed(1)} 0 0;background:${c.c}" title="${esc(`${c.k} ${n0(c.rem)}t · ${c.n}건 (${Math.round(w)}%)`)}">${tall && w >= 7 ? `${Math.round(w)}%` : ''}</span>`; }).join('')}</div>`; };
  function psCard(d, title) {
    const tot = d.R.reduce((a, r) => a + (+r.remT || 0), 0), n = d.cats.reduce((a, c) => a + c.n, 0);   // 11/9: 주문 잔여량 = 1010 주문잔여량 합(작업지시량 칸은 지시중량이라 합과 다를 수 있음)
    const tip = (k) => { const t = CODE[d.pl][String(k).replace(/^└ /, '')]; return t ? ` title="${esc(t)}"` : ''; };
    const tile = (k, v, u, sub, tone = '', ex = '') => `<div class="pt ${tone}${ex ? ' ck' : ''}"${ex ? ` data-ex="${esc(ex)}" role="button" tabindex="0" aria-expanded="${PS.open === ex}"` : ''}${tip(k === '주문 잔여량' ? '' : k)}><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div><div class="s">${sub}</div></div>`;
    const cat = (k) => d.cats.find((c) => c.k === k) || { n: 0, rem: 0, rs: [] }, F = CFG[d.pl], sumT = (rs) => rs.reduce((a, r) => a + (+r.remT || 0), 0);
    const hSum = (rs, k) => rs.reduce((a, r) => a + hrsOf(r, k), 0), xk = (k) => `${d.pl}|${k}`;
    const m0 = cat(K0), mt = d.cats.filter((c) => MATCHED.includes(c.k)), mtR = mt.flatMap((c) => c.rs), mtT = mt.reduce((a, c) => a + c.rem, 0), mtN = mtR.length, w = cat(KW);
    const subT = (k) => sumT(m0.rs.filter((r) => F.subOf(r) === k));
    const m0s = d.pl === 'C' ? (subT('발주 없음') > 0.5 ? ` · <span class="bad">발주 없음 ${n0(subT('발주 없음'))}t</span>` : '') : [['입고 지연', subT('입고 지연')], ['미발주', subT('미발주')]].filter((x) => x[1] > 0.5).map(([k, v]) => ` · <span class="bad">${k} ${n0(v)}t</span>`).join('');
    const hd = (rs, k) => `${n0(hSum(rs, k))}h · ${dayTxt(rs, k)}`;
    const wT = d.pl === 'C' ? w.rem : w.rem, wN = d.pl === 'C' ? w.rs.reduce((a, r) => a + (r.s1030 ? r.s1030.n : (+r.cfmN || 0)), 0) : w.n;
    const gTxt = (rs, k) => { const o = {}; rs.forEach((r) => { const g = String(r.grp || '-').replace(/그룹$|판매그룹$/, ''); o[g] = (o[g] || 0) + tonOf(r, k); }); const e = Object.entries(o).filter((x) => x[1] >= 0.5).sort((a, b) => b[1] - a[1]); return e.length ? `<div class="gq">${e.map(([g, v]) => `<span class="nw">${esc(g)} ${n0(v)}</span>`).join(' · ')}</div>` : ''; };
    const tiles = `<div class="pts p${4 + F.tiles.length}">${tile('주문 잔여량', n0(tot), 't', `<span title="${d.pl === 'C' ? '작업지시대상' : '도금 작업지시대상'} 주문잔여량 1,000kg 넘는 것(계약번호 5번째 T·Q 포함)">${n0(n)}건</span>${gTxt(d.R, '')}`)}`
      + tile(K0, n0(m0.rem), 't', `${n0(m0.n)}건${m0s}${gTxt(m0.rs, K0)}`, m0.rem > 0.5 ? 'bad' : '', xk(K0))
      + tile(KP, n0(mtT), 't', `${n0(mtN)}건 · ${hd(mtR, KP)}${gTxt(mtR, KP)}`, '', xk(KP))
      + F.tiles.map((k) => { const c = cat(k); return tile(`└ ${k}`, n0(c.rem), 't', `${n0(c.n)}건 · ${hd(c.rs, k)}${gTxt(c.rs, k)}`, (k === '부자재 대기' || k === '불량') && c.rem > 0.5 ? 'warn' : '', xk(k)); }).join('')
      + tile(KW, n0(wT), 't', `지시 ${n0(wN)}건${d.pl === 'C' ? ` · 계약 ${n0(w.n)}건` : ''} · ${hd(w.rs, KW)}${gTxt(w.rs, KW)}`, 'ok', xk(KW)) + '</div>';
    const pct = (v) => `${tot ? Math.round(v / tot * 100) : 0}%`;
    const row = (ex, cls, sw, nm, cnt, t, h, dy, txt) => `<tr class="${cls}${ex ? ' ck' : ''}"${ex ? ` data-ex="${esc(ex)}" aria-expanded="${PS.open === ex}"${tip(ex.slice(2))}` : ''}><td class="nw">${sw ? `<i class="sw" style="background:${sw}"></i>` : ''}${nm}${ex ? `<span class="tg">${PS.open === ex ? '▾' : '▸'}</span>` : ''}</td><td class="r">${n0(cnt)}</td><td class="r"><b>${n0(t)}</b></td><td class="r">${pct(t)}</td><td class="r">${h == null ? '<span class="mu">–</span>' : n0(h)}</td><td class="r">${dy || '<span class="mu">–</span>'}</td><td class="mu2">${txt}</td></tr>`;
    let body = row(xk(K0), '', F.leaves[0][1], esc(K0), m0.n, m0.rem, null, '', esc(F.leaves[0][2]))
      + F.sub.map(([k, t]) => { const rs = m0.rs.filter((r) => F.subOf(r) === k), v = sumT(rs); return `<tr class="sub2${rs.length ? '' : ' mu'}"><td class="nw">└ ${esc(k)}</td><td class="r">${n0(rs.length)}</td><td class="r">${n0(v)}</td><td class="r">${pct(v)}</td><td class="r"></td><td class="r"></td><td class="mu2">${esc(t)}</td></tr>`; }).join('')
      + row(xk(KP), 'grp', '', `<b>${KP}</b>`, mtN, mtT, hSum(mtR, KP), dayTxt(mtR, KP), d.pl === 'C' ? '매치 끝 — 부원료 발주·입고 → 작업지시' : '소재 입고 끝 — 작업지시 전')
      + mt.map((c) => row(xk(c.k), `ind${c.n ? '' : ' mu'}`, c.c, esc(c.k), c.n, c.rem, hSum(c.rs, c.k), dayTxt(c.rs, c.k), esc(c.t))).join('')
      + row(xk(KW), w.n ? '' : 'mu', F.leaves[F.leaves.length - 1][1], esc(KW), w.n, w.rem, hSum(w.rs, KW), dayTxt(w.rs, KW), esc(F.leaves[F.leaves.length - 1][2]) + (d.pl === 'C' ? ` · 지시 ${n0(wN)}건` : ''));
    const leg = `<table class="ct-t pl-t"><thead><tr><th>상태 <small>누르면 주문 목록</small></th><th class="r">건수</th><th class="r">잔여량(t)</th><th class="r">비중</th><th class="r">작업시간(h)</th><th class="r">작업가능일</th><th>뜻</th></tr></thead><tbody>${body}`
      + `<tr class="tot"><td>합계</td><td class="r">${n0(n)}</td><td class="r"><b>${n0(tot)}</b></td><td class="r">100%</td><td></td><td></td><td class="mu2">제외: ${d.pl === 'C' ? `1,000kg 이하 ${n0(d.ex.small)}건(T·Q 제외) · 잔여 없음 ${n0(d.ex.zero)}건${d.ex.shut ? ` · 전량 출하·잔량 마감 ${n0(d.ex.shut)}건` : ''}${d.ex.dummy ? ` · DUMMY ${n0(d.ex.dummy)}건` : ''}` : `1,000kg 이하 ${n0(d.ex.small)}건(T·Q 제외) · 잔여 없음·생산 완료 ${n0(d.ex.zero)}건`}</td></tr></tbody></table>`;
    // 라인별 작업가능일(24시간 기준) — 컬러 · 여러 라인일 때
    const ls = [...new Set(d.R.map((r) => r.line))].sort();
    const lday = ls.length < 2 ? '' : (() => { const ks = [[KP, mtR], ...mt.map((c) => [c.k, c.rs]), [KW, w.rs]];
      return `<h4 class="ps-h">라인별 작업가능일 <small>작업시간 ÷ 24시간 · ${d.pl === 'C' ? '계약별 실적 t/h' : '계약별 실적 t/h(라인·강종·부서)'}</small></h4><div class="ct-wrap"><table class="ct-t pos-t"><thead><tr><th></th>${ls.map((l) => `<th class="r">${l}</th>`).join('')}</tr></thead><tbody>`
        + ks.map(([k, rs]) => { const h = byLine(rs, k); return `<tr><td class="nw">${MATCHED.includes(k) ? '└ ' : ''}${esc(k)}</td>${ls.map((l) => `<td class="r">${h[l] ? `<b>${(h[l] / 24).toFixed(1)}</b>일 <small class="mu2">${n0(h[l])}h</small>` : '<span class="mu">–</span>'}</td>`).join('')}</tr>`; }).join('') + '</tbody></table></div>'; })();
    // 도금: 소재 매치 전(소재 입고 전) 물량의 포스코 진행 단계(11/5 사용자)
    const pos = d.pl !== 'G' ? '' : (() => {
      const rs = cat(K0).rs, cols = [['미발주'], ['포스코 접수 전'], ['포스코 착수 전'], ...CT.PH.slice(0, 5).map(([nm]) => [nm]), ['포스코 생산 끝 · 입고 전']], v = Object.fromEntries(cols.map(([k]) => [k, { t: 0, n: 0 }]));
      for (const o of rs) { const P = CT.posco(o.src || {});
        if (P.pre && v[P.pre]) { v[P.pre].t += o.remT || 0; v[P.pre].n++; continue; }
        CT.PH.slice(0, 5).forEach(([nm], i) => { if (P.pt[i] >= 0.05) { v[nm].t += P.pt[i]; v[nm].n++; } }); }
      const sh = cols.filter(([k]) => v[k].n);
      return sh.length ? `<h4 class="ps-h">포스코 진행 단계 <small>소재 매치 전 ${n0(rs.length)}건 · 공정별 F/H 톤(한 주문이 여러 공정에 나뉘어 있을 수 있음)</small></h4><div class="ct-wrap"><table class="ct-t pos-t"><thead><tr>${sh.map(([k]) => `<th class="r">${esc(k)}</th>`).join('')}</tr></thead>`
        + `<tbody><tr>${sh.map(([k]) => `<td class="r"><b>${n0(v[k].t)}</b>t</td>`).join('')}</tr><tr class="mu2">${sh.map(([k]) => `<td class="r">${n0(v[k].n)}건</td>`).join('')}</tr></tbody></table></div>` : '';
    })();
    // 펼친 목록(11/5 컬러 담당 '각 항목 선택하면 데이터 펼쳐서 · 항목별 그룹별도'): 판매그룹 → 계약
    const exp = (() => { if (!PS.open || PS.open.split('|')[0] !== d.pl) return ''; const k = PS.open.slice(2); const sumT = (rs) => rs.reduce((a, r) => a + tonOf(r, MATCHED.includes(k) || k === KP ? catC(r) : k), 0);
      const rs = (k === KP ? mtR : cat(k).rs).slice(), cmpG = (a, b) => String(a.grp).localeCompare(String(b.grp)) || String(a.due || '').localeCompare(String(b.due || ''));
      const XS = { rem: (r) => +r.remT || 0, tph: (r) => (d.pl === 'C' ? +r.tph : r.src && +r.src.tph) || 0, hrs: (r) => hrsOf(r, d.pl === 'C' ? catC(r) : k), due: (r) => r.due || '9999' }, xf = XS[PS.sk];   // 머리글 눌러 정렬(묶음 안에서)
      rs.sort(xf ? (a, b) => String(a.grp).localeCompare(String(b.grp)) || PS.dir * (xf(a) < xf(b) ? -1 : xf(a) > xf(b) ? 1 : 0) : k === KW && d.pl === 'C' ? (a, b) => String(a.grp).localeCompare(String(b.grp)) || (a.cfmSeq ?? 1e9) - (b.cfmSeq ?? 1e9) : cmpG);
      const XK = { '잔여(t)': 'rem', 't/h': 'tph', '작업시간(h)': 'hrs', '납기': 'due' };
      const grps = [...new Set(rs.map((r) => r.grp))];
      const C = d.pl === 'C', head = C ? ['계약번호', '라인', '품명', '두께×폭', '잔여(t)', ...(k === KW ? ['지시 건수', '지시중량(t)'] : MATCHED.includes(k) || k === KP ? ['편성 지시(t)'] : []), 't/h', '작업시간(h)', '납기', k === K0 ? '소재' : k === KW ? '' : '부자재 상태'] : ['주문번호', '라인', '품목', '잔여(t)', 't/h', '작업시간(h)', '납기', '소재'];
      const line = (r) => C ? `<tr><td class="id">${esc(r.con)}</td><td>${esc(r.line)}</td><td>${esc(r.pdt || r.spec || '')}</td><td class="nw">${r.thk ? `${r.thk}×${r.wdt}` : ''}</td><td class="r">${n1(r.remT)}</td>${k === KW ? `<td class="r">${r.s1030 ? r.s1030.n : (r.cfmN || '')}</td><td class="r">${n1(r.s1030 ? r.s1030.t : (r.cfmT || 0))}</td>` : MATCHED.includes(k) || k === KP ? `<td class="r">${r.subT != null ? n1(r.subT) : '–'}</td>` : ''}<td class="r">${r.tph ? n1(r.tph) : '–'}</td><td class="r">${n1(hrsOf(r, catC(r)))}</td><td>${md(r.due) || '-'}</td><td class="nw">${k === K0 ? esc(msub(r)) : k === KW ? '' : esc({ '부자재 대기': '입고대기', '불량': '불량', '작업 대기': '공란' }[catC(r)] || '')}</td></tr>`
        : `<tr><td class="id">${esc(r.id)}</td><td>${esc(r.line || '')}</td><td>${esc(r.item || '')}</td><td class="r">${n1(r.remT)}</td><td class="r">${r.src && r.src.tph ? n1(r.src.tph) : '–'}</td><td class="r">${n1(hrsOf(r, k))}</td><td>${md(r.due) || '-'}</td><td>${esc(gsub(r) && r.matSt === '확보' ? '입고 완료' : gsub(r))}</td></tr>`;
      const cut = 400;
      return `<div class="ps-exp"><div class="ps-exh"><b>${esc(k)}</b> ${n0(rs.length)}건 · ${n0(sumT(rs))}t · ${n0(hSum(rs, k))}h <button type="button" class="ps-x" data-ex="${esc(PS.open)}">닫기</button></div>`
        + `<div class="ps-gs">${grps.map((g) => { const G = rs.filter((r) => r.grp === g); return `<span><b>${esc(g)}</b> ${n0(G.length)}건 · ${n0(sumT(G))}t · ${n0(hSum(G, k))}h</span>`; }).join('')}</div>`
        + `<div class="ct-wrap ps-et"><table class="ct-t"><thead><tr>${head.map((h, i) => `<th${/\(|t\/h/.test(h) ? ' class="r"' : ''}${XK[h] ? ` data-xs="${XK[h]}" aria-sort="${PS.sk === XK[h] ? (PS.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${XK[h] ? `<button type="button">${h}<i>${PS.sk === XK[h] ? (PS.dir > 0 ? '▲' : '▼') : ''}</i></button>` : h}</th>`).join('')}</tr></thead><tbody>`
        + grps.map((g) => { const G = rs.filter((r) => r.grp === g); return `<tr class="gh"><td colspan="${head.length}"><b>${esc(g)}</b> ${n0(G.length)}건 · ${n0(sumT(G))}t · ${n0(hSum(G, k))}h</td></tr>` + G.slice(0, cut).map(line).join(''); }).join('')
        + `</tbody></table></div></div>`; })();
    // 상세 표(SSCHC1010 양식): 건수·주문량·생산량·잔여량·매치량·작업가능일(작업시간 ÷ 24h ÷ 라인 수)
    const ag = (rs) => [rs.length, ...['ordT', 'prodT', 'remT', 'mchT'].map((k) => rs.reduce((a, r) => a + (+r[k] || 0), 0))];
    const nL = Math.max(1, ls.length || 1), dy = (rs, k) => (rs.length ? hSum(rs, k) / 24 / nL : null);
    const tr = (lv, nm, v, y, cls = '') => `<tr class="lv${lv} ${cls}"><td class="nm">${nm}</td>${v.map((x, i) => `<td class="r">${x == null || (i === 4 && d.pl === 'G') ? '<span class="mu">–</span>' : n0(x)}</td>`).join('')}<td class="r">${y == null ? '<span class="mu">–</span>' : `<b>${y.toFixed(1)}</b>`}</td></tr>`;
    const add = (x, y) => x.map((v, i) => v + (y[i] || 0));
    let tb = d.pl === 'C' ? tr(0, '원본 전체', add(add(ag(d.R), d.exS), d.exZ), null, 'b') : tr(0, '원본 전체', ag(d.all || d.R), null, 'b');
    tb += tr(0, '주문 잔여량', ag(d.R), null, 'b') + tr(1, K0, ag(m0.rs), null, 'b') + F.sub.map(([k]) => tr(2, k, ag(m0.rs.filter((r) => F.subOf(r) === k)), null)).join('')
      + tr(1, KP, ag(mtR), dy(mtR, KP), 'b') + mt.map((c) => tr(2, c.k, ag(c.rs), dy(c.rs, c.k))).join('') + tr(1, KW, ag(w.rs), dy(w.rs, KW), 'b')
      + (d.pl === 'C' ? tr(1, '1,000kg 이하(제외, T·Q 제외)', d.exS, null, 'mu') + tr(0, '주문잔여량 없음(제외)', d.exZ, null, 'mu') : tr(0, '잔여 없음·생산 완료(제외)', ag((d.all || []).filter((o) => !d.R.includes(o))), null, 'mu'));
    const det = `<details class="pd"><summary${d.pl === 'C' ? ' title="MES SSCHC1010 양식"' : ''}>상세 표 <small>건수·주문량·생산량·잔여량·매치량·작업가능일(라인 평균)</small></summary><div class="ct-wrap"><table class="ct-t pdt"><thead><tr><th>구분</th><th class="r">건수</th><th class="r">주문량(t)</th><th class="r">생산량(t)</th><th class="r">잔여량(t)</th><th class="r">매치량(t)</th><th class="r">작업가능일</th></tr></thead><tbody>${tb}</tbody></table></div></details>`;
    const note = d.pl === 'G' ? `<p class="ct-note">작업시간 = 주문잔여량 ÷ 계약별 t/h(라인·강종·부서 실적 속도, 1~10월 보정) · 작업가능일 = 라인별 작업시간 ÷ 24시간.</p>` : d.pl === 'C' ? `<p class="ct-note" title="${esc(((D0 || {}).cc_order_progress || {}).tphNote || '컬러 생산 실적')}">작업시간 = 주문잔여량(작업지시량은 확정 지시중량) ÷ 계약별 t/h · 작업가능일 = 라인별 작업시간 ÷ 24시간.${d.cusLoaded ? '' : ' <b>DUMMY 고객사 제외는 고객사 자료(사내 PC 다음 실행)가 들어오면 적용</b>.'}</p>` : '<p class="ct-note">작업시간 = 잔여 ÷ (라인 하루 능력 1CGL 719 · 2CGL 927t ÷ 24).</p>';
    return `<section class="pc"><div class="pch"><b>${esc(title)}</b><span>${md(((D0 || {})[d.pl === 'C' ? 'cc_order_progress' : 'cg_order_progress'] || {}).asOf)} 기준 · ${d.pl === 'C' ? '<span title="MES SSCHC1010">MES 작업지시대상 주문잔여량 기준</span>' : '도금 주문진도(납기 −30~+90일)'}</span></div>${tiles}${segBar(d.cats, true)}<div class="lg2"><div>${leg}</div>${lday || pos ? `<div class="lg2r">${lday}${pos}</div>` : ''}</div>${exp}${det}${note}</section>`;
  }
  function progSum() {
    const cc = (D0 || {}).cc_order_progress;
    const lines = (CT.inScope('G') ? ['1CGL', '2CGL'] : []).concat(CT.inScope('C') ? ((cc || {}).lines || []) : []);
    if (!lines.length) return '';
    if (PS.line && !lines.includes(PS.line)) PS.line = '';
    const tabs = `<div class="seg ct-seg ps-seg" role="group" aria-label="라인">${[['', '전체']].concat(lines.map((l) => [l, l])).map(([k, n]) => `<button type="button" data-l="${k}" aria-pressed="${PS.line === k}">${n}</button>`).join('')}</div>`;
    let body = '';
    if (!PS.line) {
      const mini = lines.map((l) => { const d = psData([l])[0]; if (!d) return ''; const tot = d.cats.reduce((a, c) => a + c.rem, 0), days = d.cap ? d.can / d.cap : null;
        return `<button type="button" class="pm" data-l="${l}"><div class="h"><b>${l}</b><span>${n0(d.cats.reduce((a, c) => a + c.n, 0))}건</span></div><div class="v">${n0(tot)}<small>t 잔여</small></div>${segBar(d.cats, false)}<div class="s">${(() => { const g = (k) => (d.cats.find((c) => c.k === k) || { rem: 0 }).rem; return `<span class="nw">매치 전 <b class="bad">${n0(g(K0))}t</b></span> · <span class="nw">작업지시량 <b>${n0(g('작업지시량'))}t</b></span>`; })()}</div></button>`; }).join('');
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
    const bindPS = () => {
      document.querySelectorAll('.ps-seg button, .pm').forEach((bt) => bt.onclick = () => { PS.line = bt.dataset.l; PS.open = ''; $('co-ps').innerHTML = progSum(); bindPS(); drawTrackList(); const f = trackList()[0]; if (f && !trackList().some((o) => o.id === T.id)) pickTrack(f.id); });
      document.querySelectorAll('#co-ps [data-ex]').forEach((el) => { const go = () => { PS.open = PS.open === el.dataset.ex ? '' : el.dataset.ex; const y = scrollY; $('co-ps').innerHTML = progSum(); bindPS(); scrollTo(0, y); const e = document.querySelector('.ps-exp'); if (e && PS.open) e.scrollIntoView({ block: 'nearest' }); };
        el.onclick = go; el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } }; });
      document.querySelectorAll('#co-ps th[data-xs] button').forEach((b) => (b.onclick = () => { const x = b.parentNode.dataset.xs; if (PS.sk === x) PS.dir = -PS.dir; else { PS.sk = x; PS.dir = x === 'due' ? 1 : -1; } const y = scrollY; $('co-ps').innerHTML = progSum(); bindPS(); scrollTo(0, y); }));
    };
    bindPS();
    drawTrackList(); drawTrackDetail();
  }

  /* ---------- #cal 납기 캘린더 ---------- */
  const monday = (s) => { const d = new Date(s + 'T00:00:00Z'), w = (d.getUTCDay() + 6) % 7; return CT.addD(s, -w); };
  function calDay(d) {
    const act = L.filter((o) => !o.closed && !CT.isStale(o));
    const P = act.filter((o) => o.needProd === d && (o.ful === '생산 전' || o.ful === '생산 중'));
    const S = act.filter((o) => o.due === d);
    const rk = [...new Set(P.concat(S).filter((o) => o.risk === '위험').map((o) => o.id))].length;
    return { P, S, rk };
  }
  const shipT = (o) => (o.pl === 'G' ? o.unshipT || 0 : o.remT || 0);
  function viewCal() {
    // 11/5 사용자 '납기캘린더 수정': 4주 넘기기 → 월 단위 달력(달 경계에서 끊음) · 이번 달 합계 · 날마다 도금/컬러 나눠 톤 크게
    const asOf = M.asOf, m0 = CT.addD(asOf.slice(0, 7) + '-15', 30.4 * calOff | 0).slice(0, 7), first = m0 + '-01';
    const last = CT.addD(CT.addD(first, 40).slice(0, 7) + '-01', -1), lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const both = CT.inScope('G') && CT.inScope('C');
    const split = (A, tf) => ['G', 'C'].filter((p) => CT.inScope(p)).map((p) => { const X = A.filter((o) => o.pl === p); return { p, n: X.length, t: sum(X, tf) }; });
    let cells = '', mP = [], mS = [], mR = new Set();
    for (let i = 0; i < lead; i++) cells += '<div class="co-cd blank" aria-hidden="true"></div>';
    for (let d = first; d <= last; d = CT.addD(d, 1)) {
      const c = calDay(d), past = d < asOf, today = d === asOf, wk = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
      mP = mP.concat(c.P); mS = mS.concat(c.S); c.P.concat(c.S).filter((o) => o.risk === '위험').forEach((o) => mR.add(o.id));
      const has = c.P.length || c.S.length;
      const line = (cls, ic, nm, A, tf) => (A.length ? `<div class="mk ${cls}"><i>${ic}</i>${nm} <b>${n0(sum(A, tf))}t</b> <span>${A.length}건</span>${both ? `<div class="pp">${split(A, tf).filter((x) => x.n).map((x) => `<span class="pl ${x.p}">${x.p === 'G' ? '도금' : '컬러'} ${n0(x.t)}t</span>`).join('')}</div>` : ''}</div>` : '');
      cells += `<div class="co-cd${today ? ' td' : ''}${past ? ' ps' : ''}${wk > 4 ? ' we' : ''}${has ? ' ck' : ''}" data-d="${d}"${has ? ` role="button" aria-label="${md(d)} 주문 ${c.P.length + c.S.length}건"` : ''}>`
        + `<div class="dt"><b>${+d.slice(8)}</b><span>${wd(d)}</span>${today ? '<em>오늘</em>' : ''}${c.rk ? `<em class="rk">지연 ${c.rk}</em>` : ''}</div>`
        + line('p', '■', '생산', c.P, (o) => o.remT) + line('s', '▲', '출하', c.S, shipT) + '</div>';
    }
    const kp = CT.kpis([
      { label: `${+m0.slice(5)}월 생산요청`, v: n0(sum(mP, (o) => o.remT)), unit: 't', tone: 'info', sub: `${n0(mP.length)}건${both ? ' · ' + split(mP, (o) => o.remT).map((x) => `${x.p === 'G' ? '도금' : '컬러'} ${n0(x.t)}t`).join(' · ') : ''}` },
      { label: `${+m0.slice(5)}월 출하완료`, v: n0(sum(mS, shipT)), unit: 't', tone: 'info', sub: `${n0(mS.length)}건${both ? ' · ' + split(mS, shipT).map((x) => `${x.p === 'G' ? '도금' : '컬러'} ${n0(x.t)}t`).join(' · ') : ''}` },
      { label: '지연 예상', v: n0(mR.size), unit: '건', tone: mR.size ? 'bad' : 'ok', sub: '이 달 생산요청·출하완료 주문 중' },
    ]);
    return kp + `<div class="co-calh"><button type="button" class="lnk" id="co-prev" aria-label="이전 달">◀ 이전 달</button><b>${m0.slice(0, 4)}년 ${+m0.slice(5)}월</b>`
      + `<button type="button" class="lnk" id="co-next" aria-label="다음 달">다음 달 ▶</button>${calOff ? '<button type="button" class="lnk" id="co-now">이번 달</button>' : ''}`
      + '<span class="co-lg"><i class="p">■</i> 생산 = 생산요청일(남은 t) · <i class="s">▲</i> 출하 = 출하완료일(미출하 t) · <i class="r">지연 n</i> = 지연 예상</span></div>'
      + `<div class="co-cal"><div class="co-wh">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<div>${x}</div>`).join('')}</div><div class="co-cg">${cells}</div></div>` + shipNote().replace('co-sn"', 'co-sn" style="margin:12px 2px 0"');
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
