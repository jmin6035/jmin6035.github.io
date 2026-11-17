/* 03 생산 편성 · 주간 관제(11/17 사용자 '이번 주 총 몇 톤 계획, 부서별로 얼마, 부서별 소재·부자재 준비, 그래서 수주에서 마케팅·소재·공정출하에 뭘 독촉할지')
   숫자 = suju.enc.json 의 wk8(tools/suju_build.py week_check, 2시간 갱신)
   · 계획 = 우리 생산 계획(도금 재계획 그룹·목적지·강종 일 계획, 컬러 통합 계획)의 그 주(수~화) 합
   · 주문 = 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 빈 곳 = 계획 − 주문 → 마케팅
   · 소재 = 채운 주문의 소재: 확보 · 입고 예정(생산 전날까지) · 늦게 입고 · 없음 → 소재
   · 부자재 = 컬러 소재 확보 주문의 도료·필름(1020 부자재 상태): 준비 · 대기 → 소재(부자재) · 도금은 주문 단위 부자재 없음
   · 납기 넘김 = 계획대로 만들면 생산일이 납기 뒤 → 공정·출하 */
(function () {
  'use strict';
  const { esc, n0 } = CT;
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const Y0 = new Date().getFullYear();
  const md = (s) => (s ? `${+s.slice(0, 4) !== Y0 && +s.slice(0, 4) !== Y0 + 1 ? `'${s.slice(2, 4)}.` : ''}${+s.slice(5, 7)}/${+s.slice(8)}` : '');
  const KEYS = ['p', 'o', 'dl', 'ok', 'on', 'late', 'wait', 'none', 'so', 'sw', 'sb', 'sn'];
  const tot = (L) => Object.fromEntries(KEYS.map((k) => [k, L.reduce((a, x) => a + (x[k] || 0), 0)]));
  const DEPT = [['도금수출', ['도금수출'], 'G'], ['도금판매', ['도금국내'], 'G'], ['자동차강판', ['자동차'], 'G'], ['컬러수출', ['컬러수출', '가전내수'], 'C'], ['컬러건재', ['컬러건재'], 'C'], ['수요개발', ['수요개발'], 'C']];
  const KN = { none: '소재 없음', late: '소재 늦게 입고', wait: '입고 예정일 없음', sub: '부자재 대기', dl: '납기 넘김' };
  function bar(v) {
    const p = v.p || 0; if (!p) return '<div class="kb"></div>';
    const seg = [['ok', (v.ok || 0) + (v.on || 0)], ['late', v.late], ['none', v.none], ['wait', v.wait], ['gap', Math.max(0, p - v.o)]];
    return `<div class="kb">${seg.filter(([, t]) => t > 0.5).map(([k, t]) => `<i class="${k}" style="width:${(t / p * 100).toFixed(1)}%"></i>`).join('')}</div>`;
  }
  let SEL = 0;
  function render(D) {
    const S = D.suju || {}, K = S.wk8, m = document.getElementById('ct-main');
    if (!K) { m.innerHTML = '<section class="card"><h2>주간 관제 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const sc = window.UI && UI.scope ? UI.scope() : 'all', PS = sc === 'G' ? ['G'] : sc === 'C' ? ['C'] : ['G', 'C'];
    const W = K.weeks, lab = (i) => (i === 0 ? '이번 주' : i === 1 ? '차주(W+1)' : `W+${i}`);
    const DP = DEPT.filter((d) => PS.includes(d[2]));
    const dv = (w, d) => { const L = w.g.filter((x) => d[1].includes(x.g)); return { ...tot(L), iss: L.flatMap((x) => (x.iss || []).map((it) => ({ ...it, dept: d[0] }))), rows: L.flatMap((x) => (x.rows || []).map((r) => ({ ...r, dept: d[0] }))), mkt: L.flatMap((x) => x.mkt || []), pl: d[2] }; };
    const wk = (w) => tot(DP.map((d) => dv(w, d)));
    // 주 고르기(칩) — 칩마다 계획·주문%·소재%
    const chips = `<div class="k-wk">${W.map((w, i) => { const v = wk(w), f = pc(v.o, v.p), ms = pc(v.ok + v.on, v.p); return `<button type="button" data-i="${i}" class="${i === SEL ? 'on' : ''}"><b>${lab(i)}</b><span>${md(w.from)}~${md(w.to)}</span><div class="mm">${v.p ? `<span>${n0(v.p)}t</span><span class="${f < 90 ? 'bad' : ''}">주문 ${f}%</span><span class="${ms < 50 ? 'bad' : ms < 80 ? 'warn' : ''}">소재 ${ms}%</span>` : '<span>계획 없음</span>'}</div></button>`; }).join('')}</div>`;
    const w = W[SEL], V = DP.map((d) => [d, dv(w, d)]), T = tot(V.map(([, v]) => v));
    const sub = T.so + T.sw + T.sb + T.sn;
    const kpi = `<div class="k-kpi">
<div><div class="l">${lab(SEL)} 생산 계획 · ${md(w.from)}~${md(w.to)}</div><div class="v">${n0(T.p)}<small>톤</small></div><div class="s">${DP.map(([n], i) => `${n} ${n0(V[i][1].p)}`).filter((_, i) => V[i][1].p).join(' · ')}</div></div>
<div><div class="l">주문 확보</div><div class="v ${pc(T.o, T.p) < 90 ? 'bad' : ''}">${pc(T.o, T.p) ?? '–'}<small>%</small></div><div class="s">${n0(T.o)}톤 · 빈 곳 ${n0(Math.max(0, T.p - T.o))}톤</div></div>
<div><div class="l">소재 준비(생산 전날까지)</div><div class="v ${pc(T.ok + T.on, T.p) < 50 ? 'bad' : pc(T.ok + T.on, T.p) < 80 ? 'warn' : ''}">${pc(T.ok + T.on, T.p) ?? '–'}<small>%</small></div><div class="s">확보 ${n0(T.ok)} · 입고 예정 ${n0(T.on)} · 늦음 ${n0(T.late)} · 없음 ${n0(T.none + T.wait)}</div></div>
<div><div class="l">부자재 준비(컬러)</div><div class="v ${sub && pc(T.so, sub) < 80 ? 'warn' : ''}">${sub ? pc(T.so, sub) : '–'}<small>%</small></div><div class="s">${sub ? `준비 ${n0(T.so)} · 대기 ${n0(T.sw + T.sb)} · 지시 전 ${n0(T.sn)}` : '도금은 주문 단위 부자재 없음'}</div></div></div>`;
    // 부서별 준비 현황
    const z = (v, c) => (v > 0.5 ? `<td class="${c || ''}">${n0(v)}</td>` : '<td class="z">–</td>');
    const drow = ([d, v], tt) => !v.p && !tt ? `<tr><th class="${d[2]}">${d[0]}</th><td colspan="11" class="na">이 주 계획 없음</td></tr>`
      : `<tr class="${tt ? 'tot' : ''}"><th class="${tt ? '' : d[2]}">${tt ? '합계' : d[0]}</th><td>${n0(v.p)}</td>${z(v.o)}${z(Math.max(0, v.p - v.o), 'bad')}<td class="sep ${pc(v.ok + v.on, v.o) < 50 ? 'bad' : pc(v.ok + v.on, v.o) < 80 ? 'warn' : ''}">${v.o ? pc(v.ok + v.on, v.o) + '%' : '–'}</td>${z(v.ok)}${z(v.on)}${z(v.late, 'warn')}${z(v.none + v.wait, 'bad')}${d && d[2] === 'G' && !tt ? '<td class="sep z">–</td><td class="z">–</td>' : `<td class="sep">${v.so + v.sw + v.sb > 0.5 ? n0(v.so) : '–'}</td>${z(v.sw + v.sb, 'warn')}`}${z(v.dl, 'warn')}</tr>`;
    const dtab = `<div class="k-card"><h2>부서별 준비 현황<small>톤 · 계획대로 만들 때</small></h2><div class="k-dscroll"><table class="k-d">
<thead><tr class="grp"><th></th><th colspan="3" class="gs">주문</th><th colspan="5" class="gs">소재</th><th colspan="2" class="gs">부자재(컬러)</th><th class="gs">공정·출하</th></tr>
<tr><th></th><th>계획</th><th>주문</th><th>빈 곳</th><th class="sep">준비율</th><th>확보</th><th>입고 예정</th><th>늦게 입고</th><th>없음</th><th class="sep">준비</th><th>대기</th><th>납기 넘김</th></tr></thead>
<tbody>${V.map((x) => drow(x)).join('')}${drow([null, T], true)}</tbody></table></div>
<div class="k-lg"><span>준비율 = 주문 중 생산 전날까지 소재가 있는 몫(확보 + 입고 예정)</span><span class="bad">빨강 = 빈 곳·소재 없음</span><span class="warn">주황 = 늦게 입고·부자재 대기·납기 넘김</span></div></div>`;
    // 독촉할 곳: 마케팅(빈 곳) · 소재(늦음·없음·부자재 대기) · 공정·출하(납기 넘김)
    const ALL = V.flatMap(([, v]) => v.iss);
    const grp = (L) => Object.values(L.reduce((a, it) => { const k = `${it.dept}|${it.k}|${it.dst || it.cus}|${it.man || ''}`; const g = a[k] || (a[k] = { ...it, t: 0, n: 0, pd: [], due: [], eta: [] }); g.t += it.t; g.n += 1; g.pd.push(it.pd); g.due.push(it.due); if (it.eta) g.eta.push(it.eta); return a; }, {})).sort((a, b) => b.t - a.t);
    const rng = (L) => { const s_ = [...L].filter(Boolean).sort(); return !s_.length ? '' : s_[0] === s_[s_.length - 1] ? md(s_[0]) : `${md(s_[0])}~${md(s_[s_.length - 1])}`; };
    const li = (g, extra) => `<div class="k-li"><div class="n"><span class="k-tag ${g.k}">${KN[g.k]}</span>${esc(g.dept)} · ${esc(g.dst || g.cus || '')}</div><div class="t">${n0(g.t)}t</div><div class="d">${esc(g.man || '담당 미정')} · ${g.n}건 · ${extra(g)}</div></div>`;
    const list = (L, extra, empty) => (L.length ? L.slice(0, 8).map((g) => li(g, extra)).join('') + (L.length > 8 ? `<div class="k-more">외 ${L.length - 8}줄 · ${n0(L.slice(8).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : `<div class="k-more">${empty}</div>`);
    const GAPS = V.flatMap(([d, v]) => (d[2] === 'G' ? v.rows.filter((r) => r.p - r.o > 0.5).map((r) => ({ dept: d[0], dst: r.d, t: r.p - r.o, p: r.p })) : (v.p - v.o > 0.5 ? [{ dept: d[0], dst: `시장 ${v.mkt.slice(0, 3).map(([a]) => a).join('·')}`, t: v.p - v.o, p: v.p }] : []))).sort((a, b) => b.t - a.t);
    const gapT = GAPS.reduce((a, g) => a + g.t, 0);
    const MAT = grp(ALL.filter((it) => ['none', 'late', 'wait', 'sub'].includes(it.k))), matT = MAT.reduce((a, g) => a + g.t, 0);
    const DLs = grp(ALL.filter((it) => it.k === 'dl')), dlT = DLs.reduce((a, g) => a + g.t, 0);
    const ask = `<div class="k-ask">
<div class="k-card k-side"><h2>마케팅에 — 수주 독려<span class="who">빈 곳</span></h2><div class="tt">${n0(gapT)}<small>톤 · ${GAPS.length}곳</small></div>
${GAPS.length ? GAPS.slice(0, 8).map((g) => `<div class="k-li"><div class="n"><span class="k-tag gap">빈 곳</span>${esc(g.dept)} · ${esc(g.dst)}</div><div class="t bad">${n0(g.t)}t</div><div class="d">계획 ${n0(g.p)}t 중 주문 ${n0(g.p - g.t)}t</div></div>`).join('') + (GAPS.length > 8 ? `<div class="k-more">외 ${GAPS.length - 8}곳 · ${n0(GAPS.slice(8).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : '<div class="k-more">빈 곳 없음 — 계획만큼 주문 있음</div>'}</div>
<div class="k-card k-side"><h2>소재에 — 입고·부자재 독촉<span class="who">소재·구매</span></h2><div class="tt">${n0(matT)}<small>톤 · ${MAT.length}줄</small></div>
${list(MAT, (g) => `생산 ${rng(g.pd)}${g.eta.length ? ` · 예상 입고 ${rng(g.eta)}` : ''}`, '소재·부자재 문제 없음')}</div>
<div class="k-card k-side"><h2>공정·출하에 — 납기 넘김<span class="who">공정·출하</span></h2><div class="tt">${n0(dlT)}<small>톤 · ${DLs.length}줄</small></div>
${list(DLs, (g) => `생산 ${rng(g.pd)} · 납기 ${rng(g.due)}`, '납기 넘김 없음')}</div></div>`;
    m.innerHTML = `<div class="k-top"><h1>주간 관제</h1><span class="as">${md(K.today)} 기준 · 주 = 수~화 · 계획 = ${K.planAt ? md(K.planAt) + ' 재계획' : '재계획'}·통합 계획</span></div>
${chips}${kpi}<div style="margin-top:14px">${dtab}</div>${ask}
<div class="k-ft">주문 = 그 주 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 소재: 도금 = 예상 입고(인도기한 + 실측), 컬러 = 발주 인도기한 · 부자재 = 컬러 작업지시 부자재(도료·필름) 상태 · 컬러는 계획이 시장 단위라 부서 전체로 채움 · 자사 주문·재고 전환 계약 제외</div>`;
    m.querySelectorAll('[data-i]').forEach((e) => e.addEventListener('click', () => { SEL = +e.dataset.i; render(D); }));
  }
  let LD = null, SUB = false;
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => render(LD)); } });
})();
