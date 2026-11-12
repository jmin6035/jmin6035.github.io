/* 계획(gyehoek.html) — 11/12 회의·화이트보드 '# 계획'
   ① 일별 가동계획 = 엑셀로 인쇄하던 가동계획 양식: 줄 = 도금 1·2CGL·합계, 컬러 1~4CCL·합계 / 칸 = 날짜별 계획 톤만, 강종·M/C·정지는 칸 바탕 색
      월차(월초 확정 계획) 표 + 조정(실적 반영) 표: 지난 날 = 실적, 오늘부터 = 조정된 계획, 월초 대비 바뀐 칸 표시
   ② 소재 = 소재 관제(matcal)의 소재 캘린더 · 월별 소재 입고 계획 — supply.js 를 그대로 씀(같은 칸 id)
   자료·계산 = 가동 캘린더(supply.js live)와 같은 게시 파일·같은 칸 구성: 도금 = 매일 재계획(latest.plan, 지난 날 = MES 실적 + plating_actual),
   컬러 = 확정 통합 계획(integrated.color, 지난 날 = color_actual), 정지 = 재계획 cal(blackout·event) · 통합 colorDown.
   월초 계획 = 수주 관제와 같은 값(suju.enc.json daily[라인] = [날짜, 월초, 지금, 실적]) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('en-US');
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00').getDay();
  const add = (d, k) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + k); return x.toLocaleDateString('sv-SE'); };
  const mAdd = (m, k) => { const x = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
  const daysOf = (m) => { const n = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); };
  const FAM = (a) => (/^AZ/.test(a) ? 'AZ' : /^MAC/.test(a) ? 'MAC' : 'AL');
  const sumV = (o) => Object.values(o || {}).reduce((a, v) => a + (+v || 0), 0);
  const KEY = 'cgl-analysis-pw';
  const LINES = { G: ['1CGL', '2CGL'], C: ['1CCL', '2CCL', '3CCL', '4CCL'] }, PN = { G: '도금', C: '컬러' };
  const KN = { plan: '휴지', sd: 'S/D', repair: '수리', jr: '정기수리' };
  const CHG = 50;                                                         // 월초 대비 바뀐 칸 = 50t 이상 차이
  let D = null, mon = null, tab = 'plan', today = '', busy = false;

  // ---------- 자료: 가동 캘린더(supply.js prep·live)와 같은 칸 ----------
  async function load(pw) {
    const get = async (n) => { try { const e = await GP.latest(n); return e ? await GP.decryptJSON(e, pw) : null; } catch (x) { return null; } };
    const [W, LP, CA, PA, SJ] = await Promise.all(['integrated.enc.json', 'latest.plan.enc.json', 'color_actual.enc.json', 'plating_actual.enc.json', 'suju.enc.json'].map(get));
    if (!W) throw new Error('integrated');
    await UI.ready(); today = UI.today(W.asOf && add(String(W.asOf).slice(0, 10), 1));
    const pl = {}, ev = {}, co = {}, cdn = {}, p0 = {};
    const R = LP && (LP.result || LP); let actG = '', at = '';
    if (R && R.rows && R.cal) {
      const t0 = (R.replan || {}).t0 || ''; actG = t0;
      for (const [d, l, a, , t] of R.rows) { const x = (pl[`${l}|${d}`] = pl[`${l}|${d}`] || { t: 0, al: {} }); x.t += t; x.al[FAM(a)] = (x.al[FAM(a)] || 0) + t; }
      for (const c of R.cal) ev[`${c.line}|${c.date}`] = c;
      if (PA && PA.asOf && Array.isArray(PA.daily) && t0) for (const r of PA.daily) {   // 재계획 실적일 뒤에 들어온 MES 실적 = 라인 합계를 실적으로(supply.js 와 같게)
        if (!(r.d > t0 && r.d <= PA.asOf)) continue;
        for (const l of LINES.G) { const k = `${l}|${r.d}`; pl[k] = Object.assign(pl[k] || { al: {} }, { t: r[l] || 0 }); }
        if (r.d > actG) actG = r.d;
      }
      at = LP.savedAt ? new Date(new Date(LP.savedAt).getTime() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ') : '';
    } else {                                                             // 재계획이 없으면 확정 통합 계획
      const V = W.variants[W.rec] || W.variants.V1, Y = (W.asOf || '2026').slice(0, 4);
      for (const x of V.plating) { const al = {}; for (const [a, v] of Object.entries(x.alloy)) al[FAM(a)] = (al[FAM(a)] || 0) + v; pl[`${x.l}|${x.d}`] = { t: sumV(x.cls), al }; if (x.ev) ev[`${x.l}|${x.d}`] = { event: x.ev, blackout: /수리|S\/D|휴지/.test(x.ev) && sumV(x.cls) < 0.5 ? 1440 : 0 }; }
      actG = W.asOf || ''; void Y;
    }
    for (const x of W.color || []) { const k = `${x.l}|${x.d}`; co[k] = (co[k] || 0) + sumV(x.g); }
    const BD = CA && CA.byGroup && CA.byGroup.days, actC = BD ? CA.byGroup.asOf : '';
    for (const [d, l, k, mn] of W.colorDown || []) if (KN[k]) { const z = (cdn[`${l}|${d}`] = cdn[`${l}|${d}`] || {}); z[k] = (z[k] || 0) + mn; }
    if (SJ && SJ.daily && SJ.month) for (const [l, rows] of Object.entries(SJ.daily)) for (const r of rows) p0[`${l}|${r[0]}`] = +r[1] || 0;
    const ms = [today.slice(0, 7), mAdd(today.slice(0, 7), 1), mAdd(today.slice(0, 7), 2)];
    D = { W, pl, ev, co, BD, actG, actC, cdn, p0, m0: SJ && SJ.month, at, ms };
    mon = ms[0];
  }

  // ---------- 칸 하나: 톤 · 강종 · M/C · 정지 · 실적 여부 ----------
  function cell(l, d, mode) {
    const G = /CGL$/.test(l), k = `${l}|${d}`, e = G ? D.ev[k] : null;
    let t, act = false;
    if (mode === 'm0') t = D.p0[k] || 0;
    else if (G) { t = (D.pl[k] || {}).t || 0; act = !!D.actG && d <= D.actG; }
    else if (D.BD && d <= D.actC) { const v = (D.BD[d] || {})[l]; t = v ? sumV(v[0]) : 0; act = true; }
    else t = D.co[k] || 0;
    const mc = G && !!e && /M\/C/.test(e.event || '');
    let fam = null, stop = '';
    if (G) { const al = (D.pl[k] || {}).al || {}; fam = Object.keys(al).sort((a, b) => al[b] - al[a])[0] || FAM((e && e.fam) || 'AL'); }
    if (t < 0.5 && !mc) {
      if (G) stop = e && e.blackout >= 1439 ? (/정기수리/.test(e.event) ? '정기수리' : /수리/.test(e.event) ? '수리' : /S\/D/.test(e.event) ? 'S/D' : '휴지') : '휴지';
      else { const z = D.cdn[k] || {}, top = Object.keys(z).sort((a, b) => z[b] - z[a])[0]; stop = top && sumV(z) >= 1439 ? KN[top] : '휴지'; }
    }
    return { t: t < 0.5 ? 0 : t, act, fam, mc, stop, ev: e && e.event };
  }

  // ---------- 표: 라인 × 날짜 ----------
  function table(ds, mode) {
    const adj = mode === 'adj', src = mode === 'm0' ? 'm0' : 'cur';
    const dcls = (d) => (wd(d) === 1 && d !== ds[0] ? ' wk' : '') + (d === today ? ' tdy' : '');
    let h = `<colgroup><col class="g0"><col class="g1">${ds.map(() => '<col>').join('')}<col class="tot"></colgroup>`
      + `<thead><tr><th class="g0" colspan="2">라인</th>${ds.map((d) => `<th class="${wd(d) === 6 ? 'sat' : wd(d) === 0 ? 'sun' : ''}${dcls(d)}"><b>${+d.slice(8)}</b><span>${WD[wd(d)]}</span></th>`).join('')}<th class="tot">월 합계</th></tr></thead><tbody>`;
    for (const pc of ['G', 'C']) {
      if (!UI.inScope(pc)) continue;
      const LS = LINES[pc], day = {};
      LS.forEach((l, li) => {
        const C = ds.map((d) => cell(l, d, src));
        let tot = 0, r = `<tr class="${li === 0 ? 'pf' : ''}">${li === 0 ? `<th class="g0" rowspan="${LS.length + 1}">${PN[pc]}</th>` : ''}<th class="g1">${l}</th>`;
        for (let i = 0; i < ds.length; i++) {
          const d = ds[i], c = C[i];
          day[d] = (day[d] || 0) + c.t; tot += c.t;
          if (c.stop) {                                                    // 이어진 같은 정지는 한 칸으로 합침
            let j = i; while (j + 1 < ds.length && C[j + 1].stop === c.stop && C[j + 1].act === c.act) j++;
            const n = j - i + 1, hv = c.stop !== '휴지', nm = n === 1 && c.stop.length > 3 ? '수리' : c.stop;
            r += `<td class="stp${hv ? ' hv' : ''}${c.act ? ' a' : ''}${dcls(d)}" colspan="${n}" title="${esc(`${l} ${c.stop} ${md(d)}${n > 1 ? '~' + md(ds[j]) : ''}${c.act ? ' (실적)' : ''}`)}"><span>${esc(nm)}</span></td>`;
            i = j; continue;
          }
          const cls = [c.mc ? 'mc' : c.fam ? 'f' + c.fam : 'fC'];
          if (c.t >= 999.5) cls.push('w4');
          if (adj && c.act) cls.push('a');
          let tip = `${md(d)}(${WD[wd(d)]}) ${l}${c.fam ? ' ' + c.fam : ''} ${n0(c.t)}t${adj ? (c.act ? ' 실적' : ' 계획') : ''}${c.mc ? ' · ' + c.ev : ''}`, ext = '';
          if (adj && D.m0 === ds[0].slice(0, 7)) {
            const p = D.p0[`${l}|${d}`] || 0;
            if (Math.abs(c.t - p) >= CHG) cls.push('chg');
            tip += ` · 월초 ${n0(p)}t`; ext = ` data-c="${l}|${d}"`;
          }
          r += `<td class="${cls.join(' ')}${dcls(d)}" title="${esc(tip)}"${ext}>${c.t ? n0(c.t) : ''}</td>`;
        }
        h += r + `<td class="tot">${n0(tot)}</td></tr>`;
      });
      const T = ds.reduce((a, d) => a + day[d], 0);
      h += `<tr class="sum"><th class="g1">합계</th>${ds.map((d) => `<td class="${(dcls(d) + (day[d] >= 999.5 ? ' w4' : '')).trim()}">${day[d] >= 0.5 ? n0(day[d]) : ''}</td>`).join('')}<td class="tot">${n0(T)}</td></tr>`;
    }
    return `<div class="gk-wrap"><table class="gk v2-grid${adj ? ' adj' : ''}">${h}</tbody></table></div>`;
  }
  const lineSum = (l, ds, src) => ds.reduce((a, d) => a + cell(l, d, src).t, 0);
  function legend(adj) {
    const sw = (c, t) => `<span><i class="${c}"></i>${t}</span>`, sep = '<span class="sep"></span>';
    return `<div class="gk-lg">${UI.inScope('G') ? sw('fAL', 'AL') + sw('fAZ', 'AZ') + sw('fMAC', 'MAC') + sw('mc', 'M/C') : ''}${UI.inScope('C') ? sw('fC', '컬러 가동') : ''}${sep}${sw('hv', '정기수리·수리·S/D')}${sw('lt', '휴지')}`
      + (adj ? `${sep}<span><b>진한 칸</b> = 실적 · 옅은 칸 = 계획</span>${sw('chg', `월초 대비 ${CHG}t 이상 바뀐 칸`)}` : '') + '</div>';
  }

  function render() {
    const ds = daysOf(mon), M = +mon.slice(5), cur = mon === today.slice(0, 7), hasM0 = D.m0 === mon;
    let h = '';
    if (hasM0) {
      h += `<section class="card gk-card"><h2>${M}월 일별 가동계획 <span class="tag">월차 · 월초 확정</span><span class="unit">톤</span></h2>${table(ds, 'm0')}${legend(false)}</section>`;
      const chips = ['G', 'C'].filter((p) => UI.inScope(p)).flatMap((pc) => {
        const one = (nm, a, b, t) => { const df = Math.round(b - a); return `<span class="${t ? 't' : ''}"><b>${nm}</b>${n0(a)} → ${n0(b)}<em class="${df <= -0.5 ? 'dn' : ''}">${df > 0 ? '+' : ''}${n0(df)}</em></span>`; };
        const A = LINES[pc].map((l) => [lineSum(l, ds, 'm0'), lineSum(l, ds, 'cur')]);
        return [...LINES[pc].map((l, i) => one(l, A[i][0], A[i][1])), one(`${PN[pc]} 합계`, A.reduce((s, x) => s + x[0], 0), A.reduce((s, x) => s + x[1], 0), true)];
      }).join('');
      h += `<section class="card gk-card"><h2>조정 (실적 반영) <span class="tag">${md(ds[0])}~${md(add(today, -1))} 실적 · ${md(today)}~ 조정 계획</span><span class="unit">톤</span></h2>`
        + `<div class="gk-dl" title="라인별 월 합계: 월초 계획 → 지금 전망(실적 + 조정 계획)">${chips}</div>${table(ds, 'adj')}${legend(true)}<div class="gk-info" id="gk-info"></div></section>`;
    } else {
      const tag = cur ? '실적 + 계획' : `월차 확정 전 · 현재 계획`;
      h += `<section class="card gk-card"><h2>${M}월 일별 가동계획 <span class="tag">${tag}</span><span class="unit">톤</span></h2>${table(ds, cur ? 'adj' : 'cur')}${legend(cur)}</section>`;
    }
    $('gk-plan').innerHTML = h;
    document.querySelectorAll('table.gk.adj td[data-c]').forEach((td) => td.onclick = () => {
      document.querySelectorAll('table.gk td.sel').forEach((x) => x.classList.remove('sel')); td.classList.add('sel');
      const [l, d] = td.dataset.c.split('|'), c = cell(l, d, 'cur'), p = D.p0[td.dataset.c] || 0, df = Math.round(c.t - p);
      $('gk-info').innerHTML = `<b>${md(d)}(${WD[wd(d)]}) ${l}</b> 월초 ${n0(p)}t → ${c.act ? '실적' : '지금 계획'} <b>${n0(c.t)}t</b> (${df > 0 ? '+' : ''}${n0(df)}t)`;
    });
    snap();
  }
  // 좁은 화면(표가 가로로 밀릴 때): 보이는 폭을 날짜 칸 경계에 맞추고(왼쪽 라인·오른쪽 합계 고정 칸에 날짜가 반쯤 가려지지 않게) 오늘 앞 2일부터 보이게 — 가동 캘린더(supply.js snap)와 같은 방식
  function snap() {
    const W = [...document.querySelectorAll('.gk-wrap')];
    W.forEach((w) => {
      w.style.maxWidth = ''; if (!w.offsetParent || w.scrollWidth <= w.clientWidth + 1) return;
      const r0 = w.querySelector('thead tr'), st = r0.querySelector('th.g0').getBoundingClientRect().width, tw = r0.querySelector('th.tot').getBoundingClientRect().width;
      const days = [...r0.querySelectorAll('th:not(.g0):not(.tot)')], cw = days[0].getBoundingClientRect().width;
      const n = Math.max(1, Math.floor((w.clientWidth - st - tw) / cw)), i0 = Math.max(0, Math.min(days.length - n, days.findIndex((x) => x.classList.contains('tdy')) - 2));
      w.style.maxWidth = Math.floor(st + tw + n * cw + 2) + 'px';
      w.scrollLeft = Math.round((i0 < 0 ? 0 : i0) * cw);
    });
    W.forEach((a) => { a.onscroll = () => W.forEach((b) => { if (b !== a && Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft; }); });   // 두 표 가로 스크롤 함께
  }
  let rsT = 0; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (D && tab === 'plan') snap(); }, 150); });

  // ---------- 소재 탭: supply.js 의 월 탭(#s-mon, 숨김)을 위 월 선택과 맞춤 ----------
  function matSync() {
    const b = document.querySelector(`#s-mon button[data-m="${mon}"]`);
    $('gk-matnone').hidden = !!b || !document.querySelector('#s-mon button');
    $('gk-matbody').hidden = !b && !!document.querySelector('#s-mon button');
    if (!b) { const last = document.querySelector('#s-mon button:last-child'); $('gk-matnone').textContent = `${+mon.slice(5)}월 소재 캘린더는 아직 없습니다 — 소재 계획은 ${last ? last.textContent : ''}까지`; return; }
    if (b.getAttribute('aria-pressed') !== 'true') b.click();
  }
  function bar() {
    $('gk-mon').innerHTML = D.ms.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === mon}">${+m.slice(5)}월</button>`).join('');
    $('gk-mon').querySelectorAll('button').forEach((b) => b.onclick = () => { mon = b.dataset.m; bar(); render(); if (tab === 'mat') matSync(); });
    $('gk-meta').textContent = `실적 ~${md(D.actG || today)}${D.at ? ` · 재계획 ${D.at.slice(5).replace('-', '/')}` : ''}`;
    $('gk-print').hidden = tab !== 'plan';
  }
  function setTab(t) {
    tab = t;
    $('gk-tab').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    $('gk-plan').hidden = t !== 'plan'; $('gk-mat').hidden = t !== 'mat';
    $('gk-print').hidden = t !== 'plan';
    if (t === 'mat') matSync(); else if (D) snap();
  }

  async function open(pw) {
    if (busy || D) return; busy = true;
    try {
      await load(pw);
      $('lock').hidden = true; $('main').hidden = false;
      bar(); render(); setTab(location.hash === '#mat' ? 'mat' : 'plan');
      if (UI.v2) $('gk-tab').hidden = true;                              // 새 양식: 하위 탭(일별 가동계획 · 소재)은 공통 머리(shell) 탭 막대가 그림
      UI.onScope(() => { if (D) render(); });
    } catch (e) { console.error(e); } finally { busy = false; }
  }
  $('gk-tab').querySelectorAll('button').forEach((b) => b.onclick = () => { location.hash = b.dataset.t === 'mat' ? 'mat' : ''; });
  addEventListener('hashchange', () => { if (D) setTab(location.hash === '#mat' ? 'mat' : 'plan'); });
  $('gk-print').onclick = () => window.print();
  // 월별 소재 입고 계획: 소재 유형별(포스코 FH 등)로 — supply.js 기본은 판매그룹별
  const mo = new MutationObserver(() => { const b = document.querySelector('#s-msm button[data-m="code"]'); if (b) { mo.disconnect(); if (b.getAttribute('aria-pressed') !== 'true') b.click(); } });
  mo.observe($('s-msum'), { childList: true, subtree: true });
  new MutationObserver(() => { if (D && tab === 'mat') matSync(); }).observe($('s-mon'), { childList: true });
  $('f').addEventListener('submit', () => { const v = $('pw').value; if (v) setTimeout(() => open(v), 0); });
  let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ }
  if (s) open(s);
})();
