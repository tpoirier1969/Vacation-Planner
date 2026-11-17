/* Source-backed discovery fields. No inferred or fabricated customer ratings. */
(function(root){'use strict';
function sentence(value,max=220){
 const text=String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 if(!text)return '';
 const end=text.match(/^.{20,}?[.!?](?=\s|$)/);
 let part=end?.[0]||text;
 if(part.length>max){const cut=part.slice(0,max);part=cut.slice(0,cut.lastIndexOf(' '))+'…';}
 return part;
}
function description(data){
 const raw=data?.datasource?.raw||{};
 const value=data?.description_international?.en||data?.description||raw['description:en']||raw.description;
 if(value)return sentence(value);
 const cuisine=String(data?.catering?.cuisine||raw.cuisine||'').replace(/_/g,' ').replace(/;/g,', ').trim();
 if(cuisine)return sentence('Cuisine: '+cuisine+'.');
 return '';
}
function wikiTarget(data){
 const ref=data?.wiki_and_media?.wikipedia||data?.datasource?.raw?.wikipedia;
 const match=typeof ref==='string'?/^en:([^?#]{2,220})$/.exec(ref.trim()):null;
 if(!match)return null;
 const title=match[1].trim().replace(/\s+/g,'_');
 return {api:'https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title),
  page:'https://en.wikipedia.org/wiki/'+encodeURIComponent(title)};
}
async function wikipediaSummary(data,fetcher=fetch){
 const target=wikiTarget(data);
 if(!target)return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
 try{
  const response=await fetcher(target.api,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)return null;
  const page=await response.json();
  if(page.type==='disambiguation'||typeof page.extract!=='string')return null;
  const text=sentence(page.extract,240);
  if(!text)return null;
  const url=page?.content_urls?.desktop?.page;
  return {text,url:typeof url==='string'&&/^https:\/\/en\.wikipedia\.org\/wiki\//.test(url)?url:target.page};
 }catch{return null;}finally{clearTimeout(timer);}
}

/* Exact OSM/Geoapify IDs avoid mismatching nearby attractions by name. */
function wikidataTarget(data){
 const id=String(data?.wikidata||data?.wiki_and_media?.wikidata||data?.datasource?.raw?.wikidata||'').trim();
 if(!/^Q[1-9][0-9]{0,11}$/.test(id))return null;
 const params=new URLSearchParams({action:'wbgetentities',ids:id,
  props:'descriptions|sitelinks',languages:'en',sitefilter:'enwiki',format:'json',origin:'*'});
 return {id,api:'https://www.wikidata.org/w/api.php?'+params.toString(),page:'https://www.wikidata.org/wiki/'+id};
}
async function wikidataSummary(data,fetcher=fetch){
 const target=wikidataTarget(data);
 if(!target)return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
 try{
  const response=await fetcher(target.api,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)return null;
  const json=await response.json(),entity=json?.entities?.[target.id];
  if(!entity||entity.missing!==undefined)return null;
  const title=entity.sitelinks?.enwiki?.title;
  if(typeof title==='string'&&title.length>1){
   const article=await wikipediaSummary({wiki_and_media:{wikipedia:'en:'+title}},fetcher);
   if(article)return {...article,source:'Wikipedia'};
  }
  const short=entity.descriptions?.en?.value;
  return typeof short==='string'&&short.trim()?{text:sentence(short,225),url:target.page,source:'Wikidata'}:null;
 }catch{return null;}finally{clearTimeout(timer);}
}
function categorySummary(data){
 const raw=data?.datasource?.raw||{};
 const tags=[...(Array.isArray(data?.categories)?data.categories:[]),data?.kind||'',
  raw.historic?'historic.'+raw.historic:'',raw.natural?'natural.'+raw.natural:'',
  raw.tourism?'tourism.'+raw.tourism:'',raw.leisure?'leisure.'+raw.leisure:''].join(' ').toLowerCase();
 const types=[
  [/lighthouse/,'lighthouse'],[/waterfall/,'waterfall'],[/viewpoint/,'scenic viewpoint'],
  [/museum/,'museum'],[/monument/,'monument'],[/memorial/,'memorial'],
  [/ruins/,'historic ruins'],[/battlefield/,'battlefield'],
  [/cave_entrance|cave\.entrance/,'cave entrance'],
  [/rock_formation/,'rock formation'],[/nature_reserve/,'nature reserve'],
  [/national_park/,'national park'],[/observation_tower/,'observation tower'],
  [/beach/,'beach'],[/sculpture/,'sculpture'],[/castle/,'castle'],
  [/gallery/,'art gallery'],[/zoo/,'zoo'],[/aquarium/,'aquarium'],
  [/hiking|trail/,'trail or hiking area'],[/vineyard|winery/,'winery or vineyard'],
  [/historic/,'historic site'],[/park/,'park'],[/tourism|entertainment/,'visitor attraction']
 ];
 const type=types.find(([pattern])=>pattern.test(tags))?.[1];
 return type?'Mapped as a '+type+' in OpenStreetMap; no fuller description was provided.':'No description available from the open-data sources.';
}

const DAYS={Mo:'Mon',Tu:'Tue',We:'Wed',Th:'Thu',Fr:'Fri',Sa:'Sat',Su:'Sun'};
function hoursText(input){
 const str=String(input??'').trim();
 if(!str)return '';
 if(str==='24/7')return 'Open 24 hours';
 const parts=str.split(';').map(x=>x.trim()).filter(Boolean);
 const converted=parts.map(piece=>{
  const m=/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(off|closed|[0-2]\d:[0-5]\d-[0-2]\d:[0-5]\d)$/.exec(piece);
  if(!m)return null;
  const days=m[1].replace(/Mo|Tu|We|Th|Fr|Sa|Su/g,x=>DAYS[x]).replaceAll(',',', ');
  if(['off','closed'].includes(m[2]))return days+' closed';
  const fmt=t=>{const [h,min]=t.split(':').map(Number);if(h>23)return t;return (h%12||12)+(min?':'+String(min).padStart(2,'0'):'')+(h>=12?' PM':' AM')};
  const [a,b]=m[2].split('-');return days+' '+fmt(a)+'–'+fmt(b);
 });
 return converted.length&&converted.every(Boolean)?converted.join(' · '):str.slice(0,240);
}
function reviewSearchUrl(place){
 const query=[place?.name,place?.address].filter(Boolean).join(' ').trim();
 return query?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query):null;
}
function combined(place,details={}){
 return {
  description:description(details)||description(place),
  hours:details.opening_hours||details.datasource?.raw?.opening_hours||place.hours||'',
  website:details.website||place.website||'',
  phone:details.contact?.phone||details.phone||place.phone||'',
  wikipedia:details.wiki_and_media?.wikipedia||place.wikipedia||''
 };
}
root.VacationDiscovery=Object.freeze({sentence,description,wikiTarget,wikipediaSummary,wikidataTarget,wikidataSummary,categorySummary,hoursText,reviewSearchUrl,combined});
})(window);
