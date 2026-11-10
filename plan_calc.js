/* 계획 계산(11/11 계획 기준 탭 개편 — 옛 '도금 계획 계산'·'컬러 계획 계산' 화면의 결과 부분을 합침, 계산 도구는 rolling.html·color_calc.html 그대로):
   이번 달 계획이 어떻게 계산됐는지 숫자로. 도금(#cg) / 컬러(#cc) 전환.
   자료: integrated.enc.json(variants.V1.plan = 그룹 월 계획 판매·목표·기초 — cglplan/pages.py f3_month_plan 과 같은 값),
        latest.plan.enc.json(orderDemand = 부서·강종·월 주문/판매계획 보충, cal = 강종·M/C, replan.options.lockTo),
        portal.enc.json(plating.now = 결품·지연 — 홈과 같은 정의, color.unplaced), color_rolling.enc.json(컬러 이번 달 롤링). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const md = (d) => (d ? `${+String(d).slice(5, 7)}/${+String(d).slice(8, 10)}` : '-');
  const kst = (s) => { if (!s) return ''; const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + '+09:00'); return isNaN(d) ? String(s) : d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5, 16).replace('-', '/'); };
  const nextME = (d) => { const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 2, 0)).toISOString().slice(0, 10); };   // 판생 확정 다음 달 말(tools/order_replan.py lockTo)
  const lockTo = () => (((LP || {}).replan || {}).options || {}).lockTo || nextME(((LP || {}).replan || {}).t0 || new Date().toISOString());
  const PW_KEY = 'cgl-analysis-pw';
  let PW = '', IG = null, LP = null, PO = null, CR = null, LT = null, PL = 'cg';

  const GG = [['G수출', '도금수출', ['도금수출']], ['G국내', '도금국내', ['도금국내']], ['G자동차', '자동차', ['자동차내수', '자동차수출']], ['G자가재', '자가재(컬러 소재)', ['자가재']]];
  const CG = [['C수출', '컬러수출', ['건재수출', '가전수출', '가전내수']], ['C건재', '컬러건재', ['주문재', '계획재']], ['C수요', '수요개발', ['수요개발']]];

  function curIdx() {   // 통합 계획 달 = portal.months(3개월 계획 첫 달부터)
    const ms = (PO && PO.months) || [], ym = ((PO && PO.today) || new Date(Date.now() + 9 * 3600e3).toISOString()).slice(0, 7);
    const i = ms.indexOf(ym); return { i: i < 0 ? 0 : i, ym: i < 0 ? ms[0] : ym };
  }
  function f3(g) {   // 판매 · 목표 · 기초 · 월 계획(F3) · 사유
    const { i } = curIdx(), x = ((((IG || {}).variants || {}).V1 || {}).plan || {})[g];
    const r = x && x[i]; if (!r) return null;
    const s = r.sales || 0, tg = r.target || 0, p = r.prod || 0;
    let b = s + tg - p;
    const m = /기초 ([\d,]+)/.exec(r.note || ''); if (m) b = +m[1].replace(/,/g, '');
    return { s, tg, b, p, days: r.endDays, note: r.note };
  }
  const kpi = (l, v, b, cls, title) => `<div class="k ${cls || ''}"${title ? ` title="${esc(title)}"` : ''}><div class="l">${l}</div><div class="v">${v}</div><div class="b">${b || ''}</div></div>`;

  /* ---------- 도금 ---------- */
  function mcList() {
    const R = LP || {}, t0 = (R.replan || {}).t0, O = (R.replan || {}).options || {}, fix = new Set((O.fixMC || []).map((x) => `${x.line}|${x.date}`));
    const cal = (R.cal || []).slice().sort((a, b) => a.line.localeCompare(b.line) || a.date.localeCompare(b.date)), out = {};
    let prev = null;
    for (const c of cal) {
      const L = out[c.line] = out[c.line] || [];
      if (prev && prev.line === c.line && prev.fam !== c.fam && c.date > t0) L.push({ d: c.date, a: prev.fam, b: c.fam, fx: c.date <= lockTo(), sel: fix.has(`${c.line}|${c.date}`) });
      prev = c;
    }
    return out;
  }
  function drawCG() {
    const R = LP || {}, rp = R.replan || {}, O = rp.options || {}, now = ((PO || {}).plating || {}).now || {}, { ym } = curIdx();
    const MC = mcList(), nmc = Object.values(MC).reduce((a, L) => a + L.length, 0);
    const mon = +ym.slice(5);
    $('k-h').innerHTML = `도금 계산 결과 <small>실적 ~${md(rp.t0)} · 재계획 ${esc(kst((LP && LP.savedAt) || PO.built))}</small>`;
    $('k-row').innerHTML = kpi('남은 M/C', `${n0(nmc)}<small>회</small>`, `고정 ~${md(lockTo())} · 그 뒤 엔진이 정함`, '')
      + kpi('결품', `${n0(now.short)}<small>t</small>`, `주문 ${n0(now.orderShort)}t · 판매계획 보충 ${n0(now.fillShort)}t`, now.orderShort > 0 ? 'bad' : now.short > 0 ? 'warn' : 'ok', (now.shortBy || []).join(' · '))
      + kpi('납기 지연', `${n0(now.late)}<small>톤·일</small>`, `늦게 만드는 주문 ${n0(now.orderLateT)}t → <a href="risk.html">납기 위험</a>`, now.late > 0 ? 'warn' : 'ok', '원래 납기 기준 — 홈·가동 현황과 같은 값')
      + kpi('빼고 계산한 잔량', `${n0(Object.values((R.orderDemand || {}).skip || {}).reduce((a, v) => a + v, 0))}<small>t</small>`, Object.keys((R.orderDemand || {}).skip || {}).map(esc).join(' · ') || '없음', '');
    // 그룹 월 계획 + 수요 구성
    const OD = R.orderDemand || {}, sumOD = (src, cls) => Object.entries(OD[src] || {}).filter(([k]) => cls.includes(k.split('|')[0]) && k.split('|')[2] === ym).reduce((a, [, v]) => a + v, 0);
    $('f-h').innerHTML = `${mon}월 그룹 월 계획과 도금 수요 <small>월 계획 = 판매 + 목표 재고 − 기초 재고</small>`;
    let tot = { s: 0, tg: 0, b: 0, p: 0, o: 0, f: 0 };
    const rows = GG.map(([g, nm, cls]) => {
      const x = f3(g) || {}, o = sumOD('orders', cls), f = sumOD('fill', cls);
      ['s', 'tg', 'b', 'p'].forEach((k) => { tot[k] += x[k] || 0; }); tot.o += o; tot.f += f;
      return `<tr><td class="l"><b>${esc(nm)}</b></td><td class="n">${n0(x.s)}</td><td class="op">+</td><td class="n" title="${x.days != null ? `월말 목표 = ${x.days}일치` : ''}">${n0(x.tg)}</td><td class="op">−</td><td class="n">${n0(x.b)}</td><td class="op">=</td><td class="n eq">${n0(x.p)}</td><td class="n">${n0(o)}</td><td class="n">${n0(f)}</td><td class="nt">${esc(x.note ? x.note.replace(/^월 계획 [\d,]+t\(.*?\) · /, '') : '')}</td></tr>`;
    }).join('');
    $('f-tab').innerHTML = `<thead><tr><th class="l">그룹</th><th class="n" title="판매생산속보 월 판매 · 자가재 = 컬러 사용량">판매</th><th></th><th class="n" title="다음 달 하루 판매 × 목표 일수(상한)">목표 재고</th><th></th><th class="n" title="전달 말 MES 재고현황">기초 재고</th><th></th><th class="n">월 계획</th><th class="n" title="생산 안 된 주문 잔량 — 필요일이 이번 달인 것">남은 주문</th><th class="n" title="주문이 판매계획보다 적은 만큼 채운 양">판매계획 보충</th><th class="l">비고</th></tr></thead><tbody>${rows}`
      + `<tr class="gh"><td class="l">합계</td><td class="n">${n0(tot.s)}</td><td class="op">+</td><td class="n">${n0(tot.tg)}</td><td class="op">−</td><td class="n">${n0(tot.b)}</td><td class="op">=</td><td class="n eq">${n0(tot.p)}</td><td class="n">${n0(tot.o)}</td><td class="n">${n0(tot.f)}</td><td></td></tr></tbody>`;
    $('f-lg').innerHTML = `월 계획 = 그룹 생산 목표(한 달 고정) · 도금 일정은 남은 주문 + 판매계획 보충을 필요일 순으로 깔고 결품 → 지연 → M/C → 선생산 최소로 정함 · 진도 → <a href="supply.html">월간 가동</a>`;
    // M/C
    const P = R.P || {}, sd = P.shutdowns || [];
    $('mc-sec').hidden = false;
    $('mc-sub').textContent = `${md(rp.t0)} 뒤 · 강종 고정 ~${md(rp.freezeUntil)}`;
    $('mc-body').innerHTML = (P.lines || ['1CGL', '2CGL']).map((l) => `<div class="ln">${l}</div><div class="cs">${[...(MC[l] || []).map((x) => ({ d: x.d, h: `<span class="c${x.fx ? ' fx' : ''}"><b>${md(x.d)}</b> ${esc(x.a)} → ${esc(x.b)}${x.sel ? ' <em>지정</em>' : ''}</span>` })),
      ...sd.filter((x) => x.line === l && x.end > rp.t0).map((x) => ({ d: x.start, h: `<span class="c sd"><b>${md(x.start)}~${md(x.end)}</b> 정기수리</span>` }))].sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.h).join('') || '<span class="muted">없음</span>'}</div>`).join('');
  }

  /* ---------- 컬러 ---------- */
  function drawCC() {
    const { ym } = curIdx(), mon = +ym.slice(5), C = CR || {}, G = (C.groups || []).filter((x) => x.ym === ym);
    const un = G.reduce((a, x) => a + (x.unpl || 0), 0);   // 표의 미편성 합과 같은 값(롤링 기준)
    const short = (C.alarms || []).filter((a) => a.ym === ym && a.kind === 'short');
    $('k-h').innerHTML = `컬러 계산 결과 <small>실적 ~${md(C.actTo)} · 롤링 ${esc(kst(C.built))}</small>`;
    const conf = C.conf || {};
    $('k-row').innerHTML = kpi('확정 창', `${md((C.window || [])[0])}~${md((C.window || [])[1])}`, `작업지시 ${n0(conf.n)}건 · ${n0(conf.t)}t 고정`, '')
      + kpi('다시 배치', `${n0(G.reduce((a, x) => a + (x.roll || 0), 0))}<small>t</small>`, `${md(C.start)}부터 · 정해 둔 휴지 고정`, '')
      + kpi('월 계획 대비 부족', `${n0(short.reduce((a, x) => a + (x.t || 0), 0))}<small>t</small>`, short.map((x) => `${esc(x.g)} ${n0(x.t)}t`).join(' · ') || '없음', short.length ? 'warn' : 'ok', short.map((x) => x.text).join('\n'))
      + kpi('미편성', `${n0(un)}<small>t</small>`, '라인 시간 부족 · 다음 달 이월', un > 0 ? 'warn' : 'ok');
    $('f-h').innerHTML = `${mon}월 그룹 월 계획과 이번 달 롤링 <small>월 계획 = 판매 + 목표 재고 − 기초 재고 → 실적 · 확정 · 다시 배치</small>`;
    const byG = Object.fromEntries(G.map((x) => [x.g, x]));
    const rows = CG.map(([g, nm, subs]) => {
      const x = f3(g) || {}, S = subs.map((k) => byG[k]).filter(Boolean), sp = S.reduce((a, y) => a + (y.plan || 0), 0);
      const hd = `<tr class="gh"><td class="l">${esc(nm)}</td><td class="n">${n0(x.s)}</td><td class="op">+</td><td class="n" title="${x.days != null ? `월말 목표 = ${x.days}일치` : ''}">${n0(x.tg)}</td><td class="op">−</td><td class="n">${n0(x.b)}</td><td class="op">=</td><td class="n eq">${n0(x.p)}</td><td class="n" title="${Math.abs(sp - (x.p || 0)) > 50 ? '그룹 월 계획과 다름 — 비고' : ''}">${n0(sp)}</td><td class="n">${n0(S.reduce((a, y) => a + (y.act || 0), 0))}</td><td class="n">${n0(S.reduce((a, y) => a + (y.conf || 0), 0))}</td><td class="n">${n0(S.reduce((a, y) => a + (y.roll || 0), 0))}</td><td class="n">${n0(S.reduce((a, y) => a + (y.unpl || 0), 0))}</td><td class="nt">${esc(g === 'C건재' && (x.p || 0) < 0.5 && sp > 0 ? '그룹 계획 0(과재고)이어도 주문재 주문·계획재 안전재고 몫은 생산' : x.note ? x.note.replace(/^월 계획 [\d,]+t\(.*?\) · /, '') : '')}</td></tr>`;
      return hd + (S.length < 2 ? '' : S.map((y) => `<tr class="sub"><td class="l">${esc(y.g === '주문재' ? '건재 주문재' : y.g)}</td><td colspan="7"></td><td class="n">${n0(y.plan)}</td><td class="n">${n0(y.act)}</td><td class="n">${n0(y.conf)}</td><td class="n">${n0(y.roll)}</td><td class="n">${n0(y.unpl)}</td><td></td></tr>`).join(''));
    }).join('');
    $('f-tab').innerHTML = `<thead><tr><th class="l">그룹</th><th class="n" title="판매생산속보 월 판매">판매</th><th></th><th class="n" title="다음 달 하루 판매 × 목표 일수(상한)">목표 재고</th><th></th><th class="n" title="전달 말 MES 재고현황">기초 재고</th><th></th><th class="n">월 계획</th><th class="n" title="품목·계획재까지 나눈 이번 달 롤링 기준량">롤링 계획</th><th class="n">실적</th><th class="n" title="확정 창 안 작업지시(1030 작업대기 · 1020 지시대기)">확정</th><th class="n" title="남은 양을 내일부터 다시 배치한 양">다시 배치</th><th class="n">미편성</th><th class="l">비고</th></tr></thead><tbody>${rows}</tbody>`;
    $('f-lg').innerHTML = `롤링 계획 = 실적 + 확정 + 다시 배치 + 미편성(± 반올림) · 일별 진도·라인 → <a href="color_status.html">컬러 가동 현황</a>`;
    $('mc-sec').hidden = true;
  }

  function refs() {
    const P = (LP || {}).P || {}, rb = P.rateBase || {};
    $('r-asof').textContent = `자료 ${kst((PO || {}).built)}`;
    $('r-ref').innerHTML = [
      '그룹 월 계획 = 판매(판매생산속보 월 판매, 자가재 = 컬러 사용량) + 목표 재고(다음 달 하루 판매 × 목표 일수, 상한) − 기초 재고(전달 말 MES 재고현황). 0 미만 = 0',
      '남은 주문 = 생산 안 된 주문 잔량 중 필요일이 이번 달 — 수출 = 출항 − 1일, 내수 = 납기월 말일, 자가재 = 컬러 사용일 − 1일',
      '판매계획 보충 = 부서 누계로 판매계획 − 주문, 모자란 만큼(강종 = 판매계획 비율)',
      `도금 속도(t/h) = 1CGL AL ${(rb['1CGL|AL'] * 60).toFixed(1)} · AZ ${(rb['1CGL|AZ'] * 60).toFixed(1)} · 2CGL AL ${(rb['2CGL|AL'] * 60).toFixed(1)} · MAC ${(rb['2CGL|MAC'] * 60).toFixed(1)} — 실적 하루 생산량 기준`,
      LT ? `리드타임 — 자가재 도금 생산 = 컬러 사용일 −${LT.selfLead} ~ −${LT.selfLeadMin}일 · 구매 소재 투입 여유 컬러 ${LT.safetyC} · 도금 ${LT.safetyG}일 → <a href="leadtime.html">리드타임 기준</a>` : '',
      '규칙 전체 → <a href="rules.html">계획 규칙</a> · 실측 속도·손실 → <a href="analysis.html">조건 분석</a> · 결정 → <a href="decisions.html">결정 기록</a>',
    ].filter(Boolean).map((x) => `<li>${x}</li>`).join('');
  }

  function go(p, push) {
    PL = p === 'cc' ? 'cc' : 'cg';
    document.querySelectorAll('.pc-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === PL)));
    if (push) try { history.replaceState(null, '', location.pathname + location.search + '#' + PL); } catch (e) { /* 무시 */ }
    try { if (PL === 'cg') drawCG(); else drawCC(); } catch (e) { console.error(e); $('k-row').innerHTML = `<p class="muted">자료를 그리지 못했습니다: ${esc(e.message)}</p>`; }
    if (window.RULES) RULES.why({ PW, IG, A: (IG && IG.tfRules) || { replan: { freezeDays: 2 } }, P: (IG && IG.planP) || (LP && LP.P), LT, D: { LP } }, PL === 'cg' ? 'G' : 'C').catch((e) => { $('x-out').textContent = e.message; });
  }

  async function unlock(pw) {
    const get = async (f) => { try { const e = await GP.latest(f); return e ? await GP.decryptJSON(e, pw) : null; } catch (e) { return null; } };
    try { IG = await GP.decryptJSON(await GP.latest('integrated.enc.json'), pw); } catch (e) { $('c-lock').hidden = false; $('c-msg').textContent = pw ? '암호가 맞지 않습니다' : ''; return; }
    PW = pw; try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
    const [L, P, C, T] = await Promise.all([get('latest.plan.enc.json'), get('portal.enc.json'), get('color_rolling.enc.json'), get('leadtime.enc.json')]);
    LP = L && (L.result ? Object.assign({ savedAt: L.savedAt }, L.result) : L); PO = P || {}; CR = C;
    const fx = Object.fromEntries(((T && T.fixed) || []).map((x) => [x[0], x[2]]));
    LT = { selfLead: fx.selfLead ?? 8, selfLeadMin: fx.selfLeadMin ?? 1, safetyC: fx['safety.C'] ?? 7, safetyG: fx['safety.G'] ?? 1 };
    $('c-lock').hidden = true; $('c-main').hidden = false;
    refs();
    const h = location.hash.slice(1), sc = window.UI && UI.scope ? UI.scope() : 'all';
    go(h === 'cc' || h === 'cg' ? h : sc === 'C' ? 'cc' : 'cg');
    document.querySelectorAll('.pc-seg button').forEach((b) => b.addEventListener('click', () => go(b.dataset.p, true)));
    if (window.UI && UI.onScope) UI.onScope((v) => { if (v === 'G' || v === 'C') go(v === 'C' ? 'cc' : 'cg', true); });
    addEventListener('hashchange', () => { const x = location.hash.slice(1); if ((x === 'cg' || x === 'cc') && x !== PL) go(x); });
  }
  $('c-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('c-pw').value); });
  let s = ''; try { s = localStorage.getItem(PW_KEY) || ''; } catch (e) { /* 무시 */ }
  if (s) unlock(s); else $('c-lock').hidden = false;
})();
