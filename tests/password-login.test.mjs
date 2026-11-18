import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cloud=readFileSync(new URL('../cloud.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=cloud.indexOf('let authRequestBusy=false;');
const end=cloud.indexOf("$('#cloudSignOut').addEventListener",start);
assert.ok(start>=0&&end>start,'password auth handlers present');
const auth=cloud.slice(start,end);
function createHarness(){
 const events=new Map(),calls={password:[],otp:[],updates:[],starts:0,status:''};
 const $=sel=>{
  if(!events.has(sel))events.set(sel,{
   value:'',disabled:false,
   classList:{hidden:false,add(c){this[c]=true},remove(c){this[c]=false}},
   addEventListener(type,fn){this[type]=fn;},focus(){this.focused=true;},
   reset(){this.wasReset=true;}
  });
  return events.get(sel);
 };
 const client={auth:{
  signInWithPassword:async params=>{
   calls.password.push({email:params.email});
   return{error:params.password==='correct-password'?null:{message:'Invalid credentials'}};
  },
  signInWithOtp:async params=>{calls.otp.push(params);return{error:null};},
  updateUser:async params=>{calls.updates.push({length:params.password.length});return{error:null};}
 }};
 const factory=new Function('client','$','status','start','authorized','location',auth);
 factory(client,$,msg=>{calls.status=msg;},async()=>{calls.starts++;},true,{origin:'https://tpoirier1969.github.io',pathname:'/Vacation-Planner/'});
 const submit=async sel=>{
  await $(sel).submit({preventDefault(){}});
  for(let i=0;i<5;i++)await Promise.resolve();
 };
 const click=async sel=>{
  await $(sel).click();
  for(let i=0;i<5;i++)await Promise.resolve();
 };
 return{$,calls,submit,click};
}
test('password sign-in is primary; email link is optional',()=>{
 assert.match(html,/id="cloudPasswordLogin"/);
 assert.match(html,/id="cloudPasswordUpdate"/);
 assert.match(html,/id="cloudLinkAlternative"/);
 assert.ok(html.indexOf('id="cloudPasswordLogin"')<html.indexOf('id="cloudLogin"'));
 assert.match(cloud,/signInWithPassword/);
 assert.match(cloud,/shouldCreateUser:false/);
 assert.ok(!cloud.includes('localStorage.setItem('));
});
test('failed login does not open a session; successful login does',async()=>{
 const h=createHarness();
 h.$('#cloudEmail').value='approved@example.com';
 h.$('#cloudPassword').value='wrong';
 await h.submit('#cloudPasswordLogin');
 assert.equal(h.calls.starts,0);
 assert.match(h.calls.status,/Invalid credentials/);
 h.$('#cloudPassword').value='correct-password';
 await h.submit('#cloudPasswordLogin');
 assert.equal(h.calls.starts,1);
 assert.equal(h.$('#cloudPassword').value,'');
});
test('set password needs verified existing member and matching 8+ characters',async()=>{
 const h=createHarness();
 h.$('#cloudNewPassword').value='8charPass';
 h.$('#cloudConfirmPassword').value='mismatch';
 await h.submit('#cloudPasswordUpdate');
 assert.equal(h.calls.updates.length,0);
 assert.match(h.calls.status,/do not match/);
 h.$('#cloudConfirmPassword').value='8charPass';
 await h.submit('#cloudPasswordUpdate');
 assert.equal(h.calls.updates.length,1);
 assert.equal(h.$('#cloudPasswordSettings').classList.hidden,true);
 assert.match(h.calls.status,/Password saved/);
});
test('eight characters are accepted but seven are rejected',async()=>{
 const h=createHarness();
 h.$('#cloudNewPassword').value='1234567';h.$('#cloudConfirmPassword').value='1234567';
 await h.submit('#cloudPasswordUpdate');
 assert.equal(h.calls.updates.length,0);
 assert.match(h.calls.status,/at least 8 characters/);
 h.$('#cloudNewPassword').value='12345678';h.$('#cloudConfirmPassword').value='12345678';
 await h.submit('#cloudPasswordUpdate');
 assert.equal(h.calls.updates.length,1);
 assert.match(h.calls.status,/Password saved/);
});
test('email link remains available but is never requested during password login',async()=>{
 const h=createHarness();h.$('#cloudEmail').value='approved@example.com';
 h.$('#cloudPassword').value='correct-password';
 await h.submit('#cloudPasswordLogin');
 assert.equal(h.calls.otp.length,0);
 await h.submit('#cloudLogin');
 assert.equal(h.calls.otp.length,1);
 assert.equal(h.calls.otp[0].options.shouldCreateUser,false);
});
