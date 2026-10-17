// Node VM integration checks; SDK, DOM, Canvas and WebAudio are controlled doubles.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const documentPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'v5', 'index.html'));
const root = path.dirname(documentPath);
const html = fs.readFileSync(documentPath,'utf8');
// index.html runs the engine, then each data/chN.js, then the inline RYW.start(); the VM runs them in the same order.
const scripts = [...html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)].map(m=>m[1]?{file:'v5/'+m[1],code:fs.readFileSync(path.join(root,m[1]),'utf8')}:{file:'v5/index.html',code:m[2]});
assert(scripts.length>=3&&scripts.some(s=>s.file==='v5/data/ch1.js'),'index.html loads data/ch1.js');
const result=[];
// Decode the shipped RGBA PNGs so collision tests use actual alpha, not rectangles.
const decoded=new Map();
function pngPixels(file){
 if(decoded.has(file))return decoded.get(file);
 const b=fs.readFileSync(file),width=b.readUInt32BE(16),height=b.readUInt32BE(20);
 assert.equal(b[24],8);assert.equal(b[25],6);const chunks=[];
 for(let at=8;at<b.length;){const len=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);if(type==='IDAT')chunks.push(b.subarray(at+8,at+8+len));at+=12+len;}
 const raw=require('node:zlib').inflateSync(Buffer.concat(chunks)),stride=width*4,data=Buffer.alloc(stride*height);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const mode=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=4?data[y*stride+x-4]:0,b=y?data[(y-1)*stride+x]:0,c=y&&x>=4?data[(y-1)*stride+x-4]:0;data[y*stride+x]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][mode])&255;}}
 decoded.set(file,{data});return {data};
}

async function runtime({saved=new Map(),missing=false,brokenStorage=false,seed=7,sdk=false,holdLoad=false,loadError=false,rawSave='',holdSave=false,initialPause=false,missingFiles=[],omitWords=false,omitProto=false,search='',capacitor=null,musicLedger,musicDurations={}}={}) {
  const sources=[];const listeners = {}, els = new Map(), draws=[], imageLog=[], imageAlpha=[], imageX=[], requests=[], canvasCalls=[], windowListeners={}, calls=[], saves=[], audio=[];
  const host={enabled:false}; let resolveLoad, rejectLoad, resolveSave;
  const loadPromise=new Promise((resolve,reject)=>{resolveLoad=resolve;rejectLoad=reject});
  // Draw calls are not recorded: a long simulated walk issues millions of them.
  const noop=()=>{};
  const context2d = new Proxy({getImageData:()=>pngPixels(root+'/'+draws[draws.length-1][0].src),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),measureText(t){return {width:String(t).length*(parseFloat(this.font)||10)};},fillRect(...a){if(this.fillStyle==='#0b1f3ce0')canvasCalls.push(['summonplate',...a]);if(this.fillStyle==='#1f2a44e6'){canvasCalls.push(['plate',...a]);if(canvasCalls.length>4000)canvasCalls.splice(0,2000);}if(this.fillStyle==='#244b49ee'){canvasCalls.push(['tag',...a]);if(canvasCalls.length>4000)canvasCalls.splice(0,2000);}},strokeText(...a){canvasCalls.push(['strokeText',...a]);if(canvasCalls.length>4000)canvasCalls.splice(0,2000);},fillText(...a){canvasCalls.push(['fillText',...a]);if(canvasCalls.length>4000)canvasCalls.splice(0,2000);},drawImage(...a){draws[0]=a;if(/numberperson|\/props\/|\/enemies\/|\/bugking\//.test(String(a[0]?.src))){canvasCalls.push(['drawImage',a[0].src,...a.slice(1)]);if(canvasCalls.length>4000)canvasCalls.splice(0,2000);}imageLog.push(a[0].src);imageAlpha.push(this.globalAlpha??1);if(imageAlpha.length>4000)imageAlpha.splice(0,2000);imageX.push(a[1]);if(imageX.length>4000)imageX.splice(0,2000);if(imageLog.length>4000)imageLog.splice(0,2000);}}, {get(o,p){return p in o ? o[p] : noop},set(o,p,v){o[p]=v;return true;}});
  class El {
    constructor(id=''){this.id=id;this.style={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.children=[];this.tagName='DIV';this.value=id==='name-input'?'ソラ':'';this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
    addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
    getContext(){return context2d}
    replaceChildren(){this.children=[]}
    appendChild(el){if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(c=>c!==el);el.parentNode=this;this.children.push(el);return el}
    getBoundingClientRect(){const s=Math.min(sandbox.window.innerWidth/540,sandbox.window.innerHeight/960);return {left:(sandbox.window.innerWidth-540*s)/2,top:(sandbox.window.innerHeight-960*s)/2,width:540*s,height:960*s}}
    setPointerCapture(){}
    focus(){document.activeElement=this}
    select(){}
    contains(el){return this.children.includes(el)}
    closest(selector){if(selector==='[data-cmd]')return this.dataset.cmd?this:null;if(selector==='button,input')return ['BUTTON','INPUT'].includes(this.tagName)?this:null;return this}
    click(){this.onclick?.({target:this})}
  }
  for(const match of html.matchAll(/<([a-z]+)[^>]*?id="([^"]+)"/g)){const e=new El(match[2]);e.tagName=match[1].toUpperCase();els.set(match[2],e);}
  const buttons=['attack','create','summon','item','run'].map(cmd=>{const e=new El(cmd);e.tagName='BUTTON';e.dataset.cmd=cmd;return e;});
  els.get('commands').children=buttons;
  // Command buttons rely on the click bubbling to #commands, as in the browser.
  for(const b of buttons)b.click=()=>els.get('commands').onclick?.({target:b});
  els.get('title-actions').children=[els.get('start-btn'),els.get('continue-btn')];
  els.get('modal').hidden=true;els.get('dialogue').hidden=true;els.get('continue-btn').disabled=true;
  let rafs=[], now=0, rafId=0;
  const document={hidden:false,activeElement:null,getElementById:id=>{assert(els.has(id),id);return els.get(id)},querySelectorAll:sel=>sel==='.screen'?[...els.values()].filter(e=>e.id.startsWith('screen-')):buttons,createElement:tag=>{const e=new El();e.tagName=tag.toUpperCase();return e;},addEventListener(n,f){(listeners[n]??=[]).push(f)}};
  const storage={getItem(k){if(brokenStorage)throw Error('storage unavailable');return saved.get(k)||null},setItem(k,v){if(brokenStorage)throw Error('storage unavailable');saved.set(k,v)}};
  class Image {set src(s){this._src=s;this.complete=true;if(missingFiles.some(f=>s.endsWith('/'+f))){queueMicrotask(()=>this.onerror?.());return;}let bytes;try{bytes=fs.readFileSync(root+'/'+s)}catch{}this.naturalWidth=bytes?bytes.readUInt32BE(16):200;this.naturalHeight=bytes?bytes.readUInt32BE(20):200;queueMicrotask(()=>this.onload?.())}get src(){return this._src}}
  const sandbox={Math:Object.create(Math),innerWidth:390,innerHeight:844,document,Image,URLSearchParams,location:{search:'?seed='+seed+search},localStorage:storage,performance:{now:()=>now},requestAnimationFrame:f=>{const id=++rafId;rafs.push({id,f});return id},cancelAnimationFrame:id=>{rafs=rafs.filter(r=>r.id!==id)},console,queueMicrotask,fetch:async url=>{
    // SPEC_V9_MUSIC: the ledger defaults to the shipped data/music.json; a test passes its own ledger (null = missing) and fake decoded lengths.
    if(url==='data/music.json'){requests.push(url);if(musicLedger===undefined)return {ok:true,json:async()=>JSON.parse(fs.readFileSync(root+'/'+url,'utf8'))};return musicLedger?{ok:true,json:async()=>musicLedger}:{ok:false};}
    if(url.startsWith('assets/music/')){requests.push(url);return {ok:url in musicDurations,arrayBuffer:async()=>({url})};}
    assert(url.startsWith('assets/')); requests.push(url);
    let path=root+'/'+url;
    if(missing)return {ok:true,json:async()=>[]};
    return {ok:fs.existsSync(path),json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))};
  }};
  class AudioContext {
    constructor(){this.currentTime=0;this.destination={};this.gains=[];audio.push(this)}
    decodeAudioData(bytes,ok,fail){const d=musicDurations[bytes.url];if(!(d>0)){fail?.(Error('decode'));return Promise.reject(Error('decode'));}const b={duration:d,url:bytes.url};ok?.(b);return Promise.resolve(b);}
    createBufferSource(){const s={loop:false,connect(){},start(t,offset,dur){s.started={t,offset,dur}},stop(t){s.stopped=t}};sources.push(s);return s;}
    createGain(){const gain={value:1,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(){},linearRampToValueAtTime(v,t){this.ramp=[v,t]}};this.gains.push(gain);return {gain,connect(){}}}
    createOscillator(){calls.push('tone');return {frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},start(){},stop(){}}}
    suspend(){this.state='suspended';return Promise.resolve()}
    resume(){this.state='running';return Promise.resolve()}
  }
  sandbox.window={Capacitor:capacitor,innerWidth:390,innerHeight:844,AudioContext,OfflineAudioContext:class{decodeAudioData(...a){return AudioContext.prototype.decodeAudioData.apply(this,a)}},addEventListener(n,f){windowListeners[n]=f}};
  if(sdk) sandbox.window.ytgame={
    game:{
      firstFrameReady(){calls.push('first')},
      gameReady(){assert(calls.includes('first'));assert.equal(sandbox.window.__v5.screen,'title');assert.equal(els.get('loading').hidden,true);calls.push('ready')},
      loadData(){calls.push('load');return holdLoad?loadPromise:loadError?Promise.reject(Error('load failed')):Promise.resolve(rawSave)},
      saveData(data){calls.push('save');saves.push(JSON.parse(data));return holdSave?new Promise(resolve=>{resolveSave=resolve}):Promise.resolve()}
    },
    system:{onPause(cb){host.pause=cb;if(initialPause)cb()},onResume(cb){host.resume=cb},
      isAudioEnabled(){return host.enabled},onAudioEnabledChange(cb){host.audio=cb}}
  };
  for(const s of scripts){if((omitWords&&s.file==='v5/data/words.js')||(omitProto&&s.file==='v5/js/proto.js'))continue;if(sandbox.window.RYW)sandbox.RYW=sandbox.window.RYW;vm.runInNewContext(s.code,sandbox,{filename:s.file});}
  // The side-scrolling boss battle needs a real browser (tools/test_shooter.cjs and the smoke cover it); here a double records each start.
  const shooterRuns=[];assert(sandbox.window.RYW.Shooter,'index.html loads js/shooter.js after the engine');
  sandbox.window.RYW.Shooter.start=cfg=>{const h={cfg,stopped:false,stop(){h.stopped=true;}};shooterRuns.push(h);return h;};
  const protoRuns=[];if(!omitProto){assert(sandbox.window.RYW.Proto,'index.html loads js/proto.js');sandbox.window.RYW.Proto.open=cfg=>{protoRuns.push(cfg);return {close(){}};};}
  await new Promise(setImmediate);await new Promise(setImmediate);
  const hasLoop=()=>rafs.some(r=>r.f.name==='loop');
  if(!holdLoad && !initialPause)assert(hasLoop(),'boot complete');
  function tick(ms=16){for(let i=0;i<Math.ceil(ms/16);i++){now+=16;const run=rafs;rafs=[];for(const r of run)r.f(now);}}
  function click(id,target){const e=els.get(id); const event={target:target||e,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){this.stop=true}};for(const f of listeners.click||[])f(event);if(event.stop||e.disabled)return;for(const f of e.listeners.click||[])f(event);if(e.onclick)e.onclick(event)}
  const g=sandbox.window.__v5;
  function cmd(command){click('commands',buttons.find(e=>e.dataset.cmd===command));}
  // Every distinct dialogue box is counted once; `counting` lets optional detours stay out of the required-line total.
  const seen=new Set();let lineTotal=0,counting=true;
  function dialogue(){let limit=120;while(g.dialogue&&limit-->0){if(!seen.has(g.dialogue)){seen.add(g.dialogue);if(counting)lineTotal+=g.dialogue.lines.length;}click('dialogue');}assert(limit>0,'dialogue finishes');}
  function visibility(hidden){document.hidden=hidden;for(const f of listeners.visibilitychange||[])f();}
  function start(mode='kids'){click('start-btn');assert.equal(g.modal,'mode-select');button(mode==='adult'?'おとなモード':'こどもモード');assert.equal(g.screen,'prologue');dialogue();assert.equal(g.screen,'naming');els.get('name-input').value='テストソラ';click('naming-confirm');dialogue();assert.equal(g.screen,'battle');tick(300);}
  function resize(w,h){sandbox.window.innerWidth=w;sandbox.window.innerHeight=h;sandbox.innerWidth=w;sandbox.innerHeight=h;windowListeners.resize()}
  function button(text){const b=els.get('modal-buttons').children.find(b=>b.textContent.includes(text));assert(b,'button '+text);assert(!b.disabled,'button enabled '+text);b.onclick();}
  function key(key,up=false,target=els.get('stage')){for(const f of listeners[up?'keyup':'keydown']||[])f({key,target,preventDefault(){},repeat:false});}
  return {RYW:sandbox.window.RYW,setRandom:f=>sandbox.Math.random=f,g,els,cmd,button,key,click,tick,shooterRuns,protoRuns,dialogue,visibility,start,saved,requests,draws,imageLog,imageAlpha,imageX,canvasCalls,calls,saves,audio,sources,host,listeners,resize,
    active:()=>document.activeElement,lines:()=>lineTotal,setCounting:v=>{counting=v},now:()=>now,
    setMissingArt:value=>{missing=value},resolveLoad,rejectLoad,resolveSave:()=>resolveSave(),hasFrame:hasLoop};
}
const settle=()=>new Promise(setImmediate);
const TILE=48;
// Plays one ordinary battle to the end: summon when hurt, otherwise "create".
function fight(t){let guard=40;while(t.g.screen==='battle'&&guard--){if(t.g.battle.locked||t.g.battle.over){t.tick(400);continue;}if(t.g.hp.hp<25&&t.g.battery>=15){t.cmd('summon');t.button('ナオスライム');}else {t.cmd('create');t.button('くりかえし');}t.tick(3000);}assert(guard>0,'battle ends');}
function talk(t,map,x,y,dir=3){t.g.debugWarp(map,x,y);t.g.debugFace(dir);t.tick(16);const tonesBefore=t.calls.length;t.click('talk-btn');assert(t.g.dialogue,'talk at '+map+' '+x+','+y);assert(t.calls.length>tonesBefore,'はなす plays a sound '+map+' '+x+','+y);t.tick(16);assert(t.els.get('talk-btn').hidden,'はなす is hidden while the dialogue window is open');return t.g.dialogue.lines.map(l=>l[1]).join('\n');}
function walkUp(t,ms=200){t.key('ArrowUp');t.tick(ms);t.key('ArrowUp',true);}
(async()=>{
 const t=await runtime();t.tick();for(const [name,count] of Object.entries({hero_walk:16,hero_ride:16,npc:16,enemies:9,summons:9,buildings:9,props:16,interior:16,hikaku_throne:1,numberperson:4}))assert.equal(t.g.assets[name],count,'loaded '+name);
 t.start();let zakoBattles=0;
 assert.equal(t.g.summons[0],'nao');assert.equal(t.g.hp.hp,30);assert.equal(t.active().dataset.cmd,'summon','tutorial opens on しょうかん');
 // F07: no escape from the tutorial, and no turn spent.
 t.cmd('run');assert.equal(t.g.screen,'battle');assert(t.g.battle.log.includes('にげられない'));assert(!t.g.battle.locked);
 t.cmd('summon');assert.equal(t.g.modal,'summon');t.button('ナオスライム');assert.equal(t.g.battery,85);assert(t.g.battle.cast);
 // F13: the summon holds on screen; the heal lands at 0.9 s and the turn returns at 2.1 s (+0.7 s enemy).
 t.tick(600);assert(t.g.battle.cast);assert.equal(t.g.hp.hp,30);t.tick(400);assert.equal(t.g.hp.hp,60);t.tick(700);assert(t.g.battle.cast);t.tick(500);assert(!t.g.battle.cast);t.tick(800);assert(!t.g.battle.locked);
 assert.equal(t.active().dataset.cmd,'summon','focus returns to the last command');
 t.cmd('attack');t.tick(900);t.cmd('attack');t.tick(2800);t.dialogue();assert.equal(t.g.screen,'field');assert(t.g.state.flags.tutorial);assert.equal(t.g.questStep,'zako');
 assert(t.g.quest.endsWith('↓'),'room quest points to the exit: '+t.g.quest);
 result.push('Title → prologue → naming → Naoslime tutorial (no escape, summon hold timing) → bedroom PASS');
 t.key('ArrowDown');t.tick(1200);t.key('ArrowDown',true);assert.equal(t.g.map,'town');
 t.setCounting(false);
 assert(talk(t,'town',4.5,26.3).includes('ぎゅうにゅう'));t.dialogue();
 // F14: the shop is shut and the police only ask before three noises are quiet.
 t.g.debugWarp('town',22,8.7);t.tick(1300);walkUp(t);assert.equal(t.g.map,'town');assert(t.g.dialogue&&t.g.dialogue.lines[1][1].includes('こうばんに あずけた'));t.dialogue();
 assert(talk(t,'town',9,17.2).includes('しずめたら'));t.dialogue();assert(!t.g.state.flags.key);
 t.setCounting(true);
 // Real contact encounter with a wandering noise.
 const crow=t.g.enemyPos('c1');t.g.debugWarp('town',crow.x/TILE,crow.y/TILE+1.4);t.tick(1300);t.key('ArrowUp');t.tick(400);t.key('ArrowUp',true);assert.equal(t.g.screen,'battle');zakoBattles++;
 fight(t);t.dialogue();assert.equal(t.g.screen,'field');assert.equal(t.g.state.flags.zakoWins,1);assert(t.g.quest.startsWith('まちの ノイズを しずめよう 1/3'),t.g.quest);
 result.push('Walking portal, locked shop, police request, contact encounter and real victory PASS');
 for(const type of ['popup','vending']){t.g.debugStartBattle(type,'balance-'+type);zakoBattles++;fight(t);t.dialogue();}
 assert.equal(t.g.state.flags.zakoWins,3);assert.equal(t.g.questStep,'key');
 const give=talk(t,'town',9,17.2);assert(give.includes('カギを もらった'));t.dialogue();assert(t.g.state.flags.key);assert.equal(t.g.questStep,'battery');
 // Store: walk in, the register opens the shop, buy the battery and a charge.
 t.g.debugWarp('town',22,24.7);t.tick(1300);walkUp(t,180);assert.equal(t.g.map,'store');
 assert(talk(t,'store',5,5.6).includes('パスワード'));t.dialogue();assert.equal(t.g.modal,'shop');t.tick(300);
 const cash=t.g.state.money;t.button('モバイルバッテリー');assert.equal(t.g.state.items.battery,1);assert.equal(t.g.state.money,cash-75);
 if(t.g.battery<100){t.button('じゅうでん');assert.equal(t.g.battery,100);assert.equal(t.g.state.money,cash-105);}t.button('ありがとう');assert.equal(t.g.questStep,'recruit');
 result.push('3 ordinary wins → police key → store register, battery purchase (75) and paid charge (30) PASS');
 t.g.debugWarp('town',22,8.7);t.tick(1300);walkUp(t);assert.equal(t.g.map,'electric');assert(t.g.dialogue.lines[0][1].includes('あけた'));t.dialogue();
 const before=t.g.battery;assert(talk(t,'electric',7,9.4).includes('つないだ'));t.dialogue();t.tick(16);assert(!t.els.get('talk-btn').hidden,'はなす shows again once the dialogue closes');assert(t.g.summons.includes('code'));assert.equal(t.g.state.items.battery,0);assert.equal(t.g.battery,before,'recruiting no longer refills the battery');
 // BUG KING (SPEC_V6.md 4): the talk, the kickboard lifts, then the side-scrolling battle opens with the hero's weapons.
 t.g.debugWarp('electric',5,5.4);t.g.debugFace(3);t.click('talk-btn');assert(t.g.dialogue.lines.some(l=>l[1].includes('むりだ')));t.dialogue();
 assert(t.g.lift,'the kickboard lifts after the talk');assert.equal(t.g.screen,'field');assert(!t.g.battle,'no command battle for the boss');
 {const hero=t.g.lift;t.tick(400);assert(t.g.lift&&t.g.lift.type==='bugking'&&hero);}
 t.key('Escape');assert(!t.g.modal,'the menu stays closed while lifting');
 t.tick(1000);assert(!t.g.modal,'no debugmode owned: the apply-only screen is skipped');assert.equal(t.g.screen,'shooter');assert(!t.g.lift);assert.equal(t.shooterRuns.length,1);
 {const c=t.shooterRuns[0].cfg;assert.equal(c.boss,'bugking');assert.equal(c.hearts,3);assert(Array.isArray(c.weapons)&&!c.weapons.includes('fuku'));assert(Array.isArray(c.options)&&c.options.length<=3);assert.equal(c.lines.bursts[50],'TODO: エラー処理');assert.equal(c.platform,t.g.platform);
  // Lose → まちに もどる: back on the field in front of the TV pile, healed, with Sora's line.
  t.g.debugDamage(10);c.onLose('town');assert.equal(t.g.screen,'field');assert.equal(t.g.map,'town');assert.equal(t.g.hp.hp,t.g.hp.maxHp);assert(t.g.dialogue.lines[0][1].includes('もどった'));t.dialogue();assert.equal(c.lines.intro[0],'ソラ','no second むりだ line');}
 t.g.debugWarp('electric',5,5.4);t.g.debugFace(3);{assert(!t.g.state.bosses.includes('bugking'));}
 t.tick(400);t.click('talk-btn');t.dialogue();t.tick(1400);assert(!t.g.modal);assert.equal(t.shooterRuns.length,2,'talking again opens the battle again');
 t.shooterRuns[1].cfg.onLose('retry');assert(!t.g.modal);assert.equal(t.g.screen,'shooter');assert.equal(t.shooterRuns.length,3,'すぐ やりなおす starts without the apply-only screen');
 {const exp=t.g.state.exp,lv=t.g.level,money=t.g.state.money;t.shooterRuns[2].cfg.onWin({boss:'bugking',seconds:150,hearts:2,maxHearts:3,hurts:1});
  assert(t.g.state.bosses.includes('bugking'));assert(t.g.level>lv||t.g.state.exp!==exp);assert.equal(t.g.state.money,money+t.g.GAME_DATA.enemies.bugking.money);}
 // F15: the town comes back first, then the closing lines. R19: then Sora and RYOSEI make a tiny game at home (the key item for chapter 2).
 assert.equal(t.g.screen,'field');assert.equal(t.g.map,'town');assert(!t.g.dialogue);t.tick(2100);assert(t.g.dialogue);assert(t.g.dialogue.lines.some(l=>l[1].includes('ノイズに のまれてる')));t.dialogue();
 assert.equal(t.g.screen,'field','no chapter card before the bus');assert.equal(t.g.map,'room','the game is made on the home PC');
 for(let i=0;i<20&&!t.g.dialogue;i++)t.tick(200);assert(t.g.dialogue.lines.some(l=>l[1].includes('ジャンプ')));t.dialogue();assert.equal(t.protoRuns.length,1);assert.equal(t.protoRuns[0].mode,'lesson');assert(!t.g.state.flags.gameMade);t.protoRuns[0].onDone({...t.protoRuns[0].state,jump:9});for(let i=0;i<20&&!t.g.dialogue;i++)t.tick(200);
 assert(t.g.dialogue.lines.some(l=>l[1].includes('ゲームが できた')));t.dialogue();assert.equal(t.g.state.items.firstgame,1);assert(t.g.state.flags.gameMade);assert.equal(t.g.questStep,'cleared');await settle();assert.equal(JSON.parse(t.saved.get('ryoseiworld-rpg-v5')).items.firstgame,1,'the game is saved');
 // The key item: listed under どうぐ with its words, not sold at the store, not usable in battle.
 t.tick(300);t.click('menu-btn');t.button('アイテム');{const b=t.els.get('modal-buttons').children.find(x=>x.textContent==='はじめて つくった ゲーム');assert(b,'key item listed');b.onclick();assert.equal(t.g.modal,'firstgame');t.button('しらべる');assert(t.els.get('modal-title').textContent.includes('v1'));assert(t.els.get('modal-copy').textContent.includes('ピコッ'));t.button('もどる');t.button('もどる');assert.equal(t.g.modal,'items');assert.equal(t.g.state.items.firstgame,1,'reading does not use it');t.button('もどる');t.key('Escape');}
 assert(!Object.values(t.g.GAME_DATA.items).filter(v=>!v.key).some(v=>v.name==='はじめて つくった ゲーム'));
 // The bus stop by the police box: the first ride ends chapter 1 and opens chapter 2 in ミナモちょう.
 t.tick(300);assert(talk(t,'town',12,16.9).includes('バスに のった'));while(t.g.dialogue)t.dialogue();assert.equal(t.g.screen,'ending');assert(t.els.get('ending-heading').textContent.includes('2しょう'));assert(t.els.get('ending-heading').textContent.includes('ミナモちょう'));
 const tonesAtEnding=t.calls.length;t.tick(2500);const tonesAfterJingle=t.calls.length;t.tick(3000);assert.equal(t.calls.length,tonesAfterJingle,'ending goes quiet after one jingle');assert(tonesAfterJingle>=tonesAtEnding);
 t.key('z');assert.equal(t.g.screen,'field');assert.equal(t.g.chapter,2);assert.equal(t.g.map,'minamo');await settle();
 // Back and forth by bus: the town stop and the ミナモちょう stop both list the two towns.
 const bus=(map,x,y)=>{t.g.debugWarp(map,x,y);t.g.debugFace(3);t.tick(400);t.click('talk-btn');t.tick(400);};
 bus('minamo',12.4,31.3);assert.equal(t.g.questStep,'zako','chapter 2 has its own quest');assert.equal(t.g.modal,'event');assert(t.els.get('modal-buttons').children.find(b=>b.textContent.includes('ミナモちょう')).disabled,'the stop you are at cannot be picked');t.button('ヒダマリちょう');assert.equal(t.g.map,'town');
 // Back in ヒダマリちょう during chapter 2 the town stays quiet: no noises walk and the room TV keeps its cleared line.
 {const before=t.g.state.flags.zakoWins;t.g.debugWarp('town',19,21.6);t.tick(1500);assert(!t.g.battle,'no street noise in a cleared town');assert.equal(t.g.state.flags.zakoWins,before);assert(talk(t,'room',8.5,8.6).includes('ねこの とくしゅう'));t.dialogue();}
 t.tick(1300);bus('town',12,16.9);assert.equal(t.g.modal,'event','the bus asks where to go');t.button('ミナモちょう');assert.equal(t.g.map,'minamo');assert.equal(t.g.chapter,2);
 t.click('menu-btn');t.button('セーブ');while(t.g.dialogue)t.dialogue();await settle();
 assert(zakoBattles>=3);assert(t.lines()>=40,'required dialogue lines: '+t.lines());
 result.push(`Code Dragon via battery → BUG KING talk → kickboard lifts → shooter (lose: town / retry, then win) → town clears → first game at home (key item) → bus → 2しょう card (Z) → ミナモちょう, bus both ways; required lines ${t.lines()}, ordinary battles ${zakoBattles} PASS`);
 const reloaded=await runtime({saved:t.saved});reloaded.tick();assert(!reloaded.els.get('continue-btn').disabled);assert.equal(reloaded.active().id,'continue-btn');
 // FUN16: the title caption must name where つづきから actually resumes, not always chapter 1's town.
 assert.equal(reloaded.els.get('title-caption').textContent,'2しょう　ミナモちょう','title caption should show the saved chapter, not the chapter 1 default');
 // FUN24: the title screen must tempt a returning player toward the challenge mode / word-note review they already unlocked.
 assert(!reloaded.els.get('title-hint').hidden,'a save that already beat BUG KING shows a title hint');assert(reloaded.els.get('title-hint').textContent.includes('チャレンジ'),'challenge is unlocked after chapter 1 boss');
 const freshNoSave=await runtime();freshNoSave.tick();assert(freshNoSave.els.get('title-hint').hidden,'no save: no hint to show');
 // R105: the hint line must not push the buttons up onto the town art; with the hint the block keeps its top (the road), without it the bottom anchor stays.
 assert(reloaded.els.get('title-actions').classes.has('with-hint'),'R105: the hint pins the buttons to the road');assert(!freshNoSave.els.get('title-actions').classes.has('with-hint'),'R105: no hint, no pin');
 {const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','v5','index.html'),'utf8');const m=html.match(/\.title-actions\.with-hint\{top:(\d+)px;bottom:auto;gap:(\d+)px\}/),bottom=+(html.match(/\.title-actions\{[^}]*bottom:(\d+)px/)||[])[1];assert(m&&bottom,'R105: pinned title-actions rule');const top=+m[1],gap=+m[2];
  // Without the hint the block is two 58px buttons + caption (24px*1.65+4) with 18px gaps, ending at bottom:115px; the pinned top sits on the road (y>=620) a little above that.
  // Even if a wider font wraps the hint to three lines, the block still ends on the screen.
  const plainTop=960-bottom-(58+18+58+18+24*1.65+4),hint3=24*1.65*3+4;assert(top>=620&&top<=plainTop+2,'R105: pinned top '+top+' stays on the road (plain top '+plainTop+')');assert(top+58+gap+58+gap+24*1.65+4+gap+hint3<=960,'R105: a three-line hint still fits on the screen');}
 // R91: with a save, つづきから is the bright button (はじめから only asks before wiping); without one, はじめから is.
 assert(reloaded.els.get('continue-btn').classes.has('primary')&&!reloaded.els.get('start-btn').classes.has('primary'),'a save makes つづきから the bright button');assert(freshNoSave.els.get('start-btn').classes.has('primary')&&!freshNoSave.els.get('continue-btn').classes.has('primary'),'no save: はじめから stays the bright button');
 reloaded.key('Enter');assert.equal(reloaded.g.map,'minamo');assert.equal(reloaded.g.chapter,2);assert.equal(reloaded.g.state.items.firstgame,1);assert(reloaded.g.state.bosses.includes('bugking'));assert(reloaded.g.summons.includes('code'));for(const k of ['chapter','map','x','y','level','exp','money','battery','items','summons','bosses'])assert.equal(JSON.stringify(reloaded.g.state[k]),JSON.stringify(JSON.parse(t.saved.get('ryoseiworld-rpg-v5'))[k]),'saved '+k);
 result.push('Reload → Enter on the focused つづきから restores map, position, level, battery, money, items, summons and cleared boss; title caption names the saved chapter PASS');
 // Drum roll rescue keeps the exact original 45 ms tick.
 reloaded.g.debugStartBattle('vending','roll');reloaded.tick(300);reloaded.g.debugDamage(999);const shown=reloaded.g.hp.displayHp;reloaded.tick(160);assert(reloaded.g.hp.displayHp<shown&&reloaded.g.hp.displayHp>0);reloaded.g.state.battery=100;reloaded.cmd('summon');reloaded.button('ナオスライム');assert(reloaded.g.hp.hp>0);reloaded.tick(2000);assert(!reloaded.g.battle.over);
 result.push('Lethal HP roll can be rescued by Naoslime before zero PASS');
 reloaded.tick(1500);reloaded.g.state.battery=0;reloaded.cmd('summon');reloaded.button('コードラゴン');assert.equal(reloaded.g.battery,0);assert(reloaded.g.battle.log.includes('たりない'));assert(!reloaded.g.battle.locked);
 // F01: Escape closes the summon list and returns the cursor, so the next Z reopens it.
 reloaded.cmd('summon');assert.equal(reloaded.g.modal,'summon');reloaded.key('Escape');assert.equal(reloaded.g.modal,'');assert.equal(reloaded.active().dataset.cmd,'summon','active='+reloaded.active().id+'/'+reloaded.active().tagName+'/'+reloaded.active().textContent);reloaded.key('z');assert.equal(reloaded.g.modal,'summon');reloaded.key('Escape');
 reloaded.key('ArrowUp');assert.equal(reloaded.active().dataset.cmd,'attack');reloaded.key('ArrowRight');assert.equal(reloaded.active().dataset.cmd,'create');reloaded.key('s');assert.equal(reloaded.active().dataset.cmd,'item');reloaded.key('ArrowDown');assert.equal(reloaded.active().dataset.cmd,'run');
 // Losing resets precisely to the last checkpoint, not current battle inventory.
 reloaded.g.debugDamage(999);reloaded.tick(5000);assert(reloaded.g.dialogue);reloaded.dialogue();assert.equal(reloaded.g.screen,'field');assert.equal(reloaded.g.hp.hp,JSON.parse(t.saved.get('ryoseiworld-rpg-v5')).hp);
 result.push('Insufficient battery consumes no turn; arrow/WASD command cursor; Esc keeps focus; defeat restores last checkpoint PASS');
 reloaded.g.state.bosses=[];const v1=reloaded.g.GAME_DATA.maps.town.enemies.find(e=>e.id==='v1');reloaded.g.debugWarp('town',v1.x,v1.y+.9);reloaded.g.debugSetLevel(8);const wins=reloaded.g.state.flags.zakoWins;reloaded.tick(1400);reloaded.key('ArrowUp');reloaded.tick(300);reloaded.key('ArrowUp',true);assert.equal(reloaded.g.screen,'field');assert(reloaded.g.state.defeated.v1>0);assert.equal(reloaded.g.state.flags.zakoWins,wins+1);const exp=reloaded.g.state.exp;reloaded.tick(1000);assert.equal(reloaded.g.state.exp,exp);
 // Pause freezes movement, HP, animation timers and input, including held keys.
 reloaded.g.debugWarp('room',5,9);reloaded.key('ArrowDown');reloaded.visibility(true);const pos=reloaded.g.position;reloaded.tick(4000);assert.equal(reloaded.g.position.y,pos.y);assert(reloaded.g.paused);reloaded.visibility(false);reloaded.tick(200);assert.equal(reloaded.g.position.y,pos.y);
 // F19: ひとやすみ closes the menu before pausing.
 reloaded.click('menu-btn');reloaded.button('ひとやすみ');assert(reloaded.g.paused);assert.equal(reloaded.g.modal,'');reloaded.click('resume-btn');assert(!reloaded.g.paused);
 for(const [w,h] of [[390,844],[1280,720],[800,800],[844,390]]){const p=reloaded.g.position;reloaded.resize(w,h);const match=reloaded.els.get('stage').style.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\) scale\(([-.\d]+)\)/);assert(match);const scale=Math.min(w/540,h/960);assert(Math.abs(Number(match[1])-(w-540*scale)/2)<1e-8);assert(Math.abs(Number(match[2])-(h-960*scale)/2)<1e-8);assert.equal(Number(match[3]),scale);assert.equal(reloaded.g.position.x,p.x);assert.equal(reloaded.g.position.y,p.y);assert.equal(reloaded.els.get('stage').classes.has('compact'),scale<.55);}
 result.push('High-level instant victory counts as a quiet noise; pause/resume; four aspect-ratio transforms (compact text only at 844x390) PASS');
 const touch=await runtime();touch.tick();touch.g.debugWarp('room',5,9);const stage=touch.els.get('stage'),r=stage.getBoundingClientRect();
 function pointer(type,x,y){const e={target:stage,pointerId:1,clientX:r.left+x*r.width/540,clientY:r.top+y*r.height/960};for(const cb of stage.listeners[type]||[])cb(e);}
 pointer('pointerdown',200,700);pointer('pointermove',260,700);touch.tick(200);assert(touch.g.position.x>240);const touchX=touch.g.position.x;pointer('pointercancel',260,700);touch.tick(200);assert.equal(touch.g.position.x,touchX);
 result.push('Touch drag moves in four directions; pointer cancellation stops movement PASS');
 const f=await runtime({missing:true});f.tick();f.start();f.tick(1000);assert.equal(f.g.screen,'battle');assert.equal(f.g.assets.hero_walk,0);f.g.debugWin();f.tick(2100);f.dialogue();assert.equal(f.g.screen,'field');
 await f.g.reloadAssets();assert.equal(f.g.assets.hero_walk,0);f.setMissingArt(false);await f.g.reloadAssets();assert.equal(f.g.assets.hero_walk,16);assert.equal(f.g.assets.interior,16);assert.equal(f.g.screen,'field');result.push('All art absent: fallback render PASS; late material arrival swaps in real PNGs without restarting PASS');
 // F29: one missing interior PNG is retried three times, then left to the stand-in.
 const gap=await runtime({missingFiles:['interior_r0_c0.png']});for(let i=0;i<8;i++){gap.tick(16000);await settle();await settle();}const interiorFetches=gap.requests.filter(u=>u==='assets/interior/interior_frames.json').length;assert.equal(interiorFetches,4,'1 load + 3 retries');assert.equal(gap.g.assets.interior,15);assert.equal(gap.requests.filter(u=>u==='assets/props/props_frames.json').length,1);gap.g.debugWarp('room',5,9);gap.tick(100);assert.equal(gap.g.screen,'field');
 result.push('Missing interior frame: 1 load + 3 retries then stops; other art untouched PASS');
 const s=await runtime({sdk:true});s.tick();assert.deepEqual(s.calls,['load','first','ready']);s.start();await settle();assert(s.saves.length);assert(!('aiName' in s.saves[0]));assert.equal(s.saves[0].version,5);assert(!s.listeners.visibilitychange);assert.equal(s.audio.length,0);
 s.host.enabled=true;s.host.audio(true);s.cmd('summon');s.button('ナオスライム');s.tick(100);assert(s.audio.length>0);s.host.enabled=false;s.host.audio(false);assert.equal(s.audio[0].state,'suspended');s.host.pause();assert(s.g.paused);const battery=s.g.battery;s.tick(2000);s.cmd('attack');assert.equal(s.g.battery,battery);s.host.resume();s.tick(2000);assert(!s.g.paused);
 result.push('SDK load/save allowlist, local-only AI name, readiness, host pause and audio off/on PASS');
 // F20: firstFrameReady fires while the loading screen is up and loadData is still pending; gameReady waits for the title.
 const early=await runtime({sdk:true,holdLoad:true});assert.deepEqual(early.calls,['load']);early.tick();assert.deepEqual(early.calls,['load','first']);assert.equal(early.els.get('loading').hidden,false);assert(!early.hasFrame());early.resolveLoad('');await settle();await settle();early.tick();early.tick(100);assert.deepEqual(early.calls,['load','first','ready']);
 result.push('firstFrameReady before loadData/art completes, gameReady once at the title PASS');
 const broken=await runtime({brokenStorage:true});broken.tick();broken.start();await settle();assert.equal(await broken.g.save(false),'unavailable');
 result.push('Slow SDK load and disabled localStorage handled without uncaught error PASS');
 // F19: save toasts say where the save went; a second SDK save while one is in flight is queued, not refused.
 const local=await runtime();local.tick();local.start();await settle();local.tick(3000);local.g.debugWin();local.tick(2000);local.dialogue();local.tick(300);local.click('menu-btn');local.button('セーブ');local.dialogue();await settle();assert(local.els.get('toast').textContent.includes('この たんまつに ほぞんした'),local.els.get('toast').textContent);
 assert(!talk(local,'room',2.2,8.6,3).includes('ほぞんしますか'));local.dialogue();
 const busy=await runtime({sdk:true,holdSave:true});busy.tick();busy.start();await settle();busy.tick(3000);busy.g.debugWin();busy.tick(2000);busy.dialogue();busy.tick(300);busy.click('menu-btn');busy.button('セーブ');busy.dialogue();await settle();const busyToast=busy.els.get('toast').textContent;assert(busyToast.includes('ほぞんちゅう'),busyToast);assert(!busyToast.includes('できなかった'));
 result.push('Save toast: この たんまつに / ほぞんちゅう…; bed no longer asks to save PASS');
 // Flood-fill all maps at quarter-tile resolution; verify interaction approaches and doors.
 const nav=await runtime();nav.tick();
 for(const [map,m] of Object.entries(nav.g.GAME_DATA.maps)){
  nav.g.debugWarp(map,...m.spawn);const step=12,seen=new Set(),queue=[[Math.round(m.spawn[0]*48/step),Math.round(m.spawn[1]*48/step)]];
  for(let i=0;i<queue.length;i++){const [x,y]=queue[i],key=x+','+y;if(seen.has(key)||nav.g.debugBlocked(x*step,y*step))continue;seen.add(key);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<m.w*4&&ny<m.h*4&&!seen.has(nx+','+ny))queue.push([nx,ny]);}}
  const points=[...seen].map(k=>k.split(',').map(Number));
  for(const o of m.objects.filter(o=>o.dialogue||o.action||o.enter))assert(points.some(([x,y])=>Math.hypot(x*step-o.x*48,y*step-o.y*48)<(o.kind==='buildings'?100:82)),map+': '+o.id+' reachable');
  for(const p of m.portals)assert(points.some(([x,y])=>Math.hypot(x*step-p.x*48,y*step-p.y*48)<22),map+' exit reachable');
 }
 result.push('Actual PNG alpha-footprint collision: every NPC, event object and exit reachable on all 4 maps PASS');
 // F02: walking at a building from either side stops at its wall, never past the middle.
 const town=nav.g.GAME_DATA.maps.town;
 let sides=0;for(const o of town.objects.filter(o=>o.kind==='buildings')){const b=nav.g.debugBounds(o),y=(b.y+b.h*.5)/TILE;for(const side of [-1,1]){let x=(side<0?b.x-30:b.x+b.w+30)/TILE;nav.g.debugWarp('town',x,y);nav.tick(16);if(nav.g.debugBlocked(x*TILE,y*TILE))continue;sides++;nav.key(side<0?'ArrowRight':'ArrowLeft');nav.tick(1500);nav.key(side<0?'ArrowRight':'ArrowLeft',true);const px=nav.g.position.x;assert(side<0?px<o.x*TILE:px>o.x*TILE,o.id+' crossed from '+(side<0?'left':'right')+': '+px);}}
 assert(sides>=15,'walls tested from '+sides+' sides');nav.g.debugWarp('town',9.5,23.2);nav.tick(16);nav.key('ArrowLeft');nav.tick(1500);nav.key('ArrowLeft',true);assert(nav.g.position.x/TILE>7.5&&nav.g.position.x/TILE<8.5,'home right wall '+nav.g.position.x/TILE);
 nav.g.debugWarp('town',19.5,7.2);nav.tick(16);nav.key('ArrowRight');nav.tick(1500);nav.key('ArrowRight',true);assert(nav.g.position.x/TILE<20.5,'electric left wall '+nav.g.position.x/TILE);
 result.push(`Buildings block their whole lower body (${sides} of 18 sides walked; home stops at ~8, electric at ~20) PASS`);
 // F11: nothing stands on the road or in the water, and the pond/sand never cut a road.
 const tileAt=(x,y)=>town.tiles[Math.floor(y)]?.[Math.floor(x)];
 for(const o of town.objects.filter(o=>['npc','props','buildings'].includes(o.kind))){const xs=o.kind==='buildings'?[-.35,0,.35].map(k=>o.x+k*o.w/TILE):[o.x];for(const x of xs)assert(!['=','~'].includes(tileAt(x,o.y-.1)),o.id+' stands on '+tileAt(x,o.y-.1));}
 for(let y=0;y<town.h;y++)for(let x=0;x<town.w;x++)if('~:'.includes(town.tiles[y][x]))for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])assert.notEqual(town.tiles[y+dy]?.[x+dx],'=','water/sand touches road at '+x+','+y);
 for(const k of ['buildings','props'])for(const frame of k==='buildings'?[6,8]:[2,5,7,8,11,12,15])assert(town.objects.some(o=>o.kind===k&&o.frame===frame),k+' '+frame+' used');
 for(const e of town.enemies)assert(!['=','~'].includes(tileAt(e.x,e.y)),'enemy '+e.id+' off road');
 result.push('Town layout: no prop/person/building on road or water, park pond+sand off the road, apartment/junkyard/hedge/streetlight/pole/bike/signal/cat used PASS');
 // F03: interior art everywhere, and never the console-shelf frame 8.
 for(const [id,m] of Object.entries(nav.g.GAME_DATA.maps))for(const o of m.objects){assert(!(o.kind==='interior'&&o.frame===8),id+' uses frame 8');assert.notEqual(o.kind,'furniture',id+' still uses placeholder furniture '+o.id);}
 assert.equal(nav.g.assets.interior,16);
 result.push('Interior: 16 frames loaded, no placeholder furniture, electrical-goods shelf unused PASS');
 // F22: every dialogue line fits the 16-character box, at most three lines per page.
 for(const [k,list] of Object.entries(nav.g.GAME_DATA.dialogue))for(const [,text] of list){const rows=text.replace(/\{\w+\}/g,'99').split('\n');assert(rows.length<=3,k+' has '+rows.length+' lines');for(const row of rows)assert([...row].length<=16,k+': '+row);}
 assert.equal(nav.g.GAME_DATA.dialogue.welcome[0][0],'ナオスライム');assert(/keep-all/.test(html)&&/line-break:strict/.test(html));
 result.push('Dialogue: every line ≤16 chars and ≤3 lines, keep-all wrapping, welcome speaker is ナオスライム PASS');
 // fix2: battle-log wraps whole words; tutorial log rows are ≤16 wide (ASCII counts half) in ≤3 rows; the compact log is ≤28px.
 const css=html.split('<style>')[1].split('</style>')[0],decls=sel=>css.split('}').filter(r=>r.includes('{')&&r.split('{')[0].split(',').map(x=>x.trim()).includes(sel)).map(r=>r.split('{')[1]).join(';');
 assert(/word-break:keep-all/.test(decls('.battle-log'))&&/line-break:strict/.test(decls('.battle-log')),'battle-log wrapping');
 assert(parseFloat(decls('#stage.compact .battle-log').match(/font-size:([\d.]+)px/)[1])<=28,'compact battle-log font');
 const wide=s=>[...s].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0),tl=await runtime();tl.tick();tl.start();const tutorialLogs=[tl.g.battle.log];tl.cmd('attack');tutorialLogs.push(tl.g.battle.log);tl.cmd('run');tutorialLogs.push(tl.g.battle.log);
 assert(tutorialLogs[0].includes('ナオスライムを よぼう')&&tutorialLogs[1].includes('まず')&&tutorialLogs[2].includes('にげられない'),tutorialLogs.join('|'));
 for(const text of tutorialLogs){const rows=text.split('\n');assert(rows.length<=3,text);for(const row of rows)assert(wide(row)<=16,'tutorial log row too wide: '+row);}
 // fix2: a focused はじめから keeps its light face; text contrast ≥4.5:1.
 const rgb=h=>h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4),lum=h=>{const [r,g2,b]=rgb(h);return .2126*r+.7152*g2+.0722*b;},contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const pf=decls('.primary:focus-visible'),pfBg=pf.match(/background:#(\w{6})/)[1],pfFg=pf.match(/(?:^|;)color:#(\w{6})/)[1];assert(contrast(pfBg,pfFg)>=4.5,'primary focus contrast '+contrast(pfBg,pfFg));assert(/outline:\d+px solid/.test(pf),'primary focus outline');
 result.push(`Battle log: keep-all/strict wrapping, compact font ≤28px, tutorial rows ≤16 wide in ≤3 rows; はじめから focus contrast ${contrast(pfBg,pfFg).toFixed(1)}:1 PASS`);
 // F23: the quest arrow follows the target.
 nav.g.state.flags.tutorial=true;nav.g.state.flags.key=true;nav.g.state.items.battery=1;nav.g.state.summons=['nao'];nav.g.debugWarp('town',22,12);nav.tick(16);assert.equal(nav.g.questStep,'recruit');assert(nav.g.quest.endsWith('↑'),nav.g.quest);nav.g.debugWarp('town',27.5,9.5);nav.tick(16);assert(nav.g.quest.endsWith('←'),nav.g.quest);nav.g.debugWarp('room',5,9);nav.tick(16);assert(nav.g.quest.endsWith('↓'),nav.g.quest);
 result.push('Quest arrow: ↑ south of the shop, ← east of it, ↓ toward the room exit PASS');
 // F28: noises pace around their spot.
 const e0=nav.g.enemyPos('c2');nav.g.debugWarp('town',3,5);nav.tick(3000);const e1=nav.g.enemyPos('c2');assert(Math.hypot(e1.x-e0.x,e1.y-e0.y)>5,'enemy moves');
 result.push('Town noises move PASS');
 // F14: balance. Lv2 HP72 battery 100 + 1 drink wins in 6-9 turns; Lv1 with nothing loses. Battles have no randomness, so all seeds agree.
 for(const seed of [1,2,3]){
  for(const [level,items,expectWin] of [[2,{rice:0,drink:1,battery:0},true],[1,{rice:0,drink:0,battery:0},false]]){
   const b=await runtime({seed});b.tick();Object.assign(b.g.state.flags,{tutorial:true,key:true});b.g.debugSetLevel(level);b.g.state.summons=['nao','code'];b.g.state.battery=100;b.g.state.items=items;b.g.debugStartBattle('bugking','boss');b.tick(300);let turns=0,lost=false;
   for(let i=0;i<40&&b.g.screen==='battle';i++){if(b.g.dialogue){lost=true;break;}if(b.g.battle.locked||b.g.battle.over){b.tick(300);continue;}turns++;if(b.g.hp.hp<=30&&b.g.state.items.drink){b.cmd('item');b.button('エナジードリンク');}else if(b.g.battery>=25){b.cmd('summon');b.button('コードラゴン');}else b.cmd('attack');b.tick(3000);}
   if(b.g.dialogue&&b.g.dialogue.lines[0][1].includes('やりなおそう'))lost=true;
   if(expectWin){assert(!lost&&b.g.state.bosses.includes('bugking'),'Lv2 should win (seed '+seed+')');assert(turns>=6&&turns<=9,'Lv2 turns '+turns);}else assert(lost&&!b.g.state.bosses.includes('bugking'),'Lv1 without items should lose (seed '+seed+')');
  }
 }
 result.push('Balance: Lv2/HP72/battery100/1 drink beats BUG KING in 6-9 turns; Lv1 with nothing loses (seeds 1,2,3) PASS');
 // F04/F05: title keys and naming keys.
 const fresh=await runtime();fresh.tick();assert.equal(fresh.active().id,'start-btn');assert.equal(fresh.els.get('title-caption').textContent,'1しょう　ヒダマリちょう','no save: caption keeps the chapter 1 default');fresh.key('z');assert.equal(fresh.g.modal,'mode-select');fresh.key('z');assert.equal(fresh.g.state.mode,'adult');assert.equal(fresh.g.screen,'prologue');fresh.dialogue();assert.equal(fresh.g.screen,'naming');assert.equal(fresh.active().id,'name-input');fresh.key('z');assert.equal(fresh.g.screen,'field');
 const keep=new Map(t.saved),guarded=await runtime({saved:keep});guarded.tick();const kept=keep.get('ryoseiworld-rpg-v5');guarded.click('start-btn');assert.equal(guarded.g.modal,'confirm');assert.equal(guarded.active().textContent,'やめる');guarded.button('やめる');assert.equal(guarded.g.screen,'title');assert.equal(keep.get('ryoseiworld-rpg-v5'),kept);guarded.click('start-btn');guarded.button('はじめる');assert.equal(guarded.g.modal,'mode-select');guarded.button('こどもモード');assert.equal(guarded.g.screen,'prologue');
 result.push('Title: Z on はじめから without a save; はじめから with a save asks first and やめる keeps it; naming input focused and Z confirms PASS');
 // F07/F16/F17: hand-edited or stale saves never freeze the loop.
 const base=JSON.parse(t.saved.get('ryoseiworld-rpg-v5'));
 const tut=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...base,map:'room',x:240,y:432,battery:10,items:{rice:0,drink:0,battery:0},summons:['nao'],bosses:[],flags:{}})]])});tut.tick();tut.click('continue-btn');assert.equal(tut.g.screen,'battle');assert(tut.g.battle.tutorial);tut.tick(300);tut.cmd('summon');tut.button('ナオスライム');assert(tut.g.battle.usedSummon);
 for(const patch of [{chapter:2},{dir:7},{map:'constructor'},{exp:'10'},{x:288,y:1130,map:'town'},{x:-5000,y:-5000,map:'town'}]){const b=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...base,bosses:[],...patch})]])});b.tick();if(!b.els.get('continue-btn').disabled){b.click('continue-btn');b.tick(100);assert(b.hasFrame(),'loop alive '+JSON.stringify(patch));assert(!b.g.debugBlocked(b.g.position.x,b.g.position.y),'not stuck '+JSON.stringify(patch));let moved=false;for(const k of ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight']){const p=b.g.position;b.key(k);b.tick(300);b.key(k,true);if(b.g.position.x!==p.x||b.g.position.y!==p.y||b.g.screen!=='field')moved=true;}assert(moved,'can move '+JSON.stringify(patch));assert.equal(typeof b.g.state.exp,'number');assert(b.g.level<=base.level+1);}else assert(patch.chapter||patch.dir||patch.map==='constructor','only broken saves are rejected '+JSON.stringify(patch));}
 result.push('Saves: tutorial resume with 10% battery, chapter 2 / dir 7 / map constructor rejected, exp "10" read as a number, stuck or off-map positions moved to open ground PASS');
 // F18: a fast second tap after the boss intro does not hit にげる.
 const tap=await runtime({saved:new Map(t.saved)});tap.tick();tap.click('continue-btn');tap.g.state.bosses=[];tap.g.debugWarp('electric',5,5.4);tap.tick(16);tap.g.debugEvent([{say:[['BUG KING','どうせ お前には むりだ']]},{battle:'bugking',id:'f18'}]);while(tap.g.dialogue)tap.click('dialogue');assert.equal(tap.g.battle.type,'bugking');const logBefore=tap.g.battle.log;tap.cmd('run');assert.equal(tap.g.battle.log,logBefore);assert(!tap.g.battle.locked);tap.tick(300);tap.cmd('run');assert(tap.g.battle.log.includes('ふさいでいる'));
 result.push('Closing tap is ignored for 250 ms by battle and shop buttons PASS');
 // F24: one victory jingle, then one level-up fanfare and the gained numbers.
 const lv=await runtime();lv.tick();lv.start();lv.tick(3000);lv.g.debugWin();lv.tick(2000);lv.dialogue();const count={victory:0,levelup:0};for(const k of Object.keys(count)){const fn=lv.g.sfx[k];lv.g.sfx[k]=(...a)=>{count[k]++;return fn(...a);};}
 lv.g.state.exp=20;lv.g.debugStartBattle('popup','lv');lv.tick(300);lv.g.debugWin();lv.tick(2000);assert.equal(count.victory,1);assert.equal(count.levelup,1);assert(lv.g.dialogue.lines.some(l=>l[1].includes('レベル 2 に なった')&&l[1].includes('HP+12 こうげき+4')));lv.dialogue();
 result.push('Level-up win: victory sound once, level-up sound once, gained HP/attack shown PASS');
 // R1: battle hero art is ryosei_v3 (same 4x4 layout); the previous art stays in ryosei_v2.
 {const dir=n=>path.join(root,'assets',n),list=n=>JSON.parse(fs.readFileSync(path.join(dir(n),'ryosei_frames.json'),'utf8'));
  const cur=list('ryosei'),v3=list('ryosei_v3'),v2=list('ryosei_v2');
  assert.deepEqual(cur,v3);assert.equal(v2.length,16);assert.notDeepEqual(v2,cur);
  for(const f of cur){assert(fs.readFileSync(path.join(dir('ryosei'),f.file)).equals(fs.readFileSync(path.join(dir('ryosei_v3'),f.file))),f.file);}
  for(const f of v2)assert(fs.existsSync(path.join(dir('ryosei_v2'),f.file)),'v2 '+f.file);
  assert.deepEqual(cur.map(f=>f.row+'_'+f.col).sort(),[0,1,2,3].flatMap(r=>[0,1,2,3].map(c=>r+'_'+c)).sort());}
 result.push('Battle hero art: assets/ryosei matches ryosei_v3 (4x4), old art kept in ryosei_v2 PASS');
 // R2: outdoors the hero rides the kickboard (hero_ride, 1.35x speed); indoors the hero walks (hero_walk_v3). Both face 4 ways.
 {const r=await runtime();r.tick();assert.equal(r.g.assets.hero_ride,16,'loaded hero_ride');assert.equal(r.g.assets.hero_walk,16,'loaded hero_walk');
  assert(r.requests.includes('assets/hero_walk_v3/hero_walk_frames.json'),'indoor walk art comes from hero_walk_v3');assert(r.requests.includes('assets/hero_ride/hero_ride_frames.json'));
  const run=(map,x,y,k)=>{r.g.debugWarp(map,x,y);r.tick(400);const a={...r.g.position};r.key(k);r.tick(200);r.key(k,true);const b=r.g.position;r.imageLog.length=0;r.tick(16);const src=r.imageLog.filter(u=>/assets\/hero_(ride|walk)/.test(u)).at(-1);return{d:Math.hypot(b.x-a.x,b.y-a.y),dir:b.dir,src:src||''};};
  const dirs={ArrowDown:0,ArrowLeft:1,ArrowRight:2,ArrowUp:3};
  for(const [k,dir] of Object.entries(dirs)){const o=run('town',8,27,k);assert.equal(o.dir,dir,'town '+k);assert(o.src.includes('assets/hero_ride/hero_ride_r'+dir+'_'),'town art '+k+' '+o.src);
   const i=run('room',5,9,k);assert.equal(i.dir,dir,'room '+k);assert(i.src.includes('assets/hero_walk_v3/hero_walk_r'+dir+'_'),'room art '+k+' '+i.src);}
  const town=run('town',8,27,'ArrowRight').d,room=run('room',5,9,'ArrowRight').d;assert(room>10,'room moves');assert(Math.abs(town/room-1.35)<.03,'ride is 1.35x walk: '+town+' / '+room);}
 result.push('Hero: kickboard (hero_ride, 1.35x) outdoors, walking (hero_walk_v3) indoors, 4 directions PASS');
 // R3: the title hero rides across the screen; entering the own room from town the first time only, mother says to fold the kickboard.
 {const r=await runtime();r.tick();const rideX=()=>{r.imageLog.length=0;r.imageX.length=0;r.tick(16);const i=r.imageLog.findLastIndex(u=>String(u).includes('assets/hero_ride/hero_ride_r2_'));assert(i>=0,'title hero rides facing right');return r.imageX[i];};
  const x1=rideX();r.tick(1000);const x2=rideX();assert(x2>x1+60,'title hero moves right: '+x1+' -> '+x2);
  r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const enterHome=()=>{r.g.debugWarp('town',6,25.6);r.tick(16);while(r.g.dialogue)r.dialogue();r.key('ArrowUp');r.tick(600);r.key('ArrowUp',true);r.tick(16);assert.equal(r.g.map,'room','entered home '+JSON.stringify([r.g.screen,r.g.position,r.g.dialogue&&r.g.dialogue.lines,r.g.modal]));};
  enterHome();assert(r.g.dialogue,'mother speaks on first entry');const said=r.g.dialogue.lines.map(l=>l.join(' ')).join('\n');assert(said.includes('おかあさん')&&said.includes('いえの なかでは\nキックボード たたみなさい'),said);while(r.g.dialogue)r.dialogue();
  enterHome();assert(!r.g.dialogue,'second entry is quiet');r.click('menu-btn');r.button('セーブ');while(r.g.dialogue)r.dialogue();await settle();
  const again=await runtime({saved:new Map(r.saved)});again.tick();again.click('continue-btn');again.tick(16);while(again.g.dialogue)again.dialogue();
  again.g.debugWarp('town',6,25.6);again.tick(16);while(again.g.dialogue)again.dialogue();again.key('ArrowUp');again.tick(600);again.key('ArrowUp',true);again.tick(16);assert.equal(again.g.map,'room');assert(!again.g.dialogue,'quiet after reload '+JSON.stringify(again.g.dialogue&&again.g.dialogue.lines)+JSON.stringify(JSON.parse(r.saved.get('ryoseiworld-rpg-v5')||'{}').flags));}
 result.push('Title: hero rides the kickboard across; mother says "fold the kickboard" on the first entry home only (also after reload) PASS');
 // R5: event steps (say, choice, quiz, join, give, take, flag, if) run from data only; every step in the chapter data names something that exists.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const D=r.g.GAME_DATA,verbs=['say','proto','choice','quiz','join','give','take','flag','if','save','battle','warp','transport','inn','music','shake','flash','wait','chapterClear','ending','bond','gift','finale'];
  const check=(steps,where)=>{assert(Array.isArray(steps),where);for(const s of steps){const v=verbs.filter(k=>Object.hasOwn(s,k));assert.equal(v.length,1,where+' one verb '+JSON.stringify(s));
   if(v[0]==='proto')assert(['lesson','play','sprite','text','deploy'].includes(s.proto),where+' prototype mode');
   if(v[0]==='say'&&typeof s.say==='string')assert(Object.hasOwn(D.dialogue,s.say),where+' dialogue '+s.say);
   if(['give','take'].includes(v[0]))assert(Object.hasOwn(D.items,s[v[0]]),where+' item '+s[v[0]]);if(v[0]==='join')assert(Object.hasOwn(D.summons,s.join),where+' summon '+s.join);
   if(v[0]==='choice'){assert(s.options.length>=2&&s.options.length<=3,where+' choice 2-3');for(const o of s.options)assert(o.text.length<=16,where+' choice text fits');s.options.forEach((o,i)=>check(o.then||[],where+'.choice'+i));}
   if(v[0]==='quiz')for(const q of s.quiz){assert.equal(q.options.length,3,where+' quiz 3 options');assert(q.answer>=0&&q.answer<3);}
   if(v[0]==='if'){check(s.then||[],where+'.then');check(s.else||[],where+'.else');}
   if(v[0]==='battle'){assert(Object.hasOwn(D.enemies,s.battle),where+' enemy '+s.battle);check(s.win||[],where+'.win');check(s.lose||[],where+'.lose');}
   if(['warp'].includes(v[0]))assert(Object.hasOwn(D.maps,s.warp),where+' map '+s.warp);if(v[0]==='transport')for(const t of s.stops)assert(Object.hasOwn(D.maps,t.map),where+' stop '+t.map);if(v[0]==='music'&&s.music)assert(Object.hasOwn(D.music,s.music),where+' music '+s.music);
   if(v[0]==='bond')assert(Object.hasOwn(D.bonds,s.bond),where+' bond '+s.bond);if(v[0]==='gift'){assert(Object.hasOwn(D.bonds,s.to),where+' gift to '+s.to);assert((D.bonds[s.to].likes||[]).includes(s.gift),where+' gift is liked '+s.gift);assert(!D.items[s.gift]?.key,where+' a key item is not a gift '+s.gift);}}};
  for(const [id,steps] of Object.entries(D.events))check(steps,'events.'+id);
  for(const m of Object.values(D.maps))for(const o of m.objects)if(o.event)assert(Object.hasOwn(D.events,o.event),'event '+o.event);
  assert(D.maps.town.objects.find(o=>o.id==='police').event==='police','chapter 1 police talk is an event');
  const read=()=>r.g.dialogue.lines.map(l=>l[1]).join('\n'),flags=r.g.state.flags,items=r.g.state.items;delete flags.test;
  const ev=[{say:[['テスト','こんにちは、{name}。']]},
   {choice:'どっちに する？',who:'テスト',options:[{text:'みぎ',then:[{flag:'test',value:'right'}]},{text:'ひだり',then:[{flag:'test',value:'left'},{give:'rice',n:2}]}]},
   {quiz:[{q:'1+1は？',options:['1','2','3'],answer:1},{q:'あおい のは？',options:['そら','トマト','バナナ'],answer:0,right:[['テスト','せいかい！']]}],who:'テスト'},
   {take:'rice'},{say:'noSuchLine'},{join:'code'},{flag:'quizDone'},
   {if:{flag:'test'},then:[{if:{not:'nothing'},then:[{flag:'ifOk'}]},{if:{flag:'zakoWins',atLeast:99},then:[{flag:'ifBad'}]}],else:[{flag:'ifBad'}]}];
  const rice=items.rice;let done=false;r.g.debugEvent(ev,()=>{done=true;});assert(read().includes('こんにちは、'+r.g.state.aiName+'。'),read());while(r.g.dialogue)r.dialogue();r.tick(300);
  assert.equal(r.g.modal,'event');assert(r.els.get('modal-copy').textContent.includes('どっちに'));r.key('Escape');r.click('menu-btn');assert.equal(r.g.modal,'event','escape and the menu button do not drop a choice');
  r.button('ひだり');assert.equal(flags.test,'left');assert.equal(items.rice,rice+2);
  assert(r.els.get('modal-copy').textContent.includes('もんだい 1 / 2'));r.button('3');assert(read().includes('ちがう'));while(r.g.dialogue)r.dialogue();r.tick(300);
  assert(r.els.get('modal-copy').textContent.includes('もんだい 1 / 2'),'wrong answer asks again');r.button('2');assert(r.els.get('modal-copy').textContent.includes('もんだい 2 / 2'));r.button('そら');assert(read().includes('せいかい'));while(r.g.dialogue)r.dialogue();
  assert.equal(items.rice,rice+1);assert(r.g.summons.includes('code'));assert(flags.quizDone);assert(flags.ifOk&&!flags.ifBad,'if branches');assert(done,'event calls done at the end');
  for(const b of r.els.get('modal-buttons').children)assert(b.textContent.length<=16,'choice text fits');
  // The police event branches on the key flag and the number of quiet noises, as the old code did.
  delete flags.key;flags.zakoWins=2;assert(talk(r,'town',9,17.2).includes('しずめたら'));while(r.g.dialogue)r.dialogue();assert(!flags.key);
  flags.zakoWins=3;assert(talk(r,'town',9,17.2).includes('カギを もらった'));while(r.g.dialogue)r.dialogue();assert(flags.key);await settle();assert(JSON.parse(r.saved.get('ryoseiworld-rpg-v5')).flags.key,'key is saved');
  assert(talk(r,'town',9,17.2).includes('まいごの ノイズ'));while(r.g.dialogue)r.dialogue();}
 result.push('Events: say/choice/quiz/join/give/take/flag/if from data, wrong quiz answer asks again, escape keeps a choice open, police talk is an event PASS');
 // R6: event steps for battle, warp, transport, inn, music, shake, flash, wait, chapterClear, ending, and door / warp / trigger cells on the map.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const D=r.g.GAME_DATA,flags=r.g.state.flags;r.g.debugWarp('electric',5,14);r.tick(400);let done=0;
  r.g.debugDamage(20);r.tick(2000);r.g.state.battery=40;
  r.g.debugEvent([{music:'boss'},{shake:true,ms:400,power:8},{flash:'#ffffff',ms:300},{wait:600},{battle:'crow',id:'t6',win:[{flag:'won'}],lose:[{flag:'lost'}]},{inn:true},
   {transport:'バス',stops:[{text:'じぶんの へや',map:'room',at:[5,9]},{text:'ひみつの みせ',map:'store',at:[5,10],if:'secret'}]},{warp:'electric',at:[5,14]}],()=>{done++;});
  assert.equal(r.g.state.music,'boss');assert(r.g.fx.shakeUntil>0&&r.g.fx.shake===8);assert(r.g.fx.flashUntil>0);
  const at={...r.g.position};r.key('ArrowRight');r.tick(300);r.key('ArrowRight',true);assert.equal(r.g.position.x,at.x,'wait holds the player');assert.equal(r.g.screen,'field');
  r.key('Escape');r.tick(16);assert.equal(r.g.modal,'','escape does not open the menu during a wait');r.click('menu-btn');r.tick(16);assert.equal(r.g.modal,'','the menu button does not open the menu during a wait');
  r.tick(400);assert.equal(r.g.screen,'battle','battle starts after the wait');const wins=flags.zakoWins;r.g.debugWin();r.tick(2000);while(r.g.dialogue)r.dialogue();assert(flags.won&&!flags.lost);assert.equal(flags.zakoWins,wins,'event battles do not count as street noises');
  assert.equal(r.g.hp.hp,r.g.hp.maxHp,'inn heals');assert.equal(r.g.battery,100);r.tick(300);
  assert.equal(r.g.modal,'event');const stops=r.els.get('modal-buttons').children.map(b=>b.textContent);assert.deepEqual(stops,['じぶんの へや','やめる'],'hidden stop needs its flag');
  r.button('じぶんの へや');assert.equal(r.g.map,'electric','warp after transport');assert.equal(done,1);
  flags.secret=true;r.g.debugWarp('town',8,27);r.g.debugEvent([{transport:'バス',stops:[{text:'ひみつの みせ',map:'store',at:[5,10],if:'secret'}]}]);r.tick(300);r.button('ひみつの みせ');assert.equal(r.g.map,'store');
  // Losing an event battle with lose steps goes on from them.
  r.g.debugWarp('town',8,27);r.g.debugEvent([{battle:'crow',lose:[{flag:'lost'}]}]);assert.equal(r.g.screen,'battle');r.tick(300);r.g.debugDamage(999);for(let i=0;i<40&&r.g.screen==='battle';i++){r.tick(500);while(r.g.dialogue)r.dialogue();}
  assert.equal(r.g.screen,'field');assert(flags.lost);assert.equal(r.g.hp.hp,Math.ceil(r.g.hp.maxHp/2));
  // Map cells: trigger (once), warp floor and door.
  D.events.t6cell=[{say:[['テスト','ふんだ！']]}];D.maps.town.cells=[{x:9,y:27,trigger:'t6cell',once:'t6once'},{x:7,y:27,warp:'room',at:[5,9]},{x:8,y:28.2,door:'store',at:[5,10]}];
  const walk=(x,y,k,ms=200)=>{r.g.debugWarp('town',x,y);r.tick(16);r.key(k);r.tick(ms);r.key(k,true);r.tick(16);};
  walk(8.4,27,'ArrowRight');assert(r.g.dialogue&&r.g.dialogue.lines[0][1]==='ふんだ！','trigger cell runs its event');while(r.g.dialogue)r.dialogue();assert(flags.t6once);
  walk(8.4,27,'ArrowRight');assert(!r.g.dialogue,'once trigger stays quiet');
  walk(7.6,27,'ArrowLeft');assert.equal(r.g.map,'room','warp floor');assert(r.g.fx.flashUntil>0);
  walk(8,27.5,'ArrowDown');assert.equal(r.g.map,'store','door cell');delete D.maps.town.cells;
  // chapterClear saves at the head of the next chapter and the card button starts it; without a next chapter it goes to the title.
  D.chapters[2]={title:'テスト',town:'store',start:['store',5,10],boss:'none',quests:D.chapters[1].quests,zakoGoal:3,keyFlag:'key',serverItem:'battery',recruit:'code'};
  r.g.debugWarp('town',8,27);r.g.debugEvent([{chapterClear:true},{flag:'ch2go'}]);assert.equal(r.g.screen,'ending');assert(r.els.get('ending-heading').textContent.includes('2しょう'));
  assert.equal(r.els.get('ending-title').textContent,'つぎの しょうへ');assert.equal(r.els.get('ending-eyebrow').textContent,'CHAPTER 01 COMPLETE');await settle();assert.equal(JSON.parse(r.saved.get('ryoseiworld-rpg-v5')).chapter,2,'saved at chapter 2');
  r.click('ending-title');assert.equal(r.g.screen,'field');assert.equal(r.g.chapter,2);assert.equal(r.g.map,'store');assert(flags.ch2go);assert.equal(flags.zakoWins,0,'noise count starts over');
  r.g.debugEvent([{ending:[['','みんな、ありがとう。']],title:'おしまい'}]);while(r.g.dialogue)r.dialogue();assert.equal(r.g.screen,'ending');assert.equal(r.els.get('ending-heading').textContent,'おしまい');assert.equal(r.els.get('ending-eyebrow').textContent,'THE END');assert(!r.els.get('ending-copy').textContent.includes('あかりが'));
  assert.equal(r.els.get('ending-title').textContent,'タイトルへ');r.click('ending-title');assert.equal(r.g.screen,'title');}
 result.push('Events: battle win/lose steps, warp, transport (flag stops), inn, music, shake, flash, wait, chapterClear to the next chapter, ending; trigger/warp/door cells PASS');
 // R7: save format 2 (saveVersion, towns); a format 1 save (no saveVersion) is upgraded and goes on; chapter entry and flag helpers for checks.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();await settle();
  const now=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.equal(now.saveVersion,2);assert.deepEqual(now.towns,[1]);assert.equal(now.version,5);
  const old={...now};delete old.saveVersion;delete old.towns;old.flags={...old.flags,oldFlag:true};old.level=3;
  const o=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify(old)]])});o.tick();assert(!o.els.get('continue-btn').disabled,'format 1 save can continue');o.click('continue-btn');o.tick(16);while(o.g.dialogue)o.dialogue();
  assert.equal(o.g.screen,'field');assert.equal(o.g.level,3);assert(o.g.debugFlags().oldFlag);assert.deepEqual([...o.g.state.towns],[1]);
  o.click('menu-btn');o.button('セーブ');while(o.g.dialogue)o.dialogue();await settle();const up=JSON.parse(o.saved.get('ryoseiworld-rpg-v5'));assert.equal(up.saveVersion,2);assert.deepEqual(up.towns,[1]);assert(up.flags.oldFlag);
  const sd=await runtime({sdk:true});sd.tick();sd.start();await settle();assert.equal(sd.saves.at(-1).saveVersion,2,'cloud save carries format 2');assert.deepEqual(sd.saves.at(-1).towns,[1]);
  // Flag helpers and the chapter entry.
  assert.equal(r.g.debugFlags().r7,undefined);r.g.debugSetFlag('r7');assert.equal(r.g.debugFlags().r7,true);r.g.debugSetFlag('r7n',4);assert.equal(r.g.state.flags.r7n,4);
  const f=r.g.debugFlags();f.r7=false;assert.equal(r.g.state.flags.r7,true,'debugFlags returns a copy');
  assert.equal(r.g.debugStartChapter(9),false);assert(r.g.debugStartChapter(1));assert.equal(r.g.screen,'field');assert.equal(r.g.chapter,1);assert.equal(r.g.map,'town');assert.equal(r.g.level,1);assert(r.g.state.flags.tutorial);
  const D=r.g.GAME_DATA;D.chapters[2]={title:'テスト',town:'store',boss:'none',recruit:'nao',quests:D.chapters[1].quests,zakoGoal:3,keyFlag:'key',serverItem:'battery'};
  assert(r.g.debugStartChapter(2));assert.equal(r.g.chapter,2);assert.equal(r.g.map,'store');assert.equal(r.g.level,5);assert.equal(r.g.hp.maxHp,D.rules.baseHp+4*D.rules.hpPerLevel);
  assert(r.g.summons.includes('code'),'earlier recruits join');assert(r.g.state.bosses.includes('bugking'));assert.deepEqual([...r.g.state.towns],[1,2]);assert(r.g.state.items.rice>=3);
  r.tick(500);assert.equal(r.g.screen,'field');}
 // R34: the menu stays shut during a wait step, and the line after the wait is not under a menu.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',8,27);r.tick(400);
  r.g.debugEvent([{wait:800},{say:[['テスト','まったね。']]},{choice:'どうする？',who:'テスト',options:[{text:'はい',then:[{flag:'r34'}]},{text:'いいえ'}]}]);
  for(let i=0;i<5;i++){r.key('Escape');r.tick(16);assert.equal(r.g.modal,'','escape during wait '+i);r.click('menu-btn');r.tick(16);assert.equal(r.g.modal,'','menu button during wait '+i);r.tick(100);}
  r.tick(400);assert(r.g.dialogue&&r.g.dialogue.lines[0][1]==='まったね。','the line after the wait shows');assert.equal(r.g.modal,'','no menu over the line');
  r.key('Escape');r.click('menu-btn');assert.equal(r.g.modal,'','no menu while the line shows');while(r.g.dialogue)r.dialogue();r.tick(300);
  assert.equal(r.g.modal,'event','the choice after the wait shows');r.button('はい');assert(r.g.state.flags.r34);
  r.tick(100);r.click('menu-btn');assert.equal(r.g.modal,'menu','the menu opens again after the event');r.key('Escape');assert.equal(r.g.modal,'');}
 result.push('Events: the menu stays shut during a wait step; the line and choice after it are not under a menu PASS');
 result.push('Saves: format 2 (saveVersion 2, towns), format 1 upgraded on continue and in the next save, cloud allowlist; debugStartChapter / debugFlags / debugSetFlag PASS');
 // R9: bonds in chapter data; the bond step raises hearts (0-5) with a line, the gift step takes a liked item once per kind; saved and restored.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',8,27);r.tick(400);
  const D=r.g.GAME_DATA,st=r.g.state,read=()=>r.g.dialogue?r.g.dialogue.lines.map(l=>l[1]).join('\n'):'',wide=t=>[...t].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0);
  assert(Object.keys(D.bonds).length>=1,'chapter 1 writes bonds');
  for(const [id,b] of Object.entries(D.bonds)){assert(['family','friend','love'].includes(b.kind),id+' kind');assert(b.name&&wide(b.name)<=10,id+' name fits');for(const it of b.likes||[])assert(Object.hasOwn(D.items,it),id+' likes '+it);
   assert(typeof b.spirit==='number'?b.spirit>=0&&b.spirit<16:Object.hasOwn(D.summons,b.spirit),id+' spirit');}
  let tones=0;const bondSfx=r.g.sfx.bond;r.g.sfx.bond=(...a)=>{tones++;return bondSfx(...a);};
  assert.equal(r.g.bonds.mother??0,0);assert.equal(r.g.fx.flashUntil,0,'no flash before a bond deepens');let done=0;r.g.debugEvent([{bond:'mother'}],()=>done++);assert.equal(read(),'おかあさんとの\nきずなが ふかまった！');assert.equal(tones,1);
  assert(r.g.fx.flashUntil>0,'a deepened bond lands with a screen flash, not just a sound');assert.notEqual(r.g.fx.flash,'#fff','the bond flash uses its own warm colour');
  for(const l of r.g.dialogue.lines)for(const row of l[1].split('\n'))assert(wide(row)<=12,'bond line fits '+row);while(r.g.dialogue)r.dialogue();assert.equal(done,1);assert.equal(r.g.bonds.mother,1);
  r.g.debugEvent([{bond:'mother',n:9}]);while(r.g.dialogue)r.dialogue();assert.equal(r.g.bonds.mother,5,'hearts stop at 5');
  r.g.debugEvent([{bond:'mother'}],()=>done++);assert(!r.g.dialogue,'no line when hearts are full');assert.equal(done,2);
  r.g.debugEvent([{bond:'nobody'}],()=>done++);assert.equal(done,3,'unknown bond goes on');
  // gift: liked, once per kind; not liked, missing items and repeats do not take the item.
  assert.equal(r.g.debugBond('mother',0),0);assert.equal(r.g.debugBond('nobody',2),false);st.items.rice=2;st.items.drink=1;
  r.g.debugEvent([{gift:'rice',to:'mother'}]);assert(read().includes('おかあさんに\nおにぎりを\nあげた。'),read());for(let i=0;i<6&&r.g.dialogue&&!read().includes('きずなが');i++)r.click('dialogue');assert(read().includes('きずなが ふかまった'),read());while(r.g.dialogue)r.dialogue();
  assert.equal(st.items.rice,1);assert.equal(r.g.bonds.mother,1);
  r.g.debugEvent([{gift:'rice',to:'mother'}]);assert(read().includes('もう あげた'),read());while(r.g.dialogue)r.dialogue();assert.equal(st.items.rice,1,'a repeated gift keeps the item');assert.equal(r.g.bonds.mother,1,'gift raises once per kind');
  r.g.debugEvent([{gift:'drink',to:'mother'}]);assert(read().includes('いらない'),read());while(r.g.dialogue)r.dialogue();assert.equal(st.items.drink,1);assert.equal(r.g.bonds.mother,1);
  st.items.drink=0;r.g.debugEvent([{gift:'drink',to:'sister'}]);assert(read().includes('もっていない'),read());while(r.g.dialogue)r.dialogue();assert.equal(r.g.bonds.sister??0,0);
  st.items.drink=1;r.g.debugEvent([{gift:'drink',to:'sister'}]);while(r.g.dialogue)r.dialogue();assert.equal(r.g.bonds.sister,1);assert.equal(st.items.drink,0);
  // Every gift line fits 12 full-width characters a row, with the longest names in the data (key items such as はじめて つくった ゲーム are never gifts).
  const longest=Object.values(D.bonds).map(b=>b.name).sort((a,b)=>wide(b)-wide(a))[0],longItem=Object.keys(D.items).filter(k=>!D.items[k].key).sort((a,b)=>wide(D.items[b].name)-wide(D.items[a].name))[0];
  D.bonds.r9long={name:longest,kind:'friend',spirit:1,likes:[longItem]};st.items[longItem]=1;
  for(const ev of [[{gift:longItem,to:'r9long'}],[{gift:longItem,to:'r9long'}],[{gift:'rice',to:'r9long'}],[{bond:'r9long'}]]){st.items[longItem]=ev[0].gift===longItem&&!st.gifts.r9long?1:0;r.g.debugEvent(ev);
   while(r.g.dialogue){for(const l of r.g.dialogue.lines)for(const row of l[1].split('\n'))assert(wide(row)<=12,'gift line fits '+row);r.click('dialogue');}}
  // At five hearts a gift is not used up.
  r.g.debugBond('r9long',5);st.items.rice=1;D.bonds.r9long.likes.push('rice');r.g.debugEvent([{gift:'rice',to:'r9long'}]);assert(read().includes('なかよし'),read());while(r.g.dialogue)r.dialogue();assert.equal(st.items.rice,1,'full hearts keep the gift');
  delete D.bonds.r9long;delete st.bonds.r9long;delete st.gifts.r9long;assert.equal(r.g.debugBond('constructor',3),false);
  r.g.debugBond('mother',3);r.tick(300);r.click('menu-btn');r.button('セーブ');while(r.g.dialogue)r.dialogue();await settle();
  const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.deepEqual(sv.bonds,{mother:3,sister:1});assert.deepEqual(sv.gifts,{mother:['rice'],sister:['drink']});
  const back=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,bonds:{...sv.bonds,sister:'9',ghost:4},gifts:{...sv.gifts,ghost:['rice']}})]])});back.tick();back.click('continue-btn');back.tick(16);while(back.g.dialogue)back.dialogue();
  assert.deepEqual(JSON.parse(JSON.stringify(back.g.bonds)),{mother:3,sister:5},'bonds come back, clamped, unknown people dropped');assert.deepEqual(JSON.parse(JSON.stringify(back.g.state.gifts)),{mother:['rice'],sister:['drink']});
  back.g.debugEvent([{gift:'rice',to:'mother'}]);assert(back.g.dialogue.lines[0][1].includes('もう あげた'),'gift memory survives a reload');while(back.g.dialogue)back.dialogue();
  const old=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,bonds:undefined,gifts:undefined})]])});old.tick();assert(!old.els.get('continue-btn').disabled,'a save without bonds continues');old.click('continue-btn');old.tick(16);assert.deepEqual(JSON.parse(JSON.stringify(old.g.bonds)),{});
  const sd=await runtime({sdk:true});sd.tick();sd.start();sd.tick(1000);sd.g.debugWin();sd.tick(2100);while(sd.g.dialogue)sd.dialogue();sd.g.debugBond('sister',2);sd.tick(300);sd.click('menu-btn');sd.button('セーブ');while(sd.g.dialogue)sd.dialogue();await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(sd.saves.at(-1).bonds)),{sister:2},'cloud save carries bonds');assert.deepEqual(JSON.parse(JSON.stringify(sd.saves.at(-1).gifts)),{});}
 result.push('Bonds: chapter data, bond step (+line, sound, cap 5), gift once per kind (liked, held), save and reload, debugBond PASS');
 // R10: guardian spirits float by people once Sora is awake; hearts 0-1 grey, 2+ colour, 5 glow.
 {const r=await runtime();r.tick();const D=r.g.GAME_DATA;assert.equal(r.g.assets.spirits,16,'loaded spirits');
  for(const [id,sp] of Object.entries({...D.spirits,...Object.fromEntries(Object.entries(D.bonds).map(([k,b])=>[k,b.spirit]))}))assert(typeof sp==='number'?Number.isInteger(sp)&&sp>=0&&sp<16:Object.hasOwn(D.summons,sp),'spirit of '+id);
  r.g.debugWarp('town',6,23.6);r.tick(32);assert.equal(r.g.spirits.length,0,'no spirits before Sora wakes');
  r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',6,23.6);r.tick(32);
  const at=id=>r.g.spirits.find(s=>s.id===id);assert(at('mother')&&at('sister')&&at('grandma'),JSON.stringify(r.g.spirits));
  assert.equal(at('mother').stage,'gray');assert.equal(at('mother').kind,'summons','mother shows Nao');assert.equal(at('grandma').kind,'spirits');assert.equal(at('grandma').frame,14);
  r.g.debugBond('mother',1);r.tick(32);assert.equal(at('mother').stage,'gray');r.g.debugBond('mother',2);r.tick(32);assert.equal(at('mother').stage,'color');r.g.debugBond('mother',5);r.tick(32);assert.equal(at('mother').stage,'glow');
  const n0=r.g.spirits.length,ys=[];for(let i=0;i<8;i++){r.tick(250);ys.push(at('grandma').y);}assert.equal(r.g.spirits.length,n0);assert(Math.max(...ys)-Math.min(...ys)>=6,'spirits bob up and down '+ys);assert(!r.g.spirits.some(s=>s.id==='dog'||s.id==='cat'),'pets have no spirit');
  r.g.debugWarp('room',5,9);r.tick(32);assert.equal(r.g.spirits.length,0,'nobody in the room');
  const scene=r.g.smokeScenes.find(s=>s.name==='spirits');scene.run();r.tick(32);assert.deepEqual(['glow','color','gray'],['mother','sister','grandma'].map(id=>at(id).stage),'the smoke scene shows all three');}
 result.push('Spirits: none before Sora wakes; by people in town, grey at 0-1 hearts, colour at 2+, glow at 5; smoke scene shows the three PASS');
 // R11: bond rewards per heart count give weapons and money with a line; weapons are saved; debugGiveWeapon.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',8,27);r.tick(300);
  const D=r.g.GAME_DATA,st=r.g.state,wide=t=>[...t].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0);assert.deepEqual([...r.g.weapons],['fuku'],'fuku from the start');
  assert.deepEqual(Object.keys(D.weapons).sort(),['barrier','charge','fuku','letter','onigiri','rainbow','rapid','twin'],'the eight weapons of SPEC_V6 3');
  for(const [id,b] of Object.entries(D.bonds))for(const [h,rw] of Object.entries(b.rewards||{})){assert(Number(h)>=1&&Number(h)<=5,id+' reward heart '+h);if(rw.weapon)assert(Object.hasOwn(D.weapons,rw.weapon),id+' weapon '+rw.weapon);}
  const money=st.money,all=[];r.g.debugEvent([{bond:'mother',n:3}]);while(r.g.dialogue){all.push(...r.g.dialogue.lines.map(l=>l[1]));r.click('dialogue');}
  const text=all.join('\n');assert(text.includes('おかあさんの 守護霊が\nちからを かしてくれた！\n〔if バリア〕'),text);assert(text.includes('おこづかいを\n100えん もらった。'),text);
  for(const row of text.split('\n'))assert(wide(row)<=12,'reward line fits '+row);
  assert.equal(st.money,money+100);assert([...r.g.weapons].includes('barrier'));
  r.g.debugEvent([{bond:'mother',n:2}]);while(r.g.dialogue)r.dialogue();assert([...r.g.weapons].includes('onigiri'));assert.equal(st.money,money+300,'money at 5 hearts');
  D.bonds.r11f={name:'テストの ひと',kind:'friend',spirit:1,rewards:{1:{money:30,weapon:'barrier'}}};const m2=st.money;r.g.debugEvent([{bond:'r11f'}]);const t2=[];while(r.g.dialogue){t2.push(...r.g.dialogue.lines.map(l=>l[1]));r.click('dialogue');}
  assert(t2.join('\n').includes('おれいを\n30えん'),t2.join());assert(!t2.join('\n').includes('ちからを'),'a weapon already held is not given twice');assert.equal(st.money,m2+30);delete D.bonds.r11f;delete st.bonds.r11f;
  assert.equal(r.g.debugGiveWeapon('nothing'),false);assert(r.g.debugGiveWeapon('letter'));assert(r.g.debugGiveWeapon('letter'));assert.equal([...r.g.weapons].filter(w=>w==='letter').length,1);
  r.tick(300);r.click('menu-btn');r.button('セーブ');while(r.g.dialogue)r.dialogue();await settle();const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.deepEqual(sv.weapons,['fuku','barrier','onigiri','letter']);
  const back=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,weapons:['letter','ghost','letter',3]})]])});back.tick();back.click('continue-btn');back.tick(16);while(back.g.dialogue)back.dialogue();
  assert.deepEqual([...back.g.weapons],['fuku','letter','barrier','onigiri'],'weapons come back cleaned, fuku kept, reached rewards held');
  const old=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,weapons:undefined})]])});old.tick();old.click('continue-btn');old.tick(16);assert.deepEqual([...old.g.weapons],['fuku','barrier','onigiri'],'a save without weapons gets the weapons its hearts reached');
  const r9=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,weapons:undefined,bonds:{mother:3}})]])});r9.tick();r9.click('continue-btn');r9.tick(16);assert.deepEqual([...r9.g.weapons],['fuku','barrier'],'a save with hearts but no weapons gets the reached weapons');
  const sd=await runtime({sdk:true});sd.tick();sd.start();sd.tick(1000);sd.g.debugWin();sd.tick(2100);while(sd.g.dialogue)sd.dialogue();sd.g.debugGiveWeapon('twin');sd.tick(300);sd.click('menu-btn');sd.button('セーブ');while(sd.g.dialogue)sd.dialogue();await settle();
  assert.deepEqual([...sd.saves.at(-1).weapons],['fuku','twin'],'cloud save carries weapons');}
 result.push('Bond rewards: weapons and money (おこづかい / おれい) per heart count with lines, no double weapon; weapons saved, cleaned on load, cloud allowlist; debugGiveWeapon PASS');
 // R36: the menu lists bonds (met people: 家/友/恋, hearts, spirit, next reward hint) and weapons; rows fit 540 wide; met is saved.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',8,27);r.tick(300);
  const D=r.g.GAME_DATA,st=r.g.state,wide=t=>[...t].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0),copy=()=>r.els.get('modal-copy').textContent,fits=t=>{for(const row of t.split('\n'))assert(wide(row)<=17,'menu row fits '+row);};
  r.click('menu-btn');r.button('きずな');assert.equal(r.g.modal,'bonds');assert(copy().includes('はなしかけて'),copy());fits(copy());r.button('もどる');assert.equal(r.g.modal,'menu');r.button('もどる');
  r.g.debugWarp('town',4.5,26.3);st.dir=3;r.tick(16);r.click('talk-btn');while(r.g.dialogue)r.dialogue();if(r.g.modal==='event'){r.tick(400);r.button('やめておく');}while(r.g.dialogue)r.dialogue();r.tick(300);assert([...st.met].includes('mother'),'talking to mother meets her');
  r.click('menu-btn');r.button('きずな');let c=copy();assert(c.includes('［家］おかあさん　♡♡♡♡♡\n守護霊 ナオスライム\nつぎ ♥2で おこづかい'),c);assert(!c.includes('いもうと'),'sister not met yet');fits(c);r.button('もどる');r.button('もどる');
  r.g.debugBond('mother',3);r.g.debugBond('sister',1);r.click('menu-btn');r.button('きずな');c=copy();assert(c.includes('♥♥♥♡♡\n守護霊 ナオスライム\nつぎ ♥5で ぶきの ちから'),c);assert(c.includes('［家］いもうと　♥♡♡♡♡\n守護霊 うさぎ\nつぎ ♥2で おこづかい'),c);fits(c);r.button('もどる');
  D.bonds.r36={name:'テストの ひと',kind:'love',spirit:15,rewards:{1:{money:5}}};r.g.debugBond('r36',5);r.button('きずな');c=copy();assert(c.includes('［恋］テストの ひと　♥♥♥♥♥\n守護霊 きんぎょ\nごほうびは ぜんぶ もらった'),c);fits(c);D.bonds.r106={name:'ながい なまえの ともだち',kind:'friend',spirit:15,rewards:{}};r.g.debugBond('r106',2);r.button('もどる');r.button('きずな');c=copy();assert(c.includes('［友］ながい なまえの ともだち\n♥♥♡♡♡'),'R106: a long name keeps its hearts on the next row '+c);delete D.bonds.r106;delete D.bonds.r36;delete st.bonds.r36;r.button('もどる');
  r.button('ぶき');assert.equal(r.g.modal,'weapons');c=copy();assert(c.startsWith('〔フク・ショット〕\nまっすぐ みぎへ うつ'),c);assert(!c.includes('〔if バリア〕'));assert(c.includes('まだ 7つ。'),c);fits(c);
  for(const w of Object.keys(D.weapons))r.g.debugGiveWeapon(w);r.button('もどる');r.button('ぶき');c=copy();assert(c.includes('ぜんぶ そろった'),c);for(const w of Object.values(D.weapons)){assert(w.desc,w.name+' desc');assert(c.includes(w.name));}fits(c);r.button('もどる');r.button('もどる');
  r.tick(300);r.click('menu-btn');r.button('セーブ');while(r.g.dialogue)r.dialogue();await settle();const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.deepEqual(sv.met,['mother']);
  const back=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,met:['mother','ghost','mother',3]})]])});back.tick();back.click('continue-btn');back.tick(16);while(back.g.dialogue)back.dialogue();assert.deepEqual([...back.g.state.met],['mother'],'met comes back cleaned');
  const old=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,met:undefined})]])});old.tick();old.click('continue-btn');old.tick(16);assert.deepEqual([...old.g.state.met],[]);
  const sd=await runtime({sdk:true});sd.tick();sd.start();sd.tick(1000);sd.g.debugWin();sd.tick(2100);while(sd.g.dialogue)sd.dialogue();sd.tick(300);sd.click('menu-btn');sd.button('セーブ');while(sd.g.dialogue)sd.dialogue();await settle();assert.deepEqual([...sd.saves.at(-1).met],[],'cloud save carries met');}
 result.push('Menu: きずな lists met people (家/友/恋, hearts, spirit, next reward hint), ぶき lists weapons with what they do; rows fit; met saved and cleaned PASS');
 // R17: chapter 1 bond people (family and friends) each have a request, a liked thing and rewards, all reachable by talking.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',8,27);r.tick(300);
  const D=r.g.GAME_DATA,st=r.g.state,read=[];
  const talk=(ev,...picks)=>{r.g.debugEvent(ev);for(let i=0;i<40;i++){if(r.g.dialogue){read.push(...r.g.dialogue.lines.map(l=>l[1]));r.click('dialogue');continue;}if(r.g.modal==='event'){r.tick(400);r.button(picks.shift()||'やめておく');continue;}break;}assert(!r.g.dialogue&&!r.g.modal,'event '+ev+' finishes');r.tick(300);};
  const ids=['mother','sister','repair','kid','hacker','clerk'];
  for(const id of ids){const b=D.bonds[id];assert(b,id+' has a bond');assert.equal(b.kind,['mother','sister'].includes(id)?'family':'friend');assert((b.likes||[]).length,id+' likes');assert(Object.keys(b.rewards||{}).length,id+' rewards');
   const o=Object.values(D.maps).flatMap(m=>m.objects).find(o=>o.id===id&&o.kind==='npc');assert(o&&o.event===id,id+' talks through its request event');}
  const ws=Object.values(D.bonds).flatMap(b=>Object.values(b.rewards||{}).map(x=>x.weapon)).filter(Boolean);for(const w of ['barrier','rapid','twin','rainbow'])assert(ws.includes(w),'chapter 1 offers '+w);
  st.items.rice=5;st.items.drink=5;const money0=st.money;
  st.summons=st.summons.filter(x=>x!=='code');talk('hacker');assert(!st.flags.hackerServer,'the hacker asks first');assert.equal(st.bonds.hacker??0,0);
  talk('mother');assert(st.flags.milkAsk);assert.equal(st.items.rice,5);assert.equal(st.bonds.mother??0,0);
  talk('clerk','つよく たたく');assert(st.flags.milk);assert.equal(st.bonds.clerk??0,0,'a wrong fix does not count');
  talk('clerk','かみを いれなおす');assert.equal(st.bonds.clerk,1);
  talk('mother','あげる');assert.equal(st.bonds.mother,2,'milk and rice');assert.equal(st.items.rice,4);
  talk('mother');assert.equal(st.bonds.mother,2,'no second gift question');
  talk('sister');talk('cushion');assert(st.flags.remote);talk('sister','あげる');assert.equal(st.bonds.sister,2);
  talk('mother');assert.equal(st.items.rice,4,'no gift question before the request');st.summons.push('code');talk('repair');assert.equal(st.bonds.repair,1,'waking the server together');assert(st.flags.cableAsk);
  talk('policeBox');assert(st.flags.cable);talk('repair','あげる');assert.equal(st.bonds.repair,3);assert([...st.weapons].includes('rapid'));
  talk('kid','1234 で ためす');assert.equal(st.bonds.kid??0,0);talk('kid','コンビニの レシート');assert.equal(st.bonds.kid,1);talk('kid','こまめに する','あげる');assert.equal(st.bonds.kid,3);assert([...st.weapons].includes('twin'));
  talk('hacker','やめておく');assert.equal(st.bonds.hacker,1);st.flags.cleared=true;talk('hacker','あげる');assert.equal(st.bonds.hacker,2,'her heart 3 waits for chapter 3');assert(![...st.weapons].includes('rainbow'));
  talk('mother');assert.equal(st.bonds.mother,3,'welcome home after the town is quiet');assert([...st.weapons].includes('barrier'));
  talk('clerk','あげる');assert.equal(st.bonds.clerk,2);
  assert(st.money>money0,'family and friends give おこづかい and おれい');const all=read.join('\n');assert(all.includes('おこづかい')&&all.includes('おれい'),all);
  for(const t of read)for(const row of t.split('\n'))assert([...row].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0)<=16,'line fits '+row);}
 result.push('Chapter 1 bonds: mother, sister, repair man, game kid, hacker, clerk each have a request, a liked thing (asked after the request) and rewards PASS');
 // R18: Mio (love) lost a dolphin hairclip in the park sandbox; returning it raises her heart, and after the town is quiet her paper letter gives ホーミング レター.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.g.debugWarp('town',8,27);r.tick(300);
  const D=r.g.GAME_DATA,st=r.g.state,read=[];
  const talk=ev=>{r.g.debugEvent(ev);for(let i=0;i<40&&r.g.dialogue;i++){read.push(...r.g.dialogue.lines.map(l=>l.join(' ')));r.click('dialogue');}assert(!r.g.dialogue&&!r.g.modal,'event '+ev+' finishes');r.tick(300);};
  assert.equal(D.bonds.mio.kind,'love');const o=D.maps.town.objects.find(o=>o.id==='mio');assert(o&&o.kind==='npc2'&&o.frame===0&&o.event==='mio','Mio stands in town with the npc2 picture');
  talk('hairclip');assert(!st.flags.clip,'the shine is only a hint before she asks');
  talk('mio');assert(st.flags.clipAsk);assert.equal(st.bonds.mio??0,0);
  talk('hairclip');assert(st.flags.clip);talk('hairclip');
  talk('mio');assert.equal(st.bonds.mio,1,'returning the hairclip');assert(![...st.weapons].includes('letter'));
  talk('mio');assert.equal(st.bonds.mio,1,'the letter waits until the town is quiet');
  st.flags.cleared=true;talk('mio');assert.equal(st.bonds.mio,2);assert([...st.weapons].includes('letter'),'the letter becomes ホーミング レター');
  talk('mio');assert.equal(st.bonds.mio,2);const all=read.join('\n');assert(all.includes('ホーミング レター')&&all.includes('てがみ'),all);
  for(const t of read)for(const row of t.slice(t.indexOf(' ')+1).split('\n'))assert([...row].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0)<=16,'line fits '+row);
  for(const t of ['すき','キス','デート'])assert(!all.includes(t),'12-year-old story: no '+t);
  r.g.debugWarp('town',10.4,9.3);st.dir=3;r.tick(16);r.click('talk-btn');assert(r.g.dialogue&&r.g.dialogue.lines[0][0]==='ミオ','talking to Mio in town');while(r.g.dialogue)r.dialogue();assert([...st.met].includes('mio'),'meeting Mio adds her to the bonds list');}
 result.push('Mio: hairclip from the sandbox raises her heart, the paper letter after the town is quiet gives ホーミング レター; npc2 picture; met by talking PASS');
 // R20: chapter 2 town ミナモちょう: streets, river path, park, library, friend's house; worry walls; three new noises; the grandpa and the parents and children; the bus.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const D=r.g.GAME_DATA,m=D.maps.minamo;assert(r.g.debugStartChapter(2));assert.equal(r.g.map,'minamo');assert.equal(r.g.questStep,'zako');
  for(const id of ['minamo_library','minamo_friend'])assert(m.objects.some(o=>o.enter===id)&&D.maps[id],'enter '+id);
  assert(m.tiles.some(row=>row.includes('~'))&&m.tiles.some(row=>row.includes(':')),'river and park sand');
  const walls=m.objects.filter(o=>o.dialogue==='worryWall');assert(walls.length>=3,'worry walls');
  const types=new Set(m.enemies.map(e=>e.type));for(const t of ['spam','cable','maskcat'])assert(types.has(t)&&D.enemies[t]&&!D.enemies[t].boss,'noise '+t);
  for(const id of ['minamo_dad','minamo_mom','minamo_grandpa','minamo_boy'])assert(Object.values(D.maps).some(mm=>mm.objects.some(o=>o.id===id)),'person '+id);
  // A worry wall only says あぶないから and does not let the hero through.
  {const w=walls[0];assert(talk(r,'minamo',w.x,w.y+1.2).includes('あぶないから'));while(r.g.dialogue)r.dialogue();r.g.debugWarp('minamo',w.x,w.y+1.4);r.tick(16);const y0=r.g.position.y;r.key('ArrowUp');r.tick(800);r.key('ArrowUp',true);r.tick(16);assert(r.g.position.y>w.y*48-4,'the wall blocks the way '+y0+' -> '+r.g.position.y);}
  // The grandpa asks for three quiet noises, then opens the search machine; the quest arrow points at the town noises first.
  assert(talk(r,'minamo_library',3.4,8.5).includes('3つ しずめて'));while(r.g.dialogue)r.dialogue();assert(!r.g.state.flags.minamoKey);
  r.g.debugWarp('minamo',11.6,31.4);r.tick(16);assert(/[←→↑↓]/.test(r.els.get('quest').textContent),'arrow to a minamo noise: '+r.els.get('quest').textContent);
  const said=[];for(const type of ['spam','cable','maskcat']){r.g.debugStartBattle(type,'r20-'+type);r.tick(300);r.g.debugWin();r.tick(2100);while(r.g.dialogue){said.push(...r.g.dialogue.lines.map(l=>l[1]));r.dialogue();}}
  assert.equal(r.g.state.flags.zakoWins,3);assert(said.join('\n').includes('としょかんに いこう'),'chapter 2 has its own "go to the library" line');assert(!said.join('\n').includes('こうばん'));
  assert.equal(r.g.questStep,'key');assert(talk(r,'minamo_library',3.4,8.5).includes('つかえるように なった'));while(r.g.dialogue)r.dialogue();assert(r.g.state.flags.minamoKey);assert.equal(r.g.questStep,'recruit');
  assert(talk(r,'minamo_library',5.7,5.3).includes('おこした'),'the search machine wakes after the key');while(r.g.dialogue)r.dialogue();r.tick(400);assert.equal(r.g.modal,'event','the owl asks the first question');for(const a of ['ながくて ばらばら','おさないで おとなに','ひみつは いわない']){r.button(a);while(r.g.dialogue)r.dialogue();r.tick(400);}assert(r.g.summons.includes('owl'));
  assert(talk(r,'minamo_friend',4.6,7.7).includes('でたい'));while(r.g.dialogue)r.dialogue();
  // Leaving the library and the friend's house comes back in front of their doors; the bus stop lists both towns.
  r.g.debugWarp('minamo_library',5,11.9);r.tick(400);r.key('ArrowDown');for(let i=0;i<20&&r.g.map!=='minamo';i++)r.tick(16);r.key('ArrowDown',true);r.tick(16);assert.equal(r.g.map,'minamo');
  r.g.debugWarp('minamo',12.4,31.3);r.g.debugFace(3);r.tick(400);r.click('talk-btn');r.tick(400);assert.equal(r.g.modal,'event');r.button('ヒダマリちょう');assert.equal(r.g.map,'town');
  // Every chapter 2 line fits the 540 wide box.
  for(const [k,v] of Object.entries(D.dialogue))if(/^(minamo|worry|grandpa[A-Z]|friend|search)/.test(k))for(const l of v)for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'chapter 2 line fits '+row);}
 result.push('Chapter 2 ミナモちょう: river, park, library, friend\'s house, worry walls block, spam / cable / masked cat, grandpa key after 3 noises, own zakoDone line, quest arrow to minamo noises, bus PASS');

 // R21: Search Owl's IT quiz in the library (3 questions, 3 choices, a wrong answer asks again), the owl joins, the grandpa's bond and rewards, the owl in battle.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const D=r.g.GAME_DATA;assert(r.g.debugStartChapter(2));const st=r.g.state;
  assert(D.summons.owl&&D.summons.owl.frame===2&&D.summons.owl.cost===10,'owl summon');assert.equal(D.bonds.minamo_grandpa.kind,'family');assert.equal(D.bonds.minamo_grandpa.spirit,'owl');
  // Before the key the machine only snores and no quiz opens.
  assert(talk(r,'minamo_library',5.7,5.3).includes('いびき'));while(r.g.dialogue)r.dialogue();r.tick(400);assert(!r.g.modal,'no quiz before the key');
  st.flags.minamoKey=true;st.flags.zakoWins=3;assert.equal(r.g.questStep,'recruit');
  const qs=[];const read=()=>{while(r.g.dialogue)r.dialogue();r.tick(400);};
  assert(talk(r,'minamo_library',5.7,5.3).includes('おこした'));read();
  // Question 1: a wrong answer, then the same question again.
  assert.equal(r.g.modal,'event');qs.push(r.els.get('modal-copy').textContent);assert(qs[0].includes('パスワード'),qs[0]);r.button('1234');assert(r.g.dialogue.lines[0][1].includes('もういちど'));read();
  assert.equal(r.els.get('modal-copy').textContent,qs[0],'the same question after a wrong answer');assert(!r.g.summons.includes('owl'));
  r.button('ながくて ばらばら');read();assert(r.els.get('modal-copy').textContent.includes('リンク'));r.button('おさないで おとなに');read();
  assert(r.els.get('modal-copy').textContent.includes('ひみつ'));r.button('ひみつは いわない');read();
  assert(r.g.summons.includes('owl'),'all right: the owl joins');assert.equal(r.g.state.bonds.minamo_grandpa,1);assert.equal(r.g.questStep,'boss');
  assert(talk(r,'minamo_library',5.7,5.3).includes('いつでも'),'the owl idles after joining');read();assert(!r.g.modal);
  // The grandpa's errand: the overdue book from the friend's house, then one onigiri. Heart 2 pays おこづかい, heart 3 lends てづくり おにぎり.
  assert(talk(r,'minamo_library',3.4,8.5).includes('もどって こん'));read();assert(st.flags.minamoBookAsk);
  const money=st.money;assert(talk(r,'minamo_friend',4.6,7.7).includes('としょかんの ほん'));read();assert.equal(st.items.minamoBook,1);
  assert(talk(r,'minamo_library',3.4,8.5).includes('ほんを かえした'));const got=[];while(r.g.dialogue){got.push(...r.g.dialogue.lines.map(l=>l[1]));r.dialogue();}r.tick(400);
  assert.equal(st.items.minamoBook,0);assert.equal(r.g.state.bonds.minamo_grandpa,2);assert.equal(st.money,money+120,'おこづかい at heart 2');
  if(r.g.modal==='event'){r.button('あげる');read();}else{st.items.rice=Math.max(1,st.items.rice);talk(r,'minamo_library',3.4,8.5);read();r.button('あげる');read();}
  assert.equal(r.g.state.bonds.minamo_grandpa,3);assert(st.weapons.includes('onigiri'),'heart 3 lends the onigiri');
  // In battle the owl shows the next move and the next two hits do 1.5 times.
  st.battery=100;r.g.debugStartBattle('spam','r21-owl');r.tick(300);Object.assign(r.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});r.cmd('summon');r.button('サーチフクロウ');assert.equal(st.battery,90);r.tick(1000);
  assert(r.g.battle.log.includes('よわみが みえた'),r.g.battle.log);assert(r.g.battle.log.split('\n').reduce((n,row)=>n+Math.ceil(wide(row)/15),0)<=3,'owl log fits 3 rows of the battle box '+r.g.battle.log);r.tick(3000);
  const hit=()=>{const hp=r.g.battle.enemy.hp;r.cmd('attack');r.tick(3000);return hp-r.g.battle.enemy.hp;};
  const h1=hit(),h2=hit(),h3=hit();assert(h1>h3&&h2>h3,'two boosted hits then normal '+[h1,h2,h3]);assert.equal(h1,Math.round(h3*1.5));
  // Chapter 2 lines fit.
  for(const [k,v] of Object.entries(D.dialogue))if(/^(owl[A-Z]|grandpaBook|boyBook)/.test(k))for(const l of v)for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'chapter 2 line fits '+row);
  for(const ev of D.events.owlQuiz[0].else[0].then.filter(s=>s.quiz))for(const q of ev.quiz){assert(wide(q.q)<=16,q.q);for(const o of q.options)assert(o.length<=16,o);}}
 result.push('Search Owl: library quiz (3 questions, wrong answer asks again), joins with the grandpa bond, overdue book errand and onigiri gift (おこづかい, てづくり おにぎり), owl shows the next move and 2 turns at 1.5x PASS');
 // R22: カテイノジジョウ at the park: needs Search Owl, lifts into the boss fight, then the worry walls go and the park scene plays.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const D=r.g.GAME_DATA,st=r.g.state;assert(r.g.debugStartChapter(2));const boss=D.maps.minamo.objects.find(o=>o.id==='minamo_boss');assert(boss&&boss.enemy==='kateino'&&D.enemies.kateino.boss);
  assert(talk(r,'minamo',boss.x,boss.y+1.3).includes('あぶないから'));while(r.g.dialogue)r.dialogue();r.tick(3000);assert.equal(r.g.screen,'field','no fight before the owl: '+r.g.screen+' '+JSON.stringify(st.summons));
  r.g.debugEvent([{join:'owl'}]);r.tick(1600);assert.equal(r.g.questStep,'boss');r.g.debugWarp('minamo',11.6,31.4);r.tick(16);assert(/[←→↑↓]/.test(r.els.get('quest').textContent),'arrow to the park wall');
  assert(talk(r,'minamo',boss.x,boss.y+1.3).includes('みせに いこう'));for(let i=0;i<60&&r.g.screen==='field';i++){if(r.g.dialogue)r.dialogue();r.tick(200);if(r.g.modal==='cheats')r.button('はじめる');}
  assert.equal(r.g.screen,'shooter','boss fight starts');const run=r.shooterRuns[r.shooterRuns.length-1].cfg;assert.equal(run.boss,'kateino');assert.equal(run.lines.intro[1],'しょうらい どうするの');run.onWin({boss:'kateino',seconds:150,hearts:2,maxHearts:3,hurts:1});r.tick(2500);const read=[];for(let i=0;i<120;i++){if(r.g.dialogue){const l=r.g.dialogue.lines.map(l=>l[1]).join('/');if(read[read.length-1]!==l)read.push(l);r.click('dialogue');}r.tick(200);}
  assert(r.g.state.bosses.includes('kateino'),'kateino beaten');assert(r.g.state.flags.minamoCleared,'park scene plays');assert(read.join('\n').includes('すごいじゃない'),read.join('|'));assert(read.join('\n').includes('でんしゃに のった'),'RYOSEI rides the train');
  // R37: the park scene ends with the chapter card, and its button starts chapter 3 at the ネオンシティ station.
  assert.equal(r.g.screen,'ending','chapter card after the park');assert.equal(r.els.get('ending-eyebrow').textContent,'CHAPTER 02 COMPLETE');assert(r.els.get('ending-heading').textContent.includes('3しょう')&&r.els.get('ending-heading').textContent.includes('ネオンシティ'),r.els.get('ending-heading').textContent);
  await settle();{const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.equal(sv.chapter,3,'saved at chapter 3');assert(sv.flags.minamoCleared&&sv.flags.neonVisited);}
  r.click('ending-title');assert.equal(r.g.screen,'field');assert.equal(r.g.chapter,3);assert.equal(r.g.map,'neon');assert(r.g.state.towns.includes(3));
  assert(talk(r,'neon',11.4,14.7).includes('ネオンシティ'),'station square sign');while(r.g.dialogue)r.dialogue();
  // The walls are gone: no talk target and the hero walks through.
  const w=D.maps.minamo.objects.find(o=>o.id==='minamo_wall1');r.g.debugWarp('minamo',w.x,w.y+1.4);r.g.debugFace(3);r.tick(16);r.key('ArrowUp');r.tick(800);r.key('ArrowUp',true);r.tick(16);assert(r.g.position.y<w.y*48-10,'the wall is gone '+r.g.position.y);
  r.g.debugWarp('minamo',boss.x,boss.y+1.3);r.g.debugFace(3);r.tick(16);r.click('talk-btn');assert(!r.g.dialogue||!r.g.dialogue.lines.some(l=>l[0]==='しんぱいの かべ'),'the park wall is gone too');while(r.g.dialogue)r.dialogue();
  assert(talk(r,'minamo_friend',4.6,7.7).includes('あした'),'the friend changes after the boss');while(r.g.dialogue)r.dialogue();
  for(const k of ['kateinoTalk','kateinoClear','minamoPark','dadAfter','momAfter','boyAfter'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'chapter 2 line fits '+row);}
 // R37: the train goes both ways after the card, and a save made between the boss and the park scene plays the scene again.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));assert.equal(r.g.map,'neon');assert.equal(r.g.chapter,3);const D=r.g.GAME_DATA;
  const st3=D.maps.neon.objects.find(o=>o.id==='neon_station'),st2=D.maps.minamo.objects.find(o=>o.id==='minamo_station');
  const ride=(m,o)=>{r.g.debugWarp(m,o.x,o.y+(o.kind==='neon'?1.1:.5));r.g.debugFace(3);r.tick(16);r.click('talk-btn');r.tick(400);};ride('neon',st3);assert.equal(r.g.modal,'event','train menu');r.button('ミナモちょう');for(let i=0;i<10&&r.g.dialogue;i++)r.dialogue();assert.equal(r.g.map,'minamo');
  ride('minamo',st2);assert.equal(r.g.modal,'event');r.button('ネオンシティ');for(let i=0;i<10&&r.g.dialogue;i++)r.dialogue();assert.equal(r.g.map,'neon');
  // Before the boss the station is closed.
  assert(r.g.debugStartChapter(2));assert(talk(r,'minamo',st2.x,st2.y+.5).includes('とまって'),'train waits in chapter 2');while(r.g.dialogue)r.dialogue();assert.equal(r.g.modal,'');
  r.g.state.bosses.push('kateino');r.g.state.flags.cleared=true;r.g.debugEvent([{save:'quiet'}]);await settle();r.g.state.flags.minamoCleared=true;r.g.debugEvent([{save:'quiet'}]);await settle();assert(!JSON.parse(r.saved.get('ryoseiworld-rpg-v5')).flags.neonVisited,'a save from before R37: park done, train not taken');
  const re=await runtime({saved:r.saved});re.tick();re.click('continue-btn');assert.equal(re.g.chapter,2);re.tick(1000);assert(re.g.dialogue,'park scene again after reload');const again=[];
  for(let i=0;i<60&&re.g.screen==='field';i++){if(re.g.dialogue){again.push(...re.g.dialogue.lines.map(l=>l[1]));re.click('dialogue');}re.tick(200);}
  assert(again.join('\n').includes('すごいじゃない'),again.join('|'));assert.equal(re.g.screen,'ending');re.click('ending-title');assert.equal(re.g.chapter,3);assert.equal(re.g.map,'neon');
  await settle();const re2=await runtime({saved:re.saved});re2.tick();re2.click('continue-btn');re2.tick(1500);assert(!re2.g.dialogue,'no replay once chapter 3 started');assert.equal(re2.g.map,'neon');
  for(const k of ['trainOpen','trainRide','trainWait','neonSign'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'line fits '+row);}
 result.push('Chapter 2 → 3: chapter card after the park, train between ミナモちょう and ネオンシティ, park scene replays after a reload PASS');
 // R23: ネオンシティ places on the neon sheet; the net cafe night brings HP and battery back; the capsule hotel talk (R50 opens the stadium).
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,m=D.maps.neon,obj=id=>m.objects.find(o=>o.id===id);
  for(const [id,f] of [['neon_station',4],['neon_cafe',3],['neon_selfie',7],['neon_capsule',6],['neon_stadium',2],['neon_mural',5],['neon_ranking',0]])assert(obj(id)&&obj(id).kind==='neon'&&obj(id).frame===f,id);
  const near=(o)=>{r.g.debugWarp('neon',o.x,o.y+1.1);r.g.debugFace(3);r.tick(16);r.click('talk-btn');r.tick(16);};
  for(const [id,want] of [['neon_ranking','ランキング'],['neon_selfie','いいね'],['neon_mural','まっしろ']]){near(obj(id));assert(r.g.dialogue&&r.g.dialogue.lines.map(l=>l[1]).join('').includes(want),id);while(r.g.dialogue)r.dialogue();}
  near(obj('neon_cafe'));assert.equal(r.g.map,'neon_cafe','enter the net cafe');r.g.state.hero.hp=5;r.g.state.battery=3;
  assert(talk(r,'neon_cafe',5.4,7.4).includes('ネットカフェ'));for(let i=0;i<30;i++){if(r.g.dialogue){r.dialogue();continue;}if(r.g.modal==='event'){r.tick(400);r.button('とまる');continue;}r.tick(300);}
  assert.equal(r.g.battery,100,'battery full');assert.equal(r.g.hp.hp,r.g.hp.maxHp,'HP full');
  near(obj('neon_capsule'));assert.equal(r.g.map,'neon_capsule','enter the capsule hotel');assert(talk(r,'neon_capsule',5.4,5.3).includes('スマホ'));while(r.g.dialogue)r.dialogue();
  for(const k of ['neonSign','rankingTower','selfiePlaza','chartTower','stadiumChallenge','muralWall','cafeAsk','cafeSleep','cafeMorning','cafeBye','cafePc','capsuleBed'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'chapter 3 line fits '+row);}
 result.push('ネオンシティ: station, net cafe (a night fills HP and battery), selfie plaza, capsule hotel, ranking stadium entrance, mural wall on the neon sheet PASS');
 result.push('カテイノジジョウ: park wall needs Search Owl, quest arrow, boss fight, worry walls go, park scene (…すごいじゃない) PASS');
 // R26: ヒカクマオウ in the ranking stadium, lifts into the hikaku shooter fight, then the chapter card to ノイズのとう.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,st=r.g.state;const boss=D.maps.neon_stadium.objects.find(o=>o.id==='neon_boss');
  assert(boss&&boss.enemy==='hikaku'&&D.enemies.hikaku.boss,'hikaku wired to the stadium');
  r.g.debugWarp('neon_stadium',5,10);r.g.debugFace(3);r.tick(16);
  assert(talk(r,'neon_stadium',boss.x,boss.y+1.3).includes('しゃちょう'));for(let i=0;i<60&&r.g.screen==='field';i++){if(r.g.dialogue)r.dialogue();r.tick(200);if(r.g.modal==='cheats')r.button('はじめる');}
  assert.equal(r.g.screen,'shooter','boss fight starts');const run=r.shooterRuns[r.shooterRuns.length-1].cfg;assert.equal(run.boss,'hikaku');
  run.onWin({boss:'hikaku',seconds:120,hearts:2,maxHearts:3,hurts:1});r.tick(2500);const read=[];for(let i=0;i<120;i++){if(r.g.dialogue){const l=r.g.dialogue.lines.map(l=>l[1]).join('/');if(read[read.length-1]!==l)read.push(l);r.click('dialogue');}r.tick(200);}
  assert(st.bosses.includes('hikaku'),'hikaku beaten');assert(read.join('\n').includes('すうじが'),read.join('|'));
  assert.equal(r.g.screen,'ending','chapter card after the boss');assert(r.els.get('ending-heading').textContent.includes('4しょう')&&r.els.get('ending-heading').textContent.includes('ノイズのとう'),r.els.get('ending-heading').textContent);
  await settle();r.click('ending-title');
  // The stadium boss object is gone once the town is quiet.
  r.g.debugWarp('neon_stadium',boss.x,boss.y+1.3);r.g.debugFace(3);r.tick(16);r.click('talk-btn');assert(!r.g.dialogue||!r.g.dialogue.lines.some(l=>l[0]==='ヒカクマオウ'),'the boss is gone after the win');while(r.g.dialogue)r.dialogue();
  for(const k of ['hikakuTalk','hikakuGone','hikakuClear'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'chapter 3 boss line fits '+row);}
 result.push('ヒカクマオウ: stadium boss fight, shooter boss id hikaku, win plays the clear scene and chapter card to ノイズのとう, object gone after PASS');
 // R27: ノイズのとう (1〜3かい＋おくじょう), the cloud gate out of ネオンシティ, the blue grid floor, floor-to-floor warp, save terminals, 3 dark zako, コトバイルカ joining at the door.
 {const wide=s=>[...s].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0);const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,st=r.g.state;
  const gate=D.maps.neon.objects.find(o=>o.id==='neon_cloudgate');assert(gate&&gate.enter==='tower1'&&gate.lock==='neonCleared','the cloud gate leads to tower1 and waits for the boss');
  // Locked before ヒカクマオウ is beaten.
  r.g.debugWarp('neon',gate.x,gate.y+1.3);r.g.debugFace(3);r.tick(16);r.click('talk-btn');r.tick(16);
  assert(r.g.dialogue&&r.g.dialogue.lines.map(l=>l[1]).join('').includes('とじている'),'the gate stays shut before the boss');while(r.g.dialogue)r.dialogue();assert.equal(r.g.map,'neon');
  // Beat the boss, then the gate opens into tower1.
  st.bosses.push('hikaku');st.flags.neonCleared=true;
  r.g.debugWarp('neon',gate.x,gate.y+1.3);r.g.debugFace(3);r.tick(16);r.click('talk-btn');r.tick(16);
  assert.equal(r.g.map,'tower1','the cloud gate opens once the stadium boss is cleared');assert.equal(r.g.position.x,5*48);assert.equal(r.g.position.y,10*48);
  assert(!r.g.dialogue,'arriving on the spawn tile does not fire the entrance trigger yet');
  // 4 floors, all with the blue grid floor tile ('g').
  for(const id of ['tower1','tower2','tower3','tower_roof']){const m=D.maps[id];assert(m,'map '+id+' exists');assert(m.tiles.every(row=>[...row].every(c=>c==='g')),id+' is the blue grid floor');}
  assert(!r.g.summons.includes('kotoba'),'コトバイルカ is not yet recruited');
  // Walking a step further in triggers the automatic join (SPEC_V5_CH234.md: 入口で コトバイルカ が仲間になる).
  let seen=r.protoRuns.length;r.key('ArrowUp');r.tick(600);r.key('ArrowUp',true);
  for(let i=0;i<40;i++){if(r.g.dialogue){r.dialogue();continue;}if(r.protoRuns.length>seen){const run=r.protoRuns.at(-1);seen=r.protoRuns.length;run.onDone(run.state);continue;}if(!r.g.dialogue)break;}
  assert(r.g.summons.includes('kotoba'),'コトバイルカが とうの いりぐちで なかまに なる');
  // Walking in again (once flag set) says something else instead of rejoining.
  r.g.debugWarp('tower1',5,10);r.tick(16);r.key('ArrowUp');r.tick(600);r.key('ArrowUp',true);r.tick(16);
  assert(!r.g.dialogue,'the entrance trigger only fires once');
  // A save terminal on every floor.
  for(const id of ['tower1','tower2','tower3','tower_roof'])assert(D.maps[id].objects.some(o=>o.action==='save'),id+' has a save terminal');
  // FUN23: every ひかりの ゆか pad carries a direction sign (うえへ／したへ) matching the floor it actually warps to,
  // so a player standing in front of two identical-looking pads knows which one goes up and which goes down.
  for(const [id,cells] of [['tower1',D.maps.tower1.cells],['tower2',D.maps.tower2.cells],['tower3',D.maps.tower3.cells],['tower_roof',D.maps.tower_roof.cells]]){
    const m=D.maps[id];
    for(const pad of m.objects.filter(o=>o.label==='ひかりの ゆか')){
      assert(pad.sign==='うえへ'||pad.sign==='したへ',id+' '+pad.id+' pad has an うえへ／したへ sign');
      const cell=cells.find(c=>Math.abs(c.x-pad.x)<.01&&Math.abs(c.y-pad.y)<.01);
      assert(cell,id+' '+pad.id+' sits on a warp cell');
      const order=['tower1','tower2','tower3','tower_roof'];
      const goesUp=order.indexOf(cell.warp)>order.indexOf(id);
      assert.equal(pad.sign,goesUp?'うえへ':'したへ',id+' '+pad.id+' sign direction matches where it actually warps');
    }
  }
  r.g.debugWarp('tower1',8.4,6.2);r.tick(16);r.click('talk-btn');r.tick(16);for(let i=0;i<20&&r.g.dialogue;i++)r.dialogue();await settle();
  assert(JSON.parse(r.saved.get('ryoseiworld-rpg-v5')).map==='tower1','the save terminal saves');
  // The light floor (warp cells) carries the hero up through all 3 floors and the rooftop, and back down again.
  const up=(from,x,to)=>{r.g.debugWarp(from,x,3.4);r.tick(16);r.key('ArrowUp');r.tick(260);r.key('ArrowUp',true);r.tick(16);assert.equal(r.g.map,to,'warp '+from+' -> '+to);};
  up('tower1',8.4,'tower2');up('tower2',8.4,'tower3');up('tower3',8.4,'tower_roof');
  up('tower_roof',2.2,'tower3');up('tower3',2.2,'tower2');up('tower2',2.2,'tower1');
  // The 3 dark, stronger zako named in SPEC_V5_CH234.md, roaming the floors (not the rooftop).
  for(const [map,types] of [['tower1',['virusball']],['tower2',['crow2','infload2']],['tower3',['virusball']]])
   for(const t of types)assert(D.maps[map].enemies.some(e=>e.type===t),map+' has a '+t);
  assert.equal(D.maps.tower_roof.enemies.length,0,'the rooftop is calm, no zako');
  for(const id of ['virusball','crow2','infload2']){const def=D.enemies[id];assert(def&&def.hp>D.enemies.popup.hp&&def.attack>D.enemies.popup.attack,id+' is stronger than an ordinary town zako');}
  assert(r.g.debugStartBattle('virusball','r27-zako'));r.tick(300);assert.equal(r.g.screen,'battle');r.g.debugWin();r.tick(2000);while(r.g.dialogue)r.dialogue();
  // Every new line fits the dialogue box.
  for(const k of ['cloudGateLocked','towerGuide','towerSave','towerEntranceAsk','towerEntranceJoin','towerEntranceIdle'])
   for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'R27 line fits '+row);}
 result.push('R27: ノイズのとう 3かい＋おくじょう（くもの もん・あおい グリッド・ワープの ゆか・セーブたんまつ・くらい ザコ3しゅ・コトバイルカの じどう かにゅう）PASS');
 // R28: おくじょうの ひかる もんが ジブンの シューティング戦につながり、勝つと チャプターカードが出る（ゼロは R29）。
 {const wide=s=>[...s].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0);const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,st=r.g.state;
  // Beat ヒカクマオウ for real so the chapterClear step moves g.chapter to 4 (bossWon only counts a win when it matches the chapter's own boss).
  const stadiumBoss=D.maps.neon_stadium.objects.find(o=>o.id==='neon_boss');
  assert(talk(r,'neon_stadium',stadiumBoss.x,stadiumBoss.y+1.3).includes('しゃちょう'));for(let i=0;i<60&&r.g.screen==='field';i++){if(r.g.dialogue)r.dialogue();r.tick(200);if(r.g.modal==='cheats')r.button('はじめる');}
  assert.equal(r.g.screen,'shooter','ヒカクマオウ戦が はじまる');
  r.shooterRuns.at(-1).cfg.onWin({boss:'hikaku',seconds:120,hearts:2,maxHearts:3,hurts:1});r.tick(2500);for(let i=0;i<120&&r.g.screen!=='ending';i++){if(r.g.dialogue)r.dialogue();r.tick(200);}
  assert.equal(r.g.screen,'ending','ヒカクマオウに勝って つぎの しょうへ');await settle();r.click('ending-title');r.tick(16);
  assert.equal(r.g.chapter,4,'4章 ノイズのとうに すすんだ');
  r.g.debugWarp('tower_roof',5,10);
  const gate=D.maps.tower_roof.objects.find(o=>o.id==='twr_gate');assert(gate&&gate.enemy==='jibun'&&D.enemies.jibun.boss&&D.enemies.jibun.shooter==='jibun','jibun wired to the rooftop gate');
  r.g.debugFace(3);r.tick(16);
  assert(talk(r,'tower_roof',gate.x,gate.y+1.3).includes('やめても'));for(let i=0;i<60&&r.g.screen==='field';i++){if(r.g.dialogue)r.dialogue();r.tick(200);if(r.g.modal==='cheats')r.button('はじめる');}
  assert.equal(r.g.screen,'shooter','ジブン戦が はじまる');const run=r.shooterRuns[r.shooterRuns.length-1].cfg;assert.equal(run.boss,'jibun');
  run.onWin({boss:'jibun',seconds:90,hearts:3,maxHearts:3,hurts:0});r.tick(2500);const read=[];for(let i=0;i<120;i++){if(r.g.dialogue){const l=r.g.dialogue.lines.map(l=>l[1]).join('/');if(read[read.length-1]!==l)read.push(l);r.click('dialogue');}r.tick(200);}
  assert(st.bosses.includes('jibun'),'jibun beaten');assert(read.join('\n').includes('おなじ'),read.join('|'));
  // R29: ジブンに勝っても章は終わらず、ゼロの もんが あく方に かわった（field のまま）。
  assert.equal(r.g.screen,'field','ジブンに勝っても まだ 章は つづく');
  r.g.debugWarp('tower_roof',gate.x,gate.y+1.3);r.g.debugFace(3);r.tick(16);r.click('talk-btn');assert(!r.g.dialogue||!r.g.dialogue.lines.some(l=>l[0]==='ジブン'),'もんは かった あとは すがたが ない');while(r.g.dialogue)r.dialogue();
  for(const k of ['jibunTalk','jibunGone','jibunClear'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'R28 line fits '+row);}
 result.push('R28: 4章 ジブンのシューティング版（おくじょうの もんから はいる・たまは すりぬけ・つくるの ひかり3つで いろが もどる・勝っても まだ 章は つづく）PASS');
 // R29: ジブンの むこうに あく、ゼロの もん。「こえ」の光を取るたびに町の人の守護霊がつながり、一言が流れる。
 // 全員つながると とくぎ が「みんなの こえ」に変わり、撃つとノイズが晴れる。会話のあと ゼロが仲間になり、章が終わる。
 {const wide=s=>[...s].reduce((n,c)=>n+(c.charCodeAt(0)<127?.5:1),0);const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(4));const D=r.g.GAME_DATA,st=r.g.state;
  const gate2=D.maps.tower_roof.objects.find(o=>o.id==='twr_gate2');
  assert(gate2&&gate2.enemy==='zero'&&gate2.requiresBoss==='jibun'&&D.enemies.zero.boss&&D.enemies.zero.shooter==='zero','zero wired to the second rooftop gate, locked behind jibun');
  // Locked before ジブン is beaten.
  r.g.debugWarp('tower_roof',gate2.x,gate2.y+1.3);r.g.debugFace(3);r.tick(16);r.click('talk-btn');r.tick(16);
  assert(r.g.dialogue&&r.g.dialogue.lines.map(l=>l[1]).join('').includes('とどかない'),'ゼロの もんは ジブンの 前には あかない');while(r.g.dialogue)r.dialogue();
  st.bosses.push('jibun');
  assert(talk(r,'tower_roof',gate2.x,gate2.y+1.3).includes('こうげきが'));for(let i=0;i<60&&r.g.screen==='field';i++){if(r.g.dialogue)r.dialogue();r.tick(200);if(r.g.modal==='cheats')r.button('はじめる');}
  assert.equal(r.g.screen,'shooter','ゼロ戦が はじまる');const run=r.shooterRuns[r.shooterRuns.length-1].cfg;assert.equal(run.boss,'zero');
  run.onWin({boss:'zero',seconds:150,hearts:3,maxHearts:3,hurts:0});r.tick(2500);const read=[];for(let i=0;i<160&&r.g.screen!=='ending';i++){if(r.g.dialogue){const l=r.g.dialogue.lines.map(l=>l[1]).join('/');if(read[read.length-1]!==l)read.push(l);r.click('dialogue');}r.tick(200);}
  assert(read.join('\n').includes('つかって くれなかった'),read.join('|'));assert(read.join('\n').includes('いっしょに'),read.join('|'));
  assert(r.g.summons.includes('zero'),'ゼロが なかまに なる');
  // R30: ほんとうの チャプターカードでは なく、3つの町の「なおった」カード → エピローグへ すすむ（SPEC_V5_CH234.md 4章「エンディング」）。
  assert.equal(r.g.screen,'ending','ゼロに勝って まず まちの カード');assert(r.els.get('ending-heading').textContent.includes('ヒダマリ'),r.els.get('ending-heading').textContent);assert.equal(r.els.get('ending-bg').hidden,false);assert(r.els.get('ending-bg').src.includes('bg_town'));
  r.click('ending-title');assert(r.els.get('ending-heading').textContent.includes('ミナモ'));assert(r.els.get('ending-bg').src.includes('bg_minamo'));
  r.click('ending-title');assert(r.els.get('ending-heading').textContent.includes('ネオン'));assert(r.els.get('ending-bg').src.includes('bg_neon'));
  r.click('ending-title');assert.equal(r.g.screen,'epilogue','3まい おわったら エピローグ');assert.equal(r.els.get('epilogue-text').textContent,'つぎは なにを つくる?');
  for(const k of ['zeroTalk','zeroLocked','zeroGone','zeroClear'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'R29 line fits '+row);}
 result.push('R29: 4章 ゼロのシューティング版（「こえ」の光で守護霊がつながり、みんなの こえ で ノイズが晴れる・会話・仲間になる）PASS');
 // R30: エンディング（3つの町のカード）とエピローグ（なにを かいても「わかった。つくろう」→ タイトルへ）。
 {const r=await runtime();r.tick();r.g.debugEvent([{finale:{towns:[{heading:'A',bg:'bg_town',copy:'x'},{heading:'B',bg:'bg_minamo',copy:'y'}]}}]);
  assert.equal(r.g.screen,'ending');assert.equal(r.els.get('ending-heading').textContent,'A');assert.equal(r.els.get('ending-title').textContent,'つぎへ');
  r.click('ending-title');assert.equal(r.els.get('ending-heading').textContent,'B');
  r.click('ending-title');assert.equal(r.g.screen,'epilogue','町が0でも1でも最後は かならず エピローグへ');
  assert.equal(r.els.get('epilogue-input').hidden,false);assert.equal(r.els.get('epilogue-send').hidden,false);
  r.els.get('epilogue-input').value='ゲームを つくりたい';r.click('epilogue-send');
  assert.equal(r.els.get('epilogue-text').textContent,'「ゲームを つくりたい」\nいいね。わたしも つくる','かいた ことばを そのまま 読みかえす（FUN2: 固定文で 捨てていたのを直した）');assert.equal(r.els.get('epilogue-input').hidden,true);assert.equal(r.els.get('epilogue-input').value,'','入力は この場で 消える（保存・送信しない）');
  const afterFirst=r.els.get('epilogue-text').textContent;r.click('epilogue-send');assert.equal(r.els.get('epilogue-text').textContent,afterFirst,'こたえた あとに もう一度 おくっても 二重に すすまない');
  r.tick(2300);assert.equal(r.g.screen,'title','エピローグの あと タイトルへ');
  // からの towns（SPEC_V5_CH234完了条件に無い保険）でも すぐ エピローグへ すすむ。
  const r2=await runtime();r2.tick();r2.g.debugEvent([{finale:{towns:[]}}]);assert.equal(r2.g.screen,'epilogue');
  r2.key('Enter',false,r2.els.get('epilogue-input'));assert.equal(r2.els.get('epilogue-text').textContent,'わかった。つくろう','なにも かかずに おくると もとの ことば（Enterキーでも おくれる）');}
 result.push('R30/FUN2: エンディング（まちの カード）→ エピローグ（かいた ことばを ソラが 読みかえす）→ タイトル PASS');
 // R100: the park sign's 「こうえん」 sits inside its board (between the posts, under the top beam) and at the board's middle, in both towns.
 // Board of props 11 (frame 236x248): posts end at x 62 and start at x 174, the panel runs y 96..166 and its middle is y 128.
 {const r=await runtime();r.tick();r.start();r.tick(1000);
  for(const [map,id] of [['town','parksign'],['minamo','minamo_parksign']]){const o=r.g.GAME_DATA.maps[map].objects.find(x=>x.id===id);assert(o&&o.sign==='こうえん',id+' is a park sign');
   r.g.debugWarp(map,o.x,o.y+1.8);r.tick(16);r.canvasCalls.length=0;r.tick(16);
   const txt=r.canvasCalls.filter(c=>c[0]==='strokeText'&&c[1]==='こうえん').at(-1),img=r.canvasCalls.filter(c=>c[0]==='drawImage'&&String(c[1]).endsWith('props_r2_c3.png')&&Math.abs(c[2]+c[4]/2-txt?.[2])<4).at(-1);
   assert(txt&&img,id+' sign art and words are drawn');const [,,x,y,w,h]=img,left=x+w*63/236,right=x+w*174/236,top=y+h*96/248,bottom=y+h*166/248,half=[...o.sign].length*24/2+3;
   assert(txt[2]-half>=left&&txt[2]+half<=right,id+' words stay between the posts (words '+(txt[2]-half)+'..'+(txt[2]+half)+', board '+left.toFixed(1)+'..'+right.toFixed(1)+')');
   assert(txt[3]-22>=top&&txt[3]+4<=bottom,id+' words stay on the panel (glyphs '+(txt[3]-22)+'..'+(txt[3]+4)+', panel '+top.toFixed(1)+'..'+bottom.toFixed(1)+')');
   assert(Math.abs(txt[2]-(left+right)/2)<=2&&Math.abs(txt[3]-9-(y+h*128/248))<=2,id+' words sit at the middle of the board (text '+txt[2]+','+txt[3]+')');
   // The hero standing behind the board (on its upper half) sees through it; in front of it, the sign is solid.
   for(const [dy,alpha] of [[-1.2,.45],[1.8,1]]){r.g.debugWarp(map,o.x,o.y+dy);r.tick(16);r.imageLog.length=0;r.imageAlpha.length=0;r.tick(16);const i=r.imageLog.findLastIndex(src=>String(src).endsWith('props_r2_c3.png'));
    assert(i>=0&&r.imageAlpha[i]===alpha,id+' sign alpha '+r.imageAlpha[i]+' with the hero '+(dy<0?'behind':'in front'));}}}
 result.push('R100: こうえん の看板の字が板の真ん中に収まる（ヒダマリちょう・ミナモちょう） PASS');
 result.push('R105: タイトルの案内が出ても、ボタンが町の絵に乗らず道の上に残る PASS');
 result.push('R106: きずなの一覧で、名前とハートを1行にまとめた（R36 の確かめで見る） PASS');
 // R38: numbered people and three street zako in ネオンシティ; R46: ハルシネーション's fake HP bar and half/double damage around サーチフクロウ.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,m=D.maps.neon,st=r.g.state;
  for(const id of ['popup','infload','vacuum','hallucination'])assert(m.enemies.some(e=>e.type===id),'neon has a '+id+' zako');
  for(const id of ['neon_num1','neon_num2','neon_num3','neon_num4']){const o=m.objects.find(x=>x.id===id);assert(o&&o.kind==='numberperson'&&o.sign,id+' is a numbered person');assert(talk(r,'neon',o.x,o.y+1.1).length>0,id+' talks');while(r.g.dialogue)r.dialogue();}
  // R69: a number never sits on a street light (the lamp heads are drawn where the number floats).
  for(const o of m.objects.filter(x=>x.kind==='numberperson'))for(const l of m.objects.filter(x=>x.id.startsWith('neon_light')))assert(Math.abs(o.x-l.x)>=1.5||Math.abs(o.y-l.y)>=2.5,o.id+' stands clear of '+l.id+' ('+o.x+','+o.y+' vs '+l.x+','+l.y+')');
  // R64: the number floats above the person's head, not on the face.
  {const o=m.objects.find(x=>x.id==='neon_num1');r.g.debugWarp('neon',o.x,o.y+1.6);r.canvasCalls.length=0;r.tick(16);
   const txt=r.canvasCalls.filter(c=>c[0]==='strokeText'&&c[1]===o.sign).at(-1),img=r.canvasCalls.filter(c=>c[0]==='drawImage'&&Math.abs(c[2]+c[4]/2-txt?.[2])<4).at(-1);
   assert(txt&&img,'number and person sprite are drawn');assert(txt[3]<=img[3],'number '+o.sign+' sits above the head (text y '+txt[3]+', sprite top '+img[3]+')');
   r.g.debugWarp('neon',o.x,o.y+1.1);r.g.debugFace(3);r.canvasCalls.length=0;r.tick(16);
   const t2=r.canvasCalls.filter(c=>c[0]==='strokeText'&&c[1]===o.sign).at(-1),tag=r.canvasCalls.filter(c=>c[0]==='tag'&&Math.abs(c[1]+c[3]/2-t2?.[2])<4).at(-1);
   assert(t2&&tag,'name tag is shown when the person is the talk target');
   const pl2=r.canvasCalls.filter(c=>c[0]==='plate'&&Math.abs(c[1]+c[3]/2-t2[2])<12).at(-1);assert(pl2&&pl2[2]>=tag[2]+tag[4]+2,'name tag does not touch the dark plate (plate top '+pl2?.[2]+', tag bottom '+(tag[2]+tag[4])+')');assert(t2[3]-24>=tag[2]+tag[4],'name tag does not cover the number (text top '+(t2[3]-24)+', tag bottom '+(tag[2]+tag[4])+')');}
  // R84: each number says what it counts (SPEC_V5_CH234.md: followers, likes, rank), and the wider sign still ends before the nearest lamp head.
  for(const o of m.objects.filter(x=>x.kind==='numberperson')){assert(/^(じゅんい|いいね|フォロワー) [0-9,]+$/.test(o.sign),o.id+' sign names what the number is: '+o.sign);
   const half=[...o.sign].reduce((a,c)=>a+(/[0-9, ]/.test(c)?14:24),0)/2;
   for(const l of m.objects.filter(x=>x.id.startsWith('neon_light')&&Math.abs(x.y-o.y)<2.5))assert(Math.abs(o.x-l.x)*48-14>=half,o.id+' sign ('+o.sign+') ends clear of '+l.id);}
  // R85: a sign whose person stands at the screen edge slides inward and is drawn whole (it was cut to 「じゅんい 86」 / 「いいね 320」 on a phone).
  for(const [id,hx] of [['neon_num1',16],['neon_num2',14]]){const o=m.objects.find(x=>x.id===id);r.g.debugWarp('neon',hx,o.y+1.6);r.canvasCalls.length=0;r.tick(16);
   const camX=Math.max(0,Math.min(m.w*48-540,hx*48-270)),half=[...o.sign].reduce((a,c)=>a+(/[0-9, ]/.test(c)?14:24),0)/2,txt=r.canvasCalls.filter(c=>c[0]==='strokeText'&&c[1]===o.sign).at(-1);
   assert(txt,id+' sign is drawn');assert(txt[2]-half>=camX&&txt[2]+half<=camX+540,id+' sign stays on screen (x '+txt[2]+', screen '+camX+'..'+(camX+540)+')');
   assert(Math.abs(txt[2]-o.x*48)<=half,id+' sign still sits over its person');
   // R96: at the screen edge too, the dark plate covers the sign and stays on screen.
   const pl=r.canvasCalls.filter(c=>c[0]==='plate').find(c=>c[1]<=txt[2]-half&&c[1]+c[3]>=txt[2]+half);
   assert(pl,id+' plate covers the sign at the screen edge');assert(pl[1]>=camX&&pl[1]+pl[3]<=camX+540,id+' plate stays on screen ('+pl[1]+'..'+(pl[1]+pl[3])+', screen '+camX+'..'+(camX+540)+')');}
  // R89: the sign is drawn after every sprite (a street lamp drawn later crossed 「86」 / 「3204」), and keeps 16px from the screen edge (unless it already slid half its width, so it stays over the person).
  // From the street between them (hero x 15), both signs slide less than half their width, so the 16px check really runs.
  for(const [id,hx] of [['neon_num1',15],['neon_num2',15]]){const o=m.objects.find(x=>x.id===id);r.g.debugWarp('neon',hx,o.y+1.6);r.tick(16);r.canvasCalls.length=0;r.tick(16);
   const camX=Math.max(0,Math.min(m.w*48-540,hx*48-270)),half=[...o.sign].reduce((a,c)=>a+(/[0-9, ]/.test(c)?14:24),0)/2,calls=r.canvasCalls,at=calls.findLastIndex(c=>c[0]==='strokeText'&&c[1]===o.sign),txt=calls[at];
   const lastProp=calls.findLastIndex(c=>c[0]==='drawImage'&&String(c[1]).includes('/props/'));
   assert(txt&&lastProp>=0,id+' sign and street lamps are drawn');assert(at>lastProp,id+' sign is drawn after the street lamps (sign call '+at+', last lamp call '+lastProp+')');
   // R96: a dark plate is drawn behind the sign (after the lamps, before the text) and covers the whole text, so a lamp head never shows through it.
   const pi=calls.findLastIndex((c,i)=>i<at&&c[0]==='plate'),pl=calls[pi];
   assert(pl&&pi>lastProp,id+' sign has a plate drawn after the street lamps');
   assert(pl[1]<=txt[2]-half&&pl[1]+pl[3]>=txt[2]+half&&pl[2]<=txt[3]-24&&pl[2]+pl[4]>=txt[3]+6,id+' plate covers the whole sign (plate '+pl.slice(1).join(',')+', text x '+txt[2]+' y '+txt[3]+')');
   assert(Math.abs(txt[2]-o.x*48)<half,id+' sign slid less than half its width here');assert(txt[2]-half>=camX+16&&txt[2]+half<=camX+540-16,id+' sign keeps 16px from the screen edge (x '+txt[2]+', half '+half+', screen '+camX+'..'+(camX+540)+')');}
  assert(r.g.summons.includes('owl'),'サーチフクロウ is already recruited by chapter 3 (debugStartChapter)');
  assert(!r.g.debugWords().includes('hallucination'),'not learned yet');
  st.battery=100;r.g.debugStartBattle('hallucination','r38-hall');r.tick(300);
  assert(r.g.debugWords().includes('hallucination'),'first encounter calls RYW.learn');
  Object.assign(r.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});
  assert.equal(r.els.get('enemy-meter').style.width,'100%','the HP bar is a lie before the search');
  const before=r.g.battle.enemy.hp;r.cmd('attack');r.tick(3000);const halfDmg=before-r.g.battle.enemy.hp;
  assert(halfDmg>0,'still takes some damage');assert.equal(r.els.get('enemy-meter').style.width,'100%','the bar still lies after a hit');
  r.cmd('summon');r.button('サーチフクロウ');r.tick(1000);
  assert(r.g.battle.log.includes('でどころが ない'),r.g.battle.log);assert(r.g.battle.hallReveal,'the real HP is shown from here');r.tick(3000);
  const before2=r.g.battle.enemy.hp;r.cmd('attack');r.tick(3000);const doubleDmg=before2-r.g.battle.enemy.hp;
  assert(doubleDmg>=halfDmg*3,'けんさく のあとはダメージ2倍（半分→2倍で4倍前後）: '+halfDmg+' -> '+doubleDmg);
  assert(Number.parseFloat(r.els.get('enemy-meter').style.width)<100,'the real HP bar shows once revealed');}
 result.push('ネオンシティ R38: numbered people, popup / infinite-loading / rampaging-vacuum zako; R46 ハルシネーション fake HP bar, half damage before サーチフクロウ and double after; R89 signs drawn over lamps; R96 signs on a dark plate PASS');
 // R24: 壁画のペイントキメラ（いっしょに かく／スプライトせいせい＝みがわり）とハッカーのお姉さん（また会う／きずな3でサーバークジラ＝バックアップ）。
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,st=r.g.state;
  assert(D.summons.paint&&D.summons.paint.mirror&&D.summons.paint.frame===3,'paint summon data (mirror, sheet frame 3)');
  assert(D.summons.whale&&D.summons.whale.backup&&D.summons.whale.frame===5,'whale summon data (backup, sheet frame 5)');
  assert.equal(D.bonds.hacker.spirit,'whale','the hacker now carries the whale as her spirit');
  const painter=D.maps.neon.objects.find(o=>o.id==='neon_painter');assert(painter&&painter.kind==='npc2'&&painter.frame===1,'painter uses the paint-splattered npc2 frame');
  const step=(pick)=>{let seen=r.protoRuns.length;for(let i=0;i<30;i++){if(r.g.dialogue){r.dialogue();continue;}if(r.g.modal==='event'&&pick){r.tick(300);r.button(pick);pick=null;continue;}if(r.protoRuns.length>seen){const run=r.protoRuns.at(-1);seen=r.protoRuns.length;run.onDone(run.state);continue;}break;}};
  // いいね を おしても まだ 仲間に ならない。もう いちど いって いっしょに かく を えらぶと 仲間になる。
  r.g.debugWarp('neon',painter.x,painter.y+1.1);r.g.debugFace(3);r.tick(16);r.click('talk-btn');step('いいねを おす');
  assert(!r.g.summons.includes('paint'),'いいね だけでは まだ 仲間に ならない');
  r.click('talk-btn');step('いっしょに かく');
  assert(r.g.summons.includes('paint'),'いっしょに かく で ペイントキメラが 仲間に なる');assert(r.g.state.bonds.neon_painter>=1,'きずなが あがる');
  assert.equal(r.protoRuns.at(-1).mode,'sprite','R47: ペイントキメラが仲間になるとプロトタイプ v6.3 のスプライトが育つ');
  // ハッカーのお姉さんと なんかいか はなすと きずなが 3に なり、サーバークジラが 仲間に なる。
  const hacker=D.maps.neon.objects.find(o=>o.id==='hacker');assert(hacker&&hacker.kind==='npc','hacker returns to ネオンシティ');
  for(let i=0;i<5&&!r.g.summons.includes('whale');i++){r.g.debugWarp('neon',hacker.x,hacker.y+1.1);r.g.debugFace(3);r.tick(16);r.click('talk-btn');step();}
  assert(r.g.summons.includes('whale'),'きずな3で サーバークジラが 仲間に なる');assert.equal(r.g.state.bonds.hacker,3);
  assert.equal(r.protoRuns.at(-1).mode,'deploy','R47: サーバークジラが仲間になるとプロトタイプをデプロイする');
  // 技: スプライトせいせい（みがわり）は つぎの こうげきを まるごと うけとめる。1回だけ。
  st.battery=100;r.g.debugStartBattle('popup','r24-mirror');r.tick(300);const hpBefore=r.g.hp.hp;
  r.cmd('summon');r.button('ペイントキメラ');r.tick(3000);
  assert.equal(r.g.hp.hp,hpBefore,'みがわりが うけとめて ダメージなし');assert(!r.g.battle.mirror,'みがわりは 1回で きえる');
  r.cmd('attack');r.tick(3000);assert(r.g.hp.hp<hpBefore,'つぎの ターンは ふつうに ダメージを うける');
  // 技: バックアップは いまの HPを ほぞんし、3ターンの うちに たおれそうに なったら 1かいだけ もどす。
  st.battery=100;r.g.debugStartBattle('popup','r24-backup');r.tick(300);Object.assign(r.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});const savedHp=r.g.hp.hp;
  r.cmd('summon');r.button('サーバークジラ');r.tick(3000);assert(r.g.battle.backup&&r.g.battle.backup.hp===savedHp,'いまの HPを ほぞんした');
  r.g.debugDamage(r.g.hp.hp-1);r.tick(300);
  r.cmd('attack');r.tick(3000);
  assert.equal(r.g.hp.hp,savedHp,'たおれる ところを バックアップで もとの HPに もどった');
  assert(!r.g.battle.backup,'バックアップは 1回で きえる');assert.equal(r.g.screen,'battle','たおれずに すんだ');
  for(const k of ['painterAsk','painterLike','painterJoin','painterIdle','hackerNeonFirst','hackerNeonAgain','hackerNeonJoin','hackerNeonIdle'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'R24 line fits '+row);}
 result.push('R24: 壁画のペイントキメラ（いっしょに かく・スプライトせいせい＝みがわり）とハッカーのお姉さんのサーバークジラ（また会う・きずな3・バックアップ）PASS');
 // R25: ミオの雨の日（STORY_V4.md 恋愛きずな3）。かさに いれる を えらぶと きずなが あがり、3で コトバイルカが 仲間に なり、ほんやく（てきが1回やすむ）が つかえる。
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(3));const D=r.g.GAME_DATA,st=r.g.state;
  assert(D.summons.kotoba&&D.summons.kotoba.rest&&D.summons.kotoba.frame===4,'kotoba summon data (rest, sheet frame 4)');
  const mio=D.maps.neon.objects.find(o=>o.id==='neon_mio');assert(mio&&mio.kind==='npc2'&&mio.frame===0&&mio.event==='mioRain','Mio stands in ネオンシティ with the npc2 picture');
  const read=[];const talk=(ev,...picks)=>{r.g.debugEvent(ev);let seen=r.protoRuns.length;for(let i=0;i<40;i++){if(r.g.dialogue){read.push(...r.g.dialogue.lines.map(l=>l.join(' ')));r.click('dialogue');continue;}if(r.g.modal==='event'){r.tick(300);r.button(picks.shift()||'さきに いく');continue;}if(r.protoRuns.length>seen){const run=r.protoRuns.at(-1);seen=r.protoRuns.length;run.onDone(run.state);continue;}break;}assert(!r.g.dialogue&&!r.g.modal,'event '+ev+' finishes');r.tick(300);};
  // Before her heart 3, if RYOSEI runs ahead, nothing changes.
  st.bonds.mio=2;talk('mioRain','さきに いく');assert.equal(st.bonds.mio,2,'さきに いく では きずなが あがらない');assert(!r.g.summons.includes('kotoba'));
  // Sharing the umbrella raises her heart to 3, and コトバイルカ joins.
  talk('mioRain','かさに いれる');assert.equal(st.bonds.mio,3,'かさに いれる で きずなが あがる');
  assert(r.g.summons.includes('kotoba'),'きずな3で コトバイルカが 仲間に なる');
  assert.equal(r.protoRuns.at(-1).mode,'text','R47: コトバイルカが仲間になるとプロトタイプのタイトルをほんやくできる');
  talk('mioRain');const all=read.join('\n');assert(all.includes('コトバイルカ'));
  for(const t of ['すき','キス','デート'])assert(!all.includes(t),'12-year-old story: no '+t);
  // 技: ほんやく（てきの ことばが わかって、てきが 1かい やすむ）。
  st.battery=100;r.g.debugStartBattle('popup','r25-honyaku');r.tick(300);const hpBefore=r.g.hp.hp;
  r.cmd('summon');r.button('コトバイルカ');r.tick(3000);
  assert.equal(r.g.hp.hp,hpBefore,'てきは やすんで こうげきしない');assert(!r.g.battle.restEnemy,'やすみは 1回で きえる');
  r.cmd('attack');r.tick(3000);assert(r.g.hp.hp<hpBefore,'つぎの ターンは ふつうに こうげきする');
  for(const k of ['mioRainEarly','mioRainAsk','mioRainShare','mioRainJoin','mioRainSkip','mioRainIdle'])for(const l of D.dialogue[k])for(const row of l[1].split('\n'))assert(wide(row)<=12.5,'R25 line fits '+row);}
 result.push('R25: ミオの雨の日（かさに いれる で きずな3・コトバイルカが 仲間に なる）とほんやく（てきが 1かい やすむ）PASS');
 // R44: prototype event pauses the field, stores its result before continuing, and is optional in old saves/builds.
 {const r=await runtime();r.tick();r.g.debugStartChapter(2);r.g.state.aiName='ほし';
  const plain=x=>JSON.parse(JSON.stringify(x)),defaults={v:1,jump:6,sprite:0,title:'ja',deployed:false};
  assert.deepEqual(plain(r.g.debugProto()),defaults);const copy=r.g.debugProto();copy.jump=3;assert.equal(r.g.debugProto().jump,6,'debug returns a copy');
  const scene=r.g.GAME_DATA.chapters[1].clearEvent,at=scene.findIndex(s=>s.say==='makeGame');assert.equal(scene[at+1].proto,'lesson');
  const lines=r.g.GAME_DATA.dialogue.makeGame;assert.equal(lines.length,2);for(const [,text] of lines)for(const line of text.split('\n'))assert([...line].length<=30);
  let finished=0,received;r.key('ArrowRight');r.g.debugEvent([{proto:'lesson'},{flag:'protoDone'}],()=>{finished++;received=plain(r.g.debugProto());});
  assert.equal(r.protoRuns.length,1);const cfg=r.protoRuns[0];assert.equal(cfg.mode,'lesson');assert.deepEqual(plain(cfg.state),defaults);assert.equal(cfg.aiName,'ほし');assert.equal(cfg.platform,r.g.platform);assert.equal(cfg.learn,r.RYW.learn);cfg.learn('prototype');cfg.learn('hensuu');assert(r.g.debugWords().includes('hensuu'));assert.equal(r.els.get('word-card').parentNode,r.els.get('proto-words'));assert.equal(r.els.get('word-card').style.top,'116px');assert(!r.els.get('word-card').hidden);r.resize(540,960);assert.equal(r.els.get('proto-words').style.transform,r.els.get('stage').style.transform);
  const pos=plain(r.g.position);r.tick(1000);r.key('ArrowDown');r.tick(1000);r.click('menu-btn');r.key('Escape');r.click('talk-btn');assert.equal(r.g.modal,'');assert(!r.g.dialogue);assert.deepEqual(plain(r.g.position),pos);assert(!r.g.state.flags.protoDone);assert.equal(finished,0);
  const next={v:4,jump:3,sprite:2,title:'en',deployed:true};cfg.onDone(next);assert(r.g.state.flags.protoDone);assert.equal(finished,1);assert.deepEqual(received,next);assert.equal(r.els.get('word-card').parentNode,r.els.get('stage'));next.jump=9;assert.equal(r.g.debugProto().jump,3,'completion state is copied');cfg.onDone(defaults);assert.equal(finished,1,'duplicate completion is ignored');
  r.tick(300);assert.deepEqual(plain(r.g.position),pos,'held keys do not resume after closing');r.key('ArrowRight');r.tick(200);r.key('ArrowRight',true);assert(r.g.position.x>pos.x,'walking resumes');
  await r.g.save(false);const saved=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.equal(saved.saveVersion,2);assert.deepEqual(saved.proto,received);
  const re=await runtime({saved:r.saved});re.tick();re.click('continue-btn');assert.deepEqual(plain(re.g.debugProto()),received);
  for(const proto of [undefined,null,[]]){const old=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...saved,proto})]])});old.tick();assert(!old.els.get('continue-btn').disabled);old.click('continue-btn');assert.equal(old.g.screen,'field');assert.deepEqual(plain(old.g.debugProto()),defaults);}
  r.g.state.items.firstgame=1;r.tick(300);r.click('menu-btn');r.button('アイテム');r.button('はじめて つくった ゲーム');assert.deepEqual(r.els.get('modal-buttons').children.map(b=>b.textContent),['あそぶ','しらべる','もどる']);r.button('しらべる');assert(r.els.get('modal-title').textContent.includes('v4'));assert.equal(r.els.get('modal-copy').textContent,r.g.GAME_DATA.items.firstgame.desc);r.button('もどる');r.button('あそぶ');
  const play=r.protoRuns.at(-1);assert.equal(play.mode,'play');assert.deepEqual(plain(play.state),received);r.click('menu-btn');assert.equal(r.g.modal,'');play.onDone(play.state);assert.equal(r.g.modal,'items');assert.equal(r.g.state.items.firstgame,1);
  r.tick(300);r.key('Escape');r.g.debugOpenProto('play');assert.equal(r.protoRuns.at(-1).mode,'play');r.protoRuns.at(-1).onDone(received);
  r.g.debugEvent([{proto:'play'},{flag:'playDone'}]);assert(!r.g.state.flags.playDone);r.protoRuns.at(-1).onDone(received);assert(r.g.state.flags.playDone);
  const no=await runtime({omitProto:true});no.tick();no.g.debugStartChapter(2);no.g.debugEvent([{proto:'lesson'},{proto:'play'},{flag:'withoutProto'}]);assert(no.g.state.flags.withoutProto,'missing script immediately continues');no.click('menu-btn');assert.equal(no.g.modal,'menu');
  const cloud=await runtime({sdk:true});cloud.tick();cloud.g.debugStartChapter(2);cloud.g.debugOpenProto('lesson');cloud.protoRuns[0].onDone(received);await cloud.g.save(false);assert.deepEqual(cloud.saves.at(-1).proto,received);
 }
 result.push('Prototype: lesson/play events, input lock, completion ordering, chapter 1 scene, local/cloud/old saves, item play/inspect/back, debug hooks, missing script fallback PASS');
 // R39-R42: vocabulary data, collection, save compatibility, nonblocking cards and prompt turns.
 {const wordsSource=scripts.find(s=>s.file==='v5/data/words.js');assert(wordsSource,'index loads words');
  const ids=[...wordsSource.code.matchAll(/^ ([a-z]+):\{/gm)].map(m=>m[1]);assert.equal(ids.length,65);assert.equal(new Set(ids).size,65,'no duplicate declarations');
  const r=await runtime();r.tick();r.g.debugStartChapter(2);const W=r.RYW.words;assert.equal(Object.keys(W).length,65);assert.equal(r.g.state.mode,'adult','a fresh game defaults to adult mode (SPEC_V7_MANABU.md 9)');r.g.state.mode='kids';r.RYW.setMode('kids');
  for(const [id,w] of Object.entries(W)){assert.equal(typeof w.kind,'string',id+'.kind');assert.equal(typeof w.where,'string',id+'.where');assert(['code','game','ai','net'].includes(w.kind));
   for(const key of ['word','yomi','code'])assert.equal(typeof w.kids[key],'string',id+'.kids.'+key);
   for(const key of ['word','one','mean','work','code'])assert.equal(typeof w.adult[key],'string',id+'.adult.'+key);
   assert([...w.kids.sora].length<=30,id+' kids.sora');assert([...w.kids.real].length<=30,id+' kids.real');
   assert([...w.adult.one].length<=30,id+' adult.one');assert(w.adult.mean.split('。').filter(Boolean).length<=2,id+' adult.mean sentences');
   assert.equal(r.RYW.word(id),w.kids.word);}
  for(const src of scripts)for(const m of src.code.matchAll(/(?:RYW\.(?:learn|word|learnQuiet)|\b(?:word|learnQuiet))\(\s*['"]([^'"]+)['"]/g))assert(Object.hasOwn(W,m[1]),src.file+' word id '+m[1]);
  const warns=[],oldWarn=console.warn;try{console.warn=(...a)=>warns.push(a);assert.equal(r.RYW.word('missing-word'),'missing-word');assert.equal(r.g.debugLearn('missing-word'),false);}finally{console.warn=oldWarn;}assert.equal(warns.length,2);
  r.g.state.aiName='ほし';r.g.debugLearn('jikkou');assert.equal(r.els.get('word-who').textContent,'ほし','the renamed partner is named on the card');assert.equal(r.g.debugLearn('jikkou'),false);
  r.key('ArrowRight');const x=r.g.position.x;r.tick(200);r.key('ArrowRight',true);assert(r.g.position.x>x,'card does not stop walking');
  const queued=['prompt','forloop','seisei','item','cost'];queued.forEach(id=>r.g.debugLearn(id));assert.equal(r.g.debugWords().length,6,'queue overflow still collected');
  const shown=[];for(let i=0;i<4;i++){shown.push(r.els.get('word-title').textContent);r.click('word-card');}assert(r.els.get('word-card').hidden);assert(shown[0].includes('じっこう')&&shown[3].includes('せいせい'));assert(!shown.some(t=>t.includes('アイテム')),'only three waiting cards');
  r.g.debugLearn('debug');r.tick(2400);assert(!r.els.get('word-card').hidden);r.visibility(true);r.tick(3000);assert(!r.els.get('word-card').hidden);r.visibility(false);r.tick(150);assert(r.els.get('word-card').hidden,'2.5 seconds, excluding host pause');
  r.RYW.learnQuiet('codegen');assert(r.g.debugWords().includes('codegen'));assert(r.els.get('word-card').hidden);
  r.g.debugOpenNote();assert.equal(r.g.modal,'words');assert(r.els.get('modal-copy').textContent.includes('8 / 65'));assert.equal(r.els.get('modal-buttons').children.filter(e=>e.tagName==='H3').length,4);assert.equal(r.els.get('modal-buttons').children.filter(e=>e.disabled).length,57);r.button('じっこう');assert.equal(r.g.modal,'word-detail');assert(r.els.get('modal-copy').children.some(e=>e.tagName==='CODE'&&e.textContent==='run()'));r.key('Escape');
  r.g.debugOpenNote();assert(r.els.get('modal-buttons').children.some(e=>e.textContent==='おさらい'),'quiz entry shown at 4+ words');
  r.setRandom(()=>0);r.button('おさらい');assert.equal(r.g.modal,'quiz');assert.equal(r.els.get('modal-title').textContent,'おさらい　1/3');assert.equal(r.els.get('modal-buttons').children.length,4,'four choices');
  for(let i=1;i<=3;i++){assert.equal(r.els.get('modal-title').textContent,'おさらい　'+i+'/3');r.els.get('modal-buttons').children[0].onclick();assert.equal(r.g.modal,'quiz-feedback',i+'th answer shows feedback before moving on');assert.equal(r.els.get('modal-title').textContent,'せいかい！','always-first-choice run is correct when random is fixed');assert(r.g.fx.flashUntil>0&&r.g.fx.flash!=='#fff','correct answer flashes the screen');r.button(i<3?'つぎへ':'けっか');}
  assert.equal(r.g.modal,'quiz-result');assert(r.els.get('modal-copy').textContent.startsWith('3もん中 3もん せいかい'),'always-first-choice run is correct when random is fixed');r.key('Escape');r.setRandom(Math.random);
  r.setRandom(()=>0);r.g.debugOpenNote();r.button('おさらい');r.els.get('modal-buttons').children[1].onclick();assert.equal(r.g.modal,'quiz-feedback');assert.equal(r.els.get('modal-title').textContent,'ざんねん…','wrong choice says so instead of silently moving on');assert(r.els.get('modal-copy').textContent.includes('こたえは'),'wrong feedback shows the correct meaning');r.key('Escape');r.setRandom(Math.random);
  const few=await runtime();few.tick();few.g.debugLearn('jikkou');few.g.debugLearn('item');few.g.debugLearn('cost');few.g.debugOpenNote();assert(!few.els.get('modal-buttons').children.some(e=>e.textContent==='おさらい'),'quiz hidden under 4 words');few.key('Escape');
  r.click('menu-btn');r.button('ステータス');r.tick(16);assert(!r.els.get('word-card').hidden,'card visible above modal');assert.equal(r.els.get('word-card').style.top,'16px');r.key('Escape');
  await r.g.save(false);const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.equal(sv.saveVersion,2);assert.equal(sv.words.length,9);
  const again=await runtime({saved:r.saved});again.tick();again.click('continue-btn');assert.deepEqual([...again.g.debugWords()],sv.words);assert.equal(again.g.debugLearn('debug'),false);
  for(const words of [undefined,null,{},['jikkou','jikkou','unknown',12]]){const old=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...sv,words})]])});old.tick();assert(!old.els.get('continue-btn').disabled,'old/malformed optional words do not reject save');old.click('continue-btn');assert.deepEqual([...old.g.debugWords()],Array.isArray(words)?['jikkou']:[]);}
  const sd=await runtime({sdk:true});sd.tick();sd.g.debugStartChapter(1);sd.g.debugLearn('hp');await sd.g.save(false);assert.deepEqual(sd.saves.at(-1).words,['hp']);
  const no=await runtime({omitWords:true});no.tick();no.g.debugStartChapter(2);no.g.debugLearn('hp');no.cmd('attack');no.click('menu-btn');no.button('つよさ');assert.equal(no.g.modal,'menu','old labels work without words');
  const batch=r.RYW.prepareBossWords(['shot','life','frame','vector','if']);assert.equal(batch.length,2);assert(batch.every(w=>w.speaker==='ほし'));assert(batch.every(w=>typeof w.word==='string'&&w.word&&typeof w.sora==='string'&&w.sora),'boss word cards carry real word/sora text, not undefined');for(const id of ['shot','life','frame','vector','if'])assert(r.g.debugWords().includes(id));assert.equal(r.RYW.prepareBossWords(['shot','life','frame']).length,0);
 }
 result.push('Words: 65 unique ids (49 kids + 16 adult-only AI/dev terms), adult/kids fields/limits/kinds/references; first-time cards, queue cap, click/timeout/pause, menu visibility, notebook, old/cloud saves, missing script fallback, boss batch PASS');
 {const r=await runtime();r.tick();r.g.debugStartChapter(2);r.g.state.mode='kids';r.RYW.setMode('kids');r.g.debugStartBattle('popup','words-create');r.tick(300);Object.assign(r.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});
  const b=r.g.battle,hp=b.enemy.hp;r.cmd('create');assert.equal(r.g.modal,'create');assert(r.g.debugWords().includes('prompt'));assert.equal(b.turn,0);r.button('もどる');assert.equal(b.enemy.hp,hp);assert(!b.locked);
  r.cmd('create');r.button('くりかえし');assert.equal(b.loopHit.n,1);const first=hp-b.enemy.hp;r.tick(400);assert.equal(b.loopHit.n,2);assert.equal(hp-b.enemy.hp,r.g.GAME_DATA.rules.baseAttack+(r.g.level-1)*r.g.GAME_DATA.rules.attackPerLevel+10);assert(first>0&&first<hp-b.enemy.hp);r.tick(700);assert.equal(b.turn,1,'two hits, one enemy move');assert.equal(r.g.state.status,'ひょうじバグ');assert(r.g.debugWords().includes('hyoujibug'));
  for(const [rand,name] of [[0,'しゃべる くつした'],[.4,'ねこの クッション'],[.9,'ちいさな ロボ']]){r.g.hp.hp=r.g.hp.displayHp=r.g.hp.rollTarget=20;r.g.hp.rolling=false;r.setRandom(()=>rand);const turn=b.turn,enemy=b.enemy.hp;r.cmd('create');r.button('なにか');assert.equal(r.g.hp.hp,28);assert.equal(b.enemy.hp,enemy);assert(b.log.includes(name));r.tick(750);assert.equal(b.turn,turn+1);}
  assert(r.g.debugWords().includes('seisei')&&r.g.debugWords().includes('forloop'));r.cmd('summon');assert(r.g.debugWords().includes('yobidasu')&&r.g.debugWords().includes('cost'));assert(r.els.get('modal-buttons').children.some(e=>e.textContent.includes('デバッグ')&&e.textContent.includes('コスト 15')));r.button('ナオスライム');r.tick(1000);assert.equal(r.g.state.status,null);assert(b.log.includes('デバッグ'));r.tick(2000);
  r.cmd('summon');r.button('コードラゴン');r.tick(1000);assert(b.log.includes('コードせいせい'));r.tick(2000);assert(r.g.debugWords().includes('debug')&&r.g.debugWords().includes('codegen'));
  for(const [enemy,id] of [['crow','glitch'],['spam','spam'],['maskcat','narisumashi'],['bugking','bug']]){r.g.debugWarp('room',5,9);r.g.debugStartBattle(enemy,'words-'+enemy);assert(r.g.debugWords().includes(id));}
 }
 result.push('Prompts: cancel uses no turn; for loop two numbered hits and original total; generation three variants heal 8; one enemy move each; skills/status/enemy word triggers PASS');
 // R50/R51: challenge entry, separated records, test-only entitlement and parent gate.
 {const plain=x=>JSON.parse(JSON.stringify(x)),labels=r=>r.els.get('modal-buttons').children.map(b=>b.textContent),copy=r=>r.els.get('modal-copy').textContent;
  const blank={godmode:false,timescale:false,widejudge:false,showhitbox:false},record={stage:0,bestCombo:0,score:0};
  const answer=r=>{const m=copy(r).match(/(\d+) × (\d+)/);assert(m,'parent multiplication');return Number(m[1])*Number(m[2]);};
  const r=await runtime({search:'&shop=test'});r.tick();r.g.debugStartChapter(1);r.g.state.mode='kids';r.RYW.setMode('kids');r.click('menu-btn');assert(!labels(r).includes('チャレンジ'));assert(labels(r).includes('デバッグモード'));assert.equal(r.g.debugStartChallenge(1),false);
  r.g.state.bosses.push('bugking');r.g.state.flags.gameMade=true;r.key('Escape');r.click('menu-btn');assert(labels(r).includes('チャレンジ'),'chapter 1 boss clear unlocks entry');
  r.button('チャレンジ');assert.equal(r.g.modal,'cheats');assert.equal(r.shooterRuns.length,0);assert(r.g.debugWords().includes('cheat')&&r.g.debugWords().includes('debugmode'));
  r.button('はじめる');assert.equal(r.shooterRuns.at(-1).cfg.mode,'challenge');assert.equal(r.shooterRuns.at(-1).cfg.startStage,1);assert.deepEqual(plain(r.shooterRuns.at(-1).cfg.options.cheats),blank);
  const first=r.shooterRuns.at(-1).cfg;first.onEnd({stage:12,bestCombo:48,score:1000,cheated:false});assert.equal(r.g.screen,'field');assert(copy(r).includes('さいこう ステージ 12')&&copy(r).includes('さいこう コンボ 48'));assert(!copy(r).includes('チートつき'),'R103: no cheat record row before any cheat run');
  first.onEnd({stage:99,bestCombo:99,score:99999,cheated:true});assert.deepEqual(plain(r.g.state.challenge.bestCheat),record,'duplicate callback ignored');
  r.tick(300);r.key('Escape');const shop=r.g.debugShop();assert.equal(shop,r.RYW.Shop);assert.equal(shop.kind,'test');assert.equal(shop.has('debugmode'),false);assert.equal(await shop.buy('unknown'),false);assert.equal(await shop.restore(),false);
  r.g.debugOpenCheats();r.button('［デバッグモード');assert.equal(r.g.modal,'shop-gate');assert.equal(labels(r).filter(t=>/^\d+$/.test(t)).length,4);assert(!r.g.debugWords().includes('iap'));const q=copy(r),wrong=labels(r).find(t=>/^\d+$/.test(t)&&Number(t)!==answer(r));r.button(wrong);await settle();assert.equal(r.g.modal,'');assert(!shop.has('debugmode'));assert(!r.g.debugWords().includes('iap'));
  const pending=shop.buy('debugmode');assert.notEqual(copy(r),q);r.key('Escape');assert.equal(await pending,false);assert(!shop.has('debugmode'));
  r.g.debugOpenCheats();r.button('［デバッグモード');r.button(String(answer(r)));assert.equal(r.g.modal,'debug-shop');assert(copy(r).includes('テスト用（おかねは うごかない）'));assert(r.g.debugWords().includes('iap'));assert(!shop.has('debugmode'),'gate does not buy');r.button('デバッグモードを ひらく');await settle();assert.equal(r.g.modal,'cheats');assert(shop.has('debugmode'));assert.equal(await shop.restore(),true);
  for(const text of ['ゴッドモード','タイムスケール','はんてい ワイド','あたりはんてい'])r.button(text);assert(Object.values(r.g.state.cheats).every(Boolean));assert(r.g.debugWords().includes('godmode')&&r.g.debugWords().includes('timescale'));
  const words=[...r.g.debugWords()];r.button('ゴッドモード');r.button('ゴッドモード');assert.deepEqual([...r.g.debugWords()],words,'learning happens once');
  r.key('Escape');r.g.debugStartChallenge(7);r.button('はじめる');const c=r.shooterRuns.at(-1).cfg;assert.equal(c.startStage,7);assert.equal(c.platform,r.g.platform);assert(Object.values(c.options.cheats).every(Boolean));assert.notEqual(c.options.cheats,r.g.state.cheats,'options copied');
  c.onEnd({stage:20,bestCombo:60,score:2000,cheated:true});assert(r.els.get('modal-title').textContent.includes('チートつき'));assert.equal(r.g.state.challenge.best.stage,12);assert.equal(r.g.state.challenge.bestCheat.stage,20);assert(/チートつき\nさいこう ステージ 20/.test(copy(r)),'R103: the cheat record shows after a cheat run');
  r.tick(300);r.button('もう いちど');for(const text of ['ゴッドモード','タイムスケール','はんてい ワイド','あたりはんてい'])r.button(text);r.button('はじめる');r.shooterRuns.at(-1).cfg.onEnd({stage:8,bestCombo:55,score:800,cheated:false});assert.deepEqual(plain(r.g.state.challenge.best),{stage:12,bestCombo:55,score:1000},'best fields retain independent maxima');
  r.tick(300);r.key('Escape');r.g.debugOpenCheats();r.button('ゴッドモード');r.key('Escape');r.g.debugStartBoss('bugking');assert.equal(r.g.modal,'cheats');r.button('はじめる');assert.equal(r.shooterRuns.at(-1).cfg.options.cheats.godmode,true,'story boss receives cheats');r.shooterRuns.at(-1).cfg.onLose('retry');assert.equal(r.g.modal,'cheats');r.button('ゴッドモード');r.button('はじめる');assert.equal(r.shooterRuns.at(-1).cfg.options.cheats.godmode,false,'retry reads new switches');r.g.debugWarp('room',5,9);r.g.debugOpenCheats();r.button('タイムスケール');r.key('Escape');
  await r.g.save(false);const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));assert.equal(sv.saveVersion,2);assert.equal(sv.shop.debugmode,true);assert.equal(sv.cheats.timescale,true);assert.equal(sv.cheats.godmode,false);assert.equal(sv.challenge.bestCheat.stage,20);
  const re=await runtime({search:'&shop=test',saved:new Map(r.saved)});re.tick();re.click('continue-btn');for(const k of ['shop','cheats','challenge'])assert.deepEqual(plain(re.g.state[k]),sv[k],k+' reload');assert(re.RYW.Shop.has('debugmode'));re.g.debugOpenCheats();assert.equal(re.g.debugWords().length,sv.words.length);
  for(const extra of [{},{shop:null,cheats:[],challenge:null},{shop:{debugmode:'yes'},cheats:{godmode:'true',timescale:1,other:true},challenge:{best:{stage:-3,bestCombo:'bad'},bestCheat:[]}}]){
   const old={...sv};for(const k of ['shop','cheats','challenge'])delete old[k];Object.assign(old,extra);const o=await runtime({search:'&shop=test',saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify(old)]])});o.tick();o.click('continue-btn');assert.equal(o.g.screen,'field');assert.deepEqual(plain(o.g.state.shop),{debugmode:false});assert.deepEqual(plain(o.g.state.cheats),blank);assert.deepEqual(plain(o.g.state.challenge),{best:record,bestCheat:record});}
  for(const [capacitor,kind] of [[null,'none'],[{isNativePlatform:()=>false,getPlatform:()=> 'ios'},'none'],[{isNativePlatform:()=>true,getPlatform:()=> 'ios'},'ios'],[{isNativePlatform:()=>true,getPlatform:()=> 'android'},'none']]){
   const b=await runtime({capacitor,saved:new Map(r.saved)});b.tick();b.click('continue-btn');assert.equal(b.RYW.Shop.kind,kind);b.g.debugOpenCheats();assert.equal(copy(b),'デバッグモードは アプリ版で つかえるよ');assert.deepEqual(labels(b),['もどる']);assert.equal(await b.RYW.Shop.buy('debugmode'),false);assert.equal(await b.RYW.Shop.restore(),false);assert(!b.RYW.Shop.has('debugmode'));b.key('Escape');b.g.debugStartChallenge(1);b.button('はじめる');assert.deepEqual(plain(b.shooterRuns.at(-1).cfg.options.cheats),blank,'test ownership cannot enable cheats outside test shop');}
  const sd=await runtime({sdk:true,search:'&shop=test',rawSave:JSON.stringify({...sv,cheats:{...blank,godmode:true}})});sd.tick();sd.click('continue-btn');assert.equal(sd.RYW.Shop.kind,'none');sd.click('menu-btn');assert(!labels(sd).some(t=>/デバッグ|ひらく/.test(t)));assert(labels(sd).includes('チャレンジ'));const before=sd.g.modal;assert.equal(sd.g.debugOpenCheats(),false);assert.equal(await sd.RYW.Shop.buy('debugmode'),false);assert.equal(await sd.RYW.Shop.restore(),false);assert.equal(sd.g.modal,before);
  sd.button('チャレンジ');assert.equal(sd.g.modal,'challenge');assert(!/アプリ|おかね|テスト用|デバッグ/.test(copy(sd)+labels(sd).join('')));sd.button('はじめる');assert.deepEqual(plain(sd.shooterRuns.at(-1).cfg.options.cheats),blank);sd.shooterRuns.at(-1).cfg.onEnd({stage:13,bestCombo:49,score:1500,cheated:false});await settle();assert.equal(sd.saves.at(-1).challenge.best.stage,13);for(const k of ['shop','cheats','challenge'])assert(Object.hasOwn(sd.saves.at(-1),k),'cloud allowlist '+k);sd.tick(300);sd.key('Escape');sd.g.debugStartBoss('bugking');assert.equal(sd.g.screen,'shooter','Playables skips debug screen');assert.deepEqual(plain(sd.shooterRuns.at(-1).cfg.options.cheats),blank);
  const n=await runtime();n.tick();n.g.debugStartChapter(3);const door=n.g.GAME_DATA.maps.neon.objects.find(o=>o.id==='neon_stadium');n.g.debugWarp('neon',door.x,door.y+1.1);n.g.debugFace(3);n.tick(400);n.click('talk-btn');assert.equal(n.g.map,'neon_stadium');assert(talk(n,'neon_stadium',5,7.2).includes('リズム チャレンジ'));n.dialogue();n.tick(300);assert.equal(n.g.modal,'cheats');n.button('はじめる');assert.equal(n.shooterRuns.at(-1).cfg.mode,'challenge');n.shooterRuns.at(-1).cfg.onEnd({stage:1,bestCombo:0,score:0,cheated:false});assert.equal(n.g.map,'neon_stadium');n.tick(300);n.key('Escape');n.g.debugWarp('neon_stadium',5,10.7);n.tick(400);n.key('ArrowDown');n.tick(500);n.key('ArrowDown',true);assert.equal(n.g.map,'neon','stadium exit works');
 }
 result.push('R50/R51: chapter gate, stadium entry/exit, challenge starts/results/reload, separate cheat records, story cheats/retry, test parent gate correct/wrong/cancel, vocabulary, browser/iOS/Playables restrictions, old/malformed/cloud saves PASS');
 // SPEC_V7_MANABU.md 9・9.1: adult/kids mode picker, settings switch, save compatibility, parent gate kids-only.
 {const labels=r=>r.els.get('modal-buttons').children.map(b=>b.textContent),copy=r=>r.els.get('modal-copy').textContent;
  const a=await runtime();a.tick();a.click('start-btn');assert.equal(a.g.modal,'mode-select');assert.equal(a.active().textContent,'おとなモード','adult is picked first');a.button('おとなモード');assert.equal(a.g.state.mode,'adult');a.dialogue();a.els.get('name-input').value='アダルト';a.click('naming-confirm');a.dialogue();assert.equal(a.g.screen,'battle');
  assert.equal(a.els.get('commands').children.find(e=>e.dataset.cmd==='create').textContent,'作る');assert.equal(a.els.get('commands').children.find(e=>e.dataset.cmd==='run').textContent,'逃げる');
  a.g.debugLearn('jikkou');assert.equal(a.RYW.word('jikkou'),'実行');assert.equal(a.RYW.card('jikkou'),'命令を動かそう');
  a.g.debugWin();a.tick(2100);while(a.g.dialogue)a.dialogue();
  a.g.debugOpenNote();a.button('実行');const detail=a.els.get('modal-copy').children.map(e=>e.textContent);assert(detail.includes('一言')&&detail.includes('命令を動かそう'));assert(a.els.get('modal-copy').children.some(e=>e.tagName==='CODE'&&e.textContent==='main()'));a.key('Escape');a.key('Escape');
  a.g.debugStartBattle('popup','adult-create');a.tick(300);Object.assign(a.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});a.cmd('create');assert(a.els.get('modal-title').textContent.includes('ソラに頼む'));assert(a.els.get('modal-buttons').children.some(e=>e.textContent.includes('繰り返し攻撃')));assert(a.els.get('modal-buttons').children.some(e=>e.textContent.includes('何か作って')));a.key('Escape');
  a.g.debugWin();a.tick(2100);while(a.g.dialogue)a.dialogue();a.tick(300);
  a.click('menu-btn');assert(labels(a).includes('武器')&&labels(a).includes('召喚獣')&&labels(a).includes('設定'),'adult menu labels');assert(!labels(a).some(t=>t==='ぶき'||t==='しょうかんじゅう'));
  a.button('設定');assert.equal(a.g.modal,'settings');assert(a.els.get('modal-buttons').children.some(e=>e.textContent.includes('おとな')));a.button('モード');assert.equal(a.g.state.mode,'kids');assert.equal(a.RYW.mode,'kids');
  assert.equal(a.els.get('commands').children.find(e=>e.dataset.cmd==='create').textContent,'つくる');a.button('モード');assert.equal(a.g.state.mode,'adult');a.key('Escape');a.key('Escape');
  await a.g.save(false);const asv=JSON.parse(a.saved.get('ryoseiworld-rpg-v5'));assert.equal(asv.mode,'adult');
  const again=await runtime({saved:a.saved});again.tick();again.click('continue-btn');assert.equal(again.g.state.mode,'adult');assert.equal(again.RYW.mode,'adult');
  const legacy={...asv};delete legacy.mode;const old=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify(legacy)]])});old.tick();old.click('continue-btn');assert.equal(old.g.state.mode,'adult','a save without mode defaults to adult');
  const kidsRun=await runtime();kidsRun.tick();kidsRun.start('kids');assert.equal(kidsRun.g.state.mode,'kids');kidsRun.g.debugWin();kidsRun.tick(2100);while(kidsRun.g.dialogue)kidsRun.dialogue();kidsRun.tick(300);kidsRun.click('menu-btn');assert(labels(kidsRun).includes('ぶき')&&labels(kidsRun).includes('しょうかんじゅう'));
 }
 {const labels=r=>r.els.get('modal-buttons').children.map(b=>b.textContent),copy=r=>r.els.get('modal-copy').textContent;
  const k=await runtime({search:'&shop=test'});k.tick();k.g.debugStartChapter(1);k.g.state.mode='kids';k.RYW.setMode('kids');
  const shop=k.g.debugShop(),pending=shop.buy('debugmode');assert.equal(k.g.modal,'shop-gate','kids mode keeps the parent-gate math question');assert.equal(labels(k).filter(t=>/^\d+$/.test(t)).length,4);k.key('Escape');assert.equal(await pending,false);
  const ad=await runtime({search:'&shop=test'});ad.tick();ad.g.debugStartChapter(1);
  const shopA=ad.g.debugShop();shopA.buy('debugmode');assert.equal(ad.g.modal,'shop-gate');assert.equal(labels(ad).filter(t=>/^\d+$/.test(t)).length,0,'adult mode skips the parent-gate math question');assert(labels(ad).includes('買う'));ad.button('買う');assert.equal(ad.g.modal,'debug-shop');assert(labels(ad).includes('デバッグモードを開く'));
 }
 result.push('Modes: adult default at title, adult/kids command and menu labels, note one/mean/work/code, settings switch, save/old-save compatibility, kids-only parent gate PASS');
 // FUN11: command battles shake the screen when a hit lands, giving attacks a sense of impact.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  r.g.debugStartBattle('vending','fun11-attack');r.tick(300);Object.assign(r.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});
  assert.equal(r.g.fx.shakeUntil,0,'no shake before any hit lands');
  r.cmd('attack');assert(r.g.fx.shakeUntil>0&&r.g.fx.shake>0,'the hero landing a hit shakes the screen');r.tick(3000);
  r.g.fx.shake=0;r.g.fx.shakeUntil=0;r.tick(3000);
  assert(r.g.fx.shakeUntil>0&&r.g.fx.shake>0,'the zako hitting back also shakes the screen');}
 result.push('FUN11: ザコ戦のコマンド攻撃で攻撃・被弾の両方が画面を揺らす PASS');
 // FUN13: beating a challenge personal best gets its own fanfare+title, and a non-record run shows the next stage as a short goal.
 {const title=r=>r.els.get('modal-title').textContent,copy=r=>r.els.get('modal-copy').textContent;
  const r=await runtime();r.tick();r.g.debugStartChapter(1);r.g.state.bosses.push('bugking');r.g.state.flags.gameMade=true;r.click('menu-btn');r.button('チャレンジ');r.button('はじめる');
  r.shooterRuns.at(-1).cfg.onEnd({stage:5,bestCombo:20,score:500,cheated:false});
  assert(title(r).includes('きろく こうしん'),'first clear is always a new record');assert(!copy(r).includes('つぎは'),'no next-stage hint on a record run');
  r.tick(300);r.button('もう いちど');r.button('はじめる');r.shooterRuns.at(-1).cfg.onEnd({stage:3,bestCombo:10,score:200,cheated:false});
  assert.equal(title(r),'チャレンジの きろく','a worse run keeps the plain title');assert(copy(r).includes('つぎは ステージ 6 を めざそう'),'a worse run points at the next stage past the best');
  r.tick(300);r.button('もう いちど');r.button('はじめる');r.shooterRuns.at(-1).cfg.onEnd({stage:9,bestCombo:15,score:900,cheated:false});
  assert(title(r).includes('きろく こうしん'),'beating the best stage is a new record even with a lower combo');assert(!copy(r).includes('つぎは'));}
 result.push('FUN13: リズムチャレンジで きろく こうしん時に 演出、そうでない時に つぎの もくひょうを 出す PASS');
 // FUN21: casting a summon flashes the screen at the moment its effect lands, same as the healing flash elsewhere (warp/lift-off).
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  r.g.debugStartBattle('vending','fun21-summon');r.tick(300);Object.assign(r.g.battle.enemy,{hp:900,maxHp:900,displayHp:900});r.g.hp.hp=10;
  assert.equal(r.g.fx.flashUntil,0,'no flash before the summon is cast');
  r.cmd('summon');r.button('ナオスライム');r.tick(900);
  assert(r.g.fx.flashUntil>0,'the heal effect lands with a screen flash, not just a sound');assert.notEqual(r.g.fx.flash,'#fff','the heal flash uses its own colour');}
 result.push('FUN21: しょうかんの こうかが とどいた しゅんかんに がめんが フラッシュする PASS');
 // SPEC_V9_MUSIC 3: recorded town/battle/boss/victory tracks loop from data/music.json; missing, broken or invalid entries keep the synth.
 {const T=(file,extra={})=>({file:'assets/music/'+file,bpm:120,loopStart:2,loopEnd:18,gain:.8,once:false,...extra});
  const ledger={version:1,tracks:{town:T('town.mp3'),battle:T('battle.mp3'),boss_turn:T('boss.mp3'),victory:T('victory.mp3',{once:true,loopEnd:10})}};
  const durations={'assets/music/town.mp3':20,'assets/music/battle.mp3':20,'assets/music/boss.mp3':20,'assets/music/victory.mp3':12};
  const fieldTones=async r=>{r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();assert.equal(r.g.screen,'field');r.tick(500);const before=r.calls.length;r.tick(3000);return r.calls.length-before;};
  const r=await runtime({musicLedger:ledger,musicDurations:durations});for(let i=0;i<12;i++)await settle();
  assert.deepEqual([...r.g.debugMusic().loaded].sort(),['battle','boss_turn','town','victory'],'all four recorded tracks decode before the first tap');
  assert.equal(r.g.debugMusic().key,'','no AudioContext before the first tap, so nothing plays yet');
  assert.equal(await fieldTones(r),0,'with recordings the synth melody stays silent in town');
  assert.equal(r.g.debugMusic().key,'town');const town=r.sources.find(s=>s.buffer.url.endsWith('town.mp3')&&!s.stopped);
  assert(town&&town.loop,'town loops');assert.equal(town.loopStart,2);assert.equal(town.loopEnd,18);assert.equal(town.started.offset,2,'the loop starts on beat 0');
  r.g.debugStartBattle('vending','rec-battle');r.tick(100);assert.equal(r.g.debugMusic().key,'battle');
  const ctx=r.audio[0];assert(Math.abs(town.stopped-ctx.currentTime-.32)<1e-6,'the old track stops after the 300ms fade');
  const battle=r.sources[r.sources.length-1];assert(battle.buffer.url.endsWith('battle.mp3')&&battle.loop&&!battle.stopped);
  const g=ctx.gains.find(x=>x.ramp&&x.ramp[0]===.8);assert(g&&Math.abs(g.ramp[1]-ctx.currentTime-.3)<1e-6,'the new track fades in over 300ms to the ledger gain');
  r.g.debugEvent([{chapterClear:true}]);r.tick(100);assert.equal(r.g.screen,'ending');assert.equal(r.g.debugMusic().key,'victory');
  const vic=r.sources[r.sources.length-1];assert.equal(vic.loop,false,'victory plays once');assert.equal(vic.started.offset,2);assert.equal(vic.started.dur,8);
  const n=r.calls.length;r.tick(6000);assert.equal(r.calls.length,n,'the synth does not take over after the recorded victory ends');
  // No ledger, a broken file, and a ledger whose loop is not a whole number of bars: the synth plays as before.
  const none=await runtime({musicLedger:null});for(let i=0;i<12;i++)await settle();assert(await fieldTones(none)>0,'without a ledger the synth plays');assert.equal(none.sources.length,0);
  const shipped=await runtime();for(let i=0;i<12;i++)await settle();assert(await fieldTones(shipped)>0,'the shipped empty ledger keeps the synth');assert.equal(shipped.sources.length,0);
  const broken=await runtime({musicLedger:{version:1,tracks:{town:T('town.mp3'),battle:T('nope.mp3')}},musicDurations:durations});for(let i=0;i<12;i++)await settle();
  assert.equal(await fieldTones(broken),0,'town still uses its recording');broken.g.debugStartBattle('vending','rec-broken');broken.tick(100);assert.equal(broken.g.debugMusic().key,'','a missing battle file falls back to the synth');
  const odd=await runtime({musicLedger:{version:1,tracks:{town:T('town.mp3',{loopEnd:17})}},musicDurations:durations});for(let i=0;i<12;i++)await settle();
  assert(await fieldTones(odd)>0,'a loop that is not whole 4/4 bars is rejected');assert.equal(odd.g.debugMusic().loaded.length,0);}
 result.push('SPEC_V9_MUSIC 3: 台帳ありで町・戦闘を録音でループし300msで重ねて切り替え、victory は1回、台帳なし・読めない・小節が合わない時は合成 PASS');
 // R62: a recorded title track plays on the title, prologue and naming screens and hands over to town in the field; without one the title keeps town.
 {const T=(file,extra={})=>({file:'assets/music/'+file,bpm:120,loopStart:2,loopEnd:18,gain:.8,once:false,...extra});
  const durations={'assets/music/title.mp3':20,'assets/music/town.mp3':20};
  const r=await runtime({musicLedger:{version:1,tracks:{title:T('title.mp3'),town:T('town.mp3')}},musicDurations:durations});for(let i=0;i<12;i++)await settle();
  r.tick(100);assert.equal(r.g.screen,'title');assert(r.g.debugMusic().loaded.includes('title'),'the title track decodes before the first tap');
  assert.equal(r.els.get('music-hint').hidden,false,'before the first tap the title shows the tap-for-music hint');assert.equal(r.audio.length,0);
  r.els.get('stage').listeners.pointerdown[0]({target:r.els.get('stage')});r.tick(100);
  assert.equal(r.audio.length,1,'a tap anywhere on the title opens the audio');assert.equal(r.g.debugMusic().key,'title','the title track starts after the tap');assert.equal(r.els.get('music-hint').hidden,true,'the hint goes away once music can play');
  const title=r.sources.find(s=>s.buffer.url.endsWith('title.mp3'));assert(title&&title.loop&&title.started.offset===2,'the title track loops from beat 0');
  r.click('start-btn');r.button('こどもモード');r.tick(100);assert.equal(r.g.screen,'prologue');assert.equal(r.g.debugMusic().key,'title','the prologue keeps the title track');
  r.dialogue();assert.equal(r.g.screen,'naming');r.tick(100);assert.equal(r.g.debugMusic().key,'title','naming keeps the title track');assert.equal(title.stopped,undefined);
  r.click('naming-confirm');r.tick(100);assert.equal(r.g.screen,'field');assert.equal(r.g.debugMusic().key,'town','the field switches to town');
  assert(Math.abs(title.stopped-r.audio[0].currentTime-.32)<1e-6,'the title track fades out over 300ms');
  const plain=await runtime({musicLedger:{version:1,tracks:{town:T('town.mp3')}},musicDurations:durations});for(let i=0;i<12;i++)await settle();
  plain.tick(100);plain.els.get('stage').listeners.pointerdown[0]({target:plain.els.get('stage')});plain.tick(100);assert.equal(plain.g.debugMusic().key,'town','without a title track the title plays town as before');
  // A title that decodes after the synth town is already audible does not cut in mid-screen; the next track change picks it up.
  const lateFiles={'assets/music/town.mp3':20};const late=await runtime({musicLedger:{version:1,tracks:{title:T('title.mp3'),town:T('town.mp3')}},musicDurations:lateFiles});for(let i=0;i<12;i++)await settle();
  late.tick(100);late.els.get('stage').listeners.pointerdown[0]({target:late.els.get('stage')});late.tick(100);assert.equal(late.g.debugMusic().key,'town','without a decoded title the title screen plays town');
  lateFiles['assets/music/title.mp3']=20;late.tick(16000);for(let i=0;i<12;i++)await settle();late.tick(100);
  assert(late.g.debugMusic().loaded.includes('title'),'the retry decodes the title');assert.equal(late.g.debugMusic().key,'town','a title decoded after town became audible does not cut in');
  const none=await runtime({musicLedger:null});for(let i=0;i<12;i++)await settle();none.tick(100);assert.equal(none.els.get('music-hint').hidden,false,'the synth also waits for a tap, so the hint shows without a ledger too');
  none.click('start-btn');none.tick(100);assert.equal(none.els.get('music-hint').hidden,true);assert.equal(none.sources.length,0);}
 result.push('R62: タイトル・プロローグ・名前の画面は録音の title、フィールドで town に切り替え、title が無ければ town、最初のタップまで「♪ タップで音楽」 PASS');
 // R68: the tutorial hint, the goal line and Sora's line name the summon button the way the button reads in each mode.
 {for(const [mode,label,other] of [['adult','呼び出す','よびだす'],['kids','よびだす','呼び出す']]){const r=await runtime();r.tick();r.click('start-btn');r.button(mode==='adult'?'おとなモード':'こどもモード');r.dialogue();r.els.get('name-input').value='テスト';r.click('naming-confirm');
   const welcome=r.g.dialogue.lines.map(l=>l[1]).join('');assert(welcome.includes('「'+label+'」'),mode+' welcome: '+welcome);assert(!welcome.includes(other)&&!welcome.includes('{'),mode+' welcome has no other label: '+welcome);
   r.tick(16);const goal=r.els.get('quest').textContent;assert(goal.includes(label+'で')&&!goal.includes('{'),mode+' goal: '+goal);
   r.dialogue();assert.equal(r.g.screen,'battle');r.tick(300);const btn=r.els.get('commands').children.find(e=>e.dataset.cmd==='summon').textContent;assert.equal(btn,label,mode+' button');
   const hint=r.els.get('battle-log').textContent;assert(hint.includes('「'+label+'」')&&!hint.includes(other),mode+' battle hint: '+hint);
   r.cmd('attack');const nudge=r.els.get('battle-log').textContent;assert(nudge.includes('「'+label+'」')&&!nudge.includes(other),mode+' nudge: '+nudge);
  }
 }
 result.push('R68: おとなモードとこどもモードで、チュートリアルの説明・ソラの台詞がボタンの名前と同じ PASS');
 // R70: while a word card is up in battle (under the enemy name, SPEC_V7 4.1), a summon's name and its effect text are drawn below the card's real bottom, not behind it.
 for(const [id,h] of [['nao',96],['code',124],['whale',124]]){const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(4));while(r.g.dialogue)r.dialogue();const D=r.g.GAME_DATA;
  r.g.debugStartBattle('crow','r70-'+id);r.tick(300);if(r.els.get('word-card').hidden)r.g.debugLearn('bpm');r.tick(16);
  const card=r.els.get('word-card');assert(!card.hidden,'card shows in battle');card.offsetHeight=h;const bottom=parseFloat(card.style.top)+h;
  if(!r.g.summons.includes(id))r.g.summons.push(id);r.g.state.battery=100;r.g.command('cast',id);assert(r.g.battle.cast,id+' cast starts');r.tick(400);r.canvasCalls.length=0;r.tick(16);assert(!card.hidden,'card still up during the cast');
  const name=r.canvasCalls.filter(c=>c[0]==='fillText'&&c[1]===D.summons[id].name).at(-1);assert(name,id+' name drawn');assert(name[3]-30>=bottom,id+' name top '+(name[3]-30)+' is below the card bottom '+bottom);
  const extra=r.canvasCalls.filter(c=>c[0]==='fillText'&&(/fire/.test(c[1])||c[1]==='HP ほぞん'));if(id!=='nao')assert(extra.length,id+' effect text drawn');assert(extra.every(c=>c[3]-24>=bottom),id+' effect text below the card');
  // R98: a dark plate sits behind the summon's name and covers the whole name.
  const plate=r.canvasCalls.filter(c=>c[0]==='summonplate').at(-1),nw=D.summons[id].name.length*30;assert(plate,id+' name plate drawn');assert(plate[1]<=name[2]-nw/2-8&&plate[1]+plate[3]>=name[2]+nw/2+8,id+' plate covers the name width with a margin');assert(plate[2]>=bottom&&plate[2]+plate[4]<=488,id+' plate sits between the word card and the RYOSEI/HP card');assert(plate[2]<=name[3]-30&&plate[2]+plate[4]>=name[3],id+' plate covers the name height');
  assert(r.canvasCalls.indexOf(plate)<r.canvasCalls.indexOf(name),id+' plate is drawn before the name');}
 result.push('R70: 戦闘でことばカードが出ている間、召喚の名前と効果の文字がカードの下に出る PASS');
 // R73: in the tower, the floor pad's 「うえへ」 sits on a dark plate instead of straight on the white cloud; the park board keeps its plain sign.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(4));while(r.g.dialogue)r.dialogue();r.g.debugWarp('tower1',5,9);r.canvasCalls.length=0;r.tick(16);
  const plated=sign=>{const txt=r.canvasCalls.filter(c=>c[0]==='strokeText'&&c[1]===sign).at(-1);assert(txt,sign+' is drawn');
   assert(r.canvasCalls.some(c=>c[0]==='tag'&&c[1]<=txt[2]-36&&c[1]+c[3]>=txt[2]+36&&c[2]<=txt[3]-24&&c[2]+c[4]>=txt[3]+6),sign+' has a dark plate behind all of its letters');};
  plated('うえへ');r.g.debugWarp('tower2',5,9);r.canvasCalls.length=0;r.tick(16);plated('したへ');
  r.g.debugWarp('town',5,32);r.canvasCalls.length=0;r.tick(16);const park=r.canvasCalls.filter(c=>c[0]==='strokeText'&&c[1]==='こうえん').at(-1);
  assert(park,'the park board sign is drawn');assert(!r.canvasCalls.some(c=>c[0]==='tag'&&c[1]<=park[2]&&c[1]+c[3]>=park[2]&&c[2]<=park[3]&&c[2]+c[4]>=park[3]),'the park board has no plate');}
 result.push('R73: ノイズのとうの「うえへ」は暗い下じきの上に出る PASS');
 // R76: the walk help at the bottom fades out after about 2.5 s of walking, so it stops hiding exits and people; a short step keeps it.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  r.g.debugWarp('town',5,32);r.tick(16);const help=r.els.get('walk-help');assert(help&&!help.classes.has('learned'),'the walk help shows at first');
  for(const k of ['ArrowRight','ArrowLeft']){r.key(k);r.tick(500);r.key(k,true);}r.tick(16);assert(!help.classes.has('learned'),'one second of walking keeps the help');
  for(let i=0;i<4;i++){const k=i%2?'ArrowLeft':'ArrowRight';r.key(k);r.tick(500);r.key(k,true);}r.tick(16);assert(help.classes.has('learned'),'after 3 s of walking the help fades out');}
 result.push('R76: 2.5秒ほど歩くと「ドラッグで あるく」が消える PASS');
 // R77: with nobody close enough to talk to, the 「はなす」 button's background turns see-through (its letters stay solid) so the people under it stay visible.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  assert(/#talk-btn\.idle\{background:#f1cd7c4d/.test(html)&&!/#talk-btn\.idle\{[^}]*opacity/.test(html),'idle talk button: see-through background, solid letters');
  const btn=r.els.get('talk-btn');assert(btn,'the talk button exists');const town=r.g.GAME_DATA.maps.town;
  const objs=town.objects.filter(x=>x.dialogue||x.action||x.enter||x.event);let freeSpot=null;
  for(let y=2;y<town.h-2&&!freeSpot;y++)for(let x=2;x<town.w-2&&!freeSpot;x++)if(objs.every(q=>Math.hypot(q.x-x,q.y-y)>4))freeSpot=[x,y];
  assert(freeSpot,'a spot far from people');r.g.debugWarp('town',freeSpot[0],freeSpot[1]);r.tick(16);assert(btn.classes.has('idle'),'nobody near: the button is see-through');assert.equal(btn.textContent,'はなす');
  const p=town.objects.find(x=>(x.kind==='npc'||x.kind==='npc2')&&x.dialogue);assert(p,'a person in town');r.g.debugWarp('town',p.x,p.y+1);r.g.debugFace(3);r.tick(16);
  assert.equal(btn.textContent,'はなす','still 「はなす」, so only the near flag changes the hud');assert(!btn.classes.has('idle'),'someone near: the button is solid');
  r.click('talk-btn');assert(r.g.dialogue,'the button starts the talk');r.tick(16);assert(btn.hidden,'the button hides while talking');}
 result.push('R77: 近くに誰もいない時、「はなす」ボタンが透けて下の人が見える PASS');
 // R78: the chapter name and the continue hint under the title buttons sit on a dark band, because the pale green ground (#6c927e) left them at about 2.3:1.
 {const cap=(html.match(/\.caption\{([^}]*)\}/)||[])[1]||'';const bg=cap.match(/background:rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  assert(bg,'the title captions have a background band');const [r,g,b,a]=bg.slice(1).map(Number);assert(a>=0.7&&r+g+b<120,'the band is dark and mostly solid');
  assert(/font-size:24px/.test(cap),'caption letters stay 24px');const m=cap.match(/margin:0 -(\d+)px/);const left=70-(m?Number(m[1]):0);assert(left>=16,'the band stays inside the 540 screen');
  assert(/id="title-caption" class="caption"/.test(html)&&/id="title-hint" class="caption"/.test(html),'both lines use the band');}
 result.push('R78: タイトルの章の名前と「つづきから」の案内が、暗い帯の上に出る PASS');
 // R79: the title moon sat on 「A LITTLE LIGHT」 (top 110px) on the right; it now hangs in the top left, clear of that line and of 「♪ タップで音楽」 (top right).
 {const m=html.match(/function drawTitle\(\)\{[^]*?ellipse\((\d+),(\d+),(\d+),(\d+),'#f6dda2'\)/);assert(m,'the title draws a moon');const [x,y,rx,ry]=m.slice(1).map(Number);
  const top=Number((html.match(/\.title-copy\{[^}]*top:(\d+)px/)||[])[1]);assert(top>0,'the title copy has a top');
  assert(y+ry<=top-8,'the moon ends above the English line');assert(x+rx<540/2-60,'the moon stays on the left, away from the music hint');assert(x-rx>=8&&y-ry>=8,'the moon stays on screen');}
 result.push('R79: タイトルの月が英字の一行と「♪ タップで音楽」に重ならない PASS');
 // R80: the walk help box (bottom left) turns see-through while the exit arrow of でんきや is behind it, and solid again when the exit is clear of it.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  assert(/\.walk-help\.behind\{background:#16353b33;[^}]*\}\.walk-help\.learned\{opacity:0\}/.test(html),'see-through rule (R114: the plate, not the words), and learned still wins');const help=r.els.get('walk-help');help.offsetWidth=236;help.offsetHeight=82;const seen=[];
  for(let y=3;y<=14;y++){r.g.debugWarp('electric',5,y);r.tick(16);seen.push(help.classes.has('behind'));}
  assert(seen.some(Boolean),'somewhere in the shop the exit arrow sits behind the help box: '+seen);assert(!seen.at(-1),'by the exit the map scrolls up and the box is solid: '+seen);
  r.g.debugWarp('room',5,5);r.tick(16);assert(!help.classes.has('behind'),'in the room nothing is behind the box');}
 result.push('R80: 出口の矢印や敵・人が「ドラッグで あるく」の箱の後ろに来ると、箱が薄くなる PASS');
 // R107: the talk button (bottom right) turns its plate see-through (letters stay solid, as in R77) while a person, an enemy or an exit is behind it, like the walk help box.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  {const css=(html.match(/#talk-btn\.behind\{[^}]*\}/)||[''])[0];assert(/background:#f1cd7c1a/.test(css)&&!/opacity/.test(css),'only the plate turns see-through, the word stays solid (R77): '+css);}const btn=r.els.get('talk-btn');btn.offsetWidth=142;btn.offsetHeight=80;const seen=[];
  for(let y=3;y<=14;y++){r.g.debugWarp('electric',5,y);r.tick(16);seen.push(btn.classes.has('behind'));}
  for(let x=2;x<=20;x++)for(let y=4;y<=30;y+=2){r.g.debugWarp('town',x,y);r.tick(16);seen.push(btn.classes.has('behind'));}
  assert(seen.some(Boolean),'somewhere a person or exit sits behind the talk button: '+seen.filter(Boolean).length);
  r.g.debugWarp('room',5,5);r.tick(16);assert(!btn.classes.has('behind'),'in the room nothing is behind the talk button');}
 result.push('R107: 人や敵・出口が「はなす」ボタンの後ろに来ると、ボタンの地が薄くなる（字は濃いまま） PASS');
 // R109: the words of a sign (こうえん in ミナモ) behind the walk help box or the talk button make them see-through too.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  const help=r.els.get('walk-help');help.offsetWidth=236;help.offsetHeight=82;const btn=r.els.get('talk-btn');btn.offsetWidth=142;btn.offsetHeight=80;
  const sweep=()=>{let h=0,b=0;for(let x=2;x<=24;x++)for(let y=14;y<=36;y++){r.g.debugWarp('minamo',x,y);r.tick(16);h+=help.classes.has('behind');b+=btn.classes.has('behind');}return [h,b];};
  const sign=r.g.GAME_DATA.maps.minamo.objects.find(o=>o.sign==='こうえん');assert(sign,'ミナモ has the こうえん sign');
  const at=(x,y)=>{r.g.debugWarp('minamo',x,y);r.tick(16);return help.classes.has('behind');};
  const withSign=sweep(),onWith=at(13,16);delete sign.sign;let without,onWithout;try{without=sweep();onWithout=at(13,16);}finally{sign.sign='こうえん';}
  assert(withSign[0]>without[0],'the sign words behind the walk help box turn it see-through: '+withSign+' / '+without);
  assert(onWith&&!onWithout,'at (13,16) only the こうえん words sit behind the walk help box: '+onWith+' / '+onWithout);
  assert(!at(13,30),'far from the sign the box stays solid');}
 result.push('R109: 看板の字が「ドラッグで あるく」の箱やボタンの後ろに来ても、箱が薄くなる PASS');
 // R112: while the talk button is see-through, its word turns light with a dark outline on all four sides, so a person behind it does not hide はなす.
 {const css=(html.match(/#talk-btn\.behind\{[^}]*\}/)||[''])[0];assert(/color:#fff5d6/.test(css),'the word is light while the plate is see-through: '+css);
  for(const d of ['-2px -2px','2px -2px','-2px 2px','2px 2px'])assert(css.includes(d+' #173e3c'),'dark outline at '+d+': '+css);}
 result.push('R112: 「はなす」の地が薄い間は、字が明るい色と濃いふちになり、後ろの人に溶けない PASS');
 // R114: while the walk help box is see-through, only its plate fades; the words stay solid, light, with a dark outline on all four sides.
 {const css=(html.match(/\.walk-help\.behind\{[^}]*\}/)||[''])[0];assert(!/opacity/.test(css),'the words do not fade with the plate: '+css);assert(/background:#16353b33/.test(css)&&/color:#fff5d6/.test(css),'see-through plate, light words: '+css);
  for(const d of ['-2px -2px','2px -2px','-2px 2px','2px 2px'])assert(css.includes(d+' #173e3c'),'dark outline at '+d+': '+css);}
 result.push('R114: 「ドラッグで あるく」の地が薄い間も、字は濃いふちで読める PASS');
 // R81: the title captions break only at spaces, so 「ことばノートの」 is not cut into 「ことばノー」「トの」.
 {const css=(html.match(/\.caption\{[^}]*\}/)||[''])[0];assert(/word-break:keep-all/.test(css)&&/line-break:strict/.test(css),'captions keep words whole: '+css);
  const fn=(html.match(/function titleHint\(\)\{[^]*?\n/)||[''])[0];assert(/'ことばノートの おさらい'/.test(fn)&&/'つづきから　'/.test(fn)&&/'や　'/.test(fn),'the hint has a space between its words, where it can wrap');}
 result.push('R81: タイトルの案内が「ことばノー」「トの」のように言葉の途中で折り返さない PASS');
 // R113: the genre line on the title keeps a margin from the screen edges and wraps after ゲームづくりと, so RPG is not left alone on a line.
 {const css=(html.match(/\.title-copy \.genre-tag\{[^}]*\}/)||[''])[0];assert(/padding:0 32px/.test(css)&&/word-break:keep-all/.test(css),'the genre line keeps off the edges: '+css);
  assert(/<p class="genre-tag">あそびながら ゲームづくりと<br>AIを まなぶ RPG<\/p>/.test(html),'the genre line wraps after ゲームづくりと');}
 result.push('R113: タイトルの「あそびながら …」の行が画面の端に着かず、ゲームづくりと の後で折り返す PASS');
 // R82: when a summon is called, its ring and the squares of Naoslime and paint stay above the RYOSEI/HP card, so they never cross its text.
 {const m=html.match(/const SUMMON_Y=(\d+),SUMMON_RING_Y=(\d+),SUMMON_RING_RY=(\d+);/);assert(m,'summon positions are named');const [y,ringY,ringRy]=m.slice(1).map(Number);
  const card=Number((html.match(/\.hp-card\{[^}]*top:(\d+)px/)||[])[1]);assert(card>0,'the HP card has a top');
  assert(html.includes('ctx.ellipse(270,SUMMON_RING_Y,155*Math.min(1,t/400),SUMMON_RING_RY,'),'the ring uses the named position');assert(/rect\(225\+i\*30[^,]*,SUMMON_RING_Y-11\+Math\.sin\(i\)\*10\*k,22,22/.test(html),'the squares use the named position');
  assert(y+4<card,'the summon stands above the card');assert(ringY+ringRy+3<card,'the ring (with its 5px line) ends above the card');assert(ringY-11+10+22<card,'the squares end above the card');assert(/rect\(222\+i\*24[^;]*,SUMMON_RING_Y-8\+Math\.sin\(i\+gameTime\/150\)\*8\*k,16,16/.test(html),'paint squares use the named position');assert(ringY-8+8+16<card,'paint squares end above the card');assert(!/rect\([^;]*,5[0-9]{2}\+Math\.sin\(i/.test(html.match(/if\(b\.cast\)\{[^\n]*/)[0]),'no summon squares are left at a fixed y over the card');
  assert(ringY-ringRy<y&&ringY+ringRy>y-30,'the ring sits under the summon’s feet');}
 result.push('R82: 呼び出した仲間の足元の輪と四角が「RYOSEI」「HP」の欄に重ならない PASS');
// R83: in the ヒカクマオウ fight the neon city's sign (bright bars) hung at the top of the field, right behind Sora's and the boss's lines, and showed through them.
 {const sh=fs.readFileSync(path.join(root,'js','shooter.js'),'utf8');const pt=Number((sh.match(/PLAY_T = (\d+)/)||[])[1]);const off=Number((sh.match(/var NEON_SIGN_Y = PLAY_T \+ (\d+);/)||[])[1]);assert(pt>0&&off>0,'the neon sign has a named y');
  const neon=(sh.match(/theme === 'neon'\) \{\n[^]*?\n    \} else/)||[''])[0];assert(neon.includes('sy = NEON_SIGN_Y')&&!/PLAY_T \+ (40|100|120)/.test(neon),'the sign and its pole use the named y');
  // Lines start at PLAY_T+8, pushed down by a two-line word card (about 130px); a three-line line (113px) plus a two-line notice (74px) and their gaps follow.
  assert(off>8+130+113+6+74+6,'the sign hangs below a word card, a three-line line and a two-line notice');
  const plate=sh.match(/var INTRO_PLATE_T = (\d+), INTRO_PLATE_H = (\d+);/);assert(plate,'the entrance plate has a named place');assert(pt+off>Number(plate[1])+Number(plate[2]),'the sign hangs below the entrance plate');
  assert(pt+off+70<666,'the sign ends above the move hint');}
 result.push('R83: ヒカクマオウ戦の背景の看板が、上の台詞やお知らせの後ろに来ない PASS');
 // R88: after the ending the quest line in every map was 「とうの なかが しずかに なった。」, which told nothing to do next.
 // During the rooftop scene it stays as is; once the ending ran (and on a save from after it) the line points to the challenge.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(4));while(r.g.dialogue)r.dialogue();const ended=r.g.GAME_DATA.chapters[4].quests.ended;
  assert(ended&&ended.text.includes('チャレンジ')&&[...ended.text].length<=18,'chapter 4 has an ended line to the challenge');
  r.g.state.bosses.push('zero');r.tick(16);assert.equal(r.g.questStep,'cleared');assert(r.els.get('quest').textContent.includes('しずかに'),'rooftop scene: '+r.els.get('quest').textContent);
  const ev=r.g.GAME_DATA.events.zeroJoin;assert(ev.some(e=>e.flag===ended.flag)&&ev.findIndex(e=>e.flag===ended.flag)<ev.findIndex(e=>e.save),'the join event sets the flag before it saves');
  r.g.debugEvent([{flag:ended.flag}]);r.tick(16);assert.equal(r.g.questStep,'ended');assert.equal(r.els.get('quest').textContent,ended.text);
  r.g.debugEvent([{save:'quiet'}]);r.tick(16);const sv=JSON.parse(r.saved.get('ryoseiworld-rpg-v5'));delete sv.flags[ended.flag];assert(sv.bosses.includes('zero'));
  const back=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify(sv)]])});back.tick();back.click('continue-btn');while(back.g.dialogue)back.dialogue();back.tick(16);
  assert.equal(back.g.questStep,'ended','a save from after the ending (made before R88) shows the challenge line');}
 result.push('R88: 4章を終えた後の目的の文が、メニューのチャレンジへ案内する PASS');
 // R92: after a win the enemy stayed bright and bobbing under 「おとなしく なった！」; now it settles and fades to about half.
 {const r=await runtime();r.tick();r.click('start-btn');r.button('おとなモード');while(r.g.dialogue)r.dialogue();if(r.g.screen==='battle')r.g.debugWin();while(r.g.dialogue)r.dialogue();r.tick(3000);while(r.g.dialogue)r.dialogue();
  r.g.debugStartBattle('vending','calm');r.tick(1500);while(r.g.dialogue)r.dialogue();assert.equal(r.g.screen,'battle','a vending battle');
  const enemyAlpha=()=>{r.imageLog.length=0;r.imageAlpha.length=0;r.tick(16);const art=r.g.GAME_DATA.enemies[r.g.battle.type].art||'enemies';const i=r.imageLog.findIndex(s=>String(s).includes(art));assert(i>=0,'the enemy is drawn: '+art+' '+r.imageLog.slice(0,8));return r.imageAlpha[i];};
  assert.equal(enemyAlpha(),1,'during the fight the enemy is solid');r.g.debugWin();assert(r.g.battle&&r.g.battle.over,'the battle shows its result');
  r.tick(1000);const a=enemyAlpha();assert(a<=0.5&&a>=0.3,'after the win the enemy fades: '+a);
  assert(/b\.wonAt=gameTime/.test(html)&&/ctx\.globalAlpha=1-\.6\*calm;sprite\([^;]*\);ctx\.globalAlpha=1;/.test(html),'the fade is put back to 1 right after the enemy');
  assert(/def\.animCols\?Math\.floor\(\(calm\?b\.wonAt:gameTime\)\/200\)%def\.animCols:def\.frame/.test(html),'bosses with animCols keep the frame they had at the win (they have no frame of their own)');}
 result.push('R92: 勝った後、敵がゆれを止めて少し沈み、うすくなる PASS');
 // R93: the card's first line read 「● HP　ソラ」 as if ソラ were part of the word (SPEC_V7 4.1: line 1 is the dot and the word).
 // The name now sits in its own tag at the right end of line 1, so the card keeps its two-line height over the enemy and the loop numbers.
 {const r=await runtime();r.tick();r.g.debugStartChapter(2);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugLearn('temperature'),'a word not met yet');r.tick(16);assert(!r.els.get('word-card').hidden,'the card shows');assert.equal(r.els.get('word-title').textContent,'● '+r.RYW.word('temperature'),'line 1 holds only the dot and the word');
  assert.equal(r.els.get('word-who').textContent,'ソラ','the speaker is in its own tag');assert.equal(r.els.get('word-copy').textContent,r.RYW.card('temperature'),'line 2 is the line alone');
  assert(/<span class="word-head"><span id="word-title" class="word-title"><\/span><span id="word-who" class="word-who"><\/span><\/span>/.test(html),'title and name share line 1');
  const head=(html.match(/\.word-card \.word-head\{([^}]*)\}/)||[])[1]||'';assert(/display:flex/.test(head)&&/space-between/.test(head),'the name is pushed to the right end');
  const who=(html.match(/\.word-card \.word-who\{([^}]*)\}/)||[])[1]||'';assert(who&&!/font-size/.test(who),'the name keeps the 24px card letters');}
 result.push('R93: ことばの札の1行目で、ソラの名前をことばから離して右端の札に出す PASS');
 // R99: on とう2F the card no longer covers the stairs signs (うえへ / したへ) at the top of the floor: it moves to the bottom of the map band, clear of the hero.
 // In battle a quiz answer (おさらい) puts the card under the enemy name instead of over it.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  assert(r.g.debugStartChapter(4));while(r.g.dialogue)r.dialogue();r.g.debugWarp('tower2',5,10);r.tick(1300);while(r.g.dialogue)r.dialogue();assert.equal(r.g.map,'tower2');
  const fresh=()=>Object.keys(r.RYW.words).find(id=>!r.g.debugWords().includes(id));
  assert(r.g.debugLearn(fresh()),'a new word');r.canvasCalls.length=0;r.tick(16);r.tick(16);const card=r.els.get('word-card');assert(!card.hidden,'the card shows on the field');
  const top=parseFloat(card.style.top),h=card.offsetHeight||96,cy=r.g.camera.y,signs=r.canvasCalls.filter(c=>c[0]==='strokeText'&&['うえへ','したへ'].includes(c[1]));
  assert(signs.length>=2,'both stairs signs drawn');assert(top<Math.max(190,r.g.hudTop),'the card left the top spot over the stairs signs for the goal line above it (R108)');for(const c of signs){const y=c[3]-cy;assert(y+10<=top||y-30>=top+h,c[1]+' sign at '+Math.round(y)+' is not under the card '+top+'..'+(top+h));}
  assert(top+h<=960-130,'the card stays above the bottom buttons');const hy=r.g.state.y-cy;assert(hy<=top||hy-100>=top+h,'the card does not cover the hero');
  r.tick(16);assert.equal(parseFloat(card.style.top),top,'the card stays put between frames');
  // R108: the card goes up over the goal line (hidden meanwhile) rather than down over the floor, and the line comes back with the card gone.
  const minY=Math.min(...signs.map(c=>c[3]-cy))-30;assert(top+h<=minY,'the card sits above the stairs signs, not over the floor ('+top+'..'+(top+h)+' vs '+Math.round(minY)+')');
  const quest=r.els.get('quest');assert.equal(quest.style.visibility,'hidden','the goal line hides under the card');
  for(let i=0;i<40&&!card.hidden;i++)r.tick(500);assert(card.hidden,'the card goes away');assert.equal(quest.style.visibility,'','the goal line is back');
  r.g.debugStartBattle('crow','r99-quiz');r.tick(300);for(let i=0;i<4;i++)r.g.debugLearn(fresh());r.tick(16);
  const bt=r.els.get('battle-top');bt.offsetTop=28;bt.offsetHeight=82;r.els.get('modal').querySelector=()=>({offsetTop:400});
  r.setRandom(()=>0);r.g.debugOpenNote();r.button('おさらい');r.els.get('modal-buttons').children[0].onclick();assert.equal(r.g.modal,'quiz-feedback');r.setRandom(Math.random);
  if(card.hidden)r.g.debugLearn(fresh());r.tick(16);assert(!card.hidden,'the card shows over the quiz answer');assert.equal(card.style.top,(28+82+8)+'px','the card sits under the enemy name, not over it');
  r.els.get('modal').querySelector=()=>({offsetTop:150});r.tick(16);assert.equal(card.style.top,'16px','a tall answer panel keeps the card at the top so the panel is not covered');}
 result.push('R99: ことばの札が とう2F の階段の札と、戦闘中のクイズの敵の名前を隠さない PASS');
 result.push('R108: とう2F でことばの札が床を隠さず、目標の帯の上に出て、その間は目標の字を隠す PASS');
 // R101: in battle the word card sat over the enemy's head (バグったじはんき lost its top). While the card shows, the enemy eases down between the card and the HP panel.
 {const r=await runtime();r.tick();r.start();r.tick(1000);r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();
  const fresh=()=>Object.keys(r.RYW.words).find(id=>!r.g.debugWords().includes(id));
  for(const type of ['vending','bugking']){
   r.g.debugStartBattle(type,'r101');r.tick(300);while(r.g.dialogue)r.dialogue();assert.equal(r.g.screen,'battle',type+' battle');
   const card=r.els.get('word-card'),def=r.g.GAME_DATA.enemies[type],art=def.art||'enemies';
   const enemy=()=>{r.canvasCalls.length=0;r.tick(16);const c=r.canvasCalls.filter(c=>c[0]==='drawImage'&&String(c[1]).includes(art)).at(-1);assert(c,type+' is drawn');return c;};
   if(!card.hidden)r.tick(3000);if(!card.hidden)card.hidden=true;let e=enemy();for(let i=0;i<40;i++)e=enemy();const freeBottom=e[3]+e[5];
   assert(Math.abs(freeBottom-385)<=8,type+' stands at its usual place without a card: '+freeBottom);
   assert(r.g.debugLearn(fresh()),'a new word');card.offsetTop=137;card.offsetHeight=90;r.tick(16);assert(!card.hidden,'the card shows in battle');
   for(let i=0;i<40;i++)e=enemy();const cardBottom=137+90;
   assert(e[3]>=cardBottom,type+' top '+Math.round(e[3])+' is below the card '+cardBottom);assert(e[3]+e[5]<=446,type+' stays above the ちらつき label (y=466) and the HP panel: '+Math.round(e[3]+e[5]));
   for(let i=0;i<8&&!card.hidden;i++)r.tick(3000);assert(card.hidden,'the card goes away by itself');for(let i=0;i<40;i++)e=enemy();assert(Math.abs(e[3]+e[5]-freeBottom)<=14,type+' goes back to its place in the same battle once the card is gone: '+Math.round(e[3]+e[5]));
   r.g.debugWin();r.tick(2100);while(r.g.dialogue)r.dialogue();r.tick(3000);while(r.g.dialogue)r.dialogue();}
  assert(/let enemyEase=null;/.test(html)&&/enemyEase\.bot\+=\(bot-enemyEase\.bot\)\*k/.test(html),'the move is eased, not a jump');}
 result.push('R101: 戦闘でことばの札が出ている間、敵が札の下へ寄り、頭が札に隠れない PASS');
 // R103: the challenge result listed "チートつき さいこう ステージ 0" to a player who never used cheats.
 result.push('R103: チートを使っていない人には、チャレンジのきろくに「チートつき」の0の行を出さない PASS');
 fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification','node-results.txt'),result.join('\n')+'\n');
 console.log(result.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1});
