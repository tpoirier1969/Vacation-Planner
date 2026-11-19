import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('app loads uncached canonical version before release-specific scripts',()=>{
 assert.ok(html.includes('version.js?fresh='));
 assert.ok(html.includes('await window.LAZY_ACRES_VERSION_READY'));
 assert.ok(html.includes('planner.css?v='));
 assert.ok(html.includes("script.src='./'+file+'?v='"));
 assert.ok(!html.includes('<script src="./version.js"></script>'));
});
test('app checks version when reactivated without clearing user data',()=>{
 assert.ok(html.includes('version.js?check='));
 assert.ok(html.includes("cache:'no-store'"));
 assert.ok(html.includes("latest&&latest!==v"));
 assert.ok(html.includes("location.replace(url.toString())"));
 assert.ok(html.includes("'visibilitychange'"));
 assert.ok(!html.includes('localStorage.clear()'));
});
