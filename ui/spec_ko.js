/* 규격 코드 → 짧은 한글 이름(11/11 사용자 'EN-S220GD 같은 코드는 한글로'). UI.specKo(code) → { ko, tip } · UI.specHtml(code) → <span title=원코드>한글</span>
   원자료 확인: MES 코드표(extradata snap_code_detail*) ORD_SPEC_STD(주문규격기준) = 코드 → 규격 번호·품질 등급(속성1 CQ·DQ·DDQ·EDDQ·GrA~E),
   A10C(컬러소재규격) 설명 = '구조용220(Gr.A)'·'EGI CQ' 등. 원자료에 '한글 이름' 칸은 없음 → 규격 체계(앞 글자 = 나라 규격, 뒤 = 용도 등급)로 짧은 이름을 만들고
   등급은 위 코드표 속성1과 맞춤(DX51D = CQ, DX52D = DQ, DX53D = DDQ, SGMCD1 = DQ, SGMCD2 = DDQ, SGMCD3 = EDDQ, A792 FS = LFQ, SS80 = 'Gr-E 기존 550'). 원코드는 title 로 남김 */
(function () {
  'use strict';
  const UI = window.UI = window.UI || {};
  const REG = { KS: '한국', JS: '일본', JIS: '일본', EN: '유럽', AS: '미국', ASTM: '미국', IS: '인도', BS: '영국', DN: '독일' };
  const STD = [   // 규격 번호(마우스 올림) — 코드표 ORD_SPEC_STD 설명·A10C 속성2 의 규격 번호
    [/^EN.*(DX5|S\d{3}GD|HX\d{3})/, 'EN 10346 연속 용융도금 강판'], [/A463/, 'ASTM A463 알루미늄 도금 강판'], [/A792/, 'ASTM A792 55% 알루미늄-아연 도금 강판'], [/A653/, 'ASTM A653 아연도금 강판'],
    [/^KS-S?A1/, 'KS D 3544 알루미늄 도금 강판'], [/^JS-SA1/, 'JIS G 3314 알루미늄 도금 강판'], [/^KS-SGM/, 'KS D 3030 아연-알루미늄-마그네슘 도금 강판'], [/^KS-CGM/, '도장 아연-알루미늄-마그네슘 도금 강판'],
    [/^KS-CGL/, 'KS D 3862 도장 55% 알루미늄-아연 도금 강판'], [/^(KS|JS)-SGL/, '55% 알루미늄-아연 도금 강판(KS D 3770 · JIS G 3321)'], [/^KS-CGC/, 'KS D 3520 도장 아연도금 강판'], [/^KS-SECC|^IS-17404/, '전기아연도금 강판(KS D 3528 · IS 17404)'],
    [/STS|FSS/, '스테인리스 강판'], [/A3003/, '알루미늄 판(3003 합금)'], [/IZM/, 'IS 18513'], [/IS-14246/, 'IS 14246 연속 도장 아연도금 강판'],
  ];
  const GR = { CQ: '일반용', DQ: '가공용', DDQ: '심가공용', EDDQ: '초심가공용', XDDQ: '극심가공용', LFQ: '성형용' };
  function grade(c) {   // [한글 등급, 코드표 등급]
    let m;
    if ((m = c.match(/S(\d{3})GD/))) return [`구조용(${m[1]}MPa)`, '항복강도 ' + m[1] + 'MPa 이상'];
    if ((m = c.match(/HX(\d{3})YD/))) return [`고장력(${m[1]}MPa)`, '고장력강 · 항복강도 ' + m[1] + 'MPa 이상'];
    if ((m = c.match(/DX5([1-6])D/))) return [GR[{ 1: 'CQ', 2: 'DQ', 3: 'DDQ', 4: 'EDDQ', 6: 'XDDQ' }[m[1]]], ''];
    if ((m = c.match(/A792\s*Gr\.?\s*(\d+)/i))) return [`구조용(${m[1]}MPa)`, 'Grade ' + m[1]];
    if (/A792\s*SS80/.test(c)) return ['구조용(550MPa)', 'SS80 = Gr.E(기존 550)'];
    if ((m = c.match(/A(463|792|653)\s*(EDDS|DDS|DQ|DS|FS|CSA|CS|CQ)/))) return [GR[{ EDDS: 'EDDQ', DDS: 'DDQ', DQ: 'DQ', DS: 'DQ', FS: 'LFQ' }[m[2]] || 'CQ'], ''];
    if ((m = c.match(/(?:FSS|STS)\s*-?(\d{3}\w*)/))) return [`스테인리스 ${m[1]}`, ''];
    if ((m = c.match(/A(\d{4})P/))) return [`알루미늄 ${m[1]}`, ''];
    if ((m = c.match(/SA1([CDE])/))) return [GR[{ C: 'CQ', D: 'DQ', E: 'DDQ' }[m[1]]], ''];
    if ((m = c.match(/(?:SGM|CGM|SGL|CGL|CGC|SGC|SEC)C?D(\d)/))) return [GR[['', 'DQ', 'DDQ', 'EDDQ'][+m[1]] || 'DQ'], ''];
    if ((m = c.match(/(?:SGM|CGM|SGL|CGL|CGC|SGC)C?(\d{3})/))) return [`구조용(${m[1]}급)`, ''];
    if (/(SGM|CGM|SGL|CGL|CGC|SGC|SEC)CC/.test(c)) return [GR.CQ, ''];
    if ((m = c.match(/IS-17404\s*CR(\d)/))) return [GR[['', 'CQ', 'DQ', 'DDQ'][+m[1]]], ''];
    if (/IZMCCR4/.test(c)) return [GR.EDDQ, ''];   // 코드표 ORD_SPEC_STD 'IS 18513 IZMCCR4' 속성1 = EDDQ
    if (/IS-14246/.test(c)) return ['도장용', '세부 등급 미확인'];
    return [null, ''];
  }
  const CACHE = new Map();
  UI.specKo = function (code) {
    if (!code) return null;
    const c = String(code).trim();
    if (CACHE.has(c)) return CACHE.get(c);
    const pre = (c.match(/^([A-Z]+)[-\s]/) || [])[1], reg = REG[pre] || '';
    const [g, gTip] = grade(c), std = (STD.find(([re]) => re.test(c)) || [])[1] || '';
    const sub = (c.match(/-(G[XM]\d)$/) || [])[1];                                  // 세부 사양(고객·도금 부가 코드)
    const coat = /MAC|-GM\b|_MAC/.test(c) ? 'MAC' : /AZ/.test(c) ? 'AZ' : /[_ ]AL\b/.test(c) ? 'AL' : '';
    const ko = g ? [reg, g].filter(Boolean).join(' ') : null;
    const r = { ko, tip: [c, std, gTip, sub ? `세부 사양 ${sub}` : '', coat ? `도금 ${coat}` : ''].filter(Boolean).join(' · ') };
    CACHE.set(c, r);
    return r;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  UI.specHtml = (code) => { const r = UI.specKo(code); if (!r) return ''; return `<span class="spk" title="${esc(r.tip)}">${esc(r.ko || code)}</span>`; };
})();
