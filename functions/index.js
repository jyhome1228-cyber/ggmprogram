"use strict";
const crypto = require("node:crypto");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
admin.initializeApp();

const CLIENT_ID = defineSecret("CAFE24_CLIENT_ID");
const CLIENT_SECRET = defineSecret("CAFE24_CLIENT_SECRET");
const ADMIN_PASSWORD = defineSecret("GGM_ADMIN_PASSWORD");
const secrets = [CLIENT_ID, CLIENT_SECRET, ADMIN_PASSWORD];
const mall = "ggmspa";
const region = "asia-northeast3";
const redirect = "https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback";
const origin = "https://jyhome1228-cyber.github.io";
const db = () => admin.firestore();
const authDoc = () => db().collection("integration").doc("cafe24");
const oauthState = state => db().collection("oauth_states").doc(state);
const base = "https://" + mall + ".cafe24api.com/api/v2";
const version = "2026-09-01";

function cors(req,res) {
  res.set("Cache-Control","no-store");
  const caller=req.get("origin");
  if(caller===origin)res.set("Access-Control-Allow-Origin",origin);
  res.set("Vary","Origin");
  res.set("Access-Control-Allow-Methods","GET,OPTIONS");
  res.set("Access-Control-Allow-Headers","Content-Type,X-Admin-Password");
  if(req.method==="OPTIONS"){res.status(204).end();return true;}
  return false;
}
function equal(a,b) {
  if(!a||!b)return false;
  const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function allowed(req,res){
  if(!equal(req.get("x-admin-password"),ADMIN_PASSWORD.value())){
    res.status(401).json({error:"관리자 비밀번호를 확인해주세요."});return false;
  }
  return true;
}
async function tokenRequest(body){
  const basic = Buffer.from(CLIENT_ID.value()+":"+CLIENT_SECRET.value()).toString("base64");
  const response=await fetch(base+"/oauth/token",{
    method:"POST",headers:{"Authorization":"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams(body).toString()
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error("카페24 OAuth 토큰 요청 실패 ("+response.status+")");
  return result;
}
async function freshToken(){
  const snap=await authDoc().get();
  if(!snap.exists||!snap.data().refresh_token)throw Error("카페24 인증 연결이 필요합니다.");
  const data=snap.data();
  if(data.access_token && data.expires_at>Date.now()+120000)return data.access_token;
  const next=await tokenRequest({grant_type:"refresh_token",refresh_token:data.refresh_token});
  await authDoc().set({
    access_token:next.access_token,
    refresh_token:next.refresh_token||data.refresh_token,
    expires_at:Date.now()+(Number(next.expires_in)||7200)*1000,
    updated_at:admin.firestore.FieldValue.serverTimestamp()
  },{merge:true});
  return next.access_token;
}
exports.cafe24Start = onRequest({region,secrets,invoker:"public"},async(req,res)=>{
  if(cors(req,res))return;
  if(req.method!=="GET")return res.status(405).end();
  if(!allowed(req,res))return;
  const state=crypto.randomBytes(32).toString("hex");
  try{
    await oauthState(state).set({created_at:Date.now()});
    const u=new URL(base+"/oauth/authorize");
    u.searchParams.set("response_type","code");
    u.searchParams.set("client_id",CLIENT_ID.value());
    u.searchParams.set("redirect_uri",redirect);
    u.searchParams.set("state",state);
    u.searchParams.set("scope","mall.read_order mall.read_product mall.read_shipping");
    u.searchParams.set("prompt","consent");
    return res.json({url:u.toString()});
  }catch(e){console.error("OAuth begin failed",e.message);return res.status(500).json({error:"인증 준비에 실패했습니다. Firestore 설정을 확인해주세요."});}
});
exports.cafe24Callback = onRequest({region,secrets,invoker:"public"},async(req,res)=>{
  res.set("Cache-Control","no-store");
  const state=String(req.query.state||"");
  const code=String(req.query.code||"");
  if(req.method!=="GET"||!/^[0-9a-f]{64}$/.test(state)||!code)return res.status(400).send("잘못된 인증 요청입니다.");
  const ref=oauthState(state);
  try{
    const valid=await db().runTransaction(async tx=>{
      const doc=await tx.get(ref);
      if(!doc.exists||Date.now()-doc.data().created_at>5*60*1000)return false;
      tx.delete(ref);
      return true;
    });
    if(!valid)return res.status(403).send("인증 요청이 만료되었습니다. 관리자 화면에서 다시 연결해주세요.");
    const token=await tokenRequest({grant_type:"authorization_code",code,redirect_uri:redirect});
    await authDoc().set({
      access_token:token.access_token,refresh_token:token.refresh_token,
      expires_at:Date.now()+(Number(token.expires_in)||7200)*1000,
      updated_at:admin.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    res.status(200).set("Content-Type","text/html; charset=utf-8").send('<!doctype html><meta charset="utf-8"><title>연동 완료</title><div style="font:16px sans-serif;padding:50px;text-align:center"><h2>카페24 연결이 완료되었습니다.</h2><p>관리자 화면으로 돌아가 새로고침해주세요.</p><a href="https://jyhome1228-cyber.github.io/ggmprogram/live.html">관리 화면 열기</a></div>');
  }catch(e){console.error("OAuth callback failed",e.message);res.status(500).send("인증 처리에 실패했습니다. Firebase 함수 로그를 확인해주세요.");}
});
exports.cafe24Orders = onRequest({region,secrets,invoker:"public",timeoutSeconds:120,memory:"512MiB"},async(req,res)=>{
  if(cors(req,res))return;
  if(req.method!=="GET")return res.status(405).end();
  if(!allowed(req,res))return;
  const from=String(req.query.from||""),to=String(req.query.to||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||
    (Date.parse(to)-Date.parse(from))/86400000>30)return res.status(400).json({error:"조회 기간은 최대 31일입니다."});
  try{
    const token=await freshToken();
    const orders=[];let complete=false;
    for(let offset=0;offset<1000;offset+=100){
      const q=new URLSearchParams({start_date:from,end_date:to,limit:"100",offset:String(offset),embed:"items,buyer,receivers"});
      const response=await fetch(base+"/admin/orders?"+q,{
        headers:{Authorization:"Bearer "+token,"X-Cafe24-Api-Version":version}
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok){console.error("Orders API error",response.status,JSON.stringify(result).slice(0,300));throw Error("카페24 주문 조회 실패 ("+response.status+")");}
      const batch=Array.isArray(result.orders)?result.orders:[];
      orders.push(...batch);
      if(batch.length<100){complete=true;break;}
    }
    return res.status(200).json({orders,count:orders.length,complete,as_of:new Date().toISOString()});
  }catch(e){console.error("Order fetch failed",e.message);return res.status(502).json({error:e.message});}
});
exports.cafe24Health = onRequest({region,secrets,invoker:"public"},async(req,res)=>{
  if(cors(req,res))return;
  if(req.method!=="GET")return res.status(405).end();
  if(!allowed(req,res))return;
  try{const doc=await authDoc().get();res.json({connected:doc.exists&&Boolean(doc.data()?.refresh_token),mall});}
  catch(e){res.status(503).json({error:"Firestore 연결을 확인해주세요."});}
});
