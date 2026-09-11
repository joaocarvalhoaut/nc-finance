import { mkdir, writeFile, readFile, copyFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = path.join(root, '.local', 'ncfinance-lab', 'supabase');
await mkdir(path.join(target, 'migrations'), { recursive: true });
for (const dir of [path.dirname(target), target]) {
  if ((await readdir(dir)).some(name => name === 'env' || name.startsWith('.env'))) {
    throw new Error('O laboratório contém arquivo de ambiente. Revise-o antes de continuar.');
  }
}
try {
  await access(path.join(target, '.temp', 'project-ref'));
  throw new Error('Laboratório vinculado a projeto remoto; preparação recusada.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
// Diretório dedicado; nunca copia .env, .temp, funções nem secrets.
await writeFile(path.join(target, 'config.toml'), `project_id = "ncfinance-isolated-lab"
[api]
enabled = true
port = 55321
schemas = ["public", "graphql_public"]
[db]
port = 55322
shadow_port = 55320
major_version = 15
[studio]
enabled = true
port = 55323
[local_smtp]
enabled = true
port = 55324
[auth]
enabled = true
site_url = "http://127.0.0.1:5300"
[analytics]
enabled = false
[edge_runtime]
enabled = false
`);
for (const name of ['20260520193000_account_based_phase3.sql', '20260910120000_atomic_send_reservation.sql']) {
  await copyFile(path.join(root, 'supabase', 'migrations', name), path.join(target, 'migrations', name));
}
await copyFile(path.join(root, 'supabase', 'tests', 'security-isolation.sql'), path.join(target, 'security-isolation.sql'));
await writeFile(path.join(target, 'seed.sql'), '-- Sem dados reais. Os testes criam fixtures dentro de transação e fazem rollback.\n');
const config = await readFile(path.join(target, 'config.toml'), 'utf8');
if (config.includes('hiabmnyyxbedtkigcjdx')) throw new Error('Configuração de produção recusada.');
console.log('Laboratório preparado em .local/ncfinance-lab. Docker necessário para iniciar a stack.');
