import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../planner.js', import.meta.url), 'utf8');
function section(start, end) {
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a, 'Could not locate '+start);
 return source.slice(a,b);
}
const nameCode=section('function normalizedBusinessName(', 'let searchMatches=[]');
const normalize=new Function(nameCode+'; return normalizedBusinessName;')();

test('business search tolerates omitted leading articles and partial names',()=>{
 assert.equal(normalize('The Old Post Office'), 'Old Post Office');
 assert.equal(normalize('Old Post Office'), 'Old Post Office');
 assert.equal(normalize(' An   Example Cafe '), 'Example Cafe');
});

test('map search returns partially named restaurants and offers Idea + Itinerary',async()=>{
 const ui=new Map();
 const $=name=>{if(!ui.has(name))ui.set(name,{
  innerHTML:'',disabled:false,classList:{add(){},remove(){}},
  addEventListener(type,handler){this[type]=handler;}
 });return ui.get(name);};
 const found={properties:{
  name:'Old Post Office Restaurant',formatted:'Ephraim, WI',
  lat:45.158674,lon:-87.171573,place_id:'place-123',categories:['catering','catering.restaurant']
 },geometry:{coordinates:[-87.171573,45.158674]}};
 const calls=[];
 const fetch=async url=>{
  const parsed=new URL(String(url)),params=parsed.searchParams;
  calls.push({path:parsed.pathname,name:params.get('name'),categories:params.get('categories'),filter:params.get('filter')});
  const matches=parsed.pathname.endsWith('/places')&&params.get('categories')==='catering'&&params.get('name')==='Old Post Office';
  return {ok:true,json:async()=>({features:matches?[found]:[]})};
 };
 const dependencies={
  URLSearchParams,document:{activeElement:null},HTMLElement:class{},
  window:{LAZY_ACRES_GEOAPIFY_KEY:'test-key',matchMedia:()=>({matches:true})},
  map:{getCenter:()=>({lat:45.158674,lng:-87.171573}),getBounds:()=>({getWest:()=>-87.5,getSouth:()=>44.9,getEast:()=>-86.9,getNorth:()=>45.5})},trip:()=>({}),$,fetch,
  mapPlaceFromFeature:f=>({name:f.properties.name,lat:f.properties.lat,lng:f.properties.lon,
   placeId:f.properties.place_id,categories:f.properties.categories}),
  detectedCategory:()=> 'Restaurants',esc:String,
  setMobileSheet(){},setTab(){},initMap(){},setTimeout(){},L:{},
  saveDiscoveredIdea(){return true;},planDiscoveredPlace(){return true;},
  genericDiscoveryTerm:()=>false,DISCOVERY_TERMS:[],discover:async()=>{},
  DISCOVERY_CATEGORIES:{all:'tourism,entertainment,catering'}
 };
 const code=section('function visibleMapArea(', '// Geoapify Places API');
 const create=new Function('d', 'const {URLSearchParams,document,HTMLElement,window,map,trip,$,fetch,mapPlaceFromFeature,detectedCategory,esc,setMobileSheet,setTab,initMap,setTimeout,L,saveDiscoveredIdea,planDiscoveredPlace,DISCOVERY_CATEGORIES,genericDiscoveryTerm,DISCOVERY_TERMS,discover}=d;let searchToken=0;'+code+';return {searchLocation,results:()=>searchMatches};');
 const api=create(dependencies);
 await api.searchLocation('Old Post Office');
 assert.equal(api.results()[0]?.name,'Old Post Office Restaurant');
 assert.equal(api.results().length,1);
 assert.ok(calls.some(x=>x.categories==='catering'&&x.name==='Old Post Office'&&x.filter?.startsWith('rect:')));
 assert.ok(ui.get('#searchMatches').innerHTML.includes('data-search-save="0"'));
 assert.ok(ui.get('#searchMatches').innerHTML.includes('data-search-plan="0"'));
});

test('adding a search result to itinerary opens prefilled form without creating an Idea',()=>{
 let draft=null,ideaWrites=0;
 const create=new Function('trip','placeAlreadySaved','fillActivity','detectedCategory',
  section('function planDiscoveredPlace(', 'function saveDiscoveredIdea(')+';return planDiscoveredPlace;');
 const plan=create(()=>({id:'trip'}),()=>null,value=>{draft=value;},()=> 'Restaurants');
 plan({name:'Old Post Office Restaurant',lat:45.158674,lng:-87.171573,
  categories:['catering.restaurant'],placeId:'place-123',hours:'',address:'Ephraim'});
 assert.equal(draft?.name,'Old Post Office Restaurant');
 assert.equal(draft?.category,'Restaurants');
 assert.equal(draft?.geoapifyId,'place-123');
 assert.equal(draft?.placeId,'');
 assert.equal(ideaWrites,0);
});

test('discovery cards retain Map, Idea and Itinerary actions',()=>{
 const create=new Function('placeAlreadySaved','Discovery','esc',
  section('function discoveryCard(', 'async function discover(loadMore=false)')+';return discoveryCard;');
 const card=create(()=>null,{reviewSearchUrl:()=>'',description:()=>'',hoursText:x=>x},String);
 const markup=card({name:'Old Post Office Restaurant',kind:'Restaurant',address:'Ephraim',hours:'',categories:[]},7);
 assert.match(markup,/data-preview="7"/);
 assert.match(markup,/data-suggest="7"/);
 assert.match(markup,/data-suggest-plan="7"/);
});
