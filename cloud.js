
(()=>{'use strict';
const URL='https://wntakzfoprthwggkidyq.supabase.co',KEY='sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ',HOUSE='tod-donna-shared';
const types={trips:'vacation_trips',routes:'vacation_routes',places:'vacation_places',activities:'vacation_itinerary',notes:'vacation_notes',packing:'vacation_packing',checkins:'vacation_checkins'};
const blank=()=>({trips:[],routes:[],places:[],activities:[],notes:[],packing:[],checkins:[],ideas:[]});
const client=window.supabase?.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
let current=blank(),pending=[],busy=false,authorized=false,refreshing=false,refreshAgain=false,refreshTimer=0,queueKey='',queueDurable=true,versions=new Map(),conflict=null;
const $=s=>document.querySelector(s);
const rating=x=>x===''||x==null?null:(Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=5?Number(x):null);
const retry=document.createElement('button');
retry.type='button';retry.className='quiet small hidden';retry.textContent='Retry save';$('#cloudSignOut').before(retry);
const resolve=document.createElement('button');resolve.type='button';resolve.className='quiet small hidden';resolve.textContent='Resolve conflicting edit';retry.after(resolve);
const versionKey=(kind,id)=>kind+':'+id;
function captureVersions(kind,rows){if(pending.length||busy)return;for(const r of rows)versions.set(versionKey(kind,r.id),r.updated_at||null);}
function markConflict(op,reason){conflict={op,reason};retry.classList.add('hidden');resolve.classList.remove('hidden');status('SYNC CONFLICT: '+op.kind+' was changed on another device. Your changes remain on this device. Select Resolve conflicting edit.');}

function status(s){$('#cloudStatus').textContent=s;}
function saveQueue(){
 if(!queueKey)return false;
 try{
  if(pending.length)localStorage.setItem(queueKey,JSON.stringify(pending));
  else localStorage.removeItem(queueKey);
  queueDurable=true;return true;
 }catch(e){queueDurable=false;status('WARNING: Offline changes could not be stored on this device ('+e.message+'). Keep this page open and retry.');return false;}
}
function loadQueue(userId){
 queueKey='lazy-acres-vacation-pending-v1:'+HOUSE+':'+userId;
 try{
  const saved=JSON.parse(localStorage.getItem(queueKey)||'[]');
  if(!Array.isArray(saved))throw Error('Invalid saved changes');
  pending=saved.filter(op=>types[op.kind]&&typeof op.id==='string'&&['upsert','delete'].includes(op.action)&&(op.action==='delete'||op.value?.id===op.id));
  if(pending.length!==saved.length)status('Some locally stored changes could not be restored. Review your entries.');
  saveQueue();
 }catch(e){pending=[];queueDurable=false;status('WARNING: Stored offline changes could not be read: '+e.message);}
}
function applyPending(remote){
 const restored=structuredClone(remote);
 for(const op of pending){
  const items=restored[op.kind],i=items.findIndex(x=>x.id===op.id);
  if(op.action==='delete'){if(i>=0)items.splice(i,1);}
  else if(i>=0)items[i]=structuredClone(op.value);
  else items.push(structuredClone(op.value));
 }
 return restored;
}
function row(kind,x){const base={id:x.id,household_id:HOUSE};
if(kind==='trips')return {...base,name:x.name,destination:x.destination||'',start_date:x.start||null,end_date:x.end||null,lat:x.lat??null,lng:x.lng??null};
if(kind==='routes')return {...base,trip_id:x.tripId,name:x.name,start_point:x.start||null,end_point:x.end||null,waypoints:x.waypoints||[],preferences:x.preferences||{},start_date:x.startDate||null,start_time:x.startTime||null,end_date:x.endDate||null,end_time:x.endTime||null,polyline:x.polyline||null,distance_m:x.distanceM??null,duration_s:x.durationS??null,leg_stats:x.legStats||[],route_kind:x.routeKind||'day',route_order:Number.isInteger(x.routeOrder)?x.routeOrder:0,route_segments:x.segments||[],disconnected_legs:x.gaps||[],visible:x.visible!==false};
if(kind==='places')return {...base,trip_id:x.tripId,name:x.name,category:x.category||'',location:x.location||'',notes:x.notes||'',geoapify_id:x.geoapifyId||null,opening_hours:x.hours||null,lat:x.lat??null,lng:x.lng??null,idea_date:x.date||null,idea_end_date:x.endDate||null,idea_start_time:x.time||null,idea_end_time:x.endTime||null,fixed_date:!!x.fixedDate,interest_rating:rating(x.interestRating),cost_rating:rating(x.costRating)};
if(kind==='activities')return {...base,trip_id:x.tripId,title:x.title,activity_date:x.date||null,end_date:x.endDate||null,category:x.category||'Other',place_id:x.placeId||null,lat:x.lat??null,lng:x.lng??null,opening_hours:x.hours||null,notes:x.notes||'',start_time:x.time||null,end_time:x.endTime||null,fixed_date:!!x.fixedDate,must_do:!!x.mustDo,reservation_status:x.reservationStatus||'none',confirmation_code:x.confirmationCode||null,booking_url:x.bookingUrl||null,interest_rating:rating(x.interestRating),cost_rating:rating(x.costRating)};
if(kind==='checkins')return {...base,trip_id:x.tripId,name:x.name,notes:x.notes||'',visited_at:x.visitedAt,lat:x.lat??null,lng:x.lng??null,place_id:x.placeId||null,activity_id:x.activityId||null,created_by:x.createdBy||null};
if(kind==='notes')return {...base,trip_id:x.tripId,title:x.title,body:x.body||''};
return {...base,trip_id:x.tripId,title:x.title,category:x.category||'trip-misc',done:!!x.done};
}
function item(kind,r){if(kind==='trips')return {id:r.id,name:r.name,destination:r.destination||'',start:r.start_date||'',end:r.end_date||'',lat:r.lat,lng:r.lng};
if(kind==='routes')return {id:r.id,tripId:r.trip_id,name:r.name,start:r.start_point||null,end:r.end_point||null,waypoints:r.waypoints||[],preferences:r.preferences||{},startDate:r.start_date||'',startTime:r.start_time?.slice(0,5)||'',endDate:r.end_date||'',endTime:r.end_time?.slice(0,5)||'',polyline:r.polyline||'',distanceM:r.distance_m??null,durationS:r.duration_s??null,legStats:r.leg_stats||[],routeKind:r.route_kind||'day',routeOrder:r.route_order||0,segments:r.route_segments||[],gaps:r.disconnected_legs||[],visible:r.visible!==false};
if(kind==='places')return {id:r.id,tripId:r.trip_id,name:r.name,category:r.category||'',location:r.location||'',notes:r.notes||'',geoapifyId:r.geoapify_id||'',hours:r.opening_hours||'',lat:r.lat,lng:r.lng,date:r.idea_date||'',endDate:r.idea_end_date||'',time:r.idea_start_time?.slice(0,5)||'',endTime:r.idea_end_time?.slice(0,5)||'',fixedDate:!!r.fixed_date,interestRating:r.interest_rating??'',costRating:r.cost_rating??''};
if(kind==='activities')return {id:r.id,tripId:r.trip_id,title:r.title,date:r.activity_date||'',endDate:r.end_date||'',category:r.category||'Other',placeId:r.place_id||'',lat:r.lat,lng:r.lng,hours:r.opening_hours||'',notes:r.notes||'',time:r.start_time?.slice(0,5)||'',endTime:r.end_time?.slice(0,5)||'',fixedDate:!!r.fixed_date,mustDo:!!r.must_do,reservationStatus:r.reservation_status||'none',confirmationCode:r.confirmation_code||'',bookingUrl:r.booking_url||'',interestRating:r.interest_rating??'',costRating:r.cost_rating??''};
if(kind==='checkins')return {id:r.id,tripId:r.trip_id,name:r.name,notes:r.notes||'',visitedAt:r.visited_at,lat:r.lat,lng:r.lng,placeId:r.place_id||'',activityId:r.activity_id||'',createdBy:r.created_by||''};
if(kind==='notes')return {id:r.id,tripId:r.trip_id,title:r.title,body:r.body||''};
return {id:r.id,tripId:r.trip_id,title:r.title,category:r.category,done:r.done};
}
function changed(next){
 for(const kind of Object.keys(types)){
  const old=new Map(current[kind].map(x=>[x.id,x])),now=new Map(next[kind].map(x=>[x.id,x]));
  for(const [id,x] of now)if(JSON.stringify(x)!==JSON.stringify(old.get(id)))pending.push({kind,id,action:'upsert',value:structuredClone(x),baseVersion:versions.get(versionKey(kind,id))??null});
  for(const [id] of old)if(!now.has(id))pending.push({kind,id,action:'delete',baseVersion:versions.get(versionKey(kind,id))??null});
 }
 current=structuredClone(next);
 if(pending.length){if(saveQueue())status('Changes saved on this device; syncing to Supabase…');flush();}
}
async function fetchAll(){
 const state=blank();
 const entries=await Promise.all(Object.entries(types).map(async ([kind,table])=>{
  const {data,error}=await client.from(table).select('*').eq('household_id',HOUSE).order('updated_at',{ascending:false});
  if(error)throw error;
  captureVersions(kind,data||[]);
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
 if(busy||!authorized||!pending.length||conflict)return;
 if(!navigator.onLine){
  status(queueDurable?'Offline: changes saved on this device. They will sync when you reconnect.':'Offline: changes NOT safely stored. Keep this page open until they sync.');
  retry.classList.remove('hidden');return;
 }
 busy=true;retry.classList.add('hidden');
 try{
  while(pending.length){
   const op=pending[0],table=types[op.kind];
   let result;
   if(op.baseVersion){
    const query=client.from(table);
    result=op.action==='delete'
     ?await query.delete().eq('id',op.id).eq('household_id',HOUSE).eq('updated_at',op.baseVersion).select('id,updated_at')
     :await query.update(row(op.kind,op.value)).eq('id',op.id).eq('household_id',HOUSE).eq('updated_at',op.baseVersion).select('id,updated_at');
   }else if(op.action==='delete'){
    result={data:[],error:null};
   }else{
    result=await client.from(table).insert(row(op.kind,op.value)).select('id,updated_at');
   }
   if(result.error){
    if(result.error.code==='23505'){markConflict(op,'Record already exists');break;}
    throw result.error;
   }
   if(op.baseVersion&&result.data?.length!==1){markConflict(op,'Remote record changed or was deleted');break;}
   if(op.action==='upsert'&&result.data?.length!==1)throw Error('Database did not confirm the saved record.');
   const savedVersion=result.data?.[0]?.updated_at||null;
   if(op.action==='delete')versions.delete(versionKey(op.kind,op.id));
   else versions.set(versionKey(op.kind,op.id),savedVersion);
   pending.shift();
   // Later queued edits to this record must follow the version just written.
   for(const later of pending)if(later.kind===op.kind&&later.id===op.id)later.baseVersion=savedVersion;
   saveQueue();
  }
  if(!conflict){status('Saved to Supabase');requestRefresh(350);}
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
 authorized=true;$('#cloudGate').classList.add('hidden');$('#cloudReady').classList.remove('hidden');$('#cloudSetPassword').classList.remove('hidden');
 try{
  const remote=await fetchAll();
  loadQueue(user.id);
  current=applyPending(remote);
  status(pending.length?'Recovered '+pending.length+' locally saved change(s). Syncing to Supabase…':'Connected to Supabase');
  window.startVacationPlanner(structuredClone(current),changed);
  beginCollaboration();
  if(pending.length)void flush();
 }catch(e){$('#cloudReady').classList.add('hidden');status('Cannot load trips from Supabase: '+e.message);}
}
const loginFeedback=document.createElement('p');
loginFeedback.id='cloudLoginFeedback';
loginFeedback.setAttribute('role','status');
loginFeedback.setAttribute('aria-live','polite');
loginFeedback.style.cssText='padding:12px;border-radius:6px;margin:12px 0 0;font-weight:600;line-height:1.4;overflow-wrap:anywhere';
loginFeedback.hidden=true;
$('#cloudLinkAlternative').after(loginFeedback);
function loginStatus(message,type='pending'){
 status(message);
 loginFeedback.hidden=false;
 loginFeedback.textContent=message;
 loginFeedback.style.background=type==='error'?'#fce8e6':type==='success'?'#e4f3e9':'#e5f1f5';
 loginFeedback.style.color=type==='error'?'#922b21':type==='success'?'#205b38':'#174d60';
}
let authRequestBusy=false;
$('#cloudPasswordLogin').addEventListener('submit',async e=>{
 e.preventDefault();
 if(authRequestBusy)return;
 const email=$('#cloudEmail').value.trim(),password=$('#cloudPassword').value;
 if(!email||!password)return;
 authRequestBusy=true;$('#cloudPasswordSubmit').disabled=true;loginStatus('Signing in…');
 try{
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error)throw error;
  $('#cloudPassword').value='';
  loginStatus('Signed in. Loading your trips…','success');
  await start();
 }catch(error){loginStatus('Sign-in failed: '+error.message,'error');}
 finally{authRequestBusy=false;$('#cloudPasswordSubmit').disabled=false;}
});
$('#cloudLogin').addEventListener('submit',async e=>{
 e.preventDefault();if(authRequestBusy)return;
 const email=$('#cloudEmail').value.trim();if(!email){loginStatus('Enter an email address above.','error');return;}
 authRequestBusy=true;$('#cloudLinkSubmit').disabled=true;loginStatus('Sending sign-in email…');
 try{
  const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});
  if(error)throw error;
  loginStatus('Email requested successfully. Enter the sign-in code from your email below, or use the link if available.','success');
 }catch(error){loginStatus('Sign-in link failed: '+error.message,'error');}
 finally{authRequestBusy=false;$('#cloudLinkSubmit').disabled=false;}
});
const otpForm=document.createElement('form');
otpForm.id='cloudOtpLogin';
otpForm.innerHTML='<label class="field">Email sign-in code<input id="cloudOtpCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required></label><button class="primary" type="submit">Verify code</button>';
$('#cloudLinkAlternative').append(otpForm);
otpForm.addEventListener('submit',async e=>{
 e.preventDefault();if(authRequestBusy)return;
 const email=$('#cloudEmail').value.trim(),token=$('#cloudOtpCode').value.trim();
 if(!email){loginStatus('Enter the email address that received the code.','error');return;}
 authRequestBusy=true;const button=otpForm.querySelector('button');button.disabled=true;
 loginStatus('Verifying sign-in code…');
 try{
  const {error}=await client.auth.verifyOtp({email,token,type:'email'});
  if(error)throw error;
  otpForm.reset();loginStatus('Signed in. Loading your trips…','success');await start();
 }catch(error){loginStatus('Code verification failed: '+error.message,'error');}
 finally{authRequestBusy=false;button.disabled=false;}
});
function closePasswordSettings(){
 $('#cloudPasswordSettings').classList.add('hidden');
 $('#cloudPasswordUpdate').reset();
}
$('#cloudSetPassword').addEventListener('click',()=>{
 if(!authorized){status('Sign in with your approved account first.');return;}
 $('#cloudPasswordSettings').classList.remove('hidden');
 $('#cloudNewPassword').focus();
});
$('#cloudPasswordCancel').addEventListener('click',closePasswordSettings);
$('#cloudPasswordUpdate').addEventListener('submit',async e=>{
 e.preventDefault();if(!authorized||authRequestBusy)return;
 const password=$('#cloudNewPassword').value,confirmation=$('#cloudConfirmPassword').value;
 if(password.length<8){status('Password must have at least 8 characters.');return;}
 if(password!==confirmation){status('Passwords do not match.');return;}
 authRequestBusy=true;$('#cloudPasswordUpdateSubmit').disabled=true;status('Saving your login password…');
 try{
  const {error}=await client.auth.updateUser({password});
  if(error)throw error;
  closePasswordSettings();
  status('Password saved. You can now sign in with this email and password from your iPhone Home Screen shortcut.');
 }catch(error){status('Could not save password: '+error.message);}
 finally{authRequestBusy=false;$('#cloudPasswordUpdateSubmit').disabled=false;}
});
$('#cloudSignOut').addEventListener('click',async()=>{if(pending.length&&!confirm('Changes are not yet synced. Signing out will leave them stored on this device for this account. Sign out anyway?'))return;await client.auth.signOut();location.reload()});
retry.addEventListener('click',flush);
resolve.addEventListener('click',async()=>{
 if(!conflict||busy)return;
 const op=conflict.op;
 const {data,error}=await client.from(types[op.kind]).select('*').eq('id',op.id).eq('household_id',HOUSE).maybeSingle();
 if(error){status('Cannot inspect conflicting record: '+error.message);return;}
 const name=op.value?.name||op.value?.title||op.id;
 const choice=confirm('CONFLICT: '+name+' was changed on another device.\n\nOK: Keep your local edit and overwrite the newer server version.\nCancel: Keep the newer server version and discard only your conflicting local edit.\n\nNeither choice affects other queued changes.');
 if(choice){
  if(!data&&op.action==='delete'){pending.shift();}
  else if(!data&&op.action==='upsert')op.baseVersion=null;
  else op.baseVersion=data.updated_at;
 }else{
  pending.shift();
  const next=structuredClone(current);
  const arr=next[op.kind],i=arr.findIndex(x=>x.id===op.id);
  if(i>=0)arr.splice(i,1);
  if(data)arr.push(item(op.kind,data));
  current=next;
  window.applyVacationPlannerRemoteState?.(structuredClone(next));
 }
 if(data)versions.set(versionKey(op.kind,op.id),data.updated_at);
 else versions.delete(versionKey(op.kind,op.id));
 conflict=null;resolve.classList.add('hidden');saveQueue();if(pending.length)void flush();else{status('Conflict resolved. Changes synchronized.');requestRefresh(0);}
});
window.addEventListener('online',()=>{if(pending.length)flush();else if(authorized)requestRefresh(0)});
window.addEventListener('beforeunload',e=>{if(pending.length&&!queueDurable){e.preventDefault();e.returnValue='Unsaved changes';}});
start().catch(e=>status('Sign-in error: '+e.message));
})();