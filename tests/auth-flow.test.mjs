import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const origin='https://ggm-ops.planus253.workers.dev';
const headers={Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.25'};
function environment(extra={}){
 const kv=new Map();
 const files=[];
 const env={
  GGM_AUTH_MODE:'shared',GGM_SHARED_PASSWORD:'test-password-for-unit-testing',
  GGM_BOOTSTRAP_KEY:'test-only-signing-key-not-for-production-0123456789',
  CAFE24_CLIENT_ID:'client-id',CAFE24_CLIENT_SECRET:'secret',
  GGM_AUTH:{
   async get(k){return kv.get(k)||null},
   async put(k,v){kv.set(k,v)},
   async delete(k){kv.delete(k)}
  },
  ASSETS:{
   async fetch(request){
    const path=new URL(request.url).pathname;files.push(path);
    return new Response(path==='/index.html'?'<button id="refresh"></button><button id="reconnect"></button>DASHBOARD PAGE':'LOGIN PAGE',{
     status:200,headers:{'Content-Type':'text/html'}
    });
   }
  },...extra
 };
 return {env,files};
}
async function visit(path,env,opts={}){
 return worker.fetch(new Request(origin+path,opts),env);
}
test('public login is stable: no redirects, mode visible, unauthenticated API denied',async()=>{
 const {env,files}=environment();
 const mode=await visit('/auth/mode',env);
 assert.equal(mode.status,200);
 assert.equal((await mode.json()).mode,'shared');
 const login=await visit('/login.html',env);
 assert.equal(login.status,200);
 assert.equal(login.headers.get('Location'),null);
 assert.equal(await login.text(),'LOGIN PAGE');
 const app=await visit('/app',env);
 assert.equal(app.status,200);
 assert.equal(app.headers.get('Location'),null);
 assert.equal(app.status,401);
 assert.equal((await app.json()).code,'LOGIN_REQUIRED');
 assert.equal(files.includes('/index.html'),false);
 const forbidden=await visit('/api/orders',env);
 assert.equal(forbidden.status,401);
 assert.equal((await forbidden.json()).code,'LOGIN_REQUIRED');
});
test('password -> signed session -> dashboard -> logout without redirect loop',async()=>{
 const {env}=environment();
 const bad=await visit('/auth/shared/login',env,{
  method:'POST',headers,body:JSON.stringify({password:'bad-password'})
 });
 assert.equal(bad.status,401);
 const response=await visit('/auth/shared/login',env,{
  method:'POST',headers,body:JSON.stringify({password:'test-password-for-unit-testing'})
 });
 assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookie,/^ggm_temp_session=[a-f0-9]{32}\.[0-9]{10}\.[a-f0-9]{64}$/);
 const me=await visit('/auth/shared/me',env,{headers:{Cookie:cookie}});
 assert.equal(me.status,200);
 assert.equal((await me.json()).authenticated,true);
 const dashboard=await visit('/app',env,{headers:{Cookie:cookie}});
 assert.equal(dashboard.status,200);
 assert.equal(dashboard.headers.get('location'),null);
 assert.match(await dashboard.text(),/DASHBOARD PAGE/);
 assert.equal(dashboard.headers.get('X-GGM-Page'),'dashboard');
 const logout=await visit('/auth/shared/logout',env,{
  method:'POST',headers:{...headers,Cookie:cookie},body:'{}'
 });
 assert.equal(logout.status,200);
 assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 const expired=await visit('/app',env);
 assert.equal(expired.status,401);
 assert.equal((await expired.json()).code,'LOGIN_REQUIRED');
});
test('cross-origin password submissions and missing secrets are blocked',async()=>{
 const {env}=environment();
 const foreign=await visit('/auth/shared/login',env,{
  method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},
  body:JSON.stringify({password:'test-password-for-unit-testing'})
 });
 assert.equal(foreign.status,403);
 const absent=await visit('/app',{...env,GGM_SHARED_PASSWORD:undefined});
 assert.equal(absent.status,503);
});
