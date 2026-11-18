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
      <div><span>제품 재고 합계</span><b>${n0(all)}<small>t</small></b><em>${+S.month.slice(4)}월 말 MES · 판매가 확실하면 총량은 유연</em></div></div>`;
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
    const t2 = `<div class="op-w"><table class="op-t"><thead><tr><th class="l">공정</th><th class="l">판매그룹</th><th class="l">용도</th><th>90일 넘은 재고 판매</th></tr></thead><tbody>${Object.entries(u).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => { const [pl, g, us] = k.split('|'); return `<tr><td class="l">${PL[pl]}</td><td class="l">${esc(g)}</td><td class="l">${esc(us)}</td><td class="bad">${n0(v)}</td></tr>`; }).join('')}</tbody></table></div>`;
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
      <section class="card"><h2>그룹별 재고 판정 <small>${ym} 말 MES 제품 재고 · t</small></h2><p class="q">수출·고객 주문 재고는 일시적으로 늘어도 됨 · 문제는 갈 곳 미정 재고(특히 컬러건재)가 줄지 않는 것</p>${t1}
        <p class="note">판정 = 계약번호 기준(수출 = 수출 계약, 내수 계약 6번째 자리 C = 재고기반(계획재 등), 그 밖 내수 = 고객 주문). 실제 출하 지시와 아직 잇지 않음 — 다음 단계: 미결 주문·출하 예정일 연결.</p></section>
      <section class="card"><h2>악성 후보 — 90일 넘은 재고 판매 <small>용도별 상위 12</small></h2>${t2}</section>
      <section class="card"><h2>지금 재고 추이 <small>판매그룹별 · 수주 관제와 같은 값</small></h2>${t3}</section>`;
    if (window.UI && UI.sub) UI.sub(`${ym} 말 MES 재고 · 추이 ${dz ? md(dz[0]) : ''}까지 · 11/18 사장님 회의 '그룹·용도별로, 악성인지 나갈 것인지'`);
  }
  CT.boot(['preview_ops.enc.json', 'suju.enc.json'], render);
})();
