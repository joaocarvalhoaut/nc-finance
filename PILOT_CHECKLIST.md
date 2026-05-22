# Checklist Operacional — Piloto Controlado WhatsApp

> Versão: 1.0 · Data: 2026-05-21
> Preencha **antes** de habilitar `pilot_enabled = true` para qualquer tenant.

---

## 1. Tenant / Empresa

| Campo | Valor |
|---|---|
| Nome da empresa | __________________ |
| ID do usuário (Supabase) | __________________ |
| Contato principal | __________________ |
| E-mail de suporte | __________________ |

---

## 2. Número WhatsApp conectado

| Campo | Valor |
|---|---|
| Número (formato internacional) | +55 __ _____ ____ |
| `phone_number_masked` (plataforma) | __________________ |
| Instância Z-API ativa? | ☐ Sim  ☐ Não |
| `diagnose:whatsapp-zapi` retornou `CONECTADO_COM_NUMERO`? | ☐ Sim  ☐ Não |
| `whatsapp_number_label` configurado? | ☐ Sim  ☐ Não |

---

## 3. Responsável interno

| Campo | Valor |
|---|---|
| Nome do responsável (`responsible_name`) | __________________ |
| Canal de suporte/fallback (`support_channel`) | __________________ |
| Disponibilidade durante envios | __________________ |

---

## 4. Horário permitido de envio

| Campo | Valor |
|---|---|
| Início (`allowed_send_start` UTC) | `08:00` (padrão) |
| Fim (`allowed_send_end` UTC) | `18:00` (padrão) |
| Dias permitidos (`allowed_weekdays`) | `{1,2,3,4,5}` = Seg–Sex |
| Fuso local do tenant | __________________ |
| Janela local equivalente | __________________ |

---

## 5. Volume máximo diário

| Campo | Valor |
|---|---|
| `daily_send_limit` | 20 envios/dia (padrão piloto) |
| Aprovado pelo responsável? | ☐ Sim  ☐ Não |
| Escalonamento previsto (semana 2+) | __________________ |

---

## 6. Canal de suporte e fallback manual

| Canal | Detalhes |
|---|---|
| Slack/Teams | __________________ |
| Responsável de plantão | __________________ |
| Procedimento se Z-API cair | 1. Copiar mensagem via UI  2. Enviar manualmente  3. Registrar em `pilot_fallback_notes` |
| SLA de resposta para falhas | __________________ |

---

## 7. Checklist de pré-lançamento

### 7.1 Infraestrutura
- [ ] Migration `20260521050000_pilot_mode.sql` aplicada em produção
- [ ] `platform_integrations.zapi` com `connected = true`
- [ ] `diagnose:whatsapp-zapi` retorna `CONECTADO_COM_NUMERO`
- [ ] `e2e:whatsapp:report` passa 0 FAIL / 0 WARN

### 7.2 Banco de dados
- [ ] `pilot_config` row criada para o tenant com `pilot_enabled = false`
- [ ] `daily_send_limit` configurado
- [ ] `allowed_send_start` / `allowed_send_end` configurados
- [ ] `allowed_weekdays` configurados
- [ ] `whatsapp_number_label` preenchido
- [ ] `responsible_name` preenchido
- [ ] `support_channel` preenchido

### 7.3 Segurança (verificar antes de `pilot_enabled = true`)
- [ ] Nenhum token/client_token exposto no frontend
- [ ] Logs: apenas `phone_masked` (sem número completo)
- [ ] Logs: apenas `message_preview` (sem texto completo)
- [ ] `pilot_fallback_notes` armazena apenas `phone_masked`
- [ ] `pilot_daily_sends` rastreia contador por dia

### 7.4 UI
- [ ] Banner "Modo Piloto Ativo" visível quando `pilot_enabled = true`
- [ ] `BatchConfirmModal` aparece antes de qualquer envio em lote
- [ ] `PilotDashboard` mostra métricas do dia
- [ ] `ManualFallbackModal` disponível para falhas

### 7.5 Aprovação final
- [ ] Responsável interno ciente do horário e volume
- [ ] Primeiro envio de teste manual com 1 devedor
- [ ] Confirmação de recebimento pelo número de teste
- [ ] `pilot_enabled = true` habilitado via SQL/Supabase Dashboard

---

## 8. Habilitar pilot_enabled

Execute via Supabase Dashboard → SQL Editor:

```sql
-- Substitua <USER_ID> pelo UUID do tenant
UPDATE pilot_config
SET
  pilot_enabled        = true,
  daily_send_limit     = 20,
  allowed_send_start   = '08:00',
  allowed_send_end     = '18:00',
  allowed_weekdays     = '{1,2,3,4,5}',
  whatsapp_number_label = '(77) 9 8137-6867 — Empresa XPTO',
  responsible_name     = 'Nome do Responsável',
  support_channel      = 'slack:#whatsapp-pilot'
WHERE user_id = '<USER_ID>';

-- Se não existir ainda:
INSERT INTO pilot_config (
  user_id, pilot_enabled, daily_send_limit,
  allowed_send_start, allowed_send_end, allowed_weekdays,
  whatsapp_number_label, responsible_name, support_channel
) VALUES (
  '<USER_ID>', true, 20,
  '08:00', '18:00', '{1,2,3,4,5}',
  '(77) 9 8137-6867 — Empresa XPTO',
  'Nome do Responsável',
  'slack:#whatsapp-pilot'
);
```

---

## 9. Monitoramento pós-lançamento

| Momento | Ação |
|---|---|
| Dia 1 | Monitorar PilotDashboard a cada 30 min |
| Dia 1 | Confirmar entrega no WhatsApp do número de teste |
| Semana 1 | Revisar `pilot_fallback_notes` — quantas resoluções manuais? |
| Semana 1 | Revisar taxa de entregues vs. enviados |
| Semana 2 | Considerar aumentar `daily_send_limit` |
| Semana 4 | Avaliar transição para operação normal (sem pilot_enabled) |

---

## 10. Rollback

Se qualquer problema crítico ocorrer:

```sql
UPDATE pilot_config SET pilot_enabled = false WHERE user_id = '<USER_ID>';
```

Isso bloqueia imediatamente novos envios para o tenant.
A Z-API e os dados históricos são preservados.
