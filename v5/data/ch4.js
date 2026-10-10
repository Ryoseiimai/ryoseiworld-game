// Chapter 4, ノイズのとう. Only data: the engine in index.html reads it through RYW.registerChapter.
// R27: 3 floors + rooftop (SPEC_V5_CH234.md 4章). The floor is a blue grid (ground() tile char 'g' in index.html).
// Small objects use the 'tower' sheet (v5/assets/tower, 4x4): 0 server rack, 1 cables, 2 glitch cube, 3 chart hologram,
// 4 crystal beacon, 5 broken CRT, 6 cloud platform, 7 energy pillar, 8 locked vault, 9 fan, 10 data pillar,
// 11 floppy stack, 12 pipe corner, 13 cloud puff, 14 save kiosk, 15 glowing gate.
(function(){'use strict';
const {object,prop}=RYW.helpers;
const tower=(id,frame,x,y,w,h,extra)=>object(id,'tower',frame,x,y,w,h,extra);
// Every floor is the same small room (w:11,h:13), all floor tiles 'g' for the blue grid.
const grid=Array.from({length:13},()=>'g'.repeat(11));
const maps={};
maps.tower1={name:'ノイズのとう 1かい',short:'とう1F',w:11,h:13,spawn:[5,10],tiles:grid,objects:[
 object('tw1_guide','npc2',4,2.2,7.4,48,65,{label:'あんないロボ',dialogue:'towerGuide'}),
 tower('tw1_save',14,8.4,6.2,90,100,{label:'セーブたんまつ',dialogue:'towerSave',action:'save'}),
 tower('tw1_rack',0,8.4,9.4,80,90),tower('tw1_cable',1,2.2,9.6,80,80),
 tower('tw1_up',6,8.4,2.6,90,90,{label:'ひかりの ゆか'})],
 enemies:[{id:'tz1',type:'virusball',x:5,y:6.6,axis:'x'}],
 portals:[{x:5,y:11.4,to:'neon',at:[15,5.4]}],
 // R27: ひかりの ゆか (up pad) is always at (8.4,2.6), the down pad at (2.2,2.6); landing always on the next floor's spawn.
 cells:[{x:8.4,y:2.6,warp:'tower2',at:[5,10]},
  // R27: コトバイルカが まだ 仲間でなければ、入口の すこし おくで 仲間になる（neon_cloudgate からの arrival からは離してあるので、着いた直後には動かない）。
  {x:5,y:8.6,trigger:'towerEntrance',once:'towerEntranceSeen'}]};
maps.tower2={name:'ノイズのとう 2かい',short:'とう2F',w:11,h:13,spawn:[5,10],tiles:grid,objects:[
 tower('tw2_save',14,8.4,6.2,90,100,{label:'セーブたんまつ',dialogue:'towerSave',action:'save'}),
 tower('tw2_cube',2,2.2,9.4,80,80),tower('tw2_floppy',11,8.4,9.6,70,70),tower('tw2_fan',9,2.2,6.4,80,80),
 tower('tw2_down',6,8.4,2.6,90,90,{label:'ひかりの ゆか'}),tower('tw2_up',6,2.2,2.6,90,90,{label:'ひかりの ゆか'})],
 enemies:[{id:'tz2a',type:'crow2',x:4,y:6.6,axis:'x'},{id:'tz2b',type:'infload2',x:7,y:9.6,axis:'y'}],
 portals:[],cells:[{x:2.2,y:2.6,warp:'tower1',at:[5,10]},{x:8.4,y:2.6,warp:'tower3',at:[5,10]}]};
maps.tower3={name:'ノイズのとう 3かい',short:'とう3F',w:11,h:13,spawn:[5,10],tiles:grid,objects:[
 tower('tw3_save',14,8.4,6.2,90,100,{label:'セーブたんまつ',dialogue:'towerSave',action:'save'}),
 tower('tw3_chart',3,2.2,9.4,80,80),tower('tw3_crystal',4,8.4,9.6,70,90),tower('tw3_vault',8,2.2,6.4,80,90),
 tower('tw3_down',6,8.4,2.6,90,90,{label:'ひかりの ゆか'}),tower('tw3_up',6,2.2,2.6,90,90,{label:'ひかりの ゆか'})],
 enemies:[{id:'tz3',type:'virusball',x:5,y:6.6,axis:'x'}],
 portals:[],cells:[{x:2.2,y:2.6,warp:'tower2',at:[5,10]},{x:8.4,y:2.6,warp:'tower_roof',at:[5,10]}]};
maps.tower_roof={name:'ノイズのとう おくじょう',short:'おくじょう',w:11,h:13,spawn:[5,10],tiles:grid,objects:[
 tower('twr_save',14,8.4,6.2,90,100,{label:'セーブたんまつ',dialogue:'towerSave',action:'save'}),
 tower('twr_pillar',7,5,5,110,140),tower('twr_cloud1',13,8.6,9.4,70,70),
 // R28: the rooftop gate is now the ジブン boss fight (liftOff -> shooter.js jibun). goneWhenCleared matches the hikaku pattern (R26).
 tower('twr_gate',15,5,2.6,110,130,{label:'ひかる もん',action:'boss',enemy:'jibun',dialogue:'jibunTalk',clearedDialogue:'jibunGone',goneWhenCleared:true}),
 // R29: a second, fainter door for ゼロ. requiresBoss keeps it locked until ジブン is beaten (jibun.winEvent pushes 'jibun' into g.bosses).
 tower('twr_gate2',15,7.4,2.6,90,110,{label:'かすかな ひかり',action:'boss',enemy:'zero',requiresBoss:'jibun',dialogue:'zeroTalk',lockedDialogue:'zeroLocked',clearedDialogue:'zeroGone',goneWhenCleared:true}),
 tower('twr_down',6,2.2,2.6,90,90,{label:'ひかりの ゆか'})],
 enemies:[],portals:[],cells:[{x:2.2,y:2.6,warp:'tower3',at:[5,10]}]};
RYW.registerChapter({id:4,title:'ノイズのとう',town:'tower1',zakoGoal:3,
 // R29: ジブンに勝っても まだ 章は終わらない（jibun.winEvent が jibunWin を走らせるだけ）。章の ほんとうの ボスは ゼロ。
 boss:'zero',clearDialogue:'zeroClear',clearSpot:['tower_roof',5,4],clearEvent:'zeroJoin',
 recruit:'kotoba',
 debugStart:{items:{firstgame:1},flags:{gameMade:true,minamoVisited:true,minamoCleared:true,neonVisited:true}},
 quests:{cleared:{text:'とうの なかが しずかに なった。'},tutorial:{text:'よびだすで ナオスライムを よぼう'},
  // コトバイルカは入口で自動で仲間になるので、仲間がそろった時点で すぐ 'boss' に進む。
  boss:{text:'とうの いちばん うえを めざそう'},
  zako:{text:'とうの ノイズを しずめよう {n}/{goal}',dest:'enemy'},
  key:{text:'うえの かいへ すすもう'},battery:{text:'うえの かいへ すすもう'},recruit:{text:'うえの かいへ すすもう'}},
 events:{
  // R27: 入口の少し奥で、コトバイルカが まだ 仲間でなければ 仲間になる（SPEC_V5_CH234.md「入口で コトバイルカ が仲間になる」）。
  towerEntrance:[{if:{summon:'kotoba'},then:[{say:'towerEntranceIdle'}],
   else:[{say:'towerEntranceAsk'},{join:'kotoba'},{proto:'text'},{say:'towerEntranceJoin'},{save:'quiet'}]}],
  // R29: ジブンに勝った後。章は まだ 終わらず、ゼロの もんが あくだけ（jibunClear の最後の行で予告する）。
  jibunWin:[{say:'jibunClear'}],
  // R29: ゼロに勝った後（STORY_V4.md「最後はみんなの守護霊が…」）。ゼロが仲間になり、章が終わる。
  // R30: 章が終わったら すぐ タイトルへ ではなく、3つの町の 直った様子 → エピローグ（SPEC_V5_CH234.md 4章）。
  // 背景は shooter.js の bg_town/bg_minamo/bg_neon をそのまま使う（新しい絵を依頼せず、ある絵で「見せる」を満たす）。
  zeroJoin:[{join:'zero'},{save:'quiet'},{finale:{towns:[
   {heading:'ヒダマリちょう',bg:'bg_town',copy:'あかりが もどり、\nこうえんで みんなが\nあそんでいる。'},
   {heading:'ミナモちょう',bg:'bg_minamo',copy:'しんぱいの かべが きえて、\nおやこで さんぽ している。'},
   {heading:'ネオンシティ',bg:'bg_neon',copy:'かおの いろが もどり、\nすきな ものの はなしを\nしている。'}
  ]}}]
 },
 dialogue:{
  towerGuide:[['あんないロボ','ようこそ\nノイズの とうへ。'],['あんないロボ','ひかりの ゆかで\nかいを いどうできます。']],
  towerSave:[['たんまつ','ここまでの きろくを\nほぞんしました。']],
  towerEntranceAsk:[['','いりぐちの おくで\nなにかが ひかった。'],['','ちいさな イルカが\nそばに よってきた。']],
  towerEntranceJoin:[['','コトバイルカが\nなかまに なった！'],['ソラ','これで ノイズの ことばが\nわかるように なるね。']],
  towerEntranceIdle:[['あんないロボ','イルカが となりで\nねむっていますね。']],
  // R28: おくじょうの もんの むこうに ジブンが立っている（STORY_V4.md「ノイズのとう: これまでの人の守護霊が力を貸す。ジブン→ゼロ」）。
  jibunTalk:[['ジブン','やめても\nだれも こまらないよ。'],['ソラ','たまは とどかないよ。\n「つくる」の\nひかりを とろう！']],
  // R29: ジブンはもう べつの すがたでは なく、話し手は ナレーション扱い（すがたが ない）。
  jibunGone:[['','……おなじ いろに\nなった。']],
  jibunClear:[['','ジブンが おなじ\nいろに なった。'],['ソラ','きのうより ひとつ\nすすんだね。'],['ソラ','つぎは ゼロが いる\nみたいだ。']],
  // R29: ゼロの もん（STORY_V4.md「ゼロは、守護霊を持たないまま捨てられたAI」）。
  zeroTalk:[['','かすかに ひかる ものが\nまだ うごいている。'],['ソラ','こうげきが きかないよ。'],['ソラ','みんなの「こえ」を\nあつめよう。']],
  zeroLocked:[['','ひかりは まだ\nとどかないみたい。']],
  zeroGone:[['ゼロ','……ありがとう。']],
  zeroClear:[['ゼロ','……だれも ぼくを\nつかって くれなかった。'],['RYOSEI','いっしょに\nつくろう。'],['ゼロ','……うん。']]},
 enemies:{
  // R27: SPEC_V5_CH234.md「ウイルスだま・グリッチカラス・むげんローディング（色を暗くした強い版）」。
  // あたらしい絵は依頼中で、とどくまでは ちかい すがたの コマを くらい いろで ながす（RULES.md 4）。
  virusball:{name:'ウイルスだま',frame:3,hp:86,attack:14,exp:34,money:52,level:9,color:['#1c1430','#7a5ad9'],hints:["ぷるぷる ふるえる","はねて くる"],actions:['ぷるぷる ふるえた！','おおきく はねて きた！']},
  crow2:{name:'グリッチカラス',frame:1,hp:78,attack:13,exp:32,money:48,level:9,color:['#161f30','#5f7aa8'],hints:["いちコマ とぶ","するどく つつく"],actions:['くらやみで いちコマ とんだ！','するどく つついて きた！']},
  infload2:{name:'むげんローディング',frame:5,hp:90,attack:15,exp:36,money:54,level:9,color:['#141c2c','#45597a'],hints:["くるくる まわる","おわらない バー"],actions:['くらく ぐるぐる まわった！','バーが すすんで、また もどった！']},
  // R28: ジブンの シューティング戦（v5/js/shooter.js の jibun: たまは すりぬけ、「つくる」の ひかりを3つ とると いろが もどる）。ふだんの たたかいに ならない時の保険として形だけの数値を置く。
  // R29: winEvent で jibunWin を走らせる。これが無いと bossWon は 章の ほんとうの ボス（ゼロ）としか みなさない。
  jibun:{name:'ジブン',boss:true,shooter:'jibun',winEvent:'jibunWin',intro:['ジブン','やめても だれも こまらないよ。'],art:'ryosei',animCols:4,specialEvery:3,specialDamage:0,hp:1,attack:0,exp:0,money:0,level:9,color:['#1a2430','#c9ced8'],hints:['きのうの じぶんを たすける'],actions:['たまが すりぬけた。']},
  // R29: ゼロの シューティング戦（v5/js/shooter.js の zero: こうげきは きかない。「こえ」の光を取るたびに
  // 町の人の守護霊がつながり、一言が流れる。全員つながると とくぎ が「みんなの こえ」に変わり、撃つとノイズが晴れる）。
  zero:{name:'ゼロ',boss:true,shooter:'zero',intro:['ゼロ','……ザーッ'],hp:1,attack:0,exp:90,money:120,level:9,color:['#1a1030','#b9a7ff'],hints:['こえを あつめている'],actions:['ざつおんが ながれた。']}},
 // R29: ゼロが仲間になった時のために（召喚獣メニューは GAME_DATA.summons[id] を直接読むので要る）。あたらしい絵は依頼中、とどくまでは
 // プレースホルダーの コマ（fallback() の summons 用の形）で動かす（RULES.md 4）。
 summons:{zero:{name:'ゼロ',frame:6,cost:30,damage:64,desc:'みんなの こえを とどける。\nおおきな ダメージ。'}},
 maps
});
})();
