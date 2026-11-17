/* 계획 > 소재(11/12 사용자 시안4): ① 소재 현황 표(이달 확보 · 지금 재고로 버티나) ② 발주 · 입고 캘린더(소재마다 발주·입고 두 줄)
   숫자 = supply.js 소재 캘린더와 같은 계산(window.SupMat.MP — 소재 유형별 일별 발주·입고·생산 투입)
   · 이달 필요 = 그 달 입고 줄 합 = 입고 완료(MES 실입고) + 발주(발주 완료분 입고 예정) + 미발주(아직 발주 안 함)
   · 지금 재고 · 판정 = 소재 코드별 재고(SupMat.PM: 소재재고List · FH 추정)를 오늘부터 발주 완료분 입고 + , 생산 투입 − 로 굴림(추가 발주 없음 가정)
     재고는 소재 코드(CGI · F/H 등) 단위라 같은 코드를 쓰는 유형(P-GI · 서림GI …)은 한 칸으로 묶음 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const n0 = (v) => Math.round(v).toLocaleString('ko-KR');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const addD = (s, k) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const WD = '일월화수목금토', wd = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const PLN = { G: '도금 소재', C: '컬러 소재' };
  const HOL = new Set(['2026-12-25', '2027-01-01']);   // 공휴일(01 gyehoek.js 와 같은 목록)
  const inScope = (pl) => !window.UI || !UI.inScope || UI.inScope(pl);

  function monthDays(m) { const out = []; for (let d = m + '-01'; d.slice(0, 7) === m; d = addD(d, 1)) out.push(d); return out; }
  const codeOf = (e) => (e.j ? e.j.code : e.a ? e.a.code : null);

  function calc(mon) {
    const S = window.SupMat, MP = S.MP, today = S.today, sumT = S.sumT, ds = monthDays(mon), mEnd = ds[ds.length - 1];
    const PM = Object.fromEntries((S.PM || []).map((m) => [m.k, m]));
    // 유형별 그 달 숫자
    const T = Object.entries(MP.T).filter(([, R]) => inScope(R.plant)).map(([c, R]) => {
      const o = { c, pl: R.plant, rec: 0, ord: 0, nw: 0, ovr: 0, od: {}, ib: {}, ibN: {}, odt: {}, late: {}, codes: new Set(), use: 0, lateNw: 0, lateDay: null };
      for (const d of ds) {
        const I = R.inb[d] || [], O = R.ord[d] || [];
        for (const e of I) { if (e.kind === 'act') o.rec += e.t; else if (e.kind === 'new') o.nw += e.t; else if (e.a && /예정일 지남/.test(e.a.note || '')) o.ovr += e.t; else o.ord += e.t;   // 예정일 지난 미입고는 '입고 예정'에서 빼서 따로(확보로 안 셈)
          if (e.kind === 'new' && e.x && e.x.dl < today) { o.lateNw += e.t; const f = (e.j && e.j.first) || d; if (!o.lateDay || f < o.lateDay) o.lateDay = f < today ? today : f; } }   // 발주 마감 지난 미발주
        // 11/13 점검: 입고 줄 = 입고 완료·발주 완료분 입고 예정만(초록) · 미발주 필요량(new)은 따로(빨강 '필요') — 발주 안 한 양이 입고처럼 보이던 것
        const ti = sumT(I.filter((e) => e.kind !== 'new')), tn = sumT(I.filter((e) => e.kind === 'new')), to = sumT(O);
        if (ti >= 0.5) o.ib[d] = ti; if (tn >= 0.5) o.ibN[d] = tn;
        { const ods = [...new Set(I.filter((e) => e.kind === 'arr' && e.a).map((e) => (S.poDate && S.poDate(e.a.po)) || ((/(\d{2})\/(\d{2}) 발주/.exec(e.a.note || '') || [])[0] ? `${mon.slice(0, 4)}-${/(\d{2})\/(\d{2}) 발주/.exec(e.a.note)[1]}-${/(\d{2})\/(\d{2}) 발주/.exec(e.a.note)[2]}` : null)).filter(Boolean))].sort(); if (ods.length) o.odt[d] = ods; }   // 입고 예정분의 발주일
        if (to >= 0.5) { o.od[d] = to; const lt_ = sumT(O.filter((e) => e.late)); if (lt_ >= 0.5 && lt_ >= to * 0.5) o.late[d] = lt_; else if (lt_ >= 0.5) (o.lateP = o.lateP || {})[d] = lt_; }   // 마감 지난 몫이 절반 넘으면 숫자 빨강, 아니면 주황 — 둘 다 칸 아래에 '지연 n' 을 따로 적음(11/17 사용자: 빨간 밑줄은 무슨 뜻인지 안 보임)
        for (const e of O) if (e.kind === 'mlate' && e.m) { const f = e.m.first || (e.m.sizes || []).map((z) => z[3]).filter(Boolean).sort()[0]; if (f && (!o.mlDay || f < o.mlDay)) o.mlDay = f; }   // 마감 지난 부족(수주 관제 matLate 와 같은 목록)의 첫 부족일
        o.use += sumT(R.use[d]);
      }
      for (const k of ['use', 'inb']) for (const L of Object.values(R[k])) for (const e of L) { const cd = codeOf(e); if (cd) o.codes.add(`${R.plant}:${cd}`); }
      o.need = o.rec + o.ord + o.nw + o.ovr;
      o.cal = Object.keys(o.od).length + Object.keys(o.ib).length + Object.keys(o.ibN).length > 0;
      return o;
    });
    // 같은 소재 코드를 쓰는 유형끼리 묶음(재고는 코드 단위)
    const par = {}, find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
    T.forEach((t) => { par[t.c] = t.c; });
    const byCode = {}; T.forEach((t) => t.codes.forEach((k) => { if (byCode[k]) par[find(t.c)] = find(byCode[k]); else byCode[k] = t.c; }));
    const comps = {};
    T.forEach((t) => { const r = find(t.c); (comps[r] = comps[r] || { pl: t.pl, types: [], codes: new Set() }).types.push(t); t.codes.forEach((k) => comps[r].codes.add(k)); });
    for (const C of Object.values(comps)) {
      const ms = [...C.codes].map((k) => PM[k]).filter(Boolean);
      C.names = ms.map((m) => m.nm);
      if (!ms.length || mEnd < today) { C.stock = null; C.st = 'na'; continue; }
      if (C.codes.size && [...C.codes].every((k) => k === 'G:N')) { C.stock = ms.reduce((a_, m) => a_ + m.stock0, 0); C.st = 'na'; C.giv = 1; continue; }   // 11/17 검토: 도금 SUS = 포스코 지급(발주 당일 입고) — 부족 판정 안 함
      C.stock = ms.reduce((a, m) => a + m.stock0, 0);
      C.byNm = ms.length > 1 ? ms.map((m) => [m.nm, m.stock0]) : null;   // 11/17 검토: 서로 대신 못 쓰는 코드(PosMAC1.5·3.0)는 코드마다 판정
      C.st = 'ok'; C.min = null;
      const rk = { bad: 0, warn: 1, ok: 2 };
      for (const m of ms) {
        let s_ = 'ok', day = null, n2 = null, v2 = null;
        for (let d = today; d <= mEnd; d = addD(d, 1)) {
          if (m.stock[d] == null) break;
          const v = m.stock[d], need2 = (m.use[addD(d, 1)] || 0) + (m.use[addD(d, 2)] || 0);
          if (C.min == null || v < C.min.v) C.min = { d, v, nm: ms.length > 1 ? m.nm : '' };
          if (v < -0.5) { s_ = 'bad'; day = d; break; }
          if (s_ === 'ok' && need2 >= 0.5 && v < need2) { s_ = 'warn'; day = d; n2 = need2; v2 = v; }
        }
        if (rk[s_] < rk[C.st] || (s_ === C.st && s_ !== 'ok' && day < C.day)) { C.st = s_; C.day = day; C.n2 = n2; C.v2 = v2; C.dNm = ms.length > 1 ? m.nm : ''; }
      }
      const st = (d) => ms.reduce((a, m) => a + (m.stock[d] != null ? m.stock[d] : 0), 0), us = (d) => ms.reduce((a, m) => a + (m.use[d] || 0), 0);
      // 11/13 점검(02 현황 결품 위험과 같은 기준): ① 발주 마감 지난 미발주가 있으면 부족(첫 부족일) ② 월말 재고 5일분 미만(수주 관제 신호 matDays 경고)이면 빠듯
      const ln = C.types.filter((t) => t.lateNw >= 0.5);
      if (ln.length && C.st !== 'bad') {   // 11/17 검토: 첫 부족일 = 재고 굴림의 첫 음수일(달 넘어서도) — 보는 달마다 달라지던 것
        let neg = null; for (const m of ms) for (const [d, v] of Object.entries(m.stock)) if (d >= today && v < -0.5 && (!neg || d < neg)) neg = d;
        C.st = 'bad'; C.lateOnly = true; C.day = neg || ln.map((t) => t.mlDay || t.lateDay).sort()[0]; C.lateNw = ln.reduce((a, t) => a + t.lateNw, 0); }   // 첫 부족일 = 수주 관제(04)와 같은 값 우선
      if (C.st === 'ok' && ms.some((m) => m.stock[mEnd] != null)) { const ve = st(mEnd), du = ds.reduce((a, d) => a + us(d), 0) / ds.length;
        if (du >= 0.5 && ve / du < 5) { C.st = 'warn'; C.low = { v: ve, days: ve / du }; } }
    }
    const rank = { bad: 0, warn: 1, ok: 2, na: 3 };
    const groups = ['G', 'C'].filter(inScope).map((pl) => {
      const cs = Object.values(comps).filter((C) => C.pl === pl).map((C) => {
        C.rows = C.types.filter((t) => t.need >= 0.5 || ((C.st === 'bad' || C.st === 'warn') && t.use >= 0.5)).sort((a, b) => b.need - a.need);
        C.nw = C.rows.reduce((a, t) => a + t.nw, 0); C.need = C.rows.reduce((a, t) => a + t.need, 0);
        return C;
      }).filter((C) => C.rows.length)
        .sort((a, b) => rank[a.st] - rank[b.st] || (a.day || '').localeCompare(b.day || '') || (b.nw >= 0.5) - (a.nw >= 0.5) || b.need - a.need);
      const sum = (f) => cs.reduce((a, C) => a + C.rows.reduce((x, t) => x + t[f], 0), 0);
      const stocks = cs.filter((C) => C.stock != null);
      return { pl, cs, need: sum('need'), rec: sum('rec'), ord: sum('ord'), nw: sum('nw'), ovr: sum('ovr'), stock: stocks.length ? stocks.reduce((a, C) => a + C.stock, 0) : null, flag: cs.filter((C) => C.st === 'bad' || C.st === 'warn').length };
    });
    const shown = new Set(groups.flatMap((g) => g.cs.flatMap((C) => C.rows.map((t) => t.c))));
    const calRows = groups.map((g) => ({ pl: g.pl, rows: [...g.cs.flatMap((C) => C.rows), ...T.filter((t) => t.pl === g.pl && !shown.has(t.c) && t.cal).sort((a, b) => b.need - a.need)].filter((t) => t.cal) }));
    const quiet = T.filter((t) => !t.cal).map((t) => t.c);
    return { mon, ds, today, groups, calRows, quiet };
  }

  // ---------- ① 소재 현황 ----------
  const pc = (r) => (r.need ? Math.min(Math.round((r.rec + r.ord) / r.need * 100), r.nw + (r.ovr || 0) >= 0.5 ? 99 : 100) : 100);   // 미발주가 남으면 100% 아님
  const bar = (r) => { const f = (v) => (r.need ? (v / r.need * 100).toFixed(2) : 0) + '%';
    return `<div class="m4-pw"><div class="m4-sb" title="${esc(`입고 완료 ${n0(r.rec)}t · 발주(입고 예정) ${n0(r.ord)}t · 미발주 ${n0(r.nw)}t`)}">${r.rec >= 0.5 ? `<i class="in" style="width:${f(r.rec)}"></i>` : ''}${r.ord >= 0.5 ? `<i class="po" style="width:${f(r.ord)}"></i>` : ''}${r.nw >= 0.5 ? `<i class="no" style="width:${f(r.nw)}"></i>` : ''}</div><b>${pc(r)}%</b></div>`; };
  const nums = (r) => `<td>${n0(r.need)}</td><td class="c-in">${n0(r.rec)}</td><td>${n0(r.ord)}</td><td class="${(r.ovr || 0) >= 0.5 ? 'c-no' : 'mu'}">${(r.ovr || 0) >= 0.5 ? n0(r.ovr) : '–'}</td><td class="${r.nw >= 0.5 ? 'c-no' : 'mu'}">${r.nw >= 0.5 ? n0(r.nw) : '–'}</td><td class="pc">${bar(r)}</td>`;
  function judge(C) {
    if (C.st === 'na' && C.giv) return '<span class="m4-jd na" title="도금 SUS 지급재(포스코·외부 업체) — MES 상 발주일에 입고돼 입고 예정 자료가 없어 부족 판정을 하지 않음">지급재</span>';
    if (C.st === 'na') return '<span class="m4-jd na" title="이 소재 코드의 재고 자료 없음">–</span>';
    if (C.st === 'bad' && C.lateOnly) return `<span class="m4-jd bad" title="${esc(`업체·주 단위 발주 계획에서 발주 지연 ${n0(C.lateNw)}t · 재고 부족 ${md(C.day)}부터(추가 발주 없음 가정)`)}">발주 지연 ${n0(C.lateNw)}t · <b class="dt">${md(C.day)}</b>부터 부족</span>`;
    if (C.st === 'bad') return `<span class="m4-jd bad" title="${esc(C.lateNw ? `발주 지연 ${n0(C.lateNw)}t — ${md(C.day)}부터 부족` : `${C.dNm ? C.dNm + ' ' : ''}${md(C.day)} 부터 재고 부족(추가 발주 없음 가정 · 발주 완료분 입고 반영)`)}"><b class="dt">${md(C.day)}</b>부터 부족${C.dNm ? `<small> ${esc(C.dNm)}</small>` : ''}</span>`;
    if (C.st === 'warn' && C.low) return `<span class="m4-jd warn" title="${esc(`월말 재고 ${n0(C.low.v)}t = 하루 평균 투입의 ${C.low.days.toFixed(1)}일분(5일분 미만)`)}">월말 ${C.low.days.toFixed(1)}일분</span>`;
    if (C.st === 'warn') return `<span class="m4-jd warn" title="${esc(`${C.dNm ? C.dNm + ' ' : ''}${md(C.day)} 재고 ${n0(C.v2)}t < 다음 이틀 투입 ${n0(C.n2)}t`)}"><b class="dt">${md(C.day)}</b> 빠듯${C.dNm ? `<small> ${esc(C.dNm)}</small>` : ''}</span>`;
    return `<span class="m4-jd ok"${C.min ? ` title="${esc(`말일까지 최저 ${md(C.min.d)} ${n0(C.min.v)}t`)}"` : ''}>충분</span>`;
  }
  function table(R) {
    const M = +R.mon.slice(5);
    let b = '';
    for (const g of R.groups) {
      if (!g.cs.length) continue;
      b += `<tr class="gt"><th>${PLN[g.pl]}</th>${nums(g)}<td class="stk">${g.stock == null ? '–' : n0(g.stock)}</td><td>${g.flag ? `<span class="m4-jdn">${g.cs.every((C) => C.st !== 'warn') ? '부족' : '부족·빠듯'} ${g.flag}종</span>` : '<span class="m4-jd ok">충분</span>'}</td></tr>`;
      for (const C of g.cs) C.rows.forEach((t, i) => {
        const cls = C.st === 'bad' || C.st === 'warn' || t.nw >= 0.5 ? 'hot' : 'calm';
        b += `<tr class="${cls}${i === 0 ? ' c0' : ''}"><th>${esc(t.c)}</th>${nums(t)}`
          + (i === 0 ? `<td class="stk" rowspan="${C.rows.length}"${C.names.length ? ` title="${esc(C.names.join(' · '))} 재고(${C.rows.length > 1 ? '같은 소재 코드를 쓰는 유형 공용' : '소재 코드 기준'})"` : ''}>${C.stock == null ? '–' : C.byNm ? C.byNm.map(([nm, v]) => `<span class="m4-bn">${esc(nm)} <b>${n0(v)}</b></span>`).join('') : n0(C.stock)}${C.rows.length > 1 ? `<small>${esc(C.names.join(' · '))} 공용</small>` : ''}</td><td class="jdc" rowspan="${C.rows.length}">${judge(C)}</td>` : '') + '</tr>';
      });
    }
    return `<h2 class="m4-h">${M}월 소재 현황</h2><div class="m4-q" title="${esc(`${(window.SupMat.ext || []).includes(R.mon) ? '필요 = 도금 재계획 · 컬러 3개월 계획 · ' : ''}확인할 소재가 각 묶음 맨 위 · 판정 = 지금 재고 + 발주 완료분 입고 − 생산 투입(추가 발주 없음) · m/d부터 부족 = 추가 발주 없을 때 재고가 모자라기 시작하는 날 · 발주 지연 n t = 발주 기한이 지난 양 · 월말 5일분 미만 = 빠듯 · 도금 SUS = 지급재(발주 당일 입고, 판정 안 함) · 지금 재고 = MES 소재재고 목록(소재 코드별, 02 현황과 같은 출처)`)}">톤 · 기준 <b class="dt">${md(R.today)}</b></div>`
      + `<div class="m4-sc"><table class="m4-mx"><colgroup><col style="width:124px"><col><col><col><col><col><col style="width:15%"><col style="width:190px"><col style="width:150px"></colgroup>`
      + `<thead><tr><th rowspan="2">소재</th><th colspan="6" class="gq">① ${M}월 입고 확보</th><th colspan="2" class="gq sl">② 재고 충분 여부</th></tr>`
      + `<tr><th>${M}월 입고 계획</th><th>${M}월 실입고</th><th>발주(입고 예정)</th><th>입고 지연</th><th>미발주</th><th>확보율</th><th class="sl">지금 재고</th><th>재고 상태</th></tr></thead><tbody>${b}</tbody></table></div>`
      + `<div class="m4-lg"><span><i class="in"></i>${M}월 실입고</span><span><i class="po"></i>발주(입고 예정)</span><span><i class="no"></i>미발주</span></div>`;
  }

  // ---------- ② 발주 · 입고 캘린더 ----------
  function cal(R) {
    const ds = R.ds, td = R.today, nc = ds.length + 3;
    const hd = ds.map((d) => `<th class="${d === td ? 'td' : ''}${wd(d) % 6 === 0 || HOL.has(d) ? ' we' : ''}${d < td ? ' ps' : ''}">${+d.slice(8)}<small>${WD[wd(d)]}</small></th>`).join('');
    const line = (t, k, first) => {
      const V = k === 'po' ? t.od : t.ib; let s = 0;
      const cells = ds.map((d) => { const v = V[d], vn = k === 'po' ? 0 : t.ibN[d] || 0; if (v) s += v; if (vn) s += vn;
        if (!v && vn) { const cl0 = [d < td ? 'ps' : '', d === td ? 'td' : ''].filter(Boolean).join(' '); return `<td${cl0 ? ` class="${cl0}"` : ''}><span class="ib nd${vn >= 9999.5 ? ' w5' : ''}" data-c="${esc(t.c)}" data-k="inb" data-d="${d}" title="${esc(`${t.c} 미발주 ${n0(vn)}t — ${md(d)}까지 입고 필요`)}">${n0(vn)}</span></td>`; }
        const cl = [d < td ? 'ps' : '', d === td ? 'td' : ''].filter(Boolean).join(' ');
        const late = k === 'po' && t.late[d], lp = k === 'po' && t.lateP && t.lateP[d];
        return `<td${cl ? ` class="${cl}"` : ''}>${v ? `<span class="${k}${late ? ' late' : ''}${v >= 9999.5 ? ' w5' : ''}" data-c="${esc(t.c)}" data-k="${k === 'po' ? 'ord' : 'inb'}" data-d="${d}" title="${esc(`${md(d)} ${t.c} ${k === 'po' ? '발주' : '입고'} ${n0(v)}t${late || lp ? ` — 그중 발주 마감 지난 ${n0(late || lp)}t` : ''}`)}">${n0(v)}</span>${lp ? `<small class="lt">마감 지남<br>${n0(lp)}</small>` : ''}` : ''}${v && vn ? `<span class="ib nd" data-c="${esc(t.c)}" data-k="inb" data-d="${d}" title="${esc(`${t.c} 미발주 ${n0(vn)}t — ${md(d)}까지 입고 필요`)}">+${n0(vn)}</span>` : ''}</td>`; }).join('');
      return `<tr class="${first ? 'r1' : 'r2'}"${first ? ` data-row="${esc(t.c)}"` : ''}>${first ? `<th class="nm" rowspan="3">${esc(t.c)}</th>` : ''}<th class="kd"><i class="${k}">${k === 'po' ? '발주' : '입고'}</i></th>${cells}<td class="tt">${s >= 0.5 ? n0(s) : ''}</td></tr>`;
    };
    let b = '';
    const odLine = (t) => `<tr class="r3"><th class="kd"><i class="odt">발주한 날</i></th>${ds.map((d) => { const L = t.odt[d]; return `<td class="odt"${L ? ` title="${esc(`${md(d)} 입고 예정분 발주일: ${L.map(md).join(' · ')}`)}"` : ''}>${L ? `${md(L[0])}${L.length > 1 ? `<small>외 ${L.length - 1}건</small>` : ''}` : ''}</td>`; }).join('')}<td class="tt"></td></tr>`;
    for (const g of R.calRows) { if (!g.rows.length) continue; b += `<tr class="sec"><th colspan="${nc}">${PLN[g.pl]}</th></tr>` + g.rows.map((t) => line(t, 'po', true) + line(t, 'ib', false) + odLine(t)).join(''); }
    if (R.quiet.length) b += `<tr class="fold"><td colspan="${nc}">▸ 이달 발주·입고 없음 ${R.quiet.length}종 <small>${R.quiet.map(esc).join(' · ')}</small></td></tr>`;
    // 이번 주 발주(11/17 사용자 '발주·입고 캘린더랑 연결해서 같이') — 소재 관제와 같은 계산(월~일, 마감 지난 부족 포함) · 누르면 아래 그 소재 줄로
    const S = window.SupMat, w0 = td, w1 = addD(td, 6);   // 오늘(마감 지난 몫이 모이는 칸)부터 7일   // 수~화(주간 관제와 같은 주)
    const WR = Object.entries(S.MP.T).filter(([, T]) => inScope(T.plant)).map(([c, T]) => { let a = 0, lt = 0, d0 = ''; for (const [d, L] of Object.entries(T.ord)) if (d >= w0 && d <= w1) { a += S.sumT(L); lt += S.sumT(L.filter((e) => e.late)); if (S.sumT(L.filter((e) => !e.late)) >= 0.5 && (!d0 || d < d0)) d0 = d; } return { c, pl: T.plant, a, lt, d0 }; }).filter((x) => x.a >= 0.5).sort((x, y) => (x.pl < y.pl ? 1 : x.pl > y.pl ? -1 : 0));
    const wtot = WR.reduce((x, r) => x + r.a, 0);
    const wk = `<div class="m4-wk"><div class="h"><b class="dt">${md(w0)}~${md(w1)}</b><b>발주할 소재</b><small>오늘부터 7일</small><b class="t">${n0(wtot)}t</b></div><div class="l">${WR.map((r) => `<button type="button" data-go="${esc(r.c)}"><span>${esc(r.c)}</span><b>${n0(r.a)}t</b>${r.lt >= 1 ? `<small>마감 지남 ${n0(r.lt)}t</small>` : `<small class="ok">${r.d0 ? `마감 <b class="dt">${md(r.d0)}</b>` : '이번 기간 마감'}</small>`}</button>`).join('') || '<span class="muted">이 기간 발주할 소재 없음</span>'}</div></div>`;
    return `<h2 class="m4-h">발주 · 입고 캘린더</h2>${wk}<div class="m4-q" title="소재마다 위 줄 = 발주, 아래 줄 = 입고 · 발주 줄: 지난 날 = 실제 낸 발주, 오늘부터 = 해야 할 발주(생산 계획 기준) · 입고 줄: 지난 날 = 실입고, 앞날 = 입고 예정 · 숫자를 누르면 업체·양 상세">톤 · 흐린 칸 = 실적 · <b style="color:var(--bad)">빨강</b> = 마감 지남</div>`
      + `<div class="m4-sc"><table class="m4-cl v2-grid" style="min-width:${210 + ds.length * 66}px"><colgroup><col style="width:88px"><col style="width:76px">${ds.map(() => '<col>').join('')}<col style="width:66px"></colgroup>`
      + `<thead><tr><th>소재</th><th></th>${hd}<th>계</th></tr></thead><tbody>${b}</tbody></table></div>`;
  }

  let key = '';
  function render() {
    const S = window.SupMat, host = $('m4');
    if (!host || !S || !S.MP) return;
    const b = document.querySelector('#s-mon button[aria-pressed="true"]'); if (!b) return;
    const mon = b.dataset.m, sc = ['G', 'C'].filter(inScope).join('');
    const k = mon + '|' + sc + '|' + Object.keys(S.MP.T).length; if (k === key && host.innerHTML) return; key = k;
    const R = calc(mon);
    window.SupMat.view = R;   // 점검용
    $('m4-sum').innerHTML = table(R);
    $('m4-cal').innerHTML = cal(R);
    $('m4-cal').querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { const tr = $('m4-cal').querySelector(`tr[data-row="${b.dataset.go}"]`); if (!tr) return; tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('m4-cal').querySelectorAll('tr.hl').forEach((x) => x.classList.remove('hl')); let x = tr; for (let i = 0; i < 3 && x; i++, x = x.nextElementSibling) x.classList.add('hl'); });
    $('m4-cal').querySelectorAll('span[data-c]').forEach((el) => el.onclick = () => { if (S.typeDetail) { S.typeDetail(el.dataset.c, el.dataset.d, el.dataset.k); const d2 = $('s-det2'); if (d2) d2.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  }
  let t_ = 0;
  const kick = () => { clearTimeout(t_); t_ = setTimeout(render, 30); };
  const watch = () => { const c3 = $('s-cal3'), sm = $('s-mon'); if (!c3 || !sm) return; new MutationObserver(kick).observe(c3, { childList: true }); new MutationObserver(kick).observe(sm, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'], childList: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
