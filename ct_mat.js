/* 04 소재·재고 — 부족·조치(11/4 통합 관제 개편, docs/22). 원천 = 소재 관제(mat_order: 소재별 3달 수급·발주 마감, 판매그룹별 사용) + 주문 모델(CT.orders) */
(function () {
  'use strict';
  const { esc, n0, n1, md, addD } = CT;
  const $ = (id) => document.getElementById(id);
  // 소재 관제 판매그룹 → 주문 판매그룹(CT.grpName). 도금 '자가재' = 컬러 부서 계약의 도금 주문
  const GMAP = { 도금수출: ['도금수출'], 도금국내: ['도금국내'], 자동차: ['자동차강판'], 자가재: ['컬러수출', '컬러건재', '수요개발'],
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
    const live = (o) => !o.closed && o.remT > 0.5;
    const mats = (GV.mats || []).filter((m) => CT.inScope(m.plant)).map((m) => {
      const gs = (usedBy[m.key] || []).filter((x) => x.use >= 1);
      const og = new Set(gs.flatMap((x) => GMAP[x.group] || [x.group]));
      const conf = m.plant === 'G' ? OM.G.filter((o) => live(o) && (o.src.lateIn || o.matSt === '미발주') && fit(m, o)) : [];
      const cs = new Set(conf.map((o) => o.id));
      const est = m.first ? OM.all.filter((o) => o.pl === m.plant && og.has(o.grp) && live(o) && o.needProd && o.needProd >= m.first && !cs.has(o.id)) : [];
      const sure = m.short > 0.5 && m.first && m.first < addD(today, (m.lt || 0) + (m.safe || 0));   // 리드타임 + 투입 여유 안에 부족 시작 = 지금 발주해도 못 막음
      return { ...m, gs, conf, est, sure, oT: conf.concat(est).reduce((a, o) => a + o.remT, 0) };
    });
    const sh = mats.filter((m) => m.short > 0.5), sure = sh.filter((m) => m.sure), exp = sh.filter((m) => !m.sure);
    const cA = new Map(), eA = new Map(); sh.forEach((m) => { m.conf.forEach((o) => cA.set(o.id, o)); m.est.forEach((o) => eA.set(o.id, o)); });
    cA.forEach((o, k) => eA.delete(k));
    const tT = (L) => n0(L.reduce((a, m) => a + m.short, 0));
    const kp = CT.kpis([
      { label: '부족 확정 소재', v: sure.length, unit: '개', tone: sure.length ? 'bad' : 'ok', sub: `${tT(sure)}t · 리드타임 안 부족` },
      { label: '부족 예상 소재', v: exp.length, unit: '개', tone: exp.length ? 'warn' : 'ok', sub: `${tT(exp)}t · ${md(GV.from)}~${md(GV.to)}` },
      { label: '발주 마감 지남', v: sh.filter((m) => m.deadline && m.deadline < today).length, unit: '개', tone: sh.some((m) => m.deadline && m.deadline < today) ? 'bad' : 'ok' },
      { label: '영향 주문 확인 · 추정', v: `${n0(cA.size)} · ${n0(eA.size)}`, unit: '건', tone: cA.size ? 'bad' : eA.size ? 'warn' : 'ok', sub: `추정은 판매그룹·시점 기준` },
    ]);
    const L = (showAll ? mats : sh).slice().sort((a, b) => (b.sure - a.sure) || ((a.deadline || '9') < (b.deadline || '9') ? -1 : 1));
    const dl = (d) => { if (!d) return '-'; const n = CT.diff(d, today); return `<b>${md(d)}</b>${n < 0 ? ` <b class="ct-neg">${-n}일 지남</b>` : n <= 14 ? ` <span class="sub-i">D-${n}</span>` : ''}`; };
    const tr = (m, i) => {
      const st = m.short > 0.5 ? (m.sure ? '<span class="ct-b bad">부족 확정</span>' : '<span class="ct-b warn">부족 예상</span>') : '<span class="ct-b ok">충당</span>';
      return `<tr class="ck" data-i="${i}"><td>${st}</td>`
        + `<td class="r">${m.short > 0.5 ? `<b class="${m.conf.length ? 'ct-neg' : ''}">확인 ${n0(m.conf.length)}</b> · 추정 ${n0(m.est.length)}` : '-'}</td>`
        + `<td class="id">${esc(m.name)} <span class="sub-i">${m.plant === 'G' ? '도금' : '컬러'}</span></td>`
        + `<td class="r">${m.short > 0.5 ? `<b class="ct-neg">${n0(m.short)}</b>` : '-'}</td><td>${m.first ? md(m.first) : '-'}</td>`
        + `<td class="w">${m.gs.map((x) => esc(x.group)).join(' · ') || '-'}</td>`
        + `<td class="ac">${m.short > 0.5 ? esc(CT.DEPT.mat) : '-'}</td><td>${m.short > 0.5 ? dl(m.deadline) : '-'}</td>`
        + `<td>${m.short > 0.5 ? '<span class="ct-b na">미조치</span>' : '-'}</td><td>${md(dataAt)}</td></tr>`;
    };
    $('ct-main').innerHTML = CT.basis([{ name: '소재 관제', at: M.savedAt || M.today, kind: '재계획' }, { name: '주문', at: OM.cgAt, kind: '실적' }, { name: '컬러 주문', at: OM.ccAt, kind: OM.ccMissing.length ? `${OM.ccMissing.join('·')} 없음` : '' }])
      + kp
      + `<section class="card"><div class="hd"><h2>부족 소재 <small>확정 먼저 · 발주 마감 순</small></h2>${CT.tabs('mt-all', [['s', '부족만'], ['a', '전체 소재']], showAll ? 'a' : 's')}</div>`
      + `<div class="ct-wrap"><table class="ct-t mt"><thead><tr><th>판정</th><th class="r">영향 주문</th><th>소재</th><th class="r">부족(t)</th><th>필요일</th><th>사용 판매그룹</th><th class="ac">담당부서</th><th>조치기한</th><th>조치 상태</th><th>확인일</th></tr></thead>`
      + `<tbody>${L.map(tr).join('') || '<tr><td colspan="10">부족 소재 없음</td></tr>'}</tbody></table></div>`
      + '<p class="ct-note">부족 확정 = 부족 시작이 오늘 + 리드타임 + 투입 여유 안 · 필요일 = 부족 시작 · 조치기한 = 발주 마감</p></section>';
    $('mt-all').querySelectorAll('button').forEach((b) => b.onclick = () => { showAll = b.dataset.k === 'a'; render(D); });
    document.querySelectorAll('#ct-main tr.ck').forEach((r) => r.onclick = () => panel(L[+r.dataset.i]));
    CT.keyRows(document.getElementById('ct-main'));
  }
  function panel(m) {
    const kv = (k, v) => `<div class="ct-kv"><span>${k}</span><b>${v}</b></div>`;
    const ol = (os, off) => os.slice(0, 200).map((o, i) => `<tr class="ck" data-i="${off + i}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · 생산 필요 ${md(o.needProd)}${o.pl === 'G' ? ` · 소재 ${esc(o.matSt)}` : ''}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('');
    const cs = m.conf.slice().sort(CT.riskSort), es = m.est.slice().sort(CT.riskSort), all = cs.concat(es);
    const html = kv('판정', m.short > 0.5 ? (m.sure ? '<span class="ct-neg">부족 확정</span>' : '부족 예상') : '충당')
      + kv('3달 필요', `${n0(m.need)}t`) + kv('재고', `${n0(m.stock)}t`) + kv('입고 예정', `${n0(m.arr)}t`) + kv('부족', m.short ? `<span class="ct-neg">${n0(m.short)}t</span>` : '-')
      + kv('부족 시작', m.first ? md(m.first) : '-') + kv('발주 마감', m.deadline ? md(m.deadline) : '-') + kv('공급사', esc((m.sup || []).filter(Boolean).join(' · ') || '-')) + kv('리드타임', `${m.lt}일 + 투입 여유 ${m.safe || '-'}일`)
      + (m.gs.length ? `<h4>사용 판매그룹(3달)</h4>${m.gs.map((x) => kv(esc(x.group), `${n0(x.use)}t`)).join('')}` : '')
      + `<h4>영향 주문 — 확인 ${cs.length}건</h4>` + (cs.length ? `<table class="ct-t">${ol(cs, 0)}</table>` : '<p class="ct-note">없음</p>')
      + `<h4>영향 주문 — 추정 ${es.length}건</h4>` + (es.length ? `<table class="ct-t">${ol(es, cs.length)}</table>` : '<p class="ct-note">없음</p>');
    CT.panel(html, m.name, (p) => p.querySelectorAll('tr.ck').forEach((tr) => tr.onclick = () => { const o = all[+tr.dataset.i]; CT.panel(CT.orderDetail(o), o.id); }));
  }
  CT.boot(['mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'], render);
})();
