# Laboratório local isolado

## Disponível sem Docker

`npm run test:local-db` cria PostgreSQL em memória, aplica o schema base e a
migration de reserva e executa os testes SQL de isolamento. Usa somente duas
contas fictícias e encerra o banco ao terminar. Não lê `.env` ou acessa a nuvem.

Este teste não reproduz todo o Supabase: `auth.users` e `auth.uid()` são fixtures.
Não comprova concorrência entre conexões, nem todas as migrations posteriores.

## Supabase completo (requer Docker)

O Docker não estava instalado quando este ambiente foi preparado.
Após instalar e iniciar Docker Desktop, executar:

1. `npm run lab:prepare`
2. Dentro de `.local/ncfinance-lab`, executar `npx supabase start`.

O projeto gerado não contém `.env`, credenciais, funções, cron jobs ou vínculo
com produção. Contém apenas migrations selecionadas para os testes de segurança.
Não é ainda um espelho funcional completo do NC Finance. Não execute `link`,
`db push` ou comandos com o Project Ref de produção neste laboratório.

O frontend habitual ainda pode usar o `.env` de produção. Não use `npm run dev`
para testes de escrita enquanto ele não estiver explicitamente configurado para
o backend local. A fixture `tests/ui-preview.html` não acessa backend.

Antes de ampliar este laboratório para todas as migrations e funções, revisar
se há chamadas externas, jobs agendados e integrações reais. As configurações
locais não devem ser copiadas para produção.
