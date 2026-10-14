import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !/^[a-f0-9]{32}$/i.test(accountId || '')) {
  throw new Error('Configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in GitHub Actions secrets.');
}
const configPath = new URL('../wrangler.json', import.meta.url);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const name = config.d1_databases[0].database_name;

async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    const codes = (data.errors || []).map(error => error.code).join(',');
    throw new Error(`Cloudflare API request failed: HTTP ${response.status}, codes ${codes}. Check account ID and token permissions.`);
  }
  return data.result;
}

const databases = await api(`/d1/database?name=${encodeURIComponent(name)}&per_page=100`);
let database = databases.find(item => item.name === name);
if (!database) {
  database = await api('/d1/database', { method: 'POST', body: JSON.stringify({ name, primary_location_hint: 'apac' }) });
  console.log(`Created D1 database: ${name}`);
} else {
  console.log(`Reusing D1 database: ${name}`);
}
if (!/^[a-f0-9-]{36}$/i.test(database.uuid || '')) throw new Error('Cloudflare did not return a valid D1 database ID.');
config.account_id = accountId;
config.d1_databases[0].database_id = database.uuid;
const outputPath = new URL('../.wrangler.deploy.json', import.meta.url);
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Deployment configuration prepared: ${fileURLToPath(outputPath).split('/').pop()}`);
