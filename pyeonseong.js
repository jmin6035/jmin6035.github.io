/* 편성(11/12 회의: 1주 작업지시 편성 = 주문 마감 → 소재 매치 → 라인 배분 → 작업 순서) — 작업 순서 화면(week_seq)의 보기 전용.
   이 화면에서 볼 것 · 보는 순서(위 → 아래):
     ① 흐름 한 줄 — 이번 편성이 어디까지 왔나(마감일 → 소재 들어온 작업 → 라인에 배분한 톤 → 작업지시 내려간 건수)
     ② 라인 배분 — 라인마다 작업 가능 시간을 얼마나 채웠나(막대) · 배분 톤 · 소재 며칠분(소재가 들어온 주문으로 며칠 돌 수 있나)
     ③ 작업 순서 — 라인 → 날짜 → 줄. 왼쪽 색 띠 = 같은 폭(도금)·같은 색상(컬러)으로 묶은 줄, '지시' 배지·굵은 글자 = 이미 작업지시 내려간 줄,
        굵은 선 '여기까지 지시됨' 아래 = 앞으로 할 순서
   자료 = week_seq 와 같은 게시본(published/week_seq_cg·cc.enc.json) + 같은 저장소(cgl_week_seq)의 최근 저장·확정본(읽기만).
   지시 여부 = 작업 순서 자료의 도금 issued(MES 1030 지시)·컬러 fixed(MES 1030 작업대기) — week_seq.js 와 같은 기준.
   소재 며칠분 = 주문진도(ct_orders.js 라인별 작업가능일)와 같은 식: 소재 매치 후 + 작업지시량 작업시간 ÷ 24시간(그 파일이 모듈이 아니라 복사 — 바꾸면 둘 다).
   시각 흘리기(sim)·전환 휴지(chgCG·chgCC)·바뀜 이름(catOf·fsCG)은 week_seq.js 와 같은 식(복사 — 바꾸면 둘 다).
   순서 바꾸기·저장·확정은 없음(수정은 작업 순서 화면) */
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
  const hrs = (m) => `${n0(m / 60)}시간`;
  const LINES = { cg: ['1CGL', '2CGL'], cc: ['1CCL', '2CCL', '3CCL', '4CCL'] };
  const PN = { cg: '도금', cc: '컬러' };
  const SC = { cg: 'G', cc: 'C' };
  // ───────── 소재 며칠분(주문진도 ct_orders.js 와 같은 식: 매치 후 + 작업지시량의 작업시간 ÷ 24h)
  const CAPG = { '1CGL': 719, '2CGL': 927 };
  let ORD = null;                                                  // { 라인: { h: 시간, hm: 매치 후, hw: 작업지시량 } }
  function matDays(D) {
    const cc = D.cc_order_progress, out = {};
    const add = (l, k, h) => { const o = out[l] || (out[l] = { h: 0, hm: 0, hw: 0 }); o.h += h; o[k] += h; };
    const catC = (r) => {
      if (r.s1030 !== undefined || r.smat !== undefined) { if (r.s1030) return 'W'; return r.mchT > 0.0005 ? 'M' : '0'; }
      if ((+r.cfmT || 0) > 0.05) return 'W';
      if (!(r.mchT > 0.0005)) return '0';
      if (r.subWait != null) return 'M';
      if (r.in1020 === false) return '0';
      return 'M'; };
    const hrsC = (r, k) => (k === 'W' ? (r.s1030 ? r.s1030.h : r.cfmHrs != null ? r.cfmHrs : r.hrs) || 0 : (r.hrs || 0));   // 매치 후 = 주문진도 '소재 매치 후' 줄과 같은 r.hrs
    const M = CT.orders(D);
    if (cc) {
      const shut = new Set((M.C || []).filter((o) => o.pl === 'C' && o.closed).map((o) => o.src));
      (cc.rows || []).filter((r) => !shut.has(r) && !r.dummy).forEach((r) => { const k = catC(r); if (k !== '0') add(r.line, k === 'W' ? 'hw' : 'hm', hrsC(r, k)); });
    }
    if (D.cg_order_progress) {
      const tq = (o) => /^[TQ]$/.test(String(o.id || '').charAt(4));
      (M.G || []).filter((o) => !o.closed && ((o.remT || 0) > 1 || (tq(o) && (o.remT || 0) > 0.0005))).forEach((o) => {
        const k = (o.src && o.src.woWait) ? 'W' : o.matSt !== '확보' ? '0' : 'M'; if (k === '0') return;
        add(o.line, k === 'W' ? 'hw' : 'hm', (o.remT || 0) / ((o.src && o.src.tph) || (CAPG[o.line] || 800) / 24)); });
    }
    return out;
  }
  const X = {};                                                    // 공장별 { D, R, J, L, ver }
  let PW = '', line = null;

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
  const period = (p) => { const D = X[p].D; return `${md(dayOf(tms(D.w0)))}~${md(dayOf(tms(D.w1) - 1))}`; };
  const mat = (l) => (ORD && ORD[l] ? ORD[l] : null);

  const ARW = '<div class="ps-ar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></div>';
  function drawFlow() {
    const P = plants(), D0 = X[P[0] || 'cg'].D;
    const cut = addD(D0.week, -7);                                 // 이번 순서 = 지난 수요일 마감분, 다음 마감 = D.week(주 시작 수요일, week_seq 저장 키)
    let nJ = 0, tJ = 0, nA = 0, tA = 0, nL = 0, nF = 0, tF = 0;
    P.forEach((p) => {
      const { D } = X[p]; nJ += D.jobs.length; tJ += D.jobs.reduce((s, x) => s + (x.t || 0), 0);
      LINES[p].forEach((l) => { const o = lineSum(p, l); nA += o.n; tA += o.t; if (o.n) nL++;
        sim(p, l).forEach((q) => { if (q.k === 'j' && done(p, q.x)) { nF++; tF += q.x.t; } }); });
    });
    const st = (i, l, v, s) => `<div class="ps-st"><div class="l"><i>${i}</i>${l}</div><div class="v">${v}</div><div class="s" title="${esc(s.replace(/<[^>]+>/g, ''))}">${s}</div></div>`;
    $('ps-flow').innerHTML = [
      st(1, '주문 마감', dnm(cut), `다음 마감 ${dnm(D0.week)}`),
      st(2, '소재 매치', `${n0(tJ)}<small>t</small>`, `소재 들어온 작업 ${n0(nJ)}건`),
      st(3, '라인 배분', `${n0(tA)}<small>t</small>`, `${nL}개 라인 · ${n0(nA)}건`),
      st(4, '작업 순서', `${n0(nF)}<small>건 지시</small>`, `${n0(tF)}t 지시됨 · 앞으로 ${n0(nA - nF)}건`),
    ].join(ARW);
  }

  // 라인 배분: 라인마다 가로 막대(한 색, 작업 가능 시간 대비 배분 시간) — 값(톤 · %)은 막대 끝, 마우스·초점 = 툴팁, 아래 '표로 보기' = 같은 숫자
  const tip = $('ps-tip');
  function showTip(el, rows, head, px) {
    tip.textContent = '';
    const h = document.createElement('div'); h.className = 'h'; h.textContent = head; tip.appendChild(h);
    rows.forEach(([k, v]) => { const r = document.createElement('div'); r.className = 'r'; const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; r.append(a, b); tip.appendChild(r); });
    tip.hidden = false;
    const b = el.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
    const cx = px == null ? b.left + b.width / 2 : px;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2)) + 'px';
    tip.style.top = (b.top - hgt - 8 < 8 ? b.bottom + 8 : b.top - hgt - 8) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function fitLabels() {
    $('ps-mt').querySelectorAll('.ps-lb').forEach((lb) => {
      const tk = lb.parentElement, f = tk.querySelector('.ps-fl'), pc = lb.querySelector('i'), over = () => lb.offsetLeft + lb.offsetWidth > tk.clientWidth;
      lb.classList.remove('in'); pc.hidden = false;
      if (!over()) return;
      if (f.offsetWidth >= lb.offsetWidth + 4) { lb.classList.add('in'); return; }
      pc.hidden = true; if (over()) lb.classList.add('in');            // 톤만 남기고, 그래도 넘치면 안쪽(%는 툴팁·표)
    });
  }
  addEventListener('resize', () => { if ($('ps-mt').children.length) fitLabels(); });
  const dayTxt = (h) => (h ? `${(h / 24).toFixed(1)}일분` : '–');
  function drawMeter() {
    const P = plants(), S = {};
    P.forEach((p) => LINES[p].forEach((l) => { S[l] = lineSum(p, l); }));
    const row = (p, l, last) => {
      const o = S[l], m = mat(l), pc = Math.round(o.fill * 100), w = Math.min(100, o.fill * 100);
      const bar = o.stop ? `<span class="ps-stp">정지${o.stop.until ? ` ~${md(o.stop.until)}` : ''}</span>`
        : `<div class="ps-fl" style="width:${w.toFixed(1)}%"></div><span class="ps-lb" style="left:${w.toFixed(1)}%"><b>${n0(o.t)}t</b><i>${pc}%</i></span>`;
      return `<div class="ps-mr${l === line ? ' on' : ''}${last ? ' le' : ''}" data-l="${l}" role="listitem"><div class="nm"><span>${l}</span></div>`
        + `<div class="bx"><div class="ps-tk" tabindex="0" aria-label="${esc(`${l} 배분 ${n0(o.t)}톤 ${o.n}건, 작업 가능 ${hrs(o.avail)} 중 ${pc}%`)}">${bar}</div></div>`
        + `<div class="c c3">${o.stop ? '0시간' : hrs(o.avail)}</div><div class="c"><b>${m ? (m.h / 24).toFixed(1) : '–'}</b>${m ? '일분' : ''}</div></div>`;
    };
    $('ps-mt').innerHTML = '<div class="hd h0">공정</div><div class="hd">라인</div><div class="hd">배분 톤<span class="hx"> · 작업 가능 시간 대비 %</span></div><div class="hd h3">작업 가능</div><div class="hd">소재</div>'
      + P.map((p) => `<div class="pg" style="grid-row:span ${LINES[p].length}">${PN[p]}<span>${period(p)}</span></div>` + LINES[p].map((l, i) => row(p, l, i === LINES[p].length - 1)).join('')).join('');
    $('ps-note').textContent = '소재 = 소재가 들어온 주문(작업지시 포함)으로 그 라인을 며칠 돌릴 수 있나 — 24시간 기준, 주문진도와 같은 값';
    // 값 라벨: 막대 끝 바깥, 자리가 모자라면 막대 안쪽 끝(재어서 정함)
    fitLabels();
    const tipRows = (l) => { const o = S[l], m = mat(l); return [['배분', `${n0(o.t)}t · ${o.n}건`], ['배분 시간', hrs(o.busy)], ['작업 가능 시간', hrs(o.avail)], ['채움', `${Math.round(o.fill * 100)}%`], ['소재', m ? `${dayTxt(m.h)} (지시 ${dayTxt(m.hw)})` : '–']]; };
    $('ps-mt').querySelectorAll('.ps-mr').forEach((r) => {
      const l = r.dataset.l, t = r.querySelector('.ps-tk');
      r.onclick = () => { line = l; drawAll(); document.getElementById('ps-seqc').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      t.onpointermove = (e) => showTip(t, tipRows(l), l, e.clientX); t.onpointerleave = hideTip;
      t.onfocus = () => showTip(t, tipRows(l), l); t.onblur = hideTip;
      t.onkeydown = (e) => { if (e.key === 'Enter') r.onclick(); };
    });
    $('ps-sum').innerHTML = '<thead><tr><th>라인</th><th>배분 톤</th><th>건수</th><th>배분 시간</th><th>작업 가능 시간</th><th>채움</th><th>소재</th></tr></thead><tbody>'
      + P.map((p) => LINES[p].map((l) => { const o = S[l], m = mat(l); return `<tr><td>${l}</td><td>${n0(o.t)}t</td><td>${o.n}건</td><td>${hrs(o.busy)}</td><td>${hrs(o.avail)}</td><td>${Math.round(o.fill * 100)}%</td><td>${m ? dayTxt(m.h) : '–'}</td></tr>`; }).join('')).join('') + '</tbody>';
  }

  // 묶은 이유: 앞 작업과 같은 것(굵게) + 바뀐 것(작업 순서 화면의 바뀜 이름)
  function why(p, q) {
    const a = q.prev, b = q.x, R = X[p].R;
    if (b.dummy) return '<span class="ch">더미</span>';
    if (!a) return '<span class="ch">첫 작업</span>';
    let same = [], chg = [];
    if (p === 'cg') {
      const ta = a.trt || {}, tb = b.trt || {};
      if (a.con && a.con === b.con) same.push('계약');
      if (a.al === b.al) same.push('강종'); else chg.push(`강종 ${esc(a.al)}→${esc(b.al)}`);
      if (a.thick === b.thick) same.push('두께');
      if (Math.abs((a.width || 0) - (b.width || 0)) <= 5) same.push('폭');
      if (ta.cot && ta.cot === tb.cot) same.push('도금량');
      if ((ta.aft || '') === (tb.aft || '')) same.push('후처리');
      chg = chg.concat(fsCG(R, a, b));
      if ((ta.aft || '') !== (tb.aft || '') && !(ta.aft && tb.aft)) chg.push(`후처리 ${ta.aft || '없음'}→${tb.aft || '없음'}`);
    } else {
      const k = catOf(a, b);
      if (k === '사양 같음') same = ['색상', '두께·폭'];
      else {
        const NM = { 하도: '하도', 상도: '색상', 이면: '이면', 치수: '두께·폭' };
        same = ['상도', '치수'].filter((z) => !k.split('+').includes(z)).map((z) => NM[z]);
        chg.push(k.split('+').map((z) => NM[z]).join('·') + ' 바뀜');
      }
    }
    const tail = chg.map(esc).concat(q.chm >= 1 ? [`휴지 ${n0(q.chm)}분`] : []).join(' · ');
    return (same.length ? `<span class="sm">같은 ${same.join('·')}</span>` : '') + (tail ? `${same.length ? ' · ' : ''}<span class="ch">${tail}</span>` : '');
  }
  // 묶음: 도금 = 같은 강종 · 폭 차이 10mm 이하로 이어진 줄(폭 순서 편성) · 컬러 = 같은 상도 색상으로 이어진 줄
  const bkey = (p, x) => (x.dummy ? null : p === 'cg' ? x.al : (x.code || x.top || x.color || null));
  const sameB = (p, a, b) => !!(a && b && bkey(p, a) && bkey(p, a) === bkey(p, b) && (p !== 'cg' || Math.abs((a.width || 0) - (b.width || 0)) <= 10));
  const bname = (p, x) => (p === 'cg' ? `같은 폭 ${n0(x.width)}` : `같은 색상 ${esc(x.code || x.top || x.color)}`);
  function spec(p, x) {
    if (p === 'cg') { const t = x.trt || {}; return `<span class="cp al">${esc(x.al || x.sur)}</span>${t.cot ? `<span class="cp" title="도금량">${esc(t.cot)}</span>` : ''}${t.aft ? `<span class="cp" title="후처리">${esc(t.aft)}</span>` : ''}`; }
    if (x.dummy) return '<span class="cp wr">더미</span>';
    return `<span class="cp" title="품명">${esc(x.item || x.pdt)}</span><span class="cp cl" title="상도 색상">${esc(x.code || x.color || '')}</span>`;
  }
  const size = (p, x) => (p === 'cg' ? `${(+x.thick).toFixed(2)} × ${n0(x.width)}` : `${(+x.thk).toFixed(2)} × ${n0(x.wdt)}`);
  function drawList() {
    const P = plants(), p = P.find((z) => LINES[z].includes(line));
    $('ps-lines').innerHTML = P.map((z) => LINES[z].map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l}</button>`).join('')).join('');
    $('ps-lines').querySelectorAll('button').forEach((b) => (b.onclick = () => { line = b.dataset.l; drawAll(); }));
    $('ps-go').href = `week_seq.html#${p}`;
    const o = X[p], s = o.ver;
    $('ps-ver').innerHTML = s ? `<b>${s.state === 'confirm' ? '확정' : '저장'} v${s.v}</b> · ${esc(s.who)} · ${esc(UI.fmtDateTime(new Date(s.at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)))}` : `<b>초안</b> · ${esc(UI.fmtDateTime(o.D.built))} 자료`;
    $('ps-key').innerHTML = `<span><i class="kb"></i>${p === 'cg' ? '같은 강종·같은 폭으로 이어진 묶음' : '같은 색상으로 이어진 묶음'}</span><span><span class="ps-fx">지시</span>작업지시 내려감</span>`;
    const W1 = tms(o.D.w1), ev = sim(p, line).filter((q) => q.k === 'j');
    if (!ev.length) { const st = o.D.lines[line].stop; $('ps-list').innerHTML = `<p class="ps-empty">${line} 이 기간 작업 없음${st ? ' — ' + esc(st.note || '정지') : ''}</p>`; return; }
    const G = []; ev.forEach((q) => { const d = q.s >= W1 ? 'over' : dayOf(q.s); let g = G[G.length - 1]; if (!g || g.d !== d) G.push(g = { d, q: [] }); g.q.push(q); });
    // 묶음 위치(날짜 안에서): bs 시작 · be 끝(띠 끊김) · b1 = 띠 있음
    G.forEach((g) => { let i = 0; while (i < g.q.length) { let j = i; while (j + 1 < g.q.length && sameB(p, g.q[j].x, g.q[j + 1].x)) j++;
      if (j > i) { for (let k = i; k <= j; k++) g.q[k].b = { c: 'b1', s: k === i, e: k === j, n: j - i + 1, t: g.q.slice(i, j + 1).reduce((a, q) => a + q.x.t, 0) }; }
      i = j + 1; } });
    const lastDone = ev.reduce((a, q, i) => (done(p, q.x) ? i : a), -1), nDone = ev.filter((q) => done(p, q.x)).length;
    let n = 0;
    const cut = () => `<tr class="cut"><td colspan="6"><div>여기까지 지시됨 · ${nDone}건<span>${n + 1}번부터 앞으로 할 순서</span></div></td></tr>`;
    const tr = (q) => { const i = n++, b = q.b, fx = done(p, q.x);
      const cls = `j${fx ? ' fx' : ''}${b ? ` ${b.c}${b.s ? ' bs' : ''}${b.e ? ' be' : ''}` : ''}`;
      const bn = b && b.s ? `<span class="bn">${bname(p, q.x)} · ${b.n}줄</span>` : '';
      return `<tr class="${cls}"${b ? ` title="${esc(`${bname(p, q.x).replace(/&[^;]+;/g, '')} ${b.n}줄 · ${n1(b.t)}t`)}"` : ''}><td class="no">${i + 1}${fx ? '<span class="ps-fx">지시</span>' : ''}</td><td class="wy">${bn}${why(p, q)}</td><td class="cn" title="${esc(q.x.con || q.x.id)}">${esc(q.x.con || '계약 미연결')}</td><td class="sp">${spec(p, q.x)}</td><td class="sz">${size(p, q.x)}</td><td class="t">${n1(q.x.t)}t</td></tr>`
        + (i === lastDone && lastDone < ev.length - 1 ? cut() : ''); };
    const body = G.map((g) => { const nf = g.q.filter((q) => done(p, q.x)).length;
      return `<tr class="dh"><td colspan="6"><b>${g.d === 'over' ? `기간 끝(${md(dayOf(W1))}) 넘침` : dnm(g.d)}</b><span>${g.q.length}건 · ${n0(g.q.reduce((s, q) => s + q.x.t, 0))}t${nf ? ` · 지시 ${nf}건` : ''}</span></td></tr>` + g.q.map(tr).join(''); }).join('');
    $('ps-list').innerHTML = `<table class="ps-seq"><colgroup><col style="width:104px"><col><col style="width:210px"><col style="width:190px"><col style="width:140px"><col style="width:88px"></colgroup>`
      + `<thead><tr><th>순번</th><th>묶은 이유</th><th>계약</th><th>${p === 'cg' ? '강종·도금량·후처리' : '품명·색상'}</th><th>두께 × 폭</th><th>톤</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function drawAll() {
    const P = plants(); if (!P.length) return;
    if (!P.some((p) => LINES[p].includes(line))) line = LINES[P[0]].find((l) => lineSum(P[0], l).n) || LINES[P[0]][0];
    drawFlow(); drawMeter(); drawList();
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
      try {                                                        // 소재 며칠분(주문진도와 같은 자료) — 없으면 '–'
        const F = ['cg_order_progress', 'cc_order_progress', 'cg_calendar'], E = await Promise.all(F.map((f) => GP.latest(f + '.enc.json').catch(() => null))), O = {};
        for (let i = 0; i < F.length; i++) O[F[i]] = E[i] ? await GP.decryptJSON(E[i], PW) : null;
        CT.D = O; ORD = matDays(O);
      } catch (e) { ORD = null; }
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
