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

type DriverStockRow = {
  product_id: string;
  inventory_product_setting_id: string | null;
  assigned_qty: number | null;
  used_qty: number | null;
  available_qty: number | null;
};

type StockIdentityItem = {
  product_id: string;
  inventory_product_setting_id: string | null;
};

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function bad(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
    },
  );
}

function todayYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year =
    parts.find((part) => part.type === 'year')?.value ?? '';

  const month =
    parts.find((part) => part.type === 'month')?.value ?? '';

  const day =
    parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

function toInt(value: unknown) {
  const n = Number(value);

  return Number.isFinite(n)
    ? Math.trunc(n)
    : 0;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isDeliveredStatus(status: unknown) {
  const s = normalizeText(status);

  return [
    'ENTREGADA',
    'CONFIRMADA',
    'FINALIZADA',
    'COMPLETADA',
    'CERRADA',
    'LIQUIDADA',
  ].includes(s);
}

function toKey(product: any) {
  const name = String(
    product?.nombre || '',
  )
    .trim()
    .toUpperCase();

  let type = String(
    product?.ice_type || '',
  )
    .trim()
    .toUpperCase();

  const kind = String(
    product?.kind || '',
  )
    .trim()
    .toUpperCase();

  const kg = Number(
    product?.kg_por_unidad || 0,
  );

  if (
    type.includes('BARRA') ||
    name.includes('BARRA') ||
    kind.includes('BARRA')
  ) {
    return 'BARRA';
  }

  if (!type || type === 'NORMAL') {
    if (name.includes('GOURMET')) {
      type = 'GOURMET';
    } else if (
      name.includes('FRAPPE') ||
      name.includes('FRAP')
    ) {
      type = 'FRAP';
    } else if (name.includes('ENFRIAR')) {
      type = 'ENFRIAR';
    } else {
      type = 'ROLITO';
    }
  }

  if (
    type === 'FRAPPE' ||
    type === 'FRAP'
  ) {
    type = 'FRAP';
  }

  if (type === 'NORMAL') {
    type = 'ROLITO';
  }

  if (kg > 0) {
    const kgText =
      kg % 1 === 0
        ? String(Math.trunc(kg))
        : String(kg);

    return `${type}_${kgText}`;
  }

  return type;
}


function normalizeInventoryCode(value: unknown) {
  return normalizeText(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildInventorySettingKey(setting: any, product: any) {
  const code =
    normalizeInventoryCode(
      setting?.firebase_bolsa_vacia_codigo,
    );

  const legacyKey =
    toKey({
      nombre:
        setting?.nombre_comercial ??
        product?.nombre,

      ice_type:
        setting?.firebase_tipo_hielo ??
        product?.ice_type,

      kg_por_unidad:
        setting?.peso_kg ??
        product?.kg_por_unidad,

      kind:
        product?.kind,
    });

  if (!code) {
    return legacyKey;
  }

  if (legacyKey === 'BARRA') {
    return `${code}__BARRA`;
  }

  return legacyKey
    ? `${code}__${legacyKey.replace('_', '__')}`
    : code;
}

function stockIdentityKey(
  productId: string,
  settingId: string | null,
) {
  return `${productId}__${settingId || 'LEGACY'}`;
}

/**
 * Busca la asignación del chofer para hoy.
 *
 * Prioridades:
 *
 * 1. Usa assignment_id recibido si es válido.
 * 2. Busca una asignación existente del chofer para hoy.
 * 3. Si no existe, crea una automáticamente.
 *
 * Después reutiliza o crea una ruta.
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

  /*
   * =========================================================
   * ASIGNACIÓN SOLICITADA POR LA APP
   * =========================================================
   */

  if (params.requestedAssignmentId) {
    const {
      data: requestedAssignment,
      error: requestedAssignmentErr,
    } = await sb
      .from('assignments')
      .select(
        'id,driver_id,work_date,status',
      )
      .eq(
        'id',
        params.requestedAssignmentId,
      )
      .maybeSingle();

    if (requestedAssignmentErr) {
      throw requestedAssignmentErr;
    }

    if (!requestedAssignment) {
      throw new Error(
        'No se encontró la asignación enviada por la app',
      );
    }

    if (
      String(
        requestedAssignment.driver_id,
      ) !== params.driverId
    ) {
      throw new Error(
        'La asignación enviada no pertenece al chofer',
      );
    }

    assignmentId = String(
      requestedAssignment.id,
    );
  }

  /*
   * =========================================================
   * BUSCAR ASIGNACIÓN DEL DÍA
   * =========================================================
   */

  if (!assignmentId) {
    const {
      data: existingAssignments,
      error: existingAssignmentErr,
    } = await sb
      .from('assignments')
      .select(
        'id,driver_id,work_date,status,created_at',
      )
      .eq(
        'driver_id',
        params.driverId,
      )
      .eq(
        'work_date',
        workDate,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(1);

    if (existingAssignmentErr) {
      throw existingAssignmentErr;
    }

    const existingAssignment =
      existingAssignments?.[0];

    if (existingAssignment?.id) {
      assignmentId = String(
        existingAssignment.id,
      );
    }
  }

  /*
   * =========================================================
   * CREAR ASIGNACIÓN AUTOMÁTICA
   * =========================================================
   */

  if (!assignmentId) {
    const {
      data: createdAssignment,
      error: createAssignmentErr,
    } = await sb
      .from('assignments')
      .insert({
        driver_id:
          params.driverId,

        work_date:
          workDate,

        status:
          'ACTIVA',

        notes:
          'Asignación automática creada desde venta libre del chofer',
      })
      .select('id')
      .single();

    if (createAssignmentErr) {
      /*
       * Puede suceder si dos solicitudes intentan crear
       * la asignación simultáneamente.
       */

      const {
        data: retryAssignments,
        error: retryErr,
      } = await sb
        .from('assignments')
        .select(
          'id,created_at',
        )
        .eq(
          'driver_id',
          params.driverId,
        )
        .eq(
          'work_date',
          workDate,
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        )
        .limit(1);

      if (retryErr) {
        throw retryErr;
      }

      const retryAssignment =
        retryAssignments?.[0];

      if (!retryAssignment?.id) {
        throw createAssignmentErr;
      }

      assignmentId = String(
        retryAssignment.id,
      );
    } else {
      assignmentId = String(
        createdAssignment.id,
      );

      assignmentCreated = true;
    }
  }

  if (!assignmentId) {
    throw new Error(
      'No fue posible obtener o crear la asignación del chofer',
    );
  }

  /*
   * =========================================================
   * RUTA RECIBIDA DESDE LA APP
   * =========================================================
   */

  if (params.requestedRouteId) {
    const {
      data: requestedRoute,
      error: requestedRouteErr,
    } = await sb
      .from('routes')
      .select(
        'id,assignment_id,status',
      )
      .eq(
        'id',
        params.requestedRouteId,
      )
      .maybeSingle();

    if (requestedRouteErr) {
      throw requestedRouteErr;
    }

    if (!requestedRoute) {
      throw new Error(
        'No se encontró la ruta enviada por la app',
      );
    }

    if (
      String(
        requestedRoute.assignment_id,
      ) !== assignmentId
    ) {
      throw new Error(
        'La ruta enviada no pertenece a la asignación del chofer',
      );
    }

    routeId = String(
      requestedRoute.id,
    );
  }

  /*
   * =========================================================
   * BUSCAR RUTA EXISTENTE
   * =========================================================
   */

  if (!routeId) {
    const {
      data: existingRoutes,
      error: existingRouteErr,
    } = await sb
      .from('routes')
      .select(
        'id,assignment_id,status,created_at',
      )
      .eq(
        'assignment_id',
        assignmentId,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(1);

    if (existingRouteErr) {
      throw existingRouteErr;
    }

    const existingRoute =
      existingRoutes?.[0];

    if (existingRoute?.id) {
      routeId = String(
        existingRoute.id,
      );
    }
  }

  /*
   * =========================================================
   * CREAR RUTA
   * =========================================================
   */

  if (!routeId) {
    const {
      data: createdRoute,
      error: createRouteErr,
    } = await sb
      .from('routes')
      .insert({
        assignment_id:
          assignmentId,

        status:
          'NO_INICIADA',
      })
      .select('id')
      .maybeSingle();

    if (
      !createRouteErr &&
      createdRoute?.id
    ) {
      routeId = String(
        createdRoute.id,
      );

      routeCreated = true;
    } else {
      /*
       * La ruta no es obligatoria para registrar
       * una venta en ruta.
       */
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
 * ============================================================
 * SINCRONIZACIÓN DEL STOCK DEL CHOFER PARA EL DÍA ACTUAL
 * ============================================================
 *
 * driver_stock no tiene work_date. Por eso NO podemos conservar
 * used_qty histórico entre días.
 *
 * Antes de registrar una venta:
 *
 * assigned_qty = todas las salidas reales del día
 * used_qty     = todas las entregas/ventas finalizadas del día
 *
 * Después register_driver_sale suma únicamente la venta nueva.
 *
 * available_qty es generado por PostgreSQL:
 *
 * available_qty = assigned_qty - used_qty
 */
async function ensureDriverStockRows(
  req: Request,
  params: {
    driverId: string;
    assignmentId: string;
    items: StockIdentityItem[];
  },
) {
  const sb = getAdminSupabase();

  /*
   * =========================================================
   * PRODUCTOS ÚNICOS
   * =========================================================
   */

  const uniqueItems =
    Array.from(
      new Map(
        params.items
          .map((item) => {
            const productId =
              String(
                item.product_id || '',
              ).trim();

            const settingId =
              item.inventory_product_setting_id
                ? String(
                    item.inventory_product_setting_id,
                  ).trim()
                : null;

            if (!productId) {
              return null;
            }

            const normalized = {
              product_id:
                productId,

              inventory_product_setting_id:
                settingId,
            };

            return [
              stockIdentityKey(
                productId,
                settingId,
              ),
              normalized,
            ] as const;
          })
          .filter(Boolean) as Array<
            readonly [
              string,
              StockIdentityItem,
            ]
          >,
      ).values(),
    );

  const uniqueProductIds =
    Array.from(
      new Set(
        uniqueItems.map(
          (item) =>
            item.product_id,
        ),
      ),
    );

  const uniqueSettingIds =
    Array.from(
      new Set(
        uniqueItems
          .map(
            (item) =>
              item.inventory_product_setting_id,
          )
          .filter(
            (id): id is string =>
              Boolean(id),
          ),
      ),
    );

  if (
    uniqueItems.length === 0
  ) {
    throw new Error(
      'No hay productos válidos para registrar',
    );
  }

  /*
   * =========================================================
   * ASIGNACIÓN
   * =========================================================
   */

  const {
    data: assignment,
    error: assignmentErr,
  } = await sb
    .from('assignments')
    .select(
      'id,driver_id,work_date',
    )
    .eq(
      'id',
      params.assignmentId,
    )
    .maybeSingle();

  if (assignmentErr) {
    throw assignmentErr;
  }

  if (!assignment) {
    throw new Error(
      'No se encontró la asignación',
    );
  }

  if (
    String(
      assignment.driver_id,
    ) !== params.driverId
  ) {
    throw new Error(
      'La asignación no pertenece al chofer',
    );
  }

  const workDate =
    String(
      assignment.work_date || '',
    ).trim() ||
    todayYmd();

  /*
   * =========================================================
   * CHOFER
   * =========================================================
   */

  const {
    data: driver,
    error: driverErr,
  } = await sb
    .from('drivers')
    .select(
      'id,nombre',
    )
    .eq(
      'id',
      params.driverId,
    )
    .maybeSingle();

  if (driverErr) {
    throw driverErr;
  }

  if (!driver) {
    throw new Error(
      'No se encontró el chofer',
    );
  }

  const driverName =
    String(
      driver.nombre || '',
    ).trim();

  /*
   * =========================================================
   * MAPEO FIREBASE
   * =========================================================
   */

  const {
    data: driverMap,
    error: driverMapErr,
  } = await sb
    .from(
      'driver_inventory_mapping',
    )
    .select(
      'firebase_employee_code,firebase_employee_id',
    )
    .eq(
      'driver_id',
      params.driverId,
    )
    .eq(
      'is_active',
      true,
    )
    .maybeSingle();

  if (driverMapErr) {
    throw driverMapErr;
  }

  const driverCode =
    String(
      driverMap
        ?.firebase_employee_code ||
        driverMap
          ?.firebase_employee_id ||
        '',
    ).trim();

  /*
   * =========================================================
   * LEER TODAS LAS SALIDAS DEL DÍA
   * =========================================================
   */

  const origin =
    new URL(req.url).origin;

  const url =
    new URL(
      '/api/inventory/global-outputs',
      origin,
    );

  url.searchParams.set(
    'date',
    workDate,
  );

  if (driverCode) {
    url.searchParams.set(
      'driverCode',
      driverCode,
    );
  } else {
    url.searchParams.set(
      'driverCode',
      params.driverId,
    );
  }

  if (driverName) {
    url.searchParams.set(
      'driverName',
      driverName,
    );
  }

  const outputsRes =
    await fetch(
      url.toString(),
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

  const outputsJson =
    await outputsRes
      .json()
      .catch(
        () => null,
      );

  if (
    !outputsRes.ok ||
    outputsJson?.ok !== true
  ) {
    console.error(
      '[driver-sales] No se pudieron obtener las salidas globales',
      {
        status:
          outputsRes.status,

        body:
          outputsJson,
      },
    );

    throw new Error(
      'No se pudo consultar el stock actualizado del chofer',
    );
  }

  /*
   * =========================================================
   * qtyByKey
   *
   * Aquí queda:
   *
   * ROLITO_5 -> salida1 + salida2 + salida3...
   * GOURMET_5 -> salida1 + salida2 + salida3...
   * etc.
   * =========================================================
   */

  const qtyByKey =
    new Map<string, number>();

  if (
    outputsJson?.qtyByKey &&
    typeof outputsJson.qtyByKey ===
      'object'
  ) {
    for (
      const [
        key,
        value,
      ] of Object.entries(
        outputsJson.qtyByKey,
      )
    ) {
      const cleanKey =
        String(
          key || '',
        )
          .trim()
          .toUpperCase();

      const qty =
        Math.abs(
          toInt(value),
        );

      if (
        cleanKey &&
        qty > 0
      ) {
        qtyByKey.set(
          cleanKey,
          (
            qtyByKey.get(
              cleanKey,
            ) ?? 0
          ) + qty,
        );
      }
    }
  }


  /*
   * =========================================================
   * qtyByInventoryKey
   *
   * Vista física nueva:
   * BV004__ROLITO__5
   * BV008__ROLITO__5
   * =========================================================
   */

  const qtyByInventoryKey =
    new Map<string, number>();

  if (
    outputsJson?.qtyByInventoryKey &&
    typeof outputsJson.qtyByInventoryKey ===
      'object'
  ) {
    for (
      const [
        key,
        value,
      ] of Object.entries(
        outputsJson.qtyByInventoryKey,
      )
    ) {
      const cleanKey =
        String(
          key || '',
        )
          .trim()
          .toUpperCase();

      const qty =
        Math.abs(
          toInt(value),
        );

      if (
        cleanKey &&
        qty > 0
      ) {
        qtyByInventoryKey.set(
          cleanKey,
          (
            qtyByInventoryKey.get(
              cleanKey,
            ) ?? 0
          ) + qty,
        );
      }
    }
  }

  /*
   * =========================================================
   * CATÁLOGO DE PRODUCTOS
   *
   * Necesitamos TODOS los productos que se intentan vender,
   * no solo los que todavía no existen en driver_stock.
   * =========================================================
   */

  const {
    data: products,
    error: productsErr,
  } = await sb
    .from('products')
    .select(
      'id,nombre,kind,ice_type,kg_por_unidad',
    )
    .in(
      'id',
      uniqueProductIds,
    );

  if (productsErr) {
    throw productsErr;
  }

  const productById =
    new Map<string, any>(
      (
        products || []
      ).map(
        (product: any) => [
          String(product.id),
          product,
        ],
      ),
    );


  /*
   * =========================================================
   * CONFIGURACIONES FÍSICAS
   * =========================================================
   */

  const settingById =
    new Map<string, any>();

  if (
    uniqueSettingIds.length > 0
  ) {
    const {
      data: settings,
      error: settingsErr,
    } = await sb
      .from(
        'inventory_product_settings',
      )
      .select(
        `
        id,
        firebase_bolsa_vacia_codigo,
        firebase_tipo_hielo,
        peso_kg,
        nombre_comercial,
        activo
        `,
      )
      .in(
        'id',
        uniqueSettingIds,
      );

    if (settingsErr) {
      throw settingsErr;
    }

    for (
      const setting of
        settings || []
    ) {
      settingById.set(
        String(
          (setting as any).id,
        ),
        setting,
      );
    }
  }

  /*
   * =========================================================
   * USADO REAL DEL DÍA
   *
   * Se consideran TODAS las asignaciones del chofer para la
   * fecha de trabajo y todas sus entregas/ventas finalizadas.
   * Esto evita arrastrar used_qty de días anteriores.
   * =========================================================
   */

  const {
    data: dayAssignments,
    error: dayAssignmentsErr,
  } = await sb
    .from('assignments')
    .select('id')
    .eq('driver_id', params.driverId)
    .eq('work_date', workDate);

  if (dayAssignmentsErr) {
    throw dayAssignmentsErr;
  }

  const dayAssignmentIds = (dayAssignments ?? [])
    .map((row: any) => String(row?.id || '').trim())
    .filter(Boolean);

  const usedByIdentity = new Map<string, number>();

  if (dayAssignmentIds.length > 0) {
    const {
      data: dayDeliveries,
      error: dayDeliveriesErr,
    } = await sb
      .from('deliveries')
      .select('id,status')
      .in('assignment_id', dayAssignmentIds);

    if (dayDeliveriesErr) {
      throw dayDeliveriesErr;
    }

    const deliveredIds = (dayDeliveries ?? [])
      .filter((row: any) => isDeliveredStatus(row?.status))
      .map((row: any) => String(row?.id || '').trim())
      .filter(Boolean);

    if (deliveredIds.length > 0) {
      const {
        data: dayItems,
        error: dayItemsErr,
      } = await sb
        .from('delivery_items')
        .select('delivery_id,product_id,inventory_product_setting_id,qty_assigned,qty_real')
        .in('delivery_id', deliveredIds)
        .in('product_id', uniqueProductIds);

      if (dayItemsErr) {
        throw dayItemsErr;
      }

      for (const row of dayItems ?? []) {
        const productId = String((row as any)?.product_id || '').trim();

        if (!productId) continue;

        const qty = Math.max(
          0,
          toInt(
            (row as any)?.qty_real ??
              (row as any)?.qty_assigned,
          ),
        );

        if (qty <= 0) continue;

        const settingId =
          (row as any)
            ?.inventory_product_setting_id
            ? String(
                (row as any)
                  .inventory_product_setting_id,
              ).trim()
            : null;

        const identity =
          stockIdentityKey(
            productId,
            settingId,
          );

        usedByIdentity.set(
          identity,
          (
            usedByIdentity.get(
              identity,
            ) ?? 0
          ) + qty,
        );
      }
    }
  }

  /*
   * =========================================================
   * DRIVER STOCK EXISTENTE
   * =========================================================
   */

  const {
    data: existingStockRows,
    error: existingStockErr,
  } = await sb
    .from('driver_stock')
    .select(
      'product_id,inventory_product_setting_id,assigned_qty,used_qty,available_qty',
    )
    .eq(
      'driver_id',
      params.driverId,
    )
    .in(
      'product_id',
      uniqueProductIds,
    );

  if (existingStockErr) {
    throw existingStockErr;
  }

  const existingStockByIdentity =
    new Map<
      string,
      DriverStockRow
    >();

  for (
    const raw of
      existingStockRows || []
  ) {
    const productId =
      String(
        (raw as any)
          .product_id || '',
      ).trim();

    if (!productId) {
      continue;
    }

    const settingId =
      (raw as any)
        .inventory_product_setting_id
        ? String(
            (raw as any)
              .inventory_product_setting_id,
          ).trim()
        : null;

    existingStockByIdentity.set(
      stockIdentityKey(
        productId,
        settingId,
      ),
      {
        product_id:
          productId,

        inventory_product_setting_id:
          settingId,

        assigned_qty:
          toInt(
            (raw as any)
              .assigned_qty,
          ),

        used_qty:
          toInt(
            (raw as any)
              .used_qty,
          ),

        available_qty:
          (raw as any)
            .available_qty ===
            null ||
          (raw as any)
            .available_qty ===
            undefined
            ? null
            : toInt(
                (raw as any)
                  .available_qty,
              ),
      },
    );
  }

  /*
   * =========================================================
   * SINCRONIZAR PRODUCTO POR PRODUCTO
   * =========================================================
   */

  for (
    const item of
      uniqueItems
  ) {
    const productId =
      item.product_id;

    const settingId =
      item.inventory_product_setting_id;

    const product =
      productById.get(
        productId,
      );

    if (!product) {
      throw new Error(
        `No se encontró el producto ${productId}`,
      );
    }

    const productKey =
      toKey(
        product,
      );

    if (!productKey) {
      throw new Error(
        `No se pudo identificar el producto ${productId} en inventario`,
      );
    }

    const setting =
      settingId
        ? settingById.get(
            settingId,
          )
        : null;

    if (
      settingId &&
      !setting
    ) {
      throw new Error(
        `No se encontró la configuración de inventario ${settingId}`,
      );
    }

    const inventoryProductKey =
      setting
        ? buildInventorySettingKey(
            setting,
            product,
          )
        : '';

    /*
     * Si existe setting, exigimos la clave física.
     * No debemos caer silenciosamente a ROLITO_5 para BV004/BV008,
     * porque eso volvería a mezclar normal y maquila.
     */
    let assignedToday = 0;

    if (
      settingId
    ) {
      if (
        !inventoryProductKey
      ) {
        throw new Error(
          `No se pudo construir la clave física para ${settingId}`,
        );
      }

      assignedToday =
        Math.max(
          0,
          toInt(
            qtyByInventoryKey.get(
              inventoryProductKey,
            ) ?? 0,
          ),
        );
    } else {
      assignedToday =
        Math.max(
          0,
          toInt(
            qtyByKey.get(
              productKey,
            ) ?? 0,
          ),
        );
    }

    const identity =
      stockIdentityKey(
        productId,
        settingId,
      );

    const usedToday =
      Math.max(
        0,
        toInt(
          usedByIdentity.get(
            identity,
          ) ?? 0,
        ),
      );

    const existingStock =
      existingStockByIdentity.get(
        identity,
      );

    const nowIso =
      new Date()
        .toISOString();

    if (existingStock) {
      let updateQuery =
        sb
          .from(
            'driver_stock',
          )
          .update({
            assigned_qty:
              assignedToday,

            used_qty:
              usedToday,

            updated_at:
              nowIso,
          })
          .eq(
            'driver_id',
            params.driverId,
          )
          .eq(
            'product_id',
            productId,
          );

      updateQuery =
        settingId
          ? updateQuery.eq(
              'inventory_product_setting_id',
              settingId,
            )
          : updateQuery.is(
              'inventory_product_setting_id',
              null,
            );

      const {
        error: updateStockErr,
      } =
        await updateQuery;

      if (updateStockErr) {
        throw updateStockErr;
      }

      console.log(
        '[driver-sales] driver_stock por setting sincronizado',
        {
          driverId:
            params.driverId,

          productId,

          settingId,

          productKey,

          inventoryProductKey:
            inventoryProductKey ||
            null,

          assignedBefore:
            existingStock
              .assigned_qty,

          usedBefore:
            existingStock
              .used_qty,

          assignedToday,

          usedToday,

          availableBeforeSale:
            Math.max(
              0,
              assignedToday -
                usedToday,
            ),
        },
      );

      continue;
    }

    const {
      error: insertStockErr,
    } = await sb
      .from(
        'driver_stock',
      )
      .insert({
        driver_id:
          params.driverId,

        product_id:
          productId,

        inventory_product_setting_id:
          settingId,

        assigned_qty:
          assignedToday,

        used_qty:
          usedToday,

        updated_at:
          nowIso,
      });

    if (insertStockErr) {
      /*
       * Reintento por posible carrera.
       * Requiere que driver_stock permita identidad por setting.
       */
      let retryQuery =
        sb
          .from(
            'driver_stock',
          )
          .update({
            assigned_qty:
              assignedToday,

            used_qty:
              usedToday,

            updated_at:
              nowIso,
          })
          .eq(
            'driver_id',
            params.driverId,
          )
          .eq(
            'product_id',
            productId,
          );

      retryQuery =
        settingId
          ? retryQuery.eq(
              'inventory_product_setting_id',
              settingId,
            )
          : retryQuery.is(
              'inventory_product_setting_id',
              null,
            );

      const {
        error: retryUpdateErr,
      } =
        await retryQuery;

      if (retryUpdateErr) {
        throw insertStockErr;
      }
    }

    console.log(
      '[driver-sales] driver_stock por setting creado',
      {
        driverId:
          params.driverId,

        productId,

        settingId,

        productKey,

        inventoryProductKey:
          inventoryProductKey ||
          null,

        assignedToday,

        usedToday,

        availableBeforeSale:
          Math.max(
            0,
            assignedToday -
              usedToday,
          ),
      },
    );
  }

}

/**
 * ============================================================
 * REGISTRAR VENTA
 * ============================================================
 */
export async function POST(
  req: Request,
) {
  try {
    const sb =
      getAdminSupabase();

    const body =
      await req
        .json()
        .catch(
          () => ({}),
        );

    const driverId =
      String(
        body?.driver_id ||
          '',
      ).trim();

    const customerId =
      String(
        body?.customer_id ||
          '',
      ).trim();

    const requestedAssignmentId =
      body?.assignment_id
        ? String(
            body.assignment_id,
          ).trim()
        : null;

    const requestedRouteId =
      body?.route_id
        ? String(
            body.route_id,
          ).trim()
        : null;

    const paymentMethod =
      String(
        body?.payment_method ||
          'EFECTIVO',
      )
        .trim()
        .toUpperCase();

    const items =
      Array.isArray(
        body?.items,
      )
        ? body.items
        : [];

    /*
     * =========================================================
     * VALIDACIONES
     * =========================================================
     */

    if (!driverId) {
      return bad(
        'Falta driver_id',
      );
    }

    if (!customerId) {
      return bad(
        'Falta customer_id',
      );
    }

    if (
      items.length === 0
    ) {
      return bad(
        'Agrega al menos un producto',
      );
    }

    const cleanItems:
      CleanSaleItem[] =
      items.map(
        (item: any) => ({
          product_id:
            String(
              item?.product_id ||
                '',
            ).trim(),

          inventory_product_setting_id:
            item
              ?.inventory_product_setting_id
              ? String(
                  item
                    .inventory_product_setting_id,
                ).trim()
              : null,

          quantity:
            toInt(
              item?.quantity,
            ),
        }),
      );

    for (
      const item of
        cleanItems
    ) {
      if (
        !item.product_id
      ) {
        return bad(
          'Producto inválido',
        );
      }

      if (
        !Number.isFinite(
          item.quantity,
        ) ||
        item.quantity <= 0
      ) {
        return bad(
          'Cantidad inválida',
        );
      }
    }

    /*
     * =========================================================
     * ASIGNACIÓN Y RUTA
     * =========================================================
     */

    const {
      assignmentId,
      routeId,
      assignmentCreated,
      routeCreated,
    } =
      await ensureAssignmentAndRoute(
        {
          driverId,
          requestedAssignmentId,
          requestedRouteId,
        },
      );

    /*
     * =========================================================
     * SINCRONIZAR STOCK ANTES DE VENDER
     *
     * Aquí se reflejan:
     *
     * salida 1
     * salida 2
     * salida 3
     * salida 4
     * etc.
     *
     * en driver_stock.assigned_qty.
     * =========================================================
     */

    await ensureDriverStockRows(
      req,
      {
        driverId,
        assignmentId,

        items:
          cleanItems.map(
            (item) => ({
              product_id:
                item.product_id,

              inventory_product_setting_id:
                item.inventory_product_setting_id,
            }),
          ),
      },
    );

    /*
     * =========================================================
     * REGISTRAR VENTA
     *
     * register_driver_sale:
     *
     * - valida available_qty
     * - aumenta used_qty
     * - PostgreSQL recalcula available_qty automáticamente
     * =========================================================
     */

    const {
      data,
      error,
    } = await sb.rpc(
      'register_driver_sale',
      {
        p_driver_id:
          driverId,

        p_customer_id:
          customerId,

        p_assignment_id:
          assignmentId,

        p_route_id:
          routeId,

        p_payment_method:
          paymentMethod,

        p_items:
          cleanItems,
      },
    );

    if (error) {
      throw error;
    }

    const deliveryId =
      String(
        data || '',
      ).trim();

    if (!deliveryId) {
      throw new Error(
        'La venta se registró sin devolver delivery_id',
      );
    }

    /*
     * =========================================================
     * LEER RESULTADO
     * =========================================================
     */

    const {
      data: deliveryRow,
      error: deliveryErr,
    } = await sb
      .from('deliveries')
      .select(
        'id,folio,assignment_id,route_id,customer_nombre_snapshot,delivery_type,created_by_driver,status',
      )
      .eq(
        'id',
        deliveryId,
      )
      .maybeSingle();

    if (deliveryErr) {
      throw deliveryErr;
    }

    return NextResponse.json({
      ok: true,

      delivery_id:
        deliveryId,

      folio:
        deliveryRow?.folio ??
        'VENTA',

      customer_name:
        deliveryRow
          ?.customer_nombre_snapshot ??
        '',

      delivery_type:
        deliveryRow
          ?.delivery_type ??
        'driver_sale',

      created_by_driver:
        deliveryRow
          ?.created_by_driver ??
        true,

      status:
        deliveryRow?.status ??
        'ENTREGADA',

      assignment_id:
        deliveryRow
          ?.assignment_id ??
        assignmentId,

      route_id:
        deliveryRow
          ?.route_id ??
        routeId,

      assignment_created:
        assignmentCreated,

      route_created:
        routeCreated,
    });
  } catch (e: any) {
    console.error(
      '[POST /api/driver-sales]',
      e,
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          e?.message ??
          'Error registrando venta',
      },
      {
        status: 400,
      },
    );
  }
}