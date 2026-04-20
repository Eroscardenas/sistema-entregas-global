import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/server/supabaseAdmin';
import { normalizePhoneToLoginEmail } from '@/lib/server/driversLogin';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const sb = getAdminSupabase();
    const { id } = await ctx.params;
    const driverId = String(id || '').trim();
    if (!driverId) throw new Error('ID inválido');

    const body = await req.json();

    const nombre = body?.nombre !== undefined ? String(body.nombre).trim() : undefined;
    const telefono = body?.telefono !== undefined ? String(body.telefono).trim() : undefined;
    const activo = body?.activo !== undefined ? Boolean(body.activo) : undefined;
    const password = body?.password !== undefined ? String(body.password).trim() : undefined;

    if (nombre !== undefined && nombre.length < 2) throw new Error('Nombre inválido');
    if (telefono !== undefined && telefono.length < 6) throw new Error('Teléfono inválido');
    if (password !== undefined && password.length > 0 && password.length < 6) {
      throw new Error('Contraseña mínima: 6 caracteres');
    }

    // 1) Cargar driver actual
    const { data: current, error: curErr } = await sb
      .from('drivers')
      .select('id, profile_id, nombre, telefono, activo')
      .eq('id', driverId)
      .single();

    if (curErr) throw curErr;
    if (!current) throw new Error('Chofer no encontrado');

    const profileId = String(current.profile_id || '');
    if (!profileId) throw new Error('Chofer sin profile_id');

    const nextNombre = nombre ?? String(current.nombre ?? '');
    const nextTelefono = telefono ?? String(current.telefono ?? '');
    const nextActivo = activo ?? Boolean(current.activo);

    // 2) Si cambió teléfono => actualizar email en Auth + evitar duplicados
    if (telefono !== undefined && telefono !== current.telefono) {
      const newEmail = normalizePhoneToLoginEmail(nextTelefono);
      if (!newEmail) throw new Error('Teléfono inválido (no se pudo normalizar)');

      const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
      const exists = (existing?.users || []).some((u) => {
        const em = (u.email || '').toLowerCase();
        return em === newEmail.toLowerCase() && u.id !== profileId;
      });
      if (exists) throw new Error('Ya existe un chofer con ese teléfono');

      const { error: updEmailErr } = await sb.auth.admin.updateUserById(profileId, {
        email: newEmail,
        email_confirm: true,
        user_metadata: { role: 'driver', nombre: nextNombre, telefono: nextTelefono },
      });
      if (updEmailErr) throw updEmailErr;
    } else if (nombre !== undefined) {
      // si solo cambió nombre, sincroniza metadata
      const { error: updMetaErr } = await sb.auth.admin.updateUserById(profileId, {
        user_metadata: { role: 'driver', nombre: nextNombre, telefono: nextTelefono },
      });
      if (updMetaErr) throw updMetaErr;
    }

    // 3) Si cambió password => actualizar en Auth + pin_hash
    let pinHash: string | null = null;
    if (password !== undefined && password.length > 0) {
      const { error: updPassErr } = await sb.auth.admin.updateUserById(profileId, { password });
      if (updPassErr) throw updPassErr;

      const { data: hash, error: hashErr } = await sb.rpc('hash_pin', { p_pin: password });
      if (hashErr) throw hashErr;
      pinHash = String(hash);
    }

    // 4) Actualizar profiles
    const profPatch: Record<string, any> = {};
    if (nombre !== undefined) profPatch.nombre = nextNombre;
    if (activo !== undefined) profPatch.activo = nextActivo;

    if (Object.keys(profPatch).length > 0) {
      const { error: profErr } = await sb.from('profiles').update(profPatch).eq('id', profileId);
      if (profErr) throw profErr;
    }

    // 5) Actualizar drivers
    const drvPatch: Record<string, any> = {};
    if (nombre !== undefined) drvPatch.nombre = nextNombre;
    if (telefono !== undefined) drvPatch.telefono = nextTelefono;
    if (activo !== undefined) drvPatch.activo = nextActivo;
    if (pinHash) drvPatch.pin_hash = pinHash;

    const { data: updated, error: updErr } = await sb
      .from('drivers')
      .update(drvPatch)
      .eq('id', driverId)
      .select(
        `
        id,
        profile_id,
        nombre,
        telefono,
        activo,
        current_status,
        created_at,
        updated_at,
        profiles:profile_id ( id, role, nombre, activo )
      `
      )
      .single();

    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const sb = getAdminSupabase();
    const { id } = await ctx.params;
    const driverId = String(id || '').trim();
    if (!driverId) throw new Error('ID inválido');

    const { data: current, error: curErr } = await sb
      .from('drivers')
      .select('id, profile_id')
      .eq('id', driverId)
      .single();

    if (curErr) throw curErr;
    if (!current) throw new Error('Chofer no encontrado');

    const profileId = String(current.profile_id || '');
    if (!profileId) throw new Error('Chofer sin profile_id');

    // 1) borrar drivers
    const { error: drvDelErr } = await sb.from('drivers').delete().eq('id', driverId);
    if (drvDelErr) throw drvDelErr;

    // 2) borrar profiles
    const { error: profDelErr } = await sb.from('profiles').delete().eq('id', profileId);
    if (profDelErr) throw profDelErr;

    // 3) borrar auth user
    const { error: authDelErr } = await sb.auth.admin.deleteUser(profileId);
    if (authDelErr) throw authDelErr;

    return NextResponse.json({ ok: true, data: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 400 });
  }
}