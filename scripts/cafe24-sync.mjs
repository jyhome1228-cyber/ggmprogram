import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const PROJECT="ggmapi-e15be";
const MALL=process.env.CAFE24_MALL_ID||"ggmspa";
const ID=process.env.CAFE24_CLIENT_ID;
const SECRET=process.env.CAFE24_CLIENT_SECRET;
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
let service;
try{service=JSON.parse(SA_TEXT)}catch{fail("Firebase service account is not valid JSON")}
const b64url=s=>Buffer.from(s).toString("base64url");
async function googleToken(){
 const now=Math.floor(Date.now()/1000);
 const header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const payload=b64url(JSON.stringify({iss:service.client_email,scope:"https://www.googleapis.com/auth/cloud-platform",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
 const signingInput=header+"."+payload;
 const signer=createSign("RSA-SHA256");signer.update(signingInput);signer.end();
 const assertion=signingInput+"."+signer.sign(service.private_key).toString("base64url");
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 const j=await r.json();if(!r.ok)fail("Google service account auth failed (HTTP "+r.status+"): "+JSON.stringify(j.error||"unknown"));
 return j.access_token;
}
const gt=await googleToken();
const google=async(path,method="GET",body)=>{const r=await fetch("https://secretmanager.googleapis.com/v1/"+path,{method,headers:{"Authorization":"Bearer "+gt,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));return {ok:r.ok,status:r.status,data:j}};
const secretPath="projects/"+PROJECT+"/secrets/"+SECRET_NAME;
async function getSavedToken(){
 const r=await google(secretPath+"/versions/latest:access");
 if(r.status===404)return null;
 if(!r.ok)fail("Cannot read saved OAuth token from Secret Manager (HTTP "+r.status+")");
 return JSON.parse(Buffer.from(r.data.payload.data,"base64").toString("utf8"));
}
async function saveToken(payload){
 const check=await google(secretPath);
 if(check.status===404){
  const create=await google("projects/"+PROJECT+"/secrets?secretId="+SECRET_NAME,"POST",{replication:{automatic:{}}});
  if(!create.ok)fail("Cannot initialize OAuth token vault (HTTP "+create.status+")");
 }else if(!check.ok)fail("Cannot access OAuth token vault (HTTP "+check.status+")");
 const content=Buffer.from(JSON.stringify(payload)).toString("base64");
 const out=await google(secretPath+":addVersion","POST",{payload:{data:content}});
 if(!out.ok)fail("Cannot save OAuth refresh token (HTTP "+out.status+")");
}
async function cafeToken(body){
 const authorization="Basic "+Buffer.from(ID+":"+SECRET).toString("base64");
 const r=await fetch(BASE+"/oauth/token",{method:"POST",headers:{"Authorization":authorization,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body)});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)fail("Cafe24 token exchange failed (HTTP "+r.status+"): "+String(j.error||j.error_description||"check app redirect URI and authorization"));
 if(!j.access_token||!j.refresh_token)fail("Cafe24 token response missing access or refresh token");
 return j;
}
let saved=await getSavedToken();
if(CODE){
 const fresh=await cafeToken({grant_type:"authorization_code",code:CODE,redirect_uri:REDIRECT});
 saved={access_token:fresh.access_token,refresh_token:fresh.refresh_token,expires_at:Date.now()+7200_000};
 await saveToken(saved);
 console.log("Initial Cafe24 OAuth connection established");
}
if(!saved){console.log("NOT CONNECTED: one-time Cafe24 OAuth approval is still required. No private order data was published.");process.exit(0)}
// Renew on each sync; persist rotated refresh token exclusively in Google Secret Manager.
const fresh=await cafeToken({grant_type:"refresh_token",refresh_token:saved.refresh_token});
saved={access_token:fresh.access_token,refresh_token:fresh.refresh_token,expires_at:Date.now()+7200_000};
await saveToken(saved);
const to=new Date(),from=new Date(to.getTime()-(ttl-1)*86400000);
const queryDates={start_date:dateOnly(from),end_date:dateOnly(to)};
const orders=[];let complete=false;
for(let offset=0;offset<1000;offset+=100){
 const params=new URLSearchParams({...queryDates,limit:"100",offset:String(offset),embed:"items"});
 const r=await fetch(BASE+"/admin/orders?"+params,{headers:{Authorization:"Bearer "+saved.access_token,"X-Cafe24-Api-Version":VERSION}});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)fail("Cafe24 orders GET failed (HTTP "+r.status+"): "+String(j.error?.message||j.error||"unknown"));
 const batch=Array.isArray(j.orders)?j.orders:[];
 orders.push(...batch);
 if(batch.length<100){complete=true;break}
}
if(!complete)fail("Over 1000 orders in 7 days; refusing to publish partial aggregates. Reduce date range or implement pagination.");
const grouped=new Map();
let itemRows=0,unmapped=0;
for(const order of orders){
 const orderId=String(order.order_id||"");
 const items=Array.isArray(order.items)?order.items:[];
 if(!items.length)unmapped++;
 for(const item of items){
  itemRows++;
  const name=String(item.product_name||"상품명 미확인");
  const opt=String(item.option_value||item.option_name||"");
  const key=String(item.product_no||"")+"|"+name+"|"+opt;
  const p=grouped.get(key)||{name,option:opt,product_no:String(item.product_no||""),orderIds:new Set(),quantity:0,rows:0};
  p.orderIds.add(orderId);p.quantity+=Number(item.quantity)||0;p.rows++;
  grouped.set(key,p);
 }
}
if(unmapped)fail("Cafe24 embed items missing for "+unmapped+" orders; refusing misleading totals");
const products=[...grouped.values()].map(p=>({name:p.name,option:p.option,product_no:p.product_no,orders:p.orderIds.size,quantity:p.quantity})).sort((a,b)=>b.quantity-a.quantity);
const summary={schema:1,source:"Cafe24 Admin API",updated_at:new Date().toISOString(),period:queryDates,order_count:new Set(orders.map(o=>o.order_id)).size,order_item_rows:itemRows,total_quantity:products.reduce((a,p)=>a+p.quantity,0),products};
// No names, phone numbers, addresses, order IDs, tracking codes or tokens are included.
await mkdir("data",{recursive:true});
await writeFile("data/summary.json",JSON.stringify(summary,null,2)+"\n");
console.log("Anonymized product summary written, products:",products.length,"orders:",summary.order_count);
