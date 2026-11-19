import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const cloud=readFileSync(new URL('../cloud.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
test('Change password appears once inside Trip options and not in header status',()=>{
 assert.equal((html.match(/id="cloudSetPassword"/g)||[]).length,1);
 const utility=html.slice(html.indexOf('<div class="masthead-utility">'),html.indexOf('<div id="tripHero"'));
 assert.doesNotMatch(utility,/cloudSetPassword/);
 const menu=html.slice(html.indexOf('<div class="trip-summary-actions">'),html.indexOf('</div>',html.indexOf('<div class="trip-summary-actions">')));
 assert.match(menu,/<button id="cloudSetPassword" class="quiet small hidden" type="button">Change login password<\/button>/);
 assert.match(cloud,/\$\('#cloudSetPassword'\)\.classList\.remove\('hidden'\)/);
 assert.match(cloud,/\$\('#cloudSetPassword'\)\.addEventListener\('click'/);
});
test('Mobile connection status occupies separate space beneath trip subtitle',()=>{
 assert.match(css,/position:absolute;top:57px;bottom:auto;left:0;right:92px/);
 assert.doesNotMatch(html,/Set login password<\/button>/);
});
