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

- **Importação de arquivos** (`src/services/localDocumentExtraction/`, 100% no navegador, nada sai
  dele): `leitores.ts` lê cada formato (Excel/ODS com tipos reais, CSV/TXT com detecção de
  Windows-1252, PDF com colunas reconstruídas pela posição em `layout.ts`, PDF escaneado e foto por
  OCR em `ocr.ts`); `tableInterpreter.ts` mapeia colunas por título + conteúdo; `index.ts` compara a
  leitura em tabela com as heurísticas de texto (`heuristics.ts`) e fica com a melhor. O OCR
  (tesseract) é servido de `/ocr`, copiado de node_modules por `tools/ocr-assets.mjs` no dev/build
  (gitignored) — por isso o CSP tem `'wasm-unsafe-eval'`. Não apontar o OCR para CDN.

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
  Pix nas faturas depende da verificação da conta Asaas + chave Pix (em andamento).
- Planos: R$ 149 / 197 / 297 (`_shared/billingPlans.ts`, fonte única — landing lê de lá). Cobrem a
  instância Z-API (~R$ 90/cliente). Todo plano usa o número do próprio cliente.
- WhatsApp por conta: "Conectar WhatsApp" cria a instância pela API de parceiro da Z-API
  (`_shared/zapiProvisioning.ts`); assina ao conectar, cancela quando a assinatura acaba
  (verificação diária no run-automation-scheduler). Falta o usuário entrar no programa Partner
  e gravar `ZAPI_PARTNER_TOKEN`; até lá, instância manual via formulário de suporte (e-mail do cliente).
- PostHog: **ativo**. A `VITE_POSTHOG_KEY` esta no Vercel desde 25/08/2026, mas o CSP
  nao liberava `us.i.posthog.com` — a lib inicializava e o navegador descartava todo
  evento, em silencio. Corrigido no `vercel.json` e no `server.ts`. Ao mexer no CSP,
  lembre que o session replay carrega o gravador de `us-assets.i.posthog.com`, entao
  esse host precisa do `script-src` alem do `connect-src`.
