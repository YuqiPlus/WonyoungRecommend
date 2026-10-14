import { moderateMessage, moderationConfig } from './moderation.js';

const MAX_BYTES = 4096;
const PUBLIC_FIELDS = 'id, nickname, body, created_at';

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

async function readBody(request) {
  if (!request.body) throw new Error('invalid_body');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new Error('body_too_large');
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function validText(value, limit) {
  return typeof value === 'string' && [...value.trim()].length >= 1
    && [...value.trim()].length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

async function route(request, env, origin) {
  const { pathname } = new URL(request.url);
  const isMessages = pathname === '/api/messages';
  if (pathname !== '/api/health' && !isMessages) return json({ error: '接口不存在。' }, 404);
  if (request.method === 'OPTIONS') {
    if (!origin) return json({ error: '不支持此来源。' }, 403);
    const method = request.headers.get('Access-Control-Request-Method');
    const headers = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
    if (!['GET', 'POST'].includes(method) || headers.some(h => h !== 'content-type')) {
      return json({ error: '不支持此请求。' }, 403);
    }
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    } });
  }
  if (request.method !== 'GET' && !(isMessages && request.method === 'POST')) {
    return json({ error: '不支持此请求方法。' }, 405, { Allow: isMessages ? 'GET, POST, OPTIONS' : 'GET, OPTIONS' });
  }
  if (!env.DB) return json({ error: '留言板暂未开放，请稍后再来。' }, 503);
  if (request.method === 'GET') {
    if (!isMessages) {
      await env.DB.prepare('SELECT 1 AS ready').first();
      return json({ ok: true, moderation: { configured: !!moderationConfig(env) } });
    }
    const { results } = await env.DB.prepare(
      `SELECT ${PUBLIC_FIELDS} FROM messages WHERE status = 'approved' ORDER BY created_at DESC, id DESC LIMIT 20`
    ).all();
    return json({ messages: results });
  }
  if (!origin) return json({ error: '请通过本站提交留言。' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: '请使用 JSON 格式提交。' }, 415);
  }
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) {
    return json({ error: '留言内容过长。' }, 413);
  }
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return json({ error: error.message === 'body_too_large' ? '留言内容过长。' : '留言格式不正确。' }, error.message === 'body_too_large' ? 413 : 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || !validText(body.nickname, 24) || !validText(body.body, 500)
      || (body.website !== undefined && body.website !== '')) {
    return json({ error: '请填写 1–24 字的昵称和 1–500 字的留言。' }, 400);
  }
  if (!env.SUBMISSION_LIMITER) return json({ error: '留言暂时无法提交，请稍后再试。' }, 503);
  // Anonymous submissions share a small per-network allowance; this is best-effort abuse control.
  // The address is only used by the short-lived rate limiter and is never stored in D1.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return json({ error: '暂时无法验证请求，请稍后再试。' }, 503);
  const { success } = await env.SUBMISSION_LIMITER.limit({ key: `guestbook:${ip}` });
  if (!success) return json({ error: '提交太频繁，请一分钟后再试。' }, 429, { 'Retry-After': '60' });
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages (id, nickname, body, status) VALUES (?, ?, ?, 'pending')")
    .bind(id, body.nickname.trim(), body.body.trim()).run();
  const review = await moderateMessage(env, { id, nickname: body.nickname.trim(), body: body.body.trim() });
  const message = review.status === 'approved' ? '留言已通过审核并公开，谢谢你的分享 ♡'
    : review.status === 'rejected' || review.decision === 'reject' ? '留言未通过自动审核，暂未公开，已保留供站长复核。'
    : '留言已收到并保存，待确认后公开展示。谢谢你的分享 ♡';
  return json({ id, status: review.status, message }, 201);
}

export default {
  async fetch(request, env) {
    const requestedOrigin = request.headers.get('Origin');
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const origin = allowedOrigins.includes(requestedOrigin) ? requestedOrigin : null;
    const cors = {
      Vary: 'Origin',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
    };
    let response;
    if (requestedOrigin && !origin) {
      response = json({ error: '不支持此来源。' }, 403);
    } else {
      try {
        response = await route(request, env, origin);
      } catch {
        // Do not send database internals or submitted content to visitors or logs.
        response = json({ error: '留言服务暂时不可用，请稍后再试。' }, 503);
      }
    }
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  }
};
