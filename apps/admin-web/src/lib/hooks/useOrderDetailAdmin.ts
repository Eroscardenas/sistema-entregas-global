'use client';

// lib/hooks/useOrderDetailAdmin.ts
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

export type OrderDetailItem = {
  product_id: string;
  product_name: string;
  kind: 'bolsa' | 'barra';
  ice_type: string;
  kg_por_unidad: number;
  qty: number;
  precio_aplicado: number;
  subtotal: number;
};

export type OrderDetailUI = {
  order_id: string;
  status: string;
  notes: string | null;
  created_at: string;

  customer_id: string;
  customer_name: string;
  diner_name: string | null;
  capacidad_equipo: string | null;
  maps_url: string | null;

  total: number;
  items: OrderDetailItem[];

  delivery_id?: string | null;
  folio?: string | null;
  work_date?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
};

export type DriverUI = {
  id: string;
  nombre: string;
  activo: boolean;
  current_status: 'available' | 'on_route' | 'offline';
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useOrderDetailAdmin(orderId: string) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [data, setData] = useState<OrderDetailUI | null>(null);
  const [drivers, setDrivers] = useState<DriverUI[]>([]);

  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignDate, setAssignDate] = useState(toYMD(new Date()));

  const load = useCallback(async () => {
    if (!orderId) {
      setData(null);
      setDrivers([]);
      setLoading(false);
      return;
    }

    setErr('');
    setLoading(true);

    try {
      // Detalle del pedido (v_order_detail)
      const { data: od, error: odErr } = await sb
        .from('v_order_detail')
        .select('order_id,status,notes,created_at,customer_id,customer_name,diner_name,capacidad_equipo,maps_url,items,total')
        .eq('order_id', orderId)
        .maybeSingle();

      if (odErr) throw odErr;
      if (!od) throw new Error('Pedido no encontrado');

      const mapped: OrderDetailUI = {
        order_id: String(od.order_id),
        status: String(od.status ?? 'NUEVO'),
        notes: od.notes ?? null,
        created_at: String(od.created_at),

        customer_id: String(od.customer_id),
        customer_name: String(od.customer_name ?? ''),
        diner_name: od.diner_name ?? null,
        capacidad_equipo: od.capacidad_equipo ?? null,
        maps_url: od.maps_url ?? null,

        total: Number(od.total ?? 0),
        items: Array.isArray(od.items) ? od.items : [],
      };

      // Delivery ligado al pedido (si ya se asignó)
      const { data: del, error: delErr } = await sb
        .from('deliveries')
        .select('id,folio,assignment_id,created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (delErr) throw delErr;

      const delivery = (del ?? [])[0] ?? null;
      if (delivery) {
        mapped.delivery_id = String(delivery.id);
        mapped.folio = String(delivery.folio);
        const assignmentId = String(delivery.assignment_id);

        const { data: asg, error: asgErr } = await sb
          .from('assignments')
          .select('id,work_date,driver_id')
          .eq('id', assignmentId)
          .maybeSingle();

        if (asgErr) throw asgErr;

        if (asg) {
          mapped.work_date = String(asg.work_date);
          mapped.driver_id = String(asg.driver_id);

          const { data: drv, error: drvErr } = await sb
            .from('drivers')
            .select('id,nombre')
            .eq('id', asg.driver_id)
            .maybeSingle();

          if (drvErr) throw drvErr;
          if (drv) mapped.driver_name = String(drv.nombre);
        }
      }

      setData(mapped);

      // Choferes para asignar
      const { data: ds, error: dErr } = await sb
        .from('drivers')
        .select('id,nombre,activo,current_status')
        .order('nombre', { ascending: true });

      if (dErr) throw dErr;

      const driversMapped: DriverUI[] = (ds ?? []).map((r: any) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        activo: Boolean(r.activo ?? true),
        current_status: String(r.current_status ?? 'available'),
      }));

      setDrivers(driversMapped);

      const first = driversMapped.find((x) => x.activo) ?? null;
      if (first && !assignDriverId) setAssignDriverId(first.id);
    } catch (e: any) {
      setErr(safeErr(e));
      setData(null);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [orderId, assignDriverId]);

  useEffect(() => {
    load();
  }, [load]);

  const setOrderStatus = useCallback(
    async (next: string) => {
      if (!orderId) return;
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
    },
    [orderId, load]
  );

  const runAssign = useCallback(async () => {
    if (!orderId || !assignDriverId) return null;

    setBusy(true);
    setErr('');
    try {
      const { data: deliveryId, error } = await sb.rpc('fn_convert_order_to_deliveries', {
        p_order_id: orderId,
        p_driver_id: assignDriverId,
        p_work_date: assignDate,
      });

      if (error) throw error;

      await load();
      return deliveryId ?? null;
    } catch (e: any) {
      setErr(safeErr(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [orderId, assignDriverId, assignDate, load]);

  const canAssign = useMemo(() => data?.status === 'APROBADO', [data?.status]);

  return {
    loading,
    busy,
    err,
    setErr,

    data,

    drivers,
    assignDriverId,
    setAssignDriverId,
    assignDate,
    setAssignDate,

    load,
    setOrderStatus,
    canAssign,
    runAssign,
  };
}