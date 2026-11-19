/* 판생 작업판 입력 표(엑셀처럼): 칸 = 입력(연노랑) · 계산(흰색) · 자동(연회색)
   클릭·화살표로 고르고 숫자를 치면 입력 → Enter 저장(+300 / −0.5 = 더하기), Esc 취소, Delete = 기준판 값으로,
   Ctrl+V = 엑셀에서 복사한 여러 칸 붙여넣기, Ctrl+Z = 내가 고친 것 되돌리기, 오른쪽 클릭 = 그 칸 이력 */
(function () {
  'use strict';
  const G = (window.PSG = {});
  let SEL = null;   // {tbl, r, c}
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, f) => (v == null || v === '' ? '' : typeof v === 'number' ? (f === 'd1' ? v.toFixed(1) : f === 'h' ? String(Math.round(v * 10) / 10) : f === 'sg' ? PS.sg(v) : PS.n0(v)) : esc(v));

  /* spec = {id, cls, head: [[{v, cs, rs, cls}]], rows: [{cls, cells: [{v, t: 'in'|'calc'|'auto'|'lab', k, f, cls, title, cs, rs}]}]} */
  G.table = (spec) => {
    const h = (spec.head || []).map((tr) => `<tr>${tr.map((c) => `<th${c.cs ? ` colspan="${c.cs}"` : ''}${c.rs ? ` rowspan="${c.rs}"` : ''} class="${c.cls || ''}">${c.v == null ? '' : c.raw ? c.v : esc(c.v)}</th>`).join('')}</tr>`).join('');
    const b = spec.rows.map((tr, ri) => `<tr class="${tr.cls || ''}">${tr.cells.map((c, ci) => {
      const t = c.t || 'calc', set = c.k && PS.isSet(c.k);
      return `<td data-r="${ri}" data-c="${ci}" class="t-${t}${set ? ' set' : ''} ${c.cls || ''}"${c.k ? ` data-k="${esc(c.k)}"` : ''}${c.fx ? ` data-fx="${esc(c.fx)}"` : ''}${c.cs ? ` colspan="${c.cs}"` : ''}${c.rs ? ` rowspan="${c.rs}"` : ''}${c.title || set ? ` title="${esc(c.title || '')}${set ? (c.title ? ' · ' : '') + '고친 칸(오른쪽 클릭 = 이력)' : ''}"` : ''}>${c.raw ? c.v : fmt(c.v, c.f)}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="psg-w"><table class="psg ${spec.cls || ''}" id="${spec.id}"><thead>${h}</thead><tbody>${b}</tbody></table></div>`;
  };

  function cellAt(tbl, r, c) { return tbl.querySelector(`td[data-r="${r}"][data-c="${c}"]`); }
  function select(td) {
    document.querySelectorAll('.psg td.sel').forEach((x) => x.classList.remove('sel'));
    if (!td) { SEL = null; return; }
    td.classList.add('sel'); SEL = { tbl: td.closest('table').id, r: +td.dataset.r, c: +td.dataset.c };
    G.fx(td);
  }
  /* 수식 줄(엑셀처럼): 고른 칸의 이름(줄 · 열) · 값 · 계산식 */
  function headAt(tbl, td) {   // 그 칸 열의 머리 글자(합친 칸 고려)
    const H = [...tbl.tHead.rows], grid = [];
    H.forEach((tr, ri) => { let c = 0; for (const th of tr.cells) { while (grid[ri] && grid[ri][c]) c++; const cs = th.colSpan || 1, rs = th.rowSpan || 1; for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { (grid[ri + i] = grid[ri + i] || [])[c + j] = th.textContent.trim(); } c += cs; } });
    let ci = 0; for (const x of td.parentElement.cells) { if (x === td) break; ci += x.colSpan || 1; }
    return [...new Set(grid.map((r) => r && r[ci]).filter(Boolean))].join(' ');
  }
  G.fx = (td) => {
    const box = document.getElementById('fx'); if (!box || !td) return;
    const tbl = td.closest('table'), row = [...td.parentElement.cells].filter((x) => x.classList.contains('t-lab')).map((x) => x.textContent.trim()).filter(Boolean).join(' ');
    const name = [row, headAt(tbl, td)].filter(Boolean).join(' · ');
    const f = td.dataset.fx || (td.classList.contains('t-in') ? '입력 칸: 고치면 관련 숫자가 바로 다시 계산됨' : '');
    box.innerHTML = `<span class="fx-n">${esc(name || '칸')}</span><span class="fx-v">${esc(td.textContent.trim())}</span><span class="fx-f">${f ? 'ƒ ' + esc(f) : ''}</span>`;
  };
  function move(dr, dc) {
    if (!SEL) return; const tbl = document.getElementById(SEL.tbl); if (!tbl) return;
    let r = SEL.r + dr, c = SEL.c + dc;
    for (let i = 0; i < 60; i++) { const td = cellAt(tbl, r, c); if (td) { select(td); td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; } r += dr; c += dc; if (r < 0 || c < 0) return; }
  }
  function parse(txt, cur) {
    const s = String(txt).trim().replace(/,/g, '').replace(/[−–]/g, '-');
    if (s === '') return null;
    if (/^[+-]\d/.test(s) && cur != null) return Math.round((cur + Number(s)) * 1000) / 1000;
    const n = Number(s); return Number.isFinite(n) ? n : undefined;
  }
  function needName() {
    if (CT.me()) return false;
    const n = prompt('입력하는 사람 이름(기록에 남음)'); if (!n) return true;
    try { localStorage.setItem('cgl-me', n.trim()); } catch (e) { /* 무시 */ } return false;
  }
  function edit(td, first) {
    if (!td || !td.classList.contains('t-in') || needName()) return;
    const k = td.dataset.k, cur = G.valueOf ? G.valueOf(k) : null;
    const inp = document.createElement('input'); inp.className = 'psg-in'; inp.value = first != null ? first : (cur == null ? '' : cur);
    td.innerHTML = ''; td.appendChild(inp); inp.focus(); if (first == null) inp.select();
    let done = false;
    const end = (save, dr = 0) => {
      if (done) return; done = true;
      if (save) { const v = parse(inp.value, cur); if (v === undefined) { alert('숫자를 넣어 주세요'); done = false; inp.focus(); return; } if (v !== cur) (G.onSet || PS.set)(k, v); }
      if (!save || G.lastNoChange) PS.on && document.dispatchEvent(new Event('ps-redraw'));
      setTimeout(() => { const t = document.getElementById(SEL && SEL.tbl); if (t) { select(cellAt(t, SEL.r, SEL.c)); if (dr) move(dr, 0); } }, 30);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); end(true, 1); } else if (e.key === 'Escape') { e.preventDefault(); end(false); } else if (e.key === 'Tab') { e.preventDefault(); end(true); move(0, e.shiftKey ? -1 : 1); } e.stopPropagation(); });
    inp.addEventListener('blur', () => end(true));
  }
  function historyPop(td, x, y) {
    const k = td.dataset.k; if (!k) return;
    const H = PS.history(k).reverse();
    let pop = document.getElementById('psg-pop'); if (!pop) { pop = document.createElement('div'); pop.id = 'psg-pop'; document.body.appendChild(pop); }
    pop.innerHTML = `<b>이 칸 이력</b>${H.length ? `<ul>${H.map((h) => `<li><span>${esc(String(h.at).slice(5, 16).replace('T', ' '))} ${esc(h.by)}</span> ${h.p == null ? '기준판' : PS.n0(h.p)}에서 <b>${h.v == null ? '기준판' : PS.n0(h.v)}</b>로${h.why ? ` · ${esc(h.why)}` : ''}</li>`).join('')}</ul>` : '<p>고친 적 없음(기준판 값)</p>'}<button type="button">닫기</button>`;
    pop.style.left = Math.min(x, innerWidth - 380) + 'px'; pop.style.top = (y + scrollY + 8) + 'px'; pop.hidden = false;
    pop.querySelector('button').onclick = () => { pop.hidden = true; };
  }
  G.bind = (root) => {
    root.querySelectorAll('.psg td').forEach((td) => {
      td.addEventListener('mousedown', () => select(td));
      td.addEventListener('dblclick', () => edit(td));
      td.addEventListener('contextmenu', (e) => { if (td.dataset.k) { e.preventDefault(); historyPop(td, e.clientX, e.clientY); } });
    });
    if (SEL) { const t = document.getElementById(SEL.tbl); if (t) { const td = cellAt(t, SEL.r, SEL.c); if (td) td.classList.add('sel'); } }
  };
  document.addEventListener('keydown', (e) => {
    if (!SEL || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const tbl = document.getElementById(SEL.tbl); if (!tbl) return; const td = cellAt(tbl, SEL.r, SEL.c);
    const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); move(...mv); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); PS.undo(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); edit(td); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && td && td.classList.contains('t-in')) { e.preventDefault(); if (!needName()) (G.onSet || PS.set)(td.dataset.k, null, '기준판으로'); return; }
    if (e.key.length === 1 && /[0-9+\-−.]/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); edit(td, e.key); }
  });
  document.addEventListener('paste', (e) => {   // 엑셀에서 여러 칸 복사 → 고른 칸부터 붙여넣기(입력 칸만)
    if (!SEL || e.target.tagName === 'INPUT') return;
    const txt = (e.clipboardData || window.clipboardData).getData('text'); if (!txt) return;
    e.preventDefault(); if (needName()) return;
    const tbl = document.getElementById(SEL.tbl), rows = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const pairs = []; let skip = 0;
    rows.forEach((cols, i) => cols.forEach((v, j) => {
      const td = cellAt(tbl, SEL.r + i, SEL.c + j);
      if (!td || !td.classList.contains('t-in')) { skip++; return; }
      const n = parse(v, null); if (n === undefined) { skip++; return; }
      pairs.push([td.dataset.k, n]);
    }));
    if (pairs.length) (G.onSetMany || PS.setMany)(pairs, `붙여넣기 ${pairs.length}칸`);
    if (skip) G.toast && G.toast(`${pairs.length}칸 넣음 · ${skip}칸은 입력 칸이 아니거나 숫자가 아니라 건너뜀`);
  });

  /* 위 상태 줄: 기준판 · 입력 기록 · 저장 · 이름 · 되돌리기 · 회차 */
  G.bar = () => {
    const B = PS.base(), n = PS.logs().length, p = PS.pending();
    return `<div class="ps-bar"><span>기준판 <b>${esc(B.rev)}</b></span><span>입력 기록 <b>${n}</b>건</span>
      <span class="${p ? 'warn' : 'ok'}">${PS.saving() ? '저장 중…' : p ? `저장 대기 ${p}건` : '모두 저장됨'}</span>${PS.err ? `<span class="bad">${esc(PS.err)}</span>` : ''}
      <span>입력자 <button type="button" class="lnk" id="ps-me">${esc(CT.me() || '이름 넣기')}</button></span>
      <button type="button" class="btn sub sm" id="ps-undo">되돌리기(Ctrl+Z)</button>
      <button type="button" class="btn sub sm" id="ps-xo">엑셀로 내보내기</button><label class="btn sub sm" id="ps-xi-l">엑셀 가져오기<input type="file" id="ps-xi" accept=".xlsx" hidden></label>
      <span class="hint">칸을 고르고 숫자 입력 · +300 은 더하기 · 엑셀에서 복사해 붙여넣기 · 오른쪽 클릭 = 이력</span></div>`;
  };
  G.bindBar = () => {
    const me = document.getElementById('ps-me'); if (me) me.onclick = () => { const n = prompt('입력하는 사람 이름', CT.me() || ''); if (n != null) { try { localStorage.setItem('cgl-me', n.trim()); } catch (e) { /* 무시 */ } document.dispatchEvent(new Event('ps-redraw')); } };
    const xo = document.getElementById('ps-xo'); if (xo) xo.onclick = () => { try { PSIO.export(); } catch (e) { G.toast('내보내기 실패: ' + e.message); } };
    const xi = document.getElementById('ps-xi'); if (xi) xi.onchange = () => { const f = xi.files[0]; xi.value = ''; if (f) PSIO.import(f); };
    const u = document.getElementById('ps-undo'); if (u) u.onclick = () => { if (!PS.undo()) G.toast && G.toast('되돌릴 내 입력이 없음'); };
  };
  G.toast = (msg) => { let t = document.getElementById('ps-toast'); if (!t) { t = document.createElement('div'); t.id = 'ps-toast'; document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(G._tt); G._tt = setTimeout(() => { t.hidden = true; }, 3500); };
})();
