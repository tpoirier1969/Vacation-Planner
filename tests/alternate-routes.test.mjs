import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
function harness(){
 const handlers=new Map(),lines=[],markers=[];
 const controls=new Map(),get=id=>{
  if(!controls.has(id))controls.set(id,{value:'',innerHTML:'',textContent:'',checked:true,disabled:false,handlers:{},classList:{toggle(){},add(){},remove(){}},addEventListener(k,f){this.handlers[k]=f;},setAttribute(){},scrollIntoView(){}});
  return controls.get(id);
 };
 const document={getElementById:get,querySelectorAll:()=>[],addEventListener:(k,f)=>handlers.set(k,f)};
 const L={layerGroup(){return{addTo(){return this;},clearLayers(){lines.length=0;markers.length=0;}};},
  polyline(coords,style){return{coords,style,events:{},addTo(){lines.push(this);return this;},on(k,f){this.events[k]=f;return this;}};},
  marker(point,options){return{options,events:{},addTo(){markers.push(this);return this;},on(k,f){this.events[k]=f;return this;},bindTooltip(){return this;},setLatLng(){},getLatLng(){return{lat:.4,lng:2};}};},
  divIcon:x=>x,circleMarker(){return{bindTooltip(){return this;},addTo(){return this;}};},latLngBounds(){return{pad(){return this;}};}};
 class Query{constructor(params){this.items={...params};}set(k,v){this.items[k]=v;}toString(){return Object.entries(this.items).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}}
 class Abort{abort(){}get signal(){return {};}}
 function encode(points){let prev=[0,0],out='';for(const p of points)for(let j=0;j<2;j++){let v=Math.round(p[j]*1e5),d=v-prev[j];prev[j]=v;let n=d<0?~(d<<1):(d<<1);while(n>=32){out+=String.fromCharCode((32|(n&31))+63);n>>=5;}out+=String.fromCharCode(n+63);}return out;}
 const shapes={balanced:[[0,0],[0,1],[0,2],[0,3],[0,4]],short:[[0,0],[.2,1],[.2,2],[.2,3],[0,4]],less_maneuvers:[[0,0],[-.25,1],[-.25,2],[-.25,3],[0,4]]};
 const fetch=async url=>{
  const params=Object.fromEntries(url.split('?')[1].split('&').map(x=>x.split('=').map(decodeURIComponent)));
  const type=params.type||'balanced',coords=shapes[type]||shapes.balanced;
  return{ok:true,json:async()=>({features:[{properties:{polyline5:encode(coords),distance:600000,time:40000,legs:[{distance:600000,time:40000}]}}]})};
 };
 const window={LAZY_ACRES_GEOAPIFY_KEY:'test'};
 runInNewContext(readFileSync(new URL('../routes.js',import.meta.url),'utf8'),{window,document,L,URLSearchParams:Query,fetch,setTimeout:()=>1,clearTimeout(){},AbortController:Abort});
 const r=window.VacationRouteDomain.newRoute('first','trip','Main route');
 r.start={lat:0,lng:0,label:'Start'};r.end={lat:0,lng:4,label:'End'};
 const routes=[r];let saves=0,n=0;
 const controller=window.createVacationRoutes({getTrip:()=>({id:'trip'}),getRoutes:()=>routes,getPlaces:()=>[],getActivities:()=>[],persist(){saves++;},uid:()=>String(++n),onPickChange(){}});
 const map={dragging:{disable(){},enable(){},enabled(){return true;}},on(){},once(){},off(){},removeLayer(){},fitBounds(){}};
 controller.setTool('routes');controller.attachMap(map);
 return{routes,controls,controller,lines,markers,get,getSaves:()=>saves};
}
test('three distinct routed paths can be chosen on map without changing siblings',async()=>{
 const h=harness();
 h.get('routeGenerateAlternatives').handlers.click();
 for(let i=0;i<80&&h.routes.length<3;i++)await Promise.resolve();
 assert.equal(h.routes.length,3);
 assert.equal(new Set(h.routes.map(r=>r.polyline)).size,3);
 assert.equal(new Set(h.routes.map(r=>r.preferences.compareGroup)).size,1);
 assert.equal((h.get('routeAlternativeChoices').innerHTML.match(/data-route-variant/g)||[]).length,3);
 assert.equal(h.lines.length,3);
 h.lines.find(line=>line.style.color==='#22769c').events.click({latlng:{lat:.1,lng:2}});
 assert.equal(h.get('routePicker').value,h.routes[1].id);
 const active=h.lines.find(line=>line.style.weight===7);
 active.events.mouseover({latlng:{lat:.18,lng:2}});
 const handle=h.markers.find(m=>m.options?.icon?.className==='route-drag-handle-wrap');
 assert.ok(handle,'selected route shows draggable handle');
 const previousOther=h.routes[0].waypoints.length+h.routes[2].waypoints.length;
 handle.events.dragend({target:{getLatLng(){return{lat:.4,lng:2};}}});
 for(let i=0;i<30;i++)await Promise.resolve();
 assert.equal(h.routes[1].waypoints.length,1);
 assert.equal(h.routes[0].waypoints.length+h.routes[2].waypoints.length,previousOther);
});
