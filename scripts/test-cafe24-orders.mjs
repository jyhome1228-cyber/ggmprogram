import {readFile} from "node:fs/promises";
import {createHash,createDecipheriv} from "node:crypto";

const mall=(process.env.CAFE24_MALL_ID||"ggmspa").trim();
const clientSecret=(process.env.CAFE24_CLIENT_SECRET||"").trim();
const serviceAccount=process.env.FIREBASE_SERVICE_ACCOUNT_GGMAPI;
const clientId=(process.env.CAFE24_CLIENT_ID||"").trim();
if(!clientSecret||!serviceAccount||!clientId)throw Error("Required GitHub secrets are missing");
const service=JSON.parse(serviceAccount);
const key=createHash("sha256").update(clientSecret+"|"+service.private_key).digest();
const saved=JSON.parse(await readFile("data/oauth-token.enc","utf8"));
const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(saved.iv,"base64"));
decipher.setAuthTag(Buffer.from(saved.tag,"base64"));
const token=JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data,"base64")),decipher.final()]).toString("utf8"));
if(!token.access_token)throw Error("Saved access token unavailable");
if(token.expires_at && Number(token.expires_at)<Date.now()+60000)throw Error("Saved access token expired; run Cafe24 GitHub-only Order Sync to renew token, then retry");
const activeToken=token.access_token;
const base="https://"+mall+".cafe24api.com/api/v2/admin";
const version="2025-12-01";
async function probe(label,path){
 const response=await fetch(base+path,{headers:{"Authorization":"Bearer "+activeToken,"X-Cafe24-Api-Version":version}});
 const body=await response.json().catch(()=>({}));
 console.log("API_CHECK",label,"HTTP",response.status,response.ok?"OK":"FAILED");
 return {ok:response.ok,status:response.status,body};
}
const now=new Date();
const past=new Date(now.getTime()-6*86400000);
const day=d=>d.toISOString().slice(0,10);
const params=new URLSearchParams({start_date:day(past),end_date:day(now),limit:"5",embed:"items,buyer,receivers"});
const listing=await probe("order-list","/orders?"+params);
if(!listing.ok)throw Error("Order list API failed with HTTP "+listing.status);
const orders=Array.isArray(listing.body.orders)?listing.body.orders:[];
if(!orders.length){console.log("ORDER_LOOKUP_OK=true; sampled_order_count=0");process.exit(0);}
const order=orders.find(o=>o.order_id);
if(!order)throw Error("Order entries have no order_id");
const id=String(order.order_id);
const detail=await probe("order-detail","/orders/"+encodeURIComponent(id)+"?embed=items,buyer,receivers");
const shipment=await probe("order-shipments","/orders/"+encodeURIComponent(id)+"/shipments");
const detailObj=detail.body.order||{};
const itemRows=Array.isArray(detailObj.items)?detailObj.items:Array.isArray(order.items)?order.items:[];
const recipients=Array.isArray(detailObj.receivers)?detailObj.receivers:Array.isArray(order.receivers)?order.receivers:[];
const buyer=detailObj.buyer||order.buyer||null;
const shipments=Array.isArray(shipment.body.shipments)?shipment.body.shipments:[];
console.log("CAFE24_ORDER_TEST",JSON.stringify({
 tested_at:new Date().toISOString(),
 order_listing:listing.ok,
 order_detail:detail.ok,
 shipment_lookup:shipment.ok,
 products_available:itemRows.length>0,
 buyer_available:!!buyer,
 recipient_available:recipients.length>0,
 address_field_available:recipients.some(r=>Boolean(r.address1||r.address_full)),
 shipment_records:shipments.length,
 tracking_field_available:shipments.some(r=>Boolean(r.tracking_no))
}));
console.log("Only success statuses and booleans are logged; no personal information is published.");
if(!detail.ok||!shipment.ok)process.exitCode=1;
