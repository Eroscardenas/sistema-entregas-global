alter table public.deliveries
add column if not exists priority integer default 50;

update public.deliveries
set priority = 50
where priority is null;