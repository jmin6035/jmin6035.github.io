/* 업무분장 협의(11/23 사용자 '가동포털에서 바로 적게, 세부 업무 하나하나에 담당'): 내용 = published/rr.enc.json(암호화),
   고른 담당·비고 = 공유 저장소 cgl_rr(암호화, 추가만). 저장할 때 최신본을 읽어 칸마다 더 늦게 고친 값을 남김(여러 PC 동시 사용) */
(function () {
  'use strict';
  const API = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_rr', KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  const PW_KEY = 'cgl-analysis-pw', $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COL = { 판생: '#2A6FB0', 수주: '#E8601C', 공정출하: '#1F9A7A', 소재구매: '#8A97A5', 마케팅: '#8A97A5' }, GC = ['#2A6FB0', '#1F9A7A'];
  const tm = (s) => { const d = new Date(s); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  let C = null, PW = '', F = {}, pend = {}, tmr = 0, busy = false, lastAt = '';

  const me = () => ($('rr-who') ? $('rr-who').value.trim() : '');
  const val = (k, d) => (F[k] ? F[k].v : d);
  function set(k, v) {
    if (!me()) { st('이름을 먼저 적어 주세요', true); $('rr-who').focus(); return false; }
    F[k] = pend[k] = { v, by: me(), at: new Date().toISOString() }; clearTimeout(tmr); tmr = setTimeout(save, 1200); st('저장 대기…'); return true;
  }
  function st(t, err) { const e = $('rr-st'); if (e) { e.textContent = t; e.classList.toggle('err', !!err); } }

  async function pull() {
    const r = await fetch(API + '?select=id,payload&order=id.desc&limit=1', { headers: H }); if (!r.ok) throw new Error('저장소 읽기 실패 ' + r.status);
    const a = await r.json(); if (!a.length) return {};
    const d = await GP.decryptJSON(JSON.parse(a[0].payload), PW); return (d && d.f) || {};
  }
  const merge = (A, B) => { const o = { ...A }; for (const k in B) if (!o[k] || String(B[k].at) > String(o[k].at)) o[k] = B[k]; return o; };
  async function save() {
    if (busy) { clearTimeout(tmr); tmr = setTimeout(save, 800); return; }
    if (!Object.keys(pend).length) return; busy = true; const mine = pend; pend = {};
    try {
      const cur = await pull(), all = merge(cur, mine);
      const env = await GP.encryptJSON({ t: 'rr', at: new Date().toISOString(), by: me(), f: all }, PW, 'rr');
      const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error('저장 실패 ' + r.status);
      F = merge(all, pend); lastAt = new Date().toISOString(); st(`저장됨 ${tm(lastAt)}`); try { localStorage.setItem('cgl-me', me()); } catch (e) { /* 무시 */ }
      if (Object.keys(cur).some((k) => !mine[k] && JSON.stringify(cur[k]) !== JSON.stringify(F0[k]))) draw();   // 다른 PC 가 고친 칸이 있으면 다시 그림
    } catch (e) { pend = merge(mine, pend); st(String(e.message || e) + ', 다시 시도 중', true); clearTimeout(tmr); tmr = setTimeout(save, 5000); }
    busy = false; F0 = { ...F };
  }
  let F0 = {};

  function rows() {   // 세부 업무 줄 전부(원래 + 더한 줄), 번호 = 업무.줄
    const out = []; let n = 0;
    C.groups.forEach((g, gi) => g.jobs.forEach((j) => { n++; const add = val(`add:${n}`, []), all = j.subs.map((s, k) => ({ id: `${n}-${k + 1}`, name: s })).concat(add.map((a) => ({ id: a.id, name: a.name, added: true })));
      all.forEach((s, k) => out.push({ gi, g, j, n, no: `${n}.${k + 1}`, ...s })); }));
    return out;
  }
  const nowDef = (j) => [...new Set(j.now.flatMap((w) => w[0].split(/[,\s]+/)))].filter((d) => C.depts.includes(d));
  const byOf = (id) => { const L = ['nw', 'nx', 'm', 'nm'].map((p) => F[`${p}:${id}`]).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at))); return L[0] ? `${esc(L[0].by)} ${tm(L[0].at)}` : ''; };

  function draw() {
    const R = rows(), tot = R.length, done = R.filter((r) => (val(`nx:${r.id}`, []) || []).length).length;
    let n = 0, h = `<div class="rr-top"><div class="rr-cnt">향후 담당이 정해진 세부 업무 <b>${done}</b> / ${tot}</div>
      <div class="rr-bar"><input id="rr-who" placeholder="이름(고친 사람)" maxlength="30" aria-label="이름"><span class="rr-st" id="rr-st" aria-live="polite">${lastAt ? `저장됨 ${tm(lastAt)}` : ''}</span>
      <button type="button" class="btn" id="rr-csv">엑셀</button><button type="button" class="btn" id="rr-prt">인쇄</button></div></div>`;
    C.groups.forEach((g, gi) => {
      h += `<section class="card rr-g"><h2><i class="rr-dot" style="background:${GC[gi] || '#8A97A5'}"></i>${esc(g.name)}</h2>`;
      g.jobs.forEach((j) => { n++; const mine = R.filter((r) => r.n === n), opts = j.opts;
        h += `<div class="rr-job"><div class="rr-jh"><span class="rr-no">${n}</span><div><div class="rr-nm">${esc(j.name)}</div><div class="rr-ds">${esc(j.desc)}</div></div>
          <div class="rr-jn"><div class="rr-lb">현재 담당(문서 기준)</div><div class="rr-who">${j.now.map((w) => `<div><span><i class="rr-dot" style="background:${COL[w[0].split(/[,\s]+/)[0]] || '#8A97A5'}"></i> ${esc(w[0])}</span><small>${esc(w[1])}</small></div>`).join('')}</div></div></div>
          <table class="rr-t"><thead><tr><th class="c-n"></th><th class="c-s">세부 업무</th><th class="c-now">현재 담당</th><th class="c-nx">향후 담당</th><th>비고</th></tr></thead><tbody>${mine.map((r) => {
            const nm = val(`nm:${r.id}`, r.name), nw = val(`nw:${r.id}`, nowDef(j)), nx = val(`nx:${r.id}`, []), by = byOf(r.id);
            return `<tr><td class="c-n">${r.no}</td><td data-l="세부 업무"><div class="rr-sn"><span>${esc(nm)}</span><button type="button" class="rr-ed" data-ren="${r.id}" aria-label="${esc(nm)} 이름 고치기">고치기</button></div></td>
              <td data-l="현재 담당"><div class="rr-ops">${C.depts.map((o) => `<button type="button" class="rr-op" data-k="nw:${r.id}" data-o="${o}" aria-pressed="${nw.includes(o)}">${o}</button>`).join('')}</div></td>
              <td data-l="향후 담당"><div class="rr-ops">${opts.map((o) => `<button type="button" class="rr-op" data-k="nx:${r.id}" data-o="${o}" aria-pressed="${nx.includes(o)}">${o}</button>`).join('')}</div></td>
              <td data-l="비고"><textarea class="rr-memo" data-k="m:${r.id}" rows="1" placeholder="기준, 시점">${esc(val(`m:${r.id}`, ''))}</textarea>${by ? `<span class="rr-by">${by}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>
          <div class="rr-add"><input data-addin="${n}" placeholder="세부 업무 더하기" maxlength="60" aria-label="${esc(j.name)} 세부 업무 더하기"><button type="button" class="btn" data-add="${n}">더하기</button></div></div>`; });
      h += '</section>';
    });
    h += `<section class="card"><h2><i class="rr-dot" style="background:#E8601C"></i>함께 정할 운영 사항</h2><table class="rr-t rr-ot"><thead><tr><th class="c-n">#</th><th class="c-o">사항</th><th class="c-c">현재</th><th>정한 내용</th></tr></thead><tbody>${C.ops.map((o, i) => { n++; const f = F[`op:${i}`];
      return `<tr><td class="c-n">${n}</td><td data-l="사항"><div class="rr-nm">${esc(o.name)}</div><div class="rr-ds">${esc(o.desc)}</div></td><td data-l="현재">${esc(o.now)}</td><td data-l="정한 내용"><textarea class="rr-memo" data-k="op:${i}" rows="2" placeholder="회의에서 정한 내용">${esc(f ? f.v : '')}</textarea>${f ? `<span class="rr-by">${esc(f.by)} ${tm(f.at)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>
      <p class="small">${esc(C.src)}입니다. 실제와 다른 곳은 줄마다 현재 담당을 고쳐 주십시오. 담당은 여러 곳을 함께 고를 수 있습니다.</p></section>`;
    const who0 = me(); $('rr-main').innerHTML = h;
    try { $('rr-who').value = who0 || localStorage.getItem('cgl-me') || ''; } catch (e) { /* 무시 */ }
    fit();
  }
  const fit = () => document.querySelectorAll('.rr-memo').forEach((t) => { t.style.height = 'auto'; t.style.height = Math.max(32, t.scrollHeight + 2) + 'px'; });

  function csv() {
    const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`, L = [['묶음', '업무', '번호', '세부 업무', '현재 담당', '향후 담당', '비고', '고친 사람, 때'].map(q).join(',')];
    for (const r of rows()) L.push([r.g.name, r.j.name, r.no, val(`nm:${r.id}`, r.name), val(`nw:${r.id}`, nowDef(r.j)).join(' / '), val(`nx:${r.id}`, []).join(' / '), val(`m:${r.id}`, ''), byOf(r.id)].map(q).join(','));
    C.ops.forEach((o, i) => L.push(['함께 정할 운영 사항', o.name, '', o.desc, o.now, '', val(`op:${i}`, ''), F[`op:${i}`] ? `${F[`op:${i}`].by} ${tm(F[`op:${i}`].at)}` : ''].map(q).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = `업무분장_협의_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function wire() {
    const M = $('rr-main');
    M.addEventListener('click', (e) => {
      const b = e.target.closest('.rr-op'); if (b) { const k = b.dataset.k, o = b.dataset.o, cur = val(k, k.startsWith('nw:') ? nowDef(rows().find((r) => `nw:${r.id}` === k).j) : []), nx = cur.includes(o) ? cur.filter((x) => x !== o) : cur.concat(o);
        if (set(k, nx)) { b.setAttribute('aria-pressed', nx.includes(o)); if (k.startsWith('nx:')) { const R = rows(); M.querySelector('.rr-cnt b').textContent = R.filter((r) => (val(`nx:${r.id}`, []) || []).length).length; } } return; }
      const rn = e.target.closest('[data-ren]'); if (rn) { const id = rn.dataset.ren, r = rows().find((x) => x.id === id), box = rn.parentElement, cur = val(`nm:${id}`, r.name);
        box.innerHTML = `<input value="${esc(cur)}" maxlength="60" aria-label="세부 업무 이름"><button type="button" class="rr-ed" data-ok="${id}">확인</button>`; box.querySelector('input').focus(); return; }
      const ok = e.target.closest('[data-ok]'); if (ok) { const id = ok.dataset.ok, v = ok.parentElement.querySelector('input').value.trim(); if (v && set(`nm:${id}`, v)) draw(); return; }
      const ad = e.target.closest('[data-add]'); if (ad) { const j = ad.dataset.add, inp = M.querySelector(`[data-addin="${j}"]`), v = inp.value.trim(); if (!v) { inp.focus(); return; }
        const cur = val(`add:${j}`, []); if (set(`add:${j}`, cur.concat({ id: `${j}-a${Date.now().toString(36)}`, name: v }))) draw(); return; }
      if (e.target.id === 'rr-csv') csv(); if (e.target.id === 'rr-prt') window.print();
    });
    M.addEventListener('input', (e) => { const t = e.target.closest('.rr-memo'); if (!t) return; if (!set(t.dataset.k, t.value)) t.value = val(t.dataset.k, ''); fit(); });
    M.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const a = e.target.closest('[data-addin]'); if (a) { e.preventDefault(); M.querySelector(`[data-add="${a.dataset.addin}"]`).click(); }
      if (e.target.closest('.rr-sn input')) { e.preventDefault(); e.target.parentElement.querySelector('[data-ok]').click(); } });
    setInterval(async () => { if (busy || Object.keys(pend).length || document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return;   // 1분마다 다른 PC 가 고친 것 받기(적는 중이면 건너뜀)
      try { const cur = await pull(); if (JSON.stringify(cur) !== JSON.stringify(F)) { F = merge(F, cur); F0 = { ...F }; draw(); } } catch (e) { /* 다음에 */ } }, 60000);
    addEventListener('beforeunload', (e) => { if (Object.keys(pend).length) { save(); e.preventDefault(); e.returnValue = ''; } });
  }

  async function open(pw) {
    try {
      const env = await GP.latest('rr.enc.json'); if (!env) throw new Error('자료 없음');
      C = await GP.decryptJSON(env, pw); PW = pw;
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      try { F = await pull(); F0 = { ...F }; } catch (e) { F = {}; }
      draw(); wire();
    } catch (e) {
      $('rr-h').textContent = '분석 암호'; $('rr-form').hidden = false;
      $('rr-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 없습니다' : '암호가 맞지 않습니다') : '';
    }
  }
  $('rr-form').onsubmit = (e) => { e.preventDefault(); open($('rr-pw').value); };
  let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (e) { /* 무시 */ }
  if (saved) open(saved); else { $('rr-h').textContent = '분석 암호'; $('rr-form').hidden = false; }
})();
