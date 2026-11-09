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
async function get(path){
 const response=await fetch(base+path,{headers:{"Authorization":"Bearer "+activeToken,"X-Cafe24-Api-Version":version}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok){
  const issue=String(body.error?.code||body.error||response.status);
  throw Error("Cafe24 API "+path.split("?")[0].replace(/orders\/[^/]+/,"orders/{order}")+" rejected: "+issue+" (HTTP "+response.status+")");
 }
 return body;
}
const now=new Date();
const past=new Date(now.getTime()-6*86400000);
const day=d=>d.toISOString().slice(0,10);
const params=new URLSearchParams({start_date:day(past),end_date:day(now),limit:"5",embed:"items,buyer,receivers"});
const list=await get("/orders?"+params);
const orders=Array.isArray(list.orders)?list.orders:[];
if(!orders.length){console.log("ORDER_LOOKUP_OK=true; orders_found=0 in seven-day sample; choose earlier date for further testing.");process.exit(0);}
const order=orders.find(o=>o.order_id);
if(!order)throw Error("Orders endpoint returned entries without order_id");
const id=String(order.order_id);
const detail=await get("/orders/"+encodeURIComponent(id)+"?embed=items,buyer,receivers");
const item=detail.order||{};
const embeddedItems=Array.isArray(item.items)?item.items:Array.isArray(order.items)?order.items:[];
const receivers=Array.isArray(item.receivers)?item.receivers:Array.isArray(order.receivers)?order.receivers:[];
const buyer=item.buyer||order.buyer||null;
const shipping=await get("/orders/"+encodeURIComponent(id)+"/shipments");
const shipments=Array.isArray(shipping.shipments)?shipping.shipments:[];
const result={
  test:"cafe24-real-order-read",
  checked_at:new Date().toISOString(),
  order_lookup:true,
  order_detail:true,
  products_visible:embeddedItems.length>0,
  buyer_visible:!!buyer,
  receiver_visible:receivers.length>0,
  receiver_address_field_present:receivers.some(r=>Boolean(r.address1||r.address_full)),
  shipment_endpoint:true,
  shipment_records:shipments.length,
  has_tracking_number:shipments.some(x=>Boolean(x.tracking_no)),
  sample_order_id_redacted:id.replace(/.(?=.{4})/g,"*")
};
console.log("CAFE24_ORDER_TEST:",JSON.stringify(result,null,2));
console.log("No customer names, phone numbers, addresses, full order IDs or tracking numbers were logged.");
