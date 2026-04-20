'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

const sb = supabaseBrowser as unknown as any;

type DriverUI = {
  id: string;
  nombre: string;
  activo: boolean;
  current_status: 'available' | 'on_route' | 'offline';
};

type DinerUI = { id: string; nombre: string; activo: boolean };

type CustomerUI = {
  id: string;
  nombre: string;
  activo: boolean;
  telefono?: string | null;
  maps_url?: string | null;
  diner_id?: string | null;
  diner_nombre?: string | null;
  capacidad_equipo?: string | null;
};

type ProductUI = {
  id: string;
  nombre: string;
  kind: 'bolsa' | 'barra';
  ice_type: string;
  kg_por_unidad: number;
  precio_base: number;
  active: boolean;
};

type AssignmentUI = {
  id: string;
  driver_id: string;
  work_date: string; // YYYY-MM-DD
  status: 'ACTIVA' | 'CERRADA' | 'CANCELADA';
  notes?: string | null;
  created_at?: string | null;
  driver_nombre?: string | null;
};

type LoadItemUI = {
  id: string;
  assignment_id: string;
  product_id: string;
  qty: number;
  product_nombre?: string | null;
};

type DeliveryUI = {
  id: string;
  assignment_id: string;
  route_id: string | null;
  customer_id: string;
  order_id: string | null;

  folio: string;
  status: 'PENDIENTE' | 'ENTREGADA' | 'CANCELADA';
  delivered_at?: string | null;

  customer_nombre_snapshot?: string | null;
  diner_nombre_snapshot?: string | null;
  maps_url_snapshot?: string | null;

  total_expected: number;
  total_real: number;

  created_at?: string | null;
};

type DeliveryItemUI = {
  id: string;
  delivery_id: string;
  product_id: string;
  qty_assigned: number;
  qty_real: number | null;
  precio_aplicado: number;
  subtotal_expected: number;
  subtotal_real: number;
  product_nombre?: string | null;
};

type CustomerProductUI = {
  id: string;
  customer_id: string;
  product_id: string;
  precio_override: number | null;
  activo: boolean;
};

function safeErr(e: unknown) {
  const anyE = e as any;
  return (
    (typeof anyE?.message === 'string' && anyE.message) ||
    (typeof anyE?.error_description === 'string' && anyE.error_description) ||
    'Ocurrió un error.'
  );
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useAssignmentsAdmin() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [drivers, setDrivers] = useState<DriverUI[]>([]);
  const [diners, setDiners] = useState<DinerUI[]>([]);
  const [customers, setCustomers] = useState<CustomerUI[]>([]);
  const [products, setProducts] = useState<ProductUI[]>([]);
  const [customerProducts, setCustomerProducts] = useState<CustomerProductUI[]>([]);

  const [assignments, setAssignments] = useState<AssignmentUI[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const [loadItems, setLoadItems] = useState<LoadItemUI[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryUI[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemUI[]>([]);

  const dinersById = useMemo(() => new Map(diners.map((d) => [d.id, d])), [diners]);
  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const customersEnriched = useMemo(() => {
    return customers.map((c) => ({
      ...c,
      diner_nombre: c.diner_id ? dinersById.get(c.diner_id)?.nombre ?? null : null,
    }));
  }, [customers, dinersById]);

  const selectedAssignment = useMemo(() => {
    if (!selectedAssignmentId) return null;
    return assignments.find((a) => a.id === selectedAssignmentId) ?? null;
  }, [assignments, selectedAssignmentId]);

  const deliveryItemsByDeliveryId = useMemo(() => {
    const m = new Map<string, DeliveryItemUI[]>();
    for (const it of deliveryItems) {
      if (!m.has(it.delivery_id)) m.set(it.delivery_id, []);
      m.get(it.delivery_id)!.push(it);
    }
    return m;
  }, [deliveryItems]);

  const customerOverridesByCustomer = useMemo(() => {
    const m = new Map<string, Map<string, CustomerProductUI>>();
    for (const cp of customerProducts) {
      if (!m.has(cp.customer_id)) m.set(cp.customer_id, new Map());
      m.get(cp.customer_id)!.set(cp.product_id, cp);
    }
    return m;
  }, [customerProducts]);

  const refreshAll = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const [dRes, diRes, cRes, pRes, cpRes, aRes] = await Promise.all([
        sb.from('drivers').select('id,nombre,activo,current_status').order('nombre', { ascending: true }),
        sb.from('diners').select('id,nombre,activo').order('nombre', { ascending: true }),
        sb
          .from('customers')
          .select('id,nombre,activo,telefono,maps_url,diner_id,capacidad_equipo,created_at')
          .order('created_at', { ascending: false }),
        sb
          .from('products')
          .select('id,nombre,kind,ice_type,kg_por_unidad,precio_base,active')
          .order('nombre', { ascending: true }),
        sb.from('customer_products').select('id,customer_id,product_id,precio_override,activo'),
        sb
          .from('assignments')
          .select('id,driver_id,work_date,status,notes,created_at')
          .order('work_date', { ascending: false })
          .limit(200),
      ]);

      for (const r of [dRes, diRes, cRes, pRes, cpRes, aRes]) {
        if (r.error) throw r.error;
      }

      const driversMapped: DriverUI[] = (dRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        activo: Boolean(r.activo ?? true),
        current_status: (r.current_status ?? 'available') as any,
      }));

      const dinersMapped: DinerUI[] = (diRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        activo: Boolean(r.activo ?? true),
      }));

      const customersMapped: CustomerUI[] = (cRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        activo: Boolean(r.activo ?? true),
        telefono: r.telefono ?? null,
        maps_url: r.maps_url ?? null,
        diner_id: r.diner_id ? String(r.diner_id) : null,
        capacidad_equipo: r.capacidad_equipo ?? null,
      }));

      const productsMapped: ProductUI[] = (pRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        kind: String(r.kind ?? 'bolsa') as any,
        ice_type: String(r.ice_type ?? 'normal'),
        kg_por_unidad: Number(r.kg_por_unidad ?? 0),
        precio_base: Number(r.precio_base ?? 0),
        active: Boolean(r.active ?? true),
      }));

      const cps: CustomerProductUI[] = (cpRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        customer_id: String(r.customer_id),
        product_id: String(r.product_id),
        precio_override: r.precio_override === null || r.precio_override === undefined ? null : Number(r.precio_override),
        activo: Boolean(r.activo ?? true),
      }));

      const assigns: AssignmentUI[] = (aRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        driver_id: String(r.driver_id),
        work_date: String(r.work_date),
        status: String(r.status ?? 'ACTIVA') as any,
        notes: r.notes ?? null,
        created_at: r.created_at ?? null,
      }));

      const driversBy = new Map(driversMapped.map((d) => [d.id, d]));
      const assignsEnriched = assigns.map((a) => ({ ...a, driver_nombre: driversBy.get(a.driver_id)?.nombre ?? null }));

      setDrivers(driversMapped);
      setDiners(dinersMapped);
      setCustomers(customersMapped);
      setProducts(productsMapped.filter((p) => p.active));
      setCustomerProducts(cps.filter((x) => x.activo));

      setAssignments(assignsEnriched);

      // auto-select: la más reciente si no hay selección
      setSelectedAssignmentId((prev) => prev ?? assignsEnriched[0]?.id ?? null);
    } catch (e: unknown) {
      setErr(safeErr(e));
      setDrivers([]);
      setDiners([]);
      setCustomers([]);
      setProducts([]);
      setCustomerProducts([]);
      setAssignments([]);
      setSelectedAssignmentId(null);
      setLoadItems([]);
      setDeliveries([]);
      setDeliveryItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAssignmentDetail = useCallback(async (assignmentId: string) => {
    setErr('');
    try {
      const [liRes, delRes] = await Promise.all([
        sb
          .from('assignment_load_items')
          .select('id,assignment_id,product_id,qty,created_at')
          .eq('assignment_id', assignmentId)
          .order('created_at', { ascending: false }),
        sb
          .from('deliveries')
          .select(
            'id,assignment_id,route_id,customer_id,order_id,folio,status,delivered_at,customer_nombre_snapshot,diner_nombre_snapshot,maps_url_snapshot,total_expected,total_real,created_at'
          )
          .eq('assignment_id', assignmentId)
          .order('created_at', { ascending: true }),
      ]);
      if (liRes.error) throw liRes.error;
      if (delRes.error) throw delRes.error;

      const load: LoadItemUI[] = (liRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        assignment_id: String(r.assignment_id),
        product_id: String(r.product_id),
        qty: Number(r.qty ?? 0),
      }));

      const dels: DeliveryUI[] = (delRes.data ?? []).map((r: any) => ({
        id: String(r.id),
        assignment_id: String(r.assignment_id),
        route_id: r.route_id ? String(r.route_id) : null,
        customer_id: String(r.customer_id),
        order_id: r.order_id ? String(r.order_id) : null,
        folio: String(r.folio ?? ''),
        status: String(r.status ?? 'PENDIENTE') as any,
        delivered_at: r.delivered_at ?? null,
        customer_nombre_snapshot: r.customer_nombre_snapshot ?? null,
        diner_nombre_snapshot: r.diner_nombre_snapshot ?? null,
        maps_url_snapshot: r.maps_url_snapshot ?? null,
        total_expected: Number(r.total_expected ?? 0),
        total_real: Number(r.total_real ?? 0),
        created_at: r.created_at ?? null,
      }));

      const deliveryIds = dels.map((d) => d.id);
      let items: DeliveryItemUI[] = [];
      if (deliveryIds.length) {
        const inSql = `(${deliveryIds.map((x) => `'${x}'`).join(',')})`;
        const diRes = await sb
          .from('delivery_items')
          .select(
            'id,delivery_id,product_id,qty_assigned,qty_real,precio_aplicado,subtotal_expected,subtotal_real,created_at'
          )
          .in('delivery_id', deliveryIds); // supabase .in acepta array; si falla por types, cae abajo
        if (diRes.error) {
          // fallback si tu client tipado se pone mamón
          const diRes2 = await sb
            .from('delivery_items')
            .select(
              'id,delivery_id,product_id,qty_assigned,qty_real,precio_aplicado,subtotal_expected,subtotal_real,created_at'
            )
            .filter('delivery_id', 'in', inSql);
          if (diRes2.error) throw diRes2.error;
          items = (diRes2.data ?? []).map((r: any) => ({
            id: String(r.id),
            delivery_id: String(r.delivery_id),
            product_id: String(r.product_id),
            qty_assigned: Number(r.qty_assigned ?? 0),
            qty_real: r.qty_real === null || r.qty_real === undefined ? null : Number(r.qty_real),
            precio_aplicado: Number(r.precio_aplicado ?? 0),
            subtotal_expected: Number(r.subtotal_expected ?? 0),
            subtotal_real: Number(r.subtotal_real ?? 0),
          }));
        } else {
          items = (diRes.data ?? []).map((r: any) => ({
            id: String(r.id),
            delivery_id: String(r.delivery_id),
            product_id: String(r.product_id),
            qty_assigned: Number(r.qty_assigned ?? 0),
            qty_real: r.qty_real === null || r.qty_real === undefined ? null : Number(r.qty_real),
            precio_aplicado: Number(r.precio_aplicado ?? 0),
            subtotal_expected: Number(r.subtotal_expected ?? 0),
            subtotal_real: Number(r.subtotal_real ?? 0),
          }));
        }
      }

      // enrich names
      const pBy = productsById;
      const liEn = load.map((x) => ({ ...x, product_nombre: pBy.get(x.product_id)?.nombre ?? null }));
      const itEn = items.map((x) => ({ ...x, product_nombre: pBy.get(x.product_id)?.nombre ?? null }));

      setLoadItems(liEn);
      setDeliveries(dels);
      setDeliveryItems(itEn);
    } catch (e: unknown) {
      setErr(safeErr(e));
      setLoadItems([]);
      setDeliveries([]);
      setDeliveryItems([]);
    }
  }, [productsById]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedAssignmentId) return;
    refreshAssignmentDetail(selectedAssignmentId);
  }, [selectedAssignmentId, refreshAssignmentDetail]);

  // ---------------- Actions ----------------

  const createAssignment = useCallback(async (driverId: string, workDate: string, notes?: string) => {
    setBusy(true);
    setErr('');
    try {
      const payload = { driver_id: driverId, work_date: workDate, status: 'ACTIVA', notes: notes?.trim() || null };
      const { data, error } = await sb.from('assignments').insert(payload).select('id').maybeSingle();
      if (error) throw error;
      const id = String(data?.id ?? '');
      await refreshAll();
      if (id) setSelectedAssignmentId(id);
      return id;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [refreshAll]);

  const upsertLoadItem = useCallback(async (assignmentId: string, productId: string, qty: number) => {
    setBusy(true);
    setErr('');
    try {
      const q = Math.max(0, Math.floor(qty));
      const payload = { assignment_id: assignmentId, product_id: productId, qty: q };
      const { error } = await sb.from('assignment_load_items').upsert(payload, { onConflict: 'assignment_id,product_id' });
      if (error) throw error;
      await refreshAssignmentDetail(assignmentId);
      return true;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail]);

  const removeLoadItem = useCallback(async (id: string, assignmentId: string) => {
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.from('assignment_load_items').delete().eq('id', id);
      if (error) throw error;
      await refreshAssignmentDetail(assignmentId);
      return true;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail]);

  const createDeliveryForCustomer = useCallback(async (assignmentId: string, customerId: string) => {
    setBusy(true);
    setErr('');
    try {
      // folio lo genera default generate_delivery_folio()
      const payload = { assignment_id: assignmentId, customer_id: customerId, status: 'PENDIENTE' };
      const { data, error } = await sb.from('deliveries').insert(payload).select('id,folio').maybeSingle();
      if (error) throw error;
      const deliveryId = String(data?.id ?? '');
      await refreshAssignmentDetail(assignmentId);
      return deliveryId || null;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail]);

  const addOrUpdateDeliveryItem = useCallback(
    async (assignmentId: string, deliveryId: string, customerId: string, productId: string, qtyAssigned: number) => {
      setBusy(true);
      setErr('');
      try {
        const qty = Math.max(1, Math.floor(qtyAssigned));

        const prod = productsById.get(productId);
        if (!prod) throw new Error('Producto no encontrado.');

        // precio: override si existe y está activo
        const ov = customerOverridesByCustomer.get(customerId)?.get(productId);
        const precio = typeof ov?.precio_override === 'number' ? ov!.precio_override : Number(prod.precio_base ?? 0);

        const payload = { delivery_id: deliveryId, product_id: productId, qty_assigned: qty, precio_aplicado: precio };
        const { error } = await sb.from('delivery_items').upsert(payload, { onConflict: 'delivery_id,product_id' });
        if (error) throw error;

        await refreshAssignmentDetail(assignmentId);
        return true;
      } catch (e: unknown) {
        setErr(safeErr(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refreshAssignmentDetail, productsById, customerOverridesByCustomer]
  );

  const removeDeliveryItem = useCallback(async (assignmentId: string, deliveryItemId: string) => {
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.from('delivery_items').delete().eq('id', deliveryItemId);
      if (error) throw error;
      await refreshAssignmentDetail(assignmentId);
      return true;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail]);

  const removeDelivery = useCallback(async (assignmentId: string, deliveryId: string) => {
    setBusy(true);
    setErr('');
    try {
      // delivery_items tiene cascade, pero tu schema: delivery_items references deliveries on delete cascade ✅
      const { error } = await sb.from('deliveries').delete().eq('id', deliveryId);
      if (error) throw error;
      await refreshAssignmentDetail(assignmentId);
      return true;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail]);

  const startRoute = useCallback(async (assignmentId: string, kmStart: number) => {
    setBusy(true);
    setErr('');
    try {
      const { data, error } = await sb.rpc('fn_start_route', { p_assignment_id: assignmentId, p_km_start: kmStart });
      if (error) throw error;
      // data = route_id
      await refreshAssignmentDetail(assignmentId);
      return data ?? null;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail]);

  const finishRoute = useCallback(async (assignmentId: string, kmEnd: number) => {
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.rpc('fn_finish_route', { p_assignment_id: assignmentId, p_km_end: kmEnd });
      if (error) throw error;
      await refreshAssignmentDetail(assignmentId);
      await refreshAll();
      return true;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshAssignmentDetail, refreshAll]);

  const today = useMemo(() => toYMD(new Date()), []);

  return {
    loading,
    busy,
    err,
    setErr,

    today,

    drivers,
    diners,
    customers: customersEnriched,
    products,

    assignments,
    selectedAssignmentId,
    setSelectedAssignmentId,
    selectedAssignment,

    loadItems,
    deliveries,
    deliveryItems,
    deliveryItemsByDeliveryId,

    refreshAll,
    refreshAssignmentDetail,

    // actions
    createAssignment,
    upsertLoadItem,
    removeLoadItem,
    createDeliveryForCustomer,
    addOrUpdateDeliveryItem,
    removeDeliveryItem,
    removeDelivery,
    startRoute,
    finishRoute,
  };
}