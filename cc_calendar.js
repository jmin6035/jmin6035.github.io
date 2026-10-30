/* 컬러 생산 캘린더: published/cc_calendar.enc.json (tools/cc_calendar.py)
   10/30 사용자 '11월 상세 계획 — 컬러 도금 둘 다 포털에': 1~4CCL × 오늘 ~ 월말, 칸 = MES 작업지시(작업지시 순서 시각표) + 남는 능력은 컬러 계획 편성(주문 연결 전) */
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

  function kpis() {
    const S = O.summary, tot = (k) => sum(LINES, (l) => S[l][k] || 0), M = O.mat || {};
    const k = (l, v, b, tone) => `<div class="kpi${tone ? ' tone-' + tone : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="b">${b}</div></div>`;
    const wu = LINES.filter((l) => S[l].woUntil).map((l) => `${l.slice(0, 1)}라인 ~${md(S[l].woUntil)}`).join(' · ');
    const st = LINES.filter((l) => S[l].stopDays).map((l) => `${l} ${S[l].stopDays}일`).join(' · ');
    return '<div class="kpis" style="margin:0 0 14px">'
      + k(`${END()}까지 라인 능력`, `${n0(tot('cap'))}<small>t</small>`, `작업지시 ${n0(tot('wo'))} · 계획 편성 ${n0(tot('planT'))}`, 'brand')
      + k('MES 작업지시', `${n0(tot('wo'))}<small>t</small>`, wu || '-', 'good')
      + k('라인 정지', st ? `${sum(LINES, (l) => S[l].stopDays)}<small>일</small>` : '없음', st || '휴지·수리 없음', st ? 'warn' : 'good')
      + k('구매 소재', `${n0(M.buyStock)}<small>t</small>`, `재고 · ${END()}까지 입고 예정 ${n0(M.buySoon)}t`, 'brand')
      + k('자가재 소재(도금 → 컬러)', `${n0(M.selfStock)}<small>t</small>`, `재고 · ${END()}까지 도금 생산 ${n0(M.selfCg)}t`, 'brand')
      + '</div>';
  }

  function cell(c, ln) {
    const cap = c.cap || 0, base = cap || 1, w = (v) => `${(100 * v / base).toFixed(1)}%`;
    if (c.stop) return `<button type="button" class="cell stp" data-ln="${ln}" data-d="${c.d}"><div class="ct"><span class="ev">정지</span></div><div class="tv">0<small>t</small></div></button>`;
    const gs = Object.entries(c.grp || {}).filter(([, v]) => v >= 1).slice(0, 3).map(([g, v]) => `<span>${esc(g)} ${n0(v)}</span>`).join('');
    return `<button type="button" class="cell" data-ln="${ln}" data-d="${c.d}">`
      + `<div class="bar"><i class="c" style="width:${w(c.wo)}"></i><i class="f ccp" style="width:${w(c.planT)}"></i></div>`
      + `<div class="tv">${n0(c.wo + c.planT)}<small>t</small></div>`
      + `<div class="gl">${gs}</div>`
      + (c.wo >= 0.5 && c.planT >= 0.5 ? `<div class="pi">작업지시 ${n0(c.wo)} · 계획 ${n0(c.planT)}</div>` : c.wo >= 0.5 ? '<div class="pi">작업지시</div>' : '<div class="pi">계획 편성</div>')
      + '</button>';
  }

  function weekTable(days) {
    const idx = (d) => O.days.indexOf(d);
    const head = days.map((d) => { const wd = dt(d).getDay(); return `<th class="${wd === 0 || wd === 6 ? 'we' : ''}">${mdw(d)}</th>`; }).join('');
    const rows = LINES.map((ln) => `<tr><th>${ln}<small>${n0(sum(days, (d) => O.lines[ln][idx(d)].cap))}t</small></th>${days.map((d) => `<td>${cell(O.lines[ln][idx(d)], ln)}</td>`).join('')}</tr>`).join('');
    const sd = (d) => sum(LINES, (l) => O.lines[l][idx(d)].cap);
    const tot = `<tr class="dsum"><th>하루 합<small>${n0(sum(days, sd))}t</small></th>${days.map((d) => `<td><b>${n0(sd(d))}</b><small>t</small></td>`).join('')}</tr>`;
    return `<table class="cg"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>`;
  }

  function calCard() {
    return `<section class="card"><h2>라인별 ~${END()} <small title="하루 능력 = 통합 컬러 계획의 그날 편성 톤(휴지계획 반영) · 작업지시 = MES 1020 편성 대상(소재 매치)을 「작업지시 순서」가 짠 시각표 날짜 · 남는 능력 = 계획 편성(그룹 비율)">칸을 누르면 그날 목록 · 능력 = 컬러 계획</small></h2>`
      + '<div class="lg"><span title="MES 작업지시(소재 매치) — 「작업지시 순서」 시각표 날짜"><i style="background:var(--c-conf)"></i>작업지시</span><span title="작업지시 이후 남는 능력 — 컬러 계획 편성(그룹 비율), 주문 연결 전"><i class="ccp" style="box-shadow:inset 0 0 0 1px var(--line)"></i>계획 편성(주문 연결 전)</span><span><i style="background:var(--tint-2);box-shadow:inset 0 0 0 1px var(--line)"></i>정지(휴지·수리)</span></div>'
      + Array.from({ length: Math.ceil(O.days.length / 7) }, (_, w) => `<div class="wk">${weekTable(O.days.slice(w * 7, w * 7 + 7))}</div>`).join('') + '</section>';
  }

  function matCard() {
    const M = O.mat || {}, B = M.buySoonDaily || {}, S = M.selfCgDaily || {};
    const wk = (D) => { const o = {}; Object.entries(D).forEach(([d, v]) => { const x = dt(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const k = x.toISOString().slice(0, 10); o[k] = (o[k] || 0) + v; }); return o; };
    const bw = wk(B), sw = wk(S), ks = [...new Set([...Object.keys(bw), ...Object.keys(sw)])].sort();
    const rows = ks.map((k) => `<tr><td class="nw">${md(k)} 주</td><td class="num">${n0(bw[k] || 0)}</td><td class="num">${n0(sw[k] || 0)}</td></tr>`).join('');
    return '<section class="card"><h2>소재 들어오는 양 <small>주별 · 톤</small></h2>'
      + `<div class="mt" style="margin:0 0 12px"><div><div class="s">구매 소재 재고</div><b class="v">${n0(M.buyStock)}t</b></div><div><div class="s">구매 소재 입고 예정 ~${END()}</div><b class="v">${n0(M.buySoon)}t</b></div>`
      + `<div><div class="s">자가재 재고(도금 → 컬러)</div><b class="v">${n0(M.selfStock)}t</b></div><div><div class="s">도금 자가재 생산 ~${END()}</div><b class="v">${n0(M.selfCg)}t</b></div></div>`
      + (rows ? `<table class="it" style="max-width:520px"><thead><tr><th>주</th><th class="num">구매 소재 입고 예정</th><th class="num">도금 자가재 생산</th></tr></thead><tbody>${rows}</tbody></table>` : '')
      + '</section>';
  }

  function openDay(ln, d) {
    const c = O.lines[ln][O.days.indexOf(d)], dlg = $('cc-dlg');
    const wo = c.items.filter((i) => i.kind === '작업지시'), pl = c.items.filter((i) => i.kind === '계획 편성');
    let body = '';
    if (c.stop) body = '<p class="msg">라인 정지(휴지·수리)</p>';
    if (wo.length) {
      body += '<table class="it cmp"><colgroup><col style="width:11%"><col style="width:21%"><col style="width:11%"><col style="width:11%"><col style="width:13%"><col style="width:11%"><col style="width:9%"><col style="width:13%"></colgroup>'
        + '<thead><tr><th>순서</th><th>계약번호-행번</th><th>품명</th><th>그룹</th><th>두께×폭</th><th>상도 색</th><th class="num">톤</th><th>시작</th></tr></thead><tbody>'
        + wo.map((i, k) => `<tr><td class="sq"><span class="kd k확정">작업지시</span> ${k + 1}</td><td><div class="con">${esc(i.con)}</div></td><td><b>${esc(i.item || '')}</b></td><td class="nw">${esc(i.grp || '')}</td>`
          + `<td class="sz">${i.thk ? `${(+i.thk).toFixed(2)}×${n0(i.wdt)}` : '-'}</td><td class="nw">${esc(i.color || '')}</td><td class="num"><b>${n1(i.t)}</b></td><td class="nw">${esc(i.start || '')}</td></tr>`).join('')
        + '</tbody></table>';
    }
    if (pl.length) {
      body += `<div class="fgl" style="background:var(--tint-2);color:var(--ink);margin-top:${wo.length ? 12 : 0}px">계획 편성 ${n0(sum(pl, (i) => i.t))}t(주문 연결 전) — ${pl.map((i) => `${esc(i.grp)} ${n0(i.t)}`).join(' · ')}`
        + `${(c.planItems || []).length ? `<div class="pi">그날 계획 품명: ${c.planItems.map(([p, t]) => `${esc(p)} ${n0(t)}`).join(' · ')}</div>` : ''}</div>`;
    }
    if (!body) body = '<p class="msg">배정 없음</p>';
    dlg.innerHTML = `<div class="dh"><b>${ln} ${mdw(d)}</b><span>능력 <b>${n0(c.cap)}t</b> = ${[['작업지시', c.wo], ['계획 편성', c.planT]].filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} ${n0(v)}`).join(' + ') || '0'}</span>`
      + `<span class="x"><button type="button" id="cc-x" aria-label="닫기">닫기 ×</button></span></div><div class="db">${body}</div>`;
    $('cc-x').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
  }

  function render() {
    const stale = Math.round((Date.now() - dt(O.asOf).getTime()) / 864e5);
    $('cc-main').innerHTML = (stale >= 2 ? `<div class="card" style="background:var(--warn-bg);color:var(--warn);font-weight:700">자료 기준 ${md(O.asOf)} — ${stale}일 전 자료</div>` : '')
      + kpis() + calCard() + matCard()
      + `<p class="msg" style="margin:4px 4px 0">자료 ${esc(O.asOf)} · 작업지시 시각 ${esc(String(O.woNow || '').slice(0, 16).replace('T', ' '))} · 계산 ${esc(O.built || '')}</p>`;
    $('cc-main').querySelectorAll('button.cell').forEach((b) => b.onclick = () => openDay(b.dataset.ln, b.dataset.d));
    if (window.UI) UI.reveal($('cc-main'));
  }
  $('cc-dlg').addEventListener('click', (e) => { if (e.target === $('cc-dlg')) $('cc-dlg').close(); });
  const envReady = GP.latest('cc_calendar.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('cc-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('cc-form').hidden = false; $('cc-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    render();
  }
  $('cc-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('cc-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('cc-form').hidden = false; });
})();
