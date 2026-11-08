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
  // og-anime-cta: the anime button appears on the title and the credit card. views.about reuses the
  // credit-card slot (see js/outgame.js SLOTS), so this row also shows inside "このゲームについて"
  // without naming 'about', which is not a SLOT. The row stays hidden while links.anime is empty.
  {id:'anime',do:'open',link:'anime',label:['アニメを見る','アニメを みる'],in:['title','credit-card']},
  {id:'share',do:'share',label:['シェアする','シェアする'],in:['chapter-card','challenge-result','credit-card']},
  {id:'about',do:'view',view:'about',label:['このゲームについて','このゲームについて'],in:['settings']},
  // og-achievement: a view-only window (no `challenge` row, no `do:'start'`: the stadium door stays the
  // only way to start a challenge). `when:{save:true}` keeps this hidden on a brand-new title with no save.
  {id:'records',do:'view',view:'records',label:['実績 {earned}/{total}','じっせき {earned}/{total}'],in:['title','menu'],when:{save:true}}
 ],
 // A line whose {var} is empty disappears: the anime line until links.anime is set, the cheat line on a clean run.
 shareTexts:{
  'chapter-card':[['RYOSEIWORLD の第{chapter}章をクリアした','RYOSEIWORLD の {chapter}しょうを クリアした'],ANIME],
  'challenge-result':[['RYOSEIWORLD のチャレンジでステージ {stage} まで行った（コンボ {combo}）','RYOSEIWORLD の チャレンジで ステージ {stage} まで いった（コンボ {combo}）'],['{cheat}','{cheat}'],ANIME],
  'credit-card':[['RYOSEIWORLD を最後まで遊んだ','RYOSEIWORLD を さいごまで あそんだ'],ANIME]
 },
 // The about view (opened from settings) shows the same card as the finale's THE END card, so it
 // reuses the credit-card slot for its rows instead of a slot of its own (js/outgame.js SLOTS).
 // og-achievement: a view-only window; `slot:'records'` is this view's own id, so js/outgame.js's
 // validate() accepts it without a new place in SLOTS (docs/OUTGAME.md "新しい置き場所"). No item is ever
 // placed `in:['records']`, so the window holds nothing but the achievement list and the best record.
 views:{
  about:{title:['このゲームについて','このゲームについて'],body:'credits',slot:'credit-card'},
  // R445: the band read 記録 5/12 while the challenge result also says 記録, so the count is named 実績 like the
  // earned toast (実績：…, R451); the window keeps both words because it shows the best challenge record above the list.
  records:{title:['実績と記録','じっせきと きろく'],body:'records',slot:'records'}
 },
 // og-ending-epilogue: shown on the finale's THE END card and in the settings "このゲームについて" view.
 // The Lyria line gets an explicit \n before 作りました/つくりました so it never breaks mid-word at
 // 390px width (design_final.md 4節7: the old auto-wrap split 作/りました).
 credits:{eyebrow:'THE END',heading:['ありがとう','ありがとう'],lines:[
  {text:['作った人 RYOSEIWORLD','つくった ひと RYOSEIWORLD']},
  {text:['音楽の一部は Google の Lyria で\n作りました','おんがくの いちぶは Google の Lyria で\nつくりました'],when:{music:true}},
  {text:['アニメ第1話もあります','アニメ だい1わも あります'],when:{link:'anime'}}
 ]},
 // 12 rows. `secret` ones show '？？？' until earned (js/outgame.js BODY.records). `when` never uses
 // {not} or {item}: validate() rejects those for an achievement because they can turn false again.
 achievements:[
  {id:'ch1',name:['BUG KING を修理した','BUG KING を しゅうりした'],when:{boss:'bugking'}},
  {id:'ch2',name:['カテイノジジョウを静めた','カテイノジジョウを しずめた'],when:{boss:'kateino'}},
  {id:'ch3',name:['ヒカクマオウを静めた','ヒカクマオウを しずめた'],when:{boss:'hikaku'}},
  {id:'jibun',name:['ジブンと向き合った','ジブンと むきあった'],when:{boss:'jibun'},secret:true},
  // R438: 「ゼロと作った」は何を作ったのか言わず「ゼロから作った」とも読めたので、ゼロとの和解（STORY_V4.md）をそのまま「ゼロと分かり合えた」と書く
  {id:'zero',name:['ゼロと分かり合えた','ゼロと わかりあえた'],when:{summon:'zero'},secret:true},
  {id:'word10',name:['言葉を10個集めた','ことばを 10こ あつめた'],when:{count:'words',atLeast:10}},
  {id:'word40',name:['言葉を40個集めた','ことばを 40こ あつめた'],when:{count:'words',atLeast:40}},
  // R441: 「守護霊が一緒に飛んだ」は何をすれば取れるか読めず、ボス戦の前でも取れて事実とずれたので、条件どおり bond5 と同じ形にする
  // R446: ボス戦の体力のハートと見分けるため、きずなの行は「きずなが♥N」で始める
  {id:'bond3',name:['きずなが♥3になった','きずなが ♥3に なった'],when:{count:'bondMax',atLeast:3}},
  {id:'bond5',name:['きずなが♥5になった','きずなが ♥5に なった'],when:{count:'bondMax',atLeast:5}},
  {id:'stage5',name:['ステージ5に届いた','ステージ5に とどいた'],when:{count:'stage',atLeast:5}},
  {id:'stage10',name:['ステージ10に届いた','ステージ10に とどいた'],when:{count:'stage',atLeast:10}},
  {id:'combo50',name:['コンボ50を出した','コンボ50を だした'],when:{count:'combo',atLeast:50}}
 ]
});
