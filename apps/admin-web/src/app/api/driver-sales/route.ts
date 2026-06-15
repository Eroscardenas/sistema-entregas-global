import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const sb = getAdminSupabase();
    const body = await req.json().catch(() => ({}));

    const driverId = String(body?.driver_id || '').trim();
    const customerId = String(body?.customer_id || '').trim();
    const assignmentId = body?.assignment_id ? String(body.assignment_id).trim() : null;
    const routeId = body?.route_id ? String(body.route_id).trim() : null;
    const paymentMethod = String(body?.payment_method || 'cash').trim();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!driverId) return bad('Falta driver_id');
    if (!customerId) return bad('Falta customer_id');
    if (items.length === 0) return bad('Agrega al menos un producto');

    const cleanItems = items.map((item: any) => ({
      product_id: String(item?.product_id || '').trim(),
      quantity: Math.trunc(Number(item?.quantity || 0)),
    }));

    for (const item of cleanItems) {
      if (!item.product_id) return bad('Producto inválido');
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return bad('Cantidad inválida');
      }
    }

    const { data, error } = await sb.rpc('register_driver_sale', {
      p_driver_id: driverId,
      p_customer_id: customerId,
      p_assignment_id: assignmentId,
      p_route_id: routeId,
      p_payment_method: paymentMethod,
      p_items: cleanItems,
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      delivery_id: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error registrando venta' },
      { status: 400 }
    );
  }
}