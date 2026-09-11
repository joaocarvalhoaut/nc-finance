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
1. Aplicar migrations em ambiente de teste. A nova migration é aditiva e não modifica registros financeiros existentes.
2. Executar supabase/tests/security-isolation.sql no banco de teste com psql -v ON_ERROR_STOP=1. Validar também duas sessões concorrentes reservando a mesma chave: somente uma deve retornar true. O teste SQL entregue cobre isolamento e repetição, não simula concorrência real.
3. Conferir existência do RPC check_rate_limit e WHATSAPP_INBOUND_SECRET na nuvem e a configuração correspondente no provedor. Sem esses pré-requisitos as proteções bloqueiam operações.
4. Conferir MFA, confirmação de e-mail, recuperação de conta e URLs de redirecionamento no painel Supabase. Não ativar MFA obrigatório sem fluxo de cadastro e recuperação testado. O config.toml local não comprova estado de produção.
5. Revisar PR e CI. Aplicar a migration em produção antes de publicar send-whatsapp-charge, send-whatsapp-batch e process-dispatch-jobs. Publicar também whatsapp-inbound e os consumidores de rateLimit alterado (create-checkout-session e match-drive-files).
6. Publicar frontend somente após validação visual desktop/mobile e fluxos autenticados em staging. Não usar cobrança real como teste.

## Limitações ainda abertas
- Sem autenticação administrativa Supabase nesta sessão: migration, RLS real, MFA e configurações de nuvem não verificados.
- Teste SQL executado com sucesso em PostgreSQL em memória (PGlite), com schema base, nova migration e duas contas fictícias. Auth é uma fixture; isso não valida todas as migrations nem a configuração de produção. Docker ainda indisponível: stack Supabase completa e corrida entre conexões permanecem pendentes. Instruções em tools/local-lab/README.md.
- qs fixado em 6.16.0 por override, após teste HTTP do parsing do Express, JSON válido/inválido e regressões das vulnerabilidades. npm install retornou zero vulnerabilidades. Revisar a necessidade do override quando Express incorporar a versão corrigida.
- Teste de concorrência preparado no CI com PostgreSQL 15 descartável: comprova disputa de lock entre duas conexões e exige um único vencedor para reserva nova e expirada. Consultar o resultado do CI antes de considerar a validação concluída.
- Reserva usa a chave e janela existentes: não garante exactly-once após timeout prolongado, nem corrige diferenças de geração de chave entre caminhos. Exige reconciliação com o provedor antes de evoluir retries.
- Reserva retém linhas expiradas; planejar limpeza periódica após prazo de investigação aprovado.
- A navegação foi melhorada preservando áreas; o menu agora tem cinco áreas principais e subopções contextuais. A decomposição completa do App.tsx ainda requer uma etapa maior com testes autenticados.
- Onboarding completo, demonstração real, revisão individual de boleto e novos testes end-to-end de webhooks permanecem pendentes; não foram simulados como concluídos.
- O código existente monta URLs públicas de boletos: acesso e política de Storage precisam de auditoria separada antes de prometer sigilo desses arquivos.

## Reversão
Reverter o frontend ao deploy anterior se necessário. Para funções, restaurar a versão anterior somente após avaliar se reabre proteção conhecida. A tabela nova pode permanecer sem uso; não apagar dados nem remover a migration para reverter código. Manter a main sem alterações até os pré-requisitos estarem comprovados.

## Runtime
O pdfjs-dist instalado exige Node >=22.13. O CI anterior usava Node 20; atualizado para Node 24, usado também na validação local. Conferir runtime do build na Vercel antes de publicar.
