import test from "node:test";
import assert from "node:assert/strict";
import { STRIKE_TIMING, strikeFrame, strikeGeometry, renderFieldStrike, createFieldStrikeController } from "../src/field-strike.js";
import { canPlayerActState, pauseResumeStep } from "../src/turn-state.js";

test("strike holds contact after acceleration and keeps impact independent of frame rate", () => {
  const { windup, impact, hold, duration } = STRIKE_TIMING;
  assert.equal(strikeFrame(windup - 1).phase,"windup");
  assert.equal(strikeFrame(impact - 1).phase,"dash");
  assert.equal(strikeFrame(impact).phase,"impact");
  assert.equal(strikeFrame(impact + hold - 1).age,0);
  assert.equal(strikeFrame(impact + hold).phase,"recover");
  assert.equal(strikeFrame(duration + 100).time,duration);
  assert.equal(strikeFrame(100,{reducedMotion:true}).landed,true);
});
test("light arrow accelerates into a short burst and stays readable on contact", () => {
  const { windup, impact } = STRIKE_TIMING;
  assert.ok(impact - windup >= 90 && impact - windup <= 120, "flight stays short and explosive");
  const early = strikeFrame(windup + (impact - windup) / 4);
  const middle = strikeFrame(windup + (impact - windup) / 2);
  assert.ok(early.travel > 0 && early.travel < .06);
  assert.ok(middle.travel >= .1 && middle.travel <= .2);
  const late = strikeFrame(windup + (impact - windup) * .75);
  assert.ok(late.travel - middle.travel > middle.travel - early.travel, "the shot gains speed toward impact");
  assert.ok(STRIKE_TIMING.hold >= 60 && STRIKE_TIMING.hold <= 85);
  assert.equal(middle.landed, false);
  assert.equal(strikeFrame(impact).travel, 1);
});
test("strike connects exact board centers for either player and a direct target", () => {
  const g=strikeGeometry({left:10,top:500,width:80,height:120},{left:500,top:60,width:200,height:100});
  assert.deepEqual(g.from,{x:50,y:560});
  assert.deepEqual(g.to,{x:600,y:110});
  assert.ok(Math.abs(g.ux*g.ux+g.uy*g.uy-1)<1e-9);
});
test("input stays locked after the engine reopens battle and pause cannot restart the turn early", () => {
  const state={started:true,turn:"player",phase:"battle",actionWindow:"battle",presentationBusy:true};
  assert.equal(canPlayerActState(state),false);
  assert.equal(pauseResumeStep(state),"none");
  assert.equal(canPlayerActState({...state,presentationBusy:false}),true);
});

function harness({ canvasFails = false, rendererFails = false } = {}) {
  let now=0,next=1,modal=false;
  const frames=new Map(),timers=new Map(),busy=[],draws=[];
  let observer;
  function element(rect={left:0,top:0,width:100,height:100}) {
    return {style:{translate:"",rotate:"",filter:"",transition:""},dataset:{},isConnected:true,
      getBoundingClientRect:()=>rect,querySelector:()=>null,setAttribute(){},
      append(){},getContext:()=>canvasFails?null:{},
      remove(){root.children=root.children.filter((node)=>node!==this);}
    };
  }
  const root={children:[],appendChild(node){this.children.push(node);}};
  const doc={body:{},querySelector:()=>modal?{}:null,createElement:()=>element()};
  const win={innerWidth:1280,innerHeight:720,devicePixelRatio:1,performance:{now:()=>now},
    matchMedia:()=>({matches:false}),
    requestAnimationFrame(fn){const id=next++;frames.set(id,fn);return id;},
    cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(fn,ms){const id=next++;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout(id){timers.delete(id);},
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}
  };
  const controller=createFieldStrikeController({document:doc,window:win,root,onBusyChange:(v)=>busy.push(v),
    renderFrame:(ctx,scene,t)=>{if(rendererFails)throw Error("draw failed");draws.push({t,result:scene.result});}});
  const source=element({left:200,top:430,width:100,height:160});
  const target=element({left:750,top:130,width:100,height:160});
  let impacts=0;
  const play=(extra={})=>controller.play({source,target,attacker:{id:"star-lancer",element:"light"},
    defender:{id:"guardian"},onImpact:()=>{impacts++;return {damage:900,damageText:"−900"};},...extra});
  function advance(ms){now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));
    for(const[id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}
  return {controller,root,source,target,play,advance,draws,busy,
    impacts:()=>impacts,modal(value){modal=value;observer();},timerCount:()=>frames.size+timers.size};
}
test("damage callback occurs once at contact, never while winding up", async()=>{
  const h=harness(),done=h.play();
  h.advance(STRIKE_TIMING.windup);assert.equal(h.impacts(),0);
  h.advance(STRIKE_TIMING.impact - STRIKE_TIMING.windup - 1);assert.equal(h.impacts(),0);
  const offset = parseFloat(h.source.style.translate);
  assert.ok(Math.abs(offset) <= 34, "dash must not overshoot the attacking card's lunge");
  h.advance(1);assert.equal(h.impacts(),1);
  assert.equal(h.root.children[0].dataset.impact,"true");
  h.advance(80);h.advance(500);
  assert.equal((await done).landed,true);
  assert.equal(h.impacts(),1);
  assert.equal(h.root.children.length,0);
  assert.deepEqual(h.busy,[true,false]);
  assert.equal(h.source.style.translate,"");
});
test("pausing or an interactive modal prevents damage and hides the blocked effect", async()=>{
  const h=harness(),done=h.play();
  h.advance(100);h.controller.setPaused(true);h.advance(2000);
  assert.equal(h.impacts(),0);
  h.modal(true);assert.equal(h.root.children[0].hidden,true);
  h.controller.setPaused(false);h.advance(2000);assert.equal(h.impacts(),0);
  h.modal(false);h.advance(STRIKE_TIMING.impact - 100);assert.equal(h.impacts(),1);
  h.advance(600);assert.equal((await done).cancelled,false);
});
test("restart cancels pending contact without committing stale damage", async()=>{
  const h=harness(),done=h.play();
  h.advance(200);h.controller.reset();h.advance(1000);
  assert.equal((await done).cancelled,true);
  assert.equal(h.impacts(),0);assert.equal(h.timerCount(),0);
});
test("hit frames bypass CSS easing and restore it when cancelled", async()=>{
  const h=harness();
  h.target.style.transition="filter 160ms ease";
  const done=h.play();
  assert.equal(h.source.style.transition,"none");
  assert.equal(h.target.style.transition,"none");
  h.advance(STRIKE_TIMING.impact);
  assert.match(h.target.style.filter,/brightness/);
  h.controller.reset();
  await done;
  assert.equal(h.target.style.transition,"filter 160ms ease");
  assert.equal(h.source.style.transition,"");
  assert.equal(h.target.style.filter,"");
});
test("a counter recoils the attacking card in the reverse direction", async()=>{
  const h=harness();
  const done=h.play({onImpact:()=>({damage:900,damageText:"−900",impactLabel:"反击"})});
  h.advance(STRIKE_TIMING.impact);
  assert.ok(parseFloat(h.source.style.translate)<0);
  assert.equal(h.target.style.translate,"");
  h.advance(STRIKE_TIMING.duration);
  await done;
  assert.equal(h.source.style.translate,"");
});
test("a stalled animation frame still resolves exactly once via its deadline", async()=>{
  const h=harness(),done=h.play();h.advance(4000);
  assert.equal((await done).landed,true);assert.equal(h.impacts(),1);
});
test("canvas and renderer failure leave gameplay usable", async()=>{
  for(const settings of [{canvasFails:true},{rendererFails:true}]){
    const h=harness(settings);const result=await h.play();
    assert.equal(result.landed,true);assert.equal(h.impacts(),1);assert.equal(h.root.children.length,0);
  }
});
test("rejected rule commits do not display a hit result", async()=>{
  const h=harness(),done=h.play({onImpact:()=>null});
  h.advance(STRIKE_TIMING.impact);
  assert.equal((await done).cancelled,true);assert.equal(h.root.children.length,0);
});

test("renderer remains finite across direction, size, hold and reduced motion",()=>{
  const commands=[],stack=[];
  const ctx={globalAlpha:1};
  for(const name of ["setTransform","clearRect","translate","rotate","beginPath","arc","fill","stroke","moveTo","lineTo","drawImage","fillText","strokeText"]){
    ctx[name]=(...args)=>{for(const v of args)if(typeof v==="number")assert.ok(Number.isFinite(v),name);commands.push([name,...args]);};
  }
  ctx.save=()=>stack.push(ctx.globalAlpha);ctx.restore=()=>{assert.ok(stack.length);ctx.globalAlpha=stack.pop();};
  for(const [width,height]of [[390,844],[1280,720],[3840,2160]]){
    const rect={left:width*.65,top:height*.2,width:width*.1,height:height*.2};
    const scene={geometry:strikeGeometry({left:width*.2,top:height*.6,width:100,height:100},rect),
      targetRect:rect,width,height,dpr:1,element:"fire",heavy:true,
      result:{damage:900,damageText:"−900"},destroyed:{target:true}};
    for(const reducedMotion of [false,true])for(let t=0;t<900;t+=25)renderFieldStrike(ctx,{...scene,reducedMotion},t);
  }
  assert.equal(stack.length,0);
  assert.ok(commands.some(([name,text])=>name==="fillText"&&text==="−900"));
});
