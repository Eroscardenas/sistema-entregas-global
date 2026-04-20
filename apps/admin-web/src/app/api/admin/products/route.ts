// src/app/api/admin/products/route.ts

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/supabase/requireAdmin';

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/* =========================================
   CORS
========================================= */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

/* =========================================
   Mapper DB -> UI
========================================= */
function mapProduct(row: any) {
  return {
    id: row?.id ?? '',
    nombre: row?.nombre ?? '',
    precio_base: Number(row?.precio_base ?? 0),
    stock_actual: Math.max(0, Math.trunc(Number(row?.stock_actual ?? 0))),
    activo: row?.activo === true,
    active: row?.activo === true, // compatibilidad temporal con frontend viejo
    kind: row?.kind ?? null,
    ice_type: row?.ice_type ?? null,
    kg_por_unidad: Number(row?.kg_por_unidad ?? 0),
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

/* =========================================
   GET → LISTAR PRODUCTOS
========================================= */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const sb = supabaseAdmin() as any;

    const { data, error } = await sb
      .from('products')
      .select(
        `
        id,
        nombre,
        precio_base,
        stock_actual,
        activo,
        kind,
        ice_type,
        kg_por_unidad,
        created_at,
        updated_at
      `
      )
      .order('created_at', { ascending: false });

    if (error) return bad(error.message);

    return NextResponse.json({
      data: (data ?? []).map(mapProduct),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unauthorized' },
      { status: 401 }
    );
  }
}

/* =========================================
   POST → CREAR PRODUCTO
========================================= */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));

    const nombre = String(body?.nombre ?? '').trim();
    const precio_base = Number(body?.precio_base ?? 0);
    const stock_actual = Number(body?.stock_actual ?? 0);

    // acepta activo o active desde frontend
    const activo =
      body?.activo !== undefined
        ? Boolean(body.activo)
        : Boolean(body?.active ?? true);

    const kind = String(body?.kind ?? 'bolsa').trim();
    const ice_type = String(body?.ice_type ?? 'normal').trim();
    const kg_por_unidad = Number(body?.kg_por_unidad ?? 5);

    if (nombre.length < 2) return bad('Nombre inválido');
    if (!Number.isFinite(precio_base) || precio_base < 0) {
      return bad('Precio inválido');
    }
    if (!Number.isFinite(stock_actual) || stock_actual < 0) {
      return bad('Stock inválido');
    }
    if (!['bolsa', 'barra'].includes(kind)) {
      return bad('kind inválido (bolsa|barra)');
    }
    if (!Number.isFinite(kg_por_unidad) || kg_por_unidad <= 0) {
      return bad('kg_por_unidad inválido');
    }

    const payload = {
      nombre,
      precio_base,
      stock_actual: Math.trunc(stock_actual),
      activo,
      kind,
      ice_type,
      kg_por_unidad,
    };

    const sb = supabaseAdmin() as any;

    const { data, error } = await sb
      .from('products')
      .insert(payload)
      .select(
        `
        id,
        nombre,
        precio_base,
        stock_actual,
        activo,
        kind,
        ice_type,
        kg_por_unidad,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) return bad(error.message);

    return NextResponse.json({
      data: mapProduct(data),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unauthorized' },
      { status: 401 }
    );
  }
}

/* =========================================
   PATCH → EDITAR PRODUCTO
========================================= */
export async function PATCH(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));

    const id = String(body?.id ?? '').trim();
    if (!id) return bad('Missing id');

    const patch: Record<string, any> = {};

    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre ?? '').trim();
      if (nombre.length < 2) return bad('Nombre inválido');
      patch.nombre = nombre;
    }

    if (body?.precio_base !== undefined) {
      const precio = Number(body.precio_base);
      if (!Number.isFinite(precio) || precio < 0) {
        return bad('Precio inválido');
      }
      patch.precio_base = precio;
    }

    if (body?.stock_actual !== undefined) {
      const stock = Number(body.stock_actual);
      if (!Number.isFinite(stock) || stock < 0) {
        return bad('Stock inválido');
      }
      patch.stock_actual = Math.trunc(stock);
    }

    if (body?.activo !== undefined) {
      patch.activo = Boolean(body.activo);
    } else if (body?.active !== undefined) {
      patch.activo = Boolean(body.active);
    }

    if (body?.kind !== undefined) {
      const kind = String(body.kind).trim();
      if (!['bolsa', 'barra'].includes(kind)) {
        return bad('kind inválido');
      }
      patch.kind = kind;
    }

    if (body?.ice_type !== undefined) {
      patch.ice_type = String(body.ice_type).trim();
    }

    if (body?.kg_por_unidad !== undefined) {
      const kg = Number(body.kg_por_unidad);
      if (!Number.isFinite(kg) || kg <= 0) {
        return bad('kg_por_unidad inválido');
      }
      patch.kg_por_unidad = kg;
    }

    if (Object.keys(patch).length === 0) {
      return bad('No fields to update');
    }

    const sb = supabaseAdmin() as any;

    const { data, error } = await sb
      .from('products')
      .update(patch)
      .eq('id', id)
      .select(
        `
        id,
        nombre,
        precio_base,
        stock_actual,
        activo,
        kind,
        ice_type,
        kg_por_unidad,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) return bad(error.message);

    return NextResponse.json({
      data: mapProduct(data),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unauthorized' },
      { status: 401 }
    );
  }
}

/* =========================================
   DELETE → ELIMINAR PRODUCTO
========================================= */
export async function DELETE(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? '').trim();

    if (!id) return bad('Missing id');

    const sb = supabaseAdmin() as any;

    const { error } = await sb.from('products').delete().eq('id', id);

    if (error) return bad(error.message);

    return NextResponse.json({
      ok: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unauthorized' },
      { status: 401 }
    );
  }
}