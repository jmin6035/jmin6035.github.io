/* 계획재: published/planstock.enc.json (cglplan/planstock.py)
   ① 핵심 지표 ② 계획재 캘린더(생산 · 소재 발주 마감 · 입고 필요) ③ 소재 발주 요약 | 수입 FH 월적 ④ 재고 추이 ⑤ 월별 예측 | 소재 구분별 ⑥ 사양별 상세(접힘) ⑦ 기준(접힘) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const mon = (ym) => `${+ym.slice(5)}월`;
  const FLAG = {
    short: ['월말 결품 예상', 'bad'], low: ['안전재고 미만', 'warn'], shortNext: ['11~12월 결품', 'warn'],
    behind: ['생산 일정 지연', 'warn'], over: ['목표 2배 초과', 'info'], fcHigh: ['판매 예측 초과', 'info'],
  };
  const ORDER = ['short', 'low', 'shortNext', 'behind', 'over', 'fcHigh'];
  let O = null, flt = 'risk', sortK = 'end';
  const card = (id, title, sm, unit, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}${unit ? `<span class="unit">${unit}</span>` : ''}</h2>${body}</section>`;
  const tip = () => $('ca-tip');
  function bindTip(root) {
    root.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mousemove', (e) => { const t = tip(); t.innerHTML = el.dataset.tip; t.style.display = 'block'; t.style.left = Math.min(innerWidth - 260, e.clientX + 14) + 'px'; t.style.top = (e.clientY - 12) + 'px'; });
      el.addEventListener('mouseleave', () => { tip().style.display = 'none'; });
    });
  }


  // ---------- ② 계획재 캘린더 ----------
  const KIND = { order: { name: '소재 발주 마감', color: 'var(--bad)' }, arrive: { name: '소재 입고 필요', color: 'var(--s3)' }, prod: { name: '생산 계획', color: 'var(--s1)' }, done: { name: '생산 실적', color: 'var(--plan)' } };
  const ST = { past: ['시한 지남 — 발주 여부 확인', 'bad'], soon: ['2주 내 마감', 'warn'], later: ['예정', ''] };
  function orderRow(o, mode) {
    const left = Math.max(0, o.t - (o.ordered || 0));
    return `<tr><td><b>${esc(o.kind)}</b></td><td>${esc(o.sup)}</td><td>${o.o0 === o.o1 ? md(o.o1) : `${md(o.o0)} ~ ${md(o.o1)}`}</td><td>${md(o.arr)}</td><td>${md(o.prodFrom)} ~ ${md(o.prodTo)}</td>`
      + `<td><b>${n0(o.t)}</b></td><td>${o.ordered != null ? n0(o.ordered) : '-'}</td><td class="${left > 0.5 && o.state !== 'later' ? 'bad' : ''}"><b>${n0(left)}</b></td><td><span class="tag ${ST[o.state][1]}">${ST[o.state][0]}</span></td></tr>`
      + (mode === 'full' ? `<tr class="why-row"><td colspan="9" class="para">규칙: ${esc(o.rule)} · 사양(두께×폭) ${o.items.map((x) => `${x[0]} ${n0(x[1])}t`).join(', ')}</td></tr>` : '');
  }
  const OHEAD = '<thead><tr><th>소재</th><th>업체</th><th>발주 기간</th><th>입고일</th><th>투입 생산 기간</th><th>필요량</th><th>기발주</th><th>남은 발주</th><th>판정</th></tr></thead>';
  function calInit() {
    const ev = O.events.map((e) => {
      if (e.kind === 'order') { const st = e.order.state; return { ...e, chip: `${e.order.kind} ${n0(e.t)}t 발주`, tone: st === 'past' ? 'bad' : st === 'soon' ? 'warn' : '' }; }
      if (e.kind === 'arrive') return { ...e, chip: `${e.order.kind} ${n0(e.t)}t 입고` };
      if (e.kind === 'prod') return { ...e, chip: `생산 ${n0(e.t)}t` };
      return { ...e, chip: `실적 ${n0(e.t)}t` };
    });
    const months = [...new Set(ev.map((e) => e.d.slice(0, 7)))].sort().filter((m) => m >= '2026-09');
    UI.cal($('ps-calbox'), { months, kinds: KIND, events: ev, today: O.today && O.today > O.asOf ? O.today : O.asOf,
      note: '발주 마감 = 팀 소재 리드타임 표로 생산일 기준 역산(GI 매주 발주 +5주 → 투입 7일 / FH 매주 발주 +5주 → 도금 5일 → 컬러 입고 1일 → 투입 7일 / 수입 FH 전전월 10~20일 발주 → 7일경 입고 / 서림 GI 27년 입고분부터). 필요량은 소재 재고를 빼기 전 값 — 발주 전 소재 재고 확인.',
      detail: (d, evs) => {
        let h = '';
        const ords = evs.filter((e) => e.kind === 'order'), arr = evs.filter((e) => e.kind === 'arrive'), pr = evs.filter((e) => e.kind === 'prod' || e.kind === 'done');
        if (ords.length) h += `<div class="grp" style="--kc:${KIND.order.color}"><i></i>소재 발주 마감</div><div class="scroll"><table class="t">${OHEAD}<tbody>${ords.map((e) => orderRow(e.order, 'full')).join('')}</tbody></table></div>`;
        if (arr.length) h += `<div class="grp" style="--kc:${KIND.arrive.color}"><i></i>소재 입고 기한</div><div class="scroll"><table class="t">${OHEAD}<tbody>${arr.map((e) => orderRow(e.order)).join('')}</tbody></table></div>`;
        for (const e of pr) h += `<div class="grp" style="--kc:${KIND[e.kind].color}"><i></i>${e.kind === 'done' ? '생산 실적' : '생산 계획'} ${n0(e.t)}t</div><div class="scroll"><table class="t"><thead><tr><th>품명</th><th>사양(두께 폭 색상)</th>${e.kind === 'prod' ? '<th>라인</th>' : ''}<th>톤</th><th>소재</th></tr></thead><tbody>${e.items.map((x) => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td>${e.kind === 'prod' ? `<td>${esc(x[2])}</td>` : ''}<td>${n1(x[3])}</td><td>${esc(x[4])}</td></tr>`).join('')}</tbody></table></div>`;
        return h;
      } });
  }
  function orderSum() {
    const K = ['수입 FH', 'P-FH', 'P-GI', '서림 GI'];
    const S = O.orderSum;
    const rows = K.filter((k) => S[k]).map((k) => { const x = S[k]; const sup = (O.orders.find((o) => o.kind === k) || {}).sup || '';
      return `<tr><td><b>${k}</b></td><td>${esc(sup.replace(/\s*\(자가 도금\)/, ''))}</td><td class="${x.past > 0.5 ? 'bad' : ''}"><b>${n0(x.past)}</b></td><td class="${x.soon > 0.5 ? 'warn' : ''}"><b>${n0(x.soon)}</b></td><td>${n0(x.t - x.past - x.soon)}</td><td><b>${n0(x.t)}</b></td></tr>`; }).join('');
    const next = O.orders.filter((o) => o.state === 'soon').sort((a, b) => (a.o1 < b.o1 ? -1 : 1));
    return card('ps-osum', '소재 발주 요약', `생산 일정(10월 ~ 3월) 기준 · ${md(O.asOf)} 현재`, '단위: 톤',
      `<div class="scroll"><table class="t big"><thead><tr><th>소재</th><th>업체</th><th>시한 지남</th><th>2주 내 마감</th><th>이후</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + (next.length ? `<p class="small"><b>최우선 발주:</b> ${next.slice(0, 3).map((o) => `${md(o.o1)}까지 ${o.kind} ${n0(o.t - (o.ordered || 0))}t(${md(o.arr)} 입고)`).join(' · ')}</p>` : '')
      + '<p class="small">시한 지남 = 발주 마감이 오늘 이전인데 기발주 자료가 없는 양(미발주, 수입 FH 는 기발주 반영). FH 는 자가 도금 소재. 실제로 이미 발주됐는지 구매와 대조 필요.</p>');
  }
  function fhCard() {
    const today = O.asOf;
    const win = (m) => { const y = +m.slice(0, 4), mm = +m.slice(5); const om = mm - 2 <= 0 ? mm + 10 : mm - 2, oy = mm - 2 <= 0 ? y - 1 : y; return [`${oy}-${String(om).padStart(2, '0')}-10`, `${oy}-${String(om).padStart(2, '0')}-20`]; };
    const rows = Object.entries(O.fh).filter(([m]) => m >= '2026-10').map(([m, [need, have]]) => {
      const left = Math.max(0, need - have), [o0, o1] = win(m);
      const st = left < 0.5 ? ['충분', 'good'] : today > o1 ? ['시한 지남', 'bad'] : today >= o0 ? ['발주 기간 중', 'warn'] : [`${md(o0)}부터`, ''];
      return `<tr><td><b>${+m.slice(5)}월적</b>${m.slice(0, 4) !== '2026' ? ` <small>'${m.slice(2, 4)}</small>` : ''}</td><td>${md(o0)}~${md(o1)}</td><td>${md(`${m}-07`)}</td><td>${n0(need)}</td><td>${n0(have)}</td><td class="${st[1] === 'bad' ? 'bad' : st[1] === 'warn' ? 'warn' : ''}"><b>${n0(left)}</b></td><td><span class="tag ${st[1]}">${st[0]}</span></td></tr>`; }).join('');
    return card('ps-fh', '수입 FH 월적', '계획재용 수입 FH — 필요량 · 기발주 · 남은 발주', '단위: 톤',
      `<div class="scroll"><table class="t big"><thead><tr><th>월적</th><th>발주 기간</th><th>입고</th><th>필요</th><th>기발주</th><th>남은 발주</th><th>판정</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">기발주 = 기초재고 파일의 수입 FH 발주량(10월적 4,600t · 11월적 1,925t). 10월적 남는 1,837t 은 11월 이후 생산에 먼저 쓸 수 있음.</p>`);
  }
  function kpis() {
    const T = O.tot, M = mon(O.month);
    const k = (tone, l, v, unit, b, ck) => `<div class="kpi tone-${tone}" data-rk="k-${ck}"><div class="l">${l}</div><div class="v"><b data-count="${Math.round(v)}" data-ck="${ck}">0</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    const sr = T.stock / T.target, er = T.end[0] / T.target;
    const shipExp = T.fcM * O.pace;
    const risk = (O.flags.short || 0) + (O.flags.low || 0);
    return `<div class="kpis">
      ${k(sr > 1.5 ? 'bad' : sr > 1.1 ? 'warn' : 'good', `계획재 재고 (${md(O.asOf)} 추정)`, T.stock, 't', `목표 ${n0(T.target)}t의 <b>${Math.round(sr * 100)}%</b> · 9월말(MES) ${n0(T.stock0Mes)}t`, 'st')}
      ${k(T.prodM >= T.planDue ? 'good' : 'warn', `${M} 생산 누계`, T.prodM, 't', `월 계획 ${n0(T.planM)}t · 오늘까지 일정 ${n0(T.planDue)}t`, 'pr')}
      ${k(T.shipM >= shipExp * 0.9 ? 'good' : 'warn', `${M} 출하 누계`, T.shipM, 't', `월 예측 ${n0(T.fcM)}t · 보통 이맘때 ${n0(shipExp)}t(${Math.round(O.pace * 100)}%)`, 'sh')}
      ${k(er > 1.5 ? 'bad' : er > 1.1 ? 'warn' : 'good', `${M}말 예상 재고`, T.end[0], 't', `목표 대비 <b>${Math.round(er * 100)}%</b> · 결품·안전재고 미만 ${risk}개 사양`, 'en')}</div>`;
  }

  function trend() {
    const D = O.daily, W = 1200, H = 340, pl0 = 64, pr = 150, pt = 16, pb = 34;
    const xs = D.days.concat(D.future.map((x) => x[0]));
    const vals = D.stock.concat(D.future.map((x) => x[1]), [O.tot.target, O.tot.safe]);
    const sc = UI.scale(Math.max(...vals) * 1.05), ym = sc.hi;
    const x = (i) => pl0 + (W - pl0 - pr) * (xs.length > 1 ? i / (xs.length - 1) : 0.5), y = (v) => pt + (H - pt - pb) * (1 - v / ym);
    let g = '';
    for (const v of sc.ticks) g += `<line class="gl" x1="${pl0}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl0 - 8}" y="${y(v) + 5}" text-anchor="end">${UI.tick(v, sc.step)}</text>`;
    const every = Math.max(1, Math.ceil(xs.length / 16));
    xs.forEach((d, i) => { if (i % every === 0) g += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${md(d)}</text>`; });
    const ref = (v, c, lab) => `<line x1="${pl0}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="2" stroke-dasharray="7 6"/><text x="${W - pr + 8}" y="${y(v) + 5}" class="lab" style="fill:${c}">${lab} ${n0(v)}</text>`;
    g += ref(O.tot.target, 'var(--good)', '목표') + ref(O.tot.safe, 'var(--warn)', '안전');
    const n = D.days.length;
    g += `<polyline class="ln" fill="none" stroke="var(--s1)" stroke-width="3" points="${D.stock.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
    if (D.future.length) g += `<polyline fill="none" stroke="var(--s1)" stroke-width="3" stroke-dasharray="4 6" opacity=".75" points="${[[n - 1, D.stock[n - 1]]].concat(D.future.map((f, j) => [n + j, f[1]])).map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}"/>`;
    const lv = D.future.length ? D.future[D.future.length - 1][1] : D.stock[n - 1];
    g += `<text x="${x(xs.length - 1) + 8}" y="${y(lv) - 10}" class="lab">${D.future.length ? '월말 예상 ' : ''}${n0(lv)}</text>`;
    xs.forEach((d, i) => {
      const f = i >= n; const v = f ? D.future[i - n][1] : D.stock[i];
      const tp = f ? `<b>${md(d)} 예상</b><br>재고 ${n0(v)}t` : `<b>${md(d)}</b><br>재고 ${n0(v)}t<br>생산 ${n0(D.prod[i])}t · 출하 ${n0(D.ship[i])}t`;
      g += `<rect class="hit" x="${x(i) - (W - pl0 - pr) / xs.length / 2}" y="${pt}" width="${(W - pl0 - pr) / xs.length}" height="${H - pt - pb}" data-tip="${tp}"/>`;
    });
    return card('ps-trend', '계획재 재고 추이', `9월말 MES 재고 + 매일 생산 − 출하 · 점선 = ${mon(O.month)}말까지 예상(남은 계획 생산 − 남은 예측 판매)`, '단위: 톤',
      `<div class="legend"><span><i class="box" style="background:var(--s1)"></i>계획재 187 사양 재고</span><span><i class="box" style="background:var(--good)"></i>목표재고 합</span><span><i class="box" style="background:var(--warn)"></i>안전재고 합</span></div><div class="chart"><svg viewBox="0 0 ${W} ${H}" class="cv" role="img" aria-label="계획재 재고 추이">${g}</svg></div>`);
  }

  function months() {
    const T = O.tot, ms = O.months, i0 = ms.indexOf(O.month);
    const rows = ms.slice(i0).map((m, k) => {
      const e = T.end[k], r = e / T.target;
      return `<tr><td class="l nm">${mon(m)}${k === 0 ? ' <small class="muted">(남은 분)</small>' : ''}</td><td title="TF 예측 ${n0((T.fcTF || T.fc)[i0 + k])}t">${n0(T.fc[i0 + k])}</td><td title="운영안 ${n0((T.prodTF || T.prod)[i0 + k])}t">${n0(T.prod[i0 + k])}</td><td><b>${n0(e)}</b></td><td class="${r > 1.5 ? 'bad' : r > 1.1 ? 'warn' : ''}">${Math.round(r * 100)}%</td></tr>`;
    }).join('');
    return card('ps-mon', '월별 예측', '다음 달부터 출하 = 실제 출하 속도 반영 · 생산 = 목표 재고 유지 양(컬러 계획과 같은 기준)', '단위: 톤',
      `<div class="scroll"><table class="t big"><thead><tr><th class="l">월</th><th title="TF 판매 예측과 최근 3개월 실제 출하 평균 중 작은 값(이번 달은 TF 예측)">출하 예상</th><th title="운영안 이하, 목표 재고를 지키는 양까지(이번 달은 운영안)">생산</th><th>월말 예상 재고</th><th>목표 대비</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">목표 = 사양별 목표재고 합 ${n0(T.target)}t</p>`);
  }

  function byMat() {
    const rows = O.byMat.map((b) => `<tr><td class="l nm">${esc(b.mat)}</td><td>${b.n}</td><td><b>${n0(b.stock)}</b></td><td>${n0(b.target)}</td><td>${n0(b.prodM)} / ${n0(b.planM)}</td><td>${n0(b.shipM)} / ${n0(b.fcM)}</td><td><b>${n0(b.end)}</b></td></tr>`).join('');
    return card('ps-mat', '소재 구분별', `운영안 소재발주구분 · ${mon(O.month)} 진도`, '단위: 톤',
      `<div class="scroll"><table class="t big"><thead><tr><th class="l">소재</th><th>사양</th><th>현재 재고</th><th>목표</th><th>생산 / 계획</th><th>출하 / 예측</th><th>${mon(O.month)}말 예상</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">서림 GI 사양은 서림 공급이 27년부터라 현재는 다른 GI(주로 포스코 광양)로 만들고 있음 — 구분은 운영안 표기 그대로.</p>`);
  }

  function specs() {
    const S = O.specs, R = O.rows;
    const has = (r) => (flt === 'all' ? true : flt === 'risk' ? (r.flags || []).some((f) => f === 'short' || f === 'low' || f === 'shortNext' || f === 'behind') : (r.flags || []).includes(flt));
    const key = { end: (r) => (r.end ? r.end[0] - S[r.i].safe : 0), stock: (r) => -r.stock, cover: (r) => (r.cover == null ? 1e9 : r.cover) }[sortK];
    const list = R.filter(has).sort((a, b) => key(a) - key(b));
    const cnt = (f) => (f === 'all' ? R.length : f === 'risk' ? R.filter((r) => (r.flags || []).some((x) => ['short', 'low', 'shortNext', 'behind'].includes(x))).length : (O.flags[f] || 0));
    const seg = [['risk', '조치 필요'], ...ORDER.map((f) => [f, FLAG[f][0]]), ['all', '전체']].map(([f, l]) => `<button type="button" data-f="${f}" aria-pressed="${f === flt}">${l} <small>${cnt(f)}</small></button>`).join('');
    const rows = list.map((r) => {
      const s = S[r.i];
      const fl = (r.flags || []).map((f) => `<span class="tag ${FLAG[f][1]}">${FLAG[f][0]}</span>`).join(' ');
      const e = r.end || [];
      const ec = (v) => (v < 0 ? 'bad' : v < s.safe ? 'warn' : '');
      return `<tr><td class="l nm">${esc(s.product)}</td><td class="l">${esc(s.spec)}</td><td class="l">${esc(s.mat)}</td><td class="l">${esc(s.owner)}</td>
        <td><b>${n1(r.stock)}</b></td><td>${n1(s.safe)} / ${n1(s.target)}</td><td>${n1(r.prodM)} <small class="muted">/ ${n1(r.planDue)} / ${n1(r.planM)}</small></td><td>${n1(r.shipM)} <small class="muted">/ ${n1(r.fcM)}</small></td>
        <td class="${ec(e[0])}"><b>${n1(e[0])}</b></td><td class="${ec(e[1])}">${n1(e[1])}</td><td class="${ec(e[2])}">${n1(e[2])}</td><td>${r.cover == null ? '-' : n0(r.cover)}</td><td class="l">${fl}</td></tr>`;
    }).join('') || '<tr><td colspan="13" class="muted">해당 사양 없음</td></tr>';
    const m1 = O.months.indexOf(O.month);
    return card('ps-spec', '사양별 진도·예측', '위험 사양 우선 표시 · 정렬 기준: 월말 예상(안전재고 대비) / 재고 / 커버 일수', '단위: 톤',
      `<div class="seg" id="ps-f">${seg}</div><div class="seg" id="ps-s" style="margin-top:8px">${[['end', '월말 예상 낮은 순'], ['cover', '커버 일수 짧은 순'], ['stock', '재고 많은 순']].map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${k === sortK}">${l}</button>`).join('')}</div>
      <div class="scroll" style="margin-top:12px"><table class="t"><thead><tr><th class="l">품명</th><th class="l">사양</th><th class="l">소재</th><th class="l">담당</th><th>현재 재고</th><th>안전 / 목표</th><th>${mon(O.month)} 생산 <small>실적 / 일정 / 월계획</small></th><th>${mon(O.month)} 출하 <small>실적 / 예측</small></th>
      <th>${mon(O.months[m1])}말</th><th>${mon(O.months[m1 + 1] || '')}말</th><th>${mon(O.months[m1 + 2] || '')}말</th><th>커버 <small>일</small></th><th class="l">판정</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">커버 일수 = 현재 재고 ÷ (이번 달 판매 예측 ÷ 30). 일정 = 운영안 생산 배치를 월 전체에 펼친 날짜로 오늘까지 만들었어야 할 양(통합 계획과 같은 규칙).</p>`);
  }

  function basis() {
    const T = O.tot;
    const sh = Object.entries(O.shipHist).map(([m, v]) => `${mon(m)} ${n0(v)}t`).join(' · '), pr = Object.entries(O.prodHist).map(([m, v]) => `${mon(m)} ${n0(v)}t`).join(' · ');
    return card('ps-basis', '산출 기준 및 유의사항', '', '', `<ul class="small" style="line-height:1.8;margin:0;padding-left:20px">
      <li><b>대상</b> 계획재 운영안(TF)의 187개 사양(컬러건재판매그룹). 사양 = '두께 폭 상도색상' — 운영안 '제품재고' 시트 정의 그대로(품명 무관). 생산 실적은 실측 두께라 ±0.03mm 안에서 가장 가까운 사양으로 봄.</li>
      <li><b>운영안 시작 재고</b> 운영안의 '9월말 재고' ${n0(T.stock0R15)}t 는 실제로는 <b>9/14 기준</b> 재고 목록(코일별 재고일수가 MES 8월말보다 14일 많고 9월말보다 16일 적음). MES 9월말 같은 정의 재고는 <b>${n0(T.stock0Mes)}t</b>(+${n0(T.stock0Mes - T.stock0R15)}t) — 이 화면은 MES 9월말에서 시작.</li>
      <li><b>현재 재고</b> 9월말 재고 + 이후 생산 − 이후 출하(출하 코일번호를 재고·생산 코일과 이어 사양 판정, 판매·이송 모두). 다음 월말 재고 수신 시 해당 값으로 보정.</li>
      <li><b>판매 진도</b> 계획재 출하는 월말에 집중 — 최근 3개월(${O.paceFrom.map(mon).join('·')}) 같은 사양 출하 기준 ${md(O.asOf)}까지 통상 월 출하량의 <b>${Math.round(O.pace * 100)}%</b>가 출하됨. 일수 비례로 판정할 때 생기는 과소 판정을 보정.</li>
      <li><b>최근 실적</b> 출하 ${sh} / 생산 ${pr} (같은 187 사양). MES 출하 기록이 속보보다 늦게 채워지는 날이 있어 이번 주 출하는 덜 잡혔을 수 있음.</li>
      <li><b>판정</b> 월말 결품 예상 = 예상 &lt; 0 · 안전재고 미만 = 0 ≤ 예상 &lt; 안전재고 · 생산 일정 지연 = 일정 대비 30%·5t 이상 부족 · 목표 2배 초과 = 예상 &gt; 목표×2(차이 10t 이상) · 판매 예측 초과 = 출하가 통상 진도의 1.5배+5t 초과(10일 이후).</li></ul>`);
  }

  const specDiv = () => specs().replace(/^<section class="card" id="ps-spec">/, '<div id="ps-spec">').replace(/<\/section>$/, '</div>');
  function render() {
    $('ca-main').innerHTML = `<section class="card" id="ca-kpi"><h2>주요 지표 <small>~${md(O.asOf)} · 계획재 운영안(TF)</small><span class="unit">단위: 톤</span></h2>${kpis()}</section>`
      + `<section class="card" id="ps-cal"><h2>계획재 캘린더 <small>사양별 생산 일정과 소재 발주(업체·수량·기한) · 날짜 선택 시 상세</small><span class="unit">단위: 톤</span></h2><div id="ps-calbox"></div></section>`
      + `<div class="grid2 rowc">${orderSum()}${fhCard()}</div>`
      + trend() + `<div class="grid2 rowc">${months()}${byMat()}</div>`
      + `<details class="card more" id="ps-more"><summary><h2>사양별 상세 <small>${O.n}개 사양 — 진도·월말 예상·판정</small></h2></summary>${specDiv()}</details>`
      + `<details class="card more"><summary><h2>계산 기준</h2></summary>${basis().replace(/^<section[^>]*>/, '').replace(/<\/section>$/, '')}</details>`;
    $('ca-meta').innerHTML = `<span><b>실적</b>~${O.asOf}</span><span><b>시작 재고</b>MES ${O.stockMonth.slice(0, 4)}.${O.stockMonth.slice(4)}월말</span><span><b>기준</b>계획재 운영안 ${O.n}개 사양</span><span><b>계산</b>${String(O.built || '').replace('T', ' ')}</span>`;
    calInit();
    UI.reveal($('ca-main')); UI.count($('ca-main')); bindTip($('ca-main'));
    wire();
  }
  function wire() {
    document.querySelectorAll('#ps-f button').forEach((b) => b.addEventListener('click', () => { flt = b.dataset.f; $('ps-spec').outerHTML = specDiv(); wire(); }));
    document.querySelectorAll('#ps-s button').forEach((b) => b.addEventListener('click', () => { sortK = b.dataset.s; $('ps-spec').outerHTML = specDiv(); wire(); }));
  }
  let env = null;
  const envReady = GP.latest('planstock.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
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
