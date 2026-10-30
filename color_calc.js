/* 컬러 계획 계산 화면 — 기준 자료(암호화 게시본) + 올린 엑셀 → Web Worker(color_calc_worker.js, Pyodide)에서 서버와 같은 계산 → 현재 게시 계획과 비교 → 게시
   게시 = published/integrated.enc.json(화면 자료) + published/color_prev.enc.json(다음 계산이 지난 자리를 먼저 쓰도록) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', PUB_KEY = 'cgl-plan-publish-v1';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const sg = (v) => (Math.abs(v) < 0.5 ? '0' : (v > 0 ? '+' : '−') + n0(Math.abs(v)));
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'], MONTHS = ['2026-10', '2026-11', '2026-12'];
  const GL = (g) => (g === '주문재' ? '건재 주문재' : g);
  const fmtT = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '-');
  let pw = '', E = {}, D = {}, worker = null, result = null, uploads = {}, names = {}, reading = 0, moves = [];

  const envs = Promise.all(['color_calc_files.enc.json', 'color_calc_mes.enc.json', 'integrated.enc.json', 'color_prev.enc.json'].map((n) => GP.latest(n)))
    .then(([files, mes, cur, prev]) => { E = { files, mes, cur, prev }; return E; });

  function lockMsg(t, m) { $('c-lock-t').textContent = t; $('c-lock-msg').textContent = m || ''; }
  async function unlock(p) {
    await envs;
    if (!E.files || !E.mes) { lockMsg('계산 기준 자료가 아직 게시되지 않았습니다', '사내 PC 자동 실행 또는 관리자 게시 후 다시 여세요.'); return; }
    try {
      [D.files, D.mes, D.cur] = await Promise.all([GP.decryptJSON(E.files, p), GP.decryptJSON(E.mes, p), E.cur ? GP.decryptJSON(E.cur, p) : null]);
      D.prev = E.prev && String(E.prev.created) > String(E.files.created) ? await GP.decryptJSON(E.prev, p).catch(() => null) : null;
    } catch (e) { $('c-unlock').hidden = false; lockMsg('계산 화면 열기', p ? '⚠ 암호가 맞지 않습니다' : ''); return; }
    pw = p; try { localStorage.setItem(PW_KEY, p); } catch (x) { /* 무시 */ }
    $('c-lock').hidden = true; $('c-body').hidden = false;
    showSources();
    moves = ((D.cur && D.cur.moves && D.cur.moves.items) || []).map((m) => Object.assign({}, m));
    calRender();
    worker = new Worker('color_calc_worker.js');
    worker.onmessage = onMsg;
    worker.postMessage({ type: 'init' });                     // 엔진 미리 불러오기(화면을 보는 동안)
    if (window.UI) UI.reveal(document.querySelector('main'));
  }
  function showSources() {
    const dn = (() => { try { const f = D.files.files['data/color_downtime_2026Q4.json']; return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f), (c) => c.charCodeAt(0)))); } catch (e) { return null; } })();
    const lr = (() => { try { const f = D.files.files['data/line_rules.json']; return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f), (c) => c.charCodeAt(0)))); } catch (e) { return null; } })();
    const S = [
      ['판매계획 · 계획재 운영안', `기준 자료 게시 ${fmtT(E.files.created)}`, 'TF 일별가동계획(9월 작성) · 계획재 운영안(R15)', 'good'],
      ['품목별 적용라인', lr ? `${esc(lr.source || '')} · 받은 날 ${esc(lr.extracted || '')} · ${lr.rules.length}행` : '없음', '필수라인 → 우선라인1 → 2 → 3 순서로 라인 배정', lr ? 'good' : 'warn'],
      ['컬러 휴지계획', dn ? `${esc(dn.src || '')} · ${dn.items.length}건` : '없음', '계획휴지·S/D·수리 · 청소·Test·샘플', dn ? 'good' : 'warn'],
      ['MES 실적 · 재고', `자료 ${fmtT(D.mes.savedAt || E.mes.created)}`, '컬러 생산 실적 · 재고 · 출하 · 판매생산속보(사내 PC 매일 갱신)', 'good'],
      ['현재 게시 계획', D.cur ? `계산 ${fmtT(D.cur.built)} · 실적 ~${esc(D.cur.asOf || '')}` : '없음', D.prev ? '지난 컬러 계획 자리를 먼저 씀(일정이 덜 바뀌게)' : '도금 = 확정 계획(바뀌지 않음)', D.cur ? 'good' : 'warn'],
    ];
    $('c-src').innerHTML = S.map(([t, a, b, st]) => `<div class="cc-src"><b>${t}</b><small>${a}</small><small>${b}</small><span class="st ${st}">${st === 'good' ? '사용' : '확인'}</span></div>`).join('');
  }

  document.querySelectorAll('.up .dl-tpl').forEach((btn) => btn.addEventListener('click', (e) => {   // 지금 쓰는 기준 파일 받기(양식 겸 예시)
    e.preventDefault(); e.stopPropagation();
    const path = D && D.files && (D.files.upload || {})[btn.dataset.dl], b = path && D.files.files[path];
    if (!b) { alert('기준 자료가 아직 열리지 않았습니다.'); return; }
    const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = path.split('/').pop();
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }));
  document.querySelectorAll('.up input').forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files[0], lb = inp.closest('label');
    if (!f) { delete uploads[inp.dataset.k]; lb.classList.remove('on'); lb.querySelector('em').textContent = ''; return; }
    reading++; $('c-run').disabled = true; lb.querySelector('em').textContent = '읽는 중…';
    uploads[inp.dataset.k] = await f.arrayBuffer(); names[inp.dataset.k] = f.name;
    if (--reading === 0) $('c-run').disabled = false;
    lb.classList.add('on'); lb.querySelector('em').textContent = `✓ ${f.name} (${Math.round(f.size / 1024).toLocaleString()} KB)`;
  }));

  let t0 = 0, tick = null;
  $('c-run').onclick = () => {
    if (!worker) return;
    $('c-run').disabled = true; $('c-prog').hidden = false; $('c-log').textContent = ''; $('c-steps').innerHTML = ''; $('c-res').hidden = true; $('c-pub').hidden = true;
    t0 = Date.now(); clearInterval(tick); tick = setInterval(() => { $('c-msg').textContent = `계산 중… ${Math.round((Date.now() - t0) / 1000)}초`; }, 1000);
    const up = {}; const tr = [];
    for (const [k, b] of Object.entries(uploads)) { up[k] = b.slice(0); tr.push(up[k]); }
    const idle = ($('c-idle') && $('c-idle').value) || '';
    worker.postMessage({ type: 'run', files: D.files.files, mes: { ex: D.mes.ex, md: D.mes.md }, prev: D.prev, uploads: up, names, idle, moves }, tr);
  };
  function log(s, err) { const L = $('c-log'); L.textContent += (err ? '⚠ ' : '') + s + '\n'; L.scrollTop = L.scrollHeight; }
  function onMsg(ev) {
    const m = ev.data;
    if (m.type === 'step') { const w = /확인:/.test(m.msg); $('c-steps').insertAdjacentHTML('beforeend', `<div${w ? ' class="warn"' : ''}>${esc(m.msg.trim())}</div>`); log('· ' + m.msg); }
    else if (m.type === 'log') { if (m.msg.trim()) log(m.msg, m.err); }
    else if (m.type === 'error') { stop(); $('c-msg').textContent = '⚠ 계산 실패 — 아래 기록을 확인하세요(올린 파일 양식이 다를 수 있음)'; log(m.msg, true); $('c-steps').insertAdjacentHTML('beforeend', `<div class="err">${esc(m.msg.split('\n').slice(-1)[0])}</div>`); }
    else if (m.type === 'done') { stop(); const r = JSON.parse(m.json); result = r; window.CC_LAST = r; /* 검증 스크립트가 서버 결과와 비교할 때 씀 */ $('c-msg').textContent = `계산 완료(${m.sec}초)`; render(r); }
  }
  function stop() { clearInterval(tick); $('c-run').disabled = false; $('c-prog').hidden = true; }

  /* 비교: 같은 기준(화면 자료)으로 현재 게시본과 새 계산을 셈 */
  function stats(o) {
    const lm = {}, un = {}, cells = {};
    for (const c of o.color || []) { const t = Object.values(c.g || {}).reduce((a, b) => a + b, 0); const k = `${c.l}|${c.d.slice(0, 7)}`; lm[k] = (lm[k] || 0) + t; cells[`${c.d}|${c.l}`] = t; }
    for (const u of o.colorUnplaced || []) { const k = `${u.g}|${u.ym}`; un[k] = (un[k] || 0) + u.t; }
    const v = (o.variants || {}).V1 || {}, self = {};
    for (const p of ['AZ', 'MAC', 'AL']) self[p] = Math.min(...((v.self || {})[p] || [[0, 0, 0, 0]]).map((x) => x[3]));
    return { lm, un, cells, self, tot: Object.values(lm).reduce((a, b) => a + b, 0), unT: Object.values(un).reduce((a, b) => a + b, 0) };
  }
  function render(r) {
    const N = stats(r.o), C = D.cur ? stats(D.cur) : null;
    const changed = C ? Object.keys({ ...N.cells, ...C.cells }).filter((k) => Math.abs((N.cells[k] || 0) - (C.cells[k] || 0)) >= 0.5).length : null;
    const k = (tone, l, v, u, b) => `<div class="kpi tone-${tone}"><div class="l">${l}</div><div class="v">${v}<small>${u}</small></div><div class="b">${b}</div></div>`;
    $('c-kpi').innerHTML = k('brand', '4분기 컬러 생산', n0(N.tot), 't', C ? `현재 게시 대비 ${sg(N.tot - C.tot)}t` : '')
      + k(N.unT > 0.5 ? 'warn' : 'good', '미편성', n0(N.unT), 't', C ? `현재 게시 대비 ${sg(N.unT - C.unT)}t` : '')
      + k(N.self.AZ < 0 ? 'bad' : 'good', '자가재 AZ 최저 재고', n0(N.self.AZ), 't', N.self.AZ < 0 ? '컬러 소재 부족 — 도금 계획 확인 필요' : `MAC ${n0(N.self.MAC)}t · AL ${n0(N.self.AL)}t (부족 없음)`)
      + k(changed ? 'warn' : 'good', '바뀐 날짜·라인 칸', changed == null ? '-' : n0(changed), '칸', '현재 게시 계획과 생산량이 다른 칸');
    const cell = (a, b) => { const d = a - (b || 0); return `<td><b>${n0(a)}</b></td>${C ? `<td>${n0(b)}</td><td class="${Math.abs(d) < 0.5 ? 'muted' : d > 0 ? 'up1' : 'dn1'}">${sg(d)}</td>` : ''}`; };
    $('c-lines').innerHTML = `<thead><tr><th rowspan="2">라인</th>${MONTHS.map((m) => `<th colspan="${C ? 3 : 1}">${+m.slice(5)}월</th>`).join('')}</tr><tr>${MONTHS.map(() => (C ? '<th>새 계산</th><th>현재</th><th>차이</th>' : '<th>새 계산</th>')).join('')}</tr></thead><tbody>`
      + LINES.map((l) => `<tr><td><b>${l}</b></td>${MONTHS.map((m) => cell(N.lm[`${l}|${m}`] || 0, C && C.lm[`${l}|${m}`])).join('')}</tr>`).join('')
      + `<tr class="total"><td>합계</td>${MONTHS.map((m) => cell(LINES.reduce((a, l) => a + (N.lm[`${l}|${m}`] || 0), 0), C && LINES.reduce((a, l) => a + (C.lm[`${l}|${m}`] || 0), 0))).join('')}</tr></tbody>`;
    const G = [...new Set(Object.keys(N.un).concat(C ? Object.keys(C.un) : []).map((x) => x.split('|')[0]))];
    $('c-unpl').innerHTML = G.length ? `<thead><tr><th rowspan="2">그룹</th>${MONTHS.map((m) => `<th colspan="${C ? 3 : 1}">${+m.slice(5)}월</th>`).join('')}</tr><tr>${MONTHS.map(() => (C ? '<th>새 계산</th><th>현재</th><th>차이</th>' : '<th>새 계산</th>')).join('')}</tr></thead><tbody>`
      + G.map((g) => `<tr><td><b>${esc(GL(g))}</b></td>${MONTHS.map((m) => cell(N.un[`${g}|${m}`] || 0, C && C.un[`${g}|${m}`])).join('')}</tr>`).join('') + '</tbody>' : '<tbody><tr><td>미편성 없음</td></tr></tbody>';
    renderMoves(r.s && r.s.moves);
    calRender();
    $('c-res').hidden = false; $('c-pub').hidden = false;
    if (window.UI) { UI.reveal($('c-res')); }
    $('c-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 게시 */
  let ps = {}; try { ps = JSON.parse(localStorage.getItem(PUB_KEY) || '{}') || {}; } catch (e) { /* 무시 */ }
  $('p-token').value = ps.token || ''; $('p-save').checked = !!ps.token;
  const label = () => `컬러 계획 재계산 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
  async function envelopes() {
    const o = Object.assign({}, result.o, { calcBy: 'web', calcAt: new Date().toISOString() });
    return [await GP.encryptJSON(o, pw, '4분기 통합 일별계획'), await GP.encryptJSON(result.prev, pw, '지난 컬러 계획(자리 우선)')];
  }
  $('p-file').onclick = async () => {
    if (!result) return;
    const [a, b] = await envelopes();
    for (const [env, name] of [[a, 'integrated.enc.json'], [b, 'color_prev.enc.json']]) {
      const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([JSON.stringify(env)], { type: 'application/json' })); el.download = name; el.click();
    }
    $('p-msg').textContent = '받은 두 파일을 GitHub 저장소 jmin6035.github.io 의 published 폴더에 올리면(Add file → Upload files) 1~2분 뒤 반영됩니다.';
  };
  $('p-go').onclick = async () => {
    if (!result) return;
    const tok = $('p-token').value.trim();
    try { if ($('p-save').checked) localStorage.setItem(PUB_KEY, JSON.stringify(Object.assign(ps, { token: tok }))); } catch (e) { /* 무시 */ }
    if (!tok) { $('p-msg').textContent = '⚠ "게시 설정"에 토큰을 넣거나 "게시용 파일 받기"를 쓰세요.'; document.querySelector('#c-pub details').open = true; return; }
    if (!confirm('이 결과로 컬러 계획을 게시합니다. 컬러 가동 현황 · 가동 캘린더 · 재고 추이가 바뀝니다. 진행할까요?')) return;
    $('p-go').disabled = true; $('p-msg').textContent = '암호화·게시 중…';
    try {
      const [a, b] = await envelopes();
      await GP.publishToGitHub(a, tok, 'published/integrated.enc.json');
      await GP.publishToGitHub(b, tok, 'published/color_prev.enc.json');
      $('p-msg').innerHTML = `게시 완료(${esc(label())}). 1~2분 뒤 <a href="color_status.html">컬러 가동 현황</a>에 반영됩니다.`;
    } catch (e) { $('p-msg').textContent = '⚠ ' + e.message; }
    $('p-go').disabled = false;
  };


  /* 캘린더 끌어 옮기기 — 사양 칸(그 날 같은 그룹·품명·고객·목적지·선적 묶음)을 다른 날에 놓으면 그 사양·톤을 옮김.
     계산은 서버와 같은 Python(tools/color_pack.apply_moves): 옮긴 몫 고정 → 그 뒤는 연속 공정대로 다시 채움 → 영향(밀린 사양·납기·소재·도금) */
  const GC = { 수출벌크: 'var(--s2)', 건재수출: 'var(--s2)', 가전수출: 'var(--s5)', 가전내수: 'var(--s4)', 수요개발: 'var(--s3)', 주문재: 'var(--s6)', 계획재: 'var(--s1)' };
  const WD = ['월', '화', '수', '목', '금', '토', '일'];
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const cv = { line: '1CCL', mon: null };
  const plan = () => (result && result.o) || D.cur;
  const lastAct = () => { const o = plan(); return (o && o.asOf) || ''; };
  function chipsOf(c) {                                       // 같은 사양 묶음(그 날)
    const m = new Map();
    for (const r of c.rows || []) {
      if (r[4] === '실적') continue;
      const k = [r[0], r[1], r[2] || '', r[13] || '', r[3] || '', r[4] || ''].join('|');
      const x = m.get(k) || { g: r[0], p: r[1], c: r[13] || '', dest: r[3] || '', ship: r[4] || '', spec: r[2] || '', t: 0, min: 0, moved: false, hit: false };
      x.t += r[5]; x.min += r[6]; x.moved = x.moved || /수동 이동\(/.test(r[8] || ''); x.hit = x.hit || /수동 이동 영향/.test(r[8] || '');
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.min - a.min);
  }
  function calRender() {
    const o = plan(); if (!o || !o.color) { $('dv-grid').innerHTML = '<p class="hint">게시된 계획이 없습니다.</p>'; return; }
    const months = [...new Set(o.color.map((c) => c.d.slice(0, 7)))].sort();
    const act = lastAct();
    if (!cv.mon) cv.mon = months.find((m) => m >= act.slice(0, 7)) || months[0];
    $('dv-line').innerHTML = LINES.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === cv.line}">${l}</button>`).join('');
    $('dv-mon').innerHTML = months.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === cv.mon}">${+m.slice(5)}월</button>`).join('');
    $('dv-line').querySelectorAll('button').forEach((b) => b.onclick = () => { cv.line = b.dataset.l; calRender(); });
    $('dv-mon').querySelectorAll('button').forEach((b) => b.onclick = () => { cv.mon = b.dataset.m; calRender(); });
    $('dv-src').textContent = result ? '새 계산 결과(아직 게시 전)' : `현재 게시 계획 · 실적 ~${md(act || '2026-10-01')}`;
    const by = {}; for (const c of o.color) if (c.l === cv.line && c.d.slice(0, 7) === cv.mon) by[c.d] = c;
    const [y, m] = cv.mon.split('-').map(Number), nd = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const pend = moves.filter((v) => v.line === cv.line);
    let h = WD.map((w, i) => `<div class="dv-wh ${i >= 5 ? 'we' : ''}">${w}</div>`).join('');
    const ds0 = (d) => `${cv.mon}-${String(d).padStart(2, '0')}`;
    let d1 = 1;                                                   // 실적만 있는 지난 주는 숨김(옮길 수 없음)
    while (d1 + (7 - (lead + d1 - 1) % 7) - 1 < nd && ds0(d1 + (7 - (lead + d1 - 1) % 7) - 1) <= act) d1 += 7 - (lead + d1 - 1) % 7;
    if (d1 > 1) h += `<p class="hint" style="grid-column:1/-1;margin:0">${+cv.mon.slice(5)}/1~${+cv.mon.slice(5)}/${d1 - 1} 실적 주는 숨김</p>`;
    for (let i = 0; i < (lead + d1 - 1) % 7; i++) h += '<div class="dv-day empty"></div>';
    for (let d = d1; d <= nd; d++) {
      const ds = ds0(d), c = by[ds] || { rows: [], min: 0 }, past = ds <= act, wd = (lead + d - 1) % 7;
      const chips = chipsOf(c).map((x, j) => {
        const pv = pend.some((v) => (v.from === ds || v.to === ds) && v.p === x.p && (v.dest || '') === x.dest && (v.c || '') === x.c && (v.s == null || v.s === x.spec));
        return `<button type="button" class="dv-c ${past ? 'fixed' : ''} ${x.moved ? 'moved' : ''} ${x.hit ? 'hit' : ''} ${pv ? 'pend' : ''}" style="--gc:${GC[x.g] || 'var(--s1)'}" data-d="${ds}" data-j="${j}" title="${esc(`${GL(x.g)} ${x.p} ${x.c} ${x.dest} ${x.ship} — ${Math.round(x.t)}t · ${(x.min / 60).toFixed(1)}시간${x.moved ? ' · 옮긴 몫' : ''}${x.hit ? ' · 옮기기 영향으로 날짜 바뀜' : ''}`)}"><b>${esc(x.p)}</b> ${n0(x.t)}t<small>${esc([GL(x.g), x.dest || x.c].filter(Boolean).join(' · '))}</small></button>`;
      }).join('');
      const hh = Math.min(24, (c.min || 0) / 60);
      const ad = pend.filter((v) => v.to === ds).reduce((a, v) => a + (+v.t || 0), 0), rm = pend.filter((v) => v.from === ds).reduce((a, v) => a + (+v.t || 0), 0);
      h += `<div class="dv-day ${past ? 'act' : ''}" data-d="${ds}"><div class="dv-dh"><b class="${wd >= 5 ? 'we' : ''}">${d}</b><span>${past ? '실적' : hh.toFixed(1) + 'h'}${ad ? ` · +${n0(ad)}t` : ''}${rm ? ` · −${n0(rm)}t` : ''}</span></div><div class="dv-hb"><i style="width:${(hh / 24 * 100).toFixed(0)}%"></i></div>${chips}</div>`;
    }
    $('dv-grid').innerHTML = h;
    $('dv-grid').querySelectorAll('.dv-c:not(.fixed)').forEach((el) => el.addEventListener('pointerdown', dragStart));
    movesRender();
  }
  function movesRender() {
    $('dv-moves').innerHTML = moves.length
      ? `<b>${result && JSON.stringify(((result.o.moves || {}).items) || []) === JSON.stringify(moves) ? `계산에 반영한 옮기기 ${moves.length}건 — 아래 결과 확인 후 게시하면 확정` : `옮길 일정 ${moves.length}건`}</b>` + moves.map((v, i) => `<span class="mv">${esc(v.line)} ${esc(v.p)}${v.dest ? ' · ' + esc(v.dest) : ''} <b>${n0(v.t)}t</b> ${md(v.from)} → ${md(v.to)}<button type="button" data-i="${i}" aria-label="취소">✕</button></span>`).join('')
        + '<button type="button" class="btn primary" id="dv-go">옮기기 반영해서 계산</button><button type="button" class="btn" id="dv-clear">모두 취소</button>'
      : '<span class="hint">옮긴 일정 없음 — 사양 칸을 끌어 다른 날에 놓으세요(휴대폰은 칸을 누른 채 끌기).</span>';
    $('dv-moves').querySelectorAll('.mv button').forEach((b) => b.onclick = () => { moves.splice(+b.dataset.i, 1); calRender(); });
    if ($('dv-go')) $('dv-go').onclick = () => { $('c-run').click(); $('c-prog').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if ($('dv-clear')) $('dv-clear').onclick = () => { if (confirm('옮긴 일정을 모두 취소할까요? (계산 시작을 눌러야 계획에 반영)')) { moves = []; calRender(); } };
  }
  let drag = null;
  function dragStart(e) {
    if (e.button !== 0) return;
    const el = e.currentTarget, c = plan().color.find((z) => z.l === cv.line && z.d === el.dataset.d), x = chipsOf(c)[+el.dataset.j];
    drag = { el, x, from: el.dataset.d, sx: e.clientX, sy: e.clientY, on: false, ghost: null, over: null };
    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointermove', dragMove); el.addEventListener('pointerup', dragEnd); el.addEventListener('pointercancel', dragEnd);
  }
  function dragMove(e) {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    if (!drag.on) { drag.on = true; drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('dv-ghost'); document.body.appendChild(drag.ghost); }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    const t = document.elementFromPoint(e.clientX, e.clientY), day = t && t.closest('.dv-day[data-d]');
    if (drag.over && drag.over !== day) drag.over.classList.remove('over', 'nodrop');
    drag.over = day || null;
    if (day) day.classList.add(day.dataset.d > lastAct() && day.dataset.d !== drag.from ? 'over' : 'nodrop');
  }
  function dragEnd() {
    const g = drag; drag = null;
    if (!g) return;
    g.el.removeEventListener('pointermove', dragMove); g.el.removeEventListener('pointerup', dragEnd); g.el.removeEventListener('pointercancel', dragEnd);
    if (g.ghost) g.ghost.remove();
    if (g.over) g.over.classList.remove('over', 'nodrop');
    if (!g.on || !g.over) return;
    const to = g.over.dataset.d;
    if (to <= lastAct() || to === g.from) return;
    ask(g.x, g.from, to);
  }
  function ask(x, from, to) {
    const dlg = $('dv-dlg'), n = $('dv-dlg-n'), max = Math.round(x.t * 10) / 10;
    $('dv-dlg-t').textContent = `${cv.line} ${x.p}  ${md(from)} → ${md(to)}`;
    $('dv-dlg-s').textContent = `${GL(x.g)} · ${[x.c, x.dest, x.ship].filter(Boolean).join(' · ')} — 그 날 ${n0(x.t)}t (${(x.min / 60).toFixed(1)}시간, ${(x.t / x.min * 60).toFixed(1)}t/h)`;
    $('dv-dlg-max').textContent = `최대 ${max}t`;
    n.max = max; n.value = max;
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      const t = Math.min(max, +n.value || 0); if (t <= 0) return;
      moves.push({ line: cv.line, from, to, g: x.g, p: x.p, s: x.spec, c: x.c, dest: x.dest, ship: x.ship, t });
      calRender();
    };
    dlg.returnValue = ''; dlg.showModal(); n.select();
  }
  function renderMoves(mv) {
    const box = $('c-mv'); if (!box) return;
    if (!mv || (!mv.applied && !mv.skipped)) { box.innerHTML = ''; return; }
    const im = mv.impact || {}, li = (a, f) => (a && a.length ? `<ul>${a.map(f).join('')}</ul>` : '<p class="hint">없음</p>');
    box.innerHTML = `<div class="mv-imp"><h3>옮긴 일정과 영향</h3>`
      + li(mv.applied, (v) => `<li>✓ ${esc(v.line)} ${esc(v.p)}${v.dest ? ' · ' + esc(v.dest) : ''} <b>${n0(v.t)}t</b> ${md(v.from)} → ${md(v.to)}${v.fromActual ? ` <small class="hint">(다시 계산한 계획에선 그 사양이 ${md(v.fromActual)}에 있어 거기서 옮김)</small>` : ''}</li>`)
      + (mv.skipped && mv.skipped.length ? `<ul>${mv.skipped.map((v) => `<li class="warn">⚠ 못 옮김: ${esc(v.move.line)} ${esc(v.move.p)} ${md(v.move.from)} → ${md(v.move.to)} — ${esc(v.why)}</li>`).join('')}</ul>` : '')
      + `<h3>같이 날짜가 바뀐 사양 <small>${n0(im.shiftT || 0)}t${im.shiftLast ? ` · ${md(im.shiftLast)}까지 영향` : ''}</small></h3>`
      + li(im.shifts, (v) => `<li>${esc(v.line)} ${esc(v.p)}${v.dest ? ' · ' + esc(v.dest) : ''} ${n0(v.t)}t ${md(v.from)} → ${md(v.to)} ${v.to > v.from ? '(밀림)' : '(당겨짐)'}</li>`)
      + `<h3>납기(선적 완료기한)</h3>` + (im.newLate && im.newLate.length ? li(im.newLate, (v) => `<li class="warn">⚠ ${esc(v.line)} ${esc(v.p)} ${esc(v.dest)} ${n0(v.t)}t — 기한 ${md(v.due)} 넘김</li>`) : '<p class="hint">새로 넘기는 것 없음</p>')
      + (im.fixedLate && im.fixedLate.length ? li(im.fixedLate, (v) => `<li>✓ ${esc(v.p)} ${esc(v.dest)} ${n0(v.t)}t 기한 안으로 들어옴</li>`) : '')
      + `<h3>구매 소재</h3>` + (im.mat && im.mat.length ? li(im.mat, (v) => `<li class="${v.after > v.before ? 'warn' : ''}">${esc(v.code)} 부족 ${n0(v.before)}t → ${n0(v.after)}t${v.first ? ` (첫 부족 ${md(v.first)})` : ''}</li>`) : '<p class="hint">부족 변화 없음(입고 예정 기준, 6주 뒤는 신규 발주로 맞춤)</p>')
      + `<h3>도금(자가재)</h3>` + (im.plating && im.plating.length ? `<p class="warn">⚠ 자가재 반순 마감이 바뀜 → 도금 확정 계획 재계산 필요(관리자, 약 30분)</p>` + li(im.plating, (v) => `<li>${esc(v.sec)} ${esc(v.alloy)} 마감 ${md(v.due)}: ${n0(v.before)}t → ${n0(v.after)}t</li>`) : '<p class="hint">영향 없음 — 자가재 필요일이 같은 반순(10·20·말일) 안</p>')
      + (im.spill && im.spill.length ? `<h3>계획 기간 밖으로 밀림</h3>` + li(im.spill, (v) => `<li class="warn">${esc(v.line)} ${esc(v.p)} ${n0(v.t)}t → 미편성</li>`) : '')
      + '</div>';
  }

  $('c-unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('c-pw').value); });
  envs.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else { $('c-unlock').hidden = false; lockMsg('계산 화면 열기'); } });
})();
