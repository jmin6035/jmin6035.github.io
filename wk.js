/* 03 생산 편성 · 주간 관제(11/17 사용자 '이번 주 총 몇 톤 계획, 부서별로 얼마, 부서별 소재·부자재 준비, 그래서 수주에서 마케팅·소재·공정출하에 뭘 독촉할지')
   숫자 = suju.enc.json 의 wk8(tools/suju_build.py week_check, 2시간 갱신)
   · 계획 = 우리 생산 계획(도금 재계획 그룹·목적지·강종 일 계획, 컬러 통합 계획)의 그 주(수~화) 합
   · 주문 = 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 빈 곳 = 계획 − 주문 → 마케팅
   · 소재 = 채운 주문의 소재: 확보 · 입고 예정(생산 전날까지) · 입고 지연 · 없음 → 소재
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
  const DEPT = [['도금수출', ['도금수출'], 'G'], ['도금국내', ['도금국내'], 'G'], ['자동차', ['자동차'], 'G'], ['컬러수출', ['컬러수출'], 'C'], ['가전내수', ['가전내수'], 'C'], ['컬러건재', ['컬러건재'], 'C'], ['수요개발', ['수요개발'], 'C']];   // 판매그룹 그대로(11/17 사용자 '그룹별로')
  const KN = { none: '미발주', late: '입고 지연', wait: '입고일 모름', sub: '부자재 대기', dl: '납기 지연' };
  function bar(v) {
    const p = v.p || 0; if (!p) return '<div class="kb"></div>';
    const seg = [['ok', (v.ok || 0) + (v.on || 0)], ['late', v.late], ['none', v.none], ['wait', v.wait], ['gap', Math.max(0, p - v.o)]];
    return `<div class="kb">${seg.filter(([, t]) => t > 0.5).map(([k, t]) => `<i class="${k}" style="width:${(t / p * 100).toFixed(1)}%"></i>`).join('')}</div>`;
  }
  let SEL = 0, VIEW = 'a';
  try { VIEW = sessionStorage.getItem('wk-v') || 'a'; } catch (e) { /* 무시 */ }
  const addd = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  function render(D) {
    const S = D.suju || {}, K = S.wk8, m = document.getElementById('ct-main');
    if (!K) { m.innerHTML = '<section class="card"><h2>주간 관제 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const sc = window.UI && UI.scope ? UI.scope() : 'all', PS = sc === 'G' ? ['G'] : sc === 'C' ? ['C'] : ['G', 'C'];
    const W = K.weeks, lab = (i) => (i === 0 ? '이번 주' : i === 1 ? '차주(W+1)' : `W+${i}`);
    const DP = DEPT.filter((d) => PS.includes(d[2]));
    const dv = (w, d) => { const L = w.g.filter((x) => d[1].includes(x.g)); return { ...tot(L), iss: L.flatMap((x) => (x.iss || []).map((it) => ({ ...it, dept: d[0] }))), rows: L.flatMap((x) => (x.rows || []).map((r) => ({ ...r, dept: d[0] }))), mkt: L.flatMap((x) => x.mkt || []), pl: d[2], ln: L.reduce((a_, x) => { Object.entries(x.ln || {}).forEach(([l, t]) => { a_[l] = (a_[l] || 0) + t; }); return a_; }, {}) }; };
    const wk = (w) => tot(DP.map((d) => dv(w, d)));
    // 주 고르기(칩) — 칩마다 계획·주문%·소재%
    const chips = `<div class="k-wk">${W.map((w, i) => { const v = wk(w), f = pc(v.o, v.p), ms = pc(v.ok + v.on, v.o); return `<button type="button" data-i="${i}" class="${i === SEL ? 'on' : ''}"><b>${lab(i)}</b><span>${md(w.from)}~${md(w.to)}</span><div class="mm">${v.p ? `<span>${n0(v.p)}t</span><span class="${f < 90 ? 'bad' : ''}">수주 ${f}%</span><span class="${ms < 50 ? 'bad' : ms < 80 ? 'warn' : ''}">소재 ${ms}%</span>` : '<span>계획 없음</span>'}</div></button>`; }).join('')}</div>`;
    const w = W[SEL], V = DP.map((d) => [d, dv(w, d)]), T = tot(V.map(([, v]) => v));
    const sub = T.so + T.sw + T.sb + T.sn;
    const SELF_T = w.g.filter((x) => PS.includes(x.pl)).reduce((a_, x) => a_ + Object.values(x.byLn || {}).reduce((b_, c_) => b_ + (c_.noneSelf || 0), 0), 0);   // 자가재 대기(도금 생산) — 미발주와 나눔
    const kpi = `<div class="k-kpi">
<div><div class="l">${lab(SEL)} 생산 계획 · ${md(w.from)}~${md(w.to)}</div><div class="v">${n0(T.p)}<small>톤</small></div><div class="s">${DP.map(([n], i) => `${n} ${n0(V[i][1].p)}`).filter((_, i) => V[i][1].p).join(' · ')}</div></div>
<div><div class="l">수주 확보율</div><div class="v ${pc(T.o, T.p) < 90 ? 'bad' : ''}">${pc(T.o, T.p) ?? '–'}<small>%</small></div><div class="s">${n0(T.o)}톤 · 주문 미달 ${n0(Math.max(0, T.p - T.o))}톤</div></div>
<div><div class="l">소재 확보율(생산 전날까지)</div><div class="v ${pc(T.ok + T.on, T.o) < 50 ? 'bad' : pc(T.ok + T.on, T.o) < 80 ? 'warn' : ''}">${pc(T.ok + T.on, T.o) ?? '–'}<small>%</small></div><div class="s">확보 ${n0(T.ok)} · 입고 예정 ${n0(T.on)} · 늦음 ${n0(T.late)} · 입고일 모름 ${n0(T.wait)} · 배정 전 ${n0(SELF_T)} · 미발주 ${n0(Math.max(0, T.none - SELF_T))}</div></div>
<div><div class="l">부자재 준비(컬러)</div><div class="v ${sub && pc(T.so, sub) < 80 ? 'subc' : ''}">${sub ? pc(T.so, sub) : '–'}<small>%</small></div><div class="s">${sub ? `준비 ${n0(T.so)} · 대기 ${n0(T.sw + T.sb)} · 작업지시 전 ${n0(T.sn)}` : '도금은 주문 단위 부자재 없음'}</div></div></div>`;
    // 부서별 준비 현황
    const z = (v, c) => (v > 0.5 ? `<td class="${c || ''}">${n0(v)}</td>` : '<td class="z">–</td>');
    // 라인별 대구분 → 그룹별(11/17 사용자): 라인 머리 줄(합계) 아래 그 라인에서 만드는 그룹
    const GS = w.g.filter((x) => PS.includes(x.pl));
    const LNO = [...new Set(GS.flatMap((x) => Object.keys(x.byLn || {})))].sort((a_, b_) => (/CGL/.test(b_) - /CGL/.test(a_)) || a_.localeCompare(b_));
    const addc = (a_, c_) => { for (const [k_, v_] of Object.entries(c_ || {})) a_[k_] = (a_[k_] || 0) + v_; return a_; };
    const cells = (c, pl) => { const ms = c.o ? pc((c.ok || 0) + (c.on || 0), c.o) : null; return `<td class="pp">${n0(c.p || 0)}</td>${z(c.o || 0)}${z(Math.max(0, (c.p || 0) - (c.o || 0)), 'bad')}<td class="sep ${ms != null && ms < 50 ? 'bad' : ms != null && ms < 80 ? 'warn' : ''}">${ms != null ? ms + '%' : '–'}</td>${z(c.ok || 0)}${z(c.on || 0)}${z(c.late || 0, 'warn')}${z(c.wait || 0, 'warn')}${z(c.noneSelf || 0, 'self')}${z(Math.max(0, (c.none || 0) - (c.noneSelf || 0)), 'bad')}${pl === 'G' ? '<td class="sep z">–</td><td class="z">–</td>' : `<td class="sep">${(c.so || 0) + (c.sw || 0) + (c.sb || 0) > 0.5 ? n0(c.so || 0) : '–'}</td>${z((c.sw || 0) + (c.sb || 0), 'subc')}`}${z(c.dln || 0, 'dlc')}`; };
    const lnInfo = (l) => { const x = (w.lines || []).find((y) => y.line === l); return x ? [x.fams && x.fams.length ? x.fams.join('·') : '', x.runD < 7 ? `가동 ${x.runD}일` : ''].filter(Boolean).join(' · ') : ''; };
    const TT = {};
    const body_ = LNO.map((l) => {
      const pl = /CGL/.test(l) ? 'G' : 'C', gs = GS.filter((x) => (x.byLn || {})[l]), LT = gs.reduce((a_, x) => addc(a_, x.byLn[l]), {});
      addc(TT, LT);
      return `<tr class="lnh ${pl}"><th><b>${esc(l)}</b><small>${esc(lnInfo(l))}</small></th>${cells(LT, pl)}</tr>${gs.map((x) => `<tr class="gr"><th>${esc(x.g)}</th>${cells(x.byLn[l], pl)}</tr>`).join('')}`;
    }).join('');
    const none_ = GS.filter((x) => !x.p).map((x) => { const lt = (K.left || {})[x.g] || 0; return `<tr class="gr"><th>${esc(x.g)}</th><td colspan="13" class="na">${x.pl === 'G' ? '판매재 계획 없음(자가재·정기수리 주간)' : `이 주 계획 없음${lt >= 50 ? ` — 계획 없는 주문 ${n0(lt)}t 대기(9주 합)` : ''}`}</td></tr>`; }).join('');
    const dtab = `<div class="k-card"><h2>${lab(SEL)} 라인별 생산 계획<small>${md(w.from)}~${md(w.to)} · 톤 · 라인 아래 = 그 라인에서 만드는 그룹</small></h2><div class="k-dscroll"><table class="k-d k-dl">
<thead><tr class="grp"><th></th><th class="gs">생산</th><th colspan="2" class="gs">주문</th><th colspan="7" class="gs">소재</th><th colspan="2" class="gs">부자재(컬러)</th><th class="gs">납기</th></tr>
<tr><th></th><th>계획</th><th>주문</th><th>주문 미달</th><th class="sep">확보율</th><th>확보</th><th>입고 예정</th><th>입고 지연</th><th>입고일 모름<small>발주함</small></th><th>배정 전<small>재고 있음·매치 안 됨</small></th><th>미발주</th><th class="sep">준비</th><th>대기</th><th>새 납기 지연</th></tr></thead>
<tbody>${body_}${none_}<tr class="tot"><th>합계</th>${cells(TT, PS.includes('C') ? 'C' : 'G')}</tr></tbody></table></div>
<div class="k-lg"><span class="bad">빨강 = 주문 미달·소재 없음</span><span class="warn">주황 = 입고 지연·입고일 모름</span><span class="self">연보라 = 배정 전(자가재·입고분 매치 안 됨)</span><span class="subc">남색 = 부자재 대기</span><span class="dlc">보라 = 새 납기 지연</span></div></div>`;
    // 독촉할 곳: 마케팅(빈 곳) · 소재(늦음·없음·부자재 대기) · 공정·출하(납기 넘김)
    const ALL = V.flatMap(([, v]) => v.iss);
    const grp = (L) => Object.values(L.reduce((a, it) => { const k = `${it.dept}|${it.k}|${it.dst || it.cus}|${it.man || ''}`; const g = a[k] || (a[k] = { ...it, t: 0, n: 0, pd: [], due: [], eta: [], items: [] }); g.items.push(it); g.t += it.t; g.n += 1; g.pd.push(it.pd); g.due.push(it.due); if (it.eta) g.eta.push(it.eta); return a; }, {})).sort((a, b) => b.t - a.t);
    const rng = (L, f = md) => { const s_ = [...L].filter(Boolean).sort(); return !s_.length ? '' : s_[0] === s_[s_.length - 1] ? f(s_[0]) : `${f(s_[0])}~${f(s_[s_.length - 1])}`; };
    let uid = 0;
    const li = (g, extra) => { const id = `kx${uid++}`; return `<div class="k-li op" data-x="${id}"><div class="n"><span class="k-tag ${g.k}">${KN[g.k]}</span>${esc(g.dst || g.cus || '')}</div><div class="t">${n0(g.t)}t <span class="cv">▾</span></div><div class="d">${esc(g.dept)} · ${esc(g.man || '담당 미정')} · ${g.n}건 · ${extra(g)}</div></div>
${((he) => `<div class="k-con ${he ? '' : 'ne'}" id="${id}" hidden><div class="r h"><span>계약번호</span><span>톤</span><span>생산</span>${he ? '<span>입고</span>' : ''}<span>납기</span></div>${g.items.sort((a, b) => b.t - a.t).map((it) => `<div class="r"><span>${esc(it.con || '–')}</span><span>${n0(it.t)}</span><span>${md(it.pd)}</span>${he ? `<span class="${it.eta && it.eta < K.today ? 'bad' : ''}">${it.eta ? md(it.eta) + (it.eta < K.today ? ' 지남' : '') : ''}</span>` : ''}<span class="${it.due < it.pd ? 'dlc' : ''}">${md(it.due)}</span></div>`).join('')}</div>`)(g.items.some((it) => it.eta))}`; };
    const list = (L, extra, empty) => (L.length ? L.slice(0, 8).map((g) => li(g, extra)).join('') + (L.length > 8 ? `<div class="k-more">외 ${L.length - 8}줄 · ${n0(L.slice(8).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : `<div class="k-more">${empty}</div>`);
    const GAPS = V.flatMap(([d, v]) => (d[2] === 'G' ? v.rows.filter((r) => r.p - r.o > 0.5).map((r) => ({ dept: d[0], dst: r.d, t: r.p - r.o, p: r.p })) : (v.p - v.o > 0.5 ? [{ dept: d[0], dst: `시장 ${v.mkt.slice(0, 3).map(([a]) => a).join('·')}`, t: v.p - v.o, p: v.p }] : []))).sort((a, b) => b.t - a.t);
    const gapT = GAPS.reduce((a, g) => a + g.t, 0);
    const MAT = grp(ALL.filter((it) => ['none', 'late', 'wait'].includes(it.k) && !it.self && !it.rcv)),   // 배정 전(자가재 재고·입고분 매치 안 됨)은 입고 독촉 대상 아님 — 표 '배정 전' 칸
    matT = MAT.reduce((a, g) => a + g.t, 0);
    const SUBs = grp(ALL.filter((it) => it.k === 'sub')), subT = SUBs.reduce((a, g) => a + g.t, 0);
    const DLs = grp(ALL.filter((it) => it.k === 'dl' && it.due >= K.today)), dlT = DLs.reduce((a, g) => a + g.t, 0);   // 계획 때문에 새로 납기 넘김
    const OLDs = grp(ALL.filter((it) => it.k === 'dl' && it.due < K.today)), oldT = OLDs.reduce((a, g) => a + g.t, 0);   // 이미 납기 지난 주문 — 출하 일정 안내
    const sumD = (o) => DP.map((d) => [d[0], d[1].reduce((a_, g) => a_ + ((o || {})[g] || 0), 0)]).filter(([, t]) => t >= 50).sort((a_, b_) => b_[1] - a_[1]);
    const LF = sumD(K.left), ST = sumD(K.stale);
    const outL = (A, c, sb) => `<div class="tt">${n0(A.reduce((a_, z_) => a_ + z_[1], 0))}<small>톤</small></div><div class="k-more" style="padding:0 0 4px">${sb}</div>${A.map(([n, t]) => `<div class="k-li"><div class="n">${esc(n)}</div><div class="t ${c}">${n0(t)}t</div></div>`).join('')}`;
    const ask = `<div class="k-ask">
<div class="k-card k-side"><h2>마케팅: 납기 조정<span class="who">고객 협의</span></h2><div class="tt">${n0(dlT)}<small>톤 · 납기 지연 ${DLs.length}줄</small></div>
${list(DLs, (g) => `납기 ${rng(g.due)} → 생산 ${rng(g.pd)}${g.dept.startsWith('컬러') || g.dept === '수요개발' ? '(추정)' : ''}`, '새로 납기 넘기는 주문 없음')}
<details class="k-dt"><summary>이미 납기 지난 주문 ${n0(oldT)}t · ${OLDs.length}줄 — 출하 일정 안내</summary>${list(OLDs, (g) => `납기 ${rng(g.due)} → 생산 ${rng(g.pd)}${g.dept.startsWith('컬러') || g.dept === '수요개발' ? '(추정)' : ''}`, '없음')}</details></div>
<div class="k-card k-side"><h2>마케팅: 수주 요청<span class="who">주문 미달</span></h2><div class="tt">${n0(gapT)}<small>톤 · ${GAPS.length}곳</small></div>
${GAPS.length ? GAPS.slice(0, 8).map((g) => `<div class="k-li"><div class="n"><span class="k-tag none">주문 미달</span>${esc(g.dept)} · ${esc(g.dst)}</div><div class="t bad">${n0(g.t)}t</div><div class="d">계획 ${n0(g.p)}t 중 주문 ${n0(g.p - g.t)}t</div></div>`).join('') + (GAPS.length > 8 ? `<div class="k-more">외 ${GAPS.length - 8}곳 · ${n0(GAPS.slice(8).reduce((a, g) => a + g.t, 0))}톤</div>` : '') : '<div class="k-more">주문 미달 없음</div>'}</div>
<div class="k-card k-side"><h2>소재: 입고 독촉<span class="who">소재·구매</span></h2><div class="tt">${n0(matT)}<small>톤 · ${MAT.length}줄</small></div>
${list(MAT, (g) => { const old = g.eta.filter((e) => e < addd(K.today, -30)), ov = g.eta.filter((e) => e < K.today && e >= addd(K.today, -30)), fu = g.eta.filter((e) => e >= K.today); return `필요 ${rng(g.pd.map((d) => addd(d, -1)))}${old.length ? ' · <b class="bad">인도기한 30일 넘게 지남 — 발주 잔량 확인</b>' : ''}${ov.length ? ` · <b class="bad">인도기한 ${rng(ov)} 지남</b>` : ''}${fu.length ? ` · 입고 예정 ${rng(fu)}` : ''}${g.k === 'none' ? (g.items.some((it) => it.rcv) ? ' · 발주량 입고 완료 — 소재 배정 확인' : g.items.some((it) => it.self) ? ' · 자가재 — 도금 생산 대기' : ' · 구매 발주 없음') : g.k === 'wait' && !g.eta.length ? ' · 입고일 미정' : ''}`; }, '소재 문제 없음')}</div>
<div class="k-card k-side"><h2>공정·출하: 부자재<span class="who">도료·필름</span></h2><div class="tt">${n0(subT)}<small>톤 · ${SUBs.length}줄</small></div>
${list(SUBs, (g) => `생산 ${rng(g.pd)} · 납기 ${rng(g.due)}`, PS.includes('C') ? '부자재 대기 없음' : '도금은 주문 단위 부자재 없음')}</div></div>
${false && (LF.length || ST.length) ? `<div class="k-ask">${LF.length ? `<div class="k-card k-side"><h2>생산계획: 계획 없는 주문<span class="who">9주 합</span></h2>${outL(LF, 'bad', '9주 안 생산 계획 칸이 없음 — 판매계획·생산계획 협의@@PULL@@')}</div>` : ''}${ST.length ? `<div class="k-card k-side"><h2>마케팅: 오래 밀린 주문<span class="who">취소·재납기</span></h2>${outL(ST, 'dlc', '납기 30일 넘게 지났고 9주 계획에 없음(생산 중 잔량 포함) — 취소·재납기·잔량 정리 확인')}</div>` : ''}</div>` : ''}`;
    // 대응안(11/17 사용자 '생산이 계획대로 안 되거나, 주문 충당이 안 되거나, 소재가 결국 안 들어오면 — 차주 작업 당기기')
    const SW = (w.swap || []).filter((x) => PS.includes(x.pl));
    const PLN = { G: '도금', C: '컬러' };
    const GN = (g) => { const d = DEPT.find((d_) => d_[1].includes(g)); return d && d[1].length === 1 ? d[0] : g; };   // 한 그룹 = 한 부서면 표의 부서 이름, 여러 그룹이 한 부서면 그룹 이름(가전내수)   // 그룹 → 표와 같은 부서 이름
    const crow = (e, kind) => `<div class="r"><span title="${esc(e.con || '')}">${esc(e.con || '–')}</span><span>${n0(e.t)}</span><span>${esc(GN(e.g))} · ${esc(e.dst || '')}</span><span>${e.pd ? `${md(e.pd)}${e.ln ? ` ${esc(e.ln)}` : ''}` : '계획 없음'}</span><span class="${e.pd && e.due < e.pd ? 'dlc' : ''}">${md(e.due)}</span></div>`;
    const clist = (L, kind, n) => `<div class="k-con sw"><div class="r h"><span>계약번호</span><span>톤</span><span>부서 · 목적지</span><span>${kind === 'pull' ? '원래 생산' : '생산'}</span><span>납기</span></div>${L.slice(0, n).map((e) => crow(e, kind)).join('')}${L.length > n ? `<div class="k-more">외 ${L.length - n}건 · ${n0(L.slice(n).reduce((a_, e) => a_ + e.t, 0))}톤</div>` : ''}</div>`;
    // 빈 곳 메우기(11/17 사용자 '이번 주 부족하면 다음 주, 없으면 다다음 주 — 재고가 많아지면 휴지가 낫다는 판단도'):
    // 판정 규칙: W+1·W+2 = 당김 · W+3 이후 = 납기 2주 안 급한 주문만 · 어느 주든 납기가 달을 넘겨 재고로 남는 주문은 공장 재고 상한을 넘기면 안 당김 · 그래도 남으면 휴지 검토
    const H = S.hy || {};
    const stockOf = (p) => { const ym = w.from.slice(0, 7), cur = H.asOf && H.asOf.slice(0, 7) === ym; const M_ = (H.months || []).find((x) => x.ym === ym); const sp = cur ? (H[p] || {}).stockPdt : M_ && M_[p] && M_[p].stockPdt; const e = sp && (sp.end ?? sp.now); return { v: e ?? (H[p] || {}).stockPdt?.now, cap: (sp && sp.cap) || (H[p] || {}).stockPdt?.cap, cur }; };
    const USED = new Set(), HELD = { G: 0, C: 0 }, HOLE = {};   // 카드끼리 같은 주문 두 번 안 당김 · 재고는 공장 합 · 다른 라인 주문을 당기면 그 라인 그 주에 주문 미달
    const urgentTo = addd(w.to, 14);
    const plan = (x) => {
      const stk = stockOf(x.pl);
      let rem = x.need, added = 0, held = 0;   // held = 납기가 그 주 뒤라 재고로 머무는 양(이미 납기 지난·이번 주 납기 주문은 만들면 바로 나감)
      const st = (x.steps || []).filter((s_) => s_.k || x.pl === 'G').map((s_) => {   // 계획 밖 단계는 도금만(컬러 계획 밖 주문은 라인 미정)
        const rule = s_.k <= 2 ? 'all' : 'urgent';   // W+1·W+2 = 당김(재고는 주문마다 판단) · W+3 이후 = 급한 주문만
        const pool = rule === 'all' ? s_.items : rule === 'urgent' ? s_.items.filter((e) => e.due <= urgentTo) : [];
        const take = [];
        let skip = 0;
        const mEnd = addd(addd(w.from.slice(0, 7) + '-01', 32).slice(0, 7) + '-01', -1);   // 그 주가 속한 달 말
        for (const e of pool) {
          if (rem <= 0.5) break;
          if (e.con && USED.has(e.con)) continue;
          if (e.t > rem * 1.1 + 5) continue;                                   // 필요보다 큰 주문은 건너뜀(검토 11/17)
          const stays = e.due > mEnd;                                           // 납기가 달을 넘기면 월말 재고로 남음
          if (stays && stk.v != null && stk.cap && stk.v + HELD[x.pl] + e.t > stk.cap) { skip += e.t; continue; }   // 재고 상한을 넘기면 안 당김
          take.push(e); rem -= e.t; added += e.t; if (e.con) USED.add(e.con); if (stays) { held += e.t; HELD[x.pl] += e.t; }
          if (s_.k) { const cr = e.ln && e.ln !== x.line, hk = `${cr ? e.ln : x.line}|${s_.k}|${cr ? 'x' : 's'}`; HOLE[hk] = (HOLE[hk] || 0) + e.t; }   // 당긴 주 그 라인에 빈 칸(같은 라인 = 앞당김, 다른 라인 = 옮김)
        }
        const tt = take.reduce((a_, e) => a_ + e.t, 0);
        const early = tt && s_.k ? Math.round(take.reduce((a_, e) => a_ + e.t * Math.max(0, (new Date(e.pd) - new Date(addd(w.from, 3))) / 864e5), 0) / tt) : 0;
        return { ...s_, rule, take, tt, early, skip };
      });
      return { st, rem: Math.max(0, rem), added, held, heldAll: HELD[x.pl], stk, cross: st.flatMap((s_) => s_.take.filter((e) => e.ln && e.ln !== x.line).map((e) => ({ ...e, k: s_.k }))) };
    };
    const RULE = { all: '당김', urgent: `납기 ${md(urgentTo)} 이내만` };
    // 라인별 판단(11/17 사용자 '라인별로 보여줘야지'): 그룹마다 당긴 주문을 원래 라인에 모아, 라인의 빠질 몫에서 빼고 남는 몫 → 휴지·감속 일수
    const PUL = {};
    const PLANS = SW.map((x) => plan(x));
    SW.forEach((x, i) => { PUL[x.line] = (PUL[x.line] || 0) + (x.need - PLANS[i].rem); });
    const LN = (w.lines || []).filter((l) => PS.includes(/CGL/.test(l.line) ? 'G' : 'C')).sort((a_, b_) => (/CGL/.test(b_.line) - /CGL/.test(a_.line)) || a_.line.localeCompare(b_.line));
    // 11/17 사용자 '부족하거나 생산 이슈 나면 어떻게 할지 보여라': 라인마다 문제 → 대응 ①②③ 순서로 한 장
    const PW = {};   // 라인 → 당긴 주(라벨) → 톤
    SW.forEach((x, i) => PLANS[i].st.forEach((s_) => { if (s_.tt > 0.5) { const k_ = `${String(s_.k).padStart(2, '0')}|${s_.k ? lab(SEL + s_.k) : '계획 밖 주문'}`; (PW[x.line] = PW[x.line] || {})[k_] = ((PW[x.line] || {})[k_] || 0) + s_.tt; } }));
    const sumHtml = LN.length ? `<div class="k-card k-rs"><h2>라인별 부족 대응<small>이번 주 못 만드는 양 → 무엇으로 채우고, 그래도 남으면 어떻게 하나</small></h2><div class="k-rsg">${LN.map((l) => {
      const pu = Math.min(PUL[l.line] || 0, l.need), rem = Math.max(0, l.need - pu), d = l.dayT ? rem / l.dayT : null, small = d != null && d < 0.2;
      const ho = Object.entries(HOLE).filter(([k_, v]) => k_.split('|')[0] === l.line && v > 0.5);
      const hoW = Object.entries(ho.reduce((a_, [k_, v]) => { const n_ = +k_.split('|')[1]; a_[n_] = (a_[n_] || 0) + v; return a_; }, {})).sort((a_, b_) => a_[0] - b_[0]);
      if (l.need < 0.5) return `<div><div class="h">${esc(l.line)} <small>판매재 ${n0(l.plan)}t</small></div><div class="v ok">문제 없음</div><div class="s">계획대로 생산 — 소재·주문 모두 있음</div></div>`;
      const acts = [];
      if (pu > 0.5) acts.push(`<li><b>당겨 생산 ${n0(pu)}t</b> — ${Object.entries(PW[l.line] || {}).sort((a_, b_) => (a_[0] < b_[0] ? -1 : 1)).map(([k_, t]) => `${esc(k_.split('|')[1])} ${n0(t)}t`).join(' · ')} <span class="who">편성</span></li>`);
      if (l.out > 0.5) acts.push(`<li><b>소재 늦는 주문 ${n0(l.out)}t는 입고 뒤로 미룸</b> — 준비 현황 '소재: 입고 독촉' <span class="who">소재</span></li>`);
      if (l.gap > 0.5) acts.push(`<li><b>주문 미달 ${n0(l.gap)}t</b> — 수주 요청 <span class="who">마케팅</span></li>`);
      acts.push(rem > 0.5 ? (small ? `<li class="last">남는 ${n0(rem)}t는 하루치가 안 됨 → <b>작업 순서 조정</b> <span class="who">편성</span></li>` : `<li class="last bad">그래도 <b>${n0(rem)}t 빔 → 휴지 약 ${d.toFixed(1)}일 검토</b> <span class="who">생산계획 결정</span></li>`) : '<li class="last ok"><b>다 채움</b> — 휴지 없음</li>');
      if (hoW.length) acts.push(`<li class="note">당긴 만큼 뒤 주가 빔: ${hoW.map(([n_, v]) => `${lab(SEL + +n_)} ${n0(v)}t`).join(' · ')} → 그 주 다시 확인</li>`);
      return `<div class="${rem > 0.5 && !small ? 'idle' : ''}"><div class="h">${esc(l.line)} <small>${l.fams && l.fams.length ? `${l.fams.join('·')} · ` : ''}판매재 ${n0(l.plan)}t${l.runD < 7 ? ` · 가동 ${l.runD}일` : ''}</small></div>
<div class="v">못 만드는 양 ${n0(l.need)}t</div><div class="s flow">소재 늦음·없음 ${n0(l.out)}t${l.gap > 0.5 ? ` + 주문 미달 ${n0(l.gap)}t` : ''} → 당겨서 ${n0(pu)}t 채움 → ${rem > 0.5 ? `<b class="bad">${n0(rem)}t 남음</b>` : '<b>다 채움</b>'}</div><ol class="k-act">${acts.join('')}</ol></div>`;
    }).join('')}</div></div>` : '';
    const swHtml = SW.length ? SW.map((x, ix) => {
      const P = PLANS[ix];
      const flow = P.st.map((s_) => `<div class="k-step ${s_.tt > 0.5 ? 'on' : ''}"><div class="h">${s_.k ? `${lab(SEL + s_.k)} <small>${md(s_.from)}~</small>` : '계획 밖 주문 <small>소재 있음</small>'}</div><div class="t">${s_.tt > 0.5 ? `+${n0(s_.tt)}t` : '–'}</div><div class="r">${s_.avail < 0.5 ? (s_.noFit > 0.5 ? `규격 밖 ${n0(s_.noFit)}t` : '소재 확보 주문 없음') : RULE[s_.rule]}${s_.tt > 0.5 && s_.k ? ` · 평균 ${s_.early}일 앞당김` : ''}${s_.skip > 0.5 ? ` · 재고 상한으로 ${n0(s_.skip)}t 제외` : ''}</div></div><div class="k-arr">›</div>`).join('');
      const idle = `<div class="k-step ${P.rem > 0.5 ? 'idle' : 'off'}"><div class="h">남는 양</div><div class="t">${P.rem > 0.5 ? `${n0(P.rem)}t` : '0'}</div><div class="r">${P.rem > 0.5 ? '휴지 검토' : '다 채움'}</div></div>`;
      const stkTxt = P.stk.v != null && P.stk.cap ? `제품 재고 ${P.stk.cur ? '월말 예상' : '그 달 말'} ${n0(P.stk.v)}t / 상한 ${n0(P.stk.cap)}t(${Math.round(P.stk.v / P.stk.cap * 100)}%)${P.held > 0.5 ? ` → 당긴 뒤 ${n0(P.stk.v + P.heldAll)}t(${Math.round((P.stk.v + P.heldAll) / P.stk.cap * 100)}%)` : ''}` : '제품 재고 자료 없음';
      const verdict = P.rem > 0.5
        ? `${P.st.filter((s_) => s_.tt > 0.5).map((s_) => `${s_.k ? lab(SEL + s_.k) : '계획 밖'} ${n0(s_.tt)}t`).join(' · ') || '당길 주문 없음'}${x.need - P.rem > 0.5 ? ' 당겨 생산' : ''} · 남는 ${n0(P.rem)}t → 휴지 검토`
        : `${P.st.filter((s_) => s_.tt > 0.5).map((s_) => `${s_.k ? lab(SEL + s_.k) : '계획 밖'} ${n0(s_.tt)}t`).join(' · ')} 당겨 생산해 다 채움`;
      const pulled = P.st.flatMap((s_) => s_.take.map((e) => ({ ...e, wk: s_.k ? lab(SEL + s_.k) : '계획 밖' })));
      const crossTxt = P.cross.length ? `<span class="bad">${Object.entries(P.cross.reduce((a_, e) => { const k_ = `${e.ln}|${e.k}`; a_[k_] = (a_[k_] || 0) + e.t; return a_; }, {})).map(([k_, v]) => `${k_.split('|')[0]} ${lab(SEL + +k_.split('|')[1])} ${n0(v)}t을 ${esc(x.line)}로 옮김(${k_.split('|')[0]} 그 주 빈 칸)`).join(' · ')}</span>` : '';
      return `<details class="k-card k-sw"><summary><span class="sh"><b>${esc(GN(x.g))} · ${esc(x.line)}</b>${x.al ? ` <span class="k-al">${esc(x.al)}</span>` : ''}</span><span class="sv">못 만드는 양 ${n0(x.need)}t${x.out > 0.5 ? `(소재 ${n0(x.out)}${x.gap ? ` · 주문 미달 ${n0(x.gap)}` : ''})` : x.gap ? '(주문 미달)' : ''} → ${P.rem > 0.5 ? `<b class="idl">남는 ${n0(P.rem)}t</b>` : '<b>다 채움</b>'}${P.cross.length ? ' · <b class="bad">다른 라인 주문 포함</b>' : ''}</span><span class="cv">▾</span></summary>
<div class="k-flow">${flow}${idle}</div>
<div class="k-vd ${P.rem > 0.5 ? 'idle' : ''}">${verdict}<span>${stkTxt}</span>${crossTxt}</div>
<div class="k-swl"><div><h3>미룰 주문(소재 늦음·없음)<span>${n0(x.out)}t</span></h3>${x.push.length ? clist(x.push, 'push', 5) : '<div class="k-more">없음</div>'}</div>
<div><h3>당겨 생산할 주문<span>${n0(P.added)}t</span></h3>${pulled.length ? clist(pulled, 'pull', 5) : '<div class="k-more">당길 주문 없음</div>'}</div></div>
<details class="k-dt"><summary>차주로 미뤄도 되는 주문 ${(x.defer || []).length}건</summary>${(x.defer || []).length ? clist(x.defer, 'defer', 8) : '<div class="k-more">없음</div>'}</details></details>`;
    }).join('') : '<div class="k-card"><div class="k-more">이 주 못 만드는 양 없음</div></div>';
    // 일정 지연 대비(11/17 사용자 '수리나 test, 작업이 예상보다 늦게 진행되면')
    const DL = (K.delay || []).filter((e) => !/재가동/.test(e.ev) && PS.includes(/CGL/.test(e.line) ? 'G' : 'C') && e.to >= (SEL === 0 ? K.today : w.from) && e.from <= W[Math.min(SEL + 3, W.length - 1)].to);
    const dlHtml = DL.length ? DL.map((e, i) => `<div class="k-li op" data-x="dl${i}"><div class="n"><span class="k-tag wait">${esc(e.line)}</span>${esc(e.ev)} · ${md(e.from)}${e.to !== e.from ? `~${md(e.to)}` : ''}</div><div class="t">1일 지연 시 −${n0(e.lost1)}t <span class="cv">▾</span></div>
<div class="d">2일 −${n0(e.lost2)}t · 이후 7일 영향 주문 ${n0(e.totT ?? 0)}t${e.riskT ? ` · <b class="bad">지연 시 추가 납기 지연 ${n0(e.riskT)}t</b>` : ''}${e.lateT ? ` · <span class="dlc">이미 납기 지남 ${n0(e.lateT)}t</span>` : ''}${!e.orders.length ? ' · 판매 주문 없음 — 자가재 생산(지연 시 컬러 소재 영향)' : ''}</div></div>
<div class="k-con sw" id="dl${i}" hidden><div class="r h"><span>계약번호</span><span>톤</span><span>부서 · 목적지</span><span>생산</span><span>납기</span></div>${e.orders.map((z) => `<div class="r"><span>${esc(z.con || '–')}</span><span>${n0(z.t)}</span><span>${esc(GN(z.g))} · ${esc(z.dst || '')}</span><span>${md(z.pd)}</span><span class="${z.risk ? 'bad' : z.late ? 'dlc' : ''}">${md(z.due)}</span></div>`).join('')}
</div>`).join('') : '<div class="k-more">이 기간 수리·M/C·휴지 일정 없음</div>';
    const dlSec = `<div class="k-h">수리·M/C·휴지 지연 대비<small>${lab(SEL)}~${lab(Math.min(SEL + 3, W.length - 1))}</small></div><div class="k-card k-side">${dlHtml}</div>`;
    const VW = [['a', '준비 현황'], ['b', '부족 대응'], ['c', '일정 지연 대비']];
    const seg = `<div class="k-seg">${VW.map(([k, t]) => `<button type="button" data-v="${k}" class="${VIEW === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const pull0 = PLANS.reduce((a_, P) => a_ + P.st.filter((s_) => !s_.k).reduce((b_, s_) => b_ + s_.tt, 0), 0);
    const body = VIEW === 'a' ? `${kpi}<div style="margin:14px 0">${dtab}</div>${ask.replace('@@PULL@@', pull0 > 0.5 ? ` · 이 중 ${n0(pull0)}t은 이번 주 부족분에 당김` : '')}`
      : VIEW === 'b' ? `${sumHtml}<div class="k-h">그룹·라인별 상세<small>눌러서 당길 주문·미룰 주문 계약번호 보기</small></div>${swHtml}`
      : `<div class="k-h">수리·M/C·휴지 지연 대비<small>${lab(SEL)}~${lab(Math.min(SEL + 3, W.length - 1))}</small></div><div class="k-card k-side">${dlHtml}</div>`;
    m.innerHTML = `<div class="k-top"><h1>주간 관제</h1><span class="as">${md(K.today)} 기준 · 주 = 수~화(이번 주 = ${md(W[0].from)}부터) · 계획 = ${K.planAt ? md(K.planAt) + ' 재계획' : '재계획'}·통합 계획</span>${seg}</div>
${chips}${body}
<div class="k-ft">주문 = 그 주 계획 칸을 같은 그룹·목적지(도금은 강종까지) 주문으로 납기 순서대로 채운 양 · 소재: 도금 = 예상 입고(인도기한 + 실측), 컬러 = 발주 인도기한 · 부자재 = 컬러 작업지시 부자재(도료·필름) 상태 · 컬러는 계획이 시장 단위라 부서 전체로 채움 · 자사 주문·재고 전환 계약 제외</div>`;
    m.querySelectorAll('[data-v]').forEach((e) => e.addEventListener('click', () => { VIEW = e.dataset.v; try { sessionStorage.setItem('wk-v', VIEW); } catch (x) { /* 무시 */ } render(D); }));
    m.querySelectorAll('[data-i]').forEach((e) => e.addEventListener('click', () => { SEL = +e.dataset.i; render(D); }));
    m.querySelectorAll('.k-li.op').forEach((e) => e.addEventListener('click', () => { const c = document.getElementById(e.dataset.x); c.hidden = !c.hidden; e.classList.toggle('open', !c.hidden); }));
  }
  let LD = null, SUB = false;
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => render(LD)); } });
})();
