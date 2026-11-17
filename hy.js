/* 02 현황(11/17 사용자 '수주 화면을 이 화면으로 대체' — 사장님용 한 장, '깔끔하게 · 한 화면에 다 크게 박지 말고')
   도금 | 컬러 × 판매 · 생산 · 소재 · 출하 · 소재 재고 · 제품 재고 · 주문충당량 — 숫자(톤 · %)와 막대만, 설명 문구 없음
   숫자 = suju.enc.json 의 hy(tools/suju_build.py hyeonhwang, 2시간 갱신마다 계산)
   · 판매 = 수주 ÷ 판매계획(컬러는 계획재 제외) · 생산 = 판생속보 누계 실적 ÷ 월차계획, 옅은 막대 = 남은 계획(01 일별 가동계획), 이달 예상 = 실적 + 남은 계획(도금은 최근 2주 편차만큼 범위)
   · 소재 = 이달 입고 ÷ 이달 입고 발주 · 출하 = 재고 흐름 기준 출하 ÷ 이달 출하 계획
   · 재고 = 지금(●) → 월말 예상(○), 세로선 = '27 판생 월말 최대 · 주문충당량 = 소재 매치된 주문(컬러 = 판생속보 충당량·작업지시 가능일)
   막대·글자는 HTML(div) — SVG 글자는 공통 테마(svg text 13.5px)에 덮이고 폭 따라 작아져서 쓰지 않음(검토 11/17) */
(function () {
  'use strict';
  const { esc, n0 } = CT;
  const pct = (a, b) => (a != null && b ? Math.round(a / b * 100) : null);
  const W = (x) => `${Math.max(0, Math.min(100, x)).toFixed(1)}%`;
  const r100 = (x) => n0(Math.round(x / 100) * 100);

  function bar(p, v, cap, td, opt = {}) {
    const a = v.act || 0, pl = v.plan, mx = opt.max || pl || 1;
    return `<div class="hy-row"><div class="hy-num"><b>${n0(a)}</b><small>톤</small><b class="pc">${pct(a, pl) ?? '–'}<small>%</small></b></div>
<div class="hy-trk ${p}">${opt.rem ? `<i class="rm" style="width:${W((a + opt.rem) / mx * 100)}"></i>` : ''}<i class="fl" style="width:${W(a / mx * 100)}"></i>
<i class="td" style="left:${W((opt.tdBase || pl) / mx * td * 100)}"></i>${opt.tgt ? `<i class="tg" style="left:${W(pl / mx * 100)}"></i>` : ''}</div>
<div class="hy-cap">${opt.est ? `<span>이달 예상 <b>${opt.est}</b></span>` : '<span></span>'}<span>${esc(cap)} ${n0(pl)}톤</span></div></div>`;
  }
  function prod(p, v, td) {
    const a = v.act || 0, rem = v.rem || 0, pl = v.plan || 0, mx = Math.max(a + rem, pl) * 1.03;
    const [lo, hi] = v.est || [];
    const est = lo == null ? null : lo === hi ? `${r100(lo)}톤` : `${r100(lo)}~${r100(hi)}톤`;
    return bar(p, v, '목표', td, { max: mx, rem, tgt: true, tdBase: pl, est });
  }
  function stock(v) {
    const { now: a, end: e, cap } = v; if (a == null || !cap) return '<div class="hy-na">자료 없음</div>';
    const mx = Math.max(a, e || 0, cap) * 1.1, xa = a / mx * 100, xe = (e || 0) / mx * 100, xc = cap / mx * 100, close = Math.abs(xa - xe) < 3;
    const L = Math.min(xa, xe), R = Math.max(xa, xe);
    return `<div class="hy-row"><div class="hy-num sk"><span class="hlb">지금</span><b class="${a > cap ? 'bad' : ''}">${n0(a)}<small>톤</small> ${pct(a, cap)}%</b><span class="ar">→</span><span class="hlb">월말</span><b class="${e > cap ? 'bad' : ''}">${n0(e)}<small>톤</small> ${pct(e, cap)}%</b></div>
<div class="hy-zone"><i class="ok" style="width:${W(xc)}"></i><i class="ov" style="left:${W(xc)}"></i><i class="cp" style="left:${W(xc)}"></i>
${close ? '' : `<i class="ln" style="left:${W(L)};width:${W(R - L)}"></i>`}<i class="de${e > cap ? ' bad' : ''}" style="left:${W(xe)}"></i><i class="dn${a > cap ? ' bad' : ''}" style="left:${W(xa)}"></i></div>
<div class="hy-cap"><span></span><span>상한 ${n0(cap)}톤</span></div></div>`;
  }
  const cover = (L) => `<div class="hy-cv">${(L || []).map((x) => `<div class="c${x.days != null && x.days < 7 ? ' r' : ''}"><div class="n">${esc(x.line)}</div><div class="v">${n0(x.t)}<small>톤</small></div><div class="d">${x.days != null ? x.days + '일치' : '–'}</div></div>`).join('')}</div>`;

  function render(D) {
    const S = D.suju || {}, H = S.hy, m = document.getElementById('ct-main');
    if (!H) { m.innerHTML = '<section class="card"><h2>현황 자료가 아직 없습니다</h2><p>다음 2시간 갱신 때 만들어집니다.</p></section>'; return; }
    const td = H.day / H.nDays, mo = +H.asOf.slice(5, 7), dd = `${mo}/${+H.asOf.slice(8)}`;
    const R = [
      ['판매', '수주 ÷ 판매계획', (p) => bar(p, H[p].sales, H[p].sales.note ? `판매계획(${H[p].sales.note})` : '판매계획', td)],
      ['생산', '실적 ÷ 목표', (p) => prod(p, H[p].prod, td)],
      ['소재', '입고 ÷ 발주', (p) => bar(p, H[p].mat, `${mo}월 입고 발주`, td)],
      ['출하', '출하 ÷ 계획', (p) => bar(p, H[p].ship, '이달 계획', td)],
      ['소재 재고', '지금 → 월말', (p) => stock(H[p].stockMat)],
      ['제품 재고', '지금 → 월말', (p) => stock(H[p].stockPdt)],
      ['주문충당량', '소재 매치 주문', (p) => cover(H[p].cover)],
    ];
    m.innerHTML = `<div class="hy-top"><h1>${mo}월 판매·생산 현황</h1><span>${dd}까지</span></div>
<div class="hy-g"><div></div><div class="hd g">도금</div><div class="hd c">컬러</div>
${R.map(([a, b, f]) => `<div class="sec"><b>${a}</b><small>${b}</small></div><div class="cell" data-pl="도금 · ${a}">${f('G')}</div><div class="cell" data-pl="컬러 · ${a}">${f('C')}</div>`).join('')}</div>
<div class="hy-lg"><span><i class="k-g"></i>도금 실적</span><span><i class="k-c"></i>컬러 실적</span><span><i class="k-rm"></i>남은 계획</span><span><i class="k-tg"></i>목표</span><span><i class="k-td"></i>오늘</span><span>● 지금 · ○ 월말</span><span><i class="k-ov"></i>상한 초과</span><span class="bad">빨강 = 7일치 미만</span></div>`;
  }
  CT.boot(['suju.enc.json'], render);
})();
