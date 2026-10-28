/* 도금 2주 생산 캘린더: published/cg_calendar.enc.json (tools/cg_calendar.py)
   10/28 사용자 '전부 진행': 주문진도 ↔ MES ↔ 작업지시 순서를 계약번호-행번 하나로 — 라인 × 14일, 칸 = 확정(현장 작업지시) · 편성(소재 있음) · 예상(입고 예정)
   수요일 오전 = 다음 주(월~일) 확정 저장(암호화 → Supabase cgl_week_confirm) → 다음 날부터 준수율 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', WHO_KEY = 'cgl-who', RK_KEY = 'cgl-cal-risk';
  const SB = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_week_confirm';
  const KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';      // 공개용 키(이 표 권한 = 읽기·추가만). 비밀 키는 넣지 말 것
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const dt = (s) => new Date(s + 'T00:00:00');
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const mdw = (s) => `${md(s)}(${DOW[dt(s).getDay()]})`;
  const LINES = ['1CGL', '2CGL'];
  let O = null, PW = '', rk = 'win', MOVES = [], SWAP = true;
  try { SWAP = localStorage.getItem('cgl-cal-swap2') !== '0'; } catch (e) { /* 무시 */ }
  const MV_KEY = () => 'cgl-cal-moves|' + O.asOf;               // 옮기기 임시본(이 브라우저) — '다음 주 확정'을 눌러야 저장
  const compat = (df, f) => !!f && (f === df || String(f).split('-')[0] === df || (f === 'AZ·MAC' && (df === 'AZ' || df === 'MAC')));
  const KD = { 확정: '작업지시', 편성: '소재 있음', 예상: '입고 예정' };   // 화면에 보이는 이름(10/28 사용자 '편성·예상이 뭐야')
  const cellOf = (ln, d) => O.lines[ln][O.days.indexOf(d)];
  const r1 = (v) => Math.round(v * 10) / 10;
  /* 날짜 안 순서(10/28 재질 규칙 반영): 작업지시는 MES 순서 그대로, 나머지는 재질(등급)끼리 묶고 → 넓은 폭 → 좁은 폭, 같은 폭은 얇은 것 먼저.
     등급 차례는 바로 못 잇는 짝이 붙지 않게(녹취 10/27): AZ·AL = Gr.E → DDQ → EDDQ → DQ → CQ → 구조용, PosMAC = Gr.E → Gr.C → CQ → DQ → DDQ → EDDQ */
  const GRANK = { AZ: { GRE: 0, DDQ: 1, EDDQ: 2, DQ: 3, CQ: 4, GRB: 5, GRC: 6, GRD: 7 }, MAC: { GRE: 0, GRC: 1, CQ: 2, GRB: 2.5, GRD: 2.7, DQ: 3, DDQ: 4, EDDQ: 5, LFQ: 3.5 } };
  const gRank = (fam, g) => { const R = GRANK[String(fam || '').startsWith('MAC') ? 'MAC' : 'AZ']; return g && R[g] != null ? R[g] : 4.5; };
  const sortDay = (a, fam) => a.sort((x, y) => (x.kind === '확정' ? 0 : 1) - (y.kind === '확정' ? 0 : 1) || (x.kind === '확정' ? (x.seq || 0) - (y.seq || 0) : gRank(fam, x.grade) - gRank(fam, y.grade) || (y.wdt || 0) - (x.wdt || 0) || (x.thk || 9) - (y.thk || 9)));
  /* 24시간 연속 가동 = 라인마다 한 줄로 이어진 생산 순서(10/28 사용자 '도금은 24시간이라 옮기면 캐파 초과·규칙 못 지키는 날도 있다').
     순서를 날짜별 능력으로 잘라 칸에 담음. 옮기기 = 고른 날 맨 앞에 끼워 넣기 → 뒤 주문이 순서대로 밀림(능력 초과 없음).
     못 들어가는 칸: 강종 다름(M/C 전후) · 입고 전 소재 · 라인 정지 → 그 조각은 다음 맞는 날로 */
  const fits = (p, c, d) => c.cap >= 1 && compat(c.fam, p.fam) && !(p.kind === '예상' && p.avail && p.avail > d) && !(p.pin && p.pin > d);
  function slice(ln, fixed, seq) {
    const cells = fixed[ln].map((c) => Object.assign({}, c, { items: c.items.slice() }));
    let rest = seq.map((p) => Object.assign({}, p));
    const out = [];
    cells.forEach((c, di) => {
      const d = O.days[di], keep = [];
      let left = c.cap - c.items.reduce((a, i) => a + i.t, 0);
      for (const p of rest) {
        if (left < 0.5 || !fits(p, c, d)) { keep.push(p); continue; }
        const t = Math.min(left, p.t);
        if (t < p.t - 0.05) keep.push(Object.assign({}, p, { t: r1(p.t - t) }));
        const x = Object.assign({}, p, { t: r1(t), day: d });
        c.items.push(x); out.push(x); left -= t;
      }
      rest = keep;
    });
    rest.forEach((p) => out.push(Object.assign(p, { day: null })));
    return { cells, seq: out, out: rest };
  }
  function simulate(moves) {
    const fixed = {}, seqs = {}, res = {};
    LINES.forEach((ln) => {
      fixed[ln] = O.base[ln].map((c) => Object.assign({}, c, { items: c.items.filter((i) => i.kind === '확정') }));
      seqs[ln] = [];
      O.base[ln].forEach((c, di) => {                         // 처음 순서 = 날짜 순, 같은 날은 필요일 빠른 것 먼저(밀릴 때 덜 급한 것이 밀림)
        const non = c.items.filter((i) => i.kind !== '확정').map((i) => Object.assign({}, i, { day: O.days[di], d0: O.days[di] }));
        non.sort((a, b) => String(a.need || '9').localeCompare(String(b.need || '9')));
        seqs[ln].push(...non);
      });
      res[ln] = slice(ln, fixed, seqs[ln]); seqs[ln] = res[ln].seq;
    });
    const posOf = (q, f) => { const i = q.findIndex(f); return i < 0 ? q.length : i; };
    const nextDay = (d) => O.days[O.days.indexOf(d) + 1] || '9999';
    const removed = [];                                      // 뺀 주문(달력에서 빠져 아래 목록으로) — 넣다 뺐다(10/28 사용자)
    const displace = (ln, d, need, why, except) => {        // 그 날이 넘치는 만큼 필요일 늦은 주문부터 빼서 목록으로(작업지시·직접 놓은 주문은 안 뺌)
      const c = res[ln] && res[ln].cells[O.days.indexOf(d)];
      if (!c) return;
      let rem = need - Math.max(0, c.cap - c.items.reduce((a, i) => a + i.t, 0));
      c.items.filter((i) => i.kind !== '확정' && i.con !== except && !i.pin).sort((a, b) => String(b.need || '9').localeCompare(String(a.need || '9'))).forEach((it) => {
        if (rem < 0.5) return;
        const q = seqs[ln], k = q.findIndex((p) => p.con === it.con && p.kind === it.kind && p.day === d);
        if (k < 0) return;
        const p = q[k], t = Math.min(rem, p.t);
        if (t < p.t - 0.05) p.t = r1(p.t - t); else q.splice(k, 1);
        removed.push(Object.assign({}, p, { t: r1(t), day: null, pin: null, moved: null, why, fromD: d, fromL: ln }));
        rem -= t;
      });
    };
    const swapOn = (m) => m.swap !== false;                 // 기본 = 빼서 목록으로(옛 저장본은 swap 칸이 없음 → 빼기)
    (moves || []).forEach((m) => {
      if (m.op === 'add') {                                  // 칸에 못 들어간 주문을 고른 날 맨 앞에 넣기
        const tq = seqs[m.tl];
        if (!tq || !m.item) { m.bad = true; return; }
        m.bad = false;
        if (swapOn(m)) displace(m.tl, m.td, m.t, `뺌 — ${m.con} ${n0(m.t)}t 넣느라`, m.con);
        tq.splice(posOf(tq, (x) => x.day === null || x.day >= m.td), 0, Object.assign({}, m.item, { t: m.t, added: true, pin: m.td }));
        res[m.tl] = slice(m.tl, fixed, tq); seqs[m.tl] = res[m.tl].seq;
        return;
      }
      if (m.op === 'remove') {                               // 직접 빼기 → 목록으로
        const q = seqs[m.fl] || [], k = q.findIndex((p) => p.con === m.con && p.kind === m.kind && p.day === m.fd);
        if (k < 0) { m.bad = true; return; }
        m.bad = false;
        const p = q[k], t = Math.min(m.t, p.t);
        if (t < p.t - 0.05) p.t = r1(p.t - t); else q.splice(k, 1);
        removed.push(Object.assign({}, p, { t: r1(t), day: null, pin: null, moved: null, why: '직접 뺌', fromD: m.fd, fromL: m.fl }));
        res[m.fl] = slice(m.fl, fixed, q); seqs[m.fl] = res[m.fl].seq;
        return;
      }
      if (m.op === 'set') {                                  // 이 날 이 주문 톤 바꾸기: 줄이면 나머지는 다음 날부터, 늘리면 같은 주문의 뒤쪽 물량을 당겨 옴
        const q = seqs[m.fl] || [], k = q.findIndex((p) => p.con === m.con && p.kind === m.kind && p.day === m.fd);
        if (k < 0) { m.bad = true; return; }
        m.bad = false;
        const p = q.splice(k, 1)[0], old = p.t;
        let rest = null;
        if (m.t < old - 0.05) { rest = Object.assign({}, p, { t: r1(old - m.t), pin: nextDay(m.fd) }); p.t = m.t; }
        else if (m.t > old + 0.05) {
          let need = m.t - old;
          q.filter((x) => x.con === m.con && x.kind === m.kind).sort((x, y) => String(y.day || '9').localeCompare(String(x.day || '9'))).forEach((x) => {
            if (need < 0.05) return;
            const take = Math.min(need, x.t); x.t = r1(x.t - take); need -= take;
          });
          for (let i = q.length - 1; i >= 0; i--) if (q[i].t < 0.05) q.splice(i, 1);
          p.t = r1(m.t - need); m.short = need >= 0.05 ? r1(need) : 0;
          if (swapOn(m)) displace(m.fl, m.fd, p.t - old, `뺌 — ${m.con} 톤 늘리느라`, m.con);
        }
        Object.assign(p, { edited: { from: old }, pin: m.fd });
        q.splice(posOf(q, (x) => x.day === null || x.day >= m.fd), 0, p);
        if (rest) q.splice(posOf(q, (x) => x.day === null || x.day > m.fd), 0, rest);
        res[m.fl] = slice(m.fl, fixed, q); seqs[m.fl] = res[m.fl].seq;
        return;
      }
      const q = seqs[m.fl] || [], k = q.findIndex((p) => p.con === m.con && p.kind === m.kind && p.day === m.fd);
      if (k < 0 || !seqs[m.tl]) { m.bad = true; return; }
      m.bad = false;
      const p = q[k];
      let mv;
      if (m.t < p.t - 0.05) { p.t = r1(p.t - m.t); mv = Object.assign({}, p, { t: m.t }); } else { mv = p; q.splice(k, 1); }
      Object.assign(mv, { moved: { fd: m.fd, fl: m.fl }, pin: m.td });
      if (swapOn(m)) displace(m.tl, m.td, mv.t, `뺌 — ${m.con} ${n0(mv.t)}t 옮겨 오느라`, m.con);
      const tq = seqs[m.tl];
      let at = tq.findIndex((x) => x.day === null || x.day >= m.td);
      if (at < 0) at = tq.length;
      tq.splice(at, 0, mv);
      [...new Set([m.fl, m.tl])].forEach((ln) => { res[ln] = slice(ln, fixed, seqs[ln]); seqs[ln] = res[ln].seq; });
    });
    res._removed = removed;
    return res;
  }
  function lastDay(res) {                                    // 계약번호-행번 → 마지막 생산일(2주 밖이면 '9')
    const m = {};
    LINES.forEach((ln) => res[ln].seq.forEach((p) => { const d = p.day || '9'; if (!m[p.con] || d > m[p.con]) m[p.con] = d; }));
    return m;
  }
  function recalc(c) {
    const s2 = { 확정: 0, 편성: 0, 예상: 0 }, g = {};
    c.items.forEach((i) => { s2[i.kind] += i.t; g[i.grp || '?'] = (g[i.grp || '?'] || 0) + i.t; });
    c.conf = s2.확정; c.plan = s2.편성; c.fcst = s2.예상;
    const fill = s2.확정 + s2.편성 + s2.예상;
    c.gap = c.cap - fill >= 0.5 ? r1(c.cap - fill) : 0;
    c.grp = Object.fromEntries(Object.entries(g).sort((a, b) => b[1] - a[1]));
    c.late = c.items.filter((i) => i.late).length;
    c.mvIn = c.items.filter((i) => i.moved).length;
    c.flag = c.flag0; c.flagS = c.flagS0; c.why = c.why0;
    const seq = c.items.filter((i) => i.kind !== '확정' && i.grade);   // 날짜 안 순서(재질 차례)대로 이었을 때 바로 못 잇는 짝이 남으면 = 사이에 다른 재질이 필요
    for (let k = 1; k < seq.length; k++) {
      const h = hard(c.line || '', seq[k - 1], seq[k], c.fam);
      if (h.startsWith('재질') && !c.flag) {
        const gre = [seq[k - 1].grade, seq[k].grade].includes('GRE');
        c.flag = `${h} — 사이에 ${gre ? '극저(DQ·DDQ) 1개' : 'DQ·DDQ'} 필요(그날 없음) · 그 날로 옮기거나 극저 주문 넣기`; c.flagS = h.replace(' 바로 못 이음', ' 사이 극저 필요');
        break;
      }
    }
    if (c.mvOut && c.gap) c.why = '옮긴 뒤 이 강종으로 채울 주문이 없음';
  }
  function applyMoves() {
    const res = simulate(MOVES), L0 = lastDay(simulate([])), L1 = lastDay(res);
    O.lines = {}; O.out = {};
    LINES.forEach((ln) => {
      O.lines[ln] = res[ln].cells.map((c, di) => {
        const d = O.days[di];
        c.flag0 = O.base[ln][di].flag; c.flagS0 = O.base[ln][di].flagS; c.why0 = O.base[ln][di].why;
        c.items.forEach((i) => {
          if (i.kind === '확정') return;
          i.late = !!(i.need && i.need >= O.asOf && i.need < d);
          i.shift = !i.moved && L1[i.con] !== L0[i.con] ? (L1[i.con] > L0[i.con] ? '뒤로 밀림' : '앞당겨짐') : '';
        });
        c.mvOut = MOVES.filter((m) => !m.bad && m.fl === ln && m.fd === d).length;
        sortDay(c.items, c.fam); recalc(c);
        return c;
      });
      O.out[ln] = res[ln].out.filter((p) => p.t >= 0.5);
    });
    O.removed = res._removed || [];
    O.byCon = {};                                            // 계약번호-행번 → 2주 안 날짜별 톤 + 2주 밖(한 계약의 코일 전체량을 날짜별로 나눠 봄)
    LINES.forEach((ln) => {
      O.lines[ln].forEach((c) => c.items.forEach((i) => { const m = (O.byCon[i.con] = O.byCon[i.con] || { days: [], out: 0 }); m.days.push([ln, c.d, i.t]); }));
      O.out[ln].forEach((p) => { const m = (O.byCon[p.con] = O.byCon[p.con] || { days: [], out: 0 }); m.out += p.t; });
    });
  }
  /* 작업 규칙(docs/13, cg_wo_sequence 관문과 같은 값): 앞뒤 두께 차 0.3mm(2CGL 0.4t 미만 0.2) · 두께비 1.3배 · 2CGL 후처리 같은 층 다른 약액 바로 이음 금지.
     폭은 넓은 폭 → 좁은 폭, 넓힘 한도(AL 10mm·그 밖 30mm) 넘으면 새 단위(허용). 계약 단위 근사 — 코일 단위 최종 확인은 작업지시 순서 화면 */
  const TRT_NO = { '2CGL': [['KX', 'IX'], ['TX', 'SX', 'RX', 'QX', 'MX', 'GX', 'DP', 'DA', 'BX', 'BP'], ['LX', 'NX']] };
  const tg = (l, c) => (TRT_NO[l] || []).findIndex((g) => g.includes(c));
  const MAT_NO = { AZ: [['CQ', 'EDDQ'], ['CQ', 'GRE']], MAC: [['GRC', 'LFQ'], ['GRC', 'DQ'], ['GRC', 'DDQ'], ['GRC', 'EDDQ'], ['CQ', 'DDQ'], ['CQ', 'EDDQ']] };
  const GRN = { CQ: 'CQ', DQ: 'DQ', DDQ: 'DDQ', EDDQ: 'EDDQ', LFQ: 'LFQ', GRC: 'Gr.C', GRD: 'Gr.D', GRE: 'Gr.E', GRB: '구조용' };
  function hard(l, a, b, fam) {
    if (a.grade && b.grade && a.grade !== b.grade && fam) {   // 재질 온도: 바로 못 잇는 짝(올리든 내리든)
      const f = String(fam).startsWith('MAC') ? 'MAC' : fam === 'AZ' ? 'AZ' : '';
      if ((MAT_NO[f] || []).some(([p, q]) => (a.grade === p && b.grade === q) || (a.grade === q && b.grade === p))) return `재질 ${GRN[a.grade] || a.grade}↔${GRN[b.grade] || b.grade} 바로 못 이음`;
    }
    if (!a.thk || !b.thk) return '';
    const lim = l === '2CGL' && Math.min(a.thk, b.thk) < 0.4 ? 0.2 : 0.3, d2 = Math.abs(a.thk - b.thk), r = Math.max(a.thk, b.thk) / Math.min(a.thk, b.thk);
    if (d2 > lim + 1e-6) return `두께 ${a.thk.toFixed(2)}↔${b.thk.toFixed(2)}(차 ${d2.toFixed(2)}mm > ${lim})`;
    if (r > 1.3 + 1e-6) return `두께 ${a.thk.toFixed(2)}↔${b.thk.toFixed(2)}(${r.toFixed(2)}배 > 1.3)`;
    const g = tg(l, a.aft);
    if (g >= 0 && a.aft !== b.aft && g === tg(l, b.aft)) return `후처리 ${a.aft}→${b.aft} 같은 층`;
    return '';
  }
  function daySeq(l, items, fam) {                          // 현장 방식 순서(넓은 폭부터, 규칙 지키는 것 중 가장 가까운 폭, 없으면 새 단위)
    const rest = items.filter((i) => i.thk && i.wdt).map((i) => ({ thk: +i.thk, wdt: +i.wdt, aft: i.aft, fam: i.fam, grade: i.grade }));
    if (!rest.length) return [];
    rest.sort((a, b) => b.wdt - a.wdt);
    const out = [rest.shift()];
    while (rest.length) {
      const cur = out[out.length - 1], okAll = rest.filter((x) => !hard(l, cur, x, fam)), same = okAll.filter((x) => (x.grade || '') === (cur.grade || ''));
      const ok = same.length ? same : okAll, lim = String(cur.fam || '').startsWith('AL') ? 10 : 30;   // 같은 재질 먼저(폭보다 재질), 없으면 규칙 지키는 것
      const nx = ok.filter((x) => x.wdt <= cur.wdt + lim).sort((a, b) => b.wdt - a.wdt)[0] || ok.sort((a, b) => b.wdt - a.wdt)[0]
        || rest.slice().sort((a, b) => Math.abs(a.thk - cur.thk) - Math.abs(b.thk - cur.thk))[0];
      rest.splice(rest.indexOf(nx), 1); out.push(nx);
    }
    return out;
  }
  function ruleOk(it, l, d) {                                // 그날 순서 어딘가에 앞뒤 규칙을 지키며 끼울 자리가 있나
    if (!it.thk) return '';
    const c0 = cellOf(l, d), sq = daySeq(l, c0.items.filter((i) => i.con !== it.con), c0.fam), x = { thk: +it.thk, wdt: +it.wdt, aft: it.aft, grade: it.grade };
    if (!sq.length) return '';
    for (let k = 0; k <= sq.length; k++) if ((!sq[k - 1] || !hard(l, sq[k - 1], x, c0.fam)) && (!sq[k] || !hard(l, x, sq[k], c0.fam))) return '';
    const mat = sq.map((q) => hard(l, q, x, c0.fam)).find((h) => h.startsWith('재질'));
    if (mat && sq.every((q) => hard(l, q, x, c0.fam))) return `${mat}(그날 ${[...new Set(sq.map((q) => GRN[q.grade] || q.grade || '?'))].join('·')})`;
    const th = sq.map((q) => q.thk), lim = l === '2CGL' && x.thk < 0.4 ? 0.2 : 0.3;
    const lo = Math.max(x.thk / 1.3, x.thk - lim), hi = Math.min(x.thk * 1.3, x.thk + lim);
    const nearAft = sq.some((q) => !hard(l, q, Object.assign({}, x, { aft: q.aft })));
    return nearAft ? `후처리 ${x.aft}와 같은 층 다른 약액이 앞뒤에 옴` : `그날 두께 ${Math.min(...th).toFixed(2)}~${Math.max(...th).toFixed(2)}t — ${x.thk.toFixed(2)}t 앞뒤에 올 ${lo.toFixed(2)}~${hi.toFixed(2)}t 없음(두께 차 ${lim}mm·1.3배)`;
  }
  function check(it, ln, tl, td) {                           // 옮길 수 있나 + 안 되면 가장 가까운 가능한 날(강종·소재·라인·작업 규칙 모두)
    const c = cellOf(tl, td), why = [];
    if (c.cap < 1) why.push('라인 정지');
    else if (c.cap - (c.conf || 0) < 0.5) why.push('이 날은 MES 작업지시로 이미 꽉 참');
    else if (!compat(c.fam, it.fam)) why.push(`${c.fam} 가동일(${it.fam} 주문은 M/C 없이 불가)`);
    if (it.kind === '예상' && it.avail && it.avail > td) why.push(`소재 투입 ${md(it.avail)}부터`);
    if (!why.length) { const r = ruleOk(it, tl, td); if (r) why.push(`작업 규칙 — ${r}`); }
    if (!why.length) return { ok: true };
    const lines = it.pline === '공용' ? LINES : [tl];
    const cand = [];
    lines.forEach((l) => O.days.forEach((d) => { const cc = cellOf(l, d); if (fits(Object.assign({}, it, { pin: null }), cc, d) && cc.cap - (cc.conf || 0) >= 0.5 && !(l === ln && d === it.day0) && !ruleOk(it, l, d)) cand.push([Math.abs(dt(d) - dt(td)), d < td ? 0 : 1, l, d]); }));
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const bef = cand.find((x) => x[3] < td), aft = cand.find((x) => x[3] > td);
    return { ok: false, why: why.join(' · '), alt: [bef, aft].filter(Boolean).map((x) => [x[2], x[3]]) };
  }
  function preview(op) {                                     // 바꾸면 무엇이 달라지나: 생산될 날 · 밀리는/당겨지는 주문 · 새로 늦어지는 주문 · 2주 밖으로 밀림
    const cur = simulate(MOVES), nxt = simulate([...MOVES.map((m) => Object.assign({}, m)), Object.assign({}, op)]);
    const a = lastDay(cur), b = lastDay(nxt), late = (res) => { const m = {}; LINES.forEach((l) => res[l].seq.forEach((p) => { if (p.need && p.need >= O.asOf && (p.day === null || p.need < p.day)) m[p.con] = p; })); return m; };
    const la = late(cur), lb = late(nxt);
    const pushed = Object.keys(b).filter((k) => k !== op.con && b[k] > (a[k] || '0')), pulled = Object.keys(b).filter((k) => k !== op.con && a[k] && b[k] < a[k]);
    const newLate = Object.keys(lb).filter((k) => !la[k] && k !== op.con).map((k) => lb[k]);
    const outT = (res) => LINES.reduce((s2, l) => s2 + res[l].out.reduce((x, p) => x + p.t, 0), 0);
    const td = op.op === 'set' ? op.fd : op.td;
    const land = LINES.flatMap((l) => nxt[l].seq.filter((p) => p.con === op.con && p.pin === td && (p.moved || p.added || p.edited)).map((p) => [p.day, p.t]));
    const rk2 = (r) => r.con + '|' + r.why + '|' + r.fromD, had = new Set((cur._removed || []).map(rk2));
    const disp = (nxt._removed || []).filter((r) => !had.has(rk2(r)));
    disp.forEach((r) => { if (r.need && !newLate.some((x) => x.con === r.con)) newLate.push(r); });   // 빠지면 2주 안에 못 만듦 → 필요일 넘김
    return { pushed: pushed.length, pulled: pulled.length, newLate, outDiff: outT(nxt) - outT(cur), land: land[0] && land[0][0], landT: land[0] && land[0][1], disp };
  }
  function dispTxt(L) {                                      // 빠지는 주문을 주문서(계약번호)로 묶어 한 줄로
    const m = new Map();
    L.forEach((r) => { const no = r.con.split('-').slice(0, -1).join('-') || r.con, o = m.get(no) || { no, n: new Set(), t: 0, need: r.need }; o.n.add(r.con); o.t += r.t; if (r.need && (!o.need || r.need < o.need)) o.need = r.need; m.set(no, o); });
    return [...m.values()].map((o) => `<b>${esc(o.no)}</b>${o.n.size > 1 ? ` 행 ${o.n.size}개` : `-${esc([...o.n][0].split('-').pop())}`} ${n0(o.t)}t <span class="sub">필요 ${md(o.need) || '-'}</span>`).join(' · ');
  }
  const pvText = (P) => `${P.land ? `${mdw(P.land)} 생산${P.landT ? ` ${n0(P.landT)}t` : ''}` : '2주 안에 못 들어감'}`
    + (P.disp && P.disp.length ? `<div class="dsp">⚠ 이 날에서 빠지는 주문 ${n0(P.disp.reduce((a, r) => a + r.t, 0))}t(아래 목록으로): ${dispTxt(P.disp)}</div>` : '')
    + `${''}${P.pushed ? ` · 뒤 주문 ${P.pushed}건 밀림` : ''}${P.pulled ? ` · ${P.pulled}건 앞당겨짐` : ''}${!P.pushed && !P.pulled ? ' · 다른 주문 날짜 변화 없음' : ''}`
    + (P.newLate.length ? ` · <span class="no">새로 늦어지는 주문 ${P.newLate.length}건: ${P.newLate.slice(0, 4).map((p) => `${esc(p.con)}(필요 ${md(p.need)})`).join(', ')}${P.newLate.length > 4 ? ' …' : ''}</span>` : ' · 새로 늦어지는 주문 없음')
    + (P.outDiff >= 1 ? ` · <span class="no">2주 밖으로 ${n0(P.outDiff)}t 밀림</span>` : '');
  let CONF = null, SAVED = null;                             // 이번 확정본(다음 주) · 저장된 수정 내역(바뀐 게 있는지 비교)
  const cleanMoves = () => MOVES.filter((m) => !m.bad).map((m) => { const x = Object.assign({}, m); delete x.bad; delete x.short; return x; });
  const dirty = () => SAVED === null ? MOVES.length > 0 : JSON.stringify(cleanMoves()) !== SAVED;
  async function loadConfirm() {
    try {
      const nw = nextWeek(), r = await fetch(`${SB}?select=id,at,who,week,payload&week=eq.${nw[0]}&order=id.desc&limit=1`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
      const rows = r.ok ? await r.json() : [];
      if (!rows.length) return null;
      const p2 = await GP.decryptJSON(JSON.parse(rows[0].payload), PW);
      return { at: rows[0].at, who: rows[0].who, asOf: p2.asOf, moves: p2.moves || [] };
    } catch (e) { return null; }
  }
  const saveMoves = () => { try { localStorage.setItem(MV_KEY(), JSON.stringify(MOVES)); } catch (e) { /* 무시 */ } };
  try { rk = localStorage.getItem(RK_KEY) || 'win'; } catch (e) { /* 무시 */ }

  function nextWeek() {                                     // 다음 주 월~일(수요일 확정 대상)
    const t = dt(O.asOf), add = ((8 - t.getDay()) % 7) || 7;
    const m = new Date(t); m.setDate(t.getDate() + add);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return iso(d); });
  }
  const famCh = (f) => (f ? `<span class="fam fam-${esc(String(f).split('-')[0].replace(/[^A-Z]/g, ''))}">${esc(f)}</span>` : '');

  function kpis() {
    const S = O.summary, tot = (k) => LINES.reduce((s, l) => s + (S[l][k] || 0), 0);
    const win = O.risk.filter((r) => !r.od), fl = LINES.reduce((s, l) => s + (S[l].flags || 0), 0);
    const jgMin = Math.min(...O.jg.map((j) => j.cumSched - j.cumPlan));
    const k = (l, v, b, tone) => `<div class="kpi${tone ? ' tone-' + tone : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="b">${b}</div></div>`;
    return '<div class="kpis" style="margin:0 0 14px">'
      + k('2주 라인 능력', `${n0(tot('cap'))}<small>t</small>`, `작업지시 ${n0(tot('conf'))} · 소재 있음 ${n0(tot('plan'))} · 입고 예정 ${n0(tot('fcst'))} · 빈칸 ${n0(tot('gap'))}`, tot('gap') > 0 ? 'warn' : 'brand')
      + k('이미 늦은 주문', `${n0(O.odT)}<small>t · ${O.nOd}건</small>`, `필요 생산일이 이미 지났는데 아직 생산 전 — 2주 안에 먼저 넣음${(O.shipMiss || []).length ? ` · 그중 입항일 지난 수출 ${O.shipMiss.length}건(입항 지남, 배선 변경 확인)` : ''}`, O.odT > 0 ? 'bad' : 'good')
      + k('2주 안에 못 넣는 주문', `${win.length}<small>건 · ${n0(win.reduce((s, r) => s + r.t, 0))}t</small>`, '이번 2주에 필요한데 칸이 없음(소재 없음·능력 부족)', win.length ? 'warn' : 'good')
      + k('계획 ≠ 현장 지시', `${fl}<small>일</small>`, fl ? LINES.flatMap((l) => O.lines[l].filter((c) => c.flag).map((c) => `${l} ${md(c.d)}`)).join(' · ') : '재계획 강종과 현장 작업지시가 맞음', fl ? 'bad' : 'good')
      + k('자가재(컬러 투입) 진도', jgMin >= 0 ? '<span class="gv">계획 이상</span>' : `<span class="bv">${n0(-jgMin)}t 부족</span>`, '재계획 자가재 누계 대비 캘린더 누계(가장 모자란 날)', jgMin >= 0 ? 'good' : 'bad')
      + '</div>';
  }

  function cell(c, ln) {
    const cap = c.cap || 0, fill = c.conf + c.plan + c.fcst, base = Math.max(cap, fill) || 1;
    const w = (v) => `${(100 * v / base).toFixed(1)}%`;
    const gs = Object.entries(c.grp || {}).filter(([, v]) => v >= 1).slice(0, 3).map(([g, v]) => `<span>${esc(g)} ${n0(v)}</span>`).join('');
    const tag = cap < 1 ? '<span class="ev">정지</span>' : c.event ? `<span class="ev">${esc(c.event)}</span>` : '';
    const mc = /M\/C/.test(c.event || '');
    return `<button type="button" class="cell${mc ? ' mc' : ''}${c.flag ? ' fl' : ''}" data-ln="${ln}" data-d="${c.d}">`
      + `<div class="ct">${famCh(c.fam)}${tag}</div>`
      + `<div class="bar"><i class="c" style="width:${w(c.conf)}"></i><i class="p" style="width:${w(c.plan)}"></i><i class="f" style="width:${w(c.fcst)}"></i></div>`
      + `<div class="tv">${n0(fill)}<small>t</small>${c.gap ? ` <small style="color:var(--bad);font-weight:800">빈칸 ${n0(c.gap)}</small>` : ''}</div>`
      + `<div class="gl">${gs}</div>`
      + (c.flag ? `<div class="fg">⚠ ${esc(c.flagS || c.flag)}</div>` : '')
      + (c.late ? `<div class="lt">필요일 넘김 ${c.late}건</div>` : '')
      + (c.mvIn || c.mvOut ? `<div class="mvc">옮김${c.mvIn ? ` 들어옴 ${c.mvIn}` : ''}${c.mvOut ? ` 나감 ${c.mvOut}` : ''}</div>` : '')
      + '</button>';
  }

  function weekTable(days, nw) {
    const head = days.map((d) => { const wd = dt(d).getDay(); return `<th class="${nw.includes(d) ? 'nx' : wd === 0 || wd === 6 ? 'we' : ''}">${mdw(d)}${nw.includes(d) ? '<small>수요일 확정 대상</small>' : ''}</th>`; }).join('');
    const idx = (d) => O.days.indexOf(d);
    const rows = LINES.map((ln) => `<tr><th>${ln}<small>${n0(days.reduce((s, d) => s + O.lines[ln][idx(d)].cap, 0))}t</small></th>${days.map((d) => `<td>${cell(O.lines[ln][idx(d)], ln)}</td>`).join('')}</tr>`).join('');
    const jg = days.map((d) => {
      const j = O.jg[idx(d)], df = j.cumSched - j.cumPlan;
      return `<td class="jg"><div>계획 <b>${n0(j.cumPlan)}</b></div><div>배정 <b>${n0(j.cumSched)}</b></div><div class="${df < 0 ? 'bad' : 'good'}">${df < 0 ? `${n0(-df)} 부족` : `+${n0(df)}`}</div>${j.mark ? `<span class="mk">순 마감 ${n0(j.mark)}t</span>` : ''}</td>`;
    }).join('');
    return `<table class="cg"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}<tr><th>자가재<small>누계</small></th>${jg}</tr></tbody></table>`;
  }

  function calCard() {
    const nw = nextWeek();
    return '<section class="card"><h2>라인별 2주 <small>칸을 누르면 그날 작업 순서</small></h2>'
      + '<div class="lg"><span><i style="background:var(--c-conf)"></i>작업지시 = MES에 지시됨</span><span><i style="background:var(--c-plan)"></i>소재 있음 = 소재 들어온 주문</span>'
      + '<span><i style="background:var(--c-fcst)"></i>입고 예정 = 소재 들어올 주문(입고 + 5일부터)</span><span><i style="background:var(--c-gap)"></i>빈칸</span>'
      + '<span><i style="background:#fff3bf;border:1px solid #f59f00"></i>노랑 = M/C(강종 교체)</span><span><i style="background:var(--bad)"></i>빨간 줄 = 계획≠현장</span>'
      + `<span>능력·강종 = 최신 재계획 · 배정 = 필요 생산일 빠른 순(수출 = 입항 − 4일${O.expNeed && O.expNeed.due ? `, 입항 자료 없는 수출 ${O.expNeed.due}건은 납기 − 3일` : ''})</span></div>`
      + grpLine()
      + moveBar()
      + `<div class="wk">${weekTable(O.days.slice(0, 7), nw)}</div><div class="wk">${weekTable(O.days.slice(7, 14), nw)}</div></section>`;
  }
  function grpLine() {                                       // 하루 생산량은 가동 캘린더(최신 재계획)와 같고, 그룹 구성만 실제 주문 기준
    const P = {}, C = {};
    LINES.forEach((l) => O.lines[l].forEach((c) => { Object.entries(c.planGrp || {}).forEach(([g, v]) => { P[g] = (P[g] || 0) + v; }); c.items.forEach((i) => { const g = i.grp || '?'; C[g] = (C[g] || 0) + i.t; }); }));
    const G = [...new Set([...Object.keys(P), ...Object.keys(C)])].sort((a, b) => (P[b] || 0) - (P[a] || 0));
    return `<p class="msg" style="margin:0 0 10px">하루 생산량·강종 = 가동 캘린더(최신 재계획)와 같음 · 그룹 구성은 실제 주문·소재로 채움 — <b>2주 그룹별 재계획 → 실제 주문</b>: ${G.map((g) => { const d = (C[g] || 0) - (P[g] || 0); return `${esc(g)} ${n0(P[g] || 0)} → <b${Math.abs(d) > 500 ? ` style="color:${d < 0 ? 'var(--bad)' : 'var(--brand-2)'}"` : ''}>${n0(C[g] || 0)}</b>`; }).join(' · ')}</p>`;
  }
  function opText(m) {
    const ln2 = (l) => (l ? ` ${l}` : '');
    if (m.op === 'add') return `<b>${esc(m.con)}</b> ${n0(m.t)}t 넣기 → <b>${mdw(m.td)}${ln2(m.tl)}</b>`;
    if (m.op === 'remove') return `<b>${esc(m.con)}</b> ${n0(m.t)}t 빼기 ← ${mdw(m.fd)}${ln2(m.fl)}`;
    if (m.op === 'set') return `<b>${esc(m.con)}</b> ${mdw(m.fd)}${ln2(m.fl)} 톤 ${n0(m.from)} → <b>${n0(m.t)}t</b>${m.short ? ` <span class="sub">(더 당겨 올 물량 없음 ${n0(m.short)}t)</span>` : ''}`;
    return `<b>${esc(m.con)}</b> ${n0(m.t)}t · ${m.fl} ${mdw(m.fd)} → <b>${mdw(m.td)}${m.fl !== m.tl ? ` ${m.tl}` : ''}</b>`;
  }
  function swapBox() {
    return `<div class="swb"><b>날이 넘칠 때</b><label><input type="radio" name="swp" value="1"${SWAP ? ' checked' : ''}> 필요일 늦은 주문을 빼서 아래 목록으로</label><label><input type="radio" name="swp" value="0"${SWAP ? '' : ' checked'}> 뒤 주문을 순서대로 밀기</label></div>`;
  }
  function moveBar() {
    if (!MOVES.length) return swapBox() + '<p class="msg" style="margin:0 0 10px">칸을 누르면 주문마다 「옮기기·톤」 · 「빼기」, 아래 「칸에 못 들어간 주문」은 「넣기」 — 넣고 빼면서 맞추면 됨.</p>';
    const rmT = (O.removed || []).reduce((a, p) => a + p.t, 0);
    const outs = LINES.flatMap((l) => (O.out[l] || []).map((p) => [l, p])), oT = outs.reduce((a, [, p]) => a + p.t, 0);
    return swapBox() + `<div class="mvbar"><b>바꾼 것 ${MOVES.length}건</b>${rmT >= 0.5 ? `<span class="msg">뺀 주문 ${(O.removed || []).length}건 ${n0(rmT)}t → 아래 목록 「뺀 주문」</span>` : ''}<span class="msg">${dirty() ? '아직 저장 안 됨 — 아래 「다음 주 생산 확정」에서 저장' : '확정본에 저장됨'}</span><button type="button" class="lnk" id="mv-clear">모두 되돌리기</button><ul>`
      + MOVES.map((m, k) => `<li${m.bad ? ' class="bad"' : ''}>${opText(m)}${m.bad ? ' · 원래 칸에 없음(자료 갱신)' : ''} <button type="button" class="lnk" data-undo="${k}">되돌리기</button></li>`).join('')
      + `</ul>${oT >= 1 ? `<span class="msg" style="color:var(--bad)">밀려서 2주 밖으로 나간 주문 ${outs.length}조각 ${n0(oT)}t: ${outs.slice(0, 6).map(([l, p]) => `${esc(p.con)} ${n0(p.t)}t`).join(' · ')}${outs.length > 6 ? ' …' : ''}</span>` : ''}</div>`;
  }

  const who = (i) => [i.cus && esc(i.cus), i.dst && `<span class="nw">→ ${esc(i.dst)}</span>`, i.man && `<span class="nw">담당 ${esc(i.man)}</span>`].filter(Boolean).join(' · ');
  function moveOpts(i, ln, d) {                              // 옮길 날 목록: 안 되는 날은 이유와 함께(고르면 가장 가까운 가능한 날 제시)
    const lines = i.pline === '공용' ? LINES : [i.pline || ln], opt = [];
    lines.forEach((l) => O.days.forEach((dd) => {
      if (l === ln && dd === d) return;
      const ck = check(Object.assign({}, i, { day0: d }), ln, l, dd);
      opt.push(`<option value="${l}|${dd}">${mdw(dd)}${l !== ln ? ' ' + l : ''}${ck.ok ? '' : ' — 불가'}</option>`);
    }));
    return opt.join('');
  }
  function maxT(i, ln) {                                    // 이 날 늘릴 수 있는 최대 = 같은 주문(같은 라인·같은 구분)의 2주 안 다른 날 + 2주 밖
    let t = 0;
    O.lines[ln].forEach((c) => c.items.forEach((x) => { if (x.con === i.con && x.kind === i.kind) t += x.t; }));
    (O.out[ln] || []).forEach((x) => { if (x.con === i.con && x.kind === i.kind) t += x.t; });
    return r1(Math.max(t, i.t));
  }
  function conTxt(i, ln, d) {                               // 이 계약 전체: 주문량 · 이미 생산 · 다른 날 · 2주 밖
    const m = O.byCon[i.con] || { days: [], out: 0 }, oth = m.days.filter(([l, dd]) => !(l === ln && dd === d));
    const rest = (i.ordT || 0) - (i.prodT || 0) - m.days.reduce((a, x) => a + x[2], 0);   // 주문량 − 생산 − 2주 캘린더 = 그 뒤(2주 밖·허용차)
    const parts = [i.ordT ? `계약 ${n0(i.ordT)}` : '', i.prodT >= 0.5 ? `생산 ${n0(i.prodT)}` : '', oth.length ? `다른 날 ${oth.slice(0, 2).map(([l, dd, t]) => `${md(dd)}${l !== ln ? ' ' + l : ''} ${n0(t)}`).join('·')}${oth.length > 2 ? '…' : ''}` : '', rest >= 5 ? `2주 뒤 ${n0(rest)}` : ''].filter(Boolean);
    return parts.length ? `<div class="sub xs" title="${esc(parts.join(' · '))}">${parts.join(' · ')}</div>` : '';
  }
  function itemRows(L0, ln, d) {
    let n = 0;
    const L = [], at = {};                                    // 같은 주문의 편성·예상 조각은 한 줄로(옮기기는 앞 조각 기준)
    L0.forEach((i, k) => {
      if (i.kind !== '확정' && at[i.con] != null) {
        const a = L[at[i.con]];
        if (a.kind === '예상' && i.kind === '편성') { const tt = a.tt + i.t; Object.assign(a, i, { k, tt, extra: tt - i.t, xk: '예상' }); return; }   // 편성 조각을 기준으로
        a.tt += i.t; a.extra = (a.extra || 0) + i.t; a.xk = i.kind; return;
      }
      if (i.kind !== '확정') at[i.con] = L.length;
      L.push(Object.assign({}, i, { k, tt: i.t }));
    });
    return L.map((i) => {
      const k = i.k;
      const need = i.od ? `<span class="bd od" title="필요 생산일이 이미 지남">필요 ${md(i.need)} 지남</span>` : i.late ? `<span class="bd late" title="이 날 생산하면 필요 생산일보다 늦음">필요 ${md(i.need)} 넘김</span>` : i.need ? `필요 <b>${md(i.need)}</b>` : '';
      const tags = [i.moved ? `<span class="bd mv">옮김 ← ${md(i.moved.fd)}${i.moved.fl !== ln ? ' ' + i.moved.fl : ''}</span>` : i.shift ? `<span class="bd ${i.shift === '뒤로 밀림' ? 'late' : 'mv'}" title="다른 주문을 옮기거나 넣어서 날짜가 바뀜">${i.shift}</span>` : i.locked ? '<span class="bd mv">확정본</span>' : '',
        i.matLate ? `<span class="bd od">소재 ${md(i.avail)}부터</span>` : '', i.shipMiss ? '<span class="bd od" title="배 입항일이 지났는데 아직 생산 전 — 배선 변경 확인">입항 지남</span>' : ''].filter(Boolean).join(' ');
      const seq = i.kind === '확정' ? (i.seq || k + 1) : ++n;
      return `<tr class="r${i.kind}"><td class="sq"><span class="kd k${i.kind}">${KD[i.kind]}</span> ${seq}</td>`
        + `<td><div class="con">${esc(i.con)}</div><div class="sub one">${who(i)}</div></td>`
        + `<td><span class="chs1">${famCh(i.fam)}${i.grade ? `<span class="ch gr">${esc(GRN[i.grade] || i.grade)}</span>` : ''}${i.exp ? '<span class="ch exp">수출</span>' : '<span class="ch">내수</span>'}${i.cot ? `<span class="ch">${esc(i.cot)}</span>` : ''}${i.aft ? `<span class="ch">${esc(i.aft)}</span>` : ''}</span></td>`
        + `<td class="sz">${i.thk != null ? `${(+i.thk).toFixed(2)}×${n0(i.wdt)}` : '-'}</td><td class="nw"><b>${esc(i.grp || '')}</b></td>`
        + `<td class="num"><b>${(+i.tt).toFixed(1)}</b>${i.extra ? `<div class="sub xs">${KD[i.xk]} ${(+i.extra).toFixed(1)}</div>` : ''}${conTxt(i, ln, d)}</td>`
        + `<td class="nw dt2">${[i.arr ? `입항 <b>${md(i.arr)}</b>` : i.due ? `납기 ${md(i.due)}` : '', need].filter(Boolean).join(' · ')}${tags ? `<div>${tags}</div>` : ''}</td>`
        + `<td class="nw">${i.kind === '확정' ? '<span class="sub">MES 지시됨</span>' : `<button type="button" class="lnk mvb" data-k="${k}">옮기기·톤</button> <button type="button" class="lnk rmb" data-k="${k}" title="이 날에서 빼서 아래 「칸에 못 들어간 주문」 목록으로">빼기</button>`}</td></tr>`
        + (i.kind === '확정' ? '' : `<tr class="mvr" id="mvr-${k}" hidden><td></td><td colspan="7"><div class="mvw"><b>${esc(i.con)}</b><input type="number" class="mvt" value="${(+i.t).toFixed(1)}" min="0.1" max="${i.t}" step="0.1" aria-label="옮길 톤">t 를`
          + `<select class="mv" data-k="${k}" aria-label="옮길 날짜"><option value="">날짜 고르기…</option>${moveOpts(i, ln, d)}</select>(으)로 <button type="button" class="go2" data-k="${k}" disabled>옮기기</button></div><div class="pv" id="pv-${k}"></div>`
          + `<div class="mvw" style="margin-top:8px"><b>이 날 톤</b><input type="number" class="mvs" data-k="${k}" value="${(+i.t).toFixed(1)}" min="0" max="${maxT(i, ln)}" step="0.1" aria-label="이 날 톤">t 로 <button type="button" class="go3" data-k="${k}" disabled>톤 바꾸기</button><span class="sub">최대 ${n0(maxT(i, ln))}t(이 계약 남은 양)</span></div><div class="pv" id="pv3-${k}"></div></td></tr>`);
    }).join('');
  }
  function csv(rows, name) {
    const H = ['순서', '상태', '계약번호-행번', '그룹', '고객사', '목적지', '강종', '두께', '폭', '도금량', '후처리', '톤', '납기', '필요 생산일'];
    const q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = rows.map((i, k) => [i.seq || k + 1, KD[i.kind] || i.kind, i.con, i.grp, i.cus, i.dst, i.fam, i.thk, i.wdt, i.cot, i.aft, (+i.t).toFixed(1), i.due, i.need].map(q).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [H.join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function openDay(ln, d) {
    const c = O.lines[ln][O.days.indexOf(d)], dlg = $('cc-dlg');
    const pg = Object.entries(c.planGrp || {}).filter(([, v]) => v >= 1).map(([g, v]) => `${g} ${n0(v)}`).join(' · ');
    let body = c.flag ? `<div class="fgl">⚠ ${esc(c.flag)}${c.flag.startsWith('재질') ? '' : ' — '}${c.flag.startsWith('재질') ? '' : c.flag.startsWith('계획') ? '현장 순서가 우선. M/C·강종 날짜를 재계획에 반영할지 확인' : c.flag.startsWith('옮긴') || c.flag.startsWith('확정본에') ? 'M/C 없이는 이날 생산 불가 — 다른 날로 옮기기' : '능력보다 많음 — 일부를 다른 날로 옮기기'}</div>` : '';
    if (c.why) body += `<div class="fgl" style="background:var(--warn-bg);color:var(--warn)">빈칸 ${n0(c.gap)}t — ${esc(c.why)}</div>`;
    body += '<div class="how"><div><b>이 날에 들어온 기준</b> 필요 생산일(수출 = 입항 − 4일, 내수 = 납기 − 3일) 빠른 주문부터, 그날 라인·강종이 맞는 것을 능력만큼 · 소재 있는 주문 먼저, 입고 예정 주문은 입고 + 5일부터</div>'
      + '<div><b>순서</b> 작업지시 = MES 순서 그대로 · 나머지 = 현장 규칙(같은 재질끼리 묶고 → 넓은 폭 → 좁은 폭, 같은 폭이면 얇은 것 먼저, 재질 차례는 바로 못 잇는 짝이 붙지 않게)</div>'
      + '<div><b>옮기기</b> 24시간 연속 가동 = 라인마다 한 줄 순서. 고른 날 맨 앞에 끼워 넣고 뒤 주문은 순서대로 밀림(능력 초과 없음) · 불가 = 강종(M/C)·소재 입고일·라인 정지·작업 규칙(그날 주문과 두께 차 0.3mm·두께비 1.3배·후처리 같은 층·재질 온도 AZ CQ↔EDDQ·Gr.E, PosMAC Gr.C↔DQ계·CQ↔DDQ) → 모두 지키는 가장 가까운 날 제시 · 코일 단위 최종 확인은 작업지시 순서 · 「다음 주 확정」을 눌러야 저장</div></div>';
    body += c.items.length ? `<table class="it cmp"><colgroup><col style="width:8%"><col style="width:23%"><col style="width:16%"><col style="width:9%"><col style="width:5%"><col style="width:12%"><col style="width:15%"><col style="width:7%"></colgroup>`
      + `<thead><tr><th>상태 · 순서</th><th>계약번호-행번 · 고객사 → 목적지</th><th>강종 · 재질 · 수출 · 도금량 · 후처리</th><th>두께×폭</th><th>그룹</th><th class="num">이 날 톤 · 계약 전체</th><th>입항(납기) · 필요 생산일</th><th></th></tr></thead><tbody>${itemRows(c.items, ln, d)}</tbody></table>`
      : `<p class="msg">${c.cap < 1 ? '라인 정지(정기수리·휴지)' : '배정된 주문 없음'}</p>`;
    dlg.innerHTML = `<div class="dh"><b>${ln} ${mdw(d)}</b><span>${famCh(c.fam)}${c.event ? ' · ' + esc(c.event) : ''}</span><span>능력 <b>${n0(c.cap)}t</b> = ${[['작업지시', c.conf], ['소재 있음', c.plan], ['입고 예정', c.fcst], ['빈칸', c.gap]].filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} ${n0(v)}`).join(' + ')}</span>`
      + `${pg ? `<span>재계획: ${pg}</span>` : ''}<span class="x"><button type="button" id="cc-csv">CSV</button><button type="button" id="cc-x" aria-label="닫기">닫기 ×</button></span></div><div class="db">${body}</div>`;
    $('cc-x').onclick = () => dlg.close();
    $('cc-csv').onclick = () => csv(c.items, `도금_${ln}_${d}.csv`);
    dlg.querySelectorAll('button.mvb').forEach((b) => b.onclick = () => { const r = $('mvr-' + b.dataset.k); r.hidden = !r.hidden; });
    const tOf = (r, it) => { const v = +r.querySelector('.mvt').value; return Math.min(it.t, v > 0 ? r1(v) : it.t); };
    const show = (k) => {                                    // 날짜를 고르면: 불가 이유 + 가까운 가능한 날 / 가능하면 영향(밀림·새로 늦음·2주 밖)
      const r = $('mvr-' + k), it = c.items[+k], sel = r.querySelector('select.mv'), go = r.querySelector('button.go2'), pv = $('pv-' + k);
      if (!sel.value) { pv.innerHTML = ''; go.disabled = true; return; }
      const [tl, td] = sel.value.split('|'), ck = check(Object.assign({}, it, { day0: d }), ln, tl, td);
      if (!ck.ok) {
        go.disabled = true;
        pv.innerHTML = `<span class="no">불가 — ${mdw(td)} ${tl}: ${esc(ck.why)}</span>${ck.alt.length ? ` · 가능한 가장 가까운 날 ${ck.alt.map(([l, dd]) => `<button type="button" class="lnk alt" data-v="${l}|${dd}">${mdw(dd)}${l !== tl ? ' ' + l : ''}</button>`).join(' ')}` : ' · 2주 안에 가능한 날 없음'}`;
        pv.querySelectorAll('button.alt').forEach((x) => x.onclick = () => { sel.value = x.dataset.v; show(k); });
        return;
      }
      const P = preview({ con: it.con, kind: it.kind, t: tOf(r, it), fl: ln, fd: d, tl, td, swap: SWAP });
      go.disabled = false;
      pv.innerHTML = `<span class="ok">가능</span> · ${pvText(P)}`;
    };
    const setOp = (k) => { const it = c.items[+k], v = +$('mvr-' + k).querySelector('.mvs').value, mx = maxT(it, ln); return { op: 'set', con: it.con, kind: it.kind, fl: ln, fd: d, from: it.t, t: Math.min(mx, Math.max(0, r1(v))), swap: SWAP }; };
    const show3 = (k) => {                                   // 톤을 바꾸면: 이 날 실제 들어가는 톤 · 밀림/당겨짐 · 새로 늦어짐
      const op = setOp(k), go = $('mvr-' + k).querySelector('button.go3'), pv = $('pv3-' + k);
      if (Math.abs(op.t - op.from) < 0.05) { pv.innerHTML = ''; go.disabled = true; return; }
      go.disabled = false;
      pv.innerHTML = `<span class="ok">${op.t < op.from ? `줄임 — 나머지 ${n0(op.from - op.t)}t는 다음 날부터` : `늘림 — 같은 주문의 뒤쪽 물량 ${n0(op.t - op.from)}t를 당겨 옴`}</span> · ${pvText(preview(op))}`;
    };
    dlg.querySelectorAll('button.rmb').forEach((b) => b.onclick = () => {
      const it = c.items[+b.dataset.k];
      MOVES.push({ op: 'remove', con: it.con, kind: it.kind, t: it.t, fl: ln, fd: d });
      saveMoves(); applyMoves(); render();
      if (window.UI && UI.toast) UI.toast(`${it.con} ${n0(it.t)}t 뺌 → 아래 목록`);
      openDay(ln, d);
    });
    dlg.querySelectorAll('input.mvs').forEach((x) => x.oninput = () => show3(x.dataset.k));
    dlg.querySelectorAll('button.go3').forEach((b) => b.onclick = () => {
      const op = setOp(b.dataset.k); MOVES.push(op);
      saveMoves(); applyMoves(); render();
      if (window.UI && UI.toast) UI.toast(`${op.con} ${mdw(d)} ${n0(op.from)} → ${n0(op.t)}t`);
      openDay(ln, d);
    });
    dlg.querySelectorAll('select.mv').forEach((x) => x.onchange = () => show(x.dataset.k));
    dlg.querySelectorAll('input.mvt').forEach((x) => x.onchange = () => show(x.closest('tr').id.slice(4)));
    dlg.querySelectorAll('button.go2').forEach((b) => b.onclick = () => {
      const r = $('mvr-' + b.dataset.k), it = c.items[+b.dataset.k], v = r.querySelector('select.mv').value;
      if (!v) { r.querySelector('select.mv').focus(); return; }
      const [tl, td] = v.split('|'), t = tOf(r, it);
      MOVES.push({ con: it.con, kind: it.kind, t, fl: ln, fd: d, tl, td, swap: SWAP });
      saveMoves(); applyMoves(); render();
      if (window.UI && UI.toast) UI.toast(`${it.con} ${n0(t)}t → ${mdw(td)} ${tl}`);
      openDay(ln, d);
    });
    if (!dlg.open) dlg.showModal();
  }

  function byOrder(R) {                                     // 같은 주문서(계약번호)의 행은 한 줄로
    const m = new Map();
    R.forEach((r) => { const no = r.con.split('-').slice(0, -1).join('-') || r.con, o = m.get(no) || { no, rows: [], t: 0, need: r.need }; o.rows.push(r); o.t += r.t; if (r.need < o.need) o.need = r.need; m.set(no, o); });
    return [...m.values()].sort((a, b) => (a.need < b.need ? -1 : a.need > b.need ? 1 : b.t - a.t));
  }
  const addedCons = () => new Set(MOVES.filter((m) => m.op === 'add' && !m.bad).map((m) => m.con));
  function riskCard() {
    const T = {
      rm: ['뺀 주문 · 다시 넣기', (r) => r.rm],
      win: ['2주 안에 필요 · 못 넣음', (r) => !r.od && !r.rm],
      od: ['이미 늦은 주문 · 못 넣음', (r) => r.od && !r.stale && !r.rm],
      st: ['30일 넘게 늦음 · 취소/잔량 확인', (r) => r.stale && !r.rm],
    };
    const AD = addedCons();
    const asRow = (p, why) => ({ con: p.con, t: p.t, need: p.need, line: p.pline, fam: p.fam, grp: p.grp, cus: p.cus, man: p.man, dst: p.dst, due: p.due, st: why.startsWith('밀려서') ? '2주 밖' : `${md(p.fromD)} ${p.fromL}에서`, why, rm: true,
      items: [Object.assign({}, p, { day: null, pin: null, moved: null, edited: null, added: null })] });
    const RM = [...(O.removed || []).map((p) => asRow(p, p.why)), ...LINES.flatMap((l) => (O.out[l] || []).map((p) => asRow(p, '밀려서 2주 밖')))];
    if (!RM.length && rk === 'rm') rk = 'win';
    const R0 = [...RM, ...O.risk.filter((r) => !AD.has(r.con))];
    const L = R0.filter(T[rk][1]);
    const byG = {};
    L.forEach((r) => { (byG[r.grp || '그룹 없음'] = byG[r.grp || '그룹 없음'] || []).push(r); });
    if (!RM.length) delete T.rm;
    const seg = Object.entries(T).map(([k, [nm, f]]) => `<button type="button" data-rk="${k}" aria-pressed="${k === rk}">${nm} ${R0.filter(f).length}</button>`).join('');
    let oi = 0;
    const grp = Object.entries(byG).sort((a, b) => b[1].reduce((s, r) => s + r.t, 0) - a[1].reduce((s, r) => s + r.t, 0)).map(([g, R]) => {
      const why = {};
      R.forEach((r) => { why[r.why] = (why[r.why] || 0) + r.t; });
      return `<div class="rg"><h3>${esc(g)} <span>${R.length}건 · ${n0(R.reduce((s, r) => s + r.t, 0))}t</span>${Object.entries(why).map(([w, t]) => `<span>${esc(w)} ${n0(t)}t</span>`).join('')}</h3>`
        + `<div style="overflow-x:auto"><table class="it" style="min-width:860px;table-layout:fixed"><colgroup><col style="width:28%"><col style="width:9%"><col style="width:12%"><col style="width:8%"><col style="width:9%"><col style="width:27%"><col style="width:7%"></colgroup><thead><tr><th>계약번호 · 고객사 → 목적지</th><th>라인 · 강종</th><th>상태</th><th class="num">못 넣은 톤</th><th>필요 생산일</th><th>이유</th><th></th></tr></thead><tbody>`
        + byOrder(R).map((o) => {
          const id = 'ra-' + (oi++);
          const pieces = o.rows.flatMap((r) => (r.items || []).map((it) => Object.assign({}, it, { _line: r.line })));
          const edit = pieces.map((it, j) => {
            const lines = it.pline === '공용' ? LINES : [it.pline || it._line];
            const opts = lines.flatMap((l) => O.days.map((dd) => { const ck = check(it, null, l, dd); return `<option value="${l}|${dd}">${mdw(dd)} ${l}${ck.ok ? '' : ' — 불가'}</option>`; })).join('');
            return `<div class="mvw" style="margin-top:${j ? 8 : 0}px"><b>${esc(it.con)}</b><span class="kd k${it.kind}">${KD[it.kind]}</span><span class="sz">${it.thk != null ? `${(+it.thk).toFixed(2)}×${n0(it.wdt)}` : ''}</span>`
              + `<input type="number" class="mvt" value="${(+it.t).toFixed(1)}" min="0.1" max="${it.t}" step="0.1" aria-label="넣을 톤">t 를<select class="ad" aria-label="넣을 날짜"><option value="">날짜 고르기…</option>${opts}</select>에 <button type="button" class="go2 adg" disabled>넣기</button></div><div class="pv"></div>`;
          }).join('');
          RA[id] = pieces;
          return `<tr><td><div class="con">${esc(o.no)}${o.rows.length > 6 ? ` <span class="sub">행 ${o.rows.length}개</span>` : o.rows.length > 1 ? ` <span class="sub">행 ${o.rows.map((r) => esc(r.con.split('-').pop())).join('·')}</span>` : `-${esc(o.rows[0].con.split('-').pop())}`}</div><div class="sub one" title="${esc([o.rows[0].cus, o.rows[0].dst, o.rows[0].man].filter(Boolean).join(' · '))}">${who(o.rows[0])}</div></td>`
            + `<td class="nw">${esc(o.rows[0].line)} ${famCh(o.rows[0].fam)}</td><td>${[...new Set(o.rows.map((r) => r.st || ''))].map(esc).join(' · ')}</td>`
            + `<td class="num"><b>${n0(o.t)}</b></td><td class="nw">${md(o.need)}${o.rows[0].due ? `<div class="sub">납기 ${md(o.rows[0].due)}</div>` : ''}</td><td>${[...new Set(o.rows.map((r) => r.why))].map(esc).join('<br>')}</td>`
            + `<td class="nw">${pieces.length ? `<button type="button" class="lnk rab" data-id="${id}">${o.rows[0].rm ? '다시 넣기' : '넣기'}</button>` : ''}</td></tr>`
            + (pieces.length ? `<tr class="mvr" id="${id}" hidden><td colspan="7">${edit}</td></tr>` : '');
        }).join('')
        + '</tbody></table></div></div>';
    }).join('');
    return `<section class="card"><h2>칸에 못 들어간 주문 <small>그룹별 · 「넣기」로 원하는 날에 넣을 수 있음(강종·소재·작업 규칙 확인)</small></h2><div class="seg" id="cc-rk">${seg}</div>${grp || '<p class="msg">없음</p>'}</section>`;
  }
  const RA = {};
  function bindRisk() {
    document.querySelectorAll('button.rab').forEach((b) => b.onclick = () => { const r = $(b.dataset.id); r.hidden = !r.hidden; });
    document.querySelectorAll('tr.mvr[id^="ra-"]').forEach((tr) => {
      const P = RA[tr.id];
      tr.querySelectorAll('.mvw').forEach((w, j) => {
        const it = P[j], sel = w.querySelector('select.ad'), go = w.querySelector('button.adg'), pv = w.nextElementSibling, tIn = w.querySelector('.mvt');
        const op = () => { const [tl, td] = sel.value.split('|'); return { op: 'add', con: it.con, kind: it.kind, t: Math.min(it.t, Math.max(0.1, r1(+tIn.value || it.t))), tl, td, item: it, swap: SWAP }; };
        const show = () => {
          if (!sel.value) { pv.innerHTML = ''; go.disabled = true; return; }
          const o = op(), ck = check(it, null, o.tl, o.td);
          if (!ck.ok) {
            go.disabled = true;
            pv.innerHTML = `<span class="no">불가 — ${mdw(o.td)} ${o.tl}: ${esc(ck.why)}</span>${ck.alt.length ? ` · 가능한 가장 가까운 날 ${ck.alt.map(([l, dd]) => `<button type="button" class="lnk alt" data-v="${l}|${dd}">${mdw(dd)} ${l}</button>`).join(' ')}` : ' · 2주 안에 가능한 날 없음'}`;
            pv.querySelectorAll('button.alt').forEach((x) => x.onclick = () => { sel.value = x.dataset.v; show(); });
            return;
          }
          go.disabled = false;
          pv.innerHTML = `<span class="ok">가능</span> · ${pvText(preview(o))}`;
        };
        sel.onchange = show; tIn.onchange = show;
        go.onclick = () => { const o = op(); MOVES.push(o); saveMoves(); applyMoves(); render(); if (window.UI && UI.toast) UI.toast(`${o.con} ${n0(o.t)}t → ${mdw(o.td)} ${o.tl}`); };
      });
    });
  }

  function confirmCard() {
    const nw = nextWeek(), A = O.adherence || [], C = O.confirms || [];
    let who = ''; try { who = localStorage.getItem(WHO_KEY) || ''; } catch (e) { /* 무시 */ }
    const tot = (ln) => nw.reduce((s, d) => { const c = O.lines[ln][O.days.indexOf(d)]; return s + (c ? c.conf + c.plan + c.fcst : 0); }, 0);
    const kst = (t) => { const x = new Date(new Date(t).getTime() + 9 * 36e5).toISOString(); return `${+x.slice(5, 7)}/${+x.slice(8, 10)} ${x.slice(11, 16)}`; };
    const dt2 = dirty(), n = MOVES.length;
    const stat = CONF ? `<b class="okc">확정됨</b> ${kst(CONF.at)}${CONF.who && CONF.who !== '도금 수주' ? ` · ${esc(CONF.who)}` : ''}${CONF.asOf === O.asOf && CONF.moves.length ? ` · 바꾼 것 ${CONF.moves.length}건 포함` : ''}${dt2 ? ` · <b class="no">저장 안 된 수정 있음</b>` : ''}` : (n ? `<b class="no">아직 확정 안 함</b> · 바꾼 것 ${n}건` : '<b class="no">아직 확정 안 함</b>');
    const btn = !CONF ? '다음 주 확정' : dt2 ? '수정 저장' : '다시 저장';
    const adh = A.length ? '<table class="it" style="max-width:820px"><thead><tr><th>확정 주</th><th>저장</th><th class="num">확정 톤</th><th class="num">그 주 실제 생산</th><th class="num">준수율</th><th>라인별</th></tr></thead><tbody>'
      + A.map((a) => `<tr><td class="nw">${mdw(a.week)}~</td><td class="sub nw">${esc(a.who)} ${esc(String(a.at).slice(5, 16).replace('T', ' '))}</td><td class="num">${n0(a.confT)}</td><td class="num">${n0(a.doneT)}</td>`
        + `<td class="num"><b>${a.rate == null ? '-' : Math.round(a.rate * 100) + '%'}</b></td><td class="nw">${Object.entries(a.lines || {}).map(([l, v]) => `${l} ${v.confT ? Math.round(100 * v.doneT / v.confT) : '-'}%`).join(' · ')}</td></tr>`).join('') + '</tbody></table>'
      : '<p class="msg">아직 확정한 주 없음</p>';
    return `<section class="card"><h2>다음 주 생산 확정 <small>매주 수요일 오전 · ${mdw(nw[0])} ~ ${mdw(nw[6])}</small></h2>`
      + '<p class="msg" style="margin:0 0 10px">위 캘린더의 다음 주(파란 머리 칸) 날짜별 생산 주문을 저장 = 공정출하·마케팅과 약속한 주간 편성. 저장한 뒤에도 칸에서 옮기기·톤 바꾸기·넣기로 고치고 「수정 저장」하면 최신본이 기준. 다음 주가 지나면 지킨 비율(준수율)을 아래에 표시</p>'
      + `<div class="cf"><span class="nw">다음 주 생산 1CGL <b>${n0(tot('1CGL'))}t</b> · 2CGL <b>${n0(tot('2CGL'))}t</b></span>`
      + `<button type="button" class="go" id="cc-save">${btn}</button><span class="msg" id="cc-smsg">${stat}</span>`
      + `<input id="cc-who" placeholder="저장한 사람(선택)" value="${esc(who)}" maxlength="20" aria-label="저장한 사람 이름(선택, 기록용)" title="여러 사람이 저장할 때 누가 했는지 남기는 칸 — 비워도 됨"></div>`
      + `${adh}</section>`;
  }

  async function save() {
    const nw = nextWeek(), w = $('cc-who').value.trim() || '도금 수주', b = $('cc-save'), m = $('cc-smsg');   // 이름은 기록용(비우면 '도금 수주')
    try { localStorage.setItem(WHO_KEY, $('cc-who').value.trim()); } catch (e) { /* 무시 */ }
    const lines = {};
    const pack = (c) => c.items.map((i) => [i.con, +(+i.t).toFixed(1), i.kind]);
    LINES.forEach((ln) => { lines[ln] = {}; nw.forEach((d) => { const c = cellOf(ln, d); if (c) lines[ln][d] = pack(c); }); });
    const extra = {};                                         // 다음 주 밖이지만 옮긴 날(이번 주 등)도 같이 고정
    MOVES.filter((m) => !m.bad).forEach((m) => [[m.fl, m.fd], [m.tl, m.td]].forEach(([l, d]) => { if (l && d && O.days.includes(d) && !nw.includes(d)) { extra[l] = extra[l] || {}; extra[l][d] = pack(cellOf(l, d)); } }));
    b.disabled = true; m.textContent = '저장 중…';
    try {
      const env = await GP.encryptJSON({ week: nw[0], asOf: O.asOf, built: O.built, lines, extra, moves: cleanMoves() }, PW, `도금 주간 확정 ${nw[0]}`);
      const r = await fetch(SB, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ who: w, week: nw[0], payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      CONF = { at: new Date().toISOString(), who: w, asOf: O.asOf, moves: cleanMoves() }; SAVED = JSON.stringify(CONF.moves);
      render();
      if (window.UI && UI.toast) UI.toast('다음 주 생산 확정 저장됨');
      return;
    } catch (e) { m.textContent = '⚠ 저장 실패: ' + e.message; }
    b.disabled = false;
  }

  function render() {
    const stale = Math.round((Date.now() - dt(O.asOf).getTime()) / 864e5);
    $('cc-main').innerHTML = (stale >= 2 ? `<div class="card" style="background:var(--warn-bg);color:var(--warn);font-weight:700">자료 기준 ${md(O.asOf)} — ${stale}일 전 자료</div>` : '')
      + kpis() + calCard() + confirmCard() + riskCard()
      + `<p class="msg" style="margin:4px 4px 0">자료 ${esc(O.asOf)} · ${esc(O.planSrc || '')} · 계산 ${esc(O.built || '')}</p>`;
    $('cc-main').querySelectorAll('button.cell').forEach((b) => b.onclick = () => openDay(b.dataset.ln, b.dataset.d));
    $('cc-main').querySelectorAll('#cc-rk button').forEach((b) => b.onclick = () => { rk = b.dataset.rk; try { localStorage.setItem(RK_KEY, rk); } catch (e) { /* 무시 */ } render(); });
    $('cc-save').onclick = save;
    bindRisk();
    document.querySelectorAll('input[name="swp"]').forEach((x) => x.onchange = () => { SWAP = x.value === '1'; try { localStorage.setItem('cgl-cal-swap2', x.value); } catch (e) { /* 무시 */ } });
    if ($('mv-clear')) $('mv-clear').onclick = () => { MOVES = []; saveMoves(); applyMoves(); render(); };
    $('cc-main').querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => { MOVES.splice(+b.dataset.undo, 1); saveMoves(); applyMoves(); render(); });
    if (window.UI) UI.reveal($('cc-main'));
  }
  $('cc-dlg').addEventListener('click', (e) => { if (e.target === $('cc-dlg')) $('cc-dlg').close(); });
  const envReady = GP.latest('cg_calendar.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('cc-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); PW = pw; try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('cc-form').hidden = false; $('cc-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    O.base = JSON.parse(JSON.stringify(O.lines));
    CONF = await loadConfirm();
    let draft = null; try { draft = localStorage.getItem(MV_KEY()); } catch (e) { /* 무시 */ }
    const same = CONF && CONF.asOf === O.asOf;               // 같은 자료로 저장한 확정본이면 그 수정 내역을 그대로 불러와 이어서 고침(다음 날부터는 계산에 이미 고정돼 들어옴)
    MOVES = draft !== null ? (() => { try { return JSON.parse(draft); } catch (e) { return []; } })() : (same ? CONF.moves : []);
    SAVED = CONF ? JSON.stringify(same ? CONF.moves : []) : null;
    applyMoves();
    render();
  }
  $('cc-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('cc-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('cc-form').hidden = false; });
})();
