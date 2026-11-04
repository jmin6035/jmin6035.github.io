/* 02 수주·납기 통합(11/4 개편 3단계): 도금 주문진도 + 컬러 주문·납기 → 한 주문 모델(ui/ct.js CT.orders)
   탭: 수주 현황(판매그룹 묶음) / 납기 위험(원인 5가지 · 마지막 조정일 순) / 주문 추적(단계 타임라인) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, n0, n1, md } = CT;
  const TKEY = 'ct-orders-tab';
  let tab = 'now', q = '', withDone = false, pick = null;
  try { tab = localStorage.getItem(TKEY) || 'now'; } catch (e) { /* 무시 */ }
  const GORD = ['도금수출', '도금국내', '자동차강판', '컬러수출', '컬러건재', '수요개발'];
  const within = (d, a, n) => d && CT.diff(d, a) <= n;
  let M = null;
  const imp = (o) => (o.cause === 'ship' ? Math.max(0, (o.ordT || 0) - (o.fwdT || 0)) : o.remT || 0);   // 출하 지연 = 생산은 끝났고 미출하 톤

  function kpiNow(L, asOf) {
    const open = L.filter((o) => o.risk !== '완료');
    const sum = (A) => A.reduce((s, o) => s + (o.remT || 0), 0);
    const risk = open.filter((o) => o.risk === '위험');
    const wkProd = open.filter((o) => within(o.needProd, asOf, 7));
    const wkShip = open.filter((o) => within(o.due, asOf, 7));
    const noMat = open.filter((o) => !['확보', '재고 있음'].includes(o.matSt));
    return CT.kpis([
      { label: '확정 수주잔량', v: n0(sum(open)), unit: 't', sub: `${n0(open.length)}건`, tone: 'info' },
      { label: '금주 생산완료 필요', tip: '지난 것 포함', v: n0(sum(wkProd)), unit: 't', sub: `${n0(wkProd.length)}건 · ~${md(CT.addD(asOf, 7))}`, tone: 'info' },
      { label: '금주 출하 필요', v: n0(sum(wkShip)), unit: 't', sub: `${n0(wkShip.length)}건 · 납기 기준`, tone: 'info' },
      { label: '납기 위험', v: n0(sum(risk)), unit: 't', sub: `${n0(risk.length)}건`, tone: risk.length ? 'bad' : 'ok' },
      { label: '소재 미확보', v: n0(sum(noMat)), unit: 't', sub: `${n0(noMat.length)}건`, tone: noMat.length ? 'warn' : 'ok' },
    ]);
  }
  const rowNow = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td>${CT.badge(o.risk)}</td>`
    + `<td class="id">${esc(o.id)}<small>${o.pl === 'G' ? '도금' : '컬러'} ${esc(o.line || '')}</small></td>`
    + `<td class="w">${esc(o.item || '-')}<small>${esc(o.size)}</small></td>`
    + `<td class="r">${n1(o.ordT)}</td><td class="r"><b>${n1(o.remT)}</b></td>`
    + `<td>${md(o.needProd)}</td><td>${md(o.due)}</td><td>${esc(o.matSt || '')}</td><td>${esc(o.prodSt || '')}</td><td>${md(o.etaDone)}</td></tr>`;
  const HEAD_NOW = '<thead><tr><th>위험</th><th>주문번호</th><th>품목 · 두께×폭</th><th class="r">수주량(t)</th><th class="r">잔량(t)</th><th title="수출 출항 −1 · 내수 납기 −1(컬러 = 납기)">생산완료 필요</th><th>납기</th><th>소재</th><th>생산</th><th title="생산 캘린더·작업예정 기준">예상 완료</th></tr></thead>';

  function viewNow(L, asOf) {
    let R = withDone ? L : L.filter((o) => o.risk !== '완료');
    if (q) { const qq = q.toUpperCase(); R = R.filter((o) => [o.id, o.cus, o.man, o.item, o.grp].join(' ').toUpperCase().includes(qq)); }
    const gs = [...GORD, ...[...new Set(R.map((o) => o.grp))].filter((g) => !GORD.includes(g))];
    const blocks = gs.map((g) => {
      const A = R.filter((o) => o.grp === g).sort(CT.riskSort);
      if (!A.length) return '';
      const nr = A.filter((o) => o.risk === '위험').length, nw = A.filter((o) => o.risk === '주의').length;
      return `<details class="og2"${nr ? ' open' : ''}><summary><span class="gn">${esc(g)}</span><span class="gs"><b>${n0(A.length)}</b>건</span><span class="gs">잔량 <b>${n0(A.reduce((s, o) => s + (o.remT || 0), 0))}</b>t</span>`
        + `${nr ? `<span class="gs bad">위험 <b>${nr}</b></span>` : ''}${nw ? `<span class="gs warn">주의 <b>${nw}</b></span>` : ''}</summary>`
        + `<div class="ct-wrap"><table class="ct-t">${HEAD_NOW}<tbody>${A.map(rowNow).join('')}</tbody></table></div></details>`;
    }).join('');
    return kpiNow(L, asOf)
      + `<div class="ct-flt"><input id="co-q" placeholder="주문번호·고객사·담당·품목 찾기" value="${esc(q)}"><label class="nw"><input type="checkbox" id="co-done"${withDone ? ' checked' : ''}> 완료 포함</label><span class="cnt">${n0(R.length)}건</span>`
      + '<button type="button" class="lnk" id="co-open">모두 펼치기</button><button type="button" class="lnk" id="co-close">모두 접기</button></div>'
      + (blocks || '<p class="ct-note">해당 주문이 없습니다.</p>');
  }

  function viewRisk(L) {
    const R = L.filter((o) => ['위험', '주의', '판정 불가'].includes(o.risk));
    const by = (a, b) => ((a.left == null ? 999 : a.left) - (b.left == null ? 999 : b.left)) || (CT.RISK.indexOf(a.risk) - CT.RISK.indexOf(b.risk)) || (imp(b) - imp(a));
    const sumC = Object.keys(CT.CAUSE).map((c) => { const A = R.filter((o) => o.cause === c); return { c, n: A.length, t: A.reduce((s, o) => s + imp(o), 0), nr: A.filter((o) => o.risk === '위험').length }; });
    const k = CT.kpis(sumC.map((x) => ({ label: CT.CAUSE[x.c], v: n0(x.n), unit: '건', sub: `${n0(x.t)}t${x.nr ? ` · 위험 ${x.nr}` : ''}`, tone: x.nr ? 'bad' : x.n ? 'warn' : 'ok' })));
    const blocks = sumC.filter((x) => x.n).map((x) => {
      const A = R.filter((o) => o.cause === x.c).sort(by);
      return `<details class="og2"${x.nr ? ' open' : ''}><summary><span class="gn">${esc(CT.CAUSE[x.c])}</span><span class="gs"><b>${n0(x.n)}</b>건</span><span class="gs">영향 <b>${n0(x.t)}</b>t</span>${x.nr ? `<span class="gs bad">위험 <b>${x.nr}</b></span>` : ''}<span class="gs">담당 <b>${esc(CT.DEPT[x.c])}</b></span></summary>`
        + '<div class="ct-wrap"><table class="ct-t"><thead><tr><th>위험</th><th title="이 날까지 조치해야 납기를 지킬 수 있는 마지막 날">마지막 조정일</th><th>주문번호</th><th>판매그룹</th><th class="r">영향(t)</th><th>납기</th><th>소재</th><th>담당 부서</th></tr></thead><tbody>'
        + A.map((o) => `<tr class="ck" data-id="${esc(o.id)}"><td>${CT.badge(o.risk)}</td><td>${o.last ? `<b>${md(o.last)}</b> <span class="lf">${CT.leftTxt(o)}</span>` : '<span class="mu">-</span>'}</td>`
          + `<td class="id">${esc(o.id)}<small>${o.pl === 'G' ? '도금' : '컬러'} ${esc(o.line || '')}</small></td><td>${esc(o.grp)}</td><td class="r"><b>${n1(imp(o))}</b></td><td>${md(o.due)}</td><td>${esc(o.matSt || '')}</td><td>${esc(o.dept || '')}</td></tr>`).join('')
        + '</tbody></table></div></details>';
    }).join('');
    return k + (blocks || '<p class="ct-note">위험·주의 주문이 없습니다.</p>');
  }

  function viewTrack(L) {
    const top = L.filter((o) => ['위험', '주의', '판정 불가'].includes(o.risk)).sort(CT.riskSort).slice(0, 30);
    const o = pick && L.find((x) => x.id === pick);
    return `<div class="ct-flt"><input id="co-pick" list="co-ids" placeholder="주문번호 입력(예: PGXXKM268064-100)" value="${esc(pick || '')}"><datalist id="co-ids">${L.map((x) => `<option value="${esc(x.id)}">`).join('')}</datalist></div>`
      + `<div class="co-picks"><span class="lb">위험 주문</span>${top.map((x) => `<button type="button" class="co-chip${x.id === pick ? ' on' : ''}" data-id="${esc(x.id)}">${CT.badge(x.risk)} ${esc(x.id)}</button>`).join('')}</div>`
      + (o ? `<section class="co-trk"><h3>${esc(o.id)} <small>${o.pl === 'G' ? '도금' : '컬러'} ${esc(o.line || '')} · ${esc(o.grp)}</small></h3>${CT.orderDetail(o)}</section>`
        : pick ? '<p class="ct-note">해당 주문이 없습니다.</p>' : '<p class="ct-note">주문번호를 입력하거나 위 위험 주문을 고르세요.</p>');
  }

  function render(D) {
    M = CT.orders(D);
    const L = M.all.filter((o) => CT.inScope(o.pl));
    const cg = D.cg_order_progress, cc = D.cc_order_progress;
    const basis = CT.basis([
      cg && { name: '도금 주문', at: cg.asOf, kind: '실적·재계획' },
      cc && { name: '컬러 주문', at: cc.asOf, kind: (cc.lines || []).join('·') },
      ...(M.ccMissing || []).map((l) => ({ name: l, at: null, ok: false, tip: '작업지시대상 자료 없음' })),
    ]);
    const body = tab === 'risk' ? viewRisk(L) : tab === 'track' ? viewTrack(L) : viewNow(L, M.asOf);
    $('ct-main').innerHTML = basis + CT.tabs('co-tab', [['now', '수주 현황'], ['risk', '납기 위험'], ['track', '주문 추적']], tab) + `<section class="card co-card">${body}</section>`;
    $('co-tab').querySelectorAll('button').forEach((b) => b.onclick = () => { tab = b.dataset.k; try { localStorage.setItem(TKEY, tab); } catch (e) { /* 무시 */ } render(D); });
    const byId = Object.fromEntries(M.all.map((o) => [o.id, o]));
    $('ct-main').querySelectorAll('tr.ck').forEach((tr) => tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) CT.panel(CT.orderDetail(o), o.id); });
    const qi = $('co-q');
    if (qi) qi.oninput = (e) => { q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(D); const i = $('co-q'); i.focus(); i.setSelectionRange(q.length, q.length); }, 250); };
    const dn = $('co-done'); if (dn) dn.onchange = (e) => { withDone = e.target.checked; render(D); };
    const op = $('co-open'); if (op) op.onclick = () => document.querySelectorAll('details.og2').forEach((d) => { d.open = true; });
    const cl = $('co-close'); if (cl) cl.onclick = () => document.querySelectorAll('details.og2').forEach((d) => { d.open = false; });
    const pk = $('co-pick'); if (pk) pk.onchange = (e) => { pick = e.target.value.trim(); render(D); };
    $('ct-main').querySelectorAll('.co-chip').forEach((b) => b.onclick = () => { pick = b.dataset.id; render(D); });
  }
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'], render);
})();
