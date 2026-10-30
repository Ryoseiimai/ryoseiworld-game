/* RYOSEIWORLD v5 横スクロールのボス戦（SPEC_V6.md の 3・4・5）
 *
 * 外から呼ぶ入口は RYW.Shooter.start(cfg) だけ。
 *   boss       'bugking' | 'kateino' | 'hikaku' | 'jibun' | 'zero'
 *   background 'bg_town' などの名前（省略時はボスの既定）。'/' か '.png' を含むときは URL としてそのまま使う
 *   weapons    ['rapid','twin','rainbow','barrier','onigiri','letter','charge'] か 'all'。フクの ひかりだま は常に有効
 *              （別名: pierce=rainbow, heart=letter, tame=charge）
 *   options    守護霊のおとも（最大3）。'nao'|'code'|'search'|'paint'|'kotoba'|'whale'|'spirit:0'〜'spirit:15'
 *              か {id, name, sheet:'spirits'|'summons', frame:[row,col]}。'search'（サーチフクロウ）はヒカクマオウの冠を光らせる
 *              配列の options.proto / options.cheats も可。オブジェクトなら {companions, proto, cheats}。
 *   mode       'challenge' は startStage（既定1）から連戦。cfg.cheats も受け取る。
 *   cheats     {godmode, timescale, widejudge, showhitbox}（trueで有効）。保存は呼び出し側。
 *   onEnd      チャレンジのライフ0で {stage, bestCombo, score, cheated} を返す。
 *   hearts     最初のハート（既定3）。てづくり おにぎり があると、ここに +1 する
 *   lines      台詞の上書き {intro:[話し手,文], bursts:{75,50,25,0}, half, win, hint:[話し手,文], owlHint, taunts:[],
 *              steps:[[話し手,文]x3], ready, use:[話し手,文], voices:[{name,text,spirit}]}
 *   platform   v5 の platform（onPause/onResume/isAudioEnabled/onAudioChange を使う）。無いときは visibilitychange で止める
 *   onWin(result)   勝ったあと、画面を閉じてから呼ぶ。result = {boss, seconds, hearts, maxHearts, hurts, cheated, bestCombo, score}
 *   onLose(choice)  負けて選んだあと、画面を閉じてから呼ぶ。choice = 'retry'（すぐ やりなおす）か 'town'（まちに もどる）
 *                   onLose が無いときだけ、'retry' で自分から始め直す
 * 戻り値: { stop(), state }
 * 検証用: window.__shooter（state・bossHp・hearts など）と debugWin()・debugSetHearts(n)・debugSetBossHp(n)・debugCollect()・debugGod()。
 * Node から読むと RYW.Shooter._sim（画面なしで1コマずつ進める部品）だけが使える（tools/test_shooter.cjs）。
 */
(function (root) {
  'use strict';
  var RYW = root.RYW = root.RYW || {};
  var hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';
  var SCRIPT_URL = hasDOM ? ((document.currentScript && document.currentScript.src) || location.href) : '';

  // ============ 定数 ============
  var FIRE_INTERVAL = 0.20, RAPID_INTERVAL = 0.14;
  function word(id, fallback) { return typeof RYW.word === 'function' ? RYW.word(id) : fallback; }
  function cooldownText() { return FIRE_INTERVAL.toFixed(2) + '→' + RAPID_INTERVAL.toFixed(2) + ' びょう'; }
  // SPEC_V7_MANABU.md 9: the wait time on screen reads in kanji in adult mode (cooldownText stays the kids form other code builds on).
  function cooldownLabel() { return RYW.mode === 'adult' ? cooldownText().replace(' びょう', '秒') : cooldownText(); }
  var W = 540, H = 960, PLAY_T = 116, PLAY_B = 826, PLAY_MID = (PLAY_T + PLAY_B) / 2;
  // Top of ミナモ's stone bank in bg_minamo (drawn H + 40 tall from y = -20); below it is the river.
  var MINAMO_BANK_Y = 440;
  // R278: foot of that bank, where the stones meet the water. Before the rise the hero stood on the river's rail
  // at PLAY_B - 70 (the town's road), so in ミナモ he stands here instead.
  var MINAMO_WATER_Y = 650, P_FEET = 55;
  // bg is chosen like loadAll does (an unknown name falls back to the boss's own picture).
  // R301: elsewhere he stood at PLAY_B - 70 with his feet 21px under the top of the road drawn in front (drawThemeFront),
  // so on the first frames his shoes and board were hidden by it. Now his feet stand on that top edge.
  var ROAD_TOP_Y = PLAY_B - 36, TOWER_ROAD_TOP_Y = ROAD_TOP_Y - 20;
  function introStartY(bg, own) {
    var theme = BG_THEME[BG_THEME[bg] ? bg : own];
    return theme === 'minamo' ? MINAMO_WATER_Y - P_FEET : theme === 'tower' ? TOWER_ROAD_TOP_Y - P_FEET : ROAD_TOP_Y - P_FEET;
  }
  var TOWN_RAIL_Y = 652; // R229: top of the guardrail in bg_town (the picture's own poles end behind it)
  var NEON_SIGN_Y = PLAY_T + 390; // R83: top of the neon signs, between the entrance plate and the move hint, under any lines and notices
  var P_MIN_X = 44, P_MAX_X = 330, P_SPEED = 340, P_R = 11, P_DRAW_H = 120;
  // 当たり判定は見た目(P_R)より小さく: 本体の7割だけが実際にぶつかる。デバッグの「あたりはんてい みえる」もこの値を描く
  var P_HIT_R = P_R * 0.7;
  var CHARGE_FULL = 0.9, TIGER_REST = 4, INVULN = 1.0, BARRIER_BACK = 15, SHOW_TIME = 10, SHOW_COOLDOWN = 12;
  // The move hint stays HINT_T s. No aimed shot comes before it is gone; then shots get to full speed over RAMP_T s.
  // After a hit, bullets within BREATHER_R are cleared so one mistake does not chain into the next.
  var HINT_T = 4.5, RAMP_T = 12, BREATHER_R = 170;
  var HINT_PLATE_T = PLAY_B - 160, HINT_FREE = 1.2; // R111: top of the move hint's plate; the boss keeps above it until HINT_T + HINT_FREE
  // R153: the move hint fades out over HINT_OUT s. A half-faded hint over a bright city could not be read,
  // so it leaves quickly instead of lingering see-through.
  var HINT_OUT = 0.15;
  // Boss lines fade in over 1/6 s and out over BURST_OUT s (or over o.out when their time was cut short, R154).
  var BURST_OUT = 1 / 3, BURST_MIN_OUT = 0.15;
  function burstAlpha(o, t) { var bt = t - o.t; return clamp(Math.min(bt * 6, (o.dur - bt) / (o.out || BURST_OUT)), 0, 1); }
  var HINT_IN = 0.25; // fade-in of the move hint
  function hintAlpha(t) { return clamp(Math.min(t / HINT_IN, (HINT_T - t) / HINT_OUT), 0, 1); }
  // R75: the plate behind the entrance lines (INTRO_LINE_Y). R110: raised 40px so the rising hero (its box top stops at 451)
  // and the neon signs (top NEON_SIGN_Y) stay below it instead of touching the second line.
  var INTRO_PLATE_T = 352, INTRO_PLATE_H = 98;
  var INTRO_LINE_Y = [INTRO_PLATE_T + 28, INTRO_PLATE_T + 70];
  // R87: the entrance lines sit in the middle of the field, where the boss rides in. They are gone by INTRO_TEXT_END s,
  // and the boss starts in from the right edge at INTRO_BOSS_IN s, so it does not slide in behind them (its voice comes first).
  var INTRO_TEXT_END = 1.85, INTRO_BOSS_IN = 1.7, INTRO_END = 2.5, INTRO_RISE_T = 0.45;
  // R290: the hero rises from INTRO_RISE_T over INTRO_RISE_DUR s (it used to start at 0.5 s and take 1.1 s, so on a phone the
  // lines said "it floated" while the hero still stood on the road). The lines come in at INTRO_LINES_T, once it is visibly up.
  var INTRO_RISE_DUR = 0.7, INTRO_LINES_T = INTRO_RISE_T + 0.25;
  var FONT = "'Hiragino Maru Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',system-ui,sans-serif";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Text width without a canvas (Node tests and hit boxes). Japanese glyphs are square, ASCII about half.
  function textW(s, px) { var w = 0; for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) < 128 ? px * 0.58 : px; return w; }

  // ============ 武器（SPEC_V6.md の3） ============
  var WEAPONS = [
    { id: 'fuku', name: 'フクの ひかりだま', kind: 'start', icon: null, desc: 'まっすぐ 右へ うつ' },
    { id: 'rapid', name: 'れんしゃ モジュール', kind: 'friend', icon: [1, 0], desc: 'うつ かんかくが みじかく なる' },
    { id: 'twin', name: '2ほうこう チップ', kind: 'friend', icon: [0, 3], desc: 'うえと したの ななめにも うつ' },
    { id: 'rainbow', name: 'にじいろ チップ', kind: 'friend', icon: [1, 1], desc: 'てきの たまを つらぬく' },
    { id: 'barrier', name: 'おまもりバリア', kind: 'family', icon: [2, 0], desc: '1かいだけ あたっても へいき。15びょうで もどる' },
    { id: 'onigiri', name: 'てづくり おにぎり', kind: 'family', icon: [2, 1], desc: 'ハートの かずが 1つ ふえる' },
    { id: 'letter', name: 'ハートの てがみ', kind: 'love', icon: [1, 2], desc: 'てきを おいかける ハートの たま' },
    { id: 'charge', name: 'フクの ためうち', kind: 'love', icon: [1, 3], desc: 'おしつづけて ためると おおきな とらの たま' }
  ];
  var WEAPON_WORDS = { fuku: 'shot', rapid: 'cooldown', twin: 'vector', rainbow: 'hitbox', barrier: 'if', onigiri: 'life', letter: 'homing', charge: 'charge' };
  // Weapon names follow RYW.mode (SPEC_V7_MANABU.md 9・9.1), so this recomputes on every syncWeaponNames() call, not just once at load.
  function syncWeaponNames() {
    if (typeof RYW.word !== 'function') return;
    var names = { fuku: 'フク・' + RYW.word('shot'), rapid: RYW.word('cooldown') + ' チップ', twin: RYW.word('vector') + ' チップ', rainbow: RYW.word('hitbox') + ' チップ', barrier: RYW.word('if') + ' バリア', onigiri: RYW.word('life') + '+1 おにぎり', letter: RYW.word('homing') + ' レター', charge: 'フクの ' + RYW.word('charge') + 'ショット' };
    WEAPONS.forEach(function (wp) { wp.name = names[wp.id]; if (wp.id === 'rapid') wp.desc = 'つぎに うつまで\n' + cooldownText(); if (wp.id === 'onigiri') wp.desc = 'ライフが 1つ ふえる'; });
  }
  syncWeaponNames();
  var WEAPON_ALIAS = { pierce: 'rainbow', niji: 'rainbow', heart: 'letter', tegami: 'letter', tame: 'charge', omamori: 'barrier', rensha: 'rapid' };
  function normalizeWeapons(list) {
    var out = { fuku: true };
    if (list === 'all' || (Array.isArray(list) && list.indexOf('all') >= 0)) { WEAPONS.forEach(function (wp) { out[wp.id] = true; }); return out; }
    if (typeof list === 'string') list = list.split(',');
    (Array.isArray(list) ? list : []).forEach(function (id) {
      id = String(id && id.id || id).trim();
      id = WEAPON_ALIAS[id] || id;
      if (WEAPONS.some(function (wp) { return wp.id === id; })) out[id] = true;
    });
    return out;
  }

  // ============ 守護霊のおとも ============
  var SPIRIT_CATALOG = {
    nao: { name: 'ナオスライム', sheet: 'summons', frame: [0, 0] },
    code: { name: 'コードラゴン', sheet: 'summons', frame: [0, 1] },
    search: { name: 'サーチフクロウ', sheet: 'summons', frame: [0, 2], owl: true },
    paint: { name: 'ペイントキメラ', sheet: 'summons', frame: [1, 0] },
    kotoba: { name: 'コトバイルカ', sheet: 'summons', frame: [1, 1] },
    whale: { name: 'サーバークジラ', sheet: 'summons', frame: [1, 2] }
  };
  var DEFAULT_OPTIONS = ['nao', 'code', 'search'];
  function spiritDef(item) {
    if (item && typeof item === 'object') {
      var base = item.id && SPIRIT_CATALOG[item.id] ? SPIRIT_CATALOG[item.id] : {};
      var frame = item.frame;
      var sheet = item.sheet || base.sheet || 'spirits';
      var cols = sheet === 'summons' ? 3 : 4;
      if (typeof frame === 'number') frame = [Math.floor(frame / cols), frame % cols];
      return { id: String(item.id || sheet), name: item.name || base.name || '', sheet: sheet, frame: frame || base.frame || [0, 0],
        owl: !!(base.owl || item.owl || item.id === 'search' || item.name === 'サーチフクロウ') };
    }
    var s = String(item).trim();
    if (SPIRIT_CATALOG[s]) { var d = SPIRIT_CATALOG[s]; return { id: s, name: d.name, sheet: d.sheet, frame: d.frame, owl: !!d.owl }; }
    var m = /^spirits?[:_]?(\d+)$/.exec(s) || /^(\d+)$/.exec(s);
    if (m) { var n = clamp(parseInt(m[1], 10), 0, 15); return { id: 'spirit' + n, name: '', sheet: 'spirits', frame: [Math.floor(n / 4), n % 4], owl: false }; }
    return null;
  }
  function normalizeOptions(list) {
    if (typeof list === 'number' || (typeof list === 'string' && /^\d$/.test(list))) list = DEFAULT_OPTIONS.slice(0, clamp(+list, 0, 3));
    else if (typeof list === 'string') list = list ? list.split(',') : [];
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (it) { var d = spiritDef(it); if (d && out.length < 3) out.push(d); });
    return out;
  }

  // ============ ボス（SPEC_V6.md の4・rpg.html・SPEC_V5_CH234.md の台詞） ============
  var DEFAULT_VOICES = [
    { name: 'おかあさん', text: 'みせてくれて ありがとう', spirit: 'nao' },
    { name: 'しゅうりの おじさん', text: 'こわれたら また なおせば いい', spirit: 'code' },
    { name: 'おじいちゃん', text: 'わからない ことは いっしょに しらべよう', spirit: 'search' },
    { name: 'えを かく こ', text: 'いっしょに かいて くれて うれしかった', spirit: 'paint' },
    { name: 'ハッカーの おねえさん', text: 'つくる ひとの みかただよ', spirit: 'whale' },
    { name: 'ミオ', text: 'かみどめ、とどけて くれて ありがとう', spirit: 'kotoba' }
  ];
  var BUBBLE_WORDS = ['ゲームばっかり', 'しょうらい', 'あぶない', 'はやく ねて'];
  var BUBBLE_POP_X = 4;
  var NUMBER_WORDS = ['10まん', 'いいね 999', '1い', 'フォロワー', 'しゃちょう'];
  var BOSSES = {
    bugking: {
      name: 'BUG KING', sheet: 'bugking', bg: 'bg_town', hp: 390, x: 388, drawH: 200, bodyR: 77, bodyDY: 7, feet: 0.42, feetGlow: true,
      moveA: 190, moveF: 0.55, color: '#79e6ff',
      lines: { intro: ['BUG KING', 'どうせ お前には むりだ'],
        bursts: { 75: '// あとで直す', 50: 'TODO: エラー処理', 25: 'とりあえず動いた', 0: 'いつか だれかの\nやくに たつはず' },
        half: 'BUG KING は こわれかけている', win: 'BUG KING は おとなしく なった' }
    },
    kateino: {
      name: 'カテイノジジョウ', sheet: 'kateino', bg: 'bg_minamo', hp: 620, x: 400, drawH: 212, bodyR: 84, bodyDY: 6, feet: 0.42,
      moveA: 120, moveF: 0.45, color: '#ffc27a',
      lines: { intro: ['カテイノジジョウ', 'しょうらい\nどうするの？'],
        bursts: { 75: '…ほんとは\nしんぱいなだけ', 50: 'あの子 なにか\nつくってるの?', 25: 'ちょっと みせて', 0: '…すごいじゃない' },
        hint: ['ソラ', 'かべは かたい。とくぎで ゲームを みせて みよう'], owlHint: ['サーチフクロウ', 'みせる と いい'],
        hint2: ['ソラ', 'みぎしたの「' + word('playtest', 'みせる') + '」を おして みよう'],
        show: ['RYOSEI', 'はじめて つくった ゲーム を みせた！'],
        win: 'カテイノジジョウは おとなしく なった' }
    },
    hikaku: {
      name: 'ヒカクマオウ', sheet: 'hikaku', bg: 'bg_neon', hp: 370, x: 392, drawH: 224, bodyR: 67, bodyDY: 22,
      crown: [-6, -78, 32], moveA: 180, moveF: 0.6, color: '#ffd94a',
      lines: { intro: ['ヒカクマオウ', 'おなじ としで\nもう しゃちょう'],
        bursts: { 75: 'きのうの じぶんより\nすすんでる', 50: 'くらべる あいては\nきのうの じぶん', 25: 'はやさは ひとそれぞれ', 0: '…じぶんの はやさで いい' },
        hint: ['ソラ', 'すうじに あたると たまが よわくなる。「じぶんの ペース」を とろう'],
        owlHint: ['サーチフクロウ', 'かずは ぜんぶ たにんの もの。かんむりを ねらって'],
        win: 'ヒカクマオウは おとなしく なった' }
    },
    jibun: {
      name: 'ジブン', sheet: 'ryosei', bg: 'bg_tower', hp: 0, x: 430, drawH: 128, bodyR: 44, bodyDY: 0,
      moveA: 0, moveF: 0, color: '#c9ced8', through: true, makes: 3,
      lines: { intro: ['ジブン', 'やめても だれも こまらないよ。'],
        taunts: ['やめても だれも こまらないよ', 'どうせ また とちゅうで やめる'],
        hint: ['ソラ', 'たまは とどかない。「つくる」の ひかりを とろう'],
        steps: [['ソラ', 'わかった。ちょっと まってて'], ['RYOSEI', 'きのうより ひとつ すすんだ'], ['', 'ジブンが おなじ いろに なった。']],
        win: 'ジブンが おなじ いろに なった。' }
    },
    zero: {
      name: 'ゼロ', sheet: 'zero', bg: 'bg_tower', hp: 0, x: 376, drawH: 260, bodyR: 97, bodyDY: 0,
      moveA: 110, moveF: 0.35, color: '#b9a7ff', immune: true,
      lines: { intro: ['ゼロ', '……ザーッ'],
        hint: ['ソラ', 'こうげきが きかない。みんなの「こえ」を あつめよう'],
        ready: 'とくぎが「みんなの こえ」に かわった！', use: ['コトバイルカ', 'みんなの こえを とどけるよ'],
        win: 'ノイズが はれた', voices: DEFAULT_VOICES }
    }
  };
  var BG_THEME = { bg_town: 'town', bg_minamo: 'minamo', bg_neon: 'neon', bg_tower: 'tower' };

  function mergeLines(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    if (over && typeof over === 'object') Object.keys(over).forEach(function (k) {
      if (k === 'bursts' && over.bursts && typeof over.bursts === 'object') {
        out.bursts = {}; Object.keys(base.bursts || {}).forEach(function (t) { out.bursts[t] = base.bursts[t]; });
        Object.keys(over.bursts).forEach(function (t) { out.bursts[t] = over.bursts[t]; });
      } else if (over[k] != null) out[k] = over[k];
    });
    if (typeof out.intro === 'string') out.intro = [base.intro ? base.intro[0] : '', out.intro];
    if (Array.isArray(out.voices)) out.voices = out.voices.filter(function (v) { return v && v.text; }).map(function (v) {
      return { name: String(v.name || ''), text: String(v.text), spirit: v.spirit || null };
    });
    return out;
  }

  var MUSIC = {
    bugking: { bpm: 150, bass: [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 47, 47, 59, 50], lead: [69, 0, 72, 74, 76, 0, 74, 72, 67, 0, 71, 72, 74, 0, 71, 0] },
    kateino: { bpm: 128, bass: [41, 0, 48, 0, 43, 0, 50, 0, 45, 0, 52, 0, 40, 0, 47, 0], lead: [65, 0, 69, 72, 0, 69, 67, 0, 64, 0, 67, 69, 71, 0, 67, 0] },
    hikaku: { bpm: 158, bass: [38, 50, 38, 50, 41, 53, 41, 53, 36, 48, 36, 48, 43, 55, 43, 55], lead: [74, 0, 77, 0, 81, 79, 77, 0, 72, 0, 76, 0, 79, 77, 74, 0] },
    jibun: { bpm: 104, bass: [40, 0, 0, 47, 0, 0, 45, 0, 43, 0, 0, 47, 0, 0, 52, 0], lead: [64, 0, 0, 0, 67, 0, 66, 0, 64, 0, 0, 0, 62, 0, 59, 0] },
    zero: { bpm: 116, bass: [33, 0, 45, 0, 34, 0, 46, 0, 36, 0, 48, 0, 31, 0, 43, 0], lead: [69, 72, 0, 76, 0, 75, 72, 0, 67, 70, 0, 74, 0, 72, 70, 0] }
  };

  // ============ 世界（画面なしで動く部分） ============
  var NO_INPUT = { ax: 0, ay: 0, dx: 0, dy: 0, skill: false, press: false, release: false };

  function createWorld(cfg) {
    cfg = cfg || {};
    var id = BOSSES[cfg.boss] ? cfg.boss : 'bugking';
    var def = BOSSES[id];
    var weapons = normalizeWeapons(cfg.weapons);
    var settings = cfg.options && typeof cfg.options === 'object' ? cfg.options : {};
    var opts = normalizeOptions(settings.companions || cfg.options);
    var cheats = Object.assign({}, settings.cheats || {}, cfg.cheats || {});
    var base = Math.round(Number(cfg.hearts));
    if (!(base >= 1)) base = 3;
    base = Math.min(9, base);
    var maxHearts = base + (weapons.onigiri ? 1 : 0);
    var lines = mergeLines(def.lines, cfg.lines);
    var w = {
      cfg: cfg, settings: settings, cheats: cheats, cheated: ['godmode', 'timescale', 'widejudge', 'showhitbox'].some(function (k) { return !!cheats[k]; }),
      scale: cheats.timescale ? 0.7 : 1, paused: false, mode: cfg.mode || 'story', stage: 0, score: 0,
      beat: { time: 0, phase: 0, previous: 0, bpm: MUSIC[id].bpm, lastPress: -1, combo: 0, bestCombo: 0, feverUntil: -1, tempoSteps: 0 },
      bossId: id, def: def, lines: lines, rng: mulberry32((cfg.seed >>> 0) || 20261009),
      t: 0, playT: 0, state: 'intro', stateT: 0, god: !!cfg.god,
      weapons: weapons, hasOwl: opts.some(function (o) { return o.owl; }),
      options: opts.map(function (d, i) { return { def: d, x: 110 - i * 20, y: PLAY_B - 60, cd: 0.2 + i * 0.15, blockCd: 0, flash: 0 }; }),
      p: { x: 150, y: PLAY_B - 70, y0: PLAY_B - 70, hearts: maxHearts, maxHearts: maxHearts, inv: 0, hurtT: 0, fireCd: 0.25, letterCd: 0.5, letterSide: 1,
        charge: 0, charging: false, tigerReadyAt: 0, risen: false, barrier: weapons.barrier ? { up: true, at: 0 } : null,
        sqT: 0, sqDur: 0, sqSign: 0, moving: false },
      b: { x: W + 170, y: PLAY_MID, hp: def.hp, maxHp: def.hp, ghostHp: def.hp, flash: 0, attackT: 0, hurtT: 0, shown: {}, phase2: false,
        sqT: 0, sqDur: 0, sqSign: 0, tellSquashed: false },
      m: {}, shots: [], eb: [], bugs: [], pickups: [], fx: [], tickers: [],
      burst: null, burstQ: [], toast: null, events: [], hitstop: 0, shake: 0, flash: 0, lastStopAt: -1, roar: 0,
      prevSkill: false, winKind: '', stats: { shots: 0, hits: 0, damage: 0, hurts: 0, enemyBullets: 0, byKind: {} }
    };
    var m = w.m;
    if (id === 'bugking') { m.blockT = HINT_T; m.spreadT = 1.2; m.bugT = 2.0; }
    if (id === 'kateino') { m.waveT = 1.0; m.sighT = 2.0; m.wall = 0; m.crackUntil = -1; m.showReadyAt = 0; m.k = 0; m.showed = false; m.hint2At = 16; m.waveCycle = 0; }
    if (id === 'hikaku') { m.numT = 3.5; m.ringT = 2.0; m.down = 0; m.paceAt = 9; m.k = 0; m.rot = 0; }
    // makeAt / voiceAt: the lights come on a timetable, so these set how long the fight lasts (2 to 3 minutes).
    if (id === 'jibun') { m.ballT = HINT_T; m.made = 0; m.makeAt = 28; m.tauntAt = 9; m.tauntK = 0; }
    if (id === 'zero') {
      m.ringT = HINT_T + 1.5; m.noiseT = HINT_T; m.got = 0; m.voiceAt = 10; m.ready = false; m.used = false; m.rot = 0;
      m.voices = (lines.voices && lines.voices.length ? lines.voices : DEFAULT_VOICES).slice(0, 8);
      m.connected = []; m.toldImmune = false;
    }
    if (w.mode === 'challenge') setStage(w, cfg.startStage || 1);
    // R278: the start height follows the fight's first background (after setStage, which may change w.def); the companions start just below him.
    w.p.y = w.p.y0 = introStartY(cfg.background, w.def.bg);
    w.options.forEach(function (o) { o.y = w.p.y0 + 10; });
    return w;
  }

  function learnQuiet(w, id) {
    w.learned = w.learned || {};
    if (w.learned[id]) return;
    w.learned[id] = true;
    if (typeof RYW.learnQuiet === 'function') RYW.learnQuiet(id);
  }
  function beatInfo(w) {
    var r = w.beat, phase = r.phase, number = Math.floor(phase + 1e-9);
    return { number: number, phase: phase, bpm: r.bpm, secondsToNext: (number + 1 - phase) * 60 / r.bpm,
      time: r.time, combo: r.combo, bestCombo: r.bestCombo, fever: phase < r.feverUntil };
  }
  function setCombo(w, n) {
    var r = w.beat;
    r.combo = Math.max(0, Math.floor(n) || 0); r.bestCombo = Math.max(r.bestCombo, r.combo);
    if (r.combo >= 2) learnQuiet(w, 'combo');
    if (r.combo > 0 && r.combo % 8 === 0) { r.feverUntil = r.phase + 4; emit(w, 'fever'); }
  }
  function pressBeat(w, offsetMs, inputPhase) {
    if (w.state !== 'play' || w.paused || w.playtest) return null;
    var r = w.beat, phase = inputPhase == null ? r.phase : inputPhase;
    // The debug offset goes through the same nearest-beat rule as live input.
    if (offsetMs != null) phase = Math.round(phase) + Number(offsetMs) / 1000 * r.bpm / 60;
    var nearest = Math.round(phase), error = Math.abs(phase - nearest) * 60 / r.bpm;
    if (nearest <= r.lastPress) return null;
    r.lastPress = nearest;
    var wide = w.cheats.widejudge ? 2 : 1;
    var judge = error <= .080 * wide + 1e-9 ? 'perfect' : error <= .160 * wide + 1e-9 ? 'good' : 'miss';
    learnQuiet(w, 'timing');
    r.judgement = { kind: judge, until: r.time + .4 };
    if (judge === 'miss') setCombo(w, 0);
    else {
      setCombo(w, r.combo + 1); w.score += judge === 'perfect' ? 100 : 50;
      addShot(w, { kind: judge === 'perfect' ? 'tiger' : 'fuku', beatShot: true, x: w.p.x + 44, y: w.p.y - 6,
        vx: 760, vy: 0, r: judge === 'perfect' ? 30 : 16, dmg: judge === 'perfect' ? 4 : 2,
        pierce: judge === 'perfect' || !!w.weapons.rainbow, hitBoss: false });
      // FUN5: perfect only gets a small shake+flash so the best timing feels punchier than good (no hitstop, so kizuna0 win time is unaffected).
      if (judge === 'perfect') { w.shake = Math.max(w.shake, 4); w.flash = Math.max(w.flash, 0.12); }
      emit(w, judge);
    }
    return judge;
  }
  function updateTempo(w) {
    if (w.mode === 'challenge' || !w.b.maxHp) return;
    var count = w.b.hp <= w.b.maxHp * .25 ? 3 : w.b.hp <= w.b.maxHp * .5 ? 2 : w.b.hp <= w.b.maxHp * .75 ? 1 : 0;
    if (count > w.beat.tempoSteps) {
      w.beat.bpm += 8 * (count - w.beat.tempoSteps); w.beat.tempoSteps = count;
      w.beat.tempoUntil = w.beat.time + 1; learnQuiet(w, 'bpm');
    }
  }
  // Keep the old attack intervals, rounded to the nearest beat (half beat in phase two).
  // The fire timing itself never changes; this only brightens the boss (b.tell) for the
  // last TELL_WINDOW seconds before a shot, so the attack is seen coming without being delayed.
  var TELL_WINDOW = 0.3;
  function attackDue(w, key, dt) {
    var r = w.beat, sub = w.b.hp <= w.b.maxHp / 2 && w.b.maxHp ? 2 : 1, thresh = 30 / r.bpm / sub;
    w.m[key] -= dt;
    if (w.m[key] <= thresh + TELL_WINDOW) w.b.tell = Math.max(w.b.tell || 0, clamp(1 - (w.m[key] - thresh) / TELL_WINDOW, 0, 1));
    return w.m[key] <= thresh && Math.floor(r.phase * sub + 1e-9) > Math.floor(r.previous * sub + 1e-9);
  }
  var CHALLENGE_BOSSES = ['bugking', 'kateino', 'hikaku', 'jibun', 'zero'];
  function setStage(w, n) {
    if (w.mode !== 'challenge') return false;
    var previousBpm = w.stage ? w.beat.bpm : 0;
    w.stage = Math.max(1, Math.floor(Number(n)) || 1);
    var id = CHALLENGE_BOSSES[(w.stage - 1) % CHALLENGE_BOSSES.length];
    w.bossId = id; w.def = Object.assign({}, BOSSES[id], { hp: 180 + 12 * (w.stage - 1), through: false, immune: false });
    w.lines = { intro: [w.def.name, 'ビートに あわせて おしてみよう'], bursts: {}, win: 'つぎの ステージ！' };
    w.b.hp = w.b.maxHp = w.b.ghostHp = w.def.hp; w.b.shown = {}; w.b.phase2 = false; w.b.tell = 0;
    w.beat.bpm = Math.min(220, 100 + 6 * (w.stage - 1)); w.beat.tempoSteps = 0;
    w.beat.tempoUntil = w.beat.time + 1;
    if (previousBpm && w.beat.bpm > previousBpm) learnQuiet(w, 'bpm');
    w.beat.phase = 0; w.beat.previous = 0; w.beat.lastPress = -1; w.beat.feverUntil = -1;
    w.m = { wall: 0, down: 0, crackUntil: -1, showReadyAt: Infinity, made: 0, voices: DEFAULT_VOICES, connected: [], got: 0, rot: 0 };
    w.eb = []; w.bugs = []; w.shots = []; w.pickups = []; w.burst = null; w.burstQ = []; w.toast = null;
    w.stageAt = w.playT;
    return true;
  }
  function challengeAttack(w) {
    var r = w.beat, sub = w.stage >= 20 ? 4 : w.stage >= 10 ? 2 : 1;
    if (Math.floor(r.phase * sub + 1e-9) <= Math.floor(r.previous * sub + 1e-9)) return;
    if (w.playT - w.stageAt < HINT_T) return;
    var tick = Math.floor(r.phase * sub + 1e-9);
    if (tick % Math.ceil(1 / dens(w))) return;
    fan(w, spawnX(w, -60, 9), w.b.y, tick % (4 * sub) === 0 ? 3 : 1, .7, 180, 'orb');
    w.b.attackT = .4;
  }
  function result(w) {
    return { boss: w.bossId, seconds: Math.round(w.playT), hearts: w.p.hearts, maxHearts: w.p.maxHearts,
      hurts: w.stats.hurts, stage: w.stage, bestCombo: w.beat.bestCombo, score: w.score, cheated: !!w.cheated };
  }

  function emit(w, name) { if (w.events.length < 80) w.events.push(name); }

  // タメ→のび→つぶれ: sign>0はのび(伸びて細く)、sign<0はつぶれ(縮んで太く)。絵は描き直さず ctx.scale だけで表現する
  function squash(obj, sign, dur) { obj.sqT = dur; obj.sqDur = dur; obj.sqSign = sign; }
  function squashScale(obj) {
    if (!obj.sqT || obj.sqT <= 0) return { sx: 1, sy: 1 };
    var k = Math.sin((obj.sqT / obj.sqDur) * Math.PI) * obj.sqSign;
    return { sx: 1 - k * 0.14, sy: 1 + k * 0.22 };
  }
  // urgent: a line that answers what just happened (みせた・HPの節目・つくる) goes before plain lines and cuts a plain one that is showing.
  function burst(w, speaker, text, dur, urgent) {
    if (!text) return;
    var it = { speaker: speaker || '', text: String(text), dur: dur || 2.6, t: 0, urgent: !!urgent };
    if (!urgent) { w.burstQ.push(it); return; }
    var k = 0;
    while (k < w.burstQ.length && w.burstQ[k].urgent) k++;
    w.burstQ.splice(k, 0, it);
    if (w.burst && !w.burst.urgent) w.burst = null;
  }
  // R97: a line stays at least long enough to read: READ_T0 s plus 1/READ_CPS s per letter (spaces not counted), never shorter than asked.
  var READ_T0 = 1.0, READ_CPS = 8;
  function readDur(text, dur) { return Math.max(dur, READ_T0 + String(text).replace(/\s/g, '').length / READ_CPS); }
  function ramp(w) { return clamp((w.playT - HINT_T) / RAMP_T, 0, 1); }
  // R328: SPEC_V7_MANABU.md 9: the notices about damage and attack power are hints like the band label (R327),
  // so adult mode reads them in kanji (攻撃力 as on the status screen, 秒 like cooldownLabel), and so do the pickup names under them.
  function noticeText(k, n) {
    var adult = RYW.mode === 'adult';
    if (k === 'crack') return adult ? 'ひびが入った！\n' + SHOW_TIME + '秒 ボスへのダメージ 2倍' : 'ひびが はいった！\n' + SHOW_TIME + 'びょう ダメージ 2ばい';
    if (k === 'immune') return adult ? '攻撃が効かない…' : 'こうげきが きかない…';
    if (k === 'paceItem') return adult ? '自分のペース' : 'じぶんの ペース';
    if (k === 'makeItem') return adult ? '作る' : 'つくる';
    // R329: the progress notices of the ジブン and ゼロ fights, with the count as (n/m).
    if (k === 'made') return (adult ? 'ジブンに色が戻る (' : 'ジブンに いろが もどる (') + n + ')';
    if (k === 'voice') return (adult ? '守護霊がつながった (' : 'しゅごれいが つながった (') + n + ')';
    if (k === 'ready') return adult ? '特技が「みんなの声」に変わった！' : 'とくぎが「みんなの こえ」に かわった！'; // R330: the ゼロ fight, like the button label
    if (k === 'down') return adult ? '数字に当たって 攻撃力が下がった' : 'すうじに あたって こうげきりょく が さがった';
    return adult ? '自分のペースで作った。\n攻撃力が1段 戻った！' : 'じぶんの ペースで つくった。\nこうげきりょく が 1だん もどった！';
  }
  function toast(w, text, dur) { if (text) w.toast = { text: String(text), t: w.t, dur: dur || 2.4 }; }
  function ticker(w, text) {
    var x = W + 20;
    w.tickers.forEach(function (tk) { x = Math.max(x, tk.x + textW(tk.text, 26) + 60); });
    w.tickers.push({ text: text, x: x });
  }
  function dens(w) { var h = w.p.hearts; return h >= 3 ? 1 : h === 2 ? 0.7 : 0.5; }
  // The name on the walls of カテイノジジョウ. The top one is not drawn while a line or a notice is up there,
  // and the bottom one not while the move hint is shown, so the words never sit on top of each other.
  function wallLabels(w) {
    var on = w.bossId === 'kateino' && w.m.wall > 50;
    return { top: on && !w.burst && !w.toast, bottom: on && !(w.state === 'play' && w.stateT < HINT_T) };
  }
  function gap(w) { var wall = w.bossId === 'kateino' ? w.m.wall : 0; return { top: PLAY_T + wall, bottom: PLAY_B - wall }; }

  function sparks(w, x, y, n, color, speed) {
    for (var i = 0; i < n && w.fx.length < 420; i++) {
      var a = Math.random() * Math.PI * 2, s = (speed || 160) * (0.4 + Math.random());
      w.fx.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.35, age: 0, color: color || '#bff6ff', size: 2 + Math.random() * 3 });
    }
  }

  function skillMode(w) {
    if (w.state !== 'play' || w.mode === 'challenge' || w.playtest) return 'none';
    if (w.bossId === 'zero') return w.m.ready && !w.m.used ? 'voices' : 'none';
    if (w.bossId === 'kateino') return w.playT >= w.m.showReadyAt ? 'show' : 'wait';
    return 'none';
  }
  function dmgMult(w, crown) {
    // An unupgraded automatic shot stream takes about 60 beats at every challenge tempo.
    if (w.mode === 'challenge') return w.b.maxHp / 180;
    if (w.bossId === 'kateino') return w.playT < w.m.crackUntil ? 2 : 0.5;
    if (w.bossId === 'hikaku') return (1 - 0.2 * w.m.down) * (crown && w.hasOwl ? 2 : 1);
    return 1;
  }

  // One simulation step. Returns false while the hit stop freezes the world (the caller keeps the input for later).
  function step(w, dt, inp) {
    inp = inp || NO_INPUT;
    if (w.paused || !Number.isFinite(dt) || dt <= 0) return false;
    if (w.playtest) {
      if (w.playtest.phase === 'reaction') { w.playtest.left -= dt; if (w.playtest.left <= 0) { w.playtest = null; finishShow(w); } }
      return false;
    }
    dt *= w.scale;
    updateTempo(w);
    w.beat.previous = w.beat.phase; w.beat.time += dt; w.beat.phase += dt * w.beat.bpm / 60;
    if (inp.beat) pressBeat(w);
    if (w.hitstop > 0) { w.hitstop = Math.max(0, w.hitstop - dt); return false; }
    w.t += dt; w.stateT += dt;
    w.shake = Math.max(0, w.shake - dt * 34);
    w.flash = Math.max(0, w.flash - dt * 2.4);
    w.roar = Math.max(0, w.roar - dt);
    var b = w.b, p = w.p;
    b.flash = Math.max(0, b.flash - dt * 7); b.attackT -= dt; b.hurtT -= dt;
    b.tell = Math.max(0, (b.tell || 0) - dt * 4);
    p.sqT = Math.max(0, (p.sqT || 0) - dt); b.sqT = Math.max(0, (b.sqT || 0) - dt);
    if (b.tell > 0.92 && !b.tellSquashed) { squash(b, 1, 0.14); b.tellSquashed = true; }
    if (b.tell < 0.1) b.tellSquashed = false;
    b.whiteT = Math.max(0, (b.whiteT || 0) - dt); b.kick = Math.max(0, (b.kick || 0) - dt * 40);
    if (b.ghostHp > b.hp) b.ghostHp = Math.max(b.hp, b.ghostHp - Math.max(8, b.maxHp * 0.3) * dt);
    p.inv = Math.max(0, p.inv - dt); p.hurtT = Math.max(0, p.hurtT - dt);
    if (w.state === 'intro') stepIntro(w);
    else if (w.state === 'play') stepPlay(w, dt, inp);
    else if (w.state === 'win') stepWin(w, dt);
    stepShotsMove(w, dt);
    stepOptions(w, dt);
    stepFx(w, dt);
    stepTexts(w, dt);
    w.prevSkill = !!inp.skill;
    return true;
  }

  function stepIntro(w) {
    var p = w.p, s = w.stateT, k = clamp((s - INTRO_RISE_T) / INTRO_RISE_DUR, 0, 1), e = k * k * (3 - 2 * k);
    p.y = p.y0 + (PLAY_MID + 40 - p.y0) * e;
    p.risen = s > INTRO_RISE_T;
    var kb = clamp((s - INTRO_BOSS_IN) / (INTRO_END - INTRO_BOSS_IN), 0, 1), eb = 1 - Math.pow(1 - kb, 3);
    w.b.x = W + 170 + (w.def.x - (W + 170)) * eb;
    w.b.y = PLAY_MID;
    if (!w.introRise && s >= INTRO_RISE_T) { w.introRise = true; emit(w, 'rise'); sparks(w, p.x, p.y + 56, 18, '#8ff8ff', 220); }
    // R158: while a word card is up at the top (w.cardUp, set by the session), the opening line waits until the band in the middle
    // is gone, so no more than two text boxes are up at once. The hint behind it keeps its R86 length (introLate below).
    if (!w.introSaid && s >= (w.cardUp ? INTRO_TEXT_END : 0.7)) { w.introSaid = true; w.introLate = Math.max(0, s - 0.7); burst(w, w.lines.intro[0], w.lines.intro[1], 2.0); }
    if (s >= INTRO_END) {
      w.state = 'play'; w.stateT = 0; emit(w, 'start');
      var L = w.lines, hint = w.hasOwl && L.owlHint ? L.owlHint : L.hint;
      // R86: the hint comes up together with the move hint at the bottom, so it stays a second past it (it was gone in 3.2 s).
      if (hint) { burst(w, hint[0], hint[1], HINT_T + 1); var hq = w.burstQ[w.burstQ.length - 1]; if (hq) hq.until = w.t + HINT_T + 1 + (w.introLate || 0); }
    }
  }

  function stepWin(w, dt) {
    var p = w.p;
    p.x += (150 - p.x) * Math.min(1, dt * 1.5);
    p.y += (PLAY_MID + 30 - p.y) * Math.min(1, dt * 1.5);
    if (w.bossId === 'zero' && !w.zeroSaid && w.stateT >= 3.0) { w.zeroSaid = true; burst(w, '', w.lines.win, 2.6); emit(w, 'line'); }
  }

  function movePlayer(w, dt, inp) {
    var p = w.p, g = gap(w);
    var ax = inp.ax || 0, ay = inp.ay || 0, len = Math.sqrt(ax * ax + ay * ay);
    if (len > 1) { ax /= len; ay /= len; }
    p.x = clamp(p.x + ax * P_SPEED * dt + (inp.dx || 0), P_MIN_X, P_MAX_X);
    p.y = clamp(p.y + ay * P_SPEED * dt + (inp.dy || 0), g.top + 48, g.bottom - 48);
    // 移動の始まり(タメ→のび)。止まった瞬間は少しつぶれて「着地」のような手ごたえを出す
    var movingNow = len > 0.05 || Math.abs(inp.dx || 0) > 0.5 || Math.abs(inp.dy || 0) > 0.5;
    if (movingNow && !p.moving) squash(p, 1, 0.12);
    else if (!movingNow && p.moving) squash(p, -1, 0.1);
    p.moving = movingNow;
  }

  function handleSkill(w, dt, inp) {
    var p = w.p, mode = skillMode(w);
    if (inp.press) {
      if (mode === 'voices') { useVoices(w); return; }
      if (w.weapons.charge) { p.charging = true; p.charge = 0; }
      else if (mode === 'show') useShow(w);
      else emit(w, 'nope');
    } else if (inp.skill && !p.charging && w.weapons.charge && p.hurtT <= 0) {
      // A hit breaks the charge. While the button is still held, Fuku starts again (small hands do not let go).
      p.charging = true; p.charge = 0;
    }
    if (p.charging) {
      if ((inp.skill || inp.press) && w.t >= p.tigerReadyAt) {
        var before = p.charge;
        p.charge += dt;
        if (before < CHARGE_FULL && p.charge >= CHARGE_FULL) { emit(w, 'chargeFull'); sparks(w, p.x, p.y, 10, '#ffe27a', 140); }
      }
      if (inp.release || !inp.skill) {
        p.charging = false;
        if (p.charge >= CHARGE_FULL) fireTiger(w);
        else if (mode === 'show') useShow(w);
        p.charge = 0;
      }
    }
  }

  function useShow(w) {
    if (w.playtest) return;
    if (w.openPlaytest && w.playT >= w.m.showReadyAt) {
      w.playtest = { phase: 'game' };
      w.openPlaytest(function () { if (w.playtest) w.playtest = { phase: 'reaction', left: 1 }; });
      return;
    }
    finishShow(w);
  }
  function finishShow(w) {
    var m = w.m;
    if (w.playT < m.showReadyAt) { emit(w, 'nope'); return; }
    m.crackUntil = w.playT + SHOW_TIME;
    m.showReadyAt = w.playT + SHOW_TIME + SHOW_COOLDOWN;
    m.showed = true;
    w.b.hurtT = 0.6; w.shake = Math.max(w.shake, 10); w.flash = Math.max(w.flash, 0.45); w.hitstop = Math.max(w.hitstop, 0.15);
    burst(w, w.lines.show[0], w.lines.show[1], 2.2, true);
    toast(w, noticeText('crack'), 3);
    sparks(w, w.b.x - 40, w.b.y, 26, '#ffd27a', 260);
    emit(w, 'show');
  }

  function useVoices(w) {
    var m = w.m;
    m.used = true;
    burst(w, w.lines.use[0], w.lines.use[1], 2.4, true);
    emit(w, 'voices');
    win(w);
  }

  function fireTiger(w) {
    var p = w.p;
    w.shots.push({ kind: 'tiger', x: p.x + 50, y: p.y - 4, vx: 600, vy: 0, r: 46, dmg: 24, pierce: true, age: 0, hitBoss: false });
    p.tigerReadyAt = w.t + TIGER_REST; // Fuku rests a moment before the next big light
    w.roar = 0.7; w.shake = Math.max(w.shake, 6);
    sparks(w, p.x + 40, p.y, 22, '#9ff3ff', 260);
    emit(w, 'tiger');
  }

  function addShot(w, s) { if (!s.beatShot && w.beat.phase < w.beat.feverUntil) { s.dmg *= 2; s.fever = true; } s.age = 0; w.shots.push(s); w.stats.shots++; }

  function firePlayer(w, dt) {
    var p = w.p, wp = w.weapons;
    // Challenge keeps three base shots per beat as the tempo rises; story cadence is unchanged.
    var fireDt = dt * (w.mode === 'challenge' ? w.beat.bpm / 100 : 1);
    p.fireCd -= fireDt;
    while (p.fireCd <= 0) {
      p.fireCd += wp.rapid ? RAPID_INTERVAL : FIRE_INTERVAL;
      var sx = p.x + 44, sy = p.y - 6, kind = wp.rainbow ? 'rainbow' : 'fuku';
      addShot(w, { kind: kind, x: sx, y: sy, vx: 760, vy: 0, r: 9, dmg: 1, pierce: !!wp.rainbow });
      if (wp.twin) {
        if (!w.vectorSeen) { w.vectorSeen = true; w.vectorHint = { x: sx, y: sy, until: w.t + 0.5 }; }
        var a = 0.42; // wide enough that the diagonals mostly catch bugs and blocks, not the boss head-on
        addShot(w, { kind: kind, x: sx, y: sy, vx: 760 * Math.cos(a), vy: -760 * Math.sin(a), r: 8, dmg: 0.5, pierce: !!wp.rainbow, small: true });
        addShot(w, { kind: kind, x: sx, y: sy, vx: 760 * Math.cos(a), vy: 760 * Math.sin(a), r: 8, dmg: 0.5, pierce: !!wp.rainbow, small: true });
      }
      emit(w, 'shot');
    }
    if (wp.letter) {
      p.letterCd -= fireDt;
      if (p.letterCd <= 0) {
        p.letterCd = 0.8; p.letterSide *= -1;
        addShot(w, { kind: 'heart', x: p.x + 20, y: p.y - 10, vx: 300, vy: p.letterSide * 220, r: 11, dmg: 1.3, homing: true });
      }
    }
  }

  // Guardians fly behind the hero. Near the left edge they slide to above and below (the third one in front),
  // and they never leave the screen: in ジブン they take bullets, so the player has to see them.
  var OPT_SLOTS = [[-60, -62], [-60, 60], [-104, 0]], OPT_SLOTS_EDGE = [[-6, -94], [-6, 94], [52, 160]];
  function stepOptions(w, dt) {
    var p = w.p, e = clamp((150 - p.x) / 80, 0, 1), side = p.y < PLAY_MID ? 1 : -1;
    w.options.forEach(function (o, i) {
      var a = OPT_SLOTS[i], b = OPT_SLOTS_EDGE[i], by = i === 2 ? b[1] * side : b[1];
      var tx = clamp(p.x + lerp(a[0], b[0], e), 32, W - 32), ty = clamp(p.y + lerp(a[1], by, e), PLAY_T + 32, PLAY_B - 32);
      var k = Math.min(1, dt * (7 - i * 1.5));
      o.x += (tx - o.x) * k; o.y += (ty - o.y) * k;
      o.blockCd = Math.max(0, o.blockCd - dt); o.flash = Math.max(0, o.flash - dt * 3);
      if (w.state !== 'play') return;
      o.cd -= dt;
      if (o.cd <= 0) { o.cd = 0.45; addShot(w, { kind: 'opt', x: o.x + 18, y: o.y, vx: 700, vy: 0, r: 7, dmg: 0.4 }); }
    });
  }

  function stepPlay(w, dt, inp) {
    w.playT += dt;
    movePlayer(w, dt, inp);
    handleSkill(w, dt, inp);
    if (w.state !== 'play' || w.playtest) return;
    firePlayer(w, dt);
    moveBoss(w, dt);
    if (w.mode === 'challenge') challengeAttack(w); else MECH[w.bossId](w, dt);
    stepShotHits(w);
    stepEnemyBullets(w, dt);
    stepBugs(w, dt);
    stepPickups(w, dt);
    var bar = w.p.barrier;
    if (bar && !bar.up && w.t >= bar.at) { bar.up = true; emit(w, 'barrierBack'); }
  }

  function moveBoss(w, dt) {
    var b = w.b, d = w.def, t = w.playT;
    if (w.bossId === 'jibun') {
      // ジブン follows the hero's height, but slowly, so moving up or down gets the hero out of its line.
      b.y += (w.p.y - b.y) * Math.min(1, dt * 0.6);
      b.x = d.x + Math.sin(t * 0.9) * 14;
    } else {
      b.y = PLAY_MID + Math.sin(t * d.moveF) * d.moveA + Math.sin(t * 1.37) * 34;
      b.x = d.x + Math.sin(t * 0.7) * 10;
      // R111: while the move hint is up, the boss's picture stays above its plate so it does not hide the two lines.
      // The limit then drops away over HINT_FREE s, so the boss eases back into its full swing instead of jumping.
      if (w.state === 'play' && w.stateT < HINT_T + HINT_FREE) {
        var lim = HINT_PLATE_T - 6 - d.drawH / 2 + Math.max(0, w.stateT - HINT_T) / HINT_FREE * d.moveA;
        if (b.y > lim) b.y = lim;
      }
    }
    if (w.bossId === 'kateino') { var g = gap(w); b.y = clamp(b.y, g.top + 90, g.bottom - 90); }
  }

  function aimV(w, sx, sy, speed, off) {
    var a = Math.atan2(w.p.y - sy, w.p.x - sx) + (off || 0);
    return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, a: a };
  }
  function addBullet(w, o) { o.bornBeat = w.beat.phase; o.bornTime = w.beat.time; o.age = 0; w.eb.push(o); w.stats.enemyBullets++; return o; }
  // Spawn x for a bullet of half width hw: never inside the area the hero can reach, so nothing appears on top of them.
  function spawnX(w, dx, hw) { return Math.max(w.b.x + dx, P_MAX_X + P_R + 26 + (hw || 0)); }
  function fan(w, sx, sy, n, spread, speed, kind, r, off) {
    var c = aimV(w, sx, sy, speed, off || 0).a;
    for (var i = 0; i < n; i++) {
      var a = c + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      addBullet(w, { kind: kind, x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: r || 9 });
    }
  }
  function ring(w, sx, sy, n, speed, rot, kind) {
    for (var i = 0; i < n; i++) {
      var a = rot + i / n * Math.PI * 2;
      addBullet(w, { kind: kind, x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: kind === 'star' ? 10 : 9 });
    }
  }
  function spawnPickup(w, kind, data) {
    var g = gap(w), y = g.top + 110 + w.rng() * Math.max(10, g.bottom - g.top - 220);
    // 危ないけれど取りたくなる所: 3割くらいは、いまある敵の弾の近くに出す。取れなくても勝てる難しさは変えない
    var live = w.eb.filter(function (e) { return !e.dead; });
    if (live.length && w.rng() < 0.3) {
      var pick = live[Math.floor(w.rng() * live.length)];
      y = clamp(pick.y + (w.rng() - 0.5) * 60, g.top + 90, g.bottom - 90);
    }
    w.pickups.push({ kind: kind, data: data || null, x: W + 50, y: y, y0: y, vx: kind === 'voice' ? -82 : -72, age: 0, ph: w.rng() * 6 });
  }
  function hasPickup(w, kind) { return w.pickups.some(function (pk) { return pk.kind === kind; }); }

  var MECH = {
    bugking: function (w, dt) {
      var m = w.m, b = w.b, f = dens(w);
      if (attackDue(w, 'blockT', dt)) {
        // The first blocks are slow, far apart and aimed loosely (a hero who stands still is not hit every time).
        var r = ramp(w);
        m.blockT = lerp(2.3, 1.6, r) / f;
        var bx = spawnX(w, -70, 17), v = aimV(w, bx, b.y + 16, lerp(160, 225, r), (w.rng() - 0.5) * lerp(0.55, 0.16, r));
        addBullet(w, { kind: 'block', x: bx, y: b.y + 16, vx: v.vx, vy: v.vy, hw: 17, hh: 17, hp: 2 });
        b.attackT = 0.4; squash(b, -1, 0.12); emit(w, 'eshot');
      }
      if (!b.phase2 && b.hp <= b.maxHp / 2) {
        b.phase2 = true; toast(w, w.lines.half, 2.6); w.shake = Math.max(w.shake, 8); emit(w, 'phase');
      }
      if (b.phase2) {
        if (attackDue(w, 'spreadT', dt)) { m.spreadT = 3.0 / f; fan(w, spawnX(w, -60, 9), b.y, Math.max(3, Math.round(5 * f)), 0.95, 185, 'orb'); b.attackT = 0.4; }
        if (attackDue(w, 'bugT', dt)) {
          m.bugT = 4.2 / f;
          if (w.bugs.length < 4) w.bugs.push({ x: spawnX(w, -50, 18), y: b.y + (w.rng() - 0.5) * 120, hp: 3, age: 0, ph: w.rng() * 6, r: 18 });
        }
      }
    },
    kateino: function (w, dt) {
      var m = w.m, b = w.b, f = dens(w), t = w.playT, cracked = t < m.crackUntil;
      var cyc = t % 16, target = 0;
      if (cyc < 4) target = 125 * cyc / 4; else if (cyc < 10) target = 125; else if (cyc < 13) target = 125 * (1 - (cyc - 10) / 3);
      if (cracked) target = 0;
      m.wall += clamp(target - m.wall, -dt * 240, dt * 70);
      if (attackDue(w, 'waveT', dt)) {
        m.waveT = 3.0 / f;
        var n = Math.max(1, Math.round(2 * f)), g = gap(w);
        // Every 3rd wave lands when the wall is near its highest point (cyc 4〜10): a rare "全部の ことば" triple,
        // faster and centered, so the usual two-bubble pattern gets a periodic accent instead of repeating forever unchanged.
        var chord = (m.waveCycle++ % 3 === 2) && !cracked && cyc >= 4 && cyc < 10;
        var count = chord ? 3 : n;
        for (var i = 0; i < count; i++) {
          var text = BUBBLE_WORDS[m.k++ % BUBBLE_WORDS.length], hw = (textW(text, 24) + 34) / 2;
          // Bubbles pass above and below the boss line, so the lane in front of the boss stays open for shooting.
          var off = chord ? (i - 1) * 125 : n === 1 ? (m.k % 2 ? 125 : -125) : (i === 0 ? -125 : 125);
          var y0 = clamp(b.y + off, g.top + 70, g.bottom - 70);
          addBullet(w, { kind: 'bubble', x: spawnX(w, -70 - hw, hw), y: y0, y0: y0, vx: chord ? -175 : -140, vy: 0, hw: hw, hh: 26, hp: 3, text: text, amp: chord ? 30 : 48, freq: 2.0, ph: i * Math.PI, chord: chord });
        }
        if (chord) { w.shake = Math.max(w.shake, 3); toast(w, '…ぜんぶ いっぺんに？', 1.4); }
        b.attackT = 0.45; squash(b, -1, 0.12); emit(w, 'eshot');
      }
      if (b.hp <= b.maxHp / 2) {
        if (attackDue(w, 'sighT', dt)) { m.sighT = 3.6 / f; fan(w, spawnX(w, -80, 9), b.y, Math.max(1, Math.round(2 * f)), 0.45, 180, 'sigh'); }
      }
      // Sora says it again, plainer, if the button has not been pressed yet.
      if (!m.showed && t >= m.hint2At && w.lines.hint2) { m.hint2At = Infinity; burst(w, w.lines.hint2[0], w.lines.hint2[1], 3.0); }
    },
    hikaku: function (w, dt) {
      var m = w.m, b = w.b, f = dens(w);
      if (attackDue(w, 'numT', dt)) {
        m.numT = 1.8 / f;
        var text = NUMBER_WORDS[m.k++ % NUMBER_WORDS.length], hw = (textW(text, 24) + 26) / 2;
        var nx = spawnX(w, -70, hw), v = aimV(w, nx, b.y - 10, 235, 0);
        addBullet(w, { kind: 'number', x: nx, y: b.y - 10, vx: v.vx, vy: v.vy, hw: hw, hh: 23, hp: 3, text: text });
        b.attackT = 0.4; squash(b, -1, 0.12); emit(w, 'eshot');
      }
      if (b.hp <= b.maxHp / 2) {
        if (attackDue(w, 'ringT', dt)) { m.ringT = 3.3 / f; m.rot += 0.4; ring(w, spawnX(w, -20, 10), b.y, Math.max(4, Math.round(8 * f)), 165, m.rot, 'star'); }
      }
      if (!hasPickup(w, 'pace') && w.playT >= m.paceAt) spawnPickup(w, 'pace');
    },
    jibun: function (w, dt) {
      var m = w.m, b = w.b, f = dens(w), t = w.playT;
      if (attackDue(w, 'ballT', dt)) {
        var r = ramp(w);
        m.ballT = lerp(2.0, 1.35, r) / f;
        fan(w, spawnX(w, -40, 10), b.y - 6, m.made >= 2 ? Math.max(1, Math.round(3 * f)) : m.made >= 1 ? Math.max(1, Math.round(2 * f)) : 1, 0.5,
          lerp(150, 180, r), 'gray', 10, (w.rng() - 0.5) * lerp(0.5, 0.14, r));
        b.attackT = 0.4; squash(b, -1, 0.12); emit(w, 'eshot');
      }
      if (t >= m.tauntAt) { m.tauntAt = t + 13; var tl = w.lines.taunts || []; if (tl.length) burst(w, w.def.name, tl[m.tauntK++ % tl.length], 2.4); }
      if (!hasPickup(w, 'make') && t >= m.makeAt && m.made < w.def.makes) spawnPickup(w, 'make');
    },
    zero: function (w, dt) {
      var m = w.m, b = w.b, f = dens(w) * (m.ready ? 0.6 : 1);
      var r = ramp(w);
      if (attackDue(w, 'ringT', dt)) { m.ringT = lerp(4.0, 3.0, r) / f; m.rot += 0.5; ring(w, spawnX(w, -30, 9), b.y, Math.max(5, Math.round(10 * f)), 150, m.rot, 'orb'); b.attackT = 0.5; }
      if (attackDue(w, 'noiseT', dt)) {
        m.noiseT = lerp(2.5, 1.7, r) / f;
        var zx = spawnX(w, -60, 14), v = aimV(w, zx, b.y, lerp(165, 220, r), (w.rng() - 0.5) * lerp(0.5, 0.2, r));
        addBullet(w, { kind: 'noise', x: zx, y: b.y, vx: v.vx, vy: v.vy, hw: 14, hh: 14, hp: 1 });
      }
      if (!m.ready && !hasPickup(w, 'voice') && w.playT >= m.voiceAt) spawnPickup(w, 'voice', m.voices[m.got]);
    }
  };

  // Shots move every state (they fly off after a win); hits only count while playing.
  function stepShotsMove(w, dt) {
    var b = w.b;
    for (var i = 0; i < w.shots.length; i++) {
      var s = w.shots[i];
      s.age += dt;
      if (s.homing && w.state === 'play') {
        var tgt = null, best = 1e12;
        w.bugs.forEach(function (bg) { var d = dist2(s.x, s.y, bg.x, bg.y); if (d < best) { best = d; tgt = bg; } });
        if (!w.def.through && !w.def.immune) {
          var d2 = dist2(s.x, s.y, b.x, b.y + w.def.bodyDY);
          if (d2 < best || !tgt) { best = d2; tgt = { x: b.x, y: b.y + w.def.bodyDY }; }
        }
        if (tgt) {
          var cur = Math.atan2(s.vy, s.vx), want = Math.atan2(tgt.y - s.y, tgt.x - s.x), diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          cur += clamp(diff, -5 * dt, 5 * dt);
          var sp = Math.min(470, Math.sqrt(s.vx * s.vx + s.vy * s.vy) + 300 * dt);
          s.vx = Math.cos(cur) * sp; s.vy = Math.sin(cur) * sp;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x > W + 100 || s.x < -80 || s.y < PLAY_T - 60 || s.y > PLAY_B + 60) s.dead = true;
    }
    w.shots = w.shots.filter(function (s) { return !s.dead; });
  }

  function overlapEB(e, cx, cy, r) {
    if (e.r) return dist2(e.x, e.y, cx, cy) < (e.r + r) * (e.r + r);
    var nx = clamp(cx, e.x - e.hw, e.x + e.hw), ny = clamp(cy, e.y - e.hh, e.y + e.hh);
    return dist2(nx, ny, cx, cy) < r * r;
  }

  function stepShotHits(w) {
    var b = w.b, d = w.def;
    for (var i = 0; i < w.shots.length; i++) {
      var s = w.shots[i];
      if (s.dead) continue;
      // Enemy bullets: blocks/bubbles/numbers stop normal shots; rainbow and the tiger go through.
      for (var j = 0; j < w.eb.length && !s.dead; j++) {
        var e = w.eb[j];
        if (e.dead || !overlapEB(e, s.x, s.y, s.r)) continue;
        if (s.kind === 'tiger') { e.dead = true; sparks(w, e.x, e.y, 6, '#9ff3ff', 180); continue; }
        if (!(e.hp > 0)) continue;
        e.hp -= s.dmg; e.flash = 1;
        if (e.hp <= 0) { e.dead = true; sparks(w, e.x, e.y, 8, e.kind === 'number' ? '#ffd24a' : '#e8f0ff', 200); emit(w, 'pop'); }
        if (!s.pierce) { s.dead = true; sparks(w, s.x, s.y, 2, '#ffffff', 90); }
      }
      if (s.dead) continue;
      for (var k = 0; k < w.bugs.length; k++) {
        var bg = w.bugs[k];
        if (bg.dead || dist2(s.x, s.y, bg.x, bg.y) > (bg.r + s.r) * (bg.r + s.r)) continue;
        bg.hp -= s.dmg; bg.flash = 1;
        if (bg.hp <= 0) { bg.dead = true; sparks(w, bg.x, bg.y, 14, '#9dff8a', 230); w.hitstop = Math.max(w.hitstop, 0.04); emit(w, 'pop'); }
        if (s.kind !== 'tiger') { s.dead = true; break; }
      }
      if (s.dead) continue;
      if (s.kind === 'tiger' && s.hitBoss) continue;
      var crown = false;
      if (d.crown) { var cx = b.x + d.crown[0], cy = b.y + d.crown[1]; crown = dist2(s.x, s.y, cx, cy) < (d.crown[2] + s.r) * (d.crown[2] + s.r); }
      if (!crown && dist2(s.x, s.y, b.x, b.y + d.bodyDY) > (d.bodyR + s.r) * (d.bodyR + s.r)) continue;
      if (d.through) { s.ghost = true; continue; }
      if (d.immune) {
        s.dead = true; sparks(w, s.x, s.y, 3, '#b9a7ff', 120);
        if (!w.m.toldImmune) { w.m.toldImmune = true; toast(w, noticeText('immune'), 2); }
        continue;
      }
      if (s.kind === 'tiger') s.hitBoss = true; else s.dead = true;
      damageBoss(w, s.dmg * dmgMult(w, crown), s, crown);
      if (w.state !== 'play') break;
    }
    w.eb = w.eb.filter(function (e) { return !e.dead; });
    w.bugs = w.bugs.filter(function (bg) { return !bg.dead; });
  }

  function damageBoss(w, dmg, s, crown) {
    var b = w.b;
    b.hp = Math.max(0, b.hp - dmg); b.flash = 1;
    w.stats.hits++; w.stats.damage += dmg; w.stats.byKind[s.kind] = (w.stats.byKind[s.kind] || 0) + dmg;
    var big = s.kind === 'tiger', gold = crown && w.hasOwl;
    // Looks only (damage is the same): a white flash on the boss, a small push back, more sparks and a ring where the shot lands.
    // At most one white flash per 0.12 s, so with many weapons the boss blinks instead of staying white.
    if (big || !(w.t - (b.whiteAt || -9) < 0.12)) { b.whiteT = 0.06; b.whiteAt = w.t; }
    b.kick = Math.min(5, (b.kick || 0) + (big ? 8 : 2.5));
    sparks(w, s.x + 6, s.y, big ? 26 : (gold ? 8 : 6), gold ? '#ffe066' : '#c8fbff', big ? 320 : 190);
    if (w.fx.length < 420) w.fx.push({ ring: true, x: s.x + 8, y: s.y, vx: 0, vy: 0, age: 0, life: big ? 0.3 : 0.16, size: big ? 70 : 22, color: gold ? '#ffe066' : '#ffffff' });
    if (big) { w.hitstop = Math.max(w.hitstop, 0.13); w.shake = Math.max(w.shake, 11); b.hurtT = 0.45; emit(w, 'bigHit'); }
    else {
      if (w.t - w.lastStopAt > 0.15) { w.hitstop = Math.max(w.hitstop, 0.018); w.lastStopAt = w.t; }
      w.shake = Math.max(w.shake, 1.6); emit(w, gold ? 'crit' : 'hit');
    }
    var pct = b.hp / b.maxHp * 100, L = w.lines;
    [75, 50, 25].forEach(function (th) {
      if (!b.shown[th] && pct <= th) {
        b.shown[th] = true;
        if (L.bursts && L.bursts[th]) burst(w, w.def.name, L.bursts[th], 2.6, true);
        w.hitstop = Math.max(w.hitstop, 0.1); w.flash = Math.max(w.flash, 0.3); b.hurtT = 0.4; emit(w, 'line');
      }
    });
    updateTempo(w);
    if (w.mode === 'challenge') w.hitstop = 0;
    if (b.hp <= 0) win(w);
  }

  function hurt(w) {
    var p = w.p;
    if (w.state !== 'play' || p.inv > 0) return false;
    if (p.barrier && p.barrier.up) {
      w.ifUntil = w.t + 0.6;
      p.barrier.up = false; p.barrier.at = w.t + BARRIER_BACK; p.inv = INVULN;
      sparks(w, p.x, p.y, 18, '#9fe8ff', 240); w.shake = Math.max(w.shake, 5); emit(w, 'barrier');
      return true;
    }
    setCombo(w, 0);
    w.stats.hurts++;
    if (!w.god && !w.cheats.godmode) p.hearts = Math.max(0, p.hearts - 1);
    if (p.charging) p.brokeAt = w.t;
    p.inv = INVULN; p.hurtT = 0.5; p.charging = false; p.charge = 0;
    squash(p, -1, 0.16);
    breather(w);
    w.shake = Math.max(w.shake, 12); w.hitstop = Math.max(w.hitstop, 0.12); w.flash = Math.max(w.flash, 0.25);
    sparks(w, p.x, p.y, 16, '#ff9aa8', 230);
    emit(w, 'hurt');
    if (p.hearts <= 0) lose(w);
    return true;
  }

  // After a hit: bullets close to the hero vanish and the next aimed shot waits until the blink is almost over.
  function breather(w) {
    var p = w.p, m = w.m;
    w.eb.forEach(function (e) {
      if (!e.dead && dist2(e.x, e.y, p.x, p.y) < BREATHER_R * BREATHER_R) { e.dead = true; sparks(w, e.x, e.y, 4, '#ffffff', 120); }
    });
    ['blockT', 'ballT', 'noiseT'].forEach(function (k) { if (typeof m[k] === 'number') m[k] = Math.max(m[k], INVULN + 0.4); });
  }

  function numberHit(w) {
    var m = w.m, p = w.p;
    if (p.inv > 0) return false;
    setCombo(w, 0);
    p.inv = 0.4;
    m.down = Math.min(3, m.down + 1);
    toast(w, noticeText('down'), 2.2);
    sparks(w, p.x, p.y, 10, '#ffcf4a', 180); w.shake = Math.max(w.shake, 5);
    emit(w, 'down');
    return true;
  }

  function stepEnemyBullets(w, dt) {
    var p = w.p, jibun = w.bossId === 'jibun';
    for (var i = 0; i < w.eb.length; i++) {
      var e = w.eb[i];
      if (e.dead) continue;
      e.age += dt; e.flash = Math.max(0, (e.flash || 0) - dt * 8);
      if (e.kind === 'bubble') { e.x += e.vx * dt; e.y = e.y0 + Math.sin(e.age * e.freq + e.ph) * e.amp; }
      else { e.x += e.vx * dt; e.y += e.vy * dt; }
      // A bubble pops at the left edge of the screen, so its words are never cut in half by the edge.
      if (e.kind === 'bubble' && e.x - e.hw <= BUBBLE_POP_X) { e.dead = true; sparks(w, BUBBLE_POP_X + 6, e.y, 6, '#fffaf0', 120); continue; }
      if (e.x < -140 || e.x > W + 160 || e.y < PLAY_T - 90 || e.y > PLAY_B + 90) { e.dead = true; continue; }
      if (jibun) {
        for (var k = 0; k < w.options.length; k++) {
          var o = w.options[k];
          if (o.blockCd <= 0 && overlapEB(e, o.x, o.y, 24)) { e.dead = true; o.blockCd = 1.6; o.flash = 1; sparks(w, e.x, e.y, 8, '#e9f6ff', 160); emit(w, 'block'); break; }
        }
        if (e.dead) continue;
      }
      if (w.state === 'play' && overlapEB(e, p.x, p.y - 4, P_HIT_R)) {
        if (e.kind === 'number') { if (numberHit(w)) e.dead = true; }
        else if (hurt(w)) e.dead = true;
      }
    }
    w.eb = w.eb.filter(function (e) { return !e.dead; });
  }

  function stepBugs(w, dt) {
    var p = w.p;
    w.bugs.forEach(function (bg) {
      bg.age += dt; bg.flash = Math.max(0, (bg.flash || 0) - dt * 8);
      bg.x -= 118 * dt;
      bg.y += clamp(p.y - bg.y, -60, 60) * dt * 0.9 + Math.sin(bg.age * 4 + bg.ph) * 50 * dt;
      if (bg.x < -40) bg.dead = true;
      else if (w.state === 'play' && dist2(bg.x, bg.y, p.x, p.y) < (bg.r + P_HIT_R) * (bg.r + P_HIT_R) && hurt(w)) { bg.dead = true; sparks(w, bg.x, bg.y, 10, '#9dff8a', 200); }
    });
    w.bugs = w.bugs.filter(function (bg) { return !bg.dead; });
  }

  function stepPickups(w, dt) {
    var p = w.p, m = w.m;
    w.pickups.forEach(function (pk) {
      pk.age += dt;
      pk.x += pk.vx * dt;
      var g = gap(w);
      pk.y = clamp(pk.y0 + Math.sin(pk.age * 1.6 + pk.ph) * 34, g.top + 60, g.bottom - 60);
      if (dist2(pk.x, pk.y, p.x, p.y) < 48 * 48) { pk.dead = true; collect(w, pk); }
      else if (pk.x < -60) {
        pk.dead = true;
        if (pk.kind === 'pace') m.paceAt = w.playT + 5;
        if (pk.kind === 'make') m.makeAt = w.playT + 4;
        if (pk.kind === 'voice') m.voiceAt = w.playT + 4;
      }
    });
    w.pickups = w.pickups.filter(function (pk) { return !pk.dead; });
  }

  function collect(w, pk) {
    var m = w.m, L = w.lines;
    sparks(w, pk.x, pk.y, 22, pk.kind === 'pace' ? '#a6ffb0' : pk.kind === 'make' ? '#ffe39a' : '#ffc6f0', 240);
    w.flash = Math.max(w.flash, 0.2);
    emit(w, 'pickup');
    if (pk.kind === 'pace') {
      m.down = Math.max(0, m.down - 1);
      toast(w, noticeText('pace'), 2.6);
      m.paceAt = w.playT + (m.down > 0 ? 8 : 16);
    } else if (pk.kind === 'make') {
      m.made++;
      var st = (L.steps || [])[m.made - 1];
      // The last step line is the same as the win line, which is shown large after the win, so it is not shown twice.
      if (m.made >= w.def.makes) { if (st && st[1] !== L.win) burst(w, st[0], st[1], 2.6, true); win(w); return; }
      if (st) burst(w, st[0], st[1], 2.4, true);
      toast(w, noticeText('made', m.made + '/' + w.def.makes), 2.2);
      m.makeAt = w.playT + 44;
    } else if (pk.kind === 'voice') {
      var v = pk.data || m.voices[m.got] || { name: '', text: '' };
      m.got++;
      m.connected.push(v);
      ticker(w, (v.name ? v.name + '「' : '「') + v.text + '」');
      if (m.got >= m.voices.length) { m.ready = true; toast(w, L.ready === BOSSES.zero.lines.ready ? noticeText('ready') : L.ready, 3); emit(w, 'ready'); }
      else { toast(w, noticeText('voice', m.got + '/' + m.voices.length), 2); m.voiceAt = w.playT + 19; }
    }
  }

  function win(w) {
    if (w.state !== 'play') return;
    if (w.mode === 'challenge') { w.score += w.stage * 1000; w.p.hearts = Math.min(w.p.maxHearts, w.p.hearts + 1); setStage(w, w.stage + 1); emit(w, 'stage'); return; }
    w.state = 'win'; w.stateT = 0; w.winKind = w.bossId;
    var p = w.p; p.charging = false; p.charge = 0;
    w.eb.forEach(function (e) { sparks(w, e.x, e.y, 3, '#ffffff', 120); });
    w.bugs.forEach(function (bg) { sparks(w, bg.x, bg.y, 6, '#9dff8a', 160); });
    w.eb = []; w.bugs = []; w.pickups = []; w.toast = null;
    w.hitstop = Math.max(w.hitstop, 0.28); w.shake = 14; w.flash = 0.9;
    sparks(w, w.b.x, w.b.y, 50, w.def.color, 380);
    var L = w.lines;
    if (w.def.hp && L.bursts && L.bursts[0]) { w.burstQ = []; w.burst = null; burst(w, w.def.name, L.bursts[0], 2.8); }
    emit(w, 'win');
  }
  function winHold(w) { return w.bossId === 'zero' ? 6.2 : 3.8; }

  function lose(w) {
    if (w.state !== 'play') return;
    w.state = 'lose'; w.stateT = 0;
    w.p.charging = false;
    w.eb.forEach(function (e) { sparks(w, e.x, e.y, 2, '#ffffff', 80); });
    w.eb = []; w.bugs = [];
    emit(w, 'lose');
  }

  function stepFx(w, dt) {
    for (var i = 0; i < w.fx.length; i++) {
      var f = w.fx[i];
      f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92;
    }
    w.fx = w.fx.filter(function (f) { return f.age < f.life; });
  }
  function stepTexts(w, dt) {
    // R97: the extra reading time gives way to a waiting hint with an end time, so the hint keeps its R86 length.
    // R154: cutting the time short used to drop the line from full to half in one frame; now it fades out from full over what is left.
    if (w.burst && w.burst.base != null && w.burst.dur > w.burst.base && w.burstQ.some(function (q) { return q.until != null; })) {
      var cb = w.t - w.burst.t;
      w.burst.dur = w.burst.base - cb >= BURST_MIN_OUT ? w.burst.base : cb + BURST_MIN_OUT;
      w.burst.out = Math.min(BURST_OUT, w.burst.dur - cb);
      w.burst.base = w.burst.dur; // cut only once, so the time does not grow again next frame
    }
    if (w.burst && w.t - w.burst.t > w.burst.dur) w.burst = null;
    // R86: a line with an end time (the opening hint) that had to wait behind other lines only shows for what is left, or not at all.
    while (!w.burst && w.burstQ.length) {
      var nx = w.burstQ.shift();
      if (nx.until != null) { if (nx.until - w.t < 1) continue; nx.dur = Math.min(nx.dur, nx.until - w.t); }
      if (nx.until == null) { nx.base = nx.dur; nx.dur = readDur(nx.text, nx.dur); }
      w.burst = nx; w.burst.t = w.t;
    }
    if (w.toast && w.t - w.toast.t > w.toast.dur) w.toast = null;
    w.tickers.forEach(function (tk) { tk.x -= 130 * dt; });
    w.tickers = w.tickers.filter(function (tk) { return tk.x + textW(tk.text, 26) > -20; });
  }

  function debugWin(w) {
    if (w.state === 'intro') { w.state = 'play'; w.stateT = 0; }
    if (w.state !== 'play') return false;
    if (w.def.hp) { w.b.hp = 0; w.b.ghostHp = 0; }
    if (w.bossId === 'jibun') w.m.made = w.def.makes;
    if (w.bossId === 'zero') { w.m.got = w.m.voices.length; w.m.connected = w.m.voices.slice(); w.m.ready = true; w.m.used = true; burst(w, w.lines.use[0], w.lines.use[1], 2.4); }
    win(w);
    return true;
  }
  function debugSetHearts(w, n) {
    var p = w.p;
    n = Math.max(0, Math.min(9, Math.round(Number(n) || 0)));
    if (n > p.maxHearts) p.maxHearts = n;
    p.hearts = n;
    if (n <= 0) { if (w.state === 'intro') { w.state = 'play'; w.stateT = 0; } lose(w); }
  }
  // R72: a word card stops the clock, so a line or notice caught while fading in or out would stay
  // see-through over the background for as long as the card is up. Hold them at full strength instead;
  // after the card they fade in or out from there as usual.
  function holdTextsForCards(w) {
    [w.burst, w.toast].forEach(function (o) {
      if (!o) return;
      var lo = 0.17, hi = o.dur - (o.out || BURST_OUT) - 0.01; // just inside the 1/6 s fade-in and the fade-out
      if (hi > lo) o.t = w.t - clamp(w.t - o.t, lo, hi);
    });
    // R179: the first word card of the fight comes up on the first frame of play, so the move hint
    // (「ゆびを すべらせて うごく」) was held almost see-through for the whole card. Hold it full, or
    // let it go when the card catches it already fading out.
    if (w.state === 'play' && w.stateT < HINT_T) {
      if (w.stateT < HINT_IN) w.stateT = HINT_IN;
      else if (w.stateT > HINT_T - HINT_OUT) w.stateT = HINT_T;
    }
  }

  function debugCollect(w) {
    if (w.state !== 'play') return false;
    var kind = w.bossId === 'hikaku' ? 'pace' : w.bossId === 'jibun' ? 'make' : w.bossId === 'zero' ? 'voice' : '';
    if (!kind || (kind === 'voice' && w.m.ready)) return false;
    var pk = w.pickups.filter(function (q) { return q.kind === kind; })[0];
    if (!pk) { spawnPickup(w, kind, kind === 'voice' ? w.m.voices[w.m.got] : null); pk = w.pickups[w.pickups.length - 1]; }
    pk.x = w.p.x; pk.y0 = pk.y = w.p.y;
    stepPickups(w, 0);
    return true;
  }

  var SIM = {
    W: W, H: H, FIRE_INTERVAL: FIRE_INTERVAL, RAPID_INTERVAL: RAPID_INTERVAL, PLAY_T: PLAY_T, PLAY_B: PLAY_B, CHARGE_FULL: CHARGE_FULL, BARRIER_BACK: BARRIER_BACK, SHOW_TIME: SHOW_TIME, SHOW_COOLDOWN: SHOW_COOLDOWN,
    BOSSES: BOSSES, WEAPONS: WEAPONS, DEFAULT_VOICES: DEFAULT_VOICES, normalizeWeapons: normalizeWeapons, normalizeOptions: normalizeOptions,
    hitboxes: hitboxes, MUSIC: MUSIC, beatInfo: beatInfo, pressBeat: pressBeat, setCombo: setCombo, setStage: setStage, result: result,
    createWorld: createWorld, step: step, skillMode: skillMode, dmgMult: dmgMult, dens: dens, gap: gap, wallLabels: wallLabels, BUBBLE_POP_X: BUBBLE_POP_X, hurt: hurt, win: win, winHold: winHold,
    addBullet: addBullet, spawnPickup: spawnPickup, debugWin: debugWin, debugSetHearts: debugSetHearts, debugCollect: debugCollect,
    P_HIT_R: P_HIT_R, squash: squash, squashScale: squashScale, holdTextsForCards: holdTextsForCards, readDur: readDur, burst: burst
  };

  SIM.wordCardsFreezeStep = wordCardsFreezeStep;
  SIM.INTRO = { textEnd: INTRO_TEXT_END, riseT: INTRO_RISE_T, riseDur: INTRO_RISE_DUR, linesT: INTRO_LINES_T, bossIn: INTRO_BOSS_IN, end: INTRO_END, plateT: INTRO_PLATE_T, plateH: INTRO_PLATE_H, signY: NEON_SIGN_Y, heroH: P_DRAW_H, hintT: HINT_T, hintPlateT: HINT_PLATE_T, hintOut: HINT_OUT };
  SIM.hintAlpha = hintAlpha; SIM.moveHintLines = moveHintLines; SIM.bandLabel = bandLabel; SIM.noticeText = noticeText; SIM.skillLabel = skillLabel; SIM.burstAlpha = burstAlpha;
  RYW.Shooter = { start: hasDOM ? start : function () { throw new Error('RYW.Shooter.start needs a browser'); }, version: '1', cooldownText: cooldownText, cooldownLabel: cooldownLabel, syncWeaponNames: syncWeaponNames, _sim: SIM };
  if (typeof module === 'object' && module && module.exports) module.exports = RYW.Shooter;
  if (!hasDOM) return;

  // ============ ここから下は画面・音・操作（ブラウザだけ） ============
  var current = null, lastState = 'idle', lastResult = '';
  // platform -> { paused } so a second battle on the same host knows the host is still paused.
  var hookedPlatforms = typeof WeakMap === 'function' ? new WeakMap() : null;

  // ---- 素材 ----
  var SHEET_SIZE = { ryosei: [4, 4], bugking: [3, 3], kateino: [3, 3], hikaku: [3, 3], zero: [3, 3], tiger: [2, 2], spirits: [4, 4], summons: [3, 2], items: [4, 4] };
  var sheetCache = {}, imageCache = {}, grayCache = null;
  function assetBases() {
    // v5/assets first. kateino and hikaku currently live only in the root assets/, so fall back there.
    var out = [];
    try { out.push(new URL('../assets/', SCRIPT_URL).href); } catch (_) { out.push('assets/'); }
    try { out.push(new URL('../../assets/', SCRIPT_URL).href); } catch (_) { out.push('../assets/'); }
    return out;
  }
  function loadImage(url) {
    if (imageCache[url]) return imageCache[url];
    imageCache[url] = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
    return imageCache[url];
  }
  function loadSheet(name) {
    if (sheetCache[name]) return sheetCache[name];
    var bases = assetBases();
    sheetCache[name] = (function tryBase(i) {
      if (i >= bases.length) return Promise.resolve(null);
      var dir = bases[i] + name + '/';
      return fetch(dir + name + '_frames.json').then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); }).then(function (list) {
        if (!Array.isArray(list) || !list.length) throw new Error('empty');
        var sheet = { name: name, frames: {}, cw: list[0].w, ch: list[0].h };
        return Promise.all(list.map(function (f) {
          if (!/^[-a-zA-Z0-9_]+\.png$/.test(f.file)) return null;
          return loadImage(dir + f.file).then(function (img) { if (img) sheet.frames[f.row + '_' + f.col] = img; });
        })).then(function () { return Object.keys(sheet.frames).length ? sheet : null; });
      }).catch(function () { return tryBase(i + 1); });
    })(0);
    return sheetCache[name];
  }
  function bgUrl(name) {
    if (/[\/.]/.test(name)) return name;
    try { return new URL('../assets/' + name + '.png', SCRIPT_URL).href; } catch (_) { return 'assets/' + name + '.png'; }
  }
  // Gray copies of the riding frames for ジブン ('saturation' blend keeps the shading, alpha comes back from the sprite).
  function makeGray(img) {
    try {
      var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(40,48,70,0.28)'; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
      return c;
    } catch (_) { return null; }
  }

  // ---- 音（Web Audio・外部の音源なし） ----
  var AU = { ctx: null, master: null, noise: null, lastShot: 0, lastHit: 0, lastPop: 0, music: null, nextT: 0, stepI: 0, played: 0 };
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function audioAllowed(S) {
    if (!S || S.paused || S.closed) return false;
    try { return !(S.platform && typeof S.platform.isAudioEnabled === 'function') || !!S.platform.isAudioEnabled(); } catch (_) { return true; }
  }
  function audioUnlock(S) {
    if (!audioAllowed(S)) return;
    try {
      if (!AU.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        AU.ctx = new AC();
        AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.75; AU.master.connect(AU.ctx.destination);
        var len = Math.floor(AU.ctx.sampleRate * 0.5), buf = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate), data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        AU.noise = buf;
      }
      if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(function () {});
    } catch (_) {}
  }
  function audioLive(S) { return AU.ctx && AU.ctx.state === 'running' && audioAllowed(S); }
  function tone(S, freq, dur, type, gain, freqEnd, delay) {
    if (!audioLive(S)) return;
    try {
      var c = AU.ctx, t0 = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
      g.gain.setValueAtTime(gain || 0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g); g.connect(AU.master); o.start(t0); o.stop(t0 + dur + 0.02); AU.played++;
    } catch (_) {}
  }
  function noise(S, dur, gain, freq, delay) {
    if (!audioLive(S) || !AU.noise) return;
    try {
      var c = AU.ctx, t0 = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = AU.noise; f.type = 'lowpass'; f.frequency.value = freq || 1800;
      g.gain.setValueAtTime(gain || 0.1, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      src.connect(f); f.connect(g); g.connect(AU.master); src.start(t0); src.stop(t0 + dur + 0.02); AU.played++;
    } catch (_) {}
  }
  var SFX = {
    perfect: function (S) { tone(S, 1568, .14, 'sine', .09); },
    good: function (S) { tone(S, 880, .07, 'sine', .07); },
    fever: function (S) { SFX.pickup(S); },
    stage: function (S) { SFX.start(S); },
    // FUN-VID2: a tiny random pitch wobble on every shot (±6%) so rapid fire doesn't sound like one note on repeat.
    shot: function (S) { var n = AU.ctx && AU.ctx.currentTime; if (n - AU.lastShot < 0.075) return; AU.lastShot = n; var j = 0.94 + Math.random() * 0.12; tone(S, 1040 * j, 0.05, 'sine', 0.018, 1500 * j); },
    hit: function (S) { var n = AU.ctx && AU.ctx.currentTime; if (n - AU.lastHit < 0.06) return; AU.lastHit = n; tone(S, 260, 0.05, 'square', 0.03, 140); },
    crit: function (S) { var n = AU.ctx && AU.ctx.currentTime; if (n - AU.lastHit < 0.06) return; AU.lastHit = n; tone(S, 620, 0.07, 'square', 0.04, 300); },
    pop: function (S) { var n = AU.ctx && AU.ctx.currentTime; if (n - AU.lastPop < 0.05) return; AU.lastPop = n; tone(S, 520, 0.06, 'square', 0.035, 240); noise(S, 0.06, 0.05, 3000); },
    bigHit: function (S) { noise(S, 0.32, 0.22, 1400); tone(S, 120, 0.32, 'sawtooth', 0.12, 45); },
    hurt: function (S) { tone(S, 420, 0.28, 'triangle', 0.18, 90); noise(S, 0.15, 0.08, 900); },
    barrier: function (S) { tone(S, 1300, 0.26, 'sine', 0.14, 500); noise(S, 0.12, 0.06, 4000); },
    barrierBack: function (S) { tone(S, 700, 0.12, 'sine', 0.08, 1100); },
    pickup: function (S) { [784, 988, 1319].forEach(function (f, i) { tone(S, f, 0.1, 'square', 0.05, 0, i * 0.07); }); },
    line: function (S) { tone(S, 660, 0.18, 'sine', 0.07, 0); tone(S, 880, 0.26, 'sine', 0.07, 0, 0.12); },
    show: function (S) { tone(S, 400, 0.4, 'triangle', 0.1, 1200); [1047, 1319, 1568].forEach(function (f, i) { tone(S, f, 0.18, 'sine', 0.06, 0, 0.2 + i * 0.09); }); },
    tiger: function (S) { noise(S, 0.45, 0.2, 900); tone(S, 180, 0.5, 'sawtooth', 0.12, 60); },
    chargeFull: function (S) { tone(S, 1568, 0.14, 'sine', 0.08); },
    block: function (S) { tone(S, 1200, 0.06, 'triangle', 0.06, 900); },
    down: function (S) { tone(S, 500, 0.12, 'square', 0.06, 300); tone(S, 300, 0.16, 'square', 0.06, 200, 0.12); },
    nope: function (S) { tone(S, 200, 0.08, 'square', 0.04); },
    rise: function (S) { tone(S, 300, 0.7, 'triangle', 0.08, 900); },
    start: function (S) { tone(S, 880, 0.1, 'square', 0.06); tone(S, 1320, 0.16, 'square', 0.06, 0, 0.1); },
    phase: function (S) { noise(S, 0.3, 0.12, 600); tone(S, 90, 0.4, 'sawtooth', 0.1, 60); },
    ready: function (S) { [523, 659, 784, 1047].forEach(function (f, i) { tone(S, f, 0.2, 'sine', 0.06, 0, i * 0.08); }); },
    voices: function (S) { [523, 659, 784, 988, 1175, 1568].forEach(function (f, i) { tone(S, f, 0.9, 'sine', 0.05, 0, i * 0.12); }); },
    win: function (S) { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(S, f, i === 5 ? 0.5 : 0.14, 'square', 0.08, 0, i * 0.13); }); },
    lose: function (S) { [392, 330, 262, 196].forEach(function (f, i) { tone(S, f, 0.3, 'triangle', 0.1, 0, i * 0.2); }); }
  };
  function musicTick(S) {
    var w = S.world, r = w.beat;
    if (!audioLive(S) || w.playtest || w.state === 'lose' || w.state === 'win' || !S.loaded) { S.musicNext = null; return; }
    var tr = MUSIC[w.bossId], half = r.phase * 2, stepDur = 30 / r.bpm / w.scale;
    if (S.musicBoss !== w.bossId || S.musicStage !== w.stage || S.musicBpm !== r.bpm || S.musicNext == null) {
      S.musicBoss = w.bossId; S.musicStage = w.stage; S.musicBpm = r.bpm; S.musicNext = Math.ceil(half - 1e-8);
    }
    if (S.musicNext < half - 1) S.musicNext = Math.ceil(half);
    // Schedule just ahead on the AudioContext clock. The phase itself uses that same clock.
    while (S.musicNext <= half + .035 / stepDur) {
      var i = S.musicNext % 16, at = Math.max(0, (S.musicNext - half) * stepDur), bn = tr.bass[i], ln = tr.lead[i];
      if (bn) tone(S, midi(bn), stepDur * .9, 'triangle', .075, 0, at);
      if (ln) tone(S, midi(ln), stepDur * .8, 'square', .026, 0, at);
      if (i % 4 === 0) noise(S, .05, .035, 5000, at);
      S.musicNext++;
    }
  }
  // ---- 録音の曲（SPEC_V9_MUSIC 2） ----
  // Story fights at normal speed play shooter_<boss>_s0..s3 from data/music.json when all four decode in the 9s load wait.
  // The beat clock stays as it is; the recording is cued from the beat position, so it never drives the game.
  var REC_FADE = 0.04, REC_LEAD = 0.03, recBuffers = {}, recOffline = null;
  function recUrl(p) { try { return new URL('../' + p, SCRIPT_URL).href; } catch (_) { return p; } }
  function recValid(t, bpm) {
    if (!t || typeof t.file !== 'string' || !/^assets\/music\/[-a-zA-Z0-9_]+\.(mp3|m4a|aac)$/.test(t.file)) return false;
    var n = [t.bpm, t.loopStart, t.loopEnd, t.gain];
    if (!n.every(function (v) { return typeof v === 'number' && isFinite(v); }) || t.bpm !== bpm || t.loopStart < 0 || t.loopEnd <= t.loopStart || t.gain < 0 || t.gain > 2) return false;
    // Whole bars within 1ms: the offset is cued on the beat grid, so a longer or shorter loop would drift every lap.
    var bars = Math.round((t.loopEnd - t.loopStart) * t.bpm / 240);
    return bars >= 1 && Math.abs(t.loopEnd - t.loopStart - bars * 240 / t.bpm) < 0.001;
  }
  function recDecode(bytes) {
    var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    try { if (!AU.ctx && !recOffline && OC) recOffline = new OC(2, 1, 44100); } catch (_) {}
    var c = AU.ctx || recOffline;
    if (!c || !c.decodeAudioData) return Promise.resolve(null);
    return new Promise(function (resolve) {
      try { var p = c.decodeAudioData(bytes, resolve, function () { resolve(null); }); if (p && p.then) p.then(resolve, function () { resolve(null); }); } catch (_) { resolve(null); }
    });
  }
  // Resolves to [{track, buffer} x4] or null. The ledger is read again for each fight; decoded files are kept.
  function recLoad(bossId) {
    var base = MUSIC[bossId].bpm;
    return fetch(recUrl('data/music.json')).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (d) {
      var tracks = d && d.version === 1 && d.tracks && typeof d.tracks === 'object' ? d.tracks : null;
      if (!tracks) return null;
      var list = [0, 1, 2, 3].map(function (n) { return tracks['shooter_' + bossId + '_s' + n]; });
      if (!list.every(function (t, n) { return recValid(t, base + 8 * n); })) return null;
      return Promise.all(list.map(function (t) {
        if (recBuffers[t.file]) return recBuffers[t.file];
        return fetch(recUrl(t.file)).then(function (r) { if (!r || !r.ok) throw new Error('missing'); return r.arrayBuffer(); }).then(recDecode).then(function (buf) {
          if (!buf || !(buf.duration >= t.loopEnd)) throw new Error('short');
          recBuffers[t.file] = buf; return buf;
        });
      })).then(function (bufs) { return list.map(function (t, n) { return { track: t, buffer: bufs[n] }; }); });
    }).catch(function () { return null; });
  }
  // fadeAt: the time the fade out starts (the next file's start, so both overlap for REC_FADE). Without it the loop stops now.
  function recStop(S, fadeAt) {
    var p = S.recPlay, o = S.recOld; S.recPlay = null; S.recOld = null;
    if (o && fadeAt == null) { try { o.src.stop(); } catch (_) {} }
    if (!p) return;
    try {
      var c = AU.ctx, t = c.currentTime;
      if (fadeAt != null && fadeAt >= p.at + REC_FADE) {
        var g = p.gain.gain;
        if (g.cancelScheduledValues) g.cancelScheduledValues(t);
        g.setValueAtTime(p.track.gain, Math.max(t, fadeAt)); g.linearRampToValueAtTime(0, Math.max(t, fadeAt) + REC_FADE);
        p.src.stop(Math.max(t, fadeAt) + REC_FADE + 0.01); S.recOld = p;
      } else p.src.stop();
    } catch (_) { try { p.src.stop(); } catch (_) {} }
  }
  function recStart(S, n) {
    var w = S.world, c = AU.ctx, e = S.rec[n], t = e.track, bpm = w.beat.bpm;
    // The frame's beat position belongs to the audio time S.clockAt; T is just ahead of it.
    var at = S.clockSource === 'audio' && S.clockAt != null ? S.clockAt : c.currentTime, T = Math.max(c.currentTime, at) + REC_LEAD;
    var phase = w.beat.phase + (T - at) * bpm / 60, beats = Math.round((t.loopEnd - t.loopStart) * bpm / 60);
    var offset = t.loopStart + (((phase % beats) + beats) % beats) * 60 / bpm;
    var src = c.createBufferSource(), gain = c.createGain();
    src.buffer = e.buffer; src.loop = true; src.loopStart = t.loopStart; src.loopEnd = t.loopEnd;
    gain.gain.setValueAtTime(0, T); gain.gain.linearRampToValueAtTime(t.gain, T + REC_FADE);
    src.connect(gain); gain.connect(AU.master); src.start(T, offset);
    S.recPlay = { src: src, gain: gain, track: t, stage: n, bpm: bpm, at: T, offset: offset };
  }
  function recTick(S) {
    var w = S.world;
    if (!audioLive(S) || w.playtest || w.state === 'lose' || w.state === 'win' || !S.loaded) {
      if (S.recPlay || S.recOld) recStop(S, audioLive(S) && (w.state === 'lose' || w.state === 'win') ? AU.ctx.currentTime : null);
      return;
    }
    var n = Math.min(3, w.beat.tempoSteps || 0);
    if (S.recPlay && S.recPlay.stage === n && S.recPlay.bpm === w.beat.bpm) return;
    // Tempo step: the next file fades in over REC_FADE while the old one fades out over the same span.
    var old = S.recPlay; S.recPlay = null;
    try { recStart(S, n); } catch (_) { S.recPlay = null; }
    if (old) { var next = S.recPlay; S.recPlay = old; recStop(S, next ? next.at : null); S.recPlay = next; }
  }
  function clockDelta(S, now) {
    var live = audioLive(S), source = live ? 'audio' : 'game', value = live ? AU.ctx.currentTime : now / 1000;
    var dt = S.clockSource === source && S.clockAt != null ? value - S.clockAt : S.last == null ? 0 : (now - S.last) / 1000;
    S.clockSource = source; S.clockAt = value; S.last = now;
    return Math.max(0, dt);
  }
  function sessionBeat(S) {
    if (S.paused || S.closed || !S.loaded || S.world.playtest || S.wordCards.length) return;
    // Judge the input event, not the later animation frame (especially on a slow phone).
    var dt = 0;
    if (S.clockAt != null) {
      if (S.clockSource === 'audio' && audioLive(S)) dt = AU.ctx.currentTime - S.clockAt;
      else if (S.clockSource === 'game') dt = performance.now() / 1000 - S.clockAt;
    }
    pressBeat(S.world, null, S.world.beat.phase + Math.max(0, dt) * S.world.scale * S.world.beat.bpm / 60);
  }
  function layoutPlaytest(S) {
    if (!S.protoRect) return;
    var box = S.stage.getBoundingClientRect(), scale = S.scale;
    Object.assign(S.protoRect, { x: box.left, y: box.top + (PLAY_B - 470) * scale, width: W * scale, height: H * scale });
    if (S.protoHost) S.protoHost.style.clipPath = 'inset(' + S.protoRect.y + 'px ' + Math.max(0, ((document.documentElement || {}).clientWidth || window.innerWidth) - box.right) + 'px ' + Math.max(0, ((document.documentElement || {}).clientHeight || window.innerHeight) - (box.top + PLAY_B * scale)) + 'px ' + box.left + 'px)';
  }
  function clearInput(S) {
    S.keys = {}; S.drag = null; S.dragDx = S.dragDy = 0;
    S.keySkill = S.ptrSkill = S.press = S.release = S.beatPress = false;
  }
  function sessionPlaytest(S, done) {
    clearInput(S); S.musicNext = null;
    S.protoRect = {}; layoutPlaytest(S);
    S.protoHandle = RYW.Proto.open({ mode: 'playtest', state: S.world.settings.proto || S.cfg.proto,
      rect: S.protoRect,
      platform: S.platform, learn: function (id) { learnQuiet(S.world, id); },
      onDone: function () { S.protoHandle = null; S.protoRect = null; S.protoHost = null; if (!S.closed) { clearInput(S); done(); } }
    });
    // Proto draws a 540x960 canvas. Crop its unused lower half, retaining 24px text
    // and the actual jumping game at full logical size directly above the bottom band.
    S.protoHost = document.querySelector('.ryw-proto');
    if (S.protoHost) S.protoHost.style.zIndex = '2147483001';
    layoutPlaytest(S);
  }

  // ---- DOM ----
  var styleDone = false;
  function injectStyle() {
    if (styleDone) return; styleDone = true;
    var css = '.ryw-shooter{position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;z-index:2147483000;background:#050912;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;font-family:' + FONT + '}' +
      '.ryw-shooter .rs-backdrop{position:absolute;left:-60px;top:-60px;right:-60px;bottom:-60px;background:#050912 center/cover no-repeat;filter:blur(18px) brightness(.32)}' +
      '.ryw-shooter .rs-stage{position:absolute;left:0;top:0;width:540px;height:960px;transform-origin:0 0;overflow:hidden;background:#0a1220}' +
      '.ryw-shooter canvas{position:absolute;left:0;top:0;width:540px;height:960px;display:block}' +
      '.ryw-shooter button{box-sizing:border-box;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.ryw-shooter .rs-skill{position:absolute;left:338px;top:838px;width:180px;height:48px;min-height:0;border-radius:20px;border:3px solid #9fd8e6;background:#17324a;color:#fff6d8;font-size:24px;font-weight:700;line-height:1.1;padding:1px 3px;box-shadow:0 5px 0 #0b1a27;overflow:hidden;touch-action:none}' +
      // R155: index.html fades every disabled button to .45, so in the boss intro the beat button looked broken; it keeps its word on a dark plate (like R132).
      '.ryw-shooter .rs-beat{position:absolute;left:338px;top:894px;width:180px;height:58px;border:3px solid #9fd8e6;border-radius:20px;background:#17324a;color:#fff6d8;font-size:32px;font-weight:700;touch-action:none}.ryw-shooter .rs-beat.rs-lit{background:#65511f;border-color:#fff0b0;box-shadow:0 0 18px #ffd76b}.ryw-shooter .rs-beat:disabled{opacity:1;background:#0f2030;border-color:#4f6f7c;color:#e6dfc4;box-shadow:0 5px 0 #08121b}' +
      '.ryw-shooter .rs-skill span{display:block;white-space:nowrap;position:relative;z-index:1}' +
      '.ryw-shooter .rs-skill .rs-top{display:none}' +
      '.ryw-shooter .rs-skill i{position:absolute;left:0;bottom:0;height:5px;width:0;background:#ffd76b;z-index:0}' +
      '.ryw-shooter .rs-skill.rs-off{background:#0f2030;border-color:#4f6f7c;color:#e6dfc4;box-shadow:0 5px 0 #08121b}' +
      '.ryw-shooter .rs-skill.rs-ready{border-color:#ffe08a;background:#3a3216;animation:rs-pulse .9s ease-in-out infinite}' +
      '.ryw-shooter .rs-skill.rs-hold{transform:translateY(3px);box-shadow:0 2px 0 #0b1a27}' +
      '@keyframes rs-pulse{0%,100%{box-shadow:0 5px 0 #0b1a27,0 0 0 0 rgba(255,224,138,.6)}50%{box-shadow:0 5px 0 #0b1a27,0 0 22px 6px rgba(255,224,138,.55)}}' +
      '.ryw-shooter .rs-panel{position:absolute;left:40px;right:40px;top:300px;padding:26px 26px 30px;background:#10233aee;border:3px solid #e1d8ad;border-radius:18px;box-shadow:0 6px 0 #081320;color:#fff5d6;text-align:center}' +
      '.ryw-shooter .rs-panel .rs-who{display:block;font-size:26px;color:#f1cd7c;margin-bottom:6px}' +
      '.ryw-shooter .rs-panel .rs-big{display:block;font-size:40px;font-weight:700;margin-bottom:24px}' +
      '.ryw-shooter .rs-panel button{display:block;width:100%;min-height:70px;margin-top:14px;font-size:28px;color:#fff5d6;background:#244a50;border:3px solid #91b5a5;border-radius:14px;box-shadow:0 4px 0 #112b34}' +
      '.ryw-shooter .rs-panel button.rs-primary{background:#f1cd7c;color:#213f42;border-color:#fff0c1;font-weight:700}' +
      '.ryw-shooter .rs-panel button:focus-visible{outline:4px solid #fff5d6;outline-offset:3px}' +
      '.ryw-shooter .rs-pause{position:absolute;inset:0;background:#0a1626d9;display:flex;align-items:center;justify-content:center;font-size:34px;color:#fff5d6}' +
      '.ryw-shooter .rs-word{position:absolute;left:18px;right:18px;top:124px;padding:12px 14px;border:2px solid #e1d8ad;border-radius:12px;background:#10233a;color:#fff5d6;font-size:24px;line-height:1.3;text-align:left;word-break:keep-all;overflow-wrap:normal;z-index:2}.ryw-shooter .rs-word span{display:block}.ryw-shooter .rs-word .rs-word-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}.ryw-shooter .rs-word .rs-word-head span{display:inline}.ryw-shooter .rs-word .rs-word-who{flex:none;color:#bfd3cf;line-height:1.2}' +
      '.ryw-shooter [hidden]{display:none!important}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  function start(cfg) {
    if (current) closeSession(current);
    syncWeaponNames();
    current = createSession(cfg || {});
    return current.handle;
  }

  function createSession(cfg) {
    injectStyle();
    var S = {
      cfg: cfg, world: createWorld(cfg), platform: cfg.platform || null, closed: false, finished: false,
      paused: false, hostPaused: false, hidden: false, loaded: false, sheets: {}, bg: null, gray: null,
      keys: {}, keySkill: false, ptrSkill: false, press: false, release: false, dragDx: 0, dragDy: 0, drag: null,
      scale: 1, rs: 1, last: null, raf: 0, loseShown: false, btnKey: '', touched: false
    };
    var rootEl = document.createElement('div');
    rootEl.className = 'ryw-shooter';
    rootEl.setAttribute('role', 'application');
    rootEl.setAttribute('aria-label', 'ボスせん ' + S.world.def.name);
    rootEl.innerHTML = '<div class="rs-backdrop" aria-hidden="true"></div><div class="rs-stage"><canvas width="540" height="960" aria-hidden="true"></canvas>' +
      '<button type="button" class="rs-skill" aria-label="' + skillLabel('top') + '"><span class="rs-top">' + skillLabel('top') + '</span><span class="rs-main"></span><i></i></button>' +
      '<button type="button" class="rs-beat" aria-label="ビート Z">ビート</button>' +
      '<div class="rs-pause" hidden>ひとやすみ</div>' +
      '<div class="rs-panel" hidden><span class="rs-who">ソラ</span><span class="rs-big">もういちど！</span>' +
      '<button type="button" class="rs-primary" data-choice="retry">すぐ やりなおす</button><button type="button" data-choice="town">まちに もどる</button></div></div>';
    document.body.appendChild(rootEl);
    S.root = rootEl;
    S.stage = rootEl.querySelector('.rs-stage');
    S.backdrop = rootEl.querySelector('.rs-backdrop');
    S.canvas = rootEl.querySelector('canvas');
    S.ctx = S.canvas.getContext('2d');
    S.btn = rootEl.querySelector('.rs-skill');
    S.beatBtn = rootEl.querySelector('.rs-beat');
    if (RYW.Proto && typeof RYW.Proto.open === 'function') S.world.openPlaytest = function (done) { sessionPlaytest(S, done); };
    S.btnMain = rootEl.querySelector('.rs-main');
    S.btnGauge = rootEl.querySelector('.rs-skill i');
    S.pauseEl = rootEl.querySelector('.rs-pause');
    S.panel = rootEl.querySelector('.rs-panel');

    var ids = WEAPONS.filter(function (wp) { return S.world.weapons[wp.id]; }).map(function (wp) { return WEAPON_WORDS[wp.id]; }).concat(['life', 'frame']);
    if (S.world.bossId === 'bugking') ids.unshift('bug');
    ids.unshift('beat', 'notes');
    if (S.world.bossId === 'kateino') ids.push('playtest');
    S.wordCards = typeof RYW.prepareBossWords === 'function' ? RYW.prepareBossWords(ids) : [];
    S.wordTime = 0;
    S.wordEl = document.createElement('button'); S.wordEl.className = 'rs-word'; S.wordEl.type = 'button';
    S.wordEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    S.wordEl.addEventListener('click', function (e) { e.stopPropagation(); if (!S.paused) nextWord(S); });
    S.stage.appendChild(S.wordEl);
    showWord(S);

    S.onResize = function () { resize(S); };
    S.onKeyDown = function (e) { onKeyDown(S, e); };
    S.onKeyUp = function (e) { onKeyUp(S, e); };
    S.onBlur = function () { clearInput(S); };
    S.onVis = function () { S.hidden = document.hidden; applyPause(S); };
    window.addEventListener('resize', S.onResize);
    window.addEventListener('keydown', S.onKeyDown, true);
    window.addEventListener('keyup', S.onKeyUp, true);
    window.addEventListener('blur', S.onBlur);
    hookPlatform(S);
    applyPause(S);

    S.stage.addEventListener('pointerdown', function (e) { onPointerDown(S, e); });
    S.stage.addEventListener('pointermove', function (e) { onPointerMove(S, e); });
    S.stage.addEventListener('pointerup', function (e) { onPointerUp(S, e); });
    S.stage.addEventListener('pointercancel', function (e) { onPointerUp(S, e); });
    S.stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    S.beatBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation(); audioUnlock(S); S.touched = true;
      beatOrNextWord(S);
    });
    S.beatBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (e.detail === 0) beatOrNextWord(S); });
    S.btn.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation(); audioUnlock(S); S.touched = true;
      if (S.paused || S.world.playtest || S.wordCards.length) return;
      if (!S.ptrSkill) { S.ptrSkill = true; S.press = true; }
      try { S.btn.setPointerCapture(e.pointerId); } catch (_) {}
    });
    var btnUp = function (e) { if (e) e.stopPropagation(); if (S.ptrSkill) { S.ptrSkill = false; S.release = true; } };
    S.btn.addEventListener('pointerup', btnUp);
    S.btn.addEventListener('pointercancel', btnUp);
    S.btn.addEventListener('lostpointercapture', function () { btnUp(); });
    S.btn.addEventListener('click', function (e) { e.preventDefault(); });
    S.panel.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-choice]');
      if (b) finish(S, 'lose', b.getAttribute('data-choice'));
    });

    S.handle = {
      stop: function () { closeSession(S); },
      get state() { return S.closed ? 'closed' : S.loaded ? S.world.state : 'loading'; }
    };
    resize(S);
    S.visualBoss = S.world.bossId; loadAll(S);
    S.raf = requestAnimationFrame(function loop(now) { frame(S, now); });
    return S;
  }

  function showWord(S) {
    var w = S.wordCards[0]; S.wordEl.hidden = !w; S.wordEl.replaceChildren();
    if (!w) return;
    // R94: like the town and battle cards (R93), line 1 is the dot and the word, with the speaker in its own tag at the right end.
    var head = document.createElement('span'), title = document.createElement('span'), who = document.createElement('span'), copy = document.createElement('span');
    head.className = 'rs-word-head'; title.className = 'rs-word-title'; who.className = 'rs-word-who';
    title.style.color = { code: '#8de2ff', game: '#f1cd7c', ai: '#d9b5ff', net: '#a1edb0' }[w.kind];
    title.textContent = '● ' + w.word; who.textContent = w.speaker; copy.textContent = w.sora;
    head.appendChild(title); head.appendChild(who);
    S.wordEl.appendChild(head); S.wordEl.appendChild(copy);
  }
  // R307: the speech panel keeps a 12px gap under the word card (was 8, about 6px on a phone, so the two read as one box).
  var WORD_CARD_GAP = 12;
  function wordCardH(S) { return S.wordEl && !S.wordEl.hidden && S.wordCards.length && S.wordEl.offsetHeight ? S.wordEl.offsetHeight + WORD_CARD_GAP : 0; }
  function nextWord(S) { S.wordCards.shift(); S.wordTime = 0; showWord(S); }
  // R90: the first card says "press with the beat", so the beat button stays pressable while cards are up;
  // a press then reads on to the next card (like Space/Enter) and does not count as a beat.
  function beatOrNextWord(S) {
    if (S.wordCards.length) { if (S.loaded && !S.paused && !S.closed && !S.world.playtest) nextWord(S); return; }
    sessionBeat(S);
  }

  function hookPlatform(S) {
    var pf = S.platform;
    if (pf && typeof pf.onPause === 'function' && typeof pf.onResume === 'function') {
      var known = hookedPlatforms && hookedPlatforms.get(pf);
      if (known) S.hostPaused = known.paused;
      else {
        var st = { paused: false };
        if (hookedPlatforms) hookedPlatforms.set(pf, st);
        try {
          // Platform callbacks cannot be removed, so one hook per platform routes to the running battle.
          pf.onPause(function () { st.paused = true; if (current && current.platform === pf) { current.hostPaused = true; applyPause(current); } });
          pf.onResume(function () { st.paused = false; if (current && current.platform === pf) { current.hostPaused = false; applyPause(current); } });
          if (typeof pf.onAudioChange === 'function') pf.onAudioChange(function (on) {
            if (!current || current.platform !== pf || !AU.ctx) return;
            try { if (on && !current.paused) AU.ctx.resume().catch(function () {}); else AU.ctx.suspend().catch(function () {}); } catch (_) {}
          });
        } catch (_) {}
      }
    } else {
      S.ownVisibility = true;
      document.addEventListener('visibilitychange', S.onVis);
      S.hidden = !!document.hidden;
    }
  }

  function applyPause(S) {
    var want = S.hostPaused || S.hidden;
    if (want === S.paused) return;
    S.paused = want; S.world.paused = want;
    S.clockAt = null; S.last = null; S.musicNext = null; clearInput(S);
    S.pauseEl.hidden = !want;
    S.keys = {};
    if (want) { recStop(S); try { if (AU.ctx) AU.ctx.suspend().catch(function () {}); } catch (_) {} }
    else {
      S.last = null;
      if (S.world.state === 'play') S.world.p.inv = Math.max(S.world.p.inv, 1);
      if (S.touched) audioUnlock(S);
    }
  }

  function resize(S) {
    var de = document.documentElement || {}, iw = de.clientWidth || window.innerWidth || 540, ih = de.clientHeight || window.innerHeight || 960;
    var s = Math.min(iw / W, ih / H);
    S.scale = s;
    S.stage.style.transform = 'translate(' + ((iw - W * s) / 2) + 'px,' + ((ih - H * s) / 2) + 'px) scale(' + s + ')';
    layoutPlaytest(S);
    var rs = (window.devicePixelRatio || 1) * s > 1.2 ? 2 : 1;
    if (rs !== S.rs || S.canvas.width !== W * rs) { S.rs = rs; S.canvas.width = W * rs; S.canvas.height = H * rs; }
  }

  function loadAll(S) {
    var w = S.world, names = ['ryosei', 'tiger', 'items'];
    if (w.def.sheet !== 'ryosei') names.push(w.def.sheet);
    var need = {};
    w.options.forEach(function (o) { need[o.def.sheet] = 1; });
    if (w.bossId === 'zero') { need.summons = 1; need.spirits = 1; }
    if (w.bossId === 'hikaku' || w.bossId === 'jibun') need.spirits = 1;
    Object.keys(need).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    var bgName = S.cfg.background || w.def.bg;
    S.theme = BG_THEME[bgName] || BG_THEME[w.def.bg] || 'town';
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 9000); });
    // Recorded music is decided once, inside this wait: a late file never switches the fight away from the synth.
    var music = !S.loaded && !S.recTried && w.mode === 'story' && w.scale === 1 ? (S.recTried = true, recLoad(w.bossId).then(function (r) { if (!S.loaded) S.recReady = r; })) : null;
    var all = Promise.all(names.map(function (n) { return loadSheet(n).then(function (sh) { S.sheets[n] = sh; }); })
      .concat(music ? [music] : [])
      .concat([loadImage(bgUrl(bgName)).then(function (img) {
        S.bg = img;
        // The side margins (wide screens) show the same picture, dark and blurred.
        if (img && !S.closed) S.backdrop.style.backgroundImage = 'url(' + JSON.stringify(img.src) + ')';
      })]));
    Promise.race([all, timeout]).then(function () {
      if (S.closed) return;
      if (w.bossId === 'jibun' && S.sheets.ryosei) {
        if (!grayCache) { grayCache = {}; for (var c = 0; c < 4; c++) { var img = S.sheets.ryosei.frames['1_' + c]; if (img) grayCache[c] = makeGray(img); } }
        S.gray = grayCache;
      }
      if (!S.loaded && S.recReady && w.mode === 'story' && w.scale === 1) S.rec = S.recReady;
      S.loaded = true; S.last = null;
    });
  }

  function closeSession(S) {
    if (S.closed) return;
    S.closed = true;
    if (S.protoHandle) { S.protoHandle.close(); S.protoHandle = null; }
    cancelAnimationFrame(S.raf);
    window.removeEventListener('resize', S.onResize);
    window.removeEventListener('keydown', S.onKeyDown, true);
    window.removeEventListener('keyup', S.onKeyUp, true);
    window.removeEventListener('blur', S.onBlur);
    if (S.ownVisibility) document.removeEventListener('visibilitychange', S.onVis);
    if (S.root && S.root.parentNode) S.root.parentNode.removeChild(S.root);
    recStop(S);
    AU.nextT = 0;
    if (current === S) { lastState = 'closed'; current = null; }
  }

  function finish(S, kind, payload) {
    if (S.finished) return;
    S.finished = true;
    lastResult = kind === 'win' ? 'win' : payload;
    closeSession(S);
    var cb = kind === 'end' ? S.cfg.onEnd : kind === 'win' ? S.cfg.onWin : S.cfg.onLose;
    if (typeof cb === 'function') cb(payload);
    else if (kind === 'lose' && payload === 'retry') start(S.cfg);
  }

  // ---- 操作 ----
  var MOVE_KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  function onKeyDown(S, e) {
    if (S.closed) return;
    // The battle is modal: keys must not also move the field behind it.
    e.stopImmediatePropagation();
    audioUnlock(S); S.touched = true;
    if (!S.panel.hidden) {
      var btns = Array.prototype.slice.call(S.panel.querySelectorAll('button')), idx = btns.indexOf(document.activeElement);
      if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) { e.preventDefault(); btns[(idx + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? btns.length - 1 : 1)) % btns.length].focus(); }
      else if (e.code === 'KeyZ') { e.preventDefault(); (btns[idx] || btns[0]).click(); }
      return;
    }
    if (S.paused || S.world.playtest) { e.preventDefault(); return; }
    if (S.wordCards.length) { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!S.paused) nextWord(S); } return; }
    var mv = MOVE_KEYS[e.code] || MOVE_KEYS[e.key];
    if (mv) { S.keys[mv] = true; e.preventDefault(); return; }
    if (e.code === 'KeyX' || e.key === 'x' || e.key === 'X') { e.preventDefault(); if (!S.keySkill) { S.keySkill = true; S.press = true; } return; }
    if (e.code === 'KeyZ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) sessionBeat(S); }
  }
  function onKeyUp(S, e) {
    if (S.closed) return;
    if (S.wordCards.length) return;
    var mv = MOVE_KEYS[e.code] || MOVE_KEYS[e.key];
    if (mv) S.keys[mv] = false;
    if ((e.code === 'KeyX' || e.key === 'x' || e.key === 'X') && S.keySkill) { S.keySkill = false; S.release = true; }
  }
  function onPointerDown(S, e) {
    if (e.target.closest && e.target.closest('button')) return;
    audioUnlock(S); S.touched = true;
    if (S.drag || S.paused || S.world.playtest || S.wordCards.length) return;
    e.preventDefault();
    S.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { S.stage.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onPointerMove(S, e) {
    if (!S.drag || S.drag.id !== e.pointerId) return;
    e.preventDefault();
    // Relative drag: the hero moves as far as the finger slides, it never jumps under the finger.
    S.dragDx += (e.clientX - S.drag.x) / S.scale;
    S.dragDy += (e.clientY - S.drag.y) / S.scale;
    S.drag.x = e.clientX; S.drag.y = e.clientY;
  }
  function onPointerUp(S, e) { if (S.drag && S.drag.id === e.pointerId) S.drag = null; }

  // ---- 1コマ ----
  // Word cards (words.js first-sight cards) pause combat input, but must not also stall the boss
  // entrance timer (w.state 'intro') or the fight stays on a blank screen far longer than the card itself (FUN10).
  function wordCardsFreezeStep(state, wordCardsLen) { return wordCardsLen > 0 && state !== 'intro'; }

  function frame(S, now) {
    if (S.closed) return;
    S.raf = requestAnimationFrame(function (n) { frame(S, n); });
    var dt = clockDelta(S, now);
    var w = S.world;
    if (S.loaded && !S.paused && S.wordCards.length) { S.wordTime += dt; if (S.wordTime >= 2.5) nextWord(S); }
    w.cardUp = S.wordCards.length > 0;
    // Word cards only freeze the fight once it is in play: during the entrance (w.state 'intro') the
    // boss still walks on and settles so the screen is not blank while the first card is read (FUN10).
    if (S.loaded && !S.paused && wordCardsFreezeStep(w.state, S.wordCards.length)) { holdTextsForCards(w); recStop(S); render(S); return; }
    if (S.loaded && !S.paused && dt > 0) {
      var ax = (S.keys.r ? 1 : 0) - (S.keys.l ? 1 : 0), ay = (S.keys.d ? 1 : 0) - (S.keys.u ? 1 : 0);
      var n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (var i = 0; i < n; i++) {
        var inp = { ax: ax, ay: ay, dx: S.dragDx, dy: S.dragDy, skill: S.keySkill || S.ptrSkill, press: S.press, release: S.release, beat: S.beatPress };
        S.beatPress = false;
        if (step(w, h, inp)) { S.dragDx = 0; S.dragDy = 0; S.press = false; S.release = false; }
      }
      if (w.events.length) {
        var evs = w.events.splice(0);
        if (audioLive(S)) evs.forEach(function (ev) { if (SFX[ev]) SFX[ev](S); });
      }
      if (S.visualBoss !== w.bossId) { S.visualBoss = w.bossId; loadAll(S); }
      if (S.rec) recTick(S); else musicTick(S);
      if (w.state === 'win' && w.stateT >= winHold(w)) {
        render(S);
        finish(S, 'win', result(w));
        return;
      }
      if (w.state === 'lose' && w.stateT >= 0.9 && !S.loseShown) {
        if (w.mode === 'challenge') { finish(S, 'end', result(w)); return; }
        S.loseShown = true; S.panel.hidden = false;
        var first = S.panel.querySelector('button');
        try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); }
      }
    } else if (S.loaded && S.paused) { w.events.length = 0; }
    lastState = S.loaded ? w.state : 'loading';
    render(S);
  }

  // ---- 描く ----
  function frameImg(S, sheet, r, c) { var sh = S.sheets[sheet]; return sh ? sh.frames[r + '_' + c] || null : null; }
  function drawSprite(ctx, S, sheet, r, c, x, y, h, flip, label) {
    var img = frameImg(S, sheet, r, c);
    if (!img) {
      // Placeholder art (RULES: code-drawn box and name until the picture arrives).
      var pw = h * 0.8;
      ctx.fillStyle = 'rgba(30,50,80,0.85)'; rr(ctx, x - pw / 2, y - h / 2, pw, h, 12); ctx.fill();
      ctx.strokeStyle = '#9fd8e6'; ctx.lineWidth = 3; ctx.stroke();
      if (label) { ctx.fillStyle = '#fff5d6'; ctx.font = '700 24px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y, pw - 8); }
      return;
    }
    var s = h / img.height, dw = img.width * s;
    if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(img, -dw / 2, -h / 2, dw, h); ctx.restore(); }
    else ctx.drawImage(img, x - dw / 2, y - h / 2, dw, h);
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  // indent: the first line is that much shorter (the speaker's name sits in front of it).
  function wrapLines(ctx, text, maxW, indent) {
    var out = [];
    function lim() { return maxW - (out.length ? 0 : indent || 0); }
    String(text).split('\n').forEach(function (para) {
      var line = '';
      para.split(' ').forEach(function (word) {
        if (!word) return;
        var cand = line ? line + ' ' + word : word;
        if (ctx.measureText(cand).width <= lim()) { line = cand; return; }
        if (line) { out.push(line); line = ''; }
        if (ctx.measureText(word).width <= lim()) { line = word; return; }
        var chunk = '';
        Array.prototype.forEach.call(word, function (ch) {
          if (chunk && ctx.measureText(chunk + ch).width > lim()) { out.push(chunk); chunk = ch; } else chunk += ch;
        });
        line = chunk;
      });
      if (line) out.push(line);
    });
    return out;
  }
  function outlinedText(ctx, text, x, y, fill, stroke, lw) {
    ctx.lineJoin = 'round'; ctx.lineWidth = lw || 5; ctx.strokeStyle = stroke || 'rgba(6,10,24,0.9)';
    ctx.strokeText(text, x, y); ctx.fillStyle = fill || '#fff5d6'; ctx.fillText(text, x, y);
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x, y - s * 0.1, x - s * 0.5, y - s * 0.1, x - s * 0.5, y + s * 0.18);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.45, x, y + s * 0.6, x, y + s * 0.8);
    ctx.bezierCurveTo(x, y + s * 0.6, x + s * 0.5, y + s * 0.45, x + s * 0.5, y + s * 0.18);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.1, x, y - s * 0.1, x, y + s * 0.35);
    ctx.closePath();
  }
  function glow(ctx, x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function render(S) {
    var ctx = S.ctx, w = S.world;
    ctx.setTransform(S.rs, 0, 0, S.rs, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (!S.loaded) {
      ctx.fillStyle = '#0a1220'; ctx.fillRect(0, 0, W, H);
      ctx.font = '700 26px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      outlinedText(ctx, 'ボスせんを じゅんびちゅう…', W / 2, H / 2);
      updateButton(S);
      return;
    }
    var shx = 0, shy = 0;
    if (w.shake > 0.2) { shx = (Math.random() * 2 - 1) * w.shake; shy = (Math.random() * 2 - 1) * w.shake * 0.7; }
    ctx.save();
    ctx.translate(shx, shy);
    drawBackground(ctx, S, w);
    drawThemeBack(ctx, S, w);
    if (w.bossId === 'jibun') {
      // The world keeps its color only as far as ジブン has its color back.
      var gray = 0.55 * (1 - (w.m.made / w.def.makes));
      if (gray > 0.01) { ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = gray; ctx.fillStyle = '#7f7f7f'; ctx.fillRect(-20, PLAY_T - 20, W + 40, PLAY_B - PLAY_T + 40); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    drawWalls(ctx, S, w);
    drawThemeRail(ctx, S, w);
    drawBoss(ctx, S, w);
    // Messages in the play area are drawn under the hero and the bullets, so they never hide what can hit you.
    ctx.save(); ctx.translate(-shx, -shy); drawFieldTexts(ctx, S, w); ctx.restore();
    drawBugs(ctx, w);
    drawPickups(ctx, S, w);
    drawCircle(ctx, S, w);
    drawOptions(ctx, S, w);
    drawPlayer(ctx, S, w);
    drawShots(ctx, S, w);
    drawEnemyBullets(ctx, w);
    drawFx(ctx, w);
    drawThemeFront(ctx, S, w);
    drawZeroNoise(ctx, S, w);
    drawWordEffects(ctx, w);
    ctx.restore();
    if (w.flash > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, w.flash * 0.7) + ')'; ctx.fillRect(0, 0, W, H); }
    drawTopBand(ctx, S, w);
    drawBottomBand(ctx, S, w);
    drawRhythm(ctx, S, w);
    drawTicker(ctx, w);
    drawTexts(ctx, S, w);
    updateButton(S);
  }

  function drawBackground(ctx, S, w) {
    var img = S.bg;
    if (!img) {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#13234a'); g.addColorStop(1, '#2a1f3f');
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
      return;
    }
    var th = H + 40, tw = img.width * (th / img.height), scroll = w.t * 120, k0 = Math.floor(scroll / tw);
    for (var k = k0; k <= k0 + 1; k++) {
      var x = k * tw - scroll - 20;
      if (k % 2 === 0) ctx.drawImage(img, x, -20, tw, th);
      else { ctx.save(); ctx.translate(x + tw, -20); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, tw, th); ctx.restore(); }
    }
    ctx.fillStyle = 'rgba(8,12,30,0.22)'; ctx.fillRect(-20, -20, W + 40, H + 40);
  }

  function drawThemeBack(ctx, S, w) {
    var t = w.t, theme = S.theme, x, i;
    // speed lines
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2;
    for (i = 0; i < 12; i++) {
      var len = 60 + hash(i) * 120, sp = 700 + hash(i + 9) * 500, yy = PLAY_T + 30 + hash(i + 3) * (PLAY_B - PLAY_T - 60);
      x = W + 200 - ((t * sp + hash(i + 5) * 2000) % (W + 400));
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + len, yy); ctx.stroke();
    }
    if (theme === 'town') {
      // R229: the pole stands behind the guardrail (TOWN_RAIL_Y); it ran down over the rail and the stone wall to the road.
      var sp1 = 300, off = (t * 210) % sp1, top = PLAY_T + 64;
      for (x = -off - sp1; x < W + sp1; x += sp1) {
        ctx.fillStyle = 'rgba(12,14,26,0.88)';
        ctx.fillRect(x - 6, top, 12, TOWN_RAIL_Y - top);
        ctx.fillRect(x - 40, top + 16, 80, 7);
        ctx.fillRect(x - 28, top + 40, 56, 5);
        ctx.strokeStyle = 'rgba(12,14,26,0.8)'; ctx.lineWidth = 2;
        [-34, 0, 34].forEach(function (dx, j) {
          ctx.beginPath(); ctx.moveTo(x + dx, top + 18 + (j === 1 ? 24 : 0));
          ctx.quadraticCurveTo(x + sp1 / 2 + dx, top + 70 + j * 10, x + sp1 + dx, top + 18 + (j === 1 ? 24 : 0)); ctx.stroke();
        });
      }
    } else if (theme === 'minamo') {
      // R223: the lamp stands on the bank top behind the river (MINAMO_BANK_Y); it ran down through the water to the rail.
      var sp2 = 380, off2 = (t * 200) % sp2;
      for (x = -off2 - sp2; x < W + sp2; x += sp2) {
        ctx.fillStyle = 'rgba(28,20,24,0.85)'; ctx.fillRect(x - 5, PLAY_T + 150, 10, MINAMO_BANK_Y - PLAY_T - 150);
        ctx.fillRect(x - 9, MINAMO_BANK_Y - 6, 18, 6);
        ctx.fillRect(x - 5, PLAY_T + 150, 34, 8);
        glow(ctx, x + 30, PLAY_T + 166, 46, 'rgba(255,214,140,0.75)', 0.8);
        ctx.fillStyle = '#ffe2a6'; ctx.fillRect(x + 22, PLAY_T + 158, 16, 10);
      }
    } else if (theme === 'neon') {
      // R83: the signs hang below the lines, notices and the entrance plate (see NEON_SIGN_Y), so their bright bars never show through text.
      var sp3 = 420, off3 = (t * 210) % sp3, sy = NEON_SIGN_Y;
      for (x = -off3 - sp3; x < W + sp3; x += sp3) {
        // R161: the sign sits at the hero's height, so it is drawn faint and still (two dim rows like lettering, no
        // moving bars): bright jumping bars read as the attack meter or as something to dodge or pick up.
        // R181: a wide, square-cornered board in blue to purple only, so it never looks like an orange rounded number block.
        ctx.fillStyle = 'rgba(14,10,30,0.6)'; ctx.fillRect(x - 3, sy + 64, 6, PLAY_B - sy - 64);
        var hue = 190 + ((x * 0.3) % 110 + 110) % 110;
        ctx.fillStyle = 'hsla(' + hue + ',70%,45%,0.12)'; ctx.fillRect(x - 75, sy + 8, 150, 56);
        ctx.strokeStyle = 'hsla(' + hue + ',70%,60%,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(x - 75, sy + 8, 150, 56);
        ctx.fillStyle = 'hsla(' + hue + ',70%,75%,0.25)';
        ctx.fillRect(x - 58, sy + 24, 116, 6); ctx.fillRect(x - 58, sy + 42, 70, 6);
      }
    } else {
      ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 3;
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        for (x = -10; x <= W + 10; x += 15) {
          var yy2 = PLAY_T + 40 + i * 26 + Math.sin(x * 0.02 + t * 2.4 + i) * 14;
          if (x === -10) ctx.moveTo(x, yy2); else ctx.lineTo(x, yy2);
        }
        ctx.stroke();
      }
      for (i = 0; i < 6; i++) {
        var px = W - ((t * 380 + i * 140) % (W + 100));
        glow(ctx, px, PLAY_T + 40 + (i % 3) * 26 + Math.sin(px * 0.02 + t * 2.4 + (i % 3)) * 14, 12, 'rgba(160,240,255,0.95)');
      }
    }
  }

  // ミナモ's rail stands behind the hero: drawn in front, its posts covered the hero's feet and board (R222).
  function drawThemeRail(ctx, S, w) {
    if (S.theme !== 'minamo') return;
    var x, base = PLAY_B - 36;
    ctx.fillStyle = 'rgba(40,30,30,0.9)'; ctx.fillRect(-20, base + 6, W + 40, 8); ctx.fillRect(-20, base + 26, W + 40, 6);
    for (x = -((w.t * 290) % 64); x < W + 64; x += 64) ctx.fillRect(x, base, 9, 50);
  }

  function drawThemeFront(ctx, S, w) {
    var t = w.t, theme = S.theme, x, base = ROAD_TOP_Y;
    if (theme === 'town') {
      ctx.fillStyle = 'rgba(20,22,34,0.92)'; ctx.fillRect(-20, base, W + 40, 60);
      ctx.fillStyle = '#4b5470'; ctx.fillRect(-20, base, W + 40, 4);
      ctx.fillStyle = 'rgba(255,240,200,0.75)';
      for (x = -((t * 300) % 110); x < W + 110; x += 110) ctx.fillRect(x, base + 18, 52, 6);
    } else if (theme === 'minamo') {
      // The riverside rail is drawn by drawThemeRail, behind the hero.
    } else if (theme === 'neon') {
      ctx.fillStyle = 'rgba(16,12,34,0.92)'; ctx.fillRect(-20, base, W + 40, 60);
      for (x = -((t * 310) % 90); x < W + 90; x += 90) { ctx.fillStyle = 'rgba(80,240,255,0.85)'; ctx.fillRect(x, base + 6, 44, 5); ctx.fillStyle = 'rgba(255,80,220,0.7)'; ctx.fillRect(x + 50, base + 20, 26, 4); }
    } else {
      ctx.fillStyle = 'rgba(8,20,48,0.85)'; ctx.fillRect(-20, base - 20, W + 40, 80);
      ctx.strokeStyle = 'rgba(90,190,255,0.7)'; ctx.lineWidth = 2;
      for (var r = 0; r < 4; r++) { var yy = base - 18 + r * r * 6; ctx.beginPath(); ctx.moveTo(-20, yy); ctx.lineTo(W + 20, yy); ctx.stroke(); }
      var off = (t * 290) % 60;
      for (x = -off - 60; x < W + 120; x += 60) { ctx.beginPath(); ctx.moveTo(x, base - 18); ctx.lineTo(x - 30, base + 40); ctx.stroke(); }
    }
  }

  function drawWalls(ctx, S, w) {
    if (w.bossId !== 'kateino' || w.m.wall < 2) return;
    var d = w.m.wall, cracked = w.playT < w.m.crackUntil, t = w.t, labels = wallLabels(w);
    [[PLAY_T, 1], [PLAY_B - d, -1]].forEach(function (it) {
      var y = it[0];
      ctx.fillStyle = '#b98a55'; ctx.fillRect(-20, y, W + 40, d);
      ctx.fillStyle = '#9c7243';
      for (var x = -((t * 40) % 46) - 46; x < W + 46; x += 46) ctx.fillRect(x, y, 4, d);
      ctx.fillStyle = it[1] > 0 ? '#5c3d22' : '#5c3d22';
      ctx.fillRect(-20, it[1] > 0 ? y + d - 8 : y, W + 40, 8);
      if (it[1] > 0 ? labels.top : labels.bottom) {
        ctx.font = '700 24px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        outlinedText(ctx, 'しんぱいの かべ', W / 2, y + d / 2, '#fff1d8', 'rgba(70,40,20,0.9)', 5);
      }
      if (cracked) {
        ctx.strokeStyle = '#2a1708'; ctx.lineWidth = 3;
        for (var c = 0; c < 4; c++) {
          var cx = 70 + c * 130; ctx.beginPath(); ctx.moveTo(cx, y);
          for (var s = 1; s <= 4; s++) ctx.lineTo(cx + (s % 2 ? 14 : -10), y + d * s / 4);
          ctx.stroke();
        }
      }
    });
  }

  function drawPickups(ctx, S, w) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    w.pickups.forEach(function (pk) {
      var pulse = 1 + Math.sin(pk.age * 6) * 0.08, col = pk.kind === 'pace' ? 'rgba(140,255,170,0.95)' : pk.kind === 'make' ? 'rgba(255,226,140,0.95)' : 'rgba(255,190,240,0.95)';
      glow(ctx, pk.x, pk.y, 58 * pulse, col, 0.9);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(pk.x, pk.y, 22 * pulse, 0, Math.PI * 2); ctx.fill();
      if (pk.kind === 'pace') drawSprite(ctx, S, 'spirits', 1, 3, pk.x, pk.y, 40);
      else if (pk.kind === 'make') drawSprite(ctx, S, 'items', 0, 2, pk.x, pk.y, 34);
      else { var sd = spiritDef((pk.data && pk.data.spirit) || 'spirit:0'); if (sd) drawSprite(ctx, S, sd.sheet, sd.frame[0], sd.frame[1], pk.x, pk.y, 40); }
      var label = pk.kind === 'pace' ? noticeText('paceItem') : pk.kind === 'make' ? noticeText('makeItem') : ((pk.data && pk.data.name) || 'こえ');
      ctx.font = '700 24px ' + FONT;
      outlinedText(ctx, label, pk.x, pk.y + 50);
    });
  }

  function bossFrame(w) {
    var b = w.b, t = w.t, id = w.bossId;
    if (id === 'zero' && w.state === 'win') {
      var s = w.stateT;
      return s < 1.2 ? [1, Math.floor(t * 6) % 3] : s < 2.0 ? [2, 0] : s < 2.8 ? [2, 1] : [2, 2];
    }
    if (w.state === 'win') return [2, 2];
    if (b.hurtT > 0) return [2, Math.floor(t * 8) % 2];
    if (id === 'kateino' && w.playT < w.m.crackUntil && w.state === 'play') return [2, Math.floor(t * 3) % 2];
    if (b.attackT > 0) return [1, clamp(Math.floor((0.45 - b.attackT) / 0.15), 0, 2)];
    return [0, Math.floor(t * 5) % 3];
  }

  function drawBoss(ctx, S, w) {
    var b = w.b, d = w.def;
    if (b.x > W + 220) return;
    var tell = b.tell || 0, auraA = 0.22 + Math.sin(w.t * 3) * 0.06 + b.flash * 0.25 + tell * 0.3;
    if (!(w.bossId === 'zero' && w.state === 'win' && w.stateT > 2.8)) glow(ctx, b.x, b.y + d.bodyDY, d.drawH * 0.75, d.color, auraA);
    // Tame (telegraph): a warm pulse grows on the boss just before each shot, so an attack is seen coming
    // without the fire timing itself changing (see attackDue's TELL_WINDOW).
    if (tell > 0.1 && w.state === 'play') glow(ctx, b.x, b.y + d.bodyDY, d.drawH * (0.35 + tell * 0.25), 'rgba(255,230,160,0.9)', tell * 0.4);
    if (w.bossId === 'jibun') {
      var c = Math.floor(w.t * 10) % 4, sat = w.m.made / d.makes, gimg = S.gray && S.gray[c];
      var alpha = w.state === 'play' && Math.floor(w.t * 3) % 2 ? 0.92 : 1;
      ctx.globalAlpha = alpha;
      if (gimg && sat < 1) { var s = d.drawH / gimg.height, dw = gimg.width * s; ctx.save(); ctx.translate(b.x, b.y); ctx.scale(-1, 1); ctx.drawImage(gimg, -dw / 2, -d.drawH / 2, dw, d.drawH); ctx.restore(); }
      if (sat > 0 || !gimg) { ctx.globalAlpha = alpha * (gimg ? sat : 1); drawSprite(ctx, S, 'ryosei', 1, c, b.x, b.y, d.drawH, true, 'ジブン'); }
      ctx.globalAlpha = 1;
      return;
    }
    var f = bossFrame(w), h = d.drawH, bx = b.x + (b.kick || 0);
    if (w.bossId === 'zero' && w.state === 'win' && w.stateT > 2.8) {
      h = 170; glow(ctx, b.x, b.y, 150, 'rgba(255,240,200,0.9)', 0.6 + Math.sin(w.t * 4) * 0.15);
    }
    // R241: BUG KING and カテイノジジョウ stand on legs but had nothing under them and looked hung in the air,
    // so a soft dark shadow lies under their feet (the bottom of the picture). feet is its half width per drawH.
    var bsq = squashScale(b);
    // R283: on the night street the black shadow sank into the dark wall and BUG KING still looked hung in the air (mobile-34),
    // so a faint light and a thin line in its colour lie over the shadow under the feet, like the hero's hover glow.
    if (d.feet) drawFeetShadow(ctx, bx, b.y + (h / 2 - 4) * bsq.sy, h * d.feet * bsq.sx);
    if (d.feetGlow) drawFeetGlow(ctx, bx, b.y + (h / 2 - 4) * bsq.sy, h * d.feet * 1.5 * bsq.sx, d.color, 0.6 + Math.sin(w.t * 3) * 0.1);
    ctx.save(); ctx.translate(bx, b.y); ctx.scale(bsq.sx, bsq.sy); ctx.translate(-bx, -b.y);
    drawSprite(ctx, S, d.sheet, f[0], f[1], bx, b.y, h, false, d.name);
    var wimg = b.whiteT > 0 && whiteOf(frameImg(S, d.sheet, f[0], f[1]));
    if (wimg) {
      var ws = h / wimg.height, ww = wimg.width * ws;
      ctx.globalAlpha = 0.6; ctx.drawImage(wimg, bx - ww / 2, b.y - h / 2, ww, h); ctx.globalAlpha = 1;
    }
    if (b.flash > 0.05) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = b.flash * 0.55;
      drawSprite(ctx, S, d.sheet, f[0], f[1], bx, b.y, h, false);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    if (d.crown && w.hasOwl && w.state === 'play') {
      var cx = bx + d.crown[0], cy = b.y + d.crown[1], pr = d.crown[2] + Math.sin(w.t * 8) * 4;
      glow(ctx, cx, cy, pr * 1.8, 'rgba(255,236,120,0.9)', 0.75);
      ctx.strokeStyle = 'rgba(255,250,200,0.95)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawFeetGlow(ctx, x, y, rx, color, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.3); ctx.translate(-x, -y);
    glow(ctx, x, y, rx, color, alpha);
    ctx.restore();
    ctx.globalAlpha = alpha * 0.7; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y + 2, rx * 0.62, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawFeetShadow(ctx, x, y, rx) {
    var ry = rx * 0.2, g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.8)'); g.addColorStop(0.6, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // White copy of a sprite frame (cached), drawn for a moment when a shot lands.
  var whiteCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function whiteOf(img) {
    if (!img || !whiteCache) return null;
    var c = whiteCache.get(img);
    if (c !== undefined) return c;
    try {
      c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    } catch (_) { c = null; }
    whiteCache.set(img, c);
    return c;
  }

  function drawBugs(ctx, w) {
    w.bugs.forEach(function (bg) {
      var wig = Math.sin(bg.age * 18) * 3;
      ctx.save(); ctx.translate(bg.x, bg.y);
      glow(ctx, 0, 0, 30, 'rgba(120,255,120,0.6)', 0.6);
      ctx.strokeStyle = '#14361a'; ctx.lineWidth = 3;
      for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 7, 0); ctx.lineTo(i * 9 - 4, 16 + (i % 2 ? wig : -wig)); ctx.moveTo(i * 7, 0); ctx.lineTo(i * 9 - 4, -16 - (i % 2 ? wig : -wig)); ctx.stroke(); }
      ctx.fillStyle = bg.flash > 0.1 ? '#ffffff' : '#46d65a'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d5e27'; ctx.fillRect(-1, -12, 2, 24);
      ctx.fillStyle = '#d6ffd0'; ctx.beginPath(); ctx.arc(-15, -4, 3, 0, Math.PI * 2); ctx.arc(-15, 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawCircle(ctx, S, w) {
    if (w.bossId !== 'zero') return;
    var list = w.m.connected, n = list.length, p = w.p;
    if (!n) return;
    var winT = w.state === 'win' ? w.stateT : -1;
    list.forEach(function (v, i) {
      var a = Math.PI * 0.62 + (n === 1 ? 0.5 : i / Math.max(1, w.m.voices.length - 1)) * Math.PI * 0.76;
      var x = p.x + Math.cos(a) * 96, y = p.y - Math.sin(a) * 96 + Math.sin(w.t * 2 + i) * 6;
      if (winT >= 0 && winT < 1.3) { var k = clamp(winT / 1.2, 0, 1); x += (w.b.x - x) * k; y += (w.b.y - y) * k; }
      else if (winT >= 1.3) return;
      glow(ctx, x, y, 34, 'rgba(255,220,250,0.8)', 0.7);
      var sd = spiritDef(v.spirit || ('spirit:' + i));
      if (sd) drawSprite(ctx, S, sd.sheet, sd.frame[0], sd.frame[1], x, y, 40);
    });
  }

  function drawOptions(ctx, S, w) {
    w.options.forEach(function (o, i) {
      var y = o.y + Math.sin(w.t * 3 + i * 2) * 5;
      glow(ctx, o.x, y, 36, 'rgba(200,240,255,0.7)', 0.55);
      if (o.flash > 0.05) { ctx.strokeStyle = 'rgba(230,250,255,' + o.flash + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.x, y, 30, 0, Math.PI * 2); ctx.stroke(); }
      drawSprite(ctx, S, o.def.sheet, o.def.frame[0], o.def.frame[1], o.x, y, 52, false);
    });
  }

  function drawPlayer(ctx, S, w) {
    var p = w.p, t = w.t, r = 1, c = Math.floor(t * 10) % 4;
    if (w.state === 'intro' && !p.risen) { r = 0; c = 0; }
    if (p.hurtT > 0) { r = 3; c = 0; }
    if (w.state === 'lose') { r = 3; c = 1; }
    if (w.state === 'win' && w.stateT > 1.0) { r = 3; c = 3; }
    if (p.risen && w.state !== 'lose') {
      var wy = p.y + P_DRAW_H * 0.46;
      glow(ctx, p.x + 2, wy, 54, 'rgba(110,240,255,0.9)', 0.55 + Math.sin(t * 20) * 0.1);
      ctx.fillStyle = 'rgba(190,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(p.x + 2, wy + 4, 40, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (Math.random() < 0.6 && w.fx.length < 420) w.fx.push({ x: p.x - 30 + Math.random() * 60, y: wy + 4, vx: -160 - Math.random() * 120, vy: Math.random() * 30, life: 0.3, age: 0, color: '#9ff6ff', size: 2 + Math.random() * 2 });
    }
    if (w.roar > 0) {
      ctx.globalAlpha = Math.min(1, w.roar * 1.6) * 0.8;
      drawSprite(ctx, S, 'tiger', 1, 1, p.x - 10, p.y - 50, 190, false);
      ctx.globalAlpha = 1;
    }
    if (p.charging) {
      var k = Math.min(1, p.charge / CHARGE_FULL);
      glow(ctx, p.x + 30, p.y, 40 + 50 * k, k >= 1 ? 'rgba(255,230,120,0.95)' : 'rgba(140,240,255,0.9)', 0.4 + 0.5 * k);
      if (k >= 1) { ctx.strokeStyle = 'rgba(255,240,170,0.95)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x + 30, p.y, 44 + Math.sin(t * 20) * 5, 0, Math.PI * 2); ctx.stroke(); }
    }
    var blink = w.state === 'play' && p.inv > 0 && Math.floor(t * 18) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    var psq = squashScale(p);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(psq.sx, psq.sy); ctx.translate(-p.x, -p.y);
    drawSprite(ctx, S, 'ryosei', r, c, p.x, p.y, P_DRAW_H, false, 'RYOSEI');
    ctx.restore();
    ctx.globalAlpha = 1;
    if (p.barrier && p.barrier.up && w.state === 'play') {
      ctx.strokeStyle = 'rgba(150,230,255,' + (0.55 + Math.sin(t * 5) * 0.15) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 66, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(150,230,255,0.08)'; ctx.fill();
    }
  }

  function drawShots(ctx, S, w) {
    w.shots.forEach(function (s) {
      var a = s.ghost ? 0.3 : 1;
      if (s.kind === 'tiger') {
        glow(ctx, s.x, s.y, 90, 'rgba(140,240,255,0.85)', 0.75);
        drawSprite(ctx, S, 'tiger', 1, 0, s.x, s.y, 120, false, 'フク');
        return;
      }
      if (s.kind === 'heart') {
        ctx.globalAlpha = a; glow(ctx, s.x, s.y, 24, 'rgba(255,140,190,0.9)', 0.6 * a);
        ctx.fillStyle = '#ff6fa6'; heartPath(ctx, s.x, s.y - 9, 22); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        return;
      }
      var rb = s.kind === 'rainbow' || s.fever;
      var col = rb ? 'hsl(' + Math.floor((s.age * 900 + s.y) % 360) + ',100%,75%)' : s.kind === 'opt' ? '#fff3b0' : '#8ff4ff';
      var len = s.kind === 'opt' ? 10 : s.small ? 14 : 20, rad = s.kind === 'opt' ? 4 : s.small ? 5 : 6;
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
      // Rainbow shots add light (never dark ovals on a night background), so they do not look like enemy bullets.
      if (rb) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = col; ctx.globalAlpha = a * (rb ? 0.8 : 0.5); ctx.beginPath(); ctx.ellipse(-len * 0.4, 0, len, rad * 1.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, len * 0.55, rad, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    });
  }

  function drawWordEffects(ctx, w) {
    var v = w.vectorHint;
    if (v && w.t < v.until) {
      ctx.save(); ctx.strokeStyle = '#fff5d6'; ctx.lineWidth = 4;
      [0, -0.42, 0.42].forEach(function (a) { ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(66, 0); ctx.lineTo(54, -8); ctx.moveTo(66, 0); ctx.lineTo(54, 8); ctx.stroke(); ctx.restore(); });
      ctx.restore();
    }
    if (w.t < w.ifUntil) { ctx.font = '700 24px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlinedText(ctx, 'if (バリア) → ふせぐ', W / 2, PLAY_B - 28, '#8de2ff'); }
  }

  function drawEnemyBullets(ctx, w) {
    var t = w.t, i, pulse = Math.pow(1 - w.beat.phase % 1, 5);
    w.eb.forEach(function (e) {
      if (e.dead) return;
      ctx.save(); ctx.shadowColor = '#fff5d6'; ctx.shadowBlur = 3 + pulse * 14;
      if (e.kind === 'block' || e.kind === 'noise') {
        var s = e.hw * 2, x0 = e.x - e.hw, y0 = e.y - e.hh, n = 4, cs = s / n;
        for (i = 0; i < n * n; i++) {
          var v = Math.floor(hash(i + Math.floor(t * 20) * 7 + e.x) * 200) + 40;
          ctx.fillStyle = e.kind === 'noise' ? 'rgb(' + (v * 0.6 | 0) + ',' + (v * 0.5 | 0) + ',' + v + ')' : 'rgb(' + v + ',' + v + ',' + v + ')';
          ctx.fillRect(x0 + (i % n) * cs, y0 + Math.floor(i / n) * cs, cs + 0.5, cs + 0.5);
        }
        ctx.strokeStyle = e.flash > 0.1 ? '#fff' : e.kind === 'noise' ? '#c9b8ff' : '#ff5a6e'; ctx.lineWidth = 3; ctx.strokeRect(x0, y0, s, s);
      } else if (e.kind === 'bubble') {
        var bw = e.hw * 2, bh = e.hh * 2;
        ctx.fillStyle = e.flash > 0.1 ? '#ffe7e7' : e.chord ? '#ffd9b0' : '#fffaf0'; rr(ctx, e.x - e.hw, e.y - e.hh, bw, bh, 22); ctx.fill();
        ctx.beginPath(); ctx.moveTo(e.x + e.hw - 26, e.y + e.hh - 2); ctx.lineTo(e.x + e.hw + 8, e.y + e.hh + 14); ctx.lineTo(e.x + e.hw - 6, e.y + e.hh - 8); ctx.fill();
        ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 3; rr(ctx, e.x - e.hw, e.y - e.hh, bw, bh, 22); ctx.stroke();
        ctx.font = '700 24px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a1c1c';
        ctx.fillText(e.text, e.x, e.y + 1, bw - 12);
      } else if (e.kind === 'number') {
        var g = ctx.createLinearGradient(0, e.y - e.hh, 0, e.y + e.hh);
        g.addColorStop(0, e.flash > 0.1 ? '#ffffff' : '#ffe27a'); g.addColorStop(1, '#ff9a1f');
        ctx.fillStyle = g; rr(ctx, e.x - e.hw, e.y - e.hh, e.hw * 2, e.hh * 2, 8); ctx.fill();
        ctx.strokeStyle = '#5a2a00'; ctx.lineWidth = 3; ctx.stroke();
        ctx.font = '800 24px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3b1300';
        ctx.fillText(e.text, e.x, e.y + 1, e.hw * 2 - 8);
      } else if (e.kind === 'star') {
        glow(ctx, e.x, e.y, 22, 'rgba(255,220,90,0.9)', 0.6);
        ctx.fillStyle = '#ffe066'; ctx.beginPath();
        for (i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5 + t * 3, rad = i % 2 ? 5 : 12; ctx.lineTo(e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        var col = e.kind === 'gray' ? 'rgba(200,205,215,0.95)' : e.kind === 'sigh' ? 'rgba(170,200,255,0.95)' : w.bossId === 'zero' ? 'rgba(190,160,255,0.95)' : 'rgba(255,110,140,0.95)';
        glow(ctx, e.x, e.y, e.r * 2.4, col, 0.75);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.45, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawFx(ctx, w) {
    ctx.globalCompositeOperation = 'lighter';
    w.fx.forEach(function (f) {
      var k = f.age / f.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (f.ring) {
        ctx.strokeStyle = f.color; ctx.lineWidth = 1 + 3 * (1 - k);
        ctx.beginPath(); ctx.arc(f.x, f.y, 4 + f.size * k, 0, Math.PI * 2); ctx.stroke();
        return;
      }
      ctx.fillStyle = f.color; ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
    });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  var noiseCanvas = null;
  function drawZeroNoise(ctx, S, w) {
    if (w.bossId !== 'zero') return;
    var a = w.state === 'win' ? Math.max(0, 1 - w.stateT / 2.4) : 1;
    if (a <= 0.01) return;
    if (!noiseCanvas) { noiseCanvas = document.createElement('canvas'); noiseCanvas.width = 90; noiseCanvas.height = 160; }
    var nc = noiseCanvas.getContext('2d'), id = nc.createImageData(90, 160), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255; d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.1; d[i + 3] = 255; }
    nc.putImageData(id, 0, 0);
    ctx.globalAlpha = 0.09 * a; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noiseCanvas, 0, PLAY_T, W, PLAY_B - PLAY_T);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.18 * a; ctx.fillStyle = '#d8ccff';
    for (var k = 0; k < 3; k++) { var y = PLAY_T + hash(k + Math.floor(w.t * 7)) * (PLAY_B - PLAY_T); ctx.fillRect(0, y, W, 2 + hash(k + 3) * 6); }
    ctx.globalAlpha = 1;
  }

  // R101 follow-up (R102): the right-hand label row sits between the HP bar and the band's bottom line (PLAY_T - 3),
  // with its 24px letters and outline clear of both.
  // R298: the label had 2px of air under the HP bar (then 58..80) and 1px over the line; the name moved to y29, the bar to 50..70
  // and the label to 92, so each gap is 6px or more. The BPM and フィーバー banners (45..75) cover only the bar, never the label.
  var LABEL_Y = 92;
  // R327: SPEC_V7_MANABU.md 9: the band's hint label reads in kanji in adult mode, like the move hint and menus
  // (攻撃力 as on the status screen, and the countdown says 秒 like cooldownLabel).
  function bandLabel(k, sec) {
    var adult = RYW.mode === 'adult';
    if (k === 'crack') return adult ? 'ボスへのダメージ 2倍 残り' + sec + '秒' : 'ボスへの ダメージ 2ばい ' + sec;
    if (k === 'half') return adult ? 'ボスへのダメージ 半分' : 'ボスへの ダメージ はんぶん';
    if (k === 'color') return adult ? '色' : 'いろ'; // R329: the ジブン band, like ジブンに色が戻る
    return adult ? '攻撃力' : 'きみの こうげき';
  }
  function drawTopBand(ctx, S, w) {
    var d = w.def, b = w.b;
    var g = ctx.createLinearGradient(0, 0, 0, PLAY_T);
    g.addColorStop(0, 'rgba(6,10,24,0.95)'); g.addColorStop(1, 'rgba(6,12,28,0.82)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, PLAY_T);
    ctx.fillStyle = d.color; ctx.globalAlpha = 0.7; ctx.fillRect(0, PLAY_T - 3, W, 3); ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = '800 26px ' + FONT;
    outlinedText(ctx, d.name, 20, 29, '#fff3c4');
    ctx.font = '700 24px ' + FONT; ctx.textAlign = 'right';
    // R169: say whose damage / attack the label is about, so the player can read it as a hint.
    if (w.mode !== 'challenge' && w.bossId === 'kateino') {
      var left = w.m.crackUntil - w.playT;
      if (left > 0) outlinedText(ctx, bandLabel('crack', Math.ceil(left)), W - 20, LABEL_Y, '#ffd76b');
      else outlinedText(ctx, bandLabel('half'), W - 20, LABEL_Y, '#c9d6e8');
    } else if (w.mode !== 'challenge' && w.bossId === 'hikaku') {
      // Attack power as a meter: 4 bars at full power, one goes out per number hit (never below 1).
      outlinedText(ctx, bandLabel('power'), W - 110, LABEL_Y, '#ffe9a8');
      for (var i = 0; i < 4; i++) {
        var on = i < 4 - w.m.down, bh = 8 + i * 5, px = W - 100 + i * 21;
        ctx.fillStyle = on ? '#ffd24a' : 'rgba(255,255,255,0.16)'; ctx.fillRect(px, LABEL_Y + 11 - bh, 15, bh);
        if (on) { ctx.strokeStyle = 'rgba(90,50,0,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(px, LABEL_Y + 11 - bh, 15, bh); }
      }
    } else if (w.mode !== 'challenge' && w.bossId === 'zero') {
      outlinedText(ctx, 'つながり ' + w.m.got + '/' + w.m.voices.length, W - 20, LABEL_Y, '#ffd0f4');
    }
    if (d.hp) {
      var x = 20, y = 50, bw = W - 40, bh = 20;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x, y, bw, bh, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,236,170,0.8)'; rr(ctx, x + 3, y + 3, Math.max(0, (bw - 6) * b.ghostHp / b.maxHp), bh - 6, 6); ctx.fill();
      var hg = ctx.createLinearGradient(x, 0, x + bw, 0); hg.addColorStop(0, '#ff6b8a'); hg.addColorStop(1, d.color);
      ctx.fillStyle = hg; rr(ctx, x + 3, y + 3, Math.max(0, (bw - 6) * b.hp / b.maxHp), bh - 6, 6); ctx.fill();
      if (b.flash > 0.05) { ctx.fillStyle = 'rgba(255,255,255,' + (b.flash * 0.35) + ')'; ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; [0.25, 0.5, 0.75].forEach(function (q) { ctx.fillRect(x + 3 + (bw - 6) * q - 1, y + 3, 2, bh - 6); });
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; rr(ctx, x, y, bw, bh, 8); ctx.stroke();
    } else if (w.bossId === 'jibun') {
      ctx.textAlign = 'left'; outlinedText(ctx, bandLabel('color'), 20, 76, '#e5e9f2');
      for (var k = 0; k < w.def.makes; k++) {
        var sx = 80 + k * 148;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, sx, 64, 138, 24, 8); ctx.fill();
        if (k < w.m.made) { var cg = ctx.createLinearGradient(sx, 0, sx + 138, 0); cg.addColorStop(0, '#7fd8ff'); cg.addColorStop(1, '#ffd36b'); ctx.fillStyle = cg; rr(ctx, sx + 3, 67, 132, 18, 6); ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; rr(ctx, sx, 64, 138, 24, 8); ctx.stroke();
      }
    } else if (w.bossId === 'zero') {
      // R104: the row of voice circles stops 12px before the つながり label (up to 8 voices), so they never run into its letters.
      var nv = w.m.voices.length, room = W - 20 - ctx.measureText('つながり ' + nv + '/' + nv).width - 12 - 20;
      var step = Math.min(48, room / Math.max(1, nv)), cr = Math.min(19, step / 2 - 2);
      for (var v = 0; v < nv; v++) {
        var cx = 20 + step / 2 + v * step, cy = 82;
        ctx.fillStyle = v < w.m.got ? 'rgba(255,200,240,0.35)' : 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = v < w.m.got ? '#ffd0f4' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        if (v < w.m.got) { var sd = spiritDef(w.m.voices[v].spirit || ('spirit:' + v)); if (sd) drawSprite(ctx, S, sd.sheet, sd.frame[0], sd.frame[1], cx, cy, cr * 2 - 4); }
      }
    }
  }

  function drawBottomBand(ctx, S, w) {
    var p = w.p, y0 = PLAY_B;
    var g = ctx.createLinearGradient(0, y0, 0, H);
    g.addColorStop(0, 'rgba(6,12,28,0.84)'); g.addColorStop(1, 'rgba(6,10,24,0.96)');
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, y0, W, 2);
    var size = Math.min(34, 300 / Math.max(1, p.maxHearts) - 6), gapX = size + 8;
    for (var i = 0; i < p.maxHearts; i++) {
      var hx = 22 + size / 2 + i * gapX, hy = y0 + 18;
      heartPath(ctx, hx, hy, size);
      if (i < p.hearts) { ctx.fillStyle = '#ff5c7a'; ctx.fill(); ctx.strokeStyle = '#ffe1e8'; }
      else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; }
      ctx.lineWidth = 2.5; ctx.stroke();
    }
    var ix = 22 + p.maxHearts * gapX + 6;
    if (p.barrier && ix < 320) {
      var up = p.barrier.up, bx = ix + 18, by = y0 + 32;
      ctx.globalAlpha = up ? 1 : 0.35; drawSprite(ctx, S, 'items', 2, 0, bx, by, 36); ctx.globalAlpha = 1;
      if (!up) {
        var k = 1 - clamp((p.barrier.at - w.t) / BARRIER_BACK, 0, 1);
        ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 22, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      }
    }
    ctx.font = '700 24px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

    var icons = WEAPONS.filter(function (wp) { return wp.icon && w.weapons[wp.id]; }), xi = 22;
    icons.forEach(function (wp) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, xi - 2, y0 + 45, 38, 38, 8); ctx.fill();
      drawSprite(ctx, S, 'items', wp.icon[0], wp.icon[1], xi + 17, y0 + 65, 34);
      xi += 43;
    });
    if (!icons.length) {
      ctx.font = '700 24px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      outlinedText(ctx, WEAPONS[0].name, 22, y0 + 65, '#bfe9f5');
    }
  }

  function hitboxes(w) {
    return [{ x: w.p.x - P_HIT_R, y: w.p.y - 4 - P_HIT_R, width: P_HIT_R * 2, height: P_HIT_R * 2 }].concat(w.eb.concat(w.shots, w.bugs).filter(function (e) { return !e.dead; }).map(function (e) {
      var hw = e.r || e.hw, hh = e.r || e.hh; return { x: e.x - hw, y: e.y - hh, width: hw * 2, height: hh * 2 };
    }));
  }
  function drawRhythm(ctx, S, w) {
    var r = w.beat, pulse = Math.pow(1 - (r.phase % 1), 5), y = 929, x = 42, right = 328;
    ctx.save(); ctx.strokeStyle = '#66899e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.strokeStyle = pulse > .4 ? '#fff6b0' : '#9fd8e6'; ctx.lineWidth = 3 + pulse * 3;
    ctx.beginPath(); ctx.arc(x, y, 17 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
    for (var i = Math.ceil(r.phase); i <= r.phase + 4; i++) {
      var nx = x + (i - r.phase) * 68, big = i % 4 === 0;
      ctx.fillStyle = big ? '#ffe28a' : '#9fd8e6'; ctx.beginPath(); ctx.arc(nx, y, big ? 10 : 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = '700 24px ' + FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    // R308: the count follows the word, like 最高コンボ 48 on the record and ステージ 1 on the left.
    outlinedText(ctx, 'コンボ ' + r.combo, 520, 29, '#ffe28a');
    ctx.textAlign = 'left';
    if (w.mode === 'challenge') outlinedText(ctx, 'ステージ ' + w.stage, 20, LABEL_Y, '#9fd8e6');
    if (r.time < r.tempoUntil) {
      ctx.fillStyle = '#10233a'; ctx.fillRect(12, 45, 516, 30); ctx.textAlign = 'center';
      outlinedText(ctx, 'BPM ' + r.bpm + '！', W / 2, 60, '#ffe28a');
    }
    if (r.judgement && r.time < r.judgement.until) {
      ctx.textAlign = 'center'; var label = { perfect: 'パーフェクト', good: 'グッド', miss: 'ミス' }[r.judgement.kind];
      outlinedText(ctx, label, clamp(w.p.x, 90, W - 90), Math.max(PLAY_T + 22, w.p.y - 86), '#fff5d6');
    }
    if (r.phase < r.feverUntil) {
      var feverColor = 'hsl(' + (r.phase * 100 % 360) + ',100%,70%)';
      ctx.strokeStyle = feverColor; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(w.p.x, w.p.y - 4, 65, 0, Math.PI * 2); ctx.stroke();
      // Say it big at the top (like the BPM banner) instead of crowding the player's feet,
      // so the biggest reward in the rhythm fight is easy to read, not just a ring underfoot.
      ctx.fillStyle = '#10233a'; ctx.fillRect(12, 45, 516, 30); ctx.textAlign = 'center';
      outlinedText(ctx, 'フィーバー！', W / 2, 60, feverColor);
    }
    if (w.playtest && w.playtest.phase === 'reaction') {
      ctx.fillStyle = '#10233a'; ctx.fillRect(100, PLAY_B - 90, 340, 60); ctx.textAlign = 'center';
      outlinedText(ctx, '……たのしい', W / 2, PLAY_B - 60, '#fff5d6');
    }
    if (w.cheats.showhitbox) { ctx.strokeStyle = '#7dff9d'; ctx.lineWidth = 2; hitboxes(w).forEach(function (r) { ctx.strokeRect(r.x, r.y, r.width, r.height); }); }
    ctx.restore();
    S.beatBtn.disabled = S.paused || !!w.playtest || (!S.wordCards.length && w.state !== 'play');
    // R155: no gold pulse while the button cannot be pressed (the intro), so it does not invite a press that does nothing.
    S.beatBtn.className = 'rs-beat' + (pulse > .4 && !S.beatBtn.disabled ? ' rs-lit' : '');
  }

  function drawTicker(ctx, w) {
    if (!w.tickers.length) return;
    ctx.font = '700 26px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10,10,30,0.55)'; ctx.fillRect(0, PLAY_B - 92, W, 44);
    w.tickers.forEach(function (tk) { outlinedText(ctx, tk.text, tk.x, PLAY_B - 70, '#ffe9a8'); });
  }

  // A compact line panel: the speaker's name in front of the first line, on its own gold tag
  // (R311: as plain gold text it read as the first word of the line, e.g. 「カテイノジジョウ しょうらい」).
  function drawPanelText(ctx, speaker, text, y, alpha) {
    var lh = 31, pad = 10, x0 = 16, tx = x0 + 16;
    ctx.font = '700 24px ' + FONT;
    var sw = speaker ? ctx.measureText(speaker).width + 14 : 0;
    var lines = wrapLines(ctx, text, W - 2 * tx, sw), hh = lines.length * lh + pad * 2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(12,22,44,0.84)'; rr(ctx, x0, y, W - 2 * x0, hh, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(225,216,173,0.75)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (speaker) {
      ctx.fillStyle = '#f1cd7c'; rr(ctx, tx - 5, y + pad - 1, sw - 4, 30, 7); ctx.fill();
      ctx.fillStyle = '#1b2440'; ctx.fillText(speaker, tx, y + pad + 2);
    }
    ctx.fillStyle = '#fff5d6';
    lines.forEach(function (ln, i) { ctx.fillText(ln, i ? tx : tx + sw, y + pad + 2 + i * lh); });
    ctx.globalAlpha = 1;
    return hh;
  }

  // Lines, short notices and the move hint. Drawn under the hero and the bullets (see render).
  // While a word card is up it sits at the top of the field, so the lines and notices start under it.
  function drawFieldTexts(ctx, S, w) {
    // Slide toward the new start instead of jumping when a card appears or goes away.
    var off = wordCardH(S); S.textOff = S.textOff == null ? off : Math.abs(off - S.textOff) < 1 ? off : S.textOff + (off - S.textOff) * 0.2;
    var y = PLAY_T + 8 + S.textOff;
    if (w.burst) {
      y += drawPanelText(ctx, w.burst.speaker, w.burst.text, y, burstAlpha(w.burst, w.t)) + 6;
    }
    if (w.toast) {
      var tt = w.t - w.toast.t, ta = clamp(Math.min(tt * 6, (w.toast.dur - tt) * 3), 0, 1);
      ctx.font = '700 24px ' + FONT;
      var lines = wrapLines(ctx, w.toast.text, W - 100), hh = lines.length * 30 + 14;
      ctx.globalAlpha = ta; ctx.fillStyle = 'rgba(60,30,70,0.86)'; rr(ctx, 40, y, W - 80, hh, 12); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffe9a8';
      lines.forEach(function (ln, i) { ctx.fillText(ln, W / 2, y + 9 + i * 30); });
      ctx.globalAlpha = 1;
      y += hh + 6;
    }
    // R56: the rapid chip's wait time shows during the entrance, in the same flow as the lines above,
    // so a word card or a two-line boss line pushes it down instead of drawing over it.
    if (w.state === 'intro' && w.weapons.rapid && cooldownNoteY(y) != null) {
      ctx.font = '700 24px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      outlinedText(ctx, word('cooldown', 'れんしゃ') + ' ' + cooldownLabel(), W / 2, y + 18, '#fff5d6');
    }
    if (w.state === 'play' && w.stateT < HINT_T) {
      var ha = hintAlpha(w.stateT);
      ctx.globalAlpha = ha; ctx.fillStyle = 'rgba(10,20,40,0.78)'; rr(ctx, 60, HINT_PLATE_T, W - 120, 82, 14); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 24px ' + FONT;
      // R156: on a touch-only device (index.html sets .touch-only) the keyboard line is left out.
      var mh = moveHintLines();
      if (touchOnly()) outlinedText(ctx, mh[0], W / 2, PLAY_B - 119, '#fff5d6');
      else {
        outlinedText(ctx, mh[0], W / 2, PLAY_B - 136, '#fff5d6');
        outlinedText(ctx, mh[1], W / 2, PLAY_B - 102, '#c9e8f2');
      }
      ctx.globalAlpha = 1;
    }
  }

  // R314: SPEC_V7_MANABU.md 9: the move hint reads in kanji in adult mode, like the battle and menu lines.
  function moveHintLines() { return RYW.mode === 'adult' ? ['指を滑らせて動く', '矢印・WASDでも動く'] : ['ゆびを すべらせて うごく', 'やじるし・WASD でも うごく']; }

  function touchOnly() { return !!(root.document && root.document.documentElement && root.document.documentElement.classList.contains('touch-only')); }

  // Center y of the cooldown note, just under the stacked lines. When they reach down toward the intro
  // plate (INTRO_PLATE_T) there is no free row, so the note is left out (the rapid chip's message already showed it).
  function cooldownNoteY(y) { return y + 18 <= INTRO_PLATE_T - 20 ? y + 18 : null; }

  function drawTexts(ctx, S, w) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // R242/R290: the lines wait until the hero is visibly off the ground (INTRO_LINES_T), so they never say "it floated" while it stands.
    if (w.state === 'intro' && w.stateT > INTRO_LINES_T && w.stateT < INTRO_TEXT_END) {
      var ia = clamp(Math.min((w.stateT - INTRO_LINES_T) * 4, (INTRO_TEXT_END - w.stateT) * 3), 0, 1);
      ctx.globalAlpha = ia; ctx.font = '800 30px ' + FONT;
      // R75: a dark plate behind the two lines, so they stay readable over a bright city background.
      var iw = Math.max(ctx.measureText('フクの ちからで').width, ctx.measureText('キックボードが うかんだ！').width) + 48;
      ctx.fillStyle = 'rgba(8,14,34,0.74)'; rr(ctx, (W - iw) / 2, INTRO_PLATE_T, iw, INTRO_PLATE_H, 14); ctx.fill();
      outlinedText(ctx, 'フクの ちからで', W / 2, INTRO_LINE_Y[0], '#bff6ff');
      outlinedText(ctx, 'キックボードが うかんだ！', W / 2, INTRO_LINE_Y[1], '#bff6ff');
      ctx.globalAlpha = 1;
    }
    if (w.state === 'win' && w.stateT > 1.0 && w.bossId !== 'zero') {
      // The win line sits on its own band below the hero (who rests at y 441 to 561), away from the fallen boss's face.
      var wa = clamp((w.stateT - 1.0) * 3, 0, 1);
      ctx.font = '800 30px ' + FONT;
      var wl = wrapLines(ctx, w.lines.win, W - 60), bh = wl.length * 42 + 26, by = 650;
      ctx.globalAlpha = wa;
      ctx.fillStyle = 'rgba(8,12,30,0.78)'; ctx.fillRect(0, by, W, bh);
      ctx.fillStyle = w.def.color; ctx.globalAlpha = wa * 0.8; ctx.fillRect(0, by, W, 3); ctx.fillRect(0, by + bh - 3, W, 3);
      ctx.globalAlpha = wa;
      wl.forEach(function (ln, i) { outlinedText(ctx, ln, W / 2, by + 13 + 21 + i * 42, '#fff3c4', 'rgba(20,10,40,0.95)', 7); });
      ctx.globalAlpha = 1;
    }
    if (w.state === 'lose') {
      ctx.fillStyle = 'rgba(8,14,30,' + clamp(w.stateT * 0.8, 0, 0.55) + ')'; ctx.fillRect(0, PLAY_T, W, PLAY_B - PLAY_T);
    }
  }

  // R330: SPEC_V7_MANABU.md 9: the skill button is a command, so adult mode reads its labels in kanji (みんなの声 as in descAdult of the ゼロ summon).
  // ためる stays in hiragana in both modes: 溜 is not a common-use kanji.
  function skillLabel(k, n) {
    var adult = RYW.mode === 'adult';
    if (k === 'voices') return adult ? 'みんなの声' : 'みんなの こえ';
    if (k === 'voice') return (adult ? '声 ' : 'こえ ') + n;
    if (k === 'rest') return adult ? 'フク 休み' : 'フク やすみ';
        if (k === 'release') return adult ? '放す！' : 'はなす！';
    if (k === 'charging') return adult ? 'ため中' : 'ためちゅう';
    if (k === 'broke') return adult ? '切れた！' : 'きれた！';
    return adult ? '特技' : 'とくぎ';
  }
  function updateButton(S) {
    var w = S.world, mode = skillMode(w), p = w.p, label = 'ー', cls = 'rs-off', gauge = 0;
    // No skill in this fight (no ためうち, not カテイノ/ゼロ): the button is not shown at all.
    var none = !w.weapons.charge && (w.mode === 'challenge' || (w.bossId !== 'kateino' && w.bossId !== 'zero'));
    if (w.state === 'play' || w.state === 'intro') {
      if (mode === 'voices') { label = skillLabel('voices'); cls = 'rs-ready'; gauge = 1; }
      else if (w.mode !== 'challenge' && w.bossId === 'kateino' && (mode === 'show' || !w.weapons.charge)) {
        label = word('playtest', 'みせる');
        if (mode === 'show') { cls = 'rs-ready'; gauge = 1; }
        else { cls = 'rs-off'; gauge = clamp(1 - (w.m.showReadyAt - w.playT) / (SHOW_TIME + SHOW_COOLDOWN), 0, 1); }
      } else if (w.weapons.charge) {
        var rest = p.tigerReadyAt - w.t;
        if (rest > 0) { label = skillLabel('rest'); cls = 'rs-off'; gauge = clamp(1 - rest / TIGER_REST, 0, 1); }
        else { label = 'ためる'; cls = ''; gauge = clamp(p.charge / CHARGE_FULL, 0, 1); }
      }
      else if (w.bossId === 'zero') { label = skillLabel('voice', w.m.got + '/' + w.m.voices.length); cls = 'rs-off'; gauge = w.m.got / w.m.voices.length; }
      if (p.charging) { label = skillLabel(p.charge >= CHARGE_FULL ? 'release' : 'charging'); gauge = clamp(p.charge / CHARGE_FULL, 0, 1); }
      else if (p.brokeAt != null && w.t - p.brokeAt < 0.6) { label = skillLabel('broke'); cls = 'rs-off'; gauge = 0; }
    }
    if (S.keySkill || S.ptrSkill) cls += ' rs-hold';
    var key = label + '|' + cls + '|' + Math.round(gauge * 40) + '|' + none;
    if (key === S.btnKey) return;
    S.btnKey = key;
    S.btn.hidden = none;
    S.btnMain.textContent = label;
    S.btn.className = 'rs-skill ' + cls;
    S.btnGauge.style.width = Math.round(gauge * 100) + '%';
    S.btn.setAttribute('aria-label', skillLabel('top') + ' ' + label);
  }

  // ============ 検証用 ============
  var dbg = {};
  function cw() { return current && current.world; }
  Object.defineProperties(dbg, {
    state: { enumerable: true, get: function () { return current ? (current.loaded ? current.world.state : 'loading') : lastState; } },
    result: { enumerable: true, get: function () { return lastResult; } },
    boss: { enumerable: true, get: function () { return cw() ? cw().bossId : null; } },
    // R86: the line on show now (who, what, seconds shown, seconds it lasts) and how many word cards are up.
    line: { enumerable: true, get: function () { var w = cw(); return w && w.burst ? { speaker: w.burst.speaker, text: w.burst.text, age: w.t - w.burst.t, dur: w.burst.dur } : null; } },
    cards: { enumerable: true, get: function () { return current ? current.wordCards.length : 0; } },
    bossHp: { enumerable: true, get: function () { return cw() ? Math.ceil(cw().b.hp) : null; } },
    bossMaxHp: { enumerable: true, get: function () { return cw() ? cw().b.maxHp : null; } },
    hearts: { enumerable: true, get: function () { return cw() ? cw().p.hearts : null; } },
    maxHearts: { enumerable: true, get: function () { return cw() ? cw().p.maxHearts : null; } },
    weapons: { enumerable: true, get: function () { return cw() ? WEAPONS.filter(function (wp) { return cw().weapons[wp.id]; }).map(function (wp) { return wp.id; }) : []; } },
    options: { enumerable: true, get: function () { return cw() ? cw().options.map(function (o) { return o.def.id; }) : []; } },
    elapsed: { enumerable: true, get: function () { return cw() ? Math.round(cw().playT * 10) / 10 : 0; } },
    skill: { enumerable: true, get: function () { return cw() ? skillMode(cw()) : 'none'; } },
    attackDown: { enumerable: true, get: function () { return cw() && cw().bossId === 'hikaku' ? cw().m.down : 0; } },
    crack: { enumerable: true, get: function () { return cw() && cw().bossId === 'kateino' ? Math.max(0, Math.round((cw().m.crackUntil - cw().playT) * 10) / 10) : 0; } },
    made: { enumerable: true, get: function () { return cw() && cw().bossId === 'jibun' ? cw().m.made : 0; } },
    voices: { enumerable: true, get: function () { return cw() && cw().bossId === 'zero' ? cw().m.got : 0; } },
    bullets: { enumerable: true, get: function () { return cw() ? cw().eb.length : 0; } },
    bossTell: { enumerable: true, get: function () { return cw() ? (cw().b.tell || 0) : 0; } },
    shots: { enumerable: true, get: function () { return cw() ? cw().shots.length : 0; } },
    paused: { enumerable: true, get: function () { return !!(current && current.paused); } },
    player: { enumerable: true, get: function () { return cw() ? { x: Math.round(cw().p.x), y: Math.round(cw().p.y) } : null; } },
    charge: { enumerable: true, get: function () { return cw() ? Math.round(cw().p.charge * 100) / 100 : 0; } },
    barrier: { enumerable: true, get: function () { var b = cw() && cw().p.barrier; return b ? (b.up ? 'up' : 'down') : 'none'; } },
    audio: { enumerable: true, get: function () { return AU.ctx ? AU.ctx.state : 'none'; } },
    sounds: { enumerable: true, get: function () { return AU.played; } }
  });
  dbg.debugMusic = function () { var p = current && current.recPlay; return current ? { mode: current.rec ? 'rec' : 'synth', stage: p ? p.stage : -1, at: p ? p.at : null, offset: p ? p.offset : null } : null; };
  dbg.debugBeat = function () { return cw() ? beatInfo(cw()) : null; };
  dbg.debugPress = function (offsetMs) { return cw() ? pressBeat(cw(), offsetMs) : null; };
  dbg.debugCombo = function (n) { if (cw()) setCombo(cw(), n); return cw() ? beatInfo(cw()) : null; };
  dbg.debugStage = function (n) { return cw() ? setStage(cw(), n) : false; };
  dbg.debugWin = function () { return cw() ? debugWin(cw()) : false; };
  dbg.debugSetHearts = function (n) { if (cw()) debugSetHearts(cw(), n); return cw() ? cw().p.hearts : null; };
  dbg.debugSetBossHp = function (n) { var w = cw(); if (!w || !w.def.hp) return null; w.b.hp = clamp(Number(n) || 0, 1, w.b.maxHp); return w.b.hp; };
  dbg.debugCollect = function () { return cw() ? debugCollect(cw()) : false; };
  // Hearts stop going down (screenshots and long checks). The hits are still counted.
  dbg.debugGod = function (on) { if (cw()) { cw().god = on !== false; if (on !== false) cw().cheated = true; } return cw() ? cw().god : false; };
  window.__shooter = dbg;
})(typeof window !== 'undefined' ? window : globalThis);
