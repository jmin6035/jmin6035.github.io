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
  /* 주 = 수요일 시작(11/5 사용자 '7일의 기준은 매주 수요일'). CT.wed(d) = d 가 속한 주의 수요일 */
  CT.wed = (s) => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); return CT.addD(s, -((d.getUTCDay() + 4) % 7)); };
  CT.diff = (a, b) => (a && b ? Math.round((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 864e5) : null);
  /* 기준일 = 마지막 자료를 받은 생산일(ui/shell.js UI.today — 모든 화면 공통, 11/8). 시계 날짜를 쓰지 않음 */
  CT.today = () => (window.UI && UI.today ? UI.today(CT.D && CT.D.cg_order_progress && CT.D.cg_order_progress.asOf) : new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));

  /* ---------- 자료 불러오기 ---------- */
  CT.boot = function (files, render, opt = {}) {
    const main = document.getElementById(opt.main || 'ct-main');
    main.innerHTML = '<section class="card lock"><div><div class="ic" aria-hidden="true">🔒</div><h2>불러오는 중…</h2>'
      + '<form class="unlock" id="ct-form" hidden><input type="password" id="ct-pw" placeholder="분석 암호" autocomplete="current-password" aria-label="분석 암호"><button type="submit">열기</button></form><p class="hint" id="ct-msg"></p></div></section>';
    const envs = Promise.all([...files.map((f) => GP.latest(f).catch(() => null)), window.UI && UI.ready ? UI.ready() : null]).then((E) => E.slice(0, files.length));   // 기준일(status) 받은 뒤 그림
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

  /* 계획 휴지 중인 라인의 경보 끄기(11/8 사용자 '2CCL 계획 휴지인데 이슈'): 휴지 달력 = 통합 계획 colorDown(하루 전체 계획 정지, 판생 배포·plan_conditions 반영).
     CT.idleSkip(D, text) = 실적 저하 경보('nCCL 지난주 …')의 라인이 기준일에 휴지이거나 지난주(월~일) 7일 중 3일 이상 휴지면 true */
  CT.idleSkip = (D, text) => {
    const m = /^([1-4]CCL) 지난주/.exec(String(text || '')), CD = D && D.integrated && D.integrated.colorDown; if (!m || !CD) return false;
    const off = new Set(CD.filter((x) => x[1] === m[1] && (+x[3] || 0) >= 1440).map((x) => x[0])), td = CT.today();
    const dow = (new Date(td + 'T00:00:00Z').getUTCDay() + 6) % 7, w0 = addD(td, -dow - 7);
    return off.has(td) || Array.from({ length: 7 }, (_, i) => addD(w0, i)).filter((d) => off.has(d)).length >= 3;
  };

  /* ---------- 주문 모델 ---------- */
  const GN = { 도금수출그룹: '도금수출', 도금판매그룹: '도금국내', 자동차강판판매그룹: '자동차강판', 컬러수출그룹: '컬러수출', 컬러건재판매그룹: '컬러건재', 수요개발그룹: '수요개발' };
  CT.grpName = (g) => GN[g] || g || '판매그룹 미확인';
  CT.CAUSE = { mat: '소재 입고 지연', match: '소재 매치 지연', paint: '도료 입고 지연', plate: '자가재(도금) 지연', cap: '생산 지연', ship: '출하 지연', data: '자료 확인' };
  /* 화면 표시 말(11/4 사용자 '원래 우리가 쓰는 말투로 · 위험이 뭐가 위험하다는 거냐') — 내부 값(o.risk·o.ful)은 그대로, 보이는 글자만 바꿈 */
  CT.RL = { 위험: '납기 지연 예상', 주의: '점검 필요', '판정 불가': '자료 확인 필요', 정상: '정상', 완료: '완료' };
  CT.FL = { '출하 확인 불가': '출하 실적 없음' };
  CT.rl = (r) => CT.RL[r] || r;
  CT.fl = (f) => CT.FL[f] || f;
  /* 주문 한 건이 '무엇이' 문제인지 */
  CT.tag = (o) => {
    if (!o || o.risk === '정상') return '정상';
    if (o.risk === '판정 불가') return /출하 실적/.test(o.dataWhy || '') ? '출하 미확인' : '자료 확인';   // 11/5: 생산은 끝났고 출하 실적만 안 이어진 주문(지연 아님)을 '자료 확인'과 분리
    if (o.risk === '주의') {
      if (o.cause === 'mat') return o.matSt === '미발주' ? '소재 발주 필요' : o.matSt === '입고 대기' ? '소재 입고 대기' : '소재 입고 확인';
      if (o.cause === 'plate') return '자가재(도금) 확인';
      return '점검 필요';
    }
    if (o.cause === 'mat' && o.matSt === '미발주') return '소재 미발주';
    if (o.cause === 'mat' && o.pl === 'C' && o.matSt === '미확보') return '소재 없음';
    return CT.CAUSE[o.cause] || '납기 지연 예상';
  };
  CT.DEPT = { mat: '구매(소재)', match: '생산기획(컬러 매치)', paint: '구매(도료)', plate: '도금 생산', cap: '생산기획', ship: '물류·출하', data: '수주(자료 확인)' };
  CT.RISK = ['위험', '주의', '판정 불가', '정상'];
  CT.FUL = ['생산 전', '생산 중', '출하 확인 불가', '부분 출하', '생산 완료', '출하 완료'];   // 생산 완료 = 자가재(출하 없음)
  const STALE = 60;   // 납기가 이만큼 지났는데 미종결이면 실제 위험보다 MES 종결 누락일 가능성이 커 '판정 불가'로 분리(11/4)
  CT.STAGE = ['수주 확정', '소재 확보', '작업 편성', '생산', '출하'];
  /* 포스코 진행 단계(11/5 사용자 '도금쪽 포스코 진행상황 어디 갔지 — 주문진도에 추가'): 예전 도금 주문진도(cg_order.js) 단계 띠와 같은 기준.
     x.stg = {포스코 공정명: 톤}(posco 주문진행), 입고 = entT. 공정 물량이 없으면 접수 전 / 착수 전 / 포스코 생산 끝·입고 전 / 미발주 */
  CT.PH = [['접수', ['요수배']], ['제강', ['출강대', 'SLAB']], ['열연', ['열연압연', '열연정정']], ['냉연', ['냉연대기', '3차압연', '소둔', '포스코 도금', '냉연정정', '판정대']],
    ['출하', ['입고대기', '운송지시대기', '운송', '유통기지 입고', '유통기지 출하지시', '유통기지 운송']], ['입고', []]];
  CT.posco = (x) => {
    const s = (x && x.stg) || {}, pt = CT.PH.map(([, L]) => L.reduce((a, nm) => a + (+s[nm] || 0), 0));
    pt[5] = (x && x.entT) || 0;
    const fill = (k) => CT.PH.map((_, i) => (i < k ? 'done' : 'todo'));
    let st, pre = null, cur = '';
    if ((x.remIn || 0) <= 0.5 && (x.entT || 0) >= 0.5) { st = fill(5); st[5] = 'in'; pre = '입고 끝'; }
    else if (Object.keys(s).length) {
      const first = pt.findIndex((v, i) => i < 5 && v >= 0.05);
      st = fill(first).map((v, i) => (i < 5 && pt[i] >= 0.05 ? 'cur' : v)); if (pt[5] >= 0.5) st[5] = 'in';
      cur = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([nm, t]) => `${nm} ${CT.n1(t)}t`).join(' · ');
    } else if ((x.entT || 0) >= 0.5) { st = fill(5); st[5] = 'in'; pre = '포스코 생산 끝 · 입고 중'; }   // 11/13: 입고가 시작됐는데 '포스코 접수 전'으로 나오던 것
    else if (x.runSt === 'done') { st = fill(5); st[4] = 'cur'; if (pt[5] >= 0.5) st[5] = 'in'; pre = '포스코 생산 끝 · 입고 전'; }
    else if (x.runRow) { st = fill(1); st[0] = 'cur'; pre = '포스코 착수 전'; }
    else { st = fill(0); pre = x.purT ? '포스코 접수 전' : '미발주'; }
    return { pt, st, pre, cur };
  };
  CT.poscoBar = (x) => { const P = CT.posco(x);
    return `<div class="pbar ph">${CT.PH.map(([nm]) => `<span>${nm}</span>`).join('')}</div><div class="pbar">${CT.PH.map(([nm, L], i) => `<span class="ps ${P.st[i]}" title="${CT.esc ? CT.esc(nm) : nm}${P.pt[i] >= 0.05 ? ` ${CT.n1(P.pt[i])}t` : ''}"></span>`).join('')}</div>`
      + `<div class="pn">${P.cur || P.pre || ''}</div>`; };
  /* 도금: 소재(F/H 발주·포스코 진행·입고) → 생산 → 출하. 생산 필요일 = 수출 출항 − 1 · 내수 납기 − 1, 필요 입고일 = 생산 필요일 − 5 (cg_order_progress 와 같음) */
  function gRow(x, asOf, CAL) {
    const ordT = x.ordT || x.purT || 0, prodT = Math.min(x.prodT || 0, ordT || x.prodT || 0), remT = Math.max(0, ordT - prodT);
    const needProd = x.dept ? addD(x.dept, -1) : x.due ? addD(x.due, -1) : null;
    const cal = CAL && CAL[x.con], sche = (cal && cal.to) || x.sche || null;
    const o = { id: x.con, pl: 'G', line: x.line || x.pline, grp: /^컬러|^수요/.test(CT.grpName(x.grp)) ? `자가재(${CT.grpName(x.grp)})` : CT.grpName(x.grp), grpEst: x.grpSrc && x.grpSrc !== '주문', item: [x.fam, x.pdt].filter(Boolean).join(' '), size: x.thk != null ? `${(+x.thk).toFixed(2)}×${CT.n0(x.wdt)}` : '',
      exp: !!x.exp, cus: x.cus, man: x.man, dst: x.dst, ordT, prodT, remT, due: x.due, ship: x.dept || x.arr || null, needProd, needIn: x.needIn, sche, eta: x.eta, entT: x.entT || 0, remIn: x.remIn || 0,
      fwdT: x.fwdT || 0, purT: x.purT || 0, purDt: ymd8(x.purDt), dle: x.dle, stage: x.stage, src: x };
    // 단계(주문 추적)
    o.steps = [
      { k: '수주 확정', st: 'done', d: null },
      { k: '소재 확보', st: x.remIn <= 0.5 && (x.entT || 0) >= 0.5 ? 'done' : x.purT ? 'cur' : 'todo', d: x.entFirst || x.eta || null, plan: x.needIn, note: x.purT ? `F/H 발주 ${CT.n1(x.purT)}t · 입고 ${CT.n1(x.entT || 0)}t` : '미발주' },
      { k: '작업 편성', st: x.woN || cal ? 'done' : prodT ? 'done' : 'todo', d: cal ? cal.from : null, note: x.woN ? `작업지시 ${x.woN}코일` : cal ? `${cal.line || ''} ${CT.n1(cal.t)}t` : '' },
      { k: '도금 생산', st: x.st === '생산 완료' ? 'done' : prodT ? 'cur' : 'todo', d: x.prodLast || sche, plan: needProd, note: `${CT.n1(prodT)} / ${CT.n1(ordT)}t` },
      { k: '출하', st: o.fwdT >= ordT - 0.5 && ordT ? 'done' : o.fwdT ? 'cur' : 'todo', d: x.fwdLast, plan: x.due, note: o.fwdT ? `출하 ${CT.n1(o.fwdT)}t` : '출하 실적 연결 없음' },
    ];
    o.matSt = o.steps[1].st === 'done' ? '확보' : x.lateIn ? '지연' : x.purT ? '진행' : '미발주';
    o.prodSt = x.st;
    // 위험 판정(PRD 13): 완료 → 출하 지연 → 소재 → 능력·순서 → 자료
    // 이행 단계(위험 등급과 별개, 11/4 2차 진단 2.1): 생산 완료 ≠ 납기 이행. 출하 실적이 이어지지 않은 완료 주문은 '출하 확인 불가'(출하 완료로 추정하지 않음)
    const pDone = x.st === '생산 완료' || (ordT && prodT >= ordT - Math.min(0.5, ordT * 0.05));   // 11/5: 1t 미만 주문이 생산 0 인데 완료로 잡히던 것(허용 오차 0.5t 고정) → 주문량 5% 와 0.5t 중 작은 값
    const shipBase = Math.min(ordT || 0, Math.max(prodT, x.prodT || 0)) || ordT;   // 11/5: 생산 완료 처리된 주문은 '생산한 만큼' 다 나갔으면 출하 완료(주문량보다 적게 끝난 주문이 '부분 출하'로 잡히던 것)
    const self = /^자가재\(/.test(o.grp);                                         // 11/8 사용자: 자가재(컬러 투입용 도금)는 출하가 없음 → 생산 끝나면 완료(출하 지연 경보 제외)
    o.ful = pDone ? (self ? '생산 완료' : ordT && o.fwdT >= shipBase - Math.min(0.5, shipBase * 0.05) ? '출하 완료' : o.fwdT > 0.5 ? '부분 출하' : '출하 확인 불가') : prodT > 0.5 ? '생산 중' : '생산 전';
    o.unshipT = self ? 0 : pDone ? Math.max(0, shipBase - o.fwdT) : ordT - o.fwdT;       // 미출하량(출하 실적 기준) — 출하 확인 불가면 과대일 수 있음
    o.closed = o.ful === '출하 완료' || o.ful === '생산 완료';
    if (o.closed) o.risk = '정상';
    else if (pDone && x.due && x.due < asOf) { o.risk = o.fwdT > 0.5 ? '위험' : '판정 불가'; o.cause = o.fwdT > 0.5 ? 'ship' : 'data'; o.dataWhy = o.fwdT > 0.5 ? '' : '생산 완료 · 출하 실적 연결 없음'; o.last = asOf; }
    else if (pDone) o.risk = '정상';
    else if (!x.due) { o.risk = '판정 불가'; o.cause = 'data'; o.dataWhy = '납기 없음'; }
    else if (!ordT) { o.risk = '판정 불가'; o.cause = 'data'; o.dataWhy = '주문량 없음'; }
    else if (CT.diff(x.due, asOf) < -STALE) { o.risk = '판정 불가'; o.cause = 'data'; o.stale = true; o.dataWhy = `납기 ${STALE}일 이상 경과 · MES 미종결(종결 처리 확인)`; }
    else if (x.lateIn) { o.risk = '위험'; o.cause = 'mat'; o.last = x.needIn; }
    else if (x.st === '미발주' && prodT < 0.5) { o.risk = x.needIn && CT.diff(x.needIn, asOf) <= 35 ? '위험' : '주의'; o.cause = 'mat'; o.last = x.needIn; }   // 11/5: 소재 미발주인데 '생산 지연'으로 나오던 것 — 원인은 소재
    else if (sche && needProd && sche > needProd && remT > 0.5) { o.risk = '위험'; o.cause = 'cap'; o.last = needProd; }
    else if (x.hurry || x.chk) { o.risk = '주의'; o.cause = 'mat'; o.last = x.needIn; }
    else if (x.st === '미발주') { o.risk = x.needIn && CT.diff(x.needIn, asOf) <= 35 ? '위험' : '주의'; o.cause = 'mat'; o.last = x.needIn; }
    else o.risk = '정상';
    o.etaDone = pDone ? x.prodLast : sche || null;
    o.etaSrc = pDone ? '실적' : cal ? '생산 캘린더(편성)' : x.sche ? '도금 생산예정(재계획)' : null;
    return o;
  }
  let O_hasShip = true;
  /* 컬러: 소재(재고기반 규격 재고 / 소재 발주 / 자가재 = 도금 주문) → 매치 → 작업예정 → 생산. 생산 필요일 = 납기 */
  function cRow(x, asOf, G) {
    const selfG = x.self && G[x.self];
    const o = { id: x.con, pl: 'C', line: x.line, grp: CT.grpName(x.grp), grpEst: x.grpSrc && x.grpSrc !== '주문', item: x.pdtNm || x.spec || ''   /* 11/12 사용자: 품목 = 품명 약호(PGS 등) + 규격 — 상도 도료 코드(G762310039 등)는 빼고 */, size: x.thk != null ? `${(+x.thk).toFixed(2)}×${CT.n0(x.wdt)}` : '',
      exp: x.exp, man: x.man, ordT: x.ordT, prodT: x.prodT, remT: x.remT, due: x.due, needProd: x.due, sche: x.sche, can: x.can, mchT: x.mchT, matT: x.matT, woT: x.woT, route: x.route, self: x.self, po: x.po, src: x };
    o.steps = [
      { k: '수주 확정', st: 'done' },
      { k: '소재 확보', st: x.endShort || x.st === '매치 완료' ? 'done' : x.mchUsedT > 0.05 ? 'cur' : x.st === '소재 없음' ? 'todo' : 'cur',   // 11/5: 생산에 이미 쓴 매치 소재도 보임
        note: [x.mchUsedT > 0.05 ? `매치 소재 ${CT.n1(x.mchUsedT)}t 생산에 사용` : '', x.endShort ? '' : x.st === '매치 완료' ? `남은 매치 ${CT.n1(x.mchT)}t` : x.st === '소재 있음' ? `규격 재고 ${CT.n1(x.matT)}t(매치 전)` : x.st === '입고 대기' ? (x.self ? `자가재 ${x.self}` : `소재 발주 ${(x.po && x.po.no) || ''}`) : `남은 ${CT.n1(x.remT)}t 소재 없음`].filter(Boolean).join(' · ') },
      { k: '자가재(도금)', st: !x.self ? 'na' : selfG ? (selfG.ful !== '생산 전' && selfG.ful !== '생산 중' ? 'done' : 'cur') : 'todo', note: x.self ? (selfG ? `${selfG.ful} · ${CT.n1(selfG.prodT)}/${CT.n1(selfG.ordT)}t` : '도금 주문 정보 없음') : '해당 없음' },
      { k: '작업 편성', st: x.woT || x.woDoneT > 0.05 ? 'done' : x.sche ? 'cur' : 'todo', d: x.sche, plan: x.due, note: [x.woDoneT > 0.05 ? `지시 완료 ${CT.n1(x.woDoneT)}t` : '', x.woT ? `진행 지시 ${CT.n1(x.woT)}t` : '', !x.woT && x.can ? `가동가능 ${CT.md(x.can)}` : ''].filter(Boolean).join(' · ') },
      { k: '컬러 생산', st: x.endShort || x.prodT >= x.ordT - 0.5 ? 'done' : x.prodT ? 'cur' : 'todo', d: x.sche, plan: x.due, note: `${CT.n1(x.prodT)} / ${CT.n1(x.ordT)}t${x.endShort ? ` · 잔량 ${CT.n1(x.remT)}t 미생산 마감(MES 종결 전)` : ''}` },
      { k: '출하', st: x.fwdT > 0.5 ? (x.fwdT >= x.prodT - Math.min(0.5, x.prodT * 0.05) && (x.endShort || x.prodT >= x.ordT - 0.5) ? 'done' : 'cur') : 'todo', d: x.fwdLast, plan: x.due, note: x.fwdT > 0.5 ? `출하 ${CT.n1(x.fwdT)}t` : '출하 실적 없음' },   // 11/5: 컬러도 MES 출고 실적을 코일번호로 연결
    ];
    o.matSt = x.st === '매치 완료' ? '확보' : x.st === '소재 있음' ? '재고 있음' : x.st === '입고 대기' ? '입고 대기' : '미확보';
    o.prodSt = x.prodT ? '생산 중' : x.woT ? '지시됨' : '생산 전';
    const soon = x.due && CT.diff(x.due, asOf) <= 14;
    const pDone = x.endShort || (x.ordT && x.prodT >= x.ordT - Math.min(0.5, x.ordT * 0.05));
    const shipped = (x.fwdT || 0) >= x.prodT - Math.min(0.5, x.prodT * 0.05);
    o.fwdT = x.fwdT || 0;
    o.ful = pDone ? (x.fwdT > 0.5 ? (shipped ? '출하 완료' : '부분 출하') : '출하 확인 불가') : x.prodT > 0.5 ? '생산 중' : '생산 전';
    o.unshipT = pDone ? Math.max(0, x.prodT - (x.fwdT || 0)) : null; o.closed = o.ful === '출하 완료';
    if (o.closed) { o.risk = '정상'; if (x.endShort) o.note = `잔량 ${CT.n1(x.remT)}t 미생산 마감 — MES 종결 처리 필요`; }
    else if (pDone && o.ful === '부분 출하' && x.due && x.due < asOf) { o.risk = '위험'; o.cause = 'ship'; o.last = asOf; }
    else if (pDone) { o.risk = x.due && x.due < asOf ? '판정 불가' : '정상'; if (o.risk === '판정 불가') { o.cause = 'data'; o.dataWhy = '생산 완료 · 출하 실적 연결 없음'; } }
    else if (!x.due) { o.risk = '판정 불가'; o.cause = 'data'; o.dataWhy = '납기 없음'; }
    else if (CT.diff(x.due, asOf) < -STALE) { o.risk = '판정 불가'; o.cause = 'data'; o.stale = true; o.dataWhy = `납기 ${STALE}일 이상 경과 · MES 미종결(종결 처리 확인)`; }
    else if (selfG && selfG.risk === '위험' && x.st !== '매치 완료') { o.risk = '위험'; o.cause = 'plate'; o.last = selfG.last || addD(x.due, -8); }
    else if (x.lateCan) { o.risk = '위험'; o.cause = /도료/.test(x.canBy || '') ? 'paint' : 'mat'; o.last = x.can; }   // 11/5: 매치 끝났는데 도료가 늦는 주문을 '소재 입고 지연'으로 부르던 것
    else if (x.st === '소재 없음') { o.risk = x.lateDue || soon ? '위험' : '주의'; o.cause = 'mat'; o.last = addD(x.due, -7); }
    else if (x.sche && x.sche > x.due) { o.risk = '위험'; o.cause = 'cap'; o.last = x.due; }
    else if (x.lateDue) { o.risk = '위험'; o.cause = x.st === '매치 완료' ? 'cap' : x.st === '소재 있음' ? 'match' : 'mat'; o.last = asOf; }   // 11/5: 규격 재고가 있는데 매치 안 된 주문 = '소재 매치 지연'(입고 문제 아님)
    else if (x.st === '입고 대기') { o.risk = '주의'; o.cause = x.self ? 'plate' : 'mat'; o.last = addD(x.due, -7); }
    else o.risk = '정상';
    o.etaDone = x.sche || null;
    o.etaSrc = x.sche ? 'MES 작업예정일' : null;
    return o;
  }
  CT.orders = function (D) {
    const cg = D.cg_order_progress, cc = D.cc_order_progress, CAL = D.cg_calendar && D.cg_calendar.contracts;
    const asOf = CT.today();   // 공통 기준일(11/8) — 주문 진도 자료일(cg.asOf)과 같음
    O_hasShip = !!(cg && cg.hasShip);
    const G = (cg ? cg.rows : []).filter((x) => /^P/.test(x.con)).map((x) => gRow(x, asOf, CAL));   // 옛 계약번호 체계(G…) 제외
    const GI = Object.fromEntries(G.map((o) => [o.id, o]));
    const C = (cc ? cc.rows : []).map((x) => cRow(x, asOf, GI));
    const all = G.concat(C);
    all.forEach((o) => { o.dept = o.cause ? CT.DEPT[o.cause] : null; o.left = o.last ? CT.diff(o.last, asOf) : null; });
    return { asOf, all, G, C, ccLines: cc ? cc.lines : [], ccMissing: cc ? cc.missing : ['1CCL', '2CCL', '3CCL', '4CCL'], cgAt: cg && cg.asOf, ccAt: cc && cc.asOf };
  };
 /* 종결 확인 필요(11/8 사용자): 납기 60일 넘게 지난 미종결 주문 — 실제 위험보다 MES 종결 누락. 잔량·지연 집계에서 빼고 따로 목록 */
  /* 미결 정의(11/10 — 납기 위험 tools/risk_build.py 와 같은 계약·행번 집합): 종결(출하 완료·자가재 생산 완료) 아님 + (생산 끝남 = 출하 대기 | 생산 잔량 0.5t 이상).
     생산 잔량 0.5t 미만 끝자락(컬러 소량 잔량·주문량 0 행)은 미결에서 뺌. 건 = 계약번호-행번 */
  CT.MIN_REM = 0.5;
  CT.pDone = (o) => o.ful !== '생산 전' && o.ful !== '생산 중';
  CT.isOpen = (o) => !!o && !o.closed && (CT.pDone(o) || (+o.remT || 0) >= CT.MIN_REM);
  CT.isStale = (o) => !!(o && o.stale && CT.isOpen(o));
  CT.riskSort = (a, b) => (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || ((a.left == null ? 999 : a.left) - (b.left == null ? 999 : b.left)) || (b.remT - a.remT);

  /* ---------- 화면 부품 ---------- */
  const RC = { 위험: 'bad', 주의: 'warn', '판정 불가': 'na', 정상: 'ok', 완료: 'done' };
  CT.badge = (x) => (x && typeof x === 'object' ? `<span class="ct-b ${RC[x.risk] || 'na'}" title="${esc(x.dataWhy || '')}">${esc(CT.tag(x))}</span>` : `<span class="ct-b ${RC[x] || 'na'}">${esc(CT.rl(x))}</span>`);
  /* 왜 그런지 한 줄(날짜 근거) */
  CT.why = (o) => {
    const d = CT.md;
    if (o.cause === 'data') return o.dataWhy || '자료 확인';
    if (o.cause === 'mat') return o.pl === 'G' ? `입고 필요 ${d(o.needIn || o.last) || '-'} · ${o.matSt}` : `소재 ${o.matSt} · 납기 ${d(o.due)}`;
    if (o.cause === 'cap') return `편성 ${d(o.sche) || '-'} > 생산 필요 ${d(o.needProd) || '-'}`;
    if (o.cause === 'plate') return `자가재 ${o.self || ''} 진행 지연`;
    if (o.cause === 'match') return `규격 재고 있음 · 미매치 · 납기 ${d(o.due)}`;
    if (o.cause === 'paint') return `도료 입고 ${d(o.src.can)} > 납기 ${d(o.due)}`;
    if (o.cause === 'ship') return `납기 ${d(o.due)} 경과 · 미출하 ${CT.n1(o.unshipT || 0)}t`;
    return '';
  };
  CT.badgeT = (r, txt) => `<span class="ct-b ${RC[r] || 'na'}">${esc(txt)}</span>`;   // 등급 색 + 무엇이 문제인지 글자
  CT.leftTxt = (o) => (o.left == null ? '' : o.left < 0 ? `<b class="ct-neg">${-o.left}일 지남</b>` : o.left === 0 ? '<b class="ct-neg">오늘</b>' : `D-${o.left}`);
  /* 기준일 띠: [{name, at, kind: 실적|확정계획|재계획|추정, ok}]
     11/8 날짜 통일: 기준일보다 뒤 시각(= 계산·게시 시각)은 그 계산이 쓴 자료 시각(기준일 자료)으로 보여 줌 — 계산 시각은 말풍선 */
  CT.basis = (items) => { const B = window.UI && UI.basis && UI.basis(), td = CT.today();
    const at = (x) => { if (!x.at) return ['없음', '']; const s = String(x.at).replace('T', ' '); if (s.slice(0, 10) > td) return [B ? B.at : CT.md(td), `계산 ${CT.md(s)} ${s.slice(11, 16)}`]; return [CT.md(s) + (s.length > 10 ? ' ' + s.slice(11, 16) : ''), '']; };
    return `<div class="ct-basis">${items.filter(Boolean).filter((x) => CT.inScope(x.pl || (/^도금|CGL/.test(x.name) ? 'G' : /^컬러|CCL/.test(x.name) ? 'C' : 'all'))).map((x) => { const [a, tp] = at(x); return `<span class="ct-bs ${x.ok === false ? 'bad' : ''}" title="${esc([x.tip, tp].filter(Boolean).join(' · '))}"><b>${esc(x.name)}</b> ${esc(a)}${x.kind ? ` <i>${esc(x.kind)}</i>` : ''}</span>`; }).join('')}</div>`; };
  /* 핵심 지표: [{k, label, v, unit, sub, tone: bad|warn|ok, href}] */
  CT.kpis = (L) => `<div class="ct-kpis">${L.map((x) => `<${x.href ? `a href="${x.href}"` : 'div'} class="ct-kpi ${x.tone || ''}"><div class="l">${esc(x.label)}</div><div class="v">${x.v}<small>${esc(x.unit || '')}</small></div>${x.sub ? `<div class="s">${x.sub}</div>` : ''}</${x.href ? 'a' : 'div'}>`).join('')}</div>`;
  CT.tabs = (id, L, cur) => `<div class="seg ct-seg" id="${id}">${L.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === cur}">${esc(n)}</button>`).join('')}</div>`;
  /* 오른쪽 상세 패널(2차 진단 11.1): 뒤로(이전 상세) · 닫으면 연 줄로 포커스 복원 · Esc 닫기. CT.panel(html, title, bind) — bind(p) 로 패널 안 클릭 연결 */
  let stack = [], opener = null;
  CT.panel = function (html, title, bind, keep) {
    let p = document.getElementById('ct-panel');
    if (!p) { p = document.createElement('aside'); p.id = 'ct-panel'; p.className = 'ct-panel'; p.setAttribute('aria-label', '상세'); p.setAttribute('role', 'dialog'); document.body.appendChild(p);
      addEventListener('keydown', (e) => { if (e.key === 'Escape' && p.classList.contains('open')) CT.panel(null); }); }
    if (html == null) { p.classList.remove('open'); stack = []; if (opener && opener.focus) opener.focus(); opener = null; return; }
    if (!p.classList.contains('open')) { stack = []; opener = document.activeElement; }
    if (!keep) stack.push([html, title, bind]);
    p.innerHTML = `<div class="ct-ph">${stack.length > 1 ? '<button type="button" class="ct-x ct-back" aria-label="뒤로">←</button>' : ''}<b>${esc(title || '')}</b><button type="button" class="ct-x ct-close" aria-label="닫기">✕</button></div><div class="ct-pb">${html}</div>`;
    p.querySelector('.ct-close').onclick = () => CT.panel(null);
    const bk = p.querySelector('.ct-back'); if (bk) bk.onclick = () => { stack.pop(); const t = stack[stack.length - 1]; CT.panel(t[0], t[1], t[2], true); };
    if (bind) bind(p);
    CT.keyRows(p);
    p.classList.add('open'); p.querySelector('.ct-close').focus();
  };
  /* 줄 키보드 조작: tr.ck · .ck 에 Enter/Space = 클릭 */
  CT.keyRows = (root) => (root || document).querySelectorAll('.ck').forEach((el) => {
    if (el.dataset.kb) return; el.dataset.kb = '1'; if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });
  /* 하위 화면 = 주소 #뒤 이름(메뉴 탭과 같은 것 — 화면 안에 탭을 또 두지 않음, 2차 진단 3장) */
  CT.view = (def, L) => { const h = (location.hash || '').slice(1); return L && !L.includes(h) ? def : h || def; };
  CT.onView = (fn) => addEventListener('hashchange', fn);
  /* 이슈 id·상태(06 이슈·조정과 공유): 키 'ord|cause|pl|grp' · 'mat|소재키' · 'exc|문구', 상태 이벤트 {t:'issue', id, st} */
  CT.issueId = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return 'I-' + (h >>> 0).toString(36).toUpperCase().slice(0, 6); };
  CT.issueState = (evs) => { const m = {}; for (const e of evs || []) if (e && e.t === 'issue' && e.id && e.st) m[e.id] = e.st; return m; };
  CT.fulBadge = (f) => `<span class="ct-f ${{ '출하 완료': 'ok', '생산 완료': 'ok', '부분 출하': 'warn', '출하 확인 불가': 'na', '생산 중': 'mid', '생산 전': 'pre' }[f] || 'na'}">${esc(CT.fl(f))}</span>`;
  /* 공유 저장(결정 기록과 같은 저장소 — 암호화한 이벤트 추가만): 이슈 상태·조치 이력 */
  const API = 'https://gatcqxrzaonjsixajrwd.supabase.co/rest/v1/cgl_decisions', KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const PW = () => { try { return localStorage.getItem(PW_KEY); } catch (e) { return null; } };
  CT.me = () => { try { return localStorage.getItem('cgl-me') || ''; } catch (e) { return ''; } };
  CT.store = {
    async events() {
      const all = [];
      for (let off = 0; ; off += 1000) {                       // 1,000줄씩 끝까지(한 번에 받는 줄 수 제한)
        const r = await fetch(API + `?select=id,payload&order=id.asc&limit=1000&offset=${off}`, { headers: H });
        if (!r.ok) throw new Error('공유 저장소 읽기 실패 ' + r.status);
        const part = await r.json(); all.push(...part);
        if (part.length < 1000) break;
      }
      const out = [], pw = PW();
      for (const x of all) { try { out.push(await GP.decryptJSON(JSON.parse(x.payload), pw)); } catch (e) { /* 다른 암호 */ } }
      return out;
    },
    async push(ev) {
      const env = await GP.encryptJSON(Object.assign({ at: new Date().toISOString(), by: CT.me() || '이름 없음' }, ev), PW(), 'decision');
      const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ payload: JSON.stringify(env) }) });
      if (!r.ok) throw new Error('저장 실패 ' + r.status);
    },
  };
  /* 주문 상세(패널 안) — 모든 화면이 같은 모양 */
  CT.orderDetail = (o) => {
    const kv = (k, v) => (v == null || v === '' ? '' : `<div class="ct-kv"><span>${esc(k)}</span><b>${v}</b></div>`);
    const st = { done: '완료', cur: '진행', todo: '대기', na: '해당 없음' };
    return `<div class="ct-pd-h">${CT.badge(o)} ${CT.fulBadge(o.ful)} ${o.cause ? `<span class="ct-cause">${esc(CT.why(o))}</span>` : ''}</div>`
      + kv('판매그룹', esc(o.grp) + (o.grpEst ? ' <small>(추정)</small>' : '')) + kv('공정·라인', `${o.pl === 'G' ? '도금' : '컬러'} ${esc(o.line || '')}`) + kv('품목', esc(o.item)) + kv('두께×폭', esc(o.size))
      + kv('고객사', esc(o.cus || '')) + kv('담당', esc(o.man || '')) + kv('수주량', CT.n1(o.ordT) + 't') + kv('생산', CT.n1(o.prodT) + 't') + kv('잔량', CT.n1(o.remT) + 't')
      + kv('미출하', o.unshipT == null ? ((o.fwdT || 0) > 0.5 ? `- <small>출하 ${CT.n1(o.fwdT)}t</small>` : '출하 실적 없음') : CT.n1(o.unshipT) + 't') + kv('생산 완료 예정', o.etaDone ? `${CT.md(o.etaDone)} <small>${esc(o.etaSrc || '')}</small>` : '') + kv('납기', CT.md(o.due)) + kv(o.pl === 'G' ? '출항·입항' : '', o.ship ? CT.md(o.ship) : '') + kv('생산 필요일', CT.md(o.needProd)) + kv('조치 마감일', o.last ? `${CT.md(o.last)} ${CT.leftTxt(o)}` : '') + kv('조치 부서', esc(o.dept || ''))
      + `<h4>주문 추적</h4><ol class="ct-tl">${o.steps.map((s) => `<li class="${s.st}"><div class="t"><b>${esc(s.k)}</b><span>${s.st === 'na' && /출하/.test(s.k) ? '실적 없음' : st[s.st]}</span></div><div class="d">${s.d ? `실제·예정 ${CT.md(s.d)}` : ''}${s.plan ? ` · 필요 ${CT.md(s.plan)}` : ''}</div>${s.note ? `<div class="n">${esc(s.note)}</div>` : ''}</li>`).join('')}</ol>`;
  };
})();
