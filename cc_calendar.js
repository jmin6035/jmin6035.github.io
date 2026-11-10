/* 컬러 생산 캘린더: published/cc_calendar.enc.json (tools/cc_calendar.py)
   10/30 사용자 '11월 상세 계획 — 컬러 도금 둘 다 포털에': 1~4CCL × 오늘 ~ 월말.
   11/5 컬러 담당 편성 규칙: 칸 = 라인 하루 24시간에 작업대기량(1030) → 지시대기(1020, 부원료 입고 뒤, 노랑) → 부자재 입고대기(파랑) → 계획편성(초록). 작업대기로 24시간 못 채운 날 = 빨강 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const dt = (s) => new Date(s + 'T00:00:00');
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const mdw = (s) => `${md(s)}(${DOW[dt(s).getDay()]})`;
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  let O = null;
  const END = () => md(O.days[O.days.length - 1]);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  const KD = [['작업대기', '작업대기량', 'kw', '확정 지시 — 생산우선순위 순번대로, 계약별 총 작업시간'], ['지시대기', '지시대기', 'ky', '미확정 지시 — 부원료 최종 입고일 뒤, 작업지시 순서대로'],
    ['부자재 입고대기', '부자재 입고대기', 'kb', '도료 입고 일정 없음 — 지시대기 마지막 뒤'], ['계획편성', '계획편성', 'kg', '작업대기·지시대기 뒤 남는 시간 = 통합 컬러 계획']];
  /* 결론(11/11 생산 화면 통합 — 생산 일정 화면 맨 위 PS.sum): 이번 주(오늘부터 7일) 라인별 생산·가동 시간·24시간 부족 + 월말까지 편성 구성 */
  function summary() {
    const S = O.summary, d7 = O.days.slice(0, 7), C = (l) => d7.map((d) => O.lines[l][O.days.indexOf(d)]);
    const tk = (k, j) => sum(LINES, (l) => ((S[l].kind || {})[k] || [0, 0])[j]);
    const rows = LINES.map((l) => { const X = C(l), t = sum(X, (c) => c.cap || 0), uh = sum(X, (c) => c.usedH || 0), ch = sum(X, (c) => (c.stop ? 0 : c.capH || 0)), ws = sum(X, (c) => c.woShort || 0), st = X.filter((c) => c.stop).length;
      return `<tr><td class="l"><b>${l}</b></td><td class="r"><b>${n0(t)}</b>t</td><td class="r">${n0(uh)} / ${n0(ch)}h</td><td class="r">${ws >= 0.5 ? `<b class="bad">${n1(ws)}h</b>` : '<span class="sub">0</span>'}</td><td class="r">${st ? `${st}일` : '<span class="sub">-</span>'}</td><td class="r">${S[l].woUntil ? md(S[l].woUntil) : '<span class="sub">없음</span>'}</td></tr>`; }).join('');
    const short = sum(LINES, (l) => sum(C(l), (c) => c.woShort || 0));
    const chip = (k, cl) => `<span class="ps-c" title="${esc(KD.find((x) => x[0] === k)[3])}"><i class="${cl}"></i>${KD.find((x) => x[0] === k)[1]} <b>${n0(tk(k, 0))}t</b></span>`;
    return `<div class="ps-st">${short >= 0.5 ? `<span class="ct-b bad">작업대기 부족 ${n1(short)}h</span>` : '<span class="ct-b ok">작업대기로 24시간 채움</span>'}<span class="ps-k">~${END()} 편성</span>${chip('작업대기', 'kw')}${chip('지시대기', 'ky')}${chip('부자재 입고대기', 'kb')}${chip('계획편성', 'kg')}</div>`
      + `<div class="ct-wrap"><table class="ct-t ps-t"><thead><tr><th class="l">라인</th><th class="r">생산</th><th class="r" title="편성 시간 / 가용 시간(계획 휴지 뺀 24시간) — 차이 = 편성 없는 빈 시간">가동 시간</th><th class="r" title="확정 지시(작업대기)로 하루 24시간을 못 채운 시간">작업대기 부족</th><th class="r">정지</th><th class="r" title="확정 지시(작업대기)가 끝나는 날">작업대기 끝</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  /* 기준·사양(생산 일정 맨 아래 접기) */
  function spec() {
    return `<h4>컬러 캘린더</h4><ul class="ps-ul"><li>하루 = 07시 ~ 다음날 07시 · 가용 = 24시간 − 계획 휴지(통합 컬러 계획 휴지 달력)</li>${KD.map(([, nm, cl, t]) => `<li><i class="ps-i ${cl}"></i><b>${nm}</b> — ${esc(t)}</li>`).join('')}<li><b>작업대기 부족</b> = 확정 지시로 하루 24시간을 못 채운 시간(빨강) · <b>빈 시간</b> = 편성 없는 시간</li><li>자료 ${esc(O.asOf)} · 작업지시 시각 ${esc(String(O.woNow || '').slice(0, 16).replace('T', ' '))} · 계산 ${esc(O.built || '')}</li></ul>`;
  }

  function cell(c, ln) {
    if (c.stop) return `<button type="button" class="cell stp" data-ln="${ln}" data-d="${c.d}"><div class="ct"><span class="ev">정지</span></div><div class="tv">0<small>h</small></div></button>`;
    const K = c.k || {}, base = c.capH || 24, w = (v) => `${(100 * v / base).toFixed(1)}%`;
    const red = c.woShort > 0 || c.short > 0;
    const lines = KD.filter(([k]) => K[k]).map(([k, nm, cl]) => `<span class="${cl}t">${nm} ${n1(K[k][1])}h</span>`).join('');
    return `<button type="button" class="cell${red ? ' fl' : ''}" data-ln="${ln}" data-d="${c.d}" title="${esc(`가용 ${n1(c.capH)}h · 편성 ${n1(c.usedH)}h`)}">`
      + `<div class="bar">${KD.map(([k, , cl]) => (K[k] ? `<i class="${cl}" style="width:${w(K[k][1])}"></i>` : '')).join('')}</div>`
      + `<div class="tv">${n0(c.cap)}<small>t</small> <span class="hv">${n1(c.usedH)}/${n1(c.capH)}h</span></div>`
      + `<div class="gl">${lines}</div>`
      + (c.woShort > 0 ? `<div class="sh">작업대기 부족 ${n1(c.woShort)}h</div>` : c.short > 0 ? `<div class="sh">빈 시간 ${n1(c.short)}h</div>` : '')
      + '</button>';
  }

  function weekTable(days) {
    const idx = (d) => O.days.indexOf(d);
    const pad = '<td class="pad" aria-hidden="true"></td>'.repeat(Math.max(0, 7 - days.length));   // 마지막 주가 1~6일이면 빈 칸으로 채워 한 칸이 화면 폭 전체로 늘어나지 않게
    const head = days.map((d) => { const wd = dt(d).getDay(); return `<th class="${wd === 0 || wd === 6 ? 'we' : ''}">${mdw(d)}${d === UI.today() ? '<small class="tdy">오늘</small>' : ''}</th>`; }).join('') + pad.replace(/td/g, 'th');
    const rows = LINES.map((ln) => `<tr><th>${ln}<small>${n0(sum(days, (d) => O.lines[ln][idx(d)].cap))}t · ${n0(sum(days, (d) => O.lines[ln][idx(d)].usedH))}h</small></th>${days.map((d) => `<td>${cell(O.lines[ln][idx(d)], ln)}</td>`).join('')}${pad}</tr>`).join('');
    const sd = (d) => sum(LINES, (l) => O.lines[l][idx(d)].cap);
    const tot = `<tr class="dsum"><th>하루 합<small>${n0(sum(days, sd))}t</small></th>${days.map((d) => `<td><b>${n0(sd(d))}</b><small>t</small></td>`).join('')}${pad}</tr>`;
    return `<table class="cg"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>`;
  }

  function calCard() {
    return `<section class="card"><h2>라인별 ~${END()} <small title="라인 하루 24시간(계획 휴지 뺌)">칸을 누르면 그날 계약 목록</small></h2>`
      + `<div class="lg">${KD.map(([, nm, cl, t]) => `<span title="${esc(t)}"><i class="${cl}"></i>${nm}</span>`).join('')}<span><i style="background:var(--bad-bg);box-shadow:inset 3px 0 0 var(--bad)"></i>작업대기 24시간 부족·빈 시간</span><span><i style="background:var(--tint-2);box-shadow:inset 0 0 0 1px var(--line)"></i>정지(휴지·수리)</span></div>`
      + (O.cus ? '' : '<p class="msg" style="margin:0 0 10px">DUMMY 고객 제외: 컬러 계약 고객사 자료(snap_cc_cus_names)가 사내 PC 다음 실행부터 반영 — 현재는 DUMMY 포함</p>')
      + Array.from({ length: Math.ceil(O.days.length / 7) }, (_, w) => `<div class="wk">${weekTable(O.days.slice(w * 7, w * 7 + 7))}</div>`).join('') + '</section>';
  }

  function matCard() {
    const M = O.mat || {}, B = M.buySoonDaily || {}, S = M.selfCgDaily || {};
    const wk = (D) => { const o = {}; Object.entries(D).forEach(([d, v]) => { const x = dt(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const k = x.toISOString().slice(0, 10); o[k] = (o[k] || 0) + v; }); return o; };
    const bw = wk(B), sw = wk(S), ks = [...new Set([...Object.keys(bw), ...Object.keys(sw)])].sort();
    const rows = ks.map((k) => `<tr><td class="nw">${md(k)} 주</td><td class="num">${n0(bw[k] || 0)}</td><td class="num">${n0(sw[k] || 0)}</td></tr>`).join('');
    return '<section class="card"><h2>소재 들어오는 양 <small>주별 · 톤</small></h2>'
      + `<div class="mt" style="margin:0 0 12px"><div><div class="s">구매 소재 재고</div><b class="v">${n0(M.buyStock)}t</b></div><div><div class="s">구매 소재 입고 예정 ~${END()}</div><b class="v">${n0(M.buySoon)}t</b></div>`
      + `<div title="컬러 소재 창고의 자사(도금) 소재 중 사용가능·작업지시대기·가공대기 재고 — 관제의 '도금 자가재 재고'(판생 속보, 도금 쪽 자가재 제품 재고 전체)와 범위가 다름"><div class="s">자가재 재고(컬러 소재 창고 · 투입 가능)</div><b class="v">${n0(M.selfStock)}t</b></div><div><div class="s">도금 자가재 생산 ~${END()}</div><b class="v">${n0(M.selfCg)}t</b></div></div>`
      + (rows ? `<table class="it" style="max-width:520px"><thead><tr><th>주</th><th class="num">구매 소재 입고 예정</th><th class="num">도금 자가재 생산</th></tr></thead><tbody>${rows}</tbody></table>` : '')
      + '</section>';
  }

  function openDay(ln, d) {
    const c = O.lines[ln][O.days.indexOf(d)], dlg = $('kc-dlg');
    let body = c.stop ? '<p class="msg">라인 정지(휴지·수리)</p>' : '';
    for (const [k, nm, cl] of KD) {
      const I = c.items.filter((i) => i.kind === k);
      if (!I.length) continue;
      if (k === '계획편성') { body += `<div class="fgl kgbg">${nm} ${n0(sum(I, (i) => i.t))}t · ${n1(sum(I, (i) => i.h))}h(주문 연결 전) — ${I.map((i) => `${esc(i.grp)} ${n0(i.t)}t`).join(' · ')}${(c.planItems || []).length ? `<div class="pi">그날 계획 품명: ${c.planItems.map(([p, t]) => `${esc(p)} ${n0(t)}`).join(' · ')}</div>` : ''}</div>`; continue; }
      body += `<h4 class="kh"><i class="${cl}"></i>${nm} <small>${I.length}건 · ${n0(sum(I, (i) => i.t))}t · ${n1(sum(I, (i) => i.h))}h</small></h4>`
        + '<table class="it cmp"><thead><tr><th>순서</th><th>계약번호-행번</th><th>품명</th><th>그룹</th><th>두께×폭</th><th>상도 색</th><th class="num">톤</th><th class="num">시간</th><th>부원료 준비</th></tr></thead><tbody>'
        + I.map((i, j) => `<tr><td class="sq">${j + 1}</td><td><div class="con">${esc(i.con)}${i.cont ? ' <small>(이어짐)</small>' : ''}</div></td><td><b>${esc(i.item || '')}</b></td><td class="nw">${esc(i.grp || '')}</td>`
          + `<td class="sz">${i.thk ? `${(+i.thk).toFixed(2)}×${n0(i.wdt)}` : '-'}</td><td class="nw">${esc(i.color || '')}</td><td class="num"><b>${n1(i.t)}</b></td><td class="num">${n1(i.h)}</td><td class="nw">${k === '부자재 입고대기' ? '<span class="bad">일정 없음</span>' : md(i.ready) || '-'}</td></tr>`).join('')
        + '</tbody></table>';
    }
    if (!body) body = '<p class="msg">배정 없음</p>';
    dlg.innerHTML = `<div class="dh"><b>${ln} ${mdw(d)}</b><span>가용 <b>${n1(c.capH)}h</b> · 편성 ${n1(c.usedH)}h${c.woShort > 0 ? ` · <b class="bad">작업대기 부족 ${n1(c.woShort)}h</b>` : c.short > 0 ? ` · <b class="bad">빈 시간 ${n1(c.short)}h</b>` : ''}</span>`
      + `<span class="x"><button type="button" id="kc-x" aria-label="닫기">닫기 ×</button></span></div><div class="db">${body}</div>`;
    $('kc-x').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
  }

  function render() {
    const stale = Math.round((Date.now() - dt(O.asOf).getTime()) / 864e5);
    $('kc-main').innerHTML = (stale >= 2 ? `<div class="card" style="background:var(--warn-bg);color:var(--warn);font-weight:700">자료 기준 ${md(O.asOf)} — ${stale}일 전 자료</div>` : '')
      + calCard() + matCard();
    $('kc-main').querySelectorAll('button.cell').forEach((b) => b.onclick = () => openDay(b.dataset.ln, b.dataset.d));
    if (window.PS) PS.sum('C', summary(), spec(), O.asOf);
    if (window.UI) UI.reveal($('kc-main'));
  }
  $('kc-dlg').addEventListener('click', (e) => { if (e.target === $('kc-dlg')) $('kc-dlg').close(); });
  /* 생산 일정 화면(ct_plan.html)에 붙어 있음 — 암호는 화면 공통 잠금(CT.boot)이 받고, 여기서는 저장된 암호로만 엶(ensure) */
  const envReady = GP.latest('cc_calendar.enc.json');
  let busy = false;
  async function unlock(pw) {
    if (O || busy || !pw) return; busy = true;
    const env = await envReady;
    if (!env) { $('kc-msg').textContent = '게시된 자료가 없습니다.'; busy = false; return; }
    try { O = await GP.decryptJSON(env, pw); }
    catch (e) { $('kc-msg').textContent = '⚠ 암호가 맞지 않습니다'; busy = false; return; }
    busy = false; render();
  }
  window.CCCAL = { ensure: () => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (O) render(); else unlock(s); } };
})();
