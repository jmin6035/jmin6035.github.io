/* 판생 기준값(11/19 사용자 '소재 리드타임·입항일·T/Hr 같은 숫자는 전부 한곳에 모아 두고 우리가 수정할 수 있어야') —
   배선일정(목적지별 출항 기간) · 시간당 톤(라인·강종·두께·폭) · 소재 리드타임 · 전환 규칙값. 노란 입력란을 고치고 [저장] → 공유 저장소(K|표|키) → 모든 계산이 이 값을 씀.
   칸을 비우고 저장하면 기본값으로 돌아감. 수정한 값은 굵게 + 아래 작은 글씨로 기본값. */
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
    const FNM = { AL: 'AL', AZ: 'AZ', MAC: 'MAC', STS: 'AL-STS' }, BN = ['극박', '박물', '중물', '후물'];
    const GRPS = [...new Set(Object.keys(SS).map((k) => k.split('|')[0]))], q = (st.q || '').toUpperCase();
    /* 1. 배선일정 — 판매그룹으로 묶고 목적지 이름 내림차순 */
    let ship = '', nShown = 0, nAll = 0;
    for (const g of GRPS) { let rows = [];
      for (const [gk, rs] of Object.entries(SS)) { const [g0, f] = gk.split('|'); if (g0 === g) for (const x of rs) rows.push({ f, x, kk: `ship|${g}|${f}|${x[0]}` }); }
      nAll += rows.length;
      rows = rows.filter((r) => (!q || [r.x[0], r.x[4], r.x[5], FNM[r.f]].some((v) => String(v || '').toUpperCase().includes(q)))
        && (!st.only || ['t', 'a', 'b'].some((z) => PS.isSet(`K|${r.kk}|${z}`) || `K|${r.kk}|${z}` in pend)));
      rows.sort((p0, r) => (st.asc ? 1 : -1) * p0.x[0].localeCompare(r.x[0], 'ko') || ['AL', 'AZ', 'MAC', 'STS'].indexOf(p0.f) - ['AL', 'AZ', 'MAC', 'STS'].indexOf(r.f));
      if (!rows.length) continue; nShown += rows.length;
      ship += `<tr class="grp"><td colspan="10"><span>${esc(g)}<i>목적지 ${new Set(rows.map((r) => r.x[0])).size}곳</i><i>${rows.length}건</i><i>월평균 ${f1(rows.reduce((t0, r) => t0 + PS.kv(`${r.kk}|t`, r.x[1]), 0))}t</i></span></td></tr>`;
      for (const { f, x, kk } of rows) { const a0 = PS.kv(`${kk}|a`, x[2]), b0 = PS.kv(`${kk}|b`, x[3]), d = x[7];
        const bt = d ? BN.reduce((s0, k) => s0 + ((d.bands[k] || [0])[0]), 0) : 0;
        const bar0 = bt > 0 ? `<div class="bb" role="img" aria-label="두께 구성">${BN.map((k, i) => (d.bands[k] ? `<i class="tk${i}" style="flex:${(d.bands[k][0] / bt).toFixed(3)}"></i>` : '')).join('')}</div><span class="bt">${BN.filter((k) => d.bands[k] && d.bands[k][0] / bt >= 0.1).map((k) => `${k} ${Math.round(d.bands[k][0] / bt * 100)}%`).join(', ')}</span>` : '<span class="mu">실적 없음</span>';
        const tr = d ? (d.r3 > d.p3 * 1.15 ? 'up' : d.r3 < d.p3 * 0.85 ? 'dn' : '') : '';
        ship += `<tr><td class="nm">${esc(x[0])}</td><td>${FNM[f]}</td><td>${esc(String(x[4]).replace(/_/g, ' '))}</td>${cell(`${kk}|t`, x[1])}${cell(`${kk}|a`, x[2], String)}${cell(`${kk}|b`, x[3], String)}
          <td class="bn">${b0 - a0 >= 10 ? '월 전체<small>반순 배분</small>' : `${Math.ceil(a0 / 5)}반순<small>${a0}일에서 ${b0}일</small>`}</td>
          <td class="num ${tr}">${d ? `${f1(d.r3)}<small>이전 ${f1(d.p3)}${tr === 'up' ? ', 증가' : tr === 'dn' ? ', 감소' : ''}</small>` : '<span class="mu">실적 없음</span>'}</td>
          <td class="bc">${bar0}</td><td class="sp">${d && d.top.length ? d.top.slice(0, 3).map((t) => `<span>${t[0]}×${t[1]} ${esc(t[2])} <b>${f1(t[3])}t</b></span>`).join('') : ''}${x[6] ? `<small>${esc(x[6])}</small>` : ''}</td></tr>`; } }
    if (!nShown) ship = '<tr><td colspan="10" class="none">검색 결과 없음</td></tr>';
    /* 2. 시간당 톤 — 라인·강종 묶음 */
    const tb = (i) => (i === 0 ? `${T.thk[0]} 미만` : i === T.thk.length ? `${T.thk[i - 1]} 이상` : `${T.thk[i - 1]}에서 ${T.thk[i]}`);
    const wb = (i) => (i === 0 ? `${T.wdt[0]} 미만` : i === T.wdt.length ? `${T.wdt[i - 1]} 이상` : `${T.wdt[i - 1]}에서 ${T.wdt[i]}`);
    const RK = [['1CGL', 'AZ'], ['1CGL', 'AL'], ['2CGL', 'MAC'], ['2CGL', 'AL']].sort((p0, r) => (st.asc ? 1 : -1) * `${p0[0]} ${p0[1]}`.localeCompare(`${r[0]} ${r[1]}`, 'ko'));
    if (!RK.some(([l, f]) => `${l}|${f}` === st.rk)) st.rk = `${RK[0][0]}|${RK[0][1]}`;
    const nFix = (l, f) => T.thk.concat([0]).reduce((n, _, ti) => n + T.wdt.concat([0]).filter((__, wi) => PS.isSet(`K|rate|${l}|${f}|${ti}|${wi}`)).length, 0);
    const tabs = RK.map(([l, f]) => { const n = nFix(l, f); return `<button type="button" class="tab ${st.rk === `${l}|${f}` ? 'on' : ''}" data-rk="${l}|${f}" aria-pressed="${st.rk === `${l}|${f}`}">${l} <b>${FNM[f]}</b>${n ? `<i>${n}건 수정</i>` : ''}</button>`; }).join('');
    const [RL, RF] = st.rk.split('|');
    const rate = `<table class="x rate"><thead><tr><th>두께, 폭</th>${T.wdt.concat([0]).map((_, wi) => `<th>${wb(wi)}</th>`).join('')}</tr></thead><tbody>
      ${T.thk.concat([0]).map((_, ti) => `<tr><td class="nm">${tb(ti)}</td>${T.wdt.concat([0]).map((__, wi) => { const k = `${RL}|${RF}|${ti}|${wi}`, r = T.rate[k], fb = T.rate[`${RL}|${RF}|${ti}`] || T.rate[`${RL}|${ti}`] || T.rate[RL];
        return r ? cell(`rate|${k}`, r * 60) : cell(`rate|${k}`, null).replace('class="in', 'class="in none').replace('value=""', `value="" placeholder="${f1(fb * 60)}"`); }).join('')}</tr>`).join('')}</tbody></table>`;
    /* 3·4 */
    const lead = LD.map((x) => `<tr><td class="nm">${esc(x.name)}</td>${cell(`lead|${x.id}`, x.days, String)}<td>${esc(x.note)}</td></tr>`).join('');
    const rule = [['rule|swT', '전환(M/C·S/D) 첫날 생산 톤', B.swT, 't', String], ['rule|swH', '전환일 가동시간', 15, '시간', String],
      ['rule|opf|1CGL', '1CGL 하루 가동률', (B.opf || {})['1CGL'] || 0.95, '', (v) => String(v)],
      ['rule|opf|2CGL', '2CGL 하루 가동률', (B.opf || {})['2CGL'] || 0.95, '', (v) => String(v)]]
      .map(([k, nm, d, u, fm]) => `<tr><td class="nm">${nm}</td>${cell(k, d, fm)}<td>${u}</td></tr>`).join('');
    /* 5. 고친 값 목록 */
    const O = PS.baseOver(), fixed = Object.keys(O).filter((k) => k.startsWith('K|')).sort();
    const NMK = (k) => { const p0 = k.slice(2).split('|');
      if (p0[0] === 'ship') return `배선일정 ${p0[1]} ${FNM[p0[2]] || p0[2]} ${p0[3]} ${{ t: '월평균 물량', a: '출항 시작일', b: '출항 끝일' }[p0[4]] || p0[4]}`;
      if (p0[0] === 'rate') return `T/Hr ${p0[1]} ${FNM[p0[2]] || p0[2]} 두께 ${tb(+p0[3])} 폭 ${wb(+p0[4])}`;
      if (p0[0] === 'lead') return `소재 리드타임 ${(LD.find((x) => x.id === p0[1]) || {}).name || p0[1]}`;
      return `전환 규칙값 ${p0.slice(1).join(' ')}`; };
    const chg = fixed.length ? fixed.map((k) => { const h = PS.history(k).slice(-1)[0] || {};
      return `<div class="row"><b>${esc(NMK(k))}</b><span class="v">${f1(O[k])}</span><span class="who">${esc(String(h.at || '').slice(5, 16).replace('T', ' '))} ${esc(h.by || '')}</span><button type="button" class="b3" data-rst="${esc(k)}">기본값 복원</button></div>`; }).join('')
      : '<p class="none">수정한 값 없음</p>';
    $('ct-main').innerHTML = `
      <div class="xl-top"><h1>기준값</h1><p class="lead">노란 입력란 수정 후 저장</p>
        <div class="counts"><div><span>배선일정 목적지</span><b>${nAll}건</b></div><div><span>T/Hr</span><b>${Object.keys(T.rate).filter((k) => k.split('|').length === 4).length}건</b></div><div><span>소재 리드타임</span><b>${LD.length}건</b></div><div class="${fixed.length ? 'on' : ''}"><span>수정한 값</span><b>${fixed.length}건</b></div></div>
        <nav><a href="pan/base.html#s1">배선일정</a><a href="pan/base.html#s2">T/Hr</a><a href="pan/base.html#s3">소재 리드타임</a><a href="pan/base.html#s4">전환 규칙값</a><a href="pan/base.html#s5">상한 일수</a><a href="pan/base.html#s6">수정 내역</a></nav></div>
      <section class="xl" id="s1"><div class="hd"><span class="no">1</span><h2>배선일정, 목적지별 출항 기간</h2></div>
        <p class="sub">출처: 배선일정 엑셀(정리_배선일정, 정리_판매데이터)</p>
        <div class="tb"><label>목적지 검색<input id="b-q" type="search" placeholder="목적지, 국가, 강종" value="${esc(st.q || '')}"></label>
          <label>정렬<select id="b-ord"><option value="">내림차순</option><option value="1"${st.asc ? ' selected' : ''}>오름차순</option></select></label>
          <label class="ck"><input type="checkbox" id="b-only"${st.only ? ' checked' : ''}>수정 건만</label>
          <span class="lgd">두께 구성<i class="tk0"></i>극박<i class="tk1"></i>박물<i class="tk2"></i>중물<i class="tk3"></i>후물</span>
          <span class="cnt">${nShown} / ${nAll}건</span></div>
        <div class="xw"><table class="x ship"><thead><tr><th>목적지</th><th>강종</th><th>국가</th><th>월평균 물량(톤)</th><th>출항 시작일</th><th>출항 끝일</th><th>생산 반순</th><th>최근 3개월 월평균(톤)</th><th class="bc-h">두께 구성</th><th class="sp-h">주요 규격, 비고</th></tr></thead><tbody>${ship}</tbody></table></div></section>
      <section class="xl" id="s2"><div class="hd"><span class="no">2</span><h2>T/Hr, 가동 중</h2></div>
        <p class="sub">MES 코일 실적 ${ym(T.from)}부터 ${ym(T.to)}까지 ${f1(T.coils || 0)}코일에서 왔습니다. 옅은 숫자는 그 구간 실적이 없어 같은 두께 평균을 쓴 값이고, AL-STS는 2CGL AL 값을 씁니다.</p>
        <div class="tabs" role="group" aria-label="라인과 강종">${tabs}</div>
        <div class="xw">${rate}</div></section>
      <section class="xl" id="s3"><div class="hd"><span class="no">3</span><h2>소재 리드타임</h2></div><p class="sub">출처: 팀 제공 리드타임, 판생 엑셀, 11/19 회의(단위: 일)</p>
        <div class="xw"><table class="x"><thead><tr><th>항목</th><th>일수</th><th>비고</th></tr></thead><tbody>${lead}</tbody></table></div></section>
      <section class="xl" id="s4"><div class="hd"><span class="no">4</span><h2>전환 규칙값</h2></div>
        <div class="xw"><table class="x"><thead><tr><th>항목</th><th>값</th><th>단위</th></tr></thead><tbody>${rule}
          <tr><td class="nm">M/C와 S/D 요일</td><td>평일만</td><td>주말 금지</td></tr></tbody></table></div></section>
      <section class="xl" id="s5"><div class="hd"><span class="no">5</span><h2>상한 일수, 강종별</h2></div>
        <p class="sub">가동포털 계획 규칙(①-2)과 같은 값입니다. 어느 쪽에서 바꿔도 같이 바뀌고, 저장하고 적용하면 가동포털 월간 가동을 다시 계산합니다</p>
        <div id="g-box">${grBox()}</div></section>
      <section class="xl" id="s6"><div class="hd"><span class="no">6</span><h2>수정 내역</h2></div><p class="sub">기본값과 다른 값, 가동포털 엔진 반영은 승인 뒤</p>
        <div class="chg">${chg}</div></section>
      <div id="x-act" class="x-act" hidden></div><div id="x-toast" class="x-toast" role="status" hidden></div>`;
    document.querySelectorAll('input[data-k]').forEach((i) => {
      i.addEventListener('input', () => { const k = i.dataset.k, v = num(i.value), d = i.dataset.d === '' ? null : +i.dataset.d, cur = PS.get(k, d);
        if (v === cur || (v == null && !PS.isSet(k)) || (v != null && !isFinite(v))) delete pend[k]; else pend[k] = v;
        i.parentElement.classList.toggle('pend', k in pend); bar(); });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { pend = {}; draw(); } }); });
    document.querySelectorAll('[data-rst]').forEach((b0) => b0.addEventListener('click', () => { const k = b0.dataset.rst; PS.set(k, null, `기준값 되돌림: ${NMK(k)}`); toastMsg = '기본값 복원'; }));
    document.querySelectorAll('[data-rk]').forEach((b0) => b0.addEventListener('click', () => { st.rk = b0.dataset.rk; draw(); }));
    let tm; $('b-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; draw(); const x = $('b-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 300); };
    $('b-ord').onchange = (e) => { st.asc = !!e.target.value; draw(); };
    $('b-only').onchange = (e) => { st.only = e.target.checked; draw(); };
    grBind();
    bar();
    if (toastMsg) { const t = $('x-toast'); t.innerHTML = `<span>${esc(toastMsg)}</span>${canUndo ? '<button type="button" id="x-undo">되돌리기</button>' : ''}`; t.hidden = false; toastMsg = '';
      if ($('x-undo')) $('x-undo').onclick = () => { if (PS.undo()) { toastMsg = '되돌림'; canUndo = false; } };
      clearTimeout(toastT); toastT = setTimeout(() => { const t2 = $('x-toast'); if (t2) t2.hidden = true; canUndo = false; }, 6000); }
  }
  function bar() { const b = $('x-act'), n = Object.keys(pend).length; b.hidden = !n; if (!n) return;
    b.innerHTML = `<span>수정한 값 <b>${n}건</b></span><button type="button" class="b1" id="x-save">저장</button><button type="button" class="b2" id="x-clr">지우기</button><span class="hint">Enter 저장, Esc 지우기</span>`;
    $('x-save').onclick = save; $('x-clr').onclick = () => { pend = {}; draw(); }; }
  let toastMsg = '', toastT = null, canUndo = false;
  function save() { const pairs = Object.entries(pend); if (!pairs.length) return; pend = {}; toastMsg = `${pairs.length}건 저장했습니다. 계산에 바로 반영됩니다`; canUndo = true; PS.setMany(pairs, `기준값 ${pairs.length}건 수정: ${pairs.slice(0, 3).map(([k, v]) => `${k.slice(2)} = ${v == null ? '기본값' : v}`).join(' · ')}`); }
  /* 5. 상한 일수(강종별) — 공유 저장소 cgl_tf_rules(가동포털 rules.html 과 같은 표·같은 암호화). 11/23 사용자 '어느 한쪽에서 변경하면 반대쪽도 동일하게' */
  const GRK = [['도금수출 AL', '도금 수출 AL'], ['도금수출 AZ', '도금 수출 AZ'], ['도금수출 MAC', '도금 수출 MAC'], ['도금국내 AL', '도금 국내 AL'], ['도금국내 AZ', '도금 국내 AZ'], ['도금국내 MAC', '도금 국내 MAC'],
    ['자동차 STS 임가공', '자동차 STS 임가공'], ['임가공 MAC', '임가공 MAC'], ['자동차 STS 직판', '자동차 STS 직판'], ['자동차 AL', '자동차 AL'], ['자동차 MAC', '자동차 MAC']];   // = cglplan/tfrules.py GRADE_KEYS · rules.html GRK
  const GDEF = { '도금수출 AL': 15, '도금수출 AZ': 8, '도금수출 MAC': 8, '도금국내 AL': 25, '도금국내 AZ': 13, '도금국내 MAC': 13, '자동차 STS 임가공': 3, '임가공 MAC': 1, '자동차 STS 직판': 40, '자동차 AL': 35, '자동차 MAC': 40 };
  const TR_API = () => GP.SUPABASE_URL + '/rest/v1/cgl_tf_rules', TR_KEY = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K', DEF_AT = '2026-11-09T06:00:00+00:00';
  const TRH = { apikey: TR_KEY, Authorization: 'Bearer ' + TR_KEY, 'Content-Type': 'application/json' };
  const PWv = () => { try { return localStorage.getItem('cgl-analysis-pw') || ''; } catch (e) { return ''; } };
  let GR = { st: '불러오는 중', A: null, L: null, msg: '' };
  async function grLoad() {
    try {
      const pw = PWv(); const IG = await GP.decryptJSON(await GP.latest('integrated.enc.json'), pw); GR.A = IG.tfRules || {};
      const r = await fetch(TR_API() + '?select=id,at,who,apply,payload&order=id.desc&limit=30', { headers: TRH }); if (!r.ok) throw new Error('공유 저장소 읽기 ' + r.status);
      GR.L = null; for (const x of await r.json()) { try { const o = await GP.decryptJSON(JSON.parse(x.payload), pw); if (o && o.days && o.stockMax) { GR.L = Object.assign({ id: x.id, at: x.at, who: x.who, apply: x.apply }, o); break; } } catch (e) { /* 암호 다른 줄 */ } }
      GR.st = '';
    } catch (e) { GR.st = `불러오지 못했습니다(${e.message})`; }
    const b = $('g-box'); if (b) { b.innerHTML = grBox(); grBind(); }
  }
  const grCur = () => { const L = GR.L && String(GR.L.at) > DEF_AT ? GR.L : null; return Object.assign({}, GDEF, (GR.A && GR.A.grade) || {}, (L && L.grade) || {}); };
  function grBox() {
    if (GR.st) return `<p class="none">${esc(GR.st)}</p>`;
    const A = (GR.A && GR.A.grade) || {}, C = grCur(), L = GR.L;
    const rows = GRK.map(([k, nm]) => `<tr><td class="nm">${esc(nm)}</td><td class="num">${A[k] != null ? `${A[k]}일` : '<span class="mu">그룹 일수</span>'}</td><td class="in"><input inputmode="numeric" data-g="${esc(k)}" value="${C[k]}" aria-label="${esc(nm)} 상한 일수"></td></tr>`).join('');
    return `<div class="xw"><table class="x"><thead><tr><th>판매 그룹, 강종</th><th>지금 계획</th><th>바꿀 값(일)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="sub">${L ? `마지막 저장 ${esc(String(L.at).slice(5, 16).replace('T', ' '))} ${esc(L.who || '')}${L.apply ? ', 적용 요청' : ''}` : '저장 기록 없음'}${GR.msg ? ` · <b>${esc(GR.msg)}</b>` : ''}</p>
      <div class="tb"><button type="button" class="b1" id="g-apply">저장하고 적용</button><a href="rules.html#edit">가동포털 계획 규칙에서 보기</a></div>`;
  }
  function grBind() {
    const b = $('g-apply'); if (!b) return;
    b.onclick = async () => {
      const g = {}; let bad = false;
      document.querySelectorAll('input[data-g]').forEach((i) => { const v = num(i.value); if (v == null || !isFinite(v) || v < 0 || v > 120) bad = true; g[i.dataset.g] = v; });
      if (bad) { GR.msg = '0~120일 사이로 입력'; $('g-box').innerHTML = grBox(); grBind(); return; }
      const L = GR.L && String(GR.L.at) > DEF_AT ? GR.L : null, A = GR.A || {};
      const base = L || { days: A.days, target: A.target, stockMax: A.stockMax, plating: A.plating, replan: A.replan };
      const o = { days: base.days, target: base.target, stockMax: base.stockMax, plating: base.plating, replan: base.replan, grade: g, memo: '판생 기준값에서 강종별 상한 일수 수정' };
      if (!o.days || !o.stockMax) { GR.msg = '지금 계획 수치를 못 읽어 저장하지 않았습니다'; $('g-box').innerHTML = grBox(); grBind(); return; }
      b.disabled = true;
      try {
        const env = await GP.encryptJSON(o, PWv(), 'tf_rules');
        const r = await fetch(TR_API(), { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, TRH), body: JSON.stringify({ who: (CT.me && CT.me()) || '판생', payload: JSON.stringify(env), apply: true }) });
        if (!r.ok) throw new Error('저장 실패 ' + r.status);
        GR.msg = '저장했습니다. 다음 정시에 가동포털 월간 가동을 다시 계산합니다'; await grLoad();
      } catch (e) { GR.msg = e.message; const x = $('g-box'); if (x) { x.innerHTML = grBox(); grBind(); } }
    };
  }
  PS.on(() => { if (B) draw(); });
  PS.boot((b) => { if (!b) { $('ct-main').innerHTML = '<p>자료 없음</p>'; return; } B = b; draw(); grLoad(); if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); } });
})();
