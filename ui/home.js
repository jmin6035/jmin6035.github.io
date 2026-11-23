/* 새 디자인(셸)이 아직 안 들어간 페이지용 '홈' 버튼: 오른쪽 아래 고정. 셸이 있는 페이지에서는 아무것도 하지 않음 */
(function () {
  function add() {
    if (document.getElementById('shell') || document.getElementById('ui-home')) return;
    var a = document.createElement('a');
    a.id = 'ui-home'; a.href = 'index.html'; a.setAttribute('aria-label', '홈으로');
    a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg><span>홈</span>';
    a.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:60;display:inline-flex;align-items:center;gap:7px;padding:10px 16px 10px 13px;border-radius:999px;' +
      'background:linear-gradient(180deg,#005bac,#0b3a75);color:#fff;text-decoration:none;font:700 14px "Malgun Gothic",system-ui,sans-serif;' +
      'box-shadow:0 6px 18px rgba(11,58,117,.35);transition:transform .2s,box-shadow .2s';
    a.onmouseenter = function () { a.style.transform = 'translateY(-2px)'; a.style.boxShadow = '0 10px 24px rgba(11,58,117,.45)'; };
    a.onmouseleave = function () { a.style.transform = ''; a.style.boxShadow = '0 6px 18px rgba(11,58,117,.35)'; };
    var st = document.createElement('style'); st.textContent = '@media print{#ui-home{display:none!important}}'; document.head.appendChild(st);
    document.body.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
