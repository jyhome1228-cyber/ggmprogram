'use strict';
// GGM Shipping / Cafe24 OAuth backend. NEVER expose secrets in frontend code.
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('node:crypto');
admin.initializeApp();
const db = admin.firestore();
const cafeId = defineSecret('CAFE24_CLIENT_ID');
const cafeSecret = defineSecret('CAFE24_CLIENT_SECRET');
const mall = defineString('CAFE24_MALL_ID');
const allowedUid = defineString('GGM_ADMIN_UID');
const region = 'asia-northeast3';
const scope = 'mall.read_order';
const secrets = [cafeId,cafeSecret];
const response = (res,code,obj) => {res.status(code).set('Cache-Control','no-store').json(obj);};
const origin = 'https://jyhome1228-cyber.github.io';
async function verifyAdmin(req) {
 const token = /^Bearer (.+)$/.exec(req.get('authorization')||'')?.[1];
 if(!token) throw Error('unauthorized');
 const u = await admin.auth().verifyIdToken(token,true);
 if(u.uid !== allowedUid.value()) throw Error('forbidden');
 return u;
}
function shopHost(){
 const id=mall.value();
 if(!/^[a-z0-9][a-z0-9_-]{1,39}$/i.test(id))throw Error('Invalid mall id');
 return 'https://'+id+'.cafe24api.com';
}
function redirectUrl(req){ // Stable URL for registering in Cafe24 Developers
 return 'https://'+region+'-'+process.env.GCLOUD_PROJECT+'.cloudfunctions.net/cafe24Callback';
}
function authForm(grantType,other={}){
 return new URLSearchParams({grant_type:grantType,...other});
}
function accessTokenExpiry(token){
 // Cafe24 supplies expires_at (ISO 8601), not necessarily expires_in.
 const ms=Date.parse(String(token.expires_at||''));
 return Number.isFinite(ms) ? ms-120000 : Date.now()+Math.max(60,Number(token.expires_in||7200)-120)*1000;
}
async function tokenRequest(form){
 const basic=Buffer.from(cafeId.value()+':'+cafeSecret.value()).toString('base64');
 const r=await fetch(shopHost()+'/api/v2/oauth/token',{method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},body:form});
 if(!r.ok)throw Error('Cafe24 token exchange error '+r.status);
 return r.json();
}
const withError = handler => async (req,res) => {
 try{await handler(req,res)}catch(e){
 const msg=String(e.message||e);
 const code=msg==='unauthorized'?401:msg==='forbidden'?403:msg==='Cafe24 is not connected'?409:500;
 console.error('GGM API error:',msg.replace(/(token|secret)=[^& ]+/gi,'$1=[redacted]'));
 response(res,code,{error:code===500?'Server request failed':msg});
 }
};
const preflight=(req,res)=>{
 res.set('Access-Control-Allow-Origin',origin);
 res.set('Vary','Origin');
 res.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 res.set('Access-Control-Allow-Methods','GET, OPTIONS');
 if(req.method==='OPTIONS'){res.status(204).send('');return true;}
 return false;
};
exports.cafe24Connect = onRequest({region,secrets,invoker:'public'},withError(async(req,res)=>{
 if(preflight(req,res))return;
 if(req.method!=='GET')return response(res,405,{error:'method not allowed'});
 await verifyAdmin(req);
 const state=crypto.randomBytes(24).toString('hex');
 await db.doc('oauthPending/'+state).set({createdAt:admin.firestore.FieldValue.serverTimestamp(),expiresAt:Date.now()+5*60*1000});
 const url=new URL(shopHost()+'/api/v2/oauth/authorize');
 url.searchParams.set('response_type','code');
 url.searchParams.set('client_id',cafeId.value());
 url.searchParams.set('state',state);
 url.searchParams.set('redirect_uri',redirectUrl(req));
 url.searchParams.set('scope',scope);
 response(res,200,{authorizationUrl:url.toString()});
}));
exports.cafe24Callback = onRequest({region,secrets,invoker:'public'},withError(async(req,res)=>{
 if(req.method!=='GET')return response(res,405,{error:'method not allowed'});
 const state=String(req.query.state||'');
 const code=String(req.query.code||'');
 if(!/^[0-9a-f]{48}$/.test(state)||!code)return response(res,400,{error:'Invalid authorization response'});
 const ref=db.doc('oauthPending/'+state);
 const used=await db.runTransaction(async t=>{
   const doc=await t.get(ref);
   if(!doc.exists || doc.data().expiresAt<Date.now())return false;
   t.delete(ref);return true;
 });
 if(!used)return response(res,403,{error:'Expired or invalid OAuth state'});
 const token=await tokenRequest(authForm('authorization_code',{code,redirect_uri:redirectUrl(req)}));
 if(!token.access_token||!token.refresh_token)throw Error('Missing OAuth tokens');
 await db.doc('privateIntegrations/cafe24').set({
   access_token:token.access_token,refresh_token:token.refresh_token,
   expires_at:token.expires_at||null,
   expiresAtMs:accessTokenExpiry(token),
   refreshedAt:admin.firestore.FieldValue.serverTimestamp(),
 },{merge:true});
 res.status(200).set('Cache-Control','no-store').type('html').send('<!doctype html><meta charset="utf-8"><title>연결 성공</title><p>카페24 연결이 완료되었습니다. 이 창을 닫고 배송관리 화면으로 돌아가세요.</p>');
}));
async function accessToken(){
 const ref=db.doc('privateIntegrations/cafe24');
 let current=(await ref.get()).data();
 if(!current?.refresh_token)throw Error('Cafe24 is not connected');
 if(current.access_token && (current.expiresAtMs||0)>Date.now())return current.access_token;
 const fresh=await tokenRequest(authForm('refresh_token',{refresh_token:current.refresh_token}));
 if(!fresh.access_token||!fresh.refresh_token)throw Error('Token refresh failed');
 await ref.set({access_token:fresh.access_token,refresh_token:fresh.refresh_token,
 expires_at:fresh.expires_at||null,
 expiresAtMs:accessTokenExpiry(fresh),
 refreshedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 return fresh.access_token;
}
exports.cafe24Orders = onRequest({region,secrets,invoker:'public'},withError(async(req,res)=>{
 if(preflight(req,res))return;
 if(req.method!=='GET')return response(res,405,{error:'method not allowed'});
 await verifyAdmin(req);
 const token=await accessToken();
 const offset=Math.min(10000,Math.max(0,Number(req.query.offset)||0));
 const limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));
 const url=new URL(shopHost()+'/api/v2/admin/orders');
 url.searchParams.set('limit',String(limit));url.searchParams.set('offset',String(offset));
 const start=String(req.query.start_date||'');
 const end=String(req.query.end_date||'');
 if(start||end){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))
     return response(res,400,{error:'Invalid date range'});
   const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
   if(!Number.isFinite(days)||days<0||days>89) return response(res,400,{error:'Date range must be 0-89 days'});
   url.searchParams.set('start_date',start); url.searchParams.set('end_date',end);
   url.searchParams.set('date_type','order_date');
 }
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
 if(!r.ok) return response(res,502,{error:'Cafe24 order read failed',upstreamStatus:r.status});
 const data=await r.json();
 // Raw order records can contain PII. Never write them to logs or a public collection.
 response(res,200,{orders:(data.orders||[]).map(o=>({
  order_id:o.order_id,order_date:o.order_date,order_status:o.order_status,
  shipping_status:o.shipping_status,shipped_date:o.shipped_date
})),pagination:{limit,offset}});
}));

/** Fetch shipping records for one order; supports partial shipments. Read-only. */
exports.cafe24Shipments = onRequest({region,secrets,invoker:'public'},withError(async(req,res)=>{
 if(preflight(req,res))return;
 if(req.method!=='GET')return response(res,405,{error:'method not allowed'});
 await verifyAdmin(req);
 const orderId=String(req.query.orderId||'');
 if(!/^[0-9]{8}-[0-9]{7,12}$/.test(orderId))return response(res,400,{error:'Invalid order ID'});
 const token=await accessToken();
 const r=await fetch(shopHost()+'/api/v2/admin/orders/'+encodeURIComponent(orderId)+'/shipments?shop_no=1',{headers:{Authorization:'Bearer '+token}});
 if(!r.ok)return response(res,502,{error:'Cafe24 shipment read failed',upstreamStatus:r.status});
 const data=await r.json();
 response(res,200,{orderId,shipments:(data.shipments||[]).map(x=>({
    shipping_code:x.shipping_code,status:x.status,tracking_no:x.tracking_no,
    shipping_company_code:x.shipping_company_code,items:x.items||[]
 }))});
}));
/** Non-sensitive connection diagnostics; admin only. */
exports.cafe24Status = onRequest({region,secrets:[],invoker:'public'},withError(async(req,res)=>{
 if(preflight(req,res))return;
 if(req.method!=='GET')return response(res,405,{error:'method not allowed'});
 await verifyAdmin(req);
 const snap=await db.doc('privateIntegrations/cafe24').get();
 response(res,200,{connected:snap.exists && Boolean(snap.get('refresh_token')),mallConfigured:Boolean(mall.value()),service:'ggmapi-e15be',scopes:['mall.read_order']});
}));

/**
 * Shipping completeness check for a small, explicitly selected set of order IDs.
 * Missing tracking is a REVIEW FLAG, never proof that a parcel was not dispatched.
 * Returns no buyer names, addresses, phone numbers or payment data.
 */
exports.cafe24Audit = onRequest({region,secrets,invoker:'public',timeoutSeconds:120},withError(async(req,res)=>{
 if(preflight(req,res))return;
 if(req.method!=='GET')return response(res,405,{error:'method not allowed'});
 await verifyAdmin(req);
 const ids=String(req.query.orderIds||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(ids.length<1||ids.length>15||ids.some(x=>!/^\d{8}-\d{7,12}$/.test(x)))
   return response(res,400,{error:'Provide 1 to 15 valid order IDs'});
 const token=await accessToken();
 const results=[];
 for(const orderId of ids){
   const url=shopHost()+'/api/v2/admin/orders/'+encodeURIComponent(orderId)+'/shipments?shop_no=1';
   try{
     const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});
     if(!r.ok){results.push({orderId,check:'조회 실패',httpStatus:r.status});continue;}
     const payload=await r.json();
     const shipments=Array.isArray(payload.shipments)?payload.shipments:[];
     const withTracking=shipments.filter(sh=>String(sh.tracking_no||'').trim());
     results.push({orderId,check:shipments.length===0?'송장 등록 확인 필요':withTracking.length<shipments.length?'일부 송장 미등록':'등록 확인',
       shipmentCount:shipments.length,trackingCount:withTracking.length,
       shipmentStatuses:shipments.map(sh=>sh.status)});
   }catch(err){results.push({orderId,check:'조회 실패'});}
 }
 response(res,200,{results,notice:'송장 미등록은 미출고 확정이 아닙니다. 결제/취소/합배송 및 실제 택배 접수 여부를 함께 확인하세요.'});
}));

// Public, data-free health check for diagnostics; never returns keys or customer information.
exports.ggmHealth = onRequest({region,invoker:'public'},(req,res)=>{
 if(req.method!=='GET')return response(res,405,{error:'Method not allowed'});
 res.set('Access-Control-Allow-Origin',origin);
 response(res,200,{ok:true,service:'ggm-shipping-api'});
});
