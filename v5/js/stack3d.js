// Sprite-stacking pseudo-3D for the RYOSEIWORLD field (opt-in).
// Off by default. Turn on with the 3D button, or open the page with ?mode=3d.
// Existing 2D drawing is unchanged when this is off.
(function () {
  'use strict';

  var STORAGE_KEY = 'ryoseiworld-v5-3d';
  var on = false;
  var angle = 0.58;
  var angleTarget = 0.58;
  var squash = 0.7;
  var ZOOM = 0.8;
  var rotateHold = 0;
  var rotateDrag = null;
  var sliceCache = {};
  var tintCache = {};
  var tintSeq = 1;
  var ui = {};
  var OUTLINE = '#1a1810';

  function qs() {
    try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); }
  }
  function engine() {
    return window.Stack3DEngine ? window.Stack3DEngine() : null;
  }
  function readWanted() {
    var q = qs();
    if (q.get('mode') === '3d' || q.get('3d') === '1') return true;
    if (q.get('mode') === '2d' || q.get('3d') === '0') return false;
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (_) {}
  }
  function setEnabled(v) {
    on = !!v;
    persist();
    syncUi();
  }
  function syncUi() {
    if (ui.btn) {
      ui.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      ui.btn.classList.toggle('on', on);
      ui.btn.textContent = on ? '3D ON' : '3D';
    }
    if (ui.rot) ui.rot.hidden = !on;
    if (ui.hint) ui.hint.hidden = !on;
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c: c, x: x };
  }
  function disc(x, cx, cy, rx, ry, fill, stroke) {
    x.beginPath();
    x.ellipse(cx, cy, Math.max(0.55, rx), Math.max(0.55, ry), 0, 0, Math.PI * 2);
    x.fillStyle = fill;
    x.fill();
    if (stroke) {
      x.strokeStyle = stroke;
      x.lineWidth = 1;
      x.stroke();
    }
  }
  function box(x, cx, cy, w, h, fill, stroke) {
    var left = Math.round(cx - w / 2);
    var top = Math.round(cy - h / 2);
    var ww = Math.max(1, Math.round(w));
    var hh = Math.max(1, Math.round(h));
    x.fillStyle = fill;
    x.fillRect(left, top, ww, hh);
    if (stroke) {
      x.strokeStyle = stroke;
      x.lineWidth = 1;
      x.strokeRect(left + 0.5, top + 0.5, Math.max(1, ww - 1), Math.max(1, hh - 1));
    }
  }
  function hexRgb(hex) {
    hex = String(hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [parseInt(hex.slice(0,2),16)||0, parseInt(hex.slice(2,4),16)||0, parseInt(hex.slice(4,6),16)||0];
  }
  function rgbHex(r, g, b) {
    function h(n){ n=Math.max(0,Math.min(255,Math.round(n))); return (n<16?'0':'')+n.toString(16); }
    return '#'+h(r)+h(g)+h(b);
  }
  function shade(hex, mul) {
    var c = hexRgb(hex);
    return rgbHex(c[0]*mul, c[1]*mul, c[2]*mul);
  }
  function mix(a, b, t) {
    var A = hexRgb(a), B = hexRgb(b);
    return rgbHex(A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t, A[2]+(B[2]-A[2])*t);
  }
  function hash2(x, y) {
    var n = (Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function finishSlice(c, outline) {
    try {
      var ctx = c.getContext('2d', { willReadFrequently: true });
      var w = c.width, h = c.height;
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var src = new Uint8ClampedArray(d);
      function alpha(x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        return src[(y * w + x) * 4 + 3];
      }
      var x, y, i, a, edge;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          a = src[i + 3];
          if (a <= 16) continue;
          edge = alpha(x-1,y)<16 || alpha(x+1,y)<16 || alpha(x,y-1)<16 || alpha(x,y+1)<16;
          if (edge) {
            d[i] = d[i] * 0.78; d[i+1] = d[i+1] * 0.78; d[i+2] = d[i+2] * 0.74;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    } catch (_) {}
    return c;
  }

  function tintSlice(sl, bright) {
    var q = Math.max(0.5, Math.min(1.12, Math.round(bright * 12) / 12));
    if (q >= 0.995 && q <= 1.005) return sl;
    if (!sl._tid) sl._tid = tintSeq++;
    var key = sl._tid + ':' + q;
    if (tintCache[key]) return tintCache[key];
    var mk = makeCanvas(sl.width, sl.height);
    mk.x.drawImage(sl, 0, 0);
    // source-atop keeps transparent pixels transparent (multiply+fillRect does not)
    mk.x.globalCompositeOperation = 'source-atop';
    if (q < 1) {
      mk.x.fillStyle = 'rgba(18, 16, 14,' + ((1 - q) * 1.05).toFixed(3) + ')';
    } else {
      mk.x.fillStyle = 'rgba(255, 236, 200,' + ((q - 1) * 1.4).toFixed(3) + ')';
    }
    mk.x.fillRect(0, 0, sl.width, sl.height);
    mk.x.globalCompositeOperation = 'source-over';
    tintCache[key] = mk.c;
    return mk.c;
  }

  function outlineSlice(sl) {
    if (sl._ol) return sl._ol;
    var mk = makeCanvas(sl.width + 2, sl.height + 2);
    var oc = hexRgb(OUTLINE);
    mk.x.drawImage(sl, 1, 1);
    try {
      var img = mk.x.getImageData(0, 0, mk.c.width, mk.c.height);
      var d = img.data, w = mk.c.width, h = mk.c.height;
      var src = new Uint8ClampedArray(d);
      function alpha(x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        return src[(y * w + x) * 4 + 3];
      }
      var x, y, i;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          if (src[i+3] > 16) continue;
          if (alpha(x-1,y)>16 || alpha(x+1,y)>16 || alpha(x,y-1)>16 || alpha(x,y+1)>16) {
            d[i]=oc[0]; d[i+1]=oc[1]; d[i+2]=oc[2]; d[i+3]=255;
          }
        }
      }
      mk.x.putImageData(img, 0, 0);
    } catch (_) {}
    sl._ol = mk.c;
    return mk.c;
  }

  function drawStack(ctx, slices, x, y, yaw, spacing, sq) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(1, sq);
    var n = slices.length;
    for (var i = 0; i < n; i++) {
      var sl = slices[i];
      var t = n <= 1 ? 1 : i / (n - 1);
      var bright = 0.78 + 0.24 * t;
      if (i === n - 1) bright = 1.1;
      var img = tintSlice(sl, bright);
      var side = (spacing >= 0.8) ? tintSlice(sl, Math.max(0.55, bright * 0.82)) : null;
      ctx.save();
      ctx.translate(0, -i * spacing);
      ctx.rotate(yaw);
      if (i === n - 1) {
        var ol = outlineSlice(sl);
        ctx.drawImage(ol, -ol.width / 2, -ol.height / 2);
      }
      if (side) ctx.drawImage(side, -sl.width / 2, -sl.height / 2 + 1);
      ctx.drawImage(img, -sl.width / 2, -sl.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function worldToScreen(E, wx, wy, cx, cy) {
    var dx = wx - E.g.x, dy = wy - E.g.y;
    var c = Math.cos(angle), s = Math.sin(angle);
    var rx = dx * c - dy * s;
    var ry = dx * s + dy * c;
    return { x: cx + rx * ZOOM, y: cy + ry * squash * ZOOM, depth: ry };
  }

  function aim(dx, dy) {
    if (!on) return { dx: dx, dy: dy };
    var c = Math.cos(angle), s = Math.sin(angle);
    return { dx: dx * c + dy * s, dy: -dx * s + dy * c };
  }

  function tick(dt) {
    if (!on) return;
    var E = engine();
    if (!E) return;
    if (E.g.screen !== 'field' || E.g.battle) return;
    var dir = rotateHold;
    if (!dir && E.keys) {
      if (E.keys.has('q') || E.keys.has('[') || E.keys.has('1')) dir -= 1;
      if (E.keys.has('e') || E.keys.has(']') || E.keys.has('3')) dir += 1;
    }
    if (dir) angleTarget += dir * 1.7 * dt;
    var k = 1 - Math.exp(-dt * 11);
    angle += (angleTarget - angle) * k;
  }

  function pushSlice(slices, mk, outline) {
    slices.push(finishSlice(mk.c, outline));
  }

  function treeSlices(frame) {
    var key = 'tree:' + frame;
    if (sliceCache[key]) return sliceCache[key];
    var S = 40, slices = [], i, t, mk, r, j, ox, oy, hr;
    var tall = frame === 1;
    // grass tuft
    for (i = 0; i < 2; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S/2, S/2, 7 + i, 5 + i, i ? '#5fa044' : '#3e7a3a');
      disc(mk.x, S/2 - 4, S/2 + 1, 3, 2, '#8fbf45');
      disc(mk.x, S/2 + 5, S/2, 2.4, 2, '#4a8a45');
      pushSlice(slices, mk, '#1e3d22');
    }
    // trunk, thicker at base, slight oval
    var trunkN = tall ? 7 : 5;
    for (i = 0; i < trunkN; i++) {
      mk = makeCanvas(S, S);
      r = 3.2 - i * 0.15;
      disc(mk.x, S/2, S/2, r, r * 0.85, i < 2 ? '#4a3018' : '#6b4a2a');
      disc(mk.x, S/2 - r * 0.3, S/2, r * 0.45, r * 0.5, '#8a6235');
      pushSlice(slices, mk, '#2a1a0c');
    }
    var canopy = tall ? 20 : 18;
    for (i = 0; i < canopy; i++) {
      t = i / (canopy - 1);
      mk = makeCanvas(S, S);
      r = (tall ? 6.5 : 7.5) + Math.sin(t * Math.PI) * (tall ? 9.5 : 11);
      if (t > 0.82) r *= 1 - (t - 0.82) * 2.2;
      r = Math.max(2.2, r);
      var dark = t < 0.18 ? '#244a2c' : '#2d5a32';
      var mid = t < 0.45 ? '#3e7a3a' : '#5fa044';
      var lite = t > 0.55 ? '#b5d85a' : '#8fbf45';
      disc(mk.x, S/2, S/2, r, r * 0.94, mid);
      // irregular clumps
      for (j = 0; j < 3; j++) {
        hr = hash2(i + 3, j + frame * 9);
        ox = Math.cos((j / 3) * Math.PI * 2 + t * 2) * r * 0.45;
        oy = Math.sin((j / 3) * Math.PI * 2 + t * 1.4) * r * 0.4;
        disc(mk.x, S/2 + ox, S/2 + oy, r * (0.38 + hr * 0.18), r * (0.34 + hr * 0.14), j === 0 ? dark : mid);
      }
      if (t > 0.35 && t < 0.9) {
        disc(mk.x, S/2 - r * 0.28, S/2 - r * 0.22, r * 0.38, r * 0.3, lite);
        if (t > 0.55) disc(mk.x, S/2 + r * 0.18, S/2 - r * 0.08, r * 0.2, r * 0.16, '#d4ec7a');
      }
      pushSlice(slices, mk, '#1a3a20');
    }
    return (sliceCache[key] = slices);
  }

  function hedgeSlices() {
    if (sliceCache.hedge) return sliceCache.hedge;
    var S = 32, D = 20, slices = [], i, t, mk, j;
    for (i = 0; i < 12; i++) {
      t = i / 11;
      mk = makeCanvas(S, D);
      var rx = 13 + Math.sin(t * Math.PI) * 2;
      var ry = 7 + Math.sin(t * Math.PI) * 2;
      disc(mk.x, S/2, D/2, rx, ry, t < 0.2 ? '#2d5a32' : (t < 0.7 ? '#3e7a3a' : '#5fa044'));
      for (j = 0; j < 3; j++) {
        disc(mk.x, S/2 - 8 + j * 8, D/2 + (j-1)*0.8, 5.5, 5, j === 1 ? '#8fbf45' : '#4a8a45');
      }
      if (t > 0.5) disc(mk.x, S/2 - 4, D/2 - 2, 3, 2.4, '#b5d85a');
      pushSlice(slices, mk, '#1e3d22');
    }
    return (sliceCache.hedge = slices);
  }

  function flowerSlices() {
    if (sliceCache.flowers) return sliceCache.flowers;
    var S = 24, slices = [], i, mk;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, S);
      box(mk.x, S/2, S/2, 16, 12, i ? '#6a5a3a' : '#4a3a28', '#2a2010');
      pushSlice(slices, mk, '#2a2010');
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S/2, S/2, 8, 6, '#3e7a3a');
      disc(mk.x, S/2 - 3, S/2, 3, 2.5, '#5fa044');
      disc(mk.x, S/2 + 4, S/2 + 1, 3, 2.5, '#4a8a45');
      pushSlice(slices, mk, '#1e3d22');
    }
    var pals = ['#e07aa0', '#f0d25a', '#e8a0b0', '#fff4d6', '#d45c6a'];
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S/2, S/2, 7, 5.5, '#5fa044');
      disc(mk.x, S/2 - 5, S/2 - 1, 2.2, 2.2, pals[i % pals.length]);
      disc(mk.x, S/2 + 4, S/2 + 1, 2.1, 2.1, pals[(i+2) % pals.length]);
      disc(mk.x, S/2, S/2 - 3, 2, 2, pals[(i+4) % pals.length]);
      disc(mk.x, S/2 + 1, S/2 + 3, 1.8, 1.8, pals[(i+1) % pals.length]);
      pushSlice(slices, mk, '#1e3d22');
    }
    return (sliceCache.flowers = slices);
  }

  function poleSlices(lit) {
    var key = 'pole:' + (lit ? 1 : 0);
    if (sliceCache[key]) return sliceCache[key];
    var S = 18, slices = [], i, mk;
    var n = lit ? 24 : 20;
    for (i = 0; i < n; i++) {
      mk = makeCanvas(S, S);
      var top = lit && i >= n - 5;
      if (top) {
        var k = i - (n - 5);
        disc(mk.x, S/2, S/2, 4.2 - k * 0.3, 4.2 - k * 0.3, k >= 3 ? '#fff3a8' : '#e8c86a');
        if (k >= 3) disc(mk.x, S/2, S/2, 2, 2, '#fffce0');
      } else {
        disc(mk.x, S/2, S/2, i === 0 ? 2.6 : 1.7, i === 0 ? 2.6 : 1.7, '#3a4248');
        disc(mk.x, S/2 - 0.5, S/2, 0.7, 0.7, '#6a7278');
      }
      pushSlice(slices, mk, top ? '#6a5820' : '#1c2024');
    }
    return (sliceCache[key] = slices);
  }

  function signalSlices() {
    if (sliceCache.signal) return sliceCache.signal;
    var S = 24, slices = [], i, mk;
    for (i = 0; i < 16; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S/2, S/2, 1.8, 1.8, '#3a4248');
      pushSlice(slices, mk, '#1c2024');
    }
    for (i = 0; i < 6; i++) {
      mk = makeCanvas(S, S);
      box(mk.x, S/2, S/2, 18, 7, '#2a3038', '#111');
      if (i >= 1 && i <= 4) {
        disc(mk.x, S/2 - 5.5, S/2, 2, 2, i === 2 ? '#4ad87a' : '#1a4a28');
        disc(mk.x, S/2, S/2, 2, 2, i === 3 ? '#f0d25a' : '#4a4018');
        disc(mk.x, S/2 + 5.5, S/2, 2, 2, '#5a2020');
      }
      pushSlice(slices, mk, '#111');
    }
    return (sliceCache.signal = slices);
  }

  function benchSlices() {
    if (sliceCache.bench) return sliceCache.bench;
    var W = 34, D = 14, slices = [], i, mk;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, 7, D/2, 3, 3, '#5a3a20');
      box(mk.x, W - 7, D/2, 3, 3, '#5a3a20');
      pushSlice(slices, mk, '#2a1a0c');
    }
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, W - 4, D - 4, i === 1 ? '#8a6235' : '#6b4a2a');
      mk.x.strokeStyle = '#3d2814';
      mk.x.lineWidth = 1;
      mk.x.beginPath(); mk.x.moveTo(5, D/2); mk.x.lineTo(W-5, D/2); mk.x.stroke();
      pushSlice(slices, mk, '#2a1a0c');
    }
    mk = makeCanvas(W, D);
    box(mk.x, W/2, D/2 + 3, W - 6, 4, '#6b4a2a');
    pushSlice(slices, mk, '#2a1a0c');
    return (sliceCache.bench = slices);
  }

  function signSlices() {
    if (sliceCache.signboard) return sliceCache.signboard;
    var W = 40, D = 10, slices = [], i, mk;
    for (i = 0; i < 6; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, 8, D/2, 2.2, 2.2, '#5a4630');
      box(mk.x, W - 8, D/2, 2.2, 2.2, '#5a4630');
      pushSlice(slices, mk, '#2a1a0c');
    }
    for (i = 0; i < 8; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, W - 4, D - 2, i === 0 || i === 7 ? '#5a4630' : '#d8cfa8');
      if (i > 1 && i < 6) {
        mk.x.fillStyle = '#6b4a2a';
        mk.x.fillRect(10, 3, W - 20, 1);
        mk.x.fillRect(12, D - 4, W - 24, 1);
      }
      pushSlice(slices, mk, '#3d2814');
    }
    mk = makeCanvas(W, D);
    box(mk.x, W/2, D/2, W - 2, 3, '#6b4a2a');
    pushSlice(slices, mk, '#2a1a0c');
    return (sliceCache.signboard = slices);
  }

  function vendingSlices() {
    if (sliceCache.vending) return sliceCache.vending;
    var W = 16, D = 12, slices = [], i, mk;
    mk = makeCanvas(W, D);
    box(mk.x, W/2, D/2, W-2, D-2, '#2a3038');
    pushSlice(slices, mk, '#111');
    for (i = 0; i < 16; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, W-2, D-2, i < 3 ? '#3a6ea5' : '#d0d4d8');
      if (i >= 4 && i <= 11) box(mk.x, W/2, D/2, 9, 7, '#6ec8e0', '#2a3038');
      if (i >= 12 && i <= 14) {
        box(mk.x, W/2 - 3, D/2, 3, 2, '#e23a3a');
        box(mk.x, W/2 + 3, D/2, 3, 2, '#f0d25a');
      }
      pushSlice(slices, mk, '#1c2024');
    }
    return (sliceCache.vending = slices);
  }

  function bikeSlices() {
    if (sliceCache.bike) return sliceCache.bike;
    var W = 32, D = 12, slices = [], i, mk;
    for (i = 0; i < 2; i++) {
      mk = makeCanvas(W, D);
      disc(mk.x, 7, D/2, 4, 4, '#22272b');
      disc(mk.x, W-7, D/2, 4, 4, '#22272b');
      disc(mk.x, 7, D/2, 2, 2, '#6a7278');
      disc(mk.x, W-7, D/2, 2, 2, '#6a7278');
      pushSlice(slices, mk, '#111');
    }
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      disc(mk.x, 7, D/2, 3.5, 3.5, '#22272b');
      disc(mk.x, W-7, D/2, 3.5, 3.5, '#22272b');
      box(mk.x, W/2, D/2, 16, 2.5, '#4f6f86');
      pushSlice(slices, mk, '#1c2024');
    }
    mk = makeCanvas(W, D);
    box(mk.x, W/2 + 6, D/2, 3, 6, '#2f3d48');
    box(mk.x, W/2 + 6, D/2 - 2, 8, 2, '#2f3d48');
    pushSlice(slices, mk, '#1c2024');
    return (sliceCache.bike = slices);
  }

  var BUILDING_PAL = {
    0: { wall: '#efe0c6', wall2: '#e4d2b0', roof: '#4a5568', roofLt: '#6a7588', door: '#6b4a2e', window: '#8ec8d8', trim: '#d9c4a0', dark: '#2a3038', fence: '#8a8f8a', bush: true, stories: 2, antenna: true },
    1: { wall: '#f3f0ea', wall2: '#e8e4dc', roof: '#c45c4a', roofLt: '#d87868', door: '#5a3a28', window: '#7ec0d4', trim: '#d8c8b0', dark: '#2a3038', fence: '#b0b4b0', bush: false, stories: 1, awning: true },
    2: { wall: '#e8d9b8', wall2: '#dccba4', roof: '#6a5a48', roofLt: '#8a7a68', door: '#5a3a28', window: '#8ec4d4', trim: '#c8b898', dark: '#2a3038', fence: '#8a8f8a', bush: true, stories: 2 },
    3: { wall: '#d8e0e4', wall2: '#c8d0d4', roof: '#3d4a5c', roofLt: '#5a6a7c', door: '#4a4a4a', window: '#8ec4d4', trim: '#b0b8c0', dark: '#2a3038', fence: '#8a9094', bush: false, stories: 1 },
    4: { wall: '#4a5a88', wall2: '#3e4e78', roof: '#8b2e2e', roofLt: '#b04848', door: '#2a3038', window: '#cfd8e8', trim: '#3a4a70', dark: '#1c2028', fence: '#6a7080', bush: false, stories: 1 },
    5: { wall: '#e6d4b0', wall2: '#d8c49c', roof: '#5a4030', roofLt: '#7a6048', door: '#6b4a2e', window: '#8ec4d4', trim: '#c8b490', dark: '#2a3038', fence: '#8a8f8a', bush: true, stories: 2 },
    6: { wall: '#d8c8b0', wall2: '#c8b8a0', roof: '#6a5848', roofLt: '#8a7868', door: '#5a3a28', window: '#8ec4d4', trim: '#c0b098', dark: '#2a3038', fence: '#8a8f8a', bush: false, stories: 2, flat: true },
    7: { wall: '#efe6d4', wall2: '#e4d8c4', roof: '#6a3028', roofLt: '#8a4840', door: '#5a3a28', window: '#8ec4d4', trim: '#d0c4a8', dark: '#2a3038', fence: '#9a8f80', bush: true, stories: 1 },
    8: { wall: '#8a8070', wall2: '#7a7060', roof: '#4a4038', roofLt: '#6a6058', door: '#3a3028', window: '#6a6058', trim: '#6a6058', dark: '#2a2820', fence: '#6a6458', bush: false, stories: 1 }
  };

  function roofBox(x, cx, cy, w, h, col, lite, dark) {
    box(x, cx, cy, w, h, col, dark);
    x.strokeStyle = shade(dark, 1.15);
    x.lineWidth = 1;
    var rows = Math.max(2, Math.round(h / 3));
    var i, yy;
    for (i = 1; i < rows; i++) {
      yy = cy - h / 2 + i * (h / rows);
      x.beginPath();
      x.moveTo(cx - w / 2 + 1, yy);
      x.lineTo(cx + w / 2 - 1, yy);
      x.stroke();
    }
    if (w > 8) {
      x.strokeStyle = lite;
      x.beginPath();
      x.moveTo(cx - w / 4, cy - h / 2 + 1);
      x.lineTo(cx - w / 4, cy + h / 2 - 1);
      x.stroke();
    }
  }

  function buildingSlices(E, kind, frame) {
    var key = 'b3:' + kind + ':' + frame;
    if (sliceCache[key]) return sliceCache[key];
    var col = Object.assign({}, BUILDING_PAL[0], BUILDING_PAL[frame] || {});
    var S = 56, D = 36, slices = [], i, mk, t, ww, dd;
    var wallW = 30, wallD = 16;
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, S/2, D/2, S-4, D-6, i % 2 ? shade(col.fence, 0.92) : col.fence, col.dark);
      box(mk.x, S/2, D/2 + 14, 9, 10, shade(col.fence, 0.65));
      if (i >= 2) {
        // fence posts
        box(mk.x, 8, D/2 - 6, 2, 2, shade(col.fence, 0.7));
        box(mk.x, S-8, D/2 - 6, 2, 2, shade(col.fence, 0.7));
        box(mk.x, 8, D/2 + 6, 2, 2, shade(col.fence, 0.7));
        box(mk.x, S-8, D/2 + 6, 2, 2, shade(col.fence, 0.7));
      }
      pushSlice(slices, mk, col.dark);
    }
    if (col.bush) {
      for (i = 0; i < 7; i++) {
        mk = makeCanvas(S, D);
        disc(mk.x, 9, D/2 + 9, 6.2 - i*0.25, 5, i > 3 ? '#8fbf45' : '#3e7a3a');
        disc(mk.x, S-9, D/2 + 9, 5.8 - i*0.2, 4.6, i > 4 ? '#b5d85a' : '#4a8a45');
        disc(mk.x, 11, D/2 + 7, 3.2, 2.6, '#5fa044');
        disc(mk.x, S-11, D/2 + 7, 3, 2.4, '#8fbf45');
        pushSlice(slices, mk, '#1e3d22');
      }
    }
    var wallN = col.stories === 2 ? 16 : 10;
    for (i = 0; i < wallN; i++) {
      mk = makeCanvas(S, D);
      var mid = col.stories === 2 && i === 8;
      box(mk.x, S/2, D/2, wallW, wallD, mid ? col.trim : (i % 2 ? col.wall : col.wall2), col.trim);
      var win = (col.stories === 2) ? (i >= 2 && i <= 5) || (i >= 10 && i <= 13) : (i >= 3 && i <= 7);
      if (win) {
        box(mk.x, S/2 - 8, D/2 - 1, 7, 6, col.window, col.dark);
        box(mk.x, S/2 + 8, D/2 - 1, 7, 6, col.window, col.dark);
        // mullion
        mk.x.fillStyle = col.trim;
        mk.x.fillRect(S/2 - 8, D/2 - 1, 1, 6);
        mk.x.fillRect(S/2 + 8, D/2 - 1, 1, 6);
      }
      if (i < 5) {
        box(mk.x, S/2, D/2 + 7, 7, 8, col.door, col.dark);
        if (i === 3) disc(mk.x, S/2 + 2, D/2 + 7, 0.7, 0.7, '#f0d25a');
      }
      pushSlice(slices, mk, col.dark);
    }
    var roofN = col.flat ? 5 : 11;
    for (i = 0; i < roofN; i++) {
      t = col.flat ? 0.15 : i / (roofN - 1);
      ww = wallW + 10 - t * 2;
      dd = col.flat ? wallD + 6 : Math.max(3, (wallD + 10) * (1 - t * 0.9));
      mk = makeCanvas(S, D);
      roofBox(mk.x, S/2, D/2, ww, dd, mix(col.roof, col.roofLt, t * 0.4), col.roofLt, col.dark);
      pushSlice(slices, mk, col.dark);
    }
    if (col.antenna) {
      for (i = 0; i < 5; i++) {
        mk = makeCanvas(S, D);
        box(mk.x, S/2 + 8, D/2, 1.6, 1.6, '#5a6570');
        pushSlice(slices, mk, col.dark);
      }
      mk = makeCanvas(S, D);
      box(mk.x, S/2 + 8, D/2, 8, 2, '#6a7080');
      pushSlice(slices, mk, col.dark);
    }
    if (col.awning) {
      // already used red roof as awning; a little extra lip
    }
    return (sliceCache[key] = slices);
  }

  var LOOKS = {
    hero: { cap: '#1e2a44', capW: '#f4f0e8', hair: '#1a1410', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#2a8a8a', shirtW: '#e8f4f0', pants: '#c4a45a', shoes: '#3a3028', accent: '#f4f0e8' },
    mother: { hair: '#5a3a28', bun: '#4a2e1e', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#f4ead8', apron: '#e07aa0', skirt: '#3a5a88', shoes: '#5a3a28' },
    dad: { hair: '#3a2a20', skin: '#e8b888', skinS: '#c89868', shirt: '#3a5a88', pants: '#2a3038', shoes: '#222' },
    girl: { hair: '#6b4a2e', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#e07aa0', pants: '#f0d25a', shoes: '#e07aa0' },
    boy: { hair: '#2a2018', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#4a8ac8', pants: '#3a4a5c', shoes: '#3a3028' },
    clerk: { hair: '#3a2a20', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#f4f0e8', pants: '#2a3038', shoes: '#222', apron: '#3a5a88' },
    cop: { hair: '#2a2018', skin: '#e8b888', skinS: '#c89868', shirt: '#3a4a70', pants: '#2a3038', shoes: '#222', cap: '#2a3038' }
  };

  function lookOf(who) {
    var id = (who && (who.id || who.kind || who.name)) || '';
    var t = String(id).toLowerCase();
    if (/mother|mama|okaasan|お母さん|母/.test(t)) return LOOKS.mother;
    if (/dad|papa|otousan|お父さん|父/.test(t)) return LOOKS.dad;
    if (/girl|musume|娘|女の子/.test(t)) return LOOKS.girl;
    if (/boy|musuko|息子|男の子/.test(t)) return LOOKS.boy;
    if (/clerk|tenin|店員|shop/.test(t)) return LOOKS.clerk;
    if (/cop|police|keikan|警官/.test(t)) return LOOKS.cop;
    if (who && who.kind === 'npc' && who.frame === 0) return LOOKS.mother;
    return LOOKS.hero;
  }

  function bodySlices(look, riding) {
    var S = 20, D = 16, slices = [], i, mk;
    var faceY = D/2 + 3; // front rim, so faces read from a high camera
    // shoes
    mk = makeCanvas(S, D);
    disc(mk.x, S/2 - 3.2, faceY - 1, 2.4, 2.0, look.shoes);
    disc(mk.x, S/2 + 3.2, faceY - 1, 2.4, 2.0, look.shoes);
    pushSlice(slices, mk, '#1a1410');
    mk = makeCanvas(S, D);
    disc(mk.x, S/2 - 3.2, faceY - 1, 2.2, 1.8, shade(look.shoes, 1.18));
    disc(mk.x, S/2 + 3.2, faceY - 1, 2.2, 1.8, shade(look.shoes, 1.18));
    pushSlice(slices, mk, '#1a1410');
    var bot = look.skirt || look.pants;
    for (i = 0; i < (look.skirt ? 4 : 5); i++) {
      mk = makeCanvas(S, D);
      if (look.skirt) {
        box(mk.x, S/2, D/2 + 1, 9 + (i < 2 ? 1.5 : 0), 8, i === 0 ? shade(bot, 0.85) : bot, shade(bot, 0.55));
      } else {
        box(mk.x, S/2 - 2.6, D/2 + 1, 3.6, 6.5, bot);
        box(mk.x, S/2 + 2.6, D/2 + 1, 3.6, 6.5, bot);
      }
      pushSlice(slices, mk, '#1a1410');
    }
    for (i = 0; i < 6; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, S/2, D/2 + 0.5, 10, 7.5, look.shirt, shade(look.shirt, 0.62));
      if (look.shirtW && i >= 2) box(mk.x, S/2, D/2 + 0.5, 6, 5, look.shirtW);
      if (look.apron) {
        box(mk.x, S/2, D/2 + 1.5, 7, 6, look.apron, shade(look.apron, 0.7));
        if (i >= 3) box(mk.x, S/2, D/2 - 1, 1.2, 5, shade(look.apron, 0.85));
      }
      disc(mk.x, S/2 - 6.2, D/2 + 2, 2.0, 2.0, look.skin);
      disc(mk.x, S/2 + 6.2, D/2 + 2, 2.0, 2.0, look.skin);
      pushSlice(slices, mk, '#1a1410');
    }
    mk = makeCanvas(S, D);
    disc(mk.x, S/2, faceY - 2, 2.2, 2.0, look.skinS || look.skin);
    pushSlice(slices, mk, '#1a1410');
    for (i = 0; i < 6; i++) {
      mk = makeCanvas(S, D);
      var r = i === 0 || i === 5 ? 4.4 : 5.4;
      disc(mk.x, S/2, D/2 + 0.4, r, r * 0.95, i === 0 ? (look.skinS || look.skin) : look.skin);
      // hair sits on the back / top of the head
      if (i >= 1) {
        disc(mk.x, S/2 - 4.0, D/2 - 0.8, 2.3, 2.6, look.hair);
        disc(mk.x, S/2 + 4.0, D/2 - 0.8, 2.3, 2.6, look.hair);
        disc(mk.x, S/2, D/2 - 2.8, 4.6, 2.6, look.hair);
        if (look.bun) disc(mk.x, S/2 + 3.6, D/2 - 3.8, 2.4, 2.4, look.bun);
      }
      if (i >= 2 && i <= 4) {
        // face on the front rim
        mk.x.fillStyle = '#1a1410';
        mk.x.fillRect(S/2 - 2.8, faceY - 1.2, 2.0, 2.0);
        mk.x.fillRect(S/2 + 0.8, faceY - 1.2, 2.0, 2.0);
        mk.x.fillStyle = '#fff';
        mk.x.fillRect(S/2 - 2.4, faceY - 1.2, 0.9, 0.9);
        mk.x.fillRect(S/2 + 1.2, faceY - 1.2, 0.9, 0.9);
        mk.x.fillStyle = '#e07aa0';
        mk.x.fillRect(S/2 - 3.8, faceY + 0.8, 1.6, 1.0);
        mk.x.fillRect(S/2 + 2.2, faceY + 0.8, 1.6, 1.0);
        mk.x.fillStyle = '#c47868';
        mk.x.fillRect(S/2 - 1.2, faceY + 1.6, 2.4, 1.0);
      }
      pushSlice(slices, mk, '#1a1410');
    }
    if (look.cap) {
      for (i = 0; i < 4; i++) {
        mk = makeCanvas(S, D);
        disc(mk.x, S/2, D/2 - 0.4, 5.6 - i * 0.25, 4.4 - i * 0.15, look.cap);
        if (i === 0) box(mk.x, S/2, faceY - 1, 9, 2.4, look.cap); // brim to the front
        if (look.capW && i >= 1) {
          box(mk.x, S/2, D/2, 6, 3, look.capW, look.cap);
          if (i >= 2) {
            mk.x.fillStyle = look.cap;
            mk.x.fillRect(S/2 - 1.6, D/2 - 1.2, 3.2, 0.8);
            mk.x.fillRect(S/2 - 0.5, D/2 - 1.6, 1.0, 3.2);
          }
        }
        pushSlice(slices, mk, '#1a1410');
      }
    } else {
      mk = makeCanvas(S, D);
      disc(mk.x, S/2, D/2 - 0.6, 4.8, 3.4, look.hair);
      if (look.bun) disc(mk.x, S/2 + 3.2, D/2 - 2, 2.3, 2.3, look.bun);
      pushSlice(slices, mk, '#1a1410');
    }
    return slices;
  }

  function scooterSlices() {
    if (sliceCache.scooter) return sliceCache.scooter;
    var W = 22, D = 12, slices = [], i, mk;
    for (i = 0; i < 2; i++) {
      mk = makeCanvas(W, D);
      disc(mk.x, 5, D/2, 2.6, 2.6, '#1c2024');
      disc(mk.x, W - 5, D/2, 2.6, 2.6, '#1c2024');
      disc(mk.x, 5, D/2, 1.1, 1.1, '#6a7278');
      disc(mk.x, W - 5, D/2, 1.1, 1.1, '#6a7278');
      pushSlice(slices, mk, '#111');
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, 14, 5, i < 2 ? '#2a8a9a' : '#4ec8d8');
      if (i >= 2) box(mk.x, W/2 + 2, D/2, 6, 3, '#e8f8fc');
      pushSlice(slices, mk, '#1c2024');
    }
    mk = makeCanvas(W, D);
    box(mk.x, W/2 + 5, D/2, 2, 5, '#2a3038');
    box(mk.x, W/2 + 5, D/2 - 2, 6, 2, '#2a3038');
    disc(mk.x, 5, D/2, 1.4, 1.4, '#7ee8f0');
    pushSlice(slices, mk, '#1c2024');
    return (sliceCache.scooter = slices);
  }

  function dogSlices() {
    if (sliceCache.dog) return sliceCache.dog;
    var S = 22, D = 12, slices = [], i, mk;
    // paws
    mk = makeCanvas(S, D);
    disc(mk.x, 6, D/2, 1.6, 1.4, '#3a2a18');
    disc(mk.x, 10, D/2, 1.6, 1.4, '#3a2a18');
    disc(mk.x, 14, D/2, 1.6, 1.4, '#3a2a18');
    disc(mk.x, 18, D/2, 1.6, 1.4, '#3a2a18');
    pushSlice(slices, mk, '#1a1410');
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, 8, D/2, 2.2, 2.2, '#c8a060');
      box(mk.x, 16, D/2, 2.2, 2.2, '#c8a060');
      pushSlice(slices, mk, '#1a1410');
    }
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, S/2 + 1, D/2, 8, 4.5, i % 2 ? '#e8c888' : '#d4b070');
      disc(mk.x, S/2 - 4, D/2, 3, 3, '#f0dcb0');
      pushSlice(slices, mk, '#3a2a18');
    }
    // head
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, 16, D/2, 4.2, 3.8, '#e8c888');
      if (i >= 1) {
        disc(mk.x, 16, D/2 + 1.4, 2.2, 1.6, '#f4ead8'); // muzzle
        disc(mk.x, 14.2, D/2 - 3.2, 1.6, 1.8, '#3a2a18'); // ear
        disc(mk.x, 18.2, D/2 - 3.2, 1.6, 1.8, '#3a2a18');
      }
      if (i === 2 || i === 3) {
        mk.x.fillStyle = '#1a1410';
        mk.x.fillRect(15, D/2 - 0.6, 1.2, 1.2);
        mk.x.fillRect(17.4, D/2 - 0.6, 1.2, 1.2);
        disc(mk.x, 16.8, D/2 + 1.4, 0.8, 0.7, '#1a1410');
      }
      pushSlice(slices, mk, '#3a2a18');
    }
    // tail tip
    mk = makeCanvas(S, D);
    disc(mk.x, 4, D/2, 1.6, 1.4, '#e8c888');
    pushSlice(slices, mk, '#3a2a18');
    return (sliceCache.dog = slices);
  }

  function catSlices() {
    if (sliceCache.cat) return sliceCache.cat;
    var S = 18, D = 10, slices = [], i, mk;
    mk = makeCanvas(S, D);
    disc(mk.x, 5, D/2, 1.2, 1.1, '#f4ead8');
    disc(mk.x, 8, D/2, 1.2, 1.1, '#f4ead8');
    disc(mk.x, 11, D/2, 1.2, 1.1, '#f4ead8');
    disc(mk.x, 14, D/2, 1.2, 1.1, '#f4ead8');
    pushSlice(slices, mk, '#c8a080');
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, 7, D/2, 1.8, 1.8, '#f4ead8');
      box(mk.x, 13, D/2, 1.8, 1.8, '#f4ead8');
      pushSlice(slices, mk, '#c8a080');
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, S/2, D/2, 6.5, 3.6, i % 2 ? '#fff6ea' : '#f4ead8');
      disc(mk.x, 6, D/2, 2, 2, '#e8c8a0');
      pushSlice(slices, mk, '#c8a080');
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, 13, D/2, 3.4, 3.2, '#fff6ea');
      if (i >= 1) {
        // ears
        mk.x.fillStyle = '#f4ead8';
        mk.x.beginPath(); mk.x.moveTo(11, D/2 - 1); mk.x.lineTo(12, D/2 - 4); mk.x.lineTo(13.2, D/2 - 1); mk.x.fill();
        mk.x.beginPath(); mk.x.moveTo(13.2, D/2 - 1); mk.x.lineTo(14.4, D/2 - 4); mk.x.lineTo(15.4, D/2 - 1); mk.x.fill();
      }
      if (i === 2) {
        mk.x.fillStyle = '#1a1410';
        mk.x.fillRect(12, D/2 - 0.4, 1, 1);
        mk.x.fillRect(14.2, D/2 - 0.4, 1, 1);
        disc(mk.x, 13.4, D/2 + 1, 0.6, 0.5, '#e07aa0');
      }
      pushSlice(slices, mk, '#c8a080');
    }
    mk = makeCanvas(S, D);
    disc(mk.x, 3, D/2, 1.2, 1, '#fff6ea');
    pushSlice(slices, mk, '#c8a080');
    return (sliceCache.cat = slices);
  }

  function isAnimal(who, kind) {
    var t = String((who && (who.id || who.kind || who.name || who.label)) || kind || '').toLowerCase();
    if (/shiba|dog|inu|犬|しば/.test(t)) return 'dog';
    if (/cat|neko|猫/.test(t)) return 'cat';
    return '';
  }

  function actorSlices(E, who, kind) {
    var animal = isAnimal(who, kind);
    if (animal === 'dog') return dogSlices();
    if (animal === 'cat') return catSlices();
    var look = kind === 'hero' ? LOOKS.hero : lookOf(who);
    var riding = kind === 'hero' && E && E.g && E.g.ride;
    var key = 'act2:' + kind + ':' + (who && (who.id || who.frame || 0)) + ':' + (look === LOOKS.hero ? 'h' : 'n') + ':' + (riding ? 1 : 0);
    if (sliceCache[key]) return sliceCache[key];
    var body = bodySlices(look, riding);
    if (!riding) return (sliceCache[key] = body);
    // scooter under the rider: wheels + deck first, then body
    var scoot = scooterSlices();
    var merged = scoot.slice(0, 4).concat(body).concat(scoot.slice(4));
    return (sliceCache[key] = merged);
  }

  function defaultPropSlices(E, rec) {
    var kind = rec && rec.kind;
    if (kind === 'tree') return treeSlices((rec.frame|0) || 0);
    if (kind === 'hedge' || kind === 'bush') return hedgeSlices();
    if (kind === 'flowers' || kind === 'flower' || kind === 'planter') return flowerSlices();
    if (kind === 'lamp' || kind === 'light' || kind === 'pole') return poleSlices(true);
    if (kind === 'signal' || kind === 'traffic') return signalSlices();
    if (kind === 'bench') return benchSlices();
    if (kind === 'sign' || kind === 'signboard' || kind === 'board') return signSlices();
    if (kind === 'vending' || kind === 'vendor') return vendingSlices();
    if (kind === 'bike' || kind === 'bicycle') return bikeSlices();
    if (kind === 'building' || kind === 'house' || kind === 'shop' || kind === 'home') {
      return buildingSlices(E, kind, (rec.frame|0) || 0);
    }
    return null;
  }

  function autoSliceSprite(img, fw, fh, opts) {
    opts = opts || {};
    var thin = !!opts.thin;
    var depth = Math.max(4, Math.round((thin ? fh * 0.28 : fh * 0.42)));
    var layers = Math.max(4, Math.min(thin ? 10 : 14, Math.round(depth * 0.7)));
    var slices = [];
    var i, mk, t, sy, sh;
    for (i = 0; i < layers; i++) {
      t = i / Math.max(1, layers - 1);
      sy = Math.round((1 - t) * (fh - 2));
      sh = Math.max(2, Math.round(fh * (thin ? 0.18 : 0.28)));
      mk = makeCanvas(fw, depth);
      mk.x.drawImage(img, 0, Math.max(0, sy - sh / 2), fw, sh, 0, 0, fw, depth);
      pushSlice(slices, mk, OUTLINE);
    }
    return slices;
  }

  function spriteSlices(E, rec, kind) {
    var key = 'spr:' + kind + ':' + ((rec && rec.frame)|0) + ':' + (rec && rec.id ? rec.id : '');
    if (sliceCache[key]) return sliceCache[key];
    var proc = defaultPropSlices(E, rec || { kind: kind });
    if (proc) return (sliceCache[key] = proc);
    // try to slice from the game's sprite sheet if present
    try {
      var sheet = null, fw, fh, col, row;
      if (kind === 'building' && E.buildings) { sheet = E.buildings; fw = 48; fh = 48; }
      if (kind === 'prop' && E.props) { sheet = E.props; fw = 48; fh = 48; }
      if (sheet && sheet.complete && sheet.naturalWidth) {
        var fr = (rec && rec.frame) | 0;
        col = fr % Math.max(1, Math.floor(sheet.naturalWidth / fw));
        row = Math.floor(fr / Math.max(1, Math.floor(sheet.naturalWidth / fw)));
        var tmp = makeCanvas(fw, fh);
        tmp.x.drawImage(sheet, col * fw, row * fh, fw, fh, 0, 0, fw, fh);
        var slices = autoSliceSprite(tmp.c, fw, fh, { thin: kind !== 'actor' });
        return (sliceCache[key] = slices);
      }
    } catch (_) {}
    // fallback crate
    var S = 16, slices = [], i, mk;
    for (i = 0; i < 8; i++) {
      mk = makeCanvas(S, S);
      box(mk.x, S/2, S/2, 12, 12, i > 5 ? '#8a6235' : '#6b4a2a', '#2a1a0c');
      pushSlice(slices, mk, '#2a1a0c');
    }
    return (sliceCache[key] = slices);
  }

  function mailboxSlices() {
    if (sliceCache.mailbox) return sliceCache.mailbox;
    var S = 14, D = 12, slices = [], i, mk;
    mk = makeCanvas(S, D);
    box(mk.x, S/2, D/2, 4, 4, '#6a7278');
    pushSlice(slices, mk, '#1c2024');
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, S/2, D/2, 2, 2, '#6a7278');
      pushSlice(slices, mk, '#1c2024');
    }
    for (i = 0; i < 8; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, S/2, D/2, 10, 8, i < 2 ? '#b01818' : '#e23a3a', '#6a1010');
      if (i >= 3 && i <= 5) box(mk.x, S/2, D/2 + 1, 6, 2, '#2a3038');
      if (i >= 6) box(mk.x, S/2, D/2 - 2, 8, 2, '#f0f0f0');
      pushSlice(slices, mk, '#4a1010');
    }
    mk = makeCanvas(S, D);
    box(mk.x, S/2, D/2, 11, 3, '#c01818');
    pushSlice(slices, mk, '#4a1010');
    return (sliceCache.mailbox = slices);
  }

  function busStopSlices() {
    if (sliceCache.busstop) return sliceCache.busstop;
    var W = 22, D = 10, slices = [], i, mk;
    for (i = 0; i < 12; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, 6, D/2, 2, 2, '#3a4248');
      box(mk.x, W - 6, D/2, 2, 2, '#3a4248');
      pushSlice(slices, mk, '#1c2024');
    }
    for (i = 0; i < 8; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, 18, 8, i === 0 || i === 7 ? '#2a6a8a' : '#e8f0f4', '#1c4050');
      if (i > 1 && i < 6) {
        mk.x.fillStyle = '#2a6a8a';
        mk.x.fillRect(5, 3, 12, 1);
        mk.x.fillRect(6, D - 4, 10, 1);
      }
      pushSlice(slices, mk, '#1c4050');
    }
    return (sliceCache.busstop = slices);
  }

  function carSlices() {
    if (sliceCache.car) return sliceCache.car;
    var W = 36, D = 18, slices = [], i, mk;
    for (i = 0; i < 2; i++) {
      mk = makeCanvas(W, D);
      disc(mk.x, 8, D/2, 3.2, 3.2, '#1c2024');
      disc(mk.x, W - 8, D/2, 3.2, 3.2, '#1c2024');
      pushSlice(slices, mk, '#111');
    }
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, 30, 14, i < 2 ? '#3a6ea5' : '#4a86c4', '#1c3048');
      disc(mk.x, 8, D/2, 3, 3, '#1c2024');
      disc(mk.x, W - 8, D/2, 3, 3, '#1c2024');
      if (i >= 3) {
        box(mk.x, 11, D/2, 6, 8, '#b8d8e8', '#2a4058');
        box(mk.x, 22, D/2, 8, 8, '#b8d8e8', '#2a4058');
      }
      pushSlice(slices, mk, '#1c3048');
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, 22 - i * 2, 12 - i, '#5a96d0', '#1c3048');
      box(mk.x, 13, D/2, 7, 8, '#c8e4f0', '#2a4058');
      box(mk.x, 22, D/2, 7, 8, '#c8e4f0', '#2a4058');
      pushSlice(slices, mk, '#1c3048');
    }
    return (sliceCache.car = slices);
  }

  function crowSlices() {
    if (sliceCache.crow) return sliceCache.crow;
    var S = 20, D = 12, slices = [], i, mk;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, 7, D/2, 2, 1.6, '#1a1a1c');
      disc(mk.x, 13, D/2, 2, 1.6, '#1a1a1c');
      pushSlice(slices, mk, '#000');
    }
    for (i = 0; i < 6; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, S/2, D/2, 7, 4.2, i < 2 ? '#1a1a1c' : '#2a2a30');
      if (i >= 3) disc(mk.x, 5, D/2, 4, 2.2, '#3a3a44'); // wing
      pushSlice(slices, mk, '#000');
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(S, D);
      disc(mk.x, 14, D/2, 3.4, 3, '#2a2a30');
      if (i >= 1) {
        mk.x.fillStyle = '#f0d25a';
        mk.x.fillRect(16, D/2, 3, 1.4);
        mk.x.fillStyle = '#eee';
        mk.x.fillRect(13, D/2 - 0.6, 1.2, 1.2);
      }
      pushSlice(slices, mk, '#000');
    }
    return (sliceCache.crow = slices);
  }

  function enemyVendingSlices() {
    if (sliceCache.evend) return sliceCache.evend;
    var W = 16, D = 12, slices = [], i, mk;
    mk = makeCanvas(W, D);
    box(mk.x, W/2, D/2, W-2, D-2, '#2a3038');
    pushSlice(slices, mk, '#111');
    for (i = 0; i < 14; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, W-2, D-2, i < 3 ? '#334d66' : '#8aa0b0', '#1c2028');
      if (i >= 4 && i <= 10) box(mk.x, W/2, D/2, 9, 7, '#6ec8e0', '#2a3038');
      if (i >= 8 && i <= 11) {
        // glitchy angry face
        mk.x.fillStyle = '#e23a3a';
        mk.x.fillRect(W/2 - 3, D/2 - 1, 2, 2);
        mk.x.fillRect(W/2 + 1, D/2 - 1, 2, 2);
      }
      pushSlice(slices, mk, '#1c2028');
    }
    return (sliceCache.evend = slices);
  }

  function popupSlices() {
    if (sliceCache.popup) return sliceCache.popup;
    var W = 20, D = 8, slices = [], i, mk;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, 14, 4, '#c8b8d0');
      pushSlice(slices, mk, '#3a2040');
    }
    for (i = 0; i < 8; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W/2, D/2, 18, 6, i === 0 ? '#594065' : '#f4ead8', '#3a2040');
      if (i >= 2 && i <= 5) {
        box(mk.x, W/2, D/2, 10, 2, '#bd867a');
        mk.x.fillStyle = '#e23a3a';
        mk.x.fillRect(W - 5, 1, 3, 2);
      }
      pushSlice(slices, mk, '#3a2040');
    }
    return (sliceCache.popup = slices);
  }

  function enemySlices(frame) {
    if (frame === 1) return crowSlices();
    if (frame === 3) return popupSlices();
    return enemyVendingSlices();
  }

  var LOOKS_BY_ID = {
    mother: LOOKS.mother,
    sister: { hair: '#6b4a2e', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#e9bb75', skirt: '#e07aa0', shoes: '#c47868' },
    grandpa: { hair: '#c8c0b0', skin: '#e8b888', skinS: '#c89868', shirt: '#91a58c', pants: '#5a5848', shoes: '#3a3028' },
    grandma: { hair: '#d2d7b3', bun: '#c8c0b0', skin: '#e8b888', skinS: '#c89868', shirt: '#f4ead8', skirt: '#d2d7b3', shoes: '#5a3a28' },
    clerk: LOOKS.clerk,
    worker: { hair: '#3a2a20', skin: '#e8b888', skinS: '#c89868', shirt: '#6a7a8a', pants: '#3a4248', shoes: '#222', cap: '#c45c4a' },
    student: { hair: '#3d2814', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#e8a0b0', skirt: '#4a5a88', shoes: '#e07aa0' },
    police: LOOKS.cop,
    delivery: { hair: '#3a2a20', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#c45c4a', pants: '#2a3038', shoes: '#222' },
    kid: { hair: '#2a2018', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#4a8ac8', pants: '#3a4a5c', shoes: '#c45c4a' },
    hacker: { hair: '#1a1410', skin: '#e8b888', skinS: '#c89868', shirt: '#3a3a48', pants: '#2a2a30', shoes: '#111' },
    shrine: { hair: '#1a1410', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#f4f0e8', skirt: '#c01818', shoes: '#1a1410' },
    musician: { hair: '#4a3020', skin: '#f0c8a0', skinS: '#d4a078', shirt: '#5a4a88', pants: '#2a3038', shoes: '#222' },
    repair: { hair: '#3a2a20', skin: '#e8b888', skinS: '#c89868', shirt: '#4a7a6a', pants: '#3a4248', shoes: '#222' }
  };

  function catSlicesBlack() {
    if (sliceCache.catblk) return sliceCache.catblk;
    var src = catSlices();
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var mk = makeCanvas(src[i].width, src[i].height);
      mk.x.drawImage(src[i], 0, 0);
      mk.x.globalCompositeOperation = 'multiply';
      mk.x.fillStyle = '#4a4038';
      mk.x.fillRect(0, 0, src[i].width, src[i].height);
      mk.x.globalCompositeOperation = 'source-over';
      out.push(mk.c);
    }
    return (sliceCache.catblk = out);
  }
  function actorSlices(kind, frame, id) {
    if (id === 'dog') return dogSlices();
    if (id === 'cat') return catSlicesBlack();
    if (kind === 'enemies') return enemySlices(frame);
    var ride = kind === 'hero_ride';
    var look = (kind === 'hero_walk' || kind === 'hero_ride') ? LOOKS.hero : (LOOKS_BY_ID[id] || lookOf({ id: id, kind: kind, frame: frame }));
    var key = 'act4:' + kind + ':' + id + ':' + (ride ? 1 : 0) + ':' + (look.shirt || '') + ':' + (look.cap || '');
    if (sliceCache[key]) return sliceCache[key];
    var body = bodySlices(look, ride);
    if (!ride) return (sliceCache[key] = body);
    var scoot = scooterSlices();
    return (sliceCache[key] = scoot.slice(0, 4).concat(body).concat(scoot.slice(4)));
  }

  function slicesFromSprite(E, kind, frame, flip, alt) {
    var f = alt || (flip ? (E.mirrorFrame ? E.mirrorFrame(kind, frame) : E.frameFor(kind, frame)) : E.frameFor(kind, frame));
    if (!f || !f.img) return null;
    var key = 'spr2:' + kind + ':' + frame + ':' + (flip ? 1 : 0) + ':' + (alt ? 'alt' : '0') + ':' + f.w + 'x' + f.h;
    if (sliceCache[key]) return sliceCache[key];
    try {
      var w = f.w, h = f.h;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(f.img, 0, 0);
      var data = cx.getImageData(0, 0, w, h).data;
      var top = h, bot = -1, y, x, i, a;
      var ranges = new Array(h);
      for (y = 0; y < h; y++) {
        var minx = w, maxx = -1;
        for (x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 24) {
            if (x < minx) minx = x;
            if (x > maxx) maxx = x;
          }
        }
        ranges[y] = maxx >= 0 ? [minx, maxx] : null;
        if (maxx >= 0) {
          if (y < top) top = y;
          if (y > bot) bot = y;
        }
      }
      if (bot < 0) return (sliceCache[key] = []);
      var contentH = bot - top + 1;
      var chubby = kind === 'hero_walk' || kind === 'hero_ride' || kind === 'npc' || kind === 'npc2' || kind === 'enemies' || kind === 'numberperson' || kind === 'ryosei';
      var n = Math.max(6, Math.min(chubby ? 16 : 12, Math.round(contentH / (chubby ? 4 : 5))));
      var slices = [];
      for (i = 0; i < n; i++) {
        var yEnd = bot - Math.floor(i * contentH / n);
        var yStart = bot - Math.floor((i + 1) * contentH / n) + 1;
        if (yStart < top) yStart = top;
        var xmin = w, xmax = -1, yy;
        for (yy = yStart; yy <= yEnd; yy++) {
          if (!ranges[yy]) continue;
          if (ranges[yy][0] < xmin) xmin = ranges[yy][0];
          if (ranges[yy][1] > xmax) xmax = ranges[yy][1];
        }
        if (xmax < 0) { slices.push(makeCanvas(4, 4).c); continue; }
        var rw = xmax - xmin + 1;
        var side = Math.max(8, rw);
        var depth = Math.max(chubby ? 8 : 3, Math.round(rw * (chubby ? 0.62 : 0.22)));
        var mk = makeCanvas(side + 2, depth + 2);
        var midY = (yStart + yEnd) >> 1;
        if (midY < 0) midY = yEnd;
        var rs = 0, gs = 0, bs = 0, cnt = 0;
        for (x = xmin; x <= xmax; x++) {
          a = (midY * w + x) * 4;
          if (data[a + 3] < 24) continue;
          rs += data[a]; gs += data[a + 1]; bs += data[a + 2]; cnt++;
        }
        var fill = cnt ? 'rgb(' + Math.round(rs / cnt) + ',' + Math.round(gs / cnt) + ',' + Math.round(bs / cnt) + ')' : '#888';
        var cx0 = mk.c.width / 2, cy0 = mk.c.height / 2;
        if (chubby) disc(mk.x, cx0, cy0, rw / 2, Math.max(2, depth / 2 - 1), fill);
        else box(mk.x, cx0, cy0, rw, Math.max(3, depth - 2), fill);
        for (x = xmin; x <= xmax; x++) {
          a = (midY * w + x) * 4;
          if (data[a + 3] < 24) continue;
          mk.x.fillStyle = 'rgba(' + data[a] + ',' + data[a + 1] + ',' + data[a + 2] + ',' + data[a + 3] / 255 + ')';
          mk.x.fillRect(Math.round(cx0 - rw / 2 + (x - xmin)), Math.round(cy0 + depth / 2 - 2), 1, 2);
        }
        pushSlice(slices, mk, OUTLINE);
      }
      return (sliceCache[key] = slices);
    } catch (_) {
      return (sliceCache[key] = null);
    }
  }

  function isTree(o) { return o.kind === 'props' && (o.frame === 0 || o.frame === 1) && /tree/i.test(o.id || ''); }
  function isHedge(o) { return o.kind === 'props' && o.frame === 2; }
  function isPole(o) { return o.kind === 'props' && (o.frame === 7 || o.frame === 5); }
  function isSignal(o) { return o.kind === 'props' && o.frame === 12; }
  function isBuilding(o) { return o.kind === 'buildings' || o.kind === 'neon' || o.kind === 'tower'; }
  function isSign(o) { return o.kind === 'props' && o.frame === 11; }
  function isBike(o) { return o.kind === 'props' && o.frame === 8; }
  function isCar(o) { return o.kind === 'props' && o.frame === 9; }
  function isBench(o) { return o.kind === 'props' && o.frame === 4; }
  function isVending(o) { return o.kind === 'props' && o.frame === 3; }
  function isFlower(o) { return o.kind === 'props' && o.frame === 10; }
  function isPost(o) { return o.kind === 'props' && o.frame === 6; }
  function isBus(o) { return o.kind === 'props' && o.frame === 13; }
  function isNekoProp(o) { return o.kind === 'props' && (o.frame === 15 || /neko|cat/i.test(o.id || '')); }
  function isActor(o) {
    return o.kind === 'hero_walk' || o.kind === 'hero_ride' || o.kind === 'npc' || o.kind === 'npc2' || o.kind === 'enemies' || o.kind === 'numberperson' || o.kind === 'ryosei';
  }

  function facingYaw(o, E) {
    if (o.id === 'hero') {
      var face = [Math.PI, -Math.PI / 2, Math.PI / 2, 0][E.g.dir] || 0;
      return angle - face;
    }
    return angle;
  }

  function slicesFor(E, o, alt) {
    if (isTree(o)) return treeSlices(o.frame);
    if (isHedge(o)) return hedgeSlices();
    if (isPole(o)) return poleSlices(o.frame === 5);
    if (isSignal(o)) return signalSlices();
    if (isSign(o)) return signSlices();
    if (isBike(o)) return bikeSlices();
    if (isCar(o)) return carSlices();
    if (isBench(o)) return benchSlices();
    if (isVending(o)) return vendingSlices();
    if (isFlower(o)) return flowerSlices();
    if (isPost(o)) return mailboxSlices();
    if (isBus(o)) return busStopSlices();
    if (isNekoProp(o)) return catSlices();
    if (isBuilding(o)) return buildingSlices(E, o.kind, o.frame);
    if (isActor(o)) return actorSlices(o.kind, o.frame, o.id);
    return slicesFromSprite(E, o.kind, o.frame, o.flip, alt);
  }

  var groundCache = { key: '', c: null, tick: 0 };

  function tileLetter(m, x, y) {
    if (!m.tiles) return m.outside ? '.' : ' ';
    var yy = Math.max(0, Math.min(m.h - 1, y));
    var row = m.tiles[yy];
    if (!row) return m.outside ? '.' : ' ';
    if (x < 0 || x >= m.w) return m.outside ? '.' : ' ';
    var tile = row[x] || (m.outside ? '.' : ' ');
    if (m.outside && (y < 0 || y >= m.h)) tile = '~:'.includes(tile) ? '.' : (tile || '.');
    return tile;
  }

  function paintGround(m, time) {
    var T = 16;
    var key = (m.name || '') + ':' + m.w + 'x' + m.h + ':' + (m.outside ? 1 : 0) + ':' + Math.floor((time || 0) / 400);
    if (groundCache.key === key && groundCache.c) return groundCache.c;
    var c = document.createElement('canvas');
    c.width = m.w * T;
    c.height = (m.h + (m.outside ? 4 : 0)) * T;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    var yOff = m.outside ? 2 * T : 0;
    var tx, ty, px, py, letter, n, col, edge;
    var y0 = m.outside ? -2 : 0, y1 = m.h + (m.outside ? 2 : 0);
    var GRASS = ['#5d8a70', '#6f9b7e', '#7eaa8a', '#86b48c', '#91b590', '#649575'];
    for (ty = y0; ty < y1; ty++) {
      for (tx = 0; tx < m.w; tx++) {
        letter = tileLetter(m, tx, ty);
        for (py = 0; py < T; py++) {
          for (px = 0; px < T; px++) {
            n = hash2(tx * T + px, ty * T + py + 17);
            if (m.outside) {
              if (letter === '~') {
                var wwave = Math.sin((px + ty * 3 + (time || 0) * 0.01) * 0.6) * 0.5 + 0.5;
                col = wwave > 0.7 ? '#8ab8b8' : (n > 0.85 ? '#6a9aaa' : (n > 0.4 ? '#537e8a' : '#3e6a78'));
              } else if (letter === ':') {
                col = n > 0.78 ? '#b8a878' : (n > 0.4 ? '#c9bb8c' : '#d8cc9a');
              } else if (letter === '=') {
                edge = px < 2 || px > T - 3 || py < 1 || py > T - 2;
                col = edge ? '#4a5c60' : (n > 0.82 ? '#7a8a88' : (n > 0.45 ? '#5e7275' : '#55686c'));
                if (px === Math.floor(T / 2) && (ty + Math.floor(py / 4)) % 2 === 0) col = '#d8c86a';
              } else if (letter === '#') {
                col = ((tx + ty) % 2 ? '#4d4766' : '#544d6e');
                if (n > 0.9) col = '#6a6480';
              } else if (letter === '+') {
                col = n > 0.84 ? '#a8ac8e' : (n > 0.5 ? '#c5c8a6' : '#d0d4b0');
                if (px === 0 || py === 0) col = '#b0b494';
              } else {
                col = GRASS[Math.floor(n * GRASS.length) % GRASS.length];
                if (n > 0.93) col = '#8fbf45';
                if (n < 0.06) col = '#4a7a58';
              }
            } else {
              if (letter === 'g') col = n > 0.5 ? '#132a42' : '#183350';
              else col = n > 0.7 ? '#a88868' : ((tx + ty) % 2 ? '#b69678' : '#c0a080');
            }
            x.fillStyle = col;
            x.fillRect(tx * T + px, ty * T + py + yOff, 1, 1);
          }
        }
      }
    }
    groundCache = { key: key, c: c, tick: time };
    return c;
  }

  function fillQuad(ctx, p0, p1, p2, p3, color) {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function collectDrawables(E) {
    var g = E.g, GAME_DATA = E.GAME_DATA, TILE = E.TILE;
    var m = GAME_DATA.maps[g.map];
    var drawables = m.objects.filter(function (o) { return !o.floor && !o.hidden && !E.gone(o); }).map(function (o) {
      return Object.assign({}, o, { foot: o.y * TILE });
    });
    if (!E.townCleared()) {
      (m.enemies || []).forEach(function (e) {
        if (g.defeated[e.id] > E.gameTime) return;
        var p = E.enemyPos(e);
        drawables.push({ id: e.id, kind: 'enemies', frame: GAME_DATA.enemies[e.type].frame, x: p.x / TILE, y: p.y / TILE, w: 56, h: 68, foot: p.y });
      });
    }
    drawables.push(Object.assign({
      id: 'hero',
      kind: E.heroKind(),
      frame: g.dir * 4 + (E.walk ? Math.floor(E.walk * 9) % 4 : 0),
      x: g.x / TILE,
      y: g.y / TILE,
      w: E.heroKind() === 'hero_ride' ? 60 : 50,
      h: E.heroKind() === 'hero_ride' ? 84 : 70,
      foot: g.y
    }, E.liftPose()));
    return drawables;
  }

  function altFrame(E, o) {
    if (o.kind === 'numberperson' && E.townCleared() && E.calmFaceFrame) return E.calmFaceFrame(o.kind, o.frame);
    if (o.coat != null && E.coatFrame) return E.coatFrame(o.kind, o.frame, o.coat, o.flip);
    if (o.roof != null && E.roofFrame) return E.roofFrame(o.kind, o.frame, o.roof, o.flip);
    return undefined;
  }

  function drawSoftShadow(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(28, 36, 28, 0.16)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y, w * 1.15, h * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 24, 18, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y, w * 0.78, h * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(16, 18, 14, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.45, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSky(ctx, W, H, hudTop, m) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    if (m.outside) {
      g.addColorStop(0, '#5a9cc8');
      g.addColorStop(0.22, '#8ec8e8');
      g.addColorStop(0.48, '#c8e4c8');
      g.addColorStop(0.7, '#9ec89a');
      g.addColorStop(1, '#6f9b7e');
    } else {
      g.addColorStop(0, '#2a3a3a');
      g.addColorStop(1, '#344f4d');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawVignette(ctx, W, H, playTop, playBot) {
    var g = ctx.createRadialGradient(W / 2, (playTop + playBot) * 0.52, H * 0.18, W / 2, (playTop + playBot) * 0.52, H * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(20,28,24,0.04)');
    g.addColorStop(1, 'rgba(16,22,28,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, playTop, W, Math.max(10, playBot - playTop));
  }

  function drawField() {
    if (!on) return false;
    var E = engine();
    if (!E || !E.g || E.g.screen !== 'field') return false;
    var g = E.g, m = E.GAME_DATA.maps[g.map];
    if (!m) return false;
    var ctx = E.ctx, W = E.W, H = E.H, TILE = E.TILE;
    ctx.imageSmoothingEnabled = false;
    if (E.gameTime >= (E.hudMeasureAt || 0)) E.measureHud();
    var hudTop = E.hudTop;
    var HUD_BOTTOM = E.HUD_BOTTOM;
    drawSky(ctx, W, H, hudTop, m);
    var band = H - hudTop - HUD_BOTTOM, mh = m.h * TILE;
    E.camera.x = m.w * TILE < W ? (m.w * TILE - W) / 2 : Math.max(0, Math.min(m.w * TILE - W, g.x - W / 2));
    E.camera.y = mh <= band ? (mh - band) / 2 - hudTop : Math.max(-hudTop + (m.outside ? 20 : -(E.ROOM_TOP_GAP || 12)), Math.min(mh - H + HUD_BOTTOM, g.y - hudTop - band * 0.55));

    var cx = W / 2;
    var cy = hudTop + band * 0.62;
    var playTop = Math.max(0, hudTop - 8);
    var playBot = H - HUD_BOTTOM + 20;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, playTop, W, Math.max(10, playBot - playTop));
    ctx.clip();
    ctx.imageSmoothingEnabled = false;

    // Ground: one textured canvas, same transform as worldToScreen
    var ground = paintGround(m, E.gameTime || 0);
    var GT = ground.width / m.w;
    var yOff = m.outside ? 2 * GT : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(ZOOM, squash * ZOOM);
    ctx.rotate(angle);
    ctx.drawImage(ground, -g.x, -g.y - (m.outside ? 2 * TILE : 0), m.w * TILE, ground.height * (TILE / GT));
    ctx.restore();

    (m.objects || []).forEach(function (o) {
      if (!o.floor || o.hidden) return;
      var hw = (o.w || 48) / 2, hh = (o.h || 48) / 4;
      var fx = o.x * TILE, fy = o.y * TILE;
      var q0 = worldToScreen(E, fx - hw, fy - hh, cx, cy);
      var q1 = worldToScreen(E, fx + hw, fy - hh, cx, cy);
      var q2 = worldToScreen(E, fx + hw, fy + hh, cx, cy);
      var q3 = worldToScreen(E, fx - hw, fy + hh, cx, cy);
      ctx.globalAlpha = 0.85;
      fillQuad(ctx, q0, q1, q2, q3, '#c4b89a');
      ctx.globalAlpha = 1;
    });

    if (!m.outside) {
      (m.portals || []).forEach(function (p) {
        var pos = E.plateAt(p);
        var s = worldToScreen(E, pos[0] * TILE, pos[1] * TILE, cx, cy);
        ctx.fillStyle = E.EXIT_PLATE || '#e7d29f';
        ctx.fillRect(Math.round(s.x - 28), Math.round(s.y - 14), 56, 28);
        ctx.fillStyle = '#2f423d';
        ctx.font = '700 22px "Hiragino Kaku Gothic ProN","Hiragino Sans",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.sign ? (E.signOf(p) || '↓') : '↓', s.x, s.y + 8);
        ctx.textAlign = 'left';
      });
    }

    var drawables = collectDrawables(E);
    if (E.setFieldMeta) E.setFieldMeta([], g.map, E.faceRows ? E.faceRows(drawables) : []);

    var items = [];
    drawables.forEach(function (o) {
      var scr = worldToScreen(E, o.x * TILE, o.foot, cx, cy);
      scr.x = Math.round(scr.x);
      scr.y = Math.round(scr.y);
      items.push({ o: o, scr: scr });
    });
    items.sort(function (a, b) {
      var d = a.scr.depth - b.scr.depth;
      if (Math.abs(d) < 0.4) {
        var ha = isBuilding(a.o) || isTree(a.o) ? 1 : 0;
        var hb = isBuilding(b.o) || isTree(b.o) ? 1 : 0;
        if (ha !== hb) return ha - hb;
        return String(a.o.id || '').localeCompare(String(b.o.id || ''));
      }
      return d;
    });

    var target = E.interactionTarget && E.interactionTarget();
    items.forEach(function (item) {
      var o = item.o, scr = item.scr;
      if (scr.x < -220 || scr.x > W + 220 || scr.y < playTop - 80 || scr.y > playBot + 220) return;
      var lift = o.lift || 0;
      var raise = o.raise || 0;
      var footY = scr.y - lift - raise;
      if (o.id === 'hero' && E.walk) footY -= Math.round(Math.abs(Math.sin(E.walk * Math.PI * 2)) * 3);
      var shadowW = isBuilding(o) ? Math.max(30, (o.w || 80) * 0.3) : isTree(o) ? 24 : isCar(o) ? 22 : isActor(o) ? 12 : 14;
      var shadowH = Math.max(4, shadowW * 0.32 * squash);
      var fog = 0;
      if (m.outside) fog = Math.max(0, Math.min(0.22, (scr.depth - 40) / 520));
      ctx.save();
      if (fog) ctx.globalAlpha = 1 - fog;
      drawSoftShadow(ctx, scr.x, scr.y - 1, shadowW, shadowH);

      var alt = altFrame(E, o);
      var slices = slicesFor(E, o, alt);
      var yaw = facingYaw(o, E);
      var targetW = 32, spacing = 0.95, sc = 1, usedH = 0;
      if (slices && slices.length) {
        var sliceW = 1;
        for (var si = 0; si < slices.length; si++) if (slices[si].width > sliceW) sliceW = slices[si].width;
        targetW = isBuilding(o) ? Math.max(72, (o.w || 160) * 0.44) : Math.min(o.w || 48, 72);
        if (isTree(o)) targetW = Math.max(64, Math.min(96, (o.w || 130) * 0.58));
        if (isHedge(o)) targetW = Math.max(44, Math.min(74, (o.w || 100) * 0.55));
        if (isPole(o) || isSignal(o)) targetW = 26;
        if (isSign(o)) targetW = Math.min(o.w || 80, 92);
        if (isBike(o)) targetW = 56;
        if (isCar(o)) targetW = 70;
        if (isBench(o)) targetW = Math.min(o.w || 90, 70);
        if (isVending(o) || isPost(o)) targetW = 28;
        if (isBus(o)) targetW = 44;
        if (isFlower(o)) targetW = 36;
        if (isNekoProp(o)) targetW = 36;
        if (isActor(o)) {
          if (o.id === 'dog' || o.id === 'cat') targetW = 40;
          else if (o.id === 'kid') targetW = 28;
          else if (o.kind === 'hero_ride') targetW = 44;
          else if (o.kind === 'enemies') targetW = o.frame === 1 ? 40 : 36;
          else targetW = 34;
        }
        sc = targetW / sliceW;
        var qsc = Math.round(sc * 2) / 2;
        if (Math.abs(qsc - sc) < 0.2 && qsc >= 1) sc = qsc;
        spacing = isBuilding(o) ? 1.2 : isTree(o) ? 1.15 : isSign(o) || isBus(o) ? 0.9 : 0.95;
        var targetH = isBuilding(o) ? 86 : isTree(o) ? 76 : isActor(o) ? (o.kind === 'hero_ride' ? 52 : (o.id === 'kid' ? 36 : 46)) : isPole(o) || isSignal(o) ? 62 : isCar(o) ? 22 : isBike(o) ? 12 : 0;
        if (isPost(o)) targetH = 28;
        if (isBus(o)) targetH = 36;
        if (isNekoProp(o) || (isActor(o) && (o.id === 'dog' || o.id === 'cat'))) targetH = 20;
        if (o.kind === 'enemies' && o.frame === 0) targetH = 40;
        if (targetH && slices.length) spacing = targetH / (slices.length * sc);
        usedH = slices.length * spacing * sc * squash;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(scr.x, footY);
        ctx.scale(sc, sc);
        drawStack(ctx, slices, 0, 0, yaw, spacing, 1);
        ctx.restore();
        if (isPole(o) && o.frame === 5) {
          ctx.fillStyle = 'rgba(255, 230, 140, 0.16)';
          ctx.beginPath();
          ctx.ellipse(scr.x, footY - usedH + 6, 16, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.kind === 'fan' && E.drawRoomFan) {
        E.drawRoomFan(scr.x, footY);
      } else {
        E.sprite(o.kind, o.frame, scr.x, footY, o.w, o.h, (g.mode === 'adult' && o.labelAdult || o.label), o.flip, alt);
      }

      var label = (g.mode === 'adult' && o.labelAdult) || o.label;
      if (label && (isBuilding(o) || (target && target.o && target.o.id === o.id))) {
        var top = footY - (usedH || (o.h || 40) * 0.55) - 4;
        ctx.font = '700 20px "Hiragino Kaku Gothic ProN","Hiragino Sans",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(23,55,57,0.85)';
        ctx.fillStyle = '#fff4d6';
        ctx.strokeText(label, scr.x, top - 6);
        ctx.fillText(label, scr.x, top - 6);
        ctx.textAlign = 'left';
      }
      if (o.sign && o.kind !== 'numberperson' && E.signOf) {
        var text = E.signOf(o);
        if (text) {
          ctx.font = '700 20px "Hiragino Kaku Gothic ProN","Hiragino Sans",system-ui,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#1f2a44e6';
          var tw = ctx.measureText(text).width + 16;
          ctx.fillRect(Math.round(scr.x - tw / 2), Math.round(footY - (usedH || (o.h || 80) * 0.55) - 22), tw, 26);
          ctx.fillStyle = '#fff4d6';
          ctx.fillText(text, scr.x, footY - (usedH || (o.h || 80) * 0.55) - 3);
          ctx.textAlign = 'left';
        }
      }
      ctx.restore();
    });

    drawVignette(ctx, W, H, playTop, playBot);
    ctx.restore();

    var shade = ctx.createLinearGradient(0, 0, 0, 230);
    shade.addColorStop(0, m.outside ? '#173739' : '#173739d9');
    shade.addColorStop(1, '#17373900');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, 230);

    if (E.stick) {
      E.ellipse(E.stick.x, E.stick.y, 55, 55, '#f9ecc437');
      E.ellipse(E.stick.x + E.stick.dx * 36, E.stick.y + E.stick.dy * 36, 22, 22, '#fff0c888');
    }
    if (E.drawRecruitFx) E.drawRecruitFx();
    if (E.updateHud) E.updateHud(m, target);
    return true;
  }

  function css() {
    if (document.getElementById('stack3d-css')) return;
    var s = document.createElement('style');
    s.id = 'stack3d-css';
    s.textContent = [
      '#stack3d-btn{min-width:70px;font-size:22px;padding:8px 10px;background:#244a50;color:#fff4d6;border:2px solid #91b5a5;border-radius:8px}',
      '#stack3d-btn.on{background:#d9a441;color:#1a2418;border-color:#f1cd7c}',
      '#stack3d-rot{position:absolute;right:16px;bottom:210px;display:flex;flex-direction:column;gap:8px;z-index:4}',
      '#stack3d-rot[hidden]{display:none !important}',
      '#stack3d-rot button{width:54px;height:54px;font-size:26px;background:#244a50cc;color:#fff4d6;border:2px solid #91b5a5;border-radius:8px}',
      '#stack3d-hint{position:absolute;right:16px;bottom:170px;color:#fff4d6;font-size:16px;text-shadow:1px 1px #173739;z-index:4;pointer-events:none}',
      '#stack3d-hint[hidden]{display:none !important}',
      '#stack3d-title{margin-top:12px;min-width:320px;font-size:24px;padding:12px;background:#10142a;color:#fff;border:2px solid #91b5a5;border-radius:8px}'
    ].join('');
    document.head.appendChild(s);
  }

  function bootUi() {
    css();
    var field = document.getElementById('screen-field');
    var hudRow = field && field.querySelector('.hud-row');
    if (hudRow && !document.getElementById('stack3d-btn')) {
      var btn = document.createElement('button');
      btn.id = 'stack3d-btn';
      btn.type = 'button';
      btn.textContent = '3D';
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        setEnabled(!on);
      });
      hudRow.appendChild(btn);
      ui.btn = btn;
    } else {
      ui.btn = document.getElementById('stack3d-btn');
    }
    if (field && !document.getElementById('stack3d-rot')) {
      var rot = document.createElement('div');
      rot.id = 'stack3d-rot';
      rot.hidden = true;
      rot.innerHTML = '<button type="button" data-dir="-1" aria-label="左に回す">◀</button><button type="button" data-dir="1" aria-label="右に回す">▶</button>';
      rot.addEventListener('pointerdown', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        rotateHold = Number(b.getAttribute('data-dir')) || 0;
      });
      var clear = function () { rotateHold = 0; };
      rot.addEventListener('pointerup', clear);
      rot.addEventListener('pointercancel', clear);
      rot.addEventListener('pointerleave', clear);
      field.appendChild(rot);
      ui.rot = rot;
      var hint = document.createElement('div');
      hint.id = 'stack3d-hint';
      hint.hidden = true;
      hint.textContent = 'Q・E で回す';
      field.appendChild(hint);
      ui.hint = hint;
    }
    var title = document.getElementById('title-actions');
    if (title && !document.getElementById('stack3d-title')) {
      var tbtn = document.createElement('button');
      tbtn.id = 'stack3d-title';
      tbtn.type = 'button';
      tbtn.textContent = '立体3Dで見る';
      tbtn.addEventListener('click', function (e) {
        e.stopPropagation();
        setEnabled(true);
        try {
          var u = new URL(location.href);
          u.searchParams.set('mode', '3d');
          history.replaceState(null, '', u);
        } catch (_) {}
      });
      title.appendChild(tbtn);
    }
    bindPointers();
    syncUi();
  }

  function bindPointers() {
    var Ewait = engine();
    var stage = (Ewait && Ewait.stage) || document.getElementById('stage');
    if (!stage || stage._stack3dBound) return;
    stage._stack3dBound = true;
    stage.addEventListener('pointerdown', function (e) {
      if (!on) return;
      var E = engine();
      if (!E || E.g.screen !== 'field' || e.target.closest('button,input,#stack3d-rot')) return;
      var b = stage.getBoundingClientRect();
      var y = (e.clientY - b.top) * E.H / b.height;
      var x = (e.clientX - b.left) * E.W / b.width;
      if (e.button === 2 || e.shiftKey || y < E.hudTop + 90) {
        e.stopImmediatePropagation();
        rotateDrag = { id: e.pointerId, lastX: x };
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }, true);
    stage.addEventListener('pointermove', function (e) {
      if (!rotateDrag || rotateDrag.id !== e.pointerId) return;
      var E = engine();
      if (!E) return;
      var b = stage.getBoundingClientRect();
      var x = (e.clientX - b.left) * E.W / b.width;
      angleTarget += (x - rotateDrag.lastX) * 0.01;
      rotateDrag.lastX = x;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
      stage.addEventListener(ev, function (e) {
        if (rotateDrag && rotateDrag.id === e.pointerId) rotateDrag = null;
      });
    });
    stage.addEventListener('contextmenu', function (e) {
      if (on) e.preventDefault();
    });
  }

  function tryPreviewWarp() {
    var q = qs();
    var map = q.get('map');
    if (!map) return;
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var loading = document.getElementById('loading');
      if (window.__v5 && loading && loading.hidden) {
        clearInterval(t);
        var x = parseFloat(q.get('x') || '6');
        var y = parseFloat(q.get('y') || '25.5');
        if (!isFinite(x)) x = 6;
        if (!isFinite(y)) y = 25.5;
        try { window.__v5.debugWarp(map, x, y); } catch (_) {}
      }
      if (tries > 200) clearInterval(t);
    }, 50);
  }

  on = readWanted();
  function boot() {
    bootUi();
    tryPreviewWarp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Stack3D = {
    drawField: drawField,
    aim: aim,
    tick: tick,
    drawStack: drawStack,
    get enabled() { return on; },
    setEnabled: setEnabled,
    get angle() { return angle; },
    setAngle: function (a) { angle = a; angleTarget = a; }
  };
})();
