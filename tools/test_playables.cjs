// Node VM integration checks; SDK, DOM, Canvas and WebAudio are controlled doubles.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const documentPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'rpg.html'));
const root = path.dirname(documentPath);
const source = fs.readFileSync(documentPath,'utf8').split('<script>')[1].split('</script>')[0];
const result=[];
async function runtime({saved=new Map(),missing=false,brokenStorage=false,seed=7,sdk=false,holdLoad=false,loadError=false,rawSave='',holdSave=false,initialPause=false}={}) {
  const listeners = {}, els = new Map(), draws=[], requests=[], canvasCalls=[], windowListeners={}, calls=[], saves=[], audio=[];
  const host={enabled:false}; let resolveLoad, rejectLoad, resolveSave;
  const loadPromise=new Promise((resolve,reject)=>{resolveLoad=resolve;rejectLoad=reject});
  const context2d = new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),drawImage(...a){draws.push(a);}}, {get(o,p){return p in o ? o[p] : (...a)=>canvasCalls.push([p,...a])},set(o,p,v){canvasCalls.push(['property',p,v]);o[p]=v;return true;}});
  class El {
    constructor(id=''){this.id=id;this.style={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.children=[];this.value=id==='name-input'?'ソラ':'';this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
    addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
    getContext(){return context2d}
    replaceChildren(){this.children=[]}
    appendChild(el){this.children.push(el)}
    focus(){}
    closest(){return this}
  }
  for(const match of fs.readFileSync(documentPath,'utf8').matchAll(/id="([^"]+)"/g)) els.set(match[1],new El(match[1]));
  const buttons=['tatakau','tsukuru','naosu','nigeru','dougu','shiraberu','tsutaeru'].map(cmd=>{const e=new El(cmd);e.dataset.cmd=cmd;return e;});
  let raf, now=0, rafId=0;
  const document={hidden:false,getElementById:id=>{assert(els.has(id),id);return els.get(id)},querySelectorAll:()=>buttons,createElement:()=>new El(),addEventListener(n,f){(listeners[n]??=[]).push(f)}};
  const storage={getItem(k){if(brokenStorage)throw Error('storage unavailable');return saved.get(k)||null},setItem(k,v){if(brokenStorage)throw Error('storage unavailable');saved.set(k,v)}};
  class Image {set src(s){this._src=s;this.complete=true;this.naturalWidth=200;queueMicrotask(()=>this.onload?.())}get src(){return this._src}}
  const sandbox={document,Image,URLSearchParams,location:{search:'?seed='+seed},localStorage:storage,requestAnimationFrame:f=>{raf=f;return ++rafId},cancelAnimationFrame:()=>{raf=null},console,queueMicrotask,fetch:async url=>{
    assert(url.startsWith('assets/')); requests.push(url);
    let path=root+'/'+url;
    if(missing && /assets\/(kateino|hikaku)/.test(url)) throw Error('should not request missing directory');
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
      firstFrameReady(){assert.equal(els.get('loading').style.display,'none');calls.push('first')},
      gameReady(){assert(calls.includes('first'));assert.equal(sandbox.window.__rpg.screen,'title');calls.push('ready')},
      loadData(){calls.push('load');return holdLoad?loadPromise:loadError?Promise.reject(Error('load failed')):Promise.resolve(rawSave)},
      saveData(data){calls.push('save');saves.push(JSON.parse(data));return holdSave?new Promise(resolve=>{resolveSave=resolve}):Promise.resolve()}
    },
    system:{onPause(cb){host.pause=cb;if(initialPause)cb()},onResume(cb){host.resume=cb},
      isAudioEnabled(){return host.enabled},onAudioEnabledChange(cb){host.audio=cb}}
  };
  vm.runInNewContext(source,sandbox,{filename:'rpg.html'});
  await new Promise(setImmediate);await new Promise(setImmediate);
  if(!holdLoad && !initialPause)assert(raf,'boot complete');
  function tick(ms=16){for(let i=0;i<Math.ceil(ms/16);i++){now+=16;if(raf){const f=raf;raf=null;f(now)}}}
  function click(id,target){const e=els.get(id); const event={target:target||e,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){this.stop=true}};for(const f of listeners.click||[])f(event);if(event.stop||e.disabled)return;for(const f of e.listeners.click||[])f(event)}
  const g=sandbox.window.__rpg;
  function cmd(command){click('command-menu',buttons.find(e=>e.dataset.cmd===command));}
  function dialogue(){for(let i=0;i<6;i++)click('screen-'+g.screen);}
  function visibility(hidden){document.hidden=hidden;for(const f of listeners.visibilitychange||[])f();}
  function start(){click('start-btn');assert.equal(g.screen,'prologue');dialogue();assert.equal(g.screen,'naming');els.get('name-input').value='テストソラ';click('naming-confirm');assert.equal(g.screen,'battle');}
  function resize(w,h){sandbox.window.innerWidth=w;sandbox.window.innerHeight=h;windowListeners.resize()}
  return {g,els,cmd,click,tick,dialogue,visibility,start,saved,requests,draws,canvasCalls,calls,saves,audio,host,listeners,resize,
    resolveLoad,rejectLoad,resolveSave:()=>resolveSave(),hasFrame:()=>!!raf};
}
const settle=()=>new Promise(setImmediate);
function checkpoint(ch){return {version:1,started:true,aiName:'端末の名前',clearedChapter:ch,reachedChapter:Math.min(ch+1,4)}}
(async()=>{
  const t=await runtime({sdk:true,holdLoad:true});
  assert.deepEqual(t.calls,['load']);
  t.click('start-btn');assert.equal(t.g.screen,'title');
  await t.g.platform.save(checkpoint(1),true);assert.equal(t.saves.length,0);
  t.resolveLoad('');await settle();await settle();
  assert.deepEqual(t.calls,['load','save']);
  assert(!('aiName' in t.saves[0]));
  t.tick();assert.deepEqual(t.calls,['load','save','first','ready']);
  t.tick();assert.equal(t.calls.filter(c=>c==='ready').length,1);
  assert(!t.listeners.visibilitychange,'SDK must not register Page Visibility API');
  t.visibility(true);assert.equal(t.g.paused,false);
  result.push('SDK: loadData完了前の保存禁止、firstFrameReady→gameReady各1回、visibilitychange未登録 PASS');

  const session=await runtime({sdk:true});session.tick();session.start();
  assert.equal(session.audio.length,0,'initially muted: no AudioContext');
  assert.equal(session.saves.length,0,'chapter start is not a cloud checkpoint');
  session.cmd('nigeru');session.tick(800);
  assert(!session.calls.includes('tone'));
  session.host.enabled=true;session.host.audio(true);
  session.cmd('naosu');assert.equal(session.audio.length,1);
  const ac=session.audio[0];assert.equal(ac.gains[0].value,1);assert.equal(ac.state,'running');
  session.host.enabled=false;session.host.audio(false);
  assert.equal(ac.gains[0].value,0);assert.equal(ac.state,'suspended');
  const tones=session.calls.filter(c=>c==='tone').length;
  session.tick(800);session.cmd('naosu');session.tick(800);
  assert.equal(session.calls.filter(c=>c==='tone').length,tones);
  session.host.enabled=true;session.host.audio(true);
  session.cmd('naosu');
  session.host.pause();
  assert.equal(session.hasFrame(),false);assert(session.els.get('stage').inert);
  const before={draws:session.draws.length,hp:session.g.ryosei.displayHp,turn:session.g.boss.turnCount,requests:session.requests.length};
  session.tick(3000);session.cmd('tatakau');session.click('start-btn');
  assert.deepEqual({draws:session.draws.length,hp:session.g.ryosei.displayHp,turn:session.g.boss.turnCount,requests:session.requests.length},before);
  assert.equal(ac.gains[0].value,0);
  session.host.audio(true);assert.equal(ac.gains[0].value,0,'audio event cannot unpause');
  session.host.resume();assert(session.hasFrame());assert(!session.els.get('stage').inert);
  session.tick(800);assert.equal(session.g.boss.turnCount,before.turn+1);
  session.g.debugWin();await settle();assert.equal(session.saves.length,1);assert.equal(session.saves[0].clearedChapter,1);
  assert.equal(session.saved.get('ryoseiworld-rpg-ai-name'),'"テストソラ"');
  assert.deepEqual(Object.keys(session.saves[0]).sort(),['clearedChapter','reachedChapter','started','version']);
  result.push('SDK: 章クリア保存、AI名は端末のみ、初期ミュートと途中ミュート、停止中の描画/入力/敵ターン/音声停止 PASS');

  const serial=await runtime({sdk:true,holdSave:true});serial.tick();
  serial.g.platform.save(checkpoint(1),true);await settle();
  serial.host.pause();serial.g.platform.save(checkpoint(2),true);
  serial.resolveSave();await settle();assert.equal(serial.saves.length,1,'no queued network save while paused');
  serial.host.resume();await settle();assert.equal(serial.saves.length,2);assert.equal(serial.saves[1].clearedChapter,2);
  serial.resolveSave();await settle();
  result.push('SDK: 非同期保存の直列化と停止中の保存延期、再開時の最新チェックポイント保存 PASS');

  for(const options of [{loadError:true},{rawSave:'{bad JSON'}]){
    const failed=await runtime({sdk:true,...options});failed.tick();failed.start();failed.g.debugWin();await settle();
    assert.equal(failed.saves.length,0,'failed load must not overwrite cloud');
  }
  const bootPaused=await runtime({sdk:true,initialPause:true});
  assert(bootPaused.g.paused);assert.equal(bootPaused.requests.length,0);assert.equal(bootPaused.calls.length,0);
  bootPaused.host.resume();await settle();await settle();bootPaused.tick();assert(bootPaused.calls.includes('ready'));
  const loadingPause=await runtime({sdk:true,holdLoad:true});loadingPause.host.pause();
  loadingPause.resolveLoad('');await settle();assert(!loadingPause.hasFrame());assert(!loadingPause.calls.includes('ready'));
  loadingPause.host.resume();await settle();loadingPause.tick();assert(loadingPause.calls.includes('ready'));
  result.push('SDK: ロード失敗/不正JSONで上書きなし、初期停止とロード中停止からの起動再開 PASS');

  const saved=new Map([['ryoseiworld-rpg-v4',JSON.stringify(checkpoint(3))]]);
  const layout=await runtime({saved});layout.tick();layout.click('continue-btn');assert.equal(layout.g.chapter,4);
  const state=JSON.stringify(layout.g);
  for(const [w,h] of [[540,960],[960,540],[600,600],[1260,540]]){
    layout.resize(w,h);
    const transform=layout.els.get('stage').style.transform;
    const values=transform.match(/translate\(([^p]+)px,([^p]+)px\) scale\(([^)]+)\)/).slice(1).map(Number);
    const [x,y,s]=values;
    assert(Math.abs(x*2+540*s-w)<1e-8);assert(Math.abs(y*2+960*s-h)<1e-8);
    assert(x>=0 && y>=0);assert.equal(JSON.stringify(layout.g),state);
  }
  layout.tick();
  assert(layout.canvasCalls.some(c=>c[0]==='scale' && c[1]===-1 && c[2]===1),'self mirror');
  assert(layout.canvasCalls.some(c=>c[0]==='property' && c[1]==='filter' && c[2]==='saturate(0%)'),'self grayscale');
  const heroDraw=layout.draws.findLast(d=>d[0].src.includes('assets/ryosei/'));
  assert(heroDraw);const [,x,y,w,h]=heroDraw;const scale=h/248;
  assert(Math.abs(y+244*scale-(568-4*.6))<1e-8,'visible feet preserve v1 baseline');
  assert(Math.abs(228*scale-185*.6)<1e-8,'visible idle height preserved');
  result.push('4画面比率で中央フィット・状態維持、新主人公の足元/身長とジブンの灰色/左右反転 PASS');

  const bubble=await runtime({saved:new Map([['ryoseiworld-rpg-v4',JSON.stringify(checkpoint(1))]])});
  bubble.tick();bubble.click('continue-btn');bubble.cmd('nigeru');bubble.tick(710);
  assert(bubble.canvasCalls.some(c=>c[0]==='fillText' && c[1]==='ゲームばっかり'));
  const first=bubble.canvasCalls.findLast(c=>c[0]==='fillText' && c[1]==='ゲームばっかり');
  bubble.tick(160);const moved=bubble.canvasCalls.findLast(c=>c[0]==='fillText' && c[1]==='ゲームばっかり');
  assert(moved[2]<first[2] && moved[3]>first[3],'bubble flies down and left to hero');
  bubble.tick(700);const count=bubble.canvasCalls.filter(c=>c[0]==='fillText' && c[1]==='ゲームばっかり').length;
  bubble.tick(100);assert.equal(bubble.canvasCalls.filter(c=>c[0]==='fillText' && c[1]==='ゲームばっかり').length,count);
  result.push('2章: 親のことばの吹き出しが主人公方向へ移動し、時間で消える PASS');

  // Finish all chapters in SDK mode, then reload cloud progress with the local AI name.
  for(let ch=1;ch<=4;ch++){
    const cloud=JSON.stringify({version:1,started:true,clearedChapter:ch-1,reachedChapter:ch,aiName:'CLOUD_NAME_MUST_NOT_BE_USED'});
    const game=await runtime({sdk:true,rawSave:cloud,saved:new Map([['ryoseiworld-rpg-ai-name','"端末ソラ"']])});game.tick();
    assert.equal(game.g.aiName,'端末ソラ');game.click('continue-btn');assert.equal(game.g.chapter,ch);
    game.g.debugWin();await settle();assert.equal(game.saves[0].clearedChapter,ch);
    assert(!JSON.stringify(game.saves).includes('端末ソラ'));game.tick(2100);
    if(ch===4){
      for(let i=0;i<3;i++)game.click('screen-epilogue');
      game.els.get('epilogue-answer-input').value='PRIVATE_ANSWER';game.click('epilogue-answer-btn');game.tick(4000);
      assert.equal(game.g.screen,'title');assert.equal(game.els.get('epilogue-answer-input').value,'');
      assert(!JSON.stringify(game.saves).includes('PRIVATE_ANSWER'));assert(![...game.saved.values()].some(v=>v.includes('PRIVATE_ANSWER')));
    }else assert.equal(game.g.screen,'interlude');
  }
  result.push('SDK: 全章のクリア保存と進行復元、端末のAI名優先、エピローグ回答は保存・送信なし PASS');
  console.log(result.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1});
