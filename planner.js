window.startVacationPlanner=(initialState,cloudSave)=>{'use strict';
const PACKING_CATEGORIES=[{"key":"trip-clothing","label":"Clothing"},{"key":"trip-tents","label":"Tent(s)"},{"key":"trip-fishing-gear","label":"Fishing Gear"},{"key":"trip-boat-stuff","label":"Boat Stuff"},{"key":"trip-cooking","label":"Cooking"},{"key":"trip-food","label":"Food"},{"key":"trip-toiletries","label":"Toiletries"},{"key":"trip-bedding","label":"Bedding / Sleeping"},{"key":"trip-first-aid","label":"First Aid / Medicine"},{"key":"trip-tools","label":"Tools / Repair"},{"key":"trip-electronics","label":"Electronics / Charging"},{"key":"trip-paperwork","label":"Paperwork / Licenses"},{"key":"trip-dog-stuff","label":"Dog Stuff"},{"key":"trip-misc","label":"Misc"}];
const KEY='lazy-acres-vacation-preview-v1',SESSION='lazy-acres-active-trip',TABS=['explore','places','itinerary','notes','packing'];const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])),uid=()=>crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
let state=initialState;
let active=sessionStorage.getItem(SESSION),tab='explore',map,markers,discoveryMarkers,preview,selectedPoint,placeDestination='places',searchToken=0,addingPlace=false,expandedMap=false,tileLayer,tileErrors=0,baseLayers=null,mapStyle=localStorage.getItem('lazy-acres-map-style')==='satellite'?'satellite':'street',pendingActivityLocation=null;const trip=()=>state.trips.find(t=>t.id===active),persist=()=>{cloudSave(state);render()},formatDate=s=>s?new Date(s+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Dates flexible',forTrip=(key)=>state[key].filter(x=>x.tripId===active),geo=x=>x.lat!=null&&x.lng!=null&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng));
function showTrip(id){if(!state.trips.some(t=>t.id===id))return;discoveryMarkers?.clearLayers();window.__tripSuggestions=[];addingPlace=false;expandedMap=false;syncMapMode();syncExpanded();active=id;sessionStorage.setItem(SESSION,id);tab='explore';render();const t=trip();if(t.lat!=null&&t.lng!=null){map?.setView([t.lat,t.lng],10)}else if(t.destination){searchLocation(t.destination,true)}}
function exitTrip(){discoveryMarkers?.clearLayers();window.__tripSuggestions=[];active=null;addingPlace=false;expandedMap=false;syncMapMode();syncExpanded();sessionStorage.removeItem(SESSION);render()}
function render(){const t=trip();$('#home').classList.toggle('hidden',!!t);$('#workspace').classList.toggle('hidden',!t);$('#context').textContent=t?'TRIP WORKSPACE':'THE OPEN ROAD IS CALLING';$('#tripCards').innerHTML=state.trips.length?state.trips.map(x=>'<button class="trip" data-open="'+esc(x.id)+'"><span class="chip">Open trip</span><strong>'+esc(x.name)+'</strong><span>'+esc(x.destination||'Destination undecided')+'</span><small>'+formatDate(x.start)+(x.end?' – '+formatDate(x.end):'')+'</small></button>').join(''):'<p class="empty">No trips yet. Create a trip to begin exploring.</p>';if(!t)return;
$('#tripTitle').textContent=t.name;$('#tripSub').textContent=(t.destination||'Explore anywhere')+' · '+formatDate(t.start)+(t.end?' – '+formatDate(t.end):'');
TABS.forEach(n=>{$('#'+n).classList.toggle('hidden',n!==tab);document.querySelector('[data-tab="'+n+'"]').classList.toggle('active',n===tab)});if(tab==='explore')setTimeout(initMap,0);
$('#placeList').innerHTML=forTrip('places').length?forTrip('places').map(x=>'<div class="day"><div class="row"><strong>'+esc(x.name)+'</strong><button class="quiet small" data-remove="places:'+esc(x.id)+'">Remove</button></div><div class="muted" style="font-size:12px">'+esc(x.category||'Saved place')+(x.location?' · '+esc(x.location):'')+'</div><p>'+esc(x.notes||'')+'</p><div class="row wrap">'+(geo(x)?'<button class="quiet small" data-locate="'+esc(x.id)+'">Show on map</button>':'')+'<button class="secondary small" data-plan="'+esc(x.id)+'">Add to itinerary</button></div></div>').join(''):'<p class="empty">No saved places yet. Explore the map and tap somewhere interesting.</p>';
$('#activityList').innerHTML=forTrip('activities').length?forTrip('activities').slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(x=>'<div class="day"><div class="row"><strong>'+esc(x.title)+'</strong><button class="quiet small" data-remove="activities:'+esc(x.id)+'">Remove</button></div><div class="muted" style="font-size:12px">'+esc(x.category||'Activity')+' · '+formatDate(x.date)+(x.endDate?' – '+formatDate(x.endDate):'')+'</div><div>'+esc(x.notes||'')+'</div><div class="row wrap"><button class="secondary small" data-unschedule="'+esc(x.id)+'">Move to Saved Places</button></div></div>').join(''):'<p class="empty">Your itinerary is empty. Add activities or bring over a saved place.</p>';
$('#noteList').innerHTML=forTrip('notes').length?forTrip('notes').map(x=>'<div class="day"><div class="row"><strong>'+esc(x.title)+'</strong><button class="quiet small" data-remove="notes:'+esc(x.id)+'">Remove</button></div><p style="white-space:pre-wrap">'+esc(x.body)+'</p></div>').join(''):'<p class="empty">Save links, questions, reservations, and research here.</p>';
const packing=forTrip('packing');const checked=packing.filter(x=>x.done).length;$('#packProgress').textContent=checked+' of '+packing.length+' items packed · '+PACKING_CATEGORIES.length+' categories';$('#packList').innerHTML=PACKING_CATEGORIES.map(c=>{const items=packing.filter(x=>(x.category||'trip-misc')===c.key);return '<details class="pack-category" '+(items.length?'open':'')+'><summary><span class="pack-category-name">'+esc(c.label)+'</span><span class="pack-count">'+items.filter(x=>x.done).length+' / '+items.length+'</span></summary><div class="pack-items">'+(items.length?items.map(x=>'<div class="check"><input type="checkbox" aria-label="Packed '+esc(x.title)+'" data-pack="'+esc(x.id)+'" '+(x.done?'checked':'')+'><span style="'+(x.done?'text-decoration:line-through;opacity:.6':'')+'">'+esc(x.title)+'</span><button class="quiet small" style="margin-left:auto" data-remove="packing:'+esc(x.id)+'">Remove</button></div>').join(''):'<p class="muted pack-empty">Nothing on this list yet.</p>')+'</div></details>'}).join('');refreshMarkers();}
function setTab(n){if(!trip()||!TABS.includes(n))return;if(n!=='explore'&&expandedMap){expandedMap=false;syncExpanded()}addingPlace=false;syncMapMode();tab=n;render()}
function setTileStatus(message,show){const box=$('#tileStatus');if(!box)return;box.classList.toggle('hidden',!show);$('#tileStatusText').textContent=message;}
function setMapStyle(style){
 if(!map||!baseLayers||!baseLayers[style])return;
 if(tileLayer)map.removeLayer(tileLayer);
 mapStyle=style;
 tileLayer=baseLayers[style];
 tileErrors=0;
 map.addLayer(tileLayer);
 tileLayer.bringToBack();
 localStorage.setItem('lazy-acres-map-style',style);
 const button=$('#mapStyle');
 button.textContent=style==='satellite'?'▤ Street map':'▣ Satellite';
 button.setAttribute('aria-pressed',String(style==='satellite'));
 setTileStatus('',false);
}
function registerBaseLayer(layer){
 layer.on('loading',()=>{if(map?.hasLayer(layer))setTileStatus('Loading map imagery…',true)});
 layer.on('load',()=>{if(map?.hasLayer(layer))setTileStatus(tileErrors?'Some map tiles could not load. Retry if needed.':'',tileErrors>0)});
 layer.on('tileerror',()=>{if(map?.hasLayer(layer)){tileErrors++;setTileStatus('Some map tiles could not load. Check reception or retry.',true)}});
}
$('#mapStyle').addEventListener('click',()=>setMapStyle(mapStyle==='street'?'satellite':'street'));
$('#retryTiles').addEventListener('click',()=>{if(!tileLayer)return;tileErrors=0;setTileStatus('Retrying map tiles…',true);map?.invalidateSize({pan:false});tileLayer.redraw()});
function syncMapMode(){const btn=$('#mapAdd'),frame=$('#mapFrame');btn.setAttribute('aria-pressed',String(addingPlace));btn.textContent=addingPlace?'✕ Cancel adding':'＋ Add a place';frame.classList.toggle('placing',addingPlace);$('#mapHint').textContent=addingPlace?'Tap the map where you want to save a place':'Drag to explore · Pinch to zoom';}
function syncExpanded(){const frame=$('#mapFrame'),btn=$('#mapFullscreen');frame.classList.toggle('expanded',expandedMap);document.body.classList.toggle('map-expanded',expandedMap);btn.setAttribute('aria-pressed',String(expandedMap));btn.textContent=expandedMap?'↙ Close map':'⛶ Expand map';setTimeout(()=>map?.invalidateSize({pan:false,debounceMoveend:true}),100);}
$('#mapAdd').addEventListener('click',()=>{addingPlace=!addingPlace;syncMapMode()});
$('#mapFullscreen').addEventListener('click',()=>{expandedMap=!expandedMap;syncExpanded()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expandedMap){expandedMap=false;syncExpanded()}});
function initMap(){if(!trip()||tab!=='explore')return;if(typeof L==='undefined'){$('#map').textContent='Map could not load. Check your connection.';return}if(!map){map=L.map('map',{zoomControl:false,tap:false,scrollWheelZoom:true,wheelPxPerZoomLevel:180,wheelDebounceTime:80,zoomSnap:0.5,touchZoom:'center',bounceAtZoomLimits:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([46.55,-87.4],8);L.control.zoom({position:'bottomright'}).addTo(map);baseLayers={street:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19,keepBuffer:6,updateWhenIdle:false,updateWhenZooming:false}),satellite:L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery: USDA, USGS The National Map',maxZoom:19,maxNativeZoom:16,keepBuffer:6,updateWhenIdle:false,updateWhenZooming:false})};Object.values(baseLayers).forEach(registerBaseLayer);setMapStyle(mapStyle);map.on('moveend zoomend',()=>{if(tileErrors)setTileStatus('Some map tiles may be missing. Retry if needed.',true)});markers=L.layerGroup().addTo(map);discoveryMarkers=L.layerGroup().addTo(map);if(typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>{if(map&&trip()&&tab==='explore')map.invalidateSize({pan:false,debounceMoveend:true})}).observe($('#map'))};map.on('click',e=>{if(addingPlace){addingPlace=false;syncMapMode()}showMapPlaceMenu(e.latlng)});map.on('contextmenu',e=>showMapPlaceMenu(e.latlng));const t=trip();if(t?.lat!=null&&t?.lng!=null)map.setView([t.lat,t.lng],10)}setTimeout(()=>map?.invalidateSize({pan:false,debounceMoveend:true}),100);refreshMarkers()}
const PLACE_CATEGORIES=['Lodging','Restaurants','Wineries','Shopping','Hiking','Boating','Fishing','Events','Attractions','Other'];
const FLAG_COLORS={Lodging:'#845ec2',Restaurants:'#d65a44',Wineries:'#8e396f',Shopping:'#ca8422',Hiking:'#307d4d',Boating:'#187a9b',Fishing:'#2675c9',Events:'#d13f79',Attractions:'#4d8f83',Other:'#717885'};
const visibleCategories=new Set(PLACE_CATEGORIES);
const normalizedCategory=x=>PLACE_CATEGORIES.includes(x)?x:'Other';
function flagIcon(category,state){
 const color=FLAG_COLORS[normalizedCategory(category)];
 const sign=state==='both'?'◈':state==='itinerary'?'◆':'●';
 const html='<span class="map-pin map-pin-'+state+'" style="--pin-color:'+color+'">'+sign+'</span>';
 return L.divIcon({className:'category-pin-icon',html,iconSize:[28,32],iconAnchor:[14,30],popupAnchor:[0,-27]});
}
function buildMapFilters(){
 const host=$('#mapCategoryFilters');if(!host)return;
 host.innerHTML=PLACE_CATEGORIES.map(c=>'<label class="map-filter"><input type="checkbox" data-map-category="'+esc(c)+'" '+(visibleCategories.has(c)?'checked':'')+'><span class="map-filter-dot" style="background:'+FLAG_COLORS[c]+'"></span>'+esc(c)+'</label>').join('');
}
$('#mapCategoryFilters').addEventListener('change',e=>{const input=e.target.closest('[data-map-category]');if(!input)return;if(input.checked)visibleCategories.add(input.dataset.mapCategory);else visibleCategories.delete(input.dataset.mapCategory);refreshMarkers()});
function syncActivityCategory(){const f=$('#activityForm'),c=f.elements.category.value,lodging=c==='Lodging';$('#activityDateLabel').textContent=lodging?'Check-in date':c==='Events'?'Event date':c==='Restaurants'?'Dining date':c==='Wineries'?'Winery visit date':c==='Shopping'?'Shopping date':c==='Hiking'?'Hiking date':c==='Boating'?'Boating date':c==='Fishing'?'Fishing date':'Visit date';$('#activityEndField').hidden=!lodging;f.elements.endDate.required=lodging;if(!lodging)f.elements.endDate.value='';$('#activityHoursField').hidden=lodging||c==='Hiking'||c==='Boating'||c==='Fishing';}
$('#activityCategory').addEventListener('change',syncActivityCategory);
function cleanImportedNotes(notes){return String(notes||'').replace(/^Discovered via Geoapify[^\n]*$/gmi,'').replace(/^building\.[\w.]+$/gmi,'').trim();}
async function loadItineraryHours(geoapifyId){try{const d=await getDiscoveryPlaceDetails({placeId:geoapifyId});if(pendingActivityLocation?.geoapifyId===geoapifyId&&!$('#activityHours').value)$('#activityHours').value=d.opening_hours||d.datasource?.raw?.opening_hours||'';}catch{}}
function fillActivity({name,category='Other',notes='',lat=null,lng=null,placeId='',geoapifyId='',hours=''}){setTab('itinerary');const f=$('#activityForm');f.reset();f.elements.title.value=name;f.elements.category.value=normalizedCategory(category);f.elements.notes.value=cleanImportedNotes(notes);f.elements.hours.value=hours;f.elements.date.value=trip()?.start||'';if(f.elements.category.value==='Lodging'&&trip()?.end)f.elements.endDate.value=trip().end;pendingActivityLocation={placeId,lat,lng,geoapifyId};syncActivityCategory();f.elements.date.focus();if(geoapifyId&&!hours)loadItineraryHours(geoapifyId);}

function detectedCategory(tags=[]){
 const c=tags.join(' ').toLowerCase();
 if(/winery|vineyard/.test(c))return 'Wineries';
 if(/accommodation|hotel|motel|guest_house|hostel/.test(c))return 'Lodging';
 if(/catering|restaurant|cafe|fast_food/.test(c))return 'Restaurants';
 if(/commercial|shop|shopping/.test(c))return 'Shopping';
 if(/hiking|trail/.test(c))return 'Hiking';
 if(/boat|marina|slipway/.test(c))return 'Boating';
 if(/fishing/.test(c))return 'Fishing';
 if(/event/.test(c))return 'Events';
 if(/tourism|entertainment|natural|leisure/.test(c))return 'Attractions';
 return 'Other';
}
function mapMenuContent(latlng,name='',notes='',savedId='',category='Other'){
 const el=document.createElement('div'),title=document.createElement('strong');
 title.textContent=name||'Place on map';el.append(title,document.createElement('br'));
 const actions=savedId?[['Add to itinerary',()=>planPlace(savedId)]]:[
  ['Save place',()=>openPlace(latlng.lat,latlng.lng,name,notes,'places',category)],
  ['Add to itinerary',()=>openPlace(latlng.lat,latlng.lng,name,notes,'itinerary',category)]
 ];
 for(const [label,action] of actions){
  const btn=document.createElement('button');btn.type='button';btn.className='secondary small';btn.textContent=label;
  btn.style.margin='5px 5px 0 0';btn.onclick=()=>{map?.closePopup();action()};el.append(btn);
 }
 return el;
}
let mapLookupToken=0;
async function showMapPlaceMenu(latlng,name='',notes=''){
 if(!map)return;
 const popup=L.popup().setLatLng(latlng).setContent(mapMenuContent(latlng,name,notes)).openOn(map);
 if(name)return;
 const key=window.LAZY_ACRES_GEOAPIFY_KEY;
 if(!key||key==='PASTE_YOUR_GEOAPIFY_BROWSER_KEY_HERE')return;
 const token=++mapLookupToken,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
 const loading=document.createElement('div');loading.textContent='Identifying nearby places…';
 const fallback=mapMenuContent(latlng);
 loading.append(fallback);popup.setContent(loading);
 try{
  const params=new URLSearchParams({
   categories:'accommodation,catering,commercial,tourism,entertainment,leisure,production.winery',
   filter:'circle:'+latlng.lng.toFixed(6)+','+latlng.lat.toFixed(6)+',90',
   bias:'proximity:'+latlng.lng.toFixed(6)+','+latlng.lat.toFixed(6),
   limit:'12',apiKey:key
  });
  const res=await fetch('https://api.geoapify.com/v2/places?'+params,{signal:controller.signal});
  if(!res.ok)throw Error('Nearby place lookup failed');
  const json=await res.json();
  if(token!==mapLookupToken||!map?.hasLayer(popup))return;
  const places=(json.features||[]).map(f=>{
   const p=f.properties||{},coords=f.geometry?.coordinates;
   return {name:p.name||'',lat:Number(p.lat??coords?.[1]),lng:Number(p.lon??coords?.[0]),address:p.formatted||'',category:detectedCategory(p.categories||[])};
  }).filter(x=>x.name&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)).slice(0,7);
  if(!places.length){popup.setContent(mapMenuContent(latlng));return;}
  if(places.length===1){const place=places[0];popup.setContent(mapMenuContent({lat:place.lat,lng:place.lng},place.name,place.address,'',place.category));return;}
  const box=document.createElement('div'),heading=document.createElement('strong');
  heading.textContent='Which place did you mean?';box.append(heading);
  for(const place of places){
   const row=document.createElement('button');row.type='button';row.className='quiet small';
   row.style.display='block';row.style.marginTop='6px';row.style.textAlign='left';
   row.textContent=place.name+' · '+place.category;
   row.title=place.address;
   row.onclick=()=>popup.setContent(mapMenuContent({lat:place.lat,lng:place.lng},place.name,place.address,'',place.category));
   box.append(row);
  }
  const manual=document.createElement('button');manual.type='button';manual.className='secondary small';
  manual.style.marginTop='8px';manual.textContent='Use exact clicked location';
  manual.onclick=()=>popup.setContent(mapMenuContent(latlng));box.append(manual);
  popup.setContent(box);
 }catch(error){if(token===mapLookupToken&&map?.hasLayer(popup))popup.setContent(mapMenuContent(latlng));}
 finally{clearTimeout(timer);}
}
const placeDetailCache=new Map();
function safeExternalURL(value){
 try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url.href:null;}catch{return null;}
}
function placePhone(data){
 const candidate=data?.contact?.phone||data?.contact?.phone_international||data?.phone||data?.datasource?.raw?.['contact:phone']||data?.datasource?.raw?.phone;
 return typeof candidate==='string'?candidate.trim():'';
}
function placeWebsite(data){
 return safeExternalURL(data?.website||data?.contact?.website||data?.datasource?.raw?.website||data?.datasource?.raw?.['contact:website']||'');
}
async function getDiscoveryPlaceDetails(place){
 if(!place.placeId)return {};
 if(placeDetailCache.has(place.placeId))return placeDetailCache.get(place.placeId);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const params=new URLSearchParams({id:place.placeId,features:'details',apiKey:window.LAZY_ACRES_GEOAPIFY_KEY});
  const response=await fetch('https://api.geoapify.com/v2/place-details?'+params.toString(),{signal:controller.signal});
  if(!response.ok)throw Error('Geoapify place details returned HTTP '+response.status);
  const data=await response.json();
  const details=(data.features||[]).find(f=>f.properties?.feature_type==='details')?.properties||(data.features||[]).find(f=>f.properties)?.properties||{};
  if(placeDetailCache.size>=100)placeDetailCache.delete(placeDetailCache.keys().next().value);
  placeDetailCache.set(place.placeId,details);
  return details;
 }finally{clearTimeout(timer);}
}
function appendContactInfo(host,data){
 const phone=placePhone(data),website=placeWebsite(data);
 if(phone){
  const row=document.createElement('p');row.append(document.createTextNode('Phone: '));
  const link=document.createElement('a');link.href='tel:'+phone.replace(/[^+0-9]/g,'');link.textContent=phone;row.append(link);host.append(row);
 }
 if(website){
  const row=document.createElement('p'),link=document.createElement('a');link.href=website;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Website';row.append(link);host.append(row);
 }
}
function makeDiscoveryPopup(place){
 const wrap=document.createElement('div');wrap.className='discovery-info';
 const heading=document.createElement('strong');heading.textContent=place.name;wrap.append(heading);
 const subtitle=document.createElement('div');subtitle.className='muted';subtitle.textContent=place.address||place.kind;wrap.append(subtitle);
 const info=document.createElement('div');info.className='discovery-info-body';info.textContent='Loading available place details…';wrap.append(info);
 const actions=mapMenuContent({lat:place.lat,lng:place.lng},place.name,'Discovered via Geoapify · '+place.kind+(place.address?' · '+place.address:''),'',detectedCategory([place.kind]));
 actions.querySelector('strong')?.remove();wrap.append(actions);
 let requestStarted=false;
 async function load(){
  if(requestStarted)return;requestStarted=true;
  if(!place.placeId){info.textContent='No additional place information available.';return;}
  try{
   const details=await getDiscoveryPlaceDetails(place);
   info.replaceChildren();
   const description=details.description||details.description_international?.en;
   const hours=details.opening_hours;
   if(description){const el=document.createElement('p');el.textContent=description;info.append(el);}
   if(hours){const el=document.createElement('p');el.textContent='Hours: '+hours;info.append(el);}
   appendContactInfo(info,details);
   if(!info.childNodes.length){info.textContent='No description, hours or website listed for this place.';}
  }catch(error){info.textContent='Additional details unavailable. You can still save this place or add it to your itinerary.';}
 }
 return {content:wrap,load};
}
function renderDiscoveryMarkers(found){
 if(!map||!discoveryMarkers)return;
 discoveryMarkers.clearLayers();
 found.forEach(x=>{
  const icon=L.divIcon({className:'discovery-marker-icon',html:'<span class="discovery-map-pin" aria-hidden="true">●</span>',iconSize:[22,28],iconAnchor:[11,26],popupAnchor:[0,-24]});
  const popup=makeDiscoveryPopup(x);
  const marker=L.marker([x.lat,x.lng],{icon,title:x.name,alt:x.name}).addTo(discoveryMarkers).bindPopup(popup.content);
  marker.bindTooltip(x.name,{direction:'top',offset:[0,-20]});
  marker.on('popupopen',()=>popup.load());
 });
}
function refreshMarkers(){
 if(!map||!markers)return;markers.clearLayers();
 const places=forTrip('places'),activities=forTrip('activities');
 const plannedIds=new Set(activities.map(x=>x.placeId).filter(Boolean));
 const savedCoords=new Set();
 for(const x of places){
   if(!geo(x))continue;
   const key=Number(x.lat).toFixed(5)+','+Number(x.lng).toFixed(5);
   savedCoords.add(key);
   const category=normalizedCategory(x.category);
   if(!visibleCategories.has(category))continue;
   const both=plannedIds.has(x.id)||activities.some(a=>a.lat!=null&&a.lng!=null&&Math.abs(Number(a.lat)-Number(x.lat))<0.00005&&Math.abs(Number(a.lng)-Number(x.lng))<0.00005);
   const marker=L.marker([x.lat,x.lng],{icon:flagIcon(category,both?'both':'saved')}).addTo(markers);
   marker.bindPopup(mapMenuContent({lat:x.lat,lng:x.lng},x.name,x.notes||'',x.id,category));
 }
 for(const x of activities){
   if(!geo(x))continue;
   const key=Number(x.lat).toFixed(5)+','+Number(x.lng).toFixed(5);
   if((x.placeId&&places.some(p=>p.id===x.placeId&&geo(p)))||savedCoords.has(key))continue;
   const category=normalizedCategory(x.category);
   if(!visibleCategories.has(category))continue;
   const el=document.createElement('div'),title=document.createElement('strong');
   title.textContent=x.title;el.append(title,document.createElement('br'));
   const info=document.createElement('span');info.textContent='Itinerary · '+formatDate(x.date)+(x.endDate?' – '+formatDate(x.endDate):'');el.append(info);
   L.marker([x.lat,x.lng],{icon:flagIcon(category,'itinerary')}).addTo(markers).bindPopup(el);
 }
 buildMapFilters();
}
function openPlace(lat,lng,name,notes,destination='places',category='Other'){
 selectedPoint={lat:Number(lat),lng:Number(lng)};placeDestination=destination;
 $('#placeName').value=name||'';$('#placeNotes').value=notes||'';
 const categories=$('#placeForm').elements.category;categories.value=PLACE_CATEGORIES.includes(category)?category:'Other';
 $('#coordinates').value=Number(lat).toFixed(5)+', '+Number(lng).toFixed(5);
 $('#placeDialog').querySelector('h2').textContent=destination==='itinerary'?'Add to itinerary':'Save this stop';
 $('#placeForm').querySelector('button.primary').textContent=destination==='itinerary'?'Continue to itinerary':'Save to trip';
 $('#placeDialog').showModal();
}
async function searchLocation(q,store=false){if(!q.trim())return;if(!store&&document.activeElement instanceof HTMLElement)document.activeElement.blur();$('#searchButton').disabled=true;const token=++searchToken;try{const response=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}});if(!response.ok)throw Error('Search service unavailable');const results=await response.json();if(token!==searchToken)return;if(!results.length){if(!store)alert('No location found. Try a more specific place name.');return}const p=results[0],lat=Number(p.lat),lng=Number(p.lon);if(store&&trip()){trip().lat=lat;trip().lng=lng;persist()}setTab('explore');setTimeout(()=>{initMap();map?.setView([lat,lng],11)},100)}catch(e){if(!store)alert('Location search failed: '+e.message)}finally{$('#searchButton').disabled=false}}
// Geoapify Places API: category/name search constrained to the visible map.
const DISCOVERY_CATEGORIES={
 lodging:'accommodation',
 restaurants:'catering.restaurant,catering.cafe',
 wineries:'production.winery',
 shopping:'commercial',
 hiking:'leisure,natural',
 boating:'leisure',
 fishing:'leisure,sport',
 events:'entertainment',
 attractions:'tourism,entertainment,natural',
 other:'tourism,entertainment,catering,commercial,leisure,natural,accommodation,production.winery',
 all:'tourism,entertainment,catering,commercial,leisure,natural,accommodation,production.winery'
};
const DISCOVERY_TERMS=[
 {pattern:/winer(y|ies)|vineyard|wine tasting/i,categories:'production.winery'},
 {pattern:/restaurant|cafe|coffee/i,categories:'catering.restaurant,catering.cafe'},
 {pattern:/museum|historical/i,categories:'entertainment.museum,tourism.sights'},
 {pattern:/antique|thrift/i,categories:'commercial.antiques,commercial.second_hand'},
 {pattern:/shop|shopping/i,categories:'commercial'},
 {pattern:/hiking|trail/i,categories:'leisure,natural'},
 {pattern:/boat|marina|fishing/i,categories:'leisure,sport'},
 {pattern:/waterfall|falls/i,categories:'natural,tourism.sights'},
 {pattern:/lighthouse/i,categories:'tourism.sights'}
];
const discoveryCache=new Map();
async function discover(){
 if(!map)return;
 const bounds=map.getBounds(),category=$('#category').value,term=$('#discoverText').value.trim();
 const button=$('#discover'),status=$('#discoverStatus'),results=$('#suggestions');
 const key=window.LAZY_ACRES_GEOAPIFY_KEY;
 if(!key||key==='PASTE_YOUR_GEOAPIFY_BROWSER_KEY_HERE'){
   status.textContent='Nearby discovery is not configured yet.';
   return;
 }
 const west=bounds.getWest(),east=bounds.getEast(),south=bounds.getSouth(),north=bounds.getNorth();
 if(west < -180||east > 180||east<=west){
   status.textContent='Move the map to an area that does not cross the international date line.';return;
 }
 const match=DISCOVERY_TERMS.find(x=>x.pattern.test(term));
 const categories=match?.categories||DISCOVERY_CATEGORIES[category]||DISCOVERY_CATEGORIES.all;
 const nameFilter=term&&!match?term:'';
 const params=new URLSearchParams({categories,filter:'rect:'+west.toFixed(5)+','+south.toFixed(5)+','+east.toFixed(5)+','+north.toFixed(5),limit:'60',apiKey:key});
 if(nameFilter)params.set('name',nameFilter);
 const cacheKey=[categories,nameFilter,params.get('filter')].join('|');
 button.disabled=true;status.textContent='Searching visible map area…';results.innerHTML='';window.__tripSuggestions=[];discoveryMarkers?.clearLayers();
 try{
   let features=discoveryCache.get(cacheKey);
   if(!features){
     const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
     try{
       const response=await fetch('https://api.geoapify.com/v2/places?'+params.toString(),{signal:controller.signal});
       if(!response.ok){
         if(response.status===401||response.status===403)throw Error('Geoapify authorization failed (HTTP '+response.status+'). Check the key and its origin/referrer restrictions.');
         if(response.status===429)throw Error('Geoapify daily allowance or request limit reached (HTTP 429).');
         throw Error('Geoapify returned HTTP '+response.status+'.');
       }
       const data=await response.json();
       if(!Array.isArray(data.features))throw Error('Unexpected response from Geoapify.');
       features=data.features;
       if(discoveryCache.size>=30)discoveryCache.delete(discoveryCache.keys().next().value);
       discoveryCache.set(cacheKey,features);
     }finally{clearTimeout(timeout);}
   }
   const found=features.map(f=>{
     const p=f.properties||{},coords=f.geometry?.coordinates;
     return {name:p.name||p.address_line1||'',lat:Number(p.lat??coords?.[1]),lng:Number(p.lon??coords?.[0]),kind:(p.categories||[]).find(x=>x!=='building')||'Point of interest',address:p.formatted||'',placeId:p.place_id||'',phone:placePhone(p),website:placeWebsite(p),description:p.description||''};
   }).filter(x=>x.name&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)).slice(0,60);
   window.__tripSuggestions=found;
   renderDiscoveryMarkers(found);
   status.textContent=found.length+' suggestions within the visible map area'+(features.length===60?' (showing first matches)':'')+'.';
   results.innerHTML=found.length?found.map((x,i)=>'<div class="poi"><strong>'+esc(x.name)+'</strong><p>'+esc(x.kind.replaceAll(/[._]/g,' '))+(x.address?' · '+esc(x.address):'')+'</p>'+(x.description?'<p>'+esc(x.description)+'</p>':'')+(x.phone?'<p>Phone: <a href="tel:'+esc(x.phone.replace(/[^+0-9]/g,''))+'">'+esc(x.phone)+'</a></p>':'')+(x.website?'<p><a href="'+esc(x.website)+'" target="_blank" rel="noopener noreferrer">Website</a></p>':'')+'<div class="poi-extra" id="poi-extra-'+i+'"></div><div class="row wrap"><button class="quiet small" data-preview="'+i+'">Show on map</button><button class="quiet small" data-place-details="'+i+'">More details</button><button class="secondary small" data-suggest="'+i+'">Save to trip</button></div></div>').join(''):'<p class="empty">No matching places found here. Try another category, name, or map area.</p>';

 }catch(error){status.textContent=error.name==='AbortError'?'Place search timed out. Try again.':'Nearby discovery failed: '+error.message;}
 finally{button.disabled=false;}
}

function planPlace(id){const x=state.places.find(p=>p.id===id&&p.tripId===active);if(!x)return;fillActivity({name:x.name,category:x.category,notes:x.notes,placeId:x.id,lat:x.lat??null,lng:x.lng??null,geoapifyId:x.geoapifyId||'',hours:x.hours||''})}
function form(sel,handler){$(sel).addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(handler(d)!==false){e.target.reset();persist()}})}
$('#newTrip').onclick=()=>$('#tripDialog').showModal();$('#cancelTrip').onclick=()=>$('#tripDialog').close();$('#exitTrip').onclick=exitTrip;$('#cancelPlace').onclick=()=>$('#placeDialog').close();$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)};$('#searchButton').onclick=()=>searchLocation($('#searchText').value);$('#searchText').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchLocation(e.target.value)}};$('#discover').onclick=discover;$('#discoverText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!$('#discover').disabled)discover();}});$('#tripCenter').onclick=()=>{const t=trip();if(t?.lat!=null&&t?.lng!=null)map?.setView([t.lat,t.lng],10);else if(t?.destination)searchLocation(t.destination,true)};
form('#tripForm',d=>{if(d.start&&d.end&&d.end<d.start){alert('End date must be on or after start date.');return false}const t={id:uid(),...d};state.trips.push(t);$('#tripDialog').close();setTimeout(()=>showTrip(t.id),0)});
form('#placeForm',d=>{
 if(!selectedPoint)return false;
 const target=placeDestination,point={...selectedPoint};
 $('#placeDialog').close();
 if(target==='itinerary'){
   fillActivity({name:d.name,category:d.category,notes:d.notes,lat:point.lat,lng:point.lng});
   return false;
 }
 state.places.unshift({id:uid(),tripId:active,...d,...point});
});
form('#manualPlace',d=>state.places.unshift({id:uid(),tripId:active,...d,category:'Saved place'}));form('#activityForm',d=>{
 if(d.category==='Lodging'&&(!d.endDate||d.endDate<=d.date)){alert('Checkout must be after check-in.');return false;}
 const loc=pendingActivityLocation||{};
 let saved=loc.placeId?state.places.find(p=>p.id===loc.placeId&&p.tripId===active):null;
 // A mapped itinerary location is also a saved place, with a single stable ID.
 if(!saved&&loc.lat!=null&&loc.lng!=null){
   saved=state.places.find(p=>p.tripId===active&&geo(p)&&
     Math.abs(Number(p.lat)-Number(loc.lat))<0.00005&&
     Math.abs(Number(p.lng)-Number(loc.lng))<0.00005);
   if(!saved){
     saved={id:uid(),tripId:active,name:d.title,category:normalizedCategory(d.category),
       location:'',notes:cleanImportedNotes(d.notes),geoapifyId:loc.geoapifyId||'',hours:d.hours||'',lat:Number(loc.lat),lng:Number(loc.lng)};
     state.places.unshift(saved);
   }
 }
 state.activities.push({id:uid(),tripId:active,...d,endDate:d.category==='Lodging'?d.endDate:'',
   category:normalizedCategory(d.category),placeId:saved?.id||'',lat:loc.lat??null,lng:loc.lng??null,hours:d.hours||'',notes:cleanImportedNotes(d.notes)});
 pendingActivityLocation=null;
});form('#noteForm',d=>state.notes.unshift({id:uid(),tripId:active,...d}));form('#packForm',d=>state.packing.push({id:uid(),tripId:active,title:d.item,category:PACKING_CATEGORIES.some(c=>c.key===d.category)?d.category:'trip-misc',done:false}));
document.addEventListener('click',async e=>{
 const detailsButton=e.target.closest('[data-place-details]');
 if(detailsButton){
  const i=Number(detailsButton.dataset.placeDetails),place=window.__tripSuggestions?.[i],target=$('#poi-extra-'+i);
  if(!place||!target)return;
  detailsButton.disabled=true;target.textContent='Loading place details…';
  try{
   const details=await getDiscoveryPlaceDetails(place);
   if(window.__tripSuggestions?.[i]!==place)return;
   target.replaceChildren();
   const description=details.description||details.description_international?.en;
   if(description){const el=document.createElement('p');el.textContent=description;target.append(el);}
   if(details.opening_hours){const el=document.createElement('p');el.textContent='Hours: '+details.opening_hours;target.append(el);}
   appendContactInfo(target,details);
   if(!target.childNodes.length)target.textContent='No further details available for this listing.';
  }catch(error){target.textContent='Additional details are unavailable right now.';}
  finally{detailsButton.disabled=false;}
  return;
 }
 const open=e.target.closest('[data-open]');if(open)showTrip(open.dataset.open);const rm=e.target.closest('[data-remove]');if(rm){const [key,id]=rm.dataset.remove.split(':');if(confirm('Remove this item from the trip?')){state[key]=state[key].filter(x=>x.id!==id);persist()}}const unschedule=e.target.closest('[data-unschedule]');if(unschedule){const item=state.activities.find(a=>a.id===unschedule.dataset.unschedule&&a.tripId===active);if(item){if(!state.places.some(p=>p.id===item.placeId)){state.places.unshift({id:uid(),tripId:active,name:item.title,category:normalizedCategory(item.category),notes:item.notes||'',hours:item.hours||'',location:'',lat:item.lat??null,lng:item.lng??null});}state.activities=state.activities.filter(a=>a.id!==item.id);persist();}return;}const loc=e.target.closest('[data-locate]');if(loc){const x=state.places.find(p=>p.id===loc.dataset.locate);if(x&&geo(x)){setTab('explore');setTimeout(()=>map?.setView([x.lat,x.lng],14),100)}}const plan=e.target.closest('[data-plan]');if(plan)planPlace(plan.dataset.plan);const preview=e.target.closest('[data-preview]');if(preview){const x=window.__tripSuggestions?.[Number(preview.dataset.preview)];if(x){map?.setView([x.lat,x.lng],15);const discovered=discoveryMarkers?.getLayers().find(m=>{const q=m.getLatLng();return Math.abs(q.lat-x.lat)<0.000001&&Math.abs(q.lng-x.lng)<0.000001});if(discovered)discovered.openPopup();else L.popup().setLatLng([x.lat,x.lng]).setContent(mapMenuContent({lat:x.lat,lng:x.lng},x.name,'Discovered via Geoapify · '+x.kind+(x.address?' · '+x.address:''),'',detectedCategory([x.kind]))).openOn(map)}}const suggest=e.target.closest('[data-suggest]');if(suggest){const x=window.__tripSuggestions?.[Number(suggest.dataset.suggest)];if(x)openPlace(x.lat,x.lng,x.name,'Discovered via Geoapify · '+x.kind+(x.address?' · '+x.address:''))}});
$('#packList').addEventListener('change',e=>{if(e.target.dataset.pack){const x=state.packing.find(p=>p.id===e.target.dataset.pack&&p.tripId===active);if(x){x.done=e.target.checked;persist()}}});
if(!trip())active=null;render();if(active){const t=trip();if(t?.lat==null&&t?.destination)searchLocation(t.destination,true)}
};
