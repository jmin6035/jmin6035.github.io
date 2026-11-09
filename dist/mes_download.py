"""MES 자동 다운로드(사내 PC) → mes/ 폴더 → 자동 실행기(python -m cglplan auto).
받은 기존 MES 코드(Edge 자동화)의 로그인·쿼리 화면·엑셀 Export 방식을 그대로 쓰고, 도금 가동계획에 필요한 것만 받는다.
  ① 생산 쿼리(코일 1줄: 라인·도금종류·중량·시각)   → mes/q_prod.json
  ② 휴지 쿼리(생산번호 1줄: 휴지 시작·종료·사유)    → mes/q_brk.json
  ③ 생산실적 조회 화면(도금: 부서·계약·두께·폭)      → mes/screen_prod.json
결과 표는 화면에서 직접 읽어 .json 으로 저장한다(엑셀 파일을 거치지 않으므로 회사 문서보안(DRM)이 걸리지 않음).
화면 표를 못 읽으면 기존 방식(엑셀 Export, .xlsx)으로 받는다.
실행:  py mes_download.py                 (어제까지 최근 14일)
       py mes_download.py --from 20260701 (처음 한 번: 과거 실적 채우기)
       py mes_download.py --no-auto       (내려받기만)
로그인 정보는 auto_config.json 의 "mes": {"id": "...", "pw": "...", "url": "(선택) 접속 주소"} 또는 환경변수 MES_ID / MES_PW 에서 읽는다(코드에 적지 않음)."""
import argparse
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys
import time
import hashlib
import re
import ssl
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
QUERIES_URLS = ('https://jmin6035.github.io/published/queries.enc.json',)   # 10/30 주소 전환(예전 gadong-plan-web 폐기) —   # 원격 조회 목록(클라우드에서 추가, SELECT 만, 분석 암호로 암호화)
BAD_SQL = re.compile(r'\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|exec|execute|call|begin|declare|commit|rollback|lock|into)\b', re.I)
MES_URL = 'https://intra-mes.poscosteeleon.com:8443/SCOM/main.do'
SALES_RPT_URL = 'https://intra-mes.poscosteeleon.com:8443/SMKT/pages/NewYnc/jRdProdSalesDetail_2016_SSO.jsp'   # 판매생산속보


def q_prod(d0, d1):
    return ("select distinct a.prd_no as prd_no, a.pdt_no as pdt_no, TO_CHAR(to_date(a.prd_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as prd_dt, a.line_cls as line_cls, "
            "TO_CHAR(a.wrk_sta_tm, 'YYYY-MM-DD HH24:MI:SS') as wrk_sta_tm, TO_CHAR(a.wrk_end_tm, 'YYYY-MM-DD HH24:MI:SS') as wrk_end_tm, "
            "a.wrk_time as tot_wrk_time, a.pau_time as tot_pau_time, a.opr_time as tot_opr_time, a.cot_cls as cot_cls, a.pdt_net_wgt as pdt_net_wgt, a.viw_grd as viw_grd "
            f"from sops.pf_cg_prod_rslt a where a.prd_dt between '{d0}' and '{d1}' and a.line_cls in ('A', 'B') order by line_cls, wrk_sta_tm")


def q_brk(d0, d1):
    nm = lambda c: f"(select cd_nm from scom.scom_code_detail where master_cd in ('CLR_NOPR_PAU_CD', 'CMN_NOPR_PLN_PAU_CD') and cd_val = {c})"
    cols = ["b.prd_no as prd_no", "(select max(a.line_cls) from sops.pf_cg_prod_rslt a where a.prd_no = b.prd_no) as line_cls"]
    for i in (1, 2, 3):
        cols += [f"TO_CHAR(b.pau_sta_tm_{i}, 'YYYY-MM-DD HH24:MI:SS') as pau_sta_tm_{i}", f"TO_CHAR(b.pau_end_tm_{i}, 'YYYY-MM-DD HH24:MI:SS') as pau_end_tm_{i}",
                 f"(CAST(b.pau_end_tm_{i} AS DATE) - CAST(b.pau_sta_tm_{i} AS DATE)) * 24 * 60 as pau_time_{i}"]
    for i in (1, 2, 3):
        cols += [f"b.pau_rsn_cd_{i} as pau_rsn_cd_{i}", f"{nm(f'b.pau_rsn_cd_{i}')} as pau_rsn_cd_{i}_nm"]
    cols += ["b.pau_cls as pau_cls", "b.pau_dtl_cls as pau_dtl_cls", f"{nm('b.pau_dtl_cls')} as pau_dtl_cls_nm"]
    return (f"select {', '.join(cols)} from sops.pf_cg_brk b where b.prd_no in (select a.prd_no from sops.pf_cg_prod_rslt a "
            f"where a.prd_dt between '{d0}' and '{d1}' and a.line_cls in ('A', 'B')) order by 2, 3")


# ---- 분석용 추가 자료(컬러·출하·재고) — mes/extra/ 에 저장. 도금 자동 계획은 읽지 않고, 암호화해 Claude 분석용으로만 게시 ----
CCL = "CASE a.line_cls WHEN 'X' THEN '1CCL' WHEN 'Y' THEN '2CCL' WHEN 'Z' THEN '3CCL' WHEN 'W' THEN '4CCL' ELSE a.line_cls END"


def q_color(d0, d1):
    """컬러 코일별 생산실적(사용자 MES 스크립트 query_color_detail + 라인·소재번호)"""
    return ("select TO_CHAR(TO_DATE(a.prd_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as prd_dt, " + CCL + " as line, a.pdt_no, a.con_no, a.con_seq, "
            "a.raw_no, a.raw_par_no, a.raw_pur_year, a.pdt_nm, a.ord_usg_cd, a.pdt_wgt, a.pdt_len, a.raw_tre_wgt, a.sur_finish_cd, a.bak_finish_cd, "
            "a.wrk_sta_tm, a.wrk_end_tm, a.wrk_time, "
            "(select sum(pau_time) from sops.pf_cc_brk where pdt_mom_no = a.pdt_no) as pau_time, b.isd_raw_scrap_wgt, b.osd_pdt_scrap_wgt, "
            "a.pdt_wdt, a.raw_wdt, a.real_msr_thk, a.real_msr_wdt, a.line_speed, a.viw_grd, a.pdt_grd, a.re_tre_yn, a.ent_yn, "
            "SMKT.ESF_GET_DEPART_NM(c.depart_cd) as dept, SMKT.ESF_GET_EMP_NM(d.chr_man_id) as chr_man "
            "from sops.pf_cc_ccl_rslt a, sops.pf_cc_coil_use b, smkt.os_gc_ord_com c, (select con_no, con_seq, max(chr_man_id) as chr_man_id from smkt.os_gc_ord_dtl group by con_no, con_seq) d "
            "where a.pdt_no = b.pdt_no(+) and a.pnt_cnt = b.pnt_cnt(+) and a.con_no = b.con_no(+) and a.con_seq = b.con_seq(+) and a.raw_no = b.raw_no(+) and a.raw_par_no = b.raw_par_no(+) "
            f"and a.con_no = c.con_no(+) and a.con_no = d.con_no(+) and a.con_seq = d.con_seq(+) and a.prd_dt between '{d0}' and '{d1}' order by 2, 16")


def q_color_brk(d0, d1):
    """컬러 휴지 상세(열 구성을 몰라 전체 열) — 그 기간 생산 코일에 걸린 휴지"""
    nm = "(select max(cd_nm) from scom.scom_code_detail where master_cd like '%PAU%' and cd_val = b.pau_rsn_cd_1)"   # 사유 코드 이름(도금 휴지와 같은 코드표)
    return (f"select b.*, {nm} as pau_rsn_nm_1 from sops.pf_cc_brk b where b.pdt_mom_no in (select a.pdt_no from sops.pf_cc_ccl_rslt a where a.prd_dt between '{d0}' and '{d1}')")


def q_ship(d0, d1):
    """제품 출하 코일별(도금·컬러, 판매·자가재·기타 출고) — 판매 대비 생산 분석용"""
    return ("select TO_CHAR(TO_DATE(a.out_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as out_dt, a.plt_cls, a.out_rsn_cd, a.pdt_no, a.con_no, "
            "SMKT.ESF_GET_DEPART_NM(e.depart_cd) as dept, d.pdt_net_wgt as wgt "
            "from sshp.pf_pdt_out a, sshp.pf_pdt_mast d, smkt.os_gc_ord_com e "
            f"where a.out_dt between '{d0}' and '{d1}' and a.out_rsn_cd in ('1300', '1351', '1352', '1360', '1361', '1362') "
            "and a.pdt_no = d.pdt_no and a.pdt_par_no = d.pdt_par_no and a.con_no = e.con_no(+) order by 1, 2")


def q_stock_trend(d0, d1):
    """일별 재고 추이(소재 사내·사외, 도금·컬러 제품) — 사용자 MES 스크립트 3·4·5번 합본"""
    return ("select TO_CHAR(TO_DATE(wrk_dt, 'YYYYMMDD'), 'YYYY-MM-DD') as wrk_dt, kind, sum(w1) as w1, sum(w2) as w2, sum(w3) as w3 from ("
            "select wrk_dt, '소재_' || cls as kind, NVL(in_cpy_wgt, 0) + NVL(gagong_wgt, 0) as w1, NVL(pier_wgt, 0) + NVL(cheolsong_wgt, 0) + NVL(samil_wgt, 0) + NVL(etc_wgt, 0) + NVL(sinyang_wgt, 0) + NVL(sangsin_wgt, 0) as w2, 0 as w3 "
            f"from smkt.os_gc_compr_prompt_rpt_7 where wrk_dt between '{d0}' and '{d1}' and ((cls = 'G' and cls_1 in ('1', '2', '3')) or (cls = 'C' and cls_1 not in ('4'))) "
            "union all select wrk_dt, '도금제품', NVL(wrh_wgt, 0), NVL(pyeongchi_wgt, 0), NVL(etc_wgt, 0) + NVL(cc_prs_wgt, 0) "
            f"from smkt.os_gc_compr_prompt_rpt_8 where wrk_dt between '{d0}' and '{d1}' and cls in ('1', '2', '3', '4') "
            "union all select wrk_dt, '컬러제품', NVL(wrk_wgt_1, 0) + NVL(wrk_wgt_2, 0), NVL(prs_wgt_1_a, 0) + NVL(prs_wgt_1_b, 0) + NVL(prs_wgt_1_c, 0) + NVL(prs_wgt_2, 0) + NVL(pyeongchi_wgt, 0) + NVL(shipping_yard_wgt, 0), "
            "NVL(sp_wgt, 0) + NVL(etc_wgt, 0) + NVL(sangsin_wgt, 0) + NVL(pier_wgt, 0) + NVL(sinyang_wgt, 0) + NVL(sinyang_b_wgt, 0) "
            f"from smkt.os_gc_compr_prompt_rpt_9 where wrk_dt between '{d0}' and '{d1}') group by wrk_dt, kind order by 1, 2")


def q_rpt(n):
    """판매생산속보 원천 표 그대로(모든 열) — 사외 창고·자가재·임가공까지 속보와 같은 정의로 일별 재고 추이 재현용"""
    return lambda d0, d1: f"select * from smkt.os_gc_compr_prompt_rpt_{n} where wrk_dt between '{d0}' and '{d1}' order by wrk_dt"


STOCK_RPT = [('stock_rpt7', q_rpt(7), 30), ('stock_rpt8', q_rpt(8), 30), ('stock_rpt9', q_rpt(9), 30)]


def creds():
    cfg = {}
    p = os.path.join(HERE, 'auto_config.json')
    if os.path.exists(p):
        cfg = json.loads(open(p, encoding='utf-8-sig').read(), strict=False).get('mes') or {}
    uid, pw = os.environ.get('MES_ID') or cfg.get('id'), os.environ.get('MES_PW') or cfg.get('pw')
    if not uid or not pw:
        sys.exit('MES 로그인 정보가 없습니다 — auto_config.json 에 "mes": {"id": "...", "pw": "..."} 를 넣거나 환경변수 MES_ID/MES_PW 를 설정하세요')
    return uid, pw, (os.environ.get('MES_URL') or cfg.get('url') or MES_URL).strip()


class _Tee:
    """화면 출력을 out/run_log.txt 에도 남김(창이 닫혀도 원인 확인용)"""
    def __init__(self, stream, path):
        self.s, self.f = stream, open(path, 'w', encoding='utf-8', buffering=1)

    def write(self, x):
        try:
            self.s.write(x)
        except Exception:
            pass
        self.f.write(x)

    def flush(self):
        try:
            self.s.flush()
        except Exception:
            pass
        self.f.flush()


class RemoteOnlyDone(Exception):
    """--remote-only: 원격 조회만 끝내고 나머지 내려받기는 건너뜀(main 밖에서 받아 추가 자료만 게시)"""


def register_task(at='07:35', every='09:35-19:40'):
    """작업 스케줄러 등록: 이 파이썬으로 이 폴더의 mes_download.py 를 매일 at 에 실행. 옛 작업 이름은 지움"""
    exe = sys.executable
    cmd = f'"{exe}" "{os.path.join(HERE, "mes_download.py")}"'
    for old in ('CGL 자동수집', 'CGL auto'):
        subprocess.run(['schtasks', '/Delete', '/TN', old, '/F'], capture_output=True)
    r = subprocess.run(['schtasks', '/Create', '/TN', 'CGL auto', '/TR', cmd, '/SC', 'DAILY', '/ST', at, '/F'], capture_output=True, text=True, errors='replace')
    print((r.stdout or '') + (r.stderr or ''))
    if r.returncode:
        print('등록 실패 — 명령 프롬프트를 "관리자 권한으로 실행"해서 다시 해 보세요.')
        return 1
    q = subprocess.run(['schtasks', '/Query', '/TN', 'CGL auto', '/V', '/FO', 'LIST'], capture_output=True, text=True, errors='replace')
    print('\n'.join(l for l in (q.stdout or '').splitlines() if any(k in l for k in ('작업 이름', 'TaskName', '다음 실행', 'Next Run', '실행할 작업', 'Task To Run')))[:1500])
    print(f'등록됨: 매일 {at} — {cmd}')
    # 원격 조회만 2시간마다(전체 재계획 없이 약 10분 — 시간초과 조회가 끼면 300초씩 늘어남) — 클라우드에서 새 조회문을 올리면 당일 받아 옴
    st, et = every.split('-')
    cmd2 = f'"{exe}" "{os.path.join(HERE, "mes_download.py")}" --remote-only'
    subprocess.run(['schtasks', '/Delete', '/TN', 'CGL remote', '/F'], capture_output=True)
    h0, m0 = map(int, st.split(':')); h1, m1 = map(int, et.split(':')); du = (h1 * 60 + m1) - (h0 * 60 + m0)
    # 11/5: 예전 /SC HOURLY /ST /ET 는 '한 번만(등록한 날)' 트리거가 돼 다음 날부터 안 돌았음 → 매일 + 2시간 반복(/RI 120) + 반복 기간(/DU)
    r2 = subprocess.run(['schtasks', '/Create', '/TN', 'CGL remote', '/TR', cmd2, '/SC', 'DAILY', '/ST', st, '/RI', '120', '/DU', f'{du // 60:02d}:{du % 60:02d}', '/F'], capture_output=True, text=True, errors='replace')
    print((r2.stdout or '') + (r2.stderr or ''))
    print(f'등록됨: 원격 조회만 {st}~{et} 2시간마다 — {cmd2}' if not r2.returncode else '원격 조회 2시간 등록 실패(매일 실행은 등록됨)')
    task_settings()
    return 0


def task_settings():
    """schtasks 기본값 보완: PC가 꺼져·절전이던 시각을 놓치면 켜지는 즉시 실행, 절전이면 깨움, 걸린 실행은 제한 시간 뒤 끝냄(다음 날 실행이 막히지 않게)"""
    ps = ("$a = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries "
          "-MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2); Set-ScheduledTask -TaskName 'CGL auto' -Settings $a | Out-Null; "
          "$r = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries "
          "-MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 50); Set-ScheduledTask -TaskName 'CGL remote' -Settings $r | Out-Null; 'ok'")
    r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], capture_output=True, text=True, errors='replace')
    if 'ok' in (r.stdout or ''):
        print('설정됨: 놓친 실행은 PC가 켜지면 바로 실행 · 절전이면 깨움 · 걸린 실행은 2시간(원격 50분) 뒤 끝냄')
    else:
        print('추가 설정 실패(시각 등록은 됨) — 작업 스케줄러에서 CGL auto > 설정 > "예약된 시작 시간을 놓친 경우 가능한 대로 빨리 작업 시작" 체크\n' + (r.stderr or '')[:300])


DIST_URL = 'https://jmin6035.github.io/dist/'
SKIP_PUSH = False


def local_version():
    try:
        return re.search(r"AUTO_VERSION = '([^']+)'", open(os.path.join(HERE, 'cglplan', 'auto.py'), encoding='utf-8').read()).group(1)
    except Exception:
        return '?'


def _fetch(url, timeout=60):
    """사이트에서 받기: 파이썬 → 안 되면 PowerShell(Windows 로그인 자격·시스템 프록시)"""
    try:
        ctx = ssl.create_default_context()
        if hasattr(ssl, 'VERIFY_X509_STRICT'):
            ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
        with urllib.request.urlopen(urllib.request.Request(url + f'?v={int(time.time())}'), timeout=timeout, context=ctx) as r:
            return r.read()
    except Exception as e1:
        if os.name != 'nt':
            raise
        tmp = os.path.join(HERE, 'out', '_dl.bin')
        r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
                            f"Invoke-WebRequest -UseBasicParsing -UseDefaultCredentials -Uri '{url}?v={int(time.time())}' -OutFile '{tmp}'"],
                           capture_output=True, text=True, errors='replace', timeout=timeout + 30)
        if r.returncode or not os.path.exists(tmp):
            raise RuntimeError(f'{e1} / PowerShell: {(r.stderr or "")[:200]}')
        b = open(tmp, 'rb').read()
        os.remove(tmp)
        return b


def self_update():
    """2026-11-09: 고칠 때마다 사람이 파일을 바꿔 깔아야 해서 사내 PC가 옛 판으로 계속 멈춰 있었음 →
    실행할 때마다 사이트 dist/version.txt 와 비교해 새 판이면 묶음(zip)을 받아 덮어쓰고(auto_config.json·mes·out 은 그대로) 같은 명령으로 다시 실행"""
    if os.environ.get('CGL_UPDATED') or '--no-update' in sys.argv:
        return
    cur = local_version()
    try:
        new = _fetch(DIST_URL + 'version.txt', 30).decode('utf-8', 'replace').strip()
    except Exception as e:
        print(f'자동 업데이트 확인 실패(지금 판으로 계속): {e}')
        return
    if not new or new == cur or len(new) > 60:
        print(f'설치 묶음 최신({cur})')
        return
    print(f'새 설치 묶음 {new} (지금 {cur}) → 받아서 바꿈')
    try:
        import io
        import zipfile
        z = zipfile.ZipFile(io.BytesIO(_fetch(DIST_URL + 'cglplan_auto.zip', 120)))
        for n in z.namelist():
            if n.endswith('/') or n in ('auto_config.json',) or n.startswith(('mes/', 'out/')):
                continue
            dst = os.path.join(HERE, *n.split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as f:
                f.write(z.read(n))
    except Exception as e:
        print(f'자동 업데이트 실패(지금 판으로 계속): {e}')
        return
    print('바꾼 판으로 다시 실행')
    sys.stdout.flush()
    global SKIP_PUSH
    SKIP_PUSH = True                                     # 실행 기록은 다시 실행한 쪽이 올림
    env = dict(os.environ, CGL_UPDATED='1', PYTHONUTF8='1', PYTHONUNBUFFERED='1')
    rc = subprocess.call([sys.executable, os.path.join(HERE, 'mes_download.py')] + sys.argv[1:], cwd=HERE, env=env)
    raise SystemExit(rc)


def seed_acc():
    """누적본 복구(11/9 사용자 '이미 5개월치를 다 가지고 있는데 왜 매번 다시 가져오냐'): out/extra_acc 에 재고현황 누적본이 없으면(새 폴더)
    서버 게시본(published/extradata.enc.json — 지난 실행까지 쌓인 전 표)을 받아 표마다 파일로 풀어 둠. 메모리를 안 쓰게 압축을 흘려 풀며 표 경계만 셈"""
    try:
        cfg = json.loads(open(os.path.join(HERE, 'auto_config.json'), encoding='utf-8-sig').read(), strict=False)
        od = cfg.get('out_dir') or 'out'
        acc = os.path.join(od if os.path.isabs(od) else os.path.join(HERE, od), 'extra_acc')
        if os.path.exists(os.path.join(acc, 'snap_stock.json')):
            return
        sbc, pw = cfg.get('supabase') or {}, cfg.get('analysis_password') or cfg.get('password')
        if not (sbc.get('url') and pw):
            return
        print('누적본 없음 → 서버 게시본에서 복구(한 번만)')
        import base64, zlib
        sys.path.insert(0, HERE)
        from cglplan import publish as PB
        from cglplan.supa import make_ctx
        with urllib.request.urlopen(sbc['url'].rstrip('/') + f'/storage/v1/object/public/published/extradata.enc.json?v={int(time.time())}',
                                    timeout=300, context=make_ctx(sbc.get('ssl_verify', True))) as r:
            env = json.loads(r.read())
        gz = PB._aes()(PB._key(pw, base64.b64decode(env['salt']), env['iter'])).decrypt(base64.b64decode(env['iv']), base64.b64decode(env['ct']), None)
        del env
        os.makedirs(acc, exist_ok=True)
        dz = zlib.decompressobj(16 + zlib.MAX_WBITS)
        depth, ins, esc, key, kbuf, out, n = 0, False, False, None, None, None, 0
        for i in range(0, len(gz), 1 << 20):
            chunk = dz.decompress(gz[i:i + (1 << 20)])
            start = 0
            for j, c in enumerate(chunk):
                if ins:
                    if esc:
                        esc = False
                    elif c == 92:
                        esc = True
                    elif c == 34:
                        ins = False
                        if kbuf is not None and depth == 2 and out is None:
                            key = bytes(kbuf).decode('utf-8'); kbuf = None
                    elif kbuf is not None and out is None:
                        kbuf.append(c)
                    continue
                if c == 34:
                    ins = True
                    if depth == 2 and out is None:
                        kbuf = bytearray()
                elif c in (123, 91):
                    depth += 1
                    if depth == 3 and key:
                        out = open(os.path.join(acc, key + '.json'), 'wb'); start = j
                elif c in (125, 93):
                    depth -= 1
                    if depth == 2 and out is not None:
                        out.write(chunk[start:j + 1]); out.close(); out = None; key = None; n += 1
            if out is not None:
                out.write(chunk[start:])
        del gz
        print(f'누적본 복구: 표 {n}개')
    except Exception as e:
        print(f'누적본 복구 실패(계속 진행): {e}')


def kill_stale_browsers():
    """11/9: 앞 실행에서 멈춘 자동화 브라우저(Chrome/Edge)가 남아 있으면 새 실행이 MES 첫 화면부터 응답 없음(120초)으로 죽음 →
    자동화로 띄운 창(명령줄에 --test-type=webdriver)과 드라이버만 끔. 사용자가 직접 연 브라우저는 건드리지 않음"""
    if os.name != 'nt':
        return
    ps = ("$n=0; Get-CimInstance Win32_Process | Where-Object { ($_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -match '--test-type=webdriver') "
          "-or $_.Name -in @('chromedriver.exe','msedgedriver.exe') } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $n++ } catch {} }; $n")
    try:
        r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], capture_output=True, text=True, errors='replace', timeout=60)
        n = (r.stdout or '').strip().splitlines()[-1:] or ['0']
        if n[0] not in ('0', ''):
            print(f'남아 있던 자동화 브라우저·드라이버 {n[0]}개 끔')
            time.sleep(3)
    except Exception as e:
        print(f'남은 브라우저 정리 실패(계속): {e}')


def ensure_tasks():
    """예약 작업 자가 점검(2026-11-09): 'CGL auto'·'CGL remote' 가 없거나 다른 폴더를 가리키면 이 폴더로 다시 등록. 상태는 실행 기록에 남김"""
    if os.name != 'nt':
        return
    ok = True
    for tn in ('CGL auto', 'CGL remote'):
        q = subprocess.run(['schtasks', '/Query', '/TN', tn, '/V', '/FO', 'LIST'], capture_output=True, text=True, errors='replace')
        out = q.stdout or ''
        keys = ('상태', 'Status', '마지막 실행', 'Last Run', '마지막 결과', 'Last Result', '다음 실행', 'Next Run', '실행할 작업', 'Task To Run', '로그온 모드', 'Logon Mode')
        print(f'[예약 작업 {tn}] ' + (' | '.join(' '.join(l.split()) for l in out.splitlines() if l.strip().startswith(keys)) or '없음'))
        if q.returncode or os.path.join(HERE, 'mes_download.py').lower() not in out.lower().replace('"', ''):
            ok = False
    if not ok:
        print('예약 작업이 없거나 다른 폴더를 가리킴 → 이 폴더로 다시 등록')
        try:
            register_task()
        except Exception as e:
            print(f'예약 작업 재등록 실패: {e}')


def main():
    try:
        os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
        sys.stdout = sys.stderr = _Tee(sys.__stdout__, os.path.join(HERE, 'out', 'run_log.txt'))
        try:                                                 # 설치 묶음 판 표시(2026-10-21: --remote-only 에선 판이 안 보여 새 묶음인지 확인할 수 없었음)
            ver = re.search(r"AUTO_VERSION = '([^']+)'", open(os.path.join(HERE, 'cglplan', 'auto.py'), encoding='utf-8').read()).group(1)
        except Exception:
            ver = '?'
        print(f'실행 시작 {datetime.datetime.now():%Y-%m-%d %H:%M:%S} · 설치 묶음 {ver}')
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='d0', help='시작일 YYYYMMDD (기본: 14일 전)')
    ap.add_argument('--to', dest='d1', help='종료일 YYYYMMDD (기본: 어제)')
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--no-auto', action='store_true', help='내려받기만 하고 자동 실행기는 돌리지 않음')
    ap.add_argument('--out', default=os.path.join(HERE, 'mes'))
    ap.add_argument('--no-extra', action='store_true', help='컬러·출하·재고(분석용) 내려받기 생략')
    ap.add_argument('--stock-only', action='store_true', help='제품재고·소재재고만 받기(도금 실적은 건너뜀)')
    ap.add_argument('--probe', help='메뉴 검색어를 넣고 검색 결과 화면 구조를 기록(진단용, 예: 4025)')
    ap.add_argument('--stock-manual', action='store_true', help='제품재고: 화면 이동·조회는 사람이 하고, 표 읽기만 자동')
    ap.add_argument('--stock-months', type=int, default=6, help='재고현황 기준월 몇 달치(이번 달 포함, 기본 6)')
    ap.add_argument('--remote-only', action='store_true', help='원격 조회 목록만 실행하고 추가 자료만 게시(재계획 없음, 약 10분)')
    ap.add_argument('--register', action='store_true', help='매일 07:35 자동 실행을 Windows 작업 스케줄러에 등록(.bat 없이 파이썬 직접 실행)')
    ap.add_argument('--no-update', action='store_true', help='자동 업데이트 건너뜀')
    a = ap.parse_args()
    if a.register:
        sys.exit(register_task())
    self_update()
    ensure_tasks()
    seed_acc()
    kill_stale_browsers()
    today = datetime.date.today()
    months = []                                          # 재고현황 조회 달(⑤에서 채움)
    d1 = a.d1 or (today - datetime.timedelta(days=1)).strftime('%Y%m%d')
    d0 = a.d0 or min(today - datetime.timedelta(days=a.days), today.replace(day=1)).strftime('%Y%m%d')   # 최소 이번 달 1일부터(화면이 월 단위 — 누적 기록이 지워져도 이번 달은 다시 채워짐)
    fmt = lambda s: f'{s[:4]}-{s[4:6]}-{s[6:]}'
    os.makedirs(a.out, exist_ok=True)
    dl = os.path.join(HERE, '_mes_dl')
    shutil.rmtree(dl, ignore_errors=True)
    os.makedirs(dl)
    uid, pw, mes_url = creds()

    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except ImportError:
        pass
    try:
        import selenium  # noqa: F401
    except ImportError:
        sys.exit('selenium 이 설치되지 않았습니다 — install.bat 을 다시 실행하세요')
    os.environ['WDM_SSL_VERIFY'] = '0'
    from selenium import webdriver
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.edge.options import Options
    from selenium.webdriver.edge.service import Service
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    opts = Options()
    opts.add_experimental_option('prefs', {'download.default_directory': dl, 'download.prompt_for_download': False, 'download.directory_upgrade': True})
    opts.add_experimental_option('excludeSwitches', ['enable-logging'])
    opts.add_argument('--log-level=3')
    def edge_ver():                              # 설치된 Edge 버전(레지스트리)
        try:
            import winreg
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r'Software\Microsoft\Edge\BLBeacon') as k:
                        return winreg.QueryValueEx(k, 'version')[0]
                except OSError:
                    pass
        except ImportError:
            pass
        return None
    ev = edge_ver()
    # 2026-11-03: 밤사이 Edge 자동 업데이트 → 드라이버 버전 불일치, 사내망이 드라이버 다운로드를 막아(차단 HTML 을 받음) 실행 실패.
    # 순서: ① 설치 폴더의 msedgedriver.exe(사용자가 Edge 와 같은 버전으로 넣어 둔 것) ② 자동 설치(받은 파일이 진짜 exe 일 때만) ③ PC 기본
    def drv_ver(p):
        try:
            out = subprocess.run([p, '--version'], capture_output=True, text=True, timeout=20, creationflags=0x08000000).stdout
            return re.search(r'(\d+\.\d+\.\d+\.\d+)', out).group(1)
        except Exception:
            return None
    mine = os.path.join(HERE, 'msedgedriver.exe')
    if ev and (not os.path.isfile(mine) or (drv_ver(mine) or '').split('.')[0] != ev.split('.')[0]):
        # 11/3: Edge 와 주 버전이 다르면 Windows 로그인 자격(사내 프록시 인증)으로 같은 버전 드라이버를 받아 설치 폴더에 풂 — Python 직접 다운로드는 사내망이 막음
        zp = os.path.join(HERE, 'edgedriver_win64.zip')
        ps = (f"$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; "
              f"$p=[System.Net.WebRequest]::GetSystemWebProxy(); $p.Credentials=[System.Net.CredentialCache]::DefaultCredentials; "
              f"foreach($u in @('https://msedgedriver.microsoft.com/{ev}/edgedriver_win64.zip','https://msedgedriver.azureedge.net/{ev}/edgedriver_win64.zip')){{ "
              f"try {{ $w=New-Object System.Net.WebClient; $w.Proxy=$p; $w.DownloadFile($u,'{zp}'); break }} catch {{ Write-Host $_ }} }}")
        try:
            subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], timeout=180, creationflags=0x08000000)
            if os.path.isfile(zp) and open(zp, 'rb').read(2) == b'PK':
                import zipfile
                with zipfile.ZipFile(zp) as z:
                    z.extract('msedgedriver.exe', HERE)
                print('Edge 드라이버 자동 갱신:', ev, '→', drv_ver(mine))
            else:
                print('Edge 드라이버 자동 갱신 실패(받은 파일이 zip 아님 — 사내망 차단)')
        except Exception as e:
            print('Edge 드라이버 자동 갱신 실패:', str(e)[:150])
        finally:
            try:
                os.remove(zp)
            except OSError:
                pass
    cands = [os.path.join(HERE, 'msedgedriver.exe')] + sorted(glob.glob(os.path.join(HERE, 'edgedriver*', 'msedgedriver.exe')), reverse=True)
    local = next((p for p in cands if os.path.isfile(p)), None)
    if local:
        print('Edge 드라이버: 설치 폴더', local, '· Edge', ev)
        service = Service(local)
    else:
        try:
            from webdriver_manager.microsoft import EdgeChromiumDriverManager
            pth = EdgeChromiumDriverManager().install()
            if not (os.path.isfile(pth) and pth.lower().endswith('.exe')):
                raise RuntimeError('받은 드라이버가 exe 가 아님(사내망 차단 페이지)')
            service = Service(pth)
        except Exception as e:                       # 드라이버 자동 설치가 막히면 PC에 설치된 msedgedriver 사용
            print('Edge 드라이버 자동 설치 실패 — 기본 드라이버로 시도:', str(e)[:150])
            service = Service()
    service.creation_flags = 0x08000000
    def try_edge():
        return webdriver.Edge(service=service, options=opts)

    def try_chrome():                                # Edge 드라이버를 못 구하면 Chrome(드라이버는 Selenium Manager 가 구글 저장소에서 받음)
        from selenium.webdriver.chrome.options import Options as COpt
        from selenium.webdriver.chrome.service import Service as CSvc
        co = COpt()
        co.add_experimental_option('prefs', {'download.default_directory': dl, 'download.prompt_for_download': False, 'download.directory_upgrade': True})
        co.add_experimental_option('excludeSwitches', ['enable-logging'])
        co.add_argument('--log-level=3')
        cs = CSvc(); cs.creation_flags = 0x08000000
        return webdriver.Chrome(service=cs, options=co)
    driver, errs, make_driver = None, [], None
    for name, fn in (('Edge', try_edge), ('Chrome', try_chrome)):
        try:
            driver = fn()
            make_driver = fn
            print('브라우저:', name)
            break
        except Exception as e:
            errs.append(f'{name}: {str(e).splitlines()[0][:150]}')
            print('  ⚠', errs[-1])
    if driver is None and not os.environ.get('CGL_REEXEC'):
        # 11/3: 낡은 selenium·webdriver-manager 가 새 Edge 버전·바뀐 드라이버 주소를 몰라 실패 → 최신으로 올리고 이 실행을 한 번 다시 시작
        print('selenium·webdriver-manager 최신으로 갱신 후 다시 시작…')
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'selenium', 'webdriver-manager'], timeout=600)
            shutil.rmtree(os.path.join(os.path.expanduser('~'), '.wdm'), ignore_errors=True)   # 차단 페이지로 만들어진 잘못된 드라이버 캐시
        except Exception as e_:
            print('  pip 갱신 실패:', str(e_)[:150])
        os.environ['CGL_REEXEC'] = '1'
        sys.stdout.flush()
        sys.exit(subprocess.run([sys.executable] + sys.argv).returncode)   # 새 selenium 으로 다시(Windows 는 execv 가 배치 파일 대기를 끊어 subprocess 로)
    if driver is None:
        e = RuntimeError(' / '.join(errs))
        msg = (f"\n[Edge 드라이버 버전 안 맞음] 설치된 Edge = {ev or '모름(edge://settings/help 에서 확인)'}\n"
               f"  1) 브라우저로 https://developer.microsoft.com/ko-kr/microsoft-edge/tools/webdriver/ 에서 같은 버전(x64) 받기\n"
               f"  2) 압축 안의 msedgedriver.exe 를 이 폴더에 넣기: {HERE}\n  3) run_auto.bat 다시 실행\n")
        print(msg)
        try:
            open(os.path.join(a.out, 'run_log.txt'), 'a', encoding='utf-8').write(msg)
        except Exception:
            pass
        raise e
    driver.maximize_window()
    ok_files, extra_files = [], []
    xdir = os.path.join(a.out, 'extra')                     # 분석용 추가 자료(도금 계획은 읽지 않음)
    os.makedirs(xdir, exist_ok=True)

    def wait_download(before, name, timeout=60):
        while timeout > 0:
            new = set(os.listdir(dl)) - before
            f = next((x for x in new if not x.endswith(('.crdownload', '.tmp'))), None)
            if f:
                time.sleep(1)
                dst = os.path.join(a.out, name)
                if os.path.exists(dst):
                    os.remove(dst)
                shutil.move(os.path.join(dl, f), dst)
                print(f'  ✅ {name}')
                ok_files.append(name)
                return True
            time.sleep(1)
            timeout -= 1
        print(f'  ❌ {name} 다운로드 시간 초과')
        return False

    def export(cell_xpath, name):
        before = set(os.listdir(dl))
        for attempt in range(3):
            try:
                cell = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, cell_xpath)))
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", cell)
                ActionChains(driver).move_to_element(cell).click().perform()
                time.sleep(0.5)
                ActionChains(driver).context_click(cell).perform()
                time.sleep(2)
                for btn in driver.find_elements(By.XPATH, "//*[contains(text(), '엑셀 Export') or contains(text(), 'Excel') or contains(text(), '엑셀')]"):
                    if btn.is_displayed():
                        driver.execute_script('arguments[0].click();', btn)
                        ok = wait_download(before, name)
                        ActionChains(driver).send_keys(Keys.ESCAPE).perform()
                        return ok
                ActionChains(driver).send_keys(Keys.ESCAPE).perform()
                time.sleep(2)
            except Exception as e:
                print(f'  ⚠ Export 시도 {attempt + 1} 실패: {e}')
        print(f'  ❌ {name}: 엑셀 Export 버튼을 찾지 못함')
        return False

    FIND_JS = r'''
      var jq = window.$ || window.jQuery; if (!jq) return null;
      var g = arguments[0] ? jq('#' + arguments[0]) : null;
      if (!g || !g.length) { g = null; jq('.jqx-grid').each(function () { if (!g && jq(this).is(':visible')) g = jq(this); }); }
      if (!g || !g.length || typeof g.jqxGrid !== 'function') return null;'''
    COUNT_JS = FIND_JS + r'''
      var rows = g.jqxGrid('getrows') || []; return rows.length;'''
    CLEAR_JS = FIND_JS + r'''
      try { g.jqxGrid('clear'); } catch (e) {} return true;'''
    GRID_JS = FIND_JS + r'''
      var cols = g.jqxGrid('columns'); cols = cols.records || cols;
      var keep = [], head = [];
      for (var i = 0; i < cols.length; i++) { var c = cols[i]; if (!c.datafield || c.hidden) continue; keep.push(c.datafield); head.push(c.text || c.datafield); }
      var rows = g.jqxGrid('getrows') || [], out = [];
      for (var r = 0; r < rows.length; r++) { var a = []; for (var k = 0; k < keep.length; k++) { var v = rows[r][keep[k]]; a.push(v === undefined ? null : (v instanceof Date ? v.toISOString() : v)); } out.push(a); }
      return JSON.stringify({columns: head, rows: out});'''

    # 2026-10-28: 쿼리 화면 오류 창('쿼리를 실행 할 수 없습니다')은 브라우저 알림이 아니라 화면 안 창이라 못 닫고 시간초과까지 기다렸음 →
    # 결과가 0건일 때만 찾아서 '자세히' 내용(ORA 오류)을 읽고 Ok 를 눌러 바로 다음 조회로. 내용은 원격 조회 기록(snap_remote_status)에 남김
    MODAL_JS = r'''
      var vis = function (e) { return !!(e && (e.offsetParent || e.getClientRects().length)); };
      var els = document.querySelectorAll('div, span, p, td, label'), hit = null;
      for (var i = 0; i < els.length && !hit; i++) { var e = els[i]; if (e.children.length) continue; var t = (e.textContent || '').trim();
        if (t && t.length < 300 && /실행\s*할\s*수\s*없|ORA-\d{3,5}/.test(t) && vis(e)) hit = e; }
      if (!hit) return null;
      var box = hit, ok = null, det = null;
      for (var k = 0; k < 8 && box.parentElement; k++) { box = box.parentElement;
        var bs = box.querySelectorAll('button, a, span, div, input');
        for (var j = 0; j < bs.length; j++) { var b = bs[j], bt = (b.textContent || b.value || '').trim();
          if (!ok && /^(ok|확인)$/i.test(bt) && vis(b)) ok = b; if (!det && bt === '자세히' && vis(b)) det = b; }
        if (ok) break; }
      if (arguments[0] && det) { det.click(); return 'DETAIL'; }
      var txt = (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (ok) ok.click();
      return txt || hit.textContent;'''
    qerr = {}

    def close_modal():
        """쿼리 오류 창이 떠 있으면 내용을 읽고 닫음. 없으면 None"""
        try:
            r = driver.execute_script(MODAL_JS, True)
            if r == 'DETAIL':
                time.sleep(1.5)
                r = driver.execute_script(MODAL_JS, False)
            return r
        except Exception:
            return None

    def close_alert():
        """브라우저 알림창(예: '조회된 데이터가 없습니다')이 떠 있으면 닫고 그 글자를 돌려줌"""
        try:
            al = driver.switch_to.alert
            txt = al.text
            al.accept()
            return txt or '(알림)'
        except Exception:
            return None

    def wait_rows(grid_id, timeout=120):
        """조회 버튼을 누른 뒤 표 건수가 0보다 크고 두 번 연속 같아질 때까지 기다림. 끝내 0이면 0"""
        last, t = -1, 0
        while t < timeout:
            time.sleep(3)
            t += 3
            if close_alert() is not None:                   # '데이터 없음' 알림 → 0건
                return 0
            try:
                n = driver.execute_script(COUNT_JS, grid_id)
            except Exception:
                n = None
            if n and n == last:
                return n
            if not n:
                m = close_modal()
                if m:
                    qerr['msg'] = m
                    print(f'    ⚠ 쿼리 오류 창: {m[:200]}')
                    return 0
            last = n
        return last or 0

    def read(grid_id):
        txt = driver.execute_script(GRID_JS, grid_id)
        return json.loads(txt) if txt else None

    def chunks(step=10, rng=None):
        """조회 기간을 step일 단위로 나눔(쿼리 화면 10,000행 제한 회피)"""
        r0, r1 = rng or (d0, d1)
        f, t = datetime.datetime.strptime(r0, '%Y%m%d').date(), datetime.datetime.strptime(r1, '%Y%m%d').date()
        while f <= t:
            e = min(f + datetime.timedelta(days=step - 1), t)
            yield f.strftime('%Y%m%d'), e.strftime('%Y%m%d')
            f = e + datetime.timedelta(days=1)

    def save(o, name, out=None):
        out = out or a.out
        try:
            if not o or not o['rows']:
                print(f'  ⚠ {name}: 표가 비어 있음')
                return False
            for ext in ('.json', '.xlsx'):                 # 같은 이름의 이전 파일(형식이 다른 것 포함) 정리
                old = os.path.join(out, name + ext)
                if os.path.exists(old):
                    os.remove(old)
            json.dump(o, open(os.path.join(out, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
            print(f"  ✅ {name}.json ({len(o['rows'])}행, 화면에서 직접 읽음)")
            (ok_files if out == a.out else extra_files).append(name)
            return True
        except Exception as e:
            print(f'  ⚠ {name}: 저장 실패 ({e})')
            return False

    def run_chunks(name, grid_id, run_one, step, out=None, rng=None):
        """기간을 나눠 조회한 결과를 하나로 합쳐 저장. 표 직접 읽기가 안 되면 None"""
        merged = None
        for c0, c1 in chunks(step, rng):
            try:
                driver.execute_script(CLEAR_JS, grid_id)
            except Exception:
                pass
            run_one(c0, c1)
            n = wait_rows(grid_id)
            o = read(grid_id) if n else None
            if n and o is None:
                print('  ⚠ 화면 표 직접 읽기 실패 — 엑셀 Export 로 시도')
                return None
            k = len(o['rows']) if o else 0
            print(f'    {c0}~{c1}: {k}행' + ('  ⚠ 10,000행 — 잘렸을 수 있음(기간을 더 나눠야 함)' if k >= 10000 else ''))
            if o:
                if merged is None:
                    merged = o
                elif o['columns'] == merged['columns']:
                    merged['rows'] += o['rows']
                else:
                    print('  ⚠ 기간별 열 구성이 달라 이 구간은 제외')
        if merged:                                       # 구간 경계에 걸친 생산번호의 휴지 등 완전히 같은 행은 하나만
            seen, uniq = set(), []
            for r in merged['rows']:
                k = json.dumps(r, ensure_ascii=False)
                if k not in seen:
                    seen.add(k)
                    uniq.append(r)
            if len(uniq) < len(merged['rows']):
                print(f"    중복 {len(merged['rows']) - len(uniq)}행 제외")
            merged['rows'] = uniq
        save(merged, name, out)
        return True

    def remote_queries(run_sql):
        """사이트의 published/queries.enc.json 에 적힌 조회문(SELECT/WITH 만)을 MES 쿼리 화면에서 실행해 mes/extra/<이름>.json 으로 저장.
        mode: once(조회문이 바뀌었을 때만) · daily(매번) · range(기간 나눠서, 조회문 안 {d0}·{d1} 을 YYYYMMDD 로 바꿈, step 일씩)
        이름이 snap_ 로 시작하면 최신으로 교체, 아니면 자동 실행기가 누적. 결과 행은 10,000행까지(쿼리 화면 제한)"""
        raw, err = None, None
        for url in QUERIES_URLS:
            try:
                raw = urllib.request.urlopen(url + f'?v={int(time.time())}', timeout=30).read()
            except Exception:
                try:
                    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE   # 회사 인증서 가로채기 대비(공개 읽기 전용 파일)
                    raw = urllib.request.urlopen(url + f'?v={int(time.time())}', timeout=30, context=ctx).read()
                except Exception as e:
                    err = e
            if raw:
                break
        if raw is None:
            raise err
        env = json.loads(raw.decode('utf-8'))
        p = os.path.join(HERE, 'auto_config.json')
        cfg = json.loads(open(p, encoding='utf-8-sig').read(), strict=False) if os.path.exists(p) else {}
        sys.path.insert(0, HERE)
        from cglplan import publish as PB
        Q = None
        for pw in dict.fromkeys(x for x in (cfg.get('analysis_password'), cfg.get('password')) if x):   # 암호를 아는 사람만 조회문을 만들 수 있음(AES-GCM 위변조 검사)
            try:
                Q = PB.decrypt(env, pw)
                break
            except Exception:
                pass
        if Q is None:
            print('  ⚠ 원격 조회 목록: 암호가 맞지 않아 건너뜀(auto_config.json 의 analysis_password)')
            return
        dp = os.path.join(HERE, 'out', 'remote_done.json')                 # mes/ 에 두면 자동 실행기가 MES 자료로 읽으려 함
        legacy = os.path.join(a.out, 'remote_done.json')                    # 예전 위치(mes/)에서 옮김
        if os.path.exists(legacy) and not os.path.exists(dp):
            os.makedirs(os.path.dirname(dp), exist_ok=True)
            shutil.move(legacy, dp)
        elif os.path.exists(legacy):
            os.remove(legacy)
        done = json.load(open(dp, encoding='utf-8')) if os.path.exists(dp) else {}
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        # 2026-10-20: 1년치 once 조회 80여 개가 한 번에 몰려 3시간 넘게 돌고, 끝나기 전엔 아무것도 게시되지 않았음 →
        # 매일·기간 조회를 먼저, once 는 한 번 실행에 최대 ONCE_MAX 개(남은 것은 다음 2시간 실행), 끝난 조회는 바로 기록
        once_max = int(cfg.get('remote_once_max', 20))
        qs = sorted(Q.get('queries', []), key=lambda q: q.get('mode', 'once') == 'once')
        n_once, left = 0, 0
        sp = os.path.join(xdir, 'snap_remote_status.json')                  # 조회마다 결과(행 수·초·실패 이유)를 남겨 클라우드에서 볼 수 있게(2026-10-20 v49)
        try:
            stat = {r[0]: r for r in json.load(open(sp, encoding='utf-8'))['rows']}
        except Exception:
            stat = {}

        def note(name, mode, rows, t0, result):
            stat[name] = [name, mode, rows, round(time.time() - t0), result, datetime.datetime.now().strftime('%Y-%m-%d %H:%M')]
            try:
                os.makedirs(xdir, exist_ok=True)
                json.dump({'columns': ['name', 'mode', 'rows', 'sec', 'result', 'at'], 'rows': list(stat.values())}, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
            except Exception:
                pass
        for q in qs:
            name, sql, mode = re.sub(r'[^0-9a-z_]', '', str(q.get('name', '')).lower()), str(q.get('sql', '')).strip(), q.get('mode', 'once')
            h = hashlib.sha1(sql.encode('utf-8')).hexdigest()[:12]
            if not name or not sql:
                continue
            body = sql.lstrip('( \n').lower()
            if not (body.startswith('select') or body.startswith('with')) or ';' in sql or BAD_SQL.search(re.sub(r"'[^']*'", "''", sql)):
                print(f'  ⚠ 원격 조회 {name}: SELECT 가 아니거나 금지어 포함 — 건너뜀')
                continue
            if mode == 'once' and done.get(name) == h:
                continue
            if mode == 'once' and name not in done and os.path.exists(os.path.join(xdir, name + '.json')):
                done[name] = h                                     # 끊긴 실행이 이미 받아 저장한 것(기록만 못 함) — 다시 돌지 않음(2026-10-20)
                continue
            fl = done.setdefault('_fail', {}).get(name)              # 2026-10-21: 같은 조회문이 연속 2번 시간초과·0행이면 건너뜀(매 실행 10분씩 멈추던 문제) — 조회문을 고치면 다시 돎
            if fl and fl[0] == h and fl[1] >= 2:
                print(f'  · {name}: 같은 조회문이 {fl[1]}번 연속 실패해 건너뜀(조회문을 고치면 다시 실행)')
                note(name, mode, 0, time.time(), f'건너뜀(연속 {fl[1]}번 실패)')
                continue
            if mode == 'once':
                if n_once >= once_max:
                    left += 1
                    continue
                n_once += 1
            print(f'▶ {name} (원격 조회 · {mode})')
            t0, nrows = time.time(), None
            try:
                if mode == 'range':
                    ok = run_chunks(name, 'gridQueryRslt', lambda c0, c1: run_sql(sql.replace('{d0}', c0).replace('{d1}', c1)), int(q.get('step', 7)), xdir)
                else:
                    try:
                        driver.execute_script(CLEAR_JS, 'gridQueryRslt')
                    except Exception:
                        pass
                    qerr.pop('msg', None)
                    run_sql(sql)
                    n = wait_rows('gridQueryRslt', int(q.get('timeout', 180)))
                    o = read('gridQueryRslt') if n else None
                    if o and len(o['rows']) >= 10000:
                        print('  ⚠ 10,000행 — 잘렸을 수 있음(조회문을 나눠야 함)')
                    nrows = len(o['rows']) if o else 0
                    ok = save(o, name, xdir) if o else False
                    if not o:
                        print(f"  ⚠ {name}: 결과 0행(조회 결과가 없거나 {int(q.get('timeout', 180))}초 안에 안 끝남)")
                note(name, mode, nrows, t0, (f'1만 행(잘렸을 수 있음 — 조회 나눠야 함)' if (nrows or 0) >= 10000 else 'ok') if ok else (f"실패: 쿼리 오류 — {qerr['msg'][:250]}" if qerr.get('msg') else f"0행 또는 시간초과({int(q.get('timeout', 180))}초)"))   # 2026-10-21: 1만 행 = MES 쿼리 화면 한도
                if ok:
                    done[name] = h
                    done['_fail'].pop(name, None)
                else:
                    f0 = done['_fail'].get(name)
                    done['_fail'][name] = [h, (f0[1] + 1) if f0 and f0[0] == h else 1]
                json.dump(done, open(dp, 'w', encoding='utf-8'))          # 바로 기록(중간에 끊겨도 다음 실행이 다시 돌지 않게)
            except Exception as e:
                msg = str(e).splitlines()[0][:150] if str(e) else type(e).__name__
                note(name, mode, nrows, t0, '실패: ' + msg)
                print(f'  ⚠ {name}: 실패 — 건너뜀 ({msg})')
        json.dump(done, open(dp, 'w', encoding='utf-8'))
        if left:
            print(f'  한 번만 받는 조회 {left}개는 다음 실행에서(한 번에 {once_max}개까지 — auto_config.json remote_once_max)')

    def menu_panel(diag=None, again=True):
        """좌측 메뉴 패널을 연 상태로 만들고 검색창을 돌려줌. collapseButton 은 열기/닫기 토글이라
        검색창이 이미 보이면 누르지 않고, 안 보일 때만 눌러 열림을 확인(최대 2번)
        2026-10-21: 로그인 직후 화면이 늦게 뜨면 '검색창이 열리지 않음'으로 끝났음 → 메뉴 영역이 뜰 때까지 최대 30초 기다리고, 그래도 안 되면 첫 화면을 다시 열어 한 번 더"""
        driver.switch_to.default_content()
        for _ in range(30):
            if driver.find_elements(By.ID, 'SEARCH_VAL') or driver.find_elements(By.ID, 'collapseButton'):
                break
            time.sleep(1)
        for k in range(3):
            els = driver.find_elements(By.ID, 'SEARCH_VAL')
            if els and els[0].is_displayed():
                if diag is not None:
                    diag.append(['menu_panel', f'검색창 보임(토글 {k}번)'])
                return els[0]
            if k == 2:
                break
            try:
                driver.execute_script('arguments[0].click();', driver.find_element(By.ID, 'collapseButton'))
            except Exception as e:
                if diag is not None:
                    diag.append(['collapse', type(e).__name__])
            for _ in range(5):
                time.sleep(1)
                els = driver.find_elements(By.ID, 'SEARCH_VAL')
                if els and els[0].is_displayed():
                    break
        if again:
            print('  메뉴 검색창이 안 열려 첫 화면을 다시 엶')
            driver.get(mes_url)
            time.sleep(8)
            return menu_panel(diag, again=False)
        raise RuntimeError('좌측 메뉴 검색창이 열리지 않음')

    def menu(name, exact=False):
        driver.switch_to.default_content()
        box = menu_panel()
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, name, Keys.ENTER)
        time.sleep(2)
        # 이름이 정확히 같은 메뉴 우선(예: '제품재고 현황' vs '통합 제품재고 현황'), 없으면 포함하는 메뉴
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.XPATH, f"//*[contains(normalize-space(text()), '{name}')]")))
        cand = (exact and [e for e in driver.find_elements(By.XPATH, f"//*[normalize-space(text())='{name}']") if e.is_displayed()]) or \
               [e for e in driver.find_elements(By.XPATH, f"//*[contains(normalize-space(text()), '{name}')]") if e.is_displayed()]
        if not cand:
            raise RuntimeError(f'메뉴 {name} 를 찾지 못함')
        if not exact:
            driver.execute_script('arguments[0].click();', cand[0])
            time.sleep(6)
            return
        # 정확 일치 모드: 후보를 차례로 눌러 화면(iframe)이 새로 열리는 것을 찾음
        cand.sort(key=lambda e: (0 if (e.text or '').strip() == name else 1, len((e.text or '').strip()) or 999))
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        for e in cand[:6]:
            for how in ('js', 'mouse'):                     # JS 클릭으로 안 열리면 실제 마우스 클릭
                try:
                    if how == 'js':
                        driver.execute_script('arguments[0].click();', e)
                    else:
                        ActionChains(driver).move_to_element(e).click().perform()
                except Exception:
                    continue
                for _ in range(5):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        time.sleep(4)
                        return
        raise RuntimeError(f"메뉴 '{name}' 를 눌러도 화면이 열리지 않음(후보 {len(cand)}개: {[ (x.tag_name, (x.text or '')[:20]) for x in cand[:4]]})")

    OPEN_JS = r"""
      var name = arguments[0], oid = arguments[1], jq = window.$ || window.jQuery, out = {cand: [], log: []};
      try {
      var norm = function (v) { return String(v || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ''); };   // 띄어쓰기 무시 비교
      name = norm(name);
      var tree = jq ? jq('#tree-left') : null, inst = null;
      try { inst = tree && tree.jstree ? tree.jstree(true) : null; } catch (e) { out.log.push('jstree 없음 ' + e); }
      if (inst && inst.get_json) {
        var flat = inst.get_json('#', {flat: true}) || [];
        out.log.push('트리 노드 ' + flat.length + '개');
        flat.forEach(function (n) {
          var a = n.a_attr || {}, t = norm(n.text);
          if ((oid && String(a.obj_id || '').indexOf(oid) !== -1) || norm(a.mnu_nm) === name || norm(a.disp_mnu_nm) === name || t === name)
            out.cand.push({id: n.id, text: t, obj_id: a.obj_id || '', mnu_id: a.mnu_id || '', src: 'jstree'});
        });
      }
      document.querySelectorAll('#tree-left a.jstree-anchor').forEach(function (a) {
        var t = norm(a.textContent), o = a.getAttribute('obj_id') || '';
        if ((oid && o.indexOf(oid) !== -1) || norm(a.getAttribute('mnu_nm')) === name || norm(a.getAttribute('disp_mnu_nm')) === name || t === name) {
          var li = a.closest('li');
          if (!out.cand.some(function (c) { return c.id === (li && li.id); })) out.cand.push({id: li ? li.id : '', text: t, obj_id: o, mnu_id: a.getAttribute('mnu_id') || '', src: 'dom'});
        }
      });
      } catch (err) { out.log.push('JS 오류: ' + err); }
      return JSON.stringify(out);"""

    DOC_JS = r"""
      var norm = function (v) { return String(v || '').replace(/\s+/g, ''); }, name = norm(arguments[0]), out = [];
      var excl = (arguments[1] || []).map(norm), hit = function (t) { return t.indexOf(name) !== -1 && !excl.some(function (x) { return x && t.indexOf(x) !== -1; }); };
      document.querySelectorAll('[data-cgl-cand]').forEach(function (e) { e.removeAttribute('data-cgl-cand'); });
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var e = all[i], tg = e.tagName;
        if (e.id === 'SEARCH_VAL' || tg === 'SCRIPT' || tg === 'STYLE' || tg === 'OPTION' || tg === 'TITLE') continue;
        if (!hit(norm(e.textContent))) continue;
        var leaf = true;
        for (var j = 0; j < e.children.length; j++) if (hit(norm(e.children[j].textContent))) { leaf = false; break; }
        if (!leaf) continue;
        var vis = !!(e.offsetParent || e.getClientRects().length);
        e.setAttribute('data-cgl-cand', String(out.length));
        out.push({k: out.length, tag: tg, id: e.id, cls: String(e.className).slice(0, 60), vis: vis,
                  parent: (e.parentElement ? e.parentElement.outerHTML : '').slice(0, 500)});
      }
      return JSON.stringify(out);"""

    EXACT_JS = r"""
      var want = arguments[0], out = [];
      var clean = function (v) { return String(v || '').replace(/\s+/g, ' ').trim().replace(/^[^가-힣A-Za-z0-9\[]+/, '').trim(); };
      document.querySelectorAll('[data-cgl-step]').forEach(function (e) { e.removeAttribute('data-cgl-step'); });
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var e = all[i], tg = e.tagName;
        if (e.id === 'SEARCH_VAL' || tg === 'SCRIPT' || tg === 'STYLE' || tg === 'OPTION' || tg === 'TITLE' || tg === 'INPUT') continue;
        if (clean(e.textContent) !== want) continue;                      // 띄어쓰기까지 정확히 같은 글자만
        var leaf = true;
        for (var j = 0; j < e.children.length; j++) if (clean(e.children[j].textContent) === want) { leaf = false; break; }
        if (!leaf) continue;
        var vis = !!(e.offsetParent || e.getClientRects().length);
        e.setAttribute('data-cgl-step', String(out.length));
        out.push({k: out.length, tag: tg, id: e.id, cls: String(e.className).slice(0, 60), vis: vis, parent: (e.parentElement ? e.parentElement.outerHTML : '').slice(0, 400)});
      }
      return JSON.stringify(out);"""

    def open_by_search_popup(search, code, diag):
        """메뉴 검색 → 팝업 결과 목록에서 '[화면ID] 이름' 항목 중 첫 번째를 클릭(예: [SSHPC4025] 제품재고 현황)"""
        box = menu_panel(diag)
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, search, Keys.ENTER)
        docs = []
        for _ in range(6):                                  # 팝업이 뜰 때까지
            time.sleep(1)
            docs = json.loads(driver.execute_script(DOC_JS, code, []))
            if any(d['vis'] for d in docs):
                break
        diag.append([f'popup {code}', json.dumps(docs, ensure_ascii=False)[:2000]])
        vis = sorted([d for d in docs if d['vis']], key=lambda d: d['k'])
        if not vis:
            raise RuntimeError(f"검색 팝업에서 [{code}] 항목을 못 찾음({len(docs)}개, 보이는 것 0)")
        el = driver.find_element(By.CSS_SELECTOR, f'[data-cgl-cand="{vis[0]["k"]}"]')
        if not click_until_frame(el, diag, f'popup {code} 첫 번째', n0):
            raise RuntimeError(f"[{code}] 를 눌러도 화면이 안 열림")

    def open_by_path(path, diag, search=None):
        """좌측 메뉴를 사람이 누르듯 단계별로(예: 출하관리 → 제품재고 → 제품재고 현황). 글자는 띄어쓰기까지 정확히 일치.
        마지막 단계에서 화면(iframe)이 열리면 성공"""
        box = menu_panel(diag)
        if search:
            box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, search, Keys.ENTER)
            time.sleep(3)
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        for depth, step in enumerate(path):
            last = depth == len(path) - 1
            got = []
            for _ in range(5):
                got = json.loads(driver.execute_script(EXACT_JS, step))
                if any(g['vis'] for g in got):
                    break
                time.sleep(1)
            diag.append([f'path {step}', json.dumps(got, ensure_ascii=False)[:1500]])
            vis = sorted([g for g in got if g['vis']], key=lambda g: g['k'])
            if not vis:
                raise RuntimeError(f"메뉴 단계 '{step}' 가 화면에 안 보임(같은 글자 {len(got)}개)")
            el = driver.find_element(By.CSS_SELECTOR, f'[data-cgl-step="{vis[0]["k"]}"]')
            if last:
                if click_until_frame(el, diag, f'path {step}', n0):
                    return
                raise RuntimeError(f"'{step}' 를 눌러도 화면이 안 열림")
            # 중간 단계: 펼치기(이미 펼쳐져 있으면 다음 단계 글자가 이미 보임 → 누르지 않음)
            nxt = json.loads(driver.execute_script(EXACT_JS, path[depth + 1]))
            if any(g['vis'] for g in nxt):
                diag.append([f'path {step}', '다음 단계가 이미 보여 누르지 않음'])
                continue
            try:
                driver.execute_script('arguments[0].click();', el)
            except Exception:
                ActionChains(driver).move_to_element(el).click().perform()
            time.sleep(2)

    def click_until_frame(el, diag, label, n0):
        """요소를 JS 클릭 → 안 열리면 마우스 클릭 → 더블클릭. 화면(iframe)이 늘면 True"""
        for how in ('js', 'mouse', 'dbl'):
            try:
                if how == 'js':
                    driver.execute_script('arguments[0].click();', el)
                elif how == 'mouse':
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
                    ActionChains(driver).move_to_element(el).click().perform()
                else:
                    ActionChains(driver).move_to_element(el).double_click().perform()
            except Exception as e:
                diag.append([f'{label} {how}', 'error ' + (str(e).splitlines()[0][:120] if str(e) else type(e).__name__)])
                continue
            for _ in range(6):
                time.sleep(1)
                if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                    diag.append([f'{label} {how}', '성공'])
                    time.sleep(4)
                    return True
            diag.append([f'{label} {how}', '화면 안 열림'])
        return False

    def open_menu(name, oid, diag):
        """좌측 메뉴(jsTree)에서 이름(mnu_nm) 또는 화면ID(obj_id)가 맞는 메뉴를 찾아 화면이 열릴 때까지 여러 방법으로 열기"""
        driver.switch_to.default_content()
        diag.append(['start', f"url={driver.current_url[:80]} iframes={len(driver.find_elements(By.TAG_NAME, 'iframe'))}"])
        box = menu_panel(diag)
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        found = None
        # 사용자가 하는 방식 그대로: 검색창에 '제품재고현황' 입력 후 Enter → 안 되면 찾기 버튼·띄어쓰기·화면ID 순
        nospace = name.replace(' ', '')
        for query, how in (('4025', 'enter'), ('4025', 'find'), (nospace, 'enter'), (nospace, 'find'), (name, 'enter'), (name, 'find'), (oid, 'find')):
            try:
                box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, query)
            except Exception as e:                          # 입력이 막히면 JS로 값 넣기
                diag.append(['type', type(e).__name__])
                driver.execute_script("var b=document.getElementById('SEARCH_VAL'); b.value=arguments[0]; b.dispatchEvent(new Event('input')); b.dispatchEvent(new Event('change'));", query)
            if how == 'find':
                try:
                    driver.execute_script('arguments[0].click();', driver.find_element(By.ID, 'FIND_BTN'))
                except Exception as e:
                    diag.append(['find_btn', str(e)[:150]])
            else:
                box.send_keys(Keys.ENTER)
            time.sleep(3)
            try:
                info = json.loads(driver.execute_script(OPEN_JS, name, oid))
            except Exception as e:
                diag.append([f'search {query}/{how}', 'execute 오류 ' + (str(e).splitlines()[0][:200] if str(e) else type(e).__name__)])
                continue
            diag.append([f'search {query}/{how}', json.dumps(info, ensure_ascii=False)[:1500]])
            if info['cand']:
                found = info['cand']
                break
            # 트리 밖(검색 결과 목록 등)에 이름이 정확히 같은 요소 — 다른 메뉴들이 열리던 방식
            try:
                docs = json.loads(driver.execute_script(DOC_JS, name, ['통합']))
            except Exception as e:
                docs = []
                diag.append([f'doc {query}/{how}', 'error ' + str(e)[:150]])
            diag.append([f'doc {query}/{how}', json.dumps(docs, ensure_ascii=False)[:2500]])
            for d in sorted(docs, key=lambda d: (not d['vis'], d['k']))[:4]:
                try:
                    el = driver.find_element(By.CSS_SELECTOR, f'[data-cgl-cand="{d["k"]}"]')
                except Exception:
                    continue
                if click_until_frame(el, diag, f"doc {d['tag']}#{d['k']}", n0):
                    print(f"    메뉴 열림: 검색 결과 {d['tag']} '{name}'")
                    return
        if not found:
            raise RuntimeError(f"메뉴 '{name}'({oid}) 를 트리에서 찾지 못함")
        # 화면ID가 맞는 것 우선
        found.sort(key=lambda c: 0 if oid and oid in (c.get('obj_id') or '') else 1)
        print(f"    메뉴 후보: {[(c['text'], c['obj_id']) for c in found[:3]]}")
        for c in found[:3]:
            nid = c['id']
            steps = [
                ('jstree select', "var i=jQuery('#tree-left').jstree(true); if(i._open_to) i._open_to(arguments[0]); i.deselect_all(); i.select_node(arguments[0]); return 1;"),
                ('jquery click', "var a=jQuery('#tree-left li[id=\"'+arguments[0]+'\"] > a.jstree-anchor'); a[0].scrollIntoView({block:'center'}); a.trigger('click'); return a.length;"),
                ('dblclick', "var a=jQuery('#tree-left li[id=\"'+arguments[0]+'\"] > a.jstree-anchor'); a.trigger('dblclick'); return a.length;"),
            ]
            for label, js in steps:
                try:
                    r = driver.execute_script(js, nid)
                except Exception as e:
                    diag.append([f'open {nid} {label}', 'error ' + str(e)[:150]])
                    continue
                for _ in range(6):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        diag.append([f'open {nid} {label}', f'성공 (반환 {r})'])
                        time.sleep(4)
                        return
                diag.append([f'open {nid} {label}', f'화면 안 열림 (반환 {r})'])
            try:                                            # 마지막: 실제 마우스 클릭
                a_el = driver.find_element(By.CSS_SELECTOR, f'#tree-left li[id="{nid}"] > a.jstree-anchor')
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", a_el)
                ActionChains(driver).move_to_element(a_el).click().perform()
                for _ in range(6):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        diag.append([f'open {nid} mouse', '성공'])
                        time.sleep(4)
                        return
                diag.append([f'open {nid} mouse', '화면 안 열림'])
            except Exception as e:
                diag.append([f'open {nid} mouse', 'error ' + str(e)[:150]])
        raise RuntimeError(f"메뉴 '{name}' 후보 {len(found)}개를 눌러도 화면이 안 열림")

    def save_diag(diag):
        json.dump({'columns': ['step', 'value'], 'rows': diag}, open(os.path.join(xdir, 'snap_probe.json'), 'w', encoding='utf-8'), ensure_ascii=False)

    def open_by_id(query, keyword):
        """메뉴 검색창에 query 입력 → 결과 중 문서 순서상 첫 번째(keyword 포함) 메뉴를 눌러 화면이 열리는지 확인"""
        driver.switch_to.default_content()
        box = menu_panel()
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, query, Keys.ENTER)
        time.sleep(3)
        cand = []
        for _ in range(5):                                  # 결과 목록이 늦게 뜨는 경우 대비
            # 글자가 여러 태그로 쪼개져 있어도 찾도록, 그 글자를 품은 가장 안쪽 요소
            xp = (f"//*[(contains(normalize-space(.), '{keyword}') or contains(normalize-space(.), '{query}')) and "
                  f"not(*[contains(normalize-space(.), '{keyword}') or contains(normalize-space(.), '{query}')])]")
            cand = [e for e in driver.find_elements(By.XPATH, xp)
                    if e.is_displayed() and e.get_attribute('id') != 'SEARCH_VAL' and e.tag_name.lower() not in ('script', 'style', 'title', 'option')]
            if cand:
                break
            time.sleep(1)
        if not cand:
            raise RuntimeError(f"'{query}' 검색 결과를 찾지 못함")
        print(f"    검색 결과: {[(x.tag_name, (x.text or '').strip()[:25]) for x in cand[:4]]}")
        n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
        for e in cand[:4]:
            for how in ('js', 'mouse'):
                try:
                    if how == 'js':
                        driver.execute_script('arguments[0].click();', e)
                    else:
                        ActionChains(driver).move_to_element(e).click().perform()
                except Exception:
                    continue
                for _ in range(5):
                    time.sleep(1)
                    if len(driver.find_elements(By.TAG_NAME, 'iframe')) > n0:
                        time.sleep(4)
                        return
        raise RuntimeError(f"'{query}' 검색 결과를 눌러도 화면이 열리지 않음")

    PROBE_JS = r"""
      var q = arguments[0], kw = arguments[1], out = [];
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var e = all[i], t = (e.textContent || '');
        if (t.indexOf(q) === -1 && t.indexOf(kw) === -1) continue;
        var leaf = true;
        for (var j = 0; j < e.children.length; j++) { var c = e.children[j].textContent || ''; if (c.indexOf(q) !== -1 || c.indexOf(kw) !== -1) { leaf = false; break; } }
        if (!leaf) continue;
        var r = e.getBoundingClientRect();
        out.push({tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 80), text: t.trim().slice(0, 60),
                  vis: !!(e.offsetParent || r.width), x: Math.round(r.left), y: Math.round(r.top),
                  onclick: (e.getAttribute('onclick') || (e.parentElement && e.parentElement.getAttribute('onclick')) || '').slice(0, 200),
                  html: (e.parentElement && e.parentElement.parentElement ? e.parentElement.parentElement.outerHTML : e.outerHTML).slice(0, 900)});
      }
      var sv = document.getElementById('SEARCH_VAL'), box = sv;
      for (var k = 0; k < 4 && box && box.parentElement; k++) box = box.parentElement;
      return JSON.stringify({items: out.slice(0, 40), searchArea: box ? box.outerHTML.slice(0, 6000) : null,
                             iframes: Array.prototype.map.call(document.querySelectorAll('iframe'), function (f) { return f.src || f.name || f.id; })});"""

    def probe(query, kw='제품재고'):
        """진단: 메뉴 검색 후 화면 구조·클릭 결과를 mes/extra/snap_probe.json 에 기록(자동 실행기가 암호화해 올림)"""
        rows = []
        driver.switch_to.default_content()
        try:
            driver.execute_script('arguments[0].click();', WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, '//*[@id="collapseButton"]'))))
            time.sleep(1)
        except Exception as e:
            rows.append(['collapse', str(e)[:200]])
        box = WebDriverWait(driver, 10).until(EC.visibility_of_element_located((By.XPATH, '//*[@id="SEARCH_VAL"]')))
        box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, query)
        time.sleep(3)
        rows.append(['before_enter', driver.execute_script(PROBE_JS, query, kw)])
        box.send_keys(Keys.ENTER)
        time.sleep(4)
        info = driver.execute_script(PROBE_JS, query, kw)
        rows.append(['after_enter', info])
        try:
            driver.save_screenshot(os.path.join(xdir, 'probe.png'))
        except Exception:
            pass
        items = json.loads(info)['items']
        print(f'  검색 후 "{query}"/"{kw}" 포함 요소 {len(items)}개:')
        for it in items[:10]:
            print(f"    {it['tag']} id={it['id']} vis={it['vis']} ({it['x']},{it['y']}) {it['text'][:40]}")
        # 보이는 후보를 하나씩 눌러 화면이 열리는지 기록
        els = [e for e in driver.find_elements(By.XPATH, f"//*[contains(normalize-space(.), '{kw}') and not(*[contains(normalize-space(.), '{kw}')])]") if e.is_displayed()]
        for idx, e in enumerate(els[:4]):
            try:
                n0 = len(driver.find_elements(By.TAG_NAME, 'iframe'))
                txt = (e.text or '').strip()[:40]
                ActionChains(driver).move_to_element(e).click().perform()
                time.sleep(6)
                fr = driver.find_elements(By.TAG_NAME, 'iframe')
                res = f"클릭 {idx + 1} [{txt}] → iframe {n0}→{len(fr)}"
                if len(fr) > n0:
                    driver.switch_to.frame(fr[-1])
                    res += ' | 화면 글자: ' + (driver.find_element(By.TAG_NAME, 'body').text or '')[:200].replace('\n', ' ')
                    driver.switch_to.default_content()
                print('   ', res)
                rows.append([f'click_{idx + 1}', res])
                if len(fr) > n0:
                    break
            except Exception as ex:
                rows.append([f'click_{idx + 1}', 'error ' + str(ex)[:200]])
                print(f'    클릭 {idx + 1} 오류: {str(ex)[:120]}')
                driver.switch_to.default_content()
        json.dump({'columns': ['step', 'value'], 'rows': rows}, open(os.path.join(xdir, 'snap_probe.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        print('  진단 기록 저장: mes/extra/snap_probe.json, probe.png')

    def frame_with(xpath, visible=False):
        driver.switch_to.default_content()                  # 화면(iframe) 안에 들어가 있으면 바깥에서 다시 찾기
        for fr in reversed(driver.find_elements(By.TAG_NAME, 'iframe')):
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(fr)
                cond = EC.visibility_of_element_located if visible else EC.presence_of_element_located
                return WebDriverWait(driver, 3).until(cond((By.XPATH, xpath)))
            except Exception:
                pass
        return None

    def login():
        driver.get(mes_url)
        print('로그인…')
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH, '//*[@id="username"]'))).send_keys(uid)
        driver.find_element(By.XPATH, '//*[@id="password_input"]').send_keys(pw)
        driver.find_element(By.XPATH, '//*[@id="loginsubmit"]').click()
        time.sleep(8)

    def revive():
        """11/9: 재고현황 화면에서 브라우저가 멈춰(응답 없음 120초) 판매생산속보에서 실행 전체가 죽고 업로드가 하나도 안 됐음 →
        브라우저가 응답하지 않으면 새로 띄워 다시 로그인하고 남은 화면을 계속"""
        nonlocal driver
        try:
            driver.execute_script('return 1')
            return
        except Exception as e:
            print(f'  브라우저 응답 없음 → 새로 띄워 다시 로그인 ({str(e).splitlines()[0][:100] if str(e) else type(e).__name__})')
        try:
            driver.quit()
        except Exception:
            pass
        driver = make_driver()
        login()

    try:
        login()
        if a.remote_only:                                   # 원격 조회만: 쿼리 화면 → 조회 목록 실행 → 끝
            menu('쿼리')
            box = frame_with('//*[@id="QUERY_CONTTextArea"]')
            if box is None:
                raise RuntimeError('쿼리 입력창을 찾지 못함')

            def run_sql(sql):
                box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE)
                time.sleep(0.5)
                box.send_keys(sql)
                driver.execute_script('arguments[0].click();', driver.find_element(By.XPATH, '//*[@id="mnuCust1Btn"]/span'))
            remote_queries(run_sql)
            raise RemoteOnlyDone()
        if a.stock_manual:                                  # 사람이 화면을 열고 조회 → 엔터 → 표를 읽어 저장
            for plant, name in (('도금', 'snap_stock_g'), ('컬러', 'snap_stock_c')):
                input(f"\n[{plant}] 열린 Edge 창에서 '제품재고 현황'을 열고, 공장구분={plant}, 입고일자 2000-01-01 ~ 오늘로 조회한 뒤 여기서 Enter ")
                o = None
                for fr in [None] + list(reversed(driver.find_elements(By.TAG_NAME, 'iframe'))):
                    try:
                        driver.switch_to.default_content()
                        if fr is not None:
                            driver.switch_to.frame(fr)
                        o = read(None)
                        if o and o['rows']:
                            break
                    except Exception:
                        o = None
                driver.switch_to.default_content()
                k = len(o['rows']) if o else 0
                print(f"  {plant}: {k}행" + ('  ⚠ 10,000행 — 잘렸을 수 있음(입고일자를 나눠 두 번 조회 필요)' if k >= 10000 else ''))
                save(o, name, xdir)
            a.stock_only = a.no_extra = True
        if a.probe:                                         # 진단만 하고 나머지 내려받기는 건너뜀
            diag = []
            try:
                open_menu('제품재고 현황', 'SSHPC4025', diag)
                print('  ✅ 제품재고 현황 화면 열림')
            except Exception as e:
                print(f'  ⚠ {e}')
            save_diag(diag)
            for st_, v in diag:
                print('   ', st_, '|', str(v)[:160])
            a.stock_only = a.no_extra = True
        if not a.stock_only:
            # ①② 쿼리 화면
            print(f'쿼리 화면 — 기간 {d0} ~ {d1}')
            menu('쿼리')
            box = frame_with('//*[@id="QUERY_CONTTextArea"]')
            if box is None:
                raise RuntimeError('쿼리 입력창을 찾지 못함')
            def run_sql(sql):
                box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE)
                time.sleep(0.5)
                box.send_keys(sql)
                driver.execute_script('arguments[0].click();', driver.find_element(By.XPATH, '//*[@id="mnuCust1Btn"]/span'))
            # 생산은 10일씩(하루 최대 ~540코일 → 10일 ≤ 5,400행), 휴지는 행이 적어 15일씩
            for name, mk, step in [('q_prod.xlsx', q_prod, 10), ('q_brk.xlsx', q_brk, 15)]:
                print(f'▶ {name}')
                if run_chunks(name[:-5], 'gridQueryRslt', lambda c0, c1: run_sql(mk(c0, c1)), step) is None:
                    run_sql(mk(d0, d1))
                    time.sleep(15)
                    export('//*[@id="row0gridQueryRslt"]/div[1]', name)
            # ④ 분석용 추가 자료(컬러 생산·휴지, 출하, 재고 추이) — 실패해도 도금 자동 실행에는 영향 없음
            if not a.no_extra:
                for name, mk, step in [('color_prod', q_color, 7), ('color_brk', q_color_brk, 7), ('ship', q_ship, 7), ('stock_trend', q_stock_trend, 100)] + STOCK_RPT:
                    print(f'▶ {name} (분석용)')
                    try:
                        if run_chunks(name, 'gridQueryRslt', lambda c0, c1: run_sql(mk(c0, c1)), step, xdir) is None:
                            print(f'  ⚠ {name}: 표 직접 읽기 실패 — 건너뜀')
                    except Exception as e:
                        print(f'  ⚠ {name}: 실패 — 건너뜀 ({str(e).splitlines()[0][:120]})')
                # ④-2 원격 조회 목록(클라우드에서 조회문을 추가하면 다음 실행 때 받아 옴) — 실패해도 나머지에 영향 없음
                try:
                    remote_queries(run_sql)
                except Exception as e:
                    print(f'  ⚠ 원격 조회 목록: 실패 — 건너뜀 ({str(e).splitlines()[0][:150] if str(e) else type(e).__name__})')
            # ③ 생산실적 조회(도금) 화면
            print('▶ screen_prod.xlsx (생산실적 조회)')
            menu('생산실적 조회')
            if frame_with('//*[@id="dropdownlistContentS_PLT_CLS"]') is None:
                raise RuntimeError('생산실적 조회 화면을 찾지 못함')
            driver.execute_script("try { var jq = window.$ || window.jQuery; var dd = jq('#S_PLT_CLS'); var it = dd.jqxDropDownList('getItems'); "
                                  "for (var i = 0; i < it.length; i++) { if (it[i].label.indexOf('도금') !== -1) { dd.jqxDropDownList('selectIndex', it[i].index); break; } } } catch (e) {}")
            time.sleep(1)
            SET_DATE_JS = r'''
              var jq = window.$ || window.jQuery, s = arguments[1], out = [];
              ['S_PRD_DT_FR', 'S_PRD_DT_TO'].forEach(function (id, i) {
                var v = s[i], d = new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8));
                try { jq('#' + id).jqxDateTimeInput('setDate', d); out.push(jq('#' + id).jqxDateTimeInput('getText')); } catch (e) { out.push(null); }
              });
              return out;'''

            def run_screen(c0, c1):
                got = driver.execute_script(SET_DATE_JS, None, [c0, c1])
                if not got or None in got:                   # 날짜 위젯 함수가 없으면 키보드 입력
                    for xp, v in (('//*[@id="inputS_PRD_DT_FR"]', c0), ('//*[@id="inputS_PRD_DT_TO"]', c1)):
                        el = driver.find_element(By.XPATH, xp)
                        el.click()
                        el.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE, fmt(v), Keys.TAB)
                    got = [driver.find_element(By.XPATH, '//*[@id="inputS_PRD_DT_FR"]').get_attribute('value'),
                           driver.find_element(By.XPATH, '//*[@id="inputS_PRD_DT_TO"]').get_attribute('value')]
                want = [fmt(c0), fmt(c1)]
                if [str(x or '').replace('/', '-').replace('.', '-')[:10] for x in got] != want:
                    print(f'    ⚠ 화면 날짜가 {got} 로 들어감(원한 값 {want})')
                driver.execute_script('arguments[0].click();', WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, '//*[@id="mnuSearchBtn"]/span'))))
            if run_chunks('screen_prod', None, run_screen, 10) is None:
                export("//div[contains(@class, 'jqx-grid-cell')]", 'screen_prod.xlsx')
        # ⑤ 재고현황 [SMKTF1030] — 조회기준 '기준월', 월별로 조회해 합침(사용자 안내 2026-10-02)
        if not a.no_extra:
            MONTH_JS = r"""
              var jq = window.$ || window.jQuery, ym = arguments[0], out = {mode: null, dates: [], form: []};
              var y = +ym.slice(0, 4), m = +ym.slice(4, 6), d = new Date(y, m - 1, 1), txt = ym.slice(0, 4) + '-' + ym.slice(4, 6);
              // 1) 조회기준 = 기준월 (드롭다운·라디오·버튼 중 있는 것)
              if (jq) jq('.jqx-dropdownlist, [role=combobox]').each(function () {
                if (out.mode) return; var dd = jq(this);
                try { var it = dd.jqxDropDownList('getItems') || [];
                  for (var i = 0; i < it.length; i++) if (String(it[i].label).indexOf('기준월') !== -1) { dd.jqxDropDownList('selectIndex', it[i].index); out.mode = 'dropdown:' + it[i].label; break; } } catch (e) {}
              });
              if (!out.mode) {
                var els = document.querySelectorAll('label, span, div, input[type=radio]');
                for (var i = 0; i < els.length && !out.mode; i++) {
                  var e = els[i], t = (e.textContent || e.value || '').replace(/\s+/g, '');
                  if (t === '기준월' && (e.offsetParent || e.getClientRects().length)) {
                    var r = e.querySelector && e.querySelector('input[type=radio]') || (e.htmlFor && document.getElementById(e.htmlFor)) || e;
                    try { if (jq && jq(r).jqxRadioButton) jq(r).jqxRadioButton('check'); } catch (x) {}
                    r.click(); out.mode = 'click:' + e.tagName;
                  }
                }
              }
              return JSON.stringify(out);"""
            DATE_JS = r"""
              var jq = window.$ || window.jQuery, ym = arguments[0], out = {dates: [], form: []};
              var y = +ym.slice(0, 4), m = +ym.slice(4, 6), d = new Date(y, m - 1, 1), txt = ym.slice(0, 4) + '-' + ym.slice(4, 6);
              var ds = jq ? jq('.jqx-datetimeinput').filter(function () { return jq(this).is(':visible'); }) : [];
              for (var i = 0; i < ds.length; i++) { try { jq(ds[i]).jqxDateTimeInput('setDate', d); out.dates.push(jq(ds[i]).jqxDateTimeInput('getText')); } catch (e) { out.dates.push('err ' + e); } }
              if (!ds.length) document.querySelectorAll('input[type=month], input').forEach(function (e) {
                if ((e.offsetParent) && /^\d{4}-\d{2}$/.test(e.value || '')) { e.value = txt; e.dispatchEvent(new Event('change', {bubbles: true})); out.dates.push('input:' + e.id); } });
              // 진단용: 검색 조건 영역의 라벨·입력 목록
              document.querySelectorAll('label, input, .jqx-dropdownlist, .jqx-datetimeinput').forEach(function (e) {
                if (out.form.length < 60 && (e.offsetParent || e.getClientRects().length)) out.form.push(e.tagName + '#' + e.id + ':' + String(e.textContent || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 30)); });
              return JSON.stringify(out);"""
            months = []
            cur = datetime.date(today.year, today.month, 1)
            for k in range(a.stock_months - 1, -1, -1):                 # 최근 N개월(이번 달 포함)
                yy, mm = cur.year, cur.month - k
                while mm <= 0:
                    yy, mm = yy - 1, mm + 12
                months.append(f'{yy}{mm:02d}')
            months.reverse()                                            # 최신 달부터(이번 달·지난달이 가장 중요)
            # 11/9: 재고현황 '기준월'은 마감된 달만 나옴(이번 달은 0행) → 이번 달은 안 받고, 지난달이 누적본에 없을 때만(한 달에 한 번) 받음.
            # 이 화면은 한 달 1만1천 줄이라 Chrome 이 '오류 코드 39'(메모리)로 죽어 실행 전체가 멈췄음. 누적본은 열지 않고 글자만 찾음(메모리 0)
            prev_ = months[1] if len(months) > 1 else None
            try:
                c_ = json.loads(open(os.path.join(HERE, 'auto_config.json'), encoding='utf-8-sig').read(), strict=False)
                od_ = c_.get('out_dir') or 'out'
                acc_ = os.path.join(od_ if os.path.isabs(od_) else os.path.join(HERE, od_), 'extra_acc', 'snap_stock.json')
                has_ = False
                if prev_ and os.path.exists(acc_):
                    tag_, tail_ = f'["{prev_}"'.encode(), b''
                    with open(acc_, 'rb') as fh_:
                        while not has_:
                            ch_ = fh_.read(1 << 20)
                            if not ch_:
                                break
                            has_ = tag_ in tail_ + ch_
                            tail_ = ch_[-16:]
            except Exception:
                has_ = False
            months = [] if has_ or not prev_ else [prev_]
            print(f'  재고현황: ' + (f'지난달 {prev_} 은 누적본에 있음 → 건너뜀(이번 달은 월 마감 전이라 자료 없음)' if not months else f'지난달 {prev_} 만 받음(누적본에 없음)'))
            if months:
                print(f'▶ snap_stock (재고현황 SMKTF1030, 기준월 {months[0]}, 분석용)')
            stock_diag = []
            try:
                if months and frame_with("//*[@id='LBL_CAL_CLS' or @id='CAL_CLS']") is None:
                    driver.switch_to.default_content()
                    open_by_search_popup('재고현황', 'SMKTF1030', stock_diag)
                merged = None
                for ym in months:
                    al = close_alert()
                    if al:
                        stock_diag.append([f'alert before {ym}', al[:200]])
                    if frame_with("//*[@id='LBL_CAL_CLS' or @id='CAL_CLS']") is None:   # 조회기준 라벨(id 확인됨)
                        raise RuntimeError('재고현황 화면의 조회 조건을 찾지 못함')
                    r1 = json.loads(driver.execute_script(MONTH_JS, ym))
                    time.sleep(1.5)
                    r2 = json.loads(driver.execute_script(DATE_JS, ym))
                    stock_diag.append([f'month {ym}', json.dumps({'mode': r1.get('mode'), 'dates': r2.get('dates'), 'form': r2.get('form')}, ensure_ascii=False)[:2500]])
                    if not r1.get('mode') or not r2.get('dates'):
                        raise RuntimeError(f"조회기준(기준월)·월 입력칸을 못 찾음 (조회기준 {r1.get('mode')}, 월칸 {r2.get('dates')})")
                    try:
                        driver.execute_script(CLEAR_JS, None)
                    except Exception:
                        pass
                    btn = driver.find_elements(By.XPATH, '//*[@id="mnuSearchBtn"]') or \
                          [e for e in driver.find_elements(By.XPATH, "//*[self::button or self::a or self::span or self::div][normalize-space(.)='조회']") if e.is_displayed()]
                    if not btn:
                        raise RuntimeError('조회 버튼을 찾지 못함')
                    driver.execute_script('arguments[0].click();', btn[0])
                    n = wait_rows(None, 180)
                    al = close_alert()
                    o = read(None) if n else None
                    k = len(o['rows']) if o else 0
                    stock_diag.append([f'result {ym}', f'{k}행' + (f' / 알림: {al[:150]}' if al else '')])
                    print(f"    기준월 {r2['dates'][0] if r2['dates'] else ym}: {k}행" + (' (자료 없음)' if not k else '') + ('  ⚠ 10,000행 — 잘렸을 수 있음' if k == 10000 else ''))
                    if o:
                        o = {'columns': ['_기준월'] + o['columns'], 'rows': [[ym] + r for r in o['rows']]}
                        if merged is None:
                            merged = o
                        elif o['columns'] == merged['columns']:
                            merged['rows'] += o['rows']
                        save(merged, 'snap_stock', xdir)            # 달마다 저장(중간에 실패해도 받은 달은 남김)
            except Exception as e:
                print(f'  ⚠ 재고현황: 실패 — 건너뜀 ({str(e).splitlines()[0][:200] if str(e) else type(e).__name__})')
            finally:
                save_diag(stock_diag)
        revive()
        # ⑥ 컬러 소재 재고 목록(현재 시점 스냅샷, 분석용)
        if not a.no_extra:
            print('▶ snap_mat_stock_cc (소재재고List(CC), 분석용)')
            try:
                menu('소재재고List(CC)')
                if frame_with('//*[@id="mnuSearchBtn"]/span', visible=True) is None:
                    raise RuntimeError('화면을 찾지 못함')
                try:
                    driver.execute_script(CLEAR_JS, None)
                except Exception:
                    pass
                driver.execute_script('arguments[0].click();', WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH, '//*[@id="mnuSearchBtn"]/span'))))
                n = wait_rows(None, 180)
                save(read(None) if n else None, 'snap_mat_stock_cc', xdir)
            except Exception as e:
                print(f'  ⚠ 소재재고List(CC): 실패 — 건너뜀 ({str(e).splitlines()[0][:120]})')
        # ⑦ 일별 재고 원자료(판매생산속보의 원천 표 rpt_7·8·9, 전 창고) — --stock-only 일 때 재고현황과 같은 기간으로 한 번에
        if a.stock_only and not a.probe and not a.stock_manual:
            r0 = f"{months[-1]}01" if months else (today - datetime.timedelta(days=150)).strftime('%Y%m%d')
            r1 = (today - datetime.timedelta(days=1)).strftime('%Y%m%d')
            print(f'▶ 일별 재고 원자료 {r0}~{r1} (판매생산속보 원천, 분석용)')
            try:
                driver.switch_to.default_content()            # 메인을 다시 열면(driver.get) 좌측 메뉴가 안 돌아옴 → 지금 화면에서 바로 메뉴 사용
                menu('쿼리')
                box = frame_with('//*[@id="QUERY_CONTTextArea"]')
                if box is None:
                    raise RuntimeError('쿼리 입력창을 찾지 못함')
                def run_sql2(sql):
                    box.send_keys(Keys.CONTROL + 'a', Keys.BACKSPACE)
                    time.sleep(0.5)
                    box.send_keys(sql)
                    driver.execute_script('arguments[0].click();', driver.find_element(By.XPATH, '//*[@id="mnuCust1Btn"]/span'))
                for name, mk, step in STOCK_RPT:
                    print(f'▶ {name}')
                    try:
                        if run_chunks(name, 'gridQueryRslt', lambda c0, c1: run_sql2(mk(c0, c1)), step, xdir, (r0, r1)) is None:
                            print(f'  ⚠ {name}: 표 직접 읽기 실패 — 건너뜀')
                    except Exception as e:
                        print(f'  ⚠ {name}: 실패 — 건너뜀 ({str(e).splitlines()[0][:120]})')
            except Exception as e:
                print(f'  ⚠ 일별 재고 원자료: 실패 — 건너뜀 ({str(e).splitlines()[0][:160] if str(e) else type(e).__name__})')
        # ⑧ 판매생산속보(실시간 재고·생산·판매 요약표) — 맨 마지막에(이 페이지를 연 뒤로는 MES 메인 메뉴가 안 돌아와 뒤 화면들이 실패했음, 2026-10-07)
        if not a.no_extra:
            print('▶ snap_salesrpt (판매생산속보, 분석용)')
            TABLES_JS = r"""
              var out = [], ts = document.querySelectorAll('table');
              for (var i = 0; i < ts.length; i++) {
                var rs = ts[i].rows; if (!rs || rs.length < 2) continue;
                var cap = '', p = ts[i];
                for (var k = 0; k < 4 && p && !cap; k++) { var prev = p.previousElementSibling; while (prev && !cap) { var tx = (prev.textContent || '').trim(); if (tx && tx.length < 80) cap = tx; prev = prev.previousElementSibling; } p = p.parentElement; }
                for (var r = 0; r < rs.length; r++) {
                  var cs = [];
                  for (var c = 0; c < rs[r].cells.length; c++) { var cell = rs[r].cells[c]; cs.push((cell.textContent || '').replace(/\s+/g, ' ').trim() + (cell.colSpan > 1 ? '{c' + cell.colSpan + '}' : '') + (cell.rowSpan > 1 ? '{r' + cell.rowSpan + '}' : '')); }
                  out.push([i, cap.slice(0, 60), r, cs.join(' | ')]);
                }
              }
              return JSON.stringify(out);"""
            revive()
            main_win = None
            try:
                main_win = driver.current_window_handle
                driver.switch_to.default_content()
                driver.switch_to.new_window('tab')          # 속보는 새 탭에서(같은 창에서 열면 MES 메인 메뉴가 안 돌아와 뒤 화면들이 실패함)
                driver.get(SALES_RPT_URL)
                time.sleep(12)
                rows_ = []
                for fr in [None] + driver.find_elements(By.TAG_NAME, 'iframe'):          # 표가 iframe 안에 있을 수도
                    try:
                        driver.switch_to.default_content()
                        if fr is not None:
                            driver.switch_to.frame(fr)
                        rows_ += json.loads(driver.execute_script(TABLES_JS))
                    except Exception:
                        pass
                driver.switch_to.default_content()
                save({'columns': ['표', '제목', '행', '칸'], 'rows': rows_} if rows_ else None, 'snap_salesrpt', xdir)
            except Exception as e:
                print(f'  ⚠ 판매생산속보: 실패 — 건너뜀 ({str(e).splitlines()[0][:160] if str(e) else type(e).__name__})')
            finally:
                try:
                    if driver.current_window_handle != main_win:
                        driver.close()                      # 속보 탭 닫고 MES 메인 창으로
                except Exception:
                    pass
                try:
                    driver.switch_to.window(main_win)
                    driver.switch_to.default_content()
                except Exception:
                    driver.get(mes_url)
                    time.sleep(6)
    finally:
        driver.quit()
        shutil.rmtree(dl, ignore_errors=True)
    print('받은 파일:', ok_files, '/ 분석용:', extra_files)
    if len(ok_files) < 3 and not a.stock_only and not a.probe and not a.stock_manual:
        print('⚠ 일부 파일을 받지 못했습니다 — 자동 실행기는 받은 파일로만 돕니다(누적 저장소에 이전 자료가 있으면 그대로 유지)')
    if not a.no_auto and (ok_files or extra_files or a.probe):
        env = dict(os.environ, PYTHONUTF8='1', PYTHONUNBUFFERED='1')
        pr = subprocess.Popen([sys.executable, '-m', 'cglplan', 'auto', '--config', os.path.join(HERE, 'auto_config.json')], cwd=HERE, env=env,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
        for line in pr.stdout:                                   # 자동 실행기 출력도 화면 + out/run_log.txt 에
            print(line, end='')
        sys.exit(pr.wait())


def push_log(code):
    """실행 기록(out/run_log.txt)을 암호화해 published/runlog_{auto|remote}.enc.json 으로 올림 — 성공·실패 상관없이.
    2026-11-08: 사내 PC가 중간에 멈추면 업로드가 하나도 안 돼 클라우드에서 원인을 볼 수 없었음(11/5 16:50 이후 사흘)"""
    try:
        sys.stdout.flush()
        cfg = json.loads(open(os.path.join(HERE, 'auto_config.json'), encoding='utf-8-sig').read(), strict=False)
        sbc, pw = cfg.get('supabase') or {}, cfg.get('analysis_password') or cfg.get('password')
        if not (sbc.get('url') and sbc.get('key') and pw):
            return
        sys.path.insert(0, HERE)
        from cglplan import publish as PB
        from cglplan.supa import Supa
        log = open(os.path.join(HERE, 'out', 'run_log.txt'), encoding='utf-8', errors='replace').read()[-200000:]
        tag = 'remote' if '--remote-only' in sys.argv else 'auto'
        body = {'at': datetime.datetime.now().isoformat(timespec='seconds'), 'exit': str(code), 'argv': sys.argv[1:], 'log': log}
        Supa(sbc['url'], ''.join(str(sbc['key']).split()), sbc.get('ssl_verify', True)).upload(
            'published', f'runlog_{tag}.enc.json', json.dumps(PB.encrypt(body, pw, '실행 기록')))
        print(f'실행 기록 올림(runlog_{tag})')
    except Exception as e:
        print(f'실행 기록 올리기 실패: {e}')


if __name__ == '__main__':
    code = 0
    try:
        try:
            main()
        except RemoteOnlyDone:
            print('원격 조회 끝 → 추가 자료만 게시')
            env = dict(os.environ, PYTHONUTF8='1', PYTHONUNBUFFERED='1')
            code = subprocess.call([sys.executable, '-m', 'cglplan', 'pushextra', '--config', os.path.join(HERE, 'auto_config.json')], cwd=HERE, env=env)
    except SystemExit as e:
        code = e.code
        if code not in (0, None):
            print(f'멈춤: {code}')
    except BaseException as e:
        import traceback
        traceback.print_exc()
        code = f'{type(e).__name__}: {e}'
        # 11/9: 브라우저가 응답 없음(Read timed out)으로 죽으면 남은 자동화 브라우저를 끄고 한 번 더 처음부터(실행 기록은 다시 실행한 쪽이 올림)
        if ('timed out' in str(e).lower() or 'Timeout' in type(e).__name__ or 'MaxRetry' in type(e).__name__) and not os.environ.get('CGL_RETRY') \
                and '--register' not in sys.argv:
            print('브라우저 응답 없음 → 남은 브라우저를 끄고 한 번 더 실행')
            try:
                kill_stale_browsers()
            except Exception:
                pass
            sys.stdout.flush()
            SKIP_PUSH = True
            code = subprocess.call([sys.executable, os.path.join(HERE, 'mes_download.py')] + sys.argv[1:], cwd=HERE,
                                   env=dict(os.environ, CGL_RETRY='1', CGL_UPDATED='1', PYTHONUTF8='1', PYTHONUNBUFFERED='1'))
    finally:
        if '--register' not in sys.argv and not SKIP_PUSH:
            push_log(code)
    sys.exit(code if isinstance(code, int) or code is None else 1)
