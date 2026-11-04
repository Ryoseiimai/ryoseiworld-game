// og-challenge: in the browser build (no ?shop=test, not Playables), choosing チャレンジ from the
// menu used to open the 「デバッグモード」 modal with 「デバッグモードはアプリ版で使えます。」 (アプリ版 only).
// openCheats(next,...) now swaps the title for 「チャレンジ」 and puts recordText(best) ahead of that
// line when it was opened as a door to a challenge run (next is set) and the player neither owns
// debugmode nor is in the test shop. ?shop=test and Playables keep their own modal (test_v5.cjs
// already covers both unchanged), so this file only adds the plain-browser door case.
module.exports = async function challengeDoor({ runtime, result, assert }) {
  const r = await runtime(); // no search params: not ?shop=test, not Playables
  r.tick();
  r.g.debugStartChapter(1);
  r.g.state.bosses.push('bugking');
  r.g.state.flags.gameMade = true;
  r.click('menu-btn');
  r.button('チャレンジ');

  assert.equal(r.g.modal, 'cheats', 'チャレンジ door still opens the cheats-kind modal');
  assert.equal(r.els.get('modal-title').textContent, 'チャレンジ', 'the title reads チャレンジ, not デバッグモード, for the challenge door');
  const copy = r.els.get('modal-copy').textContent;
  assert(copy.includes('最高ステージ'), 'the body leads with the best-record line: ' + copy);
  assert(copy.includes('デバッグモードはアプリ版で使えます。'), 'the アプリ版 line stays after the record line: ' + copy);

  result.push('og-challenge: ?shop=test なし・未所持でチャレンジを選ぶと題が「チャレンジ」、本文の先頭に最高ステージの記録が出る PASS');
};
