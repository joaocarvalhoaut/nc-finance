import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL em memória. Não lê .env, abre portas nem acessa serviços externos.
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to authenticated;
  `);
  // pgcrypto não é usado por esta migration além de gen_random_uuid(), nativo
  // no PostgreSQL desta fixture. O arquivo original permanece intacto.
  const base = await readFile(new URL('../supabase/migrations/20260520193000_account_based_phase3.sql', import.meta.url), 'utf8');
  await db.exec(base.replace('create extension if not exists pgcrypto;', ''));
  await db.exec('grant select, insert, update, delete on all tables in schema public to authenticated;');
  const reservation = await readFile(new URL('../supabase/migrations/20260910120000_atomic_send_reservation.sql', import.meta.url), 'utf8');
  await db.exec(reservation);
  await db.exec(reservation); // Aplicação repetida não deve apagar dados/esquema.
  await db.exec(await readFile(new URL('../supabase/tests/security-isolation.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 0);
  console.log('PASS: migration, isolamento de leitura/escrita, permissões da reserva e rollback.');
  console.log('Escopo: schema base + nova migration. Auth é uma fixture; não é a stack Supabase completa.');
  console.log('Concorrência entre conexões continua pendente: PGlite usa uma conexão.');
} finally {
  await db.close();
}
