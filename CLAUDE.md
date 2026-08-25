# NC Finance — guia para agentes

SaaS brasileiro de **cobrança automatizada** (WhatsApp) para inadimplência.
Multi-tenant, dados financeiros de terceiros → **privacidade e segurança são prioridade**.

## Stack
- **Front:** React 19 + Vite 6 + TypeScript (SPA). Tailwind v4 (CSS-based, sem config). motion/react, lucide-react.
- **Back:** Supabase — Postgres + **RLS** + Auth + **Edge Functions (Deno)** + Storage.
- **Hosting:** Vercel (auto-deploy no push da `main`). Prod ref Supabase: `hiabmnyyxbedtkigcjdx`.
- **Integrações:** Stripe (billing), Z-API (WhatsApp atual), Resend (SMTP auth), Google Drive/Sheets, Sentry, PostHog (analytics opt-in).

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
- `supabase/functions/*` — lógica sensível (envio, webhooks, Stripe). `_shared/*` = helpers reutilizados.
- **WhatsApp por trás de flag de provider:** `_shared/zapi.ts` (atual) e `_shared/whatsappCloud.ts`
  (Cloud API oficial, pronto mas não ligado) têm o mesmo shape de retorno. Trocar via
  `WHATSAPP_PROVIDER=zapi|cloud`. Ver `MIGRACAO-WHATSAPP-CLOUD.md`.

## Quality gate (CI)
`.github/workflows/ci.yml` roda em todo push/PR: `npm run lint` (tsc), `npm run test:parser`
(47 testes), `npm run build`. Não quebrar esses. Rode-os localmente antes de commitar mudança grande.

## Convenções
- Código e comentários em **pt-BR**, seguindo o estilo dos arquivos vizinhos.
- Erros nunca vazam stack/credenciais ao usuário — mensagens sanitizadas.
- UI: cantos podem ser mais quadrados; evitar padrões "cara de IA" (o dono tem taste forte).

## Estado / pendências (ver memória do agente para datas)
- Migração WhatsApp Cloud: motor + webhook prontos; falta conta Meta ativa + template + virar a flag.
- Go-live billing: virar Stripe Test→Live.
- PostHog: definir `VITE_POSTHOG_KEY` no Vercel para ativar.
