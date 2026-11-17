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
root.VacationDiscovery=Object.freeze({sentence,description,wikiTarget,wikipediaSummary,hoursText,reviewSearchUrl,combined});
})(window);
