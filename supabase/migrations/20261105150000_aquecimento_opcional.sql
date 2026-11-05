-- Aquecimento do número passa a ser opcional (desligado por padrão).
--
-- Só faz sentido para número novo; quem já conversa com clientes pelo número
-- não precisa. O usuário liga em Configurações › Proteção do número
-- ("Meu número é novo"), e o dia 1 é gravado no envio seguinte.
-- O limite diário da conta continua valendo como antes.

alter table public.user_configuracoes
  alter column aquecimento_ativo set default false;

update public.user_configuracoes
  set aquecimento_ativo = false
  where aquecimento_ativo;

comment on column public.user_configuracoes.aquecimento_ativo is
  'Aquecimento de número novo (opcional, desligado por padrão): por 30 dias o teto diário sobe aos poucos.';
