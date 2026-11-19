/* 예시 월차 계획(11/19 사용자 '이 자료로 다음 달 월차 — 언제 M/C, 언제 AZ·AL · 일단 만들어봐')
   판생 담당자 엑셀 방식 그대로: 회의 월 목표 + 막힌 날(대수리·휴지·MAC Pot) + 강종별 하루 톤(판생 제원 작업일수) → 1·2CGL 일별 강종·M/C·S/D
   규칙(gadong-plan tools/monthly_plan.py 와 같음): 꼭 맞출 강종 = 1CGL AZ · 2CGL MAC, 남는 날 = AL(full 가동) · 지난달 끝 강종을 달 앞뒤로 쪼갬
   · 1CGL AL→AZ = S/D, 그 밖 전환 = M/C · 전환 첫날 500t · 전환일 15시간 · 휴지 뒤 1CGL 은 AZ부터
   자료 = published/wolcha.enc.json(gadong-plan tools/wolcha_build.py) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const sg = (v) => (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '−' : '') + n0(Math.abs(v));
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const LINES = { '1CGL': ['AZ', 'AL'], '2CGL': ['MAC', 'AL'] }, MUST = { '1CGL': 'AZ', '2CGL': 'MAC' };
  let X = null, M = null, VIEW = 'gen', OV = {};   // OV[월][라인] = 사람이 옮긴 전환 날짜 목록

  const daysOf = (m) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7), n = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); };
  const isDown = (l, d) => X.down.includes(`${l}|${d}`);
  const noGo = (l, g, d) => X.nogo.includes(`${l}|${g}|${d}`);
  const prevM = (m) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };

  function autoSwitch(l, m, carry) {   // 전환 날짜를 날 수로 먼저 정함
    const R = X.months[m], must = MUST[l], days = daysOf(m).filter((d) => !isDown(l, d));
    if (!days.length) return { order: ['AL'], sw: [] };
    if (isDown(l, `${m}-01`)) carry = l === '1CGL' ? 'AZ' : 'AL';
    const nm = Math.ceil(Math.max(0, R.T[must] - X.swT) / R.rate[`${l}|${must}`]) + 1;
    const ok = days.filter((d) => !noGo(l, must, d));
    if (carry === must && ok[0] === days[0]) { const a = Math.round(nm * 0.6), b = nm - a; return { order: [must, 'AL', must], sw: [days[Math.min(a, days.length - 1)], days[Math.max(a + 1, days.length - b)]] }; }
    const i = Math.max(Math.round((days.length - nm) / 2), ok.length ? days.indexOf(ok[0]) : 0);
    if (i + nm >= days.length) return { order: ['AL', must], sw: [days[Math.min(i, days.length - 1)]] };
    return { order: ['AL', must, 'AL'], sw: [days[i], days[i + nm]] };
  }
  function genLine(l, m, carry) {
    const R = X.months[m], must = MUST[l], a = autoSwitch(l, m, carry), sw = ((OV[m] || {})[l]) || a.sw, out = [];
    let k = 0, cur = a.order[0], made = 0, first = carry != null && carry !== cur;
    const DD = daysOf(m), blockLeft = (d) => {   // 오늘부터 이 강종 덩어리가 끝나는 날까지 남은 가동일(다음 전환일 전·휴지 제외)
      const nx = k + 1 < a.order.length && k < sw.length ? sw[k] : '9999'; return DD.filter((x) => x >= d && x < nx && !isDown(l, x)).length; };
    for (const d of DD) {
      if (isDown(l, d)) { out.push({ d, g: '', t: 0, ev: '휴지', h: 0 }); first = true; continue; }
      let ev = '';
      if (k + 1 < a.order.length && k < sw.length && d >= sw[k]) { k += 1; cur = a.order[k]; first = true; ev = l === '1CGL' && cur === 'AZ' ? 'S/D' : 'M/C'; }
      let t = first ? X.swT : R.rate[`${l}|${cur}`];
      if (cur === must) { t = first ? Math.min(t, Math.max(0, R.T[must] - made)) : Math.min(t, Math.max(0, R.T[must] - made) / Math.max(1, blockLeft(d))); t = Math.round(t); made += t; }   // 꼭 맞출 강종: 남은 목표를 덩어리 남은 날에 고르게(하루 톤 넘지 않게)
      out.push({ d, g: cur, t, ev, h: ev ? 15 : 24 }); first = false;
    }
    return { days: out, auto: a.sw, sw, order: a.order };
  }
  function genMonth(m) {   // 지난달 끝 강종을 이어받음(첫 달은 판생 손 계획 끝)
    const ms = Object.keys(X.months).sort(), i = ms.indexOf(m), carry = {};
    const p = X.months[ms[0]].ref;
    for (const l of Object.keys(LINES)) { const L = (p[l] || []).filter((r) => r[1]); carry[l] = L.length ? L[L.length - 1][1] : null; }
    let res = null;
    for (let j = 1; j <= i; j++) {   // 지난달 끝 강종 = 판생 손 계획이 있으면 그것(확정된 달), 없으면 생성한 계획
      res = {}; const rf = X.months[ms[j]].ref;
      for (const l of Object.keys(LINES)) { res[l] = genLine(l, ms[j], carry[l]); const R = (rf[l] || []).filter((r) => r[1] && r[2]), L = res[l].days.filter((x) => x.g); carry[l] = R.length ? R[R.length - 1][1] : L.length ? L[L.length - 1].g : carry[l]; }
    }
    return res;
  }
  const refDays = (m, l) => (X.months[m].ref[l] || []).map(([d, g, t, ev]) => ({ d, g, t, ev, h: ev === 'M/C' || ev === 'S/D' ? 15 : t ? 24 : 0 }));
  const sumBy = (days) => { const s = {}; for (const x of days) if (x.g) s[x.g] = (s[x.g] || 0) + x.t; return s; };
  const runs = (days) => { const r = []; for (const x of days) { const g = x.g || '휴지'; if (!r.length || r[r.length - 1].g !== g) r.push({ g, a: x.d, b: x.d, ev: x.ev === '휴지' ? '' : x.ev }); else r[r.length - 1].b = x.d; } return r; };

  function table(m, P) {
    const D = daysOf(m), wk = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const head = `<tr><th class="ln" rowspan="2">라인</th><th class="kd" rowspan="2">강종</th>${D.map((d) => `<th class="${[0, 6].includes(wk(d)) ? 'we' : ''}">${+d.slice(8)}</th>`).join('')}<th rowspan="2">계</th><th rowspan="2">목표</th><th rowspan="2">차이</th><th rowspan="2">작업일</th></tr>`
      + `<tr>${D.map((d) => `<th class="dw${[0, 6].includes(wk(d)) ? ' we' : ''}">${DOW[wk(d)]}</th>`).join('')}</tr>`;
    const T = X.months[m].T, rows = [];
    for (const [l, gs] of Object.entries(LINES)) {
      const L = P[l], s = sumBy(L);
      const gRow = (g) => { const tgt = g === MUST[l] ? T[g] : null, tot = s[g] || 0, nd = L.filter((x) => x.g === g).length - L.filter((x) => x.g === g && x.ev).length * 0.5;
        return `<tr class="g"><th class="kd">${g}</th>${L.map((x) => `<td class="${x.g === g && x.t ? g.toLowerCase() : ''}">${x.g === g && x.t ? n0(x.t) : ''}</td>`).join('')}<td class="sm">${n0(tot)}</td><td>${tgt != null ? n0(tgt) : ''}</td><td class="${tgt != null && Math.abs(tot - tgt) >= 1 ? 'df' : ''}">${tgt != null ? sg(tot - tgt) : ''}</td><td>${nd ? nd.toFixed(1) : ''}</td></tr>`; };
      const evRow = `<tr class="ev"><th class="kd"></th>${L.map((x) => `<td class="${x.ev ? 'evc' : ''}">${x.ev}</td>`).join('')}<td colspan="4"></td></tr>`;
      const hRow = `<tr class="h"><th class="kd">가동시간</th>${L.map((x) => `<td>${x.h}</td>`).join('')}<td class="sm">${n0(L.reduce((a, x) => a + x.h, 0))}</td><td colspan="3"></td></tr>`;
      rows.push(`<tbody class="lb"><tr class="g"><th class="ln" rowspan="5">${l}</th>${gRow(gs[0]).slice(14)}${evRow}${gRow(gs[1])}${hRow}`
        + `<tr class="lt"><th class="kd">계</th>${L.map((x) => `<td>${x.t ? n0(x.t) : ''}</td>`).join('')}<td class="sm">${n0(Object.values(s).reduce((a, v) => a + v, 0))}</td><td colspan="3"></td></tr></tbody>`);
    }
    return `<div class="wc-w"><table class="wc"><thead>${head}</thead>${rows.join('')}</table></div>`;
  }

  function draw() {
    const ms = Object.keys(X.months).sort().slice(1);   // 첫 달(진행 중)은 이어받기용
    if (!M || !ms.includes(M)) M = ms[0];
    const G = genMonth(M), gen = { '1CGL': G['1CGL'].days, '2CGL': G['2CGL'].days };
    const hasRef = Object.values(X.months[M].ref).some((L) => L.some((r) => r[2])), ref = { '1CGL': refDays(M, '1CGL'), '2CGL': refDays(M, '2CGL') };
    const P = VIEW === 'ref' && hasRef ? ref : gen, T = X.months[M].T;
    const al = (Q) => Object.values(Q).reduce((a, L) => a + (sumBy(L).AL || 0), 0), tot = (Q) => Object.values(Q).reduce((a, L) => a + L.reduce((b, x) => b + x.t, 0), 0);
    const same = (l) => gen[l].filter((x, i) => ref[l][i] && (x.g || '') === (ref[l][i].g || '')).length;
    const seq = (l) => runs(P[l]).map((r) => `${r.ev ? `<b class="sw">${r.ev} ${md(r.a)}</b> ` : ''}<span class="sq ${r.g === '휴지' ? 'off' : r.g.toLowerCase()}">${r.g} ${md(r.a)}~${md(r.b)}</span>`).join(' ');
    const swEd = (l) => { const g = G[l]; return `<span class="se">${g.sw.map((d, i) => `<label>${i + 1}차 전환 <input type="date" data-l="${l}" data-i="${i}" value="${d}" min="${M}-01" max="${daysOf(M).slice(-1)[0]}"></label>`).join('')}${(OV[M] || {})[l] ? `<button type="button" class="btn sub sm" data-auto="${l}">자동</button>` : ''}</span>`; };
    $('ct-main').innerHTML = `<section class="card wc-top"><h2>${+M.slice(5)}월 도금 월차 <small>판생 목표 ${n0(T.total)}t · 하루 톤 ${X.months[M].rateSrc}</small>
        <span class="seg">${ms.map((m) => `<button type="button" data-m="${m}" aria-pressed="${m === M}">${+m.slice(5)}월</button>`).join('')}</span></h2>
      <div class="wc-k">
        <div><span>도금 계</span><b>${n0(tot(P))}<small>t</small></b><em>목표 ${n0(T.total)} · ${sg(tot(P) - T.total)}</em></div>
        <div><span>AZ · 1CGL</span><b>${n0(sumBy(P['1CGL']).AZ)}<small>t</small></b><em>목표 ${n0(T.AZ)}</em></div>
        <div><span>MAC · 2CGL</span><b>${n0(sumBy(P['2CGL']).MAC)}<small>t</small></b><em>목표 ${n0(T.MAC)}</em></div>
        <div class="${al(P) - T.AL >= 300 ? 'ok' : al(P) - T.AL <= -300 ? 'bad' : ''}"><span>AL · 1·2CGL</span><b>${n0(al(P))}<small>t</small></b><em>목표 ${n0(T.AL)} · ${al(P) - T.AL >= 0 ? `여유 ${n0(al(P) - T.AL)}` : `부족 ${n0(T.AL - al(P))}`}</em></div>
      </div>
      <div class="wc-seq">${Object.keys(LINES).map((l) => `<div><b class="ln">${l}</b> ${seq(l)}</div>${VIEW === 'gen' ? `<div class="se-row">${swEd(l)}</div>` : ''}`).join('')}</div></section>
      <section class="card"><h2>일별 가동계획 <small>톤 · 칸 색 = 강종</small>
        <span class="seg"><button type="button" data-v="gen" aria-pressed="${VIEW === 'gen'}">생성</button><button type="button" data-v="ref" aria-pressed="${VIEW === 'ref'}"${hasRef ? '' : ' disabled'}>판생 손 계획</button></span></h2>
        <p class="wk-lg"><span><i class="lg az"></i>AZ</span><span><i class="lg al"></i>AL</span><span><i class="lg mac"></i>MAC</span><span><i class="lg evc"></i>M/C·S/D</span>${hasRef ? `<span>판생 손 계획과 강종 같은 날 1CGL ${same('1CGL')}/${gen['1CGL'].length} · 2CGL ${same('2CGL')}/${gen['2CGL'].length}</span>` : ''}</p>
        ${table(M, P)}</section>`;
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { M = b.dataset.m; draw(); }));
    document.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { VIEW = b.dataset.v; draw(); }));
    document.querySelectorAll('.se input').forEach((inp) => inp.addEventListener('change', () => { const l = inp.dataset.l, cur = G[l].sw.slice(); cur[+inp.dataset.i] = inp.value; cur.sort(); OV[M] = Object.assign({}, OV[M], { [l]: cur }); draw(); }));
    document.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => { delete (OV[M] || {})[b.dataset.auto]; draw(); }));
    if (window.UI && UI.sub) UI.sub(`판생 엑셀 ${X.src} · 자료 ${String(X.built).slice(5, 16).replace('T', ' ')}`);
  }
  CT.boot(['wolcha.enc.json'], (D) => {
    X = D.wolcha; if (!X) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; }
    draw();
  });
})();
