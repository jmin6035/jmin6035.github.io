/* 도금 업무 캘린더: published/cg_tasks.enc.json (tools/cg_tasks_publish.py ← tools/sujoo_tasks.py, 엑셀과 같은 원본)
   10/28 사용자: 캘린더형으로 한눈에, 누르면 상세(왜·순서·보는 곳·기준·결과물), 보는 곳은 해당 포털 화면으로 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['월', '화', '수', '목', '금', '토', '일'], HALF = { am: '오전', pm: '오후' };
  const CAT = [['계획', '계획·승인'], ['소재', '소재 발주·추적'], ['생산', '생산·작업 순서'], ['확정', '주간 생산 확정'], ['납기', '납기·출하'], ['보고', '실적·보고']];
  let O = null, Y = 0, M = 0, DAY = 1;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const wd = (d) => (d.getDay() + 6) % 7;                                  // 월 0 … 일 6
  function whenText(t) {
    const w = t.when;
    if (w[0] === 'D') return `매일 ${HALF[w[1]]}`;
    if (w[0] === 'W') return `매주 ${DOW[w[1]]}요일 ${HALF[w[2]]}`;
    if (w[0] === 'M') return `매월 ${w[1][0] === -1 ? '말일 전 영업일' : (w[1].length > 1 ? `${w[1][0]}~${w[1][w[1].length - 1]}` : w[1][0]) + '일'} ${HALF[w[2]]}`;
    return '필요할 때';
  }
  function bizDays(y, m, days) {                                          // 엑셀(sujoo_plating_xlsx.biz_days)과 같은 규칙: 주말이면 다음 영업일
    const nd = new Date(y, m + 1, 0).getDate();
    if (days[0] === -1) { const d = new Date(y, m, nd - 1); while (wd(d) > 4) d.setDate(d.getDate() - 1); return [d]; }
    const ds = days.filter((k) => k <= nd).map((k) => new Date(y, m, k)), w = ds.filter((d) => wd(d) < 5);
    if (w.length) return w;
    const d = new Date(ds[0]); while (wd(d) > 4) d.setDate(d.getDate() + 1);
    return d.getMonth() === m ? [d] : [];
  }
  function itemsOf(d, h, mon) {
    const out = [...(mon[`${d.getDate()}|${h}`] || []), ...O.tasks.filter((t) => t.when[0] === 'W' && t.when[1] === wd(d) && t.when[2] === h)];
    return out.sort((a, b) => (a.cat === '확정' ? -1 : 0) - (b.cat === '확정' ? -1 : 0) || (a.when[0] === 'M' ? -1 : 0) - (b.when[0] === 'M' ? -1 : 0));
  }
  const PER = { D: '매일', W: '매주', M: '월 1회', C: '수시' };
  const tOf = (t) => (String(t.time || '').match(/\d{1,2}:\d{2}/) || [''])[0];   // 화면 정렬·표시용 시각(08:00)
  let VIEW = 'week', FIL = null;
  try { VIEW = localStorage.getItem('cgl-tasks-view') || 'week'; } catch (e) { /* 무시 */ }
  const dim = (t) => (FIL && t.cat !== FIL ? ' dim' : '');
  const chip = (t, big) => `<button type="button" class="ch k-${esc(t.cat)}${t.when[0] === 'M' || big ? ' b' : ''}${dim(t)}" data-id="${esc(t.id)}">${esc(t.cal || t.name)}${t.when[0] === 'M' ? '<i class="pm">월</i>' : ''}</button>`;
  const card = (t, showPer) => `<button type="button" class="tc k-${esc(t.cat)}${dim(t)}" data-id="${esc(t.id)}"><span class="tt">${esc(tOf(t) || HALF[t.when[t.when[0] === 'D' ? 1 : 2]] || '')}</span>`
    + `<span class="tb"><b>${esc(t.name)}</b><span class="ts">${esc(t.out)} → ${esc(t.to)}</span></span>${showPer ? `<i class="pp p-${t.when[0]}">${PER[t.when[0]]}</i>` : (t.when[0] === 'M' ? '<i class="pp p-M">월 1회</i>' : '')}</button>`;
  function monthMap(y, m) {
    const mon = {};
    O.tasks.filter((t) => t.when[0] === 'M').forEach((t) => bizDays(y, m, t.when[1]).forEach((d) => { (mon[`${d.getDate()}|${t.when[2]}`] = mon[`${d.getDate()}|${t.when[2]}`] || []).push(t); }));
    return mon;
  }
  const byTime = (a, b) => (a.cat === '확정' ? -1 : 0) - (b.cat === '확정' ? -1 : 0) || (tOf(a) || '99').localeCompare(tOf(b) || '99');
  function todayCard() {
    const d = new Date(); while (wd(d) > 4) d.setDate(d.getDate() + 1);
    const mon = monthMap(d.getFullYear(), d.getMonth()), lab = iso(d) === iso(new Date()) ? '오늘' : '다음 영업일';
    const col = (h) => { const L = [...itemsOf(d, h, mon), ...O.tasks.filter((t) => t.when[0] === 'D' && t.when[1] === h)].sort(byTime); return `<div><h3>${HALF[h]} <small>${L.length}건</small></h3>${L.map((t) => card(t, true)).join('')}</div>`; };
    return `<section class="card"><h2>${lab} 할 일 <small>${d.getMonth() + 1}/${d.getDate()}(${DOW[wd(d)]}) · 시각 순 · 누르면 상세</small></h2><div class="today">${col('am')}${col('pm')}</div></section>`;
  }
  function weekGrid() {                                                     // 이번 주(월~금) × 오전·오후 — 매일 할 일은 위 띠 한 줄
    const base = new Date(Y, M, Math.min(DAY, new Date(Y, M + 1, 0).getDate())), mon0 = new Date(base); mon0.setDate(base.getDate() - wd(base));
    const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(mon0); d.setDate(mon0.getDate() + i); return d; }), today = iso(new Date());
    const mm = {}; days.forEach((d) => { const k = `${d.getFullYear()}-${d.getMonth()}`; mm[k] = mm[k] || monthMap(d.getFullYear(), d.getMonth()); });
    const head = days.map((d) => `<div class="wh${iso(d) === today ? ' on' : ''}">${DOW[wd(d)]} <b>${d.getMonth() + 1}/${d.getDate()}</b></div>`).join('');
    const row = (h) => `<div class="wl">${HALF[h]}</div>` + days.map((d) => { const L = itemsOf(d, h, mm[`${d.getFullYear()}-${d.getMonth()}`]).sort(byTime); return `<div class="wc${iso(d) === today ? ' on' : ''}">${L.map((t) => card(t)).join('') || '<span class="none">-</span>'}</div>`; }).join('');
    return { title: `${mon0.getMonth() + 1}/${mon0.getDate()} ~ ${days[4].getMonth() + 1}/${days[4].getDate()} 주`, html: `<div class="wk"><div class="wl"></div>${head}${row('am')}${row('pm')}</div>` };
  }
  function monthGrid() {
    const first = new Date(Y, M, 1), start = new Date(Y, M, 1 - wd(first)), mon = monthMap(Y, M), today = iso(new Date());
    let cells = DOW.map((x, i) => `<div class="hd${i > 4 ? ' we' : ''}">${x}</div>`).join('');
    for (let k = 0; k < 42; k++) {
      const d = new Date(start); d.setDate(start.getDate() + k);
      if (k % 7 === 0) {                                                 // 평일(월~금)이 이번 달에 하루도 없는 주는 건너뜀
        const fri = new Date(d); fri.setDate(d.getDate() + 4);
        if (d.getMonth() !== M && fri.getMonth() !== M) { if (k >= 28) break; k += 6; continue; }
      }
      const inm = d.getMonth() === M, we = wd(d) > 4;
      let body = '';
      if (inm && !we) body = ['am', 'pm'].map((h) => { const L = itemsOf(d, h, mon); return L.length ? `<div class="hf h-${h}">${HALF[h]}</div>${L.map((t) => chip(t)).join('')}` : ''; }).join('');   // 매일 할 일은 칸마다 반복하지 않고 위 띠 한 줄로
      cells += `<div class="${!inm ? 'out' : we ? 'we' : ''}${inm && iso(d) === today ? ' on' : ''}"><div class="dn${wd(d) === 6 ? ' sun' : ''}">${inm ? d.getDate() : ''}</div>${body}</div>`;
    }
    return { title: `${Y}년 ${M + 1}월`, html: `<div class="cal">${cells}</div>` };
  }
  function calCard() {
    const g = VIEW === 'week' ? weekGrid() : monthGrid();
    const cnt = (k) => O.tasks.filter((t) => t.cat === k).length;
    const lg = CAT.map(([k, n]) => `<button type="button" class="lgb k-${k}" data-k="${k}" aria-pressed="${FIL === k}">${n} <small>${cnt(k)}</small></button>`).join('');
    const daily = (h) => O.tasks.filter((t) => t.when[0] === 'D' && t.when[1] === h).sort(byTime).map((t) => chip(t)).join('');
    return `<section class="card"><div class="nav"><span class="seg" id="tk-view"><button type="button" data-v="week" aria-pressed="${VIEW === 'week'}">이번 주</button><button type="button" data-v="month" aria-pressed="${VIEW === 'month'}">한 달</button></span>`
      + `<button type="button" id="tk-prev" aria-label="이전">‹</button><b>${g.title}</b><button type="button" id="tk-next" aria-label="다음">›</button><button type="button" id="tk-now">오늘</button></div>`
      + `<div class="lg"><span class="lgt">분류</span>${lg}${FIL ? '<button type="button" class="lgx" id="tk-all">전체 보기</button>' : ''}<span class="lgt" style="margin-left:14px">주기</span><span class="pp p-M">월 1회</span><span class="pp p-W">매주</span><span class="pp p-D">매일</span><span class="pp p-C">수시</span></div>`
      + `<div class="band"><span class="bl">매일</span><div><span class="bh">오전</span>${daily('am')}</div><div><span class="bh">오후</span>${daily('pm')}</div></div>`
      + g.html
      + `<div class="band"><span class="bl">수시</span><div>${O.tasks.filter((t) => t.when[0] === 'C').map((t) => chip(t)).join('')}</div></div>`
      + '<p class="note">날짜가 주말이면 다음 영업일 · 공휴일은 반영 안 함</p></section>';
  }
  function linkify(s) {                                                    // '포털: 주문진도 · 실적' · '포털 [주문진도]' → 해당 화면 링크
    const L = O.links || {};
    let x = esc(s).replace(/\[([^\]]+)\]/g, (m0, k) => (L[k] ? `<a href="${L[k]}">${esc(k)}</a>` : m0));
    x = x.replace(/포털: ([^/]+)/g, (m0, list) => '포털: ' + list.split(' · ').map((k) => { const kk = k.trim(); return L[kk] ? `<a href="${L[kk]}">${esc(kk)}</a>` : kk; }).join(' · '));
    return x;
  }
  function open(id) {
    const t = O.tasks.find((x) => x.id === id); if (!t) return;
    const dlg = $('tk-dlg');
    dlg.innerHTML = `<div class="th ch k-${esc(t.cat)}" style="border-radius:14px 14px 0 0;margin:0;cursor:default"><b>${esc(t.name)}</b><span>${whenText(t)}</span><button type="button" id="tk-x" aria-label="닫기">×</button></div>`
      + `<dl><dt>언제 · 얼마나</dt><dd><b>${esc(whenText(t))}</b>${t.time ? ` · ${esc(t.time)}` : ''}</dd><dt>왜 하나</dt><dd>${esc(t.why)}</dd><dt>이렇게 한다</dt><dd><ol>${t.steps.map((s) => `<li>${linkify(s)}</li>`).join('')}</ol></dd>`
      + `<dt>필요한 자료</dt><dd>${linkify(t.input || '-')}</dd><dt>보는 곳</dt><dd>${linkify(t.where)}</dd><dt>판단 기준</dt><dd>${esc(t.rule)}</dd><dt>결과물 → 받는 곳</dt><dd>${esc(t.out)} → <b>${esc(t.to)}</b></dd>`
      + `<dt>같이 하는 부서</dt><dd>${esc(t.raci || '-')} <span class="rk">R 실행 · A 책임 · C 협의 · I 공유</span></dd><dt>안 하면</dt><dd class="rs">${esc(t.risk || '-')}</dd>`
      + (t.note ? `<dt>주의</dt><dd>${esc(t.note)}</dd>` : '') + '</dl>';
    $('tk-x').onclick = () => dlg.close();
    dlg.showModal();
  }
  function render() {
    $('tk-main').innerHTML = todayCard() + calCard();
    $('tk-main').querySelectorAll('button[data-id]').forEach((b) => b.onclick = () => open(b.dataset.id));
    const step = (k) => { if (VIEW === 'week') { const d = new Date(Y, M, DAY + 7 * k); Y = d.getFullYear(); M = d.getMonth(); DAY = d.getDate(); } else { M += k; if (M < 0) { M = 11; Y--; } if (M > 11) { M = 0; Y++; } DAY = 1; } render(); };
    $('tk-prev').onclick = () => step(-1);
    $('tk-next').onclick = () => step(1);
    $('tk-now').onclick = () => { const n = new Date(); Y = n.getFullYear(); M = n.getMonth(); DAY = n.getDate(); render(); };
    $('tk-view').querySelectorAll('button').forEach((b) => b.onclick = () => { VIEW = b.dataset.v; try { localStorage.setItem('cgl-tasks-view', VIEW); } catch (e) { /* 무시 */ } render(); });
    $('tk-main').querySelectorAll('button.lgb').forEach((b) => b.onclick = () => { FIL = FIL === b.dataset.k ? null : b.dataset.k; render(); });
    if ($('tk-all')) $('tk-all').onclick = () => { FIL = null; render(); };
    if (window.UI) UI.reveal($('tk-main'));
  }
  $('tk-dlg').addEventListener('click', (e) => { if (e.target === $('tk-dlg')) $('tk-dlg').close(); });
  const envReady = GP.latest('cg_tasks.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('tk-msg').textContent = '아직 게시된 자료가 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('tk-form').hidden = false; $('tk-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    const n = new Date(); Y = n.getFullYear(); M = n.getMonth(); DAY = n.getDate();
    render();
  }
  $('tk-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('tk-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('tk-form').hidden = false; });
})();
