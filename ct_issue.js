/* 06 이슈·조정(11/4 개편, docs/22): 자료에서 이슈 후보를 자동으로 만들고(납기 위험 주문 · 소재 발주 마감 · 화면 예외), 사람이 '결정 기록'에서 확정
   원천: cg_order_progress + cc_order_progress(CT.orders 위험 판정) · mat_order(소재 마감) · portal(exceptions) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const TYPE = { mat: '소재', plate: '생산', cap: '생산', ship: '출하', data: '데이터' };
  const TORD = ['납기', '소재', '생산', '출하', '품질', '데이터'];
  let typ = '';
  const hid = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return 'I-' + (h >>> 0).toString(36).toUpperCase().slice(0, 6); };
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'mat_order.enc.json', 'portal.enc.json'], render);

  function build(D) {
    const M = CT.orders(D), asOf = M.asOf, out = [];
    // ① 납기 위험 주문: 원인 × 판매그룹 묶음
    const by = new Map();
    for (const o of M.all) {
      if (o.risk !== '위험' || !CT.inScope(o.pl)) continue;
      const k = `${o.cause}|${o.pl}|${o.grp}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(o);
    }
    for (const [k, L] of by) {
      const [cause, pl, grp] = k.split('|'), lastD = L.map((o) => o.last).filter(Boolean).sort()[0] || null, past = L.filter((o) => o.due && o.due < asOf).length;
      out.push({ id: hid('ord|' + k), type: TYPE[cause] || '납기', cause, pl, title: `${grp} · ${CT.CAUSE[cause]}`, text: `위험 주문 ${L.length}건${past ? ` · 납기 지남 ${past}건` : ''}`,
        t: L.reduce((a, o) => a + (o.remT || 0), 0), n: L.length, lines: [...new Set(L.map((o) => o.line).filter(Boolean))], dept: CT.DEPT[cause], due: lastD, orders: L.sort(CT.riskSort), src: '주문 위험 판정' });
    }
    // ② 소재 발주 마감(마감 지남·2주 안)
    const MO = D.mat_order && D.mat_order.groups;
    for (const m of (MO && MO.mats) || []) {
      if (!['late', 'soon'].includes(m.st) || !CT.inScope(m.plant)) continue;
      const gs = (MO.groups || []).filter((g) => g.mats.some((x) => x.key === m.key)).map((g) => g.group);
      const L = M.all.filter((o) => o.pl === m.plant && o.risk !== '완료' && gs.some((g) => CT.grpName(g) === o.grp || g.startsWith(o.grp)) && (!m.first || !o.needProd || o.needProd >= m.first));
      out.push({ id: hid('mat|' + m.key), type: '소재', cause: 'mat', pl: m.plant, title: `${m.name} 발주 ${m.st === 'late' ? '마감 지남' : '2주 안 마감'}`, text: `부족 ${n0(m.short)}t · ${md(m.first)}부터 · 리드타임 ${m.lt}일`,
        t: m.short, n: L.length, lines: [], dept: CT.DEPT.mat, due: m.deadline, orders: L.sort(CT.riskSort), grps: gs, src: '소재 관제', nOrdEst: true });
    }
    // ③ 화면 예외(계획≠현장, 재고 목표 초과 등)
    const AREA = { 재고: '소재', 소재: '소재', 납기: '납기', 자료: '데이터', 도금: '생산', 컬러: '생산', 출하: '출하' };
    for (const e of (D.portal && D.portal.exceptions) || []) {
      const pl = /컬러/.test(e.area + e.text) ? 'C' : /도금|CGL|F\/H/.test(e.area + e.text) ? 'G' : '';
      if (pl && !CT.inScope(pl)) continue;
      out.push({ id: hid('exc|' + e.text), type: AREA[e.area] || '생산', pl, title: e.text.split(' — ')[0], text: e.text.split(' — ')[1] || '', t: null, n: 0, lines: [], dept: ({ 구매: CT.DEPT.mat })[e.who] || e.who || '생산기획', due: null, orders: [], link: e.link, lvl: e.lvl, src: '화면 예외' });
    }
    return { asOf, list: out };
  }

  function render(D) {
    const { asOf, list } = build(D);
    const L = list.filter((x) => !typ || x.type === typ);
    const late = list.filter((x) => x.due && x.due < asOf).length;
    const cnt = (t) => list.filter((x) => x.type === t).length;
    const k = [{ label: '이슈 후보', v: n0(list.length), unit: '건', tone: list.length ? 'warn' : 'ok', sub: '자동 생성 · 확정 전' }, { label: '조치 기한 지남', v: n0(late), unit: '건', tone: late ? 'bad' : 'ok', sub: `${md(asOf)} 기준` },
      ...TORD.filter((t) => cnt(t)).map((t) => ({ label: t, v: n0(cnt(t)), unit: '건', tone: 'info', sub: `영향 ${n0(list.filter((x) => x.type === t).reduce((a, x) => a + (x.t || 0), 0))}t` }))];
    const deps = [...new Set(L.map((x) => x.dept))];
    const row = (x) => `<tr class="ck" data-i="${x.id}"><td class="id">${x.id}</td><td><span class="is-t">${esc(x.type)}</span></td><td class="w"><b>${esc(x.title)}</b><small>${esc(x.text)}</small></td>`
      + `<td class="r">${x.t != null ? `<b>${n0(x.t)}</b>t` : '-'}</td><td class="r">${x.n ? `${n0(x.n)}건${x.nOrdEst ? '<small>후보</small>' : ''}` : '-'}</td><td>${esc(x.lines.join('·')) || '-'}</td>`
      + `<td>${x.due ? `<b class="${x.due < asOf ? 'ct-neg' : ''}">${md(x.due)}</b>${x.due < asOf ? `<small class="ct-neg">${CT.diff(asOf, x.due)}일 지남</small>` : `<small>D-${CT.diff(x.due, asOf)}</small>`}` : '<span class="sub">즉시 확인</span>'}</td><td><span class="ct-b na">신규(후보)</span></td></tr>`;
    const sec = (dp) => { const R = L.filter((x) => x.dept === dp).sort((a, b) => String(a.due || '0').localeCompare(String(b.due || '0')) || (b.t || 0) - (a.t || 0));
      const lt = R.filter((x) => x.due && x.due < asOf).length;
      return `<details class="is-g" open><summary><b>${esc(dp)}</b><span>${R.length}건</span>${lt ? `<span class="ct-neg">기한 지남 ${lt}</span>` : ''}<span>영향 ${n0(R.reduce((a, x) => a + (x.t || 0), 0))}t</span></summary>`
        + `<div class="ct-wrap"><table class="ct-t is-t2"><thead><tr><th>번호</th><th>유형</th><th>내용</th><th class="r">영향 물량</th><th class="r">주문</th><th>라인</th><th>조치 기한</th><th>단계</th></tr></thead><tbody>${R.map(row).join('')}</tbody></table></div></details>`; };
    const m = document.getElementById('ct-main');
    m.innerHTML = CT.basis([{ name: '주문 위험', at: asOf, kind: '실적+재계획' }, { name: '소재 관제', at: D.mat_order && D.mat_order.today, kind: '재계획' }, { name: '화면 예외', at: D.portal && D.portal.built, kind: '자동 점검' }])
      + `<section class="card"><h2>이슈 후보 <small>자료에서 자동 생성 — 담당 부서가 확인해 결정 기록에 등록</small><a class="is-btn" href="decisions.html">결정 기록 열기 →</a></h2>${CT.kpis(k)}`
      + CT.tabs('is-typ', [['', '전체'], ...TORD.filter((t) => cnt(t)).map((t) => [t, t])], typ)
      + (deps.length ? deps.map(sec).join('') : '<p class="ct-note">이슈 후보가 없습니다.</p>') + '</section>';
    m.querySelectorAll('#is-typ button').forEach((b) => b.onclick = () => { typ = b.dataset.k; render(D); });
    m.querySelectorAll('tr[data-i]').forEach((t) => t.onclick = () => openIssue(list.find((x) => x.id === t.dataset.i), asOf));
  }
  function openIssue(x, asOf) {
    const kv = (k, v) => `<div class="ct-kv"><span>${esc(k)}</span><b>${v}</b></div>`;
    const ord = x.orders.slice(0, 60).map((o, i) => `<tr class="ck" data-o="${i}"><td>${CT.badge(o.risk)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${esc(o.line || '')}</small></td><td class="r">${n1(o.remT)}t</td><td>${md(o.due)}</td></tr>`).join('');
    CT.panel(kv('유형', esc(x.type)) + kv('출처', esc(x.src)) + kv('내용', esc(x.title)) + (x.text ? kv('', esc(x.text)) : '') + kv('담당 부서', esc(x.dept)) + kv('조치 기한', x.due ? `${md(x.due)}${x.due < asOf ? ' (지남)' : ''}` : '즉시 확인')
      + (x.t != null ? kv('영향 물량', n0(x.t) + 't') : '') + (x.grps ? kv('쓰는 판매그룹', esc(x.grps.map(CT.grpName).join('·'))) : '') + kv('단계', '신규(후보) → 결정 기록에서 확정')
      + `<p style="margin:12px 0"><a class="is-btn" href="decisions.html">결정 기록에 등록 →</a>${x.link ? ` <a class="is-btn" href="${esc(x.link)}">관련 화면 →</a>` : ''}</p>`
      + (ord ? `<h4>영향 주문 ${x.orders.length}건${x.nOrdEst ? ' <small>(판매그룹·부족 시작일 기준 후보)</small>' : ''}</h4><table class="ct-t"><tbody>${ord}</tbody></table>` : ''), `${x.id} · ${x.type}`);
    document.querySelectorAll('#ct-panel tr[data-o]').forEach((t) => t.onclick = () => { const o = x.orders[+t.dataset.o]; CT.panel(CT.orderDetail(o), o.id); });
  }
})();
