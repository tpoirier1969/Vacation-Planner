/* Routes: a dedicated controller for shared named driving routes and map waypoints.
   The only durable storage is cloud.js / vacation_routes. */
(function(root){'use strict';
const MAX_WAYPOINTS=16,MAX_ROUTES=40;
const DEFAULT={strategy:'balanced',mode:'drive',avoidHighways:false,avoidTolls:false,avoidFerries:false};
const STRATEGIES=['balanced','short','less_maneuvers'],MODES=['drive','light_truck'];
const STRATEGY_NAMES={balanced:'Balanced',short:'Shortest',less_maneuvers:'Fewer turns'};
const ROUTE_COLORS=['#b45237','#22769c','#8c609e'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const pointOK=p=>!!p&&p.lat!=null&&p.lng!=null&&p.lat!==''&&p.lng!==''&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
function newRoute(id,tripId,name='New route'){
 return {id,tripId,name,start:null,end:null,waypoints:[],preferences:{...DEFAULT},
  startDate:'',startTime:'',endDate:'',endTime:'',polyline:'',distanceM:null,durationS:null,legStats:[],routeKind:'day',routeOrder:0,segments:[],gaps:[],visible:true};
}
function decodePolyline(value){
 if(typeof value!=='string'||value.length>500000)return [];
 let lat=0,lng=0,i=0;const coords=[];
 while(i<value.length&&coords.length<200000){
  const vals=[];
  for(let j=0;j<2;j++){
   let shift=0,result=0,b;
   do{if(i>=value.length||shift>30)return [];
    b=value.charCodeAt(i++)-63;result|=(b&31)<<shift;shift+=5;
   }while(b>=32);
   vals.push(result&1?~(result>>1):result>>1);
  }
  lat+=vals[0];lng+=vals[1];coords.push([lat/1e5,lng/1e5]);
 }
 return coords;
}
function routeURL(route,key){
 if(!pointOK(route.start)||!pointOK(route.end))throw Error('Choose a starting point and destination first.');
 const points=[route.start,...(route.waypoints||[]),route.end];
 if(points.length>MAX_WAYPOINTS+2)throw Error('Use up to '+MAX_WAYPOINTS+' intermediate points.');
 if(points.some(p=>!pointOK(p)))throw Error('A route point has invalid coordinates.');
 const p={...DEFAULT,...route.preferences};
 const query=new URLSearchParams({
  waypoints:points.map(x=>Number(x.lat).toFixed(6)+','+Number(x.lng).toFixed(6)).join('|'),
  mode:MODES.includes(p.mode)?p.mode:'drive',
  type:STRATEGIES.includes(p.strategy)?p.strategy:'balanced',
  intermediate_waypoint_mode:(route.waypoints||[]).some(x=>x.kind==='stop')?'through_stop':'pass_through',
  details:'polyline5',format:'geojson',apiKey:key
 });
 const avoid=[];
 if(p.avoidHighways)avoid.push('highways');
 if(p.avoidTolls)avoid.push('tolls');
 if(p.avoidFerries)avoid.push('ferries');
 if(avoid.length)query.set('avoid',avoid.join('|'));
 return 'https://api.geoapify.com/v1/routing?'+query.toString();
}
function parseRoute(data){
 const p=data?.features?.[0]?.properties,polyline=p?.polyline5;
 if(typeof polyline!=='string'||decodePolyline(polyline).length<2)throw Error('No drivable road geometry returned.');
 if(p.distance==null||p.time==null||!Number.isFinite(Number(p.distance))||!Number.isFinite(Number(p.time)))throw Error('Missing route distance or duration.');
 return {polyline,distanceM:Number(p.distance),durationS:Number(p.time),legStats:(p.legs||[]).map(x=>({distanceM:Number(x.distance)||0,durationS:Number(x.time)||0}))};
}
// Compare actual road geometry, not just estimated distance or strategy labels.
function sameRoad(a,b){
 const x=decodePolyline(a),y=decodePolyline(b);
 if(!x.length||!y.length)return false;
 let different=0;
 for(let i=1;i<18;i++){
  const t=i/18,p=x[Math.round(t*(x.length-1))],q=y[Math.round(t*(y.length-1))];
  const dx=(p[1]-q[1])*Math.cos(p[0]*Math.PI/180),dy=p[0]-q[0];
  if(Math.hypot(dx,dy)>0.015)different++;
 }
 return different<3;
}
function windowError(route){
 if(route.startDate&&route.endDate&&route.endDate<route.startDate)return 'End day is before start day.';
 if(route.startDate&&route.endDate&&route.endDate===route.startDate&&route.startTime&&route.endTime&&route.endTime<=route.startTime)return 'End time must follow start time on the same day.';
 return '';
}
function summary(r){
 if(r?.distanceM==null||r?.durationS==null)return 'Not calculated yet';
 const totalMins=Math.max(1,Math.round(r.durationS/60)),hours=Math.floor(totalMins/60),mins=totalMins%60;
 return (r.distanceM/1609.344).toFixed(0)+' mi · '+(hours?hours+' hr ':'')+mins+' min driving';
}
// Separate a calculated road line at its ordered waypoints for precise map selection.
function sectionGeometry(coords,points){
 if(!Array.isArray(coords)||coords.length<points.length||points.length<2)return null;
 const cuts=[0];let previous=0;
 for(let j=1;j<points.length-1;j++){
  const p=points[j],last=coords.length-(points.length-j);
  if(!pointOK(p)||last<=previous)return null;
  let best=previous+1,distance=Infinity,scale=Math.cos(Number(p.lat)*Math.PI/180);
  for(let k=previous+1;k<=last;k++){
   const dy=coords[k][0]-Number(p.lat),dx=(coords[k][1]-Number(p.lng))*scale,d=dy*dy+dx*dx;
   if(d<distance){distance=d;best=k;}
  }
  cuts.push(best);previous=best;
 }
 cuts.push(coords.length-1);
 return points.slice(0,-1).map((_,i)=>coords.slice(cuts[i],cuts[i+1]+1));
}
function routeType(r){
 if(r?.routeKind==='day')return 'day';
 const direction=r?.preferences?.journeyDirection;
 return direction==='outbound'||direction==='return'?direction:'journey';
}
function createController(config){
 const $=id=>document.getElementById(id);
 let currentId='',tool='discover',pick='',map=null,layer=null,undoStack=[],busy=false,status='';
 let dragHandle=null,dragHandleLeg=-1,dragHandleRoute='',directDrag=null;
 const routes=()=>{const t=config.getTrip();return t?(config.getRoutes()||[]).filter(r=>r.tripId===t.id).sort((a,b)=>(a.routeOrder||0)-(b.routeOrder||0)):[];};
 const routePoints=r=>[r.start,...(r.waypoints||[]),r.end];
 const sectionKey=(points,i)=>String(i===0?'start':points[i].id||'point-'+i)+'>'+String(i===points.length-2?'end':points[i+1].id||'point-'+(i+1));
 const validGaps=r=>{const points=routePoints(r),keys=new Set(points.slice(0,-1).map((_,i)=>sectionKey(points,i)));return (r.gaps||[]).filter(k=>keys.has(k));};
 const sectionRows=r=>{const p=routePoints(r),gaps=new Set(validGaps(r));return p.slice(0,-1).map((from,i)=>({i,key:sectionKey(p,i),from,to:p[i+1],gap:gaps.has(sectionKey(p,i))}));};
 let selectedSection='';
 const selected=()=>routes().find(r=>r.id===currentId)||null;
 const report=msg=>{status=msg;if($('routeStatus'))$('routeStatus').textContent=msg;};
 function selectDefault(){if(!routes().some(r=>r.id===currentId)){currentId=routes()[0]?.id||'';undoStack=[];selectedSection='';}}
 function invalidate(r){r.polyline='';r.distanceM=null;r.durationS=null;r.legStats=[];r.segments=[];}
 function update(fn,changedRoad=false){
  const r=selected();if(!r)return;
  const old=JSON.parse(JSON.stringify(r));
  fn(r);
  if(JSON.stringify(r)===JSON.stringify(old))return;
  undoStack.push(old);if(undoStack.length>25)undoStack.shift();
  if(changedRoad){r.gaps=validGaps(r);invalidate(r);}
  config.persist();
 }
 function comparedRoutes(){
  const r=selected(),group=r?.preferences?.compareGroup;
  if(!r)return [];
  if(!group||!$('routeShowAlternatives')?.checked)return [r];
  const options=routes().filter(x=>x.preferences?.compareGroup===group&&x.visible!==false);
  return [...options.filter(x=>x.id!==currentId),r].slice(-3);
 }
 function routeGeometry(r){
  return (r.segments||[]).length?r.segments:(r.polyline&&!validGaps(r).length?[{polyline:r.polyline,startIndex:0,endIndex:(r.waypoints||[]).length}]:[]);
 }
 function addViaAt(routeId,leg,latlng){
  if(busy||!pointOK(latlng))return;
  const route=selected();
  if(!route||route.id!==routeId||route.waypoints.length>=MAX_WAYPOINTS){
   report('Select a route with space for another road point.');return;
  }
  const rows=sectionRows(route);
  if(!rows[leg]||rows[leg].gap)return report('Reconnect the section before reshaping it.');
  update(r=>{r.waypoints.splice(leg,0,{id:config.uid(),lat:Number(latlng.lat),lng:Number(latlng.lng),label:'Dragged road point',kind:'via'});},true);
  selectedSection='';dragHandle=null;
  status='Road point added. Recalculating the selected alternative…';
  render();void calculate();
 }
 function showDragHandle(latlng,leg,routeId){
  if(busy||pick||!map||!pointOK(latlng))return;
  if(dragHandle&&dragHandleRoute===routeId&&dragHandleLeg===leg){dragHandle.setLatLng(latlng);return;}
  dragHandle=null;dragHandleLeg=leg;dragHandleRoute=routeId;
  if(typeof L.marker!=='function'||typeof L.divIcon!=='function')return;
  const icon=L.divIcon({className:'route-drag-handle-wrap',html:'<span class="route-drag-handle" aria-hidden="true">↕</span>',iconSize:[30,30],iconAnchor:[15,15]});
  const marker=L.marker(latlng,{draggable:true,autoPan:true,icon,zIndexOffset:900}).addTo(layer);
  marker.on('dragstart',()=>{if(map.dragging?.enabled?.())map.dragging.disable();});
  marker.on('dragend',e=>{map.dragging?.enable?.();addViaAt(routeId,leg,e.target.getLatLng());});
  dragHandle=marker;
 }
 function draw(){
  if(!layer)return;
  layer.clearLayers();dragHandle=null;dragHandleLeg=-1;dragHandleRoute='';
  const r=selected();if(!r||document.getElementById('mapShowRoutes')?.checked===false)return;
  const shown=comparedRoutes();
  for(const [variantIndex,route] of shown.entries()){
   if(route.visible===false)continue;
   const active=route.id===currentId,rows=sectionRows(route),points=routePoints(route);
   const color=ROUTE_COLORS[variantIndex%ROUTE_COLORS.length];
   for(const segment of routeGeometry(route)){
    const coords=decodePolyline(segment.polyline),start=segment.startIndex||0,end=segment.endIndex??rows.length-1;
    if(coords.length<2||end<start)continue;
    const parts=sectionGeometry(coords,points.slice(start,end+2))||[coords];
    for(const [index,part] of parts.entries()){
     if(part.length<2)continue;
     const row=rows[start+index];if(!row)continue;
     const focused=active&&selectedSection===row.key;
     const line=L.polyline(part,{color:focused?'#187b79':color,weight:focused?9:active?7:5,opacity:active?1:.69,interactive:true}).addTo(layer);
     line.on('click',e=>{
      if(!active){currentId=route.id;undoStack=[];selectedSection='';pick='';status='Alternative selected. Drag its path to customize it.';render();return;}
      selectedSection=row.key;render();showDragHandle(e.latlng||{lat:part[Math.floor(part.length/2)][0],lng:part[Math.floor(part.length/2)][1]},row.i,route.id);
      $('routeSectionList')?.scrollIntoView({behavior:'smooth',block:'nearest'});
     });
     if(active&&!row.gap){
      line.on('mouseover',e=>showDragHandle(e.latlng,row.i,route.id));
      line.on('mousedown',e=>{
       if(busy||pick||!pointOK(e.latlng)||!map?.on)return;
       const origin=e.latlng;let last=origin,moved=false;
       const move=ev=>{
        if(!pointOK(ev.latlng))return;
        last=ev.latlng;
        const scale=Math.cos(origin.lat*Math.PI/180);
        if(Math.hypot(last.lat-origin.lat,(last.lng-origin.lng)*scale)>.00008)moved=true;
        if(moved)showDragHandle(last,row.i,route.id);
       };
       const finish=()=>{
        map.off?.('mousemove',move);map.dragging?.enable?.();directDrag=null;
        if(moved)addViaAt(route.id,row.i,last);
       };
       directDrag={move,finish};map.dragging?.disable?.();
       map.on('mousemove',move);map.once('mouseup',finish);
      });
     }
    }
   }
  }
  if(r.visible===false)return;
  for(const [role,p,color] of [['start',r.start,'#28766f'],['end',r.end,'#b45237']]){
   if(!pointOK(p))continue;
   if(typeof L.marker==='function'&&typeof L.divIcon==='function'){
    const marker=L.marker([p.lat,p.lng],{draggable:true,icon:L.divIcon({className:'route-endpoint-wrap',html:'<span class="route-endpoint" style="--endpoint-color:'+color+'">'+(role==='start'?'A':'B')+'</span>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(layer);
    marker.bindTooltip?.((role==='start'?'Start: ':'Destination: ')+p.label);
    marker.on('dragend',e=>{
     const where=e.target.getLatLng();update(route=>{route[role]={...route[role],lat:where.lat,lng:where.lng,label:'Moved '+(role==='start'?'start':'destination')};},true);
     status='Endpoint moved. Recalculating…';render();void calculate();
    });
   }else L.circleMarker([p.lat,p.lng],{radius:7,color,fillColor:color,fillOpacity:0.8}).bindTooltip((role==='start'?'Start: ':'End: ')+p.label).addTo(layer);
  }
  for(const [i,p] of (r.waypoints||[]).entries()){
   if(!pointOK(p))continue;
   if(p.kind!=='stop'&&typeof L.marker==='function'&&typeof L.divIcon==='function'){
    const m=L.marker([p.lat,p.lng],{draggable:true,icon:L.divIcon({className:'route-via-wrap',html:'<span class="route-via-marker">◆</span>',iconSize:[23,23],iconAnchor:[11,11]})}).addTo(layer);
    m.bindTooltip?.('Drag road point '+(i+1));
    m.on('dragend',e=>{
     const q=e.target.getLatLng();update(route=>{route.waypoints[i]={...route.waypoints[i],lat:q.lat,lng:q.lng,label:'Moved road point'};},true);
     status='Road point moved. Recalculating…';render();void calculate();
    });
   }else L.circleMarker([p.lat,p.lng],{radius:5,color:'#b08b47',fillColor:'#edc376',fillOpacity:.9}).bindTooltip((i+1)+'. '+p.label).addTo(layer);
  }
 }
 function attachMap(next){
  if(next!==map){if(directDrag&&map){map.off?.('mousemove',directDrag.move);map.off?.('mouseup',directDrag.finish);map.dragging?.enable?.();directDrag=null;}if(layer&&map)map.removeLayer(layer);map=next;layer=map?L.layerGroup().addTo(map):null;}
  draw();
 }
 function fitMap(){
  const r=selected();if(!map||!r)return;
  const coords=(r.segments||[]).length?r.segments.flatMap(x=>decodePolyline(x.polyline)):(r.polyline&&!validGaps(r).length?decodePolyline(r.polyline):[r.start,...(r.waypoints||[]),r.end].filter(pointOK).map(p=>[p.lat,p.lng]));
  if(coords.length>1)map.fitBounds(L.latLngBounds(coords).pad(0.12),{maxZoom:14});
  else if(coords.length===1)map.setView(coords[0],13);
 }
 function setPick(which){
  if(!selected())return;
  pick=pick===which?'':which;config.onPickChange?.();render();
 }
 function cancelPick(){
  if(!pick)return;pick='';config.onPickChange?.();render();
 }
 function consumeMapClick(p){
  if(!pick||!selected()||!pointOK(p))return false;
  const role=pick;
  if(role==='start'||role==='end'){
   update(r=>{r[role]={lat:Number(p.lat),lng:Number(p.lng),label:'Map point '+Number(p.lat).toFixed(4)+', '+Number(p.lng).toFixed(4)};},true);
   pick='';config.onPickChange?.();
  }else{
   if(selected().waypoints.length>=MAX_WAYPOINTS){report('Maximum '+MAX_WAYPOINTS+' road points/stops.');return true;}
   update(r=>{r.waypoints.push({id:config.uid(),lat:Number(p.lat),lng:Number(p.lng),
    label:(role==='stop'?'Stop ':'Road point ')+(r.waypoints.length+1),kind:role});},true);
  }
  status='Map point saved. Select Suggest route to calculate the road path.';render();
  return true;
 }
 function addRoute(copy=false){
  const t=config.getTrip();if(!t||routes().length>=MAX_ROUTES)return report('Maximum '+MAX_ROUTES+' saved routes per trip.');
  const base=selected(),n=routes().length;
  const r=copy&&base?{...JSON.parse(JSON.stringify(base)),id:config.uid(),name:(base.name+' — alternative').slice(0,160)}:
   newRoute(config.uid(),t.id,n?'Route '+(n+1):'Outbound route');
  r.routeOrder=Math.max(-1,...routes().map(x=>x.routeOrder||0))+1;
  config.getRoutes().push(r);currentId=r.id;undoStack=[];selectedSection='';pick='';status=copy?'Saved separate alternative. Recalculate to compare.':'Add start and end points to begin.';
  config.persist();
 }
 function removeRoute(){
  const r=selected();if(!r||!confirm('Delete the saved route "'+r.name+'"?'))return;
  const list=config.getRoutes(),i=list.findIndex(x=>x.id===r.id);if(i>=0)list.splice(i,1);
  currentId='';undoStack=[];selectedSection='';pick='';config.persist();
 }
 function undo(){
  const r=selected(),old=undoStack.pop();if(!r||!old)return;
  for(const k of Object.keys(r))delete r[k];
  Object.assign(r,old);status='Last edit undone.';config.persist();render();
 }
 function addExisting(){
  const r=selected(),v=$('routeSourceStop').value;if(!r||!v)return;
  const [kind,id]=v.split(':'),collection=kind==='places'?config.getPlaces():config.getActivities();
  const item=collection.find(x=>x.id===id);
  if(!item||!pointOK(item))return report('This Idea or activity has no mapped location.');
  if(r.waypoints.length>=MAX_WAYPOINTS)return report('Maximum '+MAX_WAYPOINTS+' intermediate points.');
  update(route=>{route.waypoints.push({id:config.uid(),lat:Number(item.lat),lng:Number(item.lng),
   label:item.name||item.title||'Stop',kind:'stop',sourceType:kind,sourceId:id});},true);
  status='Itinerary/Idea stop added.';render();
 }
 async function geocode(role){
  const r=selected();if(!r)return;
  const id=r.id,input=$(role==='start'?'routeStart':'routeEnd'),text=input.value.trim();
  if(!text)return report('Enter a location before finding it.');
  const key=root.LAZY_ACRES_GEOAPIFY_KEY;if(!key)return report('Geoapify search is not configured.');
  report('Finding '+text+'…');
  try{
   const url='https://api.geoapify.com/v1/geocode/search?'+new URLSearchParams({text,limit:'1',apiKey:key}).toString();
   const response=await fetch(url);if(!response.ok)throw Error('Geocoding HTTP '+response.status);
   const data=await response.json(),p=data.features?.[0]?.properties;
   if(!p||!pointOK({lat:p.lat,lng:p.lon}))throw Error('No place matched. Try a more complete address.');
   if(selected()?.id!==id)return;
   update(route=>route[role]={label:p.formatted||text,lat:Number(p.lat),lng:Number(p.lon)},true);
   status='Found '+(p.formatted||text)+'. Check the marker on the map.';render();fitMap();
  }catch(e){report('Location lookup failed: '+e.message);}
 }
 function setSectionConnection(key,connected){
  const r=selected(),row=r&&sectionRows(r).find(x=>x.key===key);
  if(!row||row.gap===!connected)return;
  update(route=>{
   const gaps=new Set(validGaps(route));
   if(connected)gaps.delete(key);else gaps.add(key);
   route.gaps=[...gaps];
  },true);
  selectedSection=key;
  status=connected?'Driving section reconnected. Recalculate roads.':'Driving section skipped. Endpoints are retained; Undo restores it.';
  render();
 }
 function clearEndpoint(role){
  const r=selected();if(!r||!['start','end'].includes(role)||!r[role])return;
  update(route=>{route[role]=null;},true);
  selectedSection='';
  status=(role==='start'?'Starting point':'Destination')+' removed. Stops remain. Undo restores it.';
  render();
 }
 function moveRoute(direction){
  const list=routes(),index=list.findIndex(r=>r.id===currentId),other=index+direction;
  if(index<0||other<0||other>=list.length)return;
  [list[index],list[other]]=[list[other],list[index]];
  list.forEach((r,i)=>r.routeOrder=i);
  config.persist();status='Route order saved.';render();
 }
 function applyRouteResult(route,result){
  route.polyline=result.polyline;route.distanceM=result.distanceM;route.durationS=result.durationS;
  route.legStats=result.legStats||[];
  route.segments=[{startIndex:0,endIndex:(route.waypoints||[]).length,polyline:result.polyline,distanceM:result.distanceM,durationS:result.durationS}];
 }
 async function generateAlternatives(){
  const r=selected(),key=root.LAZY_ACRES_GEOAPIFY_KEY;
  if(!r||busy)return;
  if(!key)return report('Geoapify routing is not configured.');
  if(!pointOK(r.start)||!pointOK(r.end)||(r.waypoints||[]).some(p=>!pointOK(p)))return report('Map the start, destination and each stop first.');
  if(validGaps(r).length)return report('Reconnect skipped driving sections to compare full routes.');
  if(routes().length>=MAX_ROUTES)return report('Maximum '+MAX_ROUTES+' saved routes per trip.');
  const originalId=r.id,signature=JSON.stringify({start:r.start,end:r.end,waypoints:r.waypoints,preferences:r.preferences,gaps:validGaps(r)});
  const prefs={...DEFAULT,...r.preferences},available=MAX_ROUTES-routes().length;
  const strategies=[prefs.strategy,...STRATEGIES.filter(x=>x!==prefs.strategy)];
  const candidates=strategies.map(strategy=>({strategy,avoidHighways:prefs.avoidHighways,label:STRATEGY_NAMES[strategy]}));
  if(!prefs.avoidHighways)candidates.push({strategy:'balanced',avoidHighways:true,label:'Avoid highways'});
  const choices=[];busy=true;status='Checking for genuinely different driving routes…';render();
  try{
   for(const candidate of candidates){
    if(choices.length>=Math.min(3,available+1))break;
    let result;
    if(candidate.strategy===prefs.strategy&&candidate.avoidHighways===prefs.avoidHighways&&r.polyline&&r.distanceM!=null&&r.durationS!=null){
     result={polyline:r.polyline,distanceM:r.distanceM,durationS:r.durationS,legStats:r.legStats||[]};
    }else{
     try{
      const request={...r,preferences:{...prefs,strategy:candidate.strategy,avoidHighways:candidate.avoidHighways}};
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
      let response;try{response=await fetch(routeURL(request,key),{signal:controller.signal});}finally{clearTimeout(timer);}
      if(!response.ok)throw Error(response.status===429?'Routing quota reached':'Routing HTTP '+response.status);
      result=parseRoute(await response.json());
     }catch(error){
      status='One routing preference was unavailable: '+error.message+'. Trying others…';render();continue;
     }
    }
    if(choices.some(x=>sameRoad(x.result.polyline,result.polyline)))continue;
    choices.push({candidate,result});
    status='Found '+choices.length+' distinct route'+(choices.length===1?'':'s')+'…';render();
   }
   const latest=selected();
   if(!latest||latest.id!==originalId||JSON.stringify({start:latest.start,end:latest.end,waypoints:latest.waypoints,preferences:latest.preferences,gaps:validGaps(latest)})!==signature)return report('Route changed during search. No alternatives saved.');
   if(!choices.length)return report('No drivable routes returned. The original remains unchanged.');
   const group=config.uid(),original=JSON.parse(JSON.stringify(r)),first=choices[0];
   undoStack.push(original);if(undoStack.length>25)undoStack.shift();
   r.preferences={...r.preferences,compareGroup:group,strategy:first.candidate.strategy,avoidHighways:first.candidate.avoidHighways};
   applyRouteResult(r,first.result);
   const order=Math.max(-1,...routes().map(x=>x.routeOrder||0));
   for(const [index,item] of choices.slice(1).entries()){
    const variant=JSON.parse(JSON.stringify(r));
    variant.id=config.uid();variant.routeOrder=order+index+1;
    variant.name=(original.name+' — '+item.candidate.label).slice(0,160);
    variant.preferences={...variant.preferences,compareGroup:group,strategy:item.candidate.strategy,avoidHighways:item.candidate.avoidHighways};
    applyRouteResult(variant,item.result);
    config.getRoutes().push(variant);
   }
   config.persist();selectedSection='';
   status=choices.length+' distinct route'+(choices.length===1?'':'s')+' ready. Select one, then drag its path to customize it.';
   render();fitMap();
  }finally{busy=false;render();}
 }
 async function calculate(){
  const r=selected(),key=root.LAZY_ACRES_GEOAPIFY_KEY;if(!r)return;
  if(!key)return report('Geoapify key is missing.');
  const invalid=windowError(r);if(invalid)return report(invalid);
  const rows=sectionRows(r),groups=[];let group=[];
  for(const leg of rows){
   if(leg.gap||!pointOK(leg.from)||!pointOK(leg.to)){
    if(group.length){groups.push(group);group=[];}
   }else group.push(leg);
  }
  if(group.length)groups.push(group);
  if(!groups.length){update(route=>{invalidate(route);route.gaps=validGaps(route);});return report('There are no connected, mapped driving sections to calculate.');}
  if(busy)return;busy=true;status='Calculating '+groups.length+' connected road section'+(groups.length===1?'':'s')+'…';render();
  const routeId=r.id,signature=JSON.stringify({start:r.start,end:r.end,waypoints:r.waypoints,preferences:r.preferences,gaps:validGaps(r)});
  try{
   const segments=[],stats=Array(rows.length).fill(null);let totalDistance=0,totalDuration=0;
   for(const [groupNumber,legs] of groups.entries()){
    const points=[legs[0].from,...legs.map(x=>x.to)];
    const subroute={...r,start:points[0],end:points[points.length-1],waypoints:points.slice(1,-1)};
    const url=routeURL(subroute,key),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    let response;try{response=await fetch(url,{signal:controller.signal});}finally{clearTimeout(timer);}
    if(!response.ok)throw Error(response.status===429?'Free API limit reached':'Routing HTTP '+response.status);
    const outcome=parseRoute(await response.json());
    // Some routing responses omit detailed leg statistics; retain the usable geometry and totals.
    const detailed=outcome.legStats.length===legs.length;
    segments.push({startIndex:legs[0].i,endIndex:legs[legs.length-1].i,polyline:outcome.polyline,distanceM:outcome.distanceM,durationS:outcome.durationS});
    legs.forEach((leg,i)=>{stats[leg.i]=detailed?outcome.legStats[i]:null;});
    totalDistance+=outcome.distanceM;totalDuration+=outcome.durationS;
    status='Calculated '+(groupNumber+1)+' of '+groups.length+' connected road groups.';render();
   }
   const latest=selected();if(!latest||latest.id!==routeId)return;
   if(JSON.stringify({start:latest.start,end:latest.end,waypoints:latest.waypoints,preferences:latest.preferences,gaps:validGaps(latest)})!==signature)return report('Road sections changed during calculation. Recalculate.');
   update(route=>{route.segments=segments;route.legStats=stats;route.polyline=groups.length===1&&groups[0].length===rows.length?segments[0].polyline:'';route.distanceM=totalDistance;route.durationS=totalDuration;});
   status='Connected roads calculated: '+summary(selected())+'. Removed sections remain disconnected.';render();fitMap();
  }catch(e){report(e.name==='AbortError'?'Routing request timed out.':'Routing failed: '+e.message);}
  finally{busy=false;render();}
 }
 function render(){
  if(!config.getTrip())return;
  selectDefault();
  $('exploreDiscoverPanel')?.classList.toggle('hidden',tool!=='discover');
  $('exploreRoutePanel')?.classList.toggle('hidden',tool!=='routes');
  for(const button of document.querySelectorAll('[data-explore-tool]')){
   button.classList.toggle('active',button.dataset.exploreTool===tool);
   button.setAttribute('aria-selected',String(button.dataset.exploreTool===tool));
  }
  const r=selected(),list=routes();
  $('routePicker').innerHTML=list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+
   (x.distanceM!=null?' · '+(x.distanceM/1609.344).toFixed(0)+' mi':'')+'</option>').join('');
  $('routePicker').value=currentId;
  $('routeMoveUp').disabled=!r||list[0]?.id===currentId;
  $('routeMoveDown').disabled=!r||list[list.length-1]?.id===currentId;
  $('routeComparison').innerHTML=list.length>1?'<details class="route-compare-details"><summary>Compare saved routes ('+list.length+')</summary>'+
   list.map(x=>'<div class="route-compare-row '+(x.id===currentId?'selected':'')+'"><button type="button" class="quiet small" data-route-select="'+esc(x.id)+'">'+esc(x.name)+'</button>'+
    '<span>'+esc(summary(x))+'</span></div>').join('')+'</details>':'';
  const group=r?.preferences?.compareGroup;
  const variants=group?list.filter(x=>x.preferences?.compareGroup===group):[];
  $('routeAlternativeChoices').innerHTML=variants.length?
   '<div class="route-variant-title"><strong>Route choices</strong><span>Select a route; its path remains editable.</span></div>'+
   variants.map((x,index)=>'<button type="button" class="route-variant-choice '+(x.id===currentId?'is-selected':'')+'" data-route-variant="'+esc(x.id)+'" aria-pressed="'+(x.id===currentId)+'">'+
   '<span class="route-variant-color" style="background:'+ROUTE_COLORS[index%ROUTE_COLORS.length]+'"></span><span><strong>'+esc(x.name)+'</strong><small>'+esc(summary(x))+'</small></span></button>').join(''):'';
  $('routeShowAlternatives').disabled=!r||variants.length<2;
  $('routeGenerateAlternatives').disabled=busy||!r||!pointOK(r.start)||!pointOK(r.end)||list.length>=MAX_ROUTES;
  $('routeEmpty').classList.toggle('hidden',!!r);
  $('routeControls').classList.toggle('hidden',!r);
  $('routeDelete').disabled=!r;
  $('routeAlternative').disabled=!r||list.length>=MAX_ROUTES;
  if(!r){$('routeEmpty').textContent=list.length?'Select a route.':'Create an outbound, return, or day-trip route.';draw();return;}
  for(const [id,value] of [['routeName',r.name],['routeStart',r.start?.label],['routeEnd',r.end?.label],
   ['routeStartDate',r.startDate],['routeStartTime',r.startTime],['routeEndDate',r.endDate],['routeEndTime',r.endTime]]){
   $(id).value=value||'';
  }
  const p={...DEFAULT,...r.preferences};$('routeStrategy').value=p.strategy;$('routeVehicle').value=p.mode;
  for(const [id,key] of [['routeAvoidHighways','avoidHighways'],['routeAvoidTolls','avoidTolls'],['routeAvoidFerries','avoidFerries']])$(id).checked=!!p[key];
  $('routeVisible').checked=r.visible!==false;
  $('routeKind').value=routeType(r);
  $('routeMetrics').textContent=summary(r);
  $('routeWaypointList').innerHTML=(r.waypoints||[]).map((p,i)=>'<div class="route-waypoint">'+
    '<span class="route-waypoint-name">'+(i+1)+'. '+esc(p.label)+' <small>'+esc(p.kind==='stop'?'Stop':'Road point')+'</small></span>'+
    '<div class="route-waypoint-actions"><button type="button" class="quiet small" data-route-move="'+i+':up" '+(i===0?'disabled':'')+'>↑</button>'+
    '<button type="button" class="quiet small" data-route-move="'+i+':down" '+(i===r.waypoints.length-1?'disabled':'')+'>↓</button>'+
    '<button type="button" class="quiet small" data-route-remove="'+i+'" aria-label="Remove waypoint">×</button></div></div>').join('')||
    '<p class="muted small-details">No road points or stops yet.</p>';
  const sectionList=sectionRows(r),skipped=sectionList.filter(x=>x.gap).length;
  if(selectedSection&&!sectionList.some(x=>x.key===selectedSection))selectedSection='';
  const activeRow=sectionList.find(x=>x.key===selectedSection);
  $('routeSectionSummary').textContent=sectionList.length+' section'+(sectionList.length===1?'':'s')+(skipped?' · '+skipped+' skipped':'');
  $('routeSectionRemove').disabled=!activeRow||activeRow.gap;
  $('routeSectionRestore').disabled=!activeRow||!activeRow.gap;
  $('routeSectionList').innerHTML=sectionList.map(({i,key,from,to,gap})=>'<div class="route-section '+(gap?'route-section-gap ':'')+(selectedSection===key?'route-section-selected':'')+'" data-section-key="'+esc(key)+'">'+
   '<button type="button" class="route-section-select" data-section-select="'+esc(key)+'" aria-pressed="'+(selectedSection===key)+'" aria-label="Select driving section '+(i+1)+'">'+
   '<strong>'+esc((i+1)+'. '+(from?.label||'Unmapped start')+' → '+(to?.label||'Unmapped destination'))+'</strong><small>'+esc(gap?'Skipped — not driven':(r.legStats?.[i]?summary(r.legStats[i]):'Driving section · recalculate for estimate'))+'</small></button>'+
   '<button type="button" class="quiet small route-section-action" data-section-toggle="'+esc(key)+'">'+(gap?'Reconnect':'Skip section')+'</button></div>').join('');
  $('routeLegMetrics').innerHTML=Array.isArray(r.legStats)&&r.legStats.length===r.waypoints.length+1?
    '<details class="route-leg-breakdown"><summary>Driving distance & time between points</summary>'+
    r.legStats.map((leg,i)=>{
     const from=i===0?r.start?.label:r.waypoints[i-1]?.label;
     const to=i===r.waypoints.length?r.end?.label:r.waypoints[i]?.label;
     return '<div class="route-leg-row"><span>'+esc(from||'Start')+' → '+esc(to||'End')+'</span>'+
       '<strong>'+esc(leg?summary({distanceM:leg.distanceM,durationS:leg.durationS}):'Not driven')+'</strong></div>';
    }).join('')+'</details>':'';
  const options=[...config.getPlaces().filter(pointOK).map(x=>({type:'places',id:x.id,label:'Idea: '+x.name})),
   ...config.getActivities().filter(pointOK).map(x=>({type:'activities',id:x.id,label:'Itinerary: '+x.title}))];
  const former=$('routeSourceStop').value;
  $('routeSourceStop').innerHTML='<option value="">Ideas / itinerary stops…</option>'+
   options.map(x=>'<option value="'+x.type+':'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');
  $('routeSourceStop').value=options.some(x=>x.type+':'+x.id===former)?former:'';
  for(const btn of document.querySelectorAll('[data-route-pick]')){
   btn.classList.toggle('active',pick===btn.dataset.routePick);
   btn.setAttribute('aria-pressed',String(pick===btn.dataset.routePick));
  }
  $('routeUndo').disabled=!undoStack.length;
  $('routeMoveUp').disabled=!r||list[0]?.id===currentId;
  $('routeMoveDown').disabled=!r||list[list.length-1]?.id===currentId;
  $('routeSuggest').disabled=busy||!pointOK(r.start)||!pointOK(r.end);
  $('routeStatus').textContent=status||'Save points, then calculate the route. Changes are shared via Supabase.';
  draw();
 }
 function setTool(next){tool=next==='routes'?'routes':'discover';if(tool!=='routes')pick='';config.onPickChange?.();render();}
 function onTripChange(){currentId='';undoStack=[];pick='';selectedSection='';status='';render();}
 function bind(){
  $('exploreToolTabs').addEventListener('click',e=>{const b=e.target.closest('[data-explore-tool]');if(b)setTool(b.dataset.exploreTool);});
  $('routeNew').addEventListener('click',()=>addRoute());
  $('routeAlternative').addEventListener('click',()=>addRoute(true));
  $('routeGenerateAlternatives').addEventListener('click',()=>void generateAlternatives());
  $('routeShowAlternatives').addEventListener('change',render);
  $('routeAlternativeChoices').addEventListener('click',e=>{
   const button=e.target.closest('[data-route-variant]');if(!button)return;
   currentId=button.dataset.routeVariant;undoStack=[];selectedSection='';pick='';
   status='Alternative selected. Drag its highlighted road path to customize it.';render();
  });
  $('routeDelete').addEventListener('click',removeRoute);
  $('routeUndo').addEventListener('click',undo);
  $('routeMoveUp').addEventListener('click',()=>moveRoute(-1));
  $('routeMoveDown').addEventListener('click',()=>moveRoute(1));
  $('routeKind').addEventListener('change',e=>{
   const type=e.target.value;
   if(!['day','journey','outbound','return'].includes(type))return;
   update(r=>{
    // Database permits only 'day' and 'journey'; outbound/return are journey directions.
    r.routeKind=type==='day'?'day':'journey';
    r.preferences={...r.preferences,journeyDirection:type==='outbound'||type==='return'?type:''};
   });
   render();
  });
  $('routeSectionList').addEventListener('click',e=>{
   const toggle=e.target.closest('[data-section-toggle]'),row=e.target.closest('[data-section-key]');
   if(!row)return;
   selectedSection=row.dataset.sectionKey;
   if(toggle)setSectionConnection(toggle.dataset.sectionToggle,toggle.textContent.trim()==='Reconnect');
   else render();
  });
  $('routeSectionRemove').addEventListener('click',()=>{if(selectedSection)setSectionConnection(selectedSection,false);});
  $('routeSectionRestore').addEventListener('click',()=>{if(selectedSection)setSectionConnection(selectedSection,true);});
  document.addEventListener('keydown',e=>{
   if(tool!=='routes'||!selectedSection||!selected()||!(e.key==='Delete'||e.key==='Backspace'))return;
   const focusSection=e.target.closest?.('[data-section-select]');
   if(e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
   if(e.target.closest?.('button')&&!focusSection)return;
   if(e.key==='Backspace'&&!focusSection)return;
   e.preventDefault();setSectionConnection(selectedSection,false);
  });
  $('routePicker').addEventListener('change',e=>{currentId=e.target.value;undoStack=[];pick='';selectedSection='';status='';render();});
  $('routeComparison').addEventListener('click',e=>{
   const b=e.target.closest('[data-route-select]');if(!b)return;
   currentId=b.dataset.routeSelect;undoStack=[];selectedSection='';pick='';status='';render();
  });
  $('routeName').addEventListener('change',e=>{const name=e.target.value.trim().slice(0,160);if(!name)return report('Route name required.');
   update(r=>r.name=name);status='Route renamed.';render();});
  for(const role of ['start','end']){
   $(role==='start'?'routeStart':'routeEnd').addEventListener('change',e=>{
    if(e.target.value.trim()===selected()?.[role]?.label)return;
    update(r=>{r[role]=e.target.value.trim()?{label:e.target.value.trim(),lat:null,lng:null}:null;},true);
    status='Use Find to locate this point on the map.';render();
   });
  }
  for(const [id,field] of [['routeStartDate','startDate'],['routeStartTime','startTime'],['routeEndDate','endDate'],['routeEndTime','endTime']]){
   $(id).addEventListener('change',e=>{
    const next={...selected(),[field]:e.target.value},invalid=windowError(next);
    if(invalid){report(invalid);render();return;}
    update(r=>{r[field]=e.target.value;});status='Schedule saved.';render();
   });
  }
  for(const [id,key] of [['routeAvoidHighways','avoidHighways'],['routeAvoidTolls','avoidTolls'],['routeAvoidFerries','avoidFerries']]){
   $(id).addEventListener('change',e=>{update(r=>{r.preferences={...DEFAULT,...r.preferences,[key]:e.target.checked};},true);
    status='Preferences saved. Recalculate to apply.';render();});
  }
  for(const [id,key,allowed] of [['routeStrategy','strategy',STRATEGIES],['routeVehicle','mode',MODES]]){
   $(id).addEventListener('change',e=>{if(!allowed.includes(e.target.value))return;
    update(r=>{r.preferences={...DEFAULT,...r.preferences,[key]:e.target.value};},true);
    status='Route preference saved. Recalculate to apply.';render();});
  }
  $('routeVisible').addEventListener('change',e=>{update(r=>{r.visible=e.target.checked;});status='Visibility saved.';render();});
  $('routeSuggest').addEventListener('click',()=>void calculate());
  $('routeZoom').addEventListener('click',fitMap);
  $('routeSourceAdd').addEventListener('click',addExisting);
  $('routeFromItinerary').addEventListener('click',()=>{
   const selectedRoute=selected();if(!selectedRoute)return;
   if(!selectedRoute.startDate)return report('Select a route start day to import its itinerary stops.');
   const existing=new Set((selectedRoute.waypoints||[]).filter(p=>p.sourceType==='activities').map(p=>p.sourceId));
   const planned=config.getActivities().filter(x=>x.date===selectedRoute.startDate&&pointOK(x)&&!existing.has(x.id))
    .sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
   if(!planned.length)return report('No new mapped itinerary activities on this day.');
   if(planned.length+(selectedRoute.waypoints||[]).length>MAX_WAYPOINTS)
    return report('Route limit is '+MAX_WAYPOINTS+' intermediate stops. Remove road points or split into another day route.');
   update(route=>{route.waypoints.push(...planned.map(x=>({
    id:config.uid(),lat:Number(x.lat),lng:Number(x.lng),label:x.title,kind:'stop',
    sourceType:'activities',sourceId:x.id
   })));},true);
   status='Added '+planned.length+' itinerary stop(s) in scheduled-time order. Dates and times are unchanged; recalculate roads.';
   render();
  });
  $('routeControls').addEventListener('click',e=>{
   const picker=e.target.closest('[data-route-pick]'),lookup=e.target.closest('[data-route-geocode]'),clear=e.target.closest('[data-route-clear]');
   if(picker)setPick(picker.dataset.routePick);
   else if(lookup)void geocode(lookup.dataset.routeGeocode);
   else if(clear)clearEndpoint(clear.dataset.routeClear);
  });
  $('routeWaypointList').addEventListener('click',e=>{
   const move=e.target.closest('[data-route-move]'),rm=e.target.closest('[data-route-remove]');
   if(move){const [index,dir]=move.dataset.routeMove.split(':'),i=Number(index),dest=dir==='up'?i-1:i+1;
    if(dest<0||dest>=selected().waypoints.length)return;
    update(r=>{const [p]=r.waypoints.splice(i,1);r.waypoints.splice(dest,0,p);},true);
    status='Point order changed. Recalculate route.';render();
   }else if(rm){const idx=Number(rm.dataset.routeRemove);
    if(idx<0||idx>=selected().waypoints.length)return;
    update(r=>r.waypoints.splice(idx,1),true);status='Point removed. Recalculate route.';render();}
  });
 }
 bind();
 return {attachMap,render,onTripChange,consumeMapClick,cancelPick,isPicking:()=>!!pick,getPick:()=>pick,setTool};
}
root.VacationRouteDomain=Object.freeze({newRoute,decodePolyline,routeURL,parseRoute,windowError,summary,pointOK,sectionGeometry});
root.createVacationRoutes=createController;
})(window);
