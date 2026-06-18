import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

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

function isDeliveredStatus(status: any) {
  const s = normalize(status)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return [
    'ENTREGADA',
    'CONFIRMADA',
    'FINALIZADA',
    'COMPLETADA',
    'CERRADA',
    'LIQUIDADA',
  ].includes(s);
}

function buildProductKey(input: {
  nombre?: any;
  ice_type?: any;
  kg_por_unidad?: any;
  kind?: any;
}) {
  const name = normalize(input.nombre);
  let type = normalize(input.ice_type);
  const kind = normalize(input.kind);
  const kg = toDouble(input.kg_por_unidad);

  if (
    type.includes('BARRA') ||
    name.includes('BARRA') ||
    kind.includes('BARRA')
  ) {
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

  if (!json?.ok || !json?.qtyByKey || typeof json.qtyByKey !== 'object') {
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

export async function GET(req: Request) {
  try {
    const sb = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const customerId = String(searchParams.get('customer_id') || '').trim();
    const driverId = String(searchParams.get('driver_id') || '').trim();

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: 'Falta customer_id' },
        { status: 400 },
      );
    }

    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: 'Falta driver_id' },
        { status: 400 },
      );
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
        driverMap.firebase_employee_code ||
          driverMap.firebase_employee_id ||
          '',
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
            (deliveredByKey.get(key) ?? 0) +
              toInt(item.qty_real ?? item.qty_assigned),
          );
        }
      }
    }

    const { data, error } = await sb
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
      .eq('activo', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = (data ?? [])
      .map((row: any) => {
        const p = row?.products;

        const productKey = buildProductKey({
          nombre: p?.nombre,
          ice_type: p?.ice_type,
          kg_por_unidad: p?.kg_por_unidad,
          kind: p?.kind,
        });

        const outputQty = outputsByKey.get(productKey) ?? 0;
        const deliveredQty = deliveredByKey.get(productKey) ?? 0;
        const availableQty = Math.max(0, outputQty - deliveredQty);

        return {
          customer_product_id: row.id,
          customer_id: row.customer_id,
          product_id: row.product_id,
          product_key: productKey,
          nombre: p?.nombre ?? 'Producto',
          precio: Number(row?.precio_override ?? p?.precio_base ?? 0),
          activo: row?.activo === true,
          product_activo: p?.activo === true,
          kind: p?.kind ?? null,
          ice_type: p?.ice_type ?? null,
          kg_por_unidad: Number(p?.kg_por_unidad ?? 0),

          assigned_qty: outputQty,
          used_qty: deliveredQty,
          available_qty: availableQty,
        };
      })
      .filter((row: any) => row.product_activo === true)
      .sort((a: any, b: any) => {
        if (b.available_qty !== a.available_qty) {
          return b.available_qty - a.available_qty;
        }

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
        outputsByKey: Object.fromEntries(outputsByKey),
        deliveredByKey: Object.fromEntries(deliveredByKey),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error cargando productos del cliente' },
      { status: 400 },
    );
  }
}