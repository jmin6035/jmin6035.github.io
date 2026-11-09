/* 공통 월 캘린더 — "이 날 무엇을 해야 하나"를 한눈에.
   UI.cal(el, {
     months: ['2026-10', …], month: '2026-10',            // 보여줄 달(탭)
     kinds: { order: { name: '발주 마감', color: 'var(--bad)' }, … },   // 종류(범례·필터, 순서 = 칸 안 표시 순서)
     events: [{ d: 'YYYY-MM-DD', kind, chip: '짧은 글', tone?: 'bad'|'warn'|'ok', … }],
     detail: (d, evs) => HTML,                              // 날짜를 누르면 아래에 보일 상세
     today: 'YYYY-MM-DD', maxChips: 4, note: '설명 한 줄'
   })
   날짜 칸: 숫자(오늘 테두리, 주말 빨강) + 종류별 칩(색 = 종류, 진하기 = 급함). 칩이 많으면 '+n건'. */
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['월', '화', '수', '목', '금', '토', '일'];
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  UI.cal = function (el, o) {
    const st = { month: o.month || o.months[0], sel: null, off: new Set(o.off || []) };
    const kindKeys = Object.keys(o.kinds);
    const byDay = {};
    for (const e of o.events) (byDay[e.d] = byDay[e.d] || []).push(e);
    const ord = (e) => kindKeys.indexOf(e.kind);
    const today = o.today || (window.UI && UI.today ? UI.today() : new Date(Date.now() - 7 * 3600e3).toLocaleDateString('sv-SE'));   // 공통 기준일(11/8)
    const cnt = (m, k) => o.events.filter((e) => e.d.slice(0, 7) === m && e.kind === k).length;

    function grid() {
      const [y, m] = st.month.split('-').map(Number);
      const first = new Date(Date.UTC(y, m - 1, 1)), nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const lead = (first.getUTCDay() + 6) % 7;                       // 월요일 시작
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(null);
      for (let d = 1; d <= nd; d++) cells.push(iso(y, m, d));
      while (cells.length % 7) cells.push(null);
      let h = `<div class="calg" role="grid" aria-label="${y}년 ${m}월">` + WD.map((w, i) => `<div class="calh ${i >= 5 ? 'we' : ''}">${w}</div>`).join('');
      cells.forEach((d, i) => {
        if (!d) { h += '<div class="calc empty"></div>'; return; }
        const evs = (byDay[d] || []).filter((e) => !st.off.has(e.kind)).sort((a, b) => ord(a) - ord(b));
        const wd = (i % 7);
        const max = o.maxChips || 4;
        const chips = evs.slice(0, max).map((e) => `<span class="chip k-${e.kind} ${e.tone || ''}" style="--kc:${o.kinds[e.kind].color}">${esc(e.chip)}</span>`).join('')
          + (evs.length > max ? `<span class="more">+${evs.length - max}건</span>` : '');
        h += `<button type="button" class="calc ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${d === st.sel ? 'sel' : ''} ${evs.length ? 'has' : ''}" data-d="${d}" style="--ci:${i}" aria-label="${d} ${evs.length}건">`
          + `<span class="dn ${wd >= 5 ? 'we' : ''}">${+d.slice(8)}</span>${chips}</button>`;
      });
      return h + '</div>';
    }
    function render() {
      const tabs = o.months.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === st.month}">${+m.slice(5)}월${m.slice(0, 4) !== o.months[0].slice(0, 4) ? `<small>'${m.slice(2, 4)}</small>` : ''}</button>`).join('');
      const leg = kindKeys.map((k) => `<button type="button" class="lg ${st.off.has(k) ? 'off' : ''}" data-k="${k}" style="--kc:${o.kinds[k].color}" aria-pressed="${!st.off.has(k)}"><i></i>${esc(o.kinds[k].name)} <small>${cnt(st.month, k)}</small></button>`).join('');
      el.innerHTML = `<div class="calbar"><div class="seg cal-m">${tabs}</div><div class="cal-lg">${leg}</div></div>${o.note ? `<p class="hint cal-note">${o.note}</p>` : ''}${grid()}<div class="cal-detail" aria-live="polite"></div>`;
      el.querySelectorAll('.cal-m button').forEach((b) => b.onclick = () => { st.month = b.dataset.m; st.sel = null; render(); });
      el.querySelectorAll('.cal-lg .lg').forEach((b) => b.onclick = () => { const k = b.dataset.k; st.off.has(k) ? st.off.delete(k) : st.off.add(k); render(); });
      el.querySelectorAll('.calc[data-d]').forEach((b) => b.onclick = () => { st.sel = b.dataset.d; el.querySelectorAll('.calc.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); show(); });
      if (st.sel) show();
    }
    function show() {
      const d = st.sel, evs = (byDay[d] || []).filter((e) => !st.off.has(e.kind)).sort((a, b) => ord(a) - ord(b));
      const box = el.querySelector('.cal-detail');
      const wd = WD[(new Date(d + 'T00:00:00').getDay() + 6) % 7];
      box.innerHTML = `<h3>${+d.slice(5, 7)}월 ${+d.slice(8)}일(${wd}) <small>${evs.length ? evs.length + '건' : '할 일 없음'}</small></h3>` + (evs.length ? o.detail(d, evs) : '');
      box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    }
    // 처음: 오늘이 보이는 달, 오늘(없으면 첫 일정)을 선택
    if (o.months.includes(today.slice(0, 7)) && !o.month) st.month = today.slice(0, 7);
    st.sel = (byDay[today] && today.slice(0, 7) === st.month) ? today : (o.events.filter((e) => e.d.slice(0, 7) === st.month && e.d >= today).map((e) => e.d).sort()[0] || null);
    render();
    return { go: (d) => { st.month = d.slice(0, 7); st.sel = d; render(); } };
  };
})();
