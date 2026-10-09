// Chapter 2, ミナモちょう. Only data: the engine in index.html reads it through RYW.registerChapter.
// R19 lays the first stones: the town, the bus stop back to ヒダマリちょう and a sign. People, walls, noises and the boss come with R20-R22.
(function(){'use strict';
const {prop,props}=RYW.helpers;
const maps={};
maps.minamo={name:'ミナモちょう',short:'ミナモ',w:20,h:20,outside:true,spawn:[10,13.4],objects:[
 prop('minamo_bus',13,9,12.4,90,{label:'バスてい',event:'busStop'}),
 prop('minamo_sign',11,13,12.4,80,{dialogue:'minamoSign'}),
 ...props('minamo_tree',0,130,[[2.4,9],[17.6,9,1],[3,17.4,1],[16.8,17.6]]),
 ...props('minamo_light',5,120,[[6,12.2],[15,12.2]]),
 ...props('minamo_edge',2,100,Array.from({length:9},(_,i)=>[1.2+i*2.2,1.9]),{collider:false})],
 enemies:[],portals:[]};
// Terrain: the river runs across the top, the street below it, the sidewalk along the bus stop.
maps.minamo.tiles=Array.from({length:20},(_,y)=>Array.from({length:20},()=>{
 if(y<2)return '.';
 if(y>=4&&y<=6)return '~';
 if(y===7||y===12)return '+';
 if(y>=13&&y<=14)return '=';
 return '.';
}).join(''));
RYW.registerChapter({id:2,title:'ミナモちょう',town:'minamo',boss:'kateino',recruit:'owl',zakoGoal:3,keyFlag:'minamoKey',serverItem:'battery',
 // __v5.debugStartChapter(2): the bus has run once and the first game is in the pocket.
 debugStart:{items:{firstgame:1},flags:{gameMade:true,minamoVisited:true}},
 quests:{cleared:{text:'まちに こえが もどった。'},tutorial:{text:'しょうかんで ナオスライムを よぼう'},zako:{text:'まちを あるいて みよう'},key:{text:'まちを あるいて みよう'},battery:{text:'まちを あるいて みよう'},recruit:{text:'まちを あるいて みよう'},boss:{text:'まちを あるいて みよう'}},
 // The bus stop uses chapter 1's busStop event (ch1.js), which lists both towns once minamoVisited is set.
 // boss kateino and recruit owl are filled in by R21-R22; until then the chapter cannot be cleared.
 dialogue:{
  minamoSign:[['かんばん','ようこそ ミナモちょう。\nかわと はしの まち。'],['ソラ','しずかすぎる。\nそとに だれも いない。']]
 },
 maps
});
})();
