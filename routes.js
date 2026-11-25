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
// Resample by travelled distance so matching roads aren't treated as different
// merely because one response contains a denser polyline.
function samplesByDistance(polyline,count=18){
 const coords=decodePolyline(polyline);
 if(coords.length<2)return [];
 const accumulated=[0];
 for(let i=1;i<coords.length;i++){
  const p=coords[i-1],q=coords[i],scale=Math.cos((p[0]+q[0])/2*Math.PI/180);
  accumulated.push(accumulated[i-1]+Math.hypot(q[0]-p[0],(q[1]-p[1])*scale));
 }
 const total=accumulated[accumulated.length-1];
 if(total<=0)return [];
 const out=[];let cursor=1;
 for(let i=0;i<=count;i++){
  const target=total*i/count;
  while(cursor<accumulated.length-1&&accumulated[cursor]<target)cursor++;
  const a=accumulated[cursor-1],b=accumulated[cursor],t=b>a?(target-a)/(b-a):0;
  const p=coords[cursor-1],q=coords[cursor];
  out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
 }
 return out;
}
// Use saved calculated road geometry. Disconnected sections remain separate.
function routeDiscoveryGeometry(route){
 const segments=Array.isArray(route?.segments)?route.segments.filter(x=>typeof x.polyline==='string'&&x.polyline):[];
 const strings=segments.length?segments.map(x=>x.polyline):route?.polyline?[route.polyline]:[];
 const lines=strings.map(decodePolyline).filter(x=>x.length>=2);
 if(!lines.length)return null;
 if(lines.length===1&&strings[0].length<90000)
  return {filter:{type:'polyline',geometry:strings[0],encoding:'polyline5'},lines};
 const count=lines.reduce((n,line)=>n+line.length,0),stride=Math.max(1,Math.ceil(count/2500));
 const coordinates=lines.map(line=>line.filter((_,i)=>i===0||i===line.length-1||i%stride===0)
  .map(point=>[Number(point[1].toFixed(6)),Number(point[0].toFixed(6))]));
 return {filter:{type:'polyline',geometry:{type:'MultiLineString',coordinates}},lines};
}
// Find a few kilometers of the original road around a candidate. Two routing
// requests then measure the extra time for a visit compared with no visit.
function nearestRoadWindow(route,place){
 const geometry=routeDiscoveryGeometry(route);
 if(!geometry||!pointOK(place))return null;
 let best=null;
 for(const line of geometry.lines)for(let i=0;i<line.length;i++){
  const point={lat:line[i][0],lng:line[i][1]};
  const distance=straightLineMiles(point,place);
  if(!best||distance<best.distance)best={line,index:i,distance};
 }
 if(!best)return null;
 const line=best.line;let from=best.index,to=best.index,back=0,ahead=0;
 const at=i=>({lat:line[i][0],lng:line[i][1]});
 while(from>0&&back<1.5){back+=straightLineMiles(at(from),at(from-1));from--;}
 while(to<line.length-1&&ahead<1.5){ahead+=straightLineMiles(at(to),at(to+1));to++;}
 if(from===to){from=0;to=line.length-1;}
 if(from===to||straightLineMiles(at(from),at(to))<0.005)return null;
 return {start:at(from),end:at(to),distanceMiles:best.distance};
}
function sameRoad(a,b){
 const x=samplesByDistance(a),y=samplesByDistance(b);
 if(!x.length||x.length!==y.length)return false;
 let different=0;
 for(let i=1;i<x.length-1;i++){
  const p=x[i],q=y[i],scale=Math.cos(p[0]*Math.PI/180);
  if(Math.hypot(p[0]-q[0],(p[1]-q[1])*scale)>0.015)different++;
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
// Route suggestions are ephemeral until accepted. Preserve scheduled appointment
// order and compare flexible stops with a geographic nearest-neighbour sequence.
function straightLineMiles(a,b){
 const lat1=Number(a.lat)*Math.PI/180,lat2=Number(b.lat)*Math.PI/180;
 const dLat=lat2-lat1,dLng=(Number(b.lng)-Number(a.lng))*Math.PI/180;
 const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
 return 3958.7613*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function candidateDistance(items){
 return items.slice(1).reduce((sum,item,i)=>sum+straightLineMiles(items[i],item),0);
}
function nearestSequence(items,start){
 const remaining=items.slice(),ordered=[];let anchor=start;
 while(remaining.length){
  let best=0,min=Infinity;
  for(let i=0;i<remaining.length;i++){
   const distance=anchor?straightLineMiles(anchor,remaining[i]):0;
   if(distance<min||(distance===min&&String(remaining[i].title).localeCompare(String(remaining[best].title))<0)){min=distance;best=i;}
  }
  const next=remaining.splice(best,1)[0];ordered.push(next);anchor=next;
 }
 return ordered;
}
// Propose geographically sensible insertions without moving dated appointments.
// Use direct-distance as a ranking heuristic only: the real road lookup and
// visit/opening-hour constraints are evaluated separately and remain provisional.
function insertFlexibleBetweenAppointments(timed,flexible){
 if(!timed.length)return nearestSequence(flexible);
 let ordered=timed.slice();
 for(const stop of flexible){
  let best=null;
  for(let index=1;index<=ordered.length;index++){
   const proposal=[...ordered.slice(0,index),stop,...ordered.slice(index)];
   const prev=ordered[index-1],next=ordered[index]||null;
   // Exclude only inter-appointment insertions that are impossible even at
   // an optimistic 70 mph straight-line speed, with zero visit time.
   // This is a lower bound, NEVER a drive-time or hours-of-business estimate.
   if(next){
    const before=proposal.slice(0,index).reverse().find(x=>minutesOfDay(x.time)!==null);
    const after=proposal.slice(index+1).find(x=>minutesOfDay(x.time)!==null);
    if(before&&after){
     const depart=minutesOfDay(before.endTime)??minutesOfDay(before.time);
     const arrive=minutesOfDay(after.time);
     if(depart!==null&&arrive!==null){
      const from=proposal.indexOf(before),to=proposal.indexOf(after);
      const directMinutes=candidateDistance(proposal.slice(from,to+1))/70*60;
      if(arrive<depart||depart+directMinutes>arrive)continue;
     }
    }
   }
   const extra=straightLineMiles(prev,stop)+
    (next?straightLineMiles(stop,next)-straightLineMiles(prev,next):0);
   if(!best||extra<best.extra-1e-8||
      (Math.abs(extra-best.extra)<1e-8&&index<best.index))best={index,extra,proposal};
  }
  if(best)ordered=best.proposal;
  else ordered.push(stop);
 }
 return ordered;
}
// Read-only daily plan. 70 mph direct-line travel is only an optimistic
// lower bound; Geoapify road-leg checks are essential before committing.
function tentativeDayTimeline(stops,day,settings={}){
 const start=minutesOfDay(settings.dayStart||'09:00'),end=minutesOfDay(settings.dayEnd||'21:00');
 const n=Number(settings.estimatedVisitMinutes),visit=Number.isFinite(n)&&n>=0&&n<=480?Math.round(n):0;
 if(start===null||end===null||end<=start)return {valid:false,issues:['Day end must be after day start.'],slots:[],waitMinutes:0};
 let clock=start,last=null,waitMinutes=0;
 const issues=[],slots=[];
 for(const stop of stops){
  const roadLower=last?Math.ceil(straightLineMiles(last,stop)*60/70):0;
  let arrival=clock+roadLower,at=arrival;
  const fixed=minutesOfDay(stop.time),explicitEnd=minutesOfDay(stop.endTime);
  if(fixed!==null){
   if(arrival>fixed)issues.push(stop.title+' cannot be reached by '+stop.time+' even with optimistic travel.');
   if(fixed<start||fixed>end)issues.push(stop.title+' is outside this day’s planning window.');
   at=fixed;
  }
  const windows=simpleOpeningWindows(stop.hours,day);
  if(windows!==null){
   if(!windows.length)issues.push(stop.title+' is listed closed on this day.');
   else if(fixed===null){
    const available=windows.find(w=>Math.max(at,w.start)+visit<=w.end&&at<=w.end);
    if(!available)issues.push(stop.title+' will not fit its listed opening hours.');
    else{waitMinutes+=Math.max(0,available.start-at);at=Math.max(at,available.start);}
   }else if(!windows.some(w=>at>=w.start&&at<w.end&&(explicitEnd===null||explicitEnd<=w.end)))
    issues.push(stop.title+' is outside its listed opening hours.');
  }
  const departure=fixed!==null&&explicitEnd!==null?explicitEnd:at+visit;
  if(departure<at)issues.push(stop.title+' ends before its start time.');
  if(departure>end)issues.push(stop.title+' exceeds the day end time.');
  slots.push({id:stop.id,start:clockText(at),end:clockText(departure),title:stop.title});
  clock=Math.max(at,departure);last=stop;
 }
 return {valid:!issues.length,issues,slots,waitMinutes,unknownDuration:visit===0};
}
function smartDailyItinerary(activities,day,settings={}){
 const mapped=(activities||[]).filter(x=>x.date===day&&pointOK(x));
 const timed=mapped.filter(x=>minutesOfDay(x.time)!==null).sort((a,b)=>
  a.time.localeCompare(b.time)||String(a.id).localeCompare(String(b.id)));
 const flexible=mapped.filter(x=>minutesOfDay(x.time)===null).sort((a,b)=>
  Number(!!b.mustDo)-Number(!!a.mustDo)||Number(!!b.hours)-Number(!!a.hours)||
  String(a.title).localeCompare(String(b.title)));
 let planned=timed.slice();const unplaced=[];
 for(const stop of flexible){
  let best=null;
  for(let i=0;i<=planned.length;i++){
   const list=[...planned.slice(0,i),stop,...planned.slice(i)],times=tentativeDayTimeline(list,day,settings);
   if(!times.valid)continue;
   const extra=candidateDistance(list)-candidateDistance(planned),score=extra+times.waitMinutes/120;
   if(!best||score<best.score-1e-7||(Math.abs(score-best.score)<1e-7&&i<best.index))
    best={score,index:i,list};
  }
  if(best)planned=best.list;
  else unplaced.push(stop.title);
 }
 const schedule=tentativeDayTimeline(planned,day,settings);
 return {label:'Tentative daily schedule',stops:planned,ids:planned.map(x=>x.id),
  directMiles:candidateDistance(planned),slots:schedule.slots,unplaced,
  planningIssues:schedule.issues,
  note:'Times assume optimistic 70 mph straight-line travel, not road driving. Unknown visit lengths and complex hours require review.'};
}
function suggestItineraryRoutes(activities,day,settings={}){
 const all=(activities||[]).filter(x=>x.date===day);
 const eligible=all.filter(pointOK);
 if(eligible.length<2)return {day,options:[],excluded:all.length-eligible.length,reason:'At least two mapped itinerary stops are needed for this day.'};
 if(eligible.length>MAX_WAYPOINTS+2)return {day,options:[],excluded:all.length-eligible.length,reason:'A day route supports up to '+(MAX_WAYPOINTS+2)+' locations. Split this day into two routes.'};
 const byTime=(a,b)=>String(a.time||'').localeCompare(String(b.time||''))||String(a.id).localeCompare(String(b.id));
 const timed=eligible.filter(x=>/^\d{2}:\d{2}/.test(x.time||'')).sort(byTime);
 const flexible=eligible.filter(x=>!/^\d{2}:\d{2}/.test(x.time||'')).sort((a,b)=>String(a.title).localeCompare(String(b.title)));
 const schedules=[{label:'Scheduled order',stops:[...timed,...flexible]}];
 if(flexible.length&&timed.length>1){
  const interleaved=insertFlexibleBetweenAppointments(timed,flexible);
  if(interleaved.map(x=>x.id).join('|')!==schedules[0].stops.map(x=>x.id).join('|'))
   schedules.push({label:'Flexible stops between appointments (tentative)',stops:interleaved});
 }
 if(schedules.length===1&&flexible.length>1){
  const nearby=nearestSequence(flexible,timed[timed.length-1]);
  const alternate=[...timed,...nearby];
  if(alternate.map(x=>x.id).join('|')!==schedules[0].stops.map(x=>x.id).join('|'))
   schedules.push({label:'Nearby flexible stops',stops:alternate});
 }
 const options=schedules.map(s=>({...s,directMiles:candidateDistance(s.stops),ids:s.stops.map(x=>x.id)}));
 if(settings.smart&&flexible.length){
  const smart=smartDailyItinerary(activities,day,settings);
  if(smart.stops.length>=2)options.push(smart);
 }
 return {day,excluded:all.length-eligible.length,untimed:flexible.length,options};
}

// Read-only, trip-wide itinerary coverage. Distances are between listed stops
// on a single day, never road distances or travel between overnight locations.
function itineraryTripOverview(activities){
 const all=Array.isArray(activities)?activities:[];
 const days=[...new Set(all.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')).map(x=>x.date))].sort();
 return days.map(day=>{
  const records=all.filter(x=>x.date===day),mapped=records.filter(pointOK);
  const proposal=suggestItineraryRoutes(all,day);
  const best=proposal.options.length?proposal.options.reduce((a,b)=>a.directMiles<=b.directMiles?a:b):null;
  return {day,total:records.length,mapped:mapped.length,unmapped:records.length-mapped.length,
   timed:records.filter(x=>minutesOfDay(x.time)!==null).length,
   flexible:records.filter(x=>minutesOfDay(x.time)===null).length,
   routeable:!!best,bestDirectMiles:best?.directMiles??null,reason:proposal.reason||''};
 });
}

// Exact road leg durations come only from the routing service. An entry
// without an end time is treated as departing at its start time: a lower-bound
// feasibility check, not a promise that the itinerary will fit.
function minutesOfDay(value){
 const v=String(value||'');
 return /^([01]\d|2[0-3]):[0-5]\d/.test(v)?Number(v.slice(0,2))*60+Number(v.slice(3,5)):null;
}
// Only simple day/time OSM listings are interpreted. Complex opening_hours
// including holidays, overnight spans and conditions remain unknown.
function simpleOpeningWindows(hours,day){
 const raw=String(hours||'').trim();
 if(!raw||!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))return null;
 if(raw==='24/7')return [{start:0,end:1440}];
 const days=['Su','Mo','Tu','We','Th','Fr','Sa'],weekday=new Date(day+'T12:00:00Z').getUTCDay();
 if(!Number.isInteger(weekday))return null;
 const windows=[];let closed=false;
 for(const part of raw.split(';')){
  const segment=part.trim();
  const m=segment.match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?(?:,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*\s+)?((?:[0-2]\d:[0-5]\d-[0-2]\d:[0-5]\d)(?:,\s*(?:[0-2]\d:[0-5]\d-[0-2]\d:[0-5]\d))*|off)$/);
  if(!m)return null;
  const detail=m[3],selector=segment.slice(0,segment.length-detail.length).trim();
  const rules=selector?selector.split(',').map(x=>x.trim()):['Mo-Su'];
  const selected=rules.some(rule=>{
   const [one,two]=rule.split('-'),a=days.indexOf(one),b=days.indexOf(two||one);
   return a<=b?weekday>=a&&weekday<=b:weekday>=a||weekday<=b;
  });
  if(detail==='off'){if(selected)closed=true;continue;}
  for(const range of detail.split(',')){
   const [a,b]=range.trim().split('-');
   const start=minutesOfDay(a),end=b==='24:00'?1440:minutesOfDay(b);
   if(start===null||end===null||end<=start)return null;
   if(selected)windows.push({start,end});
  }
 }
 if(closed&&windows.length)return null;
 return closed?[]:windows.sort((a,b)=>a.start-b.start);
}
function clockText(m){
 return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(Math.ceil(m%60)).padStart(2,'0');
}
function itineraryDrivingAssessment(stops,legs,settings={}){
 const valid=Array.isArray(legs)&&legs.length===stops.length-1&&
  legs.every(x=>x&&Number.isFinite(Number(x.durationS))&&Number(x.durationS)>=0);
 if(!valid)return {checked:false,issues:[],notes:[],message:'Road mileage is available, but stop-by-stop driving times were not provided. Schedule conflicts could not be checked.'};
 const estimate=Number(settings.estimatedVisitMinutes);
 const assumed=Number.isFinite(estimate)&&estimate>0&&estimate<=480?Math.round(estimate):0;
 const day=settings.day||stops.find(x=>x?.date)?.date||'';
 const issues=[],notes=[],uncertainIntervals=[],drive=i=>Math.ceil(Number(legs[i].durationS)/60);
 let previousTimed=-1;
 for(let i=0;i<stops.length;i++){
  const appointment=minutesOfDay(stops[i].time);
  if(appointment===null)continue;
  if(previousTimed>=0){
   const from=stops[previousTimed],to=stops[i],end=minutesOfDay(from.endTime),start=minutesOfDay(from.time);
   const departure=end??(start===null?null:start+assumed);
   const travel=legs.slice(previousTimed,i).reduce((sum,_,j)=>sum+drive(previousTimed+j),0);
   const via=i-previousTimed-1;
   if(via&&!assumed)uncertainIntervals.push(via);
   const arrival=departure===null?null:departure+travel+via*assumed;
   if(arrival!==null&&arrival>appointment)
    issues.push('Driving from '+from.title+' to '+to.title+(via?' via '+via+' flexible stop(s)':'')+
     ' would arrive at least '+(arrival-appointment)+' min after '+to.time+
     (assumed?' under the '+assumed+'-minute visit assumption':'')+'.');
  }
  previousTimed=i;
 }
 // Carry the earliest known clock through explicit visit times, estimated
 // visits and necessary waits for supported business-hour schedules.
 let clock=null,waited=false,unparsedHours=0;
 for(let i=0;i<stops.length;i++){
  const item=stops[i],scheduled=minutesOfDay(item.time),end=minutesOfDay(item.endTime);
  if(i&&clock!==null)clock+=drive(i-1);
  if(scheduled!==null&&clock!==null&&clock>scheduled&&waited)
   issues.push(item.title+' may be reached '+(clock-scheduled)+' min after '+item.time+' after waiting for opening hours.');
  if(scheduled!==null){clock=scheduled;waited=false;}
  const windows=simpleOpeningWindows(item.hours,day);
  if(item.hours&&windows===null)unparsedHours++;
  if(windows!==null){
   if(!windows.length)issues.push(item.title+' is listed closed on '+day+'.');
   else if(clock!==null){
    if(scheduled!==null){
     if(!windows.some(w=>clock>=w.start&&clock<w.end&&(end===null||end<=w.end)))
      issues.push(item.title+' is scheduled outside its listed hours ('+item.time+(item.endTime?'–'+item.endTime:'')+').');
    }else{
     const slot=windows.find(w=>clock<=w.end&&Math.max(clock,w.start)+assumed<=w.end);
     if(!slot)issues.push(item.title+' may be closed before the estimated visit can fit.');
     else if(clock<slot.start){
      notes.push(item.title+' opens at '+clockText(slot.start)+'; allow '+(slot.start-clock)+' min to wait.');
      clock=slot.start;waited=true;
     }
    }
   }
  }
  if(scheduled!==null&&end!==null)clock=end;
  else if(clock!==null)clock+=assumed;
 }
 let message=issues.length?issues.length+' possible scheduling conflict(s).':
  (assumed?'No travel/visit-time conflicts detected under the '+assumed+'-minute estimate.':
   'No driving-only travel-time conflicts detected between timed appointments.');
 if(uncertainIntervals.length)message+=' '+uncertainIntervals.length+' interval(s) include flexible stops; their visit durations are unknown.';
 if(unparsedHours)message+=' '+unparsedHours+' opening-hours entry/entries could not be interpreted.';
 message+=' Provisional only: parking, traffic, missing/holiday opening hours and actual visit durations require review.';
 return {checked:true,issues,notes,uncertainIntervals,unparsedHours,message};
}
function itinerarySnapshot(activities,day){
 return JSON.stringify((activities||[]).filter(x=>x.date===day)
  .map(x=>({id:x.id,title:x.title,date:x.date,time:x.time||'',endTime:x.endTime||'',hours:x.hours||'',lat:x.lat,lng:x.lng}))
  .sort((a,b)=>String(a.id).localeCompare(String(b.id))));
}

function createController(config){
 const $=id=>document.getElementById(id);
 let currentId='',tool='discover',pick='',map=null,layer=null,undoStack=[],busy=false,status='';
 let suggestedDay='',itinerarySuggestions=null,itineraryPreviewBusy=false,itineraryPreviewRequest=0;
 let dragHandle=null,dragHandleLeg=-1,dragHandleRoute='',directDrag=null;
 const routes=()=>{const t=config.getTrip();return t?(config.getRoutes()||[]).filter(r=>r.tripId===t.id).sort((a,b)=>(a.routeOrder||0)-(b.routeOrder||0)):[];};
 const routePoints=r=>[r.start,...(r.waypoints||[]),r.end];
 const sectionKey=(points,i)=>String(i===0?'start':points[i].id||'point-'+i)+'>'+String(i===points.length-2?'end':points[i+1].id||'point-'+(i+1));
 const validGaps=r=>{const points=routePoints(r),keys=new Set(points.slice(0,-1).map((_,i)=>sectionKey(points,i)));return (r.gaps||[]).filter(k=>keys.has(k));};
 const sectionRows=r=>{const p=routePoints(r),gaps=new Set(validGaps(r));return p.slice(0,-1).map((from,i)=>({i,key:sectionKey(p,i),from,to:p[i+1],gap:gaps.has(sectionKey(p,i))}));};
 let selectedSection='',hitSections=[];
 let editEnabled=false;
 const editing=()=>tool==='routes'&&editEnabled;
 function setEdit(value){editEnabled=!!value;$('routeEditMode').checked=editEnabled;if(!editEnabled){pick='';selectedSection='';if(directDrag&&map){map.off('mousemove',directDrag.move);map.off('mouseup',directDrag.finish);map.dragging?.enable?.();directDrag=null;}}config.onPickChange?.();render();}
 function matchesFilter(r){
  const day=$('routeMapDay').value,from=$('routeMapFrom').value,to=$('routeMapTo').value;
  if(!day){if(!from&&!to)return true;if(!r.startTime&&!r.endTime)return true;if(r.startDate&&r.endDate&&r.startDate!==r.endDate)return true;return !(from&&r.endTime&&r.endTime<from||to&&r.startTime&&r.startTime>to);}
  if(!r.startDate&&!r.endDate)return day==='undated';
  if(day==='undated')return false;
  const start=r.startDate||r.endDate,end=r.endDate||start;
  if(day<start||day>end)return false;
  return !(from&&day===end&&r.endTime&&r.endTime<from||to&&day===start&&r.startTime&&r.startTime>to);
 }
 function visibleRoutes(){
  const list=routes().filter(r=>r.visible!==false&&matchesFilter(r));
  if(editing()&&!$('routeMapDay').value&&!$('routeMapFrom').value&&!$('routeMapTo').value)return comparedRoutes().filter(r=>r.visible!==false);
  return list;
 }
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
  return options.slice(0,3);
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
  if(rows[leg]?.key!==selectedSection)return report('Select the driving section first.');
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
 function chooseSection(route,row){
  if(currentId!==route.id){currentId=route.id;undoStack=[];}
  selectedSection=row.key;pick='';status='Editing section '+(row.i+1)+': '+(row.from?.label||'Start')+' → '+(row.to?.label||'End');
  map.closePopup();render();
 }
 function selectNear(p){
  if(!editing()||pick||busy||!map)return false;
  const at=map.latLngToContainerPoint(p),matches=new Map();
  for(const hit of hitSections){
   const points=hit.part.map(q=>map.latLngToContainerPoint(q));
   if(points.some((q,i)=>i>0&&L.LineUtil.pointToSegmentDistance(at,points[i-1],q)<=15)){
    matches.set(hit.route.id+'|'+hit.row.key,hit);
   }
  }
  const choices=[...matches.values()];
  if(!choices.length)return false;
  if(choices.length===1){chooseSection(choices[0].route,choices[0].row);return true;}
  const box=document.createElement('div');box.className='route-choice-popup';
  const title=document.createElement('strong');title.textContent='Choose driving section';box.append(title);
  for(const {route,row} of choices){
   const b=document.createElement('button');b.type='button';b.className='route-choice-button';
   const label=document.createElement('strong');label.textContent=(row.i+1)+'. '+(row.from?.label||'Start')+' → '+(row.to?.label||'End');
   const detail=document.createElement('small');detail.textContent=[route.name,route.startDate,route.startTime,route.endDate&&route.endDate!==route.startDate?route.endDate:'',route.endTime?'to '+route.endTime:''].filter(Boolean).join(' · ');
   b.append(label,detail);b.addEventListener('click',()=>chooseSection(route,row));box.append(b);
  }
  L.DomEvent.disableClickPropagation(box);L.popup({maxWidth:300,autoPan:false}).setLatLng(p).setContent(box).openOn(map);return true;
 }
 function draw(){
  if(!layer)return;
  hitSections=[];layer.clearLayers();dragHandle=null;dragHandleLeg=-1;dragHandleRoute='';
  const r=selected();if(!r||document.getElementById('mapShowRoutes')?.checked===false)return;
  const shown=visibleRoutes();
  const ordered=[...shown.filter(x=>x.id!==currentId),...shown.filter(x=>x.id===currentId)];
  for(const route of ordered){
   const variantIndex=shown.findIndex(x=>x.id===route.id);
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
     hitSections.push({route,row,part});
     const focused=editing()&&active&&selectedSection===row.key;
     const locked=editing()&&!!selectedSection;
     const editable=editing()&&active&&focused&&!row.gap;
     const dimmed=locked&&!focused;
     const line=L.polyline(part,{color:focused?'#187b79':color,weight:focused?11:active?7:5,opacity:dimmed?.22:active?1:.69,interactive:editing()&&!locked||editable,bubblingMouseEvents:false}).addTo(layer);
     line.on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent);if(pick)consumeMapClick(e.latlng);else selectNear(e.latlng);});
     if(editing()&&!dimmed){
      for(const fraction of (part.length>12?[.2,.5,.8]:[.5])){
      const midIndex=Math.max(0,Math.min(part.length-2,Math.floor(part.length*fraction)-1)),a=part[midIndex],b=part[midIndex+1];
      const bearing=Math.atan2((b[1]-a[1])*Math.cos(a[0]*Math.PI/180),b[0]-a[0])*180/Math.PI;
      L.marker([(a[0]+b[0])/2,(a[1]+b[1])/2],{interactive:false,keyboard:false,icon:L.divIcon({className:'route-direction-wrap',html:'<span class="route-direction" style="--bearing:'+bearing+'deg">↑</span><b>'+(row.i+1)+'</b>',iconSize:[38,26],iconAnchor:[19,13]})}).addTo(layer);
      }
     }
     if(editable){
      if(!busy&&!pick){const mid=part[Math.floor(part.length/2)];const handle=L.marker(mid,{draggable:true,autoPan:false,zIndexOffset:1500,icon:L.divIcon({className:'route-drag-handle-wrap',html:'<span class="route-drag-handle">↕</span>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(layer);handle.bindTooltip('Drag to reshape this section');handle.on('dragend',e=>addViaAt(route.id,row.i,e.target.getLatLng()));}
      line.on('mouseover',e=>showDragHandle(e.latlng,row.i,route.id));
      line.on('mousedown',e=>{
       if(busy||pick||!pointOK(e.latlng)||!map?.on)return;
       L.DomEvent.stopPropagation(e.originalEvent);
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
  if(!editing()||!shown.some(x=>x.id===r.id))return;
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
  const shown=visibleRoutes(),combined=shown.flatMap(x=>routeGeometry(x).flatMap(seg=>decodePolyline(seg.polyline)));
  const coords=combined.length?combined:[r.start,...(r.waypoints||[]),r.end].filter(pointOK).map(p=>[p.lat,p.lng]);
  if(coords.length>1)map.fitBounds(L.latLngBounds(coords).pad(0.12),{maxZoom:14});
  else if(coords.length===1)map.setView(coords[0],13);
 }
 function setPick(which){
  if(!selected())return;
  if(!editing())setEdit(true);
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
   const row=sectionRows(selected()).find(x=>x.key===selectedSection);if(!row||row.gap){report('Choose a connected driving section first.');return true;}
   update(r=>{r.waypoints.splice(row.i,0,{id:config.uid(),lat:Number(p.lat),lng:Number(p.lng),
    label:(role==='stop'?'Stop ':'Road point ')+(r.waypoints.length+1),kind:role});},true);
   selectedSection='';pick='';config.onPickChange?.();
  }
  status='Map point saved. Select Suggest route to calculate the road path.';render();
  return true;
 }
 function availableItineraryDays(){
  return [...new Set(config.getActivities().filter(x=>x.date).map(x=>x.date))].sort();
 }
 async function previewItinerary(){
  const day=$('routeItineraryDay').value;
  if(!day||itineraryPreviewBusy)return;
  const request=++itineraryPreviewRequest,snapshot=itinerarySnapshot(config.getActivities(),day);
  suggestedDay=day;
  const scheduleSettings={smart:true,dayStart:$('routeDayStart').value,dayEnd:$('routeDayEnd').value,
   estimatedVisitMinutes:Number($('routeVisitEstimate').value)||0};
  if(minutesOfDay(scheduleSettings.dayStart)===null||minutesOfDay(scheduleSettings.dayEnd)===null||
    minutesOfDay(scheduleSettings.dayStart)>=minutesOfDay(scheduleSettings.dayEnd)){
   report('Choose valid day start and end times.');return;
  }
  itinerarySuggestions=suggestItineraryRoutes(config.getActivities(),day,scheduleSettings);
  itinerarySuggestions.scheduleSettings=scheduleSettings;
  itinerarySuggestions.snapshot=snapshot;
  if(!itinerarySuggestions.options.length){render();return;}
  const key=root.LAZY_ACRES_GEOAPIFY_KEY;
  if(!key){
   itinerarySuggestions.routeNote='Road estimates unavailable: routing API is not configured.';
   render();return;
  }
  itineraryPreviewBusy=true;render();
  try{
   const options=itinerarySuggestions.options;
   // At most three intentional on-demand road previews; nothing is saved until accepted.
   for(const option of options){
    if(request!==itineraryPreviewRequest)break;
    const points=option.stops;
    const draft={start:points[0],end:points[points.length-1],
     waypoints:points.slice(1,-1).map(p=>({lat:p.lat,lng:p.lng,kind:'stop'})),preferences:{...DEFAULT}};
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
     const response=await fetch(routeURL(draft,key),{signal:controller.signal});
     if(!response.ok)throw Error(response.status===429?'routing quota reached':'HTTP '+response.status);
     const result=parseRoute(await response.json());
     option.roadMiles=result.distanceM/1609.344;
     option.roadMinutes=Math.ceil(result.durationS/60);
     option.roadLegStats=result.legStats;
     option.assessment=itineraryDrivingAssessment(points,result.legStats,{day,
      estimatedVisitMinutes:Number($('routeVisitEstimate').value)||0});
    }catch(error){
     option.routeError=error.name==='AbortError'?'Request timed out':error.message;
    }finally{clearTimeout(timeout);}
   }
  }finally{
   itineraryPreviewBusy=false;
   if(request===itineraryPreviewRequest&&snapshot!==itinerarySnapshot(config.getActivities(),day)){
    itinerarySuggestions=null;report('Itinerary changed during routing. Generate suggestions again.');
   }
   render();
  }
 }
 function acceptItinerarySuggestion(index){
  if(!itinerarySuggestions||!suggestedDay||index<0||index>=itinerarySuggestions.options.length)return;
  if(routes().length>=MAX_ROUTES)return report('Maximum '+MAX_ROUTES+' routes. Remove one before accepting a suggestion.');
  if(itineraryPreviewBusy)return report('Finish evaluating the suggestions before accepting one.');
  const proposal=itinerarySuggestions.options[index];
  if(itinerarySuggestions.snapshot!==itinerarySnapshot(config.getActivities(),suggestedDay)){
   itinerarySuggestions=null;report('The itinerary changed. Generate suggestions again.');render();return;
  }
  // Re-check that the source activities have not moved or changed since preview.
  const newest=suggestItineraryRoutes(config.getActivities(),suggestedDay,itinerarySuggestions.scheduleSettings||{});
  if(!newest.options.some(x=>x.ids.join('|')===proposal.ids.join('|'))||
     proposal.ids.some(id=>!config.getActivities().some(x=>x.id===id&&x.date===suggestedDay&&pointOK(x)))){
   itinerarySuggestions=null;report('The itinerary changed. Generate suggestions again.');render();return;
  }
  const stops=proposal.ids.map(id=>config.getActivities().find(x=>x.id===id));
  const t=config.getTrip(),r=newRoute(config.uid(),t.id,('Itinerary · '+suggestedDay+' · '+proposal.label).slice(0,160));
  r.startDate=suggestedDay;r.endDate=suggestedDay;
  const place=x=>({lat:Number(x.lat),lng:Number(x.lng),label:x.title,sourceType:'activities',sourceId:x.id});
  r.start=place(stops[0]);r.end=place(stops[stops.length-1]);
  r.waypoints=stops.slice(1,-1).map(x=>({...place(x),id:config.uid(),kind:'stop'}));
  r.routeOrder=Math.max(-1,...routes().map(x=>x.routeOrder||0))+1;
  config.getRoutes().push(r);currentId=r.id;undoStack=[];selectedSection='';pick='';
  itinerarySuggestions=null;suggestedDay='';itineraryPreviewRequest++;
  config.persist();
  status='Suggested route saved separately. Check the stop order and select Calculate route for real road mileage and driving time.';
  render();fitMap();
 }
 function homePoint(){
  for(const r of config.getRoutes())if(pointOK(r.preferences?.homePoint))return r.preferences.homePoint;
  return null;
 }
 function saveHome(){
  const r=selected();if(!pointOK(r?.start))return report('Set the selected route starting point to your home first.');
  const home={lat:Number(r.start.lat),lng:Number(r.start.lng),label:'Home'};
  if(!confirm('Use the selected starting point as home for all trips?'))return;
  for(const item of config.getRoutes())if(item.preferences?.homePoint)delete item.preferences.homePoint;
  r.preferences={...r.preferences,homePoint:home};config.persist();report('Home saved for future trips.');
 }
 async function generateDaily(){
  if(busy)return;
  const t=config.getTrip(),home=homePoint(),actual=$('routeDailySource').value==='actual';
  if(!t||!home)return report('Set home using a route starting point first.');
  const source=actual?config.getCheckins():config.getActivities();
  const localDay=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):'';};
  const stops=source.filter(x=>pointOK(x)&&(actual?x.visitedAt:x.date)).map(x=>({day:actual?localDay(x.visitedAt):x.date,time:actual?new Date(x.visitedAt).toTimeString().slice(0,5):x.time||'',point:{lat:Number(x.lat),lng:Number(x.lng),label:x.name||x.title||'Stop',sourceType:actual?'checkins':'activities',sourceId:x.id},endDay:!actual&&x.category==='Lodging'?x.endDate:''})).filter(x=>x.day).sort((a,b)=>a.day.localeCompare(b.day)||a.time.localeCompare(b.time));
  if(!stops.length)return report('No dated, mapped '+(actual?'check-ins':'itinerary stops')+' found.');
  const groups=new Map();for(const stop of stops){if(!groups.has(stop.day))groups.set(stop.day,[]);groups.get(stop.day).push(stop);}
  const finalDay=t.end&&t.end>=stops.at(-1).day?t.end:stops.at(-1).day;
  if(!groups.has(finalDay))groups.set(finalDay,[]);
  const mode=actual?'actual':'planned',drafts=[];let previous=home,lodging=null;
  const same=(a,b)=>Math.abs(a.lat-b.lat)<.00005&&Math.abs(a.lng-b.lng)<.00005;
  for(const [day,items] of groups){
   if(lodging&&lodging.endDay&&day>lodging.endDay)lodging=null;
   const points=[previous];for(const stop of items){if(!same(points.at(-1),stop.point))points.push(stop.point);if(stop.endDay)lodging=stop;}
   const end=day===finalDay?home:lodging&&day<lodging.endDay?lodging.point:points.at(-1);
   if(!same(points.at(-1),end))points.push(end);previous=end;
   if(points.length<2)continue;
   if(points.length>MAX_WAYPOINTS+2)return report('Too many stops on '+day+'. Split this day manually.');
   if(routes().some(r=>r.preferences?.dailySource===mode&&r.startDate===day))continue;
   const r=newRoute(config.uid(),t.id,day+' · '+(actual?'Actual visits':'Itinerary'));
   r.startDate=r.endDate=day;r.start=points[0];r.end=points.at(-1);r.waypoints=points.slice(1,-1).map(p=>({...p,id:config.uid(),kind:'stop'}));r.preferences={...r.preferences,dailySource:mode,homePoint:home};drafts.push(r);
  }
  if(!drafts.length)return report('Daily routes already exist or no driving is needed. Existing edits preserved.');
  if(routes().length+drafts.length>MAX_ROUTES)return report('Too many saved routes. Remove unused routes first.');
  if(!confirm('Create '+drafts.length+' daily routes? Existing routes and manual edits will be kept.'))return;
  let order=Math.max(-1,...routes().map(r=>r.routeOrder||0));
  for(const r of drafts){r.routeOrder=++order;config.getRoutes().push(r);}
  config.persist();
  for(const r of drafts){if(config.getTrip()?.id!==t.id)break;currentId=r.id;selectedSection='';undoStack=[];render();await calculate();}
  report('Daily routes created. Existing routes retained; hide older whole-trip routes if needed.');
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
  const row=sectionRows(r).find(x=>x.key===selectedSection);if(!row||row.gap)return report('Choose a connected driving section first.');
  update(route=>{route.waypoints.splice(row.i,0,{id:config.uid(),lat:Number(item.lat),lng:Number(item.lng),
   label:item.name||item.title||'Stop',kind:'stop',sourceType:kind,sourceId:id});},true);
  selectedSection='';status='Stop inserted into selected driving section.';render();void calculate();
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
   // Generating several routes cannot be undone with a single-route Undo.
   undoStack=[];
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
   status='Connected roads calculated: '+summary(selected())+'. Removed sections remain disconnected.';render();
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
  const days=availableItineraryDays(),daySelect=$('routeItineraryDay');
  const chosen=suggestedDay&&days.includes(suggestedDay)?suggestedDay:(days[0]||'');
  if(suggestedDay&&chosen!==suggestedDay)itinerarySuggestions=null;
  suggestedDay=chosen;
  daySelect.innerHTML=days.length?days.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join(''):
   '<option value="">No dated itinerary activities</option>';
  daySelect.value=chosen;
  $('routeSuggestItinerary').disabled=!chosen||itineraryPreviewBusy;
  $('routeSuggestItinerary').textContent=itineraryPreviewBusy?'Checking road times…':'Suggest from itinerary';
  const overviewRows=itineraryTripOverview(config.getActivities());
  $('routeTripOverviewRows').innerHTML=overviewRows.length?
   '<p class="muted small-details">'+overviewRows.length+' scheduled day(s). Distances below are straight-line estimates within each day, not road miles or travel between days.</p>'+
   overviewRows.map(row=>'<div class="route-itinerary-choice route-trip-day-row">'+
    '<div><strong>'+esc(row.day)+'</strong>'+
    '<small>'+row.mapped+'/'+row.total+' mapped · '+row.timed+' timed · '+row.flexible+' flexible'+
     (row.unmapped?' · '+row.unmapped+' need locations':'')+'</small>'+
    '<small>'+(row.routeable?'Best listed proposal: '+row.bestDirectMiles.toFixed(1)+' straight-line mi · road miles unchecked':
     esc(row.reason))+'</small></div>'+
    '<button type="button" class="secondary small" data-route-review-day="'+esc(row.day)+'" '+
    (!row.routeable||itineraryPreviewBusy?'disabled':'')+'>Review this day</button></div>').join(''):
    '<p class="muted small-details">Add dates to itinerary activities to compare trip days.</p>';
  $('routeItineraryOptions').innerHTML=itinerarySuggestions?.day===chosen?
   (itinerarySuggestions.options.length?itinerarySuggestions.options.map((option,i)=>
     '<div class="route-itinerary-choice"><div><strong>'+esc(option.label)+'</strong>'+
     '<small>'+esc(option.stops.map(x=>(x.time?x.time+' ':'')+x.title).join(' → '))+'</small>'+
     (option.slots?.length?'<small class="route-day-times">'+esc(option.slots.map(x=>x.start+' '+x.title).join(' · '))+'</small>':'')+
     (option.unplaced?.length?'<small class="route-schedule-warning">Cannot fit: '+esc(option.unplaced.join(', '))+'</small>':'')+
     (option.planningIssues||[]).map(x=>'<small class="route-schedule-warning">'+esc(x)+'</small>').join('')+
     (option.note?'<small>'+esc(option.note)+'</small>':'')+
     '<small>'+(option.roadMiles!=null?
      option.roadMiles.toFixed(1)+' road mi · about '+option.roadMinutes+' min driving':
      'Approx. '+option.directMiles.toFixed(1)+' straight-line mi · driving time unavailable')+'</small>'+
     (option.routeError?'<small>Road lookup unavailable: '+esc(option.routeError)+'</small>':'')+
     (option.assessment?'<small>'+esc(option.assessment.message)+'</small>':'')+
     (option.assessment?.issues||[]).map(msg=>'<small class="route-schedule-warning">'+esc(msg)+'</small>').join('')+
     (option.assessment?.notes||[]).map(msg=>'<small>'+esc(msg)+'</small>').join('')+
     '</div><button type="button" class="secondary small" data-route-itinerary-accept="'+i+'" '+(itineraryPreviewBusy||list.length>=MAX_ROUTES?'disabled':'')+'>Use this route</button></div>').join(''):
     '<p class="muted">'+esc(itinerarySuggestions.reason)+'</p>')+
   (itinerarySuggestions.routeNote?'<p class="muted small-details">'+esc(itinerarySuggestions.routeNote)+'</p>':'')+
   (itinerarySuggestions.excluded?'<p class="muted small-details">'+itinerarySuggestions.excluded+' activity/activities have no mapped location and were excluded.</p>':'')+
   '<p class="muted small-details">Timed stops keep their chronological order. Visit estimates include time at intermediate stops; listed opening-hour warnings are limited to simple schedules. Check all assumptions.</p>':'';
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
  if(!r){$('routeEditSection').innerHTML='<option value="">No route selected</option>';$('routeEmpty').textContent=list.length?'Select a route.':'Create an outbound, return, or day-trip route.';draw();return;}
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
  $('routeEditSection').innerHTML='<option value="">Choose driving section…</option>'+sectionList.map(x=>'<option value="'+esc(x.key)+'">'+esc((x.i+1)+'. '+(x.from?.label||'Start')+' → '+(x.to?.label||'End'))+'</option>').join('');
  $('routeEditSection').value=selectedSection;
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
     const prior=r.legStats.slice(0,i+1);const seconds=prior.every(x=>x&&Number.isFinite(x.durationS))?prior.reduce((sum,x)=>sum+x.durationS,0):null;
     const start=r.startDate&&r.startTime?new Date(r.startDate+'T'+r.startTime):null;
     const eta=start&&Number.isFinite(start.getTime())&&seconds!=null?new Date(start.getTime()+seconds*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
     return '<div class="route-leg-row"><span>'+esc(from||'Start')+' → '+esc(to||'End')+(eta?'<small> · Driving-only arrival '+esc(eta)+'</small>':'')+'</span>'+
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
 function setTool(next){tool=next==='routes'?'routes':'discover';if(tool!=='routes'){setEdit(false);return;}config.onPickChange?.();render();}
 function onTripChange(){editEnabled=false;$('routeEditMode').checked=false;config.onPickChange?.();for(const id of ['routeMapDay','routeMapFrom','routeMapTo'])$(id).value='';currentId='';undoStack=[];pick='';selectedSection='';status='';suggestedDay='';itinerarySuggestions=null;itineraryPreviewRequest++;render();}
 function bind(){
  $('routeEditMode').addEventListener('change',e=>setEdit(e.target.checked));
  $('routeEditSection').addEventListener('change',e=>{selectedSection=e.target.value;render();});
  $('routeMapClear').addEventListener('click',()=>{for(const id of ['routeMapDay','routeMapFrom','routeMapTo'])$(id).value='';draw();});
  for(const id of ['routeMapDay','routeMapFrom','routeMapTo'])$(id).addEventListener('change',()=>{if($('routeMapDay').value&&$('routeMapFrom').value&&$('routeMapTo').value&&$('routeMapFrom').value>$('routeMapTo').value){$('routeMapTo').value=$('routeMapFrom').value;}draw();});
  $('exploreToolTabs').addEventListener('click',e=>{const b=e.target.closest('[data-explore-tool]');if(b)setTool(b.dataset.exploreTool);});
  $('routeNew').addEventListener('click',()=>addRoute());
  $('routeSuggestItinerary').addEventListener('click',previewItinerary);
  $('routeItineraryDay').addEventListener('change',e=>{itineraryPreviewRequest++;suggestedDay=e.target.value;itinerarySuggestions=null;render();});
  $('routeTripOverviewRows').addEventListener('click',e=>{
   const button=e.target.closest('[data-route-review-day]');
   if(!button||itineraryPreviewBusy)return;
   const day=button.dataset.routeReviewDay;
   if(!availableItineraryDays().includes(day))return;
   itineraryPreviewRequest++;itinerarySuggestions=null;suggestedDay=day;
   $('routeItineraryDay').value=day;
   void previewItinerary();
  });
  for(const id of ['routeVisitEstimate','routeDayStart','routeDayEnd'])$(id).addEventListener('change',()=>{
   itineraryPreviewRequest++;
   if(itinerarySuggestions){itinerarySuggestions=null;report('Schedule settings changed. Generate suggestions again.');render();}
  });
  $('routeItineraryOptions').addEventListener('click',e=>{
   const button=e.target.closest('[data-route-itinerary-accept]');
   if(button)acceptItinerarySuggestion(Number(button.dataset.routeItineraryAccept));
  });
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
  $('routeSetHome').addEventListener('click',saveHome);
  $('routeGenerateDaily').addEventListener('click',()=>void generateDaily());
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
 return {attachMap,render,onTripChange,consumeMapClick,cancelPick,isPicking:()=>!!pick,getPick:()=>pick,selectNear,isEditing:editing,setEdit,setTool};
}
root.VacationRouteDomain=Object.freeze({newRoute,decodePolyline,routeURL,parseRoute,routeDiscoveryGeometry,nearestRoadWindow,windowError,summary,pointOK,sectionGeometry,suggestItineraryRoutes,smartDailyItinerary,tentativeDayTimeline,itineraryTripOverview,itineraryDrivingAssessment,itinerarySnapshot});
root.createVacationRoutes=createController;
})(window);
