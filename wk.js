/* 03 생산 편성 · 주간 관제(11/17 사용자 '이번 주 총 몇 톤 계획, 부서별로 얼마, 부서별 소재·부자재 준비, 그래서 수주에서 마케팅·소재·공정출하에 뭘 독촉할지')
   숫자 = suju.enc.json 의 wk8(tools/suju_build.py week_check, 2시간 갱신)
   · 계획 = 우리 생산 계획(도금 재계획 그룹·목적지·강종 일 계획, 컬러 통합 계획)의 그 주(수~화) 합
   · 주문 = 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 빈 곳 = 계획 − 주문 → 마케팅
   · 소재 = 채운 주문의 소재: 확보 · 입고 예정(생산 전날까지) · 늦게 입고 · 없음 → 소재
   · 부자재 = 컬러 소재 확보 주문의 도료·필름(1020 부자재 상태): 준비 · 대기 → 소재(부자재) · 도금은 주문 단위 부자재 없음
   · 납기 넘김 = 계획대로 만들면 생산일이 납기 뒤(표에만) · 공정·출하에는 부자재만 */
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
    const chips = `<div class="k-wk">${W.map((w, i) => { const v = wk(w), f = pc(v.o, v.p), ms = pc(v.ok + v.on, v.o); return `<button type="button" data-i="${i}" class="${i === SEL ? 'on' : ''}"><b>${lab(i)}</b><span>${md(w.from)}~${md(w.to)}</span><div class="mm">${v.p ? `<span>${n0(v.p)}t</span><span class="${f < 90 ? 'bad' : ''}">주문 ${f}%</span><span class="${ms < 50 ? 'bad' : ms < 80 ? 'warn' : ''}">소재 ${ms}%</span>` : '<span>계획 없음</span>'}</div></button>`; }).join('')}</div>`;
    const w = W[SEL], V = DP.map((d) => [d, dv(w, d)]), T = tot(V.map(([, v]) => v));
    const sub = T.so + T.sw + T.sb + T.sn;
    const kpi = `<div class="k-kpi">
<div><div class="l">${lab(SEL)} 생산 계획 · ${md(w.from)}~${md(w.to)}</div><div class="v">${n0(T.p)}<small>톤</small></div><div class="s">${DP.map(([n], i) => `${n} ${n0(V[i][1].p)}`).filter((_, i) => V[i][1].p).join(' · ')}</div></div>
<div><div class="l">주문 확보</div><div class="v ${pc(T.o, T.p) < 90 ? 'bad' : ''}">${pc(T.o, T.p) ?? '–'}<small>%</small></div><div class="s">${n0(T.o)}톤 · 빈 곳 ${n0(Math.max(0, T.p - T.o))}톤</div></div>
<div><div class="l">소재 준비(주문 중 생산 전날까지)</div><div class="v ${pc(T.ok + T.on, T.o) < 50 ? 'bad' : pc(T.ok + T.on, T.o) < 80 ? 'warn' : ''}">${pc(T.ok + T.on, T.o) ?? '–'}<small>%</small></div><div class="s">확보 ${n0(T.ok)} · 입고 예정 ${n0(T.on)} · 늦음 ${n0(T.late)} · 없음 ${n0(T.none + T.wait)}</div></div>
<div><div class="l">부자재 준비(컬러)</div><div class="v ${sub && pc(T.so, sub) < 80 ? 'warn' : ''}">${sub ? pc(T.so, sub) : '–'}<small>%</small></div><div class="s">${sub ? `준비 ${n0(T.so)} · 대기 ${n0(T.sw + T.sb)} · 지시 전 ${n0(T.sn)}` : '도금은 주문 단위 부자재 없음'}</div></div></div>`;
    // 부서별 준비 현황
    const z = (v, c) => (v > 0.5 ? `<td class="${c || ''}">${n0(v)}</td>` : '<td class="z">–</td>');
    const drow = ([d, v], tt) => !v.p && !tt ? `<tr><th class="${d[2]}">${d[0]}</th><td colspan="11" class="na">이 주 계획 없음</td></tr>`
      : `<tr class="${tt ? 'tot' : ''}"><th class="${tt ? '' : d[2]}">${tt ? '합계' : d[0]}</th><td>${n0(v.p)}</td>${z(v.o)}${z(Math.max(0, v.p - v.o), 'bad')}<td class="sep ${pc(v.ok + v.on, v.o) < 50 ? 'bad' : pc(v.ok + v.on, v.o) < 80 ? 'warn' : ''}">${v.o ? pc(v.ok + v.on, v.o) + '%' : '–'}</td>${z(v.ok)}${z(v.on)}${z(v.late, 'warn')}${z(v.none + v.wait, 'bad')}${d && d[2] === 'G' && !tt ? '<td class="sep z">–</td><td class="z">–</td>' : `<td class="sep">${v.so + v.sw + v.sb > 0.5 ? n0(v.so) : '–'}</td>${z(v.sw + v.sb, 'warn')}`}${z(v.dl, 'warn')}</tr>`;
    const dtab = `<div class="k-card"><h2>부서별 준비 현황<small>톤 · 계획대로 만들 때</small></h2><div class="k-dscroll"><table class="k-d">
<thead><tr class="grp"><th></th><th colspan="3" class="gs">주문</th><th colspan="5" class="gs">소재</th><th colspan="2" class="gs">부자재(컬러) · 공정·출하</th><th class="gs">납기</th></tr>
<tr><th></th><th>계획</th><th>주문</th><th>빈 곳</th><th class="sep">준비율</th><th>확보</th><th>입고 예정</th><th>늦게 입고</th><th>없음</th><th class="sep">준비</th><th>대기</th><th>납기 넘김</th></tr></thead>
<tbody>${V.map((x) => drow(x)).join('')}${drow([null, T], true)}</tbody></table></div>
<div class="k-lg"><span>준비율 = 주문 중 생산 전날까지 소재가 있는 몫(확보 + 입고 예정)</span><span class="bad">빨강 = 빈 곳·소재 없음</span><span class="warn">주황 = 늦게 입고·부자재 대기·납기 넘김</span></div></div>`;
    // 독촉할 곳: 마케팅(빈 곳) · 소재(늦음·없음·부자재 대기) · 공정·출하(납기 넘김)
    const ALL = V.flatMap(([, v]) => v.iss);
    const grp = (L) => Object.values(L.reduce((a, it) => { const k = `${it.dept}|${it.k}|${it.dst || it.cus}|${it.man || ''}`; const g = a[k] || (a[k] = { ...it, t: 0, n: 0, pd: [], due: [], eta: [], items: [] }); g.items.push(it); g.t += it.t; g.n += 1; g.pd.push(it.pd); g.due.push(it.due); if (it.eta) g.eta.push(it.eta); return a; }, {})).sort((a, b) => b.t - a.t);
    const rng = (L) => { const s_ = [...L].filter(Boolean).sort(); return !s_.length ? '' : s_[0] === s_[s_.length - 1] ? md(s_[0]) : `${md(s_[0])}~${md(s_[s_.length - 1])}`; };
    let uid = 0;
    const li = (g, extra) => { const id = `kx${uid++}`; return `<div class="k-li op" data-x="${id}"><div class="n"><span class="k-tag ${g.k}">${KN[g.k]}</span>${esc(g.dept)} · ${esc(g.dst || g.cus || '')}</div><div class="t">${n0(g.t)}t <span class="cv">▾</span></div><div class="d">${esc(g.man || '담당 미정')} · ${g.n}건 · ${extra(g)}</div></div>
<div class="k-con" id="${id}" hidden><div class="r h"><span>계약번호</span><span>톤</span><span>생산</span><span>${g.items.some((it) => it.eta) ? '입고' : ''}</span><span>납기</span></div>${g.items.sort((a, b) => b.t - a.t).map((it) => `<div class="r"><span>${esc(it.con || '–')}</span><span>${n0(it.t)}</span><span>${md(it.pd)}</span><span>${md(it.eta)}</span><span class="${it.due < it.pd ? 'warn' : ''}">${md(it.due)}</span></div>`).join('')}</div>`; };
    const list = (L, extra, empty) => (L.length ? L.slice(0, 8).map((g) => li(g, extra)).join('') + (L.length > 8 ? `<div class="k-more">외 ${L.length - 8}줄 · ${n0(L.slice(8).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : `<div class="k-more">${empty}</div>`);
    const GAPS = V.flatMap(([d, v]) => (d[2] === 'G' ? v.rows.filter((r) => r.p - r.o > 0.5).map((r) => ({ dept: d[0], dst: r.d, t: r.p - r.o, p: r.p })) : (v.p - v.o > 0.5 ? [{ dept: d[0], dst: `시장 ${v.mkt.slice(0, 3).map(([a]) => a).join('·')}`, t: v.p - v.o, p: v.p }] : []))).sort((a, b) => b.t - a.t);
    const gapT = GAPS.reduce((a, g) => a + g.t, 0);
    const MAT = grp(ALL.filter((it) => ['none', 'late', 'wait'].includes(it.k))), matT = MAT.reduce((a, g) => a + g.t, 0);
    const SUBs = grp(ALL.filter((it) => it.k === 'sub')), subT = SUBs.reduce((a, g) => a + g.t, 0);
    const ask = `<div class="k-ask">
<div class="k-card k-side"><h2>마케팅에 — 수주 독려<span class="who">빈 곳</span></h2><div class="tt">${n0(gapT)}<small>톤 · ${GAPS.length}곳</small></div>
${GAPS.length ? GAPS.slice(0, 8).map((g) => `<div class="k-li"><div class="n"><span class="k-tag gap">빈 곳</span>${esc(g.dept)} · ${esc(g.dst)}</div><div class="t bad">${n0(g.t)}t</div><div class="d">계획 ${n0(g.p)}t 중 주문 ${n0(g.p - g.t)}t</div></div>`).join('') + (GAPS.length > 8 ? `<div class="k-more">외 ${GAPS.length - 8}곳 · ${n0(GAPS.slice(8).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : '<div class="k-more">빈 곳 없음 — 계획만큼 주문 있음</div>'}</div>
<div class="k-card k-side"><h2>소재에 — 입고 독촉<span class="who">소재·구매</span></h2><div class="tt">${n0(matT)}<small>톤 · ${MAT.length}줄</small></div>
${list(MAT, (g) => `생산 ${rng(g.pd)}${g.eta.length ? ` · 예상 입고 ${rng(g.eta)}` : ''}`, '소재 문제 없음')}</div>
<div class="k-card k-side"><h2>공정·출하에 — 부자재(도료·필름)<span class="who">공정·출하</span></h2><div class="tt">${n0(subT)}<small>톤 · ${SUBs.length}줄</small></div>
${list(SUBs, (g) => `생산 ${rng(g.pd)} · 납기 ${rng(g.due)}`, PS.includes('C') ? '부자재 대기 없음' : '도금은 주문 단위 부자재 없음')}</div></div>`;
    // 대응안(11/17 사용자 '생산이 계획대로 안 되거나, 주문 충당이 안 되거나, 소재가 결국 안 들어오면 — 차주 작업 당기기')
    const SW = (w.swap || []).filter((x) => PS.includes(x.pl));
    const PLN = { G: '도금', C: '컬러' };
    const crow = (e, kind) => `<div class="r"><span title="${esc(e.con || '')}">${esc(e.con || '–')}</span><span>${n0(e.t)}</span><span>${esc(e.g)} · ${esc(e.dst || '')}</span><span>${md(e.pd)}</span><span class="${e.due < e.pd ? 'warn' : ''}">${md(e.due)}</span></div>`;
    const clist = (L, kind, n) => `<div class="k-con sw"><div class="r h"><span>계약번호</span><span>톤</span><span>부서 · 목적지</span><span>${kind === 'pull' ? '원래 생산' : '생산'}</span><span>납기</span></div>${L.slice(0, n).map((e) => crow(e, kind)).join('')}${L.length > n ? `<div class="k-more">외 ${L.length - n}건 · ${n0(L.slice(n).reduce((a_, e) => a_ + e.t, 0))}톤</div>` : ''}</div>`;
    const swHtml = SW.length ? SW.map((x) => `<div class="k-card k-sw"><h2>${PLN[x.pl]}${x.al ? ` ${esc(x.al)}` : ''}<small>${x.pl === 'G' ? '같은 강종끼리 · 라인·시간은 주간 편성에서 확인' : '컬러 전체 · 라인·품명은 작업 순서에서 확인'}</small></h2>
<div class="k-swh"><div><div class="l">빠질 몫</div><div class="v bad">${n0(x.need)}<small>톤</small></div><div class="s">소재 늦음·없음 ${n0(x.out)}${x.gap ? ` · 빈 곳 ${n0(x.gap)}` : ''}</div></div><div class="ar">→</div>
<div><div class="l">당겨 채울 수 있는 주문</div><div class="v ${x.pullT + 0.5 < x.need ? 'warn' : ''}">${n0(Math.min(x.pullT, x.need))}<small>톤</small></div><div class="s">${SEL >= W.length - 1 ? '뒤 주 계획이 없어 당길 후보 없음' : `${lab(SEL + 1)}~${lab(Math.min(SEL + 4, W.length - 1))} 중 소재 이미 있는 주문`} ${n0(x.candT)}톤에서 납기 빠른 순${x.pullT + 0.5 < x.need ? ` · <b class="bad">${n0(x.need - x.pullT)}톤 못 채움</b>` : ''}</div></div></div>
<div class="k-swl"><div><h3>① 미룰 주문 — 소재 늦음·없음<span>${n0(x.out)}t</span></h3>${x.push.length ? clist(x.push, 'push', 6) : '<div class="k-more">없음</div>'}</div>
<div><h3>② 당길 주문 — 소재 있음<span>${n0(x.pullT)}t</span></h3>${x.pull.length ? clist(x.pull, 'pull', 6) : '<div class="k-more">후보 없음</div>'}</div>
<div><h3>③ 생산 미달 시 먼저 넘길 주문 — 납기 늦은 순</h3>${(x.defer || []).length ? clist(x.defer, 'defer', 6) : '<div class="k-more">없음</div>'}</div></div></div>`).join('') : '<div class="k-card"><div class="k-more">이 주 대응할 것 없음</div></div>';
    // 일정 지연 대비(11/17 사용자 '수리나 test, 작업이 예상보다 늦게 진행되면')
    const DL = (K.delay || []).filter((e) => !/재가동/.test(e.ev) && PS.includes(/CGL/.test(e.line) ? 'G' : 'C') && e.to >= (SEL === 0 ? K.today : w.from) && e.from <= W[Math.min(SEL + 3, W.length - 1)].to);
    const dlHtml = DL.length ? DL.map((e, i) => `<div class="k-li op" data-x="dl${i}"><div class="n"><span class="k-tag wait">${esc(e.line)}</span>${esc(e.ev)} · ${md(e.from)}${e.to !== e.from ? `~${md(e.to)}` : ''}</div><div class="t">하루 늦으면 −${n0(e.lost1)}t <span class="cv">▾</span></div>
<div class="d">이틀 −${n0(e.lost2)}t · 뒤 7일 밀리는 주문 ${n0(e.totT ?? 0)}t${e.riskT ? ` · <b class="bad">늦어지면 새로 납기 넘김 ${n0(e.riskT)}t</b>` : ''}${e.lateT ? ` · <span class="warn">이미 납기 지남 ${n0(e.lateT)}t</span>` : ''}${!e.orders.length ? ' · 그날 판매 주문 없음(자가재)' : ''}</div></div>
<div class="k-con sw" id="dl${i}" hidden><div class="r h"><span>계약번호</span><span>톤</span><span>부서 · 목적지</span><span>생산</span><span>납기</span></div>${e.orders.map((z) => `<div class="r"><span>${esc(z.con || '–')}</span><span>${n0(z.t)}</span><span>${esc(z.g)} · ${esc(z.dst || '')}</span><span>${md(z.pd)}</span><span class="${z.risk ? 'bad' : z.late ? 'warn' : ''}">${md(z.due)}</span></div>`).join('')}
<div class="k-more">대응: 빨강(늦어지면 새로 납기 넘김) 주문은 같은 강종 다른 라인·전날로 당기고, 주황(이미 지남)은 고객사와 납기 조정, 나머지는 납기 여유 있는 것부터 뒤로</div></div>`).join('') : '<div class="k-more">이 기간 수리·M/C·휴지 일정 없음</div>';
    const dlSec = `<div class="k-h">수리·M/C·휴지 지연 대비<small>${lab(SEL)}~${lab(Math.min(SEL + 3, W.length - 1))} 일정이 늦어지면 빠지는 톤과 밀리는 주문</small></div><div class="k-card k-side">${dlHtml}</div>`;
    const swSec = `<div class="k-h">${lab(SEL)} 대응안<small>소재가 안 들어오거나 주문이 비거나 생산이 덜 나올 때 — 무엇을 빼고 무엇을 당기나</small></div>${swHtml}`;
    m.innerHTML = `<div class="k-top"><h1>주간 관제</h1><span class="as">${md(K.today)} 기준 · 주 = 수~화 · 계획 = ${K.planAt ? md(K.planAt) + ' 재계획' : '재계획'}·통합 계획</span></div>
${chips}${kpi}<div style="margin-top:14px">${dtab}</div>${ask}${swSec}${dlSec}
<div class="k-ft">주문 = 그 주 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 소재: 도금 = 예상 입고(인도기한 + 실측), 컬러 = 발주 인도기한 · 부자재 = 컬러 작업지시 부자재(도료·필름) 상태 · 컬러는 계획이 시장 단위라 부서 전체로 채움 · 자사 주문·재고 전환 계약 제외</div>`;
    m.querySelectorAll('[data-i]').forEach((e) => e.addEventListener('click', () => { SEL = +e.dataset.i; render(D); }));
    m.querySelectorAll('.k-li.op').forEach((e) => e.addEventListener('click', () => { const c = document.getElementById(e.dataset.x); c.hidden = !c.hidden; e.classList.toggle('open', !c.hidden); }));
  }
  let LD = null, SUB = false;
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => render(LD)); } });
})();
