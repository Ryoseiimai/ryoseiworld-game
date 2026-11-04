// og-share: the OutGame table, its interpreter, the share rows on the chapter card and the
// challenge result, validate(), the smoke scenes and what stays out of the Playables bundle.
// navigator.share is a stand-in everywhere here; headless Chrome has a real one that must not be called.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const clone = v => JSON.parse(JSON.stringify(v));
const settle = () => new Promise(setImmediate);
const STAND_IN_ANIME = 'https://anime.invalid/ep1';

module.exports = async function share({ runtime, result, assert, html, root }) {
  const repoRoot = path.join(root, '..');
  let raw = null;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data', 'outgame.js'), 'utf8'), { RYW: { registerOutGame: t => { raw = clone(t); } } });
  const OG = r => r.RYW.OutGame;
  const buttonTexts = r => r.els.get('modal-buttons').children.map(b => b.textContent);
  const row = r => r.els.get('ending-links').children;
  const copyText = r => r.els.get('modal-copy').textContent;
  const standIn = (r, value) => { r.win.navigator = value; };
  const recorder = (r, reply = () => Promise.resolve()) => {
    const calls = [];
    standIn(r, { share(data) { calls.push(data); return reply(data); } });
    return calls;
  };

  const inField = async (opts = {}, mode = 'adult') => {
    const r = await runtime(opts);
    r.tick();
    r.g.debugStartChapter(1);
    r.RYW.setMode(mode);
    r.g.state.mode = mode;
    r.g.state.bosses.push('bugking');
    r.g.state.flags.gameMade = true;
    return r;
  };
  // Plays a challenge through the door, ending with this record on the result window.
  const endRun = (r, rec) => {
    r.g.debugStartChallenge(1);
    r.button('はじめる');
    r.shooterRuns.at(-1).cfg.onEnd({ score: 1, cheated: false, ...rec });
    r.tick(300);
    assert.equal(r.g.modal, 'challenge-result');
  };
  const chapterCard = r => {
    r.g.state.flags.cleared = true;
    r.g.debugEvent([{ chapterClear: true, copy: 'x' }]);
    assert.equal(r.g.screen, 'ending');
  };

  // --- validate(): the real table is clean, and each rule in design_a.md 2.3 fires ---
  const base = await inField();
  const validate = OG(base)._sim.validate;
  assert.equal(validate(raw).length, 0, 'the shipped table has no problems: ' + JSON.stringify(validate(raw)));
  const rowOf = extra => ({ id: 'extra', do: 'share', label: ['あ', 'あ'], in: ['challenge-result'], ...extra });
  const broken = (name, change, pattern) => {
    const t = clone(raw);
    change(t);
    const problems = validate(t);
    assert(problems.some(p => pattern.test(p.message)), `validate catches ${name}: ${JSON.stringify(problems)}`);
  };
  broken('a place that is not in SLOTS', t => { t.items[0].in = ['nowhere']; }, /unknown place/);
  broken('an unknown do', t => { t.items.push(rowOf({ do: 'start' })); }, /unknown do/);
  broken('an unknown view', t => { t.items.push(rowOf({ do: 'view', view: 'nope' })); }, /unknown view/);
  broken('an unknown link', t => { t.items.push(rowOf({ do: 'open', link: 'nope' })); }, /unknown link/);
  broken('an unknown count', t => { t.achievements = [{ id: 'a', name: ['あ', 'あ'], when: { count: 'nope', atLeast: 1 } }]; }, /unknown count/);
  broken('a duplicate id', t => { t.items.push(rowOf({ id: 'share' })); }, /duplicate id/);
  broken('a duplicate achievement id', t => { t.achievements = [1, 2].map(() => ({ id: 'a', name: ['あ', 'あ'], when: 'x' })); }, /duplicate id/);
  broken('a label missing its kids text', t => { t.items[0].label = ['シェアする', '']; }, /both the adult and the kids/);
  broken('a label wider than its place', t => { t.items[0].label = ['全角で十七文字ある長いラベルをここに', 'あ']; }, /wider than/);
  broken('an achievement name over 16 wide', t => { t.achievements = [{ id: 'a', name: ['全角で十七文字ある長いラベルをここに', 'あ'], when: 'x' }]; }, /wider than/);
  broken('more rows than a place holds', t => { t.items.push(rowOf({ in: ['chapter-card'] })); }, /holds at most/);
  broken('a share row with no text for its place', t => { delete t.shareTexts['chapter-card']; }, /no shareTexts line/);
  broken('an unknown {var}', t => { t.shareTexts['chapter-card'][0][0] = '{nope}'; }, /unknown \{nope\}/);
  broken('a URL that is not https', t => { t.links.anime = 'http://anime.invalid/'; }, /https:\/\//);
  for (const [where, put] of Object.entries({
    label: t => { t.items[0].label[0] = 'ryoseiimai'; }, 'share text': t => { t.shareTexts['chapter-card'][0][1] = 'ryoseiimai.github.io'; },
    title: t => { t.share.title = 'RyoseiImai'; }, ui: t => { t.ui.back[0] = 'ryoseiimai'; },
  })) broken('the address in ' + where, put, /only be written in links/);
  for (const [name, when] of Object.entries({ '{not}': { not: 'x' }, '{item}': { item: 'x' }, 'a nested {item}': { not: { item: 'x' } } })) {
    broken('an achievement using ' + name, t => { t.achievements = [{ id: 'a', name: ['あ', 'あ'], when }]; }, /an achievement cannot use/);
  }
  assert(validate('nope').length > 0, 'validate survives something that is not a table');
  result.push('og-share: validate() is empty for the shipped table and catches every rule in design_a.md 2.3, including {not} and {item} in an achievement PASS');

  // registerOutGame drops the bad row, says so on console.error and keeps the rest.
  {
    const r = await inField();
    const t = clone(raw);
    // The bad row's index depends on how many rows ship today, not on og-share's own count: later
    // 課題 append their own items before this test runs, so this is read from `raw`, not hardcoded.
    const badIndex = t.items.length;
    t.items.push(rowOf({ id: 'bad', do: 'nope' }));
    const errors = [], real = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try { r.RYW.registerOutGame(t); } finally { console.error = real; }
    assert(errors.some(e => e.includes('items.' + badIndex)), 'the bad row is reported: ' + errors.join('|'));
    const left = OG(r)._sim.table().items.map(it => it.id);
    assert.equal(left.join(), raw.items.map(it => it.id).join(), 'only the bad row goes: ' + left);
    assert.equal(OG(r).buttons('challenge-result').length, 1, 'the good row still works');
  }
  result.push('og-share: registerOutGame removes the row with a problem, reports it on console.error, and the rest keeps working PASS');

  // --- Sharing through navigator.share ---
  {
    const r = await inField();
    endRun(r, { stage: 5, bestCombo: 20 });
    assert.deepEqual([...buttonTexts(r)], ['もう一度', 'シェアする', '戻る'], 'the share row sits between 再挑戦 and 戻る');
    const shared = recorder(r);
    r.button('シェアする');
    await settle();
    assert.equal(shared.length, 1, 'navigator.share is called once');
    assert(shared[0].text.includes('ステージ 5') && shared[0].text.includes('コンボ 20'), shared[0].text);
    assert.equal(shared[0].url, raw.links.game);
    assert.equal(shared[0].title, raw.share.title);
    assert(!/undefined|\{|アニメ|チート/.test(shared[0].text), 'no empty {var} or empty line: ' + shared[0].text);
    assert.equal(r.g.modal, 'challenge-result', 'a finished share leaves the result open');

    r.button('もう一度');
    r.button('はじめる');
    r.shooterRuns.at(-1).cfg.onEnd({ stage: 2, bestCombo: 3, score: 1, cheated: false });
    r.tick(300);
    r.button('シェアする');
    await settle();
    assert(shared.at(-1).text.includes('ステージ 2') && shared.at(-1).text.includes('コンボ 3'), 'this run, not the best: ' + shared.at(-1).text);
    assert.equal(r.g.state.challenge.best.stage, 5, 'the best stays higher than the shared run');
  }
  result.push('og-share: navigator.share gets this run (lower than the best), the game URL and no empty {var} PASS');

  {
    const r = await inField();
    endRun(r, { stage: 3, bestCombo: 4 });
    const body = copyText(r);
    recorder(r, () => Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' })));
    r.button('シェアする');
    await settle();
    assert.equal(r.g.modal, 'challenge-result', 'AbortError shows nothing');

    recorder(r, () => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })));
    r.button('シェアする');
    await settle();
    assert.equal(r.g.modal, 'share', 'another error opens the window');
    assert.deepEqual([...buttonTexts(r)], ['Xで投稿', 'リンクをコピー', '戻る']);
    assert(!/https?:|github|x\.com/.test(copyText(r) + r.els.get('modal-title').textContent + buttonTexts(r).join()), 'no URL on screen');
    r.button('戻る');
    assert.equal(r.g.modal, 'challenge-result');
    assert.equal(copyText(r), body, 'back shows the same result text');

    recorder(r, () => { throw new Error('sync'); });
    r.button('シェアする');
    await settle();
    assert.equal(r.g.modal, 'share', 'a share() that throws opens the window');
    r.button('戻る');

    standIn(r, {});
    r.button('シェアする');
    assert.equal(r.g.modal, 'share', 'no navigator.share opens the window');

    const opened = [], tab = { opener: {} };
    r.win.open = (...args) => { opened.push(args); return tab; };
    r.button('Xで投稿');
    assert.equal(opened.length, 1);
    assert(opened[0][0].startsWith('https://x.com/intent/post?'), opened[0][0]);
    assert.equal(opened[0].length, 2, 'no window features: noopener would make it return null');
    assert.equal(opened[0][1], '_blank');
    assert.equal(tab.opener, null, 'opener is cut after opening');
    const sent = new URLSearchParams(opened[0][0].split('?')[1]);
    assert(sent.get('text').includes('ステージ 3'), sent.get('text'));
    assert.equal(sent.get('url'), raw.links.game);
    assert.equal(sent.get('hashtags'), raw.share.hashtag);
    r.button('戻る');
    assert.equal(r.g.modal, 'challenge-result');
    assert.equal(copyText(r), body, 'back after posting shows the same result text');
  }
  result.push('og-share: AbortError shows nothing; other failures and no navigator.share open the X and copy window; X opens intent/post; back keeps the result PASS');

  // Pressed repeatedly: the second press while one is running is ignored, and no window opens behind it.
  {
    const r = await inField();
    endRun(r, { stage: 3, bestCombo: 4 });
    const pending = [];
    const shared = recorder(r, () => new Promise((resolve, reject) => pending.push({ resolve, reject })));
    r.button('シェアする');
    r.button('シェアする');
    r.button('シェアする');
    assert.equal(shared.length, 1, 'three presses, one share');
    assert.equal(r.g.modal, 'challenge-result', 'no window while the sheet is open');
    pending[0].resolve();
    await settle();
    r.button('シェアする');
    assert.equal(shared.length, 2, 'the row works again once the sheet is done');
    pending[1].reject(Object.assign(new Error('closed'), { name: 'AbortError' }));
    await settle();
    r.button('シェアする');
    assert.equal(shared.length, 3, 'and after the player closes the sheet');
    r.button('もどる');
    assert.equal(r.g.modal, '', 'the player moved on');
    pending[2].reject(Object.assign(new Error('late'), { name: 'NotAllowedError' }));
    await settle();
    assert.equal(r.g.modal, '', 'a late failure does not open a window over what came next');
  }
  result.push('og-share: repeated presses share once, the row comes back when the sheet is done, and a late failure opens nothing PASS');

  // A run with cheats says so in the text.
  for (const [mode, tag] of [['adult', 'チート付き'], ['kids', 'チートつき']]) {
    const r = await inField({}, mode);
    r.g.debugStartChallenge(1);
    r.button('はじめる');
    r.shooterRuns.at(-1).cfg.onEnd({ stage: 7, bestCombo: 9, score: 1, cheated: true });
    r.tick(300);
    const shared = recorder(r);
    r.button('シェアする');
    await settle();
    assert(shared[0].text.includes(tag), mode + ' text says ' + tag + ': ' + shared[0].text);
    assert(shared[0].text.includes('ステージ 7'), shared[0].text);
    assert.equal(r.g.state.challenge.bestCheat.stage, 7, 'it was stored as a cheat run');
  }
  result.push('og-share: a run with cheats says チート付き (チートつき for kids) in the shared text PASS');

  // window.open returning null: one way out in the same tab.
  {
    const r = await inField();
    endRun(r, { stage: 3, bestCombo: 4 });
    standIn(r, {});
    r.win.location = {};
    r.win.open = () => null;
    r.button('シェアする');
    r.button('Xで投稿');
    assert.equal(r.g.modal, 'open-blocked', 'a null window asks');
    assert.deepEqual([...buttonTexts(r)], ['この画面で開く', '戻る'], 'one way out, plus back');
    assert(!/https?:|github|x\.com/.test(copyText(r) + buttonTexts(r).join()), 'no URL on screen: ' + copyText(r));
    assert.equal(r.win.location.href, undefined, 'nothing moves until the player presses');
    r.button('戻る');
    assert.equal(r.g.modal, 'share', 'back returns to the share window');
    r.win.open = () => { throw new Error('blocked'); };
    r.button('Xで投稿');
    assert.equal(r.g.modal, 'open-blocked', 'a window.open that throws asks too');
    r.button('この画面で開く');
    assert(r.win.location.href.startsWith('https://x.com/intent/post?'), r.win.location.href);
  }
  result.push('og-share: a null window.open offers この画面で開く, which opens X in the same tab; back returns to the window PASS');

  // The result of a copy is told in a toast, and the address never shows.
  {
    const r = await inField();
    endRun(r, { stage: 3, bestCombo: 4 });
    const copied = [];
    standIn(r, { clipboard: { writeText: text => { copied.push(text); return Promise.resolve(); } } });
    r.button('シェアする');
    r.button('リンクをコピー');
    await settle();
    assert.equal(copied[0], raw.links.game, 'the game URL is copied');
    assert.equal(r.els.get('toast').textContent, 'リンクをコピーした。');
    standIn(r, { clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    r.button('リンクをコピー');
    await settle();
    assert.equal(r.els.get('toast').textContent, 'コピーできなかった。');
    r.tick(3000);
    standIn(r, {});
    r.button('リンクをコピー');
    assert.equal(r.els.get('toast').textContent, 'コピーできなかった。', 'no clipboard says so too');
  }
  result.push('og-share: copying tells its result in a toast, including when the clipboard refuses or is missing PASS');

  // --- The chapter card ---
  for (const [mode, says, moved] of [['adult', '第1章', '第2章'], ['kids', '1しょう', '2しょう']]) {
    const r = await inField({}, mode);
    chapterCard(r);
    assert.equal(r.g.chapter, 2, 'the game has already moved on');
    assert.equal(row(r).length, 1, 'one row on the chapter card');
    assert.equal(row(r)[0].textContent, 'シェアする');
    assert.equal(r.active(), r.els.get('ending-title'), 'the main button keeps the focus');
    r.key('ArrowDown');
    assert.equal(r.active(), row(r)[0], 'an arrow moves to the row');
    const shared = recorder(r);
    r.tick(300);
    r.key('z');
    await settle();
    assert.equal(shared.length, 1, 'Z on the row presses it');
    assert(shared[0].text.includes(says) && !shared[0].text.includes(moved), mode + ' names the cleared chapter: ' + shared[0].text);
    assert.equal(r.g.screen, 'ending', 'the screen does not change');
    r.key('ArrowUp');
    assert.equal(r.active(), r.els.get('ending-title'), 'an arrow moves back');
    r.key('z');
    assert.equal(r.g.screen, 'field', 'Z on the main button goes on, as before');
  }
  {
    const r = await inField();
    chapterCard(r);
    r.key('z');
    assert.equal(r.g.screen, 'field', 'Z right away still goes on: the row does not get in the way');
    assert.equal(r.g.modal, '');

    const back = await inField();
    chapterCard(back);
    standIn(back, {});
    back.tick(300);
    row(back)[0].click();
    assert.equal(back.g.modal, 'share', 'the window opens over the card');
    back.button('戻る');
    assert.equal(back.g.modal, '');
    assert.equal(back.g.screen, 'ending', 'back returns to the card');
    back.click('ending-title');
    assert.equal(back.g.screen, 'field');

    const town = await inField();
    chapterCard(town);
    town.click('ending-title');
    town.g.debugEvent([{ finale: { towns: [{ heading: 'A', copy: 'x' }] } }]);
    assert.equal(town.g.screen, 'ending');
    assert.equal(row(town).length, 0, 'no row on a town card, and the chapter card row is gone');
    const focused = town.active();
    town.key('ArrowDown');
    assert.equal(town.active(), focused, 'arrows do nothing on a town card');
    town.key('z');
    assert.notEqual(town.g.screen, 'ending', 'Z goes on from a town card');
  }
  result.push('og-share: the chapter card names the cleared chapter; arrows reach the row, Z presses it and stays, Z on the main button goes on; town cards have no row PASS');

  // --- Where rows do not show ---
  {
    const r = await inField({ sdk: true });
    const restore = OG(r)._sim.setLinks({ anime: STAND_IN_ANIME });
    for (const slot of Object.keys(OG(r)._sim.SLOTS)) assert.equal(OG(r).buttons(slot).length, 0, 'nothing in ' + slot + ' under the SDK');
    chapterCard(r);
    assert.equal(row(r).length, 0, 'no row on the card under the SDK');
    restore();
  }
  result.push('og-share: under the Playables SDK stub no place shows a row, even with an anime URL PASS');

  {
    const r = await runtime({ omitOutGame: true });
    r.tick();
    assert.equal(r.RYW.OutGame, undefined, 'js/outgame.js is not loaded');
    assert.equal(r.g.screen, 'title', 'the title works');
    r.start();
    r.g.debugStartChapter(1);
    r.click('menu-btn');
    assert.equal(r.g.modal, 'menu', 'the menu works');
    r.button('もどる');
    r.g.state.bosses.push('bugking');
    r.g.state.flags.gameMade = true;
    endRun(r, { stage: 1, bestCombo: 1 });
    assert(!buttonTexts(r).includes('シェアする'), 'the result has no share row');
    r.button('もどる');
    chapterCard(r);
    assert.equal(row(r).length, 0, 'the card has no row');
    r.key('ArrowDown');
    r.key('z');
    assert.equal(r.g.screen, 'field', 'the card goes on');
  }
  result.push('og-share: without js/outgame.js the title, the menu, the result and the chapter card all work PASS');

  {
    const r = await runtime({ search: '&from=anime1' });
    r.tick();
    assert.equal(r.g.screen, 'title', '?from=anime1 changes nothing');
  }
  result.push('og-share: a link with ?from=anime1 boots as usual PASS');

  // --- {var} rules, and the anime line appearing with its URL ---
  {
    const r = await inField();
    const sim = OG(r)._sim;
    assert.equal(sim.fill('a{x}', { x: '' }), null);
    assert.equal(sim.fill('a{x}', {}), null);
    assert.equal(sim.fill('a{x}', { x: 0 }), 'a0', 'zero is a value');
    const record = { stage: 1, bestCombo: 2 };
    assert(!sim.shareText('challenge-result', { record }).includes('アニメ'), 'no anime line while the URL is empty');
    const restore = sim.setLinks({ anime: STAND_IN_ANIME });
    assert(sim.shareText('challenge-result', { record }).includes('アニメ第1話 ' + STAND_IN_ANIME), 'the line appears with the URL');
    restore();
    assert.equal(sim.table().links.anime, '', 'restored');
    assert.throws(() => sim.setLinks({ anime: 'javascript:alert(1)' }), /not https/);
  }
  result.push('og-share: a line with an empty {var} disappears, and the anime line appears only with its URL PASS');

  // --- What the later 課題 will use: open rows, views, cards. A table written for this test. ---
  {
    const r = await inField();
    const t = clone(raw);
    t.links.anime = STAND_IN_ANIME;
    // og-anime-cta already ships a real row with id 'anime' (in: ['title']); this one tests the same
    // `do:'open'` mechanics for a place that row does not reach yet, so it needs its own id.
    t.items.push(
      { id: 'anime-test', do: 'open', link: 'anime', label: ['アニメを見る', 'アニメを みる'], in: ['challenge-result'] },
      { id: 'about', do: 'view', view: 'about', label: ['このゲームについて', 'このゲームについて'], in: ['challenge-result'] });
    // og-achievement: merged, not replaced, so a real view a later 課題 ships (records) survives this
    // test's own sandbox table alongside the 'about' view made up for this test.
    t.views = { ...t.views, about: { title: ['このゲームについて', 'このゲームについて'], body: 'credits', slot: 'chapter-card' } };
    t.credits = { eyebrow: 'THE END', heading: ['ありがとう', 'ありがとう'], lines: [
      { text: ['作った', 'つくった'] }, { text: ['音楽', 'おんがく'], when: { music: true } }, { text: ['アニメ', 'あにめ'], when: { link: 'anime' } }] };
    assert.equal(validate(t).length, 0, JSON.stringify(validate(t)));
    r.RYW.registerOutGame(t);
    endRun(r, { stage: 1, bestCombo: 1 });
    r.win.location = {};
    r.win.open = () => null;
    r.button('アニメを見る');
    assert.equal(r.g.modal, 'open-blocked', 'an open row offers the same way out');
    r.button('この画面で開く');
    assert.equal(r.win.location.href, STAND_IN_ANIME);
    endRun(r, { stage: 1, bestCombo: 1 });
    r.button('このゲームについて');
    assert.equal(r.g.modal, 'og-about');
    assert.equal(copyText(r), '作った\n\nアニメ', 'lines obey when');
    r.button('戻る');
    assert.equal(r.g.modal, 'challenge-result', 'back returns where it came from');
    const [card] = OG(r).cards('credits');
    assert.equal(card.heading, 'ありがとう');
    assert.equal(card.slot, 'credit-card');
    assert.equal(OG(r).cards('nope').length, 0);
    assert.equal(OG(r).onSaved(null, {}), undefined, 'onSaved has nothing to say yet');
  }
  result.push('og-share: open rows, view rows and credit cards work from a table written for this test PASS');

  // --- The address never shows, wherever the rows are ---
  {
    const r = await inField();
    const visible = () => [...r.els.values()].flatMap(el => [el, ...el.children]).map(el => el.textContent || '').join('\n');
    const clean = where => assert(!/ryoseiimai/i.test(visible()), 'the address shows in ' + where);
    standIn(r, {});
    r.win.location = {};
    r.win.open = () => null;
    const restore = OG(r)._sim.setLinks({ anime: STAND_IN_ANIME });
    chapterCard(r);
    clean('the chapter card');
    r.click('ending-title');
    endRun(r, { stage: 1, bestCombo: 1 });
    clean('the result');
    r.button('シェアする');
    clean('the share window');
    r.button('Xで投稿');
    clean('the blocked window');
    restore();
  }
  result.push('og-share: the address shows in no place and no window PASS');

  // --- Places, hosts and smoke scenes all come from SLOTS ---
  {
    const SLOTS = OG(base)._sim.SLOTS;
    const names = base.g.smokeScenes.map(s => s.name);
    for (const slot of Object.keys(SLOTS)) {
      assert(names.includes('og-' + slot), 'a smoke scene for ' + slot);
      assert(new RegExp(`(?:mount|buttons)\\('${slot}'`).test(html), 'the engine calls ' + slot);
      if (SLOTS[slot].host) assert(html.includes(`id="${SLOTS[slot].host}"`), 'the host is in the HTML: ' + SLOTS[slot].host);
    }
    assert(names.includes('og-window-share') && names.includes('og-window-blocked'), 'smoke scenes for the two windows');
    assert(names.indexOf('og-window-share') > names.indexOf('full-run'), 'the scenes run after full-run');
    const openers = html.match(/openers:\{\n([\s\S]*?)\n\}\}/);
    assert(openers, 'the port has openers');
    const keys = [...openers[1].matchAll(/^ '([\w-]+)':/gm)].map(m => m[1]).sort();
    assert.equal(keys.join(), Object.keys(SLOTS).sort().join(), 'one opener per place');
  }
  result.push('og-share: every place has its host, an engine call, an opener and a smoke scene PASS');

  // --- Source searches ---
  const read = f => fs.readFileSync(f, 'utf8');
  const allSources = [path.join(root, 'index.html'),
    ...fs.readdirSync(path.join(root, 'js')).map(f => path.join(root, 'js', f)),
    ...fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'data', f))];
  const interpreter = path.join(root, 'js', 'outgame.js');
  const OPENS = [/window\.open\b/, /\.open\(\s*['"`]?https?:/, /navigator\??\.share/, /intent\/post/, /\bx\.com\b/, /clipboard/, /location\.href\s*=[^=]/, /location\.(?:assign|replace)\s*\(/, /<a\s[^>]*href/];
  for (const file of allSources.filter(f => f !== interpreter)) {
    for (const pattern of OPENS) assert(!pattern.test(read(file)), `${path.relative(root, file)} must not contain ${pattern}: js/outgame.js is the only way out`);
  }
  for (const file of [interpreter, path.join(root, 'data', 'outgame.js')]) {
    for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /URLSearchParams/, /location\.search/]) {
      assert(!pattern.test(read(file)), `${path.relative(root, file)} must not contain ${pattern}`);
    }
  }
  const interpreterText = read(interpreter);
  assert(/window\.open\(url, '_blank'\)/.test(interpreterText) && !/noopener/i.test(interpreterText.replace(/^.*\/\/.*$/gm, '')), 'window.open has no noopener');
  for (const file of allSources) {
    assert(!/example\.test/.test(read(file)), `${path.relative(root, file)} must not hold a made-up URL`);
    assert(!/[?&]anime=/.test(read(file)), `${path.relative(root, file)} must not read the anime URL from the address`);
  }
  assert(!/mirror|flip|transpose/i.test(read(path.join(repoRoot, 'tools', 'make_outgame_art.py'))), 'the art script never mirrors');
  result.push('og-share: window.open, navigator.share, the X address and the clipboard appear only in js/outgame.js; no new network call; no made-up URL PASS');

  // --- OGP and the table agree ---
  const ogUrl = html.match(/<meta property="og:url" content="([^"]*)">/)[1];
  assert.equal(ogUrl, raw.links.game, 'og:url and links.game match');
  const ogImage = html.match(/<meta property="og:image" content="([^"]*)">/)[1];
  assert(ogImage.startsWith(raw.links.game), 'og:image sits under links.game: ' + ogImage);
  assert(fs.existsSync(path.join(root, ogImage.slice(raw.links.game.length))), 'og:image exists: ' + ogImage);
  result.push('og-share: og:url matches links.game, and og:image is a file under it PASS');

  // --- The Playables bundle. The gate only runs test_v5.cjs, so this runs the bundle's own checks. ---
  execFileSync('node', [path.join(repoRoot, 'tools', 'test_playables_v5.cjs')], { cwd: repoRoot });
  const bundle = path.join(repoRoot, 'dist', 'playables_v5');
  assert(!fs.existsSync(path.join(bundle, 'js', 'outgame.js')) && !fs.existsSync(path.join(bundle, 'data', 'outgame.js')), 'the OutGame files stay out of the bundle');
  result.push('og-share: tools/test_playables_v5.cjs passes: no OutGame file, x.com, clipboard, github.io or intent/post in the bundle PASS');

  // --- tools/outgame_copy.cjs lists every sentence ---
  const copy = execFileSync('node', [path.join(repoRoot, 'tools', 'outgame_copy.cjs')], { cwd: repoRoot, encoding: 'utf8' });
  const expected = [...raw.items.map(it => it.label), ...Object.values(raw.ui), ...Object.values(raw.shareTexts).flat()];
  for (const label of expected) for (const text of label) assert(copy.includes(text.replace(/\n/g, ' / ')), 'outgame_copy lists: ' + text);
  assert(copy.includes(html.match(/<meta property="og:description" content="([^"]*)">/)[1]), 'outgame_copy lists the OGP text');
  result.push('og-share: tools/outgame_copy.cjs lists every sentence in the table and the OGP text PASS');
};
