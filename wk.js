/* 03 생산 편성 · 주간 관제(11/17 사용자 '주 단위로 끊고 위에 주별 종합 관제판 · 우리 계획대로 할 거니 그에 맞게 배치 · 소재 표현')
   숫자 = suju.enc.json 의 wk8(tools/suju_build.py week_check, 2시간 갱신)
   · 계획 = 우리 생산 계획(도금 재계획 그룹·목적지·강종 일 계획 · 컬러 통합 계획 그룹 일 계획)의 그 주(수~화) 합
   · 수주 = 계획 칸에 같은 그룹·목적지(·강종) 주문을 납기 순서로 채운 양 · 주문 없음 = 계획 − 수주
   · 소재 = 채운 주문의 소재가 생산 전날까지 오나: 확보 · 재고 충당 예정 · 제때 입고 · 늦게 입고 · 예정일 없음 · 미발주 */
(function () {
  'use strict';
  const { esc, n0 } = CT;
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const MK = [['ok', '확보'], ['on', '제때 입고'], ['late', '늦게 입고(예상 입고가 생산일 뒤·인도기한 지남)'], ['wait', '입고 예정일 없음'], ['none', '소재 없음(미발주·규격 재고 없음)']];
  const sum = (L, k) => L.reduce((a, x) => a + (x[k] || 0), 0);
  const tot = (L) => Object.fromEntries(['p', 'o', 'dl', ...MK.map((m) => m[0])].map((k) => [k, sum(L, k)]));
  function sbar(v) {
    const p = v.p || 0; if (!p) return '';
    let h = MK.filter(([k]) => v[k] > 0).map(([k]) => `<i class="${k}" style="width:${(v[k] / p * 100).toFixed(1)}%"></i>`).join('');
    if (p - v.o > 0.5) h += `<i class="no" style="width:${((p - v.o) / p * 100).toFixed(1)}%"></i>`;
    return `<div class="sb">${h}</div>`;
  }
  function prob(v, short) {
    const x = [];
    if (v.late) x.push(`${short ? '늦음' : '늦게 입고'} <b class="warn">${n0(v.late)}</b>`);
    if (v.wait) x.push(`예정일 없음 <b>${n0(v.wait)}</b>`);
    if (v.none) x.push(`소재 없음 <b class="bad">${n0(v.none)}</b>`);
    if (v.p - v.o > 0.5) x.push(`주문 없음 <b class="bad">${n0(v.p - v.o)}</b>`);
    if (v.dl > 0.5) x.push(`납기 넘김 <b class="warn">${n0(v.dl)}</b>`);
    return x.join(' · ') || '문제 없음';
  }
  const mat = (v) => (v.o ? Math.min(100, pc((v.ok || 0) + (v.on || 0), v.o)) : null);   // 채운 주문 중 생산 전날까지 소재가 있는 몫(검토 11/17: 분모 = 채운 주문)
  let SEL = 0, OPEN = {};
  function render(D) {
    const S = D.suju || {}, K = S.wk8, m = document.getElementById('ct-main');
    if (!K) { m.innerHTML = '<section class="card"><h2>주간 관제 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const sc = window.UI && UI.scope ? UI.scope() : 'all', PS = sc === 'G' ? ['G'] : sc === 'C' ? ['C'] : ['G', 'C'];
    const W = K.weeks, md = (s) => `${+s.slice(5, 7)}/${+s.slice(8)}`;
    const lab = (i) => (i === 0 ? '이번 주' : `W+${i}`);
    const head = W.map((w, i) => `<div class="wh${i === 1 ? ' nx' : ''}${i === SEL ? ' sel' : ''}" data-i="${i}"><b>${lab(i)}</b><small>${md(w.from)}~${md(w.to)}</small></div>`).join('');
    const dcell = (w, i, p) => {
      const v = tot(w.g.filter((x) => x.pl === p));
      if (!v.p) return `<div class="wkc${i === SEL ? ' sel' : ''}" data-i="${i}"><div class="na">판매재 계획 없음</div></div>`;
      const f = Math.min(100, pc(v.o, v.p)), ms = mat(v);
      return `<div class="wkc${i === SEL ? ' sel' : ''}" data-i="${i}"><div class="v"><small>수주</small><b class="${f < 90 ? 'bad' : ''}">${f}%</b></div><div class="v"><small>소재</small><b class="${ms == null ? '' : ms < 50 ? 'bad' : ms < 80 ? 'warn' : ''}">${ms == null ? '–' : ms + '%'}</b></div>${sbar(v)}<div class="t">${n0(v.p)}t</div></div>`;
    };
    const dash = `<div class="wk-dash" style="--n:${W.length}"><div></div>${head}${PS.map((p) => `<div class="pl ${p}">${p === 'G' ? '도금' : '컬러'}</div>${W.map((w, i) => dcell(w, i, p)).join('')}`).join('')}</div>`;
    const NM = (g) => g;
    const lf = Object.entries(K.left || {}).filter(([g, t]) => t > 0.5 && PS.includes(W[0].g.find((x) => x.g === g)?.pl));
    const st = Object.entries(K.stale || {}).filter(([g, t]) => t > 0.5 && PS.includes(W[0].g.find((x) => x.g === g)?.pl));
    const strip = `<div class="wk-lf"><span>계획에 자리 없는 주문(W+8까지 납기)</span>${lf.map(([g, t]) => `<em>${esc(NM(g))} <b>${n0(t)}</b></em>`).join('') || '<em>없음</em>'}</div>
<div class="wk-lf"><span>납기 30일 넘게 지난 주문(정리 대상 · 위 계산에서 뺌)</span>${st.map(([g, t]) => `<em>${esc(NM(g))} <b>${n0(t)}</b></em>`).join('')}</div>`;
    const w = W[SEL];
    const row = (x) => {
      if (!x.p) return `<tr><th class="${x.pl}">${esc(NM(x.g))}</th><td colspan="5" class="nap">계획 없음</td></tr>`;
      const f = pc(x.o, x.p), ms = mat(x), op = OPEN[x.g] !== false;
      let h = `<tr class="g${op ? '' : ' cl'}" data-g="${esc(x.g)}"><th class="${x.pl}">${esc(NM(x.g))}</th><td>${n0(x.p)}</td><td><b class="${f < 90 ? 'bad' : ''}">${f}%</b><span class="s">${n0(x.o)}</span></td><td>${sbar(x)}</td><td><b class="${ms == null ? '' : ms < 50 ? 'bad' : ms < 80 ? 'warn' : ''}">${ms == null ? '–' : ms + '%'}</b></td><td class="pr">${prob(x)}</td></tr>`;
      if (!op) return h;
      if (x.pl === 'G') {
        const bad = (r) => r.p - r.o > 0.5 || r.late || r.none || r.wait, RB = (x.rows || []).filter(bad), nOk = (x.rows || []).length - RB.length;
        h += RB.map((r) => { const rf = pc(r.o, r.p), rm = mat(r); return `<tr class="ds"><th title="${esc(r.d)}">${esc(r.d)}</th><td>${n0(r.p)}</td><td><b class="${rf < 90 ? 'bad' : ''}">${rf}%</b></td><td>${sbar(r)}</td><td><b class="${rm == null ? '' : rm < 50 ? 'bad' : rm < 80 ? 'warn' : ''}">${rm == null ? '–' : rm + '%'}</b></td><td class="pr">${prob(r)}</td></tr>`; }).join('') + (nOk ? `<tr class="ds"><th></th><td colspan="5" class="tx">나머지 ${nOk}곳 · ${n0((x.rows || []).filter((r) => !bad(r)).reduce((a, r) => a + r.p, 0))}톤 — 주문·소재 문제 없음(납기 넘김 ${n0((x.rows || []).filter((r) => !bad(r)).reduce((a, r) => a + (r.dl || 0), 0))}톤 포함)</td></tr>` : '');
      } else if ((x.mkt || []).length) {
        h += `<tr class="ds"><th></th><td colspan="5" class="tx"><b>계획 시장</b> ${x.mkt.slice(0, 5).map(([a, t]) => `${esc(a)} ${n0(t)}`).join(' · ')}<br><b>채운 주문 고객</b> ${(x.cus || []).slice(0, 4).map(([a, t]) => `${esc(a)} ${n0(t)}`).join(' · ') || '–'}</td></tr>`;
      }
      return h;
    };
    const tbl = `<div class="wk-scroll"><table class="wk-t"><colgroup><col style="width:170px"><col style="width:100px"><col style="width:150px"><col><col style="width:100px"><col style="width:340px"></colgroup>
<thead><tr><th></th><th>계획(톤)</th><th>수주</th><th>소재 상태(막대 전체 = 계획)</th><th>소재(채운 주문 중)</th><th>대비할 것(톤)</th></tr></thead>
<tbody>${w.g.filter((x) => PS.includes(x.pl)).map(row).join('')}</tbody></table></div>`;
    const lg = `<div class="wk-lg">${MK.map(([k, t]) => `<span><i class="sb-k" style="${k === 'wait' ? 'background:repeating-linear-gradient(135deg,var(--m-wait1) 0 4px,var(--m-wait2) 4px 8px)' : `background:var(--m-${k})`}"></i>${t}</span>`).join('')}<span><i style="box-shadow:inset 0 0 0 1.5px var(--m-none)"></i>주문 없음</span><span class="bad">빨강 = 수주 90% · 소재 50% 미만</span><span class="warn">납기 넘김 = 생산일이 납기 뒤</span></div>
<div class="wk-ft">계획 = 우리 생산 계획(도금 재계획 · 컬러 통합 계획) · 수주 = 그 계획 칸을 납기 순서로 채운 주문 · 소재 = 채운 주문 중 생산 전날까지 소재가 있는 몫(도금 = 예상 입고, 컬러 = 발주 인도기한) · 자사 주문·재고 전환 계약(PXX) 제외</div>`;
    m.innerHTML = `<div class="wk-top"><h1>주간 수주·소재 관제</h1><span>${md(K.today)} 기준 · 주 = 수~화 · 계획 ${K.planAt ? md(K.planAt) + ' 재계획' : ''}</span></div>
${dash}${strip}<div class="wk-h2">${lab(SEL)} ${md(w.from)}~${md(w.to)}<small>그룹 → 목적지 · 위 칸을 누르면 그 주로 바뀜</small></div>${tbl}${lg}`;
    m.querySelectorAll('[data-i]').forEach((e) => e.addEventListener('click', () => { SEL = +e.dataset.i; render(D); }));
    m.querySelectorAll('tr.g').forEach((e) => e.addEventListener('click', () => { const g = e.dataset.g; OPEN[g] = OPEN[g] === false; render(D); }));
  }
  let LD = null, SUB = false;
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => render(LD)); } });
})();
