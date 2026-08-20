# Rotação de secrets — migração de máquina (sem pendrive)

Como o `.env` ficou na máquina antiga e ela sai da sua mão, o plano é **gerar chaves
novas** e montar um `.env` do zero na máquina nova. As chaves antigas viram inúteis.

Cada secret vive em **até 3 lugares** — ao rotacionar uma, atualize em TODOS onde ela
aparece, senão a produção quebra:

1. **`.env` local** (raiz do projeto, na máquina nova)
2. **Vercel** → Project → Settings → Environment Variables (só as `VITE_…`)
3. **Supabase Edge Functions** → `npx supabase secrets set NOME="valor" --project-ref hiabmnyyxbedtkigcjdx`

Depois de mexer no Vercel: **Redeploy**. Depois de mexer em Edge secret: as functions já
leem na próxima invocação (não precisa re-deploy).

---

## 0) Login nas ferramentas (máquina nova)
```bash
git clone https://github.com/joaocarvalhoaut/nc-finance.git
cd nc-finance
npm install
cp .env.example .env          # molde; vamos preencher abaixo
npx supabase login
npx supabase link --project-ref hiabmnyyxbedtkigcjdx
```

---

## 1) NÃO são secrets — só copiar dos painéis (não precisa rotacionar)
Estes são identificadores públicos. Basta ver logado e colar no `.env`:

| Variável | Onde ver |
|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_STRIPE_BASIC/PRO/PREMIUM_PRICE_ID` | Stripe → Products (o `price_…`) |
| `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_CLIENT_EMAIL` | Google Cloud → Service Account |
| `GOOGLE_PROJECT_ID` / `GOOGLE_DRIVE_FOLDER_ID` | Google Cloud / URL da pasta do Drive |

---

## 2) Supabase (anon + service_role)
Painel novo de API keys (Settings → **API Keys**):
- **Crie uma nova Secret key** → vira `SUPABASE_SERVICE_ROLE_KEY`
- **Publishable/anon key** → vira `SUPABASE_ANON_KEY` e `VITE_SUPABASE_ANON_KEY`
- Depois de tudo migrado e testado, **revogue a secret key antiga**.

Atualizar em: `.env` (as 3), **Vercel** (`VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`),
**Edge secrets** (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

> ⚠️ Revogar a chave antiga desloga todo mundo — combine um horário tranquilo.

## 3) Stripe
- Dashboard → Developers → **API keys** → *Roll* a Secret key → `STRIPE_SECRET_KEY`
- Developers → **Webhooks** → o endpoint → *Roll signing secret* → `STRIPE_WEBHOOK_SECRET`
- `VITE_STRIPE_PUBLISHABLE_KEY` (pk_…) não é secreta, mas confira se está a certa (Test vs Live).

Atualizar em: **Edge secrets** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`),
`.env`, **Vercel** (`VITE_STRIPE_PUBLISHABLE_KEY`).

## 4) Z-API (WhatsApp)
Painel Z-API → sua instância → **regenerar token** e ver o Client-Token.
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`

Atualizar em: **Edge secrets** (as 3). Não vão pro Vercel.

## 5) Google (service account)
Google Cloud → IAM → Service Accounts → sua conta → **Keys → Add key → JSON**.
Do JSON baixado: `private_key` → `GOOGLE_PRIVATE_KEY`, `client_email` → `GOOGLE_CLIENT_EMAIL`.
Depois **apague a key antiga** na lista. (o `.json` fica só na máquina, não commitar!)

Atualizar em: **Edge secrets** (`GOOGLE_PRIVATE_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PROJECT_ID`, `GOOGLE_DRIVE_FOLDER_ID`).

## 6) Resend (e-mail do Supabase Auth)
- Resend → API Keys → cria nova, apaga a antiga.
- Cola em **Supabase → Authentication → SMTP settings** (não é Edge secret nem `.env`).

## 7) Short.io
Short.io → Settings → API keys → gera nova, revoga antiga → `SHORTIO_API_KEY` (**Edge secret**).

## 8) Secrets internas (geradas por você — só sortear novas)
`AUTOMATION_CRON_SECRET` e `GATEWAY_ADMIN_SECRET` são aleatórias. Gere novas:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Atualizar em: **Edge secrets** + onde o cron/chamador as usa (Vercel Cron / scheduler).

---

## Checklist final
- [ ] `.env` novo preenchido (roda `npm run dev` local sem erro de conexão)
- [ ] Vercel env atualizado + **Redeploy** feito
- [ ] `npx supabase secrets set …` para cada Edge secret rotacionada
- [ ] SMTP (Resend) atualizado no Supabase Auth
- [ ] Chaves ANTIGAS revogadas (Supabase secret key, Stripe roll, Google key, Resend, Short.io)
- [ ] Teste ponta-a-ponta: login → cobrar → webhook Stripe → envio WhatsApp
