/* R43: RYW.Proto.open({ mode, state, onDone, platform, rect, learn, aiName }).
 * rect: viewport CSS pixels { x, y, width, height } (w/h also accepted).
 * close() cancels without onDone; state is a normalized, session-owned object.
 * _sim is for Node verification only. No assets, storage or network required.
 */
(function (root) {
  'use strict';
  var RYW = root.RYW = root.RYW || {};
  var hasDOM = typeof document !== 'undefined' && !!document.createElement;
  var W = 540, H = 960, FLOOR = 390, CEILING = 210, SIZE = 32;
  var X = 104, SPEED = 280, GRAVITY = 1000, TICK = 1 / 240, CYCLE = 8;
  var VALUES = [3, 6, 9], MODES = ['lesson', 'play', 'playtest', 'sprite', 'text', 'deploy'];
  var current = null, platforms = new WeakMap();

  function normalize(s) {
    s = s || {};
    return { v: Number.isInteger(s.v) && s.v > 0 ? s.v : 1,
      jump: VALUES.indexOf(s.jump) >= 0 ? s.jump : 6,
      sprite: [0, 1, 2].indexOf(s.sprite) >= 0 ? s.sprite : 0,
      title: s.title === 'en' ? 'en' : 'ja', deployed: s.deployed === true };
  }
  function createWorld(state) {
    return { state: state, t: 0, carry: 0, y: FLOOR - SIZE, vy: 0,
      bugs: [0, 1.9, 3.8, 5.7].map(function (at) { return { at: at, x: W, passed: false }; }),
      avoided: 0, hitBug: false, hitCeiling: false, cleared: false, hitLeft: 0, over: false,
      jumps: 0, maxHeight: 0 };
  }
  function jump(w) {
    if (w.over || w.hitLeft > 0 || w.vy !== 0 || w.y < FLOOR - SIZE - 0.01) return false;
    w.vy = -w.state.jump * 70; w.jumps++;
    return true;
  }
  function shouldJump(w) {
    return w.bugs.some(function (b) { return !b.passed && w.t >= b.at && b.x > X + SIZE && b.x <= X + 130; });
  }
  function tick(w, auto, onJump) {
    if (w.over) return;
    if (auto && shouldJump(w) && jump(w) && onJump) onJump();
    w.t += TICK;
    // Fixed small ticks preserve both collision timing and jump height at any display rate.
    w.y += w.vy * TICK + GRAVITY * TICK * TICK / 2;
    w.vy += GRAVITY * TICK;
    if (w.y < CEILING) {
      w.y = CEILING; w.vy = Math.abs(w.vy) * 0.2;
      if (!w.hitCeiling) { w.hitCeiling = true; w.hitLeft = 0.5; }
    }
    if (w.y >= FLOOR - SIZE) { w.y = FLOOR - SIZE; w.vy = 0; }
    w.maxHeight = Math.max(w.maxHeight, FLOOR - SIZE - w.y);
    w.bugs.forEach(function (b) {
      b.x = W - Math.max(0, w.t - b.at) * SPEED;
      if (w.t < b.at || b.passed || w.hitLeft > 0) return;
      if (b.x < X + SIZE && b.x + 30 > X && w.y + SIZE > FLOOR - 34) {
        w.hitBug = true; w.hitLeft = 0.5;
      } else if (b.x + 30 <= X) { b.passed = true; w.avoided++; }
    });
    if (w.hitLeft > 0) {
      // Keep falling after a ceiling hit, then restart half a second later.
      w.hitLeft = Math.max(0, w.hitLeft - TICK);
      if (w.hitLeft < 1e-9) w.over = true;
    } else if (w.t >= CYCLE - 1e-9) {
      w.cleared = !w.hitBug && !w.hitCeiling && w.avoided === w.bugs.length;
      w.over = true;
    }
  }
  function step(w, dt, auto, onJump) {
    if (!Number.isFinite(dt) || dt <= 0 || w.over) return;
    w.carry += dt;
    while (w.carry >= TICK - 1e-10 && !w.over) {
      w.carry -= TICK; tick(w, auto, onJump);
    }
  }
  function runCycle(state, dt) {
    var w = createWorld(normalize(state));
    while (!w.over) step(w, dt || 1 / 60, true);
    return { cleared: w.cleared, hitBug: w.hitBug, hitCeiling: w.hitCeiling };
  }
  function createSession(cfg) {
    cfg = cfg || {};
    var s = { cfg: cfg, state: normalize(cfg.state), mode: MODES.indexOf(cfg.mode) >= 0 ? cfg.mode : 'lesson',
      history: [], undoLearned: false, elapsed: 0, closed: false, praise: 0, paused: false,
      running: false, press: 0 };
    s.world = createWorld(s.state);
    s.restart = function () {
      if (!s.closed) { s.world = createWorld(s.state); s.praise = 0; s.running = false; s.press = 0; }
    };
    s.run = function () { if (!s.closed && s.mode === 'lesson') { s.restart(); s.running = true; } };
    s.onJump = function () { if (s.mode === 'playtest') s.press = 0.25; if (s.sound) s.sound(); };
    s.setJump = function (n) {
      if (s.closed || VALUES.indexOf(n) < 0 || n === s.state.jump) return;
      s.history.push(s.state.jump); s.state.jump = n; s.restart();
    };
    s.undo = function () {
      if (s.closed) return;
      if (!s.undoLearned) { s.undoLearned = true; if (typeof cfg.learn === 'function') cfg.learn('undo'); }
      if (s.history.length) { s.state.jump = s.history.pop(); s.restart(); }
    };
    s.close = function () { if (s.closed) return; s.closed = true; if (s.cleanup) s.cleanup(); };
    s.finish = function () {
      if (s.closed) return;
      var result = normalize(s.state); s.close();
      if (typeof cfg.onDone === 'function') cfg.onDone(result);
    };
    s.advance = function (dt, auto) {
      if (s.closed || s.paused || !Number.isFinite(dt) || dt <= 0) return;
      if (s.mode === 'playtest') dt = Math.min(dt, Math.max(0, 2 - s.elapsed));
      s.elapsed += dt; s.praise = Math.max(0, s.praise - dt); s.press = Math.max(0, s.press - dt);
      step(s.world, dt, s.mode === 'playtest' || s.running || auto, s.onJump);
      if (s.world.over) {
        if (s.world.cleared && s.state.jump === 6) s.praise = 2.5;
        var remainder = s.world.carry;
        s.running = false;
        s.world = createWorld(s.state);
        if (remainder > 0) step(s.world, remainder, s.mode === 'playtest' || auto, s.onJump);
      }
      if (s.mode === 'playtest' && s.elapsed >= 2 - 1e-9) s.finish();
    };
    s.handle = { close: s.close, state: s.state };
    if (s.mode === 'lesson' && typeof cfg.learn === 'function') { cfg.learn('prototype'); cfg.learn('hensuu'); }
    return s;
  }

  function open(cfg) {
    if (current) current.close();
    var s = createSession(cfg); current = s;
    if (hasDOM) mount(s);
    else if (['sprite', 'text', 'deploy'].indexOf(s.mode) >= 0) s.finish();
    return s.handle;
  }
  RYW.Proto = { open: open, _sim: { normalize: normalize, createWorld: createWorld,
    step: step, jump: jump, runCycle: runCycle, createSession: createSession } };
  if (typeof module === 'object' && module.exports) module.exports = RYW.Proto;
  if (!hasDOM) return;

  var FONT = '"Hiragino Maru Gothic ProN","Hiragino Sans",system-ui,sans-serif';
  function mount(s) {
    var cfg = s.cfg, pf = cfg.platform, oldFocus = document.activeElement;
    var host = document.createElement('div'), stage = document.createElement('div');
    host.className = 'ryw-proto';
    host.style.cssText = 'position:fixed;inset:0;z-index:12000;overflow:hidden;pointer-events:none;';
    if (!cfg.rect) host.style.background = '#0a1220';
    stage.style.cssText = 'position:absolute;width:540px;height:960px;transform-origin:0 0;pointer-events:auto;background:#101e30;color:#fff5d6;overflow:hidden;';
    stage.style.fontFamily = FONT;
    host.appendChild(stage); document.body.appendChild(host);
    var style = document.createElement('style');
    style.textContent = '.ryw-proto button{box-sizing:border-box;font-family:inherit;font-size:26px;font-weight:700;color:#fff5d6;background:#244a50;border:2px solid #91b5a5;border-radius:12px;cursor:pointer;touch-action:manipulation}.ryw-proto button:focus-visible{outline:4px solid #fff;outline-offset:3px}.ryw-proto button:disabled{opacity:.45;cursor:default}.ryw-proto .rp-glow{box-shadow:0 0 30px #ffe29a;background:#f1cd7c;color:#213f42}';
    host.appendChild(style);
    var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'position:absolute;inset:0;width:540px;height:960px;pointer-events:none;';
    canvas.setAttribute('aria-hidden', 'true'); stage.appendChild(canvas);
    var ctx = canvas.getContext('2d'), rs = 1, raf = 0, last = null;
    var ac = null, audioOn = true, muted = null, removers = [], buttons = {};
    var stub = ['sprite', 'text', 'deploy'].indexOf(s.mode) >= 0;
    // sprite/text/deploy are short one-screen upgrades to the v6.3 prototype, not the minigame.
    var up = { phase: 'ask', timer: 0, feedbackIdx: 0 };
    var FEEDBACK = [
      { who: 'まちの こども', text: 'ジャンプ きもちいい！' },
      { who: 'はちまきの おじさん', text: 'もう いちど あそびたいな' },
      { who: 'ハッカーの おねえさん', text: 'てんじょうに ぶつかって わらった' }
    ];
    function bumpVersion() {
      s.state.v = s.state.v + 1;
      if (typeof cfg.learn === 'function') cfg.learn('version');
    }
    function pickSprite(idx) {
      if (up.phase !== 'ask') return;
      s.state.sprite = idx; bumpVersion(); up.phase = 'done'; sound();
    }
    function pickTitle(key) {
      if (up.phase !== 'ask') return;
      s.state.title = key; bumpVersion(); up.phase = 'done'; sound();
    }
    function sendDeploy() {
      if (up.phase !== 'ask') return;
      s.state.deployed = true; up.phase = 'sending'; up.timer = 0;
      if (typeof cfg.learn === 'function') cfg.learn('deploy');
      sound();
    }
    function nextFeedback() {
      if (up.phase !== 'feedback') return;
      up.feedbackIdx++;
      if (up.feedbackIdx >= FEEDBACK.length) { bumpVersion(); up.phase = 'done'; } else sound();
    }
    function listen(el, event, fn, capture) {
      el.addEventListener(event, fn, capture);
      removers.push(function () { el.removeEventListener(event, fn, capture); });
    }
    function button(id, text, x, y, w, h, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      b.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;';
      listen(b, 'click', function (e) { e.stopPropagation(); if (!s.paused) { fn(); draw(); } });
      stage.appendChild(b); buttons[id] = b; return b;
    }
    function allowed() {
      try { return !s.closed && !s.paused && audioOn && (!pf || typeof pf.isAudioEnabled !== 'function' || !!pf.isAudioEnabled()); }
      catch (_) { return false; }
    }
    function sound() {
      if (!allowed()) return;
      try {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        if (!ac) ac = new AC();
        if (ac.state === 'suspended') ac.resume().catch(function () {});
        var o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime;
        o.type = 'square'; o.frequency.setValueAtTime(660, now);
        o.frequency.exponentialRampToValueAtTime(1100, now + 0.09);
        g.gain.setValueAtTime(0.045, now); g.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
        o.connect(g); g.connect(ac.destination); o.start(now); o.stop(now + 0.13);
        o.onended = function () { o.disconnect(); g.disconnect(); };
      } catch (_) { /* Audio can be unavailable until the first gesture. */ }
    }
    s.sound = sound;
    function doJump() { if (!s.paused && !s.running && jump(s.world)) sound(); }
    if (!stub && s.mode !== 'playtest') {
      var field = button('jump', '', 0, 0, W, 480, doJump);
      field.style.cssText += 'background:transparent;border:0;border-radius:0;';
      field.setAttribute('aria-label', 'おすと ジャンプ');
    }
    if (s.mode === 'lesson') {
      button('less', '◀', 240, 553, 60, 64, function () { s.setJump(VALUES[Math.max(0, VALUES.indexOf(s.state.jump) - 1)]); });
      buttons.less.setAttribute('aria-label', 'ジャンプを ひくく');
      button('more', '▶', 380, 553, 60, 64, function () { s.setJump(VALUES[Math.min(2, VALUES.indexOf(s.state.jump) + 1)]); });
      buttons.more.setAttribute('aria-label', 'ジャンプを たかく');
      button('run', '▶ じっこう', 30, 686, 225, 72, s.run);
      button('undo', '↩ アンドゥ', 285, 686, 225, 72, s.undo);
      button('done', 'できた', 110, 812, 320, 80, s.finish);
    } else if (s.mode === 'play') button('done', 'もどる', 110, 812, 320, 80, s.finish);
    else if (s.mode === 'sprite') {
      button('pickA', 'これにする', 50, 560, 200, 80, function () { pickSprite(1); });
      button('pickB', 'これにする', 290, 560, 200, 80, function () { pickSprite(2); });
      button('up-done', 'できた', 110, 760, 320, 80, s.finish);
    } else if (s.mode === 'text') {
      button('pickJa', 'このままで', 50, 560, 200, 80, function () { pickTitle('ja'); });
      button('pickEn', 'えいごに する', 290, 560, 200, 80, function () { pickTitle('en'); });
      button('up-done', 'できた', 110, 760, 320, 80, s.finish);
    } else if (s.mode === 'deploy') {
      button('send', 'さくひんだな へ おくる', 110, 640, 320, 80, sendDeploy);
      button('next', 'つぎへ', 110, 700, 320, 80, nextFeedback);
      button('up-done', 'できた', 110, 760, 320, 80, s.finish);
    }

    function resize() {
      var r = cfg.rect || {}, iw = r.width || r.w || root.innerWidth || W, ih = r.height || r.h || root.innerHeight || H;
      var x = r.x == null ? (r.left || 0) : r.x, y = r.y == null ? (r.top || 0) : r.y;
      var scale = Math.min(iw / W, ih / H);
      stage.style.transform = 'translate(' + (x + (iw - W * scale) / 2) + 'px,' + (y + (ih - H * scale) / 2) + 'px) scale(' + scale + ')';
      rs = (root.devicePixelRatio || 1) * scale > 1.2 ? 2 : 1;
      canvas.width = W * rs; canvas.height = H * rs; draw();
    }
    function text(str, x, y, color, size, align) {
      ctx.font = '700 ' + (size || 24) + 'px ' + FONT;
      ctx.fillStyle = color || '#fff5d6'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
    }
    function show(id, visible) { if (buttons[id]) buttons[id].style.display = visible ? '' : 'none'; }
    function drawSpritePreview(x, idx) {
      ctx.fillStyle = ['#fff9e8', '#77d8f4', '#f7acdb'][idx]; ctx.fillRect(x - 24, 460, 48, 48);
      ctx.fillStyle = '#132737'; ctx.fillRect(x - 11, 478, 6, 8); ctx.fillRect(x + 5, 478, 6, 8);
    }
    function drawUp() {
      if (buttons['up-done']) buttons['up-done'].className = up.phase === 'done' ? 'rp-glow' : '';
      if (s.mode === 'sprite') {
        show('pickA', up.phase === 'ask'); show('pickB', up.phase === 'ask'); show('up-done', up.phase === 'done');
        if (up.phase === 'ask') {
          text('どっちの えに する？', 270, 380, '#b9cadc');
          drawSpritePreview(150, 1); drawSpritePreview(390, 2);
        } else { text('この えに なった！', 270, 380, '#b9cadc'); drawSpritePreview(270, s.state.sprite);
          text('はじめて つくった ゲーム v' + s.state.v + ' に なった！', 270, 650, '#ffe29a', 26); }
      } else if (s.mode === 'text') {
        show('pickJa', up.phase === 'ask'); show('pickEn', up.phase === 'ask'); show('up-done', up.phase === 'done');
        text('タイトルを えいごに できるよ', 270, 380, '#b9cadc');
        if (up.phase === 'done') {
          text(s.state.title === 'en' ? 'My First Game' : 'はじめての ゲーム', 270, 440, '#ffe29a', 30);
          text('はじめて つくった ゲーム v' + s.state.v + ' に なった！', 270, 650, '#ffe29a', 26);
        }
      } else if (s.mode === 'deploy') {
        show('send', up.phase === 'ask'); show('next', up.phase === 'feedback'); show('up-done', up.phase === 'done');
        if (up.phase === 'ask') text('まちの さくひんだな へ おくろう', 270, 440, '#b9cadc');
        else if (up.phase === 'sending') text('おくって いる……', 270, 440, '#b9cadc');
        else if (up.phase === 'feedback') {
          var f = FEEDBACK[up.feedbackIdx];
          text(f.who, 270, 410, '#b9e8df', 24); text(f.text, 270, 450, '#ffe29a', 28);
        } else text('はじめて つくった ゲーム v' + s.state.v + ' に なった！', 270, 440, '#ffe29a', 26);
      }
    }
    function draw() {
      if (s.closed) return;
      var w = s.world;
      ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.fillStyle = '#101e30'; ctx.fillRect(0, 0, W, H);
      text(s.state.title === 'en' ? 'My First Game' : 'はじめての ゲーム', 270, 44, '#ffe29a', 30);
      if (stub) { drawUp(); return; }
      text('よけた ' + w.avoided, 30, 99, '#b9e8df', 24, 'left');
      text('あと ' + Math.max(0, Math.ceil(CYCLE - w.t)) + 'びょう', 510, 99, '#b9e8df', 24, 'right');
      ctx.fillStyle = '#4b7381'; ctx.fillRect(24, CEILING - 3, 492, 3);
      text('てんじょう', 24, CEILING + 24, '#b9cadc', 24, 'left');
      ctx.fillStyle = '#3b6570'; ctx.fillRect(0, FLOOR, W, 6);
      // The camera follows a runner facing right; the floor scrolls left.
      ctx.fillStyle = '#203e50';
      for (var i = 0; i < 12; i++) ctx.fillRect(i * 52 - (w.t * SPEED % 52), FLOOR + 15, 28, 5);
      ctx.fillStyle = ['#fff9e8', '#77d8f4', '#f7acdb'][s.state.sprite]; ctx.fillRect(X, w.y, SIZE, SIZE);
      ctx.fillStyle = '#132737'; ctx.fillRect(X + 17, w.y + 9, 4, 6); ctx.fillRect(X + 26, w.y + 9, 4, 6);
      ctx.fillStyle = '#fff9e8';
      var foot = Math.sin(w.t * 24) * 4;
      ctx.fillRect(X + 5, w.y + SIZE, 8, w.vy ? 4 : 5 + foot); ctx.fillRect(X + 22, w.y + SIZE, 8, w.vy ? 4 : 5 - foot);
      w.bugs.forEach(function (b) {
        if (w.t < b.at || b.x < -30 || b.x > W) return;
        for (var j = 0; j < 16; j++) {
          ctx.fillStyle = ((j * 7 + Math.floor(w.t * 12)) % 3) ? '#ed84a6' : '#724978';
          ctx.fillRect(b.x + j % 4 * 8, FLOOR - 34 + Math.floor(j / 4) * 8, 8, 8);
        }
      });
      if (w.hitLeft > 0) text('あたった！', 270, 145, '#ff9eb8', 28);
      else if (s.praise > 0 && s.mode === 'lesson') {
        // Bound a custom name without shrinking the required 24px text.
        ctx.font = '700 24px ' + FONT;
        var name = Array.from(String(cfg.aiName || 'ソラ')).slice(0, 16).join('');
        while (name.length && ctx.measureText(name + ':').width > 480) name = Array.from(name).slice(0, -1).join('');
        text(name + ':', 270, 136, '#ffe29a'); text('ちょうど いい！', 270, 165, '#ffe29a');
      }
      if (s.mode === 'playtest') {
        // A fingertip and round palm press the field at the same instant as the jump.
        var handY = 330 + (s.press > 0 ? 12 * s.press / 0.25 : 0);
        ctx.strokeStyle = '#ffe29a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(430, 297, s.press > 0 ? 23 : 17, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff9e8';
        ctx.fillRect(420, handY - 42, 20, 42);
        ctx.beginPath(); ctx.arc(430, handY - 42, 10, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(430, handY, 26, 0, Math.PI * 2); ctx.fill();
      }
      text(s.mode === 'playtest' ? 'プレイテスト' : s.running ? 'じっこう ちゅう' : 'おすと ジャンプ', 270, 450);
      if (s.mode === 'lesson') {
        ctx.fillStyle = '#0a1424'; ctx.fillRect(20, 514, 500, 134);
        ctx.font = '700 30px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#c6e6ff'; ctx.fillText('let jump =', 50, 585);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe29a'; ctx.fillText(String(s.state.jump), 340, 585);
        buttons.less.parentNode.setAttribute('aria-label', 'let jump = ' + s.state.jump);
        text('かずを かえると とびかたが かわる', 270, 665, '#b9cadc');
        buttons.less.disabled = s.state.jump === 3; buttons.more.disabled = s.state.jump === 9;
        buttons.done.className = s.elapsed >= 60 ? 'rp-glow' : '';
      } else if (s.mode === 'play') text('スペースでも ジャンプ', 270, 610, '#b9cadc');
      if (s.paused) { ctx.fillStyle = 'rgba(10,18,32,.9)'; ctx.fillRect(0, 260, W, 110); text('ひとやすみ', 270, 315); }
    }
    var inputVisible = false;
    function syncPause(fromInput) {
      // A real input proves visibility even when the initial hidden flag is stale.
      // A later visibilitychange still pauses normally; platform pause always wins.
      if (fromInput === true) inputVisible = true;
      s.paused = (!!document.hidden && !inputVisible) || !!(platformState && platformState.paused);
      last = null; draw();
      if (ac && (s.paused || !allowed())) ac.suspend().catch(function () {});
    }
    var platformState = null;
    if (pf && (typeof pf === 'object' || typeof pf === 'function')) {
      platformState = platforms.get(pf);
      if (!platformState) {
        platformState = { paused: false, audio: true, active: null }; platforms.set(pf, platformState);
        var ps = platformState;
        if (typeof pf.onPause === 'function') pf.onPause(function () { ps.paused = true; if (ps.active) ps.active(); });
        if (typeof pf.onResume === 'function') pf.onResume(function () { ps.paused = false; if (ps.active) ps.active(); });
        if (typeof pf.onAudioChange === 'function') pf.onAudioChange(function (on) { ps.audio = !!on; if (ps.active) ps.active(); });
      }
      platformState.active = function () { audioOn = platformState.audio; syncPause(); };
      audioOn = platformState.audio;
    }
    listen(document, 'visibilitychange', function () { inputVisible = false; syncPause(); });
    listen(stage, 'pointerdown', function () { syncPause(true); }, true);
    listen(root, 'resize', resize);
    function key(e) {
      if (e.type === 'keydown') syncPause(true);
      if (s.closed || stub || s.mode === 'playtest') return;
      e.stopImmediatePropagation();
      if (e.code === 'Space' && e.type === 'keydown' && !(e.target && e.target.tagName === 'BUTTON')) {
        e.preventDefault(); if (!e.repeat) doJump();
      }
    }
    listen(root, 'keydown', key, true); listen(root, 'keyup', key, true);
    s.cleanup = function () {
      root.cancelAnimationFrame(raf); removers.forEach(function (remove) { remove(); });
      if (platformState) platformState.active = null;
      if (ac) ac.close().catch(function () {});
      host.remove(); if (current === s) current = null;
      if (oldFocus && oldFocus.isConnected && typeof oldFocus.focus === 'function') oldFocus.focus({ preventScroll: true });
    };
    function frame(now) {
      if (s.closed) return;
      var dt = last == null ? 0 : Math.max(0, (now - last) / 1000); last = now;
      if (!s.paused) {
        if (stub) {
          if (up.phase === 'sending') {
            up.timer += dt;
            if (up.timer >= 0.9) { up.phase = 'feedback'; up.feedbackIdx = 0; if (typeof cfg.learn === 'function') cfg.learn('feedback'); }
          }
        } else s.advance(dt);
      }
      if (s.closed) return;
      // Poll muting too: hosts may expose isAudioEnabled without onAudioChange.
      var mute = !allowed();
      if (ac && mute && muted !== mute) ac.suspend().catch(function () {});
      muted = mute; draw();
      raf = root.requestAnimationFrame(frame);
    }
    resize(); syncPause();
    if (buttons.jump) buttons.jump.focus({ preventScroll: true });
    raf = root.requestAnimationFrame(frame);
    root.__proto = {
      debugSetJump: function (n) { s.setJump(n); draw(); return s.state.jump; },
      debugJump: function () { var ok = !s.closed && !s.paused && jump(s.world); if (ok) sound(); draw(); return ok; },
      debugState: function () { return Object.assign({}, s.state, { elapsed: s.elapsed, cycleTime: s.world.t,
        avoided: s.world.avoided, y: s.world.y, hitBug: s.world.hitBug, hitCeiling: s.world.hitCeiling, closed: s.closed }); },
      debugRunCycle: function () { return runCycle(s.state); }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
