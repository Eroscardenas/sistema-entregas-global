import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

type ProductSourceRow = {
  source: 'customer_inventory_products' | 'customer_products';
  customer_product_id: string;
  customer_id: string;
  product_id: string;
  inventory_product_setting_id: string | null;
  precio_override: number | null;
  precio_base_setting: number;
  activo: boolean;
  product: any;
  setting: any | null;
};

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function toInt(value: any) {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toDouble(value: any) {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalize(value: any) {
  return String(value || '').trim().toUpperCase();
}

function normalizeText(value: any) {
  return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeIceType(value: any) {
  let s = normalizeText(value);
  if (s === 'FRAPPE') s = 'FRAP';
  if (s === 'NORMAL') s = 'ROLITO';
  return s;
}

function kgFromName(nombre: any) {
  const name = normalizeText(nombre);
  const match = name.match(/(\d+(?:\.\d+)?)\s*KG/);
  if (!match) return 0;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function kgFromProduct(product: any) {
  const kgName = kgFromName(product?.nombre);
  if (kgName > 0) return kgName;

  const kgDb = toDouble(product?.kg_por_unidad);
  return kgDb > 0 ? kgDb : 0;
}

function resolveProductIceType(product: any) {
  const name = normalizeText(product?.nombre);
  let type = normalizeIceType(product?.ice_type);

  if (!type || type === 'NORMAL') {
    if (name.includes('GOURMET')) type = 'GOURMET';
    else if (name.includes('FRAP')) type = 'FRAP';
    else if (name.includes('ENFRIAR')) type = 'ENFRIAR';
    else if (name.includes('BARRA')) type = 'BARRA';
    else type = 'ROLITO';
  }

  return normalizeIceType(type);
}

function productMatchesInventorySetting(product: any, setting: any) {
  const pName = normalizeText(product?.nombre);
  const pKind = normalizeText(product?.kind);
  const pType = resolveProductIceType(product);
  const sType = normalizeIceType(setting?.firebase_tipo_hielo);

  const pKg = kgFromProduct(product);
  const sKg = toDouble(setting?.peso_kg);

  if (!sType) return false;

  if (sType.includes('BARRA')) {
    return pType.includes('BARRA') || pName.includes('BARRA') || pKind.includes('BARRA');
  }

  if (sKg <= 0) return false;

  return pType === sType && Math.abs(pKg - sKg) < 0.001;
}

function isDeliveredStatus(status: any) {
  const s = normalizeText(status);
  return ['ENTREGADA', 'CONFIRMADA', 'FINALIZADA', 'COMPLETADA', 'CERRADA', 'LIQUIDADA'].includes(s);
}

function buildProductKey(input: {
  nombre?: any;
  ice_type?: any;
  kg_por_unidad?: any;
  kind?: any;
}) {
  const name = normalizeText(input.nombre);
  let type = normalizeIceType(input.ice_type);
  const kind = normalizeText(input.kind);

  const kgName = kgFromName(input.nombre);
  const kgDb = toDouble(input.kg_por_unidad);
  const kg = kgName > 0 ? kgName : kgDb;

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

  const kgText =
    kg > 0 ? (Number.isInteger(kg) ? String(Math.trunc(kg)) : String(kg)) : '';

  if (type && kgText) return `${type}_${kgText}`;
  return type || name;
}

async function loadInventoryOutputs(params: {
  req: Request;
  workDate: string;
  driverId: string;
  driverName: string;
  driverCode?: string | null;
}) {
  const url = new URL(params.req.url);
  const origin = url.origin;

  const qs = new URLSearchParams();
  qs.set('date', params.workDate);
  qs.set('driverName', params.driverName);

  if (params.driverCode && params.driverCode.trim()) {
    qs.set('driverCode', params.driverCode.trim());
  } else {
    qs.set('driverCode', params.driverId);
  }

  const res = await fetch(`${origin}/api/inventory/global-outputs?${qs.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) return new Map<string, number>();

  const json = await res.json().catch(() => null);

  if (!json?.ok || !json.qtyByKey || typeof json.qtyByKey !== 'object') {
    return new Map<string, number>();
  }

  const out = new Map<string, number>();

  for (const [keyRaw, qtyRaw] of Object.entries(json.qtyByKey)) {
    const key = String(keyRaw || '').trim().toUpperCase();
    const qty = Math.abs(toInt(qtyRaw));

    if (key && qty > 0) {
      out.set(key, (out.get(key) ?? 0) + qty);
    }
  }

  return out;
}

function parseNullableNumber(value: any) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    const sb = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const customerId = String(searchParams.get('customer_id') || '').trim();
    const driverId = String(searchParams.get('driver_id') || '').trim();

    if (!customerId) {
      return NextResponse.json({ ok: false, error: 'Falta customer_id' }, { status: 400 });
    }

    if (!driverId) {
      return NextResponse.json({ ok: false, error: 'Falta driver_id' }, { status: 400 });
    }

    const workDate = todayYmd();

    const { data: driverRow, error: driverErr } = await sb
      .from('drivers')
      .select('id,nombre')
      .eq('id', driverId)
      .maybeSingle();

    if (driverErr) throw driverErr;

    const driverName = String(driverRow?.nombre || '').trim();

    const { data: assignment, error: assignmentErr } = await sb
      .from('assignments')
      .select('id,driver_id,work_date,status')
      .eq('driver_id', driverId)
      .eq('work_date', workDate)
      .maybeSingle();

    if (assignmentErr) throw assignmentErr;

    let driverCode: string | null = null;

    const { data: driverMap } = await sb
      .from('driver_inventory_mapping')
      .select('firebase_employee_code,firebase_employee_id,firebase_employee_name')
      .eq('driver_id', driverId)
      .eq('is_active', true)
      .maybeSingle();

    if (driverMap) {
      driverCode = String(
        driverMap.firebase_employee_code || driverMap.firebase_employee_id || '',
      ).trim();
    }

    const outputsByKey = await loadInventoryOutputs({
      req,
      workDate,
      driverId,
      driverName,
      driverCode,
    });

    const deliveredByKey = new Map<string, number>();

    if (assignment?.id) {
      const { data: deliveries, error: deliveriesErr } = await sb
        .from('deliveries')
        .select('id,status')
        .eq('assignment_id', assignment.id);

      if (deliveriesErr) throw deliveriesErr;

      const deliveryStatusById = new Map<string, string>();
      const deliveryIds: string[] = [];

      for (const d of deliveries ?? []) {
        const id = String((d as any).id || '').trim();
        if (!id) continue;

        deliveryIds.push(id);
        deliveryStatusById.set(id, String((d as any).status || 'PENDIENTE'));
      }

      if (deliveryIds.length > 0) {
        const { data: items, error: itemsErr } = await sb
          .from('delivery_items')
          .select(
            `
            delivery_id,
            product_id,
            qty_assigned,
            qty_real,
            products:product_id (
              id,
              nombre,
              kind,
              ice_type,
              kg_por_unidad
            )
          `,
          )
          .in('delivery_id', deliveryIds);

        if (itemsErr) throw itemsErr;

        for (const raw of items ?? []) {
          const item = raw as any;
          const deliveryId = String(item.delivery_id || '').trim();
          const status = deliveryStatusById.get(deliveryId) || '';

          if (!isDeliveredStatus(status)) continue;

          const p = item.products;
          if (!p) continue;

          const key = buildProductKey({
            nombre: p.nombre,
            ice_type: p.ice_type,
            kg_por_unidad: p.kg_por_unidad,
            kind: p.kind,
          });

          if (!key) continue;

          deliveredByKey.set(
            key,
            (deliveredByKey.get(key) ?? 0) + toInt(item.qty_real ?? item.qty_assigned),
          );
        }
      }
    }

    const { data: inventoryCustomerProducts, error: inventoryCustomerErr } = await sb
      .from('customer_inventory_products')
      .select(
        `
        id,
        customer_id,
        inventory_product_setting_id,
        precio_override,
        activo,
        created_at,
        inventory_product_settings:inventory_product_setting_id (
          id,
          firebase_tipo_hielo,
          peso_kg,
          nombre_comercial,
          precio_base,
          activo
        )
      `,
      )
      .eq('customer_id', customerId)
      .eq('activo', true)
      .order('created_at', { ascending: true });

    if (inventoryCustomerErr) throw inventoryCustomerErr;

    const { data: productsCatalog, error: productsCatalogErr } = await sb
      .from('products')
      .select('id,nombre,activo,precio_base,kind,ice_type,kg_por_unidad')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (productsCatalogErr) throw productsCatalogErr;

    const { data: legacyCustomerProducts, error: legacyCustomerErr } = await sb
      .from('customer_products')
      .select(
        `
        id,
        customer_id,
        product_id,
        precio_override,
        activo,
        products:product_id (
          id,
          nombre,
          activo,
          precio_base,
          kind,
          ice_type,
          kg_por_unidad
        )
      `,
      )
      .eq('customer_id', customerId)
      .eq('activo', true);

    if (legacyCustomerErr) throw legacyCustomerErr;

    const sourceRows: ProductSourceRow[] = [];

    // ✅ PRIORIDAD 1: precio de Admin > Clientes
    // Tabla nueva real: customer_inventory_products.precio_override
    for (const row of inventoryCustomerProducts ?? []) {
      const setting = (row as any).inventory_product_settings;
      if (!setting || setting.activo !== true) continue;

      const product = (productsCatalog ?? []).find((p: any) =>
        productMatchesInventorySetting(p, setting),
      );

      if (!product) continue;

      const override = parseNullableNumber((row as any).precio_override);
      const precioBaseSetting = toDouble(setting.precio_base);

      sourceRows.push({
        source: 'customer_inventory_products',
        customer_product_id: String((row as any).id),
        customer_id: String((row as any).customer_id),
        product_id: String((product as any).id),
        inventory_product_setting_id: String(setting.id),
        precio_override: override,
        precio_base_setting: precioBaseSetting,
        activo: (row as any).activo === true,
        product,
        setting,
      });
    }

    // ✅ PRIORIDAD 2: fallback viejo customer_products
    // Solo se usa si NO existe ya el mismo product_key desde customer_inventory_products.
    const existingKeys = new Set(
      sourceRows.map((row) =>
        buildProductKey({
          nombre: row.product?.nombre,
          ice_type: row.setting?.firebase_tipo_hielo ?? row.product?.ice_type,
          kg_por_unidad: row.setting?.peso_kg ?? row.product?.kg_por_unidad,
          kind: row.product?.kind,
        }),
      ),
    );

    for (const row of legacyCustomerProducts ?? []) {
      const product = (row as any).products;
      if (!product || product.activo !== true) continue;

      const productKey = buildProductKey({
        nombre: product?.nombre,
        ice_type: product?.ice_type,
        kg_por_unidad: product?.kg_por_unidad,
        kind: product?.kind,
      });

      if (!productKey || existingKeys.has(productKey)) continue;

      const override = parseNullableNumber((row as any).precio_override);

      sourceRows.push({
        source: 'customer_products',
        customer_product_id: String((row as any).id),
        customer_id: String((row as any).customer_id),
        product_id: String((row as any).product_id),
        inventory_product_setting_id: null,
        precio_override: override,
        precio_base_setting: toDouble(product?.precio_base),
        activo: (row as any).activo === true,
        product,
        setting: null,
      });

      existingKeys.add(productKey);
    }

    const rows = sourceRows
      .map((row) => {
        const p = row.product;
        const setting = row.setting;

        const productKey = buildProductKey({
          nombre: p?.nombre,
          ice_type: setting?.firebase_tipo_hielo ?? p?.ice_type,
          kg_por_unidad: setting?.peso_kg ?? p?.kg_por_unidad,
          kind: p?.kind,
        });

        const outputQty = outputsByKey.get(productKey) ?? 0;
        const deliveredQty = deliveredByKey.get(productKey) ?? 0;
        const availableQty = Math.max(0, outputQty - deliveredQty);

        // ✅ PRECIO FINAL:
        // 1. customer_inventory_products.precio_override
        // 2. customer_products.precio_override
        // 3. inventory_product_settings.precio_base
        // 4. products.precio_base
        const precio =
          row.precio_override !== null && Number.isFinite(Number(row.precio_override))
            ? Number(row.precio_override)
            : row.precio_base_setting > 0
              ? row.precio_base_setting
              : toDouble(p?.precio_base);

        return {
          source: row.source,
          customer_product_id: row.customer_product_id,
          customer_id: row.customer_id,

          product_id: row.product_id,
          inventory_product_setting_id: row.inventory_product_setting_id,
          product_key: productKey,

          nombre: setting?.nombre_comercial || p?.nombre || 'Producto',

          precio: Number(precio),
          precio_override: row.precio_override,
          precio_base_setting: row.precio_base_setting,
          precio_base_product: Number(p?.precio_base ?? 0),

          activo: row.activo === true,
          product_activo: p?.activo === true,

          kind: p?.kind ?? null,
          ice_type: setting?.firebase_tipo_hielo ?? p?.ice_type ?? null,
          kg_por_unidad: Number(setting?.peso_kg || kgFromProduct(p) || p?.kg_por_unidad || 0),

          assigned_qty: outputQty,
          used_qty: deliveredQty,
          available_qty: availableQty,
        };
      })
      .filter((row: any) => row.product_activo === true)
      .sort((a: any, b: any) => {
        if (b.available_qty !== a.available_qty) return b.available_qty - a.available_qty;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
      });

    return NextResponse.json({
      ok: true,
      data: rows,
      debug: {
        workDate,
        assignment_id: assignment?.id ?? null,
        driver_id: driverId,
        driver_name: driverName,
        driver_code: driverCode,
        outputsByKey: Object.fromEntries(outputsByKey.entries()),
        deliveredByKey: Object.fromEntries(deliveredByKey.entries()),
        total_customer_inventory_products: inventoryCustomerProducts?.length ?? 0,
        total_customer_products: legacyCustomerProducts?.length ?? 0,
        total_source_rows: sourceRows.length,
        total_rows: rows.length,
        rows_debug: rows.map((r: any) => ({
          source: r.source,
          nombre: r.nombre,
          product_id: r.product_id,
          inventory_product_setting_id: r.inventory_product_setting_id,
          precio: r.precio,
          precio_override: r.precio_override,
          precio_base_setting: r.precio_base_setting,
          precio_base_product: r.precio_base_product,
          product_key: r.product_key,
          assigned_qty: r.assigned_qty,
          used_qty: r.used_qty,
          available_qty: r.available_qty,
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error cargando productos del cliente' },
      { status: 400 },
    );
  }
}