'use client';

// app/admin/usuarios/clientes/page.tsx
// ✅ CLIENTES + COMEDORES (ADMIN) — Global Ice (Supabase)
// ✅ Compatible con tu SQL real: diners.nombre / customers.nombre / products.activo / customer_products.precio_override
// ✅ Modal de Cliente con SCROLL real
// ✅ UI/UX: layout izquierda/derecha, KPIs, búsqueda, filtros, grid/list

import React, { useEffect, useMemo, useState } from 'react';
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
  Shield,
  Phone,
} from 'lucide-react';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

/** Tablas según TU SQL */
const T_PRODUCTS = 'products';
const T_DINERS = 'diners';
const T_CUSTOMERS = 'customers';
const T_CPP = 'customer_products';

type ProductUI = {
  id: string;
  nombre: string;
  precio_base: number;
  stock_actual: number;
  active: boolean; // compatibilidad temporal con UI
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

type CPPUI = {
  id: string;
  customer_id: string;
  product_id: string;
  precio_override: number | null;
  activo: boolean;
};

type PricingState = Record<string, { selected: boolean; price_override: string; activo: boolean }>;

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
  const x = Number(String(v ?? '').trim());
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

export default function AdminClientesPage() {
  const router = useRouter();
  const guard = useAdminGuard();
  const sb = supabaseBrowser as unknown as any;

  const [products, setProducts] = useState<ProductUI[]>([]);
  const [diners, setDiners] = useState<DinerUI[]>([]);
  const [customers, setCustomers] = useState<CustomerUI[]>([]);
  const [pricingRows, setPricingRows] = useState<CPPUI[]>([]);

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

  function buildPricingStateBase(): PricingState {
    const pricing: PricingState = {};
    for (const p of products) pricing[p.id] = { selected: false, price_override: '', activo: true };
    return pricing;
  }

  function buildPricingStateFromCustomer(c?: CustomerWithPricing | null): PricingState {
    const pricing = buildPricingStateBase();
    if (c?.pricing) {
      for (const pid of Object.keys(c.pricing)) {
        if (!pricing[pid]) continue;
        pricing[pid] = { ...c.pricing[pid] };
      }
    }
    return pricing;
  }

  async function loadAll() {
    setErr('');
    setLoading(true);
    try {
      const { data: pData, error: pErr } = await sb
        .from(T_PRODUCTS)
        .select('id,nombre,precio_base,stock_actual,activo')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (pErr) throw pErr;

      const prods: ProductUI[] = (pData ?? []).map((r: any): ProductUI => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ''),
        precio_base: Number(r.precio_base ?? 0),
        stock_actual: Math.max(0, Math.trunc(Number(r.stock_actual ?? 0))),
        active: Boolean(r.activo ?? true),
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
        .from(T_CPP)
        .select('id,customer_id,product_id,precio_override,activo');
      if (prErr) throw prErr;

      const prs: CPPUI[] = (prData ?? []).map((r: any): CPPUI => ({
        id: String(r.id),
        customer_id: String(r.customer_id),
        product_id: String(r.product_id),
        precio_override:
          r.precio_override === null || r.precio_override === undefined ? null : Number(r.precio_override),
        activo: Boolean(r.activo ?? true),
      }));

      setProducts(prods);
      setDiners(dins);
      setCustomers(custs);
      setPricingRows(prs);

      setSelectedCustomer((prev) =>
        prev ? (custs.find((x) => x.id === prev.id) as any) ?? null : null
      );
      setSelectedDiner((prev) => (prev ? (dins.find((x) => x.id === prev.id) as any) ?? null : null));
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
    loadAll();
  }, [canRender]);

  const dinersById = useMemo(() => {
    const m = new Map<string, DinerUI>();
    for (const d of diners) m.set(d.id, d);
    return m;
  }, [diners]);

  const customersWithPricing = useMemo((): CustomerWithPricing[] => {
    const byCust = new Map<string, CPPUI[]>();
    pricingRows.forEach((r: CPPUI) => {
      if (!byCust.has(r.customer_id)) byCust.set(r.customer_id, []);
      byCust.get(r.customer_id)!.push(r);
    });

    return customers.map((c: CustomerUI): CustomerWithPricing => {
      const rows = byCust.get(c.id) ?? [];
      const pricing: PricingState = {};

      for (const p of products) {
        pricing[p.id] = { selected: false, price_override: '', activo: true };
      }

      let totalValue = 0;
      for (const r of rows) {
        if (!pricing[r.product_id]) continue;
        pricing[r.product_id] = {
          selected: true,
          price_override: r.precio_override === null ? '' : String(r.precio_override),
          activo: Boolean(r.activo ?? true),
        };
        if (typeof r.precio_override === 'number') totalValue += r.precio_override;
      }

      const diner = c.diner_id ? dinersById.get(c.diner_id) : null;

      return {
        ...c,
        diner_nombre: diner?.nombre ?? null,
        diner_activo: diner?.activo ?? null,
        pricing,
        product_count: rows.length,
        total_value: totalValue,
      };
    });
  }, [customers, pricingRows, products, dinersById]);

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

    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.nombre.localeCompare(b.nombre);
      if (sortBy === 'date') return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
      if (sortBy === 'products') return (b.product_count ?? 0) - (a.product_count ?? 0);
      return 0;
    });

    return filtered;
  }, [customersWithPricing, qCustomers, filterActive, sortBy]);

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
    const capOk = CAPACITIES.includes(custForm.capacidad_equipo as any);
    return nombreOk && urlOk && capOk && !busy;
  }, [custForm.nombre, custForm.maps_url, custForm.capacidad_equipo, busy]);

  async function saveCustomer() {
    if (!customerFormOk) return;

    setBusy(true);
    setErr('');
    try {
      const nombre = String(custForm.nombre || '').trim();

      const custPayload: any = {
        nombre,
        diner_id: custForm.diner_id || null,
        telefono: custForm.telefono ? String(custForm.telefono).trim() : null,
        maps_url: custForm.maps_url ? String(custForm.maps_url).trim() : null,
        capacidad_equipo: String(custForm.capacidad_equipo || 'N/A'),
        activo: Boolean(custForm.activo),
      };

      let customerId: string | null = custForm.id ?? null;

      if (custMode === 'edit' && custForm.id) {
        const { error } = await sb.from(T_CUSTOMERS).update(custPayload).eq('id', custForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from(T_CUSTOMERS).insert(custPayload).select('id').maybeSingle();
        if (error) throw error;
        customerId = data?.id ? String(data.id) : null;
      }

      if (!customerId) throw new Error('No se pudo obtener el ID del cliente.');

      const selectedIds: string[] = Object.entries(custForm.pricing)
        .filter(([, st]: [string, any]) => Boolean(st?.selected))
        .map(([pid]: [string, any]) => pid);

      if (selectedIds.length === 0) {
        const { error: delAllErr } = await sb.from(T_CPP).delete().eq('customer_id', customerId);
        if (delAllErr) throw delAllErr;
      } else {
        const notInSql = `(${selectedIds.map((x: string) => `'${x}'`).join(',')})`;
        await sb.from(T_CPP).delete().eq('customer_id', customerId).not('product_id', 'in', notInSql);
      }

      if (selectedIds.length) {
        const upserts = selectedIds.map((pid: string) => {
          const st = custForm.pricing[pid];
          const num = toNum(st.price_override);

          return {
            customer_id: customerId,
            product_id: pid,
            precio_override: num === null || String(st.price_override).trim() === '' ? null : num,
            activo: Boolean(st.activo),
          };
        });

        const { error: upErr } = await sb.from(T_CPP).upsert(upserts, { onConflict: 'customer_id,product_id' });
        if (upErr) throw upErr;
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-2xl bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] p-3 shadow-lg">
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
                className="rounded-xl bg-white/10 p-2 text-white/80 hover:bg-white/20 transition-colors"
                title={viewMode === 'grid' ? 'Vista lista' : 'Vista grid'}
              >
                {viewMode === 'grid' ? <Menu className="h-5 w-5" /> : <GripVertical className="h-5 w-5" />}
              </button>

              <button
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors"
              >
                Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            title="Total Clientes"
            value={summary.totalClientes}
            icon={<Users className="h-5 w-5" />}
            color="from-[#1E4A7A] to-[#2E6B9E]"
            subValue={`${summary.activos} activos`}
            delay={0}
          />
          <KPI
            title="Con Equipo"
            value={summary.conEquipo}
            icon={<Coffee className="h-5 w-5" />}
            color="from-[#4A1F2F] to-[#6D2F45]"
            subValue="capacidad asignada"
            delay={0.1}
          />
          <KPI
            title="Comedores"
            value={summary.totalComedores}
            icon={<Building2 className="h-5 w-5" />}
            color="from-[#2D1B3A] to-[#4A2D5A]"
            subValue={`${summary.comedoresActivos} activos`}
            delay={0.2}
          />
          <KPI
            title="Productos Cliente"
            value={customersWithPricing.reduce((acc, c) => acc + (c.product_count || 0), 0)}
            icon={<Package className="h-5 w-5" />}
            color="from-[#1E4A7A] to-[#4A1F2F]"
            subValue="asignaciones"
            delay={0.3}
          />
        </div>

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
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                />
              </div>

              <div className="flex items-center gap-3">
                {tab === 'clientes' && (
                  <>
                    <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <Filter className="h-4 w-4 text-white/60" />
                      <select
                        value={filterActive}
                        onChange={(e) => setFilterActive(e.target.value as any)}
                        className="bg-transparent text-sm text-white/80 focus:outline-none"
                      >
                        <option value="todos">Todos</option>
                        <option value="activos">Activos</option>
                        <option value="inactivos">Inactivos</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <ArrowUpDown className="h-4 w-4 text-white/60" />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
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
                  className="rounded-xl bg-white/10 p-3 text-white/80 hover:bg-white/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
                </button>

                <button
                  onClick={tab === 'clientes' ? openCreateCustomer : openCreateDiner}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-3 text-white font-medium hover:from-[#2E6B9E] hover:to-[#1E4A7A] transition-all shadow-lg"
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
              className="mb-6 rounded-xl bg-red-500/20 border border-red-500/30 p-4"
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
              className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden"
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
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
                    busy={busy}
                    products={products}
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

        {del && <DeleteModal item={del} onConfirm={confirmDelete} onClose={() => !busy && setDel(null)} busy={busy} />}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- UI Components ---------------- */

const KPI = ({ title, value, icon, color, subValue, delay = 0 }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`rounded-2xl bg-gradient-to-br ${color} p-6 shadow-xl`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-white/70 mb-1">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subValue && <p className="text-xs text-white/50 mt-1">{subValue}</p>}
      </div>
      <div className="rounded-xl bg-white/20 p-3 text-white">{icon}</div>
    </div>
  </motion.div>
);

const CustomerListItem = ({ customer, isSelected, onSelect, onEdit, onToggleActive, onDelete }: any) => (
  <motion.div
    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
    className={cx('px-6 py-4 cursor-pointer transition-colors', isSelected && 'bg-white/10')}
    onClick={() => onSelect(customer)}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] flex items-center justify-center text-white font-bold">
            {getInitials(customer.nombre)}
          </div>
          <div>
            <h3 className="font-medium text-white">{customer.nombre}</h3>
            <p className="text-sm text-white/50">
              {customer.diner_nombre || 'Sin comedor'} • {customer.product_count || 0} productos
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm">
          <span
            className={cx(
              'px-2 py-0.5 rounded-full text-xs',
              customer.activo
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            )}
          >
            {customer.activo ? 'Activo' : 'Inactivo'}
          </span>

          {String(customer.capacidad_equipo ?? 'N/A') !== 'N/A' && (
            <span className="text-white/60">
              <Coffee className="inline h-3 w-3 mr-1" />
              Cap. {customer.capacidad_equipo}
            </span>
          )}

          {customer.telefono && (
            <span className="text-white/60">
              <Phone className="inline h-3 w-3 mr-1" />
              {customer.telefono}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onEdit(customer)} className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20">
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onToggleActive(customer)}
          className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
        >
          {customer.activo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          onClick={() => onDelete({ type: 'customer', id: customer.id, nombre: customer.nombre })}
          className="rounded-lg bg-red-500/20 p-2 text-red-300 hover:bg-red-500/30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  </motion.div>
);

const CustomerCard = ({ customer, isSelected, onSelect, onEdit, onToggleActive }: any) => (
  <motion.div
    whileHover={{ y: -2 }}
    className={cx(
      'rounded-xl border p-4 cursor-pointer transition-all',
      isSelected ? 'border-[#1E4A7A] bg-[#1E4A7A]/20' : 'border-white/10 bg-white/5 hover:bg-white/10'
    )}
    onClick={() => onSelect(customer)}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] flex items-center justify-center text-white font-bold">
          {getInitials(customer.nombre)}
        </div>
        <div>
          <h3 className="font-medium text-white">{customer.nombre}</h3>
          <p className="text-xs text-white/50">{customer.diner_nombre || 'Sin comedor'}</p>
        </div>
      </div>
      <span
        className={cx(
          'px-2 py-0.5 rounded-full text-xs',
          customer.activo ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'
        )}
      >
        {customer.activo ? 'Activo' : 'Inactivo'}
      </span>
    </div>

    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
      <div className="bg-white/5 rounded-lg p-2">
        <p className="text-white/40 text-xs">Productos</p>
        <p className="text-white font-medium">{customer.product_count || 0}</p>
      </div>
      <div className="bg-white/5 rounded-lg p-2">
        <p className="text-white/40 text-xs">Capacidad</p>
        <p className="text-white font-medium">{customer.capacidad_equipo || 'N/A'}</p>
      </div>
    </div>

    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onEdit(customer)} className="flex-1 rounded-lg bg-[#1E4A7A] py-2 text-white text-sm hover:bg-[#2E6B9E]">
        Editar
      </button>
      <button onClick={() => onToggleActive(customer)} className="flex-1 rounded-lg bg-white/10 py-2 text-white text-sm hover:bg-white/20">
        {customer.activo ? 'Desactivar' : 'Activar'}
      </button>
    </div>
  </motion.div>
);

const DinerListItem = ({ diner, isSelected, onSelect, onEdit, onToggleActive, onDelete }: any) => (
  <motion.div
    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
    className={cx('px-6 py-4 cursor-pointer transition-colors', isSelected && 'bg-white/10')}
    onClick={() => onSelect(diner)}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#4A1F2F] to-[#2D1B3A] flex items-center justify-center text-white">
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
            'px-2 py-0.5 rounded-full text-xs',
            diner.activo ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'
          )}
        >
          {diner.activo ? 'Activo' : 'Inactivo'}
        </span>
        <button onClick={() => onEdit(diner)} className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={() => onToggleActive(diner)} className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20">
          {diner.activo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          onClick={() => onDelete({ type: 'diner', id: diner.id, nombre: diner.nombre })}
          className="rounded-lg bg-red-500/20 p-2 text-red-300 hover:bg-red-500/30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  </motion.div>
);

const DetailCard = ({ label, value, icon, color = 'text-white' }: any) => (
  <div className="rounded-xl bg-white/5 p-4">
    <p className="text-sm text-white/50 mb-1">{label}</p>
    <div className="flex items-center gap-2">
      <span className="text-white/40">{icon}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  </div>
);

const CustomerDetails = ({ customer, onEdit, onToggleActive, onDelete, products }: any) => {
  const selectedProducts = Object.entries(customer.pricing)
    .filter(([, st]: any) => st.selected)
    .map(([id, st]: any) => ({
      id,
      ...st,
      product: products.find((p: any) => p.id === id),
    }))
    .filter((item: any) => item.product);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-6 shadow-xl border border-white/10"
    >
      <h2 className="text-xl font-bold text-white mb-4">Detalles del Cliente</h2>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] flex items-center justify-center text-white text-2xl font-bold">
            {getInitials(customer.nombre)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{customer.nombre}</h3>
            <p className="text-white/60">{customer.diner_nombre || 'Sin comedor'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DetailCard
            label="Estado"
            value={customer.activo ? 'Activo' : 'Inactivo'}
            icon={<Shield className="h-4 w-4" />}
            color={customer.activo ? 'text-green-300' : 'text-gray-400'}
          />
          <DetailCard
            label="Capacidad"
            value={customer.capacidad_equipo || 'N/A'}
            icon={<Coffee className="h-4 w-4" />}
          />
        </div>

        {(customer.telefono || customer.maps_url) && (
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-sm text-white/50 mb-2">Contacto / Ubicación</p>
            {customer.telefono && (
              <p className="text-white text-sm flex items-center gap-2 mb-1">
                <Phone className="h-4 w-4 text-white/40" />
                {customer.telefono}
              </p>
            )}
            {customer.maps_url && (
              <a
                href={customer.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#3D8FCC] flex items-center gap-2 hover:underline"
              >
                <MapPin className="h-4 w-4" />
                Ver en Google Maps
              </a>
            )}
          </div>
        )}

        <div className="rounded-xl bg-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/50">Productos Asignados</p>
            <span className="text-xs bg-white/10 px-2 py-1 rounded-full text-white/70">{selectedProducts.length}</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedProducts.slice(0, 6).map((item: any) => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <span className="text-white">{item.product?.nombre}</span>
                <span className="text-white/60">
                  {item.price_override ? money(Number(item.price_override)) : 'Precio base'}
                </span>
              </div>
            ))}
            {selectedProducts.length > 6 && (
              <p className="text-xs text-white/40 text-center">+{selectedProducts.length - 6} productos más</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <button onClick={() => onEdit(customer)} className="flex-1 rounded-xl bg-[#1E4A7A] p-3 text-white hover:bg-[#2E6B9E]">
            Editar
          </button>
          <button onClick={() => onToggleActive(customer)} className="flex-1 rounded-xl bg-white/10 p-3 text-white hover:bg-white/20">
            {customer.activo ? 'Desactivar' : 'Activar'}
          </button>
          <button
            onClick={() => onDelete({ type: 'customer', id: customer.id, nombre: customer.nombre })}
            className="rounded-xl bg-[#4A1F2F] p-3 text-white hover:bg-[#6D2F45]"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const DinerDetails = ({ diner, onEdit, onToggleActive, onDelete, customers }: any) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#4A1F2F] p-6 shadow-xl border border-white/10"
  >
    <h2 className="text-xl font-bold text-white mb-4">Detalles del Comedor</h2>

    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#4A1F2F] to-[#2D1B3A] flex items-center justify-center text-white">
          <Building2 className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{diner.nombre}</h3>
        </div>
      </div>

      <DetailCard
        label="Estado"
        value={diner.activo ? 'Activo' : 'Inactivo'}
        icon={<Shield className="h-4 w-4" />}
        color={diner.activo ? 'text-green-300' : 'text-gray-400'}
      />

      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-sm text-white/50 mb-2">Clientes en este comedor</p>
        <p className="text-2xl font-bold text-white">{diner.customer_count || 0}</p>

        {customers?.length > 0 && (
          <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
            {customers.slice(0, 8).map((c: any) => (
              <div key={c.id} className="text-sm text-white/70 flex items-center gap-2">
                <Users className="h-3 w-3" />
                {c.nombre}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-4">
        <button onClick={() => onEdit(diner)} className="flex-1 rounded-xl bg-[#1E4A7A] p-3 text-white hover:bg-[#2E6B9E]">
          Editar
        </button>
        <button onClick={() => onToggleActive(diner)} className="flex-1 rounded-xl bg-white/10 p-3 text-white hover:bg-white/20">
          {diner.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button onClick={() => onDelete({ type: 'diner', id: diner.id, nombre: diner.nombre })} className="rounded-xl bg-[#4A1F2F] p-3 text-white hover:bg-[#6D2F45]">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  </motion.div>
);

const EmptyState = ({ type, onCreate, icon }: any) => (
  <div className="p-8 text-center">
    <div className="mx-auto w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-3">
      {icon}
    </div>
    <p className="text-white/50">No hay {type} disponibles</p>
    <button onClick={onCreate} className="mt-4 rounded-xl bg-[#1E4A7A] px-4 py-2 text-white hover:bg-[#2E6B9E]">
      Crear {type === 'clientes' ? 'cliente' : 'comedor'}
    </button>
  </div>
);

const EmptyStateDetails = ({ type, icon, onCreate }: any) => (
  <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 text-center">
    <div className="mx-auto w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-3">
      {icon}
    </div>
    <h3 className="text-lg font-medium text-white mb-2">Selecciona un {type}</h3>
    <p className="text-sm text-white/50 mb-4">Haz clic en cualquier {type} para ver sus detalles</p>
    <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-4 py-2 text-white hover:bg-[#2E6B9E]">
      <Plus className="h-4 w-4" />
      Nuevo {type}
    </button>
  </div>
);

function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-3xl border border-white/12 bg-white/6 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.35)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-[-140px] right-[-140px] h-80 w-80 rounded-full bg-[#4DADFF]/10 blur-3xl" />
        <div className="absolute top-[-140px] left-[-140px] h-80 w-80 rounded-full bg-[#852838]/10 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition inline-flex items-center justify-center gap-2',
        active
          ? 'bg-gradient-to-r from-[#0B1C3A] via-[#144078] to-[#4DADFF] shadow-[0_18px_50px_rgba(0,0,0,0.25)]'
          : 'border border-white/10 bg-white/5 text-white/75 hover:bg-white/8'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

const DinerModal = ({ mode, form, setForm, onClose, onSave, busy }: any) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.9, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.9, y: 20 }}
      className="w-full max-w-md rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-6 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">{mode === 'create' ? 'Nuevo Comedor' : 'Editar Comedor'}</h2>
        <button onClick={onClose} className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-white/70 mb-2">Nombre del comedor</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
            placeholder="Ej: Comedor Industrial Norte"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
          <div>
            <p className="text-sm font-medium text-white">Estado</p>
            <p className="text-xs text-white/50">Inactivo no se usa para asignar</p>
          </div>
          <button
            onClick={() => setForm({ ...form, activo: !form.activo })}
            className={cx(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              form.activo ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-white/10 text-white/70 hover:bg-white/20'
            )}
          >
            {form.activo ? 'Activo' : 'Inactivo'}
          </button>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={busy || String(form.nombre).trim().length < 2}
            className={cx(
              'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
              busy || String(form.nombre).trim().length < 2
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
            )}
          >
            {busy ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </motion.div>
  </motion.div>
);

const CustomerModal = ({ mode, form, setForm, onClose, onSave, formOk, busy, products, diners }: any) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-y-auto"
    onClick={onClose}
  >
    <div className="min-h-full w-full flex items-start justify-center p-4 sm:p-6">
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-4xl rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] shadow-xl my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6 sticky top-0 bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] z-10 pb-4">
            <h2 className="text-xl font-bold text-white">{mode === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}</h2>
            <button onClick={onClose} className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white border-b border-white/10 pb-2">Información</h3>

              <div>
                <label className="block text-sm text-white/70 mb-2">Nombre del cliente *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                  placeholder="Ej: Taquería El Güero"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Comedor asociado</label>
                <select
                  value={form.diner_id || ''}
                  onChange={(e) => setForm({ ...form, diner_id: e.target.value || null })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                >
                  <option value="">Sin comedor</option>
                  {diners.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Teléfono</label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                  placeholder="Ej: 33 1234 5678"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Link de Google Maps</label>
                <input
                  type="url"
                  value={form.maps_url}
                  onChange={(e) => setForm({ ...form, maps_url: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                  placeholder="https://maps.app.goo.gl/..."
                />
                <p className="mt-1 text-xs text-white/40">Vacío permitido. Si lo llenas, debe empezar con http(s).</p>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Capacidad de equipo</label>
                <select
                  value={form.capacidad_equipo}
                  onChange={(e) => setForm({ ...form, capacidad_equipo: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
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
                  <p className="text-xs text-white/50">Inactivo no aparece para pedidos</p>
                </div>
                <button
                  onClick={() => setForm({ ...form, activo: !form.activo })}
                  className={cx(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                    form.activo
                      ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  )}
                >
                  {form.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white border-b border-white/10 pb-2">Productos Asignados</h3>

              <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-2">
                {products.map((p: any) => {
                  const st = form.pricing[p.id] || { selected: false, price_override: '', activo: true };
                  const selected = st.selected;

                  return (
                    <div
                      key={p.id}
                      className={cx(
                        'rounded-xl border p-3 transition',
                        selected ? 'border-[#4DADFF]/35 bg-[#4DADFF]/10' : 'border-white/10 bg-white/5'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              setForm({
                                ...form,
                                pricing: { ...form.pricing, [p.id]: { ...st, selected: !selected } },
                              })
                            }
                            className="mt-1"
                          />
                          <div>
                            <p className="text-sm font-medium text-white">{p.nombre}</p>
                            <p className="text-xs text-white/50">Base: {money(p.precio_base)}</p>
                          </div>
                        </div>

                        {selected && (
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <DollarSign className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                              <input
                                type="number"
                                value={st.price_override}
                                onChange={(e) =>
                                  setForm({
                                    ...form,
                                    pricing: { ...form.pricing, [p.id]: { ...st, price_override: e.target.value } },
                                  })
                                }
                                placeholder="Override"
                                className="w-28 rounded-lg border border-white/10 bg-white/5 pl-7 pr-2 py-1 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#1E4A7A]"
                              />
                            </div>
                            <button
                              onClick={() =>
                                setForm({
                                  ...form,
                                  pricing: { ...form.pricing, [p.id]: { ...st, activo: !st.activo } },
                                })
                              }
                              className={cx(
                                'p-1.5 rounded-lg transition-colors',
                                st.activo ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'
                              )}
                              title={st.activo ? 'Activo' : 'Inactivo'}
                            >
                              {st.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-xs text-white/50">
                  Tip: si no seleccionas productos, se borran asignaciones previas del cliente.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-6 mt-4 border-t border-white/10 sticky bottom-0 bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] z-10">
            <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10">
              Cancelar
            </button>
            <button
              onClick={onSave}
              disabled={!formOk || busy}
              className={cx(
                'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
                !formOk || busy ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
              )}
            >
              {busy ? 'Guardando...' : 'Guardar Cliente'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  </motion.div>
);

const DeleteModal = ({ item, onConfirm, onClose, busy }: any) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.9, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.9, y: 20 }}
      className="w-full max-w-md rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#4A1F2F] p-6 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-center mb-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">
          ¿Eliminar {item.type === 'customer' ? 'cliente' : 'comedor'}?
        </h2>
        <p className="text-sm text-white/60 mt-2">
          Estás a punto de eliminar <span className="font-semibold text-white">{item.nombre}</span>
        </p>
        <p className="text-xs text-white/40 mt-1">Esta acción no se puede deshacer.</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10 disabled:opacity-50">
          Cancelar
        </button>
        <button onClick={onConfirm} disabled={busy} className="flex-1 rounded-xl bg-gradient-to-r from-[#4A1F2F] to-[#6D2F45] px-4 py-3 text-white font-medium hover:from-[#6D2F45] hover:to-[#4A1F2F] disabled:opacity-50">
          {busy ? 'Eliminando...' : 'Sí, eliminar'}
        </button>
      </div>
    </motion.div>
  </motion.div>
);

function Skeleton() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-white/10 mx-auto" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}