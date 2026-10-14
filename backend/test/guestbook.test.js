import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { origin, setup } from './support/harness.js';

test('real SQL persists pending submissions and only approved messages are public', async () => {
  const { sqlite, request } = setup();
  try {
    const submission = await request('POST', { nickname: " DIVE's ♡ ", body: " I AM 是我的入坑舞台。\n<script>alert(1)</script> ", website: '' });
    assert.equal(submission.status, 201);
    const receipt = await submission.json();
    assert.equal(receipt.status, 'pending');
    assert.equal(submission.headers.get('Access-Control-Allow-Origin'), origin);
    assert.deepEqual((await (await request()).json()).messages, []);
    const stored = sqlite.prepare('SELECT * FROM messages WHERE id = ?').get(receipt.id);
    assert.equal(stored.nickname, "DIVE's ♡");
    assert.equal(stored.status, 'pending');
    sqlite.prepare("UPDATE messages SET status = 'approved' WHERE id = ?").run(receipt.id);
    const messages = (await (await request()).json()).messages;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].body, stored.body);
    assert.deepEqual(Object.keys(messages[0]).sort(), ['id', 'nickname', 'body', 'created_at'].sort());
    sqlite.prepare("UPDATE messages SET status = 'rejected' WHERE id = ?").run(receipt.id);
    assert.deepEqual((await (await request()).json()).messages, []);
  } finally { sqlite.close(); }
});

test('public list is bounded and ordered newest first', async () => {
  const { sqlite, request } = setup();
  try {
    const insert = sqlite.prepare("INSERT INTO messages (id,nickname,body,status,created_at) VALUES (?,'DIVE','心动瞬间','approved',?)");
    for (let i = 1; i <= 25; i++) insert.run(String(i), `2026-10-${String(i).padStart(2, '0')}T00:00:00.000Z`);
    const response = await request();
    const { messages } = await response.json();
    assert.equal(messages.length, 20);
    assert.equal(messages[0].id, '25');
    assert.equal(messages[19].id, '6');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally { sqlite.close(); }
});

test('cross-site writes, unsupported preflights and methods are rejected', async () => {
  const { sqlite, env, request } = setup();
  try {
    const post = { nickname: 'DIVE', body: '你好' };
    const denied = await request('POST', post, { headers: { Origin: 'https://other.example' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
    const noOrigin = await worker.fetch(new Request('https://api.20040831.xyz/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(post) }), env);
    assert.equal(noOrigin.status, 403);
    const preflight = await request('OPTIONS', undefined, { headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(preflight.status, 204);
    assert.equal((await request('OPTIONS', undefined, { headers: { 'Access-Control-Request-Method': 'DELETE' } })).status, 403);
    assert.equal((await request('DELETE')).status, 405);
    assert.equal((await request('POST', undefined, { path: '/api/health' })).status, 405);
    assert.equal((await request('GET', undefined, { path: '/api/admin/messages' })).status, 404);
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM messages').get().count, 0);
  } finally { sqlite.close(); }
});

test('malformed, empty, oversized and honeypot submissions never reach the database', async () => {
  const { sqlite, request } = setup();
  try {
    for (const body of [null, [], {}, { nickname: ' ', body: 'hi' }, { nickname: 'a'.repeat(25), body: 'hi' }, { nickname: 'DIVE', body: 'a'.repeat(501) }, { nickname: 'DIVE', body: '\u0000hi' }, { nickname: 'DIVE', body: 'hi', website: 'spam' }, '{broken']) {
      assert.equal((await request('POST', body)).status, 400);
    }
    assert.equal((await request('POST', { nickname: 'DIVE', body: 'hi' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await request('POST', 'x'.repeat(4097))).status, 413);
    assert.equal((await request('POST', '{}', { headers: { 'Content-Length': '99999' } })).status, 413);
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM messages').get().count, 0);
  } finally { sqlite.close(); }
});

test('rate limit returns 429 and does not write extra messages', async () => {
  const { sqlite, request } = setup();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await request('POST', { nickname: 'DIVE', body: '你好' })).status, 201);
    const limited = await request('POST', { nickname: 'DIVE', body: '你好' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '60');
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM messages').get().count, 5);
  } finally { sqlite.close(); }
});

test('missing bindings and database failures return a safe unavailable response', async () => {
  const { sqlite, env, request } = setup();
  try {
    assert.equal((await request('GET', undefined, { path: '/api/health' })).status, 200);
    delete env.SUBMISSION_LIMITER;
    assert.equal((await request('POST', { nickname: 'DIVE', body: '你好' })).status, 503);
    env.DB = { prepare() { throw new Error('private database internals'); } };
    const failed = await request();
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /private database internals/);
    delete env.DB;
    assert.equal((await request()).status, 503);
  } finally { sqlite.close(); }
});
