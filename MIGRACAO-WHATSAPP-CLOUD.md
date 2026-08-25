# Migração Z-API → WhatsApp Cloud API (Meta oficial)

Status: **motor pronto, aguardando credenciais da Meta.** A produção segue 100%
na Z-API até você virar a flag. Nada aqui altera o comportamento atual.

## O que já está pronto no código
- [`_shared/whatsappCloud.ts`](supabase/functions/_shared/whatsappCloud.ts) — cliente da Cloud API
  (texto, **template**, documento, upload de mídia). Mesmo formato de retorno da Z-API.
- [`_shared/whatsappProvider.ts`](supabase/functions/_shared/whatsappProvider.ts) — a "chave"
  `WHATSAPP_PROVIDER=zapi|cloud` + carregador de credenciais + config do template.
- [`whatsapp-cloud-webhook`](supabase/functions/whatsapp-cloud-webhook/index.ts) — webhook único
  da Meta (GET verificação + POST status/inbound com validação de assinatura HMAC). Registrada
  no config.toml, ainda **não deployada** (precisa das secrets da conta Meta).

## O que falta (só quando a conta Meta estiver ativa)
1. **Conta Meta** desbloqueada + app + WABA + número (ver `ROTACAO-SECRETS.md`? não — ver passo a passo no chat).
2. **Aprovar o template de cobrança** (a Meta exige — texto livre proativo é bloqueado).
3. **Setar as secrets** (abaixo).
4. **Ligar o webhook** de status/inbound no formato Meta.
5. **Virar a flag** `WHATSAPP_PROVIDER=cloud` e testar ponta-a-ponta.

---

## 1) Secrets a configurar (Supabase Edge)
```bash
REF=hiabmnyyxbedtkigcjdx
npx supabase secrets set WHATSAPP_TOKEN="EAAG..."            --project-ref $REF
npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID="1234567"  --project-ref $REF
npx supabase secrets set WHATSAPP_VERIFY_TOKEN="<o que voce inventou>" --project-ref $REF
npx supabase secrets set WHATSAPP_APP_SECRET="<app secret>"  --project-ref $REF
npx supabase secrets set WHATSAPP_CHARGE_TEMPLATE="cobranca_boleto" --project-ref $REF
# só por último, quando tudo testado:
npx supabase secrets set WHATSAPP_PROVIDER="cloud"           --project-ref $REF
```

## 2) Template de cobrança (cadastrar no Gerenciador do WhatsApp)
Categoria **Utility** (mais barato e aprova rápido). Estrutura sugerida:
- **Header:** Documento (o PDF do boleto entra aqui em runtime)
- **Body:**
  ```
  Olá {{1}}, consta um débito de {{2}} com vencimento em {{3}}.
  Segue o boleto em anexo. Qualquer dúvida, é só responder por aqui.
  ```
  Variáveis na ordem: `{{1}}`=nome, `{{2}}`=valor, `{{3}}`=vencimento.
- **Botão (opcional):** URL → "Pagar boleto" (pode ser dynamic URL com o id do boleto).

O nome que você der (ex.: `cobranca_boleto`) vai na secret `WHATSAPP_CHARGE_TEMPLATE`.

## 3) Wiring em `send-whatsapp-charge` (quando ligar o cloud)
O ponto exato a mexer é o **passo 8** (envio). Hoje chama `sendTextMessage` da Z-API.
A troca fica assim (pseudo-diff), sem tocar em auth/limites/idempotência:

```ts
import { getWhatsappProvider, loadCloudCredentials, getChargeTemplateConfig } from "../_shared/whatsappProvider.ts";
import * as cloud from "../_shared/whatsappCloud.ts";

const provider = getWhatsappProvider();

if (provider === "cloud") {
  const creds = loadCloudCredentials();
  const tpl = getChargeTemplateConfig();
  if (!creds || !tpl) return errResponse(503, { error: "WhatsApp Cloud não configurado.", status: "cloud_nao_configurado" });

  const result = await cloud.sendTemplateMessage({
    creds,
    phone: normalizedPhone,
    templateName: tpl.name,
    languageCode: tpl.lang,
    bodyParams: [ body.clientName ?? "cliente", formatBRL(body.amount), venc ],
    headerDocument: publicPdfUrl ? { link: publicPdfUrl, filename: "boleto.pdf" } : null,
  });
  // result tem o MESMO shape do zapiResult → resto do fluxo (log, contador) igual
} else {
  // ...caminho Z-API atual, intacto...
}
```
> `provider` no log (`user_logs_cobranca.provider`) deve virar `"cloud"` nesse ramo.
> A idempotência muda de "mensagem" p/ template — chave passa a incluir o nome do template.

## 4) Webhook de status/inbound (JÁ PRONTO)
A função [`whatsapp-cloud-webhook`](supabase/functions/whatsapp-cloud-webhook/index.ts) já faz tudo:
- **GET:** responde `hub.challenge` quando `hub.verify_token === WHATSAPP_VERIFY_TOKEN`.
- **POST:** valida `X-Hub-Signature-256` (HMAC do corpo cru com `WHATSAPP_APP_SECRET`),
  atualiza status por `wamid` e trata opt-out ("PARE"/"SAIR").

Falta só: **deployar** e **apontar** o webhook no painel da Meta:
```bash
npx supabase functions deploy whatsapp-cloud-webhook --project-ref hiabmnyyxbedtkigcjdx
# URL p/ colar na Meta (WhatsApp > Configuration > Webhook):
# https://hiabmnyyxbedtkigcjdx.supabase.co/functions/v1/whatsapp-cloud-webhook
# Verify token: o valor de WHATSAPP_VERIFY_TOKEN
# Assinar os campos: messages
```

## 5) Rollback instantâneo
Se algo falhar no cloud: `npx supabase secrets set WHATSAPP_PROVIDER="zapi"` e volta tudo
pra Z-API na próxima invocação (sem redeploy).
