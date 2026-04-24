'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DriverRow } from '@/lib/types/driver.types';
import { driversService } from '@/lib/services/driver/drivers.services';

import { inventoryDb } from '@/lib/firebase/inventory.client';
import {
  collection,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

type InventoryTransportRow = {
  firebase_id: string;
  firebase_codigo: string;
  firebase_nombre: string;
  firebase_activo: boolean;
};

type DriverInventoryMappingRow = {
  id: string;
  driver_id: string;
  firebase_employee_code: string;
  firebase_employee_name: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DriverMergedRow = DriverRow & {
  firebase_codigo?: string | null;
  firebase_nombre?: string | null;
  firebase_activo?: boolean | null;
  synced_from_inventory?: boolean;
  only_in_inventory?: boolean;
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '').trim();
}

function buildInventoryOnlyRow(t: InventoryTransportRow): DriverMergedRow {
  return {
    id: '',
    profile_id: '',
    nombre: t.firebase_nombre || 'Sin nombre',
    telefono: null,
    activo: t.firebase_activo,
    current_status: 'offline',
    created_at: '',
    updated_at: '',
    firebase_codigo: t.firebase_codigo,
    firebase_nombre: t.firebase_nombre,
    firebase_activo: t.firebase_activo,
    synced_from_inventory: false,
    only_in_inventory: true,
    profiles: null,
  } as DriverMergedRow;
}

async function listDriverInventoryMappings(): Promise<DriverInventoryMappingRow[]> {
  const res = await fetch('/api/admin/driver-inventory-mapping', {
    method: 'GET',
    credentials: 'include',
  });

  const json = await res.json();

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || 'Error cargando mappings de choferes');
  }

  return json.data ?? [];
}

async function listInventoryTransportes(): Promise<InventoryTransportRow[]> {
  const ref = collection(inventoryDb, 'empleados');

  const qy = query(
    ref,
    where('role', '==', 'TRANSPORTE'),
    orderBy('nombre', 'asc'),
    qLimit(300)
  );

  const snap = await getDocs(qy);

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;

    return {
      firebase_id: d.id,
      firebase_codigo: normalizeText(data.codigo),
      firebase_nombre: normalizeText(data.nombre),
      firebase_activo: data.isActive !== false,
    };
  });
}

export function useDrivers() {
  const [rows, setRows] = useState<DriverMergedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const nombre = normalizeText(r.nombre).toLowerCase();
      const telefono = normalizeText(r.telefono).toLowerCase();
      const firebaseNombre = normalizeText(r.firebase_nombre).toLowerCase();
      const firebaseCodigo = normalizeText(r.firebase_codigo).toLowerCase();

      return (
        nombre.includes(s) ||
        telefono.includes(s) ||
        firebaseNombre.includes(s) ||
        firebaseCodigo.includes(s)
      );
    });
  }, [rows, q]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [drivers, mappings, transportes] = await Promise.all([
        driversService.list(),
        listDriverInventoryMappings(),
        listInventoryTransportes(),
      ]);

      const mappingByFirebaseCode = new Map<string, DriverInventoryMappingRow>();
      const mappingByDriverId = new Map<string, DriverInventoryMappingRow>();

      for (const mapping of mappings) {
        const firebaseCode = normalizeText(mapping.firebase_employee_code);
        const driverId = normalizeText(mapping.driver_id);

        if (firebaseCode) {
          mappingByFirebaseCode.set(firebaseCode, mapping);
        }

        if (driverId) {
          mappingByDriverId.set(driverId, mapping);
        }
      }

      const inventoryByCode = new Map<string, InventoryTransportRow>();

      for (const t of transportes) {
        const code = normalizeText(t.firebase_codigo);
        if (code) {
          inventoryByCode.set(code, t);
        }
      }

      const mergedRows: DriverMergedRow[] = [];
      const usedInventoryCodes = new Set<string>();

      // 1) Primero meter todos los choferes de Supabase
      for (const driver of drivers) {
        const driverId = normalizeText(driver.id);
        const mapping = driverId ? mappingByDriverId.get(driverId) : undefined;

        const firebaseCode = normalizeText(mapping?.firebase_employee_code);
        const inventoryMatch = firebaseCode
          ? inventoryByCode.get(firebaseCode)
          : undefined;

        if (inventoryMatch && firebaseCode) {
          usedInventoryCodes.add(firebaseCode);
        }

        const resolvedFirebaseCodigo =
          (inventoryMatch?.firebase_codigo ?? firebaseCode) || null;

        const resolvedFirebaseNombre =
          (inventoryMatch?.firebase_nombre ??
            normalizeText(mapping?.firebase_employee_name)) || null;

        mergedRows.push({
          ...driver,
          firebase_codigo: resolvedFirebaseCodigo,
          firebase_nombre: resolvedFirebaseNombre,
          firebase_activo:
            typeof inventoryMatch?.firebase_activo === 'boolean'
              ? inventoryMatch.firebase_activo
              : null,
          synced_from_inventory: !!inventoryMatch,
          only_in_inventory: false,
        });
      }

      // 2) Luego agregar los que existen solo en inventario
      for (const t of transportes) {
        const code = normalizeText(t.firebase_codigo);
        if (!code) continue;
        if (usedInventoryCodes.has(code)) continue;

        const mapping = mappingByFirebaseCode.get(code);

        if (mapping?.driver_id) {
          mergedRows.push({
            ...buildInventoryOnlyRow(t),
            synced_from_inventory: false,
            only_in_inventory: true,
          });
          usedInventoryCodes.add(code);
          continue;
        }

        mergedRows.push(buildInventoryOnlyRow(t));
        usedInventoryCodes.add(code);
      }

      // 3) Ordenar para UI
      mergedRows.sort((a, b) => {
        const aOnlyInv = a.only_in_inventory ? 1 : 0;
        const bOnlyInv = b.only_in_inventory ? 1 : 0;

        if (aOnlyInv !== bOnlyInv) {
          return aOnlyInv - bOnlyInv;
        }

        const aActivo = a.activo ? 1 : 0;
        const bActivo = b.activo ? 1 : 0;

        if (aActivo !== bActivo) {
          return bActivo - aActivo;
        }

        const aName = normalizeText(a.nombre || a.firebase_nombre).toLowerCase();
        const bName = normalizeText(b.nombre || b.firebase_nombre).toLowerCase();

        return aName.localeCompare(bName, 'es');
      });

      setRows(mergedRows);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Error al cargar choferes';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createDriver = useCallback(
    async (input: {
      nombre: string;
      telefono: string;
      password: string;
      activo?: boolean;
    }) => {
      setBusy(true);
      setError(null);

      try {
        await driversService.create({
          ...input,
          nombre: normalizeText(input.nombre),
          telefono: normalizePhone(input.telefono),
        });

        await reload();
        return true;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Error al crear chofer';
        setError(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const updateDriver = useCallback(
    async (
      id: string,
      patch: {
        nombre?: string;
        telefono?: string;
        activo?: boolean;
        password?: string;
      }
    ) => {
      setBusy(true);
      setError(null);

      try {
        const payload: {
          nombre?: string;
          telefono?: string;
          activo?: boolean;
          password?: string;
        } = {};

        if (typeof patch.nombre === 'string') {
          payload.nombre = normalizeText(patch.nombre);
        }

        if (typeof patch.telefono === 'string') {
          payload.telefono = normalizePhone(patch.telefono);
        }

        if (typeof patch.activo === 'boolean') {
          payload.activo = patch.activo;
        }

        if (typeof patch.password === 'string' && patch.password.trim()) {
          payload.password = patch.password.trim();
        }

        await driversService.update(id, payload);
        await reload();
        return true;
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Error al actualizar chofer';
        setError(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const deleteDriver = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);

      try {
        await driversService.remove(id);
        await reload();
        return true;
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Error al eliminar chofer';
        setError(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  return {
    rows,
    filtered,
    loading,
    busy,
    error,
    q,
    setQ,
    reload,
    createDriver,
    updateDriver,
    deleteDriver,
  };
}