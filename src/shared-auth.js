// Temporary shared-password login for internal testing only.
// Secrets MUST be configured on Cloudflare: GGM_SHARED_PASSWORD and GGM_BOOTSTRAP_KEY.
// Do not remove Cloudflare Access until all routes are verified.
const cookieName='ggm_temp_session', day=86400,ttl=7*day;
const encode=new TextEncoder();
function reply(data,status=200,extra={}) {
 return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function digest(s){return hex(await crypto.subtle.digest('SHA-256',encode.encode(s)))}
async function signature(payload,key){
 const k=await crypto.subtle.importKey('raw',encode.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',k,encode.encode(payload)));
}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
// Temporary QA passphrase hash. NEVER use this exposed, low-entropy test password
// as the sole security boundary for real customer/order information.
// This deliberately temporary QA code is never a production authentication mechanism.
// Keep Cloudflare Access ON. Migrate to strong random credentials before sharing.
const QA_SALT='ggm-qa-2026-v2';
const QA_HASH='51bfc8946613ad6e34f4dcc86196f8c934843babdde2569c22f4a08569a50954';
async function verifyQaPassword(password){
 if(typeof password!=='string'||password.length>128)return false;
 // SHA-256 avoids PBKDF2 execution timeouts on small CPU budgets during QA.
 const candidate=await digest(QA_SALT+'|'+password);
 return equal(candidate,QA_HASH);
}
function secretsReady(env){return typeof env.GGM_BOOTSTRAP_KEY==='string'&&env.GGM_BOOTSTRAP_KEY.length>=32}
function cookie(request){
 const match=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
 return match?.slice(cookieName.length+1)||'';
}
function newCookie(value,max=ttl){return cookieName+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+max}
async function valid(request,env) {
 if(!secretsReady(env))return false;
 const raw=cookie(request),parts=raw.split('.');
 if(parts.length!==3||!/^[0-9a-f]{32}$/.test(parts[0])||!/^[0-9]{10}$/.test(parts[1])||!/^[0-9a-f]{64}$/.test(parts[2]))return false;
 const expires=Number(parts[1]);
 if(expires<=Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+ttl)return false;
 const expected=await signature(parts[0]+'.'+parts[1],env.GGM_BOOTSTRAP_KEY);
 return equal(parts[2],expected);
}
async function handleShared(request,env,path){
 if(!secretsReady(env))return reply({error:'테스트 로그인 비밀값이 설정되지 않았습니다. 기존 Cloudflare Access를 유지해주세요.'},503);
 if(path==='/auth/shared/me'){
  return valid(request,env)?reply({authenticated:true,user:{username:'ggm-test',role:'admin'}}):reply({authenticated:false},401);
 }
 if(request.method!=='POST')return reply({error:'지원하지 않는 요청입니다.'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'허용되지 않은 요청입니다.'},403);
 if(path==='/auth/shared/logout')return reply({ok:true},200,{'Set-Cookie':newCookie('',0)});
 if(path!=='/auth/shared/login'&&path!=='/auth/shared/open')return reply({error:'경로를 찾을 수 없습니다.'},404);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const ipKey='ggm:login:attempts:'+await digest(ip);
 const attempts=Number(await env.GGM_AUTH.get(ipKey)||0);
 if(attempts>=5)return reply({error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'},429);
 let body;
 try{
   const raw=await request.text();
   if(raw.length>1024)throw Error();
   if(path==='/auth/shared/open')body=Object.fromEntries(new URLSearchParams(raw));
   else body=JSON.parse(raw);
 }catch{return reply({error:'입력 형식을 확인해주세요.'},400)}
 const actual=typeof body.password==='string'?body.password:'';
 if(!(await verifyQaPassword(actual))){
  await env.GGM_AUTH.put(ipKey,String(attempts+1),{expirationTtl:900});
  return reply({error:'비밀번호가 일치하지 않습니다.'},401);
 }
 await env.GGM_AUTH.delete(ipKey);
 const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
 const expire=String(Math.floor(Date.now()/1000)+ttl);
 const signed=nonce+'.'+expire+'.'+await signature(nonce+'.'+expire,env.GGM_BOOTSTRAP_KEY);
 return reply({ok:true},200,{'Set-Cookie':newCookie(signed)});
}
export {handleShared,valid,secretsReady,reply};