import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseDecision, moderationConfig } from '../src/moderation.js';
import { setup } from './support/harness.js';

const configuration = {
  LLM_BASE_URL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
  LLM_MODEL: 'doubao-seed-2.1-lite',
  LLM_API_KEY: 'fake-key-for-local-tests-only'
};
const message = { nickname: 'DIVE', body: 'LOVE DIVE 是我的入坑舞台。' };
const reply = (decision = 'approve', reason = 'ok', finish = 'stop') => Response.json({
  choices: [{ finish_reason: finish, message: { content: JSON.stringify({ decision, reason }) } }]
});

test('strict decisions reject ambiguous, contradictory and non-JSON outputs', () => {
  assert.equal(parseDecision('{"decision":"approve","reason":"ok"}').decision, 'approve');
  assert.equal(parseDecision('```json\n{"decision":"review","reason":"uncertain"}\n```').decision, 'review');
  for (const value of [null, [], 'true', '[]', '通过', '{"decision":true,"reason":"ok"}', '{"decision":"approve","reason":"privacy"}', '{"decision":"approve","reason":"ok","extra":1}', '{"decision":"reject","reason":"ok"}', '{"decision":"approve"}', 'prefix {"decision":"approve","reason":"ok"}', '{"decision":"approve","reason":"ok"} suffix']) {
    assert.equal(parseDecision(value), null);
  }
});

test('endpoint configuration preserves the selected provider path and model', () => {
  assert.equal(moderationConfig(configuration).endpoint.href, 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions');
  assert.equal(moderationConfig(configuration).model, 'doubao-seed-2.1-lite');
  assert.equal(moderationConfig({ ...configuration, LLM_BASE_URL: configuration.LLM_BASE_URL + '/chat/completions/' }).endpoint.href, moderationConfig(configuration).endpoint.href);
  for (const url of ['http://provider.example/v1', 'https://user:password@provider.example/v1', 'https://provider.example/v1?key=secret', 'https://provider.example/v1#key', 'invalid']) {
    assert.equal(moderationConfig({ ...configuration, LLM_BASE_URL: url }), null);
  }
  assert.equal(moderationConfig({ ...configuration, LLM_API_KEY: '' }), null);
});

test('approved model response publishes the saved message without exposing audit fields', async t => {
  const { sqlite, env, request } = setup();
  Object.assign(env, configuration);
  t.after(() => sqlite.close());
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${configuration.LLM_API_KEY}`);
    assert.equal(options.redirect, 'manual');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, configuration.LLM_MODEL);
    assert.equal(payload.max_tokens, 128);
    assert.deepEqual(payload.thinking, { type: 'disabled' });
    assert.deepEqual(payload.response_format, { type: 'json_object' });
    assert.deepEqual(JSON.parse(payload.messages[1].content), message);
    assert.equal(payload.messages[0].role, 'system');
    assert.equal(payload.messages[1].role, 'user');
    assert.doesNotMatch(options.body, /192\.0\.2\.1|fake-key-for-local-tests-only/);
    assert.equal(sqlite.prepare('SELECT status FROM messages').get().status, 'pending');
    return reply();
  });
  const response = await request('POST', message);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, 'approved');
  const stored = sqlite.prepare('SELECT * FROM messages').get();
  assert.equal(stored.moderation_decision, 'approve');
  assert.equal(stored.moderation_reason, 'ok');
  assert.equal(stored.moderation_model, configuration.LLM_MODEL);
  const publicData = await (await request()).json();
  assert.equal(publicData.messages.length, 1);
  assert.equal('moderation_reason' in publicData.messages[0], false);
  assert.equal('moderation_model' in publicData.messages[0], false);
});

for (const [decision, reason] of [['reject', 'abuse'], ['review', 'uncertain']]) {
  test(`${decision} verdict keeps the message private for manual review`, async t => {
    const { sqlite, env, request } = setup();
    Object.assign(env, configuration);
    t.after(() => sqlite.close());
    t.mock.method(globalThis, 'fetch', async () => reply(decision, reason));
    const response = await request('POST', message);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).status, 'pending');
    assert.equal(sqlite.prepare('SELECT moderation_decision FROM messages').get().moderation_decision, decision);
    assert.deepEqual((await (await request()).json()).messages, []);
  });
}

for (const scenario of ['http_error', 'redirect', 'malformed', 'truncated', 'network_error', 'oversized']) {
  test(`${scenario} never publishes or exposes the provider error body`, async t => {
    const { sqlite, env, request } = setup();
    Object.assign(env, configuration);
    t.after(() => sqlite.close());
    t.mock.method(globalThis, 'fetch', async () => {
      if (scenario === 'http_error') return new Response(configuration.LLM_API_KEY, { status: 401 });
      if (scenario === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
      if (scenario === 'malformed') return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'approve' } }] });
      if (scenario === 'truncated') return reply('approve', 'ok', 'length');
      if (scenario === 'network_error') throw new Error(configuration.LLM_API_KEY);
      return new Response('x'.repeat(17000));
    });
    const response = await request('POST', message);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).status, 'pending');
    const record = sqlite.prepare('SELECT * FROM messages').get();
    assert.equal(record.status, 'pending');
    assert.doesNotMatch(JSON.stringify(record), /fake-key-for-local-tests-only/);
    assert.deepEqual((await (await request()).json()).messages, []);
  });
}

test('timeout aborts the request and leaves an accepted message pending', async t => {
  const { sqlite, env, request } = setup();
  Object.assign(env, configuration, { LLM_TIMEOUT_MS: '100' });
  t.after(() => sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const response = await request('POST', message);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, 'pending');
  assert.equal(sqlite.prepare('SELECT moderation_reason FROM messages').get().moderation_reason, 'timeout');
});

test('atomic daily budget caps concurrent calls across network addresses', async t => {
  const { sqlite, env, request } = setup();
  Object.assign(env, configuration, { LLM_DAILY_LIMIT: '2' });
  t.after(() => sqlite.close());
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return reply(); });
  const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => request('POST', message, { headers: { 'CF-Connecting-IP': `192.0.2.${index + 1}` } })));
  assert.equal(calls, 2);
  assert.equal(sqlite.prepare('SELECT requests FROM moderation_daily_usage').get().requests, 2);
  const receipts = await Promise.all(responses.map(response => response.json()));
  assert.equal(receipts.filter(receipt => receipt.status === 'approved').length, 2);
  assert.equal(receipts.filter(receipt => receipt.status === 'pending').length, 4);
});

test('missing key and zero daily limit do not invoke any model', async t => {
  const { sqlite, env, request } = setup();
  t.after(() => sqlite.close());
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Must not call an unconfigured or disabled model'); });
  assert.equal((await (await request('POST', message)).json()).status, 'pending');
  Object.assign(env, configuration, { LLM_DAILY_LIMIT: '0' });
  assert.equal((await (await request('POST', message)).json()).status, 'pending');
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM moderation_daily_usage').get().count, 0);
  const health = await (await request('GET', undefined, { path: '/api/health' })).json();
  assert.deepEqual(health.moderation, { configured: true });
  assert.doesNotMatch(JSON.stringify(health), /fake-key|ark\.cn|doubao/);
});

test('manual moderation during a model request is preserved', async t => {
  const { sqlite, env, request } = setup();
  Object.assign(env, configuration);
  t.after(() => sqlite.close());
  t.mock.method(globalThis, 'fetch', async () => {
    sqlite.prepare("UPDATE messages SET status = 'rejected'").run();
    return reply();
  });
  assert.equal((await (await request('POST', message)).json()).status, 'rejected');
  assert.equal(sqlite.prepare('SELECT status FROM messages').get().status, 'rejected');
  assert.deepEqual((await (await request()).json()).messages, []);
});

test('new migration preserves existing manual messages without publishing them', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../migrations/0001_guestbook.sql', import.meta.url), 'utf8'));
    sqlite.exec("INSERT INTO messages (id,nickname,body) VALUES ('existing','DIVE','以前的留言')");
    sqlite.exec(readFileSync(new URL('../migrations/0002_llm_moderation.sql', import.meta.url), 'utf8'));
    const record = sqlite.prepare("SELECT * FROM messages WHERE id = 'existing'").get();
    assert.equal(record.status, 'pending');
    assert.equal(record.body, '以前的留言');
    assert.equal(record.moderated_at, null);
  } finally { sqlite.close(); }
});
