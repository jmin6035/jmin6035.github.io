/* 화면 로직. 계산은 worker.js(Web Worker)에서, 엑셀·간트 작성은 여기서. */
(function () {
  const GP = window.GP;
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'cgl-plan-params-v1';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
  };
  let P = Object.assign(GP.clone(GP.DEFAULT_PARAMS), store.get() || {});
  if (!P.phase2Mode) P.phase2Mode = 'fast';
  let files = [], parsed = null, result = null, meta = {};
  const worker = new Worker('worker.js');

  // ---------------- 파라미터 폼 ----------------
  const LOSS = [['switchDummy', '강종 전환(M/C) 손실, 분/회'], ['nonfamDummy', '비강종 더미, 분/일'], ['equipDown', '설비정지, 분/일'], ['restartFamchg', 'S/D 재가동 — 강종 바뀜, 분'], ['restartSame', 'S/D 재가동 — 같은 강종, 분']];
  function renderParams() {
    $('p-year').value = P.year;
    $('p-q').value = String(P.months[0]);
    $('p-rel').value = P.releaseDays;
    $('p-w1').checked = P.firstWindowPrevMonth;
    $('p-t1').value = P.timeLimit1; $('p-t2').value = P.timeLimit2; $('p-mode').value = P.phase2Mode || 'fast';
    $('p-init').innerHTML = P.lines.map((l) => `<label>${l} <select data-init="${l}"><option value="">자유(모델이 선택)</option>${P.lineFamilies[l].map((f) => `<option ${P.initFamily[l] === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>`).join('');
    $('p-sd').innerHTML = P.shutdowns.map((s, i) => `<div class="sd-row"><select data-sd="${i}" data-k="line">${P.lines.map((l) => `<option ${s.line === l ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="date" data-sd="${i}" data-k="start" value="${s.start}"><span>~</span><input type="date" data-sd="${i}" data-k="end" value="${s.end}"><button type="button" class="ghost x" data-sddel="${i}" aria-label="삭제">✕</button></div>`).join('') || '<p class="hint">정기수리 없음</p>';
    $('p-loss').innerHTML = `<tr><th>항목</th>${P.lines.map((l) => `<th>${l}</th>`).join('')}</tr>` + LOSS.map(([k, lab]) => `<tr><td class="l">${lab}</td>${P.lines.map((l) => `<td><input type="number" step="any" data-loss="${k}" data-line="${l}" value="${P[k][l]}"></td>`).join('')}</tr>`).join('');
    const rk = Object.keys(P.rateDept).sort();
    $('p-rate').innerHTML = '<tr><th>라인</th><th>강종</th><th>부서</th><th>t/hr</th></tr>' + rk.map((k) => { const [l, a, c] = k.split('|'); return `<tr><td>${l}</td><td>${a}</td><td>${c}</td><td><input type="number" step="any" data-rate="${k}" value="${GP.round(P.rateDept[k] * 60, 3)}"></td></tr>`; }).join('')
      + Object.keys(P.rateBase).sort().map((k) => { const [l, a] = k.split('|'); return `<tr><td>${l}</td><td>${a}</td><td>(기본값)</td><td><input type="number" step="any" data-rbase="${k}" value="${GP.round(P.rateBase[k] * 60, 3)}"></td></tr>`; }).join('');
  }
  function readParams() {
    P.year = +$('p-year').value || P.year;
    const q = +$('p-q').value; P.months = [q, q + 1, q + 2];
    P.releaseDays = Math.max(0, +$('p-rel').value || 0);
    P.firstWindowPrevMonth = $('p-w1').checked;
    P.timeLimit1 = Math.max(30, +$('p-t1').value || 1800); P.timeLimit2 = Math.max(30, +$('p-t2').value || 1800); P.phase2Mode = $('p-mode').value;
    document.querySelectorAll('[data-init]').forEach((e) => { P.initFamily[e.dataset.init] = e.value; });
    document.querySelectorAll('[data-sd]').forEach((e) => { P.shutdowns[+e.dataset.sd][e.dataset.k] = e.value; });
    document.querySelectorAll('[data-loss]').forEach((e) => { const v = parseFloat(e.value); if (isFinite(v)) P[e.dataset.loss][e.dataset.line] = v; });
    document.querySelectorAll('[data-rate]').forEach((e) => { const v = parseFloat(e.value); if (v > 0) P.rateDept[e.dataset.rate] = v / 60; });
    document.querySelectorAll('[data-rbase]').forEach((e) => { const v = parseFloat(e.value); if (v > 0) P.rateBase[e.dataset.rbase] = v / 60; });
    store.set(P);
  }
  let reparseTimer = null;
  $('sec-params').addEventListener('change', (ev) => {
    readParams();
    if (ev.target.id === 'p-year' || ev.target.id === 'p-q') {
      renderParams();
    }
    clearTimeout(reparseTimer); reparseTimer = setTimeout(() => files.length && parse(), 300);
  });
  $('sec-params').addEventListener('click', (ev) => {
    const d = ev.target.dataset && ev.target.dataset.sddel;
    if (d != null) { P.shutdowns.splice(+d, 1); store.set(P); renderParams(); files.length && parse(); }
  });
  $('sd-add').onclick = () => {
    const m = String(P.months[1]).padStart(2, '0');
    P.shutdowns.push({ line: P.lines[P.lines.length - 1], start: `${P.year}-${m}-01`, end: `${P.year}-${m}-07` });
    store.set(P); renderParams(); files.length && parse();
  };
  $('p-reset').onclick = () => { P = GP.clone(GP.DEFAULT_PARAMS); store.set(P); renderParams(); files.length && parse(); };
  $('p-export').onclick = () => download(new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' }), `가동계획_조건_${P.year}_${P.months[0]}월.json`);
  $('p-import').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { P = Object.assign(GP.clone(GP.DEFAULT_PARAMS), JSON.parse(await f.text())); store.set(P); renderParams(); files.length && parse(); }
    catch (e) { alert('조건 파일을 읽지 못했습니다: ' + e.message); }
  };

  // ---------------- 파일 → 해석 ----------------
  // 기준 자료(확정 계획 입력 = 컬러 계산 기준 자료 묶음 안의 엑셀) + 바꿀 자료(올린 파일이 우선)
  const BASE = { sales: 'data/ctx_가동_판매자가재.xlsx', sail: 'data/ctx_배선일정분석.xlsx' };
  const SRC = { sales: ['판매계획 · 자가재계획', '판매계획 · 자가재생산계획 시트'], sail: ['배선일정', '정리_배선일정 시트 — 없으면 내장 배선일정'] };
  const base = {}, upl = {};
  let baseInfo = null;
  const b64buf = (b) => { const s_ = atob(b), u = new Uint8Array(s_.length); for (let i = 0; i < s_.length; i++) u[i] = s_.charCodeAt(i); return u.buffer; };
  function srcTiles() {
    const t = (k) => { const u = upl[k], b = base[k]; return `<div class="cc-src"><b>${SRC[k][0]}</b><small>${u ? `올린 파일: ${esc(u.name)}` : b ? `기준: ${esc(BASE[k].split('/').pop())} (확정 계획 v30 입력)` : '기준 자료 없음 — 파일을 올려 주세요'} · ${SRC[k][1]}</small><span class="st ${u || b ? 'ok' : 'warn'}">${u ? '올린 파일 사용' : b ? '사용' : '없음'}</span></div>`; };
    $('g-src').innerHTML = t('sales') + t('sail') + `<div class="cc-src"><b>계획 조건</b><small>속도·시간손실·첫날 강종·정기수리 — ③에서 확인·변경${baseInfo ? '' : ''}</small><span class="st ok">${JSON.stringify(P) === JSON.stringify(GP.DEFAULT_PARAMS) ? '기본값(v30)' : '바꾼 값'}</span></div>`;
    ['sales', 'sail'].forEach((k) => { const L = $('u-' + k); if (L) { L.classList.toggle('on', !!upl[k]); L.querySelector('em').textContent = upl[k] ? `✓ ${upl[k].name}` : ''; } });
  }
  function useFiles() { files = ['sales', 'sail'].map((k) => upl[k] || base[k]).filter(Boolean); srcTiles(); if (files.length) parse(); }
  document.querySelectorAll('#sec-up input[type=file][data-k]').forEach((inp) => inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return; upl[inp.dataset.k] = { name: f.name, buf: await f.arrayBuffer() }; useFiles();
  });
  document.querySelectorAll('#sec-up .dl-tpl').forEach((b) => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const k = b.dataset.dl, x = base[k];
    if (!x) { alert('기준 자료가 아직 열리지 않았습니다(①의 분석 암호 입력).'); return; }
    download(new Blob([x.buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), x.name);
  });
  async function openBase(pw) {
    try {
      const env = await GP.latest('color_calc_files.enc.json');
      if (!env) throw new Error('기준 자료 파일 없음');
      const d = await GP.decryptJSON(env, pw);
      for (const [k, path] of Object.entries(BASE)) if (d.files[path]) base[k] = { name: path.split('/').pop(), buf: b64buf(d.files[path]) };
      baseInfo = { created: env.created };
      try { localStorage.setItem('cgl-analysis-pw', pw); } catch (e) { /* 무시 */ }
      $('g-unlock').hidden = true; useFiles();
    } catch (e) {
      $('g-unlock').hidden = false; srcTiles();
      if (pw) $('g-msg').textContent = /암호/.test(String(e.message)) ? '⚠ 암호가 맞지 않습니다' : '⚠ 기준 자료를 읽지 못했습니다: ' + e.message;
    }
  }
  $('g-unlock').addEventListener('submit', (e) => { e.preventDefault(); openBase($('g-pw').value); });
  { let pw0 = null; try { pw0 = localStorage.getItem('cgl-analysis-pw'); } catch (e) { /* 무시 */ } if (pw0) openBase(pw0); else { $('g-unlock').hidden = false; srcTiles(); } }
  function parse() {
    srcTiles();
    show('sec-error', false); $('run').disabled = true;
    $('check-summary').innerHTML = '<p class="muted">파일 읽는 중…</p>';
    worker.postMessage({ type: 'parse', files, params: P });
  }
  function renderParsed(m) {
    parsed = m; meta = { checks: m.checks, asOf: m.asOf };
    const need = ['판매계획', '자가재생산계획', '정리_배선일정'];
    $('file-list').innerHTML = m.sheets.map((f) => `<li>${esc(f.name)} ${f.sheets.filter((s) => need.includes(s.replace(/\s/g, ''))).map((s) => `<span class="tag ok">✓ ${esc(s)}</span>`).join('') || '<span class="tag">필요한 시트 없음</span>'}</li>`).join('');
    const errs = m.checks.filter((c) => c.level === 'error'), warns = m.checks.filter((c) => c.level === 'warn');
    $('checks').innerHTML = m.checks.filter((c) => c.level !== 'info').concat(m.checks.filter((c) => c.level === 'info')).map((c) => `<li class="${c.level}">${{ error: '오류', warn: '경고', info: '정보' }[c.level]} · ${esc(c.msg)}</li>`).join('');
    const H = GP.horizon(P);
    $('check-summary').innerHTML = m.summary
      ? `<p>판매계획 기준 <b>${esc(m.asOf || '-')}</b> · 계획 기간 <b>${H.D0} ~ ${H.D1}</b> · 계획 대상 <b>${GP.fmt(m.summary.demand)}t</b> (버킷 ${m.summary.nBuckets}개)${P.firstWindowPrevMonth ? ` · 첫 달 1~5일 선적분 ${GP.fmt(m.summary.sept)}t는 전월 생산 가정` : ''}. 경고 ${warns.length}건.</p>`
      : '<p class="muted">입력 오류를 먼저 해결하세요.</p>';
    // 부서×월 수요표
    const t = {};
    for (const it of m.items) { const k = `${it.cls}|${it.mi}`; t[k] = (t[k] || 0) + it.tons; }
    $('demand-table').innerHTML = `<tr><th>부서</th>${H.ym.map(([, mm]) => `<th>${mm}월</th>`).join('')}<th>계</th></tr>` + GP.DEPTS.map((d) => { const v = H.ym.map((_, i) => t[`${d}|${i}`] || 0); return `<tr><td>${d}</td>${v.map((x) => `<td class="n">${GP.fmt(x)}</td>`).join('')}<td class="n"><b>${GP.fmt(GP.sum(v))}</b></td></tr>`; }).join('');
    $('run').disabled = errs.length > 0;
    show('sec-check', true);
  }

  // ---------------- 계산 ----------------
  let t0 = 0, timer = null, stage = 0, wake = null;
  const STAGES = [['1단계: M/C 최소 강종 일정 탐색', 0, 60, 120], ['2단계: M/C 고정, 선생산 최소화', 60, 97, 40], ['평준화·목적지 배정', 97, 100, 5]];
  function setStage(i) { stage = i; $('stage').textContent = STAGES[i][0]; }
  function t0Run() {
    t0 = Date.now(); let stageT = t0;
    clearInterval(timer);
    timer = setInterval(() => {
      const s = (Date.now() - t0) / 1000, [, a, b, exp] = STAGES[stage];
      $('elapsed').textContent = `${Math.floor(s / 60)}분 ${Math.floor(s % 60)}초`;
      const f = 1 - Math.exp(-((Date.now() - stageT) / 1000) / exp);
      $('bar-fill').style.width = `${a + (b - a) * f * 0.95}%`;
    }, 500);
    worker._onStage = () => { stageT = Date.now(); };
  }
  $('run').onclick = async () => {
    if (!parsed) return;
    readParams();
    show('sec-result', false); show('sec-error', false); show('sec-progress', true);
    $('log').innerHTML = ''; $('solver').textContent = ''; setStage(0);
    $('run').disabled = true;
    t0Run();
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
    worker.postMessage({ type: 'run', items: parsed.items, params: P });
  };
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'parsed') renderParsed(m);
    else if (m.type === 'log') {
      const li = document.createElement('li'); li.textContent = `${GP.fmt(m.sec)}초 · ${m.msg}`; $('log').appendChild(li);
      if (/^1단계/.test(m.msg)) { setStage(1); worker._onStage(); }
      if (/^2단계/.test(m.msg)) { setStage(2); worker._onStage(); }
    } else if (m.type === 'solver') {
      const f = (v) => (isFinite(parseFloat(v)) ? GP.fmt(parseFloat(v), parseFloat(v) < 100 ? 3 : 0) : '없음');
      $('solver').textContent = `탐색 중 — 하한 ${f(m.bound)} · 현재 최선 ${f(m.best)} · 격차 ${/%$/.test(m.gap || '') ? m.gap : '-'}`;
    } else if (m.type === 'done') {
      finish(); result = m.result; result.savedAt = new Date().toISOString(); renderResult(); window._autoPublish && window._autoPublish();
    } else if (m.type === 'error') {
      finish(); show('sec-error', true); $('error-msg').textContent = m.msg + (m.stack ? '\n\n' + m.stack : '');
    }
  };
  function finish() {
    clearInterval(timer); timer = null; $('bar-fill').style.width = '100%'; $('run').disabled = !parsed || parsed.checks.some((c) => c.level === 'error'); $('rp-run').disabled = false;
    if (wake) { wake.release().catch(() => {}); wake = null; }
  }
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && timer && navigator.wakeLock && !wake) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* 무시 */ } }
  });

  // ---------------- 결과 ----------------
  let A = null, gTab = 0;
  function renderResult() {
    const R = result; A = GP.analyze(R);
    show('sec-progress', false); show('sec-result', true);
    const L = R.P.lines, mcT = GP.sum(L, (l) => A.mc[l]);
    const maxLoad = Math.max(...Object.values(A.load));
    $('kpis').innerHTML = [
      [`${mcT}회`, `M/C (${L.map((l) => `${l} ${A.mc[l]}`).join(' · ')})`],
      [`${GP.fmt(A.short)}t`, '결품', A.short > 0.5], [`${GP.fmt(A.lateT)}t`, '지연', A.lateT > 0.5],
      [`${GP.fmt(A.earlyT)}t`, '전월 선생산'], [`${A.idle.length}일`, '유휴일'], [`${GP.fmt(maxLoad * 100, 1)}%`, '최대 월 부하', maxLoad > 0.999],
    ].map(([v, l, bad]) => `<div class="kpi ${bad ? 'bad' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    $('summary-lines').innerHTML = GP.summaryLines(R, A).map((t) => `<p>${esc(t)}</p>`).join('');
    const tabs = A.H.ym.map(([, m]) => `${m}월`).concat(['분기 요약']);
    $('gantt-tabs').innerHTML = tabs.map((t, i) => `<button type="button" data-tab="${i}" class="${i === gTab ? 'on' : ''}">${t}</button>`).join('');
    drawTab(gTab);
    $('events').innerHTML = '<tr><th>일자</th><th>라인</th><th>구분</th><th>전환</th><th>손실(분)</th><th>사유</th></tr>' + A.events.map((e) => `<tr><td>${GP.md(e.date)}(${GP.weekday(e.date)})</td><td>${e.line}</td><td>${e.kind}</td><td>${e.from === e.to ? e.to + ' 유지' : `${e.from}→${e.to}`}</td><td class="n">${GP.fmt(e.loss, 1)}</td><td class="l">${esc(GP.eventReason(R, A, e))}</td></tr>`).join('');
    const er = GP.earlyReasons(R, A);
    $('early').innerHTML = '<tr><th>라인</th><th>강종</th><th>부서</th><th>생산월</th><th>마감</th><th>물량(t)</th><th>사유</th></tr>' + er.map((x) => `<tr><td>${x.line}</td><td>${x.alloy}</td><td>${x.cls}</td><td>${x.prodMonth}월</td><td>${GP.md(x.due)}</td><td class="n">${GP.fmt(x.tons, 1)}</td><td class="l">${esc(x.why)}</td></tr>`).join('') + `<tr><td colspan="5"><b>합계</b></td><td class="n"><b>${GP.fmt(A.earlyT, 1)}</b></td><td></td></tr>`;
    renderReplanBox();
    show('sec-replan', true);
    const H = A.H, today = (() => { const d = new Date(Date.now() - 7 * 3600e3); return GP.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); })();
    const last = GP.addDays(H.D1, -1);
    $('rp-t0').min = H.D0; $('rp-t0').max = last;
    if (!$('rp-t0').value || $('rp-t0').value < H.D0 || $('rp-t0').value > last) $('rp-t0').value = today < H.D0 ? H.D0 : today > last ? last : today;
    $('sec-result').scrollIntoView({ behavior: 'smooth' });
  }
  function renderReplanBox() {
    const rp = result.replan, box = $('replan-box');
    if (!rp) { box.hidden = true; return; }
    const ev = (x) => { const [d, l, e] = x.split('|'); return `${GP.md(d)} ${l} ${e}`; };
    box.hidden = false;
    box.innerHTML = `<p><b>재계획 결과</b> — 실적 기준일 ${GP.md(rp.t0)}, 강종 동결 ~${rp.freezeUntil ? GP.md(rp.freezeUntil) : '없음'}${rp.optimal === true ? ' · 최적 증명 완료' : rp.optimal === false ? ' · ⚠ 최적 미증명(시간 제한)' : ''}</p>`
      + rp.notes.concat(GP.lockLines ? GP.lockLines(rp) : []).map((n) => `<p>· ${esc(n)}</p>`).join('')
      + `<p>· 전환 일정 변경: ${rp.removed.length || rp.added.length ? `없어짐 [${rp.removed.map(ev).join(', ') || '-'}] / 새로 생김 [${rp.added.map(ev).join(', ') || '-'}]` : '없음(기존 전환 일정 유지)'}</p>`
      + `<p>· 납기 지연 ${GP.fmt(GP.dueLate ? GP.dueLate(result) : rp.late)}톤·일${rp.shortBy.length ? `, 결품: ${rp.shortBy.map(esc).join(', ')}` : ', 결품 없음'}${rp.over.length ? `, 초과 생산: ${rp.over.map(esc).join(', ')}` : ''}</p>`;
  }
  function canvasFor(i) {
    const c = document.createElement('canvas');
    return i < A.H.ym.length ? GP.drawGanttMonth(c, result, A, i, 2) : GP.drawSummary(c, result, A, 2);
  }
  function drawTab(i) {
    gTab = i;
    document.querySelectorAll('#gantt-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.tab === i));
    $('gantt-img').src = canvasFor(i).toDataURL('image/png');
  }
  $('gantt-tabs').onclick = (ev) => { if (ev.target.dataset.tab != null) drawTab(+ev.target.dataset.tab); };
  $('gantt-img').onclick = () => { const w = window.open(); if (w) { w.document.title = '간트'; w.document.body.style.margin = '0'; const im = w.document.createElement('img'); im.src = $('gantt-img').src; w.document.body.appendChild(im); } };
  const baseName = () => `도금_${result.P.year}_${result.P.months[0]}-${result.P.months[2]}월_가동계획`;
  $('dl-xlsx').onclick = async () => {
    const btn = $('dl-xlsx'); btn.disabled = true; btn.textContent = '엑셀 만드는 중…';
    try {
      const { wb } = GP.buildWorkbook(ExcelJS, result, meta);
      const buf = await wb.xlsx.writeBuffer();
      download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), baseName() + '.xlsx');
    } catch (e) { alert('엑셀 생성 실패: ' + e.message); console.error(e); }
    btn.disabled = false; btn.textContent = '엑셀 받기';
  };
  $('dl-png').onclick = async () => {
    const names = A.H.ym.map(([, m]) => `CGL_${result.P.year}_${m}월_가동계획.png`).concat([`CGL_${result.P.year}_분기_요약표.png`]);
    for (let i = 0; i < names.length; i++) {
      const blob = await new Promise((res) => canvasFor(i).toBlob(res, 'image/png'));
      download(blob, names[i]);
      await new Promise((r) => setTimeout(r, 400));
    }
  };
  const packResult = () => JSON.stringify({ app: 'cgl-plan', version: 1, savedAt: result.savedAt || new Date().toISOString(), result, meta });
  $('dl-json').onclick = () => download(new Blob([packResult()], { type: 'application/json' }), baseName() + '_결과.json');
  $('to-dash').onclick = () => {
    try { sessionStorage.setItem('cgl-dash-handoff', packResult()); } catch (e) { alert('브라우저 저장공간이 부족합니다. 결과 저장(.json) 후 대시보드에서 여세요.'); return; }
    window.open('status.html', '_blank');
  };
  $('result-file').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (o.app !== 'cgl-plan') throw new Error('이 앱에서 저장한 결과 파일이 아닙니다');
      result = o.result; meta = o.meta || {}; renderResult();
    } catch (e) { alert('결과 파일을 열지 못했습니다: ' + e.message); }
  };

  // ---------------- 게시(암호화) ----------------
  async function makeEnvelope() {
    const pw = $('pub-pw').value, pw2 = $('pub-pw2').value;
    if (pw.length < 6) throw new Error('암호는 6자 이상으로 정하세요');
    if (pw !== pw2) throw new Error('암호 확인이 다릅니다');
    const label = $('pub-label').value.trim() || `${result.P.year} ${result.P.months[0]}~${result.P.months[2]}월 계획${result.replan ? ` (재계획 ${result.replan.t0})` : ''}`;
    return GP.encryptJSON(JSON.parse(packResult()), pw, label);
  }
  $('pub-file').onclick = async () => {
    try {
      const env = await makeEnvelope();
      download(new Blob([JSON.stringify(env)], { type: 'application/json' }), 'latest.plan.enc.json');
      $('pub-msg').textContent = '받은 파일을 GitHub 저장소 jmin6035.github.io의 published 폴더에 올리면(Add file → Upload files) 1~2분 뒤 모두에게 보입니다.';
    } catch (e) { $('pub-msg').textContent = '⚠ ' + e.message; }
  };
  const PUB_KEY = 'cgl-plan-publish-v1';
  try {
    const s0 = JSON.parse(localStorage.getItem(PUB_KEY) || 'null');
    if (s0) { $('pub-pw').value = $('pub-pw2').value = s0.pw || ''; $('pub-token').value = s0.token || ''; $('pub-save').checked = true; $('pub-auto').checked = !!s0.auto; }
  } catch (e) { /* 저장 불가 */ }
  function savePub() {
    try {
      if ($('pub-save').checked) localStorage.setItem(PUB_KEY, JSON.stringify({ pw: $('pub-pw').value, token: $('pub-token').value.trim(), auto: $('pub-auto').checked }));
      else localStorage.removeItem(PUB_KEY);
    } catch (e) { /* 저장 불가 */ }
  }
  ['pub-save', 'pub-auto'].forEach((id) => $(id).addEventListener('change', savePub));
  window._autoPublish = () => { if ($('pub-auto').checked && $('pub-token').value.trim()) $('pub-go').click(); };
  $('pub-go').onclick = async () => {
    savePub();
    const tok = $('pub-token').value.trim();
    if (!tok) { $('pub-msg').textContent = '⚠ 아래 "GitHub에 바로 게시"를 펼쳐 토큰을 넣거나, "게시용 파일 받기"를 쓰세요.'; document.querySelector('.publish details').open = true; return; }
    const btn = $('pub-go'); btn.disabled = true; $('pub-msg').textContent = '암호화·게시 중…';
    try {
      const env = await makeEnvelope();
      await GP.publishToGitHub(env, tok);
      $('pub-msg').innerHTML = `게시 완료(${esc(env.label)}). 1~2분 뒤 <a href="status.html" target="_blank">가동 현황</a>에서 암호로 열 수 있습니다.`;
    } catch (e) { $('pub-msg').textContent = '⚠ ' + e.message; }
    btn.disabled = false;
  };

  // ---------------- 실적 반영 재계획 ----------------
  let rpEvents = [{ type: 'down', line: '2CGL', from: '', to: '', minutes: '', tons: '' }], rpXlsx = null;
  function renderRpEvents() {
    $('rp-events').innerHTML = rpEvents.map((e, i) => `<div class="sd-row">
      <select data-rp="${i}" data-k="type"><option value="down" ${e.type === 'down' ? 'selected' : ''}>설비정지</option><option value="reject" ${e.type === 'reject' ? 'selected' : ''}>불량(재생산)</option></select>
      <select data-rp="${i}" data-k="line">${P.lines.map((l) => `<option ${e.line === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input type="date" data-rp="${i}" data-k="from" value="${e.from}" aria-label="시작일">
      ${e.type === 'down' ? `<input type="date" data-rp="${i}" data-k="to" value="${e.to}" aria-label="종료일"><input type="number" data-rp="${i}" data-k="minutes" value="${e.minutes}" placeholder="분/일(빈칸=종일)" min="0" max="1440">`
        : `<input type="number" data-rp="${i}" data-k="tons" value="${e.tons}" placeholder="불량 톤" min="0">`}
      <button type="button" class="ghost x" data-rpdel="${i}" aria-label="삭제">✕</button></div>`).join('') || '<p class="hint">사건 없음 — 계획대로 생산했다고 보고 재계산</p>';
  }
  $('rp-events').addEventListener('change', (ev) => {
    const t = ev.target, i = t.dataset.rp; if (i == null) return;
    rpEvents[+i][t.dataset.k] = t.value;
    if (t.dataset.k === 'type') renderRpEvents();
  });
  $('rp-events').addEventListener('click', (ev) => { const d = ev.target.dataset.rpdel; if (d != null) { rpEvents.splice(+d, 1); renderRpEvents(); } });
  $('rp-add').onclick = () => { rpEvents.push({ type: 'down', line: P.lines[0], from: '', to: '', minutes: '', tons: '' }); renderRpEvents(); };
  $('rp-template').onclick = async () => {
    const t0 = $('rp-t0').value; if (!result || !t0) return;
    const wb = GP.buildActualTemplate(ExcelJS, result, t0);
    download(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `실적입력_${t0}.xlsx`);
  };
  $('rp-file').onchange = async (ev) => {
    const f = ev.target.files[0]; rpXlsx = f ? await f.arrayBuffer() : null;
    $('rp-file-name').textContent = f ? `${f.name} (방법 1로 계산)` : '';
  };
  $('rp-run').onclick = async () => {
    const t0 = $('rp-t0').value; if (!result || !t0) return;
    const events = rpEvents.filter((e) => e.from).map((e) => e.type === 'down'
      ? { type: 'down', line: e.line, from: e.from, to: e.to || e.from, minutes: +e.minutes || 0 }
      : { type: 'reject', line: e.line, date: e.from, tons: +e.tons || 0 });
    show('sec-error', false); show('sec-progress', true);
    $('log').innerHTML = ''; $('solver').textContent = ''; setStage(0);
    $('rp-run').disabled = true; $('run').disabled = true;
    t0Run(); try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
    worker.postMessage({ type: 'replan', base: result, t0, freeze: Math.max(0, +$('rp-freeze').value || 0), lateW: 1 / Math.max(1, +$('rp-tradeoff').value || 100), stabW: 1 / Math.max(1, +$('rp-stab').value || 10), xlsx: rpXlsx, events });
  };
  renderRpEvents();

  // ---------------- 공통 ----------------
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function show(id, on) { $(id).hidden = !on; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  renderParams();
})();
