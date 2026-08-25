'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock3,
  Phone,
  CalendarDays,
  ClipboardList,
  AlertCircle,
  Filter,
  MessageSquare,
  TimerReset,
  Package,
  ShoppingCart,
  Database,
  ChevronRight,
  ShieldCheck,
  ListOrdered,
  UserRound,
  FileText,
  BadgeCheck,
  Boxes,
  Trash2,
  Eye,
  X,
} from 'lucide-react';

import { useRouter } from 'next/navigation';
import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type OrderStatus =
  | 'NUEVO'
  | 'EN_PROCESO'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'ATENDIDO';

type PublicOrderRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  fecha_requerida: string | null;
  notes: string | null;
  status: string | null;
  reviewed_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PublicOrderItemRow = {
  id: string;
  request_id: string;
  product_id?: string | null;
  product_name: string;
  qty: number;
  created_at: string | null;
};

type OrderWithItems = PublicOrderRow & {
  items: PublicOrderItemRow[];
};

const STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    chip: string;
    button: string;
    icon: React.ReactNode;
  }
> = {
  NUEVO: {
    label: 'Nuevo',
    chip: 'bg-amber-500/15 text-amber-100 border-amber-400/25',
    button:
      'bg-amber-500/15 text-amber-100 border-amber-400/25 hover:bg-amber-500/25',
    icon: <Clock3 className="h-4 w-4" />,
  },
  EN_PROCESO: {
    label: 'En proceso',
    chip: 'bg-sky-500/15 text-sky-100 border-sky-400/25',
    button:
      'bg-sky-500/15 text-sky-100 border-sky-400/25 hover:bg-sky-500/25',
    icon: <TimerReset className="h-4 w-4" />,
  },
  APROBADO: {
    label: 'Aprobado',
    chip: 'bg-emerald-500/15 text-emerald-100 border-emerald-400/25',
    button:
      'bg-emerald-500/15 text-emerald-100 border-emerald-400/25 hover:bg-emerald-500/25',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  RECHAZADO: {
    label: 'Rechazado',
    chip: 'bg-red-500/15 text-red-100 border-red-400/25',
    button: 'bg-red-500/15 text-red-100 border-red-400/25 hover:bg-red-500/25',
    icon: <XCircle className="h-4 w-4" />,
  },
  ATENDIDO: {
    label: 'Atendido',
    chip: 'bg-violet-500/15 text-violet-100 border-violet-400/25',
    button:
      'bg-violet-500/15 text-violet-100 border-violet-400/25 hover:bg-violet-500/25',
    icon: <BadgeCheck className="h-4 w-4" />,
  },
};

const STATUS_OPTIONS: Array<'all' | OrderStatus> = [
  'all',
  'NUEVO',
  'EN_PROCESO',
  'APROBADO',
  'RECHAZADO',
  'ATENDIDO',
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function formatOnlyDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
  }).format(d);
}

function statusOrDefault(value?: string | null): OrderStatus {
  if (
    value === 'NUEVO' ||
    value === 'EN_PROCESO' ||
    value === 'APROBADO' ||
    value === 'RECHAZADO' ||
    value === 'ATENDIDO'
  ) {
    return value;
  }
  return 'NUEVO';
}

function canDeleteStatus(status?: string | null) {
  return status === 'RECHAZADO' || status === 'ATENDIDO';
}

function getErrorMessage(err: any, fallback: string) {
  return (
    err?.message ||
    err?.details ||
    err?.hint ||
    err?.error_description ||
    fallback
  );
}

function isMissingTableError(err: any) {
  const msg = String(err?.message ?? '').toLowerCase();
  const details = String(err?.details ?? '').toLowerCase();
  const hint = String(err?.hint ?? '').toLowerCase();

  return (
    msg.includes("could not find the table 'public.public_order_requests'") ||
    msg.includes("could not find the table 'public.public_order_request_items'") ||
    msg.includes("relation 'public.public_order_requests' does not exist") ||
    msg.includes("relation 'public.public_order_request_items' does not exist") ||
    msg.includes('schema cache') ||
    details.includes('schema cache') ||
    hint.includes('schema cache')
  );
}

function initials(name?: string | null) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'PD'
  );
}

function buildPublicStatusPatch(nextStatus: OrderStatus) {
  const now = new Date().toISOString();

  if (nextStatus === 'NUEVO') {
    return {
      status: nextStatus,
      reviewed_at: null,
      resolved_at: null,
    };
  }

  if (nextStatus === 'EN_PROCESO') {
    return {
      status: nextStatus,
      reviewed_at: now,
      resolved_at: null,
    };
  }

  return {
    status: nextStatus,
    reviewed_at: now,
    resolved_at: now,
  };
}

export default function PedidosPage() {
  const router = useRouter();
  const { loading: guardLoading, adminUser, isAuthed } = useAdminGuard();

  const isAdmin = Boolean(isAuthed && adminUser && adminUser.role === 'admin');

  const [rows, setRows] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const [selected, setSelected] = useState<OrderWithItems | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OrderWithItems | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sb = supabaseBrowser as any;

  const fetchOrders = useCallback(async () => {
    const { data: orders, error: ordersError } = await sb
      .from('public_order_requests')
      .select(
        'id, nombre, telefono, fecha_requerida, notes, status, reviewed_at, resolved_at, created_at, updated_at'
      )
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    const { data: items, error: itemsError } = await sb
      .from('public_order_request_items')
      .select('id, request_id, product_id, product_name, qty, created_at')
      .order('created_at', { ascending: true });

    if (itemsError) throw itemsError;

    const itemsByRequest = new Map<string, PublicOrderItemRow[]>();

    (items ?? []).forEach((item: PublicOrderItemRow) => {
      if (!itemsByRequest.has(item.request_id)) {
        itemsByRequest.set(item.request_id, []);
      }
      itemsByRequest.get(item.request_id)!.push(item);
    });

    const merged: OrderWithItems[] = (orders ?? []).map((order: PublicOrderRow) => ({
      ...order,
      items: itemsByRequest.get(order.id) ?? [],
    }));

    return merged;
  }, [sb]);

  const syncSelection = useCallback((data: OrderWithItems[]) => {
    setSelected((prev) => {
      if (prev) {
        const keep = data.find((r) => r.id === prev.id);
        if (keep) {
          setNotesDraft(keep.notes ?? '');
          return keep;
        }
      }
      const first = data[0] ?? null;
      setNotesDraft(first?.notes ?? '');
      return first;
    });
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setPageError(null);
      setTableMissing(false);

      const data = await fetchOrders();
      setRows(data);
      syncSelection(data);
    } catch (err: any) {
      if (isMissingTableError(err)) {
        setTableMissing(true);
        setPageError(
          'La tabla de pedidos públicos todavía no existe en esta base o el schema cache de Supabase aún no se refresca.'
        );
      } else {
        setPageError(getErrorMessage(err, 'No se pudieron cargar los pedidos.'));
      }

      setRows([]);
      setSelected(null);
      setNotesDraft('');
    } finally {
      setLoading(false);
    }
  }, [fetchOrders, syncSelection]);

  const refreshOrders = useCallback(async () => {
    try {
      setRefreshing(true);
      setPageError(null);
      setTableMissing(false);

      const data = await fetchOrders();
      setRows(data);
      syncSelection(data);
    } catch (err: any) {
      if (isMissingTableError(err)) {
        setTableMissing(true);
        setPageError(
          'La tabla de pedidos públicos todavía no existe en esta base o el schema cache de Supabase aún no se refresca.'
        );
      } else {
        setPageError(
          getErrorMessage(err, 'No se pudieron actualizar los pedidos.')
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, syncSelection]);

  useEffect(() => {
    if (!guardLoading && !isAdmin) {
      router.replace(PATHS.admin.dashboard);
      return;
    }

    if (!guardLoading && isAdmin) {
      void loadOrders();
    }
  }, [guardLoading, isAdmin, loadOrders, router]);

  useEffect(() => {
    if (!isAdmin || tableMissing) return;

    const channelOrders = sb
      .channel('public_order_requests_realtime_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'public_order_requests' },
        () => void refreshOrders()
      )
      .subscribe();

    const channelItems = sb
      .channel('public_order_request_items_realtime_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'public_order_request_items' },
        () => void refreshOrders()
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channelOrders);
      void sb.removeChannel(channelItems);
    };
  }, [isAdmin, refreshOrders, sb, tableMissing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      const rowStatus = statusOrDefault(row.status);
      const matchesStatus =
        statusFilter === 'all' ? true : rowStatus === statusFilter;

      if (!matchesStatus) return false;
      if (!q) return true;

      const haystack = [
        row.nombre ?? '',
        row.telefono ?? '',
        row.fecha_requerida ?? '',
        row.notes ?? '',
        row.status ?? '',
        ...row.items.map((i) => i.product_name ?? ''),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, query, statusFilter]);

  const stats = useMemo(() => {
    const nuevo = rows.filter((r) => statusOrDefault(r.status) === 'NUEVO').length;
    const enProceso = rows.filter(
      (r) => statusOrDefault(r.status) === 'EN_PROCESO'
    ).length;
    const aprobado = rows.filter(
      (r) => statusOrDefault(r.status) === 'APROBADO'
    ).length;
    const rechazado = rows.filter(
      (r) => statusOrDefault(r.status) === 'RECHAZADO'
    ).length;
    const atendido = rows.filter(
      (r) => statusOrDefault(r.status) === 'ATENDIDO'
    ).length;

    return {
      total: rows.length,
      nuevo,
      enProceso,
      aprobado,
      rechazado,
      atendido,
    };
  }, [rows]);

  const selectedStatus = statusOrDefault(selected?.status);

  const totalItems = useMemo(
    () => rows.reduce((acc, row) => acc + row.items.length, 0),
    [rows]
  );

  const totalPieces = useMemo(
    () =>
      rows.reduce(
        (acc, row) => acc + row.items.reduce((a, i) => a + Number(i.qty || 0), 0),
        0
      ),
    [rows]
  );

  const selectedPieces = useMemo(
    () => selected?.items.reduce((acc, item) => acc + Number(item.qty || 0), 0) ?? 0,
    [selected]
  );

  const updateSelectedLocally = useCallback((patch: Partial<OrderWithItems>) => {
    setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const saveStatus = useCallback(
    async (row: OrderWithItems, nextStatus: OrderStatus) => {
      try {
        setSavingId(row.id);

        const patch = buildPublicStatusPatch(nextStatus);

        const { error } = await sb
          .from('public_order_requests')
          .update(patch)
          .eq('id', row.id);

        if (error) throw error;

        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  ...patch,
                }
              : r
          )
        );

        if (selected?.id === row.id) {
          updateSelectedLocally(patch);
        }
      } catch (err: any) {
        alert(getErrorMessage(err, 'No se pudo actualizar el estatus del pedido.'));
      } finally {
        setSavingId(null);
      }
    },
    [sb, selected?.id, updateSelectedLocally]
  );

  const saveNotes = useCallback(async () => {
    if (!selected) return;

    try {
      setSavingId(selected.id);

      const cleanedNotes = notesDraft.trim();
      const notesValue = cleanedNotes.length === 0 ? null : cleanedNotes;

      const { error } = await sb
        .from('public_order_requests')
        .update({ notes: notesValue })
        .eq('id', selected.id);

      if (error) throw error;

      setRows((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? {
                ...r,
                notes: notesValue,
              }
            : r
        )
      );

      updateSelectedLocally({ notes: notesValue });
    } catch (err: any) {
      alert(getErrorMessage(err, 'No se pudieron guardar las notas.'));
    } finally {
      setSavingId(null);
    }
  }, [sb, notesDraft, selected, updateSelectedLocally]);

  const askDelete = useCallback((row: OrderWithItems) => {
    if (!canDeleteStatus(row.status)) {
      alert('Solo se pueden eliminar pedidos en estado RECHAZADO o ATENDIDO.');
      return;
    }
    setDeleteTarget(row);
  }, []);

  const runDelete = useCallback(async () => {
    if (!deleteTarget) return;
    if (!canDeleteStatus(deleteTarget.status)) {
      setDeleteTarget(null);
      return;
    }

    try {
      setDeletingId(deleteTarget.id);

      const { error } = await sb
        .from('public_order_requests')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) {
        const { error: itemsErr } = await sb
          .from('public_order_request_items')
          .delete()
          .eq('request_id', deleteTarget.id);

        if (itemsErr) throw itemsErr;

        const { error: requestErr } = await sb
          .from('public_order_requests')
          .delete()
          .eq('id', deleteTarget.id);

        if (requestErr) throw requestErr;
      }

      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));

      setSelected((prev) => {
        if (!prev || prev.id !== deleteTarget.id) return prev;
        return null;
      });

      setNotesDraft((prev) => {
        if (selected?.id === deleteTarget.id) return '';
        return prev;
      });

      setDeleteTarget(null);

      await refreshOrders();
    } catch (err: any) {
      alert(getErrorMessage(err, 'No se pudo eliminar el pedido.'));
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, refreshOrders, sb, selected?.id]);

  if (guardLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
        <Skeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 p-3 shadow-lg">
                <ShoppingCart className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Pedidos</h1>
                <p className="text-sm text-white/55">
                  Revisión operativa de pedidos públicos enviados por clientes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
              >
                Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => void refreshOrders()}
                disabled={refreshing}
                className="rounded-xl bg-white/10 p-3 text-white/80 hover:bg-white/20 disabled:opacity-50"
                title="Refrescar"
              >
                <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {pageError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cx(
                'mb-6 rounded-xl border p-4',
                tableMissing
                  ? 'border-rose-500/30 bg-rose-500/20'
                  : 'border-red-500/30 bg-red-500/20'
              )}
            >
              <div className="flex items-center gap-3 text-rose-100">
                {tableMissing ? (
                  <Database className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">
                    {tableMissing
                      ? 'Falta la tabla de pedidos públicos'
                      : 'No se pudieron cargar los pedidos'}
                  </p>
                  <p className="text-sm text-rose-100/85">{pageError}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <TopStat label="Total" value={stats.total} icon={<ClipboardList className="h-4 w-4" />} />
          <TopStat label="Nuevos" value={stats.nuevo} icon={<Clock3 className="h-4 w-4" />} />
          <TopStat label="En proceso" value={stats.enProceso} icon={<TimerReset className="h-4 w-4" />} />
          <TopStat label="Aprobados" value={stats.aprobado} icon={<CheckCircle2 className="h-4 w-4" />} />
          <TopStat label="Rechazados" value={stats.rechazado} icon={<XCircle className="h-4 w-4" />} />
          <TopStat label="Atendidos" value={stats.atendido} icon={<BadgeCheck className="h-4 w-4" />} />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MiniMetric label="Renglones de productos" value={totalItems} icon={<Package className="h-4 w-4" />} />
          <MiniMetric label="Piezas solicitadas" value={totalPieces} icon={<Boxes className="h-4 w-4" />} />
          <MiniMetric label="Pedidos filtrados" value={filtered.length} icon={<Filter className="h-4 w-4" />} />
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, fecha, producto o notas..."
                  disabled={tableMissing}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="relative min-w-[240px]">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
                  disabled={tableMissing}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} className="bg-[#0A1A2F] text-white">
                      {s === 'all' ? 'Todos los estatus' : STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-sm text-white/55">
              Mostrando <span className="font-bold text-white">{filtered.length}</span> de{' '}
              <span className="font-bold text-white">{rows.length}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
              <div className="border-b border-white/10 p-4">
                <p className="flex items-center gap-2 font-semibold text-white">
                  <ShoppingCart className="h-4 w-4" />
                  Pedidos registrados
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Selecciona un pedido para revisar su detalle.
                </p>
              </div>

              <div className="max-h-[72vh] divide-y divide-white/10 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center text-white/50">Cargando...</div>
                ) : tableMissing ? (
                  <div className="p-6">
                    <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-rose-100">
                      <div className="flex items-start gap-3">
                        <Database className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-medium">La tabla aún no está disponible</p>
                          <p className="mt-1 text-sm text-rose-100/80">
                            Crea <b>public_order_requests</b> y <b>public_order_request_items</b>,
                            o refresca el schema cache de Supabase.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    No hay pedidos para mostrar
                  </div>
                ) : (
                  filtered.map((row) => {
                    const meta = STATUS_META[statusOrDefault(row.status)];
                    const active = selected?.id === row.id;
                    const pieces = row.items.reduce(
                      (acc, item) => acc + Number(item.qty || 0),
                      0
                    );
                    const canDelete = canDeleteStatus(row.status);

                    return (
                      <div
                        key={row.id}
                        className={cx(
                          'transition hover:bg-white/5',
                          active && 'bg-white/10'
                        )}
                      >
                        <button
                          onClick={() => {
                            setSelected(row);
                            setNotesDraft(row.notes ?? '');
                          }}
                          className="w-full p-4 text-left"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-white">
                              {initials(row.nombre)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-white">
                                    {row.nombre || 'Sin nombre'}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-white/50">
                                    {row.telefono || 'Sin teléfono'}
                                  </p>
                                </div>

                                <span
                                  className={cx(
                                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px]',
                                    meta.chip
                                  )}
                                >
                                  {meta.icon}
                                  {meta.label}
                                </span>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                                  <CalendarDays className="h-3 w-3" />
                                  {formatOnlyDate(row.fecha_requerida)}
                                </span>

                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                                  <Package className="h-3 w-3" />
                                  {row.items.length} productos
                                </span>

                                <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-100">
                                  {pieces} piezas
                                </span>
                              </div>

                              {row.items.length > 0 && (
                                <div className="mt-2 line-clamp-2 text-xs text-white/45">
                                  {row.items
                                    .slice(0, 3)
                                    .map((i) => `${i.product_name} x${i.qty}`)
                                    .join(' • ')}
                                  {row.items.length > 3 ? ' • ...' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 px-4 pb-4">
                          <button
                            type="button"
                            onClick={() => router.push(PATHS.admin.pedidoDetail(row.id))}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver detalle
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => askDelete(row)}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100 hover:bg-red-500/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <p className="font-semibold text-white">Resumen operativo</p>
                  <p className="text-xs text-white/50">
                    {selected ? (
                      <>
                        {selected.nombre || 'Pedido sin nombre'} •{' '}
                        {STATUS_META[selectedStatus].label}
                      </>
                    ) : (
                      'Selecciona un pedido'
                    )}
                  </p>
                </div>

                <button
                  onClick={() => void refreshOrders()}
                  className="rounded-xl bg-white/10 p-2 text-white/80 hover:bg-white/20"
                  title="Refrescar"
                >
                  <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
                </button>
              </div>

              {!selected ? (
                <div className="p-10 text-center text-white/60">
                  {tableMissing
                    ? 'Primero crea las tablas de pedidos públicos o refresca el schema cache.'
                    : 'Selecciona un pedido de la izquierda.'}
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <SideKpi title="Cliente" value={selected.nombre || '—'} icon={<UserRound className="h-4 w-4" />} />
                    <SideKpi title="Estatus" value={STATUS_META[selectedStatus].label} icon={<BadgeCheck className="h-4 w-4" />} />
                    <SideKpi title="Fecha requerida" value={formatOnlyDate(selected.fecha_requerida)} icon={<CalendarDays className="h-4 w-4" />} />
                    <SideKpi title="Piezas" value={selectedPieces} icon={<Boxes className="h-4 w-4" />} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="space-y-4 xl:col-span-2">
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="font-medium text-white">Detalle del pedido</p>
                          <p className="text-xs text-white/50">
                            Información capturada por el cliente
                          </p>
                        </div>

                        <div className="space-y-4 p-4">
                          <InfoRow icon={<ShoppingCart className="h-4 w-4" />} label="Cliente" value={selected.nombre || '—'} />
                          <InfoRow icon={<Phone className="h-4 w-4" />} label="Teléfono" value={selected.telefono || '—'} />
                          <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Fecha requerida" value={formatOnlyDate(selected.fecha_requerida)} />
                          <InfoRow icon={<Clock3 className="h-4 w-4" />} label="Capturado" value={formatDate(selected.created_at)} />
                          <InfoRow icon={<RefreshCw className="h-4 w-4" />} label="Última actualización" value={formatDate(selected.updated_at)} />
                          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Revisado" value={formatDate(selected.reviewed_at)} />
                          <InfoRow icon={<CheckCircle2 className="h-4 w-4" />} label="Resuelto" value={formatDate(selected.resolved_at)} />
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="flex items-center gap-2 font-medium text-white">
                            <Package className="h-4 w-4" />
                            Productos solicitados
                          </p>
                          <p className="text-xs text-white/50">
                            Lista de productos y cantidades del pedido
                          </p>
                        </div>

                        <div className="p-4">
                          {selected.items.length > 0 ? (
                            <div className="space-y-3">
                              {selected.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
                                >
                                  <div className="min-w-0">
                                    <p className="break-words text-sm font-medium text-white">
                                      {item.product_name}
                                    </p>
                                    <p className="mt-1 text-xs text-white/45">
                                      Capturado: {formatDate(item.created_at)}
                                    </p>
                                  </div>

                                  <span className="shrink-0 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-sm font-bold text-blue-100">
                                    x{item.qty}
                                  </span>
                                </div>
                              ))}

                              <div className="flex justify-end pt-1">
                                <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-100">
                                  Total piezas: {selectedPieces}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-white/45">
                              No se capturaron productos en este pedido.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="flex items-center gap-2 font-medium text-white">
                            <MessageSquare className="h-4 w-4" />
                            Notas internas
                          </p>
                          <p className="text-xs text-white/50">
                            Observaciones y seguimiento administrativo
                          </p>
                        </div>

                        <div className="p-4">
                          <textarea
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={8}
                            placeholder="Escribe observaciones, seguimiento o comentarios internos..."
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                          />

                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => void saveNotes()}
                              disabled={savingId === selected.id}
                              className={cx(
                                'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-medium transition-all',
                                savingId === selected.id
                                  ? 'cursor-not-allowed bg-white/10 text-white/40'
                                  : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
                              )}
                            >
                              {savingId === selected.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Guardar notas
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 xl:col-span-1">
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="flex items-center gap-2 font-medium text-white">
                            <ShieldCheck className="h-4 w-4" />
                            Cambio de estatus
                          </p>
                          <p className="text-xs text-white/50">
                            Clasifica el pedido según su seguimiento
                          </p>
                        </div>

                        <div className="space-y-2 p-4">
                          {(
                            ['NUEVO', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'ATENDIDO'] as OrderStatus[]
                          ).map((s) => {
                            const meta = STATUS_META[s];
                            const active = selectedStatus === s;

                            return (
                              <button
                                key={s}
                                type="button"
                                disabled={savingId === selected.id}
                                onClick={() => void saveStatus(selected, s)}
                                className={cx(
                                  'flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition',
                                  active
                                    ? meta.button
                                    : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                                )}
                              >
                                {meta.icon}
                                {meta.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="flex items-center gap-2 font-medium text-white">
                            <ListOrdered className="h-4 w-4" />
                            Resumen rápido
                          </p>
                          <p className="text-xs text-white/50">
                            Datos clave del pedido
                          </p>
                        </div>

                        <div className="space-y-3 p-4">
                          <MiniResume label="ID" value={selected.id} icon={<FileText className="h-4 w-4" />} />
                          <MiniResume label="Cliente" value={selected.nombre || '—'} icon={<ShoppingCart className="h-4 w-4" />} />
                          <MiniResume label="Teléfono" value={selected.telefono || '—'} icon={<Phone className="h-4 w-4" />} />
                          <MiniResume label="Fecha requerida" value={formatOnlyDate(selected.fecha_requerida)} icon={<CalendarDays className="h-4 w-4" />} />
                          <MiniResume label="Productos" value={selected.items.length} icon={<Package className="h-4 w-4" />} />
                        </div>
                      </div>

                      <div className="grid gap-2">

                        {canDeleteStatus(selected.status) && (
                          <button
                            type="button"
                            onClick={() => askDelete(selected)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100 hover:bg-red-500/15"
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar pedido
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <DeleteModal
            row={deleteTarget}
            deleting={deletingId === deleteTarget.id}
            onClose={() => {
              if (!deletingId) setDeleteTarget(null);
            }}
            onConfirm={() => void runDelete()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DeleteModal({
  row,
  deleting,
  onClose,
  onConfirm,
}: {
  row: OrderWithItems;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const pieces = row.items.reduce((acc, item) => acc + Number(item.qty || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.96, y: 18 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] p-6 shadow-2xl"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Eliminar pedido</h2>
              <p className="mt-1 text-sm text-white/65">
                Esta acción eliminará el pedido público y sus productos capturados.
              </p>
            </div>

            <button
              onClick={onClose}
              disabled={deleting}
              className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-red-100">
            <p className="font-medium">Solo se permite porque el pedido está en estado final.</p>
            <p className="mt-1 text-sm text-red-100/80">
              Estado actual: <b>{statusOrDefault(row.status)}</b>
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MiniResume
              label="Cliente"
              value={row.nombre || '—'}
              icon={<UserRound className="h-4 w-4" />}
            />
            <MiniResume
              label="Teléfono"
              value={row.telefono || '—'}
              icon={<Phone className="h-4 w-4" />}
            />
            <MiniResume
              label="Fecha requerida"
              value={formatOnlyDate(row.fecha_requerida)}
              icon={<CalendarDays className="h-4 w-4" />}
            />
            <MiniResume
              label="Piezas"
              value={pieces}
              icon={<Boxes className="h-4 w-4" />}
            />
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className={cx(
                'flex-1 rounded-xl px-4 py-3 font-medium text-white transition-all',
                deleting
                  ? 'cursor-not-allowed bg-white/10 text-white/40'
                  : 'bg-gradient-to-r from-[#852838] to-[#A33B4F] hover:from-[#A33B4F] hover:to-[#852838]'
              )}
            >
              {deleting ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function TopStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50">{label}</p>
          <p className="mt-1 text-lg font-bold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-2 text-white/80">{icon}</div>
      </div>
    </div>
  );
}

function SideKpi({
  title,
  value,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-white/50">{title}</p>
          <p className="mt-1 break-words text-sm font-semibold text-white">{value}</p>
        </div>
        <div className="shrink-0 rounded-lg bg-white/10 p-2 text-white/80">{icon}</div>
      </div>
    </div>
  );
}

function MiniResume({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 text-xs text-white/50">
        {icon}
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-white/10 p-2 text-white/80">{icon}</div>
        <div>
          <p className="text-xs text-white/50">{label}</p>
          <p className="mt-1 text-base font-semibold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  multiline,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
        <span className="rounded-lg bg-white/10 p-2 text-white/80">{icon}</span>
        {label}
      </div>
      <div className={cx('text-sm text-white', multiline ? 'break-words leading-6' : 'break-words')}>
        {value}
      </div>
    </div>
  );
}

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