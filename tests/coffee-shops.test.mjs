import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function codeBetween(start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
 assert.ok(first>=0&&last>first,'Expected code boundaries: '+start);
 return source.slice(first,last);
}
const categories=codeBetween('const PLACE_CATEGORIES=', 'function flagIcon(');
const detector=codeBetween('function detectedCategory(', 'function mapMenuContent(');
const api=new Function(categories+'\n'+detector+'\nreturn {PLACE_CATEGORIES,FLAG_COLORS,normalizedCategory,detectedCategory};')();

test('Coffee Shops is a persistent, first-class category with a map marker color',()=>{
 assert.ok(api.PLACE_CATEGORIES.includes('Coffee Shops'));
 assert.equal(api.normalizedCategory('Coffee Shops'),'Coffee Shops');
 assert.equal(api.normalizedCategory('Restaurants'),'Restaurants');
 assert.equal(api.FLAG_COLORS['Coffee Shops'],'#80633e');
});

test('Geoapify coffee and cafe listings are distinct from restaurants',()=>{
 const detect=api.detectedCategory;
 assert.equal(detect(['catering.cafe.coffee_shop'],'High Street'),'Coffee Shops');
 assert.equal(detect(['catering','catering.cafe'],'Starbucks'),'Coffee Shops');
 assert.equal(detect(['commercial'],'North Woods Coffee House'),'Coffee Shops');
 assert.equal(detect(['commercial.food_and_drink.coffee_and_tea'],'Village Beans'),'Coffee Shops');
 assert.equal(detect(['catering.restaurant'],'Old Post Office Restaurant'),'Restaurants');
 assert.equal(detect(['catering.cafe','catering.restaurant'],'Diner and Cafe'),'Restaurants');
 assert.equal(detect(['catering.restaurant'],'Cafe Breakfast','coffee_shops'),'Coffee Shops');
});

test('Coffee Shops discovery is a Geoapify Places cafe category',()=>{
 assert.match(source, /coffee_shops:'catering\.cafe,commercial\.food_and_drink\.coffee_and_tea'/);
 assert.match(source, /restaurantOnly=category==='restaurants'/);
 assert.match(html, /<option value="coffee_shops">Coffee Shops<\/option>/);
});

test('Coffee Shops is selectable in Idea, Itinerary, and map-save forms',()=>{
 const options=html.match(/<option>Coffee Shops<\/option>/g)||[];
 assert.equal(options.length,3);
 assert.match(source, /Coffee Shops':'#80633e'/);
 assert.match(source, /c==='Coffee Shops'\?'Coffee stop date'/);
 assert.match(source, /const visibleCategories=new Set\(PLACE_CATEGORIES\)/);
});
