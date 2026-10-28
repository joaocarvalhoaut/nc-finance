-- ─────────────────────────────────────────────────────────────────────────────
-- Nome da empresa na assinatura das mensagens de cobrança
--
-- Os modelos padrão assinavam "Equipe NC Finance": o devedor de qualquer
-- cliente recebia a cobrança assinada pela NC Finance, não pela empresa que
-- cobra. Agora a assinatura usa {empresa}, preenchido com
-- user_profiles.company_name (sem nome cadastrado, a assinatura sai sem nome:
-- "Equipe financeira.").
--
-- Os modelos já copiados para cada conta (user_message_templates) e os textos
-- das regras de automação (user_automation_rules.custom_message) só têm
-- trocadas as assinaturas padrão — texto editado pelo usuário fica como está.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_profiles
  add column if not exists company_name text;

update public.user_message_templates
   set template = replace(replace(replace(replace(replace(template,
         'Fico à disposição. Equipe NC Finance.',                 'Fico à disposição. Equipe financeira {empresa}.'),
         'Atenciosamente, equipe financeira NC Finance.',         'Atenciosamente, equipe financeira {empresa}.'),
         'Equipe de cobrança NC Finance.',                        'Equipe de cobrança {empresa}.'),
         'Atenciosamente, departamento administrativo NC Finance.', 'Atenciosamente, departamento administrativo {empresa}.'),
         'Equipe NC Finance.',                                    'Equipe financeira {empresa}.'),
       updated_at = timezone('utc', now())
 where template like '%NC Finance.%';

update public.user_automation_rules
   set custom_message = replace(replace(replace(replace(replace(custom_message,
         'Fico à disposição. Equipe NC Finance.',                 'Fico à disposição. Equipe financeira {empresa}.'),
         'Atenciosamente, equipe financeira NC Finance.',         'Atenciosamente, equipe financeira {empresa}.'),
         'Equipe de cobrança NC Finance.',                        'Equipe de cobrança {empresa}.'),
         'Atenciosamente, departamento administrativo NC Finance.', 'Atenciosamente, departamento administrativo {empresa}.'),
         'Equipe NC Finance.',                                    'Equipe financeira {empresa}.')
 where custom_message like '%NC Finance.%';
