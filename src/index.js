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
  const limit = safeInt(url.searchParams.get('limit'), 50, 1, 100);
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 8000);
  const token = await currentToken(env);
  const query = new URL(BASE + '/api/v2/admin/orders');
  query.searchParams.set('start_date', kstDay(Date.now() - days * 86400000));
  query.searchParams.set('end_date', kstDay(Date.now()));
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
  if (!api.ok) return respond({ error: '카페24 주문 조회 실패', http_status: api.status }, 502);
  const payload = await api.json();
  const list = Array.isArray(payload.orders) ? payload.orders : [];
  return respond({
    mall_id: MALL_ID, days, limit, offset, count: list.length, has_more: list.length === limit,
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
  const offset = safeInt(url.searchParams.get('offset'), 0, 0, 5000);
  const limit = safeInt(url.searchParams.get('limit'), 50, 1, 50);
  const token = await currentToken(env);
  const query = new URL(BASE + '/api/v2/admin/orders');
  query.searchParams.set('start_date', kstDay(Date.now() - days * 86400000));
  query.searchParams.set('end_date', kstDay(Date.now()));
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
    days, limit, offset, count: mapped.length,
    has_more: mapped.length === limit,
    items_unavailable: mapped.some(x => !x.items_embedded),
    checked_at: new Date().toISOString(),
    orders: mapped
  });
}

export default {
  async fetch(request, env) {
    // IMPORTANT: Cloudflare Access must protect every public Worker route.
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return respond({ error: '잘못된 호스트' }, 400);
    if (!validEnv(env)) return respond({ error: 'Secret 또는 KV 바인딩이 없습니다.' }, 503);
    if (request.method !== 'GET') return respond({ error: '지원하지 않는 요청입니다.' }, 405);
    try {
      if (url.pathname === '/api/status') {
        const saved = await env.GGM_AUTH.get(TOKEN_KEY, 'json');
        return respond({ mall_id: MALL_ID, connected: Boolean(saved?.refresh_token), checked_at: new Date().toISOString() });
      }
      if (url.pathname === '/api/orders') return await orders(url, env);
      if (url.pathname === '/api/order-explorer') return await exploreOrders(url, env);
      if (url.pathname === '/api/shipping-review') return await shippingReviewOrders(url, env);
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
        dest.searchParams.set('scope', 'mall.read_order');
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
      return env.ASSETS.fetch(request);
    } catch (err) {
      const message = String(err?.message || '');
      const safe = message.startsWith('카페24') ? message : '서버 처리 중 문제가 발생했습니다.';
      return respond({ error: safe }, 500);
    }
  }
};
