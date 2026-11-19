/* 예시(통합안) 수주 조정 — 11/18 사장님 회의 원칙(gadong-plan docs/36)을 화면으로.
   (주별 가동표 탭은 11/19 사용자 '쓸모없어, 삭제' — 월차는 preview/wolcha.html)
   #test  시험 계산: 내수(건재 등)를 순 단위로 고르게 고정하고 ±물량을 바꿔 보면 → 수출·가전 그대로, 빈 룸 = 당길 오더, 넘치면 2CCL(사장님 결정), 도금 자가재 영향
   #grp   판매그룹별: 그룹 × 순 배정 · 컬러수출 수주 확보 · 담당자별 당길 수 있는 오더
   자료 = published/preview_ops.enc.json(gadong-plan tools/preview_build.py) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const n1 = (v) => (+v || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + n0(Math.abs(v));
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const SN = ['상순', '중순', '하순'];
  const isW = (s) => s && s[0] === 'W';
  const addD = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  const wkOf = (d) => { const t = new Date(Date.parse(d + 'T00:00:00Z')), w = (t.getUTCDay() + 6) % 7; return 'W' + addD(d, -w); };
  const wkLab = (s) => { const th = addD(s.slice(1), 3); return `${+th.slice(5, 7)}월 ${Math.ceil(+th.slice(8) / 7)}주`; };   // 주 이름 = 목요일이 속한 달의 몇째 주
  const wkRng = (s) => `${md(s.slice(1))}~${md(addD(s.slice(1), 6))}`;
  const sunLab = (s) => (isW(s) ? `${wkLab(s)}(${wkRng(s)})` : `${+s.slice(5, 7)}월 ${SN[+s.slice(8) - 1]}`);
  const sun = (d) => { const n = +d.slice(8, 10); return d.slice(0, 7) + (n <= 10 ? '-1' : n <= 20 ? '-2' : '-3'); };
  const sunEnd = (s) => { if (isW(s)) return addD(s.slice(1), 6); const y = +s.slice(0, 4), m = +s.slice(5, 7), k = +s.slice(8); return k === 1 ? `${s.slice(0, 7)}-10` : k === 2 ? `${s.slice(0, 7)}-20` : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const sunStart = (s) => isW(s) ? s.slice(1) : `${s.slice(0, 7)}-${['01', '11', '21'][+s.slice(8) - 1]}`;
  const nextMon = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  const CCL = ['1CCL', '3CCL', '4CCL', '2CCL'], CGL = ['1CGL', '2CGL'], MAIN = ['1CCL', '3CCL', '4CCL'];
  const ST = (st) => (/매치 완료|소재 있음/.test(st) ? ['ok', '소재 확보'] : /입고 대기/.test(st) ? ['wait', '소재 입고 대기'] : ['no', '소재 없음']);
  let X = null, EV = [], SEL = null;

  const suns = () => [...new Set([...Object.values(X.color), ...Object.values(X.cgl)].flatMap((o) => Object.keys(o)))].sort();
  const cc = (l, s) => ((isW(s) ? X.colorW : X.color)[l] || {})[s] || null;
  const cg = (l, s) => ((isW(s) ? X.cglW : X.cgl)[l] || {})[s];
  const weeks = () => [...new Set([...Object.values(X.colorW), ...Object.values(X.cglW)].flatMap((o) => Object.keys(o)))].sort();
  const sibs = (s) => { if (!isW(s)) return [1, 2, 3].map((k) => `${s.slice(0, 7)}-${k}`); const W = weeks(), i = W.indexOf(s); return W.slice(Math.max(0, i - 2), i + 3); };   // 옮길 수 있는 이웃 칸(순 = 같은 달 세 순, 주 = 앞뒤 2주)
  const mSibs = (s) => (isW(s) ? weeks().filter((w) => addD(w.slice(1), 3).slice(0, 7) === addD(s.slice(1), 3).slice(0, 7)) : [1, 2, 3].map((k) => `${s.slice(0, 7)}-${k}`));
  const room = (c) => (c ? Math.max(0, c.free != null ? c.free : c.cap - c.dom - c.exp) : 0);   // 빈 룸 = 남는 가동 시간 × 라인 평균 속도
  const used = (c) => (c ? c.dom + c.exp : 0);
  function selfAdj() {   // 자가재 재고 = 계획 + 결정한 판매재→자가재 전환(그 순 첫날부터 누적, 보류 제외)
    const add = {}; for (const e of EV) if (e.t === 'room' && e.kind === 'self' && stOf(e) !== '보류' && e.conv) { const k = e.al || (e.line === '1CGL' ? 'AZ' : 'MAC'); (add[k] = add[k] || []).push([sunStart(e.sun), e.conv]); }
    const out = {}; for (const [al, ser] of Object.entries(X.self || {})) out[al] = ser.map((r) => [r[0], r[1] + (add[al] || []).filter((x) => x[0] <= r[0]).reduce((a, x) => a + x[1], 0)]);
    return out;
  }
  function selfMin(s, adj) {   // 그 순 안 강종별 자가재 재고 최저(음수만)
    const a = sunStart(s), z = sunEnd(s), out = [];
    for (const [al, ser] of Object.entries(adj ? selfAdj() : X.self || {})) {
      let mn = null; for (const r of ser) if (r[0] >= a && r[0] <= z && (mn == null || r[1] < mn[1])) mn = r;
      if (mn && mn[1] < -0.5) out.push([al, mn[1], mn[0]]);
    }
    return out;
  }
  const PR = () => X.pull.rows.filter((r) => r.exp);   // 당길 오더 = 수출만(컬러수출그룹의 가전내수 주문은 내수 = 순 고정 몫)
  const pullFor = (line, s) => PR().filter((r) => (!line || r.line === line) && r.due > sunEnd(s));
  const decs = (key) => EV.filter((e) => e.t === 'room' && (!key || e.key === key));

  /* ---------- 결정(공유 저장소): {t:'room', key, kind, st, …} + 상태 바꿈 {t:'roomSt', ref, st} — 칸마다 마지막 결정이 판에 반영 ---------- */
  const DID = (e) => CT.issueId(`${e.at}|${e.by}|${e.key}`);
  const stOf = (e) => { let st = e.st || '제안'; for (const x of EV) if (x.t === 'roomSt' && x.ref === DID(e)) st = x.st; return st; };
  const DONE = (st) => st === '확정' || st === '사장님 승인';
  const decOf = (key) => { const L = decs(key).filter((e) => e.kind); return L.length ? Object.assign({}, L[L.length - 1], { st: stOf(L[L.length - 1]) }) : null; };
  const pulledSet = () => { const m = new Map(); for (const e of EV) if (e.t === 'room' && e.pulls && stOf(e) !== '보류') for (const [con] of e.pulls) m.set(con, e.key); return m; };
  const capOf = (c) => (c ? c.dom + c.exp + room(c) : 0);   // 능력 = 지금 배정 + 남는 시간
  function sugg(l, s) {   // 순 고정 몫(주 = 자료의 fair: 그 달 내수를 가용 분 비율로)
    if (isW(s)) return (cc(l, s) || {}).fair || 0;   // 순 = 그 라인 그 달 내수 합을 순별 능력 비율로
    const S = [1, 2, 3].map((k) => `${s.slice(0, 7)}-${k}`), C = S.map((x) => capOf(cc(l, x))), T = S.reduce((a, x) => a + ((cc(l, x) || {}).dom || 0), 0), CT_ = C.reduce((a, v) => a + v, 0);
    return CT_ ? T * C[S.indexOf(s)] / CT_ : 0;
  }
  const after = (l, s) => {   // 결정 반영 뒤 칸 값
    const c = cc(l, s); if (!c) return null; const d = decOf(`${l}|${s}`);
    if (!d || d.st === '보류' || d.kind !== 'adj') return { dom: c.dom, exp: c.exp + mvIn(l, s), cap: capOf(c), d };
    const pt = (d.pulls || []).reduce((a, x) => a + x[1], 0);
    return { dom: d.dom != null ? d.dom : c.dom, exp: c.exp + pt - (d.mv ? d.mv[1] : 0) + mvIn(l, s), cap: capOf(c), d };
  };
  function mvIn(l, s) {   // 다른 순에서 이 순으로 옮겨 온 수출(결정, 보류 제외)
    let t = 0; for (const x of sibs(s)) { const k = `${l}|${x}`, d = decOf(k); if (d && d.kind === 'adj' && d.st !== '보류' && d.mv && d.mv[0] === s) t += d.mv[1]; } return t;
  }
  const selfLine = (al) => (al === 'AZ' ? '1CGL' : '2CGL');
  function selfFrom(s, l) {   // 그 주부터 그 라인 강종 자가재 최저(음수만) — 전환은 부족이 시작되기 전에
    const out = []; for (const [al, ser] of Object.entries(X.self || {})) { if (selfLine(al) !== l) continue; let mn = null; for (const r of ser) if (r[0] >= sunStart(s) && (mn == null || r[1] < mn[1])) mn = r; if (mn && mn[1] < -0.5) out.push([al, mn[1], mn[0]]); }
    return out;
  }
  const ourPlan = (s) => sunEnd(s) >= '2027-01-01';   // 1월~ = 우리 계획(12월까지 = 판생 배포 그대로)
  const appl = (d) => d && (X.applied || []).includes(DID(d));
  const chip = (d) => (d ? `${appl(d) ? '<span class="chip ok">계획 반영</span> ' : ''}<span class="chip ${DONE(d.st) ? 'ok' : d.st === '보류' ? 'na' : d.st === '사장님 결정 요청' ? 'bad' : 'warn'}">${esc(d.st)}</span>` : '<span class="chip">미결정</span>');

  /* ---------- 시험 계산 ---------- */
  function testView() {
    const M = [...new Set(suns().map((s) => s.slice(0, 7)))].filter((m) => [1, 2, 3].every((k) => MAIN.some((l) => cc(l, `${m}-${k}`))));
    const m0 = M.includes(TM) ? TM : M[0];
    return `<section class="card"><h2>시험 계산 <small>내수 물량이 바뀌면 다른 라인과 도금은</small></h2>
      
      <div class="tc"><label>달 <select id="tc-m">${M.map((m) => `<option${m === m0 ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>내수 물량 변동 <input type="range" id="tc-d" min="-5000" max="5000" step="500" value="${TD}"> <output id="tc-o">${sg(TD)}t</output></label></div>
      <div id="tc-r"></div></section>`;
  }
  let TM = null, TD = 0;
  function testCalc() {
    const m = $('tc-m').value, d = +$('tc-d').value; TM = m; TD = d; $('tc-o').textContent = sg(d) + 't';
    const S = [1, 2, 3].map((k) => `${m}-${k}`);
    // 분 단위: 능력 = 가동 분(계획상 가동일), 내수·수출 분 = 그 순 품목의 실제 t/분으로 환산(라인 평균이 아님)
    const sumL = (s, Ls, k) => Ls.reduce((a, l) => a + ((cc(l, s) || {})[k] || 0), 0);
    const capM = S.map((s) => sumL(s, MAIN, 'availMin')), cap2M = S.map((s) => sumL(s, ['2CCL'], 'availMin'));
    const D0 = S.map((s) => sumL(s, CCL, 'dom')), X0 = S.map((s) => sumL(s, CCL, 'exp'));
    const dR = S.map((s) => { const m = sumL(s, MAIN, 'domMin'); return m > 1 ? sumL(s, MAIN, 'dom') / m : 0.2; }), xR = S.map((s) => { const m = sumL(s, MAIN, 'expMin'); return m > 1 ? sumL(s, MAIN, 'exp') / m : 0.2; });   // 1·3·4CCL 에서 실제로 나오는 t/분
    const u2now = S.reduce((a, s) => a + used(cc('2CCL', s)), 0);
    const roomNow = S.map((s) => MAIN.reduce((a, l) => a + room(cc(l, s)), 0));
    const calc = (dd) => {
    const TDsum = Math.max(0, D0.reduce((a, v) => a + v, 0) + dd), C1 = capM.reduce((a, v) => a + v, 0) || 1;
    const D1 = capM.map((c) => TDsum * c / C1), needM = S.map((s, i) => D1[i] / dR[i] + X0[i] / xR[i]);
    const cap1 = S.map((s, i) => capM[i] * xR[i]);   // 표시용 t(수출 속도 환산)
    // 넘치는 순의 수출은 같은 달 다른 순 빈 시간으로(가까운 순부터) → 그래도 넘치면 2CCL(사장님 결정) → 그 뒤 능력 초과
    const rmM = S.map((s, i) => Math.max(0, capM[i] - needM[i])), ovM = S.map((s, i) => Math.max(0, needM[i] - capM[i])), mvM = S.map(() => 0);
    S.forEach((s, i) => { [...S.keys()].filter((j) => j !== i).sort((a, b) => Math.abs(a - i) - Math.abs(b - i)).forEach((j) => { const t = Math.min(ovM[i], rmM[j]); ovM[i] -= t; rmM[j] -= t; mvM[i] -= t; mvM[j] += t; }); });
    // 2CCL 능력 = 2CCL 가동 분 × 2CCL 자체 속도(t) — 넘친 톤을 2CCL 로(가까운 순부터)
    const r2 = S.map((s) => { const c = cc('2CCL', s) || {}, m = (c.domMin || 0) + (c.expMin || 0); return m > 1 ? used(c) / m : ((X.tph || {})['2CCL'] || 14) / 60; });
    const ovT = ovM.map((v, i) => v * xR[i]), c2 = cap2M.map((v, i) => v * r2[i]), u2T = S.map(() => 0);
    S.forEach((s, i) => { [...S.keys()].sort((a, b) => Math.abs(a - i) - Math.abs(b - i)).forEach((j) => { const t = Math.min(ovT[i], c2[j]); ovT[i] -= t; c2[j] -= t; u2T[j] += t; }); });
    const R = S.map((s, i) => ({ s, d0: D0[i], d1: D1[i], x: X0[i] + mvM[i] * xR[i], cap: cap1[i], room: rmM[i] * xR[i], u2: u2T[i], beyond: ovT[i], roomNow: roomNow[i], mv: mvM[i] * xR[i] }));
      return R;
    };
    const R = calc(d), B0 = calc(0);   // 변동 0 결과(= 지금 계획의 2CCL·넘침)를 기준으로 맞춤 — 모델 오차가 결과에 섞이지 않게
    R.forEach((r, i) => { r.beyond = Math.max(0, r.beyond - B0[i].beyond); });
    const mv = R.map((r) => r.mv);
    const moved = mv.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const sum = (k) => R.reduce((a, r) => a + r[k], 0);
    const P = PR().filter((r) => r.due >= nextMon(m) + '-01'), pT = P.reduce((a, r) => a + r.t, 0), pOk = P.filter((r) => ST(r.st)[0] === 'ok').reduce((a, r) => a + r.t, 0);
    const mi = Math.max(0, (X.sales.C건재 || []).findIndex((x) => x.m === m)), coef = ((X.selfCoef || {}).C건재 || [0.65])[Math.min(mi, ((X.selfCoef || {}).C건재 || [0.65]).length - 1)] || 0.65;
    const share0 = sum('d0') ? R[0].d0 / sum('d0') * 100 : 0, share1 = sum('d1') ? R[0].d1 / sum('d1') * 100 : 0;
    let low = {}; for (const [al, ser] of Object.entries(X.self || {})) low[al] = Math.min(...ser.filter((r) => r[0].slice(0, 7) >= m).map((r) => r[1]));
    const roomT = sum('room'), u2 = sum('u2'), bey = sum('beyond');
    const ans = `<div class="ans">
      <div>① ${d ? `내수 ${sg(d)}t 바뀌면 → <b>순마다 ${sg(d / 3)}t 안팎만</b> 움직임` : '내수 물량 그대로 순마다 고르게 나눔'}. 수출·가전 ${n0(sum('x'))}t 은 그대로${moved >= 0.5 ? `(그중 ${n0(moved)}t 은 같은 달 다른 순으로 옮김)` : ''}.</div>
      <div>② ${roomT >= 50 ? `빈 룸 <b>${n0(roomT)}t</b> → 납기 ${+nextMon(m).slice(5)}월 이후 미결 수출 오더 ${n0(pT)}t(소재 확보 ${n0(pOk)}t)로 채움${pT < roomT ? `, <b>수출 주문 ${n0(roomT - pT)}t 더 받아야 함</b>` : ''}` : '빈 룸 없음'}.</div>
      <div>③ ${u2 >= 0.5 ? `<b>2CCL ${n0(u2)}t 가동(사장님 결정)</b>` : '2CCL 세움(나머지 CCL 로 소화)'}${bey >= 0.5 ? ` · <b>능력 초과 ${n0(bey)}t 다음 달로</b>` : ''}. 지금 계획의 2CCL 가동 ${n0(u2now)}t.</div>
      <div>④ 도금 영향: 자가재 소요 ${sg(d * coef)}t(내수 1t 당 ${coef.toFixed(2)}t). 지금 계획 자가재 최저 ${Object.entries(low).map(([a, v]) => `${a} ${sg(v)}t`).join(' · ')}.</div>
      <div>⑤ 상순 내수 비중: 지금 계획 ${share0.toFixed(0)}% → 순 고정 ${share1.toFixed(0)}%.</div></div>`;
    const tb = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">순</th><th>지금 내수</th><th>순 평균 내수</th><th>수출·가전</th><th>1·3·4CCL 능력(t)</th><th>여유</th><th>2CCL 필요</th><th>지금 여유</th></tr></thead><tbody>`
      + R.map((r) => `<tr><td class="l">${sunLab(r.s)}</td><td>${n0(r.d0)}</td><td><b>${n0(r.d1)}</b></td><td>${n0(r.x)}</td><td>${n0(r.cap)}</td><td>${r.room >= 0.5 ? n0(r.room) : '–'}</td><td class="${r.u2 >= 0.5 ? 'bad' : 'z'}">${r.u2 >= 0.5 ? n0(r.u2) : '–'}</td><td class="z">${n0(r.roomNow)}</td></tr>`).join('')
      + `<tr class="tot"><td class="l">합계</td><td>${n0(sum('d0'))}</td><td>${n0(sum('d1'))}</td><td>${n0(sum('x'))}</td><td>${n0(sum('cap'))}</td><td>${n0(roomT)}</td><td>${u2 >= 0.5 ? n0(u2) : '–'}</td><td>${n0(sum('roomNow'))}</td></tr></tbody></table></div>`;
    $('tc-r').innerHTML = ans + tb + ``;
  }

  /* ---------- 판매그룹별 ---------- */
  function grpView() {
    const S = suns(), G = {};
    for (const l of CCL) for (const [s, c] of Object.entries(X.color[l] || {})) for (const [g, t] of Object.entries(c.g)) { const k = X.salesGrp[g] || g; (G[k] = G[k] || {})[s] = (G[k][s] || 0) + t; }
    const order = ['컬러수출', '컬러수출(가전내수)', '컬러건재판매', '수요개발'];
    const t1 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">판매그룹</th>${S.map((s) => `<th>${sunLab(s)}</th>`).join('')}</tr></thead><tbody>${order.filter((g) => G[g]).map((g) => `<tr><td class="l"><b>${g}</b></td>${S.map((s) => `<td>${G[g][s] >= 0.5 ? n0(G[g][s]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const SL = X.sales.C수출 || [], byM = {}; for (const r of X.pull.rows) byM[r.due.slice(0, 7)] = (byM[r.due.slice(0, 7)] || 0) + r.t;
    const t2 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">달</th><th>컬러수출 판매계획</th><th>미결 수주(남은 양, 가전내수 포함)</th><th>더 받아야 할 양</th></tr></thead><tbody>${SL.filter((x) => x.m >= X.pull.from.slice(0, 7)).map((x) => { const o = byM[x.m] || 0, g = Math.max(0, x.sales - o); return `<tr><td class="l">${+x.m.slice(5)}월</td><td>${n0(x.sales)}</td><td>${n0(o)}</td><td class="${g >= 0.5 ? 'bad' : ''}">${g >= 0.5 ? n0(g) : '–'}</td></tr>`; }).join('')}</tbody></table></div>`;
    const MN = {}; for (const r of PR()) { const k = r.man || '담당 미상', o = (MN[k] = MN[k] || { t: 0, n: 0, ok: 0, due: r.due, lines: new Set() }); o.t += r.t; o.n++; if (ST(r.st)[0] === 'ok') o.ok += r.t; if (r.due < o.due) o.due = r.due; if (r.line) o.lines.add(r.line); }
    const t3 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">담당</th><th>건수</th><th>남은 t</th><th>그중 소재 확보</th><th class="l">가장 이른 납기</th><th class="l">라인</th></tr></thead><tbody>${Object.entries(MN).sort((a, b) => b[1].t - a[1].t).map(([k, o]) => `<tr><td class="l"><b>${esc(k)}</b></td><td>${o.n}</td><td>${n0(o.t)}</td><td>${o.ok >= 0.5 ? n0(o.ok) : '–'}</td><td class="l">${md(o.due)}</td><td class="l">${[...o.lines].sort().join(' · ')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<section class="card"><h2>판매그룹 × 순 배정 <small>t · 이번 순은 오늘부터</small></h2>${t1}</section>
      <section class="card"><h2>컬러수출 받아 올 주문 <small>판매계획 대비 주문</small></h2>${t2}</section>
      <section class="card"><h2>담당자별 당길 수 있는 수출 오더 <small>납기 ${md(X.pull.from)} 이후 미결 수출 · ${PR().length}건</small></h2>${t3}</section>`;
  }

  function draw() {
    const v = CT.view('test', ['test', 'grp']), main = $('ct-main');
    main.innerHTML = v === 'grp' ? grpView() : testView();
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
