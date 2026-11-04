// og-title-brand: the title <h1> is the real RYOSEIWORLD logo (v5/assets/outgame/logo.png),
// made with tools/make_outgame_art.py. R79 (the title moon vs. the English line) stays in
// tools/test_v5.cjs unchanged; this file only covers what this 課題 adds.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

// A small RGBA PNG decoder (color type 6, 8-bit, no interlace), independent from the one in
// test_v5.cjs so this file stays self-contained like the other per-課題 test files.
function readRgbaPng(file) {
  const b = fs.readFileSync(file);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  const bitDepth = b[24], colorType = b[25];
  const chunks = [];
  for (let at = 8; at < b.length;) {
    const len = b.readUInt32BE(at), type = b.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') chunks.push(b.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 4, data = Buffer.alloc(stride * height);
  const paeth = (a, c, d) => { const p = a + c - d, pa = Math.abs(p - a), pc = Math.abs(p - c), pd = Math.abs(p - d); return pa <= pc && pa <= pd ? a : pc <= pd ? c : d; };
  for (let y = 0; y < height; y++) {
    const mode = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[y * stride + x - 4] : 0, up = y ? data[(y - 1) * stride + x] : 0, ul = y && x >= 4 ? data[(y - 1) * stride + x - 4] : 0;
      data[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + [0, a, up, Math.floor((a + up) / 2), paeth(a, up, ul)][mode]) & 255;
    }
  }
  return { width, height, bitDepth, colorType, data, get: (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; } };
}

module.exports = async function titleBrand({ result, assert, html, root }) {
  const logoPath = path.join(root, 'assets', 'outgame', 'logo.png');
  assert(fs.existsSync(logoPath), 'v5/assets/outgame/logo.png exists');
  const png = readRgbaPng(logoPath);
  assert.equal(png.colorType, 6, 'logo.png is RGBA (PNG color type 6)');
  assert.equal(png.bitDepth, 8, 'logo.png is 8-bit');

  const corners = [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]];
  for (const [x, y] of corners) assert.equal(png.get(x, y)[3], 0, `logo.png corner (${x},${y}) is transparent`);

  let opaqueMagenta = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b, a] = png.get(x, y);
      if (a === 255 && r > 180 && b > 180 && g < 80) opaqueMagenta++;
    }
  }
  assert.equal(opaqueMagenta, 0, 'logo.png has no opaque magenta pixels left');
  result.push('og-title-brand: logo.png is an RGBA PNG, its four corners are transparent, and no opaque magenta pixel remains PASS');

  assert.match(html, /<h1><img[^>]*\balt="RYOSEIWORLD"[^>]*><\/h1>/, 'the title <h1> holds an <img alt="RYOSEIWORLD">');
  result.push('og-title-brand: the title <h1> is an <img alt="RYOSEIWORLD"> PASS');

  const root2 = path.dirname(root); // tools/.. (repo root), root is v5/
  const buildScript = path.join(root2, 'tools', 'build_playables_v5.sh');
  const started = Date.now();
  execFileSync('sh', [buildScript], { cwd: root2 });
  const buildMs = Date.now() - started;
  const bundledLogo = path.join(root2, 'dist', 'playables_v5', 'assets', 'outgame', 'logo.png');
  assert(fs.existsSync(bundledLogo), 'build_playables_v5.sh ships assets/outgame/logo.png in the bundle');
  assert.equal(fs.readFileSync(bundledLogo).length, fs.readFileSync(logoPath).length, 'the bundled logo.png matches the source byte-for-byte');
  result.push(`og-title-brand: tools/build_playables_v5.sh bundle includes assets/outgame/logo.png (build took ${buildMs}ms) PASS`);
};
