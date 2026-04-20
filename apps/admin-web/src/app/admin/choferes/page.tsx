'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Phone,
  KeyRound,
  User2,
  X,
  Clock,
  Calendar,
  AlertTriangle,
  Truck,
  Users,
  ChevronRight,
  RefreshCw,
  Link2,
  ShieldAlert,
} from 'lucide-react';

import { useDrivers } from '@/lib/hooks/useDrivers';
import type { DriverRow } from '@/lib/types/driver.types';

type UiDriver = DriverRow & {
  firebase_codigo?: string | null;
  firebase_nombre?: string | null;
  firebase_activo?: boolean | null;
  synced_from_inventory?: boolean;
  only_in_inventory?: boolean;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function getDriverRowKey(driver: {
  id?: string | null;
  firebase_codigo?: string | null;
  nombre?: string | null;
}) {
  const id = String(driver.id ?? '').trim();
  if (id) return id;

  const firebaseCodigo = String(driver.firebase_codigo ?? '').trim();
  if (firebaseCodigo) return `inv-${firebaseCodigo}`;

  const nombre = String(driver.nombre ?? '').trim();
  if (nombre) return `inv-name-${nombre}`;

  return 'inv-fallback-row';
}

function safeShortProfile(profileId?: string | null) {
  const v = String(profileId ?? '').trim();
  return v ? `${v.slice(0, 8)}…` : 'Sin perfil';
}

function safeDate(value?: string | null) {
  const v = String(value ?? '').trim();
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
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
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
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
                  className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20"
                  type="button"
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

function DriverCard({
  driver,
  onEdit,
  onToggleActive,
  onDelete,
  busy,
}: {
  driver: UiDriver;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const inventoryOnly = !!driver.only_in_inventory;
  const synced = !!driver.synced_from_inventory;
  const canMutateDriver = !!driver.id;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-4 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cx(
              'flex h-12 w-12 items-center justify-center rounded-xl',
              driver.activo
                ? 'bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A]'
                : 'bg-white/10'
            )}
          >
            <Truck
              className={cx(
                'h-6 w-6',
                driver.activo ? 'text-white' : 'text-white/40'
              )}
            />
          </div>

          <div>
            <h3 className="font-semibold text-white">{driver.nombre}</h3>

            <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
              {driver.firebase_codigo ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-cyan-200">
                  <Link2 className="h-3 w-3" />
                  {driver.firebase_codigo}
                </span>
              ) : null}

              {inventoryOnly ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                  <ShieldAlert className="h-3 w-3" />
                  Solo inventario
                </span>
              ) : synced ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Sincronizado
                </span>
              ) : null}
            </div>

            <p className="mt-1 flex items-center gap-1 text-sm text-white/50">
              <Phone className="h-3 w-3" />
              {driver.telefono || 'Sin teléfono'}
            </p>
          </div>
        </div>

        <span
          className={cx(
            'rounded-full px-2 py-1 text-xs font-medium',
            driver.activo
              ? 'border border-green-500/30 bg-green-500/20 text-green-300'
              : 'border border-white/10 bg-white/10 text-white/50'
          )}
        >
          {driver.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-xs text-white/40">Estado app</p>
          <p className="flex items-center gap-1 text-sm font-medium text-white">
            <Clock className="h-3 w-3 text-[#3D8FCC]" />
            {driver.current_status || 'offline'}
          </p>
        </div>

        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-xs text-white/40">Perfil</p>
          <p className="font-mono text-xs text-white">
            {safeShortProfile(driver.profile_id)}
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-white/5 p-3 text-xs text-white/60">
        <div className="flex items-center justify-between">
          <span>Inventario activo</span>
          <span className={driver.firebase_activo === false ? 'text-rose-300' : 'text-emerald-300'}>
            {driver.firebase_activo === false ? 'No' : 'Sí'}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onToggleActive}
          disabled={busy || !canMutateDriver}
          className={cx(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            !canMutateDriver
              ? 'cursor-not-allowed bg-white/5 text-white/30'
              : driver.activo
              ? 'bg-white/10 text-white/70 hover:bg-white/20'
              : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
          )}
        >
          {!canMutateDriver
            ? 'Primero completar'
            : driver.activo
            ? 'Desactivar'
            : 'Activar'}
        </button>

        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded-lg bg-[#1E4A7A] p-2 text-white transition-colors hover:bg-[#2E6B9E]"
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          onClick={onDelete}
          disabled={busy || !canMutateDriver}
          className={cx(
            'rounded-lg p-2 text-white transition-colors',
            canMutateDriver
              ? 'bg-[#4A1F2F] hover:bg-[#6D2F45]'
              : 'cursor-not-allowed bg-white/5 text-white/30'
          )}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function DriverTableRow({
  driver,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  driver: UiDriver;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const inventoryOnly = !!driver.only_in_inventory;
  const synced = !!driver.synced_from_inventory;
  const canMutateDriver = !!driver.id;

  return (
    <motion.tr
      className="border-b border-white/10 transition-colors hover:bg-white/5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <td className="py-4 pr-3">
        <div className="flex items-center gap-3">
          <div
            className={cx(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              driver.activo
                ? 'bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A]'
                : 'bg-white/10'
            )}
          >
            <User2
              className={cx(
                'h-5 w-5',
                driver.activo ? 'text-white' : 'text-white/40'
              )}
            />
          </div>

          <div>
            <div className="font-medium text-white">{driver.nombre}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
              {driver.firebase_codigo ? (
                <span className="font-mono">Código: {driver.firebase_codigo}</span>
              ) : (
                <span className="font-mono">Perfil: {safeShortProfile(driver.profile_id)}</span>
              )}

              {inventoryOnly ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                  Solo inventario
                </span>
              ) : synced ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                  Sincronizado
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </td>

      <td className="py-4 pr-3">
        <div className="flex items-center gap-2 text-white/70">
          <Phone className="h-4 w-4 text-white/40" />
          <span>{driver.telefono || '—'}</span>
        </div>
      </td>

      <td className="py-4 pr-3">
        <span
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            driver.activo
              ? 'border border-green-500/30 bg-green-500/20 text-green-300'
              : 'border border-white/10 bg-white/10 text-white/50'
          )}
        >
          {driver.activo ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {driver.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>

      <td className="py-4 pr-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70">
          <Clock className="h-3.5 w-3.5" />
          {driver.current_status || 'offline'}
        </span>
      </td>

      <td className="py-4 pr-3">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <Calendar className="h-4 w-4" />
          {safeDate(driver.created_at)}
        </div>
      </td>

      <td className="py-4 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={onToggleActive}
            disabled={!canMutateDriver}
            className={cx(
              'rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              !canMutateDriver
                ? 'cursor-not-allowed bg-white/5 text-white/30'
                : driver.activo
                ? 'bg-white/10 text-white/70 hover:bg-white/20'
                : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
            )}
            title={driver.activo ? 'Desactivar' : 'Activar'}
            type="button"
          >
            {!canMutateDriver
              ? 'Primero completar'
              : driver.activo
              ? 'Desactivar'
              : 'Activar'}
          </button>

          <button
            onClick={onEdit}
            className="rounded-lg bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20"
            title="Editar"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            onClick={onDelete}
            disabled={!canMutateDriver}
            className={cx(
              'rounded-lg p-2 transition-colors',
              canMutateDriver
                ? 'bg-[#4A1F2F]/30 text-[#F2B8C3] hover:bg-[#4A1F2F]/50'
                : 'cursor-not-allowed bg-white/5 text-white/30'
            )}
            title="Eliminar"
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

function KPISection({
  total,
  activos,
  inactivos,
}: {
  total: number;
  activos: number;
  inactivos: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        className="rounded-xl bg-gradient-to-br from-[#1E4A7A] to-[#2E6B9E] p-5 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-sm text-white/70">Total Choferes</p>
            <p className="text-2xl font-bold text-white">{total}</p>
          </div>
          <div className="rounded-lg bg-white/20 p-3">
            <Users className="h-6 w-6 text-white" />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl bg-gradient-to-br from-[#2D1B3A] to-[#4A2D5A] p-5 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-sm text-white/70">Activos</p>
            <p className="text-2xl font-bold text-white">{activos}</p>
          </div>
          <div className="rounded-lg bg-white/20 p-3">
            <CheckCircle2 className="h-6 w-6 text-white" />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl bg-gradient-to-br from-[#4A1F2F] to-[#6D2F45] p-5 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-sm text-white/70">Inactivos</p>
            <p className="text-2xl font-bold text-white">{inactivos}</p>
          </div>
          <div className="rounded-lg bg-white/20 p-3">
            <XCircle className="h-6 w-6 text-white" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function AdminChoferesPage() {
  const router = useRouter();

  const {
    filtered,
    loading,
    busy,
    error,
    q,
    setQ,
    createDriver,
    updateDriver,
    deleteDriver,
    reload,
  } = useDrivers();

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const [openCreate, setOpenCreate] = useState(false);
  const [cNombre, setCNombre] = useState('');
  const [cTelefono, setCTelefono] = useState('');
  const [cPass, setCPass] = useState('');
  const [cActivo, setCActivo] = useState(true);

  const [openEdit, setOpenEdit] = useState(false);
  const [editRow, setEditRow] = useState<UiDriver | null>(null);
  const [eNombre, setENombre] = useState('');
  const [eTelefono, setETelefono] = useState('');
  const [eActivo, setEActivo] = useState(true);
  const [eNewPass, setENewPass] = useState('');

  const activos = filtered.filter((d) => d.activo).length;
  const inactivos = filtered.length - activos;

  const canCreateManual = useMemo(() => {
    return !!cNombre.trim() && !!cTelefono.trim() && !!cPass.trim();
  }, [cNombre, cTelefono, cPass]);

  function openEditFor(r: UiDriver) {
    setEditRow(r);
    setENombre(r.nombre || '');
    setETelefono(r.telefono || '');
    setEActivo(!!r.activo);
    setENewPass('');
    setOpenEdit(true);
  }

  async function onCreate() {
    const ok = await createDriver({
      nombre: cNombre.trim(),
      telefono: cTelefono.trim(),
      password: cPass.trim(),
      activo: cActivo,
    });

    if (!ok) return;

    setOpenCreate(false);
    setCNombre('');
    setCTelefono('');
    setCPass('');
    setCActivo(true);
  }

  async function onSaveEdit() {
    if (!editRow) return;

    const nombre = eNombre.trim();
    const telefono = eTelefono.trim();
    const password = eNewPass.trim();

    if (!nombre || !telefono) return;

    // Si viene solo de inventario, intenta crearlo en entregas con sus datos móviles
    if (!editRow.id) {
      const ok = await createDriver({
        nombre,
        telefono,
        password,
        activo: eActivo,
      });

      if (!ok) return;

      setOpenEdit(false);
      setEditRow(null);
      setENombre('');
      setETelefono('');
      setEActivo(true);
      setENewPass('');
      return;
    }

    const ok = await updateDriver(editRow.id, {
      nombre,
      telefono,
      activo: eActivo,
      password: password || undefined,
    });

    if (!ok) return;

    setOpenEdit(false);
    setEditRow(null);
  }

  async function onToggleActive(r: UiDriver) {
    if (!r.id) return;
    await updateDriver(r.id, { activo: !r.activo });
  }

  async function onDelete(r: UiDriver) {
    if (!r.id) return;

    if (
      window.confirm(
        `¿Estás seguro de eliminar al chofer "${r.nombre}"?\n\nEsta acción eliminará permanentemente el registro. Considera desactivarlo si no está en operación.`
      )
    ) {
      await deleteDriver(r.id);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] p-3 shadow-lg">
                <Truck className="h-8 w-8 text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white">Gestión de Choferes</h1>
                <p className="text-sm text-white/70">
                  Jala transportes desde inventario y completa sus accesos a la aplicación
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => reload()}
                disabled={busy || loading}
                className="rounded-xl bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 disabled:opacity-50"
                title="Actualizar"
                type="button"
              >
                <RefreshCw className={cx('h-5 w-5', loading && 'animate-spin')} />
              </button>

              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="rounded-xl bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
                title={viewMode === 'grid' ? 'Vista lista' : 'Vista grid'}
                type="button"
              >
                {viewMode === 'grid' ? (
                  <Users className="h-5 w-5" />
                ) : (
                  <Truck className="h-5 w-5" />
                )}
              </button>

              <button
                onClick={() => router.push('/admin/dashboard')}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
                type="button"
              >
                <ChevronRight className="h-4 w-4" />
                Dashboard
              </button>

              <button
                onClick={() => setOpenCreate(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:from-[#2E6B9E] hover:to-[#1E4A7A] disabled:opacity-50"
                type="button"
              >
                <Plus className="h-5 w-5" />
                Crear Chofer Manual
              </button>
            </div>
          </div>
        </motion.div>

        <div className="mb-8">
          <KPISection total={filtered.length} activos={activos} inactivos={inactivos} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nombre, teléfono o código de inventario..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-white/50">
                {loading ? <span>Cargando...</span> : <span>{filtered.length} choferes encontrados</span>}
              </div>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/20 p-4"
            >
              <div className="flex items-center gap-3 text-red-200">
                <AlertTriangle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl"
        >
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#1E4A7A] border-r-transparent" />
              <p className="mt-2 text-white/50">Cargando choferes...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
                <Truck className="h-10 w-10 text-white/20" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-white">No hay transportes disponibles</h3>
              <p className="mb-4 text-sm text-white/50">
                Verifica que existan usuarios con rol TRANSPORTE en inventario
              </p>
              <button
                onClick={() => reload()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-4 py-2 text-white transition-colors hover:bg-[#2E6B9E]"
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((driver) => (
                <DriverCard
                  key={getDriverRowKey(driver as UiDriver)}
                  driver={driver as UiDriver}
                  onEdit={() => openEditFor(driver as UiDriver)}
                  onToggleActive={() => onToggleActive(driver as UiDriver)}
                  onDelete={() => onDelete(driver as UiDriver)}
                  busy={busy}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-white/50">
                      Chofer
                    </th>
                    <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-white/50">
                      Teléfono
                    </th>
                    <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-white/50">
                      Estado
                    </th>
                    <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-white/50">
                      Status
                    </th>
                    <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-white/50">
                      Creado
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-white/50">
                      Acciones
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {filtered.map((driver) => (
                    <DriverTableRow
                      key={getDriverRowKey(driver as UiDriver)}
                      driver={driver as UiDriver}
                      onEdit={() => openEditFor(driver as UiDriver)}
                      onToggleActive={() => onToggleActive(driver as UiDriver)}
                      onDelete={() => onDelete(driver as UiDriver)}
                      busy={busy}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      <Modal open={openCreate} title="Nuevo Chofer" onClose={() => !busy && setOpenCreate(false)}>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-white/70">Nombre completo</label>
            <input
              value={cNombre}
              onChange={(e) => setCNombre(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              placeholder="Ej: Juan Pérez"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Teléfono</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
              <input
                value={cTelefono}
                onChange={(e) => setCTelefono(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                placeholder="Ej: 5551234567"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Contraseña</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
              <input
                value={cPass}
                onChange={(e) => setCPass(e.target.value)}
                type="password"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
            <div>
              <p className="text-sm font-medium text-white">Estado inicial</p>
              <p className="text-xs text-white/50">Activo = puede usar la app</p>
            </div>

            <button
              onClick={() => setCActivo(!cActivo)}
              className={cx(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                cActivo
                  ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              )}
              type="button"
            >
              {cActivo ? 'Activo' : 'Inactivo'}
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setOpenCreate(false)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 transition-colors hover:bg-white/10"
              type="button"
            >
              Cancelar
            </button>

            <button
              onClick={onCreate}
              disabled={busy || !canCreateManual}
              className={cx(
                'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
                busy || !canCreateManual
                  ? 'cursor-not-allowed bg-white/10 text-white/30'
                  : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
              )}
              type="button"
            >
              {busy ? 'Creando...' : 'Crear Chofer'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={openEdit}
        title={editRow?.id ? 'Editar Chofer' : 'Completar Acceso de Chofer'}
        onClose={() => !busy && setOpenEdit(false)}
      >
        <div className="space-y-4">
          {editRow?.firebase_codigo ? (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
              <div className="flex items-center gap-2 font-medium">
                <Link2 className="h-4 w-4" />
                Transporte de inventario: {editRow.firebase_codigo}
              </div>
              <div className="mt-1 text-cyan-200/80">
                {editRow.id
                  ? 'Este chofer ya está sincronizado con entregas.'
                  : 'Este transporte viene de inventario y todavía no tiene acceso móvil completo en entregas.'}
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm text-white/70">Nombre completo</label>
            <input
              value={eNombre}
              onChange={(e) => setENombre(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Teléfono</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
              <input
                value={eTelefono}
                onChange={(e) => setETelefono(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
            <div>
              <p className="text-sm font-medium text-white">Estado</p>
              <p className="text-xs text-white/50">Desactivar = no puede usar la app</p>
            </div>

            <button
              onClick={() => setEActivo(!eActivo)}
              className={cx(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                eActivo
                  ? 'border border-green-500/30 bg-green-500/20 text-green-300'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              )}
              type="button"
            >
              {eActivo ? 'Activo' : 'Inactivo'}
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">
              {editRow?.id ? 'Nueva contraseña (opcional)' : 'Contraseña de acceso'}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
              <input
                value={eNewPass}
                onChange={(e) => setENewPass(e.target.value)}
                type="password"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                placeholder={
                  editRow?.id
                    ? 'Dejar vacío para mantener actual'
                    : 'Obligatoria para acceso a la app'
                }
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setOpenEdit(false)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 transition-colors hover:bg-white/10"
              type="button"
            >
              Cancelar
            </button>

            <button
              onClick={onSaveEdit}
              disabled={busy || !eNombre.trim() || !eTelefono.trim() || (!editRow?.id && !eNewPass.trim())}
              className={cx(
                'flex-1 rounded-xl px-4 py-3 font-medium transition-all',
                busy || !eNombre.trim() || !eTelefono.trim() || (!editRow?.id && !eNewPass.trim())
                  ? 'cursor-not-allowed bg-white/10 text-white/30'
                  : 'bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]'
              )}
              type="button"
            >
              {busy
                ? 'Guardando...'
                : editRow?.id
                ? 'Guardar Cambios'
                : 'Crear Acceso Móvil'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}