/* 예시(통합안) 운영·의견 — 11/18 사장님 회의 '쓰면서 고쳐라 · 판매하는 사람에게 구체 사례로 설명'.
   ① 의견(모든 예시 화면 오른쪽 아래 '의견' 단추 → 공유 저장소 t:'fb') ② 결정 기록(룸판 t:'room') ③ 바뀌는 점(부서별, 지금 자료로 만든 사례) ④ 자료·전산 요청 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  const when = (e) => String(e.at || '').slice(5, 16).replace('T', ' ');
  let X = null, EV = [];

  function cases() {
    const CCL = ['1CCL', '3CCL', '4CCL', '2CCL'], MAIN = ['1CCL', '3CCL', '4CCL'];
    const cc = (l, s) => (X.color[l] || {})[s] || null;
    const m = '2026-12', S = [1, 2, 3].map((k) => `${m}-${k}`);
    const D0 = S.map((s) => CCL.reduce((a, l) => a + ((cc(l, s) || {}).dom || 0), 0)), cap1 = S.map((s) => MAIN.reduce((a, l) => a + ((cc(l, s) || {}).cap || 0), 0));
    const TD = D0.reduce((a, v) => a + v, 0), C1 = cap1.reduce((a, v) => a + v, 0) || 1, D1 = cap1.map((c) => TD * c / C1);
    const SL = (X.sales.C수출 || []).find((x) => x.m === m) || {}, ordM = X.pull.rows.filter((r) => r.due.slice(0, 7) === m).reduce((a, r) => a + r.t, 0);
    const jan = X.pull.rows.filter((r) => r.exp && r.due.slice(0, 7) === '2027-01').reduce((a, r) => a + r.t, 0);
    const noMat = X.pull.rows.filter((r) => r.exp && /소재 없음/.test(r.st)).reduce((a, r) => a + r.t, 0);
    const selfDec = Object.values(X.cgl).reduce((a, L) => a + S.reduce((b, s) => b + Object.values((L[s] || {}).self || {}).reduce((c, v) => c + v, 0), 0), 0);
    let low = null; for (const [al, ser] of Object.entries(X.self || {})) for (const r of ser) if (!low || r[1] < low[1]) low = [al, r[1], r[0]];
    const u2 = Object.entries(X.color['2CCL'] || {}).filter(([, c]) => c.dom + c.exp >= 0.5);
    const lab = ['상순', '중순', '하순'];
    return [
      ['컬러수출그룹', '빈 룸을 채우는 주인공 — 월초·월중에 주저 말고 분산 수주, 다음 달 오더 당기기',
        `12월 판매계획 ${n0(SL.sales)}t 중 미결 수주 ${n0(ordM)}t → <b>${n0(Math.max(0, (SL.sales || 0) - ordM))}t 더 받아 와야 함</b>. 1월 납기 오더 ${n0(jan)}t 은 12월 빈 룸으로 당길 후보(계약분이라 재고가 늘어도 나감).`],
      ['컬러건재판매그룹', '내수는 순 단위로 정해 끊음 — 월초에 깔고 월말에 급히 돌리는 일 없음',
        `12월 내수 ${n0(TD)}t: 지금 계획 ${S.map((s, i) => `${lab[i]} ${n0(D0[i])}`).join(' · ')} → 순 고정 <b>${D1.map((v, i) => `${lab[i]} ${n0(v)}`).join(' · ')}</b>. 정한 몫 밖의 급한 추가는 수주 조정(룸판)에서 결정.`],
      ['도금 판매(수주)', '컬러용 자가재 몫은 고정 — 도금 주문이 늘어도 건드리지 않음, 나머지 룸은 수익 중심',
        `12월 자가재 ${n0(selfDec)}t 고정. 지금 계획 자가재 최저 <b>${low ? `${low[0]} ${low[1] < 0 ? '−' : ''}${n0(Math.abs(low[1]))}t(${md(low[2])})` : '–'}</b>${low && low[1] < -0.5 ? ' — 이 몫부터 채워야 함' : ''}.`],
      ['소재 구매', '수주가 정한 순 배정에 맞춰 발주 — 당긴 오더의 소재가 먼저',
        `당길 후보 수출 오더 중 소재 없음 <b>${n0(noMat)}t</b> — 당기기로 정하면 바로 발주 대상.`],
      ['현장(공정)', '2CCL 은 최후 — 다른 CCL 이 찰 때만, 가동은 사장님 결정',
        `지금 계획에서 2CCL 가동 ${u2.length}순(${u2.map(([s, c]) => `${+s.slice(5, 7)}월 ${lab[+s.slice(8) - 1]} ${n0(c.dom + c.exp)}t`).join(' · ') || '없음'}). 일별 계획 → 작업지시 → 도료 주문이 규칙적으로.`],
    ];
  }

  const fst = (id) => { let st = '접수'; for (const x of EV) if (x.t === 'fbSt' && x.ref === id) st = x.st; return st; };
  function render() {
    const FB = EV.filter((e) => e.t === 'fb'), DC = EV.filter((e) => e.t === 'room' && e.kind);
    const li = (L, f) => (L.length ? `<ul class="dlog">${L.slice().reverse().map(f).join('')}</ul>` : '<p class="q">아직 없음</p>');
    $('ct-main').innerHTML = `<div class="op-k"><div><span>의견(반영 전)</span><b>${FB.filter((e) => fst(CT.issueId(`${e.at}|${e.by}|${e.text}`)) !== '반영함').length}<small>/${FB.length}건</small></b><em>모든 예시 화면 오른쪽 아래 '의견'</em></div><div><span>수주 조정 결정</span><b>${DC.length}<small>건</small></b><em>룸판 칸에서 기록</em></div><div><span>시행</span><b>1분기</b><em>연말까지 설명 · 정기인사로 조직</em></div></div>
      <section class="card"><h2>부서별 바뀌는 점 <small>지금 자료로 만든 사례 — 설명회에 그대로 씀</small></h2><div class="op-w"><table class="op-t"><thead><tr><th class="l">부서</th><th class="l">바뀌는 일</th><th class="l">지금 숫자로 본 사례</th></tr></thead><tbody>${cases().map(([a, b, c]) => `<tr><td class="l"><b>${a}</b></td><td class="l" style="white-space:normal;min-width:240px">${b}</td><td class="l" style="white-space:normal;min-width:320px">${c}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><h2>의견 <small>쓰면서 고친다 — 화면별로 모아 반영</small></h2>${li(FB, (e) => { const id = CT.issueId(`${e.at}|${e.by}|${e.text}`), st = fst(id); return `<li><div><small>${esc(when(e))}</small><small>${esc(e.by)}</small><b>${esc(e.page || '')}</b> <span class="chip ${st === '반영함' ? 'ok' : st === '보류' ? 'na' : 'warn'}">${st}</span> — ${esc(e.text)}</div><div class="sts">${['반영함', '검토 중', '보류'].filter((x) => x !== st).map((x) => `<button type="button" class="btn sub sm" data-fref="${id}" data-st="${x}">${x}</button>`).join('')}</div></li>`; })}</section>
      <section class="card"><h2>수주 조정 결정 기록 <small>룸판에서 남긴 것</small></h2>${li(DC, (e) => `<li><small>${esc(when(e))}</small><small>${esc(e.by)}</small><b>${esc((e.key || '').replace('|', ' '))}</b> — ${esc(e.text)}</li>`)}</section>
      <section class="card"><h2>자료·전산 요청 <small>정착 전에 풀어야 할 것</small></h2><div class="op-w"><table class="op-t"><thead><tr><th class="l">요청</th><th class="l">왜</th><th class="l">누구</th></tr></thead><tbody>
        <tr><td class="l"><b>MES 주문서에 판매 희망 시점(납기)</b></td><td class="l" style="white-space:normal">언제 팔 물량인지 없어 순 배정·당기기 판단 불가(지금 '당월 내 출고'로 대신)</td><td class="l">마케팅·IT</td></tr>
        <tr><td class="l"><b>컬러 주문 ↔ 소재 매칭 전산</b></td><td class="l" style="white-space:normal">당길 오더의 소재 확보 여부가 정확해야 당김 결정 가능</td><td class="l">IT·소재 구매</td></tr>
        <tr><td class="l"><b>재고 ↔ 출하 지시 연결</b></td><td class="l" style="white-space:normal">재고 판단을 계약 종류가 아니라 실제 출하 예정일로</td><td class="l">IT·물류</td></tr>
        <tr><td class="l"><b>사내 서버 이관 · 연동 시스템 5개 협의</b></td><td class="l" style="white-space:normal">정식 조직 도구로 쓰려면 공개 사이트(암호화) → 사내, 포맷 변경 영향 시스템과 협의</td><td class="l">IT·현장</td></tr>
        <tr><td class="l"><b>순 고정 구간(다음 순은 고정, 그 뒤만 다시 짜기)</b></td><td class="l" style="white-space:normal">매주 롤링으로 계획이 자주 바뀌는 우려 — 고정 구간을 정해 둠</td><td class="l">수주·판생</td></tr>
      </tbody></table></div></section>`;
    document.querySelectorAll('[data-fref]').forEach((btn) => btn.addEventListener('click', async () => { try { await CT.store.push({ t: 'fbSt', ref: btn.dataset.fref, st: btn.dataset.st }); EV = await CT.store.events(); render(); } catch (e) { alert(e.message); } }));
    if (window.UI && UI.sub) UI.sub('쓰면서 고치기 · 연말까지 설명 · 1분기 시행 — 11/18 사장님 회의');
  }
  CT.boot(['preview_ops.enc.json'], async (D) => { X = D.preview_ops; render(); try { EV = await CT.store.events(); render(); } catch (e) { /* 공유 저장소 못 읽음 */ } });
})();
