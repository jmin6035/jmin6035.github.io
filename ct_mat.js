/* 05 소재·재고 — 해당 주문·조치(11/11: 소재 관제 화면 안 카드 #mt-orders, 예전 ct_mat.html 은 소재 관제로 넘어감). 원천 = 소재 관제(mat_order: 소재별 3달 수급·발주 마감, 판매그룹별 사용) + 주문 모델(CT.orders) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const $ = (id) => document.getElementById(id), MAIN = 'mt-orders';
  if (!$(MAIN)) return;
  // 소재 관제 판매그룹 → 주문 판매그룹(CT.grpName). 도금 '자가재' = 컬러 부서 계약의 도금 주문
  const GMAP = { 도금수출: ['도금수출'], 도금국내: ['도금국내'], 자동차: ['자동차강판'], 자가재: ['자가재(컬러수출)', '자가재(컬러건재)', '자가재(수요개발)'],
    '컬러수출(건재)': ['컬러수출'], '컬러수출(가전)': ['컬러수출'], 가전내수: ['컬러수출'], '컬러건재 주문재': ['컬러건재'], '컬러건재 계획재': ['컬러건재'], 수요개발: ['수요개발'] };
  let showAll = false;

  function render(D) {
    const M = D.mat_order, OM = CT.orders(D);
    if (!M || !M.groups) { $(MAIN).innerHTML = ''; return; }   // 소재 관제 표가 '자료 없음'을 이미 알림
    const GV = M.groups;
    const usedBy = {};                                       // 소재 key → [{group, use}]
    for (const g of GV.groups || []) for (const m of g.mats || []) (usedBy[m.key] = usedBy[m.key] || []).push({ group: g.group, use: m.use });
    // 확인 = 도금 주문이 지금 소재 문제(입고 지연·미발주)이고 강종이 이 소재와 맞는 것. 추정 = 사용 판매그룹 주문 중 생산 필요일이 부족 시작 이후(그룹·시점)
    const fit = (m, o) => { const f = String((o.src && o.src.fam) || o.item || ''), t = `${o.item} ${(o.src && o.src.usgNm) || ''} ${(o.src && o.src.spec) || ''}`;
      return /AL용/.test(m.name) ? /^AL/.test(f) : /GI\/GL/.test(m.name) ? /AZ|MAC|GI/.test(f) : /SUS/.test(m.name) ? /STS|SUS/i.test(t) : false; };
    const live = (o) => !o.closed && !CT.isStale(o) && o.remT > 0.5;
    const mats = UI.matView(M).filter((m) => CT.inScope(m.plant)).map((m) => {   // 11/9: 상태·마감 = 공통 기준(ui/shell.js UI.matView)
      const gs = (usedBy[m.key] || []).filter((x) => x.use >= 1);
      const og = new Set(gs.flatMap((x) => GMAP[x.group] || [x.group]));
      const conf = m.plant === 'G' ? OM.G.filter((o) => live(o) && (o.src.lateIn || o.matSt === '미발주') && fit(m, o)) : [];
      const cs = new Set(conf.map((o) => o.id));
      const est = m.first ? OM.all.filter((o) => o.pl === m.plant && og.has(o.grp) && live(o) && o.needProd && o.needProd >= m.first && !cs.has(o.id)) : [];
      const sure = m.st === 'late';   // 11/9: 확정 = 발주 마감 지남 몫이 있는 소재(matLate) — 3달 총 부족 아님
      return { ...m, gs, conf, est, sure, oT: conf.concat(est).reduce((a, o) => a + o.remT, 0) };
    });
    const sh = mats.filter((m) => m.short > 0.5);
    const cA = new Map(), eA = new Map(); sh.forEach((m) => { m.conf.forEach((o) => cA.set(o.id, o)); m.est.forEach((o) => eA.set(o.id, o)); });
    cA.forEach((o, k) => eA.delete(k));
    // 11/11 개편: 소재 관제 안의 카드 — 상태·마감·부족 톤은 위 소재 표(같은 값)에 있으므로 여기는 '어느 주문이 걸리나 · 누가 조치'만
    const L = (showAll ? mats : sh).slice().sort((a, b) => (b.sure - a.sure) || (b.conf.length - a.conf.length) || ((a.deadline || '9') < (b.deadline || '9') ? -1 : 1));
    const tr = (m, i) => {
      const st = m.pos ? '<span class="ct-b ok" title="AL-STS 임가공 — 포스코가 소재 지급, 우리 발주 아님">포스코 지급</span>' : { late: '<span class="ct-b bad">마감 지남</span>', soon: '<span class="ct-b warn">2주 안 발주</span>', plan: '<span class="ct-b warn">발주 예정</span>' }[m.st] || '<span class="ct-b ok">충당</span>';   // 11/9: 상태 = 공통 기준
      return `<tr class="ck" data-i="${i}"><td class="id">${esc(m.name)} <span class="sub-i">${m.plant === 'G' ? '도금' : '컬러'}</span></td><td>${st}</td>`
        + `<td class="r">${m.short > 0.5 ? `<b class="${m.conf.length ? 'ct-neg' : ''}">${n0(m.conf.length)}</b>` : '-'}</td><td class="r">${m.short > 0.5 ? n0(m.est.length) : '-'}</td><td class="r">${m.oT >= 0.5 ? n0(m.oT) : '-'}</td>`
        + `<td>${m.short > 0.5 ? esc(CT.DEPT.mat) : '-'}</td><td>${m.short > 0.5 ? '<span class="ct-b na">미조치</span>' : '-'}</td></tr>`;
    };
    $(MAIN).innerHTML = `<section class="card"><div class="hd"><h2>해당 주문 · 조치 <small>부족 소재에 걸린 주문 — 확인 ${n0(cA.size)}건 · 추정 ${n0(eA.size)}건 · 줄을 누르면 주문 목록</small></h2>${CT.tabs('mt-all', [['s', '부족만'], ['a', '전체 소재']], showAll ? 'a' : 's')}</div>`
      + `<div class="ct-wrap"><table class="ct-t mt"><thead><tr><th>소재</th><th>상태</th><th class="r" title="도금 주문 중 지금 소재 문제(입고 지연·미발주)이고 강종이 이 소재와 맞는 것">확인(건)</th><th class="r" title="사용 판매그룹 주문 중 생산 필요일이 부족 시작 이후인 것">추정(건)</th><th class="r">주문 잔량(t)</th><th>담당부서</th><th>조치 상태</th></tr></thead>`
      + `<tbody>${L.map(tr).join('') || '<tr><td colspan="7">부족 소재 없음</td></tr>'}</tbody></table></div>`
      + `<p class="ct-note">기준 소재 관제 ${esc(UI.fmtDateTime(M.savedAt || M.today))} · 주문 ${esc(UI.fmtDateTime(OM.cgAt))}${OM.ccMissing.length ? ` · 컬러 주문 ${esc(OM.ccMissing.join('·'))} 없음` : ''}</p></section>`;
    $('mt-all').querySelectorAll('button').forEach((b) => b.onclick = () => { showAll = b.dataset.k === 'a'; render(D); });
    document.querySelectorAll(`#${MAIN} tr.ck`).forEach((r) => r.onclick = () => panel(L[+r.dataset.i]));
    CT.keyRows(document.getElementById(MAIN));
    if (location.hash === '#' + MAIN && !render.went) { render.went = true; (function go(n) { const el = $(MAIN); if (el.offsetParent && document.querySelector('#s-cal3 tbody')) el.scrollIntoView({ block: 'start' }); else if (n < 40) setTimeout(() => go(n + 1), 250); })(0); }   // 소재 관제 본문이 보이고 캘린더까지 그려진 뒤   // 옛 '소재 부족·조치' 주소로 들어온 경우
  }
  function panel(m) {
    const kv = (k, v) => `<div class="ct-kv"><span>${k}</span><b>${v}</b></div>`;
    const ol = (os, off) => os.slice(0, 200).map((o, i) => `<tr class="ck" data-i="${off + i}"><td>${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · 생산 필요 ${md(o.needProd)}${o.pl === 'G' ? ` · 소재 ${esc(o.matSt)}` : ''}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('');
    const cs = m.conf.slice().sort(CT.riskSort), es = m.est.slice().sort(CT.riskSort), all = cs.concat(es);
    const html = kv('상태', m.sure ? `<span class="ct-neg">마감 지남 ${n0(m.lateT)}t</span>` : m.short > 0.5 ? '부족 예상' : '충당')   // 11/9: 공통 기준
      + kv('3달 필요', `${n0(m.need)}t`) + kv('재고', `${n0(m.stock)}t`) + kv('입고 예정', `${n0(m.arr)}t`) + kv('3달 발주 필요', m.short ? `${n0(m.short)}t` : '-')
      + kv('부족 시작', m.first ? md(m.first) : '-') + kv('발주 마감', m.deadline ? `${md(m.deadline)}${m.sure ? ' 지남' : ''}` : '-') + (m.sure && m.next ? kv('다음 발주일', md(m.next)) : '') + kv('발주 규칙', esc(m.rule || '-')) + kv('공급사', esc((m.sup || []).filter(Boolean).join(' · ') || '-')) + kv('리드타임', `${m.lt}일${m.ltDef ? '(업체 기준정보 없음 — 기본)' : ''} + 투입 여유 ${m.safe || '-'}일`)
      + (m.gs.length ? `<h4>사용 판매그룹(3달)</h4>${m.gs.map((x) => kv(esc(x.group), `${n0(x.use)}t`)).join('')}` : '')
      + `<h4>해당 주문 — 확인 ${cs.length}건</h4>` + (cs.length ? `<table class="ct-t">${ol(cs, 0)}</table>` : '<p class="ct-note">없음</p>')
      + `<h4>해당 주문 — 추정 ${es.length}건</h4>` + (es.length ? `<table class="ct-t">${ol(es, cs.length)}</table>` : '<p class="ct-note">없음</p>');
    CT.panel(html, m.name, (p) => p.querySelectorAll('tr.ck').forEach((tr) => tr.onclick = () => { const o = all[+tr.dataset.i]; CT.panel(CT.orderDetail(o), o.id); }));
  }
  // 소재 관제가 암호를 저장한 뒤 불러옴(이 카드만 따로 암호 칸을 띄우지 않게)
  (function wait(n) { let pw = null; try { pw = localStorage.getItem('cgl-analysis-pw'); } catch (e) { /* 무시 */ }
    if (pw) CT.boot(['mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'portal.enc.json'], render, { main: MAIN });
    else if (n < 600) setTimeout(() => wait(n + 1), 1000); })(0);
})();
