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
    const data = d.data() as any;

    return {
      firebase_id: d.id,
      firebase_codigo: String(data.codigo ?? '').trim(),
      firebase_nombre: String(data.nombre ?? '').trim(),
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
      const nombre = (r.nombre || '').toLowerCase();
      const telefono = (r.telefono || '').toLowerCase();
      const firebaseNombre = (r.firebase_nombre || '').toLowerCase();
      const firebaseCodigo = (r.firebase_codigo || '').toLowerCase();

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

      const mappingByCode = new Map(
        mappings.map((m) => [m.firebase_employee_code, m])
      );

      const driverById = new Map(
        drivers.map((d) => [d.id, d])
      );

      const merged: DriverMergedRow[] = transportes.map((t) => {
        const mapping = mappingByCode.get(t.firebase_codigo);
        const driver = mapping?.driver_id ? driverById.get(mapping.driver_id) : null;

        if (driver) {
          return {
            ...driver,
            firebase_codigo: t.firebase_codigo,
            firebase_nombre: t.firebase_nombre,
            firebase_activo: t.firebase_activo,
            synced_from_inventory: true,
            only_in_inventory: false,
          };
        }

        return {
          id: '',
          profile_id: '',
          nombre: t.firebase_nombre,
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
        };
      });

      setRows(merged);
    } catch (e: any) {
      setError(e?.message ?? 'Error al cargar choferes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const createDriver = useCallback(
    async (input: { nombre: string; telefono: string; password: string; activo?: boolean }) => {
      setBusy(true);
      setError(null);

      try {
        await driversService.create(input);
        await reload();
        return true;
      } catch (e: any) {
        setError(e?.message ?? 'Error al crear chofer');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const updateDriver = useCallback(
    async (id: string, patch: { nombre?: string; telefono?: string; activo?: boolean; password?: string }) => {
      setBusy(true);
      setError(null);

      try {
        await driversService.update(id, patch);
        await reload();
        return true;
      } catch (e: any) {
        setError(e?.message ?? 'Error al actualizar');
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
      } catch (e: any) {
        setError(e?.message ?? 'Error al eliminar');
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