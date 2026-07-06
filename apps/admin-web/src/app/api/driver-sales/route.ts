import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

type CleanSaleItem = {
  product_id: string;
  inventory_product_setting_id: string | null;
  quantity: number;
};

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toKey(product: any) {
  const name = String(product?.nombre || '').toUpperCase();
  let type = String(product?.ice_type || '').toUpperCase();
  const kind = String(product?.kind || '').toUpperCase();
  const kg = Number(product?.kg_por_unidad || 0);

  if (type.includes('BARRA') || name.includes('BARRA') || kind.includes('BARRA')) {
    return 'BARRA';
  }

  if (!type || type === 'NORMAL') {
    if (name.includes('GOURMET')) type = 'GOURMET';
    else if (name.includes('FRAP')) type = 'FRAP';
    else if (name.includes('ENFRIAR')) type = 'ENFRIAR';
    else type = 'ROLITO';
  }

  if (type === 'FRAPPE') type = 'FRAP';
  if (type === 'NORMAL') type = 'ROLITO';

  return kg > 0 ? `${type}_${kg % 1 === 0 ? Math.trunc(kg) : kg}` : type;
}

async function syncDriverStockBeforeSale(
  req: Request,
  params: {
    driverId: string;
    assignmentId: string | null;
    productIds: string[];
  },
) {
  const sb = getAdminSupabase();

  if (!params.assignmentId) {
    throw new Error('La venta no tiene assignment_id');
  }

  const { data: assignment, error: assignmentErr } = await sb
    .from('assignments')
    .select('id, driver_id, work_date')
    .eq('id', params.assignmentId)
    .maybeSingle();

  if (assignmentErr) throw assignmentErr;
  if (!assignment) throw new Error('No se encontró la asignación');

  if (String(assignment.driver_id) !== params.driverId) {
    throw new Error('La asignación no pertenece al chofer');
  }

  const workDate = String(assignment.work_date || '').trim();
  if (!workDate) throw new Error('La asignación no tiene fecha');

  const { data: driver, error: driverErr } = await sb
    .from('drivers')
    .select('id, nombre')
    .eq('id', params.driverId)
    .maybeSingle();

  if (driverErr) throw driverErr;

  const driverName = String(driver?.nombre || '').trim();

  const { data: driverMap, error: driverMapErr } = await sb
    .from('driver_inventory_mapping')
    .select('firebase_employee_code, firebase_employee_id')
    .eq('driver_id', params.driverId)
    .eq('is_active', true)
    .maybeSingle();

  if (driverMapErr) throw driverMapErr;

  const driverCode = String(
    driverMap?.firebase_employee_code ||
      driverMap?.firebase_employee_id ||
      '',
  ).trim();

  const origin = new URL(req.url).origin;
  const url = new URL('/api/inventory/global-outputs', origin);

  url.searchParams.set('date', workDate);
  if (driverCode) url.searchParams.set('driverCode', driverCode);
  if (driverName) url.searchParams.set('driverName', driverName);

  const outputsRes = await fetch(url.toString(), { cache: 'no-store' });
  const outputsJson = await outputsRes.json().catch(() => null);

  if (!outputsRes.ok || outputsJson?.ok !== true) {
    throw new Error(outputsJson?.error || 'No se pudieron leer salidas globales');
  }

  const qtyByKeyRaw = outputsJson?.qtyByKey || {};
  const qtyByKey = new Map<string, number>();

  for (const [key, value] of Object.entries(qtyByKeyRaw)) {
    const cleanKey = String(key || '').trim().toUpperCase();
    const qty = Math.abs(Math.trunc(Number(value || 0)));

    if (cleanKey && qty > 0) {
      qtyByKey.set(cleanKey, (qtyByKey.get(cleanKey) || 0) + qty);
    }
  }

  const uniqueProductIds = Array.from(new Set(params.productIds.filter(Boolean)));

  const { data: products, error: productsErr } = await sb
    .from('products')
    .select('id, nombre, kind, ice_type, kg_por_unidad')
    .in('id', uniqueProductIds);

  if (productsErr) throw productsErr;

  const productById = new Map((products || []).map((p: any) => [String(p.id), p]));

  const { data: deliveries, error: deliveriesErr } = await sb
    .from('deliveries')
    .select('id, status')
    .eq('assignment_id', params.assignmentId)
    .eq('status', 'ENTREGADA');

  if (deliveriesErr) throw deliveriesErr;

  const deliveredIds = (deliveries || [])
    .map((d: any) => String(d.id))
    .filter(Boolean);

  const usedByProduct = new Map<string, number>();

  if (deliveredIds.length > 0) {
    const { data: usedItems, error: usedErr } = await sb
      .from('delivery_items')
      .select('product_id, qty_real')
      .in('delivery_id', deliveredIds);

    if (usedErr) throw usedErr;

    for (const item of usedItems || []) {
      const productId = String((item as any).product_id || '');
      const qty = Math.trunc(Number((item as any).qty_real || 0));

      if (productId && qty > 0) {
        usedByProduct.set(productId, (usedByProduct.get(productId) || 0) + qty);
      }
    }
  }

  const stockRows = uniqueProductIds.map((productId: string) => {
    const product = productById.get(productId);
    const key = toKey(product);
    const assignedQty = Math.trunc(Number(qtyByKey.get(key) || 0));
    const usedQty = Math.trunc(Number(usedByProduct.get(productId) || 0));

    return {
      driver_id: params.driverId,
      product_id: productId,
      assigned_qty: assignedQty,
      used_qty: usedQty,
      updated_at: new Date().toISOString(),
    };
  });

  if (stockRows.length === 0) {
    throw new Error('No hay productos para sincronizar stock');
  }

  const { error: upsertErr } = await sb
    .from('driver_stock')
    .upsert(stockRows, { onConflict: 'driver_id,product_id' });

  if (upsertErr) throw upsertErr;
}

export async function POST(req: Request) {
  try {
    const sb = getAdminSupabase();
    const body = await req.json().catch(() => ({}));

    const driverId = String(body?.driver_id || '').trim();
    const customerId = String(body?.customer_id || '').trim();
    const assignmentId = body?.assignment_id ? String(body.assignment_id).trim() : null;
    const routeId = body?.route_id ? String(body.route_id).trim() : null;
    const paymentMethod = String(body?.payment_method || 'EFECTIVO')
      .trim()
      .toUpperCase();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!driverId) return bad('Falta driver_id');
    if (!customerId) return bad('Falta customer_id');
    if (!assignmentId) return bad('Falta assignment_id');
    if (items.length === 0) return bad('Agrega al menos un producto');

    const cleanItems: CleanSaleItem[] = items.map((item: any) => ({
      product_id: String(item?.product_id || '').trim(),
      inventory_product_setting_id: item?.inventory_product_setting_id
        ? String(item.inventory_product_setting_id).trim()
        : null,
      quantity: Math.trunc(Number(item?.quantity || 0)),
    }));

    for (const item of cleanItems) {
      if (!item.product_id) return bad('Producto inválido');

      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return bad('Cantidad inválida');
      }
    }

    await syncDriverStockBeforeSale(req, {
      driverId,
      assignmentId,
      productIds: cleanItems.map((x) => x.product_id),
    });

    const { data, error } = await sb.rpc('register_driver_sale', {
      p_driver_id: driverId,
      p_customer_id: customerId,
      p_assignment_id: assignmentId,
      p_route_id: routeId,
      p_payment_method: paymentMethod,
      p_items: cleanItems,
    });

    if (error) throw error;

    const deliveryId = String(data || '').trim();

    const { data: deliveryRow, error: deliveryErr } = await sb
      .from('deliveries')
      .select('id, folio, customer_nombre_snapshot, delivery_type, created_by_driver, status')
      .eq('id', deliveryId)
      .maybeSingle();

    if (deliveryErr) throw deliveryErr;

    return NextResponse.json({
      ok: true,
      delivery_id: deliveryId,
      folio: deliveryRow?.folio ?? 'VENTA',
      customer_name: deliveryRow?.customer_nombre_snapshot ?? '',
      delivery_type: deliveryRow?.delivery_type ?? 'driver_sale',
      created_by_driver: deliveryRow?.created_by_driver ?? true,
      status: deliveryRow?.status ?? 'ENTREGADA',
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error registrando venta' },
      { status: 400 },
    );
  }
}