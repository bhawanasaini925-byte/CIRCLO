/* Developer-only: an in-memory imitation of the Google Apps Script services CIRCLO uses,
   so Code.gs can be exercised locally with Node. Not used by the website. */
const crypto = require('crypto'), fs = require('fs'), vm = require('vm'), path = require('path');

function load(opts = {}) {
  const props = {}, cache = new Map(), files = {}, sheets = {};
  const textify = v => (typeof v === 'string' && v.startsWith("'")) ? v.slice(1) : v;
  class Range {
    constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
    setValue(x) { this.sh.set(this.r, this.c, x); return this; }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); o.push(row); } return o; }
    getValue() { return this.sh.get(this.r, this.c); }
    getSheet() { return this.sh; } getRow() { return this.r; } getColumn() { return this.c; }
    setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setDataValidation() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getName() { return this.name; }
    set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = textify(v); }
    get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
    getLastColumn() { return Math.max(1, ...this.data.map(r => r.length)); }
    getLastRow() { return this.data.length; }
    getMaxRows() { return 1000; }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.data.length), this.getLastColumn()); }
    appendRow(v) { const r = this.data.length + 1; v.forEach((x, j) => this.set(r, j + 1, x)); }
    setFrozenRows() {} setConditionalFormatRules() {}
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets),
    deleteSheet: s => delete sheets[s.name], getId: () => 'SHEET1', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET1' };
  sheets.Sheet1 = new Sheet('Sheet1');
  const chain = () => new Proxy({}, { get: (t, k) => k === 'build' ? () => ({}) : () => chain() });
  const bytes = s => Array.from(Buffer.isBuffer(s) ? s : Buffer.from(Array.isArray(s) ? s.map(b => b & 255) : String(s)));
  const signed = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  const ctx = {
    console: opts.quiet ? { log() {}, error() {} } : console, Logger: { log: opts.quiet ? () => {} : console.log }, JSON, Date, Math, String, Number, Object, Array, Error, isFinite, isNaN, RegExp, Buffer,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { create: () => ss, openById: () => ss, flush() {}, newDataValidation: chain, newConditionalFormatRule: chain },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: chain },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ text: s, setMimeType() { return this; }, getContent() { return s; } }) },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'link', PRIVATE: 'private' }, Permission: { VIEW: 'view', NONE: 'none' },
      createFolder: () => ({ getId: () => 'FOLDER1' }),
      getFolderById: () => ({ createFile: blob => { const id = 'F' + crypto.randomBytes(5).toString('hex'); const f = files[id] = { id, blob, sharing: 'private', trashed: false,
        getId: () => id, setSharing: (a) => { f.sharing = a; }, setTrashed: t => { f.trashed = t; }, getBlob: () => blob }; return f; } }),
      getFileById: id => { if (!files[id]) throw new Error('No file'); return files[id]; }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      getUuid: () => crypto.randomUUID(), sleep() {},
      formatDate: (d, tz, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
        return f.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day); },
      computeDigest: (alg, s) => signed(crypto.createHash(alg).update(String(s)).digest()),
      computeHmacSha256Signature: (v, key) => signed(crypto.createHmac('sha256', Buffer.from(bytes(key))).update(Buffer.from(bytes(v))).digest()),
      base64Encode: b => Buffer.from(bytes(b)).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from(bytes(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: s => signed(Buffer.from(s, 'base64')),
      newBlob: (data, type, name) => ({ getBytes: () => (typeof data === 'string' ? bytes(data) : data), getContentType: () => type, getName: () => name })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { ctx, props, cache, files, sheets, call };
}
module.exports = { load };
