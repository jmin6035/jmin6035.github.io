/* 가동표 공통(11/13 사용자 '생긴 걸 똑같이 맞추라고') — 01 일별 가동계획(gyehoek.js) 표를 그리던 코드를 떼어 낸 것.
   01(gyehoek.js)·월간 가동(supply.js)이 같은 함수로 그림 → 칸·줄·색·범례 위치가 같음. 서식 = ui/optable.css
   OPT.table(ds, V, P, o) — ds = 그 달 날짜들, V = 보일 판 { kind:'now'|…, get(l, d) → 칸 }, P = 비교할 판(월차, 없으면 null)
     칸 = { t 톤, act 실적 날, fam 대표 강종, al {강종: 톤}, mc M/C 날, sd S/D 날, stop '정기수리'|'수리'|'S/D'|'휴지'|'' }
     o = { today, hrs(l, d, c) → 가동시간(없으면 가동시간 줄 없음), cEv(l, d) → [글, 툴팁] 컬러 부분 정지(노랑 칸), tip(l, d, c) → 칸 툴팁 }
     도금 라인 = 첫 강종 행 → 이벤트 행(M/C·S/D 노랑) → 다음 강종 행 → 가동시간 행. 여러 날 정지 = 직전 강종 행에 남색 합친 칸 '이름 (N일)'
     컬러 라인 = 생산 행 + 이벤트 행(부분 정지 노랑, 정지·휴지 남색 합친 칸). 도금·컬러 합계 행. 31일 칸 고정(짧은 달은 끝에 빈 칸)
   OPT.legend(V, P, ds, o) — 표 아래 가운데 범례 · OPT.snap() — 지난 날 덮개·오늘 틀 자리 맞춤(표가 바뀌거나 창 크기가 바뀌면 자동) */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => Math.round(v || 0).toLocaleString('en-US');
  const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wd = (d) => new Date(d + 'T00:00:00').getDay();
  const LINES = { G: ['1CGL', '2CGL'], C: ['1CCL', '2CCL', '3CCL', '4CCL'] };
  const FN = { AZ: 'AZ', AL: 'AL', MAC: 'MACOSTA' }, PL = { '1CGL': ['AL', 'AZ'], '2CGL': ['AL', 'MAC'] };   // 엑셀 양식의 강종 행 이름 · 라인 강종
  const HOL = new Set(['2026-12-25', '2027-01-01']);                      // 공휴일(머리 칸 노랑·빨강)
  const red = (d) => wd(d) % 6 === 0 || HOL.has(d);
  const hfmt = (h) => { const r = Math.round(h * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
  const scope = (p) => (window.UI && UI.inScope ? UI.inScope(p) : true);
  // 앞 판 대비 의미 있게 바뀐 칸: 정지·M/C·강종이 바뀌었거나 톤이 ±20% 이상(50t 이상)
  function differs(c, p, toneOnly) {
    if (!toneOnly) {
      if (c.stop !== p.stop || c.mc !== p.mc) return true;
      if (c.fam && p.fam && c.t >= 0.5 && p.t >= 0.5 && c.fam !== p.fam) return true;
    }
    const df = Math.abs(c.t - p.t);
    return df >= 50 && (p.t < 0.5 || df / p.t >= 0.2);
  }
  // 머리 2줄(날짜 · 요일) + 열 너비 — 다른 '구분 × 날짜' 표도 이 머리를 씀. lab0·lab1 = 왼쪽 두 칸 글(01 은 빈 칸)
  function head(ds, today, lab0, lab1, ti) {
    const dc = (i) => (i === ti ? ' tdy' : '');
    return `<colgroup><col class="c0"><col class="c1">${ds.map(() => '<col>').join('')}<col class="tot"></colgroup><thead>`
      + `<tr><th class="c0" rowspan="2">${lab0 || ''}</th><th class="c1" rowspan="2">${lab1 || ''}</th>${ds.map((d, i) => `<th class="dn${red(d) ? ' we' : ''}${dc(i)}" data-dh="${d}">${+d.slice(8)}</th>`).join('')}<th class="tot" rowspan="2">계</th></tr>`
      + `<tr>${ds.map((d, i) => `<th class="dw${red(d) ? ' we' : ''}${dc(i)}">${WD[wd(d)]}</th>`).join('')}</tr></thead>`;
  }
  // 짧은 달 = 끝에 빈 칸(31일 칸 고정, 달마다 표 크기 같게)
  function pad31(h, n) {
    const pad = 31 - n; if (pad <= 0) return h;
    return h.replace('<col class="tot">', '<col class="pad">'.repeat(pad) + '<col class="tot">').replace('<th class="tot" rowspan="2">', `<th class="padc" rowspan="2" colspan="${pad}"></th><th class="tot" rowspan="2">`).replace(/<td class="tot/g, `<td class="padc" colspan="${pad}"></td><td class="tot`);
  }
  // 표를 감싸는 틀 + 지난 날 덮개 + 오늘 틀
  function wrap(inner, np, ti, cls) {
    return `<div class="gk-wrap"><table class="gk${cls ? ' ' + cls : ''}">${inner}</table>${np ? `<i class="gk-past" data-n="${np}" aria-hidden="true"></i>` : ''}${ti >= 0 ? '<i class="gk-tdy" aria-hidden="true"></i>' : ''}</div>`;
  }

  function table(ds, V, P, o) {
    const today = o.today || '';
    const ti = V.kind === 'now' ? ds.indexOf(today) : -1;
    const dc = (i) => (i === ti ? ' tdy' : '');                            // 오늘 = 굵은 테두리(표 위에 겹친 틀, 합친 칸도 끊지 않음)
    const runs = (key) => { const out = []; for (let i = 0; i < ds.length; i++) { const k = key(i); if (!k) continue; let j = i; while (j + 1 < ds.length && key(j + 1) === k) j++; out.push({ i, j, k }); i = j; } return out; };
    const chgOf = (C, Q, i) => (Q && !C[i].act && differs(C[i], Q[i], P.toneOnly) ? ' chg' : '');
    const empty = (i) => `<td class="e${dc(i)}"></td>`;
    const at_ = (l, i) => `data-c="${l}|${ds[i]}" data-d="${ds[i]}"`;
    const tip = (l, i, c) => { const t = o.tip ? o.tip(l, ds[i], c) : ''; return t ? ` title="${esc(t)}"` : ''; };
    const lab = (nm) => `<span>${esc(nm)}</span>`;                        // 11/12 사용자 '휴지·수리 가운데 맞춤'
    let h = head(ds, today, '', '', ti) + '<tbody>';
    if (scope('G')) {
      const day = ds.map(() => 0);
      for (const l of LINES.G) {
        const C = ds.map((d) => V.get(l, d)), Q = P ? ds.map((d) => P.get(l, d)) : null;
        const fams = [], amt = {}, at = ds.map(() => null), f0 = {};       // at[i] = 그 날까지 마지막 강종(정지 칸을 놓을 '직전 강종 행')
        let prev = null;
        C.forEach((c, i) => {
          const ks = Object.keys(c.al || {}).filter((f) => c.al[f] >= 0.5).sort((a, b) => (a === prev ? -1 : b === prev ? 1 : c.al[b] - c.al[a]));
          for (const f of ks) { if (!amt[f]) { amt[f] = ds.map(() => 0); fams.push(f); f0[f] = i; } amt[f][i] = Math.round(c.al[f]); }
          if (ks.length) prev = ks[ks.length - 1];
          at[i] = prev;
        });
        const SR = runs((i) => C[i].stop).map((r) => {                      // 정지 묶음 → 직전 강종 행(달 첫머리 정지면 그 날 자료의 강종)
          const f = (r.i > 0 && at[r.i - 1]) || C[r.i].fam || fams[0] || (PL[l] || ['AL'])[0];
          if (!amt[f]) { amt[f] = ds.map(() => 0); fams.push(f); }
          f0[f] = Math.min(f0[f] != null ? f0[f] : 99, r.i);
          return Object.assign(r, { f, n: r.j - r.i + 1 });
        });
        if (!fams.length) { const f = C.find((c) => c.fam) ? C.find((c) => c.fam).fam : (PL[l] || ['AL'])[0]; amt[f] = ds.map(() => 0); fams.push(f); }
        fams.sort((a, b) => (f0[a] || 0) - (f0[b] || 0));                  // 강종 행 = 그 달에 먼저 나온 순
        const inStop = ds.map(() => false); SR.forEach((r) => { for (let x = r.i; x <= r.j; x++) inStop[x] = true; });
        const nR = fams.length + (o.hrs ? 2 : 1);
        const famRow = (f, first, last) => {
          let r = `<tr class="gr${first ? ' ls' : ''}${last ? ' le' : ''}">${first ? `<th class="c0 lnG" rowspan="${nR}">${l}</th>` : ''}<th class="c1">${FN[f] || (f === 'X' ? '톤' : f)}</th>`, tot = 0;
          for (let i = 0; i < ds.length; i++) {
            const s = SR.find((x) => x.i === i);
            if (s && s.f === f) {
              const nm = s.k + (s.n > 1 ? ` (${s.n}일)` : '');
              r += `<td class="sp${dc(i)}${chgOf(C, Q, i)}" colspan="${s.j - s.i + 1}" ${at_(l, i)} title="${esc(`${l} ${s.k} ${md(ds[s.i])}${s.j > s.i ? '~' + md(ds[s.j]) : ''}`)}">${lab(nm)}</td>`;
              i = s.j; continue;
            }
            const v = inStop[i] ? 0 : amt[f][i];
            tot += v; day[i] += v;
            r += v ? `<td class="d k${f}${C[i].act ? ' a' : ''}${chgOf(C, Q, i)}${dc(i)}" ${at_(l, i)}${tip(l, i, C[i])}>${n0(v)}</td>` : empty(i);
          }
          return r + `<td class="tot${f === 'AZ' ? ' red' : ''}">${n0(tot)}</td></tr>`;
        };
        let ev = `<tr class="ev${!o.hrs && fams.length === 1 ? ' le' : ''}"><th class="c1"></th>`;
        for (let i = 0; i < ds.length; i++) {
          const c = C[i], t = inStop[i] ? '' : c.mc ? 'M/C' : c.sd ? 'S/D' : '';
          ev += t ? `<td class="y${dc(i)}" ${at_(l, i)}${c.evTip ? ` title="${esc(c.evTip)}"` : ''}>${t}</td>` : empty(i);
        }
        ev += '<td class="tot">-</td></tr>';
        let hr = '';
        if (o.hrs) {
          hr = '<tr class="hr le"><th class="c1">가동시간</th>'; let hs = 0;
          for (let i = 0; i < ds.length; i++) { const v = Math.round(o.hrs(l, ds[i], C[i]) * 10) / 10; hs += v; hr += `<td class="${dc(i).trim()}">${hfmt(v)}</td>`; }
          hr += `<td class="tot">${hfmt(hs)}</td></tr>`;
        }
        const rest = fams.slice(1);
        h += famRow(fams[0], true, false) + ev + rest.map((f, k) => famRow(f, false, !o.hrs && k === rest.length - 1)).join('') + hr;
      }
      h += `<tr class="sum"><th class="c0" colspan="2">도금 합계</th>${day.map((v, i) => `<td class="${dc(i).trim()}">${v ? n0(v) : ''}</td>`).join('')}<td class="tot">${n0(day.reduce((a, v) => a + v, 0))}</td></tr>`;
    }
    if (scope('C')) {
      const day = ds.map(() => 0);
      for (const l of LINES.C) {
        const C = ds.map((d) => V.get(l, d)), Q = P ? ds.map((d) => P.get(l, d)) : null;
        let r = `<tr class="cr ls"><th class="c0 lnC" rowspan="2">${l}</th><th class="c1">생산</th>`, tot = 0;
        for (let i = 0; i < ds.length; i++) {
          const v = C[i].stop ? 0 : Math.round(C[i].t); tot += v; day[i] += v;
          r += v ? `<td class="d kC${C[i].act ? ' a' : ''}${chgOf(C, Q, i)}${dc(i)}" ${at_(l, i)}${tip(l, i, C[i])}>${n0(v)}</td>` : empty(i);
        }
        h += r + `<td class="tot">${n0(tot)}</td></tr>`;
        const SR = runs((i) => C[i].stop);
        let ev = '<tr class="ev le"><th class="c1"></th>';
        for (let i = 0; i < ds.length; i++) {
          const s = SR.find((x) => x.i === i);
          if (s) {
            const n = s.j - s.i + 1, nm = s.k + (n > 1 ? ` (${n}일)` : '');
            ev += `<td class="sp${dc(i)}${chgOf(C, Q, i)}" colspan="${n}" ${at_(l, i)} title="${esc(C[i].stopTip || `${l} ${s.k} ${md(ds[s.i])}${s.j > s.i ? '~' + md(ds[s.j]) : ''}`)}">${lab(nm)}</td>`;
            i = s.j; continue;
          }
          const e = o.cEv ? o.cEv(l, ds[i]) : null;
          ev += e && e[0] ? `<td class="y${dc(i)}" ${at_(l, i)}${e[1] ? ` title="${esc(e[1])}"` : ''}>${esc(e[0])}</td>` : empty(i);
        }
        h += ev + '<td class="tot">-</td></tr>';
      }
      h += `<tr class="sum"><th class="c0" colspan="2">컬러 합계</th>${day.map((v, i) => `<td class="${dc(i).trim()}">${v ? n0(v) : ''}</td>`).join('')}<td class="tot">${n0(day.reduce((a, v) => a + v, 0))}</td></tr>`;
    }
    h = pad31(h, ds.length);
    const np = ds.filter((d) => d < today).length;   // 11/12 사용자 '지난 날은 음영, 미래는 흰색' — 지난 날 열 위에 회색 막(합친 칸도 끊지 않음)
    return wrap(h + '</tbody>', np, ti);
  }
  // 범례(표 아래 가운데): 지난 날이 없는 달은 '지난 날' 뺌 · 가동시간 줄은 색이 없어 뺌
  function legend(V, P, ds, o) {
    const sw = (c, t) => `<span><i class="${c}"></i>${t}</span>`, hasPast = (ds || []).some((d) => d < ((o && o.today) || ''));
    return `<div class="gk-lg">${scope('G') ? sw('kAZ', 'AZ') + sw('kAL', 'AL') + sw('kMAC', 'MACOSTA') : ''}${scope('C') ? sw('kC', '컬러 가동') : ''}${hasPast ? sw('pst', '지난 날') : ''}${sw('y', 'M/C · S/D')}${sw('sp', '정지 · 휴지')}<span class="sep"></span>`
      + (P ? sw('chg', `${esc(P.lab)} 대비 바뀐 칸`) : '') + (V.kind === 'now' && ds.includes((o && o.today) || '') ? sw('tdy', '오늘') : '') + '</div>';
  }
  // 다른 표용 범례: items = [[class, 글], …] (같은 네모·같은 자리)
  const lg = (items) => `<div class="gk-lg">${items.filter(Boolean).map(([c, t]) => (c === 'sep' ? '<span class="sep"></span>' : c ? `<span><i class="${c}"></i>${t}</span>` : `<span>${t}</span>`)).join('')}</div>`;

  // 오늘 틀(오늘 열 전체 굵은 테두리) · 지난 날 덮개 자리 맞춤 · 좁은 화면(표가 가로로 밀릴 때 — 첫 두 열 고정): 오늘 앞 2일부터 보이게
  function snap() {
    document.querySelectorAll('.gk-wrap').forEach((w) => {
      if (!w.offsetParent) return;
      const tb = w.querySelector('table.gk'); if (!tb) return;
      const th = w.querySelector('thead th.dn.tdy'), fr = w.querySelector('.gk-tdy'), ps = w.querySelector('.gk-past');
      const W = w.getBoundingClientRect(), T = tb.getBoundingClientRect(), hd = tb.querySelector('thead');
      if (ps && hd) { const D0 = [...w.querySelectorAll('thead tr:first-child th.dn')], n = +ps.dataset.n, a0 = D0[0] && D0[0].getBoundingClientRect(), b0 = D0[n - 1] && D0[n - 1].getBoundingClientRect(), h0 = hd.getBoundingClientRect();
        if (a0 && b0) Object.assign(ps.style, { left: (a0.left - W.left - w.clientLeft + w.scrollLeft) + 'px', top: (h0.bottom - W.top - w.clientTop + w.scrollTop) + 'px', width: (b0.right - a0.left) + 'px', height: (T.bottom - h0.bottom) + 'px' }); }
      if (th && fr) { const a = th.getBoundingClientRect(); Object.assign(fr.style, { left: (a.left - W.left - w.clientLeft + w.scrollLeft) + 'px', top: (T.top - W.top - w.clientTop + w.scrollTop) + 'px', width: a.width + 'px', height: T.height + 'px' }); }   // 소수점 픽셀까지(offsetLeft 반올림 → 칸 선과 어긋남, 11/12 사용자)
      if (w.scrollWidth <= w.clientWidth + 1 || w.dataset.snapped) return;
      const days = [...w.querySelectorAll('thead tr:first-child th.dn')], i0 = days.findIndex((x) => x.classList.contains('tdy'));
      w.scrollLeft = i0 < 0 ? 0 : Math.round(Math.max(0, i0 - 2) * days[0].getBoundingClientRect().width); w.dataset.snapped = '1';
    });
  }
  let rsT = 0; const later = () => { clearTimeout(rsT); rsT = setTimeout(snap, 120); };
  if (document.fonts) document.fonts.ready.then(snap);
  if (window.ResizeObserver) new ResizeObserver(later).observe(document.documentElement);   // 표 너비가 늦게 바뀌어도 오늘 틀 다시 맞춤
  addEventListener('resize', later); addEventListener('beforeprint', snap);
  new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes].some((x) => x.nodeType === 1 && (x.matches('.gk-wrap') || x.querySelector('.gk-wrap'))))) { snap(); requestAnimationFrame(snap); } }).observe(document.documentElement, { childList: true, subtree: true });   // 표를 새로 그리면 바로 자리 맞춤
  document.addEventListener('toggle', later, true);                      // 접힌 칸(details)을 펼칠 때

  // 이름 칸(64px)에 안 들어가는 긴 그룹 이름: 앞의 '도금'·'컬러'를 뗌(구분 띠·툴팁에 전체 이름) — 예: 컬러건재수출 → 건재수출
  const short = (nm) => { const s = String(nm || ''); return s.replace(/\s/g, '').length > 4 && /^(도금|컬러)\s?\S{2}/.test(s) ? s.replace(/^(도금|컬러)\s?/, '') : s; };
  window.OPT = { short, table, legend, lg, head, pad31, wrap, snap, differs, hfmt, red, LINES, WD };
})();
