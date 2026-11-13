/* 편성(11/12 회의: 1주 작업지시 편성) — 11/12 사용자 '편성도 더 이쁘게 간략하게': 위 = 이번 생산주(수~화) 라인별 캘린더(생산 일정 화면 칸 그대로 — cg_calendar.js·cc_calendar.js 의 표를 불러 씀, 지난 날 = MES 실적),
   칸을 누르면 그날 그 라인 작업 순서가 아래에 펼쳐짐, 맨 아래 = 작업 순서 수정(week_seq.html iframe).
   작업 순서 자료 = week_seq 와 같은 게시본(published/week_seq_cg·cc.enc.json) + 같은 저장소(cgl_week_seq)의 최근 저장·확정본(읽기만).
   지시 여부 = 도금 issued(MES 1030 지시)·컬러 fixed(MES 1030 작업대기) — week_seq.js 와 같은 기준.
   시각 흘리기(sim)·전환 휴지(chgCG·chgCC)·바뀜 이름(catOf·fsCG)은 week_seq.js 와 같은 식(복사 — 바꾸면 둘 다). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const API = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_week_seq', KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';   // week_seq.js 와 같은 공개용 키(읽기)
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const WD = '일월화수목금토';
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const dnm = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
  const tms = (s) => { const m = String(s).match(/(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) / 6e4 : NaN; };
  const iso = (m) => new Date(m * 6e4).toISOString().slice(0, 16).replace('T', ' ');
  const dayOf = (m) => iso(m - 420).slice(0, 10);                 // MES 하루 = 07시 ~ 다음날 07시
  const addD = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  const LINES = { cg: ['1CGL', '2CGL'], cc: ['1CCL', '2CCL', '3CCL', '4CCL'] };
  const SC = { cg: 'G', cc: 'C' };
  const X = {};                                                    // 공장별 { D, R, J, L, ver }
  let PW = '', line = null;
  const SEL = { cg: null, cc: null };                              // 누른 칸 { l, d } — 그날 작업 순서 펼침

  // ───────── 전환 휴지·바뀜 이름 (week_seq.js 와 같은 식)
  const sk = (c) => { c = String(c || ''); return c.includes('·') ? c.split('·')[1] : c.length >= 7 ? c.slice(3, 7) : c; };
  const catOf = (a, b) => { const s = [];
    if ((a.primer || '') !== (b.primer || '')) s.push('하도');
    if ((a.code || a.top || a.color || '') !== (b.code || b.top || b.color || '')) s.push('상도');
    if ((a.codeBack || a.back || '') !== (b.codeBack || b.back || '')) s.push('이면');
    if (Math.abs((a.thk || 0) - (b.thk || 0)) > 0.03 || Math.abs((a.wdt || 0) - (b.wdt || 0)) > 5) s.push('치수');
    return s.join('+') || '사양 같음'; };
  function chgCC(R, a, b, l) {
    if (!a || a.dummy || b.dummy) return 0;
    if (R.trans && R.trans[l]) { const m = R.trans[l][catOf(a, b)]; if (m != null) return m; }
    if (a.block !== b.block) { const lb = R.block[`${l}|${a.block}>${b.block}`]; if (lb) return lb; }
    const ta = a.top || a.color, tb = b.top || b.color, ct = ta && tb ? sk(ta) !== sk(tb) : true;
    const cb = !!(a.back && b.back && sk(a.back) !== sk(b.back)), cpr = !!(a.primer && b.primer && a.primer !== b.primer);
    const pa = a.block === 'print', pb = b.block === 'print', out = [pb ? '프린트 새 주문' : '새 주문(계약행번)'];
    if (cpr && cb) out.push('하도+상도+이면 바뀜'); else if (cpr) out.push('하도+상도 바뀜'); else if (ct && cb) out.push('상도+이면 바뀜'); else if (ct) out.push('상도만 바뀜'); else if (cb) out.push('이면만 바뀜');
    if (pb && !pa) out.push('프린트로 들어감'); if (pa && !pb) out.push('프린트에서 나옴'); if (pa && pb && ct) out.push('프린트끼리 색 바뀜');
    if (a.wdt && b.wdt) { const dw = b.wdt - a.wdt; const k = dw > 5 && dw <= 50 ? '폭 넓어짐 ~50mm' : dw > 50 && dw <= 100 ? '폭 넓어짐 50~100mm' : dw > 100 ? '폭 넓어짐 100mm 초과' : dw < -100 ? '폭 좁아짐 100mm 초과' : null; if (k) out.push(k); }
    if (a.thk && b.thk) { const r = Math.max(a.thk, b.thk) / Math.min(a.thk, b.thk); const k = r > 1.1 && r <= 1.3 ? '두께 1.1~1.3배' : r > 1.3 && r <= 1.5 ? '두께 1.3~1.5배' : r > 1.5 ? '두께 1.5배 초과' : null; if (k) out.push(k); }
    const pt = (z) => String(z.color || '').split('·')[0];
    if (pt(a) && pt(b) && pt(a) !== pt(b) && pt(a) !== '미상' && pt(b) !== '미상') out.push('도료 종류 바뀜');
    const lam = (z) => /^(PLY|PLS)/.test(z.item || ''); if (lam(a) !== lam(b)) out.push('Lami 들어가고 나옴');
    return out.reduce((s, c) => s + ((R.cond[c] || {})[l] || 0), 0);
  }
  const tgrp = (R, code) => { const G = (R.trtNo || {})['2CGL'] || []; for (let i = 0; i < G.length; i++) if (G[i].includes(code)) return i; return null; };
  const tfam = (R, code) => { const g = tgrp(R, code); return g != null ? 'g' + g : String(code || '').slice(0, 1); };
  function fsCG(R, a, b) {                                         // 앞 → 다음 코일에서 바뀌는 것(week_seq chgCG 의 이름 그대로)
    const fs = [];
    if (a.thick && b.thick) { const r = Math.max(a.thick, b.thick) / Math.min(a.thick, b.thick); const k = r > 1.6 ? '두께 1.6배 초과' : r > 1.35 ? '두께 1.35~1.6배' : r > 1.2 ? '두께 1.2~1.35배' : r > 1.1 ? '두께 1.1~1.2배' : null; if (k) fs.push(k); }
    const dw = (b.width || 0) - (a.width || 0);
    const k = dw > 200 ? '폭 넓어짐 200mm 초과' : dw > 100 ? '폭 넓어짐 100~200mm' : dw > 50 ? '폭 넓어짐 50~100mm' : dw > 5 ? '폭 넓어짐 ~50mm' : dw < -200 ? '폭 좁아짐 200mm 초과' : null; if (k) fs.push(k);
    const ta = a.trt || {}, tb = b.trt || {};
    if (a.trt && b.trt) {
      if (ta.cot && tb.cot && ta.cot !== tb.cot) fs.push(String(tb.cot) > String(ta.cot) ? '도금량 늘어남' : '도금량 줄어듦');
      if (ta.aft && tb.aft && ta.aft !== tb.aft) fs.push(tfam(R, ta.aft) !== tfam(R, tb.aft) ? '후처리 계열 바뀜' : '후처리 바뀜(같은 계열)');
      if (ta.oil && tb.oil && ta.oil !== tb.oil) fs.push(String(ta.oil)[0] !== String(tb.oil)[0] ? '도유 종류 바뀜' : '도유 양만 바뀜');
    }
    return fs;
  }
  function chgCG(R, a, b, l) {
    if (!a) return 0;
    const pt = R.pt[l] || {}, P = R.dummyP || 50;
    return fsCG(R, a, b).map((f) => pt[f]).reduce((s, x) => s + (x && x.p >= P ? x.m : 0), 0);
  }

  // ───────── 시간 흘리기(week_seq sim 과 같은 식): 그날 처음 닿을 때 계획 휴지 → (컬러) 도료·PF 준비 전이면 기다림 → 전환 휴지 → 생산
  function sim(p, l) {
    const { D, R, J, L } = X[p], S = L[l], dn = (R.down || {})[l] || {}, used = {}, out = [];
    let c = tms(D.lines[l].from), prev = D.lines[l].prev0 || null;
    const touch = () => { for (;;) { const d = dayOf(c), x = dn[d]; if (!x || used[d]) return; used[d] = 1; const m = typeof x === 'number' ? x : x.min; out.push({ k: 'p', s: c, e: c + m, d }); c += m; } };
    S.forEach((e, i) => {
      touch();
      if (e.k === 'g') { out.push({ k: 'g', i, e, s: c, e2: c + (+e.min || 0) }); c += +e.min || 0; return; }
      const x = J[e.id];
      if (p === 'cc' && !x.fixed && x.ready) { const r = tms(x.ready + ' 07:00'); if (c < r) { out.push({ k: 'w', s: c, e: r, x }); c = r; touch(); } }
      const chm = p === 'cg' ? chgCG(R, prev, x, l) : chgCC(R, prev, x, l), ds = c; c += chm; const st = c;
      const rm = p === 'cg' ? x.run : x.t / Math.max((x.tph || {})[l] || 0.5, 0.5) * 60; c += rm;
      out.push({ k: 'j', i, x, prev, ds, s: st, e: c, chm, rm }); prev = x;
    });
    const W0 = tms(D.w0), W1 = tms(D.w1);
    Object.keys(dn).sort().forEach((d) => {
      const b = tms(d + ' 07:00'), x = dn[d], m = typeof x === 'number' ? x : x.min;
      if (used[d] || b < W0 || b >= W1 || b + 1440 <= c) return;
      const st = Math.max(c, b); used[d] = 1; out.push({ k: 'p', s: st, e: st + m, d }); c = st + m;
    });
    return out;
  }

  // ───────── 순서 = 최근 저장·확정본(작업 순서 화면이 처음 여는 것과 같음), 없으면 초안
  function fromDraft(p) { const { D } = X[p], L = {}; LINES[p].forEach((l) => { L[l] = ((D.lines[l] || {}).seq || []).map((id) => (id && id.k === 'g' ? { k: 'g', min: +id.min || 0, note: id.note || '', sm: !!id.sm } : { k: 'j', id })); }); return L; }
  function insertAtDay(p, l, e, d) {
    const ev = sim(p, l).filter((v) => v.k !== 'p' && v.k !== 'w'), lim = tms(d + ' 07:00') + 1440;
    let pos = 0; ev.forEach((v) => { if ((v.k === 'g' ? v.e2 : v.e) <= lim) pos = v.i + 1; });
    X[p].L[l].splice(pos, 0, e);
  }
  function useSaved(p, sv) {
    const o = X[p];
    o.L = fromDraft(p);
    if (!sv) return;
    const smNew = []; LINES[p].forEach((l) => sim(p, l).forEach((v) => { if (v.k === 'g' && v.e.sm) smNew.push([l, v.e, dayOf(v.s)]); }));   // 저장 뒤 생긴 샘플·테스트 일정(week_seq useVer 와 같음)
    const L = {}; LINES[p].forEach((l) => { L[l] = ((sv.p.lines || {})[l] || []).filter((e) => e.k === 'g' || o.J[e.id]).map((e) => (e.k === 'g' ? { k: 'g', min: +e.min || 0, note: e.note || '', sm: !!e.sm } : { k: 'j', id: e.id })); });
    o.L = L;
    smNew.forEach(([l, e, d]) => { if (!L[l].some((q) => q.k === 'g' && q.sm && q.note === e.note)) insertAtDay(p, l, e, d); });
  }
  async function lastSaved(p) {
    const wk = addD(X[p].D.week, -7);
    try {
      const r = await fetch(`${API}?select=id,at,who,state,payload&plant=eq.${p}&week=gte.${wk}&order=id.desc&limit=200`, { headers: H });
      if (!r.ok) return null;
      const rows = (await r.json()).reverse(), V = [];
      let v = 0;
      for (const x of rows) { try { const pl = await GP.decryptJSON(JSON.parse(x.payload), PW); V.push({ at: x.at, who: x.who, state: x.state, p: pl, v: x.state === 'reset' ? null : ++v }); } catch (e) { /* 암호 다른 줄 */ } }
      const last = V[V.length - 1];
      return last && last.state !== 'reset' ? last : null;
    } catch (e) { return null; }
  }

  // ───────── 라인 요약: 배분(건·톤) · 작업 가능 시간(기간 − 계획 휴지) · 배분 시간(전환 휴지 + 생산, 기간 안)
  function lineSum(p, l) {
    const { D } = X[p], W0 = tms(D.w0), W1 = tms(D.w1), ev = sim(p, l);
    const js = ev.filter((q) => q.k === 'j' && q.s < W1);
    const from = Math.max(W0, tms(D.lines[l].from));
    const pl = ev.filter((q) => q.k === 'p' && q.s < W1).reduce((s, q) => s + Math.min(q.e, W1) - q.s, 0);
    const busy = js.reduce((s, q) => s + Math.max(0, Math.min(q.e, W1) - Math.max(q.ds, from)), 0);
    const avail = Math.max(0, W1 - from - pl);
    return { n: js.length, t: js.reduce((s, q) => s + q.x.t, 0), avail, busy, fill: avail ? busy / avail : 0, stop: !js.length && D.lines[l].stop };
  }
  const plants = () => ['cg', 'cc'].filter((p) => X[p] && UI.inScope(SC[p]));
  const done = (p, x) => !!(p === 'cg' ? x.issued : x.fixed);                // 작업지시 내려감(MES 1030) — week_seq.js 와 같은 기준
  // 위 한 줄: 주문 마감 → 다음 마감 · 이번 주 배분 · 지시
  function drawLine() {
    const P = plants(), D0 = X[P[0] || 'cg'].D;
    let tA = 0, nF = 0;
    P.forEach((p) => LINES[p].forEach((l) => { tA += lineSum(p, l).t; sim(p, l).forEach((q) => { if (q.k === 'j' && done(p, q.x)) nF++; }); }));
    $('ps-line').innerHTML = `<span>주문 마감 <b>${dnm(addD(D0.week, -7))}</b></span><span class="ar">→</span><span>다음 <b>${dnm(D0.week)}</b></span><span>작업 순서 배분 <b>${n0(tA)}t</b></span><span>지시 <b>${n0(nF)}건</b></span>`;
  }
  // 캘린더 — 표 양식(행 = 라인·하루 합, 열 = 수~화)은 생산 일정 화면과 같고, 칸 안은 편성 화면용으로 다시 그림
  // 11/12 사용자 '자가재 빼고, 막대그래프 필요없다, 날짜 누르면 그날 작업, 컬러랑 도금 양식 똑같이, 이어짐 쓰지 말고 전날로 넘겨라'
  const CAL = { cg: () => window.CGCAL, cc: () => window.CCCAL };
  const HOL = new Set(['2026-12-25', '2027-01-01']);   // 공휴일 — 01 gyehoek.js 와 같은 목록(머리 노랑·빨강)
  const DOWS = '일월화수목금토';
  const mdw = (d) => `${md(d)}(${DOWS[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
  const tsum = (a) => a.reduce((s, i) => s + (+i.t || 0), 0);
  const famC = (f) => (f ? `<span class="fam fam-${f === 'AL-STS' ? 'STS' : esc(String(f).split('-')[0].replace(/[^A-Z]/g, ''))}">${esc(f)}</span>` : '');
  const spans = (a) => a.filter(Boolean).map((x) => `<span>${x}</span>`).join('');

  /* 컬러 '이어짐' 없앰: 작업대기를 끊지 않고 이어 돌림(현장 방식) — 칸 편성 규칙(계약이 그날 남은 시간보다 길면 다음 날)이 남긴 빈 시간을
     다음 작업대기 계약 앞부분으로 채움(톤 = 그 계약 t/h 비례). cc_calendar flow() 의 woC(연속 기준 작업대기 시간)와 같은 식.
     작업대기 끝 날(woUntil)까지만, 지시대기·도료 미입고·계획편성·확정본은 제자리 */
  let CCF = null;
  function ccFlow(R) {
    if (CCF) return CCF;
    const F = {}, wk = new Set(R.days), mv = { h: 0, t: 0, inW: 0, outW: 0 };
    const isWO = (i) => i.kind === '작업대기' && !i.locked;
    LINES.cc.forEach((ln) => {
      const A = R.all(ln), D = R.allDays, wu = R.woUntil(ln), Q = [];
      const on = (k) => !A[k].stop && !!wu && D[k] <= wu;
      let lastOn = -1; A.forEach((c, k) => { if (on(k)) lastOn = k; });
      A.forEach((c, k) => { if (on(k)) c.items.forEach((i) => { if (isWO(i)) Q.push({ i, h: +i.h || 0, t: +i.t || 0, d0: D[k] }); }); });
      F[ln] = {};
      A.forEach((c, k) => {
        const d = D[k];
        let items = c.items.slice();
        if (on(k)) {
          const keep = c.items.filter((i) => !isWO(i)), P = [];
          let room = (c.capH || 0) - keep.reduce((s, i) => s + (+i.h || 0), 0);
          while (Q.length && (k === lastOn || room > 0.05)) {
            const q = Q[0], take = k === lastOn || q.h <= room + 0.05 ? q.h : room, t = q.h > 0 ? q.t * take / q.h : q.t;
            P.push(Object.assign({}, q.i, { t, h: take }));
            if (q.d0 !== d) { mv.h += take; mv.t += t; if (wk.has(d) && !wk.has(q.d0)) mv.inW += t; if (!wk.has(d) && wk.has(q.d0)) mv.outW += t; }
            q.h -= take; q.t -= t; room -= take; if (q.h <= 1e-6) Q.shift();
          }
          items = [...P, ...keep];
        }
        const h = items.reduce((s, i) => s + (+i.h || 0), 0), K = {}, G = {};
        items.forEach((i) => { K[i.kind] = (K[i.kind] || 0) + (+i.t || 0); G[i.grp || '기타'] = (G[i.grp || '기타'] || 0) + (+i.t || 0); });
        F[ln][d] = { c, d, items, t: tsum(items), h, K, G, empty: c.stop ? 0 : Math.max(0, (c.capH || 0) - h) };
      });
      console.assert(Math.abs(tsum(A.flatMap((c) => c.items)) - D.reduce((s, d) => s + F[ln][d].t, 0)) < 0.01, `편성: ${ln} 이어 돌린 뒤 전체 톤이 다름`);
    });
    CCF = { F, mv };
    return CCF;
  }

  /* 칸 한 양식(도금·컬러·지난 날 같음): ① 큰 톤 + 강종/품명 칩 + 시간 부하 % ② 상태 톤 ③ 그룹 톤 ④ 경고 칩 · 정지/비가동 = 글자만 가운데 */
  const pctB = (r, tip, h) => (r == null || r <= 1.005 ? '' : `<span class="ld ov" title="${esc(tip)}">${h != null ? `${n1(h)}시간 넘침` : `${Math.round(r * 100)}%`}</span>`);   // 11/12 사용자 '글 많다' — 넘칠 때만
  /* 그룹 이름 = 관제 판매그룹(kj.js GRP 와 같은 묶음): 컬러수출 = 건재수출·가전수출·가전내수 · 컬러건재 = 주문재+계획재 · 도금 = 도금수출·도금국내·자동차·도금 자가재 */
  const GNM = { 수출: '도금수출', 도금수출: '도금수출', 국내: '도금국내', 도금국내: '도금국내', 자동차: '자동차', 자동차내수: '자동차', 자동차수출: '자동차', 자가재: '도금 자가재',
    건재수출: '컬러수출', 가전수출: '컬러수출', 가전내수: '컬러수출', 주문재: '컬러건재', 계획재: '컬러건재', 수요개발: '수요개발' };
  const gnm = (g) => GNM[g] || g || '기타';
  const regroup = (G) => { const o = {}; Object.entries(G || {}).forEach(([g, v]) => { const k = gnm(g); o[k] = (o[k] || 0) + (+v || 0); }); return o; };
  function cellH(o) {
    const at = o.past ? ' tabindex="-1"' : ` data-ln="${o.ln}" data-d="${o.d}"`;
    if (o.off) return `<button type="button" class="cell stp${o.past ? ' pcell' : ''}"${o.past ? ' tabindex="-1"' : ''} title="${esc(o.tip)}"><span class="off">${esc(o.off)}</span></button>`;
    const wn = (o.wn || []).filter(Boolean);
    return `<button type="button" class="cell${o.fl ? ' fl' : ''}${o.past ? ' pcell' : ''}"${at} title="${esc(o.tip)}">`
      + (o.band ? `<div class="band${o.mc ? ' mc' : ''}">${esc(o.band)}</div>` : '')
      + `<div class="bd"><div class="r1"><span class="tv">${o.t == null ? '–' : `${n0(o.t)}<small>t</small>`}</span>${o.chips || ''}</div>`
      + (o.pct || wn.length ? `<div class="wn">${o.pct || ''}${wn.slice(0, 1).map((x) => `<span class="wc">${esc(x)}</span>`).join('')}</div>` : '')
      + (o.sts ? `<div class="wn"><span class="wst">${esc(o.sts)}</span></div>` : '')
      + '</div></button>';
  }
  function cgCell(c, ln, rem, st) {                         // st = 그날 AL-STS {t, res}(재계획 — cg_calendar.js raw().sts, 11/13)
    const fill = c.conf + c.plan + c.fcst, cap = c.cap || 0;
    const mc = /M\/C/.test(c.event || ''), ev = String(c.event || '').replace(/\s*\(([^)]*)\)/, ' $1');
    if (cap < 1) return cellH({ ln, d: c.d, off: String(c.event || '').replace(/\s*\(.*\)$/, '') || '정지', tip: `${ln} ${mdw(c.d)} ${c.event || '정지'}` });   // 01 일별 가동계획과 같은 이름(정기수리·수리·휴지)
    const r = c.hAvail >= 1 ? (c.hrs || 0) / c.hAvail : null;
    const sr = st ? Math.min(st.res || 0, st.t) : 0;
    return cellH({ ln, d: c.d, rem, fl: !!c.flag, band: c.event ? ev : '', mc, t: fill, chips: famC(c.fam) + (st && c.fam !== 'AL-STS' ? famC('AL-STS') : ''),
      pct: pctB(r, `이 날 배정 주문을 실적 속도(같은 두께·폭 T/Hr)로 돌리면 ${n1(c.hrs)}시간 — 가동 가능 ${n1(c.hAvail)}시간을 넘어 다음 날로 밀림`, (c.hrs || 0) - c.hAvail),
      st: [['작업대기', c.conf], ['지시대기', c.plan], ['입고예정', c.fcst]], G: c.grp,
      sts: sr >= 0.5 ? `AL-STS 예약 ${n0(sr)}t(D-3 확정)` : '', wn: [c.flag && (c.flagS || c.flag), c.gap >= 0.5 && c.hAvail - (c.hrs || 0) >= 0.5 && `빈 시간 ${n1((c.hAvail - (c.hrs || 0)) / (c.eff || 1))}h`,   /* 11/13 점검: '빈칸 Xt'(남은 시간 × 평균 속도)는 계획 톤과 안 맞아 보임 → 컬러와 같은 '빈 시간' */ c.lateE && `출항일 초과 ${c.lateE}건`, c.late - c.lateE > 0 && `납기 초과 ${c.late - c.lateE}건`],
      tip: `${ln} ${mdw(c.d)}${st ? ` · AL-STS ${n0(st.t)}t${sr >= 0.5 ? ` (예약 ${n0(sr)}${st.t - sr >= 0.5 ? ` · 주문 ${n0(st.t - sr)}` : ''} — 주문 D-3 확정)` : ' (주문)'}` : ''} · 생산 ${n0(fill)}t / 능력 ${n0(cap)}t · 작업대기 ${n0(c.conf)} · 지시대기 ${n0(c.plan)} · 입고예정 ${n0(c.fcst)} · ${Object.entries(regroup(c.grp)).filter(([, v]) => v >= 0.5).map(([g, v]) => `${g} ${n0(v)}`).join(' · ')}${c.mvIn || c.mvOut ? ` · 이동 전입 ${c.mvIn || 0} 전출 ${c.mvOut || 0}` : ''}${c.flag ? ` · 확인: ${c.flag}` : ''} · 누르면 그날 작업 순서` });
  }
  function ccCell(x, ln, KD, rem) {
    const c = x.c;
    if (c.stop) return cellH({ ln, d: x.d, off: '정지', tip: `${ln} ${mdw(x.d)} 정지(휴지·수리)` });
    const P = {}; x.items.forEach((i) => { if (i.item) P[i.item] = (P[i.item] || 0) + (+i.t || 0); });
    const top = Object.entries(P).sort((a, b) => b[1] - a[1])[0], em = Math.round(x.empty * 10) / 10;
    return cellH({ ln, d: x.d, rem, fl: c.woShort > 0 || em >= 1, t: x.t, chips: top ? `<span class="fam">${esc(top[0])}</span>` : '',
      pct: pctB(c.capH ? x.h / c.capH : null, `편성 ${n1(x.h)}시간 > 가용 ${n1(c.capH)}시간`, x.h - c.capH),
      st: KD.map(([k, nm]) => [nm, x.K[k] || 0]), G: x.G,
      wn: [c.woShort > 0 && `작업대기 부족 ${n1(c.woShort)}h`, !(c.woShort > 0) && em >= 1 && `빈 시간 ${n1(em)}h`, c.overH && `확정본 넘침 ${n1(c.overH)}h`],
      tip: `${ln} ${mdw(x.d)} · 생산 ${n0(x.t)}t · 편성 ${n1(x.h)}h / 가용 ${n1(c.capH)}h${c.lockT ? ` · 확정본 ${n1(c.lockT)}t` : ''} · 누르면 그날 작업 순서` });
  }
  function pastCell(p, a, ln, d) {
    if (!a) return cellH({ ln, d, past: 1, t: null, tip: `${ln} ${mdw(d)} 실적 자료 없음(다음 날 아침 들어옴)` });
    if (!(a.t >= 0.5)) return cellH({ ln, d, past: 1, off: '정지', tip: `${ln} ${mdw(d)} 생산 없음(정지)` });   // 앞날 정지 칸과 같은 말·같은 색
    const chips = p === 'cg' ? Object.entries(a.fam || {}).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([f]) => famC(f)).join('')
      : (a.pr || []).filter(([, v]) => v >= 0.5).slice(0, 1).map(([q]) => `<span class="fam">${esc(q)}</span>`).join('');
    return cellH({ ln, d, past: 1, t: a.t, chips, G: a.grp, tip: `${ln} ${mdw(d)} 생산 실적(MES) ${n0(a.t)}t${a.h ? ` · ${n1(a.h)}h` : ''}${a.pr ? ` · 품명 ${a.pr.map(([q, v]) => `${q} ${n0(v)}`).join(' · ')}` : ''}` });
  }
  /* 2주 표(11/12 사용자 '편성은 2주치로 늘려, 칸 좀 줄여서'): 열 = 이번 생산주(수~화) + 다음 생산주 14일 · 이번 주 지난 날 = 실적 · 창(월말) 밖 = 빈 칸 */
  function grid(p) {
    const C = CAL[p](), R = C && C.raw && C.raw(); if (!R) return '';
    const { w0, days } = R, today = UI.today(), LN = LINES[p], plan = days.concat(R.days2 || []);
    const FL = p === 'cc' ? ccFlow(R).F : null;
    const w1 = addD(w0, 7), D14 = Array.from({ length: 14 }, (_, k) => addD(w0, k));
    const kind = (d) => (d < days[0] ? 'pst' : plan.includes(d) ? 'pl' : 'pad');
    const wb = () => '';
    const tdc = (d, x) => `${d === today ? 'td' : ''}${x ? ' ' + x : ''}`.trim();
    const S = SEL[p], selD = S && S.all ? S.d : null;
    const dh = (d) => (kind(d) === 'pad' ? `<th class="pad" aria-hidden="true"></th>`
      : `<th class="${kind(d) === 'pst' ? 'pst dk' : tdc(d, 'dk')}${d === selD ? ' on' : ''}${[0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay()) || HOL.has(d) ? ' we' : ''}" data-d="${d}" tabindex="0" role="button" aria-expanded="${d === selD}">${mdw(d)}${kind(d) === 'pst' ? '<small>실적</small>' : d === today ? '<small>오늘</small>' : ''}</th>`);
    const planT = (ln, d) => (p === 'cg' ? (() => { const c = R.cell(ln, d); return (c.cap || 0) < 1 ? 0 : c.conf + c.plan + c.fcst; })() : FL[ln][d].t);
    const pastT = (ln, d) => { const a = R.act(ln, d); return a ? a.t || 0 : null; };
    const dayT = (ln, d) => (kind(d) === 'pst' ? pastT(ln, d) || 0 : kind(d) === 'pl' ? planT(ln, d) : 0);
    const wT = (ln, W) => W.reduce((s, d) => s + dayT(ln, d), 0);
    const pad = () => '<td class="pad" aria-hidden="true"></td>';
    /* 11/12 사용자 '이번 주·다음 주를 아래로 내려 더 직관적으로, 글 줄여' — 주마다 7칸 표 하나, 위 = 이번 주 · 아래 = 다음 주 */
    const week = (W, nm) => {
      const rows = LN.map((ln) => {
        const idle = W.every((d) => kind(d) === 'pad' || (kind(d) === 'pst' ? !pastT(ln, d) : (p === 'cg' ? (R.cell(ln, d).cap || 0) < 1 : R.cell(ln, d).stop)));
        return `<tr class="ln${idle ? ' idle' : ''}"><th>${ln}<small>${n0(wT(ln, W))}t</small></th>`
          + W.map((d) => (kind(d) === 'pad' ? pad() : kind(d) === 'pst' ? `<td class="pst">${pastCell(p, R.act(ln, d), ln, d)}</td>`
            : `<td class="${tdc(d)}">${p === 'cg' ? cgCell(R.cell(ln, d), ln, d === today, R.sts && R.sts(ln, d)) : ccCell(FL[ln][d], ln, R.KD, d === today)}</td>`)).join('') + '</tr>';
      }).join('');
      const sumT = (d) => LN.reduce((s, l) => s + dayT(l, d), 0);
      const tot = `<tr class="dsum"><th>합계<small>${n0(LN.reduce((s, l) => s + wT(l, W), 0))}t</small></th>`
        + W.map((d) => (kind(d) === 'pad' ? pad() : kind(d) === 'pst' && !LN.some((l) => pastT(l, d) != null) ? '<td class="pst"><div class="tv">–</div></td>'
          : `<td class="${kind(d) === 'pst' ? 'pst' : tdc(d)}"><div class="tv">${n0(sumT(d))}<small>t</small></div></td>`)).join('') + '</tr>';
      return `<table class="psw v2-grid"><thead><tr class="wh"><th class="cn">${nm}<small>${md(W[0])}~${md(W[6])}</small></th>${W.map(dh).join('')}</tr></thead><tbody>${rows}${tot}</tbody></table>`;
    };
    const W1 = D14.slice(0, 7), W2 = D14.slice(7);
    const ov = LN.map((ln) => [ln, p === 'cg' && R.over(ln)]).filter(([, o]) => o);
    return week(W1, '이번 주') + `<div class="ps-gap"></div>` + week(W2, '다음 주')
      + (ov.length ? `<p class="ps-ov">${ov.map(([ln, o]) => `${ln} ${R.end} 뒤로 ${n0(o.t)}t 넘침(실적 속도 기준 ${n1(o.h)}시간 모자람)`).join(' · ')}</p>` : '');
  }
  function drawCal(p) {
    const host = $('ps-cal-' + p), C = CAL[p]();
    host.innerHTML = (C && (C.raw ? grid(p) : C.week())) || '<p class="ps-empty">캘린더 자료 없음</p>';
    host.querySelectorAll('button.cell[data-d]').forEach((b) => {
      const on = SEL[p] && !SEL[p].all && SEL[p].l === b.dataset.ln && SEL[p].d === b.dataset.d;
      b.classList.toggle('on', !!on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
      b.onclick = () => { SEL[p] = on ? null : { l: b.dataset.ln, d: b.dataset.d }; if (!on) line = b.dataset.ln; drawCal(p); drawDay(p); syncFrame(); };
    });
    host.querySelectorAll('th.dk[data-d]').forEach((h) => {          // 날짜 머리 = 그날 모든 라인 작업 순서
      const go = () => { const on = SEL[p] && SEL[p].all && SEL[p].d === h.dataset.d; SEL[p] = on ? null : { all: true, d: h.dataset.d }; drawCal(p); drawDay(p); };
      h.onclick = go; h.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }
  // 펼침 목록 = 칸 숫자와 같은 자료(도금: 작업지시 MES 순서 → 1010 순서안 → 재질·폭 순 · 컬러: 작업대기(이어 돌린 뒤) → 지시대기 → 도료 미입고 → 계획편성)
  const KC = { 확정: ['작업대기', 'k1'], 편성: ['지시대기', 'k2'], 예상: ['입고예정', 'k3'], 작업대기: ['작업대기', 'w1'], 지시대기: ['지시대기', 'w2'], '부자재 입고대기': ['도료 미입고', 'w3'], 계획편성: ['계획편성', 'w4'] };
  const chip = (t, c) => (t ? `<span class="cp${c ? ' ' + c : ''}">${esc(t)}</span>` : '');
  const GRN = { CQ: 'CQ', DQ: 'DQ', DDQ: 'DDQ', EDDQ: 'EDDQ', LFQ: 'LFQ', GRC: 'Gr.C', GRD: 'Gr.D', GRE: 'Gr.E 극저', GREL: 'Gr.E 저탄', GRB: 'Gr.B' };
  const dayItems = (p, l, d) => { const C = CAL[p](); if (p === 'cc') { const R = C.raw(), x = R && ccFlow(R).F[l][d]; return x ? x.items : []; } return C.items(l, d); };
  function seqTable(p, I) {
    const row = (i, k) => {
      const kc = KC[i.kind] || [i.kind, ''], sz = i.thk ? `${(+i.thk).toFixed(2)} × ${n0(i.wdt)}` : '–';
      const sp = p === 'cg' ? chip(i.fam, 'al') + chip(GRN[i.grade] || i.grade) + chip(i.cot) + chip(i.aft) : chip(i.item) + chip(i.color, 'cl');
      const dl = p === 'cg' ? (i.dept ? `출항 ${md(i.dept)}` : i.arr ? `입항 ${md(i.arr)}` : i.due ? `납기 ${md(i.due)}` : '–') : (i.ready ? `준비 ${md(i.ready)}` : '–');
      return `<tr class="${i.kind === '확정' || i.kind === '작업대기' ? 'fx' : ''}${i.late ? ' lt' : ''}"><td class="no">${k + 1}</td><td><i class="kd ${kc[1]}">${esc(kc[0])}</i></td><td class="cn" title="${esc([i.con, i.cus, i.dst].filter(Boolean).join(' · '))}">${esc(i.con || '주문 연결 전')}</td><td title="${esc(i.grp || '')}">${esc(i.grp ? gnm(i.grp) : '')}</td><td class="sp">${sp}</td><td class="sz">${sz}</td><td class="t">${n1(i.t)}t</td><td class="dl">${dl}</td></tr>`;
    };
    return `<table class="ps-seq"><colgroup><col style="width:72px"><col style="width:120px"><col style="width:230px"><col style="width:110px"><col><col style="width:150px"><col style="width:100px"><col style="width:120px"></colgroup>`
      + `<thead><tr><th>순서</th><th>상태</th><th>계약</th><th>그룹</th><th>${p === 'cg' ? '강종·재질·도금량·후처리' : '품명·색상'}</th><th>두께 × 폭</th><th>톤</th><th>${p === 'cg' ? '출항·납기' : '부원료'}</th></tr></thead><tbody>${I.map(row).join('')}</tbody></table>`;
  }
  /* 지난 날 = MES 실적. 계약 단위 일 실적 게시본이 없어(재계획 rows·color_actual 은 그룹·강종/품명 합) 그룹·강종(도금) · 그룹·품명(컬러) 톤 표 */
  const pctT = (v, T) => (T ? `${Math.round(v / T * 100)}%` : '');
  function actTab(h, E, T) {
    return `<table class="ps-seq ps-act"><thead><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${E.map((r) => `<tr>${r.slice(0, -1).map((x) => `<td>${esc(x)}</td>`).join('')}<td class="t">${n1(r[r.length - 1])}t</td><td>${pctT(r[r.length - 1], T)}</td></tr>`).join('')}</tbody></table>`;
  }
  function actDay(p, R, d) {
    const L = LINES[p].map((l) => [l, R.act(l, d)]), T = L.reduce((s, [, a]) => s + ((a && a.t) || 0), 0);
    const one = (l, a) => {
      if (!a) return `<div class="ps-sh"><b>${l}</b><span>실적 자료 없음</span></div>`;
      if (!(a.t >= 0.5)) return `<div class="ps-sh"><b>${l}</b><span>비가동</span></div>`;
      const sh = `<div class="ps-sh"><b>${l}</b><span>${n0(a.t)}t${a.h ? ` · ${n1(a.h)}h` : ''}</span></div>`;
      const G = Object.entries(a.grp || {}), gt = (g) => G.filter(([k]) => gnm(k) === g).reduce((s, [, v]) => s + v, 0);
      if (p === 'cg') {
        const E = Object.entries(a.x || {}).filter(([, v]) => v >= 0.5).map(([k, v]) => { const [g, f] = k.split('|'); return [gnm(g), f, v]; })
          .sort((x, y) => gt(y[0]) - gt(x[0]) || y[2] - x[2]);
        return sh + actTab(['판매그룹', '강종', '톤', '비중'], E, a.t);
      }
      const E = G.filter(([, v]) => v >= 0.5).map(([g, v]) => [gnm(g), g === gnm(g) ? '' : g, v]).sort((x, y) => gt(y[0]) - gt(x[0]) || y[2] - x[2]);
      const Pr = (a.pr || []).filter(([, v]) => v >= 0.5).map(([q, v]) => [q, v]);
      return sh + `<div class="ps-acts">${actTab(['판매그룹', '세부', '톤', '비중'], E, a.t)}${Pr.length ? actTab(['품명', '톤', '비중'], Pr, a.t) : ''}</div>`;
    };
    return `<div class="ps-dh"><b>${dnm(d)} 실적</b><span>${n0(T)}t</span><button type="button" data-x="1">접기</button></div>` + L.map(([l, a]) => one(l, a)).join('');
  }
  function drawDay(p) {
    const box = $('ps-day-' + p), S = SEL[p], C = CAL[p]();
    if (!S || !C) { box.hidden = true; box.innerHTML = ''; return; }
    const isStop = (l) => !!(C.stop && C.stop(l, S.d));
    const body = (l, I) => (I.length ? seqTable(p, I) : `<p class="ps-empty">${isStop(l) ? '라인 정지' : '배정된 주문 없음'}</p>`);
    const close = '<button type="button" data-x="1">접기</button>';
    const R0 = C.raw && C.raw();
    if (S.all && R0 && S.d < R0.days[0]) { box.innerHTML = actDay(p, R0, S.d) + ''; box.hidden = false; box.querySelector('button[data-x]').onclick = () => { SEL[p] = null; drawCal(p); drawDay(p); }; return; }
    if (S.all) {
      const L = LINES[p].map((l) => [l, dayItems(p, l, S.d)]), N = L.reduce((s, [, I]) => s + I.length, 0), T = L.reduce((s, [, I]) => s + tsum(I), 0);
      box.innerHTML = `<div class="ps-dh"><b>${dnm(S.d)} 모든 라인</b><span>${N}건 · ${n0(T)}t</span>${close}</div>`
        + L.map(([l, I]) => (!I.length && isStop(l) ? `<div class="ps-sh"><b>${l}</b><span>정지</span></div>` : `<div class="ps-sh"><b>${l}</b><span>${I.length}건 · ${n0(tsum(I))}t</span></div>${body(l, I)}`)).join('');
    } else {
      const I = dayItems(p, S.l, S.d), nk = {}; I.forEach((i) => { nk[i.kind] = (nk[i.kind] || 0) + 1; });
      box.innerHTML = `<div class="ps-dh"><b>${S.l} ${dnm(S.d)}</b><span>${I.length}건 · ${n0(tsum(I))}t</span>${Object.entries(nk).map(([k, n]) => `<span><i class="kd ${(KC[k] || [])[1] || ''}">${esc((KC[k] || [k])[0])}</i> ${n}건</span>`).join('')}${close}</div>` + body(S.l, I);
    }
    box.hidden = false;
    box.querySelector('button[data-x]').onclick = () => { SEL[p] = null; drawCal(p); drawDay(p); };
  }
  /* 맨 위 = 주문진도 화면(ct_orders.js)의 '컬러·도금 전체 주문진도' 그대로(CTORD.mount — 같은 함수·같은 자료, 라인별 미생산 카드만 뺌) */
  let ORD = null;
  async function loadOrd() {
    if (!window.CTORD) return null;
    const E = await Promise.all(CTORD.FILES.map((f) => GP.latest(f).catch(() => null))), D = {};
    for (let k = 0; k < E.length; k++) D[CTORD.FILES[k].replace(/\.enc\.json$/, '')] = E[k] ? await GP.decryptJSON(E[k], PW).catch(() => null) : null;
    return D.cg_order_progress || D.cc_order_progress ? D : null;
  }
  function drawOrd() {
    const host = $('ps-ord'); $('ps-ordc').hidden = !ORD;
    if (ORD) { try { CTORD.mount(host, ORD); } catch (e) { console.error(e); $('ps-ordc').hidden = true; } }
  }
  function drawAll() {
    drawOrd();
    const P = plants(); if (!P.length) return;
    if (!P.some((p) => LINES[p].includes(line))) line = LINES[P[0]].find((l) => lineSum(P[0], l).n) || LINES[P[0]][0];
    $('ps-cgc').hidden = !P.includes('cg'); $('ps-ccc').hidden = !P.includes('cc');
    drawLine(); P.forEach((p) => { drawCal(p); drawDay(p); }); syncFrame();
  }

  // ───────── 아래 '작업 순서 수정' = 작업 순서 화면(week_seq.html) 그대로(iframe, 높이 = 화면 높이 · 안에서 넘김 — 날짜 머리줄 고정이 그대로 동작). 머리·메뉴·공장/방식 고르기·라인 요약 칸(위와 같은 내용)은 숨기고, 라인은 위 선택을 따라감
  const FR = $('ps-frame');
  const FCSS = `#shell, header.topbar, .topbar, nav, aside, .side, .sidebar, footer.foot, #ui-ctl, #ui-scope-note, #ui-stale, #v2-flag, .docmeta, #ws-plant, #ws-mode, #ws-kpis, .ws-hint { display: none !important; }
html, body { background: transparent !important; min-height: 0 !important; height: auto !important; }
body { margin: 0 !important; padding: 0 !important; display: block !important; }
main.wrap { margin: 0 !important; padding: 0 !important; max-width: none !important; width: auto !important; }
#ws-main .card { box-shadow: none; }`;
  let frReady = false;
  function fitFrame() { FR.style.height = Math.max(640, innerHeight - 96) + 'px'; }
  addEventListener('resize', fitFrame);
  function frameLoaded() {
    const d = FR.contentDocument; if (!d) return;
    const st = d.createElement('style'); st.textContent = FCSS; d.head.appendChild(st);
    frReady = true; syncFrame(); fitFrame();
  }
  let syncT = null;
  function syncFrame() {
    if (!line) return;
    const p = LINES.cg.includes(line) ? 'cg' : 'cc';
    if (!FR.getAttribute('src')) { FR.onload = frameLoaded; FR.src = `week_seq.html${location.search}#${p}`; return; }
    if (!frReady) return;
    const w = FR.contentWindow, d = FR.contentDocument;
    if (!/cc/.test(w.location.hash) !== (p === 'cg')) w.location.hash = p;
    clearTimeout(syncT); let k = 0;
    const pick = () => {
      if ((/cc/.test(w.location.hash) ? 'cc' : 'cg') !== p) {            // 아래에 저장 안 한 수정이 있어 공장 바꾸기를 취소함 → 위도 아래 라인으로 되돌림
        const cur = d.querySelector('#ws-kpis .ws-k[aria-pressed="true"]'); if (cur) line = cur.dataset.l; return; }
      const b = d.querySelector(`#ws-kpis .ws-k[data-l="${line}"]`);
      if (b) { if (b.getAttribute('aria-pressed') !== 'true') b.click(); fitFrame(); return; }
      if (++k < 60) syncT = setTimeout(pick, 250); };
    pick();
  }

  async function unlock(pw) {
    try {
      PW = pw;
      for (const p of ['cg', 'cc']) {
        const env = await GP.latest(`week_seq_${p}.enc.json`); if (!env) throw new Error('자료 없음');
        const D = await GP.decryptJSON(env, PW), J = {}; D.jobs.forEach((x) => { J[x.id] = x; });
        X[p] = { D, R: D.rules, J, L: {}, ver: null };
      }
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      await Promise.all(['cg', 'cc'].map(async (p) => { const sv = await lastSaved(p); X[p].ver = sv; useSaved(p, sv); }));
      await Promise.all([window.CGCAL && CGCAL.load(pw), window.CCCAL && CCCAL.load(pw), loadOrd().then((D) => { ORD = D; })].map((x) => Promise.resolve(x).catch(() => null)));   // 캘린더 = 생산 일정 화면과 같은 자료 · 주문진도 = 주문진도 화면과 같은 자료
      $('ps-lock').hidden = true; $('ps-main').hidden = false;
      drawAll();
    } catch (e) {
      $('ps-main').hidden = true; $('ps-lock').hidden = false; $('ps-form').hidden = false;
      $('ps-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 없습니다(다음 포털 갱신 시 생성)' : '암호가 맞지 않습니다') : '';
      document.querySelector('#ps-lock h2').textContent = '분석 암호';
    }
  }
  if (window.UI && UI.onScope) UI.onScope(() => { if (X.cg) drawAll(); });
  $('ps-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ps-pw').value); });
  let s = ''; try { s = localStorage.getItem(PW_KEY) || ''; } catch (e) { /* 무시 */ }
  if (s) unlock(s); else { $('ps-form').hidden = false; document.querySelector('#ps-lock h2').textContent = '분석 암호'; }
})();
