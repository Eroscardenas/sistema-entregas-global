-- =========================================
-- FIX RLS RECURSIVO EN profiles / auth funcs
-- =========================================

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin'
     from public.profiles p
     where p.id = auth.uid()
     limit 1),
    false
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'driver'
     from public.profiles p
     where p.id = auth.uid()
     limit 1),
    false
  );
$$;

create or replace function public.is_customer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'customer'
     from public.profiles p
     where p.id = auth.uid()
     limit 1),
    false
  );
$$;

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.drivers d
  where d.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.customers c
  where c.profile_id = auth.uid()
  limit 1;
$$;

-- Permisos de ejecución
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_driver() to authenticated;
grant execute on function public.is_customer() to authenticated;
grant execute on function public.current_driver_id() to authenticated;
grant execute on function public.current_customer_id() to authenticated;