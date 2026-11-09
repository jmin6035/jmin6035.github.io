/* 06 이슈·조정(11/4 2차 진단 9장): 자동 탐지 후보와 관리 이슈를 나눔 — #now 이슈 현황 · #req 조정 요청
   후보: 납기 지연 예상 주문(원인×판매그룹) · 소재 발주 마감 · 화면 예외 → 번호 CT.issueId(키) 고정
   상태: 공유 저장소(결정 기록과 같은 곳) 이벤트 {t:'issue', id, st, note?, owner?, due?, title?} 를 번호별로 접어 마지막 값 사용 — st ∈ 신규/접수/조치 중/완료/보류 */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const TYPE = { mat: '소재', match: '생산', paint: '소재', plate: '생산', cap: '생산', ship: '출하', data: '자료' };
  const ST = ['신규', '접수', '조치 중', '완료', '보류'];
  const STC = { 신규: 'na', 접수: 'warn', '조치 중': 'mid', 완료: 'ok', 보류: 'pre' };
  // 화면 표시(11/5 사용자 '미처리·조치 중으로는 뭘 했는지 모름') — 저장 값(st)은 그대로
  const STN = { 신규: '담당 미지정(접수 전)', 접수: '접수됨(조치 전)', '조치 중': '조치 진행 중', 완료: '종결', 보류: '보류' };
  // 원인별 해야 할 조치
  const ACT = { mat: '소재 발주·입고 앞당김 요청', match: '규격 재고 매치·편성', paint: '도료 입고 앞당김 요청', cap: '생산 순서·편성 조정', plate: '자가재(도금) 생산 앞당김', ship: '선적·배차 일정 확인', data: 'MES 주문 종결·자료 정정' };
  const CSH = { mat: '소재', match: '매치', paint: '도료', cap: '생산', plate: '자가재', ship: '출하', data: '자료' };
  const VIEWS = ['now', 'req'];
  const FIL = [['', '전체'], ['auto', '담당 미지정'], ['open', '조치 진행 중'], ['done', '종결']];
  let fil = '', EV = null, evErr = '', bound = false, DD = null;
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'mat_order.enc.json', 'portal.enc.json', 'integrated.enc.json'], (D) => { DD = D; draw(); load(); });

  async function load() {
    try { EV = (await CT.store.events()).filter((e) => e && e.t === 'issue' && e.id); evErr = ''; } catch (e) { EV = []; evErr = e.message || '공유 저장소 읽기 실패'; }
    draw();
  }

  function build(D) {
    const M = CT.orders(D), asOf = M.asOf, out = [];
    const by = new Map();
    for (const o of M.all) {
      if (o.risk !== '위험' || !CT.inScope(o.pl)) continue;
      const k = `${o.cause}|${o.pl}|${o.grp}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(o);
    }
    for (const [k, L] of by) {
      const [cause, pl, grp] = k.split('|'), lastD = L.map((o) => o.last).filter(Boolean).sort()[0] || null, past = L.filter((o) => o.due && o.due < asOf).length;
      out.push({ key: 'ord|' + k, no: `납기-${pl === 'G' && /^(컬러|수요)/.test(grp) ? '자가재·' : ''}${grp}-${CSH[cause] || cause}`, act: ACT[cause] || '확인', type: TYPE[cause] || '납기', cause, pl, title: `${grp} · ${CT.CAUSE[cause]}`, text: `지연 예상 주문 ${L.length}건${past ? ` · 납기 지남 ${past}건` : ''}`,
        t: L.reduce((a, o) => a + (o.remT || 0), 0), n: L.length, dept: CT.DEPT[cause], due: lastD, orders: L.sort(CT.riskSort), why: CT.CAUSE[cause], src: '주문 납기 판정' });
    }
    const MO = D.mat_order && D.mat_order.groups;
    for (const m of (MO && MO.mats) || []) {
      if (!['late', 'soon'].includes(m.st) || !CT.inScope(m.plant)) continue;
      const gs = (MO.groups || []).filter((g) => g.mats.some((x) => x.key === m.key)).map((g) => g.group);
      const L = M.all.filter((o) => o.pl === m.plant && !o.closed && gs.some((g) => CT.grpName(g) === o.grp || g.startsWith(o.grp)) && (!m.first || !o.needProd || o.needProd >= m.first));
      out.push({ key: 'mat|' + m.key, no: `소재-${m.name}`, act: m.st === 'late' ? '소재 즉시 발주(마감 지남) — 부족분 대체 소재 검토' : `소재 발주(마감 ${md(m.deadline)} 전)`, type: '소재', cause: 'mat', pl: m.plant, title: `${m.name} 발주 ${m.st === 'late' ? '마감 지남' : '2주 안 마감'}`, text: `부족 ${n0(m.short)}t · ${md(m.first)}부터 · 리드타임 ${m.lt}일`,
        t: m.short, n: L.length, dept: CT.DEPT.mat, due: m.deadline, orders: L.sort(CT.riskSort), grps: gs, why: `소재 부족 ${n0(m.short)}t`, src: '소재 관제', nOrdEst: true });
    }
    const AREA = { 재고: '소재', 소재: '소재', 납기: '납기', 자료: '자료', 도금: '생산', 컬러: '생산', 출하: '출하' };
    for (const e of (D.portal && D.portal.exceptions) || []) {
      if (CT.idleSkip(D, e.text)) continue;                   // 계획 휴지 라인 경보 제외(11/8)
      const pl = /컬러/.test(e.area + e.text) ? 'C' : /도금|CGL|F\/H/.test(e.area + e.text) ? 'G' : '';
      if (pl && !CT.inScope(pl)) continue;
      out.push({ key: 'exc|' + e.text, no: `현장-${e.area || '기타'}`, act: e.link ? '관련 화면에서 내용 확인 후 조치' : '내용 확인 후 조치', type: AREA[e.area] || '생산', pl, title: e.text.split(' — ')[0], text: e.text.split(' — ')[1] || '', t: null, n: 0, dept: ({ 구매: CT.DEPT.mat })[e.who] || e.who || '생산기획', due: null, orders: [], link: e.link, why: e.text.split(' — ')[1] || '', src: '화면 예외' });
    }
    // 저장소 이벤트 접기(번호별 시간순, 마지막 값)
    const E = {};
    for (const e of (EV || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))) (E[e.id] = E[e.id] || []).push(e);
    const fold = (x) => {
      x.id = x.id || CT.issueId(x.key); const H = E[x.id] || [];
      x.hist = H; x.st = 'auto';
      for (const e of H) { if (e.st) x.st = e.st; if (e.owner) x.owner = e.owner; if (e.due) x.dueSet = e.due; if (e.note) x.note = e.note; }
      if (!H.length || x.st === 'auto') x.st = '신규';
      x.at0 = H.length ? String(H[0].at).slice(0, 10) : asOf;
      x.dueEff = x.dueSet || x.due;
      x.over = x.st !== '완료' && x.dueEff && x.dueEff < asOf;
      return x;
    };
    out.forEach(fold);
    // 읽을 수 있는 이슈번호(같은 번호가 겹치면 -2, -3) — 저장은 내부 번호(x.id)
    const seen = {};
    out.forEach((x) => { const b = x.no || x.id; seen[b] = (seen[b] || 0) + 1; x.no = seen[b] > 1 ? `${b}-${seen[b]}` : b; });
    // 후보에서 사라졌지만 기록이 남은 이슈(자료가 바뀌어 탐지 안 됨)
    const have = new Set(out.map((x) => x.id));
    for (const [id, H] of Object.entries(E)) if (!have.has(id)) { const l = H[H.length - 1]; out.push(fold({ key: '', id, no: `기록-${l.title || id}`, act: '지금 자료로 다시 확인', type: '기록', pl: '', title: l.title || id, text: '지금 자료에서는 탐지 안 됨', t: null, n: 0, dept: l.owner || '-', due: null, orders: [], why: '', src: '조치 기록' })); }
    return { asOf, list: out };
  }

  function draw() {
    if (!DD) return;
    const m = document.getElementById('ct-main'), v = CT.view('now', VIEWS), B = build(DD);
    const err = EV == null ? '<p class="is-err">조치 상태 불러오는 중…</p>' : evErr ? `<p class="is-err bad">⚠ 조치 상태를 못 읽었습니다(${esc(evErr)}) — 후보만 표시, 상태 변경 불가</p>` : '';
    m.innerHTML = CT.basis([{ name: '주문 납기', at: B.asOf, kind: '실적+재계획' }, { name: '소재 관제', at: DD.mat_order && DD.mat_order.today, kind: '재계획' }, { name: '화면 예외', at: DD.portal && DD.portal.built, kind: '자동 점검' }]) + err + (v === 'req' ? req(B) : now(B));
    m.querySelectorAll('#is-fil button').forEach((b) => b.onclick = () => { fil = b.dataset.k; draw(); });
    m.querySelectorAll('[data-i]').forEach((t) => t.onclick = (e) => { if (e.target.closest('a')) return; openIssue(B.list.find((x) => x.id === t.dataset.i), B.asOf); });
    CT.keyRows(m);
    if (!bound) { bound = true; CT.onView(() => { CT.panel(null); draw(); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }
  const stB = (s) => `<span class="ct-f ${STC[s] || 'na'}">${esc(STN[s] || s)}</span>`;
  const stCell = (x) => `${stB(x.st)}${x.over ? '<small class="ct-neg">조치일 지남</small>' : ''}${x.st !== '신규' && x.st !== '완료' ? `<small>담당 ${esc(x.owner || x.dept)}${x.dueEff ? ` · 기한 ${md(x.dueEff)}` : ''}</small>` : ''}`;
  const dueTd = (x, asOf) => (x.dueEff ? `<b class="${x.over ? 'ct-neg' : ''}">${md(x.dueEff)}</b>${x.over ? `<small class="ct-neg">${CT.diff(CT.today(), x.dueEff)}일 지남</small>` : x.st === '완료' ? '' : `<small>D-${CT.diff(x.dueEff, CT.today())}</small>`}` : '<span class="sub">즉시 확인</span>');

  /* #now 이슈 현황 */
  function now(B) {
    const { asOf, list } = B;
    const isOpen = (x) => ['접수', '조치 중', '보류'].includes(x.st);
    const cnt = { 신규: list.filter((x) => x.st === '신규').length, open: list.filter((x) => x.st === '접수' || x.st === '조치 중').length, over: list.filter((x) => x.over).length, done: list.filter((x) => x.st === '완료').length, hold: list.filter((x) => x.st === '보류').length };
    const k = [{ label: '담당 미지정', v: n0(cnt.신규), unit: '건', tone: cnt.신규 ? 'warn' : 'ok', sub: '자동으로 찾은 문제 · 아직 아무도 접수 안 함' }, { label: '조치 진행 중', v: n0(cnt.open), unit: '건', tone: 'info', sub: `담당이 접수해 조치하는 중${cnt.hold ? ` · 보류 ${cnt.hold}` : ''}` },
      { label: '조치일 지남', v: n0(cnt.over), unit: '건', tone: cnt.over ? 'bad' : 'ok', sub: `조치 기한이 ${md(asOf)} 전 · 종결 제외` }, { label: '종결', v: n0(cnt.done), unit: '건', tone: 'ok', sub: '조치 끝으로 기록된 것' }];
    const L = list.filter((x) => (fil === 'auto' ? x.st === '신규' : fil === 'open' ? isOpen(x) : fil === 'done' ? x.st === '완료' : true));
    const chips = `<div class="seg ct-seg" id="is-fil">${FIL.map(([k_, n]) => `<button type="button" data-k="${k_}" aria-pressed="${k_ === fil}">${n} <b>${n0(list.filter((x) => (k_ === 'auto' ? x.st === '신규' : k_ === 'open' ? isOpen(x) : k_ === 'done' ? x.st === '완료' : true)).length)}</b></button>`).join('')}</div>`;
    const row = (x) => `<tr class="ck" data-i="${x.id}"><td class="id">${esc(x.no)}</td><td class="w"><b>${esc(x.title)}</b><small>${esc(x.text)}</small></td><td class="w"><b>${esc(x.act)}</b><small>${esc(x.owner || x.dept)}</small></td>`
      + `<td class="r">${x.n ? `${n0(x.n)}건${x.nOrdEst ? '<small>후보</small>' : ''}` : '-'}</td><td class="r">${x.t != null ? `<b>${n0(x.t)}</b>` : '-'}</td><td>${dueTd(x, asOf)}</td><td>${stCell(x)}</td></tr>`;
    const deps = [...new Set(L.map((x) => x.dept))];
    const sec = (dp) => { const R = L.filter((x) => x.dept === dp).sort((a, b) => ST.indexOf(a.st) - ST.indexOf(b.st) || String(a.dueEff || '0').localeCompare(String(b.dueEff || '0')) || (b.t || 0) - (a.t || 0));
      const lt = R.filter((x) => x.over).length;
      return `<details class="is-g" open><summary><b>${esc(dp)}</b><span>${R.length}건</span>${lt ? `<span class="ct-neg">조치일 지남 ${lt}</span>` : ''}<span>영향 ${n0(R.reduce((a, x) => a + (x.t || 0), 0))}t</span></summary>`
        + `<div class="ct-wrap"><table class="ct-t is-t2"><thead><tr><th>이슈번호</th><th>문제</th><th>해야 할 조치 · 담당</th><th class="r">해당 주문</th><th class="r">해당 물량</th><th>조치 기한</th><th>진행</th></tr></thead><tbody>${R.map(row).join('')}</tbody></table></div></details>`; };
    return `<section class="card"><h2>이슈 현황 <small>담당 미지정 → 접수 → 조치 진행 → 종결</small><span class="unit">건 · 톤</span></h2>${CT.kpis(k)}${chips}`
      + (deps.length ? deps.map(sec).join('') : '<p class="ct-note">해당 이슈 없음</p>') + '</section>';
  }

  /* #req 조정 요청: 접수·조치 중·보류 */
  function req(B) {
    const { asOf, list } = B, R = list.filter((x) => ['접수', '조치 중', '보류'].includes(x.st)).sort((a, b) => ST.indexOf(a.st) - ST.indexOf(b.st) || String(a.dueEff || '9').localeCompare(String(b.dueEff || '9')));
    const one = (x) => `<article class="rq ck" data-i="${x.id}"><div class="rq-l"><div class="rq-h"><span class="id">${esc(x.no)}</span>${stB(x.st)}<span class="is-t">${esc(x.type)}</span></div><b class="rq-t">${esc(x.title)}</b>`
      + `<div class="ct-kv"><span>해당 주문</span><b>${x.n ? n0(x.n) + '건' : '-'}</b></div><div class="ct-kv"><span>해당 물량</span><b>${x.t != null ? n0(x.t) + 't' : '-'}</b></div><div class="ct-kv"><span>원인</span><b>${esc(x.why || x.text || '-')}</b></div><div class="ct-kv"><span>해야 할 조치</span><b>${esc(x.act || '-')}</b></div>`
      + `${x.orders.length ? `<div class="rq-o">${x.orders.slice(0, 4).map((o) => `<span>${esc(o.id)} <b>${n1(o.remT)}t</b> ${md(o.due)}</span>`).join('')}${x.orders.length > 4 ? `<span class="sub">외 ${x.orders.length - 4}건</span>` : ''}</div>` : ''}</div>`
      + `<div class="rq-r"><div class="ct-kv"><span>요청사항</span><b>${esc(x.note || '-')}</b></div><div class="ct-kv"><span>담당</span><b>${esc(x.owner || x.dept)}</b></div><div class="ct-kv"><span>요청일</span><b>${md(x.at0)}</b></div><div class="ct-kv"><span>기한</span><b>${dueTd(x, asOf)}</b></div>`
      + `<div class="ct-kv"><span>결과</span><b>${esc(STN[x.st] || x.st)}</b></div><ol class="rq-h2">${x.hist.slice(-3).reverse().map((e) => `<li>${md(String(e.at).slice(0, 10))} ${esc(e.by || '')} · ${esc(STN[e.st] || e.st || '')}${e.note ? ` — ${esc(e.note)}` : ''}</li>`).join('')}</ol></div></article>`;
    return `<section class="card"><h2>조정 요청 <small>접수됨·조치 진행 중·보류 ${R.length}건</small></h2>${R.length ? R.map(one).join('') : '<p class="ct-note">조정 중인 이슈 없음 — 이슈 현황에서 담당이 접수하면 여기에 표시</p>'}</section>`;
  }

  function openIssue(x, asOf) {
    const kv = (k, v) => `<div class="ct-kv"><span>${esc(k)}</span><b>${v}</b></div>`;
    const ord = x.orders.slice(0, 60).map((o, i) => `<tr class="ck" data-o="${i}"><td>${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${esc(o.line || '')}</small></td><td class="r">${n1(o.remT)}t</td><td>${md(o.due)}</td></tr>`).join('');
    const hist = x.hist.length ? `<ol class="rq-h2">${x.hist.slice().reverse().map((e) => `<li><b>${esc(STN[e.st] || e.st || '-')}</b> ${md(String(e.at).slice(0, 10))} ${String(e.at).slice(11, 16)} · ${esc(e.by || '')}${e.owner ? ` · 담당 ${esc(e.owner)}` : ''}${e.due ? ` · 기한 ${md(e.due)}` : ''}${e.note ? `<div>${esc(e.note)}</div>` : ''}</li>`).join('')}</ol>` : '<p class="ct-note">기록 없음</p>';
    const dis = EV == null || evErr ? ' disabled' : '';
    const form = `<form class="is-f" id="is-f"><label>진행상태<select name="st"${dis}>${ST.map((s) => `<option value="${s}"${s === x.st ? ' selected' : ''}>${esc(STN[s])}</option>`).join('')}</select></label>`
      + `<label>담당<input name="owner" value="${esc(x.owner || '')}" placeholder="${esc(x.dept)}"${dis}></label><label>조치 기한<input type="date" name="due" value="${esc(x.dueSet || x.due || '')}"${dis}></label>`
      + `<label class="w">메모<textarea name="note" rows="2" placeholder="요청사항·조치 내용"${dis}></textarea></label><button type="submit"${dis}>저장</button><p class="is-msg" id="is-msg">${evErr ? '조치 상태를 못 읽어 저장할 수 없습니다' : ''}</p></form>`;
    CT.panel(`<div class="ct-pd-h">${stB(x.st)} <span class="is-t">${esc(x.type)}</span></div>` + kv('이슈번호', esc(x.no)) + kv('내용', esc(x.title)) + (x.text ? kv('', esc(x.text)) : '') + kv('해야 할 조치', `<b>${esc(x.act || '-')}</b>`) + kv('출처', esc(x.src)) + kv('담당 부서', esc(x.dept)) + kv('조치 기한', x.dueEff ? `${md(x.dueEff)}${x.over ? ' (지남)' : ''}` : '즉시 확인')
      + (x.t != null ? kv('해당 물량', n0(x.t) + 't') : '') + (x.grps ? kv('쓰는 판매그룹', esc(x.grps.map(CT.grpName).join('·'))) : '') + (x.link ? kv('관련 화면', `<a href="${esc(x.link)}">열기 →</a>`) : '')
      + `<h4>상태 변경</h4>${form}<h4>조치 이력</h4>${hist}`
      + (ord ? `<h4>해당 주문 ${x.orders.length}건${x.nOrdEst ? ' <small>(판매그룹·부족 시작일 기준 후보)</small>' : ''}</h4><table class="ct-t"><tbody>${ord}</tbody></table>` : ''), `${x.no} · ${x.type}`, (p) => {
      p.querySelectorAll('tr[data-o]').forEach((t) => t.onclick = () => { const o = x.orders[+t.dataset.o]; CT.panel(CT.orderDetail(o), o.id); });
      const f = p.querySelector('#is-f');
      f.onsubmit = async (e) => {
        e.preventDefault(); const F = new FormData(f), msg = p.querySelector('#is-msg');
        const ev = { t: 'issue', id: x.id, st: F.get('st'), title: x.title };
        if (F.get('owner')) ev.owner = F.get('owner'); if (F.get('due')) ev.due = F.get('due'); if (F.get('note')) ev.note = F.get('note');
        f.querySelector('button').disabled = true; msg.textContent = '저장 중…';
        try { await CT.store.push(ev); CT.panel(null); await load(); } catch (er) { msg.textContent = '⚠ ' + er.message; f.querySelector('button').disabled = false; }
      };
    });
  }
})();
