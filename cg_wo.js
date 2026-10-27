/* 도금 작업지시 순서 제안: published/cg_wo_proposal.enc.json (tools/cg_wo_sequence.py)
   라인 탭 → 요약(1010 대상 · 제안대로면 · 예상 더미 · MES 비교) → 표면사상 묶음 → 날짜별 제안 순서(하루 띠) → 편성 조건 · 더미 기준표(접힘 유지) */
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

  function row(x, day) {
    const dn = x.exp >= 0.05;
    const t = x.trt;
    const spec = `<div class="sp1">${x.thick} × ${n0(x.width)} <span class="bk">· 표면사상 ${esc(x.sur)}${t && t.cot ? ` · 도금량 ${esc(t.cot)}` : ''}</span></div>`
      + (t ? `<div class="sp2" title="${esc(t.src)}"><b>후처리</b> ${esc(t.aft || '-')} <span class="bk">${esc(t.aftNm || '')}</span></div><div class="sp2"><b>도유</b> ${esc(t.oil || '-')} <span class="bk">${esc(t.oilNm || '')}</span></div>`
        : '<div class="sp2 bk">후처리·도유 — 아직 모름(이 코일의 주문이 아직 연결 안 됨)</div>');
    return `<tr${dn ? ' class="hasdn"' : ''}><td class="c"><b>${x.seq}</b></td>`
      + `<td class="tm">${dn ? `<span class="bk">더미 ${tm(x.downStart, day)}</span><br>` : ''}<b>${tm(x.start, day)}</b> – ${tm(x.end, day)}</td>`
      + `<td class="l"><b>${esc(x.raw)}</b>${x.conf ? '' : '<span class="gt gt3">미확정</span>'}<br><span class="bk">${x.con ? esc(x.con) : '주문 미연결'}</span></td>`
      + `<td class="c">${md(x.req) || '-'}</td>`
      + `<td class="l wr">${spec}</td>`
      + `<td class="num" title="톤은 추정(대상 선정 화면에 무게가 없음): 같은 두께·폭 코일의 보통 무게 × 코일 ${esc(x.cnt)}개 · 시간당 생산량 = ${esc(x.tphSrc)}"><b>${n1(x.t)}t</b> · ${n0(x.runMin)}분<br><span class="bk">추정 ${esc(x.cnt)}코일 · ${n1(x.tph)}t/h</span></td>`
      + `<td class="l chg">${(x.chg || []).map((c) => `<div>${esc(c)}</div>`).join('')}</td>`
      + `<td class="l wr">${(x.downs || []).length ? ((x.downs.length > 1 && dn) ? `<div class="wo-ds">합계 ${n1(x.exp)}분</div>` : '') + x.downs.map((d) => `<div class="wo-dl"><b>${esc(d.c)}</b> <span class="wo-dm">${n1(d.m)}분</span><div class="bk">${esc(d.b)}</div></div>`).join('') : '<span class="bk">없음</span>'}</td></tr>`;
  }
  const HEAD = '<thead><tr><th>순서</th><th>시간 (추정)</th><th class="l">소재 코일 · 주문</th><th>생산요청일</th><th class="l">두께 × 폭 · 후처리 · 도유</th><th>톤 · 생산</th><th class="l">앞 코일과 바뀌는 것</th><th class="l">예상 더미 (분 · 근거)</th></tr></thead>';
  const NC = 8;
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
        h += `<tr class="day"><td colspan="${NC}"><div class="dayh"><b>${dayNm(cur)}</b><span>${n0(s.n)}코일 · ${n0(s.t)}t(추정) · 생산 ${hm(s.run || 0)} · <em>예상 더미 ${n1(s.down)}분</em></span></div>${strip(v, cur, byS)}</td></tr>`;
      }
      h += row(x, cur);
    });
    return `<div class="scroll"><table class="t wo cgwo"><colgroup><col style="width:4%"><col style="width:10%"><col style="width:13%"><col style="width:7%"><col style="width:17%"><col style="width:10%"><col style="width:18%"><col style="width:21%"></colgroup>${HEAD}<tbody>${h}</tbody></table></div>`
      + '<p class="hint lg"><i class="sr"></i>생산 <i class="sd"></i>예상 더미(앞 코일과 바뀜) — 띠에 마우스를 올리면 내용이 보입니다. 시각·톤은 추정(대상 선정 화면에 무게가 없음)</p>';
  }

  function conditions(l) {
    // 처음 보는 사람도 읽히게(10/27 사용자: 화면번호·표 이름·내부 용어 빼고, M/C·표면사상은 그대로, 지키는 정도는 지난 1년 %)
    const K = (O.keep || {})[l] || {};
    const pc = (no, what) => (K[no] == null ? '<span class="bk">—</span>' : `<b>${(+K[no]).toFixed(K[no] >= 99.95 ? 0 : 1)}%</b><div class="bk">${what}</div>`);
    const na = '<span class="bk">해당 없음(2CGL만)</span>';
    const sts = l === '2CGL';
    const C = [
      ['대상', '<b>MES「작업지시 대상 선정」화면</b>(화면번호 SSCHB1010)에 올라온 소재 코일 전부 — 계획 담당자가 "다음에 도금할 소재"를 미리 골라 두는 화면. 여기 올라온 코일을 어떤 순서로 돌릴지 이 화면이 제안함(확정·미확정 모두)', '매일 아침 그 화면 내용을 받아 쌓음(10/20부터)', '<span class="bk">—</span>'],
      ['① 강종', '그날 돌릴 강종(AZ·AL·MAC 등)은 확정된 가동계획 그대로 — M/C 날짜는 여기서 안 바꿈', 'M/C는 라인을 몇 시간 세우는 큰 작업이라 가동계획에서 미리 정함', pc('1', '같은 강종을 이어서 돌린 곳')],
      ['② 표면사상끼리', '같은 표면사상 코일을 묶어 한 번만 바뀌게 (대상 선정 화면에 먼저 나온 표면사상부터)', sts ? '하루에 표면사상이 한 번씩만 바뀐 날(451일 중 431일)' : '1CGL은 표면사상(GL·AL)이 강종과 같아 ①과 같은 조건',
        sts ? '<b>96%</b><div class="bk">표면사상을 한 덩어리로 돌린 날</div>' : '<b>100%</b><div class="bk">①과 같음</div>'],
      ['③ AL-STS (2CGL)', 'AL-STS(표면사상 SL)는 AL을 돌리는 기간 안에만 끼워 넣고, 그 안에서는 두껍고 넓은 코일부터 얇고 좁은 코일 순으로', '지난 1년 AL-STS 25번 모두 이렇게 함', sts ? pc('13', 'AL-STS 25번 중') : na],
      ['④ 후처리 약액 (2CGL)', '같은 계열 약액끼리는 바로 이어 돌리지 않음 — <b>KX↔IX</b>(크롬 계열), <b>MX·TX·RX·GC</b>(PosMAC 피복 계열), <b>LX↔NX</b>(AL 윤활·무기 계열). 사이에 이 약액을 안 쓰는 작업(XX 등)을 1시간 이상 넣음. 못 지키면 순서 표에 ⚠', '같은 도포 설비에서 약액을 갈아야 해서인 것으로 보임(추정). 예전에 들은 "NX 세 번 연속 불가"는 실적에 없어 뺌', sts ? pc('15', '같은 계열 약액이 바뀐 1,395곳 중 바로 이은 곳 0') : na],
      ['⑤ 같은 두께면 폭 안 넓힘', '두께가 같은데 폭을 넓히지 않음. 넓혀야 하면 두께가 바뀌는 때에 같이 넓힘', '좁은 코일 뒤에 넓은 코일을 넣으면 롤에 남은 가장자리 자국이 제품에 찍힘. 실적에서 이렇게 넓힌 곳에 더미가 거의 없었던 건 담당자가 폭 차이가 작을 때처럼 괜찮은 경우에만 했기 때문 — "넓혀도 괜찮다"는 뜻이 아니라서 지킬 조건으로 둠', pc('3', '두께가 같은 곳에서 폭을 안 넓힌 곳')],
      ['⑥ 더미 최소', '위 조건을 지키는 순서 중에서, 사양이 바뀔 때 들어가는 더미(아래 더미 기준표 (나)의 분) 합이 가장 적은 순서. 그 결과 두께는 1.35배 안에서 조금씩 바꾸고, 폭을 크게 넓히는 전환은 피하게 됨', '아래 더미 기준표(지난 1년 실적)', pc('5', '두께를 1.35배 안에서 바꾼 곳')],
      ['⑦ 넓은 폭 → 좁은 폭', '폭이 넓어지면 1mm 마다 0.1분을 더한 셈 치고 순서를 고름(예상 더미 시간에는 안 넣음) — 더미가 비슷하면 폭이 좁아지는 쪽 먼저, 같으면 대상 선정 화면에 올라온 순서대로. 10/27 0.01분 → 0.1분으로 올림(지난 1년 지시서로 시험: 2CGL 넓은→좁은 74→80%, 담당자 순서와 다음 코일 일치 32→36%, 두께 1.35배 안 95→93%로 담당자 92%보다 위)', '좁은 폭 다음 넓은 폭은 ⑤와 같은 이유로 피함', pc('2', '같은 강종 안에서 폭이 좁아지거나 같은 곳')],
      ['시간 계산', '지금 시각에서 출발해 코일마다 "예상 더미 → 생산" 시간을 더함. 생산 시간 = 무게 ÷ 시간당 생산량. 무게는 대상 선정 화면에 없어 같은 두께·폭 코일의 보통 무게 × 코일 수로 추정, 시간당 생산량은 최근 3개월 같은 두께·폭 실적의 중간값', '최근 3개월 코일 실적', '<span class="bk">추정</span>'],
    ];
    const WORDS = '<p class="hint"><b>용어</b> — <b>더미</b>: 도금은 코일을 이어 붙여 쉬지 않고 돌려서, 사양이 크게 바뀌면 라인을 세우는 대신 제품이 아닌 연결용 코일(더미)을 흘려 라인 상태를 맞춤. '
      + '<b>후처리</b>: 도금 위에 바르는 약액(크롬·무크롬·유기피복 등, 코드 KX·NX 등). <b>도유</b>: 녹 방지 기름을 바르는 정도(무도유·Light 등). '
      + '<b>지키는 정도</b>: 지난 1년 실제 생산에서 담당자가 그렇게 한 비율.</p>';
    return `<section class="card"><h2>편성 조건 <small class="bk">위에서부터 차례로 봅니다 — ${l}</small></h2>` + WORDS
      + '<div class="scroll"><table class="t cond"><thead><tr><th>조건</th><th class="l">내용</th><th class="l">왜 · 근거</th><th>지키는 정도<br><small class="bk">지난 1년</small></th></tr></thead><tbody>'
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
      + `<div class="kpi"><div class="l">돌릴 대상</div><div class="v">${n0(v.n)}<small>코일 ${n0(v.tSum)}t</small></div><div class="b">대상 선정 화면 · 그중 확정 ${n0(v.nConf)}코일 · 톤은 추정 · 가동계획상 ${esc(md(v.day))} 강종 ${esc(plan)}</div></div>`
      + `<div class="kpi"><div class="l">제안 순서대로면</div><div class="v">${v.until ? esc(tm(v.until)) : '-'}<small>까지</small></div><div class="b">${esc(tm(v.from))} 출발 · 생산 ${hm(v.runSum || 0)}</div></div>`
      + `<div class="kpi"><div class="l">예상 더미 (제안 순서)</div><div class="v wv">${n1(v.ours)}<small>분</small></div><div class="b">사양 바뀜 ${n0(v.oursChg)}번</div></div>`
      + '</div>'
      + (v.n ? `<div class="wo-cmp${gain < 0 ? ' bad' : ''}"><b>화면에 올라온 순서와 비교</b> — 같은 ${n0(v.n)}코일을 대상 선정 화면에 올라온 순서대로 돌리면 예상 더미 ${n1(v.mes)}분 (사양 바뀜 ${n0(v.mesChg)}번) → 제안이 <b>${gain >= 0 ? `${n1(gain)}분 짧음` : `${n1(-gain)}분 김`}</b> <span class="bk">(같은 더미 기준표로 계산)</span></div>` : '')
      + (blk ? `<div class="cgbs"><span class="bk">표면사상 묶음</span> ${blk}</div>` : '')
      + '</section>' + boardCard(line)
      + (v.n ? `<section class="card"><h2>제안 순서 <small class="bk">날짜별 · 줄마다 그 코일 앞에 생길 더미와 생산</small></h2><div class="strip-lg"><span>날짜 줄 아래 막대 = 그날 07시~다음날 07시 라인 사용:</span><span><i class="sr"></i>생산(코일)</span><span><i class="sd"></i>예상 더미</span><span>빈 칸 = 제안 대상 아닌 시간(앞 지시 작업·대기)</span></div>${table(v)}</section>` : '<section class="card"><p>대상 선정 화면에 올라온 코일이 없습니다.</p></section>');
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
