/* 03 생산계획 — 주간 일정·부하(11/4 통합 관제 개편, docs/22). 도금 = 게시 재계획(latest.plan), 컬러 = 통합 계획(integrated) */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD } = CT;
  const $ = (id) => document.getElementById(id);
  const LG = ['1CGL', '2CGL'], LC = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const KN = { plan: '계획휴지', sd: 'S/D', repair: '수리', jr: '정기수리', clean: '청소', test: 'Test', sample: '샘플' };
  let tab = 'week', span = 7, X = null;

  function prep(D) {
    const L = (D['latest.plan'] || {}).result || {}, I = D.integrated || {}, P = D.portal || {};
    const asOf = P.asOf || (L.replan || {}).t0 || CT.today();
    const cell = {};                                           // `${line}|${d}` → {t, items:{}, act, ev:[], down:min}
    const C = (k) => (cell[k] = cell[k] || { t: 0, items: {}, act: false, ev: [], down: 0 });
    for (const r of L.rows || []) { const c = C(`${r[1]}|${r[0]}`); c.t += +r[4] || 0; c.items[`${r[2]} ${r[3]}`] = (c.items[`${r[2]} ${r[3]}`] || 0) + (+r[4] || 0); c.fam = r[2]; if (r[0] <= asOf) c.act = true; }
    const capG = {};
    for (const c0 of L.cal || []) {
      const c = C(`${c0.line}|${c0.date}`); capG[`${c0.line}|${c0.date}`] = c0.cap;
      if (c0.event) c.ev.push(c0.event);
      if (c0.blackout > 0.5) { c.ev.push(`정지 ${n0(c0.blackout)}분`); c.down += c0.blackout; }
      if (!c.fam) c.fam = c0.fam;
    }
    for (const x of I.color || []) { const c = C(`${x.l}|${x.d}`); c.min = (c.min || 0) + (+x.min || 0); for (const [g, t] of Object.entries(x.g || {})) { c.t += t; c.items[g] = (c.items[g] || 0) + t; } if (x.act) c.act = true; }
    for (const [d, l, k, m] of I.colorDown || []) { const c = C(`${l}|${d}`); c.down += +m || 0; if (m >= 120) c.ev.push(`${KN[k] || k} ${m >= 1439 ? '종일' : n0(m) + '분'}`); }
    // 라인 하루 능력: 도금 = 가용분(캘린더 − 정지)/60 × 라인 t/h(최근 실적) → t, 컬러 = 정지 뺀 1,440분(계획 편성이 분 단위라 부하 = 편성 분 ÷ 가용 분)
    const tph = {}; for (const x of P.lines || []) tph[x.line] = x.tph;
    const avail = (l, d) => {
      const c = cell[`${l}|${d}`] || {};
      if (LG.includes(l)) { const m = capG[`${l}|${d}`]; return m == null ? null : Math.max(0, m - (c.down || 0)); }
      return Math.max(0, 1440 - Math.min(1440, c.down || 0));
    };
    const used = (l, d) => { const c = cell[`${l}|${d}`] || {}; return LG.includes(l) ? (tph[l] ? (c.t || 0) / tph[l] * 60 : null) : (c.min || 0); };
    const cap = (l, d) => { const a = avail(l, d), c = cell[`${l}|${d}`] || {}; if (a == null) return null; if (LG.includes(l)) return tph[l] ? a / 60 * tph[l] : null; return c.min > 0 ? (c.t || 0) * a / c.min : null; };
    const tpd = {};
    const OM = CT.orders(D);
    const due = {};                                          // `${line}|${needProd}` → 주문(완료 제외)
    for (const o of OM.all) { if (o.risk === '완료' || !o.needProd || !o.line) continue; (due[`${o.line}|${o.needProd}`] = due[`${o.line}|${o.needProd}`] || []).push(o); }
    const days = [...new Set(Object.keys(cell).map((k) => k.split('|')[1]))].sort();
    return { asOf, cell, cap, avail, used, due, days, L, I, P, OM, tph, tpd };
  }

  function weekGrid() {
    const today = X.asOf, lines = [...(CT.inScope('G') ? LG : []), ...(CT.inScope('C') ? LC : [])];
    let ds;
    if (span === 'm') { const m = today.slice(0, 7); ds = X.days.filter((d) => d.slice(0, 7) === m); } else ds = Array.from({ length: span }, (_, i) => addD(today, i));
    const head = `<tr><th class="ln">라인</th>${ds.map((d) => `<th class="${wd(d) === 0 ? 'sun' : wd(d) === 6 ? 'sat' : ''}${d === today ? ' td' : ''}">${md(d)}<small>${WD[wd(d)]}</small></th>`).join('')}<th class="r">계</th></tr>`;
    const row = (l) => {
      let sum = 0;
      const tds = ds.map((d) => {
        const c = X.cell[`${l}|${d}`] || { t: 0, items: {}, ev: [], down: 0 };
        sum += c.t;
        const top = Object.entries(c.items).sort((a, b) => b[1] - a[1])[0];
        const risk = (X.due[`${l}|${d}`] || []).filter((o) => o.risk === '위험').length;
        const stop = c.down >= 1439;
        const cls = [stop ? 'stop' : '', c.t < 0.5 && !stop ? 'idle' : '', c.act && d < today ? 'act' : '', c.ev.some((e) => /M\/C/.test(e)) ? 'mc' : ''].join(' ');
        return `<td class="${cls}" data-k="${l}|${d}" tabindex="0">${stop ? `<span class="ev">${esc(c.ev[0] || '정지')}</span>` : c.t >= 0.5 ? `<b>${n0(c.t)}</b><small>${esc(top ? (LG.includes(l) ? top[0].split(' ')[0] : top[0]) : '')}</small>` : '<small>휴지</small>'}${!stop && c.ev.length ? `<span class="ev">${esc(c.ev[0])}</span>` : ''}${risk ? `<i class="rk" title="납기 위험 주문 ${risk}건">${risk}</i>` : ''}</td>`;
      }).join('');
      return `<tr><th class="ln">${l}</th>${tds}<td class="r tot">${n0(sum)}</td></tr>`;
    };
    const grp = (nm, L) => (L.length ? `<tr class="pl"><th colspan="${ds.length + 2}">${nm}</th></tr>` + L.map(row).join('') : '');
    return `<div class="ct-wrap"><table class="wk">${head}${grp('도금', lines.filter((l) => LG.includes(l)))}${grp('컬러', lines.filter((l) => LC.includes(l)))}</table></div>`
      + '<p class="ct-note"><i class="lg act"></i>실적(지난 날) <i class="lg"></i>계획 <i class="lg stop"></i>종일 정지 <i class="lg mc"></i>강종 교체(M/C) <i class="rk">n</i> 그날 생산 필요 주문 중 납기 위험 건수 · 칸을 누르면 상세</p>';
  }

  function cellPanel(k) {
    const [l, d] = k.split('|'), c = X.cell[k] || { t: 0, items: {}, ev: [] };
    const items = Object.entries(c.items).sort((a, b) => b[1] - a[1]);
    const os = (X.due[k] || []).slice().sort(CT.riskSort);
    const html = `<div class="ct-kv"><span>${c.act && d < X.asOf ? '실적' : '계획'}</span><b>${n1(c.t)}t</b></div>`
      + (c.ev.length ? `<div class="ct-kv"><span>가동</span><b>${c.ev.map(esc).join(' · ')}</b></div>` : '')
      + (X.cap(l, d) != null ? `<div class="ct-kv"><span>능력(추정)</span><b>${n0(X.cap(l, d))}t</b></div>` : '')
      + (items.length ? `<h4>${LG.includes(l) ? '강종 · 판매그룹' : '판매그룹'}</h4>${items.map(([g, t]) => `<div class="ct-kv"><span>${esc(g)}</span><b>${n1(t)}t</b></div>`).join('')}` : '')
      + `<h4>이날 생산 필요 주문 ${os.length}건</h4>` + (os.length ? `<table class="ct-t">${os.map((o, i) => `<tr class="ck" data-i="${i}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('')}</table>` : '<p class="ct-note">없음</p>');
    CT.panel(html, `${l} · ${md(d)}(${WD[wd(d)]})`);
    document.querySelectorAll('#ct-panel tr.ck').forEach((tr) => tr.onclick = () => { const o = os[+tr.dataset.i]; CT.panel(CT.orderDetail(o), o.id); });
  }

  function loadTab() {
    const lines = [...(CT.inScope('G') ? LG : []), ...(CT.inScope('C') ? LC : [])];
    const mon = (d) => addD(d, -((wd(d) + 6) % 7));
    const w0 = mon(X.asOf), weeks = Array.from({ length: 8 }, (_, i) => addD(w0, 7 * i));
    const R = lines.map((l) => ({ l, w: weeks.map((s) => {
      let need = 0, av = 0, us = 0, ok = true;
      for (let i = 0; i < 7; i++) { const d = addD(s, i); if (d < X.asOf) continue; need += (X.cell[`${l}|${d}`] || {}).t || 0; const a = X.avail(l, d), u = X.used(l, d); if (a == null || u == null) { if (((X.cell[`${l}|${d}`] || {}).t || 0) > 0.5) ok = false; continue; } av += a; us += u; }
      const r = ok && av > 0 ? us / av : null;
      return { s, need, r, idle: av <= 0 && need < 0.5, cap: r ? need / r : null };
    }) }));
    const tone = (r) => (r == null ? '' : r > 1.005 ? 'bad' : r >= 0.95 ? 'warn' : 'ok');   // 컬러는 편성이 하루를 꽉 채워 100% 가 보통 → 병목 = 100% 초과
    const bot = R.flatMap((x) => x.w.map((w) => ({ l: x.l, ...w }))).filter((w) => w.r != null && w.r > 1.005);
    const over = bot.reduce((a, w) => a + Math.max(0, w.need - w.cap), 0);
    const kp = CT.kpis([
      { label: '8주 필요 생산량', v: n0(R.reduce((a, x) => a + x.w.reduce((b, w) => b + w.need, 0), 0)), unit: 't', tone: 'info' },
      { label: '병목(부하 100% 초과)', v: bot.length, unit: '라인·주', tone: bot.length ? 'bad' : 'ok', sub: bot.slice(0, 3).map((w) => `${w.l} ${md(w.s)}주`).join(' · ') },
      { label: '이월 예상', v: n0(over), unit: 't', tone: over >= 1 ? 'bad' : 'ok', sub: '부하 초과분 합' },
    ]);
    const bar = (w) => (w.idle ? '<span class="sub">정비·휴지</span>' : w.r == null ? '<span class="sub">능력 자료 없음</span>' : `<div class="lb ${tone(w.r)}" title="계획 ${n0(w.need)}t / 능력 ${n0(w.cap)}t${w.need > w.cap ? ` · 이월 ${n0(w.need - w.cap)}t` : ''}"><i style="width:${Math.min(100, w.r * 100).toFixed(1)}%"></i></div><b class="${tone(w.r)}">${Math.round(w.r * 100)}%</b>`);
    const tbl = `<div class="ct-wrap"><table class="ct-t ld"><thead><tr><th>라인</th>${weeks.map((s) => `<th>${md(s)}주</th>`).join('')}</tr></thead><tbody>`
      + R.map((x) => `<tr><td class="id">${x.l}</td>${x.w.map((w) => `<td class="lc">${bar(w)}<small>${w.idle ? '' : `${n0(w.need)}t`}</small></td>`).join('')}</tr>`).join('')
      + '</tbody></table></div>';
    const tl = Object.entries(X.tph).filter(([l]) => LG.includes(l)).map(([l, v]) => `${l} ${n1(v)}t/h`).join(' · ');
    return kp + tbl + `<p class="ct-note">부하 = 도금: 계획 톤 ÷ (가용분 × 최근 실적 t/h: ${tl}) · 컬러: 편성 분 ÷ 정지 뺀 분 · 칸 숫자 = 계획 톤 · 이번 주는 오늘부터</p>`;
  }

  function render(D) {
    X = prep(D);
    const L = X.L, I = X.I;
    $('ct-main').innerHTML = CT.basis([{ name: '도금 재계획', at: (L.replan || {}).t0 || (D['latest.plan'] || {}).savedAt, kind: '재계획' }, { name: '컬러 계획', at: I.built, kind: '확정계획' }, { name: '실적', at: X.asOf, kind: '실적' }])
      + CT.tabs('pl-tab', [['week', '주간 일정'], ['load', '부하·능력']], tab)
      + (tab === 'week' ? `<section class="card"><div class="hd"><h2>라인 × 날짜</h2>${CT.tabs('pl-span', [['7', '7일'], ['14', '14일'], ['m', '이번 달']], String(span))}</div>${weekGrid()}</section>` : `<section class="card"><h2>주차별 부하·능력 <small>다음 8주</small></h2>${loadTab()}</section>`);
    $('pl-tab').querySelectorAll('button').forEach((b) => b.onclick = () => { tab = b.dataset.k; render(D); });
    const sp = $('pl-span'); if (sp) sp.querySelectorAll('button').forEach((b) => b.onclick = () => { span = b.dataset.k === 'm' ? 'm' : +b.dataset.k; render(D); });
    document.querySelectorAll('table.wk td[data-k]').forEach((td) => { td.onclick = () => cellPanel(td.dataset.k); td.onkeydown = (e) => { if (e.key === 'Enter') cellPanel(td.dataset.k); }; });
  }
  CT.boot(['latest.plan.enc.json', 'integrated.enc.json', 'portal.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'color_actual.enc.json'], render);
})();
