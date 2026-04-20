alter table public.products
add column if not exists stock_actual integer not null default 0;

create index if not exists idx_products_activo on public.products(activo);
create index if not exists idx_products_stock_actual on public.products(stock_actual);