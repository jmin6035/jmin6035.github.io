/* 계획(gyehoek.html) — 11/12 회의·화이트보드 '# 계획'(엑셀로 인쇄하던 일별 가동계획 양식)
   이 화면에서 볼 것 · 보는 순서
     ① 일별 가동계획 표(가장 크게) — 라인 × 날짜 톤. 지난 날 = 실적(진한 칸·점), 오늘부터 = 조정된 계획. 강종(AL·AZ·MAC)·M/C·정지는 칸 색, 강종이 바뀌는 칸 아래 강종 이름
     ② 조정 한 줄(표 바로 위) — 라인별 '월차 합 → 지금 전망 ±'. 표의 ◥ 칸 = 월차 대비 바뀐 날, 누르면 '월차 → 지금' 한 줄(도금은 소재 발주 마감도)
     ③ 월차 원본 — 접기 안에만(같은 표를 두 번 펼치지 않음)
     소재 탭: ① 소재 종합(유형별 필요 = 입고 완료 + 발주 + 미발주, 가로 막대) → ② 소재 캘린더(일별 발주·입고·투입) → ③ 소재 리드타임
   자료·계산: 도금 = 매일 재계획(latest.plan, 지난 날 = MES 실적 + plating_actual), 컬러 = 확정 통합 계획(integrated.color, 지난 날 = color_actual),
   정지 = 재계획 cal · 통합 colorDown, 월차 = 수주 관제와 같은 값(suju.enc.json daily[라인] = [날짜, 월초, 지금, 실적]), 리드타임 = leadtime.enc.json.
   소재 캘린더·종합 수치 = supply.js(같은 칸 id)가 계산 — 종합 그래프는 supply.js 가 그린 값을 읽어 가로 막대로 다시 그림 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('en-US');
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + n0(Math.abs(v));
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
  const CHG = 50;                                                         // 월차 대비 바뀐 칸 = 50t 이상 차이
  let D = null, mon = null, tab = 'plan', today = '', busy = false;

  // ---------- 자료: 가동 캘린더(supply.js prep·live)와 같은 칸 ----------
  async function load(pw) {
    const get = async (n) => { try { const e = await GP.latest(n); return e ? await GP.decryptJSON(e, pw) : null; } catch (x) { return null; } };
    const [W, LP, CA, PA, SJ, LT] = await Promise.all(['integrated.enc.json', 'latest.plan.enc.json', 'color_actual.enc.json', 'plating_actual.enc.json', 'suju.enc.json', 'leadtime.enc.json'].map(get));
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
      const V = W.variants[W.rec] || W.variants.V1;
      for (const x of V.plating) { const al = {}; for (const [a, v] of Object.entries(x.alloy)) al[FAM(a)] = (al[FAM(a)] || 0) + v; pl[`${x.l}|${x.d}`] = { t: sumV(x.cls), al }; if (x.ev) ev[`${x.l}|${x.d}`] = { event: x.ev, blackout: /수리|S\/D|휴지/.test(x.ev) && sumV(x.cls) < 0.5 ? 1440 : 0 }; }
      actG = W.asOf || '';
    }
    for (const x of W.color || []) { const k = `${x.l}|${x.d}`; co[k] = (co[k] || 0) + sumV(x.g); }
    const BD = CA && CA.byGroup && CA.byGroup.days, actC = BD ? CA.byGroup.asOf : '';
    for (const [d, l, k, mn] of W.colorDown || []) if (KN[k]) { const z = (cdn[`${l}|${d}`] = cdn[`${l}|${d}`] || {}); z[k] = (z[k] || 0) + mn; }
    if (SJ && SJ.daily && SJ.month) for (const [l, rows] of Object.entries(SJ.daily)) for (const r of rows) p0[`${l}|${r[0]}`] = +r[1] || 0;
    const ms = [today.slice(0, 7), mAdd(today.slice(0, 7), 1), mAdd(today.slice(0, 7), 2)];
    D = { W, pl, ev, co, BD, actG, actC, cdn, p0, m0: SJ && SJ.month, at, ms, LT };
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
  const lineSum = (l, ds, src) => ds.reduce((a, d) => a + cell(l, d, src).t, 0);

  // ---------- 표 하나: 라인 × 날짜(지금 = 실적 + 조정 계획, 또는 월차 원본) ----------
  function table(ds, src, withM0) {
    const dcls = (d) => (wd(d) === 1 && d !== ds[0] ? ' wk' : '') + (d === today ? ' tdy' : '');
    let h = `<colgroup><col class="lb">${ds.map(() => '<col>').join('')}<col class="tot"></colgroup>`
      + `<thead><tr><th class="lb">라인</th>${ds.map((d) => `<th class="${(wd(d) % 6 === 0 ? 'we' : '') + dcls(d)}"><b>${+d.slice(8)}</b><span>${WD[wd(d)]}</span></th>`).join('')}<th class="tot">월 합계</th></tr></thead><tbody>`;
    for (const pc of ['G', 'C']) {
      if (!UI.inScope(pc)) continue;
      const day = {};
      for (const l of LINES[pc]) {
        const C = ds.map((d) => cell(l, d, src));
        let tot = 0, r = `<tr><th class="lb">${l}</th>`, lastFam = null;
        for (let i = 0; i < ds.length; i++) {
          const d = ds[i], c = C[i];
          day[d] = (day[d] || 0) + c.t; tot += c.t;
          if (c.stop) {                                                    // 이어진 같은 정지는 한 칸(오늘 칸 경계에서는 끊음)
            let j = i; while (j + 1 < ds.length && C[j + 1].stop === c.stop && C[j + 1].act === c.act && ds[j + 1] !== today) j++;
            const n = j - i + 1, idle = c.stop === '휴지';
            const nm = n <= 1 ? (idle ? '휴지' : c.stop === 'S/D' ? 'S/D' : '수리') : n <= 3 ? c.stop : `${c.stop} ${md(d)}${n > 1 ? '~' + (ds[j].slice(5, 7) === d.slice(5, 7) ? +ds[j].slice(8) : md(ds[j])) : ''}`;
            r += `<td class="${idle ? 'idle' : 'stp'}${dcls(d)}" colspan="${n}" title="${esc(`${l} ${c.stop} ${md(d)}${n > 1 ? '~' + md(ds[j]) : ''}${c.act ? ' (실적)' : ''}`)}"><span>${esc(nm)}</span></td>`;
            i = j; lastFam = null; continue;
          }
          const fc = c.mc ? 'mc' : c.fam ? 'f' + c.fam : 'fC', cls = ['d', fc];
          const nx = C[i + 1], nfc = nx && !nx.stop ? (nx.mc ? 'mc' : nx.fam ? 'f' + nx.fam : 'fC') : '';
          if (nx && nfc === fc && nx.act === c.act && ds[i + 1] !== today && !(wd(ds[i + 1]) === 1)) cls.push('jn');
          if (c.t >= 999.5) cls.push('w4');
          if (src !== 'm0' && c.act) cls.push('a');
          let lab = '';
          if (c.mc) lab = 'M/C';
          else if (c.fam && c.fam !== lastFam) lab = c.fam;
          if (!c.mc && c.fam) lastFam = c.fam;
          let tip = `${md(d)}(${WD[wd(d)]}) ${l}${c.fam ? ' ' + c.fam : ''} ${n0(c.t)}t${src !== 'm0' ? (c.act ? ' 실적' : ' 계획') : ' 월차'}${c.mc ? ' · ' + (c.ev || 'M/C') : ''}`;
          if (withM0 && src !== 'm0') {
            const p = D.p0[`${l}|${d}`] || 0;
            if (Math.abs(c.t - p) >= CHG) cls.push('chg');
            tip += ` · 월차 ${n0(p)}t`;
          }
          r += `<td class="${cls.join(' ')}${dcls(d)}" title="${esc(tip)}" data-c="${l}|${d}">${c.t ? n0(c.t) : ''}${lab ? `<small>${lab}</small>` : ''}</td>`;
        }
        h += r + `<td class="tot">${n0(tot)}</td></tr>`;
      }
      const T = ds.reduce((a, d) => a + day[d], 0);
      h += `<tr class="sum"><th class="lb">${PN[pc]} 합계</th>${ds.map((d) => `<td class="${(dcls(d) + (day[d] >= 999.5 ? ' w4' : '')).trim()}">${day[d] >= 0.5 ? n0(day[d]) : ''}</td>`).join('')}<td class="tot">${n0(T)}</td></tr>`;
    }
    return `<div class="gk-wrap"><table class="gk v2-grid" data-src="${src}">${h}</tbody></table></div>`;
  }
  function legend(withM0, cur) {
    const sw = (c, t) => `<span><i class="${c}"></i>${t}</span>`, sep = '<span class="sep"></span>';
    return `<div class="gk-lg">${UI.inScope('G') ? sw('fAL', 'AL') + sw('fAZ', 'AZ') + sw('fMAC', 'MAC') : ''}${UI.inScope('C') ? sw('fC', '컬러 가동') : ''}${UI.inScope('G') ? sw('mc', 'M/C') : ''}${sw('stp', '정지(수리·S/D)')}${sw('idle', '휴지')}${cur || withM0 ? sep : ''}${cur ? sw('a', '진한 칸 = 실적') : ''}`
      + (withM0 ? sw('chg', '월차 대비 바뀜') : '') + (cur ? sw('tdy', '오늘') : '') + '</div>';
  }

  // 누른 칸 한 줄: '11/16(월) 2CGL 월차 703t → 지금 535t (−168t)' + 도금은 그 날 투입 소재(F/H) 발주 마감(리드타임 기준)
  function info(l, d, withM0) {
    const c = cell(l, d, 'cur'), p = D.p0[`${l}|${d}`] || 0, df = Math.round(c.t - p);
    let h = `<b>${md(d)}(${WD[wd(d)]}) ${l}</b> `;
    h += withM0 ? `월차 ${n0(p)}t → ${c.act ? '실적' : '지금'} <b>${n0(c.t)}t</b> (<em class="${df <= -0.5 ? 'dn' : ''}">${sg(df)}t</em>)` : `${c.act ? '실적' : '계획'} <b>${n0(c.t)}t</b>`;
    if (/CGL$/.test(l) && D.LT && !c.act) {
      const sf = ((D.LT.fixed || []).find((f) => f[0] === 'safety.G') || [])[2] || 0, T = Object.fromEntries((D.LT.types || []).map((t) => [t[0], t[1]]));
      const it = ['P-FH', '수입-FH'].filter((k) => T[k] != null).map((k) => `${k} ${md(add(d, -(sf + T[k])))}`);
      if (it.length) h += `<span class="mt">소재(F/H) 발주 마감 ${it.join(' · ')}</span>`;
    }
    $('gk-info').innerHTML = h;
  }

  function render() {
    const ds = daysOf(mon), M = +mon.slice(5), cur = mon === today.slice(0, 7), withM0 = D.m0 === mon;
    let h = `<section class="card gk-card"><h2>${M}월 일별 가동계획 <span class="tag">${cur ? `실적 ~${md(D.actG || today)} · 이후 조정 계획` : withM0 ? '월차 대비 조정 계획' : '현재 계획(월차 확정 전)'}</span><span class="unit">톤</span></h2>`;
    if (withM0) {
      const parts = ['G', 'C'].filter((p) => UI.inScope(p)).map((pc) => {
        const one = (nm, a, b, t) => { const df = Math.round(b - a); return `<span class="${t ? 't' : ''}" title="${esc(`${nm} 월 합계: 월차 ${n0(a)}t → 지금 전망 ${n0(b)}t(실적 + 조정 계획)`)}"><b>${nm}</b>${n0(a)} → ${n0(b)}<em class="${df <= -0.5 ? 'dn' : ''}">${sg(df)}</em></span>`; };
        const A = LINES[pc].map((l) => [lineSum(l, ds, 'm0'), lineSum(l, ds, 'cur')]);
        return [...LINES[pc].map((l, i) => one(l, A[i][0], A[i][1])), one(`${PN[pc]} 합계`, A.reduce((s, x) => s + x[0], 0), A.reduce((s, x) => s + x[1], 0), true)].join('');
      });
      h += `<div class="gk-adj"><b>조정</b>${parts.map((x) => `<div>${x}</div>`).join('')}</div>`;
    }
    h += table(ds, 'cur', withM0) + legend(withM0, cur) + '<div class="gk-info" id="gk-info"></div>';
    if (withM0) h += `<details class="gk-m0"><summary>월차 원본 보기</summary>${table(ds, 'm0', false)}</details>`;
    h += '</section>';
    $('gk-plan').innerHTML = h;
    document.querySelectorAll('table.gk[data-src="cur"] td[data-c]').forEach((td) => td.onclick = () => {
      document.querySelectorAll('table.gk td.sel').forEach((x) => x.classList.remove('sel')); td.classList.add('sel');
      const [l, d] = td.dataset.c.split('|'); info(l, d, withM0);
    });
    const fd = document.querySelector('details.gk-m0'); if (fd) fd.addEventListener('toggle', () => snap());
    snap();
  }
  // 좁은 화면(표가 가로로 밀릴 때): 보이는 폭을 날짜 칸 경계에 맞추고 오늘 앞 2일부터 보이게(가동 캘린더 snap 과 같은 방식)
  function snap() {
    const W = [...document.querySelectorAll('.gk-wrap')];
    W.forEach((w) => {
      w.style.maxWidth = ''; if (!w.offsetParent || w.scrollWidth <= w.clientWidth + 1) return;
      const r0 = w.querySelector('thead tr'), st = r0.querySelector('th.lb').getBoundingClientRect().width, tw = r0.querySelector('th.tot').getBoundingClientRect().width;
      const days = [...r0.querySelectorAll('th:not(.lb):not(.tot)')], cw = days[0].getBoundingClientRect().width;
      const n = Math.max(1, Math.floor((w.clientWidth - st - tw) / cw)), i0 = Math.max(0, Math.min(days.length - n, days.findIndex((x) => x.classList.contains('tdy')) - 2));
      w.style.maxWidth = Math.floor(st + tw + n * cw + 2) + 'px';
      w.scrollLeft = Math.round(i0 * cw);
    });
    W.forEach((a) => { a.onscroll = () => W.forEach((b) => { if (b !== a && b.offsetParent && Math.abs(b.scrollLeft - a.scrollLeft) > 1) b.scrollLeft = a.scrollLeft; }); });
  }
  addEventListener('load', () => { if (D && tab === 'plan') snap(); }); if (document.fonts) document.fonts.ready.then(() => { if (D && tab === 'plan') snap(); });
  let rsT = 0; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (D && tab === 'plan') snap(); }, 150); });

  // ---------- 소재 종합: supply.js 가 그린 월별 소재 입고(소재 유형별) 값을 읽어 가로 막대로(dataviz: 입고 완료 진한 · 발주 옅은 · 미발주 빈 칸, 길이 = 그 달 필요) ----------
  const TIPRE = /^(.*) (\d+)월: 들어와야 할 양 ([\d,]+)t = 입고 완료 ([\d,]+) \+ 발주\(입고 예정\) ([\d,]+) \+ 잔여\(아직 발주 안 함\) ([\d,]+)$/;
  const num = (s) => +String(s).replace(/,/g, '');
  function readMat() {
    const out = [];
    document.querySelectorAll('#s-msum .mss[data-dom]').forEach((box) => {
      const rows = [...box.querySelectorAll('.vz-c')].map((c) => { const m = (c.getAttribute('title') || '').match(TIPRE); return m && { name: m[1], need: num(m[3]), rec: num(m[4]), ord: num(m[5]), nw: num(m[6]) }; }).filter(Boolean);
      if (rows.length) out.push({ pl: box.dataset.dom, rows });
    });
    return out;
  }
  let matKey = '';
  function matChart() {
    const P = readMat(), el = $('gk-msum'), M = +mon.slice(5);
    const key = JSON.stringify(P) + mon; if (key === matKey) return; matKey = key;
    if (!P.length) { el.innerHTML = `<h2>${M}월 소재 종합<span class="unit">톤</span></h2><p class="gk-none">이 달 들어와야 할 소재 없음</p>`; return; }
    const mx = Math.max(1, ...P.flatMap((p) => p.rows.map((r) => r.need)));
    const pc = (r) => (r.need ? Math.round((r.rec + r.ord) / r.need * 100) : 100), cl = (v) => (v < 90 ? 'lo' : v < 100 ? 'mid' : '');
    const panel = (p) => {
      const T = p.rows.reduce((a, r) => ({ need: a.need + r.need, rec: a.rec + r.rec, ord: a.ord + r.ord, nw: a.nw + r.nw }), { need: 0, rec: 0, ord: 0, nw: 0 }), tp = pc(T);
      const rows = p.rows.map((r, i) => { const w = (v) => (v / mx * 100).toFixed(2) + '%', v = pc(r);
        return `<div class="mz-r" tabindex="0" data-p="${p.pl}" data-i="${i}"><div class="nm">${esc(r.name)}</div><div class="bar"><div class="trk" style="width:${w(r.need)}">${[['r', r.rec], ['o', r.ord], ['n', r.nw]].filter(([, x]) => x >= 0.5).map(([k, x]) => `<i class="${k}" style="flex:${x} 0 0"></i>`).join('')}</div></div>`
          + `<div class="v"><b>${n0(r.rec + r.ord)}</b> / ${n0(r.need)}<em class="${cl(v)}">${v}%</em></div></div>`; }).join('');
      return `<div class="mz-p"><h3>${p.pl === 'G' ? '도금 소재 (F/H)' : '컬러 구매 소재'}<span>확보 <b>${n0(T.rec + T.ord)}</b> / ${n0(T.need)}t · <b class="${cl(tp) ? '' : ''}" style="${tp < 100 ? `color:var(--${tp < 90 ? 'bad' : 'warn'})` : ''}">${tp}%</b></span></h3>${rows}</div>`;
    };
    const tv = `<details class="mz-tv"><summary>표로 보기</summary><table class="t"><thead><tr><th>구분</th><th>소재 유형</th><th>필요</th><th>입고 완료</th><th>발주(입고 예정)</th><th>미발주</th><th>확보율</th></tr></thead><tbody>`
      + P.flatMap((p) => p.rows.map((r) => `<tr><td>${PN[p.pl]}</td><td>${esc(r.name)}</td><td>${n0(r.need)}</td><td>${n0(r.rec)}</td><td>${n0(r.ord)}</td><td>${n0(r.nw)}</td><td>${pc(r)}%</td></tr>`)).join('') + '</tbody></table></details>';
    el.innerHTML = `<h2>${M}월 소재 종합 <span class="tag" style="font-size:14px;font-weight:600;color:var(--ink-2)">유형별 그 달 필요량 대비 확보(입고 + 발주)</span><span class="unit">톤</span></h2>`
      + `<div class="mz-grid">${P.map(panel).join('')}</div>`
      + `<div class="mz-lg"><span><i class="r"></i>입고 완료</span><span><i class="o"></i>발주(입고 예정)</span><span><i class="n"></i>미발주(아직 발주 안 함)</span><span>막대 길이 = 그 달 필요량 · 숫자 = 확보 / 필요</span></div>` + tv;
    const tipEl = $('gk-tip');
    const show = (e, r) => {
      tipEl.textContent = '';
      const hd = document.createElement('div'); hd.className = 'h'; hd.textContent = `${r.name} · ${M}월`; tipEl.appendChild(hd);
      [['필요', r.need, ''], ['입고 완료', r.rec, 'var(--m-rec)'], ['발주(입고 예정)', r.ord, 'var(--m-ord)'], ['미발주', r.nw, 'var(--ink-3)'], ['확보율', null, '']].forEach(([k, v, c]) => {
        const rw = document.createElement('div'); rw.className = 'rw'; const i = document.createElement('i'); i.style.background = c || 'transparent'; const s = document.createElement('span'); s.textContent = k; const b = document.createElement('b'); b.textContent = v == null ? pc(r) + '%' : n0(v) + 't';
        rw.append(i, s, b); tipEl.appendChild(rw); });
      tipEl.hidden = false;
      const R = e.target.getBoundingClientRect(), x = e.clientX || R.left + R.width / 2, y = e.clientY || R.top;
      const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
      tipEl.style.left = Math.min(innerWidth - tw - 8, Math.max(8, x + 14)) + 'px'; tipEl.style.top = Math.max(8, (y + th + 20 > innerHeight ? y - th - 12 : y + 16)) + 'px';
    };
    el.querySelectorAll('.mz-r').forEach((row) => {
      const r = P.find((p) => p.pl === row.dataset.p).rows[+row.dataset.i];
      row.addEventListener('pointermove', (e) => show(e, r)); row.addEventListener('focus', (e) => show(e, r));
      row.addEventListener('pointerleave', () => { tipEl.hidden = true; }); row.addEventListener('blur', () => { tipEl.hidden = true; });
    });
  }
  // 소재 리드타임(발주 → 입고, 리드타임 화면과 같은 값) — 공장별 짧게
  function leadTable() {
    const L = D.LT, el = $('gk-lt'); if (!L || !L.types) { el.hidden = true; return; }
    const pt = {}; (L.sup || []).forEach((s) => { (pt[s[3]] = pt[s[3]] || new Set()).add(s[0]); });
    const grp = { G: [], C: [] }; L.types.forEach((t) => { const ps = pt[t[0]]; (ps && ps.has('G') && !ps.has('C') ? grp.G : grp.C).push(t); });
    const tb = (pl, T) => `<div><h3 style="margin:0 0 8px;font-size:16px;font-weight:800">${PN[pl]} 소재</h3><table class="t lt"><thead><tr><th>소재 유형</th><th>발주 → 입고</th><th>발주 방식</th></tr></thead><tbody>${T.sort((a, b) => a[1] - b[1]).map((t) => `<tr><td><b>${esc(t[0])}</b></td><td><b>${t[1]}</b>일</td><td>${esc(t[2])}</td></tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = `<h2>소재 리드타임 <span class="tag" style="font-size:14px;font-weight:600;color:var(--ink-2)">고치기는 <a href="leadtime.html">리드타임</a></span></h2><div class="lt-l">${grp.G.length ? tb('G', grp.G) : ''}${tb('C', grp.C)}</div>`;
  }

  // ---------- 소재 탭: supply.js 의 월 탭(#s-mon, 숨김)을 위 월 선택과 맞춤 ----------
  function matSync() {
    const b = document.querySelector(`#s-mon button[data-m="${mon}"]`);
    $('gk-matnone').hidden = !!b || !document.querySelector('#s-mon button');
    $('gk-matbody').hidden = !b && !!document.querySelector('#s-mon button');
    if (b) matKey = '';
    if (!b) { const last = document.querySelector('#s-mon button:last-child'); $('gk-matnone').textContent = `${+mon.slice(5)}월 소재 캘린더는 아직 없습니다 — 소재 계획은 ${last ? last.textContent : ''}까지`; return; }
    if (b.getAttribute('aria-pressed') !== 'true') b.click();
  }
  function bar() {
    $('gk-mon').innerHTML = D.ms.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === mon}">${+m.slice(5)}월</button>`).join('');
    $('gk-mon').querySelectorAll('button').forEach((b) => b.onclick = () => { mon = b.dataset.m; bar(); render(); if (tab === 'mat') matSync(); });
    $('gk-meta').textContent = `실적 ~${md(D.actG || today)}${D.at ? ` · 재계획 ${+D.at.slice(5, 7)}/${+D.at.slice(8, 10)} ${D.at.slice(11)}` : ''}`;
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
      bar(); render(); leadTable(); setTab(location.hash === '#mat' ? 'mat' : 'plan');
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
  let mcT = 0; new MutationObserver(() => { clearTimeout(mcT); mcT = setTimeout(() => { if (D) matChart(); }, 60); }).observe($('s-msum'), { childList: true, subtree: true });
  $('f').addEventListener('submit', () => { const v = $('pw').value; if (v) setTimeout(() => open(v), 0); });
  let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ }
  if (s) open(s);
})();
