/* 주문·납기(11/4 2차 진단 2·5·11장): 도금 + 컬러 → 한 주문 모델(ui/ct.js CT.orders)
   하위 화면 = 주소 #뒤: #track 주문진도(기본 · 옛 #status·#risk 도 여기로) · #cal 납기 캘린더 — 납기 위험은 risk.html
   출하 확인 불가(출하 실적 연결 없음)는 완료로 보지 않음 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['track', 'cal'];
  let D0 = null, M = null, L = [], byId = {};
  const plName = (o) => `${o.pl === 'G' ? '도금' : '컬러'} ${o.line || ''}`.trim();
  const sum = (A, f) => A.reduce((s, o) => s + (f(o) || 0), 0);
  const dow = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (s) => dow[new Date(s + 'T00:00:00Z').getUTCDay()];
  const open = (o) => CT.panel(CT.orderDetail(o), o.id);

  /* 출하 근거 한 줄 — 출하가 나오는 곳마다 */
  function shipNote() {
    const part = (L, nm) => { const d_ = L.filter((o) => CT.inScope(o.pl) && !['생산 전', '생산 중'].includes(o.ful)); return d_.length ? `${nm} 생산 끝난 ${n0(d_.length)}건 중 출하 연결 ${n0(d_.filter((o) => (o.fwdT || 0) > 0.5).length)}건` : ''; };
    return `${[part(M.G, '도금'), part(M.C, '컬러')].filter(Boolean).join(' · ')} — MES 출고 실적(7/1~)을 코일번호로 주문에 연결`;
  }

  /* 주문진도 요약(11/5 사용자 'SSCHC1010 작업지시대상선정 요약 — 우리로 치면 주문진도'): 라인별 · 전체
     원본 전체 = 잔여 있음 + 1,000kg 이하(제외) + 잔여 없음(제외). 매치있음 = 매치량>0(이미 생산에 쓴 소재 제외), 아래 작업 상태 4줄은 안 끝난 작업지시(PF_CC_WORK_ORD) 기준.
     작업가능일 = 매치된 소재로 만들 수 있는 양(주문별 min(잔여, 매치)) ÷ 라인 하루 능력 */
  const CAPC = { '1CCL': 480, '2CCL': 400, '3CCL': 200, '4CCL': 250 }, CAPG = { '1CGL': 719, '2CGL': 927 };
  let PS = { line: '', open: '', sk: '', dir: 1, mon: '' };
  /* 11/12 사용자 '주문진도도 월마다 나눠, 11월 이전은 11월로' — 납기 달 묶음: 이번 달(지난 납기·납기 없음 포함) · 다음 달 · 그다음 달 · 그 뒤 · 전체 */
  const addM_ = (ym, k) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const monNow = () => String((M && M.asOf) || CT.today && CT.today() || '').slice(0, 7);
  const monOf = (due) => { const c = monNow(), m = String(due || '').slice(0, 7); return !m || m <= c ? c : m >= addM_(c, 3) ? 'later' : m; };
  const inMon = (due) => !PS.mon || PS.mon === 'all' || monOf(due) === PS.mon;
  /* 주문진도 단계(11/5 사용자): 주문 총량 → 소재 매치 전 → 소재 매치 후(→ 컬러는 부원료 발주라 부자재 대기 같이) → 작업 대기 → 작업지시량.
     '도금도 컬러랑 동일하게 단어 매칭' — 도금의 소재 매치 = 소재(F/H) 입고 완료, 작업지시량 = 현장 작업지시 목록에 오른 주문. 주문마다 한 칸, 합 = 총량 */
  const K0 = '소재 매치 전', KP = '소재 매치 후';
  const MSUB = [['재고 있음', '규격 맞는 소재 재고 있음 — 매치만 하면 됨'], ['발주 진행', '소재 발주됨 — 입고 대기'], ['발주 없음', '재고·발주 모두 없음 — 소재 발주 필요']];
  const msub = (r) => (r.st === '소재 있음' ? '재고 있음' : r.po || r.st === '입고 대기' ? '발주 진행' : '발주 없음');
  const GSUB = [['포스코 진행', 'F/H 발주·포스코 진행 중 — 필요 입고일 안'], ['입고 지연', '필요 입고일보다 늦음'], ['미발주', '소재 발주 전 — 발주 필요']];
  const gsub = (o) => (o.matSt === '지연' ? '입고 지연' : o.matSt === '미발주' && CT.posco(o.src || {}).pre === '미발주' ? '미발주' : '포스코 진행');   // F/H 발주 기록은 없어도 포스코 주문이 진행 중이면 포스코 진행(아래 포스코 진행 단계 표 '미발주'와 같게)
  const ccAsOf = () => (((D0 || {}).cc_order_progress || {}).asOf || '');
  const paintWait = (r) => r.wst === '부자재입고대기' || (/도료/.test(r.canBy || '') && r.can && r.can > ccAsOf());
  /* 11/5 컬러 담당 피드백: 매치 후 = 부자재 대기 + 작업 대기, 작업지시량 = SSCHC1030 확정 지시(DUMMY 제외)는 따로. 부자재 일정 없는 건 = 부자재 대기 */
  const catC = (r) => {
    if (r.s1030 !== undefined || r.smat !== undefined) {     // 11/9 컬러 담당 기준: 1030 확정 지시 → 작업지시량, 1020 부자재 상태(입고대기·불량·공란) → 부자재 대기·불량·작업 대기
      if (r.s1030) return '작업지시량';
      return (r.mchT > 0.0005) ? (r.smat || '작업 대기') : K0; }
    const cf = (+r.cfmT || 0) > 0.05;   // (예전 자료) 1030 확정 지시가 있으면 작업지시량
    if (cf) return '작업지시량';
    if (!(r.mchT > 0.0005)) return K0;
    if (r.subWait != null) return r.subWait ? '부자재 대기' : '작업 대기';   // 11/9 사용자: 1020 = 매치, PF·도료 입고예정 날짜·시간이 지났으면 작업 대기
    if (r.in1020 === false) return K0;                       // 매치 소재는 있지만 1020 지시가 없음(끝난 지시의 잔량) — 새 지시 필요
    if (paintWait(r)) return '부자재 대기';
    return r.can ? '작업 대기' : '부자재 대기'; };
  const catG = (o) => ((o.src && o.src.woWait) ? '작업지시량' : o.matSt !== '확보' ? K0 : '작업 대기');   // 현장 작업지시에 올랐으면 소재는 있는 것
  const CFG = {
    C: { cat: catC, sub: MSUB, subOf: msub, tiles: ['부자재 대기', '불량', '작업 대기'], leaves: [[K0, '#d03b3b', '매치된 소재 없음 — 아래는 소재 상태'], ['부자재 대기', '#eda100', '작업지시 편성 — 부자재 입고 대기'],
      ['불량', '#9b2c6a', '작업지시 편성 — 부자재 불량'], ['작업 대기', '#2a78d6', '작업지시 편성 — 부자재 준비됨(확정 전)'], ['작업지시량', '#008300', '확정 지시 — DUMMY 고객사 제외 · 지시중량 기준']] },
    G: { cat: catG, sub: GSUB, subOf: gsub, tiles: [],   /* 11/13 점검: 도금은 매치 후 = 작업 대기 하나뿐 — 같은 숫자 타일 두 번 뺌 */ leaves: [[K0, '#d03b3b', '소재(F/H) 입고 전 — 아래는 소재 상태'], ['작업 대기', '#2a78d6', '소재 입고 끝 — 현장 작업지시 전'], ['작업지시량', '#008300', '현장 작업지시 목록에 오름 — 바로 생산']] },
  };
  const MATCHED = ['부자재 대기', '불량', '작업 대기'], KW = '작업지시량';
  // MES 화면번호는 화면 글자에 쓰지 않고 말풍선(title)에만
  const CODE = { C: { '': 'MES SSCHC1010 작업지시대상선정', '부자재 대기': 'MES SSCHC1020 작업지시 편성 및 확정 — 부자재 상태 입고대기', '불량': 'MES SSCHC1020 — 부자재 상태 불량', '작업 대기': 'MES SSCHC1020 — 부자재 상태 공란', '작업지시량': 'MES SSCHC1030 생산우선순위 확정 지시 — 작업시간 = 지시중량 ÷ 계약 라인 스피드' }, G: {} };
  // 작업시간(h, 24시간 기준): 컬러 = 계약별 실적 t/h(cc_order_progress tph), 작업지시량은 확정 지시 남은 양 기준 · 도금 = 라인 하루 능력 ÷ 24
  const hrsOf = (r, k) => (r.pl === 'G' || r.src ? ((r.remT || 0) / ((r.src && r.src.tph) || (CAPG[r.line] || 800) / 24)) : k === KW ? (r.s1030 ? r.s1030.h : r.cfmHrs != null ? r.cfmHrs : r.hrs) || 0 : MATCHED.includes(k) && r.subT != null && r.tph ? r.subT / r.tph : (r.hrs || 0));
  const tonOf = (r, k) => (!r.src && r.pl !== 'G' && k === KW ? (r.s1030 ? +r.s1030.t : (+r.cfmT || 0)) : !r.src && r.pl !== 'G' && MATCHED.includes(k) && r.subT != null ? +r.subT : (+r.remT || 0));   // 11/10: 1020 단계 = 1020 지시 잔량(1020 화면 지시중량과 같음)   // 11/9: 작업지시량 = 1030 지시중량, 그 밖 = 1010 주문잔여량
  const byLine = (rs, k) => { const o = {}; rs.forEach((r) => { o[r.line] = (o[r.line] || 0) + hrsOf(r, k); }); return o; };
  const dayTxt = (rs, k) => { const h = byLine(rs, k), ls = Object.keys(h).sort(); if (!ls.length) return ''; if (ls.length === 1) return `<b>${(h[ls[0]] / 24).toFixed(1)}일</b>`;
    const mx = ls.reduce((a, l) => (h[l] > h[a] ? l : a), ls[0]); return `최대 <b>${(h[mx] / 24).toFixed(1)}일</b>(${mx})`; };
  function psData(sel) {   // sel = 라인 목록 → {pl, rows[{cat,rem,n}], tot, can, cap, ex, tbl}
    const cc = (D0 || {}).cc_order_progress, out = [];
    const cl = sel.filter((l) => CAPC[l]), gl = sel.filter((l) => CAPG[l]);
    if (cc && cl.length) {
      const shut = new Set((M.C || M.all || []).filter((o) => o.pl === 'C' && o.closed).map((o) => o.src));   // 전량 출하·잔량 미생산 마감(MES 종결 전) — 아래 목록과 같게 뺌
      const R0 = (cc.rows || []).filter((r) => cl.includes(r.line)), R = R0.filter((r) => !shut.has(r) && !r.dummy && inMon(r.due)), cap = cl.reduce((a, l) => a + CAPC[l], 0);
      const ex = cl.reduce((a, l) => { const e = (cc.excl || {})[l] || {}; return { zero: a.zero + ((e.zero || [])[0] || 0), small: a.small + ((e.small || [])[0] || 0), zT: a.zT + ((e.zero || [])[1] || 0), sT: a.sT + ((e.small || [])[1] || 0) }; }, { zero: 0, small: 0, zT: 0, sT: 0 });
      const can = R.filter((r) => r.mchT > 0.0005).reduce((a, r) => a + Math.min(+r.remT || 0, +r.mchT || 0), 0);
      const exA = (k) => cl.reduce((a, l) => { const e = (((cc.excl || {})[l] || {})[k]) || []; return a.map((v, i) => v + (+e[i] || 0)); }, [0, 0, 0, 0, 0]);
      out.push({ pl: 'C', nm: '컬러', R, cap, can, ex: Object.assign(ex, { shut: R0.filter((r) => shut.has(r)).length, dummy: R0.filter((r) => r.dummy && !shut.has(r)).length }), cusLoaded: !!cc.cusLoaded, exZ: exA('zero'), exS: exA('small'), cats: CFG.C.leaves.map(([k, c, t]) => { const rs = R.filter((r) => catC(r) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, r) => a + (+r.remT || 0), 0), remX: rs.reduce((a, r) => a + tonOf(r, k), 0), rs }; }) });   // 11/13 점검: 단계 톤 = 주문 잔여량(단계 합 = 주문 충당량) · MES 지시중량(1030 확정·1020 편성)은 remX 로 따로 보임(11/9 근거 값)
    }
    if (gl.length && (D0 || {}).cg_order_progress) {
      // 11/9 도금도 컬러와 같게: 주문잔여량 1,000kg 넘는 것(계약번호 5번째 T·Q 는 포함)
      const tq = (o) => /^[TQ]$/.test(String(o.id || '').charAt(4));
      const G = (M.G || []).filter((o) => gl.includes(o.line) && inMon(o.due)), R = G.filter((o) => !o.closed && ((o.remT || 0) > 1 || (tq(o) && (o.remT || 0) > 0.0005))), capL = Object.fromEntries((((D0 || {}).cg_order_progress || {}).cover || {}).lines?.filter((x) => x.specDay).map((x) => [x.line, x.specDay]) || []), cap = gl.reduce((a, l) => a + (capL[l] || CAPG[l]), 0);   // 11/9: 하루 능력 = 재계획 하루 톤(도금 주문진도와 같은 값) — 고정 927t 였음
      const gSmall = G.filter((o) => !o.closed && (o.remT || 0) > 0.0005 && (o.remT || 0) <= 1 && !tq(o));
      const can = R.filter((o) => catG(o) !== K0).reduce((a, o) => a + o.remT, 0);
      out.push({ pl: 'G', nm: '도금', R, cap, can, ex: { zero: G.length - R.length - gSmall.length, small: gSmall.length, zT: 0, sT: gSmall.reduce((a, o) => a + (o.remT || 0), 0) }, all: G, cats: CFG.G.leaves.map(([k, c, t]) => { const rs = R.filter((o) => catG(o) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, o) => a + (o.remT || 0), 0), rs }; }) });
    }
    return out;
  }
  const segBar = (cats, tall) => { const T_ = cats.reduce((a, c) => a + c.rem, 0) || 1;
    return `<div class="sb${tall ? ' tall' : ''}" role="img" aria-label="${esc(cats.filter((c) => c.rem > 0.5).map((c) => `${c.k} ${n0(c.rem)}t`).join(', '))}">${cats.filter((c) => c.rem > 0.5).map((c) => { const w = c.rem / T_ * 100;
      return `<span style="flex:${c.rem.toFixed(1)} 0 0;background:${c.c}" title="${esc(`${c.k} ${n0(c.rem)}t · ${c.n}건 (${Math.round(w)}%)`)}">${tall && w >= 7 ? `${Math.round(w)}%` : ''}</span>`; }).join('')}</div>`; };
  function psCard(d, title) {
    const tot = d.R.reduce((a, r) => a + (+r.remT || 0), 0), n = d.cats.reduce((a, c) => a + c.n, 0);   // 11/9: 주문 잔여량 = 1010 주문잔여량 합(작업지시량 칸은 지시중량이라 합과 다를 수 있음)
    const tip = (k) => { const t = CODE[d.pl][String(k).replace(/^└ /, '')]; return t ? ` title="${esc(t)}"` : ''; };
    const tile = (k, v, u, sub, tone = '', ex = '') => `<div class="pt ${tone}${ex ? ' ck' : ''}"${ex ? ` data-ex="${esc(ex)}" role="button" tabindex="0" aria-expanded="${PS.open === ex}"` : ''}${tip(k === '주문 충당량' ? '' : k)}><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div><div class="s">${sub}</div></div>`;
    const cat = (k) => d.cats.find((c) => c.k === k) || { n: 0, rem: 0, rs: [] }, F = CFG[d.pl], sumT = (rs) => rs.reduce((a, r) => a + (+r.remT || 0), 0);
    const hSum = (rs, k) => rs.reduce((a, r) => a + hrsOf(r, k), 0), xk = (k) => `${d.pl}|${k}`;
    const m0 = cat(K0), mt = d.cats.filter((c) => MATCHED.includes(c.k)), mtR = mt.flatMap((c) => c.rs), mtT = mt.reduce((a, c) => a + c.rem, 0), mtN = mtR.length, w = cat(KW);
    const subT = (k) => sumT(m0.rs.filter((r) => F.subOf(r) === k));
    const m0s = d.pl === 'C' ? (subT('발주 없음') > 0.5 ? ` · <span class="bad">발주 없음 ${n0(subT('발주 없음'))}t</span>` : '') : [['입고 지연', subT('입고 지연')], ['미발주', subT('미발주')]].filter((x) => x[1] > 0.5).map(([k, v]) => ` · <span class="bad">${k} ${n0(v)}t</span>`).join('');
    const hd = (rs, k) => `${n0(hSum(rs, k))}h · ${dayTxt(rs, k)}`;
    const wT = d.pl === 'C' ? w.rem : w.rem, wN = d.pl === 'C' ? w.rs.reduce((a, r) => a + (r.s1030 ? r.s1030.n : (+r.cfmN || 0)), 0) : w.n;
    const gTxt = (rs) => { const o = {}; rs.forEach((r) => { const g = String(r.grp || '-').replace(/그룹$|판매그룹$/, ''); o[g] = (o[g] || 0) + (+r.remT || 0); }); const e = Object.entries(o).filter((x) => x[1] >= 0.5).sort((a, b) => b[1] - a[1]); return e.length ? `<div class="gq">${e.map(([g, v]) => `<span class="nw">${esc(g)} ${n0(v)}</span>`).join(' · ')}</div>` : ''; };
    const tiles = `<div class="pts p${4 + F.tiles.length}">${tile('주문 충당량', n0(tot), 't', `<span title="주문량 − 생산량(MES 주문잔여량) · 1,000kg 넘는 것(계약번호 5번째 T·Q 포함)">${n0(n)}건</span>${gTxt(d.R, '')}`)}`
      + tile(K0, n0(m0.rem), 't', `${n0(m0.n)}건${m0s}${gTxt(m0.rs, K0)}`, m0.rem > 0.5 ? 'bad' : '', xk(K0))
      + tile(KP, n0(mtT), 't', `${n0(mtN)}건 · ${hd(mtR, KP)}${gTxt(mtR, KP)}`, '', xk(KP))
      + F.tiles.map((k) => { const c = cat(k); return tile(`└ ${k}`, n0(c.rem), 't', `${n0(c.n)}건 · ${hd(c.rs, k)}${c.remX != null && Math.abs(c.remX - c.rem) >= 0.5 ? ` · <span class="nw" title="MES 작업지시 편성 화면 지시 잔량">편성 지시 ${n0(c.remX)}t</span>` : ''}${gTxt(c.rs, k)}`, (k === '부자재 대기' || k === '불량') && c.rem > 0.5 ? 'warn' : '', xk(k)); }).join('')
      + tile(KW, n0(wT), 't', `지시 ${n0(wN)}건${d.pl === 'C' ? ` · 계약 ${n0(w.n)}건` : ''} · ${hd(w.rs, KW)}${d.pl === 'C' && w.remX != null ? ` · <span class="nw" title="MES 생산우선순위 확정 지시중량">지시중량 ${n0(w.remX)}t</span>` : ''}${gTxt(w.rs, KW)}`, 'ok', xk(KW)) + '</div>';
    const pct = (v) => `${tot ? Math.round(v / tot * 100) : 0}%`;
    const row = (ex, cls, sw, nm, cnt, t, h, dy, txt) => `<tr class="${cls}${ex ? ' ck' : ''}"${ex ? ` data-ex="${esc(ex)}" aria-expanded="${PS.open === ex}"${tip(ex.slice(2))}` : ''}><td class="nw">${sw ? `<i class="sw" style="background:${sw}"></i>` : ''}${nm}${ex ? `<span class="tg">${PS.open === ex ? '▾' : '▸'}</span>` : ''}</td><td class="r">${n0(cnt)}</td><td class="r"><b>${n0(t)}</b></td><td class="r">${pct(t)}</td><td class="r">${h == null ? '<span class="mu">–</span>' : n0(h)}</td><td class="r">${dy || '<span class="mu">–</span>'}</td><td class="mu2">${txt}</td></tr>`;
    let body = row(xk(K0), '', F.leaves[0][1], esc(K0), m0.n, m0.rem, null, '', esc(F.leaves[0][2]))
      + F.sub.map(([k, t]) => { const rs = m0.rs.filter((r) => F.subOf(r) === k), v = sumT(rs); return `<tr class="sub2${rs.length ? '' : ' mu'}"><td class="nw">└ ${esc(k)}</td><td class="r">${n0(rs.length)}</td><td class="r">${n0(v)}</td><td class="r">${pct(v)}</td><td class="r"></td><td class="r"></td><td class="mu2">${esc(t)}</td></tr>`; }).join('')
      + row(xk(KP), 'grp', '', `<b>${KP}</b>`, mtN, mtT, hSum(mtR, KP), dayTxt(mtR, KP), d.pl === 'C' ? '매치 끝 — 부원료 발주·입고 → 작업지시' : '소재 입고 끝 — 작업지시 전')
      + mt.map((c) => row(xk(c.k), `ind${c.n ? '' : ' mu'}`, c.c, esc(c.k), c.n, c.rem, hSum(c.rs, c.k), dayTxt(c.rs, c.k), esc(c.t))).join('')
      + row(xk(KW), w.n ? '' : 'mu', F.leaves[F.leaves.length - 1][1], esc(KW), w.n, w.rem, hSum(w.rs, KW), dayTxt(w.rs, KW), esc(F.leaves[F.leaves.length - 1][2]) + (d.pl === 'C' ? ` · 지시 ${n0(wN)}건` : ''));
    const leg = `<table class="ct-t pl-t"><thead><tr><th>상태 <small>누르면 주문 목록</small></th><th class="r">건수</th><th class="r" title="주문량 − 생산량">미생산(t)</th><th class="r">비중</th><th class="r">작업시간(h)</th><th class="r">작업가능일</th><th>의미</th></tr></thead><tbody>${body}`
      + `<tr class="tot"><td>합계</td><td class="r">${n0(n)}</td><td class="r"><b>${n0(tot)}</b></td><td class="r">100%</td><td></td><td></td><td class="mu2">제외: ${d.pl === 'C' ? `1,000kg 이하 ${n0(d.ex.small)}건(T·Q 제외) · 미생산 없음 ${n0(d.ex.zero)}건${d.ex.shut ? ` · 전량 출하·잔량 마감 ${n0(d.ex.shut)}건` : ''}${d.ex.dummy ? ` · DUMMY ${n0(d.ex.dummy)}건` : ''}` : `1,000kg 이하 ${n0(d.ex.small)}건(T·Q 제외) · 미생산 없음·생산 완료 ${n0(d.ex.zero)}건`}</td></tr></tbody></table>`;
    // 라인별 작업가능일(24시간 기준) — 라인 하나만 골라도 표시
    const ls = [...new Set(d.R.map((r) => r.line))].sort();
    const lday = !ls.length ? '' : (() => {   // 11/11 회의: 라인 하나를 골라도 그 라인 작업가능일을 보여 줌
 const ks = [[KP, mtR], ...mt.map((c) => [c.k, c.rs]), [KW, w.rs]];
      return `<h4 class="ps-h">라인별 작업가능일 <small>작업시간 ÷ 24시간 · ${d.pl === 'C' ? '계약별 실적 t/h' : '계약별 실적 t/h(라인·강종·부서)'}</small></h4><div class="ct-wrap"><table class="ct-t pos-t"><thead><tr><th></th>${ls.map((l) => `<th class="r">${l}</th>`).join('')}</tr></thead><tbody>`
        + ks.map(([k, rs]) => { const h = byLine(rs, k); return `<tr><td class="nw">${MATCHED.includes(k) ? '└ ' : ''}${esc(k)}</td>${ls.map((l) => `<td class="r">${h[l] ? `<b>${(h[l] / 24).toFixed(1)}</b>일 <small class="mu2">${n0(h[l])}h</small>` : '<span class="mu">–</span>'}</td>`).join('')}</tr>`; }).join('') + '</tbody></table></div>'; })();
    // 도금: 소재 매치 전(소재 입고 전) 물량의 포스코 진행 단계(11/5 사용자)
    const pos = d.pl !== 'G' ? '' : (() => {
      const rs = cat(K0).rs, cols = [['미발주'], ['포스코 접수 전'], ['포스코 착수 전'], ...CT.PH.slice(0, 5).map(([nm]) => [nm]), ['포스코 생산 끝 · 입고 전']], v = Object.fromEntries(cols.map(([k]) => [k, { t: 0, n: 0 }]));
      for (const o of rs) { const P = CT.posco(o.src || {});
        if (P.pre && v[P.pre]) { v[P.pre].t += o.remT || 0; v[P.pre].n++; continue; }
        CT.PH.slice(0, 5).forEach(([nm], i) => { if (P.pt[i] >= 0.05) { v[nm].t += P.pt[i]; v[nm].n++; } }); }
      const sh = cols.filter(([k]) => v[k].n);
      return sh.length ? `<h4 class="ps-h">포스코 진행 단계 <small>소재 매치 전 ${n0(rs.length)}건 · 공정별 F/H 톤(한 주문이 여러 공정에 나뉘어 있을 수 있음)</small></h4><div class="ct-wrap"><table class="ct-t pos-t"><thead><tr>${sh.map(([k]) => `<th class="r">${esc(k)}</th>`).join('')}</tr></thead>`
        + `<tbody><tr>${sh.map(([k]) => `<td class="r"><b>${n0(v[k].t)}</b>t</td>`).join('')}</tr><tr class="mu2">${sh.map(([k]) => `<td class="r">${n0(v[k].n)}건</td>`).join('')}</tr></tbody></table></div>` : '';
    })();
    // 펼친 목록(11/5 컬러 담당 '각 항목 선택하면 데이터 펼쳐서 · 항목별 그룹별도'): 판매그룹 → 계약
    const exp = (() => { if (!PS.open || PS.open.split('|')[0] !== d.pl) return ''; const k = PS.open.slice(2); const sumT = (rs) => rs.reduce((a, r) => a + (+r.remT || 0), 0);   // 카드·표와 같은 주문 잔여량
      const rs = (k === KP ? mtR : cat(k).rs).slice(), cmpG = (a, b) => String(a.grp).localeCompare(String(b.grp)) || String(a.due || '').localeCompare(String(b.due || ''));
      const XS = { rem: (r) => +r.remT || 0, tph: (r) => (d.pl === 'C' ? +r.tph : r.src && +r.src.tph) || 0, hrs: (r) => hrsOf(r, d.pl === 'C' ? catC(r) : k), due: (r) => r.due || '9999' }, xf = XS[PS.sk];   // 머리글 눌러 정렬(묶음 안에서)
      rs.sort(xf ? (a, b) => String(a.grp).localeCompare(String(b.grp)) || PS.dir * (xf(a) < xf(b) ? -1 : xf(a) > xf(b) ? 1 : 0) : k === KW && d.pl === 'C' ? (a, b) => String(a.grp).localeCompare(String(b.grp)) || (a.cfmSeq ?? 1e9) - (b.cfmSeq ?? 1e9) : cmpG);
      const XK = { '미생산(t)': 'rem', 't/h': 'tph', '작업시간(h)': 'hrs', '납기': 'due' };
      const grps = [...new Set(rs.map((r) => r.grp))];
      const C = d.pl === 'C', head = C ? ['계약번호', '라인', '품명', '두께×폭', '미생산(t)', ...(k === KW ? ['지시 건수', '지시중량(t)'] : MATCHED.includes(k) || k === KP ? ['편성 지시(t)'] : []), 't/h', '작업시간(h)', '납기', k === K0 ? '소재' : k === KW ? '' : '부자재 상태'] : ['주문번호', '라인', '품목', '미생산(t)', 't/h', '작업시간(h)', '납기', '소재'];
      const line = (r) => C ? `<tr><td class="id">${esc(r.con)}</td><td>${esc(r.line)}</td><td>${esc(r.pdt || r.spec || '')}</td><td class="nw">${r.thk ? `${r.thk}×${r.wdt}` : ''}</td><td class="r">${n1(r.remT)}</td>${k === KW ? `<td class="r">${r.s1030 ? r.s1030.n : (r.cfmN || '')}</td><td class="r">${n1(r.s1030 ? r.s1030.t : (r.cfmT || 0))}</td>` : MATCHED.includes(k) || k === KP ? `<td class="r">${r.subT != null ? n1(r.subT) : '–'}</td>` : ''}<td class="r">${r.tph ? n1(r.tph) : '–'}</td><td class="r">${n1(hrsOf(r, catC(r)))}</td><td>${md(r.due) || '-'}</td><td class="nw">${k === K0 ? esc(msub(r)) : k === KW ? '' : esc({ '부자재 대기': '입고대기', '불량': '불량', '작업 대기': '공란' }[catC(r)] || '')}</td></tr>`
        : `<tr><td class="id">${esc(r.id)}</td><td>${esc(r.line || '')}</td><td>${esc(r.item || '')}</td><td class="r">${n1(r.remT)}</td><td class="r">${r.src && r.src.tph ? n1(r.src.tph) : '–'}</td><td class="r">${n1(hrsOf(r, k))}</td><td>${md(r.due) || '-'}</td><td>${esc(gsub(r) && r.matSt === '확보' ? '입고 완료' : gsub(r))}</td></tr>`;
      const cut = 400;
      return `<div class="ps-exp"><div class="ps-exh"><b>${esc(k)}</b> ${n0(rs.length)}건 · ${n0(sumT(rs))}t · ${n0(hSum(rs, k))}h <button type="button" class="ps-x" data-ex="${esc(PS.open)}">닫기</button></div>`
        + `<div class="ps-gs">${grps.map((g) => { const G = rs.filter((r) => r.grp === g); return `<span><b>${esc(g)}</b> ${n0(G.length)}건 · ${n0(sumT(G))}t · ${n0(hSum(G, k))}h</span>`; }).join('')}</div>`
        + `<div class="ct-wrap ps-et"><table class="ct-t"><thead><tr>${head.map((h, i) => `<th${/\(|t\/h/.test(h) ? ' class="r"' : ''}${XK[h] ? ` data-xs="${XK[h]}" aria-sort="${PS.sk === XK[h] ? (PS.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${XK[h] ? `<button type="button">${h}<i>${PS.sk === XK[h] ? (PS.dir > 0 ? '▲' : '▼') : ''}</i></button>` : h}</th>`).join('')}</tr></thead><tbody>`
        + grps.map((g) => { const G = rs.filter((r) => r.grp === g); return `<tr class="gh"><td colspan="${head.length}"><b>${esc(g)}</b> ${n0(G.length)}건 · ${n0(sumT(G))}t · ${n0(hSum(G, k))}h</td></tr>` + G.slice(0, cut).map(line).join(''); }).join('')
        + `</tbody></table></div></div>`; })();
    // 상세 표(SSCHC1010 양식): 건수·주문량·생산량·잔여량·매치량·작업가능일(작업시간 ÷ 24h ÷ 라인 수)
    const ag = (rs) => [rs.length, ...['ordT', 'prodT', 'remT', 'mchT'].map((k) => rs.reduce((a, r) => a + (+r[k] || 0), 0))];
    const nL = Math.max(1, ls.length || 1), dy = (rs, k) => (rs.length ? hSum(rs, k) / 24 / nL : null);
    const tr = (lv, nm, v, y, cls = '') => `<tr class="lv${lv} ${cls}"><td class="nm">${nm}</td>${v.map((x, i) => `<td class="r">${x == null || (i === 4 && d.pl === 'G') ? '<span class="mu">–</span>' : n0(x)}</td>`).join('')}<td class="r">${y == null ? '<span class="mu">–</span>' : `<b>${y.toFixed(1)}</b>`}</td></tr>`;
    const add = (x, y) => x.map((v, i) => v + (y[i] || 0));
    let tb = d.pl === 'C' ? tr(0, '원본 전체', add(add(ag(d.R), d.exS), d.exZ), null, 'b') : tr(0, '원본 전체', ag(d.all || d.R), null, 'b');
    tb += tr(0, '주문 충당량', ag(d.R), null, 'b') + tr(1, K0, ag(m0.rs), null, 'b') + F.sub.map(([k]) => tr(2, k, ag(m0.rs.filter((r) => F.subOf(r) === k)), null)).join('')
      + tr(1, KP, ag(mtR), dy(mtR, KP), 'b') + mt.map((c) => tr(2, c.k, ag(c.rs), dy(c.rs, c.k))).join('') + tr(1, KW, ag(w.rs), dy(w.rs, KW), 'b')
      + (d.pl === 'C' ? tr(1, '1,000kg 이하(제외, T·Q 제외)', d.exS, null, 'mu') + tr(0, '미생산 없음(제외)', d.exZ, null, 'mu') : tr(0, '미생산 없음·생산 완료(제외)', ag((d.all || []).filter((o) => !d.R.includes(o))), null, 'mu'));
    const det = `<details class="pd"><summary${d.pl === 'C' ? ' title="MES SSCHC1010 양식"' : ''}>상세 표 <small>건수·주문량·생산량·미생산·매치량·작업가능일(라인 평균)</small></summary><div class="ct-wrap"><table class="ct-t pdt"><thead><tr><th>구분</th><th class="r">건수</th><th class="r">주문량(t)</th><th class="r">생산량(t)</th><th class="r">미생산(t)</th><th class="r">매치량(t)</th><th class="r">작업가능일</th></tr></thead><tbody>${tb}</tbody></table></div></details>`;
    const note = d.pl === 'G' ? `<p class="ct-note">작업시간 = 주문 충당량 ÷ 계약별 t/h(라인·강종·부서 실적 속도, 1~10월 보정) · 작업가능일 = 라인별 작업시간 ÷ 24시간.</p>` : d.pl === 'C' ? `<p class="ct-note" title="${esc(((D0 || {}).cc_order_progress || {}).tphNote || '컬러 생산 실적')}">작업시간 = 주문 충당량(작업지시량은 확정 지시중량) ÷ 계약별 t/h · 작업가능일 = 라인별 작업시간 ÷ 24시간.${d.cusLoaded ? '' : ' <b>DUMMY 고객사 제외는 고객사 자료(사내 PC 다음 실행)가 들어오면 적용</b>.'}</p>` : '<p class="ct-note">작업시간 = 미생산 ÷ (라인 하루 능력 1CGL 719 · 2CGL 927t ÷ 24).</p>';
    return `<section class="pc"><div class="pch"><b>${esc(title)}</b><span>${md(((D0 || {})[d.pl === 'C' ? 'cc_order_progress' : 'cg_order_progress'] || {}).asOf)} 기준 · ${d.pl === 'C' ? '<span title="MES SSCHC1010">MES 작업지시대상 주문 충당량</span>' : '생산 남은 주문'} · ${monTxt()}</span></div>${tiles}${segBar(d.cats, true)}<div class="lg2"><div>${leg}</div>${lday ? `<div class="lg2r">${lday}</div>` : ''}</div>${pos ? `<div class="lg2b">${pos}</div>` : ''}${exp}${det}${note}</section>`;
  }
  // 납기 달 탭 이름(카드 제목·부제 같은 말) — 11/13 점검: 도금 부제 '납기 무관'이 탭 필터와 모순이던 것
  const monTxt = () => (PS.mon === 'all' || !PS.mon ? '납기 전체' : PS.mon === 'later' ? `${+addM_(monNow(), 3).slice(5)}월 이후 납기` : PS.mon === monNow() ? `${+PS.mon.slice(5)}월까지 납기(지난 납기 포함)` : `${+PS.mon.slice(5)}월 납기`);
  const allLines = () => (CT.inScope('G') ? ['1CGL', '2CGL'] : []).concat(CT.inScope('C') ? (((D0 || {}).cc_order_progress || {}).lines || []) : []);
  function lineTabs() {
    const lines = allLines(); if (PS.line && !lines.includes(PS.line)) PS.line = '';
    return lines.length ? `<div class="seg ct-seg ps-seg" role="group" aria-label="라인">${[['', '전체']].concat(lines.map((l) => [l, l])).map(([k, n]) => `<button type="button" data-l="${k}" aria-pressed="${PS.line === k}">${n}</button>`).join('')}</div>` : '';
  }
  function progSum(noMini) {   // noMini = 라인별 '미생산' 카드 줄 뺌(편성 화면 맨 위 — 11/12 사용자 '미생산 이것들은 빼고')
    if (!PS.mon) PS.mon = monNow();
    const lines = allLines();
    if (!lines.length) return '';
    let body = '';
    if (!PS.line) {
      const mini = lines.map((l) => { const d = psData([l])[0]; if (!d) return ''; const tot = d.cats.reduce((a, c) => a + c.rem, 0);
        return `<button type="button" class="pm" data-l="${l}"><div class="h"><b>${l}</b><span>${n0(d.cats.reduce((a, c) => a + c.n, 0))}건</span></div><div class="v">${n0(tot)}<small>t 미생산</small></div>${segBar(d.cats, false)}<div class="s">${(() => { const g = (k) => (d.cats.find((c) => c.k === k) || { rem: 0 }).rem; return `<span class="nw">매치 전 <b class="bad">${n0(g(K0))}t</b></span> · <span class="nw">작업지시량 <b>${n0(g('작업지시량'))}t</b></span>`; })()}</div></button>`; }).join('');
      body = (noMini ? '' : `<div class="pms">${mini}</div>`) + (noMini ? psData(lines).reverse() : psData(lines)).map(   /* 편성 맨 위 = 도금 먼저(11/12 사용자) */
        (d) => psCard(d, `${d.nm} 주문진도`)).join('');
    } else body = psData([PS.line]).map((d) => psCard(d, `${PS.line} 주문진도`)).join('');
    const c = monNow(), MB = [[c, `${+c.slice(5)}월 <small>지난 납기 포함</small>`], [addM_(c, 1), `${+addM_(c, 1).slice(5)}월`], [addM_(c, 2), `${+addM_(c, 2).slice(5)}월`], ['later', `${+addM_(c, 3).slice(5)}월~`], ['all', '전체']].filter(([k]) => k !== 'later' || [...(((D0 || {}).cc_order_progress || {}).rows || []), ...((M && M.G) || [])].some((r) => monOf(r.due) === 'later'));   // 그 뒤 납기가 없으면 탭 숨김
    const tabs = `<div class="ps-mon" role="tablist" aria-label="납기 달">${MB.map(([k, t]) => `<button type="button" role="tab" data-mon="${k}" aria-selected="${PS.mon === k}" class="${PS.mon === k ? 'on' : ''}">${t}</button>`).join('')}<span>납기 기준</span></div>`;
    return `<div class="ps">${tabs}${body}</div>`;
  }
  /* 첫 화면 결론(11/11 사용자 '들어가자마자 문제·할 일'): 도금·컬러 각각 지연 예상·납기 경과 톤 → 이번 주 할 일(소재·부자재·편성·이번 주 납기) */
  function concl(A, LN) {
    const inLn = (o) => !LN || o.line === LN, pls = ['G', 'C'].filter((p) => CT.inScope(p) && (!LN || (/CGL/.test(LN) ? 'G' : 'C') === p));
    const keep = PS.mon; PS.mon = 'all'; const PD = Object.fromEntries(psData(LN ? [LN] : allLines()).map((d) => [d.pl, d])); PS.mon = keep;   // 11/13 점검: 할 일도 미결·지연과 같은 범위(납기 전체) — 아래 카드는 납기 달 탭
    const w0 = CT.wed(M.asOf), w1 = CT.addD(w0, 6), CS = calSet().filter(inLn);
    const todo = (lab, X, f, href, who) => { const t = X.reduce((a, r) => a + (+(f ? f(r) : r.remT) || 0), 0); return t >= 0.5 ? `<a class="ot-td" href="${href}"><span class="k">${lab}</span><b>${n0(t)}t</b><span class="n">${n0(X.length)}건</span><span class="w">${who} →</span></a>` : ''; };
    const col = (p) => {
      const X = A.filter((o) => o.pl === p), a = agg(X), lt = a.will + a.past, d = PD[p], c = (k) => (d ? d.cats.find((x) => x.k === k) || { rs: [] } : { rs: [] });
      const m0 = c(K0).rs, un = X.filter(unplan), wk = CS.filter((o) => o.pl === p && o.due >= w0 && o.due <= w1), wr = wk.filter((o) => lateOf(o));
      const T = p === 'G'
        ? [todo('소재 입고 지연', m0.filter((r) => gsub(r) === '입고 지연'), null, 'cg_order.html', '포스코·구매'), todo('소재 미발주', m0.filter((r) => gsub(r) === '미발주'), null, 'cg_order.html', '구매(소재)')]
        : [todo('소재 발주 없음', m0.filter((r) => msub(r) === '발주 없음'), null, 'cc_order.html', '구매(소재)'), todo('부자재 입고 대기', c('부자재 대기').rs, null, 'cc_order.html', '구매(도료)'), todo('부자재 불량', c('불량').rs, null, 'cc_order.html', '컬러 생산')];
      T.push(todo('작업 미편성', un, null, p === 'G' ? 'ct_plan.html#cg' : 'ct_plan.html#cc', '생산기획'));
      const pf = p === 'G' && (D0.cg_order_progress || {}).perf, pg = pf && pf.groups ? Object.entries(pf.groups).filter(([g]) => !/^컬러|^수요/.test(g)).reduce((s_, [, v]) => ({ t: s_.t + (v.known || 0), ok: s_.ok + (v.ok || 0) }), { t: 0, ok: 0 }) : null;
      return `<div class="ot-c"><div class="ot-ch"><em class="ot-pl">${p === 'G' ? '도금' : '컬러'}</em><span>미결 <b>${n0(a.t)}t</b> · ${n0(a.n)}건</span></div>`
        + `<div class="ot-r${lt >= 0.5 ? ' bad' : ''}"><span class="k">지연 예상·납기 경과</span><b>${n0(lt)}<small>t</small></b><span class="s">${pct(lt, a.t)}% · 지연 예상 ${n0(a.will)} · 납기 경과 ${n0(a.past)}</span></div>`
        + `<a class="ot-wk" href="ct_orders.html#cal">이번 주 납기(${md(w0)}~${md(w1)}) <b>${n0(sum(wk, (o) => o.remT))}t</b>${wr.length ? ` · <b class="ot-bad">위험 ${n0(sum(wr, (o) => o.remT))}t</b>` : ' · 위험 없음'} →</a>`
        + (pg && pg.t ? `<p class="ot-pf" title="최근 2주(${md(pf.from)}~) 도금 생산 중 필요 생산일(수출 출항 −1 · 내수 납기 −1) 안에 끝난 톤 비율">최근 2주 생산 ${n0(pg.t)}t · 필요일 안 완료 <b>${pct(pg.ok, pg.t)}%</b></p>` : '')
        + `<p class="ot-tdh">할 일</p><div class="ot-tds">${T.filter(Boolean).join('') || '<span class="ot-z">조치 필요 없음</span>'}</div></div>`;
    };
    return `<h2>지금 문제 · 할 일${LN ? ` · ${LN}` : ''} <small>납기 전체</small></h2><div class="ot-cs">${pls.map(col).join('')}</div>`;
  }
  /* ---------- #track 주문진도(11/10 사용자 '항상 전체 먼저 → 그룹별로 뭐가 문제인지, 계약 나열은 상세가 아니다') ----------
     전체(도금·컬러 각각 단계 흐름) → 판매그룹(단계 막대·한 문장) → 줄을 누르면 단계 × 강종(품명)·납기월 → (접힘) 계약.
     단계 = 주문 추적(o.steps)에서 아직 안 끝난 첫 단계 · 톤 = 잔량(생산 끝난 주문은 미출하) — 새로 판정하지 않음 */
  const SG = [['mat', '소재 확보'], ['plan', '작업 편성'], ['prod', '생산'], ['ship', '출하']], SGN = Object.fromEntries(SG), FLOW = ['mat', 'plan', 'prod'];
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  const pdone = (o) => o.ful !== '생산 전' && o.ful !== '생산 중';
  const stg = (o) => { if (pdone(o)) return 'ship';
    const s = o.steps.find((x, i) => i > 0 && !/출하/.test(x.k) && x.st !== 'done' && x.st !== 'na');
    return !s ? 'prod' : /소재|자가재/.test(s.k) ? 'mat' : /편성/.test(s.k) ? 'plan' : 'prod'; };
  const tonT = (o) => (pdone(o) ? o.unshipT || 0 : o.remT || 0);
  /* 지연 판정은 납기 위험 화면과 같은 자료(risk.enc.json)로 — 두 화면 숫자가 달라지지 않게. 자료 없으면 주문 모델 판정 */
  let RS = null;
  const lateOf = (o) => { if (RS) { const s = RS[o.pl + '|' + o.id]; return pdone(o) ? '' : s === 'past' || s === 'will' ? s : ''; }
    return o.due && o.due < M.asOf ? 'past' : !pdone(o) && o.risk === '위험' ? 'will' : ''; };
  const unplan = (o) => stg(o) === 'plan' && (o.steps.find((x) => /편성/.test(x.k)) || {}).st === 'todo';
  const LN = { past: '납기 경과', will: '지연 예상', un: '미편성' };
  const chipOf = (o) => { if (CT.isStale(o)) return '<span class="rk-chip stale">종결 확인</span>'; const l = lateOf(o) || (unplan(o) ? 'un' : ''); return l ? `<span class="rk-chip ${l}">${LN[l]}</span>` : ''; };
  const trackAll = () => L.filter((o) => CT.isOpen(o) && !CT.isStale(o));   // 미결 정의 = ui/ct.js CT.isOpen(납기 위험과 같은 집합)
  function agg(X) {
    const a = { t: 0, n: 0, will: 0, past: 0, un: 0, st: Object.fromEntries(SG.map(([k]) => [k, { t: 0, n: 0, will: 0, past: 0, un: 0, na: 0 }])) };
    for (const o of X) { const k = stg(o), s = a.st[k], t = tonT(o), l = lateOf(o), u = unplan(o);
      s.t += t; s.n++; if (l) s[l] += t; if (u) s.un += t; if (k === 'ship' && o.ful === '출하 확인 불가') s.na++;
      if (k !== 'ship') { a.t += t; a.n++; if (l) a[l] += t; if (u) a.un += t; } }
    a.top = FLOW.reduce((m, k) => (a.st[k].t > a.st[m].t ? k : m), 'mat');
    a.blk = FLOW.reduce((m, k) => (a.st[k].will + a.st[k].past > (m ? a.st[m].will + a.st[m].past : 0.5) ? k : m), '');
    return a;
  }
  const sbar = (a, cls) => `<div class="rk-st ${cls || ''}">${FLOW.map((k) => (a.st[k].t > 0 ? `<i class="${k}" style="flex:${a.st[k].t}" title="${SGN[k]} ${n0(a.st[k].t)}t">${pct(a.st[k].t, a.t) >= 12 ? pct(a.st[k].t, a.t) + '%' : ''}</i>` : '')).join('')}</div>`;
  const lateTxt = (s, un) => [s.will >= 0.5 ? `지연 예상 ${n0(s.will)}t` : '', s.past >= 0.5 ? `납기 경과 ${n0(s.past)}t` : '', un && s.un >= 0.5 ? `미편성 ${n0(s.un)}t` : ''].filter(Boolean).map((x) => `<span class="nw">${x}</span>`).join(' · ');
  const TK = { open: null, q: '', by: 'sub' };
  const subOf = (o) => (o.pl === 'G' ? o.src.fam : o.src.pdt) || '기타';
  const ymOf = (o) => (!o.due ? '납기 없음' : o.due.slice(0, 7) < M.asOf.slice(0, 7) ? '지난 달' : `${+o.due.slice(5, 7)}월`);
  const ymKey = (o) => (!o.due ? '9999' : o.due.slice(0, 7) < M.asOf.slice(0, 7) ? '0000' : o.due.slice(0, 7));
  function cross(X, keyF, nm, sortF, cap) {
    const m = new Map(); X.filter((o) => stg(o) !== 'ship').forEach((o) => { const k = keyF(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
    let R = [...m].map(([k, A]) => ({ k, a: agg(A), s: sortF ? sortF(A[0]) : '' })).filter((r) => r.a.t >= 0.5);
    R.sort(sortF ? (x, y) => (x.s < y.s ? -1 : 1) : (x, y) => y.a.t - x.a.t);
    const rest = cap && R.length > cap ? R.slice(cap) : []; if (rest.length) R = R.slice(0, cap);
    const mx = Math.max(1, ...R.flatMap((r) => FLOW.map((k) => r.a.st[k].t)));
    const cell = (v) => (v < 0.5 ? '<td class="hm z">-</td>' : `<td class="hm" style="background:color-mix(in srgb, var(--hc) ${8 + Math.round(v / mx * 30)}%, transparent)"><b>${n0(v)}</b></td>`);
    const bad = (v) => (v < 0.5 ? '<td class="z">-</td>' : `<td><b class="ot-bad">${n0(v)}</b></td>`);
    const all = agg(X.filter((o) => stg(o) !== 'ship'));
    const line = (k, a, c) => `<tr${c ? ` class="${c}"` : ''}><td class="l"><b>${esc(k)}</b></td>${c ? FLOW.map((f) => `<td><b>${a.st[f].t >= 0.5 ? n0(a.st[f].t) : '-'}</b></td>`).join('') : FLOW.map((f) => cell(a.st[f].t)).join('')}<td><b>${n0(a.t)}</b></td>${bad(a.will)}${bad(a.past)}</tr>`;
    return `<div class="scroll"><table class="rk-s"><thead><tr><th class="l">${nm}</th>${FLOW.map((f) => `<th>${SGN[f]}</th>`).join('')}<th>합계</th><th>지연 예상</th><th>납기 경과</th></tr></thead><tbody>`
      + R.map((r) => line(r.k, r.a)).join('') + (rest.length ? line(`그 외 ${rest.length}개`, agg(rest.flatMap((r) => m.get(r.k)))) : '') + line('합계', all, 'tot') + '</tbody></table></div>';
  }
  const conHead = '<thead><tr><th class="l">상태</th><th class="l">계약</th><th>라인</th><th class="l">품목</th><th class="l">두께×폭</th><th>납기</th><th title="생산 전·중 = 주문 충당량 · 생산 끝 = 미출하량">미생산·미출하</th><th>단계</th><th>생산 예정</th><th class="l">사유</th></tr></thead>';
  const conRow = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="l">${chipOf(o)}</td><td class="l">${esc(o.id)}</td><td>${esc(o.line || '-')}</td><td class="l">${esc(o.item || '-')}</td><td class="l">${esc(o.size || '')}</td><td>${md(o.due) || '-'}</td>`
    + `<td><b>${pdone(o) ? '<small class="ot-z">미출하</small> ' : ''}${n0(tonT(o))}t</b></td><td>${o.closed ? esc(CT.fl(o.ful)) : SGN[stg(o)]}</td><td>${!pdone(o) && o.etaDone ? md(o.etaDone) : '-'}</td><td class="w"><div class="rk-w">${esc((o.cause && CT.why(o)) || '')}</div></td></tr>`;
  const conSort = (a, b) => ({ past: 0, will: 1, '': 2 }[lateOf(a)] - { past: 0, will: 1, '': 2 }[lateOf(b)]) || tonT(b) - tonT(a);
  const XBY = [['sub', (g) => (g.pl === 'G' ? '강종' : '품명'), subOf], ['cus', '고객사', (o) => o.cus || (o.src || {}).cus || '고객사 미확인'], ['dst', '목적지', (o) => o.dst || '목적지 없음'], ['man', '담당자', (o) => o.man || '담당자 미확인']];
  const xb = (g) => (TK.by === 'dst' && g.pl !== 'G' ? 'sub' : TK.by || 'sub');
  function grpDetail(g) {
    const a = g.a, rows = g.X.slice().sort(conSort), sh = a.st.ship;
    return `<div class="rk-dg">
      <div><p class="rk-h3">단계 × <span class="seg ct-seg ot-xby" role="group" aria-label="묶음">${XBY.filter(([k]) => k !== 'dst' || g.pl === 'G').map(([k, nm]) => `<button type="button" data-b="${k}" aria-pressed="${xb(g) === k}">${typeof nm === 'function' ? nm(g) : nm}</button>`).join('')}</span></p>${(() => { const x = XBY.find(([k]) => k === xb(g)); return cross(g.X, x[2], typeof x[1] === 'function' ? x[1](g) : x[1], null, 12); })()}</div>
      <div><p class="rk-h3">단계 × 납기월 <small>톤</small></p>${cross(g.X, ymOf, '납기월', ymKey)}${sh.n ? `<p class="rk-rule">생산 완료 · 출하 대기 ${n0(sh.n)}건 ${n0(sh.t)}t${sh.na ? ` (출하 실적 없음 ${n0(sh.na)}건)` : ''}</p>` : ''}</div></div>
      <details class="rk-more"><summary>해당 계약 ${n0(rows.length)}건</summary><div class="scroll" style="margin-top:8px"><table class="rk-s">${conHead}<tbody>${rows.slice(0, 300).map(conRow).join('')}</tbody></table></div>${rows.length > 300 ? `<p class="rk-rule">지연·물량순 300건 표시 · 전체 ${n0(rows.length)}건</p>` : ''}</details>`;
  }
  function drawTrack() {
    const LN = PS.line || '', inLn = (o) => !LN || o.line === LN;      // 위 라인 탭(1CCL 등)을 고르면 아래 판매그룹·조회도 그 라인만(11/10 사용자 '1CCL 눌렀는데 도금이 같이 나온다')
    const A = trackAll().filter(inLn), stale = L.filter(CT.isStale).filter(inLn), pls = ['G', 'C'].filter((p) => CT.inScope(p) && (!LN || (/CGL/.test(LN) ? 'G' : 'C') === p));
    const GM = new Map(); A.forEach((o) => { const k = o.pl + '|' + o.grp; if (!GM.has(k)) GM.set(k, []); GM.get(k).push(o); });
    const G = [...GM].map(([key, X]) => ({ key, pl: X[0].pl, g: X[0].grp, X, a: agg(X) })).sort((x, y) => (x.pl === y.pl ? y.a.t - x.a.t : x.pl === 'G' ? -1 : 1));
    let last = null;
    const msg = (a) => { if (a.t < 0.5) return `미생산 없음 · 출하 대기 ${n0(a.st.ship.t)}t`; const s = a.st[a.top], x = lateTxt(s, a.top === 'plan');
      return `<b>${SGN[a.top]}</b> <span class="nw">${n0(s.t)}t(${pct(s.t, a.t)}%)</span>${x ? ` · ${x}` : ''}`; };
    let fo = false; try { fo = localStorage.getItem('cgl-ot-ps') === '1'; } catch (e) { /* 무시 */ }
    $('ot').innerHTML = `${lineTabs()}
      <section class="card" id="ot-s1">${concl(A, LN)}</section>
      <section class="card ot-psc" id="ot-s2"><h2>라인별 진행 단계${LN ? ` · ${LN}` : ''} <small>MES 작업지시대상 기준 · 소재 매치 → 부자재 → 작업지시 · 작업가능일 — 칸을 누르면 해당 주문</small></h2>${stale.length ? `<p class="ot-z" style="margin:-4px 0 8px">종결 확인 ${n0(stale.length)}건 ${n0(sum(stale, (o) => o.remT))}t 제외</p>` : ''}<div id="co-ps"></div></section>
      <section class="card" id="ot-s3"><h2>계약 조회</h2>
        <form id="ot-qf" class="ot-qf"><input id="ot-q" class="ot-q" type="search" placeholder="계약번호 · 품명 · 고객사 · 담당자 입력" value="${esc(TK.q)}" aria-label="계약 조회"><button type="submit" class="ot-qb">조회</button><span class="ot-z">2자 이상 입력 · 미결 주문 ${n0(L.filter(inLn).length)}건 대상</span></form><div id="ot-qr"></div></section>${basisFold('track')}`;
    $('ot').querySelectorAll('tr.g').forEach((tr) => { const f = () => { TK.open = TK.open === tr.dataset.k ? null : tr.dataset.k; drawTrack(); const t = [...document.querySelectorAll('tr.g')].find((x) => x.dataset.k === TK.open); if (t) t.scrollIntoView({ block: 'nearest' }); };
      tr.onclick = f; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }; });
    const rowsOn = (root) => { root.querySelectorAll('tr.ck').forEach((tr) => { tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) open(o); }; }); CT.keyRows(root); };
    $('ot').querySelectorAll('tr.rk-d').forEach(rowsOn);
    $('ot').querySelectorAll('.ot-xby button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const y = scrollY; TK.by = b.dataset.b; drawTrack(); scrollTo(0, y); }; });
    const find = () => { const q = TK.q.toUpperCase(), R = q.length < 2 ? [] : L.filter(inLn).filter((o) => [o.id, o.item, o.cus, o.man, o.dst, o.grp, o.line, (o.src || {}).pdt, (o.src || {}).fam].join(' ').toUpperCase().includes(q)).sort(conSort);
      $('ot-qr').innerHTML = q.length < 2 ? '' : R.length ? `<div class="scroll" style="margin-top:10px"><table class="rk-s">${conHead}<tbody>${R.slice(0, 100).map(conRow).join('')}</tbody></table></div>${R.length > 100 ? `<p class="rk-rule">100건 표시 · 전체 ${n0(R.length)}건</p>` : ''}` : '<p class="rk-rule">해당 계약 없음</p>';
      rowsOn($('ot-qr')); };
    $('ot-qf').onsubmit = (e) => { e.preventDefault(); TK.q = $('ot-q').value.trim(); find(); };
    $('ot-q').oninput = (e) => { TK.q = e.target.value.trim(); clearTimeout(drawTrack.t); drawTrack.t = setTimeout(find, 200); };
    find();
    $('co-ps').innerHTML = progSum(); bindPS();
  }
  function bindPS(noMini) {
    const re = () => { const y = scrollY; $('co-ps').innerHTML = progSum(noMini); bindPS(noMini); scrollTo(0, y); };
    document.querySelectorAll('#co-ps .ps-mon button').forEach((b) => (b.onclick = () => { PS.mon = b.dataset.mon; PS.open = ''; re(); }));
    document.querySelectorAll('.ps-seg button, .pm').forEach((bt) => (bt.onclick = () => { const y = scrollY; PS.line = bt.dataset.l; PS.open = ''; TK.open = null; drawTrack(); scrollTo(0, y); }));
    document.querySelectorAll('#co-ps [data-ex]').forEach((el) => { const go = () => { PS.open = PS.open === el.dataset.ex ? '' : el.dataset.ex; re(); const e = document.querySelector('.ps-exp'); if (e && PS.open) e.scrollIntoView({ block: 'nearest' }); };
      el.onclick = go; el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } }; });
    document.querySelectorAll('#co-ps th[data-xs] button').forEach((b) => (b.onclick = () => { const x = b.parentNode.dataset.xs; if (PS.sk === x) PS.dir = -PS.dir; else { PS.sk = x; PS.dir = x === 'due' ? 1 : -1; } re(); }));
  }

  /* ---------- #cal 납기 캘린더(11/11 사용자 전면 개편) ----------
     들어가면 바로 '이번 주·다음 주(수~화) 납기 물량과 그중 위험' → 날짜 × 판매그룹 톤·위험 톤(계약 나열 없음) → 칸을 누르면 고객사·목적지 → 계약.
     대상 = 미결 주문 중 생산이 남은 것(주문 충당량 · 납기 위험 화면과 같은 집합). 위험 = 납기 위험(risk.enc.json)의 지연 예상·납기 경과 */
  const DW = ['일', '월', '화', '수', '목', '금', '토'];
  let calOff = 0, CP = { by: 'cus' };
  const calSet = () => L.filter((o) => CT.isOpen(o) && !CT.isStale(o) && !pdone(o) && o.due && (o.remT || 0) >= 0.5);
  const gKey = (o) => o.pl + '|' + o.grp;
  const tot = (A) => { const r = { t: 0, n: 0, r: 0, w: 0, p: 0 }; for (const o of A) { const l = lateOf(o), t = o.remT || 0; r.t += t; r.n++; if (l) { r.r += t; r[l === 'will' ? 'w' : 'p'] += t; } } return r; };
  const plOrder = () => ['G', 'C'].filter((p) => CT.inScope(p));
  function groupsOf(A) {   // 판매그룹 줄 순서 = 도금 → 컬러, 그룹 안은 물량 큰 순
    const m = new Map(); A.forEach((o) => { const k = gKey(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
    return [...m].map(([k, X]) => ({ k, pl: X[0].pl, g: X[0].grp, X, a: tot(X) })).sort((x, y) => (x.pl === y.pl ? y.a.t - x.a.t : x.pl === 'G' ? -1 : 1));
  }
  const cell = (A, key, cls) => { const a = tot(A); return a.n ? `<td class="ck dc-c${cls ? ' ' + cls : ''}" data-q="${esc(key)}" tabindex="0" role="button"><b>${n0(a.t)}</b>${a.r >= 0.5 ? `<small class="dc-r">위험 ${n0(a.r)}</small>` : ''}</td>` : `<td class="dc-c dc-z${cls ? ' ' + cls : ''}">-</td>`; };
  /* 이번 주·다음 주(수~화) 한 표: 줄 = 판매그룹(도금·컬러 소계 줄), 칸 = 지난 납기 · 날짜 7 · 주 합계 — 두 주가 같은 칸 너비 */
  function weekTable(A, w0) {
    const asOf = M.asOf, wk = [w0, CT.addD(w0, 7)], past = (o) => o.due < asOf;
    const G = groupsOf(A.filter((o) => past(o) || o.due <= CT.addD(w0, 13))), pls = plOrder();
    const sec = (d0, lab, first) => {
      const days = Array.from({ length: 7 }, (_, i) => CT.addD(d0, i)), d1 = days[6], inW = (o) => o.due >= d0 && o.due <= d1;
      const hd = `<tr class="dc-h"><th class="l">${lab}</th><th class="dc-pc"${first ? ' title="오늘 전에 납기가 지났는데 생산이 남은 주문"' : ''}>${first ? '지난 납기' : ''}</th>${days.map((d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay();
        return `<th class="${d === asOf ? 'dc-td' : ''}${w === 0 || w === 6 ? ' dc-we' : ''}${d < asOf ? ' dc-ps' : ''}">${md(d)} <span>${DW[w]}</span>${d === asOf ? '<em>오늘</em>' : ''}</th>`; }).join('')}<th class="dc-sum">주 합계</th></tr>`;
      const line = (X, key, nm, cls) => `<tr class="${cls || ''}"><td class="l nm">${nm}</td>${first ? cell(X.filter(past), `${key}~past~`, 'dc-pc') : '<td class="dc-c dc-pc"></td>'}${days.map((d) => cell(X.filter((o) => o.due === d), `${key}~${d}~${d}`, d === asOf ? 'dc-td' : '')).join('')}${cell(X.filter(inW), `${key}~${d0}~${d1}`, 'dc-sum')}</tr>`;
      let body = '';
      for (const p of pls) { const gs = G.filter((g) => g.pl === p && g.X.some((o) => inW(o) || (first && past(o)))); if (!gs.length) continue;
        body += line(gs.flatMap((g) => g.X), 'P~' + p, `<b>${p === 'G' ? '도금' : '컬러'} 계</b>`, 'dc-pl') + gs.map((g) => line(g.X, 'G~' + g.k, esc(g.g))).join(''); }
      return hd + (body || '<tr><td class="l nm">납기 주문 없음</td><td colspan="9"></td></tr>');
    };
    return `<div class="scroll"><table class="dc-t">${sec(wk[0], '이번 주', true)}${sec(wk[1], '다음 주', false)}</table></div>`;
  }
  function weekKpi(A, nm, d0, d1, past) {
    const X = A.filter((o) => (past ? o.due < M.asOf : o.due >= d0 && o.due <= d1)), a = tot(X), pls = plOrder();
    const sp = pls.length > 1 ? pls.map((p) => { const b = tot(X.filter((o) => o.pl === p)); return `<span class="nw">${p === 'G' ? '도금' : '컬러'} ${n0(b.t)}t${b.r >= 0.5 ? ` <em class="dc-r">위험 ${n0(b.r)}</em>` : ''}</span>`; }).join('') : '';
    return `<div class="dc-k${a.r >= 0.5 ? ' bad' : ''}"><div class="l">${nm}${past ? '' : ` <small>${md(d0)}~${md(d1)}</small>`}</div><div class="v">${n0(a.t)}<small>t</small> <span>${n0(a.n)}건</span></div>`
      + `<div class="rr">${a.r >= 0.5 ? `위험 <b>${n0(a.r)}t</b> <span>(${[a.w >= 0.5 ? `지연 예상 ${n0(a.w)}` : '', a.p >= 0.5 ? `납기 경과 ${n0(a.p)}` : ''].filter(Boolean).join(' · ')})</span>` : '<span class="ok">위험 없음</span>'}</div>${sp ? `<div class="sp">${sp}</div>` : ''}</div>`;
  }
  function monthGrid(A) {
    const asOf = M.asOf, m0 = CT.addD(asOf.slice(0, 7) + '-15', 30.4 * calOff | 0).slice(0, 7), first = m0 + '-01';
    const last = CT.addD(CT.addD(first, 40).slice(0, 7) + '-01', -1), lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
    let cells = '<div class="dc-mc blank" aria-hidden="true"></div>'.repeat(lead);
    for (let d = first; d <= last; d = CT.addD(d, 1)) {
      const a = tot(A.filter((o) => o.due === d)), w = new Date(d + 'T00:00:00Z').getUTCDay();
      cells += `<div class="dc-mc${d === asOf ? ' td' : ''}${d < asOf ? ' ps' : ''}${w === 0 || w === 6 ? ' we' : ''}${a.n ? ' ck' : ''}"${a.n ? ` data-q="A~~${d}~${d}" role="button" tabindex="0" aria-label="${md(d)} 납기 ${n0(a.t)}t"` : ''}><span class="d">${+d.slice(8)}</span>${a.n ? `<b>${n0(a.t)}t</b>${a.r >= 0.5 ? `<small class="dc-r">위험 ${n0(a.r)}</small>` : ''}` : ''}</div>`;
    }
    const mm = A.filter((o) => o.due.slice(0, 7) === m0), a = tot(mm);
    return `<div class="dc-mh"><button type="button" class="lnk" id="dc-prev">◀ 이전 달</button><b>${m0.slice(0, 4)}년 ${+m0.slice(5)}월</b><button type="button" class="lnk" id="dc-next">다음 달 ▶</button>${calOff ? '<button type="button" class="lnk" id="dc-now">이번 달</button>' : ''}`
      + `<span class="dc-ms">납기 ${n0(a.t)}t · ${n0(a.n)}건${a.r >= 0.5 ? ` · <b class="dc-r">위험 ${n0(a.r)}t</b>` : ''}</span></div>`
      + `<div class="dc-mw">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<div>${x}</div>`).join('')}</div><div class="dc-mg">${cells}</div>`;
  }
  function viewCal() {
    const A = calSet(), w0 = CT.wed(M.asOf), w1 = CT.addD(w0, 7);
    const kp = `<div class="dc-ks">${weekKpi(A, '이번 주 납기', w0, CT.addD(w0, 6))}${weekKpi(A, '다음 주 납기', w1, CT.addD(w1, 6))}${weekKpi(A, '지난 납기 · 생산 남음', null, null, true)}</div>`;
    return `<section class="card dc-card"><h2>이번 주·다음 주 납기 <small>수~화 · 주문 충당량 t · 칸을 누르면 고객사·계약</small></h2>${kp}${weekTable(A, w0)}</section>`
      + `<section class="card dc-card"><h2>월 달력 <small>날짜별 납기 t · 위험 t</small></h2>${monthGrid(A)}</section>`
      + basisFold('cal');
  }
  /* 칸 → 상세(오른쪽 패널): 고객사별(또는 목적지별) 묶음 → 계약 */
  function calPanel(q) {
    const [scope, kk, from, to] = q.split('~'), pastQ = from === 'past';
    let X = calSet().filter((o) => (pastQ ? o.due < M.asOf : o.due >= from && o.due <= to));
    if (scope === 'P') X = X.filter((o) => o.pl === kk); else if (scope === 'G') X = X.filter((o) => gKey(o) === kk);
    const nm = scope === 'P' ? (kk === 'G' ? '도금' : '컬러') : scope === 'G' ? kk.split('|')[1] : '전체';
    const when = pastQ ? '지난 납기' : from === to ? `${md(from)}(${wd(from)}) 납기` : `${md(from)}~${md(to)} 납기`;
    const draw = () => {
      const a = tot(X), byF = CP.by === 'dst' ? (o) => o.dst || (o.pl === 'C' ? `${o.line || ''} (목적지 없음)` : '목적지 없음') : (o) => o.cus || (o.src || {}).cus || '고객사 미확인';
      const m = new Map(); X.forEach((o) => { const k = byF(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
      const G = [...m].map(([k, Y]) => ({ k, Y: Y.sort(conSort), a: tot(Y) })).sort((x, y) => y.a.r - x.a.r || y.a.t - x.a.t);
      const row = (o) => { const r = RSR[o.pl + '|' + o.id], sp = window.UI && UI.specKo ? UI.specKo(o.pl === 'G' ? (o.src || {}).pspec : (o.src || {}).spec) : null;
        return `<tr class="ck" data-id="${esc(o.id)}"><td>${chipOf(o) || '<span class="dc-okc">정상</span>'}</td><td class="w"><b class="id">${esc(o.id)}</b><small>${[o.item, o.size, o.due && `납기 ${md(o.due)}`].filter(Boolean).map((x) => `<span class="nw">${esc(x)}</span>`).join(' · ')}</small>${r && r[8] ? `<small class="dc-why">${esc(r[8])}</small>` : ''}</td><td class="r"><b>${n1(o.remT)}t</b></td></tr>`; };
      return `<div class="dc-ps"><div class="dc-psum"><b>${n0(a.t)}t</b> · ${n0(a.n)}건${a.r >= 0.5 ? ` · <b class="dc-r">위험 ${n0(a.r)}t</b>` : ''}</div>`
        + `<div class="seg ct-seg dc-by" role="group" aria-label="묶음">${[['cus', '고객사별'], ['dst', '목적지별']].map(([k, t]) => `<button type="button" data-b="${k}" aria-pressed="${CP.by === k}">${t}</button>`).join('')}</div>`
        + G.map((g) => `<details class="dc-pg"${g.a.r >= 0.5 || G.length <= 3 ? ' open' : ''}><summary><b>${esc(g.k)}</b><span>${n0(g.a.n)}건 · ${n0(g.a.t)}t${g.a.r >= 0.5 ? ` · <em class="dc-r">위험 ${n0(g.a.r)}t</em>` : ''}</span></summary><table class="ct-t dc-pt"><tbody>${g.Y.map(row).join('')}</tbody></table></details>`).join('') + '</div>';
    };
    const bind = (p) => {
      p.querySelectorAll('.dc-by button').forEach((b) => { b.onclick = () => { CP.by = b.dataset.b; CT.panel(draw(), `${nm} · ${when}`, bind, true); }; });
      p.querySelectorAll('tr.ck').forEach((tr) => { tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) CT.panel(CT.orderDetail(o), o.id); }; });
    };
    CT.panel(draw(), `${nm} · ${when}`, bind);
  }
  function bindCal() {
    const re = () => { const y = scrollY; render(D0); scrollTo(0, y); };
    $('dc-prev').onclick = () => { calOff--; re(); }; $('dc-next').onclick = () => { calOff++; re(); };
    const nw = $('dc-now'); if (nw) nw.onclick = () => { calOff = 0; re(); };
    document.querySelectorAll('#ct-main [data-q]').forEach((el) => { const go = () => calPanel(el.dataset.q); el.onclick = go; el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  }

  /* ---------- 맨 아래 기준·사양(11/11) ---------- */
  function basisFold(v) {
    const cg = D0.cg_order_progress || {}, cc = D0.cc_order_progress || {}, rk = D0.risk || {}, B = cg.basis || {};
    const stale = L.filter(CT.isStale), li = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    const defs = [
      li('기준일', `${md(M.asOf)} · 도금 주문 ${md(cg.asOf)} · 컬러 주문 ${md(cc.asOf)} · 납기 위험 판정 ${esc(String(rk.built || '').replace('T', ' '))}`),
      li('주문 충당량', '주문량 − 생산량(MES 주문잔여량). 생산이 끝나 출하만 남은 주문은 \'출하\' 단계(미출하량)'),
      li('위험', '납기 위험 화면과 같은 판정 — 지연 예상(소재 입고·강종 생산·작업 예정이 납기 이후) · 납기 경과(납기 지남·생산 남음). 판정일 = 도금 수출 출항 전날, 도금 내수 납기 달 말일, 컬러 납기일 <a href="risk.html">→ 납기 위험</a>'),
      v === 'cal' ? li('주', '수요일 ~ 화요일(주간 작업순서 확정 주기) · 날짜 = 계약 납기일') : li('단계', '소재 확보 → 작업 편성 → 생산 → 출하. 아직 안 끝난 첫 단계에 주문 충당량을 둠 · 미편성 = 소재는 있으나 작업 편성 전'),
      li('제외', `종결 확인(납기 60일 넘게 지난 미종결) ${n0(stale.length)}건 ${n0(sum(stale, (o) => o.remT))}t · 미생산 0.5t 미만`),
      li('소재 기준', `필요 입고일 = 생산 필요일 − ${(B.leadIn || 0) + (B.prep || 0)}일(입고 ${B.leadIn || '-'}일 + 준비 ${B.prep || '-'}일) · 생산 필요일 = 수출 출항 −1일, 내수 납기 −1일 · F/H 예상 입고 = 인도기한 ${cg.dleOff || ''}일(실적 ${n0(cg.dleOffN)}건 중앙값) <a href="leadtime.html">→ 소재 리드타임 표</a>`),
    ];
    if (v !== 'cal') defs.push(li('작업가능일', '작업시간 ÷ 24시간 · 작업시간 = 주문 충당량(작업지시량은 확정 지시중량) ÷ 계약별 실적 t/h'), li('출하 연결', shipNote()));
    return `<details class="fold ct-fold"><summary>기준·사양</summary><dl class="ct-def">${defs.join('')}</dl></details>`;
  }

  /* ---------- 공통 ---------- */
  let RSR = {};
  function render(D) {
    D0 = D; M = CT.orders(D);
    RS = D.risk && D.risk.groups ? Object.fromEntries(D.risk.groups.flatMap((g) => g.rows.map((r) => [g.pl + '|' + r[0], r[6]]))) : null;
    RSR = D.risk && D.risk.groups ? Object.fromEntries(D.risk.groups.flatMap((g) => g.rows.map((r) => [g.pl + '|' + r[0], r]))) : {};
    L = M.all.filter((o) => CT.inScope(o.pl));
    byId = Object.fromEntries(M.all.map((o) => [o.id, o]));
    const v = CT.view('track', VIEWS);   // # 없음·옛 #status·#risk → 주문진도
    const cg = D.cg_order_progress, cc = D.cc_order_progress;
    const basis = CT.basis([
      cg && { name: '도금 주문', at: cg.asOf, kind: '실적·재계획' },
      cc && { name: '컬러 주문', at: cc.asOf, kind: (cc.lines || []).join('·') },
      ...(M.ccMissing || []).map((l) => ({ name: l, at: null, ok: false, tip: '작업지시대상 자료 없음' })),
    ]);
    if (v === 'cal') { $('ct-main').innerHTML = basis + `<div class="rk">${viewCal()}</div>`; bindCal(); }
    else { $('ct-main').innerHTML = basis + '<div class="rk" id="ot" style="margin-top:12px"></div>'; drawTrack(); }
    document.title = `${v === 'cal' ? '납기 캘린더' : '주문진도'} · 주문·납기`;
  }
  CT.onView(() => { if (D0 && $('ct-main')) { CT.panel(null); render(D0); } });
  const FILES = ['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'risk.enc.json'];
  /* 편성 화면(pyeonseong.js)이 맨 위에 '컬러·도금 전체 주문진도'를 그대로 씀: CTORD.mount(host, D) — D = FILES 복호화(CT.boot 와 같은 이름) · 라인별 미생산 카드는 뺌 */
  window.CTORD = { FILES, mount(host, D) {
    D0 = D; M = CT.orders(D); CT.D = D; L = M.all.filter((o) => CT.inScope(o.pl)); byId = Object.fromEntries(M.all.map((o) => [o.id, o]));
    host.innerHTML = `<div id="co-ps">${progSum(true)}</div>`; bindPS(true);
  } };
  if ($('ct-main')) CT.boot(FILES, render);
})();
