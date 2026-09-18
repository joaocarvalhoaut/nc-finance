# Revisão de segurança e experiência — 10/09/2026

## Preparado neste branch
- Opt-out falha bloqueando envio; limitador falha bloqueando temporariamente.
- Webhook inbound recusa ausência de segredo.
- Reserva atômica por chave existente, válida por cinco minutos, antes de chamadas ao provedor. Dry-run não reserva. Reserva permanece em falha/timeout para reduzir repetição quando o resultado é incerto.
- Consentimento pode ser reativado; sanitização recursiva e URLs limitadas à origem; replay desativado.
- Menu operável por toque/teclado, nomes mais claros mantendo todas as áreas existentes; indicação de etapas e revisão antes do envio.
- Remoção de percentuais comerciais sem evidência e de afirmação sobre infraestrutura oficial não comprovada.
- Carregamento sob demanda de áreas secundárias.
- Testes de regressão de proteções e leitura de arquivos PDF/XLSX gerados em memória.

## Sequência obrigatória de implantação
1. Aplicar migrations em ambiente de teste. As migrations novas criam a reserva e restringem quatro RPCs administrativos a service_role, sem modificar registros financeiros existentes.
2. Executar supabase/tests/security-isolation.sql no banco de teste com psql -v ON_ERROR_STOP=1. Validar também duas sessões concorrentes reservando a mesma chave: somente uma deve retornar true. O teste SQL entregue cobre isolamento e repetição, não simula concorrência real.
3. Conferir existência do RPC check_rate_limit e WHATSAPP_INBOUND_SECRET na nuvem e a configuração correspondente no provedor. Sem esses pré-requisitos as proteções bloqueiam operações.
4. Conferir MFA, confirmação de e-mail, recuperação de conta e URLs de redirecionamento no painel Supabase. Não ativar MFA obrigatório sem fluxo de cadastro e recuperação testado. O config.toml local não comprova estado de produção.
5. Revisar PR e CI. Aplicar as migrations de reserva e de permissões administrativas em produção antes de publicar send-whatsapp-charge, send-whatsapp-batch e process-dispatch-jobs. Publicar também whatsapp-inbound e os consumidores de rateLimit alterado (create-checkout-session e match-drive-files).
6. Publicar frontend somente após validação visual desktop/mobile e fluxos autenticados em staging. Não usar cobrança real como teste.

## Limitações ainda abertas
- Sem autenticação administrativa do Supabase de produção: migrations aplicadas, RLS, MFA e configurações de nuvem não verificados.
- Em 12/09/2026, Supabase local iniciado com PostgreSQL 15, Auth e REST reais. Testes de duas contas fictícias passaram: login, leitura isolada, bloqueio de atualização/inserção em nome da outra conta e restrição do RPC administrativo. Teste SQL também passou com rollback; limpeza conferida com zero contas/registros de teste restantes. As 31 migrations revisadas foram aplicadas localmente; não estão cobertas todas as telas ou integrações. A corrida entre conexões passou no CI. Instruções em tools/local-lab/README.md.
- qs fixado em 6.16.0 por override, após teste HTTP do parsing do Express, JSON válido/inválido e regressões das vulnerabilidades. npm install retornou zero vulnerabilidades. Revisar a necessidade do override quando Express incorporar a versão corrigida.
- CI do commit e6cf4c1 aprovado, incluindo concorrência em PostgreSQL 15 descartável: disputa real de lock entre duas conexões e um único vencedor para reserva nova e expirada. Execução: https://github.com/joaocarvalhoaut/nc-finance/actions/runs/34552447833
- Navegação da fixture sem backend verificada no navegador: expansão, seleção de Carteira/Importar carteira e recolhimento; também em viewport 390x844. Não equivale a revisão de todas as telas autenticadas.
- Auditoria de nuvem preparada em supabase/tests/cloud-security-audit.sql: somente leitura de RLS, políticas, configuração do bucket e permissões dos RPCs, sem ler registros de clientes ou secrets. Ainda não executada na nuvem.
- Reserva usa a chave e janela existentes: não garante exactly-once após timeout prolongado, nem corrige diferenças de geração de chave entre caminhos. Exige reconciliação com o provedor antes de evoluir retries.
- Reserva retém linhas expiradas; planejar limpeza periódica após prazo de investigação aprovado.
- A navegação foi melhorada preservando áreas; o menu agora tem cinco áreas principais e subopções contextuais. A decomposição completa do App.tsx ainda requer uma etapa maior com testes autenticados.
- Onboarding completo, demonstração real, revisão individual de boleto e novos testes end-to-end de webhooks permanecem pendentes; não foram simulados como concluídos.
- O código existente monta URLs públicas de boletos: acesso e política de Storage precisam de auditoria separada antes de prometer sigilo desses arquivos.

## Reversão
Reverter o frontend ao deploy anterior se necessário. Para funções, restaurar a versão anterior somente após avaliar se reabre proteção conhecida. A tabela nova pode permanecer sem uso; não apagar dados nem remover a migration para reverter código. Manter a main sem alterações até os pré-requisitos estarem comprovados.

## Runtime
O pdfjs-dist instalado exige Node >=22.13. O CI anterior usava Node 20; atualizado para Node 24, usado também na validação local. Conferir runtime do build na Vercel antes de publicar.

## Validação adicional — 12/09/2026
- Quatro RPCs SECURITY DEFINER herdavam execução por anon/authenticated no schema local. A migration 20260912120000 restringe execução a service_role. Não foi aplicada em produção.
- Teste transacional verifica a negação aos clientes e executa as quatro operações como service_role, conferindo seus resultados antes do rollback.
- Frontend isolado disponível via `npm run lab:dev`; HTTP confirmou bloqueio 403 de `.env`, `.local`, `.git` e caminho codificado. CSP restringe conexões ao laboratório. Revisão autenticada completa ainda pendente.

## Teste autenticado de interface — 14/09/2026
- Sessão antiga apresentou JWT issued at future após retomada; logout/login local resolveu. Causa exata não determinada.
- Carteira, configurações, automações, cobranças, preparação e histórico abriram com a conta fictícia. Integrações Edge desativadas; canal indisponível esperado.
- Texto livre de quatro linhas foi recusado com mensagem. Texto tabular com cabeçalho gerou um registro revisável e foi salvo pela interface; leitura no banco confirmou R$ 100,00. Isso não valida todos os formatos anunciados.
- Importação e carteira inspecionadas em viewport 390x844; tabela com rolagem horizontal. Menu abriu com Enter. Rótulos do login aparecem na árvore de acessibilidade; outros campos internos ainda sem nomes acessíveis.
- Conta fictícia e registro financeiro removidos ao encerrar. Não houve cobrança, alteração de produção ou teste real de Stripe/WhatsApp.
- Ainda pendentes: revisão de todas as ações/formulários, acessibilidade dos campos internos, demais telas mobile, fluxos de recuperação/cadastro e integrações em staging.

## Cadastro manual e acessibilidade — validação local
- Rótulos da carteira, cadastro manual e senha confirmados na árvore de acessibilidade. Cadastro vazio bloqueado pelo navegador.
- Data impossível antes chegava ao banco; agora é recusada antes do envio com mensagem em português.
- Corrigido parse de 1.250,00 no cadastro manual: antes parseFloat produzia 1.25; agora grava 1250. Formato brasileiro validado estritamente.
- Cadastro válido e edição do nome executados pela interface e conferidos no banco local. Conta fictícia removida ao terminar. Testes de datas e valores adicionados ao CI.
- Isso não encerra a revisão de todos os formulários, recuperação de senha, cadastro de conta ou integrações.

## Edição de valores na carteira
- Texto digitado separado do valor persistido; centavos não são reinterpretados a cada tecla. Formato brasileiro validado ao sair do campo, passando o valor explicitamente à gravação.
- Nome acessível no campo de valor; aviso visível para valor/data inválidos e falhas de gravação.
- TypeScript e testes de datas/valores passaram. Fluxo interativo desta alteração ainda requer teste no navegador.

## Edição monetária validada no navegador
- Digitação de 1234,56 na carteira e saída com Tab: banco local confirmou 1234.56.
- Texto abc recusado com alerta em português; valor persistido permaneceu 1234.56. Conta fictícia removida ao terminar.
- Ambiente recuperou PostgreSQL após desligamento incompleto. Erro JWT issued at future deixou de ocorrer após reiniciar somente REST local e atualizar assinatura. Não alteradas validações de segurança.
- CI de 43e78c0 aprovado. Permanecem pendentes outros formulários e integrações, conforme seções anteriores.

## Criação de automações — 18/09/2026
- Validação no serviço frontend antes do insert: nome obrigatório, dias inteiros não negativos, limite inteiro de 1 a 500 e janela completa com início anterior ao fim. Sem janela continua permitido.
- TypeScript e testes de formulários passaram. Não modifica regras existentes nem substitui validação no backend/RLS. Teste interativo do formulário ainda pendente.
- Atenção antes da publicação: process-dispatch-jobs compara send_window_start/end em UTC; conferir consistência com horário exibido e scheduler em ambiente de teste. Nenhum envio real executado.

## Fuso das janelas de automação — 18/09/2026
- Scheduler e processador agora usam o contrato UTC-3 da migration do cron; próxima execução às 08h corresponde a 11h UTC. Rótulos da janela explicitam UTC-3.
- Testes de início futuro/passado, meia-noite UTC e virada do ano passaram, junto com TypeScript e regressões de segurança/compilação das funções.
- Antes do deploy, revisar regras existentes: valores podem ter sido ajustados por operadores para compensar a interpretação anterior em UTC. Publicar scheduler e processador na mesma etapa controlada, com fila e regras revisadas. Não houve deploy nem alteração dos horários no banco.
- Offset fixo segue contrato atual da aplicação; mudanças futuras de política de fuso exigem revisão. Testes reais do scheduler/provedor e demais datas de negócio seguem pendentes.

## Decisão de reagendamento — 18/09/2026
- Função de decisão usada pelo worker testada antes, durante e após a janela, incluindo formato SQL HH:MM:SS, fim inclusivo por minuto e madrugada UTC. Próximo início calculado é aceito pela mesma função.
- TypeScript e regressões de segurança/compilação passaram. Teste é de lógica local; não comprova envio real nem execução completa da fila.
- Auditoria somente leitura preparada em supabase/tests/automation-window-audit.sql, com horários das regras e resumo dos jobs pendentes. Ainda não executada na nuvem; acesso autenticado continua necessário.
