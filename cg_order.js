/* 도금 주문진도: published/cg_order_progress.enc.json (tools/cg_order_progress.py)
   10/28 사용자: MES 주문진도(SSCHA1060)처럼 주문서 전체 흐름 — 소재매치(수요일 오전 확정 = 입고일 확정분)·포스코 앞당김 판단용
   10/28 사용자: 무작정 나열 금지 — 크게는 판매그룹별, 세세하게는 목적지·고객사·담당자별로 묶어서. 도금량·후처리·수출·강종은 크게 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', BY_KEY = 'cgl-order-by';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const ymd8 = (s) => (s && String(s).length >= 8 ? `${+String(s).slice(4, 6)}/${+String(s).slice(6, 8)}` : '');
  let O = null, flt = 'act', q = '', ln = '', ex = '', by = 'dst';
  try { by = localStorage.getItem(BY_KEY) || 'dst'; } catch (e) { /* 무시 */ }
  const F = {
    act: ['조치 필요', (x) => x.hurry || x.lateIn || x.chk || x.st === '미발주'],
    late: ['소재 지연', (x) => x.lateIn],
    hurry: ['앞당김 필요', (x) => x.hurry],
    chk: ['입고 확인 필요', (x) => x.chk],
    posco: ['포스코 진행', (x) => x.st === '포스코 진행' || x.st.startsWith('발주')],
    ready: ['입고 완료(생산 대기)', (x) => x.st === '입고 완료'],
    prod: ['생산 중', (x) => x.st === '생산 중'],
    done: ['생산 완료', (x) => x.st === '생산 완료'],
    all: ['전체', () => true],
  };
  const BY = {
    dst: ['목적지', (x) => x.dst, () => (O.hasFull ? '목적지 코드 없음' : '목적지 — 다음 자동 실행부터')],
    cus: ['고객사', (x) => x.cus, () => (O.hasCus ? '고객사 확인 안 됨' : '고객사 — 다음 자동 실행부터')],
    man: ['담당자', (x) => x.man, () => (O.hasCus ? '담당자 확인 안 됨' : '담당자 — 다음 자동 실행부터')],
  };
  if (!BY[by]) by = 'dst';
  function stBadge(x) {
    if (x.lateIn) return '<span class="st late">소재 지연</span>';
    if (x.hurry) return '<span class="st hurry">앞당김 필요</span>';
    if (x.chk) return '<span class="st hurry">입고 확인</span>';
    const c = { '입고 완료': 'ok', '생산 중': 'mid', '생산 완료': 'ok', '미발주': 'late' }[x.st] || 'na';
    return `<span class="st ${c}">${esc(x.st)}</span>`;
  }
  function stages(x) {
    const s = x.stg || {};
    const k = Object.keys(s);
    if (!k.length) return O.hasRun ? '<span class="sub">진행 물량 없음</span>' : '<span class="sub">다음 자동 실행부터</span>';
    return k.map((nm) => `<span class="stg${nm === x.stage ? ' cur' : ''}">${esc(nm)} ${n1(s[nm])}t</span>`).join('');
  }
  function prodChips(x) {
    const c = [];
    if (x.fam) c.push(`<span class="ch fam fam-${esc(String(x.fam).replace(/[^A-Z]/g, ''))}">${esc(x.fam)}${x.pdt ? ` <small>${esc(x.pdt)}</small>` : ''}</span>`);
    c.push(x.exp ? '<span class="ch exp">수출</span>' : '<span class="ch dom">내수</span>');
    if (x.cot) c.push(`<span class="ch">도금량 ${esc(x.cot)}</span>`);
    if (x.aft) c.push(`<span class="ch">후처리 ${esc(x.aft)}</span>`);
    return c.join('');
  }
  function row(x) {
    const past = x.lateIn && x.needIn ? Math.round((Date.parse(O.asOf) - Date.parse(x.needIn)) / 864e5) : 0;   // 소재 지연이면 '여유' 대신 필요 입고일이 며칠 지났는지
    const est = x.etaSrc === '예상 입고';                        // 여유 = 필요 입고일 − 포스코 입고예정(없으면 인도기한 + 실적 중앙값 = 예상 입고)
    const sl = past > 0 ? `<div class="sl neg">${past}일 지남</div>` : (x.slack == null ? '' : `<div class="sl ${x.slack < 0 ? 'neg' : est ? '' : 'pos'}">${x.slack < 0 ? `${-x.slack}일 늦음` : `${x.slack}일 여유`}</div>${x.eta ? `<div class="sub">${est ? '예상' : '입고예정'} ${md(x.eta)}</div>` : ''}`);
    const needOn = x.remIn > 0.5;                                 // 소재가 다 들어왔으면(입고 완료·생산) 필요 입고일은 의미 없음
    const who = [by !== 'cus' && x.cus ? esc(x.cus) : '', x.lcus && x.lcus !== x.cus ? `최종 ${esc(x.lcus)}` : '', by !== 'man' && x.man ? `담당 ${esc(x.man)}` : '', by !== 'dst' && x.dst ? `→ ${esc(x.dst)}` : ''].filter(Boolean);
    return `<tr><td>${stBadge(x)}${x.woWait ? '<div class="sub">작업지시됨</div>' : ''}</td>`
      + `<td><div class="con">${esc(x.con)}</div><div class="sub">${[x.line, x.pln, x.usg && `용도 ${esc(x.usg)}`].filter(Boolean).join(' · ')}</div></td>`
      + `<td><div class="chips">${prodChips(x)}</div><div class="sz">${x.thk != null ? `${(+x.thk).toFixed(2)} × ${n0(x.wdt)}` : ''}${x.ordT ? ` <span class="sub">· 주문 ${n1(x.ordT)}t</span>` : ''}</div>${x.spec ? `<div class="sub">${esc(x.spec)}</div>` : ''}</td>`
      + `<td>${who.length ? who.map((w) => `<div>${w}</div>`).join('') : '<span class="sub">-</span>'}</td>`
      + `<td class="nw">납기 <b>${md(x.due) || '-'}</b>${x.arr ? `<div>입항 <b>${md(x.arr)}</b></div>` : ''}${x.dept ? `<div class="sub">출항 ${md(x.dept)}</div>` : ''}</td>`
      + `<td class="num">${x.purT ? `<b>${n1(x.purT)}t</b><div class="sub">발주 ${ymd8(x.purDt)}</div>${x.dle ? `<div class="sub">인도기한 ${md(x.dle)}</div>` : ''}` : '<span class="sub">미발주</span>'}</td>`
      + `<td>${stages(x)}${x.entSche ? `<div>입고예정 <b>${md(x.entSche)}</b></div>` : ''}</td>`
      + `<td class="num">${x.entT ? `<b>${n1(x.entT)}t</b>${x.entFirst ? `<div class="sub">첫 입고 ${md(x.entFirst)}</div>` : ''}` : '<span class="sub">0</span>'}${x.remIn ? `<div class="rem">남은 ${n1(x.remIn)}t</div>` : ''}</td>`
      + `<td class="num">${x.sche ? `<div>예정 <b>${md(x.sche)}</b></div>` : ''}${x.prodT ? `<b>${n1(x.prodT)}t</b>${x.prodLast ? `<div class="${x.st === '생산 완료' ? 'done' : 'sub'}">${x.st === '생산 완료' ? '완료' : '마지막'} ${md(x.prodLast)}</div>` : ''}` : (x.sche ? '' : '<span class="sub">-</span>')}</td>`
      + `<td class="num">${needOn && x.needIn ? `<b>${md(x.needIn)}</b>${sl}` : '<span class="sub">-</span>'}</td></tr>`;
  }
  const COLS = '<colgroup>' + [8.5, 14, 16.5, 10.5, 7.5, 9, 11.5, 8, 6.5, 8].map((w) => `<col style="width:${w}%">`).join('') + '</colgroup>';
  const HEAD = '<thead><tr><th>상태</th><th>계약번호-행번</th><th>제품 · 두께×폭</th><th>고객사·담당·목적지</th><th>납기 · 입항</th><th class="num">F/H 발주</th><th>포스코 진행</th><th class="num">입고</th><th class="num">생산</th><th class="num">필요 입고</th></tr></thead>';
  const sumOf = (L) => ({ n: L.length, rem: L.reduce((s, x) => s + (x.remIn || 0), 0), hurry: L.filter((x) => x.hurry).length, chk: L.filter((x) => x.chk).length, late: L.filter((x) => x.lateIn).length, est: L.filter((x) => x.grpSrc && x.grpSrc !== '주문').length, need: L.filter((x) => x.remIn > 0.5).map((x) => x.needIn).filter(Boolean).sort()[0] });
  const stat = (S) => `<span class="gs"><b>${n0(S.n)}</b>건</span><span class="gs">남은 입고 <b>${n0(S.rem)}</b>t</span>`
    + (S.late ? `<span class="gs bad">소재 지연 <b>${S.late}</b></span>` : '') + (S.hurry ? `<span class="gs warn">앞당김 <b>${S.hurry}</b></span>` : '') + (S.chk ? `<span class="gs warn">입고 확인 <b>${S.chk}</b></span>` : '')
    + (S.need ? `<span class="gs">가장 급한 필요 입고 <b>${md(S.need)}</b></span>` : '');
  function sub(name, L) {
    const S = sumOf(L);
    L.sort((a, b) => (b.lateIn - a.lateIn) || (b.hurry - a.hurry) || (b.chk - a.chk) || String(a.needIn || a.due || '9').localeCompare(String(b.needIn || b.due || '9')) || a.con.localeCompare(b.con));
    const open = S.late > 0 && L.length <= 40;
    return `<details class="sg"${open ? ' open' : ''}><summary><span class="sn">${esc(name)}</span><span class="ss">${stat(S)}</span></summary>`
      + `<div class="scroll"><table class="t od">${COLS}${HEAD}<tbody>${L.map(row).join('')}</tbody></table></div></details>`;
  }
  function group(g, L, gi) {
    const S = sumOf(L);
    const m = new Map();
    for (const x of L) { const k = BY[by][1](x) || BY[by][2](); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    const subs = [...m.entries()].map((e) => [e[0], e[1], sumOf(e[1])])
      .sort((a, b) => (b[2].late - a[2].late) || (b[2].hurry - a[2].hurry) || (b[2].chk - a[2].chk) || (b[2].n - a[2].n) || String(a[0]).localeCompare(String(b[0])));
    return `<section class="og" id="og-${gi}"><header class="og-h"><h2>${esc(g)}</h2><div class="og-s">${stat(S)}${S.est ? `<span class="gs est" title="주문서 판매부서가 없어 실적·계약번호·용도로 판매그룹을 정한 계약">그룹 추정 ${S.est}</span>` : ''}</div></header>`
      + `<div class="og-b">${subs.map(([k, v]) => sub(k, v)).join('')}</div></section>`;
  }
  function render() {
    const R = O.rows;
    const cnt = (f) => R.filter(F[f][1]).length;
    const kpi = Object.keys(F).map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === flt}"><div class="l">${F[f][0]}</div><div class="v${f === 'late' ? ' bad' : f === 'hurry' || f === 'chk' || f === 'act' ? ' warn' : ''}">${n0(cnt(f))}</div></button>`).join('');
    let L = R.filter(F[flt][1]);
    if (ln) L = L.filter((x) => x.line === ln);
    if (ex) L = L.filter((x) => (ex === 'E') === !!x.exp);
    if (q) { const qq = q.toUpperCase(); L = L.filter((x) => [x.con, x.cus, x.lcus, x.man, x.dst, x.spec, x.pdt, x.grp].join(' ').toUpperCase().includes(qq)); }
    const G0 = O.groups || [];
    const groups = G0.concat([...new Set(L.map((x) => x.grp || '그룹 미상'))].filter((g) => !G0.includes(g)));
    const byG = groups.map((g) => [g, L.filter((x) => (x.grp || '그룹 미상') === g)]).filter((e) => e[1].length);
    const S = sumOf(L);
    $('od-meta').textContent = `${O.asOf} 기준 · 계산 ${O.built || ''} · 납기 30일 전 ~ 90일 뒤 계약 + 작업지시·생산예정 있는 계약`;
    const wait = [!O.hasRun && '포스코 진행 단계·입고예정·입항예정', !O.hasCus && '고객사·담당자 이름', !O.hasFull && '목적지·11월 미확정 주문 사양'].filter(Boolean);
    $('od-main').innerHTML = `<section class="card"><h2>판매그룹 → ${BY[by][0]}별 주문진도</h2><div class="od-kpi" id="od-kpi">${kpi}</div>`
      + `<p class="od-note"><b>필요 입고일</b> = 생산 필요일 − ${O.basis.leadIn}일(입고 → 투입). 생산 필요일 = 수출은 입항 −1일 −${O.basis.prep}일, 내수는 납기 −${O.basis.prep}일. <b>여유·늦음</b> = 필요 입고일 − 포스코 입고예정(주문진행). 입고예정이 아직 없으면 <b>예상 입고</b> = F/H 인도기한 ${O.dleOff}일(실적 ${n0(O.dleOffN)}건 중앙값 — 인도기한이 대개 우리 납기와 같은 날이라 그대로 쓰면 모두 '8일 늦음'이 됨). <b>앞당김 필요</b> = 포스코 입고예정이 필요 입고일보다 늦음 · <b>입고 확인 필요</b> = 입고예정 자료 없이 필요 입고일이 14일 안인데 덜 들어옴${O.dleLate != null ? `(인도기한이 납기와 같을 때 실적 ${O.dleLate}%는 필요 입고일보다 늦게 들어옴)` : ''} · <b>소재 지연</b> = 필요 입고일이 이미 지남. 소재가 다 들어온 계약(입고 완료·생산)은 필요 입고일을 표시하지 않음. 판매그룹 = 주문서의 판매부서(없으면 코일 실적 부서, 그래도 없으면 계약번호·용도로 추정 — '그룹 추정'으로 표시).</p>`
      + (wait.length ? `<p class="od-wait">⏳ ${wait.join(' · ')} — 10/28 추가한 조회가 다음 자동 실행(07:35)에 들어오면 채워집니다.</p>` : '')
      + `<div class="od-flt"><span class="lb">묶음</span><span class="seg" id="od-by">${Object.keys(BY).map((b) => `<button type="button" data-b="${b}" aria-pressed="${b === by}">${BY[b][0]}별</button>`).join('')}</span>`
      + `<select id="od-ln" aria-label="라인"><option value="">라인 전체</option><option${ln === '1CGL' ? ' selected' : ''}>1CGL</option><option${ln === '2CGL' ? ' selected' : ''}>2CGL</option></select>`
      + `<select id="od-ex" aria-label="내수·수출"><option value="">내수·수출</option><option value="E"${ex === 'E' ? ' selected' : ''}>수출</option><option value="D"${ex === 'D' ? ' selected' : ''}>내수</option></select>`
      + `<input id="od-q" placeholder="계약번호·고객사·담당자·목적지 찾기" value="${esc(q)}"><span class="cnt">${n0(S.n)}건 · 남은 입고 ${n0(S.rem)}t</span>`
      + '<button type="button" class="lnk" id="od-open">모두 펼치기</button><button type="button" class="lnk" id="od-close">모두 접기</button></div>'
      + (byG.length ? `<nav class="og-sum">${byG.map(([g, v], gi) => { const s = sumOf(v); return `<a href="#og-${gi}" class="og-chip"><b>${esc(g)}</b> ${n0(s.n)}건${s.late ? ` · <span class="bad">지연 ${s.late}</span>` : ''}${s.hurry ? ` · <span class="warn">앞당김 ${s.hurry}</span>` : ''}${s.chk ? ` · <span class="warn">입고 확인 ${s.chk}</span>` : ''}</a>`; }).join('')}</nav>` : '<p class="od-note">해당 계약이 없습니다.</p>')
      + byG.map(([g, v], gi) => group(g, v, gi)).join('') + '</section>';
    $('od-kpi').querySelectorAll('button').forEach((b) => b.onclick = () => { flt = b.dataset.f; render(); });
    $('od-by').querySelectorAll('button').forEach((b) => b.onclick = () => { by = b.dataset.b; try { localStorage.setItem(BY_KEY, by); } catch (e) { /* 무시 */ } render(); });
    $('od-q').oninput = (e) => { q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); const i = $('od-q'); i.focus(); i.setSelectionRange(q.length, q.length); }, 250); };
    $('od-ln').onchange = (e) => { ln = e.target.value; render(); };
    $('od-ex').onchange = (e) => { ex = e.target.value; render(); };
    $('od-open').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = true; });
    $('od-close').onclick = () => document.querySelectorAll('details.sg').forEach((d) => { d.open = false; });
    if (window.UI) UI.reveal($('od-main'));
  }
  const envReady = GP.latest('cg_order_progress.enc.json');
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
