/* 도금 주문진도: published/cg_order_progress.enc.json (tools/cg_order_progress.py)
   10/28 사용자: MES 주문진도(SSCHA1060)처럼 주문서 전체 흐름 — 소재매치(화요일 확정 = 입고일 확정분)·포스코 앞당김(목요일) 판단용 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const ymd8 = (s) => (s && String(s).length >= 8 ? `${+String(s).slice(4, 6)}/${+String(s).slice(6, 8)}` : '');
  let O = null, flt = 'act', q = '', ln = '', ex = '', limit = 300;
  const F = {
    act: ['조치 필요', (x) => x.hurry || x.lateIn || x.st === '미발주'],
    hurry: ['앞당김 필요', (x) => x.hurry],
    late: ['소재 지연', (x) => x.lateIn],
    posco: ['포스코 진행', (x) => x.st === '포스코 진행' || x.st.startsWith('발주')],
    ready: ['입고 완료(생산 대기)', (x) => x.st === '입고 완료'],
    prod: ['생산 중', (x) => x.st === '생산 중'],
    done: ['생산 완료', (x) => x.st === '생산 완료'],
    all: ['전체', () => true],
  };
  function stBadge(x) {
    if (x.lateIn) return '<span class="st late">소재 지연</span>';
    if (x.hurry) return '<span class="st hurry">앞당김 필요</span>';
    const c = { '입고 완료': 'ok', '생산 중': 'mid', '생산 완료': 'ok', '미발주': 'late' }[x.st] || 'na';
    return `<span class="st ${c}">${esc(x.st)}</span>`;
  }
  function stages(x) {
    const s = x.stg || {};
    const k = Object.keys(s);
    if (!k.length) return O.hasRun ? '<span class="bk">진행 물량 없음</span>' : '<span class="bk">포스코 진행 자료 — 다음 자동 실행부터</span>';
    return k.map((nm) => `<span class="stg${nm === x.stage ? ' cur' : ''}">${esc(nm)} ${n1(s[nm])}t</span>`).join('');
  }
  function row(x) {
    const sl = x.slack == null ? '' : `<div class="sl ${x.slack < 0 ? 'neg' : 'pos'}">${x.slack < 0 ? `${-x.slack}일 늦음` : `${x.slack}일 여유`}</div>`;
    const who = [x.cus, x.lcus && x.lcus !== x.cus ? `최종 ${x.lcus}` : '', x.man].filter(Boolean).map(esc).join(' · ');
    return `<tr><td>${stBadge(x)}${x.woWait ? '<div class="bk">작업지시됨</div>' : ''}</td>`
      + `<td><b>${esc(x.con)}</b><div class="bk">${x.line || ''}${x.exp ? ' 수출' : ' 내수'}${x.pdt ? ` · ${esc(x.pdt)}` : ''}${x.usg ? ` · ${esc(x.usg)}` : ''}</div>${who ? `<div class="bk">${who}</div>` : ''}</td>`
      + `<td>납기 <b>${md(x.due) || '-'}</b>${x.arr ? `<div class="bk">입항 ${md(x.arr)}${x.dept ? ` · 출항 ${md(x.dept)}` : ''}</div>` : ''}</td>`
      + `<td>${x.thk != null ? `<b>${(+x.thk).toFixed(2)} × ${n0(x.wdt)}</b>` : '-'}<div class="bk">${[x.spec, x.cot && `도금량 ${x.cot}`, x.aft && `후처리 ${x.aft}`, x.sur].filter(Boolean).map(esc).join(' · ')}</div></td>`
      + `<td class="num">${x.purT ? `<b>${n1(x.purT)}t</b><div class="bk">발주 ${ymd8(x.purDt)}${x.dle ? ` · 인도기한 ${md(x.dle)}` : ''}</div>` : '<span class="bk">미발주</span>'}</td>`
      + `<td>${stages(x)}${x.entSche ? `<div class="bk">입고예정 ${md(x.entSche)}</div>` : ''}</td>`
      + `<td class="num">${x.entT ? `<b>${n1(x.entT)}t</b>${x.entFirst ? `<div class="bk">첫 입고 ${md(x.entFirst)}</div>` : ''}${x.remIn ? `<div class="bk">남은 ${n1(x.remIn)}t</div>` : ''}` : '<span class="bk">0</span>'}</td>`
      + `<td class="num">${x.sche ? `<div>예정 ${md(x.sche)}</div>` : ''}${x.prodT ? `<b>${n1(x.prodT)}t</b>${x.prodLast ? `<div class="bk">마지막 ${md(x.prodLast)}</div>` : ''}` : (x.sche ? '' : '<span class="bk">-</span>')}</td>`
      + `<td class="num">${x.needIn ? md(x.needIn) : '-'}${sl}</td></tr>`;
  }
  function render() {
    const R = O.rows;
    const cnt = (f) => R.filter(F[f][1]).length;
    const kpi = Object.keys(F).map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === flt}"><div class="l">${F[f][0]}</div><div class="v${f === 'late' ? ' bad' : f === 'hurry' || f === 'act' ? ' warn' : ''}">${n0(cnt(f))}</div></button>`).join('');
    let L = R.filter(F[flt][1]);
    if (ln) L = L.filter((x) => x.line === ln);
    if (ex) L = L.filter((x) => (ex === 'E') === !!x.exp);
    if (q) { const qq = q.toUpperCase(); L = L.filter((x) => (x.con + ' ' + (x.cus || '') + ' ' + (x.lcus || '') + ' ' + (x.man || '') + ' ' + (x.spec || '')).toUpperCase().includes(qq)); }
    const tonRem = L.reduce((s, x) => s + (x.remIn || 0), 0);
    $('od-meta').textContent = `${O.asOf} 기준 · 계산 ${O.built || ''} · 납기 30일 전 ~ 90일 뒤 계약 + 작업지시·생산예정 있는 계약`;
    $('od-main').innerHTML = `<section class="card"><div class="od-kpi" id="od-kpi">${kpi}</div>`
      + `<p class="od-note"><b>필요 입고일</b> = 생산 필요일 − ${O.basis.leadIn}일(입고 → 투입). 생산 필요일 = 수출은 입항 −1일 −${O.basis.prep}일, 내수는 납기 −${O.basis.prep}일. <b>앞당김 필요</b> = 아직 다 안 들어왔고 입고예정(없으면 포스코 인도기한)이 필요 입고일보다 늦음 · <b>소재 지연</b> = 필요 입고일이 이미 지남. ${O.hasRun ? '' : '포스코 진행 단계·입고예정·입항예정은 주문진행 조회(10/28 추가)가 들어오는 다음 자동 실행부터 — 그 전엔 인도기한으로 판단.'}</p>`
      + `<div class="od-flt"><input id="od-q" placeholder="계약번호·고객사·규격 찾기" value="${esc(q)}"><select id="od-ln"><option value="">라인 전체</option><option${ln === '1CGL' ? ' selected' : ''}>1CGL</option><option${ln === '2CGL' ? ' selected' : ''}>2CGL</option></select>`
      + `<select id="od-ex"><option value="">내수·수출</option><option value="E"${ex === 'E' ? ' selected' : ''}>수출</option><option value="D"${ex === 'D' ? ' selected' : ''}>내수</option></select><span class="bk">${n0(L.length)}줄 · 남은 입고 ${n0(tonRem)}t</span></div>`
      + `<div class="scroll"><table class="t od"><colgroup><col style="width:8%"><col style="width:14%"><col style="width:8%"><col style="width:14%"><col style="width:9%"><col style="width:20%"><col style="width:9%"><col style="width:9%"><col style="width:9%"></colgroup>`
      + '<thead><tr><th>상태</th><th>계약번호-행번</th><th>납기 · 입항</th><th>규격 · 두께×폭</th><th>F/H 발주</th><th>포스코 진행</th><th>입고</th><th>생산예정 · 생산</th><th>필요 입고일 · 여유</th></tr></thead><tbody>'
      + L.slice(0, limit).map(row).join('') + '</tbody></table></div>'
      + (L.length > limit ? `<p style="text-align:center"><button type="button" id="od-more">${n0(L.length - limit)}줄 더 보기</button></p>` : '') + '</section>';
    $('od-kpi').querySelectorAll('button').forEach((b) => b.onclick = () => { flt = b.dataset.f; limit = 300; render(); });
    $('od-q').oninput = (e) => { q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); const i = $('od-q'); i.focus(); i.setSelectionRange(q.length, q.length); }, 250); };
    $('od-ln').onchange = (e) => { ln = e.target.value; render(); };
    $('od-ex').onchange = (e) => { ex = e.target.value; render(); };
    if ($('od-more')) $('od-more').onclick = () => { limit += 300; render(); };
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
