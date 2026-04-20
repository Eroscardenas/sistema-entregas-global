'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  CalendarDays,
  Hash,
  RefreshCw,
  XCircle,
  Phone,
  MessageSquare,
  Package,
  Boxes,
  ShieldCheck,
  Clock3,
  UserRound,
  Database,
  BadgeCheck,
  FileText,
  Trash2,
  X,
} from 'lucide-react';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type PublicOrderStatus =
  | 'NUEVO'
  | 'EN_PROCESO'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'ATENDIDO';

type PublicOrderItemUI = {
  id: string;
  request_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  created_at: string | null;
};

type PublicOrderDetailUI = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  fecha_requerida: string | null;
  notes: string | null;
  status: PublicOrderStatus;
  reviewed_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  items: PublicOrderItemUI[];
};

const STATUS_META: Record<
  PublicOrderStatus,
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
    icon: <RefreshCw className="h-4 w-4" />,
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

function safeErr(e: unknown) {
  const anyE = e as any;
  return (
    (typeof anyE?.message === 'string' && anyE.message) ||
    (typeof anyE?.details === 'string' && anyE.details) ||
    (typeof anyE?.hint === 'string' && anyE.hint) ||
    (typeof anyE?.error_description === 'string' && anyE.error_description) ||
    'Ocurrió un error.'
  );
}

function canDeleteStatus(status?: string | null) {
  return status === 'RECHAZADO' || status === 'ATENDIDO';
}

function buildPublicStatusPatch(nextStatus: PublicOrderStatus) {
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

function AdminPedidoDetailClient({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();
  const guard = useAdminGuard();
  const sb = supabaseBrowser as unknown as any;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tableMissing, setTableMissing] = useState(false);

  const [data, setData] = useState<PublicOrderDetailUI | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const totalPieces = useMemo(() => {
    return data?.items.reduce((acc, item) => acc + Number(item.qty || 0), 0) ?? 0;
  }, [data]);

  const loadOrder = useCallback(async () => {
    if (!requestId) {
      setData(null);
      setNotesDraft('');
      return;
    }

    const { data: orderRow, error: orderErr } = await sb
      .from('public_order_requests')
      .select(
        'id,nombre,telefono,fecha_requerida,notes,status,reviewed_at,resolved_at,created_at,updated_at'
      )
      .eq('id', requestId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!orderRow) {
      setData(null);
      setNotesDraft('');
      return;
    }

    const { data: itemsRows, error: itemsErr } = await sb
      .from('public_order_request_items')
      .select('id,request_id,product_id,product_name,qty,created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    if (itemsErr) throw itemsErr;

    const mapped: PublicOrderDetailUI = {
      id: String(orderRow.id),
      nombre: orderRow.nombre ?? null,
      telefono: orderRow.telefono ?? null,
      fecha_requerida: orderRow.fecha_requerida ?? null,
      notes: orderRow.notes ?? null,
      status: (orderRow.status ?? 'NUEVO') as PublicOrderStatus,
      reviewed_at: orderRow.reviewed_at ?? null,
      resolved_at: orderRow.resolved_at ?? null,
      created_at: orderRow.created_at ?? null,
      updated_at: orderRow.updated_at ?? null,
      items: (itemsRows ?? []).map((r: any) => ({
        id: String(r.id),
        request_id: String(r.request_id),
        product_id: r.product_id ? String(r.product_id) : null,
        product_name: String(r.product_name ?? 'Producto'),
        qty: Number(r.qty ?? 0),
        created_at: r.created_at ?? null,
      })),
    };

    setData(mapped);
    setNotesDraft(mapped.notes ?? '');
  }, [requestId, sb]);

  const load = useCallback(async () => {
    setErr('');
    setTableMissing(false);
    setLoading(true);

    try {
      await loadOrder();
    } catch (e: unknown) {
      if (isMissingTableError(e)) {
        setTableMissing(true);
        setErr(
          'La tabla de pedidos públicos todavía no existe en esta base o el schema cache de Supabase aún no se refresca.'
        );
      } else {
        setErr(safeErr(e));
      }
    } finally {
      setLoading(false);
    }
  }, [loadOrder]);

  useEffect(() => {
    if (!guard.isAuthed) return;
    void load();
  }, [guard.isAuthed, load]);

  useEffect(() => {
    if (!guard.isAuthed || !requestId || tableMissing) return;

    const ordersChannel = sb
      .channel(`public_order_request_detail_${requestId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'public_order_requests',
          filter: `id=eq.${requestId}`,
        },
        () => void load()
      )
      .subscribe();

    const itemsChannel = sb
      .channel(`public_order_request_items_detail_${requestId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'public_order_request_items',
          filter: `request_id=eq.${requestId}`,
        },
        () => void load()
      )
      .subscribe();

    return () => {
      void sb.removeChannel(ordersChannel);
      void sb.removeChannel(itemsChannel);
    };
  }, [guard.isAuthed, load, requestId, sb, tableMissing]);

  async function saveStatus(nextStatus: PublicOrderStatus) {
    if (!data?.id) return;

    setBusy(true);
    setErr('');
    try {
      const patch = buildPublicStatusPatch(nextStatus);

      const { error } = await sb
        .from('public_order_requests')
        .update(patch)
        .eq('id', data.id);

      if (error) throw error;
      await loadOrder();
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!data?.id) return;

    setBusy(true);
    setErr('');
    try {
      const cleaned = notesDraft.trim();
      const value = cleaned.length === 0 ? null : cleaned;

      const { error } = await sb
        .from('public_order_requests')
        .update({ notes: value })
        .eq('id', data.id);

      if (error) throw error;
      await loadOrder();
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    if (!data?.id) return;
    if (!canDeleteStatus(data.status)) {
      setDeleteOpen(false);
      setErr('Solo se pueden eliminar pedidos en estado RECHAZADO o ATENDIDO.');
      return;
    }

    setDeleting(true);
    setErr('');

    try {
      const { error } = await sb
        .from('public_order_requests')
        .delete()
        .eq('id', data.id);

      if (error) {
        const { error: itemsErr } = await sb
          .from('public_order_request_items')
          .delete()
          .eq('request_id', data.id);

        if (itemsErr) throw itemsErr;

        const { error: requestErr } = await sb
          .from('public_order_requests')
          .delete()
          .eq('id', data.id);

        if (requestErr) throw requestErr;
      }

      setDeleteOpen(false);
      router.push(PATHS.admin.pedidos);
    } catch (e: unknown) {
      setErr(safeErr(e));
    } finally {
      setDeleting(false);
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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(PATHS.admin.pedidos)}
                className="rounded-xl bg-white/10 p-2 text-white/80 hover:bg-white/20"
                title="Volver"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="rounded-2xl bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] p-3 shadow-lg">
                <ClipboardList className="h-7 w-7 text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white">Detalle de pedido público</h1>
                <p className="text-sm text-white/70">
                  {requestId ? `ID: ${requestId}` : 'Falta ?id=... en la URL'}
                </p>
              </div>
            </div>

            <button
              onClick={() => void load()}
              disabled={loading || !requestId}
              className="rounded-xl bg-white/10 p-3 text-white/80 hover:bg-white/20 disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
        </motion.div>

        {!requestId && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-white/70">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-white/60" />
              <div>
                <div className="font-semibold text-white">No hay pedido seleccionado</div>
                <div className="mt-1 text-sm text-white/70">
                  Abre el detalle así:
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/80">
                    /admin/pedidos/detail?id=UUID
                  </div>
                </div>
                <button
                  onClick={() => router.push(PATHS.admin.pedidos)}
                  className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-white/80 hover:bg-white/20"
                >
                  Volver a Pedidos
                </button>
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {err && requestId && (
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
              <div className="flex items-center gap-3 text-red-200">
                {tableMissing ? (
                  <Database className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span>{err}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {requestId && (
          <>
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
                Cargando pedido…
              </div>
            ) : !data ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
                {tableMissing
                  ? 'Primero crea las tablas de pedidos públicos o refresca el schema cache.'
                  : 'No se encontró el pedido.'}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">
                          {data.nombre || 'Pedido sin nombre'}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          {data.telefono || 'Sin teléfono'}
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          Capturado: {formatDate(data.created_at)}
                        </div>
                      </div>

                      <StatusPill status={data.status} />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                    <div className="border-b border-white/10 px-5 py-4">
                      <div className="text-white font-semibold">Información general</div>
                    </div>

                    <div className="grid gap-4 p-5 md:grid-cols-2">
                      <InfoCard label="Cliente" value={data.nombre || '—'} icon={<UserRound className="h-4 w-4" />} />
                      <InfoCard label="Teléfono" value={data.telefono || '—'} icon={<Phone className="h-4 w-4" />} />
                      <InfoCard label="Fecha requerida" value={formatOnlyDate(data.fecha_requerida)} icon={<CalendarDays className="h-4 w-4" />} />
                      <InfoCard label="Piezas" value={totalPieces} icon={<Boxes className="h-4 w-4" />} />
                      <InfoCard label="Revisado" value={formatDate(data.reviewed_at)} icon={<ShieldCheck className="h-4 w-4" />} />
                      <InfoCard label="Resuelto" value={formatDate(data.resolved_at)} icon={<CheckCircle2 className="h-4 w-4" />} />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                      <div className="text-white font-semibold">Productos solicitados</div>
                      <div className="text-sm text-white/70">
                        Total piezas: <b className="text-white">{totalPieces}</b>
                      </div>
                    </div>

                    <div className="divide-y divide-white/10">
                      {data.items.length > 0 ? (
                        data.items.map((it) => (
                          <div key={it.id} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-white">
                                  {it.product_name}
                                </div>
                                <div className="mt-1 text-xs text-white/55">
                                  Capturado: {formatDate(it.created_at)}
                                </div>
                                {it.product_id && (
                                  <div className="mt-1 text-[11px] text-white/40">
                                    Product ID: {it.product_id}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-100">
                                x{it.qty}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-5 py-8 text-center text-white/50">
                          No se capturaron productos en este pedido.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-white">
                      <MessageSquare className="h-4 w-4" />
                      Notas internas
                    </div>
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
                        disabled={busy}
                        className={cx(
                          'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-medium transition-all',
                          busy
                            ? 'cursor-not-allowed bg-white/10 text-white/40'
                            : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
                        )}
                      >
                        {busy ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Guardar notas
                      </button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <div className="sticky top-6 space-y-6">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                      <div className="mb-3 font-semibold text-white">Cambio de estatus</div>
                      <div className="space-y-2">
                        {(
                          ['NUEVO', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'ATENDIDO'] as PublicOrderStatus[]
                        ).map((status) => {
                          const meta = STATUS_META[status];
                          const active = data.status === status;

                          return (
                            <button
                              key={status}
                              type="button"
                              onClick={() => void saveStatus(status)}
                              disabled={busy}
                              className={cx(
                                'flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition',
                                active
                                  ? meta.button
                                  : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
                                busy && 'opacity-60'
                              )}
                            >
                              {meta.icon}
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                      <div className="border-b border-white/10 px-4 py-3">
                        <p className="flex items-center gap-2 font-medium text-white">
                          <FileText className="h-4 w-4" />
                          Resumen rápido
                        </p>
                      </div>

                      <div className="space-y-3 p-4">
                        <MiniResume label="ID" value={data.id} icon={<Hash className="h-4 w-4" />} />
                        <MiniResume label="Cliente" value={data.nombre || '—'} icon={<UserRound className="h-4 w-4" />} />
                        <MiniResume label="Teléfono" value={data.telefono || '—'} icon={<Phone className="h-4 w-4" />} />
                        <MiniResume label="Fecha requerida" value={formatOnlyDate(data.fecha_requerida)} icon={<CalendarDays className="h-4 w-4" />} />
                        <MiniResume label="Productos" value={data.items.length} icon={<Package className="h-4 w-4" />} />
                        <MiniResume label="Piezas" value={totalPieces} icon={<Boxes className="h-4 w-4" />} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm leading-6 text-white/70">
                        Este detalle corresponde al flujo público de pedidos sin login.
                        Aquí solo revisas, documentas y cambias estatus. La conversión al flujo
                        interno de órdenes/entregas se hace después.
                      </p>
                    </div>

                    {canDeleteStatus(data.status) && (
                      <button
                        type="button"
                        onClick={() => setDeleteOpen(true)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-red-100 hover:bg-red-500/15"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar pedido
                      </button>
                    )}

                    <button
                      onClick={() => router.push(PATHS.admin.pedidos)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-white/80 hover:bg-white/20"
                    >
                      Volver a Pedidos
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {deleteOpen && data && (
          <DeleteModal
            data={data}
            totalPieces={totalPieces}
            deleting={deleting}
            onClose={() => {
              if (!deleting) setDeleteOpen(false);
            }}
            onConfirm={() => void runDelete()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusPill({ status }: { status: PublicOrderStatus }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs',
        meta.chip
      )}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function InfoCard({
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
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-white/45">{label}</p>
          <p className="mt-1 break-words text-sm font-medium text-white">{value}</p>
        </div>
        <div className="rounded-lg bg-white/10 p-2 text-white/70">{icon}</div>
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

function DeleteModal({
  data,
  totalPieces,
  deleting,
  onClose,
  onConfirm,
}: {
  data: PublicOrderDetailUI;
  totalPieces: number;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
              Estado actual: <b>{data.status}</b>
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MiniResume
              label="Cliente"
              value={data.nombre || '—'}
              icon={<UserRound className="h-4 w-4" />}
            />
            <MiniResume
              label="Teléfono"
              value={data.telefono || '—'}
              icon={<Phone className="h-4 w-4" />}
            />
            <MiniResume
              label="Fecha requerida"
              value={formatOnlyDate(data.fecha_requerida)}
              icon={<CalendarDays className="h-4 w-4" />}
            />
            <MiniResume
              label="Piezas"
              value={totalPieces}
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

export default function Page({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const requestId = typeof searchParams?.id === 'string' ? searchParams.id.trim() : '';
  return <AdminPedidoDetailClient requestId={requestId} />;
}