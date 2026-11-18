/* 예시(통합안) 수주 조정 — 11/18 사장님 회의 원칙(gadong-plan docs/36)을 화면으로.
   #board 순 단위 룸판: 라인 × 순(10일) — 컬러 = 내수(순 고정) · 수출·가전(빈 룸 채움) · 빈 룸 / 2CCL = 최후(가동 시 사장님 결정) / 도금 = 자가재(고정 몫) · 판매재
          칸을 누르면 그 칸 배정·당길 수 있는 수출 오더·결정 기록(공유 저장소, 수주가 결정·책임)
   #test  시험 계산: 내수(건재 등)를 순 단위로 고르게 고정하고 ±물량을 바꿔 보면 → 수출·가전 그대로, 빈 룸 = 당길 오더, 넘치면 2CCL(사장님 결정), 도금 자가재 영향
   #grp   판매그룹별: 그룹 × 순 배정 · 컬러수출 수주 확보 · 담당자별 당길 수 있는 오더
   자료 = published/preview_ops.enc.json(gadong-plan tools/preview_build.py) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + n0(Math.abs(v));
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const SN = ['상순', '중순', '하순'];
  const sunLab = (s) => `${+s.slice(5, 7)}월 ${SN[+s.slice(8) - 1]}`;
  const sunEnd = (s) => { const y = +s.slice(0, 4), m = +s.slice(5, 7), k = +s.slice(8); return k === 1 ? `${s.slice(0, 7)}-10` : k === 2 ? `${s.slice(0, 7)}-20` : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const sunStart = (s) => `${s.slice(0, 7)}-${['01', '11', '21'][+s.slice(8) - 1]}`;
  const nextMon = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  const CCL = ['1CCL', '3CCL', '4CCL', '2CCL'], CGL = ['1CGL', '2CGL'], MAIN = ['1CCL', '3CCL', '4CCL'];
  const ST = (st) => (/매치 완료|소재 있음/.test(st) ? ['ok', '소재 확보'] : /입고 대기/.test(st) ? ['wait', '소재 입고 대기'] : ['no', '소재 없음']);
  let X = null, EV = [], SEL = null;

  const suns = () => [...new Set([...Object.values(X.color), ...Object.values(X.cgl)].flatMap((o) => Object.keys(o)))].sort();
  const cc = (l, s) => (X.color[l] || {})[s] || null;
  const room = (c) => (c ? Math.max(0, c.cap - c.dom - c.exp) : 0);
  const used = (c) => (c ? c.dom + c.exp : 0);
  function selfMin(s) {   // 그 순 안 강종별 자가재 재고 최저(음수만)
    const a = sunStart(s), z = sunEnd(s), out = [];
    for (const [al, ser] of Object.entries(X.self || {})) {
      let mn = null; for (const r of ser) if (r[0] >= a && r[0] <= z && (mn == null || r[1] < mn[1])) mn = r;
      if (mn && mn[1] < -0.5) out.push([al, mn[1], mn[0]]);
    }
    return out;
  }
  const pullFor = (line, s) => X.pull.rows.filter((r) => (!line || r.line === line) && r.due > sunEnd(s));
  const decs = (key) => EV.filter((e) => e.t === 'room' && (!key || e.key === key));

  /* ---------- 룸판 ---------- */
  function board() {
    const S = suns(), S3 = S.slice(0, 3);
    const room3 = S3.reduce((a, s) => a + MAIN.reduce((b, l) => b + room(cc(l, s)), 0), 0);
    const pT = X.pull.rows.reduce((a, r) => a + r.t, 0), pOk = X.pull.rows.filter((r) => ST(r.st)[0] === 'ok').reduce((a, r) => a + r.t, 0);
    const s2 = S.filter((s) => used(cc('2CCL', s)) >= 0.5), t2 = s2.reduce((a, s) => a + used(cc('2CCL', s)), 0);
    let low = null; for (const [al, ser] of Object.entries(X.self || {})) for (const r of ser) if (r[0] >= X.today && (!low || r[1] < low[1])) low = [al, r[1], r[0]];
    const kpi = `<div class="op-k">
      <div class="${room3 >= 500 ? 'warn' : 'ok'}"><span>앞 3순 빈 룸(1·3·4CCL)</span><b>${n0(room3)}<small>t</small></b><em>${sunLab(S3[0])} ~ ${sunLab(S3[S3.length - 1])} · 수출·가전 오더로 채울 몫</em></div>
      <div><span>당길 수 있는 수출 오더</span><b>${n0(pT)}<small>t</small></b><em>그중 소재 확보 ${n0(pOk)}t · 납기 ${md(X.pull.from)} 이후</em></div>
      <div class="${s2.length ? 'bad' : 'ok'}"><span>2CCL 가동(최후 라인)</span><b>${s2.length ? `${s2.length}<small>순 · ${n0(t2)}t</small>` : '없음'}</b><em>${s2.length ? '사장님 결정 필요: ' + s2.map(sunLab).join(' · ') : '나머지 CCL 로 소화'}</em></div>
      <div class="${low && low[1] < -0.5 ? 'bad' : 'ok'}"><span>컬러용 자가재(고정 몫) 최저</span><b>${low ? sg(low[1]) : '–'}<small>t</small></b><em>${low ? `${low[0]} ${md(low[2])}${low[1] < -0.5 ? ' — 도금 자가재 몫 부족' : ''}` : ''}</em></div></div>`;
    let mPrev = '';
    const head = S.map((s) => { const mb = s.slice(0, 7) !== mPrev; mPrev = s.slice(0, 7); return `<th class="${mb ? 'mb' : ''}">${sunLab(s)}</th>`; }).join('');
    const mbOf = (i) => (i === 0 || S[i].slice(0, 7) !== S[i - 1].slice(0, 7) ? 'mb' : '');
    const cellC = (l, s, i) => {
      const c = cc(l, s), key = `${l}|${s}`, on = SEL === key ? ' on' : '', nd = decs(key).length;
      if (!c || c.cap < 1) return `<td class="${mbOf(i)}"><div class="rc off"><span class="s">휴지</span></div></td>`;
      if (l === '2CCL') {
        const u = used(c);
        return `<td class="${mbOf(i)}"><button type="button" class="rc${on}" data-k="${key}">${u >= 0.5 ? `<span class="big">${n0(u)}t</span><span class="flag">가동</span><span class="flag">사장님 결정</span>` : '<span class="big full">세움</span>'}${nd ? `<span class="s">결정 ${nd}건</span>` : ''}</button></td>`;
      }
      const r = room(c);
      return `<td class="${mbOf(i)}"><button type="button" class="rc${on}" data-k="${key}">${r >= 50 ? `<span class="s">빈 룸</span><span class="big room">${n0(r)}t</span>` : '<span class="s">&nbsp;</span><span class="big full">꽉 참</span>'}<span class="s">내수 ${n0(c.dom)}</span><span class="s">수출 ${n0(c.exp)}</span>${nd ? `<span class="s">결정 ${nd}건</span>` : ''}</button></td>`;
    };
    const cellG = (l, s, i) => {
      const c = (X.cgl[l] || {})[s], key = `${l}|${s}`, on = SEL === key ? ' on' : '';
      if (!c) return `<td class="${mbOf(i)}"><div class="rc off"><span class="s">–</span></div></td>`;
      const st = Object.values(c.self).reduce((a, v) => a + v, 0), neg = selfMin(s), nd = decs(key).length;
      return `<td class="${mbOf(i)}"><button type="button" class="rc${on}" data-k="${key}"><span class="s">자가재</span><span class="big">${n0(st)}t</span><span class="s">판매 ${n0(c.sale)}</span>${neg.length && l === '2CGL' ? neg.map((x) => `<span class="flag">${x[0]} ${sg(x[1])}</span>`).join('') : ''}${nd ? `<span class="s">결정 ${nd}건</span>` : ''}</button></td>`;
    };
    const body = `<tr class="pl"><td colspan="${S.length + 1}">컬러 — 내수(계획재·주문재·가전내수·수요개발) 순 고정 · 빈 룸 = 수출·가전 오더로 · 2CCL 최후</td></tr>`
      + CCL.map((l) => `<tr><th>${l}${l === '2CCL' ? '<small>최후 라인</small>' : ''}</th>${S.map((s, i) => cellC(l, s, i)).join('')}</tr>`).join('')
      + `<tr class="pl"><td colspan="${S.length + 1}">도금 — 컬러용 자가재 = 고정 몫(도금 주문 증감과 무관) · 판매재 = 수익 중심 수주 판단</td></tr>`
      + CGL.map((l) => `<tr><th>${l}</th>${S.map((s, i) => cellG(l, s, i)).join('')}</tr>`).join('');
    const log = decs();
    return `${kpi}<section class="card"><h2>순 단위 룸판 <small>이번 순(${md(X.today)}부터 남은 날) ~ 2월 · 칸을 누르면 배정·당길 오더·결정 기록</small></h2>
      <div class="op-w"><table class="rb"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="rb-lg"><span><b>빈 룸</b> = 가용 시간 × 라인 평균 속도 − 배정(내수 + 수출)</span><span><b>내수</b> = 순 단위로 정해 끊는 몫</span><span><b>2CCL</b> = 다른 CCL 이 모자랄 때만, 가동하면 사장님 결정</span><span><b>자가재</b> = 컬러가 쓸 몫(건드리지 않음)</span></p>
      <div id="rb-pd"></div></section>
      <section class="card"><h2>결정 기록 <small>수주가 결정하고 책임 — 칸에서 남긴 기록 ${log.length}건</small></h2>${logList(log)}</section>`;
  }
  const logList = (L) => (L.length ? `<ul class="dlog">${L.slice().reverse().map((e) => `<li><small>${esc(String(e.at || '').slice(5, 16).replace('T', ' '))}</small><small>${esc(e.by || '')}</small><b>${esc(e.key ? e.key.replace('|', ' ').replace(/(\d{4}-\d{2}-\d)$/, (m) => sunLab(m)) : '')}</b> — ${esc(e.text)}</li>`).join('')}</ul>` : '<p class="q">아직 없음 — 칸을 눌러 남깁니다.</p>');

  function detail(key) {
    const [l, s] = key.split('|'), el = $('rb-pd'); if (!el) return;
    let left = '', right = '';
    if (CCL.includes(l)) {
      const c = cc(l, s) || { g: {}, cap: 0, dom: 0, exp: 0, days: 0 };
      left = `<h3>${l} ${sunLab(s)} 배정 <small>${c.days}일 가동 · 가용 ${n0(c.cap)}t</small></h3><ul>${Object.entries(c.g).sort((a, b) => b[1] - a[1]).map(([g, t]) => `<li>${esc(g)} ${n0(t)}t <small>${X.dom.includes(g) ? '내수(순 고정)' : '수출·가전'}</small></li>`).join('') || '<li>배정 없음</li>'}</ul>`
        + `<p class="note">${l === '2CCL' ? '2CCL 은 최후 라인 — 가동하려면 사장님 결정(아래 기록).' : `빈 룸 ${n0(room(c))}t — 오른쪽 오더를 당겨 채울지 결정.`}</p>`;
      const P = pullFor(l === '2CCL' ? null : l, s), pt = P.reduce((a, r) => a + r.t, 0);
      right = `<h3>당길 수 있는 수출 오더 <small>${l === '2CCL' ? '전 라인' : l} · 납기 ${md(sunEnd(s))} 이후 · ${P.length}건 ${n0(pt)}t</small></h3>`
        + (P.length ? `<div class="op-w"><table class="op-t"><thead><tr><th class="l">납기</th><th class="l">계약</th><th class="l">품명·규격</th><th>남은 t</th><th class="l">소재</th><th class="l">담당</th></tr></thead><tbody>${P.slice(0, 15).map((r) => { const [k, n] = ST(r.st); return `<tr><td class="l">${md(r.due)}</td><td class="l">${esc(r.con)}</td><td class="l">${esc(r.pdt)} ${esc(r.size)}</td><td>${n0(r.t)}</td><td class="l"><span class="st ${k}">${n}</span></td><td class="l">${esc(r.man)}</td></tr>`; }).join('')}</tbody></table></div>${P.length > 15 ? `<p class="note">외 ${P.length - 15}건 — 판매그룹별 탭 담당자별 표</p>` : ''}` : '<p class="q">이 라인에 당길 수 있는 미결 수출 오더 없음 → 다음 달 수주를 받아 와야 함(판매그룹별 탭)</p>');
    } else {
      const c = (X.cgl[l] || {})[s] || { self: {}, sale: 0 }, neg = selfMin(s);
      left = `<h3>${l} ${sunLab(s)} <small>자가재 = 컬러용 고정 몫</small></h3><ul>${Object.entries(c.self).map(([a, t]) => `<li>자가재 ${esc(a)} ${n0(t)}t</li>`).join('') || '<li>자가재 없음</li>'}<li>판매재 ${n0(c.sale)}t</li></ul>`;
      right = `<h3>자가재 재고(도금 생산 − 컬러 사용) ${sunLab(s)}</h3>` + (neg.length ? `<ul>${neg.map((x) => `<li class="bad"><b>${x[0]} ${sg(x[1])}t</b> (${md(x[2])} 최저) — 컬러용 몫이 모자람. 판매재 룸을 자가재로 돌리거나 컬러 사용일 조정 결정 필요</li>`).join('')}</ul>` : '<p class="q">이 순에 자가재 부족 없음</p>');
    }
    const D = decs(key);
    el.innerHTML = `<div class="pd"><div class="pd-g"><div>${left}</div><div>${right}</div></div>
      <form class="dec" id="dec-f"><b>이 칸 결정 남기기</b><textarea id="dec-t" placeholder="예: 1월 GEMLIK 오더 300t 12월 중순으로 당김 · 담당 확인함" required></textarea>
      <div class="row"><input id="dec-by" placeholder="이름" value="${esc(CT.me())}"><button class="btn" type="submit">기록</button><span class="note" id="dec-m"></span></div></form>${D.length ? logList(D) : ''}</div>`;
    $('dec-f').addEventListener('submit', async (e) => {
      e.preventDefault(); const t = $('dec-t').value.trim(); if (!t) return;
      try { localStorage.setItem('cgl-me', $('dec-by').value.trim()); } catch (x) { /* 무시 */ }
      $('dec-m').textContent = '저장 중…';
      try { await CT.store.push({ t: 'room', key, line: l, sun: s, text: t }); EV = await CT.store.events(); draw(); } catch (x) { $('dec-m').textContent = '⚠ ' + x.message; }
    });
  }

  /* ---------- 시험 계산 ---------- */
  function testView() {
    const M = [...new Set(suns().map((s) => s.slice(0, 7)))].filter((m) => [1, 2, 3].every((k) => MAIN.some((l) => cc(l, `${m}-${k}`))));
    const m0 = M.includes(TM) ? TM : M[0];
    return `<section class="card"><h2>시험 계산 <small>사장님 질문 — 내수 계획 물량이 바뀌면 다른 라인·도금이 흔들리나</small></h2>
      <p class="q">내수(계획재·주문재·가전내수·수요개발)를 순마다 가용 능력에 비례해 고르게 고정하고, 물량을 바꿔 봄. 수출·가전 배정은 지금 계획 그대로.</p>
      <div class="tc"><label>달 <select id="tc-m">${M.map((m) => `<option${m === m0 ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>내수 물량 변동 <input type="range" id="tc-d" min="-5000" max="5000" step="500" value="${TD}"> <output id="tc-o">${sg(TD)}t</output></label></div>
      <div id="tc-r"></div></section>`;
  }
  let TM = null, TD = 0;
  function testCalc() {
    const m = $('tc-m').value, d = +$('tc-d').value; TM = m; TD = d; $('tc-o').textContent = sg(d) + 't';
    const S = [1, 2, 3].map((k) => `${m}-${k}`);
    const cap1 = S.map((s) => MAIN.reduce((a, l) => a + ((cc(l, s) || {}).cap || 0), 0));
    const cap2 = S.map((s) => (cc('2CCL', s) || {}).cap || 0);
    const D0 = S.map((s) => CCL.reduce((a, l) => a + ((cc(l, s) || {}).dom || 0), 0));
    const X0 = S.map((s) => CCL.reduce((a, l) => a + ((cc(l, s) || {}).exp || 0), 0));
    const u2now = S.reduce((a, s) => a + used(cc('2CCL', s)), 0);
    const roomNow = S.map((s) => MAIN.reduce((a, l) => a + room(cc(l, s)), 0));
    const TDsum = Math.max(0, D0.reduce((a, v) => a + v, 0) + d), C1 = cap1.reduce((a, v) => a + v, 0) || 1;
    const D1 = cap1.map((c) => TDsum * c / C1);
    // 넘치는 순의 수출·가전은 같은 달 다른 순 빈 룸으로 옮김(가까운 순부터 — 수출은 선적 기한 안에서 움직일 수 있음) → 그래도 넘치면 2CCL(사장님 결정) → 그 뒤 능력 초과
    const rm = S.map((s, i) => Math.max(0, cap1[i] - D1[i] - X0[i])), ov = S.map((s, i) => Math.max(0, D1[i] + X0[i] - cap1[i])), mv = S.map(() => 0);
    S.forEach((s, i) => { [...S.keys()].filter((j) => j !== i).sort((a, b) => Math.abs(a - i) - Math.abs(b - i)).forEach((j) => { const t = Math.min(ov[i], rm[j]); ov[i] -= t; rm[j] -= t; mv[i] -= t; mv[j] += t; }); });
    const R = S.map((s, i) => { const u2 = Math.min(ov[i], cap2[i]); return { s, d0: D0[i], d1: D1[i], x: X0[i] + mv[i], cap: cap1[i], room: rm[i], u2, beyond: ov[i] - u2, roomNow: roomNow[i], mv: mv[i] }; });
    const moved = mv.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const sum = (k) => R.reduce((a, r) => a + r[k], 0);
    const P = X.pull.rows.filter((r) => r.due >= nextMon(m) + '-01'), pT = P.reduce((a, r) => a + r.t, 0), pOk = P.filter((r) => ST(r.st)[0] === 'ok').reduce((a, r) => a + r.t, 0);
    const mi = Math.max(0, (X.sales.C건재 || []).findIndex((x) => x.m === m)), coef = ((X.selfCoef || {}).C건재 || [0.65])[Math.min(mi, ((X.selfCoef || {}).C건재 || [0.65]).length - 1)] || 0.65;
    const share0 = sum('d0') ? R[0].d0 / sum('d0') * 100 : 0, share1 = sum('d1') ? R[0].d1 / sum('d1') * 100 : 0;
    let low = {}; for (const [al, ser] of Object.entries(X.self || {})) low[al] = Math.min(...ser.filter((r) => r[0].slice(0, 7) >= m).map((r) => r[1]));
    const roomT = sum('room'), u2 = sum('u2'), bey = sum('beyond');
    const ans = `<div class="ans">
      <div>① ${d ? `내수 ${sg(d)}t 바뀌면 → <b>순마다 ${sg(d / 3)}t 안팎만</b> 움직임` : '내수 물량 그대로 순마다 고르게 나눔'}. 수출·가전 ${n0(sum('x'))}t 은 그대로${moved >= 0.5 ? `(그중 ${n0(moved)}t 은 같은 달 다른 순으로 옮김)` : ''}.</div>
      <div>② ${roomT >= 50 ? `빈 룸 <b>${n0(roomT)}t</b> → 납기 ${+nextMon(m).slice(5)}월 이후 미결 수출 오더 ${n0(pT)}t(소재 확보 ${n0(pOk)}t)로 채움${pT < roomT ? ` — <b>오더 ${n0(roomT - pT)}t 모자람 → 수출·가전 수주를 더 받아 와야 함</b>` : ''}` : '빈 룸 없음'}.</div>
      <div>③ ${u2 >= 0.5 ? `<b>2CCL ${n0(u2)}t 가동 필요 → 사장님 결정</b>` : '2CCL 세움(나머지 CCL 로 소화)'}${bey >= 0.5 ? ` · <b>능력 초과 ${n0(bey)}t → 다음 달로</b>` : ''}. 지금 계획의 2CCL 가동 ${n0(u2now)}t.</div>
      <div>④ 도금 영향: 자가재 소요 ${sg(d * coef)}t(내수 1t 당 ${coef.toFixed(2)}t) — 자가재 몫을 고정하면 도금 판매재 룸은 그대로, 차이는 자가재 재고로 흡수. 지금 계획 자가재 최저 ${Object.entries(low).map(([a, v]) => `${a} ${sg(v)}t`).join(' · ')}.</div>
      <div>⑤ 상순 내수 비중: 지금 계획 ${share0.toFixed(0)}% → 순 고정 ${share1.toFixed(0)}%.</div></div>`;
    const tb = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">순</th><th>지금 내수</th><th>순 고정 내수</th><th>수출·가전(옮긴 뒤)</th><th>1·3·4CCL 능력</th><th>빈 룸(당길 오더)</th><th>2CCL 필요</th><th>지금 빈 룸</th></tr></thead><tbody>`
      + R.map((r) => `<tr><td class="l">${sunLab(r.s)}</td><td>${n0(r.d0)}</td><td><b>${n0(r.d1)}</b></td><td>${n0(r.x)}</td><td>${n0(r.cap)}</td><td>${r.room >= 0.5 ? n0(r.room) : '–'}</td><td class="${r.u2 >= 0.5 ? 'bad' : 'z'}">${r.u2 >= 0.5 ? n0(r.u2) : '–'}</td><td class="z">${n0(r.roomNow)}</td></tr>`).join('')
      + `<tr class="tot"><td class="l">합계</td><td>${n0(sum('d0'))}</td><td>${n0(sum('d1'))}</td><td>${n0(sum('x'))}</td><td>${n0(sum('cap'))}</td><td>${n0(roomT)}</td><td>${u2 >= 0.5 ? n0(u2) : '–'}</td><td>${n0(sum('roomNow'))}</td></tr></tbody></table></div>`;
    $('tc-r').innerHTML = ans + tb + `<p class="note">시험 계산 — 게시 계획은 바꾸지 않음. 능력 = 가용 시간 × 라인 평균 속도(${Object.entries(X.tph).map(([l, v]) => `${l} ${v}t/h`).join(' · ')}). 라인 전용 품목·도료 전환은 반영 안 함(실제 편성은 엔진).</p>`;
  }

  /* ---------- 판매그룹별 ---------- */
  function grpView() {
    const S = suns(), G = {};
    for (const l of CCL) for (const [s, c] of Object.entries(X.color[l] || {})) for (const [g, t] of Object.entries(c.g)) { const k = X.salesGrp[g] || g; (G[k] = G[k] || {})[s] = (G[k][s] || 0) + t; }
    const order = ['컬러수출', '컬러수출(가전내수)', '컬러건재판매', '수요개발'];
    const t1 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">판매그룹</th>${S.map((s) => `<th>${sunLab(s)}</th>`).join('')}</tr></thead><tbody>${order.filter((g) => G[g]).map((g) => `<tr><td class="l"><b>${g}</b></td>${S.map((s) => `<td>${G[g][s] >= 0.5 ? n0(G[g][s]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const SL = X.sales.C수출 || [], byM = {}; for (const r of X.pull.rows) byM[r.due.slice(0, 7)] = (byM[r.due.slice(0, 7)] || 0) + r.t;
    const t2 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">달</th><th>컬러수출 판매계획</th><th>미결 수주(남은 양)</th><th>더 받아야 할 양</th></tr></thead><tbody>${SL.filter((x) => x.m >= X.pull.from.slice(0, 7)).map((x) => { const o = byM[x.m] || 0, g = Math.max(0, x.sales - o); return `<tr><td class="l">${+x.m.slice(5)}월</td><td>${n0(x.sales)}</td><td>${n0(o)}</td><td class="${g >= 0.5 ? 'bad' : ''}">${g >= 0.5 ? n0(g) : '–'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const MN = {}; for (const r of X.pull.rows) { const k = r.man || '담당 미상', o = (MN[k] = MN[k] || { t: 0, n: 0, ok: 0, due: r.due, lines: new Set() }); o.t += r.t; o.n++; if (ST(r.st)[0] === 'ok') o.ok += r.t; if (r.due < o.due) o.due = r.due; if (r.line) o.lines.add(r.line); }
    const t3 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">담당</th><th>건수</th><th>남은 t</th><th>그중 소재 확보</th><th class="l">가장 이른 납기</th><th class="l">라인</th></tr></thead><tbody>${Object.entries(MN).sort((a, b) => b[1].t - a[1].t).map(([k, o]) => `<tr><td class="l"><b>${esc(k)}</b></td><td>${o.n}</td><td>${n0(o.t)}</td><td>${o.ok >= 0.5 ? n0(o.ok) : '–'}</td><td class="l">${md(o.due)}</td><td class="l">${[...o.lines].sort().join(' · ')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<section class="card"><h2>판매그룹 × 순 배정 <small>t · 이번 순은 오늘부터</small></h2><p class="q">컬러건재판매·가전내수·수요개발 = 순 단위로 정한 몫 · 컬러수출 = 빈 룸을 채우는 몫</p>${t1}</section>
      <section class="card"><h2>컬러수출 — 내가 언제까지 얼마를 받아 와야 하나 <small>판매계획(통합 계획) vs 미결 수주</small></h2>${t2}<p class="note">미결 수주 = MES 미결 컬러수출그룹 주문의 남은 양(납기 달 기준). 판매계획보다 모자란 만큼이 받아 와야 할 양 — 월초·월중 빈 룸에 넣도록 분산 수주.</p></section>
      <section class="card"><h2>담당자별 당길 수 있는 수출 오더 <small>납기 ${md(X.pull.from)} 이후 미결 · ${X.pull.rows.length}건</small></h2>${t3}</section>`;
  }

  function draw() {
    const v = CT.view('board', ['board', 'test', 'grp']), main = $('ct-main');
    main.innerHTML = v === 'test' ? testView() : v === 'grp' ? grpView() : board();
    if (v === 'board') { main.querySelectorAll('.rc[data-k]').forEach((b) => b.addEventListener('click', () => { SEL = b.dataset.k; main.querySelectorAll('.rc.on').forEach((x) => x.classList.remove('on')); b.classList.add('on'); detail(SEL); })); if (SEL) detail(SEL); }
    if (v === 'test') { ['tc-m', 'tc-d'].forEach((id) => $(id).addEventListener('input', testCalc)); testCalc(); }
    if (window.UI && UI.sub) UI.sub(`기준 ${md(X.today)} · 자료 ${String(X.built).slice(5, 16).replace('T', ' ')} · 11/18 사장님 회의 원칙`);
  }
  CT.onView(draw);
  CT.boot(['preview_ops.enc.json'], async (D) => {
    X = D.preview_ops; if (!X) { $('ct-main').innerHTML = '<section class="card"><h2>자료 없음</h2></section>'; return; }
    draw();
    try { EV = await CT.store.events(); draw(); } catch (e) { /* 공유 저장소 못 읽음 — 기록 없이 */ }
  });
})();
