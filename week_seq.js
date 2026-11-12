/* 주간 작업순서(11/9 사용자): published/week_seq_cg.enc.json · week_seq_cc.enc.json (gadong-plan/tools/week_seq.py)
   초안 = 기존 작업지시 순서 규칙(도금 cg_wo_sequence · 컬러 wo_sequence)을 수 07:00 ~ 화 07:00 로 넓힌 것.
   화면: 순서 바꾸기(끌어 옮기기·위/아래·다른 날)·휴지 넣기·빼기/넣기 → 시각 다시 계산(아래 sim, Python week_seq.sim 과 같은 식)
   저장 = Supabase cgl_week_seq(분석 암호로 암호화, 추가만 = 버전 이력) · 확정 = state confirm · 점검 = 아래 checks(같은 규칙 자료)
   11/11 생산 화면 통합(04 생산계획 › 작업 순서): 주소 #cg·#cc = 주간 순서(편집) · #cg-wo·#cc-wo = 작업지시 제안(옛 도금·컬러 작업지시 순서 화면, cg_wo.js·wo.js 를 불러 붙임)
   맨 위 라인 칸 = 결론(작업·톤·남는 시간·점검 위반·오늘 순서), 맨 아래 접기 = 기준·사양(전환 휴지·더미 기준 · 점검 규칙 · 편성 조건) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const API = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_week_seq', KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';   // 공개용 키(표 권한 = 읽기·추가만)
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const WD = '일월화수목금토';
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const TODAY = new Date(Date.now() + 9 * 3600e3 - 7 * 3600e3).toISOString().slice(0, 10);   // MES 일자(07시 기준, KST)
  const dnm = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
  // 시각 = 한국 시각 그대로 '분'으로(시간대 변환 없이)
  const tms = (s) => { const m = String(s).match(/(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) / 6e4 : NaN; };
  const iso = (m) => new Date(m * 6e4).toISOString().slice(0, 16).replace('T', ' ');
  const dayOf = (m) => iso(m - 420).slice(0, 10);                 // MES 하루 = 07시 ~ 다음날 07시
  const hhmm = (m) => iso(m).slice(11);
  const hrs = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 >= 1 ? ' ' + Math.round(m % 60) + '분' : ''}` : `${Math.round(m)}분`);
  const LINES = { cg: ['1CGL', '2CGL'], cc: ['1CCL', '2CCL', '3CCL', '4CCL'] };
  const POOLNM = { pre: '기간 시작 전에 끝날 작업', over: '기간 내 시간 부족(순연)', later: '생산예정일이 기간 뒤', out: '직접 제외 작업', new: '신규 작업' };
  const GR = { CQ: 'CQ', DQ: 'DQ', DDQ: 'DDQ', EDDQ: 'EDDQ', LFQ: 'LFQ', GRC: 'Gr.C', GRD: 'Gr.D', GRE: 'Gr.E 극저', GREL: 'Gr.E 저탄', GRA: 'Gr.A', GRB: 'Gr.B' };
  const IND = { A: '508', B: '610', C: '305' };

  let mode = /-wo\b/.test(location.hash) ? 'wo' : 'ed';
  let PW = '', plant = /cc/.test(location.hash) ? 'cc' : 'cg', D = null, J = {}, R = null, L = {}, line = null;
  let VERS = [], cur = null, dirty = false, CK = null, gapN = 0, hl = null;
  const DATA = {};

  // ───────── 전환 휴지(분) — 도금: 학습 1년 조건표(cg_wo_sequence.pfeats·cost) / 컬러: 조건표 × 라인 보정(wo_cost.parts) + 블록 바뀜 실측
  const sk = (c) => { c = String(c || ''); return c.includes('·') ? c.split('·')[1] : c.length >= 7 ? c.slice(3, 7) : c; };
  // 11/10 사용자: 컬러 전환 휴지 = 1년 실적 평균(라인 × 바뀜 종류, 색상교체·롤 교체·청소·더미만) — Python week_seq.cc_cat 과 같은 규칙
  const catOf = (a, b) => { const s = [];
    if ((a.primer || '') !== (b.primer || '')) s.push('하도');
    if ((a.code || a.top || a.color || '') !== (b.code || b.top || b.color || '')) s.push('상도');
    if ((a.codeBack || a.back || '') !== (b.codeBack || b.back || '')) s.push('이면');
    if (Math.abs((a.thk || 0) - (b.thk || 0)) > 0.03 || Math.abs((a.wdt || 0) - (b.wdt || 0)) > 5) s.push('치수');
    return s.join('+') || '사양 같음'; };
  function chgCC(a, b, l) {
    if (!a) return { m: 0, parts: [] };
    if (a.dummy || b.dummy) return { m: 0, parts: [] };
    if (R.trans && R.trans[l]) { const k = catOf(a, b), m = R.trans[l][k];
      if (m != null) return { m, parts: [{ c: `${k === '사양 같음' ? '새 주문(사양 같음)' : k + ' 바뀜'} — 1년 실적 평균`, m }] }; }
    if (a.block !== b.block) { const lb = R.block[`${l}|${a.block}>${b.block}`]; if (lb) return { m: lb, parts: [{ c: `블록 전환 ${R.blockNm[a.block]}→${R.blockNm[b.block]}`, m: lb }] }; }
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
    const parts = out.map((c) => ({ c: R.name[c] || c, m: (R.cond[c] || {})[l] || 0 })).filter((p) => p.m > 0);
    return { m: parts.reduce((s, p) => s + p.m, 0), parts };
  }
  const tgrp = (code) => { const G = (R.trtNo || {})['2CGL'] || []; for (let i = 0; i < G.length; i++) if (G[i].includes(code)) return i; return null; };
  const tfam = (code) => { const g = tgrp(code); return g != null ? 'g' + g : String(code || '').slice(0, 1); };
  function chgCG(a, b, l) {
    if (!a) return { m: 0, parts: [] };
    const fs = [];
    if (a.thick && b.thick) { const r = Math.max(a.thick, b.thick) / Math.min(a.thick, b.thick); const k = r > 1.6 ? '두께 1.6배 초과' : r > 1.35 ? '두께 1.35~1.6배' : r > 1.2 ? '두께 1.2~1.35배' : r > 1.1 ? '두께 1.1~1.2배' : null; if (k) fs.push(k); }
    const dw = (b.width || 0) - (a.width || 0);
    const k = dw > 200 ? '폭 넓어짐 200mm 초과' : dw > 100 ? '폭 넓어짐 100~200mm' : dw > 50 ? '폭 넓어짐 50~100mm' : dw > 5 ? '폭 넓어짐 ~50mm' : dw < -200 ? '폭 좁아짐 200mm 초과' : null; if (k) fs.push(k);
    const ta = a.trt || {}, tb = b.trt || {};
    if (a.trt && b.trt) {
      if (ta.cot && tb.cot && ta.cot !== tb.cot) fs.push(String(tb.cot) > String(ta.cot) ? '도금량 늘어남' : '도금량 줄어듦');
      if (ta.aft && tb.aft && ta.aft !== tb.aft) fs.push(tfam(ta.aft) !== tfam(tb.aft) ? '후처리 계열 바뀜' : '후처리 바뀜(같은 계열)');
      if (ta.oil && tb.oil && ta.oil !== tb.oil) fs.push(String(ta.oil)[0] !== String(tb.oil)[0] ? '도유 종류 바뀜' : '도유 양만 바뀜');
    }
    // 11/10: 실적은 바뀜의 0.7~1% 에만 더미 코일(10~65분) — 1년 실적에서 더미 비율 ≥ dummyP 인 바뀜만 '들어갈 때 길이'를 넣고, 나머지는 0분 + '더미 가능 n%'
    const pt = R.pt[l] || {}, P = R.dummyP || 50, parts = fs.map((f) => pt[f]).map((x, i) => x && (x.p >= P ? { c: `더미 ${fs[i]}(실적 ${n0(x.p)}%) · 약 ${n0(x.t)}t`, m: x.m }
      : x.p >= 5 ? { c: `더미 가능 ${fs[i]}(실적 ${n0(x.p)}%, 들어가면 ${n0(x.m)}분)`, m: 0, may: true } : null)).filter(Boolean);
    if (a.sur !== b.sur) parts.unshift({ c: `표면사상 ${a.sur} → ${b.sur}`, m: 0 });
    return { m: parts.reduce((s, p) => s + p.m, 0), parts };
  }
  const chg = (a, b, l) => (plant === 'cg' ? chgCG(a, b, l) : chgCC(a, b, l));
  const runMin = (x, l) => (plant === 'cg' ? x.run : x.t / Math.max((x.tph || {})[l] || 0.5, 0.5) * 60);

  // ───────── 시간 흘리기: 그날 처음 닿을 때 계획 휴지 → (컬러) 도료·PF 준비 전이면 기다림 → 전환 휴지 → 생산
  function sim(l) {
    const S = L[l], dn = (R.down || {})[l] || {}, used = {}, out = [];
    let c = tms(D.lines[l].from), prev = D.lines[l].prev0 || null;
    const touch = () => { for (;;) { const d = dayOf(c), x = dn[d]; if (!x || used[d]) return; used[d] = 1; const m = typeof x === 'number' ? x : x.min; out.push({ k: 'p', s: c, e: c + m, ev: x.ev || '휴지계획', d }); c += m; } };
    S.forEach((e, i) => {
      touch();
      if (e.k === 'g') { out.push({ k: 'g', i, e, s: c, e2: c + (+e.min || 0) }); c += +e.min || 0; return; }
      const x = J[e.id];
      if (plant === 'cc' && !x.fixed && x.ready) { const r = tms(x.ready + ' 07:00'); if (c < r) { out.push({ k: 'w', s: c, e: r, x }); c = r; touch(); } }
      const ch = chg(prev, x, l), ds = c; c += ch.m; const st = c, rm = runMin(x, l); c += rm;
      out.push({ k: 'j', i, x, ds, s: st, e: c, ch, rm }); prev = x;
    });
    const W0 = tms(D.w0), W1 = tms(D.w1);                         // 작업이 닿지 않은 날의 휴지계획도 보이게(예: 집중보수로 한 주 내내 정지)
    Object.keys(dn).sort().forEach((d) => {
      const b = tms(d + ' 07:00'), x = dn[d], m = typeof x === 'number' ? x : x.min;
      if (used[d] || b < W0 || b >= W1 || b + 1440 <= c) return;
      const st = Math.max(c, b); used[d] = 1; out.push({ k: 'p', s: st, e: st + m, ev: x.ev || '휴지계획', d }); c = st + m;
    });
    return out;
  }

  // ───────── 점검(브라우저 계산, 규칙 = 초안과 같은 자료 R)
  function checks() {
    const W0 = tms(D.w0), W1 = tms(D.w1), out = [];
    const add = (lv, kind, l, x, t) => out.push({ lv, kind, l, id: x && x.id, t });
    LINES[plant].forEach((l) => {
      const ev = sim(l), js = ev.filter((v) => v.k === 'j');
      const load = {};
      ev.forEach((v) => { if (v.k === 'w') return; const d = dayOf(v.s); const m = v.k === 'j' ? v.e - v.ds : (v.e2 || v.e) - v.s; load[d] = (load[d] || 0) + m; });   // 그날 시작한 작업·휴지 합(기다림 제외)
      Object.entries(load).forEach(([d, m]) => { if (m > 1440.5 && tms(d + ' 07:00') < W1) add('warn', '하루 1,440분 초과', l, null, `${l} ${dnm(d)} 그날 시작한 작업·휴지 ${n0(m)}분 — 다음날로 ${n0(m - 1440)}분 넘어감`); });
      js.forEach((v) => { if (v.e > W1) add('warn', '기간 초과', l, v.x, `${l} ${conOf(v.x)} 끝 ${md(iso(v.e))} ${hhmm(v.e)} — 기간 끝 ${md(iso(W1))} 07:00 초과`); });
      js.forEach((v) => {
        const x = v.x, end = dayOf(v.e), due = plant === 'cg' ? x.dlv : x.due;
        if (due && due < end) {
          if (due >= dayOf(tms(D.w0))) add('bad', '지연 예상', l, x, `${l} ${conOf(x)} 납기 ${md(due)} → 끝 ${dnm(end)}`);
          else add('info', '납기 경과', l, x, `${l} ${conOf(x)} 납기 ${md(due)}(오늘 전) — 끝 ${dnm(end)}`);
        }
      });
      if (plant === 'cg') checkCG(l, js, add); else checkCC(l, js, ev, add);
    });
    const ORD = { bad: 0, warn: 1, info: 2 };
    return out.sort((a, b) => ORD[a.lv] - ORD[b.lv]);
  }
  const conOf = (x) => (x.con || x.id) + (plant === 'cg' && x.n > 1 ? ` (${x.n}코일)` : '');
  function hitsCG(l, a, b) {
    const o = [];
    if (!a || !a.thick || !b.thick) return o;
    const lim = Math.min(a.thick, b.thick) < 0.4 ? ((R.thkStepThin || {})[l] ?? R.thkStep) : R.thkStep, d = Math.abs(a.thick - b.thick);
    if (d > lim + 1e-6) o.push(['bad', '두께 차', `두께 ${a.thick}→${b.thick} 차 ${d.toFixed(2)}mm(한도 ${lim}mm)`]);
    const r = Math.max(a.thick, b.thick) / Math.min(a.thick, b.thick);
    if (r > R.thkRatio + 1e-6) o.push(['bad', '두께비', `두께 ${r.toFixed(2)}배(한도 ${R.thkRatio}배)`]);
    const ga = a.grade, gb = b.grade;
    if (ga && gb && ga !== gb && ((R.matNo || {})[b.al] || []).some((p) => p.includes(ga) && p.includes(gb) && ga !== gb)) {
      const br = (R.matBridge || {})[[ga, gb].sort().join('|')];
      o.push(['bad', '재질 연속 불가', `재질 ${GR[ga] || ga} → ${GR[gb] || gb} 연속 불가${br ? ' — 사이에 ' + br : ''}`]);
    }
    if (a.ind && b.ind && a.ind !== b.ind && Math.min(a.thick, b.thick) < R.indThin) o.push(['bad', '내경', `내경 ${IND[a.ind] || a.ind} → ${IND[b.ind] || b.ind}(0.6t 미만)`]);
    const ta = (a.trt || {}).aft, tb = (b.trt || {}).aft, g = tgrp(ta);
    if (l === '2CGL' && g != null && ta !== tb && g === tgrp(tb)) o.push(['bad', '후처리 같은 층', `후처리 ${ta} → ${tb} 같은 층 바로 이음`]);
    const dw = b.width - a.width;
    if (dw > R.widenLim + 1e-6) o.push(['warn', '폭 넓힘 한도', `폭 ${n0(dw)}mm 넓어짐(한도 ${R.widenLim}mm) — 현장 협의`]);
    else if (Math.abs(a.thick - b.thick) < 1e-6 && dw > 5) o.push(['warn', '같은 두께 폭 넓힘', `같은 두께에서 폭 ${n0(dw)}mm 넓어짐`]);
    return o;
  }
  const famOf = (a) => ({ 'AL-STS': 'AL', 'AL-LG': 'AL' }[a] || a);
  function checkCG(l, js, add) {
    let prev = D.lines[l].prev0 || null, coil = 0;
    const lastG = {}, plan = (R.plan || {})[l] || {}, days = Object.keys(plan).sort();
    const mcDay = {}; days.forEach((d, i) => { if (i && plan[d].length && plan[days[i - 1]].length && plan[d].map(famOf).sort().join() !== plan[days[i - 1]].map(famOf).sort().join()) mcDay[d] = 1; });
    const dayCoil = {};
    js.forEach((v, i) => {
      const x = v.x, d = dayOf(v.s);
      hitsCG(l, prev, x).forEach(([lv, k, t]) => add(lv, k, l, x, `${l} ${conOf(x)} ${t}`));
      const g = tgrp((x.trt || {}).aft);
      if (l === '2CGL' && g != null) { const lg = lastG[g]; if (lg && lg.aft !== x.trt.aft && lg.i !== i - 1 && (v.s - lg.e < R.trtGap || coil - lg.c < R.trtGapN)) add('bad', '후처리 간격', l, x, `${l} ${conOf(x)} 후처리 ${lg.aft} → ${x.trt.aft} 같은 층 사이 ${coil - lg.c}코일·${n0(v.s - lg.e)}분(2코일·1시간 필요)`); lastG[g] = { aft: x.trt.aft, e: v.e, c: coil + x.n, i }; }
      const pf = plan[d];
      if (pf && pf.length && x.al && !pf.map(famOf).includes(famOf(x.al))) add('bad', '계획 강종 아님', l, x, `${l} ${conOf(x)} ${x.al} — ${dnm(d)} 계획 강종 ${pf.join('·')}(M/C 날짜 확인)`);
      if (mcDay[d]) { const k = dayCoil[d] || 0; if (k < R.mcHead && x.ge) add('bad', 'M/C 첫 10코일 가전', l, x, `${l} ${conOf(x)} ${dnm(d)} M/C 날 첫 ${R.mcHead}코일 안 가전(용도 ${x.usg || 'GE'})`); dayCoil[d] = k + x.n; }
      const sts = (R.sts || {})[l];
      if (sts && prev && prev.sur === sts && x.sur === sts && (x.thick > prev.thick + 1e-6 || (Math.abs(x.thick - prev.thick) < 1e-6 && x.width > prev.width + 5))) add('warn', 'AL-STS 순서', l, x, `${l} ${conOf(x)} AL-STS 안은 두꺼운·넓은 → 얇은·좁은(${prev.thick}×${n0(prev.width)} → ${x.thick}×${n0(x.width)})`);
      if (x.ent && x.ent > d) add('bad', '소재 입고 전 작업', l, x, `${l} ${conOf(x)} 소재 입고 ${md(x.ent)} 전 ${dnm(d)} 작업`);
      coil += x.n; prev = x;
    });
  }
  function checkCC(l, js, ev, add) {
    const blk = {};
    let pb = (D.lines[l].prev0 || {}).block;
    js.forEach((v) => {
      const x = v.x, d = dayOf(v.s);
      if (x.allow && !x.allow.includes(l)) add('bad', x.block === 'print' || /^PP[GKHF]/.test(x.item) ? '프린트는 4CCL' : '라인 규칙', l, x, `${l} ${x.con} ${x.item} — ${x.must ? '필수' : '가능'} 라인 ${x.allow.join('·')}`);
      if (l === '2CCL' && (!x.allow || x.allow.some((y) => y !== '2CCL'))) add('warn', '2CCL 최후', l, x, `2CCL ${x.con} ${x.item} — 다른 라인 ${(x.allow || ['1CCL', '3CCL', '4CCL']).filter((y) => y !== '2CCL').join('·')} 가능(2CCL 은 다른 라인이 찰 때만)`);
      if (pb && pb !== x.block) blk[d] = (blk[d] || 0) + 1;
      pb = x.block;
      if (x.fixed && x.ready && dayOf(v.s) < x.ready) add('bad', '도료·PF 입고 전 작업', l, x, `${l} ${x.con} 준비일 ${md(x.ready)} 전 ${dnm(d)} 작업(확정 대기열)`);
      if (x.smat) add('warn', '부자재 상태', l, x, `${l} ${x.con} 부자재 ${x.smat}`);
    });
    ev.filter((v) => v.k === 'w').forEach((v) => add('info', '도료·PF 기다림', l, v.x, `${l} ${v.x.con} 준비 ${md(v.x.ready)} 07:00 까지 ${hrs(v.e - v.s)} 기다림`));
    Object.entries(blk).forEach(([d, n]) => { if (n > 1) add('warn', '블록 왕복', l, null, `${l} ${dnm(d)} 블록(일반·PVS2·프린트) ${n}번 바뀜`); });
  }

  // ───────── 상태(편집본)
  function fromDraft() { L = {}; LINES[plant].forEach((l) => { L[l] = ((D.lines[l] || {}).seq || []).map((id) => (id && id.k === 'g' ? { k: 'g', min: +id.min || 0, note: id.note || '', sm: !!id.sm } : { k: 'j', id })); }); }   // 11/9: 초안에도 빈 시간(M/C 전 대기) 칸
  function fromSaved(p) {
    L = {}; const gone = [];
    LINES[plant].forEach((l) => { L[l] = ((p.lines || {})[l] || []).filter((e) => { if (e.k === 'g') return true; if (J[e.id]) return true; gone.push(e.id); return false; }).map((e) => (e.k === 'g' ? { k: 'g', min: +e.min || 0, note: e.note || '', sm: !!e.sm } : { k: 'j', id: e.id })); });
    return gone;
  }
  const placed = () => { const s = new Set(); LINES[plant].forEach((l) => L[l].forEach((e) => e.k === 'j' && s.add(e.id))); return s; };
  function poolOf() {
    const P = placed(), known = new Set((cur && cur.p && cur.p.known) || D.jobs.filter((x) => x.why === 'week').map((x) => x.id));
    return D.jobs.filter((x) => !P.has(x.id)).map((x) => ({ x, r: x.why === 'week' ? (known.has(x.id) ? 'out' : 'new') : x.why }));
  }
  function touch() { dirty = true; CK = null; draw(); }
  const where = (l, i) => L[l][i];
  function insertAtDay(l, e, d) {     // 그날 마지막 작업 뒤(그날 작업이 없으면 그 앞날 마지막 뒤)
    const ev = sim(l).filter((v) => v.k !== 'p' && v.k !== 'w');
    const lim = tms(d + ' 07:00') + 1440;                          // 11/10: 그날 시작해 다음날로 넘어가는 작업 뒤에 넣으면 하루 밀리던 문제 → 그날 안에 끝나는 마지막 작업 뒤
    let pos = 0; ev.forEach((v) => { if ((v.k === 'g' ? v.e2 : v.e) <= lim) pos = v.i + 1; });
    L[l].splice(pos, 0, e);
  }

  // ───────── 그리기
  // 11/10 사용자 '정보 칸 구분' → 사양 / 주문 / 입고 세 줄(앞에 이름표), 빠진 작업 목록도 같은 내용
  function chips(x) {
    const row = (k, h) => `<div class="wk3"><i>${k}</i><div>${h}</div></div>`;
    if (plant === 'cg') {
      const t = x.trt || {};
      return row('사양', `<span class="cp al">${esc(x.al || x.sur)}</span><span class="cp sz" title="두께 × 폭 × 길이(톤 환산)">${(+x.thick).toFixed(2)} × ${n0(x.width)} × ${n0(x.t * 1e6 / (x.thick * x.width * 7.85))}m</span>`
        + (t.cot ? `<span class="cp" title="도금량">${esc(t.cot)}</span>` : '') + (x.trt ? `<span class="cp" title="후처리">${esc(t.aft || '후처리 없음')}</span>` : '')
        + (x.grade ? `<span class="cp" title="재질(열처리 등급)">${esc(GR[x.grade] || x.grade)}</span>` : '') + (x.spec ? `<span class="cp" title="주문 사양">${esc(x.spec)}</span>` : '') + (x.ge ? '<span class="cp wr" title="용도 가전">가전</span>' : ''))
        + row('주문', (x.grp && x.grp !== '미상' ? `<span class="cp" title="판매그룹">${esc(x.grp)}</span>` : '')
          + `<span class="cp" title="담당자 - 목적지(내수는 고객사)">${esc(x.man || '담당 미상')} - ${esc(x.dst || '목적지 미상')}</span><span class="ib"><em class="lb">입고</em><span class="cp${x.ent && x.ent > TODAY ? ' wr' : ''}" title="소재 입고일">소재 ${x.ent ? md(x.ent) : '-'}</span></span>`);
    }
    if (x.dummy) return row('사양', `<span class="cp wr" title="MES 1030 더미 지시 — 시간 = MES 작업시간">더미 0.5 × 1,000</span>`);
    const dtm = (v) => (v ? String(v).slice(5, 16).replace('-', '/').replace(/ 00:00$/, '') : '');   // 시각 00:00 = 날짜만 있는 값   // 11/9: 풀 코드 8자리·담당자-목적지·도료/PF 입고 일시
    const fut = (v) => v && new Date(String(v).replace(' ', 'T')) > new Date();
    const st = (at, s) => (at ? dtm(at) : s === 'F' ? '입고완료' : s ? '입고대기(일정 없음)' : '-');
    return row('사양', (x.code ? `<span class="cp cl" title="상도 풀 코드">${esc(x.code)}</span>` : `<span class="cp cl wr" title="풀 코드 없음(주문 상세 자료 대기) — 도료 종류·색상번호">${esc(x.color)}</span>`)
        + (x.codeBack ? `<span class="cp" title="이면 풀 코드">이면 ${esc(x.codeBack)}</span>` : '')
        + `<span class="cp sz" title="두께 × 폭 × 잔량 길이">${(+x.thk).toFixed(2)} × ${n0(x.wdt)}${x.len ? ' × ' + n0(x.len) + 'm' : ''}</span>` + (x.block !== 'general' ? `<span class="cp wr">${esc(R.blockNm[x.block])}</span>` : ''))
      + row('주문', `<span class="cp" title="판매그룹">${esc(x.g)}</span><span class="cp" title="담당자 - 목적지(내수는 고객사)">${esc(x.man || '담당 미상')} - ${esc(x.dst || '목적지 미상')}</span><span class="ib"><em class="lb">입고</em><span class="cp${fut(x.paintAt) ? ' wr' : ''}" title="도료 입고(예정) 일시">도료 ${st(x.paintAt, x.paintSts)}</span>`
        + (x.pfNeed ? `<span class="cp${fut(x.pfAt) ? ' wr' : ''}" title="PF 입고(예정) 일시">PF ${st(x.pfAt, x.pfSts)}</span>` : '') + '</span>');
  }
  const MO = (i) => `<button type="button" class="mo" data-mo="${i}" aria-haspopup="dialog" aria-label="순서 바꾸기·빼기">⋯</button>`;   // 좁은 화면: 줄 단추 다섯 개 대신 하나
  function jobRow(l, v, days, n) {
    const x = v.x, bad = CK && CK.some((c) => c.id === x.id && c.l === l && c.lv === 'bad');
    const due = plant === 'cg' ? x.dlv : x.due;
    const tag = plant === 'cg' ? (x.issued ? '<span class="cp fx" title="작업지시 완료(1030)">지시</span>' : '')
      : (x.fixed ? '<span class="cp kw" title="MES 1030 확정 작업지시 — 작업대기">작업대기</span>' : '<span class="cp kj" title="MES 1020 소재 매치 — 작업지시 확정 전">지시대기</span>');   // 11/12 사용자 '납기 옆에 작업대기/지시대기 구분'   // 11/10 사용자 '1030 #순번 · 1020 미확정 표시 지워라'
    const sub = plant === 'cg' ? `${x.n > 1 ? x.n + '코일 · ' : ''}소재 ${esc(x.raws[0])}${x.n > 1 ? ' 외' : ''}${x.req ? ' · 예정 ' + md(x.req) : ''}` : `<b title="품명(제품 코드 ${esc(x.pdt)})">${esc(x.item || x.pdt)}</b>${x.ready && x.ready > TODAY ? '<div class="wr" title="도료·PF 입고 뒤">' + md(x.ready) + '부터 가능</div>' : ''}`;
    const lsel = plant === 'cc' ? `<select data-a="line" data-i="${v.i}" title="다른 라인으로">${LINES.cc.map((y) => `<option${y === l ? ' selected' : ''}>${y}</option>`).join('')}</select>` : '';
    return `<tr class="j${x.fixed || x.issued ? ' fx' : ''}${hl === x.id ? ' hl' : bad ? ' bad' : ''}" draggable="true" data-i="${v.i}" data-id="${esc(x.id)}">`
      + `<td class="hd" title="끌어서 옮기기">⋮⋮</td><td class="no">${n}</td>`
      + `<td class="tm"><b>${hhmm(v.s)}</b>–${hhmm(v.e)}${dayOf(v.e) !== dayOf(v.s) ? '<div class="sub">끝 다음날</div>' : ''}</td>`
      + `<td class="c-con"><div class="cn">${esc(x.con || '계약 미연결')}</div><div class="cd">${tag}${due ? `<span class="${due < dayOf(v.e) ? 'cp bd' : 'cp'}" title="납기">납기 ${md(due)}</span>` : ''}</div><div class="sub">${sub}</div></td>`
      + `<td class="c-sp"><div class="sp">${chips(x)}</div></td>`
      + (plant === 'cg' ? `<td class="nm"><b>${n1(x.t)}t</b> · ${n0(v.rm)}분<div class="sub">${n1(x.tph)}t/h</div></td>`
        : `<td class="nm" title="잔량 톤 · 시간 = 길이 ÷ L/S(26년 1월~ 실적) × 라인 보정"><b>${n1(x.t)}t</b><div class="sub">${n0(v.rm)}분${x.ls && x.ls[l] && !x.dummy ? ` · L/S ${n0(x.ls[l])}` : ''}</div></td>`)

      + `<td class="ac"><span class="acd"><button data-a="up" data-i="${v.i}" title="위로">↑</button><button data-a="dn" data-i="${v.i}" title="아래로">↓</button>`
      + `<select data-a="day" data-i="${v.i}" title="다른 날로"><option value="">날</option>${days.map((d) => `<option value="${d}">${dnm(d)}</option>`).join('')}</select>`
      + `${lsel}<button data-a="gap" data-i="${v.i}" title="이 작업 앞에 휴지·더미 넣기">+휴지</button><button class="x" data-a="del" data-i="${v.i}" title="빼기(빠진 작업으로)">✕</button></span>${MO(v.i)}</td></tr>`;
  }
  function draw() {
    const W0 = tms(D.w0), W1 = tms(D.w1), days = Array.from({ length: Math.max(1, Math.round((W1 - W0) / 1440)) }, (_, i) => dayOf(W0 + i * 1440));   // 11/10 사용자 '수요일로 자르지 마' — 오늘부터 1030 확정이 끝날 때까지
    $('ws-wk').textContent = `${dnm(days[0])} ~ ${dnm(days[days.length - 1])}`;
    $('ws-wk').title = `${iso(W0)} ~ ${iso(W1)} (하루 = 07시 ~ 다음날 07시)`;
    const v = $('ws-ver');
    if (dirty) { v.className = 'ws-ver ed'; v.textContent = '수정 · 저장 전'; }
    else if (cur && cur.state !== 'reset') { v.className = 'ws-ver ' + (cur.state === 'confirm' ? 'cf' : 'sv'); v.textContent = `${cur.state === 'confirm' ? '확정' : '저장'} v${cur.v} · ${cur.who} · ${kst(cur.at)}`; }
    else { v.className = 'ws-ver'; v.textContent = `초안 · ${UI.fmtDateTime(D.built)} 자료`; }
    $('ws-plant').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === plant)));
    // 라인 요약(결론): 점검 위반은 늘 계산(자세한 목록은 '점검'을 눌렀을 때만), 오늘 순서 앞 3건
    const CKA = CK || checks(), today = dayOf(Math.max(W0, tms(D.now ? String(D.now).replace('T', ' ') : iso(W0))));
    $('ws-kpis').innerHTML = LINES[plant].map((l) => {
      const ev = sim(l), js = ev.filter((q) => q.k === 'j' && q.s < W1);
      const run = js.reduce((s, q) => s + q.rm, 0), ch = js.reduce((s, q) => s + q.ch.m, 0);
      const pl = ev.filter((q) => q.k === 'p' && q.s < W1).reduce((s, q) => s + Math.min(q.e, W1) - q.s, 0) + ev.filter((q) => q.k === 'g' && q.s < W1).reduce((s, q) => s + (q.e2 - q.s), 0);
      const wt = ev.filter((q) => q.k === 'w' && q.s < W1).reduce((s, q) => s + Math.min(q.e, W1) - q.s, 0);
      const end = ev.length ? Math.max(...ev.map((q) => q.e2 || q.e)) : tms(D.lines[l].from), left = W1 - end;
      const nb = CKA.filter((c) => c.l === l && c.lv === 'bad').length;
      const tj = ev.filter((q) => q.k === 'j' && dayOf(q.s) === today).slice(0, 3), nT = ev.filter((q) => q.k === 'j' && dayOf(q.s) === today).length;
      const spc = (x) => (plant === 'cg' ? `${(+x.thick).toFixed(2)}×${n0(x.width)} ${esc(x.al || '')}` : `${esc(x.item || '')} ${esc(x.code || x.color || '')}`);
      const td = tj.length ? `<div class="td"><em>오늘 ${md(today)} · ${nT}건</em>${tj.map((q) => `<div title="${esc(conOf(q.x))}"><b>${hhmm(q.s)}</b>${esc(q.x.con || q.x.id)} · ${spc(q.x)}</div>`).join('')}</div>` : `<div class="td"><em>오늘 ${md(today)}</em><div>${D.lines[l] && D.lines[l].stop ? esc(D.lines[l].stop.note || '휴지') : '작업 없음'}</div></div>`;
      return `<button type="button" class="ws-k" data-l="${l}" aria-pressed="${l === line}"><div class="ln">${l}</div><div class="v">${js.length}<small>건</small> ${n0(js.reduce((s, q) => s + q.x.t, 0))}<small>t</small></div>`
        + `<div class="b">생산 <b>${hrs(run)}</b> · 전환 휴지 <b>${hrs(ch)}</b></div><div class="b">계획·직접 휴지 <b>${hrs(pl)}</b>${wt ? ` · 기다림 <b>${hrs(wt)}</b>` : ''}</div>`
        + `<div class="b">${left >= 0 ? `남는 시간 <b>${hrs(left)}</b>` : `<span class="w">기간 끝 ${hrs(-left)} 넘침</span>`} · 점검 ${nb ? `<span class="w">위반 ${nb}</span>` : '<span class="ok">위반 0</span>'}</div>${td}</button>`;
    }).join('');
    $('ws-kpis').querySelectorAll('.ws-k').forEach((b) => (b.onclick = () => { line = b.dataset.l; draw(); }));
    // 순서 표(요일별)
    const ev = sim(line);
    let h = '', n = 0, curD = null;
    const dsum = {};
    ev.forEach((q) => { const d = q.s >= W1 ? 'over' : dayOf(q.s); const o = dsum[d] = dsum[d] || { n: 0, t: 0, run: 0, dn: 0, seg: [] }; if (q.k === 'j') { o.n++; o.t += q.x.t; o.run += q.rm; o.dn += q.ch.m; } else o.dn += (q.e2 || q.e) - q.s; });
    const bar = (d) => { const b0 = tms(d + ' 07:00'); const seg = (a, z, c) => { const x0 = Math.max(0, a - b0), x1 = Math.min(1440, z - b0); return x1 > x0 ? `<i class="${c}" style="left:${(x0 / 14.4).toFixed(2)}%;width:${((x1 - x0) / 14.4).toFixed(2)}%"></i>` : ''; };
      return `<div class="dbar">${ev.map((q) => (q.k === 'j' ? seg(q.ds, q.s, 'd') + seg(q.s, q.e, 'r') : seg(q.s, q.e2 || q.e, q.k === 'p' ? (/샘플|test|시험/i.test(q.ev) ? 'p sm' : 'p') : q.k === 'g' ? (q.e.sm ? 'p sm' : 'd') : 'g'))).join('')}</div>`; };
    const dayHead = (d) => { const o = dsum[d] || { n: 0, t: 0, run: 0, dn: 0 }; const over = o.run + o.dn > 1440.5;
      return `<tr class="dh" data-d="${d}"><td colspan="7"><div class="dhh"><b>${d === 'over' ? `기간 끝(${md(iso(W1))} 07:00) 초과` : dnm(d)}</b><span>작업 ${o.n}건 · ${n0(o.t)}t</span><span>생산 ${n0(o.run)}분 · 휴지 ${n0(o.dn)}분</span>${over && d !== 'over' ? `<em title="그날 시작한 작업·휴지 합이 1,440분 초과">다음날로 ${n0(o.run + o.dn - 1440)}분</em>` : ''}</div>${d === 'over' ? '' : bar(d)}</td></tr>`; };
    const shown = new Set();
    ev.forEach((q) => {
      const d = q.s >= W1 ? 'over' : dayOf(q.s);
      if (d !== curD) { days.filter((x) => x > (curD || '') && x < d && !shown.has(x)).forEach((x) => { h += dayHead(x); shown.add(x); }); h += dayHead(d); shown.add(d); curD = d; }
      if (q.k === 'p') { const sm = /샘플|test|시험/i.test(q.ev), nm = q.ev === 'plan' ? '휴지계획' : q.ev;   // 11/10 사용자 '샘플 부분 잘 보이게'
        h += `<tr class="ev pz${sm ? ' sm' : ''}"><td></td><td></td><td class="tm">${q.e - q.s >= 1440 ? '<b>종일</b>' : `<b>${hhmm(q.s)}</b>–${hhmm(q.e)}`}</td><td colspan="4"><span class="pk">${esc(nm)}</span> ${sm ? '' : '계획 휴지 '}<b>${hrs(q.e - q.s)}</b>${sm ? ' — 이 시간엔 생산 작업 안 넣음' : ''}</td></tr>`; }
      else if (q.k === 'w') h += `<tr class="ev w"><td></td><td></td><td class="tm"><b>${hhmm(q.s)}</b>–${hhmm(q.e)}</td><td colspan="4">기다림 <b>${hrs(q.e - q.s)}</b> · ${esc(q.x.con)} 도료·PF 준비 ${md(q.x.ready)} 07:00</td></tr>`;
      else if (q.k === 'g' && q.e.sm) h += `<tr class="ev g sm" draggable="true" data-i="${q.i}"><td class="hd" title="끌어서 옮기기">⋮⋮</td><td></td><td class="tm"><b>${hhmm(q.s)}</b>–${hhmm(q.e2)}</td><td colspan="3"><span class="pk">${esc(q.e.note || '샘플')}</span> <input type="number" min="0" max="2880" step="10" data-a="gmin" data-i="${q.i}" value="${q.e.min}" title="시간(분) 바꾸기">분 <span class="hint">— 끌거나 ↑↓로 시각을 옮기고, 분을 바꿀 수 있음 · 이 시간엔 생산 안 넣음</span></td><td class="ac"><span class="acd"><button data-a="up" data-i="${q.i}" title="앞으로">↑</button><button data-a="dn" data-i="${q.i}" title="뒤로">↓</button><select data-a="day" data-i="${q.i}" title="다른 날로"><option value="">날</option>${days.map((d) => `<option value="${d}">${dnm(d)}</option>`).join('')}</select><button class="x" data-a="del" data-i="${q.i}" title="빼기">✕</button></span>${MO(q.i)}</td></tr>`;
      else if (q.k === 'g') h += `<tr class="ev g" draggable="true" data-i="${q.i}"><td class="hd">⋮⋮</td><td></td><td class="tm"><b>${hhmm(q.s)}</b>–${hhmm(q.e2)}</td><td colspan="3">직접 넣은 휴지·더미 <input type="number" min="0" max="2880" step="5" data-a="gmin" data-i="${q.i}" value="${q.e.min}">분 <input class="nt" data-a="gnote" data-i="${q.i}" placeholder="사유(롤 교체·더미 등)" value="${esc(q.e.note || '')}"></td><td class="ac"><span class="acd"><button data-a="up" data-i="${q.i}" title="앞으로">↑</button><button data-a="dn" data-i="${q.i}" title="뒤로">↓</button><button class="x" data-a="del" data-i="${q.i}" title="빼기">✕</button></span>${MO(q.i)}</td></tr>`;
      else {
        n++;
        if (q.ch.m >= 1) h += `<tr class="ch"><td colspan="7">휴지 <b>${n0(q.ch.m)}분</b> ${hhmm(q.ds)}부터${q.ch.parts.filter((p) => p.m >= 0.5 || /표면사상|블록/.test(p.c)).map((p) => ` · ${esc(p.c)}${p.m >= 0.5 ? ' ' + n0(p.m) + '분' : ''}`).join('')}</td></tr>`;
        else if (q.ch.parts.some((p) => p.may)) h += `<tr class="ch may"><td colspan="7">${q.ch.parts.filter((p) => p.may).map((p) => esc(p.c)).join(' · ')} — 시간엔 안 넣음</td></tr>`;
        h += jobRow(line, q, days, n);
      }
    });
    days.filter((x) => !shown.has(x)).forEach((x) => { h += dayHead(x); });
    if (!ev.length) h += `<tr><td colspan="7" class="muted">이 라인에 기간 안 작업이 없습니다${D.lines[line].stop ? ' — ' + esc(D.lines[line].stop.note || '') : ''}. 오른쪽 빠진 작업에서 넣을 수 있습니다.</td></tr>`;
    $('ws-tbl').innerHTML = `<colgroup><col style="width:30px"><col style="width:44px"><col style="width:118px"><col style="width:196px"><col><col style="width:${plant === 'cc' ? 104 : 134}px"><col style="width:${plant === 'cc' ? 176 : 150}px"></colgroup>` + h;
    drawPool(); drawCk(); bind(); fit();
  }
  // 본문이 좁으면(820px 미만) 묶음 배치(.cmp) · 날짜 머리줄 고정 위치 = 위 막대 높이
  function fit() {
    const m = $('ws-main'); if (!m || !m.clientWidth) return;
    m.classList.toggle('cmp', m.clientWidth < 820);
    pin();
  }
  // 위 막대가 화면에 보이는 만큼만 띄움(막대가 같이 올라가 버리는 화면에서는 0)
  let pinV = -1;
  function pin() {
    const m = $('ws-main'), tb = document.querySelector('.topbar'); if (!m) return;
    const v = tb && tb.offsetHeight ? Math.max(0, Math.round(tb.getBoundingClientRect().bottom)) : 0;
    if (v !== pinV) { pinV = v; m.style.setProperty('--ws-top', v + 'px'); }
  }
  let fitT = null; addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fit, 120); });
  let pinQ = false; addEventListener('scroll', () => { if (pinQ) return; pinQ = true; requestAnimationFrame(() => { pinQ = false; pin(); }); }, { passive: true });
  function drawPool() {
    // 11/10 사용자 '주 시작 전 생산 예정·다른 라인 작업까지 굳이 빠진 작업이라고 해야 되냐' → 이 라인 것만, 이번 주에 넣을 수 있는 것만(주 시작 전에 끝나는 작업은 뺌)
    const P = poolOf().filter((p) => p.x.line === line && p.r !== 'pre');
    const G = {};
    P.forEach((p) => { (G[p.r] = G[p.r] || []).push(p.x); });
    const ord = ['out', 'new', 'over', 'later'];
    const nm = POOLNM;
    // 11/10 사용자 '왜 못 들어가냐 — 납기·부원료·규칙 뭐냐' → 작업마다 이유: 부원료 입고 · 라인 규칙 · 시간 부족(라인 정지·꽉 참) + 넣을 수 있는 다른 라인
    const W1 = tms(D.w1), left = {}, stopD = {};
    LINES[plant].forEach((l) => { const ev = sim(l); const end = ev.length ? Math.max(...ev.map((q) => q.e2 || q.e)) : tms(D.lines[l].from); left[l] = W1 - Math.max(end, tms(D.lines[l].from));
      const dd = Object.entries((R.down || {})[l] || {}).filter(([, v]) => (v.min || v) >= 1440); stopD[l] = dd.length ? `${md(dd[0][0])}~${md(dd[dd.length - 1][0])} ${[...new Set(dd.flatMap(([, v]) => (v.ev === 'plan' ? '휴지계획' : String(v.ev)).split('·')))].join('·')} ${dd.length}일` : ''; });
    const why = (x, r) => {
      if (plant !== 'cc' || r !== 'over') return '';
      const out = [];
      if (x.ready && x.ready >= dayOf(W1)) out.push(`<b class="wr">부원료 대기</b> 도료·PF ${md(x.ready)} 입고`);
      else if (x.allow && !x.allow.includes(line)) out.push(`<b class="wr">라인 규칙</b> ${x.allow.join('·')}만 가능(MES 는 ${line} 배정)`);
      else out.push(`<b>시간 부족</b> ${stopD[line] ? line + ' ' + stopD[line] + ' 정지 → ' : ''}기간 안 ${line} 시간을 앞 작업이 다 씀`);
      const alt = (x.allow || LINES.cc).filter((l) => l !== line && left[l] > runMin(x, l) + 60);
      if (alt.length) out.push(`→ ${alt.map((l) => `${l}(남는 ${hrs(left[l])})`).join(' · ')} 에 넣을 수 있음`);
      else if (x.allow && x.allow.length === 1) out.push(`→ ${x.allow[0]} 전용${/^PP[GKHF]/.test(x.item) ? '(프린트)' : ''} — 다른 라인 불가${x.allow[0] !== line && stopD[x.allow[0]] ? `, ${x.allow[0]} ${stopD[x.allow[0]]} 정지` : ''}`);
      if (x.due && x.due < TODAY) out.push(`<b class="wr">납기 ${md(x.due)} 경과</b>`); else if (x.due && x.due < dayOf(W1)) out.push(`<b class="wr">납기 ${md(x.due)}</b> 기간 내 미생산 시 지연`);
      return `<div class="why">${out.join(' · ')}</div>`;
    };
    const was = $('ws-pool').querySelector('details'), op = was ? was.open : false, sub = {};
    $('ws-pool').querySelectorAll('.pl-g').forEach((d) => { sub[d.dataset.k] = d.open; });
    $('ws-pool').innerHTML = `<details${op ? ' open' : ''}><summary>${line} 기간 내 미편성 작업 <span>${P.length}건 · ${n0(P.reduce((s, p) => s + p.x.t, 0))}t — 끌어다 놓거나 '넣기'</span></summary><div class="pl-cols">` + ord.filter((k) => G[k]).map((k) => `<details class="pl-g" data-k="${k}"${(k in sub ? sub[k] : k === 'out' || k === 'new' || k === 'over') ? ' open' : ''}><summary>${nm[k]} <span>${G[k].length}건 · ${n0(G[k].reduce((s, x) => s + x.t, 0))}t</span></summary><div class="pl-body">`
      + G[k].slice(0, 300).map((x) => `<div class="pl-i" draggable="true" data-id="${esc(x.id)}"><div><span class="cn">${esc(x.con || x.id)}</span>${plant === 'cc' && x.item ? ' <b>' + esc(x.item) + '</b>' : ''}<span class="sub"> · ${n1(x.t)}t${plant === 'cc' && x.len ? ' / ' + n0(x.len) + 'm' : ''}${plant === 'cg' ? (x.n > 1 ? ' · ' + x.n + '코일' : '') + (x.req ? ' · 예정 ' + md(x.req) : '') : (x.ready && x.ready > TODAY ? ' · ' + md(x.ready) + '부터 가능' : '')}${(plant === 'cg' ? x.dlv : x.due) ? ' · 납기 ' + md(plant === 'cg' ? x.dlv : x.due) : ''}</span>${why(x, k)}<div class="sp">${chips(x)}</div></div><button data-a="add" data-id="${esc(x.id)}">넣기</button></div>`).join('')
      + (G[k].length > 300 ? `<div class="sub">외 ${G[k].length - 300}건</div>` : '') + '</div></details>').join('') + '</div></details>';
  }
  function drawCk() {
    if (!CK) { $('ws-ck').innerHTML = ''; return; }
    const by = {}; CK.forEach((c) => { (by[c.kind] = by[c.kind] || { lv: c.lv, xs: [] }).xs.push(c); });
    const LV = { bad: ['cp bd', '위반'], warn: ['cp wr', '주의'], info: ['cp', '참고'] };
    const nb = CK.filter((c) => c.lv === 'bad').length;
    $('ws-ck').innerHTML = `<section class="ck"><h3>점검 결과 ${nb ? `— 위반 ${nb}건` : '<span class="ck-ok">— 위반 없음</span>'}</h3>`
      + `<div class="ck-s">${Object.entries(by).map(([k, o]) => `<span class="${LV[o.lv][0]}">${esc(k)} ${o.xs.length}</span>`).join('')}</div>`
      + Object.entries(by).map(([k, o]) => `<details class="ck-g"${o.lv === 'bad' && o.xs.length <= 12 ? ' open' : ''}><summary>${LV[o.lv][1]} · ${esc(k)} ${o.xs.length}건</summary><ul>${o.xs.slice(0, 80).map((c) => `<li>${esc(c.t)}${c.id ? ` <a data-go="${esc(c.id)}" data-l="${c.l}">보기</a>` : ''}</li>`).join('')}${o.xs.length > 80 ? `<li>외 ${o.xs.length - 80}건</li>` : ''}</ul></details>`).join('') + '</section>';
    $('ws-ck').querySelectorAll('a[data-go]').forEach((a) => (a.onclick = () => { line = a.dataset.l; hl = a.dataset.go; draw(); const r = document.querySelector(`tr.j[data-id="${CSS.escape(hl)}"]`); if (r) r.scrollIntoView({ block: 'center' }); }));
  }
  // 줄 동작(넓은 화면 단추 · 좁은 화면 ⋯ 가 같이 씀) — 바뀌었으면 true
  function act(a, i, val) {
    const S = L[line];
    if (a === 'up' && i > 0) [S[i - 1], S[i]] = [S[i], S[i - 1]];
    else if (a === 'dn' && i < S.length - 1) [S[i + 1], S[i]] = [S[i], S[i + 1]];
    else if (a === 'del') S.splice(i, 1);
    else if (a === 'gap') { const m = +prompt('넣을 휴지·더미 시간(분)', '30'); if (!(m > 0)) return false; S.splice(i, 0, { k: 'g', min: Math.min(2880, m), note: '' }); }
    else if (a === 'day' && val) { const [e] = S.splice(i, 1); insertAtDay(line, e, val); }
    else if (a === 'line' && val && val !== line) {
      const x = S[i].k === 'j' && J[S[i].id];
      if (x && x.allow && !x.allow.includes(val) && !confirm(`${val} 은 이 작업의 가능 라인(${x.allow.join('·')})이 아닙니다. 그래도 옮길까요?`)) return false;
      const [e] = S.splice(i, 1); L[val].push(e);
    }
    else return false;
    touch(); return true;
  }
  // 좁은 화면 ⋯ : 위로·아래로·휴지 넣기·빼기·다른 날·다른 라인(컬러)
  function sheet(i) {
    const old = document.querySelector('.ws-sh'); if (old) old.remove();
    const S = L[line], e = S[i]; if (!e) return;
    const v = sim(line).find((q) => (q.k === 'j' || q.k === 'g') && q.i === i), job = e.k === 'j', x = job ? J[e.id] : null;
    const W0 = tms(D.w0), W1 = tms(D.w1), days = Array.from({ length: Math.max(1, Math.round((W1 - W0) / 1440)) }, (_, k) => dayOf(W0 + k * 1440)), cd = v ? dayOf(v.s) : '';
    const bt = (a, t, o = {}) => `<button type="button" data-sa="${a}"${o.v ? ` data-v="${esc(o.v)}"` : ''}${o.off ? ' disabled' : ''} class="${o.c || ''}">${t}</button>`;
    const box = document.createElement('div'); box.className = 'ws-sh';
    box.innerHTML = `<div class="ws-shb" role="dialog" aria-modal="true" aria-label="줄 동작"><h3>${esc(job ? (x.con || '계약 미연결') : (e.note || '직접 넣은 휴지'))}</h3><p>${line}${v ? ` · ${dnm(cd)} ${hhmm(v.s)}–${hhmm(v.e2 || v.e)}` : ''}${job ? ` · ${n1(x.t)}t` : ` · ${n0(e.min)}분`}</p>`
      + `<div class="g">${bt('up', '↑ 위로', { off: i <= 0 })}${bt('dn', '↓ 아래로', { off: i >= S.length - 1 })}${job ? bt('gap', '+ 휴지 넣기') : ''}${bt('del', '✕ 빼기', { c: 'x' })}</div>`
      + (job || e.sm ? `<div class="lb">다른 날로</div><div class="g d">${days.map((d) => bt('day', dnm(d), { v: d, c: d === cd ? 'on' : '' })).join('')}</div>` : '')
      + (job && plant === 'cc' ? `<div class="lb">다른 라인으로</div><div class="g d">${LINES.cc.map((y) => bt('line', y, { v: y, off: y === line, c: y === line ? 'on' : '' })).join('')}</div>` : '')
      + '<button type="button" class="cl" data-sa="close">닫기</button></div>';
    const close = () => { box.remove(); removeEventListener('keydown', key); };
    const key = (ev) => { if (ev.key === 'Escape') close(); };
    box.onclick = (ev) => {
      if (ev.target === box) return close();
      const b = ev.target.closest('button[data-sa]'); if (!b) return;
      const a = b.dataset.sa; if (a === 'close') return close();
      const ok = act(a, i, b.dataset.v);
      if (ok && (a === 'up' || a === 'dn')) { removeEventListener('keydown', key); sheet(a === 'up' ? i - 1 : i + 1); } else close();   // 위·아래는 이어서 누를 수 있게 그대로 둠
    };
    addEventListener('keydown', key); document.body.appendChild(box);
    const f = box.querySelector('button:not(:disabled)'); if (f) f.focus();
  }
  let drag = null;
  function bind() {
    const T = $('ws-tbl'), S = L[line];
    T.querySelectorAll('[data-a]').forEach((el) => {
      const a = el.dataset.a, i = +el.dataset.i;
      if (a === 'gmin' || a === 'gnote') { el.onchange = () => { if (a === 'gmin') S[i].min = Math.max(0, +el.value || 0); else S[i].note = el.value.slice(0, 80); touch(); }; return; }
      if (a === 'day' || a === 'line') { el.onchange = () => act(a, i, el.value); return; }
      el.onclick = () => act(a, i);
    });
    T.querySelectorAll('[data-mo]').forEach((b) => (b.onclick = () => sheet(+b.dataset.mo)));
    T.querySelectorAll('tr[draggable]').forEach((tr) => {
      tr.ondragstart = (e) => { drag = { from: 'seq', i: +tr.dataset.i }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'x'); } catch (er) { /* 무시 */ } };
    });
    T.querySelectorAll('tr.j, tr.ev.g, tr.dh').forEach((tr) => {
      tr.ondragover = (e) => { if (!drag) return; e.preventDefault(); tr.classList.add('dragover'); };
      tr.ondragleave = () => tr.classList.remove('dragover');
      tr.ondrop = (e) => {
        e.preventDefault(); tr.classList.remove('dragover'); if (!drag) return;
        let tgt, el;
        if (tr.classList.contains('dh')) { const d = tr.dataset.d; const f = sim(line).filter((v) => v.k === 'j' || v.k === 'g').find((v) => (d === 'over' ? v.s >= tms(D.w1) : dayOf(v.s) >= d)); tgt = f ? f.i : S.length; }
        else tgt = +tr.dataset.i;
        if (drag.from === 'seq') { if (drag.i === tgt) { drag = null; return; } el = S.splice(drag.i, 1)[0]; if (drag.i < tgt) tgt--; } else el = { k: 'j', id: drag.id };
        S.splice(tgt, 0, el); drag = null; touch();
      };
    });
    const P = $('ws-pool');
    P.querySelectorAll('.pl-i').forEach((d) => { d.ondragstart = (e) => { drag = { from: 'pool', id: d.dataset.id }; try { e.dataTransfer.setData('text/plain', 'x'); } catch (er) { /* 무시 */ } }; });
    P.querySelectorAll('button[data-a="add"]').forEach((b) => (b.onclick = () => {
      const x = J[b.dataset.id], d = prompt(`넣을 날 — 예: ${md(dayOf(tms(D.w0)))}`, md(dayOf(tms(D.w0))));
      if (d == null) return;
      const m = String(d).match(/(\d+)\/(\d+)/); const day = m ? `${D.week.slice(0, 4)}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : dayOf(tms(D.w0));
      insertAtDay(plant === 'cc' ? line : x.line, { k: 'j', id: x.id }, day); touch();
    }));
    P.ondragover = (e) => { if (drag && drag.from === 'seq') e.preventDefault(); };
    P.ondrop = (e) => { e.preventDefault(); if (drag && drag.from === 'seq') { S.splice(drag.i, 1); drag = null; touch(); } };
  }

  // ───────── 저장소(Supabase cgl_week_seq, 암호화 · 추가만)
  const kst = (s) => (s ? UI.fmtDateTime(new Date(s).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)) : '');
  const wkFrom = () => { const d = new Date(D.week + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); };
  async function loadVers() {
    VERS = [];
    try {
      const r = await fetch(`${API}?select=id,at,who,state,payload&plant=eq.${plant}&week=gte.${wkFrom()}&order=id.desc&limit=200`, { headers: H });   // 11/10: 수요일 07시에 저장 키가 바뀌어 저장·확정본이 사라지던 문제 → 지난 키까지, 최근 200개
      if (!r.ok) throw new Error('저장소 읽기 ' + r.status);
      let v = 0;
      for (const x of (await r.json()).reverse()) { try { const p = await GP.decryptJSON(JSON.parse(x.payload), PW); VERS.push({ id: x.id, at: x.at, who: x.who, state: x.state, p, v: x.state === 'reset' ? null : ++v }); } catch (e) { /* 암호 다른 줄 */ } }
    } catch (e) { $('ws-res').textContent = e.message; }
    $('ws-vers').innerHTML = '<option value="">버전 고르기</option><option value="draft">초안(자료 ' + esc(UI.fmtDateTime(D.built)) + ')</option>' + VERS.filter((x) => x.v).slice().reverse().map((x) => `<option value="${x.id}">v${x.v} ${x.state === 'confirm' ? '확정' : '저장'} · ${esc(x.who)} · ${kst(x.at)}</option>`).join('');
  }
  function useVer(x, msg) {
    cur = x; dirty = false; CK = null; hl = null;
    if (!x || x.state === 'reset') { fromDraft(); $('ws-res').textContent = msg || ''; return; }
    fromDraft();                                                  // 11/10: 저장 뒤 생긴 샘플·테스트 일정은 저장본에 없어 빠지던 문제 → 초안의 그날 자리에 넣음
    const smNew = []; LINES[plant].forEach((l) => sim(l).forEach((v) => { if (v.k === 'g' && v.e.sm) smNew.push([l, v.e, dayOf(v.s)]); }));
    const gone = fromSaved(x.p);
    let nSm = 0; smNew.forEach(([l, e, d]) => { if (!L[l].some((q) => q.k === 'g' && q.sm && q.note === e.note)) { insertAtDay(l, e, d); nSm++; } });
    const known = new Set(x.p.known || []), P = placed(), nNew = D.jobs.filter((j) => j.why === 'week' && !P.has(j.id) && !known.has(j.id)).length;
    $('ws-res').textContent = (msg || '') + (gone.length ? ` · 저장본 ${gone.length}건은 최신 자료에 없음(생산·취소)` : '')
      + (nNew ? ` · 저장 후 신규 작업 ${nNew}건 — 아래 목록에서 추가` : '') + (nSm ? ` · 새 샘플·테스트 일정 ${nSm}건 반영` : '');
  }
  async function save(state) {
    const who = $('ws-who').value.trim();
    if (!who) { $('ws-res').textContent = '이름 입력 필요'; $('ws-who').focus(); return; }
    const p = { v: 1, plant, week: D.week, draftBuilt: D.built, memo: $('ws-memo').value.trim().slice(0, 200), lines: {}, known: D.jobs.filter((x) => x.why === 'week').map((x) => x.id).concat((cur && cur.p && cur.p.known) || []) };
    p.known = [...new Set(p.known)];
    if (state !== 'reset') LINES[plant].forEach((l) => { p.lines[l] = L[l].map((e) => (e.k === 'g' ? { k: 'g', min: e.min, note: e.note, sm: !!e.sm } : { k: 'j', id: e.id })); });
    ['ws-save', 'ws-conf', 'ws-reset'].forEach((id) => ($(id).disabled = true)); $('ws-res').textContent = '저장 중…';
    try {
      const q = await fetch(`${API}?select=id,who,at&plant=eq.${plant}&week=gte.${wkFrom()}&order=id.desc&limit=1`, { headers: H });   // 11/10: 내가 연 뒤 다른 사람이 저장했으면 묻기
      const top = q.ok ? (await q.json())[0] : null, mine = VERS.length ? VERS[VERS.length - 1].id : 0;
      if (top && top.id > mine && !confirm(`${top.who} 님이 ${kst(top.at)} 에 먼저 저장했습니다. 그 뒤 내용을 보지 않고 내 것으로 저장할까요?\n(취소하면 '버전 고르기'에서 최신본을 확인할 수 있습니다)`)) {
        await loadVers(); $('ws-res').textContent = '저장하지 않았습니다 — 버전 고르기에서 최신본 확인';
        ['ws-save', 'ws-conf', 'ws-reset'].forEach((id) => ($(id).disabled = false)); return;
      }
      const env = await GP.encryptJSON(p, PW, 'week_seq');
      const r = await fetch(API, { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, H), body: JSON.stringify({ who: who.slice(0, 40), plant, week: D.week, state, payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error('저장 실패 ' + r.status + ' ' + (await r.text()).slice(0, 120));
      try { localStorage.setItem('cgl-me', who); } catch (e) { /* 무시 */ }
      if (state === 'confirm') {                                   // 11/11 사용자 '저장은 생산 일정에 반영 말고, 확정은 반영 — 컬러도': 확정만 생산 일정이 읽는 확정본(cgl_week_confirm)에도
        // 한 줄 = [계약, 톤, 종류, 작업 id] · 종류 '확정' = MES 작업지시(도금 1030 지시·컬러 1030 작업대기, 이미 고정 — 생산 일정이 다시 고정 안 함), '편성' = 이 확정으로 그 라인·날짜에 고정
        //   (11/11 점검: 예전엔 도금도 전부 '확정'으로 보내 생산 캘린더가 하나도 고정하지 않았음)
        const cl = {}, done = (x) => (plant === 'cg' ? x.issued : x.fixed);
        LINES[plant].forEach((l) => { cl[l] = {}; sim(l).filter((v) => v.k === 'j' && v.x.con && !v.x.dummy).forEach((v) => { const d = dayOf(v.s); (cl[l][d] = cl[l][d] || []).push([v.x.con, +(+v.x.t).toFixed(1), done(v.x) ? '확정' : '편성', v.x.id]); }); });
        const wk = D.week, env2 = await GP.encryptJSON({ plant, week: wk, asOf: D.built, built: D.built, lines: cl, extra: {}, moves: [], src: 'week_seq' }, PW, `${plant === 'cg' ? '도금' : '컬러'} 주간 확정 ${wk}`);   // 키 = 생산주(수~화) 수요일(11/11)
        const r2 = await fetch(API.replace('cgl_week_seq', 'cgl_week_confirm'), { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, H), body: JSON.stringify({ who: who.slice(0, 40), week: wk, payload: JSON.stringify(env2) }) });
        if (!r2.ok) throw new Error('확정은 저장됐으나 생산 일정 확정본 저장 실패 ' + r2.status);
      }
      $('ws-memo').value = '';
      await loadVers();
      const last = VERS[VERS.length - 1];
      useVer(last, state === 'confirm' ? `확정했습니다(v${last.v})` : state === 'reset' ? '초안으로 되돌렸습니다' : `저장했습니다(v${last.v})`);
      if (state === 'confirm') CK = checks();
      draw();
      if (window.UI && UI.toast) UI.toast($('ws-res').textContent);
    } catch (e) { $('ws-res').textContent = e.message; }
    ['ws-save', 'ws-conf', 'ws-reset'].forEach((id) => ($(id).disabled = false));
  }

  async function open(p) {
    plant = p;
    if (!DATA[p]) { const env = await GP.latest(`week_seq_${p}.enc.json`); if (!env) throw new Error('자료 없음'); DATA[p] = await GP.decryptJSON(env, PW); }
    D = DATA[p]; R = D.rules; J = {}; D.jobs.forEach((x) => { J[x.id] = x; });
    line = LINES[p].find((l) => (D.lines[l].seq || []).length) || LINES[p][0];
    $('ws-meta').textContent = `자료 ${UI.fmtDateTime(D.now)} 기준 · 하루 = 07시 ~ 다음날 07시`;
    $('ws-meta').title = `초안 만든 시각 ${D.built} · 기간 = 오늘부터 7일(컬러는 확정 지시가 끝날 때까지)`;
    $('ws-miss').innerHTML = (D.missing || []).length ? `<div class="miss">${(D.missing || []).map(esc).join('<br>')}</div>` : '';
    await loadVers();
    const last = VERS[VERS.length - 1];
    useVer(last, last && last.state !== 'reset' ? `최근 ${last.state === 'confirm' ? '확정' : '저장'}본을 불러왔습니다` : '');
    draw();
  }
  async function unlock(pw) {
    try {
      PW = pw;
      $('ws-lock').hidden = true; $('ws-main').hidden = false;
      await open(plant);
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      setMode(mode);
      if (toRules) { toRules = false; setTimeout(() => $('ws-fold').scrollIntoView({ block: 'start' }), 300); }
    } catch (e) {
      $('ws-main').hidden = true; $('ws-lock').hidden = false; $('ws-form').hidden = false;
      $('ws-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 없습니다(다음 포털 갱신 시 생성)' : '암호가 맞지 않습니다') : '';
      document.querySelector('#ws-lock h2').textContent = '분석 암호';
    }
  }
  async function go(p) {
    if (!PW || p === plant) return;
    if (dirty && !confirm('저장하지 않은 수정이 있습니다. 바꾸면 사라집니다.')) { history.replaceState(null, '', hashOf(plant, mode)); return; }
    try { await open(p); } catch (e) { $('ws-res').textContent = '자료 읽기 실패: ' + e.message; }
  }
  let toRules = false;
  const hashOf = (p, m) => '#' + p + (m === 'wo' ? '-wo' : '');
  $('ws-plant').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (b.dataset.p !== plant) location.hash = hashOf(b.dataset.p, mode); }));
  $('ws-mode').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (b.dataset.m !== mode) location.hash = hashOf(plant, b.dataset.m); }));
  /* 위 보기(전체·도금·컬러)와 맞춤 — 컬러를 골랐는데 도금이 나오던 문제(11/10 사용자) */
  const scopeGo = () => { const sc = window.UI && UI.scope ? UI.scope() : 'all', want = sc === 'C' ? 'cc' : sc === 'G' ? 'cg' : null; if (want && want !== plant) location.hash = hashOf(want, mode); };
  if (window.UI && UI.onScope) UI.onScope(scopeGo);
  if (!location.hash || /^#(cg|cc)?-?rules$/.test(location.hash)) { if (/rules/.test(location.hash)) { $('ws-fold').open = true; toRules = true; history.replaceState(null, '', location.pathname + location.search + hashOf(plant, 'ed')); } scopeGo(); }
  addEventListener('hashchange', () => { const m = /-wo\b/.test(location.hash) ? 'wo' : 'ed', p = /cc/.test(location.hash) ? 'cc' : 'cg'; if (p !== plant) go(p).then(() => setMode(m)); else setMode(m); });
  /* 작업지시 제안(옛 작업지시 순서 화면): 처음 열 때 그 공정 스크립트를 불러 붙임. 편집 칸은 숨김(저장 안 한 수정은 그대로 남음) */
  const MOD = { cg: ['cg_wo.js', 'wo-host', 'WO_CG'], cc: ['wo.js', 'wc-host', 'WO_CC'] }, loaded = {};
  const need = (p) => loaded[p] || (loaded[p] = new Promise((ok) => { const sc = document.createElement('script'); sc.src = MOD[p][0] + '?v=2611111200'; sc.onload = () => ok(window[MOD[p][2]]); sc.onerror = () => ok(null); document.body.appendChild(sc); }));
  function setMode(m) {
    mode = m;
    $('ws-mode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    ['ws-kpis', 'ws-ck', 'ws-miss'].forEach((id) => ($(id).hidden = mode === 'wo'));
    document.querySelector('.ws-act').hidden = mode === 'wo'; document.querySelector('.ws-grid').hidden = mode === 'wo';
    $('ws-wk').hidden = $('ws-ver').hidden = $('ws-meta').hidden = mode === 'wo';
    Object.entries(MOD).forEach(([p, [, host]]) => ($(host).hidden = !(mode === 'wo' && p === plant)));
    if (mode === 'wo') need(plant);
    if ($('ws-fold').open) foldFill();
  }
  /* 기준·사양(맨 아래 접기): 주간 순서 계산에 쓰는 전환 휴지·더미 기준 · 점검 규칙 · 시간 계산 + 작업지시 편성 조건(제안 화면 규칙) */
  function specHtml() {
    if (!D) return '';
    const W = `<ul class="ws-ul"><li>하루 = 07시 ~ 다음날 07시(MES 일수) · 기간 = ${dnm(dayOf(tms(D.w0)))} 07시 ~ ${dnm(dayOf(tms(D.w1) - 1))} 다음날 07시(오늘부터 7일, 컬러는 확정 지시가 끝날 때까지)</li>`
      + (plant === 'cg' ? '<li>생산 시간 = 코일 무게 ÷ 시간당 생산량(같은 두께·폭 2026년 실적) · 그날 처음 닿을 때 계획 휴지</li>' : '<li>생산 시간 = 길이 ÷ L/S(26년 1월~ 실적) × 라인 보정 · 도료·PF 입고 전이면 기다림 · 그날 처음 닿을 때 계획 휴지</li>')
      + `<li>초안 = 작업지시 제안 규칙(아래 편성 조건)을 이 기간으로 넓힌 것 · 저장 = 버전 이력(암호화) · 확정 = 그 주 약속본 — 생산 일정에 반영(다음 갱신 때, MES 작업지시 전 작업을 확정한 라인·날짜에 고정) · 저장은 반영 안 됨</li></ul>`;
    let T = '';
    if (plant === 'cc' && R.trans) {
      const K = [...new Set(Object.values(R.trans).flatMap((x) => Object.keys(x)))].sort((a, b) => (a === '사양 같음') - (b === '사양 같음') || a.split('+').length - b.split('+').length || a.localeCompare(b));
      T = `<h4>컬러 전환 휴지 <small>분 · 앞뒤 작업에서 바뀌는 것 × 라인 · 1년 실적 평균(색상교체·롤 교체·청소·더미)</small></h4><div class="ct-wrap"><table class="ct-t ws-tr"><thead><tr><th class="l">바뀌는 것</th>${LINES.cc.map((l) => `<th class="r">${l}</th>`).join('')}</tr></thead><tbody>`
        + K.map((k) => `<tr><td class="l">${k === '사양 같음' ? '새 주문(사양 같음)' : esc(k)}</td>${LINES.cc.map((l) => { const v = (R.trans[l] || {})[k]; return `<td class="r">${v == null ? '<span class="sub">-</span>' : n0(v)}</td>`; }).join('')}</tr>`).join('') + '</tbody></table></div>';
    }
    if (plant === 'cg' && R.pt) {
      const K = [...new Set(Object.values(R.pt).flatMap((x) => Object.keys(x)))];
      T = `<h4>도금 더미 기준 <small>바뀜별 1년 실적 더미 비율 · 들어갈 때 분 · 톤 — ${R.dummyP || 50}% 이상만 시간에 넣음, 그 아래는 '더미 가능' 표시</small></h4><div class="ct-wrap"><table class="ct-t ws-tr"><thead><tr><th class="l">바뀌는 것</th>${LINES.cg.map((l) => `<th class="r">${l} 비율</th><th class="r">분</th><th class="r">톤</th>`).join('')}</tr></thead><tbody>`
        + K.map((k) => `<tr><td class="l">${esc(k)}</td>${LINES.cg.map((l) => { const x = (R.pt[l] || {})[k]; return x ? `<td class="r">${x.p >= (R.dummyP || 50) ? `<b>${n0(x.p)}%</b>` : n0(x.p) + '%'}</td><td class="r">${n0(x.m)}</td><td class="r">${n1(x.t)}</td>` : '<td class="r"><span class="sub">-</span></td><td></td><td></td>'; }).join('')}</tr>`).join('') + '</tbody></table></div>'
        + `<h4>점검 규칙</h4><ul class="ws-ul"><li>두께 차 ${R.thkStep}mm 이내(${Object.entries(R.thkStepThin || {}).map(([l, v]) => `${l} 0.4t 미만 ${v}mm`).join(' · ')}) · 두께비 ${R.thkRatio}배 이내 · 내경 바뀜은 ${R.indThin}t 미만 금지</li><li>폭 넓힘 ${R.widenLim}mm 까지(같은 두께는 넓히지 않음) · 재질 바로 못 잇는 짝 금지(사이 재질)</li><li>2CGL 후처리 같은 층 다른 약액 = 사이 ${R.trtGapN}코일·${n0(R.trtGap)}분 · M/C 날 첫 ${R.mcHead}코일 가전 금지 · 계획 강종 아닌 코일 · 소재 입고 전 작업</li></ul>`;
    }
    return `<h3>주간 순서</h3>${W}${T}<h3>작업지시 편성 조건 · 기준표</h3>`;
  }
  function foldFill() {
    $('ws-spec').innerHTML = specHtml();
    const el = $('ws-rules'); el.innerHTML = '<p class="sub">불러오는 중…</p>';
    const p = plant; need(p).then((M) => { if (M && p === plant) M.rules(el); else if (!M) el.innerHTML = '<p class="sub">규칙 자료를 불러오지 못했습니다</p>'; });
  }
  $('ws-fold').addEventListener('toggle', () => { if ($('ws-fold').open) foldFill(); });
  $('ws-save').onclick = () => save('save');
  $('ws-conf').onclick = () => save('confirm');
  $('ws-reset').onclick = () => { if (confirm('초안으로 되돌릴까요? (저장본은 이력에 남습니다)')) save('reset'); };
  $('ws-chk').onclick = () => { CK = checks(); hl = null; draw(); $('ws-ck').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  $('ws-vers').onchange = () => {
    const v = $('ws-vers').value; if (!v) return;
    if (dirty && !confirm('저장하지 않은 수정이 있습니다. 불러오면 사라집니다.')) { $('ws-vers').value = ''; return; }
    useVer(v === 'draft' ? null : VERS.find((x) => String(x.id) === v), v === 'draft' ? '초안을 불러왔습니다(저장 전)' : '불러왔습니다');
    if (v === 'draft') dirty = true;
    $('ws-vers').value = ''; draw();
  };
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  $('ws-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ws-pw').value); });
  try { $('ws-who').value = localStorage.getItem('cgl-me') || ''; } catch (e) { /* 무시 */ }
  let s = ''; try { s = localStorage.getItem(PW_KEY) || ''; } catch (e) { /* 무시 */ }
  if (s) unlock(s); else { $('ws-form').hidden = false; document.querySelector('#ws-lock h2').textContent = '분석 암호'; }
  window.WS_DEBUG = { sim: (l) => sim(l), checks: () => checks(), state: () => L };
})();
