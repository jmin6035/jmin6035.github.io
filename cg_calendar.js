/* 도금 2주 생산 캘린더: published/cg_calendar.enc.json (tools/cg_calendar.py)
   10/28 사용자 '전부 진행': 주문진도 ↔ MES ↔ 작업지시 순서를 계약번호-행번 하나로 — 라인 × 14일, 칸 = 확정(현장 작업지시) · 편성(소재 있음) · 예상(입고 예정)
   수요일 오전 = 다음 주(월~일) 확정 저장(암호화 → Supabase cgl_week_confirm) → 다음 날부터 준수율 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', WHO_KEY = 'cgl-who', RK_KEY = 'cgl-cal-risk';
  const SB = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_week_confirm';
  const KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';      // 공개용 키(이 표 권한 = 읽기·추가만). 비밀 키는 넣지 말 것
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const dt = (s) => new Date(s + 'T00:00:00');
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const mdw = (s) => `${md(s)}(${DOW[dt(s).getDay()]})`;
  const LINES = ['1CGL', '2CGL'];
  let O = null, PW = '', rk = 'win';
  try { rk = localStorage.getItem(RK_KEY) || 'win'; } catch (e) { /* 무시 */ }

  function nextWeek() {                                     // 다음 주 월~일(수요일 확정 대상)
    const t = dt(O.asOf), add = ((8 - t.getDay()) % 7) || 7;
    const m = new Date(t); m.setDate(t.getDate() + add);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return iso(d); });
  }
  const famCh = (f) => (f ? `<span class="fam fam-${esc(String(f).split('-')[0].replace(/[^A-Z]/g, ''))}">${esc(f)}</span>` : '');

  function kpis() {
    const S = O.summary, tot = (k) => LINES.reduce((s, l) => s + (S[l][k] || 0), 0);
    const win = O.risk.filter((r) => !r.od), fl = LINES.reduce((s, l) => s + (S[l].flags || 0), 0);
    const jgMin = Math.min(...O.jg.map((j) => j.cumSched - j.cumPlan));
    const k = (l, v, b, tone) => `<div class="kpi${tone ? ' tone-' + tone : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="b">${b}</div></div>`;
    return '<div class="kpis" style="margin:0 0 14px">'
      + k('2주 라인 능력', `${n0(tot('cap'))}<small>t</small>`, `확정 ${n0(tot('conf'))} · 편성 ${n0(tot('plan'))} · 예상 ${n0(tot('fcst'))} · 빈칸 ${n0(tot('gap'))}`, tot('gap') > 0 ? 'warn' : 'brand')
      + k('밀린 주문', `${n0(O.odT)}<small>t · ${O.nOd}건</small>`, '필요 생산일이 이미 지난 미생산 — 2주 안에 먼저 넣음', O.odT > 0 ? 'bad' : 'good')
      + k('2주 안에 못 넣는 주문', `${win.length}<small>건 · ${n0(win.reduce((s, r) => s + r.t, 0))}t</small>`, '이번 2주에 필요한데 칸이 없음(소재 없음·능력 부족)', win.length ? 'warn' : 'good')
      + k('계획 ≠ 현장 지시', `${fl}<small>일</small>`, fl ? LINES.flatMap((l) => O.lines[l].filter((c) => c.flag).map((c) => `${l} ${md(c.d)}`)).join(' · ') : '재계획 강종과 현장 작업지시가 맞음', fl ? 'bad' : 'good')
      + k('자가재(컬러 투입) 진도', jgMin >= 0 ? '<span class="gv">계획 이상</span>' : `<span class="bv">${n0(-jgMin)}t 부족</span>`, '재계획 자가재 누계 대비 캘린더 누계(가장 모자란 날)', jgMin >= 0 ? 'good' : 'bad')
      + '</div>';
  }

  function cell(c, ln) {
    const cap = c.cap || 0, fill = c.conf + c.plan + c.fcst, base = Math.max(cap, fill) || 1;
    const w = (v) => `${(100 * v / base).toFixed(1)}%`;
    const gs = Object.entries(c.grp || {}).filter(([, v]) => v >= 1).slice(0, 3).map(([g, v]) => `<span>${esc(g)} ${n0(v)}</span>`).join('');
    const tag = cap < 1 ? '<span class="ev">정지</span>' : c.event ? `<span class="ev">${esc(c.event)}</span>` : '';
    return `<button type="button" class="cell${c.flag ? ' fl' : ''}" data-ln="${ln}" data-d="${c.d}">`
      + `<div class="ct">${famCh(c.fam)}${tag}</div>`
      + `<div class="bar"><i class="c" style="width:${w(c.conf)}"></i><i class="p" style="width:${w(c.plan)}"></i><i class="f" style="width:${w(c.fcst)}"></i></div>`
      + `<div class="tv">${n0(fill)}<small>t</small>${c.gap ? ` <small style="color:var(--bad);font-weight:800">빈칸 ${n0(c.gap)}</small>` : ''}</div>`
      + `<div class="gl">${gs}</div>`
      + (c.flag ? `<div class="fg">⚠ ${esc(c.flagS || c.flag)}</div>` : '')
      + (c.late ? `<div class="lt">늦어짐 ${c.late}건</div>` : '')
      + '</button>';
  }

  function weekTable(days, nw) {
    const head = days.map((d) => { const wd = dt(d).getDay(); return `<th class="${nw.includes(d) ? 'nx' : wd === 0 || wd === 6 ? 'we' : ''}">${mdw(d)}${nw.includes(d) ? '<small>수요일 확정 대상</small>' : ''}</th>`; }).join('');
    const idx = (d) => O.days.indexOf(d);
    const rows = LINES.map((ln) => `<tr><th>${ln}<small>${n0(days.reduce((s, d) => s + O.lines[ln][idx(d)].cap, 0))}t</small></th>${days.map((d) => `<td>${cell(O.lines[ln][idx(d)], ln)}</td>`).join('')}</tr>`).join('');
    const jg = days.map((d) => {
      const j = O.jg[idx(d)], df = j.cumSched - j.cumPlan;
      return `<td class="jg"><div>계획 <b>${n0(j.cumPlan)}</b></div><div>배정 <b>${n0(j.cumSched)}</b></div><div class="${df < 0 ? 'bad' : 'good'}">${df < 0 ? `${n0(-df)} 부족` : `+${n0(df)}`}</div>${j.mark ? `<span class="mk">순 마감 ${n0(j.mark)}t</span>` : ''}</td>`;
    }).join('');
    return `<table class="cg"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}<tr><th>자가재<small>누계</small></th>${jg}</tr></tbody></table>`;
  }

  function calCard() {
    const nw = nextWeek();
    return '<section class="card"><h2>라인별 2주 <small>칸을 누르면 그날 작업 순서</small></h2>'
      + '<div class="lg"><span><i style="background:var(--c-conf)"></i>확정 = 현장 작업지시(1010)</span><span><i style="background:var(--c-plan)"></i>편성 = 소재 있는 주문</span>'
      + '<span><i style="background:var(--c-fcst)"></i>예상 = 입고 예정 소재(입고 + 5일)</span><span><i style="background:var(--c-gap)"></i>빈칸</span>'
      + '<span>능력·강종 = 최신 재계획 · 배정 = 필요 생산일 빠른 순</span></div>'
      + `<div class="wk">${weekTable(O.days.slice(0, 7), nw)}</div><div class="wk">${weekTable(O.days.slice(7, 14), nw)}</div></section>`;
  }

  const who = (i) => [i.cus && esc(i.cus), i.dst && `<span class="nw">→ ${esc(i.dst)}</span>`, i.man && `<span class="nw">담당 ${esc(i.man)}</span>`].filter(Boolean).join(' · ');
  function itemRows(L, showSeq) {
    return L.map((i, k) => {
      const due = i.od ? `<span class="bd od">밀림 · 필요 ${md(i.need)}</span>` : i.late ? `<span class="bd late">늦어짐 · 필요 ${md(i.need)}</span>` : i.need ? `<span class="sub">필요 ${md(i.need)}</span>` : '';
      return `<tr><td class="num">${showSeq ? (i.seq || k + 1) : k + 1}</td><td><div class="con">${esc(i.con)}</div><div class="sub">${who(i)}</div></td>`
        + `<td><div class="chs">${famCh(i.fam)}${i.exp ? '<span class="ch exp">수출</span>' : '<span class="ch">내수</span>'}${i.cot ? `<span class="ch">도금량 ${esc(i.cot)}</span>` : ''}${i.aft ? `<span class="ch">후처리 ${esc(i.aft)}</span>` : ''}</div></td>`
        + `<td class="sz">${i.thk != null ? `${(+i.thk).toFixed(2)} × ${n0(i.wdt)}` : '-'}</td><td><b>${esc(i.grp || '')}</b></td>`
        + `<td class="num"><b>${(+i.t).toFixed(1)}</b>${i.n ? `<div class="sub">${i.n}코일</div>` : ''}</td><td class="nw">${i.due ? `납기 ${md(i.due)}` : ''}<div>${due}</div></td></tr>`;
    }).join('');
  }
  function csv(rows, name) {
    const H = ['순서', '구분', '계약번호-행번', '그룹', '고객사', '목적지', '강종', '두께', '폭', '도금량', '후처리', '톤', '납기', '필요 생산일'];
    const q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = rows.map((i, k) => [i.seq || k + 1, i.kind, i.con, i.grp, i.cus, i.dst, i.fam, i.thk, i.wdt, i.cot, i.aft, (+i.t).toFixed(1), i.due, i.need].map(q).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [H.join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function openDay(ln, d) {
    const c = O.lines[ln][O.days.indexOf(d)], dlg = $('cc-dlg');
    const K = [['확정', '현장 작업지시 순서 그대로(MES 1010)'], ['편성', '소재 있음 — 현장 규칙 순서(넓은 폭 → 좁은 폭, 같은 폭은 얇은 것 먼저)'], ['예상', '입고 예정 소재 — 들어오면 편성으로']];
    const pg = Object.entries(c.planGrp || {}).filter(([, v]) => v >= 1).map(([g, v]) => `${g} ${n0(v)}`).join(' · ');
    let body = c.flag ? `<div class="fgl">⚠ ${esc(c.flag)} — ${c.fieldFam && c.fieldFam.length && c.flag.startsWith('계획') ? '현장 순서가 우선. M/C·강종 날짜를 재계획에 반영할지 확인' : '능력보다 지시가 많음 — 다음 날로 넘어갈 물량 확인'}</div>` : '';
    if (c.why) body += `<div class="fgl" style="background:var(--warn-bg);color:var(--warn)">빈칸 ${n0(c.gap)}t — ${esc(c.why)}</div>`;
    K.forEach(([k, d2]) => {
      const L = c.items.filter((i) => i.kind === k);
      if (!L.length) return;
      body += `<h4><span class="kd k${k}">${k}</span> ${n0(L.reduce((s, i) => s + i.t, 0))}t <span>${L.length}건 · ${d2}</span></h4>`
        + `<div style="overflow-x:auto"><table class="it" style="min-width:900px"><thead><tr><th class="num">순서</th><th>계약번호-행번 · 고객사 → 목적지</th><th>강종 · 수출 · 도금량 · 후처리</th><th>두께 × 폭</th><th>그룹</th><th class="num">톤</th><th>납기</th></tr></thead><tbody>${itemRows(L, k === '확정')}</tbody></table></div>`;
    });
    if (!c.items.length) body += `<p class="msg">${c.cap < 1 ? '라인 정지(정기수리·휴지)' : '배정된 주문 없음'}</p>`;
    dlg.innerHTML = `<div class="dh"><b>${ln} ${mdw(d)}</b><span>${c.fam || ''}${c.event ? ' · ' + esc(c.event) : ''}</span><span>능력 ${n0(c.cap)}t · 확정 ${n0(c.conf)} · 편성 ${n0(c.plan)} · 예상 ${n0(c.fcst)}${c.gap ? ` · 빈칸 ${n0(c.gap)}` : ''}</span>`
      + `${pg ? `<span>재계획 배분: ${pg}</span>` : ''}<span class="x"><button type="button" id="cc-csv">CSV 내려받기</button><button type="button" id="cc-x" aria-label="닫기">닫기 ×</button></span></div><div class="db">${body}</div>`;
    $('cc-x').onclick = () => dlg.close();
    $('cc-csv').onclick = () => csv(c.items, `도금_${ln}_${d}.csv`);
    dlg.showModal();
  }

  function byOrder(R) {                                     // 같은 주문서(계약번호)의 행은 한 줄로
    const m = new Map();
    R.forEach((r) => { const no = r.con.split('-').slice(0, -1).join('-') || r.con, o = m.get(no) || { no, rows: [], t: 0, need: r.need }; o.rows.push(r); o.t += r.t; if (r.need < o.need) o.need = r.need; m.set(no, o); });
    return [...m.values()].sort((a, b) => (a.need < b.need ? -1 : a.need > b.need ? 1 : b.t - a.t));
  }
  function riskCard() {
    const T = {
      win: ['2주 안에 필요 · 못 넣음', (r) => !r.od],
      od: ['밀린 주문 · 못 넣음', (r) => r.od && !r.stale],
      st: ['30일 넘게 밀림 · 취소/잔량 확인', (r) => r.stale],
    };
    const L = O.risk.filter(T[rk][1]);
    const byG = {};
    L.forEach((r) => { (byG[r.grp || '그룹 없음'] = byG[r.grp || '그룹 없음'] || []).push(r); });
    const seg = Object.entries(T).map(([k, [nm, f]]) => `<button type="button" data-rk="${k}" aria-pressed="${k === rk}">${nm} ${O.risk.filter(f).length}</button>`).join('');
    const grp = Object.entries(byG).sort((a, b) => b[1].reduce((s, r) => s + r.t, 0) - a[1].reduce((s, r) => s + r.t, 0)).map(([g, R]) => {
      const why = {};
      R.forEach((r) => { why[r.why] = (why[r.why] || 0) + r.t; });
      return `<div class="rg"><h3>${esc(g)} <span>${R.length}건 · ${n0(R.reduce((s, r) => s + r.t, 0))}t</span>${Object.entries(why).map(([w, t]) => `<span>${esc(w)} ${n0(t)}t</span>`).join('')}</h3>`
        + `<div style="overflow-x:auto"><table class="it" style="min-width:860px"><thead><tr><th>계약번호 · 고객사 → 목적지</th><th>라인 · 강종</th><th>상태</th><th class="num">못 넣은 톤</th><th>필요 생산일</th><th>이유</th></tr></thead><tbody>`
        + byOrder(R).map((o) => `<tr><td><div class="con">${esc(o.no)}${o.rows.length > 1 ? ` <span class="sub">행 ${o.rows.map((r) => esc(r.con.split('-').pop())).join('·')}</span>` : `-${esc(o.rows[0].con.split('-').pop())}`}</div><div class="sub">${who(o.rows[0])}</div></td>`
          + `<td class="nw">${esc(o.rows[0].line)} ${famCh(o.rows[0].fam)}</td><td class="nw">${[...new Set(o.rows.map((r) => r.st || ''))].map(esc).join(' · ')}</td>`
          + `<td class="num"><b>${n0(o.t)}</b></td><td class="nw">${md(o.need)}${o.rows[0].due ? `<div class="sub">납기 ${md(o.rows[0].due)}</div>` : ''}</td><td>${[...new Set(o.rows.map((r) => r.why))].map(esc).join('<br>')}</td></tr>`).join('')
        + '</tbody></table></div></div>';
    }).join('');
    return `<section class="card"><h2>칸에 못 들어간 주문 <small>그룹별 · 2주 창 기준</small></h2><div class="seg" id="cc-rk">${seg}</div>${grp || '<p class="msg">없음</p>'}</section>`;
  }

  function confirmCard() {
    const nw = nextWeek(), A = O.adherence || [], C = O.confirms || [];
    let who = ''; try { who = localStorage.getItem(WHO_KEY) || ''; } catch (e) { /* 무시 */ }
    const tot = (ln) => nw.reduce((s, d) => { const c = O.lines[ln][O.days.indexOf(d)]; return s + (c ? c.conf + c.plan + c.fcst : 0); }, 0);
    const last = C.find((c) => c.week === nw[0]);
    const adh = A.length ? '<table class="it" style="max-width:820px"><thead><tr><th>확정 주</th><th>저장</th><th class="num">확정 톤</th><th class="num">그 주 실제 생산</th><th class="num">준수율</th><th>라인별</th></tr></thead><tbody>'
      + A.map((a) => `<tr><td class="nw">${mdw(a.week)}~</td><td class="sub nw">${esc(a.who)} ${esc(String(a.at).slice(5, 16).replace('T', ' '))}</td><td class="num">${n0(a.confT)}</td><td class="num">${n0(a.doneT)}</td>`
        + `<td class="num"><b>${a.rate == null ? '-' : Math.round(a.rate * 100) + '%'}</b></td><td class="nw">${Object.entries(a.lines || {}).map(([l, v]) => `${l} ${v.confT ? Math.round(100 * v.doneT / v.confT) : '-'}%`).join(' · ')}</td></tr>`).join('') + '</tbody></table>'
      : '<p class="msg">저장된 확정본이 아직 없음 — 저장하면 다음 날 아침 자동 실행부터 준수율(확정 톤 중 그 주에 실제로 생산된 톤)이 나옵니다.</p>';
    return `<section class="card"><h2>수요일 확정 <small>다음 주 ${mdw(nw[0])} ~ ${mdw(nw[6])}</small></h2>`
      + `<div class="cf"><span class="nw">1CGL <b>${n0(tot('1CGL'))}t</b> · 2CGL <b>${n0(tot('2CGL'))}t</b></span><input id="cc-who" placeholder="이름" value="${esc(who)}" maxlength="20" aria-label="확정하는 사람 이름">`
      + `<button type="button" class="go" id="cc-save">이 계획으로 다음 주 확정 저장</button><span class="msg" id="cc-smsg">${last ? `이미 저장됨: ${esc(last.who)} ${esc(String(last.at).slice(5, 16).replace('T', ' '))} (다시 저장하면 최신본 기준)` : ''}</span></div>`
      + `${adh}</section>`;
  }

  async function save() {
    const nw = nextWeek(), w = $('cc-who').value.trim(), b = $('cc-save'), m = $('cc-smsg');
    if (!w) { m.textContent = '이름을 넣어 주세요'; $('cc-who').focus(); return; }
    try { localStorage.setItem(WHO_KEY, w); } catch (e) { /* 무시 */ }
    const lines = {};
    LINES.forEach((ln) => { lines[ln] = {}; nw.forEach((d) => { const c = O.lines[ln][O.days.indexOf(d)]; if (c) lines[ln][d] = c.items.map((i) => [i.con, +(+i.t).toFixed(1), i.kind]); }); });
    b.disabled = true; m.textContent = '저장 중…';
    try {
      const env = await GP.encryptJSON({ week: nw[0], asOf: O.asOf, built: O.built, lines }, PW, `도금 주간 확정 ${nw[0]}`);
      const r = await fetch(SB, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ who: w, week: nw[0], payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      m.textContent = `✓ 저장됨 ${new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — 내일 아침부터 준수율 계산`;
    } catch (e) { m.textContent = '⚠ 저장 실패: ' + e.message; }
    b.disabled = false;
  }

  function render() {
    const stale = Math.round((Date.now() - dt(O.asOf).getTime()) / 864e5);
    $('cc-main').innerHTML = (stale >= 2 ? `<div class="card" style="background:var(--warn-bg);color:var(--warn);font-weight:700">자료 기준 ${md(O.asOf)} — ${stale}일 전 자료</div>` : '')
      + kpis() + calCard() + confirmCard() + riskCard()
      + `<p class="msg" style="margin:4px 4px 0">자료 ${esc(O.asOf)} · ${esc(O.planSrc || '')} · 계산 ${esc(O.built || '')}</p>`;
    $('cc-main').querySelectorAll('button.cell').forEach((b) => b.onclick = () => openDay(b.dataset.ln, b.dataset.d));
    $('cc-main').querySelectorAll('#cc-rk button').forEach((b) => b.onclick = () => { rk = b.dataset.rk; try { localStorage.setItem(RK_KEY, rk); } catch (e) { /* 무시 */ } render(); });
    $('cc-save').onclick = save;
    if (window.UI) UI.reveal($('cc-main'));
  }
  $('cc-dlg').addEventListener('click', (e) => { if (e.target === $('cc-dlg')) $('cc-dlg').close(); });
  const envReady = GP.latest('cg_calendar.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('cc-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); PW = pw; try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('cc-form').hidden = false; $('cc-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    render();
  }
  $('cc-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('cc-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('cc-form').hidden = false; });
})();
