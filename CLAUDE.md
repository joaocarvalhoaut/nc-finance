# NC Finance — guia para agentes

SaaS brasileiro de **cobrança automatizada** (WhatsApp) para inadimplência.
Multi-tenant, dados financeiros de terceiros → **privacidade e segurança são prioridade**.

## Stack
- **Front:** React 19 + Vite 6 + TypeScript (SPA). Tailwind v4 (CSS-based, sem config). motion/react, lucide-react.
- **Back:** Supabase — Postgres + **RLS** + Auth + **Edge Functions (Deno)** + Storage.
- **Hosting:** Vercel (auto-deploy no push da `main`). Prod ref Supabase: `hiabmnyyxbedtkigcjdx`.
- **Integrações:** Asaas (billing — Pix, boleto, cartão), Z-API (WhatsApp atual), Resend (SMTP auth), Google Drive/Sheets, Sentry, PostHog (analytics opt-in).

## Regras inegociáveis
1. **Segredos nunca no front nem no git.** `.env` é gitignored. Credenciais de provider só em Edge Functions (service_role). O browser nunca recebe token.
2. **RLS é a base da segurança multi-tenant.** Tudo depende de `auth.uid()`. Não contornar.
3. **Deploy de Edge Functions é via Supabase CLI**, não Vercel:
   `npx supabase functions deploy <nome> --project-ref hiabmnyyxbedtkigcjdx`
4. **Migrations:** entregar o SQL para o usuário rodar no SQL Editor (precisa da senha do banco).
5. **Sempre commitar E deployar** após alterar código. Commits terminam com
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
6. **Privacidade:** logs guardam telefone mascarado e preview de mensagem — nunca PII crua.
   Analytics (PostHog) é opt-in e sem PII (ver `src/lib/analytics.ts`).

## Arquitetura (monólito modular)
- `src/services/*` — camada de serviço do front (auth, cobrança, billing, drive…). Fronteiras claras.
- `supabase/functions/*` — lógica sensível (envio, webhooks, cobrança da assinatura). `_shared/*` = helpers reutilizados.
- **WhatsApp por trás de flag de provider:** `_shared/zapi.ts` (atual) e `_shared/whatsappCloud.ts`
  (Cloud API oficial, pronto mas não ligado) têm o mesmo shape de retorno. Trocar via
  `WHATSAPP_PROVIDER=zapi|cloud`. Ver `MIGRACAO-WHATSAPP-CLOUD.md`.
- **Landing pré-renderizada (SEO + GEO):** o `npm run build` gera o HTML da landing no `index.html`
  (robôs de IA não executam JS), mais JSON-LD, `/llms.txt` e `sitemap.xml` — ver
  `tools/prerender-landing.mjs`. Fonte única do texto: `src/content/landing.ts` (passos, diferenciais,
  perguntas) e `src/config/plans.ts` (planos). Só prometer o que o código faz. A `LandingPage` não pode
  usar `window`/`document` fora de efeitos. `public/session-hint.js` esconde o HTML pré-renderizado
  para quem já tem sessão salva.
  **Guias** (`/guias/<slug>`, 12/11/2026): conteúdo em `src/content/guias.ts`, HTML estático sem JS
  gerado por `tools/guias-html.mjs` (Article + Breadcrumb + FAQ em JSON-LD), entram no sitemap e no
  llms.txt. Resposta direta no `resumo`; lei sempre com artigo; produto só o que o código faz.
  **404 de verdade** (12/11/2026): o `vercel.json` não tem mais rewrite catch-all — o app só vive em
  `/` (retornos do Asaas e do Supabase usam `?query`/`#hash`). Caminho inexistente recebe
  `dist/404.html` (noindex, gerado no prerender) com status 404; `server.ts` faz o mesmo.
  Rota nova no app por caminho? Precisa de rewrite explícito para ela.

- **Importação de arquivos** (`src/services/localDocumentExtraction/`, 100% no navegador, nada sai
  dele): `leitores.ts` lê cada formato (Excel/ODS com tipos reais, CSV/TXT com detecção de
  Windows-1252, PDF com colunas reconstruídas pela posição em `layout.ts`, PDF escaneado e foto por
  OCR em `ocr.ts`); `tableInterpreter.ts` mapeia colunas por título + conteúdo; `index.ts` compara a
  leitura em tabela com as heurísticas de texto (`heuristics.ts`) e fica com a melhor. O OCR
  (tesseract) é servido de `/ocr`, copiado de node_modules por `tools/ocr-assets.mjs` no dev/build
  (gitignored) — por isso o CSP tem `'wasm-unsafe-eval'`. Não apontar o OCR para CDN.

- **Importar telefones** (`src/services/importarTelefones.ts` + `components/ImportarTelefones.tsx`, no
  navegador): agenda `.vcf` (iPhone `item1.TEL`, Android quoted-printable) ou planilha (colunas achadas
  por título ou conteúdo). Casa com a carteira pelo nome (`contactKeyFromName`): exato já vem marcado;
  "parecido" (2+ palavras = começo do nome do cliente, um só candidato) o usuário confirma. Só troca
  número existente se pedir; contato que não é cliente só vai para `user_contatos` se pedir.

## Quality gate (CI)
`.github/workflows/ci.yml` roda em todo push/PR: `npm run lint` (tsc), `npm run test:parser`
(parser + motor de importação), `npm run build`. Não quebrar esses. Rode-os localmente antes de commitar mudança grande.

## Convenções
- Código e comentários em **pt-BR**, seguindo o estilo dos arquivos vizinhos.
- Erros nunca vazam stack/credenciais ao usuário — mensagens sanitizadas.
- UI: cantos podem ser mais quadrados; evitar padrões "cara de IA" (o dono tem taste forte).

## Estado / pendências (ver memória do agente para datas)
- Migração WhatsApp Cloud: motor + webhook prontos; falta conta Meta ativa + template + virar a flag.
- Billing: **Asaas em produção** desde 26/10/2026 (a Stripe não verificou a conta; código dela
  segue no repo, sem uso). Regra de acesso única em `_shared/billingStatus.ts` (`canUseSubscription`,
  `ACCESS_COLUMNS`) — todo guard usa ela. Contas da Stripe sem assinatura no Asaas valem até
  02/11/2026; `billing_provider = 'cortesia'` libera sem cobrança (conta do dono).
  Conta Asaas verificada em 08/11/2026. Pix nas faturas não precisa de código (assinatura usa
  `billingType: "UNDEFINED"`): aparece quando a conta tem chave Pix cadastrada no painel.
- **Teste grátis só com cartão** (11/11/2026, pedido do dono): 8 dias (`TRIAL_DAYS`/`DIAS_TESTE`) a partir do
  cartão. 1ª assinatura abre o checkout hospedado do Asaas (`createCardTrialCheckout`, `POST /v3/checkouts`,
  só cartão, `RECURRENT`, 1ª cobrança em hoje+8): o cartão nunca passa por nós. Linha pendente = asaas +
  `asaas_customer_id` + sem `asaas_subscription_id`; `vincularAssinaturaDoCheckout` liga a assinatura ativa
  do cliente (webhook CHECKOUT_*/SUBSCRIPTION_CREATED, volta `?checkout=success` ou "sync" do polling) e grava
  `trial_start` só aí — quem desiste do checkout segue com direito ao teste. Sem cartão, sem teste.
  A documentação do Asaas não deixa claro se cobra só no vencimento: confirmar com cartão real.
- Planos: R$ 149 / 197 / 297 (`_shared/billingPlans.ts`, fonte única — landing lê de lá). Cobrem a
  instância Z-API (~R$ 90/cliente). Todo plano usa o número do próprio cliente.
- WhatsApp por conta: "Conectar WhatsApp" cria a instância pela API de parceiro da Z-API
  (`_shared/zapiProvisioning.ts`); assina ao conectar, cancela quando a assinatura acaba
  (verificação diária no run-automation-scheduler). Falta o usuário entrar no programa Partner
  e gravar `ZAPI_PARTNER_TOKEN`; até lá, instância manual via formulário de suporte (e-mail do cliente).
  **Aviso do primeiro uso** (11/11/2026, pedido do dono): conta sem número conectado vê uma vez
  (`ncf-aviso-conectar-v1:<userId>` no localStorage) o `AvisoConectarNumero` — chamar o suporte no
  WhatsApp (77) 98137-6867, conexão em até 24 h. Contato em `src/content/landing.ts`
  (`CONTATO_WHATSAPP*`); links abrem a conversa direto por `utils/abrirWhatsapp.ts`.
- **Boleto:** só anexado um a um (upload do PDF → Storage `charge-pdfs`, `drive_file_id = 'uploaded'`),
  enviado como link na mensagem. A busca/sugestão de boletos pelo Google Drive saiu da interface em
  30/10/2026 a pedido do dono e os envios ignoram sugestão do Drive; as Edge Functions de Drive
  (`match-drive-files`, `drive-index-folder`, `drive-import-boleto`) e os services seguem no repo, sem uso.
- **Título único = documento + cliente + vencimento** (pedido do dono, 06/11/2026): não pode existir
  duas vezes. Regra em `src/utils/tituloUnico.ts` — documento comparado só pelos números
  ("DP 1439/005" = "1439/005"), nome sem caixa/acento. Importação descarta repetidos e atualiza o que
  já está na carteira (`alinharComCarteira` no App, que também dá baixa do relatório de pagos no título
  aberto de mesmo doc + cliente); cadastro manual recusa; Carteira mostra repetidos antigos e arquiva
  as cópias (fica a paga ou a mais recente). Google Sheets usa a mesma regra
  (`supabase/functions/_shared/tituloUnico.ts`, cópia da do front). Edição direta na Carteira é livre
  (decisão do dono). No banco: constraint `uq_urf_user_doc_cliente_venc`
  (migration `20261106120000`, valores exatos); `createMany` cai na chave antiga se ela não rodou.
- **Proteção do número contra bloqueio** (pedido do dono, feito em 04–05/11/2026). A Meta não publica
  teto para o WhatsApp comum (Z-API): o bloqueio vem de denúncias, pico de volume e envio para quem
  nunca falou com o número.
  - **Aquecimento + limite diário da conta**, em todo envio (um por um, lote, automação) e todo plano.
    Regras puras em `_shared/protecaoNumero.ts` (etapas 30/50/80/120/200 nos dias 1–3/4–7/8–14/15–21/22–30;
    vale o menor entre aquecimento e limite da conta; conta MENSAGENS — títulos juntos = 1).
    **Aquecimento é opcional** (desligado por padrão; o usuário liga "Meu número é novo" — pedido do dono).
    Servidor: `_shared/limiteDiario.ts` (`lerSituacaoDoDia`, fail-open, grava `aquecimento_inicio` no
    1º envio após ligar). Colunas em `user_configuracoes` (migrations `20261105120000_protecao_numero.sql`
    e `20261105150000_aquecimento_opcional.sql`).
    Ajuste em Configurações › Proteção do número (`ProtecaoNumeroCard`). Lote: excedente volta como
    `limite_do_dia`; automação: o scheduler divide as vagas entre as regras e o worker marca `blocked_limit`.
  - **Aviso de risco** (`AvisoBloqueioNumero`) na barra da Carteira e no modal do lote, com quantas
    ainda saem hoje; aviso no formulário de regra de automação.
- **CAPTCHA no login/cadastro/recuperação** (Cloudflare Turnstile, 09/11/2026): `components/Turnstile.tsx`,
  token vai em `options.captchaToken` do Supabase Auth. Só aparece com `VITE_TURNSTILE_SITE_KEY`; a chave
  secreta fica no painel do Supabase (Attack Protection). **Ordem:** chave pública no ar ANTES de ligar o
  CAPTCHA no Supabase, senão ninguém entra. CSP libera `challenges.cloudflare.com` (script + frame).
  **Ligado em produção em 09/11/2026** (chave na Vercel + secret no Supabase; login testado pelo dono).
  Caixa sempre visível (`appearance: "always"`): com "interaction-only" ela sumia e o login travava calado.
  Senha mínima: 8 caracteres (cadastro, recuperação e troca).
- **Vencimento em fim de semana/feriado** (Lei 7.089/1983, 12/11/2026): até o 1º dia útil seguinte
  o título não corre multa nem juros; depois, o atraso conta do vencimento original. Regra pura em
  `_shared/diasUteis.ts` (feriados nacionais + Carnaval, Sexta Santa, Corpus Christi; sem
  estaduais/municipais), usada por `_shared/encargos.ts` e pelo painel (`App.tsx`).
- **Tipos novos (10/11/2026):** `em_negociacao` (corre multa/juros, mas fica fora de lote, "Enviar
  todos" e automação — só envio um a um) e `pago_banco` (conta como pago/recuperado, nunca cobrado).
  Regras em `src/config/categories.ts` (`estaPago`, `bloqueiaCobranca`, `foraDoLote`, `correEncargos`);
  no servidor `FORA_DO_LOTE` em `_shared/agrupamento.ts` e `COM_ENCARGOS` em `_shared/encargos.ts`.
  Sem CHECK no banco: tipo novo não precisa de migration.
- **Cobradores (10/11/2026, pedido do dono):** quem cobra cada devedor. **Cobrador ≠ representante**
  (o dono corrigiu: a 1ª versão usou `user_representantes`). Tabela `user_cobradores`, coluna
  `cobrador_id` no título e na regra (migration `20261110150000`; trigger exige cobrador da mesma
  conta). Representante/Responsável (`representativeId`, `repFilter`, modal "Responsáveis") segue
  como era. Carteira tem abas Geral / uma por cobrador / Sem cobrador (`cobradorFiltro`, vale também
  em Preparar envios); coluna Cobrador na tabela; cadastro, Importar e importação guiada escolhem
  "Quem vai cobrar"; seleção tem "Passar para cobrador". Excluir cobrador: títulos ficam sem cobrador
  (set null), regras dele saem (cascade). `createMany` não manda `representative_id`/`cobrador_id`
  quando nenhum título do lote tem: reimportar não apaga.
- Bucket `charge-pdfs`: público para o link do boleto, mas SELECT em `storage.objects` só do dono
  (migration `20261109120000`) — antes qualquer um listava os boletos de todos.
- **Tokens da Z-API no Supabase Vault** (09/11/2026): `token`/`client_token` de `user_zapi_config` e
  `platform_integrations` vão para o Vault por trigger (`zapi_tokens_para_vault`); a tabela guarda
  `token_secret_id`/`client_token_secret_id`. Leitura só por `_shared/zapiSegredos.ts` → RPC
  `zapi_abrir_segredos` (service_role, só segredos `zapi:`). Etapa 1 (`20261109150000`) rodou e o envio
  foi testado. Etapa 2 (`20261109160000`) **rodou** e o envio foi testado: o texto puro foi apagado e
  ler `token` direto da tabela devolve null — sempre passar por `abrirTokens`.
- PostHog: **ativo**. A `VITE_POSTHOG_KEY` esta no Vercel desde 25/08/2026, mas o CSP
  nao liberava `us.i.posthog.com` — a lib inicializava e o navegador descartava todo
  evento, em silencio. Corrigido no `vercel.json` e no `server.ts`. Ao mexer no CSP,
  lembre que o session replay carrega o gravador de `us-assets.i.posthog.com`, entao
  esse host precisa do `script-src` alem do `connect-src`.
- **Meta Ads** (11/11/2026): Pixel no navegador (`src/lib/metaPixel.ts`, precisa `VITE_META_PIXEL_ID` na Vercel)
  e API de Conversões no servidor (`_shared/metaCapi.ts`, secrets `META_PIXEL_ID` + `META_CAPI_TOKEN`). Os dois
  só com "Aceitar" no banner de cookies (`user_metadata.consentimento_marketing`). Eventos: CompleteRegistration
  (cadastro), InitiateCheckout, StartTrial (cartão cadastrado, eventID `trial-<userId>` nos dois lados) e
  Subscribe (1ª mensalidade paga, em `syncAsaasSubscription`). Origem da visita (utm_*, fbclid → fbc, 1º toque)
  em `src/lib/origemVisita.ts`, vai para `user_metadata.origem` no cadastro. CSP libera `connect.facebook.net`
  (script + connect) e `www.facebook.com` (connect).
