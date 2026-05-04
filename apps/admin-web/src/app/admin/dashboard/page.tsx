'use client';

// app/admin/dashboard/page.tsx
// Dashboard real sincronizado con inventario + assignments + routes + deliveries
// Barra tipo Uber con camioncito y actualización en vivo

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import {
  Users,
  Truck,
  BarChart3,
  Route,
  Clock,
  AlertCircle,
  CheckCircle2,
  Flag,
  CalendarDays,
  RefreshCw,
  Link2,
} from 'lucide-react';

import {
  collection,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { supabaseBrowser } from '@/lib/supabase/client';
import { inventoryDb } from '@/lib/firebase/inventory.client';

const sb = supabaseBrowser as unknown as any;

const T_DRIVERS = 'drivers';
const T_ASSIGNMENTS = 'assignments';
const T_DELIVERIES = 'deliveries';
const T_ROUTES = 'routes';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type DriverStatus = 'PENDIENTE' | 'EN_RUTA' | 'FINALIZADA';

type DriverCard = {
  driverId: string;
  nombre: string;
  status: DriverStatus;
  entregasHechas: number;
  entregasTotal: number;
  inicioRutaAt: string | null;
  finRutaAt: string | null;
  kmInicio?: number | null;
  kmFin?: number | null;
  totalEsperado?: number | null;
  totalReal?: number | null;
  canceladas?: number;
  entregasPendientes?: number;
  routeStatus?: string | null;
  firebaseCodigo?: string | null;
  syncedFromInventory?: boolean;
  inventoryOnly?: boolean;
};

type DashboardSummary = {
  choferesActivos: number;
  enRuta: number;
  entregasHechas: number;
  entregasTotal: number;
  esperado: number;
  real: number;
};

type DashboardData = {
  summary: DashboardSummary;
  drivers: DriverCard[];
  updatedAt: string;
};

type DriverRow = {
  id: string;
  nombre: string | null;
  activo: boolean | null;
  current_status: string | null;
};

type AssignmentRow = {
  id: string;
  driver_id: string | null;
  work_date: string | null;
  status: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

type DeliveryRow = {
  id: string;
  assignment_id: string;
  customer_id: string | null;
  total_expected: number | null;
  total_real: number | null;
  status: string | null;
  created_at: string | null;
  updated_at?: string | null;
  delivered_at?: string | null;
};

type RouteRow = {
  id: string;
  assignment_id: string;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  km_start: number | null;
  km_end: number | null;
  created_at?: string | null;
};

type InventoryTransportRow = {
  firebase_id: string;
  firebase_codigo: string;
  firebase_nombre: string;
  firebase_activo: boolean;
};

type DriverInventoryMappingRow = {
  id: string;
  driver_id: string;
  firebase_employee_code: string;
  firebase_employee_name: string | null;
  is_active: boolean;
};

type DashboardDriverBase = {
  id: string;
  nombre: string | null;
  activo: boolean | null;
  current_status: string | null;
  firebase_codigo?: string | null;
  firebase_nombre?: string | null;
  firebase_activo?: boolean | null;
  synced_from_inventory?: boolean;
};

function pct(done: number, total: number) {
  if (!total) return 0;
  const p = Math.round((done / total) * 100);
  return Math.max(0, Math.min(100, p));
}

function fmtMoney(n?: number | null) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fmtTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayMx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeStatus(s?: string | null) {
  return String(s ?? '').trim().toUpperCase();
}

function isCanceledDelivery(status?: string | null) {
  const s = normalizeStatus(status);
  return (
    s === 'CANCELADA' ||
    s === 'CANCELADO' ||
    s === 'RECHAZADA' ||
    s === 'RECHAZADO'
  );
}

function isDoneDelivery(status?: string | null) {
  const s = normalizeStatus(status);

  return (
    s === 'ENTREGADA' ||
    s === 'ENTREGADO' ||
    s === 'DELIVERED' ||
    s === 'DONE' ||
    s === 'FINALIZADA' ||
    s === 'FINALIZADO' ||
    s === 'COMPLETADA' ||
    s === 'COMPLETADO' ||
    s === 'ATENDIDA' ||
    s === 'ATENDIDO' ||
    s === 'CONFIRMADA' ||
    s === 'CONFIRMADO' ||
    s === 'CERRADA' ||
    s === 'CERRADO'
  );
}

function isFinalizedAssignment(status?: string | null) {
  const s = normalizeStatus(status);

  return (
    s === 'CERRADA' ||
    s === 'CERRADO' ||
    s === 'FINALIZADA' ||
    s === 'FINALIZADO' ||
    s === 'COMPLETADA' ||
    s === 'COMPLETADO'
  );
}

function isCanceledAssignment(status?: string | null) {
  const s = normalizeStatus(status);
  return s === 'CANCELADA' || s === 'CANCELADO';
}

function isRouteFinalized(status?: string | null) {
  const s = normalizeStatus(status);
  return s === 'FINALIZADA' || s === 'FINALIZADO' || s === 'CERRADA' || s === 'CERRADO';
}

function isRouteStarted(status?: string | null) {
  const s = normalizeStatus(status);

  return (
    s === 'INICIADA' ||
    s === 'INICIADO' ||
    s === 'EN_RUTA' ||
    s === 'FINALIZADA' ||
    s === 'FINALIZADO' ||
    s === 'CERRADA' ||
    s === 'CERRADO'
  );
}

async function listInventoryTransportes(): Promise<InventoryTransportRow[]> {
  const ref = collection(inventoryDb, 'empleados');

  const qy = query(
    ref,
    where('role', '==', 'TRANSPORTE'),
    where('isActive', '==', true),
    orderBy('nombre', 'asc'),
    qLimit(300)
  );

  const snap = await getDocs(qy);

  return snap.docs.map((d) => {
    const data = d.data() as any;

    return {
      firebase_id: d.id,
      firebase_codigo: String(data.codigo ?? '').trim(),
      firebase_nombre: String(data.nombre ?? '').trim(),
      firebase_activo: data.isActive !== false,
    };
  });
}

async function listDriverInventoryMappings(sbClient: any): Promise<DriverInventoryMappingRow[]> {
  const { data, error } = await sbClient
    .from('driver_inventory_mapping')
    .select('*')
    .eq('is_active', true);

  if (error) throw error;
  return (data ?? []) as DriverInventoryMappingRow[];
}

async function loadDashboard(): Promise<DashboardData> {
  const workDate = todayMx();
  const updatedAt = new Date().toISOString();

  const [driversRes, mappings, transportes] = await Promise.all([
    sb
      .from(T_DRIVERS)
      .select('id,nombre,activo,current_status')
      .order('nombre', { ascending: true }),
    listDriverInventoryMappings(sb),
    listInventoryTransportes(),
  ]);

  if (driversRes.error) throw driversRes.error;

  const drivers = (driversRes.data ?? []) as DriverRow[];

  const mappingByCode = new Map(
    mappings.map((m) => [String(m.firebase_employee_code ?? '').trim(), m])
  );

  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const mergedDrivers: DashboardDriverBase[] = transportes.map((t) => {
    const mapping = mappingByCode.get(t.firebase_codigo);
    const driver = mapping?.driver_id ? driverById.get(mapping.driver_id) : null;

    if (driver) {
      return {
        ...driver,
        nombre: t.firebase_nombre || driver.nombre || 'Chofer',
        activo: t.firebase_activo && !!driver.activo,
        firebase_codigo: t.firebase_codigo,
        firebase_nombre: t.firebase_nombre,
        firebase_activo: t.firebase_activo,
        synced_from_inventory: true,
      };
    }

    return {
      id: '',
      nombre: t.firebase_nombre || 'Chofer',
      activo: t.firebase_activo,
      current_status: 'offline',
      firebase_codigo: t.firebase_codigo,
      firebase_nombre: t.firebase_nombre,
      firebase_activo: t.firebase_activo,
      synced_from_inventory: false,
    };
  });

  const activeDriverIds = mergedDrivers
    .map((d) => String(d.id ?? '').trim())
    .filter(Boolean);

  const { data: assignmentsData, error: assignmentsErr } = await sb
    .from(T_ASSIGNMENTS)
    .select('id,driver_id,work_date,status,created_at,updated_at')
    .eq('work_date', workDate)
    .order('created_at', { ascending: true });

  if (assignmentsErr) throw assignmentsErr;

  const assignments = ((assignmentsData ?? []) as AssignmentRow[]).filter(
    (a) => !isCanceledAssignment(a.status)
  );

  const relevantAssignments = assignments.filter((a) => {
    const driverId = String(a.driver_id ?? '').trim();
    return driverId && activeDriverIds.includes(driverId);
  });

  const assignmentIds = relevantAssignments.map((a) => a.id);

  let deliveries: DeliveryRow[] = [];
  let routes: RouteRow[] = [];

  if (assignmentIds.length > 0) {
    const [{ data: deliveriesData, error: deliveriesErr }, { data: routesData, error: routesErr }] =
      await Promise.all([
        sb
          .from(T_DELIVERIES)
          .select(
            'id,assignment_id,customer_id,total_expected,total_real,status,created_at,updated_at,delivered_at'
          )
          .in('assignment_id', assignmentIds)
          .order('created_at', { ascending: true }),
        sb
          .from(T_ROUTES)
          .select('id,assignment_id,status,started_at,ended_at,km_start,km_end,created_at')
          .in('assignment_id', assignmentIds)
          .order('created_at', { ascending: false }),
      ]);

    if (deliveriesErr) throw deliveriesErr;
    if (routesErr) throw routesErr;

    deliveries = (deliveriesData ?? []) as DeliveryRow[];
    routes = (routesData ?? []) as RouteRow[];
  }

  const assignmentsByDriver = new Map<string, AssignmentRow[]>();

  relevantAssignments.forEach((a) => {
    const driverId = String(a.driver_id ?? '').trim();
    if (!driverId) return;

    if (!assignmentsByDriver.has(driverId)) {
      assignmentsByDriver.set(driverId, []);
    }

    assignmentsByDriver.get(driverId)!.push(a);
  });

  const deliveriesByAssignment = new Map<string, DeliveryRow[]>();

  deliveries.forEach((d) => {
    const aid = String(d.assignment_id);
    if (!deliveriesByAssignment.has(aid)) {
      deliveriesByAssignment.set(aid, []);
    }

    deliveriesByAssignment.get(aid)!.push(d);
  });

  const routeByAssignment = new Map<string, RouteRow>();

  routes.forEach((r) => {
    const aid = String(r.assignment_id);
    if (!aid) return;

    if (!routeByAssignment.has(aid)) {
      routeByAssignment.set(aid, r);
    }
  });

  const driverCards: DriverCard[] = mergedDrivers.map((driver) => {
    const driverId = String(driver.id ?? '').trim();
    const driverAssignments = driverId ? assignmentsByDriver.get(driverId) ?? [] : [];

    const driverDeliveries = driverAssignments.flatMap(
      (a) => deliveriesByAssignment.get(a.id) ?? []
    );

    const driverRoutes = driverAssignments
      .map((a) => routeByAssignment.get(a.id))
      .filter(Boolean) as RouteRow[];

    const canceladas = driverDeliveries.filter((d) => isCanceledDelivery(d.status)).length;
    const validDeliveries = driverDeliveries.filter((d) => !isCanceledDelivery(d.status));

    const entregasHechas = validDeliveries.filter((d) => isDoneDelivery(d.status)).length;
    const entregasTotal = validDeliveries.length;
    const entregasPendientes = Math.max(0, entregasTotal - entregasHechas);

    const totalEsperado = validDeliveries.reduce(
      (acc, d) => acc + Number(d.total_expected ?? 0),
      0
    );

    const totalReal = validDeliveries.reduce((acc, d) => {
      if (isDoneDelivery(d.status)) return acc + Number(d.total_real ?? 0);
      return acc;
    }, 0);

    let inicioRutaAt: string | null = null;
    let finRutaAt: string | null = null;
    let kmInicio: number | null = null;
    let kmFin: number | null = null;
    let routeStatus: string | null = null;

    if (driverRoutes.length > 0) {
      const startedRoutes = driverRoutes
        .filter((r) => r.started_at)
        .sort((a, b) => {
          const aa = new Date(a.started_at ?? '').getTime() || 0;
          const bb = new Date(b.started_at ?? '').getTime() || 0;
          return aa - bb;
        });

      const endedRoutes = driverRoutes
        .filter((r) => r.ended_at)
        .sort((a, b) => {
          const aa = new Date(a.ended_at ?? '').getTime() || 0;
          const bb = new Date(b.ended_at ?? '').getTime() || 0;
          return bb - aa;
        });

      const latestRoute = [...driverRoutes].sort((a, b) => {
        const aa = new Date(a.started_at ?? a.created_at ?? '').getTime() || 0;
        const bb = new Date(b.started_at ?? b.created_at ?? '').getTime() || 0;
        return bb - aa;
      })[0];

      inicioRutaAt = startedRoutes[0]?.started_at ?? null;
      finRutaAt = endedRoutes[0]?.ended_at ?? null;

      kmInicio =
        startedRoutes.length > 0
          ? startedRoutes[0].km_start ?? null
          : latestRoute?.km_start ?? null;

      kmFin =
        endedRoutes.length > 0
          ? endedRoutes[0].km_end ?? null
          : latestRoute?.km_end ?? null;

      routeStatus = latestRoute?.status ?? null;
    }

    let status: DriverStatus = 'PENDIENTE';

    if (!driverId || driverAssignments.length === 0 || entregasTotal === 0) {
      status = 'PENDIENTE';
    } else {
      const allDeliveriesDone = entregasTotal > 0 && entregasHechas >= entregasTotal;
      const anyRouteStarted = driverRoutes.some((r) => isRouteStarted(r.status));
      const anyRouteFinalized = driverRoutes.some((r) => isRouteFinalized(r.status));
      const allAssignmentsFinalized =
        driverAssignments.length > 0 &&
        driverAssignments.every((a) => isFinalizedAssignment(a.status));

      if (allDeliveriesDone && (anyRouteFinalized || allAssignmentsFinalized)) {
        status = 'FINALIZADA';
      } else if (anyRouteStarted || entregasHechas > 0) {
        status = 'EN_RUTA';
      } else {
        status = 'PENDIENTE';
      }
    }

    return {
      driverId,
      nombre: driver.nombre || driver.firebase_nombre || 'Chofer',
      status,
      entregasHechas,
      entregasTotal,
      inicioRutaAt,
      finRutaAt,
      kmInicio,
      kmFin,
      totalEsperado,
      totalReal,
      canceladas,
      entregasPendientes,
      routeStatus,
      firebaseCodigo: driver.firebase_codigo ?? null,
      syncedFromInventory: !!driver.synced_from_inventory,
      inventoryOnly: !driverId,
    };
  });

  const summary: DashboardSummary = {
    choferesActivos: driverCards.length,
    enRuta: driverCards.filter((d) => d.status === 'EN_RUTA').length,
    entregasHechas: driverCards.reduce((a, d) => a + d.entregasHechas, 0),
    entregasTotal: driverCards.reduce((a, d) => a + d.entregasTotal, 0),
    esperado: driverCards.reduce((a, d) => a + Number(d.totalEsperado ?? 0), 0),
    real: driverCards.reduce((a, d) => a + Number(d.totalReal ?? 0), 0),
  };

  return {
    summary,
    drivers: driverCards,
    updatedAt,
  };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const guard = useAdminGuard();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');

  const adminName = useMemo(() => {
    const n = guard.adminUser?.nombre?.trim();
    if (n) return n;

    const email = guard.adminUser?.email?.trim();
    if (email) return email.split('@')[0];

    return 'Administrador';
  }, [guard.adminUser]);

  async function refresh(options?: { soft?: boolean }) {
    const soft = options?.soft === true;

    setErr('');
    if (!soft) setLoading(true);

    try {
      const d = await loadDashboard();
      setData(d);
    } catch (e: any) {
      setErr(typeof e?.message === 'string' ? e.message : 'No se pudo cargar el dashboard');
      if (!soft) setData(null);
    } finally {
      if (!soft) setLoading(false);
    }
  }

  useEffect(() => {
    if (guard.loading || !guard.isAuthed) return;

    void refresh();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const softRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        void refresh({ soft: true });
      }, 350);
    };

    const channel = sb
      .channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: T_ASSIGNMENTS }, softRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: T_ROUTES }, softRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: T_DELIVERIES }, softRefresh)
      .subscribe();

    const interval = setInterval(() => {
      void refresh({ soft: true });
    }, 15000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      void sb.removeChannel(channel);
    };
  }, [guard.loading, guard.isAuthed]);

  return (
    <div className="relative">
      <DashboardBackground />

      <div className="relative z-10 space-y-6">
        <div className="rounded-3xl border border-white/12 bg-white/6 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-sm text-white/70">Bienvenido,</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{adminName}</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            <QuickChip label="Choferes" onClick={() => router.push(PATHS.admin.choferes)} />
            <QuickChip label="Clientes" onClick={() => router.push(PATHS.admin.clientes)} />
            <QuickChip label="Productos" onClick={() => router.push(PATHS.admin.productos)} />
            <QuickChip label="Asignaciones" onClick={() => router.push(PATHS.admin.asignaciones)} />
            <QuickChip label="Reportes" onClick={() => router.push(PATHS.admin.reportes)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Choferes activos"
            value={data ? String(data.summary.choferesActivos) : '—'}
            icon={<Users className="h-5 w-5" />}
            tone="blue"
          />
          <KpiCard
            title="En ruta"
            value={data ? String(data.summary.enRuta) : '—'}
            icon={<Truck className="h-5 w-5" />}
            tone="wine"
          />
          <KpiCard
            title="Entregas hoy"
            value={data ? `${data.summary.entregasHechas}/${data.summary.entregasTotal}` : '—'}
            icon={<Route className="h-5 w-5" />}
            tone="blue"
          />
          <KpiCard
            title="Total real"
            value={data ? fmtMoney(data.summary.real) : '—'}
            icon={<BarChart3 className="h-5 w-5" />}
            tone="wine"
          />
        </div>

        <div className="rounded-3xl border border-white/12 bg-white/6 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-semibold">Choferes y progreso en vivo</div>
              <div className="mt-1 text-xs text-white/55">
                Última actualización: {data ? fmtTime(data.updatedAt) : '—'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void refresh()}
              className={cx(
                'inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/8',
                loading && 'opacity-60'
              )}
              disabled={loading}
            >
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="px-5 py-6 text-sm text-white/70">Cargando choferes…</div>
            ) : err ? (
              <div className="px-5 py-6">
                <div className="flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-200" />
                  <div className="flex-1">
                    <div className="font-semibold">No se pudo cargar</div>
                    <div className="mt-1 text-red-100/90">{err}</div>
                  </div>
                </div>
              </div>
            ) : data?.drivers?.length ? (
              data.drivers.map((d) => (
                <DriverRow
                  key={d.driverId || `inv-${d.firebaseCodigo || d.nombre}`}
                  driver={d}
                />
              ))
            ) : (
              <div className="px-5 py-6 text-sm text-white/70">
                Aún no hay choferes o rutas para mostrar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/login.jpg)' }}
      />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_18%_22%,rgba(77,173,255,0.18),transparent_60%),radial-gradient(780px_520px_at_85%_15%,rgba(133,40,56,0.14),transparent_60%),radial-gradient(900px_560px_at_50%_95%,rgba(20,64,120,0.18),transparent_60%)]" />
      <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />

      <motion.div
        animate={{ opacity: [0.12, 0.22, 0.12] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-1/2 top-[-320px] h-[820px] w-[820px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
      />
    </div>
  );
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75 transition hover:bg-white/8"
    >
      {label}
    </button>
  );
}

function KpiCard({
  title,
  value,
  icon,
  tone = 'blue',
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'blue' | 'wine';
}) {
  const iconBg =
    tone === 'wine'
      ? 'border-[#852838]/20 bg-[#852838]/12'
      : 'border-[#4DADFF]/20 bg-[#4DADFF]/12';

  const iconColor = tone === 'wine' ? 'text-[#F2B8C3]' : 'text-[#B9E3FF]';

  return (
    <div className="rounded-3xl border border-white/12 bg-white/6 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white/65">{title}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        </div>

        <div className={cx('rounded-2xl border p-2.5', iconBg)}>
          <div className={iconColor}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

function DriverRow({ driver }: { driver: DriverCard }) {
  const progress = pct(driver.entregasHechas, driver.entregasTotal);

  const badge = useMemo(() => {
    if (driver.status === 'EN_RUTA') {
      return {
        text: 'EN RUTA',
        cls: 'border-[#4DADFF]/25 bg-[#4DADFF]/10 text-[#B9E3FF]',
      };
    }

    if (driver.status === 'FINALIZADA') {
      return {
        text: 'FINALIZADA',
        cls: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
      };
    }

    return {
      text: 'PENDIENTE',
      cls: 'border-white/10 bg-white/5 text-white/70',
    };
  }, [driver.status]);

  const kmText =
    typeof driver.kmInicio === 'number' && typeof driver.kmFin === 'number'
      ? `${(driver.kmFin - driver.kmInicio).toLocaleString('es-MX', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })} km`
      : '—';

  return (
    <div className="px-5 py-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold">{driver.nombre}</div>

              {driver.firebaseCodigo ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-200">
                  <Link2 className="h-3.5 w-3.5" />
                  {driver.firebaseCodigo}
                </span>
              ) : null}

              <span
                className={cx(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                  badge.cls
                )}
              >
                {driver.status === 'FINALIZADA' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Truck className="h-3.5 w-3.5" />
                )}
                {badge.text}
              </span>

              {driver.inventoryOnly ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">
                  Pendiente de acceso móvil
                </span>
              ) : null}

              {driver.routeStatus ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/65">
                  <Route className="h-3.5 w-3.5" />
                  {driver.routeStatus}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 text-sm text-white/70 sm:grid-cols-2 lg:grid-cols-5">
              <InfoLine
                icon={<Clock className="h-4 w-4" />}
                label="Inicio"
                value={fmtTime(driver.inicioRutaAt)}
              />
              <InfoLine
                icon={<Flag className="h-4 w-4" />}
                label="Fin"
                value={fmtTime(driver.finRutaAt)}
              />
              <InfoLine
                icon={<Route className="h-4 w-4" />}
                label="Progreso"
                value={`${driver.entregasHechas}/${driver.entregasTotal} (${progress}%)`}
              />
              <InfoLine
                icon={<AlertCircle className="h-4 w-4" />}
                label="Pendientes"
                value={String(driver.entregasPendientes ?? 0)}
              />
              <InfoLine
                icon={<CalendarDays className="h-4 w-4" />}
                label="Km"
                value={kmText}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm lg:justify-end">
            <MoneyPill label="Esperado" value={fmtMoney(driver.totalEsperado)} />
            <MoneyPill label="Real" value={fmtMoney(driver.totalReal)} tone="wine" />
            <MoneyPill label="Canceladas" value={String(driver.canceladas ?? 0)} tone="neutral" />
          </div>
        </div>

        <UberProgress progress={progress} status={driver.status} />
      </div>
    </div>
  );
}

function UberProgress({
  progress,
  status,
}: {
  progress: number;
  status: DriverStatus;
}) {
  return (
    <div className="mt-1">
      <div className="relative h-12 w-full">
        <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-white/8 shadow-inner">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className={cx(
              'h-2 rounded-full',
              status === 'FINALIZADA'
                ? 'bg-emerald-400/75'
                : 'bg-gradient-to-r from-[#0B1C3A] via-[#144078] to-[#4DADFF]'
            )}
          />
        </div>

        <div className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/20 bg-[#0B1C3A]" />

        <div className="absolute right-0 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#4DADFF]/40 bg-[#071426]">
          <Flag className="h-3 w-3 text-[#B9E3FF]" />
        </div>

        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${progress}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#4DADFF]/35 bg-[#071426] p-2 shadow-[0_10px_30px_rgba(77,173,255,0.28)]"
          title={`${progress}% completado`}
        >
          <Truck className="h-4 w-4 text-[#B9E3FF]" />
        </motion.div>

        <div className="absolute -bottom-2 left-0 text-[10px] text-white/40">Inicio</div>
        <div className="absolute -bottom-2 right-0 text-[10px] text-white/40">Ruta Finalizada</div>
      </div>
    </div>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-white/45">{icon}</span>
      <span className="text-white/50">{label}:</span>
      <span className="font-medium text-white/80">{value}</span>
    </div>
  );
}

function MoneyPill({
  label,
  value,
  tone = 'blue',
}: {
  label: string;
  value: string;
  tone?: 'blue' | 'wine' | 'neutral';
}) {
  const cls =
    tone === 'wine'
      ? 'border-[#852838]/25 bg-[#852838]/10 text-[#F2B8C3]'
      : tone === 'neutral'
        ? 'border-white/15 bg-white/5 text-white/80'
        : 'border-[#4DADFF]/25 bg-[#4DADFF]/10 text-[#B9E3FF]';

  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs', cls)}>
      <span className="opacity-80">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}