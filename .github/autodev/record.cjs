#!/usr/bin/env node
// Writes the results file and one devlog entry for one branch, and copies its screenshots into devlog/shots/.
// Called by gate.sh record (main's copy) from the repository root. It never runs branch code: it reads the branch only
// through `git show`, and the screenshots from the test job are checked (name, regular file, size, image header).
// Env: BRANCH SHA BASE_SHA RESULT FENCE MERGE TEST_V5 SMOKE ERRORS_FILE RUN_DIR IN_SMOKE TESTED_BASE MERGED_SHA RUN_URL
//      KEEP_LOG_ENTRIES (200) KEEP_SHOT_RUNS (40)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const e = process.env;
const at = new Date().toISOString();
const git = (...args) => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 }); } catch (_) { return ''; } };
const show = (rev, file) => git('show', `${rev}:${file}`);
const isArt = /^claude\/autodev-art-/.test(e.BRANCH);

// ---- screenshots: up to 4 mobile shots, spread over the run
// Simplified on purpose: shots are committed to main (about 100KB per run), so git history keeps growing
// (~0.5GB/year at 12 runs a day). Way out when it hurts: deploy Pages with Actions and serve shots from the artifact.
const SHOT_RE = /^mobile-\d{2}-[A-Za-z0-9_-]+\.(jpg|png)$/;
const SKIP_RE = /-(title|start-prologue)\.|-win\./;
const MAX_SHOT = 1.5 * 1024 * 1024;
function isImage(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 0);
    return (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || b.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } finally { fs.closeSync(fd); }
}
let mobile = [];
try {
  mobile = fs.readdirSync(e.IN_SMOKE || '/nonexistent').filter(f => SHOT_RE.test(f) && !SKIP_RE.test(f)).sort()
    .filter(f => {
      const p = path.join(e.IN_SMOKE, f), st = fs.lstatSync(p);
      return st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= MAX_SHOT && isImage(p);
    });
} catch (_) { mobile = []; }
const picks = [];
for (let k = 0; k < 4 && mobile.length; k++) {
  const f = mobile[Math.floor(k * (mobile.length - 1) / 3)];
  if (!picks.includes(f)) picks.push(f);
}
const shotDir = path.join('devlog/shots', String(e.RUN_DIR || '0'));
if (picks.length) {
  fs.mkdirSync(shotDir, { recursive: true });
  for (const f of picks) fs.copyFileSync(path.join(e.IN_SMOKE, f), path.join(shotDir, f));
}
// Prune old screenshot folders (git history keeps them; the published site stays small).
try {
  const keep = Number(e.KEEP_SHOT_RUNS || 40);
  const key = d => { const m = d.match(/^(\d+)(?:-(\d+))?$/); return m ? [Number(m[1]), Number(m[2] || 0)] : [-1, 0]; };
  const dirs = fs.readdirSync('devlog/shots').filter(d => fs.lstatSync(path.join('devlog/shots', d)).isDirectory())
    .sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
  for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) fs.rmSync(path.join('devlog/shots', d), { recursive: true, force: true });
} catch (_) { /* no shots yet */ }
const shots = picks.map(f => `${shotDir}/${f}`);

// ---- results file (the dev routine reads it)
const errors = fs.readFileSync(e.ERRORS_FILE, 'utf8').split('\n').filter(Boolean).slice(0, 60);
const res = {
  branch: e.BRANCH, sha: e.SHA, result: e.RESULT,
  checks: { fence: e.FENCE, merge: e.MERGE, test_v5: e.TEST_V5, smoke: e.SMOKE },
  errors, shots, at, merged_sha: e.MERGED_SHA || null, tested_base: e.TESTED_BASE || null, run_url: e.RUN_URL || null,
};
fs.mkdirSync('autodev/ci/results', { recursive: true });
fs.writeFileSync(`autodev/ci/results/${e.BRANCH.replace(/\//g, '__')}.json`, JSON.stringify(res, null, 2) + '\n');

// ---- devlog entry
const rid = (e.BRANCH.match(/-(R[0-9]+)$/) || [])[1];
let task = isArt ? '絵' : (rid || e.BRANCH.replace(/^claude\/autodev-/, ''));
if (rid) {
  const line = show(e.SHA, 'autodev/ROADMAP.md').split('\n').find(l => new RegExp(`^\\s*- \\[[ x!~]\\]\\s*${rid}\\s*\\|`).test(l));
  const title = line && (line.split('|')[1] || '').trim();
  if (title) task = `${rid} ${title}`;
}

function artSummary() {
  const parse = s => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
  const before = new Map(parse(show(e.BASE_SHA, 'autodev/ART_REQUESTS.json')).filter(r => r && r.id).map(r => [String(r.id), r]));
  const done = [], failed = [];
  for (const r of parse(show(e.SHA, 'autodev/ART_REQUESTS.json'))) {
    if (!r || !r.id) continue;
    const old = before.get(String(r.id));
    if (old && old.status === r.status) continue;
    const label = String(r.name || r.id).slice(0, 40);
    if (r.status === 'done') done.push(label);
    else if (r.status === 'failed') failed.push(`${label}（${String(r.reason || '理由なし').slice(0, 40)}）`);
  }
  const out = [];
  if (done.length) out.push(`できた絵: ${done.join('、')}`);
  if (failed.length) out.push(`作れなかった絵: ${failed.join('、')}`);
  if (!out.length) out.push(git('log', '-1', '--format=%s', e.SHA).trim().slice(0, 80));
  return out.join('\n');
}
function devSummary() {
  return show(e.SHA, 'autodev/last_run.md').split('\n')
    .filter(l => !/^\s*#/.test(l) && !/^\s*時刻\s*[:：]/.test(l))
    .map(l => l.replace(/^\s*([-*]|\d+\.)\s*/, '').trim()).filter(Boolean).slice(0, 3).join('\n');
}
const summary = (isArt ? artSummary() : devSummary()) || (e.RESULT === 'pass' ? '' : errors.slice(0, 2).join('\n'));

const logPath = 'devlog/log.json';
let log = [];
try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); if (!Array.isArray(log)) log = []; } catch (_) { log = []; }
log.push({ at, branch: e.BRANCH, task, summary, result: e.RESULT, shots: shots.map(s => s.replace(/^devlog\//, '')),
  sha: e.SHA.slice(0, 7), run_url: e.RUN_URL || null });
fs.mkdirSync('devlog', { recursive: true });
fs.writeFileSync(logPath, JSON.stringify(log.slice(-Number(e.KEEP_LOG_ENTRIES || 200)), null, 1) + '\n');
console.log(`record: ${e.BRANCH} ${e.RESULT} shots=${shots.length}`);
