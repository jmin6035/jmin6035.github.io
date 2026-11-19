/* 판생 기준값(11/19 사용자 '소재 리드타임·입항일·T/Hr 같은 숫자는 전부 한곳에 모아 두고 우리가 수정할 수 있어야') —
   배선일정(목적지별 출항 기간) · 시간당 톤(라인·강종·두께·폭) · 소재 리드타임 · 전환 규칙값. 노란 칸을 고치고 [저장] → 공유 저장소(K|표|키) → 모든 계산이 이 값을 씀.
   칸을 비우고 저장하면 기본값으로 돌아감. 고친 칸은 굵게 + 아래 작은 글씨로 기본값. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (v) => (v == null || v === '' ? '' : (Math.round(v * 10) / 10).toLocaleString('ko-KR'));
  const num = (t) => { const x = String(t).replace(/[,\s]/g, ''); return x === '' ? null : +x; };
  const ym = (v) => { const x = String(v || '').replace(/-/g, ''); return x.length >= 6 ? `${x.slice(0, 4)}년 ${+x.slice(4, 6)}월` : ''; };
  let B, pend = {};
  /* 입력 칸 하나: key = K|… , d = 기본값 */
  const cell = (key, d, fmt = f1) => { const k = `K|${key}`, set = PS.isSet(k), v = k in pend ? pend[k] : PS.kv(key, d);
    return `<td class="in${set ? ' set' : ''}${k in pend ? ' pend' : ''}"><input inputmode="decimal" data-k="${esc(k)}" data-d="${d == null ? '' : d}" value="${v == null ? '' : fmt(v)}" aria-label="${esc(key)}">${set ? `<small>기본 ${d == null ? '없음' : fmt(d)}</small>` : ''}</td>`; };
  function draw() {
    const T = B.rateTab, SS = B.shipSched || {}, LD = B.lead || [];
    /* ① 배선일정 */
    const GN = { '도금수출|AL': '도금수출 AL', '도금수출|AZ': '도금수출 AZ', '도금수출|MAC': '도금수출 MAC', '자동차|AL': '자동차 AL(수출)', '자동차|MAC': '자동차 MAC(수출)', '자동차|STS': '자동차 AL-STS(수출)' };
    let ship = '';
    for (const [gk, rows] of Object.entries(SS)) { const [g, f] = gk.split('|');
      ship += `<tr class="grp"><td colspan="5">${esc(GN[gk] || gk)} · 목적지 ${rows.length}곳 · 월평균 ${f1(rows.reduce((a, x) => a + x[1], 0))}t</td></tr>`;
      for (const x of rows.slice().sort((a, b) => a[2] - b[2] || b[1] - a[1])) { const kk = `ship|${g}|${f}|${x[0]}`, a = PS.kv(`${kk}|a`, x[2]), b = PS.kv(`${kk}|b`, x[3]);
        ship += `<tr><td>${esc(x[0])}</td>${cell(`${kk}|t`, x[1])}${cell(`${kk}|a`, x[2], String)}${cell(`${kk}|b`, x[3], String)}<td>${b - a >= 10 ? '한 달 내내(반순으로 나눔)' : `${Math.ceil(a / 5)}반순`}</td></tr>`; } }
    /* ② 시간당 톤 */
    const tb = (i) => (i === 0 ? `${T.thk[0]} 미만` : i === T.thk.length ? `${T.thk[i - 1]} 이상` : `${T.thk[i - 1]}~${T.thk[i]}`), wb = (i) => (i === 0 ? `${T.wdt[0]} 미만` : i === T.wdt.length ? `${T.wdt[i - 1]} 이상` : `${T.wdt[i - 1]}~${T.wdt[i]}`);
    const rate = [['1CGL', 'AZ'], ['1CGL', 'AL'], ['2CGL', 'MAC'], ['2CGL', 'AL']].map(([l, f]) => {
      const rows = T.thk.concat([0]).map((_, ti) => `<tr><td><b>${tb(ti)}</b></td>${T.wdt.concat([0]).map((__, wi) => { const k = `${l}|${f}|${ti}|${wi}`, r = T.rate[k], fb = T.rate[`${l}|${f}|${ti}`] || T.rate[`${l}|${ti}`] || T.rate[l];
        return r ? cell(`rate|${k}`, r * 60) : cell(`rate|${k}`, null).replace('<td class="in', `<td title="" class="in none`).replace('value=""', `value="" placeholder="${f1(fb * 60)}"`); }).join('')}</tr>`).join('');
      return `<div class="rt"><h3>${l} ${f}</h3><table class="x"><thead><tr><th>두께 \\ 폭</th>${T.wdt.concat([0]).map((_, wi) => `<th>${wb(wi)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; }).join('');
    /* ③ 리드타임 ④ 규칙값 */
    const lead = LD.map((x) => `<tr><td>${esc(x.name)}</td>${cell(`lead|${x.id}`, x.days, String)}<td>${esc(x.note)}</td></tr>`).join('');
    const rule = [['rule|swT', '전환(M/C·S/D) 첫날 생산 톤', B.swT, 't', String], ['rule|swH', '전환일 가동시간', 15, '시간', String], ['rule|opf|1CGL', '1CGL 하루 가동률(시간당 톤에 곱함)', (B.opf || {})['1CGL'] || 0.95, '0~1', (v) => String(v)], ['rule|opf|2CGL', '2CGL 하루 가동률(시간당 톤에 곱함)', (B.opf || {})['2CGL'] || 0.95, '0~1', (v) => String(v)]]
      .map(([k, nm, d, u, fm]) => `<tr><td>${nm}</td>${cell(k, d, fm)}<td>${u}</td></tr>`).join('');
    const nSet = Object.keys(PS.baseOver()).filter((k) => k.startsWith('K|')).length;
    $('ct-main').innerHTML = `
      <div class="xl-top"><h1>판생 기준값</h1><p>계산에 쓰는 숫자를 한곳에 모았습니다. 노란 칸을 고치고 저장하면 모든 계산이 그 값을 씁니다. 칸을 비우고 저장하면 기본값으로 돌아갑니다. 지금 고쳐 쓴 칸 <b>${nSet}개</b></p>
        <nav><a href="pan/base.html#s1">배선일정</a><a href="pan/base.html#s2">시간당 톤</a><a href="pan/base.html#s3">소재 리드타임</a><a href="pan/base.html#s4">전환 규칙값</a></nav></div>
      <section class="xl" id="s1"><h2>1. 배선일정 · 목적지별 출항 기간 <small>출처: 배선일정 엑셀(정리_배선일정) · 주문 없는 수출 판매계획분을 이 기간 안에 생산</small></h2>
        <table class="x"><thead><tr><th>목적지</th><th>월평균 물량(t)</th><th>출항 시작일</th><th>출항 끝일</th><th>생산 반순</th></tr></thead><tbody>${ship}</tbody></table></section>
      <section class="xl" id="s2"><h2>2. 시간당 톤(가동 중) <small>출처: MES 코일 실적 ${ym(T.from)}부터 ${ym(T.to)}까지 · 빈 칸은 실적이 없어 옅은 숫자(같은 두께 평균)를 씀 · AL-STS는 2CGL AL 값을 씀</small></h2><div class="rts">${rate}</div></section>
      <section class="xl" id="s3"><h2>3. 소재 리드타임(일) <small>출처: 소재 유형별 리드타임(팀 제공) · 판생 엑셀 주문 시트 · 11/19 회의</small></h2>
        <table class="x w60"><thead><tr><th>항목</th><th>일수</th><th>비고</th></tr></thead><tbody>${lead}</tbody></table></section>
      <section class="xl" id="s4"><h2>4. 전환 규칙값</h2><table class="x w60"><thead><tr><th>항목</th><th>값</th><th>단위</th></tr></thead><tbody>${rule}
        <tr><td>M/C·S/D 요일</td><td>평일만</td><td>주말 금지(11/19)</td></tr></tbody></table></section>
      <div id="x-act" class="x-act" hidden></div>`;
    document.querySelectorAll('input[data-k]').forEach((i) => { i.addEventListener('input', () => { const k = i.dataset.k, v = num(i.value), d = i.dataset.d === '' ? null : +i.dataset.d, cur = PS.get(k, d);
        if (v === cur || (v == null && !PS.isSet(k)) || (v != null && !isFinite(v))) delete pend[k]; else pend[k] = v; i.parentElement.classList.toggle('pend', k in pend); bar(); });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); }); });
    bar();
  }
  function bar() { const b = $('x-act'), n = Object.keys(pend).length; b.hidden = !n; if (!n) return;
    b.innerHTML = `<span>고친 칸 <b>${n}개</b></span><button type="button" class="b1" id="x-save">저장</button><button type="button" class="b2" id="x-clr">지우기</button><span>저장하면 모든 계산에 바로 반영되고 누가 언제 고쳤는지 기록됩니다</span>`;
    $('x-save').onclick = save; $('x-clr').onclick = () => { pend = {}; draw(); }; }
  function save() { const pairs = Object.entries(pend); if (!pairs.length) return; pend = {}; PS.setMany(pairs, `기준값 ${pairs.length}칸 고침: ${pairs.slice(0, 3).map(([k, v]) => `${k.slice(2)} = ${v == null ? '기본값' : v}`).join(' · ')}`); }
  PS.on(() => { if (B) draw(); });
  PS.boot((b) => { if (!b) { $('ct-main').innerHTML = '<p>자료 없음</p>'; return; } B = b; draw(); if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); } });
})();
