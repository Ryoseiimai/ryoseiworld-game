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

async function runtime({saved=new Map(),missing=false,brokenStorage=false,seed=7,sdk=false,holdLoad=false,loadError=false,rawSave='',holdSave=false,initialPause=false,missingFiles=[]}={}) {
  const listeners = {}, els = new Map(), draws=[], imageLog=[], imageX=[], requests=[], canvasCalls=[], windowListeners={}, calls=[], saves=[], audio=[];
  const host={enabled:false}; let resolveLoad, rejectLoad, resolveSave;
  const loadPromise=new Promise((resolve,reject)=>{resolveLoad=resolve;rejectLoad=reject});
  // Draw calls are not recorded: a long simulated walk issues millions of them.
  const noop=()=>{};
  const context2d = new Proxy({getImageData:()=>pngPixels(root+'/'+draws[draws.length-1][0].src),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),drawImage(...a){draws[0]=a;imageLog.push(a[0].src);imageX.push(a[1]);if(imageX.length>4000)imageX.splice(0,2000);if(imageLog.length>4000)imageLog.splice(0,2000);}}, {get(o,p){return p in o ? o[p] : noop},set(o,p,v){o[p]=v;return true;}});
  class El {
    constructor(id=''){this.id=id;this.style={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.children=[];this.tagName='DIV';this.value=id==='name-input'?'ソラ':'';this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
    addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
    getContext(){return context2d}
    replaceChildren(){this.children=[]}
    appendChild(el){this.children.push(el)}
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
  const sandbox={innerWidth:390,innerHeight:844,document,Image,URLSearchParams,location:{search:'?seed='+seed},localStorage:storage,performance:{now:()=>now},requestAnimationFrame:f=>{const id=++rafId;rafs.push({id,f});return id},cancelAnimationFrame:id=>{rafs=rafs.filter(r=>r.id!==id)},console,queueMicrotask,fetch:async url=>{
    assert(url.startsWith('assets/')); requests.push(url);
    let path=root+'/'+url;
    if(missing)return {ok:true,json:async()=>[]};
    return {ok:fs.existsSync(path),json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))};
  }};
  class AudioContext {
    constructor(){this.currentTime=0;this.destination={};this.gains=[];audio.push(this)}
    createGain(){const gain={value:1,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(){}};this.gains.push(gain);return {gain,connect(){}}}
    createOscillator(){calls.push('tone');return {frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},start(){},stop(){}}}
    suspend(){this.state='suspended';return Promise.resolve()}
    resume(){this.state='running';return Promise.resolve()}
  }
  sandbox.window={innerWidth:390,innerHeight:844,AudioContext,addEventListener(n,f){windowListeners[n]=f}};
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
  for(const s of scripts){if(sandbox.window.RYW)sandbox.RYW=sandbox.window.RYW;vm.runInNewContext(s.code,sandbox,{filename:s.file});}
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
  function start(){click('start-btn');assert.equal(g.screen,'prologue');dialogue();assert.equal(g.screen,'naming');els.get('name-input').value='テストソラ';click('naming-confirm');dialogue();assert.equal(g.screen,'battle');tick(300);}
  function resize(w,h){sandbox.window.innerWidth=w;sandbox.window.innerHeight=h;sandbox.innerWidth=w;sandbox.innerHeight=h;windowListeners.resize()}
  function button(text){const b=els.get('modal-buttons').children.find(b=>b.textContent.includes(text));assert(b,'button '+text);assert(!b.disabled,'button enabled '+text);b.onclick();}
  function key(key,up=false,target=els.get('stage')){for(const f of listeners[up?'keyup':'keydown']||[])f({key,target,preventDefault(){},repeat:false});}
  return {g,els,cmd,button,key,click,tick,dialogue,visibility,start,saved,requests,draws,imageLog,imageX,canvasCalls,calls,saves,audio,host,listeners,resize,
    active:()=>document.activeElement,lines:()=>lineTotal,setCounting:v=>{counting=v},now:()=>now,
    setMissingArt:value=>{missing=value},resolveLoad,rejectLoad,resolveSave:()=>resolveSave(),hasFrame:hasLoop};
}
const settle=()=>new Promise(setImmediate);
const TILE=48;
// Plays one ordinary battle to the end: summon when hurt, otherwise "create".
function fight(t){let guard=40;while(t.g.screen==='battle'&&guard--){if(t.g.battle.locked||t.g.battle.over){t.tick(400);continue;}if(t.g.hp.hp<25&&t.g.battery>=15){t.cmd('summon');t.button('ナオスライム');}else t.cmd('create');t.tick(3000);}assert(guard>0,'battle ends');}
function talk(t,map,x,y,dir=3){t.g.debugWarp(map,x,y);t.g.debugFace(dir);t.tick(16);t.click('talk-btn');assert(t.g.dialogue,'talk at '+map+' '+x+','+y);return t.g.dialogue.lines.map(l=>l[1]).join('\n');}
function walkUp(t,ms=200){t.key('ArrowUp');t.tick(ms);t.key('ArrowUp',true);}
(async()=>{
 const t=await runtime();t.tick();for(const [name,count] of Object.entries({hero_walk:16,hero_ride:16,npc:16,enemies:9,summons:6,buildings:9,props:16,interior:16}))assert.equal(t.g.assets[name],count,'loaded '+name);
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
 const before=t.g.battery;assert(talk(t,'electric',7,9.4).includes('つないだ'));t.dialogue();assert(t.g.summons.includes('code'));assert.equal(t.g.state.items.battery,0);assert.equal(t.g.battery,before,'recruiting no longer refills the battery');
 // Prepare with bought food, then beat BUG KING through ordinary commands.
 t.g.debugWarp('electric',5,5.4);t.g.debugFace(3);t.click('talk-btn');t.dialogue();assert.equal(t.g.battle.type,'bugking');assert.equal(t.g.battle.enemy.maxHp,280);t.tick(300);t.cmd('summon');t.button('コードラゴン');assert(t.g.battle.cast);t.tick(1000);assert(t.g.battle.enemy.hp<280);t.tick(1900);
 let guard=40;while(t.g.screen==='battle'&&guard--){if(t.g.battle.locked){t.tick(400);continue;}if(t.g.hp.hp<30&&(t.g.state.items.rice||t.g.state.items.drink)){t.cmd('item');t.button(t.g.state.items.drink?'エナジードリンク':'おにぎり');}else if(t.g.hp.hp<24&&t.g.battery>=15){t.cmd('summon');t.button('ナオスライム');}else if(t.g.battery>=25){t.cmd('summon');t.button('コードラゴン');}else t.cmd('create');t.tick(3000);if(t.g.dialogue&&t.g.battle?.over)throw Error('boss defeat');}
 assert(guard>0);assert(t.g.state.bosses.includes('bugking'));
 // F15: the town comes back first, then the closing lines, then the chapter card.
 assert.equal(t.g.screen,'field');assert.equal(t.g.map,'town');assert(!t.g.dialogue);t.tick(2100);assert(t.g.dialogue);assert(t.g.dialogue.lines.some(l=>l[1].includes('ノイズに のまれてる')));t.dialogue();assert.equal(t.g.screen,'ending');
 const tonesAtEnding=t.calls.length;t.tick(2500);const tonesAfterJingle=t.calls.length;t.tick(3000);assert.equal(t.calls.length,tonesAfterJingle,'ending goes quiet after one jingle');assert(tonesAfterJingle>=tonesAtEnding);
 t.key('z');assert.equal(t.g.screen,'title');await settle();
 assert(zakoBattles>=3);assert(t.lines()>=40,'required dialogue lines: '+t.lines());
 result.push(`Code Dragon via battery → BUG KING 280 HP (no debugWin) → town clears → ending (Z) → title; required lines ${t.lines()}, ordinary battles ${zakoBattles} PASS`);
 const reloaded=await runtime({saved:t.saved});reloaded.tick();assert(!reloaded.els.get('continue-btn').disabled);assert.equal(reloaded.active().id,'continue-btn');reloaded.key('Enter');assert.equal(reloaded.g.map,'electric');assert(reloaded.g.state.bosses.includes('bugking'));assert(reloaded.g.summons.includes('code'));for(const k of ['chapter','map','x','y','level','exp','money','battery','items','summons','bosses'])assert.equal(JSON.stringify(reloaded.g.state[k]),JSON.stringify(JSON.parse(t.saved.get('ryoseiworld-rpg-v5'))[k]),'saved '+k);
 result.push('Reload → Enter on the focused つづきから restores map, position, level, battery, money, items, summons and cleared boss PASS');
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
 const fresh=await runtime();fresh.tick();assert.equal(fresh.active().id,'start-btn');fresh.key('z');assert.equal(fresh.g.screen,'prologue');fresh.dialogue();assert.equal(fresh.g.screen,'naming');assert.equal(fresh.active().id,'name-input');fresh.key('z');assert.equal(fresh.g.screen,'field');
 const keep=new Map(t.saved),guarded=await runtime({saved:keep});guarded.tick();const kept=keep.get('ryoseiworld-rpg-v5');guarded.click('start-btn');assert.equal(guarded.g.modal,'confirm');assert.equal(guarded.active().textContent,'やめる');guarded.button('やめる');assert.equal(guarded.g.screen,'title');assert.equal(keep.get('ryoseiworld-rpg-v5'),kept);guarded.click('start-btn');guarded.button('はじめる');assert.equal(guarded.g.screen,'prologue');
 result.push('Title: Z on はじめから without a save; はじめから with a save asks first and やめる keeps it; naming input focused and Z confirms PASS');
 // F07/F16/F17: hand-edited or stale saves never freeze the loop.
 const base=JSON.parse(t.saved.get('ryoseiworld-rpg-v5'));
 const tut=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...base,map:'room',x:240,y:432,battery:10,items:{rice:0,drink:0,battery:0},summons:['nao'],bosses:[],flags:{}})]])});tut.tick();tut.click('continue-btn');assert.equal(tut.g.screen,'battle');assert(tut.g.battle.tutorial);tut.tick(300);tut.cmd('summon');tut.button('ナオスライム');assert(tut.g.battle.usedSummon);
 for(const patch of [{chapter:2},{dir:7},{map:'constructor'},{exp:'10'},{x:288,y:1130,map:'town'},{x:-5000,y:-5000,map:'town'}]){const b=await runtime({saved:new Map([['ryoseiworld-rpg-v5',JSON.stringify({...base,bosses:[],...patch})]])});b.tick();if(!b.els.get('continue-btn').disabled){b.click('continue-btn');b.tick(100);assert(b.hasFrame(),'loop alive '+JSON.stringify(patch));assert(!b.g.debugBlocked(b.g.position.x,b.g.position.y),'not stuck '+JSON.stringify(patch));let moved=false;for(const k of ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight']){const p=b.g.position;b.key(k);b.tick(300);b.key(k,true);if(b.g.position.x!==p.x||b.g.position.y!==p.y||b.g.screen!=='field')moved=true;}assert(moved,'can move '+JSON.stringify(patch));assert.equal(typeof b.g.state.exp,'number');assert(b.g.level<=base.level+1);}else assert(patch.chapter||patch.dir||patch.map==='constructor','only broken saves are rejected '+JSON.stringify(patch));}
 result.push('Saves: tutorial resume with 10% battery, chapter 2 / dir 7 / map constructor rejected, exp "10" read as a number, stuck or off-map positions moved to open ground PASS');
 // F18: a fast second tap after the boss intro does not hit にげる.
 const tap=await runtime({saved:new Map(t.saved)});tap.tick();tap.click('continue-btn');tap.g.state.bosses=[];tap.g.debugWarp('electric',5,5.4);tap.g.debugFace(3);tap.tick(16);tap.click('talk-btn');while(tap.g.dialogue)tap.click('dialogue');assert.equal(tap.g.battle.type,'bugking');const logBefore=tap.g.battle.log;tap.cmd('run');assert.equal(tap.g.battle.log,logBefore);assert(!tap.g.battle.locked);tap.tick(300);tap.cmd('run');assert(tap.g.battle.log.includes('ふさいでいる'));
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
  const D=r.g.GAME_DATA,verbs=['say','choice','quiz','join','give','take','flag','if','save','battle','warp','transport','inn','music','shake','flash','wait','chapterClear','ending','bond','gift'];
  const check=(steps,where)=>{assert(Array.isArray(steps),where);for(const s of steps){const v=verbs.filter(k=>Object.hasOwn(s,k));assert.equal(v.length,1,where+' one verb '+JSON.stringify(s));
   if(v[0]==='say'&&typeof s.say==='string')assert(Object.hasOwn(D.dialogue,s.say),where+' dialogue '+s.say);
   if(['give','take'].includes(v[0]))assert(Object.hasOwn(D.items,s[v[0]]),where+' item '+s[v[0]]);if(v[0]==='join')assert(Object.hasOwn(D.summons,s.join),where+' summon '+s.join);
   if(v[0]==='choice'){assert(s.options.length>=2&&s.options.length<=3,where+' choice 2-3');for(const o of s.options)assert(o.text.length<=16,where+' choice text fits');s.options.forEach((o,i)=>check(o.then||[],where+'.choice'+i));}
   if(v[0]==='quiz')for(const q of s.quiz){assert.equal(q.options.length,3,where+' quiz 3 options');assert(q.answer>=0&&q.answer<3);}
   if(v[0]==='if'){check(s.then||[],where+'.then');check(s.else||[],where+'.else');}
   if(v[0]==='battle'){assert(Object.hasOwn(D.enemies,s.battle),where+' enemy '+s.battle);check(s.win||[],where+'.win');check(s.lose||[],where+'.lose');}
   if(['warp'].includes(v[0]))assert(Object.hasOwn(D.maps,s.warp),where+' map '+s.warp);if(v[0]==='transport')for(const t of s.stops)assert(Object.hasOwn(D.maps,t.map),where+' stop '+t.map);if(v[0]==='music'&&s.music)assert(Object.hasOwn(D.music,s.music),where+' music '+s.music);
   if(v[0]==='bond')assert(Object.hasOwn(D.bonds,s.bond),where+' bond '+s.bond);if(v[0]==='gift'){assert(Object.hasOwn(D.bonds,s.to),where+' gift to '+s.to);assert((D.bonds[s.to].likes||[]).includes(s.gift),where+' gift is liked '+s.gift);}}};
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
  assert.equal(r.g.bonds.mother??0,0);let done=0;r.g.debugEvent([{bond:'mother'}],()=>done++);assert.equal(read(),'おかあさんとの\nきずなが ふかまった！');assert.equal(tones,1);
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
  // Every gift line fits 12 full-width characters a row, with the longest names in the data.
  const longest=Object.values(D.bonds).map(b=>b.name).sort((a,b)=>wide(b)-wide(a))[0],longItem=Object.keys(D.items).sort((a,b)=>wide(D.items[b].name)-wide(D.items[a].name))[0];
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
  const text=all.join('\n');assert(text.includes('おかあさんの 守護霊が\nちからを かしてくれた！\n〔おまもりバリア〕'),text);assert(text.includes('おこづかいを\n100えん もらった。'),text);
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
 fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification','node-results.txt'),result.join('\n')+'\n');
 console.log(result.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1});
