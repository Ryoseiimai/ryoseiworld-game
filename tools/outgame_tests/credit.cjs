// og-ending-epilogue (credit): the OutGame table's credits section, the finale's THE END card that
// follows the town cards, and the same text reachable from 設定 > このゲームについて (which reuses
// the credit-card slot, so it is a view, not a SLOT of its own; see js/outgame.js SLOTS).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clone = v => JSON.parse(JSON.stringify(v));
const settle = () => new Promise(setImmediate);
const STAND_IN_ANIME = 'https://anime.invalid/ep1';
const track = (file, extra = {}) => ({ file: 'assets/music/' + file, bpm: 120, loopStart: 2, loopEnd: 18, gain: .8, once: false, ...extra });

module.exports = async function credit({ runtime, result, assert }) {
  const root = path.join(__dirname, '..', '..', 'v5');
  const OG = r => r.RYW.OutGame;
  const row = r => r.els.get('ending-links').children;

  let raw = null;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data', 'outgame.js'), 'utf8'), { RYW: { registerOutGame: t => { raw = clone(t); } } });

  // --- validate(): the shipped credits/about rows are clean, and validate() still catches a broken one ---
  {
    const base = await runtime();
    base.tick();
    const validate = OG(base)._sim.validate;
    assert.equal(validate(raw).length, 0, 'the shipped table has no problems: ' + JSON.stringify(validate(raw)));
    assert(raw.credits && raw.credits.eyebrow === 'THE END', 'the table has a credits section');
    assert.equal(raw.views.about.slot, 'credit-card', 'the about view reuses the credit-card slot, not a SLOT of its own');
    const broken = (name, change, pattern) => {
      const t = clone(raw);
      change(t);
      const problems = validate(t);
      assert(problems.some(p => pattern.test(p.message)), `validate catches ${name}: ${JSON.stringify(problems)}`);
    };
    broken('credits missing its eyebrow', t => { delete t.credits.eyebrow; }, /missing/);
    broken('a credits line missing its kids text', t => { t.credits.lines[0].text = ['x', '']; }, /both the adult and the kids/);
    broken('a credits line with a bad condition', t => { t.credits.lines[0].when = { nope: true }; }, /unknown condition/);
  }
  result.push('og-ending-epilogue(credit): validate() accepts the shipped credits/about rows and catches a broken one PASS');

  // --- The finale: towns -> THE END card (only with `credit`) -> epilogue; an unknown id is skipped ---
  {
    const r = await runtime(); r.tick();
    r.g.debugEvent([{ finale: { towns: [{ heading: 'A', copy: 'x' }] } }]);
    r.click('ending-title');
    assert.equal(r.g.screen, 'epilogue', 'without `credit` the town card goes straight to the epilogue');
  }
  {
    const r = await runtime(); r.tick();
    r.g.debugEvent([{ finale: { credit: 'credits', towns: [{ heading: 'A', copy: 'x' }] } }]);
    r.click('ending-title');
    assert.equal(r.els.get('ending-heading').textContent, 'ありがとう', 'the THE END card follows the town card');
    assert.equal(r.els.get('ending-eyebrow').textContent, 'THE END');
    assert.equal(r.els.get('ending-title').textContent, '次へ');
    assert.equal(row(r).length, 1, 'one row on the credit card');
    assert.equal(row(r)[0].textContent, 'シェアする');
    r.click('ending-title');
    assert.equal(r.g.screen, 'epilogue', 'the credit card goes on to the epilogue, not a new g.screen');
  }
  {
    const r = await runtime(); r.tick();
    r.g.debugEvent([{ finale: { credit: 'nope', towns: [] } }]);
    assert.equal(r.g.screen, 'epilogue', 'an unknown credit id is skipped, not stuck on a blank card');
  }
  result.push('og-ending-epilogue(credit): towns -> THE END card (one row: シェアする) -> epilogue; no card without `credit`; an unknown id is skipped PASS');

  // --- 設定 > このゲームについて shows the same credits text; 戻る returns to 設定, not to the menu ---
  {
    const r = await runtime(); r.tick();
    r.g.debugStartChapter(1);
    r.click('menu-btn');
    r.button('設定');
    assert.equal(r.g.modal, 'settings');
    r.button('このゲームについて');
    assert.equal(r.g.modal, 'og-about');
    assert.equal(r.els.get('modal-title').textContent, 'このゲームについて');
    assert(r.els.get('modal-copy').textContent.startsWith('作った人 RYOSEIWORLD'), r.els.get('modal-copy').textContent);
    r.button('戻る');
    assert.equal(r.g.modal, 'settings', '戻る returns to 設定, not to the field menu it came from');
  }
  result.push('og-ending-epilogue(credit): 設定 > このゲームについて shows the credits text; 戻る returns to 設定 PASS');

  // --- The Lyria line only shows once a recorded track has decoded; the anime line only with links.anime ---
  {
    const ledger = { version: 1, tracks: { town: track('town.mp3') } };
    const durations = { 'assets/music/town.mp3': 20 };
    const r = await runtime({ musicLedger: ledger, musicDurations: durations });
    for (let i = 0; i < 12; i++) await settle();
    r.g.debugStartChapter(1); // off the title screen, so adult() reads g.mode (adult by default) and not the absent save
    assert(r.g.debugMusic().loaded.includes('town'), 'a track decoded before the credits are read');
    const [noAnime] = OG(r).cards('credits');
    assert(noAnime.copy.includes('音楽の一部は Google の Lyria で'), 'the Lyria line shows once a recording exists: ' + noAnime.copy);
    assert(!noAnime.copy.includes('アニメ第1話もあります'), 'no anime line while links.anime is empty: ' + noAnime.copy);

    const restore = OG(r)._sim.setLinks({ anime: STAND_IN_ANIME });
    const [withAnime] = OG(r).cards('credits');
    assert(withAnime.copy.includes('アニメ第1話もあります'), 'the anime line shows with the URL: ' + withAnime.copy);
    restore();
  }
  {
    const r = await runtime({ musicLedger: null });
    for (let i = 0; i < 12; i++) await settle();
    r.g.debugStartChapter(1);
    assert.equal(r.g.debugMusic().loaded.length, 0, 'no recording decoded');
    const [card] = OG(r).cards('credits');
    assert(!card.copy.includes('Lyria'), 'no Lyria line without a recording: ' + card.copy);
    assert(card.copy.startsWith('作った人 RYOSEIWORLD'), card.copy);
  }
  result.push('og-ending-epilogue(credit): the Lyria line needs a decoded recording, and the anime line needs links.anime PASS');
};
