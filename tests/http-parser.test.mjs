import assert from 'node:assert/strict';
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expressRequire = createRequire(require.resolve('express'));
const qs = expressRequire('qs');
assert.equal(expressRequire('qs/package.json').version, '6.16.0');
assert.doesNotThrow(() => qs.stringify({ a: [null, undefined, 'ok'] }, { arrayFormat: 'comma', encodeValuesOnly: true }));
assert.doesNotThrow(() => qs.stringify({ constructor: { isBuffer: 1 } }));
assert.throws(() => qs.parse('a[]=1,2,3', { comma: true, arrayLimit: 2, throwOnLimitExceeded: true }), RangeError);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.get('/query', (req, res) => res.json(req.query));
app.post('/json', (req, res) => res.json(req.body));
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: true }));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  assert.deepEqual(await (await fetch(`${base}/query?filter[status]=aberto&tag=a&tag=b`)).json(), { filter: { status: 'aberto' }, tag: ['a', 'b'] });
  const malicious = await fetch(`${base}/query?__proto__[polluted]=yes&constructor[prototype][polluted]=yes`);
  assert.equal(malicious.status, 200);
  assert.equal({}.polluted, undefined);
  const body = { amount: 1250.5, client: 'Conta fictícia' };
  assert.deepEqual(await (await fetch(`${base}/json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), body);
  assert.equal((await fetch(`${base}/json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  console.log('PASS: qs corrigido, query parsing, JSON e rejeição de JSON inválido via HTTP local.');
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
