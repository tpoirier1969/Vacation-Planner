window.startVacationPlanner=(initialState,cloudSave)=>{'use strict';
const PACKING_CATEGORIES=[{"key":"trip-clothing","label":"Clothing"},{"key":"trip-tents","label":"Tent(s)"},{"key":"trip-fishing-gear","label":"Fishing Gear"},{"key":"trip-boat-stuff","label":"Boat Stuff"},{"key":"trip-cooking","label":"Cooking"},{"key":"trip-food","label":"Food"},{"key":"trip-toiletries","label":"Toiletries"},{"key":"trip-bedding","label":"Bedding / Sleeping"},{"key":"trip-first-aid","label":"First Aid / Medicine"},{"key":"trip-tools","label":"Tools / Repair"},{"key":"trip-electronics","label":"Electronics / Charging"},{"key":"trip-paperwork","label":"Paperwork / Licenses"},{"key":"trip-dog-stuff","label":"Dog Stuff"},{"key":"trip-misc","label":"Misc"}];
const Itinerary=window.VacationItinerary,Ideas=window.VacationIdeas,Discovery=window.VacationDiscovery;
if(!Itinerary||!Ideas||!Discovery)throw Error('Trip planning and discovery modules failed to load.');
const SESSION='lazy-acres-active-trip',TABS=['explore','places','itinerary','notes','packing'];const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])),uid=()=>crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
let state=initialState,ideaFilter='all',ideaQuery='',itineraryView='all',routeUI=null;
let active=sessionStorage.getItem(SESSION),tab='explore',map,markers,discoveryMarkers,preview,selectedPoint,placeDestination='places',searchToken=0,addingPlace=false,expandedMap=false,tileLayer,tileErrors=0,baseLayers=null,mapStyle=localStorage.getItem('lazy-acres-map-style')==='satellite'?'satellite':'street',pendingActivityLocation=null;const trip=()=>state.trips.find(t=>t.id===active),persist=()=>{cloudSave(state);render()},formatDate=s=>s?new Date(s+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Dates flexible',forTrip=(key)=>state[key].filter(x=>x.tripId===active),geo=x=>x.lat!=null&&x.lng!=null&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng));
function showTrip(id){if(!state.trips.some(t=>t.id===id))return;setMobileSheet('collapsed');ideaFilter='all';ideaQuery='';itineraryView='all';$('#ideaSearch').value='';$('#itineraryView').value='all';discoveryMarkers?.clearLayers();window.__tripSuggestions=[];addingPlace=false;expandedMap=false;syncMapMode();syncExpanded();active=id;sessionStorage.setItem(SESSION,id);tab='explore';routeUI?.onTripChange();render();const t=trip();if(t.lat!=null&&t.lng!=null){map?.setView([t.lat,t.lng],10)}else if(t.destination){searchLocation(t.destination,true)}}
function exitTrip(){setMobileSheet('collapsed');routeUI?.cancelPick();ideaFilter='all';ideaQuery='';itineraryView='all';$('#ideaSearch').value='';$('#itineraryView').value='all';discoveryMarkers?.clearLayers();window.__tripSuggestions=[];active=null;addingPlace=false;expandedMap=false;syncMapMode();syncExpanded();sessionStorage.removeItem(SESSION);render()}
function editAndRemove(kind,x){
 return '<span class="entry-actions"><button class="quiet small" data-edit="'+kind+':'+esc(x.id)+'">Edit</button><button class="quiet small" data-remove="'+kind+':'+esc(x.id)+'">Remove</button></span>';
}
function ideaTiming(x){
 const items=[];
 if(x.date)items.push((x.fixedDate?'Fixed: ':'Possible: ')+formatDate(x.date)+(x.endDate?' – '+formatDate(x.endDate):''));
 if(x.time)items.push(Itinerary.formatTime(x.time)+(x.endTime?' – '+Itinerary.formatTime(x.endTime):''));
 return items.length?'<div class="muted small-details">'+esc(items.join(' · '))+'</div>':'';
}
function render(){const t=trip();document.body.classList.toggle('mobile-workspace',!!t);$('#home').classList.toggle('hidden',!!t);$('#workspace').classList.toggle('hidden',!t);$('#tripHero').classList.toggle('hidden',!t);$('#mastheadHome').classList.toggle('hidden',!!t);$('#context').textContent=t?'TRIP WORKSPACE':'THE OPEN ROAD IS CALLING';$('#tripCards').innerHTML=state.trips.length?state.trips.map(x=>'<button class="trip" data-open="'+esc(x.id)+'"><span class="chip">Open trip</span><strong>'+esc(x.name)+'</strong><span>'+esc(x.destination||'Destination undecided')+'</span><small>'+formatDate(x.start)+(x.end?' – '+formatDate(x.end):'')+'</small></button>').join(''):'<p class="empty">No trips yet. Create a trip to begin exploring.</p>';if(!t)return;
$('#tripTitle').textContent=t.name;$('#tripSub').textContent=(t.destination||'Explore anywhere')+' · '+formatDate(t.start)+(t.end?' – '+formatDate(t.end):'');
TABS.forEach(n=>{$('#'+n).classList.toggle('hidden',n!==tab);document.querySelector('[data-tab="'+n+'"]').classList.toggle('active',n===tab)});if(tab==='explore')setTimeout(initMap,0);
// Ideas are choices under consideration. An idea linked to a decided itinerary
// entry is retained for its source/map metadata but is not listed as pending.
const plannedIdeaIds=new Set(forTrip('activities').map(x=>x.placeId).filter(Boolean));
const savedPlaces=forTrip('places').filter(x=>!plannedIdeaIds.has(x.id));
const categoriesWithIdeas=PLACE_CATEGORIES.filter(c=>savedPlaces.some(x=>normalizedCategory(x.category)===c));
if(ideaFilter!=='all'&&!categoriesWithIdeas.includes(ideaFilter))ideaFilter='all';
const filteredIdeas=Ideas.filterForList(savedPlaces.map(x=>({...x,category:normalizedCategory(x.category)})),ideaFilter,ideaQuery);
$('#ideaCategoryFilter').innerHTML='<option value="all">All categories ('+savedPlaces.length+')</option>'+
 categoriesWithIdeas.map(c=>'<option value="'+esc(c)+'" '+(ideaFilter===c?'selected':'')+'>'+esc(c)+' ('+savedPlaces.filter(x=>normalizedCategory(x.category)===c).length+')</option>').join('');
$('#ideaCategoryFilter').value=ideaFilter;
$('#ideaCategoryCount').textContent=filteredIdeas.length+' of '+savedPlaces.length+' ideas';
$('#placeList').innerHTML=filteredIdeas.length?PLACE_CATEGORIES.map(category=>{
 if(ideaFilter!=='all'&&category!==ideaFilter)return '';
 const items=filteredIdeas.filter(x=>normalizedCategory(x.category)===category);
 if(!items.length)return '';
 return '<details class="list-category" data-category="'+esc(category)+'" '+(collapsedPlaceCategories.has(category)?'':'open')+'><summary>'+esc(category)+' <span class="count">'+items.length+'</span></summary><div class="category-body">'+items.map(x=>
  '<div class="day"><div class="row entry-head"><strong>'+esc(x.name)+'</strong>'+
  '<label class="idea-category-inline">Category <select data-idea-category="'+esc(x.id)+'" aria-label="Category for '+esc(x.name)+'">'+
  PLACE_CATEGORIES.map(c=>'<option value="'+esc(c)+'" '+(normalizedCategory(x.category)===c?'selected':'')+'>'+esc(c)+'</option>').join('')+
  '</select></label>'+editAndRemove('places',x)+'</div>'+(x.location?'<div class="muted small-details">'+esc(x.location)+'</div>':'')+ideaTiming(x)+(x.notes?'<p>'+esc(x.notes)+'</p>':'')+'<div class="row wrap">'+(geo(x)?'<button class="quiet small" data-locate="'+esc(x.id)+'">Show on map</button>':'')+'<button class="secondary small" data-plan="'+esc(x.id)+'">Choose for itinerary</button></div></div>'
 ).join('')+'</div></details>';
}).join('') : '<p class="empty">'+(savedPlaces.length?'No ideas match these filters. Clear the search or choose another category.':'No ideas under consideration. Add an activity, event, place, or other possibility here.')+'</p>';
const allActivities=forTrip('activities').slice().sort(Itinerary.compareEntries);
const bookingCount=allActivities.filter(x=>x.reservationStatus==='needed').length;
const unscheduledCount=allActivities.filter(x=>!x.date).length;
$('#itineraryViewCount').textContent=allActivities.length+' plans · '+unscheduledCount+' unscheduled'+(bookingCount?' · '+bookingCount+' need booking':'');
const activities=Itinerary.filterForView(allActivities,itineraryView);
const activityDays=[...new Set(activities.map(x=>x.date||''))];
$('#activityList').innerHTML=activities.length?activityDays.map(day=>
 '<section class="itinerary-group"><h3>'+esc(day?formatDate(day):'To schedule')+' <span class="count">'+activities.filter(x=>(x.date||'')===day).length+'</span></h3>'+
 activities.filter(x=>(x.date||'')===day).map(x=>{
  const badges=[
   x.mustDo?'<span class="itinerary-badge important">Must do</span>':'',
   x.fixedDate?'<span class="itinerary-badge">Fixed date</span>':'',
   x.reservationStatus==='needed'?'<span class="itinerary-badge pending">Needs booking</span>':'',
   x.reservationStatus==='booked'?'<span class="itinerary-badge booked">Booked</span>':'',
   Itinerary.outsideTrip(x,t)?'<span class="itinerary-badge warning">Outside trip dates</span>':''
  ].filter(Boolean).join(' ');
  const when=x.time?Itinerary.formatTime(x.time)+(x.endTime?' – '+Itinerary.formatTime(x.endTime):''):'';
  const link=safeExternalURL(x.bookingUrl);
  return '<div class="day"><div class="row entry-head"><strong>'+esc(x.title)+'</strong>'+editAndRemove('activities',x)+'</div>'+
   (badges?'<div class="itinerary-badges">'+badges+'</div>':'')+
   '<div class="muted small-details">'+esc(x.category||'Activity')+(when?' · '+esc(when):'')+(x.endDate?' · Checkout '+formatDate(x.endDate):'')+'</div>'+
   (x.notes?'<p>'+esc(x.notes)+'</p>':'')+
   (x.hours?'<div class="muted small-details">Hours: '+esc(x.hours)+'</div>':'')+
   (x.confirmationCode?'<div class="muted small-details">Confirmation: '+esc(x.confirmationCode)+'</div>':'')+
   (link?'<a class="small-details" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Booking / tickets</a>':'')+
   '<div class="row wrap"><button class="quiet small" data-unschedule="'+esc(x.id)+'">Move back to Ideas</button></div></div>';
 }).join('')+'</section>'
).join('') : '<p class="empty">'+(allActivities.length?'No plans match this view. Choose another filter.':'Nothing decided yet. Choose an idea or add a plan directly.')+'</p>';
$('#noteList').innerHTML=forTrip('notes').length?forTrip('notes').map(x=>'<div class="day"><div class="row entry-head"><strong>'+esc(x.title)+'</strong>'+editAndRemove('notes',x)+'</div><p style="white-space:pre-wrap">'+esc(x.body)+'</p></div>').join(''):'<p class="empty">Save links, questions, reservations, and research here.</p>';
const packing=forTrip('packing');const checked=packing.filter(x=>x.done).length;$('#packProgress').textContent=checked+' of '+packing.length+' items packed · '+PACKING_CATEGORIES.length+' categories';$('#packList').innerHTML=PACKING_CATEGORIES.map(c=>{const items=packing.filter(x=>(x.category||'trip-misc')===c.key);return '<details class="pack-category" '+(items.length?'open':'')+'><summary><span class="pack-category-name">'+esc(c.label)+'</span><span class="pack-count">'+items.filter(x=>x.done).length+' / '+items.length+'</span></summary><div class="pack-items">'+(items.length?items.map(x=>'<div class="check"><input type="checkbox" aria-label="Packed '+esc(x.title)+'" data-pack="'+esc(x.id)+'" '+(x.done?'checked':'')+'><span style="'+(x.done?'text-decoration:line-through;opacity:.6':'')+'">'+esc(x.title)+'</span><span class="entry-actions"><button class="quiet small" data-edit="packing:'+esc(x.id)+'">Edit</button><button class="quiet small" data-remove="packing:'+esc(x.id)+'">Remove</button></span></div>').join(''):'<p class="muted pack-empty">Nothing on this list yet.</p>')+'</div></details>'}).join('');routeUI?.render();refreshMarkers();}
window.applyVacationPlannerRemoteState=next=>{
 state=structuredClone(next);
 if(active&&!trip()){active=null;sessionStorage.removeItem(SESSION);}
 render();
};

let mobileSheet='collapsed';
function setMobileSheet(next){
 mobileSheet=next==='expanded'?'expanded':'collapsed';
 const expanded=mobileSheet==='expanded';
 document.body.classList.toggle('sheet-collapsed',!expanded);
 document.body.classList.toggle('sheet-expanded',expanded);
 const handle=document.getElementById('mobileSheetHandle');
 if(handle){
  handle.setAttribute('aria-expanded',String(expanded));
  handle.setAttribute('aria-label',expanded?'Collapse results to show the map':'Expand results to full screen');
 }
 const action=document.getElementById('mobileSheetAction');
 if(action)action.textContent=expanded?'Collapse':'Expand';
 const indicator=document.querySelector('#mobileSheetHandle .sheet-indicator');
 if(indicator)indicator.textContent=expanded?'⌄':'⌃';
}
function initializeMobileWorkspace(){
 const menu=$('#mobileTripMenu');
 menu.addEventListener('click',()=>{
  const open=document.body.classList.toggle('mobile-trip-menu-open');
  menu.setAttribute('aria-expanded',String(open));
 });
 $('#mobileSignOut').addEventListener('click',()=>$('#cloudSignOut').click());
 $('#mobileMapOptions').addEventListener('click',()=>{
  const open=document.body.classList.toggle('mobile-map-options-open');
  $('#mobileMapOptions').setAttribute('aria-expanded',String(open));
 });
 const handle=$('#mobileSheetHandle');
 handle.addEventListener('click',()=>setMobileSheet(mobileSheet==='expanded'?'collapsed':'expanded'));
 $('#exploreToolTabs').addEventListener('click',e=>{
  const b=e.target.closest('[data-explore-tool]');if(!b)return;
  $('#mobileSheetTitle').textContent=b.dataset.exploreTool==='routes'?'Route planner':'Nearby places';
  setMobileSheet('expanded');
 });
 for(const [button,selector] of [['mobileShowIdeaForm','#manualPlace'],['mobileShowActivityForm','#activityForm']]){
  $( '#'+button ).addEventListener('click',()=>{
   const card=$(selector).closest('.mobile-add-card'),show=!card.classList.contains('is-open');
   card.classList.toggle('is-open',show);
   $('#'+button).setAttribute('aria-expanded',String(show));
   if(show)requestAnimationFrame(()=>{card.scrollIntoView({behavior:'smooth',block:'start'});$(selector).querySelector('input:not([type=hidden])')?.focus({preventScroll:true});});
  });
 }
 function moveOptional(formSelector,items){
  const form=$(formSelector),detail=document.createElement('details'),summary=document.createElement('summary');
  detail.className='mobile-advanced';summary.textContent='More options (optional)';detail.append(summary);
  for(const sel of items){const element=form.querySelector(sel);if(element)detail.append(element);}
  if(detail.children.length<2)return;
  // insertBefore needs a DIRECT child of the form. In the map save dialog
  // the primary button lives inside the form's .row, not directly in the form.
  let insertionPoint=form.querySelector('button.primary');
  while(insertionPoint&&insertionPoint.parentElement!==form)insertionPoint=insertionPoint.parentElement;
  if(!insertionPoint)throw Error('Cannot find the form action row for '+formSelector);
  form.insertBefore(detail,insertionPoint);
  const adapt=()=>{if(!window.matchMedia('(max-width:760px)').matches)detail.open=true;else if(!detail.dataset.mobileVisited){detail.open=false;detail.dataset.mobileVisited='1';}};
  adapt();window.addEventListener('resize',adapt);
 }
 moveOptional('#manualPlace',['label:has(input[name=location])','label:has(textarea[name=notes])']);
 // Lodging dates and checkout remain visible; all other itinerary options are optional.
 moveOptional('#activityForm',['#activityHoursField','label:has(textarea[name=notes])']);
 moveOptional('#placeForm',['label:has(textarea[name=notes])','label:has(#coordinates)']);
 document.addEventListener('click',e=>{
  if(e.target.closest('#mobileTripMenu,.trip-summary-actions,#mobileMapOptions,.map-layer-controls,.map-category-controls'))return;
  document.body.classList.remove('mobile-trip-menu-open','mobile-map-options-open');
  menu.setAttribute('aria-expanded','false');$('#mobileMapOptions').setAttribute('aria-expanded','false');
 });
 setMobileSheet('collapsed');
}
function setTab(n){if(!trip()||!TABS.includes(n))return;document.body.classList.remove('mobile-trip-menu-open','mobile-map-options-open');if(n!=='explore')routeUI?.cancelPick();if(n!=='explore'&&expandedMap){expandedMap=false;syncExpanded()}addingPlace=false;syncMapMode();tab=n;render()}
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
function syncMapMode(){const btn=$('#mapAdd'),frame=$('#mapFrame');btn.setAttribute('aria-pressed',String(addingPlace));btn.textContent=addingPlace?'✕ Cancel adding':'＋ Add a place';frame.classList.toggle('placing',addingPlace);frame.classList.toggle('placing-route',!!routeUI?.isPicking());const routeMode=routeUI?.getPick();$('#mapHint').classList.toggle('hidden',!routeMode&&!addingPlace);$('#mapHint').textContent=routeMode?(routeMode==='start'?'Click your route starting point':routeMode==='end'?'Click your destination':routeMode==='stop'?'Click map to add route stops · select button again to finish':'Click roads to guide the route · select button again to finish'):addingPlace?'Tap the map where you want to save a place':'';}
function syncExpanded(){const frame=$('#mapFrame'),btn=$('#mapFullscreen');frame.classList.toggle('expanded',expandedMap);document.body.classList.toggle('map-expanded',expandedMap);btn.setAttribute('aria-pressed',String(expandedMap));btn.textContent=expandedMap?'↙ Close map':'⛶ Expand map';setTimeout(()=>map?.invalidateSize({pan:false,debounceMoveend:true}),100);}
$('#mapAdd').addEventListener('click',()=>{routeUI?.cancelPick();addingPlace=!addingPlace;syncMapMode();if(addingPlace)setMobileSheet('collapsed');});
$('#mapFullscreen').addEventListener('click',()=>{expandedMap=!expandedMap;syncExpanded()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expandedMap){expandedMap=false;syncExpanded()}});
function initMap(){if(!trip()||tab!=='explore')return;if(typeof L==='undefined'){$('#map').textContent='Map could not load. Check your connection.';return}if(!map){map=L.map('map',{zoomControl:false,tap:false,scrollWheelZoom:true,wheelPxPerZoomLevel:180,wheelDebounceTime:80,zoomSnap:0.5,touchZoom:'center',bounceAtZoomLimits:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([46.55,-87.4],8);L.control.zoom({position:'bottomright'}).addTo(map);baseLayers={street:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19,keepBuffer:6,updateWhenIdle:false,updateWhenZooming:false}),satellite:L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery: USDA, USGS The National Map',maxZoom:19,maxNativeZoom:16,keepBuffer:6,updateWhenIdle:false,updateWhenZooming:false})};Object.values(baseLayers).forEach(registerBaseLayer);setMapStyle(mapStyle);map.on('moveend zoomend',()=>{if(tileErrors)setTileStatus('Some map tiles may be missing. Retry if needed.',true)});markers=L.layerGroup().addTo(map);discoveryMarkers=L.layerGroup().addTo(map);if(typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>{if(map&&trip()&&tab==='explore')map.invalidateSize({pan:false,debounceMoveend:true})}).observe($('#map'))};map.on('click',e=>{if(routeUI?.consumeMapClick(e.latlng))return;if(addingPlace){addingPlace=false;syncMapMode()}showMapPlaceMenu(e.latlng)});map.on('contextmenu',e=>showMapPlaceMenu(e.latlng));const t=trip();if(t?.lat!=null&&t?.lng!=null)map.setView([t.lat,t.lng],10)}setTimeout(()=>map?.invalidateSize({pan:false,debounceMoveend:true}),100);refreshMarkers();routeUI?.attachMap(map)}
const PLACE_CATEGORIES=['Lodging','Restaurants','Coffee Shops','Wineries','Shopping','Hiking','Boating','Fishing','Events','Attractions','Activities','Scenic Drives','Other'];
const collapsedPlaceCategories=new Set();
const FLAG_COLORS={Lodging:'#845ec2',Restaurants:'#d65a44','Coffee Shops':'#80633e',Wineries:'#8e396f',Shopping:'#ca8422',Hiking:'#307d4d',Boating:'#187a9b',Fishing:'#2675c9',Events:'#d13f79',Attractions:'#4d8f83',Activities:'#637a94','Scenic Drives':'#a16f44',Other:'#717885'};
const visibleCategories=new Set(PLACE_CATEGORIES);
const mapLayerVisible={ideas:true,itinerary:true,routes:true};
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
document.querySelectorAll('[data-map-layer]').forEach(input=>input.addEventListener('change',()=>{mapLayerVisible[input.dataset.mapLayer]=input.checked;refreshMarkers();routeUI?.render();}));
function syncActivityCategory(){const f=$('#activityForm'),c=f.elements.category.value,lodging=c==='Lodging';$('#activityDateLabel').textContent=(lodging?'Check-in date':c==='Events'?'Event date':c==='Restaurants'?'Dining date':c==='Coffee Shops'?'Coffee stop date':c==='Wineries'?'Winery visit date':c==='Shopping'?'Shopping date':c==='Hiking'?'Hiking date':c==='Boating'?'Boating date':c==='Fishing'?'Fishing date':'Visit date')+(lodging?'':' (optional)');$('#activityEndField').hidden=!lodging;f.elements.endDate.required=lodging;f.elements.date.required=lodging||f.elements.fixedDate.checked;if(!lodging)f.elements.endDate.value='';$('#activityEndTimeField').hidden=lodging;if(lodging)f.elements.endTime.value='';$('#activityHoursField').hidden=lodging||c==='Hiking'||c==='Boating'||c==='Fishing';}
$('#activityCategory').addEventListener('change',syncActivityCategory);
$('#activityForm').elements.fixedDate.addEventListener('change',syncActivityCategory);
function cleanImportedNotes(notes){return String(notes||'').replace(/^Discovered via Geoapify[^\n]*$/gmi,'').replace(/^building\.[\w.]+$/gmi,'').trim();}
async function loadItineraryHours(geoapifyId){try{const d=await getDiscoveryPlaceDetails({placeId:geoapifyId});if(pendingActivityLocation?.geoapifyId===geoapifyId&&!$('#activityHours').value)$('#activityHours').value=d.opening_hours||d.datasource?.raw?.opening_hours||'';}catch{}}
function fillActivity({name,category='Other',notes='',lat=null,lng=null,placeId='',geoapifyId='',hours='',date='',time='',endTime='',fixedDate=false}){
 itineraryView='all';$('#itineraryView').value='all';setTab('itinerary');if(window.matchMedia('(max-width:760px)').matches){$('#activityForm').closest('.mobile-add-card')?.classList.add('is-open');$('#mobileShowActivityForm').setAttribute('aria-expanded','true');}
 const f=$('#activityForm');f.reset();
 f.elements.title.value=name;
 f.elements.category.value=normalizedCategory(category);
 f.elements.notes.value=cleanImportedNotes(notes);
 f.elements.hours.value=hours;
 f.elements.date.value=date||(category==='Lodging'?(trip()?.start||''):'');
 f.elements.endDate.value=endDate||(category==='Lodging'?(trip()?.end||''):'');
 f.elements.time.value=Itinerary.canonicalTime(time);
 f.elements.endTime.value=Itinerary.canonicalTime(endTime);
 f.elements.fixedDate.checked=!!fixedDate;
 pendingActivityLocation={placeId,lat,lng,geoapifyId};
 syncActivityCategory();
 f.elements.date.focus();
 if(geoapifyId&&!hours)loadItineraryHours(geoapifyId);
 if(window.matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>f.closest('.mobile-add-card')?.scrollIntoView({behavior:'smooth',block:'start'}));
}

function detectedCategory(tags=[],name='',searchCategory=''){
 // Geoapify returns a hierarchy of categories. Classify against the ENTIRE list,
 // not just the first generic category (for example, "production" before
 // "production.winery"). Names help when OSM tags are incomplete.
 const c=(Array.isArray(tags)?tags:[tags]).filter(Boolean).join(' ').toLowerCase();
 const label=String(name||'').toLowerCase();
 if(/winery|vineyard|wine[_ .-]?tasting/.test(c)||/\b(winery|vineyard|wine[ -]?tasting|tasting room)\b/.test(label))return 'Wineries';
 if(/accommodation|hotel|motel|guest_house|hostel/.test(c))return 'Lodging';
 // Coffee shops and cafes form their own saved category. Prefer an explicit
 // restaurant tag when a venue is listed as both a restaurant and a cafe.
 const restaurantTagged=/catering\.(?:restaurant|fast_food|food_court)(?:\.|\s|$)/.test(c);
 const cafeTagged=/catering\.cafe(?:\.|\s|$)/.test(c);
 const coffeeNamed=/\b(?:coffee(?:\s*(?:shop|house|bar))?|espresso|roaster(?:y|ies)?|caf[eé])\b/i.test(label);
 const coffeeRetailTagged=/commercial\.food_and_drink\.coffee_and_tea(?:\.|\s|$)/.test(c);
 if(searchCategory==='coffee_shops'||coffeeRetailTagged||(coffeeNamed||cafeTagged)&&!restaurantTagged)return 'Coffee Shops';
 if(/catering|restaurant|cafe|fast_food/.test(c))return 'Restaurants';
 if(/commercial|shop|shopping/.test(c))return 'Shopping';
 if(/hiking|trail/.test(c))return 'Hiking';
 if(/boat|marina|slipway/.test(c))return 'Boating';
 if(/fishing/.test(c))return 'Fishing';
 if(/event/.test(c))return 'Events';
 if(/tourism|entertainment|natural|leisure/.test(c))return 'Attractions';
 // A winery-only discovery search may return a generic production tag.
 if(searchCategory==='wineries')return 'Wineries';
 return 'Other';
}
function mapMenuContent(latlng,name='',notes='',savedId='',category='Other',source=null){
 const el=document.createElement('div'),title=document.createElement('strong');
 title.textContent=name||'Place on map';el.append(title,document.createElement('br'));
 const decided=!!savedId&&state.activities.some(x=>x.tripId===active&&x.placeId===savedId);
 const actions=savedId?
  [[decided?'View itinerary':'Choose for itinerary',()=>decided?setTab('itinerary'):planPlace(savedId)]]:[
   ['Save idea',()=>openPlace(latlng.lat,latlng.lng,name,notes,'places',category,source)],
   ['Add to itinerary',()=>openPlace(latlng.lat,latlng.lng,name,notes,'itinerary',category,source)]
  ];
 for(const [label,action] of actions){
  const btn=document.createElement('button');btn.type='button';btn.className='secondary small';btn.textContent=label;
  btn.style.margin='5px 5px 0 0';btn.onclick=()=>{map?.closePopup();action()};el.append(btn);
 }
 return el;
}
let mapLookupToken=0;
function mapPlaceDistance(latlng,place){
 const lat1=Number(latlng.lat)*Math.PI/180,lat2=Number(place.lat)*Math.PI/180;
 const dlat=lat2-lat1,dlng=(Number(place.lng)-Number(latlng.lng))*Math.PI/180;
 const a=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;
 return Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a))));
}
function mapPlaceFromFeature(feature){
 const p=feature?.properties||{},coords=feature?.geometry?.coordinates;
 const lat=Number(p.lat??coords?.[1]),lng=Number(p.lon??coords?.[0]);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
 const name=String(p.name||'').trim();
 if(!name)return null;
 const categories=p.categories||[];
 return {name,lat,lng,
  kind:categories.find?.(x=>x!=='building')||p.category||'Point of interest',
  categories,address:p.formatted||'',placeId:p.place_id||'',hours:p.opening_hours||p.datasource?.raw?.opening_hours||'',
  description:p.description||'',wikipedia:p.wikipedia||'',wikidata:p.wikidata||'',
  wiki_and_media:p.wiki_and_media||null,datasource:p.datasource||null,
  website:placeWebsite(p),phone:placePhone(p),
  category:detectedCategory(categories,name)};
}
// The base map's place labels are raster tiles; identify nearby named OSM objects on a lookup miss.
async function openStreetMapNearClick(latlng,signal){
 const query='[out:json][timeout:12];nwr(around:250,'+
  Number(latlng.lat).toFixed(6)+','+Number(latlng.lng).toFixed(6)+')['+'"name"'+'];out center 150;';
 // Overpass mirrors occasionally fail independently. Retry the same small
 // user-requested point query, never enlarge its radius or bypass cancellation.
 const data=await requestOsmElements(query,signal);
 return (Array.isArray(data.elements)?data.elements:[]).map(e=>{
  const t=e.tags||{},lat=Number(e.lat??e.center?.lat),lng=Number(e.lon??e.center?.lon);
  // Some named POIs are mapped as commercial buildings, not shops or amenities.
  if(!t.name||!Number.isFinite(lat)||!Number.isFinite(lng)||
    !['amenity','shop','tourism','leisure','craft','office','historic','healthcare','man_made','building'].some(k=>t[k]))return null;
  const kind=t.amenity||t.shop||t.tourism||t.leisure||t.craft||t.office||t.historic||t.healthcare||t.man_made||'building';
  const categories=t.amenity==='cafe'?['catering.cafe']:t.amenity==='restaurant'?['catering.restaurant']:
    t.amenity==='fast_food'?['catering.fast_food']:
    t.shop==='bakery'?['commercial.food_and_drink.bakery']:
    t.shop?['commercial']:t.tourism?['tourism']:[kind];
  const place={name:String(t.name),lat,lng,kind,categories,placeId:'',
   sourceLabel:'OpenStreetMap named place',datasource:{raw:t},hours:t.opening_hours||'',address:t['addr:full']||'',
   website:safeExternalURL(t.website||t['contact:website']||'')||'',category:detectedCategory(categories,String(t.name))};
  return mapPlaceDistance(latlng,place)<=230?place:null;
 }).filter(Boolean);
}

// Current Overpass host, with fallback and independent six-second timeouts.
// The old overpass.kumi.systems hostname has been replaced by Private.coffee.
async function requestOsmElements(query,signal){
 const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
 let lastError=null;
 for(const endpoint of endpoints){
  if(signal?.aborted)throw Error('OpenStreetMap request cancelled');
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  signal?.addEventListener?.('abort',cancel,{once:true});
  const timer=setTimeout(cancel,6000);
  try{
   const response=await fetch(endpoint+'?'+new URLSearchParams({data:query}),{
    signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('OpenStreetMap HTTP '+response.status);
   const data=await response.json();
   if(!Array.isArray(data?.elements))throw Error('Invalid named-place response');
   return data;
  }catch(error){lastError=error;}
  finally{clearTimeout(timer);signal?.removeEventListener?.('abort',cancel);}
 }
 throw lastError||Error('Named-place lookup unavailable');
}

async function showMapPlaceMenu(latlng,name='',notes=''){
 if(!map)return;
 const token=++mapLookupToken;
 const popup=L.popup().setLatLng(latlng).setContent(mapMenuContent(latlng,name,notes)).openOn(map);
 if(name)return;
 const key=window.LAZY_ACRES_GEOAPIFY_KEY;
 const alive=()=>token===mapLookupToken&&map?.hasLayer(popup);
 function showManual(message){
  if(!alive())return;
  const box=document.createElement('div'),text=document.createElement('p'),button=document.createElement('button');
  text.textContent=message;
  button.type='button';button.className='secondary small';
  button.textContent='Name and save this exact location';
  button.onclick=()=>{map?.closePopup();openPlace(latlng.lat,latlng.lng,'','','places','Other')};
  box.append(text,button);popup.setContent(box);
 }
 if(!key||key==='PASTE_YOUR_GEOAPIFY_BROWSER_KEY_HERE'){
  showManual('Place-name lookup is not configured.');return;
 }
 const loading=document.createElement('div');
 loading.textContent='Identifying this place…';
 popup.setContent(loading);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 async function request(url){
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.features))throw Error('Invalid location search result');
  return data.features;
 }
 function select(place){
  if(!alive())return;
  const view=makeDiscoveryPopup(place);
  popup.setLatLng({lat:place.lat,lng:place.lng}).setContent(view.content);
  void view.load();
 }
 try{
  let matches=[],placeError=null;
  const nearby=new URLSearchParams({
   categories:'accommodation,catering,commercial,tourism,entertainment,leisure,natural,sport,production.winery',
   filter:'circle:'+Number(latlng.lng).toFixed(6)+','+Number(latlng.lat).toFixed(6)+',220',
   bias:'proximity:'+Number(latlng.lng).toFixed(6)+','+Number(latlng.lat).toFixed(6),
   limit:'80',apiKey:key
  });
  try{
   matches=(await request('https://api.geoapify.com/v2/places?'+nearby)).map(mapPlaceFromFeature).filter(Boolean);
  }catch(e){placeError=e;}
  if(!alive())return;
  // Search the underlying OSM map data on EVERY click. A nearby hotel may be
  // indexed by Geoapify while the tapped bakery is only a named OSM building.
  try{matches.push(...await openStreetMapNearClick(latlng,controller.signal));}
  catch{/* Public lookup failure must not block saving the exact clicked point. */}
  if(!alive())return;
  // Nearest results appear first, and duplicate entries are suppressed.
  matches.sort((a,b)=>mapPlaceDistance(latlng,a)-mapPlaceDistance(latlng,b));
  const distinct=[];
  matches=matches.filter(p=>{
   // 217m-away resorts are not plausible matches for a tapped storefront.
   if(mapPlaceDistance(latlng,p)>180)return false;
   if(distinct.some(x=>sameNearbyBusiness(x,p)))return false;
   distinct.push(p);return true;
  }).slice(0,10);
  if(matches.length===1&&mapPlaceDistance(latlng,matches[0])<=90){
   select(matches[0]);return;
  }
  if(!matches.length){
   // A street address is not a verified business name. Keep the exact map
   // coordinates and offer a directly editable name instead of fake 0m POIs.
   showManual('No named business was identified here. Enter the name shown on the map to save this exact location.');
   return;
  }
  if(!alive())return;
  if(!matches.length){
   showManual(placeError?
    'No place name could be retrieved here. You can still save the exact point.':
    'No named place or street address found at this point.');
   return;
  }
  if(matches.length===1&&mapPlaceDistance(latlng,matches[0])<=90){
   select(matches[0]);return;
  }
  const box=document.createElement('div'),heading=document.createElement('strong');
  heading.textContent='Which place did you mean?';box.append(heading);
  for(const place of matches){
   const button=document.createElement('button');
   button.type='button';button.className='quiet small map-place-choice';
   button.style.display='block';button.style.marginTop='6px';button.style.textAlign='left';
   const distance=mapPlaceDistance(latlng,place);
   button.textContent=place.name+' · '+distance+' m away'+(place.sourceLabel?' · '+place.sourceLabel:'');
   button.title=place.address||place.kind;
   button.onclick=()=>select(place);
   box.append(button);
  }
  const manual=document.createElement('button');
  manual.type='button';manual.className='secondary small';
  manual.style.marginTop='8px';manual.textContent='Name and save exact clicked point';
  manual.onclick=()=>{map?.closePopup();openPlace(latlng.lat,latlng.lng,'','','places','Other')};
  box.append(manual);popup.setContent(box);
 }catch{
  showManual('Place identification timed out or failed. You can still save this exact point.');
 }finally{clearTimeout(timer);}
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
 // Cache the in-flight request as well, so scroll enrichment and the details
 // button never double-charge Geoapify for the same place.
 const request=(async()=>{
  const params=new URLSearchParams({id:place.placeId,features:'details',apiKey:window.LAZY_ACRES_GEOAPIFY_KEY});
  const response=await fetch('https://api.geoapify.com/v2/place-details?'+params.toString(),{signal:controller.signal});
  if(!response.ok)throw Error('Geoapify place details returned HTTP '+response.status);
  const data=await response.json();
  return (data.features||[]).find(f=>f.properties?.feature_type==='details')?.properties||
   (data.features||[]).find(f=>f.properties)?.properties||{};
 })();
 if(placeDetailCache.size>=100)placeDetailCache.delete(placeDetailCache.keys().next().value);
 placeDetailCache.set(place.placeId,request);
 try{const details=await request;placeDetailCache.set(place.placeId,details);return details;}
 catch(e){placeDetailCache.delete(place.placeId);throw e;}
 finally{clearTimeout(timer);}
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
// Expand details only for cards approaching the viewport. This keeps the free
// Geoapify allowance usable without sending 60 Place Details calls at once.
let discoveryObserver=null;
const wikiSummaryCache=new Map();
async function discoveryWiki(data){
 const target=Discovery.wikiTarget(data);
 if(!target)return null;
 if(!wikiSummaryCache.has(target.api)){
  if(wikiSummaryCache.size>=100)wikiSummaryCache.delete(wikiSummaryCache.keys().next().value);
  wikiSummaryCache.set(target.api,Discovery.wikipediaSummary(data));
 }
 return wikiSummaryCache.get(target.api);
}
async function discoveryWikidata(data){
 const target=Discovery.wikidataTarget(data);
 if(!target)return null;
 if(!wikiSummaryCache.has(target.api)){
  if(wikiSummaryCache.size>=100)wikiSummaryCache.delete(wikiSummaryCache.keys().next().value);
  wikiSummaryCache.set(target.api,Discovery.wikidataSummary(data));
 }
 return wikiSummaryCache.get(target.api);
}
async function discoveryOverview(place,details={}){
 const description=Discovery.description(details)||Discovery.description(place);
 if(description)return {text:description,source:'OpenStreetMap'};
 // Look up only records explicitly identified by this place's mapped tags.
 // Do not substitute a same-named Wikipedia entry without a reference.
 for(const data of [details,place]){
  const wiki=await discoveryWiki(data);
  if(wiki)return {...wiki,source:'Wikipedia'};
 }
 for(const data of [details,place]){
  const wiki=await discoveryWikidata(data);
  if(wiki)return wiki;
 }
 return {text:Discovery.categorySummary({...place,...details,
  categories:place.categories||details.categories,
  datasource:place.datasource||details.datasource}),source:'OpenStreetMap category'};
}
function addDiscoveryExplanation(host,overview,inline=false){
 const paragraph=inline?host:document.createElement('p');
 paragraph.className='discovery-description';
 paragraph.textContent=overview.text;
 if(overview.url&&/^https:\/\/(en\.wikipedia\.org|www\.wikidata\.org)\/wiki\//.test(overview.url)){
  const link=document.createElement('a');link.href=overview.url;
  link.target='_blank';link.rel='noopener noreferrer';
  link.textContent=' · Read at '+(overview.source||'source');
  paragraph.append(link);
 }
 if(!inline)host.append(paragraph);
}
async function enrichDiscoveryCard(place,index){
 const container=$('#poi-card-'+index),summary=$('#poi-description-'+index),hours=$('#poi-hours-'+index);
 if(!container||!summary||window.__tripSuggestions?.[index]!==place)return;
 let details={};
 try{details=await getDiscoveryPlaceDetails(place);}catch{}
 if(window.__tripSuggestions?.[index]!==place)return;
 const merged=Discovery.combined(place,details);
 // Preserve returned hours when the user chooses to save the suggestion.
 if(merged.hours&&!place.hours)place.hours=merged.hours;
 if(merged.website&&!place.website)place.website=safeExternalURL(merged.website)||'';
 const overview=await discoveryOverview(place,details);
 if(window.__tripSuggestions?.[index]!==place)return;
 summary.replaceChildren();
 addDiscoveryExplanation(summary,overview,true);
 hours.textContent=merged.hours?'Hours: '+Discovery.hoursText(merged.hours):'Hours not listed — check before visiting';
 const contact=$('#poi-contact-'+index);
 if(contact){
  contact.replaceChildren();
  appendContactInfo(contact,details);
 }
}
function observeDiscoveryCards(){
 discoveryObserver?.disconnect();
 const found=window.__tripSuggestions||[];
 if(typeof IntersectionObserver==='undefined'){
  found.slice(0,8).forEach((place,index)=>{void enrichDiscoveryCard(place,index);});
  return;
 }
 discoveryObserver=new IntersectionObserver(entries=>{
  for(const item of entries){
   if(!item.isIntersecting)continue;
   discoveryObserver.unobserve(item.target);
   const index=Number(item.target.dataset.discoveryIndex),place=window.__tripSuggestions?.[index];
   if(place)void enrichDiscoveryCard(place,index);
  }
 },{root:null,rootMargin:'140px 0px',threshold:0.01});
 $('#suggestions').querySelectorAll('[data-discovery-index]').forEach(card=>discoveryObserver.observe(card));
}
function makeDiscoveryPopup(place,savedId=''){
 const wrap=document.createElement('div');wrap.className='discovery-info';
 const heading=document.createElement('strong');heading.textContent=place.name;wrap.append(heading);
 const subtitle=document.createElement('div');subtitle.className='muted';
 subtitle.textContent=place.address||place.kind||'Attraction';wrap.append(subtitle);
 const info=document.createElement('div');info.className='discovery-info-body';
 info.textContent='Looking up the attraction…';wrap.append(info);
 const actions=mapMenuContent({lat:place.lat,lng:place.lng},place.name,place.notes||'',savedId,
   savedId?normalizedCategory(place.category):detectedCategory(place.categories||[place.kind],place.name,place.searchCategory),place);
 actions.querySelector('strong')?.remove();wrap.append(actions);
 let requestStarted=false;
 async function load(){
  if(requestStarted)return;requestStarted=true;
  let details={};
  if(place.placeId){
   try{details=await getDiscoveryPlaceDetails(place);}catch{}
  }
  const overview=await discoveryOverview(place,details);
  const merged=Discovery.combined(place,details);
  info.replaceChildren();
  addDiscoveryExplanation(info,overview);
  if(place.notes){const note=document.createElement('p');note.className='discovery-personal-note';note.textContent='Your notes: '+place.notes;info.append(note);}
  if(merged.hours){
   const hours=document.createElement('p');hours.className='discovery-hours';
   hours.textContent='Hours: '+Discovery.hoursText(merged.hours);
   info.append(hours);
  }
  appendContactInfo(info,Object.assign({},place,details));
  if(merged.hours&&!place.hours)place.hours=merged.hours;
  const url=Discovery.reviewSearchUrl(place);
  if(url){
   const row=document.createElement('p'),link=document.createElement('a');
   link.href=url;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='See ratings and reviews';
   row.append(link);info.append(row);
  }
 }
 return {content:wrap,load};
}
function renderDiscoveryMarkers(found){
 if(!map||!discoveryMarkers)return;
 discoveryMarkers.clearLayers();
 found.forEach((x,index)=>{
  if(!geo(x))return;
  const icon=L.divIcon({className:'discovery-marker-icon',html:'<span class="discovery-map-pin" aria-hidden="true">'+(index+1)+'</span>',iconSize:[28,30],iconAnchor:[14,28],popupAnchor:[0,-25]});
  const popup=makeDiscoveryPopup(x);
  const marker=L.marker([x.lat,x.lng],{icon,title:(index+1)+'. '+x.name,alt:x.name}).addTo(discoveryMarkers).bindPopup(popup.content);
  marker.bindTooltip((index+1)+'. '+x.name,{direction:'top',offset:[0,-20]});
  marker.on('popupopen',()=>popup.load());
 });
}
function showDiscoveryResultsOnMap(){
 const found=(window.__tripSuggestions||[]).filter(geo);
 if(!map||!found.length)return;
 setTab('explore');
 if(window.matchMedia('(max-width:760px)').matches)setMobileSheet('collapsed');
 const bounds=L.latLngBounds(found.map(x=>[Number(x.lat),Number(x.lng)]));
 const fit=()=>{
  map.invalidateSize({pan:false});
  if(found.length===1)map.setView([Number(found[0].lat),Number(found[0].lng)],13);
  else map.fitBounds(bounds.pad(.16),{padding:[18,18],maxZoom:14,animate:false});
 };
 requestAnimationFrame(()=>requestAnimationFrame(fit));
}
function refreshMarkers(){
 if(!map||!markers)return;markers.clearLayers();
 const places=forTrip('places'),activities=forTrip('activities');
 const plannedIds=new Set(activities.map(x=>x.placeId).filter(Boolean));
 const savedCoords=new Set();
 for(const x of places){
   if(!mapLayerVisible.ideas||!geo(x))continue;
   const key=Number(x.lat).toFixed(5)+','+Number(x.lng).toFixed(5);
   savedCoords.add(key);
   const category=normalizedCategory(x.category);
   if(!visibleCategories.has(category))continue;
   const both=mapLayerVisible.itinerary&&(plannedIds.has(x.id)||activities.some(a=>a.lat!=null&&a.lng!=null&&Math.abs(Number(a.lat)-Number(x.lat))<0.00005&&Math.abs(Number(a.lng)-Number(x.lng))<0.00005));
   const marker=L.marker([x.lat,x.lng],{icon:flagIcon(category,both?'both':'saved')}).addTo(markers);
   if(x.geoapifyId){
    const view=makeDiscoveryPopup({name:x.name,lat:x.lat,lng:x.lng,category,kind:category,
     categories:[category],placeId:x.geoapifyId,address:x.location||'',
     hours:x.hours||'',notes:x.notes||''},x.id);
    marker.bindPopup(view.content);
    marker.on('popupopen',()=>{void view.load();});
   }else{
    marker.bindPopup(mapMenuContent({lat:x.lat,lng:x.lng},x.name,x.notes||'',x.id,category));
   }
 }
 for(const x of activities){
   if(!mapLayerVisible.itinerary||!geo(x))continue;
   const key=Number(x.lat).toFixed(5)+','+Number(x.lng).toFixed(5);
   if(mapLayerVisible.ideas&&((x.placeId&&places.some(p=>p.id===x.placeId&&geo(p)))||savedCoords.has(key)))continue;
   const category=normalizedCategory(x.category);
   if(!visibleCategories.has(category))continue;
   const el=document.createElement('div'),title=document.createElement('strong');
   title.textContent=x.title;el.append(title,document.createElement('br'));
   const info=document.createElement('span');info.textContent='Itinerary · '+formatDate(x.date)+(x.endDate?' – '+formatDate(x.endDate):'');el.append(info);
   L.marker([x.lat,x.lng],{icon:flagIcon(category,'itinerary')}).addTo(markers).bindPopup(el);
 }
 buildMapFilters();
}
function openPlace(lat,lng,name,notes,destination='places',category='Other',source=null){
 const suggestion=source||(window.__tripSuggestions||[]).find(x=>Math.abs(Number(x.lat)-Number(lat))<0.00001&&Math.abs(Number(x.lng)-Number(lng))<0.00001);
 selectedPoint={lat:Number(lat),lng:Number(lng),geoapifyId:suggestion?.placeId||'',hours:suggestion?.hours||''};placeDestination=destination;
 $('#placeName').value=name||'';$('#placeNotes').value=cleanImportedNotes(notes);
 const categories=$('#placeForm').elements.category;categories.value=PLACE_CATEGORIES.includes(category)?category:'Other';
 $('#coordinates').value=Number(lat).toFixed(5)+', '+Number(lng).toFixed(5);
 $('#placeDialog').querySelector('h2').textContent=destination==='itinerary'?'Add to itinerary':'Save this idea';
 $('#placeForm').querySelector('button.primary').textContent=destination==='itinerary'?'Continue to itinerary':'Save idea';
 $('#placeDialog').showModal();
}

// Search coordinates are always taken from the map viewport, not from a radius.
function visibleMapArea(){
 const b=map?.getBounds?.();if(!b)return null;
 const west=b.getWest(),south=b.getSouth(),east=b.getEast(),north=b.getNorth();
 if(![west,south,east,north].every(Number.isFinite)||west < -180||east > 180||east<=west||south< -90||north>90||north<=south)return null;
 return 'rect:'+west.toFixed(5)+','+south.toFixed(5)+','+east.toFixed(5)+','+north.toFixed(5);
}
async function nominatimNamedSearch(term,area,limit=8){
 const params=new URLSearchParams({format:'json',limit:String(limit),q:term});
 if(area){
  const [west,south,east,north]=area.slice(5).split(',').map(Number);
  params.set('viewbox',[west,north,east,south].join(','));params.set('bounded','1');
 }
 const response=await fetch('https://nominatim.openstreetmap.org/search?'+params,{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('OpenStreetMap HTTP '+response.status);
 const data=await response.json();
 return (Array.isArray(data)?data:[]).map(p=>{
  const type=String(p.type||'').toLowerCase(),group=String(p.class||'').toLowerCase();
  const categories=['cafe','coffee_shop'].includes(type)?['catering.cafe']:
   ['restaurant','fast_food','food_court'].includes(type)?['catering.'+type]:
   ['hotel','motel','guest_house','hostel'].includes(type)?['accommodation']:
   type==='winery'?['production.winery']:group==='shop'?['commercial']:
   group==='tourism'?['tourism']:group==='leisure'?['leisure']:[];
  return {properties:{name:p.name||p.display_name?.split(',')[0],categories,
   formatted:p.display_name,lat:Number(p.lat),lon:Number(p.lon),
   datasource:{raw:group==='amenity'?{amenity:type}:{}}},
   geometry:{coordinates:[Number(p.lon),Number(p.lat)]}};
 });
}

function normalizedBusinessName(term){
 // Geoapify's name filter matches substrings, but cannot match a leading
 // "The" when the OSM listing does not contain that word.
 // OSM: "Old Post Office Restaurant"; visitor: "The Old Post Office Restaurant".
 return String(term||'').trim().replace(/^(?:the|an|a)\s+/i,'').replace(/\s+/g,' ');
}
let searchMatches=[];
async function searchLocation(query,store=false){
 const term=String(query||'').trim();if(!term)return;
 // Send generic business-type queries to the paginated discovery workflow,
 // keeping map search for actual named places, towns, and addresses.
 if(!store&&genericDiscoveryTerm(term)&&DISCOVERY_TERMS.some(x=>x.pattern.test(term))){
  $('#searchMatches').classList.add('hidden');
  const discoverTab=document.querySelector('[data-explore-tool="discover"]');
  if(discoverTab&&!discoverTab.classList.contains('active'))discoverTab.click();
  $('#category').value='all';
  $('#discoverText').value=term;
  await discover(false);
  return;
 }
 const token=++searchToken,key=window.LAZY_ACRES_GEOAPIFY_KEY,center=map?.getCenter()||{lat:trip()?.lat??46.55,lng:trip()?.lng??-87.4};
 const area=store?null:visibleMapArea();
 const canUseGeoapify=!!key&&key!=='PASTE_YOUR_GEOAPIFY_BROWSER_KEY_HERE';
 if(!store&&document.activeElement instanceof HTMLElement)document.activeElement.blur();
 $('#searchButton').disabled=true;
 const box=$('#searchMatches');
 if(!store){
  box.classList.remove('hidden');
  if(!area){box.textContent='Move or zoom the map before searching.';$('#searchButton').disabled=false;return;}
  box.innerHTML='<p class="muted">Searching visible map area…</p>';
 }
 try{
  let geo=[],places=[];
  if(canUseGeoapify){
   const bias='proximity:'+Number(center.lng).toFixed(6)+','+Number(center.lat).toFixed(6);
   const geocode=new URLSearchParams({text:term,limit:store?'1':'8',lang:'en',bias,apiKey:key});
   if(area)geocode.set('filter',area);
   const searches=[fetch('https://api.geoapify.com/v1/geocode/search?'+geocode).then(async r=>{if(!r.ok)throw Error('Geocoding HTTP '+r.status);return r.json();})];
   const name=normalizedBusinessName(term);
   const centerPoint=Number(center.lng).toFixed(6)+','+Number(center.lat).toFixed(6);
   const categories=['catering','commercial,accommodation','tourism,entertainment,leisure,natural,production.winery'];
   const searchGroup=(group,filter)=>{
    const params=new URLSearchParams({categories:group,name,bias,limit:'50',apiKey:key});
    if(filter)params.set('filter',filter);
    return fetch('https://api.geoapify.com/v2/places?'+params).then(async response=>{
     if(!response.ok)throw Error('Places HTTP '+response.status);
     return response.json();
    });
   };
   if(!store)for(const group of categories)searches.push(searchGroup(group,area));
   const responses=await Promise.allSettled(searches);
   if(responses.every(r=>r.status==='rejected'))throw responses[0].reason;
   geo=responses[0].status==='fulfilled'?responses[0].value.features||[]:[];
   places=responses.slice(1).filter(r=>r.status==='fulfilled')
    .flatMap(r=>Array.isArray(r.value.features)?r.value.features:[]);
   // No global fallback: the user only searches the visible map.
   if(!store&&!places.length){
    try{geo.push(...await nominatimNamedSearch(term,area));}
    catch{/* Preserve the first source and manual placement if fallback is unavailable. */}
   }
  }else{
   geo=await nominatimNamedSearch(term,area,store?1:8);
  }
  if(token!==searchToken)return;
  const results=[],seen=new Set();
  const append=(feature,kind)=>{
   const p=feature.properties||{},coords=feature.geometry?.coordinates;
   let item=mapPlaceFromFeature(feature);
   // Street addresses and towns can have formatted addresses but no OSM "name".
   if(!item&&kind==='Location'){
    const lat=Number(p.lat??coords?.[1]),lng=Number(p.lon??coords?.[0]);
    const name=String(p.name||p.address_line1||p.formatted||'').trim();
    if(name&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)
     item={name,lat,lng,address:p.formatted||'',categories:[],placeId:p.place_id||'',kind:p.result_type||'Location'};
   }
   if(!item)return;
   const identity=item.placeId||[item.name.toLowerCase(),item.lat.toFixed(4),item.lng.toFixed(4)].join('|');
   if(seen.has(identity))return;seen.add(identity);
   results.push({...item,address:item.address||p.formatted||'',searchCategory:detectedCategory(item.categories,item.name),
    sourceKind:kind});
  };
  for(const feature of places)append(feature,'Business');
  for(const feature of geo)append(feature,'Location');
  if(store){
   const first=results[0];if(!first)return;
   if(trip()){trip().lat=first.lat;trip().lng=first.lng;persist();}
   setTab('explore');setTimeout(()=>{initMap();map?.setView([first.lat,first.lng],11);},100);
   return;
  }
  searchMatches=results;
  box.innerHTML='<div class="row"><h3>'+results.length+' matching places / locations</h3><button type="button" class="quiet small" data-search-close>Close</button></div>'+
   (results.length?results.map((x,i)=>'<div class="search-match">'+
    '<button type="button" data-search-choice="'+i+'"><strong>'+esc(x.name)+'</strong>'+
    '<small>'+esc(x.sourceKind)+(x.address?' · '+esc(x.address):'')+'</small></button>'+
    '<div class="search-match-actions"><button type="button" class="secondary small" data-search-save="'+i+'">+ Idea</button>'+
    '<button type="button" class="primary small" data-search-plan="'+i+'">+ Itinerary</button></div></div>').join(''):
    '<p>No matches within this map view. Try a shorter name, adjust the map, or place a pin manually.</p>');
  if(window.matchMedia('(max-width:760px)').matches)setMobileSheet('collapsed');
 }catch(error){
  if(token!==searchToken)return;
  if(!store)box.innerHTML='<p>Search unavailable: '+esc(error.message||'Request failed')+'</p><button type="button" class="quiet small" data-search-close>Close</button>';
  else console.warn('Trip destination lookup failed:',error);
 }finally{if(token===searchToken)$('#searchButton').disabled=false;}
}
$('#searchMatches').addEventListener('click',e=>{
 if(e.target.closest('[data-search-close]')){$('#searchMatches').classList.add('hidden');return;}
 const chosen=e.target.closest('[data-search-choice]'),saved=e.target.closest('[data-search-save]'),
  planned=e.target.closest('[data-search-plan]');
 const index=Number(chosen?.dataset.searchChoice??saved?.dataset.searchSave??planned?.dataset.searchPlan);
 if(!Number.isInteger(index)||index<0)return;
 const item=searchMatches[index];if(!item)return;
 if(saved){const existing=saveDiscoveredIdea(item);if(existing){saved.disabled=true;saved.textContent='Saved';}return;}
 if(planned){$('#searchMatches').classList.add('hidden');planDiscoveredPlace(item);return;}
 if(chosen){
  $('#searchMatches').classList.add('hidden');
  setTab('explore');setMobileSheet('collapsed');
  setTimeout(()=>{
   initMap();map?.setView([item.lat,item.lng],14);
   if(map&&typeof L!=='undefined'){
    const point={lat:item.lat,lng:item.lng};
    L.popup().setLatLng(point).setContent(mapMenuContent(point,item.name,'','',detectedCategory(item.categories,item.name),item)).openOn(map);
   }
  },110);
 }
});
// Geoapify Places API: category/name search constrained to the visible map.
const DISCOVERY_CATEGORIES={
 lodging:'accommodation',
 restaurants:'catering.restaurant,catering.fast_food,catering.food_court',
 coffee_shops:'catering.cafe,commercial.food_and_drink.coffee_and_tea',
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
 {pattern:/restaurant|diner|bistro|take[ -]?out|takeaway|fast[ -]?food/i,categories:'catering.restaurant,catering.fast_food,catering.food_court'},
 {pattern:/caf[eé]|coffee|espresso|roaster/i,categories:'catering.cafe,commercial.food_and_drink.coffee_and_tea'},
 {pattern:/museum|historical/i,categories:'entertainment.museum,tourism.sights'},
 {pattern:/antique|thrift/i,categories:'commercial.antiques,commercial.second_hand'},
 {pattern:/shop|shopping/i,categories:'commercial'},
 {pattern:/hiking|trail/i,categories:'leisure,natural'},
 {pattern:/boat|marina|fishing/i,categories:'leisure,sport'},
 {pattern:/waterfall|falls/i,categories:'natural,tourism.sights'},
 {pattern:/lighthouse/i,categories:'tourism.sights'}
];
// "catering" is an OpenStreetMap category group. A caterer-for-hire alone
// does not qualify for Restaurants. A caterer with a separate restaurant/cafe
// tag DOES qualify; preserve it.
function isCustomerFacingRestaurant(p){
 const tags=(Array.isArray(p.categories)?p.categories:[]).map(s=>String(s).toLowerCase());
 const amenity=String(p.datasource?.raw?.amenity||'').toLowerCase();
 const type=String(p.datasource?.raw?.cuisine||'').toLowerCase();
 const hasDiningTag=tags.some(t=>/^catering\.(restaurant|cafe|fast_food|food_court)(?:\.|$)/.test(t));
 const hasDiningAmenity=['restaurant','cafe','fast_food','food_court'].includes(amenity);
 return hasDiningTag||hasDiningAmenity;
}
function diningLabel(p){
 const tags=Array.isArray(p.categories)?p.categories:[];
 const amenity=String(p.datasource?.raw?.amenity||'').toLowerCase();
 if(tags.some(t=>/^catering\.fast_food/.test(t))||amenity==='fast_food')return 'Takeout / fast food';
 if(tags.some(t=>/^catering\.food_court/.test(t))||amenity==='food_court')return 'Food court';
 if(tags.some(t=>/^catering\.cafe/.test(t))||amenity==='cafe')return 'Cafe';
 return 'Restaurant';
}
// Search directly tagged café and coffee/tea shops missed by the Geoapify
// category index. Only a user-initiated, reasonably sized map-view request;
// never poll, prefetch, or run an unrestricted regional/bulk query.
const osmCoffeeCache=new Map();
async function osmCoffeePlaces(area,signal){
 if(osmCoffeeCache.has(area))return osmCoffeeCache.get(area);
 const [west,south,east,north]=area.slice(5).split(',').map(Number);
 const sizeKm2=(north-south)*111.32*(east-west)*111.32*Math.max(0,Math.cos((north+south)/2*Math.PI/180));
 if(!Number.isFinite(sizeKm2)||sizeKm2>30000)return [];
 const bbox=[south,west,north,east].map(x=>x.toFixed(5)).join(',');
 const query='[out:json][timeout:12];(nwr["amenity"="cafe"]('+bbox+');'+
  'nwr["shop"~"^(coffee|tea)$"]('+bbox+');'+
  'nwr["shop"="bakery"]["name"~"coffee|caf[eé]|espresso|roaster",i]('+bbox+');'+
  'nwr["building"]["name"~"coffee|caf[eé]|espresso|roaster",i]('+bbox+'););out center 450;';
 const data=await requestOsmElements(query,signal);
 const features=(Array.isArray(data.elements)?data.elements:[]).map(e=>{
  const raw=e.tags||{},name=String(raw.name||'').trim();
  const lat=Number(e.lat??e.center?.lat),lon=Number(e.lon??e.center?.lon);
  if(!name||!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const cafe=raw.amenity==='cafe',bakery=raw.shop==='bakery',coffeeRetail=['coffee','tea'].includes(raw.shop);
  const coffeeNamed=/coffee|caf[eé]|espresso|roaster/i.test(name);
  // Named buildings and bakeries qualify only if the name advertises coffee.
  if(!cafe&&!coffeeRetail&&!coffeeNamed)return null;
  const categories=cafe?['catering','catering.cafe']:bakery?
   ['commercial','commercial.food_and_drink.bakery']:
   ['commercial','commercial.food_and_drink.coffee_and_tea'];
  const street=[raw['addr:housenumber'],raw['addr:street']].filter(Boolean).join(' ');
  const address=[street,raw['addr:city'],raw['addr:state']].filter(Boolean).join(', ');
  return {type:'Feature',geometry:{coordinates:[lon,lat]},properties:{
   name,lat,lon,categories,formatted:address,opening_hours:raw.opening_hours||'',
   datasource:{raw},sourceLabel:'OpenStreetMap',
   website:raw.website||raw['contact:website']||'',description:''
  }};
 }).filter(Boolean);
 if(osmCoffeeCache.size>=12)osmCoffeeCache.delete(osmCoffeeCache.keys().next().value);
 osmCoffeeCache.set(area,features);
 return features;
}
function sameNearbyBusiness(a,b){
 if(a.placeId&&b.placeId&&a.placeId===b.placeId)return true;
 return a.name.trim().toLowerCase()===b.name.trim().toLowerCase()&&mapPlaceDistance(a,b)<110;
}

const discoveryCache=new Map();

let discoveryOffset=0,discoverySignature='',discoveryRequest=0,discoveryArea='';
const DISCOVERY_PAGE_SIZE=100;
function genericDiscoveryTerm(term){
 return /^(restaurants?|caf[eé]s?|coffees?|coffee shops?|winer(?:y|ies)|vineyards?|wine tasting|shops?|shopping|antique shops?|thrift stores?|museums?|historical sites?|hiking|trails?|boating|fishing|marinas?|waterfalls?|falls|lighthouses?|attractions?|events?|hotels?|lodging|camping|parks?|scenic drives?|businesses?|nearby)$/i.test(term.trim());
}
function discoveryFoundPlace(feature,category,match,restaurantOnly){
 const p=feature?.properties||{},item=mapPlaceFromFeature(feature);if(!item)return null;
 return {...item,kind:restaurantOnly?diningLabel(p):item.kind,
  searchCategory:match?.categories?.includes('production.winery')?'wineries':category,
  category:detectedCategory(item.categories,item.name,category),sourceKind:'Business'};
}
function placeAlreadySaved(item){
 return state.places.find(x=>x.tripId===active&&
  ((item.placeId&&x.geoapifyId===item.placeId)||
   (x.name?.trim().toLowerCase()===item.name?.trim().toLowerCase()&&
    x.lat!=null&&x.lng!=null&&Math.abs(Number(x.lat)-item.lat)<0.00005&&Math.abs(Number(x.lng)-item.lng)<0.00005)));
}
function planDiscoveredPlace(item){
 if(!trip()||!item?.name)return;
 const saved=placeAlreadySaved(item);
 fillActivity({name:item.name,category:detectedCategory(item.categories,item.name,item.searchCategory||''),
  notes:saved?.notes||'',placeId:saved?.id||'',lat:Number(item.lat),lng:Number(item.lng),
  geoapifyId:item.placeId||saved?.geoapifyId||'',hours:item.hours||saved?.hours||'',
  date:saved?.date||'',endDate:saved?.endDate||'',time:saved?.time||'',endTime:saved?.endTime||'',
  fixedDate:!!saved?.fixedDate});
}
function saveDiscoveredIdea(item){
 if(!trip()||!item?.name||!Number.isFinite(Number(item.lat))||!Number.isFinite(Number(item.lng)))return false;
 const old=placeAlreadySaved(item);
 if(!old){
  state.places.unshift({id:uid(),tripId:active,name:item.name,
   category:detectedCategory(item.categories,item.name,item.searchCategory||''),
   location:item.address||'',notes:'',lat:Number(item.lat),lng:Number(item.lng),
   geoapifyId:item.placeId||'',hours:item.hours||'',date:'',endDate:'',time:'',endTime:'',fixedDate:false});
  persist();
 }
 if($('#discoverStatus'))$('#discoverStatus').textContent=old?'Already in Ideas: '+item.name:'Saved to Ideas: '+item.name;
 return true;
}
function discoveryCard(item,i){
 const saved=placeAlreadySaved(item),review=Discovery.reviewSearchUrl(item),blurb=Discovery.description(item);
 return '<article class="poi" id="poi-card-'+i+'" data-discovery-index="'+i+'">'+
  '<strong>'+esc(item.name)+'</strong>'+
  '<p class="poi-meta">'+esc(String(item.kind).replaceAll(/[._]/g,' '))+(item.address?' · '+esc(item.address):'')+'</p>'+
  '<p class="poi-description" id="poi-description-'+i+'">'+esc(blurb||'Checking available descriptions…')+'</p>'+
  '<p class="poi-hours" id="poi-hours-'+i+'">'+esc(item.hours?'Hours: '+Discovery.hoursText(item.hours):'Checking hours…')+'</p>'+
  '<div id="poi-contact-'+i+'" class="poi-contact"></div>'+
  '<div class="row wrap poi-links">'+(review?'<a href="'+esc(review)+'" target="_blank" rel="noopener noreferrer">Find ratings & reviews on Google Maps</a>':'')+
    (item.website?'<a href="'+esc(item.website)+'" target="_blank" rel="noopener noreferrer">Website</a>':'')+'</div>'+
  '<div class="poi-extra" id="poi-extra-'+i+'"></div>'+
  '<div class="row wrap poi-actions"><button class="quiet small" data-preview="'+i+'">Map #'+(i+1)+'</button>'+
  '<button class="quiet small" data-place-details="'+i+'">Details</button>'+
  '<button class="secondary small" data-suggest="'+i+'" '+(saved?'disabled':'')+'>'+(saved?'Saved':'+ Save idea')+'</button>'+
  '<button class="primary small" data-suggest-plan="'+i+'">+ Itinerary</button></div></article>';
}
async function discover(loadMore=false){
 if(!map)return;
 const category=$('#category').value,term=$('#discoverText').value.trim();
 const center=map.getCenter();
 const button=$('#discover'),moreButton=$('#discoverMore'),status=$('#discoverStatus'),results=$('#suggestions');
 const key=window.LAZY_ACRES_GEOAPIFY_KEY;
 if(!key||key==='PASTE_YOUR_GEOAPIFY_BROWSER_KEY_HERE'){
  status.textContent='Nearby discovery is not configured yet.';return;
 }
 const match=DISCOVERY_TERMS.find(x=>x.pattern.test(term));
 const categories=category==='all'||category==='other'?(match?.categories||DISCOVERY_CATEGORIES[category]||DISCOVERY_CATEGORIES.all):(DISCOVERY_CATEGORIES[category]||DISCOVERY_CATEGORIES.all);
 const restaurantOnly=category==='restaurants'||((category==='all'||category==='other')&&!!match&&/catering\.(restaurant|fast_food|food_court)/.test(categories));
 const coffeeSearch=category==='coffee_shops'||((category==='all'||category==='other')&&!!match&&match.categories.includes('catering.cafe'));
 // A term such as "Lake View Restaurant" is a name, not merely a request for any restaurant.
 const nameFilter=term&&!genericDiscoveryTerm(term)?normalizedBusinessName(term):'';
 const centerPoint=Number(center.lng).toFixed(6)+','+Number(center.lat).toFixed(6);
 const area=(loadMore&&discoveryArea)||visibleMapArea();
 if(!area){status.textContent='Move or zoom the map before searching.';return;}
 const signature=[category,term,categories,nameFilter,area].join('|');
 if(!loadMore||signature!==discoverySignature){
  loadMore=false;discoveryOffset=0;discoverySignature=signature;discoveryArea=area;
 }
 // Geoapify can miss a named business when too many unrelated categories
 // are combined. Small groups keep partial-name searches reliable.
 const groups=nameFilter&&['all','other'].includes(category)?
  ['catering','commercial,accommodation','tourism,entertainment,leisure,natural,production.winery']:[categories];
 const queries=groups.map(group=>{
  const params=new URLSearchParams({categories:group,filter:area,bias:'proximity:'+centerPoint,
   limit:String(DISCOVERY_PAGE_SIZE),offset:String(discoveryOffset),apiKey:key});
  if(nameFilter)params.set('name',nameFilter);
  return params;
 });
 const cacheKey='grouped|'+queries.map(x=>x.toString()).join('|');
 const token=++discoveryRequest;
 button.disabled=true;moreButton.disabled=true;
 if(!loadMore){
  results.innerHTML='';window.__tripSuggestions=[];
  discoveryMarkers?.clearLayers();
  $('#discoverShowOnMap').classList.add('hidden');
 }
 const scope='the visible map';
 status.textContent='Searching '+scope+(nameFilter?' for "'+nameFilter+'"':'')+'…';
 try{
  let cached=discoveryCache.get(cacheKey);
  if(!cached){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   try{
    const batches=await Promise.allSettled(queries.map(async params=>{
     const response=await fetch('https://api.geoapify.com/v2/places?'+params,{signal:controller.signal});
     if(!response.ok){
      if(response.status===401||response.status===403)throw Error('Geoapify access denied (HTTP '+response.status+').');
      if(response.status===429)throw Error('Geoapify rate limit reached. Try again later.');
      throw Error('Geoapify HTTP '+response.status+'.');
     }
     const data=await response.json();
     if(!Array.isArray(data.features))throw Error('Unexpected place search response.');
     return data.features;
    }));
    const valid=batches.filter(r=>r.status==='fulfilled').map(r=>r.value);
    if(!valid.length)throw batches[0].reason;
    cached={features:valid.flat(),more:valid.some(batch=>batch.length===DISCOVERY_PAGE_SIZE)};
    if(discoveryCache.size>=30)discoveryCache.delete(discoveryCache.keys().next().value);
    discoveryCache.set(cacheKey,cached);
   }finally{clearTimeout(timer);}
  }
  const {features,more:hasMore}=cached;
  if(token!==discoveryRequest)return;
  let coffeeSupplement=[];
  let coffeeCoverageNote='';
  if(!loadMore&&coffeeSearch){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
   try{coffeeSupplement=await osmCoffeePlaces(area,controller.signal);}
   catch{coffeeCoverageNote=' · Direct OpenStreetMap lookup unavailable';}
   finally{clearTimeout(timer);}
  }
  if(token!==discoveryRequest)return;
  const previous=loadMore?(window.__tripSuggestions||[]):[];
  const known=new Set(previous.map(x=>x.placeId||[x.name.toLowerCase(),x.lat.toFixed(4),x.lng.toFixed(4)].join('|')));
  const accepted=[];
  const additions=[...features,...coffeeSupplement].filter(f=>!restaurantOnly||isCustomerFacingRestaurant(f.properties||{}))
   .map(f=>discoveryFoundPlace(f,category,match,restaurantOnly)).filter(Boolean)
   .filter(x=>{
    if(nameFilter&&!x.name.toLowerCase().includes(nameFilter.toLowerCase()))return false;
    const k=x.placeId||[x.name.toLowerCase(),x.lat.toFixed(4),x.lng.toFixed(4)].join('|');
    if(known.has(k)||[...previous,...accepted].some(y=>sameNearbyBusiness(x,y)))return false;
    known.add(k);accepted.push(x);return true;
   });
  const found=[...previous,...additions];
  // When a named business is missing from Geoapify, query OSM within the
  // identical map rectangle. Never expand this named fallback globally.
  if(!found.length&&nameFilter&&!loadMore){
   try{
    const fallback=await nominatimNamedSearch(term,area,8);
    if(token!==discoveryRequest)return;
    const expectedCategory={
     lodging:'Lodging',restaurants:'Restaurants',coffee_shops:'Coffee Shops',
     wineries:'Wineries',shopping:'Shopping',hiking:'Hiking',
     boating:'Boating',fishing:'Fishing',events:'Events',attractions:'Attractions'
    }[category];
    for(const feature of fallback){
     if(restaurantOnly&&!isCustomerFacingRestaurant(feature.properties||{}))continue;
     const item=discoveryFoundPlace(feature,category,match,restaurantOnly);
     if(!item||expectedCategory&&item.category!==expectedCategory)continue;
     const id=item.placeId||[item.name.toLowerCase(),item.lat.toFixed(4),item.lng.toFixed(4)].join('|');
     if(known.has(id))continue;
     known.add(id);found.push(item);
    }
   }catch{/* Unavailable public fallback does not break primary results. */}
  }
  window.__tripSuggestions=found;discoveryOffset+=DISCOVERY_PAGE_SIZE;
  const scroller=document.querySelector('.explore-side'),oldScroll=scroller?.scrollTop||0;
  results.innerHTML=found.length?found.map(discoveryCard).join(''):
   '<p class="empty">No matching businesses in this source. Try a broader category, move or zoom the map, or use the place-name search above it.</p>';
  if(loadMore&&scroller)scroller.scrollTop=oldScroll;
  renderDiscoveryMarkers(found);observeDiscoveryCards();
  const mapButton=$('#discoverShowOnMap');
  mapButton.classList.toggle('hidden',!found.length);
  mapButton.textContent='Show all '+found.length+' on map';
  moreButton.classList.toggle('hidden',!hasMore);
  status.textContent=found.length+' matching places in '+scope+
   (hasMore?' · use Load more to see the next '+DISCOVERY_PAGE_SIZE:'')+
   (nameFilter?' · name: '+nameFilter:'')+coffeeCoverageNote+'.';
  if(found.length)showDiscoveryResultsOnMap();
  else if(window.matchMedia('(max-width:760px)').matches)setMobileSheet('expanded');
 }catch(error){
  if(token!==discoveryRequest)return;
  status.textContent=error.name==='AbortError'?'Business search timed out. Try again.':'Business search failed: '+error.message;
 }finally{if(token===discoveryRequest){button.disabled=false;moreButton.disabled=false;}}
}

function planPlace(id){
 const x=state.places.find(p=>p.id===id&&p.tripId===active);
 if(!x)return;
 fillActivity({name:x.name,category:x.category,notes:x.notes,placeId:x.id,lat:x.lat??null,lng:x.lng??null,geoapifyId:x.geoapifyId||'',hours:x.hours||'',date:x.date||'',endDate:x.endDate||'',time:x.time||'',endTime:x.endTime||'',fixedDate:!!x.fixedDate});
}
function form(sel,handler){$(sel).addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(handler(d)!==false){e.target.reset();persist()}})}
$('#ideaCategoryFilter').addEventListener('change',e=>{ideaFilter=e.target.value;render();});
$('#ideaSearch').addEventListener('input',e=>{ideaQuery=e.target.value;render();});
$('#ideaClearSearch').addEventListener('click',()=>{ideaQuery='';$('#ideaSearch').value='';render();$('#ideaSearch').focus();});
$('#itineraryView').addEventListener('change',e=>{itineraryView=['all','unscheduled','booking','mustdo'].includes(e.target.value)?e.target.value:'all';render();});
// A one-step category correction, without editing any other Idea fields.
$('#placeList').addEventListener('change',e=>{
 const select=e.target.closest?.('[data-idea-category]');
 if(!select||!PLACE_CATEGORIES.includes(select.value))return;
 const idea=state.places.find(x=>x.id===select.dataset.ideaCategory&&x.tripId===active);
 if(!idea||normalizedCategory(idea.category)===select.value)return;
 idea.category=select.value;
 // Keep the moved Idea visible when the old category was filtered.
 if(ideaFilter!=='all'&&ideaFilter!==select.value)ideaFilter=select.value;
 persist();
});
$('#newTrip').onclick=()=>$('#tripDialog').showModal();$('#cancelTrip').onclick=()=>$('#tripDialog').close();$('#exitTrip').onclick=exitTrip;$('#cancelPlace').onclick=()=>$('#placeDialog').close();$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)};$('#searchButton').onclick=()=>searchLocation($('#searchText').value);$('#searchText').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchLocation(e.target.value)}};$('#discover').onclick=()=>discover(false);$('#discoverMore').onclick=()=>discover(true);$('#discoverShowOnMap').onclick=showDiscoveryResultsOnMap;$('#discoverText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!$('#discover').disabled)discover();}});$('#tripCenter').onclick=()=>{const t=trip();if(t?.lat!=null&&t?.lng!=null)map?.setView([t.lat,t.lng],10);else if(t?.destination)searchLocation(t.destination,true)};
form('#tripForm',d=>{if(d.start&&d.end&&d.end<d.start){alert('End date must be on or after start date.');return false}const t={id:uid(),...d};state.trips.push(t);$('#tripDialog').close();setTimeout(()=>showTrip(t.id),0)});
form('#placeForm',d=>{
 if(!selectedPoint)return false;
 const target=placeDestination,point={...selectedPoint};
 $('#placeDialog').close();
 if(target==='itinerary'){
   fillActivity({name:d.name,category:d.category,notes:d.notes,lat:point.lat,lng:point.lng,geoapifyId:point.geoapifyId||'',hours:point.hours||''});
   return false;
 }
 state.places.unshift({id:uid(),tripId:active,...d,notes:cleanImportedNotes(d.notes),...point});
});
form('#manualPlace',d=>{
 d=Ideas.normalizeDraft(d);
 const issue=Ideas.validateDraft(d);
 if(issue){alert(issue);return false;}
 state.places.unshift({id:uid(),tripId:active,...d,category:normalizedCategory(d.category)});
 ideaFilter='all';ideaQuery='';$('#ideaSearch').value='';collapsedPlaceCategories.delete(normalizedCategory(d.category));
 $('#manualPlace').closest('.mobile-add-card')?.classList.remove('is-open');$('#mobileShowIdeaForm').setAttribute('aria-expanded','false');
});form('#activityForm',d=>{
 d=Itinerary.normalizeDraft(d);
 const issue=Itinerary.validateDraft(d);
 if(issue){alert(issue);return false;}
 const loc=pendingActivityLocation||{};
 // A decided itinerary item can originate from a considered idea, but a
 // directly added itinerary item does not also create an unwanted idea.
 const saved=loc.placeId?state.places.find(p=>p.id===loc.placeId&&p.tripId===active):null;
 state.activities.push({id:uid(),tripId:active,...d,endDate:d.category==='Lodging'?d.endDate:'',
   category:normalizedCategory(d.category),placeId:saved?.id||'',lat:loc.lat??null,lng:loc.lng??null,hours:d.hours||'',notes:cleanImportedNotes(d.notes)});
 pendingActivityLocation=null;itineraryView='all';$('#itineraryView').value='all';
 $('#activityForm').closest('.mobile-add-card')?.classList.remove('is-open');$('#mobileShowActivityForm').setAttribute('aria-expanded','false');
});form('#noteForm',d=>state.notes.unshift({id:uid(),tripId:active,...d}));form('#packForm',d=>state.packing.push({id:uid(),tripId:active,title:d.item,category:PACKING_CATEGORIES.some(c=>c.key===d.category)?d.category:'trip-misc',done:false}));

const EDIT_FORMS={
 trips:{title:'Edit trip',fields:[
  {name:'name',label:'Trip name',required:true,maxlength:120},
  {name:'destination',label:'Destination / region',maxlength:160},
  {name:'start',label:'Start date',type:'date'},
  {name:'end',label:'End date',type:'date'}
 ]},
 places:{title:'Edit idea',fields:[
  {name:'name',label:'Idea, activity or place',required:true,maxlength:160},
  {name:'category',label:'Category',type:'select',options:PLACE_CATEGORIES},
  {name:'location',label:'Location or link (optional)',maxlength:400},
  {name:'date',label:'Possible event / visit date',type:'date'},
  {name:'endDate',label:'End / checkout date',type:'date'},
  {name:'time',label:'Start time (local)',type:'time'},
  {name:'endTime',label:'End time (local)',type:'time'},
  {name:'fixedDate',label:'Happens on a fixed date',type:'checkbox'},
  {name:'hours',label:'Business hours',maxlength:500},
  {name:'notes',label:'Notes',type:'textarea'}
 ]},
 activities:{title:'Edit itinerary entry',fields:[
  {name:'title',label:'Activity or stop',required:true,maxlength:160},
  {name:'category',label:'Category',type:'select',options:PLACE_CATEGORIES},
  {name:'date',label:'Date (optional for flexible activities)',type:'date'},
  {name:'endDate',label:'Checkout date',type:'date'},
  {name:'time',label:'Start time (local)',type:'time'},
  {name:'endTime',label:'End time (local)',type:'time'},
  {name:'mustDo',label:'Must do',type:'checkbox'},
  {name:'fixedDate',label:'Fixed-date event',type:'checkbox'},
  {name:'hours',label:'Business hours',maxlength:500},
  {name:'notes',label:'Details / notes',type:'textarea'},
  {name:'reservationStatus',label:'Reservation',type:'select',options:[
   {value:'none',label:'Not needed / undecided'},
   {value:'needed',label:'Need to book'},
   {value:'booked',label:'Booked / tickets purchased'}
  ]},
  {name:'confirmationCode',label:'Confirmation number',maxlength:160},
  {name:'bookingUrl',label:'Booking or ticket link',type:'url',maxlength:1000}
 ]},
 notes:{title:'Edit research note',fields:[
  {name:'title',label:'Title',required:true,maxlength:160},
  {name:'body',label:'Details, links or questions',type:'textarea',required:true}
 ]},
 packing:{title:'Edit packing item',fields:[
  {name:'title',label:'Item name',required:true,maxlength:120},
  {name:'category',label:'Category',type:'select',options:PACKING_CATEGORIES.map(c=>({value:c.key,label:c.label}))},
  {name:'done',label:'Packed',type:'checkbox'}
 ]}
};
let editing=null;
function syncEditCategory(){
 if(editing?.kind!=='activities')return;
 const form=$('#editForm'),lodging=form.elements.category.value==='Lodging';
 form.elements.date.required=lodging||form.elements.fixedDate.checked;
 form.elements.endDate.required=lodging;
 form.elements.endDate.closest('label').hidden=!lodging;
 form.elements.endTime.closest('label').hidden=lodging;
 if(!lodging)form.elements.endDate.value='';
 if(lodging)form.elements.endTime.value='';
}
function openEdit(kind,id){
 const def=EDIT_FORMS[kind],record=state[kind]?.find(x=>x.id===id&&(kind==='trips'||x.tripId===active));
 if(!def||!record)return;
 editing={kind,id,original:JSON.stringify(record)};
 $('#editTitle').textContent=def.title;
 const host=$('#editFields');host.replaceChildren();
 const compact=window.matchMedia('(max-width:760px)').matches&&['places','activities'].includes(kind);
 const more=compact?document.createElement('details'):null;
 if(more){more.className='mobile-edit-more';const caption=document.createElement('summary');
  caption.textContent='More details (optional)';more.append(caption);}
 for(const field of def.fields){
  const label=document.createElement('label');label.className='field';
  label.append(document.createTextNode(field.label));
  let control;
  if(field.type==='select'){
   control=document.createElement('select');
   for(const option of field.options){
    const opt=document.createElement('option');
    opt.value=typeof option==='string'?option:option.value;
    opt.textContent=typeof option==='string'?option:option.label;
    control.append(opt);
   }
  }else if(field.type==='textarea'){
   control=document.createElement('textarea');
  }else{
   control=document.createElement('input');control.type=field.type||'text';
  }
  control.name=field.name;
  if(field.maxlength)control.maxLength=field.maxlength;
  control.required=!!field.required;
  if(field.type==='checkbox')control.checked=!!record[field.name];
  else if(field.type==='time')control.value=Itinerary.canonicalTime(record[field.name]);
  else control.value=record[field.name]??'';
  label.append(control);
  const basic=kind==='places'?['name','category','date','time','fixedDate']:
   ['title','category','date','endDate','time','endTime','mustDo','fixedDate','reservationStatus'];
  if(more&&!basic.includes(field.name))more.append(label);else host.append(label);
 }
 if(more&&more.children.length>1)host.append(more);
 if(kind==='activities'){
  $('#editForm').elements.category.addEventListener('change',syncEditCategory);
  $('#editForm').elements.fixedDate.addEventListener('change',syncEditCategory);
  syncEditCategory();
 }
 $('#editDialog').showModal();
}
$('#editTrip').addEventListener('click',()=>{const t=trip();if(t)openEdit('trips',t.id);});
$('#cancelEdit').addEventListener('click',()=>$('#editDialog').close());
$('#editDialog').addEventListener('close',()=>{editing=null;});
$('#editForm').addEventListener('submit',event=>{
 event.preventDefault();
 if(!editing)return;
 const {kind,id,original}=editing,record=state[kind].find(x=>x.id===id);
 if(!record||JSON.stringify(record)!==original){
  alert('This entry changed on another device while you were editing. Reopen it to see the latest version.');
  $('#editDialog').close();return;
 }
 const form=event.currentTarget,d=Object.fromEntries(new FormData(form));
 if(kind==='trips'&&d.start&&d.end&&d.end<d.start){alert('Trip end date must be after its start date.');return;}
 if(kind==='activities'){
  Object.assign(d,Itinerary.normalizeDraft(d));
  const issue=Itinerary.validateDraft(d);
  if(issue){alert(issue);return;}
  d.category=normalizedCategory(d.category);
 }
 if(kind==='places'){
  Object.assign(d,Ideas.normalizeDraft(d));
  const issue=Ideas.validateDraft(d);
  if(issue){alert(issue);return;}
  d.category=normalizedCategory(d.category);
 }
 if(kind==='packing')d.done=form.elements.done.checked;
 Object.assign(record,d);
 $('#editDialog').close();
 persist();
});
document.addEventListener('toggle',event=>{
 if(!event.target.matches?.('.list-category'))return;
 const key=event.target.dataset.category;
 if(event.target.open)collapsedPlaceCategories.delete(key);
 else collapsedPlaceCategories.add(key);
},true);

function moveBackToIdeas(id){
 const item=state.activities.find(a=>a.id===id&&a.tripId===active);
 if(!item)return;
 const booking=[];
 if(item.reservationStatus==='booked')booking.push('Reservation: booked / tickets purchased');
 else if(item.reservationStatus==='needed')booking.push('Reservation: need to book');
 if(item.confirmationCode)booking.push('Confirmation: '+item.confirmationCode);
 if(item.bookingUrl)booking.push('Booking link: '+item.bookingUrl);
 if(booking.length&&!confirm('This itinerary entry has booking information. It will be retained in the idea notes. Move this plan back to Ideas?'))return;
 const idea=state.places.find(x=>x.id===item.placeId&&x.tripId===active);
 const originalNotes=idea?.notes?.trim()||'';
 let notes=item.notes?.trim()||'';
 if(originalNotes&&notes!==originalNotes&&!notes.includes(originalNotes)){
  notes+=[notes?'\n\n':'','Previous idea notes:\n',originalNotes].join('');
 }
 if(booking.length){
  const extra=booking.filter(x=>!notes.includes(x));
  if(extra.length)notes+=(notes?'\n\n':'')+extra.join('\n');
 }
 const restored={...Ideas.fromItinerary(item),notes,
  lat:item.lat??idea?.lat??null,lng:item.lng??idea?.lng??null};
 if(idea)Object.assign(idea,restored);
 else state.places.unshift({id:uid(),tripId:active,location:'',geoapifyId:'',...restored});
 state.activities=state.activities.filter(x=>x.id!==item.id);
 ideaFilter='all';ideaQuery='';$('#ideaSearch').value='';collapsedPlaceCategories.delete(normalizedCategory(restored.category));
 persist();
 setTab('places');
}
document.addEventListener('click',async e=>{
 const detailsButton=e.target.closest('[data-place-details]');
 if(detailsButton){
  const i=Number(detailsButton.dataset.placeDetails),place=window.__tripSuggestions?.[i],target=$('#poi-extra-'+i);
  if(!place||!target)return;
  detailsButton.closest('.poi')?.classList.add('mobile-details-open');detailsButton.disabled=true;target.textContent='Loading place details…';
  try{
   const details=await getDiscoveryPlaceDetails(place);
   if(window.__tripSuggestions?.[i]!==place)return;
   const overview=await discoveryOverview(place,details);
   if(window.__tripSuggestions?.[i]!==place)return;
   target.replaceChildren();
   addDiscoveryExplanation(target,overview);
   const hours=details.opening_hours||place.hours;
   if(hours){const el=document.createElement('p');el.textContent='Hours: '+Discovery.hoursText(hours);target.append(el);}
   appendContactInfo(target,details);
  }catch(error){target.textContent='Additional details are unavailable right now.';}
  finally{detailsButton.disabled=false;}
  return;
 }
 const editButton=e.target.closest('[data-edit]');if(editButton){const [kind,id]=editButton.dataset.edit.split(':');openEdit(kind,id);return;}
 const open=e.target.closest('[data-open]');if(open)showTrip(open.dataset.open);const rm=e.target.closest('[data-remove]');if(rm){const [key,id]=rm.dataset.remove.split(':');if(confirm('Remove this item from the trip?')){state[key]=state[key].filter(x=>x.id!==id);persist()}}const unschedule=e.target.closest('[data-unschedule]');if(unschedule){moveBackToIdeas(unschedule.dataset.unschedule);return;}const loc=e.target.closest('[data-locate]');if(loc){const x=state.places.find(p=>p.id===loc.dataset.locate);if(x&&geo(x)){setTab('explore');setTimeout(()=>map?.setView([x.lat,x.lng],14),100)}}const plan=e.target.closest('[data-plan]');if(plan)planPlace(plan.dataset.plan);const preview=e.target.closest('[data-preview]');if(preview){const x=window.__tripSuggestions?.[Number(preview.dataset.preview)];if(x){setMobileSheet('collapsed');map?.setView([x.lat,x.lng],15);const discovered=discoveryMarkers?.getLayers().find(m=>{const q=m.getLatLng();return Math.abs(q.lat-x.lat)<0.000001&&Math.abs(q.lng-x.lng)<0.000001});if(discovered)discovered.openPopup();else L.popup().setLatLng([x.lat,x.lng]).setContent(mapMenuContent({lat:x.lat,lng:x.lng},x.name,'','',detectedCategory(x.categories||[x.kind],x.name,x.searchCategory))).openOn(map)}}const suggest=e.target.closest('[data-suggest]');if(suggest){const x=window.__tripSuggestions?.[Number(suggest.dataset.suggest)];if(x){const saved=saveDiscoveredIdea(x);if(saved){suggest.disabled=true;suggest.textContent='Saved';}}return;}
 const planSuggestion=e.target.closest('[data-suggest-plan]');
 if(planSuggestion){const x=window.__tripSuggestions?.[Number(planSuggestion.dataset.suggestPlan)];if(x)planDiscoveredPlace(x);return;}
});
$('#packList').addEventListener('change',e=>{if(e.target.dataset.pack){const x=state.packing.find(p=>p.id===e.target.dataset.pack&&p.tripId===active);if(x){x.done=e.target.checked;persist()}}});
routeUI=window.createVacationRoutes({
 getTrip:()=>trip(),getRoutes:()=>state.routes||[],
 getPlaces:()=>forTrip('places'),getActivities:()=>forTrip('activities'),
 persist,uid,onPickChange:()=>{addingPlace=false;syncMapMode();if(routeUI?.isPicking())setMobileSheet('collapsed');}
});
initializeMobileWorkspace();if(!trip())active=null;render();if(active){const t=trip();if(t?.lat==null&&t?.destination)searchLocation(t.destination,true)}
};
