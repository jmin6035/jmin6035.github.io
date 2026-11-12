/* 공통 셸: 왼쪽 메뉴(마크·메뉴·보기·화면 모드) + 화면 머리 + 움직임 도우미(UI.reveal / UI.count / UI.toast)
   페이지: <header id="shell" data-page="procure" data-crumb="소재" data-title="소재 발주 검토" data-sub="..."></header> */
(function () {
  'use strict';
  /* 11/12 사용자 '전부 진행해서 가상의 사이트를 만들어 봐 — 내가 먼저 보게': 새 양식 미리보기. 주소에 ?ui=v2 → 이 브라우저에서 계속 새 양식(ui/v2.css), ?ui=old → 원래대로. 기본은 원래 양식 */
  // 11/12 사용자 '본 사이트에 적용' — 새 양식이 기본. ?ui=old = 이전 양식(기억), ?ui=v2 = 새 양식으로 되돌림
  const V2 = (() => { const q = new URLSearchParams(location.search).get('ui'); try { if (q === 'old') localStorage.setItem('ui-old', '1'); if (q === 'v2') localStorage.removeItem('ui-old'); return localStorage.getItem('ui-old') !== '1'; } catch (e) { return q !== 'old'; } })();
  if (V2) { document.documentElement.classList.add('v2'); const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'ui/v2.css?v=' + Date.now().toString(36).slice(0, -4); document.head.appendChild(l); }
  /* 암호 매번 입력(11/2 사용자 '매번 암호 치고 들어가게'): 브라우저에 암호를 남기지 않음 — 화면을 열 때마다 암호 칸이 뜸.
     shell.js 가 화면 스크립트보다 먼저 실행되므로 여기서 암호 키(…-pw) 저장·읽기를 막고, 예전에 저장된 암호도 지움. 되돌리기 = NO_PW_SAVE = false */
  const NO_PW_SAVE = false;   // 11/2 회의 뒤 사용자 '비밀번호 매번 치는거 해제' — 다시 켜려면 true
  if (NO_PW_SAVE) {
    const isPw = (k) => /-pw$/.test(String(k)) || String(k) === 'cgl-plan-publish-v1';
    try { Object.keys(localStorage).filter(isPw).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* 무시 */ }
    const g = Storage.prototype.getItem, s = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { return isPw(k) ? null : g.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (!isPw(k)) s.call(this, k, v); };
  }
  /* 11/4 사용자 '전면 개편'(control_tower_redesign PRD): 공장별 25개 메뉴 → 의사결정 목적 7개. 지금 화면은 각 메뉴의 탭으로 묶고, 단계마다 새 화면으로 바꿈(gadong-plan/docs/22) */
  /* 11/4 2차 진단 3장: 메뉴 탭 = 업무 질문(화면 안에 탭을 또 두지 않음 — '#이름'으로 같은 화면의 하위 화면). 4번째 칸 'h' = 탭 막대에는 안 보이는 전문 화면(메뉴에는 속함) */
  /* 11/10 메뉴 정리(보이는 탭 33 → 24): 칸 = [화면 id, 주소, 이름, 표시]. 표시 't' = 화면 위 탭 막대에만(왼쪽 메뉴에는 묶음 이름만).
     메뉴에서 뺀 화면은 지우지 않고 '관리'에 둠 — 모든 화면이 메뉴로 닿음. 화면 제목(h1) = 메뉴 이름 */
  /* 11/10 사용자 '관리 탭에 왜 전부 몰아놨냐 — 각 탭 성격에 맞게': 관리에 모았던 화면을 성격에 맞는 묶음으로 되돌림.
     표시 'd' = 세부 화면 — 화면 위 탭에는 늘 보이고, 왼쪽 메뉴에는 그 묶음에 들어가 있을 때만 펼침(메뉴가 길어지지 않게) */
  const MENU = [
    ['ct0', '수주 관제', 'cgorder', [['suju', 'suju.html#dash', '종합 관제판'], ['suju', 'suju.html#order', '수주 진도'], ['suju', 'suju.html#prod', '생산'], ['suju', 'suju.html#mat', '소재'], ['suju', 'suju.html#stock', '재고'], ['suju', 'suju.html#close', '월 실적 마감']]],
    ['ct1', '통합 관제', 'home', [['home', 'index.html', '통합 관제', 't'],
      ['board', 'board.html', '판매그룹 관제판', 'd'], ['issues', 'ct_issue.html#now', '이슈 현황', 'd'], ['issues', 'ct_issue.html#req', '조정 요청', 'd']]],
    ['ct2', '주문·납기', 'cgorder', [['risk', 'risk.html', '납기 위험'], ['orders', 'ct_orders.html#track', '주문진도(전체)'], ['orders', 'ct_orders.html#cal', '납기 캘린더'],
      ['cgorder', 'cg_order.html', '도금 주문진도', 'd'], ['ccorder', 'cc_order.html', '컬러 주문진도', 'd']]],
    ['ct3', '생산계획', 'supply', [['supply', 'supply.html', '월간 가동'], ['plan7', 'ct_plan.html', '생산 일정'], ['weekseq', 'week_seq.html', '작업 순서'],
      ['plan7', 'ct_plan.html#load', '라인 부하', 'd'], ['plan7', 'ct_plan.html#cmp', '계획 변경', 'd']]],
    ['ct4', '소재·재고', 'matcal', [['matcal', 'matcal.html', '소재 관제'], ['procure', 'procure.html', '발주'], ['integrated', 'integrated.html', '제품 재고'], ['leadtime', 'leadtime.html', '리드타임 기준'],
      ['planstock', 'planstock.html', '계획재', 'd']]],
    ['ct5', '실적·보고', 'platact', [['platact', 'plating_actual.html', '도금 실적'], ['coloract', 'color_actual.html', '컬러 실적'], ['prodsum', 'ct_prod.html#ship', '출하'], ['perf', 'ct_perf.html#ops', '계획 대비 실적'], ['report', 'report.html', '주간 보고'],
      ['status', 'status.html', '도금 가동 현황', 'd'], ['colorstat', 'color_status.html', '컬러 가동 현황', 'd'], ['prodsum', 'ct_prod.html#perf', '생산 실적', 'd'], ['prodsum', 'ct_prod.html#run', '가동·휴지', 'd'], ['perf', 'ct_perf.html#cause', '미달 원인', 'd']]],
    ['ct6', '계획 기준', 'rules', [['rules', 'rules.html', '계획 규칙'], ['plancalc', 'plan_calc.html', '계획 계산'], ['analysis', 'analysis.html', '조건 분석'], ['rolling', 'rolling.html', '도금 다시 계산', 'd'], ['colorcalc', 'color_calc.html', '컬러 다시 계산', 'd']]],
  ];
  const ADMIN = [['health', 'health.html', '자료 상태'], ['decisions', 'decisions.html', '결정 기록'], ['cgtasks', 'cg_tasks.html', '업무 캘린더'], ['docs', 'docs.html', '문서']];
  const ADMN = '관리';
  /* 11/12 회의: 메뉴 순서 = 보고 순서 ① 계획 → ② 관제 → ③ 편성(docs/16 ★2). 새 양식 미리보기(V2)에서만 맨 위, 기존 메뉴는 '기타'(접힘) 아래 — 기본 화면 메뉴는 그대로 */
  const MV2 = V2 ? [['v1', '계획', 'supply', [['gyehoek', 'gyehoek.html', '일별 가동계획'], ['gyehoek', 'gyehoek.html#mat', '소재']]],
    ['v2', '작업', 'wo', [['weekseq', 'week_seq.html', '작업 순서']]], ['v3', '편성', 'weekseq', [['pyeonseong', 'pyeonseong.html', '편성']]],
    ['v4', '수주', 'home', [['kj', 'kj.html', '수주']]]] : [];   // 11/12 사용자 '관제 → 수주, 순서 = 계획·작업·편성·수주'
  const ETC = '기타', MENUS = [...MV2, ...MENU];
  const ALL = [...MENUS.flatMap((m) => m[3]), ...ADMIN];
  const DEFV = { home: 'day', suju: 'dash', orders: 'status', prodsum: 'perf', perf: 'ops', issues: 'now' };   // 주소에 #이 없을 때 화면이 여는 하위 화면
  const NAV = [...ALL.filter((t, k, A) => A.findIndex((u) => u[1].split('#')[0] === t[1].split('#')[0]) === k).map((t) => [t[0], t[1].split('#')[0], t[2]])];
  /* 공개 화면 제한(11/2 사용자 'IT 보안 검토 동안 가동 캘린더·소재 캘린더·재고 추이만 남기고 나머지 숨김').
     되돌리려면 SHOW = null. 목록에 없는 화면을 직접 열면 가동 캘린더로 보내고, 남긴 화면 안의 다른 화면 링크는 글자만 남김 */
  const SHOW = null;   // 11/2 회의 뒤 사용자 '다시 전부 다 보여줘' — 3화면만 남기려면 ['supply', 'matcal', 'integrated']
  const SHOWF = SHOW && NAV.filter((x) => typeof x !== 'string' && SHOW.includes(x[0])).map((x) => x[1]);
  const HOME = SHOWF ? SHOWF[0] : 'index.html';
  if (SHOWF) {
    const file = (location.pathname.split('/').pop() || 'index.html');
    if (!SHOWF.includes(file)) { document.documentElement.style.visibility = 'hidden'; location.replace(HOME); return; }
    NAV.splice(0, NAV.length, ...NAV.filter((x) => typeof x !== 'string' && SHOW.includes(x[0])));
    const strip = (root) => (root.querySelectorAll ? root.querySelectorAll('a[href]') : []).forEach((a) => {
      const f = (a.getAttribute('href') || '').split(/[?#]/)[0].split('/').pop();
      if (/\.html$/.test(f) && !SHOWF.includes(f)) { a.removeAttribute('href'); a.classList.add('nolink'); }
    });
    const stripGo = () => { strip(document); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { strip(n.parentNode || n); } }))).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stripGo); else stripGo();
  }
  const TKEY = 'cgl-theme', SKEY = 'cgl-scope', NKEY = 'cgl-nav-open';
  const ONLY = { status: 'G', rolling: 'G', platact: 'G', coloract: 'C', planstock: 'C', wo: 'C', colorstat: 'C', colorcalc: 'C' };     // 도금 자료만 있는 화면
  const SCN = { all: '전체', G: '도금', C: '컬러' };
  const DOCS = ['conditions', 'guide', 'requests', 'glossary', 'doc'];
  const UI = window.UI = window.UI || {};
  UI.v2 = V2;   // 새 양식 미리보기 여부 — 화면 스크립트가 표를 새 구성으로 그릴 때 씀(기본 화면은 그대로)

  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  let theme = 'auto'; try { theme = localStorage.getItem(TKEY) || 'auto'; } catch (e) { /* 무시 */ }
  applyTheme(theme);
  let scope = 'all'; try { scope = localStorage.getItem(SKEY) || 'all'; } catch (e) { /* 무시 */ }
  try { const q = new URLSearchParams(location.search).get('pl'); if (q && { G: 1, C: 1, all: 1 }[q]) { scope = q; localStorage.setItem(SKEY, q); } } catch (e) { /* 무시 */ }   // 담당별 주소(?pl=G 도금 · ?pl=C 컬러, 11/5 사용자 '도금/컬러 담당이 따로')
  if (!SCN[scope]) scope = 'all';
  const subs = [];
  UI.scope = () => scope;
  UI.inScope = (p) => scope === 'all' || !p || String(p).includes(scope);
  UI.onScope = (fn) => { subs.push(fn); };
  function setScope(v) {
    scope = v; try { localStorage.setItem(SKEY, v); const u = new URL(location.href); if (v === 'all') u.searchParams.delete('pl'); else u.searchParams.set('pl', v); history.replaceState(null, '', u); } catch (e) { /* 무시 */ }
    document.documentElement.dataset.scope = v;
    document.querySelectorAll('.scope-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sc === v)));
    document.querySelectorAll('.shell-nav a[data-only], .ct-tabs a[data-only]').forEach((a) => a.classList.toggle('dim', v !== 'all' && !a.dataset.only.includes(v)));
    notice();
    subs.forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
  }
  document.documentElement.dataset.scope = scope;
  function notice() {
    const h = document.getElementById('shell'); if (!h) return;
    const only = ONLY[h.dataset.page]; let el = document.getElementById('ui-scope-note');
    const show = only && scope !== 'all' && scope !== only;
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'ui-scope-note'; el.className = 'wrap scope-note'; h.after(el); }
    el.innerHTML = `<div><b>이 화면은 ${SCN[only]} 자료만 있습니다.</b> 현재 '${SCN[scope]}' 보기라 내용이 없습니다 — <button type="button" data-sc="${only}">${SCN[only]} 보기로</button> 또는 <a href="index.html">홈</a>에서 ${SCN[scope]} 화면 선택.</div>`;
    el.querySelector('button').onclick = () => setScope(only);
  }
  /* 메뉴 아이콘(선 아이콘, 24 격자) */
  const IC = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    supply: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h3M13 13h3M8 16.5h3',
    matcal: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M7 13h10M7 16.5h6',
    integrated: 'M4 19V5M4 19h16M7 15l4-4 3 3 5-6',
    report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
    status: 'M4 5h16M4 5v14M8 9h7M10 13h8M6 17h6',
    colorstat: 'M4 5h16M4 5v14M8 9h7M10 13h8M6 17h6',
    rolling: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6',
    colorcalc: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6',
    analysis: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20M8 12.5v-2M10.5 12.5V8M13 12.5v-3',
    coloranal: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20M8 12.5v-2M10.5 12.5V8M13 12.5v-3',
    platact: 'M4 20h16M6 20v-6M10 20V9M14 20v-8M18 20V5',
    coloract: 'M4 20h16M6 20v-6M10 20V9M14 20v-8M18 20V5',
    planstock: 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
    wo: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    cgwo: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    cgtasks: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h3M13 13h3M8 16.5h3',
    plan7: 'M3 5h18v15H3zM3 10h18M9 5v15M15 5v15M5 13h2M11 13h2M17 16h2',
    weekseq: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    plancalc: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6',
    cgcal: 'M3 5h18v15H3zM3 10h18M9 5v15M15 5v15M5 13h2M11 13h2M17 16h2',
    cccal: 'M3 5h18v15H3zM3 10h18M9 5v15M15 5v15M5 13h2M11 13h2M17 16h2',
    procure: 'M3 4h2.5l2.2 11h10.6L20 7H6.6M9 19.5h.01M17 19.5h.01',
    decisions: 'M5 21V4M5 4h11l-2 4 2 4H5',
    health: 'M3 12h4l2.5-6 4 12 2.5-6H21',
    docs: 'M5 4h10l4 4v12H5zM9 12h6M9 16h6M9 8h3',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[k] || IC.docs}"/></svg>`;
  /* 마크: 겹친 강판 띠(도금층·도장층)를 형상화한 자체 도안 — 공식 CI 파일을 받으면 여기만 바꾸면 됨 */
  const MARK = '<svg class="mk" viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="mkc"><rect width="40" height="40" rx="11"/></clipPath></defs><g clip-path="url(#mkc)"><rect width="40" height="40" fill="#1b3f5f"/><path d="M-6 30 30-6h9L3 30z" fill="#3774a1"/><path d="M4 40 40 4v9L13 40z" fill="#6cb1d8"/><path d="M17 40 40 17v8L25 40z" fill="#ffffff" opacity=".92"/></g></svg>';
  const GRPCLR = { 도금: 'var(--gc-g)', 컬러: 'var(--gc-c)', 소재: 'var(--gc-m)', '계획 계산': 'var(--gc-x)' };
  const DOCSP = (pg) => (DOCS.includes(pg) ? 'docs' : pg);
  /* 지금 화면의 메뉴 칸: 화면 id + 주소 # 가 같은 칸 → 없으면 # 없는 칸 → 그 화면의 첫 칸 */
  function curItem(pg) {
    const hs = (location.hash || '').slice(1) || DEFV[pg] || '';
    let C = ALL.filter((x) => x[0] === DOCSP(pg));
    if (V2 && !C.length) { const f = location.pathname.split('/').pop(); C = MV2.flatMap((m) => m[3]).filter((x) => x[1].split('#')[0] === f); }   // 새 화면(계획·관제)의 data-page 이름이 달라도 주소로 찾음
    return C.find((x) => (x[1].split('#')[1] || '') === hs) || C.find((x) => !x[1].includes('#')) || C[0] || null;
  }
  /* 탭 막대 = 한 줄(11/10 서식 기준): 탭이 많거나 화면이 좁으면 줄을 바꾸지 않고 가로로 밀어 봄 — 지금 탭이 보이게 옮기고, 더 있는 쪽 끝을 흐리게(.more-l · .more-r) */
  function tabsFit(h, keep) {
    const n = h.querySelector('.ct-tabs'); if (!n) return;
    const edge = () => { n.classList.toggle('more-l', n.scrollLeft > 4); n.classList.toggle('more-r', n.scrollLeft + n.clientWidth < n.scrollWidth - 4); };
    if (!n.dataset.fit) { n.dataset.fit = '1'; n.addEventListener('scroll', edge, { passive: true }); }
    const a = n.querySelector('a[aria-current]');
    if (a && !keep) { const l = a.offsetLeft - n.offsetLeft; if (l < n.scrollLeft + 24 || l + a.offsetWidth > n.scrollLeft + n.clientWidth - 24) n.scrollLeft = Math.max(0, l - 40); }
    edge();
  }
  const tabKey = (t) => `${t[0]}|${t[1].split('#')[1] || ''}`;
  let built = false, curG = null;
  function build() {
    const h = document.getElementById('shell'); if (!h) return;
    const d = h.dataset, esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let open0 = []; try { open0 = JSON.parse(localStorage.getItem(NKEY) || '[]'); } catch (e) { /* 무시 */ }
    const cur = curItem(d.page), curM = MENUS.find((m) => m[3].includes(cur)) || null, inAdm = ADMIN.includes(cur);
    curG = curM ? curM[0] : inAdm ? ADMN : '';
    const okT = (t) => !SHOWF || SHOWF.includes(t[1].split('#')[0]);
    const mOK = (m) => m[3].some(okT);
    const only = (t) => (ONLY[t[0]] ? ` data-only="${ONLY[t[0]]}"` : '');
    const mlink = (m, i) => { const t0 = m[3].find(okT);
      return `<a href="${t0[1]}" class="nv-m"${m === curM ? ' aria-current="page"' : ''}>${icon(m[2])}<span>${i == null ? '' : `<small class="nv-no">${String(i + 1).padStart(2, '0')}</small>`}${m[1]}</span></a>`; };
    const link = (x) => `<a href="${x[1]}" data-tab="${tabKey(x)}"${only(x)}>${icon(x[0])}<span>${x[2]}</span></a>`;
    const adm = SHOWF ? [] : ADMIN, aOpen = inAdm || open0.includes(ADMN);
    // 메뉴 밑 세부 탭(11/4 사용자 '탭 밑에 세부탭이 뜨게') — 화면에 들어가지 않고 바로 이동
    const subs = (m) => { const L = m[3].filter((t) => t[3] !== 't' && (t[3] !== 'd' || m === curM) && okT(t));
      return L.length > 1 ? `<div class="nv-sub">${L.map((t) => `<a href="${t[1]}" data-tab="${tabKey(t)}"${only(t)}>${esc(t[2])}</a>`).join('')}</div>` : ''; };
    const eOpen = (curM && MENU.includes(curM)) || inAdm || open0.includes(ETC);   // V2 '기타': 지금 화면이 그 안이거나 펼쳐 둔 경우만 열림
    const nav = V2 ? MV2.map((m, i) => mlink(m, i) + subs(m)).join('')
      + `<div class="nv-sec${eOpen ? ' open' : ''}" data-g="${ETC}"><button type="button" class="nv-grp nv-tg" aria-expanded="${eOpen}"><small class="nv-no">${String(MV2.length + 1).padStart(2, '0')}</small>${ETC}<svg class="nv-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><div class="nv-items">`
      + MENU.map((m) => (mOK(m) ? mlink(m, null) + subs(m) : '')).join('') + (adm.length ? `<div class="nv-grp">${ADMN}</div>${adm.map(link).join('')}` : '') + '</div></div>'
      : MENU.map((m, i) => (mOK(m) ? mlink(m, i) + subs(m) : '')).join('')
      + (adm.length ? `<div class="nv-sec${aOpen ? ' open' : ''}" data-g="${ADMN}"><button type="button" class="nv-grp nv-tg" aria-expanded="${aOpen}"><small class="nv-no">${String(MENU.length + 1).padStart(2, '0')}</small>${ADMN}<span class="nv-n">${adm.length}</span><svg class="nv-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><div class="nv-items">${adm.map(link).join('')}</div></div>` : '');
    // 화면 위 탭: 메뉴 묶음의 칸들. 관리 화면은 같은 파일의 하위 화면이 여럿일 때만(예: 생산 실적 · 가동·휴지 · 제품 재고 · 출하)
    const file = cur ? cur[1].split('#')[0] : '';
    const vis = (curM ? curM[3] : inAdm ? ALL.filter((t) => t[1].split('#')[0] === file) : []).filter(okT);
    const tabs = vis.length > 1 ? `<nav class="ct-tabs noprint" aria-label="${esc(curM ? curM[1] : cur[2])} 탭">${vis.map((t, i) => `<a href="${t[1]}" data-tab="${tabKey(t)}"${only(t)}${t[3] === 'd' ? ` class="dt${vis.findIndex((u) => u[3] === 'd') === i && i ? ' dt0' : ''}"` : ''}>${esc(t[2])}</a>`).join('')}</nav>` : '';   // 세부 화면 탭(.dt) = 작은 글씨 + 첫 칸 앞 구분선(.dt0)
    const title = d.titleAuto != null && cur ? cur[2] : (d.title || document.title);   // data-title-auto: 하위 화면(#)마다 제목 = 메뉴 이름
    const crumb = V2 && curM && MV2.includes(curM) ? `${String(MV2.indexOf(curM) + 1).padStart(2, '0')} ${curM[1]}` : V2 && (curM || inAdm) ? `${ETC} · ${curM ? curM[1] : ADMN}`
      : curM ? `${String(MENU.indexOf(curM) + 1).padStart(2, '0')} ${curM[1]}` : inAdm ? `${String(MENU.length + 1).padStart(2, '0')} ${ADMN}` : d.crumb;
    const TH = { auto: '자동', light: '밝게', dark: '어둡게' };
    h.className = 'shell-top';
    h.innerHTML = `<div class="topbar noprint"><button type="button" class="hamb" aria-label="메뉴 열기" aria-expanded="false"><i></i><i></i><i></i></button><a class="brand" href="${HOME}">${MARK}<span class="bt"><b>POSCO STEELEON</b><small>도금·컬러 가동계획</small></span></a><a class="fresh" id="ui-fresh-m" href="health.html" hidden></a></div>
      <aside class="side" aria-label="메뉴">
        <a class="brand" href="${HOME}">${MARK}<span class="bt"><b>POSCO STEELEON</b><small>도금·컬러 가동계획</small></span></a>
        <nav class="shell-nav">${nav}</nav>
        <div class="side-foot noprint">
          <div class="scope"><span>보기</span><div class="scope-seg" role="group" aria-label="공정 보기">${Object.entries(SCN).map(([k, n]) => `<button type="button" data-sc="${k}" aria-pressed="${k === scope}">${n}</button>`).join('')}</div></div>
          <div class="sf-row"><a class="fresh" id="ui-fresh" href="health.html" hidden></a><button type="button" id="ui-theme" class="thm" aria-label="화면 모드">${TH[theme]}</button></div>
        </div>
      </aside>
      <div class="scrim noprint" aria-hidden="true"></div>
      <div class="wrap shell-head"><div class="sh-l">${crumb ? `<div class="crumb">${esc(crumb)}</div>` : ''}<div class="h1row"><h1>${esc(title)}</h1><div class="scope-seg hd-scope noprint" role="group" aria-label="공정 보기">${Object.entries(SCN).map(([k, n]) => `<button type="button" data-sc="${k}" aria-pressed="${k === scope}">${n}</button>`).join('')}</div>${HELP[d.page] ? '<button type="button" class="hbtn noprint" aria-expanded="false" aria-controls="ui-help" title="이 화면 사용법">?</button>' : ''}</div>${d.sub != null ? `<p class="sub" id="ui-sub">${esc(d.sub)}</p>` : ''}${HELP[d.page] ? `<p class="help" id="ui-help" hidden><b>이 화면에서</b>${esc(HELP[d.page])}</p>` : ''}${tabs}</div></div>`;
    document.body.classList.add('has-side');
    const hb = h.querySelector('.hbtn'); if (hb) hb.addEventListener('click', () => { const p = h.querySelector('#ui-help'), v = p.hidden; p.hidden = !v; hb.setAttribute('aria-expanded', String(v)); });
    const open = (v) => { document.body.classList.toggle('nav-open', v); h.querySelector('.hamb').setAttribute('aria-expanded', String(v)); };
    h.querySelector('.hamb').addEventListener('click', () => open(!document.body.classList.contains('nav-open')));
    h.querySelector('.scrim').addEventListener('click', () => open(false));
    h.querySelectorAll('.nv-tg').forEach((b) => b.addEventListener('click', () => {
      const sec = b.parentElement, v = !sec.classList.contains('open'); sec.classList.toggle('open', v); b.setAttribute('aria-expanded', String(v));
      const L = [...h.querySelectorAll('.nv-sec.open')].map((x) => x.dataset.g); try { localStorage.setItem(NKEY, JSON.stringify(L)); } catch (e) { /* 무시 */ }
    }));
    const key = cur ? tabKey(cur) : '';
    h.querySelectorAll('a[data-tab]').forEach((a) => (a.dataset.tab === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    tabsFit(h);
    const curA = h.querySelector('.shell-nav a[data-tab][aria-current]') || h.querySelector('.shell-nav a[aria-current]'); if (curA) requestAnimationFrame(() => curA.scrollIntoView({ block: 'nearest' }));
    h.querySelectorAll('.scope-seg button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.sc !== scope) setScope(b.dataset.sc); }));
    h.querySelectorAll('.shell-nav a[data-only], .ct-tabs a[data-only]').forEach((a) => a.classList.toggle('dim', scope !== 'all' && !a.dataset.only.includes(scope)));
    notice();
    h.querySelector('#ui-theme').addEventListener('click', (e) => {
      theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme]; try { localStorage.setItem(TKEY, theme); } catch (x) { /* 무시 */ }
      applyTheme(theme); e.currentTarget.textContent = TH[theme];
    });
    if (built) return; built = true;
    addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.body.classList.remove('nav-open'); const hm = h.querySelector('.hamb'); if (hm) hm.setAttribute('aria-expanded', 'false'); } });
    /* 주소 # 가 바뀌면 지금 위치 표시를 다시 — 묶음이 바뀌거나(계획 변경 ↔ 주간 생산 일정) 제목이 # 마다 다르면 머리를 다시 그림 */
    addEventListener('hashchange', () => {
      const c2 = curItem(d.page), g2 = MENUS.find((m) => m[3].includes(c2)), k2 = g2 ? g2[0] : ADMIN.includes(c2) ? ADMN : '';
      if (k2 !== curG || d.titleAuto != null) { const nopen = document.body.classList.contains('nav-open'); build(); fresh(); document.body.classList.toggle('nav-open', nopen); return; }
      const kk = c2 ? tabKey(c2) : ''; h.querySelectorAll('a[data-tab]').forEach((a) => (a.dataset.tab === kk ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
      tabsFit(h);
    });
    addEventListener('resize', () => tabsFit(h, true));
  }

  /* 기준일 하나(11/8 사용자 '날짜를 최신으로 통일'): 모든 화면의 '기준일·오늘' = 마지막 자료를 받은 시각(status.json runAt)이 속한 생산일(07시~).
     실적은 그 전날까지(하루가 끝난 날만) — 표시는 '실적 ~11/4 · 자료 11/5 16:50'. 브라우저 시계·화면 계산 시각(built)은 기준일로 쓰지 않음.
     UI.today(fb) = 기준일(status 를 못 받으면 fb → 그래도 없으면 시계 생산일) · UI.basis() = {day, at, act, txt} · UI.statusP = status 받기(화면 그리기 전에 기다림) */
  const kstIso = (t) => { const v = Date.parse(t); return isNaN(v) ? null : new Date(v + 9 * 36e5).toISOString(); };
  const clockDay = () => new Date(Date.now() + 2 * 36e5).toISOString().slice(0, 10);   // 한국 시각 − 7시간
  const mdS = (s) => `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}`;
  UI.basis = () => {
    const S = UI.status; const k = S && S.runAt && kstIso(S.runAt); if (!k) return null;
    const day = new Date(Date.parse(k) - 7 * 36e5).toISOString().slice(0, 10), f = (S.feeds || []).find((x) => x.name === '도금 생산 실적(코일)');
    const act = f && f.last && f.last < day ? f.last : (() => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    return { day, at: `${mdS(k)} ${k.slice(11, 16)}`, act, txt: `실적 ~${mdS(act)} · 자료 ${mdS(k)} ${k.slice(11, 16)}` };
  };
  UI.today = (fb) => (UI.basis() || {}).day || (fb ? String(fb).slice(0, 10) : clockDay());
  UI.statusP = (async () => {
    const urls = ['https://gatcqxrzaonjsixajrwd.supabase.co/storage/v1/object/public/published/status.json?v=' + Date.now(), 'published/status.json'];
    const got = (await Promise.all(urls.map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)))).filter(Boolean);
    if (got.length) UI.status = got.sort((a, b) => (String(a.runAt) < String(b.runAt) ? 1 : -1))[0];
    return UI.status || null;
  })();
  UI.ready = () => Promise.race([UI.statusP, new Promise((r) => setTimeout(r, 4000))]);   // 화면 스크립트: 그리기 전 await UI.ready()
  /* 소재 '발주 마감 지남' 한 기준(11/8 사용자 '화면마다 87·797·4,430·5,514t'): 앞으로 3달 생산에 필요한데 재고·입고 예정으로 못 채우는 양 중
     발주 마감(필요일 − 리드타임 − 투입 여유)이 기준일 전인 몫 — tools/mat_order_spec.py late_summary 가 계산해 mat_order.late 로 게시. 화면은 이 값만 씀
     UI.matLate(late) → {t, items, tip} | null(아직 게시 전) */
  UI.matLate = (L) => {
    if (!L || !L.items) return null;
    const items = L.items.filter((x) => UI.inScope(x.plant));
    return { t: items.reduce((a, x) => a + (x.t || 0), 0), items,
      tip: items.map((x) => `${x.name} ${Math.round(x.t)}t${x.by === 'spec' && x.sizes ? `(${x.sizes.map((s) => `${s[1]} ${s[2]}t`).join(', ')})` : ''}`).join(' · ') };
  };
  /* 11/9: 소재 단위 상태·발주 마감 한 기준 — late = UI.matLate 항목만(3달 총 부족 아님, lateT = 그 몫), soon = 발주 마감 2주 안, plan = 그 뒤, ok = 부족 없음.
     발주 마감 = mat_order(tools/mat_order_spec.py) 의 정해진 발주일(P-FH 화 · 그 외 월 · 수입 10~20일 등 창구), next = 남은 부족의 다음 발주일
     UI.matView(MO = mat_order) → MO.groups.mats 각각 {…m, st, lateT, deadline, next} */
  UI.matView = (MO) => {   // 11/10: 마감일 = mat_order 한 곳(정해진 발주일, 11/9 회의 F14) — 예전 portal 업체별 마감(nearAll)과 섞어 화면마다 날짜가 달랐음
    const G = (MO && MO.groups) || {}, LI = MO && MO.late && MO.late.items ? new Map(MO.late.items.map((x) => [x.key, x])) : null, td = (MO && MO.today) || clockDay();
    const soon = new Date(Date.parse(td + 'T00:00:00Z') + 14 * 864e5).toISOString().slice(0, 10);
    return (G.mats || []).map((m) => {
      const li = LI ? LI.get(m.key) : null, lt = LI ? (li ? li.t || 0 : 0) : m.late || 0;
      const dl = lt >= 0.5 && li && li.deadline ? li.deadline : m.deadline, nx = m.next || (dl && dl >= td ? dl : null);   // 마감 지남 = 지난 발주일, next = 남은 부족의 다음 발주일
      const st = lt >= 0.5 ? 'late' : !(m.short > 0.5) || m.pos ? 'ok' : nx && nx <= soon ? 'soon' : 'plan';   // pos = 포스코 지급(임가공, 우리 발주 아님)
      return Object.assign({}, m, { st, lateT: lt, deadline: dl, next: nx });
    });
  };

  /* 공통 표기(11/10 화면마다 11-10 · 2026-11-10 · '2026. 11. 10.', 톤 · 천톤 · 25K 가 섞여 있던 것):
     UI.fmtDate(v)     → 'M/D'(기준일과 같은 해) · 'YYYY.M.D'(다른 해). v = 'YYYY-MM-DD…' 글자 또는 Date
     UI.fmtDateTime(v) → 'M/D HH:MM'(한국 시각). 시각 없는 날짜만 오면 'M/D'. 그래프 눈금의 천 단위 줄임은 UI.tick('25k', 소문자 k)
     UI.fmtT(v)        → '12,345t'(반올림한 정수 + 천 단위 쉼표 + t). 값이 없으면 '–'
     UI.rate(pct)      → 달성률(실적 ÷ 계획·일정, %) 판정 한 기준 — 홈 · 주간 보고 · 관제 칩이 같은 색:
                         98% 이상 = 'ok'(초록, 초과 달성도 ok) · 90% 이상 98% 미만 = 'warn'(주황) · 90% 미만 = 'bad'(빨강) · 값 없음 = ''
                         (재고처럼 '많아도 문제'인 값은 이 함수를 쓰지 않음) */
  const isoOf = (v) => { if (v == null || v === '') return ''; if (v instanceof Date) return isNaN(v) ? '' : new Date(v.getTime() + 9 * 36e5).toISOString(); let t = String(v).trim(); if (/^\d{2}-\d{2}([ T]\d{2}:\d{2})?$/.test(t)) t = `${UI.today().slice(0, 4)}-${t}`;   // 해 없는 '11-10 09:45'
    return /^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t) ? t.replace(' ', 'T') : (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(t) ? kstIso(t) || '' : (/^\d{4}-\d{2}-\d{2}/.test(t) ? t : '')); };
  UI.fmtDate = (v) => { const k = isoOf(v); if (!k) return v == null || v === '' ? '–' : String(v); const y = k.slice(0, 4), md = `${+k.slice(5, 7)}/${+k.slice(8, 10)}`; return y === UI.today().slice(0, 4) ? md : `${y}.${+k.slice(5, 7)}.${+k.slice(8, 10)}`; };
  UI.fmtDateTime = (v) => { const k = isoOf(v); if (!k) return v == null || v === '' ? '–' : String(v); const md = `${+k.slice(5, 7)}/${+k.slice(8, 10)}`; return /T\d{2}:\d{2}/.test(k) ? `${md} ${k.slice(11, 16)}` : md; };
  UI.fmtT = (v) => (v == null || v === '' || isNaN(+v) ? '–' : `${Math.round(+v).toLocaleString('ko-KR')}t`);
  UI.fmtT1 = (v) => (v == null || v === '' || isNaN(+v) ? '–' : `${(+v).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}t`);
  /* 11/10 서식 기준 추가 — 화면에서 직접 toFixed·toLocaleString·요일 계산을 하지 말고 아래를 씀
     UI.fmtDateW(v)    → 'M/D(화)' — 요일이 판단에 필요한 곳(마감·회의·입항)만. 그 밖의 날짜는 UI.fmtDate
     UI.fmtT1(v)       → '16.9t' — 소수 1자리는 코일·주문 한 건처럼 100t 안팎의 낱개 값만. 합계·KPI 는 정수(UI.fmtT)
     UI.fmtN(v, dec)   → '12,345'(단위 없는 숫자, 표 칸에서 머리글에 단위가 있을 때). 값이 없으면 '–'
     UI.fmtPct(v, dec) → '86.2%'(기본 소수 1자리, 100% 이상도 그대로). 값이 없으면 '–'. 색은 UI.rate
     UI.empty(why, when) → 빈 자료 문구 한 줄(docs/16 5번: 비어 있는 이유 + 언제 채워지는지) — '<p class="empty">…</p>' */
  const WD = '일월화수목금토';
  UI.fmtDateW = (v) => { const k = isoOf(v); if (!k) return UI.fmtDate(v); return `${UI.fmtDate(v)}(${WD[new Date(k.slice(0, 10) + 'T00:00:00Z').getUTCDay()]})`; };
  UI.fmtN = (v, dec = 0) => (v == null || v === '' || isNaN(+v) ? '–' : (+v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  UI.fmtPct = (v, dec = 1) => (v == null || v === '' || isNaN(+v) ? '–' : `${UI.fmtN(v, dec)}%`);
  UI.empty = (why, when) => `<p class="empty">${String(why || '자료 없음').replace(/</g, '&lt;')}${when ? ` <span>${String(when).replace(/</g, '&lt;')}</span>` : ''}</p>`;
  UI.rate = (pct) => (pct == null || pct === '' || isNaN(+pct) ? '' : +pct >= 98 ? 'ok' : +pct >= 90 ? 'warn' : 'bad');

  /* 자료 신선도: status.json(사내 PC 자동 실행기·클라우드 게시 중 최신) → 헤더 배지(기준일 표시) + 오래되면 경고 띠 */
  async function fresh() {
    const h = document.getElementById('shell'); if (!h) return;
    await UI.statusP;
    const S = UI.status, B = UI.basis(); if (!S || !B) return;
    const age = Math.round((Date.parse(clockDay()) - Date.parse(B.day)) / 864e5);   // 기준일이 오늘 생산일보다 며칠 전인가
    const el = document.getElementById('ui-fresh');
    el.hidden = false; el.className = 'fresh ' + (age <= 1 ? 'ok' : age <= 2 ? 'warn' : 'bad');
    el.title = `기준일 ${B.day} · 도금 실적 ~${B.act} · 자료 받은 시각 ${B.at}`;
    el.innerHTML = `<i></i>${B.txt}`;
    const m = document.getElementById('ui-fresh-m'); if (m) { m.hidden = false; m.className = el.className; m.title = el.title; m.innerHTML = el.innerHTML; }
    if (age >= 2 && h.dataset.page !== 'health' && !document.getElementById('ui-stale')) {
      const b = document.createElement('div'); b.id = 'ui-stale'; b.className = 'wrap stale-band';
      b.innerHTML = `<div>⚠ <b>자료가 ${age}일 전(${mdS(B.day)} ${B.at.slice(-5)})에서 멈춰 있습니다.</b> 모든 화면은 기준일 ${mdS(B.day)}(실적 ~${mdS(B.act)}) 기준입니다 — 사내 PC 자동 실행 확인 필요. <a href="health.html">자료 상태 보기 →</a></div>`;
      h.after(b);
    }
  }
  UI.fresh = fresh;

  /* 화면 한 줄 도움말 */
  const HELP = {
    home: '주요 숫자 6개 → 우선 조치(누르면 해당 주문) → 라인별 진도 → 기간 생산 계획. 기간(금일·이번 주(수~화)·이번 달)과 보기(도금·컬러)로 범위를 좁힘',
    integrated: '기준 계획 기준 주별 제품·자가재 재고 추이와 일별 배치 기준. 날짜별 가동은 월간 가동에서',
    status: '도금 1·2CGL 게시 계획(매일 재계획)의 월별 간트·강종 전환·부서별 물량',
    rolling: '판매계획·자가재계획 엑셀로 도금 계획을 새로 계산하거나 실적으로 재계획하고 게시(담당자용). 정기수리를 추가하면 정지 시나리오도 볼 수 있음',
    analysis: '(계획 담당자용) MES 실적으로 도금 속도·M/C 손실·정지, 컬러 라인·품명 t/hr 를 다시 계산해 계획 조건과 비교',
    plancalc: '지금 게시 계획이 어떤 숫자로 계산됐는지 — 그룹 월 계획(판매 + 목표 − 기초), 남은 주문, M/C·정기수리, 결품·지연',
    plan7: '이번 주 라인별 편성·부하 → 생산 캘린더(도금·컬러). 라인 부하·계획 변경은 세부 탭',
    weekseq: '라인별 주간 작업 순서 편집·점검·확정, 작업지시 제안 보기',
    platact: '도금 2라인 이번 달 진도, 일별·주별 생산, 속도, 제품·강종, 휴지, 강종 전환. 컬러 실적과 같은 양식',
    coloract: '컬러 4라인 이번 달 진도, 일별·주별 생산, 속도, 품명, 휴지. 지난주가 12주 평균과 얼마나 다른지',
    colorstat: '컬러 1~4CCL 4분기 계획의 월별 간트(지난 날 = 실적), 라인 한도 대비 편성, 그룹별 물량, 미편성 물량. 도금 가동 현황과 같은 역할',
    colorcalc: '(계획 담당자용) 판매계획·계획재 운영안·휴지계획 엑셀을 올려 컬러 4분기 일별 계획을 다시 계산하고, 현재 게시 계획과 비교한 뒤 게시. 서버와 같은 계산식(브라우저 안에서 실행), 도금은 기준 계획 유지',
    planstock: '계획재 운영안(TF) 88개 사양의 재고·생산·판매 진도와 월말 재고 예측. \'조치 필요\'부터 보고 담당자별로 확인',
    cgcal: '라인별 월말까지 생산 캘린더 — 현장 작업지시(확정)·소재 있는 주문(편성)·입고 예정(예상), 수요일 확정·준수율',
    cccal: '컬러 1~4CCL 라인별 월말까지 생산 캘린더 — MES 작업지시 · 컬러 계획 편성 · 소재 현황',
    cgtasks: '도금 수주 업무 달력 — 날짜·오전/오후별 할 일, 누르면 왜·순서·보는 곳·기준·결과물',
    report: '주 1회 임원 보고 양식. 인쇄/PDF 로 그대로 씀',
    procure: '발주 캘린더로 날짜별 발주 마감·입고 필요를 보고, 판단 목록에서 업체·수량을 정해 구매 요청서를 만듦. 기발주는 입고예정 탭에 넣어야 정확',
    decisions: '회의·보고에서 정한 것과 할 일을 남기고 기한·상태를 추적(공유 설정 후 모두가 같은 기록)',
    health: '숫자가 언제 기준인지 확인. 일일 자료가 2일 넘게 멈추면 사내 PC 자동 실행 점검',
    docs: '계획 조건식·용어 정의·사용법·요청 메일 모음',
    conditions: '계획 계산식과 문제점', guide: '발주 검토 사용 순서', requests: '부서별 협조 요청 메일(복사해 보내기)', glossary: '지표 정의와 근거 미확인 가정',
  };

  /* 표가 있는 카드마다 '엑셀(CSV)' 내려받기 */
  function csvOf(card) {
    const q = (v) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [...card.querySelectorAll('table')].map((t) => [...t.rows].map((r) => [...r.cells].map((c) => q(c.innerText)).join(',')).join('\r\n')).join('\r\n\r\n');
  }
  function addExport(root) {
    (root || document).querySelectorAll('.card').forEach((c) => {
      if (c.querySelector(':scope > .xbtn') || !c.querySelector('table') || c.classList.contains('lock') || c.hasAttribute('data-noexport')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'xbtn noprint'; b.title = '이 카드의 표를 엑셀(CSV)로 받기'; b.textContent = '⤓ 엑셀';
      b.onclick = () => {
        const h = c.querySelector('h2'); const name = `${(document.querySelector('.shell-head h1') || {}).textContent || document.title}_${h ? h.childNodes[0].textContent.trim() : '표'}_${new Date().toISOString().slice(0, 10)}.csv`.replace(/[\\/:*?"<>|]/g, '');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csvOf(c)], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        UI.toast && UI.toast('내려받음: ' + name);
      };
      c.prepend(b);
    });
  }
  function watchExport() {
    const m = document.querySelector('main'); if (!m) return;
    let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => addExport(m), 120); }).observe(m, { childList: true, subtree: true });
    addExport(m);
  }

  UI.sub = (text) => { const s = document.getElementById('ui-sub'); if (s) s.textContent = text; };

  /* 처음 보이는 카드만 차례로 떠오르게(다시 그려도 반복하지 않음) */
  const seen = new Set();
  /* 그래프 눈금(전 화면 공통): 1·2·5 × 10^k 간격, 4~6칸 — 625·1,875·2.6k 같은 어색한 눈금이 안 나오게 */
  /* 판매 그룹 키 → 화면 이름(전 화면 공통): C=컬러, G=도금 */
  const GRP = { G수출: '도금 수출', G국내: '도금 국내', G자동차: '도금 자동차', G자가재: '도금 자가재', C수출: '컬러 수출', C건재: '컬러 건재', C수요: '컬러 수요개발' };
  UI.grp = (k) => GRP[k] || String(k).replace(/^C(?=[가-힣])/, '컬러 ').replace(/^G(?=[가-힣])/, '도금 ');
  UI.niceStep = (raw) => {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  };
  UI.scale = (max, min = 0, n = 5) => {
    const step = UI.niceStep(Math.max(1e-9, max - min) / n);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { lo, hi, step, ticks };
  };
  UI.tick = (v, step) => (Math.abs(v) >= 10000 && step >= 1000 ? `${+(v / 1000).toFixed(step >= 10000 ? 0 : 1)}k` : (step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : Math.round(v).toLocaleString('ko-KR')));
  UI.reveal = (root) => {
    let i = 0;
    (root || document).querySelectorAll('.card, .tile, .kpi').forEach((el) => {
      const k = el.id || el.dataset.rk || (el.className + ':' + (el.textContent || '').slice(0, 24));
      if (seen.has(k)) return; seen.add(k);
      el.style.setProperty('--i', i++); el.classList.add('rv');
    });
  };

  /* 화면 아래쪽 카드는 보일 때 움직임 시작: 처음 그릴 때 화면 밖이던 카드(와 그 안의 막대·선·행 애니메이션)를 멈춰 두었다가
     스크롤해서 들어오면 재생 — 전부 한꺼번에 재생되면 아래쪽은 내려가 볼 때 이미 끝나 있어 움직임이 안 보였음 */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove('rv-wait'); io.unobserve(e.target); } }), { threshold: 0, rootMargin: '0px 0px -40px 0px' }) : null;   // threshold 0: 화면보다 훨씬 긴 카드(cg_wo 표 약 2만px)는 6% 가 한 화면에 안 들어와 영영 안 보였음
  const hold = (el) => {
    if (!io || el.dataset.rvq) return;
    el.dataset.rvq = '1';
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight - 40 || (!r.width && !r.height)) { el.classList.add('rv-wait'); io.observe(el); }   // 화면 아래 또는 아직 숨김(자료 오기 전) → 보일 때 재생
  };
  const scan = (root) => (root.querySelectorAll ? root.querySelectorAll('main .card, main .kpis, main .kstrip, main .lines, main .wk-card, main section') : []).forEach(hold);
  if (io) {
    const go = () => { scan(document); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches('main .card, main section')) hold(n); scan(n); } }))).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }

  /* 숫자 카운트업: <b data-count="1234" data-ck="key"> — 같은 key 의 이전 값에서 새 값으로 */
  const last = {};
  UI.count = (root) => {
    (root || document).querySelectorAll('[data-count]').forEach((el) => {
      const to = +el.dataset.count, key = el.dataset.ck || '', dec = +(el.dataset.dec || 0);
      const from = key in last ? last[key] : 0; last[key] = to;
      const fmt = (v) => v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (from === to) { el.textContent = fmt(to); return; }
      const t0 = performance.now(), dur = 650;
      const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };

  let tt = null;
  UI.toast = (msg) => {
    let el = document.getElementById('ui-toast');
    if (!el) { el = document.createElement('div'); el.id = 'ui-toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1600);
  };

  /* 관제 띠(11/3 사용자 '관제 — 어느 화면에서든 전체가 한눈에'): 홈 관제판과 같은 판매그룹 신호를 모든 화면 머리 아래 한 줄로 */
  async function ctlStrip() {
    const h = document.getElementById('shell'); if (!h || h.dataset.page === 'home' || document.getElementById('ui-ctl')) return;
    let pw = null; for (const k of ['cgl-analysis-pw', 'cgl-supply-pw']) { try { pw = pw || localStorage.getItem(k); } catch (e) { /* 무시 */ } }
    if (!pw) return;
    const wait = (t) => new Promise((r) => setTimeout(r, t));
    for (let i = 0; i < 40 && !(window.GP && GP.latest); i++) await wait(100);
    if (!window.GP || !GP.latest) return;
    if (!UI.ctlRows) await new Promise((res) => { const sc = document.createElement('script'); sc.src = 'ui/ctl.js'; sc.onload = res; sc.onerror = res; document.head.appendChild(sc); });
    if (!UI.ctlRows) return;
    try {
      const [pe, me] = await Promise.all([GP.latest('portal.enc.json'), GP.latest('mat_order.enc.json').catch(() => null)]);
      const O = pe ? await GP.decryptJSON(pe, pw) : null; if (!O) return;
      const MO = me ? await GP.decryptJSON(me, pw).catch(() => null) : null;
      const b = document.createElement('div'); b.id = 'ui-ctl'; b.className = 'wrap ctl-strip';
      /* 11/10: 홈 밖 화면은 한 줄 요약('관제 · 조치 n · 주의 n')만 — 누르면 판매그룹별 값이 펼쳐짐(펼친 상태는 이 탭에서만 기억) */
      let op = false; try { op = sessionStorage.getItem('cgl-ctl-open') === '1'; } catch (e) { /* 무시 */ }
      const draw = () => {   // 전체·도금·컬러 바꾸면 그 공정 판매그룹만 다시(11/5 사용자 '도금 선택해도 컬러가 나온다')
        const R = UI.ctlRows(O, MO) || [], html = R.length ? UI.ctlStrip(O, MO) : ''; b.hidden = !html; if (!html) { b.innerHTML = ''; return; }
        const n = (t) => R.filter((r) => r.w === t).length, nb = n('bad'), nw = n('warn');
        b.classList.toggle('open', op);
        b.innerHTML = `<button type="button" class="cs-sum" aria-expanded="${op}" aria-controls="ui-ctl-all"><b>관제</b>${nb ? `<span class="cs-n bad"><i class="cdot bad"></i>조치 ${nb}</span>` : ''}${nw ? `<span class="cs-n warn"><i class="cdot warn"></i>주의 ${nw}</span>` : ''}${!nb && !nw ? '<span class="cs-n ok"><i class="cdot ok"></i>정상</span>' : ''}<svg class="cs-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="cs-all" id="ui-ctl-all"${op ? '' : ' hidden'}>${html}</div>`;
        b.querySelector('.cs-sum').onclick = () => { op = !op; try { sessionStorage.setItem('cgl-ctl-open', op ? '1' : '0'); } catch (e) { /* 무시 */ } draw(); };
      };
      draw(); (document.getElementById('ui-stale') || h).after(b);
      const mn = document.querySelector('main'); if (mn) { const cs = getComputedStyle(mn); b.style.maxWidth = cs.maxWidth; b.style.paddingLeft = cs.paddingLeft; b.style.paddingRight = cs.paddingRight; }   // 아래 기준일 줄과 왼쪽 맞춤
      UI.onScope(draw);
    } catch (e) { /* 암호가 다르면 띠 생략 */ }
  }
  /* 표 정돈(11/5 사용자 '열 맞춰라 · 과도하게 칸이 늘려져 있다') — 모든 화면 공통:
     ① 머리글 칸 정렬 = 그 열 본문 칸 대부분의 정렬 ② 내용 폭이 자리의 62%도 안 되는 표는 내용 폭만큼만(카드 끝까지 늘이지 않음) */
  function tidyTables() {
    document.querySelectorAll('main table').forEach((t) => {
      if (!t.offsetParent || !t.tBodies[0] || !t.tBodies[0].rows.length || t.dataset.tidy === String(t.tBodies[0].rows.length)) return;
      t.dataset.tidy = String(t.tBodies[0].rows.length);
      const cnt = [];
      { const BR = [...t.tBodies[0].rows].slice(0, 40), bo = BR.map(() => []); BR.forEach((r, ri) => { let ci = 0; [...r.cells].forEach((c) => { while (bo[ri][ci]) ci++; for (let dr = 0; dr < (c.rowSpan || 1) && ri + dr < BR.length; dr++) for (let dc = 0; dc < (c.colSpan || 1); dc++) bo[ri + dr][ci + dc] = 1; if (c.colSpan === 1 && (c.rowSpan || 1) === 1) { const a = getComputedStyle(c).textAlign.replace('start', 'left'); (cnt[ci] = cnt[ci] || {})[a] = ((cnt[ci] || {})[a] || 0) + 1; } ci += c.colSpan || 1; }); }); }
      if (t.tHead) {   // 11/11: 머리글 칸 위치 = 위 줄의 세로 합친 칸(rowspan)을 건너뛴 실제 열 — 예전엔 0부터 세어 두 줄 머리글에서 옆 칸 정렬이 붙었음('판매계획'이 '그룹'처럼 왼쪽)
        const HR = [...t.tHead.rows], occ = HR.map(() => []); const colOf = new Map();
        HR.forEach((r, ri) => { let ci = 0; [...r.cells].forEach((c) => { while (occ[ri][ci]) ci++; colOf.set(c, ci); for (let dr = 0; dr < (c.rowSpan || 1) && ri + dr < HR.length; dr++) for (let dc = 0; dc < (c.colSpan || 1); dc++) occ[ri + dr][ci + dc] = 1; ci += c.colSpan || 1; }); });
        const r = HR[HR.length - 1]; [...r.cells].forEach((c) => { const ci = colOf.get(c); if (c.colSpan === 1 && cnt[ci]) { const m = Object.entries(cnt[ci]).sort((a, b) => b[1] - a[1])[0][0]; if (getComputedStyle(c).textAlign.replace('start', 'left') !== m) c.style.setProperty('text-align', m, 'important'); } }); }
      const box = t.parentElement; if (!box || t.closest('.ch, .ln-c, .rk')) return;
      const full = box.clientWidth; if (full < 500) return;
      if (getComputedStyle(t).tableLayout === 'fixed') return;
      const ncol = Math.max(0, ...[...t.rows].slice(0, 6).map((r) => [...r.cells].reduce((n, c) => n + (c.colSpan || 1), 0)));
      if (ncol >= 5) { t.style.setProperty('width', '100%', 'important'); return; }
      if (ncol === 4) { t.style.setProperty('min-width', Math.round(full * 0.5) + 'px'); }   // 11/11 사용자 '칸 일부러 좁게 쓰냐': 칸 5개 이상 표는 카드 폭 그대로(넓은 화면·배율 축소에서 1,066px 로 뭉치던 원인) — 줄이는 건 2~4칸 작은 표만   // 칸 폭 고정 표(가동 캘린더 등)는 내용 폭이 의미 없음 — 넓은 화면에서 좁게 뭉치던 원인
      const old = t.style.width; t.style.setProperty('width', 'auto', 'important');
      const nat = t.getBoundingClientRect().width;
      if (nat > full * 0.62) { if (old) t.style.width = old; else t.style.removeProperty('width'); }
    });
  }
  /* 긴 표 머리글 붙박이(11/10): 화면 높이보다 긴 표는 스크롤해도 머리글이 위에 남음.
     ① 표가 가로로 넘치지 않으면 CSS sticky — 표를 감싼 가로 스크롤 상자(.scroll)·카드(overflow hidden)가 있으면 sticky 가 그 상자 기준이 되므로 그 상자를 clip 으로 바꿈
     ② 가로로 넘치는 표(가로 스크롤 상자 안 = 좁은 화면 대부분)는 CSS 로 안 되어, 스크롤할 때 머리글 줄을 그만큼 내려 줌(transform)
     세로로 따로 스크롤하는 상자 안의 표는 건드리지 않음. 좁은 화면은 위 막대(.topbar) 높이만큼 내려 붙임. 끄려면 표나 상자에 data-nostick */
  const stkJs = new Set(); let stkTop = 0, stkRaf = 0;
  const stkMove = () => { stkRaf = 0; stkJs.forEach((t) => {
    if (!t.isConnected || !t.tHead) { stkJs.delete(t); return; }
    const r = t.getBoundingClientRect(), hh = t.tHead.offsetHeight;
    const off = r.top < stkTop && r.bottom > stkTop + hh * 2 ? Math.round(Math.min(stkTop - r.top, r.height - hh * 2)) : 0;
    if (off !== t._stk) { t._stk = off; t.tHead.style.transform = off ? `translateY(${off}px)` : ''; }
  }); };
  addEventListener('scroll', () => { if (stkJs.size && !stkRaf) stkRaf = requestAnimationFrame(stkMove); }, { passive: true });
  function stickyHeads() {
    const tb = document.querySelector('.topbar'); stkTop = tb && getComputedStyle(tb).position === 'sticky' ? tb.offsetHeight : 0;
    document.querySelectorAll('main table').forEach((t) => {
      if (!t.tHead || !t.tHead.rows.length || !t.offsetParent || t.closest('.ch, .ln-c, .ct-panel, dialog, [data-nostick]')) return;
      const long = t.offsetHeight > innerHeight * (V2 ? 0.45 : 0.9);
      const boxes = []; let mode = 'css';
      for (let e = t.parentElement; e && e !== document.body && mode !== 'no'; e = e.parentElement) {
        const cs = getComputedStyle(e), ox = cs.overflowX, oy = cs.overflowY, mine = !!e.dataset.stkBox;
        if (!mine && ox === 'visible' && oy === 'visible') continue;
        if (!mine && /clip|visible/.test(ox) && /clip|visible/.test(oy)) continue;
        if (/auto|scroll/.test(oy) && e.scrollHeight > e.clientHeight + 40) mode = 'no';   // 세로로 스크롤하는 상자 = 그 상자가 알아서
        else if (e.scrollWidth > e.clientWidth + 1) mode = 'js';
        else boxes.push(e);
      }
      const css = long && mode === 'css', js = long && mode === 'js';
      const bg = () => [...t.tHead.rows].forEach((r) => [...r.cells].forEach((c) => { if (!c.classList.contains('stk-bg') && /rgba\(.*, 0\)|transparent/.test(getComputedStyle(c).backgroundColor)) c.classList.add('stk-bg'); }));
      if (css) { boxes.forEach((e) => { e.dataset.stkBox = '1'; e.classList.add('stk-box'); }); t.classList.add('stk'); let y = stkTop; [...t.tHead.rows].forEach((r) => { [...r.cells].forEach((c) => { c.style.top = y + 'px'; }); y += r.offsetHeight; }); bg(); }
      else if (t.classList.contains('stk')) { t.classList.remove('stk'); [...t.tHead.rows].forEach((r) => [...r.cells].forEach((c) => c.style.removeProperty('top'))); }
      if (js) { t.classList.add('stk-js'); stkJs.add(t); bg(); }
      else if (stkJs.has(t)) { stkJs.delete(t); t.classList.remove('stk-js'); t.tHead.style.transform = ''; t._stk = 0; }
    });
    document.querySelectorAll('.stk-box').forEach((e) => { if (!e.querySelector('table.stk')) { delete e.dataset.stkBox; e.classList.remove('stk-box'); } });
    stkMove();
  }
  UI.stickyHeads = stickyHeads;
  if (V2) document.addEventListener('toggle', () => tidySoon(), true);   // 접힌 칸을 펼치면 그 안 표도 머리줄 고정·양식 적용
  /* 새 양식(V2): 숫자 칸 오른쪽 정렬 표시(n), 날짜 열이 많은 격자 표(캘린더)는 양식 적용 제외(v2-grid), 한 공장만 다루는 화면은 머리 전환 단추 숨김, 미리보기 표시 */
  const NUMRE = /^[−\-+▲▼△▽±]?\s?[\d][\d,]*(\.\d+)?\s?(t|%|%p|건|일|h|개|천t|톤|t\/h|만)?$/;
  function v2Tidy() {
    if (!V2) return;
    const pg = (document.getElementById('shell') || {}).dataset || {};
    if (['cgorder', 'ccorder', 'platact', 'coloract', 'status', 'colorstat', 'rolling', 'colorcalc', 'docs', 'decisions', 'health', 'cgtasks'].includes(pg.page)) document.documentElement.classList.add('v2-one');
    const h1r = document.querySelector('.h1row');
    if (h1r && !document.getElementById('v2-flag')) h1r.insertAdjacentHTML('beforeend', '<a id="v2-flag" class="noprint" href="?ui=old" title="이전 양식으로 보기">이전 양식</a>');
    document.querySelectorAll('main table').forEach((t) => {
      if (t.dataset.v2 === String(t.rows.length)) return; t.dataset.v2 = String(t.rows.length);
      const ncol = Math.max(0, ...[...t.rows].slice(0, 6).map((r) => [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0)));
      if (ncol >= 16) { t.classList.add('v2-grid'); return; }
      const numCol = new Map();
      [...(t.tBodies[0] || { rows: [] }).rows].forEach((r) => { let k = 0; [...r.cells].forEach((c) => { const txt = c.textContent.replace(/\s+/g, ' ').trim(); const isN = txt && NUMRE.test(txt.replace(/ /g, '')); if (isN) c.classList.add('n'); if (txt) { const m = numCol.get(k) || [0, 0]; m[0] += isN ? 1 : 0; m[1]++; numCol.set(k, m); } k += c.colSpan || 1; }); });
      // 칸 바탕 빨강·주황 옅은 색칠 → 바탕 없애고 글자 색으로(빨강 = 결품·지연 칸만 글자색)
      [...(t.tBodies[0] || { rows: [] }).rows].forEach((r) => [...r.cells].forEach((c) => { const m = getComputedStyle(c).backgroundColor.match(/[\d.]+/g); if (!m || m.length < 4) return; let [R, G, B, A] = m.map(Number); if (R <= 1 && G <= 1 && B <= 1) { R *= 255; G *= 255; B *= 255; } if (A > 0 && A < 0.4 && R > 150 && R - B > 60) { c.style.setProperty('background', 'transparent', 'important'); c.classList.add(G < 100 ? 'v2-r' : 'v2-o'); } }));
      if (t.tHead) { const last = t.tHead.rows[t.tHead.rows.length - 1]; let k = 0; if (last) [...last.cells].forEach((c) => { const m = numCol.get(k); if ((c.colSpan || 1) === 1 && m && m[0] / m[1] >= 0.6) c.classList.add('n'); k += c.colSpan || 1; }); }
      // 정렬(11/12 사용자 '가운데 맞춤 안 된 것'): 기본 가운데, 글자가 긴 열(평균 14자 넘음)만 왼쪽
      const lens = new Map(); [...(t.tBodies[0] || { rows: [] }).rows].forEach((r) => { let k = 0; [...r.cells].forEach((c) => { if ((c.colSpan || 1) === 1) { const L = c.textContent.replace(/\s+/g, ' ').trim().length; const m = lens.get(k) || [0, 0]; m[0] += L; m[1]++; lens.set(k, m); } k += c.colSpan || 1; }); });
      const longCol = new Set([...lens.entries()].filter(([, m]) => m[1] && m[0] / m[1] > 14).map(([k]) => k));
      [...t.rows].forEach((r) => { let k = 0; [...r.cells].forEach((c) => { if ((c.colSpan || 1) === 1 && longCol.has(k)) c.classList.add('v2-l'); k += c.colSpan || 1; }); });
    });
  }
  let tidyT = 0; const tidySoon = () => { clearTimeout(tidyT); tidyT = setTimeout(() => { tidyTables(); try { v2Tidy(); } catch (e) { /* 무시 */ } try { stickyHeads(); } catch (e) { /* 무시 */ } }, 120); };
  const boot = () => { build(); fresh(); watchExport(); ctlStrip(); tidySoon(); try { new MutationObserver(tidySoon).observe(document.querySelector('main') || document.body, { childList: true, subtree: true }); } catch (e) { /* 무시 */ } addEventListener('resize', () => { document.querySelectorAll('main table[data-tidy]').forEach((t) => delete t.dataset.tidy); tidySoon(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  /* 표 줄 번호(--ri) — 줄 나타나기 애니메이션 순서. 새로 그려지는 표도 자동 */
  function tagRows(root) { (root || document).querySelectorAll('table tbody').forEach((tb) => { if (tb.dataset.ri) return; tb.dataset.ri = '1'; [...tb.rows].forEach((r, i) => r.style.setProperty('--ri', i)); }); }
  const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) tagRows(n.tagName === 'TBODY' ? n.parentNode : n); });
  document.addEventListener('DOMContentLoaded', () => { tagRows(); mo.observe(document.body, { childList: true, subtree: true }); });

  /* 긴 설명 문단(90자 넘는 '읽는 법') → 한 줄 + 누르면 펼침(docs/16 설명 문단 금지, 10/30 재검토). data-keep 이면 그대로 */
  const FOLD = 'main p.hint, main p.small, main div.hint, main p.lead-note, main p.tr-note, main p.od-note, main p.cal-note, main p.sj-foot, main p.ct-note';   // 11/10: 보조 글 공통(.ct-note)·수주 관제 산식 줄(.sj-foot)도 90자 넘으면 한 줄 + 자세히
  function foldHints(root) {
    if (document.body.dataset.nofold != null) return;
    const els = [...(root.matches && root.matches(FOLD) ? [root] : []), ...(root.querySelectorAll ? root.querySelectorAll(FOLD) : [])];
    for (const el of els) {
      if (el.dataset.keep != null || el.querySelector('.fold-b, input, select, button, table')) continue;
      const t = el.innerText.replace(/\s+/g, ' ').trim();
      if (t.length <= 90) continue;
      const head = t.split(/(?<=[.。])\s|\s[·—]\s/)[0];
      const lab = head.length <= 48 ? head.replace(/[.。]$/, '') : head.slice(0, 44) + '…';
      el.innerHTML = `<button type="button" class="fold-b" title="${t.replace(/"/g, '&quot;')}">ⓘ ${lab.replace(/</g, '&lt;')} <u>자세히</u></button><span class="fold-x">${el.innerHTML}</span>`;
      el.classList.add('hint-fold');
    }
  }
  document.addEventListener('click', (ev) => { const b = ev.target.closest && ev.target.closest('.fold-b'); if (b) b.parentElement.classList.toggle('open'); });
  const fo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.closest('.fold-x')) foldHints(n.closest('p, .hint') || n); });
  const foldGo = () => { foldHints(document); fo.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', foldGo); else foldGo();

  /* 표 묶음 구분선(11/2 사용자 '칸 구분 진하게 · 월 구분 잘 되게, 다른 표도'): 머리 2줄 이상 = 위 머리 묶음(10월·11월·4분기 등)이 바뀌는 칸,
     머리 1줄 = 월·분기·합계 칸 앞에 진한 세로선(.gsep). 행·열 합치기(rowspan·colspan)를 칸 번호로 풀어서 몸통 칸까지 같은 줄에 */
  function tableSeps(root) {
    (root.querySelectorAll ? root.querySelectorAll('table') : []).forEach((t) => {
      const rows = [...t.rows]; if (!rows.length || !t.tHead) return;
      const key = rows.length + ':' + rows[0].cells.length; if (t.dataset.sep === key) return; t.dataset.sep = key;
      const occ = [], pos = new Map();
      rows.forEach((tr, ri) => { occ[ri] = occ[ri] || []; let c = 0; for (const cell of tr.cells) { while (occ[ri][c]) c++; pos.set(cell, c); const cs = cell.colSpan || 1, rs = Math.min(cell.rowSpan || 1, rows.length - ri); for (let r = 0; r < rs; r++) { occ[ri + r] = occ[ri + r] || []; for (let k = 0; k < cs; k++) occ[ri + r][c + k] = 1; } c += cs; } });
      const head = [...t.tHead.rows], B = new Set();
      if (head.length >= 2) { for (const th of head[0].cells) if ((th.colSpan || 1) > 1) { B.add(pos.get(th)); B.add(pos.get(th) + th.colSpan); } }
      else for (const th of head[0].cells) if (/^\s*('?\d{2}[.년]\s*)?\d{1,2}월|분기|상반기|하반기|^\s*(합계|계|4분기 계)\s*$/.test(th.textContent)) B.add(pos.get(th));
      B.delete(0); if (!B.size) return;
      pos.forEach((c, cell) => { if (B.has(c)) cell.classList.add('gsep'); });
    });
  }
  let tsT = null; const tsGo = () => { tableSeps(document); new MutationObserver(() => { clearTimeout(tsT); tsT = setTimeout(() => tableSeps(document), 150); }).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tsGo); else tsGo();

  /* 칸이 좁아 잘린 글자(… 처리) — 마우스를 올리면 전체 글자를 말풍선으로(docs/16 잘림 금지, 10/30 재검토) */
  document.addEventListener('mouseover', (ev) => {
    for (let e = ev.target, k = 0; e && e.nodeType === 1 && k < 3; e = e.parentElement, k++) {
      if (e.title || e.dataset.clipT) continue;
      if (e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(e).overflowX)) { e.title = e.innerText.trim(); e.dataset.clipT = '1'; break; }
    }
  }, { passive: true });
})();
