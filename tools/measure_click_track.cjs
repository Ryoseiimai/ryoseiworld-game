#!/usr/bin/env node
// SPEC_V9_MUSIC 1 and 4: decode click tracks (tools/make_click_track.py) in real browsers and
// compare each click with the beat line. Needs the "playwright" package (NODE_PATH) and the browsers.
//   NODE_PATH=/tmp/pw/node_modules node tools/measure_click_track.cjs <dir> 150:c150 174:c174
// Each arg is bpm:name; <dir>/<name>.{wav,mp3,m4a} are read when present. --pad sets the lead bars (default 1).
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require('playwright');
const args = process.argv.slice(2), dir = path.resolve(args.shift() || '.');
const padArg = args.findIndex(a => a === '--pad'); const pad = padArg >= 0 ? Number(args.splice(padArg, 2)[1]) : 1;
const bars = 8; // make_click_track.py --bars (the default)
if (!(Number.isInteger(pad) && pad >= 0)) { console.error('--pad needs a whole number'); process.exit(2); }
const tracks = args.map(a => { const [bpm, name] = a.split(':'); return { bpm: Number(bpm), name }; });
const TYPES = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const f = path.join(dir, path.basename(decodeURIComponent(req.url.split('?')[0])));
  if (req.url === '/' ) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>m</title>'); }
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
function inPage({ url, bpm, pad, kind }) {
  return (async () => {
    const r = await fetch(url); if (!r.ok) return null;
    const bytes = await r.arrayBuffer();
    // 'live' = an AudioContext at the device rate, 'offline' = the 44.1kHz decoder shooter.js uses before the first tap.
    const ctx = kind === 'live' ? new (window.AudioContext || window.webkitAudioContext)() : new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 44100);
    const buf = await new Promise((ok, ng) => { const p = ctx.decodeAudioData(bytes, ok, ng); if (p && p.then) p.then(ok, ng); });
    const d = buf.getChannelData(0), rate = buf.sampleRate, beat = 60 / bpm, gap = Math.floor(beat * 0.5 * rate);
    const onsets = []; let last = -Infinity;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.1 && i - last > gap) { onsets.push(i / rate); last = i; } else if (Math.abs(d[i]) > 0.1) last = i;
    const errs = onsets.map((t, k) => t - k * beat);
    if (ctx.close) try { await ctx.close(); } catch (_) {}
    return { rate, duration: buf.duration, clicks: onsets.length, first: onsets[0], loopStartClick: onsets[pad * 4],
      maxErrMs: Math.max(...errs.map(Math.abs)) * 1000, meanErrMs: errs.reduce((a, b) => a + b, 0) / errs.length * 1000 };
  })();
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const rows = [];
  for (const [label, type] of [['Chromium', chromium], ['WebKit', webkit]]) {
    let browser;
    try { browser = await type.launch(); } catch (e) { rows.push({ browser: label, error: 'launch failed: ' + String(e.message).split('\n')[0] }); continue; }
    const page = await browser.newPage(); await page.goto(base);
    for (const t of tracks) for (const ext of ['.wav', '.mp3', '.m4a']) {
      if (!fs.existsSync(path.join(dir, t.name + ext))) continue;
      for (const kind of ['live', 'offline']) {
        let m; try { m = await page.evaluate(inPage, { url: base + t.name + ext, bpm: t.bpm, pad, kind }); } catch (e) { m = { error: String(e.message).split('\n')[0] }; }
        const expectClicks = (bars + 2 * pad) * 4, expectLoopStart = pad * 4 * 60 / t.bpm;
        // A missing or extra click shifts every later beat number, so the count must match before the error means anything.
        const ok = m && !m.error && m.clicks === expectClicks && Math.abs(m.loopStartClick - expectLoopStart) < 0.01 && m.maxErrMs <= 10;
        rows.push({ browser: label, file: t.name + ext, bpm: t.bpm, kind, ...m, expectClicks, expectLoopStart, ok: !!ok });
      }
    }
    await browser.close();
  }
  server.close();
  console.log(JSON.stringify(rows, null, 1));
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
