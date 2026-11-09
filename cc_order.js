/* 컬러 주문·납기: published/cc_order_progress.enc.json (tools/cc_order_progress.py)
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
  let flt = 'nomch', q = '', ln = '', by = 'man';
  try { by = localStorage.getItem(BY_KEY) || 'man'; } catch (e) { /* 무시 */ }
  const act = (x) => x.st === '소재 없음' || x.lateCan || (x.lateDue && x.st !== '매치 완료');
  const F = {
    act: ['조치 필요', act],
    nomch: ['매치 안 됨', (x) => x.st !== '매치 완료'],
    mch: ['매치 완료', (x) => x.st === '매치 완료'],
    stock: ['소재 있음(매치 전)', (x) => x.st === '소재 있음'],
    wait: ['입고 대기', (x) => x.st === '입고 대기'],
    none: ['소재 없음', (x) => x.st === '소재 없음'],
    late: ['납기 지남', (x) => x.lateDue],
    all: ['전체', () => true],
  };
  const BY = { man: ['담당자', (x) => x.man || '담당자 모름'], route: ['소재 경로', (x) => x.route] };
  if (!BY[by]) by = 'man';
  const ST = { '매치 완료': 'ok', '소재 있음': 'mid', '입고 대기': 'hurry', '소재 없음': 'late' };
  const stBadge = (x) => `<span class="st ${ST[x.st] || 'na'}">${esc(x.st)}</span>` + (x.lateDue ? '<div class="sub" style="color:var(--bad);font-weight:700">납기 지남</div>' : '');
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
    } else if (x.route === '소재발주') out.push('<div class="rem">소재 발주 연결 안 됨</div>');
    if (x.self) out.push(`<div class="nw">자가재 <b>${esc(x.self)}</b></div>${x.selfSt ? `<div class="sub">도금 ${esc(x.selfSt.st || '')}${x.selfSt.prodT ? ` · 생산 ${n1(x.selfSt.prodT)}t` : ''}${x.selfSt.sche ? ` · 예정 ${md(x.selfSt.sche)}` : ''}</div>` : ''}`);
    return out.join('');
  }
  function row(x) {
    const clr = `${x.top ? `<span class="ch clr" title="Top Color">${esc(x.top)}</span>` : ''}<div class="sub" title="Primer · Back">${[x.pri && `P ${esc(x.pri)}`, x.back && `B ${esc(x.back)}`].filter(Boolean).join(' · ')}</div>`;
    const pct = x.ordT ? Math.min(100, x.prodT / x.ordT * 100) : 0;
    return `<tr><td>${stBadge(x)}</td>`
      + `<td><div class="con">${esc(x.con)}</div><div class="sub">${esc(x.line)}${x.spec ? ` · 규격 ${esc(x.spec)}` : ''}${x.pdt ? ` · ${esc(x.pdt)}` : ''}${by !== 'man' && x.man ? ` · 담당 ${esc(x.man)}` : ''}</div></td>`
      + `<td><div class="sz">${x.thk != null ? `${(+x.thk).toFixed(2)} × ${n0(x.wdt)}` : ''}</div>${clr}</td>`
      + `<td class="nw">납기 <b class="${x.lateDue ? 'neg' : ''}">${md(x.due) || '-'}</b></td>`
      + `<td class="num"><b>${n1(x.remT)}t</b><div class="sub">주문 ${n1(x.ordT)} · 생산 ${n1(x.prodT)}</div><div class="hb" style="--gc:var(--g3a);margin-top:4px" title="생산 ${Math.round(pct)}%"><i style="width:${pct.toFixed(1)}%"></i></div></td>`
      + `<td class="num">${x.mchT > 0.0005 ? `<b>${n1(x.mchT)}t</b>` : '<span class="sub">매치 0</span>'}${x.woT ? `<div class="sub">지시 ${n1(x.woT)}t</div>` : ''}</td>`
      + `<td>${matCell(x)}</td>`
      + `<td class="num">${x.sche ? `<div>예정 <b>${md(x.sche)}</b></div>` : '<span class="sub">-</span>'}${x.can ? (x.can <= O.asOf ? `<div class="sub" title="가동가능일(도료·PF·잉크·라미 입고 중 가장 늦은 날) ${md(x.can)} — 이미 지남">가동 가능</div>` : `<div class="${x.lateCan ? 'rem' : 'sub'}" title="가동가능일 = 도료·PF·잉크·라미 입고 중 가장 늦은 날">가능 ${md(x.can)}${x.canBy ? ` · ${esc(String(x.canBy).replace('입고예정일', '').replace('생산일', ''))}` : ''}</div>`) : ''}</td></tr>`;
  }
  const COLS = '<colgroup>' + [8, 14, 13, 8.5, 11, 9, 21.5, 15].map((w) => `<col style="width:${w}%">`).join('') + '</colgroup>';
  const HEAD = '<thead><tr><th>상태</th><th>계약번호-행번</th><th>두께×폭 · 색</th><th>납기</th><th class="num">잔량 · 주문 · 생산</th><th class="num">매치 · 지시</th><th>소재 연결</th><th class="num">작업 예정 · 가동가능</th></tr></thead>';
  const sumOf = (L) => ({ n: L.length, rem: L.reduce((s, x) => s + x.remT, 0), late: L.filter((x) => x.lateDue).length, none: L.filter((x) => x.st === '소재 없음').length, nomch: L.filter((x) => x.st !== '매치 완료').length });
  const stat = (S) => `<span class="gs"><b>${n0(S.n)}</b>건</span><span class="gs">잔량 <b>${n0(S.rem)}</b>t</span>`
    + (S.nomch ? `<span class="gs warn">매치 안 됨 <b>${S.nomch}</b></span>` : '') + (S.none ? `<span class="gs bad">소재 없음 <b>${S.none}</b></span>` : '') + (S.late ? `<span class="gs bad">납기 지남 <b>${S.late}</b></span>` : '');
  function grpChart(byG) {                                    // 판매그룹별 잔량 = 매치 완료 + 소재 있음 + 입고 대기 + 소재 없음(t)
    if (!byG.length) return '';
    const sm = (L) => { const t = (s) => L.filter((x) => x.st === s).reduce((a, x) => a + x.remT, 0); return { m: t('매치 완료'), s: t('소재 있음'), w: t('입고 대기'), z: t('소재 없음'), ...sumOf(L) }; };
    const R = [['합계', sm(byG.flatMap(([, v]) => v))], ...byG.map(([g, v]) => [g, sm(v)])], mx = Math.max(1, ...R.map(([, s]) => s.rem));
    const P = (v) => (100 * v / mx).toFixed(2) + '%';
    const tr = ([g, s], i) => `<tr${i === 0 ? ' class="tot"' : ''}><td>${i ? `<a href="#og-${i - 1}"><b>${esc(gs(g))}</b></a>` : `<b>${esc(gs(g))}</b>`}</td><td class="num">${n0(s.n)}</td>`
      + `<td class="gbcell"><div class="gb" title="${esc(gs(g))} 잔량 ${n0(s.rem)}t = 매치 완료 ${n0(s.m)} + 소재 있음 ${n0(s.s)} + 입고 대기 ${n0(s.w)} + 소재 없음 ${n0(s.z)}"><span class="gbr"><i class="a" style="width:${P(s.m)}"></i><i class="m" style="width:${P(s.s)}"></i><i class="w" style="width:${P(s.w)}"></i><i class="z" style="width:${P(s.z)}"></i></span><span class="gbv">${n0(s.rem)}t</span></div></td>`
      + `<td class="num">${n0(s.m)}</td><td class="num">${n0(s.s)}</td><td class="num">${n0(s.w)}</td><td class="num ${s.z ? 'bad' : ''}">${n0(s.z)}</td><td class="num ${s.late ? 'bad' : ''}">${s.late || '-'}</td></tr>`;
    return '<div class="gcard"><div class="gbl"><span><i class="a"></i>매치 완료</span><span><i class="m"></i>소재 있음(매치 전)</span><span><i class="w"></i>입고 대기</span><span><i class="z"></i>소재 없음</span><span class="sub">주문 잔량 톤</span></div>'
      + '<div class="scroll"><table class="t gtab"><thead><tr><th>그룹</th><th>건</th><th>잔량 t</th><th>매치 완료 t</th><th>소재 있음 t</th><th>입고 대기 t</th><th>소재 없음 t</th><th>납기 지남 건</th></tr></thead>'
      + `<tbody>${R.map((x, i) => tr(x, i)).join('')}</tbody></table></div></div>`;
  }
  const ORD = { '소재 없음': 0, '입고 대기': 1, '소재 있음': 2, '매치 완료': 3 };
  function sub(name, L) {
    const S = sumOf(L);
    L.sort((a, b) => (ORD[a.st] - ORD[b.st]) || (b.lateDue - a.lateDue) || String(a.due || '9').localeCompare(String(b.due || '9')) || a.con.localeCompare(b.con));
    return `<details class="sg"${S.none && L.length <= 40 ? ' open' : ''}><summary><span class="sn">${esc(name)}</span><span class="ss">${stat(S)}</span></summary>`
      + `<div class="scroll od-wrap"><table class="t od">${COLS}${HEAD}<tbody>${L.map(row).join('')}</tbody></table></div></details>`;
  }
  function group(g, L, gi) {
    const m = new Map();
    for (const x of L) { const k = BY[by][1](x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    const subs = [...m.entries()].map((e) => [e[0], e[1], sumOf(e[1])]).sort((a, b) => (b[2].none - a[2].none) || (b[2].late - a[2].late) || (b[2].n - a[2].n));
    return `<section class="og" id="og-${gi}"><header class="og-h"><h2>${esc(gs(g))}</h2><div class="og-s">${stat(sumOf(L))}</div></header>`
      + `<div class="og-b">${subs.map(([k, v]) => sub(k, v)).join('')}</div></section>`;
  }
  function render() {
    const R = O.rows;
    const cnt = (f) => R.filter(F[f][1]).length;
    const kpi = Object.keys(F).map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === flt}"><div class="l">${F[f][0]}</div><div class="v${f === 'none' || f === 'late' ? ' bad' : f === 'act' || f === 'nomch' ? ' warn' : ''}">${n0(cnt(f))}</div></button>`).join('');
    let L = R.filter(F[flt][1]);
    if (ln) L = L.filter((x) => x.line === ln);
    if (q) { const qq = q.toUpperCase(); L = L.filter((x) => [x.con, x.man, x.top, x.spec, x.grp, x.po && x.po.no, x.self].join(' ').toUpperCase().includes(qq)); }
    const G0 = O.groups || [];
    const groups = G0.concat([...new Set(L.map((x) => x.grp))].filter((g) => !G0.includes(g)));
    const byG = groups.map((g) => [g, L.filter((x) => x.grp === g)]).filter((e) => e[1].length);
    const S = sumOf(L);
    $('od-meta').textContent = `${O.asOf} 기준 · ${O.lines.map((l) => `${l} ${md(O.srcs[l].date)}`).join(' · ')}${O.missing.length ? ` · ${O.missing.join('·')} 자료 없음` : ''}`;
    $('od-main').innerHTML = `<section class="card"><h2>판매그룹 → ${BY[by][0]}별 컬러 주문·납기</h2><div class="od-kpi" id="od-kpi">${kpi}</div>`
      + `<p class="od-note">주문잔여량 0 이하·1,000kg 이하 제외(계약번호 5번째 T·Q 는 포함) · 소재 경로: 계약번호 6번째 C = 재고기반(규격상 재고), M = 소재 발주 + 고객주문 · 매치 = MES 작업지시대상선정 매치량</p>`
      + (O.missing.length ? `<p class="od-wait">⏳ ${O.missing.join('·')}: 작업지시대상선정 자료가 아직 없음 — 라인별 내려받기를 받으면 같은 화면에 들어옴</p>` : '')
      + `<div class="od-flt"><span class="lb">묶음</span><span class="seg" id="od-by">${Object.keys(BY).map((b) => `<button type="button" data-b="${b}" aria-pressed="${b === by}">${BY[b][0]}별</button>`).join('')}</span>`
      + `<select id="od-ln" aria-label="라인"><option value="">라인 전체</option>${['1CCL', '2CCL', '3CCL', '4CCL'].map((l) => `<option${ln === l ? ' selected' : ''}${O.lines.includes(l) ? '' : ' disabled'}>${l}</option>`).join('')}</select>`
      + `<input id="od-q" placeholder="계약번호·담당자·색상·발주번호 찾기" value="${esc(q)}"><span class="cnt">${n0(S.n)}건 · 잔량 ${n0(S.rem)}t</span>`
      + '<button type="button" class="lnk" id="od-open">모두 펼치기</button><button type="button" class="lnk" id="od-close">모두 접기</button></div>'
      + (byG.length ? '' : '<p class="od-note">해당 주문이 없습니다.</p>')
      + grpChart(byG) + byG.map(([g, v], gi) => group(g, v, gi)).join('') + '</section>';
    $('od-kpi').querySelectorAll('button').forEach((b) => b.onclick = () => { flt = b.dataset.f; render(); });
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
    if (!env) { $('od-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('od-form').hidden = false; $('od-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    render();
  }
  $('od-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('od-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('od-form').hidden = false; });
})();
