import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';
import { normalizePhoneToLoginEmail } from '@/lib/server/driversLogin';

export async function GET(req: Request) {
  try {
    const sb = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(Number(searchParams.get('limit') || 50), 100);

    let query = sb
      .from('drivers')
      .select(
        `
        id,
        profile_id,
        nombre,
        telefono,
        activo,
        current_status,
        created_at,
        updated_at
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error' },
      { status: 400 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const sb = getAdminSupabase();
    const body = await req.json();

    const nombre = String(body?.nombre || '').trim();
    const telefono = String(body?.telefono || '').trim();
    const password = String(body?.password || '').trim();
    const activo = body?.activo !== false;

    if (nombre.length < 2) throw new Error('Nombre inválido');
    if (telefono.length < 6) throw new Error('Teléfono inválido');
    if (password.length < 6) {
      throw new Error('Contraseña mínima: 6 caracteres');
    }

    const email = normalizePhoneToLoginEmail(telefono);
    if (!email) {
      throw new Error('Teléfono inválido (no se pudo normalizar)');
    }

    const { data: existing } = await sb.auth.admin.listUsers({
      page: 1,
      perPage: 2000,
    });

    const exists = (existing?.users || []).some(
      (u) => (u.email || '').toLowerCase() === email.toLowerCase()
    );

    if (exists) {
      throw new Error('Ya existe un chofer con ese teléfono');
    }

    const { data: created, error: authErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'driver',
        nombre,
        telefono,
      },
    });

    if (authErr) throw authErr;

    const userId = created.user?.id;
    if (!userId) throw new Error('No se pudo crear el usuario');

    const { error: profErr } = await sb.from('profiles').insert({
      id: userId,
      role: 'driver',
      nombre,
      activo,
    });

    if (profErr) throw profErr;

    const { data: pinHash, error: hashErr } = await sb.rpc('hash_pin', {
      p_pin: password,
    });

    if (hashErr) throw hashErr;

    const { data: driver, error: drvErr } = await sb
      .from('drivers')
      .insert({
        profile_id: userId,
        nombre,
        telefono,
        pin_hash: pinHash,
        activo,
        current_status: 'available',
      })
      .select(
        `
        id,
        profile_id,
        nombre,
        telefono,
        activo,
        current_status,
        created_at,
        updated_at
      `
      )
      .single();

    if (drvErr) throw drvErr;

    return NextResponse.json({
      ok: true,
      data: driver,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Error' },
      { status: 400 }
    );
  }
}