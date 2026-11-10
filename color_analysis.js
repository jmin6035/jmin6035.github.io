/* 컬러 조건 분석 — 도금 조건 분석(analysis.html · analysis.js)과 같은 양식·같은 클래스
   자료: published/color_cond.enc.json (cglplan/color_cond.py, 매일 재계산) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? '-' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const pc = (d) => (d == null ? '-' : `${d > 0 ? '+' : ''}${fmt(d * 100, 1)}%`);

  function render(a) {
    $('ca-empty').hidden = true; $('ca-body').hidden = false;
    $('ca-meta').textContent = [`분석 ${String(a.built).replace('T', ' ')}`, `실적 ~${md(a.asOf)}`, `계획 조건 = ${a.planFrom} ~ ${a.planTo} 실적 속도`].join(' · ');
    const N4 = a.n4 || 4, N12 = a.n12, N13 = a.n13 || 13; A = { N4, N12 };
    $('ca-period').textContent = `— 실적 ${a.period.from} ~ ${a.period.to} (${N13}주)`;
    if ($('ca-plan-per')) $('ca-plan-per').textContent = `${a.planFrom} ~ ${a.planTo}`;
    if ($('ca-rs-sub')) $('ca-rs-sub').textContent = `— ${a.period.from} ~ ${a.period.to}(${N13}주), 라인별 많은 순 8개`;
    $('ca-lines').innerHTML = Object.entries(a.lines).map(([l, x]) => `<div class="line-card"><h3>${l}</h3><dl>
      <dt>제품 생산</dt><dd>${fmt(x.tons)}t · 코일 ${fmt(x.coils)}개</dd>
      <dt>기간</dt><dd>${fmt(x.days)}일 (가동 ${fmt(x.opDays)}일)</dd>
      <dt>작업 비율</dt><dd>${x.util != null ? fmt(x.util * 100, 1) + '%' : '-'} <small class="muted">(작업 ÷ 작업 + 정지)</small></dd>
      <dt>속도</dt><dd>${fmt(x.tph13, 2)} t/hr <small class="muted">(계획 조건 ${fmt(x.tphPlan, 2)})</small></dd>
      <dt>최근 ${N4}주</dt><dd>${fmt(x.tph4, 2)} t/hr · 품목 구성 감안 <b>${pc(x.idx4 - 1)}</b></dd>
      <dt>휴지</dt><dd>${fmt(x.stopPerDay, 1)}시간/가동일 <small class="muted">(생산한 날 하루 평균 정지 — 속도에 이미 포함)</small></dd>
      <dt>휴지 구성</dt><dd>${x.stops.map(([c, h]) => `${esc(c)} ${fmt(h, 1)}h`).join(' · ') || '-'}</dd></dl></div>`).join('');
    const warn = Object.entries(a.lines).filter(([, x]) => x.idx4 != null && Math.abs(x.idx4 - 1) >= 0.05).map(([l, x]) => `${l} 최근 ${N4}주 속도가 계획 속도보다 ${pc(x.idx4 - 1)} — 계획 속도 조정 검토${N4 < 4 ? ' (자료 ' + N4 + '주뿐 — 더 쌓인 뒤 판단)' : ''}`);
    $('ca-warns').innerHTML = warn.map((m) => `<li class="warn">경고 · ${esc(m)}</li>`).join('');
    { const ln = Object.entries(a.lines).filter(([, x]) => x.idx4 != null && Math.abs(x.idx4 - 1) >= 0.05), ap = (a.cands || []).filter((c) => c.kind !== 'line' && c.apply);   // 11/11 첫 화면 판정
      $('ca-sum').innerHTML = `<span><span class="big ${ln.length ? 'warn' : 'ok'}">${ln.length}</span> 라인 ±5% 넘음</span><span><span class="big ${ap.length ? 'warn' : ''}">${ap.length}</span> 품명 반영 권장</span>`
        + `<span class="lst">${ln.length ? ln.map(([l, x]) => `${l} ${pc(x.idx4 - 1)}`).join(' · ') + ' — 계획 속도 조정 검토' : '라인 속도 = 계획 ±5% 안'} · 품명별은 아래 '계획 속도 점검'</span>`; }
    renderCands(a);
    renderWeekly(a);
    const RS = a.reasons || [];
    $('ca-reason-card').hidden = !RS.length;
    const days = Object.fromEntries(Object.entries(a.lines).map(([l, x]) => [l, x.opDays || 1]));
    $('ca-reasons').innerHTML = '<tr><th>라인</th><th>구분</th><th>사유</th><th>분</th><th>건</th><th>분/일</th></tr>' + RS.map((x) =>
      `<tr><td>${x.line}</td><td>${esc(x.kind)}</td><td>${a.hasNames ? esc(x.reason) : `코드 ${esc(x.code)} <small class="muted">예: ${esc(x.reason)}</small>`}</td><td class="n">${fmt(x.minutes)}</td><td class="n">${x.n}</td><td class="n">${fmt(x.minutes / days[x.line], 1)}</td></tr>`).join('');
    if (!a.hasNames) $('ca-rs-note').textContent += ' 사유 코드 이름은 다음 자동 갱신부터 표시(현재는 코드와 메모 예시).';
    if (window.UI) UI.reveal(document.querySelector('main'));
  }

  /* 계획 조건 후보: 라인 카드(품목 구성 감안 속도, ±5% 허용 띠) + 라인별 품명 막대(계획보다 빠름/느림, 4주 시간 영향 순) */
  let cf = 'act', cl = null, A = { N4: 4, N12: 12 };
  function renderCands(a) {
    const C = a.cands, LN = Object.keys(a.lines);
    cl = cl || LN[0];
    const verdict = (c) => (c.apply ? ['반영 권장', 'warn'] : c.flag ? ['검토', 'info'] : ['유지', '']);
    const tons = (c) => c.t4 != null ? c.t4 : +((String(c.basis).match(/4주 ([\d,]+)t/) || [])[1] || '0').replace(/,/g, '');
    const lineCard = (l) => { const c = C.find((x) => x.kind === 'line' && (x.line === l || x.label.startsWith(l))); if (!c) return '';
      const d = c.diff || 0, pos = Math.max(-15, Math.min(15, d * 100)), vd = verdict(c), np = C.filter((x) => x.kind !== 'line' && (x.line || x.label.split(' ')[0]) === l && x.apply).length;
      return `<button type="button" class="cc-line${l === cl ? ' on' : ''}" data-l="${l}"><div class="cc-h"><b>${l}</b><span class="tag ${vd[1]}">${vd[0]}</span></div>
        <div class="cc-v ${Math.abs(d) >= 0.05 ? (d > 0 ? 'pos' : 'neg') : ''}">${d >= 0 ? '+' : ''}${fmt(d * 100, 1)}<small>%</small></div><p>계획 속도 대비 최근 ${A.N4}주 실제 속도(품목 구성 감안)</p>
        <div class="cc-scale"><span class="band"></span><span class="mid"></span><i style="left:${50 + pos / 15 * 50}%"></i></div><div class="cc-ax"><span>-15%</span><span>±5% 허용</span><span>+15%</span></div>
        <p class="cc-n">반영 권장 품명 <b>${np}</b>개 · ${esc(c.basis)}</p></button>`; };
    const P = C.filter((x) => x.kind !== 'line' && (x.line || x.label.split(' ')[0]) === cl && x.diff != null)
      .map((x) => ({ ...x, prod: x.prod || x.label.split(' ')[1], t: tons(x), h: x.hLoss != null ? x.hLoss : null }))
      .filter((x) => cf === 'all' || (cf === 'act' ? x.flag : cf === 'apply' ? x.apply : !x.flag))
      .sort((p, q) => Math.abs(q.h || 0) - Math.abs(p.h || 0) || q.t - p.t);
    const big = P.filter((x) => x.t >= 150), small = P.filter((x) => x.t < 150);
    const row = (x) => { const d = Math.max(-0.4, Math.min(0.4, x.diff)), w = Math.abs(d) / 0.4 * 34, vd = verdict(x);   // 막대 반폭 최대 34% — 끝에 붙는 % 글자가 옆 칸을 넘지 않게
      return `<div class="cp-row ${x.apply ? 'ap' : x.flag ? '' : 'ok'}"><div class="cp-n"><b>${esc(x.prod)}</b><small>${A.N4}주 ${fmt(x.t)}t</small></div>
        <div class="cp-bar"><span class="mid"></span><span class="band"></span><i class="${x.diff >= 0 ? 'p' : 'n'}" style="${x.diff >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%"></i><em style="${x.diff >= 0 ? `left:calc(${50 + w}% + 6px)` : `right:calc(${50 + w}% + 6px)`}">${x.diff >= 0 ? '+' : ''}${fmt(x.diff * 100, 1)}%</em></div>
        <div class="cp-v">${fmt(x.cur, 2)} → <b>${fmt(x.act, 2)}</b> <small>t/hr</small>${x.v12 != null ? `<small class="muted"> · 앞 ${A.N12}주 ${fmt(x.v12, 2)}</small>` : ''}</div>
        <div class="cp-h">${x.h != null ? `${x.h > 0 ? '+' : ''}${fmt(x.h, 1)}h` : '-'}</div><div class="cp-s"><span class="tag ${vd[1]}">${vd[0]}</span></div></div>`; };
    const F = [['act', '반영 권장·검토'], ['apply', '반영 권장만'], ['ok', '유지'], ['all', '전체']];
    $('ca-cands').innerHTML = `<div class="cc-lines">${LN.map(lineCard).join('')}</div>
      <div class="cp-bar0"><b>${cl} 품명별 속도</b><div class="seg" id="ca-cf">${F.map(([k, n]) => `<button type="button" data-f="${k}" aria-pressed="${k === cf}">${n}</button>`).join('')}</div></div>
      <div class="cp-head"><span>품명</span><span>계획 대비 실제 속도 <small>(왼쪽 = 느림, 오른쪽 = 빠름 · 회색 띠 = ±5%)</small></span><span>계획 속도 → 실제 속도</span><span>시간 차이 (${A.N4}주)</span><span>판정</span></div>
      ${big.map(row).join('') || '<p class="hint" style="padding:12px 0">해당 품명 없음</p>'}
      ${small.length ? `<details class="cp-more"><summary>${A.N4}주 물량 150t 미만 품명 ${small.length}개 — 표본이 작아 참고만</summary>${small.map(row).join('')}</details>` : ''}
      <p class="hint"><b>시간 차이</b> = 최근 ${A.N4}주에 만든 물량이 실제로 걸린 시간 − 계획 속도였다면 걸렸을 시간. 예: −5.1h = 실제가 더 빨라 5.1시간 덜 걸림(계획이 속도를 낮게 잡음), +2.4h = 2.4시간 더 걸림(계획이 너무 빠르게 잡음). <b>반영 권장</b> = 차이 5% 이상 · 150t 이상 · 그 이전 기간도 같은 방향 · 자료 4주 이상일 때. 반영은 다음 계획 계산 때 함께 합니다.</p>`;
    $('ca-cands').querySelectorAll('.cc-line').forEach((b) => b.onclick = () => { cl = b.dataset.l; renderCands(a); });
    $('ca-cands').querySelectorAll('#ca-cf button').forEach((b) => b.onclick = () => { cf = b.dataset.f; renderCands(a); });
  }

  /* 11/10 점검: 월별 제품 생산량 = 모든 품명(mtons) — 100t 이상 품명만 더하면 실적보다 작음 */
  function renderWeekly(a) {                                      // 월 단위(이번 달 = 누계, 잘린 첫 달 제외)
    const W = a.monthly || [], ms = a.months || [], mn = (m) => `${+m.slice(5)}월${m === a.asOf.slice(0, 7) ? ` <small class="muted">(~${md(a.asOf)})</small>` : ''}`;
    const keys = [...new Set(W.map((r) => `${r[1]}|${r[2]}`))].sort((x, y) => (x.split('|')[0] === y.split('|')[0] ? 0 : x < y ? -1 : 1));
    const cell = (k, m) => {
      const r = W.find((x) => x[0] === m && `${x[1]}|${x[2]}` === k);
      if (!r || !(r[4] > 0) || r[3] < 20) return `<td class="n muted"${r && r[3] > 0 ? ` title="${fmt(r[3], 1)}t — 20t 미만이라 속도 생략"` : ''}>-</td>`;   // 11/10 점검: 몇 톤짜리 달이 0.0·0.9 t/hr 로 보이던 것
      const rate = r[3] / r[4], c = a.cur[k], d = c ? rate / c - 1 : 0;
      return `<td class="n ${d <= -0.05 ? 'neg' : d >= 0.05 ? 'pos' : ''}" title="${fmt(r[3])}t · ${r[5]}코일">${fmt(rate, 1)}</td>`;
    };
    $('ca-weekly').innerHTML = `<tr><th>라인·품명</th>${ms.map((m) => `<th>${mn(m)}</th>`).join('')}<th>계획 속도</th></tr>`
      + keys.map((k) => `<tr><td>${k.split('|').join(' ')}</td>${ms.map((m) => cell(k, m)).join('')}<td class="n">${a.cur[k] ? fmt(a.cur[k], 1) : '-'}</td></tr>`).join('');
    const lines = Object.keys(a.lines);
    $('ca-wtons').innerHTML = `<tr><th>월</th>${lines.map((l) => `<th>${l}</th>`).join('')}<th>합계</th></tr>` + ms.map((m) => { const v = lines.map((l) => (a.mtons ? (a.mtons.find((r) => r[0] === m && r[1] === l) || [0, 0, 0])[2] : W.filter((r) => r[0] === m && r[1] === l).reduce((s_, r) => s_ + r[3], 0))); return `<tr><td>${mn(m)}</td>${v.map((x) => `<td class="n">${fmt(x)}</td>`).join('')}<td class="n"><b>${fmt(v.reduce((p, q) => p + Math.round(q), 0))}</b></td></tr>`; }).join('');
    $('ca-events').innerHTML = `<tr><th>월</th>${lines.map((l) => `<th>${l}</th>`).join('')}</tr>` + ms.map((m) => `<tr><td>${mn(m)}</td>${lines.map((l) => {
      const r = (a.mstop || []).find((x) => x[0] === m && x[1] === l); return `<td class="n">${r && r[3] ? fmt(r[2] / r[3], 1) : '-'}</td>`; }).join('')}</tr>`).join('');
  }

  let env = null;
  const envReady = GP.latest('color_cond.enc.json');
  async function unlock(pw) {
    if (!env) env = await envReady;
    try { const a = await GP.decryptJSON(env, pw); try { if ($('ca-remember').checked) localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } render(a); }
    catch (e) { $('ca-unlock').hidden = false; $('ca-empty-title').textContent = '분석 결과 열기'; $('ca-unlock-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; }
  }
  $('ca-unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('ca-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else { $('ca-unlock').hidden = false; $('ca-empty-title').textContent = '분석 결과 열기'; }
  }).catch(() => { $('ca-empty-title').textContent = '분석 결과가 없습니다'; });
})();
