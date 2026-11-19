/* 판생 작업판 공통(11/19 사용자 'D — 포털 안 판생 작업판, 만들어' · 설계 gadong-plan docs/39·40·41)
   기준판(published/ps_base.enc.json = 판생 엑셀 11/17 을 한 번 옮겨 심은 것) + 공유 저장소 입력 기록 {t:'ps', cells:[[칸, 값, 이전값]], why}
   → 지금 판. 칸을 고치면 바로 다시 계산(모델 함수), 1.2초 모아 암호화 저장, 끊기면 브라우저에 쌓았다가 다시 올림.
   칸 이름: L|줄|월|p·s(원장 생산·판매) · P|월|라인|sw(전환일 'YYYY-MM-DD,…') · P|월|라인|강종|rate(하루 톤) · P|월|라인|날짜|down(휴지 1/0)
           M|줄|월(소재 구매) · P|월|2CGL|stsA(STS 시작일) · C|월|라인|날짜|h(컬러 가동시간) · W|주월요일|라인|강종|pull·note(주 롤링 수주 결정)
           값 null = 기준판으로 되돌림. 주문·컬러 배정·도금 실적은 2시간 갱신 게시 파일을 바로 읽음(기준판의 것은 예비) */
(function () {
  'use strict';
  const PS = (window.PS = {});
  const Q_KEY = 'ps-queue';
  let B = null, OV = {}, LOG = [], REVS = [], subs = [], queue = [], timer = null, saving = false;
  PS.n0 = (v) => (v == null || v === '' ? '' : Math.round(v).toLocaleString('ko-KR'));
  PS.sg = (v) => (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '−' : '') + PS.n0(Math.abs(v));
  PS.md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  PS.mLab = (m) => `${+m.slice(5)}월`;
  PS.days = (m) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7), n = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); };
  PS.prevM = (m) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
  PS.base = () => B;
  PS.on = (fn) => subs.push(fn);
  const fire = () => { for (const f of subs) try { f(); } catch (e) { console.error(e); } };

  /* ---------- 입력 값 ---------- */
  /* 시험(시뮬레이션): 켜면 고친 칸이 공유 저장소로 가지 않고 SIM 에만 — 지금 판 위에 겹쳐 계산, [반영]하면 그때 기록 */
  let SIM = null, EFF = null;
  const ov = () => { if (!SIM) return OV; if (!EFF) { EFF = Object.assign({}, OV); for (const k in SIM) { if (SIM[k] == null) delete EFF[k]; else EFF[k] = SIM[k]; } } return EFF; };
  PS.simOn = () => !!SIM;
  PS.simStart = () => { SIM = {}; EFF = null; fire(); };
  PS.simChanges = () => (SIM ? Object.entries(SIM).map(([k, v]) => [k, v, k in OV ? OV[k] : null]) : []);
  PS.simDrop = () => { SIM = null; EFF = null; fire(); };
  PS.simCommit = (why) => { const pairs = Object.entries(SIM || {}); SIM = null; EFF = null; if (pairs.length) PS.setMany(pairs, why || '시험 반영'); else fire(); return pairs.length; };
  PS.baseOver = () => OV;   // 시험 전 지금 판(비교용)
  PS.get = (k, dflt) => { const o = ov(); return k in o ? o[k] : dflt; };
  PS.isSet = (k) => k in ov();
  PS.kv = (k, d) => { const o = ov(), key = `K|${k}`; return key in o ? o[key] : d; };   /* 기준값: 고친 값(K|…) > 기본값 */
  PS.set = (k, v, why) => PS.setMany([[k, v]], why);
  PS.setMany = (pairs, why) => {
    if (SIM) { for (const [k, v] of pairs) { if (v == null && !(k in OV)) delete SIM[k]; else if (k in OV && v === OV[k]) delete SIM[k]; else SIM[k] = v; } EFF = null; fire(); return; }
    const cells = [];
    for (const [k, v] of pairs) { const prev = k in OV ? OV[k] : null; if (v === prev) continue; if (v == null) delete OV[k]; else OV[k] = v; cells.push([k, v, prev]); }
    if (!cells.length) return;
    const ev = { t: 'ps', cells, why: why || '', at: new Date().toISOString(), by: CT.me() || '이름 없음', local: true };
    LOG.push(ev); queue.push(ev); persistQ(); fire();
    clearTimeout(timer); timer = setTimeout(flush, 1200);
  };
  PS.undo = () => {   // 내가 이 화면에서 마지막에 고친 것 되돌림(되돌림도 기록)
    const me = CT.me() || '이름 없음';
    for (let i = LOG.length - 1; i >= 0; i--) { const e = LOG[i]; if (e.by === me && e.why !== '되돌림') { PS.setMany(e.cells.map(([k, , p]) => [k, p]), '되돌림'); return true; } }
    return false;
  };
  PS.inputValue = (k) => {   // 입력 칸의 지금 값(고친 값 or 기준판)
    { const o = ov(); if (k in o) return o[k]; }
    const p = k.split('|');
    if (p[0] === 'L') return ((((B.ledger.v[p[2]] || {}).cells || {})[p[1]] || {})[p[3]]) || 0;
    if (p[0] === 'M') { const x = B.mat.rows.find((y) => String(y.r) === p[1]); return x ? x.v[p[2]] || 0 : 0; }
    if (p[0] === 'P' && p[4] === 'rate') return p[3] === 'STS' ? PS.stsRate(p[1]) : ((B.plating[p[1]] || {}).rate || {})[`${p[2]}|${p[3]}`] || 0;
    if (p[0] === 'C' && p[5] === 'h') { const r = ((B.color[p[1]] || {})[p[2]] || []).find((x) => x[0] === p[4]); return r ? r[1] : 0; }
    if (p[0] === 'W') return p[5] === 'note' ? '' : 0;
    return null;
  };
  PS.history = (k) => LOG.filter((e) => e.cells.some((c) => c[0] === k)).map((e) => ({ at: e.at, by: e.by, why: e.why, v: e.cells.find((c) => c[0] === k)[1], p: e.cells.find((c) => c[0] === k)[2] }));
  PS.logs = () => LOG.slice();
  PS.pending = () => queue.length;
  function persistQ() { try { localStorage.setItem(Q_KEY, JSON.stringify(queue.map(({ local, ...e }) => e))); } catch (e) { /* 무시 */ } }
  async function flush() {
    if (saving || !queue.length) return;
    saving = true; fire();
    const batch = queue.slice();
    try {
      await CT.store.push({ t: 'ps', batch: batch.map(({ local, ...e }) => e) });
      queue = queue.slice(batch.length); persistQ();
    } catch (e) { PS.err = e.message; setTimeout(flush, 15000); }
    saving = false; fire();
  }
  PS.saving = () => saving;
  addEventListener('online', flush);

  /* ---------- 회차(얼린 판) ---------- */
  PS.revs = () => REVS.slice();
  PS.saveRev = async (name) => { await CT.store.push({ t: 'psRev', name, at: new Date().toISOString() }); REVS.push({ name, at: new Date().toISOString(), by: CT.me() }); fire(); };
  PS.overAt = (at) => { const o = {}; for (const e of LOG) { if (e.at > at) break; for (const [k, v] of e.cells) { if (v == null) delete o[k]; else o[k] = v; } } return o; };

  /* ---------- 불러오기 ---------- */
  /* 2시간 갱신 파일에서 미생산 주문·컬러 일별 배정·도금 일별 실적을 바로 만듦(ps_seed.py 와 같은 규칙) */
  function live(D) {
    const G = D.cg_order_progress, I = D.integrated, A = D.plating_actual;
    if (G && G.rows) {
      B.orders = G.rows.filter((o) => ((o.ordT || 0) - (o.prodT || 0)) >= 1 && !o.prdEnd && ['AZ', 'AL', 'MAC'].includes(o.fam)).map((o) => [o.con, o.line || o.pline || '', o.fam, String(o.grp || '').replace('그룹', ''), Math.round(((o.ordT || 0) - (o.prodT || 0)) * 10) / 10, Math.round((o.tph || 0) * 10) / 10, o.due || '', o.st || '', o.man || '', o.dst || o.cus || '', o.pdt || '', `${o.thk}×${o.wdt}`, o.eta || o.entSche || '', o.needIn || '', o.needSrc || '', o.shp || '', o.arr || '', o.dept || '', o.cus || '', o.etaSrc || '', o.thk || 0, o.wdt || 0, o.cot || '', o.aft || '', o.grade || o.specGr || '']);
      B.ordersAsOf = G.asOf;
    }
    if (I && I.color) {
      const col = {}, ev = {};
      for (const r of I.color) { const g = r.g || {}, top = Object.keys(g).sort((a, b) => g[b] - g[a])[0] || ''; ((col[r.d.slice(0, 7)] = col[r.d.slice(0, 7)] || {})[r.l] = col[r.d.slice(0, 7)][r.l] || []).push([r.d, Math.round((r.min || 0) / 6) / 10, Math.round((r.rows || []).reduce((a, x) => a + (x[5] || 0), 0)), top]); }
      for (const m in col) for (const l in col[m]) col[m][l].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      for (const [d, l, k, mins] of I.colorDown || []) (ev[`${l}|${d}`] = ev[`${l}|${d}`] || []).push([k, Math.round(mins)]);
      B.color = col; B.colorEv = ev; B.colorAsOf = I.asOf;
    }
    if (I && I.shipProfile) B.shipProfile = I.shipProfile;
    if (D.mat_order) B.matOrder = D.mat_order;
    if (D.ps_changes) B.changes = D.ps_changes;
    B.opf = { '1CGL': 0.95, '2CGL': 0.95 };   // 하루 실가동 비율(MES 일별 가동 분 ÷ 1440, 최근) — 사양 톤파워(가동 분당 톤)에 곱함
    if (A && A.dayMin) for (const l of ['1CGL', '2CGL']) { const v = Object.values(A.dayMin).map((x) => x[l]).filter((x) => x != null); if (v.length >= 14) B.opf[l] = Math.round(v.reduce((a, b) => a + b, 0) / v.length / 1440 * 1000) / 1000; }
    if (A && A.daily) { B.actual = {}; for (const r of A.daily) B.actual[r.d] = { '1CGL': r['1CGL'] || 0, '2CGL': r['2CGL'] || 0 }; B.actualAsOf = A.asOf; }
    else B.actual = B.actual || {};
  }
  PS.boot = (render) => {
    CT.boot(['ps_base.enc.json', 'cg_order_progress.enc.json', 'integrated.enc.json', 'plating_actual.enc.json', 'mat_order.enc.json', 'ps_changes.enc.json'], async (D) => {
      if (B && D.ps_base) { render(B); return; }   // 범위 바꿈 때 다시 부름
      B = D.ps_base; if (!B) { render(null); return; }
      live(D);
      render(B);
      try {
        const ev = await CT.store.events();
        const L = [];
        for (const e of ev) { if (e.t === 'ps' && e.batch) L.push(...e.batch); else if (e.t === 'ps' && e.cells) L.push(e); else if (e.t === 'psRev') REVS.push(e); }
        let q = []; try { q = JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch (e) { /* 무시 */ }
        const seen = new Set(L.map((e) => e.at + e.by));
        q = q.filter((e) => !seen.has(e.at + e.by));
        L.push(...q); L.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
        OV = {}; for (const e of L) for (const [k, v] of e.cells) { if (v == null) delete OV[k]; else OV[k] = v; }
        LOG = L; queue = q.map((e) => Object.assign(e, { local: true })); if (queue.length) flush();
        REVS.sort((a, b) => (a.at < b.at ? -1 : 1));
      } catch (e) { PS.err = '공유 저장소를 못 읽음. 기준판 값만 보임'; }
      fire();
    });
  };

  /* ================= 계산 모델 ================= */
  /* 원장: 줄 값 = 입력(dept·자식 없는 mkt) 또는 합(mkt = Σ dept, sec = Σ mkt, 도금 계 = MAC+AZ+AL, 내수·수출·자가 합) */
  PS.ledger = (over) => {
    const o = over || ov(), R = B.ledger.rows, V = B.ledger.v, ms = B.months, out = {};
    const kids = (r, kind) => R.filter((y) => (kind === 'dept' ? y.mkt === r : y.sec === r && y.kind === 'mkt'));
    for (const m of ms) {
      const C = (V[m] || {}).cells || {}, res = {};
      const val = (x, k) => { const key = `L|${x.r}|${m}|${k}`; return key in o ? o[key] : ((C[x.r] || {})[k] || 0); };
      for (const x of R) if (x.kind === 'dept' || (x.kind === 'mkt' && !kids(x.r, 'dept').length)) res[x.r] = { p: val(x, 'p'), s: val(x, 's'), in: true };
      for (const x of R) if (x.kind === 'mkt' && kids(x.r, 'dept').length) { const k = kids(x.r, 'dept'); res[x.r] = { p: k.reduce((a, y) => a + res[y.r].p, 0), s: k.reduce((a, y) => a + res[y.r].s, 0) }; }
      for (const x of R) if (x.kind === 'sec' && x.name !== '도금') { const k = kids(x.r, 'mkt'); const own = (y) => y.lab.replace(/\s/g, '') === '자가'; res[x.r] = { p: k.reduce((a, y) => a + res[y.r].p, 0), s: k.filter((y) => !own(y)).reduce((a, y) => a + res[y.r].s, 0), self: k.filter(own).reduce((a, y) => a + res[y.r].p, 0) }; }   // 판매 = 내수+수출(자가는 판매 아님)
      const sec = (nm) => R.find((x) => x.kind === 'sec' && x.name === nm);
      const pl = R.find((x) => x.name === '도금' && x.kind === 'sec');
      if (pl) res[pl.r] = ['MAC', 'AZ', 'AL'].reduce((a, nm) => ({ p: a.p + res[sec(nm).r].p, s: a.s + res[sec(nm).r].s, self: a.self + res[sec(nm).r].self }), { p: 0, s: 0, self: 0 });
      for (const x of R) if (x.kind === 'sum') {
        const t = x.lab.replace(/\s/g, '');
        const mk = R.filter((y) => y.kind === 'mkt' && y.lab.replace(/\s/g, '') === t);
        res[x.r] = t === '생산(판매)량합계' ? ['내수', '수출', '자가'].reduce((a, tt) => { const z = R.filter((y) => y.kind === 'mkt' && y.lab.replace(/\s/g, '') === tt); return { p: a.p + z.reduce((b, y) => b + res[y.r].p, 0), s: a.s + z.reduce((b, y) => b + res[y.r].s, 0) }; }, { p: 0, s: 0 })
          : { p: mk.reduce((a, y) => a + res[y.r].p, 0), s: mk.reduce((a, y) => a + res[y.r].s, 0) };
      }
      out[m] = res;
    }
    // 재고 전망: 판생 회의 시트 식 그대로 — 맨 아래 줄(부서·자가)마다 전월 + 생산 − 판매(자가의 판매 = 컬러로 넘김), 위 줄은 합
    const first = ms[0], leaf = R.filter((x) => out[first][x.r] && out[first][x.r].in);
    for (const x of leaf) {   // 판생 재고 전망(손 조정 포함)에서 출발 + 우리가 고친 생산·판매 차이만 누적
      let d = 0;
      for (const m of ms) {
        const c0 = ((V[m] || {}).cells || {})[x.r] || {};
        d += (out[m][x.r].p - (c0.p || 0)) - (out[m][x.r].s - (c0.s || 0));
        out[m][x.r].sf = (c0.sf || 0) + d;
      }
    }
    for (const m of ms) {
      const res = out[m];
      for (const x of R) if (x.kind === 'mkt' && !res[x.r].in) res[x.r].sf = kids(x.r, 'dept').reduce((a, y) => a + res[y.r].sf, 0);
      for (const x of R) if (x.kind === 'sec' && x.name !== '도금') res[x.r].sf = kids(x.r, 'mkt').reduce((a, y) => a + res[y.r].sf, 0);
      const pl = R.find((x) => x.name === '도금' && x.kind === 'sec');
      if (pl) res[pl.r].sf = ['MAC', 'AZ', 'AL'].reduce((a, nm) => a + res[R.find((x) => x.kind === 'sec' && x.name === nm).r].sf, 0);
    }
    return out;
  };
  PS.secRow = (nm) => B.ledger.rows.find((x) => x.kind === 'sec' && x.name === nm);
  PS.target = (m, L) => { const l = L || PS.ledger(); const g = (nm) => l[m][PS.secRow(nm).r].p; const st = B.ledger.rows.filter((x) => /STS/.test(x.lab) && x.kind === 'dept' && x.sec === PS.secRow('AL').r && (B.ledger.rows.find((y) => y.r === x.mkt) || {}).lab.replace(/\s/g, '') === '내수').reduce((a, x) => a + l[m][x.r].p, 0);
    return { AZ: g('AZ'), MAC: g('MAC'), AL: g('AL'), total: g('도금'), color: g('컬러'), STS: st || (B.plating[m] || {}).sts || 0 }; };

  /* 도금 월차: 판생 도금가동 방식(docs/38) — 꼭 맞출 강종(1CGL AZ · 2CGL MAC) 날 수 먼저, 남는 날 AL, 지난달 끝 강종 이어받기, 전환 첫날 500t·15시간 */
  const MUST = { '1CGL': 'AZ', '2CGL': 'MAC' };
  PS.LINES = { '1CGL': ['AZ', 'AL'], '2CGL': ['MAC', 'AL'] };
  PS.isDown = (l, d) => { const k = `P|${d.slice(0, 7)}|${l}|${d}|down`; const o = ov(); return k in o ? !!o[k] : B.down.includes(`${l}|${d}`); };
  const noGo = (l, g, d) => B.nogo.includes(`${l}|${g}|${d}`);
  /* 하루 톤: 고친 값 > 사양 믹스(그 달 일감의 두께·폭 × MES 톤파워) > 판생 제원. PS.rateMode = 'seed' 면 판생 제원(판생 엑셀 재현 시험용) */
  let MIXR = null; PS.rateMode = 'mix'; PS.pastMode = 'in';
  PS.seedRate = (m, l, g) => ((B.plating[m] || {}).rate ? B.plating[m].rate[`${l}|${g}`] : 900);
  PS.rateSrc = (m, l, g) => (PS.isSet(`P|${m}|${l}|${g}|rate`) ? '고친 값' : PS.rateMode === 'mix' && MIXR && MIXR[`${m}|${l}|${g}`] ? '사양 믹스' : '판생 제원');
  PS.rate = (m, l, g) => PS.get(`P|${m}|${l}|${g}|rate`, (PS.rateMode === 'mix' && MIXR && MIXR[`${m}|${l}|${g}`]) || PS.seedRate(m, l, g));
  function autoSw(l, m, T, carry) {
    const must = MUST[l], days = PS.days(m).filter((d) => !PS.isDown(l, d));
    if (!days.length) return { order: ['AL'], sw: [] };
    if (PS.isDown(l, `${m}-01`)) carry = l === '1CGL' ? 'AZ' : 'AL';
    const nm = Math.ceil(Math.max(0, T[must] - PS.kv('rule|swT', B.swT)) / PS.rate(m, l, must)) + 1;
    const ok = days.filter((d) => !noGo(l, must, d));
    if (carry === must && ok[0] === days[0]) { const a = Math.round(nm * 0.6), b = nm - a; return { order: [must, 'AL', must], sw: [days[Math.min(a, days.length - 1)], days[Math.max(a + 1, days.length - b)]] }; }
    const i = Math.max(Math.round((days.length - nm) / 2), ok.length ? days.indexOf(ok[0]) : 0);
    if (i + nm >= days.length) return { order: ['AL', must], sw: [days[Math.min(i, days.length - 1)]] };
    return { order: ['AL', must, 'AL'], sw: [days[i], days[i + nm]] };
  }
  /* STS(AL-STS 임가공, 2CGL AL 기간 안): 목표 = 회의 33·35행. 시작일 입력(P|월|2CGL|stsA), 없으면 2CGL AL 연속 구간 가운데에 붙여 놓음 */
  PS.stsRate = (m) => PS.get(`P|${m}|2CGL|STS|rate`, (PS.rateMode === 'mix' && MIXR && MIXR[`${m}|2CGL|STS`]) || 850);   // 기본 850t/일 = MES 2CGL GAS·AL-STS 10~11월 35.7t/h × 24
  function placeSts(m, days, T) {
    const need = Math.ceil((T.STS || 0) / PS.stsRate(m)); if (!need) return { a: null, need: 0, n: 0 };
    const al = days.filter((x) => x.g === 'AL' && !x.ev).map((x) => x.d);
    let a = PS.get(`P|${m}|2CGL|stsA`, null);
    if (!a) { let best = [], cur = []; for (const d of al) { if (cur.length && (new Date(d) - new Date(cur[cur.length - 1])) / 864e5 !== 1) { if (cur.length > best.length) best = cur; cur = []; } cur.push(d); } if (cur.length > best.length) best = cur; a = best[Math.max(0, Math.floor((best.length - need) / 2))] || null; }
    let n = 0; if (a) for (const x of days) { if (n >= need) break; if (x.d >= a && x.g === 'AL' && !x.ev) { x.sts = true; x.t = Math.round(PS.stsRate(m)); n++; } }
    return { a, need, n, manual: PS.isSet(`P|${m}|2CGL|stsA`) };
  }
  function genLine(l, m, T, carry) {
    const must = MUST[l], a = autoSw(l, m, T, carry), ovs = PS.get(`P|${m}|${l}|sw`, null), sw = ovs ? ovs.split(',') : a.sw, D = PS.days(m), out = [];
    let k = 0, cur = a.order[0], made = 0, first = carry != null && carry !== cur;
    const left = (d) => { const nx = k + 1 < a.order.length && k < sw.length ? sw[k] : '9999'; return D.filter((x) => x >= d && x < nx && !PS.isDown(l, x)).length; };
    for (const d of D) {
      if (PS.isDown(l, d)) { out.push({ d, g: '', t: 0, ev: '휴지', h: 0 }); first = true; continue; }
      let ev = '';
      if (k + 1 < a.order.length && k < sw.length && d >= sw[k]) { k += 1; cur = a.order[k]; first = true; ev = l === '1CGL' && cur === 'AZ' ? 'S/D' : 'M/C'; }
      let t = first ? PS.kv('rule|swT', B.swT) : PS.rate(m, l, cur);
      if (cur === must) { t = first ? Math.min(t, Math.max(0, T[must] - made)) : Math.min(t, Math.max(0, T[must] - made) / Math.max(1, left(d))); t = Math.round(t); made += t; }
      out.push({ d, g: cur, t: Math.round(t), ev, h: ev ? PS.kv('rule|swH', 15) : 24 }); first = false;
    }
    return { days: out, auto: a.sw, sw, order: a.order, manual: !!ovs };
  }
  PS.plating = (L) => {   // 모든 달(기준판 첫 달은 판생 손 계획 = 이어받기용)
    const l = L || PS.ledger(), ms = B.months, res = {}, carry = {};
    MIXR = PS.rateMode === 'mix' && B.rateTab ? PS.mixRates(PS.items(l)) : null;
    const r0 = B.plating[ms[0]].ref;
    for (const ln of Object.keys(PS.LINES)) { const z = (r0[ln] || []).filter((r) => r[1] && r[2]); carry[ln] = z.length ? z[z.length - 1][1] : null; }
    for (const m of ms.slice(1)) {
      const T = PS.target(m, l); res[m] = {};
      for (const ln of Object.keys(PS.LINES)) {
        res[m][ln] = genLine(ln, m, T, carry[ln]);
        if (ln === '2CGL') res[m][ln].sts = placeSts(m, res[m][ln].days, T);
        const rf = ((B.plating[m] || {}).ref || {})[ln] || [], zr = rf.filter((r) => r[1] && r[2]), z = res[m][ln].days.filter((x) => x.g);
        carry[ln] = zr.length ? zr[zr.length - 1][1] : z.length ? z[z.length - 1].g : carry[ln];   // 판생이 손으로 짠 달은 그 끝 강종을 이어받음
      }
      res[m].T = T;
    }
    return res;
  };
  PS.sumG = (days, g) => days.reduce((a, x) => a + (x.g === g ? x.t : 0), 0);
  PS.daysG = (days, g) => days.reduce((a, x) => a + (x.g === g ? (x.ev && x.ev !== '휴지' ? 0.5 : 1) : 0), 0);

  /* 컬러 월차: 엔진 일별 배정(시간·톤) + 가동시간 입력(C|월|라인|날짜|h) → 톤 = 그 날 엔진 시간당 톤(없으면 그 달 라인 평균) × 시간 */
  PS.CLINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  PS.color = (m) => {
    const out = {};
    for (const l of PS.CLINES) {
      const X = Object.fromEntries(((B.color[m] || {})[l] || []).map((r) => [r[0], r])), rs = Object.values(X).filter((r) => r[1] > 0);
      const avg = rs.reduce((a, r) => a + r[2], 0) / Math.max(1, rs.reduce((a, r) => a + r[1], 0));
      out[l] = PS.days(m).map((d) => { const r = X[d], k = `C|${m}|${l}|${d}|h`, h0 = r ? r[1] : 0, h = k in ov() ? ov()[k] : h0, tph = r && r[1] > 0 ? r[2] / r[1] : avg;
        return { d, h, h0, t: Math.round(h === h0 && r ? r[2] : tph * h), ev: (B.colorEv[`${l}|${d}`] || []), set: k in ov() }; });
    }
    return out;
  };

  /* 날짜별 도금 계획(라인): 기준판 첫 달 = 판생 손 계획, 그 뒤 = 월차 */
  PS.dayPlan = (P) => {
    const pl = P || PS.plating(), out = {};
    for (const m of B.months) for (const ln of Object.keys(PS.LINES)) {
      if (pl[m]) for (const x of pl[m][ln].days) out[`${ln}|${x.d}`] = { g: x.sts ? 'STS' : x.g, t: x.t, ev: x.ev };
      else for (const [d, g, t, e] of ((B.plating[m] || {}).ref || {})[ln] || []) out[`${ln}|${d}`] = { g: g || '', t: t || 0, ev: e || '' };
    }
    return out;
  };
  /* 날짜별 무엇을 왜(11/19 사용자 '며칠에 무슨 그룹 어떤 게 생산돼야 한다, 이유는 입항일이 4반순이라서 — 이렇게 알려줘야'):
     도금 계획의 날마다 그 강종·라인에 맞는 일감을 '생산 필요일'이 이른 것부터 채움. 일감 = 미생산 주문(수출 = 배 출항 전 생산 필요일, 국내 = 납기, 소재 입고 전엔 못 넣음)
     + 판매계획 중 아직 주문이 없는 양(그 그룹 과거 출고 날짜 분포대로 반순에 나눔). 남는 생산 = 재고로 */
  const GRPN = (g) => { g = String(g || ''); return /수출/.test(g) && !/컬러/.test(g) ? '도금수출' : /자동차/.test(g) ? '자동차' : /도금판매/.test(g) ? '도금국내' : /컬러|자가/.test(g) ? '자가재' : /수요/.test(g) ? '수요개발' : g || '기타'; };
  const LGRP = (lab) => { lab = String(lab).replace(/\s/g, ''); return /도금수출/.test(lab) ? '도금수출' : /자동차/.test(lab) ? '자동차' : /도금판매|RM/.test(lab) ? '도금국내' : /자가/.test(lab) ? '자가재' : /수요/.test(lab) ? '수요개발' : lab; };
  const PROFK = { 도금수출: 'G수출', 도금국내: 'G국내', 자동차: 'G자동차' };
  const BAN = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 31]];
  PS.banLab = (d) => `${+d.slice(5, 7)}월 ${BAN.findIndex(([a, b]) => +d.slice(8) >= a && +d.slice(8) <= b) + 1}반순`;
  /* ---- 사양 톤파워(MES 26.1~ 코일 실적표, tools/cg_rate_learn 과 같은 찾기: 라인|강종|두께칸|폭칸 → 넓혀 가며) ---- */
  const bis = (arr, v) => { let i = 0; while (i < arr.length && v >= arr[i]) i++; return i; };
  PS.tph = (l, fam, thk, wdt) => {
    const T = B.rateTab; if (!T) return null; const f = fam === 'STS' ? 'AL' : fam, R = T.rate;
    if (!thk) return (T.avg || {})[l] * 60 * PS.kv(`rule|opf|${l}`, (B.opf || {})[l] || 0.95);
    const t = bis(T.thk, +thk), ks = [...(wdt ? [`${l}|${f}|${t}|${bis(T.wdt, +wdt)}`] : []), `${l}|${f}|${t}`, `${l}|${t}`, l];
    const f0 = PS.kv(`rule|opf|${l}`, (B.opf || {})[l] || 0.95);
    for (const k of ks) { const fx = PS.kv(`rate|${k}`, null); if (fx != null) return fx * f0; if (R[k]) return R[k] * 60 * f0; }   /* K|rate|키 = 고친 시간당 톤(가동 중) */
    return (T.avg || {})[l] * 60 * f0;
  };
  PS.band = (t) => (t < 0.4 ? '극박' : t < 0.6 ? '박물' : t < 1.0 ? '중물' : '후물');
  PS.BANDS = ['극박', '박물', '중물', '후물'];
  /* ---- 일감: 주문(결정 D|월|계약 = in·next·stock·d:날짜 반영) + 그룹 생산량 중 주문 없는 양(같은 그룹·강종 주문의 사양 믹스, 과거 출고 반순) ---- */
  const famOfRow = (x) => { const sec = B.ledger.rows.find((y) => y.r === x.sec); return sec && ['MAC', 'AZ', 'AL'].includes(sec.name) ? (/STS/.test(x.lab) ? 'STS' : sec.name) : null; };
  PS.famOfRow = famOfRow; PS.grpOfRow = (x) => LGRP(x.lab);
  PS.items = (L) => {
    const l0 = L || PS.ledger(), R = B.ledger.rows, asOf = String(B.actualAsOf || B.ordersAsOf || '').slice(0, 10) || B.months[0] + '-01', m0 = asOf.slice(0, 7), cut = PS.prevM(m0) + '-01';
    const ms = B.months.filter((m) => m >= m0), need = (o) => PS.get(`N|${o[0]}`, null) || o[13] || (o[6] ? PS.addD(o[6], -3) : asOf)   /* N|계약 = 사람이 고친 생산 필요일(입항·납기가 바뀐 것, 11/19 한 화면) */, nextM = (m) => { const i = B.months.indexOf(m); return B.months[i + 1] || m; };
    const quota = {}; for (const m of ms) for (const x of R) { if (!l0[m] || !l0[m][x.r] || !l0[m][x.r].in) continue; const f = famOfRow(x); if (!f) continue; const k = `${m}|${LGRP(x.lab)}|${f}`; quota[k] = (quota[k] || 0) + l0[m][x.r].p; }
    const items = [], stale = [], past = [], stockUse = {}, mixSrc = {};
    for (const o of B.orders) {
      const nd = need(o); if (nd < cut) { stale.push(o); continue; }
      if (PS.pastMode === 'out' && nd < asOf && !PS.get(`D|${o[0]}`, null)) { past.push(o); continue; }   // 지난 납기 미생산을 계산에서 뺌(사람이 결정한 주문은 넣음)
      const g = GRPN(o[3]), f = o[10] === 'GAS' ? 'STS' : o[2], exp = o[14] === '출항', port = (String(o[15] || '').split('_')[1] || o[9] || '').replace(/\s+/g, ' ').trim();
      let m = nd.slice(0, 7) < m0 ? m0 : nd.slice(0, 7); const dec = PS.get(`D|${o[0]}`, null); let pin = '', must = false;
      if (dec === 'stock') { const k = `${m}|${g}|${f}`; stockUse[k] = (stockUse[k] || 0) + o[4]; continue; }
      if (dec === 'next') m = nextM(m); else if (dec === 'in') must = true; else if (dec && dec.startsWith('d:')) { pin = dec.slice(2); m = pin.slice(0, 7); must = true; }
      const thk = +o[20] || 0, wdt = +o[21] || 0;
      const it = { k: 'o', m, con: o[0], line: o[1] === '1CGL' || o[1] === '2CGL' ? o[1] : '', fam: f, grp: g, t: o[4], left: o[4], need: nd, ready: o[12] && o[12] > asOf ? o[12] : '', eta: o[12] || '', readyNote: o[19] || '', thk, wdt, cot: o[22] || '', aft: o[23] || '', gr: o[24] || '', dec, pin, must,
        cus: o[18] || o[9] || '', dst: o[9] || '', man: o[8] || '', due: o[6] || '',
        who: exp ? port.replace(/\s*\d순$/, '') : g === '자가재' ? '컬러 투입' : (o[18] || o[9] || ''), why: exp ? `${port} 배${o[16] ? ` 입항 ${PS.md(o[16])}(${PS.banLab(o[16])})` : ''}${o[17] ? ` · 출항 ${PS.md(o[17])}` : ''}` : g === '자가재' ? `컬러 라인 투입 ${o[6] ? PS.md(o[6]) : ''}` : `납기 ${o[6] ? PS.md(o[6]) : '없음'}` };
      items.push(it);
      if (thk) { const mk = `${g}|${f}`, b = PS.band(thk); ((mixSrc[mk] = mixSrc[mk] || {})[b] = mixSrc[mk][b] || { t: 0, tk: 0, w: {} }); const z = mixSrc[mk][b]; z.t += o[4]; z.tk += thk * o[4]; z.w[wdt] = (z.w[wdt] || 0) + o[4]; }
    }
    const om = {}; for (const it of items) { const k = `${it.m}|${it.grp}|${it.fam}`; om[k] = (om[k] || 0) + it.t; }
    for (const [k, q] of Object.entries(quota)) {
      const [m, g, fam] = k.split('|'), rest = q - (om[k] || 0) - (stockUse[k] || 0); if (rest < 20) continue;
      const prof = (B.shipProfile || {})[PROFK[g]], D = PS.days(m).filter((d) => m !== m0 || d > asOf), lead = g === '도금수출' ? 7 : g === '자가재' ? 2 : 3;
      const bw = BAN.map(([a, b]) => D.filter((d) => +d.slice(8) >= a && +d.slice(8) <= b).reduce((s, d) => s + (prof ? prof[+d.slice(8)] || 0 : 1), 0)), ws = bw.reduce((a, b) => a + b, 0) || 1;
      const top = BAN.map((_, i) => [i, bw[i] / ws]).sort((a, b) => b[1] - a[1]).slice(0, 2);
      // 사양 추정: 지난 3개월 그 그룹·강종 생산 실적(MES 코일) > 지금 들어온 주문 구성
      const hm = ((B.histMix || {}).mix || {})[`${g}|${fam}`], om_ = mixSrc[`${g}|${fam}`];
      const src = hm ? '지난 3개월 실적' : om_ ? '들어온 주문 구성' : '';
      const parts = hm ? (() => { const tt = Object.values(hm).reduce((a, z) => a + z.t, 0); return PS.BANDS.filter((b) => hm[b] && hm[b].t / tt > 0.02).map((b) => ({ b, r: hm[b].t / tt, thk: hm[b].thk, wdt: hm[b].wdt })); })()
        : om_ ? (() => { const mt = Object.values(om_).reduce((a, z) => a + z.t, 0); return PS.BANDS.filter((b) => om_[b]).map((b) => ({ b, r: om_[b].t / mt, thk: Math.round(om_[b].tk / om_[b].t * 100) / 100, wdt: +Object.entries(om_[b].w).sort((x, y) => y[1] - x[1])[0][0] })); })() : [{ b: '', r: 1, thk: 0, wdt: 0 }];
      const rsum = parts.reduce((a, p) => a + p.r, 0) || 1; for (const p of parts) p.r /= rsum;
      /* 도금수출: 배선일정 엑셀(목적지별 출항 반순·월평균) 기준 — 목적지마다 (평균 비중 × 그룹 생산) − 이미 들어온 주문 = 남는 양을 그 목적지 출항 −1일에 — 출항 기간 안(11/19 사용자 '입항일 기준 엑셀 적용 · −1일이 아니라 기간') */
      const SS = g === '도금수출' && ((B.shipSched || {})[`${g}|${fam}`] || []).map((x) => [x[0], PS.kv(`ship|${g}|${fam}|${x[0]}|t`, x[1]), PS.kv(`ship|${g}|${fam}|${x[0]}|a`, x[2]), PS.kv(`ship|${g}|${fam}|${x[0]}|b`, x[3]), x[7]]);
      if (SS && SS.length) {
        const tot = SS.reduce((a, x) => a + x[1], 0) || 1, ordD = {};
        for (const it of items) if (it.k === 'o' && it.m === m && it.grp === g && it.fam === fam) { const w = String(it.who || '').toUpperCase(); const x = SS.find((y) => w.includes(y[0].toUpperCase()) || y[0].toUpperCase().includes(w.split(' ')[0])); if (x) ordD[x[0]] = (ordD[x[0]] || 0) + it.t; }
        let gaps = SS.map((x) => [x, Math.max(0, x[1] / tot * q - (ordD[x[0]] || 0))]); const gs = gaps.reduce((a, y) => a + y[1], 0);
        if (gs < 1) gaps = SS.map((x) => [x, x[1] / tot]); const gsum = gaps.reduce((a, y) => a + y[1], 0) || 1;
        const last = PS.days(m).length;
        for (const [x, gp] of gaps) { const tD = rest * gp / gsum; if (tD < 5) continue; const a = Math.min(x[2], last), b = Math.min(x[3], last);
          /* 사양: 그 목적지의 실적 구성(배선일정 엑셀 정리_판매데이터)이 있으면 그것, 없으면 그룹 구성 */
          const bd = x[4] && x[4].bands, bt = bd ? Object.values(bd).reduce((q0, v) => q0 + v[0], 0) : 0;
          const partsD = bt > 0 ? PS.BANDS.filter((k) => bd[k] && bd[k][0] / bt > 0.02).map((k) => ({ b: k, r: bd[k][0] / bt, thk: bd[k][1], wdt: bd[k][2] })) : parts, specSrc = bt > 0 ? '그 목적지 실적' : src;
          const dd = (n) => `${m}-${String(n).padStart(2, '0')}`;   /* 출항 기간 안에서 생산: 시작일 전엔 안 넣고(ready) 끝날까지(need). 기간이 열흘 넘으면 반순으로 나눔 */
          const pieces = b - a >= 10 ? BAN.filter(([s0, e0]) => e0 >= a && s0 <= b).map(([s0, e0]) => [Math.max(s0, a), Math.min(e0, b, last)]) : [[a, b]];
          for (const [p0, p1] of pieces) { let nd = dd(p1); if (nd <= asOf) nd = PS.addD(asOf, 1); const rd = dd(p0) > asOf ? dd(p0) : '';
            for (const p of partsD) { const t = Math.round(tD / pieces.length * p.r); if (t < 3) continue;
              items.push({ k: 'p', m, grp: g, fam, line: '', t, left: t, need: nd, ready: rd, thk: p.thk, wdt: p.wdt, band: p.b, who: x[0], dst: x[0], why: `${x[0]} 출항 ${x[2]}~${x[3]}일(배선일정 엑셀)에 맞춰 ${+p0}~${+p1}일 생산 · 아직 주문 없음 · ${p.b ? `${p.b} ${p.thk}×${p.wdt}, ${specSrc} 기준 추정` : '사양 미정'}` }); } } }
        continue;
      }
      BAN.forEach(([a, b], i) => { const tb = rest * bw[i] / ws; if (tb < 5) return; const end = `${m}-${String(Math.min(b, PS.days(m).length)).padStart(2, '0')}`;
        for (const p of parts) { const t = Math.round(tb * p.r); if (t < 3) continue;
          items.push({ k: 'p', m, grp: g, fam, line: '', t, left: t, need: PS.addD(end, -lead), ready: '', thk: p.thk, wdt: p.wdt, band: p.b, who: '판매계획', why: `${PS.mLab(m)} ${i + 1}반순 출고분(아직 주문 없음, ${p.b ? `${p.b} ${p.thk}×${p.wdt}, ${src} 기준 추정` : '사양 미정'})${prof ? ` · ${g} 과거 출고 ${top.map(([j, r]) => `${j + 1}반순 ${Math.round(r * 100)}%`).join('·')}` : ''}` }); } });
    }
    items.sort((a, b) => (a.must !== b.must ? (a.must ? -1 : 1) : a.need < b.need ? -1 : a.need > b.need ? 1 : a.k === 'o' ? -1 : 1));
    return { items, quota, om, stockUse, stale, past, asOf, m0, cut, mixSrc };
  };
  /* 사양 믹스로 낸 하루 톤 = 24 × Σ톤 ÷ Σ(톤 ÷ 그 사양 시간당 톤) — 그 달 그 라인에 들어갈 수 있는 일감 전부로 */
  PS.mixRates = (IT) => {
    const out = {};
    for (const it of IT.items) for (const l of Object.keys(PS.LINES)) {
      if (it.line && it.line !== l) continue; const g = it.fam; if (!(PS.LINES[l].includes(g) || (g === 'STS' && l === '2CGL'))) continue;
      const tp = PS.tph(l, g, it.thk, it.wdt); if (!tp) continue; const k = `${it.m}|${l}|${g}`; (out[k] = out[k] || { t: 0, h: 0 }); out[k].t += it.t; out[k].h += it.t / tp;
    }
    const r = {}; for (const [k, v] of Object.entries(out)) if (v.h > 0) r[k] = Math.round(24 * v.t / v.h); return r;
  };
  PS.assign = (P, IT0) => {
    const pl = P || PS.plating(), IT = IT0 || PS.items(), DP = PS.dayPlan(pl), { asOf, m0 } = IT, items = IT.items.map((x) => ({ ...x, left: x.t }));
    const quota = Object.assign({}, IT.quota);
    for (const k of Object.keys(quota)) if (k.startsWith(m0 + '|')) { const f = k.split('|')[2]; let a = 0, z = 0; for (const kk in DP) { const [, d] = kk.split('|'); if (d.slice(0, 7) !== m0 || DP[kk].g !== f) continue; a += DP[kk].t; if (d > asOf) z += DP[kk].t; } quota[k] *= a ? z / a : 0; }
    const qLeft = Object.assign({}, quota), out = {};
    const days = [...new Set(Object.keys(DP).map((k) => k.split('|')[1]))].filter((d) => d > asOf).sort();
    let curM = ''; const stockUsed = {}, pool = (((B.stockLots || {}).rows) || []).map(([g, f, th, wd, , , t]) => ({ g, f, th, wd, left: t }));
    for (const d of days) for (const l of Object.keys(PS.LINES)) {
      if (d.slice(0, 7) !== curM) { curM = d.slice(0, 7);
        // 그 달 그룹 생산량을 넘은 주문 = 재고에서 나갈 몫: 같은 그룹·강종·사양(두께 ±0.02·폭 ±10) 재고가 있으면 재고로, 없으면 다음 달로 이어감(판매계획분보다 먼저)
        for (const it of items) if (it.k === 'o' && it.left > 0.5 && it.m < curM && !it.pin) {
          if (it.dec !== 'in') for (const L of pool) { if (it.left <= 0.5) break; if (L.left <= 0 || L.g !== it.grp || L.f !== it.fam || !it.thk || Math.abs(L.th - it.thk) > 0.02 || Math.abs(L.wd - it.wdt) > 10) continue; const u = Math.min(L.left, it.left); L.left -= u; it.left -= u; it.fromStock = (it.fromStock || 0) + u; stockUsed[it.con] = (stockUsed[it.con] || 0) + u; }
          if (it.left > 0.5) { it.m = curM; it.carried = true; } } }
      const x = DP[`${l}|${d}`]; if (!x || !x.t || !x.g) continue;
      const m = d.slice(0, 7), r0 = PS.rate(m, l, x.g === 'STS' ? 'AL' : x.g), capH = x.t / (x.g === 'STS' ? PS.stsRate(m) : r0) * 24; let h = capH; const got = [];
      for (const pass of [0, 1]) for (const it of items) {
        if (h <= 0.01) break;
        if (it.left <= 0 || it.m !== m || it.fam !== x.g || (it.line && it.line !== l) || (it.ready && it.ready > d)) continue;
        if (pass === 0 ? !(it.pin === d) : (it.pin && it.pin !== d)) continue;
        const qk = `${m}|${it.grp}|${it.fam}`, ql = it.must ? Infinity : qLeft[qk] || 0; if (ql <= 0) continue;
        const tp = PS.tph(l, it.fam, it.thk, it.wdt) || r0 / 24, t = Math.min(h * tp, it.left, ql); if (t < 0.5) continue;
        it.left -= t; h -= t / tp; if (!it.must) qLeft[qk] = ql - t; got.push({ it, t, h: t / tp, tp, late: it.k === 'o' && it.need < d ? Math.round((new Date(d) - new Date(it.need)) / 864e5) : 0 });
      }
      // 그 날 안 순서: 도금량·후처리가 같은 것끼리 묶고(톤 큰 묶음 먼저), 묶음 안에서는 폭 넓은 것부터, 같은 폭은 얇은 것부터(03 작업 순서 규칙의 기본 방향)
      const gk = (y) => `${y.it.cot || ''}|${y.it.aft || ''}`, gt = {}; for (const y of got) gt[gk(y)] = (gt[gk(y)] || 0) + y.t;
      got.sort((a, b) => (gk(a) === gk(b) ? 0 : gt[gk(b)] - gt[gk(a)] || (gk(a) < gk(b) ? -1 : 1)) || (b.it.wdt || 0) - (a.it.wdt || 0) || (a.it.thk || 0) - (b.it.thk || 0));
      for (let i = 1; i < got.length; i++) { const a = got[i - 1].it, b = got[i].it; if (!a.thk || !b.thk) continue; got[i].dw = (b.wdt || 0) - (a.wdt || 0); got[i].rt = Math.max(a.thk, b.thk) / Math.min(a.thk, b.thk); got[i].cc = gk(got[i - 1]) !== gk(got[i]); }
      out[`${l}|${d}`] = { g: x.g, plan: x.t, capH, got, tons: Math.round(got.reduce((a, y) => a + y.t, 0)), freeH: Math.max(0, h), ev: x.ev };
    }
    const over = {}; for (const it of items) if (it.k === 'o' && it.left > 1) { const k = `${it.m}|${it.grp}|${it.fam}`; over[k] = (over[k] || 0) + it.left; }
    return { out, items, over, quota, qLeft, om: IT.om, stockUse: IT.stockUse, stockUsed, asOf, stale: IT.stale, past: IT.past, cut: IT.cut };
  };
  /* ===== 판생 대응(docs/44): 지금 순서 + 대안 계산 ===== */
  PS.ctx = () => {
    const P = PS.plating(), A = PS.assign(P), at = {}, free = {};
    for (const [k, x] of Object.entries(A.out)) { const [l, d] = k.split('|');
      for (const y of x.got) { if (y.it.k !== 'o') continue; (at[y.it.con] = at[y.it.con] || []).push({ d, l, t: y.t, h: y.h }); }
      if (x.freeH > 0.3) (free[`${l}|${x.g}`] = free[`${l}|${x.g}`] || []).push({ d, h: x.freeH }); }
    for (const c in at) at[c].sort((a, b) => (a.d < b.d ? -1 : 1));
    const today = A.asOf, mon = PS.monday(PS.addD(today, 1)), lockEnd = PS.addD(PS.monday(today), 6);
    return { P, A, at, free, today, lockEnd, itemOf: Object.fromEntries(A.items.filter((x) => x.k === 'o').map((x) => [x.con, x])) };
  };
  const linesFor = (it) => (it.line ? [it.line] : it.fam === 'AZ' ? ['1CGL'] : it.fam === 'MAC' || it.fam === 'STS' ? ['2CGL'] : ['1CGL', '2CGL']);
  /* cons(같은 강종 묶음)를 need 날짜까지 만들려면 — 대안 목록 [{kind, txt, pins:[[con, 날짜]], moved:[{con, from, to, slack, grp, who}], lock}] */
  PS.options = (C, cons, need) => {
    const its = cons.map((c) => C.itemOf[c]).filter(Boolean); if (!its.length) return { state: 'none', opts: [] };
    const fam = its[0].fam, lines = linesFor(its[0]), hrs = its.reduce((a, it) => a + it.t / (PS.tph(lines[0], fam, it.thk, it.wdt) || 30), 0);
    const cur = its.map((it) => (C.at[it.con] || []).slice(-1)[0]).filter(Boolean), last = cur.map((x) => x.d).sort().pop();
    const out = { fam, hrs, t: its.reduce((a, it) => a + it.t, 0), last, lines, opts: [] };
    if (last && last <= need) { out.state = 'ok'; return out; }
    out.state = last ? 'late' : 'none';
    // A. 필요일 전 같은 강종의 남는 시간
    let h = 0; const fd = [];
    for (const l of lines) for (const f of C.free[`${l}|${fam}`] || []) if (f.d > C.today && f.d <= need) fd.push({ ...f, l });
    fd.sort((a, b) => (a.d < b.d ? 1 : -1));   // 필요일에 가까운 날부터(재고로 오래 두지 않게)
    const useA = []; for (const f of fd) { if (h >= hrs) break; useA.push(f); h += f.h; }
    if (h >= hrs * 0.95) out.opts.push({ kind: '남는 시간', txt: `${useA.map((f) => `${f.l} ${PS.md(f.d)}(${f.h.toFixed(1)}시간)`).join(' · ')} 남는 시간에 넣음 · 밀리는 주문 없음`, pins: its.map((it, i) => [it.con, useA[Math.min(i, useA.length - 1)].d]), moved: [], lock: useA.some((f) => f.d <= C.lockEnd) });
    // B. 자리 바꾸기: 필요일 전 같은 강종 날에 있는 것 중 판매계획(주문 없음)분 먼저, 그다음 납기 여유 큰 주문을 요청 주문의 지금 날짜로 미룸
    const newDay = last || need, cand = [];
    for (const [k, x] of Object.entries(C.A.out)) { const [l, d] = k.split('|'); if (!lines.includes(l) || x.g !== fam || d <= C.today || d > need) continue;
      for (const y of x.got) { if (cons.includes(y.it.con)) continue; const slack = Math.round((new Date(y.it.need) - new Date(newDay)) / 864e5); if (y.it.k === 'o' && slack < 0) continue; cand.push({ y, d, l, slack: y.it.k === 'p' ? 999 : slack }); } }
    cand.sort((a, b) => b.slack - a.slack || (a.d < b.d ? 1 : -1));
    let hb = 0; const mv = []; for (const c of cand) { if (hb >= hrs) break; mv.push(c); hb += c.y.h; }
    if (hb >= hrs * 0.95 && mv.length) { const days = [...new Set(mv.map((c) => c.d))].sort(), plan = mv.filter((c) => c.y.it.k === 'p').reduce((a, c) => a + c.y.t, 0);
      out.opts.push({ kind: '자리 바꾸기', txt: `${[...new Set(mv.map((c) => `${c.l} ${PS.md(c.d)}`))].join(' · ')}에 넣고, 그 자리 ${plan ? `판매계획(주문 없음)분 ${PS.n0(plan)}t` : ''}${plan && mv.some((c) => c.y.it.k === 'o') ? ' · ' : ''}${mv.filter((c) => c.y.it.k === 'o').length ? `주문 ${mv.filter((c) => c.y.it.k === 'o').length}건 ${PS.n0(mv.filter((c) => c.y.it.k === 'o').reduce((a, c) => a + c.y.t, 0))}t` : ''}을 ${PS.md(newDay)}로 미룸`,
        pins: its.map((it, i) => [it.con, days[Math.min(i, days.length - 1)]]).concat(mv.filter((c) => c.y.it.k === 'o').map((c) => [c.y.it.con, newDay])),
        moved: mv.filter((c) => c.y.it.k === 'o').map((c) => ({ con: c.y.it.con, from: c.d, to: newDay, slack: c.slack, grp: c.y.it.grp, who: c.y.it.who === '컬러 투입' ? c.y.it.cus : c.y.it.who, man: c.y.it.man, t: c.y.t })), lock: mv.some((c) => c.d <= C.lockEnd) }); }
    // B'. 남는 시간 + 자리 바꾸기를 다 써도 모자라면: 되는 만큼 먼저(필요일 이른 주문부터)
    if (!out.opts.length && h + hb > 0.5) { const can = h + hb, part = []; let hh = 0; for (const it of its.slice().sort((x, y) => (x.need < y.need ? -1 : 1))) { const ih = it.t / (PS.tph(lines[0], fam, it.thk, it.wdt) || 30); if (hh + ih > can) break; part.push(it); hh += ih; }
      const days = [...new Set([...useA.map((f) => f.d), ...mv.map((c) => c.d)])].sort();
      if (part.length) out.opts.push({ kind: '일부 당기기', txt: `필요 ${hrs.toFixed(0)}시간 중 ${can.toFixed(0)}시간만 자리 있음: ${part.length}건 ${PS.n0(part.reduce((a, x) => a + x.t, 0))}t 를 ${days.map(PS.md).join(' · ')}에, 나머지 ${its.length - part.length}건은 전환일·납기·배 일정 협의`,
        pins: part.map((it, i) => [it.con, days[Math.min(i, days.length - 1)]]).concat(mv.filter((c) => c.y.it.k === 'o').map((c) => [c.y.it.con, newDay])), moved: mv.filter((c) => c.y.it.k === 'o').map((c) => ({ con: c.y.it.con, from: c.d, to: newDay, slack: c.slack, grp: c.y.it.grp, who: c.y.it.who === '컬러 투입' ? c.y.it.cus : c.y.it.who, man: c.y.it.man, t: c.y.t })), lock: days.some((d) => d <= C.lockEnd) }); }
    // C. 같은 강종 구간이 필요일 전에 모자람 → 전환일·다른 라인(사람 판단)
    if (!out.opts.length || out.opts[0].kind === '일부 당기기') { const runs = lines.map((l) => { const d = Object.keys(C.A.out).filter((k) => k.startsWith(l + '|') && C.A.out[k].g === fam && k.split('|')[1] > C.today).map((k) => k.split('|')[1]).sort()[0]; return d ? `${l} 다음 ${fam} 시작 ${PS.md(d)}` : `${l} ${fam} 계획 없음`; });
      out.opts.push({ kind: '전환일 검토', txt: `필요일 ${PS.md(need)} 전 ${fam} 자리(남는 시간·미룰 수 있는 것)가 ${(h + hb).toFixed(0)}시간, 필요 ${hrs.toFixed(0)}시간(${runs.join(' · ')}). 전환일을 당기거나 납기·배 일정 협의`, pins: [], moved: [], lock: false, needSw: true }); }
    return out;
  };
  /* 늦춰진 주문: 새 필요일에 맞춰 미루고, 빈 자리를 채울 주문(지연 중이거나 다음 달 소재 있는 것) */
  PS.fillers = (C, cons, from) => {
    const its = cons.map((c) => C.itemOf[c]).filter(Boolean); if (!its.length) return [];
    const fam = its[0].fam, lines = linesFor(its[0]), out = [];
    for (const it of Object.values(C.itemOf)) { if (cons.includes(it.con) || it.fam !== fam || (it.line && !lines.includes(it.line)) || (it.ready && it.ready > from)) continue;
      const pd = (C.at[it.con] || [])[0]; if (pd && pd.d <= from) continue; const late = pd ? Math.round((new Date(pd.d) - new Date(it.need)) / 864e5) : 99;
      if (late > 0 || it.need <= PS.addD(from, 21)) out.push({ it, pd, late }); }
    return out.sort((a, b) => (a.it.need < b.it.need ? -1 : 1)).slice(0, 5);
  };
  PS.monday = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  PS.addD = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  /* 생산 가능(CAPA): 미생산 주문 × 주문별 톤파워(MES T/Hr) → 필요 가동일 vs 월차 강종 가용일(누적) */
  PS.capa = (P) => {
    const pl = P || PS.plating(), ms = Object.keys(pl).sort(), agg = {};
    for (const o of B.orders) {
      const [con, line, fam, grp, t, tph] = o; const ln = line === '1CGL' || line === '2CGL' ? line : '공용';
      const r = tph || ((B.plating[ms[0]] || {}).rate || {})[`${ln === '공용' ? '2CGL' : ln}|${fam}`] / 24 || 35;
      const k = `${ln}|${fam}`; (agg[k] = agg[k] || { ln, fam, t: 0, h: 0, n: 0, grp: {} });
      agg[k].t += t; agg[k].h += t / r; agg[k].n += 1; agg[k].grp[grp] = (agg[k].grp[grp] || 0) + t;
    }
    for (const a of Object.values(agg)) {
      const lines = a.ln === '공용' ? ['1CGL', '2CGL'] : [a.ln];
      let cum = 0; a.by = ms.map((m) => { const av = lines.reduce((s, l) => s + PS.daysG(pl[m][l].days, a.fam), 0); cum += av; return { m, av, cum }; });
      a.need = a.h / 24; const hit = a.by.find((x) => x.cum >= a.need); a.until = hit ? hit.m : null;
    }
    return Object.values(agg).sort((x, y) => (x.ln + x.fam < y.ln + y.fam ? -1 : 1));
  };

  /* 도금 소재: 구매(판생 소재 시트, 고친 칸은 차이만큼) − 사용((도금 생산 − 임가공) ÷ 수율) → 월말 재고 */
  PS.MAT_IN = ['POSCO', 'F/H(수입)', '수입 안전재고', 'F/H(외부)', 'A Z'];
  PS.mat = (L, P, useWolcha) => {
    const l = L || PS.ledger(), rows = B.mat.rows, ms = B.mat.months, out = {};
    const row = (lab) => rows.find((x) => x.lab === lab) || { v: {} };
    let st = null;
    for (const m of ms) {
      let buy = row('구매량 계(임가공제외)').v[m] || 0;
      for (const lab of PS.MAT_IN) { const x = row(lab), key = `M|${x.r}|${m}`; const o = ov(); if (key in o) buy += o[key] - (x.v[m] || 0); }
      const imp = row('임가공').v[m] || 0;
      if (st == null) { st = row('월말 소재 재고').v[m] || 0; out[m] = { buy, use: null, st, ref: st, imp }; continue; }
      const prod = useWolcha && P && P[m] ? ['1CGL', '2CGL'].reduce((a, ln) => a + P[m][ln].days.reduce((b, x) => b + x.t, 0), 0) : (l[m] ? l[m][PS.secRow('도금').r].p : 0);
      const yl = ((B.ledger.v[m] || {}).yield) || B.yield.plating, use = (prod - imp) / (yl / 100);   // 수율 = 그 달 회의 86행
      st = st + buy - use;
      out[m] = { buy, use, st, ref: row('월말 소재 재고').v[m], imp, prod };
    }
    return out;
  };
})();
