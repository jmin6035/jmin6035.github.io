/* 판생 기준값(11/19 사용자 '소재 리드타임·입항일·T/Hr 같은 숫자는 전부 한곳에 모아 두고 우리가 수정할 수 있어야') —
   배선일정(목적지별 출항 기간) · 시간당 톤(라인·강종·두께·폭) · 소재 리드타임 · 전환 규칙값. 노란 칸을 고치고 [저장] → 공유 저장소(K|표|키) → 모든 계산이 이 값을 씀.
   칸을 비우고 저장하면 기본값으로 돌아감. 고친 칸은 굵게 + 아래 작은 글씨로 기본값. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (v) => (v == null || v === '' ? '' : (Math.round(v * 10) / 10).toLocaleString('ko-KR'));
  const num = (t) => { const x = String(t).replace(/[,\s]/g, ''); return x === '' ? null : +x; };
  const ym = (v) => { const x = String(v || '').replace(/-/g, ''); return x.length >= 6 ? `${x.slice(0, 4)}년 ${+x.slice(4, 6)}월` : ''; };
  let B, pend = {}, st = {};
  /* 입력 칸 하나: key = K|… , d = 기본값 */
  const cell = (key, d, fmt = f1) => { const k = `K|${key}`, set = PS.isSet(k), v = k in pend ? pend[k] : PS.kv(key, d);
    return `<td class="in${set ? ' set' : ''}${k in pend ? ' pend' : ''}"><input inputmode="decimal" data-k="${esc(k)}" data-d="${d == null ? '' : d}" value="${v == null ? '' : fmt(v)}" aria-label="${esc(key)}">${set ? `<small>기본 ${d == null ? '없음' : fmt(d)}</small>` : ''}</td>`; };
  function draw() {
    const T = B.rateTab, SS = B.shipSched || {}, LD = B.lead || [];
    /* ① 배선일정 — 판매그룹으로 나누고 목적지 이름순(기본 내림차순, 11/19 사용자) · 목적지마다 권역·국가·물량 추세·두께 구성·주력 사양 */
    const GRPS = [...new Set(Object.keys(SS).map((k) => k.split('|')[0]))], q = (st.q || '').toUpperCase(), FNM = { AL: 'AL', AZ: 'AZ', MAC: 'MAC', STS: 'AL-STS' }, BN = ['극박', '박물', '중물', '후물'];
    let ship = '', nShown = 0, nAll = 0;
    for (const g of GRPS) { let rows = [];
      for (const [gk, rs] of Object.entries(SS)) { const [g0, f] = gk.split('|'); if (g0 === g) for (const x of rs) rows.push({ f, x, kk: `ship|${g}|${f}|${x[0]}` }); }
      nAll += rows.length;
      rows = rows.filter((r) => (!q || [r.x[0], r.x[4], r.x[5], FNM[r.f]].some((v) => String(v || '').toUpperCase().includes(q))) && (!st.only || ['t', 'a', 'b'].some((z) => PS.isSet(`K|${r.kk}|${z}`) || `K|${r.kk}|${z}` in pend)));
      rows.sort((p, r) => (st.asc ? 1 : -1) * p.x[0].localeCompare(r.x[0], 'ko') || ['AL', 'AZ', 'MAC', 'STS'].indexOf(p.f) - ['AL', 'AZ', 'MAC', 'STS'].indexOf(r.f));
      if (!rows.length) continue; nShown += rows.length;
      ship += `<tr class="grp"><td colspan="10"><span>${esc(g)} · 목적지 ${new Set(rows.map((r) => r.x[0])).size}곳 ${rows.length}줄 · 월평균 ${f1(rows.reduce((a, r) => a + PS.kv(`${r.kk}|t`, r.x[1]), 0))}t</span></td></tr>`;
      for (const { f, x, kk } of rows) { const a = PS.kv(`${kk}|a`, x[2]), b = PS.kv(`${kk}|b`, x[3]), d = x[7], bt = d ? BN.reduce((s0, k) => s0 + ((d.bands[k] || [0])[0]), 0) : 0;
        const bar = bt > 0 ? `<div class="bb" role="img" aria-label="두께 구성">${BN.map((k, i) => (d.bands[k] ? `<i class="b${i}" style="flex:${(d.bands[k][0] / bt).toFixed(3)}"></i>` : '')).join('')}</div><span class="bt">${BN.filter((k) => d.bands[k] && d.bands[k][0] / bt >= 0.1).map((k) => `${k} ${Math.round(d.bands[k][0] / bt * 100)}%`).join(' · ')}</span>` : '<span class="mu">실적 없음</span>';
        const tr = d ? (d.r3 > d.p3 * 1.15 ? 'up' : d.r3 < d.p3 * 0.85 ? 'dn' : '') : '';
        ship += `<tr><td class="nm"><b>${esc(x[0])}</b></td><td><span class="fm ${f}">${FNM[f]}</span></td><td>${esc(String(x[4]).replace(/_/g, ' '))}<small>${esc(x[5])}</small></td>${cell(`${kk}|t`, x[1])}${cell(`${kk}|a`, x[2], String)}${cell(`${kk}|b`, x[3], String)}
          <td class="bn">${b - a >= 10 ? '한 달 내내<small>반순으로 나눔</small>' : `${Math.ceil(a / 5)}반순<small>${a}~${b}일</small>`}</td>
          <td class="${tr}">${d ? `${f1(d.r3)}<small>이전 ${f1(d.p3)}${tr === 'up' ? ' · 늘어남' : tr === 'dn' ? ' · 줄어듦' : ''}</small>` : '<span class="mu">실적 없음</span>'}</td>
          <td class="bc">${bar}</td><td class="sp">${d && d.top.length ? d.top.slice(0, 3).map((t) => `<span>${t[0]}×${t[1]} ${esc(t[2])} <b>${f1(t[3])}</b></span>`).join('') : ''}${x[6] ? `<small>${esc(x[6])}</small>` : ''}</td></tr>`; } }
    if (!nShown) ship = `<tr><td colspan="10" class="none">맞는 목적지가 없습니다. 찾는 말을 줄이거나 '고친 줄만'을 풀어 보세요</td></tr>`;
    /* ② 시간당 톤 — 라인·강종 묶음(목적지 표와 같은 방식: 묶음 + 이름순), 고른 묶음만 크게 */
    const tb = (i) => (i === 0 ? `${T.thk[0]} 미만` : i === T.thk.length ? `${T.thk[i - 1]} 이상` : `${T.thk[i - 1]}~${T.thk[i]}`), wb = (i) => (i === 0 ? `${T.wdt[0]} 미만` : i === T.wdt.length ? `${T.wdt[i - 1]} 이상` : `${T.wdt[i - 1]}~${T.wdt[i]}`);
    const RK = [['1CGL', 'AZ'], ['1CGL', 'AL'], ['2CGL', 'MAC'], ['2CGL', 'AL']].sort((p, r) => (st.asc ? 1 : -1) * `${p[0]} ${p[1]}`.localeCompare(`${r[0]} ${r[1]}`, 'ko'));
    if (!RK.some(([l, f]) => `${l}|${f}` === st.rk)) st.rk = `${RK[0][0]}|${RK[0][1]}`;
    const nFix = (l, f) => T.thk.concat([0]).reduce((n, _, ti) => n + T.wdt.concat([0]).filter((__, wi) => PS.isSet(`K|rate|${l}|${f}|${ti}|${wi}`)).length, 0);
    const tabs = RK.map(([l, f]) => { const n = nFix(l, f); return `<button type="button" class="tab ${st.rk === `${l}|${f}` ? 'on' : ''}" data-rk="${l}|${f}" aria-pressed="${st.rk === `${l}|${f}`}">${l} <b>${FNM[f]}</b>${n ? `<i>${n}칸 고침</i>` : ''}</button>`; }).join('');
    const [RL, RF] = st.rk.split('|');
    const rate = `<table class="x rate"><thead><tr><th>두께 · 폭</th>${T.wdt.concat([0]).map((_, wi) => `<th>${wb(wi)}</th>`).join('')}</tr></thead><tbody>
      ${T.thk.concat([0]).map((_, ti) => `<tr><td class="nm"><b>${tb(ti)}</b></td>${T.wdt.concat([0]).map((__, wi) => { const k = `${RL}|${RF}|${ti}|${wi}`, r = T.rate[k], fb = T.rate[`${RL}|${RF}|${ti}`] || T.rate[`${RL}|${ti}`] || T.rate[RL];
        return r ? cell(`rate|${k}`, r * 60) : cell(`rate|${k}`, null).replace('class="in', 'class="in none').replace('value=""', `value="" placeholder="${f1(fb * 60)}"`); }).join('')}</tr>`).join('')}</tbody></table>`;
    /* ③ 리드타임 ④ 규칙값 */
    const lead = LD.map((x) => `<tr><td>${esc(x.name)}</td>${cell(`lead|${x.id}`, x.days, String)}<td>${esc(x.note)}</td></tr>`).join('');
    const rule = [['rule|swT', '전환(M/C·S/D) 첫날 생산 톤', B.swT, 't', String], ['rule|swH', '전환일 가동시간', 15, '시간', String], ['rule|opf|1CGL', '1CGL 하루 가동률(시간당 톤에 곱함)', (B.opf || {})['1CGL'] || 0.95, '0~1', (v) => String(v)], ['rule|opf|2CGL', '2CGL 하루 가동률(시간당 톤에 곱함)', (B.opf || {})['2CGL'] || 0.95, '0~1', (v) => String(v)]]
      .map(([k, nm, d, u, fm]) => `<tr><td>${nm}</td>${cell(k, d, fm)}<td>${u}</td></tr>`).join('');
    const nSet = Object.keys(PS.baseOver()).filter((k) => k.startsWith('K|')).length;
    $('ct-main').innerHTML = `
      <div class="xl-top"><h1>판생 기준값</h1><p>계산에 쓰는 숫자를 한곳에 모았습니다. 노란 칸을 고치고 저장하면 모든 계산이 그 값을 씁니다. 칸을 비우고 저장하면 기본값으로 돌아갑니다.</p>
        <div class="tiles"><div><span>배선일정 목적지</span><b>${nAll}줄</b></div><div><span>시간당 톤 칸</span><b>${Object.keys(T.rate).filter((k) => k.split('|').length === 4).length}칸</b></div><div><span>소재 리드타임</span><b>${LD.length}줄</b></div><div class="${nSet ? 'on' : ''}"><span>지금 고쳐 쓴 칸</span><b>${nSet}개</b></div></div>
        <nav><a href="pan/base.html#s1">배선일정</a><a href="pan/base.html#s2">시간당 톤</a><a href="pan/base.html#s3">소재 리드타임</a><a href="pan/base.html#s4">전환 규칙값</a></nav></div>
      <section class="xl" id="s1"><h2>1. 배선일정 · 목적지별 출항 기간 <small>출처: 배선일정 엑셀(정리_배선일정 · 정리_판매데이터) · 주문 없는 수출 판매계획분을 이 기간 안에, 그 목적지의 두께 구성으로 생산</small></h2>
        <div class="tb"><label>목적지 찾기<input id="b-q" type="search" placeholder="목적지·국가·권역·강종" value="${esc(st.q || '')}"></label>
          <label>이름 순서<select id="b-ord"><option value="">내림차순</option><option value="1"${st.asc ? ' selected' : ''}>오름차순</option></select></label>
          <label class="ck"><input type="checkbox" id="b-only"${st.only ? ' checked' : ''}>고친 줄만</label><span class="cnt">${nShown} / ${nAll}줄</span>
          <span class="lgd">두께 구성 <i class="b0"></i>극박 <i class="b1"></i>박물 <i class="b2"></i>중물 <i class="b3"></i>후물</span></div>
        <div class="xw"><table class="x ship"><thead><tr><th>목적지</th><th>강종</th><th>권역 · 국가</th><th>월평균 물량(t)</th><th>출항 시작일</th><th>출항 끝일</th><th>생산 반순</th><th>최근 3달 월평균(t)</th><th>두께 구성</th><th>주력 사양(두께×폭 도금량 t) · 비고</th></tr></thead><tbody>${ship}</tbody></table></div></section>
      <section class="xl" id="s2"><h2>2. 시간당 톤(가동 중) <small>출처: MES 코일 실적 ${ym(T.from)}부터 ${ym(T.to)}까지 ${f1((T.coils || 0))}코일 · 옅은 숫자 = 그 칸 실적이 없어 같은 두께 평균을 씀 · AL-STS는 2CGL AL 값을 씀</small></h2>
        <div class="tabs" role="group" aria-label="라인·강종">${tabs}</div>
        <div class="xw">${rate}</div></section>
      <section class="xl" id="s3"><h2>3. 소재 리드타임(일) <small>출처: 소재 유형별 리드타임(팀 제공) · 판생 엑셀 주문 시트 · 11/19 회의</small></h2>
        <table class="x w60"><thead><tr><th>항목</th><th>일수</th><th>비고</th></tr></thead><tbody>${lead}</tbody></table></section>
      <section class="xl" id="s4"><h2>4. 전환 규칙값</h2><table class="x w60"><thead><tr><th>항목</th><th>값</th><th>단위</th></tr></thead><tbody>${rule}
        <tr><td>M/C·S/D 요일</td><td>평일만</td><td>주말 금지(11/19)</td></tr></tbody></table></section>
      <div id="x-act" class="x-act" hidden></div><div id="x-toast" class="x-toast" role="status" hidden></div>`;
    let tm; $('b-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; draw(); const x = $('b-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 300); };
    $('b-ord').onchange = (e) => { st.asc = !!e.target.value; draw(); };
    document.querySelectorAll('[data-rk]').forEach((b0) => b0.addEventListener('click', () => { st.rk = b0.dataset.rk; draw(); })); $('b-only').onchange = (e) => { st.only = e.target.checked; draw(); };
    if (toastMsg) { const t = $('x-toast'); t.textContent = toastMsg; t.hidden = false; toastMsg = ''; setTimeout(() => { t.hidden = true; }, 4000); }
    document.querySelectorAll('input[data-k]').forEach((i) => { i.addEventListener('input', () => { const k = i.dataset.k, v = num(i.value), d = i.dataset.d === '' ? null : +i.dataset.d, cur = PS.get(k, d);
        if (v === cur || (v == null && !PS.isSet(k)) || (v != null && !isFinite(v))) delete pend[k]; else pend[k] = v; i.parentElement.classList.toggle('pend', k in pend); bar(); });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); }); });
    bar();
  }
  function bar() { const b = $('x-act'), n = Object.keys(pend).length; b.hidden = !n; if (!n) return;
    b.innerHTML = `<span>고친 칸 <b>${n}개</b></span><button type="button" class="b1" id="x-save">저장</button><button type="button" class="b2" id="x-clr">지우기</button><span>저장하면 모든 계산에 바로 반영되고 누가 언제 고쳤는지 기록됩니다</span>`;
    $('x-save').onclick = save; $('x-clr').onclick = () => { pend = {}; draw(); }; }
  let toastMsg = '';
  function save() { const pairs = Object.entries(pend); if (!pairs.length) return; pend = {}; toastMsg = `${pairs.length}칸 저장했습니다. 계산에 바로 반영됩니다`; PS.setMany(pairs, `기준값 ${pairs.length}칸 고침: ${pairs.slice(0, 3).map(([k, v]) => `${k.slice(2)} = ${v == null ? '기본값' : v}`).join(' · ')}`); }
  PS.on(() => { if (B) draw(); });
  PS.boot((b) => { if (!b) { $('ct-main').innerHTML = '<p>자료 없음</p>'; return; } B = b; draw(); if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); } });
})();
