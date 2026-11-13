-- 🧾 NF-e própria (modelo 55) direto na SEFAZ (SVRS, RJ) — sem Tiny. Base: docs/emissor-nfe-guia.md.
-- Uma empresa só (sem tenant). Série 2 (o Tiny usa a série 1). Numeração separada por ambiente
-- (1 = produção, 2 = homologação). RLS ligada e nenhum acesso para anon/authenticated: só o servidor
-- (função /api/nfe da Vercel, com a chave de servidor) lê e grava.
-- NÃO mexe em nada do Tiny (sales.nfe_url / nfe_chave / nfe_status continuam do jeito que estão).

create table if not exists nfe_config (
  id int primary key default 1 check (id = 1),               -- uma linha só
  ambiente int not null default 2 check (ambiente in (1, 2)), -- fase 1: só 2 (o servidor bloqueia o 1)
  serie int not null default 2 check (serie between 1 and 889),
  proximo_producao int not null default 1 check (proximo_producao > 0),
  proximo_homolog int not null default 1 check (proximo_homolog > 0),
  emitente jsonb not null default '{}',   -- cnpj, ie, razao, fantasia, endereço, cod_municipio, crt, resp técnico
  natop text not null default 'Venda de mercadorias de terceiros para consumidor final',
  ibpt_fed numeric not null default 21.08,  -- % aproximado de tributos federais (Lei 12.741), igual ao Tiny
  ibpt_est numeric not null default 22.00,  -- % aproximado de tributos estaduais
  tpag text not null default '90',          -- forma de pagamento da nota (90 = sem pagamento, igual ao Tiny)
  info text not null default 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.',
  atualizado_em timestamptz not null default now()
);

-- dados do emitente (editáveis na tela Notas fiscais › Configuração)
insert into nfe_config (id, emitente) values (1, jsonb_build_object(
  'cnpj', '49923481000104', 'ie', '13748756', 'razao', 'LOJA TRIUMPH LTDA', 'fantasia', 'Triumph Store', 'crt', '1',
  'logradouro', 'Rua Quinze de Novembro', 'numero', '106', 'complemento', 'Sala 908', 'bairro', 'Centro',
  'cep', '24020125', 'cod_municipio', '3303302', 'municipio', 'Niterói', 'uf', 'RJ', 'fone', '',
  'resp', jsonb_build_object('cnpj', '', 'contato', '', 'email', '', 'fone', '')
)) on conflict (id) do nothing;

create table if not exists nfe_notas (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid,                     -- sales.id (sem FK: a nota fica guardada mesmo se a venda for apagada)
  ambiente int not null check (ambiente in (1, 2)),
  serie int not null,
  numero int not null,
  chave text,
  status text not null default 'emitindo' check (status in ('emitindo', 'pendente', 'autorizada', 'rejeitada', 'cancelada')),
  cstat text,
  motivo text,
  protocolo text,
  cliente text,
  valor numeric,
  dados jsonb,                       -- o que foi pedido (cliente, itens) — para conferir/refazer
  xml text,                          -- XML assinado (guardado ANTES do envio); vira o nfeProc quando autorizada
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  autorizada_em timestamptz
);
create index if not exists nfe_notas_criado on nfe_notas (criado_em desc);
create index if not exists nfe_notas_venda_idx on nfe_notas (venda_id);
-- número nunca repete (rejeitada não conta: não existe na SEFAZ)
create unique index if not exists nfe_notas_numero on nfe_notas (ambiente, serie, numero) where status in ('emitindo', 'pendente', 'autorizada', 'cancelada');
-- nunca duas notas autorizadas/pendentes para a mesma venda no mesmo ambiente
create unique index if not exists nfe_notas_venda on nfe_notas (ambiente, venda_id) where status in ('emitindo', 'pendente', 'autorizada') and venda_id is not null;

-- reserva o próximo número sem repetir (duas emissões juntas nunca pegam o mesmo)
create or replace function nfe_reservar(p_ambiente int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into nfe_config (id) values (1) on conflict do nothing;
  if p_ambiente = 1 then
    update nfe_config set proximo_producao = proximo_producao + 1 where id = 1 returning proximo_producao - 1 into n;
  elsif p_ambiente = 2 then
    update nfe_config set proximo_homolog = proximo_homolog + 1 where id = 1 returning proximo_homolog - 1 into n;
  else
    raise exception 'ambiente inválido: %', p_ambiente;
  end if;
  return n;
end $$;

-- devolve o número quando a SEFAZ rejeitou (só se ainda for o último reservado)
create or replace function nfe_devolver(p_ambiente int, p_numero int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_ambiente = 1 then
    update nfe_config set proximo_producao = p_numero where id = 1 and proximo_producao = p_numero + 1;
  else
    update nfe_config set proximo_homolog = p_numero where id = 1 and proximo_homolog = p_numero + 1;
  end if;
  return found;
end $$;

alter table nfe_config enable row level security;
alter table nfe_notas enable row level security;
revoke all on nfe_config, nfe_notas from public, anon, authenticated;
grant select, insert, update, delete on nfe_config, nfe_notas to service_role;
revoke all on function nfe_reservar(int), nfe_devolver(int, int) from public, anon, authenticated;
grant execute on function nfe_reservar(int), nfe_devolver(int, int) to service_role;
notify pgrst, 'reload schema';
