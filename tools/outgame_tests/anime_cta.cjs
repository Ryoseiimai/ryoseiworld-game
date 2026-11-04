// og-anime-cta: the title band (#title-links) that opens the anime. links.anime stays empty until
// the public release is approved (data/outgame.js), so this file sets it through _sim.setLinks and
// re-mounts, the same way a real release commit would make title() draw the row on its own.
const ANIME_URL = 'https://anime.invalid/ep1';

module.exports = async function animeCta({ runtime, result, assert }) {
  const OG = r => r.RYW.OutGame;
  const band = r => r.els.get('title-links').children;

  // --- Empty URL: no row, the game still boots to the title as usual ---
  {
    const r = await runtime();
    r.tick();
    assert.equal(r.g.screen, 'title', 'the title shows with no anime URL');
    assert.equal(band(r).length, 0, 'the band is empty while links.anime is empty');
  }
  result.push('og-anime-cta: the title band is empty while links.anime is empty PASS');

  // --- Setting the URL and re-drawing (title() calls OG()?.mount('title') itself; mount() is called
  // directly here, the way other OutGame places are tested) puts the row on screen, kids label by
  // default (titleAdult() is false with no save) ---
  {
    const r = await runtime();
    r.tick();
    const restore = OG(r)._sim.setLinks({ anime: ANIME_URL });
    OG(r).mount('title');
    const row = band(r);
    assert.equal(row.length, 1, 'one row once the URL is set');
    assert.equal(row[0].textContent, 'アニメを みる', 'kids label (no save means titleAdult() is false)');
    restore();
  }
  result.push('og-anime-cta: the row appears once links.anime is set, with the kids label by default PASS');

  // --- Arrow key reaches the row (title-actions via NAV_EXTRA), Z presses it: window.open once, no
  // noopener (the opener is cut after opening, as in js/outgame.js openExternal) ---
  {
    const r = await runtime();
    r.tick();
    OG(r)._sim.setLinks({ anime: ANIME_URL });
    OG(r).mount('title');
    assert.equal(r.active(), r.els.get('start-btn'), 'start keeps the focus right after mount');
    r.key('ArrowDown');
    const btn = band(r)[0];
    assert.equal(r.active(), btn, 'an arrow reaches the band (continue-btn is disabled and is skipped)');
    const tab = { opener: {} }, opened = [];
    r.win.open = (...args) => { opened.push(args); return tab; };
    r.key('z');
    assert.equal(opened.length, 1, 'Z on the row calls window.open once');
    assert.equal(opened[0][0], ANIME_URL, 'the URL is links.anime');
    assert.equal(opened[0].length, 2, 'no window features: noopener would make window.open return null');
    assert.equal(tab.opener, null, 'the opener is cut after opening');
    assert.equal(r.g.screen, 'title', 'the screen does not change');
    r.key('ArrowUp');
    assert.equal(r.active(), r.els.get('start-btn'), 'an arrow moves back to start');
  }
  result.push('og-anime-cta: an arrow reaches the row, Z calls window.open once and cuts the opener PASS');

  // --- window.open returning null: the same way out as the share window (open-blocked) ---
  {
    const r = await runtime();
    r.tick();
    OG(r)._sim.setLinks({ anime: ANIME_URL });
    OG(r).mount('title');
    r.win.location = {};
    r.win.open = () => null;
    band(r)[0].click();
    assert.equal(r.g.modal, 'open-blocked', 'a null window asks');
    const buttons = r.els.get('modal-buttons').children.map(b => b.textContent);
    assert.deepEqual(buttons, ['この がめんで ひらく', 'もどる'], 'one way out, plus back (kids label by default)');
    assert(!/https?:/.test(r.els.get('modal-copy').textContent + buttons.join()), 'no URL on screen');
    assert.equal(r.win.location.href, undefined, 'nothing moves until the player presses');
    const back = r.els.get('modal-buttons').children.find(b => b.textContent === 'もどる');
    back.onclick();
    assert.equal(r.g.modal, '', 'back closes the modal and returns to the title');
    assert.equal(r.g.screen, 'title');
  }
  result.push('og-anime-cta: window.open returning null offers この画面で開く, which opens the URL in this tab PASS');

  // --- Under the Playables SDK stub, the row never shows even with the URL set ---
  {
    const r = await runtime({ sdk: true });
    r.tick();
    OG(r)._sim.setLinks({ anime: ANIME_URL });
    OG(r).mount('title');
    assert.equal(band(r).length, 0, 'no row under the SDK stub, even with an anime URL');
  }
  result.push('og-anime-cta: the SDK stub shows no row PASS');

  // --- ?from=anime1 changes nothing: the game does not read it ---
  {
    const r = await runtime({ search: '&from=anime1' });
    r.tick();
    assert.equal(r.g.screen, 'title', '?from=anime1 boots as usual');
    assert.equal(band(r).length, 0, 'still no row (the empty anime URL, not the query string, decides this)');
  }
  result.push('og-anime-cta: a link with ?from=anime1 boots as usual PASS');
};
