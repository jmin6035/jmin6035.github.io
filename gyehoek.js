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
  const CK = { sd: 'S/D', repair: '수리', clean: '청소' };            // 컬러 부분 정지(이벤트 행 노랑)
  let D = null, mon = null, tab = 'plan', today = '', busy = false, vSel = {};

  // ---------- 자료: 가동 캘린더(supply.js prep·live)와 같은 칸 ----------
  async function load(pw) {
    const get = async (n) => { try { const e = await GP.latest(n); return e ? await GP.decryptJSON(e, pw) : null; } catch (x) { return null; } };
    const [W, LP, CA, PA, SJ, LT, HI, MO, AD, PT] = await Promise.all(['integrated.enc.json', 'latest.plan.enc.json', 'color_actual.enc.json', 'plating_actual.enc.json', 'suju.enc.json', 'leadtime.enc.json', 'gyehoek_hist.enc.json', 'mat_order.enc.json', 'act_detail.enc.json', 'portal.enc.json'].map(get));
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
    D = { sts: R && R.rows ? OPT.sts(R) : {}, W, pl, ev, co, BD, actG, actC, cdn, cdx, dayMin, gsd, SW, p0, m0: SJ && SJ.month, at, ms, LT, H: HI && Array.isArray(HI.vers) ? HI : null, MATS, AD: AD && AD.days ? AD : null,
      SR: PT && Array.isArray(PT.lines) ? { m: String((PT.lines.find((x) => x.asOf) || {}).asOf || '').slice(0, 7), v: Object.fromEntries(PT.lines.filter((x) => x.month > 0).map((x) => [x.line, x.month])) } : null };   // 판매생산속보 월차계획(라인별, 이번 달) — 11/13 사용자 '월차 대비에 판생 월차 추가'
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
    return { t: t < 0.5 ? 0 : t, act, fam, mc, stop, al, sd, dn, ev: e && e.event, sts: G ? D.sts[k] : null };
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
  const cellT = (c) => (c.stop ? 0 : c.al && Object.keys(c.al).length ? Object.values(c.al).reduce((a, v) => a + (v >= 0.5 ? Math.round(v) : 0), 0) : Math.round(c.t));   // 표 칸과 같은 반올림
  const lineSum = (V, l, ds) => ds.reduce((a, d) => a + cellT(V.get(l, d)), 0);

  // ---------- 표: 엑셀 일별 가동계획 양식 그대로(한 달 = 한 표, 1~31일 + 계) — 그리는 코드는 ui/optable.js(OPT, 월간 가동과 같은 함수) ----------
  const hfmt = (h) => OPT.hfmt(h);
  const OO = () => ({ today, hrs,
    cEv: (l, d) => { const z = D.cdx[`${l}|${d}`] || {}, k = Object.keys(CK).find((x) => z[x] && z[x] < 1439); return k ? [CK[k], `${l} ${CK[k]} ${hfmt(z[k] / 60)}시간`] : null; } });
  const table = (ds, V, P) => OPT.table(ds, V, P, OO());
  const legend = (V, P, ds) => OPT.legend(V, P, ds, OO());

  // 조정 표(화이트보드 '조정(실적반영)'): 판(월차 → 매주 조정 → 지금) × 라인 월 합계, 앞 판 대비 ±. 줄을 누르면 그 판을 위 표로
  function adjTable(CH, ds, si) {
    const cols = ['G', 'C'].filter((p) => UI.inScope(p)).flatMap((pc) => [...LINES[pc].map((l) => [l, [l]]), [`${PN[pc]} 합계`, LINES[pc]]]);
    const val = (V, ls) => ls.reduce((a, l) => a + lineSum(V, l, ds), 0);
    const A = CH.map((V) => cols.map(([, ls]) => val(V, ls)));
    // 판마다 '월 합계 | 앞 판 대비' 두 칸(11/12 사용자 '조정 이해가 안 된다 — 칸 구분')
    const rows = CH.map((V, i) => `<tr class="${i === si ? 'on' : ''}" data-i="${i}" tabindex="0"><th>${esc(V.lab)}</th>${A[i].map((v, j) => { const df = i ? Math.round(v - A[0][j]) : null,   // 월차(첫 판) 대비(11/12 사용자)
      sm = /합계/.test(cols[j][0]) ? ' sm' : '';
      return `<td class="bl${sm}"><b>${n0(v)}</b></td><td class="df${sm}${df != null && df <= -0.5 ? ' dn' : df != null && df >= 0.5 ? ' up' : ''}">${df == null ? '–' : df === 0 ? '0' : sg(df)}</td>`; }).join('')}</tr>`).join('');
    const SRm = D.SR && D.SR.m === ds[0].slice(0, 7) && Object.keys(D.SR.v).length ? D.SR.v : null;
    const srRow = SRm ? `<tr class="sr"><th>판생 월차 <small>판매생산속보</small></th>${cols.map(([n, ls], j) => { const ok = ls.every((l) => SRm[l] != null), v = ok ? ls.reduce((a, l) => a + SRm[l], 0) : null, df = v == null ? null : Math.round(v - A[0][j]), sm = /합계/.test(n) ? ' sm' : '';
      return `<td class="bl${sm}"><b>${v == null ? '–' : n0(v)}</b></td><td class="df${sm}${df != null && df <= -0.5 ? ' dn' : df != null && df >= 0.5 ? ' up' : ''}">${df == null ? '–' : df === 0 ? '0' : sg(df)}</td>`; }).join('')}</tr>` : '';
    return `<h3 class="gk-adjh">판별 월 생산 합계 <small>톤</small></h3><div class="gk-adjw"><table class="gk-adj"><thead><tr><th rowspan="2">판</th>${cols.map(([n]) => `<th colspan="2" class="bl${/합계/.test(n) ? ' sm' : ''}">${n}</th>`).join('')}</tr><tr>${cols.map(([n]) => `<th class="sub bl${/합계/.test(n) ? ' sm' : ''}">월 합계</th><th class="sub${/합계/.test(n) ? ' sm' : ''}">월차 대비</th>`).join('')}</tr></thead><tbody>${rows}${srRow}</tbody></table></div>`;
  }

  // 누른 칸 한 줄(가동 상세 머리): 판마다 그 칸(월차 → 매주 조정 → 지금) + 도금은 그 날 소재(F/H) 발주 마감과 발주 상태
  function info(l, d, noMat) {
    const CH = chain(), C = CH.map((V) => V.get(l, d)), last = C[C.length - 1], first = C[0];
    const tx = (c) => (c.stop ? c.stop : `${n0(c.t)}t${c.mc ? ' M/C' : c.fam ? ' ' + c.fam : ''}`);
    let h = `<b>${md(d)}(${WD[wd(d)]}) ${l}</b> ` + CH.map((V, i) => `<span class="${i === CH.length - 1 ? 'nw' : ''}">${esc(V.lab.replace(/ \d+:\d+$/, ''))} ${esc(tx(C[i]))}</span>`).join('<i>→</i>');
    if (CH.length > 1) { const df = Math.round(last.t - first.t); h += ` <em class="${df <= -0.5 ? 'dn' : ''}">(월차 대비 ${sg(df)}t)</em>`; }
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
  // 지난 날 = 계약별 실적 표(act_detail.enc.json — 앞날 계획 카드와 같은 칸, supply.js window.supAct). 그 날 자료가 없으면 아래 요약(판매그룹·강종/품명 톤)
  function actDet(l, d) {
    const G = /CGL$/.test(l), rows = D.AD && (D.AD.days[d] || {})[l];
    if (rows && rows.length && window.supAct) {
      const t = G ? (D.pl[`${l}|${d}`] || {}).t || 0 : sumV((((D.BD || {})[d] || {})[l] || [])[0]), m = G ? (D.dayMin[d] || {})[l] : ((((D.BD || {})[d] || {})[l] || [])[1]);
      return window.supAct(l, d, rows, `${l} · 실적 ${n0(t)}t${m ? ` · 가동 ${(m / 60).toFixed(1)}시간` : ''}`, D.AD.entFrom);
    }
    const kv = (o) => Object.entries(o || {}).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]);
    const tb = (h, rows) => (rows.length ? `<table class="gk-act"><thead><tr><th>${h}</th><th>톤</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n0(v)}</td></tr>`).join('')}</tbody></table>` : '');
    if (/CGL$/.test(l)) { const x = D.pl[`${l}|${d}`] || {}, m = (D.dayMin[d] || {})[l];
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
    h += legend(V, P, ds) + '<div class="det gk-det" id="gk-det" hidden></div>';
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
  const snap = () => OPT.snap();                                        // 오늘 틀·지난 날 덮개 자리 맞춤(ui/optable.js — 창 크기·글꼴이 바뀌면 자동)

  // 소재 현황 · 발주·입고 캘린더 = mat_v2.js(11/12 시안4 — 예전 '소재 종합'·소재 캘린더 3줄을 대체)
  // 소재 리드타임(발주 → 입고, 리드타임 화면과 같은 값) — 공장별 짧게
  function leadTable() {
    const L = D.LT, el = $('gk-lt'); if (!L || !L.types) { el.closest('details').hidden = true; return; }
    const pt = {}; (L.sup || []).forEach((s) => { (pt[s[3]] = pt[s[3]] || new Set()).add(s[0]); });
    const grp = { G: [], C: [] }; L.types.forEach((t) => { const ps = pt[t[0]]; (ps && ps.has('G') && !ps.has('C') ? grp.G : grp.C).push(t); });
    const tb = (pl, T) => `<div><h3 style="margin:0 0 8px;font-size:16px;font-weight:800">${PN[pl]} 소재</h3><table class="t lt"><thead><tr><th>소재 유형</th><th>발주 → 입고</th><th>발주 방식</th></tr></thead><tbody>${T.sort((a, b) => a[1] - b[1]).map((t) => `<tr><td><b>${esc(t[0])}</b></td><td><b>${t[1]}</b>일</td><td>${esc(t[2])}</td></tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = `<p style="margin:0 0 10px;font-size:14px;color:var(--ink-2)">발주 → 입고 일수 · 고치기는 <a href="leadtime.html">리드타임</a></p><div class="lt-l">${grp.G.length ? tb('G', grp.G) : ''}${tb('C', grp.C)}</div>`;
  }

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
  $('f').addEventListener('submit', () => { const v = $('pw').value; if (v) setTimeout(() => open(v), 0); });
  let s = null; try { s = localStorage.getItem(KEY); } catch (x) { /* 무시 */ }
  if (s) open(s);
})();
