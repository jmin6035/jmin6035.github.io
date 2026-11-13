/* 컬러 가동 현황 — 월간 계획 vs 롤링(11/9 사용자 승인): published/color_rolling.enc.json(tools/color_rolling.py)
   그룹별 진도 막대(실적 · 확정 작업지시 · 남은 배치 vs 월 계획) → 알람 → 라인×날짜 원본·롤링 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => WD[new Date(d + 'T00:00:00').getDay()];
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const CG = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'];
  const GL = (g) => (g === '주문재' ? '건재 주문재' : g);
  const GVAR = Object.fromEntries(CG.map((g, i) => [g, `var(--s${i + 1})`]));
  const KIND = { short: ['부족', 'bad'], over: ['초과', 'warn'], wfree: ['주문 필요', 'warn'], free: ['빈 시간', ''] };
  let R = null, mi = 0;

  function render() {
    const el = $('r-sec'); if (!el || !R) return;
    el.hidden = false;
    $('r-meta').textContent = `확정 창 ${md(R.window[0])}~${md(R.window[1])} · 작업지시 ${String(R.woNow || '').slice(5).replace('-', '/')} · 확정 ${fmt(R.conf.t)}t${R.actTo ? ` · 실적 = MES ~${md(R.actTo)}${R.actTo >= R.asOf ? '(오늘 진행분 포함)' : ''}` : ''}`;   // 11/10 점검: 실적 6,104(오늘 진행분 포함) vs 다른 화면 ~11/8 5,921 — 기준일 표시
    $('r-tabs').innerHTML = R.months.map((m, i) => `<button type="button" data-m="${i}" aria-pressed="${i === mi}">${+m.slice(5)}월</button>`).join('');
    const m = R.months[mi], G = R.groups.filter((x) => x.ym === m && (x.plan > 0.5 || x.act + x.conf + x.roll > 0.5));
    const sum = (k) => G.reduce((s, x) => s + x[k], 0);
    const tot = { g: '합계', plan: sum('plan'), act: sum('act'), conf: sum('conf'), roll: sum('roll') }; tot.diff = tot.act + tot.conf + tot.roll - tot.plan; tot.pct = tot.plan ? tot.diff / tot.plan * 100 : 0;
    const bar = (x) => {
      const got = x.act + x.conf + x.roll, mx = Math.max(x.plan, got, 1), w = (v) => v / mx * 100;
      const seg = (v, cls, nm) => (v > 0.5 ? `<i class="${cls}" style="width:${w(v)}%" title="${nm} ${fmt(v)}t">${w(v) > 9 ? fmt(v) : ''}</i>` : '');
      const bad = Math.abs(x.diff) >= 10 && Math.abs(x.pct || 0) > 5;
      return `<div class="rg-row${x.g === '합계' ? ' rg-tot' : ''}"><div class="rg-n">${x.g === '합계' ? '' : `<i style="background:${GVAR[x.g]}"></i>`}<b>${esc(GL(x.g))}</b></div>
        <div class="rg-bar">${seg(x.act, 'a', '실적')}${seg(x.conf, 'c', '확정 작업지시')}${seg(x.roll, 'p', '남은 배치')}<u style="left:${w(x.plan)}%" title="월간 계획(고정) ${fmt(x.plan)}t"></u></div>
        <div class="rg-t"><b>${fmt(got)} / ${fmt(x.plan)}t</b><span class="st ${bad ? (x.diff < 0 ? 'bad' : 'warn') : 'good'}">${x.diff > 0 ? '+' : ''}${fmt(x.diff)}t${x.pct == null ? '' : ` · ${x.diff > 0 ? '+' : ''}${(+x.pct).toFixed(1)}%`}</span></div>
        <div class="rg-p" title="진도 = 실적 ÷ 월간 계획(고정)">${x.plan ? `진도 ${Math.round(x.act / x.plan * 100)}%` : ''}</div></div>`;
    };
    $('r-groups').innerHTML = `<div class="rg-leg"><span><i class="a"></i>실적</span><span><i class="c"></i>확정 작업지시</span><span><i class="p"></i>남은 배치</span><span><u></u>월간 계획(고정)</span></div>`
      + G.map(bar).join('') + bar(tot);
    const A = R.alarms.filter((a) => a.ym === m);
    $('r-alarms').innerHTML = A.length ? A.map((a) => `<li><span class="st ${KIND[a.kind][1]}">${KIND[a.kind][0]}</span><b class="ra-k">${esc(a.g ? GL(a.g) : a.l)}</b><span class="ra-t">${esc(a.text)}${a.offset ? `<small> · ${esc(a.offset)}</small>` : ''}</span></li>`).join('')
      : '<li><span class="st good">없음</span><span class="ra-t">그룹 차이 ±5% 안 · 빈 시간 없음</span></li>';
    renderTable(m);
  }

  window.CSROLL = () => { if (R) render(); };
  function renderTable(m) {
    const n = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(), ds = Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
    const today = R.asOf;
    // 11/13 사용자 '생긴 걸 똑같이(01 과)': 01 일별 가동계획 표와 같은 모양(ui/optable.js·css — 머리 2줄·왼쪽 두 칸·라인 묶음 굵은 선·컬러 가동 색·지난 날 덮개·오늘 틀·범례 아래)
    const ti = ds.indexOf(today);
    let h = OPT.head(ds, today, '', '', ti) + '<tbody>';
    for (const l of LINES) {
      const C = {}; for (const c of R.cells[l] || []) if (c[0].startsWith(m)) { C[c[0]] = c.slice(); if (window.CSPLAN) C[c[0]][1] = window.CSPLAN(l, c[0]); }   // 월간 계획 = 가동 현황 표와 같은 자료
      const s0 = ds.reduce((s, d) => s + (C[d] && C[d][1] >= 0.5 ? Math.round(C[d][1]) : 0), 0), s1 = ds.reduce((s, d) => s + (C[d] && C[d][2] >= 0.5 ? Math.round(C[d][2]) : 0), 0);   // 계 = 보이는 칸(정수) 합
      h += `<tr class="r-dep"><th class="c0 lnC le" rowspan="2">${l}</th><th class="c1">월간 계획</th>`
        + ds.map((d) => { const c = C[d]; return `<td>${c && c[1] >= 0.5 ? fmt(c[1]) : ''}</td>`; }).join('') + `<td class="tot">${fmt(s0)}</td></tr>`;
      h += `<tr class="r-fam le"><th class="c1">롤링</th>` + ds.map((d) => {
        const c = C[d]; if (!c) return '<td></td>';
        const [, o, v, k, fr, cf] = c, df = v - o;
        const cls = [v >= 0.5 ? 'kC' : '', (k === 'c' || k === 'w') && cf >= 0.5 ? 'k-c' : '', k !== 'a' && k !== 's' && Math.abs(df) >= 30 ? (df > 0 ? 'up' : 'dn') : ''].filter(Boolean).join(' ');
        const tip = `${md(d)} ${l} · 월간 계획 ${fmt(o)}t → 롤링 ${fmt(v)}t` + (k === 'a' ? ' (실적)' : cf >= 0.5 ? ` (확정 작업지시 ${fmt(cf)}t${v - cf >= 0.5 ? ` + 계획 ${fmt(v - cf)}t` : ''})` : '') + (fr >= 60 ? ` · 빈 시간 ${(fr / 60).toFixed(1)}h` : '');
        return `<td class="${cls}" title="${esc(tip)}">${v >= 0.5 ? fmt(v) : ''}</td>`;
      }).join('') + `<td class="tot">${fmt(s1)}</td></tr>`;
    }
    $('r-table').innerHTML = OPT.wrap(OPT.pad31(h, ds.length) + '</tbody>', ds.filter((d) => d < today).length, ti, 'r-table')
      + OPT.lg([['kC', '롤링 생산'], ds.some((d) => d < today) && ['pst', '지난 날'], ['sep'], ti >= 0 && ['tdy', '오늘']]);
  }

  document.addEventListener('click', (ev) => { const b = ev.target.closest('#r-tabs button'); if (b) { mi = +b.dataset.m; render(); } });
  async function load(pw) {
    try { const e = await GP.latest('color_rolling.enc.json'); if (!e) return; R = await GP.decryptJSON(e, pw); mi = Math.max(0, R.months.indexOf(R.asOf.slice(0, 7))); render(); }
    catch (err) { /* 롤링 자료가 없거나 암호가 다르면 이 칸만 숨김 */ }
  }
  document.addEventListener('cgl-pw', (ev) => load(ev.detail));
})();
