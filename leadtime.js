/* 리드타임 기준(11/10 사용자 '소재 리드타임 어떻게 설정했는지 포털에 보여라') — published/leadtime.enc.json(tools/leadtime_pub.py: 계산이 쓰는 값을 코드에서 그대로) */
(() => {
  const $ = (id) => document.getElementById(id), PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PL = { C: '컬러', G: '도금' };
  let D = null, plant = 'all', PW = null, supOpen = false;
  const API = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_decisions', KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';   // 결정 기록과 같은 공유 저장소(암호화, 추가만)
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const num = (k, v) => `<input type="number" min="0" max="365" step="1" data-k="${esc(k)}" data-o="${v}" value="${v}" aria-label="${esc(k)} 일수">`;
  function changed() { return [...document.querySelectorAll('#lt-main input[data-k]')].filter((i) => i.value !== '' && +i.value !== +i.dataset.o); }
  function mark() { const n = changed().length; document.querySelectorAll('#lt-main input[data-k]').forEach((i) => i.classList.toggle('chg', i.value !== '' && +i.value !== +i.dataset.o)); $('lt-apply').disabled = !n; $('lt-n').textContent = n ? `${n}개 변경` : ''; }
  async function apply() {
    const C = changed(); if (!C.length) return;
    const who = $('lt-who').value.trim(); if (!who) { $('lt-res').textContent = '이름 입력 필요'; $('lt-who').focus(); return; }
    if (C.some((i) => !(+i.value >= 0 && +i.value <= 365))) { $('lt-res').textContent = '0~365일 범위로 입력'; return; }
    const rules = { safety: {}, types: {} };
    C.forEach((i) => { const k = i.dataset.k, v = Math.round(+i.value); if (k === 'selfLead' || k === 'selfLeadMin' || k === 'newOrderLT') rules[k] = v; else if (k.startsWith('safety.')) rules.safety[k.slice(7)] = v; else rules.types[k.slice(2)] = v; });
    if (!confirm(`리드타임 ${C.length}개를 바꿉니다. 다음 갱신(2시간 안)부터 발주·소재·계획 화면이 새 값으로 다시 계산됩니다.`)) return;
    $('lt-apply').disabled = true; $('lt-res').textContent = '보내는 중…';
    try {
      const env = await GP.encryptJSON({ t: 'leadtime', at: new Date().toISOString(), by: who, memo: $('lt-memo').value.trim().slice(0, 200), rules }, PW, 'decision');
      const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error('저장 실패 ' + r.status);
      try { localStorage.setItem('cgl-me', who); } catch (e) { /* 무시 */ }
      C.forEach((i) => { i.value = i.dataset.o = String(Math.round(+i.value)); }); mark();   // 소수 입력(32.4)은 보낸 값(32)으로 칸도 맞춤 — 안 맞추면 '1개 변경'이 남아 같은 요청을 또 보낼 수 있음
      $('lt-res').textContent = '접수했습니다 — 다음 갱신(2시간 안)에 전 화면 반영';
      if (window.UI && UI.toast) UI.toast('리드타임 수정 접수');
    } catch (e) { $('lt-res').textContent = '⚠ ' + e.message + ' — 재시도 바랍니다'; $('lt-apply').disabled = false; }
  }
  function draw() {
    const mx = Math.max(...D.types.map((t) => t[1]));
    const sup = D.sup.filter((s) => plant === 'all' || s[0] === plant);
    const grp = {}; sup.forEach((s) => { const k = `${s[0]}|${s[3]}`; (grp[k] = grp[k] || []).push(s); });
    const fd = (v) => (window.UI && UI.fmtDate ? UI.fmtDate(v) : String(v || '').slice(0, 10)), fdt = (v) => (window.UI && UI.fmtDateTime ? UI.fmtDateTime(v) : String(v || '').slice(0, 16).replace('T', ' '));
    const mdTxt = (t) => String(t || '').replace(/(\d{4})-(\d{2})-(\d{2})/g, (m) => fd(m));   // 글 안의 YYYY-MM-DD → M/D
    $('lt-meta').textContent = `기준 ${fdt(D.built)} · ${mdTxt(D.team.source)}`;
    $('lt-main').innerHTML = `
      <section class="card"><h2>입고 뒤 계획이 쓰는 일수</h2>
        <div class="lt-k">${D.fixed.map((f) => `<div><small>${esc(f[1])}</small><b>${num(f[0], f[2])}<i>일</i></b><span>${esc(f[3])}</span><em>${esc(f[4])}</em></div>`).join('')}
          <div><small>도금 선생산 허용</small><b class="ro">${esc(D.release.split(' · ')[0])}</b><span>${esc(D.release.split(' · ').slice(1).join(' · '))}</span><em>도금 계획 엔진 — <a href="rules.html">계획 규칙</a>에서 수정</em></div></div></section>
      <section class="card"><h2>소재 유형별 발주 → 입고 <small>발주 창이 있는 유형은 창 첫날 발주 기준(가장 긴 경우)</small></h2>
        <div class="scroll"><table class="t"><thead><tr><th class="l">소재 유형</th><th>리드타임</th><th class="l" style="min-width:260px"></th><th class="l">발주 방식</th></tr></thead><tbody>
        ${D.types.map((t) => `<tr><td class="l"><b>${esc(t[0])}</b></td><td class="d">${num('t:' + t[0], t[1])} 일</td><td class="l"><i class="lt-bar" style="width:${Math.max(4, t[1] / mx * 240)}px"></i></td><td class="l">${esc(t[2])}</td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card lt-edit"><h2>고치기 <small>위 숫자를 바꾸고 '적용' · 2시간 안에 발주·소재·계획 화면 반영</small></h2>
        <div class="lt-bar2"><input id="lt-who" placeholder="이름" maxlength="40" aria-label="이름"><input id="lt-memo" placeholder="바꾸는 이유(선택)" maxlength="200" aria-label="바꾸는 이유"><button type="button" class="btn primary" id="lt-apply" disabled>적용</button><span id="lt-n" class="lt-n"></span><span id="lt-res" class="small"></span></div>
        ${D.src ? `<p class="small">지금 값: ${esc(D.src.who || '')} ${esc(fd(D.src.at))}${D.src.memo ? ' · ' + esc(D.src.memo) : ''}</p>` : ''}
        ${(D.log || []).length ? `<details class="small"><summary>바꾼 이력 ${D.log.length}건</summary>${D.log.map((g) => `<p>${esc(fdt(g.at))} ${esc(g.who)} — ${esc((g.chg || []).join(' · '))}${g.memo ? ' (' + esc(g.memo) + ')' : ''}</p>`).join('')}</details>` : ''}</section>
      <section class="card"><details class="lt-fold"><summary><b>단계별 흐름</b> <small>팀 리드타임 표 원문 · ${D.team.rows.length}줄</small></summary>
        ${D.team.note ? `<p class="small">${esc(D.team.note)}</p>` : ''}
        <div class="scroll"><table class="t"><thead><tr>${D.team.columns.map((c) => `<th class="l">${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${D.team.rows.map((r) => `<tr>${D.team.columns.map((c, i) => `<td class="l">${i === 1 ? '<b>' + esc(r[c]) + '</b>' : esc(r[c])}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></details></section>
      <section class="card"><details class="lt-fold" id="lt-sup"${supOpen ? ' open' : ''}><summary><b>업체별</b> <small>소재 발주 기준(27년) · ${sup.length}곳</small></summary>
        <div class="lt-seg" role="group" aria-label="공장">${[['all', '전체'], ['C', '컬러'], ['G', '도금']].map(([k, n]) => `<button type="button" data-p="${k}" aria-pressed="${k === plant}">${n}</button>`).join('')}</div>
        <div class="scroll"><table class="t"><thead><tr><th class="l">공장</th><th class="l">유형</th><th class="l">업체</th><th class="l">소재</th><th>리드타임</th><th>27년 배정</th><th class="l">근거</th></tr></thead><tbody>
        ${Object.keys(grp).sort().map((k) => grp[k].map((s, i) => `<tr>${i ? '' : `<td class="l" rowspan="${grp[k].length}">${PL[s[0]] || s[0]}</td><td class="l" rowspan="${grp[k].length}"><b>${esc(s[3])}</b></td>`}<td class="l">${esc(s[2])}</td><td class="l">${esc((D.matCode && D.matCode[s[1]] && (D.matCode[s[1]].name || D.matCode[s[1]])) || s[1])}</td><td class="d">${s[4]}일</td><td>${s[6] ? s[6] + '%' : '-'}</td><td class="l">${esc(String(s[5] || '').replace(/^팀 리드타임 표\(10\/12\): /, ''))}</td></tr>`).join('')).join('')}
        </tbody></table></div>
        <p class="small">업체 리드타임 = 소재 유형 값</p></details></section>`;
    $('lt-main').querySelectorAll('input[data-k]').forEach((i) => (i.oninput = mark));
    $('lt-apply').onclick = apply;
    try { $('lt-who').value = localStorage.getItem('cgl-me') || ''; } catch (e) { /* 무시 */ }
    $('lt-main').querySelectorAll('button[data-p]').forEach((b) => (b.onclick = () => { plant = b.dataset.p; supOpen = true; draw(); }));
  }
  async function open(pw) {
    try {
      const env = await GP.latest('leadtime.enc.json'); if (!env) throw new Error('자료 없음');
      D = await GP.decryptJSON(env, pw); PW = pw;
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      draw();
    } catch (e) {
      $('lt-h').textContent = '분석 암호'; $('lt-form').hidden = false;
      $('lt-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 없습니다' : '암호가 맞지 않습니다') : '';
    }
  }
  $('lt-form').onsubmit = (e) => { e.preventDefault(); open($('lt-pw').value); };
  let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (e) { /* 무시 */ }
  if (saved) open(saved); else { $('lt-h').textContent = '분석 암호'; $('lt-form').hidden = false; }
})();
