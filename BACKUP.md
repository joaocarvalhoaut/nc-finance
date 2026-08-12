# Backup e teste de restore — NC Finance

Procedimento para garantir que os dados sobrevivem a um desastre (corrupção,
exclusão acidental, falha do provedor) e que **o backup realmente funciona** —
um backup que nunca foi restaurado não é um backup, é uma esperança.

> Isto é **infra**, configurada no dashboard do Supabase. Não dá para automatizar
> por código do repositório. Legenda: **[VOCÊ]** = ação no dashboard/conta.

---

## 1. Backup automático — [VOCÊ]

O Supabase faz backup conforme o tier do projeto:

| Tier | Backup |
|------|--------|
| Free | **Sem backup gerenciado** — risco alto para produção |
| Pro  | Backup **diário automático** (retenção 7 dias) |
| Pro + PITR | Point-in-Time Recovery — restaura para **qualquer segundo** (retenção configurável) |

**Ação:** para produção com clientes reais, o projeto precisa estar no **Pro**.
Ative em Dashboard → **Settings → Billing** → plano Pro. Depois confirme em
**Database → Backups** que os backups diários estão aparecendo.

Recomendado também habilitar **PITR** (Database → Backups → Point in Time
Recovery) — permite voltar para o instante anterior a um erro, não só para a
meia-noite.

---

## 2. Teste de restore mensal — [VOCÊ] (~20 min/mês)

Um backup só vale se restaurar. Faça **todo mês**:

1. Dashboard → **Database → Backups** → escolha o backup mais recente.
2. Use **Restore** para um **projeto novo/temporário** (nunca por cima da
   produção). No Supabase Pro, dá para criar um projeto de restauração isolado.
3. No projeto restaurado, rode as verificações abaixo no SQL Editor:

```sql
-- As tabelas principais têm dados?
select
  (select count(*) from public.user_registros_financeiros) as devedores,
  (select count(*) from public.user_logs_cobranca)         as cobrancas,
  (select count(*) from auth.users)                        as usuarios;

-- Amostra recente coerente?
select client_name, created_at
  from public.user_logs_cobranca
 order by created_at desc
 limit 5;

-- RLS continua ligado nas tabelas sensíveis?
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public' and tablename like 'user_%'
 order by tablename;
```

4. **Critério de sucesso:** contagens coerentes com produção (ordem de grandeza),
   amostra recente presente, `rowsecurity = true` em todas as `user_*`.
5. **Apague o projeto temporário** ao terminar (evita custo e dado duplicado).
6. Registre a data e o resultado (ex.: numa planilha "Testes de Restore").

---

## 3. Exportação lógica extra (opcional, defesa em profundidade) — [VOCÊ]

Além do backup do Supabase, um dump mensal guardado fora dele protege contra
perda da conta/provedor:

```bash
# Precisa da connection string (Dashboard → Settings → Database → Connection string)
supabase db dump --db-url "<CONNECTION_STRING>" -f backup-$(date +%Y%m%d).sql
```

Guarde o arquivo num local seguro e separado (ex.: storage criptografado).

---

## Resumo

| Item | Frequência | Quem |
|------|-----------|------|
| Backup diário automático (tier Pro) | contínuo | Supabase |
| PITR habilitado | contínuo | [VOCÊ] (uma vez) |
| Teste de restore + verificação | mensal | [VOCÊ] |
| Dump lógico externo | mensal (opcional) | [VOCÊ] |
