# NC Finance — Guia de Deploy em Produção

> **Stack**: React + Vite (Vercel) · Supabase (DB + Auth + Edge Functions) · Stripe · Z-API

---

## 1. Pré-requisitos

| Serviço | O que é preciso |
|---------|----------------|
| **Vercel** | Conta gratuita ou Pro; domínio personalizado opcional |
| **Supabase** | Projeto criado; `SUPABASE_URL` e `SUPABASE_ANON_KEY` disponíveis |
| **Stripe** | Conta ativa; 3 produtos/preços criados (Basic, Pro, Premium); webhook configurado |
| **Z-API** | Instância global criada e conectada a um número WhatsApp |
| **Google Cloud** | Service Account com APIs Sheets + Drive habilitadas |

---

## 2. Variáveis de Ambiente

### 2.1 Frontend — Vercel Environment Variables

Adicione no painel **Vercel → Settings → Environment Variables**:

```env
# Supabase (seguro expor no frontend — são chaves públicas)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Stripe (publishable key — seguro expor)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_BASIC_PRICE_ID=price_...
VITE_STRIPE_PRO_PRICE_ID=price_...
VITE_STRIPE_PREMIUM_PRICE_ID=price_...
```

> ⚠️ **NUNCA** adicione `STRIPE_SECRET_KEY`, `ZAPI_TOKEN`, `GOOGLE_PRIVATE_KEY` ou qualquer chave secreta nas variáveis Vercel. Elas ficam expostas ao navegador.

### 2.2 Backend — Supabase Secrets (Edge Functions)

Configure via CLI:

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_BASIC_PRICE_ID=price_... \
  STRIPE_PRO_PRICE_ID=price_... \
  STRIPE_PREMIUM_PRICE_ID=price_... \
  SITE_URL=https://seu-dominio.vercel.app \
  ZAPI_INSTANCE_ID=<id-da-instancia> \
  ZAPI_TOKEN=<token> \
  ZAPI_CLIENT_TOKEN=<client-token> \
  GOOGLE_CLIENT_EMAIL=nc-finance@projeto.iam.gserviceaccount.com \
  GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvA...\n-----END PRIVATE KEY-----\n" \
  GOOGLE_PROJECT_ID=meu-projeto-gcp \
  GOOGLE_DRIVE_FOLDER_ID=<id-da-pasta-drive> \
  AUTOMATION_CRON_SECRET=$(openssl rand -hex 32) \
  --project-ref <PROJECT_REF>
```

> 💡 Para gerar o `AUTOMATION_CRON_SECRET`: `openssl rand -hex 32`
> 
> 💡 O `GOOGLE_PRIVATE_KEY` deve ter `\n` substituindo as quebras de linha reais ao usar CLI.

---

## 3. Comandos de Deploy

```bash
# 1. Instalar dependências
npm install

# 2. Lint (TypeScript — 0 erros)
npm run lint

# 3. Build de produção (deve completar sem erros)
npm run build

# 4. Aplicar migrations no banco Supabase
npx supabase db push --project-ref <PROJECT_REF>

# 5. Deploy das Edge Functions
npx supabase functions deploy \
  create-checkout-session \
  create-billing-portal-session \
  stripe-webhook \
  record-usage-event \
  send-whatsapp-charge \
  send-whatsapp-batch \
  import-google-sheets \
  match-drive-files \
  run-automation-scheduler \
  process-dispatch-jobs \
  --project-ref <PROJECT_REF>

# 6. Deploy frontend na Vercel (via Git push ou CLI)
vercel --prod
```

---

## 4. Configuração do Stripe Webhook

No Supabase Dashboard → Edge Functions → `stripe-webhook`, copie a URL:

```
https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
```

No Stripe Dashboard → Developers → Webhooks → Add endpoint:
- **URL**: a URL acima
- **Eventos**: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`

Copie o **Webhook Secret** (`whsec_...`) e configure como `STRIPE_WEBHOOK_SECRET`.

---

## 5. Configuração do pg_cron (Automação)

> Requer extensões `pg_cron` e `pg_net` habilitadas no Supabase Dashboard → Database → Extensions.

Após o deploy das Edge Functions e configuração do `AUTOMATION_CRON_SECRET`, execute no SQL Editor do Supabase:

```sql
-- Scheduler: roda uma vez por dia às 08h UTC
SELECT cron.schedule(
  'nc-finance-scheduler',
  '0 8 * * *',
  $$SELECT net.http_post(
    url    := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-automation-scheduler',
    headers:= '{"Authorization":"Bearer <AUTOMATION_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
    body   := '{}'::jsonb
  )$$
);

-- Worker: processa fila a cada 5 minutos
SELECT cron.schedule(
  'nc-finance-worker',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url    := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-dispatch-jobs',
    headers:= '{"Authorization":"Bearer <AUTOMATION_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
    body   := '{}'::jsonb
  )$$
);
```

---

## 6. Configuração do Google Service Account

1. Google Cloud Console → IAM & Admin → Service Accounts → Criar conta
2. Criar chave JSON → copiar `client_email` e `private_key`
3. Habilitar APIs: **Google Sheets API** e **Google Drive API**
4. **Sheets**: compartilhe a planilha do usuário com `GOOGLE_CLIENT_EMAIL` (visualizador)
5. **Drive**: compartilhe a pasta central de boletos com `GOOGLE_CLIENT_EMAIL` (visualizador)
6. Configure `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_PROJECT_ID`, `GOOGLE_DRIVE_FOLDER_ID` nos Supabase Secrets

---

## 7. Configuração do Supabase Auth

No Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://seu-dominio.vercel.app`
- **Redirect URLs**: `https://seu-dominio.vercel.app/**`

Sem isso, o redirect pós-login voltará para `localhost`.

---

## 8. Checklist de Produção

### 8.1 Banco de Dados
- [ ] Migrations aplicadas (`npx supabase db push`)
- [ ] RLS habilitado em todas as tabelas `user_*`
- [ ] Extensões `pgcrypto`, `pg_cron`, `pg_net` habilitadas

### 8.2 Edge Functions
- [ ] Todas as 10 funções deployadas
- [ ] Todos os Secrets configurados (sem valores vazios)
- [ ] Stripe webhook apontando para função correta
- [ ] `AUTOMATION_CRON_SECRET` configurado e igual ao usado no cron.schedule

### 8.3 Vercel
- [ ] Build passou sem erros (`npm run build`)
- [ ] Variáveis de ambiente configuradas (sem chaves secretas)
- [ ] Domínio personalizado (opcional) adicionado no Vercel e no Supabase Auth

### 8.4 Testes funcionais em produção
- [ ] Cadastro/login funciona
- [ ] Trial de 7 dias criado automaticamente
- [ ] Checkout Stripe abre e processa
- [ ] Webhook Stripe atualiza assinatura no banco
- [ ] Envio WhatsApp individual funciona (plano ativo)
- [ ] Envio em lote funciona (plano Pro/Premium)
- [ ] Importação Google Sheets funciona
- [ ] Match Google Drive funciona
- [ ] Automação: regra criada, scheduler cria jobs, worker processa

---

## 9. RLS — Checklist Completo de Isolamento

Todas as tabelas abaixo têm RLS habilitado. Escrita via frontend é autenticada por JWT. Escrita via Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` (nunca exposto).

| Tabela | SELECT | INSERT | UPDATE | DELETE | Escrita Edge Function |
|--------|--------|--------|--------|--------|-----------------------|
| `user_registros_financeiros` | `auth.uid()` | `auth.uid()` | `auth.uid()` | `auth.uid()` | service role |
| `user_representantes` | `auth.uid()` | `auth.uid()` | `auth.uid()` | `auth.uid()` | — |
| `user_logs_cobranca` | `auth.uid()` | `auth.uid()` | `auth.uid()` | `auth.uid()` | service role |
| `user_configuracoes` | `auth.uid()` | `auth.uid()` | `auth.uid()` | — | — |
| `user_message_templates` | `auth.uid()` | `auth.uid()` | `auth.uid()` | `auth.uid()` | — |
| `user_integrations` | `auth.uid()` | `auth.uid()` | `auth.uid()` | `auth.uid()` | — |
| `user_subscriptions` | `auth.uid()` | — | — | — | service role (webhook) |
| `user_usage_counters` | `auth.uid()` | — | — | — | service role |
| `user_google_sheets_config` | `auth.uid()` | — | — | — | service role |
| `user_import_logs` | `auth.uid()` | — | — | — | service role |
| `user_drive_match_logs` | `auth.uid()` | — | — | — | service role |
| `user_automation_rules` | `auth.uid()` | `auth.uid()` | `auth.uid()` | `auth.uid()` | service role |
| `user_automation_runs` | `auth.uid()` | — | — | — | service role |
| `user_dispatch_jobs` | `auth.uid()` | — | — | — | service role |

> Tabelas de sistema (`stripe_webhook_events`) não têm política de SELECT para usuários — acesso exclusivo via service role.

---

## 10. Auditoria de Segurança

### Frontend
- ✅ Nenhuma chave `ZAPI_*` no código frontend
- ✅ Nenhuma `GOOGLE_PRIVATE_KEY` no código frontend
- ✅ Nenhuma `STRIPE_SECRET_KEY` no código frontend
- ✅ Endpoints mock removidos (`/api/zapi/send`, `/api/gdrive/files`)
- ✅ `console.log` no `server.ts` só registra mensagens operacionais seguras
- ✅ `.env.example` não contém valores reais — apenas nomes de variáveis
- ✅ Todas as variáveis frontend têm prefixo `VITE_`

### Backend / Edge Functions
- ✅ `send-whatsapp-charge`: valida JWT via `auth.uid()` antes de qualquer ação
- ✅ `send-whatsapp-batch`: valida JWT; `user_id` vem de `auth.uid()`, nunca do payload
- ✅ `stripe-webhook`: valida assinatura com `STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEvent`
- ✅ `run-automation-scheduler`: valida `Authorization: Bearer <AUTOMATION_CRON_SECRET>`
- ✅ `process-dispatch-jobs`: valida `Authorization: Bearer <AUTOMATION_CRON_SECRET>`
- ✅ `import-google-sheets`: valida JWT; `user_id` extraído de `auth.uid()`
- ✅ `match-drive-files`: valida JWT; `user_id` extraído de `auth.uid()`
- ✅ Nenhuma função retorna credenciais Z-API, Google ou Stripe nas respostas
- ✅ Logs de cobrança não salvam tokens ou chaves

---

## 11. Monitoramento

- **Supabase Logs**: Dashboard → Edge Functions → Logs (por função)
- **Supabase DB**: Dashboard → Database → pg_cron → cron.job_run_details
- **Stripe**: Dashboard → Developers → Events (para webhook)
- **NC Finance Painel Operacional**: Dashboard → aba "Painel Operacional" (carrega métricas reais do DB)

---

*Última atualização: 2026-05-20 · NC Finance v1.2.0*
