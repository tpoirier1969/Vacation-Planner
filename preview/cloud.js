
(()=>{'use strict';
const URL='https://wntakzfoprthwggkidyq.supabase.co',KEY='sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ',HOUSE='tod-donna-shared';
const types={trips:'vacation_trips',routes:'vacation_routes',places:'vacation_places',activities:'vacation_itinerary',notes:'vacation_notes',packing:'vacation_packing'};
const blank=()=>({trips:[],routes:[],places:[],activities:[],notes:[],packing:[],ideas:[]});
const client=window.supabase?.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
let current=blank(),pending=[],busy=false,authorized=false,refreshing=false,refreshAgain=false,refreshTimer=0;
const $=s=>document.querySelector(s);
const retry=document.createElement('button');
retry.type='button';retry.className='quiet small hidden';retry.textContent='Retry save';$('#cloudSignOut').before(retry);
function status(s){$('#cloudStatus').textContent=s;}
function row(kind,x){const base={id:x.id,household_id:HOUSE};
if(kind==='trips')return {...base,name:x.name,destination:x.destination||'',start_date:x.start||null,end_date:x.end||null,lat:x.lat??null,lng:x.lng??null};
if(kind==='routes')return {...base,trip_id:x.tripId,name:x.name,start_point:x.start||null,end_point:x.end||null,waypoints:x.waypoints||[],preferences:x.preferences||{},start_date:x.startDate||null,start_time:x.startTime||null,end_date:x.endDate||null,end_time:x.endTime||null,polyline:x.polyline||null,distance_m:x.distanceM??null,duration_s:x.durationS??null,leg_stats:x.legStats||[],route_kind:x.routeKind||'day',route_order:Number.isInteger(x.routeOrder)?x.routeOrder:0,route_segments:x.segments||[],disconnected_legs:x.gaps||[],visible:x.visible!==false};
if(kind==='places')return {...base,trip_id:x.tripId,name:x.name,category:x.category||'',location:x.location||'',notes:x.notes||'',geoapify_id:x.geoapifyId||null,opening_hours:x.hours||null,lat:x.lat??null,lng:x.lng??null,idea_date:x.date||null,idea_end_date:x.endDate||null,idea_start_time:x.time||null,idea_end_time:x.endTime||null,fixed_date:!!x.fixedDate};
if(kind==='activities')return {...base,trip_id:x.tripId,title:x.title,activity_date:x.date||null,end_date:x.endDate||null,category:x.category||'Other',place_id:x.placeId||null,lat:x.lat??null,lng:x.lng??null,opening_hours:x.hours||null,notes:x.notes||'',start_time:x.time||null,end_time:x.endTime||null,fixed_date:!!x.fixedDate,must_do:!!x.mustDo,reservation_status:x.reservationStatus||'none',confirmation_code:x.confirmationCode||null,booking_url:x.bookingUrl||null};
if(kind==='notes')return {...base,trip_id:x.tripId,title:x.title,body:x.body||''};
return {...base,trip_id:x.tripId,title:x.title,category:x.category||'trip-misc',done:!!x.done};
}
function item(kind,r){if(kind==='trips')return {id:r.id,name:r.name,destination:r.destination||'',start:r.start_date||'',end:r.end_date||'',lat:r.lat,lng:r.lng};
if(kind==='routes')return {id:r.id,tripId:r.trip_id,name:r.name,start:r.start_point||null,end:r.end_point||null,waypoints:r.waypoints||[],preferences:r.preferences||{},startDate:r.start_date||'',startTime:r.start_time?.slice(0,5)||'',endDate:r.end_date||'',endTime:r.end_time?.slice(0,5)||'',polyline:r.polyline||'',distanceM:r.distance_m??null,durationS:r.duration_s??null,legStats:r.leg_stats||[],routeKind:r.route_kind||'day',routeOrder:r.route_order||0,segments:r.route_segments||[],gaps:r.disconnected_legs||[],visible:r.visible!==false};
if(kind==='places')return {id:r.id,tripId:r.trip_id,name:r.name,category:r.category||'',location:r.location||'',notes:r.notes||'',geoapifyId:r.geoapify_id||'',hours:r.opening_hours||'',lat:r.lat,lng:r.lng,date:r.idea_date||'',endDate:r.idea_end_date||'',time:r.idea_start_time?.slice(0,5)||'',endTime:r.idea_end_time?.slice(0,5)||'',fixedDate:!!r.fixed_date};
if(kind==='activities')return {id:r.id,tripId:r.trip_id,title:r.title,date:r.activity_date||'',endDate:r.end_date||'',category:r.category||'Other',placeId:r.place_id||'',lat:r.lat,lng:r.lng,hours:r.opening_hours||'',notes:r.notes||'',time:r.start_time?.slice(0,5)||'',endTime:r.end_time?.slice(0,5)||'',fixedDate:!!r.fixed_date,mustDo:!!r.must_do,reservationStatus:r.reservation_status||'none',confirmationCode:r.confirmation_code||'',bookingUrl:r.booking_url||''};
if(kind==='notes')return {id:r.id,tripId:r.trip_id,title:r.title,body:r.body||''};
return {id:r.id,tripId:r.trip_id,title:r.title,category:r.category,done:r.done};
}
function changed(next){
 // Staging-only: edits remain in memory and NEVER enter the Supabase mutation queue.
 current=structuredClone(next);
 status('PREVIEW: changes are temporary — nothing saved to Supabase');
}
async function fetchAll(){
 const state=blank();
 const entries=await Promise.all(Object.entries(types).map(async ([kind,table])=>{
  const {data,error}=await client.from(table).select('*').eq('household_id',HOUSE).order('updated_at',{ascending:false});
  if(error)throw error;
  return [kind,(data||[]).map(r=>item(kind,r))];
 }));
 for(const [kind,items] of entries)state[kind]=items;
 return state;
}
function equivalent(a,b){
 return Object.keys(types).every(kind=>{
  const stable=items=>JSON.stringify(items.slice().sort((x,y)=>String(x.id).localeCompare(String(y.id))));
  return stable(a[kind])===stable(b[kind]);
 });
}
function requestRefresh(delay=400){
 if(!authorized)return;
 clearTimeout(refreshTimer);
 refreshTimer=setTimeout(()=>{void refresh();},delay);
}
async function refresh(){
 if(!authorized||document.hidden)return;
 if(refreshing||busy||pending.length){refreshAgain=true;return;}
 refreshing=true;
 try{
  const remote=await fetchAll();
  if(busy||pending.length){refreshAgain=true;return;}
  if(!equivalent(remote,current)){
   current=remote;
   window.applyVacationPlannerRemoteState?.(structuredClone(remote));
   status('Updated from Supabase');
  }
 }catch(e){if(!pending.length)status('Sync check failed — retrying: '+e.message);}
 finally{
  refreshing=false;
  if(refreshAgain&&!busy&&!pending.length){refreshAgain=false;requestRefresh(300);}
 }
}
function beginCollaboration(){
 // Realtime signals prompt a fresh, RLS-protected snapshot. Polling also catches lost signals.
 let channel=client.channel('vacation-household-changes');
 for(const table of Object.values(types)){
  channel=channel.on('postgres_changes',{event:'*',schema:'public',table},()=>requestRefresh(250));
 }
 channel.subscribe(result=>{
  if(result==='SUBSCRIBED')requestRefresh(0);
  if(result==='CHANNEL_ERROR'||result==='TIMED_OUT'){
   if(!pending.length)status('Live connection interrupted — checking Supabase periodically');
  }
 });
 setInterval(()=>{if(!document.hidden)requestRefresh(0);},15000);
 window.addEventListener('focus',()=>requestRefresh(0));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestRefresh(0);});
}
async function flush(){
 if(busy||!authorized||!pending.length)return;
 if(!navigator.onLine){
  status('Not saved to Supabase — you are offline. Reconnect and retry before closing this page.');
  retry.classList.remove('hidden');return;
 }
 busy=true;retry.classList.add('hidden');
 try{
  while(pending.length){
   const op=pending[0],table=types[op.kind];
   const result=op.action==='delete'
    ?await client.from(table).delete().eq('id',op.id).eq('household_id',HOUSE).select('id')
    :await client.from(table).upsert(row(op.kind,op.value),{onConflict:'id'}).select('id');
   if(result.error)throw result.error;
   if(op.action==='upsert'&&result.data?.length!==1)throw Error('Database did not confirm the saved record.');
   pending.shift();
  }
  status('Saved to Supabase');
  requestRefresh(350);
 }catch(e){
  status('NOT SAVED to Supabase — '+e.message+'. Retry before leaving this page.');
  retry.classList.remove('hidden');
 }finally{busy=false;}
}
async function start(){
 if(!client){status('Supabase library unavailable. Check your connection.');return;}
 // Verify the user with Supabase rather than trusting a locally cached session.
 const {data:{user},error:authError}=await client.auth.getUser();
 if(authError||!user){$('#cloudGate').classList.remove('hidden');status('Sign in to open your shared planner');return;}
 const {data:member,error}=await client.from('vacation_members').select('household_id').eq('user_id',user.id).maybeSingle();
 if(error){$('#cloudGate').classList.remove('hidden');status('Could not verify shared-planner access: '+error.message);return;}
 if(member?.household_id!==HOUSE){$('#cloudGate').classList.remove('hidden');$('#cloudEmail').value=user.email||'';status('Signed in as '+(user.email||'an unrecognized account')+', but this account is not a member of the shared planner. Use Sign out above to switch accounts.');return;}
 authorized=true;$('#cloudGate').classList.add('hidden');$('#cloudReady').classList.remove('hidden');
 try{
  current=await fetchAll();
 }catch(e){
  $('#cloudReady').classList.add('hidden');
  status('Could not fetch trip records from Supabase: '+e.message);
  return;
 }
 try{
  status('READ-ONLY PREVIEW — no data will be saved');
  window.startVacationPlanner(structuredClone(current),changed);
  // No realtime subscription: this preview never overwrites staged local changes.
 }catch(e){
  $('#cloudReady').classList.add('hidden');
  status('Preview interface could not start: '+e.message);
  console.error('Vacation Planner preview UI startup error:',e);
 }
}
$('#cloudLogin').addEventListener('submit',async e=>{e.preventDefault();const email=$('#cloudEmail').value.trim();status('Sending sign-in link…');const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/Vacation-Planner/'}});status(error?'Sign-in failed: '+error.message:'Check your email for a sign-in link, then return here.');});
$('#cloudSignOut').addEventListener('click',async()=>{if(pending.length&&!confirm('Changes are NOT saved to Supabase. Sign out and discard them?'))return;await client.auth.signOut();location.reload()});
retry.addEventListener('click',flush);
window.addEventListener('online',()=>{if(pending.length)flush();else if(authorized)requestRefresh(0)});
window.addEventListener('beforeunload',e=>{if(pending.length){e.preventDefault();e.returnValue='Unsaved changes';}});
start().catch(e=>status('Sign-in error: '+e.message));
})();