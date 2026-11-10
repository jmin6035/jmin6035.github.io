/* 컬러 주문진도(11/11 '컬러 주문·납기'에서 이름 통일): published/cc_order_progress.enc.json (tools/cc_order_progress.py)
   11/3 사용자 '주문 납기 컬러 버전 — 재고기반 주문서·소재발주·자가재 구분, 소재 매치 됐다/안 됐다를 주문·납기 탭과 최대한 똑같이'
   원천 = MES 작업지시대상선정(SSCHC1010) 라인별(주문·생산·지시·잔여·매치·소재량·작업예정) + 가동편성(가동가능일) + 주문서 소재 연결 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', BY_KEY = 'cc-order-by';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
  let O = null;
  const md = (s) => { if (!s) return ''; s = String(s); const y = O && O.asOf && s.slice(0, 4) < O.asOf.slice(0, 4);   // 기준일보다 앞 해면 YY/MM/DD(작년 발주가 올해 입고 뒤로 보이지 않게)
    return y ? `${s.slice(2, 4)}/${s.slice(5, 7)}/${s.slice(8, 10)}` : `${+s.slice(5, 7)}/${+s.slice(8, 10)}`; };
  let flt = 'act', q = '', ln = '', by = 'cus';
  try { by = localStorage.getItem(BY_KEY) || 'cus'; } catch (e) { /* 무시 */ }
  const act = (x) => x.st === '소재 없음' || x.lateCan || (x.lateDue && x.st !== '매치 완료');
  const F = {
    act: ['조치 필요', act],
    nomch: ['미매치', (x) => x.st !== '매치 완료'],
    mch: ['매치 완료', (x) => x.st === '매치 완료'],
    stock: ['소재 있음(매치 전)', (x) => x.st === '소재 있음'],
    wait: ['입고 대기', (x) => x.st === '입고 대기'],
    none: ['소재 없음', (x) => x.st === '소재 없음'],
    late: ['납기 경과', (x) => x.lateDue],
    all: ['전체', () => true],
  };
  const BY = { cus: ['고객사', (x) => x.cus || (O.cusLoaded ? '고객사 미확인' : '고객사 — 다음 자동 실행부터')], man: ['담당자', (x) => x.man || '담당자 미확인'], route: ['소재 경로', (x) => x.route] };
  if (!BY[by]) by = 'cus';
  const ST = { '매치 완료': 'ok', '소재 있음': 'mid', '입고 대기': 'hurry', '소재 없음': 'late' };
  const stBadge = (x) => `<span class="st ${ST[x.st] || 'na'}">${esc(x.st)}</span>` + (x.lateDue ? '<div class="sub" style="color:var(--bad);font-weight:700">납기 경과</div>' : '');
  const GS = { 컬러수출그룹: '컬러수출', 컬러건재판매그룹: '컬러건재', 수요개발그룹: '수요개발' };
  const gs = (g) => GS[g] || g;
  function matCell(x) {                                       // 소재 연결: 재고기반(규격상 재고) · 소재 발주(공급사·발주일·인도기한·입고) · 자가재(도금 주문 진행)
    const out = [`<span class="ch rt-${x.route === '소재발주' ? 'po' : x.route === '재고기반' ? 'stk' : 'etc'}">${esc(x.route)}</span>`];
    if (x.route === '재고기반') out.push(x.matT > 0.0005 ? `<div>규격 재고 <b>${n1(x.matT)}t</b></div>` : '<div class="rem">규격 재고 없음</div>');
    if (x.po) {
      const p = x.po;
      out.push(`<div class="nw">발주 <b>${esc(p.no)}</b>${p.sup ? ` · ${esc(p.sup)}` : ''}</div>`);
      if (p.t) out.push(`<div class="sub">${n1(p.t)}t${p.ordDt ? ` · 발주 ${md(p.ordDt)}` : ''}${p.dle ? ` · 인도기한 ${md(p.dle)}` : ''}</div>`);
      out.push(`<div class="sub">입고 ${n1(p.entT)}t${p.entFirst ? ` (첫 ${md(p.entFirst)})` : ''}${p.stock ? ` · 재고 ${n1(p.stock)}t` : ''}</div>`);
    } else if (x.route === '소재발주') out.push('<div class="rem">소재 발주 미연결</div>');
    if (x.self) out.push(`<div class="nw">자가재 <b>${esc(x.self)}</b></div>${x.selfSt ? `<div class="sub">도금 ${esc(x.selfSt.st || '')}${x.selfSt.prodT ? ` · 생산 ${n1(x.selfSt.prodT)}t` : ''}${x.selfSt.sche ? ` · 예정 ${md(x.selfSt.sche)}` : ''}</div>` : ''}`);
    return out.join('');
  }
  function row(x) {
    const clr = `${x.top ? `<span class="ch clr" title="Top Color">${esc(x.top)}</span>` : ''}<div class="sub" title="Primer · Back">${[x.pri && `P ${esc(x.pri)}`, x.back && `B ${esc(x.back)}`].filter(Boolean).join(' · ')}</div>`;
    const pct = x.ordT ? Math.min(100, x.prodT / x.ordT * 100) : 0;
    return `<tr><td>${stBadge(x)}</td>`
      + `<td><div class="con">${esc(x.con)}</div><div class="sub">${esc(x.line)}${x.spec ? ` · <span style="white-space:nowrap">규격 ${window.UI && UI.specHtml ? UI.specHtml(x.spec) : esc(x.spec)}</span>` : ''}${x.pdt ? ` · ${esc(x.pdt)}` : ''}${by !== 'man' && x.man ? ` · 담당 ${esc(x.man)}` : ''}${by !== 'cus' && x.cus ? ` · ${esc(x.cus)}` : ''}</div></td>`
      + `<td><div class="sz">${x.thk != null ? `${(+x.thk).toFixed(2)} × ${n0(x.wdt)}` : ''}</div>${clr}</td>`
      + `<td class="nw">납기 <b class="${x.lateDue ? 'neg' : ''}">${md(x.due) || '-'}</b></td>`
      + `<td class="num"><b>${n1(x.remT)}t</b><div class="sub">주문 ${n1(x.ordT)} · 생산 ${n1(x.prodT)}</div><div class="hb" style="--gc:var(--g3a);margin-top:4px" title="생산 ${Math.round(pct)}%"><i style="width:${pct.toFixed(1)}%"></i></div></td>`
      + `<td class="num">${x.mchT > 0.0005 ? `<b>${n1(x.mchT)}t</b>` : '<span class="sub">매치 0</span>'}${x.woT ? `<div class="sub">지시 ${n1(x.woT)}t</div>` : ''}</td>`
      + `<td>${matCell(x)}</td>`
      + `<td class="num">${x.sche ? `<div>예정 <b>${md(x.sche)}</b></div>` : '<span class="sub">-</span>'}${x.can ? (x.can <= O.asOf ? `<div class="sub" title="가동가능일(도료·PF·잉크·라미 입고 중 가장 늦은 날) ${md(x.can)} — 경과">가동 가능</div>` : `<div class="${x.lateCan ? 'rem' : 'sub'}" title="가동가능일 = 도료·PF·잉크·라미 입고 중 가장 늦은 날">가능 ${md(x.can)}${x.canBy ? ` · ${esc(String(x.canBy).replace('입고예정일', '').replace('생산일', ''))}` : ''}</div>`) : ''}</td></tr>`;
  }
  const COLS = '<colgroup>' + [8, 14, 13, 8.5, 11, 9, 21.5, 15].map((w) => `<col style="width:${w}%">`).join('') + '</colgroup>';
  const HEAD = '<thead><tr><th>상태</th><th>계약번호-행번</th><th>두께×폭 · 색</th><th>납기</th><th class="num" title="미생산 = 주문량 − 생산량(MES 주문잔여량)">미생산 · 주문 · 생산</th><th class="num">매치 · 지시</th><th>소재 연결</th><th class="num">작업 예정 · 가동가능</th></tr></thead>';
  const sumOf = (L) => ({ n: L.length, rem: L.reduce((s, x) => s + x.remT, 0), late: L.filter((x) => x.lateDue).length, none: L.filter((x) => x.st === '소재 없음').length, nomch: L.filter((x) => x.st !== '매치 완료').length });
  const stat = (S) => `<span class="gs"><b>${n0(S.n)}</b>건</span><span class="gs">미생산 <b>${n0(S.rem)}</b>t</span>`
    + (S.nomch ? `<span class="gs warn">미매치 <b>${S.nomch}</b></span>` : '') + (S.none ? `<span class="gs bad">소재 없음 <b>${S.none}</b></span>` : '') + (S.late ? `<span class="gs bad">납기 경과 <b>${S.late}</b></span>` : '');
  function grpChart(byG) {                                    // 판매그룹별 잔량 = 매치 완료 + 소재 있음 + 입고 대기 + 소재 없음(t)
    if (!byG.length) return '';
    const sm = (L) => { const t = (s) => L.filter((x) => x.st === s).reduce((a, x) => a + x.remT, 0); return { m: t('매치 완료'), s: t('소재 있음'), w: t('입고 대기'), z: t('소재 없음'), ...sumOf(L) }; };
    const R = [['합계', sm(byG.flatMap(([, v]) => v))], ...byG.map(([g, v]) => [g, sm(v)])], mx = Math.max(1, ...R.map(([, s]) => s.rem));
    const P = (v) => (100 * v / mx).toFixed(2) + '%';
    const tr = ([g, s], i) => `<tr${i === 0 ? ' class="tot"' : ''}><td>${i ? `<a href="#og-${i - 1}"><b>${esc(gs(g))}</b></a>` : `<b>${esc(gs(g))}</b>`}</td><td class="num">${n0(s.n)}</td>`
      + `<td class="gbcell"><div class="gb" title="${esc(gs(g))} 미생산 ${n0(s.rem)}t = 매치 완료 ${n0(s.m)} + 소재 있음 ${n0(s.s)} + 입고 대기 ${n0(s.w)} + 소재 없음 ${n0(s.z)}"><span class="gbr"><i class="a" style="width:${P(s.m)}"></i><i class="m" style="width:${P(s.s)}"></i><i class="w" style="width:${P(s.w)}"></i><i class="z" style="width:${P(s.z)}"></i></span><span class="gbv">${n0(s.rem)}t</span></div></td>`
      + `<td class="num">${n0(s.m)}</td><td class="num">${n0(s.s)}</td><td class="num">${n0(s.w)}</td><td class="num ${s.z ? 'bad' : ''}">${n0(s.z)}</td><td class="num ${s.late ? 'bad' : ''}">${s.late || '-'}</td></tr>`;
    return '<div class="gcard"><div class="gbl"><span><i class="a"></i>매치 완료</span><span><i class="m"></i>소재 있음(매치 전)</span><span><i class="w"></i>입고 대기</span><span><i class="z"></i>소재 없음</span><span class="sub">미생산 톤</span></div>'
      + '<div class="scroll"><table class="t gtab"><thead><tr><th>그룹</th><th>건</th><th>미생산 t</th><th>매치 완료 t</th><th>소재 있음 t</th><th>입고 대기 t</th><th>소재 없음 t</th><th>납기 경과 건</th></tr></thead>'
      + `<tbody>${R.map((x, i) => tr(x, i)).join('')}</tbody></table></div></div>`;
  }
  const ORD = { '소재 없음': 0, '입고 대기': 1, '소재 있음': 2, '매치 완료': 3 };
  function sub(name, L, i) {
    const S = sumOf(L);
    L.sort((a, b) => (ORD[a.st] - ORD[b.st]) || (b.lateDue - a.lateDue) || String(a.due || '9').localeCompare(String(b.due || '9')) || a.con.localeCompare(b.con));
    return `<details class="sg"${S.none && L.length <= 40 && i < 2 ? ' open' : ''}><summary><span class="sn">${esc(name)}</span><span class="ss">${stat(S)}</span></summary>`
      + `<div class="scroll od-wrap"><table class="t od">${COLS}${HEAD}<tbody>${L.map(row).join('')}</tbody></table></div></details>`;
  }
  function group(g, L, gi) {
    const m = new Map();
    for (const x of L) { const k = BY[by][1](x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    const subs = [...m.entries()].map((e) => [e[0], e[1], sumOf(e[1])]).sort((a, b) => (b[2].none - a[2].none) || (b[2].late - a[2].late) || (b[2].n - a[2].n));
    return `<section class="og" id="og-${gi}"><header class="og-h"><h2>${esc(gs(g))}</h2><div class="og-s">${stat(sumOf(L))}</div></header>`
      + `<div class="og-b">${subs.map(([k, v], i) => sub(k, v, i)).join('')}</div></section>`;
  }
  /* 첫 화면 결론(11/11): 조치가 필요한 묶음(건·미생산 t)을 크게 → 누르면 아래 목록이 그 묶음만 · 이번 주(수~화) 납기 한 줄 */
  const TOP = ['none', 'late', 'wait', 'stock', 'act'], TIP = { none: '규격 재고·발주·자가재 모두 없음 — 소재 발주 필요', late: '납기일 지남 · 생산 남음', wait: '소재 발주·자가재 입고 대기', stock: '규격 맞는 재고 있음 — 매치만 하면 됨', act: '소재 없음 + 도료·소재 준비가 납기 이후 + 납기 경과 미매치' };
  const wed = (s) => { const d = new Date(s + 'T00:00:00Z'); return new Date(d.getTime() - ((d.getUTCDay() + 4) % 7) * 864e5).toISOString().slice(0, 10); };
  const addD = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  function topCard(R) {
    const sm = (X) => ({ n: X.length, t: X.reduce((a, x) => a + (x.remT || 0), 0) });
    const tiles = TOP.map((f) => { const S = sm(R.filter(F[f][1])), tone = f === 'none' || f === 'late' ? 'bad' : f === 'act' ? 'warn' : '';
      return `<button type="button" data-f="${f}" aria-pressed="${f === flt}" class="${S.n ? tone : ''}${f === 'act' ? ' all' : ''}" title="${esc(TIP[f])}"><div class="l">${F[f][0]}</div><div class="v">${n0(S.n)}<small>건</small></div><div class="s">미생산 ${n0(S.t)}t</div></button>`; }).join('');
    const td = window.UI && UI.today ? UI.today(O.asOf) : O.asOf, w0 = wed(td), w1 = addD(w0, 6), W = R.filter((x) => x.due && x.due >= w0 && x.due <= w1), WN = W.filter((x) => x.st !== '매치 완료');
    return `<section class="card od-top"><h2>지금 문제 · 할 일 <small>누르면 아래 목록이 그 계약만</small></h2><div class="od-kpi od-k5" id="od-kpi">${tiles}</div>`
      + `<p class="od-wk">이번 주(${md(w0)}~${md(w1)}) 납기 <b>${n0(W.reduce((a, x) => a + x.remT, 0))}t</b> · ${n0(W.length)}건${WN.length ? ` · 그중 미매치 <b class="neg">${n0(WN.reduce((a, x) => a + x.remT, 0))}t</b>` : ' · 모두 매치 완료'}</p></section>`;
  }
  function basisFold() {
    const li = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    return `<details class="fold od-fold"><summary>기준·사양</summary><dl class="od-def">`
      + li('기준일', `${UI.fmtDate(O.asOf)} · ${O.lines.map((l) => `${l} ${md(O.srcs[l].date)}`).join(' · ')}${O.missing.length ? ` · ${O.missing.join('·')} 자료 없음` : ''}`)
      + li('대상', 'MES 작업지시대상선정 라인별 주문 — 미생산 0 이하·1,000kg 이하 제외(계약번호 5번째 T·Q 는 포함)')
      + li('미생산', '주문량 − 생산량(MES 주문잔여량)')
      + li('소재 경로', '계약번호 6번째 C = 재고기반(규격상 재고), M = 소재 발주 + 고객주문 · 자가재 = 도금 주문 연결')
      + li('매치', 'MES 작업지시대상선정 매치량 · 소재 있음(매치 전) = 규격 맞는 재고가 있으나 매치 전')
      + li('가동 가능일', '도료·PF·잉크·라미 입고 중 가장 늦은 날')
      + li('규격 이름', 'MES 코드표(주문규격기준·컬러소재규격)의 규격 번호·품질 등급(CQ 일반용 · DQ 가공용 · DDQ 심가공용 · EDDQ 초심가공용 · Gr 구조용)으로 붙인 이름 — 마우스를 올리면 원코드')
      + li('참고', '<a href="leadtime.html">소재 리드타임 표 →</a> · <a href="risk.html">납기 위험 →</a> · <a href="ct_orders.html#track">주문진도(작업지시대상 단계) →</a>')
      + '</dl></details>';
  }
  function render() {
    const R = O.rows;
    let L = R.filter(F[flt][1]);
    if (ln) L = L.filter((x) => x.line === ln);
    if (q) { const qq = q.toUpperCase(); L = L.filter((x) => [x.con, x.man, x.cus, x.top, x.spec, window.UI && UI.specKo && (UI.specKo(x.spec) || {}).ko, x.grp, x.po && x.po.no, x.self].join(' ').toUpperCase().includes(qq)); }
    const G0 = O.groups || [];
    const groups = G0.concat([...new Set(L.map((x) => x.grp))].filter((g) => !G0.includes(g)));
    const byG = groups.map((g) => [g, L.filter((x) => x.grp === g)]).filter((e) => e[1].length);
    const S = sumOf(L);
    $('od-meta').textContent = `${UI.fmtDate(O.asOf)} 기준 · ${O.lines.map((l) => `${l} ${md(O.srcs[l].date)}`).join(' · ')}${O.missing.length ? ` · ${O.missing.join('·')} 자료 없음` : ''}`;
    $('od-main').innerHTML = topCard(R) + `<section class="card"><h2>판매그룹 → ${BY[by][0]}별 주문진도</h2>`
      + (O.missing.length ? `<p class="od-wait">⏳ ${O.missing.join('·')}: 작업지시대상선정 자료 없음 — 라인별 내려받기 수신 시 같은 화면에 표시</p>` : '')
      + `<div class="od-flt"><span class="lb">묶음</span><span class="seg" id="od-by">${Object.keys(BY).map((b) => `<button type="button" data-b="${b}" aria-pressed="${b === by}">${BY[b][0]}별</button>`).join('')}</span>`
      + `<select id="od-f" aria-label="상태">${Object.keys(F).map((f) => `<option value="${f}"${f === flt ? ' selected' : ''}>${F[f][0]} ${n0(R.filter(F[f][1]).length)}</option>`).join('')}</select>`
      + `<select id="od-ln" aria-label="라인"><option value="">라인 전체</option>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => `<option${ln === l ? ' selected' : ''}${O.lines.includes(l) ? '' : ' disabled'}>${l}</option>`).join('')}</select>`
      + `<input id="od-q" placeholder="계약번호·고객사·담당자·색상·규격 찾기" value="${esc(q)}"><span class="cnt">${n0(S.n)}건 · 미생산 ${n0(S.rem)}t</span>`
      + '<button type="button" class="lnk" id="od-open">모두 펼치기</button><button type="button" class="lnk" id="od-close">모두 접기</button></div>'
      + (byG.length ? '' : '<p class="od-note">해당 주문이 없습니다.</p>')
      + grpChart(byG) + byG.map(([g, v], gi) => group(g, v, gi)).join('') + '</section>' + basisFold();
    $('od-kpi').querySelectorAll('button').forEach((b) => b.onclick = () => { flt = flt === b.dataset.f ? 'all' : b.dataset.f; render(); });
    $('od-f').onchange = (e) => { flt = e.target.value; render(); };
    $('od-by').querySelectorAll('button').forEach((b) => b.onclick = () => { by = b.dataset.b; try { localStorage.setItem(BY_KEY, by); } catch (e) { /* 무시 */ } render(); });
    $('od-q').oninput = (e) => { q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); const i = $('od-q'); i.focus(); i.setSelectionRange(q.length, q.length); }, 250); };
    $('od-ln').onchange = (e) => { ln = e.target.value; render(); };
    $('od-open').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = true; });
    $('od-close').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = false; });
    if (window.UI) UI.reveal($('od-main'));
  }
  const envReady = GP.latest('cc_order_progress.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('od-msg').textContent = '게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('od-form').hidden = false; $('od-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    render();
  }
  $('od-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('od-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('od-form').hidden = false; });
})();
