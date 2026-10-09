# v5 エンジンの使い方（章を作る係むけ）

章を足す係は、このページだけを読めば `v5/data/chN.js` を書けるようにしてある。
設計書の正本の順は STORY_V4.md → STORY_V3.md → SPEC_V6.md → SPEC_V5_ENGINE.md → SPEC_V5.md → SPEC_V5_CH234.md。ここに無いことは、エンジン（`v5/index.html`）を変える件になる。
新しい絵は自分で描かない。`autodev/ART_REQUESTS.json` に依頼を足し、届くまでは今ある絵か仮の絵で動かす（RULES.md の4）。

## 1. 章のファイルの形

1つの章は `v5/data/chN.js` の1ファイル。中で `RYW.registerChapter({...})` を1回だけ呼ぶ。

```js
// Chapter 2, ミナモちょう. Only data: the engine in index.html reads it through RYW.registerChapter.
(function(){'use strict';
const {object,person,prop,props}=RYW.helpers;
const maps={};
maps.minamo={name:'ミナモちょう',w:30,h:36,outside:true,spawn:[6,25.5],objects:[/* 2章 */],enemies:[],portals:[]};
RYW.registerChapter({id:2,title:'ミナモちょう',town:'minamo',/* … */maps,dialogue:{},events:{},enemies:{}});
})();
```

読みこみは `v5/index.html` の最後で、エンジンの後・`RYW.start()` の前に順に並べる。

```html
<script src="data/ch1.js"></script><script src="data/ch2.js"></script><script>RYW.start();</script>
```

### registerChapter に渡すもの

| キー | 中身 |
|---|---|
| `id` | 章の番号（1〜4）。同じ番号を2回登録すると `false` が返り、警告が出る |
| `maps` `dialogue` `events` `enemies` `items` `summons` `music` `bonds` `spirits` | 章のデータ。全体の表にまぜて入る。ほかの章と同じ名前を使うと上書きして警告が出るので、`minamo_` のように章の頭文字をつける |
| `title` | 章の題（章クリアのカードに出る） |
| `town` | 章の町のマップ名。始まりの場所が無いときは、この町の `spawn` から始まる |
| `start` | 始まりの場所 `['マップ名', x, y]`（無くてよい） |
| `next` `nextTitle` | 次の章の番号と題。章クリアのカード「N しょう ◯◯ へ つづく」に使う。最後の章は `next` を書かず、ボスの後を `events` の `ending` 手順にする |
| `boss` | この章のボスの敵の名前（`enemies` のキー） |
| `recruit` | この章で仲間になる召喚獣（`summons` のキー） |
| `zakoGoal` | 町のノイズ（ザコ）を何体しずめると次へ進めるか |
| `keyFlag` | ザコを しずめた後にもらう カギのフラグ名 |
| `serverItem` | 召喚獣を起こすのに要る どうぐ（例 `battery`） |
| `quests` | 目的の文（下の「目的の文」） |
| `clearDialogue` `clearSpot` | `action:'boss'` の物で勝った後の会話と、その後に立つ場所 `['マップ名', x, y]`。この道は章の番号を進めない。次の章へ進めるのはイベントの `chapterClear` 手順なので、2章からはボスを `battle` 手順で呼び、`win` に `chapterClear` を書く |
| `debugStart` | `__v5.debugStartChapter(n)` で飛んだ時の そろえ方 `{level, summons, items, flags}`（無くてよい。無ければ Lv は 1+(n-1)×4） |

### 目的の文（quests）

画面の上に出る「つぎに すること」。進み具合で、次の順に1つが選ばれる。7つ全部に `text` が要る（1つでも欠けると止まる）。

`cleared`（町が直った）→ `tutorial`（召喚の練習前）→ `boss`（仲間がそろった）→ `zako`（ザコが `zakoGoal` 未満）→ `key`（カギ待ち）→ `battery`（どうぐ待ち）→ `recruit`（どうぐがある）

```js
quests:{
 zako:{text:'まちの ノイズを しずめよう {n}/{goal}',dest:'enemy'},        // {n} 倒した数、{goal} は zakoGoal。dest:'enemy' は今は1章の町（town）のザコだけを指す
 key:{text:'としょかんで カギを もらおう',dest:{map:'minamo',id:'owl'}},   // dest は矢印の行き先（マップと物の id）
 cleared:{text:'まちに こえが もどった。'}
}
```

## 2. マップ

```js
maps.minamo={
 name:'ミナモちょう', short:'ミナモ',       // short は狭い所に出す短い名前（無くてよい）
 w:30, h:36,                                 // マスの数
 outside:true,                               // 屋外はキックボード、無ければ屋内（歩き）
 spawn:[6,25.5],                             // 来た時に立つマス
 tiles:[/* h 本の文字列。'.' 草 '=' 道 '+' 歩道 ':' 砂 '~' 水 */],
 objects:[/* 下の object など */],
 enemies:[{id:'m1',type:'worry',x:19,y:21.6,axis:'y'}],   // 町を うろうろするザコ。type は enemies のキー、axis は動く向き
 portals:[{x:5,y:12,to:'minamo',at:[6,25.5]}],            // 部屋の出口（↓のしるし）。objects・enemies・portals は空でも [] を書く
 cells:[/* 下の「マスのしかけ」 */]
};
```

### 物と人（RYW.helpers）

```js
object(id, kind, frame, x, y, w, h, extra)   // kind は絵の束: 'buildings' 'props' 'npc' 'interior' 'spot'
person(id, x, y, extra)                       // 町の人。会話は dialogue[id]。id は絵のある16人だけ:
                                              // mother sister grandpa clerk worker student police dog cat grandma delivery kid hacker shrine musician repair
                                              // ほかの人は object(id,'npc',コマ,…) で今ある絵を使い、新しい絵は依頼する
prop(id, frame, x, y, size, extra)            // 小物（props の絵）
props(prefix, frame, size, [[x,y,frame?],...], extra)   // 同じ小物を何個も
```

`extra` に書けるもの:

| キー | 働き |
|---|---|
| `label` | 近くで出る名前 |
| `dialogue` | 話す・しらべると出る会話（`dialogue` のキー） |
| `event` | 話す・しらべると動くイベント（`events` のキー）。`dialogue` より先に使われる。調べた時の順は enter → boss → clearedDialogue（町が直った後）→ recruit → event → dialogue なので、町が直った後は `clearedDialogue` が勝つ |
| `enter` `arrival` | 建物に入る: 行き先のマップと立つマス `[x,y]` |
| `lock` `lockedDialogue` | このフラグが無いと入れない。その時の会話。ただし章の `recruit` が仲間にいる時と、町が直った後は入れる |
| `firstDialogue` | 初めて入った時だけの会話 |
| `action` | `'rest'`（全快）`'save'` `'shop'` `'recruit'` `'boss'`。rest・save・shop は `dialogue` の会話の後に動くので、`dialogue` が要る |
| `summon` `needs` `needsDialogue` `repeatDialogue` | `action:'recruit'` 用。仲間になる召喚獣、要る どうぐ、無い時と2回目の会話 |
| `enemy` `requires` | `action:'boss'` 用。戦う敵と、先に要る仲間 |
| `clearedDialogue` | 町が直った後の会話 |
| `collider:false` `floor:true` `hidden:true` `sign:'文字'` | ぶつからない・床に描く・絵を描かない・看板の文字 |

### マスのしかけ（cells）

```js
cells:[
 {x:8,y:28.2,door:'library',at:[5,10]},       // 建物の出入り
 {x:7,y:27,warp:'tower2',at:[5,9]},            // ワープの床（光る）
 {x:9,y:27,trigger:'bridgeTalk',once:'bridgeSeen'}   // 踏むとイベント。once のフラグが立つと2回目は動かない
]
```

## 3. 会話

```js
dialogue:{
 owl:[['サーチフクロウ','ほうほう。\nしらべものかね。'],['','サーチフクロウが\nなかまに なった！',{show:'owl'}]],
 zakoWin:[['','{name}は\nしゅうりされた。']]
}
```

1行は `[話す人, 文, おまけ]`。文の `\n` で改行、1行は全角12字くらいまで（540x960 で文字が24px以上・はみ出さないため）。
`{name}` が相棒のAIの名前になるのは、イベントの `say` 手順で出した会話だけ。人や物の `dialogue` で出す会話では `{…}` は空になるので書かない。
`{show:'召喚獣'}` はその召喚獣の絵を出す。

エンジンが名前で呼ぶ会話（1章の ch1.js にある。章ごとに変える時だけ同じ名前で書く）:
`zakoWin`（`{name}` 敵の名前・`{exp}`・`{money}`）・`zakoLeft`（`{n}` 残り）・`zakoDone`・`levelUp`（`{lv}` `{hp}` `{atk}`）・`tutorialEnd`・`defeated`

## 4. イベントの手順

イベントは手順の配列。人に話す（`event`）・マスを踏む（`trigger`）・`__v5.debugEvent(手順)` で動く。1つの手順は動詞1つのオブジェクト。

```js
events:{
 owlQuiz:[
  {say:'owl'},
  {quiz:[{q:'パスワードに いいのは？',options:['1234','なまえ','ながい ことば'],answer:2}],who:'サーチフクロウ'},
  {join:'owl'},{flag:'owlJoined'},{save:'quiet'}
 ]
}
```

| 手順 | 書き方 | 働き |
|---|---|---|
| say | `{say:'owl'}` または `{say:[['人','文']]}` | 会話を出し、読み終わると次へ |
| choice | `{choice:'どうする？',who:'人',options:[{text:'はい',then:[…]},{text:'いいえ'}]}` | 2〜3択。選んだ先の `then` をしてから次へ。選択肢は16字まで |
| quiz | `{quiz:[{q,options:[3つ],answer:0〜2,right:[会話],wrong:[会話]}],who:'人',wrong:[会話]}` | 3択の問題を順に。まちがえると同じ問題をもう一度。全部正しいと次へ。外の `wrong` は全問共通のまちがいの会話 |
| join | `{join:'owl'}` | 召喚獣が仲間に（フラグ `owl` も立つ） |
| give / take | `{give:'rice',n:2}` `{take:'battery'}` | どうぐを増やす・減らす（n は無ければ1） |
| flag | `{flag:'seenPark'}` `{flag:'step',value:2}` | フラグを立てる（value は無ければ true） |
| if | `{if:条件,then:[…],else:[…]}` | 条件で分ける（下の「条件」） |
| battle | `{battle:'crow',id:'park1',win:[…],lose:[…]}` | 戦う。勝ち負けの手順の後に次へ。イベントの戦いはザコの数に入らない |
| warp | `{warp:'library',at:[5,10]}` | マップを移る（at が無ければ spawn） |
| transport | `{transport:'バス',copy:'どこへ いく？',stops:[{text:'ヒダマリちょう',map:'town',at:[12,16]},{text:'ネオンシティ',map:'neon',at:[5,5],if:'ticket'}]}` | 行き先を選ぶ。`if` のある行き先はその条件の時だけ出る。今いるマップの行き先は押せない。「やめる」が足される |
| inn | `{inn:true}` | HPとでんちを満タン |
| save | `{save:true}` `{save:'quiet'}` | 保存（quiet はお知らせを出さない） |
| music | `{music:'boss'}` | 曲を変える（`music` のキー、空で止める） |
| shake / flash | `{shake:true,ms:400,power:8}` `{flash:'#ffffff',ms:300}` | 画面のゆれ・光（既定は ゆれ 500ms・強さ10、光 300ms・白）。すぐ次へ進むので、待たせる時は後に wait |
| wait | `{wait:600}` | ミリ秒だけ待つ（既定 500）。待つ間は動けず、メニューも開かない |
| chapterClear | `{chapterClear:true,copy:'カードの文'}` | 章クリア。次の章の頭で保存し、章のカードを出す（ボタンで次の章へ。次が無ければタイトルへ） |
| ending | `{ending:[['','ありがとう。']],title:'おしまい',copy:'また あそぼう。'}` | 会話の後にエンディングのカード、ボタンでタイトルへ |
| bond | `{bond:'mother'}` `{bond:'mother',n:2}` | その人のきずなのハートを増やす（n は無ければ1、5まで）。小さな音と「◯◯との きずなが ふかまった！」。もう5なら何も出さずに次へ |
| gift | `{gift:'rice',to:'mother'}` | 好きな物をあげる。`likes` にあり、持っていれば1つ減らしてハート+1。同じ人に同じ物は1回だけ（2回目は「もう あげた」で、物は減らない）。好きでない物・持っていない物・もうハート5の人は、そう言って物を減らさずに次へ |

### 条件（if・transport の if）

```js
'key'                                  // フラグが立っている
{not:'key'}                            // 立っていない
{flag:'zakoWins',atLeast:3}            // 数が3以上（atLeast:'zakoGoal' と書くと章の値を使う）
{item:'battery',atLeast:1}             // どうぐを持っている
{summon:'owl'}                         // 召喚獣が仲間にいる
```

## 5. きずな（bonds）

人ごとのきずな（SPEC_V6.md の2）。ハートは0〜5で、保存に入る。

```js
bonds:{
 mother:{name:'おかあさん',kind:'family',spirit:'nao',likes:['rice']},
 sister:{name:'いもうと',kind:'family',spirit:0,likes:['drink']}
}
```

| キー | 中身 |
|---|---|
| `name` | 「◯◯との きずなが ふかまった！」に出る名前。全角10字まで |
| `kind` | `family`（家）・`friend`（友）・`love`（恋） |
| `spirit` | その人の守護霊。数なら `v5/assets/spirits` のコマ（0〜15）、文字なら召喚獣（`summons` のキー） |
| `likes` | 好きな物（`items` のキー）。`gift` 手順で1種類につき1回ハートが上がる |

### 守護霊（spirits）

ソラが目をさました後（なまえを つけた後）、町の人（`npc` の物）の頭の横に守護霊が上下にゆれて浮く。だれの守護霊かは、`bonds` の `spirit`、無ければ章の `spirits` で決める。どちらにも無い人（犬・ねこなど）には出ない。

```js
spirits:{grandpa:7,police:4,repair:'code'}   // 人の id: spirits のコマ（0〜15）か召喚獣
```

ハート0〜1は灰色で半透明、2以上で色つき、5で光の粒が回る。`__v5.spirits` で今見えている守護霊（id・hearts・stage）が読める。

頼みごとは イベントの手順で書き、終わりに `{bond:'人'}` を置く。ごほうび（武器・お金）は R11 で足す。

## 6. 敵

```js
enemies:{
 worry:{name:'しんぱいの かげ',frame:2,hp:40,attack:8,exp:14,money:32,level:3,color:['#334d66','#b99879'],
  actions:['「だいじょうぶ？」を 10かい いった！']},
 kateino:{name:'カテイノジジョウ',boss:true,art:'kateino',animCols:3,specialEvery:3,specialDamage:6,hp:320,attack:13,exp:80,money:240,level:7,
  color:['#493857','#c49362'],actions:['…'],bursts:[[.75,'しんぱい なのよ'],[.5,'…'],[.25,'…'],[0,'…すごいじゃない']]}
}
```

- `frame` は町のザコの絵のコマ。ボスは `art`（`v5/assets/` の下の絵の名前）と `animCols`
- `bursts` は HP の節目（0.75 は のこり75%）で出る一行
- 倒した敵は「おとなしく なった」「しゅうりされた」と書く（壊す・殺すとは書かない）

## 7. 全体の表（index.html にあるもの）

- `items`: rice（おにぎり）・drink（エナジードリンク）・battery（モバイルバッテリー）。章で足す時は `{name,price,heal|battery,desc}`
- `summons`: nao・code など。足す時は `{name,frame,cost,heal|damage,desc}`
- `music`: town・battle・boss・victory。足す時は16音の MIDI 番号の配列（0 は休み）

## 8. 確かめ方

```js
__v5.debugStartChapter(2)            // 2章の頭へ（それまでの仲間・ボス・町がそろう）
__v5.debugEvent([{say:[['テスト','やあ']]},{wait:300}])   // 手順をその場で動かす
__v5.debugFlags()                     // フラグの写し
__v5.debugSetFlag('key')              // フラグを立てる（2つめの引数で値）
__v5.debugBond('mother',3)           // きずなのハートを決める（0〜5、n が無ければ0）。知らない人なら false
__v5.bonds                            // きずなの写し {mother:3}
__v5.debugWarp('minamo',6,25)         // マップと位置へ
__v5.debugWin()                       // 今の戦いに勝つ
```

手元の確認は `node tools/test_v5.cjs`（データのまちがい・イベントの動き）と `node tools/smoke_v5.cjs`（ブラウザで通す）。
`test_v5.cjs` は全部のイベントの手順を調べ、知らない会話・マップ・敵・どうぐ・召喚獣・曲・きずなの人の名前、gift の物が その人の likes にあるか、選択肢の数と長さ、クイズの3択をまちがいとして止める。
