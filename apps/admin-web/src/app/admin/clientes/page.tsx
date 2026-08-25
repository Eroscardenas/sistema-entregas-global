'use client';

// app/admin/usuarios/clientes/page.tsx
// CLIENTES + COMEDORES (ADMIN) — Global Ice (Supabase)
// - Manejo de clientes y comedores
// - Precio por cliente vía customer_inventory_products.precio_override
// - Catálogo real desde inventario/comercial
// - UI lista/grid + panel detalle + modales

import React, { useEffect, useMemo, useState } from 'react';
import { useCommercialInventoryProduct } from '@/lib/hooks/useCommercialInventoryProducts';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  MapPin,
  DollarSign,
  Building2,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Coffee,
  Users2,
  Package,
  Eye,
  EyeOff,
  GripVertical,
  Menu,
  AlertTriangle,
  Phone,
  Check,
} from 'lucide-react';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const T_DINERS = 'diners';
const T_CUSTOMERS = 'customers';
const T_CIP = 'customer_inventory_products';

type ProductUI = {
  id: string; // inventory_product_settings.id
  nombre: string;
  precio_base: number;
  activo: boolean;
  bolsaVaciaCodigo: string;
  tipoHielo: string;
  pesoKg: number;
  displayName: string;
  configured: boolean;
  activoComercial: boolean;
  settingId: string;
};

type DinerUI = {
  id: string;
  nombre: string;
  activo: boolean;
  created_at?: string | null;
  customer_count?: number;
};

type CustomerUI = {
  id: string;
  nombre: string;
  diner_id: string | null;
  telefono?: string | null;
  maps_url?: string | null;
  capacidad_equipo: string;
  activo: boolean;
  created_at?: string | null;
};

type CIPUI = {
  id: string;
  customer_id: string;
  inventory_product_setting_id: string;
  precio_override: number | null;
  activo: boolean;
};

type ProductPricingState = {
  selected: boolean;
  price_override: string;
  activo: boolean;
};

type PricingState = Record<string, ProductPricingState>;

type CustomerWithPricing = CustomerUI & {
  diner_nombre?: string | null;
  diner_activo?: boolean | null;
  pricing: PricingState;
  product_count?: number;
  total_value?: number;
};

const CAPACITIES = ['N/A', '20', '40', '50', '60', '100', '150'] as const;

function money(n?: number | null) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function toNum(v: string) {
  const text = String(v ?? '').trim();
  if (!text) return null;
  const x = Number(text);
  if (!Number.isFinite(x)) return null;
  return x;
}

function safeErr(e: unknown) {
  const anyE = e as any;
  return (
    (typeof anyE?.message === 'string' && anyE.message) ||
    (typeof anyE?.error_description === 'string' && anyE.error_description) ||
    'Ocurrió un error.'
  );
}

function isProbablyUrl(s: string) {
  const v = String(s || '').trim();
  if (!v) return true;
  return /^https?:\/\/.+/i.test(v);
}

function getInitials(name: string) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getCustomerProductFinalPrice(product: ProductUI, state?: ProductPricingState) {
  const override = toNum(state?.price_override ?? '');
  return override === null ? Number(product.precio_base ?? 0) : override;
}

export default function AdminClientesPage() {
  const router = useRouter();
  const guard = useAdminGuard();
  const sb = supabaseBrowser as unknown as any;

  const [products, setProducts] = useState<ProductUI[]>([]);
  const {
    products: commercialProducts,
    loading: commercialProductsLoading,
    error: commercialProductsError,
  } = useCommercialInventoryProduct();

  const [diners, setDiners] = useState<DinerUI[]>([]);
  const [customers, setCustomers] = useState<CustomerUI[]>([]);
  const [pricingRows, setPricingRows] = useState<CIPUI[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [tab, setTab] = useState<'clientes' | 'comedores'>('clientes');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithPricing | null>(null);
  const [selectedDiner, setSelectedDiner] = useState<DinerUI | null>(null);

  const [qCustomers, setQCustomers] = useState('');
  const [qDiners, setQDiners] = useState('');
  const [filterActive, setFilterActive] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [filterCapacity, setFilterCapacity] = useState<string>('todas');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'products'>('name');

  const [dinerOpen, setDinerOpen] = useState(false);
  const [dinerMode, setDinerMode] = useState<'create' | 'edit'>('create');
  const [dinerForm, setDinerForm] = useState<{ id?: string; nombre: string; activo: boolean }>({
    nombre: '',
    activo: true,
  });

  const [custOpen, setCustOpen] = useState(false);
  const [custMode, setCustMode] = useState<'create' | 'edit'>('create');
  const [custForm, setCustForm] = useState<{
    id?: string;
    nombre: string;
    diner_id: string | null;
    telefono: string;
    maps_url: string;
    capacidad_equipo: string;
    activo: boolean;
    pricing: PricingState;
  }>({
    nombre: '',
    diner_id: null,
    telefono: '',
    maps_url: '',
    capacidad_equipo: 'N/A',
    activo: true,
    pricing: {},
  });

  const [del, setDel] = useState<{ type: 'diner' | 'customer'; id: string; nombre: string } | null>(null);

  const canRender = !guard.loading && guard.isAuthed;

  function buildPricingStateBase(currentProducts: ProductUI[] = products): PricingState {
    const pricing: PricingState = {};
    for (const p of currentProducts) {
      pricing[p.id] = { selected: false, price_override: '', activo: true };
    }
    return pricing;
  }

  function buildPricingStateFromCustomer(c?: CustomerWithPricing | null): PricingState {
    const pricing = buildPricingStateBase();
    if (!c?.pricing) return pricing;

    for (const pid of Object.keys(c.pricing)) {
      if (!pricing[pid]) continue;
      pricing[pid] = { ...c.pricing[pid] };
    }

    return pricing;
  }

  async function loadAll() {
    setErr('');
    setLoading(true);
    try {
      const mappedProducts: ProductUI[] = (commercialProducts ?? [])
        .filter((p: any) => Boolean(p.configured) && Boolean(p.activoComercial) && Boolean(p.settingId))
        .map((p: any): ProductUI => ({
          id: String(p.settingId),
          settingId: String(p.settingId),
          nombre: String(p.nombreComercial ?? p.displayName ?? ''),
          precio_base: Number(p.precioBase ?? 0),
          activo: Boolean(p.activoComercial ?? true),
          bolsaVaciaCodigo: String(p.bolsaVaciaCodigo ?? ''),
          tipoHielo: String(p.tipoHielo ?? ''),
          pesoKg: Number(p.pesoKg ?? 0),
          displayName: String(p.displayName ?? ''),
          configured: Boolean(p.configured),
          activoComercial: Boolean(p.activoComercial),
        }));

      const { data: dData, error: dErr } = await sb
        .from(T_DINERS)
        .select('id,nombre,activo,created_at')
        .order('nombre', { ascending: true });
      if (dErr) throw dErr;

      const { data: cData, error: cErr } = await sb
        .from(T_CUSTOMERS)
        .select('id,nombre,diner_id,telefono,maps_url,capacidad_equipo,activo,created_at')
        .order('created_at', { ascending: false });
      if (cErr) throw cErr;

      const custs: CustomerUI[] = (cData ?? []).map((r: any): CustomerUI => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        diner_id: r.diner_id ? String(r.diner_id) : null,
        telefono: r.telefono ?? null,
        maps_url: r.maps_url ?? null,
        capacidad_equipo: String(r.capacidad_equipo ?? 'N/A'),
        activo: Boolean(r.activo ?? true),
        created_at: r.created_at ?? null,
      }));

      const customerCounts = new Map<string, number>();
      for (const c of custs) {
        if (!c.diner_id) continue;
        customerCounts.set(c.diner_id, (customerCounts.get(c.diner_id) ?? 0) + 1);
      }

      const dins: DinerUI[] = (dData ?? []).map((r: any): DinerUI => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        activo: Boolean(r.activo ?? true),
        created_at: r.created_at ?? null,
        customer_count: customerCounts.get(String(r.id)) ?? 0,
      }));

      const { data: prData, error: prErr } = await sb
        .from(T_CIP)
        .select('id,customer_id,inventory_product_setting_id,precio_override,activo');
      if (prErr) throw prErr;

      const prs: CIPUI[] = (prData ?? []).map((r: any): CIPUI => ({
        id: String(r.id),
        customer_id: String(r.customer_id),
        inventory_product_setting_id: String(r.inventory_product_setting_id),
        precio_override:
          r.precio_override === null || r.precio_override === undefined
            ? null
            : Number(r.precio_override),
        activo: Boolean(r.activo ?? true),
      }));

      setProducts(mappedProducts);
      setDiners(dins);
      setCustomers(custs);
      setPricingRows(prs);
    } catch (e: unknown) {
      setErr(safeErr(e));
      setProducts([]);
      setDiners([]);
      setCustomers([]);
      setPricingRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canRender) return;
    if (commercialProductsLoading) return;
    loadAll();
  }, [canRender, commercialProductsLoading, commercialProducts]);

  useEffect(() => {
    if (commercialProductsError) setErr(commercialProductsError);
  }, [commercialProductsError]);

  const dinersById = useMemo(() => {
    const m = new Map<string, DinerUI>();
    for (const d of diners) m.set(d.id, d);
    return m;
  }, [diners]);

  const productsById = useMemo(() => {
    const m = new Map<string, ProductUI>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const customersWithPricing = useMemo((): CustomerWithPricing[] => {
    const byCust = new Map<string, CIPUI[]>();

    for (const r of pricingRows) {
      if (!byCust.has(r.customer_id)) byCust.set(r.customer_id, []);
      byCust.get(r.customer_id)!.push(r);
    }

    return customers.map((c): CustomerWithPricing => {
      const rows = byCust.get(c.id) ?? [];
      const pricing: PricingState = {};

      for (const p of products) {
        pricing[p.id] = { selected: false, price_override: '', activo: true };
      }

      let totalValue = 0;
      let productCount = 0;

      for (const r of rows) {
        if (!pricing[r.inventory_product_setting_id]) continue;

        const activo = Boolean(r.activo ?? true);
        pricing[r.inventory_product_setting_id] = {
          selected: activo,
          price_override: r.precio_override === null ? '' : String(r.precio_override),
          activo,
        };

        if (activo) {
          productCount += 1;
          const base = Number(productsById.get(r.inventory_product_setting_id)?.precio_base ?? 0);
          totalValue += typeof r.precio_override === 'number' ? r.precio_override : base;
        }
      }

      const diner = c.diner_id ? dinersById.get(c.diner_id) : null;

      return {
        ...c,
        diner_nombre: diner?.nombre ?? null,
        diner_activo: diner?.activo ?? null,
        pricing,
        product_count: productCount,
        total_value: totalValue,
      };
    });
  }, [customers, pricingRows, products, productsById, dinersById]);

  useEffect(() => {
    setSelectedCustomer((prev) => {
      if (!prev) return null;
      return customersWithPricing.find((x) => x.id === prev.id) ?? null;
    });
  }, [customersWithPricing]);

  useEffect(() => {
    setSelectedDiner((prev) => {
      if (!prev) return null;
      return diners.find((x) => x.id === prev.id) ?? null;
    });
  }, [diners]);

  const filteredCustomers = useMemo(() => {
    let filtered = [...customersWithPricing];
    const s = qCustomers.trim().toLowerCase();

    if (s) {
      filtered = filtered.filter((c) => {
        const diner = (c.diner_nombre ?? '').toLowerCase();
        const tel = String(c.telefono ?? '').toLowerCase();
        return c.nombre.toLowerCase().includes(s) || diner.includes(s) || tel.includes(s);
      });
    }

    if (filterActive === 'activos') filtered = filtered.filter((c) => c.activo);
    if (filterActive === 'inactivos') filtered = filtered.filter((c) => !c.activo);
    if (filterCapacity !== 'todas') {
      filtered = filtered.filter((c) => String(c.capacidad_equipo ?? 'N/A') === filterCapacity);
    }

    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.nombre.localeCompare(b.nombre, 'es-MX');
      if (sortBy === 'date') return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
      return (b.product_count ?? 0) - (a.product_count ?? 0);
    });

    return filtered;
  }, [customersWithPricing, qCustomers, filterActive, filterCapacity, sortBy]);

  const filteredDiners = useMemo(() => {
    let filtered = [...diners];
    const s = qDiners.trim().toLowerCase();
    if (s) filtered = filtered.filter((d) => d.nombre.toLowerCase().includes(s));
    return filtered;
  }, [diners, qDiners]);

  const summary = useMemo(() => {
    const totalClientes = customers.length;
    const activos = customers.filter((c) => c.activo).length;
    const conEquipo = customers.filter((c) => String(c.capacidad_equipo ?? 'N/A') !== 'N/A').length;
    const totalComedores = diners.length;
    const comedoresActivos = diners.filter((d) => d.activo).length;

    return {
      totalClientes,
      activos,
      inactivos: totalClientes - activos,
      conEquipo,
      totalComedores,
      comedoresActivos,
    };
  }, [customers, diners]);

  function openCreateDiner() {
    setDinerMode('create');
    setDinerForm({ nombre: '', activo: true });
    setDinerOpen(true);
  }

  function openEditDiner(d: DinerUI) {
    setDinerMode('edit');
    setDinerForm({ id: d.id, nombre: d.nombre, activo: d.activo });
    setDinerOpen(true);
  }

  async function saveDiner() {
    const nombre = String(dinerForm.nombre || '').trim();
    if (nombre.length < 2) return;

    setBusy(true);
    setErr('');
    try {
      const payload = { nombre, activo: Boolean(dinerForm.activo) };

      if (dinerMode === 'edit' && dinerForm.id) {
        const { error } = await sb.from(T_DINERS).update(payload).eq('id', dinerForm.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from(T_DINERS).insert(payload);
        if (error) throw error;
      }

      setDinerOpen(false);
      await loadAll();
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  function openCreateCustomer() {
    setCustMode('create');
    setCustForm({
      nombre: '',
      diner_id: null,
      telefono: '',
      maps_url: '',
      capacidad_equipo: 'N/A',
      activo: true,
      pricing: buildPricingStateBase(),
    });
    setCustOpen(true);
  }

  function openEditCustomer(c: CustomerWithPricing) {
    setCustMode('edit');
    setCustForm({
      id: c.id,
      nombre: c.nombre,
      diner_id: c.diner_id,
      telefono: String(c.telefono ?? ''),
      maps_url: String(c.maps_url ?? ''),
      capacidad_equipo: c.capacidad_equipo || 'N/A',
      activo: Boolean(c.activo),
      pricing: buildPricingStateFromCustomer(c),
    });
    setCustOpen(true);
  }

  const customerFormOk = useMemo(() => {
    const nombreOk = String(custForm.nombre || '').trim().length >= 2;
    const urlOk = isProbablyUrl(custForm.maps_url);
    const capOk = CAPACITIES.includes(custForm.capacidad_equipo as (typeof CAPACITIES)[number]);
    return nombreOk && urlOk && capOk && !busy;
  }, [custForm.nombre, custForm.maps_url, custForm.capacidad_equipo, busy]);

  async function saveCustomer() {
    if (!customerFormOk) return;

    setBusy(true);
    setErr('');
    try {
      const nombre = String(custForm.nombre || '').trim();
      const payload = {
        nombre,
        diner_id: custForm.diner_id || null,
        telefono: custForm.telefono ? String(custForm.telefono).trim() : null,
        maps_url: custForm.maps_url ? String(custForm.maps_url).trim() : null,
        capacidad_equipo: String(custForm.capacidad_equipo || 'N/A'),
        activo: Boolean(custForm.activo),
      };

      let customerId: string | null = custForm.id ?? null;

      if (custMode === 'edit' && custForm.id) {
        const { error } = await sb.from(T_CUSTOMERS).update(payload).eq('id', custForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from(T_CUSTOMERS).insert(payload).select('id').single();
        if (error) throw error;
        customerId = data?.id ? String(data.id) : null;
      }

      if (!customerId) throw new Error('No se pudo obtener el ID del cliente.');

      const selectedIds = Object.entries(custForm.pricing)
        .filter(([, st]) => Boolean(st?.selected))
        .map(([pid]) => pid);

      const existingForCustomer = pricingRows
        .filter((r) => r.customer_id === customerId)
        .map((r) => r.inventory_product_setting_id);

      const idsToDelete = existingForCustomer.filter((pid) => !selectedIds.includes(pid));

      if (idsToDelete.length) {
        const { error } = await sb
          .from(T_CIP)
          .delete()
          .eq('customer_id', customerId)
          .in('inventory_product_setting_id', idsToDelete);
        if (error) throw error;
      }

      if (selectedIds.length === 0) {
        const { error } = await sb.from(T_CIP).delete().eq('customer_id', customerId);
        if (error) throw error;
      } else {
        const upserts = selectedIds.map((pid) => {
          const st = custForm.pricing[pid];
          const num = toNum(st.price_override);
          const product = productsById.get(pid);
          const base = Number(product?.precio_base ?? 0);
          const normalizedOverride =
            num === null || String(st.price_override).trim() === '' || num === base
              ? null
              : num;

          return {
            customer_id: customerId,
            inventory_product_setting_id: pid,
            precio_override: normalizedOverride,
            activo: true,
          };
        });

        const { error } = await sb
          .from(T_CIP)
          .upsert(upserts, { onConflict: 'customer_id,inventory_product_setting_id' });
        if (error) throw error;
      }

      setCustOpen(false);
      await loadAll();
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCustomerActive(c: CustomerUI) {
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.from(T_CUSTOMERS).update({ activo: !c.activo }).eq('id', c.id);
      if (error) throw error;

      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: !x.activo } : x)));
      if (selectedCustomer?.id === c.id) setSelectedCustomer({ ...selectedCustomer, activo: !c.activo });
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDinerActive(d: DinerUI) {
    setBusy(true);
    setErr('');
    try {
      const { error } = await sb.from(T_DINERS).update({ activo: !d.activo }).eq('id', d.id);
      if (error) throw error;

      setDiners((prev) => prev.map((x) => (x.id === d.id ? { ...x, activo: !x.activo } : x)));
      if (selectedDiner?.id === d.id) setSelectedDiner({ ...d, activo: !d.activo });
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!del) return;
    setBusy(true);
    setErr('');
    try {
      if (del.type === 'customer') {
        const { error } = await sb.from(T_CUSTOMERS).delete().eq('id', del.id);
        if (error) throw error;
        if (selectedCustomer?.id === del.id) setSelectedCustomer(null);
      } else {
        const { error } = await sb.from(T_DINERS).delete().eq('id', del.id);
        if (error) throw error;
        if (selectedDiner?.id === del.id) setSelectedDiner(null);
      }

      setDel(null);
      await loadAll();
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  if (guard.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A] to-[#2D1B3A]">
        <Skeleton />
      </div>
    );
  }

  if (!guard.isAuthed) return null;

  const activeDiners = diners.filter((x) => x.activo);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 p-3 shadow-lg">
                <Users2 className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Clientes y Comedores</h1>
                <p className="text-sm text-white/70">Administra clientes, comedores y precios por cliente</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="rounded-xl bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
                title={viewMode === 'grid' ? 'Vista lista' : 'Vista grid'}
                type="button"
              >
                {viewMode === 'grid' ? <Menu className="h-5 w-5" /> : <GripVertical className="h-5 w-5" />}
              </button>

              <button
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
                type="button"
              >
                Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mb-6 space-y-4">
          <Glass className="p-2">
            <div className="flex gap-2">
              <TabBtn
                active={tab === 'clientes'}
                onClick={() => {
                  setTab('clientes');
                  setSelectedDiner(null);
                }}
                icon={<Users className="h-4 w-4" />}
              >
                Clientes ({summary.totalClientes})
              </TabBtn>
              <TabBtn
                active={tab === 'comedores'}
                onClick={() => {
                  setTab('comedores');
                  setSelectedCustomer(null);
                }}
                icon={<Building2 className="h-4 w-4" />}
              >
                Comedores ({summary.totalComedores})
              </TabBtn>
            </div>
          </Glass>

          <Glass className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  value={tab === 'clientes' ? qCustomers : qDiners}
                  onChange={(e) => (tab === 'clientes' ? setQCustomers(e.target.value) : setQDiners(e.target.value))}
                  placeholder={tab === 'clientes' ? 'Buscar por nombre, comedor o teléfono...' : 'Buscar comedor...'}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                />
              </div>

              <div className="flex items-center gap-3">
                {tab === 'clientes' && (
                  <>
                    <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <Filter className="h-4 w-4 text-white/60" />
                      <select
                        value={filterActive}
                        onChange={(e) => setFilterActive(e.target.value as 'todos' | 'activos' | 'inactivos')}
                        className="bg-transparent text-sm text-white/80 focus:outline-none"
                      >
                        <option value="todos">Todos</option>
                        <option value="activos">Activos</option>
                        <option value="inactivos">Inactivos</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <Coffee className="h-4 w-4 text-white/60" />
                      <select
                        value={filterCapacity}
                        onChange={(e) => setFilterCapacity(e.target.value)}
                        className="bg-transparent text-sm text-white/80 focus:outline-none"
                      >
                        <option value="todas">Todas las capacidades</option>
                        {CAPACITIES.map((cap) => (
                          <option key={cap} value={cap}>
                            {cap}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <ArrowUpDown className="h-4 w-4 text-white/60" />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'products')}
                        className="bg-transparent text-sm text-white/80 focus:outline-none"
                      >
                        <option value="name">Nombre</option>
                        <option value="date">Fecha</option>
                        <option value="products">Productos</option>
                      </select>
                    </div>
                  </>
                )}

                <button
                  onClick={loadAll}
                  disabled={loading}
                  className="rounded-xl bg-white/10 p-3 text-white/80 transition-colors hover:bg-white/20 disabled:opacity-50"
                  type="button"
                >
                  <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
                </button>

                <button
                  onClick={tab === 'clientes' ? openCreateCustomer : openCreateDiner}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-3 font-medium text-white shadow-lg transition-all hover:from-[#2E6B9E] hover:to-[#1E4A7A]"
                  type="button"
                >
                  <Plus className="h-5 w-5" />
                  {tab === 'clientes' ? 'Nuevo Cliente' : 'Nuevo Comedor'}
                </button>
              </div>
            </div>
          </Glass>
        </div>

        <AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/20 p-4"
            >
              <div className="flex items-center gap-3 text-red-200">
                <AlertCircle className="h-5 w-5" />
                <span>{err}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl"
            >
              <div className="border-b border-white/10 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  {tab === 'clientes' ? 'Listado de Clientes' : 'Comedores Registrados'}
                </h2>
                <p className="text-sm text-white/50">
                  {tab === 'clientes'
                    ? `${filteredCustomers.length} clientes encontrados`
                    : `${filteredDiners.length} comedores encontrados`}
                </p>
              </div>

              <div className="divide-y divide-white/10">
                {loading ? (
                  <div className="p-8 text-center text-white/50">Cargando...</div>
                ) : tab === 'clientes' ? (
                  filteredCustomers.length === 0 ? (
                    <EmptyState type="clientes" onCreate={openCreateCustomer} icon={<Users className="h-12 w-12" />} />
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                      {filteredCustomers.map((c) => (
                        <CustomerCard
                          key={c.id}
                          customer={c}
                          isSelected={selectedCustomer?.id === c.id}
                          onSelect={setSelectedCustomer}
                          onEdit={openEditCustomer}
                          onToggleActive={toggleCustomerActive}
                          onDelete={setDel}
                          busy={busy}
                        />
                      ))}
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <CustomerListItem
                        key={c.id}
                        customer={c}
                        isSelected={selectedCustomer?.id === c.id}
                        onSelect={setSelectedCustomer}
                        onEdit={openEditCustomer}
                        onToggleActive={toggleCustomerActive}
                        onDelete={setDel}
                        busy={busy}
                      />
                    ))
                  )
                ) : filteredDiners.length === 0 ? (
                  <EmptyState type="comedores" onCreate={openCreateDiner} icon={<Building2 className="h-12 w-12" />} />
                ) : (
                  filteredDiners.map((d) => (
                    <DinerListItem
                      key={d.id}
                      diner={d}
                      isSelected={selectedDiner?.id === d.id}
                      onSelect={setSelectedDiner}
                      onEdit={openEditDiner}
                      onToggleActive={toggleDinerActive}
                      onDelete={setDel}
                      busy={busy}
                    />
                  ))
                )}
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="sticky top-6">
              {tab === 'clientes' ? (
                selectedCustomer ? (
                  <CustomerDetails
                    customer={selectedCustomer}
                    onEdit={openEditCustomer}
                    onToggleActive={toggleCustomerActive}
                    onDelete={setDel}
                    products={products}
                    busy={busy}
                  />
                ) : (
                  <EmptyStateDetails type="cliente" icon={<Users className="h-12 w-12" />} onCreate={openCreateCustomer} />
                )
              ) : selectedDiner ? (
                <DinerDetails
                  diner={selectedDiner}
                  onEdit={openEditDiner}
                  onToggleActive={toggleDinerActive}
                  onDelete={setDel}
                  busy={busy}
                  customers={customersWithPricing.filter((c) => c.diner_id === selectedDiner.id)}
                />
              ) : (
                <EmptyStateDetails type="comedor" icon={<Building2 className="h-12 w-12" />} onCreate={openCreateDiner} />
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {dinerOpen && (
          <DinerModal
            mode={dinerMode}
            form={dinerForm}
            setForm={setDinerForm}
            onClose={() => !busy && setDinerOpen(false)}
            onSave={saveDiner}
            busy={busy}
          />
        )}

        {custOpen && (
          <CustomerModal
            mode={custMode}
            form={custForm}
            setForm={setCustForm}
            onClose={() => !busy && setCustOpen(false)}
            onSave={saveCustomer}
            formOk={customerFormOk}
            busy={busy}
            products={products}
            diners={activeDiners}
          />
        )}

        {del && (
          <DeleteModal item={del} onConfirm={confirmDelete} onClose={() => !busy && setDel(null)} busy={busy} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx('rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl', className)}>{children}</div>;
}

const KPI = ({
  title,
  value,
  icon,
  color,
  subValue,
  delay = 0,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  subValue?: string;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={cx('rounded-2xl bg-gradient-to-br p-6 shadow-xl', color)}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="mb-1 text-sm text-white/70">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subValue ? <p className="mt-1 text-xs text-white/50">{subValue}</p> : null}
      </div>
      <div className="rounded-xl bg-white/20 p-3 text-white">{icon}</div>
    </div>
  </motion.div>
);

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cx(
        'flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
        active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function EmptyState({ type, onCreate, icon }: { type: string; onCreate: () => void; icon: React.ReactNode }) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 text-white/40">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-white">No hay {type}</h3>
      <p className="mb-5 text-sm text-white/50">Crea un nuevo registro para comenzar.</p>
      <button
        onClick={onCreate}
        type="button"
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-3 font-medium text-white"
      >
        <Plus className="h-4 w-4" />
        Crear
      </button>
    </div>
  );
}

function EmptyStateDetails({
  type,
  icon,
  onCreate,
}: {
  type: string;
  icon: React.ReactNode;
  onCreate: () => void;
}) {
  return (
    <Glass className="p-8 text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 text-white/40">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-white">Selecciona un {type}</h3>
      <p className="mb-5 text-sm text-white/50">Aquí verás el detalle completo y acciones rápidas.</p>
      <button
        onClick={onCreate}
        type="button"
        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-white transition-colors hover:bg-white/20"
      >
        <Plus className="h-4 w-4" />
        Crear {type}
      </button>
    </Glass>
  );
}

function AvatarBadge({ name, active }: { name: string; active: boolean }) {
  return (
    <div
      className={cx(
        'flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold',
        active ? 'bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] text-white' : 'bg-white/10 text-white/40'
      )}
    >
      {getInitials(name)}
    </div>
  );
}

function CustomerCard({
  customer,
  isSelected,
  onSelect,
  onEdit,
  onToggleActive,
  onDelete,
  busy,
}: {
  customer: CustomerWithPricing;
  isSelected: boolean;
  onSelect: (customer: CustomerWithPricing) => void;
  onEdit: (customer: CustomerWithPricing) => void;
  onToggleActive: (customer: CustomerUI) => void;
  onDelete: (value: { type: 'customer'; id: string; nombre: string }) => void;
  busy: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cx(
        'rounded-2xl border p-4 transition-colors',
        isSelected ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-white/10 bg-white/5'
      )}
      onClick={() => onSelect(customer)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AvatarBadge name={customer.nombre} active={customer.activo} />
          <div>
            <p className="font-semibold text-white">{customer.nombre}</p>
            <p className="text-sm text-white/50">{customer.diner_nombre || 'Sin comedor'}</p>
          </div>
        </div>
        <span
          className={cx(
            'rounded-full px-2 py-1 text-xs font-medium',
            customer.activo ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'
          )}
        >
          {customer.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <SmallStat label="Productos" value={customer.product_count || 0} />
        <SmallStat label="Valor" value={money(customer.total_value)} />
      </div>

      <div className="mb-4 space-y-1 text-sm text-white/60">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-white/40" />
          <span>{customer.telefono || 'Sin teléfono'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Coffee className="h-4 w-4 text-white/40" />
          <span>Equipo: {customer.capacidad_equipo || 'N/A'}</span>
        </div>
      </div>

      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onToggleActive(customer)}
          disabled={busy}
          type="button"
          className={cx(
            'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
            customer.activo
              ? 'bg-white/10 text-white/70 hover:bg-white/20'
              : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
          )}
        >
          {customer.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button
          onClick={() => onEdit(customer)}
          disabled={busy}
          type="button"
          className="rounded-xl bg-[#1E4A7A] p-2 text-white hover:bg-[#2E6B9E]"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete({ type: 'customer', id: customer.id, nombre: customer.nombre })}
          disabled={busy}
          type="button"
          className="rounded-xl bg-red-500/20 p-2 text-red-300 hover:bg-red-500/30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function CustomerListItem({
  customer,
  isSelected,
  onSelect,
  onEdit,
  onToggleActive,
  onDelete,
  busy,
}: {
  customer: CustomerWithPricing;
  isSelected: boolean;
  onSelect: (customer: CustomerWithPricing) => void;
  onEdit: (customer: CustomerWithPricing) => void;
  onToggleActive: (customer: CustomerUI) => void;
  onDelete: (value: { type: 'customer'; id: string; nombre: string }) => void;
  busy: boolean;
}) {
  return (
    <motion.div
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      className={cx('cursor-pointer px-6 py-4 transition-colors', isSelected && 'bg-white/10')}
      onClick={() => onSelect(customer)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarBadge name={customer.nombre} active={customer.activo} />
          <div className="min-w-0">
            <h3 className="truncate font-medium text-white">{customer.nombre}</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
              <span>{customer.diner_nombre || 'Sin comedor'}</span>
              <span>{customer.telefono || 'Sin teléfono'}</span>
              <span>{customer.product_count || 0} productos</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <span
            className={cx(
              'rounded-full px-2 py-1 text-xs font-medium',
              customer.activo ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'
            )}
          >
            {customer.activo ? 'Activo' : 'Inactivo'}
          </span>
          <span className="min-w-[90px] text-right text-sm font-medium text-cyan-200">
            {money(customer.total_value)}
          </span>
          <button
            onClick={() => onEdit(customer)}
            disabled={busy}
            type="button"
            className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onToggleActive(customer)}
            disabled={busy}
            type="button"
            className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
          >
            {customer.activo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onDelete({ type: 'customer', id: customer.id, nombre: customer.nombre })}
            disabled={busy}
            type="button"
            className="rounded-lg bg-red-500/20 p-2 text-red-300 hover:bg-red-500/30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function DinerListItem({
  diner,
  isSelected,
  onSelect,
  onEdit,
  onToggleActive,
  onDelete,
  busy,
}: {
  diner: DinerUI;
  isSelected: boolean;
  onSelect: (diner: DinerUI) => void;
  onEdit: (diner: DinerUI) => void;
  onToggleActive: (diner: DinerUI) => void;
  onDelete: (value: { type: 'diner'; id: string; nombre: string }) => void;
  busy: boolean;
}) {
  return (
    <motion.div
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      className={cx('cursor-pointer px-6 py-4 transition-colors', isSelected && 'bg-white/10')}
      onClick={() => onSelect(diner)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#4A1F2F] to-[#2D1B3A] text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-medium text-white">{diner.nombre}</h3>
            <p className="text-sm text-white/50">{diner.customer_count || 0} clientes asignados</p>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span
            className={cx(
              'rounded-full px-2 py-0.5 text-xs',
              diner.activo ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'
            )}
          >
            {diner.activo ? 'Activo' : 'Inactivo'}
          </span>
          <button
            onClick={() => onEdit(diner)}
            disabled={busy}
            type="button"
            className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onToggleActive(diner)}
            disabled={busy}
            type="button"
            className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
          >
            {diner.activo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onDelete({ type: 'diner', id: diner.id, nombre: diner.nombre })}
            disabled={busy}
            type="button"
            className="rounded-lg bg-red-500/20 p-2 text-red-300 hover:bg-red-500/30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function DetailCard({
  label,
  value,
  icon,
  color = 'text-white',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="mb-1 text-sm text-white/50">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-white/40">{icon}</span>
        <span className={cx('font-medium', color)}>{value}</span>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-xs text-white/40">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function CustomerDetails({
  customer,
  onEdit,
  onToggleActive,
  onDelete,
  products,
  busy,
}: {
  customer: CustomerWithPricing;
  onEdit: (customer: CustomerWithPricing) => void;
  onToggleActive: (customer: CustomerUI) => void;
  onDelete: (value: { type: 'customer'; id: string; nombre: string }) => void;
  products: ProductUI[];
  busy: boolean;
}) {
  const selectedProducts = products
    .map((product) => {
      const state = customer.pricing?.[product.id];
      if (!state?.selected || !state?.activo) return null;
      const override = toNum(state.price_override);
      const finalPrice = override === null ? product.precio_base : override;
      return { product, override, finalPrice };
    })
    .filter(Boolean) as Array<{ product: ProductUI; override: number | null; finalPrice: number }>;

  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-white/10 p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <AvatarBadge name={customer.nombre} active={customer.activo} />
            <div>
              <h3 className="text-xl font-semibold text-white">{customer.nombre}</h3>
              <p className="text-sm text-white/50">{customer.diner_nombre || 'Sin comedor'}</p>
            </div>
          </div>
          <span
            className={cx(
              'rounded-full px-3 py-1 text-xs font-medium',
              customer.activo ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'
            )}
          >
            {customer.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailCard label="Teléfono" value={customer.telefono || '—'} icon={<Phone className="h-4 w-4" />} />
          <DetailCard label="Equipo" value={customer.capacidad_equipo || 'N/A'} icon={<Coffee className="h-4 w-4" />} />
          <div className="rounded-xl bg-white/5 p-4">
            <p className="mb-1 text-sm text-white/50">Maps</p>
            <div className="flex items-center gap-2">
              <span className="text-white/40">
                <MapPin className="h-4 w-4" />
              </span>
              {customer.maps_url ? (
                <a
                  href={customer.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-cyan-200 underline underline-offset-4 hover:text-cyan-100"
                >
                  Link de Cliente
                </a>
              ) : (
                <span className="font-medium text-white">Sin link</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <SmallStat label="Productos activos" value={selectedProducts.length} />
        </div>
      </div>

      <div className="border-b border-white/10 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold text-white">Productos asignados</h4>
        </div>

        {selectedProducts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-white/50">
            Este cliente aún no tiene productos asignados.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedProducts.map(({ product, override, finalPrice }) => (
              <div key={product.id} className="rounded-xl bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{product.nombre}</p>
                    <p className="text-sm text-white/50">Precio base: {money(product.precio_base)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40">Precio final</p>
                    <p className="font-semibold text-cyan-200">{money(finalPrice)}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-lg bg-[#0A1A2F]/50 p-3">
                    <p className="text-white/40">Base</p>
                    <p className="font-medium text-white">{money(product.precio_base)}</p>
                  </div>
                  <div className="rounded-lg bg-[#0A1A2F]/50 p-3">
                    <p className="text-white/40">Precio por Cliente</p>
                    <p className="font-medium text-white">{override === null ? 'Usa base' : money(override)}</p>
                  </div>
                  <div className="rounded-lg bg-[#0A1A2F]/50 p-3">
                    <p className="text-white/40">Final</p>
                    <p className="font-medium text-cyan-200">{money(finalPrice)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 p-6">
        <button
          onClick={() => onToggleActive(customer)}
          disabled={busy}
          type="button"
          className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-white/80 hover:bg-white/20"
        >
          {customer.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button
          onClick={() => onEdit(customer)}
          disabled={busy}
          type="button"
          className="rounded-xl bg-[#1E4A7A] px-4 py-3 text-white hover:bg-[#2E6B9E]"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete({ type: 'customer', id: customer.id, nombre: customer.nombre })}
          disabled={busy}
          type="button"
          className="rounded-xl bg-red-500/20 px-4 py-3 text-red-300 hover:bg-red-500/30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Glass>
  );
}

function DinerDetails({
  diner,
  onEdit,
  onToggleActive,
  onDelete,
  customers,
  busy,
}: {
  diner: DinerUI;
  onEdit: (diner: DinerUI) => void;
  onToggleActive: (diner: DinerUI) => void;
  onDelete: (value: { type: 'diner'; id: string; nombre: string }) => void;
  customers: CustomerWithPricing[];
  busy: boolean;
}) {
  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-white/10 p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4A1F2F] to-[#2D1B3A] text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">{diner.nombre}</h3>
              <p className="text-sm text-white/50">{diner.customer_count || 0} clientes asignados</p>
            </div>
          </div>
          <span
            className={cx(
              'rounded-full px-3 py-1 text-xs font-medium',
              diner.activo ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'
            )}
          >
            {diner.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SmallStat label="Clientes" value={customers.length} />
          <SmallStat label="Estado" value={diner.activo ? 'Activo' : 'Inactivo'} />
        </div>
      </div>

      <div className="border-b border-white/10 p-6">
        <h4 className="mb-3 font-semibold text-white">Clientes en este comedor</h4>
        {customers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/50">
            No hay clientes asignados.
          </div>
        ) : (
          <div className="space-y-3">
            {customers.map((c) => (
              <div key={c.id} className="rounded-xl bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{c.nombre}</p>
                    <p className="text-sm text-white/50">
                      {c.product_count || 0} productos • {c.telefono || 'Sin teléfono'}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-cyan-200">{money(c.total_value)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 p-6">
        <button
          onClick={() => onToggleActive(diner)}
          disabled={busy}
          type="button"
          className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-white/80 hover:bg-white/20"
        >
          {diner.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button
          onClick={() => onEdit(diner)}
          disabled={busy}
          type="button"
          className="rounded-xl bg-[#1E4A7A] px-4 py-3 text-white hover:bg-[#2E6B9E]"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete({ type: 'diner', id: diner.id, nombre: diner.nombre })}
          disabled={busy}
          type="button"
          className="rounded-xl bg-red-500/20 px-4 py-3 text-red-300 hover:bg-red-500/30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Glass>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
  size = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={cx(
              'w-full rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-1 shadow-2xl',
              sizeClasses[size]
            )}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl bg-[#0F2A40] p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <button
                  onClick={onClose}
                  type="button"
                  className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DinerModal({
  mode,
  form,
  setForm,
  onClose,
  onSave,
  busy,
}: {
  mode: 'create' | 'edit';
  form: { id?: string; nombre: string; activo: boolean };
  setForm: React.Dispatch<React.SetStateAction<{ id?: string; nombre: string; activo: boolean }>>;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <Modal open title={mode === 'edit' ? 'Editar Comedor' : 'Nuevo Comedor'} onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-white/70">Nombre</label>
          <input
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
            placeholder="Nombre del comedor"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
          <div>
            <p className="text-sm font-medium text-white">Estado</p>
            <p className="text-xs text-white/50">Activo = disponible para asignar a clientes</p>
          </div>
          <button
            onClick={() => setForm((prev) => ({ ...prev, activo: !prev.activo }))}
            type="button"
            className={cx(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              form.activo
                ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            )}
          >
            {form.activo ? 'Activo' : 'Inactivo'}
          </button>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={busy || String(form.nombre || '').trim().length < 2}
            type="button"
            className={cx(
              'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
              busy || String(form.nombre || '').trim().length < 2
                ? 'cursor-not-allowed bg-white/10 text-white/30'
                : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
            )}
          >
            {busy ? 'Guardando...' : mode === 'edit' ? 'Guardar Cambios' : 'Crear Comedor'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CustomerModal({
  mode,
  form,
  setForm,
  onClose,
  onSave,
  formOk,
  busy,
  products,
  diners,
}: {
  mode: 'create' | 'edit';
  form: {
    id?: string;
    nombre: string;
    diner_id: string | null;
    telefono: string;
    maps_url: string;
    capacidad_equipo: string;
    activo: boolean;
    pricing: PricingState;
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      id?: string;
      nombre: string;
      diner_id: string | null;
      telefono: string;
      maps_url: string;
      capacidad_equipo: string;
      activo: boolean;
      pricing: PricingState;
    }>
  >;
  onClose: () => void;
  onSave: () => void;
  formOk: boolean;
  busy: boolean;
  products: ProductUI[];
  diners: DinerUI[];
}) {
  return (
    <Modal open title={mode === 'edit' ? 'Editar Cliente' : 'Nuevo Cliente'} onClose={onClose} size="xl">
      <div className="max-h-[80vh] overflow-y-auto pr-1">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.3fr]">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-white/70">Nombre del cliente</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                placeholder="Nombre del cliente"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">Comedor</label>
<select
  value={form.diner_id ?? ''}
  onChange={(e) => setForm((prev) => ({ ...prev, diner_id: e.target.value || null }))}
  className="w-full rounded-xl border border-white/10 bg-[#0F2A40] px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A] [&>option]:bg-[#0F2A40] [&>option]:text-white"
>
                <option value="">Sin comedor</option>
                {diners.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  value={form.telefono}
                  onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                  placeholder="Ej. 3312345678"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">Google Maps URL</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  value={form.maps_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, maps_url: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                  placeholder="https://maps.app.goo.gl/..."
                />
              </div>
              {form.maps_url && !isProbablyUrl(form.maps_url) ? (
                <p className="mt-2 text-xs text-amber-200">
                  Debes poner una URL válida que comience con http:// o https://
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">Capacidad de equipo</label>
<select
  value={form.capacidad_equipo}
  onChange={(e) => setForm((prev) => ({ ...prev, capacidad_equipo: e.target.value }))}
  className="w-full rounded-xl border border-white/10 bg-[#0F2A40] px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A] [&>option]:bg-[#0F2A40] [&>option]:text-white"
>
                {CAPACITIES.map((cap) => (
                  <option key={cap} value={cap}>
                    {cap}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
              <div>
                <p className="text-sm font-medium text-white">Estado del cliente</p>
                <p className="text-xs text-white/50">Activo = aparece disponible en operación</p>
              </div>
              <button
                onClick={() => setForm((prev) => ({ ...prev, activo: !prev.activo }))}
                type="button"
                className={cx(
                  'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  form.activo
                    ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                )}
              >
                {form.activo ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Productos y precio por cliente</h3>
                <p className="text-sm text-white/50">
                  Si dejas vacío el precio personalizado, usará el precio base.
                </p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70">
                {Object.values(form.pricing || {}).filter((x) => x?.selected).length} asignados
              </div>
            </div>

            <div className="space-y-3">
              {products.map((p) => {
                const st: ProductPricingState = form.pricing?.[p.id] ?? {
                  selected: false,
                  price_override: '',
                  activo: true,
                };

                const finalPrice = getCustomerProductFinalPrice(p, st);

                return (
                  <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">{p.nombre}</p>
                        <p className="text-sm text-white/50">Base: {money(p.precio_base)}</p>
                        <p className="text-xs text-white/35">{p.displayName}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            pricing: {
                              ...prev.pricing,
                              [p.id]: {
                                ...st,
                                selected: !st.selected,
                                activo: true,
                              },
                            },
                          }))
                        }
                        className={cx(
                          'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                          st.selected
                            ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                        )}
                      >
                        {st.selected ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Check className="h-4 w-4" />
                            Asignado
                          </span>
                        ) : (
                          'Asignar'
                        )}
                      </button>
                    </div>

                    {st.selected ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-white/70">Precio personalizado</label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                            <input
                              value={st.price_override}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  pricing: {
                                    ...prev.pricing,
                                    [p.id]: {
                                      ...st,
                                      price_override: e.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder={`Base ${money(p.precio_base)}`}
                              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                            />
                          </div>
                          <p className="mt-1 text-xs text-white/40">
                            Vacío = usa precio base. Si pones el mismo precio base, se guarda como null.
                          </p>
                        </div>

                        <div className="flex items-end">
                          <div className="w-full rounded-xl bg-[#0A1A2F]/60 p-4">
                            <p className="text-xs text-white/50">Precio final para este cliente</p>
                            <p className="text-lg font-semibold text-cyan-200">{money(finalPrice)}</p>
                            <p className="mt-1 text-xs text-white/40">
                              Override: {toNum(st.price_override) === null ? 'No' : 'Sí'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3 border-t border-white/10 pt-6">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={busy || !formOk}
            type="button"
            className={cx(
              'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
              busy || !formOk
                ? 'cursor-not-allowed bg-white/10 text-white/30'
                : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
            )}
          >
            {busy ? 'Guardando...' : mode === 'edit' ? 'Guardar Cambios' : 'Crear Cliente'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({
  item,
  onConfirm,
  onClose,
  busy,
}: {
  item: { type: 'diner' | 'customer'; id: string; nombre: string };
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <Modal open title="Confirmar eliminación" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-medium">
                Vas a eliminar este {item.type === 'customer' ? 'cliente' : 'comedor'}:
              </p>
              <p className="mt-1 text-amber-200/90">{item.nombre}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-white/60">
          Esta acción puede afectar relaciones existentes en tu operación.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            type="button"
            className="flex-1 rounded-xl bg-red-500/20 px-4 py-3 font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
          >
            {busy ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-20 animate-pulse rounded-2xl bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/10" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="h-[500px] animate-pulse rounded-2xl bg-white/10" />
        </div>
        <div>
          <div className="h-[500px] animate-pulse rounded-2xl bg-white/10" />
        </div>
      </div>
    </div>
  );
}