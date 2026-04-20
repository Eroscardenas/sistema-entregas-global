-- ============================================================
-- SISTEMA DE ENTREGAS (HIELO) — SUPABASE / POSTGRES
-- ✅ BOLSAS + BARRAS + TIPOS DE HIELO
-- ✅ Admin (Next.js) + App (Flutter)
-- ✅ Pedidos (clientes existentes) + Solicitudes (clientes nuevos)
-- ✅ Asignaciones + Rutas + Entregas + Progreso + PDF/Ticket (fase 2)
-- ✅ RLS COMPLETO (Admin/Driver/Customer)
-- ============================================================
-- Fecha: 2026-02-17
-- ============================================================

-- ===========================
-- EXTENSIONES
-- ===========================
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ===========================
-- DROP (orden seguro)
-- ===========================
drop view if exists v_admin_dashboard cascade;
drop view if exists v_driver_dashboard_today cascade;
drop view if exists v_driver_deliveries_today cascade;
drop view if exists v_order_detail cascade;
drop view if exists v_delivery_detail cascade;

drop function if exists set_updated_at cascade;
drop function if exists normalize_text cascade;

drop function if exists is_admin cascade;
drop function if exists is_driver cascade;
drop function if exists is_customer cascade;

drop function if exists current_profile_role cascade;
drop function if exists current_driver_id cascade;
drop function if exists current_customer_id cascade;

drop function if exists hash_pin cascade;
drop function if exists verify_pin cascade;

drop function if exists generate_delivery_folio cascade;
drop sequence if exists delivery_folio_seq cascade;

drop function if exists ensure_delivery_snapshots cascade;
drop function if exists recalc_delivery_totals cascade;

drop function if exists fn_start_route cascade;
drop function if exists fn_finish_route cascade;
drop function if exists fn_confirm_delivery cascade;
drop function if exists fn_cancel_delivery cascade;
drop function if exists fn_convert_order_to_deliveries cascade;

drop table if exists audit_events cascade;
drop table if exists notifications cascade;
drop table if exists thermal_printers cascade;

drop table if exists delivery_items cascade;
drop table if exists deliveries cascade;

drop table if exists routes cascade;

drop table if exists assignment_load_items cascade;
drop table if exists assignments cascade;

drop table if exists order_items cascade;
drop table if exists orders cascade;

drop table if exists customer_products cascade;

drop table if exists new_customer_requests cascade;

drop table if exists customers cascade;
drop table if exists diners cascade;

drop table if exists drivers cascade;

drop table if exists products cascade;

drop table if exists profiles cascade;

-- ============================================================
-- HELPERS
-- ============================================================

create or replace function normalize_text(v text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(coalesce(v,''), '\s+', ' ', 'g')), '');
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- AUTH / PERFILES
-- - profiles.id = auth.users.id
-- - role: admin|driver|customer
-- ============================================================

create table profiles (
  id uuid primary key, -- FK lógica a auth.users.id
  role text not null check (role in ('admin','driver','customer')),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

-- Helpers RLS
create or replace function current_profile_role()
returns text
language sql
stable
as $$
  select p.role
  from profiles p
  where p.id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function is_driver()
returns boolean
language sql
stable
as $$
  select coalesce((select role = 'driver' from profiles where id = auth.uid()), false);
$$;

create or replace function is_customer()
returns boolean
language sql
stable
as $$
  select coalesce((select role = 'customer' from profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- CHOFERES (drivers)
-- - 1 a 1 con profiles (para RLS fuerte)
-- - PIN guardado hasheado
-- ============================================================

create table drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,

  nombre text not null,
  pin_hash text not null,
  telefono text,

  activo boolean not null default true,
  current_status text not null check (current_status in ('available','on_route','offline')) default 'available',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_drivers_profile on drivers(profile_id);
create index idx_drivers_status on drivers(current_status);

create trigger trg_drivers_updated_at
before update on drivers
for each row execute function set_updated_at();

-- PIN helpers
create or replace function hash_pin(p_pin text)
returns text
language sql
as $$
  select crypt(coalesce(p_pin,''), gen_salt('bf', 10));
$$;

create or replace function verify_pin(p_pin text, p_hash text)
returns boolean
language sql
stable
as $$
  select crypt(coalesce(p_pin,''), coalesce(p_hash,'')) = coalesce(p_hash,'');
$$;

create or replace function current_driver_id()
returns uuid
language sql
stable
as $$
  select d.id
  from drivers d
  where d.profile_id = auth.uid();
$$;

-- ============================================================
-- COMEDORES (diners)
-- ============================================================

create table diners (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  cantidad_clientes int not null default 0 check (cantidad_clientes >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_diners_updated_at
before update on diners
for each row execute function set_updated_at();

-- ============================================================
-- CLIENTES (customers)
-- - 1 a 1 con profiles opcional (si tendrán login)
-- - maps_url como link
-- - capacidad_equipo: 20,40,50,60,100,150,N/A
-- ============================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null, -- opcional

  diner_id uuid references diners(id) on delete set null,

  nombre text not null,
  telefono text,
  maps_url text,
  capacidad_equipo text not null check (capacidad_equipo in ('20','40','50','60','100','150','N/A')) default 'N/A',

  activo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_profile on customers(profile_id);
create index idx_customers_diner on customers(diner_id);
create index idx_customers_activo on customers(activo);

create trigger trg_customers_updated_at
before update on customers
for each row execute function set_updated_at();

create or replace function current_customer_id()
returns uuid
language sql
stable
as $$
  select c.id
  from customers c
  where c.profile_id = auth.uid();
$$;

-- ============================================================
-- PRODUCTOS (solo hielo)
-- - kind: bolsa|barra
-- - ice_type: texto (normaliza en app)
-- - kg_por_unidad: kg por unidad
-- ============================================================

create table products (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,

  kind text not null check (kind in ('bolsa','barra')),
  ice_type text not null default 'normal',

  kg_por_unidad numeric not null check (kg_por_unidad > 0),
  precio_base numeric not null default 0 check (precio_base >= 0),

  activo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_kind on products(kind);
create index idx_products_ice_type on products(ice_type);
create index idx_products_activo on products(activo);

create trigger trg_products_updated_at
before update on products
for each row execute function set_updated_at();

-- ============================================================
-- PRECIOS POR CLIENTE (override)
-- - si precio_override es null => usar base
-- ============================================================

create table customer_products (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,

  precio_override numeric check (precio_override >= 0),
  activo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(customer_id, product_id)
);

create index idx_customer_products_customer on customer_products(customer_id);
create index idx_customer_products_product on customer_products(product_id);

create trigger trg_customer_products_updated_at
before update on customer_products
for each row execute function set_updated_at();

-- ============================================================
-- PEDIDOS (clientes existentes)
-- ============================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,

  status text not null check (status in (
    'NUEVO','VISTO','EN_VALIDACION','APROBADO','ASIGNADO','RECHAZADO','CANCELADO'
  )) default 'NUEVO',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_status_created on orders(status, created_at desc);
create index idx_orders_customer on orders(customer_id);

create trigger trg_orders_updated_at
before update on orders
for each row execute function set_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,

  qty int not null check (qty > 0),
  precio_aplicado numeric not null check (precio_aplicado >= 0),

  subtotal numeric generated always as (qty * precio_aplicado) stored,

  created_at timestamptz not null default now()
);

create index idx_order_items_order on order_items(order_id);
create index idx_order_items_product on order_items(product_id);

-- Vista detalle pedido (útil admin)
create or replace view v_order_detail as
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
from orders o
join customers c on c.id = o.customer_id
left join diners d on d.id = c.diner_id
join order_items oi on oi.order_id = o.id
join products p on p.id = oi.product_id
group by o.id, c.id, d.id;

-- ============================================================
-- SOLICITUDES CLIENTE NUEVO
-- ============================================================

create table new_customer_requests (
  id uuid primary key default gen_random_uuid(),

  nombre text not null,
  telefono text,
  maps_url text,

  factura_comedor boolean not null default false,
  comedor_nombre text,
  notes text,

  status text not null check (status in ('NUEVO','ATENDIDO','RECHAZADO')) default 'NUEVO',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_new_customer_requests_status_created on new_customer_requests(status, created_at desc);

create trigger trg_new_customer_requests_updated_at
before update on new_customer_requests
for each row execute function set_updated_at();

-- ============================================================
-- ASIGNACIONES (plan diario)
-- ============================================================

create table assignments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id) on delete cascade,
  work_date date not null default current_date,

  status text not null check (status in ('ACTIVA','CERRADA','CANCELADA')) default 'ACTIVA',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(driver_id, work_date)
);

create index idx_assignments_driver_date on assignments(driver_id, work_date);
create index idx_assignments_date_status on assignments(work_date, status);

create trigger trg_assignments_updated_at
before update on assignments
for each row execute function set_updated_at();

-- carga por asignación
create table assignment_load_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  qty int not null check (qty >= 0),

  created_at timestamptz not null default now(),

  unique(assignment_id, product_id)
);

create index idx_assignment_load_items_assignment on assignment_load_items(assignment_id);

-- ============================================================
-- RUTAS (1:1 con assignment para MVP)
-- ============================================================

create table routes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references assignments(id) on delete cascade,

  km_start numeric check (km_start >= 0),
  km_end numeric check (km_end >= 0),

  started_at timestamptz,
  ended_at timestamptz,

  status text not null check (status in ('NO_INICIADA','EN_RUTA','FINALIZADA')) default 'NO_INICIADA',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_routes_status on routes(status);

create trigger trg_routes_updated_at
before update on routes
for each row execute function set_updated_at();

-- ============================================================
-- FOLIOS (G####I####)
-- ============================================================

create sequence delivery_folio_seq
  increment 1
  minvalue 1
  maxvalue 99999999
  start 1;

create or replace function generate_delivery_folio()
returns text
language plpgsql
as $$
declare
  v bigint;
  g bigint;
  i bigint;
begin
  v := nextval('delivery_folio_seq');
  g := ((v - 1) / 10000) + 1;
  i := ((v - 1) % 10000) + 1;
  return 'G' || lpad(g::text, 4, '0') || 'I' || lpad(i::text, 4, '0');
end;
$$;

-- ============================================================
-- ENTREGAS
-- - status: PENDIENTE|ENTREGADA|CANCELADA
-- - snapshots para PDF y consistencia histórica
-- ============================================================

create table deliveries (
  id uuid primary key default gen_random_uuid(),

  assignment_id uuid not null references assignments(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,

  customer_id uuid not null references customers(id) on delete restrict,
  order_id uuid references orders(id) on delete set null,

  folio text not null unique default generate_delivery_folio(),

  status text not null check (status in ('PENDIENTE','ENTREGADA','CANCELADA')) default 'PENDIENTE',
  canceled_reason text,

  delivered_at timestamptz,

  -- snapshots (para que el PDF no cambie si el cliente cambia después)
  customer_nombre_snapshot text,
  diner_nombre_snapshot text,
  maps_url_snapshot text,

  -- totales (se recalculan por trigger)
  total_expected numeric not null default 0,
  total_real numeric not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_deliveries_assignment on deliveries(assignment_id);
create index idx_deliveries_route on deliveries(route_id);
create index idx_deliveries_customer on deliveries(customer_id);
create index idx_deliveries_status_created on deliveries(status, created_at desc);

create trigger trg_deliveries_updated_at
before update on deliveries
for each row execute function set_updated_at();

-- Items
create table delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,

  qty_assigned int not null check (qty_assigned > 0),
  qty_real int check (qty_real >= 0),

  precio_aplicado numeric not null check (precio_aplicado >= 0),

  subtotal_expected numeric generated always as (qty_assigned * precio_aplicado) stored,
  subtotal_real numeric generated always as (coalesce(qty_real, qty_assigned) * precio_aplicado) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(delivery_id, product_id)
);

create index idx_delivery_items_delivery on delivery_items(delivery_id);
create index idx_delivery_items_product on delivery_items(product_id);

create trigger trg_delivery_items_updated_at
before update on delivery_items
for each row execute function set_updated_at();

-- ============================================================
-- TRIGGERS: snapshots + totales
-- ============================================================

create or replace function ensure_delivery_snapshots()
returns trigger
language plpgsql
as $$
declare
  v_customer customers%rowtype;
  v_diner diners%rowtype;
begin
  select * into v_customer from customers where id = new.customer_id;

  if new.customer_nombre_snapshot is null then
    new.customer_nombre_snapshot := v_customer.nombre;
  end if;

  if new.maps_url_snapshot is null then
    new.maps_url_snapshot := v_customer.maps_url;
  end if;

  if new.diner_nombre_snapshot is null and v_customer.diner_id is not null then
    select * into v_diner from diners where id = v_customer.diner_id;
    new.diner_nombre_snapshot := v_diner.nombre;
  end if;

  return new;
end;
$$;

create trigger trg_deliveries_snapshots
before insert on deliveries
for each row execute function ensure_delivery_snapshots();

-- Recalcular totales en deliveries cuando cambian delivery_items
create or replace function recalc_delivery_totals()
returns trigger
language plpgsql
as $$
declare
  v_delivery_id uuid;
begin
  v_delivery_id := coalesce(new.delivery_id, old.delivery_id);

  update deliveries d
  set
    total_expected = (
      select coalesce(sum(subtotal_expected),0)
      from delivery_items
      where delivery_id = v_delivery_id
    ),
    total_real = (
      select coalesce(sum(subtotal_real),0)
      from delivery_items
      where delivery_id = v_delivery_id
    ),
    updated_at = now()
  where d.id = v_delivery_id;

  return coalesce(new, old);
end;
$$;

create trigger trg_delivery_items_recalc
after insert or update or delete on delivery_items
for each row execute function recalc_delivery_totals();

-- ============================================================
-- IMPRESORAS (fase 2)
-- ============================================================

create table thermal_printers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,

  printer_name text not null,
  mac_address text unique,
  connection_type text not null check (connection_type in ('bluetooth','usb','wifi')) default 'bluetooth',
  activo boolean not null default true,

  last_connection timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_thermal_printers_updated_at
before update on thermal_printers
for each row execute function set_updated_at();

-- ============================================================
-- NOTIFICACIONES
-- (exactamente 1 target_* debe estar lleno)
-- ============================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),

  target_profile_id uuid references profiles(id) on delete cascade,
  target_driver_id uuid references drivers(id) on delete cascade,
  target_customer_id uuid references customers(id) on delete cascade,

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

create index idx_notifications_profile on notifications(target_profile_id, read, created_at desc);
create index idx_notifications_driver on notifications(target_driver_id, read, created_at desc);
create index idx_notifications_customer on notifications(target_customer_id, read, created_at desc);

-- ============================================================
-- AUDITORÍA
-- ============================================================

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id) on delete set null,
  actor_driver_id uuid references drivers(id) on delete set null,

  entity_type text not null,
  entity_id uuid,
  action text not null,

  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_events_entity on audit_events(entity_type, entity_id, created_at desc);

-- ============================================================
-- FUNCIONES CORE (transaccionales)
-- ============================================================

-- Iniciar ruta: requiere assignment del día activa y km_start
create or replace function fn_start_route(p_assignment_id uuid, p_km_start numeric)
returns uuid
language plpgsql
security definer
as $$
declare
  v_driver_id uuid;
  v_route_id uuid;
begin
  -- Seguridad: admin o driver dueño del assignment
  select a.driver_id into v_driver_id
  from assignments a
  where a.id = p_assignment_id;

  if v_driver_id is null then
    raise exception 'Assignment no existe';
  end if;

  if not (is_admin() or (is_driver() and v_driver_id = current_driver_id())) then
    raise exception 'No autorizado';
  end if;

  insert into routes (assignment_id, km_start, started_at, status)
  values (p_assignment_id, p_km_start, now(), 'EN_RUTA')
  on conflict (assignment_id) do update
    set km_start = excluded.km_start,
        started_at = coalesce(routes.started_at, excluded.started_at),
        status = 'EN_RUTA',
        updated_at = now()
  returning id into v_route_id;

  update drivers set current_status = 'on_route', updated_at = now()
  where id = v_driver_id;

  insert into audit_events (actor_profile_id, actor_driver_id, entity_type, entity_id, action, payload)
  values (auth.uid(), current_driver_id(), 'route', v_route_id, 'START_ROUTE',
          jsonb_build_object('assignment_id', p_assignment_id, 'km_start', p_km_start));

  return v_route_id;
end;
$$;

-- Finalizar ruta: requiere km_end
create or replace function fn_finish_route(p_assignment_id uuid, p_km_end numeric)
returns void
language plpgsql
security definer
as $$
declare
  v_driver_id uuid;
  v_route_id uuid;
  v_km_start numeric;
begin
  select a.driver_id into v_driver_id
  from assignments a
  where a.id = p_assignment_id;

  if v_driver_id is null then
    raise exception 'Assignment no existe';
  end if;

  if not (is_admin() or (is_driver() and v_driver_id = current_driver_id())) then
    raise exception 'No autorizado';
  end if;

  select r.id, r.km_start into v_route_id, v_km_start
  from routes r
  where r.assignment_id = p_assignment_id;

  if v_route_id is null then
    raise exception 'Ruta no iniciada';
  end if;

  if v_km_start is not null and p_km_end < v_km_start then
    raise exception 'km_end no puede ser menor que km_start';
  end if;

  update routes
  set km_end = p_km_end,
      ended_at = now(),
      status = 'FINALIZADA',
      updated_at = now()
  where id = v_route_id;

  update assignments
  set status = 'CERRADA',
      updated_at = now()
  where id = p_assignment_id;

  update drivers set current_status = 'available', updated_at = now()
  where id = v_driver_id;

  insert into audit_events (actor_profile_id, actor_driver_id, entity_type, entity_id, action, payload)
  values (auth.uid(), current_driver_id(), 'route', v_route_id, 'FINISH_ROUTE',
          jsonb_build_object('assignment_id', p_assignment_id, 'km_end', p_km_end));
end;
$$;

-- Confirmar entrega: set status ENTREGADA + delivered_at + qty_real por items
-- p_items = [{product_id, qty_real}, ...]
create or replace function fn_confirm_delivery(p_delivery_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
as $$
declare
  v_assignment_id uuid;
  v_driver_id uuid;
  v_route_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty_real int;
begin
  select d.assignment_id, a.driver_id, d.route_id
  into v_assignment_id, v_driver_id, v_route_id
  from deliveries d
  join assignments a on a.id = d.assignment_id
  where d.id = p_delivery_id;

  if v_assignment_id is null then
    raise exception 'Entrega no existe';
  end if;

  if not (is_admin() or (is_driver() and v_driver_id = current_driver_id())) then
    raise exception 'No autorizado';
  end if;

  -- Actualiza items
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_real := (v_item->>'qty_real')::int;

    update delivery_items
    set qty_real = v_qty_real,
        updated_at = now()
    where delivery_id = p_delivery_id
      and product_id = v_product_id;
  end loop;

  -- Marca entrega
  update deliveries
  set status = 'ENTREGADA',
      delivered_at = now(),
      updated_at = now()
  where id = p_delivery_id;

  insert into audit_events (actor_profile_id, actor_driver_id, entity_type, entity_id, action, payload)
  values (auth.uid(), current_driver_id(), 'delivery', p_delivery_id, 'CONFIRM_DELIVERY',
          jsonb_build_object('items', p_items));
end;
$$;

-- Cancelar entrega (admin)
create or replace function fn_cancel_delivery(p_delivery_id uuid, p_reason text)
returns void
language plpgsql
security definer
as $$
begin
  if not is_admin() then
    raise exception 'Solo admin puede cancelar entregas';
  end if;

  update deliveries
  set status = 'CANCELADA',
      canceled_reason = normalize_text(p_reason),
      updated_at = now()
  where id = p_delivery_id;

  insert into audit_events (actor_profile_id, entity_type, entity_id, action, payload)
  values (auth.uid(), 'delivery', p_delivery_id, 'CANCEL_DELIVERY',
          jsonb_build_object('reason', p_reason));
end;
$$;

-- Convertir pedido APROBADO -> entregas asignadas a chofer (crea assignment si no existe)
-- p_driver_id: chofer destino
-- p_work_date: fecha
create or replace function fn_convert_order_to_deliveries(p_order_id uuid, p_driver_id uuid, p_work_date date)
returns uuid
language plpgsql
security definer
as $$
declare
  v_customer_id uuid;
  v_assignment_id uuid;
  v_delivery_id uuid;
begin
  if not is_admin() then
    raise exception 'Solo admin';
  end if;

  select o.customer_id into v_customer_id
  from orders o
  where o.id = p_order_id and o.status in ('APROBADO','EN_VALIDACION','VISTO','NUEVO');

  if v_customer_id is null then
    raise exception 'Pedido no existe o no es convertible';
  end if;

  -- asegura assignment
  insert into assignments (driver_id, work_date, status, notes)
  values (p_driver_id, coalesce(p_work_date, current_date), 'ACTIVA', 'Generada desde pedido')
  on conflict (driver_id, work_date) do update
    set updated_at = now()
  returning id into v_assignment_id;

  -- crea delivery
  insert into deliveries (assignment_id, customer_id, order_id, status)
  values (v_assignment_id, v_customer_id, p_order_id, 'PENDIENTE')
  returning id into v_delivery_id;

  -- crea items desde order_items
  insert into delivery_items (delivery_id, product_id, qty_assigned, precio_aplicado)
  select
    v_delivery_id,
    oi.product_id,
    oi.qty,
    oi.precio_aplicado
  from order_items oi
  where oi.order_id = p_order_id;

  -- marca pedido como ASIGNADO
  update orders set status = 'ASIGNADO', updated_at = now()
  where id = p_order_id;

  insert into audit_events (actor_profile_id, entity_type, entity_id, action, payload)
  values (auth.uid(), 'order', p_order_id, 'CONVERT_ORDER_TO_DELIVERY',
          jsonb_build_object('driver_id', p_driver_id, 'work_date', p_work_date, 'delivery_id', v_delivery_id));

  return v_delivery_id;
end;
$$;

-- ============================================================
-- VISTAS: dashboards y detalle
-- ============================================================

-- Dashboard admin (hoy)
create or replace view v_admin_dashboard as
select
  (select count(*) from drivers where activo = true) as drivers_activos,
  (select count(*) from customers where activo = true) as clientes_activos,
  (select count(*) from diners where activo = true) as comedores_activos,
  (select count(*) from products where activo = true) as productos_activos,

  (select count(*) from orders where status = 'NUEVO') as pedidos_nuevos,
  (select count(*) from new_customer_requests where status = 'NUEVO') as solicitudes_clientes_nuevos,

  (select count(*)
   from deliveries d
   join assignments a on a.id = d.assignment_id
   where a.work_date = current_date) as entregas_hoy,

  (select count(*)
   from deliveries d
   join assignments a on a.id = d.assignment_id
   where a.work_date = current_date and d.status = 'ENTREGADA') as entregas_completadas_hoy,

  (select coalesce(sum(d.total_real),0)
   from deliveries d
   join assignments a on a.id = d.assignment_id
   where a.work_date = current_date and d.status = 'ENTREGADA') as total_real_hoy;

-- Dashboard chofer (hoy) por chofer
create or replace view v_driver_dashboard_today as
select
  dr.id as driver_id,
  dr.nombre as driver_name,
  dr.current_status,

  a.id as assignment_id,
  a.work_date,
  a.status as assignment_status,

  r.id as route_id,
  r.status as route_status,
  r.km_start, r.km_end,
  r.started_at, r.ended_at,

  (select count(*) from deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') as total_activo,
  (select count(*) from deliveries d where d.assignment_id = a.id and d.status = 'ENTREGADA') as completadas,
  (select count(*) from deliveries d where d.assignment_id = a.id and d.status = 'CANCELADA') as canceladas,

  case
    when (select count(*) from deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') = 0 then 0
    else round(
      (
        (select count(*) from deliveries d where d.assignment_id = a.id and d.status = 'ENTREGADA')::numeric
        /
        (select count(*) from deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA')::numeric
      ) * 100
    ,2)
  end as progress_percent,

  (select coalesce(sum(total_expected),0) from deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') as total_esperado,
  (select coalesce(sum(total_real),0) from deliveries d where d.assignment_id = a.id and d.status <> 'CANCELADA') as total_real

from drivers dr
left join assignments a on a.driver_id = dr.id and a.work_date = current_date and a.status <> 'CANCELADA'
left join routes r on r.assignment_id = a.id;

-- Entregas del día con resumen (para lista chofer)
create or replace view v_driver_deliveries_today as
select
  d.id as delivery_id,
  d.folio,
  d.status,
  d.delivered_at,
  d.total_expected,
  d.total_real,
  d.customer_nombre_snapshot as customer_name,
  d.diner_nombre_snapshot as diner_name,
  d.maps_url_snapshot as maps_url,
  a.driver_id,
  a.work_date
from deliveries d
join assignments a on a.id = d.assignment_id
where a.work_date = current_date;

-- Detalle entrega (para admin/chofer)
create or replace view v_delivery_detail as
select
  d.id as delivery_id,
  d.folio,
  d.status,
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
from deliveries d
join assignments a on a.id = d.assignment_id
join drivers dr on dr.id = a.driver_id
join delivery_items di on di.delivery_id = d.id
join products p on p.id = di.product_id
group by d.id, a.work_date, dr.id;

-- ============================================================
-- RLS (SEGURIDAD)
-- ============================================================

-- Enable RLS
alter table profiles enable row level security;
alter table drivers enable row level security;
alter table diners enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table customer_products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table new_customer_requests enable row level security;
alter table assignments enable row level security;
alter table assignment_load_items enable row level security;
alter table routes enable row level security;
alter table deliveries enable row level security;
alter table delivery_items enable row level security;
alter table thermal_printers enable row level security;
alter table notifications enable row level security;
alter table audit_events enable row level security;

-- PROFILES
create policy "profiles_admin_all"
on profiles for all
using (is_admin())
with check (is_admin());

create policy "profiles_self_read"
on profiles for select
using (id = auth.uid());

create policy "profiles_self_update"
on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- DRIVERS
create policy "drivers_admin_all"
on drivers for all
using (is_admin())
with check (is_admin());

create policy "drivers_self_read"
on drivers for select
using (profile_id = auth.uid());

create policy "drivers_self_update_limited"
on drivers for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

-- DINERS
create policy "diners_admin_manage"
on diners for all
using (is_admin())
with check (is_admin());

create policy "diners_read_authenticated"
on diners for select
using (auth.role() = 'authenticated');

-- CUSTOMERS
create policy "customers_admin_all"
on customers for all
using (is_admin())
with check (is_admin());

create policy "customers_self_read"
on customers for select
using (profile_id = auth.uid());

create policy "customers_read_for_drivers"
on customers for select
using (is_driver()); -- chofer puede leer clientes para entregas/ruta

-- PRODUCTS
create policy "products_admin_manage"
on products for all
using (is_admin())
with check (is_admin());

create policy "products_read_authenticated"
on products for select
using (auth.role() = 'authenticated');

-- CUSTOMER_PRODUCTS
create policy "customer_products_admin_manage"
on customer_products for all
using (is_admin())
with check (is_admin());

create policy "customer_products_customer_read_own"
on customer_products for select
using (is_customer() and customer_id = current_customer_id());

create policy "customer_products_driver_read"
on customer_products for select
using (is_driver());

-- ORDERS
create policy "orders_admin_all"
on orders for all
using (is_admin())
with check (is_admin());

create policy "orders_customer_read_own"
on orders for select
using (is_customer() and customer_id = current_customer_id());

create policy "orders_customer_insert_own"
on orders for insert
with check (is_customer() and customer_id = current_customer_id());

create policy "orders_customer_update_own_limited"
on orders for update
using (is_customer() and customer_id = current_customer_id())
with check (is_customer() and customer_id = current_customer_id());

-- ORDER_ITEMS
create policy "order_items_admin_all"
on order_items for all
using (is_admin())
with check (is_admin());

create policy "order_items_customer_read_own"
on order_items for select
using (
  is_customer()
  and exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.customer_id = current_customer_id()
  )
);

create policy "order_items_customer_insert_own"
on order_items for insert
with check (
  is_customer()
  and exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.customer_id = current_customer_id()
  )
);

-- NEW CUSTOMER REQUESTS
create policy "new_customer_requests_admin_all"
on new_customer_requests for all
using (is_admin())
with check (is_admin());

-- Permitir que cualquiera autenticado inserte (si tu app cliente usa auth)
create policy "new_customer_requests_insert_authenticated"
on new_customer_requests for insert
with check (auth.role() = 'authenticated');

-- ASSIGNMENTS
create policy "assignments_admin_all"
on assignments for all
using (is_admin())
with check (is_admin());

create policy "assignments_driver_read_own"
on assignments for select
using (is_driver() and driver_id = current_driver_id());

-- ASSIGNMENT_LOAD_ITEMS
create policy "assignment_load_items_admin_all"
on assignment_load_items for all
using (is_admin())
with check (is_admin());

create policy "assignment_load_items_driver_read_own"
on assignment_load_items for select
using (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = assignment_load_items.assignment_id
      and a.driver_id = current_driver_id()
  )
);

-- ROUTES
create policy "routes_admin_all"
on routes for all
using (is_admin())
with check (is_admin());

create policy "routes_driver_read_own"
on routes for select
using (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = routes.assignment_id
      and a.driver_id = current_driver_id()
  )
);

create policy "routes_driver_update_own"
on routes for update
using (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = routes.assignment_id
      and a.driver_id = current_driver_id()
  )
)
with check (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = routes.assignment_id
      and a.driver_id = current_driver_id()
  )
);

-- DELIVERIES
create policy "deliveries_admin_all"
on deliveries for all
using (is_admin())
with check (is_admin());

create policy "deliveries_driver_read_own"
on deliveries for select
using (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = deliveries.assignment_id
      and a.driver_id = current_driver_id()
  )
);

create policy "deliveries_driver_update_own"
on deliveries for update
using (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = deliveries.assignment_id
      and a.driver_id = current_driver_id()
  )
)
with check (
  is_driver() and exists (
    select 1 from assignments a
    where a.id = deliveries.assignment_id
      and a.driver_id = current_driver_id()
  )
);

create policy "deliveries_customer_read_own"
on deliveries for select
using (
  is_customer() and deliveries.customer_id = current_customer_id()
);

-- DELIVERY_ITEMS
create policy "delivery_items_admin_all"
on delivery_items for all
using (is_admin())
with check (is_admin());

create policy "delivery_items_driver_read_own"
on delivery_items for select
using (
  is_driver() and exists (
    select 1
    from deliveries d
    join assignments a on a.id = d.assignment_id
    where d.id = delivery_items.delivery_id
      and a.driver_id = current_driver_id()
  )
);

create policy "delivery_items_driver_update_own"
on delivery_items for update
using (
  is_driver() and exists (
    select 1
    from deliveries d
    join assignments a on a.id = d.assignment_id
    where d.id = delivery_items.delivery_id
      and a.driver_id = current_driver_id()
  )
)
with check (
  is_driver() and exists (
    select 1
    from deliveries d
    join assignments a on a.id = d.assignment_id
    where d.id = delivery_items.delivery_id
      and a.driver_id = current_driver_id()
  )
);

create policy "delivery_items_customer_read_own"
on delivery_items for select
using (
  is_customer() and exists (
    select 1
    from deliveries d
    where d.id = delivery_items.delivery_id
      and d.customer_id = current_customer_id()
  )
);

-- THERMAL PRINTERS
create policy "thermal_printers_admin_all"
on thermal_printers for all
using (is_admin())
with check (is_admin());

create policy "thermal_printers_driver_own"
on thermal_printers for select
using (is_driver() and driver_id = current_driver_id());

-- NOTIFICATIONS
create policy "notifications_admin_all"
on notifications for all
using (is_admin())
with check (is_admin());

create policy "notifications_profile_read_own"
on notifications for select
using (target_profile_id = auth.uid());

create policy "notifications_driver_read_own"
on notifications for select
using (is_driver() and target_driver_id = current_driver_id());

create policy "notifications_customer_read_own"
on notifications for select
using (is_customer() and target_customer_id = current_customer_id());

-- AUDIT
create policy "audit_admin_read"
on audit_events for select
using (is_admin());

-- ============================================================
-- GRANTS (opcional, suele estar OK por default en Supabase)
-- ============================================================
-- Nota: Supabase maneja grants por rol; normalmente no necesitas tocar esto.
-- Si algo no te deja leer desde client, revisas en Policies primero.

-- ============================================================
-- SEEDS (MINIMOS - solo si quieres)
-- (puedes borrar esta sección si no quieres datos)
-- ============================================================

insert into products (nombre, kind, ice_type, kg_por_unidad, precio_base, activo)
values
  ('Bolsa Hielo 5kg - Normal',  'bolsa', 'normal',  5, 15.00, true),
  ('Bolsa Hielo 10kg - Normal', 'bolsa', 'normal', 10, 25.00, true),
  ('Bolsa Hielo 5kg - Gourmet', 'bolsa', 'gourmet', 5, 18.00, true),
  ('Barra Hielo 20kg - Normal', 'barra', 'normal', 20, 45.00, true)
on conflict (nombre) do nothing;

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
select
  '✅ OK: esquema FINAL listo (RLS + funciones + vistas)' as status,
  (select count(*) from products) as products,
  (select count(*) from diners) as diners,
  (select count(*) from customers) as customers,
  (select count(*) from drivers) as drivers;
