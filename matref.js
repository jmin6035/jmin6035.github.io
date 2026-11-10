/* 소재·재고 화면 맨 아래 '기준·사양' 첨부(11/11 사용자 '리드타임·계획재 사양이 궁금한 사람들이 있다 — 항상 첨부'):
   <div data-ref="lt"></div>      → 소재 유형별 리드타임 표 + 입고 뒤 투입 여유(published/leadtime.enc.json, 읽기 전용 — 고치기는 리드타임 기준 화면)
   <div data-ref="spec"></div>    → 계획재 사양표(TF 계획재 운영안 R15, published/planstock.enc.json specs)
   <div data-ref="stkmat"></div>  → 소재 재고 목표 대비 한 줄(published/portal.enc.json sr.stock — 도금 F/H · 컬러 소재)
   화면 스크립트가 암호를 저장(cgl-analysis-pw)하면 그때 불러옴. 같은 파일은 한 번만 풂(MatRef.load) */
(function () {
  'use strict';
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => UI.fmtN(v), n1 = (v) => UI.fmtN(v, 1);
  const cache = {};
  const MatRef = window.MatRef = {};
  const css = document.createElement('style');   // 첨부 표 서식 — 이 파일을 쓰는 화면(소재 관제·발주·재고 전망·계획재)만
  css.textContent = `.ref-h { font-size: 15px; margin: 14px 0 6px; } .ref-h small { font-size: 13.5px; font-weight: 500; color: var(--ink-2); margin-left: 6px; }
    table.t.ref-t { width: auto; min-width: min(100%, 720px); } html body table.t.ref-t :is(td, th).l { text-align: left !important; } html body table.t.ref-t :is(td, th):not(.l) { text-align: right !important; }
    details.ref-spec { margin: 14px 0 6px; } details.ref-spec > summary { padding-left: 0; } table.t.ref-t td, table.t.ref-t th { padding: 6px 12px; } table.t.ref-t td.nw { white-space: nowrap; }
    table.t.ref-t tr.ref-g td { background: var(--surface-2); border-top: 2px solid var(--line); }
    .ref-n { font-size: 13.5px; color: var(--ink-2); margin: 6px 0 0; }
    .ref-l { font-size: 13.5px; font-weight: 800; color: var(--ink-2); margin-right: 2px; }
    .ref-c { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 14.5px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); border-left: 4px solid var(--good); background: var(--surface); font-variant-numeric: tabular-nums; }
    .ref-c span { font-size: 13.5px; color: var(--ink-2); } .ref-c em { font-style: normal; font-weight: 800; }
    .ref-c.bad { border-left-color: var(--bad); } .ref-c.bad em { color: var(--bad); } .ref-c.warn { border-left-color: var(--warn); } .ref-c.warn em { color: var(--warn); } .ref-c.ok em { color: var(--good); }`;
  document.head.appendChild(css);
  MatRef.load = (name, pw) => (cache[name] = cache[name] || GP.latest(name).then((e) => (e ? GP.decryptJSON(e, pw) : null)).catch(() => null));

  /* 리드타임 표: 유형별 발주 → 입고 일수(짧은 순) + 입고 뒤 계획이 쓰는 일수 */
  MatRef.ltHtml = (L) => {
    if (!L || !L.types) return UI.empty('리드타임 자료 없음', '다음 자동 게시 뒤');
    const T = L.types.slice().sort((a, b) => a[1] - b[1]);
    return `<h3 class="ref-h">소재 유형별 리드타임 <small>발주 → 입고 · ${esc(UI.fmtDate((L.src && L.src.at) || L.built))} 기준 · <a href="leadtime.html">고치기 →</a></small></h3>
      <div class="scroll"><table class="t ref-t"><thead><tr><th class="l">소재 유형</th><th>리드타임(일)</th><th class="l">발주 방식</th></tr></thead><tbody>
      ${T.map((t) => `<tr><td class="l"><b>${esc(t[0])}</b></td><td>${n0(t[1])}</td><td class="l">${esc(t[2])}</td></tr>`).join('')}</tbody></table></div>
      ${(L.fixed || []).length ? `<h3 class="ref-h">입고 뒤 계획이 쓰는 일수</h3><div class="scroll"><table class="t ref-t"><thead><tr><th class="l">항목</th><th>일수</th><th class="l">뜻</th></tr></thead><tbody>
      ${L.fixed.map((f) => `<tr><td class="l"><b>${esc(f[1])}</b></td><td>${n0(f[2])}</td><td class="l">${esc(f[3])}</td></tr>`).join('')}
      ${L.release ? `<tr><td class="l"><b>도금 선생산 허용</b></td><td>${esc(String(L.release).split(' · ')[0].replace(/[^0-9]/g, '') || '-')}</td><td class="l">${esc(L.release)}</td></tr>` : ''}</tbody></table></div>` : ''}`;
  };

  /* 계획재 사양표: 소재(수입 FH · 서림 GI) → 품명 순, 사양 = 두께 × 폭 · 상도 색상 */
  MatRef.specHtml = (P) => {
    if (!P || !P.specs) return UI.empty('계획재 사양 자료 없음', '다음 자동 게시 뒤');
    const S = P.specs.slice().sort((a, b) => String(a.mat).localeCompare(String(b.mat)) || String(a.product).localeCompare(String(b.product)) || String(a.spec).localeCompare(String(b.spec)));
    const mats = [...new Set(S.map((s) => s.mat))];
    const sz = (sp) => { const p = String(sp).split(/\s+/); return p.length >= 3 ? `<b>${esc(p[0])} × ${esc(UI.fmtN(+p[1]))}</b> <span class="muted">${esc(p.slice(2).join(' '))}</span>` : esc(sp); };
    const body = mats.map((m) => {
      const L = S.filter((s) => s.mat === m), sum = (k) => L.reduce((a, s) => a + (+s[k] || 0), 0);
      return `<tr class="ref-g"><td class="l" colspan="4"><b>${esc(m)}</b> <span class="muted">${L.length}개 사양</span></td><td>${n0(sum('sale'))}</td><td>${n0(sum('safe'))}</td><td>${n0(sum('target'))}</td><td></td></tr>`
        + L.map((s) => `<tr><td class="l"><b>${esc(s.product)}</b></td><td class="l nw">${sz(s.spec)}</td><td class="l">${esc(s.use || '-')}</td><td class="l">${s.kind === '개별' ? `개별 · ${esc(s.owner)}` : '공통'}</td><td>${n1(s.sale)}</td><td>${n1(s.safe)}</td><td>${n1(s.target)}</td><td class="l">${esc(s.eoq || '-')}</td></tr>`).join('');
    }).join('');
    return `<details class="fold in ref-spec"><summary>계획재 사양표 <small>${esc(String(P.src || 'TF 계획재 운영안').replace(/\.xlsx$/, '').replace(/_/g, ' '))} · ${mats.map((m) => `${esc(m)} ${S.filter((s) => s.mat === m).length}`).join(' · ')} · 총 ${n0(P.n || S.length)}개 사양 · 단위 톤</small></summary>
      <div class="scroll"><table class="t ref-t"><thead><tr><th class="l">품명</th><th class="l">사양(두께 × 폭 · 색상)</th><th class="l">용도</th><th class="l">구분 · 담당</th><th title="운영안 월 판매(기준)">월 판매</th><th>안전재고</th><th>목표재고</th><th class="l">생산 주기</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="ref-n">안전재고·목표재고 = 운영안 사양별 값(톤) · 생산 주기 = 운영안 '경제적 생산량' 칸 · 사양별 재고·진도 = <a href="planstock.html">계획재</a></p></details>`;
  };

  /* 소재 재고 목표 대비: 판매생산속보 재고 vs '27 판생그룹 월말 최대 */
  MatRef.stkHtml = (PT, re) => {
    const L = ((PT && PT.sr && PT.sr.stock) || []).filter((s) => re.test(s.name) && s.target && UI.inScope(/^도금/.test(s.name) ? 'G' : 'C'));
    if (!L.length) return '';
    return L.map((s) => { const r = s.current / s.target, tone = r > 1 ? 'bad' : r < 0.9 ? 'warn' : 'ok';
      return `<span class="ref-c ${tone}" title="판매생산속보 ${esc(UI.fmtDateTime(PT.sr.asOf))} · 목표 = '27 판생그룹 월말 최대"><b>${esc(s.name)}</b> ${UI.fmtT(s.current)} <span>목표 ${UI.fmtT(s.target)}의</span> <em>${Math.round(r * 100)}%</em>${r > 1 ? ` <span>초과 ${UI.fmtT(s.current - s.target)}</span>` : r < 0.9 ? ` <span>미달 ${UI.fmtT(s.target - s.current)}</span>` : ''}</span>`; }).join('');
  };

  const F = { lt: ['leadtime.enc.json', MatRef.ltHtml], spec: ['planstock.enc.json', MatRef.specHtml],
    stkmat: ['portal.enc.json', (PT) => { const h = MatRef.stkHtml(PT, /소재/); return h ? `<span class="ref-l">소재 재고</span>${h}` : ''; }] };
  async function fill(pw) {
    for (const el of document.querySelectorAll('[data-ref]')) {
      const f = F[el.dataset.ref]; if (!f) continue;
      const d = await MatRef.load(f[0], pw);
      el.innerHTML = f[1](d);
      if (el.dataset.ref === 'stkmat') el.hidden = !el.innerHTML;
      const fd = el.closest('details.fold[hidden]'); if (fd) fd.hidden = false;   // 암호를 넣기 전엔 빈 접기를 숨김
    }
  }
  let tries = 0;
  (function wait() {
    let pw = null; try { pw = localStorage.getItem(PW_KEY); } catch (e) { /* 무시 */ }
    if (pw) { UI.ready().then(() => fill(pw)); if (UI.onScope) UI.onScope(() => fill(pw)); return; }
    if (++tries < 600) setTimeout(wait, 1000);   // 화면에서 암호를 넣으면 그때(10분까지 기다림)
  })();
})();
