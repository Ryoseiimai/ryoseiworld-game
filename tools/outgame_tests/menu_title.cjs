// R403: the OutGame-only 'menu' opener (outgamePort.openers.menu) titled its window 「めにゅー」 in both
// modes, so the adult-mode smoke shot of og-menu showed the kids spelling. It now goes through
// menuLabel: 「メニュー」 for adults, 「めにゅー」 for kids.
module.exports = async function menuTitle({ runtime, result, assert }) {
  for (const [mode, want] of [['adult', 'メニュー'], ['kids', 'めにゅー']]) {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.RYW.setMode(mode);
    r.g.state.mode = mode;
    const scene = r.g.smokeScenes.find(s => s.name === 'og-menu');
    assert(scene, 'the og-menu smoke scene exists');
    // The scene opens the window first, then measures it with getComputedStyle, which only the
    // browser smoke (tools/smoke_v5.cjs) has. Here only the opened window's title is checked.
    try { await scene.run(); } catch (e) { if (!/getComputedStyle/.test(String(e))) throw e; }
    assert.equal(r.g.modal, 'menu', mode + ': the menu window is open');
    assert.equal(r.els.get('modal-title').textContent, want, mode + ': the menu window title');
  }
  result.push('og-menu: おとなモードの見出しは「メニュー」、こどもモードは「めにゅー」 PASS');
};
