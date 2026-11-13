/* 조회 전용 대시보드: 계획 결과 JSON을 읽어 현황·차트로 보여준다.
   불러오기: 파일 열기 / 끌어놓기 / ?src=주소(사내 서버·공유폴더) / 계산 화면에서 "대시보드로 보기" */
(function () {
  const GP = window.GP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const famVar = (f) => `var(--fam-${f})`;
  let R = null, A = null, meta = {}, gTab = 0;

  let pendingEnv = null;
  const PW_KEY = 'cgl-dash-pw';
  function askPassword(env) {
    pendingEnv = env;
    $('d-empty-title').textContent = '게시된 최신 계획';
    $('d-empty-text').textContent = '암호를 넣으면 게시된 계획 결과가 열립니다. 암호 해제는 이 브라우저 안에서만 합니다.';
    const lbl = String(env.label || '계획 결과').replace(/\(MES 실적 ~\d{4}-(\d{2})-(\d{2}),?\s*([^)]*)\)/, (_, m, d, x) => `· 재계획(실적 ~${+m}/${+d}${x ? ` · ${x}` : ''})`);   // 11/9: 재계획 표기 통일 '재계획(실적 ~M/D)' — 가동 캘린더와 같게
    $('d-pubinfo').innerHTML = `<b>${esc(lbl)}</b> · 게시 ${UI.fmtDateTime(new Date(env.created))}`;
    $('d-unlock').hidden = false;
    let saved = null; try { saved = localStorage.getItem(PW_KEY) || localStorage.getItem('cgl-analysis-pw'); } catch (e) { saved = null; }
    if (saved) { $('d-pw').value = saved; $('d-remember').checked = true; unlock(); }
    else $('d-pw').focus();
  }
  let shownCreated = null;
  async function unlock() {
    $('d-unlock-msg').textContent = '여는 중…';
    try {
      const o = await GP.decryptJSON(pendingEnv, $('d-pw').value);
      shownCreated = pendingEnv.created;
      try { if ($('d-remember').checked) localStorage.setItem(PW_KEY, $('d-pw').value); else localStorage.removeItem(PW_KEY); } catch (e) { /* 저장 불가 */ }
      $('d-unlock-msg').textContent = '';
      load(o);
      actualMinutes($('d-pw').value);
    } catch (e) { $('d-unlock-msg').textContent = '⚠ ' + e.message; try { localStorage.removeItem(PW_KEY); } catch (x) { /* 무시 */ } }
  }
  $('d-unlock').onsubmit = (ev) => { ev.preventDefault(); unlock(); };
  function load(o) {
    if (o && o.app === 'cgl-plan-enc') { askPassword(o); return; }
    if (o && o.app === 'cgl-plan') { R = o.result; meta = Object.assign({}, o.meta, { savedAt: o.savedAt }); }
    else if (o && o.rows && o.cal && o.P) { R = o; meta = {}; }
    else throw new Error('계획 결과 파일 형식이 아닙니다');
    A = GP.analyze(R);
    const H = A.H, today = localToday();
    $('d-date').min = H.D0; $('d-date').max = H.D1;
    $('d-date').value = today < H.D0 ? H.D0 : today > H.D1 ? H.D1 : today;
    render();
  }
  // 지난 날짜 가동시간 = MES 도금 실적(사내 PC 게시 plating_actual.enc.json 의 dayMin) — 없으면 환산값(최대 24h)
  async function accFromPortal(pw) {
    try { const e = await GP.latest('portal.enc.json'); if (!e || !A) return; const o = await GP.decryptJSON(e, pw);
      const L = Object.values((o && o.acc) || {}).flatMap((x) => x.last || []); if (L.length) { A.accLast = L; render(); } } catch (err) { /* 없으면 재계획 비교 */ }
  }
  async function actualMinutes(pw) {
    accFromPortal(pw);
    GP.latest('gyehoek_hist.enc.json').then((e) => (e ? GP.decryptJSON(e, pw) : null)).then((h) => {   // 월차 = 그 달 첫 게시 계획(01 '월차' 판)
      if (!h || !Array.isArray(h.vers) || !A) return; A.m0 = {}; for (const v of h.vers) if (v.kind === 'm0' && v.c) A.m0[v.mon] = v.c; render(); }).catch(() => {});
    try {
      const e = await GP.latest('plating_actual.enc.json'); if (!e || !A) return;
      const x = await GP.decryptJSON(e, pw); if (!x || !x.dayMin) return;
      A.actMin = {}; for (const [d, L] of Object.entries(x.dayMin)) for (const [l, m] of Object.entries(L)) A.actMin[`${l}|${d}`] = m;
      A.actStops = x.dayStops || null; A.actDummy = x.dayDummy || null;   // 24시간 구성(10/22 사용자: 24시간 안 되는 날 이유) — 설치 묶음 v69 이상
      A.actTon = {}; for (const r of x.daily || []) for (const [l, t] of Object.entries(r)) if (l !== 'd') A.actTon[`${l}|${r.d}`] = t;   // 11/10: 재계획 기준일 다음 날은 계획 톤에 '실적' 표시가 붙던 문제 → MES 일 실적 톤
      A.accHist = x.accHist || null;
      A.mcAct = x.mc || null;                                     // 11/13 점검: 지난 M/C 손실 = MES 실적(도금 실적 화면 'M/C 실적'과 같은 값) — 계획 손실(0)을 쓰던 것                              // 날마다 '그날 아침 계획 vs 실적'(사내 PC 매일 기록) — 계획 대비 실적 표
      render();
    } catch (err) { /* 실적 자료 없으면 환산값 */ }
  }
  function localToday() { if (window.UI && UI.basis && UI.basis()) return UI.today(); const d = new Date(Date.now() - 7 * 3600e3); return GP.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }   // 11/13: 오늘 = 공통 기준일(01 과 같은 날)

  function render() {
    const P = R.P, H = A.H, L = P.lines;
    $('d-empty').hidden = true; $('d-body').hidden = false;
    $('d-title').textContent = `'${String(H.ym[0][0]).slice(2)}.${H.ym.map(([, m]) => m).join('·')}월 도금 CGL 가동계획`;
    $('d-meta').textContent = [meta.asOf && `판매계획 기준 ${meta.asOf}`, meta.savedAt && `계산 ${UI.fmtDateTime(new Date(meta.savedAt))}`, meta.auto && `자동 갱신 ${UI.fmtDateTime(new Date(meta.auto.runAt))}${meta.auto.actualTo ? ` (실적 ~${GP.md(meta.auto.actualTo)})` : ''}`, `계획 기간 ${UI.fmtDate(H.D0)}~${UI.fmtDate(H.D1)}`].filter(Boolean).join(' · ');
    renderNow(); renderReplan();
    const fams = [...new Set(L.flatMap((l) => P.lineFamilies[l]))];
    const leg = fams.map((f) => `<span><i class="sw" style="background:${famVar(f)}"></i>${f}</span>`).join('') + '<span><i class="sw" style="background:var(--mc)"></i>M/C·재가동</span><span><i class="sw" style="background:var(--down)"></i>설비정지·실적 미달</span><span><i class="sw" style="background:var(--sd)"></i>정기수리</span>';
    $('d-legend').innerHTML = leg;
    $('g-tabs').innerHTML = H.ym.map(([, m], i) => `<button type="button" data-g="${i}">${m}월</button>`).join('');
    const today = localToday(), ti = A.mIdx(today);
    renderGantt(gMonth == null ? (ti >= 0 ? ti : 0) : Math.min(gMonth, H.ym.length - 1));
    renderLoad(); renderEvents(); renderDept(); renderEarly();
    $('d-tabs').innerHTML = H.ym.map(([, m]) => `${m}월`).concat(['분기 요약']).map((t, i) => `<button type="button" data-tab="${i}">${t}</button>`).join('');
    if (document.querySelector('details.more').open) { renderDaily(); drawTab(Math.min(gTab, H.ym.length)); }
  }

  // ---------------- 24시간 구성(실적 날): 생산(더미 제외 코일) · 더미 코일 · 휴지(종류·사유, MES 휴지 실적) · 기록 없음(코일 사이 빈 시간) ----------------
  const SCOL = { '강종 전환(M/C)': 'var(--mc)', '정기수리': 'var(--sd)', '설비·운전': 'var(--down)', '기타': '#9aa5b1' };
  function mix(l, d) {
    const run = A.actMin && A.actMin[`${l}|${d}`]; if (run == null) return null;
    const st = ((A.actStops || {})[d] || {})[l] || [], dm = ((A.actDummy || {})[d] || {})[l] || 0;
    const sm = GP.sum(st, (x) => x[1]), gap = Math.max(0, 1440 - Math.min(1440, run) - dm - sm);
    return { run: Math.min(1440, run), dm, st, sm, gap, known: !!A.actStops };
  }
  const hh = (m) => (m / 60).toFixed(m % 60 ? 1 : 0);
  const mixTxt = (x) => [`생산 ${hh(x.run)}h`, x.dm ? `더미 코일 ${hh(x.dm)}h` : '', ...x.st.map((s) => `${s[2]}(${s[0]}) ${hh(s[1])}h`), x.gap >= 15 ? `기록 없음 ${hh(x.gap)}h` : ''].filter(Boolean).join(' · ');

  // ---------------- 기준일 현황(컬러 가동 현황과 같은 카드, 10/22 사용자) ----------------
  function renderNow() {
    const d = $('d-date').value, P = R.P; if (!d) return;
    const byDep = {};
    for (const [dd, l, a, c, t] of R.rows) if (dd === d) { byDep[l] = byDep[l] || {}; byDep[l][c] = (byDep[l][c] || 0) + t; }
    const mi = A.mIdx(d), [yy, mm] = A.H.ym[Math.max(0, mi)], el = +d.slice(8) / GP.daysInMonth(yy, mm);
    $('d-now').innerHTML = P.lines.map((l) => {
      const c = A.calBy[`${l}|${d}`]; if (!c) return '';
      const used = A.used[`${l}|${d}`] || 0, x = mix(l, d), aT = x && A.actTon ? A.actTon[`${l}|${d}`] : null, prod = aT != null ? aT : (A.prodLD[`${l}|${d}`] || 0);
      const cp = A.campaigns.find((q) => q.line === l && q.start <= d && d <= q.end);
      const next = A.events.find((e) => e.line === l && e.date > d);
      const sdNext = P.shutdowns.find((q) => q.line === l && q.start > d);
      const t0_ = (R.replan || {}).t0 || d, dA = d < t0_ ? d : t0_;   // 진도 = 실적(재계획 기준일까지) ÷ 월 계획(지금 계획의 그 달 합 = 실적 + 앞날 계획) — 11/13 사용자 결정
      // 11/13 사용자 '모든 화면 같은 값': 날마다 강종 계열(AZ·AL·MAC)별 정수 반올림 뒤 더함 = 01 일별 가동계획 칸·계
      const dayT = {}; for (const r of R.rows) if (r[1] === l && A.mIdx(r[0]) === mi) { const f = /^AZ/.test(r[2]) ? 'AZ' : /^MAC/.test(r[2]) ? 'MAC' : 'AL', z = (dayT[r[0]] = dayT[r[0]] || {}); z[f] = (z[f] || 0) + r[4]; }
      const dayR = (z) => { const t = Object.values(z).reduce((a, v) => a + v, 0); return t < 0.5 ? 0 : Object.values(z).reduce((a, v) => a + (v >= 0.5 ? Math.round(v) : 0), 0); };
      const monthPlan = Object.values(dayT).reduce((a, z) => a + dayR(z), 0), toDate = Object.entries(dayT).reduce((a, [dd, z]) => a + (dd <= dA ? dayR(z) : 0), 0);
      const M0 = A.m0 && A.m0[`${yy}-${String(mm).padStart(2, '0')}`], m0To = M0 ? Object.entries(M0).reduce((a, [k, v]) => { const [ll, dd] = k.split('|'); return a + (ll === l && dd <= dA && dd.slice(0, 7) === `${yy}-${String(mm).padStart(2, '0')}` ? v[0] || 0 : 0); }, 0) : 0;
      const vsM0 = m0To > 0 ? Math.round(toDate / m0To * 100) : null;
      const deps = Object.entries(byDep[l] || {}).sort((a, b) => b[1] - a[1]);
      const off = c.blackout || prod < 0.5, st = c.blackout ? ['정기수리', 'bad'] : x ? ['실적', 'good'] : ['계획', 'info'];
      const hrs = x ? x.run / 60 : used / 60;
      let seg, leg, list = '';
      if (x) {
        const S = [['생산', x.run, 'var(--brand-2)'], ['더미 코일', x.dm, 'color-mix(in srgb, var(--mc) 45%, var(--surface))']].concat(x.st.map((s) => [`${s[2]}`, s[1], SCOL[s[0]] || '#9aa5b1', s[0]]), [['기록 없음', x.gap, 'repeating-linear-gradient(135deg,#c9cfd7 0 3px,transparent 3px 6px)']]).filter((q) => q[1] >= 1);
        seg = S.map((q) => `<i style="flex:${q[1]};background:${q[2]}" title="${esc(q[0])} ${hh(q[1])}h"></i>`).join('');
        const cat = {}; x.st.forEach((s) => { cat[s[0]] = (cat[s[0]] || 0) + s[1]; });
        leg = [['생산', x.run, 'var(--brand-2)'], ['더미 코일', x.dm, 'color-mix(in srgb, var(--mc) 45%, var(--surface))'], ...Object.entries(cat).map(([k, v]) => [k, v, SCOL[k]]), ['기록 없음', x.gap, '#c9cfd7']].filter((q) => q[1] >= 1)
          .map((q) => `<span><i style="background:${q[2]}"></i>${q[0]} ${hh(q[1])}h</span>`).join('');
        list = x.st.length ? `<ul class="ln-items">${x.st.map((s) => `<li><span>${esc(s[2])} <small class="muted">${esc(s[0])}</small></span><b>${hh(s[1])}h</b></li>`).join('')}</ul>`
          : (x.known ? '' : '<p class="ln-sub">휴지 사유는 사내 PC 설치 묶음 v69 이상부터 표시</p>');
        if (x.gap >= 60) list += `<p class="ln-sub">기록 없음 ${hh(x.gap)}h = MES 에 코일·휴지 기록이 없는 시간(코일 사이 대기·통판 등)</p>`;
      } else if (!c.blackout) {
        const cap = c.cap || 0;
        seg = `<i style="flex:${used};background:var(--brand-2)" title="계획 생산 ${hh(used)}h"></i><i style="flex:${Math.max(0, cap - used)};background:var(--grid)" title="여유 ${hh(Math.max(0, cap - used))}h"></i><i style="flex:${Math.max(0, 1440 - cap)};background:var(--mc)" title="M/C·더미·설비 정지 공제 ${hh(Math.max(0, 1440 - cap))}h"></i>`;
        leg = `<span><i style="background:var(--brand-2)"></i>계획 생산 ${hh(used)}h</span><span><i style="background:var(--grid)"></i>여유 ${hh(Math.max(0, cap - used))}h</span><span><i style="background:var(--mc)"></i>${c.event ? esc(c.event.split(' · ')[0]) + '·' : ''}더미·설비 정지 공제 ${hh(Math.max(0, 1440 - cap))}h</span>`;
      }
      const pr = monthPlan ? Math.min(1, toDate / monthPlan) : 0;
      const chips = [cp ? `<span class="tag">캠페인 ${cp.fam} ${GP.md(cp.start)}~${GP.md(cp.end)} (${GP.diffDays(d, cp.start) + 1}/${GP.diffDays(cp.end, cp.start) + 1}일)</span>` : '',
        next ? `<span class="tag ${GP.diffDays(next.date, d) <= 7 ? 'warn' : ''}">${next.kind === 'M/C' ? `M/C ${next.from}→${next.to}` : `재가동 ${next.from === next.to ? next.to + ' 유지' : next.from + '→' + next.to}`} ${GP.md(next.date)} · D-${GP.diffDays(next.date, d)}</span>` : '<span class="tag">분기 내 전환 없음</span>',
        sdNext ? `<span class="tag">정기수리 ${GP.md(sdNext.start)}~${GP.md(sdNext.end)} · D-${GP.diffDays(sdNext.start, d)}</span>` : ''].filter(Boolean).join('');
      return `<div class="ln-card${off ? ' off' : ''}"><div class="ln-h"><b>${l} ${c.blackout ? '' : `<small style="font-size:14px;color:var(--ink-3)">${c.fam}</small>`}</b><span class="tag ${st[1]}">${st[0]}</span></div>
        <div class="ln-big">${c.blackout ? '-' : GP.fmt(prod)}<small>t</small><span>${c.blackout ? '정기수리' : x ? `가동 ${hrs.toFixed(1)}h / 24h` : `계획 가동 ${hrs.toFixed(1)}h · 가동률 ${c.cap > 0 ? GP.fmt(used / c.cap * 100) : 0}%`}</span></div>
        <div class="ln-gauge" title="가동시간"><i style="width:${Math.min(100, hrs / 24 * 100)}%"></i></div>
        ${seg ? `<p class="ln-l">24시간 구성 ${x ? '<span>MES 실적</span>' : '<span>계획</span>'}</p><div class="ln-mix">${seg}</div><div class="ln-mixl">${leg}</div>${list}` : ''}
        <p class="ln-l">부서 구성</p><div class="ln-mixl">${deps.map(([k, v]) => `<span>${esc(DSHORT[k] || k)} ${GP.fmt(v)}t</span>`).join('') || '<span class="muted">-</span>'}</div>
        <p class="ln-l">${mm}월 진도 <span title="실적 ÷ 월 계획(지금 계획의 ${mm}월 합)${vsM0 != null ? ` · 월차 대비 = ~${GP.md(dA)} 월차(첫 게시 계획) ${GP.fmt(m0To)}t 대비` : ''}">실적 ${GP.fmt(toDate)} / 월 계획 ${GP.fmt(monthPlan)}t · ${Math.round(pr * 100)}%${vsM0 != null ? ` · 월차 대비 ${vsM0}%` : ''}</span></p>
        <div class="ln-prog" title="세로선 = 경과일 ${Math.round(el * 100)}%"><i style="width:${pr * 100}%"></i><u style="left:${el * 100}%"></u></div>
        <div class="ln-chips">${chips}</div></div>`;
    }).join('');
  }
  $('d-date').onchange = () => R && renderNow();
  // 계획 대비 실적(사용자 10/21): 최근 7일, 날마다 '그날 아침 계획 vs 실적'(사내 PC 매일 기록 accHist, 없으면 재계획 비교) — 라인마다 계획·실적·차이 줄, 부서별 비교는 뺌(계획상 그날 부서는 정해지지 않음)
  function renderReplan() {
    const el = $('d-replan'), rp = R.replan || {};
    const nd = (L) => new Set((L || []).map((r) => r[0])).size;
    const lastD = (L) => L.reduce((a, r) => (r[0] > a ? r[0] : a), '');
    const src = [A && A.accHist, A && A.accLast, rp.vsPlan].filter((L) => L && L.length).sort((a, b) => lastD(b).localeCompare(lastD(a)) || nd(b) - nd(a))[0] || [];   // 가장 최근 날까지 있는 기록 우선(옛 재계획 비교 10/1~6 이 뜨던 것, 10/22)   // 날 수가 가장 많은 기록(사내 PC 매일 기록 → 홈 자료 5일 → 재계획 비교)
    if (!src.length) { el.hidden = true; return; }
    el.hidden = false;
    const L = R.P.lines, d1 = lastD(src), d0 = GP.ymd(...(() => { const t = new Date(d1 + 'T00:00:00'); t.setDate(t.getDate() - 6); return [t.getFullYear(), t.getMonth() + 1, t.getDate()]; })()), days = [...new Set(src.map((r) => r[0]))].filter((d) => d >= d0).sort();   // 마지막 실적일 기준 최근 7일
    const get = (d, l) => src.find((x) => x[0] === d && x[1] === l) || [d, l, 0, 0];
    const sg = (v) => `${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}${GP.fmt(Math.abs(v))}`;
    const pc = (a, p) => (p > 0 ? `${GP.fmt(a / p * 100, 1)}%` : '-');
    const body = L.concat(['합계']).map((l) => {
      const P = (d) => (l === '합계' ? GP.sum(L, (x) => get(d, x)[2]) : get(d, l)[2]), A_ = (d) => (l === '합계' ? GP.sum(L, (x) => get(d, x)[3]) : get(d, l)[3]);
      const cp = GP.sum(days, P), ca = GP.sum(days, A_);
      const tr = (lab, f, cls, tot) => `<tr class="${cls}">${lab}${days.map((d) => { const v = f(d); return `<td class="n${cls === 'df' && v < -0.5 ? ' neg' : cls === 'df' && v > 0.5 ? ' pos' : ''}">${cls === 'df' ? sg(v) : GP.fmt(v)}</td>`; }).join('')}${tot}</tr>`;
      return tr(`<th class="ln" rowspan="3">${l}</th><th class="k">계획</th>`, P, 'pl', `<td class="n s">${GP.fmt(cp)}</td><td class="n s" rowspan="3"><b class="r-${cp > 0 ? UI.rate(ca / cp * 100) : ''}">${pc(ca, cp)}</b></td>`)
        + tr('<th class="k">실적</th>', A_, 'ac', `<td class="n s"><b>${GP.fmt(ca)}</b></td>`)
        + tr('<th class="k">차이</th>', (d) => A_(d) - P(d), 'df', `<td class="n s ${ca - cp < -0.5 ? 'neg' : ca - cp > 0.5 ? 'pos' : ''}">${sg(ca - cp)}</td>`);
    }).join('');
    el.innerHTML = `<h2>계획 대비 실적 <small class="muted">최근 ${days.length}일 · 계획 = 그날 아침 재계획이 잡은 생산 · 단위 톤 · 차이 = 실적 − 계획(빨강 = 미달)</small></h2>
      <div class="scroll"><table class="vs3"><colgroup><col style="width:72px"><col style="width:68px">${days.map(() => '<col>').join('')}<col style="width:11%"><col style="width:9%"></colgroup><thead><tr><th colspan="2">라인</th>${days.map((d) => `<th>${GP.md(d)}</th>`).join('')}<th>${days.length}일 합</th><th>달성</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  // ---------------- 일별 차트 (라인별 작은 배수, 같은 y축) ----------------
  function renderDaily() {
    const P = R.P, H = A.H, days = H.days, n = days.length;
    const box = $('d-daily'); const avail = Math.max(box.clientWidth || 700, 300);
    const ml = 44, mr = 8, mt = 16, mb = 22, h = 150;
    const band = Math.max(8, (avail - ml - mr) / n), W = ml + mr + band * n, bw = Math.min(24, band - 2);
    const sc = UI.scale(Math.max(...Object.values(A.prodLD), 1), 0, 2), ymax = sc.hi;   // 눈금 = 전 화면 공통(1·2·5 간격)
    const y = (v) => mt + h - (v / ymax) * h;
    const ticks = sc.ticks;
    box.innerHTML = P.lines.map((l) => {
      let s = `<svg class="daily" width="${W}" height="${mt + h + mb}" role="img" aria-label="${l} 일별 계획 생산량">`;
      if (R.replan) {
        const i1 = days.indexOf(R.replan.t0);
        if (i1 >= 0) s += `<rect x="${ml}" y="${mt}" width="${(i1 + 1) * band}" height="${h}" fill="var(--soft)"/><line x1="${ml + (i1 + 1) * band}" x2="${ml + (i1 + 1) * band}" y1="${mt - 12}" y2="${mt + h}" stroke="var(--ink)" stroke-width="1"/><text x="${ml + (i1 + 1) * band - 4}" y="${mt + 10}" text-anchor="end" style="fill:var(--ink)">실적</text><text x="${ml + (i1 + 1) * band + 4}" y="${mt + 10}" style="fill:var(--ink)">재계획</text>`;
      }
      for (const t of ticks) s += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}"/><text x="${ml - 6}" y="${y(t) + 4}" text-anchor="end">${GP.fmt(t)}</text>`;
      days.forEach((d, i) => {
        const x = ml + i * band, c = A.calBy[`${l}|${d}`], v = A.prodLD[`${l}|${d}`] || 0;
        if (+d.slice(8) === 1) s += `<line class="grid" x1="${x}" x2="${x}" y1="${mt}" y2="${mt + h}"/><text x="${x + 2}" y="${mt + h + 16}">${+d.slice(5, 7)}월</text>`;
        else if (+d.slice(8) % 5 === 0 && +d.slice(8) <= GP.daysInMonth(+d.slice(0, 4), +d.slice(5, 7)) - 3) s += `<text x="${x + band / 2}" y="${mt + h + 16}" text-anchor="middle">${+d.slice(8)}</text>`;
        if (c.blackout) { s += `<rect x="${x}" y="${mt}" width="${band}" height="${h}" fill="var(--sd)"/>`; return; }
        if (GP.isSwitch(c) || GP.isDown(c)) s += `<rect x="${x}" y="${mt - 12}" width="${band}" height="6" rx="2" fill="var(${GP.isSwitch(c) ? '--mc' : '--down'})"/>`;
        if (v > 0.5) {
          const bx = x + (band - bw) / 2, by = y(v), r = Math.min(4, bw / 2, mt + h - by);
          s += `<path class="bar" d="M${bx},${mt + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${mt + h} Z" fill="${famVar(c.fam)}"/>`;
        }
        s += `<rect class="hit" data-l="${l}" data-d="${d}" x="${x}" y="${mt - 12}" width="${band}" height="${h + 12}"/>`;
      });
      // 정기수리 라벨
      for (const sd of P.shutdowns.filter((x) => x.line === l)) {
        const i0 = days.indexOf(sd.start < H.D0 ? H.D0 : sd.start), i1 = days.indexOf(sd.end > H.D1 ? H.D1 : sd.end);
        if (i0 >= 0 && i1 >= 0 && (i1 - i0 + 1) * band > 60) s += `<text x="${ml + (i0 + i1 + 1) / 2 * band}" y="${mt + h / 2}" text-anchor="middle" style="fill:var(--ink);font-weight:bold">정기수리 ${GP.md(sd.start)}~${GP.md(sd.end)}</text>`;
      }
      return `<div class="chart-line"><h3>${l} <span class="muted">(t/일)</span></h3><div class="chart-scroll">${s}</svg></div></div>`;
    }).join('');
  }
  const tip = $('tip');
  function showTip(el, ev) {
    const l = el.dataset.l, d = el.dataset.d, c = A.calBy[`${l}|${d}`];
    const deps = {}; for (const [dd, ll, a, cl, t] of R.rows) if (dd === d && ll === l) deps[cl] = (deps[cl] || 0) + t;
    const u = A.dayMin(l, d);
    tip.innerHTML = `<b>${l} · ${GP.md(d)}(${GP.weekday(d)}) · ${c.fam}</b>${c.event ? `<div>${esc(c.event)} (손실 ${GP.fmt(c.mcdummy)}분)</div>` : ''}<div>생산 ${GP.fmt(A.prodLD[`${l}|${d}`] || 0)}t · 가동률 ${c.cap > 0 ? GP.fmt(u / c.cap * 100) : 0}%</div><table>${Object.entries(deps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td class="n">${GP.fmt(v)}t</td></tr>`).join('')}</table>`;
    tip.hidden = false;
    const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8), yy = Math.max(8, ev.clientY - tip.offsetHeight - 12);
    tip.style.left = x + 'px'; tip.style.top = yy + 'px';
  }
  $('d-daily').addEventListener('pointermove', (ev) => { const el = ev.target.closest('.hit'); if (el) showTip(el, ev); else tip.hidden = true; });
  $('d-daily').addEventListener('pointerdown', (ev) => { const el = ev.target.closest('.hit'); if (el) showTip(el, ev); });
  $('d-daily').addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') tip.hidden = true; });
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  let rT = null; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => R && renderDaily(), 200); });

  // ---------------- 월별 부하 ----------------
  function renderLoad() {
    $('d-load').innerHTML = R.P.lines.map((l) => `<div class="load-grp"><b>${l}</b>` + A.H.ym.map(([, m], i) => {
      const v = A.load[`${l}|${i}`] || 0;
      return `<div class="load-row"><span>${m}월</span><div class="load-track"><div class="load-fill ${v >= 0.995 ? 'full' : ''}" style="width:${Math.min(100, v * 100)}%"></div><div class="load-100"></div></div><span class="n">${GP.fmt(v * 100, 1)}%</span></div>`;
    }).join('') + '</div>').join('') + '<p class="hint">강조 색 막대 = 여유 없음(100%). 오른쪽 세로선 = 100%.</p>';
  }
  // 손실: 지난 날(재계획 기준일까지) = MES 실적 시간(plating_actual mc), 앞날 = 계획 손실(엔진 M/C 정지 분)
  const lossTxt = (e) => {
    const t0 = (R.replan || {}).t0 || '';
    if (t0 && e.date <= t0) { const m = (A.mcAct || []).find((x) => x.d === e.date && x.line === e.line); return m ? `<span title="MES 실적">${GP.fmt(m.h, 1)}h</span>` : '<span class="muted" title="MES M/C 실적 기록 없음">-</span>'; }
    return `<span title="계획(엔진 M/C 정지)">${GP.fmt(e.loss / 60, 1)}h</span>`;
  };
  function renderEvents() {
    const P = R.P;
    const rows = A.events.map((e) => ({ d: e.date, cls: '', cells: [`${GP.md(e.date)}(${GP.weekday(e.date)})`, e.line, e.kind === 'M/C' ? `<b>${e.from} → ${e.to}</b>` : `재가동 <b>${e.from === e.to ? e.to + ' 유지' : e.from + ' → ' + e.to}</b>`, lossTxt(e)], why: GP.eventReason(R, A, e) }))
      .concat(P.shutdowns.map((x) => ({ d: x.start, cls: 'sdrow', cells: [`${GP.md(x.start)}~${GP.md(x.end)}`, x.line, `정기수리 ${GP.diffDays(x.end, x.start) + 1}일`, '-'], why: '' })));
    rows.sort((a, b) => (a.d < b.d ? -1 : 1));
    $('d-events').innerHTML = '<tr><th>일자</th><th>라인</th><th>전환</th><th>손실</th></tr>' + rows.map((r, i) =>
      `<tr class="evrow ${r.cls}" data-i="${i}">${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>` + (r.why ? `<tr class="why-row" data-w="${i}" hidden><td colspan="4">${esc(r.why)}</td></tr>` : '')).join('');
  }
  $('d-events').addEventListener('click', (ev) => { const tr = ev.target.closest('.evrow'); if (!tr) return; const w = $('d-events').querySelector(`[data-w="${tr.dataset.i}"]`); if (w) { w.hidden = !w.hidden; tr.classList.toggle('open', !w.hidden); } });

  // ---------------- HTML 간트: 라인별 강종 행 + 부서 행 + 가동시간 ----------------
  let gMonth = null;
  // 가동시간(h) — 01 일별 가동계획과 같은 정의: 지난 날 = MES 실적 가동 분, 앞날 = 24 − 계획 정지(정지 + M/C 분), 생산·M/C 없는 날 = 빈칸
  const hfmt = (h) => { const r = Math.round(h * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
  function hrsOf(l, d, c, t0) {
    const am = A.actMin && A.actMin[`${l}|${d}`];
    if (t0 && d <= t0 && am != null) return Math.min(1440, am) / 60;
    if ((A.prodLD[`${l}|${d}`] || 0) < 0.5 && !GP.isSwitch(c)) return 0;
    return Math.max(0, 24 - ((c.blackout || 0) + (c.mcdummy || 0)) / 60);
  }
  const DSHORT = { '도금수출': '도금수출', '자동차수출': '자동차수출', '도금국내': '도금국내', '자동차내수': '자동차내수', '자가재': '자가재' };
  function renderGantt(mi) {
    gMonth = mi;
    document.querySelectorAll('#g-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.g === mi));
    const P = R.P, [y, m] = A.H.ym[mi], nd = GP.daysInMonth(y, m), FAM = P.alloyFamily;
    const ds = Array.from({ length: nd }, (_, i) => GP.ymd(y, m, i + 1));
    const fam = {}, dep = {};
    for (const [d, l, a, c, t] of R.rows) { if (A.mIdx(d) !== mi) continue; fam[`${l}|${d}|${FAM[a]}`] = (fam[`${l}|${d}|${FAM[a]}`] || 0) + t; dep[`${l}|${d}|${c}`] = (dep[`${l}|${d}|${c}`] || 0) + t; }
    const today = localToday();
    // 11/13 사용자 '생긴 걸 똑같이(01 과)': 01 일별 가동계획 표와 같은 모양(ui/optable.js·css — 머리 2줄·왼쪽 두 칸·강종 줄 → M/C 줄 → 다음 강종 줄·정기수리 남색 합친 칸·
    //   가동시간 줄·도금 합계 줄·지난 날 덮개·오늘 틀·범례 아래). 이 화면만의 줄(부서별 톤·비가동)은 가동시간 줄 앞뒤에 그대로
    const t0 = (R.replan || {}).t0 || '', FN = { MAC: 'MACOSTA' }, daySum = ds.map(() => 0), ti = ds.indexOf(today);
    let h = OPT.head(ds, today, '', '', ti) + '<tbody>';
    for (const l of P.lines) {
      const f0 = GP.famOrder(P, l), fd = (f) => { const i = ds.findIndex((d) => (fam[`${l}|${d}|${f}`] || 0) >= 0.5); return i < 0 ? 99 : i; };
      const fams = f0.slice().sort((a, b) => fd(a) - fd(b) || f0.indexOf(a) - f0.indexOf(b));   // 11/13: 강종 줄 = 그 달 먼저 생산하는 순(01 일별 가동계획과 같게 — 2CGL AL 위)
      const deps = GP.DEPTS.filter((c) => ds.some((d) => (dep[`${l}|${d}|${c}`] || 0) > 0.5));
      const hasStop = ds.some((d) => { const x = mix(l, d); return x && (x.sm + x.dm + x.gap) >= 30; });
      const rows = fams.slice(0, 1).map((f) => ({ kind: 'fam', f })).concat([{ kind: 'ev' }], fams.slice(1).map((f) => ({ kind: 'fam', f })), deps.map((c) => ({ kind: 'dep', c })), [{ kind: 'hrs' }], hasStop ? [{ kind: 'stop' }] : []);
      const sdIdx = ds.map((d, i) => (A.calBy[`${l}|${d}`].blackout ? i : -1)).filter((i) => i >= 0);
      let sdRow = 0;                                                     // 정기수리 칸 = 직전 생산 강종 줄(01 과 같게)
      if (sdIdx.length) { for (let i = sdIdx[0] - 1; i >= 0; i--) { const f = fams.find((x) => (fam[`${l}|${ds[i]}|${x}`] || 0) >= 0.5); if (f) { sdRow = rows.findIndex((r) => r.kind === 'fam' && r.f === f); break; } } }
      rows.forEach((r, ri) => {
        const rc = r.kind === 'fam' ? 'gr' : r.kind === 'ev' ? 'ev' : r.kind === 'hrs' || r.kind === 'stop' ? 'hr' : 'dp';
        h += `<tr class="${rc} r-${r.kind}${ri === rows.length - 1 ? ' le' : ''}">`;
        if (ri === 0) h += `<th class="c0 lnG" rowspan="${rows.length}">${l}</th>`;
        h += `<th class="c1">${r.kind === 'fam' ? FN[r.f] || r.f : r.kind === 'dep' ? DSHORT[r.c] : r.kind === 'ev' ? '' : r.kind === 'hrs' ? '가동시간' : '비가동'}</th>`;
        let tot = 0;
        ds.forEach((d, i) => {
          if (sdIdx.includes(i) && ri === sdRow) {
            if (i === sdIdx[0]) { const sd = P.shutdowns.find((x) => x.line === l && x.start <= d && d <= x.end); h += `<td class="sp" colspan="${sdIdx.length}" data-d="${d}" title="정기수리${sd ? ` ${GP.md(sd.start)}~${GP.md(sd.end)}` : ''}"><span>정기수리${sdIdx.length > 1 ? ` (${sdIdx.length}일)` : ''}</span></td>`; }
            return;
          }
          const c = A.calBy[`${l}|${d}`], sd = sdIdx.includes(i);
          let v = 0, txt = '', cls = '';
          if (r.kind === 'fam') { v = sd ? 0 : Math.round(fam[`${l}|${d}|${r.f}`] || 0); txt = v >= 1 ? GP.fmt(v) : ''; daySum[i] += v; if (v >= 1) cls = `d k${r.f}`; }
          else if (r.kind === 'ev') { if (!sd && GP.isSwitch(c) && /^M\/C/.test(c.event || '')) { txt = 'M/C'; cls = 'y'; } }
          else if (r.kind === 'dep') { v = Math.round(dep[`${l}|${d}|${r.c}`] || 0); txt = v >= 1 ? GP.fmt(v) : ''; }   // 11/13: 숫자 쉼표(01 과 같게)
          else if (r.kind === 'hrs') { const u = hrsOf(l, d, c, t0) ; txt = u > 0 ? hfmt(u) : ''; }
          else { const x = mix(l, d), m0 = x ? Math.min(x.sm + x.dm + x.gap, 1440 - x.run) : 0; txt = m0 >= 30 ? hfmt(m0 / 60) : ''; }   // 비가동 = 24h − 가동시간을 넘지 않게(MES 정지 기록이 작업시간과 겹치는 날 25h 넘던 것)
          tot += v;
          const xm = (r.kind === 'hrs' || r.kind === 'stop') ? mix(l, d) : null;
          h += `<td class="${cls}" data-d="${d}"${xm ? ` title="${esc(mixTxt(xm))}"` : ''}>${txt}</td>`;
        });
        h += `<td class="tot">${r.kind === 'ev' ? '-' : r.kind === 'hrs' || r.kind === 'stop' ? '' : GP.fmt(tot)}</td></tr>`;
      });
    }
    h += `<tr class="sum"><th class="c0" colspan="2">도금 합계</th>${ds.map((d, i) => `<td>${daySum[i] ? GP.fmt(daySum[i]) : ''}</td>`).join('')}<td class="tot">${GP.fmt(daySum.reduce((a, v) => a + v, 0))}</td></tr>`;
    $('g-table').innerHTML = OPT.wrap(OPT.pad31(h, ds.length) + '</tbody>', ds.filter((d) => d < today).length, ti);
    $('g-legend').className = 'gk-lg';
    $('g-legend').innerHTML = OPT.lg([...[...new Set(P.lines.flatMap((l) => GP.famOrder(P, l)))].map((f) => [`k${f}`, f === 'MAC' ? 'MACOSTA' : f]), ds.some((d) => d < today) && ['pst', '지난 날'], ['y', 'M/C'], ['sp', '정기수리'], ['sep'], ti >= 0 && ['tdy', '오늘']]).replace(/^<div class="gk-lg">|<\/div>$/g, '');
  }
  $('g-tabs').onclick = (ev) => { if (ev.target.dataset.g != null) renderGantt(+ev.target.dataset.g); };
  $('g-table').addEventListener('click', (ev) => { const td = ev.target.closest('td[data-d]'); if (!td || !R) return; $('d-date').value = td.dataset.d; renderNow(); $('d-now').scrollIntoView({ behavior: 'smooth', block: 'center' }); });   // 칸을 누르면 그날 라인 현황(컬러 가동 현황과 같음)
  document.querySelector('details.more').addEventListener('toggle', (ev) => { if (ev.target.open && R) { renderDaily(); drawTab(Math.min(gTab, A.H.ym.length)); } });

  function renderDept() {
    const H = A.H, t = {}, dem = {};
    for (const [d, l, a, c, x] of R.rows) { const k = `${c}|${A.mIdx(d)}`; t[k] = (t[k] || 0) + x; }
    const sept = {};
    for (const it of R.items) dem[it.cls] = (dem[it.cls] || 0) + it.tons;
    for (const it of R.sept) sept[it.cls] = (sept[it.cls] || 0) + it.tons;
    const mx = Math.max(...Object.values(t), 1);
    const cell = (v) => `<td class="n bar-cell"><i style="width:${(v / mx) * 100}%"></i><span>${GP.fmt(v)}</span></td>`;
    $('d-dept').innerHTML = `<tr><th>부서</th>${H.ym.map(([, m]) => `<th>${m}월</th>`).join('')}<th>분기 생산</th><th>전월 생산 가정</th><th>요구량(파일)</th></tr>` +
      GP.DEPTS.map((dp) => { const v = H.ym.map((_, i) => t[`${dp}|${i}`] || 0); return `<tr><td>${dp}</td>${v.map(cell).join('')}<td class="n"><b>${GP.fmt(GP.sum(v))}</b></td><td class="n">${GP.fmt(sept[dp] || 0)}</td><td class="n">${GP.fmt(dem[dp] || 0)}</td></tr>`; }).join('') +
      `<tr><td><b>합계</b></td>${H.ym.map((_, i) => `<td class="n"><b>${GP.fmt(GP.sum(GP.DEPTS, (dp) => t[`${dp}|${i}`] || 0))}</b></td>`).join('')}<td class="n"><b>${GP.fmt(A.prod)}</b></td><td class="n">${GP.fmt(GP.sum(R.sept, (i) => i.tons))}</td><td class="n">${GP.fmt(GP.sum(R.items, (i) => i.tons))}</td></tr>`;
  }
  function renderEarly() {
    const er = GP.earlyReasons(R, A);
    $('d-early').innerHTML = '<tr><th>라인</th><th>강종</th><th>부서</th><th>생산월</th><th>마감</th><th>물량(t)</th><th>사유</th></tr>' + er.map((x) => `<tr><td>${x.line}</td><td>${x.alloy}</td><td>${x.cls}</td><td>${x.prodMonth}월</td><td>${GP.md(x.due)}</td><td class="n">${GP.fmt(x.tons, 1)}</td><td class="l">${esc(x.why)}</td></tr>`).join('') + `<tr><td colspan="5"><b>합계</b></td><td class="n"><b>${GP.fmt(A.earlyT, 1)}</b></td><td></td></tr>`;
  }
  function drawTab(i) {
    gTab = i;
    document.querySelectorAll('#d-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.tab === i));
    const c = document.createElement('canvas');
    $('d-gantt').src = (i < A.H.ym.length ? GP.drawGanttMonth(c, R, A, i, 2) : GP.drawSummary(c, R, A, 2)).toDataURL('image/png');
  }
  $('d-tabs').onclick = (ev) => { if (ev.target.dataset.tab != null) drawTab(+ev.target.dataset.tab); };
  $('d-gantt').onclick = () => { const w = window.open(); if (w) { const im = w.document.createElement('img'); im.src = $('d-gantt').src; w.document.body.style.margin = '0'; w.document.body.appendChild(im); } };

  // ---------------- 불러오기 ----------------
  async function fromFile(f) { try { load(JSON.parse(await f.text())); } catch (e) { alert('결과 파일을 열지 못했습니다: ' + e.message); } }
  $('d-file').onchange = (ev) => ev.target.files[0] && fromFile(ev.target.files[0]);
  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drag'); });
  document.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) fromFile(f); });
  const src = new URLSearchParams(location.search).get('src');
  let handoff = null;
  try { handoff = sessionStorage.getItem('cgl-dash-handoff'); } catch (e) { handoff = null; }
  if (src) fetch(src, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(load).catch((e) => { $('d-empty').insertAdjacentHTML('beforeend', `<p class="hint" style="color:var(--err)">주소에서 결과를 읽지 못함: ${esc(e.message)}</p>`); });
  else if (handoff) { try { load(JSON.parse(handoff)); } catch (e) { /* 무시 */ } }
  else GP.fetchPublished().then((env) => {
    if (env && env.app === 'cgl-plan') { shownCreated = env.savedAt || 'plain'; load(env); }   // 사내 서버: 평문 결과 → 바로 표시
    else if (env) askPassword(env);
    else { $('d-empty-title').textContent = '게시된 계획이 없습니다'; $('d-empty-text').textContent = '계획이 게시되면 여기에 자동으로 표시됩니다. 결과 파일(.json)이 있으면 위 “결과 파일 열기”로 볼 수도 있습니다.'; }
  }).catch(() => { /* 게시본 없음 */ });
  // 상시 화면용: 5분마다 새 게시본이 있으면 자동으로 바꿔 보여줌(암호를 기억한 기기)
  setInterval(async () => {
    if (!shownCreated || document.hidden) return;
    try {
      const env = await GP.fetchPublished(); if (!env) return;
      const stamp = env.created || env.savedAt; if (stamp === shownCreated) return;
      const o = env.app === 'cgl-plan' ? env : await GP.decryptJSON(env, $('d-pw').value);
      shownCreated = stamp; load(o);
      $('d-meta').textContent += ' · 새 게시본으로 자동 갱신됨';
    } catch (e) { /* 다음 주기에 재시도 */ }
  }, 5 * 60 * 1000);
})();
