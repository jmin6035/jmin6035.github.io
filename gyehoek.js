/* 계획(gyehoek.html) — 11/12 회의·화이트보드 '# 계획'(엑셀로 인쇄하던 일별 가동계획 양식)
   이 화면에서 볼 것 · 보는 순서
     ① 판 고르기(월차 → 매주 조정(수요일 마감) → 지금) + 일별 가동계획 표 = 사용자가 보낸 엑셀 가동계획 양식 그대로(11/12)
        한 달 = 한 표(1~31일 + 계), 머리 2줄(날짜·요일, 토·일·공휴일 노랑 바탕 빨강 굵게), 얇은 회색 격자 · 가운데 정렬
        도금 라인: 첫 강종 행 → 이벤트 행(M/C·S/D 노랑) → 다음 강종 행 → 가동시간 행(초록). 강종 = 그 달에 먼저 나온 순, 칸 색 AZ 주황 · AL 파랑 · MACOSTA 보라
        여러 날 정지(정기수리·수리·휴지) = 직전 강종 행에 남색 합친 칸 '이름 (N일)'. 컬러 라인 = 톤 행(회청) + 이벤트 행. 도금·컬러 합계 행, 맨 아래 특기사항(계 = 도금/컬러/총합)
        지난 날 = 실적(한 단계 진한 색 + 왼쪽 위 점), 오늘 = 굵은 틀, ◥ = 앞 판 대비 바뀐 앞날 칸. 칸을 누르면 표 아래 가동 상세(가동 캘린더와 같은 카드, 머리 = 판마다 그 칸 값 + 도금 소재 발주 상태)
        가동시간: 지난 날 = MES 실적 가동 분(plating_actual.dayMin), 앞날 = 24 − 재계획 cal 의 정지 분(blackout + M/C·재가동 분, 엔진 switchDummy·restart)
        특기사항: AL-STS(임)·AL-LG 생산 날(재계획 rows), 실적 S/D 겸 M/C 날(plating_actual.mc), 컬러 시험·샘플(통합 colorDown)
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
  const FN = { AZ: 'AZ', AL: 'AL', MAC: 'MACOSTA' }, PL = { '1CGL': ['AL', 'AZ'], '2CGL': ['AL', 'MAC'] };   // 엑셀 양식의 강종 행 이름 · 라인 강종
  const HOL = new Set(['2026-12-25', '2027-01-01']);                      // 공휴일(머리 칸 노랑·빨강)
  const CK = { sd: 'S/D', repair: '수리', clean: '청소' }, CN = { test: '시험', sample: '샘플' };   // 컬러 부분 정지(이벤트 행 노랑) · 시험·샘플(특기사항)
  let D = null, mon = null, tab = 'plan', today = '', busy = false, vSel = {};

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
      for (const [d, l, a, gr, t] of R.rows) { const x = (pl[`${l}|${d}`] = pl[`${l}|${d}`] || { t: 0, al: {}, sub: {}, gg: {}, aa: {} }); x.t += t; const gk = gNm(gr); x.gg[gk] = (x.gg[gk] || 0) + t; x.aa[a] = (x.aa[a] || 0) + t; x.al[FAM(a)] = (x.al[FAM(a)] || 0) + t; if (/^AL-/.test(a) && t >= 0.5) x.sub[a] = 1; }
      for (const c of R.cal) ev[`${c.line}|${c.date}`] = c;
      if (PA && PA.asOf && Array.isArray(PA.daily) && t0) for (const r of PA.daily) {   // 재계획 실적일 뒤에 들어온 MES 실적 = 라인 합계를 실적으로(supply.js 와 같게)
        if (!(r.d > t0 && r.d <= PA.asOf)) continue;
        for (const l of LINES.G) { const k = `${l}|${r.d}`; pl[k] = Object.assign(pl[k] || { al: {}, sub: {} }, { t: r[l] || 0 }); }
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
    const cdx = {};                                                      // 컬러 정지 전부(부분 정지·시험·샘플 포함) — 이벤트 행·특기사항
    for (const [d, l, k, mn] of W.colorDown || []) { const z = (cdx[`${l}|${d}`] = cdx[`${l}|${d}`] || {}); z[k] = (z[k] || 0) + mn; if (KN[k]) { const y = (cdn[`${l}|${d}`] = cdn[`${l}|${d}`] || {}); y[k] = (y[k] || 0) + mn; } }
    const dayMin = (PA && PA.dayMin) || {}, gsd = new Set(((PA && PA.mc) || []).filter((m) => m.sd).map((m) => `${m.line}|${m.d}`));   // 도금 실적 가동 분(MES) · 실적 S/D 날
    const SW = ((R && R.P) || {}).switchDummy || {};                     // M/C 1회 정지(분) — 엔진 파라미터(재계획에 쓴 값)
    if (SJ && SJ.daily && SJ.month) for (const [l, rows] of Object.entries(SJ.daily)) for (const r of rows) p0[`${l}|${r[0]}`] = +r[1] || 0;
    const ms = [today.slice(0, 7), mAdd(today.slice(0, 7), 1), mAdd(today.slice(0, 7), 2)];
    const MATS = Object.fromEntries((((MO || {}).groups || {}).mats || []).filter((m) => m.plant === 'G').map((m) => [m.key, m]));
    D = { W, pl, ev, co, BD, actG, actC, cdn, cdx, dayMin, gsd, SW, p0, m0: SJ && SJ.month, at, ms, LT, H: HI && Array.isArray(HI.vers) ? HI : null, MATS };
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
    let fam = null, stop = '', al = {};
    if (G) {
      const a0 = (D.pl[k] || {}).al || {}, s0 = sumV(a0);
      fam = Object.keys(a0).sort((a, b) => a0[b] - a0[a])[0] || FAM((e && e.fam) || 'AL');
      if (t >= 0.5) { if (s0 >= 0.5) for (const [f, v] of Object.entries(a0)) al[f] = v * t / s0; else al[fam] = t; }   // MES 실적 날 = 계획 강종 비율로 나눔
    }
    if (t < 0.5 && !mc) {
      if (G) stop = e && e.blackout >= 1439 ? (/정기수리/.test(e.event) ? '정기수리' : /수리/.test(e.event) ? '수리' : /S\/D/.test(e.event) ? 'S/D' : '휴지') : '휴지';
      else { const z = D.cdn[k] || {}, top = Object.keys(z).sort((a, b) => z[b] - z[a])[0]; stop = top && sumV(z) >= 1439 ? KN[top] : '휴지'; }
    }
    const sd = G ? (/S\/D 재가동/.test((e && e.event) || '') || D.gsd.has(k)) : false;
    const dn = G && e ? (e.blackout || 0) + (e.mcdummy || 0) : null;      // 계획 정지 분(정지 + M/C·재가동)
    return { t: t < 0.5 ? 0 : t, act, fam, mc, stop, al, sd, dn, ev: e && e.event };
  }
  // 가동시간(시간): 지난 날 = MES 실적 가동 분, 앞날 = 24 − 계획 정지(재계획 cal 의 정지 + M/C 분), 판 자료에 분이 없으면 M/C = 24 − 엔진 M/C 분
  function hrs(l, d, c) {
    const am = (D.dayMin[d] || {})[l];
    if (c.act && am != null) return am / 60;
    if (c.t < 0.5 && !c.mc) return 0;
    if (c.dn != null) return Math.max(0, 24 - c.dn / 60);
    return c.mc ? 24 - (D.SW[l] || 0) / 60 : 24;
  }
  const mdA = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}${s.length > 10 ? ' ' + s.slice(11, 16) : ''}` : '');
  function chain() {                                                     // 이 달의 판 목록(앞 → 뒤)
    const V = ((D.H && D.H.vers) || []).filter((v) => v.mon === mon).map((v) => ({
      id: v.id, kind: v.kind, lab: v.kind === 'm0' ? `월차 ${mdA(v.at).split(' ')[0]}` : v.lab, at: v.at,
      get: (l, d) => { const x = v.c[`${l}|${d}`] || [0, '', '휴지'], G = /CGL$/.test(l);
        return { t: x[0], fam: G ? x[1] || 'AL' : null, al: G && x[0] >= 0.5 ? { [x[1] || 'AL']: x[0] } : {}, mc: x[2] === 'M', stop: x[2] === 'M' ? '' : x[2], act: G ? !!v.aG && d <= v.aG : !!v.aC && d <= v.aC }; } }));
    if (!V.some((v) => v.kind === 'm0') && D.m0 === mon)                 // 월차 판을 못 찾은 달: 수주 관제 월초 톤만(강종·M/C·정지 없음)
      V.unshift({ id: 'm0p', kind: 'm0', lab: '월차', toneOnly: true, get: (l, d) => { const t = D.p0[`${l}|${d}`] || 0; return { t, fam: null, al: t ? { X: t } : {}, mc: false, stop: '', act: false }; } });
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
  const cellT = (c) => (c.stop ? 0 : c.al && Object.keys(c.al).length ? Object.values(c.al).reduce((a, v) => a + (v >= 0.5 ? Math.round(v) : 0), 0) : Math.round(c.t));   // 표 칸과 같은 반올림
  const lineSum = (V, l, ds) => ds.reduce((a, d) => a + cellT(V.get(l, d)), 0);

  // ---------- 표: 엑셀 일별 가동계획 양식 그대로(한 달 = 한 표, 1~31일 + 계) ----------
  //   도금 라인 = 첫 강종 행 → 이벤트 행(M/C·S/D 노랑) → 다음 강종 행 → 가동시간 행(초록). 여러 날 정지 = 직전 강종 행에 남색 합친 칸
  //   컬러 라인 = 톤 행 + 이벤트 행(부분 정지 노랑, 정지·휴지 남색 합친 칸). 합계 행 · 맨 아래 특기사항
  const hfmt = (h) => { const r = Math.round(h * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
  function table(ds, V, P) {
    const ti = V.kind === 'now' ? ds.indexOf(today) : -1;
    const dc = (i) => (i === ti ? ' tdy' : '');                            // 오늘 = 굵은 테두리(표 위에 겹친 틀, 합친 칸도 끊지 않음)
    const red = (d) => wd(d) % 6 === 0 || HOL.has(d);
    const runs = (key) => { const out = []; for (let i = 0; i < ds.length; i++) { const k = key(i); if (!k) continue; let j = i; while (j + 1 < ds.length && key(j + 1) === k) j++; out.push({ i, j, k }); i = j; } return out; };
        const chgOf = (C, Q, i) => (Q && !C[i].act && differs(C[i], Q[i], P.toneOnly) ? ' chg' : '');
    const empty = (i) => `<td class="e${dc(i)}"></td>`;
    const lab = (s, nm) => {                                               // 합친 칸 이름: 오늘 틀이 가운데를 지나면 넓은 쪽 가운데로
      const n = s.j - s.i + 1; if (ti < s.i || ti > s.j || n < 3) return `<span>${esc(nm)}</span>`;
      const a = ti - s.i, b = s.j - ti, c = a >= b ? a / 2 : a + 1 + b / 2;
      return `<span style="position:relative;left:${((c - n / 2) / n * 100).toFixed(1)}%">${esc(nm)}</span>`;
    };
    let h = `<colgroup><col class="c0"><col class="c1">${ds.map(() => '<col>').join('')}<col class="tot"></colgroup><thead>`
      + `<tr><th class="c0" rowspan="2"></th><th class="c1" rowspan="2"></th>${ds.map((d, i) => `<th class="dn${red(d) ? ' we' : ''}${dc(i)}">${+d.slice(8)}</th>`).join('')}<th class="tot" rowspan="2">계</th></tr>`
      + `<tr>${ds.map((d, i) => `<th class="dw${red(d) ? ' we' : ''}${dc(i)}">${WD[wd(d)]}</th>`).join('')}</tr></thead><tbody>`;
    const T = { G: null, C: null }, notes = ds.map(() => []);
    if (UI.inScope('G')) {
      const day = ds.map(() => 0);
      for (const l of LINES.G) {
        const C = ds.map((d) => V.get(l, d)), Q = P ? ds.map((d) => P.get(l, d)) : null;
        const fams = [], amt = {}, at = ds.map(() => null), f0 = {};                // at[i] = 그 날까지 마지막 강종(정지 칸을 놓을 '직전 강종 행')
        let prev = null;
        C.forEach((c, i) => {
          const ks = Object.keys(c.al).filter((f) => c.al[f] >= 0.5).sort((a, b) => (a === prev ? -1 : b === prev ? 1 : c.al[b] - c.al[a]));
          for (const f of ks) { if (!amt[f]) { amt[f] = ds.map(() => 0); fams.push(f); f0[f] = i; } amt[f][i] = Math.round(c.al[f]); }
          if (ks.length) prev = ks[ks.length - 1];
          at[i] = prev;
        });
        const stopKey = (i) => C[i].stop;
        const SR = runs(stopKey).map((r) => {                              // 정지 묶음 → 직전 강종 행(달 첫머리 정지면 그 날 자료의 강종)
          const f = (r.i > 0 && at[r.i - 1]) || C[r.i].fam || fams[0] || (PL[l] || ['AL'])[0];
          if (!amt[f]) { amt[f] = ds.map(() => 0); fams.push(f); }
          f0[f] = Math.min(f0[f] != null ? f0[f] : 99, r.i);
          return Object.assign(r, { f, n: r.j - r.i + 1 });
        });
        if (!fams.length) { const f = C.find((c) => c.fam) ? C.find((c) => c.fam).fam : (PL[l] || ['AL'])[0]; amt[f] = ds.map(() => 0); fams.push(f); }
        fams.sort((a, b) => (f0[a] || 0) - (f0[b] || 0));                 // 강종 행 = 그 달에 먼저 나온 순
        const inStop = ds.map(() => false); SR.forEach((r) => { for (let x = r.i; x <= r.j; x++) inStop[x] = true; });
        const nR = fams.length + 2;
        const famRow = (f, first) => {
          let r = `<tr class="gr${first ? ' ls' : ''}">${first ? `<th class="c0 lnG" rowspan="${nR}">${l}</th>` : ''}<th class="c1">${FN[f] || (f === 'X' ? '톤' : f)}</th>`, tot = 0;
          for (let i = 0; i < ds.length; i++) {
            const s = SR.find((x) => x.i === i);
            if (s && s.f === f) {
              const nm = s.k + (s.n > 1 ? ` (${s.n}일)` : '');
              r += `<td class="sp${dc(i)}${chgOf(C, Q, i)}" colspan="${s.j - s.i + 1}" data-c="${l}|${ds[i]}" title="${esc(`${l} ${s.k} ${md(ds[s.i])}${s.j > s.i ? '~' + md(ds[s.j]) : ''}`)}">${lab(s, nm)}</td>`;
              i = s.j; continue;
            }
            const v = inStop[i] ? 0 : amt[f][i];
            tot += v; day[i] += v;
            r += v ? `<td class="d k${f}${C[i].act ? ' a' : ''}${chgOf(C, Q, i)}${dc(i)}" data-c="${l}|${ds[i]}">${n0(v)}</td>` : empty(i);
          }
          return r + `<td class="tot${f === 'AZ' ? ' red' : ''}">${n0(tot)}</td></tr>`;
        };
        let ev = '<tr class="ev"><th class="c1"></th>';
        for (let i = 0; i < ds.length; i++) {
          const c = C[i], t = inStop[i] ? '' : c.mc ? 'M/C' : c.sd ? 'S/D' : '';
          if (c.mc && c.sd) notes[i].push(`${l} S/D`);
          if (V.kind === 'now' && c.t >= 0.5) for (const a of Object.keys((D.pl[`${l}|${ds[i]}`] || {}).sub || {})) notes[i].push(a === 'AL-STS' ? 'STS(임)' : a);
          ev += t ? `<td class="y${dc(i)}" data-c="${l}|${ds[i]}">${t}</td>` : empty(i);
        }
        ev += '<td class="tot">-</td></tr>';
        let hr = '<tr class="hr le"><th class="c1">가동시간</th>', hs = 0;
        for (let i = 0; i < ds.length; i++) { const v = Math.round(hrs(l, ds[i], C[i]) * 10) / 10; hs += v; hr += `<td class="${dc(i).trim()}">${hfmt(v)}</td>`; }
        hr += `<td class="tot">${hfmt(hs)}</td></tr>`;
        h += famRow(fams[0], true) + ev + fams.slice(1).map((f) => famRow(f, false)).join('') + hr;
      }
      T.G = day.reduce((a, v) => a + v, 0);
      h += `<tr class="sum"><th class="c0" colspan="2">도금 합계</th>${day.map((v, i) => `<td class="${dc(i).trim()}">${v ? n0(v) : ''}</td>`).join('')}<td class="tot">${n0(T.G)}</td></tr>`;
    }
    if (UI.inScope('C')) {
      const day = ds.map(() => 0);
      for (const l of LINES.C) {
        const C = ds.map((d) => V.get(l, d)), Q = P ? ds.map((d) => P.get(l, d)) : null;
        let r = `<tr class="cr ls"><th class="c0 lnC" rowspan="2">${l}</th><th class="c1">생산</th>`, tot = 0;
        for (let i = 0; i < ds.length; i++) {
          const v = C[i].stop ? 0 : Math.round(C[i].t); tot += v; day[i] += v;
          r += v ? `<td class="d kC${C[i].act ? ' a' : ''}${chgOf(C, Q, i)}${dc(i)}" data-c="${l}|${ds[i]}">${n0(v)}</td>` : empty(i);
        }
        h += r + `<td class="tot">${n0(tot)}</td></tr>`;
        const stopKey = (i) => C[i].stop, SR = runs(stopKey);
        let ev = '<tr class="ev le"><th class="c1"></th>';
        for (let i = 0; i < ds.length; i++) {
          const z = D.cdx[`${l}|${ds[i]}`] || {};
          for (const k of Object.keys(CN)) if (z[k]) notes[i].push(`${l[0]}C ${CN[k]}`);
          const s = SR.find((x) => x.i === i);
          if (s) {
            const n = s.j - s.i + 1, nm = s.k + (n > 1 ? ` (${n}일)` : '');
            ev += `<td class="sp${dc(i)}${chgOf(C, Q, i)}" colspan="${s.j - s.i + 1}" data-c="${l}|${ds[i]}" title="${esc(`${l} ${s.k} ${md(ds[s.i])}${s.j > s.i ? '~' + md(ds[s.j]) : ''}`)}">${lab(s, nm)}</td>`;
            i = s.j; continue;
          }
          const t = Object.keys(CK).filter((k) => z[k] && z[k] < 1439).map((k) => CK[k])[0] || '';
          ev += t ? `<td class="y${dc(i)}" data-c="${l}|${ds[i]}" title="${esc(`${l} ${t} ${hfmt(z[Object.keys(CK).find((k) => CK[k] === t)] / 60)}시간`)}">${t}</td>` : empty(i);
        }
        h += ev + '<td class="tot">-</td></tr>';
      }
      T.C = day.reduce((a, v) => a + v, 0);
      h += `<tr class="sum"><th class="c0" colspan="2">컬러 합계</th>${day.map((v, i) => `<td class="${dc(i).trim()}">${v ? n0(v) : ''}</td>`).join('')}<td class="tot">${n0(T.C)}</td></tr>`;
    }
    // 특기사항: 같은 날 여러 줄(시험은 라인을 묶어 '3·4C 시험'), 이어지는 같은 글은 한 칸
    const txt = notes.map((a) => {
      const u = [...new Set(a)], out = [], g = {};
      for (const s of u) { const m = s.match(/^(\d)C (.+)$/); if (m) (g[m[2]] = g[m[2]] || []).push(m[1]); else out.push(s); }
      for (const [k, ns] of Object.entries(g)) out.push(`${ns.join('·')}C ${k}`);
      return out.join('\n');
    });
    // 특기사항 행 없앰(11/12 사용자) · 달마다 표 크기가 같게 31일 칸 고정 — 짧은 달은 끝에 빈 칸
    const pad = 31 - ds.length;
    if (pad > 0) h = h.replace('<col class="tot">', '<col class="pad">'.repeat(pad) + '<col class="tot">').replace('<th class="tot" rowspan="2">', `<th class="padc" rowspan="2" colspan="${pad}"></th><th class="tot" rowspan="2">`).replace(/<td class="tot/g, `<td class="padc" colspan="${pad}"></td><td class="tot`);
    void notes;
    return `<div class="gk-wrap"><table class="gk">${h}</tbody></table>${ti >= 0 ? '<i class="gk-tdy" aria-hidden="true"></i>' : ''}</div>`;
  }
  function legend(V, P) {
    const sw = (c, t) => `<span><i class="${c}"></i>${t}</span>`;
    return `<div class="gk-lg">${UI.inScope('G') ? sw('kAZ', 'AZ') + sw('kAL', 'AL') + sw('kMAC', 'MACOSTA') : ''}${UI.inScope('C') ? sw('kC', '컬러 가동') : ''}${sw('y', 'M/C · S/D')}${sw('sp', '정지 · 휴지')}${UI.inScope('G') ? sw('hr', '가동시간') : ''}<span class="sep"></span>`
      + (V.kind !== 'm0' ? sw('a', '실적') : '') + (P ? sw('chg', `${P.lab} 대비 바뀐 칸`) : '') + (V.kind === 'now' ? sw('tdy', '오늘') : '') + '</div>';
  }

  // 조정 표(화이트보드 '조정(실적반영)'): 판(월차 → 매주 조정 → 지금) × 라인 월 합계, 앞 판 대비 ±. 줄을 누르면 그 판을 위 표로
  function adjTable(CH, ds, si) {
    const cols = ['G', 'C'].filter((p) => UI.inScope(p)).flatMap((pc) => [...LINES[pc].map((l) => [l, [l]]), [`${PN[pc]} 합계`, LINES[pc]]]);
    const val = (V, ls) => ls.reduce((a, l) => a + lineSum(V, l, ds), 0);
    const A = CH.map((V) => cols.map(([, ls]) => val(V, ls)));
    // 판마다 '월 합계 | 앞 판 대비' 두 칸(11/12 사용자 '조정 이해가 안 된다 — 칸 구분')
    const rows = CH.map((V, i) => `<tr class="${i === si ? 'on' : ''}" data-i="${i}" tabindex="0"><th>${esc(V.lab)}</th>${A[i].map((v, j) => { const df = i ? Math.round(v - A[0][j]) : null,   // 월차(첫 판) 대비(11/12 사용자)
      sm = /합계/.test(cols[j][0]) ? ' sm' : '';
      return `<td class="bl${sm}"><b>${n0(v)}</b></td><td class="df${sm}${df != null && df <= -0.5 ? ' dn' : df != null && df >= 0.5 ? ' up' : ''}">${df == null ? '–' : df === 0 ? '0' : sg(df)}</td>`; }).join('')}</tr>`).join('');
    return `<h3 class="gk-adjh">판별 월 생산 합계 <small>톤</small></h3><div class="gk-adjw"><table class="gk-adj"><thead><tr><th rowspan="2">판</th>${cols.map(([n]) => `<th colspan="2" class="bl${/합계/.test(n) ? ' sm' : ''}">${n}</th>`).join('')}</tr><tr>${cols.map(([n]) => `<th class="sub bl${/합계/.test(n) ? ' sm' : ''}">월 합계</th><th class="sub${/합계/.test(n) ? ' sm' : ''}">월차 대비</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // 누른 칸 한 줄(가동 상세 머리): 판마다 그 칸(월차 → 매주 조정 → 지금) + 도금은 그 날 소재(F/H) 발주 마감과 발주 상태
  function info(l, d, noMat) {
    const CH = chain(), C = CH.map((V) => V.get(l, d)), last = C[C.length - 1], first = C[0];
    const tx = (c) => (c.stop ? c.stop : `${n0(c.t)}t${c.mc ? ' M/C' : c.fam ? ' ' + c.fam : ''}`);
    let h = `<b>${md(d)}(${WD[wd(d)]}) ${l}</b> ` + CH.map((V, i) => `<span class="${i === CH.length - 1 ? 'nw' : ''}">${esc(V.lab.replace(/ \d+:\d+$/, ''))} ${esc(tx(C[i]))}</span>`).join('<i>→</i>');
    if (CH.length > 1) { const df = Math.round(last.t - first.t); h += ` <em class="${df <= -0.5 ? 'dn' : ''}">(${sg(df)}t)</em>`; }
    if (!noMat && /CGL$/.test(l) && D.LT && !last.act && last.t >= 0.5) {   // 상세 카드에 품목별 발주 마감·판정이 있으면 머리에서는 뺌(중복)
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
    return h;
  }
  // 칸을 누르면 표 아래 '가동 상세'(가동 캘린더 상세와 같은 카드 — supply.js window.supDet) · 다시 누르거나 닫기 = 접힘
  // 지난 날(실적) 칸 = 계획 카드 대신 실적 상세(판매그룹·강종/품명 톤 · 가동시간) — 11/12 사용자 '뭔데 이거'(빈 계획 카드)
  function gNm(g) { return /자동차/.test(g) ? '자동차' : /자가재/.test(g) ? '도금 자가재' : /수출/.test(g) ? '도금수출' : /국내|판매/.test(g) ? '도금국내' : g; }
  function cNm(g) { return /수출|가전내수/.test(g) ? '컬러수출' : /주문재|계획재|건재/.test(g) ? '컬러건재' : /수요/.test(g) ? '수요개발' : g; }
  function actDet(l, d) {
    const kv = (o) => Object.entries(o || {}).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]);
    const tb = (h, rows) => (rows.length ? `<table class="gk-act"><thead><tr><th>${h}</th><th>톤</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n0(v)}</td></tr>`).join('')}</tbody></table>` : '');
    if (/CGL$/.test(l)) { const x = D.pl[`${l}|${d}`] || {}, m = D.dayMin[`${l}|${d}`];
      if (!(x.t >= 0.5)) return '';
      return `<div class="gk-actw"><h4>${l} · 실적 ${n0(x.t)}t${m ? ` · 가동 ${(m / 60).toFixed(1)}시간` : ''}</h4><div class="gk-acts">${tb('판매그룹', kv(x.gg))}${tb('강종', kv(x.aa))}</div></div>`; }
    const v = ((D.BD || {})[d] || {})[l]; if (!v) return '';
    const g = {}; for (const [k, t] of Object.entries(v[0] || {})) { const c = cNm(k); g[c] = (g[c] || 0) + t; }
    return `<div class="gk-actw"><h4>${l} · 실적 ${n0(sumV(v[0]))}t · 가동 ${((v[1] || 0) / 60).toFixed(1)}시간</h4><div class="gk-acts">${tb('판매그룹', kv(g))}${tb('품명', (v[2] || []).filter((r) => r[1] >= 0.5))}</div></div>`;
  }
  let detK = '';
  function detail(td) {
    const el = $('gk-det'), k = td ? td.dataset.c : '';
    document.querySelectorAll('table.gk td.sel').forEach((x) => x.classList.remove('sel'));
    if (!k || k === detK) { detK = ''; el.hidden = true; el.innerHTML = ''; return; }
    detK = k; td.classList.add('sel');
    const [l, d] = k.split('|'), past = /CGL$/.test(l) ? d <= D.actG : d <= D.actC, body = past ? actDet(l, d) : window.supDet ? window.supDet(d, [l]) : null;
    el.innerHTML = `<div class="dethd g"><span class="gk-info">${info(l, d, /class="dt mt fl"/.test(body || ''))}</span><button type="button" class="fold noprint" data-x>닫기</button></div>`
      + (body == null ? '<p class="gk-none">상세 자료를 불러오는 중입니다 — 잠시 뒤 다시 누르세요</p>' : body || '<p class="gk-none">이 날 품목 상세 없음</p>');
    el.hidden = false;
    el.querySelector('[data-x]').onclick = () => detail(null);
    if (UI.reveal) UI.reveal(el);
    const r = el.getBoundingClientRect(); if (r.top > innerHeight - 120) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    const ds = daysOf(mon), M = +mon.slice(5), CH = chain();
    const si = Math.min(CH.length - 1, vSel[mon] != null ? vSel[mon] : CH.length - 1), V = CH[si], P = si > 0 ? CH[0] : null;   // ◥ = 월차 대비 바뀐 칸
    const el = $('gk-plan');
    let h = `<section class="card gk-card"><h2>${M}월 일별 가동계획<span class="unit">톤</span></h2>`;
    if (CH.length > 1) h += `<div class="gk-ver" role="group" aria-label="판">${CH.map((x, i) => `${i ? '<i>→</i>' : ''}<button type="button" data-i="${i}" aria-pressed="${i === si}">${esc(x.lab)}</button>`).join('')}</div>`;
    if (V.toneOnly) h += '<p class="gk-none">월차 강종·M/C·정지 자료 없음 — 톤만</p>';
    h += table(ds, V, P);
    h += legend(V, P) + '<div class="det gk-det" id="gk-det" hidden></div>';
    if (CH.length > 1) h += adjTable(CH, ds, si);
    h += '</section>';
    el.innerHTML = h;
    detK = '';
    el.querySelectorAll('table.gk td[data-c]').forEach((td) => td.onclick = () => detail(td));
    const pick = (i) => { vSel[mon] = i; render(); };
    el.querySelectorAll('.gk-ver button').forEach((b) => b.onclick = () => pick(+b.dataset.i));
    el.querySelectorAll('table.gk-adj tbody tr').forEach((tr) => { tr.onclick = () => pick(+tr.dataset.i); tr.onkeydown = (e) => { if (e.key === 'Enter') pick(+tr.dataset.i); }; });
    snap();
  }
  // 오늘 틀(오늘 열 전체 굵은 테두리) 자리 맞춤 · 좁은 화면(표가 가로로 밀릴 때 — 첫 두 열 고정): 오늘 앞 2일부터 보이게
  function snap() {
    document.querySelectorAll('.gk-wrap').forEach((w) => {
      const th = w.querySelector('thead th.dn.tdy'), fr = w.querySelector('.gk-tdy'), tb = w.querySelector('table.gk');
      if (th && fr) { const x = th.offsetLeft; Object.assign(fr.style, { left: x + 'px', width: th.offsetWidth + 'px', height: tb.offsetHeight + 'px' }); }
      if (!w.offsetParent || w.scrollWidth <= w.clientWidth + 1) return;
      const days = [...w.querySelectorAll('thead tr:first-child th.dn')], ti = days.findIndex((x) => x.classList.contains('tdy'));
      w.scrollLeft = ti < 0 ? 0 : Math.round(Math.max(0, ti - 2) * days[0].getBoundingClientRect().width);
    });
  }
  if (document.fonts) document.fonts.ready.then(() => { if (D && tab === 'plan') snap(); });
  let rsT = 0; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (D && tab === 'plan') snap(); }, 150); });
  addEventListener('beforeprint', () => { if (D && tab === 'plan') snap(); });

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
    const pc = (r) => (r.need ? Math.min(Math.round((r.rec + r.ord) / r.need * 100), r.nw >= 0.5 ? 99 : 100) : 100), cl = (v) => (v < 90 ? 'lo' : v < 100 ? 'mid' : '');   // 미발주가 남으면 100% 아님
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
