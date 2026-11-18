import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const origin='https://ggm-ops.planus253.workers.dev';
function environment(){
 const files=[];
 const env={
   CAFE24_CLIENT_ID:'test-id',
   CAFE24_CLIENT_SECRET:'test-secret',
   GGM_AUTH:{
     async get(){return null},async put(){},async delete(){}
   },
   ASSETS:{
     async fetch(request){
       const pathname=new URL(request.url).pathname;files.push(pathname);
       return new Response(pathname==='/index.html'?'<button id="refresh"></button><button id="reconnect"></button>DASHBOARD PAGE':'STATIC PAGE',
         {headers:{'Content-Type':'text/html'}})
     }
   }
 };
 return {env,files};
}
function visit(path,env){
 return worker.fetch(new Request(origin+path),env);
}
test('login experiment is disabled without changing core routes',async()=>{
 const {env}=environment();
 const login=await visit('/login.html',env);
 assert.equal(login.status,302);
 assert.equal(login.headers.get('location'),'/');
 const auth=await visit('/auth/mode',env);
 assert.equal(auth.status,404);
});
test('dashboard assets remain available to Access-authenticated edge requests',async()=>{
 const {env,files}=environment();
 const root=await visit('/',env);
 assert.equal(root.status,200);
 assert.equal(root.headers.get('X-GGM-Page'),'dashboard');
 assert.match(await root.text(),/DASHBOARD PAGE/);
 assert.deepEqual(files,['/index.html']);
});
test('Cafe24 status API remains unchanged',async()=>{
 const {env}=environment();
 const response=await visit('/api/status',env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.mall_id,'ggmspa');
 assert.equal(data.connected,false);
});
// Cloudflare Access is configured at the edge and cannot be simulated by this unit test.
// NEVER disable Access based on these local tests; actual authenticated/unauthenticated
// browser and API checks are required before contractor delivery.
