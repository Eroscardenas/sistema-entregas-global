-- ============================================================
-- SISTEMA DE ENTREGAS (HIELO) — SUPABASE / POSTGRES
-- FINAL INTEGRADO / LIMPIO / LISTO PARA PEGAR
-- ✅ BOLSAS + BARRAS + TIPOS DE HIELO
-- ✅ Admin (Next.js) + App (Flutter)
-- ✅ Pedidos + Solicitudes + Asignaciones + Rutas + Entregas
-- ✅ RLS COMPLETO (Admin/Driver/Customer)
-- ✅ FIX: products.active + products.stock_actual
-- ✅ FIX: RLS recursion / stack depth limit exceeded
-- ✅ FIX: deliveries.priority
-- ✅ FIX: solicitudes / pedidos públicos
-- ✅ NUEVO: cancelación de asignaciones
-- ✅ FIX: drop seguro de products sin importar si es table/view/materialized view
-- ============================================================

-- ============================================================
-- EXTENSIONES
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ============================================================
-- DROP SEGURO
-- ============================================================

drop view if exists public.v_active_public_order_requests cascade;
drop view if exists public.v_active_new_customer_requests cascade;
drop view if exists public.v_admin_dashboard cascade;
drop view if exists public.v_driver_dashboard_today cascade;
drop view if exists public.v_driver_deliveries_today cascade;
drop view if exists public.v_order_detail cascade;
drop view if exists public.v_delivery_detail cascade;

-- ✅ DROP ULTRA SEGURO DE products
do $$
declare
  v_kind char;
begin
  select c.relkind
  into v_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'products'
  limit 1;

  if v_kind = 'r' then
    execute 'drop table public.products cascade';
  elsif v_kind = 'v' then
    execute 'drop view public.products cascade';
  elsif v_kind = 'm' then
    execute 'drop materialized view public.products cascade';
  end if;
end $$;

drop function if exists public.fn_start_route(uuid, numeric) cascade;
drop function if exists public.fn_finish_route(uuid, numeric) cascade;
drop function if exists public.fn_confirm_delivery(uuid, jsonb) cascade;
drop function if exists public.fn_cancel_delivery(uuid, text) cascade;
drop function if exists public.fn_cancel_assignment(uuid, text) cascade;
drop function if exists public.fn_convert_order_to_deliveries(uuid, uuid, date) cascade;

drop function if exists public.ensure_delivery_snapshots() cascade;
drop function if exists public.recalc_delivery_totals() cascade;
drop function if exists public.generate_delivery_folio() cascade;
drop function if exists public.hash_pin(text) cascade;
drop function if exists public.verify_pin(text, text) cascade;
drop function if exists public.current_profile_role() cascade;
drop function if exists public.current_driver_id() cascade;
drop function if exists public.current_customer_id() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_driver() cascade;
drop function if exists public.is_customer() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.normalize_text(text) cascade;
drop function if exists public.set_request_status_timestamps() cascade;
drop function if exists public.cleanup_expired_operational_data() cascade;

drop sequence if exists public.delivery_folio_seq cascade;

drop table if exists public.audit_events cascade;
drop table if exists public.notifications cascade;
drop table if exists public.thermal_printers cascade;

drop table if exists public.delivery_items cascade;
drop table if exists public.deliveries cascade;

drop table if exists public.routes cascade;

drop table if exists public.assignment_load_items cascade;
drop table if exists public.assignments cascade;

drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;

drop table if exists public.customer_products cascade;

drop table if exists public.public_order_request_items cascade;
drop table if exists public.public_order_requests cascade;
drop table if exists public.new_customer_requests cascade;

drop table if exists public.customers cascade;
drop table if exists public.diners cascade;
drop table if exists public.drivers cascade;
drop table if exists public.profiles cascade;

drop index if exists public.idx_products_kind;
drop index if exists public.idx_products_ice_type;
drop index if exists public.idx_products_active;

drop index if exists public.idx_drivers_profile;
drop index if exists public.idx_drivers_status;

drop index if exists public.idx_customers_profile;
drop index if exists public.idx_customers_diner;
drop index if exists public.idx_customers_activo;

drop index if exists public.idx_customer_products_customer;
drop index if exists public.idx_customer_products_product;

drop index if exists public.idx_orders_status_created;
drop index if exists public.idx_orders_customer;

drop index if exists public.idx_order_items_order;
drop index if exists public.idx_order_items_product;

drop index if exists public.idx_new_customer_requests_status_created;

drop index if exists public.idx_public_order_requests_status_created;
drop index if exists public.idx_public_order_request_items_request;

drop index if exists public.idx_assignments_driver_date;
drop index if exists public.idx_assignments_date_status;

drop index if exists public.idx_assignment_load_items_assignment;

drop index if exists public.idx_routes_status;

drop index if exists public.idx_deliveries_assignment;
drop index if exists public.idx_deliveries_route;
drop index if exists public.idx_deliveries_customer;
drop index if exists public.idx_deliveries_status_created;
drop index if exists public.idx_deliveries_priority;

drop index if exists public.idx_delivery_items_delivery;
drop index if exists public.idx_delivery_items_product;

drop index if exists public.idx_notifications_profile;
drop index if exists public.idx_notifications_driver;
drop index if exists public.idx_notifications_customer;

drop index if exists public.idx_audit_events_entity;

-- ============================================================
-- HELPERS
-- ============================================================

create or replace function public.normalize_text(v text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(coalesce(v,''), '\s+', ' ', 'g')), '');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_request_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'EN_PROCESO'
     and old.status is distinct from new.status then
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;

  if new.status in ('APROBADO','RECHAZADO','ATENDIDO')
     and old.status is distinct from new.status then
    new.resolved_at = coalesce(new.resolved_at, now());
  end if;

  return new;
end;
$$;

-- ============================================================
-- AUTH / PERFILES
-- ============================================================

create table public.profiles (
  id uuid primary key,
  role text not null check (role in ('admin','driver','customer')),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- HELPERS RLS SEGUROS (SIN RECURSION)
-- ============================================================

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((
    select (p.role = 'admin')
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((
    select (p.role = 'driver')
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.is_customer()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((
    select (p.role = 'customer')
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

-- ============================================================
-- CHOFERES
-- ============================================================

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,

  nombre text not null,
  pin_hash text not null,
  telefono text,

  activo boolean not null default true,
  current_status text not null
    check (current_status in ('available','on_route','offline'))
    default 'available',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drivers_profile on public.drivers(profile_id);
create index if not exists idx_drivers_status on public.drivers(current_status);

create trigger trg_drivers_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

create or replace function public.hash_pin(p_pin text)
returns text
language sql
as $$
  select crypt(coalesce(p_pin,''), gen_salt('bf', 10));
$$;

create or replace function public.verify_pin(p_pin text, p_hash text)
returns boolean
language sql
stable
as $$
  select crypt(coalesce(p_pin,''), coalesce(p_hash,'')) = coalesce(p_hash,'');
$$;

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select d.id
  from public.drivers d
  where d.profile_id = auth.uid();
$$;

-- ============================================================
-- COMEDORES
-- ============================================================

create table public.diners (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  cantidad_clientes int not null default 0 check (cantidad_clientes >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_diners_updated_at
before update on public.diners
for each row execute function public.set_updated_at();

-- ============================================================
-- CLIENTES
-- ============================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  diner_id uuid references public.diners(id) on delete set null,

  nombre text not null,
  telefono text,
  maps_url text,
  capacidad_equipo text not null
    check (capacidad_equipo in ('20','40','50','60','100','150','N/A'))
    default 'N/A',

  activo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_profile on public.customers(profile_id);
create index if not exists idx_customers_diner on public.customers(diner_id);
create index if not exists idx_customers_activo on public.customers(activo);

create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select c.id
  from public.customers c
  where c.profile_id = auth.uid();
$$;

-- ============================================================
-- PRODUCTOS
-- ============================================================

create table public.products (
  id uuid primary key default gen_random_uuid(),

  nombre text not null unique,

  kind text not null check (kind in ('bolsa','barra')),
  ice_type text not null default 'normal',

  kg_por_unidad numeric not null check (kg_por_unidad > 0),
  precio_base numeric not null default 0 check (precio_base >= 0),

  stock_actual int not null default 0 check (stock_actual >= 0),
  active boolean not null default true,
  activo boolean generated always as (active) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_kind on public.products(kind);
create index if not exists idx_products_ice_type on public.products(ice_type);
create index if not exists idx_products_active on public.products(active);

create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ============================================================
-- PRECIOS POR CLIENTE
-- ============================================================

create table public.customer_products (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,

  precio_override numeric check (precio_override >= 0),
  activo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(customer_id, product_id)
);

create index if not exists idx_customer_products_customer on public.customer_products(customer_id);
create index if not exists idx_customer_products_product on public.customer_products(product_id);

create trigger trg_customer_products_updated_at
before update on public.customer_products
for each row execute function public.set_updated_at();

-- ============================================================
-- PEDIDOS
-- ============================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,

  status text not null check (status in (
    'NUEVO','VISTO','EN_VALIDACION','APROBADO','ASIGNADO','RECHAZAZADO','RECHAZADO','CANCELADO'
  )) default 'NUEVO',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status_created on public.orders(status, created_at desc);
create index if not exists idx_orders_customer on public.orders(customer_id);

create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,

  qty int not null check (qty > 0),
  precio_aplicado numeric not null check (precio_aplicado >= 0),

  subtotal numeric generated always as (qty * precio_aplicado) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_product on public.order_items(product_id);

create or replace view public.v_order_detail as
select
  o.id as order_id,
  o.status,
  o.notes,
  o.created_at,
  c.id as customer_id,
  c.nombre as customer_name,
  d.nombre as diner_name,
  c.capacidad_equipo,
  c.maps_url,
  json_agg(
    json_build_object(
      'product_id', p.id,
      'product_name', p.nombre,
      'kind', p.kind,
      'ice_type', p.ice_type,
      'kg_por_unidad', p.kg_por_unidad,
      'qty', oi.qty,
      'precio_aplicado', oi.precio_aplicado,
      'subtotal', oi.subtotal
    )
    order by p.nombre
  ) as items,
  coalesce(sum(oi.subtotal),0) as total
from public.orders o
join public.customers c on c.id = o.customer_id
left join public.diners d on d.id = c.diner_id
join public.order_items oi on oi.order_id = o.id
join public.products p on p.id = oi.product_id
group by o.id, c.id, d.id;

-- ============================================================
-- SOLICITUDES NUEVO CLIENTE
-- ============================================================

create table public.new_customer_requests (
  id uuid primary key default gen_random_uuid(),

  nombre text not null,
  telefono text,
  maps_url text,

  factura_comedor boolean not null default false,
  comedor_nombre text,
  notes text,

  status text not null
    check (status in ('NUEVO','EN_PROCESO','APROBADO','RECHAZADO'))
    default 'NUEVO',

  reviewed_at timestamptz,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_new_customer_requests_status_created
on public.new_customer_requests(status, created_at desc);

create trigger trg_new_customer_requests_updated_at
before update on public.new_customer_requests
for each row execute function public.set_updated_at();

create trigger trg_new_customer_requests_status_timestamps
before update on public.new_customer_requests
for each row execute function public.set_request_status_timestamps();

-- ============================================================
-- PEDIDOS PUBLICOS
-- ============================================================

create table public.public_order_requests (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  fecha_requerida date not null,
  notes text,

  status text not null
    check (status in ('NUEVO','EN_PROCESO','APROBADO','RECHAZADO','ATENDIDO'))
    default 'NUEVO',

  reviewed_at timestamptz,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_order_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.public_order_requests(id) on delete cascade,
  product_name text not null,
  qty int not null check (qty > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_public_order_requests_status_created
on public.public_order_requests(status, created_at desc);

create index if not exists idx_public_order_request_items_request
on public.public_order_request_items(request_id);

create trigger trg_public_order_requests_updated_at
before update on public.public_order_requests
for each row execute function public.set_updated_at();

create trigger trg_public_order_requests_status_timestamps
before update on public.public_order_requests
for each row execute function public.set_request_status_timestamps();

-- ============================================================
-- ASIGNACIONES
-- ============================================================

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  work_date date not null default current_date,

  status text not null
    check (status in ('ACTIVA','CERRADA','CANCELADA'))
    default 'ACTIVA',

  notes text,
  canceled_reason text,
  canceled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(driver_id, work_date)
);

create index if not exists idx_assignments_driver_date on public.assignments(driver_id, work_date);
create index if not exists idx_assignments_date_status on public.assignments(work_date, status);

create trigger trg_assignments_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

create table public.assignment_load_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  qty int not null check (qty >= 0),
  created_at timestamptz not null default now(),
  unique(assignment_id, product_id)
);

create index if not exists idx_assignment_load_items_assignment
on public.assignment_load_items(assignment_id);

-- ============================================================
-- RUTAS
-- ============================================================

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments(id) on delete cascade,

  km_start numeric check (km_start >= 0),
  km_end numeric check (km_end >= 0),

  started_at timestamptz,
  ended_at timestamptz,

  status text not null
    check (status in ('NO_INICIADA','EN_RUTA','FINALIZADA'))
    default 'NO_INICIADA',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_routes_status on public.routes(status);

create trigger trg_routes_updated_at
before update on public.routes
for each row execute function public.set_updated_at();

-- ============================================================
-- FOLIOS
-- ============================================================

create sequence public.delivery_folio_seq
  increment 1
  minvalue 1
  maxvalue 99999999
  start 1;

create or replace function public.generate_delivery_folio()
returns text
language plpgsql
as $$
declare
  v bigint;
  g bigint;
  i bigint;
begin
  v := nextval('public.delivery_folio_seq');
  g := ((v - 1) / 10000) + 1;
  i := ((v - 1) % 10000) + 1;
  return 'G' || lpad(g::text, 4, '0') || 'I' || lpad(i::text, 4, '0');
end;
$$;

-- ============================================================
-- ENTREGAS
-- ============================================================

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),

  assignment_id uuid not null references public.assignments(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,

  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,

  folio text not null unique default public.generate_delivery_folio(),

  status text not null
    check (status in ('PENDIENTE','ENTREGADA','CANCELADA'))
    default 'PENDIENTE',

  priority int not null default 50,
  canceled_reason text,
  delivered_at timestamptz,

  customer_nombre_snapshot text,
  diner_nombre_snapshot text,
  maps_url_snapshot text,

  total_expected numeric not null default 0,
  total_real numeric not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deliveries_priority_check check (priority >= 1 and priority <= 100)
);

create index if not exists idx_deliveries_assignment on public.deliveries(assignment_id);
create index if not exists idx_deliveries_route on public.deliveries(route_id);
create index if not exists idx_deliveries_customer on public.deliveries(customer_id);
create index if not exists idx_deliveries_status_created on public.deliveries(status, created_at desc);
create index if not exists idx_deliveries_priority on public.deliveries(priority);

create trigger trg_deliveries_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,

  qty_assigned int not null check (qty_assigned > 0),
  qty_real int check (qty_real >= 0),
  precio_aplicado numeric not null check (precio_aplicado >= 0),

  subtotal_expected numeric generated always as (qty_assigned * precio_aplicado) stored,
  subtotal_real numeric generated always as (coalesce(qty_real, qty_assigned) * precio_aplicado) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(delivery_id, product_id)
);

create index if not exists idx_delivery_items_delivery on public.delivery_items(delivery_id);
create index if not exists idx_delivery_items_product on public.delivery_items(product_id);

create trigger trg_delivery_items_updated_at
before update on public.delivery_items
for each row execute function public.set_updated_at();

create or replace function public.ensure_delivery_snapshots()
returns trigger
language plpgsql
as $$
declare
  v_customer public.customers%rowtype;
  v_diner public.diners%rowtype;
begin
  select * into v_customer from public.customers where id = new.customer_id;

  if new.customer_nombre_snapshot is null then
    new.customer_nombre_snapshot := v_customer.nombre;
  end if;

  if new.maps_url_snapshot is null then
    new.maps_url_snapshot := v_customer.maps_url;
  end if;

  if new.diner_nombre_snapshot is null and v_customer.diner_id is not null then
    select * into v_diner from public.diners where id = v_customer.diner_id;
    new.diner_nombre_snapshot := v_diner.nombre;
  end if;

  return new;
end;
$$;

create trigger trg_deliveries_snapshots
before insert on public.deliveries
for each row execute function public.ensure_delivery_snapshots();

create or replace function public.recalc_delivery_totals()
returns trigger
language plpgsql
as $$
declare
  v_delivery_id uuid;
begin
  v_delivery_id := coalesce(new.delivery_id, old.delivery_id);

  update public.deliveries d
  set
    total_expected = (
      select coalesce(sum(subtotal_expected),0)
      from public.delivery_items
      where delivery_id = v_delivery_id
    ),
    total_real = (
      select coalesce(sum(subtotal_real),0)
      from public.delivery_items
      where delivery_id = v_delivery_id
    ),
    updated_at = now()
  where d.id = v_delivery_id;

  return coalesce(new, old);
end;
$$;

create trigger trg_delivery_items_recalc
after insert or update or delete on public.delivery_items
for each row execute function public.recalc_delivery_totals();

-- ============================================================
-- IMPRESORAS
-- ============================================================

create table public.thermal_printers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers(id) on delete cascade,

  printer_name text not null,
  mac_address text unique,
  connection_type text not null
    check (connection_type in ('bluetooth','usb','wifi'))
    default 'bluetooth',

  activo boolean not null default true,
  last_connection timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_thermal_printers_updated_at
before update on public.thermal_printers
for each row execute function public.set_updated_at();

-- ============================================================
-- NOTIFICACIONES
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),

  target_profile_id uuid references public.profiles(id) on delete cascade,
  target_driver_id uuid references public.drivers(id) on delete cascade,
  target_customer_id uuid references public.customers(id) on delete cascade,

  type text not null check (type in (
    'new_order','order_status','new_customer_request','delivery_update','route_started','route_finished','system'
  )),
  title text not null,
  message text not null,

  read boolean not null default false,

  related_entity_type text,
  related_entity_id uuid,

  created_at timestamptz not null default now(),

  constraint notifications_exactly_one_target check (
    (case when target_profile_id is not null then 1 else 0 end) +
    (case when target_driver_id is not null then 1 else 0 end) +
    (case when target_customer_id is not null then 1 else 0 end)
    = 1
  )
);

create index if not exists idx_notifications_profile
on public.notifications(target_profile_id, read, created_at desc);

create index if not exists idx_notifications_driver
on public.notifications(target_driver_id, read, created_at desc);

create index if not exists idx_notifications_customer
on public.notifications(target_customer_id, read, created_at desc);

-- ============================================================
-- AUDITORIA
-- ============================================================

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_driver_id uuid references public.drivers(id) on delete set null,

  entity_type text not null,
  entity_id uuid,
  action text not null,

  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_entity
on public.audit_events(entity_type, entity_id, created_at desc);

-- ============================================================
-- FUNCIONES CORE
-- ============================================================

create or replace function public.fn_start_route(p_assignment_id uuid, p_km_start numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_route_id uuid;
begin
  select a.driver_id into v_driver_id
  from public.assignments a
  where a.id = p_assignment_id;

  if v_driver_id is null then
    raise exception 'Assignment no existe';
  end if;

  if not (public.is_admin() or (public.is_driver() and v_driver_id = public.current_driver_id())) then
    raise exception 'No autorizado';
  end if;

  insert into public.routes (assignment_id, km_start, started_at, status)
  values (p_assignment_id, p_km_start, now(), 'EN_RUTA')
  on conflict (assignment_id) do update
    set km_start = excluded.km_start,
        started_at = coalesce(public.routes.started_at, excluded.started_at),
        status = 'EN_RUTA',
        updated_at = now()
  returning id into v_route_id;

  update public.drivers
  set current_status = 'on_route', updated_at = now()
  where id = v_driver_id;

  insert into public.audit_events (actor_profile_id, actor_driver_id, entity_type, entity_id, action, payload)
  values (
    auth.uid(),
    public.current_driver_id(),
    'route',
    v_route_id,
    'START_ROUTE',
    jsonb_build_object('assignment_id', p_assignment_id, 'km_start', p_km_start)
  );

  return v_route_id;
end;
$$;

create or replace function public.fn_finish_route(p_assignment_id uuid, p_km_end numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_route_id uuid;
  v_km_start numeric;
begin
  select a.driver_id into v_driver_id
  from public.assignments a
  where a.id = p_assignment_id;

  if v_driver_id is null then
    raise exception 'Assignment no existe';
  end if;

  if not (public.is_admin() or (public.is_driver() and v_driver_id = public.current_driver_id())) then
    raise exception 'No autorizado';
  end if;

  select r.id, r.km_start into v_route_id, v_km_start
  from public.routes r
  where r.assignment_id = p_assignment_id;

  if v_route_id is null then
    raise exception 'Ruta no iniciada';
  end if;

  if v_km_start is not null and p_km_end < v_km_start then
    raise exception 'km_end no puede ser menor que km_start';
  end if;

  update public.routes
  set km_end = p_km_end,
      ended_at = now(),
      status = 'FINALIZADA',
      updated_at = now()
  where id = v_route_id;

  update public.assignments
  set status = 'CERRADA',
      updated_at = now()
  where id = p_assignment_id;

  update public.drivers
  set current_status = 'available', updated_at = now()
  where id = v_driver_id;

  insert into public.audit_events (actor_profile_id, actor_driver_id, entity_type, entity_id, action, payload)
  values (
    auth.uid(),
    public.current_driver_id(),
    'route',
    v_route_id,
    'FINISH_ROUTE',
    jsonb_build_object('assignment_id', p_assignment_id, 'km_end', p_km_end)
  );
end;
$$;

create or replace function public.fn_confirm_delivery(p_delivery_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_driver_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty_real int;
begin
  select d.assignment_id, a.driver_id
  into v_assignment_id, v_driver_id
  from public.deliveries d
  join public.assignments a on a.id = d.assignment_id
  where d.id = p_delivery_id;

  if v_assignment_id is null then
    raise exception 'Entrega no existe';
  end if;

  if not (public.is_admin() or (public.is_driver() and v_driver_id = public.current_driver_id())) then
    raise exception 'No autorizado';
  end if;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_real := (v_item->>'qty_real')::int;

    update public.delivery_items
    set qty_real = v_qty_real,
        updated_at = now()
    where delivery_id = p_delivery_id
      and product_id = v_product_id;
  end loop;

  update public.deliveries
  set status = 'ENTREGADA',
      delivered_at = now(),
      updated_at = now()
  where id = p_delivery_id;

  insert into public.audit_events (actor_profile_id, actor_driver_id, entity_type, entity_id, action, payload)
  values (
    auth.uid(),
    public.current_driver_id(),
    'delivery',
    p_delivery_id,
    'CONFIRM_DELIVERY',
    jsonb_build_object('items', p_items)
  );
end;
$$;

create or replace function public.fn_cancel_delivery(p_delivery_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo admin puede cancelar entregas';
  end if;

  update public.deliveries
  set status = 'CANCELADA',
      canceled_reason = public.normalize_text(p_reason),
      updated_at = now()
  where id = p_delivery_id;

  insert into public.audit_events (actor_profile_id, entity_type, entity_id, action, payload)
  values (
    auth.uid(),
    'delivery',
    p_delivery_id,
    'CANCEL_DELIVERY',
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

create or replace function public.fn_cancel_assignment(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_route_id uuid;
  v_clean_reason text;
begin
  if not public.is_admin() then
    raise exception 'Solo admin puede cancelar asignaciones';
  end if;

  v_clean_reason := coalesce(public.normalize_text(p_reason), 'Cancelada por admin');

  select a.driver_id into v_driver_id
  from public.assignments a
  where a.id = p_assignment_id;

  if v_driver_id is null then
    raise exception 'Asignación no existe';
  end if;

  select r.id into v_route_id
  from public.routes r
  where r.assignment_id = p_assignment_id;

  update public.deliveries
  set status = 'CANCELADA',
      canceled_reason = v_clean_reason,
      updated_at = now()
  where assignment_id = p_assignment_id
    and status = 'PENDIENTE';

  if v_route_id is not null then
    update public.routes
    set status = 'FINALIZADA',
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
    where id = v_route_id
      and status <> 'FINALIZADA';
  end if;

  update public.assignments
  set status = 'CANCELADA',
      canceled_reason = v_clean_reason,
      canceled_at = now(),
      updated_at = now()
  where id = p_assignment_id;

  update public.drivers
  set current_status = 'available',
      updated_at = now()
  where id = v_driver_id;

  insert into public.audit_events (actor_profile_id, entity_type, entity_id, action, payload)
  values (
    auth.uid(),
    'assignment',
    p_assignment_id,
    'CANCEL_ASSIGNMENT',
    jsonb_build_object('reason', v_clean_reason)
  );
end;
$$;

create or replace function public.fn_convert_order_to_deliveries(
  p_order_id uuid,
  p_driver_id uuid,
  p_work_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_assignment_id uuid;
  v_delivery_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo admin';
  end if;

  select o.customer_id into v_customer_id
  from public.orders o
  where o.id = p_order_id
    and o.status in ('APROBADO','EN_VALIDACION','VISTO','NUEVO');

  if v_customer_id is null then
    raise exception 'Pedido no existe o no es convertible';
  end if;

  insert into public.assignments (driver_id, work_date, status, notes)
  values (p_driver_id, coalesce(p_work_date, current_date), 'ACTIVA', 'Generada desde pedido')
  on conflict (driver_id, work_date) do update
    set updated_at = now()
  returning id into v_assignment_id;

  insert into public.deliveries (
    assignment_id,
    customer_id,
    order_id,
    status,
    priority
  )
  values (
    v_assignment_id,
    v_customer_id,
    p_order_id,
    'PENDIENTE',
    50
  )
  returning id into v_delivery_id;

  insert into public.delivery_items (delivery_id, product_id, qty_assigned, precio_aplicado)
  select v_delivery_id, oi.product_id, oi.qty, oi.precio_aplicado
  from public.order_items oi
  where oi.order_id = p_order_id;

  update public.orders
  set status = 'ASIGNADO', updated_at = now()
  where id = p_order_id;

  insert into public.audit_events (actor_profile_id, entity_type, entity_id, action, payload)
  values (
    auth.uid(),
    'order',
    p_order_id,
    'CONVERT_ORDER_TO_DELIVERY',
    jsonb_build_object(
      'driver_id', p_driver_id,
      'work_date', p_work_date,
      'delivery_id', v_delivery_id
    )
  );

  return v_delivery_id;
end;
$$;

-- ============================================================
-- VIEWS
-- ============================================================

create or replace view public.v_admin_dashboard as
select
  (select count(*) from public.drivers where activo = true) as drivers_activos,
  (select count(*) from public.customers where activo = true) as clientes_activos,
  (select count(*) from public.diners where activo = true) as comedores_activos,
  (select count(*) from public.products where active = true) as productos_activos,

  (select count(*) from public.orders where status = 'NUEVO') as pedidos_nuevos,
  (select count(*) from public.new_customer_requests where status = 'NUEVO') as solicitudes_clientes_nuevos,

  (select count(*)
   from public.deliveries d
   join public.assignments a on a.id = d.assignment_id
   where a.work_date = current_date) as entregas_hoy,

  (select count(*)
   from public.deliveries d
   join public.assignments a on a.id = d.assignment_id
   where a.work_date = current_date and d.status = 'ENTREGADA') as entregas_completadas_hoy,

  (select coalesce(sum(d.total_real),0)
   from public.deliveries d
   join public.assignments a on a.id = d.assignment_id
   where a.work_date = current_date and d.status = 'ENTREGADA') as total_real_hoy;

create or replace view public.v_driver_dashboard_today as
select
  dr.id as driver_id,
  dr.nombre as driver_name,
  dr.current_status,

  a.id as assignment_id,
  a.work_date,
  a.status as assignment_status,
  a.canceled_reason,
  a.canceled_at,

  r.id as route_id,
  r.status as route_status,
  r.km_start, r.km_end,
  r.started_at, r.ended_at,

  (select count(*) from public.deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') as total_activo,
  (select count(*) from public.deliveries d where d.assignment_id = a.id and d.status = 'ENTREGADA') as completadas,
  (select count(*) from public.deliveries d where d.assignment_id = a.id and d.status = 'CANCELADA') as canceladas,

  case
    when (select count(*) from public.deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') = 0 then 0
    else round(
      (
        (select count(*) from public.deliveries d where d.assignment_id = a.id and d.status = 'ENTREGADA')::numeric
        /
        (select count(*) from public.deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA')::numeric
      ) * 100
    ,2)
  end as progress_percent,

  (select coalesce(sum(total_expected),0) from public.deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') as total_esperado,
  (select coalesce(sum(total_real),0) from public.deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') as total_real

from public.drivers dr
left join public.assignments a on a.driver_id = dr.id and a.work_date = current_date and a.status <> 'CANCELADA'
left join public.routes r on r.assignment_id = a.id;

create or replace view public.v_driver_deliveries_today as
select
  d.id as delivery_id,
  d.folio,
  d.status,
  d.priority,
  d.delivered_at,
  d.total_expected,
  d.total_real,
  d.customer_nombre_snapshot as customer_name,
  d.diner_nombre_snapshot as diner_name,
  d.maps_url_snapshot as maps_url,
  a.driver_id,
  a.work_date
from public.deliveries d
join public.assignments a on a.id = d.assignment_id
where a.work_date = current_date;

create or replace view public.v_delivery_detail as
select
  d.id as delivery_id,
  d.folio,
  d.status,
  d.priority,
  d.canceled_reason,
  d.delivered_at,
  d.total_expected,
  d.total_real,
  d.customer_nombre_snapshot as customer_name,
  d.diner_nombre_snapshot as diner_name,
  d.maps_url_snapshot as maps_url,
  a.work_date,
  dr.id as driver_id,
  dr.nombre as driver_name,
  json_agg(
    json_build_object(
      'product_id', p.id,
      'product_name', p.nombre,
      'kind', p.kind,
      'ice_type', p.ice_type,
      'kg_por_unidad', p.kg_por_unidad,
      'qty_assigned', di.qty_assigned,
      'qty_real', di.qty_real,
      'precio_aplicado', di.precio_aplicado,
      'subtotal_expected', di.subtotal_expected,
      'subtotal_real', di.subtotal_real
    )
    order by p.nombre
  ) as items
from public.deliveries d
join public.assignments a on a.id = d.assignment_id
join public.drivers dr on dr.id = a.driver_id
join public.delivery_items di on di.delivery_id = d.id
join public.products p on p.id = di.product_id
group by d.id, a.work_date, dr.id;

create or replace view public.v_active_new_customer_requests as
select
  r.id,
  r.nombre,
  r.telefono,
  r.maps_url,
  r.factura_comedor,
  r.comedor_nombre,
  r.notes,
  r.status,
  r.reviewed_at,
  r.resolved_at,
  r.created_at,
  r.updated_at
from public.new_customer_requests r
where r.status in ('NUEVO','EN_PROCESO')
order by r.created_at desc;

create or replace view public.v_active_public_order_requests as
select
  r.id,
  r.nombre,
  r.telefono,
  r.fecha_requerida,
  r.notes,
  r.status,
  r.reviewed_at,
  r.resolved_at,
  r.created_at,
  r.updated_at,
  coalesce(
    (
      select json_agg(
        json_build_object(
          'id', i.id,
          'product_name', i.product_name,
          'qty', i.qty,
          'created_at', i.created_at
        )
        order by i.created_at asc
      )
      from public.public_order_request_items i
      where i.request_id = r.id
    ),
    '[]'::json
  ) as items
from public.public_order_requests r
where r.status in ('NUEVO','EN_PROCESO')
order by r.created_at desc;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.diners enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.customer_products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.new_customer_requests enable row level security;
alter table public.public_order_requests enable row level security;
alter table public.public_order_request_items enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_load_items enable row level security;
alter table public.routes enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;
alter table public.thermal_printers enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================

create policy "profiles_admin_all"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_self_read"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_self_update"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "drivers_admin_all"
on public.drivers for all
using (public.is_admin())
with check (public.is_admin());

create policy "drivers_self_read"
on public.drivers for select
using (profile_id = auth.uid());

create policy "drivers_self_update_limited"
on public.drivers for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "diners_admin_manage"
on public.diners for all
using (public.is_admin())
with check (public.is_admin());

create policy "diners_read_authenticated"
on public.diners for select
using (auth.role() = 'authenticated');

create policy "customers_admin_all"
on public.customers for all
using (public.is_admin())
with check (public.is_admin());

create policy "customers_self_read"
on public.customers for select
using (profile_id = auth.uid());

create policy "customers_read_for_drivers"
on public.customers for select
using (public.is_driver());

create policy "products_admin_manage"
on public.products for all
using (public.is_admin())
with check (public.is_admin());

create policy "products_read_authenticated"
on public.products for select
using (auth.role() = 'authenticated');

create policy "customer_products_admin_manage"
on public.customer_products for all
using (public.is_admin())
with check (public.is_admin());

create policy "customer_products_customer_read_own"
on public.customer_products for select
using (public.is_customer() and customer_id = public.current_customer_id());

create policy "customer_products_driver_read"
on public.customer_products for select
using (public.is_driver());

create policy "orders_admin_all"
on public.orders for all
using (public.is_admin())
with check (public.is_admin());

create policy "orders_customer_read_own"
on public.orders for select
using (public.is_customer() and customer_id = public.current_customer_id());

create policy "orders_customer_insert_own"
on public.orders for insert
with check (public.is_customer() and customer_id = public.current_customer_id());

create policy "orders_customer_update_own_limited"
on public.orders for update
using (public.is_customer() and customer_id = public.current_customer_id())
with check (public.is_customer() and customer_id = public.current_customer_id());

create policy "order_items_admin_all"
on public.order_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "order_items_customer_read_own"
on public.order_items for select
using (
  public.is_customer()
  and exists (
    select 1 from public.orders o
    where o.id = public.order_items.order_id
      and o.customer_id = public.current_customer_id()
  )
);

create policy "order_items_customer_insert_own"
on public.order_items for insert
with check (
  public.is_customer()
  and exists (
    select 1 from public.orders o
    where o.id = public.order_items.order_id
      and o.customer_id = public.current_customer_id()
  )
);

create policy "new_customer_requests_admin_all"
on public.new_customer_requests for all
using (public.is_admin())
with check (public.is_admin());

create policy "new_customer_requests_insert_public"
on public.new_customer_requests for insert
to anon, authenticated
with check (true);

create policy "public_order_requests_admin_all"
on public.public_order_requests for all
using (public.is_admin())
with check (public.is_admin());

create policy "public_order_requests_insert_public"
on public.public_order_requests for insert
to anon, authenticated
with check (true);

create policy "public_order_request_items_admin_all"
on public.public_order_request_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "public_order_request_items_insert_public"
on public.public_order_request_items for insert
to anon, authenticated
with check (true);

create policy "assignments_admin_all"
on public.assignments for all
using (public.is_admin())
with check (public.is_admin());

create policy "assignments_driver_read_own"
on public.assignments for select
using (public.is_driver() and driver_id = public.current_driver_id());

create policy "assignments_driver_insert_own"
on public.assignments for insert
with check (public.is_driver() and driver_id = public.current_driver_id());

create policy "assignment_load_items_admin_all"
on public.assignment_load_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "assignment_load_items_driver_read_own"
on public.assignment_load_items for select
using (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.assignment_load_items.assignment_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "routes_admin_all"
on public.routes for all
using (public.is_admin())
with check (public.is_admin());

create policy "routes_driver_read_own"
on public.routes for select
using (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.routes.assignment_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "routes_driver_update_own"
on public.routes for update
using (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.routes.assignment_id
      and a.driver_id = public.current_driver_id()
  )
)
with check (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.routes.assignment_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "deliveries_admin_all"
on public.deliveries for all
using (public.is_admin())
with check (public.is_admin());

create policy "deliveries_driver_read_own"
on public.deliveries for select
using (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.deliveries.assignment_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "deliveries_driver_update_own"
on public.deliveries for update
using (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.deliveries.assignment_id
      and a.driver_id = public.current_driver_id()
  )
)
with check (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.deliveries.assignment_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "deliveries_driver_insert_own"
on public.deliveries for insert
with check (
  public.is_driver()
  and exists (
    select 1 from public.assignments a
    where a.id = public.deliveries.assignment_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "deliveries_customer_read_own"
on public.deliveries for select
using (public.is_customer() and public.deliveries.customer_id = public.current_customer_id());

create policy "delivery_items_admin_all"
on public.delivery_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "delivery_items_driver_read_own"
on public.delivery_items for select
using (
  public.is_driver()
  and exists (
    select 1
    from public.deliveries d
    join public.assignments a on a.id = d.assignment_id
    where d.id = public.delivery_items.delivery_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "delivery_items_driver_update_own"
on public.delivery_items for update
using (
  public.is_driver()
  and exists (
    select 1
    from public.deliveries d
    join public.assignments a on a.id = d.assignment_id
    where d.id = public.delivery_items.delivery_id
      and a.driver_id = public.current_driver_id()
  )
)
with check (
  public.is_driver()
  and exists (
    select 1
    from public.deliveries d
    join public.assignments a on a.id = d.assignment_id
    where d.id = public.delivery_items.delivery_id
      and a.driver_id = public.current_driver_id()
  )
);

create policy "delivery_items_customer_read_own"
on public.delivery_items for select
using (
  public.is_customer()
  and exists (
    select 1
    from public.deliveries d
    where d.id = public.delivery_items.delivery_id
      and d.customer_id = public.current_customer_id()
  )
);

create policy "thermal_printers_admin_all"
on public.thermal_printers for all
using (public.is_admin())
with check (public.is_admin());

create policy "thermal_printers_driver_own"
on public.thermal_printers for select
using (public.is_driver() and driver_id = public.current_driver_id());

create policy "notifications_admin_all"
on public.notifications for all
using (public.is_admin())
with check (public.is_admin());

create policy "notifications_profile_read_own"
on public.notifications for select
using (target_profile_id = auth.uid());

create policy "notifications_driver_read_own"
on public.notifications for select
using (public.is_driver() and target_driver_id = public.current_driver_id());

create policy "notifications_customer_read_own"
on public.notifications for select
using (public.is_customer() and target_customer_id = public.current_customer_id());

create policy "audit_admin_read"
on public.audit_events for select
using (public.is_admin());

-- ============================================================
-- GRANTS PUBLICOS
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select, insert on public.public_order_requests to anon;
grant select, insert, update, delete on public.public_order_requests to authenticated;

grant select, insert on public.public_order_request_items to anon;
grant select, insert, update, delete on public.public_order_request_items to authenticated;

grant select on public.v_active_public_order_requests to anon, authenticated;
grant select on public.v_active_new_customer_requests to anon, authenticated;

-- ============================================================
-- LIMPIEZA OPERATIVA MANUAL
-- ============================================================

create or replace function public.cleanup_expired_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_new_customer_requests integer := 0;
  v_deleted_public_order_requests integer := 0;
  v_deleted_assignments integer := 0;
begin
  delete from public.new_customer_requests
  where status in ('APROBADO','RECHAZADO')
    and resolved_at is not null
    and resolved_at < now() - interval '15 days';
  get diagnostics v_deleted_new_customer_requests = row_count;

  delete from public.public_order_requests
  where status in ('APROBADO','RECHAZADO','ATENDIDO')
    and resolved_at is not null
    and resolved_at < now() - interval '30 days';
  get diagnostics v_deleted_public_order_requests = row_count;

  delete from public.assignments
  where work_date < current_date - interval '15 days'
    and status in ('CERRADA','CANCELADA');
  get diagnostics v_deleted_assignments = row_count;

  return jsonb_build_object(
    'deleted_new_customer_requests', v_deleted_new_customer_requests,
    'deleted_public_order_requests', v_deleted_public_order_requests,
    'deleted_assignments', v_deleted_assignments,
    'ran_at', now()
  );
end;
$$;

-- ============================================================
-- SEEDS
-- ============================================================

insert into public.products (nombre, kind, ice_type, kg_por_unidad, precio_base, stock_actual, active)
values
  ('Bolsa Hielo 5kg - Normal',  'bolsa', 'normal',  5, 15.00, 0, true),
  ('Bolsa Hielo 10kg - Normal', 'bolsa', 'normal', 10, 25.00, 0, true),
  ('Bolsa Hielo 5kg - Gourmet', 'bolsa', 'gourmet', 5, 18.00, 0, true),
  ('Barra Hielo 20kg - Normal', 'barra', 'normal', 20, 45.00, 0, true)
on conflict (nombre) do nothing;

-- ============================================================
-- RELOAD SCHEMA CACHE
-- ============================================================

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICACION FINAL
-- ============================================================

select
  '✅ OK: esquema FINAL listo' as status,
  (select count(*) from public.products) as products,
  (select count(*) from public.diners) as diners,
  (select count(*) from public.customers) as customers,
  (select count(*) from public.drivers) as drivers,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'active'
  ) as products_has_active,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deliveries'
      and column_name = 'priority'
  ) as deliveries_has_priority,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assignments'
      and column_name = 'canceled_reason'
  ) as assignments_has_cancel_reason;