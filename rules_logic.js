/* 계획 규칙(11/5 사용자 '나열식 말고 통합/도금/컬러 구분, 숨은 규칙까지 모든 로직, 소재·자가재, 왜 그날 그 라인에서 그 시간에 — 예시'):
   탭 = 계산 순서대로 번호 단계(무엇을 · 어떻게 · 값 · 근거), 숨은 규칙은 해당 단계 안 '자동' 표시.
   원본 코드: web/engine(params·model·replan) · cglplan(color_full·r15·line_rules·plan_specs·pages) · tools(order_demand·integrated_plan·color_pack·cg_calendar·cc_calendar·
   cg_order_progress·cc_order_progress·mat_order_spec·integrated_web·wo_sequence·cg_wo_sequence) · ui/ct.js. 숫자를 바꾸면 이 파일도 같이 고칠 것. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v == null || v === '' ? '-' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 0 }));
  const n1 = (v) => (v == null ? '-' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
  const md = (d) => (d ? `${+String(d).slice(5, 7)}/${+String(d).slice(8, 10)}` : '-');
  const addD = (s, n) => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const WD = '일월화수목금토', wd = (d) => WD[new Date(String(d).slice(0, 10) + 'T00:00:00Z').getUTCDay()];
  const scope = () => (window.UI && UI.scope ? UI.scope() : 'all');
  const AUTO = '<span class="rl-auto" title="화면에서 바꿀 수 없는 자동 규칙 — 바꾸려면 결정 기록으로 요청">자동</span>';
  const EDIT = '<span class="rl-edit" title="위 수치 고치기 표에서 바꿀 수 있음">수정 가능</span>';

  /* ---------- 규칙 본문: 탭 → 단계[{t 제목, what, how, v 값, src 근거, auto}] ---------- */
  function tabs(A, P) {
    const rb = (P && P.rateBase) || {};
    const tph = (k) => (rb[k] ? `${(rb[k] * 60).toFixed(1)}t/h(하루 약 ${n0(rb[k] * 1440)}t)` : '-');
    const sd = P && P.shutdowns ? P.shutdowns.map((x) => `${x.line} ${md(x.start)}~${md(x.end)}`).join(' · ') : '2CGL 11/23~12/6';
    const pl = A.plating, rp = A.replan;
    const TGD = { G국내: 7, 주문재: 8, 수요개발: 8, 건재수출: 10, 가전수출: 10 };                 // 11/5 운영 개선 계획 일수(cglplan/tfrules.py TARGET) — 게시본에 target 이 있으면 그것
    const TG = (k) => { const t = (A.target || {})[k] ?? TGD[k]; return t != null ? Math.min(t, A.days[k] ?? t) : A.days[k]; };
    return [
      { k: 'all', nm: '통합(공통)', pl: 'all', steps: [
        { t: '하루의 기준', what: '실적·계획·휴지·작업지시·화면의 날짜를 모두 같은 생산일로 셈', how: '생산일 = 07:00 ~ 다음 날 07:00(MES 일수 기준). 오늘 실적은 하루가 끝나야(다음 날 07:00) 마감', v: '07:00', src: '10/22 사용자', auto: 1 },
        { t: '자료 흐름', what: '사내 PC 가 MES·판생속보·소재·주문을 받아 올리면 클라우드가 계획·화면을 다시 계산해 게시', how: '사내 PC 07:35 전체(실적 → 도금 재계획 → 게시) + 09:35~19:35 2시간마다 원격 조회 → 클라우드 10:23~20:23 2시간마다 포털 갱신(재계획 기준 화면 전부 다시 계산)', v: '하루 7회', src: '11/3 · 11/5 사용자', auto: 1 },
        { t: '월별 생산량(그룹)', what: '판매그룹마다 그달 만들 양', how: '그달 생산량 = 판매계획 + 월말 목표 재고 − 월초 재고. 재고가 목표보다 많으면 덜 만들고 적으면 더 만듦. 이번 달은 실제 재고(판생속보 원천 표)에서 다시 출발', v: '', src: '10/12 · 10/30(지금 재고 기준)' , auto: 1 },
        { t: '월말 목표 재고', what: '그룹별로 월말에 남길 재고', how: '계획 목표 = 운영 유형별 계획 일수 × 다음 달 하루 판매량. TF 목표 일수는 \'넘지 않는 상한\'(점검용). 그룹별 자세한 기준은 \'재고 목표(그룹별)\' 탭', v: `계획 일수: 도금국내 ${TG('G국내')} · 컬러 주문재 ${TG('주문재')} · 수요개발 ${TG('수요개발')} · 컬러 수출 ${TG('건재수출')} · 도금수출 ${TG('G수출')}일 / 상한(TF): 도금 수출 ${A.days['G수출']}·국내 ${A.days['G국내']} · 컬러 수출 ${A.days['건재수출']}·주문재 ${A.days['주문재']}일`, src: '11/5 운영 개선 바로 적용(TF 일수 10/12 = 상한)', edit: 1 },
        { t: '공장 재고 상한', what: '공장 월말 재고 합이 넘지 않게(그룹 목표보다 먼저 지킴)', how: '상한을 넘는 달은 그 공장 생산을 줄임', v: Object.entries(A.stockMax).map(([k, x]) => `${k} ${n0(x)}t`).join(' · '), src: "'27 판생그룹 목표(10/12)", edit: 1 },
        { t: '지난 날 = 실적', what: '어제까지는 계획이 아니라 MES 실적으로 덮음', how: '도금 = 코일 실적(제품번호 앞 2자리로 라인), 컬러 = 생산 실적. 실적과 계획이 다르면 남은 기간을 다시 계산', v: '', src: '9/29 롤링 재계획', auto: 1 },
        { t: '계획 범위', what: '언제까지 계획하나', how: '도금·컬러 모두 이번 달 + 3달(11월이면 27.2월 말까지), 월 물량은 그다음 달까지 앞보기. 1·2월 M/C 는 판생 배포 전이라 엔진이 정함(12월까지는 판생 M/C 고정). 범위 밖 칸은 화면에 \'계획 범위 밖\'', v: '26.11 ~ 27.2(앞보기 27.3)', src: '11/5 사용자 \'1~2월까지 계획 추가\'', auto: 1 },
        { t: '계획 조건 장부', what: '판생·메일·회의로 받은 M/C·정지·휴지·S/D', how: 'data/plan_conditions.json 에 받는 즉시 한 줄(반영 = apply, 참고 = ref) → 엔진 입력. 게시 전 점검(plan_audit)이 반영 여부를 확인', v: '', src: '10/30 사용자', auto: 1 },
      ] },
      { k: 'stock', nm: '재고 목표(그룹별)', pl: 'all', steps: [
        { t: '원칙 — 상한과 계획 목표를 나눔', what: '월말 재고를 얼마나 남길지(월 생산량을 정하는 기준)', how: '월 생산량 P = 판매 S + 월말 목표 T − 월초 재고 B, 다음 달 B = B + P − S. TF 목표 일수(9/30 확정)는 \'쌓는 기준\'이 아니라 \'넘지 않는 상한\'으로만 점검하고, 계획에 쓰는 T 는 운영 유형별 계획 일수 × 다음 달 하루 판매. 계획 일수 = 실측 \'생산 완료 → 첫 출하\' 중앙값(8/1~9/15 생산 코일을 MES 출고와 코일번호로 이음), 상한보다 크면 상한', v: '유형 A = 주문 생산(일정이 재고를 정함) · B = 반복 사양(안전재고 운영) · C = 생산 방식(캠페인·EOQ)', src: '목표재고일수 운영 개선 확정안(11/4) · 11/5 사용자 \'비교하지 말고 바로 적용\' · 실측 = 이 포털 계산' },
        { t: '도금수출 — A형 + 캠페인', what: '도금수출그룹(AL·AZ·MAC·AL-STS 수출) 월말 재고', how: `T = 다음 달 하루 판매 × ${TG('G수출')}일. 실측 중앙값 16일·평균 17.8일이 상한 15일보다 길어 상한을 그대로 씀. AZ·MAC 는 M/C(한 달 1~2번)로 몰아 만들어 사이클 재고가 생기는 것이 정상 — 일별 계획은 엔진이 출항일 − 1일 마감과 M/C 일정으로 따로 짜서 월 목표와 무관. 예: 27.1월 판매 20,900t ÷ 31일 = 674t/일 → 12월 말 목표 약 10,100t`, v: `계획 ${TG('G수출')}일 · 상한 ${A.days['G수출']}일 · 실측 중앙 16 · 75% 24 · 90% 33일`, src: '11/5 실측(36,537t)', edit: 1 },
        { t: '도금국내 — A형(납기 역산)', what: '도금판매그룹(국내 도금) 월말 재고', how: `T = 다음 달 하루 판매 × ${TG('G국내')}일(예전 20일). 납기에 맞춰 만들어 출하 대기분만 남김 — 출하일 없는 물량은 편성하지 않음. 예: 27.1월 판매 6,200t ÷ 31일 = 200t/일 → 12월 말 목표 1,400t(예전 20일이면 4,000t, 2,600t 덜 쌓음)`, v: `계획 ${TG('G국내')}일 · 상한 ${A.days['G국내']}일 · 실측 중앙 7 · 평균 13.3 · 90% 32일`, src: '11/5 실측(5,472t)', edit: 1 },
        { t: '자동차 — B형(반복 사양)', what: '자동차강판판매그룹 월말 재고', how: '반복 사양이라 안전재고를 둠: T = 다음 달 하루 판매 × 품목 가중 일수(AL-STS 30 · 임가공 15 · 그 외 45일). 실측 중앙 11일·평균 18일이라 품명별 수요 변동(z 1.65 × 일판매 σ × √리드타임)으로 안전일수를 다시 계산해 분기마다 낮출 대상', v: `AL-STS ${A.days['AL-STS']} · 임가공 ${A.days['임가공']} · 그 외 ${A.days['기타']}일 · 실측 중앙 11 · 90% 42일`, src: 'TF 10/12 · 11/5 실측(3,702t)', edit: 1 },
        { t: '도금 자가재 — C형(캠페인 버퍼)', what: '컬러 소재로 쓰는 도금 자가재 월말 재고', how: '컬러가 실제 편성한 사용량에서 역산: 필요일 = 컬러 생산일 − 8일(반순 마감). 월말 목표 = 15일 × 다음 달 컬러 하루 사용량(캠페인 주기 ÷ 2 + 소량 안전재고 성격)', v: `${A.days['G자가재']}일`, src: 'TF 장부 · 11/2 자가재 = 컬러 사용 역산' },
        { t: '컬러 건재수출·가전수출 — A형(배선 역산)', what: '컬러수출그룹 수출분 월말 재고', how: `T = 다음 달 하루 판매 × ${TG('건재수출')}일(예전 15일). 실측 중앙값 10일(평균 12일)은 선적창 맞춘 선생산 + 공급 흔들림(소재 매치·도료 입고 지연) 여유를 이미 포함 — 이보다 줄이면 배선을 놓칠 위험(잔여의 절반 이상이 매치 전). 예: 수출 27.1월 판매 11,590t ÷ 31 = 374t/일 → 12월 말 약 3,700t`, v: `계획 ${TG('건재수출')}일 · 상한 ${A.days['건재수출']}일 · 실측 중앙 10 · 75% 18 · 90% 24일`, src: '11/5 실측(컬러수출 36,692t)', edit: 1 },
        { t: '컬러 가전내수 — B형(반복 사양)', what: '컬러수출그룹 가전 내수(엘지 등 반복 품명)', how: '반복 사양이라 안전재고를 둠: T = 다음 달 하루 판매 × 30일(생산 선행 + 안전일수 포함). 품명별 변동으로 안전일수 재산정 후 단계적으로 낮춤', v: `${A.days['가전내수']}일`, src: 'TF 10/12', edit: 1 },
        { t: '컬러건재 주문재 — A형(납기 역산)', what: '컬러건재판매그룹 주문재 월말 재고', how: `총량은 운영안(AV열 월 생산) − 계획재로 이미 정해져 바뀌지 않음 — T 는 품명 사이 배분과 월말 재고에 씀: 주문재분 = 하루 주문 × ${TG('주문재')}일(예전 20일). 실측 주문재 중앙 8일(계약번호 6번째 자리 C = 계획재 제외)`, v: `계획 ${TG('주문재')}일 · 상한 ${A.days['주문재']}일 · 실측 중앙 8 · 평균 11.2 · 90% 26일`, src: '11/5 실측(10,477t)', edit: 1 },
        { t: '컬러건재 계획재 — C형(재고 보충)', what: '수입 F/H·서림 GI 사양 계획재', how: '사양별 목표재고(R15 운영안 = 운영 + 안전재고, EOQ) 그대로. 실측 중앙 15일·평균 21.7일 — 보충형이라 일수 상한 대신 사양별 목표로 관리', v: 'R15 운영안 사양별 목표', src: '11/3 계획재 = 수입 F/H·서림 GI 사양' },
        { t: '수요개발 — A형(납기 역산)', what: '수요개발그룹 월말 재고', how: `T = 다음 달 하루 판매 × ${TG('수요개발')}일(예전 30일). 실측 표본이 적어(월 200t 안팎) 컬러건재 주문재 실측을 준용`, v: `계획 ${TG('수요개발')}일 · 상한 ${A.days['수요개발']}일`, src: '11/5', edit: 1 },
        { t: '점검 — 상한 초과·출하 예정 없는 생산', what: '계획과 실적에서 매주 보는 것', how: '① 그룹별 계획 월말 재고일수 > 상한(수출 15 · 국내·주문재 20 · 가전내수·수요개발 30일)이면 \'상한 초과\' — 선생산 과다(배선 몰림 등) 원인 확인 ② 출하일·납기 없는 편성 = 0t(도금 엔진은 모든 물량에 마감일, 컬러는 선적·납기 기준) ③ 실적 재고일수가 상한을 넘으면 원인 분류: 선적 지연 · 서류·출하지시 대기 · 로트 잔량 · 여유재 · 품질 보류 — 실제 재고는 이 운영 개선으로 줄어듦(계획 일수만 낮춰서는 안 줄어듦) ④ 분기마다 실측을 다시 재 계획 일수를 줄어든 만큼만 낮춤', v: '', src: '확정안 \'점검과 실적 관리\' · 11/5', auto: 1 },
        { t: '적용 범위', what: '이 기준이 바꾸는 곳', how: '바뀜 = 컬러 월 물량·일별 일정(통합 계획), 도금 월 물량(소재 F/H 발주 기준), 재고 전망. 안 바뀜 = 도금 게시 계획(주문 기준 재계획 — 실주문 + 판매계획 보충, 목표 재고를 쓰지 않고 마감일로 짬)', v: '', src: '11/5', auto: 1 },
      ] },
      { k: 'cg', nm: '도금', pl: 'G', steps: [
        { t: '수요 ① 실주문', what: '미생산 주문(주문 − 생산)을 먼저 깜', how: '마감 = 생산 필요일 = 수출 출항일 − 1일(출항 없으면 입항) / 내수 납기 − 1일. 소재가 없으면 예상 입고일 + 5일부터 생산 가능. 소재가 필요일보다 늦게 오면 마감 = 생산 가능일(소재 지연으로 따로 셈)', v: '투입 여유 5일 · 출하 준비 1일', src: '10/28·10/29·10/30 사용자', auto: 1 },
        { t: '수요 ② 빼는 주문', what: '계획에서 빼는 잔량', how: '납기 30일 넘게 지났고 소재도 없는 잔량(정리 대상) · 필요일이 분기 끝(12/31) 넘는 것(다음 분기)', v: '30일', src: 'order_demand', auto: 1 },
        { t: '수요 ③ 판매계획 보충', what: '주문이 판매계획보다 적은 만큼만 채움', how: '부서 누계로 (그 달 판매계획 − 그 달 필요 주문) → 모자란 만큼만, 강종은 그 달 판매계획 비율. 이번 달도 남은 날이 10일 이상이면 보충. 주문이 더 많으면 보충 0', v: '보충 지연 무게 0.5 · 결품 무게 0.2(주문 = 1)', src: '10/30 · 11/2', auto: 1 },
        { t: '수요 ④ 강종 판별', what: '주문의 강종', how: '제품명 GAS = AL-STS, 그 밖 AL = AL(AL-LG 는 주문에서 못 가려 판매계획 보충만), AZ·MAC 겸용 = 생산 예정 라인(1CGL → AZ, 2CGL → MAC)', v: '', src: 'order_demand', auto: 1 },
        { t: '수요 ⑤ 자가재', what: '컬러가 쓰는 도금 소재(자가재)', how: '필요일 = 컬러 생산일 − 8일, 그 날이 든 반순(10·20·말일) 끝이 마감. 자가재 탭 참고', v: '8일', src: '팀 리드타임 표 10/12', auto: 1 },
        { t: '수요 묶음', what: '계산 단위', how: '(부서, 강종, 마감일) 버킷으로 합산. 부서 = 도금수출·도금국내·자동차내수·자동차수출·자가재', v: '', src: '엔진', auto: 1 },
        { t: '라인과 강종', what: '라인마다 만들 수 있는 강종', how: '1CGL = AL·AZ(AL-LG 포함), 2CGL = AL·MAC(AL-STS 포함). 하루에 한 강종. 강종을 바꾸면 M/C', v: '1CGL AL·AZ · 2CGL AL·MAC', src: '설비 조건', auto: 1 },
        { t: '하루 능력(분)', what: '그날 생산에 쓸 수 있는 시간', how: '1,440분 − 설비 정지(하루 평균) − 비강종 더미(하루 평균) − M/C 날이면 전환 더미 − S/D 뒤 재가동이면 재가동 시간 − 정기수리 날은 0', v: `설비 정지 1CGL ${n1(pl.equipDown['1CGL'])}·2CGL ${n1(pl.equipDown['2CGL'])}분/일 · 더미 ${n1(pl.nonfamDummy['1CGL'])}·${n1(pl.nonfamDummy['2CGL'])}분/일 · M/C ${n1(pl.switchDummy['1CGL'])}·${n1(pl.switchDummy['2CGL'])}분 · 재가동(강종 바뀜) ${n0(pl.restartFamchg['1CGL'])}·${n0(pl.restartFamchg['2CGL'])}분 / 같은 강종 ${n0(pl.restartSame['1CGL'])}·${n0(pl.restartSame['2CGL'])}분`, src: 'MES 실적(조건 분석)', edit: 1 },
        { t: '속도', what: '분당 몇 톤', how: '라인 × 강종 × 부서별 실적 달성 속도(더미 코일 빼고). 2026.1~10월 실적 하루 생산량에 맞춰 보정', v: `1CGL AL ${tph('1CGL|AL')} · AZ ${tph('1CGL|AZ')} / 2CGL AL ${tph('2CGL|AL')} · MAC ${tph('2CGL|MAC')}`, src: '10/30 사용자 \'실적 기준, 26년 1월부터\'', auto: 1 },
        { t: '정기 수리', what: '생산 안 하는 기간', how: '그 기간은 능력 0, 끝난 다음 날 재가동 시간을 뺌', v: sd, src: '회사 정비 계획', auto: 1 },
        { t: '주문재 생산 시작', what: '너무 일찍 만들지 않게', how: '주문재는 마감 N일 전부터만 생산(자가재는 제한 없음). 첫 달 1~5일 선적분은 전월에 만든 것으로 봄', v: `${n0(pl.releaseDays)}일 전`, src: '도금수출 리드타임 75%', edit: 1 },
        { t: '최적화 순서', what: '날마다 라인 강종과 버킷별 생산량을 동시에 정함(MILP)', how: '① 결품 → ② 지연(마감 뒤 생산 톤·일) → ③ M/C 횟수 → ④ 선생산(마감보다 일찍 만든 톤·일) → ⑤ 어제 계획과 강종이 다른 날 수, 를 이 순서 무게로 최소. 결품 1t = 지연 10만 톤·일(판매계획 보충은 2만), M/C 1번 = 지연 N톤·일', v: `M/C 1번 = 지연 ${n0(rp.tradeoff)}톤·일 · 강종 다른 날 10일 = M/C 1번 · 늦어도 최대 14일(주문은 60일)`, src: '10/20 · 10/22 사용자(③안)', edit: 1 },
        { t: '매일 재계획의 고정', what: '현장이 이미 준비한 것은 안 바꿈', how: '오늘 강종 = 지금 라인 상태, 내일부터 N일은 어제 계획 강종 그대로, 확정된 M/C·S/D 재가동 날짜·강종은 고정(인원 편성). 고정 때문에 지연·결품이 생기면 고정을 푼 계산을 한 번 더 해 \'이동 제안\'으로만 보여줌', v: `강종 고정 ${n0(rp.freezeDays)}일`, src: '10/20 lockMC', edit: 1 },
        { t: '최적 증명', what: '대충 나온 답을 쓰지 않음', how: '1단계(M/C·지연) → 2단계(선생산)를 차이 0 까지 풂. 2단계는 1단계 M/C 날짜를 고정. 사내 PC 에서 제안용 계산은 시간 제한 120초', v: '', src: '9/27', auto: 1 },
        { t: '생산 캘린더(2주~월말) 칸 채우기', what: '그날 칸에 어떤 주문이 들어가나', how: '하루 능력(톤) = 재계획 하루 톤(실적 속도 보정 — 10/30 이전 판생 제원치에서 바꿈), 그날 강종 = 재계획 강종. 그날 작업지시 코일이 능력보다 많으면 그날 능력 = 지시 톤, 넘친 만큼 다음 날에서 뺌. 확정(작업지시 1010 대상 코일, 현장 순서·시각) → 편성(소재가 들어와 있는 주문) → 예상(2주 안 입고 소재, 입고 + 5일 이후) 순, 같은 단계는 필요 생산일 빠른 주문부터. AL 은 두 라인 다 되므로 빈 날에 다른 라인 예정 주문을 실적 두께·폭 범위 안에서 옮겨 넣음', v: '', src: '10/28·10/29·10/30 사용자', auto: 1 },
        { t: '빈칸 이유', what: '능력이 남는 날', how: '그날 강종 소재가 없음(다른 강종 소재만 있음 = 강종 불일치) / 주문·소재 부족', v: '', src: 'cg_calendar', auto: 1 },
      ] },
      { k: 'cc', nm: '컬러', pl: 'C', steps: [
        { t: '월 물량', what: '그룹·품목별 이번 달 만들 양', how: '판생속보 그룹 목표(컬러수출·컬러건재·수요개발)를 판매계획 품목(품명·지역·고객) 비율로 나눔(첫 달 = 재고 뺀 필요량 비율, 다음 달부터 = 판매계획 비율) − 이번 달 실적. 컬러건재 = 계획재(운영안) + 주문재, 컬러수출 = 전량 주문재. 라인 월 한도 없음', v: '', src: '10/16·10/21', auto: 1 },
        { t: '계획재 판정', what: '어떤 사양이 계획재인가', how: '계획재 = 구매구분 수입 FH·서림 GI 사양만(사양 목록 판 단위, 6개월마다 바뀔 수 있음), 그 밖은 주문재. 수출 코일은 사양이 같아도 수출', v: '수입 FH · 서림 GI', src: '11/3 사용자', auto: 1 },
        { t: '수출 벌크·컨테이너', what: '선적 방식 구분', how: 'TF 판생 컬러건재수출·컬러가전수출 시트 「생산기준(배선일정)」에 \'벌크\'가 있으면 벌크, \'○일까지\'·\'완료기한 ○일\' = 선적 완료기한, \'전월 말 선생산\' = 다음 달 1~5일 선적분 → 이번 달 말 10일 안에 생산', v: '', src: 'TF 파일', auto: 1 },
        { t: '로트와 창', what: '물량을 덩어리로 나누고 언제부터~언제까지', how: '벌크 400t × 최대 4(기한 10일 전 ~ 기한) · 컨테이너 100t × 6(기한 있으면 10일 전 ~ 기한, 없으면 월 균등) · 가전내수 80t × 6 · 주문재 60t × 6 · 수요개발 60t × 3(월 균등: 로트마다 구간을 나눔)', v: '', src: '10/6 엔진 설계', auto: 1 },
        { t: '하루 능력', what: '라인별 하루 쓸 수 있는 분', how: '1,440분 − 그날 계획정지(휴지계획 파일: 계획휴지·S/D·수리·청소·샘플. Test 는 속도에 이미 포함이라 안 뺌) − 사용자 지정 휴지일(통째)', v: '', src: '10/21 사용자', auto: 1 },
        { t: '속도', what: '품목 × 라인 × 부서 t/h', how: '「컬러 품목별 단위생산량(2508_2607)」 kg/min × 0.06. kg/min = 생산중량 ÷ (작업 + 지시편성휴지 + 단판 + 품질·운전장애 시간). 엑셀에 없으면 MES 실적 → 같은 품명 다른 라인 → 라인 평균 → 10t/h', v: '', src: '10/21', auto: 1 },
        { t: '배정 우선순위', what: '어느 로트부터 자리를 잡나', how: '① 집약 묶음(아래) ② 한 라인에서만 되는 품명 ③ 수출 벌크 → 수출 컨테이너 → 가전내수·수요개발·주문재 → 계획재(남는 시간) ④ 같은 순위는 마감 빠른 것 → 큰 로트', v: '', src: 'L-21(10/17) · 10/19', auto: 1 },
        { t: '집약 묶음', what: '라인 전용 품목은 모아서 정한 횟수만', how: 'PVC Sol(1CCL PVS2·4·5) 월 1회 · Lami(3CCL) 월 1회 · STS(3CCL) 주 1회 · 가전 Print(4CCL PPH) 월 1회 · 건재 Print(4CCL) 월 2회. 묶음 안은 연속. STS 폭 1,270mm 이상은 4CCL', v: '', src: '10/19 사용자', auto: 1 },
        { t: '라인 고르기', what: '어느 라인', how: '품목별 적용라인(data/line_rules.json): 필수 라인이 있으면 그 라인 → 차면 두 번째로 많이 만든 라인 / 없으면 우선 1 → 2 → 3. 기본: PVS → 1CCL, Print → 4·2CCL, AL·PVDF·PUR2 → 4CCL, STS·라미 → 3CCL, 3CCL 은 가전 전용. 여러 라인이면 속도 빠른 라인, 2CCL 은 이미 가동하는 날에 몰아줌', v: '', src: 'L-20(10/13·10/16)', auto: 1 },
        { t: '날짜 찾기', what: '창 안의 빈칸', how: '시작~마감 안 → 그 전(선행 생산) → 그 뒤(지연). 재계산 때는 어제 계획 자리를 먼저 시도 — 단 그 자리가 기한을 넘긴 자리면 쓰지 않고 처음부터 다시 찾음', v: '', src: '10/19 · 11/5 사용자', auto: 1 },
        { t: '계획재(운영안 R15)', what: '남는 시간에 계획재', how: '수출·주문재를 넣은 뒤, 운영안 배치 순서 그대로(프린트·PVS2 별도 묶음, 폭 내림차순, 색상 → 소재 → 두께). 배치 시작 = 그 달 쓸 수 있는 시간 × 앞 배치까지 누적 물량 비율(월 전체에 고르게). 라인이 차면 품목별 적용라인의 다른 라인 → 그래도 못 넣으면 다음 달 그 라인 맨 앞', v: '', src: '10/19 · R15', auto: 1 },
        { t: '휴지 집약', what: '쉬는 시간을 덩어리로', how: '라인마다 순서는 그대로 앞날부터 꽉 채움. 늦추지 않음, 최대 30일 당김, 구매 소재가 당긴 날까지 안 들어오면 안 당김(오늘 + 35일 + 7일 뒤 생산분은 새로 발주 가능으로 보고 검사 안 함). 자가재는 막지 않고 당겨진 일정으로 자가재 필요일을 다시 계산', v: '최대 30일', src: '10/19 결정', auto: 1 },
        { t: '이월', what: '그 달 못 넣은 물량', how: '다음 달 1일부터 먼저(1~10일 안 마감)', v: '', src: '10/16', auto: 1 },
        { t: '생산 캘린더(2주~월말)', what: '칸 안 주문', how: '작업지시(1020 편성 대상, 소재 매치 Y)는 작업지시 순서 계산의 시각표 날짜 그대로 → 남는 능력은 통합 계획의 그날 그룹 편성(주문 연결 전). 통합 계획과 같은 게시 계획(휴지 집약 반영)을 씀', v: '', src: '10/30 · 11/5', auto: 1 },
        { t: '주문진도(1~4CCL)', what: '덜 만든 컬러 주문과 소재 상태', how: 'MES 컬러 주문(1년치) 중 종결 안 된 P 계약, 주문유형 R 제외, 잔량 = 주문 − 생산 실적, 잔량 1,000kg 이하 제외. 라인 = 생산예정 → 주문 생산예정라인 → 매치·작업지시 라인. 매치 = 아직 생산에 안 쓴 소재 MATCH. 작업가능일 = 매치된 잔량 ÷ 라인 하루 능력', v: '1CCL 480 · 2CCL 400 · 3CCL 200 · 4CCL 250t/일(합 1,330t)', src: '11/5 사용자(SSCHC1010 기준)', auto: 1 },
      ] },
      { k: 'mat', nm: '소재', pl: 'all', steps: [
        { t: '소재 필요량', what: '계획 생산에 드는 소재', how: '생산 계획 × 품목별 소재 사양 비중 ÷ 실수율(컬러 1.003, 수입 F/H 는 도금 1.008 도 곱함). 자가재(도금 → 컬러)는 자가재 탭', v: '', src: 'mat_order_spec', auto: 1 },
        { t: '재고 굴리기', what: '날마다 남는 소재', how: '지금 재고(사용가능·작업지시대기) + 기발주 입고 예정 − 날마다 필요량. 처음 음수가 되는 날 = 부족 시작일, 가장 깊게 모자란 양 = 부족량', v: '', src: 'mat_order_spec', auto: 1 },
        { t: '입고 필요일', what: '언제까지 들어와야 하나', how: '부족 시작일 − 투입 여유(입고 → 투입)', v: '컬러 7일 · 도금 5일', src: '팀 리드타임 표 10/12', auto: 1 },
        { t: '발주 마감', what: '언제까지 발주해야 하나', how: '입고 필요일 − 업체 리드타임. POSCO F/H = 매주 발주 + 5주(35일), 수입 FH = 발주 다음다음 달 7일경, 그 밖 업체 = 업체 기준정보 리드타임(없으면 35일)', v: 'F/H 35일', src: '팀 리드타임 표', auto: 1 },
        { t: '판정', what: '부족 확정 / 예상 / 마감 지남', how: '부족 확정 = 부족 시작이 오늘 + 리드타임 + 투입 여유 안(지금 발주해도 못 막음). 마감 지남 = 발주 마감 < 오늘, 2주 안 발주 = 마감이 14일 안', v: '', src: '11/3 · 11/4', auto: 1 },
        { t: '발주 배분', what: '어디에 얼마나', how: '재고·기발주를 먼저 쓰고 모자라는 만큼 \'27년 배정 비중대로 업체에 나눔', v: '', src: '팀 기준', auto: 1 },
        { t: '도금 주문 소재(F/H)', what: '주문별 소재 상태', how: 'F/H 발주 → 포스코 진행 단계(요수배 ~ 운송) → 입고. 예상 입고 = 인도납기(없으면 단계별 리드타임 중앙값). 필요 입고일 = 생산 필요일 − 5일, 예상 입고가 그보다 늦으면 \'소재 입고 지연\'', v: '', src: '10/28', auto: 1 },
      ] },
      { k: 'self', nm: '자가재', pl: 'all', steps: [
        { t: '자가재란', what: '도금이 만들어 컬러가 소재로 쓰는 코일', how: '판매그룹이 컬러수출·컬러건재·수요개발인 도금 주문. 도금 화면에서는 \'자가재(컬러수출)\'처럼 표시', v: '', src: '11/5', auto: 1 },
        { t: '필요일', what: '도금이 언제까지 만들어야 하나', how: '자가재 필요일 = 컬러 생산일 − 8일(도금 생산 → 컬러 입고 +1일 → 투입 +7일, MES 실측 중앙값 9일)', v: '8일', src: '팀 리드타임 표 10/12', auto: 1 },
        { t: '반순 묶음', what: '마감 단위', how: '필요일이 든 반순(10일·20일·말일) 끝이 그 자가재 품목의 납기. 강종 = 컬러 품명별 소재 사양(AZ·MAC·AL 비율)', v: '10·20·말일', src: 'integrated_plan', auto: 1 },
        { t: '앞당김 조건', what: '여유 있을 때만', how: '직판재(외부 판매)에 지연·결품이 없을 때만 반순을 앞당김. 지연 무게는 직판재보다 가볍게', v: '', src: '10/13', auto: 1 },
        { t: '목표 재고', what: '자가재 월말 재고', how: '목표 일수 × 다음 달 컬러 하루 사용량', v: `${A.days['G자가재']}일`, src: 'TF 장부', edit: 1 },
      ] },
      { k: 'ship', nm: '출하·재고', pl: 'all', steps: [
        { t: '하루 출하 계획', what: '이번 달 남은 출하를 날짜에 나눔', how: '남은 양 = 속보 월차 − 실적(그룹별). 국내·자동차·컬러 = MES 최근 완결 달의 월중 출하 패턴(말일 정렬) 비중으로 나눔. 도금수출 = 선적창 모양(계획 출고 비례). 다음 달부터 = 계획 출고를 같은 방식으로', v: '', src: '11/5 사용자 \'출하패턴 반영해\'', auto: 1 },
        { t: '재고 추이', what: '그룹별 날마다 재고', how: '어제 말 실제 재고(판생속보 원천 표) + 생산(도금 = 오늘 재계획, 컬러 = 확정 통합 계획) − 하루 출하 → 주말·월말 값', v: '', src: '10/14 사용자', auto: 1 },
        { t: '재고 상태', what: '목표 대비', how: '재고 일수 = 재고 ÷ 그 달 하루 출하. 목표의 50% 미만 = 부족, 200% 초과 = 과다', v: '', src: '관제판', auto: 1 },
      ] },
      { k: 'ord', nm: '납기 판정', pl: 'all', steps: [
        { t: '진행 단계', what: '주문이 어디까지 왔나', how: '생산 전 → 생산 중 → 생산 완료 뒤 출하 실적 없음 / 부분 출하 / 출하 완료. 생산 완료 = MES 생산 완료 또는 생산 ≥ 주문 − 0.5t. 출하 실적이 이어지지 않은 생산 완료는 출하 완료로 추정하지 않음', v: '', src: '11/4 2차 진단', auto: 1 },
        { t: '도금 지연 사유', what: '납기를 못 맞출 이유(위에서부터 먼저 걸리는 것)', how: '납기 60일 넘게 지난 미종결 → 자료 확인 / 주문량 없음 → 자료 확인 / 소재 입고가 필요 입고일보다 늦음 → 소재 입고 지연 / 생산 예정일 > 생산 필요일 → 생산 지연 / 미발주·급함 → 소재 발주 필요(필요 입고일 35일 안이면 지연 예상) / 생산 완료인데 납기 지남: 출하 일부 있으면 출하 지연, 출하 실적 없으면 자료 확인', v: '장기 미종결 60일', src: '11/4 · 11/5', auto: 1 },
        { t: '컬러 지연 사유', what: '컬러 주문', how: '자가재(도금) 주문이 지연이고 매치 전 → 자가재 지연 / 작업 가능일 지남 → 소재 지연 / 소재 없음(납기 14일 안·지남이면 지연 예상) / 작업 예정일 > 납기 → 생산 지연 / 납기 지남(매치 완료면 생산, 아니면 소재) / 입고 대기 → 점검', v: '', src: '11/4', auto: 1 },
        { t: '조치 마감일', what: '언제까지 손써야 하나', how: '소재 지연 = 필요 입고일, 생산 지연 = 생산 필요일, 컬러 소재 없음 = 납기 − 7일, 자가재 = 도금 쪽 마감 또는 납기 − 8일', v: '', src: 'ui/ct.js', auto: 1 },
      ] },
      { k: 'wo', nm: '작업지시 순서', pl: 'all', steps: [
        { t: '도금 우선순위', what: '같은 날 코일 순서', how: '두께·폭 → 규격(재질 = 열처리 온도) → 도금량 → 후처리 → 내경. 폭은 넓은 폭 → 좁은 폭(워크롤 단위, 1라인 AL 1,500~2,000km), 같은 폭은 얇은 것 먼저. 폭 넓힘 300mm까지', v: '', src: '10/27 작업지시서 · 10/29 회신', auto: 1 },
        { t: '도금 두께', what: '앞뒤 코일 두께', how: '두께비 1.3배 안, 두께 차 0.3mm 안(1라인 박물 0.3 이상 불가, 2라인 박물 0.2 초과 불가)', v: '1.3배 · 0.3mm', src: '10/27', auto: 1 },
        { t: '도금 재질', what: '바로 못 잇는 짝(노 온도)', how: 'AZ: CQ↔EDDQ, CQ↔Gr.E 저탄(사이 Gr.E 극저 1개), LFQ·DQ·DDQ·EDDQ↔Gr.E. PosMAC: Gr.C↔LFQ·DQ·DDQ·EDDQ, CQ↔DDQ·EDDQ, Gr.E↔DQ계. 같은 재질끼리 묶음(0.6t 이하 DQ·DDQ 꼭)', v: '', src: '10/28·10/29', auto: 1 },
        { t: '도금 후처리', what: '탱크 층 충돌', how: '같은 층 다른 약액은 바로 이어 못 씀(사이 2코일, 약 2시간)', v: '', src: '10/27', auto: 1 },
        { t: '컬러 조건', what: '그날 넣을 지시', how: '도료 생산일 이후 · PF 종류가 00 이 아니면 PF 입고예정일 이후. 그룹 순위 수출 → 가전내수·수요개발·주문재 → 계획재. 납기 칸은 쓰지 않음', v: '', src: '10/17·10/20 사용자', auto: 1 },
        { t: '컬러 같은 날 안 순서', what: '휴지 최소', how: '블록(1CCL 일반 → PVS2, 4CCL 일반 → 프린트) 안에서 휴지 최소. 색상교체 = max(0, 48.2분(프린트 83.7) − 순수생산시간), 2헤드 A→B→A 교대 0, 롤 교체(폭 넓어질 때), 더미(두께비 1.5배, 3·4CCL 1.3배)', v: '', src: 'docs/10 · R15', auto: 1 },
      ] },
    ];
  }

  /* ---------- 그리기 ---------- */
  let CTX = null, TAB = null;
  function stepHtml(s, i) {
    return `<li class="rl-st"><div class="rl-n">${i + 1}</div><div class="rl-b"><div class="rl-h"><b>${esc(s.t)}</b>${s.edit ? EDIT : s.auto ? AUTO : ''}</div>`
      + `<div class="rl-g"><span>무엇을</span><p>${esc(s.what)}</p><span>어떻게</span><p>${esc(s.how)}</p>${s.v ? `<span>값</span><p class="rl-v">${esc(s.v)}</p>` : ''}<span>근거</span><p class="rl-s">${esc(s.src || '')}</p></div></div></li>`;
  }
  function draw() {
    const T = tabs(CTX.A, CTX.P).filter((t) => t.pl === 'all' || scope() === 'all' || t.pl === scope());
    if (!T.find((t) => t.k === TAB)) TAB = (location.hash.slice(1) && T.find((t) => t.k === location.hash.slice(1)) || T[0]).k;
    const cur = T.find((t) => t.k === TAB);
    document.getElementById('r-tabs').innerHTML = T.map((t) => `<button type="button" data-k="${t.k}" aria-pressed="${t.k === TAB}">${esc(t.nm)} <small>${t.steps.length}</small></button>`).join('');
    document.getElementById('r-body').innerHTML = `<ol class="rl-flow">${cur.steps.map(stepHtml).join('')}</ol>` + exampleHtml(TAB);
    document.querySelectorAll('#r-tabs button').forEach((b) => b.onclick = () => { TAB = b.dataset.k; try { history.replaceState(null, '', location.pathname + location.search + '#' + TAB); } catch (e) { /* 무시 */ } draw(); });
    const total = tabs(CTX.A, CTX.P).reduce((a, t) => a + t.steps.length, 0);
    document.getElementById('r-cnt').textContent = `규칙 ${total}개 · 탭 ${T.length}개`;
  }

  /* ---------- 고정 예시(탭마다, 지금 게시본으로 계산) ---------- */
  function exampleHtml(k) {
    const X = CTX.X || {};
    const box = (h, body) => `<div class="rl-ex"><div class="rl-exh">예시 · ${h}</div>${body}</div>`;
    if (k === 'cc' && X.ccEx) return box(X.ccEx.title, X.ccEx.html);
    if (k === 'cg' && X.cgEx) return box(X.cgEx.title, X.cgEx.html);
    if (k === 'self' && X.selfEx) return box(X.selfEx.title, X.selfEx.html);
    if (k === 'mat' && X.matEx) return box(X.matEx.title, X.matEx.html);
    if (k === 'cc' && X.ccOrd) return '';
    return '';
  }

  /* ---------- 왜 그날 그 라인에서 그 시간에 ---------- */
  async function loadData(pw) {
    const get = async (f) => { try { const e = await GP.latest(f); return e ? await GP.decryptJSON(e, pw) : null; } catch (e) { return null; } };
    const [LP, CG, CC, MO] = await Promise.all([get('latest.plan.enc.json'), get('cg_calendar.enc.json'), get('cc_calendar.enc.json'), get('mat_order.enc.json')]);
    return { LP: LP && (LP.result || LP), CG, CC, MO };
  }
  function plateWhy(line, d) {
    const R = CTX.D.LP || {}, P = (R.P) || CTX.P || {}, cal = (R.cal || []).find((c) => c.line === line && c.date === d), t0 = (R.replan || {}).t0;
    if (!cal) return '<p class="muted">그날 재계획 칸이 없습니다(계획 범위 밖).</p>';
    const rows = (R.rows || []).filter((r) => r[0] === d && r[1] === line);
    const prev = (R.cal || []).find((c) => c.line === line && c.date === addD(d, -1));
    const mc = prev && prev.fam !== cal.fam;
    const rk = `${line}|${cal.fam}`, rate = ((P.rateBase || {})[rk]) || null;
    const used = 1440 - (cal.blackout || 0) - (cal.equip || 0) - (cal.nonfam || 0) - (cal.mcdummy || 0);
    const tot = rows.reduce((a, r) => a + (+r[4] || 0), 0);
    let h = `<ol class="rl-why">`;
    h += `<li><b>강종 ${esc(cal.fam)}</b> — ${mc ? `전날 ${esc(prev.fam)}에서 바뀌는 M/C 날(전환 더미 ${n0(cal.mcdummy)}분)` : `전날과 같은 강종${cal.event ? ` · ${esc(cal.event)}` : ''}`}${t0 && d <= addD(t0, CTX.A.replan.freezeDays) ? ` · 재계획 기준 ${md(t0)} 뒤 ${CTX.A.replan.freezeDays}일 안이라 강종 고정` : ''}</li>`;
    h += `<li><b>하루 능력</b> = 1,440분${cal.blackout ? ` − 정지 ${n0(cal.blackout)}` : ''} − 설비 정지 ${n1(cal.equip)} − 더미 ${n1(cal.nonfam)}${cal.mcdummy ? ` − M/C ${n0(cal.mcdummy)}` : ''} = <b>${n0(used)}분</b>${rate ? ` × ${(rate * 60).toFixed(1)}t/h(${esc(cal.fam)} 평균) ≈ ${n0(used * rate)}t` : ''} · 재계획이 그날 배정한 양 <b>${n0(tot)}t</b></li>`;
    if (rows.length) h += `<li><b>무엇을</b> — 최적화가 이 날에 넣은 (부서, 마감) 묶음: ${rows.sort((a, b) => b[4] - a[4]).slice(0, 8).map((r) => `${esc(r[3])} ${n0(r[4])}t(마감 ${md(r[5])}${r[5] < d ? ' · 지연' : r[5] > addD(d, 20) ? ' · 선생산' : ''})`).join(' · ')}. 마감이 가까운 묶음부터, 같은 강종 날에 몰아 M/C 를 줄이는 쪽으로 정해짐</li>`;
    const cg = ((CTX.D.CG || {}).lines || {})[line], cell = cg && cg.find((x) => x.d === d);
    if (cell) {
      const KO = { 확정: 0, 편성: 1, 예상: 2 }; const it = (cell.items || []).slice().sort((a, b) => (KO[a.kind] ?? 9) - (KO[b.kind] ?? 9) || String(a.start || '~').localeCompare(String(b.start || '~')) || String(a.need || '9').localeCompare(String(b.need || '9')));
      h += `<li><b>어떤 주문이 몇 시에</b> — 생산 캘린더(${md((CTX.D.CG || {}).asOf)} 기준): 확정(작업지시) ${n0(cell.conf)}t → 편성(소재 있음) ${n0(cell.plan)}t → 예상(2주 안 입고) ${n0(cell.fcst)}t 순, 같은 단계는 필요 생산일 빠른 주문부터. 칸 안 순서 = 넓은 폭 → 좁은 폭, 같은 폭 얇은 것 먼저`
        + `<div class="scroll"><table class="t rl-t"><thead><tr><th>시작</th><th>구분</th><th class="l">주문</th><th class="l">판매그룹</th><th class="l">목적지</th><th>두께×폭</th><th>톤</th><th>필요일</th></tr></thead><tbody>`
        + it.slice(0, 14).map((x) => `<tr><td>${esc(x.start || '-')}</td><td>${esc(x.kind)}</td><td class="l">${esc(x.con)}</td><td class="l">${esc(x.grp || '')}</td><td class="l">${esc(x.dst || '')}</td><td>${x.thk != null ? `${(+x.thk).toFixed(2)}×${n0(x.wdt)}` : ''}</td><td>${n1(x.t)}</td><td>${md(x.need)}</td></tr>`).join('')
        + `</tbody></table></div>${it.length > 14 ? `<p class="small muted">외 ${it.length - 14}건</p>` : ''}</li>`;
    } else h += `<li class="muted">생산 캘린더(2주~월말) 범위 밖이라 주문 단위는 아직 없음 — 재계획 묶음까지만</li>`;
    return h + '</ol>';
  }
  function colorWhy(line, d) {
    const IG = CTX.IG || {}, cell = (IG.color || []).find((c) => c.l === line && c.d === d);
    if (!cell) return '<p class="muted">그날 컬러 계획 칸이 없습니다(계획 범위 밖).</p>';
    const down = (IG.colorDown || []).filter((r) => r[1] === line && r[0] === d && r[2] !== 'test').reduce((a, r) => a + (+r[3] || 0), 0);
    const rows = (cell.rows || []).slice();
    const used = rows.reduce((a, r) => a + (+r[6] || 0), 0), tot = rows.reduce((a, r) => a + (+r[5] || 0), 0);
    let h = `<ol class="rl-why"><li><b>하루 능력</b> = 1,440분${down ? ` − 계획정지 ${n0(down)}분` : ''} = ${n0(1440 - down)}분 · 계획 ${n0(used)}분 사용 · ${n0(tot)}t${cell.act ? ' <b>(지난 날 — MES 실적)</b>' : ''}</li>`;
    h += `<li><b>들어간 물량과 이유</b><div class="scroll"><table class="t rl-t"><thead><tr><th class="l">그룹</th><th class="l">품명</th><th class="l">목적지·사양</th><th>톤</th><th>분</th><th>t/h</th><th class="l">이유(엔진 기록)</th></tr></thead><tbody>`
      + rows.map((r) => `<tr><td class="l">${esc(r[0])}</td><td class="l">${esc(r[1])}</td><td class="l">${esc([r[2], r[3]].filter(Boolean).join(' · '))}</td><td>${n1(r[5])}</td><td>${n0(r[6])}</td><td>${n1(r[7])}</td><td class="l rl-why-t"><div class="rl-wt">${esc(r[8] || '')}</div></td></tr>`).join('')
      + '</tbody></table></div><p class="small muted">이유 칸 = 엔진이 배정할 때 남긴 근거(우선순위 1 수출 벌크 · 2 수출 컨테이너 · 3 가전내수·수요개발·주문재 · 4 계획재)</p></li>';
    const cc = ((CTX.D.CC || {}).lines || {})[line], c2 = cc && cc.find((x) => x.d === d);
    if (c2) {
      const wo = (c2.items || []).filter((x) => x.kind === '작업지시').sort((a, b) => String(a.start).localeCompare(String(b.start)));
      h += `<li><b>몇 시에</b> — ${wo.length ? `작업지시 ${wo.length}건(작업지시 순서 계산 시각표): ${wo.slice(0, 10).map((x) => `${esc(x.start)} ${esc(x.con)} ${esc(x.item || '')} ${n1(x.t)}t`).join(' · ')}${wo.length > 10 ? ` 외 ${wo.length - 10}` : ''}` : '아직 작업지시 없음 — 판매그룹 편성 물량(주문 연결 전)만'}</li>`;
    }
    return h + '</ol>';
  }
  function selfWhy(line, d) {   // 컬러 행 소재 비중(r[12] = [[그룹, 강종, 비중]]) × 톤 = 자가재 필요 → 도금 재계획 자가재 행(마감 = 필요일이 든 반순 끝)
    const cell = ((CTX.IG || {}).color || []).find((c) => c.l === line && c.d === d);
    if (!cell) return '<p class="muted">그날 컬러 계획 칸이 없습니다.</p>';
    const need = {};
    for (const r of cell.rows || []) for (const x of (r[12] || [])) need[x[1]] = (need[x[1]] || 0) + (+r[5] || 0) * (+x[2] || 0);
    const ks = Object.keys(need).filter((k) => need[k] >= 0.5);
    if (!ks.length) return `<p class="muted">${md(d)} ${line} 생산 품명은 자가재(도금 소재)를 쓰지 않습니다 — 구매 소재(수입 FH·서림 GI 등)만.</p>`;
    const nd = addD(d, -8), y = +nd.slice(0, 4), m = +nd.slice(5, 7), dd = +nd.slice(8, 10), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${nd.slice(0, 8)}${String(dd <= 10 ? 10 : dd <= 20 ? 20 : last).padStart(2, '0')}`;
    const R = CTX.D.LP || {}, made = (R.rows || []).filter((r) => r[3] === '자가재' && r[5] >= addD(nd, -5) && r[5] <= end);   // 주문 기준 재계획(10/30~): 자가재 마감 = 컬러 주문 필요일 — 필요일 앞뒤(반순 끝까지)
    return `<ol class="rl-why"><li>${line} ${md(d)} 생산 중 자가재(도금 소재) 필요: ${ks.map((k) => `<b>${esc(k)} ${n0(need[k])}t</b>`).join(' · ')} (품명별 소재 비중 × 생산 톤)</li>`
      + `<li>필요일 = ${md(d)} − 8일 = <b>${md(nd)}</b> → 반순 끝 <b>${md(end)}</b> 이 도금 쪽 마감</li>`
      + `<li>도금 재계획에서 마감 ${md(addD(nd, -5))}~${md(end)} 자가재를 만드는 날: ${made.length ? ks.map((k) => { const mk = made.filter((r) => r[2] === k || (k === 'AL' && /^AL/.test(r[2]))); return `${esc(k)} — ${mk.length ? mk.slice(0, 6).map((r) => `${esc(r[1])} ${md(r[0])} ${n0(r[4])}t`).join(' · ') : '그 반순 배정 없음(재고·앞 반순 생산분으로 충당)'}`; }).join(' / ') : '그 반순 자가재 배정 없음 — 재고·앞 반순 생산분으로 충당'}</li></ol>`;
  }
  function matWhy(key) {
    const M = (((CTX.D.MO || {}).groups || {}).mats || []).find((m) => m.key === key);
    if (!M) return '';
    if (!M.first) return `<p>${esc(M.name)} — 3달 안 부족 없음(재고 ${n0(M.stock)}t + 입고 예정 ${n0(M.arr)}t)</p>`;
    const need = addD(M.first, -(M.safe || 0));
    return `<ol class="rl-why"><li><b>부족 시작</b> ${md(M.first)} — 재고 + 기발주 입고 − 날마다 필요량이 처음 음수가 되는 날(가장 깊게 ${n0(M.short)}t 모자람)</li>`
      + `<li><b>입고 필요일</b> = ${md(M.first)} − 투입 여유 ${M.safe}일 = <b>${md(need)}</b></li>`
      + `<li><b>발주 마감</b> = ${md(need)} − 리드타임 ${M.lt}일 = <b>${md(M.deadline)}</b>${(M.sup || []).filter(Boolean).length ? ` (${esc(M.sup.filter(Boolean).join('·'))})` : ''}</li>`
      + `<li><b>판정</b>: ${({ late: '마감 지남', soon: '2주 안 발주', plan: '발주 예정', ok: '충당' })[M.st] || M.st}${M.first < addD(CTX.today, (M.lt || 0) + (M.safe || 0)) ? ' · 부족 확정(지금 발주해도 리드타임 안에 못 막음)' : ''}</li></ol>`;
  }
  function drawWhy() {
    const ln = document.getElementById('x-line').value, d = document.getElementById('x-date').value, out = document.getElementById('x-out');
    const G = /CGL/.test(ln);
    out.innerHTML = `<h3>${ln} ${md(d)}(${wd(d)}) — ${G ? '도금' : '컬러'}</h3>` + (G ? plateWhy(ln, d) : colorWhy(ln, d) + `<h3>자가재 — 이 컬러 생산에 쓰는 도금 소재</h3>${selfWhy(ln, d)}`);
    const mk = document.getElementById('x-mat').value;
    document.getElementById('x-mout').innerHTML = mk ? matWhy(mk) : '';
  }
  function buildExamples() {
    const IG = CTX.IG || {}, X = {};
    // 컬러: 1CCL 11/23(없으면 다음 가동일)
    const pick = (l, d) => (IG.color || []).find((c) => c.l === l && c.d === d && !c.act && (c.rows || []).length);
    const cd = pick('1CCL', '2026-11-23') ? '2026-11-23' : ((IG.color || []).find((c) => c.l === '1CCL' && !c.act && c.d > CTX.today && (c.rows || []).length) || {}).d;
    if (cd) X.ccEx = { title: `1CCL ${md(cd)} — 지금 게시 계획`, html: colorWhy('1CCL', cd) };
    const R = CTX.D.LP || {}, t0 = (R.replan || {}).t0 || CTX.today, gd = addD(t0, 2);
    X.cgEx = { title: `1CGL ${md(gd)} — 지금 게시 계획`, html: plateWhy('1CGL', gd) };
    const sc = (IG.color || []).find((c) => !c.act && c.d > addD(CTX.today, 5) && (c.rows || []).some((r) => (r[12] || []).length));
    if (sc) X.selfEx = { title: `${sc.l} ${md(sc.d)} 컬러 생산에 쓰는 자가재`, html: selfWhy(sc.l, sc.d) };
    const ms = (((CTX.D.MO || {}).groups || {}).mats || []).filter((m) => m.first).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0];
    if (ms) X.matEx = { title: `${ms.name} 발주 마감`, html: matWhy(ms.key) };
    CTX.X = X;
  }

  window.RULES = {
    async init(ctx) {
      CTX = Object.assign({}, ctx, { today: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) });
      CTX.D = await loadData(ctx.PW);
      buildExamples();
      draw();
      // 설명기 선택지
      const lines = ['1CGL', '2CGL', '1CCL', '2CCL', '3CCL', '4CCL'].filter((l) => scope() === 'all' || (scope() === 'G') === /CGL/.test(l));
      const xl = document.getElementById('x-line'), xd = document.getElementById('x-date'), xm = document.getElementById('x-mat');
      xl.innerHTML = lines.map((l) => `<option>${l}</option>`).join('');
      xd.value = addD(CTX.today, 1); xd.min = '2026-10-01'; xd.max = '2027-01-31';
      const mats = (((CTX.D.MO || {}).groups || {}).mats || []).filter((m) => scope() === 'all' || m.plant === scope());
      xm.innerHTML = '<option value="">소재 고르기</option>' + mats.map((m) => `<option value="${esc(m.key)}">${esc(m.name)}${m.first ? ` · 부족 ${md(m.first)}` : ''}</option>`).join('');
      if (mats.find((m) => m.first)) xm.value = mats.filter((m) => m.first).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0].key;
      [xl, xd, xm].forEach((el) => el.addEventListener('change', drawWhy));
      drawWhy();
      if (window.UI && UI.onScope) UI.onScope(() => { draw(); });
    },
  };
})();
