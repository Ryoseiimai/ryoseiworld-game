// Entry point for the OutGame tests. Reads tools/outgame_tests/*.cjs in name order and calls
// each one with the same {runtime,result,assert,html,root} context test_v5.cjs already has.
// One file per sprint-1 課題 (see linear/game/sprint1/design_final.md 8), so parallel branches
// never write to the same test file.
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function testOutgame(ctx) {
  const dir = path.join(__dirname, 'outgame_tests');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.cjs')).sort();
  for (const file of files) {
    await require(path.join(dir, file))(ctx);
  }
};
