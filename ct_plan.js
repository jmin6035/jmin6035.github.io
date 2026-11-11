/* 04 생산계획 › 생산 일정(11/11 생산 화면 통합 — 사용자 '생산 캘린더·주간 생산일정·라인부하·계획변경 다 비슷한 것 아니가')
   한 화면 = 맨 위 결론(이번 주 라인별 편성·부하·넘침 · 다음 주 확정 · 계획 변경·이번 달 부하 한 줄) → 2주 캘린더(#cg 도금 · #cc 컬러, 보기와 맞춤)
   세부 화면(메뉴 # 주소): #load 라인 부하 · #cmp 계획 변경. 옛 #week(통합 생산일정) = 캘린더와 같은 숫자 → #cg/#cc 로.
   캘린더 본체 = cg_calendar.js(옮기기·다음 주 확정) · cc_calendar.js — 결론 칸은 그 모듈이 PS.sum 으로 채움 */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD } = CT;
  const $ = (id) => document.getElementById(id);
  const LG = ['1CGL', '2CGL'], LC = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const KN = { plan: '계획휴지', sd: 'S/D', repair: '수리', jr: '정기수리', clean: '청소', test: 'Test', sample: '샘플' };
  const PDOWN = new Set(['plan', 'sd', 'repair', 'jr']);       // 계획 휴지로 보는 컬러 정지 종류
  const VIEWS = ['cg', 'cc', 'load', 'cmp'];
  let X = null, DD = null, mvAll = false;
  const SUM = {}, SPEC = {}, AT = {};
  /* 캘린더 모듈이 결론·기준을 넘겨 줌(PS.sum) — 어느 쪽이 먼저 끝나도 같은 자리에 */
  window.PS = { sum(pl, h, sp, asOf) { SUM[pl] = h; SPEC[pl] = sp; AT[pl] = asOf; paintSum(); paintFold(); } };

  function prep(D) {
    const L = (D['latest.plan'] || {}).result || {}, I = D.integrated || {}, P = D.portal || {};
    const asOf = P.asOf || (L.replan || {}).t0 || CT.today(), today = CT.today();
    const cell = {};                                           // `${line}|${d}` → {t, items, act, ev, down, pdown, src}
    const C = (k) => (cell[k] = cell[k] || { t: 0, items: {}, act: false, ev: [], down: 0, pdown: false, src: false });
    const known = new Set();                                   // 실적이 확인된 라인·날(그날 실적 0 이면 비계획 휴지)
    for (const r of L.rows || []) { const c = C(`${r[1]}|${r[0]}`); c.src = true; c.t += +r[4] || 0; c.items[`${r[2]} ${r[3]}`] = (c.items[`${r[2]} ${r[3]}`] || 0) + (+r[4] || 0); c.fam = r[2]; if (r[0] <= asOf) { c.act = true; known.add(`${r[1]}|${r[0]}`); } }
    const capG = {};
    for (const c0 of L.cal || []) {
      const k = `${c0.line}|${c0.date}`, c = C(k); c.src = true; capG[k] = c0.cap;
      if (c0.date <= asOf) known.add(k);
      if (c0.event) { c.ev.push(c0.event); c.pdown = true; }
      if (c0.blackout > 0.5) { if (!c0.event) c.ev.push(`정지 ${n0(c0.blackout)}분`); c.down += c0.blackout; c.pdown = true; }
      if (!c.fam) c.fam = c0.fam;
    }
    for (const x of I.color || []) { const k = `${x.l}|${x.d}`, c = C(k); c.src = true; c.min = (c.min || 0) + (+x.min || 0); for (const [g, t] of Object.entries(x.g || {})) { c.t += t; c.items[g] = (c.items[g] || 0) + t; } if (x.act) { c.act = true; known.add(k); } }
    for (const [d, l, k, m] of I.colorDown || []) { const c = C(`${l}|${d}`); c.src = true; c.down += +m || 0; if (PDOWN.has(k)) c.pdown = true; if (m >= 120) c.ev.push(`${KN[k] || k} ${m >= 1439 ? '종일' : n0(m) + '분'}`); }
    const tph = {};
    for (const x of P.lines || []) {                           // 포털 라인 실적(최근 며칠) — 계획 파일에 실적이 없는 날을 채움
      tph[x.line] = x.tph;
      for (const [d, t] of x.days || []) { if (d >= today) continue; const k = `${x.line}|${d}`; known.add(k); const c = C(k); if (!c.act && (+t || 0) > 0.5) { c.t = +t; c.items = { 실적: +t }; } c.act = true; c.src = true; }
    }
    // 라인 하루 능력: 도금 = 가용분(캘린더 − 정지)/60 × 최근 실적 t/h, 컬러 = 정지 뺀 1,440분(편성이 분 단위 → 부하 = 편성분 ÷ 가용분)
    const avail = (l, d) => {
      const c = cell[`${l}|${d}`] || {};
      if (LG.includes(l)) { const m = capG[`${l}|${d}`]; return m == null ? null : Math.max(0, m - (c.down || 0)); }
      return Math.max(0, 1440 - Math.min(1440, c.down || 0));
    };
    const used = (l, d) => { const c = cell[`${l}|${d}`] || {}; return LG.includes(l) ? (tph[l] ? (c.t || 0) / tph[l] * 60 : null) : (c.min || 0); };
    const cap = (l, d) => { const a = avail(l, d), c = cell[`${l}|${d}`] || {}; if (a == null) return null; if (LG.includes(l)) return tph[l] ? a / 60 * tph[l] : null; return c.min > 0 ? (c.t || 0) * a / c.min : null; };
    const OM = CT.orders(D);
    const due = {};                                          // `${line}|${needProd}` → 주문(출하 완료 제외)
    for (const o of OM.all) { if (o.closed || !o.needProd || !o.line) continue; (due[`${o.line}|${o.needProd}`] = due[`${o.line}|${o.needProd}`] || []).push(o); }
    const days = [...new Set(Object.keys(cell).map((k) => k.split('|')[1]))].sort();
    // 계획 끝 날(11/5): 도금 = 재계획 행·캘린더 끝(분기 말), 컬러 = 통합 계획 끝 — 그 뒤 칸은 '계획 범위 밖'
    const hz = { G: [...(L.rows || []).map((r) => r[0]), ...(L.cal || []).map((c) => c.date)].sort().pop() || '', C: (I.color || []).map((x) => x.d).sort().pop() || '' };
    // 컬러 생산 캘린더(11/5 컬러 담당 편성 규칙): 라인·날 = 작업대기량 → 지시대기 → 부자재 입고대기 → 계획편성(24시간 기준)
    const cc = {}; for (const [l, C] of Object.entries((D.cc_calendar || {}).lines || {})) for (const c of C) cc[`${l}|${c.d}`] = c;
    return { asOf, today, cell, known, cap, avail, used, due, days, L, I, P, OM, tph, hz, cc };
  }
  const lines = () => [...(CT.inScope('G') ? LG : []), ...(CT.inScope('C') ? LC : [])];

  /* 부하·능력(11/5 사용자 '월 단위로 끊고, 주는 수요일 시작'): 달마다 라인 요약 + 수요일 시작 주(달 경계에서 자름). 오늘 이전 날은 뺌 */
  function loadView() {
    const LS = lines(), m0 = X.today.slice(0, 7);
    const lastD = [X.hz.G, X.hz.C].filter(Boolean).sort().pop() || addD(X.today, 55);
    const months = []; for (let m = m0; m <= lastD.slice(0, 7) && months.length < 4; m = addD(m + '-01', 32).slice(0, 7)) months.push(m);
    const mEnd = (m) => addD(addD(m + '-01', 32).slice(0, 7) + '-01', -1);
    const tone = (r) => (r == null ? '' : r > 1.005 ? 'bad' : r >= 0.95 ? 'warn' : 'ok');   // 컬러는 편성이 하루를 꽉 채워 100% 가 보통 → 병목 = 100% 초과
    const calc = (l, ds) => {                                  // ds: 날짜들(오늘 이후만 계산)
      let need = 0, av = 0, us = 0, ok = true, n = 0, nOut = 0;
      const h = X.hz[LG.includes(l) ? 'G' : 'C'];
      for (const d of ds) { if (d < X.today) continue; n++; if (h && d > h) { nOut++; continue; } need += (X.cell[`${l}|${d}`] || {}).t || 0; const a = X.avail(l, d), u = X.used(l, d); if (a == null || u == null) { if (((X.cell[`${l}|${d}`] || {}).t || 0) > 0.5) ok = false; continue; } av += a; us += u; }
      const r = ok && av > 0 ? us / av : null;
      return { need, r, n, out: n > 0 && nOut === n, idle: n > 0 && nOut < n && av <= 0 && need < 0.5, cap: r ? need / r : (ok && av > 0 && LG.includes(l) && X.tph[l] ? av / 60 * X.tph[l] : null) };
    };
    const allR = [];
    const sec = months.map((m) => {
      const e = mEnd(m), s0 = m + '-01';
      const wk = [];                                           // [시작, 끝] — 1일 → 첫 수요일 전날, 그 뒤 수요일마다, 말일에서 자름
      for (let a = s0; a <= e;) { let b = addD(CT.wed(addD(a, 7)), -1); if (b > e) b = e; if (b >= X.today) wk.push([a < X.today ? X.today : a, b]); a = addD(b, 1); }
      const R = LS.map((l) => {
        const w = wk.map(([a, b]) => { const ds = []; for (let d = a; d <= b; d = addD(d, 1)) ds.push(d); return Object.assign({ a, b }, calc(l, ds)); });
        const need = w.reduce((x, y) => x + y.need, 0), capOk = w.every((x) => x.out || x.idle || x.cap != null || x.need < 0.5), out = w.every((x) => x.out);
        const cap = capOk ? w.reduce((x, y) => x + (y.cap || 0), 0) : null;
        const over = w.reduce((x, y) => x + (y.cap != null ? Math.max(0, y.need - y.cap) : 0), 0);
        const from = m === m0 ? X.today : s0;
        const aff = X.OM.all.filter((o) => !o.closed && o.line === l && o.risk === '위험' && o.needProd && o.needProd >= from && o.needProd <= e);
        return { l, m, w, need, cap, over, aff, out };
      });
      allR.push(...R);
      const mm = `${+m.slice(5)}월`, rng = `${md(m === m0 ? X.today : s0)}~${md(e)}`;
      const sumT = `<div class="ct-wrap"><table class="ct-t ls"><thead><tr><th>라인</th><th class="r">필요 생산량</th><th class="r">가용 능력</th><th class="r">부하율</th><th class="r" title="주별 능력 초과량의 합 — 월 부하율 100% 미만이어도 특정 주 초과 시 발생">주별 초과 합</th><th class="r">해당 주문</th></tr></thead><tbody>`
        + R.map((x) => { const r = x.cap ? x.need / x.cap : null; return x.out ? `<tr><td class="id">${x.l}</td><td class="r" colspan="5"><span class="sub">계획 범위 밖 — ${LG.includes(x.l) ? '도금 재계획' : '컬러 계획'}은 ${md(X.hz[LG.includes(x.l) ? 'G' : 'C'])}까지</span></td></tr>` : `<tr class="ck" data-l="${x.l}" data-m="${m}"><td class="id">${x.l}</td><td class="r">${n0(x.need)}t</td><td class="r">${x.cap ? n0(x.cap) + 't' : (x.need < 0.5 ? '<span class="sub">-</span>' : '<span class="sub">산출 불가</span>')}</td>`
          + `<td class="r">${r == null ? '<span class="sub">-</span>' : `<b class="${tone(r)}">${Math.round(r * 100)}%</b>`}</td><td class="r">${x.over >= 1 ? `<b class="bad">${n0(x.over)}t</b>` : '0'}</td><td class="r">${x.aff.length ? `<b class="bad">${x.aff.length}</b>건` : '0'}</td></tr>`; }).join('')
        + '</tbody></table></div>';
      const bar = (w) => (w.out ? '<span class="sub">계획 범위 밖</span>' : w.idle ? '<span class="sub">정비·휴지</span>' : (w.r == null || w.r < 0.005) ? (w.need < 0.5 ? '<span class="sub">계획 물량 없음</span>' : '<span class="sub">산출 불가</span>') : `<div class="lb ${tone(w.r)}" title="계획 ${n0(w.need)}t / 능력 ${n0(w.cap)}t"><i style="width:${Math.min(100, w.r * 100).toFixed(1)}%"></i></div><b class="${tone(w.r)}">${Math.round(w.r * 100)}%</b>`);
      const heat = `<div class="ct-wrap"><table class="ct-t ld"><thead><tr><th>라인</th>${wk.map(([a, b]) => `<th>${a === b ? md(a) : `${md(a)}~${md(b)}`}</th>`).join('')}</tr></thead><tbody>`
        + R.map((x) => `<tr><td class="id">${x.l}</td>${x.w.map((w) => `<td class="lc">${bar(w)}<small>${w.idle || w.out || w.need < 0.5 ? '' : `${n0(w.need)}t`}</small></td>`).join('')}</tr>`).join('')
        + '</tbody></table></div>';
      return `<section class="card"><h2>${mm} 라인별 부하 <small>${rng}</small></h2><div class="ld-row"><div class="ld-l">${sumT}</div><div class="ld-r"><h4 class="ld-h">주별 부하율 <small>수요일 시작 · 달 경계에서 끊음</small></h4>${heat}</div></div></section>`;   // 11/5 사용자 '옆으로 붙여 — 전부'
    });
    const tl = LG.filter((l) => X.tph[l]).map((l) => `${l} ${n1(X.tph[l])}t/h`).join(' · ');
    const f = `<ul class="ps-ul"><li>도금 능력 = 가용분(캘린더 − 정지) ÷ 60 × 최근 t/h(${tl})</li><li>컬러 부하 = 편성분 ÷ 정지 뺀 가용분(편성이 하루를 채워 100% 가 보통 → 100% 초과 = 병목)</li><li>주 = 수요일 시작 · 달 경계에서 끊음 · 오늘(${md(X.today)}) 이후만 · 주별 초과 합 = 주마다 능력을 넘는 양의 합</li><li>도금 = 게시 재계획 · 컬러 = 통합 컬러 계획</li></ul>`;
    return { html: sec.join(''), R: allR, note: f, m0 };
  }

  /* 계획 변경 비교: A = 직전 게시(plan_prev), B = 지금 게시(latest.plan). 비교만 — 계획에 반영하지 않음 */
  const wkOf = (d) => { const w = CT.wed(d), m1 = d.slice(0, 8) + '01'; return w < m1 ? m1 : w; };   // 수요일 시작 주 · 달 경계에서 끊음(11/5)
  function cmpView(D) { return (CT.inScope('G') ? cmpG(D) : '') + (CT.inScope('C') ? cmpC(D) : ''); }
  function cmpG(D) {
    const A = D.plan_prev, B = D['latest.plan'];
    if (!A || !B) return '<section class="card"><h2>도금 계획 변경</h2><p class="ct-note">직전 게시 계획이 없습니다.</p></section>';
    const ra = A.result || {}, rb = B.result || {}, ta = (ra.replan || {}).t0, tb = (rb.replan || {}).t0;
    const t0 = [ta, tb].filter(Boolean).sort().pop() || X.today;
    const endOf = (r) => (r.rows || []).reduce((m, x) => (x[0] > m ? x[0] : m), ''), eA = endOf(ra), eB = endOf(rb), tE = [eA, eB].filter(Boolean).sort()[0] || '9999';   // 11/7 점검: 두 판의 계획 끝이 달라(12/31 vs 2/28) 1~2월이 '증가'로 잡히던 것 → 짧은 쪽 끝까지만 비교
    const agg = (r) => { const w = {}, done = {}; for (const x of r.rows || []) { const [d, l, fam, g, t, due] = x; if (+t < 0.05) continue; const k = `${g}|${fam}|${due}`; if (d > tE) continue; if (!done[k] || d > done[k].d) done[k] = { d, g, fam, due }; if (d < t0) continue; const s = `${l}|${wkOf(d)}`; w[s] = (w[s] || 0) + (+t || 0); } return { w, done }; };
    const a = agg(ra), b = agg(rb);
    const wks = [...new Set([...Object.keys(a.w), ...Object.keys(b.w)].map((k) => k.split('|')[1]))].sort();
    const LS = LG.filter((l) => CT.inScope('G'));
    const dl = (v) => (Math.abs(v) < 0.5 ? '<span class="sub">0</span>' : `<b class="${v > 0 ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${n0(v)}</b>`);
    const wkT = `<div class="ct-wrap"><table class="ct-t cw"><thead><tr><th rowspan="2">주</th>${LS.map((l) => `<th colspan="3" class="c">${l}</th>`).join('')}</tr><tr>${LS.map(() => '<th class="r">직전</th><th class="r">지금</th><th class="r">차이</th>').join('')}</tr></thead><tbody>`
      + wks.map((s) => `<tr><td class="id">${md(s < t0 ? t0 : s)}~</td>${LS.map((l) => { const x = a.w[`${l}|${s}`] || 0, y = b.w[`${l}|${s}`] || 0; return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr>`).join('')
      + `<tr class="sum"><td>계</td>${LS.map((l) => { const x = wks.reduce((q, s) => q + (a.w[`${l}|${s}`] || 0), 0), y = wks.reduce((q, s) => q + (b.w[`${l}|${s}`] || 0), 0); return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr></tbody></table></div>`;
    const mc = (r, l) => (r.cal || []).filter((c) => c.line === l && c.date >= t0 && c.date <= tE && /M\/C/.test(c.event || '')).map((c) => c.date);
    const mcSame = LS.every((l) => mc(ra, l).join() === mc(rb, l).join());
    const mcT = `<div class="ct-wrap"><table class="ct-t mc"><thead><tr><th>라인</th><th>직전 M/C</th><th>지금 M/C</th></tr></thead><tbody>${LS.map((l) => { const x = mc(ra, l), y = mc(rb, l), sx = new Set(x), sy = new Set(y);
      return `<tr><td class="id">${l}</td><td>${x.map((d) => `<span class="${sy.has(d) ? '' : 'gone'}">${md(d)}</span>`).join(' ') || '-'}</td><td>${y.map((d) => `<span class="${sx.has(d) ? '' : 'new'}">${md(d)}</span>`).join(' ') || '-'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const ma = ra.milp || {}, mb = rb.milp || {}, la = dueLate(ra), lb = dueLate(rb);
    const kp = CT.kpis([
      { label: '결품', v: `${n0(ma.short)}→${n0(mb.short)}`, unit: 't', tone: (mb.short || 0) > (ma.short || 0) + 0.5 ? 'bad' : 'ok', sub: `차이 ${n0((mb.short || 0) - (ma.short || 0))}t` },
      { label: '지연(천 t·일)', v: `${n0(la / 1000)}→${n0(lb / 1000)}`, unit: '', tone: lb > la + 0.5 ? 'bad' : 'ok', sub: `차이 ${n0((lb - la) / 1000)}천` },
      { label: 'M/C', v: `${ma.K ?? '-'}→${mb.K ?? '-'}`, unit: '회', tone: 'info' },
    ]);
    const mv = [];
    for (const k of new Set([...Object.keys(a.done), ...Object.keys(b.done)])) {
      const x = a.done[k], y = b.done[k], r = y || x; if (r.due && r.due > tE) continue; if (!x || !y) { if (r.d >= t0) mv.push({ ...r, x: x && x.d, y: y && y.d, dd: null }); continue; }
      const dd = CT.diff(y.d, x.d); if (Math.abs(dd) >= 1 && (x.d >= t0 || y.d >= t0)) mv.push({ ...r, x: x.d, y: y.d, dd });
    }
    mv.sort((p, q) => (p.dd == null) - (q.dd == null) || (q.dd ?? 0) - (p.dd ?? 0));
    const late = (m) => m.y && m.due && m.y > m.due;
    const mvT = mv.length ? `<div class="ct-wrap"><table class="ct-t mv"><thead><tr><th>판매그룹</th><th>강종</th><th>마감</th><th>직전 완료</th><th>지금 완료</th><th class="r">변동</th><th>상태</th></tr></thead><tbody>${(mvAll ? mv : mv.slice(0, 30)).map((m) => `<tr><td>${esc(m.g)}</td><td>${esc(m.fam)}</td><td>${md(m.due)}</td><td>${m.x ? md(m.x) : '없음'}</td><td>${m.y ? md(m.y) : '제외'}</td>`
      + `<td class="r">${m.dd == null ? '-' : `<b class="${m.dd > 0 ? 'up' : 'dn'}">${m.dd > 0 ? '+' : ''}${m.dd}일</b>`}</td><td>${m.dd == null ? `<span class="ct-b na">${m.y ? '신규' : '계획 제외'}</span>` : late(m) ? '<span class="ct-b bad">지연</span>' : m.dd > 0 ? '<span class="ct-b warn">순연</span>' : '<span class="ct-b ok">앞당김</span>'}</td></tr>`).join('')}</tbody></table></div>${mv.length > 30 ? `<button type="button" class="more" id="mv-more">${mvAll ? '30개만' : `전체 ${mv.length}개`}</button>` : ''}` : '<p class="ct-note">완료일이 바뀐 묶음 없음</p>';
    const at = (s) => { if (!s) return '-'; const z = /Z$|[+-]\d\d:?\d\d$/.test(String(s)) ? new Date(new Date(s).getTime() + 9 * 3600e3).toISOString() : String(s); return `${md(z.slice(0, 10))} ${z.slice(11, 16)}`; };   // 11/7 점검: UTC → 한국 시각
    const hd = `<div class="cmp-h"><span><small>직전</small><b>${at(A.savedAt)}</b><small>재계획 ${md(ta)}</small></span><span class="ar">→</span><span><small>지금</small><b>${at(B.savedAt)}</b><small>재계획 ${md(tb)}</small></span><span class="ct-b na">비교만 — 계획에 반영하지 않음</span></div>`;
    return `<section class="card"><h2>도금 계획 변경 <small>${md(t0)}~${md(tE)}${eA !== eB ? ` (직전 판 끝 ${md(eA)} · 지금 판 끝 ${md(eB)} — 같은 기간만 비교, 위 결품·지연·M/C 회수는 각 판 전체 기간)` : ''}</small></h2>${hd}</section>` + kp
      + `<section class="card"><h2>도금 라인 × 주 생산량 <small>t · 수요일 시작</small></h2>${wkT}</section>`
      + `<section class="card"><h2>M/C 일정 <small>${mcSame ? '변동 없음' : '빨강 = 새 일정'}</small></h2>${mcT}</section>`
      + `<section class="card"><h2>완료일이 바뀐 묶음 <small>${mv.length}개 · 순연 건 우선 · 마감 초과 ${mv.filter((m) => m.dd != null && late(m)).length}개</small></h2>${mvT}</section>`;
  }

  /* 컬러 계획 변경(11/5 사용자 '계획변경비교에 컬러는 왜 없노'): 직전 = integrated_prev(오늘 이후 컬러 편성이 지금과 다른 가장 최근 판, tools/plan_prev.py) */
  /* 컬러 판 하나 요약(오늘 이후): 라인×주 톤 · 그룹×월 톤 · 종일 휴지일 · 미편성 */
  function aggC(O, t0) {
    const w = {}, g = {}, dn = {};
      for (const c of O.color || []) { if (c.act || c.d < t0) continue; const t = Object.values(c.g || {}).reduce((a, v) => a + (+v || 0), 0); w[`${c.l}|${wkOf(c.d)}`] = (w[`${c.l}|${wkOf(c.d)}`] || 0) + t;
        for (const [k, v] of Object.entries(c.g || {})) g[`${k}|${c.d.slice(0, 7)}`] = (g[`${k}|${c.d.slice(0, 7)}`] || 0) + (+v || 0); }
      for (const r of O.colorDown || []) if (r[2] !== 'test' && r[0] >= t0 && (+r[3] || 0) >= 1380) (dn[r[1]] = dn[r[1]] || new Set()).add(r[0]);
      const un = (O.colorUnplaced || []).filter((u) => u.ym >= t0.slice(0, 7)).reduce((a, u) => a + (+u.t || 0), 0);
      return { w, g, dn, un, tot: Object.values(w).reduce((a, v) => a + v, 0), end: (O.color || []).map((c) => c.d).sort().pop() };
  }
  function cmpC(D) {
    const A = D.integrated_prev, B = D.integrated;
    if (!A || !B) return '<section class="card"><h2>컬러 계획 변경</h2><p class="ct-note">직전 컬러 계획 판이 없습니다.</p></section>';
    const t0 = X.today, LS = LC, agg = (O) => aggC(O, t0);
    const a = agg(A), b = agg(B);
    const dl = (v) => (Math.abs(v) < 0.5 ? '<span class="sub">0</span>' : `<b class="${v > 0 ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${n0(v)}</b>`);
    const dnN = (x) => LS.reduce((q, l) => q + ((x.dn[l] || new Set()).size), 0);
    const kp = CT.kpis([
      { label: '편성량(오늘 이후)', v: n0(b.tot), unit: 't', tone: 'info', sub: `직전 ${n0(a.tot)}t · 차이 ${n0(b.tot - a.tot)}t` },
      { label: '미편성', v: n0(b.un), unit: 't', tone: b.un > a.un + 0.5 ? 'bad' : 'ok', sub: `직전 ${n0(a.un)}t · 차이 ${n0(b.un - a.un)}t` },
      { label: '계획 휴지일(라인 합)', v: String(dnN(b)), unit: '일', tone: 'info', sub: `직전 ${dnN(a)}일` },
    ]);
    const wks = [...new Set([...Object.keys(a.w), ...Object.keys(b.w)].map((k) => k.split('|')[1]))].sort();
    const wkT = `<div class="ct-wrap"><table class="ct-t cw"><thead><tr><th rowspan="2">주</th>${LS.map((l) => `<th colspan="3" class="c">${l}</th>`).join('')}</tr><tr>${LS.map(() => '<th class="r">직전</th><th class="r">지금</th><th class="r">차이</th>').join('')}</tr></thead><tbody>`
      + wks.map((s) => `<tr><td class="id">${md(s < t0 ? t0 : s)}~</td>${LS.map((l) => { const x = a.w[`${l}|${s}`] || 0, y = b.w[`${l}|${s}`] || 0; return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr>`).join('')
      + `<tr class="sum"><td>계</td>${LS.map((l) => { const x = wks.reduce((q, s) => q + (a.w[`${l}|${s}`] || 0), 0), y = wks.reduce((q, s) => q + (b.w[`${l}|${s}`] || 0), 0); return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr></tbody></table></div>`;
    const yms = [...new Set([...Object.keys(a.g), ...Object.keys(b.g)].map((k) => k.split('|')[1]))].sort(), gs = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'].filter((g) => yms.some((m) => a.g[`${g}|${m}`] || b.g[`${g}|${m}`]));
    const gT = `<div class="ct-wrap"><table class="ct-t cw"><thead><tr><th rowspan="2">그룹</th>${yms.map((m) => `<th colspan="3" class="c">${+m.slice(5)}월</th>`).join('')}</tr><tr>${yms.map(() => '<th class="r">직전</th><th class="r">지금</th><th class="r">차이</th>').join('')}</tr></thead><tbody>`
      + gs.map((g) => `<tr><td class="id">${esc(g)}</td>${yms.map((m) => { const x = a.g[`${g}|${m}`] || 0, y = b.g[`${g}|${m}`] || 0; return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr>`).join('') + '</tbody></table></div>';
    const dnT = LS.map((l) => { const x = a.dn[l] || new Set(), y = b.dn[l] || new Set(), add = [...y].filter((d) => !x.has(d)).sort(), del = [...x].filter((d) => !y.has(d)).sort();
      return `<tr><td class="id">${l}</td><td>${add.map((d) => `<span class="new">${md(d)}</span>`).join(' ') || '<span class="sub">-</span>'}</td><td>${del.map((d) => `<span class="gone">${md(d)}</span>`).join(' ') || '<span class="sub">-</span>'}</td></tr>`; }).join('');
    const at = (s) => (s ? `${md(String(s).slice(0, 10))} ${String(s).slice(11, 16)}` : '-');
    const hd = `<div class="cmp-h"><span><small>직전</small><b>${at(A.built)}</b><small>계획 끝 ${md(a.end)}</small></span><span class="ar">→</span><span><small>지금</small><b>${at(B.built)}</b><small>계획 끝 ${md(b.end)}</small></span><span class="ct-b na">비교만 — 계획에 반영하지 않음</span></div>`;
    return `<section class="card"><h2>컬러 계획 변경 <small>${md(t0)}부터</small></h2>${hd}</section>` + kp
      + `<section class="card"><h2>컬러 라인 × 주 생산량 <small>t · 수요일 시작</small></h2>${wkT}</section>`
      + `<section class="card"><h2>컬러 그룹 × 월 물량 <small>t · 오늘 이후 편성</small></h2>${gT}</section>`
      + `<section class="card"><h2>계획 휴지일 변경 <small>종일 휴지만</small></h2>${dnT.includes('class="new"') || dnT.includes('class="gone"') ? `<div class="ct-wrap"><table class="ct-t mc"><thead><tr><th>라인</th><th>새로 쉼</th><th>휴지 풀림</th></tr></thead><tbody>${dnT}</tbody></table></div>` : '<p class="ct-note">변동 없음</p>'}</section>`;   // 11/10 점검: 전부 '-' 인 표 대신 한 줄
  }

  /* ---------- 결론(맨 위): 공정별 이번 주 + 계획 변경·이번 달 부하 한 줄 ---------- */
  const PLN = { G: '도금', C: '컬러' };
  /* 11/11 사용자: 지연 톤·일 = 원래 납기 기준 하나로(계획 계산·홈과 같은 값 — cglplan/pages.py due_late 와 같은 식).
     t0 뒤 계획 행마다 톤 × (생산일 − 납기일), 자가재는 새 수요(selfDue use-1)면 여유 0 · 옛 수요면 7일. 엔진 최적화 값(replan.late)은 판매계획 보충을 절반 무게로 세고 평준화 전 값이라 쓰지 않음 */
  function dueLate(R) {
    const t0 = (R.replan || {}).t0 || '', sk = ((R.orderDemand || {}).selfDue === 'use-1') ? 0 : 7, dd = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
    return (R.rows || []).reduce((s, r) => { if (!(r[0] > t0)) return s; const k = r[3] === '자가재' ? sk : 0, d = dd(r[0], r[5]); return d > k ? s + (+r[4] || 0) * (d - k) : s; }, 0);
  }
  const wk7 = (d) => (d ? `${md(d)}~${md(addD(d, 6))}` : '');
  function chgLine(D) {                                     // 계획 변경 한 줄(직전 게시 → 지금): 자세히 = #cmp
    const out = [];
    if (CT.inScope('G') && D.plan_prev && D['latest.plan']) {
      const ra = D.plan_prev.result || {}, rb = D['latest.plan'].result || {}, ma = ra.milp || {}, mb = rb.milp || {}, la = dueLate(ra), lb = dueLate(rb);
      const ar = (a, b, f, bad) => `${f(a)}→<b class="${bad ? 'bad' : ''}">${f(b)}</b>`;
      out.push(`<span><b>도금</b> 결품 ${ar(ma.short || 0, mb.short || 0, (v) => n0(v) + 't', (mb.short || 0) > (ma.short || 0) + 0.5)} · 지연 ${ar(la || 0, lb || 0, (v) => n0(v / 1000) + '천', (lb || 0) > (la || 0) + 0.5)} t·일 · M/C ${ma.K ?? '-'}→${mb.K ?? '-'}회</span>`);
    }
    if (CT.inScope('C') && D.integrated_prev && D.integrated) {
      const a = aggC(D.integrated_prev, X.today), b = aggC(D.integrated, X.today), d = b.tot - a.tot;
      out.push(`<span><b>컬러</b> 편성 ${Math.abs(d) < 0.5 ? '변동 없음' : `${d > 0 ? '+' : ''}${n0(d)}t`} · 미편성 ${n0(a.un)}→<b class="${b.un > a.un + 0.5 ? 'bad' : ''}">${n0(b.un)}</b>t</span>`);
    }
    return out.join('');
  }
  function loadLine(lr) {                                   // 이번 달 라인 부하 한 줄: 자세히 = #load
    const R = lr.R.filter((x) => x.m === lr.m0 && !x.out), tone = (r) => (r == null ? '' : r > 1.005 ? 'bad' : r >= 0.95 ? 'warn' : '');
    return R.map((x) => { const r = x.cap ? x.need / x.cap : null; return `<span>${x.l} <b class="${tone(r)}">${r == null ? '-' : Math.round(r * 100) + '%'}</b>${x.over >= 1 ? ` <small class="bad">주별 초과 ${n0(x.over)}t</small>` : ''}</span>`; }).join('');
  }
  let LR = null;
  function paintSum() {
    const el = $('ps-sum'), v = view();
    if (!el) return;
    if (v !== 'cg' && v !== 'cc') { el.innerHTML = ''; return; }
    const pls = ['G', 'C'].filter((p) => CT.inScope(p));
    const blk = (p) => `<section class="card ps-b${(p === 'G') === (v === 'cg') ? ' on' : ''}"><h2>${PLN[p]} <small title="주 = 수~화 생산주 · 이 칸은 오늘부터 7일 합">오늘부터 7일 ${wk7(AT[p])}</small>${pls.length > 1 ? `<a class="ps-cal" href="#${p === 'G' ? 'cg' : 'cc'}">${(p === 'G') === (v === 'cg') ? '아래 캘린더' : '캘린더 보기 →'}</a>` : ''}</h2>${SUM[p] || '<p class="ct-note">불러오는 중…</p>'}</section>`;
    const more = DD && X ? `<section class="card ps-m"><a class="ps-ln" href="#cmp"><i>계획 변경</i>${chgLine(DD) || '<span class="sub">직전 판 없음</span>'}<em>→</em></a><a class="ps-ln" href="#load" title="게시 재계획 물량 ÷ 가용 능력(도금 = 2026년 실적 t/h, 컬러 = 편성분 ÷ 가용분) — 위 '시간 부하'(현장 편성 주문 × 두께·폭별 t/hr)와 기준이 다름"><i>${+X.today.slice(5, 7)}월 재계획 부하</i>${LR ? loadLine(LR) : ''}<em>→</em></a></section>` : '';
    el.innerHTML = `<div class="ps-g${pls.length > 1 ? ' two' : ''}">${pls.map(blk).join('')}</div>${more}`;
    el.querySelectorAll('.ps-go').forEach((b) => (b.onclick = () => { const t = $(b.dataset.go); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
  }
  function paintFold() {                                    // 맨 아래 기준·사양
    const b = $('ps-fold-b'), v = view();
    if (!b || !DD) return;
    const bs = CT.basis([{ name: '도금 재계획', at: (X.L.replan || {}).t0 || (DD['latest.plan'] || {}).savedAt, kind: '재계획' }, v === 'cmp' ? { name: '직전 계획', at: (() => { const s_ = (DD.plan_prev || {}).savedAt; return s_ && /Z$|[+-]\d\d:?\d\d$/.test(String(s_)) ? new Date(new Date(s_).getTime() + 9 * 3600e3).toISOString().slice(0, 16) : s_; })(), kind: '비교' } : { name: '컬러 계획', at: X.I.built, kind: '확정계획' }, { name: '실적', at: X.asOf, kind: '실적' }]);
    let h = '';
    if (v === 'cg' || v === 'cc') h = ['G', 'C'].filter((p) => CT.inScope(p)).map((p) => SPEC[p] || '').join('');
    else if (v === 'load') h = (LR ? LR.note : '');
    else h = '<ul class="ps-ul"><li>직전 = 바로 앞 게시 계획(도금 plan_prev · 컬러 = 오늘 이후 편성이 지금과 다른 가장 최근 판) · 지금 = 최신 게시</li><li>도금은 두 판의 계획 끝 중 짧은 쪽까지만 비교(위 결품·지연·M/C 회수는 각 판 전체 기간)</li><li>주 = 수요일 시작 · 달 경계에서 끊음 · 비교만 — 계획에 반영하지 않음</li></ul>';
    b.innerHTML = bs + h;
    const sm = $('ps-fold').querySelector('summary small');
    if (sm) sm.textContent = v === 'load' ? '능력·부하 계산식 · 자료 기준일' : v === 'cmp' ? '비교 기준 · 자료 기준일' : '편성 순서 · 라인 속도(t/hr) · 24시간 규칙 · 자료 기준일';
  }
  /* 보기: #cg 도금 캘린더 · #cc 컬러 캘린더 · #load · #cmp — 옛 #week 와 보기(전체·도금·컬러)에 안 맞는 캘린더는 맞는 쪽으로 */
  function view() {
    let h = (location.hash || '').slice(1);
    if (!VIEWS.includes(h)) h = CT.scope() === 'C' ? 'cc' : 'cg';
    if (h === 'cg' && CT.scope() === 'C') h = 'cc';
    if (h === 'cc' && CT.scope() === 'G') h = 'cg';
    return h;
  }
  function render(D) {
    DD = D; X = prep(D);
    const v = view();
    if (('#' + v) !== location.hash) history.replaceState(null, '', location.pathname + location.search + '#' + v);
    const cal = v === 'cg' || v === 'cc';
    LR = loadView();
    $('ps-cal').hidden = !cal;
    if (cal) {
      $('ct-main').innerHTML = '';
      $('cg-host').hidden = v !== 'cg'; $('cc-host').hidden = v !== 'cc';
      $('ps-seg').innerHTML = CT.scope() === 'all' ? CT.tabs('ps-pl', [['cg', '도금 캘린더'], ['cc', '컬러 캘린더']], v) : '';
      const sg = $('ps-pl'); if (sg) sg.querySelectorAll('button').forEach((b) => (b.onclick = () => { location.hash = b.dataset.k; }));
      if (CT.inScope('G') && window.CGCAL) CGCAL.ensure();
      if (CT.inScope('C') && window.CCCAL) CCCAL.ensure();
    } else {
      $('ct-main').innerHTML = v === 'load' ? LR.html : cmpView(D);
      if (v === 'load') document.querySelectorAll('table.ls tr.ck').forEach((tr) => tr.onclick = () => {
        const x = LR.R.find((r) => r.l === tr.dataset.l && r.m === tr.dataset.m), os = x.aff.slice().sort(CT.riskSort);
        CT.panel(`<h4>해당 주문 ${os.length}건 <small>${+x.m.slice(5)}월 생산 필요 · 지연 예상</small></h4>` + (os.length ? `<table class="ct-t">${os.map((o, i) => `<tr class="ck" data-i="${i}"><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${md(o.needProd)}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('')}</table>` : '<p class="ct-note">없음</p>'),
          `${x.l} ${+x.m.slice(5)}월 부하`, (p) => p.querySelectorAll('tr.ck').forEach((r) => r.onclick = () => { const o = os[+r.dataset.i]; CT.panel(CT.orderDetail(o), o.id); }));
      });
      const mm = $('mv-more'); if (mm) mm.onclick = () => { mvAll = !mvAll; render(D); };
      CT.keyRows($('ct-main'));
    }
    paintSum(); paintFold();
  }
  CT.onView(() => { if (DD) { CT.panel(null); render(DD); window.scrollTo(0, 0); } });
  CT.boot(['latest.plan.enc.json', 'plan_prev.enc.json', 'integrated.enc.json', 'integrated_prev.enc.json', 'portal.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'cc_calendar.enc.json', 'color_actual.enc.json'], render);
})();
