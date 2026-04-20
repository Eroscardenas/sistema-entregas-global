'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

import {
  Plus,
  PlusCircle,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  DollarSign,
  Warehouse,
  Minus,
  ChevronRight,
  Filter,
  Layers,
  BarChart3,
  Shield,
  GripVertical,
} from 'lucide-react';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type ProductKind = 'bolsa' | 'barra';

type ProductUI = {
  id: string;
  nombre: string;
  precio_base: number;
  stock_actual: number;
  activo: boolean;
  kind: ProductKind;
  ice_type: string;
  kg_por_unidad: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type FormState = {
  id?: string;
  nombre: string;
  precio: string;
  stock: string;
  activo: boolean;
  kind: ProductKind;
  ice_type: string;
  kg_por_unidad: string;
};

const EMPTY: FormState = {
  nombre: '',
  precio: '',
  stock: '',
  activo: true,
  kind: 'bolsa',
  ice_type: 'normal',
  kg_por_unidad: '5',
};

function toNum(v: string) {
  const x = Number(String(v ?? '').trim());
  if (!Number.isFinite(x)) return null;
  return x;
}

function money(n?: number | null) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

function safeErr(e: any) {
  return (
    (typeof e?.message === 'string' && e.message) ||
    (typeof e?.error_description === 'string' && e.error_description) ||
    'Ocurrió un error.'
  );
}

function productSubtitle(product: Pick<ProductUI, 'kind' | 'ice_type' | 'kg_por_unidad'>) {
  const parts: string[] = [];

  if (product.kind?.trim()) parts.push(product.kind.toUpperCase());
  if (product.ice_type?.trim()) parts.push(product.ice_type);
  if (Number(product.kg_por_unidad) > 0) parts.push(`${product.kg_por_unidad} kg`);

  return parts.length ? parts.join(' • ') : 'Sin detalle';
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error('No auth token (sin sesión). Inicia sesión como admin.');
  }

  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }

  return json as T;
}

export default function AdminProductosPage() {
  const router = useRouter();
  const guard = useAdminGuard();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [rows, setRows] = useState<ProductUI[]>([]);
  const [q, setQ] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductUI | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'nombre' | 'precio' | 'stock'>('nombre');

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<FormState>(EMPTY);

  const [delId, setDelId] = useState<string | null>(null);

  const canRender = !guard.loading && guard.isAuthed;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const haystack = [
        r.nombre,
        r.kind,
        r.ice_type,
        String(r.kg_por_unidad),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(s);
    });
  }, [rows, q]);

  const sortedProducts = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'nombre') return a.nombre.localeCompare(b.nombre);
      if (sortBy === 'precio') return b.precio_base - a.precio_base;
      if (sortBy === 'stock') return b.stock_actual - a.stock_actual;
      return 0;
    });
  }, [filtered, sortBy]);

  const summary = useMemo(() => {
    const activos = rows.filter((r) => r.activo).length;
    const stockTotal = rows.reduce((a, r) => a + (Number(r.stock_actual) || 0), 0);
    const valorTotal = rows.reduce(
      (a, r) => a + (Number(r.precio_base) * Number(r.stock_actual) || 0),
      0
    );

    return {
      activos,
      total: rows.length,
      stockTotal,
      valorTotal,
      inactivos: rows.length - activos,
    };
  }, [rows]);

  const formOk = useMemo(() => {
    const nombre = String(form.nombre || '').trim();
    const precio = toNum(form.precio);
    const stock = toNum(form.stock);
    const kg = toNum(form.kg_por_unidad);

    if (!nombre || nombre.length < 2) return false;
    if (precio === null || precio < 0) return false;
    if (stock === null || stock < 0) return false;
    if (!['bolsa', 'barra'].includes(form.kind)) return false;
    if (!String(form.ice_type || '').trim()) return false;
    if (kg === null || kg <= 0) return false;

    return true;
  }, [form]);

  async function load() {
    setErr('');
    setLoading(true);

    try {
      const r = await api<{ data: any[] }>('/api/admin/products', {
        method: 'GET',
      });

      const mapped: ProductUI[] = (r.data ?? []).map((x: any) => ({
        id: String(x.id),
        nombre: String(x.nombre ?? ''),
        precio_base: Number(x.precio_base ?? 0),
        stock_actual: Number(x.stock_actual ?? 0),
        activo: Boolean(x.activo ?? x.active ?? true),
        kind: (x.kind === 'barra' ? 'barra' : 'bolsa') as ProductKind,
        ice_type: String(x.ice_type ?? 'normal'),
        kg_por_unidad: Number(x.kg_por_unidad ?? 0),
        created_at: x.created_at ?? null,
        updated_at: x.updated_at ?? null,
      }));

      setRows(mapped);

      setSelectedProduct((prev) => {
        if (!prev) return null;
        return mapped.find((x) => x.id === prev.id) ?? null;
      });
    } catch (e: any) {
      setRows([]);
      setSelectedProduct(null);
      setErr(safeErr(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canRender) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender]);

  function openCreate() {
    setMode('create');
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: ProductUI) {
    setMode('edit');
    setForm({
      id: p.id,
      nombre: p.nombre,
      precio: String(p.precio_base ?? 0),
      stock: String(p.stock_actual ?? 0),
      activo: Boolean(p.activo),
      kind: p.kind ?? 'bolsa',
      ice_type: p.ice_type ?? 'normal',
      kg_por_unidad: String(p.kg_por_unidad ?? 5),
    });
    setOpen(true);
  }

  async function save() {
    if (!formOk) return;

    setBusy(true);
    setErr('');

    try {
      const payload = {
        nombre: String(form.nombre || '').trim(),
        precio_base: Number(toNum(form.precio)),
        stock_actual: Math.trunc(Number(toNum(form.stock))),
        activo: Boolean(form.activo),
        kind: form.kind,
        ice_type: String(form.ice_type || '').trim(),
        kg_por_unidad: Number(toNum(form.kg_por_unidad)),
      };

      if (mode === 'edit' && form.id) {
        await api('/api/admin/products', {
          method: 'PATCH',
          body: JSON.stringify({ id: form.id, ...payload }),
        });
      } else {
        await api('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setOpen(false);
      setForm(EMPTY);
      await load();
    } catch (e: any) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActivo(p: ProductUI) {
    setBusy(true);
    setErr('');

    try {
      const nextActivo = !p.activo;

      await api('/api/admin/products', {
        method: 'PATCH',
        body: JSON.stringify({ id: p.id, activo: nextActivo }),
      });

      setRows((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                activo: nextActivo,
              }
            : x
        )
      );

      if (selectedProduct?.id === p.id) {
        setSelectedProduct({
          ...p,
          activo: nextActivo,
        });
      }
    } catch (e: any) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function adjustStock(p: ProductUI, delta: number) {
    const next = Math.max(0, (Number(p.stock_actual) || 0) + delta);

    setBusy(true);
    setErr('');

    try {
      await api('/api/admin/products', {
        method: 'PATCH',
        body: JSON.stringify({ id: p.id, stock_actual: next }),
      });

      setRows((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                stock_actual: next,
              }
            : x
        )
      );

      if (selectedProduct?.id === p.id) {
        setSelectedProduct({
          ...p,
          stock_actual: next,
        });
      }
    } catch (e: any) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    setBusy(true);
    setErr('');

    try {
      await api('/api/admin/products', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });

      setDelId(null);

      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }

      await load();
    } catch (e: any) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-2xl bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] p-3 shadow-lg">
                <Layers className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Gestión de Productos</h1>
                <p className="text-sm text-white/70">
                  Administra tu catálogo base e inventario real
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="rounded-xl bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
              >
                {viewMode === 'grid' ? (
                  <BarChart3 className="h-5 w-5" />
                ) : (
                  <GripVertical className="h-5 w-5" />
                )}
              </button>

              <button
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
              >
                Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            title="Total Productos"
            value={summary.total}
            icon={<Package className="h-5 w-5" />}
            color="from-[#1E4A7A] to-[#2E6B9E]"
            delay={0}
          />
          <KPI
            title="Stock Total"
            value={summary.stockTotal}
            icon={<Warehouse className="h-5 w-5" />}
            color="from-[#4A1F2F] to-[#6D2F45]"
            delay={0.1}
          />
          <KPI
            title="Valor Inventario"
            value={money(summary.valorTotal)}
            icon={<DollarSign className="h-5 w-5" />}
            color="from-[#2D1B3A] to-[#4A2D5A]"
            delay={0.2}
          />
          <KPI
            title="Productos Activos"
            value={`${summary.activos}/${summary.total}`}
            icon={<Shield className="h-5 w-5" />}
            color="from-[#1E4A7A] to-[#4A1F2F]"
            subValue={`${summary.inactivos} inactivos`}
            delay={0.3}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar productos por nombre, tipo o ice type..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <Filter className="h-4 w-4 text-white/60" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'nombre' | 'precio' | 'stock')}
                    className="bg-transparent text-sm text-white/80 focus:outline-none"
                  >
                    <option value="nombre">Ordenar por nombre</option>
                    <option value="precio">Mayor precio</option>
                    <option value="stock">Mayor stock</option>
                  </select>
                </div>

                <button
                  onClick={load}
                  disabled={loading}
                  className="rounded-xl bg-white/10 p-3 text-white/80 transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
                </button>

                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-3 font-medium text-white shadow-lg transition-all hover:from-[#2E6B9E] hover:to-[#1E4A7A]"
                >
                  <Plus className="h-5 w-5" />
                  Nuevo Producto
                </button>
              </div>
            </div>
          </div>
        </motion.div>

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
                <h2 className="text-lg font-semibold text-white">Listado de Productos</h2>
                <p className="text-sm text-white/50">
                  {sortedProducts.length} productos encontrados
                </p>
              </div>

              <div className="divide-y divide-white/10">
                {loading ? (
                  <div className="p-8 text-center text-white/50">Cargando productos...</div>
                ) : sortedProducts.length === 0 ? (
                  <div className="p-8 text-center">
                    <Package className="mx-auto mb-3 h-12 w-12 text-white/20" />
                    <p className="text-white/50">No hay productos disponibles</p>
                    <button
                      onClick={openCreate}
                      className="mt-4 rounded-xl bg-[#1E4A7A] px-4 py-2 text-white transition-colors hover:bg-[#2E6B9E]"
                    >
                      Crear primer producto
                    </button>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                    {sortedProducts.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        isSelected={selectedProduct?.id === p.id}
                        onSelect={setSelectedProduct}
                        onEdit={openEdit}
                        onToggleActivo={toggleActivo}
                        onAdjustStock={adjustStock}
                        busy={busy}
                      />
                    ))}
                  </div>
                ) : (
                  sortedProducts.map((p) => (
                    <ProductListItem
                      key={p.id}
                      product={p}
                      isSelected={selectedProduct?.id === p.id}
                      onSelect={setSelectedProduct}
                      onEdit={openEdit}
                      onToggleActivo={toggleActivo}
                      onDelete={setDelId}
                      busy={busy}
                    />
                  ))
                )}
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="sticky top-6"
            >
              {selectedProduct ? (
                <ProductDetails
                  product={selectedProduct}
                  onEdit={openEdit}
                  onToggleActivo={toggleActivo}
                  onAdjustStock={adjustStock}
                  onDelete={setDelId}
                  busy={busy}
                />
              ) : (
                <EmptyState onCreate={openCreate} />
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <ProductModal
            mode={mode}
            form={form}
            setForm={setForm}
            onClose={() => !busy && setOpen(false)}
            onSave={save}
            formOk={formOk}
            busy={busy}
          />
        )}

        {delId && (
          <DeleteModal
            onConfirm={confirmDelete}
            onClose={() => !busy && setDelId(null)}
            busy={busy}
            delId={delId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================= components ================= */

const KPI = ({
  title,
  value,
  icon,
  color,
  delay = 0,
  subValue,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  delay?: number;
  subValue?: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`rounded-2xl bg-gradient-to-br ${color} p-6 shadow-xl`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="mb-1 text-sm text-white/70">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subValue && <p className="mt-1 text-xs text-white/50">{subValue}</p>}
      </div>
      <div className="rounded-xl bg-white/20 p-3 text-white">{icon}</div>
    </div>
  </motion.div>
);

const ProductListItem = ({
  product,
  isSelected,
  onSelect,
  onEdit,
  onToggleActivo,
  onDelete,
  busy,
}: {
  product: ProductUI;
  isSelected: boolean;
  onSelect: (product: ProductUI) => void;
  onEdit: (product: ProductUI) => void;
  onToggleActivo: (product: ProductUI) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) => (
  <motion.div
    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
    className={cx(
      'cursor-pointer px-6 py-4 transition-colors',
      isSelected && 'bg-white/10'
    )}
    onClick={() => onSelect(product)}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-white">{product.nombre}</h3>
          <span
            className={cx(
              'rounded-full px-2 py-0.5 text-xs',
              product.activo
                ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                : 'border border-gray-500/30 bg-gray-500/20 text-gray-400'
            )}
          >
            {product.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <p className="mt-2 text-xs text-white/45">{productSubtitle(product)}</p>

        <div className="mt-2 flex items-center gap-4 text-sm">
          <span className="text-white/60">
            <DollarSign className="mr-1 inline h-3 w-3" />
            {money(product.precio_base)}
          </span>
          <span className="text-white/60">
            <Warehouse className="mr-1 inline h-3 w-3" />
            Stock: {product.stock_actual}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onEdit(product)}
          disabled={busy}
          className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onToggleActivo(product)}
          disabled={busy}
          className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(product.id)}
          disabled={busy}
          className="rounded-lg bg-red-500/20 p-2 text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  </motion.div>
);

const ProductCard = ({
  product,
  isSelected,
  onSelect,
  onEdit,
  onToggleActivo,
  onAdjustStock,
  busy,
}: {
  product: ProductUI;
  isSelected: boolean;
  onSelect: (product: ProductUI) => void;
  onEdit: (product: ProductUI) => void;
  onToggleActivo: (product: ProductUI) => void;
  onAdjustStock: (product: ProductUI, delta: number) => void;
  busy: boolean;
}) => (
  <motion.div
    whileHover={{ y: -2 }}
    className={cx(
      'cursor-pointer rounded-xl border p-4 transition-all',
      isSelected
        ? 'border-[#1E4A7A] bg-[#1E4A7A]/20'
        : 'border-white/10 bg-white/5 hover:bg-white/10'
    )}
    onClick={() => onSelect(product)}
  >
    <div className="mb-3 flex items-start justify-between">
      <div>
        <h3 className="font-medium text-white">{product.nombre}</h3>
        <span
          className={cx(
            'mt-1 inline-block rounded-full px-2 py-0.5 text-xs',
            product.activo
              ? 'bg-green-500/20 text-green-300'
              : 'bg-gray-500/20 text-gray-400'
          )}
        >
          {product.activo ? 'Activo' : 'Inactivo'}
        </span>
        <p className="mt-2 text-xs text-white/45">{productSubtitle(product)}</p>
      </div>

      <div className="text-right">
        <p className="text-lg font-bold text-white">{money(product.precio_base)}</p>
        <p className="text-sm text-white/50">Stock: {product.stock_actual}</p>
      </div>
    </div>

    <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onAdjustStock(product, -1)}
        disabled={busy || product.stock_actual <= 0}
        className="flex-1 rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
      >
        <Minus className="mx-auto h-4 w-4" />
      </button>
      <button
        onClick={() => onAdjustStock(product, 1)}
        disabled={busy}
        className="flex-1 rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
      >
        <PlusCircle className="mx-auto h-4 w-4" />
      </button>
      <button
        onClick={() => onEdit(product)}
        disabled={busy}
        className="rounded-lg bg-[#1E4A7A] p-2 text-white transition-colors hover:bg-[#2E6B9E] disabled:opacity-50"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={() => onToggleActivo(product)}
        disabled={busy}
        className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
    </div>
  </motion.div>
);

const ProductDetails = ({
  product,
  onEdit,
  onToggleActivo,
  onAdjustStock,
  onDelete,
  busy,
}: {
  product: ProductUI;
  onEdit: (product: ProductUI) => void;
  onToggleActivo: (product: ProductUI) => void;
  onAdjustStock: (product: ProductUI, delta: number) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-6 shadow-xl"
  >
    <h2 className="mb-4 text-xl font-bold text-white">Detalles del Producto</h2>

    <div className="space-y-4">
      <div className="rounded-xl bg-white/5 p-4">
        <p className="mb-1 text-sm text-white/50">Nombre</p>
        <p className="text-lg font-medium text-white">{product.nombre}</p>
      </div>

      <div className="rounded-xl bg-white/5 p-4">
        <p className="mb-1 text-sm text-white/50">Clasificación</p>
        <p className="text-sm text-white">{productSubtitle(product)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 p-4">
          <p className="mb-1 text-sm text-white/50">Precio Base</p>
          <p className="text-xl font-bold text-[#3D8FCC]">{money(product.precio_base)}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <p className="mb-1 text-sm text-white/50">Stock Actual</p>
          <p className="text-xl font-bold text-white">{product.stock_actual}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white/5 p-4">
        <p className="mb-1 text-sm text-white/50">Estado</p>
        <div className="flex items-center gap-2">
          <span
            className={cx(
              'rounded-full px-3 py-1 text-sm',
              product.activo
                ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                : 'border border-gray-500/30 bg-gray-500/20 text-gray-400'
            )}
          >
            {product.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="mb-3 text-sm text-white/50">Ajuste rápido de stock</p>
        <div className="flex gap-2">
          <button
            onClick={() => onAdjustStock(product, -10)}
            disabled={busy || product.stock_actual < 10}
            className="flex-1 rounded-xl bg-white/10 p-3 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            -10
          </button>
          <button
            onClick={() => onAdjustStock(product, -1)}
            disabled={busy || product.stock_actual <= 0}
            className="flex-1 rounded-xl bg-white/10 p-3 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            -1
          </button>
          <button
            onClick={() => onAdjustStock(product, 1)}
            disabled={busy}
            className="flex-1 rounded-xl bg-white/10 p-3 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            +1
          </button>
          <button
            onClick={() => onAdjustStock(product, 10)}
            disabled={busy}
            className="flex-1 rounded-xl bg-white/10 p-3 text-white/70 transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            +10
          </button>
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          onClick={() => onEdit(product)}
          disabled={busy}
          className="flex-1 rounded-xl bg-[#1E4A7A] p-3 text-white transition-colors hover:bg-[#2E6B9E] disabled:opacity-50"
        >
          Editar
        </button>
        <button
          onClick={() => onToggleActivo(product)}
          disabled={busy}
          className="flex-1 rounded-xl bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {product.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button
          onClick={() => onDelete(product.id)}
          disabled={busy}
          className="rounded-xl bg-[#4A1F2F] p-3 text-white transition-colors hover:bg-[#6D2F45] disabled:opacity-50"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  </motion.div>
);

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
    <Package className="mx-auto mb-3 h-12 w-12 text-white/20" />
    <h3 className="mb-2 text-lg font-medium text-white">Selecciona un producto</h3>
    <p className="mb-4 text-sm text-white/50">
      Haz clic en cualquier producto para ver sus detalles y opciones de gestión
    </p>
    <button
      onClick={onCreate}
      className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-4 py-2 text-white transition-colors hover:bg-[#2E6B9E]"
    >
      <Plus className="h-4 w-4" />
      Crear nuevo producto
    </button>
  </div>
);

const ProductModal = ({
  mode,
  form,
  setForm,
  onClose,
  onSave,
  formOk,
  busy,
}: {
  mode: 'create' | 'edit';
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onClose: () => void;
  onSave: () => void;
  formOk: boolean;
  busy: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.9, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.9, y: 20 }}
      className="w-full max-w-md rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-6 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          {mode === 'create' ? 'Nuevo Producto' : 'Editar Producto'}
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-white/70">Nombre del producto</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
            placeholder="Ej: Hielo bolsa 5kg"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm text-white/70">Tipo</label>
            <select
              value={form.kind}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  kind: e.target.value === 'barra' ? 'barra' : 'bolsa',
                }))
              }
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none"
            >
              <option value="bolsa">Bolsa</option>
              <option value="barra">Barra</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Ice type</label>
            <input
              type="text"
              value={form.ice_type}
              onChange={(e) => setForm((prev) => ({ ...prev, ice_type: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none"
              placeholder="normal / gourmet"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/70">Kg por unidad</label>
          <input
            type="number"
            value={form.kg_por_unidad}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, kg_por_unidad: e.target.value }))
            }
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none"
            min="0.1"
            step="0.1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm text-white/70">Precio (MXN)</label>
            <input
              type="number"
              value={form.precio}
              onChange={(e) => setForm((prev) => ({ ...prev, precio: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Stock inicial</label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              placeholder="0"
              min="0"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
          <div>
            <p className="text-sm font-medium text-white">Estado del producto</p>
            <p className="text-xs text-white/50">Inactivo no aparece en pedidos</p>
          </div>

          <button
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                activo: !prev.activo,
              }))
            }
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
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 transition-colors hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={!formOk || busy}
            className={cx(
              'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
              !formOk || busy
                ? 'cursor-not-allowed bg-white/10 text-white/30'
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

const DeleteModal = ({
  onConfirm,
  onClose,
  busy,
  delId,
}: {
  onConfirm: (id: string) => void;
  onClose: () => void;
  busy: boolean;
  delId: string;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.9, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.9, y: 20 }}
      className="w-full max-w-md rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#4A1F2F] p-6 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
        <h2 className="text-xl font-bold text-white">¿Eliminar producto?</h2>
        <p className="mt-2 text-sm text-white/60">
          Esta acción no se puede deshacer. Si el producto está en uso, considera
          desactivarlo.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          disabled={busy}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(delId)}
          disabled={busy}
          className="flex-1 rounded-xl bg-gradient-to-r from-[#4A1F2F] to-[#6D2F45] px-4 py-3 font-medium text-white transition-all hover:from-[#6D2F45] hover:to-[#4A1F2F] disabled:opacity-50"
        >
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
        <div className="mx-auto h-12 w-48 animate-pulse rounded-xl bg-white/10" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}