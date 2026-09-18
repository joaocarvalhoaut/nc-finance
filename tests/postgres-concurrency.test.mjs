import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Somente serviço descartável de CI. Não lê .env nem aceita URL externa.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Execute este teste no serviço PostgreSQL descartável do CI.');
const config = { host: '127.0.0.1', port: 5432, database: 'ncfinance_test', user: 'postgres', password: 'local-ci-only', connectionTimeoutMillis: 5000, statement_timeout: 10000 };
const admin = new pg.Client(config);
const first = new pg.Client(config);
const second = new pg.Client(config);
try {
  await admin.connect();
  assert.equal((await admin.query("select count(*)::int n from information_schema.tables where table_schema in ('public','auth')")).rows[0].n, 0, 'Banco precisa estar vazio.');
  await admin.query('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  await admin.query(await readFile(new URL('../supabase/migrations/20260910120000_atomic_send_reservation.sql', import.meta.url), 'utf8'));
  const user = '10000000-0000-4000-8000-000000000001';
  await admin.query('insert into auth.users values ($1)', [user]);
  await first.connect();
  await second.connect();
  await first.query('set role service_role');
  await second.query('set role service_role');
  const pid = (await second.query('select pg_backend_pid() pid')).rows[0].pid;
  const reserve = 'select public.reserve_charge_send($1,$2) acquired';
  for (const expired of [false, true]) {
    const key = (expired ? 'b' : 'a').repeat(64);
    if (expired) await admin.query("insert into public.charge_send_reservations values ($1,$2,now()-interval '1 minute')", [user, key]);
    await first.query('begin');
    assert.equal((await first.query(reserve, [user, key])).rows[0].acquired, true);
    const competing = second.query(reserve, [user, key]);
    // Attach a handler immediately so a timeout cannot become unhandled.
    const outcome = competing.then(result => ({ result }), error => ({ error }));
    let blocked = false;
    for (let i = 0; i < 80; i++) {
      blocked = (await admin.query('select cardinality(pg_blocking_pids($1)) > 0 blocked', [pid])).rows[0].blocked;
      if (blocked) break;
      await delay(50);
    }
    assert.equal(blocked, true, 'A segunda conexão deve disputar o lock da primeira.');
    await first.query('commit');
    const result = await outcome;
    if (result.error) throw result.error;
    assert.equal(result.result.rows[0].acquired, false);
  }
  console.log('PASS: duas conexões reais; apenas uma reserva nova ou expirada é adquirida.');
} finally {
  await Promise.allSettled([first.end(), second.end(), admin.end()]);
}
