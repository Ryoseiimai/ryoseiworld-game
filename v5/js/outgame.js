// RYW.OutGame: reads the table in data/outgame.js and puts its rows on screen. It keeps no save
// fields of its own. How to add a row, and what must stay out of the table: docs/OUTGAME.md.
// Everything that leaves the game (window.open, navigator.share, the X address, the clipboard)
// lives in this file only; tools/outgame_tests/share.cjs fails when it appears anywhere else.
(() => {
  'use strict';
  const RYW = window.RYW = window.RYW || {};

  // Where a row can sit. Only this table knows DOM ids. A slot with a host is drawn into the DOM by
  // mount(); one without goes into a modal through buttons(). `screen` is the screen that shows the
  // host (onScreen empties it); `wide` is the longest label in full-width characters.
  // og-ending-epilogue adds credit-card, settings; og-achievement adds menu, records here.
  // views.about (js/outgame.js reads it through openView) reuses credit-card for its own rows, so
  // "about" is a view id, not a SLOT. `title` has no `screen`: screen() (index.html) calls
  // mount('title') itself right after onScreen(name), so title() stays untouched (design_a.md 1.3),
  // the same way chapterClear() calls mount('chapter-card') after endingCard().
  const SLOTS = {
    title: { host: 'title-links', max: 2, wide: 7 },
    'chapter-card': { host: 'ending-links', screen: 'ending', max: 1, wide: 16 },
    'challenge-result': { wide: 16 },
    'credit-card': { host: 'ending-links', screen: 'ending', max: 2, wide: 16 },
    settings: {},
  };
  const LINK_IDS = ['game', 'anime'];
  const COUNT_IDS = ['words', 'bondMax', 'stage', 'combo'];
  const COND_HEADS = ['not', 'flag', 'item', 'summon', 'bond', 'boss', 'count', 'link', 'music', 'save'];
  const VARS = ['earned', 'total', 'stage', 'combo', 'chapter', 'cheat', 'animeUrl'];
  const UI_KEYS = ['shareTitle', 'postX', 'copyLink', 'back', 'copied', 'copyFailed', 'blockedTitle', 'blockedBody', 'openHere', 'cheat'];
  const SECTIONS = ['links', 'share', 'ui', 'items', 'shareTexts', 'views', 'credits', 'achievements'];
  const X_INTENT = 'https://x.com/intent/post?';
  const ACHIEVEMENT_WIDE = 16;
  const STAGE_W = 540, STAGE_H = 960, MIN_TEXT_PX = 24;
  // How deep a path goes before it names one removable row; everything else is two deep (items[3], ui.back).
  const ROW_DEPTH = { shareTexts: 3, credits: 3 };

  let T = null, P = null, sharing = false;

  const $ = id => document.getElementById(id);
  const ctx = extra => ({ env: P.env(), adult: P.adult(), save: P.save(), ...extra });
  const pick = (label, c) => (label ? label[c.adult ? 0 : 1] : '');
  const ui = (key, c) => pick(T.ui[key], c);
  const earned = save => (save ? T.achievements.filter(a => P.check(a.when, save)) : []);

  // A {var} with no value blanks the whole line; shareText drops such lines, buttons() such rows.
  function fill(text, values) {
    let empty = false;
    const out = text.replace(/\{(\w+)\}/g, (_, key) => {
      const value = values[key];
      if (value === undefined || value === null || value === '') empty = true;
      return value;
    });
    return empty ? null : out;
  }
  function vars(c) {
    const r = c.record || {};
    return {
      earned: earned(c.save).length, total: T.achievements.length,
      stage: r.stage, combo: r.bestCombo, chapter: c.chapter,
      cheat: r.cheated ? ui('cheat', c) : '', animeUrl: T.links.anime,
    };
  }
  const say = (label, c) => fill(pick(label, c), vars(c));
  // Only what the row carries (this run's record, the cleared chapter) reaches the text: never the
  // best record, never the epilogue input.
  function shareText(slot, c) {
    return (T.shareTexts[slot] || []).map(line => say(line, c)).filter(Boolean).join('\n');
  }
  // The eventCheck branch reads the running game, not `save`, until og-achievement adds its second
  // argument (design_final.md); no row uses it before then.
  function cond(w, c) {
    if (!w) return true;
    if (w.link) return c.env === 'web' && !!T.links[w.link];
    if (w.music) return P.musicRecorded();
    if (w.save) return !!c.save;
    return !!c.save && P.check(w, c.save);
  }

  // No 'noopener': with it window.open returns null even on success (how.md), so opener is cut after opening.
  function openExternal(url, c, back) {
    let w = null;
    try { w = window.open(url, '_blank'); } catch (e) { console.warn('OutGame: window.open failed', e); }
    if (!w) { openBlocked(url, c, back); return; }
    try { w.opener = null; } catch (e) { console.warn('OutGame: could not clear opener', e); }
  }
  function openBlocked(url, c, back) {
    P.modal(ui('blockedTitle', c), ui('blockedBody', c), [
      { text: ui('openHere', c), action: () => { window.location.href = url; } },
      { text: ui('back', c), action: back },
    ], 'open-blocked');
  }
  function intentUrl(data) {
    const params = [['text', data.text], ['url', data.url], ['hashtags', T.share.hashtag]].filter(([, v]) => v);
    return X_INTENT + params.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  }
  function copyLink(url, c) {
    const said = key => () => P.toast(ui(key, c));
    const clip = window.navigator?.clipboard;
    if (!clip?.writeText) { said('copyFailed')(); return; }
    clip.writeText(url).then(said('copied'), said('copyFailed'));
  }
  // The URL goes to X or the clipboard and never onto the screen as text.
  function shareMenu(data, c) {
    P.modal(ui('shareTitle', c), '', [
      { text: ui('postX', c), action: () => openExternal(intentUrl(data), c, () => shareMenu(data, c)) },
      { text: ui('copyLink', c), action: () => copyLink(data.url, c) },
      { text: ui('back', c), action: c.back || P.close },
    ], 'share');
  }
  // A share() that never settles leaves this row idle until reload; no browser is known to do that
  // for a shown sheet, so there is no timeout. Add one here if a device turns up.
  function share(slot, c) {
    if (sharing) return;
    const data = { title: T.share.title, text: shareText(slot, c), url: T.links.game };
    const native = window.navigator?.share;
    if (typeof native !== 'function') { shareMenu(data, c); return; }
    const place = P.place();
    sharing = true;
    let asked;
    try { asked = Promise.resolve(native.call(window.navigator, data)); } catch (e) { asked = Promise.reject(e); }
    asked.then(() => { sharing = false; }, e => {
      sharing = false;
      // The player closing the sheet is not a failure, and a late failure must not cover whatever came next.
      if (e?.name !== 'AbortError' && P.place() === place) shareMenu(data, c);
    });
  }

  const BODY = {
    credits: c => T.credits.lines.filter(l => cond(l.when, c)).map(l => pick(l.text, c)).join('\n\n'),
  };
  function openView(id, from) {
    const v = T.views[id], c = ctx({ back: from.back }), reopen = () => openView(id, from);
    P.modal(pick(v.title, c), BODY[v.body](c),
      [...api.buttons(v.slot, { back: reopen }), { text: ui('back', c), action: from.back || P.close }], 'og-' + id);
  }
  const DO = {
    open: { ok: (it, c) => c.env === 'web' && !!T.links[it.link], run: (it, c) => openExternal(T.links[it.link], c, c.back || P.close) },
    share: { ok: (it, c, slot) => c.env === 'web' && !!T.links.game && !!T.shareTexts[slot]?.length, run: (it, c, slot) => share(slot, c) },
    // Only web: a view is just text and a share row, but it still disappears on Playables like open/share do.
    view: { ok: (it, c) => c.env === 'web', run: (it, c) => openView(it.view, c) },
  };

  // --- validate(): the list of problems in a table. Empty means every row is usable. ---
  const asList = v => (Array.isArray(v) ? v : []);
  const asMap = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const isLabel = l => Array.isArray(l) && l.length === 2 && l.every(s => typeof s === 'string' && s.trim() !== '');
  // A {var} counts as one full-width character. Half-width characters count as half.
  const widthOf = text => Math.max(...text.split('\n').map(line =>
    [...line.replace(/\{\w+\}/g, '８')].reduce((n, ch) => n + (ch.codePointAt(0) < 0x100 ? 0.5 : 1), 0)));

  function validate(t) {
    const out = [], add = (path, message) => out.push({ path, message });
    if (!t || typeof t !== 'object' || Array.isArray(t)) { add([], 'the table is not an object'); return out; }

    const checkLabel = (path, label) => {
      if (!isLabel(label)) { add(path, 'a label needs both the adult and the kids text'); return; }
      for (const text of label) for (const [, name] of text.matchAll(/\{(\w+)\}/g)) if (!VARS.includes(name)) add(path, 'unknown {' + name + '}');
    };
    const checkWide = (path, label, wide) => {
      if (!isLabel(label) || !wide) return;
      for (const text of label) if (widthOf(text) > wide) add(path, `"${text}" is wider than ${wide} full-width characters`);
    };
    const checkCond = (path, w, banned = []) => {
      if (typeof w === 'string') return;
      if (!w || typeof w !== 'object' || !COND_HEADS.some(k => k in w)) { add(path, 'unknown condition: ' + JSON.stringify(w)); return; }
      for (const key of banned) if (key in w) add(path, `an achievement cannot use {${key}}: it can turn false again`);
      if ('not' in w) checkCond(path, w.not, banned);
      if ('count' in w && !COUNT_IDS.includes(w.count)) add(path, 'unknown count: ' + w.count);
      if ('count' in w && typeof w.atLeast !== 'number') add(path, '{count} needs a number in atLeast');
      if ('link' in w && !LINK_IDS.includes(w.link)) add(path, 'unknown link: ' + w.link);
    };

    for (const key of Object.keys(t)) if (!SECTIONS.includes(key)) add([key], 'unknown section');

    const links = asMap(t.links);
    for (const id of LINK_IDS) if (typeof links[id] !== 'string') add(['links', id], 'missing (an empty string means "not there yet")');
    for (const [id, url] of Object.entries(links)) {
      if (!LINK_IDS.includes(id)) add(['links', id], 'unknown link');
      else if (typeof url === 'string' && url && !url.startsWith('https://')) add(['links', id], 'must start with https://: ' + url);
    }

    const shareInfo = asMap(t.share);
    if (typeof shareInfo.title !== 'string' || !shareInfo.title) add(['share', 'title'], 'missing');
    if (typeof shareInfo.hashtag !== 'string' || !/^[^\s#]+$/.test(shareInfo.hashtag)) add(['share', 'hashtag'], 'needs one word with no #');

    const uiText = asMap(t.ui);
    for (const key of UI_KEYS) checkLabel(['ui', key], uiText[key]);
    for (const key of Object.keys(uiText)) if (!UI_KEYS.includes(key)) add(['ui', key], 'unknown text');

    const views = asMap(t.views), texts = asMap(t.shareTexts), inSlot = {}, ids = new Set();
    asList(t.items).forEach((it, i) => {
      const path = ['items', i], row = asMap(it);
      if (typeof row.id !== 'string' || !row.id) add(path, 'needs an id');
      else if (ids.has(row.id)) add(path, 'duplicate id: ' + row.id);
      else ids.add(row.id);
      if (!Object.hasOwn(DO, row.do)) add(path, 'unknown do: ' + row.do);
      if (row.do === 'open' && !LINK_IDS.includes(row.link)) add(path, 'unknown link: ' + row.link);
      if (row.do === 'view' && !Object.hasOwn(views, row.view)) add(path, 'unknown view: ' + row.view);
      if (!Array.isArray(row.in) || !row.in.length) add(path, 'needs at least one place in `in`');
      checkLabel(path, row.label);
      if ('when' in row) checkCond(path, row.when);
      for (const slot of asList(row.in)) {
        if (!Object.hasOwn(SLOTS, slot)) { add(path, 'unknown place: ' + slot); continue; }
        checkWide(path, row.label, SLOTS[slot].wide);
        inSlot[slot] = (inSlot[slot] || 0) + 1;
        if (SLOTS[slot].max && inSlot[slot] > SLOTS[slot].max) add(path, `${slot} holds at most ${SLOTS[slot].max}`);
        if (row.do === 'share' && !asList(texts[slot]).length) add(path, 'no shareTexts line for ' + slot);
      }
    });

    for (const [slot, lines] of Object.entries(texts)) {
      if (!Object.hasOwn(SLOTS, slot)) add(['shareTexts', slot], 'unknown place');
      if (!Array.isArray(lines)) { add(['shareTexts', slot], 'needs a list of lines'); continue; }
      lines.forEach((line, i) => checkLabel(['shareTexts', slot, i], line));
    }
    for (const [id, v] of Object.entries(views)) {
      const view = asMap(v);
      checkLabel(['views', id], view.title);
      if (!Object.hasOwn(BODY, view.body)) add(['views', id], 'unknown body: ' + view.body);
      if (!Object.hasOwn(SLOTS, view.slot)) add(['views', id], 'unknown place: ' + view.slot);
    }
    if (t.credits !== undefined) {
      const credits = asMap(t.credits);
      if (typeof credits.eyebrow !== 'string') add(['credits', 'eyebrow'], 'missing');
      checkLabel(['credits', 'heading'], credits.heading);
      asList(credits.lines).forEach((line, i) => {
        checkLabel(['credits', 'lines', i], asMap(line).text);
        if (line && 'when' in line) checkCond(['credits', 'lines', i], line.when);
      });
    }
    const achievementIds = new Set();
    asList(t.achievements).forEach((a, i) => {
      const path = ['achievements', i], row = asMap(a);
      if (typeof row.id !== 'string' || !row.id) add(path, 'needs an id');
      else if (achievementIds.has(row.id)) add(path, 'duplicate id: ' + row.id);
      else achievementIds.add(row.id);
      checkLabel(path, row.name);
      checkWide(path, row.name, ACHIEVEMENT_WIDE);
      if (!('when' in row)) add(path, 'needs a when');
      else checkCond(path, row.when, ['not', 'item']);
    });

    // The address carries a real account name, so it may only be written in `links`.
    (function walk(value, path) {
      if (typeof value === 'string') { if (/ryoseiimai/i.test(value)) add(path, 'the address may only be written in links'); return; }
      if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) walk(v, [...path, Array.isArray(value) ? Number(key) : key]);
    })(Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'links')), []);
    return out;
  }

  // The rest of the rows keep working when one is wrong; console.error makes the smoke test fail.
  function withoutProblems(table, problems) {
    const empty = { links: {}, share: {}, ui: {}, items: [], shareTexts: {}, views: {}, achievements: [] };
    if (problems.some(p => !p.path.length)) return empty;
    const copy = JSON.parse(JSON.stringify(table)), gone = {};
    for (const { path } of problems) {
      const row = path.slice(0, ROW_DEPTH[path[0]] || 2);
      const parent = row.slice(0, -1).reduce((node, key) => (node === gone ? node : node?.[key]), copy);
      if (parent && parent !== gone && row.length) parent[row.at(-1)] = gone;
    }
    const sweep = v => {
      if (Array.isArray(v)) return v.filter(x => x !== gone).map(sweep);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== gone).map(([k, x]) => [k, sweep(x)]));
      return v;
    };
    return { ...empty, ...sweep(copy) };
  }

  // --- Smoke scenes, derived from SLOTS so a new place gets its three-screen check with it. ---
  // `scroller` is the long window's panel: its buttons may sit below the fold, so it scrolls to each one.
  // Nothing else scrolls here, since scrollIntoView would also move the stage and hide a button off it.
  function checkScene(name, targets, others, scroller) {
    const fail = message => { throw new Error(`${name}: ${message}`); };
    if (!targets.length) fail('nothing to check');
    const stage = $('stage'), st = stage.getBoundingClientRect(), scale = st.width / STAGE_W;
    const box = el => {
      const r = el.getBoundingClientRect();
      return { x0: (r.left - st.left) / scale, y0: (r.top - st.top) / scale, x1: (r.right - st.left) / scale, y1: (r.bottom - st.top) / scale };
    };
    const seen = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const hit = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
    targets.forEach((el, i) => {
      if (scroller) {
        const r = el.getBoundingClientRect(), p = scroller.getBoundingClientRect();
        scroller.scrollTop += (Math.max(r.bottom - p.bottom, 0) + Math.min(r.top - p.top, 0)) / scale;
      }
      const q = box(el), label = JSON.stringify(el.textContent);
      if (q.x0 < -1 || q.y0 < -1 || q.x1 > STAGE_W + 1 || q.y1 > STAGE_H + 1) fail(`${label} leaves the stage`);
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) fail(`${label} overflows its button`);
      for (const other of others) {
        const o = box(other);
        if (seen(other) && (o.x0 < -1 || o.y0 < -1 || o.x1 > STAGE_W + 1 || o.y1 > STAGE_H + 1)) fail(`${other.id || 'an element'} leaves the stage`);
      }
      for (const other of [...others, ...targets.slice(i + 1)]) {
        if (seen(other) && hit(q, box(other))) fail(`${label} overlaps ${other.id || JSON.stringify(other.textContent)}`);
      }
    });
    for (const el of [...targets, ...others]) {
      if (seen(el) && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < MIN_TEXT_PX) fail(`${JSON.stringify(el.textContent)} is under ${MIN_TEXT_PX}px`);
    }
    if (/ryoseiimai/i.test(stage.textContent)) fail('the address shows on screen');
  }
  const checkHost = (name, host) => checkScene(name, [...host.children], [...host.parentNode.children].filter(el => el !== host));
  const checkModal = name => checkScene(name, [...$('modal-buttons').children], [$('modal-title'), $('modal-copy')], $('modal').firstElementChild);
  // The game's own address stands in for the anime one, so no made-up URL ships in the game.
  async function withBothLinks(run) {
    const restore = setLinks({ anime: T.links.game });
    try { await run(); } finally { restore(); }
  }
  function setLinks(links) {
    for (const url of Object.values(links)) if (url && !url.startsWith('https://')) throw new Error('not https: ' + url);
    const before = T.links;
    T.links = { ...before, ...links };
    return () => { T.links = before; };
  }
  function smokeScenes() {
    const sample = () => ({ title: T.share.title, text: shareText('challenge-result', ctx({ record: { stage: 1, bestCombo: 1 } })), url: T.links.game });
    const slots = Object.keys(SLOTS).map(slot => ({
      name: 'og-' + slot,
      run: () => withBothLinks(async () => {
        const name = 'og-' + slot;
        if (!P.openers?.[slot]) throw new Error(name + ': the engine has no opener for this place');
        await P.openers[slot]();
        if (SLOTS[slot].host) checkHost(name, $(SLOTS[slot].host)); else checkModal(name);
        const labels = api.buttons(slot).map(b => b.text), shown = [...(SLOTS[slot].host ? $(SLOTS[slot].host) : $('modal-buttons')).children].map(el => el.textContent);
        for (const label of labels) if (!shown.includes(label)) throw new Error(`${name}: ${label} is not on screen`);
      }),
    }));
    const windows = [
      { name: 'og-window-share', run: () => withBothLinks(() => { shareMenu(sample(), ctx()); checkModal('og-window-share'); }) },
      { name: 'og-window-blocked', run: () => withBothLinks(() => { openBlocked(T.links.game, ctx(), P.close); checkModal('og-window-blocked'); }) },
    ];
    return [...slots, ...windows];
  }

  const api = {
    connect(port) {
      P = port;
      if (T && Array.isArray(window.__v5?.smokeScenes)) window.__v5.smokeScenes.push(...smokeScenes());
    },
    onScreen(name) {
      if (!T || !P) return;
      for (const slot of Object.values(SLOTS)) if (slot.screen === name) $(slot.host).replaceChildren();
    },
    buttons(slot, extra) {
      if (!T || !P || !SLOTS[slot]) return [];
      const c = ctx(extra);
      return T.items
        .filter(it => it.in.includes(slot) && DO[it.do].ok(it, c, slot) && cond(it.when, c))
        .map(it => ({ text: say(it.label, c), action: () => DO[it.do].run(it, c, slot) }))
        .filter(b => b.text);
    },
    mount(slot, extra) {
      const host = SLOTS[slot]?.host;
      if (!T || !P || !host) return;
      $(host).replaceChildren();
      for (const b of api.buttons(slot, extra).slice(0, SLOTS[slot].max)) {
        const el = document.createElement('button');
        el.textContent = b.text;
        el.onclick = () => P.press(b.action);
        $(host).appendChild(el);
      }
    },
    cards(id) {
      if (!T || !P || id !== 'credits' || !T.credits) return [];
      const c = ctx();
      return [{ eyebrow: T.credits.eyebrow, heading: pick(T.credits.heading, c), copy: BODY.credits(c), slot: 'credit-card' }];
    },
    // og-achievement fills this in: announce the rows earned(next) has and earned(prev) does not.
    // The table has no achievements yet, so there is nothing to say and the engine does not call it.
    onSaved() {},
    // For the Node tests and the smoke scenes only. Nothing in the game calls these, and no URL argument reaches them.
    _sim: {
      validate, earned, fill, setLinks, SLOTS,
      shareText: (slot, extra) => shareText(slot, ctx(extra)),
      table: () => T,
    },
  };

  RYW.OutGame = api;
  RYW.registerOutGame = table => {
    const problems = validate(table);
    for (const p of problems) console.error(`OutGame table: ${p.path.join('.')}: ${p.message}`);
    T = withoutProblems(table, problems);
  };
})();
