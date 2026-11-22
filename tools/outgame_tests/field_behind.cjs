// R706: the og-settings and og-menu smoke scenes ran right after the credit card, so their shots showed a window
// over an empty night sky (no logo, no town). In play both windows only open from the field menu, so the
// openers go back to the field first and the shots show the town behind the window.
module.exports = async function fieldBehind({ runtime, result, assert }) {
  for (const name of ['og-settings', 'og-menu']) {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    const credit = r.g.smokeScenes.find(s => s.name === 'og-credit-card');
    const scene = r.g.smokeScenes.find(s => s.name === name);
    assert(credit && scene, name + ': the smoke scenes exist');
    // Both scenes measure the window with getComputedStyle, which only the browser smoke has. The credit card's
    // check also reads its host's parentNode, which this runtime does not build; the opener has already run by then,
    // so any throw from that check is dropped and the screen is checked below instead.
    try { await credit.run(); } catch (e) { /* the check after the opener needs the browser */ }
    assert.notEqual(r.g.screen, 'field', name + ': the credit card leaves the field');
    try { await scene.run(); } catch (e) { if (!/getComputedStyle/.test(String(e))) throw e; }
    assert.equal(r.g.screen, 'field', name + ': the window opens over the field');
    assert.equal(r.g.modal, name.slice(3), name + ': the window is open');
  }
  result.push('og-settings・og-menu: 確かめ用の窓はフィールドの上で開く PASS');
};
