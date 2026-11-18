import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cloud=readFileSync(new URL('../cloud.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=cloud.indexOf('// OTP verifies inside this browser/PWA storage context.');
const end=cloud.indexOf("$('#cloudSignOut').addEventListener",start);
assert.ok(start>=0&&end>start);
const auth=cloud.slice(start,end);
function harness(){
 const elements=new Map(),calls={send:[],verify:[],signOut:0,boot:0,status:''};
 const $=selector=>{
  if(!elements.has(selector))elements.set(selector,{
   value:'',textContent:'',disabled:false,events:{},
   classList:{hidden:false,add(x){this[x]=true},remove(x){this[x]=false}},
   addEventListener(type,fn){this.events[type]=fn;},focus(){this.focused=true;}
  });
  return elements.get(selector);
 };
 const client={auth:{
  signInWithOtp:async opts=>{calls.send.push(opts);return{error:null};},
  verifyOtp:async opts=>{calls.verify.push(opts);return opts.token==='123456'?{error:null}:{error:{message:'Invalid OTP'}};},
  signOut:async()=>{calls.signOut++;return{error:null};}
 }};
 const status=s=>{calls.status=s;};
 const factory=new Function('client','$','status','location','start','"use strict";'+auth+';return{pending:()=>pendingLoginEmail};');
 const api=factory(client,$,status,{origin:'https://tpoirier1969.github.io'},async()=>{calls.boot++;});
 const submit=async form=>{
  let prevented=false;
  await $(form).events.submit({preventDefault(){prevented=true}});
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.equal(prevented,true);
 };
 const click=async selector=>{
  await $(selector).events.click();
  for(let i=0;i<4;i++)await Promise.resolve();
 };
 return{calls,$,api,submit,click};
}
test('login has six-digit OTP input and account switching controls',()=>{
 for(const id of ['cloudLogin','cloudVerify','cloudEmail','cloudCode','cloudResendCode','cloudChangeEmail','cloudSwitchAccount'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/autocomplete="one-time-code"/);
 assert.match(html,/pattern="\[0-9\]\{6\}"/);
});
test('login requests OTP for existing account in app context',async()=>{
 const h=harness();h.$('#cloudEmail').value=' household@example.com ';
 await h.submit('#cloudLogin');
 assert.equal(h.calls.send.length,1);
 assert.equal(h.calls.send[0].email,'household@example.com');
 assert.equal(h.calls.send[0].options.shouldCreateUser,false);
 assert.equal(h.calls.send[0].options.emailRedirectTo,'https://tpoirier1969.github.io/Vacation-Planner/');
 assert.equal(h.api.pending(),'household@example.com');
 assert.equal(h.$('#cloudVerify').classList.hidden,false);
});
test('verification rejects invalid code and starts planner after success',async()=>{
 const h=harness();h.$('#cloudEmail').value='household@example.com';await h.submit('#cloudLogin');
 h.$('#cloudCode').value='000000';await h.submit('#cloudVerify');
 assert.equal(h.calls.boot,0);assert.match(h.calls.status,/Invalid OTP/);
 h.$('#cloudCode').value='123456';await h.submit('#cloudVerify');
 assert.equal(h.calls.boot,1);
 assert.equal(h.calls.verify[1].type,'email');
 assert.equal(h.calls.verify[1].email,'household@example.com');
});
test('changing account resets pending OTP and signs out',async()=>{
 const h=harness();h.$('#cloudEmail').value='household@example.com';await h.submit('#cloudLogin');
 await h.click('#cloudChangeEmail');
 assert.equal(h.api.pending(),'');
 assert.equal(h.$('#cloudLogin').classList.hidden,false);
 await h.click('#cloudSwitchAccount');
 assert.equal(h.calls.signOut,1);
});
