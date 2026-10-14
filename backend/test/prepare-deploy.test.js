import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function provision(scenario) {
  const directory = mkdtempSync(join(tmpdir(), 'wonyoung-deploy-test-'));
  mkdirSync(join(directory, 'scripts'));
  copyFileSync(new URL('../scripts/prepare-deploy.js', import.meta.url), join(directory, 'scripts/prepare-deploy.js'));
  copyFileSync(new URL('../wrangler.json', import.meta.url), join(directory, 'wrangler.json'));
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
  writeFileSync(join(directory, 'mock-api.mjs'), `
    globalThis.fetch = async (url, init) => {
      if (!url.startsWith('https://api.cloudflare.com/client/v4/accounts/' + 'a'.repeat(32) + '/d1/database')) throw new Error('Unexpected API route');
      if (init.headers.Authorization !== 'Bearer test-token-do-not-log') throw new Error('Missing auth header');
      const database = { name: 'wonyoung-guestbook', uuid: '11111111-2222-3333-4444-555555555555' };
      if (${JSON.stringify(scenario)} === 'forbidden') return Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 });
      if (init.method === 'POST') {
        if (${JSON.stringify(scenario)} === 'reuse') throw new Error('Must not create an existing database');
        if (JSON.parse(init.body).name !== database.name) throw new Error('Wrong database name');
        return Response.json({ success: true, result: database });
      }
      return Response.json({ success: true, result: ${JSON.stringify(scenario)} === 'reuse' ? [database] : [] });
    };
  `);
  const process = spawnSync(globalThis.process.execPath, ['--import', join(directory, 'mock-api.mjs'), join(directory, 'scripts/prepare-deploy.js')], {
    env: { ...globalThis.process.env, CLOUDFLARE_API_TOKEN: 'test-token-do-not-log', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }, encoding: 'utf8'
  });
  const output = join(directory, '.wrangler.deploy.json');
  const result = { ...process, config: existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null };
  rmSync(directory, { recursive: true, force: true });
  return result;
}

for (const scenario of ['create', 'reuse']) {
  test(`deployment preparation can ${scenario} the D1 binding without logging credentials`, () => {
    const result = provision(scenario);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.config.d1_databases[0].database_id, '11111111-2222-3333-4444-555555555555');
    assert.equal(result.config.account_id, 'a'.repeat(32));
    assert.deepEqual(result.config.routes, [{ pattern: 'api.20040831.xyz', custom_domain: true }]);
    assert.equal(result.config.keep_vars, true);
    assert.equal(result.config.vars.LLM_BASE_URL, 'https://ark.cn-beijing.volces.com/api/coding/v3');
    assert.equal(result.config.vars.LLM_MODEL, 'doubao-seed-2.1-lite');
    assert.equal(Object.hasOwn(result.config.vars, 'LLM_API_KEY'), false);
    assert.doesNotMatch(result.stdout + result.stderr + JSON.stringify(result.config), /test-token-do-not-log/);
  });
}

test('failed Cloudflare authorization does not create a deployment configuration', () => {
  const result = provision('forbidden');
  assert.notEqual(result.status, 0);
  assert.equal(result.config, null);
  assert.match(result.stderr, /HTTP 403/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-token-do-not-log/);
});
