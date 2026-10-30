/* 기본 파라미터 — 원본: gadong-plan code/allocator_v29.py, dest_items_v29.py, params.yaml (확정안 v30 기준).
   화면에서 수정할 수 있고, 수정본은 JSON으로 내보내기/불러오기 가능. */
(function (root) {
  const GP = root.GP || (root.GP = {});

  GP.DEFAULT_PARAMS = {
    version: 'v30',
    year: 2026,
    months: [10, 11, 12],            // 계획 분기(연속 3개월)
    lines: ['1CGL', '2CGL'],
    lineFamilies: { '1CGL': ['AL', 'AZ'], '2CGL': ['AL', 'MAC'] },   // 라인별 강종군(M/C 대상)
    alloyFamily: { 'AL': 'AL', 'AL-STS': 'AL', 'AL-LG': 'AL', 'AZ': 'AZ', 'MAC': 'MAC' },
    allowed: { '1CGL': ['AL', 'AZ', 'AL-LG'], '2CGL': ['AL', 'MAC', 'AL-STS'] },

    // 시간손실(분). params.yaml 시간손실 절
    switchDummy: { '1CGL': 546.4, '2CGL': 635.0 },       // 강종전환 M/C 1회
    nonfamDummy: { '1CGL': 21.00, '2CGL': 25.82 },       // 비강종 더미, 가동일당
    equipDown: { '1CGL': 18.46, '2CGL': 25.72 },         // 설비정지, 가동일당
    restartFamchg: { '1CGL': 462, '2CGL': 719 },         // S/D 재가동 — 강종 바뀜
    restartSame: { '1CGL': 106, '2CGL': 295 },           // S/D 재가동 — 같은 강종

    // 정기수리(S/D). 여러 건 가능
    shutdowns: [{ line: '2CGL', start: '2026-11-23', end: '2026-12-06' }],

    // 계획 전제
    initFamily: { '1CGL': 'AL', '2CGL': 'AL' },          // 첫날 강종. '' = 자유
    releaseDays: 25,                                     // 주문재는 마감 N일 전부터 생산 가능
    releaseExempt: ['자가재'],                            // 제한 없는 부서
    firstWindowPrevMonth: true,                          // 첫 달 1~5일 선적분은 전월 생산으로 가정
    restartPenalty: 1000,                                // 2단계: 재가동 강종변경 1회 = 선생산 N톤·일 (1단계 판단 고정용 보조항)
    timeLimit1: 1800, timeLimit2: 1800,                  // 초
    phase2Mode: 'fast',                                  // 'fast' = 전환일 ±7일 창 반복(수십 초), 'exact' = 전체 탐색·최적 증명(수 분)
    phase2Window: 7,

    // 생산속도(t/분). 실적 달성속도 2025.1~2026.7, 더미코일 제외 — 10/30 사용자 '실적 기준 통일, 26년 1월부터': 라인·강종 평균이 2026.1~10월 실적 하루 생산량(M/C·정지 날·더미 제외, 8~9월 = data/mes_q 생산실적 화면)
    // 1CGL AL 719·AZ 756, 2CGL AL 927·MAC 980t/일과 같아지도록 비율 보정(1CGL AL ×0.965·AZ ×0.934, 2CGL AL ×0.977·MAC ×0.978), 부서 간 상대 속도 그대로
    rateBase: {
      '1CGL|AL': 0.513373, '1CGL|AZ': 0.539792, '1CGL|AL-LG': 0.513373,
      '2CGL|AL': 0.667646, '2CGL|MAC': 0.705818, '2CGL|AL-STS': 0.667646,
    },
    rateDept: {
      '1CGL|AL|도금국내': 0.516828, '1CGL|AL|도금수출': 0.520358, '1CGL|AL|자가재': 0.489286,
      '1CGL|AL|자동차내수': 0.434330, '1CGL|AL|자동차수출': 0.434025,
      '1CGL|AZ|도금국내': 0.475205, '1CGL|AZ|도금수출': 0.500235, '1CGL|AZ|자가재': 0.541345, '1CGL|AZ|자동차내수': 0.419062,
      '2CGL|AL-STS|자동차내수': 0.575136, '2CGL|AL-STS|자동차수출': 0.622908,
      '2CGL|AL|도금국내': 0.506413, '2CGL|AL|도금수출': 0.728809, '2CGL|AL|자가재': 0.545734,
      '2CGL|AL|자동차내수': 0.678871, '2CGL|AL|자동차수출': 0.969154,
      '2CGL|MAC|도금국내': 0.686245, '2CGL|MAC|도금수출': 0.845807, '2CGL|MAC|자가재': 0.573213,
      '2CGL|MAC|자동차내수': 0.901489, '2CGL|MAC|자동차수출': 0.762557,
    },

    // 배선일정 권역 별칭(판매계획 괄호 안 국가 → 배선일정 권역)
    sailAlias: { '인도': '서남아' },
    sailPrefixes: ['', '북미_', '미국_'],
    sailFamily: { 'ALCOSTA': 'AL', 'AZ': 'AZ', 'PosMAC': 'MAC', 'AL-STS': 'AL-STS' },
  };

  /* 판매계획 시트 해석 규칙. sub = 합계행의 "상세" 키(J열). children = 합계행 바로 위 행들 중 쓰는 라벨
     ([라벨, 목적지명] 또는 라벨). self = 합계행 자체가 한 항목. 자식 합 ≠ 합계행이면 경고(양식 변경 감지). */
  const EXP_REGIONS = ['중국', '유럽', '서부', '동부', '걸프', '캐나다', '서남아', '중남미', '중동', '일본', '동남아', '대양주', '아프리카', '기타'];
  GP.SALES_SPEC = {
    sections: [
      { id: 'dom', match: '도금판매', totals: ['ALCOSTA 직판 계', '도금판매그룹 계(천원)'] },
      { id: 'exp', match: '도금수출', totals: ['ALCOSTA 계', '수출 계($)', '도금수출그룹 계(천원)'] },
      { id: 'auto', match: '자동차', totals: ['내수', '수출($)', '직판(천원)', '자동차강판판매 계(천원)'] },
    ],
    groups: [
      { sec: 'dom', sub: '도금국내::내수::MAC', cls: '도금국내', alloy: 'MAC', children: ['패턴맥', '건재용', '가전용', '자동차용', '임가공 이관/컬러소재용'] },
      { sec: 'dom', sub: '도금국내::내수::AZ', cls: '도금국내', alloy: 'AZ', children: ['건재용', '가전용', '컬러소재용', '기타'] },
      { sec: 'dom', sub: '도금국내::내수::AL', cls: '도금국내', alloy: 'AL', children: ['실수요', '건재용(유통)', '페일캔용', ['가전용', '가전용', 'AL-LG']] },   // 가전용 직판 = 1CGL 전용(품목별 적용 라인, 2026-10-13 사용자 결정) → 1CGL 전용 강종 AL-LG 로
      { sec: 'exp', sub: '도금수출::수출::MAC', cls: '도금수출', alloy: 'MAC', sail: '도금수출', children: EXP_REGIONS, info: ['북미'] },
      { sec: 'exp', sub: '도금수출::수출::A Z', cls: '도금수출', alloy: 'AZ', sail: '도금수출', children: EXP_REGIONS, info: ['북미'] },
      { sec: 'exp', sub: '도금수출::수출::일반 AL', cls: '도금수출', alloy: 'AL', sail: '도금수출', children: EXP_REGIONS, info: ['북미', '가공센터', '기타(유통/실수요)'] },
      { sec: 'auto', sub: '자동차::내수::MAC', cls: '자동차내수', alloy: 'MAC', self: 'MAC 내수' },
      { sec: 'auto', sub: '자동차::내수::ALCOSTA', cls: '자동차내수', alloy: 'AL', children: [['(자동차)', '자동차'], ['(파이프)', '파이프'], ['(유통)', '유통']] },
      { sec: 'auto', sub: '자동차::내수::AL-STS', cls: '자동차내수', alloy: 'AL-STS', children: [['(세종/포레시아/세정/우신/대지)', '세종/포레시아/세정/우신/대지'], ['(디젠스/창신/국일)', '디젠스/창신/국일'], ['(유통)', '유통']] },
      { sec: 'auto', sub: '자동차::수출::AL', cls: '자동차수출', alloy: 'AL', sail: '자동차', children: ['멕시코', '서남아', '동남아'] },
      { sec: 'auto', sub: '자동차::수출::AL-STS(중국, 베트남)', cls: '자동차수출', alloy: 'AL-STS', sail: '자동차', self: '중국·베트남', selfSail: 'AL-STS(중국, 베트남)' },
      { sec: 'auto', sub: '자동차::수출::MAC', cls: '자동차수출', alloy: 'MAC', sail: '자동차', children: [['멕시코(중남미)', '멕시코'], ['기타(중국, 인도)', '중국·인도']] },
      { sec: 'auto', sub: '자동차::내수::임가공', cls: '자동차내수', alloy: 'AL-STS', children: [['AL-STS', '임가공']] },
    ],
  };

  GP.clone = (o) => JSON.parse(JSON.stringify(o));
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
