/* 컬러 생산 캘린더: published/cc_calendar.enc.json (tools/cc_calendar.py)
   10/30 사용자 '11월 상세 계획 — 컬러 도금 둘 다 포털에': 1~4CCL × 오늘 ~ 월말.
   11/5 컬러 담당 편성 규칙: 칸 = 라인 하루 24시간에 작업대기(1030) → 지시대기(1020, 부원료 입고 뒤, 노랑) → 도료 미입고(파랑) → 계획편성(초록). 작업대기로 24시간 못 채운 날 = 빨강
   11/11 회의: 용어 = MES·통합속보와 같게 — 작업대기 = 현장에 내려가 바로 작업할 수 있는 물량(1030 확정), 지시대기 = 소재 매치까지 된 물량(1020), 계획편성 = 우리 계획이 깐 물량.
   11/13 사용자 '24시간이 안 채워졌는데 다음 날로 넘어가는 것 오류': 엔진(tools/cc_calendar.py)이 계약을 시간으로 나눠 그날 가용 시간을 꽉 채우고 나머지만 다음 날로 →
   예전 '이어짐'(빗금) 표시는 없앰. 칸 양식 = 도금 캘린더와 같음(제품 칩 + 톤 · 시간 막대 + 가동/가용 h + 정지 칩 · 판매그룹 톤) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (+v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const dt = (s) => new Date(s + 'T00:00:00');
  const md = (s) => (s ? `${+String(s).slice(5, 7)}/${+String(s).slice(8, 10)}` : '');
  const mdw = (s) => `${md(s)}(${DOW[dt(s).getDay()]})`;
  const LINES = ['1CCL', '2CCL', '3CCL', '4CCL'];
  let O = null;
  const END = () => md(O.days[O.days.length - 1]);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  const KD = [['작업대기', '작업대기', 'sk1', '현장에 내려가 바로 작업할 수 있는 물량 — MES 작업지시 확정(1030), 생산우선순위 순'], ['지시대기', '지시대기', 'sk2', '소재 매치까지 된 물량 — MES 작업지시 전(1020), 부원료 입고 뒤 작업지시 순서대로'],
    ['부자재 입고대기', '도료 미입고', 'sk3', '지시대기 중 도료 입고 일정이 없는 물량 — 지시대기 뒤에 둠'], ['계획편성', '계획편성', 'sk4', '작업대기·지시대기 뒤 남는 시간에 우리 계획(통합 컬러 계획)이 깐 물량 — 주문 연결 전']];
  const SHORT_T = '작업대기 부족 = 하루 24시간(계획 휴지 뺌) 중 현장 물량(작업대기)으로 못 채우는 시간 — 지시대기로 메워야 하는 시간';
  /* 결론(11/11 생산 화면 통합 — 생산 일정 화면 맨 위 PS.sum): 이번 주(오늘부터 7일) 라인별 생산·가동 시간·24시간 부족 + 월말까지 편성 구성 */
  function summary() {
    const S = O.summary, d7 = O.days.slice(0, 7), C = (l) => d7.map((d) => O.lines[l][O.days.indexOf(d)]);
    const tk = (k, j) => sum(LINES, (l) => ((S[l].kind || {})[k] || [0, 0])[j]);
    const rows = LINES.map((l) => { const X = C(l), t = sum(X, (c) => c.cap || 0), uh = sum(X, (c) => c.usedH || 0), ch = sum(X, (c) => (c.stop ? 0 : c.capH || 0)), ws = sum(X, (c) => c.woShort || 0), st = X.filter((c) => c.stop).length;
      return `<tr><td class="l"><b>${l}</b></td><td class="r"><b>${n0(t)}</b>t</td><td class="r">${n0(uh)} / ${n0(ch)}h</td><td class="r">${ws >= 0.5 ? `<b class="bad">${n1(ws)}h</b>` : '<span class="sub">0</span>'}</td><td class="r">${st ? `${st}일` : '<span class="sub">-</span>'}</td><td class="r">${S[l].woUntil ? md(S[l].woUntil) : '<span class="sub">없음</span>'}</td></tr>`; }).join('');
    const short = sum(LINES, (l) => sum(C(l), (c) => c.woShort || 0));
    const chip = (k, cl) => `<span class="ps-c" title="${esc(KD.find((x) => x[0] === k)[3])}"><i class="${cl}"></i>${KD.find((x) => x[0] === k)[1]} <b>${n0(tk(k, 0))}t</b></span>`;
    return `<div class="ps-st">${short >= 0.5 ? `<span class="ct-b bad" title="${SHORT_T} · 오늘부터 7일 네 라인 합">작업대기 부족 ${n1(short)}h</span>` : '<span class="ct-b ok">작업대기로 24시간 채움</span>'}${(O.confirms || []).length ? `<span class="ct-b ok" title="작업 순서 화면 확정본 — 확정한 라인·날짜에 고정 · ${esc(O.confirms.map((c) => `${md(c.week)} 주 확정 ${n0(c.t)}t(${c.who || ''})`).join(' · '))}">확정 반영 ${n0(sum(O.confirms, (c) => c.t || 0))}t</span>` : ''}<span class="ps-k">~${END()} 편성</span>${chip('작업대기', 'sk1')}${chip('지시대기', 'sk2')}${chip('부자재 입고대기', 'sk3')}${chip('계획편성', 'sk4')}</div>`
      + `<div class="ct-wrap"><table class="ct-t ps-t"><thead><tr><th class="l">라인</th><th class="r">생산</th><th class="r" title="편성 시간 / 가용 시간(계획 휴지 뺀 24시간) — 차이 = 편성 없는 빈 시간">가동 시간</th><th class="r" title="${SHORT_T}">작업대기 부족</th><th class="r">정지</th><th class="r" title="현장 물량(작업대기)이 들어 있는 마지막 날 — 그 뒤는 지시대기·계획편성">작업대기 끝</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  /* 기준·사양(생산 일정 맨 아래 접기) */
  function spec() {
    return `<h4>컬러 캘린더</h4><ul class="ps-ul"><li>하루 = 07시 ~ 다음날 07시 · 가용 = 24시간 − 계획 휴지(통합 컬러 계획 휴지 달력)</li>${KD.map(([, nm, cl, t]) => `<li><i class="ps-i ${cl}"></i><b>${nm}</b> — ${esc(t)}</li>`).join('')}<li><b>작업대기 부족</b>(빨강) = 하루 가용 시간 중 현장 물량(작업대기)으로 못 채우는 시간 → 지시대기로 메움</li><li>계약은 시간으로 나눠 그날 가용 시간(24h − 정지)을 꽉 채우고 나머지만 다음 날로(톤 = 시간 비율)</li><li><b>정지</b> = 휴지·S/D·수리·청소·Test·샘플(통합 컬러 계획 휴지 달력) — 칸에 사유·시간</li><li><b>확정본</b> = 작업 순서 화면에서 「확정」한 작업(주마다 최근 확정) — 작업대기 다음, 확정한 라인·날짜에 고정(다음 갱신 때 반영, 「저장」은 반영 안 됨)</li><li><b>빈 시간</b> = 아무 물량도 없는 시간</li><li>자료 ${esc(O.asOf)} · 작업지시 시각 ${esc(String(O.woNow || '').slice(0, 16).replace('T', ' '))} · 계산 ${esc(O.built || '')}</li></ul>`;
  }

  /* 칸 한 양식(11/13 사용자 '도금이랑 컬러 양식 똑같이 · S/D·청소 같이 넣어 · 시간/뭐 생산하는지 구분'): 도금 캘린더와 같은 구조
     ① 제품 칩 + 그날 톤(크게) ② 시간 막대(하루 24h = 작업대기·지시대기·도료 미입고·계획편성 · 노랑 = 정지 · 빗금 회색 = 오늘 지난 시간 · 흰 = 빈 시간) + '가동 / 가용 h' + 정지 칩
     ③ 판매그룹 톤 ④ 경고(작업대기 부족 · 빈 시간 · 확정본 넘침) */
  const GNM = { 건재수출: '컬러수출', 가전수출: '컬러수출', 가전내수: '컬러수출', 주문재: '컬러건재', 계획재: '컬러건재' };   // 판매그룹 합(11/12 규칙 10 — 주문재·계획재 나누지 않음, 03 편성과 같은 묶음)
  const regroup = (G) => { const o = {}; Object.entries(G || {}).forEach(([g, v]) => { const k = GNM[g] || g || '기타'; o[k] = (o[k] || 0) + (+v || 0); }); return Object.entries(o).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]); };
  const prodChips = (P) => { const Q = P.filter(([, v]) => v >= 0.5); return Q.slice(0, Q.length > 1 && String(Q[0][0]).length + String(Q[1][0]).length > 9 ? 1 : 2).map(([p]) => `<span class="fam fam-CC">${esc(p)}</span>`).join('') };
  const w24 = (v) => `${Math.max(0, 100 * v / 24).toFixed(2)}%`;
  function cell(c, ln) {
    const D = c.down || [], dH = c.downH != null ? c.downH : D.reduce((a, x) => a + x[1], 0);
    if (c.stop) { const nm = D.length ? D.map(([k]) => k).join('·') : '정지'; return `<button type="button" class="cell sc stp" data-ln="${ln}" data-d="${c.d}" title="${ln} ${mdw(c.d)} ${esc(nm)} — 하루 종일"><div class="sc-r1"><span class="sc-off">${esc(nm)}</span></div><div class="sc-h">정지 24h</div></button>`; }
    const K = c.k || {}, past = Math.max(0, 24 - (c.capH || 0) - dH), empty = (c.capH || 0) - (c.usedH || 0);
    const P = {}; c.items.forEach((i) => { if (i.item) P[i.item] = (P[i.item] || 0) + i.t; });
    const prods = Object.entries(P).sort((a, b) => b[1] - a[1]), chips = prodChips(prods.length ? prods : (c.planItems || []));
    const big = D.some(([k]) => /S\/D/.test(k)), red = c.woShort > 0 || empty >= 0.1;
    const tip = `${ln} ${mdw(c.d)} · 생산 ${n0(c.cap)}t · ${KD.filter(([k]) => K[k]).map(([k, nm]) => `${nm} ${n0(K[k][0])}t ${n1(K[k][1])}h`).join(' · ')} · 가동 ${n1(c.usedH)}h / 가용 ${n1(c.capH)}h${D.length ? ` · 정지 ${D.map(([k, h]) => `${k} ${n1(h)}h`).join(' · ')}` : ''}${past >= 0.05 ? ` · 오늘 지난 ${n1(past)}h` : ''}${c.lockT ? ` · 확정본 ${n1(c.lockT)}t = 작업 순서 화면에서 이 라인·날짜로 확정한 작업` : ''}${c.woShort > 0 ? ` · ${SHORT_T}` : ''}`;
    return `<button type="button" class="cell sc${big ? ' mc' : ''}${red ? ' fl' : ''}" data-ln="${ln}" data-d="${c.d}" title="${esc(tip)}">`
      + `<div class="sc-r1"><span class="sc-ch">${chips}</span><span class="tv">${n0(c.cap)}<small>t</small></span></div>`
      + `<div class="sc-bar">${past >= 0.05 ? `<i class="spa" style="width:${w24(past)}"></i>` : ''}${D.map(([, h]) => `<i class="sst" style="width:${w24(h)}"></i>`).join('')}${KD.map(([k, , cl]) => (K[k] ? `<i class="${cl}" style="width:${w24(K[k][1])}"></i>` : '')).join('')}</div>`
      + `<div class="sc-h"><b>${n1(c.usedH)}</b> / ${n1(c.capH)}h${D.map(([k, h]) => ` <span class="sc-st">${esc(k)} ${n1(h)}h</span>`).join('')}</div>`
      + `<div class="gl">${regroup(c.grp).slice(0, 3).map(([g, v]) => `<span>${esc(g)} ${n0(v)}</span>`).join('')}</div>`
      + (c.lockT ? `<div class="mvc">확정본 ${n1(c.lockT)}t</div>` : '')
      + (c.overH ? `<div class="sh">확정본 넘침 ${n1(c.overH)}h</div>` : '')
      + (c.woShort > 0 ? `<div class="sh" title="${esc(SHORT_T)}">작업대기 부족 ${n1(c.woShort)}h</div>` : '')
      + (empty >= 0.1 ? `<div class="sh" title="넣을 물량(작업대기·지시대기·계획)이 없는 시간">빈 시간 ${n1(empty)}h</div>` : '')
      + '</button>';
  }

  /* 지난 날 칸(11/12 사용자 '수요일엔 왜 안 쓰는데'): MES 실적(color_actual byGroup — 라인·날 × 판매그룹 · 품명, 생산 분) — 앞날 칸과 같은 양식, 막대 = 실적 */
  function pastCell(ln, d) {
    const A = O.act || {}, x = (A.days || {})[d], a = x && x[ln];
    if (!A.asOf || d > A.asOf) return `<button type="button" class="cell sc pcell" tabindex="-1" title="${mdw(d)} ${ln} 실적 자료 없음(다음 날 아침 들어옴)"><div class="sc-r1"><span class="tv">–</span></div></button>`;
    if (!a) return `<button type="button" class="cell sc pcell" tabindex="-1" title="${mdw(d)} ${ln} 생산 없음"><div class="sc-r1"><span class="sc-ch"><span class="fam">비가동</span></span><span class="tv">0<small>t</small></span></div><div class="sc-bar"></div><div class="sc-h"><b>실적</b> 0h</div></button>`;
    const [g, mn, pr] = a, t = sum(Object.values(g || {}), (v) => v);
    return `<button type="button" class="cell sc pcell" tabindex="-1" title="${mdw(d)} ${ln} 생산 실적(MES) ${n0(t)}t · ${n1(mn / 60)}h · 품명 ${(pr || []).map(([p, v]) => `${p} ${n0(v)}`).join(' · ')}">`
      + `<div class="sc-r1"><span class="sc-ch">${prodChips(pr || [])}</span><span class="tv">${n0(t)}<small>t</small></span></div>`
      + `<div class="sc-bar"><i class="sk0" style="width:${w24(Math.min(24, mn / 60))}"></i></div><div class="sc-h"><b>실적</b> ${n1(mn / 60)}h</div>`
      + `<div class="gl">${regroup(g).slice(0, 3).map(([k, v]) => `<span>${esc(k)} ${n0(v)}</span>`).join('')}</div></button>`;
  }
  const actT = (ln, d) => { const x = ((O.act || {}).days || {})[d], a = x && x[ln]; return a ? sum(Object.values(a[0] || {}), (v) => v) : 0; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const wedOf = (s) => { const x = dt(s); x.setDate(x.getDate() - ((x.getDay() + 4) % 7)); return iso(x); };   // 생산주(수~화)의 수요일 — 도금 캘린더·작업 순서와 같은 주
  function weekTable(w0, days) {
    const idx = (d) => O.days.indexOf(d);
    const lead = Math.round((dt(days[0]) - dt(w0)) / 864e5), P = (n) => '<td class="pad" aria-hidden="true"></td>'.repeat(Math.max(0, n));
    const pad = P(7 - lead - days.length);   // 월말 뒤는 빈 칸으로 채워 칸 폭을 7칸에 맞춤
    const pds = Array.from({ length: Math.max(0, lead) }, (_, i) => { const x = dt(w0); x.setDate(x.getDate() + i); return iso(x); });   // 이번 주 지난 날 = 실적
    const nx = (() => { const x = dt(wedOf(O.asOf)); x.setDate(x.getDate() + 7); return iso(x); })(), we = (() => { const x = dt(w0); x.setDate(x.getDate() + 6); return iso(x); })();
    const wl = w0 === nx ? ['다음 주', 'nx'] : w0 < nx ? ['이번 주', ''] : ['계획', 'pl'];
    const head = `<th class="wl ${wl[1]}" title="생산주 ${mdw(w0)} ~ ${mdw(we)}">${wl[0]}<small>${md(w0)}~${md(we)}</small></th>` + pds.map((d) => `<th class="pst">${mdw(d)}<small class="tdy" style="background:var(--sub);color:var(--ink-2)">실적</small></th>`).join('') + days.map((d) => { const wd = dt(d).getDay(); return `<th class="${wd === 0 || wd === 6 || d === '2026-12-25' || d === '2027-01-01' ? 'we' : ''}${d === UI.today() ? ' tdy' : ''}">${mdw(d)}${d === UI.today() ? '<small class="tdy">오늘</small>' : ''}</th>`; }).join('') + pad.replace(/td/g, 'th');
    const rows = LINES.map((ln) => `<tr><th>${ln}<small title="이 주 ${ln} 생산 톤 · 편성 시간">${n0(sum(days, (d) => O.lines[ln][idx(d)].cap))}t · ${n0(sum(days, (d) => O.lines[ln][idx(d)].usedH))}h</small></th>${pds.map((d) => `<td class="pst">${pastCell(ln, d)}</td>`).join('')}${days.map((d) => `<td${d === UI.today() ? ' class="tdy"' : ''}>${cell(O.lines[ln][idx(d)], ln)}</td>`).join('')}${pad}</tr>`).join('');
    const sd = (d) => sum(LINES, (l) => O.lines[l][idx(d)].cap);
    const tot = `<tr class="dsum"><th title="네 라인 하루 생산 톤 합">하루 합<small>주 ${n0(sum(days, sd))}t</small></th>${pds.map((d) => `<td class="pst" title="${mdw(d)} 네 라인 생산 실적"><b>${n0(sum(LINES, (l) => actT(l, d)))}</b><small>t</small></td>`).join('')}${days.map((d) => `<td><b>${n0(sd(d))}</b><small>t</small></td>`).join('')}${pad}</tr>`;
    return `<table class="cg"><thead><tr>${head}</tr></thead><tbody>${rows}${tot}</tbody></table>`;
  }

  function calCard() {
    return `<section class="card"><h2>라인별 ~${END()} <small title="라인 하루 24시간(계획 휴지 뺌)">칸을 누르면 그날 계약 목록</small></h2>`
      + '<div class="lgx"><div class="lg2">' + KD.map(([, nm, cl, t]) => `<span><i class="${cl}"></i><b>${nm}</b>${esc(t.split(' — ')[0])}</span>`).join('')
      + '<span><i class="sst"></i><b>노랑 = 정지</b>M/C·S/D·청소 등 하루 안 몇 시간</span><span><i class="spa"></i><b>빗금 회색</b>오늘 이미 지난 시간</span><span><i class="sgap"></i><b>흰 칸 = 빈 시간</b>넣을 일 없음</span>'
      + '<span><i style="background:#1f3864"></i><b>남색 칸 = 하루 종일 정지</b>정기수리·휴지</span><span><i style="background:#ffff00;box-shadow:inset 0 0 0 1px #808080"></i><b>노란 칸 = M/C·S/D 날</b></span><span><i class="sk0"></i><b>음영 칸 = 실적</b>지난 날 MES 생산</span><span><i style="background:var(--bad)"></i><b>빨간 줄 = 확인 필요</b></span></div>'
      + `<p class="lgn"><b>칸</b> = 제품 칩 · <b>큰 숫자</b> = 그날 톤 · <b>막대·'가동 / 가용 h'</b> = 하루 24h 중 가동 시간(가용 = 24h − 정지) · <b>아래</b> = 판매그룹별 톤 · <b>주</b> = 수~화 생산주</p></div>`
      + (O.cus ? '' : '<p class="msg" style="margin:0 0 10px">DUMMY 고객 제외: 컬러 계약 고객사 자료(snap_cc_cus_names)가 사내 PC 다음 실행부터 반영 — 현재는 DUMMY 포함</p>')
      + weeks().map(([w0, ds]) => `<div class="wk">${weekTable(w0, ds)}</div>`).join('') + '</section>';
  }

  function matCard() {
    const M = O.mat || {}, B = M.buySoonDaily || {}, S = M.selfCgDaily || {};
    const wk = (D) => { const o = {}; Object.entries(D).forEach(([d, v]) => { const k = wedOf(d); o[k] = (o[k] || 0) + v; }); return o; };   // 생산주(수~화) — 예전 월요일 시작 + toISOString(한국 시각 → 하루 앞 날짜)
    const bw = wk(B), sw = wk(S), ks = [...new Set([...Object.keys(bw), ...Object.keys(sw)])].sort();
    const rows = ks.map((k) => `<tr><td class="nw">${md(k)}~ 주</td><td class="num">${n0(bw[k] || 0)}</td><td class="num">${n0(sw[k] || 0)}</td></tr>`).join('');
    return '<section class="card"><h2>소재 들어오는 양 <small>주별 · 톤</small></h2>'
      + `<div class="mt" style="margin:0 0 12px"><div><div class="s">구매 소재 재고</div><b class="v">${n0(M.buyStock)}t</b></div><div><div class="s">구매 소재 입고 예정 ~${END()}</div><b class="v">${n0(M.buySoon)}t</b></div>`
      + `<div title="컬러 소재 창고의 자사(도금) 소재 중 사용가능·작업지시대기·가공대기 재고 — 관제의 '도금 자가재 재고'(판생 속보, 도금 쪽 자가재 제품 재고 전체)와 범위가 다름"><div class="s">자가재 재고(컬러 소재 창고 · 투입 가능)</div><b class="v">${n0(M.selfStock)}t</b></div><div><div class="s">도금 자가재 생산 ~${END()}</div><b class="v">${n0(M.selfCg)}t</b></div></div>`
      + (rows ? `<table class="it" style="max-width:520px"><thead><tr><th>주</th><th class="num">구매 소재 입고 예정</th><th class="num">도금 자가재 생산</th></tr></thead><tbody>${rows}</tbody></table>` : '')
      + '</section>';
  }

  function openDay(ln, d) {
    const c = O.lines[ln][O.days.indexOf(d)], dlg = $('kc-dlg');
    let body = c.stop ? '<p class="msg">라인 정지(휴지·수리)</p>' : '';
    for (const [k, nm, cl] of KD) {
      const I = c.items.filter((i) => i.kind === k);
      if (!I.length) continue;
      if (k === '계획편성') { body += `<div class="fgl kgbg">${nm} ${n0(sum(I, (i) => i.t))}t · ${n1(sum(I, (i) => i.h))}h(주문 연결 전) — ${I.map((i) => `${esc(i.grp)} ${n0(i.t)}t`).join(' · ')}${(c.planItems || []).length ? `<div class="pi">그날 계획 품명: ${c.planItems.map(([p, t]) => `${esc(p)} ${n0(t)}`).join(' · ')}</div>` : ''}</div>`; continue; }
      body += `<h4 class="kh"><i class="${cl}"></i>${nm} <small>${I.length}건 · ${n0(sum(I, (i) => i.t))}t · ${n1(sum(I, (i) => i.h))}h</small></h4>`
        + '<table class="it cmp"><colgroup><col style="width:48px"><col style="width:190px"><col><col style="width:96px"><col style="width:104px"><col style="width:96px"><col style="width:72px"><col style="width:64px"><col style="width:96px"></colgroup><thead><tr><th>순서</th><th>계약번호-행번</th><th>품명</th><th>그룹</th><th>두께×폭</th><th>상도 색</th><th class="num">톤</th><th class="num">시간</th><th>부원료 준비</th></tr></thead><tbody>'
        + I.map((i, j) => `<tr><td class="sq">${j + 1}</td><td><div class="con">${esc(i.con)}${i.cont ? ' <small>(앞 날에서 이어서)</small>' : ''}</div>${i.locked ? '<span class="bd mv" title="작업 순서 화면에서 이 라인·날짜로 확정">확정본</span>' : ''}</td><td><b>${esc(i.item || '')}</b></td><td class="nw">${esc(i.grp || '')}</td>`
          + `<td class="sz">${i.thk ? `${(+i.thk).toFixed(2)}×${n0(i.wdt)}` : '-'}</td><td class="nw">${esc(i.color || '')}</td><td class="num"><b>${n1(i.t)}</b></td><td class="num">${n1(i.h)}</td><td class="nw">${k === '부자재 입고대기' ? '<span class="bad">일정 없음</span>' : i.locked && i.ready > d ? `<b style="color:var(--bad)" title="확정한 날이 부원료 입고 전">${md(i.ready)} 입고</b>` : md(i.ready) || '-'}</td></tr>`).join('')
        + '</tbody></table>';
    }
    if (!body) body = '<p class="msg">배정 없음</p>';
    dlg.innerHTML = `<div class="dh"><b>${ln} ${mdw(d)}</b><span>가용 <b>${n1(c.capH)}h</b> · 편성 ${n1(c.usedH)}h${c.woShort > 0 ? ` · <b class="bad">작업대기 부족 ${n1(c.woShort)}h</b>` : c.short > 0 ? ` · <b class="bad">빈 시간 ${n1(c.short)}h</b>` : ''}</span>`
      + `<span class="x"><button type="button" id="kc-x" aria-label="닫기">닫기 ×</button></span></div><div class="db">${body}</div>`;
    $('kc-x').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
  }

  function render() {
    const stale = Math.round((Date.now() - dt(O.asOf).getTime()) / 864e5);
    $('kc-main').innerHTML = (stale >= 2 ? `<div class="card" style="background:var(--warn-bg);color:var(--warn);font-weight:700">자료 기준 ${md(O.asOf)} — ${stale}일 전 자료</div>` : '')
      + calCard() + matCard();
    $('kc-main').querySelectorAll('button.cell[data-d]').forEach((b) => b.onclick = () => openDay(b.dataset.ln, b.dataset.d));
    if (window.PS) PS.sum('C', summary(), spec(), O.asOf);
    if (window.UI) UI.reveal($('kc-main'));
  }
  if ($('kc-dlg')) $('kc-dlg').addEventListener('click', (e) => { if (e.target === $('kc-dlg')) $('kc-dlg').close(); });
  /* 생산 일정 화면(ct_plan.html)에 붙어 있음 — 암호는 화면 공통 잠금(CT.boot)이 받고, 여기서는 저장된 암호로만 엶(ensure) */
  const envReady = GP.latest('cc_calendar.enc.json'), actReady = GP.latest('color_actual.enc.json').catch(() => null);
  let busy = false;
  async function unlock(pw) {
    if (O || busy || !pw) return; busy = true;
    const env = await envReady;
    const msg = (t) => { if ($('kc-msg')) $('kc-msg').textContent = t; };
    if (!env) { msg('게시된 자료가 없습니다.'); busy = false; return; }
    try { O = await GP.decryptJSON(env, pw); }
    catch (e) { msg('⚠ 암호가 맞지 않습니다'); busy = false; return; }
    O.act = await actReady.then((e) => e && GP.decryptJSON(e, pw)).then((a) => (a && a.byGroup) || {}).catch(() => ({}));
    busy = false; if ($('kc-main')) render();
  }
  const weeks = () => { const W = []; O.days.forEach((d) => { const w = wedOf(d); if (!W.length || W[W.length - 1][0] !== w) W.push([w, []]); W[W.length - 1][1].push(d); }); return W; };
  /* raw() = 이번 생산주(days) + 다음 생산주(days2, 창 안에 있는 날만) 자료(편성 화면이 2주 칸을 직접 그림 — 생산 일정 화면 모양은 그대로) · act = 실적(자료 없음 null, 생산 없음 t 0) */
  const raw = () => { const WS = O && weeks(), W = WS && WS[0]; if (!W) return null; const [w0, days] = W, days2 = (WS[1] || [null, []])[1], i = (d) => O.days.indexOf(d), A = O.act || {};
    return { w0, days, days2, KD, cell: (ln, d) => O.lines[ln][i(d)], allDays: O.days, all: (ln) => O.lines[ln], woUntil: (ln) => (O.summary[ln] || {}).woUntil, act: (ln, d) => { if (!A.asOf || d > A.asOf) return null; const x = (A.days || {})[d], a = x && x[ln]; if (!a) return { t: 0, h: 0, grp: {}, pr: [] }; return { t: sum(Object.values(a[0] || {}), (v) => v), h: (a[1] || 0) / 60, grp: a[0] || {}, pr: a[2] || [] }; } }; };
  window.CCCAL = { raw, load: async (pw) => { await unlock(pw); return !!O; }, week: () => { const W = O && weeks()[0]; return W ? weekTable(W[0], W[1]) : ''; }, items: (ln, d) => { const c = O && O.lines[ln] && O.lines[ln][O.days.indexOf(d)]; return c ? c.items : []; }, stop: (ln, d) => { const c = O.lines[ln][O.days.indexOf(d)]; return !!c && !!c.stop; }, ensure: () => { let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ } if (O) render(); else unlock(s); } };
})();
