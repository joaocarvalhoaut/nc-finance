import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Gerado com `supabase status -o json` SOMENTE no laboratório isolado.
// Nunca lê .env, aceita URL remota ou segue redirecionamentos.
const status = JSON.parse(await readFile(new URL('../.local/ncfinance-lab/status.json', import.meta.url), 'utf8'));
const origin = 'http://127.0.0.1:55321';
assert.equal(new URL(status.API_URL).origin, origin, 'API precisa ser a do laboratório local.');
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, 'Chaves locais ausentes.');
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => {
    assert.equal(new URL(typeof input === 'string' ? input : input.url ?? input.href).origin, origin);
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } },
};
const admin = createClient(origin, status.SERVICE_ROLE_KEY, options);
const accounts = [];
const runId = randomUUID();
const table = 'user_registros_financeiros';
try {
  for (const label of ['a', 'b']) {
    const email = `lab-${label}-${runId}@example.invalid`;
    const password = `Lab!${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null, 'Criação da conta fictícia falhou.');
    const account = { id: created.data.user.id, client: createClient(origin, status.ANON_KEY, options) };
    accounts.push(account);
    const login = await account.client.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null, 'Login local falhou.');
    const inserted = await account.client.from(table).insert({ user_id: account.id, client_name: `Fictício ${label}`, document_number: `LAB-${runId}-${label}`, due_date: '2026-09-11', amount: 1 }).select('id').single();
    assert.equal(inserted.error, null, 'Inserção do próprio registro falhou.');
    account.recordId = inserted.data.id;
    const reservation = await admin.rpc('reserve_charge_send', { p_user_id: account.id, p_key: 'b'.repeat(64) });
    assert.equal(reservation.error, null, 'RPC de reserva precisa existir e ser acessível ao backend.');
    assert.equal(reservation.data, true);
  }
  for (const account of accounts) {
    const other = accounts.find(item => item !== account);
    const read = await account.client.from(table).select('id,user_id').in('id', accounts.map(item => item.recordId));
    assert.equal(read.error, null);
    assert.deepEqual(read.data, [{ id: account.recordId, user_id: account.id }]);
    const update = await account.client.from(table).update({ amount: 999 }).eq('id', other.recordId).select('id');
    assert.equal(update.error, null);
    assert.deepEqual(update.data, []);
    const spoof = await account.client.from(table).insert({ user_id: other.id, client_name: 'Tentativa fictícia', document_number: `LAB-${runId}-spoof`, due_date: '2026-09-11', amount: 1 });
    assert.equal(spoof.error?.code, '42501', 'Inserção em nome de outra conta deve ser recusada pela política de acesso.');
    const rpc = await account.client.rpc('reserve_charge_send', { p_user_id: account.id, p_key: 'a'.repeat(64) });
    assert.ok(['42501', 'PGRST202'].includes(rpc.error?.code), 'RPC administrativo deve ser inacessível ao usuário.');
  }
  console.log('PASS: Auth real local, login de duas contas e isolamento REST de leitura/escrita.');
} finally {
  // Apaga exclusivamente as contas criadas nesta execução; FK elimina fixtures.
  const failures = [];
  for (const account of accounts) {
    const deleted = await admin.auth.admin.deleteUser(account.id);
    if (deleted.error) failures.push(account.id);
  }
  assert.equal(failures.length, 0, 'Limpeza das contas fictícias falhou. Revise o laboratório.');
}
