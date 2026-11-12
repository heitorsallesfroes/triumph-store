-- 12/11: sem "modo teste" — o sistema fica sempre no modo real.
-- 1) Instagram: modo teste desligado e lista de contas de teste vazia (a chave geral "ig_automations_enabled" e as
--    automações ligadas NÃO mudam). Atenção: se a chave geral estiver ligada, as automações ligadas passam a
--    responder a TODOS (antes só as contas da lista).
insert into public.system_config (key, value, updated_at) values
  ('ig_test_mode', 'false', now()),
  ('ig_test_accounts', '[]', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

-- 2) WhatsApp (extensão): automação que estava ligada SÓ EM TESTE (uma conversa) fica desligada e sai do teste,
--    para não passar a valer para todos sem ninguém ligar. As ligadas de verdade (sem conversa de teste) não mudam.
update public.wa_automations set active = false, test_chat_id = null where test_chat_id is not null;

-- 3) "Contato" automático do Facebook: modo teste desligado (ligado/desligado e "desde" não mudam).
update public.system_config set value = jsonb_set(value::jsonb, '{test}', 'false'::jsonb)::text, updated_at = now()
where key = 'wa_meta_contact' and value ~ '^\s*\{' and (value::jsonb ->> 'test') = 'true';
