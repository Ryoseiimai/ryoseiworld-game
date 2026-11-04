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
  {id:'share',do:'share',label:['シェアする','シェアする'],in:['chapter-card','challenge-result']}
 ],
 // A line whose {var} is empty disappears: the anime line until links.anime is set, the cheat line on a clean run.
 shareTexts:{
  'chapter-card':[['RYOSEIWORLD の第{chapter}章をクリアした','RYOSEIWORLD の {chapter}しょうを クリアした'],ANIME],
  'challenge-result':[['RYOSEIWORLD のチャレンジでステージ {stage} まで行った（コンボ {combo}）','RYOSEIWORLD の チャレンジで ステージ {stage} まで いった（コンボ {combo}）'],['{cheat}','{cheat}'],ANIME]
 }
});
