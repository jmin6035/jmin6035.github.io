/* 납기 위험(11/10 사용자 '새로 다시 만들어 — 항상 전체 먼저, 그룹별로 뭐가 문제인지, 계약 나열은 상세가 아니다')
   published/risk.enc.json(tools/risk_build.py): 전체 → 판매그룹 → 원인·강종(품명) × 납기월 → (접힘) 계약 */
(() => {
  const $ = (id) => document.getElementById(id), PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  const ST = [['ok', '납기 안에 가능'], ['warn', '주의'], ['will', '지연 예상'], ['past', '납기 지남'], ['stale', '종결 확인']];
  const STN = Object.fromEntries(ST);
  const STT = { ok: '소재·강종·생산 예정이 납기 안', warn: '소재가 아직 없지만 납기까지 여유', will: '지금 계획대로면 납기를 넘김', past: '납기가 이미 지났는데 미생산', stale: '납기 60일 넘게 지난 미종결 주문 — 실제 위험보다 종결 누락' };
  let D = null, open = null;
  const scope = () => (window.UI && UI.scope ? UI.scope() : 'all');
  const stack = (o, cls) => `<div class="rk-st ${cls || ''}">${ST.map(([k, nm]) => (o[k] > 0 ? `<i class="${k}" style="flex:${o[k]}" title="${nm} ${n0(o[k])}t"></i>` : '')).join('')}</div>`;
  const mon = (ym) => `${+ym.slice(5)}월`;
  function detail(g) {
    const risk = g.risk || 0, yms = Object.keys(g.ym).sort();
    const cur = D.asOf.slice(0, 7), col = yms.filter((y) => y >= cur), old = yms.filter((y) => y < cur);
    const cell = (v) => { const a = v ? v[0] : 0, r = v ? v[1] : 0; return a < 0.5 ? '<td class="hm z">-</td>' : `<td class="hm" style="background:color-mix(in srgb, var(--bad) ${Math.min(34, Math.round(r / a * 34))}%, transparent)"><b>${r >= 0.5 ? n0(r) : '-'}</b><small>/ ${n0(a)}</small></td>`; };
    const sumOld = (Y) => old.reduce((s, y) => [s[0] + ((Y[y] || [0, 0])[0]), s[1] + ((Y[y] || [0, 0])[1])], [0, 0]);
    const subs = g.sub.filter((s) => s.t >= 0.5).slice(0, 14), rest = g.sub.slice(14);
    return `<div class="rk-dg">
      <div><p class="rk-h3">무엇이 문제인가 <small>위험 ${n0(risk)}t</small></p>
        <table class="rk-s"><thead><tr><th class="l">원인</th><th class="l">내용</th><th>물량</th><th>건</th><th>풀리는 날</th></tr></thead><tbody>
        ${g.why.filter((w) => w[2] >= 0.5).slice(0, 8).map((w) => `<tr><td class="l"><b>${esc(D.causeNm[w[0]])}</b></td><td class="w"><div class="rk-w">${esc(w[1])}</div></td><td><b>${n0(w[2])}t</b></td><td>${w[3]}</td><td>${w[4] ? md(w[4]) : '-'}</td></tr>`).join('') || '<tr><td class="l" colspan="5">위험 없음</td></tr>'}
        </tbody></table>
        <p class="rk-rule">담당: ${Object.keys(g.cause).sort((a, b) => g.cause[b] - g.cause[a]).map((c) => `${esc(D.causeNm[c])} → ${esc(D.dept[c])}`).join(' · ') || '-'}</p></div>
      <div><p class="rk-h3">${g.pl === 'G' ? '강종' : '품명'} × 납기월 <small>위 = 위험, 아래 = 전체(t)</small></p>
        <div class="scroll"><table class="rk-s"><thead><tr><th class="l">${g.pl === 'G' ? '강종' : '품명'}</th>${old.length ? '<th>지난 달</th>' : ''}${col.map((y) => `<th>${mon(y)}</th>`).join('')}<th>위험 / 전체</th></tr></thead><tbody>
        ${subs.map((s) => `<tr><td class="l"><b>${esc(s.k)}</b></td>${old.length ? cell(sumOld(s.ym)) : ''}${col.map((y) => cell(s.ym[y])).join('')}<td><b>${n0(s.risk)}</b> / ${n0(s.t)}</td></tr>`).join('')}
        ${rest.length ? `<tr><td class="l">그 외 ${rest.length}개</td>${old.length ? '<td></td>' : ''}${col.map(() => '<td></td>').join('')}<td><b>${n0(rest.reduce((a, s) => a + s.risk, 0))}</b> / ${n0(rest.reduce((a, s) => a + s.t, 0))}</td></tr>` : ''}
        </tbody></table></div></div></div>
      <details class="rk-more"><summary>해당 계약 ${g.rows.length}건</summary><div class="scroll" style="margin-top:8px"><table class="rk-s"><thead><tr><th class="l">상태</th><th class="l">계약</th><th class="l">품목</th><th class="l">두께×폭</th><th>납기</th><th>잔량</th><th class="l">원인</th><th>풀리는 날</th></tr></thead><tbody>
        ${g.rows.slice(0, 300).map((r) => `<tr><td class="l"><span class="rk-chip ${r[6]}">${STN[r[6]]}</span></td><td class="l">${esc(r[0])}</td><td class="l">${esc(r[1])}</td><td class="l">${esc(r[2])}</td><td>${md(r[4])}</td><td><b>${n0(r[5])}t</b></td><td class="w"><div class="rk-w">${r[7] ? `<b>${esc(D.causeNm[r[7]])}</b> ` : ''}${esc(r[8] || '')}</div></td><td>${r[9] ? md(r[9]) : '-'}</td></tr>`).join('')}
        </tbody></table></div>${g.rows.length > 300 ? `<p class="rk-rule">큰 순 300건만 표시 · 전체 ${g.rows.length}건</p>` : ''}</details>`;
  }
  function draw() {
    const sc = scope(), T = D.tot[sc] || D.tot.all, CZ = D.cause[sc] || {}, G = D.groups.filter((g) => sc === 'all' || g.pl === sc);
    const risk = T.will + T.past, mx = Math.max(1, ...Object.values(CZ));
    $('rk-meta').textContent = `기준 ${md(D.asOf)} · 도금 주문 ${md(D.cgAt)} · 컬러 주문 ${md(D.ccAt)}`;
    const ymAll = {}; G.forEach((g) => Object.entries(g.ym).forEach(([y, v]) => { const a = (ymAll[y] = ymAll[y] || [0, 0]); a[0] += v[0]; a[1] += v[1]; }));
    const cur = D.asOf.slice(0, 7), ys = Object.keys(ymAll).sort(), oldA = ys.filter((y) => y < cur).reduce((s, y) => [s[0] + ymAll[y][0], s[1] + ymAll[y][1]], [0, 0]);
    const cols = (oldA[0] >= 0.5 ? [['지난 달', oldA]] : []).concat(ys.filter((y) => y >= cur).map((y) => [mon(y), ymAll[y]])), mxm = Math.max(1, ...cols.map((c) => c[1][0]));
    const hdr = (pl) => (sc === 'all' ? `<tr class="hd"><td colspan="6">${pl === 'G' ? '도금' : '컬러'}</td></tr>` : '');
    let last = null;
    $('rk-main').innerHTML = `
      <section class="card"><h2>전체 <small>미결 주문 ${sc === 'all' ? '도금 + 컬러' : sc === 'G' ? '도금' : '컬러'}</small></h2>
        <div class="rk-top"><div>
          <div class="rk-big"><b>${n0(T.t)}<small>t</small></b><span>${n0(T.n)}건 중 <b style="font-size:17px;color:var(--bad)">${n0(risk)}t(${pct(risk, T.t)}%)</b>가 납기 위험</span></div>
          ${stack(T)}
          <div class="rk-leg">${ST.map(([k, nm]) => `<div class="${k}" title="${STT[k]}"><small>${nm}</small><b>${n0(T[k])}</b><em>${pct(T[k], T.t)}%</em></div>`).join('')}</div>
        </div><div>
          <p class="rk-h3">위험 ${n0(risk)}t 의 원인</p>
          <div class="rk-cz">${D.causeOrder.filter((c) => CZ[c] >= 0.5).sort((a, b) => CZ[b] - CZ[a]).map((c) => `<span class="n">${esc(D.causeNm[c])}</span><span class="bar"><i style="width:${Math.max(2, CZ[c] / mx * 100)}%"></i></span><b>${n0(CZ[c])}t</b><span class="d">${esc(D.dept[c])}</span>`).join('') || '<span>위험 없음</span>'}</div>
        </div></div></section>
      <section class="card"><h2>판매그룹별 <small>줄을 누르면 그 그룹의 원인 · 강종(품명) × 납기월</small></h2>
        <div class="scroll"><table class="rk-g"><thead><tr><th class="l">그룹</th><th>미결</th><th class="l" style="min-width:220px">상태</th><th>위험</th><th>비율</th><th class="l">가장 큰 문제</th></tr></thead><tbody>
        ${G.map((g, i) => { const key = g.pl + g.g, on = open === key, p = pct(g.risk, g.t); const h = last !== g.pl ? hdr(g.pl) : ''; last = g.pl;
          return `${h}<tr class="g${on ? ' on' : ''}" data-k="${esc(key)}" tabindex="0"><td class="l nm"><b><i class="ch">▸</i>${esc(g.g)}</b><small>${n0(g.n)}건</small></td><td><b>${n0(g.t)}t</b></td><td class="l">${stack(g, 'sm')}</td><td><b>${n0(g.risk)}t</b></td><td><span class="rk-pct ${p >= 30 ? 'b' : p >= 15 ? 'w' : 'g'}">${p}%</span></td><td class="w"><div class="rk-w">${esc(g.msg) || '<span style="color:var(--good);font-weight:600">위험 없음</span>'}</div></td></tr>${on ? `<tr class="rk-d"><td colspan="6">${detail(g)}</td></tr>` : ''}`; }).join('')}
        </tbody></table></div>
        <p class="rk-rule">납기 기준: 도금 내수 = 납기월 말 · 도금 수출 = 출항 전날 · 컬러 = 주문 납기 &nbsp;|&nbsp; ${ST.map(([k, nm]) => `<span class="rk-chip ${k === 'ok' ? '' : k}">${nm}</span>`).join('')}</p></section>
      <section class="card"><h2>납기월별 <small>빨강 = 위험 물량</small></h2>
        <div class="rk-m">${cols.map(([nm, v]) => `<div class="col"><div class="bx" style="height:${Math.max(8, v[0] / mxm * 150)}px"><i class="o" style="flex:${Math.max(0.01, v[0] - v[1])}"></i><i class="r" style="flex:${v[1]}"></i></div><b>${n0(v[0])}t</b><small>${nm}</small>${v[1] >= 0.5 ? `<em>위험 ${n0(v[1])}t · ${pct(v[1], v[0])}%</em>` : '<small>위험 없음</small>'}</div>`).join('')}</div></section>`;
    $('rk-main').querySelectorAll('tr.g').forEach((tr) => { const f = () => { open = open === tr.dataset.k ? null : tr.dataset.k; draw(); const t = document.querySelector(`tr.g[data-k="${CSS.escape(open || '')}"]`); if (t) t.scrollIntoView({ block: 'nearest' }); };
      tr.onclick = f; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }; });
  }
  async function load(pw) {
    try {
      const env = await GP.latest('risk.enc.json'); if (!env) throw new Error('자료 없음');
      D = await GP.decryptJSON(env, pw);
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      draw(); if (window.UI && UI.onScope) UI.onScope(() => { open = null; draw(); });
    } catch (e) {
      $('rk-h').textContent = '분석 암호'; $('rk-form').hidden = false;
      $('rk-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 아직 없습니다(다음 갱신 때 생김)' : '암호가 맞지 않습니다') : '';
    }
  }
  $('rk-form').onsubmit = (e) => { e.preventDefault(); load($('rk-pw').value); };
  let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (e) { /* 무시 */ }
  if (saved) load(saved); else { $('rk-h').textContent = '분석 암호'; $('rk-form').hidden = false; }
})();
