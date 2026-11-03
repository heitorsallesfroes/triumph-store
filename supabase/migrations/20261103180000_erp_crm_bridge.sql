-- ============================================================================
-- ERP → CRM do WhatsApp: pós-venda automático (aba WhatsApp do ERP, Etapa F)
-- ============================================================================
-- wa_settings: + auto_client_enabled (padrão desligado) e auto_client_label_id.
-- Gatilho em sales: quando finalized_at passa de nulo para preenchido (a venda foi
-- finalizada, em qualquer tela), se a opção estiver ligada, normaliza o telefone do cliente
-- (só dígitos; 10/11 dígitos ganham 55; 12/13 começando com 55 ficam; o resto é ignorado),
-- cria/atualiza o contato com a MESMA identidade da extensão (wa_contacts.key = 'tel:<dígitos>',
-- phone, name; chat_id = '<dígitos>@c.us' se a coluna existir e estiver vazia) e marca a etiqueta
-- (sem duplicar).
--
-- Segurança da finalização: a função roda num bloco com "exception when others" — qualquer
-- problema é ignorado em silêncio e a finalização da venda continua normal.
-- O gatilho é AFTER UPDATE com WHEN (OLD.finalized_at is null and NEW.finalized_at is not null):
-- finalized_at é preenchido pelo gatilho BEFORE set_sales_finalized_at (migration 20260514000000),
-- então não dá para usar "update of finalized_at" (só vale para colunas do SET).
-- SECURITY DEFINER com search_path fixo; ninguém pode chamar a função direto.
-- Não muda nenhuma regra de venda, estoque ou DRE. Pode rodar mais de uma vez.
-- Depende das migrations 20261030150000 (etiquetas CRM) e 20261103130000 (wa_settings).
-- ============================================================================

alter table wa_settings add column if not exists auto_client_enabled bool not null default false;
alter table wa_settings add column if not exists auto_client_label_id uuid references wa_labels on delete set null;

create or replace function public.wa_auto_client_label()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_label uuid;
  v_digits text;
  v_contact uuid;
begin
  begin
    select auto_client_enabled, auto_client_label_id into v_enabled, v_label from wa_settings where id = 1;
    if not coalesce(v_enabled, false) or v_label is null then
      return null;
    end if;
    v_digits := regexp_replace(coalesce(NEW.customer_phone, ''), '\D', '', 'g');
    if length(v_digits) in (10, 11) then
      v_digits := '55' || v_digits;
    elsif not (length(v_digits) in (12, 13) and left(v_digits, 2) = '55') then
      return null; -- telefone inválido: ignora
    end if;
    insert into wa_contacts (key, phone, name, updated_at)
      values ('tel:' || v_digits, v_digits, nullif(btrim(coalesce(NEW.customer_name, '')), ''), now())
      on conflict (key) do nothing;
    select id into v_contact from wa_contacts where key = 'tel:' || v_digits;
    if v_contact is null then
      return null;
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'wa_contacts' and column_name = 'chat_id') then
      execute 'update wa_contacts set chat_id = $1 where id = $2 and (chat_id is null or chat_id = '''')'
        using v_digits || '@c.us', v_contact;
    end if;
    insert into wa_contact_labels (contact_id, label_id) values (v_contact, v_label)
      on conflict (contact_id, label_id) do nothing;
  exception when others then
    null; -- nunca impede a finalização da venda
  end;
  return null;
end;
$$;

revoke all on function public.wa_auto_client_label() from public;
revoke all on function public.wa_auto_client_label() from anon, authenticated;

drop trigger if exists sales_wa_auto_client_label on sales;
create trigger sales_wa_auto_client_label
  after update on sales
  for each row
  when (OLD.finalized_at is null and NEW.finalized_at is not null)
  execute function public.wa_auto_client_label();

notify pgrst, 'reload schema';
