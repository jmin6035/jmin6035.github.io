/* 실적 화면(도금·컬러 공용, 같은 양식): <body data-plant="G|C">
   자료: published/plating_actual.enc.json · color_actual.enc.json (cglplan/pages.py plating_actual·color_actual)
   ① 핵심 지표 ② 라인별 진도·주간 비교 ③ 일별 생산(이번 달 1일부터) ④ 주별 추이 ⑤ 품명(최근 4주) ⑥ 휴지 구성(+도금: 강종 전환 실적) ⑦ 월별 부서 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const pct = (a, b) => (b ? (a / b - 1) * 100 : null);
  const PLANT = document.body.dataset.plant === 'G' ? 'G' : 'C';
  const CFG = PLANT === 'G'
    ? { L: ['1CGL', '2CGL'], file: 'plating_actual.enc.json', name: '도금', prodHead: '제품 · 강종',
        stopNote: 'MES 휴지 실적의 사유로 분류 — 강종 전환(Mode change) / 정기수리(SINK ROLL 교체 등) / 설비·운전(기계·전기·운전이상) / 기타. 시간은 더미 코일 포함, 톤은 더미 제외.' }
    : { L: ['1CCL', '2CCL', '3CCL', '4CCL'], file: 'color_actual.enc.json', name: '컬러', prodHead: '품명',
        stopNote: '휴지 사유 메모(SPL_REM)의 키워드로 분류 — 색상교체·청소 / 테스트·도막조정 / 폭·롤·두께 전환 / 기타. 주간 보고와 같은 기준.' };
  const L = CFG.L;
  const COL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
  let O = null, pl = L[0];
  const card = (id, title, sm, unit, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}${unit ? `<span class="unit">${unit}</span>` : ''}</h2>${body}</section>`;
  const dl = (v, good = true) => { if (v == null) return '<span class="muted">-</span>'; const up = v >= 0; const c = Math.abs(v) < 3 ? 'muted' : (up === good ? 'up' : 'down'); return `<b class="dlt ${c}">${up ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</b>`; };
  const legend = () => `<div class="legend">${L.map((l, i) => `<span><i class="box" style="background:${COL[i]}"></i>${l}</span>`).join('')}</div>`;

  /* ---------- 차트(SVG) ---------- */
  const tip = () => $('ca-tip');
  function bindTip(root) {
    root.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mousemove', (e) => { const t = tip(); t.innerHTML = el.dataset.tip; t.style.display = 'block'; t.style.left = Math.min(innerWidth - 240, e.clientX + 14) + 'px'; t.style.top = (e.clientY - 12) + 'px'; });
      el.addEventListener('mouseleave', () => { tip().style.display = 'none'; });
    });
  }
  /* ---------- 절 ---------- */
  function kpis() {
    const M = O.month.rows, tot = M.find((x) => /계$/.test(x.line));
    const s = (k, p) => O.lines.reduce((a, x) => a + (x[p][k] || 0), 0);
    const tpd1 = s('tpd', 'w1'), tpd0 = s('tpd', 'w0');
    const stop1 = O.lines.reduce((a, x) => a + x.w1.stopH, 0) / L.length, stop0 = O.lines.reduce((a, x) => a + x.w0.stopH, 0) / L.length;
    const k = (tone, l, v, unit, b, ck, dec = 0) => `<div class="kpi tone-${tone}" data-rk="k-${ck}"><div class="l">${l}</div><div class="v"><b data-count="${v}" data-dec="${dec}" data-ck="${ck}">0</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    const rate = tot ? tot.actual / tot.sched * 100 : null;
    return `<div class="kpis">${tot ? k(rate >= 98 ? 'good' : rate >= 90 ? 'warn' : 'bad', (() => { const a = String(O.month.asOf || O.asOf).slice(0, 10), e = new Date(Date.parse(a) - 864e5).toISOString().slice(0, 10); return `${+e.slice(5, 7)}월 누계 실적 (1~${+e.slice(8)}일)`; })(), Math.round(tot.actual), 't', `판매생산속보 · 일정 ${n0(tot.sched)}t 대비 <b>${rate.toFixed(1)}%</b> · 월차 ${n0(tot.month)}t`, 'mt') : ''}
      ${k(pct(tpd1, tpd0) >= -3 ? 'good' : 'warn', `지난주 생산 (${md(O.w1)}~)`, Math.round(tpd1), 't/일', `${BW()} 평균 ${n0(tpd0)}t/일 대비 ${dl(pct(tpd1, tpd0))}`, 'wt')}
      ${k('brand', `${L.length}라인 생산속도 (정지 포함)`, Math.round(O.lines.reduce((a, x) => a + (x.w1.tph || 0), 0) * 10) / 10, 't/hr 합', `${BW()} ${n1(O.lines.reduce((a, x) => a + (x.w0.tph || 0), 0))} t/hr`, 'tp', 1)}
      ${k(stop1 > stop0 * 1.1 ? 'warn' : 'good', '라인당 휴지', Math.round(stop1 * 10) / 10, 'h/가동일', `${BW()} 평균 ${n1(stop0)}h 대비 ${dl(pct(stop1, stop0), false)}`, 'st', 1)}</div>`;
  }
  function lineTable() {
    const M = Object.fromEntries(O.month.rows.map((x) => [x.line, x]));
    const rows = O.lines.map((x, i) => {
      const m = M[x.line] || {}; const r = m.sched ? m.actual / m.sched : null;
      return `<tr><td class="l nm"><i class="dot" style="background:${COL[i]}"></i>${x.line}</td><td>${n0(m.month)}</td><td>${n0(m.sched)}</td><td><b>${n0(m.actual)}</b></td>
        <td class="pbar"><div><i class="${r >= 0.98 ? 'ok' : r >= 0.9 ? 'wn' : 'bd'}" style="width:${Math.min(100, (r || 0) * 100)}%"></i></div><b>${r ? (r * 100).toFixed(1) + '%' : '-'}</b></td>
        <td>${n0(x.w0.tpd)}</td><td><b>${n0(x.w1.tpd)}</b></td><td>${!x.w1.days ? '<span class="muted" title="지난주 가동일 0일 — 계획휴지·수리">휴지</span>' : dl(pct(x.w1.tpd, x.w0.tpd))}</td><td>${n1(x.w0.tph)} → <b>${n1(x.w1.tph)}</b></td><td>${x.w0.thick ? x.w0.thick.toFixed(2) : '-'} → ${x.w1.thick ? x.w1.thick.toFixed(2) : '-'}</td><td>${n1(x.w0.stopH)} → <b>${n1(x.w1.stopH)}</b></td><td>${n1(x.w1.days)}</td></tr>`;
    }).join('');
    const t = O.month.rows.find((x) => /계$/.test(x.line));
    return card('ca-line', '라인별 진도 · 주간 비교', `이번 달 = MES 판매생산속보 ${O.month.asOf || ''} · 주간 = 지난주 vs ${BW()} 평균`, '단위: 톤', `<div class="scroll"><table class="t big"><thead><tr><th class="l" rowspan="2">라인</th><th colspan="4">10월 진도 (MES 월차계획)</th><th colspan="3">생산 t/일</th><th rowspan="2">속도 t/hr <small>정지 포함</small></th><th rowspan="2">평균 두께 mm</th><th rowspan="2">휴지 h/가동일</th><th rowspan="2">가동일 <small>지난주</small></th></tr>
      <tr><th>월차</th><th>일정 누계</th><th>실적 누계</th><th>달성률</th><th>${BW()} 평균</th><th>지난주</th><th>증감</th></tr></thead><tbody>${rows}
      ${t ? `<tr class="total"><td class="l">${CFG.name} 계</td><td>${n0(t.month)}</td><td>${n0(t.sched)}</td><td>${n0(t.actual)}</td><td class="pbar"><div><i class="ok" style="width:${Math.min(100, t.actual / t.sched * 100)}%"></i></div><b>${(t.actual / t.sched * 100).toFixed(1)}%</b></td><td>${n0(O.lines.reduce((a, x) => a + x.w0.tpd, 0))}</td><td>${n0(O.lines.reduce((a, x) => a + x.w1.tpd, 0))}</td><td></td><td></td><td></td><td></td><td></td></tr>` : ''}</tbody></table></div>
      <p class="small">속도 = 생산 t ÷ (작업 + 정지 시간) — 주간 보고와 같은 정의. MES 속보의 t/hr(정지 제외)와는 다름.</p>`);
  }
  /* 막대 하나짜리 그래프: 값 막대 + 기준선(평균·목표) */
  function bars(data, color, refs = [], H = 300, W = 1200, fmt = n0, xl = (d) => md(d.d), tipf = null) {
    const pl0 = 56, pr = W > 800 ? 170 : 104, pt = 16, pb = 34, n = data.length, bw = (W - pl0 - pr) / n;
    const mx = Math.max(...data.map((d) => d.v || 0), ...refs.map((r) => r.v || 0), 1), sc = UI.scale(mx), ym = sc.hi;
    const y = (v) => pt + (H - pt - pb) * (1 - v / ym);
    let g = '';
    for (const v of sc.ticks) g += `<line class="gl" x1="${pl0}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl0 - 8}" y="${y(v) + 4}" text-anchor="end">${UI.tick(v, sc.step)}</text>`;
    const every = Math.max(1, Math.ceil(n / ((W - pl0 - pr) / 46)));
    data.forEach((d, i) => {
      const v = d.v || 0, x = pl0 + i * bw + bw * 0.16, w = Math.max(2, bw * 0.68);
      if (v > 0) g += `<rect class="bar" style="--i:${i}" x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, y(0) - y(v))}" rx="3" fill="${color}" opacity="${d.dim ? 0.45 : 1}"/>`;
      g += `<rect class="hit" x="${pl0 + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" data-tip="${tipf ? tipf(d) : `<b>${xl(d)}</b> ${fmt(v)}`}"/>`;
      if ((n - 1 - i) % every === 0) g += `<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" class="${d.we ? 'we' : ''}">${xl(d)}</text>`;
    });
    const ly = [];                                                     // 기준선 이름이 겹치지 않게(가까우면 아래로 16px씩)
    refs.filter((r) => r && r.v != null).sort((a, b) => b.v - a.v).forEach((r) => { let t = y(r.v) + 4; while (ly.some((q) => Math.abs(q - t) < 16)) t += 16; ly.push(t); g += `<line x1="${pl0}" x2="${W - pr}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="${r.c}" stroke-width="2" stroke-dasharray="${r.dash || '6 5'}"/><text x="${W - pr + 8}" y="${t}" class="lab" fill="${r.c}">${r.n} ${fmt(r.v)}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}" class="cv" role="img">${g}</svg>`;
  }
  const NW = () => (O && O.nW0) || 12, BW = () => `앞 ${NW()}주`;     // 비교 기준 = 지난주 앞의 실제 자료 주 수(최대 12주)
  let dsel = 'all';
  function dailyChart() {
    const tot = (d) => (dsel === 'all' ? L.reduce((a, l) => a + (d[l] || 0), 0) : d[dsel] || 0);
    const data = O.daily.map((d) => ({ d: d.d, v: tot(d), we: [0, 6].includes(new Date(d.d + 'T00:00:00').getDay()), raw: d }));
    const avg = data.reduce((a, x) => a + x.v, 0) / Math.max(1, data.length);
    const M = Object.fromEntries((O.month.rows || []).map((x) => [x.line, x]));
    const [yy, mm] = String(O.asOf).split('-').map(Number), nd = new Date(yy, mm, 0).getDate();
    const mon = dsel === 'all' ? L.reduce((a, l) => a + ((M[l] || {}).month || 0), 0) : (M[dsel] || {}).month;
    const color = dsel === 'all' ? 'var(--brand-2)' : COL[L.indexOf(dsel)];
    const refs = [{ n: `${O.daily.length}일 평균`, v: avg, c: 'var(--ink-3)', dash: '3 4' }, mon ? { n: `${mm}월 월차 일평균`, v: mon / nd, c: 'var(--warn)' } : null].filter(Boolean);
    return bars(data, color, refs, 300, 1200, n0, (d) => md(d.d), (d) => `<b>${md(d.d)}</b> ${dsel === 'all' ? '합계' : dsel} ${n0(d.v)}t${dsel === 'all' ? '<br>' + L.map((l) => `${l} ${n0(d.raw[l])}t`).join('<br>') : ''}`);
  }
  function daily() {
    const seg = `<div class="seg" id="ca-dsel" role="group" aria-label="라인">${['all', ...L].map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === dsel}">${k === 'all' ? `${CFG.name} 전체` : k}</button>`).join('')}</div>`;
    return card('ca-daily', '일별 생산', `${md(O.daily[0].d)}~${md(O.daily[O.daily.length - 1].d)} (${O.daily.length}일, 이번 달부터) · 점선 = 기간 일평균, 주황 = 이번 달 월차 일평균 · 막대에 마우스를 올리면 상세`, '단위: 톤', seg + `<div class="chart" id="ca-dchart" style="margin-top:12px">${dailyChart()}</div>
      <details class="tv"><summary>표로 보기</summary><div class="scroll"><table class="t"><thead><tr><th class="l">날짜</th>${L.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead><tbody>${O.daily.slice().reverse().map((d) => `<tr><td class="l">${md(d.d)}</td>${L.map((l) => `<td>${n0(d[l])}</td>`).join('')}<td><b>${n0(L.reduce((a, l) => a + d[l], 0))}</b></td></tr>`).join('')}</tbody></table></div></details>`);
  }
  /* 주별 추이: 라인마다 작은 카드 하나(지난주 값 · 앞 N주 평균 대비 + 주별 막대) — 선 4개가 엉키지 않게 */
  function weekly() {
    const xs = O.weekly.map((w) => w.w), last = O.weekly.length - 1;
    const mini = (l, i) => {
      const t = O.weekly.map((w) => (w[l] || {}).tpd), h = O.weekly.map((w) => (w[l] || {}).tph);
      const avg = (a) => { const v = a.slice(Math.max(0, last - 12), last).filter((x) => x != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
      const at = avg(t), ah = avg(h);
      const td = O.weekly.map((w, k) => ({ d: w.w, v: t[k], dim: k !== last }));
      const hd = O.weekly.map((w, k) => ({ d: w.w, v: h[k], dim: k !== last }));
      const sw = (lbl, val, base, fmt, unit, good = true) => `<div class="wk-k"><span>${lbl}</span><b>${fmt(val)}<small>${unit}</small></b>${dl(pct(val, base), good)}<em>${BW()} 평균 ${fmt(base)}</em></div>`;
      return `<div class="wk-card"><h3><i style="background:${COL[i]}"></i>${l} <small>지난주 ${md(xs[last])}~</small></h3>
        <div class="wk-ks">${sw('생산량', t[last], at, n0, 't/일')}${sw('생산속도', h[last], ah, n1, 't/hr')}</div>
        <div class="wk-ch"><p>생산량 t/일</p>${bars(td, COL[i], [{ n: '평균', v: at, c: 'var(--ink-3)', dash: '3 4' }], 150, 560, n0, (d) => md(d.d), (d) => `<b>${md(d.d)} 주</b> ${n0(d.v)} t/일`)}</div>
        <div class="wk-ch"><p>생산속도 t/hr (정지 포함)</p>${bars(hd, COL[i], [{ n: '평균', v: ah, c: 'var(--ink-3)', dash: '3 4' }], 150, 560, n1, (d) => md(d.d), (d) => `<b>${md(d.d)} 주</b> ${n1(d.v)} t/hr`)}</div></div>`;
    };
    return card('ca-wk', '라인별 주간 추이', `최근 ${xs.length}주 · 진한 막대 = 지난주, 점선 = ${BW()} 평균`, '', `<div class="wk-grid">${L.map(mini).join('')}</div>`);
  }
  function products() {
    const P = O.products[pl] || [];
    const mx = Math.max(1, ...P.map((p) => p[1]));
    return card('ca-prod', PLANT === 'G' ? '제품·강종별 생산' : '품명별 생산', '최근 4주 · 라인 선택', '단위: 톤', `<div class="seg" id="ca-pl">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === pl}">${l}</button>`).join('')}</div>
      <div class="scroll" style="margin-top:12px"><table class="t big"><thead><tr><th class="l">${CFG.prodHead}</th><th class="l" style="width:45%">생산량</th><th>톤</th><th>속도 t/hr</th><th>평균 두께</th></tr></thead><tbody>${P.map((p) => `<tr><td class="l nm">${esc(p[0])}</td><td class="l"><div class="hbar"><i style="width:${p[1] / mx * 100}%;background:${COL[L.indexOf(pl)]}"></i></div></td><td><b>${n0(p[1])}</b></td><td>${n1(p[2])}</td><td>${p[3] ? p[3].toFixed(2) : '-'}</td></tr>`).join('')}</tbody></table></div>`);
  }
  function stops() {
    const S = O.stops, C = S.cats;
    const rows = L.map((l) => `<tr><td class="l nm">${l}</td>${C.map((c) => `<td>${n1(S.w0[l][c])} → <b>${n1(S.w1[l][c])}</b></td>`).join('')}<td>${n1(C.reduce((a, c) => a + S.w0[l][c], 0))} → <b>${n1(C.reduce((a, c) => a + S.w1[l][c], 0))}</b></td></tr>`).join('');
    return card('ca-stop', '휴지 구성', `라인별 하루 평균 정지 시간 — ${BW()} 평균 → 지난주(굵게)`, '단위: 시간/일', `<div class="scroll"><table class="t big"><thead><tr><th class="l">라인</th>${C.map((c) => `<th>${c}</th>`).join('')}<th>합계</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">${CFG.stopNote}</p>`);
  }
  function mcCard() {                                              // 도금만: 강종 전환(M/C) 실적
    if (!O.mc || !O.mc.length) return '';
    const rows = O.mc.slice().reverse().map((m) => `<tr><td class="l">${md(m.d)}</td><td class="l nm">${m.line}</td><td class="l">${esc(m.from)} → ${esc(m.to)}</td><td><b>${n1(m.h)}</b></td><td class="l">${m.sd ? '정기수리와 함께' : '단독'}</td></tr>`).join('');
    return card('ca-mc', '강종 전환(M/C) 실적', '최근 12회 · MES 휴지(Mode change) 시간', '단위: 시간', `<div class="scroll"><table class="t big"><thead><tr><th class="l">날짜</th><th class="l">라인</th><th class="l">전환</th><th>정지 시간</th><th class="l">구분</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">정지 시간 = 휴지 실적의 Mode change 시간 합. 재가동 후 더미 코일로 조건을 맞추는 시간은 들어가지 않음(조건 분석 화면 참고).</p>`);
  }
  const monLabel = (m) => `${+m.slice(5)}월${O.from && O.from.slice(0, 7) === m && +O.from.slice(8) > 1 ? `<small class="muted">(${+O.from.slice(8)}일~)</small>` : ''}`;
  function monthly() {
    const D = O.dept, nm = (k) => (/^\d+$/.test(k) ? `기타(${k})` : k);
    return card('ca-mon', '월별 생산', `라인별 · 부서별 · 월 단위 (${+O.asOf.slice(5, 7)}월은 ${md(O.asOf)}까지 누계)`, '단위: 톤', `<div class="grid2"><div class="scroll"><table class="t big"><thead><tr><th class="l">월</th>${L.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead><tbody>${O.monthly.map((m) => `<tr><td class="l">${monLabel(m.m)}</td>${L.map((l) => `<td>${n0(m[l])}</td>`).join('')}<td><b>${n0(L.reduce((a, l) => a + m[l], 0))}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="scroll"><table class="t big"><thead><tr><th class="l">월</th>${D.names.map((k) => `<th>${esc(nm(k))}</th>`).join('')}</tr></thead><tbody>${D.rows.map((m) => `<tr><td class="l">${monLabel(m.m)}</td>${D.names.map((k) => `<td>${n0(m[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
  }
  function render() {
    $('ca-main').innerHTML = `<section class="card" id="ca-kpi"><h2>주요 지표 <small>실적 ~${md(O.asOf)} · MES 원자료 재계산</small><span class="unit">단위: 톤</span></h2>${kpis()}</section>` + lineTable() + daily() + weekly() + `<div class="grid2 rowc">${products()}${stops()}</div>` + (PLANT === 'G' ? mcCard() : '') + monthly();
    $('ca-meta').innerHTML = `<span><b>실적</b>~${O.asOf}</span><span><b>지난주</b>${md(O.w1)}~</span><span><b>비교</b>${md(O.w0[0])}~${md(O.w0[1])} 주 (${NW()}주)</span><span><b>계산</b>${String(O.built).replace('T', ' ')}</span>`;
    UI.reveal($('ca-main')); UI.count($('ca-main')); bindTip($('ca-main'));
    render2();
  }
  function render2() {
    document.querySelectorAll('#ca-dsel button').forEach((b) => b.addEventListener('click', () => { dsel = b.dataset.k; document.querySelectorAll('#ca-dsel button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('ca-dchart').innerHTML = dailyChart(); bindTip($('ca-dchart')); }));
    document.querySelectorAll('#ca-pl button').forEach((b) => b.addEventListener('click', () => { pl = b.dataset.l; $('ca-prod').outerHTML = products(); render2(); })); }

  let env = null;
  const envReady = GP.latest(CFG.file);
  async function unlock(pw) {
    if (!env) env = await envReady;                              // 자료를 받기 전에 암호를 넣은 경우
    if (pw) { $('ca-lockbox').hidden = true; $('ca-skel').hidden = false; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(); }
    catch (e) { $('ca-lockbox').hidden = false; $('ca-skel').hidden = true; $('ca-form').hidden = false; $('ca-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('ca-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ca-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('ca-form').hidden = false;
  }).catch(() => { $('ca-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
