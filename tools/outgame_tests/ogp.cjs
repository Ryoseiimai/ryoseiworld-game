// og-share (OGP): v5/index.html's <head> carries og:title/og:description/og:image/og:url/
// og:type/twitter:card, the image is v5/assets/og/ogp.jpg (made by tools/make_outgame_art.py's
// --ogp mode, which never mirrors, flips or transposes the logo or the hero frame), and
// tools/build_playables_v5.sh leaves the OGP meta and assets/og/ out of the Playables bundle.
// The gate only runs test_v5.cjs (design_final.md 11), so this file also runs
// tools/test_playables_v5.cjs (otherwise not gated at all) and then checks the bundle it builds.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const OGP_URL = 'https://ryoseiimai.github.io/ryoseiworld-game/v5/assets/og/ogp.jpg';
const GAME_URL = 'https://ryoseiimai.github.io/ryoseiworld-game/v5/';

// A small JPEG SOF reader: enough to read width/height without a decoding library.
function readJpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (no SOI marker)');
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) { offset++; continue; }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xd9) break;
    const length = buf.readUInt16BE(offset + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  throw new Error('no SOF marker found');
}

module.exports = async function ogp({ result, assert, html, root }) {
  const repoRoot = path.join(root, '..');

  assert.equal((html.match(/<head>/g) || []).length, 1, 'v5/index.html still has exactly one <head>');

  const metas = {
    'og:title': 'RYOSEIWORLD ひかりの なつやすみ',
    'og:description': '遊びながら ゲーム作りと AIを学ぶ RPG。ブラウザですぐ遊べます。',
    'og:image': OGP_URL,
    'og:url': GAME_URL,
  };
  for (const [prop, expected] of Object.entries(metas)) {
    const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)">`));
    assert(m, `<head> has a ${prop} <meta>`);
    assert.equal(m[1], expected, `${prop} content is correct: ${m[1]}`);
  }
  assert.match(html, /<meta property="og:type" content="website">/, '<head> has og:type=website');
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, '<head> declares twitter:card=summary_large_image');
  result.push('og-ogp: <head> carries og:title, og:description, og:image, og:url, og:type, twitter:card PASS');

  assert(/^https:\/\//.test(metas['og:image']), 'og:image is an absolute URL');
  assert.equal(metas['og:url'], GAME_URL, 'og:url matches the published /v5/ address');

  const imgPath = path.join(root, 'assets', 'og', 'ogp.jpg');
  assert(fs.existsSync(imgPath), 'v5/assets/og/ogp.jpg exists');
  const buf = fs.readFileSync(imgPath);
  const { width, height } = readJpegSize(buf);
  assert.equal(width, 1200, 'ogp.jpg is 1200px wide: ' + width);
  assert.equal(height, 630, 'ogp.jpg is 630px tall: ' + height);
  assert(buf.length <= 300 * 1024, 'ogp.jpg is 300KB or under: ' + buf.length + ' bytes');
  result.push(`og-ogp: v5/assets/og/ogp.jpg is a ${width}x${height} JPEG, ${buf.length} bytes PASS`);

  const artScript = fs.readFileSync(path.join(repoRoot, 'tools', 'make_outgame_art.py'), 'utf8');
  for (const word of ['mirror', 'flip', 'transpose']) {
    assert(!new RegExp(word, 'i').test(artScript), `make_outgame_art.py does not use ${word}`);
  }
  result.push('og-ogp: tools/make_outgame_art.py has no mirror, flip or transpose PASS');

  // test_playables_v5.cjs is not run by .github/autodev/gate.sh (it only runs test_v5, test_shooter,
  // test_proto, smoke), so its own checks (SDK injection, bundled-file list, the Playables runtime)
  // would otherwise never run on a lead branch. Run it here so test_v5.cjs's gate run covers it too;
  // execFileSync throws (failing this test) on a non-zero exit code.
  execFileSync('node', [path.join(repoRoot, 'tools', 'test_playables_v5.cjs')], { cwd: repoRoot });
  result.push('og-ogp: tools/test_playables_v5.cjs (not otherwise run by gate.sh) PASS');

  const bundleDir = path.join(repoRoot, 'dist', 'playables_v5');
  const bundleHtml = fs.readFileSync(path.join(bundleDir, 'index.html'), 'utf8');
  assert(!/og:title|og:description|og:image|og:url|og:type|twitter:card/.test(bundleHtml), 'bundle <head> carries no OGP/Twitter meta');
  assert(!fs.existsSync(path.join(bundleDir, 'assets', 'og')), 'the bundle has no assets/og/ directory');
  result.push('og-ogp: build_playables_v5.sh leaves the OGP meta and assets/og/ out of the bundle PASS');

  const bundleFiles = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else bundleFiles.push(full);
    }
  })(bundleDir);
  for (const f of bundleFiles) {
    assert(!fs.readFileSync(f, 'binary').includes('github.io'), 'no github.io string in bundled ' + path.relative(bundleDir, f));
  }
  result.push(`og-ogp: no file in the Playables bundle (${bundleFiles.length} files) carries the string github.io PASS`);
};
