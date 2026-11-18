import { handleShared, valid as sharedValid, secretsReady as sharedReady, reply as sharedReply } from './shared-auth.js';
// GGM OPS — Cafe24 read-only Worker
// Protected at the edge by Cloudflare Access (ALL traffic).
const MALL_ID = 'ggmspa';
const ORIGIN = 'https://ggm-ops.planus253.workers.dev';
const REDIRECT_URI = ORIGIN + '/oauth/callback';
const API_VERSION = '2026-09-01';
const TOKEN_KEY = 'cafe24:oauth:token';
const STATE_PREFIX = 'cafe24:oauth:state:';
const BASE = 'https://' + MALL_ID + '.cafe24api.com';
const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
};

function respond(data, status = 200) {
  return Response.json(data, { status, headers: HEADERS });
}
function redirect(path, extra = {}) {
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: path, ...extra } });
}
function validEnv(env) {
  return Boolean(env.CAFE24_CLIENT_ID && env.CAFE24_CLIENT_SECRET && env.GGM_AUTH);
}
function secureRandom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
}
async function oauthToken(env, fields) {
  const auth = btoa(env.CAFE24_CLIENT_ID + ':' + env.CAFE24_CLIENT_SECRET);
  const res = await fetch(BASE + '/api/v2/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields)
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.access_token || !result.refresh_token) {
    throw new Error('카페24 인증 토큰 발급에 실패했습니다 (HTTP ' + res.status + ')');
  }
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    access_expires_at: Date.parse(result.expires_at) || Date.now() + (Number(result.expires_in) || 7200) * 1000,
    refresh_expires_at: Date.parse(result.refresh_token_expires_at) || Date.now() + 13 * 86400000
  };
}
async function currentToken(env) {
  const saved = await env.GGM_AUTH.get(TOKEN_KEY, 'json');
  if (!saved?.access_token) throw new Error('카페24 연결이 필요합니다.');
  if (Date.now() < Number(saved.access_expires_at) - 300000) return saved.access_token;
  if (!saved.refresh_token || Date.now() > Number(saved.refresh_expires_at)) {
    throw new Error('카페24 인증이 만료됐습니다. 다시 연결해주세요.');
  }
  // Single-admin MVP. Serial token refresh must be hardened before scheduled/multi-user use.
  const next = await oauthToken(env, { grant_type: 'refresh_token', refresh_token: saved.refresh_token });
  await env.GGM_AUTH.put(TOKEN_KEY, JSON.stringify(next));
  return next.access_token;
}
function kstDay(ms) {
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}
function safeInt(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
function amount(value) {
  if (value && typeof value === 'object') return value.payment_amount ?? value.order_price_amount ?? value.total ?? null;
  return value ?? null;
}
async function orders(url, env) {
  const days = safeInt(url.searchParams.get('days'), 30, 1, 30);
  const startParam = url.searchParams.get('start_date');
  const endParam = url.searchParams.get('end_date');
  let startDate = kstDay(Date.now() - (days - 1) * 86400000);
  let endDate = kstDay(Date.now());
  if (startParam !== null || endParam !== null) {
    if (!startParam || !endParam || !/^\d{4}-\d{2}-\d{2}$/.test(startParam) || !/^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
      return respond({ error: '날짜는 시작일과 종료일을 함께 입력해주세요.' }, 400);
    }
    const start = Date.parse(startParam + 'T00:00:00Z');
    const end = Date.parse(endParam + 'T00:00:00Z');
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
      new Date(start).toISOString().slice(0,10) !== startParam ||
      new Date(end).toISOString().slice(0,10) !== endParam ||
      start > end || end - start > 29 * 86400000 ||
      endParam > kstDay(Date.now()) || start < Date.now() - 366 * 86400000) {
      return respond({ error: '조회 기간은 최근 1년 이내에서 최대 30일로 선택해주세요.' }, 400);
    }
    startDate = startParam;
    endDate = endParam;
  }
  const limit = safeInt(url.searchParams.get('limit'), 50, 1, 100);
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 8000);
  const token = await currentToken(env);
  const query = new URL(BASE + '/api/v2/admin/orders');
  query.searchParams.set('start_date', startDate);
  query.searchParams.set('end_date', endDate);
  query.searchParams.set('limit', String(limit));
  query.searchParams.set('offset', String(offset));
  // Cafe24 removed buyer_name from the plain orders response. Embed the buyer resource.
  query.searchParams.set('embed', 'buyer');
  const countQuery = new URL(BASE + '/api/v2/admin/orders/count');
  countQuery.searchParams.set('start_date', query.searchParams.get('start_date'));
  countQuery.searchParams.set('end_date', query.searchParams.get('end_date'));
  const authHeaders = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'X-Cafe24-Api-Version': API_VERSION
  };
  const countPromise = fetch(countQuery, { headers: authHeaders })
    .then(async response => {
      if (!response.ok) return null;
      const data = await response.json();
      const total = Number(data.count ?? data.orders?.count);
      return Number.isInteger(total) && total >= 0 ? total : null;
    }).catch(() => null);
  const api = await fetch(query, {
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': API_VERSION
    }
  });
  if (!api.ok) return respond({ error: api.status === 401 ? '카페24 인증이 만료되어 재연결이 필요합니다.' : '카페24 주문 조회 실패', http_status: api.status, authorization_required: api.status === 401 }, api.status === 401 ? 401 : 502);
  const payload = await api.json();
  const list = Array.isArray(payload.orders) ? payload.orders : [];
  return respond({
    mall_id: MALL_ID, days, start_date: startDate, end_date: endDate, limit, offset, count: list.length, has_more: list.length === limit,
    total_count: await countPromise,
    orders: list.map(o => ({
      order_id: o.order_id || '',
      buyer_name: (() => {
        const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer;
        const name = buyer && typeof buyer === 'object' ? buyer.name : null;
        // Do not substitute billing name, member ID or receiver name: they are distinct people.
        return typeof name === 'string' && name.trim() ? name.trim() : null;
      })(),
      order_date: o.order_date || '',
      order_status: o.order_status || null,
      shipping_status: o.shipping_status ?? null,
      payment_status: o.paid ?? o.payment_status ?? '',
      payment_method: Array.isArray(o.payment_method) ? o.payment_method : o.payment_method ? [o.payment_method] : o.first_payment_method ? [o.first_payment_method] : [],
      payment_method_name: Array.isArray(o.payment_method_name) ? o.payment_method_name : o.payment_method_name ? [o.payment_method_name] : [],
      billing_name: o.billing_name ?? null,
      canceled: o.canceled ?? null,
      payment_date: o.payment_date ?? null,
      currency: o.currency || 'KRW',
      amount: amount(o.actual_order_amount)
    }))
  });
}

function isCanceled(o) {
  // Cafe24 canceled is typically T/F; never infer cancellation from a zero amount.
  return String(o.canceled || '').toUpperCase() === 'T' || /^C[0-9]{2}$/.test(String(o.order_status || ''));
}
function shippingReview(o, shipments, failed, hours) {
  const tracking = shipments.some(p => typeof p.tracking_no === 'string' && p.tracking_no.trim());
  const status = String(o.shipping_status || '');
  const ageMs = Date.now() - Date.parse(o.order_date || '');
  const late = Number.isFinite(ageMs) && ageMs >= hours * 3600000;
  const canceled = isCanceled(o);
  if (failed) return { level: 'unknown', label: '배송정보 확인 불가', detail: '카페24 송장 조회 요청 실패' };
  if (canceled && tracking) return { level: 'review', label: '취소·송장 동시 존재', detail: '실제 출고 여부 및 취소 시점 확인 필요' };
  if (canceled) return { level: 'excluded', label: '취소 관련', detail: '누락 의심 산정 제외' };
  if (o.paid !== 'T') return { level: 'excluded', label: '결제 미완료/미확인', detail: '누락 의심 산정 제외' };
  if (status === 'T' || status === 'M' || shipments.some(p => ['shipping','shipped'].includes(p.status))) {
    if (!tracking) return { level: 'review', label: '배송중·완료 / 송장 미확인', detail: '카페24 배송 상태와 송장 입력 여부 대조' };
    return { level: 'ok', label: '배송 진행 확인', detail: '송장 존재' };
  }
  if (status === 'F' && !tracking && late) return { level: 'review', label: '장기 배송전 · 송장 없음', detail: '결제완료 후 ' + hours + '시간 이상 경과 (휴무일 미반영)' };
  if (status === 'F' && !tracking) return { level: 'watch', label: '배송전', detail: '송장 미등록 · 기준 시간 미경과' };
  if (status === 'W') return { level: 'watch', label: '배송보류', detail: '보류 사유 확인 필요' };
  if (status === 'X') return { level: 'watch', label: '발주전', detail: '카페24 발주상태 확인' };
  return { level: 'unknown', label: '판정 보류', detail: '주문 배송상태가 제공되지 않음 · 추정하지 않음' };
}
async function shippingReviewOrders(url, env) {
  const days = safeInt(url.searchParams.get('days'), 7, 1, 30);
  const limit = safeInt(url.searchParams.get('limit'), 8, 1, 8);
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 8000);
  const hours = safeInt(url.searchParams.get('hours'), 24, 1, 168);
  const token = await currentToken(env);
  const headers = { Authorization: 'Bearer ' + token, 'X-Cafe24-Api-Version': API_VERSION };
  const query = new URL(BASE + '/api/v2/admin/orders');
  query.searchParams.set('start_date', kstDay(Date.now() - days * 86400000));
  query.searchParams.set('end_date', kstDay(Date.now()));
  query.searchParams.set('limit', String(limit));
  query.searchParams.set('offset', String(offset));
  query.searchParams.set('embed', 'buyer');
  const res = await fetch(query, { headers });
  if (!res.ok) return respond({ error: '카페24 주문 조회 실패', http_status: res.status }, 502);
  const result = await res.json();
  const orders = Array.isArray(result.orders) ? result.orders : [];
  // Limit each review to 8 orders and a maximum of two concurrent shipment calls.
  const reviewed = [];
  for (let i = 0; i < orders.length; i += 2) {
    const chunk = await Promise.all(orders.slice(i, i + 2).map(async o => {
      let shipments = [], failed = false;
      try {
        const shipRes = await fetch(BASE + '/api/v2/admin/orders/' + encodeURIComponent(o.order_id) + '/shipments', { headers });
        if (!shipRes.ok) failed = true;
        else {
          const data = await shipRes.json();
          shipments = Array.isArray(data.shipments) ? data.shipments.map(p => ({
            tracking_no: p.tracking_no ?? null,
            status: p.status ?? null,
            shipping_company_code: p.shipping_company_code ?? null,
            shipping_code: p.shipping_code ?? null
          })) : [];
        }
      } catch { failed = true; }
      const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer;
      return {
        order_id: o.order_id,
        buyer_name: typeof buyer?.name === 'string' ? buyer.name : null,
        order_date: o.order_date,
        paid: o.paid ?? null,
        shipping_status: o.shipping_status ?? null,
        canceled: o.canceled ?? null,
        shipments,
        assessment: shippingReview(o, shipments, failed, hours)
      };
    }));
    reviewed.push(...chunk);
  }
  return respond({
    days, hours, offset, limit, count: reviewed.length,
    has_more: reviewed.length === limit,
    checked_at: new Date().toISOString(),
    // Not an aggregate of all orders in the selected period.
    summary: {
      review: reviewed.filter(x => x.assessment.level === 'review').length,
      watch: reviewed.filter(x => x.assessment.level === 'watch').length,
      unknown: reviewed.filter(x => x.assessment.level === 'unknown').length
    },
    orders: reviewed
  });
}


function normalizeOrderItems(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  return list.map(item => {
    const opt = Array.isArray(item.options) ? item.options : [];
    function optionLabel(value) {
      if (typeof value === 'string') return value.trim();
      if (Array.isArray(value)) return value.map(optionLabel).filter(Boolean).join(', ');
      if (!value || typeof value !== 'object') return '';
      const nested = value.option_value;
      const label = optionLabel(value.option_text ?? (nested?.option_text ?? nested));
      return label ? [value.option_name, label].filter(Boolean).join(': ') : '';
    }
    return {
      product_no: item.product_no == null ? null : String(item.product_no),
      product_name: String(item.product_name || item.supplier_product_name || '상품명 미제공'),
      option_label: optionLabel(opt).slice(0, 240),
      quantity: Math.max(0, Number(item.quantity) || 0),
      order_item_code: item.order_item_code || null,
      order_status: item.order_status || null
    };
  });
}
async function exploreOrders(url, env) {
  const days = safeInt(url.searchParams.get('days'), 30, 1, 30);
  const startParam = url.searchParams.get('start_date');
  const endParam = url.searchParams.get('end_date');
  const today = kstDay(Date.now());
  let startDate = kstDay(Date.now() - (days - 1) * 86400000);
  let endDate = today;
  if (startParam !== null || endParam !== null) {
    if (!startParam || !endParam || !/^\d{4}-\d{2}-\d{2}$/.test(startParam) || !/^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
      return respond({ error: '시작일과 종료일을 YYYY-MM-DD 형식으로 입력해주세요.' }, 400);
    }
    const startMs = Date.parse(startParam + 'T00:00:00Z');
    const endMs = Date.parse(endParam + 'T00:00:00Z');
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) ||
        new Date(startMs).toISOString().slice(0, 10) !== startParam ||
        new Date(endMs).toISOString().slice(0, 10) !== endParam ||
        startMs > endMs || (endMs - startMs) / 86400000 > 29 ||
        endParam > today || startMs < Date.now() - 366 * 86400000) {
      return respond({ error: '조회기간은 과거 1년 이내, 최대 30일이며 종료일은 오늘을 넘을 수 없습니다.' }, 400);
    }
    startDate = startParam;
    endDate = endParam;
  }
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 5000);
  const limit = safeInt(url.searchParams.get('limit'), 50, 1, 50);
  const token = await currentToken(env);
  const query = new URL(BASE + '/api/v2/admin/orders');
  query.searchParams.set('start_date', startDate);
  query.searchParams.set('end_date', endDate);
  query.searchParams.set('offset', String(offset));
  query.searchParams.set('limit', String(limit));
  query.searchParams.set('embed', 'buyer,items');
  const response = await fetch(query, {
    headers: { Authorization: 'Bearer ' + token, 'X-Cafe24-Api-Version': API_VERSION }
  });
  if (!response.ok) {
    return respond({ error: '주문자·제품 조회 실패', http_status: response.status }, 502);
  }
  const payload = await response.json();
  const list = Array.isArray(payload.orders) ? payload.orders : [];
  const mapped = list.map(o => {
    const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer;
    const items = normalizeOrderItems(o.items);
    return {
      order_id: o.order_id || '',
      buyer_name: typeof buyer?.name === 'string' ? buyer.name.trim() : null,
      order_date: o.order_date || '',
      payment_status: o.paid ?? o.payment_status ?? null,
      shipping_status: o.shipping_status ?? null,
      canceled: o.canceled ?? null,
      amount: amount(o.actual_order_amount),
      items,
      items_embedded: o.items !== undefined && o.items !== null
    };
  });
  return respond({
    days, start_date: startDate, end_date: endDate, limit, offset, count: mapped.length,
    has_more: mapped.length === limit,
    items_unavailable: mapped.some(x => !x.items_embedded),
    checked_at: new Date().toISOString(),
    orders: mapped
  });
}


async function catalogProducts(url, env) {
  const limit = safeInt(url.searchParams.get('limit'), 50, 1, 100);
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 5000);
  const token = await currentToken(env);
  const query = new URL(BASE + '/api/v2/admin/products');
  query.searchParams.set('limit', String(limit));
  query.searchParams.set('offset', String(offset));
  query.searchParams.set('fields', 'product_no,product_code,product_name,price,display,selling');
  const response = await fetch(query, {
    headers: { Authorization: 'Bearer ' + token, 'X-Cafe24-Api-Version': API_VERSION }
  });
  if (response.status === 401 || response.status === 403) {
    return respond({
      error: '상품 조회 권한이 없습니다. 카페24 앱의 상품 읽기 권한을 확인한 후 GGM OPS의 카페24 재연결을 진행해주세요.',
      http_status: response.status,
      authorization_required: true
    }, 403);
  }
  if (!response.ok) return respond({ error: '카페24 상품목록 조회에 실패했습니다.', http_status: response.status }, 502);
  const data = await response.json();
  const list = Array.isArray(data.products) ? data.products : [];
  return respond({
    limit, offset, count: list.length, has_more: list.length === limit,
    products: list.map(p => ({
      product_no: p.product_no == null ? null : String(p.product_no),
      product_name: typeof p.product_name === 'string' ? p.product_name.replace(/<[^>]*>/g, '').trim() : '상품명 미제공',
      product_code: p.product_code || '',
      price: p.price == null ? null : String(p.price),
      display: p.display ?? null,
      selling: p.selling ?? null
    }))
  });
}


async function shipmentBackupBatch(url, env) {
  const start = url.searchParams.get('start_date') || '';
  const end = url.searchParams.get('end_date') || '';
  const startMs = Date.parse(start + 'T00:00:00Z');
  const endMs = Date.parse(end + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)
    || !Number.isFinite(startMs) || !Number.isFinite(endMs)
    || new Date(startMs).toISOString().slice(0,10) !== start
    || new Date(endMs).toISOString().slice(0,10) !== end
    || start > end || endMs-startMs > 29*86400000 || end > kstDay(Date.now())
    || start < '2010-01-01') {
    return respond({ error:'백업용 날짜 구간은 2010년 이후, 최대 30일로 나눠 요청해주세요.' },400);
  }
  const limit = safeInt(url.searchParams.get('limit'), 8, 1, 8);
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 5000);
  const token = await currentToken(env);
  const headers = {Authorization:'Bearer '+token,'X-Cafe24-Api-Version':API_VERSION};
  const q = new URL(BASE+'/api/v2/admin/orders');
  for (const [k,v] of [['start_date',start],['end_date',end],['offset',offset],['limit',limit],['embed','buyer,receivers']])q.searchParams.set(k,String(v));
  const ordersResp=await fetch(q,{headers});
  if(!ordersResp.ok)return respond({error:'카페24 백업 주문 목록 요청 실패',http_status:ordersResp.status},502);
  const data=await ordersResp.json();
  const orders=Array.isArray(data.orders)?data.orders:[];
  const mapped=[];
  // Bounded workload. Two shipments requests in parallel per step.
  for(let n=0;n<orders.length;n+=2){
    const chunk=await Promise.all(orders.slice(n,n+2).map(async o=>{
      const b=Array.isArray(o.buyer)?o.buyer[0]:o.buyer;
      const receivers=Array.isArray(o.receivers)?o.receivers:(o.receivers?[o.receivers]:[]);
      let shipping=[],shipping_error=null;
      try {
        const res=await fetch(BASE+'/api/v2/admin/orders/'+encodeURIComponent(o.order_id)+'/shipments',{headers});
        if(!res.ok)shipping_error='배송 API '+res.status;
        else {
          const result=await res.json();
          shipping=Array.isArray(result.shipments)?result.shipments.map(p=>({
            shipping_code:p.shipping_code||null,
            tracking_no:p.tracking_no||null,
            tracking_no_updated_date:p.tracking_no_updated_date||null,
            shipping_company_code:p.shipping_company_code||null,
            shipping_company_name:p.shipping_company_name||null,
            status:p.status||null,
            order_item_codes:Array.isArray(p.items)?p.items.map(i=>i.order_item_code).filter(Boolean):[]
          })):[];
        }
      }catch{shipping_error='배송 API 통신 실패'}
      return {
        order_id:o.order_id||'',
        order_date:o.order_date||'',
        buyer_name:typeof b?.name==='string'?b.name:null,
        payment_status:o.paid??null,
        shipping_status:o.shipping_status??null,
        canceled:o.canceled??null,
        receivers:receivers.map(v=>({
          name:v.name||null,
          cellphone:v.cellphone||v.phone||null,
          zipcode:v.zipcode||null,
          address1:v.address1||null,
          address2:v.address2||null
        })),
        shipments:shipping,shipping_error
      };
    }));
    mapped.push(...chunk);
  }
  return respond({start_date:start,end_date:end,offset,limit,count:mapped.length,has_more:mapped.length===limit,orders:mapped,checked_at:new Date().toISOString()});
}

export default {
  async fetch(request, env) {
    // IMPORTANT: Cloudflare Access must protect every public Worker route.
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return respond({ error: '잘못된 호스트' }, 400);
    const path = url.pathname;
    const shared = env.GGM_AUTH_MODE === 'shared';
    try {
      // This is a staged login system. Cloudflare Access remains active during QA.
      if (path === '/auth/mode') return sharedReply({mode:shared?'shared':'access',ready:!shared||sharedReady(env)});
      if (shared && path === '/auth/shared/open') {
        // Single native form submit: return dashboard HTML with the session cookie.
        // No client-side redirect or second navigation necessary.
        let auth;
        try{auth = await handleShared(request,env,path)}
        catch{return sharedReply({error:'로그인 처리 중 예외가 발생했습니다.',code:'AUTH_HANDLER_EXCEPTION'},503)}
        if(auth.status!==200) {
          const failedLogin=await env.ASSETS.fetch(new Request(new URL('/login.html',request.url)));
          if(failedLogin.status!==200)return sharedReply({error:'로그인 화면을 불러오지 못했습니다.'},503);
          let page=await failedLogin.text();
          const msg=auth.status===429?'로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.':'비밀번호를 확인해주세요.';
          page=page.replace('</form>','</form><p class="status error">'+msg+'</p>');
          return new Response(page,{status:auth.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}});
        }
        let asset,html;
        try{
          asset=await env.ASSETS.fetch(new Request(new URL('/index.html',request.url)));
          if(asset.status!==200)return sharedReply({error:'주문 대시보드 파일을 불러오지 못했습니다.',code:'DASHBOARD_ASSET_STATUS',asset_status:asset.status},503);
          html=await asset.text();
        }catch{return sharedReply({error:'대시보드 HTML 읽기 실패',code:'DASHBOARD_ASSET_EXCEPTION'},503)}
        if(!html.includes('id="refresh"')||!html.includes('id="reconnect"')){
          return sharedReply({error:'주문 대시보드 파일 검증 실패'},503);
        }
        const cookie=auth.headers.get('Set-Cookie');
        if(!cookie)return sharedReply({error:'로그인 쿠키 발급 실패'},503);
        // Change the displayed URL without another network navigation.
        const documentHtml=html.replace('</body>', '<script>history.replaceState(null,"","/");</script></body>');
        return new Response(documentHtml,{status:200,headers:{
          'Content-Type':'text/html; charset=utf-8',
          'Cache-Control':'no-store',
          'X-Frame-Options':'DENY',
          'X-GGM-Page':'dashboard',
          'Set-Cookie':cookie
        }});
      }
      if (shared && path.startsWith('/auth/shared/')) return handleShared(request,env,path);
      if (shared) {
        if (!sharedReady(env)) return sharedReply({error:'공통 로그인 비밀값 설정을 확인해주세요.'},503);
        const assetsPublic=path === '/login.html'||path.startsWith('/assets/')||path==='/favicon.ico';
        const session=assetsPublic?false:await sharedValid(request,env);
        if (!assetsPublic&&!session) {
          if (path.startsWith('/api/')||path.startsWith('/oauth/')||path.startsWith('/auth/')) {
            return sharedReply({error:'로그인이 필요합니다.',code:'LOGIN_REQUIRED'},401);
          }
          if (path === '/app' || path === '/index.html') {
            return sharedReply({error:'대시보드에 접근하려면 다시 로그인해주세요.',code:'LOGIN_REQUIRED'},401);
          }
          // No redirect loop: serve the login HTML directly for the home page.
          const login=await env.ASSETS.fetch(new Request(new URL('/login.html',request.url)));
          if(login.status!==200)return sharedReply({error:'로그인 화면 로딩 실패',status:login.status},503);
          return new Response(login.body,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
        }
      } else if (path.startsWith('/auth/')) return respond({error:'테스트 로그인 기능은 비활성화되었습니다.'},404);
      if (path === '/accounts.html') return redirect('/');
      if (!validEnv(env)) return respond({ error: 'Secret 또는 KV 바인딩이 없습니다.' }, 503);
      if (request.method !== 'GET') return respond({ error: '지원하지 않는 요청입니다.' }, 405);
      if (url.pathname === '/api/status') {
        const saved = await env.GGM_AUTH.get(TOKEN_KEY, 'json');
        return respond({ mall_id: MALL_ID, connected: Boolean(saved?.refresh_token && (!saved.refresh_expires_at || Number(saved.refresh_expires_at) > Date.now())), checked_at: new Date().toISOString() });
      }
      if (url.pathname === '/api/orders') return await orders(url, env);
      if (url.pathname === '/api/order-explorer') return await exploreOrders(url, env);
      if (url.pathname === '/api/products') return await catalogProducts(url, env);
      if (url.pathname === '/api/backup/shipping') return await shipmentBackupBatch(url, env);
      if (url.pathname === '/api/shipping-review') return await shippingReviewOrders(url, env);
      // Single-order detail, requested only when a staff member opens a popup.
      // No personal information is cached or written to KV/D1.
      if (/^\/api\/orders\/\d{8}-\d{7,9}\/detail$/.test(path)) {
        const orderId = path.split('/')[3];
        const token = await currentToken(env);
        const headers = {
          Authorization:'Bearer '+token,
          'X-Cafe24-Api-Version':API_VERSION,
          'Content-Type':'application/json'
        };
        const root=BASE+'/api/v2/admin/orders/'+encodeURIComponent(orderId);
        const endpoints=[
          ['order',root+'?embed=buyer,receivers,items'],
          ['buyer',root+'/buyer'],
          ['items',root+'/items?limit=100'],
          ['receivers',root+'/receivers?limit=100'],
          ['shipments',root+'/shipments?limit=100']
        ];
        const fetched=await Promise.all(endpoints.map(async ([key,uri])=>{
          try{
            const response=await fetch(uri,{headers});
            if(!response.ok)return [key,{error:'HTTP '+response.status}];
            const json=await response.json();
            return [key,{data:json}];
          }catch{return [key,{error:'통신 오류'}]}
        }));
        const results=Object.fromEntries(fetched);
        const rootRecord=results.order?.data?.order;
        const order=Array.isArray(rootRecord)?rootRecord[0]:rootRecord;
        if(!order||!order.order_id)return respond({
          error:'카페24 주문 상세를 확인할 수 없습니다.',
          details:results.order?.error||'주문 상세 미제공'
        },502);
        const asArray=value=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];
        const buyer=asArray(results.buyer?.data?.buyer)[0]||asArray(order.buyer)[0]||{};
        const receiverRaw=results.receivers?.data?.receivers??order.receivers;
        const itemRaw=results.items?.data?.items??order.items;
        const shipmentRaw=results.shipments?.data?.shipments;
        const receivers=asArray(receiverRaw).map(p=>({
          shipping_code:p.shipping_code??null,
          name:p.name??null,
          cellphone:p.cellphone??null,
          phone:p.phone??null,
          zipcode:p.zipcode??null,
          address1:p.address1??null,
          address2:p.address2??null,
          address_full:p.address_full??null,
          country_name:p.country_name??null,
          shipping_message:p.shipping_message??null,
          wished_delivery_date:p.wished_delivery_date??null
        }));
        const items=asArray(itemRaw).map(p=>({
          product_name:p.product_name??p.supplier_product_name??null,
          product_no:p.product_no??null,
          option_name:p.option_name??null,
          options:p.options??null,
          quantity:p.quantity??null,
          order_status:p.order_status??null,
          order_item_code:p.order_item_code??null,
          product_price:p.product_price??null
        }));
        const shipments=asArray(shipmentRaw).map(p=>({
          shipping_code:p.shipping_code??null,
          tracking_no:p.tracking_no??null,
          shipping_company_name:p.shipping_company_name??null,
          shipping_company_code:p.shipping_company_code??null,
          status:p.status??null,
          shipping_date:p.shipping_date??null
        }));
        return respond({
          order_id:order.order_id,
          order_date:order.order_date??null,
          buyer_name:buyer.name??null,
          buyer_email:buyer.email??null,
          buyer_cellphone:buyer.cellphone??null,
          buyer_phone:buyer.phone??null,
          payment_status:order.paid??order.payment_status??null,
          payment_date:order.payment_date??null,
          payment_method:order.payment_method??null,
          order_status:order.order_status??null,
          shipping_status:order.shipping_status??null,
          canceled:order.canceled??null,
          amount:amount(order.actual_order_amount),
          currency:order.currency??'KRW',
          receivers,items,shipments,
          partial_errors:{
            buyer:results.buyer?.error||null,
            items:results.items?.error||null,
            receivers:results.receivers?.error||null,
            shipments:results.shipments?.error||null
          }
        });
      }
      if (url.pathname.startsWith('/api/orders/') && url.pathname.endsWith('/items')) {
        const orderId = url.pathname.split('/')[3];
        if (!/^\d{8}-\d{7,9}$/.test(orderId || '')) return respond({ error: '올바른 주문번호가 아닙니다.' }, 400);
        const token = await currentToken(env);
        const res = await fetch(BASE + '/api/v2/admin/orders/' + encodeURIComponent(orderId) + '/items?limit=100', {
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Cafe24-Api-Version': API_VERSION }
        });
        if (!res.ok) return respond({ error: '주문 상품 정보를 불러오지 못했습니다.', http_status: res.status }, 502);
        const body = await res.json();
        const items = Array.isArray(body.items) ? body.items : [];
        // Shipments may be split across multiple parcels. Fetch only when an order is opened.
        let shipments = [];
        let shipment_error = null;
        try {
          const shipmentRes = await fetch(BASE + '/api/v2/admin/orders/' + encodeURIComponent(orderId) + '/shipments?limit=100', {
            headers: { Authorization: 'Bearer ' + token, 'X-Cafe24-Api-Version': API_VERSION }
          });
          if (shipmentRes.ok) {
            const shipmentBody = await shipmentRes.json();
            shipments = (Array.isArray(shipmentBody.shipments) ? shipmentBody.shipments : []).map(p => ({
              tracking_no: p.tracking_no ?? null,
              shipping_company_name: p.shipping_company_name ?? null,
              status: p.status ?? null,
              shipping_code: p.shipping_code ?? null
            }));
          } else shipment_error = '배송정보 조회 실패 (' + shipmentRes.status + ')';
        } catch { shipment_error = '배송정보 조회 실패'; }
        return respond({ order_id: orderId, count: items.length, shipments, shipment_error, items: items.map(x => ({
          name: x.product_name || x.supplier_product_name || '상품명 미제공',
          options: x.options || [],
          quantity: x.quantity ?? null,
          order_status: x.order_status || null,
          tracking_no: x.tracking_no || null,
          shipping_company_name: x.shipping_company_name || null
        })) });
      }
      if (url.pathname === '/oauth/start') {
        const state = secureRandom();
        await env.GGM_AUTH.put(STATE_PREFIX + state, 'pending', { expirationTtl: 300 });
        const dest = new URL(BASE + '/api/v2/oauth/authorize');
        dest.searchParams.set('response_type', 'code');
        dest.searchParams.set('client_id', env.CAFE24_CLIENT_ID);
        dest.searchParams.set('state', state);
        dest.searchParams.set('redirect_uri', REDIRECT_URI);
        dest.searchParams.set('scope', 'mall.read_order,mall.read_product');
        return redirect(dest.toString(), { 'Set-Cookie': 'ggm_oauth=' + state + '; Max-Age=300; Path=/oauth; HttpOnly; Secure; SameSite=Lax' });
      }
      if (url.pathname === '/oauth/callback') {
        const state = url.searchParams.get('state') || '';
        const code = url.searchParams.get('code') || '';
        const cookie = request.headers.get('Cookie') || '';
        const cookieState = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('ggm_oauth='));
        if (!/^[0-9a-f]{48}$/.test(state) || !code || code.length > 4096 || cookieState !== 'ggm_oauth=' + state) {
          return respond({ error: '인증 상태값이 일치하지 않습니다. 다시 연결해주세요.' }, 400);
        }
        const key = STATE_PREFIX + state;
        if (await env.GGM_AUTH.get(key) !== 'pending') return respond({ error: '인증 요청이 만료되었습니다.' }, 400);
        await env.GGM_AUTH.delete(key);
        const token = await oauthToken(env, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
        await env.GGM_AUTH.put(TOKEN_KEY, JSON.stringify(token));
        return redirect('/?connected=1', { 'Set-Cookie': 'ggm_oauth=; Max-Age=0; Path=/oauth; HttpOnly; Secure; SameSite=Lax' });
      }
      // Assets serve the frontend only. No sensitive API values should be cached in assets.
      // With html_handling=none, explicitly map the app root to the index asset.
      // This prevents canonical .html redirects from forming login loops.
      if (path === '/' || path === '/app' || path === '/index.html') {
        // The app entry must either be a verified dashboard or a clear error;
        // never return the login form under /app or /index.html.
        const assetRequest = new Request(new URL('/index.html',request.url),{method:'GET'});
        const asset=await env.ASSETS.fetch(assetRequest);
        if(asset.status!==200)return respond({error:'대시보드 정적 파일을 읽을 수 없습니다.',asset_status:asset.status},503);
        const html=await asset.text();
        if(!html.includes('id="refresh"') || !html.includes('id="reconnect"')) {
          return respond({error:'대시보드 파일 대신 다른 페이지가 반환되었습니다.',code:'ASSET_MISMATCH'},503);
        }
        return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-GGM-Page':'dashboard'}});
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      const message = String(err?.message || '');
      const safe = message.startsWith('카페24') ? message : '서버 처리 중 문제가 발생했습니다.';
      return respond({ error: safe }, 500);
    }
  }
};
