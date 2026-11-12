/* 편성(11/12 회의: 1주 작업지시 편성 = 주문 마감 → 소재 매치 → 라인 배분 → 작업 순서) — 작업 순서 화면(week_seq)의 보기 전용.
   자료 = week_seq 와 같은 게시본(published/week_seq_cg·cc.enc.json) + 같은 저장소(cgl_week_seq)의 최근 저장·확정본(읽기만).
   시각 흘리기(sim)·전환 휴지(chgCG·chgCC)·바뀜 이름(catOf·fsCG)은 week_seq.js 와 같은 식(그 파일이 모듈이 아니라 복사 — 바꾸면 둘 다).
   순서 바꾸기·저장·확정은 없음(수정은 작업 순서 화면). 생산 일정(시각·캘린더)과 겹치는 칸은 넣지 않음 */
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

  // ───────── 라인 요약: 배분(건·톤) · 작업 가능 시간(기간 − 계획 휴지)
  function lineSum(p, l) {
    const { D } = X[p], W0 = tms(D.w0), W1 = tms(D.w1), ev = sim(p, l);
    const js = ev.filter((q) => q.k === 'j' && q.s < W1);
    const from = Math.max(W0, tms(D.lines[l].from));
    const pl = ev.filter((q) => q.k === 'p' && q.s < W1).reduce((s, q) => s + Math.min(q.e, W1) - q.s, 0);
    return { n: js.length, t: js.reduce((s, q) => s + q.x.t, 0), avail: Math.max(0, W1 - from - pl), stop: !js.length && D.lines[l].stop };
  }
  const plants = () => ['cg', 'cc'].filter((p) => X[p] && UI.inScope(SC[p]));

  function drawFlow() {
    const P = plants(), D0 = X[P[0] || 'cg'].D;
    const cut = addD(D0.week, -7);                                 // 이번 순서 = 지난 수요일 마감분, 다음 마감 = D.week(주 시작 수요일, week_seq 저장 키)
    let nJ = 0, tJ = 0, nA = 0, tA = 0;
    P.forEach((p) => {
      const { D } = X[p]; nJ += D.jobs.length; tJ += D.jobs.reduce((s, x) => s + (x.t || 0), 0);
      LINES[p].forEach((l) => { const o = lineSum(p, l); nA += o.n; tA += o.t; });
    });
    const per = P.map((p) => { const D = X[p].D, W1 = tms(D.w1); return `${PN[p]} ${md(dayOf(tms(D.w0)))}~${md(dayOf(W1 - 1))}`; }).join(' · ');
    const vs = P.map((p) => { const s = X[p].ver; return `${PN[p]} ${s ? `${s.state === 'confirm' ? '확정' : '저장'} v${s.v}` : '초안'}`; }).join(' · ');
    const st = (i, l, v, s) => `<div class="ps-st"><div class="l"><i>${i}</i>${l}</div><div class="v">${v}</div><div class="s" title="${esc(s)}">${s}</div></div>`;
    $('ps-flow').innerHTML = st(1, '주문 마감', dnm(cut), `다음 마감 ${dnm(D0.week)} 오전`)
      + st(2, '소재 매치', `${n0(nJ)}<small>건</small> ${n0(tJ)}<small>t</small>`, '소재 들어온 작업')
      + st(3, '라인 배분', `${n0(nA)}<small>건</small> ${n0(tA)}<small>t</small>`, per)
      + st(4, '작업 순서', P.every((p) => X[p].ver && X[p].ver.state === 'confirm') ? '확정' : P.some((p) => X[p].ver) ? '저장본' : '초안', vs);
  }
  function drawSum() {
    const P = plants();
    const head = `<thead><tr><th rowspan="2"></th>${P.map((p) => { const D = X[p].D; return `<th colspan="${LINES[p].length}" class="pl">${PN[p]} ${md(dayOf(tms(D.w0)))}~${md(dayOf(tms(D.w1) - 1))}</th>`; }).join('')}</tr>`
      + `<tr>${P.map((p) => LINES[p].map((l) => `<th class="ln${l === line ? ' on' : ''}" data-l="${l}">${l}</th>`).join('')).join('')}</tr></thead>`;
    const S = {}; P.forEach((p) => LINES[p].forEach((l) => { S[l] = lineSum(p, l); }));
    const cell = (l, f) => `<td class="ln${l === line ? ' on' : ''}" data-l="${l}">${f(S[l])}</td>`;
    const stopTxt = (o) => `<span class="st" title="${esc(o.stop.note || '')}">정지${o.stop.until ? ` ~${md(o.stop.until)}` : ''}</span>`;
    const row = (nm, f) => `<tr><th>${nm}</th>${P.map((p) => LINES[p].map((l) => cell(l, f)).join('')).join('')}</tr>`;
    $('ps-sum').innerHTML = head + '<tbody>'
      + row('배분 톤', (o) => (o.stop ? stopTxt(o) : `<b>${n0(o.t)}t</b> · ${o.n}건`))
      + row('작업 가능 시간', (o) => (o.stop ? '0시간' : hrs(o.avail))) + '</tbody>';
    $('ps-sum').querySelectorAll('.ln').forEach((c) => (c.onclick = () => { line = c.dataset.l; drawAll(); }));
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
    return (same.length ? `<span class="sm">같은 ${same.join('·')}</span>` : '') + (tail ? `${same.length ? ' ' : ''}<span class="ch">${tail}</span>` : '');
  }
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
    const W1 = tms(o.D.w1), ev = sim(p, line).filter((q) => q.k === 'j');
    if (!ev.length) { const st = o.D.lines[line].stop; $('ps-list').innerHTML = `<p class="ps-empty">${line} 이 기간 작업 없음${st ? ' — ' + esc(st.note || '정지') : ''}</p>`; return; }
    const G = []; ev.forEach((q) => { const d = q.s >= W1 ? 'over' : dayOf(q.s); let g = G[G.length - 1]; if (!g || g.d !== d) G.push(g = { d, q: [] }); g.q.push(q); });
    let n = 0;
    const body = G.map((g) => `<tr class="dh"><td colspan="6" class="v2-l"><b>${g.d === 'over' ? `기간 끝(${md(dayOf(W1))}) 넘침` : dnm(g.d)}</b><span>${g.q.length}건 · ${n0(g.q.reduce((s, q) => s + q.x.t, 0))}t</span></td></tr>`
      + g.q.map((q) => `<tr><td class="no">${++n}</td><td class="cn" title="${esc(q.x.con || q.x.id)}">${esc(q.x.con || '계약 미연결')}</td><td class="sp">${spec(p, q.x)}</td><td class="sz">${size(p, q.x)}</td><td class="t">${n1(q.x.t)}t</td><td class="wy v2-l">${why(p, q)}</td></tr>`).join('')).join('');
    $('ps-list').innerHTML = `<table class="ps-seq"><colgroup><col style="width:64px"><col style="width:210px"><col style="width:220px"><col style="width:150px"><col style="width:96px"><col></colgroup>`
      + `<thead><tr><th>순번</th><th>계약</th><th>${p === 'cg' ? '강종·도금량·후처리' : '품명·색상'}</th><th>두께 × 폭</th><th>톤</th><th class="wy v2-l">묶은 이유</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function drawAll() {
    const P = plants(); if (!P.length) return;
    if (!P.some((p) => LINES[p].includes(line))) line = LINES[P[0]].find((l) => lineSum(P[0], l).n) || LINES[P[0]][0];
    drawFlow(); drawSum(); drawList();
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
