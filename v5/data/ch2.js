// Chapter 2, ミナモちょう. Only data: the engine in index.html reads it through RYW.registerChapter.
// The riverside town (SPEC_V5_CH234.md): parents watch their phones, children stay in, and worry walls stand on the paths.
// R20: the town, its people and noises. The library quiz and Search Owl come with R21, the boss with R22.
(function(){'use strict';
const {object,prop,props}=RYW.helpers;
const maps={};
// Worry walls have no picture yet (autodev/ART_REQUESTS.json worry_wall); the engine draws a grey block with eyes until it comes.
const wall=(id,x,y)=>object(id,'worry',0,x,y,110,84,{label:'しんぱいの かべ',dialogue:'worryWall'});
maps.minamo={name:'ミナモちょう',short:'ミナモ',w:30,h:36,outside:true,spawn:[11.6,31.4],objects:[
 object('minamo_house1','buildings',0,6,15.4,194,194),
 object('minamo_house2','buildings',0,22,15.4,194,194),
 object('minamo_library','buildings',5,22,26.2,210,188,{label:'としょかん',enter:'minamo_library',arrival:[5,11]}),
 object('minamo_friend','buildings',0,6,34,194,194,{label:'ともだちの いえ',enter:'minamo_friend',arrival:[5,10]}),
 object('minamo_apartment','buildings',6,23,34,190,190),
 prop('minamo_bus',13,12.4,30.4,90,{label:'バスてい',event:'busStop'}),
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
 // People: a tired father at the park, a mother who keeps her son in, the dog, the grandpa is in the library.
 object('minamo_dad','npc2',6,11,18.9,48,65,{dialogue:'minamoDad'}),
 object('minamo_mom','npc2',8,9.6,33.8,48,65,{dialogue:'minamoMom'}),
 object('minamo_dog','npc',7,4.4,25.4,56,60,{dialogue:'minamoDog'})],
 enemies:[{id:'ms1',type:'spam',x:20,y:22.6,axis:'y'},{id:'mc1',type:'cable',x:7,y:12.2,axis:'x'},{id:'mn1',type:'maskcat',x:24.4,y:31.4,axis:'x'},{id:'ms2',type:'spam',x:5.6,y:23.4,axis:'x'}],portals:[]};
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
 object('ml_search','interior',1,5.7,4.4,120,120,{label:'けんさくの きかい',dialogue:'searchMachine'}),
 object('ml_plant','interior',13,1.6,8.4,75,80),object('ml_clock','interior',14,5.7,1.9,70,70,{collider:false}),
 object('minamo_grandpa','npc',2,3.4,7.6,56,75,{event:'minamoGrandpa'})],
 enemies:[],portals:[{x:5,y:12.4,to:'minamo',at:[22,27.6]}]};
// The friend's house: the boy who may not go out.
maps.minamo_friend={name:'ともだちの いえ',w:11,h:13,spawn:[5,10],objects:[
 object('mf_rug','interior',11,5,9,160,160,{floor:true,collider:false}),
 object('mf_tv','interior',3,8.5,4.2,115,115,{label:'テレビ',dialogue:'friendTv'}),object('mf_sofa','interior',12,2.2,5.2,110,110),object('mf_plant','interior',13,9.4,8.4,75,80),
 object('minamo_boy','npc2',7,4.6,6.8,48,65,{dialogue:'minamoBoy'})],
 enemies:[],portals:[{x:5,y:11.4,to:'minamo',at:[6,35.4]}]};
RYW.registerChapter({id:2,title:'ミナモちょう',town:'minamo',boss:'kateino',recruit:'owl',zakoGoal:3,keyFlag:'minamoKey',serverItem:'firstgame',zakoDone:'minamoZakoDone',
 // __v5.debugStartChapter(2): the bus has run once and the first game is in the pocket.
 debugStart:{items:{firstgame:1},flags:{gameMade:true,minamoVisited:true}},
 // People without bonds yet (bonds come with their stories in R21-R22).
 spirits:{minamo_dad:5,minamo_mom:6,minamo_boy:2,minamo_grandpa:9},
 quests:{cleared:{text:'まちに こえが もどった。'},tutorial:{text:'しょうかんで ナオスライムを よぼう'},
  zako:{text:'まちの ノイズを しずめよう {n}/{goal}',dest:'enemy'},
  key:{text:'としょかんの おじいちゃんへ',dest:{map:'minamo_library',id:'minamo_grandpa'}},
  battery:{text:'としょかんの おじいちゃんへ',dest:{map:'minamo_library',id:'minamo_grandpa'}},
  recruit:{text:'けんさくの きかいを しらべよう',dest:{map:'minamo_library',id:'ml_search'}},
  boss:{text:'しんぱいの かべの おくへ いこう'}},
 events:{
  // The grandpa keeps the library open. Once three noises are quiet he lets RYOSEI use the search machine.
  minamoGrandpa:[{if:'minamoKey',then:[{say:'grandpaAfter'}],else:[{if:{flag:'zakoWins',atLeast:'zakoGoal'},then:[{say:'grandpaKey'},{flag:'minamoKey'},{save:'quiet'}],else:[{say:'grandpaAsk'}]}]}]
 },
 dialogue:{
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
  minamoZakoDone:[['ソラ','ノイズが へってきた。\nとしょかんに いこう。']]
 },
 // Street noises of the riverside town (enemies sheet: 2 spam mail, 4 leaking cable, 8 masked cat). A little stronger than chapter 1.
 enemies:{spam:{name:'スパムメールのむれ',frame:2,hp:58,attack:10,exp:20,money:36,level:5,color:['#4b4d66','#c9b98f'],actions:['「あたりました！」を おくってきた！','おなじ メールを 30つう おくった！']},
  cable:{name:'ろうでんケーブル',frame:4,hp:66,attack:12,exp:24,money:42,level:6,color:['#2f4a52','#d9b45a'],actions:['ビリッと はねた！','からまって きた！']},
  maskcat:{name:'なりすましネコ',frame:8,hp:52,attack:11,exp:22,money:40,level:5,color:['#5a4a56','#d6a985'],actions:['「ともだちだよ」と いった！','しらない リンクを ふんだ！']}},
 maps
});
})();
