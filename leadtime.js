/* 리드타임 기준(11/10 사용자 '소재 리드타임 어떻게 설정했는지 포털에 보여라') — published/leadtime.enc.json(tools/leadtime_pub.py: 계산이 쓰는 값을 코드에서 그대로) */
(() => {
  const $ = (id) => document.getElementById(id), PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PL = { C: '컬러', G: '도금' };
  let D = null, plant = 'all';
  function draw() {
    const mx = Math.max(...D.types.map((t) => t[1]));
    const sup = D.sup.filter((s) => plant === 'all' || s[0] === plant);
    const grp = {}; sup.forEach((s) => { const k = `${s[0]}|${s[3]}`; (grp[k] = grp[k] || []).push(s); });
    $('lt-meta').textContent = `기준 ${D.built.replace('T', ' ')} · ${D.team.source || ''}`;
    $('lt-main').innerHTML = `
      <section class="card"><h2>입고 뒤 계획이 쓰는 일수</h2>
        <div class="lt-k">${D.fixed.map((f) => `<div><small>${esc(f[0])}</small><b>${esc(f[1])}</b><span>${esc(f[2])}</span></div>`).join('')}</div></section>
      <section class="card"><h2>소재 유형별 발주 → 입고 <small>발주 창이 있는 유형은 창 첫날 발주 기준(가장 긴 경우)</small></h2>
        <div class="scroll"><table class="t"><thead><tr><th class="l">소재 유형</th><th>리드타임</th><th class="l" style="min-width:260px"></th><th class="l">발주 방식</th></tr></thead><tbody>
        ${D.types.map((t) => `<tr><td class="l"><b>${esc(t[0])}</b></td><td class="d">${t[1]}일</td><td class="l"><i class="lt-bar" style="width:${Math.max(4, t[1] / mx * 240)}px"></i></td><td class="l">${esc(t[2])}</td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card"><h2>단계별 흐름 <small>팀 리드타임 표 원문</small></h2>
        ${D.team.note ? `<p class="small">${esc(D.team.note)}</p>` : ''}
        <div class="scroll"><table class="t"><thead><tr>${D.team.columns.map((c) => `<th class="l">${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${D.team.rows.map((r) => `<tr>${D.team.columns.map((c, i) => `<td class="l">${i === 1 ? '<b>' + esc(r[c]) + '</b>' : esc(r[c])}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></section>
      <section class="card"><h2>업체별 <small>소재 발주 마스터(27년) · 발주 화면이 쓰는 값</small></h2>
        <div class="lt-seg" role="group" aria-label="공장">${[['all', '전체'], ['C', '컬러'], ['G', '도금']].map(([k, n]) => `<button type="button" data-p="${k}" aria-pressed="${k === plant}">${n}</button>`).join('')}</div>
        <div class="scroll"><table class="t"><thead><tr><th class="l">공장</th><th class="l">유형</th><th class="l">업체</th><th class="l">소재</th><th>리드타임</th><th>27년 배정</th><th class="l">근거</th></tr></thead><tbody>
        ${Object.keys(grp).sort().map((k) => grp[k].map((s, i) => `<tr>${i ? '' : `<td class="l" rowspan="${grp[k].length}">${PL[s[0]] || s[0]}</td><td class="l" rowspan="${grp[k].length}"><b>${esc(s[3])}</b></td>`}<td class="l">${esc(s[2])}</td><td class="l">${esc((D.matCode && D.matCode[s[1]] && (D.matCode[s[1]].name || D.matCode[s[1]])) || s[1])}</td><td class="d">${s[4]}일</td><td>${s[6] ? s[6] + '%' : '-'}</td><td class="l">${esc(String(s[5] || '').replace(/^팀 리드타임 표\(10\/12\): /, ''))}</td></tr>`).join('')).join('')}
        </tbody></table></div>
        <p class="small">업체 리드타임을 고치려면 <a href="procure.html">발주</a> 화면 아래 '업체 기준정보'에서.</p></section>`;
    $('lt-main').querySelectorAll('button[data-p]').forEach((b) => (b.onclick = () => { plant = b.dataset.p; draw(); }));
  }
  async function open(pw) {
    try {
      const env = await GP.latest('leadtime.enc.json'); if (!env) throw new Error('자료 없음');
      D = await GP.decryptJSON(env, pw);
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      draw();
    } catch (e) {
      $('lt-h').textContent = '분석 암호'; $('lt-form').hidden = false;
      $('lt-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 아직 없습니다' : '암호가 맞지 않습니다') : '';
    }
  }
  $('lt-form').onsubmit = (e) => { e.preventDefault(); open($('lt-pw').value); };
  let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (e) { /* 무시 */ }
  if (saved) open(saved); else { $('lt-h').textContent = '분석 암호'; $('lt-form').hidden = false; }
})();
