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
  let MON = null, VIEW = 'o';   // 월 탭 · 보기(o 수주 / m 소재) — 11/17 사용자 '한 화면에 다 담지 말고 소재를 나누든 월 구분을 하든'
  try { VIEW = sessionStorage.getItem('wk-view') || 'o'; } catch (e) { /* 무시 */ }
  const addd = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  function render(D) {
    const S = D.suju || {}, K = S.wk8, m = document.getElementById('ct-main');
    if (!K) { m.innerHTML = '<section class="card"><h2>주간 관제 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const sc = window.UI && UI.scope ? UI.scope() : 'all', PS = sc === 'G' ? ['G'] : sc === 'C' ? ['C'] : ['G', 'C'];
    const W = K.weeks.map((w, i) => ({ ...w, i, ym: addd(w.from, 3).slice(0, 7) })), md = (s) => `${+s.slice(5, 7)}/${+s.slice(8)}`;
    const MS = [...new Set(W.map((w) => w.ym))];
    if (!MS.includes(MON)) MON = MS[0];
    const WM = W.filter((w) => w.ym === MON);
    if (!WM.some((w) => w.i === SEL)) SEL = WM[0].i;
    const lab = (i) => (i === 0 ? '이번 주' : `W+${i}`), O = VIEW === 'o';
    const cls = (v, a, b) => (v == null ? '' : v < a ? 'bad' : v < b ? 'warn' : '');
    // 수주 막대: 채운 주문(그중 납기 넘김) / 주문 없음
    const obar = (v) => { const p = v.p || 0; if (!p) return ''; const ok = Math.max(0, v.o - (v.dl || 0)); return `<div class="sb"><i class="ok" style="width:${(ok / p * 100).toFixed(1)}%"></i>${v.dl > 0.5 ? `<i class="late" style="width:${(v.dl / p * 100).toFixed(1)}%"></i>` : ''}${p - v.o > 0.5 ? `<i class="no" style="width:${((p - v.o) / p * 100).toFixed(1)}%"></i>` : ''}</div>`; };
    // 소재 막대: 채운 주문 = 막대 전체
    const mbar = (v) => { const o = v.o || 0; if (!o) return ''; return `<div class="sb">${MK.filter(([k]) => v[k] > 0).map(([k]) => `<i class="${k}" style="width:${(v[k] / o * 100).toFixed(1)}%"></i>`).join('')}</div>`; };
    const big = (v) => (O ? Math.min(100, pc(v.o, v.p)) : mat(v));
    const head = WM.map((w) => `<div class="wh${w.i === 1 ? ' nx' : ''}${w.i === SEL ? ' sel' : ''}" data-i="${w.i}"><b>${lab(w.i)}</b><small>${md(w.from)}~${md(w.to)}</small></div>`).join('');
    const dcell = (w, p) => {
      const v = tot(w.g.filter((x) => x.pl === p));
      if (!v.p) return `<div class="wkc${w.i === SEL ? ' sel' : ''}" data-i="${w.i}"><div class="na">판매재 계획 없음</div></div>`;
      const b = big(v);
      const sub = O ? `계획 ${n0(v.p)} · 빈 곳 ${n0(Math.max(0, v.p - v.o))}${v.dl > 0.5 ? ` · 납기 넘김 ${n0(v.dl)}` : ''}` : `주문 ${n0(v.o)} · 늦음 ${n0(v.late || 0)} · 없음 ${n0(v.none || 0)}`;
      return `<div class="wkc${w.i === SEL ? ' sel' : ''}" data-i="${w.i}"><div class="bg ${cls(b, O ? 90 : 50, O ? 100 : 80)}">${b == null ? '–' : b + '%'}</div>${O ? obar(v) : mbar(v)}<div class="t">${sub}</div></div>`;
    };
    const dash = `<div class="wk-dash" style="--n:${WM.length}"><div></div>${head}${PS.map((p) => `<div class="pl ${p}">${p === 'G' ? '도금' : '컬러'}</div>${WM.map((w) => dcell(w, p)).join('')}`).join('')}</div>`;
    const inPS = (g) => PS.includes(W[0].g.find((x) => x.g === g)?.pl);
    const lf = Object.entries(K.left || {}).filter(([g, t]) => t > 0.5 && inPS(g));
    const st = Object.entries(K.stale || {}).filter(([g, t]) => t > 0.5 && inPS(g));
    const strip = O ? `<div class="wk-lf"><span>계획에 자리 없는 주문(W+8까지 납기)</span>${lf.map(([g, t]) => `<em>${esc(g)} <b>${n0(t)}</b></em>`).join('') || '<em>없음</em>'}<span class="sp">납기 30일 넘게 지나 움직임 없는 주문(정리 대상)</span>${st.map(([g, t]) => `<em>${esc(g)} <b>${n0(t)}</b></em>`).join('')}</div>` : '';
    const w = W[SEL];
    const probO = (v) => [v.p - v.o > 0.5 ? `빈 곳 <b class="bad">${n0(v.p - v.o)}</b>` : '', v.dl > 0.5 ? `납기 넘김 <b class="warn">${n0(v.dl)}</b>` : ''].filter(Boolean).join(' · ') || '문제 없음';
    const probM = (v) => [v.late ? `늦게 입고 <b class="warn">${n0(v.late)}</b>` : '', v.wait ? `예정일 없음 <b>${n0(v.wait)}</b>` : '', v.none ? `소재 없음 <b class="bad">${n0(v.none)}</b>` : ''].filter(Boolean).join(' · ') || '문제 없음';
    const line = (v, nm, th) => {
      const b = big(v);
      return O ? `<td>${n0(v.p)}</td><td>${n0(v.o)}</td><td>${obar(v)}</td><td><b class="${cls(b, 90, 100)}">${b ?? '–'}%</b></td><td class="pr">${probO(v)}</td>`
        : `<td>${n0(v.o)}</td><td>${n0((v.ok || 0) + (v.on || 0))}</td><td>${mbar(v)}</td><td><b class="${cls(b, 50, 80)}">${b == null ? '–' : b + '%'}</b></td><td class="pr">${probM(v)}</td>`;
    };
    const row = (x) => {
      if (!x.p) return `<tr><th class="${x.pl}">${esc(x.g)}</th><td colspan="5" class="nap">계획 없음</td></tr>`;
      const op = OPEN[x.g] !== false;
      let h = `<tr class="g${op ? '' : ' cl'}" data-g="${esc(x.g)}"><th class="${x.pl}">${esc(x.g)}</th>${line(x)}</tr>`;
      if (!op) return h;
      if (x.pl === 'G') {
        const bad = O ? (r) => r.p - r.o > 0.5 : (r) => r.late || r.none || r.wait;
        const RB = (x.rows || []).filter(bad), RO = (x.rows || []).filter((r) => !bad(r));
        h += RB.map((r) => `<tr class="ds"><th title="${esc(r.d)}">${esc(r.d)}</th>${line(r)}</tr>`).join('');
        if (RO.length) h += `<tr class="ds"><th></th><td colspan="5" class="tx">나머지 ${RO.length}곳 · ${n0(RO.reduce((a, r) => a + (O ? r.p : r.o), 0))}톤 — ${O ? '계획만큼 주문 있음' : '소재 생산 전 확보·도착'}</td></tr>`;
      } else if (O && (x.mkt || []).length) {
        h += `<tr class="ds"><th></th><td colspan="5" class="tx"><b>계획 시장</b> ${x.mkt.slice(0, 5).map(([a, t]) => `${esc(a)} ${n0(t)}`).join(' · ')}<br><b>채운 주문 고객</b> ${(x.cus || []).slice(0, 4).map(([a, t]) => `${esc(a)} ${n0(t)}`).join(' · ') || '–'}</td></tr>`;
      }
      return h;
    };
    const th = O ? '<th>계획(톤)</th><th>수주(톤)</th><th>계획 = 막대 전체</th><th>수주율</th><th>대비할 것(톤)</th>'
      : '<th>채운 주문(톤)</th><th>소재 있음(톤)</th><th>채운 주문 = 막대 전체</th><th>소재율</th><th>대비할 것(톤)</th>';
    const tbl = `<div class="wk-scroll"><table class="wk-t"><colgroup><col style="width:170px"><col style="width:110px"><col style="width:110px"><col><col style="width:90px"><col style="width:330px"></colgroup>
<thead><tr><th></th>${th}</tr></thead><tbody>${w.g.filter((x) => PS.includes(x.pl)).map(row).join('')}</tbody></table></div>`;
    const lg = O ? `<div class="wk-lg"><span><i style="background:var(--m-ok)"></i>주문 있음</span><span><i style="background:var(--m-late)"></i>그중 납기 넘김(생산일이 납기 뒤)</span><span><i style="box-shadow:inset 0 0 0 1.5px var(--m-none)"></i>빈 곳(주문 없음)</span></div>
<div class="wk-ft">계획 = 우리 생산 계획(도금 재계획 · 컬러 통합 계획) · 수주 = 그 주 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 자사 주문·재고 전환 계약 제외</div>`
      : `<div class="wk-lg">${MK.map(([k, t]) => `<span><i style="${k === 'wait' ? 'background:repeating-linear-gradient(135deg,var(--m-wait1) 0 4px,var(--m-wait2) 4px 8px)' : `background:var(--m-${k})`}"></i>${t}</span>`).join('')}</div>
<div class="wk-ft">소재율 = 채운 주문 중 생산 전날까지 소재가 있는 몫(확보 + 제때 입고) · 도금 = 예상 입고(인도기한 + 실측), 컬러 = 발주 인도기한</div>`;
    m.innerHTML = `<div class="wk-top"><h1>주간 ${O ? '수주' : '소재'} 관제</h1><span>${md(K.today)} 기준 · 주 = 수~화 · 계획 ${K.planAt ? md(K.planAt) + ' 재계획' : ''}</span>
<div class="wk-seg">${[['o', '수주'], ['m', '소재']].map(([k, t]) => `<button type="button" data-v="${k}" class="${VIEW === k ? 'on' : ''}">${t}</button>`).join('')}</div>
<div class="wk-seg mo">${MS.map((y) => `<button type="button" data-m="${y}" class="${y === MON ? 'on' : ''}">${+y.slice(5)}월</button>`).join('')}</div></div>
${dash}${strip}<div class="wk-h2">${lab(SEL)} ${md(w.from)}~${md(w.to)}<small>그룹 → 목적지 · 위 칸을 누르면 그 주로 바뀜</small></div>${tbl}${lg}`;
    m.querySelectorAll('[data-i]').forEach((e) => e.addEventListener('click', () => { SEL = +e.dataset.i; render(D); }));
    m.querySelectorAll('[data-v]').forEach((e) => e.addEventListener('click', () => { VIEW = e.dataset.v; try { sessionStorage.setItem('wk-view', VIEW); } catch (x) { /* 무시 */ } render(D); }));
    m.querySelectorAll('[data-m]').forEach((e) => e.addEventListener('click', () => { MON = e.dataset.m; render(D); }));
    m.querySelectorAll('tr.g').forEach((e) => e.addEventListener('click', () => { const g = e.dataset.g; OPEN[g] = OPEN[g] === false; render(D); }));
  }
  let LD = null, SUB = false;
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => render(LD)); } });
})();
