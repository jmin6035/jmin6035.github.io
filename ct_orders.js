/* 주문·납기(11/4 2차 진단 2·5·11장): 도금 + 컬러 → 한 주문 모델(ui/ct.js CT.orders)
   하위 화면 = 주소 #뒤: #track 주문진도(기본 · 옛 #status·#risk 도 여기로) · #cal 납기 캘린더 — 납기 위험은 risk.html
   출하 확인 불가(출하 실적 연결 없음)는 완료로 보지 않음 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, n0, n1, md } = CT;
  const VIEWS = ['track', 'cal'];
  let calOff = 0, D0 = null, M = null, L = [], byId = {};
  const plName = (o) => `${o.pl === 'G' ? '도금' : '컬러'} ${o.line || ''}`.trim();
  const sum = (A, f) => A.reduce((s, o) => s + (f(o) || 0), 0);
  const dow = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (s) => dow[new Date(s + 'T00:00:00Z').getUTCDay()];
  const open = (o) => CT.panel(CT.orderDetail(o), o.id);

  /* 출하 근거 한 줄 — 출하가 나오는 곳마다 */
  function shipNote() {
    const part = (L, nm) => { const d_ = L.filter((o) => CT.inScope(o.pl) && !['생산 전', '생산 중'].includes(o.ful)); return d_.length ? `${nm} 생산 끝난 ${n0(d_.length)}건 중 출하 연결 ${n0(d_.filter((o) => (o.fwdT || 0) > 0.5).length)}건` : ''; };
    return `<p class="ct-note co-sn">${[part(M.G, '도금'), part(M.C, '컬러')].filter(Boolean).join(' · ')} — MES 출고 실적(7/1~)을 코일번호로 주문에 연결</p>`;
  }

  /* 주문진도 요약(11/5 사용자 'SSCHC1010 작업지시대상선정 요약 — 우리로 치면 주문진도'): 라인별 · 전체
     원본 전체 = 잔여 있음 + 1,000kg 이하(제외) + 잔여 없음(제외). 매치있음 = 매치량>0(이미 생산에 쓴 소재 제외), 아래 작업 상태 4줄은 안 끝난 작업지시(PF_CC_WORK_ORD) 기준.
     작업가능일 = 매치된 소재로 만들 수 있는 양(주문별 min(잔여, 매치)) ÷ 라인 하루 능력 */
  const CAPC = { '1CCL': 480, '2CCL': 400, '3CCL': 200, '4CCL': 250 }, CAPG = { '1CGL': 719, '2CGL': 927 };
  let PS = { line: '', open: '', sk: '', dir: 1 };
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
    G: { cat: catG, sub: GSUB, subOf: gsub, tiles: ['작업 대기'], leaves: [[K0, '#d03b3b', '소재(F/H) 입고 전 — 아래는 소재 상태'], ['작업 대기', '#2a78d6', '소재 입고 끝 — 현장 작업지시 전'], ['작업지시량', '#008300', '현장 작업지시 목록에 오름 — 바로 생산']] },
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
      const R0 = (cc.rows || []).filter((r) => cl.includes(r.line)), R = R0.filter((r) => !shut.has(r) && !r.dummy), cap = cl.reduce((a, l) => a + CAPC[l], 0);
      const ex = cl.reduce((a, l) => { const e = (cc.excl || {})[l] || {}; return { zero: a.zero + ((e.zero || [])[0] || 0), small: a.small + ((e.small || [])[0] || 0), zT: a.zT + ((e.zero || [])[1] || 0), sT: a.sT + ((e.small || [])[1] || 0) }; }, { zero: 0, small: 0, zT: 0, sT: 0 });
      const can = R.filter((r) => r.mchT > 0.0005).reduce((a, r) => a + Math.min(+r.remT || 0, +r.mchT || 0), 0);
      const exA = (k) => cl.reduce((a, l) => { const e = (((cc.excl || {})[l] || {})[k]) || []; return a.map((v, i) => v + (+e[i] || 0)); }, [0, 0, 0, 0, 0]);
      out.push({ pl: 'C', nm: '컬러', R, cap, can, ex: Object.assign(ex, { shut: R0.filter((r) => shut.has(r)).length, dummy: R0.filter((r) => r.dummy && !shut.has(r)).length }), cusLoaded: !!cc.cusLoaded, exZ: exA('zero'), exS: exA('small'), cats: CFG.C.leaves.map(([k, c, t]) => { const rs = R.filter((r) => catC(r) === k); return { k, c, t, n: rs.length, rem: rs.reduce((a, r) => a + tonOf(r, k), 0), rs }; }) });   // 11/9: 단계별 톤 = 그 단계의 근거(1030 확정 남은 양·1020 지시 남은 양·그 밖 주문 잔량)
    }
    if (gl.length && (D0 || {}).cg_order_progress) {
      // 11/9 도금도 컬러와 같게: 주문잔여량 1,000kg 넘는 것(계약번호 5번째 T·Q 는 포함)
      const tq = (o) => /^[TQ]$/.test(String(o.id || '').charAt(4));
      const G = (M.G || []).filter((o) => gl.includes(o.line)), R = G.filter((o) => !o.closed && ((o.remT || 0) > 1 || (tq(o) && (o.remT || 0) > 0.0005))), capL = Object.fromEntries((((D0 || {}).cg_order_progress || {}).cover || {}).lines?.filter((x) => x.specDay).map((x) => [x.line, x.specDay]) || []), cap = gl.reduce((a, l) => a + (capL[l] || CAPG[l]), 0);   // 11/9: 하루 능력 = 재계획 하루 톤(도금 주문진도와 같은 값) — 고정 927t 였음
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
    const tile = (k, v, u, sub, tone = '', ex = '') => `<div class="pt ${tone}${ex ? ' ck' : ''}"${ex ? ` data-ex="${esc(ex)}" role="button" tabindex="0" aria-expanded="${PS.open === ex}"` : ''}${tip(k === '주문 잔여량' ? '' : k)}><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div><div class="s">${sub}</div></div>`;
    const cat = (k) => d.cats.find((c) => c.k === k) || { n: 0, rem: 0, rs: [] }, F = CFG[d.pl], sumT = (rs) => rs.reduce((a, r) => a + (+r.remT || 0), 0);
    const hSum = (rs, k) => rs.reduce((a, r) => a + hrsOf(r, k), 0), xk = (k) => `${d.pl}|${k}`;
    const m0 = cat(K0), mt = d.cats.filter((c) => MATCHED.includes(c.k)), mtR = mt.flatMap((c) => c.rs), mtT = mt.reduce((a, c) => a + c.rem, 0), mtN = mtR.length, w = cat(KW);
    const subT = (k) => sumT(m0.rs.filter((r) => F.subOf(r) === k));
    const m0s = d.pl === 'C' ? (subT('발주 없음') > 0.5 ? ` · <span class="bad">발주 없음 ${n0(subT('발주 없음'))}t</span>` : '') : [['입고 지연', subT('입고 지연')], ['미발주', subT('미발주')]].filter((x) => x[1] > 0.5).map(([k, v]) => ` · <span class="bad">${k} ${n0(v)}t</span>`).join('');
    const hd = (rs, k) => `${n0(hSum(rs, k))}h · ${dayTxt(rs, k)}`;
    const wT = d.pl === 'C' ? w.rem : w.rem, wN = d.pl === 'C' ? w.rs.reduce((a, r) => a + (r.s1030 ? r.s1030.n : (+r.cfmN || 0)), 0) : w.n;
    const gTxt = (rs, k) => { const o = {}; rs.forEach((r) => { const g = String(r.grp || '-').replace(/그룹$|판매그룹$/, ''); o[g] = (o[g] || 0) + tonOf(r, k); }); const e = Object.entries(o).filter((x) => x[1] >= 0.5).sort((a, b) => b[1] - a[1]); return e.length ? `<div class="gq">${e.map(([g, v]) => `<span class="nw">${esc(g)} ${n0(v)}</span>`).join(' · ')}</div>` : ''; };
    const tiles = `<div class="pts p${4 + F.tiles.length}">${tile('주문 잔여량', n0(tot), 't', `<span title="${d.pl === 'C' ? '작업지시대상' : '도금 작업지시대상'} 주문잔여량 1,000kg 넘는 것(계약번호 5번째 T·Q 포함)">${n0(n)}건</span>${gTxt(d.R, '')}`)}`
      + tile(K0, n0(m0.rem), 't', `${n0(m0.n)}건${m0s}${gTxt(m0.rs, K0)}`, m0.rem > 0.5 ? 'bad' : '', xk(K0))
      + tile(KP, n0(mtT), 't', `${n0(mtN)}건 · ${hd(mtR, KP)}${gTxt(mtR, KP)}`, '', xk(KP))
      + F.tiles.map((k) => { const c = cat(k); return tile(`└ ${k}`, n0(c.rem), 't', `${n0(c.n)}건 · ${hd(c.rs, k)}${gTxt(c.rs, k)}`, (k === '부자재 대기' || k === '불량') && c.rem > 0.5 ? 'warn' : '', xk(k)); }).join('')
      + tile(KW, n0(wT), 't', `지시 ${n0(wN)}건${d.pl === 'C' ? ` · 계약 ${n0(w.n)}건` : ''} · ${hd(w.rs, KW)}${gTxt(w.rs, KW)}`, 'ok', xk(KW)) + '</div>';
    const pct = (v) => `${tot ? Math.round(v / tot * 100) : 0}%`;
    const row = (ex, cls, sw, nm, cnt, t, h, dy, txt) => `<tr class="${cls}${ex ? ' ck' : ''}"${ex ? ` data-ex="${esc(ex)}" aria-expanded="${PS.open === ex}"${tip(ex.slice(2))}` : ''}><td class="nw">${sw ? `<i class="sw" style="background:${sw}"></i>` : ''}${nm}${ex ? `<span class="tg">${PS.open === ex ? '▾' : '▸'}</span>` : ''}</td><td class="r">${n0(cnt)}</td><td class="r"><b>${n0(t)}</b></td><td class="r">${pct(t)}</td><td class="r">${h == null ? '<span class="mu">–</span>' : n0(h)}</td><td class="r">${dy || '<span class="mu">–</span>'}</td><td class="mu2">${txt}</td></tr>`;
    let body = row(xk(K0), '', F.leaves[0][1], esc(K0), m0.n, m0.rem, null, '', esc(F.leaves[0][2]))
      + F.sub.map(([k, t]) => { const rs = m0.rs.filter((r) => F.subOf(r) === k), v = sumT(rs); return `<tr class="sub2${rs.length ? '' : ' mu'}"><td class="nw">└ ${esc(k)}</td><td class="r">${n0(rs.length)}</td><td class="r">${n0(v)}</td><td class="r">${pct(v)}</td><td class="r"></td><td class="r"></td><td class="mu2">${esc(t)}</td></tr>`; }).join('')
      + row(xk(KP), 'grp', '', `<b>${KP}</b>`, mtN, mtT, hSum(mtR, KP), dayTxt(mtR, KP), d.pl === 'C' ? '매치 끝 — 부원료 발주·입고 → 작업지시' : '소재 입고 끝 — 작업지시 전')
      + mt.map((c) => row(xk(c.k), `ind${c.n ? '' : ' mu'}`, c.c, esc(c.k), c.n, c.rem, hSum(c.rs, c.k), dayTxt(c.rs, c.k), esc(c.t))).join('')
      + row(xk(KW), w.n ? '' : 'mu', F.leaves[F.leaves.length - 1][1], esc(KW), w.n, w.rem, hSum(w.rs, KW), dayTxt(w.rs, KW), esc(F.leaves[F.leaves.length - 1][2]) + (d.pl === 'C' ? ` · 지시 ${n0(wN)}건` : ''));
    const leg = `<table class="ct-t pl-t"><thead><tr><th>상태 <small>누르면 주문 목록</small></th><th class="r">건수</th><th class="r">잔여량(t)</th><th class="r">비중</th><th class="r">작업시간(h)</th><th class="r">작업가능일</th><th>뜻</th></tr></thead><tbody>${body}`
      + `<tr class="tot"><td>합계</td><td class="r">${n0(n)}</td><td class="r"><b>${n0(tot)}</b></td><td class="r">100%</td><td></td><td></td><td class="mu2">제외: ${d.pl === 'C' ? `1,000kg 이하 ${n0(d.ex.small)}건(T·Q 제외) · 잔여 없음 ${n0(d.ex.zero)}건${d.ex.shut ? ` · 전량 출하·잔량 마감 ${n0(d.ex.shut)}건` : ''}${d.ex.dummy ? ` · DUMMY ${n0(d.ex.dummy)}건` : ''}` : `1,000kg 이하 ${n0(d.ex.small)}건(T·Q 제외) · 잔여 없음·생산 완료 ${n0(d.ex.zero)}건`}</td></tr></tbody></table>`;
    // 라인별 작업가능일(24시간 기준) — 컬러 · 여러 라인일 때
    const ls = [...new Set(d.R.map((r) => r.line))].sort();
    const lday = ls.length < 2 ? '' : (() => { const ks = [[KP, mtR], ...mt.map((c) => [c.k, c.rs]), [KW, w.rs]];
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
    const exp = (() => { if (!PS.open || PS.open.split('|')[0] !== d.pl) return ''; const k = PS.open.slice(2); const sumT = (rs) => rs.reduce((a, r) => a + tonOf(r, MATCHED.includes(k) || k === KP ? catC(r) : k), 0);
      const rs = (k === KP ? mtR : cat(k).rs).slice(), cmpG = (a, b) => String(a.grp).localeCompare(String(b.grp)) || String(a.due || '').localeCompare(String(b.due || ''));
      const XS = { rem: (r) => +r.remT || 0, tph: (r) => (d.pl === 'C' ? +r.tph : r.src && +r.src.tph) || 0, hrs: (r) => hrsOf(r, d.pl === 'C' ? catC(r) : k), due: (r) => r.due || '9999' }, xf = XS[PS.sk];   // 머리글 눌러 정렬(묶음 안에서)
      rs.sort(xf ? (a, b) => String(a.grp).localeCompare(String(b.grp)) || PS.dir * (xf(a) < xf(b) ? -1 : xf(a) > xf(b) ? 1 : 0) : k === KW && d.pl === 'C' ? (a, b) => String(a.grp).localeCompare(String(b.grp)) || (a.cfmSeq ?? 1e9) - (b.cfmSeq ?? 1e9) : cmpG);
      const XK = { '잔여(t)': 'rem', 't/h': 'tph', '작업시간(h)': 'hrs', '납기': 'due' };
      const grps = [...new Set(rs.map((r) => r.grp))];
      const C = d.pl === 'C', head = C ? ['계약번호', '라인', '품명', '두께×폭', '잔여(t)', ...(k === KW ? ['지시 건수', '지시중량(t)'] : MATCHED.includes(k) || k === KP ? ['편성 지시(t)'] : []), 't/h', '작업시간(h)', '납기', k === K0 ? '소재' : k === KW ? '' : '부자재 상태'] : ['주문번호', '라인', '품목', '잔여(t)', 't/h', '작업시간(h)', '납기', '소재'];
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
    tb += tr(0, '주문 잔여량', ag(d.R), null, 'b') + tr(1, K0, ag(m0.rs), null, 'b') + F.sub.map(([k]) => tr(2, k, ag(m0.rs.filter((r) => F.subOf(r) === k)), null)).join('')
      + tr(1, KP, ag(mtR), dy(mtR, KP), 'b') + mt.map((c) => tr(2, c.k, ag(c.rs), dy(c.rs, c.k))).join('') + tr(1, KW, ag(w.rs), dy(w.rs, KW), 'b')
      + (d.pl === 'C' ? tr(1, '1,000kg 이하(제외, T·Q 제외)', d.exS, null, 'mu') + tr(0, '주문잔여량 없음(제외)', d.exZ, null, 'mu') : tr(0, '잔여 없음·생산 완료(제외)', ag((d.all || []).filter((o) => !d.R.includes(o))), null, 'mu'));
    const det = `<details class="pd"><summary${d.pl === 'C' ? ' title="MES SSCHC1010 양식"' : ''}>상세 표 <small>건수·주문량·생산량·잔여량·매치량·작업가능일(라인 평균)</small></summary><div class="ct-wrap"><table class="ct-t pdt"><thead><tr><th>구분</th><th class="r">건수</th><th class="r">주문량(t)</th><th class="r">생산량(t)</th><th class="r">잔여량(t)</th><th class="r">매치량(t)</th><th class="r">작업가능일</th></tr></thead><tbody>${tb}</tbody></table></div></details>`;
    const note = d.pl === 'G' ? `<p class="ct-note">작업시간 = 주문잔여량 ÷ 계약별 t/h(라인·강종·부서 실적 속도, 1~10월 보정) · 작업가능일 = 라인별 작업시간 ÷ 24시간.</p>` : d.pl === 'C' ? `<p class="ct-note" title="${esc(((D0 || {}).cc_order_progress || {}).tphNote || '컬러 생산 실적')}">작업시간 = 주문잔여량(작업지시량은 확정 지시중량) ÷ 계약별 t/h · 작업가능일 = 라인별 작업시간 ÷ 24시간.${d.cusLoaded ? '' : ' <b>DUMMY 고객사 제외는 고객사 자료(사내 PC 다음 실행)가 들어오면 적용</b>.'}</p>` : '<p class="ct-note">작업시간 = 잔여 ÷ (라인 하루 능력 1CGL 719 · 2CGL 927t ÷ 24).</p>';
    return `<section class="pc"><div class="pch"><b>${esc(title)}</b><span>${md(((D0 || {})[d.pl === 'C' ? 'cc_order_progress' : 'cg_order_progress'] || {}).asOf)} 기준 · ${d.pl === 'C' ? '<span title="MES SSCHC1010">MES 작업지시대상 주문잔여량 기준</span>' : '도금 주문진도(납기 −30~+90일)'}</span></div>${tiles}${segBar(d.cats, true)}<div class="lg2"><div>${leg}</div>${lday || pos ? `<div class="lg2r">${lday}${pos}</div>` : ''}</div>${exp}${det}${note}</section>`;
  }
  function progSum() {
    const cc = (D0 || {}).cc_order_progress;
    const lines = (CT.inScope('G') ? ['1CGL', '2CGL'] : []).concat(CT.inScope('C') ? ((cc || {}).lines || []) : []);
    if (!lines.length) return '';
    if (PS.line && !lines.includes(PS.line)) PS.line = '';
    const tabs = `<div class="seg ct-seg ps-seg" role="group" aria-label="라인">${[['', '전체']].concat(lines.map((l) => [l, l])).map(([k, n]) => `<button type="button" data-l="${k}" aria-pressed="${PS.line === k}">${n}</button>`).join('')}</div>`;
    let body = '';
    if (!PS.line) {
      const mini = lines.map((l) => { const d = psData([l])[0]; if (!d) return ''; const tot = d.cats.reduce((a, c) => a + c.rem, 0), days = d.cap ? d.can / d.cap : null;
        return `<button type="button" class="pm" data-l="${l}"><div class="h"><b>${l}</b><span>${n0(d.cats.reduce((a, c) => a + c.n, 0))}건</span></div><div class="v">${n0(tot)}<small>t 잔여</small></div>${segBar(d.cats, false)}<div class="s">${(() => { const g = (k) => (d.cats.find((c) => c.k === k) || { rem: 0 }).rem; return `<span class="nw">매치 전 <b class="bad">${n0(g(K0))}t</b></span> · <span class="nw">작업지시량 <b>${n0(g('작업지시량'))}t</b></span>`; })()}</div></button>`; }).join('');
      body = `<div class="pms">${mini}</div>` + psData(lines).map((d) => psCard(d, `${d.nm} 전체 주문진도`)).join('');
    } else body = psData([PS.line]).map((d) => psCard(d, `${PS.line} 주문진도`)).join('');
    return `<div class="ps">${tabs}${body}</div>`;
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
  const lateTxt = (s, un) => [s.will >= 0.5 ? `지연 예상 ${n0(s.will)}t` : '', s.past >= 0.5 ? `납기 경과 ${n0(s.past)}t` : '', un && s.un >= 0.5 ? `미편성 ${n0(s.un)}t` : ''].filter(Boolean).join(' · ');
  const TK = { open: null, q: '' };
  function flowCard(pl, X) {
    const a = agg(X), lt = a.will + a.past;
    return `<div><div class="rk-big"><em class="ot-pl">${pl === 'G' ? '도금' : '컬러'}</em><b>${n0(a.t)}<small>t</small></b><span>미결 ${n0(a.n)}건${lt >= 0.5 ? ` · 지연 예상·납기 경과 <strong class="ot-bad">${n0(lt)}t(${pct(lt, a.t)}%)</strong>` : ''}</span></div>
      ${sbar(a)}
      <div class="rk-leg ot-leg">${SG.map(([k, nm]) => { const s = a.st[k], sh = k === 'ship';
        return `<div class="${k}${a.blk === k ? ' blk' : ''}"><small>${nm}${a.blk === k ? ' <span class="rk-chip past">정체</span>' : ''}${sh ? ' <span class="ot-m">생산 완료분</span>' : ''}</small><b>${n0(s.t)}</b><em>t</em><span class="ot-n">${n0(s.n)}건${sh ? '' : ` · ${pct(s.t, a.t)}%`}</span>`
          + `<p class="ot-l">${sh ? (s.na ? `<span>출하 실적 없음 ${n0(s.na)}건</span>` : '') : lateTxt(s, k === 'plan').split(' · ').map((x) => `<span>${x}</span>`).join('')}</p></div>`; }).join('')}</div></div>`;
  }
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
  const conHead = '<thead><tr><th class="l">상태</th><th class="l">계약</th><th>라인</th><th class="l">품목</th><th class="l">두께×폭</th><th>납기</th><th>잔량</th><th>단계</th><th>생산 예정</th><th class="l">사유</th></tr></thead>';
  const conRow = (o) => `<tr class="ck" data-id="${esc(o.id)}"><td class="l">${chipOf(o)}</td><td class="l">${esc(o.id)}</td><td>${esc(o.line || '-')}</td><td class="l">${esc(o.item || '-')}</td><td class="l">${esc(o.size || '')}</td><td>${md(o.due) || '-'}</td>`
    + `<td><b>${n0(tonT(o))}t</b></td><td>${o.closed ? esc(CT.fl(o.ful)) : SGN[stg(o)]}</td><td>${!pdone(o) && o.etaDone ? md(o.etaDone) : '-'}</td><td class="w"><div class="rk-w">${esc((o.cause && CT.why(o)) || '')}</div></td></tr>`;
  const conSort = (a, b) => ({ past: 0, will: 1, '': 2 }[lateOf(a)] - { past: 0, will: 1, '': 2 }[lateOf(b)]) || tonT(b) - tonT(a);
  function grpDetail(g) {
    const a = g.a, rows = g.X.slice().sort(conSort), sh = a.st.ship;
    return `<div class="rk-dg">
      <div><p class="rk-h3">단계 × ${g.pl === 'G' ? '강종' : '품명'} <small>톤</small></p>${cross(g.X, subOf, g.pl === 'G' ? '강종' : '품명', null, 12)}</div>
      <div><p class="rk-h3">단계 × 납기월 <small>톤</small></p>${cross(g.X, ymOf, '납기월', ymKey)}${sh.n ? `<p class="rk-rule">생산 완료 · 출하 대기 ${n0(sh.n)}건 ${n0(sh.t)}t${sh.na ? ` (출하 실적 없음 ${n0(sh.na)}건)` : ''}</p>` : ''}</div></div>
      <details class="rk-more"><summary>해당 계약 ${n0(rows.length)}건</summary><div class="scroll" style="margin-top:8px"><table class="rk-s">${conHead}<tbody>${rows.slice(0, 300).map(conRow).join('')}</tbody></table></div>${rows.length > 300 ? `<p class="rk-rule">지연·물량순 300건 표시 · 전체 ${n0(rows.length)}건</p>` : ''}</details>`;
  }
  function drawTrack() {
    const LN = PS.line || '', inLn = (o) => !LN || o.line === LN;      // 위 라인 탭(1CCL 등)을 고르면 아래 판매그룹·조회도 그 라인만(11/10 사용자 '1CCL 눌렀는데 도금이 같이 나온다')
    const A = trackAll().filter(inLn), stale = L.filter(CT.isStale).filter(inLn), pls = ['G', 'C'].filter((p) => CT.inScope(p) && (!LN || (/CGL/.test(LN) ? 'G' : 'C') === p));
    const GM = new Map(); A.forEach((o) => { const k = o.pl + '|' + o.grp; if (!GM.has(k)) GM.set(k, []); GM.get(k).push(o); });
    const G = [...GM].map(([key, X]) => ({ key, pl: X[0].pl, g: X[0].grp, X, a: agg(X) })).sort((x, y) => (x.pl === y.pl ? y.a.t - x.a.t : x.pl === 'G' ? -1 : 1));
    let last = null;
    const msg = (a) => { if (a.t < 0.5) return `생산 잔량 없음 · 출하 대기 ${n0(a.st.ship.t)}t`; const s = a.st[a.top], x = lateTxt(s, a.top === 'plan');
      return `<b>${SGN[a.top]}</b> ${n0(s.t)}t(${pct(s.t, a.t)}%)${x ? ` · ${x}` : ''}`; };
    $('ot').innerHTML = `
      <div id="co-ps"></div>
      <section class="card" id="ot-s2"><h2>판매그룹별${LN ? ` · ${LN}` : ''} <small>선택 시 단계 × 강종(품명) · 납기월 표시</small></h2>
        <div class="ot-sum">${pls.map((p) => { const a = agg(A.filter((o) => o.pl === p)), lt = a.will + a.past; return `<div><em class="ot-pl">${p === 'G' ? '도금' : '컬러'}</em><b>${n0(a.t)}t</b><span>미결 ${n0(a.n)}건</span><span>지연 예상 <strong class="ot-bad">${n0(a.will)}t</strong></span><span>납기 경과 <strong class="ot-bad">${n0(a.past)}t</strong></span><span>합계 <strong class="ot-bad">${n0(lt)}t (${pct(lt, a.t)}%)</strong></span></div>`; }).join('')}${stale.length ? `<span class="ot-z">종결 확인 ${n0(stale.length)}건 ${n0(sum(stale, (o) => o.remT))}t 제외</span>` : ''}</div>
        <div class="scroll"><table class="rk-g"><thead><tr><th class="l">그룹</th><th>미결</th><th class="l otb">단계</th><th>지연 예상</th><th>납기 경과</th><th class="l">최대 정체 단계</th></tr></thead><tbody>
        ${G.map((g) => { const on = TK.open === g.key, a = g.a, h = pls.length > 1 && last !== g.pl ? `<tr class="hd"><td colspan="6">${g.pl === 'G' ? '도금' : '컬러'}</td></tr>` : ''; last = g.pl;
          const num = (v) => (v >= 0.5 ? `<b class="ot-bad">${n0(v)}t</b>` : '<span class="ot-z">-</span>');
          return `${h}<tr class="g${on ? ' on' : ''}" data-k="${esc(g.key)}" tabindex="0" role="button" aria-expanded="${on}"><td class="l nm"><b><i class="ch">▸</i>${esc(g.g)}</b><small>${n0(a.n)}건</small></td><td><b>${n0(a.t)}t</b></td><td class="l otb">${sbar(a, 'sm')}</td><td>${num(a.will)}</td><td>${num(a.past)}</td><td class="w"><div class="rk-w">${msg(a)}</div></td></tr>${on ? `<tr class="rk-d"><td colspan="6">${grpDetail(g)}</td></tr>` : ''}`; }).join('')}
        </tbody></table></div>
        <p class="rk-rule ot-key">${FLOW.map((k) => `<span><i class="${k}"></i>${SGN[k]}</span>`).join('')}</p></section>
      <section class="card" id="ot-s3"><h2>계약 조회</h2>
        <form id="ot-qf" class="ot-qf"><input id="ot-q" class="ot-q" type="search" placeholder="계약번호 · 품명 · 고객사 · 담당자 입력" value="${esc(TK.q)}" aria-label="계약 조회"><button type="submit" class="ot-qb">조회</button><span class="ot-z">2자 이상 입력 · 미결 주문 ${n0(L.filter(inLn).length)}건 대상</span></form><div id="ot-qr"></div></section>`;
    $('ot').querySelectorAll('tr.g').forEach((tr) => { const f = () => { TK.open = TK.open === tr.dataset.k ? null : tr.dataset.k; drawTrack(); const t = [...document.querySelectorAll('tr.g')].find((x) => x.dataset.k === TK.open); if (t) t.scrollIntoView({ block: 'nearest' }); };
      tr.onclick = f; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }; });
    const rowsOn = (root) => { root.querySelectorAll('tr.ck').forEach((tr) => { tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) open(o); }; }); CT.keyRows(root); };
    $('ot').querySelectorAll('tr.rk-d').forEach(rowsOn);
    const find = () => { const q = TK.q.toUpperCase(), R = q.length < 2 ? [] : L.filter(inLn).filter((o) => [o.id, o.item, o.cus, o.man, o.dst, o.grp, o.line, (o.src || {}).pdt, (o.src || {}).fam].join(' ').toUpperCase().includes(q)).sort(conSort);
      $('ot-qr').innerHTML = q.length < 2 ? '' : R.length ? `<div class="scroll" style="margin-top:10px"><table class="rk-s">${conHead}<tbody>${R.slice(0, 100).map(conRow).join('')}</tbody></table></div>${R.length > 100 ? `<p class="rk-rule">100건 표시 · 전체 ${n0(R.length)}건</p>` : ''}` : '<p class="rk-rule">해당 계약 없음</p>';
      rowsOn($('ot-qr')); };
    $('ot-qf').onsubmit = (e) => { e.preventDefault(); TK.q = $('ot-q').value.trim(); find(); };
    $('ot-q').oninput = (e) => { TK.q = e.target.value.trim(); clearTimeout(drawTrack.t); drawTrack.t = setTimeout(find, 200); };
    find();
    const bindPS = () => {
      const re = () => { const y = scrollY; $('co-ps').innerHTML = progSum(); bindPS(); scrollTo(0, y); };
      document.querySelectorAll('.ps-seg button, .pm').forEach((bt) => (bt.onclick = () => { const y = scrollY; PS.line = bt.dataset.l; PS.open = ''; TK.open = null; drawTrack(); scrollTo(0, y); }));
      document.querySelectorAll('#co-ps [data-ex]').forEach((el) => { const go = () => { PS.open = PS.open === el.dataset.ex ? '' : el.dataset.ex; re(); const e = document.querySelector('.ps-exp'); if (e && PS.open) e.scrollIntoView({ block: 'nearest' }); };
        el.onclick = go; el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } }; });
      document.querySelectorAll('#co-ps th[data-xs] button').forEach((b) => (b.onclick = () => { const x = b.parentNode.dataset.xs; if (PS.sk === x) PS.dir = -PS.dir; else { PS.sk = x; PS.dir = x === 'due' ? 1 : -1; } re(); }));
    };
    $('co-ps').innerHTML = progSum(); bindPS();
  }

  /* ---------- #cal 납기 캘린더 ---------- */
  const monday = (s) => { const d = new Date(s + 'T00:00:00Z'), w = (d.getUTCDay() + 6) % 7; return CT.addD(s, -w); };
  function calDay(d) {
    const act = L.filter((o) => CT.isOpen(o) && !CT.isStale(o));
    const P = act.filter((o) => o.needProd === d && (o.ful === '생산 전' || o.ful === '생산 중'));
    const S = act.filter((o) => o.due === d);
    const rk = [...new Set(P.concat(S).filter((o) => o.risk === '위험').map((o) => o.id))].length;
    return { P, S, rk };
  }
  const shipT = (o) => (o.pl === 'G' ? o.unshipT || 0 : o.remT || 0);
  function viewCal() {
    // 11/5 사용자 '납기캘린더 수정': 4주 넘기기 → 월 단위 달력(달 경계에서 끊음) · 이번 달 합계 · 날마다 도금/컬러 나눠 톤 크게
    const asOf = M.asOf, m0 = CT.addD(asOf.slice(0, 7) + '-15', 30.4 * calOff | 0).slice(0, 7), first = m0 + '-01';
    const last = CT.addD(CT.addD(first, 40).slice(0, 7) + '-01', -1), lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const both = CT.inScope('G') && CT.inScope('C');
    const split = (A, tf) => ['G', 'C'].filter((p) => CT.inScope(p)).map((p) => { const X = A.filter((o) => o.pl === p); return { p, n: X.length, t: sum(X, tf) }; });
    let cells = '', mP = [], mS = [], mR = new Set();
    for (let i = 0; i < lead; i++) cells += '<div class="co-cd blank" aria-hidden="true"></div>';
    for (let d = first; d <= last; d = CT.addD(d, 1)) {
      const c = calDay(d), past = d < asOf, today = d === asOf, wk = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
      mP = mP.concat(c.P); mS = mS.concat(c.S); c.P.concat(c.S).filter((o) => o.risk === '위험').forEach((o) => mR.add(o.id));
      const has = c.P.length || c.S.length;
      const line = (cls, ic, nm, A, tf) => (A.length ? `<div class="mk ${cls}"><i>${ic}</i>${nm} <b>${n0(sum(A, tf))}t</b> <span>${A.length}건</span>${both ? `<div class="pp">${split(A, tf).filter((x) => x.n).map((x) => `<span class="pl ${x.p}">${x.p === 'G' ? '도금' : '컬러'} ${n0(x.t)}t</span>`).join('')}</div>` : ''}</div>` : '');
      cells += `<div class="co-cd${today ? ' td' : ''}${past ? ' ps' : ''}${wk > 4 ? ' we' : ''}${has ? ' ck' : ''}" data-d="${d}"${has ? ` role="button" aria-label="${md(d)} 주문 ${c.P.length + c.S.length}건"` : ''}>`
        + `<div class="dt"><b>${+d.slice(8)}</b><span>${wd(d)}</span>${today ? '<em>오늘</em>' : ''}${c.rk ? `<em class="rk">지연 ${c.rk}</em>` : ''}</div>`
        + line('p', '■', '생산', c.P, (o) => o.remT) + line('s', '▲', '출하', c.S, shipT) + '</div>';
    }
    const kp = CT.kpis([
      { label: `${+m0.slice(5)}월 생산요청`, v: n0(sum(mP, (o) => o.remT)), unit: 't', tone: 'info', sub: `${n0(mP.length)}건${both ? ' · ' + split(mP, (o) => o.remT).map((x) => `${x.p === 'G' ? '도금' : '컬러'} ${n0(x.t)}t`).join(' · ') : ''}` },
      { label: `${+m0.slice(5)}월 출하완료`, v: n0(sum(mS, shipT)), unit: 't', tone: 'info', sub: `${n0(mS.length)}건${both ? ' · ' + split(mS, shipT).map((x) => `${x.p === 'G' ? '도금' : '컬러'} ${n0(x.t)}t`).join(' · ') : ''}` },
      { label: '지연 예상', v: n0(mR.size), unit: '건', tone: mR.size ? 'bad' : 'ok', sub: '이 달 생산요청·출하완료 주문 중' },
    ]);
    return kp + `<div class="co-calh"><button type="button" class="lnk" id="co-prev" aria-label="이전 달">◀ 이전 달</button><b>${m0.slice(0, 4)}년 ${+m0.slice(5)}월</b>`
      + `<button type="button" class="lnk" id="co-next" aria-label="다음 달">다음 달 ▶</button>${calOff ? '<button type="button" class="lnk" id="co-now">이번 달</button>' : ''}`
      + '<span class="co-lg"><i class="p">■</i> 생산 = 생산요청일(남은 t) · <i class="s">▲</i> 출하 = 출하완료일(미출하 t) · <i class="r">지연 n</i> = 지연 예상</span></div>'
      + `<div class="co-cal"><div class="co-wh">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<div>${x}</div>`).join('')}</div><div class="co-cg">${cells}</div></div>` + shipNote().replace('co-sn"', 'co-sn" style="margin:12px 2px 0"');
  }
  function dayPanel(d) {
    const c = calDay(d);
    const tbl = (A, t, tf) => (A.length ? `<h4>${t} ${A.length}건 · ${n0(sum(A, tf))}t</h4><table class="ct-t"><tbody>${A.sort(CT.riskSort).map((o) => `<tr class="ck" data-id="${esc(o.id)}"><td>${CT.badge(o)}</td><td class="id">${esc(o.id)}<small>${esc(o.grp)} · ${esc(plName(o))}</small></td><td class="r">${n1(tf(o))}t</td></tr>`).join('')}</tbody></table>` : '');
    CT.panel(tbl(c.P, '■ 생산요청', (o) => o.remT) + tbl(c.S, '▲ 출하완료', shipT), `${md(d)}(${wd(d)}) 주문`, (p) => {
      p.querySelectorAll('tr.ck').forEach((tr) => { tr.onclick = () => { const o = byId[tr.dataset.id]; if (o) CT.panel(CT.orderDetail(o), o.id); }; });
    });
  }
  function bindCal() {
    const re = () => { $('co-body').innerHTML = viewCal(); bindCal(); };
    $('co-prev').onclick = () => { calOff--; re(); }; $('co-next').onclick = () => { calOff++; re(); };
    const nw = $('co-now'); if (nw) nw.onclick = () => { calOff = 0; re(); };
    document.querySelectorAll('.co-cd.ck').forEach((el) => { el.onclick = () => dayPanel(el.dataset.d); });
    CT.keyRows($('co-body'));
  }

  /* ---------- 공통 ---------- */
  function render(D) {
    D0 = D; M = CT.orders(D);
    RS = D.risk && D.risk.groups ? Object.fromEntries(D.risk.groups.flatMap((g) => g.rows.map((r) => [g.pl + '|' + r[0], r[6]]))) : null;
    L = M.all.filter((o) => CT.inScope(o.pl));
    byId = Object.fromEntries(M.all.map((o) => [o.id, o]));
    const v = CT.view('track', VIEWS);   // # 없음·옛 #status·#risk → 주문진도
    const cg = D.cg_order_progress, cc = D.cc_order_progress;
    const basis = CT.basis([
      cg && { name: '도금 주문', at: cg.asOf, kind: '실적·재계획' },
      cc && { name: '컬러 주문', at: cc.asOf, kind: (cc.lines || []).join('·') },
      ...(M.ccMissing || []).map((l) => ({ name: l, at: null, ok: false, tip: '작업지시대상 자료 없음' })),
    ]);
    if (v === 'cal') { $('ct-main').innerHTML = basis + `<section class="card co-card co-cal" id="co-body">${viewCal()}</section>`; bindCal(); }
    else { $('ct-main').innerHTML = basis + '<div class="rk" id="ot" style="margin-top:12px"></div>'; drawTrack(); }
    document.title = `${v === 'cal' ? '납기 캘린더' : '주문진도'} · 주문·납기`;
  }
  CT.onView(() => { if (D0) { CT.panel(null); render(D0); } });
  CT.boot(['cg_order_progress.enc.json', 'cc_order_progress.enc.json', 'cg_calendar.enc.json', 'risk.enc.json'], render);
})();
