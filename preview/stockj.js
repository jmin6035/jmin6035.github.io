/* 예시(통합안) 재고 판단 — 11/18 사장님 회의: 재고는 총량이 아니라 그룹·용도·내수/수출별로, '어차피 나가는 재고(수출·주문)'와 '갈 곳 미정(재고 판매)'을 나눠 봄.
   판정(MES 재고 월말 스냅샷, 계약번호 기준): 수출 = 출하 예정(수출 계약) · 내수 계약 6번째 자리 C = 재고 판매(재고기반 계약 = 계획재 등) · 그 밖 내수 = 출하 예정(고객 주문) · 자가재 = 컬러 소재
   추이 = 수주 관제 그룹별 재고(날마다) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const KC = ['출하 예정(수출 계약)', '출하 예정(고객 주문)', '출하 예정(임가공)', '재고 판매(재고기반 계약)', '자가재'];
  const AG = ['30일 이하', '31~90일', '90일 넘음'];
  const PL = { G: '도금', C: '컬러' };
  const GN = { C건재: '컬러건재', C수출: '컬러수출', C수요: '수요개발', G국내: '도금국내', G수출: '도금수출', G자동차: '자동차', G자가재: '도금 자가재' };

  function render(D) {
    const X = D.preview_ops, S = X && X.stock, SJ = D.suju;
    if (!S) { $('ct-main').innerHTML = '<section class="card"><h2>재고 자료 없음</h2></section>'; return; }
    const R = S.rows.map(([pl, g, use, dom, kind, age, t]) => ({ pl, g, use, dom, kind, age, t }));
    const sum = (f) => R.filter(f).reduce((a, r) => a + r.t, 0);
    const ship = sum((r) => r.kind.startsWith('출하 예정')), sell = sum((r) => r.kind.startsWith('재고 판매')), sell90 = sum((r) => r.kind.startsWith('재고 판매') && r.age === '90일 넘음'), self = sum((r) => r.kind === '자가재'), all = sum(() => true);
    const ym = `${S.month.slice(0, 4)}-${S.month.slice(4)}`;
    const kpi = `<div class="op-k">
      <div class="bad"><span>갈 곳 미정(재고 판매)</span><b>${n0(sell)}<small>t</small></b><em>그중 90일 넘음 ${n0(sell90)}t — 악성 후보</em></div>
      <div class="ok"><span>출하 예정(수출·고객 주문)</span><b>${n0(ship)}<small>t</small></b><em>늘어도 어차피 나가는 재고</em></div>
      <div><span>자가재(컬러 소재)</span><b>${n0(self)}<small>t</small></b><em>컬러 룸용 고정 몫</em></div>
      <div><span>제품 재고 합계</span><b>${n0(all)}<small>t</small></b><em>${S.now ? md(S.now) + ' 지금' : +S.month.slice(4) + '월 말'} · 판매가 확실하면 총량은 유연</em></div></div>`;
    // 표 1: 공정 → 판매그룹 × 판정
    const grp = {}; for (const r of R) { const k = `${r.pl}|${r.g}`, o = (grp[k] = grp[k] || { pl: r.pl, g: r.g, c: {} }); const kk = r.kind.startsWith('재고 판매') ? `S|${r.age}` : r.kind; o.c[kk] = (o.c[kk] || 0) + r.t; }
    const cols = [['출하 예정(수출 계약)', '수출 계약'], ['출하 예정(고객 주문)', '고객 주문'], ['출하 예정(임가공)', '임가공'], ['S|30일 이하', '재고 판매 30일↓'], ['S|31~90일', '31~90일'], ['S|90일 넘음', '90일 넘음'], ['자가재', '자가재']];
    const cell = (o, k) => { const v = o.c[k] || 0; return `<td class="${k === 'S|90일 넘음' && v >= 0.5 ? 'bad' : v < 0.5 ? 'z' : ''}">${v >= 0.5 ? n0(v) : '–'}</td>`; };
    let body = '';
    for (const pl of ['C', 'G']) {
      const L = Object.values(grp).filter((o) => o.pl === pl).map((o) => Object.assign(o, { tot: Object.values(o.c).reduce((a, v) => a + v, 0) })).sort((a, b) => b.tot - a.tot);
      if (!L.length) continue;
      const T = { c: {} }; L.forEach((o) => Object.entries(o.c).forEach(([k, v]) => { T.c[k] = (T.c[k] || 0) + v; }));
      body += `<tr class="sec"><td colspan="${cols.length + 2}">${PL[pl]} ${n0(L.reduce((a, o) => a + o.tot, 0))}t</td></tr>` + L.map((o) => `<tr><td class="l"><b>${esc(o.g)}</b></td>${cols.map(([k]) => cell(o, k)).join('')}<td><b>${n0(o.tot)}</b></td></tr>`).join('');
    }
    const t1 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">판매그룹</th>${cols.map(([, n]) => `<th>${n}</th>`).join('')}<th>합계</th></tr><tr><th></th><th colspan="3" class="l">출하 예정 — 어차피 나감</th><th colspan="3" class="l">재고 판매(갈 곳 미정) — 재고일수</th><th></th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
    // 표 2: 악성 후보 용도
    const u = {}; R.filter((r) => r.kind.startsWith('재고 판매') && r.age === '90일 넘음').forEach((r) => { const k = `${r.pl}|${r.g}|${r.use}`; u[k] = (u[k] || 0) + r.t; });
    const act = (k) => { const L = EV.filter((e) => e.t === 'stockAct' && e.key === k); if (!L.length) return null; const e = L[L.length - 1]; let st = e.st; for (const x of EV) if (x.t === 'stockActSt' && x.ref === CT.issueId(`${e.at}|${e.by}|${e.key}`)) st = x.st; return Object.assign({}, e, { st }); };
    const U = Object.entries(u).sort((a, b) => b[1] - a[1]).slice(0, 12), nAct = U.filter(([k]) => act(k)).length;
    const t2 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">공정</th><th class="l">판매그룹</th><th class="l">용도</th><th>90일 넘은 재고 판매</th><th class="l">조치</th><th></th></tr></thead><tbody>${U.map(([k, v]) => { const [pl, g, us] = k.split('|'), a = act(k); return `<tr><td class="l">${PL[pl]}</td><td class="l">${esc(g)}</td><td class="l">${esc(us)}</td><td class="bad">${n0(v)}</td><td class="l">${a ? `<span class="chip ${a.st === '끝남' ? 'ok' : a.st === '보류' ? 'na' : 'warn'}">${esc(a.st)}</span> ${esc(a.act)} · ${esc(a.who || '')}${a.due ? ` · ${md(a.due)}까지` : ''}` : '<span class="chip">조치 없음</span>'}</td><td><button type="button" class="btn sub sm" data-sk="${esc(k)}" data-t="${Math.round(v)}">${a ? '바꾸기' : '조치 정하기'}</button></td></tr>`; }).join('')}</tbody></table></div><div id="sk-f"></div>`;
    // 표 3: 그룹별 지금 재고 추이(수주 관제)
    const SD = (SJ && SJ.stockDaily) || {};
    const t3rows = Object.entries(SD).filter(([g]) => GN[g]).map(([g, o]) => {
      const rs = (o.rows || []).filter((r) => r[3] === 'a'); if (!rs.length) return '';
      const a = rs[0], z = rs[rs.length - 1], dv = z[1] - a[1], exp = /수출/.test(g), self = /자가재/.test(g);
      const jd = self ? '컬러 소재(고정 몫)' : exp ? (dv > 0 ? '늘어도 정상 — 출하 예정' : '정상') : dv > 0 ? '갈 곳 확인 필요' : '줄어드는 중';
      return `<tr><td class="l"><b>${GN[g]}</b></td><td>${n0(a[1])}</td><td><b>${n0(z[1])}</b></td><td class="${dv > 0 && !exp && !self ? 'bad' : ''}">${dv > 0 ? '+' : dv < 0 ? '−' : ''}${n0(Math.abs(dv))}</td><td>${z[2] != null ? z[2].toFixed(1) + '일' : '–'}</td><td class="l">${jd}</td></tr>`;
    }).join('');
    const d0 = ((Object.values(SD)[0] || {}).rows || [])[0], dz = ((Object.values(SD)[0] || {}).rows || []).filter((r) => r[3] === 'a').slice(-1)[0];
    const t3 = t3rows ? `<div class="op-w"><table class="op-t"><thead><tr><th class="l">판매그룹</th><th>${d0 ? md(d0[0]) : ''}</th><th>${dz ? md(dz[0]) : ''}</th><th>증감</th><th>재고일수</th><th class="l">판단</th></tr></thead><tbody>${t3rows}</tbody></table></div>` : '<p class="q">추이 자료 없음</p>';
    $('ct-main').innerHTML = `${kpi}
      <section class="card"><h2>그룹별 재고 판정 <small>${S.now ? md(S.now) + ' 지금 재고' : ym + ' 말'} · t</small></h2><p class="q">수출·고객 주문 재고는 일시적으로 늘어도 됨 · 문제는 갈 곳 미정 재고(특히 컬러건재)가 줄지 않는 것</p>${t1}
        <p class="note">지금 재고 = 그룹별 지금 총량(수주 관제 그룹 재고·판생속보 자가재) × ${ym} 말 MES 재고의 계약 구성 · 재고일수 = 월말 재고일수 + 지난 날 · 판정: 수출 계약 / 고객 주문 = 출하 예정, 내수 재고기반 계약(계획재 등) = 재고 판매.</p></section>
      <section class="card"><h2>악성 후보 — 90일 넘은 재고 판매 <small>용도별 상위 12 · 조치 정함 ${nAct}/${U.length}</small></h2>${t2}</section>
      <section class="card"><h2>지금 재고 추이 <small>판매그룹별 · 수주 관제와 같은 값</small></h2>${t3}</section>`;
    document.querySelectorAll('[data-sk]').forEach((btn) => btn.addEventListener('click', () => form(btn.dataset.sk, +btn.dataset.t, act(btn.dataset.sk))));
    document.querySelectorAll('[data-sref]').forEach((btn) => btn.addEventListener('click', () => push({ t: 'stockActSt', ref: btn.dataset.sref, st: btn.dataset.st })));
    if (window.UI && UI.sub) UI.sub(`${S.now ? md(S.now) + ' 지금 재고' : ym + ' 말 재고'} · 추이 ${dz ? md(dz[0]) : ''}까지 · 11/18 사장님 회의 '그룹·용도별로, 악성인지 나갈 것인지'`);
  }
  let EV = [], DD = null;
  async function push(ev) { try { await CT.store.push(ev); EV = await CT.store.events(); render(DD); } catch (e) { alert(e.message); } }
  function form(k, t, a) {   // 악성 후보 조치: 무엇을 · 누가 · 언제까지 · 상태 — 판 안에서 정하고 바꿈
    const [pl, g, us] = k.split('|'), el = document.getElementById('sk-f'), id = a ? CT.issueId(`${a.at}|${a.by}|${a.key}`) : '';
    el.innerHTML = `<form class="pd" id="sk-form" novalidate><h3>${PL[pl]} ${esc(g)} 용도 ${esc(us)} — 90일 넘은 재고 판매 ${n0(t)}t</h3>
      <div class="row"><label>조치 <select id="sk-a">${['판매 촉진(고객 제안)', '할인·처분 검토', '용도 전환(다른 사양으로)', '수출 전환', '계획재 다음 순 몫 줄임'].map((x) => `<option${a && a.act === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <input id="sk-w" placeholder="담당" value="${esc(a ? a.who : g)}"><label>기한 <input type="date" id="sk-d" value="${esc(a ? a.due || '' : '')}"></label>
      <label>상태 <select id="sk-s">${['진행', '끝남', '보류'].map((x) => `<option${a && a.st === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <input id="sk-x" placeholder="메모" style="flex:1;min-width:180px"><button class="btn" type="submit">저장</button></div>
      ${a ? `<div class="row"><span class="note">빠른 상태:</span>${['끝남', '보류'].filter((x) => x !== a.st).map((x) => `<button type="button" class="btn sub sm" data-sref="${id}" data-st="${x}">${x}</button>`).join('')}</div>` : ''}</form>`;
    document.getElementById('sk-form').addEventListener('submit', (e) => { e.preventDefault(); push({ t: 'stockAct', key: k, t_: t, act: document.getElementById('sk-a').value, who: document.getElementById('sk-w').value.trim(), due: document.getElementById('sk-d').value, st: document.getElementById('sk-s').value, text: document.getElementById('sk-x').value.trim() }); });
    el.querySelectorAll('[data-sref]').forEach((btn) => btn.addEventListener('click', () => push({ t: 'stockActSt', ref: btn.dataset.sref, st: btn.dataset.st })));
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  CT.boot(['preview_ops.enc.json', 'suju.enc.json'], async (D) => { DD = D; render(D); try { EV = await CT.store.events(); render(D); } catch (e) { /* 공유 저장소 못 읽음 */ } });
})();
