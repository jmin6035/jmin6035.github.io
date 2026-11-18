/* 예시(통합안) — docs/34 추천안(1~3단계)을 본 사이트를 건드리지 않고 보여 줌(11/18 사용자 '추천해준 안으로 예시 사이트 만들어봐 내가 보게').
   preview/<화면>.html 은 껍데기: 본 화면(../<화면>.html)을 그대로 불러 <base href="../"> 를 붙여 씀 → 화면 코드·자료(published/)·계산은 본 사이트 한 벌.
   여기서 하는 일은 셋뿐: ① 메뉴(ui/shell.js 가 window.PV_MENU 를 읽음) ② 합친 주소 넘김 ③ 합친 화면에서 겹치는 칸 숨김(같은 숫자 한 곳만) */
(function () {
  'use strict';
  const ROOT = location.pathname.replace(/[^/]*$/, '');           // /preview/
  const file = location.pathname.split('/').pop() || 'index.html';
  const qs = new URLSearchParams(location.search);
  const hash = () => (location.hash || '').slice(1);

  /* ② 넘김: 합친 화면 → 남는 화면(주소는 살아 있음) */
  const ALLF = { 'index.html': 'hy.html', 'supply.html': 'gyehoek.html' };
  const REDIR = {
    'suju.html#prod': 'plating_actual.html', 'suju.html#stock': 'integrated.html',
    'ct_issue.html#req': 'ct_issue.html#now',
    'ct_orders.html#': 'pyeonseong.html', 'ct_orders.html#track': 'pyeonseong.html', 'ct_orders.html#status': 'pyeonseong.html', 'ct_orders.html#risk': 'pyeonseong.html',
    'ct_prod.html#': 'plating_actual.html', 'ct_prod.html#perf': 'plating_actual.html',
    'ct_perf.html#': 'plating_actual.html', 'ct_perf.html#ops': 'plating_actual.html',
  };
  function target() {
    if (ALLF[file]) return ALLF[file];
    const h = hash();
    if (file === 'ct_plan.html' && qs.get('pv') !== 'ins' && (h === '' || h === 'cg' || h === 'cc' || h === 'week')) return 'pyeonseong.html';   // 생산 일정 → 03 주간 편성
    return REDIR[file + '#' + h] || null;
  }

  if (!window.__PVDOC) {   // 껍데기 단계: 넘길 곳이면 바로 넘기고, 아니면 본 화면을 불러 씀
    const t = target();
    if (t) { location.replace(ROOT + t); return; }
    fetch('../' + file, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).then((html) => {
      const v = Date.now().toString(36).slice(0, -4);
      const inj = `<base href="../"><script>window.__PVDOC=1</script><script src="preview/pv.js?v=${v}"></script><link rel="stylesheet" href="preview/pv.css?v=${v}">`;
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inj) : inj + html;
      document.open(); document.write(html); document.close();
    }).catch((e) => { document.body.textContent = '예시 화면을 불러오지 못했습니다(' + e.message + ').'; });
    return;
  }

  /* ① 메뉴: 01 계획 · 02 현황 · 03 생산 편성 · 04 주문·납기 · 05 소재·재고 · 06 생산 실적 + 관리(접힘). 칸 = [화면 id, 주소, 이름, 표시('d' = 세부 탭)] */
  const P = (f) => 'preview/' + f;
  window.PV_MENU = {
    home: P('hy.html'),
    menu: [
      ['v1', '계획', 'supply', [['gyehoek', P('gyehoek.html'), '일별 가동계획'], ['gyehoek', P('gyehoek.html#mat'), '소재'], ['plan7', P('ct_plan.html#cmp'), '조정'], ['status', P('status.html'), '강종 전환']]],
      ['v2', '현황', 'home', [['hy', P('hy.html'), '현황'], ['suju', P('suju.html#dash'), '그룹별'], ['suju', P('suju.html#order'), '수출 선적'], ['board', P('board.html'), '4분기 전망']]],
      ['v3', '생산 편성', 'weekseq', [['wk', P('wk.html'), '주간 관제'], ['pyeonseong', P('pyeonseong.html'), '주간 편성'], ['weekseq', P('week_seq.html'), '작업 순서'], ['seqview', P('seq_view.html'), '작업 순서 조회'], ['plan7', P('ct_plan.html?pv=ins#cg'), '미편성 넣기', 'd']]],
      ['v4', '주문·납기', 'cgorder', [['risk', P('risk.html'), '납기 위험'], ['cgorder', P('cg_order.html'), '도금 주문진도'], ['ccorder', P('cc_order.html'), '컬러 주문진도'], ['orders', P('ct_orders.html#cal'), '납기 캘린더']]],
      ['v5', '소재·재고', 'matcal', [['matcal', P('matcal.html'), '부족·발주'], ['procure', P('procure.html'), '발주'], ['planstock', P('planstock.html'), '계획재'], ['integrated', P('integrated.html'), '제품 재고'], ['prodsum', P('ct_prod.html#ship'), '출하'], ['suju', P('suju.html#mat'), 'Room·장납기 입력', 'd']]],
      ['v6', '생산 실적', 'platact', [['platact', P('plating_actual.html'), '도금 실적'], ['coloract', P('color_actual.html'), '컬러 실적'], ['prodsum', P('ct_prod.html#run'), '가동·휴지'], ['perf', P('ct_perf.html#cause'), '미달 원인'], ['plan7', P('ct_plan.html#load'), '라인 부하']]],
    ],
    admin: [['rules', P('rules.html'), '계획 규칙'], ['plancalc', P('plan_calc.html'), '계획 계산'], ['analysis', P('analysis.html'), '조건 분석'], ['rolling', P('rolling.html'), '도금 다시 계산'], ['colorcalc', P('color_calc.html'), '컬러 다시 계산'],
      ['colorstat', P('color_status.html'), '컬러 가동 현황'], ['leadtime', P('leadtime.html'), '리드타임 기준'], ['health', P('health.html'), '자료 상태'], ['decisions', P('decisions.html'), '결정 기록'], ['cgtasks', P('cg_tasks.html'), '업무 캘린더'],
      ['docs', P('docs.html'), '문서'], ['report', P('report.html'), '주간 보고'], ['suju', P('suju.html#close'), '월 실적 마감'], ['issues', P('ct_issue.html#now'), '이슈 현황']],
  };

  addEventListener('hashchange', () => { const t = target(); if (t) location.replace(ROOT + t); }, true);

  /* ③ 합친 화면: 남길 칸(제목 글자)만 — 나머지 칸은 다른 탭에 같은 숫자가 있어 숨김 */
  const KEEP = {
    'board.html': /4분기 생산·재고 전망/,                       // 나머지(조치·납기 위험·월말 생산 예상) = 02 현황·납기 위험과 같은 숫자
    'suju.html#order': /수출 선적/,                              // 그룹별 수주·월 수주 누적 = 02 현황 '주문'
    'suju.html#mat': /포스코 Room|장납기 월차/,                  // 소재 재고일수·2주 안 발주 = 부족·발주(소재 관제)·발주
    'status.html': /강종 전환 일정|부서별 월 생산량/,            // 7일 계획 대비 실적 = 도금 실적, 월별 가동계획·부하·라인 현황 = 01 계획·라인 부하
    'ct_plan.html?ins': /미편성 주문/,                           // 7일·2주 캘린더·다음 주 확정 = 03 주간 편성
  };
  const keyNow = () => (file === 'ct_plan.html' && qs.get('pv') === 'ins' ? 'ct_plan.html?ins' : KEEP[file] ? file : file + '#' + hash());
  function keepOnly(re) {
    const main = document.getElementById('ct-main') || document.querySelector('main'); if (!main) return;
    const C = [...main.querySelectorAll('section, details.card, .sj-h, .ct-kpis, .b-kpi')];
    const hit = (el) => [...el.querySelectorAll('h2')].some((h) => re.test(h.textContent));
    const keep = new Set(C.filter((c) => (c.matches('section, details') && hit(c)) || c.querySelector('input[type=password]') || /empty|lock/.test(c.id || '')));   // 암호 칸·빈 화면 안내는 늘 남김
    if (!keep.size) return;   // 암호 칸·불러오는 중 화면은 그대로
    C.forEach((c) => { const inKeep = [...keep].some((k) => k !== c && k.contains(c)); if (!keep.has(c) && !inKeep) c.style.display = 'none'; });
  }
  function rewrite() {
    document.querySelectorAll('a[href]:not([data-pv])').forEach((a) => {
      a.dataset.pv = '1';
      const h = a.getAttribute('href'), m = /^(?:\.\/)?([\w-]+\.html)([?#].*)?$/.exec(h);
      if (m) a.setAttribute('href', 'preview/' + m[1] + (m[2] || ''));
      else if (/^#\w/.test(h)) a.setAttribute('href', 'preview/' + file + location.search + h);
    });
  }
  function flag() {
    if (document.getElementById('pv-flag')) return;
    const host = document.querySelector('.shell-head') || document.body; if (!host) return;
    host.insertAdjacentHTML('afterbegin', '<div id="pv-flag" class="pv-flag noprint"><b>예시(통합안)</b><span>메뉴를 합친 미리보기 · 본 사이트는 그대로</span><a href="/hy.html">본 사이트로 ›</a></div>');
    if (!/^\[예시\]/.test(document.title)) document.title = '[예시] ' + document.title;
  }
  function title() {   // 화면 제목 = 지금 탭 이름(합친 화면은 원래 제목 대신 새 메뉴 이름)
    const a = document.querySelector('.ct-tabs a[aria-current], .ct-tabs a.on'), h = document.querySelector('.shell-head h1');
    if (a && h && h.textContent !== a.textContent.trim()) h.textContent = a.textContent.trim();
  }
  let q = 0;
  function apply() {
    q = 0; rewrite(); flag(); title();
    const re = KEEP[keyNow()]; if (re) { keepOnly(re); const sb = document.getElementById('ui-sub'); if (sb) sb.hidden = true; }   // 원래 화면 설명 줄은 남긴 칸과 안 맞음
  }
  const later = () => { if (!q) q = requestAnimationFrame(apply); };
  document.addEventListener('DOMContentLoaded', () => { apply(); new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); });
  addEventListener('hashchange', later);
})();
