/* 계획(gyehoek.html) — 11/12 회의·화이트보드 '# 계획'(엑셀로 인쇄하던 일별 가동계획 양식)
   이 화면에서 볼 것 · 보는 순서
     ① 판 고르기(월차 → 매주 조정(수요일 마감) → 지금) + 일별 가동계획 표(가장 크게) — 라인 × 날짜 톤. 지난 날 = 실적(진한 칸·점), 앞날 = 그 판의 계획.
        강종(AL·AZ·MAC) 칸 색 + 도금 라인 밑 강종 묶음 띠(이름 가운데), M/C 노랑, 정지 빨강, 휴지 회색. ◥ = 앞 판 대비 바뀐 앞날 칸(정지·M/C·강종 변경, 톤 ±20%)
        칸이 좁으면(날짜 칸 60px 미만) 반달씩 두 표. 칸을 누르면 판마다 그 칸 값(월차 → … → 지금) + 도금은 소재(F/H) 발주 마감·발주 상태
     ② 조정 표(화이트보드 '조정(실적반영)') — 판 × 라인 월 합계, 앞 판 대비 ±. 줄을 누르면 그 판을 ① 표로
     소재 탭: ① 소재 종합(소재 캘린더 '입고' 줄 = 입고 완료 + 발주 + 미발주, 가로 막대 + 숫자) → ② 소재 캘린더(일별 발주·입고·투입) → ③ 소재 리드타임
   자료·계산: 도금 = 매일 재계획(latest.plan, 지난 날 = MES 실적 + plating_actual), 컬러 = 확정 통합 계획(integrated.color, 지난 날 = color_actual),
   정지 = 재계획 cal · 통합 colorDown, 리드타임 = leadtime.enc.json, 소재 발주 상태 = mat_order.enc.json(groups.mats).
   월차·매주 조정 판 = gyehoek_hist.enc.json(사이트 git 이력: 월차 = 그 달 첫 게시 통합 계획 = 수주 관제 월초 계획, 조정 = 수요일 24시 직전 마지막 게시본) — 없으면 suju 월초 톤만.
   소재 캘린더 수치 = supply.js(같은 칸 id)가 계산 — 종합 그래프는 캘린더 '입고' 줄을 읽어 다시 그림 */
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
  const MINC = 64;                                                        // 날짜 칸 최소 폭(16px 굵은 네 자리 숫자 ≈ 50px + 양옆 여백 6px) — 모자라면 달을 2~3개 표로(반달·열흘)
  const LBW = 92, TOTW = 92;
  let D = null, mon = null, tab = 'plan', today = '', busy = false, vSel = {}, forceOne = false, chunks = 0;

  // ---------- 자료: 가동 캘린더(supply.js prep·live)와 같은 칸 ----------
  async function load(pw) {
    const get = async (n) => { try { const e = await GP.latest(n); return e ? await GP.decryptJSON(e, pw) : null; } catch (x) { return null; } };
    const [W, LP, CA, PA, SJ, LT, HI, MO] = await Promise.all(['integrated.enc.json', 'latest.plan.enc.json', 'color_actual.enc.json', 'plating_actual.enc.json', 'suju.enc.json', 'leadtime.enc.json', 'gyehoek_hist.enc.json', 'mat_order.enc.json'].map(get));
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
    const MATS = Object.fromEntries((((MO || {}).groups || {}).mats || []).filter((m) => m.plant === 'G').map((m) => [m.key, m]));
    D = { W, pl, ev, co, BD, actG, actC, cdn, p0, m0: SJ && SJ.month, at, ms, LT, H: HI && Array.isArray(HI.vers) ? HI : null, MATS };
    mon = ms[0];
  }

  // ---------- 판(版): 월차 → 매주 조정(수요일 마감) → 지금. 칸 하나 = {t, fam, mc, stop, act} ----------
  function curCell(l, d) {                                               // 지금 = 실적 + 매일 재계획
    const G = /CGL$/.test(l), k = `${l}|${d}`, e = G ? D.ev[k] : null;
    let t, act = false;
    if (G) { t = (D.pl[k] || {}).t || 0; act = !!D.actG && d <= D.actG; }
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
  const mdA = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}${s.length > 10 ? ' ' + s.slice(11, 16) : ''}` : '');
  function chain() {                                                     // 이 달의 판 목록(앞 → 뒤)
    const V = ((D.H && D.H.vers) || []).filter((v) => v.mon === mon).map((v) => ({
      id: v.id, kind: v.kind, lab: v.kind === 'm0' ? `월차 ${mdA(v.at).split(' ')[0]}` : v.lab, at: v.at,
      get: (l, d) => { const x = v.c[`${l}|${d}`] || [0, '', '휴지'], G = /CGL$/.test(l);
        return { t: x[0], fam: G ? x[1] || 'AL' : null, mc: x[2] === 'M', stop: x[2] === 'M' ? '' : x[2], act: G ? !!v.aG && d <= v.aG : !!v.aC && d <= v.aC }; } }));
    if (!V.some((v) => v.kind === 'm0') && D.m0 === mon)                 // 월차 판을 못 찾은 달: 수주 관제 월초 톤만(강종·M/C·정지 없음)
      V.unshift({ id: 'm0p', kind: 'm0', lab: '월차', toneOnly: true, get: (l, d) => ({ t: D.p0[`${l}|${d}`] || 0, fam: null, mc: false, stop: '', act: false }) });
    V.push({ id: 'now', kind: 'now', lab: `지금 ${D.at ? mdA(D.at) : ''}`.trim(), at: D.at, get: curCell });
    return V;
  }
  // 앞 판 대비 의미 있게 바뀐 칸: 정지·M/C·강종이 바뀌었거나 톤이 ±20% 이상(50t 이상)
  function differs(c, p, toneOnly) {
    if (!toneOnly) {
      if (c.stop !== p.stop || c.mc !== p.mc) return true;
      if (c.fam && p.fam && c.t >= 0.5 && p.t >= 0.5 && c.fam !== p.fam) return true;
    }
    const df = Math.abs(c.t - p.t);
    return df >= 50 && (p.t < 0.5 || df / p.t >= 0.2);
  }
  const lineSum = (V, l, ds) => ds.reduce((a, d) => a + V.get(l, d).t, 0);
  const fcls = (c) => (c.mc ? 'mc' : c.fam ? 'f' + c.fam : 'fC');

  // ---------- 표 하나: 라인 × 날짜(도금 라인 밑 = 강종 묶음 띠) ----------
  function table(ds, V, P, totLab) {
    const td0 = V.kind === 'now' ? today : '';                                  // 오늘 테두리는 '지금' 판에만
    const dcls = (d) => (wd(d) === 1 && d !== ds[0] ? ' wk' : '') + (d === td0 ? ' tdy' : '');
    const st = `min-width:${LBW + TOTW + ds.length * MINC}px`;
    let h = `<colgroup><col class="lb">${ds.map(() => '<col>').join('')}<col class="tot"></colgroup>`
      + `<thead><tr><th class="lb">라인</th>${ds.map((d) => `<th class="${(wd(d) % 6 === 0 ? 'we' : '') + dcls(d)}"><b>${+d.slice(8)}</b><span>${WD[wd(d)]}</span></th>`).join('')}<th class="tot">${totLab}</th></tr></thead><tbody>`;
    for (const pc of ['G', 'C']) {
      if (!UI.inScope(pc)) continue;
      const day = {};
      for (const l of LINES[pc]) {
        const C = ds.map((d) => V.get(l, d)), Q = P ? ds.map((d) => P.get(l, d)) : null;
        let tot = 0, r = `<tr${pc === 'G' ? ' class="g"' : ''}><th class="lb">${l}</th>`;
        for (let i = 0; i < ds.length; i++) {
          const d = ds[i], c = C[i];
          day[d] = (day[d] || 0) + c.t; tot += c.t;
          if (c.stop) {                                                    // 이어진 같은 정지는 한 칸(오늘 칸 경계에서는 끊음)
            let j = i; while (j + 1 < ds.length && C[j + 1].stop === c.stop && C[j + 1].act === c.act && ds[j + 1] !== td0) j++;
            const n = j - i + 1, idle = c.stop === '휴지';
            const nm = n <= 2 ? (idle ? '휴지' : c.stop === '정기수리' ? '수리' : c.stop) : `${c.stop} ${md(d)}~${ds[j].slice(5, 7) === d.slice(5, 7) ? +ds[j].slice(8) : md(ds[j])}`;
            let ch = false; if (Q) for (let x = i; x <= j; x++) if (!C[x].act && differs(C[x], Q[x], P.toneOnly)) ch = true;
            r += `<td class="${idle ? 'idle' : 'stp'}${n >= 3 ? ' wide' : ''}${ch ? ' chg' : ''}${dcls(d)}" colspan="${n}" data-c="${l}|${d}" title="${esc(`${l} ${c.stop} ${md(d)}${n > 1 ? '~' + md(ds[j]) : ''}${c.act ? ' (실적)' : ''}`)}"><span>${esc(nm)}</span></td>`;
            i = j; continue;
          }
          const fc = fcls(c), cls = ['d', fc];
          const nx = C[i + 1];
          if (nx && !nx.stop && fcls(nx) === fc && nx.act === c.act && ds[i + 1] !== td0 && wd(ds[i + 1]) !== 1) cls.push('jn');
          if (c.act) cls.push('a');
          if (c.t >= 999.5) cls.push('w4');                                   // 인쇄에서만 글자를 줄임(화면은 16px 그대로)
          if (Q && !c.act && differs(c, Q[i], P.toneOnly)) cls.push('chg');
          r += `<td class="${cls.join(' ')}${dcls(d)}" data-c="${l}|${d}">${c.t ? n0(c.t) : ''}${c.mc ? '<small>M/C</small>' : ''}</td>`;
        }
        h += r + `<td class="tot">${n0(tot)}</td></tr>`;
        if (pc === 'G' && C.some((c) => c.fam)) {                         // 강종 묶음 띠: 이어지는 같은 강종 = 한 띠 + 가운데 이름(화면 밖에서 시작해도 이름이 보이게 sticky)
          let b = '<tr class="fband"><th class="lb"></th>';
          for (let i = 0; i < ds.length; i++) {
            const f = C[i].stop || !C[i].fam ? '' : C[i].fam;
            let j = i; while (j + 1 < ds.length && (C[j + 1].stop || !C[j + 1].fam ? '' : C[j + 1].fam) === f) j++;
            const n = j - i + 1;
            b += f ? `<td class="b${f}${n >= 3 ? ' wide' : ''}${dcls(ds[i]).replace(' tdy', '')}" colspan="${n}"><span>${f}</span></td>` : `<td class="bn${dcls(ds[i]).replace(' tdy', '')}" colspan="${n}"></td>`;
            i = j;
          }
          h += b + '<td class="tot"></td></tr>';
        }
      }
      const T = ds.reduce((a, d) => a + day[d], 0);
      h += `<tr class="sum"><th class="lb">${PN[pc]} 합계</th>${ds.map((d) => `<td class="${dcls(d).trim()}">${day[d] >= 0.5 ? n0(day[d]) : ''}</td>`).join('')}<td class="tot">${n0(T)}</td></tr>`;
    }
    return `<div class="gk-wrap"><table class="gk v2-grid" style="${st}">${h}</tbody></table></div>`;
  }
  function legend(V, P) {
    const sw = (c, t) => `<span><i class="${c}"></i>${t}</span>`;
    const hasAct = V.kind !== 'm0';
    return `<div class="gk-lg">${UI.inScope('G') ? sw('fAL', 'AL') + sw('fAZ', 'AZ') + sw('fMAC', 'MAC') : ''}${UI.inScope('C') ? sw('fC', '컬러 가동') : ''}${UI.inScope('G') ? sw('mc', 'M/C') : ''}${V.toneOnly ? '' : sw('stp', '정지') + sw('idle', '휴지')}<span class="sep"></span>`
      + (hasAct ? sw('a', '실적') : '') + (P ? sw('chg', `${P.lab} 대비 바뀐 칸`) : '') + (V.kind === 'now' ? sw('tdy', '오늘') : '') + '</div>';
  }

  // 조정 표(화이트보드 '조정(실적반영)'): 판(월차 → 매주 조정 → 지금) × 라인 월 합계, 앞 판 대비 ±. 줄을 누르면 그 판을 위 표로
  function adjTable(CH, ds, si) {
    const cols = ['G', 'C'].filter((p) => UI.inScope(p)).flatMap((pc) => [...LINES[pc].map((l) => [l, [l]]), [`${PN[pc]} 합계`, LINES[pc]]]);
    const val = (V, ls) => ls.reduce((a, l) => a + lineSum(V, l, ds), 0);
    const A = CH.map((V) => cols.map(([, ls]) => val(V, ls)));
    const rows = CH.map((V, i) => `<tr class="${i === si ? 'on' : ''}" data-i="${i}" tabindex="0"><th>${esc(V.lab)}</th>${A[i].map((v, j) => { const df = i ? Math.round(v - A[i - 1][j]) : null;
      return `<td class="${/합계/.test(cols[j][0]) ? 'sm' : ''}"><b>${n0(v)}</b>${df != null ? `<em class="${df <= -0.5 ? 'dn' : df >= 0.5 ? 'up' : ''}">${sg(df)}</em>` : ''}</td>`; }).join('')}</tr>`).join('');
    return `<div class="gk-adjw"><table class="gk-adj"><thead><tr><th>조정</th>${cols.map(([n], j) => `<th class="${/합계/.test(n) ? 'sm' : ''}">${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // 누른 칸 한 줄: 판마다 그 칸(월차 → 매주 조정 → 지금) + 도금은 그 날 소재(F/H) 발주 마감과 발주 상태
  function info(l, d) {
    const CH = chain(), C = CH.map((V) => V.get(l, d)), last = C[C.length - 1], first = C[0];
    const tx = (c) => (c.stop ? c.stop : `${n0(c.t)}t${c.mc ? ' M/C' : c.fam ? ' ' + c.fam : ''}`);
    let h = `<b>${md(d)}(${WD[wd(d)]}) ${l}</b> ` + CH.map((V, i) => `<span class="${i === CH.length - 1 ? 'nw' : ''}">${esc(V.lab.replace(/ \d+:\d+$/, ''))} ${esc(tx(C[i]))}</span>`).join('<i>→</i>');
    if (CH.length > 1) { const df = Math.round(last.t - first.t); h += ` <em class="${df <= -0.5 ? 'dn' : ''}">(${sg(df)}t)</em>`; }
    if (/CGL$/.test(l) && D.LT && !last.act && last.t >= 0.5) {
      const sf = ((D.LT.fixed || []).find((f) => f[0] === 'safety.G') || [])[2] || 0, T = Object.fromEntries((D.LT.types || []).map((t) => [t[0], t[1]]));
      const M = D.MATS[last.fam === 'AL' ? 'G:H' : 'G:F'], lt = M && M.lt ? M.lt : T['P-FH'], dl = lt != null ? add(d, -(sf + lt)) : '';
      if (dl) {
        let s;
        if (M && M.first && d < M.first) s = ['ok', '발주 나감 · 확보'];
        else if (dl < today) s = ['bad', `마감 지남 · 미발주${M && M.late ? ` ${n0(M.late)}t` : ''}`];
        else s = ['', `발주 전${M && M.next ? ` · 다음 발주 ${md(M.next)}` : ''}`];
        h += `<span class="mt">${esc(M ? M.name : 'F/H')} 발주 마감 ${md(dl)} <b class="${s[0]}">${s[1]}</b></span>`;
      }
    }
    $('gk-info').innerHTML = h;
  }

  function render() {
    const ds = daysOf(mon), M = +mon.slice(5), CH = chain();
    const si = Math.min(CH.length - 1, vSel[mon] != null ? vSel[mon] : CH.length - 1), V = CH[si], P = si > 0 ? CH[si - 1] : null;
    const el = $('gk-plan'), w = (el.clientWidth || document.querySelector('main').clientWidth) - 44;
    const per = Math.max(7, Math.floor((w - LBW - TOTW) / MINC));
    chunks = forceOne ? 1 : Math.min(3, Math.ceil(ds.length / per));
    let h = `<section class="card gk-card"><h2>${M}월 일별 가동계획<span class="unit">톤</span></h2>`;
    if (CH.length > 1) h += `<div class="gk-ver" role="group" aria-label="판">${CH.map((x, i) => `${i ? '<i>→</i>' : ''}<button type="button" data-i="${i}" aria-pressed="${i === si}">${esc(x.lab)}</button>`).join('')}</div>`;
    if (V.toneOnly) h += '<p class="gk-none">월차 강종·M/C·정지 자료 없음 — 톤만</p>';
    if (chunks === 1) h += table(ds, V, P, '월 합계');
    else { const k = Math.ceil(ds.length / chunks); for (let i = 0; i < ds.length; i += k) { const part = ds.slice(i, i + k); h += table(part, V, P, `${i + 1}~${i + part.length}일`); } }
    h += legend(V, P) + '<div class="gk-info" id="gk-info"></div>';
    if (CH.length > 1) h += adjTable(CH, ds, si);
    h += '</section>';
    el.innerHTML = h;
    el.querySelectorAll('table.gk td[data-c]').forEach((td) => td.onclick = () => {
      el.querySelectorAll('table.gk td.sel').forEach((x) => x.classList.remove('sel')); td.classList.add('sel');
      const [l, d] = td.dataset.c.split('|'); info(l, d);
    });
    const pick = (i) => { vSel[mon] = i; render(); };
    el.querySelectorAll('.gk-ver button').forEach((b) => b.onclick = () => pick(+b.dataset.i));
    el.querySelectorAll('table.gk-adj tbody tr').forEach((tr) => { tr.onclick = () => pick(+tr.dataset.i); tr.onkeydown = (e) => { if (e.key === 'Enter') pick(+tr.dataset.i); }; });
    snap();
  }
  // 좁은 화면(표가 가로로 밀릴 때): 보이는 폭을 날짜 칸 경계에 맞추고 오늘 앞 2일부터 보이게(가동 캘린더 snap 과 같은 방식)
  function snap() {
    const W = [...document.querySelectorAll('.gk-wrap')];
    W.forEach((w) => {
      w.style.maxWidth = ''; if (!w.offsetParent || w.scrollWidth <= w.clientWidth + 1) return;
      const r0 = w.querySelector('thead tr'), st = r0.querySelector('th.lb').getBoundingClientRect().width, tw = r0.querySelector('th.tot').getBoundingClientRect().width;
      const days = [...r0.querySelectorAll('th:not(.lb):not(.tot)')], cw = days[0].getBoundingClientRect().width;
      const n = Math.max(1, Math.floor((w.clientWidth - st - tw) / cw)), ti = days.findIndex((x) => x.classList.contains('tdy')), i0 = ti < 0 ? 0 : Math.max(0, Math.min(days.length - n, ti - 2));
      w.style.maxWidth = Math.floor(st + tw + n * cw + 2) + 'px';
      w.scrollLeft = Math.round(i0 * cw);
    });
  }
  addEventListener('load', () => { if (D && tab === 'plan') render(); }); if (document.fonts) document.fonts.ready.then(() => { if (D && tab === 'plan') snap(); });
  let rsT = 0; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (D && tab === 'plan') render(); }, 150); });
  addEventListener('beforeprint', () => { if (D && tab === 'plan') { forceOne = true; render(); } });
  addEventListener('afterprint', () => { if (D && forceOne) { forceOne = false; render(); } });

  // ---------- 소재 종합: 아래 소재 캘린더(supply.js, 소재 유형별)의 '입고' 줄을 그대로 모아 가로 막대로 — 종합 필요 = 캘린더 '입고' 줄 월 합계(같은 정의)
  //   입고 완료 = 지난 날 입고 실적(MES), 발주 = 기발주 입고 예정, 미발주 = 새로 발주해야 들어올 분. 길이 = 그 달 들어와야 할 양
  const num = (s) => +String(s).replace(/,/g, '');
  function readMat() {
    const out = [], by = {};
    let pl = '', ty = '';
    document.querySelectorAll('#s-cal3 tbody tr').forEach((tr) => {
      if (tr.classList.contains('sec')) { pl = tr.dataset.dom; return; }
      const tn = tr.querySelector('.tn'); if (tn && tn.textContent.trim()) ty = tn.textContent.trim();
      if (!tr.classList.contains('m-inb') || !ty) return;
      const r = { name: ty, rec: 0, ord: 0, nw: 0, need: 0 };
      tr.querySelectorAll('td.v[data-d]').forEach((td) => {
        if (td.dataset.d.slice(0, 7) !== mon) return;
        const tt = td.getAttribute('title') || '', t = num(td.textContent);
        let m;
        if (/실적/.test(tt)) r.rec += t;
        else if ((m = tt.match(/기발주 ([\d,]+)t · 새 발주분 ([\d,]+)t/))) { r.ord += num(m[1]); r.nw += num(m[2]); }
        else r.ord += t;
      });
      r.need = r.rec + r.ord + r.nw;
      if (r.need >= 0.5) { if (!by[pl]) out.push((by[pl] = { pl, rows: [] })); by[pl].rows.push(r); }
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
    const nums = (r) => `<span class="r">입고 <b>${n0(r.rec)}</b></span><span class="o">발주 <b>${n0(r.ord)}</b></span><span class="n${r.nw >= 0.5 ? ' on' : ''}">미발주 <b>${n0(r.nw)}</b></span>`;
    const panel = (p) => {
      const T = p.rows.reduce((a, r) => ({ need: a.need + r.need, rec: a.rec + r.rec, ord: a.ord + r.ord, nw: a.nw + r.nw }), { need: 0, rec: 0, ord: 0, nw: 0 }), tp = pc(T);
      const rows = p.rows.map((r, i) => { const w = (v) => (v / mx * 100).toFixed(2) + '%', v = pc(r);
        return `<div class="mz-r" tabindex="0" data-p="${p.pl}" data-i="${i}"><div class="nm">${esc(r.name)}</div><div class="bar"><div class="trk" style="width:${w(r.need)}">${[['r', r.rec], ['o', r.ord], ['n', r.nw]].filter(([, x]) => x >= 0.5).map(([k, x]) => `<i class="${k}" style="flex:${x} 0 0"></i>`).join('')}</div></div>`
          + `<div class="v"><span class="nd">필요 <b>${n0(r.need)}</b></span>${nums(r)}<em class="${cl(v)}">${v}%</em></div></div>`; }).join('');
      return `<div class="mz-p"><h3>${p.pl === 'G' ? '도금 소재 (F/H)' : '컬러 구매 소재'}<span class="nd">필요 <b>${n0(T.need)}</b></span>${nums(T)}<em class="${cl(tp)}">${tp}%</em></h3>${rows}</div>`;
    };
    el.innerHTML = `<h2>${M}월 소재 종합<span class="unit">톤</span></h2>`
      + `<div class="mz-grid">${P.map(panel).join('')}</div>`
      + `<div class="mz-lg"><span><i class="r"></i>입고 완료</span><span><i class="o"></i>발주(입고 예정)</span><span><i class="n"></i>미발주</span></div>`;
    const tipEl = $('gk-tip');
    const show = (e, r) => {
      tipEl.textContent = '';
      const hd = document.createElement('div'); hd.className = 'h'; hd.textContent = `${r.name} · ${M}월`; tipEl.appendChild(hd);
      [['필요', r.need, ''], ['입고 완료', r.rec, 'var(--m-rec)'], ['발주(입고 예정)', r.ord, 'var(--m-ord)'], ['미발주', r.nw, 'var(--m-nw)'], ['확보율', null, '']].forEach(([k, v, c]) => {
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
  // 소재 캘린더 손질: 1일부터 보이게(가로 스크롤 처음으로) · 지난 날 빈 '생산 투입' 칸 = '실적 없음' 한 칸
  function calFix() {
    const T = $('s-cal3'); if (!T || !T.tBodies[0]) return;
    T.querySelectorAll('tr.m-use').forEach((tr) => {
      const E = [...tr.querySelectorAll('td.e.past')]; if (E.length < 2 || tr.dataset.fx) return;
      const run = []; for (const td of E) { if (run.length && run[run.length - 1].nextElementSibling !== td) break; run.push(td); }
      if (run.length < 2) return;
      run[0].colSpan = run.length; run[0].classList.add('nx'); run[0].innerHTML = '<span>실적 없음</span>';
      run.slice(1).forEach((td) => td.remove()); tr.dataset.fx = '1';
    });
    const w = $('s-calw3'); if (w && w.offsetParent) { w.style.maxWidth = ''; w.scrollLeft = 0; }   // supply.js 는 오늘 앞 2일로 밀어 둠 → 1일부터
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
    $('gk-print').hidden = tab !== 'plan';
  }
  function setTab(t) {
    tab = t;
    $('gk-tab').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    $('gk-plan').hidden = t !== 'plan'; $('gk-mat').hidden = t !== 'mat';
    $('gk-print').hidden = t !== 'plan';
    if (t === 'mat') matSync(); else if (D) render();
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
  new MutationObserver(() => { if (D && tab === 'mat') matSync(); }).observe($('s-mon'), { childList: true });
  let mcT = 0; new MutationObserver(() => { clearTimeout(mcT); mcT = setTimeout(() => { if (D) { calFix(); matChart(); setTimeout(calFix, 600); } }, 60); }).observe($('s-cal3'), { childList: true });   // supply.js 가 400ms 뒤 한 번 더 '오늘 앞 2일'로 밈 → 그 뒤 다시 1일로
  let cfT = 0; new ResizeObserver(() => { clearTimeout(cfT); cfT = setTimeout(() => { if (D && tab === 'mat') calFix(); }, 500); }).observe($('gk-mat'));
  $('f').addEventListener('submit', () => { const v = $('pw').value; if (v) setTimeout(() => open(v), 0); });
  let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ }
  if (s) open(s);
})();
