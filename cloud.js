
(()=>{'use strict';
const URL='https://wntakzfoprthwggkidyq.supabase.co',KEY='sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ',HOUSE='tod-donna-shared';
const types={trips:'vacation_trips',places:'vacation_places',activities:'vacation_itinerary',notes:'vacation_notes',packing:'vacation_packing'};
const blank=()=>({trips:[],places:[],activities:[],notes:[],packing:[],ideas:[]});
const client=window.supabase?.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
let current=blank(),pending=[],busy=false,authorized=false;
const $=s=>document.querySelector(s);
const retry=document.createElement('button');
retry.type='button';retry.className='quiet small hidden';retry.textContent='Retry save';$('#cloudSignOut').before(retry);
function status(s){$('#cloudStatus').textContent=s;}
function row(kind,x){const base={id:x.id,household_id:HOUSE};
if(kind==='trips')return {...base,name:x.name,destination:x.destination||'',start_date:x.start||null,end_date:x.end||null,lat:x.lat??null,lng:x.lng??null};
if(kind==='places')return {...base,trip_id:x.tripId,name:x.name,category:x.category||'',location:x.location||'',notes:x.notes||'',geoapify_id:x.geoapifyId||null,opening_hours:x.hours||null,lat:x.lat??null,lng:x.lng??null};
if(kind==='activities')return {...base,trip_id:x.tripId,title:x.title,activity_date:x.date||null,end_date:x.endDate||null,category:x.category||'Other',place_id:x.placeId||null,lat:x.lat??null,lng:x.lng??null,opening_hours:x.hours||null,notes:x.notes||''};
if(kind==='notes')return {...base,trip_id:x.tripId,title:x.title,body:x.body||''};
return {...base,trip_id:x.tripId,title:x.title,category:x.category||'trip-misc',done:!!x.done};
}
function item(kind,r){if(kind==='trips')return {id:r.id,name:r.name,destination:r.destination||'',start:r.start_date||'',end:r.end_date||'',lat:r.lat,lng:r.lng};
if(kind==='places')return {id:r.id,tripId:r.trip_id,name:r.name,category:r.category||'',location:r.location||'',notes:r.notes||'',geoapifyId:r.geoapify_id||'',hours:r.opening_hours||'',lat:r.lat,lng:r.lng};
if(kind==='activities')return {id:r.id,tripId:r.trip_id,title:r.title,date:r.activity_date||'',endDate:r.end_date||'',category:r.category||'Other',placeId:r.place_id||'',lat:r.lat,lng:r.lng,hours:r.opening_hours||'',notes:r.notes||''};
if(kind==='notes')return {id:r.id,tripId:r.trip_id,title:r.title,body:r.body||''};
return {id:r.id,tripId:r.trip_id,title:r.title,category:r.category,done:r.done};
}
function changed(next){
 for(const kind of Object.keys(types)){
  const old=new Map(current[kind].map(x=>[x.id,x])),now=new Map(next[kind].map(x=>[x.id,x]));
  for(const [id,x] of now)if(JSON.stringify(x)!==JSON.stringify(old.get(id)))pending.push({kind,id,action:'upsert',value:structuredClone(x)});
  for(const [id] of old)if(!now.has(id))pending.push({kind,id,action:'delete'});
 }
 current=structuredClone(next);
 if(pending.length){status('Saving to Supabase…');flush();}
}
async function fetchAll(){const state=blank();for(const [kind,table] of Object.entries(types)){const {data,error}=await client.from(table).select('*').eq('household_id',HOUSE);if(error)throw error;state[kind]=(data||[]).map(r=>item(kind,r));}return state;}
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
 }catch(e){
  status('NOT SAVED to Supabase — '+e.message+'. Retry before leaving this page.');
  retry.classList.remove('hidden');
 }finally{busy=false;}
}
async function start(){
 if(!client){status('Supabase library unavailable. Check your connection.');return;}
 const {data:{session}}=await client.auth.getSession();
 if(!session){$('#cloudGate').classList.remove('hidden');status('Sign in to open your shared planner');return;}
 const {data:member,error}=await client.from('vacation_members').select('household_id').eq('user_id',session.user.id).maybeSingle();
 if(error||member?.household_id!==HOUSE){$('#cloudGate').classList.remove('hidden');status('This email is signed in but has not yet been approved for the shared planner.');return;}
 authorized=true;$('#cloudGate').classList.add('hidden');$('#cloudReady').classList.remove('hidden');
 try{
  current=await fetchAll();
  status('Connected to Supabase');
  window.startVacationPlanner(current,changed);
 }catch(e){$('#cloudReady').classList.add('hidden');status('Cannot load trips from Supabase: '+e.message);}
}
$('#cloudLogin').addEventListener('submit',async e=>{e.preventDefault();const email=$('#cloudEmail').value.trim();status('Sending sign-in link…');const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});status(error?'Sign-in failed: '+error.message:'Check your email for a sign-in link, then return here.');});
$('#cloudSignOut').addEventListener('click',async()=>{if(pending.length&&!confirm('Changes are NOT saved to Supabase. Sign out and discard them?'))return;await client.auth.signOut();location.reload()});
retry.addEventListener('click',flush);
window.addEventListener('online',()=>{if(pending.length)flush();else if(authorized)status('Connected to Supabase')});
window.addEventListener('beforeunload',e=>{if(pending.length){e.preventDefault();e.returnValue='Unsaved changes';}});
start().catch(e=>status('Sign-in error: '+e.message));
})();