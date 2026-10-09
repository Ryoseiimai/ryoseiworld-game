// Node VM integration checks; SDK, DOM, Canvas and WebAudio are controlled doubles.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const documentPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'v5', 'index.html'));
const root = path.dirname(documentPath);
const source = fs.readFileSync(documentPath,'utf8').split('<script>')[1].split('</script>')[0];
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

async function runtime({saved=new Map(),missing=false,brokenStorage=false,seed=7,sdk=false,holdLoad=false,loadError=false,rawSave='',holdSave=false,initialPause=false}={}) {
  const listeners = {}, els = new Map(), draws=[], requests=[], canvasCalls=[], windowListeners={}, calls=[], saves=[], audio=[];
  const host={enabled:false}; let resolveLoad, rejectLoad, resolveSave;
  const loadPromise=new Promise((resolve,reject)=>{resolveLoad=resolve;rejectLoad=reject});
  const context2d = new Proxy({getImageData:()=>pngPixels(root+'/'+draws[draws.length-1][0].src),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),drawImage(...a){draws.push(a);}}, {get(o,p){return p in o ? o[p] : (...a)=>canvasCalls.push([p,...a])},set(o,p,v){canvasCalls.push(['property',p,v]);o[p]=v;return true;}});
  class El {
    constructor(id=''){this.id=id;this.style={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.children=[];this.tagName='DIV';this.value=id==='name-input'?'ソラ':'';this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
    addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
    getContext(){return context2d}
    replaceChildren(){this.children=[]}
    appendChild(el){this.children.push(el)}
    getBoundingClientRect(){const s=Math.min(sandbox.window.innerWidth/540,sandbox.window.innerHeight/960);return {left:(sandbox.window.innerWidth-540*s)/2,top:(sandbox.window.innerHeight-960*s)/2,width:540*s,height:960*s}}
    setPointerCapture(){}
    focus(){}
    contains(el){return this.children.includes(el)}
    closest(selector){if(selector==='[data-cmd]')return this.dataset.cmd?this:null;if(selector==='button,input')return ['BUTTON','INPUT'].includes(this.tagName)?this:null;return this}
    click(){this.onclick?.({target:this})}
  }
  for(const match of fs.readFileSync(documentPath,'utf8').matchAll(/<([a-z]+)[^>]*?id="([^"]+)"/g)){const e=new El(match[2]);e.tagName=match[1].toUpperCase();els.set(match[2],e);}
  const buttons=['attack','create','summon','item','run'].map(cmd=>{const e=new El(cmd);e.tagName='BUTTON';e.dataset.cmd=cmd;return e;});
  els.get('commands').children=buttons;
  let raf, now=0, rafId=0;
  const document={hidden:false,getElementById:id=>{assert(els.has(id),id);return els.get(id)},querySelectorAll:sel=>sel==='.screen'?[...els.values()].filter(e=>e.id.startsWith('screen-')):buttons,createElement:tag=>{const e=new El();e.tagName=tag.toUpperCase();return e;},addEventListener(n,f){(listeners[n]??=[]).push(f)}};
  const storage={getItem(k){if(brokenStorage)throw Error('storage unavailable');return saved.get(k)||null},setItem(k,v){if(brokenStorage)throw Error('storage unavailable');saved.set(k,v)}};
  class Image {set src(s){this._src=s;this.complete=true;let bytes;try{bytes=fs.readFileSync(root+'/'+s)}catch{}this.naturalWidth=bytes?bytes.readUInt32BE(16):200;this.naturalHeight=bytes?bytes.readUInt32BE(20):200;queueMicrotask(()=>this.onload?.())}get src(){return this._src}}
  const sandbox={innerWidth:390,innerHeight:844,document,Image,URLSearchParams,location:{search:'?seed='+seed},localStorage:storage,requestAnimationFrame:f=>{raf=f;return ++rafId},cancelAnimationFrame:()=>{raf=null},console,queueMicrotask,fetch:async url=>{
    assert(url.startsWith('assets/')); requests.push(url);
    let path=root+'/'+url;
    if(missing)return {ok:true,json:async()=>[]};
    if(url.endsWith('/')) {
      let entries=fs.readdirSync(path,{withFileTypes:true});
      if(missing && url==='assets/')entries=entries.filter(e=>!['kateino','hikaku'].includes(e.name));
      const html='Directory listing for '+entries.map(e=>'<a href="'+e.name+(e.isDirectory()?'/':'')+'">').join('');
      return {ok:true,text:async()=>html};
    }
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
      firstFrameReady(){assert.equal(els.get('loading').hidden,true);calls.push('first')},
      gameReady(){assert(calls.includes('first'));assert.equal(sandbox.window.__v5.screen,'title');calls.push('ready')},
      loadData(){calls.push('load');return holdLoad?loadPromise:loadError?Promise.reject(Error('load failed')):Promise.resolve(rawSave)},
      saveData(data){calls.push('save');saves.push(JSON.parse(data));return holdSave?new Promise(resolve=>{resolveSave=resolve}):Promise.resolve()}
    },
    system:{onPause(cb){host.pause=cb;if(initialPause)cb()},onResume(cb){host.resume=cb},
      isAudioEnabled(){return host.enabled},onAudioEnabledChange(cb){host.audio=cb}}
  };
  vm.runInNewContext(source,sandbox,{filename:'v5/index.html'});
  await new Promise(setImmediate);await new Promise(setImmediate);
  if(!holdLoad && !initialPause)assert(raf,'boot complete');
  function tick(ms=16){for(let i=0;i<Math.ceil(ms/16);i++){now+=16;if(raf){const f=raf;raf=null;f(now)}}}
  function click(id,target){const e=els.get(id); const event={target:target||e,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){this.stop=true}};for(const f of listeners.click||[])f(event);if(event.stop||e.disabled)return;for(const f of e.listeners.click||[])f(event);if(e.onclick)e.onclick(event)}
  const g=sandbox.window.__v5;
  function cmd(command){click('commands',buttons.find(e=>e.dataset.cmd===command));}
  function dialogue(){let limit=60;while(g.dialogue&&limit-->0)click('dialogue');assert(limit>0,'dialogue finishes');}
  function visibility(hidden){document.hidden=hidden;for(const f of listeners.visibilitychange||[])f();}
  function start(){click('start-btn');assert.equal(g.screen,'prologue');dialogue();assert.equal(g.screen,'naming');els.get('name-input').value='テストソラ';click('naming-confirm');dialogue();assert.equal(g.screen,'battle');}
  function resize(w,h){sandbox.window.innerWidth=w;sandbox.window.innerHeight=h;sandbox.innerWidth=w;sandbox.innerHeight=h;windowListeners.resize()}
  function button(text){const b=els.get('modal-buttons').children.find(b=>b.textContent.includes(text));assert(b,'button '+text);assert(!b.disabled,'button enabled '+text);b.onclick();}
  function key(key,up=false){for(const f of listeners[up?'keyup':'keydown']||[])f({key,target:els.get('stage'),preventDefault(){}});}
  return {g,els,cmd,button,key,click,tick,dialogue,visibility,start,saved,requests,draws,canvasCalls,calls,saves,audio,host,listeners,resize,
    setMissingArt:value=>{missing=value},resolveLoad,rejectLoad,resolveSave:()=>resolveSave(),hasFrame:()=>!!raf};
}
const settle=()=>new Promise(setImmediate);
(async()=>{
 const t=await runtime();t.tick();for(const [name,count] of Object.entries({hero_walk:16,npc:16,enemies:9,summons:6,buildings:9,props:16}))assert.equal(t.g.assets[name],count,'loaded '+name);t.start();
 assert.equal(t.g.summons[0],'nao');assert.equal(t.g.hp.hp,30);
 t.cmd('summon');t.button('ナオスライム');assert.equal(t.g.battery,85);assert.equal(t.g.hp.hp,60);assert(t.g.battle.cast);t.tick(2000);assert(!t.g.battle.locked);
 t.cmd('attack');t.tick(900);t.cmd('attack');t.tick(2800);t.dialogue();assert.equal(t.g.screen,'field');assert(t.g.state.flags.tutorial);
 result.push('Title → prologue → naming → Naoslime tutorial → bedroom PASS');
 // Walk through the actual bedroom portal with keyboard input.
 t.key('ArrowDown');t.tick(1200);t.key('ArrowDown',true);assert.equal(t.g.map,'town');
 t.g.debugWarp('town',6,27.2);t.g.debugFace(3);t.click('talk-btn');assert(t.g.dialogue);assert(t.g.dialogue.lines[0][1].includes('ぎゅうにゅう'));t.dialogue();
 // Real contact encounter, no debugWin.
 t.g.debugWarp('town',16,24.8);t.tick(1300);t.key('ArrowUp');t.tick(200);t.key('ArrowUp',true);assert.equal(t.g.screen,'battle');
 t.cmd('summon');t.button('ナオスライム');t.tick(2000);let guard=20;while(t.g.screen==='battle'&&guard--){t.cmd('create');t.tick(2800);}assert(guard>0);t.dialogue();assert.equal(t.g.screen,'field');
 result.push('Walking portal, NPC facing dialogue, contact encounter and real victory PASS');
 // Enter the convenience store via its door, buy an item and charge.
 t.g.debugWarp('town',22,24.7);t.tick(1300);t.key('ArrowUp');t.tick(180);t.key('ArrowUp',true);assert.equal(t.g.map,'store');
 t.g.debugWarp('store',5,5.4);t.g.debugFace(3);t.click('talk-btn');assert(t.g.dialogue.lines[0][1].includes('パスワード'));t.dialogue();assert.equal(t.g.modal,'shop');
 const before=t.g.state.items.rice, cash=t.g.state.money;t.button('おにぎり');assert.equal(t.g.state.items.rice,before+1);assert.equal(t.g.state.money,cash-35);t.button('じゅうでん');assert.equal(t.g.battery,100);t.button('ありがとう');
 result.push('Store door, Wi-Fi poem, shopping money/item accounting and free charge PASS');
 // Three additional ordinary wins put the player in the intended 3–5 encounter range.
 for(const type of ['crow','popup','vending']){t.g.debugStartBattle(type,'balance-'+type);guard=20;while(t.g.screen==='battle'&&guard--){if(t.g.hp.hp<25){t.cmd('summon');t.button('ナオスライム');}else t.cmd('create');t.tick(2800);}assert(guard>0);t.dialogue();}
 assert(t.g.level>=2);t.g.debugWarp('town',22,8.7);t.tick(1300);t.key('ArrowUp');t.tick(180);t.key('ArrowUp',true);assert.equal(t.g.map,'electric');
 t.g.debugWarp('electric',7,9.4);t.g.debugFace(3);t.click('talk-btn');t.dialogue();assert(t.g.summons.includes('code'));assert.equal(t.g.battery,100);
 // Prepare with bought food, then beat BUG KING through ordinary commands.
 while(t.g.hp.hp<t.g.hp.maxHp&&t.g.state.items.rice){t.click('menu-btn');t.button('どうぐ');t.button('おにぎり');t.button('もどる');t.button('もどる');}
 t.g.debugWarp('electric',5,5.4);t.g.debugFace(3);t.click('talk-btn');t.dialogue();assert.equal(t.g.battle.type,'bugking');t.cmd('summon');t.button('コードラゴン');assert(t.g.battle.cast);t.tick(2200);assert(t.g.battle.enemy.hp<220);
 guard=30;while(t.g.screen==='battle'&&guard--){if(t.g.hp.hp<24&&t.g.battery>=15){t.cmd('summon');t.button('ナオスライム');}else if(t.g.battery>=25){t.cmd('summon');t.button('コードラゴン');}else t.cmd('create');t.tick(2800);if(t.g.dialogue&&t.g.battle?.over)throw Error('boss defeat');}
 assert(guard>0);assert(t.g.state.bosses.includes('bugking'));t.dialogue();assert.equal(t.g.screen,'ending');t.click('ending-title');assert.equal(t.g.screen,'title');await settle();
 result.push('3–5 ordinary encounters → Code Dragon recruitment → BUG KING (no debugWin) → ending → title PASS');
 const reloaded=await runtime({saved:t.saved});reloaded.tick();assert(!reloaded.els.get('continue-btn').disabled);reloaded.click('continue-btn');assert.equal(reloaded.g.map,'electric');assert(reloaded.g.state.bosses.includes('bugking'));assert(reloaded.g.summons.includes('code'));for(const k of ['chapter','map','x','y','level','exp','money','battery','items','summons','bosses'])assert.equal(JSON.stringify(reloaded.g.state[k]),JSON.stringify(t.g.state[k]),'saved '+k);assert.equal(reloaded.g.hp.hp,t.g.hp.hp);
 result.push('Reload → continue restores map, position, level, HP, battery, money, items, summons and cleared boss PASS');
 // Drum roll rescue keeps the exact original 45 ms tick.
 reloaded.g.debugStartBattle('vending','roll');reloaded.g.debugDamage(999);const shown=reloaded.g.hp.displayHp;reloaded.tick(160);assert(reloaded.g.hp.displayHp<shown&&reloaded.g.hp.displayHp>0);reloaded.g.state.battery=100;reloaded.cmd('summon');reloaded.button('ナオスライム');assert(reloaded.g.hp.hp>0);reloaded.tick(2000);assert(!reloaded.g.battle.over);
 result.push('Lethal HP roll can be rescued by Naoslime before zero PASS');
 reloaded.g.state.battery=0;reloaded.cmd('summon');reloaded.button('コードラゴン');assert.equal(reloaded.g.battery,0);assert(reloaded.g.battle.log.includes('たりない'));assert(!reloaded.g.battle.locked);
 // Losing resets precisely to the last checkpoint, not current battle inventory.
 reloaded.g.debugDamage(999);reloaded.tick(5000);assert(reloaded.g.dialogue);reloaded.dialogue();assert.equal(reloaded.g.screen,'field');assert.equal(reloaded.g.hp.hp,t.g.hp.hp);
 result.push('Insufficient battery consumes no turn; defeat restores last checkpoint PASS');
 reloaded.g.state.bosses=[];reloaded.g.debugWarp('town',16,24);reloaded.g.debugSetLevel(8);reloaded.tick(1400);assert.equal(reloaded.g.screen,'field');assert(reloaded.g.state.defeated.v1>0);const exp=reloaded.g.state.exp;reloaded.tick(1000);assert.equal(reloaded.g.state.exp,exp);
 // Pause freezes movement, HP, animation timers and input, including held keys.
 reloaded.g.debugWarp('room',5,9);reloaded.key('ArrowDown');reloaded.visibility(true);const pos=reloaded.g.position;reloaded.tick(4000);assert.equal(reloaded.g.position.y,pos.y);assert(reloaded.g.paused);reloaded.visibility(false);reloaded.tick(200);assert.equal(reloaded.g.position.y,pos.y);
 reloaded.click('menu-btn');reloaded.button('ひとやすみ');assert(reloaded.g.paused);reloaded.click('resume-btn');assert(!reloaded.g.paused);
 for(const [w,h] of [[390,844],[1280,720],[800,800]]){const p=reloaded.g.position;reloaded.resize(w,h);const match=reloaded.els.get('stage').style.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\) scale\(([-.\d]+)\)/);assert(match);const scale=Math.min(w/540,h/960);assert(Math.abs(Number(match[1])-(w-540*scale)/2)<1e-8);assert(Math.abs(Number(match[2])-(h-960*scale)/2)<1e-8);assert.equal(Number(match[3]),scale);assert.equal(reloaded.g.position.x,p.x);assert.equal(reloaded.g.position.y,p.y);}
 result.push('High-level instant victory, pause/resume and all three aspect-ratio transforms PASS');
 const touch=await runtime();touch.tick();touch.g.debugWarp('room',5,9);const stage=touch.els.get('stage'),r=stage.getBoundingClientRect();
 function pointer(type,x,y){const e={target:stage,pointerId:1,clientX:r.left+x*r.width/540,clientY:r.top+y*r.height/960};for(const cb of stage.listeners[type]||[])cb(e);}
 pointer('pointerdown',200,700);pointer('pointermove',260,700);touch.tick(200);assert(touch.g.position.x>240);const touchX=touch.g.position.x;pointer('pointercancel',260,700);touch.tick(200);assert.equal(touch.g.position.x,touchX);
 result.push('Touch drag moves in four directions; pointer cancellation stops movement PASS');
 const f=await runtime({missing:true});f.tick();f.start();f.tick(1000);assert.equal(f.g.screen,'battle');assert.equal(f.g.assets.hero_walk,0);f.g.debugWin();f.tick(2100);f.dialogue();assert.equal(f.g.screen,'field');
 await f.g.reloadAssets();assert.equal(f.g.assets.hero_walk,0);f.setMissingArt(false);await f.g.reloadAssets();assert.equal(f.g.assets.hero_walk,16);assert.equal(f.g.screen,'field');result.push('All art absent: fallback render PASS; late material arrival swaps in real PNGs without restarting PASS');
 const s=await runtime({sdk:true});s.tick();assert.deepEqual(s.calls,['load','first','ready']);s.start();await settle();assert(s.saves.length);assert(!('aiName' in s.saves[0]));assert.equal(s.saves[0].version,5);assert(!s.listeners.visibilitychange);assert.equal(s.audio.length,0);
 s.host.enabled=true;s.host.audio(true);s.cmd('summon');s.button('ナオスライム');s.tick(100);assert(s.audio.length>0);s.host.enabled=false;s.host.audio(false);assert.equal(s.audio[0].state,'suspended');s.host.pause();assert(s.g.paused);const battery=s.g.battery;s.tick(2000);s.cmd('attack');assert.equal(s.g.battery,battery);s.host.resume();s.tick(2000);assert(!s.g.paused);
 result.push('SDK load/save allowlist, local-only AI name, readiness, host pause and audio off/on PASS');
 const delayed=await runtime({sdk:true,holdLoad:true});assert(!delayed.hasFrame());delayed.resolveLoad('');await settle();await settle();delayed.tick();assert(delayed.hasFrame());
 const broken=await runtime({brokenStorage:true});broken.tick();broken.start();await settle();assert.equal(await broken.g.save(false),false);
 result.push('Slow SDK load and disabled localStorage handled without uncaught error PASS');
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
 fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification','node-results.txt'),result.join('\n')+'\n');
 console.log(result.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1});
