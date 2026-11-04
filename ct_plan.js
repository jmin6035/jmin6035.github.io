/* 03 생산계획 — 통합 생산일정(#week) · 부하·능력(#load) · 계획 변경 비교(#cmp)  (11/4 2차 진단 2·6장)
   도금 = 게시 재계획(latest.plan), 컬러 = 통합 계획(integrated). 화면 안 탭 없음 — 하위 화면은 메뉴(# 주소) */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD } = CT;
  const $ = (id) => document.getElementById(id);
  const LG = ['1CGL', '2CGL'], LC = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const mon = (d) => addD(d, -((wd(d) + 6) % 7));
  const KN = { plan: '계획휴지', sd: 'S/D', repair: '수리', jr: '정기수리', clean: '청소', test: 'Test', sample: '샘플' };
  const PDOWN = new Set(['plan', 'sd', 'repair', 'jr']);       // 계획 휴지로 보는 컬러 정지 종류
  const VIEWS = ['week', 'load', 'cmp'];
  let span = 7, base = null, X = null, DD = null, mvAll = false;

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
    return { asOf, today, cell, known, cap, avail, used, due, days, L, I, P, OM, tph };
  }
  const lines = () => [...(CT.inScope('G') ? LG : []), ...(CT.inScope('C') ? LC : [])];

  /* 칸 상태: plan 계획 생산 · act 실적 생산 · down 계획 휴지 · unp 비계획 휴지 · nod 자료 없음 */
  function state(l, d) {
    const c = X.cell[`${l}|${d}`];
    if (c && c.t >= 0.5) return c.act && d < X.today ? 'act' : 'plan';
    if (c && (c.pdown || c.ev.length)) return 'down';
    if (d < X.today && X.known.has(`${l}|${d}`)) return 'unp';
    return 'nod';
  }
  const SN = { plan: '계획 생산', act: '실적 생산', down: '계획 휴지', unp: '비계획 휴지', nod: '자료 없음' };

  function range() {
    if (span === 'm') { const m = base.slice(0, 7), e = addD(m + '-01', 40).slice(0, 7) + '-01'; const ds = []; for (let d = m + '-01'; d < e; d = addD(d, 1)) ds.push(d); return ds; }
    return Array.from({ length: span }, (_, i) => addD(base, i));
  }

  function weekView() {
    const ds = range(), LS = lines();
    const head = `<tr><th class="ln">라인</th>${ds.map((d) => `<th class="${wd(d) === 0 ? 'sun' : wd(d) === 6 ? 'sat' : ''}${d === X.today ? ' td' : ''}">${md(d)}<small>${WD[wd(d)]}</small></th>`).join('')}<th class="r">계</th></tr>`;
    let sumT = 0, sumCap = 0, capMiss = 0, idle = 0; const risk = new Set();
    const row = (l) => {
      let sum = 0;
      const tds = ds.map((d) => {
        const c = X.cell[`${l}|${d}`] || { t: 0, items: {}, ev: [], down: 0 }, s = state(l, d);
        sum += c.t; sumT += c.t;
        if (d >= X.today) { const cp = X.cap(l, d); if (cp == null) { if (c.t >= 0.5) capMiss++; } else sumCap += cp; }
        if (s === 'down' || s === 'unp') idle++;
        const rk = (X.due[`${l}|${d}`] || []).filter((o) => o.risk === '위험'); rk.forEach((o) => risk.add(o.id));
        const top = Object.entries(c.items).sort((a, b) => b[1] - a[1])[0];
        const full = s === 'down' && c.down >= 1439;
        const cls = [s, full ? 'stop' : '', c.ev.some((e) => /M\/C/.test(e)) ? 'mc' : ''].join(' ');
        let body;
        if (s === 'plan' || s === 'act') body = `<b>${n0(c.t)}</b><small>${esc(top ? (LG.includes(l) ? top[0].split(' ')[0] : top[0]) : '')}</small>`;
        else if (s === 'down') body = `<span class="st">${full ? '' : '계획 휴지'}</span>`;
        else if (s === 'unp') body = '<span class="st">비계획 휴지</span><small>실적 0</small>';
        else body = '<span class="st">자료 없음</span>';
        return `<td class="${cls}" data-k="${l}|${d}" tabindex="0">${body}${c.ev.length ? `<span class="ev">${esc(c.ev[0])}</span>` : ''}${rk.length ? `<i class="rk" title="납기 위험 주문 ${rk.length}건">${rk.length}</i>` : ''}</td>`;
      }).join('');
      return `<tr><th class="ln">${l}</th>${tds}<td class="r tot">${n0(sum)}</td></tr>`;
    };
    const grp = (nm, L) => (L.length ? `<tr class="pl"><th colspan="${ds.length + 2}">${nm}</th></tr>` + L.map(row).join('') : '');
    const tbl = `<div class="ct-wrap"><table class="wk ${span === 7 ? 'w7' : 'w14'}">${head}${grp('도금', LS.filter((l) => LG.includes(l)))}${grp('컬러', LS.filter((l) => LC.includes(l)))}</table></div>`;
    const lbl = span === 'm' ? `${+base.slice(5, 7)}월` : `${md(ds[0])} ~ ${md(ds[ds.length - 1])}`;
    const nav = `<div class="nav"><button type="button" data-n="-1" aria-label="이전">◀ ${span === 'm' ? '이전 달' : '이전 주'}</button><button type="button" data-n="0">오늘</button><button type="button" data-n="1" aria-label="다음">${span === 'm' ? '다음 달' : '다음 주'} ▶</button><b>${lbl}</b></div>`;
    const kp = CT.kpis([
      { label: '계획 생산량', v: n0(sumT), unit: 't', tone: 'info', sub: lbl },
      { label: '가용 능력(오늘 이후)', v: sumCap > 0 ? n0(sumCap) : '자료 없음', unit: sumCap > 0 ? 't' : '', tone: 'info', sub: capMiss ? `능력 계산 못 한 라인·일 ${capMiss}` : '' },
      { label: '휴지', v: idle, unit: '라인·일', tone: idle ? 'warn' : 'ok', sub: '계획 + 비계획' },
      { label: '위험 주문', v: risk.size, unit: '건', tone: risk.size ? 'bad' : 'ok', sub: '이 기간 생산 필요일' },
    ]);
    const lg = '<p class="ct-note lgd">' + [['plan', '계획 생산'], ['act', '실적 생산'], ['down', '계획 휴지'], ['stop', '종일 정지'], ['unp', '비계획 휴지'], ['nod', '자료 없음'], ['mc', 'M/C']].map(([c, t]) => `<span><i class="lg ${c}"></i>${t}</span>`).join('') + '<span><i class="rk">n</i>납기 위험 주문</span></p>';
    return kp + `<section class="card"><div class="hd"><h2>통합 생산일정</h2>${nav}${CT.tabs('pl-span', [['7', '7일'], ['14', '14일'], ['m', '월간']], String(span))}</div>${tbl}${lg}</section>`;
  }

  function cellPanel(k) {
    const [l, d] = k.split('|'), c = X.cell[k] || { t: 0, items: {}, ev: [] }, s = state(l, d);
    const items = Object.entries(c.items).sort((a, b) => b[1] - a[1]);
    const os = (X.due[k] || []).slice().sort(CT.riskSort);
    const html = `<div class="ct-kv"><span>상태</span><b>${SN[s]}</b></div>`
      + (c.t >= 0.5 ? `<div class="ct-kv"><span>${s === 'act' ? '실적' : '계획'}</span><b>${n1(c.t)}t</b></div>` : '')
      + (c.ev.length ? `<div class="ct-kv"><span>가동</span><b>${c.ev.map(esc).join(' · ')}</b></div>` : '')
      + (X.cap(l, d) != null ? `<div class="ct-kv"><span>능력(추정)</span><b>${n0(X.cap(l, d))}t</b></div>` : '')
      + (items.length ? `<h4>${LG.includes(l) ? '강종 · 판매그룹' : '판매그룹'}</h4>${items.map(([g, t]) => `<div class="ct-kv"><span>${esc(g)}</span><b>${n1(t)}t</b></div>`).join('')}` : '')
      + `<h4>이날 생산 필요 주문 ${os.length}건</h4>` + (os.length ? `<table class="ct-t">${os.map((o, i) => `<tr class="ck" data-i="${i}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('')}</table>` : '<p class="ct-note">없음</p>');
    CT.panel(html, `${l} · ${md(d)}(${WD[wd(d)]})`, (p) => p.querySelectorAll('tr.ck').forEach((tr) => tr.onclick = () => { const o = os[+tr.dataset.i]; CT.panel(CT.orderDetail(o), o.id); }));
  }

  function loadView() {
    const LS = lines(), w0 = mon(X.today), weeks = Array.from({ length: 8 }, (_, i) => addD(w0, 7 * i)), end = addD(w0, 55);
    const R = LS.map((l) => {
      const w = weeks.map((s) => {
        let need = 0, av = 0, us = 0, ok = true;
        for (let i = 0; i < 7; i++) { const d = addD(s, i); if (d < X.today) continue; need += (X.cell[`${l}|${d}`] || {}).t || 0; const a = X.avail(l, d), u = X.used(l, d); if (a == null || u == null) { if (((X.cell[`${l}|${d}`] || {}).t || 0) > 0.5) ok = false; continue; } av += a; us += u; }
        const r = ok && av > 0 ? us / av : null;
        return { s, need, r, idle: av <= 0 && need < 0.5, cap: r ? need / r : (ok && av > 0 && LG.includes(l) && X.tph[l] ? av / 60 * X.tph[l] : null) };
      });
      const need = w.reduce((a, x) => a + x.need, 0), capOk = w.every((x) => x.idle || x.cap != null || x.need < 0.5);
      const cap = capOk ? w.reduce((a, x) => a + (x.cap || 0), 0) : null;
      const over = w.reduce((a, x) => a + (x.cap != null ? Math.max(0, x.need - x.cap) : 0), 0);
      const aff = X.OM.all.filter((o) => !o.closed && o.line === l && o.risk === '위험' && o.needProd && o.needProd >= X.today && o.needProd <= end);
      return { l, w, need, cap, over, aff };
    });
    const tone = (r) => (r == null ? '' : r > 1.005 ? 'bad' : r >= 0.95 ? 'warn' : 'ok');   // 컬러는 편성이 하루를 꽉 채워 100% 가 보통 → 병목 = 100% 초과
    const sumT = `<div class="ct-wrap"><table class="ct-t ls"><thead><tr><th>라인</th><th class="r">필요 생산량</th><th class="r">가용 능력</th><th class="r">부하율</th><th class="r">초과량</th><th class="r">영향 주문</th></tr></thead><tbody>`
      + R.map((x) => { const r = x.cap ? x.need / x.cap : null; return `<tr class="ck" data-l="${x.l}"><td class="id">${x.l}</td><td class="r">${n0(x.need)}t</td><td class="r">${x.cap ? n0(x.cap) + 't' : '<span class="sub">자료 없음</span>'}</td>`
        + `<td class="r">${r == null ? '<span class="sub">-</span>' : `<b class="${tone(r)}">${Math.round(r * 100)}%</b>`}</td><td class="r">${x.over >= 1 ? `<b class="bad">${n0(x.over)}t</b>` : '0'}</td><td class="r">${x.aff.length ? `<b class="bad">${x.aff.length}</b>건` : '0'}</td></tr>`; }).join('')
      + '</tbody></table></div>';
    const tl = LG.filter((l) => X.tph[l]).map((l) => `${l} ${n1(X.tph[l])}t/h`).join(' · ');
    const f = `<p class="ct-note">도금 능력 = 가용분 ÷ 60 × 최근 t/h(${tl}) · 컬러 부하 = 편성분 ÷ 정지 뺀 가용분 · ${md(X.today)}~${md(end)}</p>`;
    const bar = (w) => (w.idle ? '<span class="sub">정비·휴지</span>' : w.r == null ? '<span class="sub">자료 없음</span>' : `<div class="lb ${tone(w.r)}" title="계획 ${n0(w.need)}t / 능력 ${n0(w.cap)}t"><i style="width:${Math.min(100, w.r * 100).toFixed(1)}%"></i></div><b class="${tone(w.r)}">${Math.round(w.r * 100)}%</b>`);
    const heat = `<div class="ct-wrap"><table class="ct-t ld"><thead><tr><th>라인</th>${weeks.map((s) => `<th>${md(s)}주</th>`).join('')}</tr></thead><tbody>`
      + R.map((x) => `<tr><td class="id">${x.l}</td>${x.w.map((w) => `<td class="lc">${bar(w)}<small>${w.idle ? '' : `${n0(w.need)}t`}</small></td>`).join('')}</tr>`).join('')
      + '</tbody></table></div>';
    return { html: `<section class="card"><h2>라인별 부하 <small>8주</small></h2>${sumT}${f}</section><section class="card"><h2>주차별 부하율</h2>${heat}</section>`, R };
  }

  /* 계획 변경 비교: A = 직전 게시(plan_prev), B = 지금 게시(latest.plan). 비교만 — 계획에 반영하지 않음 */
  function cmpView(D) {
    const A = D.plan_prev, B = D['latest.plan'];
    if (!A || !B) return '<section class="card"><h2>계획 변경 비교</h2><p class="ct-note">직전 게시 계획이 없습니다.</p></section>';
    const ra = A.result || {}, rb = B.result || {}, ta = (ra.replan || {}).t0, tb = (rb.replan || {}).t0;
    const t0 = [ta, tb].filter(Boolean).sort().pop() || X.today;
    const agg = (r) => { const w = {}, done = {}; for (const x of r.rows || []) { const [d, l, fam, g, t, due] = x; if (+t < 0.05) continue; const k = `${g}|${fam}|${due}`; if (!done[k] || d > done[k].d) done[k] = { d, g, fam, due }; if (d < t0) continue; const s = `${l}|${mon(d)}`; w[s] = (w[s] || 0) + (+t || 0); } return { w, done }; };
    const a = agg(ra), b = agg(rb);
    const wks = [...new Set([...Object.keys(a.w), ...Object.keys(b.w)].map((k) => k.split('|')[1]))].sort();
    const LS = LG.filter((l) => CT.inScope('G'));
    const dl = (v) => (Math.abs(v) < 0.5 ? '<span class="sub">0</span>' : `<b class="${v > 0 ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${n0(v)}</b>`);
    const wkT = `<div class="ct-wrap"><table class="ct-t cw"><thead><tr><th rowspan="2">주</th>${LS.map((l) => `<th colspan="3" class="c">${l}</th>`).join('')}</tr><tr>${LS.map(() => '<th class="r">직전</th><th class="r">지금</th><th class="r">Δ</th>').join('')}</tr></thead><tbody>`
      + wks.map((s) => `<tr><td class="id">${md(s < t0 ? t0 : s)}~</td>${LS.map((l) => { const x = a.w[`${l}|${s}`] || 0, y = b.w[`${l}|${s}`] || 0; return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr>`).join('')
      + `<tr class="sum"><td>계</td>${LS.map((l) => { const x = wks.reduce((q, s) => q + (a.w[`${l}|${s}`] || 0), 0), y = wks.reduce((q, s) => q + (b.w[`${l}|${s}`] || 0), 0); return `<td class="r">${n0(x)}</td><td class="r">${n0(y)}</td><td class="r">${dl(y - x)}</td>`; }).join('')}</tr></tbody></table></div>`;
    const mc = (r, l) => (r.cal || []).filter((c) => c.line === l && c.date >= t0 && /M\/C/.test(c.event || '')).map((c) => c.date);
    const mcSame = LS.every((l) => mc(ra, l).join() === mc(rb, l).join());
    const mcT = `<div class="ct-wrap"><table class="ct-t mc"><thead><tr><th>라인</th><th>직전 M/C</th><th>지금 M/C</th></tr></thead><tbody>${LS.map((l) => { const x = mc(ra, l), y = mc(rb, l), sx = new Set(x), sy = new Set(y);
      return `<tr><td class="id">${l}</td><td>${x.map((d) => `<span class="${sy.has(d) ? '' : 'gone'}">${md(d)}</span>`).join(' ') || '-'}</td><td>${y.map((d) => `<span class="${sx.has(d) ? '' : 'new'}">${md(d)}</span>`).join(' ') || '-'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const ma = ra.milp || {}, mb = rb.milp || {}, la = (ra.replan || {}).late ?? ma.late, lb = (rb.replan || {}).late ?? mb.late;
    const kp = CT.kpis([
      { label: '결품', v: `${n0(ma.short)}→${n0(mb.short)}`, unit: 't', tone: (mb.short || 0) > (ma.short || 0) + 0.5 ? 'bad' : 'ok', sub: `Δ ${n0((mb.short || 0) - (ma.short || 0))}t` },
      { label: '지연(천 t·일)', v: `${n0(la / 1000)}→${n0(lb / 1000)}`, unit: '', tone: lb > la + 0.5 ? 'bad' : 'ok', sub: `Δ ${n0((lb - la) / 1000)}천` },
      { label: 'M/C', v: `${ma.K ?? '-'}→${mb.K ?? '-'}`, unit: '회', tone: 'info' },
    ]);
    const mv = [];
    for (const k of new Set([...Object.keys(a.done), ...Object.keys(b.done)])) {
      const x = a.done[k], y = b.done[k], r = y || x; if (!x || !y) { if (r.d >= t0) mv.push({ ...r, x: x && x.d, y: y && y.d, dd: null }); continue; }
      const dd = CT.diff(y.d, x.d); if (Math.abs(dd) >= 1 && (x.d >= t0 || y.d >= t0)) mv.push({ ...r, x: x.d, y: y.d, dd });
    }
    mv.sort((p, q) => (p.dd == null) - (q.dd == null) || (q.dd ?? 0) - (p.dd ?? 0));
    const late = (m) => m.y && m.due && m.y > m.due;
    const mvT = mv.length ? `<div class="ct-wrap"><table class="ct-t mv"><thead><tr><th>판매그룹</th><th>강종</th><th>마감</th><th>직전 완료</th><th>지금 완료</th><th class="r">변동</th><th>판정</th></tr></thead><tbody>${(mvAll ? mv : mv.slice(0, 30)).map((m) => `<tr><td>${esc(m.g)}</td><td>${esc(m.fam)}</td><td>${md(m.due)}</td><td>${m.x ? md(m.x) : '없음'}</td><td>${m.y ? md(m.y) : '빠짐'}</td>`
      + `<td class="r">${m.dd == null ? '-' : `<b class="${m.dd > 0 ? 'up' : 'dn'}">${m.dd > 0 ? '+' : ''}${m.dd}일</b>`}</td><td>${m.dd == null ? `<span class="ct-b na">${m.y ? '새로 생김' : '계획에서 빠짐'}</span>` : late(m) ? '<span class="ct-b bad">지연</span>' : m.dd > 0 ? '<span class="ct-b warn">늦어짐</span>' : '<span class="ct-b ok">당겨짐</span>'}</td></tr>`).join('')}</tbody></table></div>${mv.length > 30 ? `<button type="button" class="more" id="mv-more">${mvAll ? '30개만' : `전체 ${mv.length}개`}</button>` : ''}` : '<p class="ct-note">완료일이 바뀐 묶음 없음</p>';
    const at = (s) => (s ? `${md(s)} ${String(s).slice(11, 16)}` : '-');
    const hd = `<div class="cmp-h"><span><small>직전</small><b>${at(A.savedAt)}</b><small>재계획 ${md(ta)}</small></span><span class="ar">→</span><span><small>지금</small><b>${at(B.savedAt)}</b><small>재계획 ${md(tb)}</small></span><span class="ct-b na">비교만 — 계획에 반영하지 않음</span></div>`;
    return `<section class="card"><h2>계획 변경 비교 <small>도금 · ${md(t0)}부터 · 컬러는 직전 판 없음</small></h2>${hd}</section>` + kp
      + `<section class="card"><h2>라인 × 주 생산량 <small>t</small></h2>${wkT}</section>`
      + `<section class="card"><h2>M/C 일정 <small>${mcSame ? '변동 없음' : '빨강 = 새 일정'}</small></h2>${mcT}</section>`
      + `<section class="card"><h2>완료일이 바뀐 묶음 <small>${mv.length}개 · 늦어진 것 먼저 · 마감 넘김 ${mv.filter((m) => m.dd != null && late(m)).length}개</small></h2>${mvT}</section>`;
  }

  function render(D) {
    DD = D; X = prep(D);
    if (!base) base = mon(X.today);
    const v = CT.view('week', VIEWS), L = X.L, I = X.I;
    const bs = CT.basis([{ name: '도금 재계획', at: (L.replan || {}).t0 || (D['latest.plan'] || {}).savedAt, kind: '재계획' }, v === 'cmp' ? { name: '직전 계획', at: (D.plan_prev || {}).savedAt, kind: '비교' } : { name: '컬러 계획', at: I.built, kind: '확정계획' }, { name: '실적', at: X.asOf, kind: '실적' }]);
    let body, lr;
    if (v === 'load') { lr = loadView(); body = lr.html; } else if (v === 'cmp') body = cmpView(D); else body = weekView();
    $('ct-main').innerHTML = bs + body;
    if (v === 'week') {
      $('pl-span').querySelectorAll('button').forEach((b) => b.onclick = () => { span = b.dataset.k === 'm' ? 'm' : +b.dataset.k; base = span === 'm' ? base.slice(0, 7) + '-01' : mon(base); render(D); });
      document.querySelectorAll('.card .nav button').forEach((b) => b.onclick = () => {
        const n = +b.dataset.n;
        if (!n) base = span === 'm' ? X.today.slice(0, 7) + '-01' : mon(X.today);
        else if (span === 'm') base = addD(base.slice(0, 7) + '-15', 30 * n).slice(0, 7) + '-01';
        else base = addD(base, 7 * n);
        render(D);
      });
      document.querySelectorAll('table.wk td[data-k]').forEach((td) => { td.onclick = () => cellPanel(td.dataset.k); td.onkeydown = (e) => { if (e.key === 'Enter') cellPanel(td.dataset.k); }; });
    }
    if (v === 'load') document.querySelectorAll('table.ls tr.ck').forEach((tr) => tr.onclick = () => {
      const x = lr.R.find((r) => r.l === tr.dataset.l), os = x.aff.slice().sort(CT.riskSort);
      CT.panel(`<h4>영향 주문 ${os.length}건 <small>8주 안 생산 필요 · 위험</small></h4>` + (os.length ? `<table class="ct-t">${os.map((o, i) => `<tr class="ck" data-i="${i}"><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${md(o.needProd)}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('')}</table>` : '<p class="ct-note">없음</p>'),
        `${x.l} 부하`, (p) => p.querySelectorAll('tr.ck').forEach((r) => r.onclick = () => { const o = os[+r.dataset.i]; CT.panel(CT.orderDetail(o), o.id); }));
    });
    const mm = $('mv-more'); if (mm) mm.onclick = () => { mvAll = !mvAll; render(D); };
    CT.keyRows(document.getElementById('ct-main'));
  }
  CT.onView(() => { if (DD) { CT.panel(null); render(DD); } });
  CT.boot(['latest.plan.enc.json', 'plan_prev.enc.json', 'integrated.enc.json', 'portal.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'color_actual.enc.json'], render);
})();
