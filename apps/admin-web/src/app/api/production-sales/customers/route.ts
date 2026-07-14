import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req: Request) {
  try {
    const sb = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const q = String(searchParams.get('q') || '').trim();

    if (q.length < 2) {
      return NextResponse.json({
        ok: true,
        data: [],
      });
    }

    const { data: customers, error } = await sb
      .from('customers')
      .select(
        `
        id,
        nombre,
        telefono,
        maps_url,
        activo,
        diner_id
      `
      )
      .eq('activo', true)
      .ilike('nombre', `%${q}%`)
      .order('nombre', { ascending: true })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: customers ?? [],
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error buscando clientes';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}