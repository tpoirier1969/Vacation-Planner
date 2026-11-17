/* Routes: a dedicated controller for shared named driving routes and map waypoints.
   The only durable storage is cloud.js / vacation_routes. */
(function(root){'use strict';
const MAX_WAYPOINTS=16,MAX_ROUTES=40;
const DEFAULT={strategy:'balanced',mode:'drive',avoidHighways:false,avoidTolls:false,avoidFerries:false};
const STRATEGIES=['balanced','short','less_maneuvers'],MODES=['drive','light_truck'];
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
function routeType(r){
 if(r?.routeKind==='day')return 'day';
 const direction=r?.preferences?.journeyDirection;
 return direction==='outbound'||direction==='return'?direction:'journey';
}
function createController(config){
 const $=id=>document.getElementById(id);
 let currentId='',tool='discover',pick='',map=null,layer=null,undoStack=[],busy=false,status='';
 const routes=()=>{const t=config.getTrip();return t?(config.getRoutes()||[]).filter(r=>r.tripId===t.id).sort((a,b)=>(a.routeOrder||0)-(b.routeOrder||0)):[];};
 const routePoints=r=>[r.start,...(r.waypoints||[]),r.end];
 const sectionKey=(points,i)=>String(i===0?'start':points[i].id||'point-'+i)+'>'+String(i===points.length-2?'end':points[i+1].id||'point-'+(i+1));
 const validGaps=r=>{const points=routePoints(r),keys=new Set(points.slice(0,-1).map((_,i)=>sectionKey(points,i)));return (r.gaps||[]).filter(k=>keys.has(k));};
 const sectionRows=r=>{const p=routePoints(r),gaps=new Set(validGaps(r));return p.slice(0,-1).map((from,i)=>({i,key:sectionKey(p,i),from,to:p[i+1],gap:gaps.has(sectionKey(p,i))}));};
 let selectedSection='';
 const selected=()=>routes().find(r=>r.id===currentId)||null;
 const report=msg=>{status=msg;if($('routeStatus'))$('routeStatus').textContent=msg;};
 function selectDefault(){if(!routes().some(r=>r.id===currentId)){currentId=routes()[0]?.id||'';undoStack=[];}}
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
 function draw(){
  if(!layer)return;layer.clearLayers();
  const r=selected();if(!r||r.visible===false)return;
  const geometries=(r.segments||[]).length?r.segments:(r.polyline&&!validGaps(r).length?[{polyline:r.polyline,startIndex:0}]:[]);
  for(const segment of geometries){const coords=decodePolyline(segment.polyline);
   if(coords.length>1){const line=L.polyline(coords,{color:'#b45237',weight:5,opacity:.88,interactive:true}).addTo(layer);
    line.on('click',()=>{selectedSection=sectionRows(r)[segment.startIndex||0]?.key||'';render();$('routeSectionList')?.scrollIntoView({behavior:'smooth',block:'nearest'});});}
  }
  for(const [name,p,color] of [['Start',r.start,'#28766f'],['End',r.end,'#b45237']]){
   if(pointOK(p))L.circleMarker([p.lat,p.lng],{radius:7,color,fillColor:color,fillOpacity:0.8})
    .bindTooltip(name+': '+p.label).addTo(layer);
  }
  for(const [i,p] of (r.waypoints||[]).entries()){
   if(pointOK(p))L.circleMarker([p.lat,p.lng],{radius:5,color:'#b08b47',fillColor:'#edc376',fillOpacity:0.9})
    .bindTooltip((i+1)+'. '+p.label).addTo(layer);
  }
 }
 function attachMap(next){
  if(next!==map){if(layer&&map)map.removeLayer(layer);map=next;layer=map?L.layerGroup().addTo(map):null;}
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
  config.getRoutes().push(r);currentId=r.id;undoStack=[];pick='';status=copy?'Saved separate alternative. Recalculate to compare.':'Add start and end points to begin.';
  config.persist();
 }
 function removeRoute(){
  const r=selected();if(!r||!confirm('Delete the saved route "'+r.name+'"?'))return;
  const list=config.getRoutes(),i=list.findIndex(x=>x.id===r.id);if(i>=0)list.splice(i,1);
  currentId='';undoStack=[];pick='';config.persist();
 }
 function undo(){
  const r=selected(),old=undoStack.pop();if(!r||!old)return;
  for(const k of Object.keys(r))delete r[k];
  Object.assign(r,old);status='Last edit undone.';config.persist();
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
 function toggleSection(key){
  const r=selected(),row=r&&sectionRows(r).find(x=>x.key===key);if(!row)return;
  update(route=>{const gaps=new Set(validGaps(route));if(gaps.has(key))gaps.delete(key);else gaps.add(key);route.gaps=[...gaps];},true);
  selectedSection=key;status=row.gap?'Driving section reconnected. Recalculate roads.':'Driving section removed; its endpoints are retained. Recalculate remaining roads.';render();
 }
 function moveRoute(direction){
  const list=routes(),index=list.findIndex(r=>r.id===currentId),other=index+direction;
  if(index<0||other<0||other>=list.length)return;
  [list[index],list[other]]=[list[other],list[index]];
  list.forEach((r,i)=>r.routeOrder=i);
  config.persist();status='Route order saved.';render();
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
  $('routeSectionList').innerHTML=sectionRows(r).map(({i,key,from,to,gap})=>'<div class="route-leg-row route-section '+(gap?'route-section-gap ':'')+(selectedSection===key?'route-section-selected':'')+'" data-section-key="'+esc(key)+'" tabindex="0" role="group" aria-label="Driving section '+(i+1)+'">'+
    '<span><strong>'+esc((i+1)+'. '+(from?.label||'Unmapped start')+' → '+(to?.label||'Unmapped destination'))+'</strong><small>'+esc(gap?'Not driving this section':(r.legStats?.[i]?summary(r.legStats[i]):'Recalculate for road estimate'))+'</small></span>'+
    '<button type="button" class="quiet small" data-section-toggle="'+esc(key)+'">'+(gap?'Reconnect':'Remove section')+'</button></div>').join('');
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
  $('routeSectionList').addEventListener('click',e=>{const toggle=e.target.closest('[data-section-toggle]'),row=e.target.closest('[data-section-key]');if(row)selectedSection=row.dataset.sectionKey;if(toggle)toggleSection(toggle.dataset.sectionToggle);else render();});
  $('routeSectionList').addEventListener('focusin',e=>{const row=e.target.closest('[data-section-key]');if(row)selectedSection=row.dataset.sectionKey;});
  document.addEventListener('keydown',e=>{if(tool!=='routes'||!selectedSection||!selected()||e.key!=='Delete'||e.target.closest('input,textarea,select,[contenteditable=true],button'))return;e.preventDefault();toggleSection(selectedSection);});
  $('routePicker').addEventListener('change',e=>{currentId=e.target.value;undoStack=[];pick='';selectedSection='';status='';render();});
  $('routeComparison').addEventListener('click',e=>{
   const b=e.target.closest('[data-route-select]');if(!b)return;
   currentId=b.dataset.routeSelect;undoStack=[];pick='';status='';render();
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
  $('routeControls').addEventListener('click',e=>{
   const picker=e.target.closest('[data-route-pick]'),lookup=e.target.closest('[data-route-geocode]');
   if(picker)setPick(picker.dataset.routePick);
   else if(lookup)void geocode(lookup.dataset.routeGeocode);
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
root.VacationRouteDomain=Object.freeze({newRoute,decodePolyline,routeURL,parseRoute,windowError,summary,pointOK});
root.createVacationRoutes=createController;
})(window);
