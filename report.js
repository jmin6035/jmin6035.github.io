/* 임원 보고용 주간 보고서: published/weekly_report.enc.json(분석 암호).
   구성: ① 한 장 요약(구분별 상태·핵심 수치·판단·조치) + 결정 필요 사항
         ② 도금 ③ 컬러 ④ 출하 ⑤ 재고 — 각 절은 "결론 한 줄 → 핵심 그래프 2개 → 상세(접힘)"
   데이터는 tools/weekly_build.py(cgl-weekly v2), 해설은 notes(summary·decisions·plating·color·ship·stock·ops). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const n1 = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const n3 = (v) => (v == null || isNaN(v) ? '-' : v.toFixed(3));
  const kt = (v) => (v == null || isNaN(v) ? '-' : (Math.round(v / 100) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '천t');
  const pct = (a, b) => (b ? (a / b - 1) * 100 : null);
  const rate = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const sgn = (v, f = n0) => (v == null || isNaN(v) ? '-' : (v > 0 ? '+' : v < 0 ? '−' : '') + f(Math.abs(v)));
  const delta = (d, goodUp = true) => {
    if (d == null || isNaN(d)) return '<span class="delta flat">-</span>';
    const flat = Math.abs(d) < 0.5, cls = flat ? 'flat' : ((d > 0) === goodUp ? 'up' : 'down');
    return `<span class="delta ${cls}">${flat ? '보합' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + '%'}</span>`;
  };
  const md = (s) => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const SER = ['--s1', '--s2', '--s3', '--s4'];
  const ST = { good: '양호', warn: '주의', bad: '조치 필요' };
  const chip = (s) => (s && ST[s] ? `<span class="st ${s}">${ST[s]}</span>` : '');

  // ---------- 그래프(인라인 SVG) ----------
  const niceStep = (raw) => UI.niceStep(raw);                 // 눈금 간격 = 전 화면 공통(1·2·5 × 10^k)
  function legend(series) {
    return `<div class="legend">${series.map((s, k) => `<span><i class="${s.box ? 'box' : ''} ${s.dash ? 'dash' : ''}" style="background:${s.color || `var(${SER[k]})`}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  function attachTip(el, svg, W, xs, html) {
    const tip = el.querySelector('.tip');
    svg.querySelectorAll('.hb').forEach((b) => {
      b.addEventListener('mousemove', () => {
        const i = +b.dataset.i, r = svg.getBoundingClientRect();
        tip.innerHTML = html(i); tip.style.display = 'block';
        tip.style.left = Math.max(0, Math.min((xs(i) / W) * r.width + 12, r.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = '24px';
      });
      b.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }
  // 선 그래프: refs = 기준선(목표 등), 마지막 점 라벨
  function lineChart(el, { x, series, unit = '', fmt = n0, yMin, H = 230, refs = [], legendOn = true }) {
    // 끝 라벨 길이만큼 오른쪽 여백을 잡아 옆 칸을 침범하거나 잘리지 않게(한글 ≈ 11, 숫자·기호 ≈ 6.6 단위)
    const tw = (t) => [...String(t)].reduce((a, c) => a + (/[가-힣]/.test(c) ? 11 : 6.6), 0);
    const lastV = (s_) => { for (let j = s_.v.length - 1; j >= 0; j--) if (s_.v[j] != null) return s_.v[j]; return null; };
    const W = 520, L = 48, T = 12, B = 26;
    const R = Math.max(56, 16 + Math.max(0, ...series.map((s_) => tw(`${legendOn ? '' : s_.name + ' '}${fmt(lastV(s_))}`))));
    const vals = series.flatMap((s) => s.v.filter((v) => v != null)).concat(refs.map((r) => r.v));
    let lo = yMin != null ? yMin : Math.min(...vals), hi = Math.max(...vals);
    if (yMin == null) { const pad = (hi - lo) * 0.15 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad; } else hi *= 1.1;
    const step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (i) => L + (x.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (x.length - 1));
    const Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="var(--ink-3)">${fmt(v)}</text>`;
    const every = Math.ceil(x.length / 7);
    x.forEach((d, i) => { const last = i === x.length - 1; if ((i % every === 0 && !(i < x.length - 1 && X(x.length - 1) - X(i) < tw(d) + 8)) || last) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="13" fill="var(--ink-3)">${esc(d)}</text>`; });   // 11/10 점검: 마지막 날짜와 겹치는 눈금 글자 빼기('11/611/8')
    refs.forEach((r) => {
      g += `<line x1="${L}" x2="${W - R}" y1="${Y(r.v)}" y2="${Y(r.v)}" stroke="${r.color || 'var(--down)'}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
      // 목표 글자는 선이 지나가지 않는 자리(오른쪽 위 → 오른쪽 아래 → 왼쪽 위 → 왼쪽 아래)에
      const lab = `${r.name} ${fmt(r.v)}`, w_ = tw(lab), y0 = Y(r.v);
      const yAt = (s_, xx) => { const n = s_.v.length; if (n < 2) return null; const t = (xx - L) / ((W - L - R) / (n - 1)); const i = Math.max(0, Math.min(n - 2, Math.floor(t))); const a = s_.v[i], b2 = s_.v[i + 1]; if (a == null || b2 == null) return null; return Y(a + (b2 - a) * Math.min(1, Math.max(0, t - i))); };
      const hit = (x0, x1, yt, yb) => series.some((s_) => { for (let xx = x0; xx <= x1; xx += 4) { const yy = yAt(s_, xx); if (yy != null && yy >= yt - 2 && yy <= yb + 2) return true; } return false; });
      const cands = [[W - R - 4 - w_, y0 - 5], [W - R - 4 - w_, y0 + 14], [L + 4, y0 - 5], [L + 4, y0 + 14]];
      const pos = cands.find(([x0, yb]) => !hit(x0, x0 + w_, yb - 11, yb)) || cands[0];
      g += `<text x="${pos[0]}" y="${pos[1]}" font-size="13" font-weight="600" fill="${r.color || 'var(--down)'}" paint-order="stroke" stroke="var(--surface)" stroke-width="4" stroke-linejoin="round">${esc(lab)}</text>`;
    });
    const ends = series.map((s, k) => { let j = s.v.length - 1; while (j >= 0 && s.v[j] == null) j--; return { k, j, y: j >= 0 ? Y(s.v[j]) : null }; }).filter((e) => e.y != null).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 17) ends[i].y = ends[i - 1].y + 17;
    series.forEach((s, k) => {
      const col = s.color || `var(${SER[k]})`;
      let d = '', pen = false;
      s.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
      g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      if (s.dots) s.v.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${col}"/>`; });
      const e = ends.find((z) => z.k === k);
      if (e) {
        g += `<circle cx="${X(e.j)}" cy="${Y(s.v[e.j])}" r="4.2" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
        g += `<text x="${X(e.j) + 8}" y="${e.y + 4}" font-size="13" font-weight="600" fill="var(--ink)" paint-order="stroke" stroke="var(--surface)" stroke-width="4" stroke-linejoin="round">${legendOn ? '' : esc(s.name) + ' '}${fmt(s.v[e.j])}</text>`;
      }
    });
    x.forEach((_, i) => { const w = (W - L - R) / Math.max(1, x.length - 1); g += `<rect class="hb" data-i="${i}" x="${X(i) - w / 2}" y="${T}" width="${w}" height="${H - T - B}" fill="transparent"/>`; });
    el.innerHTML = (legendOn ? legend(series) : '') + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))} 추이">${g}</svg><div class="tip"></div>`;
    attachTip(el, el.querySelector('svg'), W, X, (i) => `<div class="muted">${esc(x[i])}</div>` + series.map((s, k) => `<div><span class="sw" style="background:${s.color || `var(${SER[k]})`}"></span>${esc(s.name)} <b>${fmt(s.v[i])}</b> ${unit}</div>`).join(''));
  }
  // 누적 막대: 막대 위에 합계 표시, hi = 강조할 막대 번호
  function stackChart(el, { x, cats, data, unit = '', fmt = n0, totalFmt, H = 230, hi = [] }) {
    const W = 520, L = 44, R = 10, T = 16, B = 26;
    const tot = data.map((row) => cats.reduce((a, c) => a + (row[c] || 0), 0));
    const step = niceStep(Math.max(...tot, 1) / 4), top = Math.ceil(Math.max(...tot, 1) / step) * step || 1;
    const bw = Math.min(30, ((W - L - R) / x.length) * 0.64);
    const X = (i) => L + ((i + 0.5) * (W - L - R)) / x.length;
    const Y = (v) => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="13" fill="var(--ink-3)">${fmt(v)}</text>`;
    const every = Math.ceil(x.length / 8);
    const keep = new Set(); { let nx = Infinity; for (let i = x.length - 1; i >= 0; i--) if ((i % every === 0 || i === x.length - 1 || hi.includes(i)) && nx - X(i) >= 38) { keep.add(i); nx = X(i); } }   // 11/10 점검: 날짜 글자 겹침('10/20/21') — 뒤에서부터 간격 38 이상만
    const LBL = (i) => keep.has(i);
    data.forEach((row, i) => {
      let acc = 0;
      cats.forEach((c, k) => {
        const v = row[c] || 0; if (v <= 0) return;
        const y0 = Y(acc), y1 = Y(acc + v); acc += v;
        g += `<rect x="${X(i) - bw / 2}" y="${y1 + 0.5}" width="${bw}" height="${Math.max(0, y0 - y1 - 1)}" fill="var(${SER[k]})"/>`;
      });
      const show = x.length <= 14 || hi.includes(i) || i === x.length - 1;
      if (show && tot[i] > 0) g += `<text x="${X(i)}" y="${Y(tot[i]) - 4}" text-anchor="middle" font-size="10.5" ${hi.includes(i) ? 'font-weight="700" fill="var(--ink)"' : 'fill="var(--ink-2)"'}>${(totalFmt || fmt)(tot[i])}</text>`;
      if ((i % every === 0 || i === x.length - 1 || hi.includes(i)) && LBL(i)) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="13" fill="var(--ink-3)">${esc(x[i])}</text>`;
      g += `<rect class="hb" data-i="${i}" x="${X(i) - (W - L - R) / x.length / 2}" y="${T}" width="${(W - L - R) / x.length}" height="${H - T - B}" fill="transparent"/>`;
    });
    el.innerHTML = legend(cats.map((c) => ({ name: c, box: true }))) + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cats.join(', '))} 누적">${g}</svg><div class="tip"></div>`;
    attachTip(el, el.querySelector('svg'), W, X, (i) => `<div class="muted">${esc(x[i])} · 합계 <b>${fmt(tot[i])}</b> ${unit}</div>` + cats.map((c, k) => `<div><span class="sw" style="background:var(${SER[k]})"></span>${esc(c)} <b>${fmt(data[i][c] || 0)}</b></div>`).join(''));
  }
  // 진도 막대(HTML): 막대 = 실적/현재, 세로선 = 기준(일정누계·목표), 옅은 막대 = 월 전체 계획
  function bullets(rows, { mode }) {
    const max = Math.max(...rows.map((r) => Math.max(r.v || 0, (r.ref || 0) * (mode === 'stock' ? 1 : 1.25)))) * 1.05 || 1;
    return `<div class="bul">${rows.map((r) => {
      const w = (v) => Math.max(0, Math.min(100, ((v || 0) / max) * 100)).toFixed(1);
      const rt = r.ref ? (r.v / r.ref) * 100 : null;
      let cls = 'ok';
      if (rt != null) cls = mode === 'stock' ? (rt > 130 ? 'bad' : rt > 110 || rt < 80 ? 'warn' : 'ok') : UI.rate(rt);   // 달성률 색 = 공통 기준(ui/shell.js UI.rate)
      if (r.ref == null) cls = 'na';
      const right = mode === 'stock'
        ? (r.ref == null ? `<b>${n0(r.v)}</b>t <span class="muted">목표 없음</span>` : `<b>${n0(r.v)}</b>t <span class="muted">/ 목표 ${n0(r.ref)}</span> <span class="pc ${cls}">${Math.round(rt)}%</span>`)
        : `<b>${n0(r.v)}</b>t <span class="muted">/ 일정 ${n0(r.ref)}</span> <span class="pc ${cls}">${rt == null ? '-' : Math.round(rt) + '%'}</span>`;
      return `<div class="bul-row${r.total ? ' total' : ''}"><div class="bul-l">${esc(r.name)}</div><div class="bul-track">` +
        (r.full ? `<div class="bul-full" style="width:${w(r.full)}%"></div>` : '') +
        `<div class="bul-bar ${cls}" style="width:${w(r.v)}%"></div>` +
        (r.ref != null ? `<div class="bul-ref" style="left:${w(r.ref)}%"></div>` : '') +
        `</div><div class="bul-r">${right}</div></div>`;
    }).join('')}</div>`;
  }

  // ---------- 화면 ----------
  const notes = (arr) => (arr && arr.length ? `<ul class="notes">${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
  const box = (id, title, sub) => `<div class="chart" id="${id}"><p class="ttl">${esc(title)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ''}</p><div class="cv"></div></div>`;
  const draw = (id, f) => { const el = $(id); if (el) f(el.querySelector('.cv')); };
  const more = (title, body) => `<details class="more"><summary>${esc(title)}</summary><div class="more-b">${body}</div></details>`;
  function section(num, title, sm, body, pl) {
    return `<section class="card"${pl ? ` data-pl="${pl}"` : ''}><h2><span class="n">${num}</span>${esc(title)} ${chip(sm && sm.status)}</h2>` +
      (sm && sm.msg ? `<p class="lead">${esc(sm.msg)}</p>` : '') + body + '</section>';
  }

  const plN = (nm) => (/컬러/.test(nm) ? 'C' : /도금/.test(nm) ? 'G' : 'GC');
  let lastO = null;
  function render(o) {
    lastO = o;
    const P = o.period, N = o.notes || {}, S = o.sections;
    const M = S.month, ST_ = S.stock, pl = S.plating, pa = S.plan, co = S.color, sh = S.ship;
    const w1 = `${md(P.w1[0])}~${md(P.w1[1])}`;
    const asOf = (M && M.asOf) || (ST_ && ST_.asOf);
    const asOfS = asOf ? md(asOf) : md(P.to);
    const MN = (() => { const a_ = String((M && M.asOf) || P.to || ''), m_ = +a_.slice(5, 7), d_ = +a_.slice(8, 10); return d_ > 1 ? m_ : (m_ + 10) % 12 + 1; })();   // 11/10 점검: '10월' 고정 글자 → 속보 달(속보는 전날까지)
    const h1 = document.querySelector('.shell-head h1'); if (h1) h1.textContent = `주간 보고 — ${o.title || w1}`;
    document.title = `주간 보고 ${o.title || w1}`;
    UI.sub(`주간 실적 ${w1} · 월 진도·재고 ${asOfS} 기준 · 작성 ${UI.fmtDate(o.createdAt)}`);
    const sm = {}; (N.summary || []).forEach((x) => { sm[x.area] = x; });
    const prod = (name) => M && M.prod.find((x) => x.line === name);
    const shipT = M && M.ship.find((x) => x.name === '합계');
    const stk = (name) => ST_ && ST_.now && ST_.now.find((x) => x.name === name);
    const sumC = (rows, k) => rows.reduce((a, r) => a + r[k].tpd, 0);

    // 상태 기본값(해설이 없을 때): 진도·목표 대비 비율로
    const auto = (r) => (r == null || isNaN(r) ? null : { ok: 'good', warn: 'warn', bad: 'bad' }[UI.rate(r)]);   // 달성률 판정 = 공통 기준(UI.rate 98·90)
    const pG = prod('도금 계'), pC = prod('컬러 계');
    const cp = stk('컬러 제품'), gm = stk('도금 소재(F/H)');
    const K = {
      plating: { name: '도금 생산', key: [pG ? `${MN}월 누계 <b>${n0(pG.actual)}</b>t · 일정 대비 <b>${rate(pG.actual, pG.sched)}%</b>` : '', pa ? `4분기 누적 계획 대비 <b>${sgn(pa.actualT - pa.planT)}</b>t` : ''], st: auto(pG && pG.actual / pG.sched * 100, 98, 90) },
      color: { name: '컬러 생산', key: [pC ? `${MN}월 누계 <b>${n0(pC.actual)}</b>t · 일정 대비 <b>${rate(pC.actual, pC.sched)}%</b>` : '', co ? `지난주 ${n0(sumC(co.rows, 'w1'))}t/일 (12주 평균 대비 ${sgn(pct(sumC(co.rows, 'w1'), sumC(co.rows, 'w0')), n1)}%)` : ''], st: auto(pC && pC.actual / pC.sched * 100, 98, 90) },
      ship: { name: '출하', key: [shipT ? `${MN}월 누계 <b>${n0(shipT.actual)}</b>t · 일정 대비 <b>${rate(shipT.actual, shipT.sched)}%</b>` : '', (() => { const m = sh && sh.monthly && sh.monthly[sh.monthly.length - 1]; return m ? `${+m.month.slice(5)}월 말일 출하 ${n0(m.lastDay)}t (월의 ${rate(m.lastDay, m.total)}%)` : ''; })()], st: auto(shipT && shipT.actual / shipT.sched * 100, 95, 80) },
      stock: { name: '재고', key: [cp ? `컬러 제품 <b>${n0(cp.current)}</b>t · 목표의 <b>${rate(cp.current, cp.target)}%</b>` : '', gm ? `도금 소재 ${n0(gm.current)}t · 목표의 ${rate(gm.current, gm.target)}%` : ''], st: ST_ && ST_.now ? (ST_.now.some((x) => x.target && x.current / x.target > 1.3) ? 'bad' : ST_.now.some((x) => x.target && x.current / x.target > 1.1) ? 'warn' : 'good') : null },
    };
    let h = '';
    if (o.status && o.status.stale) h += `<div class="stale">⚠ 사내 PC 자동 실행이 하루 넘게 멈춰 있습니다(마지막 자료 ${new Date(o.status.savedAt).toLocaleString('ko-KR')}).</div>`;

    // ① 한 장 요약: 구분별 타일(상태 · 대표 수치 1개 · 진도 막대 · 조치 한 줄) + 결정 필요 사항 카드
    const big = {
      plating: pG && { v: rate(pG.actual, pG.sched), lbl: `${MN}월 일정 대비`, sub: `${n0(pG.actual)}t / 일정 ${n0(pG.sched)}t`, r: pG.actual / pG.sched, x2: pa ? `4분기 누적 계획 대비 ${sgn(pa.actualT - pa.planT)}t` : '' },
      color: pC && { v: rate(pC.actual, pC.sched), lbl: `${MN}월 일정 대비`, sub: `${n0(pC.actual)}t / 일정 ${n0(pC.sched)}t`, r: pC.actual / pC.sched, x2: co ? `지난주 ${n0(sumC(co.rows, 'w1'))}t/일 · 12주 평균 대비 ${sgn(pct(sumC(co.rows, 'w1'), sumC(co.rows, 'w0')), n1)}%` : '' },
      ship: shipT && { v: rate(shipT.actual, shipT.sched), lbl: `${MN}월 출하 일정 대비`, sub: `${n0(shipT.actual)}t / 일정 ${n0(shipT.sched)}t`, r: shipT.actual / shipT.sched, x2: (() => { const m = sh && sh.monthly && sh.monthly[sh.monthly.length - 1]; return m ? `${+m.month.slice(5)}월 말일 하루 출하가 월의 ${rate(m.lastDay, m.total)}%` : ''; })() },
      stock: cp && { v: rate(cp.current, cp.target), lbl: '컬러 제품 재고 · 목표 대비', sub: `${n0(cp.current)}t / 목표 ${n0(cp.target)}t`, r: cp.current / cp.target, over: true, x2: gm ? `도금 소재 ${n0(gm.current)}t · 목표의 ${rate(gm.current, gm.target)}%` : '' },
    };
    let t = '<div class="sum-tiles">';
    ['plating', 'color', 'ship', 'stock'].forEach((a) => {
      const k = K[a], s = sm[a] || {}, B = big[a], st = s.status || k.st;
      const w = B ? Math.min(100, B.r / (B.over ? 2.5 : 1.2) * 100) : 0, mk = B ? (1 / (B.over ? 2.5 : 1.2)) * 100 : 0;
      t += `<div class="sum-tile st-${st || 'none'}"${a === 'plating' ? ' data-pl="G"' : a === 'color' ? ' data-pl="C"' : ''}${s.msg ? ` title="${esc(s.msg)}"` : ''}>
        <div class="sum-h"><b>${k.name}</b>${chip(st) || ''}</div>
        ${B ? `<div class="sum-v">${B.v}<small>%</small></div><div class="sum-l">${B.lbl}</div>
        <div class="sum-bar"><i style="width:${w}%"></i><u style="left:${mk}%"></u></div><div class="sum-s">${B.sub}${B.x2 ? `<br>${B.x2}` : ''}</div>` : `<div class="sum-s">${k.key.filter(Boolean).join(' · ')}</div>`}
        ${s.action ? `<div class="sum-a"><span>조치</span>${esc(s.action)}</div>` : ''}</div>`;
    });
    t += '</div>';
    if (N.decisions && N.decisions.length) t += `<div class="decide2"><h3>결정이 필요한 사항 <small>${N.decisions.length}건</small></h3><div class="dc-grid">${N.decisions.map((x, i) => { const [hd, ...rest] = String(x).split(' — '); return `<div class="dc"><i>${i + 1}</i><div><b>${esc(hd)}</b>${rest.length ? `<p>${esc(rest.join(' — '))}</p>` : ''}</div></div>`; }).join('')}</div></div>`;
    else if (N.headline) t += notes(N.headline);
    h += `<section class="card"><h2><span class="n">요약</span>${esc(o.title || w1)} <small>막대 세로선 = 100%(일정·목표) · 타일에 마우스를 올리면 판단 근거</small></h2>${t}</section>`;

    // ② 도금
    let b = '<div class="grid2">';
    if (M) b += `<div><p class="ttl">${MN}월 진도 <span class="muted">MES 월차계획 · ${asOfS} 기준</span></p>` +
      bullets(M.prod.filter((x) => x.plant === '도금').map((x) => ({ name: x.line, v: x.actual, ref: x.sched, total: /계$/.test(x.line) })), { mode: 'prod' }) +
      `<p class="hint">막대 = 실적 누계 · 세로선 = ${asOfS}까지 일정 · ${MN}월 계획 ${n0(pG && pG.month)}t</p></div>`;
    if (pa) b += box('c-pl-plan', '4분기 누적 생산 — 기준 계획 vs 실적', 't');
    b += '</div>';
    let d = '<div class="scroll"><table class="t"><thead><tr><th>라인</th><th>앞 ' + ((o.period && o.period.nW0) || 12) + '주 평균 t/일</th><th>보고 주 t/일</th><th>증감</th><th>속도 t/hr <span class="muted">정지 포함</span></th><th>평균 두께 mm</th><th>가동일당 휴지 h</th></tr></thead><tbody>' +
      pl.rows.map((r, k) => `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${r.line}</td><td>${n0(r.w0.tpd)}</td><td><b>${n0(r.w1.tpd)}</b></td><td>${delta(r.dTpd)}</td><td>${n1(r.w0.tph)} → ${n1(r.w1.tph)}</td><td>${n3(r.w0.thick)} → ${n3(r.w1.thick)}</td><td>${n1(r.w0.stopH)} → ${n1(r.w1.stopH)}</td></tr>`).join('') + '</tbody></table></div>';
    d += '<div class="grid2">' + box('c-pl-trend', '주별 생산량', 't/일') + '<div>';
    if (pa) d += '<p class="ttl">강종 전환(M/C) 일정</p><div class="scroll"><table class="t"><thead><tr><th>일자</th><th>라인</th><th>전환</th></tr></thead><tbody>' +
      pa.upcomingMC.map((m) => `<tr><td class="l">${md(m.day)}</td><td class="l">${m.line}</td><td class="l">${esc(m.from)} → ${esc(m.to)}</td></tr>`).join('') + '</tbody></table></div>' +
      `<p class="hint">재계획: 납기 지연 ${n0(pa.late)}톤·일 · 결품 ${pa.short.length ? pa.short.length + '건' : '0'} · 잔여 강종 전환 ${pa.remainMC}회</p>`;
    d += '</div></div>';
    if (pa) d += '<p class="ttl" style="margin-top:12px">4분기 부서별 계획 대비 실적</p><div class="scroll"><table class="t"><thead><tr><th>부서</th><th>계획 t</th><th>실적 t</th><th>달성률</th></tr></thead><tbody>' +
      pa.byDept.filter((x) => x[1] || x[2]).map((x) => `<tr><td class="l">${esc(x[0])}</td><td>${n0(x[1])}</td><td><b>${n0(x[2])}</b></td><td>${x[1] ? rate(x[2], x[1]) + '%' : '-'}</td></tr>`).join('') + '</tbody></table></div>';
    const pr = pl.params;
    d += '<p class="ttl" style="margin-top:12px">계획 조건 vs 13주 실적</p><div class="scroll"><table class="t"><thead><tr><th>항목</th>' + Object.keys(pr).map((l) => `<th>${l} 현재 조건</th><th>${l} 실적</th>`).join('') + '</tr></thead><tbody>' +
      [['강종 전환 손실 (분/회)', 'mc'], ['설비정지 (분/일)', 'equipDown'], ['비강종 더미 (분/일)', 'dummy']].map(([nm, k]) =>
        `<tr><td class="l">${nm}</td>` + Object.keys(pr).map((l) => `<td>${n1(pr[l].cur && pr[l].cur[k])}</td><td><b>${n1(pr[l][k])}</b></td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
    b += notes(N.plating) + more('상세 — 라인별 실적·강종 전환 일정·부서별·계획 조건', d);
    h += section('1', '도금 생산 (1·2CGL)', sm.plating || { status: K.plating.st }, b, 'G');

    // ③ 컬러
    if (co) {
      b = '<div class="grid2">';
      if (M) b += `<div><p class="ttl">${MN}월 진도 <span class="muted">MES 월차계획 · ${asOfS} 기준</span></p>` +
        bullets(M.prod.filter((x) => x.plant === '컬러').map((x) => ({ name: x.line, v: x.actual, ref: x.sched, total: /계$/.test(x.line) })), { mode: 'prod' }) + '</div>';
      b += box('c-co-week', '주별 생산량 (라인 누적)', 't/일') + '</div>';
      d = '<div class="scroll"><table class="t"><thead><tr><th>라인</th><th>앞 ' + ((o.period && (o.period.nW0c || o.period.nW0)) || 12) + '주 평균 t/일</th><th>보고 주 t/일</th><th>증감</th><th>가동일</th><th>속도 t/hr <span class="muted">정지 포함</span></th><th>가동일당 휴지 h</th><th>주요 품목 (t)</th></tr></thead><tbody>' +
        co.rows.map((r, k) => `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${r.line}</td><td>${n0(r.w0.tpd)}</td><td><b>${n0(r.w1.tpd)}</b></td><td>${delta(r.dTpd)}</td><td>${r.w1.days}/7</td><td>${n1(r.w0.tph)} → ${n1(r.w1.tph)}</td><td>${n1(r.w0.stopH)} → ${n1(r.w1.stopH)}</td><td class="l">${r.top.map((x) => `${esc(x[0])} ${n0(x[1])}`).join(' · ')}</td></tr>`).join('') + '</tbody></table></div>';
      d += '<div class="grid2">' + box('c-co-stop', '주별 휴지 구성 (4라인 합)', '시간/일') + '<div><p class="ttl">휴지 구성 (4라인 합, 시간/일)</p><div class="scroll"><table class="t"><thead><tr><th>구분</th><th>12주 평균</th><th>보고 주</th><th>증감</th></tr></thead><tbody>' +
        co.stops.map((s, k) => `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${esc(s.cat)}</td><td>${n1(s.w0)}</td><td><b>${n1(s.w1)}</b></td><td>${delta(pct(s.w1, s.w0), false)}</td></tr>`).join('') + '</tbody></table></div></div></div>';
      b += notes(N.color) + more('상세 — 라인별 실적·휴지 구성', d);
      h += section('2', '컬러 생산 (1~4CCL)', sm.color || { status: K.color.st }, b, 'C');
    }

    // ④ 출하
    if (sh || M) {
      b = '<div class="grid2">';
      if (M) b += `<div><p class="ttl">${MN}월 출하 진도 <span class="muted">MES 월차계획 · ${asOfS} 기준</span></p>` +
        bullets(M.ship.filter((x) => x.month).map((x) => ({ name: x.name, v: x.actual, ref: x.sched, total: x.name === '합계' })), { mode: 'prod' }) + '</div>';
      if (sh && sh.daily) b += box('c-ship-day', '최근 4주 일별 판매 출하', 't/일');
      b += '</div>';
      d = '';
      if (sh && sh.monthly && sh.monthly.length) d += '<p class="ttl">월별 판매 출하와 월말 출하 집중</p><div class="scroll"><table class="t"><thead><tr><th>월</th><th>판매 출하 t</th><th>1~5일</th><th>말일 출하</th><th>말일 비중</th></tr></thead><tbody>' +
        sh.monthly.map((m) => `<tr><td class="l">${+m.month.slice(5)}월</td><td>${n0(m.total)}</td><td>${n0(m.first5)}</td><td><b>${n0(m.lastDay)}</b></td><td><b>${rate(m.lastDay, m.total)}%</b></td></tr>`).join('') + '</tbody></table></div>';
      if (sh) d += '<div class="grid2">' + box('c-ship', '주별 출하', 't/일') + '<div><div class="scroll"><table class="t"><thead><tr><th>구분</th><th>12주 평균 t/일</th><th>보고 주 t/일</th><th>증감</th></tr></thead><tbody>' +
        sh.rows.map((r, k) => `<tr><td class="l"><span class="sw" style="background:var(${SER[k]})"></span>${esc(r.kind)}</td><td>${n0(r.w0)}</td><td><b>${n0(r.w1)}</b></td><td>${delta(r.d)}</td></tr>`).join('') + '</tbody></table></div></div></div>';
      b += notes(N.ship) + (d ? more('상세 — 월말 출하 집중·주별 추이', d) : '');
      h += section('3', '출하', sm.ship || { status: K.ship.st }, b);
    }

    // ⑤ 재고
    if (ST_ && (ST_.now || ST_.monthly)) {
      b = '';
      if (ST_.now) {
        b += `<p class="ttl">현재 재고 vs 목표 <span class="muted">판매생산속보 ${asOfS} 기준</span></p>` +
          bullets(ST_.now.filter((x) => UI.inScope(plN(x.name))).map((x) => ({ name: x.name, v: x.current, ref: x.target })), { mode: 'stock' }) +
          '<p class="hint">막대 = 현재 재고 · 세로선 = 목표 재고 · 빨강 = 목표의 130% 초과, 주황 = 110% 초과 또는 80% 미만</p>';
        if (ST_.longTerm) b += `<p class="hint">장기재고(3개월 이상) <b>${n0(ST_.longTerm.total)}</b>t — 컬러 ${n0(ST_.longTerm['컬러'])}t · 도금 ${n0(ST_.longTerm['도금'])}t (전월 대비 제품 ${sgn(ST_.longTerm.momProduct)}t)</p>`;
      }
      if (ST_.monthly && ST_.monthly.length) {
        b += '<p class="ttl" style="margin-top:14px">재고 추이 <span class="muted">월말 재고 + 현재, 점선 = 목표</span></p><div class="minis">' +
          ['컬러 제품', '도금 소재(F/H)', '컬러 소재', '도금 제품'].map((nm, i) => box('c-stk-' + i, nm, '').replace('<div class="chart"', `<div class="chart" data-pl="${plN(nm)}"`)).join('') + '</div>';
      }
      if (ST_.now) {
        d = '<div class="scroll"><table class="t"><thead><tr><th>구분</th><th>세부</th><th>목표 t</th><th>현재 t</th><th>차이 t</th></tr></thead><tbody>' +
          ST_.now.filter((x) => UI.inScope(plN(x.name))).map((x) => [`<tr><td class="l"><b>${esc(x.name)}</b></td><td class="l">계</td><td>${n0(x.target)}</td><td><b>${n0(x.current)}</b></td><td>${sgn(x.diff)}</td></tr>`]
            .concat((x.sub || []).map((s) => `<tr><td></td><td class="l">${esc(s.name)}</td><td>${n0(s.target)}</td><td>${n0(s.current)}</td><td>${sgn(s.diff)}</td></tr>`)).join('')).join('') + '</tbody></table></div>';
        b += notes(N.stock) + more('상세 — 강종·부서별 재고', d);
      } else b += notes(N.stock);
      h += section('4', '재고', sm.stock || { status: K.stock.st }, b);
    }

    if (N.ops && N.ops.length) h += `<section class="card ops"><h2><span class="n">참고</span>운영 메모</h2>${notes(N.ops)}</section>`;
    $('r-main').innerHTML = h;
    UI.reveal($('r-main'));

    // ---------- 그래프 ----------
    const wl = (arr) => arr.map((x) => md(x.week));
    if (pa) {
      const days = [...new Set(Object.values(pa.cum).flat().map((x) => x.day))].sort();
      const sumBy = (key) => days.map((dd) => Object.values(pa.cum).reduce((a, arr) => { const e = arr.filter((x) => x.day <= dd).pop(); return a + (e ? e[key] : 0); }, 0));
      draw('c-pl-plan', (el) => lineChart(el, { x: days.map(md), unit: 't', yMin: 0, series: [{ name: '계획', v: sumBy('plan'), color: 'var(--plan)', dash: true }, { name: '실적', v: sumBy('actual'), color: 'var(--s1)' }] }));
    }
    const tp = pl.trend, tl = Object.keys(tp);
    draw('c-pl-trend', (el) => lineChart(el, { x: wl(tp[tl[0]]), unit: 't/일', series: tl.map((l) => ({ name: l, v: tp[l].map((x) => x.tpd) })) }));
    if (co) {
      const ctp = co.trend, cl = Object.keys(ctp);
      draw('c-co-week', (el) => stackChart(el, { x: wl(ctp[cl[0]]), unit: 't/일', cats: cl, data: ctp[cl[0]].map((_, i) => Object.fromEntries(cl.map((l) => [l, ctp[l][i].tpd]))), hi: [ctp[cl[0]].length - 1] }));
      draw('c-co-stop', (el) => stackChart(el, { x: wl(co.stopTrend), unit: 'h/일', fmt: n1, cats: co.stops.map((s) => s.cat), data: co.stopTrend }));
    }
    if (sh) {
      if (sh.daily) {
        const cats = ['도금 판매', '컬러 판매'];
        const top = sh.daily.map((x, i) => [i, cats.reduce((a, c) => a + (x[c] || 0), 0)]).sort((a, z) => z[1] - a[1]).slice(0, 1).map((x) => x[0]);
        draw('c-ship-day', (el) => stackChart(el, { x: sh.daily.map((x) => md(x.day)), unit: 't', cats, data: sh.daily, hi: top, totalFmt: n0 }));
      }
      draw('c-ship', (el) => lineChart(el, { x: wl(sh.trend), unit: 't/일', yMin: 0, series: sh.rows.map((r) => ({ name: r.kind, v: sh.trend.map((x) => x[r.kind]) })) }));
    }
    if (ST_ && ST_.monthly && ST_.monthly.length) {
      const ms = ST_.monthly, xs = ms.map((m) => `${+m.month.slice(4)}월말`);
      const now = (nm) => ST_.now && ST_.now.find((x) => x.name === nm);
      const withNow = ST_.now ? xs.concat([asOfS]) : xs;
      const ser = (key, nowName) => ms.map((m) => m[key] ?? null).concat(ST_.now ? [now(nowName) ? now(nowName).current : null] : []);
      const ref = (nm) => { const x = now(nm); return x && x.target ? [{ v: x.target, name: '목표' }] : []; };
      draw('c-stk-0', (el) => lineChart(el, { x: withNow, H: 170, unit: 't', yMin: 0, legendOn: false, refs: ref('컬러 제품'), series: [{ name: '컬러 제품', v: ser('컬러 제품', '컬러 제품'), dots: true }] }));
      draw('c-stk-1', (el) => lineChart(el, { x: withNow, H: 170, unit: 't', yMin: 0, legendOn: false, refs: ref('도금 소재(F/H)'), series: [{ name: '도금 소재', v: ser('도금 소재(F/H)', '도금 소재(F/H)'), dots: true }] }));
      draw('c-stk-2', (el) => lineChart(el, { x: withNow, H: 170, unit: 't', yMin: 0, legendOn: false, refs: ref('컬러 소재'), series: [{ name: '컬러 소재', v: ser('컬러 소재', '컬러 소재'), dots: true, color: 'var(--s3)' }] }));
      draw('c-stk-3', (el) => lineChart(el, { x: withNow, H: 170, unit: 't', yMin: 0, refs: ref('도금 제품(판매재)'), series: [{ name: '판매재', v: ser('도금 제품(판매재)', '도금 제품(판매재)'), dots: true }, { name: '자가재', v: ser('도금 제품(자가재)', '도금 제품(자가재)'), dots: true, color: 'var(--s4)' }] }));
    }
  }

  // 인쇄할 때는 접힌 상세도 펼침
  window.addEventListener('beforeprint', () => document.querySelectorAll('details.more').forEach((x) => { x.dataset.was = x.open ? '1' : ''; x.open = true; }));
  window.addEventListener('afterprint', () => document.querySelectorAll('details.more').forEach((x) => { x.open = x.dataset.was === '1'; }));

  // ---------- 열기 ----------
  let env = null;
  async function open(pw) {
    $('r-msg').textContent = '여는 중…';
    try {
      const o = await GP.decryptJSON(env, pw);
      if (o.version !== 2) { $('r-msg').innerHTML = '이 보고서는 이전 형식입니다. <a href="analysis.html">분석 화면</a>에서 보세요.'; return; }
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 저장 불가 */ }
      render(o);
      UI.onScope(() => { const y = scrollY; render(lastO); scrollTo(0, y); });
    } catch (e) { $('r-msg').textContent = '⚠ ' + e.message; try { localStorage.removeItem(PW_KEY); } catch (x) { /* 무시 */ } $('r-form').hidden = false; }
  }
  $('r-form').onsubmit = (ev) => { ev.preventDefault(); open($('r-pw').value); };
  const src = new URLSearchParams(location.search).get('src') || 'published/weekly_report.enc.json';
  fetch(src, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('보고서 파일 없음'); return r.json(); }).then((e) => {
    env = e;
    document.querySelector('#r-lock h2').textContent = '주간 보고서 — 분석 암호를 입력하세요';
    $('r-form').hidden = false;
    let saved = null; try { saved = localStorage.getItem(PW_KEY); } catch (x) { saved = null; }
    if (saved) open(saved);
  }).catch((e) => { document.querySelector('#r-lock h2').textContent = '아직 게시된 주간 보고서가 없습니다'; $('r-msg').textContent = e.message; });
})();
