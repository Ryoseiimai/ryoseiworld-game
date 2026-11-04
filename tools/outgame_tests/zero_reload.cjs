// og-zero-reload (design_a.md「og-ending-epilogue（修理）」, design_final.md 8): a reload made
// right after ゼロ is beaten, before the zeroJoin event finishes (clearChapter's own
// saveGame(false) in v5/index.html:646 runs first), used to lose the ending entirely:
// v5/data/ch4.js had no clearDone, so replayClear() (v5/index.html:344) always bailed on
// `!ch.clearDone`. v5/data/ch4.js now sets clearDone:'zero' (not 'towerEnded': restore()'s own
// loop at v5/index.html:342 sets flags.towerEnded as soon as g.bosses includes 'zero', which is
// true from that same early save, so 'towerEnded' would never be unset at reload time either).
// tools/test_v5.cjs:1547-1549 (R88, same ended-flag save shape) stays unchanged and passing.
const settle = () => new Promise(setImmediate);

module.exports = async function zeroReload({ runtime, result, assert }) {
  const r = await runtime();
  r.tick(); r.start(); r.tick(1000); r.g.debugWin(); r.tick(2100); r.dialogue();
  assert(r.g.debugStartChapter(4), 'chapter 4 starts');
  const D = r.g.GAME_DATA, st = r.g.state;
  const gate2 = D.maps.tower_roof.objects.find(o => o.id === 'twr_gate2');
  assert(gate2, 'the second rooftop gate (ゼロ) exists');

  // Beat ジブン first (the ゼロ gate is locked behind it), then open the ゼロ fight.
  st.bosses.push('jibun');
  r.g.debugWarp('tower_roof', gate2.x, gate2.y + 1.3); r.g.debugFace(3); r.tick(16);
  r.click('talk-btn'); assert(r.g.dialogue, 'talking to the ゼロ gate opens dialogue');
  for (let i = 0; i < 60 && r.g.screen === 'field'; i++) { if (r.g.dialogue) r.dialogue(); r.tick(200); if (r.g.modal === 'cheats') r.button('はじめる'); }
  assert.equal(r.g.screen, 'shooter', 'the ゼロ fight starts');
  const run = r.shooterRuns[r.shooterRuns.length - 1].cfg;
  assert.equal(run.boss, 'zero');
  run.onWin({ boss: 'zero', seconds: 150, hearts: 3, maxHearts: 3, hurts: 0 });

  // bossWon() -> clearChapter() runs synchronously and saves right away, before the 2000ms
  // later() that plays zeroClear and then runs the zeroJoin event (v5/index.html:646).
  await settle();
  const early = JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));
  assert(early.bosses.includes('zero'), 'the early save already counts ゼロ as beaten');
  assert(!early.flags.zero, 'the early save has not run the join event yet');
  assert(!early.summons.includes('zero'), 'ゼロ is not a summon yet in the early save');
  assert(!early.flags.towerEnded, 'towerEnded is not set yet in the early save');

  // Reload from that exact save (as if the tab closed right there): the field shows the
  // rooftop briefly, then the town cards, then the epilogue, and finally the title. (THE END
  // card is a later 課題, og-ending-epilogue（クレジット）; it is not in this flow yet.)
  const back = await runtime({ saved: new Map([['ryoseiworld-rpg-v5', JSON.stringify(early)]]) });
  back.tick(); back.click('continue-btn'); back.tick(700);
  assert.equal(back.g.screen, 'ending', 'reloading right after the win replays the ending: ' + back.g.screen);
  const heads = [];
  for (let i = 0; i < 6 && back.g.screen === 'ending'; i++) { heads.push(back.els.get('ending-heading').textContent); back.click('ending-title'); }
  assert(heads.some(h => h.includes('ヒダマリ')) && heads.some(h => h.includes('ミナモ')) && heads.some(h => h.includes('ネオン')), 'all three town cards play: ' + heads.join(','));
  assert.equal(back.g.screen, 'epilogue', 'the town cards lead into the epilogue: ' + back.g.screen);
  back.els.get('epilogue-input').value = ''; back.click('epilogue-send'); back.tick(2300);
  assert.equal(back.g.screen, 'title', 'the epilogue leads to the title: ' + back.g.screen);
  assert(back.g.summons.includes('zero') && back.g.state.flags.zero && back.g.state.flags.towerEnded, 'the join event finished on reload (summon, flags.zero, towerEnded all set)');

  // Opening the finished save again does not replay the ending a second time.
  const done = await runtime({ saved: new Map(back.saved) });
  done.tick(); done.click('continue-btn'); done.tick(700);
  assert.equal(done.g.screen, 'field', 'a save from after the ending does not replay it again: ' + done.g.screen);

  result.push('og-zero-reload: ch4.js の clearDone:\'zero\' により、ゼロに勝った直後のリロードでも町のカード→THE END→エピローグ→タイトルまで再生され、終わったセーブは再生しない PASS');
};
