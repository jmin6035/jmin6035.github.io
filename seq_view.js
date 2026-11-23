/* 작업 순서 조회(11/15 사용자 '우리가 순서 바꾸는 화면을 1030 화면처럼 쫙: 다른 부서가 조회하는 화면'): 보기 전용.
   자료·시각 계산 = 02 작업(week_seq.js)을 WS_HEADLESS 로 불러 그대로(WS_CORE.view: 게시 week_seq 자료 + 공유 저장소 확정본 → sim).
   칸(사용자 지정 순서 그대로) = 순번 · 계약번호 · 행번 · 두께 · 폭 · 중량 · 길이 · 부서 · 담당자 · 목적지 · L/S · t/hr · 시작시간 · 종료시간 · 상태(11/15 사용자 '작업대기/지시대기까지').
   부서·목적지 = 주문진도(cg/cc_order_progress)에서 계약번호로(없으면 작업 자료 값). 정지(M/C·S/D·청소·휴지)·더미는 한 줄로 끼움(01 일별 가동계획 색) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PW_KEY = 'cgl-analysis-pw';
  const C = window.WS_CORE;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || isNaN(v) || v === '' ? '-' : Math.round(v).toLocaleString('ko-KR'));
  const fx = (v, k) => (v == null || v === '' || isNaN(v) || !(+v > 0) ? '-' : (+v).toFixed(k));
  const WD = '일월화수목금토';
  const mmdd = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  const dnm = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
  const tm = (m) => { const s = C.iso(m); return `${mmdd(s)} ${s.slice(11, 16)}`; };
  const hrs = (m0) => { const m = Math.round(m0); return m >= 1440 ? `${Math.floor(m / 1440)}일${m % 1440 ? ' ' + hrs(m % 1440) : ''}` : m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}` : `${m}분`; };   // 분 먼저 반올림
  const addD = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  const wkOf = (d) => addD(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 4) % 7));   // 생산주 = 수 ~ 화(포털 '이번 주(수~화)'·확정 키와 같음)
  const TODAY = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);          // MES 일자(07시 기준, KST)
  const XCOLS = ['순번', '계약번호', '행번', '두께', '폭', '중량', '길이', '부서', '담당자', '목적지', 'Top Color', 'Back Color', '기준 속도', 't/hr', '시작시간', '종료시간', '상태'];   // 엑셀 칸 이름(MES 양식 그대로)
  const COLS = ['순번', '계약번호', '행번', '두께', '폭', '중량', '길이', '부서', '담당자', '목적지', '앞면 색', '뒷면 색', '기준 속도', 't/시간', '시작', '종료', '상태'];   // 화면 칸 이름(11/17 용어 기준)
  const GNM = { 도금: '도금국내', 도금판매: '도금국내', 국내: '도금국내', 수출: '도금수출', 자동차강판: '자동차', 자동차내수: '자동차', 자동차수출: '자동차', 건재수출: '컬러수출', 가전수출: '컬러수출', 가전내수: '컬러수출', 주문재: '컬러건재', 계획재: '컬러건재', 부원료: '부자재' };   // pyeonseong.js GNM 과 같은 묶음   // 11/17 용어 기준: 그룹 이름 = 현황·관제와 같게
  const gnm = (g) => { const k = String(g || '-').replace(/(판매)?그룹$/, ''); return k === '미상' ? '-' : GNM[k] || k; };
  const evNm = (s) => String(s == null ? '' : s).replace(/test/gi, '시험').replace(/sample/gi, '샘플');   // 11/17 용어 기준: 자료 값 'Test' → 시험(화면 글자만)
  const unk = (v) => (v && v !== '미상' ? v : null);

  let PW = '', plant = /cc/.test(location.hash) ? 'cc' : 'cg', line = null, V = null;
  const OP = {};   // 공정별 주문진도 { con: row }

  async function opOf(p) {
    if (OP[p]) return OP[p];
    const m = {};
    try { const env = await GP.latest(`${p}_order_progress.enc.json`); if (env) (await GP.decryptJSON(env, PW)).rows.forEach((r) => { if (r.con && !m[r.con]) m[r.con] = r; }); } catch (e) { /* 주문진도 없으면 작업 자료 값 */ }
    return (OP[p] = m);
  }

  // ───────── 한 라인의 줄 목록(작업·더미·정지): 시각은 02 작업 sim 그대로
  function rowsOf(l) {
    const O = OP[plant] || {}, out = [];
    const st = (lab, s, e, yel) => out.push({ k: 's', lab, s, e, yel, d: C.dayOf(s) });
    const yel = (t) => !/수리|휴지|대기/.test(t) && /M\/C|S\/D|청소|샘플|test|시험/i.test(t);   // 01 일별 가동계획 색: M/C·S/D·청소(샘플) 노랑 · 휴지·수리·대기 남색
    const sp = (V.D.lines[l] || {}).stopUntil;
    if (sp) st(`계획 휴지 · ${+sp.slice(5, 7)}/${+sp.slice(8, 10)} 재가동`, C.tms(V.D.w0), C.tms(V.D.lines[l].from), false);
    (V.ev[l] || []).forEach((q) => {
      if (q.k === 'w') return;                                     // 도료·PF 기다림(내부 정보): 시작 시각에만 반영
      if (q.k === 'p') { const nm = !q.ev ? '휴지' : q.ev === 'plan' || q.ev === '휴지계획' ? '계획 휴지' : q.ev; return st(`${evNm(nm)} ${hrs(q.e - q.s)}`, q.s, q.e, yel(nm)); }
      if (q.k === 'g') {
        const nt = q.e.note || '';
        if (/더미/i.test(nt) && !q.e.sm) return out.push({ k: 'd', con: '더미', s: q.s, e: q.e2, d: C.dayOf(q.s), note: nt });
        return st(`${evNm(q.e.sm ? nt || '샘플' : nt || '휴지')} ${hrs(q.e2 - q.s)}`, q.s, q.e2, q.e.sm ? !/수리|휴지/.test(nt) : /^(M\/C|S\/D|청소)/.test(nt));
      }
      // 작업(q.k === 'j'): 도금 전환 더미(1년 실적 50% 이상 바뀜만 시간에 넣은 것)는 작업 앞에 더미 한 줄
      if (plant === 'cg' && q.ch && q.ch.m >= 1) {
        const dp = q.ch.parts.filter((p) => p.m > 0 && /^더미/.test(p.c));
        if (dp.length) { const t = dp.reduce((a, p) => { const m = String(p.c).match(/약\s*([\d,.]+)t/); return a + (m ? +m[1].replace(/,/g, '') : 0); }, 0);
          out.push({ k: 'd', con: '더미', s: q.ds, e: q.s, d: C.dayOf(q.ds), t: t || null }); }
      }
      const x = q.x, o = O[x.con] || {}, con = String(x.con || '');
      const cut = con.lastIndexOf('-'), cn = cut > 0 ? con.slice(0, cut) : con || '-', sq = cut > 0 ? con.slice(cut + 1) : '-';
      const cg = plant === 'cg';
      const tph = cg ? x.tph : (x.tph || {})[l];
      out.push({
        k: x.dummy ? 'd' : 'j', s: q.s, e: q.e, d: C.dayOf(q.s), cn, sq,
        thk: cg ? x.thick : x.thk, wdt: cg ? x.width : x.wdt, t: x.t, len: x.dummy ? null : x.len,
        grp: x.dummy ? '더미' : o.grp || (cg ? x.grp : x.g), man: unk(x.man) || unk(o.man), dst: cg ? unk(o.dst) || unk(x.dst) : unk(x.cus) || unk(o.cus) || unk(x.dst),
        top: cg || x.dummy ? null : x.code || x.color, back: cg || x.dummy ? null : x.codeBack || x.back,   // 11/15 사용자 'top·back color 추가': 컬러만(상도·이면 풀 코드, 없으면 도료 종류)
        ls: x.dummy ? null : cg ? x.ls : (x.ls || {})[l], tph: x.dummy ? null : tph,
        stt: cg ? (x.issued ? ['fx', '작업대기'] : ['wt', '지시대기']) :   /* 11/17 검토: 도금도 컬러·편성과 같은 이름 */ x.fixed ? ['kw', '작업대기'] : ['kj', '지시대기'],
      });
    });
    return out;
  }
  const cellsOf = (r, n) => (r.k === 's' ? null : [n, r.con || r.cn, r.con ? '-' : r.sq, fx(r.thk, 2), n0(r.wdt), fx(r.t, 1), (r.len ? n0(r.len) : r.t && r.thk && r.wdt ? '약 ' + n0(r.t * 1e6 / (r.thk * r.wdt * 7.85)) : '-'), gnm(r.grp), r.man || '-', r.dst || '-', r.top || '-', r.back || '-', n0(r.ls), fx(r.tph, 1), tm(r.s), tm(r.e)]);

  function draw() {
    const D = V.D, Ls = C.LINES[plant];
    const cf = V.cur;
    $('sv-st').className = 'sv-st ' + (cf ? 'cf' : 'dr');
    $('sv-st').textContent = cf ? `확정 ${tm(Math.round(Date.parse(cf.at) / 6e4) + 540)}` : '초안(확정 전)';
    $('sv-st').title = cf ? `${cf.who} 확정(v${cf.v})` : '03 생산 편성 · 작업 순서에서 아직 확정하지 않음: 지금 초안 순서';
    $('sv-wk').innerHTML = `<b class="dt">${dnm(D.w0.slice(0, 10))} 07:00~${dnm(D.w1.slice(0, 10))} 07:00</b> · 자료 ${mmdd(D.now.slice(0, 10))} ${D.now.slice(11, 16)}`;
    $('sv-plant').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === plant)));
    const R = {}; Ls.forEach((l) => { R[l] = rowsOf(l); });
    if (!line || !Ls.includes(line)) line = Ls.find((l) => R[l].some((r) => r.k === 'j')) || Ls[0];
    const sum = (rs) => { const j = rs.filter((r) => r.k === 'j'); return [j.length, j.reduce((a, r) => a + (+r.t || 0), 0)]; };
    $('sv-lines').innerHTML = Ls.map((l) => { const [n, t] = sum(R[l]); return `<button type="button" data-l="${l}" aria-pressed="${l === line}">${l}<small>${n}건 · ${n0(t)}t</small></button>`; }).join('');
    $('sv-lines').querySelectorAll('button').forEach((b) => (b.onclick = () => { line = b.dataset.l; draw(); }));
    // 표: 생산주(수~화) 구분줄 → 날짜 구분줄(요일·건수·톤) → 줄
    const rs = R[line], wk0 = wkOf(TODAY);
    const wkNm = (w) => (w === wk0 ? '이번 주' : w === addD(wk0, 7) ? '다음 주' : w === addD(wk0, -7) ? '지난 주' : '');
    const CW0 = innerWidth < 1500 ? [44, 128, 44, 50, 54, 50, 64, 76, 60, 112, 84, 84, 56, 50, 100, 100, 80] : [52, 136, 58, 62, 68, 66, 72, 110, 80, 210, 104, 104, 58, 62, 112, 112, 96];   // 1366px: 목적지까지 보이고 시작·종료·상태는 오른쪽 고정
    const HID = plant === 'cg' ? [10, 11, 12] : [], vis = (a) => a.filter((_, i) => !HID.includes(i)), NC = 17 - HID.length;   // 11/17 검토: 도금은 색 칸 없음 → 숨김, 목적지 폭 고정
    const CW = vis(CW0);
    $('sv-tbl').dataset.stk = plant === 'cc' && innerWidth >= 1500 ? '1' : '';   // 11/17 검토: 도금은 한 화면에 다 들어감: 오른쪽 고정은 컬러 넓은 화면만(1366 에선 앞면·뒷면 색이 고정 칸 밑에 가려짐 → 가로로 넘김)
    let h = `<colgroup>${CW.map((w) => (w ? `<col style="width:${w}px">` : '<col>')).join('')}</colgroup><thead><tr>${vis(COLS).map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>`, n = 0, cw = null, cd = null, z = 0;
    rs.forEach((r) => {
      const w = wkOf(r.d);
      if (w !== cw) { cw = w; const W = rs.filter((x) => wkOf(x.d) === w), [k, t] = sum(W), a = W[0].d, z2 = W[W.length - 1].d, md2 = (d) => mmdd(d).replace(/^0/, '');
        /* 11/17 검토: 표가 오늘부터라 '이번 주 11/11~11/17'인데 실제는 오늘 남은 분 → 표에 든 날짜 그대로(주 일부면 '남은 날') */
        h += `<tr class="wh"><td colspan="${NC}"><div class="stk">${wkNm(w)}${a > w ? ' 남은 날' : ''} ${md2(a)}${z2 > a ? '~' + md2(z2) : ''}<span>${k}건 · ${n0(t)}t</span></div></td></tr>`; }
      if (r.d !== cd) { cd = r.d; z = 0; const [k, t] = sum(rs.filter((x) => x.d === r.d)); const we = /[토일]/.test(dnm(r.d)); h += `<tr class="dh"><td colspan="${NC}"><div class="stk"><b${we ? ' class="we"' : ''}>${dnm(r.d)}</b><span>${k}건 · ${n0(t)}t</span></div></td></tr>`; }
      if (r.k === 's') { h += `<tr class="stp ${r.yel ? 'y' : 'n'}"><td colspan="${NC - 3}"><div class="stk">${esc(r.lab)}</div></td><td>${tm(r.s)}</td><td>${tm(r.e)}</td><td></td></tr>`; return; }
      n++; z++;
      const c0 = cellsOf(r, n), c = vis(c0);
      h += `<tr class="${r.k === 'd' ? 'dm' : 'j'}${z % 2 === 0 ? ' z' : ''}"${r.note ? ` title="${esc(r.note)}"` : ''}>${c.map((v, i) => `<td${i === 1 ? ' class="cn"' : i === 7 || i === 8 ? ' class="mn"' : i === 9 ? ` class="ds" title="${esc(v)}"` : ''}>${esc(v)}</td>`).join('')}<td>${r.k === 'd' || !r.stt ? '-' : `<span class="chip ${r.stt[0]}">${r.stt[1]}</span>`}</td></tr>`;
    });
    if (!rs.length) h += `<tr><td colspan="${NC}" class="sv-empty">${line} 기간 안 작업 없음${D.lines[line] && D.lines[line].stop ? ': ' + esc(D.lines[line].stop.note || '') : ''}</td></tr>`;
    $('sv-tbl').innerHTML = h + '</tbody>';
    find();
  }

  // ───────── 엑셀(칸 그대로, 라인마다 한 시트)
  let xlsP = null;
  const needXls = () => xlsP || (xlsP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/exceljs.min.js?v=2611120206'; s.onload = () => ok(window.ExcelJS); s.onerror = no; document.head.appendChild(s); }));
  async function toXls() {
    const XL = await needXls(), wb = new XL.Workbook();
    C.LINES[plant].forEach((l) => {
      const ws = wb.addWorksheet(l), rs = rowsOf(l); let n = 0;
      ws.addRow(XCOLS);
      rs.forEach((r) => {
        if (r.k === 's') { const x = ws.addRow(['', r.lab, '', '', '', '', '', '', '', '', '', '', '', '', tm(r.s), tm(r.e), '']); x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.yel ? 'FFFFFF00' : 'FF1F3864' } }; x.font = { bold: true, color: { argb: r.yel ? 'FF1F3864' : 'FFFFFFFF' } }; return; }
        n++;
        const num = (v, k) => (v == null || isNaN(v) || !(+v > 0) ? '-' : +(+v).toFixed(k));
        const x = ws.addRow([n, r.con || r.cn, r.con ? '-' : r.sq, num(r.thk, 2), num(r.wdt, 0), num(r.t, 1), num(r.len, 0), gnm(r.grp), r.man || '-', r.dst || '-', r.top || '-', r.back || '-', num(r.ls, 0), num(r.tph, 1), tm(r.s), tm(r.e), r.k === 'd' ? '-' : r.stt[1]]);
        if (r.k === 'd') { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } }; x.font = { color: { argb: 'FFC00000' }, bold: true }; }
      });
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      ws.columns.forEach((c, i) => { c.width = [6, 16, 6, 7, 7, 7, 8, 16, 10, 24, 6, 6, 13, 13, 9][i]; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    });
    const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `작업순서_${plant === 'cg' ? '도금' : '컬러'}_${V.cur ? '확정' : '초안'}_${V.D.now.slice(0, 10)}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function open(p) {
    plant = p;
    await opOf(p);
    V = await C.view(p, PW);
    draw();
  }
  async function unlock(pw) {
    try {
      PW = pw; $('sv-lock').hidden = true; $('sv-main').hidden = false;
      await open(plant);
      try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* 무시 */ }
    } catch (e) {
      $('sv-main').hidden = true; $('sv-lock').hidden = false; $('sv-form').hidden = false;
      $('sv-msg').textContent = pw ? (/자료 없음/.test(e.message) ? '게시 자료가 없습니다(다음 포털 갱신 시 생성)' : '암호가 맞지 않습니다') : '';
      document.querySelector('#sv-lock h2').textContent = '분석 암호';
    }
  }
  // 11/15 사용자 '담당자나 계약번호 검색': 맞는 작업 줄만 남김(정지·날 머리는 그대로)
  function find() {
    const q = ($('sv-find').value || '').trim().toLowerCase(); let n = 0;
    document.querySelectorAll('#sv-tbl tr.j, #sv-tbl tr.dm').forEach((r) => { r.classList.remove('fd', 'nf'); if (!q) return; const c = r.cells; const ok = [c[1], c[8]].some((td) => td && td.innerText.toLowerCase().includes(q)); r.classList.add(ok ? 'fd' : 'nf'); n += ok; });
    $('sv-fres').textContent = q ? `${line} ${n}건` : '';
  }
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'sv-find') find(); });   // 스크립트가 본문보다 먼저 읽혀 직접 연결하면 null
  const go = (p) => { if (!PW || p === plant) return; line = null; open(p).catch((e) => { $('sv-tbl').innerHTML = `<tbody><tr><td class="sv-empty">자료 읽기 실패: ${esc(e.message)}</td></tr></tbody>`; }); };
  $('sv-plant').querySelectorAll('button').forEach((b) => (b.onclick = () => { location.hash = b.dataset.p; }));
  addEventListener('hashchange', () => go(/cc/.test(location.hash) ? 'cc' : 'cg'));
  const scopeGo = () => { const sc = window.UI && UI.scope ? UI.scope() : 'all', want = sc === 'C' ? 'cc' : sc === 'G' ? 'cg' : null; if (want && want !== plant) location.hash = want; };
  if (window.UI && UI.onScope) UI.onScope(scopeGo);
  if (!location.hash) { const sc = window.UI && UI.scope ? UI.scope() : 'all'; if (sc === 'C') plant = 'cc'; }
  $('sv-xls').onclick = () => toXls().catch((e) => alert('엑셀 만들기 실패: ' + e.message));
  $('sv-prt').onclick = () => print();
  $('sv-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('sv-pw').value); });
  let s = ''; try { s = localStorage.getItem(PW_KEY) || ''; } catch (e) { /* 무시 */ }
  if (s) unlock(s); else { $('sv-form').hidden = false; document.querySelector('#sv-lock h2').textContent = '분석 암호'; }
})();
