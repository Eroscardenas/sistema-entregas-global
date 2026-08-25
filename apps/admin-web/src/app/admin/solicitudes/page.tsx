'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock3,
  Eye,
  Building2,
  Phone,
  MapPin,
  ClipboardList,
  AlertCircle,
  Filter,
  MessageSquare,
  UtensilsCrossed,
  TimerReset,
  ChevronRight,
  ShieldCheck,
  ListOrdered,
  UserRound,
  FileText,
  BadgeCheck,
  Trash2,
} from 'lucide-react';

import { useRouter } from 'next/navigation';
import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabase } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type RequestStatus = 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO';

type CustomerRequestRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  maps_url: string | null;
  factura_comedor: boolean | null;
  comedor_nombre: string | null;
  notes: string | null;
  status: RequestStatus | null;
  created_at: string | null;
  updated_at: string | null;
};

const REQUEST_STATUS_VALUES: RequestStatus[] = [
  'NUEVO',
  'EN_PROCESO',
  'APROBADO',
  'RECHAZADO',
];

const STATUS_META: Record<
  RequestStatus,
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
    button: 'bg-amber-500/15 text-amber-100 border-amber-400/25 hover:bg-amber-500/25',
    icon: <Clock3 className="h-4 w-4" />,
  },
  EN_PROCESO: {
    label: 'En proceso',
    chip: 'bg-sky-500/15 text-sky-100 border-sky-400/25',
    button: 'bg-sky-500/15 text-sky-100 border-sky-400/25 hover:bg-sky-500/25',
    icon: <TimerReset className="h-4 w-4" />,
  },
  APROBADO: {
    label: 'Aprobado',
    chip: 'bg-emerald-500/15 text-emerald-100 border-emerald-400/25',
    button: 'bg-emerald-500/15 text-emerald-100 border-emerald-400/25 hover:bg-emerald-500/25',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  RECHAZADO: {
    label: 'Rechazado',
    chip: 'bg-red-500/15 text-red-100 border-red-400/25',
    button: 'bg-red-500/15 text-red-100 border-red-400/25 hover:bg-red-500/25',
    icon: <XCircle className="h-4 w-4" />,
  },
};

const STATUS_OPTIONS: Array<'all' | RequestStatus> = [
  'all',
  'NUEVO',
  'EN_PROCESO',
  'APROBADO',
  'RECHAZADO',
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

function isRequestStatus(value?: string | null): value is RequestStatus {
  return (
    value === 'NUEVO' ||
    value === 'EN_PROCESO' ||
    value === 'APROBADO' ||
    value === 'RECHAZADO'
  );
}

function statusOrDefault(value?: string | null): RequestStatus {
  return isRequestStatus(value) ? value : 'NUEVO';
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

function initials(name?: string | null) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'CL'
  );
}

export default function SolicitudesPage() {
  const router = useRouter();
  const { loading: guardLoading, adminUser, isAuthed } = useAdminGuard();

  const isAdmin = Boolean(isAuthed && adminUser && adminUser.role === 'admin');

  const [rows, setRows] = useState<CustomerRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');

  const [selected, setSelected] = useState<CustomerRequestRow | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const sb = supabase as any;

  const syncSelection = useCallback((data: CustomerRequestRow[]) => {
    setSelected((prev) => {
      if (prev) {
        const keep = data.find((r) => r.id === prev.id) ?? null;
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

  const fetchRequests = useCallback(async () => {
    const { data, error } = await sb
      .from('new_customer_requests')
      .select(
        'id, nombre, telefono, maps_url, factura_comedor, comedor_nombre, notes, status, created_at, updated_at',
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalized = ((data ?? []) as Array<Record<string, any>>).map(
      (row): CustomerRequestRow => ({
        id: String(row.id),
        nombre: row.nombre ?? null,
        telefono: row.telefono ?? null,
        maps_url: row.maps_url ?? null,
        factura_comedor: row.factura_comedor ?? null,
        comedor_nombre: row.comedor_nombre ?? null,
        notes: row.notes ?? null,
        status: isRequestStatus(row.status) ? row.status : 'NUEVO',
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      }),
    );

    return normalized;
  }, [sb]);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setPageError(null);

      const data = await fetchRequests();
      setRows(data);
      syncSelection(data);
    } catch (err: any) {
      console.error('Error loading new_customer_requests:', err);
      setPageError(getErrorMessage(err, 'No se pudieron cargar las solicitudes.'));
      setRows([]);
      setSelected(null);
      setNotesDraft('');
    } finally {
      setLoading(false);
    }
  }, [fetchRequests, syncSelection]);

  const refreshRequests = useCallback(async () => {
    try {
      setRefreshing(true);
      setPageError(null);

      const data = await fetchRequests();
      setRows(data);
      syncSelection(data);
    } catch (err: any) {
      console.error('Error refreshing new_customer_requests:', err);
      setPageError(getErrorMessage(err, 'No se pudieron actualizar las solicitudes.'));
    } finally {
      setRefreshing(false);
    }
  }, [fetchRequests, syncSelection]);

  useEffect(() => {
    if (!guardLoading && !isAdmin) {
      router.replace(PATHS.admin.dashboard);
      return;
    }

    if (!guardLoading && isAdmin) {
      void loadRequests();
    }
  }, [guardLoading, isAdmin, loadRequests, router]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = sb
      .channel('new_customer_requests_realtime_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'new_customer_requests' },
        () => {
          void refreshRequests();
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [isAdmin, refreshRequests, sb]);

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
        row.maps_url ?? '',
        row.comedor_nombre ?? '',
        row.notes ?? '',
        row.status ?? '',
        row.factura_comedor ? 'factura comedor' : '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, query, statusFilter]);

  const stats = useMemo(() => {
    const nuevo = rows.filter((r) => statusOrDefault(r.status) === 'NUEVO').length;
    const enProceso = rows.filter((r) => statusOrDefault(r.status) === 'EN_PROCESO').length;
    const aprobado = rows.filter((r) => statusOrDefault(r.status) === 'APROBADO').length;
    const rechazado = rows.filter((r) => statusOrDefault(r.status) === 'RECHAZADO').length;

    return {
      total: rows.length,
      nuevo,
      enProceso,
      aprobado,
      rechazado,
    };
  }, [rows]);

  const selectedStatus = statusOrDefault(selected?.status);
  const canDeleteSelected =
    selectedStatus === 'APROBADO' || selectedStatus === 'RECHAZADO';

  const updateSelectedLocally = useCallback((patch: Partial<CustomerRequestRow>) => {
    setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const saveStatus = useCallback(
    async (row: CustomerRequestRow, nextStatus: RequestStatus) => {
      if (!row?.id) return;
      if (row.status === nextStatus) return;

      try {
        setSavingId(row.id);

        const nextUpdatedAt = new Date().toISOString();

        const { error } = await sb
          .from('new_customer_requests')
          .update({ status: nextStatus })
          .eq('id', row.id);

        if (error) throw error;

        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status: nextStatus,
                  updated_at: nextUpdatedAt,
                }
              : r,
          ),
        );

        if (selected?.id === row.id) {
          updateSelectedLocally({
            status: nextStatus,
            updated_at: nextUpdatedAt,
          });
        }
      } catch (err: any) {
        console.error('Error updating status:', err);
        alert(getErrorMessage(err, 'No se pudo actualizar el estatus.'));
      } finally {
        setSavingId(null);
      }
    },
    [sb, selected?.id, updateSelectedLocally],
  );

  const saveNotes = useCallback(async () => {
    if (!selected?.id) return;

    try {
      setSavingId(selected.id);

      const cleanedNotes = notesDraft.trim();
      const notesValue = cleanedNotes.length === 0 ? null : cleanedNotes;
      const nextUpdatedAt = new Date().toISOString();

      const { error } = await sb
        .from('new_customer_requests')
        .update({ notes: notesValue })
        .eq('id', selected.id);

      if (error) throw error;

      setRows((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? {
                ...r,
                notes: notesValue,
                updated_at: nextUpdatedAt,
              }
            : r,
        ),
      );

      updateSelectedLocally({
        notes: notesValue,
        updated_at: nextUpdatedAt,
      });
    } catch (err: any) {
      console.error('Error updating notes:', err);
      alert(getErrorMessage(err, 'No se pudieron guardar las notas.'));
    } finally {
      setSavingId(null);
    }
  }, [sb, notesDraft, selected, updateSelectedLocally]);

  const deleteRequest = useCallback(async () => {
    if (!selected?.id) return;

    const currentStatus = statusOrDefault(selected.status);

    if (currentStatus !== 'APROBADO' && currentStatus !== 'RECHAZADO') {
      alert('Solo puedes eliminar solicitudes aprobadas o rechazadas.');
      return;
    }

    const ok = window.confirm(
      `¿Seguro que quieres eliminar la solicitud de "${selected.nombre || 'Sin nombre'}"? Esta acción no se puede deshacer.`,
    );

    if (!ok) return;

    try {
      setSavingId(selected.id);

      const selectedId = selected.id;

      const { error } = await sb
        .from('new_customer_requests')
        .delete()
        .eq('id', selectedId);

      if (error) throw error;

      setRows((prev) => {
        const next = prev.filter((r) => r.id !== selectedId);
        const nextSelected = next[0] ?? null;

        setSelected(nextSelected);
        setNotesDraft(nextSelected?.notes ?? '');

        return next;
      });
    } catch (err: any) {
      console.error('Error deleting request:', err);
      alert(getErrorMessage(err, 'No se pudo eliminar la solicitud.'));
    } finally {
      setSavingId(null);
    }
  }, [sb, selected]);

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
                <ClipboardList className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Solicitudes</h1>
                <p className="text-sm text-white/55">
                  Revisión operativa de solicitudes de alta de clientes.
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
                onClick={() => void refreshRequests()}
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
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/20 p-4"
            >
              <div className="flex items-center gap-3 text-red-200">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">No se pudieron cargar las solicitudes</p>
                  <p className="text-sm text-red-100/85">{pageError}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <TopStat label="Total" value={stats.total} icon={<ClipboardList className="h-4 w-4" />} />
          <TopStat label="Nuevas" value={stats.nuevo} icon={<Clock3 className="h-4 w-4" />} />
          <TopStat label="En proceso" value={stats.enProceso} icon={<TimerReset className="h-4 w-4" />} />
          <TopStat label="Aprobadas" value={stats.aprobado} icon={<CheckCircle2 className="h-4 w-4" />} />
          <TopStat label="Rechazadas" value={stats.rechazado} icon={<XCircle className="h-4 w-4" />} />
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, maps, comedor o notas..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                />
              </div>

              <div className="relative min-w-[240px]">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | RequestStatus)}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
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
                  <ClipboardList className="h-4 w-4" />
                  Solicitudes registradas
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Selecciona una solicitud para revisar su detalle.
                </p>
              </div>

              <div className="max-h-[72vh] divide-y divide-white/10 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center text-white/50">Cargando...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    No hay solicitudes para mostrar
                  </div>
                ) : (
                  filtered.map((row) => {
                    const meta = STATUS_META[statusOrDefault(row.status)];
                    const active = selected?.id === row.id;

                    return (
                      <button
                        key={row.id}
                        onClick={() => {
                          setSelected(row);
                          setNotesDraft(row.notes ?? '');
                        }}
                        className={cx(
                          'w-full p-4 text-left transition hover:bg-white/5',
                          active && 'bg-white/10',
                        )}
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
                                  meta.chip,
                                )}
                              >
                                {meta.icon}
                                {meta.label}
                              </span>
                            </div>

                            <div className="mt-2 flex items-start gap-2 text-xs text-white/45">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span className="line-clamp-2 break-all">
                                {row.maps_url || 'Sin ubicación'}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                                {row.factura_comedor
                                  ? row.comedor_nombre || 'Con comedor'
                                  : 'Sin comedor'}
                              </span>

                              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                                {formatDate(row.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
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
                        {selected.nombre || 'Solicitud sin nombre'} •{' '}
                        {STATUS_META[selectedStatus].label}
                      </>
                    ) : (
                      'Selecciona una solicitud'
                    )}
                  </p>
                </div>

                <button
                  onClick={() => void refreshRequests()}
                  className="rounded-xl bg-white/10 p-2 text-white/80 hover:bg-white/20"
                  title="Refrescar"
                >
                  <RefreshCw className={cx('h-4 w-4', refreshing && 'animate-spin')} />
                </button>
              </div>

              {!selected ? (
                <div className="p-10 text-center text-white/60">
                  Selecciona una solicitud de la izquierda.
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <SideKpi
                      title="Cliente"
                      value={selected.nombre || '—'}
                      icon={<UserRound className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Estatus"
                      value={STATUS_META[selectedStatus].label}
                      icon={<BadgeCheck className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Teléfono"
                      value={selected.telefono || '—'}
                      icon={<Phone className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Creada"
                      value={formatDate(selected.created_at)}
                      icon={<Clock3 className="h-4 w-4" />}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="space-y-4 xl:col-span-2">
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="font-medium text-white">Detalle de la solicitud</p>
                          <p className="text-xs text-white/50">
                            Información capturada por el cliente
                          </p>
                        </div>

                        <div className="space-y-4 p-4">
                          <InfoRow
                            icon={<Building2 className="h-4 w-4" />}
                            label="Nombre"
                            value={selected.nombre || '—'}
                          />

                          <InfoRow
                            icon={<Phone className="h-4 w-4" />}
                            label="Teléfono"
                            value={selected.telefono || '—'}
                          />

                          <InfoRow
                            icon={<MapPin className="h-4 w-4" />}
                            label="Maps / ubicación"
                            value={selected.maps_url || '—'}
                            multiline
                          />

                          <InfoRow
                            icon={<UtensilsCrossed className="h-4 w-4" />}
                            label="Factura comedor"
                            value={
                              selected.factura_comedor
                                ? selected.comedor_nombre || 'Sí, sin nombre de comedor'
                                : 'No'
                            }
                          />

                          <InfoRow
                            icon={<RefreshCw className="h-4 w-4" />}
                            label="Última actualización"
                            value={formatDate(selected.updated_at)}
                          />
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
                                  : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]',
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
                            Clasifica la solicitud según su seguimiento
                          </p>
                        </div>

                        <div className="space-y-2 p-4">
                          {REQUEST_STATUS_VALUES.map((s) => {
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
                                    : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10',
                                  savingId === selected.id && 'cursor-not-allowed opacity-60',
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
                            <Trash2 className="h-4 w-4" />
                            Eliminar solicitud
                          </p>
                          <p className="text-xs text-white/50">
                            Solo disponible cuando la solicitud esté aprobada o rechazada
                          </p>
                        </div>

                        <div className="p-4">
                          <button
                            type="button"
                            onClick={() => void deleteRequest()}
                            disabled={!canDeleteSelected || savingId === selected.id}
                            className={cx(
                              'flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition',
                              canDeleteSelected && savingId !== selected.id
                                ? 'border-red-400/25 bg-red-500/15 text-red-100 hover:bg-red-500/25'
                                : 'cursor-not-allowed border-white/10 bg-white/5 text-white/35',
                            )}
                          >
                            {savingId === selected.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Eliminar solicitud
                          </button>

                          {!canDeleteSelected && (
                            <p className="mt-3 text-xs text-white/45">
                              Primero cambia el estatus a <span className="text-white">Aprobado</span> o{' '}
                              <span className="text-white">Rechazado</span>.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                        <div className="border-b border-white/10 px-4 py-3">
                          <p className="flex items-center gap-2 font-medium text-white">
                            <ListOrdered className="h-4 w-4" />
                            Resumen rápido
                          </p>
                          <p className="text-xs text-white/50">
                            Datos clave del registro
                          </p>
                        </div>

                        <div className="space-y-3 p-4">
                          <MiniResume
                            label="ID"
                            value={selected.id}
                            icon={<FileText className="h-4 w-4" />}
                          />
                          <MiniResume
                            label="Nombre"
                            value={selected.nombre || '—'}
                            icon={<Building2 className="h-4 w-4" />}
                          />
                          <MiniResume
                            label="Teléfono"
                            value={selected.telefono || '—'}
                            icon={<Phone className="h-4 w-4" />}
                          />
                          <MiniResume
                            label="Comedor"
                            value={
                              selected.factura_comedor
                                ? selected.comedor_nombre || 'Sí, sin nombre'
                                : 'No'
                            }
                            icon={<UtensilsCrossed className="h-4 w-4" />}
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-start gap-3 text-white/70">
                          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                          <p className="text-sm leading-6">
                            Este panel te permite revisar la solicitud, documentar notas, mover su
                            estatus y eliminarla si ya fue cerrada.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
      <div
        className={cx(
          'text-sm text-white',
          multiline ? 'break-words leading-6' : 'break-words',
        )}
      >
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