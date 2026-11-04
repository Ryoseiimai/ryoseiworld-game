// The OutGame table. To add or remove an OutGame item, look here first (docs/OUTGAME.md).
// Rows are data only; js/outgame.js reads them. Every label is [adult, kids].
const ANIME=['アニメ第1話 {animeUrl}','アニメ だい1わ {animeUrl}'];
// The `?.` is here because the game still runs when js/outgame.js does not load.
RYW.registerOutGame?.({
 // Empty means "not there yet": its rows and share lines stay hidden. The anime URL goes in with its own
 // commit after the public release is approved, never while it is unlisted (the repository is public).
 links:/*links*/{game:'https://ryoseiimai.github.io/ryoseiworld-game/v5/',anime:''}/*end*/,
 share:{title:'RYOSEIWORLD',hashtag:'RYOSEIWORLD'},
 ui:{
  shareTitle:['シェア','シェア'],
  postX:['Xで投稿','Xで とうこう'],
  copyLink:['リンクをコピー','リンクを コピー'],
  back:['戻る','もどる'],
  copied:['リンクをコピーした。','リンクを コピーした。'],
  copyFailed:['コピーできなかった。','コピーできなかった。'],
  blockedTitle:['開けなかった','ひらけなかった'],
  blockedBody:['新しいタブを開けなかった。\nこの画面で開くと、\nゲームから離れる。','あたらしい タブを ひらけなかった。\nこの がめんで ひらくと、\nゲームから はなれる。'],
  openHere:['この画面で開く','この がめんで ひらく'],
  cheat:['チート付き','チートつき']
 },
 items:[
  // og-anime-cta: the anime button appears on the title, the credit card, and "このゲームについて".
  // The row stays hidden while links.anime is empty.
  {id:'anime',do:'open',link:'anime',label:['アニメを見る','アニメを みる'],in:['title','credit-card','about']},
  {id:'share',do:'share',label:['シェアする','シェアする'],in:['chapter-card','challenge-result','credit-card']},
  {id:'about',do:'view',view:'about',label:['このゲームについて','このゲームについて'],in:['settings']}
 ],
 // A line whose {var} is empty disappears: the anime line until links.anime is set, the cheat line on a clean run.
 shareTexts:{
  'chapter-card':[['RYOSEIWORLD の第{chapter}章をクリアした','RYOSEIWORLD の {chapter}しょうを クリアした'],ANIME],
  'challenge-result':[['RYOSEIWORLD のチャレンジでステージ {stage} まで行った（コンボ {combo}）','RYOSEIWORLD の チャレンジで ステージ {stage} まで いった（コンボ {combo}）'],['{cheat}','{cheat}'],ANIME],
  'credit-card':[['RYOSEIWORLD を最後まで遊んだ','RYOSEIWORLD を さいごまで あそんだ'],ANIME]
 },
 // The about view (opened from settings) shows the same card as the finale's THE END card, so it
 // reuses the credit-card slot for its rows instead of a slot of its own (js/outgame.js SLOTS).
 views:{
  about:{title:['このゲームについて','このゲームについて'],body:'credits',slot:'about'}
 },
 // og-ending-epilogue: shown on the finale's THE END card and in the settings "このゲームについて" view.
 // The Lyria line gets an explicit \n before 作りました/つくりました so it never breaks mid-word at
 // 390px width (design_final.md 4節7: the old auto-wrap split 作/りました).
 credits:{eyebrow:'THE END',heading:['ありがとう','ありがとう'],lines:[
  {text:['作った人 RYOSEIWORLD','つくった ひと RYOSEIWORLD']},
  {text:['音楽の一部は Google の Lyria で\n作りました','おんがくの いちぶは Google の Lyria で\nつくりました'],when:{music:true}},
  {text:['アニメ第1話もあります','アニメ だい1わも あります'],when:{link:'anime'}}
 ]}
});
