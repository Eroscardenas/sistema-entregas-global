-- ===============================
-- 📦 PEDIDOS PUBLICOS (CLIENTES)
-- ===============================

create table if not exists public.public_order_requests (
  id uuid primary key default gen_random_uuid(),

  nombre text not null,
  telefono text not null,
  maps_url text,

  notas text,

  status text not null default 'NUEVO'
    check (status in ('NUEVO','EN_PROCESO','APROBADO','RECHAZADO','ATENDIDO')),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===============================
-- 📦 ITEMS DEL PEDIDO
-- ===============================

create table if not exists public.public_order_request_items (
  id uuid primary key default gen_random_uuid(),

  request_id uuid not null references public.public_order_requests(id) on delete cascade,

  product_id uuid,
  product_name text not null,

  cantidad integer not null default 1,
  precio_unitario numeric,

  created_at timestamptz default now()
);

-- ===============================
-- 🔄 TRIGGER updated_at
-- ===============================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.public_order_requests;

create trigger set_updated_at
before update on public.public_order_requests
for each row
execute function update_updated_at_column();