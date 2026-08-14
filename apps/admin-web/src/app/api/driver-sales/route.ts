import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

type CleanSaleItem = {
  product_id: string;
  inventory_product_setting_id: string | null;
  quantity: number;
};

type AssignmentRouteResult = {
  assignmentId: string;
  routeId: string | null;
  assignmentCreated: boolean;
  routeCreated: boolean;
};

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function todayYmd() {
  const now = new Date();

  return `${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

function toInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
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

/**
 * Busca la asignación del chofer para hoy.
 *
 * Prioridades:
 * 1. Usa assignment_id recibido si es válido y pertenece al chofer.
 * 2. Busca una asignación existente del chofer para hoy.
 * 3. Si no existe, crea una asignación automática.
 *
 * Después intenta reutilizar o crear una ruta. La ruta es opcional porque
 * deliveries.route_id permite null y no queremos impedir una venta si la
 * tabla routes tiene una restricción adicional no contemplada.
 */
async function ensureAssignmentAndRoute(params: {
  driverId: string;
  requestedAssignmentId: string | null;
  requestedRouteId: string | null;
}): Promise<AssignmentRouteResult> {
  const sb = getAdminSupabase();
  const workDate = todayYmd();

  let assignmentId: string | null = null;
  let routeId: string | null = null;
  let assignmentCreated = false;
  let routeCreated = false;

  if (params.requestedAssignmentId) {
    const { data: requestedAssignment, error: requestedAssignmentErr } = await sb
      .from('assignments')
      .select('id,driver_id,work_date,status')
      .eq('id', params.requestedAssignmentId)
      .maybeSingle();

    if (requestedAssignmentErr) throw requestedAssignmentErr;

    if (!requestedAssignment) {
      throw new Error('No se encontró la asignación enviada por la app');
    }

    if (String(requestedAssignment.driver_id) !== params.driverId) {
      throw new Error('La asignación enviada no pertenece al chofer');
    }

    assignmentId = String(requestedAssignment.id);
  }

  if (!assignmentId) {
    const { data: existingAssignments, error: existingAssignmentErr } = await sb
      .from('assignments')
      .select('id,driver_id,work_date,status,created_at')
      .eq('driver_id', params.driverId)
      .eq('work_date', workDate)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingAssignmentErr) throw existingAssignmentErr;

    const existingAssignment = existingAssignments?.[0];

    if (existingAssignment?.id) {
      assignmentId = String(existingAssignment.id);
    }
  }

  if (!assignmentId) {
    const { data: createdAssignment, error: createAssignmentErr } = await sb
      .from('assignments')
      .insert({
        driver_id: params.driverId,
        work_date: workDate,
        status: 'ACTIVA',
        notes: 'Asignación automática creada desde venta libre del chofer',
      })
      .select('id')
      .single();

    if (createAssignmentErr) {
      // Puede ocurrir si dos solicitudes intentan crear la asignación a la vez.
      // En ese caso volvemos a buscar la asignación del día.
      const { data: retryAssignments, error: retryErr } = await sb
        .from('assignments')
        .select('id,created_at')
        .eq('driver_id', params.driverId)
        .eq('work_date', workDate)
        .order('created_at', { ascending: false })
        .limit(1);

      if (retryErr) throw retryErr;

      const retryAssignment = retryAssignments?.[0];

      if (!retryAssignment?.id) {
        throw createAssignmentErr;
      }

      assignmentId = String(retryAssignment.id);
    } else {
      assignmentId = String(createdAssignment.id);
      assignmentCreated = true;
    }
  }

  if (!assignmentId) {
    throw new Error('No fue posible obtener o crear la asignación del chofer');
  }

  if (params.requestedRouteId) {
    const { data: requestedRoute, error: requestedRouteErr } = await sb
      .from('routes')
      .select('id,assignment_id,status')
      .eq('id', params.requestedRouteId)
      .maybeSingle();

    if (requestedRouteErr) throw requestedRouteErr;

    if (!requestedRoute) {
      throw new Error('No se encontró la ruta enviada por la app');
    }

    if (String(requestedRoute.assignment_id) !== assignmentId) {
      throw new Error('La ruta enviada no pertenece a la asignación del chofer');
    }

    routeId = String(requestedRoute.id);
  }

  if (!routeId) {
    const { data: existingRoutes, error: existingRouteErr } = await sb
      .from('routes')
      .select('id,assignment_id,status,created_at')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingRouteErr) throw existingRouteErr;

    const existingRoute = existingRoutes?.[0];

    if (existingRoute?.id) {
      routeId = String(existingRoute.id);
    }
  }

  if (!routeId) {
    const { data: createdRoute, error: createRouteErr } = await sb
      .from('routes')
      .insert({
        assignment_id: assignmentId,
        status: 'NO_INICIADA',
      })
      .select('id')
      .maybeSingle();

    if (!createRouteErr && createdRoute?.id) {
      routeId = String(createdRoute.id);
      routeCreated = true;
    } else {
      // La ruta no es obligatoria para registrar la venta.
      // Si la tabla requiere otros campos, continuamos con route_id = null.
      routeId = null;
    }
  }

  return {
    assignmentId,
    routeId,
    assignmentCreated,
    routeCreated,
  };
}

/**
 * Mantiene compatibilidad con el flujo anterior:
 *
 * - Si ya existe driver_stock para el producto, NO lo sobrescribe.
 * - Si falta la fila, intenta inicializarla usando salidas globales.
 * - La función register_driver_sale sigue siendo la responsable de consumir
 *   el stock al confirmar la venta.
 */
async function ensureDriverStockRows(
  req: Request,
  params: {
    driverId: string;
    assignmentId: string;
    productIds: string[];
  },
) {
  const sb = getAdminSupabase();

  const uniqueProductIds = Array.from(
    new Set(params.productIds.map((id) => String(id || '').trim()).filter(Boolean)),
  );

  if (uniqueProductIds.length === 0) {
    throw new Error('No hay productos válidos para registrar');
  }

  const { data: existingStockRows, error: existingStockErr } = await sb
    .from('driver_stock')
    .select('product_id,assigned_qty,used_qty,available_qty')
    .eq('driver_id', params.driverId)
    .in('product_id', uniqueProductIds);

  if (existingStockErr) throw existingStockErr;

  const existingProductIds = new Set(
    (existingStockRows || [])
      .map((row: any) => String(row.product_id || '').trim())
      .filter(Boolean),
  );

  const missingProductIds = uniqueProductIds.filter(
    (productId) => !existingProductIds.has(productId),
  );

  if (missingProductIds.length === 0) {
    return;
  }

  const { data: assignment, error: assignmentErr } = await sb
    .from('assignments')
    .select('id,driver_id,work_date')
    .eq('id', params.assignmentId)
    .maybeSingle();

  if (assignmentErr) throw assignmentErr;
  if (!assignment) throw new Error('No se encontró la asignación');

  if (String(assignment.driver_id) !== params.driverId) {
    throw new Error('La asignación no pertenece al chofer');
  }

  const workDate = String(assignment.work_date || '').trim() || todayYmd();

  const { data: driver, error: driverErr } = await sb
    .from('drivers')
    .select('id,nombre')
    .eq('id', params.driverId)
    .maybeSingle();

  if (driverErr) throw driverErr;
  if (!driver) throw new Error('No se encontró el chofer');

  const driverName = String(driver.nombre || '').trim();

  const { data: driverMap, error: driverMapErr } = await sb
    .from('driver_inventory_mapping')
    .select('firebase_employee_code,firebase_employee_id')
    .eq('driver_id', params.driverId)
    .eq('is_active', true)
    .maybeSingle();

  if (driverMapErr) throw driverMapErr;

  const driverCode = String(
    driverMap?.firebase_employee_code || driverMap?.firebase_employee_id || '',
  ).trim();

  const origin = new URL(req.url).origin;
  const url = new URL('/api/inventory/global-outputs', origin);

  url.searchParams.set('date', workDate);

  if (driverCode) {
    url.searchParams.set('driverCode', driverCode);
  } else {
    url.searchParams.set('driverCode', params.driverId);
  }

  if (driverName) {
    url.searchParams.set('driverName', driverName);
  }

  const outputsRes = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
  });

  const outputsJson = await outputsRes.json().catch(() => null);

  const qtyByKey = new Map<string, number>();

  if (outputsRes.ok && outputsJson?.ok === true && outputsJson?.qtyByKey) {
    for (const [key, value] of Object.entries(outputsJson.qtyByKey)) {
      const cleanKey = String(key || '').trim().toUpperCase();
      const qty = Math.abs(toInt(value));

      if (cleanKey && qty > 0) {
        qtyByKey.set(cleanKey, (qtyByKey.get(cleanKey) || 0) + qty);
      }
    }
  }

  const { data: products, error: productsErr } = await sb
    .from('products')
    .select('id,nombre,kind,ice_type,kg_por_unidad')
    .in('id', missingProductIds);

  if (productsErr) throw productsErr;

  const productById = new Map(
    (products || []).map((product: any) => [String(product.id), product]),
  );

  const rowsToInsert = missingProductIds.map((productId) => {
    const product = productById.get(productId);
    const productKey = toKey(product);
    const assignedQty = Math.max(0, toInt(qtyByKey.get(productKey) || 0));

    return {
      driver_id: params.driverId,
      product_id: productId,
      assigned_qty: assignedQty,
      used_qty: 0,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: insertStockErr } = await sb
    .from('driver_stock')
    .upsert(rowsToInsert, {
      onConflict: 'driver_id,product_id',
      ignoreDuplicates: true,
    });

  if (insertStockErr) throw insertStockErr;
}

export async function POST(req: Request) {
  try {
    const sb = getAdminSupabase();
    const body = await req.json().catch(() => ({}));

    const driverId = String(body?.driver_id || '').trim();
    const customerId = String(body?.customer_id || '').trim();

    const requestedAssignmentId = body?.assignment_id
      ? String(body.assignment_id).trim()
      : null;

    const requestedRouteId = body?.route_id
      ? String(body.route_id).trim()
      : null;

    const paymentMethod = String(body?.payment_method || 'EFECTIVO')
      .trim()
      .toUpperCase();

    const items = Array.isArray(body?.items) ? body.items : [];

    if (!driverId) return bad('Falta driver_id');
    if (!customerId) return bad('Falta customer_id');
    if (items.length === 0) return bad('Agrega al menos un producto');

    const cleanItems: CleanSaleItem[] = items.map((item: any) => ({
      product_id: String(item?.product_id || '').trim(),
      inventory_product_setting_id: item?.inventory_product_setting_id
        ? String(item.inventory_product_setting_id).trim()
        : null,
      quantity: toInt(item?.quantity),
    }));

    for (const item of cleanItems) {
      if (!item.product_id) {
        return bad('Producto inválido');
      }

      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return bad('Cantidad inválida');
      }
    }

    const { assignmentId, routeId, assignmentCreated, routeCreated } =
      await ensureAssignmentAndRoute({
        driverId,
        requestedAssignmentId,
        requestedRouteId,
      });

    await ensureDriverStockRows(req, {
      driverId,
      assignmentId,
      productIds: cleanItems.map((item) => item.product_id),
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

    if (!deliveryId) {
      throw new Error('La venta se registró sin devolver delivery_id');
    }

    const { data: deliveryRow, error: deliveryErr } = await sb
      .from('deliveries')
      .select(
        'id,folio,assignment_id,route_id,customer_nombre_snapshot,delivery_type,created_by_driver,status',
      )
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

      assignment_id: deliveryRow?.assignment_id ?? assignmentId,
      route_id: deliveryRow?.route_id ?? routeId,
      assignment_created: assignmentCreated,
      route_created: routeCreated,
    });
  } catch (e: any) {
    console.error('[POST /api/driver-sales]', e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? 'Error registrando venta',
      },
      { status: 400 },
    );
  }
}