# Estado do projeto — NC Finance

Documento de contexto para retomar o projeto em qualquer máquina/sessão.
Consolida o que está no ar, o que está pendente e as regras de trabalho.
_Não contém segredos._ Atualizado: 2026-08-31.

## Visão geral
SaaS brasileiro de **cobrança automatizada por WhatsApp** para inadimplência.
Multi-tenant, dados financeiros de terceiros → privacidade/segurança em 1º lugar.
Repo: github.com/joaocarvalhoaut/nc-finance · Site: https://ncfinance.com.br

## Stack e infra
- **Front:** React 19 + Vite 6 + TS (SPA). Tailwind v4 (CSS-based). motion/react, lucide-react.
- **Back:** Supabase — Postgres + RLS + Auth + Edge Functions (Deno) + Storage. Prod ref: `hiabmnyyxbedtkigcjdx`. Staging ref: `bditssmvqhdfzyyhbbuu`.
- **Hosting:** Vercel (auto-deploy no push da `main`).
- **Integrações:** Stripe (billing), Z-API (WhatsApp atual), Resend (SMTP do Supabase Auth), Google Drive/Sheets, Short.io, Sentry (no-op sem DSN), PostHog (analytics opt-in).

## Regras de trabalho (inegociáveis)
1. **Sempre commitar E deployar** após alterar código. Commits terminam com a linha `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
2. **Frontend** sobe no Vercel automático no push da `main`.
3. **Edge Functions** (`supabase/functions/**`) NÃO sobem pelo Vercel — deploy manual: `npx supabase functions deploy <nome> --project-ref hiabmnyyxbedtkigcjdx` (deployar todas que importam um `_shared/` alterado).
4. **Migrations:** entregar o SQL para o usuário rodar no **SQL Editor** (precisa da senha do banco).
5. **Segredos nunca no front nem no git.** `.env` é gitignored; credenciais só em Edge Functions.
6. **RLS é a base da segurança.** Tudo depende de `auth.uid()`.

## Qualidade / CI
- `.github/workflows/ci.yml` roda em push/PR: `npm run lint` (tsc), `npm run test:parser` (47), `npm run test:shared` (54: formatBRL, telefone, opt-out, sanitize), `npm run build`.
- Branch protection na `main` com bypass p/ admin (dev solo empurra direto; CI roda mas não bloqueia).

## O que está NO AR (feito)
- Produto funcional completo; cobrança via **Z-API**.
- Segurança/compliance: rate limit, índices de escala, headers+CSP, RLS auditada (24/24 tabelas), LGPD (aviso cookies, exclusão de conta, export de dados, audit log), opt-out do devedor (`user_do_not_contact` + webhook `whatsapp-inbound` detecta "PARE"), ritmo anti-ban.
- **Antifraude** (ago/2026): aviso de responsabilidade ao anexar boleto (`BoletoResponsibilityModal`); KYC de CPF (dígito verificador no form + `authService`, `src/utils/cpf.ts`); guarda anti-abuso nas Edge Functions de envio (bloqueia `conta_em_revisao` com ≥20% opt-out por resposta e ≥20 cobranças).
- **PostHog** analytics opt-in com privacidade máxima (`src/lib/analytics.ts`): só liga após consentimento, autocapture off, replay 100% mascarado, rede anti-PII. Toggle em Minha Conta.
- UX recentes: olhinho mostrar/ocultar senha; "Ver Mensagem" no histórico reconstrói o texto (valor/documento mascarados); barra CTA mobile aparece ao rolar.

## PENDÊNCIAS (a maioria trava no CNPJ)
> O usuário **não tem CNPJ** e não cabe no MEI (software fora da lista) → precisa abrir **ME com contador**. Isso destrava 3 frentes de uma vez:

1. **Stripe Test→Live** (cobrar assinaturas): aprovar KYC da Stripe; criar produtos/preços Live; webhook Live (`https://hiabmnyyxbedtkigcjdx.supabase.co/functions/v1/stripe-webhook`); atualizar secrets Supabase (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 3 `STRIPE_*_PRICE_ID`) e env Vercel (`VITE_STRIPE_*`); **redeploy** do front.
2. **WhatsApp Cloud API (oficial Meta):** motor pronto e commitado, não ligado. Conta Meta/app/WABA/número de teste criados (app_id 1419472876947534); integração comprovada, mas envio real dá erro **130497** (conta restrita p/ BR até **Verificação do Negócio**, que exige CNPJ). Guia de virada: `MIGRACAO-WHATSAPP-CLOUD.md`. Arquivos: `_shared/whatsappCloud.ts`, `_shared/whatsappProvider.ts` (flag `WHATSAPP_PROVIDER=zapi|cloud`), `whatsapp-cloud-webhook/`.
3. **KYC forte com CNPJ verificado** na Receita (antifraude nível 2).

Outras pendências (não dependem de CNPJ):
- **Supabase tier Pro** p/ backup diário + PITR (hoje produção no Free, sem backup gerenciado — risco com clientes). Ver `BACKUP.md`.
- Webhook Z-API apontando p/ `whatsapp-inbound` + secret `WHATSAPP_INBOUND_SECRET` (ativa opt-out automático).
- **Sentry:** criar projeto + `VITE_SENTRY_DSN` na Vercel + redeploy.
- Próximos antifraude: suspensão persistente (flag `under_review` → precisa migração) + painel admin; MFA no login.

## Notas de arquitetura úteis
- **WhatsApp por trás de flag de provider:** `_shared/zapi.ts` (atual) e `_shared/whatsappCloud.ts` (Cloud, pronto) têm o mesmo shape de retorno. Virar via `WHATSAPP_PROVIDER=zapi|cloud`. Rollback = voltar a secret (sem redeploy).
- **Match de boletos do Drive** casa poucos de propósito (match estrito p/ nunca anexar boleto errado); baixa cobertura = pasta sem PDFs individuais casáveis, não é bug. Tabela `user_drive_index`, threshold 0.70.
- **Preview no Claude Code:** a sessão costuma ser rooteada em `Documents\New project`, mas o projeto é `Downloads\nc-finance`. Existe um config `nc-finance` (porta 3000) no `launch.json` da pasta primária que serve o **build** (não dev) — rodar `npm run build` e reiniciar o preview p/ refletir mudanças.

## Setup em máquina nova
Ver `ROTACAO-SECRETS.md` (montar `.env` do zero pelos painéis) e:
`git clone` → `npm install` → montar `.env` (a partir de `.env.example`) → `npm run build` → `npx supabase login` + `npx supabase link --project-ref hiabmnyyxbedtkigcjdx`.
Produção (Vercel+Supabase) é nuvem — não depende da máquina.

---
_Existe um projeto separado (Magazine Guimarães, e-commerce na Cloudflare) cujo estado NÃO está aqui — vive em outra pasta/repo e nas memórias locais do Claude Code._
