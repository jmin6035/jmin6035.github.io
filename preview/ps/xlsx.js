/* 작은 엑셀(xlsx) 쓰기·읽기 — 외부 라이브러리 없이(회사망에서 CDN 막힘 대비)
   XL.write([{name, rows: [[값 | {v, s: 'in'|'b'|'h'}]], cols: [폭]}]) → Blob(xlsx, 압축 없는 zip)
   XL.read(File) → Promise({시트이름: [[값]]}) — 압축(deflate) 풀기는 브라우저 DecompressionStream */
(function () {
  'use strict';
  const XL = (window.XL = {});
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = (i) => { let s = ''; i += 1; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ST = { '': 0, b: 1, in: 2, h: 3 };   // 기본 · 굵게 · 입력(연노랑) · 머리(굵게+회색)

  function zip(files) {   // files: [[이름, Uint8Array]] → Blob (저장 방식 0 = 압축 없음)
    const parts = [], cen = []; let off = 0;
    for (const [name, data] of files) {
      const nm = enc.encode(name), c = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const e = new DataView(new ArrayBuffer(46));
      e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true);
      e.setUint32(16, c, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, nm.length, true); e.setUint32(42, off, true);
      cen.push(new Uint8Array(e.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const cs = cen.reduce((a, x) => a + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  XL.write = (sheets) => {
    const sh = sheets.map((S) => {
      const rows = S.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
        const o = c != null && typeof c === 'object' ? c : { v: c }; const ref = colName(ci) + (ri + 1), s = ST[o.s || ''] || 0;
        if (o.v == null || o.v === '') return s ? `<c r="${ref}" s="${s}"/>` : '';
        return typeof o.v === 'number' && Number.isFinite(o.v) ? `<c r="${ref}" s="${s}"><v>${o.v}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(o.v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      const cols = (S.cols || []).length ? `<cols>${S.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      const fr = S.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${S.freeze[1]}" ySplit="${S.freeze[0]}" topLeftCell="${colName(S.freeze[1])}${S.freeze[0] + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fr}${cols}<sheetData>${rows}</sheetData></worksheet>`;
    });
    const F = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sh.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((S, i) => `<sheet name="${xe(S.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sh.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sh.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFBE0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEFF2"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="1" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="2" borderId="1" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="1" fillId="3" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" wrapText="1"/></xf></cellXfs></styleSheet>'],
      ...sh.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
    ];
    return zip(F.map(([n, t]) => [n, enc.encode(t)]));
  };
  XL.save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  async function inflate(u8) { const ds = new DecompressionStream('deflate-raw'); const s = new Blob([u8]).stream().pipeThrough(ds); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(buf) {
    const u = new Uint8Array(buf), dv = new DataView(buf); let e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('엑셀(xlsx) 파일이 아님');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {}, dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      const meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u.subarray(ds, ds + cs);
      out[name] = { meth, raw };
    }
    return { get: async (nm) => { const f = out[nm]; if (!f) return null; return dec.decode(f.meth === 8 ? await inflate(f.raw) : f.raw); } };
  }
  const colIdx = (ref) => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  XL.read = async (file) => {
    const Z = await unzip(await file.arrayBuffer()), P = new DOMParser(), x = (t) => P.parseFromString(t, 'application/xml');
    const wb = x(await Z.get('xl/workbook.xml')), rel = x(await Z.get('xl/_rels/workbook.xml.rels'));
    const tgt = {}; for (const r of rel.getElementsByTagName('Relationship')) tgt[r.getAttribute('Id')] = r.getAttribute('Target');
    const ssT = await Z.get('xl/sharedStrings.xml'), SS = ssT ? [...x(ssT).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
    const res = {};
    for (const s of wb.getElementsByTagName('sheet')) {
      const id = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let path = tgt[id] || ''; path = path.startsWith('/') ? path.slice(1) : 'xl/' + path.replace(/^\.\//, '');
      const t = await Z.get(path); if (!t) continue;
      const rows = [];
      for (const r of x(t).getElementsByTagName('row')) {
        const ri = +r.getAttribute('r') - 1, row = (rows[ri] = rows[ri] || []);
        for (const c of r.getElementsByTagName('c')) {
          const ty = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
          let val = ty === 'inlineStr' ? [...c.getElementsByTagName('t')].map((z) => z.textContent).join('') : v ? v.textContent : null;
          if (val != null && ty === 's') val = SS[+val]; else if (val != null && (!ty || ty === 'n')) val = Number(val);
          row[colIdx(c.getAttribute('r'))] = val;
        }
      }
      res[s.getAttribute('name')] = Array.from(rows, (r) => r || []);
    }
    return res;
  };
})();
