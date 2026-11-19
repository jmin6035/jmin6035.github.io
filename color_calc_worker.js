/* 컬러 계획 계산 전용 Web Worker — 서버와 같은 Python 계산 코드(pycalc/code.zip)를 Pyodide 로 브라우저 안에서 실행.
   자료는 이 브라우저 밖으로 나가지 않는다. 월 물량 LP 는 사이트의 HiGHS(vendor/highs.js)로 푼다(tools/pyodide_shim/pulp.py). */
importScripts('vendor/pyodide/pyodide.js', 'vendor/highs.js');
const post = (type, data) => self.postMessage(Object.assign({ type }, data));
let ready = null;

async function init() {
  const t0 = Date.now();
  post('step', { msg: '계산 엔진 준비 시작(처음 한 번 10~20초)' });
  const highs = await Module({ locateFile: (f) => 'vendor/' + f, print: () => {}, printErr: () => {} });
  self.cglHighsSolve = (lp) => JSON.stringify(highs.solve(lp));
  const py = await loadPyodide({ indexURL: 'vendor/pyodide/', stdout: (s) => (s.startsWith('@@') ? post('step', { msg: s.slice(2) }) : post('log', { msg: s })), stderr: (s) => post('log', { msg: s, err: true }) });
  const code = await (await fetch('pycalc/code.zip', { cache: 'no-cache' })).arrayBuffer();
  py.unpackArchive(code, 'zip', { extractDir: '/calc' });
  await py.runPythonAsync(`
import sys, builtins
def _sum(it, start=0):                 # 서버(Python 3.11)와 같은 순서대로 더하기 — 3.12 의 보정 합산은 반올림 경계에서 1t 차이를 냄
    r = start
    for x in it:
        r = r + x
    return r
builtins.sum = _sum
sys.path[:0] = ['/calc/gp/tools/pyodide_shim', '/calc/site', '/calc/gp/tools', '/calc/gp']
`);
  post('step', { msg: `계산 엔진 준비 완료(${((Date.now() - t0) / 1000).toFixed(0)}초)` });
  return py;
}

function writeFiles(py, files) {
  const FS = py.FS;
  for (const [p, b64] of Object.entries(files)) {
    const full = '/calc/gp/' + p;
    FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    FS.writeFile(full, u8);
  }
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') { ready = ready || init(); await ready; post('ready', {}); return; }
    if (m.type !== 'run') return;
    const py = await (ready = ready || init());
    const t0 = Date.now();
    post('step', { msg: '기준 자료 준비 중' });
    writeFiles(py, m.files);                                  // 매번 기본 자료로 되돌린 뒤 올린 파일로 바꿈
    if (m.prev) py.FS.writeFile('/calc/gp/work/integ_prep.json', new TextEncoder().encode(JSON.stringify({ color: m.prev })));
    py.FS.writeFile('/calc/mes.json', new TextEncoder().encode(JSON.stringify(m.mes)));
    py.FS.mkdirTree('/calc/up');
    const up = {};
    for (const [k, f] of Object.entries(m.uploads || {})) { const nm = ((m.names || {})[k] || `${k}.xlsx`).replace(/[\\/]/g, '_'); py.FS.mkdirTree(`/calc/up/${k}`); const p = `/calc/up/${k}/${nm}`; py.FS.writeFile(p, new Uint8Array(f)); up[k] = p; }
    py.globals.set('UP', py.toPy(up));
    py.globals.set('IDLE', m.idle || '');
    py.globals.set('MOVES', JSON.stringify(m.moves || []));
    const out = await py.runPythonAsync(`
import os, json
os.environ['CGL_R15'] = '1'
for k in [k for k in list(sys.modules) if k.split('.')[0] in ('cglplan', 'color_calc', 'integrated_plan', 'integrated_web', 'integrated_excel', 'master_plan', 'tf_rerun', 'salesrpt', 'color_downtime')]:
    del sys.modules[k]                  # 바꾼 자료를 다시 읽도록 매번 새로 불러옴
import color_calc as C
up = dict(UP)
step = lambda m: print('@@' + m)
C.apply_uploads(up.get('sales'), up.get('r15'), up.get('down'), log=step, lines=up.get('lines'), idle=str(IDLE), moves=str(MOVES))
D = json.load(open('/calc/mes.json', encoding='utf-8'))
o, s = C.run(D['ex'], D['md'], log=step)
P = json.load(open('/calc/gp/work/integ_prep.json', encoding='utf-8'))
prev = [{'ym': M['ym'], 'rows': [{'key': r['key'], 'day': r['day'], 'line': r['line']} for r in M['rows'] if r.get('key')]} for M in (P.get('colorBase') or P['color'])]   # 끌어 옮기기 전 자리(옮기기는 매번 다시 적용)
json.dumps({'o': o, 's': s, 'prev': prev}, ensure_ascii=False)
`);
    post('done', { json: out, sec: Math.round((Date.now() - t0) / 1000) });
  } catch (e) {
    post('error', { msg: String((e && e.message) || e).split('\n').slice(-12).join('\n') });
  }
};
