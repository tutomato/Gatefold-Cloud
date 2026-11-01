import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NeteaseWebLogin, loginCookie } from './netease-web-login.mjs';
function fixture() {
  const data={cookies:[],closed:false,url:''};
  const page={on(){},async goto(url){data.url=url;}};
  const context={async newPage(){return page;},async cookies(){return data.cookies;}};
  const browser={on(){},async newContext(){return context;},async close(){data.closed=true;}};
  return {data,login:new NeteaseWebLogin(async()=>browser)};
}
test('only official NetEase login cookies are selected',()=>{
  assert.equal(loginCookie([{name:'MUSIC_U',value:'bad',domain:'.evil.test'}]),'');
  assert.equal(loginCookie([{name:'__csrf',value:'csrf',domain:'.music.163.com'}]),'');
  assert.equal(loginCookie([{name:'MUSIC_U',value:'test-key',domain:'.music.163.com'},{name:'unrelated',value:'secret',domain:'.music.163.com'}]),'MUSIC_U=test-key');
});
test('official login waits for user and closes only after session has been saved',async()=>{
  const {data,login}=fixture();await login.start();
  assert.equal(data.url,'https://music.163.com/#/login/');
  assert.deepEqual(await login.poll(()=>assert.fail('not logged in yet')),{state:'waiting'});
  data.cookies=[{name:'MUSIC_U',value:'test-key',domain:'.music.163.com'}];
  let saved=false;
  assert.deepEqual(await login.poll(async(cookie,active)=>{assert.equal(active(),true);assert.equal(cookie,'MUSIC_U=test-key');assert.equal(data.closed,false);saved=true;}),{state:'done'});
  assert.equal(saved,true);assert.equal(data.closed,true);
});
test('cancelling prevents an in-flight validation from restoring an account',async()=>{
  const {data,login}=fixture();await login.start();data.cookies=[{name:'MUSIC_U',value:'test-key',domain:'music.163.com'}];
  let begin;const started=new Promise(r=>begin=r);let resume;const blocked=new Promise(r=>resume=r);let saved=false;
  const pending=login.poll(async(cookie,active)=>{begin();await blocked;if(active())saved=true;});
  await started;await login.cancel();resume();await pending;
  assert.equal(saved,false);assert.equal(data.closed,true);
});
