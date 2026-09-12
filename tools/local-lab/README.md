# Laboratório local isolado

## Disponível sem Docker

`npm run test:local-db` cria PostgreSQL em memória, aplica o schema base e a
migration de reserva e executa os testes SQL de isolamento. Usa somente duas
contas fictícias e encerra o banco ao terminar. Não lê `.env` ou acessa a nuvem.

Este teste não reproduz todo o Supabase: `auth.users` e `auth.uid()` são fixtures.
Não comprova concorrência entre conexões, nem todas as migrations posteriores.

O CI executa `tests/postgres-concurrency.test.mjs` em um serviço PostgreSQL 15
descartável. O teste observa o bloqueio real entre duas conexões antes de liberar
a primeira transação e verificar que a segunda não adquire a mesma reserva.
Cobre reserva nova e expirada, sem acessar o Supabase de produção.

## Stack Supabase local (schema selecionado)

Validada em 12/09/2026 com Docker Desktop, Docker Engine 29.7.2, WSL 2.7.13
e CLI Supabase 2.117.0. Banco, Auth, API, Storage, Realtime, e-mail local e Studio
iniciaram. Funções e analytics permanecem desativados.
Após iniciar Docker Desktop, executar:

1. `npm run lab:prepare`
2. Dentro de `.local/ncfinance-lab`, executar `npx supabase@2.117.0 start --network-id ncfinance-local-loopback`.

A rede dedicada foi criada com `docker network create --driver bridge --opt
com.docker.network.bridge.host_binding_ipv4=127.0.0.1 ncfinance-local-loopback`.
Nesta instalação o Docker ainda publicou as portas em todas as interfaces.
Por isso o Windows Firewall contém a regra `NCFinance-LocalLab-BlockRemote`,
bloqueando entrada TCP não-loopback nas portas 55321–55324, em todos os perfis.
Os três perfis de firewall estavam ativos na validação. Em outro dispositivo,
configure a proteção local antes de iniciar; a opção da rede não basta aqui.

Studio: http://127.0.0.1:55323 · API: http://127.0.0.1:55321.

## Teste de Auth e REST com duas contas fictícias

Após iniciar a stack, salve a saída JSON de `supabase status -o json` do
laboratório em `.local/ncfinance-lab/status.json`, codificação UTF-8. Este arquivo
contém apenas as credenciais locais e fica ignorado pelo Git. Nunca use a saída
de um projeto remoto. Execute `npm run test:local-auth` na raiz do repositório.

O teste aceita apenas a origem `http://127.0.0.1:55321`, recusa redirects,
cria duas contas fictícias e valida login, leitura, atualização, tentativa de
inserção em nome de outra conta e acesso ao RPC administrativo. Ao terminar,
remove somente as contas criadas naquela execução e seus registros associados.
Não testa envio a provedores nem substitui a revisão visual autenticada.

O projeto gerado não contém `.env`, credenciais de produção, funções, cron jobs ou vínculo
com produção. Contém apenas migrations selecionadas para os testes de segurança.
Não é ainda um espelho funcional completo do NC Finance. Não execute `link`,
`db push` ou comandos com o Project Ref de produção neste laboratório.

O frontend habitual ainda pode usar o `.env` de produção. Não use `npm run dev`
para testes de escrita enquanto ele não estiver explicitamente configurado para
o backend local. A fixture `tests/ui-preview.html` não acessa backend.

Antes de ampliar este laboratório para todas as migrations e funções, revisar
se há chamadas externas, jobs agendados e integrações reais. As configurações
locais não devem ser copiadas para produção.
