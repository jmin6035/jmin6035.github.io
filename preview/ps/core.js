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
  PS.get = (k, dflt) => (k in OV ? OV[k] : dflt);
  PS.isSet = (k) => k in OV;
  PS.set = (k, v, why) => PS.setMany([[k, v]], why);
  PS.setMany = (pairs, why) => {
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
    if (k in OV) return OV[k];
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
      B.orders = G.rows.filter((o) => ((o.ordT || 0) - (o.prodT || 0)) >= 1 && !o.prdEnd && ['AZ', 'AL', 'MAC'].includes(o.fam)).map((o) => [o.con, o.line || o.pline || '', o.fam, String(o.grp || '').replace('그룹', ''), Math.round(((o.ordT || 0) - (o.prodT || 0)) * 10) / 10, Math.round((o.tph || 0) * 10) / 10, o.due || '', o.st || '', o.man || '', o.dst || o.cus || '', o.pdt || '', `${o.thk}×${o.wdt}`, o.eta || o.entSche || '']);
      B.ordersAsOf = G.asOf;
    }
    if (I && I.color) {
      const col = {}, ev = {};
      for (const r of I.color) { const g = r.g || {}, top = Object.keys(g).sort((a, b) => g[b] - g[a])[0] || ''; ((col[r.d.slice(0, 7)] = col[r.d.slice(0, 7)] || {})[r.l] = col[r.d.slice(0, 7)][r.l] || []).push([r.d, Math.round((r.min || 0) / 6) / 10, Math.round((r.rows || []).reduce((a, x) => a + (x[5] || 0), 0)), top]); }
      for (const m in col) for (const l in col[m]) col[m][l].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      for (const [d, l, k, mins] of I.colorDown || []) (ev[`${l}|${d}`] = ev[`${l}|${d}`] || []).push([k, Math.round(mins)]);
      B.color = col; B.colorEv = ev; B.colorAsOf = I.asOf;
    }
    if (A && A.daily) { B.actual = {}; for (const r of A.daily) B.actual[r.d] = { '1CGL': r['1CGL'] || 0, '2CGL': r['2CGL'] || 0 }; B.actualAsOf = A.asOf; }
    else B.actual = B.actual || {};
  }
  PS.boot = (render) => {
    CT.boot(['ps_base.enc.json', 'cg_order_progress.enc.json', 'integrated.enc.json', 'plating_actual.enc.json'], async (D) => {
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
    const o = over || OV, R = B.ledger.rows, V = B.ledger.v, ms = B.months, out = {};
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
  PS.isDown = (l, d) => { const k = `P|${d.slice(0, 7)}|${l}|${d}|down`; return k in OV ? !!OV[k] : B.down.includes(`${l}|${d}`); };
  const noGo = (l, g, d) => B.nogo.includes(`${l}|${g}|${d}`);
  PS.rate = (m, l, g) => PS.get(`P|${m}|${l}|${g}|rate`, (B.plating[m] || {}).rate ? B.plating[m].rate[`${l}|${g}`] : 900);
  function autoSw(l, m, T, carry) {
    const must = MUST[l], days = PS.days(m).filter((d) => !PS.isDown(l, d));
    if (!days.length) return { order: ['AL'], sw: [] };
    if (PS.isDown(l, `${m}-01`)) carry = l === '1CGL' ? 'AZ' : 'AL';
    const nm = Math.ceil(Math.max(0, T[must] - B.swT) / PS.rate(m, l, must)) + 1;
    const ok = days.filter((d) => !noGo(l, must, d));
    if (carry === must && ok[0] === days[0]) { const a = Math.round(nm * 0.6), b = nm - a; return { order: [must, 'AL', must], sw: [days[Math.min(a, days.length - 1)], days[Math.max(a + 1, days.length - b)]] }; }
    const i = Math.max(Math.round((days.length - nm) / 2), ok.length ? days.indexOf(ok[0]) : 0);
    if (i + nm >= days.length) return { order: ['AL', must], sw: [days[Math.min(i, days.length - 1)]] };
    return { order: ['AL', must, 'AL'], sw: [days[i], days[i + nm]] };
  }
  /* STS(AL-STS 임가공, 2CGL AL 기간 안): 목표 = 회의 33·35행. 시작일 입력(P|월|2CGL|stsA), 없으면 2CGL AL 연속 구간 가운데에 붙여 놓음 */
  PS.stsRate = (m) => PS.get(`P|${m}|2CGL|STS|rate`, 850);   // 기본 850t/일 = MES 2CGL GAS·AL-STS 10~11월 35.7t/h × 24
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
      let t = first ? B.swT : PS.rate(m, l, cur);
      if (cur === must) { t = first ? Math.min(t, Math.max(0, T[must] - made)) : Math.min(t, Math.max(0, T[must] - made) / Math.max(1, left(d))); t = Math.round(t); made += t; }
      out.push({ d, g: cur, t: Math.round(t), ev, h: ev ? 15 : 24 }); first = false;
    }
    return { days: out, auto: a.sw, sw, order: a.order, manual: !!ovs };
  }
  PS.plating = (L) => {   // 모든 달(기준판 첫 달은 판생 손 계획 = 이어받기용)
    const l = L || PS.ledger(), ms = B.months, res = {}, carry = {};
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
      out[l] = PS.days(m).map((d) => { const r = X[d], k = `C|${m}|${l}|${d}|h`, h0 = r ? r[1] : 0, h = k in OV ? OV[k] : h0, tph = r && r[1] > 0 ? r[2] / r[1] : avg;
        return { d, h, h0, t: Math.round(h === h0 && r ? r[2] : tph * h), ev: (B.colorEv[`${l}|${d}`] || []), set: k in OV }; });
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
      for (const lab of PS.MAT_IN) { const x = row(lab), key = `M|${x.r}|${m}`; if (key in OV) buy += OV[key] - (x.v[m] || 0); }
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
