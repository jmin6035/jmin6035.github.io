/* 도금 작업지시 순서 제안: published/cg_wo_proposal.enc.json (tools/cg_wo_sequence.py)
   라인 탭 → 요약(1010 대상 · 제안대로면 · 예상 더미 · MES 비교) → 표면사상 묶음 → 날짜별 제안 순서(하루 띠, 계약번호-행번 단위 — 10/28 사용자) → 현장 시계 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toFixed(1));
  const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
  const WD = '일월화수목금토';
  const dayNm = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00').getDay()]})`;
  const tm = (s, d) => (!s ? '' : (d && s.slice(0, 5) === d.slice(5) ? s.slice(6) : `${+s.slice(0, 2)}/${+s.slice(3, 5)} ${s.slice(6)}`));
  const hm = (m) => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
  let O = null, line = null;
  let view = 'seq';                                               // 탭: 작업지시 순서 | 작업지시 규칙(사용자 10/21) — 다시 바꿀 때까지 유지
  try { view = location.hash === '#rules' ? 'rules' : (localStorage.getItem('cgwo-view') || 'seq'); } catch (e) { /* 기본 */ }
  const tabs = () => `<div class="seg pgtab" id="wo-view"><button type="button" data-v="seq" aria-pressed="${view === 'seq'}">작업지시 순서</button><button type="button" data-v="rules" aria-pressed="${view === 'rules'}">작업지시 규칙</button></div>`;
  function bindTabs() {
    $('wo-view').querySelectorAll('button').forEach((b) => b.onclick = () => { view = b.dataset.v; try { localStorage.setItem('cgwo-view', view); history.replaceState(null, '', view === 'rules' ? '#rules' : location.pathname); } catch (e) { /* 무시 */ } render(); });
  }

  // 표 열(10/28 사용자 '다시 재구성': 어떤 조건으로 골랐나 · 몇 톤 몇 분 · 더미 얼마) — 순서·시간 | 계약 | 사양 | 생산 예상 | 선정 조건 | 예상 더미
  const IND = { A: '508', B: '610', C: '305' };
  function gatesHtml(x) {
    const G = x.gates || [];
    const warn = (x.why || '').startsWith('⚠');
    let h = `<div class="wo-why${warn ? ' bad' : ''}">${esc(x.why || '')}</div>` + (x.whySkip ? `<div class="wo-skip">${esc(x.whySkip)}</div>` : '');
    if (!G.length || x.why === '같은 계약-행번 이어서') return h;
    const same = G.filter((g) => g.ok && g.t === '같음').map((g) => g.k);
    const diff = G.filter((g) => g.ok !== null && g.t !== '같음');
    const none = G.filter((g) => g.ok === null).map((g) => g.k);
    h += diff.map((g) => `<div class="wo-g ${g.ok ? 'ok' : 'no'}">${g.ok ? '✓' : '✗'} <b>${esc(g.k)}</b> ${esc(g.t)}</div>`).join('');
    if (same.length) h += `<div class="wo-g ok">✓ <b>같음</b> ${esc(same.join('·'))}</div>`;
    if (none.length) h += `<div class="wo-g na" title="내경 = 제품 내경코드 조회가 다음 자동 실행에 들어옴 · 재질 = 소재 입고 표에 이 코일 규격이 없음">– 아직 모름 ${esc(none.join('·'))}</div>`;
    return h;
  }
  function row(x, day) {
    const dn = x.exp >= 1;                                         // 1분 미만은 '거의 없음'(사양이 안 바뀌어도 생기는 수준)
    const t = x.trt || {};
    const sp = [t.cot && `도금량 ${t.cot}`, x.trt && `후처리 ${t.aft || '없음'}`, t.oil && `도유 ${t.oil}`, x.ind && `내경 ${IND[x.ind] || x.ind}`].filter(Boolean);
    return `<tr${dn ? ' class="hasdn"' : ''}>`
      + `<td class="tm"><div class="wo-no">${x.seq}</div><b>${tm(x.start, day)}</b>–${tm(x.end, day)}${dn ? `<div class="bk">더미 ${tm(x.downStart, day)}부터</div>` : ''}</td>`
      + `<td class="l">${x.con ? `<b class="wo-con">${esc(x.con)}</b>` : '<span class="bk">계약 미연결</span>'}${x.conf ? '' : '<span class="gt gt3">미확정</span>'}<div class="bk">소재 ${esc(x.raw)}${x.req ? ` · 요청 ${md(x.req)}` : ''}</div></td>`
      + `<td class="l"><b class="wo-sz">${(+x.thick).toFixed(2)} × ${n0(x.width)}</b><div class="bk">${esc(x.sur)}${sp.length ? ' · ' + esc(sp.join(' · ')) : (x.con ? ' · 후처리 조회 대기' : '')}</div></td>`
      + `<td class="num" title="${x.wgt ? '톤 = 소재 입고 무게' : '톤 = 추정(같은 두께·폭 보통 무게)'} · 시간당 생산량 = ${esc(x.tphSrc)}"><b>${n1(x.t)}t</b> · <b>${n0(x.runMin)}분</b><div class="bk">${n1(x.tph)}t/h · 제품 ${esc(x.cnt)}코일${x.wgt ? '' : ' · 톤 추정'}</div></td>`
      + `<td class="l wr">${gatesHtml(x)}</td>`
      + `<td class="l wr">${dn ? `<div class="wo-dum"><b>${n1(x.exp)}분</b>${x.dumT >= 0.05 ? ` · 약 ${n1(x.dumT)}t` : ''}</div>` + (x.downs || []).map((d) => `<div class="bk">${esc(d.c)} ${n1(d.m)}분 — ${esc(d.b)}</div>`).join('') : (x.exp >= 0.05 ? `<span class="bk">거의 없음(${n1(x.exp)}분)</span>` : '<span class="bk">없음</span>')}</td></tr>`;
  }
  const HEAD = '<thead><tr><th class="l">순서 · 시간</th><th class="l">계약번호-행번 · 소재</th><th class="l">사양</th><th>생산 예상<br><small class="bk">톤 · 분</small></th><th class="l">선정 이유 · 조건 <small class="bk">앞 코일 대비</small></th><th class="l">예상 더미<br><small class="bk">분 · 톤 · 근거</small></th></tr></thead>';
  const NC = 6;
  const mins = (s, d) => { if (!s) return 0; const y = +d.slice(0, 4), t = Date.UTC(y, +s.slice(0, 2) - 1, +s.slice(3, 5), +s.slice(6, 8), +s.slice(9, 11)), b = Date.UTC(y, +d.slice(5, 7) - 1, +d.slice(8, 10), 7, 0); return Math.max(0, Math.min(1440, (t - b) / 6e4)); };   // 하루 = 07시~다음날 07시(MES 일수 기준, 10/22 사용자)
  function strip(v, d, byS) {
    const seg = [];
    const add = (a, b, cls, tip) => { const x0 = mins(a, d), x1 = mins(b, d); if (x1 > x0) seg.push(`<i class="${cls}" style="left:${(x0 / 14.4).toFixed(2)}%;width:${(Math.max(x1 - x0, 2) / 14.4).toFixed(2)}%" title="${esc(tip)}"></i>`); };
    (v.events || []).forEach((e) => { const x = byS[e.seq]; if (!x) return; if (x.exp >= 0.05) add(x.downStart, x.start, 'sd', `${x.seq} 앞 예상 더미 ${n1(x.exp)}분`); add(x.start, x.end, 'sr', `${x.seq} ${x.raw} ${x.thick}×${n0(x.width)} ${n1(x.t)}t`); });
    return `<div class="strip">${seg.join('')}<span class="h0">7시</span><span class="h6">13시</span><span class="h12">19시</span><span class="h18">1시</span><span class="h24">7시</span></div>`;
  }
  function table(v) {
    const byS = {}; v.items.forEach((x) => { byS[x.seq] = x; });
    let h = '', cur = null;
    v.items.forEach((x) => {
      if (x.day !== cur) {
        cur = x.day;
        const s = (v.days || {})[cur] || {};
        h += `<tr class="day"><td colspan="${NC}"><div class="dayh"><b>${dayNm(cur)}</b><span>${n0(s.n)}코일 · ${n0(s.t)}t · 생산 ${hm(s.run || 0)} · <em>예상 더미 ${n1(s.down)}분${s.dumT >= 0.05 ? ` · 약 ${n1(s.dumT)}t` : ''}</em></span></div>${strip(v, cur, byS)}</td></tr>`;
      }
      h += row(x, cur);
    });
    return `<div class="scroll"><table class="t wo cgwo"><colgroup><col style="width:8%"><col style="width:16%"><col style="width:15%"><col style="width:10%"><col style="width:31%"><col style="width:20%"></colgroup>${HEAD}<tbody>${h}</tbody></table></div>`
      + '<p class="hint lg"><i class="sr"></i>생산 <i class="sd"></i>예상 더미(앞 코일과 바뀜) — 띠에 마우스를 올리면 내용이 보입니다. 시각은 추정 · 톤은 소재 입고 무게(없는 코일만 추정)</p>';
  }

  function conditions(l) {
    // 처음 보는 사람도 읽히게(10/27 사용자: 화면번호·표 이름·내부 용어 빼고, M/C·표면사상은 그대로, 지키는 정도는 지난 1년 %)
    const K = (O.keep || {})[l] || {};
    const pc = (no, what) => (K[no] == null ? '<span class="bk">—</span>' : `<b>${(+K[no]).toFixed(K[no] >= 99.95 ? 0 : 1)}%</b><div class="bk">${what}</div>`);
    const na = '<span class="bk">해당 없음(2CGL만)</span>';
    const sts = l === '2CGL';
    // 작업지시서 우선순위 차례(두께·폭 > 재질 > 도금량 > 후처리 > 내경). 모든 조건은 '관문' — 하나라도 못 맞추면 다음 순서로 못 옴(10/27 사용자). 한눈에 보이게 한 줄씩(10/27 사용자)
    const ok1 = l === '1CGL' ? '97' : '94';
    const C = [
      ['순서', '아래 조건을 <b>모두</b> 지키는 코일 중 <b>지금 폭에 가장 가까운 코일</b>(광폭 → 소폭을 길게) · 같은 폭이면 같은 계약 → 두께 → 재질 → 도금량 → 후처리 → 내경', '하나라도 어기면 다음에 못 옴. 이을 코일이 없으면 가장 넓은 폭으로 새 단위, 두께 묶음이 끝나면 가장 가까운 두께 묶음으로 ⚠', `<b>${ok1}%</b><div class="bk">1년 모두 지킨 이음</div>`],
      ['대상', 'MES 작업지시 대상 선정 화면(SSCHB1010)의 코일 전부', '매일 아침 받아 옴', '<span class="bk">—</span>'],
      ['① 강종', '가동계획 그대로(M/C 날짜 안 바꿈)', 'M/C는 가동계획에서 정함', pc('1', '같은 강종 연속')],
      ['② 두께', '차 <b>0.3mm</b>(2CGL 박물 0.2) · 비 <b>1.3배</b> 이내', '용접부 파단', '<b>99%</b><div class="bk">1.0t 미만 0.3mm 안</div>'],
      ['③ 폭', '넓은 폭 → 좁은 폭. 넓힘은 <b>알코스타 10mm · AZ·MAC 30mm</b>까지, 같은 두께면 안 넓힘', '롤 가장자리 자국', pc('2', '넓어지지 않은 이음')],
      ['④ 재질', '같은 재질끼리. <b>AZ CQ↔EDDQ · CQ→저탄</b>, <b>MAC Gr.C↔LFQ·DQ·DDQ</b> 바로 불가', '노 온도 차 · 자료 들어오면 적용', '<span class="bk">자료 대기</span>'],
      ['⑤ 도금량', '같은 도금량끼리 되도록 묶음', '바뀌면 더미(아래 기준표)', '<span class="bk">—</span>'],
      ['⑥ 후처리', sts ? '같은 층 약액 바로 안 이음, 사이 <b>2코일</b> — 1층 TX·SX·RX·QX·MX·GX·DP·DA·BX·BP / 2층 KX·IX / LX·NX' : '연결 큰 상관 없음(AL·AZ)', sts ? '코터 청소 약 2시간' : '', sts ? pc('15', '같은 층 바로 이음 1년 1번') : na],
      ['⑦ 내경', '<b>508·610</b> 같은 것끼리. 0.6t 미만은 안 바꿈, 후물만 한두 번', '슬리브 교체 · 주문 내경 조회 추가', '<span class="bk">자료 대기</span>'],
      ['⑧ 표면사상', '같은 표면사상끼리 묶음', sts ? '451일 중 431일' : '1CGL은 ①과 같음', sts ? '<b>96%</b>' : '<b>100%</b>'],
      ['⑨ AL-STS', 'AL 기간 안에만, 두껍고 넓은 것 → 얇고 좁은 것', '1년 25번 모두', sts ? pc('13', 'AL-STS 25번') : na],
      ['⑩ M/C 뒤 가전', 'M/C 날 첫 <b>10코일</b> 가전(GE) 금지', '롤 안정 전', '<b>100%</b>'],
      ['⑪ 보류·산적', '품질 보류 코일 제외 · 같은 계약·사이즈는 2단 먼저', '보류 표·저장위치 조회 추가', '<span class="bk">자료 대기</span>'],
      ['시간', '무게 ÷ 시간당 생산량(최근 3개월 같은 두께·폭)', '무게는 지금 추정', '<span class="bk">추정</span>'],
    ];
    const WORDS = '<p class="hint"><b>더미</b> = 사양이 바뀔 때 흘리는 연결용 코일 · <b>후처리</b> = 도금 위에 바르는 약액 · <b>지킴</b> = 지난 1년 실제 생산에서 지킨 비율</p>';
    return `<section class="card"><h2>편성 조건 <small class="bk">${l} · 작업지시서 우선순위 차례</small></h2>` + WORDS
      + '<div class="scroll"><table class="t cond"><thead><tr><th>조건</th><th class="l">기준</th><th class="l">이유 · 비고</th><th>지키는 정도<br><small class="bk">지난 1년</small></th></tr></thead><tbody>'
      + C.map((r) => `<tr><td class="l"><b>${r[0]}</b></td><td class="l wrap">${r[1]}</td><td class="l bk wrap">${r[2]}</td><td class="num">${r[3]}</td></tr>`).join('') + '</tbody></table></div></section>'
      + dummyBox(l);
  }

  function dummyBox(l) {
    // 더미 기준표(10/27 사용자 "다시 생각해"): (가) 1년 더미가 어디서 들어갔나 → (나) 순서로 줄일 수 있는 것(사양 변화별, 계산에 쓰는 값) → (다) 순서로 못 바꾸는 것(M/C·재가동, 참고)
    const X = (O.dummyCtx || {})[l] || {};
    const pt = O.condSrc === '학습 방 1년 조건표';
    const T = (O.cond || []).map((r) => ({ c: r.cond, ...(r.lines[l] || {}) })).filter((x) => x.n);
    const NAME = { '새 지시서': '다른 작업지시로 넘어감' };
    const base = T.find((x) => x.c === '새 생산번호');
    const big = T.filter((x) => x.c !== '새 생산번호' && x.exp >= 1);
    const small = T.filter((x) => x.c !== '새 생산번호' && x.exp < 1);
    const sh = (X.share || []).slice().sort((a, b) => b.t - a.t);
    const tot = sh.reduce((s, r) => s + r.t, 0);
    const CAN = (c) => (c.startsWith('두께') ? '<b>예</b> — 아래 (나)' : c.startsWith('강종') ? '아니오 — M/C(가동계획에서 정함)' : c.startsWith('긴 휴지') ? '아니오 — 휴지 뒤라 불가피' : '아니오 — 불량·설비 문제 등');
    const sCan = sh.filter((r) => r.cat.startsWith('두께')).reduce((s, r) => s + r.pct_t, 0);
    const cv = (O.condVal || {})[l];
    let h = `<section class="card"><h2>더미 기준표 <small class="bk">${l} · 지난 1년 실적</small></h2>`;
    if (sh.length) {
      h += `<h3>(가) 더미는 어디서 들어갔나</h3><p class="hint">지난 1년 ${l} 더미 ${n0(tot)}t 중 작업지시 순서로 줄일 수 있는 몫은 <b>${n0(sCan)}%</b>(두께·폭이 크게 바뀐 곳). 나머지는 M/C·휴지·설비 문제 때라 순서와 상관없음.</p>`
        + '<div class="scroll"><table class="t cond"><thead><tr><th class="l">언제 들어갔나</th><th>횟수</th><th>더미 코일 · 톤</th><th>비중</th><th class="l">순서로 줄일 수 있나</th></tr></thead><tbody>'
        + sh.map((r) => `<tr><td class="l">${esc(r.cat)}</td><td class="num">${n0(r.events)}번</td><td class="num">${n0(r.coils)}코일 · ${n0(r.t)}t</td><td class="num"><b>${n0(r.pct_t)}%</b></td><td class="l">${CAN(r.cat)}</td></tr>`).join('')
        + '</tbody></table></div>';
    }
    h += `<h3>(나) 순서 계산에 쓰는 값 — 사양이 이렇게 바뀌면</h3><p class="hint">같은 강종 안에서 앞 코일 → 다음 코일 사이에 이것이 바뀌었을 때 지난 1년 실적. 여러 개가 같이 바뀌면 더함. 매일 새 실적으로 다시 계산(바뀐 값은 아래 '기준 변경 이력').</p>`
      + `<div class="scroll"><table class="t cond dtab"><thead><tr><th class="l">바뀌는 것</th><th>${pt ? '지난 1년' : '최근 3개월'} 횟수</th><th>더미가 들어간 비율</th><th>들어가면 보통</th><th>계산에 쓰는 값<br><small class="bk">한 번 바뀔 때 평균</small></th></tr></thead><tbody>`
      + big.map((x) => { const r = x.rate || 0; return `<tr><td class="l">${esc(NAME[x.c] || x.c)}</td><td class="num">${n0(x.n)}번</td><td class="num">${(r * 100).toFixed(0)}%</td><td class="num">${pt && r > 0 ? `${n1(x.dn / r)}코일 · ${n1(x.dt / r)}t` : (x.minIf ? `${n0(x.minIf)}분` : '-')}</td><td class="num"><b>${n1(x.exp)}분</b></td></tr>`; }).join('')
      + '</tbody></table></div>'
      + (small.length ? `<p class="hint">그 밖의 변화(${small.map((x) => esc(NAME[x.c] || x.c)).join(' · ')})는 더미가 들어간 비율이 ${Math.round(Math.min(...small.map((x) => (x.rate || 0) * 100)))}~${Math.round(Math.max(...small.map((x) => (x.rate || 0) * 100)))}%로, 사양이 안 바뀌어도 생기는 수준(같은 사양 다음 코일 ${base ? ((base.rate || 0) * 100).toFixed(1) : '-'}%)과 거의 같아 <b>0분으로 봄</b>.</p>` : '');
    if ((X.mc || []).length || (X.restart || []).length) {
      h += '<h3>(다) 순서로 못 바꾸는 더미 (참고)</h3><div class="scroll"><table class="t cond"><thead><tr><th class="l">경우</th><th>지난 1년</th><th>라인 정지(보통)</th><th>더미(보통)</th></tr></thead><tbody>'
        + (X.mc || []).map((r) => `<tr><td class="l">M/C ${esc(r.a)} → ${esc(r.b)}</td><td class="num">${n0(r.n)}번</td><td class="num">${hm(r.stop)}</td><td class="num">${n0(r.dn)}코일 · ${n0(r.dt)}t</td></tr>`).join('')
        + (X.restart || []).filter((r) => r.n >= 3).map((r) => `<tr><td class="l">${esc(r.stop)} 쉬고 다시 돌릴 때</td><td class="num">${n0(r.n)}번</td><td class="num bk">—</td><td class="num">${n0(r.dn)}코일 · ${n0(r.dt)}t</td></tr>`).join('')
        + '</tbody></table></div>';
    }
    if (cv) h += `<p class="hint">맞는지 확인(${esc(cv.period)}): 하루 실제 더미 평균 ${cv.actual}분 · (나)로 계산 ${cv.pred}분. 날마다의 실제 더미와는 잘 안 맞는데(같이 오르내리는 정도 ${cv.corr}, 1이면 완전히 맞음), 하루 더미의 큰 몫이 (가)의 M/C·설비 문제처럼 순서와 상관없는 데서 나오기 때문. 순서끼리 비교(어느 순서가 더미가 적나)에만 씀.</p>`;
    return h + learnBox() + '</section>';
  }

  // 현장 시계 · 지난 작업 돌아보기(10/27 사용자 '패치 시작해' — 작업순서 분석 화면에서 옮김): 강종 연속 생산 며칠째·AL-STS 다음 예상 / 제안 vs 실제 / 규칙과 다르게 넘어간 곳
  function boardCard(l) {
    const B = O.board;
    if (!B) return '';
    const ck = (B.clock || []).filter((c) => c.line === l);
    const ev = (B.eval || {})[l], ux = (B.unexp || {})[l];
    const pc = (v) => (v == null ? '-' : `${(+v).toFixed(0)}%`);
    const dd = (s) => (s && s.length === 8 ? `${+s.slice(4, 6)}/${+s.slice(6, 8)}` : md(s));
    let h = `<section class="card"><h2>현장 시계 · 지난 작업 돌아보기 <small class="bk">${l} · 지난 1년 생산 기록과 매일 비교</small></h2><div class="wb-g">`;
    h += `<div class="wb"><h3>강종 연속 생산 · AL-STS</h3>${ck.length ? ck.map((c) => `<p class="wb-ck"><b class="gt ${c.kind === 'STS' ? 'gt2' : 'gt1'}">${c.kind === 'STS' ? 'AL-STS' : '강종'}</b> ${esc(c.text)} <span class="bk">(${md(c.date)} 기준)</span></p>`).join('') : '<p class="bk">자료 없음</p>'}</div>`;
    h += `<div class="wb"><h3>제안 순서 vs 실제 작업지시</h3>${ev ? `<p class="bk">${dd(ev.day)} 대상 ${n0(ev.pool)}코일 중 실제로 작업지시된 ${n0(ev.issued)}코일 기준</p>`
      + '<table class="t cond wb-t"><thead><tr><th class="l"></th><th>이 화면 제안</th><th>화면에 올라온 순서</th></tr></thead><tbody>'
      + `<tr><td class="l">바로 다음 코일을 맞힌 비율</td><td class="num"><b>${pc(ev.next_p)}</b></td><td class="num">${pc(ev.next_m)}</td></tr>`
      + `<tr><td class="l">실제 지시된 코일이 앞쪽에 든 비율</td><td class="num"><b>${pc(ev.top_p)}</b></td><td class="num">${pc(ev.top_m)}</td></tr></tbody></table>`
      + `<p class="hint">${(ev.next_p ?? 0) < (ev.next_m ?? 0) ? '아직 화면에 올라온 순서보다 덜 맞힘 — 어떤 주문을 먼저 지시할지(납기·주문 사정)는 순서 계산에 들어 있지 않음.' : '화면에 올라온 순서보다 잘 맞힘.'}</p>` : '<p class="bk">작업지시가 3코일 이상 나간 날이 아직 없음</p>'}</div>`;
    h += '</div>';
    if (ux && ux.items && ux.items.length) {
      h += `<h3>${md(ux.date)} 규칙과 다르게 넘어간 곳 <small class="bk">${ux.items.length}곳 · 이유별 (괄호 = 지난 1년)</small></h3><div class="wb-cats">`
        + ux.cats.map((c) => `<span class="cgb" title="${esc(c.desc || '')}"><b>${esc(c.cat)}</b> ${c.n}곳${c.n1y ? ` <span class="bk">(${n0(c.n1y)})</span>` : ''}</span>`).join('') + '</div>'
        + '<details class="fx"><summary>한 곳씩 보기</summary><div class="scroll"><table class="t cond wbx"><thead><tr><th>시각</th><th class="l">앞 코일 → 다음 코일</th><th class="l">어긴 규칙</th><th class="l">이유</th><th class="l">그때 규칙대로 이을 수 있던 코일</th></tr></thead><tbody>'
        + ux.items.map((x) => `<tr><td>${esc(x.time)}</td><td class="l">${esc(x.a_spec)} → ${esc(x.b_spec)}</td><td class="l">${esc(x.rule)}</td><td class="l">${esc(x.why_s)}<div class="bk">${esc(x.ctx_s || '')}</div></td><td class="l bk">${esc(x.alt_s || '')}</td></tr>`).join('')
        + '</tbody></table></div></details>';
    }
    return h + '</section>';
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
    line = line && L.includes(line) ? line : L[0];
    const v = O.lines[line];
    $('wo-meta').textContent = `${O.now} 기준(지금) · 계산 ${O.built || ''}`;
    const gain = (v.mes || 0) - (v.ours || 0);
    const plan = v.plan ? Object.entries(v.plan).map(([a, t]) => `${a} ${n0(t)}t`).join(' · ') : '-';
    const blk = (v.blocks || []).map((b) => `<span class="cgb"><b>${esc(b.sur)}</b> ${n0(b.n)}코일 · ${n0(b.t)}t</span>`).join('<span class="cga">→</span>');
    $('wo-main').innerHTML = tabs() + (O.missing && O.missing.length ? `<div class="miss"><b>아직 안 들어온 자료·조건</b> — ${O.missing.map(esc).join(' / ')}</div>` : '')
      + `<section class="card"><div class="seg" id="wo-lines">${L.map((l) => `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l} <small>${O.lines[l].n}코일</small></button>`).join('')}</div>`
      + '<div class="kpis" style="margin-top:12px">'
      + `<div class="kpi"><div class="l">돌릴 대상</div><div class="v">${n0(v.n)}<small>코일 ${n0(v.tSum)}t</small></div><div class="b">대상 선정 화면 · 그중 확정 ${n0(v.nConf)}코일 · 가동계획상 ${esc(md(v.day))} 강종 ${esc(plan)}</div></div>`
      + `<div class="kpi"><div class="l">제안 순서대로면</div><div class="v">${v.until ? esc(tm(v.until)) : '-'}<small>까지</small></div><div class="b">${esc(tm(v.from))} 출발 · 생산 ${hm(v.runSum || 0)}</div></div>`
      + `<div class="kpi"><div class="l">예상 더미 (제안 순서)</div><div class="v wv">${n1(v.ours)}<small>분</small></div><div class="b">더미 약 ${n1(v.oursDumT)}t · 사양 바뀜 ${n0(v.oursChg)}번</div></div>`
      + '</div>'
      + (v.n ? `<div class="wo-cmp${gain < 0 ? ' bad' : ''}"><b>화면에 올라온 순서와 비교</b> — 같은 ${n0(v.n)}코일을 대상 선정 화면에 올라온 순서대로 돌리면 예상 더미 ${n1(v.mes)}분 (사양 바뀜 ${n0(v.mesChg)}번) → 제안이 <b>${gain >= 0 ? `${n1(gain)}분 짧음` : `${n1(-gain)}분 김`}</b> <span class="bk">(같은 더미 기준표로 계산)</span></div>` : '')
      + (blk ? `<div class="cgbs"><span class="bk">표면사상 묶음</span> ${blk}</div>` : '')
      + '</section>'
      + (v.n ? `<section class="card"><h2>${v.issued ? `이미 지시된 순서 점검 <small class="bk">대상 선정 화면이 비어 있어(작업지시가 다 나감) 지시됐고 아직 생산 안 된 코일을 MES 지시 순서대로 조건 점검</small>` : '제안 순서 <small class="bk">날짜별 · 같은 계약번호-행번은 붙여서</small>'}</h2>`
        + ((v.runs || []).length ? `<div class="wo-runs"><b>짜는 방식</b> 조건(두께·폭·재질·후처리·내경)을 모두 지키는 코일 중 <b>지금 폭에 가장 가까운 코일</b>을 다음으로 → 넓은 폭에서 좁은 폭으로 길게 내려감. 더 내려갈 코일이 없으면 남은 코일 중 가장 넓은 폭으로 새 단위.<ol>`
          + v.runs.map((r) => `<li><b>${r.from}번부터 ${n0(r.n)}코일 · ${n0(r.t)}t</b> — 폭 ${n0(r.w0)} → ${n0(r.w1)} · 두께 ${r.th0 === r.th1 ? r.th0 : `${r.th0}~${r.th1}`}t${r.down >= 1 ? ` · 예상 더미 ${n1(r.down)}분` : ''}</li>`).join('') + '</ol></div>' : '')
        + `<div class="strip-lg"><span>날짜 줄 아래 막대 = 그날 07시~다음날 07시 라인 사용:</span><span><i class="sr"></i>생산(코일)</span><span><i class="sd"></i>예상 더미</span><span>빈 칸 = 제안 대상 아닌 시간(앞 지시 작업·대기)</span></div>${table(v)}</section>` : `<section class="card"><p>지금 대상 선정 화면에 ${esc(line)} 코일이 없습니다${v.lastDay ? ` <span class="bk">(마지막 ${md(v.lastDay)})</span>` : ''} — 대상 코일이 이미 작업지시로 넘어감${v.issuedWait ? `(지시됐고 아직 생산 안 된 <b>${n0(v.issuedWait)}코일</b>)` : ''}. 지시된 코일의 두께·폭 조회가 들어오면 MES 지시 순서를 조건별로 점검해 여기 보여 줍니다(다음 자동 실행부터).</p></section>`)
      + boardCard(line);
    $('wo-lines').querySelectorAll('button').forEach((b) => b.onclick = () => { line = b.dataset.l; render(); });
    bindTabs();
    if (window.UI) UI.reveal($('wo-main'));
  }
  const envReady = GP.latest('cg_wo_proposal.enc.json');
  async function unlock(pw) {
    const env = await envReady;
    if (!env) { $('wo-msg').textContent = '아직 게시된 제안이 없습니다.'; return; }
    try { O = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ } }
    catch (e) { $('wo-form').hidden = false; $('wo-msg').textContent = pw ? '⚠ 암호가 맞지 않습니다' : ''; return; }
    if (!O.lines || !Object.values(O.lines).every((v) => !v.n || v.events)) { $('wo-msg').textContent = '예전 형식의 제안입니다 — 다시 계산 후 게시가 필요합니다.'; return; }
    render();
  }
  $('wo-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('wo-pw').value); });
  envReady.then(() => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (s) unlock(s); else $('wo-form').hidden = false; });
})();
