#!/usr/bin/env node
// Prints every sentence OutGame can put in front of the public, for seto-publish-judge.
// Reads the table the same way the game does, so a new row shows up here with no change.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const v5 = path.join(__dirname, '..', 'v5');
let table = null;
vm.runInNewContext(fs.readFileSync(path.join(v5, 'data', 'outgame.js'), 'utf8'), { RYW: { registerOutGame: t => { table = t; } } });
if (!table) throw new Error('data/outgame.js did not call registerOutGame');

const out = [];
const heading = text => out.push('', '## ' + text);
const label = (name, [adult, kids]) => out.push(`- ${name}`, `  おとな: ${adult.replace(/\n/g, ' / ')}`, `  こども: ${kids.replace(/\n/g, ' / ')}`);

out.push('# OutGame の公開される文（tools/outgame_copy.cjs の出力）');
heading('シェアの文（{…} が空の行は消える）');
for (const [slot, lines] of Object.entries(table.shareTexts || {})) lines.forEach((line, i) => label(`${slot} の ${i + 1} 行目`, line));
heading('シェアに付くもの');
out.push(`- 題: ${table.share.title}`, `- ハッシュタグ: ${table.share.hashtag}`, `- 共有するURL: ${table.links.game}`, `- アニメのURL: ${table.links.anime || '（空。関係する行とボタンは出ない）'}`);
heading('ボタン');
for (const it of table.items || []) label(`${it.id}（置き場所: ${it.in.join('、')}）`, it.label);
heading('窓とトースト');
for (const [key, text] of Object.entries(table.ui || {})) label(key, text);
if (table.views) {
  heading('窓の題');
  for (const [id, v] of Object.entries(table.views)) label(id, v.title);
}
if (table.credits) {
  heading('クレジット');
  out.push(`- 小さな行: ${table.credits.eyebrow}`);
  label('見出し', table.credits.heading);
  table.credits.lines.forEach((line, i) => label(`${i + 1} 行目`, line.text));
}
if (table.achievements) {
  heading('実績');
  for (const a of table.achievements) label(a.id + (a.secret ? '（達成まで伏せる）' : ''), a.name);
}
heading('リンクを貼ったときに SNS が読む文（<head> の OGP）');
const html = fs.readFileSync(path.join(v5, 'index.html'), 'utf8');
for (const m of html.matchAll(/<meta (?:property|name)="((?:og|twitter):[a-z]+)" content="([^"]*)">/g)) out.push(`- ${m[1]}: ${m[2]}`);

console.log(out.join('\n'));
