// Chapter 2, ミナモちょう. Only data: the engine in index.html reads it through RYW.registerChapter.
// The riverside town (SPEC_V5_CH234.md): parents watch their phones, children stay in, and worry walls stand on the paths.
// R20: the town, its people and noises. R21: the library quiz, Search Owl and the grandpa's bond. R22: カテイノジジョウ at the park (shooter), then the walls go.
// R37: the park scene ends with the chapter card and the train to ネオンシティ (chapter 3).
(function(){'use strict';
const {object,prop,props}=RYW.helpers;
// Same as ch1.js: after the errand, offer one liked thing once.
const gift=(to,item,label,after)=>({if:after,then:[{if:{item,atLeast:1},then:[{if:{not:'gave_'+to},then:[{choice:label+'を あげる？',options:[{text:'あげる',then:[{gift:item,to},{flag:'gave_'+to}]},{text:'やめておく'}]}]}]}]});
// Train stops (SPEC_V5_CH234.md: ミナモちょう → ネオンシティ by train from the station). The first ride is the end of chapter 2.
const trainStops=[{text:'ミナモちょう',map:'minamo',at:[17.8,13.6]},{text:'ネオンシティ',map:'neon',at:[10,12.4],if:'neonVisited'}];
const maps={};
// Worry walls have no picture yet (autodev/ART_REQUESTS.json worry_wall); the engine draws a grey block with eyes until it comes.
const wall=(id,x,y)=>object(id,'worry',0,x,y,110,84,{label:'しんぱいの かべ',dialogue:'worryWall',goneWhenCleared:true});
maps.minamo={name:'ミナモちょう',short:'ミナモ',w:30,h:36,outside:true,spawn:[11.6,31.4],objects:[
 object('minamo_house1','buildings',0,6,15.4,194,194),
 object('minamo_house2','buildings',0,22,15.4,194,194),
 object('minamo_library','buildings',5,22,26.2,210,188,{label:'としょかん',enter:'minamo_library',arrival:[5,11]}),
 object('minamo_friend','buildings',0,6,34,194,194,{label:'ともだちの いえ',enter:'minamo_friend',arrival:[5,10]}),
 object('minamo_apartment','buildings',6,23,34,190,190),
 prop('minamo_bus',13,12.4,30.4,90,{label:'バスてい',event:'busStop'}),
 prop('minamo_station',13,17.8,12.4,90,{label:'えき',event:'trainStop'}),
 prop('minamo_sign',11,12,21.2,80,{dialogue:'minamoSign'}),
 prop('minamo_parksign',11,9.4,23.4,150,{sign:'こうえん'}),
 prop('minamo_river',11,20,7.4,80,{dialogue:'minamoRiver'}),
 prop('minamo_bench',4,8.4,25.6,90),prop('minamo_bin',14,10.6,25.4,60),prop('minamo_post',6,17.2,30.6,70),
 ...props('minamo_flowers',10,100,[[2,24.8],[2,26.4]]),
 ...props('minamo_tree',0,130,[[2.4,9.6],[10.6,9.6,1],[18,9.6],[27.4,9.6,1],[1.4,21.6],[10.8,22.6,1],[27.6,20.6],[1.2,33.4,1],[11,34.4]]),
 ...props('minamo_light',5,120,[[12.5,12.6],[17.5,22.6],[12.5,32.6],[17.5,6.2],[6,6.2],[25,6.2]]),
 ...props('minamo_edge',2,100,Array.from({length:14},(_,i)=>[1.2+i*2.1,1.9]),{collider:false}),
 // Worry walls on the riverside path, at the park and on the east street. They go away after the boss (R22).
 wall('minamo_wall1',14.5,8.2),wall('minamo_wall2',7.4,20.6),wall('minamo_wall3',26,18.8),
 // The biggest wall stands in the park sand. With Search Owl it speaks, and the kickboard lifts into the shooter (SPEC_V6.md 4).
 object('minamo_boss','worry',0,4.6,22.4,170,128,{label:'カテイノジジョウ',action:'boss',enemy:'kateino',requires:'owl',dialogue:'kateinoTalk',lockedDialogue:'worryWall',goneWhenCleared:true}),
 // People: a tired father at the park, a mother who keeps her son in, the dog, the grandpa is in the library.
 object('minamo_dad','npc2',6,11,18.9,48,65,{dialogue:'minamoDad',clearedDialogue:'dadAfter'}),
 object('minamo_mom','npc2',8,9.6,33.8,48,65,{dialogue:'minamoMom',clearedDialogue:'momAfter'}),
 object('minamo_dog','npc',7,4.4,25.4,56,60,{dialogue:'minamoDog'})],
 enemies:[{id:'ms1',type:'spam',x:20,y:22.6,axis:'y'},{id:'mc1',type:'cable',x:7,y:12.2,axis:'x'},{id:'mn1',type:'maskcat',x:24.4,y:31.4,axis:'x'},{id:'ms2',type:'spam',x:20.4,y:33.4,axis:'x'}],portals:[]};
// Terrain: . grass, = road, + sidewalk, : sand, ~ water. The river runs across the top with the riverside path under it.
maps.minamo.tiles=Array.from({length:36},(_,y)=>Array.from({length:30},(_,x)=>{
 if(y<2)return '.';
 if(y>=3&&y<=5)return '~';
 if(y===6||y===7)return '+';
 if(x>=3&&x<=6&&y>=22&&y<=23)return ':';
 if((x>=14&&x<=15&&y>=8)||(y>=18&&y<=19)||(y>=28&&y<=29))return '=';
 if((x===13||x===16)&&y>=8||y===17||y===20||y===27||y===30)return '+';
 return '.';
}).join(''));
// The library: shelves, the search machine where Search Owl sleeps (R21) and the grandpa.
maps.minamo_library={name:'みずべの としょかん',short:'としょかん',w:11,h:14,spawn:[5,11],objects:[
 object('ml_rug','interior',11,5,10.2,160,160,{floor:true,collider:false}),
 object('ml_shelf1','interior',2,1.8,4.2,110,130),object('ml_shelf2','interior',2,3.8,4.2,110,130),object('ml_shelf3','interior',2,7.6,4.2,110,130),object('ml_shelf4','interior',2,9.4,4.2,110,130),
 object('ml_search','interior',1,5.7,4.4,120,120,{label:'けんさくの きかい',event:'owlQuiz'}),
 object('ml_plant','interior',13,1.6,8.4,75,80),object('ml_clock','interior',14,5.7,1.9,70,70,{collider:false}),
 object('minamo_grandpa','npc',2,3.4,7.6,56,75,{event:'minamoGrandpa'})],
 enemies:[],portals:[{x:5,y:12.4,to:'minamo',at:[22,27.6]}]};
// The friend's house: the boy who may not go out.
maps.minamo_friend={name:'ともだちの いえ',w:11,h:13,spawn:[5,10],objects:[
 object('mf_rug','interior',11,5,9,160,160,{floor:true,collider:false}),
 object('mf_tv','interior',3,8.5,4.2,115,115,{label:'テレビ',dialogue:'friendTv'}),object('mf_sofa','interior',12,2.2,5.2,110,110),object('mf_plant','interior',13,9.4,8.4,75,80),
 object('minamo_boy','npc2',7,4.6,6.8,48,65,{event:'minamoBoy',clearedDialogue:'boyAfter'})],
 enemies:[],portals:[{x:5,y:11.4,to:'minamo',at:[6,35.4]}]};
RYW.registerChapter({id:2,title:'ミナモちょう',town:'minamo',boss:'kateino',recruit:'owl',clearDialogue:'kateinoClear',clearSpot:['minamo',8.6,23.8],clearEvent:'minamoPark',clearDone:'minamoCleared',next:3,nextTitle:'ネオンシティ',zakoGoal:3,keyFlag:'minamoKey',serverItem:'firstgame',zakoDone:'minamoZakoDone',
 // __v5.debugStartChapter(2): the bus has run once and the first game is in the pocket.
 debugStart:{items:{firstgame:1},flags:{gameMade:true,minamoVisited:true}},
 // People without bonds yet (their stories come with the boss in R22).
 spirits:{minamo_dad:5,minamo_mom:6,minamo_boy:2},
 // Search Owl lives in the library search machine: it shows the weak spot and the next move, then 2 turns do 1.5 times (STORY_V3.md, SPEC_V5_ENGINE.md).
 summons:{owl:{name:'サーチフクロウ',frame:2,cost:10,boost:1.5,turns:2,desc:'よわみを みせる。\n2ターン ダメージ 1.5ばい。'}},
 // The grandpa is the owl's person (STORY_V4.md, family). Hearts: waking the owl, the returned book, one onigiri.
 bonds:{minamo_grandpa:{name:'おじいちゃん',kind:'family',spirit:'owl',likes:['rice'],rewards:{2:{money:120},3:{weapon:'onigiri',money:150}}}},
 quests:{cleared:{text:'まちに こえが もどった。'},tutorial:{text:'しょうかんで ナオスライムを よぼう'},
  zako:{text:'まちの ノイズを しずめよう {n}/{goal}',dest:'enemy'},
  key:{text:'としょかんの おじいちゃんへ',dest:{map:'minamo_library',id:'minamo_grandpa'}},
  battery:{text:'としょかんの おじいちゃんへ',dest:{map:'minamo_library',id:'minamo_grandpa'}},
  recruit:{text:'けんさくの きかいを しらべよう',dest:{map:'minamo_library',id:'ml_search'}},
  boss:{text:'こうえんの おおきな かべへ',dest:{map:'minamo',id:'minamo_boss'}}},
 events:{
  // After the boss: the walls are gone and parents and children play in the park (SPEC_V5_CH234.md).
  // The chapter card saves at the head of chapter 3. A reload before that plays this scene again (clearDone in the engine).
  minamoPark:[{say:'minamoPark'},{say:'trainOpen'},{flag:'minamoCleared'},{flag:'neonVisited'},{chapterClear:true,copy:'でんしゃは ひかる まちへ。\nポケットに はじめての ゲーム。'}],
  // The station: after chapter 2 the train goes back and forth (chapter 3 points its own station here too).
  trainStop:[{if:'neonVisited',then:[{transport:'でんしゃ',copy:'どこへ いく？',stops:trainStops}],else:[{say:'trainWait'}]}],
  // The grandpa keeps the library open. Once three noises are quiet he lets RYOSEI use the search machine.
  // After the owl wakes he asks for an overdue book; the friend who may not go out still has it.
  minamoGrandpa:[{if:'minamoKey',then:[{if:{summon:'owl'},then:[{if:'minamoBookDone',then:[{say:'grandpaAfter'}],else:[{if:{item:'minamoBook',atLeast:1},then:[{say:'grandpaBook'},{take:'minamoBook'},{flag:'minamoBookDone'},{bond:'minamo_grandpa'},{save:'quiet'}],else:[{say:'grandpaBookAsk'},{flag:'minamoBookAsk'}]}]}],else:[{say:'grandpaAfter'}]}],
   else:[{if:{flag:'zakoWins',atLeast:'zakoGoal'},then:[{say:'grandpaKey'},{flag:'minamoKey'},{save:'quiet'}],else:[{say:'grandpaAsk'}]}]},gift('minamo_grandpa','rice','おにぎり','minamoBookDone')],
  // Search Owl's IT quiz (SPEC_V5_CH234.md): three questions, three choices, a wrong answer asks the same one again. All right: the owl joins.
  owlQuiz:[{if:{summon:'owl'},then:[{say:'owlIdle'}],else:[{if:'minamoKey',then:[{say:'owlWake'},
   {quiz:[{q:'つよい パスワードは？',options:['1234','じぶんの なまえ','ながくて ばらばら'],answer:2,right:'owlRight1'},
    {q:'しらない 人からの リンクは？',options:['すぐ おす','おさないで おとなに','ともだちに おくる'],answer:1,right:'owlRight2'},
    {q:'AIに ひみつを おしえて いい？',options:['なんでも いい','すんでる ばしょも','ひみつは いわない'],answer:2,right:'owlRight3'}],who:'サーチフクロウ',wrong:'owlWrong'},
   {say:'owlJoin'},{join:'owl'},{bond:'minamo_grandpa'},{save:'quiet'}],else:[{say:'searchMachine'}]}]}],
  // The friend kept a library book because he may not go out. He hands it over once the grandpa asks.
  minamoBoy:[{if:'minamoBookAsk',then:[{if:{not:'minamoBoyBook'},then:[{say:'boyBook'},{give:'minamoBook'},{flag:'minamoBoyBook'}],else:[{say:'minamoBoy'}]}],else:[{say:'minamoBoy'}]}]
 },
 // The overdue book: a key item, shown under どうぐ while carried.
 items:{minamoBook:{name:'かえしわすれた ほん',key:true,desc:'「はじめての\nプログラミング」\nへんきゃくびは せんげつ。'}},
 dialogue:{
  kateinoTalk:[['しんぱいの かべ','…あぶないから。\n…しょうらい\nどうするの。'],['サーチフクロウ','ほう。この かべ、\nなかに こえが ある。'],['ソラ','とどく ように\nみせに いこう！']],
  kateinoClear:[['','しんぱいの かべが\nすうっと きえた。'],['ソラ','みちが あいた！']],
  minamoPark:[['ともだち','RYOSEIくん！\nそとに でられた！'],['ともだちの ママ','…あの こ、\nなにか つくってるの？'],['ともだち','ママ、みて。\nぼくも つくりたい。'],['ともだちの ママ','…すごいじゃない。'],['つかれた おとうさん','ニュースより\nこっちの ほうが\nたのしいな。']],
  dadAfter:[['つかれた おとうさん','ニュースより\nこっちの ほうが\nたのしいな。']],
  momAfter:[['ともだちの ママ','あの こ、\nこうえんに いったわ。'],['ともだちの ママ','…たまには\nいいわよね。']],
  boyAfter:[['ともだち','あした こうえんで\nゲーム つくろう！']],
  minamoSign:[['かんばん','ようこそ ミナモちょう。\nかわと はしの まち。'],['ソラ','しずかすぎる。\nそとに だれも いない。']],
  minamoRiver:[['かんばん','かわで あそぶ ときは\nおとなと いっしょに。'],['かんばん','（おとなは\nスマホと いっしょ）']],
  worryWall:[['しんぱいの かべ','…あぶないから。'],['しんぱいの かべ','…あぶないから。'],['ソラ','とおして くれない。\nいまは むりそう。']],
  minamoDad:[['つかれた おとうさん','こうえんの ニュース、\nぜんぶ よんでる。'],['つかれた おとうさん','よめば よむほど\nこうえんが こわくなる。']],
  minamoMom:[['ともだちの ママ','うちの こ？\nいえで まってるわ。'],['ともだちの ママ','そとは あぶないもの。\nスマホに かいてある。']],
  minamoBoy:[['ともだち','RYOSEIくん？\nそとから きたの？'],['ともだち','ぼくも でたい。\nでも ママが\nしんぱいする。'],['ともだち','かべが あるから\nって いうんだ。']],
  friendTv:[['テレビ','「きょうの あぶない\nランキング」\nを やっている。']],
  minamoDog:[['いぬ','ワン。\n（さんぽは まだ？）']],
  searchMachine:[['けんさくの きかい','ほう…ほう…\n（いびきが きこえる）'],['ソラ','なかに だれか いる。\nおじいちゃんに きこう。']],
  grandpaAsk:[['おじいちゃん','よく きたね。\nここは みずべの\nとしょかん。'],['おじいちゃん','けんさくの きかいが\nノイズで ねむっとる。'],['おじいちゃん','まちの ノイズを\n3つ しずめて くれんか。']],
  grandpaKey:[['おじいちゃん','まちが すこし\nしずかに なったな。'],['おじいちゃん','けんさくの きかいを\nつかって ごらん。'],['','けんさくの きかいを\nつかえるように なった！']],
  grandpaAfter:[['おじいちゃん','しらべものは\nあわてず ゆっくり。']],
  grandpaBookAsk:[['おじいちゃん','フクロウが おきたか。\nありがとうな。'],['おじいちゃん','ところで、かしだしの\nほんが 1さつ\nもどって こんのじゃ。'],['おじいちゃん','ともだちの いえの\nこが かりとった\nはずじゃが。']],
  grandpaBook:[['','ほんを かえした。'],['おじいちゃん','おお、これこれ。\nよごれも ない。'],['おじいちゃん','そとに でられんで\nこまっとったんじゃな。'],['おじいちゃん','わしは おにぎりに\nめが なくてな。']],
  boyBook:[['ともだち','としょかんの ほん？\nあ、これだ。'],['ともだち','かえしに いきたかった\nけど、かべが あって。'],['','かえしわすれた ほんを\nあずかった。']],
  owlWake:[['けんさくの きかい','ピッ。ほう…ほう…'],['サーチフクロウ','ほうほう。\nわしを おこしたのは\nきみかね。'],['サーチフクロウ','しらべものの まえに\n3つ きいて よいかな。']],
  owlRight1:[['サーチフクロウ','ほう。ながくて\nばらばらが いちばん。']],
  owlRight2:[['サーチフクロウ','ほう。おさない。\nこまったら おとなに。']],
  owlRight3:[['サーチフクロウ','ほう。ひみつは\nじぶんの もの じゃ。']],
  owlWrong:[['サーチフクロウ','ほう？ もういちど\nよく かんがえて\nごらん。']],
  owlJoin:[['サーチフクロウ','ぜんもん せいかい。\nたのもしい ことじゃ。'],['サーチフクロウ','おじいちゃんの まちを\nいっしょに しらべよう。'],['','サーチフクロウが\nなかまに なった！']],
  owlIdle:[['サーチフクロウ','ほう。しらべものは\nいつでも どうぞ。']],
  trainOpen:[['ともだち','あ、えきの でんしゃ\nうごいてる！'],['ソラ','となりの まちへ\nいって みよう！']],
  trainWait:[['えきの かんばん','でんしゃは\nとまって います。'],['ソラ','せんろの むこうも\nしずかすぎる。']],
  minamoZakoDone:[['ソラ','ノイズが へってきた。\nとしょかんに いこう。']]
 },
 // Street noises of the riverside town (enemies sheet: 2 spam mail, 4 leaking cable, 8 masked cat). A little stronger than chapter 1.
 enemies:{
  // The boss is a shooter fight (v5/js/shooter.js kateino: bubble waves, walls from above and below, みせる with the first game cracks it).
  kateino:{name:'カテイノジジョウ',boss:true,intro:['カテイノジジョウ','しょうらい どうするの'],art:'kateino',animCols:3,specialEvery:3,specialDamage:6,hp:320,attack:13,exp:90,money:240,level:7,color:['#493857','#c49362'],actions:['「あぶないから」と いった！','かべを ふやした！','ニュースを よみあげた！']},
  spam:{name:'スパムメールのむれ',frame:2,hp:58,attack:10,exp:20,money:36,level:5,color:['#4b4d66','#c9b98f'],actions:['「あたりました！」を おくってきた！','おなじ メールを 30つう おくった！']},
  cable:{name:'ろうでんケーブル',frame:4,hp:66,attack:12,exp:24,money:42,level:6,color:['#2f4a52','#d9b45a'],actions:['ビリッと はねた！','からまって きた！']},
  maskcat:{name:'なりすましネコ',frame:8,hp:52,attack:11,exp:22,money:40,level:5,color:['#5a4a56','#d6a985'],actions:['「ともだちだよ」と いった！','しらない リンクを ふんだ！']}},
 maps
});
})();
