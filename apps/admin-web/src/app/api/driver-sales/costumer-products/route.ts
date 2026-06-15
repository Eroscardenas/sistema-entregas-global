import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

export async function OPTIONS() {
  return new Response(null, { status: 204 });
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
        { status: 400 }
      );
    }

    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: 'Falta driver_id' },
        { status: 400 }
      );
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
          kind,
          ice_type,
          kg_por_unidad
        )
      `
      )
      .eq('customer_id', customerId)
      .eq('activo', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const productIds = (data ?? [])
      .map((row: any) => row?.product_id)
      .filter(Boolean);

    const { data: stockRows, error: stockErr } = await sb
      .from('driver_stock')
      .select(
        `
        product_id,
        assigned_qty,
        used_qty,
        available_qty
      `
      )
      .eq('driver_id', driverId)
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000']);

    if (stockErr) throw stockErr;

    const stockByProduct = new Map(
      (stockRows ?? []).map((s: any) => [String(s.product_id), s])
    );

    const rows = (data ?? [])
      .map((row: any) => {
        const p = row?.products;
        const stock = stockByProduct.get(String(row.product_id));

        return {
          customer_product_id: row.id,
          customer_id: row.customer_id,
          product_id: row.product_id,
          nombre: p?.nombre ?? 'Producto',
          precio: Number(row?.precio_override ?? 0),
          activo: row?.activo === true,
          product_activo: p?.activo === true,
          kind: p?.kind ?? null,
          ice_type: p?.ice_type ?? null,
          kg_por_unidad: Number(p?.kg_por_unidad ?? 0),
          assigned_qty: Math.trunc(Number(stock?.assigned_qty ?? 0)),
          used_qty: Math.trunc(Number(stock?.used_qty ?? 0)),
          available_qty: Math.max(0, Math.trunc(Number(stock?.available_qty ?? 0))),
        };
      })
      .filter((row: any) => row.product_activo === true);

    return NextResponse.json({
      ok: true,
      data: rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error cargando productos del cliente' },
      { status: 400 }
    );
  }
}