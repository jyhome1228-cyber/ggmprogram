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
    orders: list.map(o => ({
      order_id: o.order_id || '',
      order_date: o.order_date || '',
      order_status: o.order_status || '',
      payment_status: o.payment_status || '',
      currency: o.currency || 'KRW',
      amount: amount(o.actual_order_amount)
    }))
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
