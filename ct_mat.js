/* 04 소재·재고 — 부족·조치(11/4 통합 관제 개편, docs/22). 원천 = 소재 관제(mat_order: 소재별 3달 수급·발주 마감, 판매그룹별 사용) + 주문 모델(CT.orders) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const $ = (id) => document.getElementById(id);
  // 소재 관제 판매그룹 → 주문 판매그룹(CT.grpName). 도금 '자가재' = 컬러 부서 계약의 도금 주문
  const GMAP = { 도금수출: ['도금수출'], 도금국내: ['도금국내'], 자동차: ['자동차강판'], 자가재: ['자가재(컬러수출)', '자가재(컬러건재)', '자가재(수요개발)'],
    '컬러수출(건재)': ['컬러수출'], '컬러수출(가전)': ['컬러수출'], 가전내수: ['컬러수출'], '컬러건재 주문재': ['컬러건재'], '컬러건재 계획재': ['컬러건재'], 수요개발: ['수요개발'] };
  let showAll = false;

  function render(D) {
    const M = D.mat_order, OM = CT.orders(D);
    if (!M || !M.groups) { $('ct-main').innerHTML = '<section class="card"><h2>소재 부족·조치</h2><p class="ct-note">소재 관제 자료가 없습니다 — 매일 아침 자동 점검 뒤 채워집니다.</p></section>'; return; }
    const GV = M.groups;
    const usedBy = {};                                       // 소재 key → [{group, use}]
    for (const g of GV.groups || []) for (const m of g.mats || []) (usedBy[m.key] = usedBy[m.key] || []).push({ group: g.group, use: m.use });
    const today = CT.today(), dataAt = M.today || OM.cgAt;
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
    const tT = (L) => n0(L.reduce((a, m) => a + m.short, 0));
    // 개수 대신 어떤 소재가 어느 판매그룹에 걸리는지(11/5 사용자 '3개 소재 말고 어떤 그룹인지') — 판매그룹은 사용량 큰 순 1개(+n)
    const gn = (m) => { const g = m.gs.slice().sort((a, b) => b.use - a.use).map((x) => x.group); return g.length ? `${g[0]}${g.length > 1 ? ` 외 ${g.length - 1}` : ''}` : (m.plant === 'G' ? '도금' : '컬러'); };
    const names = (L) => (L.length ? L.map((m) => `${esc(m.name)}<small>(${esc(gn(m))})</small>`).join(' · ') : '없음');
    const LT = UI.matLate(M.late);                           // 발주 마감 지남 = 공통 기준(ui/shell.js UI.matLate, 11/8)
    const kp = CT.kpis([
      { label: '3달 발주 필요', v: tT(sh), unit: 't', tone: '', sub: `${md(GV.from)}~${md(GV.to)} 앞으로 발주할 양(경고 아님) · ${names(sh.slice().sort((a, b) => b.short - a.short).slice(0, 3))}${sh.length > 3 ? ` 외 ${sh.length - 3}` : ''}` },   // 11/10: 11/9 회의 F13 — 3달 합은 경고가 아니라 '발주 필요량'
      { label: '마감 지난 부족', v: LT ? n0(LT.t) : '-', unit: 't', tone: !LT ? '' : LT.t >= 0.5 ? 'bad' : 'ok', sub: LT ? (LT.items.length ? LT.items.map((x) => `${esc(x.name)}<small>${x.by === 'spec' ? '(규격별)' : ''} ${n0(x.t)}t</small>`).join(' · ') : '없음') : '다음 자동 실행부터' },
      { label: '해당 주문 확인 · 추정', v: `${n0(cA.size)} · ${n0(eA.size)}`, unit: '건', tone: cA.size ? 'bad' : eA.size ? 'warn' : 'ok', sub: `추정은 판매그룹·시점 기준` },
    ]);
    const L = (showAll ? mats : sh).slice().sort((a, b) => (b.sure - a.sure) || ((a.deadline || '9') < (b.deadline || '9') ? -1 : 1));
    const dl = (d) => { if (!d) return '-'; const n = CT.diff(d, today); return `<b>${md(d)}</b>${n < 0 ? ` <b class="ct-neg">${-n}일 지남</b>` : n <= 14 ? ` <span class="sub-i">D-${n}</span>` : ''}`; };
    const tr = (m, i) => {
      const st = m.pos ? '<span class="ct-b ok" title="AL-STS 임가공 — 포스코가 소재 지급, 우리 발주 아님">포스코 지급</span>' : { late: '<span class="ct-b bad">마감 지남</span>', soon: '<span class="ct-b warn">2주 안 발주</span>', plan: '<span class="ct-b warn">발주 예정</span>' }[m.st] || '<span class="ct-b ok">충당</span>';   // 11/9: 상태 = 공통 기준
      return `<tr class="ck" data-i="${i}"><td>${st}</td>`
        + `<td class="r">${m.short > 0.5 ? `<b class="${m.conf.length ? 'ct-neg' : ''}">확인 ${n0(m.conf.length)}</b> · 추정 ${n0(m.est.length)}` : '-'}</td>`
        + `<td class="id">${esc(m.name)} <span class="sub-i">${m.plant === 'G' ? '도금' : '컬러'}</span></td>`
        + `<td class="r">${m.sure ? `<b class="ct-neg">${n0(m.lateT)}</b>` : '-'}${m.short > 0.5 ? `<small title="3달 필요 − 재고 − 입고 예정 · 경고 아님">3달 발주 필요 ${n0(m.short)}</small>` : ''}</td><td>${m.first ? md(m.first) : '-'}</td>`
        + `<td class="w">${m.gs.map((x) => esc(x.group)).join(' · ') || '-'}</td>`
        + `<td class="ac">${m.short > 0.5 ? esc(CT.DEPT.mat) : '-'}</td><td>${m.short > 0.5 ? dl(m.deadline) + (m.next && m.nextT >= 1 ? `<small>${m.sure ? `다음 ${md(m.next)} · ` : ''}이번 발주 ${n0(m.nextT)}t</small>` : '') + (m.orderNow ? '<small class="ct-neg">지금 발주 기간</small>' : '') : '-'}</td>`
        + `<td>${m.short > 0.5 ? '<span class="ct-b na">미조치</span>' : '-'}</td></tr>`;
    };
    $('ct-main').innerHTML = CT.basis([{ name: '소재 관제', at: M.savedAt || M.today, kind: '재계획' }, { name: '주문', at: OM.cgAt, kind: '실적' }, { name: '컬러 주문', at: OM.ccAt, kind: OM.ccMissing.length ? `${OM.ccMissing.join('·')} 없음` : '' }])
      + kp
      + `<section class="card"><div class="hd"><h2>부족 소재 <small>마감 지남 먼저 · 발주 마감 순</small></h2>${CT.tabs('mt-all', [['s', '부족만'], ['a', '전체 소재']], showAll ? 'a' : 's')}</div>`
      + `<div class="ct-wrap"><table class="ct-t mt"><thead><tr><th>상태</th><th class="r">해당 주문</th><th>소재</th><th class="r" title="발주 마감이 지나 지금 발주해도 미해소 부족 · 아래 = 3달 발주 필요(경고 아님)">마감 지난 부족(t)</th><th>필요일</th><th>사용 판매그룹</th><th class="ac">담당부서</th><th>조치기한</th><th>조치 상태</th></tr></thead>`
      + `<tbody>${L.map(tr).join('') || '<tr><td colspan="9">부족 소재 없음</td></tr>'}</tbody></table></div>`
      + '<p class="ct-note">조치기한 = 정해진 발주일(P-FH 화 · 그 외 월 · 수입 10~20일) · 필요일 = 부족 시작</p></section>'
      + specCard(M, today);
    $('mt-all').querySelectorAll('button').forEach((b) => b.onclick = () => { showAll = b.dataset.k === 'a'; render(D); });
    document.querySelectorAll('#ct-main tr.ck').forEach((r) => r.onclick = () => panel(L[+r.dataset.i]));
    CT.keyRows(document.getElementById('ct-main'));
  }
  /* 규격별 부족(11/8 사용자 — 수주 관제 ④ 결품 위험 표와 같은 자료: mat_order.rows, 컬러건재 계획재 소재 사양 두께×폭) */
  function specCard(M, today) {
    if (!CT.inScope('C')) return '';
    const R = (M.rows || []).filter((r) => (r.gap || 0) >= 0.5).sort((a, b) => (b.late || 0) - (a.late || 0) || String(a.first || '9').localeCompare(String(b.first || '9')));
    const tr = (r) => { const late = r.late != null ? r.late >= 0.5 : /마감 지남/.test(r.judge || ''), n = r.order ? CT.diff(r.order[1], today) : null;
      return `<tr><td>${late ? '<span class="ct-b bad">마감 지남</span>' : '<span class="ct-b warn">발주 필요</span>'}</td><td class="id">${esc(r.mat)}</td><td class="nw"><b>${r.thk.toFixed(2)}×${n0(r.wdt)}</b></td>`
        + `<td class="r">${n0(r.need)}</td><td class="r">${n0((r.stock || 0) + (r.po || 0))}</td><td class="r">${n0(r.gap)}</td><td class="r">${late ? `<b class="ct-neg">${n0(r.late)}</b>` : '-'}</td>`
        + `<td class="nw">${md(r.first)}</td><td class="nw">${r.order ? `${r.order[0] === r.order[1] ? md(r.order[0]) : `${md(r.order[0])}~${md(r.order[1])}`}${n != null && n < 0 ? ` <b class="ct-neg">${-n}일 지남</b>` : n != null && n <= 14 ? ` <span class="sub-i">D-${n}</span>` : ''}` : '-'}</td><td class="nw">${md(r.arrive)}</td></tr>`; };
    return `<section class="card"><div class="hd"><h2>규격별 부족 <small>컬러건재 계획재 소재 · 두께×폭 · 3달</small></h2></div>`
      + (R.length ? `<div class="ct-wrap"><table class="ct-t mt"><thead><tr><th>상태</th><th>소재</th><th>두께×폭</th><th class="r">3달 필요(t)</th><th class="r" title="같은 두께·폭 사용가능 재고 + 기발주 잔량">재고·기발주(t)</th><th class="r">3달 발주 필요(t)</th><th class="r" title="부족 중 발주 마감이 이미 지난 몫(지금 발주해도 미해소)">마감 지난 부족(t)</th><th>첫 부족일</th><th>발주 기간</th><th>입고 예상</th></tr></thead><tbody>${R.map(tr).join('')}</tbody></table></div>`
        : '<p class="ct-note">규격별 부족 없음</p>') + '</section>';
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
  CT.boot(['mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'portal.enc.json'], render);   // 11/9: portal = 업체별 발주 마감
})();
