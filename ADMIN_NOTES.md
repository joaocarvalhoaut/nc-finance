# NC Finance — Notas de Administração

## Cadastro de Número Próprio (Add-on +R$150/mês)

### Pré-requisitos
1. Cliente pagou o add-on de número próprio
2. Você criou uma instância Z-API dedicada para ele

### Passo a passo

**1. Criar instância Z-API**
- Acesse o painel Z-API → crie uma nova instância
- Anote: `Instance ID`, `Token`, `Client Token`

**2. Cliente escaneia o QR Code**
- Na instância Z-API → seção QR Code
- Cliente abre WhatsApp → Aparelhos Conectados → Escanear QR

**3. Inserir no Supabase Dashboard**
- URL: https://supabase.com/dashboard/project/<PROJECT_REF>/editor
- Tabela: `user_zapi_config`
- Clique em **Insert row** e preencha:

| Campo         | Valor                                          |
|---------------|------------------------------------------------|
| `user_id`     | UUID do cliente (copie de auth.users)          |
| `instance_id` | ID da instância Z-API                          |
| `token`       | Token da instância                             |
| `client_token`| Client Token                                   |
| `label`       | Ex: "WhatsApp Empresa X"                       |
| `is_active`   | `true`                                         |

**4. Pronto — automático**
- Todos os disparos do cliente (manual, lote, automação) passam a sair pelo número dele
- Para suspender: altere `is_active` para `false` → volta para o número global da plataforma
- Para reativar: altere de volta para `true`

---

## Como encontrar o UUID de um cliente

1. Acesse: https://supabase.com/dashboard/project/<PROJECT_REF>/auth/users
2. Busque pelo e-mail do cliente
3. Copie o campo `id` (UUID)

---

## Referência rápida de tabelas importantes

| Tabela                        | Descrição                                      |
|-------------------------------|------------------------------------------------|
| `auth.users`                  | Usuários cadastrados                           |
| `user_subscriptions`          | Assinaturas e planos                           |
| `user_zapi_config`            | Credenciais Z-API por usuário (nº próprio)     |
| `user_registros_financeiros`  | Devedores importados                           |
| `user_logs_cobranca`          | Histórico de cobranças enviadas                |
| `user_usage_counters`         | Contadores mensais de uso por plano            |
| `platform_integrations`       | Credenciais Z-API globais da plataforma        |
