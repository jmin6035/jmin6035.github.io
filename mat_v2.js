/* 계획 > 소재(11/12 사용자 시안4): ① 소재 현황 표(이달 확보 · 지금 재고로 버티나) ② 발주 · 입고 캘린더(소재마다 발주·입고 두 줄)
   숫자 = supply.js 소재 캘린더와 같은 계산(window.SupMat.MP — 소재 유형별 일별 발주·입고·생산 투입)
   · 이달 필요 = 그 달 입고 줄 합 = 입고 완료(MES 실입고) + 발주(기발주 입고 예정) + 미발주(새 발주분)
   · 지금 재고 · 판정 = 소재 코드별 재고(SupMat.PM: 소재재고List · FH 추정)를 오늘부터 기발주 입고 + , 생산 투입 − 로 굴림(추가 발주 없음 가정)
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
  const inScope = (pl) => !window.UI || !UI.inScope || UI.inScope(pl);

  function monthDays(m) { const out = []; for (let d = m + '-01'; d.slice(0, 7) === m; d = addD(d, 1)) out.push(d); return out; }
  const codeOf = (e) => (e.j ? e.j.code : e.a ? e.a.code : null);

  function calc(mon) {
    const S = window.SupMat, MP = S.MP, today = S.today, sumT = S.sumT, ds = monthDays(mon), mEnd = ds[ds.length - 1];
    const PM = Object.fromEntries((S.PM || []).map((m) => [m.k, m]));
    // 유형별 그 달 숫자
    const T = Object.entries(MP.T).filter(([, R]) => inScope(R.plant)).map(([c, R]) => {
      const o = { c, pl: R.plant, rec: 0, ord: 0, nw: 0, od: {}, ib: {}, late: {}, codes: new Set(), use: 0 };
      for (const d of ds) {
        const I = R.inb[d] || [], O = R.ord[d] || [];
        for (const e of I) { if (e.kind === 'act') o.rec += e.t; else if (e.kind === 'new') o.nw += e.t; else o.ord += e.t; }
        const ti = sumT(I), to = sumT(O);
        if (ti >= 0.5) o.ib[d] = ti;
        if (to >= 0.5) { o.od[d] = to; if (O.some((e) => e.late)) o.late[d] = 1; }
        o.use += sumT(R.use[d]);
      }
      for (const k of ['use', 'inb']) for (const L of Object.values(R[k])) for (const e of L) { const cd = codeOf(e); if (cd) o.codes.add(`${R.plant}:${cd}`); }
      o.need = o.rec + o.ord + o.nw;
      o.cal = Object.keys(o.od).length + Object.keys(o.ib).length > 0;
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
      C.stock = ms.reduce((a, m) => a + m.stock0, 0);
      const st = (d) => ms.reduce((a, m) => a + (m.stock[d] != null ? m.stock[d] : 0), 0), us = (d) => ms.reduce((a, m) => a + (m.use[d] || 0), 0);
      C.st = 'ok'; C.min = null;
      for (let d = today; d <= mEnd; d = addD(d, 1)) {
        if (!ms.some((m) => m.stock[d] != null)) break;
        const v = st(d), need2 = us(addD(d, 1)) + us(addD(d, 2));
        if (C.min == null || v < C.min.v) C.min = { d, v };
        if (v < -0.5) { C.st = 'bad'; C.day = d; break; }
        if (C.st === 'ok' && need2 >= 0.5 && v < need2) { C.st = 'warn'; C.day = d; C.n2 = need2; C.v2 = v; }
      }
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
      return { pl, cs, need: sum('need'), rec: sum('rec'), ord: sum('ord'), nw: sum('nw'), stock: stocks.length ? stocks.reduce((a, C) => a + C.stock, 0) : null, flag: cs.filter((C) => C.st === 'bad' || C.st === 'warn').length };
    });
    const shown = new Set(groups.flatMap((g) => g.cs.flatMap((C) => C.rows.map((t) => t.c))));
    const calRows = groups.map((g) => ({ pl: g.pl, rows: [...g.cs.flatMap((C) => C.rows), ...T.filter((t) => t.pl === g.pl && !shown.has(t.c) && t.cal).sort((a, b) => b.need - a.need)].filter((t) => t.cal) }));
    const quiet = T.filter((t) => !t.cal).map((t) => t.c);
    return { mon, ds, today, groups, calRows, quiet };
  }

  // ---------- ① 소재 현황 ----------
  const pc = (r) => (r.need ? Math.min(Math.round((r.rec + r.ord) / r.need * 100), r.nw >= 0.5 ? 99 : 100) : 100);   // 미발주가 남으면 100% 아님
  const bar = (r) => { const f = (v) => (r.need ? (v / r.need * 100).toFixed(2) : 0) + '%';
    return `<div class="m4-pw"><div class="m4-sb" title="${esc(`입고 완료 ${n0(r.rec)}t · 발주(입고 예정) ${n0(r.ord)}t · 미발주 ${n0(r.nw)}t`)}">${r.rec >= 0.5 ? `<i class="in" style="width:${f(r.rec)}"></i>` : ''}${r.ord >= 0.5 ? `<i class="po" style="width:${f(r.ord)}"></i>` : ''}${r.nw >= 0.5 ? `<i class="no" style="width:${f(r.nw)}"></i>` : ''}</div><b>${pc(r)}%</b></div>`; };
  const nums = (r) => `<td>${n0(r.need)}</td><td class="c-in">${n0(r.rec)}</td><td>${n0(r.ord)}</td><td class="${r.nw >= 0.5 ? 'c-no' : 'mu'}">${r.nw >= 0.5 ? n0(r.nw) : '–'}</td><td class="pc">${bar(r)}</td>`;
  function judge(C) {
    if (C.st === 'na') return '<span class="m4-jd na" title="이 소재 코드의 재고 자료 없음">–</span>';
    if (C.st === 'bad') return `<span class="m4-jd bad" title="${esc(`${md(C.day)} 재고가 0 아래로(추가 발주 없음 가정 · 기발주 입고 반영)`)}">${md(C.day)} 바닥</span>`;
    if (C.st === 'warn') return `<span class="m4-jd warn" title="${esc(`${md(C.day)} 재고 ${n0(C.v2)}t < 다음 이틀 투입 ${n0(C.n2)}t`)}">${md(C.day)} 빠듯</span>`;
    return `<span class="m4-jd ok"${C.min ? ` title="${esc(`말일까지 최저 ${md(C.min.d)} ${n0(C.min.v)}t`)}"` : ''}>충분</span>`;
  }
  function table(R) {
    const M = +R.mon.slice(5);
    let b = '';
    for (const g of R.groups) {
      if (!g.cs.length) continue;
      b += `<tr class="gt"><th>${PLN[g.pl]}</th>${nums(g)}<td class="stk">${g.stock == null ? '–' : n0(g.stock)}</td><td>${g.flag ? `<span class="m4-jdn">확인 ${g.flag}종</span>` : '<span class="m4-jd ok">충분</span>'}</td></tr>`;
      for (const C of g.cs) C.rows.forEach((t, i) => {
        const cls = C.st === 'bad' || C.st === 'warn' || t.nw >= 0.5 ? 'hot' : 'calm';
        b += `<tr class="${cls}${i === 0 ? ' c0' : ''}"><th>${esc(t.c)}</th>${nums(t)}`
          + (i === 0 ? `<td class="stk" rowspan="${C.rows.length}"${C.names.length ? ` title="${esc(C.names.join(' · '))} 재고(${C.rows.length > 1 ? '같은 소재 코드를 쓰는 유형 공용' : '소재 코드 기준'})"` : ''}>${C.stock == null ? '–' : n0(C.stock)}${C.rows.length > 1 ? `<small>${esc(C.names.join(' · '))} 공용</small>` : ''}</td><td class="jdc" rowspan="${C.rows.length}">${judge(C)}</td>` : '') + '</tr>';
      });
    }
    return `<h2 class="m4-h">${M}월 소재 현황</h2><div class="m4-q">톤 · 기준 ${md(R.today)} · 확인할 소재가 각 묶음 맨 위 · 판정 = 지금 재고 + 기발주 입고 − 생산 투입(추가 발주 없음)</div>`
      + `<div class="m4-sc"><table class="m4-mx"><colgroup><col style="width:150px"><col><col><col><col><col style="width:28%"><col style="width:210px"><col style="width:150px"></colgroup>`
      + `<thead><tr><th rowspan="2">소재</th><th colspan="5" class="gq">① 이달 필요한 만큼 확보했나</th><th colspan="2" class="gq sl">② 지금 재고로 버티나</th></tr>`
      + `<tr><th>이달 필요</th><th>입고 완료</th><th>발주(입고 예정)</th><th>미발주</th><th>확보율</th><th class="sl">지금 재고</th><th>판정</th></tr></thead><tbody>${b}</tbody></table></div>`
      + `<div class="m4-lg"><span><i class="in"></i>입고 완료</span><span><i class="po"></i>발주(입고 예정)</span><span><i class="no"></i>미발주</span></div>`;
  }

  // ---------- ② 발주 · 입고 캘린더 ----------
  function cal(R) {
    const ds = R.ds, td = R.today, nc = ds.length + 3;
    const hd = ds.map((d) => `<th class="${d === td ? 'td' : ''}${wd(d) % 6 === 0 ? ' we' : ''}${d < td ? ' ps' : ''}">${+d.slice(8)}<small>${WD[wd(d)]}</small></th>`).join('');
    const line = (t, k, first) => {
      const V = k === 'po' ? t.od : t.ib; let s = 0;
      const cells = ds.map((d) => { const v = V[d]; if (v) s += v;
        const cl = [d < td ? 'ps' : '', d === td ? 'td' : ''].filter(Boolean).join(' ');
        const late = k === 'po' && t.late[d];
        return `<td${cl ? ` class="${cl}"` : ''}>${v ? `<span class="${k}${late ? ' late' : ''}${v >= 9999.5 ? ' w5' : ''}" data-c="${esc(t.c)}" data-k="${k === 'po' ? 'ord' : 'inb'}" data-d="${d}" title="${esc(`${md(d)} ${t.c} ${k === 'po' ? '발주' : '입고'} ${n0(v)}t${late ? ' — 마감 지난 몫 포함' : ''}`)}">${n0(v)}</span>` : ''}</td>`; }).join('');
      return `<tr class="${first ? 'r1' : 'r2'}">${first ? `<th class="nm" rowspan="2">${esc(t.c)}</th>` : ''}<th class="kd"><i class="${k}">${k === 'po' ? '발주' : '입고'}</i></th>${cells}<td class="tt">${s >= 0.5 ? n0(s) : ''}</td></tr>`;
    };
    let b = '';
    for (const g of R.calRows) { if (!g.rows.length) continue; b += `<tr class="sec"><th colspan="${nc}">${PLN[g.pl]}</th></tr>` + g.rows.map((t) => line(t, 'po', true) + line(t, 'ib', false)).join(''); }
    if (R.quiet.length) b += `<tr class="fold"><td colspan="${nc}">▸ 이달 발주·입고 없음 ${R.quiet.length}종 <small>${R.quiet.map(esc).join(' · ')}</small></td></tr>`;
    return `<h2 class="m4-h">발주 · 입고 캘린더</h2><div class="m4-q">톤 · 소재마다 위 줄 = 발주, 아래 줄 = 입고 · 지난 날은 실적(흐리게) · 숫자를 누르면 업체·양 상세</div>`
      + `<div class="m4-sc"><table class="m4-cl v2-grid"><colgroup><col style="width:88px"><col style="width:56px">${ds.map(() => '<col>').join('')}<col style="width:66px"></colgroup>`
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
    $('m4-cal').querySelectorAll('span[data-c]').forEach((el) => el.onclick = () => { if (S.typeDetail) { S.typeDetail(el.dataset.c, el.dataset.d, el.dataset.k); const d2 = $('s-det2'); if (d2) d2.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  }
  let t_ = 0;
  const kick = () => { clearTimeout(t_); t_ = setTimeout(render, 30); };
  const watch = () => { const c3 = $('s-cal3'), sm = $('s-mon'); if (!c3 || !sm) return; new MutationObserver(kick).observe(c3, { childList: true }); new MutationObserver(kick).observe(sm, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'], childList: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
