/* 01 통합 관제(11/4 PRD 3장): 10초 안에 위험 인지, 30초 안에 우선 조치 결정
   핵심 지표 6 · 우선 조치(원인 × 판매그룹 묶음) · 수주 이행 흐름(도금·컬러 따로 — 중복 합산 금지) · 7일 전망 */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD, diff } = CT;
  let per = 7;
  try { per = +localStorage.getItem('ct-home-per') || 7; } catch (e) { /* 무시 */ }
  const FILES = ['portal.enc.json', 'latest.plan.enc.json', 'integrated.enc.json', 'mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'];

  function render(D) {
    const P = D.portal || {}, L = (D['latest.plan'] || {}).result || {}, W = D.integrated || {}, MO = D.mat_order || {};
    const M = CT.orders(D), asOf = M.asOf, until = addD(asOf, per);
    const open = M.all.filter((o) => o.risk !== '완료' && CT.inScope(o.pl));
    const inWin = (o) => !o.last || o.last <= until;
    const risk = open.filter((o) => o.risk === '위험' && inWin(o)), warn = open.filter((o) => o.risk === '주의' && inWin(o)), nd = open.filter((o) => o.risk === '판정 불가');
    const T = (xs) => xs.reduce((a, o) => a + (o.remT || 0), 0);

    // ① 기준일
    const rp = L.replan || {};
    const basis = CT.basis([
      { name: '도금 실적', at: P.asOf, kind: '실적' },
      { name: '컬러 실적', at: P.colorNow ? (D.portal.groups || []).find((g) => g.pl === 'C')?.prod?.asOf : null, kind: '실적' },
      { name: '도금 계획', at: rp.t0 || (D['latest.plan'] || {}).savedAt, kind: '재계획' },
      { name: '컬러 계획', at: W.built, kind: '확정 계획' },
      { name: '판생속보', at: (P.sr || {}).asOf, kind: '실적·계획' },
      { name: '도금 주문', at: M.cgAt, kind: '실적' },
      { name: '컬러 주문', at: M.ccAt, kind: M.ccMissing.length ? `${M.ccLines.join('·')}만` : '실적', ok: !M.ccMissing.length, tip: M.ccMissing.length ? `${M.ccMissing.join('·')} 자료 없음` : '' },
      { name: '소재', at: MO.today, kind: '추정' },
    ]);

    // ② 핵심 지표 6
    const lines = (P.lines || []).filter((x) => CT.inScope(x.pl));
    // 계획 누계: 도금 = 판생속보 라인 오늘까지 계획, 컬러 = 판생속보에 라인 계획이 없어 컬러 계획 편성(월 계획 − 남은 기간 계획)
    const cg = (P.groups || []).filter((g) => g.pl === 'C' && g.prod && CT.inScope('C'));
    const gl = lines.filter((x) => x.pl === 'G');
    const plan = gl.reduce((a, x) => a + (x.sched || 0), 0) + cg.reduce((a, g) => a + Math.max(0, (g.prod.month || 0) - (g.prod.after || 0)), 0);
    const act = gl.reduce((a, x) => a + (x.actual || 0), 0) + cg.reduce((a, g) => a + (g.prod.actual || 0), 0);
    const pr = plan ? Math.round(act / plan * 100) : null;
    const lag = gl.filter((x) => x.sched && x.actual < x.sched * 0.95);
    const mats = ((MO.groups || {}).mats || []).filter((m) => CT.inScope(m.plant) && m.short > 0 && (m.st === 'late' || m.st === 'soon'));
    const matOrd = open.filter((o) => o.cause === 'mat' && (o.risk === '위험' || o.risk === '주의'));
    const SG = { 도금판매: 'G', 도금수출: 'G', 자동차강판: 'G', 컬러수출: 'C', 컬러건재: 'C' };
    const ship = ((P.sr || {}).ship || []).filter((x) => SG[x.name] && CT.inScope(SG[x.name]));
    const shipGap = ship.reduce((a, x) => a + Math.max(0, (x.sched || 0) - (x.actual || 0)), 0), shipBad = ship.filter((x) => (x.sched || 0) - (x.actual || 0) > 0.5);
    const stk = ((P.sr || {}).stock || []).filter((x) => /제품/.test(x.name) && CT.inScope(/도금/.test(x.name) ? 'G' : 'C'));
    const over = stk.filter((x) => x.target && x.current > x.target);
    const K = [
      { label: '납기 위험', v: n0(risk.length), unit: '건', sub: `${n0(T(risk))}t · 주의 ${warn.length}건`, tone: risk.length ? 'bad' : 'ok', href: 'ct_orders.html' },
      { label: '계획 이행', v: pr == null ? '-' : pr, unit: '%', sub: `실적 ${n0(act)} / 계획 ${n0(plan)}t`, tone: pr == null ? '' : pr >= 98 ? 'ok' : pr >= 90 ? 'warn' : 'bad', href: 'ct_prod.html' },
      { label: '소재 부족', v: n0(mats.reduce((a, m) => a + m.short, 0)), unit: 't', sub: `${mats.length}개 소재 · 영향 주문 ${matOrd.length}건`, tone: mats.some((m) => m.st === 'late') ? 'bad' : mats.length ? 'warn' : 'ok', href: 'ct_mat.html' },
      { label: '생산 차질', v: lag.length, unit: '라인', sub: lag.length ? lag.map((x) => `${x.line} −${n0(x.sched - x.actual)}t`).join(' · ') : '계획 대비 95% 이상', tone: lag.length ? 'warn' : 'ok', href: 'ct_prod.html' },
      { label: '출하 위험', v: n0(shipGap), unit: 't', sub: shipBad.length ? `계획 누계 미달 ${shipBad.map((x) => x.name).join('·')}` : '계획 누계 충족', tone: shipGap > 500 ? 'bad' : shipGap > 0.5 ? 'warn' : 'ok', href: 'ct_prod.html' },
      { label: '제품 재고', v: n0(stk.reduce((a, x) => a + (x.current || 0), 0)), unit: 't', sub: over.length ? `목표 초과 ${over.map((x) => x.name.replace(/\(.*\)/, '')).join('·')}` : '목표 이내', tone: over.length ? 'warn' : 'ok', href: 'integrated.html' },
    ];

    // ③ 우선 조치: 원인 × 판매그룹 묶음 + 소재 마감 + 현장 예외
    const acts = [];
    const by = new Map();
    for (const o of risk.concat(warn)) {
      const k = `${o.cause}|${o.grp}`;
      if (!by.has(k)) by.set(k, { type: CT.CAUSE[o.cause], grp: o.grp, pl: o.pl, os: [], dept: o.dept, last: null, risk: '주의' });
      const a = by.get(k); a.os.push(o);
      if (o.last && (!a.last || o.last < a.last)) a.last = o.last;
      if (o.risk === '위험') a.risk = '위험';
    }
    for (const a of by.values()) acts.push({ risk: a.risk, type: a.type, what: `${a.grp} ${a.os.length}건`, n: a.os.length, t: T(a.os), last: a.last, dept: a.dept, os: a.os, href: 'ct_orders.html' });
    for (const m of mats) acts.push({ risk: m.st === 'late' ? '위험' : '주의', type: '소재 발주', what: `${m.name} 부족 ${n0(m.short)}t · ${md(m.first)}부터`, n: null, t: m.short, last: m.deadline, dept: CT.DEPT.mat, href: 'ct_mat.html' });
    for (const x of (P.exceptions || []).filter((x) => x.lvl === 'bad' || x.lvl === 'warn')) {
      if (!CT.inScope(/도금/.test(x.area) ? 'G' : /컬러/.test(x.area) ? 'C' : 'all')) continue;
      acts.push({ risk: x.lvl === 'bad' ? '위험' : '주의', type: x.area, what: x.text, n: null, t: null, last: null, dept: x.who, href: x.link });
    }
    acts.sort((a, b) => (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || String(a.last || '9').localeCompare(String(b.last || '9')) || (b.t || 0) - (a.t || 0));
    const left = (d) => (d == null ? '-' : diff(d, asOf) < 0 ? `<b class="ct-neg">${md(d)} · ${-diff(d, asOf)}일 지남</b>` : `${md(d)} <small class="ct-dd">D-${diff(d, asOf)}</small>`);
    const actRows = acts.slice(0, 14).map((a, i) => `<tr class="ck" data-i="${i}"><td>${CT.badge(a.risk)}</td><td class="nw"><b>${esc(a.type)}</b></td><td class="w">${esc(a.what)}</td><td class="r">${a.n == null ? '' : n0(a.n)}</td><td class="r">${a.t == null ? '' : n0(a.t)}</td><td class="nw">${left(a.last)}</td><td class="nw">${esc(a.dept || '')}</td><td class="nw"><span class="ct-new">신규</span></td></tr>`).join('');

    // ④ 수주 이행 흐름 — 도금·컬러 따로(도금 자가재 생산과 컬러 생산을 합치지 않음)
    const flow = (pl, nm) => {
      const os = M.all.filter((o) => o.pl === pl);
      if (!os.length || !CT.inScope(pl)) return '';
      const op = os.filter((o) => o.risk !== '완료');
      const st = (k) => os.filter((o) => (o.steps.find((s) => s.k === k) || {}).st === 'done');
      const prodK = pl === 'G' ? '도금 생산' : '컬러 생산';
      const cells = [
        ['수주 확정', `${n0(T(op))}<small>t 잔량</small>`, `${op.length}건 진행 중`],
        ['소재 확보', `${n0(op.filter((o) => o.matSt === '확보' || o.matSt === '재고 있음').length)}<small>건</small>`, `미확보 <b class="bad">${op.filter((o) => o.matSt !== '확보' && o.matSt !== '재고 있음').length}</b>건`],
        ['생산계획', `${n0(op.filter((o) => o.sche).length)}<small>건</small>`, `편성 없음 ${op.filter((o) => !o.sche).length}건`],
        ['생산 완료', `${n0(st(prodK).length)}<small>건</small>`, `생산 ${n0(os.reduce((a, o) => a + Math.min(o.prodT || 0, o.ordT || 0), 0))}t`],
        ['출하 완료', pl === 'G' ? `${n0(st('출하').length)}<small>건</small>` : '<small>자료 없음</small>', pl === 'G' ? `출하 ${n0(os.reduce((a, o) => a + (o.fwdT || 0), 0))}t` : '컬러 출하 연결 전'],
      ];
      return `<div class="ct-flh">${nm} <small>${pl === 'G' ? `납기 −30~+90일 주문 · ${md(M.cgAt)}` : `${M.ccLines.join('·')} 작업지시대상 · ${md(M.ccAt)}`}</small></div><div class="ct-flow">${cells.map(([l, v, s]) => `<div class="ct-fs"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>`;
    };

    // ⑤ 7일 전망: 날짜별 도금·컬러 계획 톤, 납기 필요 주문(위험), 주요 일정
    const days = Array.from({ length: 7 }, (_, i) => addD(asOf, i + 1));
    const gT = {}, cT = {};
    for (const r of L.rows || []) if (days.includes(r[0])) gT[r[0]] = (gT[r[0]] || 0) + (+r[4] || 0);
    for (const x of W.color || []) if (days.includes(x.d) && !x.act) cT[x.d] = (cT[x.d] || 0) + Object.values(x.g || {}).reduce((a, v) => a + v, 0);
    const ev = {}; for (const e of ((P.week || {}).events || [])) if (days.includes(e.d) && CT.inScope(e.pl)) (ev[e.d] = ev[e.d] || []).push(e.text);
    const dueOn = (d) => open.filter((o) => o.needProd === d);
    const WD = '일월화수목금토';
    const fc = `<table class="ct-t ct-fc"><thead><tr><th>날짜</th>${CT.inScope('G') ? '<th class="r">도금 계획</th>' : ''}${CT.inScope('C') ? '<th class="r">컬러 계획</th>' : ''}<th class="r">생산 필요 주문</th><th class="r">위험</th><th>주요 일정</th></tr></thead><tbody>`
      + days.map((d) => { const o = dueOn(d), r = o.filter((x) => x.risk === '위험');
        return `<tr><td class="nw"><b>${md(d)}</b> <small class="ct-wd">${WD[new Date(d + 'T00:00:00Z').getUTCDay()]}</small></td>${CT.inScope('G') ? `<td class="r">${n0(gT[d] || 0)}</td>` : ''}${CT.inScope('C') ? `<td class="r">${n0(cT[d] || 0)}</td>` : ''}<td class="r">${o.length ? `${o.length}건 · ${n0(T(o))}t` : '-'}</td><td class="r">${r.length ? `<b class="ct-neg">${r.length}</b>` : '-'}</td><td class="w">${esc((ev[d] || []).slice(0, 3).join(' · '))}${(ev[d] || []).length > 3 ? ` 외 ${ev[d].length - 3}` : ''}</td></tr>`; }).join('') + '</tbody></table>';

    const main = document.getElementById('ct-main');
    main.innerHTML = basis
      + `<div class="ct-bar">${CT.tabs('ct-per', [[1, '금일'], [7, '7일'], [30, '30일']], per)}<span class="ct-note">조치 마감 ${md(until)}까지 · ${({ all: '전체', G: '도금', C: '컬러' })[CT.scope()]}</span></div>`
      + CT.kpis(K)
      + `<section class="card"><h2>우선 조치 필요 <small>${acts.length}건 · 위험 → 마감 빠른 순</small></h2>${acts.length ? `<div class="ct-wrap"><table class="ct-t"><colgroup><col style="width:72px"><col style="width:150px"><col><col style="width:64px"><col style="width:84px"><col style="width:150px"><col style="width:120px"><col style="width:64px"></colgroup><thead><tr><th>위험</th><th>유형</th><th>대상</th><th class="r">주문</th><th class="r">톤</th><th>조치 마감</th><th>관리 부서</th><th>상태</th></tr></thead><tbody>${actRows}</tbody></table></div>${acts.length > 14 ? `<p class="ct-note">상위 14건 · 전체는 <a href="ct_issue.html">이슈·조정</a></p>` : ''}` : '<p class="ct-note">기간 안 조치 대상 없음</p>'}</section>`
      + `<section class="card"><h2>수주 이행 흐름</h2>${flow('G', '도금')}${flow('C', '컬러')}</section>`
      + `<section class="card"><h2>7일 전망 <small>계획 톤 · 생산 필요일이 그날인 주문</small></h2><div class="ct-wrap">${fc}</div></section>`
      + (nd.length ? `<p class="ct-note">판정 불가 ${nd.length}건 — 납기 등 자료 누락</p>` : '');
    main.querySelectorAll('#ct-per button').forEach((b) => b.onclick = () => { per = +b.dataset.k; try { localStorage.setItem('ct-home-per', per); } catch (e) { /* 무시 */ } render(D); });
    main.querySelectorAll('tr.ck').forEach((tr) => tr.onclick = () => {
      const a = acts[+tr.dataset.i];
      if (a.os) CT.panel(`<p class="ct-note">${esc(a.dept || '')} · 마감 ${md(a.last) || '-'}</p><table class="ct-t"><thead><tr><th>위험</th><th>주문</th><th class="r">잔량</th><th>마감</th></tr></thead><tbody>${a.os.sort(CT.riskSort).map((o, j) => `<tr class="ck" data-j="${j}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.item)}</small></td><td class="r">${n1(o.remT)}</td><td class="nw">${md(o.last) || '-'}</td></tr>`).join('')}</tbody></table>`, `${a.type} · ${a.grp || ''}`);
      else if (a.href) location.href = a.href;
      const p = document.getElementById('ct-panel');
      if (a.os && p) p.querySelectorAll('tr.ck').forEach((r) => r.onclick = () => { const o = a.os[+r.dataset.j]; CT.panel(CT.orderDetail(o), o.id); });
    });
  }
  CT.boot(FILES, render);
})();
