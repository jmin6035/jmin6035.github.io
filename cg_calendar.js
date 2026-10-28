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
  let O = null, PW = '', rk = 'win', MOVES = [];
  const MV_KEY = () => 'cgl-cal-moves|' + O.asOf;               // 옮기기 임시본(이 브라우저) — '다음 주 확정'을 눌러야 저장
  const compat = (df, f) => !!f && (f === df || String(f).split('-')[0] === df || (f === 'AZ·MAC' && (df === 'AZ' || df === 'MAC')));
  const cellOf = (ln, d) => O.lines[ln][O.days.indexOf(d)];
  function recalc(c) {
    const s = { 확정: 0, 편성: 0, 예상: 0 }, g = {};
    c.items.forEach((i) => { s[i.kind] += i.t; g[i.grp || '?'] = (g[i.grp || '?'] || 0) + i.t; });
    c.conf = s.확정; c.plan = s.편성; c.fcst = s.예상;
    const fill = s.확정 + s.편성 + s.예상;
    c.gap = c.cap - fill >= 0.5 ? Math.round((c.cap - fill) * 10) / 10 : 0;
    c.grp = Object.fromEntries(Object.entries(g).sort((a, b) => b[1] - a[1]));
    c.late = c.items.filter((i) => i.late).length;
    c.mvIn = c.items.filter((i) => i.moved).length;
    const bad = [...new Set(c.items.filter((i) => i.moved && !compat(c.fam, i.fam)).map((i) => i.fam))];
    c.flag = c.flag0; c.flagS = c.flagS0;
    if (!c.flag && bad.length) { c.flag = `옮긴 ${bad.join('·')} 주문 — 그날 계획 강종 ${c.fam}`; c.flagS = `${bad.join('·')} 주문 · 계획 ${c.fam}`; }
    if (!c.flag && fill - c.cap >= 5) { c.flag = `배정 ${n0(fill)}t > 능력 ${n0(c.cap)}t`; c.flagS = `능력 초과 ${n0(fill - c.cap)}t`; }
    if (c.mvOut && c.gap) c.why = '주문을 다른 날로 옮겨서 빔';
  }
  function applyMoves() {
    O.lines = JSON.parse(JSON.stringify(O.base));
    LINES.forEach((ln) => O.lines[ln].forEach((c) => { c.flag0 = c.flag; c.flagS0 = c.flagS; c.mvOut = 0; }));
    MOVES.forEach((m) => {
      const a = cellOf(m.fl, m.fd), b = cellOf(m.tl, m.td);
      const k = a ? a.items.findIndex((i) => i.con === m.con && i.kind === m.kind && !i.moved) : -1;
      if (!b || k < 0) { m.bad = true; return; }
      let it = a.items[k];
      if (m.t < it.t - 0.05) { it.t = Math.round((it.t - m.t) * 10) / 10; it = Object.assign({}, it, { t: m.t }); }   // 일부만 옮김
      else a.items.splice(k, 1);
      it.moved = { fd: m.fd, fl: m.fl };
      it.late = !!(it.need && it.need >= O.asOf && it.need < m.td);
      it.matLate = it.kind === '예상' && !!it.avail && it.avail > m.td;
      a.mvOut = (a.mvOut || 0) + 1;
      b.items.push(it);
      if (m.swap) {                                            // 넘치는 만큼 그날 주문 중 필요일 늦은 것을 원래 날로(자리 바꾸기)
        let over = b.items.reduce((s2, i) => s2 + i.t, 0) - b.cap;
        const cand = b.items.filter((i) => i.kind !== '확정' && !i.moved && compat(a.fam, i.fam) && (i.pline === '공용' || i.pline === m.fl || !i.pline)).sort((x, y) => String(y.need || '9') < String(x.need || '9') ? -1 : 1);
        for (const i of cand) {
          if (over < 0.5) break;
          const q = Math.min(i.t, Math.round(over * 10) / 10);
          let mv = i;
          if (q < i.t - 0.05) { i.t = Math.round((i.t - q) * 10) / 10; mv = Object.assign({}, i, { t: q }); } else b.items.splice(b.items.indexOf(i), 1);
          mv.moved = { fd: m.td, fl: m.tl, swap: true };
          mv.late = !!(mv.need && mv.need >= O.asOf && mv.need < m.fd);
          a.items.push(mv); over -= q;
        }
      }
      b.items.sort((x, y) => (x.kind === '확정' ? 0 : 1) - (y.kind === '확정' ? 0 : 1) || (x.kind === '확정' ? (x.seq || 0) - (y.seq || 0) : (y.wdt || 0) - (x.wdt || 0) || (x.thk || 9) - (y.thk || 9)));
    });
    LINES.forEach((ln) => O.lines[ln].forEach(recalc));
  }
  const saveMoves = () => { try { localStorage.setItem(MV_KEY(), JSON.stringify(MOVES)); } catch (e) { /* 무시 */ } };
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
      + k('밀린 주문', `${n0(O.odT)}<small>t · ${O.nOd}건</small>`, `필요 생산일이 이미 지난 미생산 — 2주 안에 먼저 넣음${(O.shipMiss || []).length ? ` · 그중 배 놓친 수출 ${O.shipMiss.length}건(입항 지남, 배선 변경 확인)` : ''}`, O.odT > 0 ? 'bad' : 'good')
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
    const mc = /M\/C/.test(c.event || '');
    return `<button type="button" class="cell${mc ? ' mc' : ''}${c.flag ? ' fl' : ''}" data-ln="${ln}" data-d="${c.d}">`
      + `<div class="ct">${famCh(c.fam)}${tag}</div>`
      + `<div class="bar"><i class="c" style="width:${w(c.conf)}"></i><i class="p" style="width:${w(c.plan)}"></i><i class="f" style="width:${w(c.fcst)}"></i></div>`
      + `<div class="tv">${n0(fill)}<small>t</small>${c.gap ? ` <small style="color:var(--bad);font-weight:800">빈칸 ${n0(c.gap)}</small>` : ''}</div>`
      + `<div class="gl">${gs}</div>`
      + (c.flag ? `<div class="fg">⚠ ${esc(c.flagS || c.flag)}</div>` : '')
      + (c.late ? `<div class="lt">늦어짐 ${c.late}건</div>` : '')
      + (c.mvIn || c.mvOut ? `<div class="mvc">옮김${c.mvIn ? ` 들어옴 ${c.mvIn}` : ''}${c.mvOut ? ` 나감 ${c.mvOut}` : ''}</div>` : '')
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
      + '<span><i style="background:#fff3bf;border:1px solid #f59f00"></i>노랑 = M/C(강종 교체)</span><span><i style="background:var(--bad)"></i>빨간 줄 = 계획≠현장</span>'
      + `<span>능력·강종 = 최신 재계획 · 배정 = 필요 생산일 빠른 순(수출 = 입항 − 4일${O.expNeed && O.expNeed.due ? `, 입항 자료 없는 수출 ${O.expNeed.due}건은 납기 − 3일` : ''})</span></div>`
      + moveBar()
      + `<div class="wk">${weekTable(O.days.slice(0, 7), nw)}</div><div class="wk">${weekTable(O.days.slice(7, 14), nw)}</div></section>`;
  }
  function moveBar() {
    if (!MOVES.length) return '<p class="msg" style="margin:0 0 10px">날짜를 바꾸려면 칸을 눌러 주문 오른쪽 「옮기기」에서 고르세요(소재 있음·입고 예정 주문만, 현장 지시된 것은 MES에서).</p>';
    return `<div class="mvbar"><b>옮긴 주문 ${MOVES.length}건</b><span class="msg">임시 — 아래 「다음 주 확정」을 눌러야 저장되고 다음 날 계산에도 그대로 반영</span><button type="button" class="lnk" id="mv-clear">모두 되돌리기</button><ul>`
      + MOVES.map((m, k) => `<li${m.bad ? ' class="bad"' : ''}><b>${esc(m.con)}</b> ${n0(m.t)}t · ${m.fl === m.tl ? m.fl : ''} ${mdw(m.fd)}${m.fl !== m.tl ? ` ${m.fl}` : ''} → <b>${mdw(m.td)}${m.fl !== m.tl ? ` ${m.tl}` : ''}</b>${m.swap ? ' <span class="sub">(넘치면 자리 바꾸기)</span>' : ''}${m.bad ? ' · 원래 칸에 없음(자료 갱신)' : ''} <button type="button" class="lnk" data-undo="${k}">되돌리기</button></li>`).join('')
      + '</ul></div>';
  }

  const who = (i) => [i.cus && esc(i.cus), i.dst && `<span class="nw">→ ${esc(i.dst)}</span>`, i.man && `<span class="nw">담당 ${esc(i.man)}</span>`].filter(Boolean).join(' · ');
  function moveOpts(i, ln, d) {                              // 옮길 날 목록: 남은 능력 · 경고(강종 다름 · 넘침 · 소재 입고 전)
    const lines = i.pline === '공용' ? LINES : [i.pline || ln], opt = [];
    lines.forEach((l) => O.days.forEach((dd) => {
      if (l === ln && dd === d) return;
      const c = cellOf(l, dd), left = c.cap - c.conf - c.plan - c.fcst;
      const warn = [!compat(c.fam, i.fam) ? `강종 ${c.fam || '-'}` : '', left < i.t ? `넘침 ${n0(i.t - Math.max(0, left))}t` : '', i.kind === '예상' && i.avail && i.avail > dd ? `소재 ${md(i.avail)}부터` : ''].filter(Boolean);
      opt.push(`<option value="${l}|${dd}">${mdw(dd)}${l !== ln ? ' ' + l : ''} · 남은 ${n0(Math.max(0, left))}t${warn.length ? ' ⚠ ' + warn.join(' ') : ''}</option>`);
    }));
    return opt.join('');
  }
  function itemRows(L0, ln, d) {
    let n = 0;
    const L = [], at = {};                                    // 같은 주문의 편성·예상 조각은 한 줄로(옮기기는 앞 조각 기준)
    L0.forEach((i, k) => {
      if (i.kind !== '확정' && at[i.con] != null) {
        const a = L[at[i.con]];
        if (a.kind === '예상' && i.kind === '편성') { const tt = a.tt + i.t; Object.assign(a, i, { k, tt, extra: tt - i.t, xk: '예상' }); return; }   // 편성 조각을 기준으로
        a.tt += i.t; a.extra = (a.extra || 0) + i.t; a.xk = i.kind; return;
      }
      if (i.kind !== '확정') at[i.con] = L.length;
      L.push(Object.assign({}, i, { k, tt: i.t }));
    });
    return L.map((i) => {
      const k = i.k;
      const need = i.od ? `<span class="bd od">밀림 ${md(i.need)}</span>` : i.late ? `<span class="bd late">늦음 ${md(i.need)}</span>` : i.need ? `필요 <b>${md(i.need)}</b>` : '';
      const tags = [i.moved ? `<span class="bd mv">${i.moved.swap ? '자리 바꿈' : '옮김'} ← ${md(i.moved.fd)}${i.moved.fl !== ln ? ' ' + i.moved.fl : ''}</span>` : i.locked ? '<span class="bd mv">확정본</span>' : '',
        i.matLate ? `<span class="bd od">소재 ${md(i.avail)}부터</span>` : '', i.shipMiss ? '<span class="bd od">배 놓침</span>' : ''].filter(Boolean).join(' ');
      const seq = i.kind === '확정' ? (i.seq || k + 1) : ++n;
      return `<tr class="r${i.kind}"><td class="sq"><span class="kd k${i.kind}">${i.kind}</span> ${seq}</td>`
        + `<td><div class="con">${esc(i.con)}</div><div class="sub one">${who(i)}</div></td>`
        + `<td><span class="chs1">${famCh(i.fam)}${i.exp ? '<span class="ch exp">수출</span>' : '<span class="ch">내수</span>'}${i.cot ? `<span class="ch">${esc(i.cot)}</span>` : ''}${i.aft ? `<span class="ch">${esc(i.aft)}</span>` : ''}</span></td>`
        + `<td class="sz">${i.thk != null ? `${(+i.thk).toFixed(2)}×${n0(i.wdt)}` : '-'}</td><td class="nw"><b>${esc(i.grp || '')}</b></td>`
        + `<td class="num"><b>${(+i.tt).toFixed(1)}</b>${i.extra ? `<div class="sub xs">${i.xk} ${(+i.extra).toFixed(1)}</div>` : ''}</td>`
        + `<td class="nw dt2">${[i.arr ? `입항 <b>${md(i.arr)}</b>` : i.due ? `납기 ${md(i.due)}` : '', need].filter(Boolean).join(' · ')}${tags ? `<div>${tags}</div>` : ''}</td>`
        + `<td class="nw">${i.kind === '확정' ? '<span class="sub">MES 지시됨</span>' : `<button type="button" class="lnk mvb" data-k="${k}">옮기기</button>`}</td></tr>`
        + (i.kind === '확정' ? '' : `<tr class="mvr" id="mvr-${k}" hidden><td></td><td colspan="7"><div class="mvw"><b>${esc(i.con)}</b><input type="number" class="mvt" value="${(+i.t).toFixed(1)}" min="0.1" max="${i.t}" step="0.1" aria-label="옮길 톤">t 를`
          + `<select class="mv" aria-label="옮길 날짜"><option value="">날짜 고르기…</option>${moveOpts(i, ln, d)}</select>(으)로 <button type="button" class="go2" data-k="${k}">옮기기</button></div></td></tr>`);
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
    const pg = Object.entries(c.planGrp || {}).filter(([, v]) => v >= 1).map(([g, v]) => `${g} ${n0(v)}`).join(' · ');
    let body = c.flag ? `<div class="fgl">⚠ ${esc(c.flag)} — ${c.flag.startsWith('계획') ? '현장 순서가 우선. M/C·강종 날짜를 재계획에 반영할지 확인' : c.flag.startsWith('옮긴') || c.flag.startsWith('확정본에') ? 'M/C 없이는 이날 생산 불가 — 다른 날로 옮기기' : '능력보다 많음 — 일부를 다른 날로 옮기기'}</div>` : '';
    if (c.why) body += `<div class="fgl" style="background:var(--warn-bg);color:var(--warn)">빈칸 ${n0(c.gap)}t — ${esc(c.why)}</div>`;
    let sw = true; try { sw = localStorage.getItem('cgl-cal-swap') !== '0'; } catch (e) { /* 무시 */ }
    body += '<div class="how"><div><b>이 날에 들어온 기준</b> 필요 생산일(수출 = 입항 − 4일, 내수 = 납기 − 3일) 빠른 주문부터, 그날 라인·강종이 맞는 것을 능력만큼 · 소재 있음(편성) 먼저, 입고 예정(예상)은 입고 + 5일부터</div>'
      + '<div><b>순서</b> 확정 = MES 작업지시 순서 그대로 · 편성·예상 = 현장 규칙(넓은 폭 → 좁은 폭, 같은 폭이면 얇은 것 먼저)</div>'
      + `<div><b>옮기기</b> 고른 날 칸에 넣고 그 날 순서는 위 규칙으로 다시 정렬 · <label><input type="checkbox" id="mv-swap"${sw ? ' checked' : ''}> 그 날이 넘치면 그 날 주문 중 필요일 가장 늦은 것을 이 날로 바꿔 넣기</label> · 「다음 주 확정」을 눌러야 저장</div></div>`;
    body += c.items.length ? `<table class="it cmp"><colgroup><col style="width:9%"><col style="width:25%"><col style="width:17%"><col style="width:10%"><col style="width:6%"><col style="width:7%"><col style="width:18%"><col style="width:8%"></colgroup>`
      + `<thead><tr><th>구분 · 순서</th><th>계약번호-행번 · 고객사 → 목적지</th><th>강종 · 수출 · 도금량 · 후처리</th><th>두께×폭</th><th>그룹</th><th class="num">톤</th><th>입항(납기) · 필요 생산일</th><th></th></tr></thead><tbody>${itemRows(c.items, ln, d)}</tbody></table>`
      : `<p class="msg">${c.cap < 1 ? '라인 정지(정기수리·휴지)' : '배정된 주문 없음'}</p>`;
    dlg.innerHTML = `<div class="dh"><b>${ln} ${mdw(d)}</b><span>${famCh(c.fam)}${c.event ? ' · ' + esc(c.event) : ''}</span><span>능력 <b>${n0(c.cap)}t</b> = ${[['확정', c.conf], ['편성', c.plan], ['예상', c.fcst], ['빈칸', c.gap]].filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} ${n0(v)}`).join(' + ')}</span>`
      + `${pg ? `<span>재계획: ${pg}</span>` : ''}<span class="x"><button type="button" id="cc-csv">CSV</button><button type="button" id="cc-x" aria-label="닫기">닫기 ×</button></span></div><div class="db">${body}</div>`;
    $('cc-x').onclick = () => dlg.close();
    $('cc-csv').onclick = () => csv(c.items, `도금_${ln}_${d}.csv`);
    dlg.querySelectorAll('button.mvb').forEach((b) => b.onclick = () => { const r = $('mvr-' + b.dataset.k); r.hidden = !r.hidden; });
    dlg.querySelectorAll('button.go2').forEach((b) => b.onclick = () => {
      const r = $('mvr-' + b.dataset.k), it = c.items[+b.dataset.k], v = r.querySelector('select.mv').value;
      if (!v) { r.querySelector('select.mv').focus(); return; }
      const [tl, td] = v.split('|'), tin = +r.querySelector('.mvt').value;
      const t = Math.min(it.t, tin > 0 ? Math.round(tin * 10) / 10 : it.t);
      MOVES.push({ con: it.con, kind: it.kind, t, fl: ln, fd: d, tl, td, swap: $('mv-swap').checked });
      try { localStorage.setItem('cgl-cal-swap', $('mv-swap').checked ? '1' : '0'); } catch (e) { /* 무시 */ }
      saveMoves(); applyMoves(); render();
      if (window.UI && UI.toast) UI.toast(`${it.con} ${n0(t)}t → ${mdw(td)} ${tl}`);
      openDay(ln, d);
    });
    if (!dlg.open) dlg.showModal();
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
      : '<p class="msg">아직 확정한 주 없음</p>';
    return `<section class="card"><h2>다음 주 생산 확정 <small>매주 수요일 오전 · ${mdw(nw[0])} ~ ${mdw(nw[6])}</small></h2>`
      + '<p class="msg" style="margin:0 0 10px">위 캘린더의 다음 주(파란 머리 칸) 라인·날짜별 생산 주문을 그대로 저장 → 공정출하·마케팅과 약속한 주간 편성. 다음 주가 지나면 실제 생산과 비교해 지킨 비율(준수율)을 아래에 표시</p>'
      + `<div class="cf"><span class="nw">다음 주 생산 1CGL <b>${n0(tot('1CGL'))}t</b> · 2CGL <b>${n0(tot('2CGL'))}t</b></span><input id="cc-who" placeholder="이름" value="${esc(who)}" maxlength="20" aria-label="확정하는 사람 이름">`
      + `<button type="button" class="go" id="cc-save">다음 주 확정</button><span class="msg" id="cc-smsg">${last ? `이미 저장됨: ${esc(last.who)} ${esc(String(last.at).slice(5, 16).replace('T', ' '))} (다시 저장하면 최신본 기준)` : ''}</span></div>`
      + `${adh}</section>`;
  }

  async function save() {
    const nw = nextWeek(), w = $('cc-who').value.trim(), b = $('cc-save'), m = $('cc-smsg');
    if (!w) { m.textContent = '이름을 넣어 주세요'; $('cc-who').focus(); return; }
    try { localStorage.setItem(WHO_KEY, w); } catch (e) { /* 무시 */ }
    const lines = {};
    const pack = (c) => c.items.map((i) => [i.con, +(+i.t).toFixed(1), i.kind]);
    LINES.forEach((ln) => { lines[ln] = {}; nw.forEach((d) => { const c = cellOf(ln, d); if (c) lines[ln][d] = pack(c); }); });
    const extra = {};                                         // 다음 주 밖이지만 옮긴 날(이번 주 등)도 같이 고정
    MOVES.filter((m) => !m.bad).forEach((m) => [[m.fl, m.fd], [m.tl, m.td]].forEach(([l, d]) => { if (!nw.includes(d)) { extra[l] = extra[l] || {}; extra[l][d] = pack(cellOf(l, d)); } }));
    b.disabled = true; m.textContent = '저장 중…';
    try {
      const env = await GP.encryptJSON({ week: nw[0], asOf: O.asOf, built: O.built, lines, extra, moves: MOVES.filter((m) => !m.bad) }, PW, `도금 주간 확정 ${nw[0]}`);
      const r = await fetch(SB, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ who: w, week: nw[0], payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      m.textContent = `✓ 저장됨 ${new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${MOVES.length ? ` · 옮긴 ${MOVES.length}건 포함` : ''} — 다음 계산부터 이 배치 고정, 다시 확정하면 최신본으로 바뀜`;
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
    if ($('mv-clear')) $('mv-clear').onclick = () => { MOVES = []; saveMoves(); applyMoves(); render(); };
    $('cc-main').querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => { MOVES.splice(+b.dataset.undo, 1); saveMoves(); applyMoves(); render(); });
    if (window.UI) UI.reveal($('cc-main'));
  }
  $('cc-dlg').addEventListener('click', (e) => { if (e.target === $('cc-dlg')) $('cc-dlg').close(); });
  const envReady = GP.latest('cg_calendar.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('cc-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); PW = pw; try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('cc-form').hidden = false; $('cc-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    O.base = JSON.parse(JSON.stringify(O.lines));
    try { MOVES = JSON.parse(localStorage.getItem(MV_KEY()) || '[]'); } catch (e) { MOVES = []; }
    applyMoves();
    render();
  }
  $('cc-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('cc-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('cc-form').hidden = false; });
})();
