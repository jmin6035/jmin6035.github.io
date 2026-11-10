/* 납기 위험(11/10 사용자 '새로 다시 만들어 — 항상 전체 먼저, 그룹별로 뭐가 문제인지, 계약 나열은 상세가 아니다')
   published/risk.enc.json(tools/risk_build.py): 전체 → 판매그룹 → 원인·강종(품명) × 납기월 → (접힘) 계약 */
(() => {
  const $ = (id) => document.getElementById(id), PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  const ST = [['ok', '납기 내 생산 가능'], ['warn', '주의'], ['will', '지연 예상'], ['past', '납기 경과'], ['stale', '종결 확인']];
  const STN = Object.fromEntries(ST);
  const STT = { ok: '소재·강종·생산 일정 모두 납기 이내', warn: '소재 미확보 · 납기까지 여유', will: '현 계획 기준 납기 초과 예상', past: '납기 경과 · 미생산', stale: '납기 60일 이상 경과 · MES 종결 누락 가능' };
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
      <div><p class="rk-h3">원인별 내역 <small>위험 ${n0(risk)}t</small></p>
        <table class="rk-s"><thead><tr><th class="l">원인</th><th class="l">내용</th><th>물량</th><th>건</th><th>해소 예정일</th></tr></thead><tbody>
        ${g.why.filter((w) => w[2] >= 0.5).slice(0, 8).map((w) => `<tr><td class="l"><b>${esc(D.causeNm[w[0]])}</b></td><td class="w"><div class="rk-w">${esc(w[1])}</div></td><td><b>${n0(w[2])}t</b></td><td>${w[3]}</td><td>${w[4] ? md(w[4]) : '-'}</td></tr>`).join('') || '<tr><td class="l" colspan="5">해당 없음</td></tr>'}
        </tbody></table>
        <p class="rk-rule">담당: ${Object.keys(g.cause).sort((a, b) => g.cause[b] - g.cause[a]).map((c) => `${esc(D.causeNm[c])} → ${esc(D.dept[c])}`).join(' · ') || '-'}</p></div>
      <div><p class="rk-h3">${g.pl === 'G' ? '강종' : '품명'} × 납기월 <small>상단 위험 / 하단 전체(t)</small></p>
        <div class="scroll"><table class="rk-s"><thead><tr><th class="l">${g.pl === 'G' ? '강종' : '품명'}</th>${old.length ? '<th>전월 이전</th>' : ''}${col.map((y) => `<th>${mon(y)}</th>`).join('')}<th>위험 / 전체</th></tr></thead><tbody>
        ${subs.map((s) => `<tr><td class="l"><b>${esc(s.k)}</b></td>${old.length ? cell(sumOld(s.ym)) : ''}${col.map((y) => cell(s.ym[y])).join('')}<td><b>${n0(s.risk)}</b> / ${n0(s.t)}</td></tr>`).join('')}
        ${rest.length ? `<tr><td class="l">그 외 ${rest.length}개</td>${old.length ? '<td></td>' : ''}${col.map(() => '<td></td>').join('')}<td><b>${n0(rest.reduce((a, s) => a + s.risk, 0))}</b> / ${n0(rest.reduce((a, s) => a + s.t, 0))}</td></tr>` : ''}
        </tbody></table></div></div></div>
      <details class="rk-more"><summary>대상 계약 ${g.rows.length}건</summary><div class="scroll" style="margin-top:8px"><table class="rk-s"><thead><tr><th class="l">상태</th><th class="l">계약</th><th class="l">품목</th><th class="l">두께×폭</th><th>납기</th><th>잔량</th><th class="l">원인</th><th>해소 예정일</th></tr></thead><tbody>
        ${g.rows.slice(0, 300).map((r) => `<tr><td class="l"><span class="rk-chip ${r[6]}">${STN[r[6]]}</span></td><td class="l">${esc(r[0])}</td><td class="l">${esc(r[1])}</td><td class="l">${esc(r[2])}</td><td>${md(r[4])}</td><td><b>${n0(r[5])}t</b></td><td class="w"><div class="rk-w">${r[7] ? `<b>${esc(D.causeNm[r[7]])}</b> ` : ''}${esc(r[8] || '')}</div></td><td>${r[9] ? md(r[9]) : '-'}</td></tr>`).join('')}
        </tbody></table></div>${g.rows.length > 300 ? `<p class="rk-rule">큰 순 300건만 표시 · 전체 ${g.rows.length}건</p>` : ''}</details>`;
  }
  function draw() {
    const sc = scope(), T = D.tot[sc] || D.tot.all, CZ = D.cause[sc] || {}, G = D.groups.filter((g) => sc === 'all' || g.pl === sc);
    const risk = T.will + T.past, mx = Math.max(1, ...Object.values(CZ));
    $('rk-meta').textContent = `기준 ${md(D.asOf)} · 도금 주문 ${md(D.cgAt)} · 컬러 주문 ${md(D.ccAt)}`;
    const ymAll = {}; G.forEach((g) => Object.entries(g.ym).forEach(([y, v]) => { const a = (ymAll[y] = ymAll[y] || [0, 0, 0]); a[0] += v[0]; a[1] += v[1]; a[2] += v[2] || 0; }));
    const cur = D.asOf.slice(0, 7), ys = Object.keys(ymAll).sort(), oldA = ys.filter((y) => y < cur).reduce((s, y) => [s[0] + ymAll[y][0], s[1] + ymAll[y][1], s[2] + ymAll[y][2]], [0, 0, 0]);
    const cols = (oldA[0] >= 0.5 ? [['전월 이전', oldA]] : []).concat(ys.filter((y) => y >= cur).map((y) => [mon(y), ymAll[y]])), mxm = Math.max(1, ...cols.map((c) => c[1][0]));
    const hdr = (pl) => (sc === 'all' ? `<tr class="hd"><td colspan="6">${pl === 'G' ? '도금' : '컬러'}</td></tr>` : '');
    let last = null;
    $('rk-main').innerHTML = `
      <section class="card"><h2>전체 <small>미결 주문 현황(${sc === 'all' ? '도금 + 컬러' : sc === 'G' ? '도금' : '컬러'})</small></h2>
        <div class="rk-top"><div>
          <div class="rk-big"><span class="lb">미결</span><b>${n0(T.t)}<small>t</small></b><span>${n0(T.n)}건</span><span class="sep">|</span><span class="lb">위험</span><b class="bad">${n0(risk)}<small>t</small></b><span>${pct(risk, T.t)}%</span>${T.sn ? `<span class="sep">|</span><span>종결 확인 ${n0(T.sn)}건 ${n0(T.stale)}t 별도</span>` : ''}</div>
          <dl class="rk-def"><dt>미결</dt><dd>주문량 중 미생산 잔량(종결 확인 제외 · 주문진도와 같음)</dd><dt>위험</dt><dd>지연 예상 + 납기 경과</dd></dl>
          ${stack(T)}
          <div class="rk-leg">${ST.map(([k, nm]) => `<div class="${k}"><small>${nm}</small><b>${n0(T[k])}</b><em>${k === 'stale' ? '별도' : pct(T[k], T.t) + '%'}</em><p>${STT[k]}</p></div>`).join('')}</div>
        </div><div>
          <p class="rk-h3">위험 물량 ${n0(risk)}t 원인별</p>
          <div class="rk-cz">${D.causeOrder.filter((c) => CZ[c] >= 0.5).sort((a, b) => CZ[b] - CZ[a]).map((c) => `<span class="n">${esc(D.causeNm[c])}</span><span class="bar"><i style="width:${Math.max(2, CZ[c] / mx * 100)}%"></i></span><b>${n0(CZ[c])}t</b><span class="d">${esc(D.dept[c])}</span>`).join('') || '<span>위험 없음</span>'}</div>
        </div></div></section>
      <section class="card"><h2>판매그룹별 <small>그룹 선택 시 원인별 · 강종(품명)별 내역 표시</small></h2>
        <div class="scroll"><table class="rk-g"><thead><tr><th class="l">그룹</th><th>미결</th><th class="l" style="min-width:220px">상태</th><th>위험</th><th>비율</th><th class="l">주요 원인</th></tr></thead><tbody>
        ${G.map((g, i) => { const key = g.pl + g.g, on = open === key, p = pct(g.risk, g.t); const h = last !== g.pl ? hdr(g.pl) : ''; last = g.pl;
          return `${h}<tr class="g${on ? ' on' : ''}" data-k="${esc(key)}" tabindex="0"><td class="l nm"><b><i class="ch">▸</i>${esc(g.g)}</b><small>${n0(g.n)}건</small></td><td><b>${n0(g.t)}t</b></td><td class="l">${stack(g, 'sm')}</td><td><b>${n0(g.risk)}t</b></td><td><span class="rk-pct ${p >= 30 ? 'b' : p >= 15 ? 'w' : 'g'}">${p}%</span></td><td class="w"><div class="rk-w">${esc(g.msg) || '<span style="color:var(--good);font-weight:600">위험 없음</span>'}</div></td></tr>${on ? `<tr class="rk-d"><td colspan="6">${detail(g)}</td></tr>` : ''}`; }).join('')}
        </tbody></table></div>
        <p class="rk-rule">납기 기준: 도금 내수 납기월 말일 · 도금 수출 출항 전일 · 컬러 주문 납기일 &nbsp;|&nbsp; ${ST.map(([k, nm]) => `<span class="rk-chip ${k === 'ok' ? '' : k}">${nm}</span>`).join('')}</p></section>
      <section class="card"><h2>납기월별 미결 <small>납기월 기준 · 전월 이전 = 납기 경과분</small></h2>
        <div class="scroll"><table class="rk-mt"><thead><tr><th class="l">납기월</th><th>미결</th><th class="l">구성</th><th>위험</th><th>비율</th><th>종결 확인</th><th>납기 내 생산 가능 · 주의</th></tr></thead><tbody>${cols.map(([nm, v]) => { const ok = Math.max(0, v[0] - v[1] - v[2]), op = Math.max(0, v[0] - v[2]), p = pct(v[1], op);   // 미결 = 종결 확인 제외(맨 위 미결과 같은 정의, 11/10 검토)
          return `<tr><td class="l"><b>${nm}</b></td><td><b>${n0(op)}t</b></td><td class="l"><div class="rk-mb" style="width:${Math.max(3, v[0] / mxm * 100)}%">${v[1] >= 0.5 ? `<i class="r" style="flex:${v[1]}">${p >= 12 ? p + '%' : ''}</i>` : ''}${v[2] >= 0.5 ? `<i class="s" style="flex:${v[2]}"></i>` : ''}${ok >= 0.5 ? `<i class="o" style="flex:${ok}"></i>` : ''}</div></td><td>${v[1] >= 0.5 ? `<b class="rk-bad">${n0(v[1])}t</b>` : '-'}</td><td>${v[1] >= 0.5 ? `<span class="rk-pct ${p >= 30 ? 'b' : p >= 15 ? 'w' : 'g'}">${p}%</span>` : '-'}</td><td>${v[2] >= 0.5 ? n0(v[2]) + 't' : '-'}</td><td>${ok >= 0.5 ? n0(ok) + 't' : '-'}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="rk-rule"><span class="rk-key"><i class="r"></i>위험(지연 예상 · 납기 경과)</span><span class="rk-key"><i class="s"></i>종결 확인</span><span class="rk-key"><i class="o"></i>납기 내 생산 가능 · 주의</span> &nbsp;|&nbsp; 12월 이후 물량은 생산 예정일이 확정된 범위(2~3주)까지만 판정</p></section>`;
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
