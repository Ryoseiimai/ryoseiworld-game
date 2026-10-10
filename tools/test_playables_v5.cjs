// Confirms tools/build_playables_v5.sh writes a self-contained bundle and that, inside it,
// the YouTube Playables host disables the debug-mode shop entirely (SPEC_V8_RHYTHM.md 6.2).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const buildScript = path.join(root, 'tools', 'build_playables_v5.sh');
const out = execFileSync('sh', [buildScript], { cwd: root, encoding: 'utf8' });
const bundle = path.join(root, 'dist', 'playables_v5');
assert(fs.existsSync(bundle), 'build_playables_v5.sh must create dist/playables_v5');

const result = [];

// --- File contents: no editor-only art, no files outside the bundle's own tree ---
const allFiles = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else allFiles.push(path.relative(bundle, full));
  }
})(bundle);
for (const f of allFiles) {
  assert(!/_sheet\.png$|\.gif$|_strip\.png$|(^|\/)ref_/.test(f), 'no editor-only art shipped: ' + f);
}
assert(allFiles.includes('index.html'));
assert(allFiles.includes('data/ch1.js') && allFiles.includes('data/ch4.js') && allFiles.includes('data/words.js'));
assert(allFiles.includes('js/shooter.js') && allFiles.includes('js/proto.js'));
result.push(`build: ${allFiles.length} files written to dist/playables_v5 PASS`);

// --- The report line (SPEC_V5_ENGINE.md 7: total size + largest file) ---
assert.match(out, /^Files: \d+$/m);
assert.match(out, /^Total: [\d,]+ bytes \([\d.]+ MiB\)$/m);
assert.match(out, /^Largest: [\d,]+ bytes \([\d.]+ MiB\) — /m);
result.push('build: reports file count, total size and largest file PASS');

// --- The SDK script lands before the game code, same as the v4 build ---
const html = fs.readFileSync(path.join(bundle, 'index.html'), 'utf8');
const sdk = '<script src="https://www.youtube.com/game_api/v1"></script>';
assert(html.indexOf(sdk) > -1 && html.indexOf(sdk) < html.indexOf('<script>\n'), 'SDK script precedes the game script');
result.push('build: YouTube SDK script injected before the game script PASS');

// --- Run the bundled scripts for real, as a Playables host (window.ytgame present) would,
// and confirm the debug-mode shop never opens: no purchase flow, no "use it in the app" text.
async function runBundled() {
  const els = new Map();
  class El {
    constructor(id = '') { this.id = id; this.style = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.children = []; this.classes = new Set(); this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), toggle: (x, on) => (on ? this.classes.add(x) : this.classes.delete(x)) }; }
    addEventListener(n, f) { (this.listeners[n] ??= []).push(f); }
    getContext() { return context2d; }
    replaceChildren() { this.children = []; }
    appendChild(el) { this.children.push(el); return el; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 540, height: 960 }; }
    setPointerCapture() {}
    focus() {}
    select() {}
    contains() { return false; }
    click() {}
  }
  for (const m of html.matchAll(/<([a-z]+)[^>]*?id="([^"]+)"/g)) { const e = new El(m[2]); e.tagName = m[1].toUpperCase(); els.set(m[2], e); }
  const noop = () => {};
  const context2d = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), drawImage() {} }, { get(o, p) { return p in o ? o[p] : noop; }, set(o, p, v) { o[p] = v; return true; } });
  let raf = null, rafId = 0;
  const listeners = {};
  const document = { hidden: false, activeElement: null, getElementById: id => { assert(els.has(id), id); return els.get(id); }, querySelectorAll: () => [...els.values()].filter(e => e.id.startsWith('screen-')), createElement: tag => { const e = new El(); e.tagName = tag.toUpperCase(); return e; }, addEventListener(n, f) { (listeners[n] ??= []).push(f); } };
  const storage = { getItem: () => null, setItem: () => {} };
  class Image { set src(s) { this._src = s; this.complete = true; this.naturalWidth = 200; this.naturalHeight = 200; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } }
  const calls = [];
  const sandbox = { Math: Object.create(Math), innerWidth: 390, innerHeight: 844, document, Image, URLSearchParams, location: { search: '' }, localStorage: storage, performance: { now: () => 0 }, requestAnimationFrame: f => { raf = f; return ++rafId; }, cancelAnimationFrame: () => { raf = null; }, console, queueMicrotask, fetch: async url => ({ ok: false, json: async () => [] }) };
  sandbox.window = { innerWidth: 390, innerHeight: 844, AudioContext: class { createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } }, addEventListener() {} };
  sandbox.window.ytgame = {
    game: { firstFrameReady() {}, gameReady() { calls.push('ready'); }, loadData() { return Promise.resolve(''); }, saveData(data) { calls.push(JSON.parse(data)); return Promise.resolve(); } },
    system: { onPause() {}, onResume() {}, isAudioEnabled() { return false; }, onAudioEnabledChange() {} },
  };
  const scripts = [...html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)]
    .map(m => (m[1] && !/^https?:/.test(m[1]) ? { file: m[1], code: fs.readFileSync(path.join(bundle, m[1]), 'utf8') } : m[1] ? null : { file: 'index.html', code: m[2] }))
    .filter(Boolean);
  for (const s of scripts) { if (sandbox.window.RYW) sandbox.RYW = sandbox.window.RYW; vm.runInNewContext(s.code, sandbox, { filename: s.file }); }
  return { v5: sandbox.window.__v5, RYW: sandbox.window.RYW };
}

(async () => {
  const { v5, RYW } = await runBundled();
  assert.equal(RYW.Shop.kind, 'none', 'YouTube Playables host must not expose a shop');
  assert.equal(v5.debugOpenCheats(), false, 'debug-mode menu must not open on the Playables host');
  result.push('runtime (window.ytgame present): Shop.kind is none and the debug-mode menu never opens PASS');
  console.log(result.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
