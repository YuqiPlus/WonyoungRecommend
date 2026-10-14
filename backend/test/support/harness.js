import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../../src/index.js';

export const origin = 'https://20040831.xyz';
export function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const directory = new URL('../../migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  const counts = new Map();
  const env = {
    ALLOWED_ORIGINS: origin,
    SUBMISSION_LIMITER: { async limit({ key }) {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return { success: count <= 5 };
    } },
    DB: { prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { return sqlite.prepare(sql).run(...values); }
      };
      return statement;
    } }
  };
  function request(method = 'GET', body, options = {}) {
    const { headers = {}, path = '/api/messages', ...init } = options;
    return worker.fetch(new Request(`https://api.20040831.xyz${path}`, {
      method, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), ...init
    }), env);
  }
  return { sqlite, env, request };
}
