/* 소재 발주 검토: published/procure.enc.json (tools/procure_data.py --out)
   필요 주차 × 소재마다 → 재고·입고예정 충당 → 부족분을 '남은 일수 안에 들어오는 업체' 중 배정이 큰 순으로 보여 줌.
   업체 기준정보·입고예정·주문재 목록·판단(업체/수량/상태/메모)은 이 브라우저(localStorage)에 저장, JSON 으로 주고받기 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw', ST_KEY = 'cgl-procure-v0';
  // 공유(10/31): Supabase cgl_procure_state = 분석 암호로 잠근 상태 스냅샷을 추가만, 최신 행이 현재 공유 상태(결정 기록과 같은 방식, 옛 ui/share.js 대체)
  const SHR = GP.SUPABASE_URL + '/rest/v1/cgl_procure_state', SHK = 'sb_publishable_BlfAhxz_v3yg6iJw_nbRaA_YMFAOS7K';   // 공개용 키(표 권한 = 읽기·추가만)
  const SHH = { apikey: SHK, Authorization: 'Bearer ' + SHK, 'Content-Type': 'application/json' };
  const sharePw = () => { try { return localStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; } };
  async function sharePush(o) {
    const env = await GP.encryptJSON(o, sharePw(), 'procure_state');
    const r = await fetch(SHR, { method: 'POST', headers: SHH, body: JSON.stringify({ payload: JSON.stringify(env) }) });
    if (!r.ok) throw new Error('올리기 실패 ' + r.status);
  }
  async function sharePull() {
    const r = await fetch(SHR + '?select=payload&order=id.desc&limit=1', { headers: SHH });
    if (!r.ok) throw new Error('받기 실패 ' + r.status);
    const x = (await r.json())[0];
    return x ? GP.decryptJSON(JSON.parse(x.payload), sharePw()) : null;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (s) => { const p = String(s).slice(5, 10).split('-'); return `${+p[0]}/${+p[1]}`; };
  const addD = (s, k) => { const d = new Date(s + 'T00:00:00Z'); if (isNaN(d)) return ''; d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
  const PL = { C: '컬러', G: '도금 FH' };
  const G_CODES = 'FHNTY';
  const plantOf = (code) => (G_CODES.includes(code) ? 'G' : 'C');
  const PERIODS = [['w1', '1주차'], ['w4', '2~4주'], ['w8', '5~8주'], ['w9', '9주 이후'], ['all', '전체']];
  const STATUS = ['판단대기', '요청', '발주됨', '보류'];
  let D = null, S = null, tab = 'cal', period = 'w4', plantF = 'all', open = {}, onlyShort = true, justOpened = null, lastTab = null;

  const PC = ProcCalc.make(() => ({ D, S }));
  const { defaults, load, save, units, monday, autoArr, judge } = PC;

  const inPeriod = (j) => {
    const w = diff(j.wk, monday(S.today)) / 7;
    return period === 'all' || (period === 'w1' && w < 1) || (period === 'w4' && w >= 1 && w < 4) || (period === 'w8' && w >= 4 && w < 8) || (period === 'w9' && w >= 8);
  };
  const KIND = { ok: ['재고 충당', 'good'], normal: ['배정대로 나눔', 'good'], alt: ['일부 다른 업체로', 'warn'], adjust: ['조정 필요', 'bad'], check: ['기발주 확인', 'warn'], nosup: ['업체 없음', 'bad'], pos: ['포스코 지급(임가공)', 'good'] };
  const supName = (s) => (s ? ((D && D.supNames || {})[s.sup] || (s.name && s.name !== s.sup ? s.name : `업체 코드 ${s.sup}(이름 확인 중)`)) : '-');

  /* ---------- 화면 ---------- */
  const card = (id, title, sm, body) => `<section class="card" id="${id}"><h2>${esc(title)} ${sm ? `<small>${esc(sm)}</small>` : ''}</h2>${body}</section>`;
  const codeNm = (c) => D.matCode[c] || c || '-';                 // 소재는 이름으로만 표시(내부 키는 품명코드)
  const toCode = (v) => { const x = String(v || '').trim(); if (!x) return ''; const u = x.toUpperCase(); const hit = Object.entries(D.matCode).find(([, n]) => n.toUpperCase() === u || n.toUpperCase().replace(/[^A-Z0-9가-힣]/g, '') === u.replace(/[^A-Z0-9가-힣]/g, '')); return hit ? hit[0] : (u.length === 1 && D.matCode[u] ? u : ''); };
  const matSel = (attr, cur) => `<select ${attr} aria-label="소재"><option value="">-</option>${Object.entries(D.matCode).sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;

  function board() {
    const J = judge(), V0 = J.filter((j) => inPeriod(j) && UI.inScope(j.plant)), V = V0;
    const sum = (f) => V.filter(f).reduce((a, j) => a + j.short, 0);
    const cnt = (k) => V.filter((j) => j.kind === k).length;
    const near = J.flatMap((j) => (j.parts || []).filter((p) => diff(p.dl, S.today) >= 0 && diff(p.dl, S.today) <= 14).map((p) => ({ ...j, deadline: p.dl, p }))).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const nAdj = cnt('adjust') + cnt('nosup'), nChk = cnt('check');
    const kpiBox = (tone, l, v, unit, b, ck, extra = '') => `<div class="kpi tone-${tone}" data-rk="k-${ck}"><div class="l">${l}</div><div class="v ${extra}"><b data-count="${v}" data-ck="${ck}">${n0(v)}</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    const kp = `<div class="kpis">
      ${kpiBox('brand', '발주 필요(이 기간)', Math.round(sum(() => true)), 't', `${V.filter((j) => j.short >= 1).length}건 · 재고·입고예정 충당 후`, 'need')}
      ${kpiBox(cnt('alt') ? 'warn' : 'good', '일부 다른 업체로', cnt('alt'), '건', `리드타임 초과 몫 이관 · ${n0(sum((j) => j.kind === 'alt'))}t`, 'alt', cnt('alt') ? 'wv' : '')}
      <div class="kpi tone-${nAdj ? 'bad' : nChk ? 'warn' : 'good'}" data-rk="k-adj"><div class="l">기발주 확인 · 조정 필요</div><div class="v ${nAdj ? 'bv' : nChk ? 'wv' : ''}"><b data-count="${nChk}" data-ck="chk">${nChk}</b> · <b data-count="${nAdj}" data-ck="adj">${nAdj}</b><small>건</small></div><div class="b">새 발주 불가 · ${n0(sum((j) => ['adjust', 'nosup', 'check'].includes(j.kind)))}t</div></div>
      ${kpiBox(near.length ? 'warn' : 'good', '2주 내 발주 마감(업체별)', near.length, '건', near[0] ? `최우선 ${esc(codeNm(near[0].code))} ${esc(supName(near[0].p.s))} ${n0(near[0].p.t)}t · ${md(near[0].deadline)} 마감` : '-', 'near')}</div>`;
    const ctl = `<div class="bar">
      <div class="tabs">${PERIODS.map(([k, n]) => `<button type="button" data-per="${k}" aria-pressed="${k === period}">${n}</button>`).join('')}</div>
      <label class="onlyshort"><input type="checkbox" id="p-only" ${onlyShort ? 'checked' : ''}> 발주 필요만 보기 <span class="muted">(${V.filter((j) => j.short >= 1).length}/${V.length})</span></label>
      <span class="sp"></span>
      <button type="button" class="btn primary" id="p-export">구매 요청서 내보내기(.xlsx)</button></div>`;
    const GRP = { adjust: 0, nosup: 0, alt: 0, check: 1, ok: 3, pos: 4 }, gi = (j) => (GRP[j.kind] != null ? GRP[j.kind] : 2);   // 조치 묶음: 0 지금 조치 · 1 기발주 확인 · 2 정상 발주 · 3 충당 · 4 발주 대상 아님
    const GH = ['지금 조치 — 새 발주 불가(재고 전환·투입 순서·대체 업체)', '기발주 확인 — 입고예정 확인 필요', '발주 예정 — 마감 전 발주', '충당 — 재고·입고예정 충분', '발주 대상 아님'];
    const VR = (onlyShort ? V.filter((j) => j.short >= 1) : V).slice().sort((a, b) => gi(a) - gi(b) || (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
    let lastG = -1;
    const rows = VR.map((j) => {
      const [kn, kc] = KIND[j.kind], d = j.dec;
      const okL = j.cand.filter((x) => j.specOk(x)).map((x) => +x.lt), minLT = okL.length ? Math.min(...okL) : null;
      const specNote = j.cand.some((x) => !j.specOk(x) && +x.lt <= j.left) ? ' · 더 빠른 업체는 두께 범위 밖' : '';
      const why = j.kind === 'pos' ? 'AL-STS 임가공 소재 — 포스코가 지급(팀 확인 10/12), 발주 대상 아님' : j.kind === 'ok' ? '재고·입고예정으로 충당'
        : j.kind === 'nosup' ? '등록된 업체 없음 → 업체 기준정보에 추가'
          : j.kind === 'check' ? `${minLT == null ? '두께 범위에 맞는 등록 업체 없음' : `남은 ${j.left}일 < 리드타임(최단 ${minLT}일)`} → 이미 발주돼 있어야 할 양(입고예정에 기발주 입력)${specNote}`
          : j.kind === 'adjust' ? `${minLT == null ? '두께 범위에 맞는 등록 업체 없음' : `남은 ${j.left}일 < 최단 LT ${minLT}일`} → 재고 전환·투입 순서 변경·자가재 대체 검토${specNote}`
            : `${j.parts.map((p) => `${esc(supName(p.s))} <b>${n0(p.t)}t</b> · 마감 ${md(p.dl)}`).join(' / ')}${j.kind === 'alt' ? ` <span class="muted">(${j.split.filter((x) => x.late && x.from >= 1).map((x) => `${esc(supName(x.s))} LT ${x.s.lt}일 > 남은 ${j.left}일 → ${n0(x.from)}t 넘김`).join(', ')})</span>` : ''}`;
      const isOpen = open[j.key], g = gi(j), gh = g !== lastG ? `<tr class="grp-h g${g}"><td colspan="7">${GH[g]} <span class="muted">${VR.filter((x) => gi(x) === g).length}건 · ${n0(VR.filter((x) => gi(x) === g).reduce((a, x) => a + x.short, 0))}t</span></td></tr>` : ''; lastG = g;
      const decSum = j.short >= 1 ? `<button type="button" class="tg dsum" aria-expanded="${!!isOpen}"><span class="ds ${d.status && d.status !== '판단대기' ? 'set' : ''}">${esc(d.status || '판단대기')}</span>${j.parts.length ? ` <span class="muted">${j.parts.length}개 업체 · ${n0(j.parts.reduce((a, p) => a + p.t, 0))}t</span>` : ''}${d.memo ? ' <span class="muted">· 메모</span>' : ''} <b class="go">${isOpen ? '닫기 ▴' : '결정 입력 ▾'}</b></button>` : '<span class="muted">발주 불필요</span>';
      return gh + `<tr class="u ${isOpen ? 'on' : ''}" data-k="${esc(j.key)}">
        <td class="l"><button type="button" class="tg" aria-expanded="${!!isOpen}" aria-label="용도 보기">${isOpen ? '▾' : '▸'}</button> ${md(j.first)} <span class="muted">(입고 ${j.left >= 0 ? 'D-' + j.left : -j.left + '일 지남'})</span></td>
        <td class="l">${PL[j.plant]} <b>${esc(codeNm(j.code))}</b>${j.thk ? ` <span class="muted">${j.thk[0]}~${j.thk[1]}mm</span>` : ''}</td>
        <td>${n0(j.t)}${j.est >= 1 ? ` <span class="muted">· 추정 ${n0(j.est)}</span>` : ''}</td><td>${n0(j.cover)}</td><td><b>${j.short >= 1 ? n0(j.short) : '·'}</b></td>
        <td class="l jd"><span class="st ${kc}">${kn}</span><div class="why">${why}</div></td>
        <td class="l dec">${decSum}</td></tr>
        ${isOpen ? `<tr class="ux" data-k="${esc(j.key)}"><td colspan="7"><div class="${j.key === justOpened ? 'drop' : ''}">
          <div class="xh">입고 필요일 <b>${md(j.needBy)}</b> <span class="muted">(첫 사용 ${md(j.first)} − 투입 여유 ${j.plant === 'C' ? S.safetyC : S.safetyG}일)</span> · ${j.left >= 0 ? `남은 <b>${j.left}일</b>` : `<b class="neg">${-j.left}일 지남</b>`} · 발주 필요 <b>${n0(j.short)}t</b></div>
          ${j.short >= 1 ? `<table class="t sp"><thead><tr><th class="l">업체</th><th>27년 배정</th><th>리드타임</th><th>발주 마감</th><th class="l">맞출 수 있나</th><th>발주량(t)</th></tr></thead><tbody>${j.cand.map((s) => { const x = j.split.find((y) => y.s === s), ok = j.specOk(s), dl = addD(j.needBy, -s.lt), lateD = diff(S.today, dl);
            return `<tr class="${x && x.t >= 1 && !x.late ? 'on' : ''}"><td class="l"><b>${esc(supName(s))}</b>${(s.codes || []).length > 1 ? ` <span class="muted">${s.codes.join('·')}</span>` : ''}</td><td>${Math.round((s.share || 0) * 100)}%</td><td>${s.lt}일</td><td>${md(dl)}</td>
              <td class="l">${!ok ? '<span class="muted">두께 범위 밖</span>' : lateD > 0 ? `<span class="neg">마감 ${lateD}일 지남</span>${x && x.from >= 1 ? ` <span class="muted">→ ${n0(x.from)}t 넘김</span>` : ''}` : `<span class="pos">가능</span>${x && x.moved >= 1 ? ` <span class="muted">+ 넘겨받음 ${n0(x.moved)}t</span>` : ''}`}</td>
              <td>${x ? `<input data-f="q:${esc(s.sup)}" type="number" min="0" step="10" value="${Math.round(x.t)}" aria-label="${esc(supName(s))} 발주량">` : '<span class="muted">-</span>'}</td></tr>`; }).join('')}
            <tr class="tot"><td class="l">합계</td><td></td><td></td><td></td><td></td><td><b>${n0(j.split.reduce((a, x) => a + x.t, 0))}</b></td></tr></tbody></table>
          ${!j.parts.length ? '<p class="small neg">전 업체 리드타임 초과 — 위 수량은 참고값 · 재고 전환·투입 순서·자가재 대체 우선 검토</p>' : ''}
          <div class="dg2"><label>상태<select data-f="status" aria-label="상태">${STATUS.map((x) => `<option ${x === (d.status || '판단대기') ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>메모<input class="memo" data-f="memo" type="text" value="${esc(d.memo || '')}" placeholder="예: 10/14 구매팀 발주 완료" aria-label="메모"></label></div>` : ''}
          <div class="use"><b>무엇을 만들려고</b> ${j.use.slice().sort((a, b) => b[3] - a[3]).slice(0, 12).map((r) => `<span><i>${esc(r[0])}</i> ${esc(r[1])} ${esc(r[2])} <b>${n0(r[3])}t</b></span>`).join('')}</div></div></td></tr>` : ''}`;
    }).join('');
    return card('p-board', '판단 보드', `기준일 ${S.today} · 필요일 = 컬러 투입 ${S.safetyC}일 · 도금 투입 ${S.safetyG}일 전 입고`, kp + ctl + `
      <div class="scroll"><table class="t bd"><thead><tr><th class="l">첫 사용일</th><th class="l">소재</th><th>필요(t)</th><th>충당</th><th>발주 필요</th><th class="l">판단 · 사유</th><th class="l">결정</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="c muted">이 기간에 해당 없음</td></tr>'}</tbody></table></div>
      <p class="small">단위 = 필요 주차 × 소재 · 충당 = 재고 + 필요일까지 입고예정 · 남은 일수 = 첫 필요일 − 투입 여유(컬러 ${S.safetyC}·도금 ${S.safetyG}일) − 기준일 · 부족량 = 27년 배정 비중으로 업체 분배, 리드타임 초과 몫은 다른 배정 업체로 · 수량 수정은 이 브라우저에 저장</p>`);
  }

  function arrivals() {
    const rows = S.arr.map((a, i) => `<tr data-i="${i}"><td><input data-a="sup" value="${esc(a.sup)}" aria-label="업체"></td><td>${matSel('data-a="code"', a.code)}</td><td><input data-a="t" type="number" value="${esc(a.t)}" aria-label="수량"></td><td><input data-a="date" type="date" value="${esc(a.date)}" aria-label="입고예정일"></td><td><input data-a="po" value="${esc(a.po || '')}" aria-label="발주번호"></td><td><input data-a="memo" value="${esc(a.memo || '')}" aria-label="메모"></td><td><button type="button" class="x" data-del="arr" data-i="${i}" aria-label="삭제">✕</button></td></tr>`).join('');
    const AA = autoArr().filter((a) => UI.inScope(a.plant)).sort((a, b) => (a.date < b.date ? -1 : 1)), KI = D.knownInfo || {};
    // 소재 × 기간 요약(예정일 지남 · 이번 주 · 다음 주 · 3~4주 · 5주 이후) + 소재별 상세(펼침)
    const wk0 = monday(S.today), BK = [['late', '예정일 지남', (a) => /지남/.test(a.note || '')], ['w0', '이번 주', (a) => a.date < addD(wk0, 7)], ['w1', '다음 주', (a) => a.date < addD(wk0, 14)], ['w2', '3~4주', (a) => a.date < addD(wk0, 28)], ['w4', '5주 이후', () => true]];
    const bOf = (a) => BK.find(([, , f]) => f(a))[0];
    const G = {}; for (const a of AA) { const k = `${a.plant}:${a.code}`; const g = G[k] = G[k] || { plant: a.plant, code: a.code, n: 0, t: 0, b: {}, rows: [] }; g.n++; g.t += a.t; const b = bOf(a); g.b[b] = (g.b[b] || 0) + a.t; g.rows.push(a); }
    const GL = Object.values(G).sort((x, y) => y.t - x.t), tot = (b) => GL.reduce((s_, g) => s_ + (g.b[b] || 0), 0);
    const auto = AA.length ? `<h3>MES 미입고 발주 <small>자동 · ${AA.length}건 · ${n0(AA.reduce((s, a) => s + a.t, 0))}t</small></h3>
      <p class="small">소재별 미입고 잔량 × 예정 시기 · 예정일 = 발주일 + 업체 리드타임(추정) · 예정일 지남 = 내일 입고로 계산(구매팀 확인)${KI.full ? '' : ` · ${KI.from ? `${+KI.from.slice(4, 6)}/${+KI.from.slice(6)}` : ''} 이후 발주만 정확`}</p>
      <div class="scroll"><table class="t arrsum"><thead><tr><th class="l">소재</th>${BK.map(([k, n]) => `<th class="${k === 'late' ? 'late' : ''}">${n}</th>`).join('')}<th>합계</th><th>건수</th></tr></thead><tbody>
      ${GL.map((g) => `<tr><td class="l"><b>${esc(codeNm(g.code))}</b> <small class="muted">${PL[g.plant]}</small></td>${BK.map(([k]) => `<td class="${k === 'late' && g.b[k] ? 'late' : ''}">${g.b[k] ? n0(g.b[k]) : '<span class="muted">·</span>'}</td>`).join('')}<td><b>${n0(g.t)}</b></td><td>${g.n}</td></tr>`).join('')}
      <tr class="sum"><td class="l">합계</td>${BK.map(([k]) => `<td>${n0(tot(k))}</td>`).join('')}<td><b>${n0(AA.reduce((s_, a) => s_ + a.t, 0))}</b></td><td>${AA.length}</td></tr></tbody></table></div>
      ${(KI.stale || []).length ? `<h3 class="late">장기 미입고 — 예정일 ${KI.staleDays || 30}일 이상 지남 · ${KI.stale.length}건 · ${n0(KI.staleT)}t <small>충당 제외 · 구매팀 확인</small></h3>
      <p class="small">미취소 발주 또는 공급 지연 추정 · 충당 계산 제외 · 입고 확인 시 '직접 입력'에 예정일 입력</p>
      <div class="scroll"><table class="t"><thead><tr><th class="l">소재</th><th>업체</th><th>잔량(t)</th><th>발주번호</th><th>원래 예정</th><th>지난 일수</th><th class="l">근거</th></tr></thead><tbody>${KI.stale.filter((a) => UI.inScope(a.plant)).map((a) => `<tr><td class="l"><b>${esc(codeNm(a.code))}</b> <small class="muted">${PL[a.plant]}</small></td><td>${esc((D.supNames || {})[a.sup] || `업체 코드 ${a.sup}`)}</td><td><b>${n0(a.t)}</b></td><td>${esc(a.po)}</td><td>${md(a.eta)}</td><td class="late">${a.days}일</td><td class="l why">${esc(a.note)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h3>소재별 발주 목록 <small>소재를 누르면 발주번호별 잔량</small></h3>
      ${GL.map((g) => `<details class="arrg"><summary><b>${esc(codeNm(g.code))}</b> <small class="muted">${PL[g.plant]}</small> · ${g.n}건 · <b>${n0(g.t)}t</b>${g.b.late ? ` · <span class="late">예정일 지남 ${n0(g.b.late)}t</span>` : ''}</summary>
        <div class="scroll"><table class="t"><thead><tr><th>입고 예정</th><th>업체</th><th>잔량(t)</th><th>발주번호</th><th class="l">근거</th></tr></thead><tbody>${g.rows.map((a) => `<tr><td class="${/지남/.test(a.note || '') ? 'late' : ''}">${md(a.date)}${/지남/.test(a.note || '') ? ' <small>(지남)</small>' : ''}</td><td>${esc((D.supNames || {})[a.sup] || a.sup)}</td><td><b>${n0(a.t)}</b></td><td>${esc(a.po || '')}</td><td class="l why">${esc(String(a.note || '').replace(/^MES 미입고 발주 · /, '').replace(' · 예정일 지남(내일 입고로 봄)', ''))}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}` : '<p class="small">MES 미입고 발주 자료 없음 — 사내 PC 자동 조회 후 표시</p>';
    return card('p-arr', '입고예정 · 기발주 잔량', `MES 자동 ${AA.length}건 + 직접 입력 ${S.arr.length}건`, `
      ${auto}<h3>직접 입력 <small>MES 밖 기발주(수입 등)·날짜 변경</small></h3>
      <div class="bar"><button type="button" class="btn" data-add="arr">+ 줄 추가</button><label class="btn">엑셀 업로드<input type="file" accept=".xlsx" data-up="arr" hidden></label><span class="small">양식: 소재조달_양식_v0.xlsx '입고예정' 시트 (업체 · 소재 · 수량(t) · 입고예정일 · 발주번호 · 메모)</span></div>
      <div class="scroll"><table class="t ed"><thead><tr><th>업체</th><th>소재</th><th>수량(t)</th><th>입고예정일</th><th>발주번호</th><th>메모</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="c muted">없음 — 지금 판단은 재고만으로 충당</td></tr>'}</tbody></table></div>
      <h3>현재 재고(구매소재, 자가 제외)</h3><p class="small">${esc(D.stockNote)}</p>
      <div class="chips">${Object.entries(D.stock).filter(([k, t]) => t >= 1 && UI.inScope(k[0])).sort((a, b) => b[1] - a[1]).map(([k, t]) => `<span class="chip">${PL[k[0]]} ${esc(codeNm(k.slice(2)))} <b>${n0(t)}t</b></span>`).join('')}</div>`);
  }

  function orders() {
    const cut = S.orders.length ? S.orders.map((o) => o.need).sort().pop() : null;
    const rows = S.orders.map((o, i) => `<tr><td class="l">${esc(o.con || '')}</td><td class="l">${esc(o.prod)}</td><td class="l">${esc(o.cust || '')}</td><td>${o.thk || '-'}</td><td>${o.wid || '-'}</td><td>${esc(codeNm(o.code))}</td><td>${n0(o.qty)}</td><td>${md(o.due)}</td><td>${md(o.need)}</td><td>${n0(o.mat)}</td><td><button type="button" class="x" data-del="orders" data-i="${i}" aria-label="삭제">✕</button></td></tr>`).join('');
    return card('p-ord', '주문재 목록 (마케팅)', S.orders.length ? `${S.orders.length}건 · ${md(cut)} 소요분까지 추정치 대신 사용` : '아직 없음 — 판단 보드의 주문재는 추정치', `
      <p class="lead">마케팅 목록 업로드 시 마지막 필요일까지 추정치 대신 목록 수량 사용</p>
      <div class="bar"><label class="btn">엑셀 업로드<input type="file" accept=".xlsx" data-up="orders" hidden></label>${S.orders.length ? '<button type="button" class="btn" data-clear="orders">목록 비우기</button>' : ''}
        <label class="small">납기 → 컬러 투입 <input type="number" id="p-duelead" value="${S.dueLead}" min="0" max="60" style="width:56px">일 전</label>
        <span class="small">양식: '주문재 목록' 시트 (계약번호 · 품명 · 고객 · 두께 · 폭 · 소재 · 수량(t) · 납기)</span></div>
      <div class="scroll"><table class="t"><thead><tr><th class="l">계약번호</th><th class="l">품명</th><th class="l">고객</th><th>두께</th><th>폭</th><th>소재</th><th>제품(t)</th><th>납기</th><th>투입</th><th>구매소재(t)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="c muted">없음</td></tr>'}</tbody></table></div>
      <p class="small">구매소재 = 제품 × 소재/제품 비(실수율) × (1 − 자가재 비중) · 소재 칸 빈칸 = 품명 과거 최다 소재 · 소재명으로 입력(CGI, GALVALUME(AZ) 등)</p>`);
  }

  function suppliers() {
    const L = S.sup.map((s, i) => ({ s, i })).filter(({ s }) => UI.inScope(s.plant)).sort((a, b) => (a.s.plant + a.s.code + String(a.s.prio).padStart(3, '0') < b.s.plant + b.s.code + String(b.s.prio).padStart(3, '0') ? -1 : 1));
    const rows = L.map(({ s, i }) => `<tr data-i="${i}"><td><input type="checkbox" data-s="on" ${s.on ? 'checked' : ''} aria-label="사용"></td><td>${PL[s.plant] || ''}</td><td>${matSel('data-s="code"', s.code)}</td>
      <td class="l"><input data-s="sup" value="${esc(s.sup)}" size="3" aria-label="업체코드"> <input data-s="name" value="${esc(s.name)}" aria-label="업체명"></td>
      <td><input data-s="prio" type="number" min="1" value="${esc(s.prio)}" style="width:52px" aria-label="표시 순서"></td><td><input data-s="lt" type="number" min="0" value="${esc(s.lt)}" style="width:60px" aria-label="리드타임"></td>
      <td class="muted">${s.ltMed != null ? `${s.ltMed}일 · ${s.ltN || 0}건` : '-'}</td><td class="muted">${s.share != null ? Math.round(s.share * 100) + '%' : '-'}</td>
      <td class="muted">${s.thk ? `${s.thk[0]}~${s.thk[1]}` : '-'}</td><td><input data-s="memo" value="${esc(s.memo || '')}" placeholder="정기 마감·MOQ 등" aria-label="메모"></td><td><button type="button" class="x" data-del="sup" data-i="${i}" aria-label="삭제">✕</button></td></tr>`).join('');
    return card('p-sup', '업체 기준정보', '27년 소재 발주 마스터 · 팀 리드타임 표 · 배정 큰 순', `
      <div class="bar"><button type="button" class="btn" data-add="sup">+ 업체 추가</button><button type="button" class="btn" id="p-supreset">처음 값으로</button><span class="small">리드타임 = 발주 → 입고(일), 초기값 팀 표(10/12) · 발주 창 소재(서림 GI·수입 FH·동종 AZ·MAC)는 창 첫날 기준 · 배정 = 27년 톤(복수 업체 균등)</span></div>
      <div class="scroll"><table class="t ed"><thead><tr><th>사용</th><th>공장</th><th>소재</th><th class="l">업체</th><th>우선</th><th>LT(일)</th><th>LT 실적(중앙)</th><th>이력 비중</th><th>두께 범위</th><th>메모</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }

  function basis() {
    return card('p-basis', '계산 기준', '', `<ul class="notes">
      <li><b>필요량</b> 컬러 = 통합 계획 컬러 일별 ÷ 실수율 × (1 − 자가재) × 품명별 소재 비중(13주, 매칭 ${Math.round(D.codeMix.matchedShare * 100)}%) · 도금 FH = 도금 일별 ÷ 실수율(AL→H · AZ·MAC→F · AL-STS→N) · 27.1~3월 = TF 월 판매계획 주별 분할</li>
      <li><b>계획재</b> 계획 그대로 · 나머지 컬러 = <b>주문재(추정)</b>, 마케팅 목록 오면 대체</li>
      <li><b>충당</b> 재고 → 입고예정, 이른 필요일부터 · ${esc(D.stockNote)} · 9월말 이후 FH 입고 자료 없음 → 입고예정 탭에 기발주 입력</li>
      <li><b>업체 판단</b> 남은 일수 = 첫 필요일 − 여유일 − 기준일 · 리드타임 안 업체 중 27년 배정 큰 업체 기본(최종 선택 = 담당자) · 불가 시 대체 업체 / 조정 필요</li>
      <li><b>확인 필요</b> 리드타임 기준(주문일시) · 업체별 마감·최소량 · AL-STS 소재 코드 · 이름 없는 업체 코드(V3·YB·YF)</li></ul>
      <div class="bar"><label class="small">기준일 <input type="date" id="p-today" value="${S.today}"></label><label class="small">입고 → 컬러 투입 <input type="number" id="p-safetyC" value="${S.safetyC}" min="0" max="30" style="width:56px">일</label><label class="small">입고 → 도금 투입 <input type="number" id="p-safetyG" value="${S.safetyG}" min="0" max="30" style="width:56px">일</label>
      <button type="button" class="btn" id="p-dl">설정·판단 내보내기(.json)</button><label class="btn">설정 가져오기<input type="file" accept=".json" id="p-ul" hidden></label><button type="button" class="btn" id="p-resetall">모두 초기화</button></div>
      <h3>공유</h3><div class="bar"><button type="button" class="btn primary" id="p-push">모두에게 올리기</button><button type="button" class="btn" id="p-pull">올라간 상태 받기</button><span class="small">업체·입고예정·주문재·판단 · 분석 암호로 잠가 저장 · 올린 사람·시각 기록</span></div>
      <p class="small">저장 = 이 브라우저 · 계산 ${String(D.built).replace('T', ' ')}</p>`);
  }

  // F/H 납기 비교 3차(2026-10-21 사용자: 더 직관적으로) — "발주하고 며칠 뒤에 들어오나" 한 줄: 실제 입고 · TF 기준 · 인도납기 세 날을 같은 축에
  function dueTab() {
    // 10/22 사용자: 발주 건바이건 · POSCO F/H만(수입 FH 뺌) — 발주 1건 = 1표본, 실제 입고 = 그 발주가 끝난 날(마지막 입고). 옛 계산(입고량 가중·9/7 이후 원장 섞임)은 표시 안 함
    const XL = D.fhExcel && D.fhExcel.byKind && D.fhExcel.byKind.length ? D.fhExcel : null;   // 엑셀 기준이 있으면 그것(남은 발주·인도납기 변경은 MES 매일 계산)
    const F = XL ? { ...XL, open: (D.fhDue || {}).open || [] } : D.fhDue, K = D.dueTrack;
    if (!F || F.basisV !== 2 || !F.byKind || !F.byKind.length) return card('p-due', 'F/H 납기 비교', '', `<p class="muted">${F ? '사내 PC 설치 묶음이 옛 계산(입고량 가중)으로 만든 자료입니다 — 설치 묶음 v73 이상을 깔면 다음 자동 실행부터 발주 건별 비교가 나옵니다.' : '자료 없음 — 사내 PC 다음 자동 실행 뒤 표시'}</p>`);
    const PK = F.byKind.filter((r) => r.arrDays != null);
    const dd = (v) => (v == null ? '미완' : `${v}일`);
    const AX = 90, X = (v) => (Math.max(0, Math.min(AX, v)) / AX * 100).toFixed(2);
    const mk = (cls, v, lb) => (v == null ? '' : `<span class="ft-m ${cls}" style="left:${X(v)}%"><i></i>${lb ? `<em>${lb}</em>` : ''}</span>`);
    const axis = `<div class="ft-ax">${[0, 15, 30, 45, 60, 75, 90].map((v) => `<span style="left:${X(v)}%">${v === 0 ? '발주' : v + '일'}</span>`).join('')}</div>`;
    // 10/22 사용자 '가운데값보다 평균·표준편차' — 표시 기준 = 평균(완납·인도납기). 95%는 정규 가정(평균 + 1.645 × 표준편차)이 아니라 실제로 센 값(늦는 쪽 꼬리가 길어 정규 가정이 짧게 나옴)
    // 10/23: 기본 지표 = 입고일 자체(코일마다 발주 → 실입고, 입고량 가중 · 안 들어온 양 = 늦음, 사용자 10/22 '발주 입고일 자체 소요일'). 코일 이력이 없으면 완납일 기준
    const V = (r) => (r.rcvMean != null ? { m: r.rcvMean, sd: r.rcvSd, p90: r.rcvP90, p95: r.rcvP95, tf: r.rcvInTf, due: r.rcvInDue, rcv: true }
      : { m: r.arrMean, sd: r.arrSd, p90: r.arrP90, p95: r.arrP95, tf: r.inTf, due: r.inDue, rcv: false });
    const RCV = !XL && PK.some((r) => r.rcvMean != null), W = (RCV || XL) ? '입고' : '완납';
    const big = (r) => { const v = V(r), am = Math.round(v.m), dm = Math.round(r.dueMean), hi = v.p95 == null ? AX : v.p95, lo = Math.min(am, r.tfDays, dm);
      return `<div class="ft-k"><div class="ft-kh">POSCO ${esc(r.kind)} <small>${n0(r.n)}건 · ${n0(r.t)}t${r.nOpen ? ` · 미입고 ${n0(r.nOpen)}건` : ''}</small></div>
      <div class="ft-line big">${mk('ar', am, `평균 <b>${v.m}일</b>`)}${mk('tf', r.tfDays, `TF <b>${r.tfDays}일</b>`)}${mk('du', dm, `인도납기 <b>${r.dueMean}일</b>`)}${mk('p9', hi, `95% <b>${dd(v.p95)}</b>`)}<i class="ft-span" style="left:${X(lo)}%;width:${X(hi) - X(lo)}%"></i></div>${axis}
      <p class="ft-say">${XL ? '입고' : v.rcv ? '입고(입고량 기준)' : '완납'} 평균 <b>${v.m}일</b> ± ${v.sd} · 90% ${dd(v.p90)} · <b>95% ${dd(v.p95)}</b></p>
      ${XL ? `<p class="ft-say">포스코 생산 <b>${r.prodMean}일</b> + 운송·입고 ${r.shipMean}일</p>` : ''}
      <p class="ft-say">TF ${r.tfDays}일 안 <b class="${v.tf < 80 ? 'neg' : ''}">${v.tf}%</b> · 인도납기(${r.dueMean}일) 안 <b class="${v.due < 90 ? 'neg' : ''}">${v.due}%</b></p>
      ${v.rcv ? `<p class="ft-say"><small class="muted">참고 완납 ${r.arrMean}일 · 95% ${dd(r.arrP95)}</small></p>` : ''}</div>`; };
    const rng = (k) => { const v = PK.map((r) => (k in V(r) ? V(r)[k] : r[k])).filter((v) => v != null); return v.length ? (Math.min(...v) === Math.max(...v) ? `${Math.min(...v)}` : `${Math.min(...v)}~${Math.max(...v)}`) : '-'; };
    const lead = PK.length ? `포스코 F/H <b>${n0(F.nPo)}건</b>(${md(F.from)}~${md(F.to)} 발주) · 입고 평균 <b>${rng('m')}일</b> · 95% <b>${rng('p95')}일</b> · TF 35일 안 <b>${rng('tf')}%</b> · 인도납기 ${rng('dueMean')}일 안 ${rng('due')}%${XL ? ` · 포스코 생산 ${rng('prodMean')}일 + 운송 ${rng('shipMean')}일` : ''}` : '';
    // 사양별 표: 기본 = 인도납기 − 실제(차이) 큰 순(내림차순, 사용자 10/21), 머리를 누르면 그 칸으로 내림차순 ↔ 오름차순
    // 규격별·사양별 표(10/22 사용자: 발주 건별 90%·95% 등 다시) — 앞쪽에 건수·퍼짐·90/95%·기준 안 비율, 뒤에 인도납기·그림. 머리를 누르면 그 칸으로 정렬(기본 = 발주 건 많은 순)
    const SK = { n: (r) => r.n, mean: (r) => V(r).m, dm: (r) => r.dueMean, p90: (r) => (V(r).p90 == null ? 999 : V(r).p90), p95: (r) => (V(r).p95 == null ? 999 : V(r).p95), c95: (r) => (r.arrP95 == null ? 999 : r.arrP95),
      tf: (r) => V(r).tf, due: (r) => V(r).due, thk: (r) => r.thk, wdt: (r) => r.wdt, spec: (r) => r.spec };
    const st = (window.__ftSort = window.__ftSort && SK[window.__ftSort.k] ? window.__ftSort : { k: 'n', d: -1 });
    const cmp = (x, y) => { const a = SK[st.k](x), b = SK[st.k](y); return (a < b ? -1 : a > b ? 1 : 0) * st.d || y.n - x.n; };
    const sh = (k, lb, cls = '') => `<th class="${cls} ft-s${st.k === k ? ' on' : ''}" data-fk="${k}">${lb}${st.k === k ? (st.d < 0 ? ' ▼' : ' ▲') : ''}</th>`;
    const SH = () => `${sh('n', '건수')}${sh('mean', '평균 ± 편차')}${sh('p90', '90%')}${sh('p95', '95%')}${sh('tf', 'TF 35일 안')}${sh('due', '인도납기 안')}${RCV ? sh('c95', '95% 완납') : ''}${sh('dm', '인도납기')}<th class="ft-cell">발주 후 일수(0~90)</th>`;
    const SC = (r) => { const v = V(r); return `<td>${n0(r.n)}건</td><td class="ar"><b>${v.m}일</b> <small class="muted">± ${v.sd}</small></td><td>${dd(v.p90)}</td><td><b>${dd(v.p95)}</b></td>
      <td class="${v.tf < 50 ? 'gap' : ''}">${v.tf}%</td><td class="${v.due < 80 ? 'gap' : ''}">${v.due}%</td>${RCV ? `<td class="muted">${dd(r.arrP95)}</td>` : ''}<td class="du">${r.dueMean}일 <small class="muted">± ${r.dueSd}</small></td>
      <td class="ft-cell"><div class="ft-line">${mk('ar', Math.round(v.m))}${mk('tf', r.tfDays)}${mk('du', Math.round(r.dueMean))}${mk('p9', v.p95 == null ? AX : v.p95)}</div></td>`; };
    const tbl = (kind) => { const R = F.rows.filter((r) => r.kind === kind && r.arrDays != null).sort(cmp); if (!R.length) return '';
      return `<h3 class="fd-h">${esc(kind)} — 두께 × 폭 <small>10건 이상 · 20건 미만 흐리게</small></h3>
      <div class="scroll"><table class="t ft-t"><thead><tr>${sh('thk', '두께', 'l')}${sh('wdt', '폭', 'l')}${SH()}</tr></thead><tbody>${R.map((r) => `<tr class="${r.n < 20 ? 'ft-few' : ''}"><td class="l">${esc(r.thk)}mm</td><td class="l">${esc(r.wdt)}</td>${SC(r)}</tr>`).join('')}</tbody></table></div>`; };
    const SPKO = { 'CSP1-HA': '일반용', 'CSP2-HA': '가공용', 'CSP3E-HA': '초심가공용', 'CSP360-HA': '구조용37', 'IS-CR0-CQ': '인도 BIS 일반용', 'IS-CR0-DQ': '인도 BIS 가공용', 'POSACCS-F1': '심가공 · 고내열 내변색',
      'CSP1-HG': '일반용', 'CSP2-HG': '가공용', 'CSP1-FL': '일반용 · 평탄도 관리', 'CSP360-HG': '구조용37', 'CSP400-HG': '구조용41', 'CSP440-HG': '구조용46', 'CSP490-HG': '구조용 GrF', 'CSP570-HG': '구조용58' };   // MES 코드표 A10G 품질 등급(사내 PC 자료에 specKo 가 없을 때)
    const SP = (F.bySpec || []).filter((r) => r.arrDays != null);
    const stbl = (kind) => { const R = SP.filter((r) => r.kind === kind).sort(cmp); if (!R.length) return '';
      return `<h3 class="fd-h">${esc(kind)} — 규격별 <small>5건 이상 · 20건 미만 흐리게</small></h3>
      <div class="scroll"><table class="t ft-t"><thead><tr>${sh('spec', '규격', 'l')}${SH()}</tr></thead><tbody>${R.map((r) => `<tr class="${r.n < 20 ? 'ft-few' : ''}"><td class="l"><b>${esc(r.spec)}</b>${(r.specKo || SPKO[r.spec]) ? ` <span class="muted">${esc(r.specKo || SPKO[r.spec])}</span>` : ''}</td>${SC(r)}</tr>`).join('')}</tbody></table></div>`; };
    const spNote = (() => { const a = (F.specSmall || []).map((x) => `${esc(x[1])}(${esc(x[0].replace('F/H', '').replace(/[()]/g, ''))}) ${x[2]}건`), ns = Object.entries(F.noSpec || {}).map(([k, v]) => `${esc(k)} ${n0(v)}건`);
      return (a.length || ns.length) ? `<p class="small">${a.length ? `5건 미만 제외: ${a.join(' · ')}` : ''}${ns.length ? ` · 규격 미상: ${ns.join(' · ')}` : ''}</p>` : ''; })();
    const trend = XL && (XL.trend || []).length ? `<h3 class="fd-h">분기별 추이 <small>입고 평균 · 아래 = 생산 / 인도납기 · 건수</small></h3><div class="scroll"><table class="t ft-t"><thead><tr><th class="l">종류</th>${XL.trend[0].q.map((q) => `<th>${esc(q.q)}</th>`).join('')}</tr></thead><tbody>${XL.trend.map((t) => `<tr><td class="l">${esc(t.kind)}</td>${t.q.map((q) => `<td><b>${q.mean ?? '-'}일</b><br><small class="muted">${q.prod ?? '-'} / ${q.due ?? '-'} · ${n0(q.n)}건</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const specHtml = SP.length ? PK.map((r) => stbl(r.kind)).join('') + spNote : '<p class="small">규격별 비교: MES 소재발주 규격 칸을 사내 PC 다음 원격 조회(설치 묶음 v67 이상)부터 받아 표시합니다.</p>';
    const O = F.open || [], ymd = (v) => `${+v.slice(5, 7)}/${+v.slice(8, 10)}`;
    const arrOf = (k) => { const r = PK.find((x) => x.kind === k); return r ? Math.round(V(r).m) : null; };   // 실적 기준 예상 = 발주일 + 그 종류 평균 입고 일수
    const addD = (v, n) => { const d = new Date(v + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const otbl = O.length ? `<div class="scroll"><table class="t ft-t"><thead><tr><th>발주 행번</th><th class="l">종류</th><th>두께 × 폭</th><th>남은 양</th><th>발주일</th><th>실적 예상</th><th>TF</th><th>인도납기</th></tr></thead><tbody>${O.slice(0, 40).map((x) => { const ea = arrOf(x.kind);
      return `<tr><td>${esc(x.po)}</td><td class="l">${esc(x.kind)}</td><td>${x.thk} × ${n0(x.wdt)}</td><td>${n0(x.t)}t</td><td>${ymd(x.od)}</td><td class="ar"><b>${ea != null ? ymd(addD(x.od, ea)) : '-'}</b></td><td>${ymd(x.tf)}</td><td class="du">${ymd(x.due)}</td></tr>`; }).join('')}</tbody></table></div>${O.length > 40 ? `<p class="small">TF 빠른 순 40건 / 전체 ${n0(O.length)}건</p>` : ''}` : '<p class="muted">없음</p>';
    const ch = (K && K.recent && K.recent.length) ? `<p class="small">인도납기 변경 ${n0(K.nChg)}건(60일 ${n0(K.recent.length)}건) · 최근 ${K.recent.slice(0, 5).map((c) => `${md(c.d)} ${esc(c.po)} ${c.shift < 0 ? `${-c.shift}일 당김` : `${c.shift}일 미룸`}`).join(' · ')}</p>`
      : `<p class="small">인도납기 변경: ${K ? `${md(K.start)}부터 비교 · 변경 없음` : '사내 PC 실행 후 표시'}</p>`;
    return card('p-due', 'F/H 납기 비교 — 발주 후 입고까지', `발주 ${md(F.from)}~${md(F.to)}${XL ? ' · 엑셀 기준' : ''}`,
      `<p class="du-lead">${lead}</p>
      ${XL ? `<div class="ft-lg"><span><i class="ar"></i>평균 입고</span><span><i class="p9"></i>95% 입고</span><span><i class="tf"></i>TF(발주 + 5주)</span><span><i class="du"></i>인도납기 평균</span><small>엑셀 「${esc(XL.file || '')}」 · 발주 → 실입고(첫 코일) 일수 · 발주 후 60일 지난 건 · 미입고 = 늦음 처리 · 취소 추정 ${n0(XL.nCancel)}줄 제외</small></div>` : `<div class="ft-lg"><span><i class="ar"></i>평균 입고(코일마다 발주 → 실입고 일수, 입고량 기준)</span><span><i class="p9"></i>95% 입고(실제로 센 값: 발주한 양의 95%가 이 안에 입고)</span><span><i class="tf"></i>TF 기준(팀 리드타임 표: 발주 + 5주)</span><span><i class="du"></i>인도납기 평균(발주일 → MES 인도납기일 일수)</span><small>POSCO F/H(AL용 · AZ·MAC용 · Ti 첨가, 수입 FH 뺌) · 모두 발주일부터 센 일수. 입고 = 발주 코일마다 실입고일(MES 실입고일, 없으면 입고일)까지 일수를 입고량(톤)으로 가중 — 판정 대상(발주 후 60일 지난 건, ${md(F.asOf)} 기준 ${md(F.to)}까지 발주) 중 아직 안 들어온 양은 '늦음'으로 셈(평균 ± 표준편차는 들어온 양만). 완납 = 발주 종료(MES 발주 끝남)된 발주의 마지막 코일 입고일. TF·인도납기 안 = 그 날짜까지 들어온 양 비율</small></div>`}
      <div class="ft-ks">${PK.map(big).join('')}</div>
      ${trend}
      ${specHtml}
      ${PK.map((r) => tbl(r.kind)).join('')}
      <h3 class="fd-h">남은 발주 — 예상 입고 <small>TF·인도납기 1주 넘게 차이 · 실적 예상 = 발주일 + 평균 입고</small></h3>${otbl}
      <p class="small">수입 FH 제외(MES 발주 등록이 늦음) — TF 기준 그대로</p>
      ${ch}`);
  }

  const TABS = [['cal', '발주 캘린더'], ['board', '판단 목록·구매 요청'], ['arr', '입고예정'], ['due', 'F/H 납기 비교'], ['ord', '주문재 목록'], ['sup', '업체 기준정보'], ['basis', '계산 기준·설정']];

  /* ---------- 발주 캘린더: 이 날 무엇을 발주하고, 무엇이 들어와야 하나 ---------- */
  const CK = { order: { name: '발주 마감', color: 'var(--bad)' }, need: { name: '입고 필요', color: 'var(--s3)' }, arr: { name: '입고 예정(기발주)', color: 'var(--s1)' } };
  function calTab() {
    const J = judge().filter((j) => UI.inScope(j.plant));
    const short = J.filter((j) => j.short >= 1 && j.kind !== 'pos');
    const P_ = short.flatMap((j) => (j.parts.length ? j.parts.map((p) => ({ ...j, short: p.t, deadline: p.dl, p })) : [{ ...j, deadline: j.deadline || j.needBy, p: null }]));
    const past = P_.filter((j) => j.deadline < S.today);
    const soon = P_.filter((j) => j.deadline >= S.today && diff(j.deadline, S.today) <= 14).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const k = (tone, l, v, unit, b) => `<div class="kpi tone-${tone}"><div class="l">${l}</div><div class="v"><b data-count="${Math.round(v)}">0</b><small>${unit}</small></div><div class="b">${b}</div></div>`;
    return `<section class="card"><h2>발주 캘린더 <small>기준일 ${S.today} · 리드타임 역산 발주 마감 · 날짜 누르면 상세</small><span class="unit">단위: 톤</span></h2>
      <div class="kpis">${k(past.length ? 'bad' : 'good', '발주 마감 지남(미발주)', Math.round(past.reduce((a, j) => a + j.short, 0)), 't', `${past.length}건 · 기발주 반영 후 부족`)}
      ${k(soon.length ? 'warn' : 'good', '2주 내 발주 마감', Math.round(soon.reduce((a, j) => a + j.short, 0)), 't', `${soon.length}건 · 최우선 ${soon[0] ? `${esc(codeNm(soon[0].code))}${soon[0].p ? ' ' + esc(supName(soon[0].p.s)) : ''} ${md(soon[0].deadline)}` : '-'}`)}
      ${(() => { const e = new Date(S.today + 'T00:00:00'); e.setMonth(e.getMonth() + 2, 0); const end = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`, near = P_.filter((j) => j.deadline <= end);   // 10/30 재검토: 27년 3월까지 합친 179천t 이 당장 부족처럼 읽힘 → 다음 달 말까지 마감만
        return k('brand', `${+end.slice(5, 7)}월 말까지 발주 마감`, Math.round(near.reduce((a, j) => a + j.short, 0)), 't', `${near.length}건 · 3월까지 전체 ${n0(short.reduce((a, j) => a + j.short, 0))}t`); })()}
      ${k(S.arr.length + autoArr().length ? 'good' : 'warn', '입고 예정(기발주)', S.arr.length + autoArr().length, '건', `MES 자동 ${n0(autoArr().reduce((s, a) => s + a.t, 0))}t${S.arr.length ? ` + 직접 ${S.arr.length}건` : ''} · 충당에 반영`)}</div>
      <div id="p-cal" style="margin-top:14px"></div></section>`;
  }
  function calInit() {
    const J = judge().filter((j) => UI.inScope(j.plant));
    const ev = [];
    for (const j of J) {
      if (j.short < 1 || j.kind === 'pos') continue;
      for (const p of (j.parts.length ? j.parts : [null])) {                // 업체 몫마다 발주 마감
        const dl = p ? p.dl : (j.deadline || j.needBy), tone = dl < S.today ? 'bad' : diff(dl, S.today) <= 14 ? 'warn' : '';
        ev.push({ d: dl, kind: 'order', chip: `${codeNm(j.code)}${p ? ' ' + supName(p.s).replace(/POSCO\((.+)\)/, '$1') : ''} ${n0(p ? p.t : j.short)}t`, tone, j, dl, p });
      }
      ev.push({ d: j.needBy, kind: 'need', chip: `${codeNm(j.code)} ${n0(j.short)}t`, j, dl: j.deadline });
    }
    for (const a of S.arr) if (a.date) ev.push({ d: a.date, kind: 'arr', chip: `${codeNm(a.code)} ${n0(a.t)}t`, a });
    for (const a of autoArr()) if (UI.inScope(a.plant)) ev.push({ d: a.date, kind: 'arr', chip: `${codeNm(a.code)} ${n0(a.t)}t`, a: { sup: (D.supNames || {})[a.sup] || a.sup, code: a.code, t: a.t, po: a.po, memo: a.note } });
    const months = [...new Set(ev.map((e) => e.d.slice(0, 7)))].filter((m) => m >= S.today.slice(0, 7) || ev.some((e) => e.d.slice(0, 7) === m && e.tone === 'bad')).sort();
    if (!months.includes(S.today.slice(0, 7))) months.unshift(S.today.slice(0, 7));
    const jRow = (e) => { const j = e.j; const s = e.p ? e.p.s : (j.rec || j.cand[0]);
      return `<tr><td>${PL[j.plant]}</td><td><b>${esc(codeNm(j.code))}</b></td><td>${n0(j.t)}</td><td>${n0(j.cover)}</td><td class="${e.tone === 'bad' ? 'bad' : ''}"><b>${n0(e.p ? e.p.t : j.short)}</b></td><td>${s ? esc(supName(s)) : '<span class="tag bad">업체 없음</span>'}</td><td>${s ? s.lt + '일' : '-'}</td><td class="${e.tone === 'bad' ? 'bad' : e.tone === 'warn' ? 'warn' : ''}"><b>${md(e.dl)}</b></td><td>${md(j.needBy)}</td><td><span class="tag ${KIND[j.kind][1]}">${KIND[j.kind][0]}</span></td></tr>`; };
    const HEAD = '<thead><tr><th>공장</th><th>소재</th><th>필요</th><th>재고·입고 충당</th><th>부족</th><th>업체</th><th>리드타임</th><th>발주 마감</th><th>입고 필요일</th><th>판정</th></tr></thead>';
    UI.cal($('p-cal'), { months, kinds: CK, events: ev, today: S.today, maxChips: 5,
      note: '입고 필요일 = 첫 사용일 − 투입 여유(컬러 7·도금 5일) · 발주 마감 = 입고 필요일 − 업체 리드타임 · 빨강 = 마감 지남 · 주황 = 2주 내',
      detail: (d, evs) => {
        let h = '';
        const o = evs.filter((e) => e.kind === 'order'), n = evs.filter((e) => e.kind === 'need'), a = evs.filter((e) => e.kind === 'arr');
        if (o.length) h += `<div class="grp" style="--kc:${CK.order.color}"><i></i>발주 마감</div><div class="scroll"><table class="t">${HEAD}<tbody>${o.map(jRow).join('')}</tbody></table></div>`;
        if (n.length) h += `<div class="grp" style="--kc:${CK.need.color}"><i></i>입고 기한</div><div class="scroll"><table class="t">${HEAD}<tbody>${n.map(jRow).join('')}</tbody></table></div>`;
        if (a.length) h += `<div class="grp" style="--kc:${CK.arr.color}"><i></i>입고 예정(기발주)</div><div class="scroll"><table class="t"><thead><tr><th>업체</th><th>소재</th><th>수량</th><th>발주번호</th><th>메모</th></tr></thead><tbody>${a.map((e) => `<tr><td>${esc(e.a.sup || '-')}</td><td><b>${esc(codeNm(e.a.code))}</b></td><td>${n0(e.a.t)}</td><td>${esc(e.a.po || '-')}</td><td>${esc(e.a.memo || '')}</td></tr>`).join('')}</tbody></table></div>`;
        return h + '<p class="small">업체·수량·상태 결정, 구매 요청서 → <a href="#" data-tab="board">판단 목록·구매 요청</a></p>';
      } });
  }

  function render() {
    const y = scrollY;
    const body = { cal: calTab, board, arr: arrivals, due: dueTab, ord: orders, sup: suppliers, basis }[tab]();
    const fresh = lastTab !== tab; lastTab = tab;
    $('p-main').innerHTML = `<nav class="tabs big noprint">${TABS.map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${n}</button>`).join('')}</nav><div class="${fresh ? 'fade' : ''}">${body}</div>`;
    UI.sub(`발주 마감 · 입고 필요 · 업체 판단 · 구매 요청 · 기준일 ${S.today}`);
    $('p-meta').innerHTML = `<span><b>기준일</b>${S.today}</span><span><b>자료</b>확정 컬러·도금 계획 · 소재재고List · 재고현황</span><span><b>계산</b>${String(D.built).replace('T', ' ')}</span><span><b>단위</b>톤</span>`;
    if (tab === 'cal') calInit();
    if (tab === 'due') $('p-main').querySelectorAll('th[data-fk]').forEach((th) => th.addEventListener('click', () => { const st = window.__ftSort; st.d = st.k === th.dataset.fk ? -st.d : -1; st.k = th.dataset.fk; render(); }));
    UI.reveal($('p-main')); UI.count($('p-main')); justOpened = null;
    scrollTo(0, y);
  }

  /* ---------- 엑셀 ---------- */
  async function readSheet(file, want) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets.find((w) => want.some((n) => w.name.includes(n))) || wb.worksheets[0];
    let hdr = null, hr = 0; const out = [];
    ws.eachRow((row, r) => {
      const v = row.values.slice(1).map((c) => (c && typeof c === 'object' ? (c instanceof Date ? c : c.result != null ? c.result : c.text != null ? c.text : '') : c));
      if (!hdr) { if (v.filter((c) => typeof c === 'string' && c.length <= 20 && /수량|업체|품명|소재|납기|입고/.test(c)).length >= 2) { hdr = v.map((c) => String(c || '').replace(/\s/g, '')); hr = r; } return; }
      if (r > hr && v.some((c) => c !== '' && c != null) && !v.some((c) => typeof c === 'string' && c.includes('예시'))) out.push(Object.fromEntries(hdr.map((h, i) => [h, v[i]])));
    });
    return out;
  }
  const pick = (o, ...keys) => { for (const k of keys) { const h = Object.keys(o).find((x) => x.includes(k)); if (h && o[h] !== '' && o[h] != null) return o[h]; } return ''; };
  const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10) : String(v || '').replace(/[./]/g, '-').slice(0, 10));
  function topCode(p) { const m = D.codeMix.byProduct[p] || D.codeMix.byProduct[String(p).replace(/\d+$/, '')] || { G: 1 }; return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]; }
  function orderRow(o) {
    const prod = String(pick(o, '품명')).trim().toUpperCase(), qty = +pick(o, '수량') || 0, due = dstr(pick(o, '납기', '필요일'));
    const given = toCode(pick(o, '소재'));
    const fac = D.cfac[prod] || 1, self = given ? 0 : (D.selfShare[prod] || 0);
    return { con: String(pick(o, '계약')), prod, cust: String(pick(o, '고객')), thk: +pick(o, '두께') || null, wid: +pick(o, '폭') || null, code: given || topCode(prod), qty, due, need: addD(due, -S.dueLead), mat: qty * fac * (1 - self) };
  }
  async function upload(kind, file) {
    try {
      if (kind === 'arr') {
        const R = await readSheet(file, ['입고']);
        S.arr = S.arr.concat(R.map((o) => ({ sup: String(pick(o, '업체')), code: toCode(pick(o, '소재')), t: +pick(o, '수량') || 0, date: dstr(pick(o, '입고')), po: String(pick(o, '발주번호')), memo: String(pick(o, '메모')) })).filter((a) => a.code && a.t && /^\d{4}-\d\d-\d\d$/.test(a.date)));
      } else {
        const R = await readSheet(file, ['주문재']);
        S.orders = R.map(orderRow).filter((o) => o.prod && o.qty && /^\d{4}-\d\d-\d\d$/.test(o.due));
      }
      save(); render();
    } catch (e) { alert('엑셀을 읽지 못했습니다: ' + e.message); }
  }
  async function exportReq() {
    const J = judge().filter((j) => j.short >= 1);
    let L = J.filter((j) => j.dec.status === '요청');
    if (!L.length) { L = J.filter((j) => inPeriod(j) && UI.inScope(j.plant) && j.dec.status !== '보류' && j.dec.status !== '발주됨' && (j.dec.sup || j.rec)); if (!L.length) { alert('내보낼 줄이 없습니다'); return; } }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('구매 요청서');
    ws.addRow([`소재 구매 요청서 — 작성 ${S.today} (상태 '요청' 줄, 없으면 보고 있는 기간 전체)`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    const H = ['요청번호', '업체', '업체코드', '공장', '소재', '두께(mm)', '수량(t)', '입고 요청일', '첫 투입일', '리드타임(일)', '선정 사유', '용도(상위)', '메모', '발주번호(회신)', '약속 납기(회신)', '회신 메모'];
    const hr = ws.addRow(H); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    const bySup = {};
    L.forEach((j) => (j.parts.length ? j.parts : [{ s: null, t: j.short }]).forEach((p) => { const sup = p.s ? p.s.sup : '미정'; (bySup[sup] = bySup[sup] || []).push([j, p]); }));
    let n = 0;
    Object.keys(bySup).sort().forEach((sup) => bySup[sup].forEach(([j, p]) => {
      const s = p.s;
      const reason = !s ? '업체 미정(리드타임 안 업체 없음)' : `27년 배정 ${Math.round((s.share || 0) * 100)}%대로 나눔${p.moved >= 1 ? ` + 늦는 업체 몫 ${Math.round(p.moved)}t 넘겨받음` : ''} · 리드타임 ${s.lt}일 ≤ 남은 ${j.left}일`;
      ws.addRow([`R${S.today.replace(/-/g, '').slice(2)}-${String(++n).padStart(3, '0')}`, s ? supName(s) : sup, sup, PL[j.plant], codeNm(j.code), j.thk ? `${j.thk[0]}~${j.thk[1]}` : '', Math.round(p.t), j.needBy, j.first, s ? +s.lt : '', reason,
        j.use.slice().sort((a, b) => b[3] - a[3]).slice(0, 3).map((r) => `${r[1]} ${r[2]} ${Math.round(r[3])}t`).join(', '), j.dec.memo || '', '', '', '']);
    }));
    [10, 16, 8, 8, 16, 10, 9, 11, 11, 9, 30, 40, 16, 14, 13, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    for (let r = 4; r <= ws.rowCount; r++) ws.getRow(r).eachCell({ includeEmpty: true }, (c, ci) => { c.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } }; if (ci >= 14) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } }; c.alignment = { vertical: 'top', wrapText: ci >= 11 }; });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = `소재구매요청서_${S.today}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target; let b;
    if ((b = t.closest('[data-tab]'))) { tab = b.dataset.tab; render(); return; }
    if ((b = t.closest('[data-per]'))) { period = b.dataset.per; render(); return; }
    if ((b = t.closest('button.tg'))) { const k = b.closest('tr').dataset.k; open[k] = !open[k]; justOpened = open[k] ? k : null; render(); return; }
    if ((b = t.closest('[data-add]'))) { if (b.dataset.add === 'arr') S.arr.push({ sup: '', code: '', t: '', date: S.today, po: '', memo: '' }); else S.sup.push({ plant: 'C', code: '', sup: '', name: '', prio: 9, lt: 30, on: true, memo: '' }); save(); render(); return; }
    if ((b = t.closest('[data-del]'))) { S[b.dataset.del].splice(+b.dataset.i, 1); save(); render(); return; }
    if ((b = t.closest('[data-clear]'))) { S[b.dataset.clear] = []; save(); render(); return; }
    if (t.id === 'p-export') { exportReq(); return; }
    if (t.id === 'p-supreset' && confirm('업체 기준정보를 처음 값으로 되돌릴까요?')) { S.sup = defaults().sup; save(); render(); return; }
    if (t.id === 'p-resetall' && confirm('모든 설정·입고예정·주문재·판단을 지울까요?')) { S = defaults(); save(); render(); return; }
    if (t.id === 'p-push') { const by = (() => { try { return localStorage.getItem('cgl-me') || ''; } catch (x) { return ''; } })(); sharePush({ state: S, by, at: new Date().toISOString() }).then(() => UI.toast('모두에게 올림')).catch((x) => alert(x.message)); return; }
    if (t.id === 'p-pull') { sharePull().then((r) => { if (!r) { alert('올라간 상태가 없습니다'); return; } if (!confirm(`${String(r.at).slice(0, 16).replace('T', ' ')} ${r.by || ''} 이 올린 상태로 바꿀까요? (이 브라우저 입력은 덮어씀)`)) return; S = { ...defaults(), ...r.state, today: D.today }; save(); render(); UI.toast('올라간 상태로 바꿈'); }).catch((x) => alert(x.message)); return; }
    if (t.id === 'p-dl') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); a.download = `소재조달_설정_${S.today}.json`; a.click(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.f) { const k = t.closest('tr').dataset.k; const d = S.dec[k] = S.dec[k] || {}; d[t.dataset.f] = t.value; save(); UI.toast('저장됨'); if (t.dataset.f !== 'memo') render(); return; }
    if (t.dataset.a) { const a = S.arr[+t.closest('tr').dataset.i]; a[t.dataset.a] = t.dataset.a === 'code' ? t.value.trim().toUpperCase().slice(0, 1) : t.value; save(); return; }
    if (t.dataset.s) { const s = S.sup[+t.closest('tr').dataset.i]; const f = t.dataset.s; s[f] = f === 'on' ? t.checked : (f === 'prio' || f === 'lt') ? +t.value : f === 'code' ? t.value.trim().toUpperCase().slice(0, 1) : t.value; if (f === 'code') s.plant = plantOf(s.code); save(); if (f === 'code' || f === 'prio') render(); return; }
    if (t.dataset.up) { if (t.files[0]) upload(t.dataset.up, t.files[0]); return; }
    if (t.id === 'p-only') { onlyShort = t.checked; render(); return; }
    if (t.id === 'p-today' && t.value) { S.today = t.value; save(); return; }
    if (t.id === 'p-safetyC') { S.safetyC = +t.value || 0; save(); return; }
    if (t.id === 'p-safetyG') { S.safetyG = +t.value || 0; save(); return; }
    if (t.id === 'p-duelead') { S.dueLead = +t.value || 0; S.orders = S.orders.map((o) => ({ ...o, need: addD(o.due, -S.dueLead) })); save(); render(); return; }
    if (t.id === 'p-ul' && t.files[0]) { t.files[0].text().then((x) => { const o = JSON.parse(x); if (!o.sup) throw new Error('형식'); S = { ...defaults(), ...o }; save(); render(); }).catch(() => alert('설정 파일이 아닙니다')); }
  });

  let env = null;
  const envReady = GP.latest('procure.enc.json');
  const fhxReady = GP.latest('fh_leadtime.enc.json');                // F/H 리드타임 엑셀 기준(10/28 사용자 '엑셀 기준으로 바꿔', tools/fh_leadtime_excel.py)
  async function unlock(pw) {
    if (!env) env = await envReady;                              // 자료를 받기 전에 암호를 넣은 경우
    if (pw) { $('p-lockbox').hidden = true; $('p-skel').hidden = false; }
    try { D = await GP.decryptJSON(env, pw); try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
      try { const fx = await fhxReady; if (fx) D.fhExcel = await GP.decryptJSON(fx, pw); } catch (e) { /* 엑셀 기준 없으면 MES 계산 */ }
      S = load(); render(); UI.onScope(() => render()); }
    catch (e) { $('p-lockbox').hidden = false; $('p-skel').hidden = true; $('p-form').hidden = false; $('p-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; }
  }
  $('p-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('p-pw').value); });
  envReady.then((e) => { if (!e) throw new Error();
    env = e; $('p-lock').querySelector('h2').textContent = '소재 발주 — 암호를 입력하세요';
    let s = null; try { s = localStorage.getItem(PW_KEY); } catch (x) { /* 무시 */ }
    if (s) unlock(s); else $('p-form').hidden = false;
  }).catch(() => { $('p-msg').textContent = '자료를 찾을 수 없습니다'; });
})();
