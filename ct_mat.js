/* 04 소재·재고 — 부족·조치(11/4 통합 관제 개편, docs/22). 원천 = 소재 관제(mat_order: 소재별 3달 수급·발주 마감, 판매그룹별 사용) + 주문 모델(CT.orders) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const $ = (id) => document.getElementById(id);
  const ST = { late: ['마감 지남', 'bad'], soon: ['2주 안 발주', 'warn'], plan: ['발주 예정', 'info'], ok: ['충당', 'ok'] };
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
    const mats = (GV.mats || []).filter((m) => CT.inScope(m.plant)).map((m) => {
      const gs = (usedBy[m.key] || []).filter((x) => x.use >= 1);
      const og = new Set(gs.flatMap((x) => GMAP[x.group] || [x.group]));
      const orders = m.first ? OM.all.filter((o) => o.pl === m.plant && og.has(o.grp) && o.risk !== '완료' && o.remT > 0.5 && o.needProd && o.needProd >= m.first) : [];
      return { ...m, gs, orders, oT: orders.reduce((a, o) => a + o.remT, 0) };
    });
    const sh = mats.filter((m) => m.short > 0.5);
    const late = sh.filter((m) => m.st === 'late');
    const affected = new Map(); sh.forEach((m) => m.orders.forEach((o) => affected.set(o.id, o)));
    const aT = [...affected.values()].reduce((a, o) => a + o.remT, 0);
    const kp = CT.kpis([
      { label: '부족 예상 소재', v: sh.length, unit: '개', tone: sh.length ? 'warn' : 'ok', sub: `3달(${md(GV.from)}~${md(GV.to)}) 기준` },
      { label: '부족 톤', v: n0(sh.reduce((a, m) => a + m.short, 0)), unit: 't', tone: sh.length ? 'warn' : 'ok' },
      { label: '발주 마감 지남', v: late.length, unit: '개', tone: late.length ? 'bad' : 'ok', sub: late.map((m) => esc(m.name)).join(' · ') },
      { label: '영향 주문(추정)', v: n0(affected.size), unit: '건', tone: affected.size ? 'warn' : 'ok', sub: `잔량 ${n0(aT)}t` },
    ]);
    const L = (showAll ? mats : sh).slice().sort((a, b) => ((a.deadline || '9') < (b.deadline || '9') ? -1 : 1));
    const tr = (m, i) => {
      const [sn, sc] = ST[m.st] || ['-', 'na'];
      return `<tr class="ck" data-i="${i}"><td class="id">${esc(m.name)}</td><td>${m.plant === 'G' ? '도금' : '컬러'}</td>`
        + `<td class="r">${m.short ? `<b class="ct-neg">${n0(m.short)}</b>` : '-'}</td><td>${m.first ? md(m.first) : '-'}</td>`
        + `<td><b>${m.deadline ? md(m.deadline) : '-'}</b></td><td><span class="ct-b ${sc === 'info' ? 'done' : sc}">${sn}</span></td>`
        + `<td>${esc(((m.sup || []).filter(Boolean)[0] || '업체 미상'))} <span class="sub-i">${m.lt}일</span></td>`
        + `<td class="w">${m.gs.map((x) => esc(x.group)).join(' · ') || '-'}</td>`
        + `<td class="r">${m.short ? `<b>${n0(m.orders.length)}</b>건 <span class="sub-i">${n0(m.oT)}t</span>` : '-'}</td></tr>`;
    };
    $('ct-main').innerHTML = CT.basis([{ name: '소재 관제', at: M.savedAt || M.today, kind: '재계획' }, { name: '주문', at: OM.cgAt, kind: '실적' }, { name: '컬러 주문', at: OM.ccAt, kind: OM.ccMissing.length ? `${OM.ccMissing.join('·')} 없음` : '' }])
      + kp
      + `<section class="card"><div class="hd"><h2>부족 소재 <small>발주 마감 순</small></h2>${CT.tabs('mt-all', [['s', '부족만'], ['a', '전체 소재']], showAll ? 'a' : 's')}</div>`
      + `<div class="ct-wrap"><table class="ct-t"><thead><tr><th>소재</th><th>공장</th><th class="r">부족(t)</th><th>부족 시작</th><th>발주 마감</th><th>상태</th><th>공급사 · 리드타임</th><th>사용 판매그룹</th><th class="r" title="소재를 쓰는 판매그룹의 주문 중 생산 필요일이 부족 시작일 이후인 것 — 주문별 소재 연결이 없어 그룹·시점으로 추정">영향 주문(추정)</th></tr></thead>`
      + `<tbody>${L.map(tr).join('') || '<tr><td colspan="9">부족 예상 소재 없음</td></tr>'}</tbody></table></div>`
      + '<p class="ct-note">발주 마감 = 부족 시작일 − 리드타임 − 투입 여유 · 영향 주문 = 사용 판매그룹 주문 중 생산 필요일이 부족 시작 이후(그룹·시점 기준 추정) · 줄을 누르면 주문</p></section>';
    $('mt-all').querySelectorAll('button').forEach((b) => b.onclick = () => { showAll = b.dataset.k === 'a'; render(D); });
    document.querySelectorAll('#ct-main tr.ck').forEach((r) => r.onclick = () => panel(L[+r.dataset.i]));
  }
  function panel(m) {
    const os = m.orders.slice().sort(CT.riskSort);
    const kv = (k, v) => `<div class="ct-kv"><span>${k}</span><b>${v}</b></div>`;
    const html = kv('3달 필요', `${n0(m.need)}t`) + kv('재고', `${n0(m.stock)}t`) + kv('입고 예정', `${n0(m.arr)}t`) + kv('부족', m.short ? `<span class="ct-neg">${n0(m.short)}t</span>` : '-')
      + kv('부족 시작', m.first ? md(m.first) : '-') + kv('발주 마감', m.deadline ? md(m.deadline) : '-') + kv('공급사', esc((m.sup || []).filter(Boolean).join(' · ') || '-')) + kv('리드타임', `${m.lt}일 + 투입 여유 ${m.safe || '-'}일`)
      + (m.gs.length ? `<h4>사용 판매그룹(3달)</h4>${m.gs.map((x) => kv(esc(x.group), `${n0(x.use)}t`)).join('')}` : '')
      + `<h4>영향 주문(추정) ${os.length}건</h4>` + (os.length ? `<table class="ct-t">${os.slice(0, 200).map((o, i) => `<tr class="ck" data-i="${i}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · 생산 필요 ${md(o.needProd)}</small></td><td class="r">${n1(o.remT)}t</td></tr>`).join('')}</table>` : '<p class="ct-note">없음</p>');
    CT.panel(html, m.name);
    document.querySelectorAll('#ct-panel tr.ck').forEach((tr) => tr.onclick = () => { const o = os[+tr.dataset.i]; CT.panel(CT.orderDetail(o), o.id); });
  }
  CT.boot(['mat_order.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'], render);
})();
