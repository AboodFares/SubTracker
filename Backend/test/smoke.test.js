/**
 * Smoke tests — "does the server actually start and respond?"
 *
 * These boot the REAL Express app (server.js) and make real HTTP requests
 * against it. They need a reachable MongoDB (your .env locally, a service
 * container in CI) but no other external services — every route tested here
 * responds before touching Claude, Gmail, or Plaid.
 *
 * Run with:  npm test
 */

// Use a random free port so tests never clash with a dev server on :3000
process.env.PORT = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

// Requiring server.js builds the full app (routes, middleware, 404 handler)
const app = require('../server');

let server;
let base;

before(async () => {
  // server.js already listens on PORT=0; we open our own listener too so we
  // know exactly which port to hit
  server = app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

test('health check responds with OK', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'OK');
});

test('unknown routes return the JSON 404 handler', async () => {
  const res = await fetch(`${base}/api/definitely-not-a-route`);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.strictEqual(body.success, false);
});

test('protected route rejects requests without a token', async () => {
  const res = await fetch(`${base}/api/auth/me`);
  assert.strictEqual(res.status, 401);
});

test('statement upload rejects requests without a token', async () => {
  const res = await fetch(`${base}/api/statements`, { method: 'GET' });
  assert.strictEqual(res.status, 401);
});

test('login rejects malformed credentials with 4xx, not a crash', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }) // missing password
  });
  assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}`);
});
