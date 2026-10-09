// Chapter 3, ネオンシティ. Only data: the engine in index.html reads it through RYW.registerChapter.
// R37: only the station square, so the chapter 2 card can go on to chapter 3. The town, its people and the noises come in R23.
(function(){'use strict';
const {prop,props}=RYW.helpers;
const maps={};
maps.neon={name:'ネオンシティ',short:'ネオン',w:20,h:18,outside:true,spawn:[10,12.4],objects:[
 prop('neon_station',13,7.8,11.2,90,{label:'えき',event:'trainStop'}),
 prop('neon_sign',11,12.4,11,80,{dialogue:'neonSign'}),
 ...props('neon_light',5,120,[[4.5,8.6],[15.5,8.6],[4.5,15.6],[15.5,15.6]]),
 ...props('neon_edge',2,100,Array.from({length:9},(_,i)=>[1.2+i*2.1,1.9]),{collider:false})],
 enemies:[],portals:[]};
// Terrain: the station square is all sidewalk with a road through the middle (R23 makes the whole town).
maps.neon.tiles=Array.from({length:18},(_,y)=>Array.from({length:20},(_,x)=>y<2?'.':(y>=13&&y<=14)?'=':'+').join(''));
const wait={text:'まちを みて まわろう'};
RYW.registerChapter({id:3,title:'ネオンシティ',town:'neon',zakoGoal:3,
 // __v5.debugStartChapter(3): chapters 1 and 2 are done and the train runs.
 debugStart:{items:{firstgame:1},flags:{gameMade:true,minamoVisited:true,minamoCleared:true,neonVisited:true}},
 quests:{cleared:wait,tutorial:wait,zako:wait,key:wait,battery:wait,recruit:wait,boss:wait},
 dialogue:{
  neonSign:[['かんばん','ようこそ ネオンシティ。\nひかりと かずの まち。'],['ソラ','みんなの あたまに\nかずが うかんでる…？']]},
 maps
});
})();
