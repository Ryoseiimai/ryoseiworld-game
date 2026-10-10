#!/usr/bin/env node
// Browser smoke test for v5/index.html (used by .github/workflows/autodev-ci.yml and by hand).
// Serves the repo root over http, opens v5/ at 390x664 and 1280x720, walks title -> start -> scenes
// via window.__v5 debug functions (missing ones are skipped), saves screenshots, and collects
// JS exceptions / console errors / failed loads. Any error => result "fail" and exit code 1.
//
// Usage: node tools/smoke_v5.cjs [--root <repo dir>] [--port 8842] [--out <dir>] [--format png|jpeg] [--url <already served v5 url>]
// Output: <out>/result.json (same JSON is printed to stdout) and <out>/<viewport>-<NN>-<scene>.<png|jpg>
// Needs the "playwright" package (NODE_PATH or local node_modules) and a Chromium build.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('root', path.join(__dirname, '..')));
const PORT = Number(arg('port', process.env.SMOKE_PORT || 8842));
// Default output lives outside the repo so a dev run never commits screenshots by accident (CI owns devlog/shots).
const OUT = path.resolve(arg('out', process.env.SMOKE_OUT || path.join(require('node:os').tmpdir(), 'smoke_v5')));
const EXTERNAL_URL = arg('url', '');
const FORMAT = arg('format', 'png') === 'jpeg' ? 'jpeg' : 'png'; // CI uses jpeg to keep the repo small
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 664 },
  { name: 'desktop', width: 1280, height: 720 },
];
const MAX_MAPS = 8, MAX_BATTLES = 3, MAX_CHAPTERS = 8, MAX_BOSSES = 6;
const STORAGE_PREFIX = 'ryoseiworld-rpg-v5'; // autodev/RULES.md: v5 save keys start with this; clear() is never used

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.css': 'text/css', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serve(root, port) {
  // Serve only regular files whose real path stays under the real root, so a symlink in the tree
  // (e.g. v5/x -> ../../.git/config) cannot hand files outside the repo to the page.
  const realRoot = fs.realpathSync(root);
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { res.writeHead(400); res.end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.realpath(file, (rerr, real) => {
      if (rerr) { res.writeHead(404); res.end('not found'); return; }
      if (!real.startsWith(realRoot + path.sep) || real.split(path.sep).includes('.git')) { res.writeHead(403); res.end(); return; }
      fs.stat(real, (serr, st) => {
        if (serr || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
        fs.readFile(real, (err, data) => {
          if (err) { res.writeHead(404); res.end('not found'); return; }
          res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
          res.end(data);
        });
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isFavicon = url => /\/favicon\.ico(\?|$)/.test(url || '');

async function launch(chromium) {
  try { return await chromium.launch({ headless: true }); }
  catch (e) { return chromium.launch({ headless: true, channel: 'chrome' }); }
}

async function runViewport(browser, url, vp, errors, shots) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  // v5 shares the ryoseiimai.github.io origin with rpg.html and other apps, so it may only write its own
  // save keys and must never clear storage. Violations are collected and reported as errors.
  // (Patched on Storage.prototype: defineProperty on the storage object itself would store a key named "setItem".)
  await context.addInitScript(prefix => {
    if (typeof Storage === 'undefined') return;
    const bad = window.__smokeStorage = [];
    const P = Storage.prototype, set = P.setItem, rm = P.removeItem;
    const which = st => { try { return st === window.sessionStorage ? 'sessionStorage' : 'localStorage'; } catch (_) { return 'storage'; } };
    P.setItem = function (k, v) { if (!String(k).startsWith(prefix)) bad.push(`${which(this)}.setItem("${k}")`); return set.call(this, k, v); };
    P.removeItem = function (k) { if (!String(k).startsWith(prefix)) bad.push(`${which(this)}.removeItem("${k}")`); return rm.call(this, k); };
    P.clear = function () { bad.push(`${which(this)}.clear()`); };
  }, STORAGE_PREFIX);
  const page = await context.newPage();
  const tag = m => `[${vp.name}] ${m}`;
  page.on('pageerror', e => errors.push({ kind: 'exception', viewport: vp.name, message: String(e && (e.stack || e.message) || e).slice(0, 600) }));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location() || {};
    if (isFavicon(loc.url)) return;
    if (/Failed to load resource/.test(m.text())) return; // counted once via the 'response'/'requestfailed' hooks
    errors.push({ kind: 'console', viewport: vp.name, message: m.text().slice(0, 600) });
  });
  page.on('requestfailed', r => { if (!isFavicon(r.url())) errors.push({ kind: 'load', viewport: vp.name, message: `${r.url()} ${r.failure() && r.failure().errorText}` }); });
  page.on('response', r => { if (r.status() >= 400 && !isFavicon(r.url())) errors.push({ kind: 'load', viewport: vp.name, message: `${r.status()} ${r.url()}` }); });

  const scenes = [];
  let n = 0;
  const state = () => page.evaluate(() => {
    const v = window.__v5;
    if (!v) return { api: false };
    const pick = k => { try { return v[k]; } catch (e) { return undefined; } };
    const loading = document.getElementById('loading');
    const plain = x => (x === undefined || x === null || typeof x !== 'object') ? x : (x.id || x.kind || x.name || true);
    return { api: true, screen: pick('screen'), map: pick('map'), chapter: pick('chapter'), level: pick('level'),
      dialogue: !!pick('dialogue'), modal: pick('modal') || null, battle: plain(pick('battle')), paused: !!pick('paused'),
      loading: !!(loading && !loading.hidden) };
  });
  const shot = async (name, note) => {
    await sleep(350);
    const file = `${vp.name}-${String(++n).padStart(2, '0')}-${name.replace(/[^a-z0-9_-]+/gi, '_')}.${FORMAT === 'jpeg' ? 'jpg' : 'png'}`;
    await page.screenshot(FORMAT === 'jpeg' ? { path: path.join(OUT, file), type: 'jpeg', quality: 70 } : { path: path.join(OUT, file) });
    const st = await state().catch(e => ({ error: String(e) }));
    scenes.push({ name, file, state: st, note: note || '' });
    shots.push(file);
  };
  const skip = (name, why) => scenes.push({ name, skipped: why });
  const has = fn => page.evaluate(f => !!(window.__v5 && typeof window.__v5[f] === 'function'), fn);
  const call = (fn, args) => page.evaluate(([f, a]) => window.__v5[f](...a), [fn, args || []]);
  // Click through dialogue / prologue / naming until the player can act (field or battle) or nothing changes.
  const settle = async (limit = 60) => {
    for (let i = 0; i < limit; i++) {
      const s = await state();
      if (!s.api) return s;
      if (s.modal === 'confirm') { await page.locator('#modal-buttons button').first().click({ timeout: 2000 }).catch(() => {}); await sleep(200); continue; }
      if (s.screen === 'naming') { await page.click('#naming-confirm', { timeout: 2000 }).catch(() => {}); await sleep(300); continue; }
      if (s.dialogue || s.screen === 'prologue') {
        const advanced = await page.evaluate(() => { if (typeof window.__v5.advance === 'function') { window.__v5.advance(); return true; } return false; });
        if (!advanced) await page.click('#dialogue', { timeout: 2000 }).catch(() => {});
        await sleep(120);
        continue;
      }
      return s;
    }
    return state();
  };

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    // Wait until the game exposes its API and the loading cover is gone.
    const ready = await page.waitForFunction(() => window.__v5 && window.__v5.screen === 'title' && (() => { const l = document.getElementById('loading'); return !l || l.hidden; })(), null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ready) errors.push({ kind: 'stuck', viewport: vp.name, message: tag('title screen never became ready (window.__v5.screen !== "title" or #loading still visible after 20s)') });
    await shot('title');
    if (!ready) return scenes;

    const start = page.locator('#start-btn');
    if (await start.count()) { await start.click({ timeout: 5000 }); } else { skip('start', '#start-btn not found'); }
    await sleep(400);
    // SPEC_V7_MANABU.md 9.1: "はじめから" may ask adult/kids mode first; take the default (adult) when it does.
    const modeBtn = page.locator('button', { hasText: 'おとなモード' });
    if (await modeBtn.count()) { await shot('mode-select'); await modeBtn.first().click({ timeout: 5000 }); await sleep(400); }
    await shot('start-prologue');
    const afterStart = await settle();
    await shot('after-start', `screen=${afterStart.screen}`);
    if (afterStart.screen === 'title') errors.push({ kind: 'stuck', viewport: vp.name, message: tag('still on title after pressing start') });

    // Hook for the game itself: window.__v5.smokeScenes = [{name, run(){...}}] adds scenes without editing this file.
    const custom = await page.evaluate(() => Array.isArray(window.__v5.smokeScenes) ? window.__v5.smokeScenes.map(s => s && s.name).filter(Boolean) : []);
    for (const name of custom) {
      try { await page.evaluate(nm => window.__v5.smokeScenes.find(s => s.name === nm).run(), name); await settle(); await shot('custom-' + name); }
      catch (e) { errors.push({ kind: 'scene', viewport: vp.name, message: tag(`custom scene ${name}: ${e.message}`) }); }
    }

    // Maps: warp to each map (spawn point if the data has one; enterMap() moves us off walls).
    if (await has('debugWarp')) {
      const maps = await page.evaluate(() => {
        const out = [];
        for (const [id, m] of Object.entries((window.__v5.GAME_DATA && window.__v5.GAME_DATA.maps) || {})) {
          const sp = m && (m.spawn || m.start || m.entry);
          const w = m && (m.w || m.width || (m.tiles && m.tiles[0] && m.tiles[0].length) || 10);
          const h = m && (m.h || m.height || (m.tiles && m.tiles.length) || 10);
          out.push({ id, x: sp && Number.isFinite(sp.x) ? sp.x : w / 2, y: sp && Number.isFinite(sp.y) ? sp.y : h / 2 });
        }
        return out;
      });
      for (const m of maps.slice(0, MAX_MAPS)) {
        try {
          await call('debugWarp', [m.id, m.x, m.y]);
          await sleep(500);
          const s = await state();
          if (s.map !== m.id) { skip('map-' + m.id, `debugWarp did not move (map=${s.map}, screen=${s.screen})`); continue; }
          await shot('map-' + m.id);
        } catch (e) { errors.push({ kind: 'scene', viewport: vp.name, message: tag(`map ${m.id}: ${e.message}`) }); }
      }
    } else skip('maps', 'no __v5.debugWarp');

    // Chapters / bosses (functions planned for SPEC v6; skipped until they exist).
    if (await has('debugStartChapter')) {
      const chapters = await page.evaluate(() => Object.keys((window.__v5.GAME_DATA && window.__v5.GAME_DATA.chapters) || {}));
      for (const c of chapters.slice(0, MAX_CHAPTERS)) {
        try { await call('debugStartChapter', [isNaN(c) ? c : Number(c)]); await sleep(600); await shot('chapter-' + c); await settle(); await shot('chapter-' + c + '-play'); }
        catch (e) { errors.push({ kind: 'scene', viewport: vp.name, message: tag(`chapter ${c}: ${e.message}`) }); }
      }
    } else skip('chapters', 'no __v5.debugStartChapter');

    if (await has('debugStartBoss')) {
      const bosses = await page.evaluate(() => {
        const d = window.__v5.GAME_DATA || {};
        if (Array.isArray(d.bosses)) return d.bosses.map(b => (b && b.id) || b).filter(x => typeof x === 'string');
        if (d.bosses && typeof d.bosses === 'object') return Object.keys(d.bosses);
        return Object.entries(d.enemies || {}).filter(([, e]) => e && (e.boss || e.kind === 'boss')).map(([k]) => k);
      });
      for (const b of bosses.slice(0, MAX_BOSSES)) {
        try { await call('debugStartBoss', [b]); await sleep(800); await shot('boss-' + b); await page.waitForTimeout(1500); await shot('boss-' + b + '-later'); }
        catch (e) { errors.push({ kind: 'scene', viewport: vp.name, message: tag(`boss ${b}: ${e.message}`) }); }
      }
    } else skip('bosses', 'no __v5.debugStartBoss');

    // Battles: one normal enemy and any boss-like enemy, then win.
    if (await has('debugStartBattle')) {
      const types = await page.evaluate(() => {
        const e = (window.__v5.GAME_DATA && window.__v5.GAME_DATA.enemies) || {};
        const keys = Object.keys(e);
        const boss = keys.filter(k => e[k] && (e[k].boss || /king|boss/i.test(k)));
        const normal = keys.filter(k => !boss.includes(k));
        return [...normal.slice(0, 1), ...boss].map(k => ({ type: k, kind: boss.includes(k) ? 'boss' : 'smoke' }));
      });
      for (const b of types.slice(0, MAX_BATTLES)) {
        try {
          await call('debugWarp', ['town', 5, 5]).catch(() => {});
          await settle();
          await call('debugStartBattle', [b.type, b.kind]);
          await sleep(900);
          const s = await state();
          if (s.screen !== 'battle') { skip('battle-' + b.type, `screen=${s.screen} after debugStartBattle`); continue; }
          await shot('battle-' + b.type);
          if (await has('debugWin')) { await call('debugWin'); await sleep(1500); await shot('battle-' + b.type + '-win'); await settle(); }
        } catch (e) { errors.push({ kind: 'scene', viewport: vp.name, message: tag(`battle ${b.type}: ${e.message}`) }); }
      }
    } else skip('battles', 'no __v5.debugStartBattle');

    // Text overflow check: visible text boxes whose content is wider/taller than the box.
    const overflow = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('#dialogue-text, #battle-log, #quest, #map-label, #modal-copy, #toast, button')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') out.push(el.id || el.textContent.slice(0, 20));
      }
      return out;
    }).catch(() => []);
    if (overflow.length) scenes.push({ name: 'text-overflow', warning: overflow });
  } catch (e) {
    errors.push({ kind: 'runner', viewport: vp.name, message: tag(String(e && e.message || e).slice(0, 600)) });
    try { await shot('runner-error'); } catch (_) { /* page may be gone */ }
  } finally {
    try {
      const bad = await page.evaluate(() => (window.__smokeStorage || []).slice(0, 10));
      for (const b of [...new Set(bad)]) errors.push({ kind: 'storage', viewport: vp.name, message: tag(`${b}: 保存のキーは ${STORAGE_PREFIX} で始め、clear() は使わない`) });
    } catch (_) { /* page may be gone */ }
    await context.close();
  }
  return scenes;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { result: 'fail', url: '', at: new Date().toISOString(), viewports: {}, errors: [], shots: [], out: OUT };
  let server = null, browser = null;
  try {
    let chromium;
    try { ({ chromium } = require('playwright')); }
    catch (e) { throw new Error('playwright is not installed (npm i playwright / set NODE_PATH): ' + e.message); }
    if (!EXTERNAL_URL) {
      if (!fs.existsSync(path.join(ROOT, 'v5', 'index.html'))) throw new Error(`v5/index.html not found under ${ROOT}`);
      server = await serve(ROOT, PORT);
    }
    report.url = EXTERNAL_URL || `http://127.0.0.1:${server.address().port}/v5/index.html`;
    browser = await launch(chromium);
    for (const vp of VIEWPORTS) report.viewports[vp.name] = await runViewport(browser, report.url, vp, report.errors, report.shots);
    report.result = report.errors.length ? 'fail' : 'pass';
  } catch (e) {
    report.errors.push({ kind: 'runner', message: String(e && e.message || e).slice(0, 600) });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.result === 'pass' ? 0 : 1;
})();
