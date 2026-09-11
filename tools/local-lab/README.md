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

## Supabase completo (requer Docker)

O Docker não estava instalado quando este ambiente foi preparado.
O dispositivo tem virtualização habilitada no firmware, mas o hipervisor não
estava ativo e `wsl --version` não retornou uma versão moderna. A instalação ou
atualização do WSL pode exigir reinicialização. Não reiniciar durante uso do
servidor. Consulte https://docs.docker.com/desktop/setup/install/windows-install/.
Após instalar e iniciar Docker Desktop, executar:

1. `npm run lab:prepare`
2. Dentro de `.local/ncfinance-lab`, executar `npx supabase@2.117.0 start`.

CLI 2.117.0 preparado e configuração lida nesta máquina. WSL e
VirtualMachinePlatform habilitados em 10/09/2026, com reinicialização pendente.
A stack só pode ser validada após o Docker estar em execução.

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
