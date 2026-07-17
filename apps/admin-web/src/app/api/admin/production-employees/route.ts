import { NextResponse } from 'next/server';

import { getInventoryFirestoreAdmin } from '@/lib/server/inventoryFirebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normalize(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isEmployeeActive(data: Record<string, unknown>): boolean {
  if (data.isActive === false) {
    return false;
  }

  const status = normalize(
    data.status ??
      data.estado ??
      'ACTIVO',
  );

  return status !== 'INACTIVO';
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}

export async function GET() {
  try {
    const db = getInventoryFirestoreAdmin();

    const snapshot = await db
      .collection('empleados')
      .get();

    const employees = snapshot.docs
      .map((document) => {
        const data =
          document.data() as Record<string, unknown>;

        const role = normalize(data.role);

        const codigo = normalize(
          data.codigo ??
            document.id,
        );

        const nombre = clean(
          data.nombre ??
            data.name ??
            codigo,
        );

        if (role !== 'PRODUCCION') {
          return null;
        }

        if (!isEmployeeActive(data)) {
          return null;
        }

        if (!codigo || !nombre) {
          return null;
        }

        return {
          id: document.id,
          document_id: document.id,
          codigo,
          nombre,
          role,
        };
      })
      .filter(
        (
          employee,
        ): employee is {
          id: string;
          document_id: string;
          codigo: string;
          nombre: string;
          role: string;
        } => employee !== null,
      )
      .sort((a, b) =>
        a.nombre.localeCompare(
          b.nombre,
          'es',
          {
            sensitivity: 'base',
          },
        ),
      );

    return NextResponse.json({
      ok: true,
      data: employees,
      meta: {
        total: employees.length,
        source: 'firestore.empleados',
        role: 'PRODUCCION',
      },
    });
  } catch (error: unknown) {
    console.error(
      '[admin/production-employees] error:',
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los empleados de Producción.';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}