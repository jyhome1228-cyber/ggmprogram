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
 const p=new URLSearchParams({grant_type:grantType,...other});
 return p;
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
 const code=msg==='unauthorized'?401:msg==='forbidden'?403:500;
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
   expiresAtMs:Date.now()+Math.max(60,Number(token.expires_in||7200)-120)*1000,
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
 expiresAtMs:Date.now()+Math.max(60,Number(fresh.expires_in||7200)-120)*1000,
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
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Cafe24-Api-Version':'2026-09-01'}});
 if(!r.ok) return response(res,502,{error:'Cafe24 order read failed',upstreamStatus:r.status});
 const data=await r.json();
 // Raw order records can contain PII. Never write them to logs or a public collection.
 response(res,200,{orders:data.orders||[],pagination:{limit,offset}});
}));
