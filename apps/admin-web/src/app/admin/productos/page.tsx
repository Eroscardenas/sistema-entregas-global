'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Pencil,
  X,
  Package,
  DollarSign,
  AlertTriangle,
  Link2,
  Box,
  Layers,
  CheckCircle2,
  Snowflake,
  Cuboid,
} from 'lucide-react';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  useCommercialInventoryProduct,
  type CommercialInventoryProduct,
} from '@/lib/hooks/useCommercialInventoryProducts';

const sb = supabaseBrowser as any;

type ProductRowUI = CommercialInventoryProduct & {
  localId: string;
};

type ProductGroup = {
  key: string;
  title: string;
  rows: ProductRowUI[];
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtMoney(n?: number | null) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

function buildLocalId(p: CommercialInventoryProduct) {
  return `${String(p.bolsaVaciaCodigo ?? '').trim().toUpperCase()}__${String(
    p.tipoHielo ?? ''
  )
    .trim()
    .toUpperCase()}__${Number(p.pesoKg ?? 0)}`;
}

function isBarraRow(row: ProductRowUI | CommercialInventoryProduct) {
  return String(row.tipoHielo ?? '').trim().toUpperCase() === 'BARRA';
}

function buildDisplayIceType(row: ProductRowUI | CommercialInventoryProduct) {
  return String(row.tipoHielo ?? '').trim().toUpperCase() || '—';
}

function sortRows(rows: ProductRowUI[]) {
  return [...rows].sort((a, b) => {
    const aBarra = isBarraRow(a) ? 0 : 1;
    const bBarra = isBarraRow(b) ? 0 : 1;
    if (aBarra !== bBarra) return aBarra - bBarra;

    const byTipo = buildDisplayIceType(a).localeCompare(buildDisplayIceType(b), 'es-MX');
    if (byTipo !== 0) return byTipo;

    const byPeso = Number(a.pesoKg || 0) - Number(b.pesoKg || 0);
    if (byPeso !== 0) return byPeso;

    return String(a.displayName ?? '').localeCompare(String(b.displayName ?? ''), 'es-MX');
  });
}

function ProductBadge({
  label,
  tone = 'blue',
}: {
  label: string;
  tone?: 'blue' | 'emerald' | 'amber' | 'neutral' | 'violet';
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
      : tone === 'amber'
      ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
      : tone === 'neutral'
      ? 'border-white/10 bg-white/5 text-white/70'
      : tone === 'violet'
      ? 'border-violet-400/25 bg-violet-400/10 text-violet-200'
      : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200';

  return (
    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', cls)}>
      {label}
    </span>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
            className="w-full max-w-xl rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-1 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl bg-[#0F2A40] p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
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

function ProductDetails({
  row,
  onConfigure,
}: {
  row: ProductRowUI | null;
  onConfigure: () => void;
}) {
  if (!row) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
        <Package className="mx-auto mb-3 h-12 w-12 text-white/20" />
        <h3 className="mb-2 text-lg font-medium text-white">Selecciona un producto</h3>
        <p className="text-sm text-white/50">
          Aquí ves bolsas llenas por tipo de hielo y barra, usando el stock real del inventario.
        </p>
      </div>
    );
  }

  const barra = isBarraRow(row);
  const valorFila =
    typeof row.precioBase === 'number' ? Number(row.precioBase) * Number(row.stockActual || 0) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold text-white">{row.nombreComercial ?? row.displayName}</h3>
            <ProductBadge label={barra ? 'Barra' : 'Bolsa llena'} tone={barra ? 'violet' : 'blue'} />
            <ProductBadge label={buildDisplayIceType(row)} tone="neutral" />
            <ProductBadge label={row.configured ? 'Configurado' : 'Pendiente'} tone={row.configured ? 'emerald' : 'amber'} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/60">
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-4 w-4" />
              BV: {row.bolsaVaciaCodigo || '—'}
            </span>
            <span>Tipo de hielo real: {buildDisplayIceType(row)}</span>
            {!barra ? <span>Kg: {row.pesoKg}</span> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-4 py-2 text-sm text-white hover:bg-[#2E6B9E]"
        >
          <DollarSign className="h-4 w-4" />
          Configurar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm text-white/50">Nombre comercial</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {row.nombreComercial ?? 'No configurado'}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm text-white/50">Precio base</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {row.precioBase === null ? 'No configurado' : fmtMoney(row.precioBase)}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm text-white/50">Stock actual</div>
          <div className="mt-1 text-lg font-semibold text-white">{row.stockActual}</div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm text-white/50">Valor inventario</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {valorFila === null ? '—' : fmtMoney(valorFila)}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm text-white/50">Estado comercial</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {row.activoComercial ? 'Activo' : 'Inactivo'}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm text-white/50">Clase</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {barra ? 'Barra' : 'Bolsa llena'}
          </div>
        </div>
      </div>

    </div>
  );
}

function GroupHeader({
  title,
  count,
  barra = false,
}: {
  title: string;
  count: number;
  barra?: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-white/10 bg-[#0A1A2F]/85 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        {barra ? <Cuboid className="h-4 w-4 text-violet-200" /> : <Snowflake className="h-4 w-4 text-cyan-200" />}
        <div className="text-sm font-semibold text-white">{title}</div>
      </div>
      <ProductBadge label={`${count} producto${count === 1 ? '' : 's'}`} tone="neutral" />
    </div>
  );
}

export default function AdminProductosPage() {
  const router = useRouter();
  const guard = useAdminGuard();

  const {
    products: bridgeProducts,
    loading: bridgeLoading,
    error: bridgeError,
  } = useCommercialInventoryProduct();

  const [rows, setRows] = useState<ProductRowUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [openModal, setOpenModal] = useState(false);
  const [editingRow, setEditingRow] = useState<ProductRowUI | null>(null);

  const [mNombre, setMNombre] = useState('');
  const [mPrecio, setMPrecio] = useState('');
  const [mActivo, setMActivo] = useState(true);

  useEffect(() => {
    if (guard.loading) return;
    if (!guard.isAuthed) return;
    if (bridgeLoading) return;

    if (bridgeError) {
      setErr(bridgeError);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: ProductRowUI[] = sortRows(
      bridgeProducts.map((x) => ({
        ...x,
        localId: buildLocalId(x),
      }))
    );

    setRows(mapped);
    setLoading(false);

    setSelectedId((prev) => {
      if (!mapped.length) return null;

      const visibleBarra = mapped.find((x) => isBarraRow(x)) ?? null;

      if (!prev) return visibleBarra?.localId ?? mapped[0].localId;
      return mapped.some((x) => x.localId === prev) ? prev : visibleBarra?.localId ?? mapped[0].localId;
    });
  }, [guard.loading, guard.isAuthed, bridgeLoading, bridgeError, bridgeProducts]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      return (
        String(r.displayName ?? '').toLowerCase().includes(s) ||
        String(r.nombreComercial ?? '').toLowerCase().includes(s) ||
        String(r.tipoHielo ?? '').toLowerCase().includes(s) ||
        String(r.bolsaVaciaCodigo ?? '').toLowerCase().includes(s) ||
        String(r.pesoKg ?? '').toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  const grouped = useMemo<ProductGroup[]>(() => {
    const barras = filtered.filter((r) => isBarraRow(r));
    const bolsas = filtered.filter((r) => !isBarraRow(r));

    const byTipo = new Map<string, ProductRowUI[]>();

    for (const row of bolsas) {
      const tipo = buildDisplayIceType(row);
      const list = byTipo.get(tipo) ?? [];
      list.push(row);
      byTipo.set(tipo, list);
    }

    const groups: ProductGroup[] = [];

    if (barras.length) {
      groups.push({
        key: 'BARRA',
        title: 'BARRA',
        rows: sortRows(barras),
      });
    }

    Array.from(byTipo.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es-MX'))
      .forEach(([tipo, tipoRows]) => {
        groups.push({
          key: tipo,
          title: `Bolsas llenas · ${tipo}`,
          rows: sortRows(tipoRows),
        });
      });

    return groups;
  }, [filtered]);

  const flatVisibleRows = useMemo(() => grouped.flatMap((g) => g.rows), [grouped]);

  const selected = useMemo(
    () => flatVisibleRows.find((x) => x.localId === selectedId) ?? flatVisibleRows[0] ?? null,
    [flatVisibleRows, selectedId]
  );

  const stats = useMemo(() => {
    const barras = rows.filter((r) => isBarraRow(r)).length;
    const bolsas = rows.filter((r) => !isBarraRow(r)).length;
    const tipos = new Set(rows.filter((r) => !isBarraRow(r)).map((r) => buildDisplayIceType(r))).size;

    const valorInventario = rows.reduce((acc, r) => {
      const precio = typeof r.precioBase === 'number' ? r.precioBase : 0;
      return acc + precio * Number(r.stockActual || 0);
    }, 0);

    return {
      total: rows.length,
      bolsas,
      barras,
      tipos,
      configurados: rows.filter((r) => r.configured).length,
      activos: rows.filter((r) => r.activoComercial).length,
      valorInventario,
    };
  }, [rows]);

  function openConfigure(row: ProductRowUI) {
    setEditingRow(row);
    setMNombre(row.nombreComercial ?? row.displayName);
    setMPrecio(row.precioBase === null ? '' : String(row.precioBase));
    setMActivo(row.configured ? row.activoComercial : true);
    setOpenModal(true);
  }

  async function saveCommercial() {
    if (!editingRow) return;

    const nombre = mNombre.trim();
    const precio = safeNum(mPrecio, NaN);

    if (!nombre) {
      setErr('El nombre comercial es requerido.');
      return;
    }

    if (!Number.isFinite(precio) || precio < 0) {
      setErr('El precio base debe ser válido.');
      return;
    }

    setBusy(true);
    setErr('');

    try {
      const payload = {
        firebase_bolsa_vacia_codigo: editingRow.bolsaVaciaCodigo,
        firebase_tipo_hielo: editingRow.tipoHielo,
        peso_kg: editingRow.pesoKg,
        nombre_comercial: nombre,
        precio_base: precio,
        activo: mActivo,
      };

      const { error } = await sb.from('inventory_product_settings').upsert(payload, {
        onConflict: 'firebase_bolsa_vacia_codigo,firebase_tipo_hielo,peso_kg',
      });

      if (error) throw error;

      setRows((prev) =>
        prev.map((r) =>
          r.localId === editingRow.localId
            ? {
                ...r,
                nombreComercial: nombre,
                precioBase: precio,
                activoComercial: mActivo,
                configured: true,
              }
            : r
        )
      );

      setOpenModal(false);
      setEditingRow(null);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo guardar la configuración comercial');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] p-3 shadow-lg">
                <Box className="h-8 w-8 text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white">Gestión de Productos Global Ice</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
              >
                Dashboard
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:from-[#2E6B9E] hover:to-[#1E4A7A]"
              >
                <RefreshCw className="h-4 w-4" />
                Sincronizar productos
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mb-6 grid gap-4 md:grid-cols-6">
          <div className="rounded-xl bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-sm text-white/50">Valor inventario</div>
            <div className="mt-1 text-xl font-bold text-white">{fmtMoney(stats.valorInventario)}</div>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, BV, tipo de hielo o kg..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
            />
          </div>
        </div>

        <AnimatePresence>
          {err ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/20 p-4"
            >
              <div className="flex items-center gap-3 text-red-100">
                <AlertTriangle className="h-5 w-5" />
                <span>{err}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="grid gap-6 lg:grid-cols-[460px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            {loading ? (
              <div className="p-8 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#1E4A7A] border-r-transparent" />
                <p className="mt-3 text-white/60">Cargando productos...</p>
              </div>
            ) : grouped.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="mx-auto mb-3 h-12 w-12 text-white/20" />
                <p className="text-white/50">No hay bolsas llenas disponibles en inventario</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 rounded-xl bg-[#1E4A7A] px-4 py-2 text-white transition-colors hover:bg-[#2E6B9E]"
                >
                  Actualizar
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <GroupHeader title={group.title} count={group.rows.length} barra={group.key === 'BARRA'} />

                    {group.rows.map((row) => {
                      const barra = isBarraRow(row);
                      const valorFila =
                        typeof row.precioBase === 'number'
                          ? Number(row.precioBase) * Number(row.stockActual || 0)
                          : null;

                      return (
                        <div
                          key={row.localId}
                          className={cx(
                            'rounded-2xl border p-4 transition-all',
                            selectedId === row.localId
                              ? 'border-cyan-400/30 bg-cyan-400/10 shadow-lg'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          )}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedId(row.localId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedId(row.localId);
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="truncate text-base font-semibold text-white">
                                    {row.nombreComercial ?? row.displayName}
                                  </div>
                                  <ProductBadge
                                    label={barra ? 'Barra' : 'Bolsa llena'}
                                    tone={barra ? 'violet' : 'blue'}
                                  />
                                  <ProductBadge label={buildDisplayIceType(row)} tone="neutral" />
                                  <ProductBadge
                                    label={row.configured ? 'Configurado' : 'Pendiente'}
                                    tone={row.configured ? 'emerald' : 'amber'}
                                  />
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/55">
                                  <span className="inline-flex items-center gap-1">
                                    <Link2 className="h-3.5 w-3.5" />
                                    {row.bolsaVaciaCodigo || '—'}
                                  </span>
                                  {!barra ? <span>{row.pesoKg} KG</span> : null}
                                  <span>{buildDisplayIceType(row)}</span>
                                </div>
                              </div>

                              <div className="rounded-xl bg-white/10 p-2 text-white/80">
                                <Layers className="h-5 w-5" />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <div className="rounded-xl bg-white/5 p-3">
                                <div className="text-xs text-white/45">Stock</div>
                                <div className="mt-1 text-lg font-bold text-white">{row.stockActual}</div>
                              </div>

                              <div className="rounded-xl bg-white/5 p-3">
                                <div className="text-xs text-white/45">Precio base</div>
                                <div className="mt-1 text-sm font-semibold text-white">
                                  {row.precioBase === null ? 'Sin configurar' : fmtMoney(row.precioBase)}
                                </div>
                              </div>

                              <div className="rounded-xl bg-white/5 p-3">
                                <div className="text-xs text-white/45">Valor</div>
                                <div className="mt-1 text-sm font-semibold text-white">
                                  {valorFila === null ? '—' : fmtMoney(valorFila)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => openConfigure(row)}
                              className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-3 py-2 text-sm text-white hover:bg-[#2E6B9E]"
                            >
                              <Pencil className="h-4 w-4" />
                              Configurar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ProductDetails
            row={selected}
            onConfigure={() => {
              if (selected) openConfigure(selected);
            }}
          />
        </div>
      </div>

      <Modal
        open={openModal}
        title="Configurar producto comercial"
        onClose={() => {
          if (busy) return;
          setOpenModal(false);
          setEditingRow(null);
        }}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            <div className="font-medium">{editingRow?.displayName ?? 'Producto'}</div>
            <div className="mt-1 text-cyan-200/80">
              Stock actual en inventario: {editingRow?.stockActual ?? 0}
            </div>
            <div className="mt-1 text-cyan-200/80">
              Tipo de hielo real: {editingRow ? buildDisplayIceType(editingRow) : '—'}
            </div>
            <div className="mt-1 text-cyan-200/80">
              Clave real: {editingRow?.bolsaVaciaCodigo ?? '—'} · {editingRow ? buildDisplayIceType(editingRow) : '—'} · {editingRow?.pesoKg ?? 0} KG
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Nombre comercial</label>
            <input
              value={mNombre}
              onChange={(e) => setMNombre(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              placeholder="Ej: FRAPPE 15 KG / BARRA 20 KG"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Precio base</label>
            <input
              value={mPrecio}
              onChange={(e) => setMPrecio(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Tipo de hielo real</label>
            <input
              value={editingRow ? buildDisplayIceType(editingRow) : ''}
              disabled
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70"
            />
            <p className="mt-2 text-xs text-white/45">
              Este valor viene del inventario realtime y no se cambia aquí. Así se evita mezclar barra con otros tipos.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
            <div>
              <div className="text-sm font-medium text-white">Activo comercial</div>
              <div className="text-xs text-white/50">
                Controla si se podrá usar en precios y entregas.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMActivo((v) => !v)}
              className={cx(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                mActivo
                  ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              )}
            >
              {mActivo ? 'Activo' : 'Inactivo'}
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setOpenModal(false);
                setEditingRow(null);
              }}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={saveCommercial}
              disabled={busy}
              className={cx(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-all',
                busy
                  ? 'cursor-not-allowed bg-white/10 text-white/35'
                  : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              {busy ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}