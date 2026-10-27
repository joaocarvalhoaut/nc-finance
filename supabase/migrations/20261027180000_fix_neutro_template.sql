-- ─────────────────────────────────────────────────────────────────────────────
-- Tom "Neutro": tira o "está no prazo" das mensagens já gravadas
--
-- O modelo padrão do tom Neutro dizia "O título está no prazo informado e
-- permanece em acompanhamento preventivo." — enviado também para devedores
-- vencidos. Os modelos são copiados para cada conta no primeiro acesso (sem
-- tela de edição), então a correção do padrão no código só vale para contas
-- novas. Aqui trocamos só essa frase, e só onde ela ainda está igual.
-- ─────────────────────────────────────────────────────────────────────────────

update public.user_message_templates
   set template   = replace(
                      template,
                      'O título está no prazo informado e permanece em acompanhamento preventivo.',
                      'O título consta em aberto em nosso acompanhamento.'
                    ),
       updated_at = timezone('utc', now())
 where template_key = 'neutro'
   and template like '%O título está no prazo informado e permanece em acompanhamento preventivo.%';
