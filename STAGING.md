# Ambiente de Staging — NC Finance

Ambiente espelho da produção para testar carga, migrations e mudanças **sem
risco aos clientes reais**. A regra de ouro: teste de carga e experimentos vão
para o staging, **nunca** para `ncfinance.com.br`.

Legenda: **[VOCÊ]** = precisa de login/credencial sua · **[EU]** = eu posso executar.

---

## Visão geral da arquitetura

```
                     PRODUÇÃO                         STAGING
  Front    ncfinance.com.br (Vercel prod)   preview Vercel (env staging)
  Banco    Supabase projeto PROD            Supabase projeto STAGING (novo)
  Funcs    Edge Functions no PROD           Edge Functions no STAGING
  Chaves   Stripe LIVE, Z-API real          Stripe TEST, Z-API sandbox/descartável
```

O que isola de verdade os dois é **o projeto Supabase separado** e **as variáveis
de ambiente**. Sem isso, um "staging" ainda bate no banco de produção.

---

## Passo 1 · Criar o projeto Supabase de staging — [VOCÊ]

1. Em <https://supabase.com/dashboard> → **New project**.
2. Nome sugerido: `nc-finance-staging`. Região igual à de produção.
3. Guarde o **Project Ref** (ex.: `abcdstaging1234`) e a **senha do banco**.

> Não consigo fazer este passo: cria recurso na sua conta e define senha.

---

## Passo 2 · Aplicar o schema (todas as migrations) — [VOCÊ] (com sua senha)

Com o CLI já usado no projeto, aplicando a pasta `supabase/migrations/` em ordem:

```bash
supabase link --project-ref <STAGING_REF>
supabase db push            # aplica TODAS as migrations, em ordem, uma vez
```

`db push` pede a senha do banco do staging (Passo 1). Como envolve sua senha,
rode você — ou me passe o `STAGING_REF` e você digita a senha quando o CLI pedir.

---

## Passo 3 · Configurar os secrets do staging — [VOCÊ]

Use **chaves de teste/descartáveis**, nunca as de produção:

```bash
supabase secrets set --project-ref <STAGING_REF> \
  AUTOMATION_CRON_SECRET="<novo-segredo-aleatorio>" \
  STRIPE_SECRET_KEY="sk_test_..." \
  STRIPE_WEBHOOK_SECRET="whsec_...(endpoint de teste)" \
  ZAPI_INSTANCE_ID="<sandbox>" ZAPI_TOKEN="<sandbox>" ZAPI_CLIENT_TOKEN="<sandbox>" \
  GOOGLE_CLIENT_EMAIL="..." GOOGLE_PRIVATE_KEY="..." GOOGLE_DRIVE_FOLDER_ID="..." \
  RESEND_API_KEY="<chave de teste>" SITE_URL="<url do preview>"
```

> Envolve segredos — só você. (Os nomes acima são os que as funções esperam.
> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o próprio Supabase injeta.)

---

## Passo 4 · Deployar as Edge Functions no staging — [EU]

Depois do Passo 1, consigo publicar todas as funções no projeto de staging:

```bash
supabase functions deploy --project-ref <STAGING_REF>   # todas de uma vez
```

Me passe o `STAGING_REF` que eu rodo este passo.

---

## Passo 5 · Front-end de staging na Vercel — [VOCÊ] / [EU]

Opção mais simples — um **Preview Deployment** por branch:

1. Criar a branch: `git checkout -b staging && git push -u origin staging` — **[EU]** preparo.
2. Na Vercel → Project → **Settings → Environment Variables**, definir, para o
   escopo **Preview** (ou a branch `staging`), apontando ao projeto novo — **[VOCÊ]**:
   - `VITE_SUPABASE_URL = https://<STAGING_REF>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY = <anon key do staging>`
   - `VITE_STRIPE_PUBLISHABLE_KEY = pk_test_...`
   - `VITE_STRIPE_BASIC_PRICE_ID / _PRO_ / _PREMIUM_ = <price ids de teste>`
3. A Vercel gera uma URL de preview (ex.: `nc-finance-git-staging-....vercel.app`).

> O Passo 2 envolve o dashboard/credenciais da Vercel — só você.

---

## Passo 6 · Rodar o teste de carga contra o staging — [EU] / [VOCÊ]

Com a URL de preview em mãos:

```bash
# rota pública (front estático) — mede CDN/serverless
BASE_URL=https://<preview>.vercel.app STAGES=10,50,100,500,1000 DURATION=15 \
  node scripts/load-test.mjs

# rota autenticada (mede o banco de verdade) — crie um usuário de teste no staging,
# pegue o JWT dele e:
BASE_URL=https://<preview>.vercel.app AUTH="Bearer <jwt-teste>" \
  PATH_=/ STAGES=10,100,500,1000 DURATION=15 node scripts/load-test.mjs
```

Rode **antes e depois** de aplicar os índices para comparar p95.

---

## Resumo da divisão

| Passo | Quem |
|-------|------|
| 1. Criar projeto Supabase staging | [VOCÊ] |
| 2. `db push` (schema) | [VOCÊ] (senha) — eu acompanho |
| 3. Secrets de teste | [VOCÊ] |
| 4. Deploy das Edge Functions | [EU] (com o ref) |
| 5a. Branch `staging` | [EU] |
| 5b. Env vars na Vercel | [VOCÊ] |
| 6. Teste de carga | [EU] / [VOCÊ] |

**Para me destravar os passos 4 e 5a, me passe o `STAGING_REF` depois do Passo 1.**
