import { createHash, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const PROJECT="ggmapi-e15be";
const MALL=(process.env.CAFE24_MALL_ID||"ggmspa").trim();
const ID=(process.env.CAFE24_CLIENT_ID||"").trim();
const SECRET=(process.env.CAFE24_CLIENT_SECRET||"").trim();
const SA_TEXT=process.env.FIREBASE_SERVICE_ACCOUNT_GGMAPI;
const CODE=(process.env.OAUTH_CODE||"").trim();
const REDIRECT="https://jyhome1228-cyber.github.io/ggmprogram/oauth.html";
const SECRET_NAME="CAFE24_ORDER_OAUTH";
const BASE="https://"+MALL+".cafe24api.com/api/v2";
const VERSION="2025-12-01";
const ttl=7;
const dateOnly=d=>d.toISOString().slice(0,10);
function fail(message){throw new Error(message)}
if(!ID||!SECRET||!SA_TEXT)fail("Required existing GitHub Secrets missing. Need CAFE24_CLIENT_ID, CAFE24_CLIENT_SECRET, FIREBASE_SERVICE_ACCOUNT_GGMAPI");
if(!/^[a-zA-Z0-9_-]+$/.test(MALL))fail("Invalid Mall ID");
// No Firebase runtime: the existing GitHub Secret is used only as private encryption material.
let service;
try { service=JSON.parse(SA_TEXT); } catch { fail("Existing encryption secret is not valid JSON"); }
if(!service.private_key)fail("Encryption key material missing");
const cipherKey=createHash("sha256").update(SECRET+"|"+service.private_key).digest();
async function getSavedToken(){
 let entry;
 try{entry=JSON.parse(await readFile("data/oauth-token.enc","utf8"))}
 catch(e){if(e.code==="ENOENT")return null;fail("Encrypted token file missing or invalid")}
 try{
  const iv=Buffer.from(entry.iv,"base64"),tag=Buffer.from(entry.tag,"base64");
  const decipher=createDecipheriv("aes-256-gcm",cipherKey,iv);
  decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(Buffer.from(entry.data,"base64")),decipher.final()]).toString("utf8");
  return JSON.parse(plain);
 }catch{fail("Cannot decrypt saved OAuth token. Check unchanged GitHub Secrets")}
}
async function saveToken(payload){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",cipherKey,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),"utf8"),cipher.final()]);
 await mkdir("data",{recursive:true});
 await writeFile("data/oauth-token.enc",JSON.stringify({v:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:encrypted.toString("base64")})+"\n");
}
// Keep a private encrypted order-number ledger for continuity across sync runs.
// Do not publish IDs or recipient data in summary.json / Pages.
async function readEncryptedLedger(){
 try{
  const entry=JSON.parse(await readFile("data/order-ledger.enc","utf8"));
  const iv=Buffer.from(entry.iv,"base64"),tag=Buffer.from(entry.tag,"base64");
  const d=createDecipheriv("aes-256-gcm",cipherKey,iv);d.setAuthTag(tag);
  const plain=Buffer.concat([d.update(Buffer.from(entry.data,"base64")),d.final()]);
  const decoded=JSON.parse(plain.toString("utf8"));
  return Array.isArray(decoded.orders)?decoded.orders:[];
 }catch(e){
  if(e.code==="ENOENT")return [];
  fail("Existing encrypted order ledger cannot be decrypted. Preserving current file; check GitHub Secrets.");
 }
}
async function saveEncryptedLedger(orders){
 const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",cipherKey,iv);
 const payload=Buffer.from(JSON.stringify({schema:1,updated_at:new Date().toISOString(),orders}));
 const encrypted=Buffer.concat([c.update(payload),c.final()]);
 await writeFile("data/order-ledger.enc",JSON.stringify({v:1,iv:iv.toString("base64"),tag:c.getAuthTag().toString("base64"),data:encrypted.toString("base64")})+"\n");
}

async function cafeToken(body){
 const authorization="Basic "+Buffer.from(ID+":"+SECRET).toString("base64");
 const r=await fetch(BASE+"/oauth/token",{
  method:"POST",
  headers:{"Authorization":authorization,"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams(body)
 });
 const j=await r.json().catch(()=>({}));
 if(!r.ok){
  const code=String(j.error?.code||j.error||"unknown");
  const description=String(j.error_description||j.error?.message||"").slice(0,200);
  if(code==="invalid_client")fail("Cafe24 OAuth invalid_client (HTTP "+r.status+"). The GitHub CAFE24_CLIENT_ID and CAFE24_CLIENT_SECRET must match the SAME current Cafe24 app. Verify both values in GitHub Secrets. Do not share them in chat.");
  if(code==="invalid_grant")fail("Cafe24 OAuth invalid_grant. The 1-minute authorization code expired or was already used; request a new code after checking app credentials.");
  fail("Cafe24 OAuth "+code+" (HTTP "+r.status+"). "+description);
 }
 if(!j.access_token||!j.refresh_token)fail("Cafe24 token response missing access or refresh token");
 return j;
}

// Client ID is public OAuth app metadata, not a secret. Publish once for the setup page.
await mkdir("data",{recursive:true});
await writeFile("data/client.json",JSON.stringify({client_id:ID,mall:MALL})+"\n");
let saved=await getSavedToken();
if(CODE){
 const fresh=await cafeToken({grant_type:"authorization_code",code:CODE,redirect_uri:REDIRECT});
 saved={access_token:fresh.access_token,refresh_token:fresh.refresh_token,expires_at:Date.now()+7200_000};
 await saveToken(saved);
 console.log("Initial Cafe24 OAuth connection established");
}
if(!saved){console.log("NOT CONNECTED: one-time Cafe24 OAuth approval is still required. No private order data was published.");process.exit(0)}
// Renew on each sync; persist rotated refresh token as encrypted GitHub repository state.
const fresh=await cafeToken({grant_type:"refresh_token",refresh_token:saved.refresh_token});
saved={access_token:fresh.access_token,refresh_token:fresh.refresh_token,expires_at:Date.now()+7200_000};
await saveToken(saved);

const today=new Date();
const from=new Date(today.getTime()-29*86400000);
const historyStart=(process.env.HISTORY_START||"").trim();
const historyEnd=(process.env.HISTORY_END||"").trim();
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
if(historyStart&&!validDate(historyStart))fail("HISTORY_START must be YYYY-MM-DD");
if(historyEnd&&!validDate(historyEnd))fail("HISTORY_END must be YYYY-MM-DD");
const period={start_date:historyStart||dateOnly(from),end_date:historyEnd||dateOnly(today)};
if(period.start_date>period.end_date)fail("History start must precede end");
if(period.end_date>dateOnly(today))fail("History end cannot be in the future");
if((Date.parse(period.end_date)-Date.parse(period.start_date))/86400000>180)fail("Please run history imports in batches of at most 180 days");
const orders=[];
const chunks=[];
for(let cursor=new Date(period.start_date+"T00:00:00Z");dateOnly(cursor)<=period.end_date;cursor.setUTCDate(cursor.getUTCDate()+7)){
 const end=new Date(Math.min(Date.parse(period.end_date+"T00:00:00Z"),cursor.getTime()+6*86400000));
 chunks.push({start_date:dateOnly(cursor),end_date:dateOnly(end)});
}
for(const window of chunks){
 let complete=false;
 for(let offset=0;offset<1000;offset+=100){
  const params=new URLSearchParams({...window,limit:"100",offset:String(offset),embed:"items"});
  const response=await fetch(BASE+"/admin/orders?"+params,{headers:{Authorization:"Bearer "+saved.access_token,"X-Cafe24-Api-Version":VERSION}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)fail("Cafe24 orders GET failed (HTTP "+response.status+"): "+String(body.error?.message||body.error||"unknown"));
  const batch=Array.isArray(body.orders)?body.orders:[];
  orders.push(...batch);
  if(batch.length<100){complete=true;break;}
 }
 if(!complete)fail("Too many orders in a 7-day window; refusing to publish incomplete figures.");
}
const unique=new Map();
for(const order of orders){if(order.order_id)unique.set(String(order.order_id),order);}
if(orders.length && !unique.size)fail("Cafe24 did not return valid order numbers");
// Merge order IDs from this API pull with IDs captured by earlier runs.
const previous=await readEncryptedLedger();
const allOrders=new Map(previous.filter(x=>x&&typeof x.id==="string").map(x=>[x.id,x]));
const seenAt=new Date().toISOString();
for(const [id,order] of unique){
 const old=allOrders.get(id)||{};
 allOrders.set(id,{
  id,
  date:String(order.order_date||old.date||"").slice(0,10),
  status:String(order.order_status||old.status||""),
  item_count:Array.isArray(order.items)?order.items.length:Number(old.item_count||0),
  last_checked:seenAt
 });
}
await saveEncryptedLedger([...allOrders.values()].sort((a,b)=>b.date.localeCompare(a.date)));
console.log("ORDER_ID_TRACKING",JSON.stringify({seen_in_sync:unique.size,stored_total:allOrders.size,missing_order_id_rows:orders.length-unique.size}));

/* Admin-only order index: encrypted in GitHub, never written as plaintext.
   Browser decryption requires the user's password, not an API token. */
const VIEW_PASS=(process.env.GGM_ORDER_VIEW_PASSWORD||"").trim();
const hasViewPassword=VIEW_PASS.length>=16;
async function readPrivateOrders(){
 try {
  const entry=JSON.parse(await readFile("data/orders-private.enc","utf8"));
  const key=pbkdf2Sync(VIEW_PASS,Buffer.from(entry.salt,"base64"),250000,32,"sha256");
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(entry.iv,"base64"));
  decipher.setAuthTag(Buffer.from(entry.tag,"base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(entry.data,"base64")),decipher.final()]).toString("utf8"));
 }catch(e){if(e.code==="ENOENT")return {orders:[]};fail("Cannot decrypt order archive. Restore the original GGM_ORDER_VIEW_PASSWORD secret before syncing.");}
}
async function writePrivateOrders(rows){
 const salt=randomBytes(16),iv=randomBytes(12);
 const key=pbkdf2Sync(VIEW_PASS,salt,250000,32,"sha256");
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({schema:1,updated_at:new Date().toISOString(),orders:rows}),"utf8"),cipher.final()]);
 await writeFile("data/orders-private.enc",JSON.stringify({v:1,alg:"PBKDF2-SHA256+A256GCM",iterations:250000,salt:salt.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:encrypted.toString("base64")})+"\n");
}
if(hasViewPassword){
 const previousView=await readPrivateOrders();
 const orderArchive=new Map((previousView.orders||[]).filter(o=>o&&o.order_id).map(o=>[String(o.order_id),o]));
 for(const [id,o] of unique){
  const previous=orderArchive.get(id)||{};
  const items=Array.isArray(o.items)?o.items:[];
  const recv=Array.isArray(o.receivers)?o.receivers[0]||{}:(o.receivers||{});
  const buyer=o.buyer||{};
  const productRows=items.map(i=>({name:String(i.product_name||""),option:String(i.option_value||i.option_name||""),quantity:Number(i.quantity||0),status:String(i.order_status||"")}));
  orderArchive.set(id,{
    order_id:id,
    order_date:String(o.order_date||previous.order_date||""),
    order_status:String(o.order_status||previous.order_status||""),
    buyer_name:String(buyer.name||o.buyer_name||previous.buyer_name||""),
    recipient_name:String(recv.name||previous.recipient_name||""),
    recipient_phone:String(recv.cellphone||recv.phone||previous.recipient_phone||""),
    recipient_address:String([recv.address1,recv.address2].filter(Boolean).join(" ")||previous.recipient_address||""),
    tracking_no:String(o.tracking_no||previous.tracking_no||""),
    products:productRows.length?productRows:(previous.products||[]),
    checked_at:new Date().toISOString()
  });
 }
 const archived=[...orderArchive.values()].sort((a,b)=>(b.order_date||"").localeCompare(a.order_date||""));
 await writePrivateOrders(archived);
 console.log("PRIVATE_ORDER_ARCHIVE",JSON.stringify({retrieved_this_run:unique.size,stored_total:archived.length,contains_personal_information:true,published_as_encrypted_only:true}));
}else{
 console.log("PRIVATE_ORDER_ARCHIVE_SKIPPED: Add GGM_ORDER_VIEW_PASSWORD (16+ characters) as GitHub Actions secret; no order numbers will be exposed in public summaries.");
}
const byProduct=new Map(),byDay=new Map(),byDayProduct=new Map();
let itemRows=0,unmapped=0,unmappedDates=0;
function groupKey(item){
 return [String(item.product_no||""),String(item.product_name||"상품명 미확인"),String(item.option_value||item.option_name||"")];
}
function addProduct(map,key,orderId,qty){
 const id=JSON.stringify(key);
 const p=map.get(id)||{product_no:key[0],name:key[1],option:key[2],ids:new Set(),quantity:0};
 p.ids.add(orderId);p.quantity+=qty;map.set(id,p);
}
for(const order of unique.values()){
 const id=String(order.order_id);
 const date=String(order.order_date||"").slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){unmappedDates++;continue;}
 const items=Array.isArray(order.items)?order.items:[];
 if(items.length===0){unmapped++;continue;}
 const day=byDay.get(date)||{date,ids:new Set(),quantity:0};
 day.ids.add(id);
 for(const item of items){
  itemRows++;
  const qty=Number(item.quantity)||0;
  const key=groupKey(item);
  addProduct(byProduct,key,id,qty);
  addProduct(byDayProduct,[date,...key],id,qty);
  day.quantity+=qty;
 }
 byDay.set(date,day);
}
if(unmapped||unmappedDates)fail("Incomplete order item or date data: items="+unmapped+", dates="+unmappedDates+". Previous summary retained.");
const normalize=map=>[...map.values()].map(p=>({...(p.date?{date:p.date}:{}),product_no:p.product_no,name:p.name,option:p.option,orders:p.ids.size,quantity:p.quantity})).sort((a,b)=>b.quantity-a.quantity);
const products=normalize(byProduct);
const daily=[...byDay.values()].map(d=>({date:d.date,orders:d.ids.size,quantity:d.quantity})).sort((a,b)=>b.date.localeCompare(a.date));

const dailyProducts=[...byDayProduct.entries()].map(([key,p])=>{
 const [date,product_no,name,option]=JSON.parse(key);
 return {date,product_no,name,option,orders:p.ids.size,quantity:p.quantity};
}).sort((a,b)=>b.date.localeCompare(a.date)||b.quantity-a.quantity);
const summary={
 schema:2,source:"Cafe24 Admin API",updated_at:new Date().toISOString(),period,
 order_count:unique.size,tracked_order_ids_total:allOrders.size,order_item_rows:itemRows,
 total_quantity:products.reduce((sum,p)=>sum+p.quantity,0),
 products,daily,daily_products:dailyProducts,
 notes:"주문 취소·환불 조정 전 상품 수량이며 배송완료 및 송장 등록 여부를 나타내지 않습니다."
};
// Public summary deliberately excludes personal names, phone numbers,
// addresses, order numbers, tracking numbers and OAuth credentials.
await mkdir("data",{recursive:true});
if(!historyStart&&!historyEnd){
 await writeFile("data/summary.json",JSON.stringify(summary,null,2)+"\n");
}else{console.log("Historical import complete; current dashboard summary preserved");}
console.log("Published product and date aggregates:",{orders:summary.order_count,products:products.length,days:daily.length});
