'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useCommercialInventoryProduct } from '@/lib/hooks/useCommercialInventoryProducts';

const sb = supabaseBrowser as unknown as any;

const T_DRIVERS = 'drivers';
const T_CUSTOMERS = 'customers';
const T_DINERS = 'diners';

const T_PRODUCTS = 'inventory_product_settings';
const T_CPP = 'customer_inventory_products';

const T_ASSIGNMENTS = 'assignments';
const T_ROUTES = 'routes';
const T_DELIVERIES = 'deliveries';
const T_DELIVERY_ITEMS = 'delivery_items';

export type BatchCustomer = {
  customer_id: string;
  priority: number;
  items: Array<{
    product_id: string;
    qty: number;
  }>;
};

export type DriverUI = {
  id: string;
  nombre: string;
  activo: boolean;
  current_status: string;
  firebase_codigo?: string | null;
  firebase_nombre?: string | null;
  synced_from_inventory?: boolean;
  only_in_inventory?: boolean;
};

export type CustomerUI = {
  id: string;
  nombre: string;
  diner_id: string | null;
  diner_nombre: string | null;
  telefono: string | null;
  capacidad_equipo: string;
  activo: boolean;
};

export type ProductUI = {
  id: string;
  nombre: string;
  precio_base: number;
  stock_actual: number;
  kind: string | null;
  ice_type: string | null;
  kg_por_unidad: number;
};

export type CustomerProductUI = {
  customer_id: string;
  product_id: string;
  precio_override: number | null;
  activo: boolean;
};

export type ProductForCustomerUI = {
  id: string;
  nombre: string;
  kind: string | null;
  ice_type: string | null;
  kg_por_unidad: number;
  precio_base: number;
  precio_override: number | null;
  precio_cliente_final: number;
  stock_actual: number;
  suggested_qty: number;
};

export type AssignmentRouteUI = {
  id: string;
  assignment_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  km_start: number | null;
  km_end: number | null;
};

export type AssignmentUI = {
  id: string;
  driver_id: string;
  driver_nombre: string | null;
  work_date: string;
  status: string;
  deliveries_count: number;
  route: AssignmentRouteUI | null;
};

export type DeliveryUI = {
  id: string;
  assignment_id: string;
  customer_id: string;
  customer_nombre_snapshot: string | null;
  diner_nombre_snapshot: string | null;
  folio: string;
  priority: number | null;
  total_expected: number | null;
  total_real: number | null;
  status: string;
  payment_method: string | null;
  delivered_at: string | null;
};

export type DeliveryItemUI = {
  id: string;
  delivery_id: string;
  product_id: string;
  product_nombre: string;
  qty_assigned: number;
  qty_real: number;
  precio_aplicado: number;
  subtotal_expected: number;
  subtotal_real: number;
};

export type DeliveryDetailedUI = DeliveryUI & {
  items: DeliveryItemUI[];
};

function todayMx() {
  const now = new Date();

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function safeErr(e: unknown) {
  const anyE = e as any;

  return (
    (typeof anyE?.message === 'string' && anyE.message) ||
    (typeof anyE?.error_description === 'string' && anyE.error_description) ||
    'Ocurrió un error.'
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function calcSuggestedQty(
  capacidadEquipo: string,
  kgPorUnidad: number,
  stockActual: number
) {
  const stock = Math.max(0, Math.floor(Number(stockActual || 0)));
  if (stock <= 0) return 1;

  const cap = Number(capacidadEquipo);
  const kg = Number(kgPorUnidad);

  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(kg) || kg <= 0) {
    return Math.min(stock, 3);
  }

  const maxUnitsByCapacity = cap / kg;

  let suggested = 1;

  if (maxUnitsByCapacity <= 2) {
    suggested = Math.ceil(maxUnitsByCapacity);
  } else if (maxUnitsByCapacity <= 6) {
    suggested = Math.ceil(maxUnitsByCapacity * 0.8);
  } else {
    suggested = Math.ceil(maxUnitsByCapacity * 0.5);
  }

  return clamp(Math.max(1, suggested), 1, stock);
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePaymentMethod(value: unknown): string {
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'CREDITO' ? 'CREDITO' : 'EFECTIVO';
}

export function useAssignmentsBuilderAdmin() {
  const {
    products: commercialProducts,
    loading: commercialProductsLoading,
    error: commercialProductsError,
  } = useCommercialInventoryProduct();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [workDate, setWorkDate] = useState<string>(todayMx());

  const [drivers, setDrivers] = useState<DriverUI[]>([]);
  const [customers, setCustomers] = useState<CustomerUI[]>([]);
  const [products, setProducts] = useState<ProductUI[]>([]);
  const [customerProducts, setCustomerProducts] = useState<CustomerProductUI[]>([]);

  const [assignmentsOfDay, setAssignmentsOfDay] = useState<AssignmentUI[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [deliveriesOfSelected, setDeliveriesOfSelected] = useState<DeliveryUI[]>([]);
  const [itemsByDelivery, setItemsByDelivery] = useState<Record<string, DeliveryItemUI[]>>({});

  const productsById = useMemo(() => {
    const m = new Map<string, ProductUI>();
    for (const p of products) {
      m.set(p.id, p);
    }
    return m;
  }, [products]);

  const customersById = useMemo(() => {
    const m = new Map<string, CustomerUI>();
    for (const c of customers) {
      m.set(c.id, c);
    }
    return m;
  }, [customers]);

  const selectedAssignment = useMemo(() => {
    return assignmentsOfDay.find((x) => x.id === selectedAssignmentId) ?? null;
  }, [assignmentsOfDay, selectedAssignmentId]);

  const deliveriesDetailedOfSelected = useMemo<DeliveryDetailedUI[]>(() => {
    return deliveriesOfSelected.map((delivery) => ({
      ...delivery,
      items: itemsByDelivery[delivery.id] ?? [],
    }));
  }, [deliveriesOfSelected, itemsByDelivery]);

  const loadCatalog = useCallback(async () => {
    const [driversRes, dinersRes, customersRes, pricingRes] = await Promise.all([
      sb
        .from(T_DRIVERS)
        .select(
          'id,nombre,activo,current_status,firebase_codigo,firebase_nombre,synced_from_inventory'
        )
        .order('nombre', { ascending: true }),

      sb.from(T_DINERS).select('id,nombre'),

      sb
        .from(T_CUSTOMERS)
        .select('id,nombre,diner_id,telefono,capacidad_equipo,activo')
        .order('nombre', { ascending: true }),

      sb
        .from(T_CPP)
        .select('customer_id,inventory_product_setting_id,precio_override,activo')
        .eq('activo', true),
    ]);

    if (driversRes.error) throw driversRes.error;
    if (dinersRes.error) throw dinersRes.error;
    if (customersRes.error) throw customersRes.error;
    if (pricingRes.error) throw pricingRes.error;

    const dinersMap = new Map<string, string>();

    for (const d of dinersRes.data ?? []) {
      dinersMap.set(String(d.id), String(d.nombre ?? ''));
    }

    const mappedDrivers: DriverUI[] = (driversRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      nombre: String(r.nombre ?? r.firebase_nombre ?? ''),
      activo: Boolean(r.activo ?? true),
      current_status: String(r.current_status ?? 'available'),
      firebase_codigo: r.firebase_codigo ? String(r.firebase_codigo) : null,
      firebase_nombre: r.firebase_nombre ? String(r.firebase_nombre) : null,
      synced_from_inventory: Boolean(r.synced_from_inventory ?? false),
    }));

    const mappedCustomers: CustomerUI[] = (customersRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      nombre: String(r.nombre ?? ''),
      diner_id: r.diner_id ? String(r.diner_id) : null,
      diner_nombre: r.diner_id ? dinersMap.get(String(r.diner_id)) ?? null : null,
      telefono: r.telefono ?? null,
      capacidad_equipo: String(r.capacidad_equipo ?? 'N/A'),
      activo: Boolean(r.activo ?? true),
    }));

    const mappedProducts: ProductUI[] = (commercialProducts ?? [])
      .filter((p: any) => {
        return Boolean(p.configured) && Boolean(p.activoComercial) && Boolean(p.settingId);
      })
      .map((p: any): ProductUI => {
        const tipo = String(p.tipoHielo ?? '').trim();
        const kg = Number(p.pesoKg ?? 0);
        const nombre = String(p.nombreComercial ?? p.displayName ?? '').trim();

        return {
          id: String(p.settingId),
          nombre: nombre || String(p.displayName ?? 'Producto'),
          precio_base: Number(p.precioBase ?? 0),
          stock_actual: Math.max(0, Math.floor(Number(p.stockActual ?? 0))),
          kind: tipo === 'BARRA' ? 'barra' : 'bolsa',
          ice_type: tipo || null,
          kg_por_unidad: kg > 0 ? kg : 1,
        };
      });

    const mappedCustomerProducts: CustomerProductUI[] = (pricingRes.data ?? []).map(
      (r: any) => ({
        customer_id: String(r.customer_id),
        product_id: String(r.inventory_product_setting_id),
        precio_override:
          r.precio_override === null || r.precio_override === undefined
            ? null
            : Number(r.precio_override),
        activo: Boolean(r.activo ?? true),
      })
    );

    setDrivers(mappedDrivers);
    setCustomers(mappedCustomers);
    setProducts(mappedProducts);
    setCustomerProducts(mappedCustomerProducts);
  }, [commercialProducts]);

  const loadAssignmentsOfDay = useCallback(async (date: string) => {
    const { data: assRows, error: assErr } = await sb
      .from(T_ASSIGNMENTS)
      .select('id,driver_id,work_date,status,created_at')
      .eq('work_date', date)
      .neq('status', 'CANCELADA')
      .order('created_at', { ascending: false });

    if (assErr) throw assErr;

    const raw = assRows ?? [];
    const assignmentIds: string[] = raw.map((x: any) => String(x.id));

    const driverIds: string[] = Array.from(
      new Set<string>(
        raw
          .map((x: any) => String(x.driver_id || ''))
          .filter((id: string) => id.length > 0)
      )
    );

    const driverMap = new Map<string, string>();

    if (driverIds.length > 0) {
      const { data: drRows, error: drErr } = await sb
        .from(T_DRIVERS)
        .select('id,nombre,firebase_nombre')
        .in('id', driverIds);

      if (drErr) throw drErr;

      for (const d of drRows ?? []) {
        driverMap.set(String(d.id), String(d.nombre ?? d.firebase_nombre ?? ''));
      }
    }

    const countMap = new Map<string, number>();

    if (assignmentIds.length > 0) {
      const { data: delRows, error: delErr } = await sb
        .from(T_DELIVERIES)
        .select('id,assignment_id')
        .in('assignment_id', assignmentIds);

      if (delErr) throw delErr;

      for (const d of delRows ?? []) {
        const aid = String(d.assignment_id);
        countMap.set(aid, (countMap.get(aid) ?? 0) + 1);
      }
    }

    const routeMap = new Map<string, AssignmentRouteUI>();

    if (assignmentIds.length > 0) {
      const { data: routeRows, error: routeErr } = await sb
        .from(T_ROUTES)
        .select('id,assignment_id,status,started_at,ended_at,km_start,km_end,created_at')
        .in('assignment_id', assignmentIds)
        .order('created_at', { ascending: false });

      if (routeErr) throw routeErr;

      for (const r of routeRows ?? []) {
        const assignmentId = String(r.assignment_id);

        if (routeMap.has(assignmentId)) continue;

        routeMap.set(assignmentId, {
          id: String(r.id),
          assignment_id: assignmentId,
          status: String(r.status ?? 'NO_INICIADA'),
          started_at: r.started_at ? String(r.started_at) : null,
          ended_at: r.ended_at ? String(r.ended_at) : null,
          km_start: toNullableNumber(r.km_start),
          km_end: toNullableNumber(r.km_end),
        });
      }
    }

    const mapped: AssignmentUI[] = raw.map((r: any) => ({
      id: String(r.id),
      driver_id: String(r.driver_id),
      driver_nombre: driverMap.get(String(r.driver_id)) ?? null,
      work_date: String(r.work_date),
      status: String(r.status ?? 'ACTIVA'),
      deliveries_count: countMap.get(String(r.id)) ?? 0,
      route: routeMap.get(String(r.id)) ?? null,
    }));

    setAssignmentsOfDay(mapped);

    setSelectedAssignmentId((prev) => {
      if (prev && mapped.some((a) => a.id === prev)) return prev;
      return '';
    });
  }, []);

  const loadDeliveriesForAssignment = useCallback(
    async (assignmentId: string) => {
      if (!assignmentId) {
        setDeliveriesOfSelected([]);
        setItemsByDelivery({});
        return;
      }

      const { data, error } = await sb
        .from(T_DELIVERIES)
        .select(
          'id,assignment_id,customer_id,customer_nombre_snapshot,diner_nombre_snapshot,folio,priority,total_expected,total_real,status,payment_method,delivered_at,created_at'
        )
        .eq('assignment_id', assignmentId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: DeliveryUI[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        assignment_id: String(r.assignment_id),
        customer_id: String(r.customer_id),
        customer_nombre_snapshot: r.customer_nombre_snapshot ?? null,
        diner_nombre_snapshot: r.diner_nombre_snapshot ?? null,
        folio: String(r.folio ?? ''),
        priority:
          r.priority === null || r.priority === undefined
            ? null
            : Number(r.priority),
        total_expected:
          r.total_expected === null || r.total_expected === undefined
            ? null
            : Number(r.total_expected),
        total_real:
          r.total_real === null || r.total_real === undefined
            ? null
            : Number(r.total_real),
        status: String(r.status ?? 'PENDIENTE'),
        payment_method: normalizePaymentMethod(r.payment_method),
        delivered_at: r.delivered_at ? String(r.delivered_at) : null,
      }));

      mapped.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

      setDeliveriesOfSelected(mapped);

      const deliveryIds: string[] = mapped.map((d) => d.id);

      if (deliveryIds.length === 0) {
        setItemsByDelivery({});
        return;
      }

      const { data: itemRows, error: itemErr } = await sb
        .from(T_DELIVERY_ITEMS)
        .select('id,delivery_id,product_id,qty_assigned,qty_real,precio_aplicado,created_at')
        .in('delivery_id', deliveryIds)
        .order('created_at', { ascending: true });

      if (itemErr) throw itemErr;

      const productIds: string[] = Array.from(
        new Set<string>(
          (itemRows ?? [])
            .map((x: any) => String(x.product_id || ''))
            .filter((id: string) => id.length > 0)
        )
      );

      const productNameMap = new Map<string, string>();

      for (const p of products) {
        productNameMap.set(String(p.id), String(p.nombre ?? 'Producto'));
      }

      const missingIds: string[] = productIds.filter(
        (id: string) => !productNameMap.has(id)
      );

      if (missingIds.length > 0) {
        const { data: productRows, error: productErr } = await sb
          .from(T_PRODUCTS)
          .select('id,nombre_comercial,firebase_tipo_hielo,peso_kg')
          .in('id', missingIds);

        if (!productErr) {
          for (const p of productRows ?? []) {
            const tipo = String(p.firebase_tipo_hielo ?? '').trim();
            const kg = Number(p.peso_kg ?? 0);
            const fallback = tipo && kg > 0 ? `${tipo} ${kg}KG` : 'Producto';

            productNameMap.set(
              String(p.id),
              String(p.nombre_comercial ?? fallback)
            );
          }
        }
      }

      const grouped: Record<string, DeliveryItemUI[]> = {};

      for (const row of itemRows ?? []) {
        const deliveryId = String(row.delivery_id);
        const qtyAssigned = Math.max(0, Math.floor(Number(row.qty_assigned ?? 0)));

        const qtyReal = Math.max(
          0,
          Math.floor(
            Number(
              row.qty_real === null || row.qty_real === undefined
                ? row.qty_assigned ?? 0
                : row.qty_real
            )
          )
        );

        const precioAplicado = Number(row.precio_aplicado ?? 0);

        const parsed: DeliveryItemUI = {
          id: String(row.id),
          delivery_id: deliveryId,
          product_id: String(row.product_id),
          product_nombre: productNameMap.get(String(row.product_id)) ?? 'Producto',
          qty_assigned: qtyAssigned,
          qty_real: qtyReal,
          precio_aplicado: precioAplicado,
          subtotal_expected: qtyAssigned * precioAplicado,
          subtotal_real: qtyReal * precioAplicado,
        };

        if (!grouped[deliveryId]) grouped[deliveryId] = [];
        grouped[deliveryId].push(parsed);
      }

      setItemsByDelivery(grouped);
    },
    [products]
  );

  const refreshDay = useCallback(
    async (date: string) => {
      setErr('');
      setLoading(true);

      try {
        await loadCatalog();
        await loadAssignmentsOfDay(date);

        setDeliveriesOfSelected([]);
        setItemsByDelivery({});
      } catch (e: unknown) {
        setErr(safeErr(e));
      } finally {
        setLoading(false);
      }
    },
    [loadCatalog, loadAssignmentsOfDay]
  );

  useEffect(() => {
    if (commercialProductsLoading) return;

    if (commercialProductsError) {
      setErr(commercialProductsError);
      setLoading(false);
      return;
    }

    refreshDay(workDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workDate, commercialProductsLoading, commercialProductsError]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setDeliveriesOfSelected([]);
      setItemsByDelivery({});
      return;
    }

    loadDeliveriesForAssignment(selectedAssignmentId).catch((e: unknown) => {
      setErr(safeErr(e));
    });
  }, [selectedAssignmentId, loadDeliveriesForAssignment]);

  const productsForCustomer = useCallback(
    (customerId: string): ProductForCustomerUI[] => {
      const customer = customersById.get(customerId);
      if (!customer) return [];

      const rows = customerProducts.filter((r) => {
        return r.customer_id === customerId && r.activo;
      });

      const out: ProductForCustomerUI[] = [];

      for (const row of rows) {
        const p = productsById.get(row.product_id);

        if (!p) continue;

        const precioFinal =
          typeof row.precio_override === 'number'
            ? row.precio_override
            : p.precio_base;

        out.push({
          id: p.id,
          nombre: p.nombre,
          kind: p.kind,
          ice_type: p.ice_type,
          kg_por_unidad: Number(p.kg_por_unidad ?? 1),
          precio_base: Number(p.precio_base ?? 0),
          precio_override:
            row.precio_override === null || row.precio_override === undefined
              ? null
              : Number(row.precio_override),
          precio_cliente_final: Number(precioFinal ?? 0),
          stock_actual: Math.max(0, Math.floor(Number(p.stock_actual ?? 0))),
          suggested_qty: calcSuggestedQty(
            String(customer.capacidad_equipo ?? 'N/A'),
            Number(p.kg_por_unidad ?? 1),
            Number(p.stock_actual ?? 0)
          ),
        });
      }

      out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return out;
    },
    [customerProducts, customersById, productsById]
  );

  async function getOrCreateAssignment(
    driverId: string,
    date: string
  ): Promise<string | null> {
    setBusy(true);
    setErr('');

    try {
      const { data: existingRows, error: exErr } = await sb
        .from(T_ASSIGNMENTS)
        .select('id')
        .eq('driver_id', driverId)
        .eq('work_date', date)
        .neq('status', 'CANCELADA')
        .order('created_at', { ascending: false })
        .limit(1);

      if (exErr) throw exErr;

      const existingId = existingRows?.[0]?.id
        ? String(existingRows[0].id)
        : null;

      if (existingId) return existingId;

      const { data: created, error: crErr } = await sb
        .from(T_ASSIGNMENTS)
        .insert({
          driver_id: driverId,
          work_date: date,
          status: 'ACTIVA',
        })
        .select('id')
        .single();

      if (crErr) throw crErr;

      const id = created?.id ? String(created.id) : null;

      await loadAssignmentsOfDay(date);

      return id;
    } catch (e: unknown) {
      setErr(safeErr(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createDeliveriesBatch(
    assignmentId: string,
    batch: BatchCustomer[]
  ): Promise<{ ok: boolean }> {
    setBusy(true);
    setErr('');

    try {
      for (const b of batch) {
        const customer = customersById.get(b.customer_id);
        if (!customer) continue;

        const allowed = productsForCustomer(b.customer_id);
        const allowedMap = new Map(allowed.map((p) => [p.id, p] as const));

        const validItems = b.items
          .map((it) => {
            const p = allowedMap.get(it.product_id);
            if (!p) return null;

            const qty = Math.max(1, Math.floor(Number(it.qty || 1)));
            const precioAplicado = Number(p.precio_cliente_final || 0);

            return {
              product_id: it.product_id,
              qty,
              precio_aplicado: precioAplicado,
              subtotal: precioAplicado * qty,
            };
          })
          .filter(Boolean) as Array<{
          product_id: string;
          qty: number;
          precio_aplicado: number;
          subtotal: number;
        }>;

        if (validItems.length === 0) continue;

        const totalExpected = validItems.reduce((acc, it) => acc + it.subtotal, 0);

        const deliveryPayload = {
          assignment_id: assignmentId,
          customer_id: b.customer_id,
          customer_nombre_snapshot: customer.nombre ?? null,
          diner_nombre_snapshot: customer.diner_nombre ?? null,
          status: 'PENDIENTE',
          total_expected: totalExpected,
          total_real: totalExpected,
          priority: Number(b.priority ?? 50),
          payment_method: 'EFECTIVO',
        };

        const { data: deliveryCreated, error: delErr } = await sb
          .from(T_DELIVERIES)
          .insert(deliveryPayload)
          .select('id')
          .single();

        if (delErr) throw delErr;

        const deliveryId = deliveryCreated?.id ? String(deliveryCreated.id) : null;

        if (!deliveryId) {
          throw new Error('No se pudo crear la entrega.');
        }

        const itemsPayload = validItems.map((it) => ({
          delivery_id: deliveryId,
          product_id: it.product_id,
          qty_assigned: it.qty,
          qty_real: it.qty,
          precio_aplicado: it.precio_aplicado,
        }));

        const { error: itemErr } = await sb
          .from(T_DELIVERY_ITEMS)
          .insert(itemsPayload);

        if (itemErr) throw itemErr;
      }

      await loadAssignmentsOfDay(workDate);
      await loadDeliveriesForAssignment(assignmentId);

      return { ok: true };
    } catch (e: unknown) {
      setErr(safeErr(e));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  return {
    loading,
    busy,
    err,

    workDate,
    setWorkDate,

    drivers,
    customers,
    products,
    customerProducts,

    assignmentsOfDay,
    selectedAssignmentId,
    setSelectedAssignmentId,
    selectedAssignment,

    deliveriesOfSelected,
    itemsByDelivery,
    deliveriesDetailedOfSelected,

    refreshDay,
    productsForCustomer,
    getOrCreateAssignment,
    createDeliveriesBatch,
  };
}