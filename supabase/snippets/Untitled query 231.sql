create extension if not exists pgcrypto;

create table if not exists public.public_order_requests (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text null,
  fecha_requerida date not null,
  notes text null,
  status text not null default 'NUEVO',
  reviewed_at timestamptz null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_order_requests_status_check
    check (status = any (array['NUEVO','EN_PROCESO','APROBADO','RECHAZADO','ATENDIDO']))
);

create table if not exists public.public_order_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.public_order_requests(id) on delete cascade,
  product_id uuid null references public.products(id) on delete restrict,
  product_name text not null,
  qty integer not null,
  created_at timestamptz not null default now(),
  constraint public_order_request_items_qty_check check (qty > 0)
);

create index if not exists idx_public_order_requests_status
  on public.public_order_requests(status);

create index if not exists idx_public_order_requests_created_at
  on public.public_order_requests(created_at desc);

create index if not exists idx_public_order_request_items_request_id
  on public.public_order_request_items(request_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_public_order_requests_updated_at on public.public_order_requests;

create trigger trg_public_order_requests_updated_at
before update on public.public_order_requests
for each row
execute function public.set_updated_at();

create or replace view public.v_active_public_order_requests as
select *
from public.public_order_requests
where status in ('NUEVO','EN_PROCESO','APROBADO');

create or replace view public.v_recent_public_order_requests as
select *
from public.public_order_requests
order by created_at desc;