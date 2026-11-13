import {createHash,createCipheriv,createDecipheriv,randomBytes,pbkdf2Sync} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";

const mall=(process.env.CAFE24_MALL_ID||"ggmspa").trim();
const clientId=(process.env.CAFE24_CLIENT_ID||"").trim();
const clientSecret=(process.env.CAFE24_CLIENT_SECRET||"").trim();
const serviceText=process.env.FIREBASE_SERVICE_ACCOUNT_GGMAPI||"";
const viewPassword=(process.env.GGM_ORDER_VIEW_PASSWORD||"").trim();
const code=(process.env.OAUTH_CODE||"").trim();
const fromInput=(process.env.HISTORY_START||"").trim();
const toInput=(process.env.HISTORY_END||"").trim();
const today=new Date().toISOString().slice(0,10);
const fromDefault=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
const from=fromInput||fromDefault,to=toInput||today;
const historical=Boolean(fromInput||toInput);
const base="https://"+mall+".cafe24api.com/api/v2";
const redirect="https://jyhome1228-cyber.github.io/ggmprogram/oauth.html";
const apiVersion="2025-12-01";
const dates=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
function stop(code,message){throw new Error("SYNC_"+code+": "+message)}
if(!clientId||!clientSecret||!serviceText)stop("SETUP","Missing Cafe24 ID, Secret or existing encryption service secret");
if(!/^[a-zA-Z0-9_-]+$/.test(mall))stop("SETUP","Mall ID is invalid");
if(!dates(from)||!dates(to)||from>to||to>today)stop("DATES","Invalid YYYY-MM-DD range");
if((Date.parse(to)-Date.parse(from))/86400000>89)stop("DATES","Manual historical imports must be 90 days or less");
if(!viewPassword||viewPassword.length<16)stop("VIEW_PASSWORD","Add GGM_ORDER_VIEW_PASSWORD (at least 16 characters) in GitHub repository Secrets; existing Cafe24 credentials do not need changing");

let service;
try{service=JSON.parse(serviceText)}catch{stop("SETUP","Encryption service JSON invalid")}
if(!service.private_key)stop("SETUP","Encryption service private key missing");
const tokenKey=createHash("sha256").update(clientSecret+"|"+service.private_key).digest();
const readJSON=async name=>{try{return JSON.parse(await readFile(name,"utf8"))}catch(e){if(e.code==="ENOENT")return null;throw e}};
async function decryptToken(){
 const record=await readJSON("data/oauth-token.enc");
 if(!record)return null;
 try{
  const decipher=createDecipheriv("aes-256-gcm",tokenKey,Buffer.from(record.iv,"base64"));
  decipher.setAuthTag(Buffer.from(record.tag,"base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data,"base64")),decipher.final()]).toString("utf8"));
 }catch{stop("TOKEN_KEY","Saved token cannot be decrypted. The Client Secret or encryption service key may have changed. Do not delete the old encrypted file")}
}
async function saveToken(token){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",tokenKey,iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(token)),cipher.final()]);
 await writeFile("data/oauth-token.enc",JSON.stringify({v:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64")})+"\n");
}
async function oauth(body){
 const response=await fetch(base+"/oauth/token",{method:"POST",headers:{
  Authorization:"Basic "+Buffer.from(clientId+":"+clientSecret).toString("base64"),
  "Content-Type":"application/x-www-form-urlencoded"
 },body:new URLSearchParams(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token||!data.refresh_token){
  const error=String(data.error?.code||data.error||response.status).slice(0,80);
  stop("OAUTH","Cafe24 token exchange HTTP "+response.status+" / "+error+"; no credentials were printed");
 }
 return {access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+(Number(data.expires_in)||7200)*1000};
}
await mkdir("data",{recursive:true});
await writeFile("data/client.json",JSON.stringify({client_id:clientId,mall})+"\n");
// A newly approved one-time code can repair an invalid old encrypted token
// without deleting previous encrypted files.
let token=code?null:await decryptToken();
if(code){
 token=await oauth({grant_type:"authorization_code",code,redirect_uri:redirect});
 await saveToken(token);
 console.log("AUTHENTICATION_OK: new OAuth token saved");
}
if(!token)stop("OAUTH","No OAuth token saved. First-time Cafe24 approval is required");
if(!token.refresh_token)stop("OAUTH","Saved token has no refresh_token");
if(!token.access_token||Date.now()+90000>=Number(token.expires_at||0)){
 token=await oauth({grant_type:"refresh_token",refresh_token:token.refresh_token});
 await saveToken(token);
 console.log("TOKEN_REFRESHED: saved encrypted token");
}
const enc=new TextEncoder();
const safeNumber=n=>Number.isFinite(Number(n))?Number(n):0;
const urlOrders="/admin/orders";
async function queryWeek(start,end){
 const collected=[];
 for(let offset=0;offset<10000;offset+=100){
  const q=new URLSearchParams({start_date:start,end_date:end,limit:"100",offset:String(offset),embed:"items"});
  const response=await fetch(base+urlOrders+"?"+q,{headers:{
   Authorization:"Bearer "+token.access_token,"X-Cafe24-Api-Version":apiVersion
  }});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)stop("ORDERS","Cafe24 orders HTTP "+response.status+" during "+start+"~"+end+"; "+String(body.error?.code||body.error?.message||"").slice(0,90));
  const batch=Array.isArray(body.orders)?body.orders:[];
  collected.push(...batch);
  if(batch.length<100)return collected;
 }
 stop("PAGINATION","Over 10,000 order rows in a seven-day window. Refusing partial results");
}
const pulled=new Map();
for(let startMs=Date.parse(from+"T00:00:00Z");startMs<=Date.parse(to+"T00:00:00Z");startMs+=7*86400000){
 const start=new Date(startMs).toISOString().slice(0,10);
 const end=new Date(Math.min(startMs+6*86400000,Date.parse(to+"T00:00:00Z"))).toISOString().slice(0,10);
 const results=await queryWeek(start,end);
 for(const order of results){if(order.order_id)pulled.set(String(order.order_id),order)}
}
console.log("ORDER_API_OK",JSON.stringify({from,to,unique_order_numbers:pulled.size,historical}));

// Private browser-only archive, encrypted with a separate user-held passphrase.
const keyFor=salt=>pbkdf2Sync(viewPassword,salt,250000,32,"sha256");
async function getArchive(){
 const record=await readJSON("data/orders-private.enc");
 if(!record)return [];
 try{
  const decipher=createDecipheriv("aes-256-gcm",keyFor(Buffer.from(record.salt,"base64")),Buffer.from(record.iv,"base64"));
  decipher.setAuthTag(Buffer.from(record.tag,"base64"));
  const decoded=JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data,"base64")),decipher.final()]).toString("utf8"));
  return Array.isArray(decoded.orders)?decoded.orders:[];
 }catch{stop("ARCHIVE_PASSWORD","Cannot unlock existing private archive. Restore the original GGM_ORDER_VIEW_PASSWORD; do not overwrite")}
}
async function saveArchive(rows){
 const iv=randomBytes(12),salt=randomBytes(16);
 const cipher=createCipheriv("aes-256-gcm",keyFor(salt),iv);
 const data=Buffer.concat([cipher.update(JSON.stringify({schema:1,orders:rows,updated_at:new Date().toISOString()}),"utf8"),cipher.final()]);
 await writeFile("data/orders-private.enc",JSON.stringify({v:1,alg:"PBKDF2-SHA256+A256GCM",iterations:250000,iv:iv.toString("base64"),salt:salt.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64")})+"\n");
}
const previous=await getArchive();
const archive=new Map(previous.filter(x=>x?.order_id).map(x=>[String(x.order_id),x]));
for(const [id,order] of pulled){
 const old=archive.get(id)||{};
 const items=Array.isArray(order.items)?order.items:[];
 const recv=Array.isArray(order.receivers)?order.receivers[0]||{}:order.receivers||{};
 const buyer=order.buyer||{};
 archive.set(id,{
  order_id:id,order_date:String(order.order_date||old.order_date||""),
  order_status:String(order.order_status||old.order_status||""),
  buyer_name:String(buyer.name||order.buyer_name||old.buyer_name||""),
  recipient_name:String(recv.name||old.recipient_name||""),
  recipient_phone:String(recv.cellphone||recv.phone||old.recipient_phone||""),
  recipient_address:String([recv.address1,recv.address2].filter(Boolean).join(" ")||old.recipient_address||""),
  tracking_no:String(order.tracking_no||old.tracking_no||""),
  products:items.length?items.map(item=>({
   name:String(item.product_name||""),option:String(item.option_value||item.option_name||""),
   quantity:safeNumber(item.quantity),status:String(item.order_status||"")
  })):old.products||[],
  checked_at:new Date().toISOString()
 });
}
const archived=[...archive.values()].sort((a,b)=>String(b.order_date).localeCompare(String(a.order_date)));
await saveArchive(archived);
console.log("PRIVATE_ORDER_ARCHIVE_OK",JSON.stringify({newly_checked:pulled.size,total_stored:archived.length}));

// Existing sales summary remains public, but contains no order IDs or PII.
if(!historical){
 const byProduct=new Map(),byDay=new Map(),byDayProduct=new Map();
 const add=(map,key,id,qty)=>{
  const str=JSON.stringify(key),p=map.get(str)||{ids:new Set(),quantity:0,key};
  p.ids.add(id);p.quantity+=qty;map.set(str,p);
 };
 for(const [id,order] of pulled){
  const date=String(order.order_date||"").slice(0,10);
  if(!dates(date))continue;
  const day=byDay.get(date)||{ids:new Set(),quantity:0};
  day.ids.add(id);
  for(const item of Array.isArray(order.items)?order.items:[]){
   const name=String(item.product_name||"상품명 미확인"),option=String(item.option_value||item.option_name||"");
   const productNo=String(item.product_no||""),qty=safeNumber(item.quantity);
   day.quantity+=qty;add(byProduct,[productNo,name,option],id,qty);
   add(byDayProduct,[date,productNo,name,option],id,qty);
  }
  byDay.set(date,day);
 }
 const products=[...byProduct.values()].map(x=>({product_no:x.key[0],name:x.key[1],option:x.key[2],orders:x.ids.size,quantity:x.quantity})).sort((a,b)=>b.quantity-a.quantity);
 const daily=[...byDay.entries()].map(([date,x])=>({date,orders:x.ids.size,quantity:x.quantity})).sort((a,b)=>b.date.localeCompare(a.date));
 const daily_products=[...byDayProduct.values()].map(x=>({date:x.key[0],product_no:x.key[1],name:x.key[2],option:x.key[3],orders:x.ids.size,quantity:x.quantity})).sort((a,b)=>b.date.localeCompare(a.date));
 const summary={schema:2,source:"Cafe24 Admin API",updated_at:new Date().toISOString(),period:{start_date:from,end_date:to},
  order_count:pulled.size,tracked_order_ids_total:archived.length,total_quantity:products.reduce((v,x)=>v+x.quantity,0),products,daily,daily_products,
  notes:"수량은 취소·환불 조정 이전의 주문상품 수량일 수 있습니다."};
 await writeFile("data/summary.json",JSON.stringify(summary,null,2)+"\n");
 console.log("PUBLIC_SUMMARY_OK",{orders:summary.order_count,products:products.length});
}else{
 console.log("HISTORY_IMPORTED: existing dashboard summary left unchanged");
}
