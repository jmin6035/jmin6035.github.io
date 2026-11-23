/* 02 현황(11/17 사용자 '수주 화면을 이 화면으로 대체': 사장님용 한 장, '깔끔하게 · 한 화면에 다 크게 박지 말고')
   도금 | 컬러 × 판매 · 생산 · 소재 · 출하 · 소재 재고 · 제품 재고 · 주문충당량: 숫자(톤 · %)와 막대만, 설명 문구 없음
   숫자 = suju.enc.json 의 hy(tools/suju_build.py hyeonhwang, 2시간 갱신마다 계산)
   · 판매 = 수주 ÷ 판매계획(컬러는 계획재 제외) · 생산 = 판생속보 누계 실적 ÷ 월차계획, 옅은 막대 = 남은 계획(01 일별 가동계획), 이달 예상 = 실적 + 남은 계획(도금은 최근 2주 편차만큼 범위)
   · 소재 = 이달 입고 ÷ 이달 입고 발주 · 출하 = 판매생산속보 출하(내수 송장·수출 B/L) ÷ 이달 출하 계획
   · 다음 달 탭: 판매 = 납기월 확정 주문 ÷ 판매계획(도금 재계획 · 컬러 3개월 계획), 생산 = 월 계획, 제품 재고 = 월말 예상
   · 재고 = 지금(●) → 월말 예상(○), 세로선 = '27 판생 월말 최대 · 주문충당량 = 소재 매치된 주문(컬러 = 판생속보 충당량·작업지시 가능일)
   막대·글자는 HTML(div): SVG 글자는 공통 테마(svg text 13.5px)에 덮이고 폭 따라 작아져서 쓰지 않음(검토 11/17) */
(function () {
  'use strict';
  const { esc, n0 } = CT;
  const pct = (a, b) => (a != null && b ? Math.round(a / b * 100) : null);
  const W = (x) => `${Math.max(0, Math.min(100, x)).toFixed(1)}%`;
  const r100 = (x, f = Math.round) => n0(f(x / 100) * 100);   // 범위는 바깥으로(하한 내림 · 상한 올림: 11/17 검토: 하한 43,300 이 01 현재 계획 43,254 보다 크던 것)

  const sg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + n0(Math.abs(x));
  let PV = '전일';
  const d1 = (v) => (v && v.d1 != null && v.d1 !== 0 ? `<span class="d1">${PV} ${sg(v.d1)}</span>` : '');
  // 그룹별(판매 = 판매 그룹 · 생산 = 라인 · 출하 = 출하 그룹): 늘 펼쳐 보임(11/17 사용자 '이 화면에 적용')
  function sub(p, L, td) {
    if (!L || L.length < 2) return '';
    const ORD = ['도금수출', '도금국내', '도금판매', '자동차', '자동차강판', '컬러수출', '가전내수', '컬러건재', '수요개발', '컬러공장'];   // 11/17 검토: 화면·달마다 같은 순서
    const oi = (g) => { const i = ORD.findIndex((k) => String(g).startsWith(k)); return i < 0 ? 99 : i; };
    L = [...L].sort((a_, b_) => (/CGL|CCL/.test(a_.g) && /CGL|CCL/.test(b_.g) ? String(a_.g).localeCompare(b_.g) : oi(a_.g) - oi(b_.g)));
    return `<div class="hy-sub">${L.map((x) => `<div class="sr"><span class="sn">${esc(x.g)}</span><div class="hy-trk sm ${p}"><i class="fl" style="width:${W(x.plan ? x.act / x.plan * 100 : 0)}"></i>${td != null ? `<i class="td" style="left:${W(td * 100)}"></i>` : ''}</div><span class="sv">${n0(x.act)} / ${n0(x.plan)}톤 <b>(${pct(x.act, x.plan) ?? '–'}%)</b></span></div>`).join('')}</div>`;
  }
  function bar(p, v, cap, td, opt = {}) {
    const a = v.act || 0, pl = v.plan, mx = opt.max || pl || 1;
    const sb = sub(p, opt.grp, td);
    return `<div class="hy-row${sb ? ' hs' : ''}"><div class="hy-num"><b>${n0(a)}</b><small>톤</small><b class="pc">${pct(a, pl) ?? '–'}<small>%</small></b>${d1(v)}</div>
<div class="hy-trk ${p}">${opt.rem ? `<i class="rm" style="width:${W((a + opt.rem) / mx * 100)}"></i>` : ''}<i class="fl" style="width:${W(a / mx * 100)}"></i>
${td != null ? `<i class="td" style="left:${W((opt.tdBase || pl) / mx * td * 100)}"></i>` : ''}${opt.tgt ? `<i class="tg" style="left:${W(pl / mx * 100)}"></i>` : ''}</div>${opt.tgt ? `<div class="hy-tgl"><span class="t1" style="left:${W((opt.tdBase || pl) / mx * (td || 0) * 100)}">오늘까지 목표</span><span class="t2" style="left:${W(pl / mx * 100)}">${esc(cap)}</span></div>` : ''}
<div class="hy-cap">${opt.est ? `<span>이달 예상 <b>${opt.est}</b></span>` : '<span></span>'}<span>${esc(cap)} ${n0(pl)}톤</span></div>${sb}</div>`;
  }
  function prod(p, v, td) {
    const a = v.act || 0, rem = v.rem || 0, pl = v.plan || 0, mx = Math.max(a + rem, pl) * 1.03;
    const [lo, hi] = v.est || [];
    const est = lo == null ? null : lo === hi ? `${r100(lo)}톤` : `${r100(lo, Math.floor)}~${r100(hi, Math.ceil)}톤`;
    return bar(p, v, '판생 계획', td, { max: mx, rem, tgt: true, tdBase: pl, est, grp: v.lines });
  }
  // 다음 달 소재(11/17 사용자 '12월·1월 소재: 이미 나간 발주'): 확보 = 월초 재고(이달 월말 예상) + 이미 나간 발주 입고 예정 · 대비 = 그 달 사용 계획
  // 11/17 사용자 '재고는 재고대로 발주는 발주대로 구분': 다음 달 소재를 두 행으로: 소재별(도금 F/H·SUS / 컬러 CGI·AZ·EGI·SUS…)
  const SN = (n) => ({ 'GALVALUME(AZ)': 'AZ', 'PosMAC1.5': 'MAC1.5', 'PosMAC3.0': 'MAC3.0', 'ALUMINIUM': 'AL', 'F/H(GI/GL용)': 'F/H GI·GL', 'F/H(AL용)': 'F/H AL', 'F/H(Ti용)': 'F/H Ti' }[n] || n);
  const TD = new Date().toLocaleDateString('sv-SE');
  const mdd = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8)}${d === TD ? '(오늘)' : ''}` : '');   // 마감이 오늘이면 '(오늘)'(11/17 검토)
  function matStock(p, v, sm) {
    if (!v || !v.by) return '<div class="hy-na">자료 없음</div>';
    const L = v.by.filter((z) => z[3] > 0.5), cap = sm && sm.cap, bg = sm ? sm.beg : v.beg, en = sm ? sm.end : v.endT, su = sm && sm.sus;
    return `<div class="hy-row"><div class="hy-num sk"><span class="kv"><span class="hlb">월초</span><b>${n0(bg)}<small>톤</small></b></span><span class="ar">→</span><span class="kv"><span class="hlb">월말</span><b class="${(cap && en > cap) || (en < 0.5 && bg > 0.5) ? 'bad' : ''}">${n0(en)}<small>톤</small>${en < 0.5 && bg > 0.5 ? ' (재고 없음)' : cap ? `<small> · 상한의</small> ${pct(en, cap)}%` : ''}</b></span></div>
<div class="hy-mn">${(v.shortBy || []).filter((z) => z[6] && (p !== 'G' || z[0] !== 'SUS')).map((z) => `<b class="bad">${esc(SN(z[0]))} <b class="dt">${mdd(z[6])}</b>부터 부족</b> · `).join('')}월말 = 추가 발주 없을 때${cap ? ` · 상한 ${n0(cap)}톤` : ''}</div>
<div class="hy-sub">${L.filter(([n, , , u]) => u >= 0.5 && !(p === 'G' && n === 'SUS')).map(([n, b, , u]) => `<div class="sr"><span class="sn">${esc(SN(n))}</span><div class="hy-trk sm ${p}"><i class="fl" style="width:${W(Math.min(100, b / u * 100))}"></i></div><span class="sv">월초 재고로 ${b >= u ? '<b>충분</b>' : `<b>${pct(b, u)}%</b>`}</span></div>`).join('')}</div></div>`;   // 11/17 검토: 100% 넘으면 '충분'(1151% 같은 값 안 보임)
  }
  function matPo(p, v) {
    if (!v || !v.by) return '<div class="hy-na">자료 없음</div>';
    const SB = Object.fromEntries((v.shortBy || []).map((z) => [z[0], z]));
    const L = v.by.filter((z) => !(p === 'G' && z[0] === 'SUS')).filter((z) => z[3] > 0.5 || z[2] > 0.5 || (v.shortBy || []).some((y) => y[0] === z[0] || y[0].startsWith(z[0] + '(')));   // 부족 판정이 있는 소재는 사용·입고 없어도 보임
    const one_ = (z, lb) => [z[1] > 0.5 ? `<b class="bad">${lb}발주 지연 ${n0(z[1])}톤</b>` : '', z[2] > 0.5 ? `<b class="warn">${lb}추가 발주 ${n0(z[2])}톤 · 마감 <b class="dt">${z[3] === z[4] ? mdd(z[3]) : `${mdd(z[3])}~${mdd(z[4])}`}</b></b>` : ''].filter(Boolean).join(' · ');
    const stat = (n) => { if (p === 'G' && n === 'SUS') return '<span class="ok">지급재</span>'; const zs = (v.shortBy || []).filter((z) => z[0] === n || z[0].startsWith(n + '(')); if (!zs.length) return '<span class="ok">확보</span>'; return zs.map((z) => one_(z, z[0] === n ? '' : `${esc(z[0].slice(n.length).replace(/[()]/g, ''))} `)).join('<br>'); };   // 11/17 검토: F/H 는 코드별(AL용·GI/GL용) 판정
    const sl = v.staleBy ? v.staleBy.map(([n_, t_]) => [n_, 0, 0, 0, 0, t_]) : (v.shortBy || []).filter((z) => z[5] > 0.5);
    return `<div class="hy-row"><div class="hy-num"><b>${n0(v.arr - (p === 'G' ? ((v.by.find((z) => z[0] === 'SUS') || [])[2] || 0) : 0))}</b><small>톤</small><span class="d1">입고 예정</span></div>
<div class="hy-po">${L.map(([n, , a]) => `<div class="pr"><span class="sn">${esc(SN(n))}</span><span class="pa">입고 ${n0(a)}</span><span class="ps">${stat(n)}</span></div>`).join('')}</div>
${v.stale > 0.5 ? `<div class="hy-mn"${sl.length ? ` title="${sl.map((z) => `${esc(z[0])} ${n0(z[5])}톤`).join(' · ')}"` : ''}>입고 확인 필요 ${n0(v.stale)}톤(예정일 30일 경과)</div>` : ''}</div>`;
  }
  function matNext(p, v) {
    if (!v) return '<div class="hy-na">자료 없음</div>';
    // 확보율 = 소재별 min(확보, 필요) 합 ÷ 필요(남는 소재가 모자란 소재를 덮지 않음) · 모자란 몫은 그날 발주 마감(부족 시작일 − 리드타임)으로 나눔:
    // 마감 지남 = 빨강 '부족'(지금 발주해도 못 댐) · 마감 전 = 주황 '발주 필요(마감 범위)'(검토 11/17)
    const md_ = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8)}` : '');
    const rg = (a, b) => (a === b ? md_(a) : `${md_(a)}~${md_(b)}`);
    const one = (n, late, op, a, b) => [late > 0.5 ? `<b class="bad">${n}발주 지연 ${n0(late)}</b>` : '', op > 0.5 ? `<b class="warn">${n}발주 필요 ${n0(op)} · 마감 ${rg(a, b)}</b>` : ''].filter(Boolean).join(' · ');
    const lines = (v.shortBy || []).map(([n, late, op, a, b]) => one(`${esc(SN(n))} `, late, op, a, b));
    const pc_ = pct(v.cov, v.use), hv = (v.beg || 0) + (v.arr || 0) || 1, cb = v.cov * (v.beg || 0) / hv, ca = v.cov * (v.arr || 0) / hv;   // 막대 = 필요 대비 소재별 확보(남는 소재로 모자란 소재를 덮지 않음), 재고·발주 비율로 나눔
    const sl = v.staleBy ? v.staleBy.map(([n_, t_]) => [n_, 0, 0, 0, 0, t_]) : (v.shortBy || []).filter((z) => z[5] > 0.5), st = sl.length ? `빼고 계산: 예정일 30일 넘게 지난 미입고 ${sl.map((z) => `${esc(z[0])} ${n0(z[5])}t`).join(' · ')}(입고 여부 확인)` : '';
    // 11/17 사용자 '소재는 발주랑 재고를 같이 만들었노 구분해라': 월초 재고 · 발주 입고 예정을 따로(막대도 두 칸)
    return `<div class="hy-row"><div class="hy-m2"><div><span>월초 재고${!v.beg ? '(전달 소진)' : ''}</span><b>${n0(v.beg)}</b><small>톤</small></div><div><span>발주 입고 예정</span><b>${n0(v.arr)}</b><small>톤</small></div><div><span>필요</span><b>${n0(v.use)}</b><small>톤</small></div><div><span>확보율</span><b class="${pc_ < 100 ? (lines.some((l) => l.includes('bad')) ? 'bad' : 'warn') : ''}">${pc_ ?? '–'}</b><small>%</small></div></div>
<div class="hy-trk ${p}"><i class="fl" style="width:${W(cb / (v.use || 1) * 100)}"></i><i class="po" style="left:${W(cb / (v.use || 1) * 100)};width:${W(ca / (v.use || 1) * 100)}"></i></div>
${lines.filter(Boolean).map((l) => `<div class="hy-ms">${l}</div>`).join('')}${st ? `<div class="hy-mn">${st}</div>` : ''}</div>`;
  }
  // 11/18 사용자 '더 직관적으로': 재고 = '현재'·'월말' 막대 두 줄 + 상한 세로선(이름 붙임). 상한 안 = 회색, 넘는 몫 = 빨강, 막대 끝에 톤·상한 대비 %
  function skRows(v, rows) {
    const { cap } = v; if (!cap) return '<div class="hy-na">자료 없음</div>';
    const mx = Math.max(cap, ...rows.map((r) => r[1] || 0)) * 1.08, xc = cap / mx * 100;
    const one = ([lb, x, extra]) => { const y = x || 0, w = Math.min(y, cap) / mx * 100, o = Math.max(0, y - cap) / mx * 100, over = y > cap;
      return `<div class="sk-r"><span class="sk-l">${lb}</span><div class="sk-b"><i class="in" style="width:${W(w)}"></i>${o > 0 ? `<i class="ov" style="left:${W(xc)};width:${W(o)}"></i>` : ''}</div><span class="sk-v"><b class="${over ? 'bad' : ''}">${n0(y)}</b><small>톤</small> <em class="${over ? 'bad' : ''}">${pct(y, cap)}%</em>${extra || ''}</span></div>`; };
    return `<div class="hy-row sk2"><div class="sk-cap" style="--xc:${xc}%"><span>상한 ${n0(cap)}톤</span></div><div class="sk-w" style="--xc:${xc}%">${rows.map(one).join('')}</div>${v.lab ? `<div class="hy-mn"${v.sr != null ? ` title="판생 재고 ${n0(v.sr)}톤"` : ''}>${esc(v.lab)}</div>` : ''}</div>`;
  }
  function stockEnd(v) {
    if (!v || v.end == null || !v.cap) return '<div class="hy-na">계획 기간 밖 · 자료 없음</div>';
    return skRows(v, [['월말', v.end]]);
  }
  function stock(v) {
    if (!v || v.now == null || !v.cap) return '<div class="hy-na">자료 없음</div>';
    return skRows(v, [['현재', v.now, d1(v)], ['월말', v.end]]);
  }
  const cover = (L, noDays) => `<div class="hy-cv">${(L || []).map((x) => `<div class="c${x.days != null && x.days < 7 ? ' r' : ''}"><div class="n">${esc(x.line)}</div><div class="v">${n0(x.t)}<small>톤</small></div>${noDays ? '' : `<div class="d">${x.days != null ? x.days + '일치' : '–'}</div>`}</div>`).join('')}</div>`;

  let MI = 0;
  try { MI = +sessionStorage.getItem('hy-mi') || 0; } catch (e) { /* 저장 못 해도 화면은 그대로 */ }
  function render(D) {
    const S = D.suju || {}, H = S.hy, m = document.getElementById('ct-main');
    if (!H) { m.innerHTML = '<section class="card"><h2>현황 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const sc = window.UI && UI.scope ? UI.scope() : 'all', PS = sc === 'G' ? ['G'] : sc === 'C' ? ['C'] : ['G', 'C'];
    const MS = H.months || [], td = H.day / H.nDays, mo = +H.asOf.slice(5, 7), dd = `${mo}/${+H.asOf.slice(8)}`;
    if (MI > MS.length) MI = 0;
    { const y = new Date(H.asOf); y.setDate(y.getDate() - 1); const ys = y.toISOString().slice(0, 10); PV = !H.prevAsOf || H.prevAsOf === ys ? '전일' : `${+H.prevAsOf.slice(5, 7)}/${+H.prevAsOf.slice(8)} 대비`; }
    const tabs = [`${mo}월`, ...MS.map((x) => `${+x.ym.slice(5)}월`)];
    const M = MI ? MS[MI - 1] : null, mm = M ? +M.ym.slice(5) : mo;
    const R = M ? [
      ['주문', '판매계획 대비 주문', null, (p) => bar(p, M[p].sales, '판매계획', null, { grp: M[p].sales.grp })],
      ['생산', '월 계획', 'gyehoek.html', (p) => `<div class="hy-row"><div class="hy-num"><b>${n0(M[p].prod.plan)}</b><small>톤</small></div>${cover((M[p].prod.lines || []).map((x) => ({ line: x.g, t: x.plan })), true)}</div>`],
      ['소재 입고', '입고 예정 · 추가 발주', 'matcal.html', (p) => matPo(p, M[p].mat)],
      ['소재 재고', '월초 → 월말', null, (p) => matStock(p, M[p].mat, M[p].stockMat)],
      ['제품 재고', '월말 예상', 'integrated.html', (p) => stockEnd(M[p].stockPdt)],
      ['총 재고', '소재 + 제품 · 월말', null, (p) => stockEnd(M[p].stockAll)],
    ] : [
      ['주문', '생산 실적 + 확정 주문', null, (p) => bar(p, H[p].sales, H[p].sales.note ? `판매계획(${H[p].sales.note})` : '판매계획', null, { grp: H[p].sales.grp })],
      ['생산', '판생 계획 대비 실적', 'gyehoek.html', (p) => prod(p, H[p].prod, td)],
      ['소재', `입고 실적 / ${mo}월 입고 계획`, 'gyehoek.html#mat', (p) => bar(p, NW && NW[p] ? Object.assign({}, H[p].mat, { act: Math.round(NW[p].act), plan: Math.round(NW[p].plan) }) : H[p].mat, `${mo}월 입고 계획`, td)],   // 11/19 검수 틀림 1: 입고 계획 = 01 소재와 같은 값(입고 완료·예정 + 미발주, ui/proccalc 같은 계산)
      ['출하', '계획 대비 출하', null, (p) => bar(p, H[p].ship, '판매계획', td, { grp: H[p].ship.grp })],
      ['소재 재고', '현재 → 월말', null, (p) => stock(H[p].stockMat)],
      ['제품 재고', '현재 → 월말', 'integrated.html', (p) => stock(H[p].stockPdt)],
      ['총 재고', '소재 + 제품 · 현재 → 월말', null, (p) => stock(H[p].stockAll)],
      ['작업 가능 주문', '소재 들어온 주문', 'pyeonseong.html', (p) => cover(WD ? (H[p].cover || []).map((x) => (WD[x.line] ? { ...x, t: WD[x.line].t, days: WD[x.line].days } : x)) : H[p].cover)],
    ];
    const sec = (a, b, u) => u ? `<a class="sec" href="${u}"><b>${a} ›</b><small>${b}</small></a>` : `<div class="sec"><b>${a}</b><small>${b}</small></div>`;
    const cell = (p, a, h) => `<div class="cell" data-pl="${p === 'G' ? '도금' : '컬러'} · ${a}">${h}</div>`;
    m.innerHTML = `<div class="hy-top"><h1>${mm}월 판매·생산 현황</h1><span>${M ? `주문 <b class="dt">${dd}</b> 기준 · 생산·재고는 계획값` : `실적 <b class="dt">${dd}</b>까지`}</span>
<div class="hy-tabs">${tabs.map((t, i) => `<button type="button" data-mi="${i}" class="${i === MI ? 'on' : ''}">${t}</button>`).join('')}</div></div>
<div class="hy-g${PS.length < 2 ? ' one' : ''}"><div></div>${PS.map((p) => `<div class="hd ${p === 'G' ? 'g' : 'c'}">${p === 'G' ? '도금' : '컬러'}</div>`).join('')}
${R.map(([a, b, u, f]) => `${sec(a, b, u)}${PS.map((p) => cell(p, a, f(p))).join('')}`).join('')}</div>
<div class="hy-lg">${M ? `${UI.inScope('G') ? '<span><i class="k-g"></i>도금 주문·소재 확보</span>' : ''}${UI.inScope('C') ? '<span><i class="k-c"></i>컬러 주문·소재 확보</span>' : ''}` : '<span><i class="k-g"></i>도금 실적</span><span><i class="k-c"></i>컬러 실적</span>'}${M ? '' : '<span><i class="k-rm"></i>남은 계획</span><span><i class="k-tg"></i>판생 계획</span><span><i class="k-td"></i>오늘까지 목표</span>'}<span><i class="k-ov2"></i>상한 넘는 재고</span>${M ? '<span>○ 월말</span>' : '<span class="bad">빨강 = 7일치 미만</span>'}</div>`;
    m.querySelectorAll('.hy-tabs button').forEach((b) => b.addEventListener('click', () => { MI = +b.dataset.mi; try { sessionStorage.setItem('hy-mi', MI); } catch (e) { /* 무시 */ } render(D); }));
  }
  let LD = null, SUB = false;
  // 11/18 결정(검수 결정전달 기준 2): '작업 가능 주문 n일치' = 03 주간 편성 라인별 작업가능일(ct_orders.js CTORD.lineDays) 그대로
  let WD = null, NW = null;
  /* 이달 소재 입고 실적·입고 계획 = 01 소재와 같은 함수·같은 입력(11/19 검수 틀림 1: Python 묶음은 기준 시점·수동 입고 입력이 달라 계속 어긋남):
     실입고 = 포털 matAct.inb(오늘 전) · 입고 예정·지연 = ProcCalc.autoArr + 이 브라우저 입고 입력(S.arr) · 미발주 = ProcCalc 부족분(입고 필요일이 이달) */
  const nwLoad = async () => { if (NW || !window.ProcCalc || !window.GP || !LD || !LD.suju) return; try {
    let pw = null; try { pw = localStorage.getItem('cgl-analysis-pw'); } catch (x) { /* 무시 */ } if (!pw) return;
    const [eP, eO] = await Promise.all([GP.latest('procure.enc.json'), GP.latest('portal.enc.json')]); if (!eP || !eO) return;
    const [P, PO] = await Promise.all([GP.decryptJSON(eP, pw), GP.decryptJSON(eO, pw)]);
    const td = UI.today(), mon = String(LD.suju.hy.asOf).slice(0, 7), inM = (d) => String(d || '').slice(0, 7) === mon;
    let S = null; const C = ProcCalc.make(() => ({ D: P, S })); S = C.load();
    const out = { G: { act: 0, plan: 0 }, C: { act: 0, plan: 0 } }, add = (pl, k, t) => { if (out[pl]) out[pl][k] += t; };
    for (const [key, t] of Object.entries((PO.matAct || {}).inb || {})) { const [pl, , , d] = key.split('|'); if (d < td && t >= 0.05 && inM(d)) { add(pl, 'act', t); add(pl, 'plan', t); } }
    for (const a of [...C.autoArr(), ...(S.arr || []).map((x) => ({ ...x, plant: ProcCalc.plantOf(x.code), t: +x.t || 0 }))]) if (inM(a.date)) add(a.plant, 'plan', a.t || 0);
    for (const j of C.judge()) { if (j.kind === 'pos' || j.short < 1) continue; const d = j.needBy < td ? td : j.needBy; if (!inM(d)) continue; for (const x of j.split || []) if (x.t >= 1) add(j.plant, 'plan', x.t); }
    NW = out; render(LD);
  } catch (x) { console.warn('소재 입고', x); } };
  const wdLoad = async () => { if (WD || !window.CTORD || !window.GP) return; try { let pw = null; try { pw = localStorage.getItem('cgl-analysis-pw'); } catch (x) { /* 무시 */ } const E = await Promise.all(CTORD.FILES.map((f) => GP.latest(f).catch(() => null))), X = {};
    for (let k = 0; k < E.length; k++) X[CTORD.FILES[k].replace(/\.enc\.json$/, '')] = E[k] ? await GP.decryptJSON(E[k], pw).catch(() => null) : null;
    WD = CTORD.lineDays(X); if (LD) render(LD); } catch (e) { console.warn('작업 가능 일수', e); } };
  CT.boot(['suju.enc.json'], (D) => { LD = D; render(D); wdLoad(); nwLoad(); if (!SUB && window.UI && UI.onScope) { SUB = true; UI.onScope(() => render(LD)); } });
})();
