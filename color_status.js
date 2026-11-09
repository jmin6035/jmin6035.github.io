/* 컬러 가동 현황 — 도금 가동 현황(status.html · dashboard.js)과 같은 양식·같은 클래스
   자료: published/integrated.enc.json 의 컬러 부분(tools/integrated_web.py)
   요약 줄 → 핵심 지표 4 → 월별 가동계획 표(라인 합계·그룹·가동시간) → 라인별 편성 | 월별 부하 → 기준일 라인 현황 → 그룹별 월 생산량 → 상세(미편성) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => WD[new Date(d + 'T00:00:00').getDay()];
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  const CG = ['계획재', '주문재', '건재수출', '가전수출', '가전내수', '수요개발'];
  const GL = (g) => (g === '주문재' ? '건재 주문재' : g);          // 판매계획 '③ 주문재' = 컬러건재(국내) 고객 주문 생산분(계획재 아님)
  const GVAR = Object.fromEntries(CG.map((g, i) => [g, `var(--s${i + 1})`]));
  let MONTHS = ['2026-10', '2026-11', '2026-12'], D0 = '2026-10-01', D1 = '2026-12-31';   // 11/9: render 에서 자료(colorLines·color)의 달로 바꿈 — 이 값은 자료 없을 때만
  const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
  let O = null, by = {}, gMonth = null, lastAct = '', dn = {}, dnP = {};
  const KN = { plan: '계획휴지', sd: 'S/D', repair: '수리', clean: '청소', test: 'Test', sample: '샘플', color: '색상교체·청소', roll: '폭·롤 전환', etc: '기타 정지', gap: '기록 없는 정지(TEST 등)' };
  const HARD = ['plan', 'sd', 'repair']; const PLANK = ['plan', 'sd', 'repair', 'clean', 'test', 'sample'];
  const fullDay = (l, d) => sum((dn[`${l}|${d}`] || []).filter((x) => HARD.includes(x[0])), (x) => x[1]) >= 1439;
  const dnTxt = (l, d) => (dn[`${l}|${d}`] || []).map((x) => `${KN[x[0]]} ${fmt(x[1])}분`).join(', ');

  const tot = (c) => sum(Object.values(c.g));
  const monT = (m, l) => sum(O.color.filter((c) => c.d.startsWith(m) && (!l || c.l === l)), tot);
  const cap = (m, l) => ((O.colorLines[m] || {})[l] || {}).plan || 0;
  const placed = (m, l) => ((O.colorLines[m] || {})[l] || {}).placed || 0;
  const load = (m, l) => (cap(m, l) ? placed(m, l) / cap(m, l) : 0);
  const unT = (m) => sum(O.colorUnplaced.filter((u) => !m || u.ym === m), (u) => u.t);
  const daysOf = (m) => { const [y, mo] = m.split('-').map(Number); const n = new Date(y, mo, 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); };
  const localToday = () => { if (window.UI && UI.basis && UI.basis()) return UI.today(); const d = new Date(Date.now() - 7 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function render() {
    by = {}; for (const c of O.color) by[`${c.l}|${c.d}`] = c;
    { const ms = [...new Set(Object.keys(O.colorLines || {}).concat(O.color.map((c) => String(c.d).slice(0, 7))))].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();   // 11/9: 달 목록·계획 기간 = 자료
      if (ms.length) { MONTHS = ms; D0 = ms[0] + '-01'; D1 = daysOf(ms[ms.length - 1]).pop(); } }
    dn = {}; for (const [d, l, k, mn] of O.colorDown || []) (dn[`${l}|${d}`] = dn[`${l}|${d}`] || []).push([k, mn]);
    dnP = Object.assign({}, dn);                                       // 칸 색 = 휴지계획 기준(원래 색 유지, 사용자 10/21) · 숫자·풍선 = 실적
    // 2026-10-21 사용자: 지난 날도 휴지 '계획'(휴지계획 파일)을 보여 주고 있었음 → 실적 날은 MES 실제 휴지(코일·휴지 기록, 기록 없는 시간 = 기록 없는 정지)로. 하루 종일 기록이 없고 계획이 S/D·수리면 계획 이름 유지
    const DA = O.downAct;
    if (DA && DA.days) for (const d of Object.keys(by).map((k) => k.split('|')[1]).concat(Object.keys(DA.days)).filter((x, i, a) => a.indexOf(x) === i)) {
      if (d > DA.asOf || d < D0) continue;   // 11/9: D0 = 자료 첫날
      for (const l of LINES) { const k = `${l}|${d}`, act = (DA.days[d] || {})[l] || [], gap = sum(act.filter((x) => x[0] === 'gap'), (x) => x[1]), plan = (dn[k] || []).filter((x) => HARD.includes(x[0]));
        if (gap >= 1439 && plan.length) dn[k] = plan; else if (act.length) dn[k] = act.map((x) => [x[0], x[1]]); else delete dn[k];
        if (by[k] && by[k].act) by[k] = Object.assign({}, by[k], { min: Math.max(0, 1440 - sum(act, (x) => x[1])) }); }   // 가동시간 = 24h − 실제 휴지(코일 작업 시간) — 휴지와 합이 24h
    }
    lastAct = O.color.filter((c) => c.act).reduce((a, c) => (c.d > a ? c.d : a), '');
    $('d-empty').hidden = true; $('d-body').hidden = false;
    $('d-title').textContent = `'${MONTHS[0].slice(2, 4)}.${MONTHS.map((m) => +m.slice(5)).join('·')}월 컬러 CCL 가동계획`;
    $('d-meta').textContent = [`확정 계획(계획재 = 운영안 반영)`, `계산 ${String(O.built).replace('T', ' ')}`, lastAct && `실적 ~${md(lastAct)}`, `계획 기간 ${D0} ~ ${D1}`].filter(Boolean).join(' · ');   // 11/9: 기간 = 자료
    const kinds = new Set((O.colorDown || []).map((x) => x[2]));
    const leg = Object.keys(KN).filter((k) => kinds.has(k)).map((k) => `<span><i class="sw k-${k}"></i>${KN[k]}</span>`).join('')
      + '<span>· 휴지(h) 행 = 그날 휴지 시간(종류 색), 종일 정지는 블록</span><span><i class="sw" style="background:var(--sd)"></i>가동 없음</span>';
    $('g-legend').innerHTML = leg;
    $('g-tabs').innerHTML = MONTHS.map((m, i) => `<button type="button" data-g="${i}">${+m.slice(5)}월</button>`).join('');
    const t0 = localToday(), ti = MONTHS.indexOf(t0.slice(0, 7)), la = MONTHS.indexOf(lastAct.slice(0, 7));
    renderGantt(gMonth == null ? (ti >= 0 ? ti : la >= 0 ? la : 0) : gMonth);
    renderEvents(); renderLoad(); renderDept(); renderEarly();
    if (!$('d-date').value) $('d-date').value = lastAct && t0 > D1 ? lastAct : (t0 < D0 || t0 > D1 ? D0 : t0);
    $('d-date').min = D0; $('d-date').max = D1;   // 11/9: 기간 = 자료
    renderNow();
    if (window.UI) UI.reveal(document.querySelector('main'));
  }

  // ---------------- 월별 가동계획 표: 라인 합계 행 + 그룹 행 + 가동시간 (도금 표와 같은 클래스) ----------------
  function renderGantt(mi) {
    gMonth = mi;
    document.querySelectorAll('#g-tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.g === mi));
    const m = MONTHS[mi], ds = daysOf(m), today = localToday();
    let h = `<colgroup><col class="cc0"><col class="cc1">${ds.map(() => '<col>').join('')}<col class="ctot"></colgroup><thead><tr><th class="c0" rowspan="2">라인</th><th class="c1" rowspan="2">구분</th>`
      + ds.map((d) => `<th class="${d === today ? 'today' : ''}">${+d.slice(8)}</th>`).join('') + '<th class="tot" rowspan="2">계</th></tr><tr>'
      + ds.map((d) => { const w = wd(d); return `<th class="wk ${w === '토' ? 'sat' : w === '일' ? 'sun' : ''}">${w}</th>`; }).join('') + '</tr></thead><tbody>';
    const rowsOf = (l) => { const gs = CG.filter((g) => ds.some((d) => ((by[`${l}|${d}`] || { g: {} }).g[g] || 0) > 0.5)); return [{ k: 'fam' }].concat(gs.map((g) => ({ k: 'dep', g })), [{ k: 'hrs' }], ds.some((d) => dn[`${l}|${d}`]) ? [{ k: 'stop' }] : []); };
    const kindOf = (l, d) => { const k = (dn[`${l}|${d}`] || []).find((x) => HARD.includes(x[0])); return k ? k[0] : 'repair'; };
    const runsOf = (l) => { const R_ = []; ds.forEach((d, i) => { if (!fullDay(l, d)) return; const kk = kindOf(l, d), r0 = R_[R_.length - 1]; if (r0 && r0[1] === i - 1 && r0[2] === kk) r0[1] = i; else R_.push([i, i, kk]); }); return R_; };
    const RUNS = LINES.map(runsOf), NROW = LINES.map((l) => rowsOf(l).length);
    const same = (li, run) => li >= 0 && li < LINES.length && RUNS[li].some((x) => x[0] === run[0] && x[1] === run[1] && x[2] === run[2]);   // 위·아래 라인이 같은 날 같은 휴지면 한 칸으로 합침(10/22 사용자)
    for (const [li, l] of LINES.entries()) {
      const rows = rowsOf(l);
      rows.forEach((r, ri) => {
        h += `<tr class="r-${r.k}${ri === 0 ? ' first' : ''}">`;
        if (ri === 0) h += `<th class="c0 line" rowspan="${rows.length}">${l}</th>`;
        h += `<th class="c1">${r.k === 'fam' ? '<b>합계</b>' : r.k === 'dep' ? GL(r.g) : r.k === 'hrs' ? '가동시간(h)' : '휴지(h)'}</th>`;
        let t = 0;
        const runs = RUNS[li];
        ds.forEach((d, i) => {
          const run = runs.find((x) => x[0] <= i && i <= x[1]);
          if (run) {
            if (ri === 0 && i === run[0] && !same(li - 1, run)) {
              let lj = li, rs = 0; while (lj === li || same(lj, run)) { rs += NROW[lj]; lj++; }
              const kk = run[2], n = run[1] - run[0] + 1, ls = LINES.slice(li, lj);
              h += `<td class="sdblock k-${kk}${n === 1 ? ' one' : ''}" colspan="${n}" rowspan="${rs}" title="${esc(ls.map((x) => `${x} ${dnTxt(x, d)}`).join(' / '))}">${KN[kk]}<small>${md(ds[run[0]])}${run[1] > run[0] ? '~' + md(ds[run[1]]) : ''}</small><small>${n * 24}h</small>${ls.length > 1 ? `<small>${ls.join('·')}</small>` : ''}</td>`;
            }
            return;
          }
          const c = by[`${l}|${d}`], T = c ? tot(c) : 0, idle = T < 0.5;
          let v = 0, txt = '';
          if (r.k === 'fam') { v = T; txt = idle ? '' : String(Math.round(v)); }
          else if (r.k === 'dep') { v = c ? c.g[r.g] || 0 : 0; txt = v > 0.5 ? String(Math.round(v)) : ''; }   // 일별 칸은 쉼표 없이
          else if (r.k === 'hrs') { const u = c ? Math.min(1440, c.min || 0) / 60 : 0; txt = u > 0 ? u.toFixed(1) : ''; }
          else { const m0 = sum(dn[`${l}|${d}`] || [], (x) => x[1]); txt = m0 > 0 ? (m0 / 60).toFixed(m0 % 60 ? 1 : 0) : ''; }
          t += v;
          const part = dn[`${l}|${d}`], pp = dnP[`${l}|${d}`], pk0 = pp ? pp.slice().sort((a, b) => b[1] - a[1])[0] : null, pk = pk0 ? pk0[0] : '';   // 그날 가장 긴 휴지 종류의 색(계획 휴지 6종만 — 실적의 색상교체·롤·기타·기록 없는 정지는 색 없이 숫자만, 사용자 10/21 원래 색 유지)
          const cls = [idle ? 'idle' : '', pk ? (r.k === 'stop' ? `k-${pk}` : `kt-${pk}`) : '', d === today ? 'today' : '', c && c.act ? 'act' : ''].filter(Boolean).join(' ');
          h += `<td class="${cls}" style="--ci:${i}" data-d="${d}"${part ? ` title="${esc(dnTxt(l, d))}"` : ''}>${txt}</td>`;
        });
        h += `<td class="tot">${r.k === 'hrs' ? '' : r.k === 'stop' ? fmt(sum(ds, (d) => sum(dn[`${l}|${d}`] || [], (x) => x[1])) / 60) : fmt(t)}</td></tr>`;
      });
    }
    $('g-table').innerHTML = h + '</tbody>';
    { const r0 = $('g-table').tHead && $('g-table').tHead.rows[0]; if (r0) $('g-table').style.setProperty('--h1', r0.getBoundingClientRect().height + 'px'); }
    const wrap = document.querySelector('.gtable-wrap'), ti = ds.indexOf(today);
    if (wrap && wrap.scrollWidth > wrap.clientWidth) { const hs = $('g-table').querySelectorAll('thead tr:first-child th'), th = hs[2 + Math.max(0, ti - 1)], stick = hs[0].offsetWidth + hs[1].offsetWidth; wrap.scrollLeft = ti > 0 && th ? th.getBoundingClientRect().left - $('g-table').getBoundingClientRect().left - stick : 0; }
  }
  $('g-tabs').onclick = (ev) => { if (ev.target.dataset.g != null) renderGantt(+ev.target.dataset.g); };
  $('g-table').addEventListener('click', (ev) => { const td = ev.target.closest('td[data-d]'); if (!td) return; $('d-date').value = td.dataset.d; renderNow(); $('d-now').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  // 한도까지 못 채운 이유: 이 라인에서 만들 수 있는 품목이 미편성으로 남아 있으면 '가동시간 부족'(수리·정지 등), 아니면 '배정 가능 물량 없음'
  const shortWhy = (m, l) => (O.colorUnplaced || []).some((x) => x.ym === m && String(x.lines).split('·').includes(l)) ? '가동시간 부족' : '배정할 물량 없음';
  function renderEvents() {                                      // 도금 '강종 전환 일정' 자리: 라인별 편성 / MES 월차 한도
    $('d-events').innerHTML = `<tr><th>라인</th>${MONTHS.map((m) => `<th>${+m.slice(5)}월 편성 / 한도</th>`).join('')}</tr>`
      + LINES.map((l) => `<tr class="evrow"><td>${l}</td>${MONTHS.map((m) => { const g = cap(m, l) - placed(m, l); return `<td>${fmt(placed(m, l))} / ${fmt(cap(m, l))}${g > 50 ? ` <span class="pill warn" title="MES 월차까지 ${fmt(g)}t 남음 — ${shortWhy(m, l)}">${fmt(g)}t 남음 · ${shortWhy(m, l)}</span>` : ''}</td>`; }).join('')}</tr>`).join('')
      + `<tr class="evrow"><td><b>계</b></td>${MONTHS.map((m) => `<td><b>${fmt(sum(LINES, (l) => placed(m, l)))}</b> / ${fmt(sum(LINES, (l) => cap(m, l)))}</td>`).join('')}</tr>`;
  }
  function renderLoad() {
    $('d-load').innerHTML = LINES.map((l) => `<div class="load-grp"><b>${l}</b>` + MONTHS.map((m) => {
      const v = load(m, l);
      return `<div class="load-row"><span>${+m.slice(5)}월</span><div class="load-track"><div class="load-fill ${v >= 0.995 ? 'full' : ''}" style="width:${Math.min(100, v * 100)}%"></div><div class="load-100"></div></div><span class="n">${fmt(v * 100, 1)}%</span></div>`;
    }).join('') + '</div>').join('') + '<p class="hint">부하 = 편성 ÷ MES 월차 한도. 강조 색 막대 = 한도까지 채움(100%). 오른쪽 세로선 = 100%.</p>';
  }

  function renderNow() {
    const d = $('d-date').value; if (!d) return;
    const m = d.slice(0, 7), mm = +m.slice(5), nd = daysOf(m).length, el = +d.slice(8) / nd;
    const dd = (x) => Math.round((new Date(x) - new Date(d)) / 864e5);
    $('d-now').innerHTML = LINES.map((l) => {
      const c = by[`${l}|${d}`], T = c ? tot(c) : 0, hrs = c ? Math.min(1440, c.min || 0) / 60 : 0;
      const gs = c ? Object.entries(c.g).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]) : [];
      const pa = {}; if (c) for (const r of c.rows) pa[r[1]] = (pa[r[1]] || 0) + (+r[5] || 0);
      const items = Object.entries(pa).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `<li><span>${esc(k)}</span><b>${fmt(v)}t</b></li>`).join('');
      const toDate = sum(O.color.filter((x) => x.l === l && x.d.startsWith(m) && x.d <= d), tot), mPlan = monT(m, l), mc = cap(m, l);
      const next = O.color.filter((x) => x.l === l && x.d > d && tot(x) < 0.5).map((x) => x.d)[0];
      const nx = (O.colorDown || []).filter((x) => x[1] === l && x[0] > d && HARD.includes(x[2])).sort((a, b) => (a[0] < b[0] ? -1 : 1))[0];
      const off = !c || T < 0.5, st = off ? ['비가동', 'bad'] : c.act ? ['실적', 'good'] : ['계획', 'info'];
      const pr = mc ? Math.min(1, toDate / mc) : 0;
      const chips = [dnTxt(l, d) ? `<span class="tag warn">당일 ${esc(dnTxt(l, d))}</span>` : '',
        nx ? `<span class="tag ${dd(nx[0]) <= 7 ? 'bad' : ''}">${KN[nx[2]]} ${md(nx[0])} · D-${dd(nx[0])}</span>` : '<span class="tag">4분기 S/D·수리 없음</span>',
        next ? `<span class="tag">비가동 ${md(next)} · D-${dd(next)}</span>` : ''].filter(Boolean).join('');
      return `<div class="ln-card${off ? ' off' : ''}"><div class="ln-h"><b>${l}</b><span class="tag ${st[1]}">${st[0]}</span></div>
        <div class="ln-big">${off ? '-' : fmt(T)}<small>t</small><span>${off ? '당일 생산 없음' : `가동 ${fmt(hrs, 1)}h / 24h`}</span></div>
        <div class="ln-gauge" title="가동시간"><i style="width:${Math.min(100, hrs / 24 * 100)}%"></i></div>
        <p class="ln-l">그룹 구성</p>
        <div class="ln-mix">${gs.length ? gs.map(([g, v]) => `<i style="flex:${v};background:${GVAR[g]}" title="${GL(g)} ${fmt(v)}t"></i>`).join('') : '<i style="flex:1;background:var(--grid)"></i>'}</div>
        <div class="ln-mixl">${gs.map(([g, v]) => `<span><i style="background:${GVAR[g]}"></i>${GL(g)} ${fmt(v)}t</span>`).join('') || '<span class="muted">-</span>'}</div>
        ${items ? `<p class="ln-l">주요 품목</p><ul class="ln-items">${items}</ul>` : ''}
        <p class="ln-l">${mm}월 진도 <span>${fmt(toDate)} / 월차 ${fmt(mc)}t · ${Math.round(pr * 100)}%</span></p>
        <div class="ln-prog" title="세로선 = 경과일 ${Math.round(el * 100)}%"><i style="width:${pr * 100}%"></i><u style="left:${el * 100}%"></u></div>
        <p class="ln-sub">계획 편성 ${fmt(mPlan)}t · 세로선 = 경과일(${Math.round(el * 100)}%)</p>
        <div class="ln-chips">${chips}</div></div>`;
    }).join('');
  }
  $('d-date').onchange = () => O && renderNow();

  function renderDept() {
    const t = {}; for (const c of O.color) for (const [g, v] of Object.entries(c.g)) { const k = `${g}|${c.d.slice(0, 7)}`; t[k] = (t[k] || 0) + v; }
    const un = {}; for (const u of O.colorUnplaced) un[u.g] = (un[u.g] || 0) + u.t;
    const rows = CG.map((g) => { const v = MONTHS.map((m) => t[`${g}|${m}`] || 0); return { g, v, s: sum(v), u: un[g] || 0 }; });
    const mx = Math.max(...rows.map((r) => r.s + r.u), 1);
    const SH = [0.45, 0.7, 1];                                        // 10·11·12월 = 같은 그룹색의 옅음→진함
    $('d-dept').innerHTML = `<div class="gm-leg">${MONTHS.map((m, i) => `<span><i style="background:var(--ink-2);opacity:${SH[i]}"></i>${+m.slice(5)}월</span>`).join('')}<span><i class="hatch"></i>미편성</span></div>`
      + rows.map((r) => `<div class="gm-row"><div class="gm-n"><i style="background:${GVAR[r.g]}"></i>${GL(r.g)}</div>
        <div class="gm-bar">${r.v.map((v, i) => (v > 0 ? `<i style="width:${v / mx * 100}%;background:color-mix(in srgb, ${GVAR[r.g]} ${SH[i] * 100}%, var(--surface));color:${i < 2 ? 'var(--ink)' : '#fff'};text-shadow:${i < 2 ? 'none' : ''}" title="${GL(r.g)} ${+MONTHS[i].slice(5)}월 ${fmt(v)}t">${v / mx > 0.07 ? fmt(v) : ''}</i>` : '')).join('')}${r.u > 0.5 ? `<i class="hatch" style="width:${r.u / mx * 100}%" title="미편성 ${fmt(r.u)}t">${r.u / mx > 0.07 ? fmt(r.u) : ''}</i>` : ''}</div>
        <div class="gm-t"><b>${fmt(r.s)}t</b>${r.u > 0.5 ? `<span class="neg">미편성 ${fmt(r.u)}t</span>` : '<span class="muted">미편성 없음</span>'}</div></div>`).join('')
      + `<div class="gm-row gm-tot"><div class="gm-n">합계</div><div class="gm-sum">${MONTHS.map((m) => `<span>${+m.slice(5)}월 <b>${fmt(monT(m))}t</b></span>`).join('')}</div><div class="gm-t"><b>${fmt(sum(MONTHS, (m) => monT(m)))}t</b><span class="neg">미편성 ${fmt(unT())}t</span></div></div>`;
  }
  function renderEarly() {
    const U = O.colorUnplaced.slice().sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : b.t - a.t));
    $('d-early').innerHTML = '<tr><th>월</th><th>그룹</th><th>품명</th><th>고객·목적지</th><th>가능 라인</th><th>톤</th></tr>'
      + (U.map((u) => `<tr><td>${+u.ym.slice(5)}월${u.carry ? ` → ${+u.carry.slice(5)}월 이월` : ''}</td><td>${esc(GL(u.g))}</td><td>${esc(u.p)}</td><td>${esc(u.c || '')}${u.dest ? ' · ' + esc(u.dest) : ''}</td><td>${esc(u.lines || '')}</td><td class="n">${fmt(u.t)}</td></tr>`).join('') || '<tr><td colspan="6">없음</td></tr>');
  }

  // ---------------- 자료 열기(분석 암호) ----------------
  let env = null;
  const envReady = GP.latest('integrated.enc.json');
  /* 지난 날짜 = MES 실적(사내 PC 가 매일 계획 그룹으로 분류해 게시: color_actual.enc.json 의 byGroup). 통합 계획 파일은 계산할 때만 바뀌므로 실적은 여기서 덮어씀 */
  async function overlayActual(pw) {
    try {
      const e = await GP.latest('color_actual.enc.json'); if (!e) return;
      const AA = await GP.decryptJSON(e, pw), A = AA.byGroup; O.downAct = AA.downAct || null; if (!A || !A.days) return;
      const idx = {}; O.color.forEach((c, i) => { idx[`${c.l}|${c.d}`] = i; });
      for (const [d, L] of Object.entries(A.days)) {
        if (d < D0 || d > D1) continue;   // 11/9: 기간 = 자료
        for (const [l, [g, mn, prods]] of Object.entries(L)) {
          const c = { d, l, g, act: true, min: mn, rows: (prods || []).map(([p, t]) => ['실적', p, '', '', '', t]) };
          if (idx[`${l}|${d}`] != null) O.color[idx[`${l}|${d}`]] = Object.assign({}, O.color[idx[`${l}|${d}`]], c); else O.color.push(c);
        }
        for (const l of LINES) if (!L[l] && idx[`${l}|${d}`] != null && d <= A.asOf) O.color[idx[`${l}|${d}`]] = Object.assign({}, O.color[idx[`${l}|${d}`]], { g: {}, act: true, min: 0, rows: [] });   // 실적 날인데 생산 없음 = 비가동
      }
      O.actualTo = A.asOf;
    } catch (err) { /* 실적 덮어쓰기 실패해도 계획 표는 그대로 */ }
  }
  async function unlock(pw) {
    if (!env) env = await envReady;
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } await overlayActual(pw); render(); }
    catch (e) { $('d-unlock').hidden = false; $('d-unlock-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; }
  }
  $('d-unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('d-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('d-unlock').hidden = false;
  }).catch(() => { $('d-empty-text').textContent = '게시된 통합 가동계획을 찾을 수 없습니다'; });
})();
