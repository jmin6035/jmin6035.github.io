/* 05 생산·출하(11/4 2차 진단 8장): 하위 화면 = 주소 # (#perf 생산 실적 · #run 가동·차질 · #ship 출하 실적 · #stock 제품 재고) — 화면 안 탭 없음
   원천: portal(lines·groups·acc·sr·shipDay·stockTrend·stockRoll·week) · plating_actual(daily·dayMin·dayStops·dayDummy·accHist) · color_actual(daily·downAct·lines) · 주문(CT.orders) */
(function () {
  'use strict';
  const { esc, n0, n1, md } = CT;
  const FULL = '종일 정지(계획 휴지)';
  const CCAT = { color: '색상교체·청소', test: '테스트·도막조정', roll: '폭·롤·두께 전환', gap: '정지(사유 기록 없음)', etc: '기타' };
  const SHIPK = { 도금판매: 'G국내', 도금수출: 'G수출', 자동차강판: 'G자동차', 컬러수출: 'C수출', 컬러건재: 'C건재' };
  const VIEWS = ['perf', 'run', 'ship', 'stock'];
  let bound = false;
  CT.boot(['portal.enc.json', 'plating_actual.enc.json', 'color_actual.enc.json', 'cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json'], draw);

  function draw(D) {
    const m = document.getElementById('ct-main'), v = CT.view('perf', VIEWS), X = ctx(D);
    m.innerHTML = ({ perf, run, ship, stock })[v](X);
    bind(m, X);
    CT.keyRows(m);
    if (!bound) { bound = true; CT.onView(() => { CT.panel(null); draw(D); if (window.UI && UI.reveal) UI.reveal(m); }); }
  }

  /* 공통 계산 */
  function ctx(D) {
    const P = D.portal, GA = D.plating_actual || {}, CA = D.color_actual || {};
    const asOfG = P.asOf, asOfC0 = CA.asOf || asOfG;
    const asOfC = asOfC0 >= CT.today() ? CT.addD(asOfC0, -1) : asOfC0;   // 진행 중인 생산일은 실적·정지가 덜 들어옴 → 어제까지
    const mon = String(asOfG).slice(0, 7);
    const lines = (P.lines || []).filter((l) => CT.inScope(l.pl)).map((l) => {
      const ref = ((l.pl === 'G' ? GA.lines : CA.lines) || []).find((x) => x.line === l.line) || {};
      return { ...l, asOfL: l.pl === 'G' ? asOfG : asOfC, rate: (ref.w0 && ref.w0.tph) || l.tph || 0 };   // 손실 환산 속도 = 기준 기간 평균 t/h
    });
    const daily = (pl) => (pl === 'G' ? GA.daily : CA.daily) || [];
    const prodOn = (l, d) => { const r = daily(l.pl).find((x) => x.d === d); return r ? +r[l.line] || 0 : null; };
    // 하루 비가동(분, 유형별): 도금 = 1440 − 가동분(MES) 을 휴지 기록·더미로 나누고 나머지 '사유 기록 없음', 컬러 = MES 실제 휴지
    const stopsOn = (l, d) => {
      if (l.pl === 'G') {
        const run = ((GA.dayMin || {})[d] || {})[l.line]; if (run == null) return null;
        const S = (((GA.dayStops || {})[d] || {})[l.line] || []).map((s) => [s[0], s[1], s[2] || s[0]]);
        const dm = ((GA.dayDummy || {})[d] || {})[l.line] || 0; if (dm) S.push(['더미(전환 손실)', dm, '더미']);
        const rest = 1440 - run - S.reduce((a, s) => a + s[1], 0); if (rest >= 5) S.push(['사유 기록 없음', rest, '사유 기록 없음']);
        return S;
      }
      const R = (((CA.downAct || {}).days || {})[d] || {})[l.line]; if (!R) return null;
      const out = R.map((s) => [CCAT[s[0]] || s[0], s[1], CCAT[s[0]] || s[0]]);
      // 생산 0 · 종일 정지 = 계획 휴지(가동편성 정비·휴지)로 보고 손실 톤 환산에서 뺌(11/4: 2CCL 휴지 168h 가 손실 2,426t 로 과대 표시되던 것)
      return !prodOn(l, d) && out.reduce((a, s) => a + s[1], 0) >= 1380 ? [[FULL, out.reduce((a, s) => a + s[1], 0), FULL]] : out;
    };
    const M = CT.orders(D);
    return { D, P, GA, CA, asOfG, asOfC, mon, lines, daily, prodOn, stopsOn, M };
  }
  const days = (to, n) => Array.from({ length: n }, (_, i) => CT.addD(to, i - n + 1));
  const sgn = (v) => `${v >= 0 ? '+' : '−'}${n0(Math.abs(v))}`;
  const pc = (a, b) => (b ? Math.round(a / b * 100) : null);
  const card = (h, body, cls = '') => `<section class="card ${cls}"><h2>${h}</h2>${body}</section>`;
  const t = (head, rows, cls = '') => `<div class="ct-wrap"><table class="ct-t ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const th = (s, r, tip) => `<th${r ? ' class="r"' : ''}${tip ? ` title="${esc(tip)}"` : ''}>${s}</th>`;

  /* #perf 생산 실적 */
  function perf(X) {
    const { P, asOfG, asOfC, mon, lines, daily, stopsOn, GA } = X;
    const Gs = (P.groups || []).filter((g) => CT.inScope(g.pl) && g.prod);
    const mPlan = Gs.reduce((a, g) => a + (g.prod.month || 0), 0), mAct = Gs.reduce((a, g) => a + (g.prod.actual || 0), 0);
    const carryOf = (g) => Math.max(0, (g.prod.month || 0) - (g.prod.actual || 0) - (g.prod.after || 0));
    const carry = Gs.reduce((a, g) => a + carryOf(g), 0);
    const L = lines.map((l) => {
      const act = daily(l.pl).filter((r) => String(r.d).slice(0, 7) === mon && r.d <= l.asOfL).reduce((a, r) => a + (+r[l.line] || 0), 0);
      const plan = l.pl === 'G' ? l.sched : null;
      const c = {}; days(l.asOfL, CT.diff(l.asOfL, mon + '-01') + 1).forEach((d) => (stopsOn(l, d) || []).forEach((s) => { c[s[0]] = (c[s[0]] || 0) + s[1] / 60; }));
      return { ...l, act, plan, cause: Object.entries(c).filter(([, h]) => h >= 0.05).sort((a, b) => b[1] - a[1]) };
    });
    const Lp = L.filter((x) => x.plan != null), dPlan = Lp.reduce((a, x) => a + x.plan, 0), dAct = Lp.reduce((a, x) => a + x.act, 0);
    const Lc = L.filter((x) => x.plan == null);
    const k = [
      { label: `${+mon.slice(5)}월 생산계획`, v: n0(mPlan), unit: 't', tone: 'info', sub: '기준 계획 · 판매그룹 합' },   // 11/9: 값 = 확정(기준) 계획 월 물량(pages.py groups.prod.month) — '최신 가동계획' 아님
      { label: '생산실적(누계)', v: n0(mAct), unit: 't', tone: 'info', sub: `MES ~${md(asOfG)}${Lc.length && asOfC !== asOfG ? ` · 컬러 ~${md(asOfC)}` : ''}` },
      { label: '계획 대비 차이', v: Lp.length ? sgn(dAct - dPlan) : '-', unit: 't', tone: !Lp.length ? '' : dAct >= dPlan ? 'ok' : dAct >= dPlan * 0.95 ? 'warn' : 'bad', sub: Lp.length ? `일정 누계 대비 ${pc(dAct, dPlan)}%` : '라인 계획 없음' },
      { label: '이월 예상', v: n0(carry), unit: 't', tone: carry >= 1 ? 'warn' : 'ok', sub: '월 계획 − 실적 − 남은 계획' },
    ];
    const scope = `<p class="pp-scope"><b>계획 대비 산출 범위</b> ${Lp.length ? `도금 ${Lp.length}라인(${Lp.map((x) => x.line).join('·')}, 판생속보 일정 누계 ${n0(dPlan)}t)` : '도금 제외(범위 밖)'}`
      + `${Lc.length ? ` · 컬러 ${Lc.length}라인 제외 — 라인 계획 없어 판매그룹 편성 기준(월 계획·이월에만 포함)` : ''}</p>`;
    const row = (x) => { const d = x.plan != null ? x.act - x.plan : null, r = x.plan ? x.act / x.plan : null;
      return `<tr class="ck" data-l="${esc(x.line)}"><td class="id">${esc(x.line)}<small>${x.pl === 'G' ? '도금' : '컬러'}${x.fam ? ` · ${esc(x.fam)}` : ''}</small></td>`
        + `<td class="r">${x.pl === 'G' ? n0(x.month) : '<span class="sub">없음</span>'}</td><td class="r">${x.plan != null ? n0(x.plan) : '<span class="sub">없음</span>'}</td><td class="r"><b>${n0(x.act)}</b></td>`
        + `<td class="r ${d == null ? '' : d >= 0 ? 'pos' : 'neg'}">${d == null ? '-' : sgn(d)}</td><td class="r">${r == null ? '-' : `<b class="${r >= 1 ? 'pos' : r >= 0.95 ? 'wrn' : 'neg'}">${Math.round(r * 100)}%</b>`}</td>`
        + `<td class="w">${x.cause.length ? x.cause.slice(0, 2).map(([c, h]) => `<span class="pp-c">${esc(c)} <b>${n1(h)}h</b></span>`).join('') : '<span class="sub">기록 없음</span>'}</td></tr>`; };
    const tbl = t([th('라인'), th('월 계획', 1, '판생속보 라인 월 계획'), th('일정 누계', 1, '판생속보 오늘까지 일정'), th('실적 누계', 1), th('차이', 1), th('달성률', 1), th('휴지 상위(누계)')], L.map(row), 'pp-t');
    // 일별 추이(최근 14일): 도금 = 아침 계획 대비, 컬러 = 실적만
    const D14 = days(asOfG, 14), acc = {}; (GA.accHist || []).forEach((a) => { (acc[a[0]] = acc[a[0]] || {})[a[1]] = a[2]; });
    const sum = (pl, d) => lines.filter((l) => l.pl === pl).reduce((a, l) => { const v = X.prodOn(l, d); return v == null ? a : (a || 0) + v; }, null);
    const dh = (pl, d) => lines.filter((l) => l.pl === pl).reduce((a, l) => a + (stopsOn(l, d) || []).reduce((b, s) => b + s[1], 0) / 60, 0);
    const hasG = lines.some((l) => l.pl === 'G'), hasC = lines.some((l) => l.pl === 'C');
    const mx = Math.max(1, ...D14.map((d) => Math.max(sum('G', d) || 0, sum('C', d) || 0)));
    const trow = (d) => { const g = sum('G', d), c = sum('C', d), gp = acc[d] ? Object.entries(acc[d]).filter(([l]) => lines.some((x) => x.line === l)).reduce((a, [, v]) => a + v, 0) : null;
      return `<tr><td class="id">${md(d)}</td>${hasG ? `<td class="r">${gp ? n0(gp) : '-'}</td><td class="r"><b>${g == null ? '-' : n0(g)}</b></td><td class="pp-bar"><i style="width:${((g || 0) / mx * 100).toFixed(1)}%"></i></td><td class="r">${n1(dh('G', d))}</td>` : ''}`
        + `${hasC ? `<td class="r"><b>${c == null || d > asOfC ? '-' : n0(c)}</b></td><td class="pp-bar"><i class="c" style="width:${(d > asOfC ? 0 : (c || 0) / mx * 100).toFixed(1)}%"></i></td><td class="r">${d > asOfC ? '-' : n1(dh('C', d))}</td>` : ''}</tr>`; };
    const trend = t([th('일자'), ...(hasG ? [th('도금 아침 계획', 1), th('도금 실적', 1), th(''), th('도금 비가동 h', 1)] : []), ...(hasC ? [th('컬러 실적', 1), th(''), th('컬러 비가동 h', 1)] : [])], D14.slice().reverse().map(trow));
    // 이월·휴지 원인
    const cg = Gs.map((g) => `<tr><td class="id">${esc(g.name)}</td><td class="r">${n0(g.prod.month)}</td><td class="r">${n0(g.prod.actual)}</td><td class="r">${n0(g.prod.after)}</td><td class="r ${carryOf(g) >= 1 ? 'wrn' : ''}"><b>${n0(carryOf(g))}</b></td></tr>`);
    const cat = {}; L.forEach((x) => x.cause.forEach(([c, h]) => { const k_ = `${x.pl === 'G' ? '도금' : '컬러'}|${c}`; cat[k_] = (cat[k_] || 0) + h; }));
    const cr = Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k_, h]) => { const [pl, c] = k_.split('|'); return `<tr><td>${pl}</td><td class="w">${esc(c)}</td><td class="r"><b>${n1(h)}</b></td></tr>`; });
    return CT.basis([{ name: '도금 실적', at: asOfG, kind: '실적' }, hasC && { name: '컬러 실적', at: asOfC, kind: '실적' }, { name: '판생속보', at: P.sr && P.sr.asOf, kind: '확정계획' }, { name: '그룹 월 계획', at: P.built, kind: '재계획' }])
      + card(`생산 실적 <small>${+mon.slice(5)}월 누계</small><span class="unit">톤</span>`, CT.kpis(k) + scope + tbl)
      + card('일별 추이 <small>최근 14일</small><span class="unit">톤 · 시간</span>', trend)
      + `<div class="pp-2">${card('이월 예상 <small>판매그룹</small><span class="unit">톤</span>', t([th('판매그룹'), th('월 계획', 1), th('실적', 1), th('남은 계획', 1), th('이월 예상', 1)], cg))}`
      + `${card(`휴지 원인 <small>${+mon.slice(5)}월 누계</small><span class="unit">시간</span>`, cr.length ? t([th('공정'), th('유형'), th('시간', 1)], cr) : '<p class="ct-note">기록 없음</p>')}</div>`;
  }

  /* #run 가동·차질 */
  function run(X) {
    const { P, lines, prodOn, stopsOn } = X;
    const ev = (P.week && P.week.events) || [];
    const R = lines.map((l) => {
      const D7 = days(l.asOfL, 7), p7 = D7.reduce((a, d) => a + (prodOn(l, d) || 0), 0), s7 = D7.reduce((a, d) => a + (stopsOn(l, d) || []).reduce((b, s) => b + s[1], 0), 0) / 60;
      const p1 = prodOn(l, l.asOfL), s1 = (stopsOn(l, l.asOfL) || []).reduce((b, s) => b + s[1], 0) / 60;
      const nx = l.pl === 'G' ? l.next : (() => { const e = ev.find((e_) => e_.pl === 'C' && e_.text.startsWith(l.line)); return e ? [e.d, e.text.replace(l.line + ' ', '')] : null; })();
      const st = !p1 && s1 >= 23 ? ['정지', 'neg'] : s1 >= 4 ? ['부분 정지', 'wrn'] : ['가동', 'pos'];
      const cat = {}; D7.forEach((d) => (stopsOn(l, d) || []).forEach((s) => { cat[s[0]] = (cat[s[0]] || 0) + s[1] / 60; }));
      return { l, p7, s7, p1, s1, nx, st, cat };
    });
    const row = (x) => `<tr class="ck" data-l="${esc(x.l.line)}"><td class="id">${esc(x.l.line)}<small>${x.l.pl === 'G' ? '도금' : '컬러'}</small></td><td><b class="${x.st[1]}">${x.st[0]}</b><small>${md(x.l.asOfL)} 기준</small></td>`
      + `<td class="r"><b>${x.p1 == null ? '-' : n0(x.p1)}</b></td><td class="r">${n1(x.s1)}</td><td class="r"><b>${n0(x.p7)}</b></td><td class="r">${n1(x.s7)}</td><td class="r">${pc(168 - x.s7, 168)}%</td>`
      + `<td>${x.nx ? `<b>${md(x.nx[0])}</b> ${esc(x.nx[1])}` : '<span class="sub">-</span>'}</td></tr>`;
    const tbl = t([th('라인'), th('상태'), th('하루 생산', 1), th('하루 비가동 h', 1), th('7일 생산', 1), th('7일 비가동 h', 1), th('가동률', 1, '1 − 비가동/168h'), th('다음 일정')], R.map(row));
    const loss = R.flatMap((x) => Object.entries(x.cat).filter(([, h]) => h >= 0.1).map(([c, h]) => ({ l: x.l, c, h, t: c === FULL ? 0 : h * x.l.rate }))).sort((a, b) => b.t - a.t);
    const lr = loss.map((z) => `<tr class="ck" data-l="${esc(z.l.line)}"><td class="w">${esc(z.c)}</td><td class="id">${esc(z.l.line)}</td><td class="r"><b>${n1(z.h)}</b></td><td class="r">${n1(z.l.rate)}</td><td class="r"><b>${n0(z.t)}</b></td></tr>`);
    const tot = loss.reduce((a, z) => [a[0] + z.h, a[1] + z.t], [0, 0]);
    return CT.basis([{ name: '도금 MES', at: X.asOfG, kind: '실적' }, lines.some((l) => l.pl === 'C') && { name: '컬러 MES', at: X.asOfC, kind: '실적' }])
      + card('라인 상태 <small>실시간 아님 · 최근 수집 자료 기준</small><span class="unit">톤 · 시간</span>', tbl)
      + card(`휴지 유형별 손실 <small>최근 7일 · 합 ${n1(tot[0])}h · 추정 ${n0(tot[1])}t · 줄을 누르면 관련 주문</small><span class="unit">시간 · 톤</span>`,
        lr.length ? t([th('휴지 유형'), th('라인'), th('시간', 1), th('t/h', 1, '기준 기간 평균 시간당 생산'), th('추정 손실(t)', 1, '시간 × t/h')], lr) : '<p class="ct-note">기록 없음</p>');
  }
  function linePanel(X, line) {
    const l = X.lines.find((x) => x.line === line), to = CT.addD(X.M.asOf, 7);
    const O = X.M.all.filter((o) => o.line === line && !o.closed && o.remT > 0.5 && o.needProd && o.needProd <= to).sort((a, b) => String(a.needProd).localeCompare(String(b.needProd)));
    const st = []; days(l.asOfL, 7).reverse().forEach((d) => (X.stopsOn(l, d) || []).forEach((s) => st.push([d, s[2], s[1]])));
    const html = `<div class="ct-kv"><span>관련 주문</span><b>${O.length}건 · ${n0(O.reduce((a, o) => a + o.remT, 0))}t</b></div><div class="ct-kv"><span>기준</span><b>생산 필요일 ~${md(to)} · 미완료</b></div>`
      + `<h4>관련 주문</h4>${O.length ? `<table class="ct-t"><tbody>${O.slice(0, 60).map((o, i) => `<tr class="ck" data-o="${i}"><td>${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)}</small></td><td class="r">${n1(o.remT)}t</td><td>${md(o.needProd)}</td></tr>`).join('')}</tbody></table>` : '<p class="ct-note">없음</p>'}`
      + `<h4>최근 7일 휴지</h4>${st.length ? `<table class="ct-t"><tbody>${st.slice(0, 40).map((s) => `<tr><td>${md(s[0])}</td><td class="w">${esc(s[1])}</td><td class="r">${n0(s[2])}분</td></tr>`).join('')}</tbody></table>` : '<p class="ct-note">기록 없음</p>'}`;
    CT.panel(html, `${line} 관련 주문`, (p) => p.querySelectorAll('tr[data-o]').forEach((r) => r.onclick = () => { const o = O[+r.dataset.o]; CT.panel(CT.orderDetail(o), o.id); }));
  }

  /* #ship 출하 실적 */
  function shipRows(X) {
    const { P, mon } = X, SD = (P.shipDay && P.shipDay.g) || {};
    return ((P.sr && P.sr.ship) || []).filter((s) => SHIPK[s.name] && CT.inScope(SHIPK[s.name][0])).map((s) => {
      const k = SHIPK[s.name], mes = SD[k] ? Object.entries(SD[k]).filter(([d]) => d.slice(0, 7) === mon).reduce((x, [, v]) => x + v, 0) : null, a = s.actual != null ? s.actual : mes;   // 11/7 점검: 위 관제 띠와 같은 판생 실적(MES 출고는 11/1 일요일분·도금수출 선적일 기준이라 달라 참고)
      return { ...s, key: k, pl: k[0], a, mes };
    });
  }
  function ship(X) {
    const { P, M, mon } = X, S = shipRows(X), asOf = M.asOf;
    const mP = S.reduce((a, s) => a + s.month, 0), mA = S.reduce((a, s) => a + s.a, 0), short = S.reduce((a, s) => a + Math.max(0, s.sched - s.a), 0);
    const G = CT.inScope('G') ? M.G : [];
    const late = G.filter((o) => o.due && o.due <= asOf && !o.closed && o.ful !== '출하 확인 불가' && o.risk !== '판정 불가' && o.unshipT > 0.5);
    const stale = G.filter((o) => o.due && o.due <= asOf && !o.closed && o.ful !== '출하 확인 불가' && o.risk === '판정 불가');   // 납기 60일 넘게 지난 미종결(MES 종결 누락 추정)
    const unk = G.filter((o) => o.due && o.due <= asOf && o.ful === '출하 확인 불가');
    const k = [
      { label: `${+mon.slice(5)}월 출하계획`, v: n0(mP), unit: 't', tone: 'info', sub: `판생속보 ${md(P.sr && P.sr.asOf)}` },
      { label: '출하 실적(누계)', v: n0(mA), unit: 't', tone: 'info', sub: `월 진도 ${pc(mA, mP)}%` },
      { label: '일정 미달량', v: n0(short), unit: 't', tone: short >= 1 ? 'warn' : 'ok', sub: '그룹별 일정 누계 − 실적(미달만)' },
      { label: '미출하 주문', v: n0(late.length), unit: '건', tone: late.length ? 'bad' : 'ok', sub: `도금 · 납기 경과 ${n0(late.reduce((a, o) => a + o.unshipT, 0))}t · 출하 실적 없음 ${n0(unk.length)}건${stale.length ? ` · 장기 미종결 ${n0(stale.length)}건 제외` : ''}` },
    ];
    const row = (s) => { const d = s.a - s.sched;
      return `<tr><td class="id">${esc(s.name)}</td><td class="r">${n0(s.month)}</td><td class="r">${n0(s.sched)}</td><td class="r"><b>${n0(s.a)}</b></td><td class="r ${d >= 0 ? 'pos' : 'neg'}">${sgn(d)}</td>`
        + `<td class="r">${pc(s.a, s.month)}%</td><td class="r">${s.sched ? `<b class="${s.a >= s.sched ? 'pos' : s.a >= s.sched * 0.9 ? 'wrn' : 'neg'}">${pc(s.a, s.sched)}%</b>` : '<span class="sub">일정 0</span>'}</td><td class="pp-bar"><i style="width:${Math.min(100, s.month ? s.a / s.month * 100 : 0).toFixed(1)}%"></i></td></tr>`; };
    const tbl = t([th('판매그룹'), th('월 출하계획', 1), th('일정 누계', 1, '판생속보 오늘까지 출하 일정'), th('출하 실적', 1), th('일정 대비', 1), th('월간 진도율', 1, '실적 ÷ 월 계획'), th('일정 누계 달성률', 1, '실적 ÷ 일정 누계'), th('')], S.map(row));
    // 일별 출하(이번 달) — 일별 계획 자료 없음
    const SD = (P.shipDay && P.shipDay.g) || {}, ds = [...new Set(S.flatMap((s) => Object.keys(SD[s.key] || {})))].filter((d) => d.slice(0, 7) === mon).sort().reverse();
    const dr = ds.map((d) => `<tr><td class="id">${md(d)}</td>${S.map((s) => `<td class="r">${(SD[s.key] || {})[d] ? n0(SD[s.key][d]) : '<span class="sub">0</span>'}</td>`).join('')}<td class="r"><b>${n0(S.reduce((a, s) => a + ((SD[s.key] || {})[d] || 0), 0))}</b></td></tr>`);
    // 미출하·지연 예상 주문(도금): 납기 경과 미출하 + 7일 안 납기 위험
    const to = CT.addD(asOf, 7);
    const L = G.filter((o) => !o.closed && o.due && ((o.due <= asOf && o.unshipT > 0.5) || (o.due <= to && o.risk === '위험'))).sort((a, b) => String(a.due).localeCompare(String(b.due)) || b.unshipT - a.unshipT);
    X.shipL = L;
    const orow = (o) => `<tr class="ck" data-o="${L.indexOf(o)}"><td class="id">${esc(o.id)}<small>${esc(o.item)}</small></td><td>${esc(o.cus || '-')}</td><td><b class="${o.due < asOf ? 'neg' : ''}">${md(o.due)}</b></td><td>${CT.fulBadge(o.ful)}</td><td class="r"><b>${n1(o.unshipT)}</b></td><td>${CT.badge(o)}</td></tr>`;
    const byG = [...new Set(L.map((o) => o.grp))].map((g) => [g, L.filter((o) => o.grp === g)]).sort((a, b) => b[1].length - a[1].length);
    const og = byG.map(([g, R], i) => `<details class="pp-g"${i ? "" : " open"}><summary><b>${esc(g)}</b><span>${R.length}건</span><span>미출하 ${n0(R.reduce((a, o) => a + o.unshipT, 0))}t</span>${R.filter((o) => o.ful === '출하 확인 불가').length ? `<span class="sub">확인 불가 ${R.filter((o) => o.ful === '출하 확인 불가').length}건</span>` : ''}</summary>`
      + t([th('주문'), th('고객사'), th('납기'), th('진행 단계'), th('미출하(t)', 1), th('상태')], R.slice(0, 30).map(orow)) + (R.length > 30 ? `<p class="ct-note">납기 빠른 30건 · 외 ${R.length - 30}건</p>` : '') + '</details>').join('');
    return CT.basis([{ name: '판생속보', at: P.sr && P.sr.asOf, kind: '확정계획' }, { name: 'MES 출하', at: P.shipDay && P.shipDay.asOf, kind: '실적' }, { name: '주문 진도', at: asOf, kind: '실적' }])
      + card('출하 실적 <small>판매그룹 · 월 누계</small><span class="unit">톤</span>', CT.kpis(k) + tbl)
      + `<div class="pp-2">${card(`미출하·지연 예상 주문 <small>도금 ${L.length}건 · 납기 경과 미출하 + 7일 안 지연 예상 · 컬러 포함(출고 실적 코일 연결) 없음</small><span class="unit">톤</span>`, L.length ? og : '<p class="ct-note">없음</p>')}`
      + `${card(`일별 출하 <small>${+mon.slice(5)}월 · 일별 계획 자료 없음</small><span class="unit">톤</span>`, ds.length ? t([th('일자'), ...S.map((s) => th(esc(s.key), 1)), th('계', 1)], dr) : '<p class="ct-note">자료 없음</p>')}</div>`;
  }

  /* #stock 제품 재고 */
  function stock(X) {
    const { P, mon, asOfG } = X;
    const S = shipRows(X), GR = (P.groups || []).filter((g) => CT.inScope(g.pl));
    const dim = new Date(+mon.slice(0, 4), +mon.slice(5), 0).getDate(), el = +String(asOfG).slice(8, 10) / dim;
    // 판매그룹별 근거: 출하 일정 미달 · 생산 진도 초과(월 계획 × 경과율 대비)
    const why = (key) => {
      const out = [], s = S.find((x) => x.key === key), g = GR.find((x) => x.key === key);
      if (s && s.sched && s.a < s.sched) out.push(`출하 일정 미달 ${n0(s.sched - s.a)}t`);
      if (g && g.prod && g.prod.month && g.prod.actual > g.prod.month * el * 1.1) out.push(`생산 진도 초과 ${n0(g.prod.actual - g.prod.month * el)}t`);
      return out;
    };
    const st = (P.stockTrend || []), last = st.reduce((a, x) => (x[0] > a ? x[0] : a), ''), first = st.filter((x) => x[0].slice(0, 7) < mon).reduce((a, x) => (x[0] > a ? x[0] : a), '');
    const val = (d, k) => { const r = st.find((x) => x[0] === d && x[1] === k); return r ? r[2] : null; };
    const SR = P.stockRoll || {}, ei = SR.d0 ? CT.diff(`${mon}-${String(dim).padStart(2, '0')}`, SR.d0) : null;
    const cats = ((P.sr && P.sr.stock) || []).filter((s) => !/소재/.test(s.name) && CT.inScope(/^도금/.test(s.name) ? 'G' : 'C'));
    const keys = (s) => /^도금/.test(s.name) ? (/자가재/.test(s.name) ? [] : ['G수출', 'G국내', 'G자동차']) : ['C수출', 'C건재'];
    const crow = (s) => { const r = s.target ? s.current / s.target : null, over = r != null && r > 1;
      const hs = over ? keys(s).flatMap((k) => why(k).map((w) => `${k} ${w}`)) : [];
      return `<tr><td class="id">${esc(s.name)}</td><td class="r"><b>${n0(s.current)}</b></td><td class="r">${s.target ? n0(s.target) : '<span class="sub">목표 없음</span>'}</td>`
        + `<td class="r">${r == null ? '-' : `<b class="${over ? 'wrn' : 'pos'}">${Math.round(r * 100)}%</b>`}</td><td class="r">${s.target ? sgn(s.current - s.target) : '-'}</td>`
        + `<td class="w">${over ? `<span class="pp-tag">목표 초과</span>${hs.length ? hs.map((h) => `<span class="pp-c">${esc(h)}</span>`).join('') : '<span class="sub">근거 자료 없음</span>'}` : r == null ? '<span class="sub">-</span>' : '<span class="sub">목표 이내</span>'}</td></tr>`; };
    const keysIn = [...new Set(st.filter((x) => x[1].startsWith('g:')).map((x) => x[1].slice(2)))].filter((k) => CT.inScope(k[0]));
    const grow = (k) => { const cur = val(last, 'g:' + k), b = first ? val(first, 'g:' + k) : null, e = SR.days && SR.days[k] && ei != null ? SR.days[k][ei] : null, w = why(k), name = (GR.find((g) => g.key === k) || {}).name || k;
      return `<tr><td class="id">${esc(name)}</td><td class="r"><b>${n0(cur)}</b></td><td class="r">${b == null ? '-' : `<span class="${cur - b > 0 ? 'wrn' : ''}">${sgn(cur - b)}</span>`}</td><td class="r">${e == null ? '-' : n0(e)}</td>`
        + `<td class="w">${w.length ? w.map((x) => `<span class="pp-c">${esc(x)}</span>`).join('') : '<span class="sub">-</span>'}</td></tr>`; };
    return CT.basis([{ name: '판생속보 재고', at: P.sr && P.sr.asOf, kind: '실적' }, { name: '그룹 재고', at: last, kind: '실적' }, { name: '재고 전망', at: SR.asOf, kind: '재계획' }])
      + card(`제품 재고 <small>실재고 vs 월말 목표 · 소재 재고는 <a href="matcal.html">소재 수급</a></small><span class="unit">톤</span>`,
        t([th('제품'), th('실재고', 1), th('목표', 1, '판생 월말 목표'), th('목표 대비', 1), th('차이', 1), th('초과 근거(같은 판매그룹)')], cats.map(crow)))
      + card(`판매그룹별 제품 재고 <small>판매그룹 목표 없음 · ${md(last)} 기준</small><span class="unit">톤</span>`,
        t([th('판매그룹'), th('실재고', 1), th(`${first ? md(first) : '월초'} 대비`, 1), th('월말 전망', 1, '최신 재계획 재고 전망'), th('관련 근거')], keysIn.map(grow)));
  }

  function bind(m, X) {
    m.querySelectorAll('tr[data-l]').forEach((r) => r.onclick = () => linePanel(X, r.dataset.l));
    m.querySelectorAll('tr[data-o]').forEach((r) => r.onclick = () => { const o = X.shipL[+r.dataset.o]; CT.panel(CT.orderDetail(o), o.id); });
  }
})();
