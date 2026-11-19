/* 판생(한 화면, 11/19 사용자 '나누지 말고 한 화면에 넣으면 바로바로 · 무조건 그룹별 · 월간 캘린더 숫자를 누르면 그룹별·소재 · 입항일(배선일정 엑셀) 기간 기준 · 관제실 첫 화면 디자인으로').
   작업 순서 = 화면 위에서 아래: ① 그룹별 판매·재고 출하 → 생산 ② 강종 필요 vs 라인 월차 ③ 도금 캘린더(날 누르면 그룹별·소재) ④ 주문(그룹 > 목적지, 바뀐 것·지연, 필요일 고치기).
   어느 칸을 고쳐도 같은 사슬로 다시 계산(PS 엔진), 맨 위에 '방금 고친 것 · 움직인 주문 · 지연 증감'. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = (v) => PS.n0(v), md = (d) => (d ? PS.md(String(d).slice(0, 10)) : '');
  const num = (t) => { const x = String(t).replace(/[,\s]/g, '').replace(/^[−–]/, '-'); return x === '' ? NaN : +x; };
  const FN = (f) => (f === 'STS' ? 'AL-STS' : f), FC = { AZ: 'az', MAC: 'mac', AL: 'al', STS: 'sts' };
  const GR = ['도금수출', '도금국내', '자동차', '수요개발', '자가재'], GC = { 도금수출: 'g1', 도금국내: 'g2', 자동차: 'g3', 수요개발: 'g4', 자가재: 'g5' };
  const KN = { arr: '입항', dept: '출항', need: '필요일', due: '납기', eta: '소재 입고', qty: '톤', new: '새 주문' };
  const KEY = 'pan-one'; let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { st = {}; }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ m: st.m, past: st.past, only: st.only })); } catch (e) { /* 무시 */ } };
  let B, before = null, last = '', pick = '';
  const who = (it) => (it.k === 'p' ? `${it.who === '판매계획' ? '판매계획' : it.who}(주문 없음)` : it.who === '컬러 투입' ? it.cus : it.who || it.cus || '');
  const famOf = (x) => PS.famOfRow(x), grpOf = (x) => PS.grpOfRow(x);

  function edit(pairs, why) { before = snap(); last = why; PS.setMany(pairs, why); }
  function snap() { const C = PS.ctx(), at = {}; for (const [c, a] of Object.entries(C.at)) at[c] = a[a.length - 1].d; return { at, k: kpi(C) }; }
  function kpi(C) { let lateN = 0, lateT = 0, noneN = 0, noneT = 0;
    for (const it of Object.values(C.itemOf)) { const a = C.at[it.con], stk = C.A.stockUsed[it.con] || 0; if (stk >= it.t * 0.95) continue; if (!a) { noneN++; noneT += it.t; continue; } if (a[a.length - 1].d > it.need) { lateN++; lateT += it.t; } }
    return { lateN, lateT, noneN, noneT }; }
  const gap = (q, p) => (q < p - 1 ? `<b class="warn">${n0(p - q)} 모자람</b>` : q > p + 1 ? `${n0(q - p)} 넘침` : '맞음');

  function draw() {
    PS.pastMode = st.past === 'in' ? 'in' : 'out';
    const ms = B.months.slice(1, 4); if (!ms.includes(st.m)) st.m = ms[0];
    const m = st.m, pm = PS.prevM(m), R = B.ledger.rows, L = PS.ledger(), P = PS.plating(L), C = PS.ctx(), Pm = P[m], T = Pm.T, K = kpi(C);
    const evOf = {}; for (const e of ((B.changes || {}).events || [])) if (e[2] !== 'gone' && (!evOf[e[1]] || evOf[e[1]][0] <= e[0])) evOf[e[1]] = e;
    const open = (r) => (L[pm] ? L[pm][r].sf : (L[m][r].sf - L[m][r].p + L[m][r].s));
    /* 방금 고친 것 */
    let moved = [], diff = '';
    if (before) { const now = {}; for (const [c, a] of Object.entries(C.at)) now[c] = a[a.length - 1].d;
      for (const c of new Set([...Object.keys(before.at), ...Object.keys(now)])) if (before.at[c] !== now[c] && C.itemOf[c]) moved.push(c);
      const dl = K.lateN - before.k.lateN, dt = K.lateT - before.k.lateT;
      diff = `<div class="o-diff"><b>방금 고친 것</b><span>${esc(last)}</span><span>생산 예정이 움직인 주문 <b>${moved.length}건</b></span><span>지연 <b class="${dl > 0 ? 'bad' : dl < 0 ? 'ok' : ''}">${dl === 0 ? '그대로' : `${dl > 0 ? '+' : '−'}${Math.abs(dl)}건 ${dt > 0 ? '+' : '−'}${n0(Math.abs(dt))}t`}</b></span><button type="button" class="b2" id="o-undo">되돌리기</button></div>`; }
    const mv = new Set(moved);
    /* ① 그룹별: 그룹 > 강종(판생 줄) */
    const leaves = R.filter((x) => x.kind !== 'sec' && L[m][x.r] && L[m][x.r].in && famOf(x) && !(x.hid && !L[m][x.r].p && !L[m][x.r].s && !L[m][x.r].sf));
    const om = (g, f) => C.A.om[`${m}|${g}|${f}`] || 0;
    let led = '', totQ = 0;
    for (const g of GR) {
      const rows = leaves.filter((x) => grpOf(x) === g); if (!rows.length) continue;
      const fams = [...new Set(rows.map(famOf))].sort((a, b) => ['MAC', 'AZ', 'AL', 'STS'].indexOf(a) - ['MAC', 'AZ', 'AL', 'STS'].indexOf(b));
      const sum = (fn) => rows.reduce((a, x) => a + fn(L[m][x.r], x), 0), gp = sum((c) => c.p), self = g === '자가재', gq = self ? 0 : fams.reduce((a, f) => a + om(g, f), 0); totQ += gq;
      led += `<tr class="grp"><td><i class="gd ${GC[g]}"></i>${g}</td><td>${n0(sum((c, x) => open(x.r)))}</td><td>${n0(sum((c) => c.s))}</td><td>${n0(sum((c) => c.s - c.p))}</td><td><b>${n0(gp)}</b></td><td>${self ? '컬러 투입' : n0(gq)}</td><td>${self ? '' : gap(gq, gp)}</td><td>${n0(sum((c) => c.sf))}</td></tr>`;
      for (const f of fams) { const fr = rows.filter((x) => famOf(x) === f);
        for (const x of fr) { const c = L[m][x.r], mk = R.find((y) => y.r === x.mkt), mkt = (mk ? mk.lab : x.lab).replace(/\s/g, ''), dep = x.kind === 'dept' && !x.lab.replace(/\s/g, '').startsWith(g.slice(0, 2)) ? ` ${x.lab}` : '';
          const lb = `${FN(f)} ${mkt}${dep}`.replace(/도금판매/g, '도금국내'), q = fr.length === 1 && !self ? om(g, f) : null;
          led += `<tr><td class="sub">${esc(lb)}</td><td>${n0(open(x.r))}</td><td class="in"><input inputmode="numeric" data-k="L|${x.r}|${m}|s" value="${n0(c.s)}" aria-label="${g} ${esc(lb)} 판매"></td>
            <td class="in"><input inputmode="numeric" data-x="${x.r}" value="${n0(c.s - c.p)}" aria-label="${g} ${esc(lb)} 재고 출하"></td><td><b>${n0(c.p)}</b></td><td>${q == null ? '' : n0(q)}</td><td>${q == null ? '' : gap(q, c.p)}</td><td class="${c.sf < 0 ? 'bad' : ''}">${n0(c.sf)}</td></tr>`; }
        if (fr.length > 1 && !self) { const p = fr.reduce((a, x) => a + L[m][x.r].p, 0), q = om(g, f);
          led += `<tr class="fs"><td class="sub">${FN(f)} 합</td><td></td><td></td><td></td><td>${n0(p)}</td><td>${n0(q)}</td><td>${gap(q, p)}</td><td></td></tr>`; } }
    }
    /* ② 라인: 강종 필요 vs 월차 */
    const made = { AZ: PS.sumG(Pm['1CGL'].days, 'AZ'), MAC: PS.sumG(Pm['2CGL'].days, 'MAC'), AL: PS.sumG(Pm['1CGL'].days, 'AL') + PS.sumG(Pm['2CGL'].days, 'AL') };
    const short = ['AZ', 'MAC', 'AL'].filter((f) => made[f] < T[f] - 1);
    const fit = ['AZ', 'MAC', 'AL'].map((f) => { const d = made[f] - T[f]; return `<div class="fitc ${d < -1 ? 'bad' : ''}"><span><i class="sw ${FC[f]}"></i>${f} 생산 필요</span><b>${n0(T[f])}</b><em>라인 월차 ${n0(made[f])} · ${d < -1 ? `${n0(-d)} 모자람` : '맞음'}</em></div>`; }).join('');
    /* ③ 캘린더 */
    const D = PS.days(m), movedDay = new Set(); for (const c of moved) for (const a of C.at[c] || []) movedDay.add(`${a.l}|${a.d}`);
    const cell = (l, x) => { const k = `${l}|${x.d}`, o = C.A.out[k], gt = {}; let late = 0;
      if (o) for (const y of o.got) { gt[y.it.grp] = (gt[y.it.grp] || 0) + y.t; if (y.it.k === 'o' && y.it.need < x.d) late++; }
      const sum = Object.values(gt).reduce((a, b) => a + b, 0) || 1, fam = x.sts ? 'STS' : x.g;
      return `<button type="button" class="cd ${FC[fam] || 'off'} ${movedDay.has(k) ? 'mv' : ''} ${pick === k ? 'pk' : ''} ${x.d < C.today ? 'past' : ''}" data-k="${k}" aria-label="${l} ${md(x.d)}">
        <span class="cf">${x.ev ? esc(x.ev) : fam ? FN(fam) : ''}</span><b>${x.t ? n0(x.t) : ''}</b>${late ? `<s>${late}</s>` : '<s class="no"></s>'}<span class="gb">${GR.filter((g) => gt[g]).map((g) => `<i class="${GC[g]}" style="flex:${(gt[g] / sum).toFixed(3)}"></i>`).join('')}</span></button>`; };
    const wk = ['월', '화', '수', '목', '금', '토', '일'];
    const hd = D.map((d) => { const w = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; return `<div class="ch ${w >= 5 ? 'we' : ''} ${d === C.today ? 'td' : ''}">${+d.slice(8)}<small>${wk[w]}</small></div>`; }).join('');
    /* ④ 주문: 그룹 > 목적지 */
    const q = (st.q || '').toUpperCase();
    const rows = Object.values(C.itemOf).filter((it) => { const a = C.at[it.con] || [], d = a.length ? a[a.length - 1].d : ''; return d.startsWith(m) || it.need.startsWith(m) || (it.m === m && !d); })
      .map((it) => { const a = C.at[it.con] || [], d = a.length ? a[a.length - 1].d : '', stk = C.A.stockUsed[it.con] || 0, late = d ? Math.round((new Date(d) - new Date(it.need)) / 864e5) : null;
        const bad = stk < it.t * 0.95 && (!d || late > 0); return { it, d, l: [...new Set(a.map((x) => x.l))].join('·'), st: stk >= it.t * 0.95 ? '재고에서 출하' : !d ? '배정 없음' : late > 0 ? `${late}일 지연` : '맞음', bad }; })
      .filter((r) => (!q || [r.it.con, r.it.who, r.it.cus, r.it.dst, r.it.man].some((x) => String(x || '').toUpperCase().includes(q))) && (st.only !== 'bad' || r.bad || mv.has(r.it.con)) && (st.only !== 'chg' || evOf[r.it.con] || mv.has(r.it.con)));
    const G = {}; for (const r of rows) { const g = (G[r.it.grp] = G[r.it.grp] || { rows: [], t: 0, bad: 0, badT: 0 }); g.rows.push(r); g.t += r.it.t; if (r.bad) { g.bad++; g.badT += r.it.t; } }
    let ord = '', nShow = 0;
    for (const g of GR.concat(Object.keys(G).filter((x) => !GR.includes(x)))) { const z = G[g]; if (!z) continue;
      ord += `<tr class="grp"><td colspan="10"><i class="gd ${GC[g] || ''}"></i>${esc(g)} · ${z.rows.length}건 ${n0(z.t)}t${z.bad ? ` · <span class="bad">지연·배정 없음 ${z.bad}건 ${n0(z.badT)}t</span>` : ''}</td></tr>`;
      const byW = {}; for (const r of z.rows) (byW[who(r.it)] = byW[who(r.it)] || []).push(r);
      const hot = (rs) => rs.some((r) => r.bad || mv.has(r.it.con)), tt = (rs) => rs.reduce((s, r) => s + r.it.t, 0);
      for (const [w, rs] of Object.entries(byW).sort((a, b) => hot(b[1]) - hot(a[1]) || tt(b[1]) - tt(a[1]))) { if (nShow > 500) break;
        const e0 = rs.map((r) => evOf[r.it.con]).filter(Boolean).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
        ord += `<tr class="dst"><td colspan="10"><b>${esc(w)}</b> · ${rs.length}건 ${n0(tt(rs))}t${rs[0].it.why ? ` · ${esc(rs[0].it.why)}` : ''}${e0 && e0[2] !== 'new' ? ` · <b class="amb">${KN[e0[2]]} ${md(e0[3])}에서 ${md(e0[4])}로 바뀜</b>` : ''}</td></tr>`;
        for (const r of rs.sort((a, b) => ((a.d || '9') < (b.d || '9') ? -1 : 1))) { nShow++; const it = r.it, dec = PS.get(`D|${it.con}`, '') || '', e = evOf[it.con];
          ord += `<tr class="${r.bad ? 'late' : ''} ${mv.has(it.con) ? 'mvr' : ''}"><td>${r.d ? `<b>${md(r.d)}</b> ${esc(r.l)}` : '없음'}${mv.has(it.con) && before ? `<small>${before.at[it.con] ? md(before.at[it.con]) : '없음'}에서 옮김</small>` : ''}</td>
            <td>${esc(it.con)}</td><td>${FN(it.fam)}</td><td>${it.thk ? `${it.thk}×${it.wdt}` : ''}</td><td>${n0(it.t)}</td><td class="in ${PS.isSet(`N|${it.con}`) ? 'set' : ''}"><input type="date" data-n="${esc(it.con)}" value="${esc(it.need)}" aria-label="${esc(it.con)} 생산 필요일"></td>
            <td>${it.ready ? `<span class="amb">입고 예정 ${md(it.ready)}</span>` : it.eta ? '입고됨' : esc(it.readyNote || '')}</td><td>${e ? `${KN[e[2]] || ''}${e[2] !== 'new' && e[3] ? ` ${md(e[3])}에서 ${md(e[4])}` : ''}` : ''}</td><td class="${r.bad ? 'bad' : ''}">${r.st}</td>
            <td class="in"><select data-d="${esc(it.con)}" aria-label="${esc(it.con)} 결정">${[['', '자동'], ['in', '이번 달 꼭'], ['stock', '재고에서 출하'], ['next', '다음 달로']].map(([v, t]) => `<option value="${v}"${dec === v ? ' selected' : ''}>${t}</option>`).join('')}${dec.startsWith('d:') ? `<option selected value="${esc(dec)}">${md(dec.slice(2))} 고정</option>` : ''}</select></td></tr>`; } }
    }
    $('ct-main').innerHTML = `
      <div class="o-bar"><div class="o-m">${ms.map((x) => `<button type="button" data-m="${x}" class="${x === m ? 'on' : ''}">${PS.mLab(x)}</button>`).join('')}</div>
        <div class="kp"><span>${PS.mLab(m)} 도금 생산</span><b>${n0(T.AZ + T.MAC + T.AL)}t</b></div>
        <div class="kp ${short.length ? 'bad' : ''}"><span>라인 월차</span><b>${short.length ? short.map((f) => `${f} ${n0(T[f] - made[f])} 모자람`).join(' · ') : '맞음'}</b></div>
        <div class="kp"><span>주문 확보(자가재 빼고)</span><b>${n0(totQ)}t</b></div>
        <div class="kp ${K.lateN ? 'bad' : ''}"><span>지연 주문(전체)</span><b>${n0(K.lateN)}건 ${n0(K.lateT)}t</b></div>${K.noneN ? `<div class="kp bad"><span>배정 없음</span><b>${n0(K.noneN)}건 ${n0(K.noneT)}t</b></div>` : ''}</div>
      ${diff}
      <div class="o-mid">
        <section class="o-c"><header><h2><em>1</em>그룹별 판매 · 재고 출하 · 생산</h2><span>노란 칸에 넣으면 전부 다시 계산 · 생산 = 판매 − 재고 출하</span></header>
          <div class="o-lw"><table class="o-t led"><thead><tr><th>그룹 · 강종</th><th>월초 재고</th><th>판매</th><th>재고 출하</th><th>생산</th><th>주문 확보</th><th>주문 − 생산</th><th>월말 재고</th></tr></thead><tbody>${led}</tbody></table></div></section>
        <div class="o-r"><section class="o-c"><header><h2><em>2</em>강종별 생산 필요 · 라인 월차</h2></header><div class="fit">${fit}</div></section></div></div>
        <section class="o-c calw"><header><h2><em>3</em>${PS.mLab(m)} 도금 캘린더</h2><span>칸 = 강종 · 그날 톤 · 아래 막대 = 그룹 비중 · 빨간 숫자 = 필요일 지난 주문 · 날을 누르면 그룹별·소재</span></header>
          <div class="cal" style="--n:${D.length}"><div></div><div class="cr">${hd}</div><b>1CGL</b><div class="cr">${Pm['1CGL'].days.map((x) => cell('1CGL', x)).join('')}</div><b>2CGL</b><div class="cr">${Pm['2CGL'].days.map((x) => cell('2CGL', x)).join('')}</div></div>
          <div class="lg">${['AZ', 'MAC', 'AL', 'STS'].map((f) => `<span><i class="sw ${FC[f]}"></i>${FN(f)}</span>`).join('')}<span class="sep"></span>${GR.map((g) => `<span><i class="gd ${GC[g]}"></i>${g}</span>`).join('')}</div>
          <div id="o-day" class="day"></div></section>
      <section class="o-c"><header><h2><em>4</em>주문 · 그룹별 목적지</h2><span>${PS.mLab(m)}에 만들거나 필요일이 ${PS.mLab(m)}인 미생산 주문 ${n0(rows.length)}건 · 생산 필요일(입항·납기 바뀜)을 고치면 바로 다시 배정</span></header>
        <div class="o-ctl"><input id="o-q" placeholder="계약번호·목적지·고객·담당" value="${esc(st.q || '')}">
          <select id="o-only"><option value="">전부</option><option value="bad"${st.only === 'bad' ? ' selected' : ''}>지연·배정 없음·방금 움직인 것</option><option value="chg"${st.only === 'chg' ? ' selected' : ''}>바뀐 주문(입항·필요일·납기)</option></select>
          <select id="o-past"><option value="out"${st.past !== 'in' ? ' selected' : ''}>지난 납기 미생산 빼고 계산</option><option value="in"${st.past === 'in' ? ' selected' : ''}>지난 납기 미생산 넣고 계산</option></select></div>
        <div class="o-w"><table class="o-t ord"><thead><tr><th>생산 예정</th><th>계약번호</th><th>강종</th><th>사이즈</th><th>톤</th><th>생산 필요일</th><th>소재</th><th>최근 바뀜</th><th>상태</th><th>결정</th></tr></thead><tbody>${ord || '<tr><td colspan="10">해당 주문 없음</td></tr>'}</tbody></table></div></section>`;
    if (!pick || !pick.includes(`|${m}`)) { const t = Pm['1CGL'].days.find((x) => x.d >= C.today && x.g) || Pm['1CGL'].days.find((x) => x.g) || Pm['1CGL'].days[0]; pick = `1CGL|${t.d}`; }
    day(C, pick);
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.m = b.dataset.m; pick = ''; before = null; keep(); draw(); }));
    document.querySelectorAll('input[data-k]').forEach((i) => i.addEventListener('change', () => { const k = i.dataset.k, p = k.split('|'), c = L[p[2]][p[1]], v = num(i.value); if (!isFinite(v)) { draw(); return; } const d = v - c.s;
      edit([[k, v], [`L|${p[1]}|${p[2]}|p`, c.p + d]], `${PS.mLab(m)} ${i.getAttribute('aria-label')} ${n0(c.s)}에서 ${n0(v)}로(생산 ${d >= 0 ? '+' : '−'}${n0(Math.abs(d))})`); }));
    document.querySelectorAll('input[data-x]').forEach((i) => i.addEventListener('change', () => { const r = i.dataset.x, c = L[m][r], v = num(i.value); if (!isFinite(v)) { draw(); return; }
      edit([[`L|${r}|${m}|p`, c.s - v]], `${PS.mLab(m)} ${i.getAttribute('aria-label')} ${n0(c.s - c.p)}에서 ${n0(v)}로(생산 ${n0(c.s - v)})`); }));
    document.querySelectorAll('input[data-n]').forEach((i) => i.addEventListener('change', () => { const c = i.dataset.n; edit([[`N|${c}`, i.value || null]], `${c} 생산 필요일 ${i.value ? md(i.value) : '원래대로'}`); }));
    document.querySelectorAll('select[data-d]').forEach((s) => s.addEventListener('change', () => { const c = s.dataset.d; edit([[`D|${c}`, s.value || null]], `${c} ${s.selectedOptions[0].textContent}`); }));
    document.querySelectorAll('.cd[data-k]').forEach((b) => b.addEventListener('click', () => { pick = b.dataset.k; document.querySelectorAll('.cd.pk').forEach((x) => x.classList.remove('pk')); b.classList.add('pk'); day(C, pick); }));
    if ($('o-undo')) $('o-undo').onclick = () => { before = snap(); last = '되돌리기'; if (!PS.undo()) { before = null; draw(); } };
    let tm; $('o-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; draw(); const x = $('o-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 350); };
    $('o-only').onchange = (e) => { st.only = e.target.value; keep(); draw(); };
    $('o-past').onchange = (e) => { st.past = e.target.value; before = null; keep(); draw(); };
    $('o-at').textContent = `주문 자료 ${String(B.ordersAsOf || '').replace('T', ' ').slice(5, 16)} · 기준일 ${md(C.today)}`;
  }
  /* 날 하나: 그룹별 톤·주문·목적지·소재 */
  function day(C, k) {
    const box = $('o-day'), [l, d] = k.split('|'), o = C.A.out[k];
    if (!o || !o.got.length) { box.innerHTML = `<h3>${l} ${md(d)}<span>${o && o.ev ? esc(o.ev) : '생산 없음'}</span></h3>`; return; }
    const g = {}; for (const y of o.got) { const it = y.it, z = (g[it.grp] = g[it.grp] || { t: 0, n: 0, plan: 0, have: 0, wait: 0, waitD: '', late: 0, w: {} }); z.t += y.t;
      if (it.k === 'p') z.plan += y.t; else { z.n++; if (it.ready) { z.wait += y.t; if (it.ready > z.waitD) z.waitD = it.ready; } else z.have += y.t; if (it.need < d) z.late++; }
      const w = who(it); z.w[w] = (z.w[w] || 0) + y.t; }
    box.innerHTML = `<h3>${l} ${md(d)} · ${FN(o.g)} ${n0(o.tons)}t<span>${o.ev ? esc(o.ev) + ' · ' : ''}${o.freeH > 0.3 ? `남는 ${o.freeH.toFixed(1)}시간` : '가득 참'}</span></h3>
      <div class="dg">${GR.concat(Object.keys(g).filter((x) => !GR.includes(x))).filter((x) => g[x]).map((x) => { const z = g[x], top = Object.entries(z.w).sort((a, b) => b[1] - a[1]);
        return `<div class="dc"><div class="dh2"><i class="gd ${GC[x] || ''}"></i><b>${esc(x)}</b><em>${n0(z.t)}t</em></div>
          <div class="dm">주문 ${z.n}건${z.late ? ` · <b class="bad">필요일 지남 ${z.late}건</b>` : ''}</div>
          <div class="ds"><span class="ok">소재 있음 ${n0(z.have)}t</span>${z.wait ? `<span class="amb">입고 예정 ${n0(z.wait)}t · 마지막 ${md(z.waitD)}</span>` : ''}${z.plan ? `<span>판매계획분 ${n0(z.plan)}t · 소재 미정</span>` : ''}</div>
          <div class="dw">${top.slice(0, 4).map(([w, t]) => `<span>${esc(w)} <b>${n0(t)}</b></span>`).join('')}${top.length > 4 ? `<span>외 ${top.length - 4}곳</span>` : ''}</div></div>`; }).join('')}</div>`;
  }
  PS.on(() => { if (B) draw(); });
  PS.boot((b) => { if (!b) { $('ct-main').innerHTML = '<p>자료 없음</p>'; return; } B = b; draw(); });
})();
