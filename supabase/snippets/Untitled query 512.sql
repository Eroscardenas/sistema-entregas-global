alter table public.deliveries
add column if not exists payment_method text;

update public.deliveries
set payment_method = coalesce(payment_method, 'EFECTIVO')
where payment_method is null;

create or replace function public.fn_confirm_delivery(
  p_delivery_id uuid,
  p_items jsonb,
  p_payment_method text default 'EFECTIVO'
)
returns void
language plpgsql
security definer
as $$
declare
  v_total_real numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty_real integer;
  v_precio numeric;
begin
  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_real := coalesce((v_item->>'qty_real')::integer, 0);

    update public.delivery_items
    set qty_real = v_qty_real
    where delivery_id = p_delivery_id
      and product_id = v_product_id;

    select coalesce(precio_aplicado, 0)
    into v_precio
    from public.delivery_items
    where delivery_id = p_delivery_id
      and product_id = v_product_id
    limit 1;

    v_total_real := v_total_real + (coalesce(v_qty_real, 0) * coalesce(v_precio, 0));
  end loop;

  update public.deliveries
  set
    status = 'ENTREGADA',
    delivered_at = now(),
    total_real = v_total_real,
    payment_method = case
      when upper(coalesce(p_payment_method, 'EFECTIVO')) = 'CREDITO' then 'CREDITO'
      else 'EFECTIVO'
    end
  where id = p_delivery_id;
end;
$$;