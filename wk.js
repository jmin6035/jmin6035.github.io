/* 03 생산 편성 · 주간 관제(11/17 사용자 '소재랑 생산(수주) 합쳐 · 수주 입장에서 관리되게 · 색 절제')
   숫자 = suju.enc.json 의 wk8(tools/suju_build.py week_check, 2시간 갱신)
   한 칸 = 한 그룹의 한 주. 막대 전체 = 우리 생산 계획, 그 안을 채운 주문의 소재 상태로 나눔:
     확보·제때 입고(회색) · 늦게 입고(주황) · 소재 없음(빨강) · 예정일 없음(빗금) · 빈 곳 = 주문 없음(테두리만)
   칸을 누르면 오른쪽에 할 일: 빈 목적지(수주 독려) · 챙길 주문(담당자별, 늦게 입고·소재 없음·납기 넘김) */
(function () {
  'use strict';
  const { esc, n0 } = CT;
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const Y0 = new Date().getFullYear();
  const md = (s) => (s ? `${+s.slice(0, 4) !== Y0 && +s.slice(0, 4) !== Y0 + 1 ? `'${s.slice(2, 4)}.` : ''}${+s.slice(5, 7)}/${+s.slice(8)}` : '');
  const addd = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const KEYS = ['p', 'o', 'dl', 'ok', 'on', 'late', 'wait', 'none'];
  const tot = (L) => Object.fromEntries(KEYS.map((k) => [k, L.reduce((a, x) => a + (x[k] || 0), 0)]));
  const risk = (v) => (v.late || 0) + (v.none || 0) + (v.wait || 0);
  const KN = { none: '소재 없음', late: '늦게 입고', wait: '입고 예정일 없음', dl: '납기 넘김' };
  function bar(v) {
    const p = v.p || 0; if (!p) return '<div class="kb"></div>';
    const seg = [['ok', (v.ok || 0) + (v.on || 0)], ['late', v.late], ['none', v.none], ['wait', v.wait], ['gap', Math.max(0, p - v.o)]];
    return `<div class="kb">${seg.filter(([, t]) => t > 0.5).map(([k, t]) => `<i class="${k}" style="width:${(t / p * 100).toFixed(1)}%"></i>`).join('')}</div>`;
  }
  let MON = null, SEL = null, MAN = null;
  function render(D) {
    const S = D.suju || {}, K = S.wk8, m = document.getElementById('ct-main');
    if (!K) { m.innerHTML = '<section class="card"><h2>주간 관제 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const sc = window.UI && UI.scope ? UI.scope() : 'all', PS = sc === 'G' ? ['G'] : sc === 'C' ? ['C'] : ['G', 'C'];
    const W = K.weeks.map((w, i) => ({ ...w, i, ym: addd(w.from, 3).slice(0, 7) }));
    const MS = [...new Set(W.map((w) => w.ym))];
    if (!MS.includes(MON)) MON = MS[0];
    const WM = W.filter((w) => w.ym === MON);
    const G = W[0].g.filter((x) => PS.includes(x.pl)).map((x) => x.g);
    const cellOf = (w, g) => w.g.find((x) => x.g === g);
    // 고른 칸이 이 달에 없으면 문제가 가장 큰 칸(빈 곳 + 소재 위험)
    if (!SEL || !WM.some((w) => w.i === SEL[0]) || !G.includes(SEL[1])) {
      let best = null;
      WM.forEach((w) => G.forEach((g) => { const x = cellOf(w, g); if (!x || !x.p) return; const s_ = (x.p - x.o) + risk(x); if (!best || s_ > best[2]) best = [w.i, g, s_]; }));
      SEL = best ? [best[0], best[1]] : [WM[0].i, G[0]];
      MAN = null;
    }
    const lab = (i) => (i === 0 ? '이번 주' : `W+${i}`);
    const all = tot(WM.flatMap((w) => w.g.filter((x) => PS.includes(x.pl))));
    const fo = pc(all.o, all.p), rk = risk(all);
    const kpi = `<div class="k-kpi">
<div><div class="l">${+MON.slice(5)}월 생산 계획</div><div class="v">${n0(all.p)}<small>톤</small></div><div class="s">${WM.length}주 · ${md(WM[0].from)}~${md(WM[WM.length - 1].to)}</div></div>
<div><div class="l">수주율</div><div class="v ${fo < 90 ? 'bad' : ''}">${fo ?? '–'}<small>%</small></div><div class="s">계획 칸을 채운 주문 ${n0(all.o)}톤</div></div>
<div><div class="l">빈 곳 · 수주 필요</div><div class="v ${all.p - all.o > 0.5 ? 'bad' : ''}">${n0(Math.max(0, all.p - all.o))}<small>톤</small></div><div class="s">계획은 있는데 주문이 없음</div></div>
<div><div class="l">소재 위험</div><div class="v ${rk > 0.5 ? 'warn' : ''}">${n0(rk)}<small>톤</small></div><div class="s">늦게 입고 ${n0(all.late)} · 없음 ${n0(all.none + all.wait)}</div></div></div>`;
    const cell = (w, g) => {
      const x = cellOf(w, g), sel = SEL[0] === w.i && SEL[1] === g;
      if (!x || !x.p) return '<td><div class="k-cell na">계획 없음</div></td>';
      const f = Math.min(100, pc(x.o, x.p)), gap = Math.max(0, x.p - x.o), r = risk(x);
      const q = [gap > 0.5 ? `빈 곳 ${n0(gap)}` : '', r > 0.5 ? `소재 ${n0(r)}` : ''].filter(Boolean).join('<br>') || '문제 없음';
      return `<td><div class="k-cell${sel ? ' sel' : ''}" data-w="${w.i}" data-g="${esc(g)}"><div class="p"><b class="${f < 90 ? 'bad' : ''}">${f}%</b></div>${bar(x)}<div class="q ${gap > 0.5 ? 'bad' : r > 0.5 ? 'warn' : ''}">${q}</div></div></td>`;
    };
    let lastPl = null;
    const rows = G.map((g) => { const pl = W[0].g.find((x) => x.g === g).pl, first = lastPl !== null && pl !== lastPl; lastPl = pl; return `<tr class="${first ? 'pl' : ''}"><th class="${pl}">${esc(g)}</th>${WM.map((w) => cell(w, g)).join('')}</tr>`; }).join('');
    const mat = `<div class="k-card"><h2>그룹별 주간 계획 대비 수주·소재<small>칸을 누르면 오른쪽에 할 일</small></h2><div class="k-scroll"><table class="k-m"><colgroup><col style="width:96px">${WM.map(() => '<col>').join('')}</colgroup>
<thead><tr><th></th>${WM.map((w) => `<th class="${w.i === 0 ? 'cur' : ''}">${lab(w.i)}<small>${md(w.from)}~${md(w.to)}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<div class="k-lg"><span><i style="background:var(--k-ok)"></i>주문·소재 있음</span><span><i style="background:var(--k-late)"></i>소재 늦게 입고</span><span><i style="background:var(--k-none)"></i>소재 없음</span><span><i style="background:repeating-linear-gradient(135deg,var(--k-hatch) 0 3px,transparent 3px 6px)"></i>입고 예정일 없음</span><span><i style="box-shadow:inset 0 0 0 1px #9ca3af"></i>빈 곳(주문 없음)</span></div></div>`;
    const w = W[SEL[0]], x = cellOf(w, SEL[1]);
    const gap = Math.max(0, x.p - x.o);
    const gaps = (x.rows || []).filter((r) => r.p - r.o > 0.5).sort((a, b) => (b.p - b.o) - (a.p - a.o));
    const iss = x.iss || [];
    const mans = Object.entries(iss.reduce((a, it) => { const k = it.man || '담당 미정'; a[k] = (a[k] || 0) + it.t; return a; }, {})).sort((a, b) => b[1] - a[1]);
    const IS = MAN ? iss.filter((it) => (it.man || '담당 미정') === MAN) : iss;
    const gapHtml = x.pl === 'G'
      ? (gaps.length ? gaps.map((r) => `<div class="k-li"><div class="n"><span class="k-tag gap">빈 곳</span>${esc(r.d)}</div><div class="t bad">${n0(r.p - r.o)}t</div><div class="d">계획 ${n0(r.p)}t 중 주문 ${n0(r.o)}t</div></div>`).join('') : '<div class="k-more">빈 목적지 없음 — 계획만큼 주문 있음</div>')
      : (gap > 0.5 ? `<div class="k-li"><div class="n"><span class="k-tag gap">빈 곳</span>${esc(x.g)} 전체</div><div class="t bad">${n0(gap)}t</div><div class="d">계획 시장 ${(x.mkt || []).slice(0, 4).map(([a, t]) => `${esc(a)} ${n0(t)}`).join(' · ')}</div></div>` : '<div class="k-more">빈 곳 없음 — 계획만큼 주문 있음</div>');
    // 같은 목적지·문제·담당자는 한 줄로(계약 여러 건)
    const AG = Object.values(IS.reduce((a, it) => { const k = `${it.k}|${it.dst || it.cus}|${it.man || ''}`; const g = a[k] || (a[k] = { k: it.k, dst: it.dst || it.cus || '', man: it.man || '담당 미정', t: 0, n: 0, pd: [], due: [], eta: [], con: [] }); g.t += it.t; g.n += 1; g.pd.push(it.pd); g.due.push(it.due); if (it.eta) g.eta.push(it.eta); g.con.push(it.con); return a; }, {}))
      .sort((a, b) => ['none', 'late', 'wait', 'dl'].indexOf(a.k) - ['none', 'late', 'wait', 'dl'].indexOf(b.k) || b.t - a.t);
    const rng = (L) => { const s_ = [...L].filter(Boolean).sort(); return !s_.length ? '' : s_[0] === s_[s_.length - 1] ? md(s_[0]) : `${md(s_[0])}~${md(s_[s_.length - 1])}`; };
    const issHtml = AG.length ? AG.slice(0, 12).map((g) => `<div class="k-li" title="${esc(g.con.join(', '))}"><div class="n"><span class="k-tag ${g.k}">${KN[g.k]}</span>${esc(g.dst)}</div><div class="t">${n0(g.t)}t</div>
<div class="d">${esc(g.man)} · ${g.n}건 · 생산 ${rng(g.pd)}${g.eta.length ? ` · 예상 입고 ${rng(g.eta)}` : ''} · 납기 ${rng(g.due)}</div></div>`).join('') + (AG.length > 12 ? `<div class="k-more">외 ${AG.length - 12}줄 · ${n0(AG.slice(12).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : '<div class="k-more">챙길 주문 없음</div>';
    const side = `<div class="k-card k-side"><h2>${esc(x.g)} · ${lab(w.i)}<small>${md(w.from)}~${md(w.to)}</small></h2>
<div class="sum"><span>계획 <b>${n0(x.p)}</b>t</span><span>수주 <b class="${pc(x.o, x.p) < 90 ? 'bad' : ''}">${pc(x.o, x.p)}%</b></span><span>소재 있음 <b>${n0((x.ok || 0) + (x.on || 0))}</b>t</span>${x.dl > 0.5 ? `<span>납기 넘김 <b>${n0(x.dl)}</b>t</span>` : ''}</div>${bar(x)}
<h3>수주 독려 — 빈 곳<span>${n0(gap)}t</span></h3>${gapHtml}
<h3>챙길 주문<span>${n0(iss.reduce((a, it) => a + it.t, 0))}t · ${iss.length}건</span></h3>
${mans.length > 1 ? `<div class="k-man"><button type="button" data-man="" class="${MAN ? '' : 'on'}">전체</button>${mans.map(([k, t]) => `<button type="button" data-man="${esc(k)}" class="${MAN === k ? 'on' : ''}">${esc(k)}<b>${n0(t)}</b></button>`).join('')}</div>` : ''}${issHtml}</div>`;
    m.innerHTML = `<div class="k-top"><h1>주간 관제</h1><span class="as">${md(K.today)} 기준 · 주 = 수~화 · 계획 = ${K.planAt ? md(K.planAt) + ' 재계획' : '재계획'}·통합 계획</span>
<div class="k-mo">${MS.map((y) => `<button type="button" data-m="${y}" class="${y === MON ? 'on' : ''}">${+y.slice(5)}월</button>`).join('')}</div></div>
${kpi}<div class="k-body">${mat}${side}</div>
<div class="k-ft">수주 = 그 주 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 소재 있음 = 생산 전날까지 확보·입고(도금 예상 입고, 컬러 발주 인도기한) · 컬러는 계획이 시장 단위라 그룹 전체로 채움 · 자사 주문·재고 전환 계약 제외</div>`;
    m.querySelectorAll('[data-m]').forEach((e) => e.addEventListener('click', () => { MON = e.dataset.m; SEL = null; render(D); }));
    m.querySelectorAll('.k-cell[data-w]').forEach((e) => e.addEventListener('click', () => { SEL = [+e.dataset.w, e.dataset.g]; MAN = null; render(D); }));
    m.querySelectorAll('[data-man]').forEach((e) => e.addEventListener('click', () => { MAN = e.dataset.man || null; render(D); }));
  }
  let LD = null, SUB = false;
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => { SEL = null; render(LD); }); } });
})();
