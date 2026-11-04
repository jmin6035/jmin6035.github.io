/* 통합 관제(Control Tower 2.0) 공통 — 11/4 사용자 '전면 개편, 지금 자료로 되는 것 전부'(gadong-plan/docs/22)
   CT.boot(files, render): 암호 → 게시 파일 여러 개 복호화 → render(D)
   CT.orders(D): 도금 주문진도 + 컬러 주문·납기 → 한 주문 모델(위험 등급·원인 5가지·마지막 조정일·담당 부서)
   CT.head / CT.kpis / CT.badge / CT.panel: 화면 공통 부품 — 모든 새 화면이 같은 모양을 쓰게 */
(function () {
  'use strict';
  const CT = window.CT = {};
  const PW_KEY = 'cgl-analysis-pw';
  const esc = CT.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CT.n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  CT.n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
  CT.md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const ymd8 = (s) => (s && /^\d{8}$/.test(String(s)) ? `${String(s).slice(0, 4)}-${String(s).slice(4, 6)}-${String(s).slice(6, 8)}` : s || null);
  const addD = CT.addD = (s, n) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  CT.diff = (a, b) => (a && b ? Math.round((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 864e5) : null);
  CT.today = () => new Date(Date.now() + 9 * 3600e3 - 7 * 3600e3).toISOString().slice(0, 10);   // 생산일(07시 기준, 한국 시각)

  /* ---------- 자료 불러오기 ---------- */
  CT.boot = function (files, render, opt = {}) {
    const main = document.getElementById(opt.main || 'ct-main');
    main.innerHTML = '<section class="card lock"><div><div class="ic" aria-hidden="true">🔒</div><h2>불러오는 중…</h2>'
      + '<form class="unlock" id="ct-form" hidden><input type="password" id="ct-pw" placeholder="분석 암호" autocomplete="current-password" aria-label="분석 암호"><button type="submit">열기</button></form><p class="hint" id="ct-msg"></p></div></section>';
    const envs = Promise.all(files.map((f) => GP.latest(f).catch(() => null)));
    async function unlock(pw) {
      const E = await envs, D = {};
      if (!E.some(Boolean)) { document.getElementById('ct-msg').textContent = '게시된 자료가 없습니다.'; return; }
      try {
        for (let i = 0; i < files.length; i++) D[files[i].replace(/\.enc\.json$/, '')] = E[i] ? await GP.decryptJSON(E[i], pw) : null;
        try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      } catch (e) { document.getElementById('ct-form').hidden = false; document.getElementById('ct-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
      CT.D = D;
      const go = () => { try { render(D); } catch (e) { console.error(e); main.innerHTML = `<section class="card"><h2>화면 계산 오류</h2><p class="small">${esc(e.message)}</p></section>`; } if (window.UI && UI.reveal) UI.reveal(main); };
      go(); if (window.UI && UI.onScope) UI.onScope(go);
    }
    document.getElementById('ct-form').addEventListener('submit', (e) => { e.preventDefault(); unlock(document.getElementById('ct-pw').value); });
    envs.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else document.getElementById('ct-form').hidden = false; });
  };
  CT.scope = () => (window.UI && UI.scope ? UI.scope() : 'all');
  CT.inScope = (pl) => { const s = CT.scope(); return s === 'all' || s === pl; };

  /* ---------- 주문 모델 ---------- */
  const GN = { 도금수출그룹: '도금수출', 도금판매그룹: '도금국내', 자동차강판판매그룹: '자동차강판', 컬러수출그룹: '컬러수출', 컬러건재판매그룹: '컬러건재', 수요개발그룹: '수요개발' };
  CT.grpName = (g) => GN[g] || g || '판매그룹 모름';
  CT.CAUSE = { mat: '소재 미확보', plate: '도금 지연 → 컬러', cap: '생산 능력·순서', ship: '출하 지연', data: '판정 불가(자료)' };
  CT.DEPT = { mat: '구매(소재)', plate: '도금 생산', cap: '생산기획', ship: '물류·출하', data: '수주(자료 확인)' };
  CT.RISK = ['위험', '주의', '판정 불가', '정상', '완료'];
  CT.STAGE = ['수주 확정', '소재 확보', '작업 편성', '생산', '출하'];
  /* 도금: 소재(F/H 발주·포스코 진행·입고) → 생산 → 출하. 생산 필요일 = 수출 출항 − 1 · 내수 납기 − 1, 필요 입고일 = 생산 필요일 − 5 (cg_order_progress 와 같음) */
  function gRow(x, asOf, CAL) {
    const ordT = x.ordT || x.purT || 0, prodT = Math.min(x.prodT || 0, ordT || x.prodT || 0), remT = Math.max(0, ordT - prodT);
    const needProd = x.dept ? addD(x.dept, -1) : x.due ? addD(x.due, -1) : null;
    const cal = CAL && CAL[x.con], sche = (cal && cal.to) || x.sche || null;
    const o = { id: x.con, pl: 'G', line: x.line || x.pline, grp: CT.grpName(x.grp), grpEst: x.grpSrc && x.grpSrc !== '주문', item: [x.fam, x.pdt].filter(Boolean).join(' '), size: x.thk != null ? `${(+x.thk).toFixed(2)}×${CT.n0(x.wdt)}` : '',
      exp: !!x.exp, cus: x.cus, man: x.man, dst: x.dst, ordT, prodT, remT, due: x.due, ship: x.dept || x.arr || null, needProd, needIn: x.needIn, sche, eta: x.eta, entT: x.entT || 0, remIn: x.remIn || 0,
      fwdT: x.fwdT || 0, purT: x.purT || 0, purDt: ymd8(x.purDt), dle: x.dle, stage: x.stage, src: x };
    // 단계(주문 추적)
    o.steps = [
      { k: '수주 확정', st: 'done', d: null },
      { k: '소재 확보', st: x.remIn <= 0.5 && (x.entT || 0) >= 0.5 ? 'done' : x.purT ? 'cur' : 'todo', d: x.entFirst || x.eta || null, plan: x.needIn, note: x.purT ? `F/H 발주 ${CT.n1(x.purT)}t · 입고 ${CT.n1(x.entT || 0)}t` : '미발주' },
      { k: '작업 편성', st: x.woN || cal ? 'done' : prodT ? 'done' : 'todo', d: cal ? cal.from : null, note: x.woN ? `작업지시 ${x.woN}코일` : cal ? `${cal.line || ''} ${CT.n1(cal.t)}t` : '' },
      { k: '도금 생산', st: x.st === '생산 완료' ? 'done' : prodT ? 'cur' : 'todo', d: x.prodLast || sche, plan: needProd, note: `${CT.n1(prodT)} / ${CT.n1(ordT)}t` },
      { k: '출하', st: o.fwdT >= ordT - 0.5 && ordT ? 'done' : o.fwdT ? 'cur' : 'todo', d: x.fwdLast, plan: x.due, note: o.fwdT ? `${CT.n1(o.fwdT)}t` : '' },
    ];
    o.matSt = o.steps[1].st === 'done' ? '확보' : x.lateIn ? '지연' : x.purT ? '진행' : '미발주';
    o.prodSt = x.st;
    // 위험 판정(PRD 13): 완료 → 출하 지연 → 소재 → 능력·순서 → 자료
    // 출하: 완료 주문 581건 중 출하가 이어진 것 15건뿐(11/4) — 출하 연결이 없는 완료 주문은 '완료'로 보고, 일부만 출하된 채 납기 지난 것만 출하 지연
    if (x.st === '생산 완료' && !(o.fwdT > 0.5 && o.fwdT < ordT - 0.5 && x.due && x.due < asOf)) { o.risk = '완료'; }
    else if (x.st === '생산 완료') { o.risk = '위험'; o.cause = 'ship'; o.last = asOf; }
    else if (!x.due) { o.risk = '판정 불가'; o.cause = 'data'; }
    else if (x.lateIn) { o.risk = '위험'; o.cause = 'mat'; o.last = x.needIn; }
    else if (sche && needProd && sche > needProd && remT > 0.5) { o.risk = '위험'; o.cause = 'cap'; o.last = needProd; }
    else if (x.hurry || x.chk) { o.risk = '주의'; o.cause = 'mat'; o.last = x.needIn; }
    else if (x.st === '미발주') { o.risk = x.needIn && CT.diff(x.needIn, asOf) <= 35 ? '위험' : '주의'; o.cause = 'mat'; o.last = x.needIn; }
    else o.risk = '정상';
    o.etaDone = o.risk === '완료' ? x.prodLast : sche || null;
    return o;
  }
  let O_hasShip = true;
  /* 컬러: 소재(재고기반 규격 재고 / 소재 발주 / 자가재 = 도금 주문) → 매치 → 작업예정 → 생산. 생산 필요일 = 납기 */
  function cRow(x, asOf, G) {
    const selfG = x.self && G[x.self];
    const o = { id: x.con, pl: 'C', line: x.line, grp: CT.grpName(x.grp), grpEst: x.grpSrc && x.grpSrc !== '주문', item: [x.top, x.spec].filter(Boolean).join(' '), size: x.thk != null ? `${(+x.thk).toFixed(2)}×${CT.n0(x.wdt)}` : '',
      exp: x.exp, man: x.man, ordT: x.ordT, prodT: x.prodT, remT: x.remT, due: x.due, needProd: x.due, sche: x.sche, can: x.can, mchT: x.mchT, matT: x.matT, woT: x.woT, route: x.route, self: x.self, po: x.po, src: x };
    o.steps = [
      { k: '수주 확정', st: 'done' },
      { k: '소재 확보', st: x.st === '매치 완료' ? 'done' : x.st === '소재 없음' ? 'todo' : 'cur', note: x.st === '매치 완료' ? `매치 ${CT.n1(x.mchT)}t` : x.st === '소재 있음' ? `규격 재고 ${CT.n1(x.matT)}t(매치 전)` : x.st === '입고 대기' ? (x.self ? `자가재 ${x.self}` : `소재 발주 ${(x.po && x.po.no) || ''}`) : '소재 없음' },
      { k: '자가재(도금)', st: !x.self ? 'na' : selfG ? (selfG.risk === '완료' ? 'done' : 'cur') : 'todo', note: x.self ? (selfG ? `${selfG.prodSt} · ${CT.n1(selfG.prodT)}/${CT.n1(selfG.ordT)}t` : '도금 주문 정보 없음') : '해당 없음' },
      { k: '작업 편성', st: x.woT ? 'done' : x.sche ? 'cur' : 'todo', d: x.sche, plan: x.due, note: x.woT ? `지시 ${CT.n1(x.woT)}t` : x.can ? `가동가능 ${CT.md(x.can)}` : '' },
      { k: '컬러 생산', st: x.prodT >= x.ordT - 0.5 ? 'done' : x.prodT ? 'cur' : 'todo', d: x.sche, plan: x.due, note: `${CT.n1(x.prodT)} / ${CT.n1(x.ordT)}t` },
      { k: '출하', st: 'todo', note: '출하 자료 없음' },
    ];
    o.matSt = x.st === '매치 완료' ? '확보' : x.st === '소재 있음' ? '재고 있음' : x.st === '입고 대기' ? '입고 대기' : '미확보';
    o.prodSt = x.prodT ? '생산 중' : x.woT ? '지시됨' : '생산 전';
    const soon = x.due && CT.diff(x.due, asOf) <= 14;
    if (!x.due) { o.risk = '판정 불가'; o.cause = 'data'; }
    else if (selfG && selfG.risk === '위험' && x.st !== '매치 완료') { o.risk = '위험'; o.cause = 'plate'; o.last = selfG.last || addD(x.due, -8); }
    else if (x.lateCan) { o.risk = '위험'; o.cause = 'mat'; o.last = x.can; }
    else if (x.st === '소재 없음') { o.risk = x.lateDue || soon ? '위험' : '주의'; o.cause = 'mat'; o.last = addD(x.due, -7); }
    else if (x.sche && x.sche > x.due) { o.risk = '위험'; o.cause = 'cap'; o.last = x.due; }
    else if (x.lateDue) { o.risk = '위험'; o.cause = x.st === '매치 완료' ? 'cap' : 'mat'; o.last = asOf; }
    else if (x.st === '입고 대기') { o.risk = '주의'; o.cause = x.self ? 'plate' : 'mat'; o.last = addD(x.due, -7); }
    else o.risk = '정상';
    o.etaDone = x.sche || null;
    return o;
  }
  CT.orders = function (D) {
    const cg = D.cg_order_progress, cc = D.cc_order_progress, CAL = D.cg_calendar && D.cg_calendar.contracts;
    const asOf = (cg && cg.asOf) || (cc && cc.asOf) || CT.today();
    O_hasShip = !!(cg && cg.hasShip);
    const G = (cg ? cg.rows : []).filter((x) => /^P/.test(x.con)).map((x) => gRow(x, asOf, CAL));   // 옛 계약번호 체계(G…) 제외
    const GI = Object.fromEntries(G.map((o) => [o.id, o]));
    const C = (cc ? cc.rows : []).map((x) => cRow(x, asOf, GI));
    const all = G.concat(C);
    all.forEach((o) => { o.dept = o.cause ? CT.DEPT[o.cause] : null; o.left = o.last ? CT.diff(o.last, asOf) : null; });
    return { asOf, all, G, C, ccLines: cc ? cc.lines : [], ccMissing: cc ? cc.missing : ['1CCL', '2CCL', '3CCL', '4CCL'], cgAt: cg && cg.asOf, ccAt: cc && cc.asOf };
  };
  CT.riskSort = (a, b) => (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || ((a.left == null ? 999 : a.left) - (b.left == null ? 999 : b.left)) || (b.remT - a.remT);

  /* ---------- 화면 부품 ---------- */
  const RC = { 위험: 'bad', 주의: 'warn', '판정 불가': 'na', 정상: 'ok', 완료: 'done' };
  CT.badge = (r) => `<span class="ct-b ${RC[r] || 'na'}">${esc(r)}</span>`;
  CT.leftTxt = (o) => (o.left == null ? '' : o.left < 0 ? `<b class="ct-neg">${-o.left}일 지남</b>` : o.left === 0 ? '<b class="ct-neg">오늘</b>' : `D-${o.left}`);
  /* 기준일 띠: [{name, at, kind: 실적|확정계획|재계획|추정, ok}] */
  CT.basis = (items) => `<div class="ct-basis">${items.filter(Boolean).map((x) => `<span class="ct-bs ${x.ok === false ? 'bad' : ''}" title="${esc(x.tip || '')}"><b>${esc(x.name)}</b> ${esc(x.at ? CT.md(x.at) + (String(x.at).length > 10 ? ' ' + String(x.at).slice(11, 16) : '') : '없음')}${x.kind ? ` <i>${esc(x.kind)}</i>` : ''}</span>`).join('')}</div>`;
  /* 핵심 지표: [{k, label, v, unit, sub, tone: bad|warn|ok, href}] */
  CT.kpis = (L) => `<div class="ct-kpis">${L.map((x) => `<${x.href ? `a href="${x.href}"` : 'div'} class="ct-kpi ${x.tone || ''}"><div class="l">${esc(x.label)}</div><div class="v">${x.v}<small>${esc(x.unit || '')}</small></div>${x.sub ? `<div class="s">${x.sub}</div>` : ''}</${x.href ? 'a' : 'div'}>`).join('')}</div>`;
  CT.tabs = (id, L, cur) => `<div class="seg ct-seg" id="${id}">${L.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === cur}">${esc(n)}</button>`).join('')}</div>`;
  /* 오른쪽 상세 패널 */
  CT.panel = function (html, title) {
    let p = document.getElementById('ct-panel');
    if (!p) { p = document.createElement('aside'); p.id = 'ct-panel'; p.className = 'ct-panel'; p.setAttribute('aria-label', '상세'); document.body.appendChild(p);
      addEventListener('keydown', (e) => { if (e.key === 'Escape') CT.panel(null); }); }
    if (html == null) { p.classList.remove('open'); return; }
    p.innerHTML = `<div class="ct-ph"><b>${esc(title || '')}</b><button type="button" class="ct-x" aria-label="닫기">✕</button></div><div class="ct-pb">${html}</div>`;
    p.querySelector('.ct-x').onclick = () => CT.panel(null);
    p.classList.add('open'); p.querySelector('.ct-x').focus();
  };
  /* 주문 상세(패널 안) — 모든 화면이 같은 모양 */
  CT.orderDetail = (o) => {
    const kv = (k, v) => (v == null || v === '' ? '' : `<div class="ct-kv"><span>${esc(k)}</span><b>${v}</b></div>`);
    const st = { done: '완료', cur: '진행', todo: '대기', na: '해당 없음' };
    return `<div class="ct-pd-h">${CT.badge(o.risk)} ${o.cause ? `<span class="ct-cause">${esc(CT.CAUSE[o.cause])}</span>` : ''}</div>`
      + kv('판매그룹', esc(o.grp) + (o.grpEst ? ' <small>(추정)</small>' : '')) + kv('공정·라인', `${o.pl === 'G' ? '도금' : '컬러'} ${esc(o.line || '')}`) + kv('품목', esc(o.item)) + kv('두께×폭', esc(o.size))
      + kv('고객사', esc(o.cus || '')) + kv('담당', esc(o.man || '')) + kv('수주량', CT.n1(o.ordT) + 't') + kv('생산', CT.n1(o.prodT) + 't') + kv('잔량', CT.n1(o.remT) + 't')
      + kv('납기', CT.md(o.due)) + kv(o.pl === 'G' ? '출항·입항' : '', o.ship ? CT.md(o.ship) : '') + kv('생산 필요일', CT.md(o.needProd)) + kv('마지막 조정일', o.last ? `${CT.md(o.last)} ${CT.leftTxt(o)}` : '') + kv('담당 부서', esc(o.dept || ''))
      + `<h4>주문 추적</h4><ol class="ct-tl">${o.steps.map((s) => `<li class="${s.st}"><div class="t"><b>${esc(s.k)}</b><span>${st[s.st]}</span></div><div class="d">${s.d ? `실제·예정 ${CT.md(s.d)}` : ''}${s.plan ? ` · 필요 ${CT.md(s.plan)}` : ''}</div>${s.note ? `<div class="n">${esc(s.note)}</div>` : ''}</li>`).join('')}</ol>`;
  };
})();
