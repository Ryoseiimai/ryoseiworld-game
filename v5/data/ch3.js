// Chapter 3, ネオンシティ. Only data: the engine in index.html reads it through RYW.registerChapter.
// The city of numbers (SPEC_V5_CH234.md): everyone looks at the numbers on their phones, and big screens show rankings.
// R37: the station square for the chapter 2 card. R23: the town and its places (v5/assets/neon). People and noises come in R38.
(function(){'use strict';
const {object,prop,props}=RYW.helpers;
// The neon sheet: 0 ranking tower, 1 chart tower, 2 ranking stadium, 3 net cafe, 4 station, 5 mural wall, 6 capsule hotel, 7 selfie plaza, 8 cloud gate (chapter 4).
const city=(id,frame,x,y,w,h,extra)=>object(id,'neon',frame,x,y,w,h,extra);
const maps={};
maps.neon={name:'ネオンシティ',short:'ネオン',w:30,h:36,outside:true,spawn:[15,13.6],objects:[
 // The train from ミナモちょう stops here (ch2.js trainStop).
 city('neon_station',4,15,12,250,240,{label:'えき',event:'trainStop'}),
 city('neon_cafe',3,5.6,12.6,220,220,{label:'ネットカフェ',enter:'neon_cafe',arrival:[5,10]}),
 city('neon_ranking',0,24.6,12.6,190,250,{label:'ランキングタワー',dialogue:'rankingTower'}),
 city('neon_selfie',7,6.4,24.4,220,220,{label:'セルフィーひろば',dialogue:'selfiePlaza'}),
 city('neon_capsule',6,24,24.4,210,220,{label:'カプセルホテル',enter:'neon_capsule',arrival:[5,10]}),
 city('neon_charts',1,5.6,33.6,200,240,{label:'いいねビル',dialogue:'chartTower'}),
 city('neon_stadium',2,15,33.6,260,230,{label:'ランキングスタジアム',enter:'neon_stadium',arrival:[5,10]}),
 // The white mural wall: the painting child and Paint Chimera come in R24.
 city('neon_mural',5,24.4,33.6,220,220,{label:'へきがの かべ',dialogue:'muralWall'}),
 prop('neon_sign',11,11.4,14.2,80,{dialogue:'neonSign'}),
 prop('neon_bench',4,19.4,22.6,90),prop('neon_bench2',4,10.6,31.6,90),
 ...props('neon_light',5,120,[[12.4,18.6],[17.6,18.6],[12.4,29.6],[17.6,29.6],[2.4,20.6],[27.6,20.6],[2.4,30.6],[27.6,30.6]]),
 ...props('neon_tree',0,120,[[1.4,13.4,1],[28.6,13.4],[1.4,24.4],[28.6,24.4,1]]),
 ...props('neon_edge',2,100,Array.from({length:14},(_,i)=>[1.2+i*2.1,1.9]),{collider:false}),
 // R38: people with grey faces and a number over their head, numberNn npc2 frames (index%4===3 picks the greyish fallback colour until there is art).
 object('neon_num1','npc2',3,12,19.6,48,65,{label:'かずの ひと',dialogue:'numberPerson1',sign:'86い'}),
 object('neon_num2','npc2',6,18,19.4,48,65,{label:'かずの ひと',dialogue:'numberPerson2',sign:'3204'}),
 object('neon_num3','npc2',3,10,30.4,48,65,{label:'かずの ひと',dialogue:'numberPerson3',sign:'12,840'}),
 object('neon_num4','npc2',6,20,30.6,48,65,{label:'かずの ひと',dialogue:'numberPerson4',sign:'99い'})],
 // R38: three street zako (popup, infinite loading, a rampaging vacuum) plus R46's ハルシネーション, patrolling the two cross roads.
 enemies:[{id:'nz1',type:'popup',x:9,y:15.5,axis:'x'},{id:'nz2',type:'infload',x:21,y:15.5,axis:'x'},{id:'nz3',type:'vacuum',x:14.5,y:21,axis:'y'},{id:'nz4',type:'hallucination',x:9,y:26.5,axis:'x'}],portals:[]};
// Terrain: # city tiles, = road, + sidewalk. Two streets cross the town and one road joins the station and the stadium.
maps.neon.tiles=Array.from({length:36},(_,y)=>Array.from({length:30},(_,x)=>{
 if(y<2)return '.';
 if((y>=15&&y<=16)||(y>=26&&y<=27)||(x>=14&&x<=15&&y>=15&&y<=27))return '=';
 if(y===14||y===17||y===25||y===28||((x===13||x===16)&&y>=17&&y<=25))return '+';
 return '#';
}).join(''));
// The net cafe: a night there brings HP and battery back (SPEC_V5_CH234.md).
maps.neon_cafe={name:'ネットカフェ ルミナ',short:'カフェ',w:11,h:13,spawn:[5,10],objects:[
 object('nc_rug','interior',11,5,9,160,160,{floor:true,collider:false}),
 object('nc_pc1','interior',1,2.2,4.2,110,110,{label:'パソコン',dialogue:'cafePc'}),object('nc_pc2','interior',1,8.6,4.2,110,110,{label:'パソコン',dialogue:'cafePc'}),
 object('nc_sofa','interior',12,2.2,8,110,110),object('nc_counter','interior',6,5.4,6.6,120,110,{label:'うけつけ',event:'netCafe',collider:{left:.1,right:.9,top:.55,bottom:1}}),object('nc_plant','interior',13,9.4,8.4,75,80),
 object('nc_clerk','npc2',8,5.4,5.2,48,65)],
 enemies:[],portals:[{x:5,y:11.4,to:'neon',at:[5.6,13.8]}]};
// The capsule hotel: everyone is in their capsule, looking at numbers. Beds stand in for capsules until there is a picture.
maps.neon_capsule={name:'カプセルホテル',short:'カプセル',w:11,h:13,spawn:[5,10],objects:[
 object('ncap_bed1','interior',0,2,4.6,110,110,{label:'カプセル',dialogue:'capsuleBed'}),object('ncap_bed2','interior',0,5.4,4.6,110,110,{label:'カプセル',dialogue:'capsuleBed'}),object('ncap_bed3','interior',0,8.8,4.6,110,110,{label:'カプセル',dialogue:'capsuleBed'}),
 object('ncap_plant','interior',13,9.4,8.8,75,80)],
 enemies:[],portals:[{x:5,y:11.4,to:'neon',at:[24,25.8]}]};
const wait={text:'ネオンシティを みて まわろう'};
// R50: a small reception room, using the existing interior and attendant art.
// R26: ヒカクマオウ stands at the back of the stadium floor (no art yet, autodev/ART_REQUESTS.json hikaku_throne; a labelled box until it comes).
maps.neon_stadium={name:'ランキングスタジアム',short:'スタジアム',w:11,h:13,spawn:[5,10],objects:[
 object('nst_rug','interior',11,5,9,160,160,{floor:true,collider:false}),
 object('nst_guide','npc2',5,5,6,48,65,{label:'チャレンジ うけつけ',dialogue:'stadiumChallenge',action:'challenge'}),
 object('nst_plant','interior',13,9,7,75,80),
 object('neon_boss','hikaku_throne',0,8.4,5.6,150,170,{label:'ヒカクマオウ',action:'boss',enemy:'hikaku',dialogue:'hikakuTalk',clearedDialogue:'hikakuGone',goneWhenCleared:true})],
 enemies:[],portals:[{x:5,y:11.4,to:'neon',at:[15,35]}]};
RYW.registerChapter({id:3,title:'ネオンシティ',town:'neon',zakoGoal:3,
 // R26: the boss fight (v5/js/shooter.js hikaku: number blocks weaken the shot, サーチフクロウ doubles the crown, じぶんの ペース backs one step off).
 boss:'hikaku',clearDialogue:'hikakuClear',clearSpot:['neon',15,35.6],next:4,nextTitle:'ノイズのとう',
 // __v5.debugStartChapter(3): chapters 1 and 2 are done and the train runs.
 debugStart:{items:{firstgame:1},flags:{gameMade:true,minamoVisited:true,minamoCleared:true,neonVisited:true}},
 // The quest steps for recruit/key/zako come with the people and noises (R24・R25・R38). Until then the stadium boss is reachable directly (no requires on the object).
 quests:{cleared:{text:'まちが すこし おだやかに なった。'},tutorial:{text:'よびだすで ナオスライムを よぼう'},
  zako:{text:'まちの ノイズを しずめよう {n}/{goal}',dest:'enemy'},
  key:wait,battery:wait,recruit:wait,boss:{text:'スタジアムの ヒカクマオウへ',dest:{map:'neon_stadium',id:'neon_boss'}}},
 events:{
  netCafe:[{say:'cafeAsk'},{choice:'とまって いく？',options:[{text:'とまる',then:[{say:'cafeSleep'},{flash:'#c9b8ff',ms:500},{wait:500},{inn:true},{say:'cafeMorning'},{save:true}]},{text:'やめておく',then:[{say:'cafeBye'}]}]}]
 },
 dialogue:{
  neonSign:[['かんばん','ようこそ ネオンシティ。\nひかりと かずの まち。'],['ソラ','みんなの あたまに\nかずが うかんでる…？']],
  rankingTower:[['おおきな がめん','きょうの ランキング\n1い 2い 3い…'],['おおきな がめん','あなたは なんい？'],['ソラ','ずっと ながれてる。\nめが まわりそう。']],
  selfiePlaza:[['セルフィーひろば','ここで とると\nいいねが ふえる！'],['ソラ','みんな じぶんの\nかおを みてるね。']],
  chartTower:[['いいねビル','いいねの かずが\nいつも のぼっていく。'],['ソラ','グラフしか\nかいてない ビルだ。']],
  stadiumChallenge:[['うけつけ','リズム チャレンジ！\nビートに のって\nどこまで いけるかな。']],
  muralWall:[['','まっしろな\nおおきな かべ。'],['ソラ','なにも かいてない。\nなにか かけそう。']],
  // R38: the numbered people stand still and talk only about their number.
  numberPerson1:[['かずの ひと','きょうは 86い。\nきのうより 2つ さがった。'],['ソラ','ずっと その かずの\nことばかり いってる。']],
  numberPerson2:[['かずの ひと','3204… 3204…\nふえろ、ふえろ。']],
  numberPerson3:[['かずの ひと','12,840。\nあしたには もっと。'],['ソラ','かおより さきに\nかずが みえる。']],
  numberPerson4:[['かずの ひと','99い。\nあと1い…\nあと1い…']],
  cafeAsk:[['てんいん','いらっしゃいませ。\nネットカフェ ルミナです。'],['てんいん','いすで ねられます。\nじゅうでんも むりょう。']],
  cafeSleep:[['','いすを たおして\nすこし ねむった。']],
  cafeMorning:[['','HPと でんちが\nぜんぶ もどった！'],['てんいん','おはようございます。\nよく ねてましたね。']],
  cafeBye:[['てんいん','また どうぞ。']],
  cafePc:[['パソコン','ランキングの ページが\nひらいた ままだ。'],['ソラ','とじて おこう。']],
  capsuleBed:[['カプセル','（なかで だれかが\nスマホを みている）'],['','ピロン ピロン…']],
  // R26: the stadium boss (rpg.html 3章のせりふを移す). The crown glows for サーチフクロウ in the shooter itself.
  hikakuTalk:[['ヒカクマオウ','おなじ としで\nもう しゃちょう'],['ソラ','すうじに のまれそう…'],['ソラ','かんむりを\nねらって みよう！']],
  hikakuGone:[['','ヒカクマオウは\nおとなしく なった。']],
  // 倒したあと: 頭の上の数字が消え、みんなが自分の好きなものの話を始める（SPEC_V5_CH234.md）。
  hikakuClear:[['','あたまの うえの すうじが\nふっと きえた。'],['まちの ひと','…あれ、なんいだっけ。'],['べつの ひと','わたし ねこが すき。\nそれだけで いいよね。'],['べつの ひと','ひさしぶりに\nそらを みた きがする。']]},
 enemies:{
  // The boss is a shooter fight (v5/js/shooter.js hikaku: number blocks that weaken the shot, rings from half HP, じぶんの ペース pickups).
  hikaku:{name:'ヒカクマオウ',boss:true,intro:['ヒカクマオウ','おなじ としで もう しゃちょう'],art:'hikaku',animCols:3,specialEvery:3,specialDamage:0,hp:400,attack:15,exp:110,money:260,level:8,color:['#4a3f1a','#ffd94a'],hints:['「フォロワー 10まん」','「おなじ としで もう しゃちょう」','すうじを なげる'],actions:['「フォロワー 10まん」と いった！','「おなじ としで もう しゃちょう」と いった！','すうじを なげて きた！']},
  // R38: the two new street zako (frames 5, 6; popup already comes from ch1.js).
  infload:{name:'むげんローディング',frame:5,hp:62,attack:11,exp:24,money:40,level:6,color:['#2a3a52','#9fc4e0'],hints:["くるくる まわる","おわらない バー"],actions:['ぐるぐる まわった！','バーが すすんで、また もどった！']},
  vacuum:{name:'ぼうそうそうじき',frame:6,hp:70,attack:13,exp:26,money:44,level:6,color:['#4a3a2a','#d8a85a'],hints:["とつげき","コードを すう"],actions:['まっすぐ とつげきした！','コードを ズルズル すいこんだ！']},
  // R46 (SPEC_V7_MANABU.md 7): じぶんまんまんの一言を言うが、全部まちがい。HPの棒はうそ（いつも まんたん、fakeHp）。
  // じっこう・つくるのダメージは半分。サーチフクロウで「でどころが ない！」→ ほんとうのHPが見え、ダメージ2倍（index.html damageEnemy/cast owl）。
  hallucination:{name:'ハルシネーション',frame:7,fakeHp:true,hp:80,attack:10,exp:30,money:46,level:7,color:['#3a2a52','#d9a6ff'],hints:["じしんまんまん","ぜんぶ まちがい"],actions:['「よわてんは みず だよ」と じしんまんまんに いった！','「かいとうは 42です」と いった！','「でどころは たしかです」と いった！']}},
 maps
});
})();
