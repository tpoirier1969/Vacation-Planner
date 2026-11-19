import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
const fragment=(a,b)=>{const i=code.indexOf(a),j=code.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return code.slice(i,j);};
test('Ideas and itinerary use same Info control and native dialog',()=>{
 const controls=fragment('function editAndRemove(kind,x){','function ideaTiming(x){');
 assert.match(controls,/kind==='places'\|\|kind==='activities'/);
 assert.match(controls,/data-contact-info/);
 assert.match(html,/id="contactDialog" aria-labelledby="contactTitle"/);
 assert.match(html,/id="contactClose"/);
 assert.match(css,/#contactDialog/);
 assert.match(code,/void openContactInfo\(kind,id\)/);
});
test('Contact data accepts verified phone, website, email and address source',()=>{
 const functions=fragment('let contactInfoRequest=0;','// Expand details only for cards approaching the viewport.');
 const get=new Function('placeWebsite','placePhone','safeExternalURL','geo','mapPlaceDistance',
  'getDiscoveryPlaceDetails','mapPlaceFromFeature','namedOsmMapAtClick','window','fetch','URLSearchParams',functions+
  ';return {contactEmail,normalizedContactName,contactMatch,contactAddress,contactViewDetails};')(
  x=>x.website||'',x=>x.contact?.phone||x.datasource?.raw?.phone||'',
  x=>/^https?:\/\//.test(x||'')?x:null,
  x=>x&&x.lat!=null&&x.lng!=null,
  ()=>40,()=>({}),()=>({}),()=>[],{__tripSuggestions:[]},()=>({}),URLSearchParams);
 assert.equal(get.contactEmail({datasource:{raw:{'contact:email':'info@example.com'}}}),'info@example.com');
 assert.equal(get.contactEmail({email:'bad@example.com?cc=someone'}),'');
 assert.equal(get.contactEmail({email:'a\nb@example.com'}),'');
 assert.equal(get.normalizedContactName('The Fika Bakery & Coffee House'),get.normalizedContactName('Fika Bakery & Coffee House'));
 assert.equal(get.contactMatch({name:'Fika Bakery & Coffee House',lat:45,lng:-87},'Fika Bakery & Coffee House',{lat:45,lng:-87}),true);
 assert.equal(get.contactMatch({name:'Unrelated Coffee Shop',lat:45,lng:-87},'Fika Bakery & Coffee House',{lat:45,lng:-87}),false);
 const result=get.contactViewDetails({name:'Fika Bakery',location:'Egg Harbor'},{
  website:'https://example.com',datasource:{raw:{phone:'906-555-0100','contact:email':'info@example.com','addr:street':'Main St','addr:housenumber':'10'}}});
 assert.equal(result.email,'info@example.com');
 assert.equal(result.phone,'906-555-0100');
 assert.equal(result.address,'10 Main St');
});
test('Lookups remain on-demand, tied to active trip, and never persist data',()=>{
 const block=fragment('let contactInfoRequest=0;','// Expand details only for cards approaching the viewport.');
 assert.ok(block.includes("const linked=kind==='activities'?state.places.find"));
 assert.ok(block.includes('getDiscoveryPlaceDetails'));
 assert.ok(block.includes('namedOsmMapAtClick'));
 assert.ok(block.includes('active!==record.tripId'));
 assert.ok(!block.includes('persist()'));
});
