
(()=>{'use strict';
const URL='https://wntakzfoprthwggkidyq.supabase.co',KEY='sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ',CACHE='lazy-acres-vacation-cloud-v1',QUEUE='lazy-acres-vacation-pending-v1',HOUSE='tod-donna-shared';
const types={trips:'vacation_trips',places:'vacation_places',activities:'vacation_itinerary',notes:'vacation_notes',packing:'vacation_packing'};
const blank=()=>({trips:[],places:[],activities:[],notes:[],packing:[],ideas:[]});
const client=window.supabase?.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
let current=blank(),pending=[],busy=false,authorized=false;
const $=s=>document.querySelector(s);
function status(s){$('#cloudStatus').textContent=s;}
function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}}
function cache(){try{localStorage.setItem(CACHE,JSON.stringify(current));localStorage.setItem(QUEUE,JSON.stringify(pending))}catch{}}
function row(kind,x){const base={id:x.id,household_id:HOUSE};
if(kind==='trips')return {...base,name:x.name,destination:x.destination||'',start_date:x.start||null,end_date:x.end||null,lat:x.lat??null,lng:x.lng??null};
if(kind==='places')return {...base,trip_id:x.tripId,name:x.name,category:x.category||'',location:x.location||'',notes:x.notes||'',lat:x.lat??null,lng:x.lng??null};
if(kind==='activities')return {...base,trip_id:x.tripId,title:x.title,activity_date:x.date||null,notes:x.notes||''};
if(kind==='notes')return {...base,trip_id:x.tripId,title:x.title,body:x.body||''};
return {...base,trip_id:x.tripId,title:x.title,category:x.category||'trip-misc',done:!!x.done};
}
function item(kind,r){if(kind==='trips')return {id:r.id,name:r.name,destination:r.destination||'',start:r.start_date||'',end:r.end_date||'',lat:r.lat,lng:r.lng};
if(kind==='places')return {id:r.id,tripId:r.trip_id,name:r.name,category:r.category||'',location:r.location||'',notes:r.notes||'',lat:r.lat,lng:r.lng};
if(kind==='activities')return {id:r.id,tripId:r.trip_id,title:r.title,date:r.activity_date||'',notes:r.notes||''};
if(kind==='notes')return {id:r.id,tripId:r.trip_id,title:r.title,body:r.body||''};
return {id:r.id,tripId:r.trip_id,title:r.title,category:r.category,done:r.done};
}
function changed(next){for(const kind of Object.keys(types)){const old=new Map(current[kind].map(x=>[x.id,x]));const now=new Map(next[kind].map(x=>[x.id,x]));for(const [id,x] of now)if(JSON.stringify(x)!==JSON.stringify(old.get(id)))pending.push({kind,id,action:'upsert',value:x});for(const [id] of old)if(!now.has(id))pending.push({kind,id,action:'delete'});}current=structuredClone(next);cache();flush();}
async function fetchAll(){const state=blank();for(const [kind,table] of Object.entries(types)){const {data,error}=await client.from(table).select('*').eq('household_id',HOUSE);if(error)throw error;state[kind]=(data||[]).map(r=>item(kind,r));}return state;}
function overlay(base){for(const op of pending){const arr=base[op.kind];const i=arr.findIndex(x=>x.id===op.id);if(op.action==='delete'){if(i>=0)arr.splice(i,1)}else if(i>=0)arr[i]=op.value;else arr.push(op.value)}return base;}
async function flush(){if(busy||!authorized||!navigator.onLine)return;busy=true;try{while(pending.length){const op=pending[0],table=types[op.kind];const result=op.action==='delete'?await client.from(table).delete().eq('id',op.id).eq('household_id',HOUSE):await client.from(table).upsert(row(op.kind,op.value),{onConflict:'id'});if(result.error)throw result.error;pending.shift();cache();}status('Saved to Supabase');}catch(e){status('Offline or sync failed — changes saved on this device: '+e.message)}finally{busy=false;}}
async function start(){if(!client){status('Supabase library unavailable. Check your connection.');return;}pending=read(QUEUE,[]);const {data:{session}}=await client.auth.getSession();if(!session){$('#cloudGate').classList.remove('hidden');status('Sign in to open your shared planner');return;}
const {data:member,error}=await client.from('vacation_members').select('household_id').eq('user_id',session.user.id).maybeSingle();if(error||member?.household_id!==HOUSE){$('#cloudGate').classList.remove('hidden');status('This email is signed in but has not yet been approved for the shared planner.');return;}
authorized=true;$('#cloudGate').classList.add('hidden');$('#cloudReady').classList.remove('hidden');try{current=overlay(await fetchAll());cache();status(pending.length?'Pending offline changes':'Connected to Supabase');window.startVacationPlanner(current,changed);flush();}catch(e){const cached=read(CACHE,null);if(cached){current=overlay(cached);status('Offline — using saved copy');window.startVacationPlanner(current,changed);}else{status('Cannot load trips: '+e.message);}}}
$('#cloudLogin').addEventListener('submit',async e=>{e.preventDefault();const email=$('#cloudEmail').value.trim();status('Sending sign-in link…');const {error}=await client.auth.signInWithOtp({email,emailRedirectTo:location.origin+location.pathname});status(error?'Sign-in failed: '+error.message:'Check your email for a sign-in link, then return here.');});
$('#cloudSignOut').addEventListener('click',async()=>{await client.auth.signOut();location.reload()});
window.addEventListener('online',()=>{flush();if(authorized&&pending.length===0)status('Connected to Supabase')});
start().catch(e=>status('Sign-in error: '+e.message));
})();