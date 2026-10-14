import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('real Workers runtime sends moderation requests and never follows provider redirects', async () => {
  let redirect = false;
  let requests = 0;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'moderation-test',
    rootPath: fileURLToPath(new URL('../', import.meta.url)),
    compatibilityDate: '2026-10-13',
    modules: [{
      type: 'ESModule', path: fileURLToPath(new URL('./runtime-entry.js', import.meta.url)), contents: `
        import { moderateMessage } from '../src/moderation.js';
        export default { async fetch(request, env) {
          return Response.json(await moderateMessage(env, {
            id: new URL(request.url).pathname.slice(1), nickname: 'DIVE', body: '转圈'
          }));
        }};
      `
    }, {
      type: 'ESModule', path: fileURLToPath(new URL('../src/moderation.js', import.meta.url)),
      contents: readFileSync(new URL('../src/moderation.js', import.meta.url), 'utf8')
    }],
    bindings: {
      LLM_BASE_URL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      LLM_MODEL: 'doubao-seed-2.1-lite', LLM_API_KEY: 'runtime-test-key'
    },
    d1Databases: ['DB'],
    outboundService: async request => {
      requests++;
      assert.equal(request.url, 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions');
      assert.equal(request.headers.get('Authorization'), 'Bearer runtime-test-key');
      const payload = await request.json();
      assert.equal(JSON.parse(payload.messages[1].content).body, '转圈');
      if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
      return Response.json({ choices: [{ finish_reason: 'stop', message: {
        content: '{"decision":"approve","reason":"ok"}'
      } }] });
    }
  }));
  try {
    const db = await runtime.getD1Database('DB');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      for (const sql of readFileSync(new URL(file, directory), 'utf8').split(';').filter(sql => sql.trim())) {
        await db.prepare(sql).run();
      }
    }
    for (const id of ['approved-test', 'redirect-test']) {
      await db.prepare("INSERT INTO messages (id, nickname, body) VALUES (?, 'DIVE', '转圈')").bind(id).run();
    }
    const approved = await (await runtime.dispatchFetch('https://worker.test/approved-test')).json();
    assert.equal(approved.status, 'approved');
    assert.equal(requests, 1);
    redirect = true;
    const pending = await (await runtime.dispatchFetch('https://worker.test/redirect-test')).json();
    assert.equal(pending.status, 'pending');
    assert.equal(requests, 2);
    assert.equal((await db.prepare("SELECT moderation_reason FROM messages WHERE id = 'redirect-test'").first()).moderation_reason, 'provider_http_302');
  } finally {
    await runtime.dispose();
  }
});
