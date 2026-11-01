/* 공통 셸: 왼쪽 메뉴(마크·메뉴·보기·화면 모드) + 화면 머리 + 움직임 도우미(UI.reveal / UI.count / UI.toast)
   페이지: <header id="shell" data-page="procure" data-crumb="소재" data-title="소재 발주 검토" data-sub="..."></header> */
(function () {
  'use strict';
  const NAV = [
    ['home', 'index.html', '홈'], ['supply', 'supply.html', '가동 캘린더'], ['matcal', 'matcal.html', '소재 캘린더'], ['integrated', 'integrated.html', '재고 추이'], ['report', 'report.html', '주간 보고'],
    '|도금', ['status', 'status.html', '가동 현황'], ['analysis', 'analysis.html', '조건 분석'], ['platact', 'plating_actual.html', '실적'], ['cgtasks', 'cg_tasks.html', '업무 캘린더'], ['cgorder', 'cg_order.html', '주문진도'], ['cgcal', 'cg_calendar.html', '생산 캘린더'], ['cgwo', 'cg_wo.html', '작업지시 순서'],
    '|컬러', ['colorstat', 'color_status.html', '가동 현황'], ['coloranal', 'color_analysis.html', '조건 분석'], ['coloract', 'color_actual.html', '실적'], ['planstock', 'planstock.html', '계획재'], ['cccal', 'cc_calendar.html', '생산 캘린더'], ['wo', 'wo.html', '작업지시 순서'],
    '|소재', ['procure', 'procure.html', '소재 발주'],
    '|계획 계산', ['rolling', 'rolling.html', '도금 계획 계산'], ['colorcalc', 'color_calc.html', '컬러 계획 계산'], '|',
    ['decisions', 'decisions.html', '결정 기록'], ['rules', 'rules.html', '계획 규칙'], ['health', 'health.html', '자료 상태'], ['docs', 'docs.html', '문서'],
  ];
  /* 공개 화면 제한(11/2 사용자 'IT 보안 검토 동안 가동 캘린더·소재 캘린더·재고 추이만 남기고 나머지 숨김').
     되돌리려면 SHOW = null. 목록에 없는 화면을 직접 열면 가동 캘린더로 보내고, 남긴 화면 안의 다른 화면 링크는 글자만 남김 */
  const SHOW = ['supply', 'matcal', 'integrated'];
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
  const ONLY = { status: 'G', analysis: 'G', rolling: 'G', platact: 'G', coloract: 'C', planstock: 'C', wo: 'C', colorstat: 'C', coloranal: 'C', colorcalc: 'C' };     // 도금 자료만 있는 화면
  const SCN = { all: '전체', G: '도금', C: '컬러' };
  const DOCS = ['conditions', 'guide', 'requests', 'glossary', 'doc'];
  const UI = window.UI = window.UI || {};

  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  let theme = 'auto'; try { theme = localStorage.getItem(TKEY) || 'auto'; } catch (e) { /* 무시 */ }
  applyTheme(theme);
  let scope = 'all'; try { scope = localStorage.getItem(SKEY) || 'all'; } catch (e) { /* 무시 */ }
  if (!SCN[scope]) scope = 'all';
  const subs = [];
  UI.scope = () => scope;
  UI.inScope = (p) => scope === 'all' || !p || String(p).includes(scope);
  UI.onScope = (fn) => { subs.push(fn); };
  function setScope(v) {
    scope = v; try { localStorage.setItem(SKEY, v); } catch (e) { /* 무시 */ }
    document.documentElement.dataset.scope = v;
    document.querySelectorAll('.scope-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sc === v)));
    document.querySelectorAll('.shell-nav a[data-only]').forEach((a) => a.classList.toggle('dim', v !== 'all' && !a.dataset.only.includes(v)));
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
    el.innerHTML = `<div><b>이 화면은 ${SCN[only]} 자료만 있습니다.</b> 현재 '${SCN[scope]}' 보기라 내용이 없습니다 — <button type="button" data-sc="${only}">${SCN[only]} 보기로</button> 또는 <a href="index.html">홈</a>에서 ${SCN[scope]} 화면을 고르세요.</div>`;
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
  function build() {
    const h = document.getElementById('shell'); if (!h) return;
    const d = h.dataset, esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // 메뉴: '경영 보고'(오너용 5개)는 늘 펼침, 나머지 실무 묶음은 접어 두고 머리글을 누르면 펼침(지금 화면이 든 묶음은 자동으로 펼침, 펼친 상태 기억)
    let open0 = []; try { open0 = JSON.parse(localStorage.getItem(NKEY) || '[]'); } catch (e) { /* 무시 */ }
    const secs = []; let cur = { g: SHOWF ? '가동계획' : '경영 보고', items: [] }; secs.push(cur);
    NAV.forEach((x) => { if (typeof x === 'string') { cur = { g: x.slice(1) || '관리', items: [] }; secs.push(cur); } else cur.items.push(x); });
    const link = (x) => { const on = x[0] === d.page || (x[0] === 'docs' && DOCS.includes(d.page));
      return `<a href="${x[1]}"${on ? ' aria-current="page"' : ''}${ONLY[x[0]] ? ` data-only="${ONLY[x[0]]}"` : ''}>${icon(x[0])}<span>${x[2]}</span></a>`; };
    const nav = secs.map((S, i) => {
      if (i === 0) return `<div class="nv-grp first">${S.g}</div>${S.items.map(link).join('')}`;
      const here = S.items.some((x) => x[0] === d.page || (x[0] === 'docs' && DOCS.includes(d.page))), op = here || open0.includes(S.g);
      return `${i === 1 ? '<div class="nv-sup">실무</div>' : ''}<div class="nv-sec${op ? ' open' : ''}" data-g="${S.g}"><button type="button" class="nv-grp nv-tg" aria-expanded="${op}"${GRPCLR[S.g] ? ` style="--gk:${GRPCLR[S.g]}"` : ''}>${S.g}<span class="nv-n">${S.items.length}</span><svg class="nv-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><div class="nv-items">${S.items.map(link).join('')}</div></div>`;
    }).join('');
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
      <div class="wrap shell-head"><div class="sh-l">${d.crumb ? `<div class="crumb">${esc(d.crumb)}</div>` : ''}<div class="h1row"><h1>${esc(d.title || document.title)}</h1>${HELP[d.page] ? '<button type="button" class="hbtn noprint" aria-expanded="false" aria-controls="ui-help" title="이 화면 사용법">?</button>' : ''}</div>${d.sub != null ? `<p class="sub" id="ui-sub">${esc(d.sub)}</p>` : ''}${HELP[d.page] ? `<p class="help" id="ui-help" hidden><b>이 화면에서</b>${esc(HELP[d.page])}</p>` : ''}</div></div>`;
    document.body.classList.add('has-side');
    const hb = h.querySelector('.hbtn'); if (hb) hb.addEventListener('click', () => { const p = h.querySelector('#ui-help'), v = p.hidden; p.hidden = !v; hb.setAttribute('aria-expanded', String(v)); });
    const open = (v) => { document.body.classList.toggle('nav-open', v); h.querySelector('.hamb').setAttribute('aria-expanded', String(v)); };
    h.querySelector('.hamb').addEventListener('click', () => open(!document.body.classList.contains('nav-open')));
    h.querySelector('.scrim').addEventListener('click', () => open(false));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
    h.querySelectorAll('.nv-tg').forEach((b) => b.addEventListener('click', () => {
      const sec = b.parentElement, v = !sec.classList.contains('open'); sec.classList.toggle('open', v); b.setAttribute('aria-expanded', String(v));
      const L = [...h.querySelectorAll('.nv-sec.open')].map((x) => x.dataset.g); try { localStorage.setItem(NKEY, JSON.stringify(L)); } catch (e) { /* 무시 */ }
    }));
    const curA = h.querySelector('.shell-nav a[aria-current]'); if (curA) requestAnimationFrame(() => curA.scrollIntoView({ block: 'nearest' }));
    h.querySelectorAll('.scope-seg button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.sc !== scope) setScope(b.dataset.sc); }));
    h.querySelectorAll('.shell-nav a[data-only]').forEach((a) => a.classList.toggle('dim', scope !== 'all' && !a.dataset.only.includes(scope)));
    notice();
    h.querySelector('#ui-theme').addEventListener('click', (e) => {
      theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme]; try { localStorage.setItem(TKEY, theme); } catch (x) { /* 무시 */ }
      applyTheme(theme); e.currentTarget.textContent = TH[theme];
    });
  }

  /* 자료 신선도: status.json(사내 PC 자동 실행기·클라우드 게시 중 최신) → 헤더 배지 + 오래되면 경고 띠 */
  const FEED = { platact: 'MES 도금 실적', coloract: '컬러 생산 실적', planstock: '컬러 생산 실적', coloranal: '컬러 생산 실적', procure: '소재재고List(컬러)' };
  async function fresh() {
    const h = document.getElementById('shell'); if (!h) return;
    const urls = ['https://gatcqxrzaonjsixajrwd.supabase.co/storage/v1/object/public/published/status.json?v=' + Date.now(), 'published/status.json'];
    const got = (await Promise.all(urls.map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)))).filter(Boolean);
    if (!got.length) return;
    const S = got.sort((a, b) => (String(a.runAt) < String(b.runAt) ? 1 : -1))[0];
    UI.status = S;
    const want = FEED[h.dataset.page] || '도금 생산 실적(코일)';
    const f = (S.feeds || []).find((x) => x.name === want) || (S.feeds || [])[0];
    if (!f || !f.last) return;
    const today = new Date(Date.now() - 7 * 3600e3); const d0 = new Date(f.last + 'T00:00:00');   // 생산일(07시 기준)
    const age = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - d0) / 864e5);
    const el = document.getElementById('ui-fresh');
    el.hidden = false; el.className = 'fresh ' + (age <= 1 ? 'ok' : age <= 2 ? 'warn' : 'bad');
    el.title = `${want} 마지막 날짜 · 게시 ${String(S.runAt || '').replace('T', ' ').slice(0, 16)}`;
    el.innerHTML = `<i></i>자료 ~${+f.last.slice(5, 7)}/${+f.last.slice(8, 10)}${age >= 1 ? ` · ${age}일 전` : ''}`;
    const m = document.getElementById('ui-fresh-m'); if (m) { m.hidden = false; m.className = el.className; m.title = el.title; m.innerHTML = el.innerHTML; }
    if (age >= 2 && h.dataset.page !== 'health' && !document.getElementById('ui-stale')) {
      const b = document.createElement('div'); b.id = 'ui-stale'; b.className = 'wrap stale-band';
      b.innerHTML = `<div>⚠ <b>자료가 ${age}일 전(${f.last})에서 멈춰 있습니다.</b> 수치는 해당 일자 기준입니다 — 사내 PC 자동 실행을 확인하세요. <a href="health.html">자료 상태 보기 →</a></div>`;
      h.after(b);
    }
  }
  UI.fresh = fresh;

  /* 화면 한 줄 도움말 */
  const HELP = {
    home: '매일 아침: 금일 확인 사항 → 주요 지표 → 필요한 화면으로 이동. 역할과 보기(도금/컬러)를 선택하면 해당 항목만 표시',
    integrated: '확정 계획 기준 주별 제품·자가재 재고 추이와 일별 배치 기준. 날짜별 가동은 가동 캘린더, 라인별 일정은 가동 현황에서',
    status: '도금 1·2CGL 게시 계획(매일 재계획)의 월별 간트·강종 전환·부서별 물량',
    rolling: '판매계획·자가재계획 엑셀로 도금 계획을 새로 계산하거나 실적으로 재계획하고 게시(담당자용). 정기수리를 추가하면 정지 시나리오도 볼 수 있음',
    analysis: '(계획 담당자용) MES 도금 실적으로 속도·M/C 손실·정지를 재산출해 계획 조건과 비교 — 반영권장 값은 계획 계산에 넣을 후보',
    platact: '도금 2라인 이번 달 진도, 일별·주별 생산, 속도, 제품·강종, 휴지, 강종 전환. 컬러 실적과 같은 양식',
    coloract: '컬러 4라인 이번 달 진도, 일별·주별 생산, 속도, 품명, 휴지. 지난주가 12주 평균과 얼마나 다른지',
    colorstat: '컬러 1~4CCL 4분기 계획의 월별 간트(지난 날 = 실적), 라인 한도 대비 편성, 그룹별 물량, 못 넣은 물량. 도금 가동 현황과 같은 역할',
    colorcalc: '(계획 담당자용) 판매계획·계획재 운영안·휴지계획 엑셀을 올려 컬러 4분기 일별 계획을 다시 계산하고, 현재 게시 계획과 비교한 뒤 게시. 서버와 같은 계산식(브라우저 안에서 실행), 도금은 확정 계획 유지',
    coloranal: '(계획 담당자용) MES 컬러 실적으로 라인·품명 t/hr 를 재산출해 계획 조건과 비교 — 라인 속도 차이가 ±5%를 넘으면 계획 조건 조정 검토',
    planstock: '계획재 운영안(TF) 187개 사양의 재고·생산·판매 진도와 월말 재고 예측. \'조치 필요\'부터 보고 담당자별로 확인',
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
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove('rv-wait'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -40px 0px' }) : null;
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

  const boot = () => { build(); fresh(); watchExport(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  /* 표 줄 번호(--ri) — 줄 나타나기 애니메이션 순서. 새로 그려지는 표도 자동 */
  function tagRows(root) { (root || document).querySelectorAll('table tbody').forEach((tb) => { if (tb.dataset.ri) return; tb.dataset.ri = '1'; [...tb.rows].forEach((r, i) => r.style.setProperty('--ri', i)); }); }
  const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) tagRows(n.tagName === 'TBODY' ? n.parentNode : n); });
  document.addEventListener('DOMContentLoaded', () => { tagRows(); mo.observe(document.body, { childList: true, subtree: true }); });

  /* 긴 설명 문단(90자 넘는 '읽는 법') → 한 줄 + 누르면 펼침(docs/16 설명 문단 금지, 10/30 재검토). data-keep 이면 그대로 */
  const FOLD = 'main p.hint, main p.small, main div.hint, main p.lead-note, main p.tr-note, main p.od-note, main p.cal-note';
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

  /* 칸이 좁아 잘린 글자(… 처리) — 마우스를 올리면 전체 글자를 말풍선으로(docs/16 잘림 금지, 10/30 재검토) */
  document.addEventListener('mouseover', (ev) => {
    for (let e = ev.target, k = 0; e && e.nodeType === 1 && k < 3; e = e.parentElement, k++) {
      if (e.title || e.dataset.clipT) continue;
      if (e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(e).overflowX)) { e.title = e.innerText.trim(); e.dataset.clipT = '1'; break; }
    }
  }, { passive: true });
})();
