import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(){
 const controls=new Map(),documentHandlers={},lines=[];let saves=0;
 class Control{
  constructor(){this.value='';this.innerHTML='';this.textContent='';this.checked=false;this.disabled=false;this.dataset={};this.handlers={};this.classList={toggle(){},add(){},remove(){}};}
  addEventListener(event,callback){this.handlers[event]=callback;}
  setAttribute(){}
  scrollIntoView(){}
 }
 const document={
  getElementById(id){if(!controls.has(id))controls.set(id,new Control());return controls.get(id);},
  querySelectorAll(){return[];},
  addEventListener(event,callback){documentHandlers[event]=callback;}
 };
 const L={
  layerGroup(){return{addTo(){return this;},clearLayers(){lines.length=0;}};},
  polyline(coords,style){return{coords,style,events:{},addTo(){lines.push(this);return this;},on(event,callback){this.events[event]=callback;return this;}};},
  circleMarker(){return{bindTooltip(){return this;},addTo(){return this;}};}
 };
 const window={};
 runInNewContext(readFileSync(new URL('../routes.js',import.meta.url),'utf8'),{window,document,L});
 const route=window.VacationRouteDomain.newRoute('r1','t1');
 route.start={label:'Starting town',lat:0,lng:0};
 route.end={label:'Destination town',lat:0,lng:4};
 route.waypoints=[{id:'w1',label:'Visit the museum',lat:0,lng:2,kind:'stop'}];
 const controller=window.createVacationRoutes({
  getTrip:()=>({id:'t1'}),getRoutes:()=>[route],getPlaces:()=>[],
  getActivities:()=>[],uid:()=>String(saves+1),persist:()=>{saves++;},onPickChange(){}
 });
 controller.setTool('routes');
 return{route,controller,controls,lines,documentHandlers,getSaves:()=>saves};
}
function clickSection(f,key){
 const row={dataset:{sectionKey:key}};
 f.controls.get('routeSectionList').handlers.click({target:{closest(selector){return selector==='[data-section-key]'?row:null;}}});
}
function encodePolyline(points){
 let previous=[0,0],encoded='';
 for(const point of points){
  for(let j=0;j<2;j++){
   const value=Math.round(point[j]*1e5),delta=value-previous[j];previous[j]=value;
   let n=delta<0?~(delta<<1):(delta<<1);
   while(n>=0x20){encoded+=String.fromCharCode((0x20|(n&0x1f))+63);n>>=5;}
   encoded+=String.fromCharCode(n+63);
  }
 }
 return encoded;
}
test('travel-order list has two selectable driving sections',()=>{
 const f=fixture(),html=f.controls.get('routeSectionList').innerHTML;
 assert.match(html,/1\. Starting town → Visit the museum/);
 assert.match(html,/2\. Visit the museum → Destination town/);
 assert.match(html,/data-section-select=/);
 clickSection(f,'start>w1');
 assert.equal(f.controls.get('routeSectionRemove').disabled,false);
});
test('Skip, Delete, Reconnect and Undo never confuse the two actions',()=>{
 const f=fixture();clickSection(f,'start>w1');
 f.controls.get('routeSectionRemove').handlers.click();
 assert.deepEqual([...f.route.gaps],['start>w1']);
 const afterSkip=f.getSaves();
 f.controls.get('routeSectionRemove').handlers.click();
 assert.equal(f.getSaves(),afterSkip,'Delete/Skip cannot reconnect a skipped section');
 f.controls.get('routeSectionRestore').handlers.click();
 assert.equal(f.route.gaps.length,0);
 f.controls.get('routeSectionRemove').handlers.click();
 const keyTarget={closest(s){return s==='[data-section-select]'||s==='button'?{}:null;}};
 let prevented=false;
 f.documentHandlers.keydown({key:'Delete',target:keyTarget,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.deepEqual([...f.route.gaps],['start>w1']);
 f.controls.get('routeUndo').handlers.click();
 assert.equal(f.route.gaps.length,0);
 assert.equal(f.controls.get('routeSectionRemove').disabled,false,'Undo refreshes section controls');
});
test('clearing a route endpoint retains stops and Undo restores it',()=>{
 const f=fixture();
 f.controls.get('routeControls').handlers.click({target:{closest(s){return s==='[data-route-clear]'?{dataset:{routeClear:'start'}}:null;}}});
 assert.equal(f.route.start,null);
 assert.equal(f.route.waypoints.length,1);
 f.controls.get('routeUndo').handlers.click();
 assert.equal(f.route.start.label,'Starting town');
 assert.equal(f.controls.get('routeSectionList').innerHTML.includes('Starting town'),true);
});
test('mapped polyline is split per section and clicking second leg selects it',()=>{
 const f=fixture();
 f.route.segments=[{startIndex:0,endIndex:1,polyline:encodePolyline([[0,0],[0,1],[0,2],[0,3],[0,4]])}];
 f.controller.attachMap({removeLayer(){}});
 assert.equal(f.lines.length,2);
 f.lines[1].events.click();
 assert.match(f.controls.get('routeSectionList').innerHTML,/data-section-select="w1&gt;end" aria-pressed="true"/);
 assert.equal(f.lines[1].style.color,'#187b79');
});
