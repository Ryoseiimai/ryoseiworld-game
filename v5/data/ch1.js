// Chapter 1, ヒダマリちょう. Only data: the engine in index.html reads it through RYW.registerChapter.
(function(){'use strict';
const {object,person,prop,props}=RYW.helpers;
// A liked thing is offered once per person (SPEC_V6.md 2): only after their request is done and while it is in the bag; the flag gave_<id> stops the question.
const gift=(to,item,label,after)=>({if:after,then:[{if:{item,atLeast:1},then:[{if:{not:'gave_'+to},then:[{choice:label+'を あげる？',options:[{text:'あげる',then:[{gift:item,to},{flag:'gave_'+to}]},{text:'やめておく'}]}]}]}]});
// After BUG KING (SPEC_V5_CH234.md): Sora and RYOSEI make a tiny game on the old PC, and the item opens chapter 2.
// The bus runs it too, so a reload between the boss and the scene still gets the game before leaving town.
const makeGame=[{say:'makeGameAsk'},{warp:'room',at:[5,7]},{wait:300},{say:'makeGame'},{flash:'#fff4c8',ms:400},{wait:400},{give:'firstgame'},{flag:'gameMade'},{say:'makeGameDone'},{save:'quiet'}];
// Bus stops (SPEC_V5_CH234.md): the first ride ends chapter 1; after that the bus goes back and forth between the towns it has been to.
// Chapter 2 points its own bus stop at the same busStop event, so the stops are written once.
const busStops=[{text:'ヒダマリちょう',map:'town',at:[11,17.4]},{text:'ミナモちょう',map:'minamo',at:[11.6,31.4],if:'minamoVisited'}];
const maps={};
maps.town={name:'ヒダマリちょう',w:30,h:36,outside:true,spawn:[6,25.5],objects:[
 object('home','buildings',0,6,24,194,194,{label:'おうち',enter:'room',arrival:[5,11],firstDialogue:'foldBoard'}),
 object('store','buildings',1,22,24,200,190,{label:'コンビニ',enter:'store',arrival:[5,10]}),
 object('school','buildings',2,7,7,220,192,{label:'がっこう',dialogue:'school'}),
 object('electric','buildings',3,22,8,220,200,{label:'でんきや',enter:'electric',arrival:[5,14],lock:'key',lockedDialogue:'shutter',firstDialogue:'shutterOpen'}),
 object('junkyard','buildings',8,27,7.6,170,150),
 object('koban','buildings',4,7,16,175,162,{label:'こうばん',event:'policeBox'}),
 object('library','buildings',5,23,16,210,188,{label:'としょかん',dialogue:'library'}),
 object('apartment','buildings',6,20.5,33.6,190,190),
 object('shrine','buildings',7,26.5,33.6,150,135,{label:'じんじゃ',dialogue:'shrineSign'}),
 prop('sign',11,12,25,80,{dialogue:'signs'}),prop('machine',3,19,24,80,{dialogue:'vending'}),prop('post',6,10.4,24.8,70),prop('bus',13,12,16,90,{label:'バスてい',event:'busStop'}),prop('bike',8,3.4,24.7,80),prop('car',9,23.7,35.3,120),
 prop('flowers',10,1.8,21.4,100),prop('flowers2',10,1.4,34.8,100),prop('bench',4,6.9,32,90),prop('neko',15,27.6,34.6,70),prop('parksign',11,5,30.4,150,{sign:'こうえん'}),
 // Mio (npc2 frame 0) waits by the school; her lost dolphin hairclip is in the park sandbox (STORY_V4.md chapter 1).
 object('mio','npc2',0,10.4,8.2,48,65,{event:'mio'}),object('hairclip','spot',0,8.3,31.4,60,40,{hidden:true,label:'すなば',event:'hairclip',collider:false}),
 object('pond','spot',0,3.5,33.6,60,40,{hidden:true,label:'いけ',dialogue:'pond',collider:false}),
 ...props('hedge',2,100,[[1.2,30.5],[3.2,30.5],[9,30.5],[11,30.5]]),
 ...props('edge',2,100,Array.from({length:14},(_,i)=>[1.2+i*2.1,1.9]),{collider:false}),
 ...props('tree',0,130,[[2.6,5,1],[10.9,5.2],[2.8,7.8],[2,15,1],[27,12.5],[27.3,21,1],[0.9,35.2],[11.3,32.4,1]]),
 ...props('signal',12,110,[[12.5,8.9],[17.5,11.9],[17.5,16.9],[12.5,19.9],[17.5,25.9],[12.5,29.9]]),
 ...props('pole',7,130,[[12.5,4],[12.5,13.6],[12.5,22.6],[17.5,32.4],[9.5,19.6],[27.5,11.6]]),
 ...props('light',5,120,[[17.5,4.6],[17.5,13.6],[17.5,22.6],[12.5,32.4],[4.5,11.6],[24.5,29.6]]),
 ...[['mother',4.5,25.3,{event:'mother'}],['sister',8.5,25.3,{event:'sister'}],['grandpa',7.4,33.2],['worker',19.4,34.6],['student',18.8,25.4],['police',9,16.3,{event:'police'}],['dog',11,20],['cat',26,25],['grandma',3,22.6],['delivery',18,19.3],['kid',9.3,33.4,{event:'kid'}],['hacker',20,11.3,{event:'hacker'}],['shrine',24.4,34.4],['musician',10.6,34.6]].map(([id,x,y,extra])=>person(id,x,y,extra))],
 enemies:[{id:'v1',type:'vending',x:19,y:21.6,axis:'y'},{id:'c1',type:'crow',x:10.4,y:21.4,axis:'y'},{id:'p1',type:'popup',x:19.4,y:13.6,axis:'y'},{id:'c2',type:'crow',x:10.3,y:13.6,axis:'y'},{id:'v2',type:'vending',x:25.5,y:21.6,axis:'y'}],portals:[]};
// Terrain grid: . grass, = road, + sidewalk, : sand, ~ water. Rows 0-1 are the hedge edge; rows 30-35 hold the park and the apartments.
// Later towns can supply their own tile rows without changing movement/rendering.
maps.town.tiles=Array.from({length:36},(_,y)=>Array.from({length:30},(_,x)=>{
 if(y<2)return '.';
 if(x>=2&&x<=5&&y>=31&&y<=33)return '~';
 if(x>=8&&x<=10&&y>=31&&y<=34)return ':';
 if((x>=13&&x<=16)||(y>=26&&y<=28)||(y>=17&&y<=18)||(y>=9&&y<=10))return '=';
 if(x===12||x===17||y===25||y===29||y===16||y===19||y===8||y===11)return '+';
 return '.';
}).join(''));
maps.room={name:'じぶんの へや',w:11,h:14,spawn:[5,9],objects:[
 object('rug','interior',11,5,9.6,160,160,{floor:true,collider:false}),object('stairs','interior',15,5,13.2,110,110,{floor:true,collider:false}),
 object('clock','interior',14,2.6,1.9,70,70,{collider:false}),object('pc','interior',1,5,4.2,130,130,{label:'パソコン',dialogue:'pc',action:'save'}),object('shelf','interior',2,8.5,4.2,110,130),object('plant','interior',13,1.6,4.3,75,80),
 object('bed','interior',0,2.2,7.6,130,130,{label:'ベッド',dialogue:'bed',action:'rest'}),object('roomtv','interior',3,8.5,7.6,115,115,{label:'テレビ',dialogue:'roomTv',clearedDialogue:'roomTvClear'}),
 object('cushion','spot',0,9.3,11.2,60,40,{hidden:true,label:'ざぶとん',event:'cushion',collider:false})],enemies:[],portals:[{x:5,y:12,to:'town',at:[6,25.5]}]};
maps.store={name:'コンビニ・よるの かわ',short:'コンビニ',w:11,h:13,spawn:[5,10],objects:[
 object('clerk','npc',3,5.7,3.9,56,75,{event:'clerk'}),object('register','interior',6,5,4.8,150,150,{label:'レジ',dialogue:'clerk',action:'shop'}),
 object('snacks','interior',4,2,6,120,120,{label:'おかしの たな',dialogue:'snacks'}),object('fridge','interior',5,8.6,6,120,130,{label:'れいぞうこ',dialogue:'fridge'}),object('magazine','interior',7,2,9,100,100,{label:'ざっし',dialogue:'magazine'})],enemies:[],portals:[{x:5,y:11,to:'town',at:[22,25.3]}]};
maps.electric={name:'でんきや・ジャンクの おく',short:'でんきや・ジャンク',w:11,h:17,spawn:[5,14],objects:[
 object('sofa','interior',12,1.9,12.4,110,110),object('repair','npc',15,3.6,13.1,48,65,{event:'repair'}),
 object('server','interior',10,7,8,110,140,{label:'サーバー',action:'recruit',summon:'code',needs:'battery',needsDialogue:'serverLow',dialogue:'server',repeatDialogue:'codeIdle'}),
 object('boss','interior',9,5,4.5,190,190,{label:'テレビの やま',action:'boss',enemy:'bugking',requires:'code',dialogue:'boss',lockedDialogue:'bossLocked',clearedDialogue:'tv'}),
 object('junk1','props',14,2,9,60,63),object('junk2','interior',9,9,12,80,80)],enemies:[],portals:[{x:5,y:15,to:'town',at:[22,9.3]}]};
RYW.registerChapter({id:1,
// The key item from the closing scene: shown under どうぐ, not sold, not used in battle. Chapter 2 asks to show it (SPEC_V6.md 4).
items:{firstgame:{name:'はじめて つくった ゲーム',key:true,desc:'しかくが ジャンプすると\nピコッと なる。\nふたりの さくひん。'}},
// Bonds (SPEC_V6.md 2, STORY_V4.md): hearts 0-5 per person, raised by requests (events below), one liked thing, and story moments. rewards are given per heart count.
// Before BUG KING: mother 2, sister 2, repair 3 (rapid), kid 3 (twin), hacker 2, clerk 2. Mother reaches 3 (barrier) after the town is quiet.
// The hacker stops at 2 here: her rainbow and the whale come at heart 3 in chapter 3 (STORY_V4.md).
// Guardian spirits of people without bonds (SPEC_V6.md 1): a spirits frame (0-15) or a summon. The hacker's whale (summons) joins in chapter 3, so she shows the phone fox until then.
spirits:{grandpa:7,worker:1,student:2,police:4,grandma:14,delivery:8,shrine:10,musician:11},
bonds:{mother:{name:'おかあさん',kind:'family',spirit:'nao',likes:['rice'],rewards:{2:{money:100},3:{weapon:'barrier'},5:{weapon:'onigiri',money:200}}},
 sister:{name:'いもうと',kind:'family',spirit:0,likes:['drink'],rewards:{2:{money:50},4:{money:100}}},
 repair:{name:'しゅうりやさん',kind:'friend',spirit:'code',likes:['drink'],rewards:{2:{money:100},3:{weapon:'rapid'}}},
 kid:{name:'ゲームの こ',kind:'friend',spirit:15,likes:['rice'],rewards:{2:{money:60},3:{weapon:'twin'}}},
 hacker:{name:'ハッカーさん',kind:'friend',spirit:3,likes:['drink'],rewards:{2:{money:120},3:{weapon:'rainbow'}}},
 clerk:{name:'てんいんさん',kind:'friend',spirit:13,likes:['rice'],rewards:{2:{money:80}}},
 // Love (12-year-old style): returning the hairclip, then a paper letter after the town is quiet. Heart 3 and the dolphin wait for the rainy day in chapter 3, so her spirit shows the koi until then (like the hacker's fox).
 mio:{name:'ミオ',kind:'love',spirit:12,rewards:{2:{weapon:'letter'},5:{weapon:'charge'}}}},
// The police officer keeps the electric shop key until three noises are quiet (SPEC_V5.md). Written as event steps.
events:{
 // おつかい: mother asks for milk, the store clerk hands over the reserved bottle. After the town is quiet she says welcome home once.
 mother:[{if:'milkDone',then:[{if:'cleared',then:[{if:'momHome',then:[{say:'motherAfter'}],else:[{say:'motherHome'},{flag:'momHome'},{bond:'mother'}]}],else:[{say:'motherAfter'}]}],
  else:[{if:'milk',then:[{say:'motherMilk'},{flag:'milkDone'},{bond:'mother'}],else:[{say:'mother'},{flag:'milkAsk'}]}]},gift('mother','rice','おにぎり','milkDone')],
 // The lost remote is under the cushion in RYOSEI's room.
 sister:[{if:'remoteDone',then:[{say:'sisterAfter'}],else:[{if:'remote',then:[{say:'sisterRemote'},{flag:'remoteDone'},{bond:'sister'}],else:[{say:'sister'},{flag:'remoteAsk'}]}]},gift('sister','drink','エナジードリンク','remoteDone')],
 cushion:[{if:'remoteAsk',then:[{if:'remote',then:[{say:'cushion'}],else:[{say:'remoteFound'},{flag:'remote'}]}],else:[{say:'cushion'}]}],
 // The repair man lost a thin cable; the police box keeps it. Waking the server with him is a story moment.
 repair:[{if:{summon:'code'},then:[{if:{not:'repairServer'},then:[{say:'repairServer'},{flag:'repairServer'},{bond:'repair'}]}]},
  {if:'cableDone',then:[{say:'repairAfter'}],else:[{if:'cable',then:[{say:'repairCable'},{flag:'cableDone'},{bond:'repair'}],else:[{say:'repairAsk'},{flag:'cableAsk'}]}]},gift('repair','drink','エナジードリンク','cableDone')],
 policeBox:[{if:'cableAsk',then:[{if:'cable',then:[{say:'policeBoxEmpty'}],else:[{say:'policeBoxCable'},{flag:'cable'}]}],else:[{say:'policeBox'}]}],
 // Wi-Fi first (the password is on the store receipt), then a word about saving often.
 kid:[{if:'kidWifi',then:[{if:'kidSave',then:[{say:'kidAfter'}],else:[{say:'kidSaveAsk'},{choice:'セーブは いつ する？',options:[{text:'こまめに する',then:[{say:'kidSaveOk'},{flag:'kidSave'},{bond:'kid'}]},{text:'ぜんぶ おわってから',then:[{say:'kidSaveNo'}]}]}]}],
  else:[{say:'kid'},{choice:'パスワードは どこ？',options:[{text:'コンビニの レシート',then:[{say:'kidWifiOk'},{flag:'kidWifi'},{bond:'kid'}]},{text:'1234 で ためす',then:[{say:'kidWifi1234'}]},{text:'ゲームきを ふる',then:[{say:'kidWifiShake'}]}]}]},gift('kid','rice','おにぎり','kidWifi')],
 // The hacker asks RYOSEI to look at the snoring server; she thanks him once it is awake. The town coming back is only a line here.
 hacker:[{if:'hackerServer',then:[{if:'cleared',then:[{if:'hackerClear',then:[{say:'hackerAfter'}],else:[{say:'hackerClear'},{flag:'hackerClear'}]}],else:[{say:'hackerAfter'}]}],
  else:[{if:{summon:'code'},then:[{say:'hackerServer'},{flag:'hackerServer'},{bond:'hacker'}],else:[{say:'hacker'}]}]},gift('hacker','drink','エナジードリンク','hackerServer')],
 // The clerk keeps mother's milk and has a jammed receipt printer.
 clerk:[{if:'milkAsk',then:[{if:{not:'milk'},then:[{say:'clerkMilk'},{flag:'milk'}]}]},
  {if:'printerDone',then:[{say:'clerkAfter'}],else:[{say:'clerkPrinter'},{choice:'どう なおす？',options:[{text:'かみを いれなおす',then:[{say:'clerkPrinterOk'},{flag:'printerDone'},{bond:'clerk'}]},{text:'つよく たたく',then:[{say:'clerkPrinterHit'}]},{text:'あやまる',then:[{say:'clerkPrinterSorry'}]}]}]},gift('clerk','rice','おにぎり','printerDone')],
 mio:[{if:'clipDone',then:[{if:'cleared',then:[{if:'mioLetter',then:[{say:'mioAfter'}],else:[{say:'mioLetter'},{flag:'mioLetter'},{bond:'mio'}]}],else:[{say:'mioWait'}]}],
  else:[{if:'clip',then:[{say:'mioClip'},{flag:'clipDone'},{bond:'mio'}],else:[{say:'mio'},{flag:'clipAsk'}]}]}],
 hairclip:[{if:'clip',then:[{say:'sandbox'}],else:[{if:'clipAsk',then:[{say:'clipFound'},{flag:'clip'}],else:[{say:'sandboxShine'}]}]}],
 busStop:[{if:'minamoVisited',then:[{transport:'バス',copy:'どこへ いく？',stops:busStops}],else:[{if:'cleared',then:[{if:{not:'gameMade'},then:[...makeGame,{warp:'town',at:[11,17.4]}]},{say:'busRide'},{flag:'minamoVisited'},{chapterClear:true,copy:'バスは かわぞいの まちへ。\nポケットに はじめての ゲーム。'}],else:[{say:'busWait'}]}]}],
 police:[{if:'key',then:[{say:'police'}],else:[{if:{flag:'zakoWins',atLeast:'zakoGoal'},then:[{say:'policeGive'},{flag:'key'},{save:'quiet'}],else:[{say:'policeAsk'}]}]}]},
clearEvent:makeGame,town:'town',boss:'bugking',next:2,nextTitle:'ミナモちょう',title:'ヒダマリちょう',recruit:'code',clearDialogue:'clear',clearSpot:['town',22,9.3],zakoGoal:3,keyFlag:'key',serverItem:'battery',
  quests:{cleared:{text:'バスていから ミナモちょうへ いこう'},tutorial:{text:'しょうかんで ナオスライムを よぼう'},zako:{text:'まちの ノイズを しずめよう {n}/{goal}',dest:'enemy'},key:{text:'こうばんで カギを もらおう',dest:{map:'town',id:'police'}},battery:{text:'コンビニで バッテリーを かおう',dest:{map:'store',id:'register'}},recruit:{text:'でんきやの おくを しらべよう',dest:{map:'electric',id:'server'}},boss:{text:'テレビの おうさまに あいに いこう',dest:{map:'electric',id:'boss'}}},
 dialogue:{
 prologue:[['','なつやすみの よる。\nせんぷうきだけが\nはたらいていた。'],['RYOSEI','プリンターの しゅうり、おわり。\nおれの しゅくだいは\nおわらない。'],['','テレビも スマホも ザーッ。\nふるい パソコンだけが\nひかっている。'],['ソラ','なにを つくる?'],['RYOSEI','…せかいを なおす もの。']],
 welcome:[['ナオスライム','その ポケット、すんでいい？\nやちんは でんちで。'],['','ナオスライムが\nなかまに なった！'],['ソラ','まずは「しょうかん」で\nよんでみて。でんち15％で\nHPを なおせるよ。']],
 tutorialEnd:[['ソラ','HPが ころがる あいだは\nまだ まにあう。おぼえておこう。'],['','おもちゃの キーボードを\nもった。'],['ソラ','まちの ノイズを しずめながら\nでんきやへ いってみよう。']],
 mother:[['おかあさん','よるの おつかい？\nせかいも いいけど、\nぎゅうにゅうもね。'],['おかあさん','コンビニに とっておいて\nもらってるの。\nうけとってきて。']],
 motherMilk:[['','ぎゅうにゅうを わたした。'],['おかあさん','ありがとう。\nあしたの あさごはん、\nこれで かんせい。']],
 motherAfter:[['おかあさん','はやく ねなさいよ。\n…せかいが なおったら。']],
 motherHome:[['おかあさん','おかえり。\nテレビ、なおったね。'],['おかあさん','なにか したんでしょ。\nかおに かいてある。']],
 sister:[['いもうと','テレビの おうさま、えらそう。\nリモコン どこか\nしらないくせに。'],['いもうと','おにいちゃん、リモコン\nさがして。へやの\nすわる ところ かも。']],
 sisterRemote:[['','リモコンを わたした。'],['いもうと','あった！ …ざぶとんの した？\nだれが すわったの。'],['いもうと','…ありがと。']],
 sisterAfter:[['いもうと','リモコン、もう\nなくさない。たぶん。']],
 cushion:[['ざぶとん','ふかふか。\nすわると ねむくなる。']],
 remoteFound:[['','ざぶとんの したから\nリモコンが でてきた！']],
 repairAsk:[['しゅうりの おじさん','ほそい ケーブルを\nどこかで おとした。'],['しゅうりの おじさん','こうばんに とどいて\nないかなあ。']],
 repairServer:[['しゅうりの おじさん','サーバー、おきたか！\nいっしょに なおした\nなかだな。']],
 repairCable:[['','ケーブルを わたした。'],['しゅうりの おじさん','これこれ。\nこうばんに あったか。'],['しゅうりの おじさん','たすかった。\nおれいを しないとな。']],
 repairAfter:[['しゅうりの おじさん','ケーブルは ほそくても\nだいじな みちだ。']],
 policeBoxCable:[['こうばん','けいじばん：おとしもの\n「ほそい ケーブル 1ぽん」'],['おまわりさん','しゅうりやさんの？\nどうぞ。もっていって。'],['','ケーブルを うけとった。']],
 policeBoxEmpty:[['こうばん','けいじばん：おとしもの\n「いまは なし」']],
 kidWifiOk:[['','レシートの パスワードを\nいっしょに いれた。'],['ゲームの こ','つながった！\nきみ、てんさい？']],
 kidWifi1234:[['ゲームの こ','それ、みんなが\nさいしょに ためすやつ。'],['ゲームの こ','だから だめなんだって。']],
 kidWifiShake:[['ゲームの こ','ふっても でない。\nジュースじゃ ないから。']],
 kidSaveAsk:[['ゲームの こ','ねえ、セーブって\nいつ すれば いいの？']],
 kidSaveOk:[['ゲームの こ','こまめに か。\nげんじつにも セーブ\nあれば いいのに。']],
 kidSaveNo:[['ゲームの こ','それで きのう\nよるに なったんだ。']],
 kidAfter:[['ゲームの こ','いま セーブした。\nいまも セーブした。']],
 hackerServer:[['ハッカーの おねえさん','いびきが とまった。\nきみが おこしたの？'],['ハッカーの おねえさん','やるじゃん。\nこんど いっしょに なにか\nつくろうか。']],
 hackerClear:[['ハッカーの おねえさん','まちの ノイズ、はれたね。'],['ハッカーの おねえさん','ログに のこってた。\nきみの なまえも。']],
 hackerAfter:[['ハッカーの おねえさん','ねむい サーバーは\nやさしく おこすのが\nこつ。']],
 mio:[['ミオ','あ、おなじ クラスの\nRYOSEIくん。'],['ミオ','イルカの かみどめ、\nかたほう おとしちゃった。'],['ミオ','こうえんで あそんでた\nとき かも。']],
 mioClip:[['','イルカの かみどめを\nわたした。'],['ミオ','あった！ これ、\nふたつで ひとつなの。'],['ミオ','…ありがと。\nおれいに てがみ かくね。'],['ミオ','メールじゃ ないよ。\nかみの やつ。']],
 mioWait:[['ミオ','てがみ、かいたけど\nまだ わたせない。'],['ミオ','まちの ノイズが\nはれたら わたすね。']],
 mioLetter:[['ミオ','はい、これ。\nいま よまないでね。'],['','ミオから てがみを\nもらった。'],['RYOSEI','よまないで って いわれると\nよみたく なる。'],['ミオ','いえで よんで！']],
 mioAfter:[['ミオ','イルカ、ふたつ そろうと\nなかよしに みえるでしょ。']],
 clipFound:[['','すなの なかで\nなにか ひかった。'],['','イルカの かみどめを\nひろった！']],
 sandboxShine:[['すなば','すなの なかで\nなにか ひかった。'],['すなば','…だれかの おとしもの\nかも。']],
 sandbox:[['すなば','よるの すなばは\nしずか。']],
 clerkMilk:[['コンビニの ひと','おかあさんの\nぎゅうにゅう？\nとっておいたよ。'],['','ぎゅうにゅうを うけとった。']],
 clerkPrinter:[['コンビニの ひと','レシートの プリンターが\nとまっちゃった。'],['コンビニの ひと','かみが ななめに\nなってる みたい。']],
 clerkPrinterOk:[['','かみを まっすぐ\nいれなおした。'],['コンビニの ひと','うごいた！\nきみ、ここで はたらく？']],
 clerkPrinterHit:[['コンビニの ひと','たたくと おこるよ。\nプリンターも わたしも。']],
 clerkPrinterSorry:[['コンビニの ひと','きみの せいじゃ ないよ。\nかみの せい。']],
 clerkAfter:[['コンビニの ひと','レシート、ちゃんと でる。\nパスワードも でる。']],
 grandpa:[['おじいさん','じはんきに あたりが でた。\nじはんきの ほうが\nあたってきた。']],
 clerk:[['コンビニの ひと','Wi-Fiの パスワード？\n「よるの かわ　ほしを ひとつ\nおにぎり」'],['コンビニの ひと','ぜんぶ ローマじ。\nくうはく なし。\n…レシートにも かいてあるよ。']],
 worker:[['かいしゃいん','かえります、と メールした。\nいすから へんじが きた。\n「だめ」']],
 student:[['スマホの おねえさん','じどりが ぜんぶ おにぎり。\nこの かど、ちょっと\nわたしに にてる。']],
 police:[['おまわりさん','まいごの ノイズを\nあずかってます。'],['おまわりさん','なまえを きくと\nザーッて いう。']],
 policeAsk:[['おまわりさん','でんきやの カギ？\nええ、あずかってます。'],['おまわりさん','でも まちの ノイズが\nうるさくて さがせない。'],['おまわりさん','ノイズを 3つ しずめたら\nわたします。']],
 policeGive:[['おまわりさん','…あれ、まちが しずかに。\nきみの しわざですね。'],['おまわりさん','でんきやの カギ、\nあずかってました。'],['','でんきやの カギを もらった！'],['おまわりさん','しゅうりの おじさんに\nよろしく。']],
 policeBox:[['こうばん','けいじばん：おとしもの\n「ほそい ケーブル 1ぽん」']],
 dog:[['しばいぬ','ワン。\n（つうしん りょうきんは\nかからない）']],
 cat:[['くろねこ','……。\n（さいきどうは\nしない ほうしん）']],
 grandma:[['となりの おばあさん','プリンター、なおったよ。\nねこまで コピー\nしなくて よかった。']],
 delivery:[['はいたつの おにいさん','おとどけものです。\n「みらい」さま。\nじゅうしょが ざつ。']],
 kid:[['ゲームの こ','セーブしてないのに\nよるに なった。\nげんじつ、ふべん。'],['ゲームの こ','ゲームきの Wi-Fiも\nつながらない。']],
 hacker:[['ハッカーの おねえさん','でんきやの おくの\nサーバーが いびき かいてる。'],['ハッカーの おねえさん','コードラゴンって\nねごとで いってた。'],['ハッカーの おねえさん','ようすを みてきて\nくれない？']],
 shrine:[['じんじゃの ひと','おさいせんばこは\nオフラインです。\nきょうも つよい。']],
 musician:[['うたう ひと','ラララ。ラララ。\nここだけ まだ\nダウンロードちゅう。']],
 repair:[['しゅうりの おじさん','おくの サーバー、\nたたくと おこるぞ。'],['しゅうりの おじさん','はなしかけると もっと おこる。\nねおきだ。']],
 shutter:[['','シャッターが しまっている。'],['はりがみ','ジャンクの カギは\nこうばんに あずけた。しゅうりや']],
 shutterOpen:[['','カギで シャッターを あけた。'],['しゅうりの おじさん','おっ、カギ。おまわりさんから？\nおくの サーバー、ねぼすけでね。']],
 serverLow:[['ふるい サーバー','ぐう。…でんきが たりない。'],['ソラ','モバイルバッテリーが あれば\nおきるかも。']],
 server:[['','モバイルバッテリーを つないだ。'],['ふるい サーバー','ぐう。…コンパイル おわった？'],['ソラ','コードラゴンだ。\nせなかに ねぐせの\nカッコが ある。'],['','コードラゴンが\nなかまに なった！',{show:'code'}],['','でんち25％で\nコードの ブレス。'],['コードラゴン','テレビの おうさまに\nあいさつしよう。\nちょっと あつい あいさつ。']],
 boss:[['','テレビの やまが\nザーッと ひかった。'],['BUG KING','どうせ お前には むりだ'],['RYOSEI','…テレビで いうと ちょっと\nせっとくりょく あるな。']],
 clear:[['','テレビの ゆきが やんだ。\nてんきよほうは、あしたも はれ。'],['しゅうりの おじさん','なおったか。\nリモコンの フタも\nついでに たのむ。'],['ソラ','つぎの まちも\nノイズに のまれてる。'],['RYOSEI','じゃあ、じゅうでん してから。']],
 signs:[['かんばん','← おうち　　コンビニ →\n↑ でんきや　↓ こうえん']],
 library:[['としょかん','ほんじつ きゅうかん。\nみずべの ぶんかんで\nおまちしてます。']],
 school:[['がっこう','なつやすみです。\nしゅくだいは\nなつやすみでは ありません。']],
 vending:[['じはんき','つめた〜い　あたたか〜い\nよく わからな〜い（うりきれ）']],
 bed:[['','ひとねむりした。\nHPと でんちが もどった。']],
 pc:[['ソラ','ここから\nつづけられるように しよう。']],
 pond:[['いけ','さかなは オフラインで\nおよいでいる。']],
 shrineSign:[['おみくじ','きょうの うんせい：ちゅうきち。\nラッキーアイテム：ほぞん。']],
 codeIdle:[['コードラゴン','ねぐせも コードの うち。']],
 lift:[['','フクの ちからで\nキックボードの\nしゃりんが ひかった。'],['ソラ','うかんでる！\nこのまま いこう！']],
 bossRetreat:[['ソラ','まちに もどったよ。\nじゅんびして また こよう。']],
 bossLocked:[['ソラ','さきに サーバーに\nはなしかけよう。'],['ソラ','ひとりで ねむってる\nこが いる。']],
 defeated:[['ソラ','さいごに ほぞんした ところから\nやりなおそう。']],
 tv:[['テレビの やま','おうさまの いない テレビ。\nねこの とくしゅうを\nやっている。']],
 foldBoard:[['おかあさん','いえの なかでは\nキックボード たたみなさい'],['','キックボードを たたんで\nわきに かかえた。']],
 roomTv:[['テレビ','ザーッ。…ときどき\nおうかんの かげが うつる。']],
 roomTvClear:[['テレビ','ねこの とくしゅう。\nノイズは もう ない。']],
 fridge:[['れいぞうこ','ツナマヨが ノイズで\nツナマヨマヨに なってる。']],
 snacks:[['おかしの たな','ポテチの ふくろが\nぜんぶ「よみこみちゅう」。']],
 magazine:[['ざっし','ひょうしの ひとが\nまばたき している。']],
 zakoWin:[['','{name}は\nしゅうりされた。'],['','{exp}けいけんちと\n{money}えんを もらった。']],
 zakoLeft:[['ソラ','ノイズが ひとつ しずまった。\nあと {n}つ。']],
 zakoDone:[['ソラ','まちが しずかに なってきた。\nこうばんに いこう。']],
 makeGameAsk:[['ソラ','でかける まえに\nひとつ つくって みない？'],['RYOSEI','なにを？'],['ソラ','ちいさな ゲーム。\nいえの パソコンで。']],
 makeGame:[['','ふるい パソコンに\nふたりで むかった。'],['ソラ','しゅじんこうは しかく。\nてきも しかく。'],['RYOSEI','ぜんぶ しかくじゃん。'],['ソラ','ボタンを おすと\nジャンプして\nおとが なる。'],['','ピコッ。'],['RYOSEI','…なった。\nおれが つくった おとだ。']],
 makeGameDone:[['','はじめて つくった\nゲームが できた！'],['ソラ','だれかに みせたく\nなったら みせよう。'],['ソラ','バスで となりの\nミナモちょうへ いこう。'],['ソラ','バスていは\nこうばんの よこだよ。']],
 busWait:[['バスてい','つぎの バスは\nノイズが はれてから。'],['ソラ','いまは まちを\nなおすのが さき。']],
 busRide:[['','バスに のった。'],['ソラ','つぎは ミナモちょう。\nかわぞいの まちだって。'],['RYOSEI','まどの そと、\nだれも あるいてない。']],
 levelUp:[['','レベル {lv} に なった！\nHP+{hp} こうげき+{atk}']]
 },
 enemies:{vending:{name:'バグったじはんき',frame:0,hp:38,attack:7,exp:12,money:30,level:1,color:['#334d66','#b99879'],actions:['おつりを とばした！','ぬるい おちゃを こぼした！']},crow:{name:'グリッチカラス',frame:1,hp:30,attack:6,exp:10,money:24,level:1,color:['#384b63','#839885'],actions:['いちコマ とんだ！','つつく ばしょを まちがえた！']},popup:{name:'ポップアップおばけ',status:'ちらつき',frame:3,hp:45,attack:9,exp:16,money:38,level:2,color:['#594065','#bd867a'],actions:['「はい」を おすすめした！','まどを ひとつ ふやした！']},bugking:{name:'BUG KING',boss:true,art:'bugking',animCols:3,specialEvery:3,specialDamage:5,hp:280,attack:12,exp:60,money:200,level:4,color:['#493857','#c49362'],actions:['エラーを はきだした！','チャンネルを まわした！','ノイズの おうかんが ひかった！'],bursts:[[.75,'// あとで直す'],[.5,'TODO: エラー処理'],[.25,'とりあえず動いた'],[0,'いつか だれかの やくに たつはず']]}},
 maps
});
})();
