// GGM OPS dedicated login — Cloudflare D1.
// Rollout: keep Cloudflare Access protecting all traffic until D1 is initialized and tested.
// When GGM_LOGIN_ENFORCE=true, session validation is mandatory and fails closed.
const COOKIE = 'ggm_session';
const SESSION_AGE = 30 * 24 * 60 * 60;
const MIN_ITERATIONS = 310000;
const encoder = new TextEncoder();
const JSON_HEADERS = {
  'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
};
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const randomHex=(length=32)=>[...crypto.getRandomValues(new Uint8Array(length))].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function timingEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function validCredentials(username,password){
  return /^[a-z][a-z0-9._-]{3,31}$/i.test(String(username||'')) &&
    typeof password==='string' && password.length>=12 && password.length<=128;
}
async function passwordHash(password,salt,iterations=MIN_ITERATIONS){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations},key,256);
  return Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function cookieValue(request){
  const part=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
  return part?part.slice(COOKIE.length+1):'';
}
function setSessionCookie(value,age=SESSION_AGE){
  return COOKIE+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
}
function allowedOrigin(request){
  const origin=request.headers.get('Origin');
  return origin===new URL(request.url).origin;
}
async function bodyJson(request){
  if(Number(request.headers.get('content-length')||0)>8192)throw Error('invalid');
  const text=await request.text();
  if(text.length>8192)throw Error('invalid');
  return JSON.parse(text);
}
async function userBySession(request,env){
  const token=cookieValue(request);
  if(!/^[0-9a-f]{64}$/.test(token)||!env.AUTH_DB)return null;
  const digest=await sha(token);
  try{
    return await env.AUTH_DB.prepare(
      'SELECT u.id,u.username,u.role,u.active,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 LIMIT 1'
    ).bind(digest,Math.floor(Date.now()/1000)).first();
  }catch{return null}
}
async function newSession(userId,env){
  const token=randomHex(32),digest=await sha(token),now=Math.floor(Date.now()/1000);
  await env.AUTH_DB.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(digest,userId,now,now+SESSION_AGE).run();
  return token;
}
async function apiAuth(request,env){
  const u=await userBySession(request,env);
  if(!u)return json({error:'로그인이 필요합니다.',code:'LOGIN_REQUIRED'},401);
  return null;
}
async function handleAuth(request,env,path){
  if(!env.AUTH_DB)return json({error:'전용 로그인 저장소 연결 전입니다. 기존 Cloudflare Access를 유지해주세요.'},503);
  const method=request.method;
  if(method==='GET' && path==='/auth/me'){
    const user=await userBySession(request,env);
    return user?json({authenticated:true,user:{id:user.id,username:user.username,role:user.role}})
      :json({authenticated:false},401);
  }
  if(method==='GET' && path==='/auth/setup-status'){
    const count=await env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return json({setup_required:Number(count?.n||0)===0});
  }
  if(method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
  if(!allowedOrigin(request))return json({error:'허용되지 않은 요청입니다.'},403);
  let body;try{body=await bodyJson(request)}catch{return json({error:'요청 형식을 확인해주세요.'},400)}
  if(path==='/auth/bootstrap'){
    // One-time first admin. Secret stays in Cloudflare Worker Secrets.
    if(!env.GGM_BOOTSTRAP_KEY||env.GGM_BOOTSTRAP_KEY.length<32)return json({error:'관리자 초기화 비밀키가 설정되지 않았습니다.'},503);
    const count=await env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    if(Number(count?.n||0)!==0)return json({error:'초기 관리자 등록은 종료되었습니다.'},409);
    if(!timingEqual(String(body.setup_key||''),env.GGM_BOOTSTRAP_KEY))return json({error:'초기 등록 정보가 올바르지 않습니다.'},403);
    if(!validCredentials(body.username,body.password))return json({error:'아이디 4~32자, 비밀번호 12~128자로 입력해주세요.'},400);
    const salt=randomHex(16),hashed=await passwordHash(body.password,salt),now=Math.floor(Date.now()/1000);
    try{
      await env.AUTH_DB.prepare('INSERT INTO users (username,password_hash,password_salt,iterations,role,active,created_at) SELECT ?,?,?,?,\'admin\',1,? WHERE NOT EXISTS (SELECT 1 FROM users)')
        .bind(String(body.username).toLowerCase(),hashed,salt,MIN_ITERATIONS,now).run();
    }catch{return json({error:'초기 계정 생성에 실패했습니다.'},409)}
    return json({ok:true,message:'초기 관리자 계정이 등록되었습니다. 로그인해주세요.'},201);
  }
  if(path==='/auth/login'){
    const username=String(body.username||'').trim().toLowerCase(),password=body.password;
    if(!validCredentials(username,password))return json({error:'아이디 또는 비밀번호가 올바르지 않습니다.'},401);
    const u=await env.AUTH_DB.prepare('SELECT * FROM users WHERE username=? LIMIT 1').bind(username).first();
    const now=Math.floor(Date.now()/1000);
    if(!u||!u.active||Number(u.locked_until||0)>now)return json({error:'로그인할 수 없습니다. 계정정보를 확인하거나 잠시 후 다시 시도해주세요.'},401);
    const candidate=await passwordHash(password,u.password_salt,Number(u.iterations)||MIN_ITERATIONS);
    if(!timingEqual(candidate,u.password_hash)){
      await env.AUTH_DB.prepare('UPDATE users SET failed_attempts=failed_attempts+1, locked_until=CASE WHEN failed_attempts+1>=5 THEN ? ELSE locked_until END WHERE id=?')
        .bind(now+15*60,u.id).run();
      return json({error:'아이디 또는 비밀번호가 올바르지 않습니다.'},401);
    }
    await env.AUTH_DB.prepare('UPDATE users SET failed_attempts=0,locked_until=0 WHERE id=?').bind(u.id).run();
    const token=await newSession(u.id,env);
    return new Response(JSON.stringify({ok:true,user:{username:u.username,role:u.role}}),{
      status:200,headers:{...JSON_HEADERS,'Set-Cookie':setSessionCookie(token)}
    });
  }
  if(path==='/auth/logout'){
    const token=cookieValue(request);
    if(/^[0-9a-f]{64}$/.test(token)){
      await env.AUTH_DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
    }
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{...JSON_HEADERS,'Set-Cookie':setSessionCookie('',0)}});
  }
  if(path==='/auth/users'){
    const admin=await userBySession(request,env);
    if(!admin||admin.role!=='admin')return json({error:'관리자 권한이 필요합니다.'},403);
    if(!validCredentials(body.username,body.password))return json({error:'아이디 4~32자, 비밀번호 12~128자로 입력해주세요.'},400);
    const role=body.role==='admin'?'admin':'staff';
    const salt=randomHex(16),hashed=await passwordHash(body.password,salt),now=Math.floor(Date.now()/1000);
    try{
      await env.AUTH_DB.prepare('INSERT INTO users (username,password_hash,password_salt,iterations,role,active,created_at) VALUES (?,?,?,?,?,1,?)')
        .bind(String(body.username).toLowerCase(),hashed,salt,MIN_ITERATIONS,role,now).run();
      return json({ok:true},201);
    }catch{return json({error:'이미 존재하거나 사용할 수 없는 아이디입니다.'},409)}
  }
  return json({error:'찾을 수 없는 인증 경로입니다.'},404);
}
export {handleAuth,apiAuth,userBySession,json};
