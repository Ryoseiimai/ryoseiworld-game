// Sprite-stacking pseudo-3D for the RYOSEIWORLD field (opt-in).
// Off by default. Turn on with the 3D button, or open the page with ?mode=3d.
// Existing 2D drawing is unchanged when this is off.
(function () {
  'use strict';

  var STORAGE_KEY = 'ryoseiworld-v5-3d';
  var on = false;
  var angle = 0.42;
  var squash = 0.52;
  var rotateHold = 0;
  var rotateDrag = null;
  var lastTick = 0;
  var sliceCache = {};
  var colorCache = {};
  var ui = {};

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

  function drawStack(ctx, slices, x, y, yaw, spacing, sq) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    ctx.scale(1, sq);
    for (var i = 0; i < slices.length; i++) {
      var sl = slices[i];
      ctx.save();
      ctx.translate(0, -i * spacing);
      ctx.rotate(yaw);
      ctx.drawImage(sl, -sl.width / 2, -sl.height / 2);
      ctx.restore();
    }
    ctx.restore();
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
    x.ellipse(cx, cy, Math.max(0.6, rx), Math.max(0.6, ry), 0, 0, Math.PI * 2);
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
    x.fillStyle = fill;
    x.fillRect(left, top, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    if (stroke) {
      x.strokeStyle = stroke;
      x.lineWidth = 1;
      x.strokeRect(left + 0.5, top + 0.5, Math.max(1, Math.round(w) - 1), Math.max(1, Math.round(h) - 1));
    }
  }

  function worldToScreen(E, wx, wy, cx, cy) {
    var dx = wx - E.g.x, dy = wy - E.g.y;
    var c = Math.cos(angle), s = Math.sin(angle);
    var rx = dx * c - dy * s;
    var ry = dx * s + dy * c;
    var zoom = 0.78;
    return { x: cx + rx * zoom, y: cy + ry * squash * zoom, depth: ry };
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
    if (dir) angle += dir * 1.6 * dt;
  }

  function sampleColors(E, kind, frame) {
    var key = kind + ':' + frame;
    if (colorCache[key]) return colorCache[key];
    var f = E.frameFor(kind, frame);
    var out = { roof: '#4a5568', wall: '#e6d3b0', trim: '#7a5a3a', window: '#8ec4d4', door: '#6b4a2e', dark: '#2a3038', leaf: '#4a8a45', leafLite: '#8fbf45', trunk: '#6b4a2a', trunkDark: '#3d2814' };
    if (!f || !f.img) return (colorCache[key] = out);
    try {
      var w = f.w, h = f.h;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(f.img, 0, 0);
      var data = cx.getImageData(0, 0, w, h).data;
      function band(y0, y1) {
        var rs = 0, gs = 0, bs = 0, n = 0;
        var yStart = Math.floor(h * y0), yEnd = Math.floor(h * y1);
        for (var y = yStart; y < yEnd; y++) {
          for (var x = 0; x < w; x++) {
            var i = (y * w + x) * 4;
            if (data[i + 3] < 80) continue;
            rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
          }
        }
        if (!n) return null;
        return 'rgb(' + Math.round(rs / n) + ',' + Math.round(gs / n) + ',' + Math.round(bs / n) + ')';
      }
      out.roof = band(0.02, 0.28) || out.roof;
      out.wall = band(0.35, 0.7) || out.wall;
      out.trim = band(0.28, 0.38) || out.trim;
      out.door = band(0.72, 0.9) || out.door;
      out.window = band(0.4, 0.55) || out.window;
    } catch (_) {}
    return (colorCache[key] = out);
  }

  function treeSlices(frame) {
    var key = 'tree:' + frame;
    if (sliceCache[key]) return sliceCache[key];
    var S = 36;
    var slices = [];
    var tall = frame === 1;
    var i, t, r, col, mk;
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, S);
      r = 2.4 + i * 0.35;
      disc(mk.x, S / 2, S / 2, r, r * 0.9, i < 2 ? '#3d2814' : '#6b4a2a', '#2a1a0c');
      slices.push(mk.c);
    }
    var canopy = tall ? 20 : 17;
    for (i = 0; i < canopy; i++) {
      t = i / (canopy - 1);
      mk = makeCanvas(S, S);
      r = (tall ? 6 : 7) + Math.sin(t * Math.PI) * (tall ? 9 : 11);
      if (t > 0.85) r *= 0.7;
      col = t < 0.2 ? '#2d5a32' : t < 0.45 ? '#3e7a3a' : t < 0.7 ? '#5fa044' : '#8fbf45';
      disc(mk.x, S / 2, S / 2 + (0.5 - t) * 1.5, r, r * 0.95, col, '#1e3d22');
      if (t > 0.4 && t < 0.85) disc(mk.x, S / 2 - r * 0.25, S / 2 - r * 0.15, r * 0.35, r * 0.28, '#b5d85a');
      slices.push(mk.c);
    }
    return (sliceCache[key] = slices);
  }

  function hedgeSlices() {
    if (sliceCache.hedge) return sliceCache.hedge;
    var S = 28, slices = [], i, mk, r;
    for (i = 0; i < 10; i++) {
      mk = makeCanvas(S, S * 0.7);
      r = 8 + Math.sin((i / 9) * Math.PI) * 5;
      disc(mk.x, mk.c.width / 2, mk.c.height / 2, r * 1.4, r * 0.7, i < 2 ? '#2d5a32' : (i < 6 ? '#3e7a3a' : '#5fa044'), '#1e3d22');
      slices.push(mk.c);
    }
    return (sliceCache.hedge = slices);
  }

  function poleSlices(lit) {
    var key = 'pole:' + (lit ? 1 : 0);
    if (sliceCache[key]) return sliceCache[key];
    var S = 16, slices = [], i, mk;
    var n = lit ? 22 : 20;
    for (i = 0; i < n; i++) {
      mk = makeCanvas(S, S);
      if (lit && i >= n - 4) {
        disc(mk.x, S / 2, S / 2, 5 - (n - 1 - i) * 0.6, 5 - (n - 1 - i) * 0.6, i === n - 1 ? '#ffe08a' : '#d8cfa8', '#8a7a40');
      } else {
        disc(mk.x, S / 2, S / 2, i === 0 ? 2.4 : 1.6, i === 0 ? 2.4 : 1.6, '#3a4248', '#1c2024');
      }
      slices.push(mk.c);
    }
    return (sliceCache[key] = slices);
  }

  function signalSlices() {
    if (sliceCache.signal) return sliceCache.signal;
    var S = 22, slices = [], i, mk;
    for (i = 0; i < 16; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S / 2, S / 2, 1.7, 1.7, '#3a4248', '#1c2024');
      slices.push(mk.c);
    }
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, S);
      box(mk.x, S / 2, S / 2, 16, 6, '#2a3038', '#111');
      if (i === 2) {
        disc(mk.x, S / 2 - 5, S / 2, 1.8, 1.8, '#3d9a5a');
        disc(mk.x, S / 2, S / 2, 1.8, 1.8, '#8a7a20');
        disc(mk.x, S / 2 + 5, S / 2, 1.8, 1.8, '#8a3030');
      }
      slices.push(mk.c);
    }
    return (sliceCache.signal = slices);
  }


  var BUILDING_PAL = {
    0: { wall: '#efe0c6', roof: '#4a5568', door: '#6b4a2e', window: '#9ad0de', trim: '#d9c4a0', dark: '#2a3038' },
    1: { wall: '#f3f0ea', roof: '#c45c4a', door: '#5a3a28', window: '#7ec0d4', trim: '#d8c8b0', dark: '#2a3038' },
    2: { wall: '#e8d9b8', roof: '#6a5a48', door: '#5a3a28', window: '#8ec4d4', trim: '#c8b898', dark: '#2a3038' },
    3: { wall: '#d8e0e4', roof: '#3d4a5c', door: '#4a4a4a', window: '#8ec4d4', trim: '#b0b8c0', dark: '#2a3038' },
    4: { wall: '#4a5a88', roof: '#8b2e2e', door: '#2a3038', window: '#cfd8e8', trim: '#3a4a70', dark: '#1c2028' },
    5: { wall: '#e6d4b0', roof: '#5a4030', door: '#6b4a2e', window: '#8ec4d4', trim: '#c8b490', dark: '#2a3038' },
    6: { wall: '#d8c8b0', roof: '#6a5848', door: '#5a3a28', window: '#8ec4d4', trim: '#c0b098', dark: '#2a3038' },
    7: { wall: '#efe6d4', roof: '#6a3028', door: '#5a3a28', window: '#8ec4d4', trim: '#d0c4a8', dark: '#2a3038' },
    8: { wall: '#8a8070', roof: '#4a4038', door: '#3a3028', window: '#6a6058', trim: '#6a6058', dark: '#2a2820' }
  };

  function buildingSlices(E, kind, frame) {
    var key = 'b:' + kind + ':' + frame;
    if (sliceCache[key]) return sliceCache[key];
    var col = Object.assign({ wall: '#e6d3b0', roof: '#4a5568', door: '#6b4a2e', window: '#8ec4d4', trim: '#7a5a3a', dark: '#2a3038' }, BUILDING_PAL[frame] || {});
    var S = 48, D = 28;
    var slices = [];
    var i, mk, t, dd;
    for (i = 0; i < 2; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, S / 2, D / 2, S - 2, D - 4, '#8a8f8a', '#4a504c');
      slices.push(mk.c);
    }
    var wallN = 12;
    for (i = 0; i < wallN; i++) {
      mk = makeCanvas(S, D);
      box(mk.x, S / 2, D / 2, S - 4, D - 6, col.wall, col.trim);
      if (i >= 2 && i <= 5 || i >= 7 && i <= 10) {
        box(mk.x, S / 2 - 10, D / 2, 7, 6, col.window, col.dark);
        box(mk.x, S / 2 + 10, D / 2, 7, 6, col.window, col.dark);
      }
      if (i < 5) box(mk.x, S / 2, D / 2 + 8, 7, 8, col.door, col.dark);
      slices.push(mk.c);
    }
    var roofN = 9;
    for (i = 0; i < roofN; i++) {
      t = i / (roofN - 1);
      dd = Math.max(3, (D - 4) * (1 - t));
      mk = makeCanvas(S, D);
      box(mk.x, S / 2, D / 2, S - 2, dd, col.roof, col.dark);
      slices.push(mk.c);
    }
    return (sliceCache[key] = slices);
  }

  function actorSlices(kind, frame, id) {
    var key = 'act:' + kind + ':' + frame + ':' + (id || '');
    if (sliceCache[key]) return sliceCache[key];
    var shirts = { mother: '#d28972', sister: '#e9bb75', grandpa: '#91a58c', grandma: '#d2d7b3', worker: '#6a7a8a', student: '#e8a0b0', police: '#3a4a70', delivery: '#c45c4a' };
    var shirt = shirts[id] || ['#d28972', '#e9bb75', '#91a58c', '#d2d7b3', '#7a9ab0', '#c8b070'][(frame || 0) % 6];
    var hair = '#3d3c3b';
    var skin = '#f5c6a1';
    var pants = '#313e58';
    if (kind === 'hero_walk' || kind === 'hero_ride') {
      shirt = '#fff0bf';
      hair = '#3d3c3b';
    }
    if (kind === 'enemies') {
      shirt = '#4a5a48';
      hair = '#2a3028';
      skin = '#9aaa7a';
    }
    var S = 16, slices = [], i, mk;
    var ride = kind === 'hero_ride';
    if (ride) {
      for (i = 0; i < 2; i++) {
        mk = makeCanvas(24, 10);
        box(mk.x, 12, 5, 20, 6, '#4f6f86', '#2f3d48');
        disc(mk.x, 4, 5, 2, 2, '#22272b');
        disc(mk.x, 20, 5, 2, 2, '#22272b');
        slices.push(mk.c);
      }
    }
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, 6, S / 2, 2.2, 2.2, pants, '#1c2028');
      disc(mk.x, 10, S / 2, 2.2, 2.2, pants, '#1c2028');
      slices.push(mk.c);
    }
    for (i = 0; i < 5; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S / 2, S / 2, 5, 4, shirt, '#3d3c3b');
      slices.push(mk.c);
    }
    for (i = 0; i < 4; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S / 2, S / 2, 4.2, 3.8, i < 1 ? skin : hair, '#2a2824');
      if (i === 0) {
        disc(mk.x, S / 2 - 1.5, S / 2 + 0.5, 0.8, 0.8, '#273d40');
        disc(mk.x, S / 2 + 1.5, S / 2 + 0.5, 0.8, 0.8, '#273d40');
      }
      slices.push(mk.c);
    }
    return (sliceCache[key] = slices);
  }

  function slicesFromSprite(E, kind, frame, flip, alt) {
    var f = alt || (flip ? (E.mirrorFrame ? E.mirrorFrame(kind, frame) : E.frameFor(kind, frame)) : E.frameFor(kind, frame));
    if (!f || !f.img) return null;
    var key = 'spr:' + kind + ':' + frame + ':' + (flip ? 1 : 0) + ':' + (alt ? 'alt' : '0') + ':' + f.w + 'x' + f.h;
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
      var n = Math.max(8, Math.min(22, Math.round(contentH / 4)));
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
        if (xmax < 0) {
          slices.push(makeCanvas(4, 4).c);
          continue;
        }
        var rw = xmax - xmin + 1;
        var side = Math.max(8, rw);
        var chubby = kind === 'hero_walk' || kind === 'hero_ride' || kind === 'npc' || kind === 'npc2' || kind === 'enemies' || kind === 'numberperson' || kind === 'ryosei';
        var depth = Math.max(chubby ? 8 : 3, Math.round(rw * (chubby ? 0.68 : 0.2)));
        var mk = makeCanvas(side + 2, depth + 2);
        var midY = (yStart + yEnd) >> 1;
        if (midY < 0) midY = yEnd;
        // average color of the mid row
        var rs = 0, gs = 0, bs = 0, cnt = 0;
        for (x = xmin; x <= xmax; x++) {
          a = (midY * w + x) * 4;
          if (data[a + 3] < 24) continue;
          rs += data[a]; gs += data[a + 1]; bs += data[a + 2]; cnt++;
        }
        var fill = cnt ? 'rgb(' + Math.round(rs / cnt) + ',' + Math.round(gs / cnt) + ',' + Math.round(bs / cnt) + ')' : '#888';
        var cx0 = mk.c.width / 2, cy0 = mk.c.height / 2;
        disc(mk.x, cx0, cy0, rw / 2, Math.max(2, depth / 2 - 1), fill, 'rgba(20,20,20,0.45)');
        // paint the actual mid-row pixels along the south diameter (front)
        for (x = xmin; x <= xmax; x++) {
          a = (midY * w + x) * 4;
          if (data[a + 3] < 24) continue;
          mk.x.fillStyle = 'rgba(' + data[a] + ',' + data[a + 1] + ',' + data[a + 2] + ',' + data[a + 3] / 255 + ')';
          mk.x.fillRect(Math.round(cx0 - rw / 2 + (x - xmin)), Math.round(cy0 + depth / 2 - 2), 1, 2);
        }
        slices.push(mk.c);
      }
      return (sliceCache[key] = slices);
    } catch (_) {
      return (sliceCache[key] = null);
    }
  }


  function signSlices() {
    if (sliceCache.signboard) return sliceCache.signboard;
    var W = 36, D = 8, slices = [], i, mk;
    for (i = 0; i < 6; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, 8, D / 2, 2, 2, '#5a4630', '#2a2010');
      box(mk.x, W - 8, D / 2, 2, 2, '#5a4630', '#2a2010');
      slices.push(mk.c);
    }
    for (i = 0; i < 8; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W / 2, D / 2, W - 2, D - 2, i < 1 || i > 6 ? '#5a4630' : '#d8cfa8', '#3d2814');
      slices.push(mk.c);
    }
    return (sliceCache.signboard = slices);
  }

  function benchSlices() {
    if (sliceCache.bench) return sliceCache.bench;
    var W = 32, D = 12, slices = [], i, mk;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, 6, D / 2, 3, 3, '#6b4a2a', '#3d2814');
      box(mk.x, W - 6, D / 2, 3, 3, '#6b4a2a', '#3d2814');
      slices.push(mk.c);
    }
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W / 2, D / 2, W - 4, D - 3, '#8a6235', '#3d2814');
      slices.push(mk.c);
    }
    return (sliceCache.bench = slices);
  }

  function vendingSlices() {
    if (sliceCache.vending) return sliceCache.vending;
    var W = 16, D = 12, slices = [], i, mk;
    mk = makeCanvas(W, D);
    box(mk.x, W / 2, D / 2, W - 2, D - 2, '#2a3038', '#111');
    slices.push(mk.c);
    for (i = 0; i < 14; i++) {
      mk = makeCanvas(W, D);
      box(mk.x, W / 2, D / 2, W - 2, D - 2, i < 3 ? '#3a6ea5' : '#d8dce0', '#1c2024');
      if (i >= 4 && i <= 10) box(mk.x, W / 2, D / 2, 8, 6, '#8ec4d4', '#2a3038');
      slices.push(mk.c);
    }
    return (sliceCache.vending = slices);
  }

  function flowerSlices() {
    if (sliceCache.flowers) return sliceCache.flowers;
    var S = 22, slices = [], i, mk, t;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(S, S);
      disc(mk.x, S / 2, S / 2, 3, 3, '#4a7a38', '#2d5a32');
      slices.push(mk.c);
    }
    for (i = 0; i < 6; i++) {
      t = i / 5;
      mk = makeCanvas(S, S);
      disc(mk.x, S / 2, S / 2, 7 - t * 3, 6 - t * 2, t < 0.4 ? '#3e7a3a' : '#8fbf45', '#2d5a32');
      disc(mk.x, S / 2 - 3, S / 2, 2, 2, '#e07aa0');
      disc(mk.x, S / 2 + 3, S / 2 + 1, 2, 2, '#f0d25a');
      slices.push(mk.c);
    }
    return (sliceCache.flowers = slices);
  }

  function isTree(o) {
    return o.kind === 'props' && (o.frame === 0 || o.frame === 1) && /tree/i.test(o.id || '');
  }
  function isHedge(o) {
    return o.kind === 'props' && o.frame === 2;
  }
  function isPole(o) {
    return o.kind === 'props' && (o.frame === 7 || o.frame === 5);
  }
  function isSignal(o) {
    return o.kind === 'props' && o.frame === 12;
  }
  function isBuilding(o) {
    return o.kind === 'buildings' || o.kind === 'neon' || o.kind === 'tower';
  }
  function bikeSlices() {
    if (sliceCache.bike) return sliceCache.bike;
    var W = 28, D = 10, slices = [], i, mk;
    for (i = 0; i < 3; i++) {
      mk = makeCanvas(W, D);
      disc(mk.x, 6, D / 2, 3, 3, '#22272b', '#111');
      disc(mk.x, W - 6, D / 2, 3, 3, '#22272b', '#111');
      slices.push(mk.c);
    }
    mk = makeCanvas(W, D);
    box(mk.x, W / 2, D / 2, 18, 4, '#4f6f86', '#2f3d48');
    disc(mk.x, 6, D / 2, 3, 3, '#22272b');
    disc(mk.x, W - 6, D / 2, 3, 3, '#22272b');
    slices.push(mk.c);
    mk = makeCanvas(W, D);
    box(mk.x, W / 2 + 2, D / 2, 10, 2, '#2f3d48');
    slices.push(mk.c);
    return (sliceCache.bike = slices);
  }
  function isSign(o) { return o.kind === 'props' && o.frame === 11; }
  function isBike(o) { return o.kind === 'props' && (o.frame === 8 || o.frame === 9); }
  function isBench(o) { return o.kind === 'props' && o.frame === 4; }
  function isVending(o) { return o.kind === 'props' && o.frame === 3; }
  function isFlower(o) { return o.kind === 'props' && o.frame === 10; }
  function isActor(o) {
    return o.kind === 'hero_walk' || o.kind === 'hero_ride' || o.kind === 'npc' || o.kind === 'npc2' || o.kind === 'enemies' || o.kind === 'numberperson' || o.kind === 'ryosei';
  }

  function facingYaw(o, E) {
    if (o.id === 'hero') {
      // dir 0 down (+y), 1 left (-x), 2 right (+x), 3 up (-y)
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
    if (isBench(o)) return benchSlices();
    if (isVending(o)) return vendingSlices();
    if (isFlower(o)) return flowerSlices();
    if (isBuilding(o)) return buildingSlices(E, o.kind, o.frame);
    if (isActor(o)) return actorSlices(o.kind, o.frame, o.id);
    return slicesFromSprite(E, o.kind, o.frame, o.flip, alt);
  }

  function tileColor(m, x, y, E) {
    var T = function (tx, ty) { return m.tiles && m.tiles[Math.max(0, Math.min(m.h - 1, ty))] && m.tiles[Math.max(0, Math.min(m.h - 1, ty))][tx]; };
    if (m.outside) {
      var tile = T(x, y) || '.';
      if (y < 0 || y >= m.h) tile = '~:'.includes(tile) ? '.' : (tile || '.');
      if (tile === '~') return '#537e8a';
      if (tile === ':') return '#c9bb8c';
      if (tile === '=') return '#5e7275';
      if (tile === '#') return (x + y) % 2 ? '#4d4766' : '#544d6e';
      if (tile === '+') return '#c5c8a6';
      return (x + y) % 2 ? '#76a482' : '#7eaa8a';
    }
    if (m.tiles && m.tiles[y] && m.tiles[y][x] === 'g') return (x + y) % 2 ? '#132a42' : '#183350';
    return (x + y) % 2 ? '#b69678' : '#c0a080';
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

  function drawField() {
    if (!on) return false;
    var E = engine();
    if (!E || !E.g || E.g.screen !== 'field') return false;
    var g = E.g, m = E.GAME_DATA.maps[g.map];
    if (!m) return false;
    var ctx = E.ctx, W = E.W, H = E.H, TILE = E.TILE;
    if (E.gameTime >= (E.hudMeasureAt || 0)) E.measureHud();
    var hudTop = E.hudTop;
    var HUD_BOTTOM = E.HUD_BOTTOM;
    ctx.fillStyle = m.outside ? '#5d8a70' : '#344f4d';
    ctx.fillRect(0, 0, W, H);
    // Keep the 2D camera values updated so debug/API stay consistent.
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

    // Ground tiles
    var x, y, p0, p1, p2, p3, col;
    var x0 = 0, x1 = m.w, y0 = m.outside ? -2 : 0, y1 = m.h + (m.outside ? 2 : 0);
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        p0 = worldToScreen(E, x * TILE, y * TILE, cx, cy);
        p1 = worldToScreen(E, (x + 1) * TILE, y * TILE, cx, cy);
        p2 = worldToScreen(E, (x + 1) * TILE, (y + 1) * TILE, cx, cy);
        p3 = worldToScreen(E, x * TILE, (y + 1) * TILE, cx, cy);
        var xs = [p0.x, p1.x, p2.x, p3.x], ys = [p0.y, p1.y, p2.y, p3.y];
        if (Math.max.apply(null, xs) < -20 || Math.min.apply(null, xs) > W + 20 || Math.max.apply(null, ys) < playTop - 20 || Math.min.apply(null, ys) > playBot + 20) continue;
        fillQuad(ctx, p0, p1, p2, p3, tileColor(m, x, y, E));
      }
    }

    // Floor objects (rugs etc.) as flat quads under sprites
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
      items.push({ o: o, scr: scr });
    });
    items.sort(function (a, b) { return a.scr.depth - b.scr.depth; });

    var target = E.interactionTarget && E.interactionTarget();
    items.forEach(function (item) {
      var o = item.o, scr = item.scr;
      if (scr.x < -220 || scr.x > W + 220 || scr.y < playTop - 80 || scr.y > playBot + 220) return;
      var lift = o.lift || 0;
      var raise = o.raise || 0;
      var footY = scr.y - lift - raise;
      var shadowW = isBuilding(o) ? Math.max(28, (o.w || 80) * 0.28) : isTree(o) ? 22 : 14;
      ctx.fillStyle = '#274c4135';
      ctx.beginPath();
      ctx.ellipse(scr.x, scr.y - 2, shadowW, Math.max(4, shadowW * 0.28 * squash / 0.52), 0, 0, Math.PI * 2);
      ctx.fill();

      var alt = altFrame(E, o);
      var slices = slicesFor(E, o, alt);
      var yaw = facingYaw(o, E);
      if (slices && slices.length) {
        var sliceW = Math.max.apply(null, slices.map(function(sl){return sl.width;}));
        var targetW = isBuilding(o) ? Math.max(64, (o.w || 160) * 0.42) : Math.min(o.w || 48, 72);
        if (isTree(o)) targetW = Math.max(56, Math.min(88, (o.w || 130) * 0.55));
        if (isHedge(o)) targetW = Math.max(40, Math.min(70, (o.w || 100) * 0.55));
        if (isPole(o) || isSignal(o)) targetW = 28;
        if (isSign(o)) targetW = Math.min(o.w || 80, 90);
        if (isBike(o)) targetW = 56;
        if (isBench(o)) targetW = Math.min(o.w || 90, 70);
        if (isVending(o)) targetW = 28;
        if (isFlower(o)) targetW = 36;
        if (isActor(o)) targetW = o.kind === 'hero_ride' ? 40 : 32;
        var sc = targetW / sliceW;
        var spacing = isBuilding(o) ? 1.15 : isTree(o) ? 1.1 : isSign(o) ? 0.85 : 0.9;
        var targetH = isBuilding(o) ? 78 : isTree(o) ? 70 : isActor(o) ? (o.kind === 'hero_ride' ? 48 : 42) : isPole(o) || isSignal(o) ? 58 : isBike(o) ? 10 : 0;
        if (targetH && slices.length) spacing = targetH / (slices.length * sc);
        ctx.save();
        ctx.translate(scr.x, footY);
        ctx.scale(sc, sc);
        drawStack(ctx, slices, 0, 0, yaw, spacing, 1);
        ctx.restore();
      } else if (o.kind === 'fan' && E.drawRoomFan) {
        E.drawRoomFan(scr.x, footY);
      } else {
        // fallback to the flat sprite, unrotated, so nothing vanishes
        E.sprite(o.kind, o.frame, scr.x, footY, o.w, o.h, (g.mode === 'adult' && o.labelAdult || o.label), o.flip, alt);
      }

      var label = (g.mode === 'adult' && o.labelAdult) || o.label;
      if (label && (isBuilding(o) || (target && target.o && target.o.id === o.id))) {
        var top = footY - (slices ? slices.length * (isBuilding(o) ? 1.15 : 1) * (targetW / (slices[0] ? slices[0].width : 32)) * squash * 1.1 : (o.h || 40) * 0.6);
        ctx.font = '700 22px "Hiragino Kaku Gothic ProN","Hiragino Sans",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#173739';
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
          ctx.fillRect(Math.round(scr.x - tw / 2), Math.round(footY - (o.h || 80) * 0.55 - 22), tw, 26);
          ctx.fillStyle = '#fff4d6';
          ctx.fillText(text, scr.x, footY - (o.h || 80) * 0.55 - 3);
          ctx.textAlign = 'left';
        }
      }
    });

    ctx.restore();

    // Top shade like the 2D field, so the HUD stays readable
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
      angle += (x - rotateDrag.lastX) * 0.01;
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
    setAngle: function (a) { angle = a; }
  };
})();
