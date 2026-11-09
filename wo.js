/* 작업지시 순서 제안: published/wo_proposal.enc.json (tools/wo_sequence.py)
   라인 탭 → 요약(지금 라인 · 이번 제안 · 예상 휴지 · MES 순서와 비교) → 날짜별 제안 순서 표 → 확정 대기열(접힘)
   작업지시 규칙 탭: 라인 탭 → 편성 조건 → 휴지 기준표 → 최근 바뀐 기준 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  const WD = '일월화수목금토';
  const dayNm = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00').getDay()]})`;
  // 'MM-DD HH:MM' → 그날이면 시각만, 다른 날이면 날짜도
  const tm = (s, d) => (!s ? '' : (d && s.slice(0, 5) === d.slice(5) ? s.slice(6) : `${+s.slice(0, 2)}/${+s.slice(3, 5)} ${s.slice(6)}`));
  const hm = (m) => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}시간\u00a0${m % 60}분` : `${m}분`; };   // 줄바꿈 때 '분'만 떨어지지 않게
  const TIER = { 1: '수출', 2: '내수·수요개발·주문재', 3: '계획재' };
  const BLK = { general: '일반', pvs2: 'PVS2', print: '프린트' };
  const DZ = [['col', '색·도료 교체'], ['order', '주문 바뀜'], ['test', '단판TEST'], ['roll', '폭(Roll)'], ['dummy', '두께(Dummy)'], ['block', '블록·프린트 전환']];
  let O = null, line = null;
  let view = 'seq';                                               // 탭: 작업지시 순서 | 작업지시 규칙(사용자 10/21) — 다시 바꿀 때까지 유지
  try { view = location.hash === '#rules' ? 'rules' : (localStorage.getItem('wo-view') || 'seq'); } catch (e) { /* 기본 */ }
  const tabs = () => `<div class="seg pgtab" id="wo-view"><button type="button" data-v="seq" aria-pressed="${view === 'seq'}">작업지시 순서</button><button type="button" data-v="rules" aria-pressed="${view === 'rules'}">작업지시 규칙</button></div>`;
  function bindTabs() {
    $('wo-view').querySelectorAll('button').forEach((b) => b.onclick = () => { view = b.dataset.v; try { localStorage.setItem('wo-view', view); history.replaceState(null, '', view === 'rules' ? '#rules' : location.pathname); } catch (e) { /* 무시 */ } render(); });
  }

  function row(x, day) {
    const dn = x.downMin > 0.5;
    const rdy = x.ready > O.today;
    const why = (x.why || '').replace(/PF입고예정일 비어 있음\(PF종류 [^)]*\)( · )?/, '');   // 준비 칸에 따로 보임
    const prep = [];
    if (x.paint) prep.push(`도료 ${rdy && x.ready === x.paint ? `<b class="rdy">${md(x.paint)}</b>` : md(x.paint)}`);
    if (x.pf && x.pf !== '00') prep.push(`PF ${esc(x.pf)} ${x.pfDate ? md(x.pfDate) : (x.dateErr && x.dateErr.includes('PF') ? '' : '<b class="rdy">입고일 없음</b>')}`);
    if (x.dateErr) prep.push(`<b class="rdy" title="MES 입고예정일이 반년 넘게 먼 날짜 — 입력 오류로 보고 기다리지 않게 계산">${esc(x.dateErr)} (확인)</b>`);
    if (x.smat) prep.push(`<b class="rdy">부자재 ${esc(x.smat)}</b>`);
    if (why) prep.push(`<span class="why">${esc(why)}</span>`);
    return `<tr${dn ? ' class="hasdn"' : ''}><td class="c"><b>${x.seq}</b></td>`
      + `<td class="tm">${dn ? `<span class="bk">휴지 ${tm(x.downStart, day)}</span><br>` : ''}<b>${tm(x.start, day)}</b> – ${tm(x.end, day)}</td>`
      + `<td class="l"><b>${esc(x.item)}</b><span class="gt gt${x.tier}">${TIER[x.tier]}</span><br><span class="bk">${esc(x.pdt)} · ${BLK[x.block]} · ${esc(x.con)}</span></td>`
      + `<td class="l wr">${x.thk} × ${n0(x.wdt)}<br><span class="bk">${esc(x.top || x.color)}${x.back ? ` / 이면 ${esc(x.back)}` : ''}${x.top ? '' : ' <span title="풀 코드 대기(도료 코드 조회)">…</span>'}</span></td>`
      + `<td class="num" title="${esc(x.speedSrc)}"><b>${x.t.toFixed(1)}t</b> · <span style="white-space:nowrap">${n0(x.runMin)}분</span><br><span class="bk">L/S ${x.ls} · ${x.tph}t/h</span>${x.tMade > 0.5 ? `<br><span class="bk" title="지시 ${x.tDrt}t 중 ${x.tMade}t 이미 생산">남은 양</span>` : ''}</td>`
      + `<td class="l wr">${(x.chg || []).map((c) => `<div>${esc(c)}</div>`).join('')}</td>`
      + `<td class="l wr">${(x.downs || []).length ? ((x.downs.length > 1 && dn) ? `<div class="wo-ds">합계 ${n0(x.downMin)}분</div>` : '') + x.downs.map((d) => `<div class="wo-dl"><b>${esc(d.c)}</b> <span class="${d.m ? 'wo-dm' : 'wo-d0'}">${d.m}분</span> <span class="bk">· ${esc(d.b)}</span></div>`).join('') : '<span class="bk">없음</span>'}</td>`
      + `<td class="l">${prep.join('<br>') || '<span class="bk">-</span>'}</td></tr>`;
  }
  const HEAD = '<thead><tr><th>순서</th><th>시간</th><th class="l">품명 · 그룹</th><th class="l">두께 × 폭 · 색</th><th>톤 · 생산</th><th class="l">앞 작업과 바뀌는 것</th><th class="l">생기는 휴지 (MES 코드·분)</th><th class="l">준비 (도료·PF·부자재)</th></tr></thead>';
  const NC = 8;
  const LEG = '<div class="strip-lg"><span>날짜 줄 아래 막대 = 그날 07시~다음날 07시 라인 사용:</span><span><i class="sr"></i>생산(숫자 = 순서)</span><span><i class="sd"></i>전환 휴지</span><span><i class="sp"></i>휴지계획</span><span><i class="sw"></i>기다림(도료·PF 준비 전)</span><span><i class="sc"></i>이미 확정된 지시 작업</span></div>';
  // 하루 띠: 07시~다음날 07시 위에 생산(파랑)·휴지(주황)·휴지계획(회색)·기다림(빨강)
  const mins = (s, d) => { if (!s) return 0; const y = +d.slice(0, 4), t = Date.UTC(y, +s.slice(0, 2) - 1, +s.slice(3, 5), +s.slice(6, 8), +s.slice(9, 11)), b = Date.UTC(y, +d.slice(5, 7) - 1, +d.slice(8, 10), 7, 0); return Math.max(0, Math.min(1440, (t - b) / 6e4)); };   // 하루 = 07시~다음날 07시(MES 일수 기준, 10/22 사용자)
  function strip(v, ph, d, byS, first) {
    const seg = []; let x0min = null;
    const add = (a, b, cls, tip, lab) => { const x0 = mins(a, d), x1 = mins(b, d); if (x1 <= x0) return; if (x0min == null || x0 < x0min) x0min = x0;
      seg.push(`<i class="${cls}" style="left:${(x0 / 14.4).toFixed(2)}%;width:${((x1 - x0) / 14.4).toFixed(2)}%" title="${esc(tip)}">${lab && x1 - x0 >= 40 ? `<b>${lab}</b>` : ''}</i>`); };
    (v.events || []).forEach((e) => {
      if (e.kind === 'job') { const x = byS[e.seq]; if (!x) return; if (x.downMin > 0.5) add(x.downStart, x.start, 'sd', `${x.seq} 앞 전환 휴지 ${n0(x.downMin)}분`); add(x.start, x.end, 'sr', `${x.seq}번 ${x.item} ${x.color} ${x.t}t · ${tm(x.start, d)}~${tm(x.end, d)}`, x.seq); }
      else if (e.ph === ph) add(e.start, e.end, e.kind === 'plan' ? 'sp' : 'sw', `${e.kind === 'plan' ? '휴지계획' : '기다림(준비 안 된 지시)'} ${n0(e.min)}분`, e.kind === 'plan' ? '휴지' : '대기');
    });
    if (first && x0min > 0) seg.unshift(`<i class="sc" style="left:0;width:${(x0min / 14.4).toFixed(2)}%" title="이미 확정된 지시 작업(제안 대상 아님)">${x0min >= 90 ? '<b>확정분 작업</b>' : ''}</i>`);
    return `<div class="strip">${seg.join('')}<span class="h0">7시</span><span class="h6">13시</span><span class="h12">19시</span><span class="h18">1시</span><span class="h24">7시</span></div>`;
  }

  function table(v, items, ph) {
    const byS = {}; items.forEach((x) => { byS[x.seq] = x; });
    let h = '', curDay = null;
    (v.events || []).forEach((e) => {
      if (e.kind === 'job' ? !byS[e.seq] : e.ph !== ph) return;
      const d = e.kind === 'job' ? byS[e.seq].day : e.day;
      if (d !== curDay) {
        const first = curDay == null;
        curDay = d;
        const s = ((v.days || {})[ph] || {})[d] || {};
        h += `<tr class="day"><td colspan="${NC}"><div class="dayh"><b>${dayNm(d)}</b><span>${n0(s.n)}건 · ${n0(s.t)}t · 생산 ${hm(s.run || 0)} · <em>휴지 ${n0(s.down)}분</em>${s.plan ? ` · 휴지계획 ${hm(s.plan)}` : ''}${s.wait ? ` · 기다림 ${hm(s.wait)}` : ''}</span></div>${strip(v, ph, d, byS, first)}</td></tr>`;
      }
      if (e.kind === 'job') { h += row(byS[e.seq], curDay); return; }
      h += `<tr class="ev ${e.kind}"><td class="c">—</td><td class="tm">${tm(e.start, curDay)} – ${tm(e.end, curDay)}</td><td colspan="${NC - 2}"><b>${e.kind === 'plan' ? '휴지계획' : '라인 멈춤(기다림)'} ${hm(e.min)}</b> · ${esc(e.why)}</td></tr>`;
    });
    return `<div class="scroll"><table class="t wo"><colgroup><col style="width:5%"><col style="width:10%"><col style="width:13%"><col style="width:12%"><col style="width:9%"><col style="width:17%"><col style="width:23%"><col style="width:11%"></colgroup>${HEAD}<tbody>${h}</tbody></table></div>`
      + '<p class="hint lg"><i class="sr"></i>생산 <i class="sd"></i>휴지(앞 작업과 바뀜) <i class="sp"></i>휴지계획 <i class="sw"></i>기다림 — 띠에 마우스를 올리면 내용이 보입니다</p>';
  }

  // 편성 조건(순서대로) + 휴지 계산표 — 사용자 10/20: 조건을 1. 2. 순번으로, 첨부 파일 이름까지
  function downTable(l) {          // 휴지 기준표: 우리 기준(조건표 × 라인 보정) · 엑셀 · 차이(분·%)
    const T = O.downTable || [], ck = ((O.downCheck || {}).lines || {})[l], f0 = (v) => (v == null ? '-' : Math.round(v));
    if (!T.length) return '';
    const sg = (d) => (d > 0.5 ? `<b class="up">+${f0(d)}</b>` : d < -0.5 ? `<b class="dn">−${f0(-d)}</b>` : '0');
    const pc = (o, e) => (e > 0.5 ? (() => { const p = (o - e) / e * 100; return p > 0.5 ? `<b class="up">+${f0(p)}%</b>` : p < -0.5 ? `<b class="dn">−${f0(-p)}%</b>` : '0%'; })() : (o > 0.5 ? '<span class="bk">엑셀 0</span>' : '-'));
    const rows = T.map((r) => {
      const x = r.lines[l] || {}, o = x.ours, e = x.excel;
      if (o == null && !e) return '';
      return `<tr><td class="l">${esc(r.name)}</td><td class="l bk wrap">${esc(x.code || '')}</td><td class="num"><b>${o == null ? '0' : f0(o)}</b></td>`
        + `<td class="num">${f0(e)}</td><td class="num">${sg((o || 0) - (e || 0))}</td><td class="num">${pc(o || 0, e || 0)}</td><td class="l bk wrap">${esc(x.excelNote || '')}</td></tr>`;
    }).join('');
    const blk = Object.entries(O.learn || {}).filter(([k]) => k.startsWith(l + '|')).map(([k, v]) => `${k.split('|')[1].replace('general', '일반').replace('pvs2', 'PVS2').replace('print', '프린트').replace('>', ' → ')} ${f0(v.median)}분`).join(' · ');
    const day = ck ? `<tr class="tot-r"><td class="l"><b>하루 합 (최근 90일 실제 순서에 적용)</b></td><td class="l bk">실제 ${f0(ck.actual)}분 · 주문 바뀜 하루 ${(ck.changes / Math.max(ck.days, 1)).toFixed(1)}번</td><td class="num"><b>${f0(ck.ours)}</b></td><td class="num">${f0(ck.excel)}</td><td class="num">${sg(ck.ours - ck.excel)}</td><td class="num">${pc(ck.ours, ck.excel)}</td><td class="l bk wrap">실제 대비 엑셀 ${f0((ck.excel - ck.actual) / ck.actual * 100)}% · 우리 기준은 1년 조건표 ${f0(ck.cond)}분을 실제에 맞춰 ×${ck.scale}</td></tr>` : '';
    return `<h3>휴지 기준표 — ${l} (지시가 바뀔 때, 해당하는 줄의 분을 모두 더함)</h3>`
      + `<p class="hint">우리 기준 = 지난 1년 코일 실적으로 만든 조건표(조건끼리 겹치는 시간은 이미 뺌) × 이 라인 최근 90일 실적 보정. 같은 주문·같은 사양을 이어 돌리면 0분. 예: 상도 색이 바뀌면서 폭이 100mm 넘게 넓어지면 = 새 주문 + 상도 색만 바뀜 + 폭 넓어짐 100mm 넘게. 블록 전환은 1년 실측 중앙값(${esc(blk || '해당 없음')}). 엑셀 = ${esc(O.file || '첨부 파일')} 규칙, 차이 = 우리 기준 − 엑셀 (<b class="up">+</b> 우리가 더 길게, <b class="dn">−</b> 우리가 더 짧게).</p>`
      + '<div class="scroll"><table class="t cond dtab"><thead><tr><th class="l">바뀌는 것</th><th class="l">MES 휴지 코드</th><th>우리 기준(분)</th><th>엑셀(분)</th><th>차이(분)</th><th>차이(%)</th><th class="l">엑셀 규칙</th></tr></thead><tbody>'
      + rows + day + '</tbody></table></div>' + learnBox();
  }
  function learnBox() {             // 기준 변경 이력(보고용, tools/learn_sync.publish): 적용한 기준 변경 · 검토 결과
    const E = O.learnLog || [];
    if (!E.length || !E[0].applied) return '<h3>기준 변경 이력</h3><p class="hint">최근 바뀐 기준 없음</p>';
    const sgn = (p) => (p == null ? '-' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`);
    const ST = { '적용 중': 'ok', '휴지 기준으로 반영': 'ok', '미적용': 'no', '점검용': 'mid', '검토 중': 'mid' };
    return '<h3>기준 변경 이력</h3>' + E.slice().reverse().map((e) => `<div class="lg-day"><b>${esc(e.at)}</b></div>`
      + (e.applied.length ? '<div class="scroll"><table class="t cond lgt"><thead><tr><th class="l">조정한 기준</th><th>이전</th><th>변경</th><th>증감</th></tr></thead><tbody>'
        + e.applied.map((c) => `<tr><td class="l">${esc(c.what)}</td><td class="num">${esc(c.before)}${c.u}</td><td class="num"><b>${esc(c.after)}${c.u}</b></td><td class="num">${sgn(c.pct)}</td></tr>`).join('') + '</tbody></table></div>' : '')
      + (e.review.length ? '<div class="scroll"><table class="t cond lgt"><thead><tr><th>구분</th><th class="l">검토한 조건·규칙</th><th class="l">근거 수치</th><th>결과</th><th class="l">비고</th></tr></thead><tbody>'
        + e.review.map((r) => `<tr><td>${esc(r.kind)}</td><td class="l wrap">${esc(r.what)}</td><td class="l bk wrap">${esc(r.detail || '-')}</td><td><span class="lgs ${ST[r.status] || 'mid'}">${esc(r.status)}</span></td><td class="l bk wrap">${esc(r.why || '')}</td></tr>`).join('') + '</tbody></table></div>' : '')).join('');
  }


  function conditions(l) {
    const K = O.r15 || {}, f0 = (v) => (v == null ? '-' : Math.round(v));
    const lb = (k) => { const v = (O.learn || {})[k]; return v ? `${f0(v.median)}분 (지난 1년 ${v.n}번 중앙값)` : '-'; };
    const C = [
      ['편성 대상', 'SSCHC1020 화면의 확정여부 N · 소재매치 Y · 지시 종료일 없음 (지시일 1년 안)', 'WRK_DRT_CONF · RAW_MCH_YN · WRK_DRT_END_DT', '대상 정의'],
      ['남은 양', '지시량 − 같은 계약·지시일로 이미 생산된 코일 무게. 95% 넘게 생산됐으면 끝난 지시로 봄', 'WRK_DRT_WGT − 코일 실적 PDT_WGT', '대상 정의'],
      ['① 도료 입고일', '도료생산일(입고일) 07시부터 넣을 수 있음 — 당일 생산 가능(MES 일수 기준 07시)', 'PNT_ENT_SCHE_DAT', '반드시 지킴'],
      ['② PF 입고일', 'PF종류가 00 이 아니면 PF입고예정일 07시부터 (당일 가능). 날짜가 비어 있으면 경고만', 'PF_SRT_CD · PF_ENT_SCHE_DAT', '반드시 지킴'],
      ['③ 확정 대기열', '확정여부 Y 인 지시는 MES 순서 그대로 맨 앞 (순서 안 바꿈)', 'WRK_SCHE_DT · WRK_SCHE_SEQ', '반드시 지킴'],
      ['④ 준비된 날 순', '도료·PF 준비가 끝난 날이 빠른 지시부터(이미 준비된 지시는 모두 오늘 묶음). 그룹 순위(수출 → 내수 → 계획재)는 보지 않음 — 그룹 순위는 분기 가동계획에만, 주간 실제 작업지시는 고려 안 함', '①·② 날짜', '반드시 지킴'],
      ['⑤ 휴지 최소', '같은 날 준비된 지시끼리 아래 휴지 기준표로 셈한 휴지 합이 가장 적은 순서 (블록끼리 모음 — 결과적으로 같은 색·같은 주문 연속, 상도만 바뀌는 쪽 먼저, 넓은 폭 → 좁은 폭, 비슷한 두께끼리)', '아래 표', '최대한'],
      ['시각 계산', '출발 = 지금과 마지막 실적 코일 끝 중 늦은 때. 지시마다 휴지 → 생산(톤 ÷ (두께 × 폭 × L/S × 7.87)). L/S = 우리 실적. 그날 휴지계획은 그날 첫 작업 앞', 'snap_cc_seq_recent · 휴지계획', ''],
      ['부자재상태', '불량·입고대기를 "준비" 칸에 표시 (순서에서 뺄지는 확인 중)', 'PNT_STS_CD (W 입고대기 · X 불량)', '표시만'],
    ];
    return `<section class="card"><h2>편성 조건 <small class="bk">이 순서로 봅니다 — ${l}</small></h2>`
      + '<div class="scroll"><table class="t cond"><thead><tr><th>조건</th><th class="l">내용</th><th class="l">MES 칸·자료</th><th>지키는 정도</th></tr></thead><tbody>'
      + C.map((r) => `<tr><td class="l"><b>${r[0]}</b></td><td class="l wrap">${r[1]}</td><td class="l bk">${r[2]}</td><td>${r[3]}</td></tr>`).join('') + '</tbody></table></div>'
      + '</section><section class="card">' + downTable(l) + '</section>';
  }

  function renderRules() {
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : L[0];
    $('wo-meta').textContent = `${O.now} 기준(지금) · 계산 ${O.built || ''}`;
    $('wo-main').innerHTML = tabs() + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l}</button>`).join('')}</div></section>` + conditions(line);
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; renderRules(); });
    bindTabs();
    if (window.UI) UI.reveal($('wo-main'));
  }
  function render() {
    if (view === 'rules') { renderRules(); return; }
    const L = Object.keys(O.lines);
    line = line && L.includes(line) ? line : (L.find((l) => O.lines[l].nFree) || L[0]);
    const v = O.lines[line];
    const free = v.items.filter((x) => !x.fixed), fx = v.items.filter((x) => x.fixed);
    $('wo-meta').textContent = `${O.now} 기준(지금) · 계산 ${O.built || ''}`;
    const dz = DZ.filter(([k]) => v.downFree[k] > 0.5).map(([k, nm]) => `${nm} ${n0(v.downFree[k])}`).join(' · ') || '없음';
    const gain = v.mes.sum - v.ours.sum;
    const stop = v.stop ? `<div class="miss"><b>${line} 휴지 중</b> — ${esc(v.stop.note)}. ${v.stop.until ? `재가동 ${md(v.stop.until)} 07시부터 시각 계산` : '재가동일 미정 — 아래 시각은 <b>지금 바로 재가동한다고 가정</b>한 것'}</div>` : '';
    const ns = (O.nospec || []).filter((x) => x.line === line);
    $('wo-main').innerHTML = tabs() + (O.missing && O.missing.length ? `<div class="miss"><b>아직 안 들어온 자료</b> — ${O.missing.map(esc).join(' / ')}</div>` : '')
      + (ns.length ? `<div class="miss"><b>순서에서 뺀 지시 ${ns.length}건 — 계약 상세(두께·폭)가 MES 에 없음</b>: ${ns.map((x) => `${esc(x.con)} ${esc(x.item)} ${x.t}t(지시 ${md(x.drtDate)})`).join(' · ')}. 오래전 지시가 종료되지 않고 남은 것으로 보임 — MES 정리 확인</div>` : '')
      + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l} <small>${O.lines[l].stop ? '휴지' : `${O.lines[l].nFree}건`}</small></button>`).join('')}</div>${stop}`
      + '<div class="kpis" style="margin-top:12px">'
      + `<div class="kpi"><div class="l">지금 라인 · 확정 대기</div><div class="v">${fx.length}<small>건</small></div><div class="b">마지막 코일 ${esc(v.lastCoil ? tm(v.lastCoil) : '-')} 끝 · 확정분 ${n0(v.tFixed)}t 은 ${esc(tm(v.fixedUntil))} 까지</div></div>`
      + `<div class="kpi"><div class="l">이번 제안(편성 대상)</div><div class="v">${v.nFree}<small>건 ${n0(v.tFree)}t</small></div><div class="b">${v.nFree ? `${esc(tm(free[0].start))} → ${esc(tm(v.until))}` : '편성할 지시 없음'}${v.waitN ? ` · 도료·PF 준비 기다리는 지시 ${v.waitN}건` : ''}</div></div>`
      + `<div class="kpi"><div class="l">예상 휴지(제안 순서)</div><div class="v wv">${n0(v.downFreeSum)}<small>분</small></div><div class="b">${dz}</div></div>`
      + '</div>'
      + (v.nFree ? `<div class="wo-cmp${gain < 0 ? ' bad' : ''}"><b>MES 순서와 비교</b> — 같은 ${v.nFree}건을 MES 에 지금 들어가 있는 작업예정일·순번대로 돌리면 휴지 ${n0(v.mes.down)}분${v.mes.wait ? ` + 도료 기다림 ${n0(v.mes.wait)}분` : ''} → 제안이 <b>${gain >= 0 ? `${n0(gain)}분 짧음` : `${n0(-gain)}분 김`}</b> <span class="bk">(같은 출발점, 같은 휴지 규칙)</span></div>` : '')
      + '</section>'
      + (v.nFree ? `<section class="card"><h2>제안 순서 <small class="bk">날짜별 · 줄마다 그 지시 앞에 생기는 휴지와 생산</small></h2>${LEG}${table(v, free, 'free')}</section>` : '')
      + (fx.length ? `<section class="card"><details class="fx"><summary>이미 확정된 대기열 ${fx.length}건 ${n0(v.tFixed)}t — MES 순서 그대로 (${esc(tm(v.from))} → ${esc(tm(v.fixedUntil))})</summary>${table(v, fx, 'fixed')}</details></section>` : '');
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; render(); });
    bindTabs();
    if (window.UI) UI.reveal($('wo-main'));
  }
  const envReady = GP.latest('wo_proposal.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('wo-msg').textContent = '아직 게시된 제안이 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('wo-form').hidden = false; $('wo-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    if (!O.lines || !Object.values(O.lines).every((v) => v.mes)) { $('wo-msg').textContent = '예전 형식의 제안입니다 — 다시 계산 후 게시가 필요합니다.'; return; }
    render();
  }
  $('wo-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('wo-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('wo-form').hidden = false; });
})();
