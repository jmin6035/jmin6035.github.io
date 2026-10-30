/* 결과 게시용 암호화: 결과 JSON → (gzip) → AES-GCM 256, 키 = PBKDF2-SHA256(암호, 60만 회).
   암호화·복호화 모두 브라우저 안에서만 한다(WebCrypto). 게시 파일은 암호 없이는 읽을 수 없다. */
(function (root) {
  const GP = root.GP || (root.GP = {});
  const ITER = 600000;
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function pipe(u8, Stream, mode) {
    const s = new Blob([u8]).stream().pipeThrough(new Stream(mode));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function key(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  GP.encryptJSON = async function (obj, pw, label) {
    let data = new TextEncoder().encode(JSON.stringify(obj));
    const gz = typeof CompressionStream !== 'undefined';
    if (gz) data = await pipe(data, CompressionStream, 'gzip');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pw, salt, ITER), data));
    return { app: 'cgl-plan-enc', v: 1, label: label || '', created: new Date().toISOString(), kdf: 'PBKDF2-SHA256', iter: ITER, gzip: gz, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  };
  GP.decryptJSON = async function (env, pw) {
    if (!env || env.app !== 'cgl-plan-enc') throw new Error('게시 파일 형식이 아닙니다');
    let data;
    try { data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, await key(pw, unb64(env.salt), env.iter), unb64(env.ct))); }
    catch (e) { throw new Error('암호가 틀렸습니다'); }
    if (env.gzip) data = await pipe(data, DecompressionStream, 'gzip');
    return JSON.parse(new TextDecoder().decode(data));
  };
  // 게시 파일 위치(사이트 기준 상대경로). 사내 서버로 옮기면 여기만 바꾸거나 ?src= 로 지정
  GP.PUBLISH_PATH = 'published/latest.plan.enc.json';
  // 게시본 위치: 사내 PC 자동 실행기(Supabase) + 계획 화면 수동 게시(GitHub). 둘 다 읽어 더 최근 것을 보여줌
  GP.SUPABASE_URL = 'https://gatcqxrzaonjsixajrwd.supabase.co';
  GP.PUBLISH_SOURCES = [GP.SUPABASE_URL + '/storage/v1/object/public/published/latest.plan.enc.json', GP.PUBLISH_PATH];
  GP.fetchPublished = async function (sources = GP.PUBLISH_SOURCES) {
    const got = await Promise.all(sources.map(async (u) => {
      try {
        const r = await fetch(u + (/^https?:/.test(u) ? `?v=${Date.now()}` : ''), { cache: 'no-store' });   // CDN 캐시 우회
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    }));
    const stamp = (e) => (e && (e.created || e.savedAt)) || '';
    return got.filter(Boolean).sort((a, b) => (stamp(a) < stamp(b) ? 1 : -1))[0] || null;
  };
  // 화면 자료: 사내 PC 자동 실행기(Supabase)와 GitHub 게시본 중 더 최근 것
  GP.latest = (name) => GP.fetchPublished([GP.SUPABASE_URL + '/storage/v1/object/public/published/' + name, 'published/' + name]);
  GP.PUBLISH_REPO = { owner: 'jmin6035', repo: 'jmin6035.github.io', branch: 'main' };

  /* GitHub에 바로 게시(관리자용). token: 이 저장소 Contents 쓰기 권한만 준 fine-grained 토큰. 브라우저 → GitHub API 직접 호출 */
  GP.publishToGitHub = async function (env, token, path = GP.PUBLISH_PATH) {
    const { owner, repo, branch } = GP.PUBLISH_REPO;
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    let sha;
    const cur = await fetch(`${api}?ref=${branch}`, { headers: h });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw new Error(`GitHub 확인 실패 HTTP ${cur.status} (토큰 권한 확인)`);
    const body = { message: `계획 결과 게시 ${env.label || ''}`.trim(), content: btoa(unescape(encodeURIComponent(JSON.stringify(env)))), branch };
    if (sha) body.sha = sha;
    const r = await fetch(api, { method: 'PUT', headers: h, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`게시 실패 HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
  };
  if (typeof module !== 'undefined') module.exports = GP;
})(typeof self !== 'undefined' ? self : globalThis);
