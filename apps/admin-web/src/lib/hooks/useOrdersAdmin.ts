'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

const sb = supabaseBrowser as unknown as any;

function safeErr(e: any) {
  return (
    (typeof e?.message === 'string' && e.message) ||
    (typeof e?.error_description === 'string' && e.error_description) ||
    'Ocurrió un error.'
  );
}

export type OrderStatus =
  | 'NUEVO'
  | 'VISTO'
  | 'EN_VALIDACION'
  | 'APROBADO'
  | 'ASIGNADO'
  | 'RECHAZAZADO'
  | 'RECHAZADO'
  | 'CANCELADO';

export type OrderRowUI = {
  order_id: string;
  status: OrderStatus;
  notes: string | null;
  created_at: string;

  customer_id: string;
  customer_name: string;
  diner_name: string | null;
  maps_url: string | null;

  total: number;
  items_count: number;
};

export type DriverUI = {
  id: string;
  nombre: string;
  activo: boolean;
  current_status: 'available' | 'on_route' | 'offline';
};

const STATUS_STEPS: OrderStatus[] = ['NUEVO', 'VISTO', 'EN_VALIDACION', 'APROBADO', 'ASIGNADO'];

function statusStepIndex(s: OrderStatus) {
  const i = STATUS_STEPS.indexOf(s);
  if (i >= 0) return i;
  // rechazado/cancelado => tratamos como “fuera de flujo”
  return -1;
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useOrdersAdmin() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | OrderStatus>('ALL');

  const [rows, setRows] = useState<OrderRowUI[]>([]);
  const [drivers, setDrivers] = useState<DriverUI[]>([]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOrderId, setAssignOrderId] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<string>('');
  const [assignDate, setAssignDate] = useState<string>(toYMD(new Date()));

  const summary = useMemo(() => {
    const total = rows.length;
    const nuevo = rows.filter(r => r.status === 'NUEVO').length;
    const aprob = rows.filter(r => r.status === 'APROBADO').length;
    const asign = rows.filter(r => r.status === 'ASIGNADO').length;
    const totalMoney = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
    return { total, nuevo, aprob, asign, totalMoney };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = rows;

    if (status !== 'ALL') base = base.filter(r => r.status === status);

    if (!s) return base;
    return base.filter(r => {
      return (
        r.customer_name.toLowerCase().includes(s) ||
        String(r.diner_name ?? '').toLowerCase().includes(s) ||
        String(r.order_id).toLowerCase().includes(s)
      );
    });
  }, [rows, q, status]);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      // Pedidos + totales e items (v_order_detail)
      const oRes = await sb
        .from('v_order_detail')
        .select('order_id,status,notes,created_at,customer_id,customer_name,diner_name,capacidad_equipo,maps_url,items,total')
        .order('created_at', { ascending: false });

      if (oRes.error) throw oRes.error;

      const mapped: OrderRowUI[] = (oRes.data ?? []).map((r: any) => ({
        order_id: String(r.order_id),
        status: String(r.status ?? 'NUEVO'),
        notes: r.notes ?? null,
        created_at: String(r.created_at),

        customer_id: String(r.customer_id),
        customer_name: String(r.customer_name ?? ''),
        diner_name: r.diner_name ?? null,
        maps_url: r.maps_url ?? null,

        total: Number(r.total ?? 0),
        items_count: Array.isArray(r.items) ? r.items.length : 0,
      }));

      setRows(mapped);

      // Choferes (para asignación)
      const dRes = await sb
        .from('drivers')
        .select('id,nombre,activo,current_status')
        .order('nombre', { ascending: true });

      if (dRes.error) throw dRes.error;

      const driversMapped: DriverUI[] = (dRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        activo: Boolean(r.activo ?? true),
        current_status: String(r.current_status ?? 'available'),
      }));

      setDrivers(driversMapped);

      // default driver en modal
      const first = driversMapped.find(d => d.activo) ?? null;
      if (first && !assignDriverId) setAssignDriverId(first.id);
    } catch (e: any) {
      setErr(safeErr(e));
      setRows([]);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [assignDriverId]);

  useEffect(() => {
    load();
  }, [load]);

  const setOrderStatus = useCallback(async (orderId: string, next: OrderStatus) => {
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.from('orders').update({ status: next }).eq('id', orderId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const openAssign = useCallback((orderId: string) => {
    setAssignOrderId(orderId);
    setAssignDate(toYMD(new Date()));
    const first = drivers.find(d => d.activo) ?? null;
    if (first) setAssignDriverId(first.id);
    setAssignOpen(true);
  }, [drivers]);

  const runAssign = useCallback(async () => {
    if (!assignOrderId || !assignDriverId) return;

    setBusy(true);
    setErr('');
    try {
      const { data, error } = await sb.rpc('fn_convert_order_to_deliveries', {
        p_order_id: assignOrderId,
        p_driver_id: assignDriverId,
        p_work_date: assignDate,
      });
      if (error) throw error;
      // data = delivery_id (según tu function)
      setAssignOpen(false);
      setAssignOrderId(null);
      await load();
      return data ?? null;
    } catch (e: any) {
      setErr(safeErr(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [assignOrderId, assignDriverId, assignDate, load]);

  return {
    loading,
    busy,
    err,
    setErr,

    q,
    setQ,
    status,
    setStatus,

    rows,
    filtered,
    summary,

    drivers,

    assignOpen,
    setAssignOpen,
    assignOrderId,
    assignDriverId,
    setAssignDriverId,
    assignDate,
    setAssignDate,

    load,
    setOrderStatus,
    openAssign,
    runAssign,

    statusStepIndex,
    STATUS_STEPS,
  };
}