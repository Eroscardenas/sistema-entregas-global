'use client';

// app/admin/dashboard/layout.tsx
// ✅ Layout Admin (Global Ice)
// ✅ Badges realtime para:
// - Solicitudes: new_customer_requests con status = NUEVO
// - Pedidos: public_order_requests con status = NUEVO
// ✅ Compatible con tu flujo sin login cliente
// ✅ Protegido con useAdminGuard()
// ✅ Logout con useAdminAuth().signOut()

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

import {
  LayoutDashboard,
  Users,
  Truck,
  Boxes,
  Bell,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Snowflake
} from 'lucide-react';

import { PATHS } from '@/lib/constants/paths';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { useAdminAuth } from '@/lib/hooks/useAdminAuth';
import { supabase } from '@/lib/supabase/client';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  hint?: string;
  badge?: number;
};

type BadgeState = {
  nuevosClientes: number;
  pedidos: number;
};

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const guard = useAdminGuard();
  const { signOut } = useAdminAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [badgeLoading, setBadgeLoading] = useState(true);
  const [badges, setBadges] = useState<BadgeState>({
    nuevosClientes: 0,
    pedidos: 0,
  });

  const sb = supabase as any;

  const adminName = useMemo(() => {
    const n = guard.adminUser?.nombre?.trim();
    if (n) return n;
    const email = guard.adminUser?.email?.trim();
    if (email) return email.split('@')[0];
    return 'Administrador';
  }, [guard.adminUser]);

  const loadBadges = async () => {
    try {
      setBadgeLoading(true);

      const [{ count: customerCount, error: customerError }, { count: orderCount, error: orderError }] =
        await Promise.all([
          sb
            .from('new_customer_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'NUEVO'),
          sb
            .from('public_order_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'NUEVO'),
        ]);

      if (customerError) throw customerError;
      if (orderError) throw orderError;

      setBadges({
        nuevosClientes: Number(customerCount ?? 0),
        pedidos: Number(orderCount ?? 0),
      });
    } catch (error) {
      console.error('Error loading admin badges:', error);
      setBadges({
        nuevosClientes: 0,
        pedidos: 0,
      });
    } finally {
      setBadgeLoading(false);
    }
  };

  useEffect(() => {
    if (!guard.loading && guard.isAuthed) {
      void loadBadges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard.loading, guard.isAuthed]);

  useEffect(() => {
    if (!guard.isAuthed) return;

    const channelRequests = sb
      .channel('admin-layout-new-customer-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'new_customer_requests' },
        () => {
          void loadBadges();
        },
      )
      .subscribe();

    const channelOrders = sb
      .channel('admin-layout-public-order-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'public_order_requests' },
        () => {
          void loadBadges();
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channelRequests);
      void sb.removeChannel(channelOrders);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard.isAuthed]);

  const nav: NavItem[] = useMemo(
    () => [
      {
        label: 'Dashboard',
        href: PATHS.admin.dashboard,
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        label: 'Clientes',
        href: PATHS.admin.clientes,
        icon: <Users className="h-4 w-4" />,
      },
      {
        label: 'Choferes',
        href: PATHS.admin.choferes,
        icon: <Truck className="h-4 w-4" />,
      },
      {
        label: 'Productos',
        href: PATHS.admin.productos,
        icon: <Boxes className="h-4 w-4" />,
      },
      {
        label: 'Solicitudes',
        href: PATHS.admin.nuevosClientes,
        icon: <Bell className="h-4 w-4" />,
        badge: badges.nuevosClientes,
      },
      {
        label: 'Pedidos',
        href: PATHS.admin.pedidos,
        icon: <ShoppingCart className="h-4 w-4" />,
        badge: badges.pedidos,
      },
      {
        label: 'Asignaciones',
        href: PATHS.admin.asignaciones,
        icon: <ClipboardList className="h-4 w-4" />,
        hint: 'Asignar carga + entregas por chofer (día)',
      },
      {
        label: 'Reportes',
        href: PATHS.admin.reportes,
        icon: <BarChart3 className="h-4 w-4" />,
      },
    ],
    [badges.nuevosClientes, badges.pedidos],
  );

  const active = useMemo(
    () => nav.find((x) => pathname === x.href) ?? null,
    [nav, pathname],
  );

  const totalPending = badges.nuevosClientes + badges.pedidos;

  async function onLogout() {
    setBusy(true);
    try {
      await signOut();
      router.replace('/admin/login');
    } finally {
      setBusy(false);
    }
  }

  if (guard.loading) {
    return (
      <div className="min-h-[100svh] bg-[#070B18] text-white">
        <BackgroundFX />
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl items-center justify-center px-4">
          <Skeleton />
        </div>
      </div>
    );
  }

  if (!guard.isAuthed) return null;

  return (
    <div className="min-h-[100svh] bg-[#070B18] text-white">
      <BackgroundFX />

      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#070B18]/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/8 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-white/12 bg-white/8">
              <Image
                src="/global_ice.png"
                alt="Global Ice"
                fill
                priority
                className="object-contain p-2"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight">
                  Global Ice • Panel Administrativo
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#4DADFF]" />
                  {adminName}
                </span>

                {totalPending > 0 ? (
                  <span className="hidden sm:inline-flex items-center rounded-full border border-[#852838]/25 bg-[#852838]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#F2B8C3]">
                    {totalPending} pendiente{totalPending === 1 ? '' : 's'}
                  </span>
                ) : null}

                {badgeLoading ? (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    sincronizando
                  </span>
                ) : null}
              </div>

              <div className="text-xs text-white/55 truncate">
                {guard.adminUser?.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            disabled={busy}
            className={cx(
              'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition',
              busy
                ? 'cursor-not-allowed bg-white/10 text-white/40'
                : 'bg-gradient-to-r from-blue-900 to-blue-800 hover:brightness-110',
            )}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{busy ? 'Saliendo…' : 'Salir'}</span>
          </button>
        </div>
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[320px_1fr] lg:px-6">
        <aside className="hidden lg:block">
          <GlassPanel className="p-4">

            <div className="mt-4 space-y-2">
              {nav.map((item) => (
                <NavButton
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onClick={() => router.push(item.href)}
                />
              ))}
            </div>

          </GlassPanel>
        </aside>

        <main className="min-w-0 space-y-4">{children}</main>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/55"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: -340 }}
              animate={{ x: 0 }}
              exit={{ x: -340 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute left-0 top-0 h-full w-[340px] border-r border-white/10 bg-[#070B18]/85 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-white/12 bg-white/8">
                    <Image
                      src="/global_ice.png"
                      alt="Global Ice"
                      fill
                      priority
                      className="object-contain p-2"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Menú Admin</div>
                    <div className="text-xs text-white/55 truncate">{adminName}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/8"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-3 space-y-2">
                {nav.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push(item.href);
                    }}
                    className={cx(
                      'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                      pathname === item.href
                        ? 'border-[#4DADFF]/25 bg-[#4DADFF]/10 text-[#B9E3FF]'
                        : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/8',
                    )}
                  >
                    <span className="inline-flex w-full items-center justify-between">
                      <span className="inline-flex items-center gap-2">
                        {item.icon}
                        {item.label}
                        {typeof item.badge === 'number' && item.badge > 0 ? (
                          <span className="ml-2 inline-flex items-center rounded-full border border-[#852838]/25 bg-[#852838]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F2B8C3]">
                            {item.badge}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="h-4 w-4 text-white/50" />
                    </span>
                    {item.hint ? (
                      <div className="mt-1 text-xs text-white/55">{item.hint}</div>
                    ) : null}
                  </button>
                ))}

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/55">
                    Avisos
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                      <span className="text-white/75">Solicitudes nuevas</span>
                      <span className="font-bold text-white">{badges.nuevosClientes}</span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                      <span className="text-white/75">Pedidos nuevos</span>
                      <span className="font-bold text-white">{badges.pedidos}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-center text-xs text-white/35">
                  Global Ice • Panel Administrativo
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
        active
          ? 'border-[#4DADFF]/25 bg-[#4DADFF]/10 text-[#B9E3FF]'
          : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/8',
      )}
      title={item.label}
    >
      <span className="inline-flex w-full items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span className={cx(active ? 'text-[#B9E3FF]' : 'text-white/75')}>
            {item.icon}
          </span>
          <span className="font-semibold">{item.label}</span>

          {typeof item.badge === 'number' && item.badge > 0 ? (
            <span className="ml-2 inline-flex items-center rounded-full border border-[#852838]/25 bg-[#852838]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F2B8C3]">
              {item.badge}
            </span>
          ) : null}
        </span>

        <ChevronRight
          className={cx('h-4 w-4', active ? 'text-white/70' : 'text-white/45')}
        />
      </span>

      {item.hint ? <div className="mt-1 text-xs text-white/55">{item.hint}</div> : null}
    </button>
  );
}

function BackgroundFX() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_18%_22%,rgba(77,173,255,0.22),transparent_60%),radial-gradient(780px_520px_at_85%_15%,rgba(133,40,56,0.18),transparent_60%),radial-gradient(900px_560px_at_50%_95%,rgba(20,64,120,0.22),transparent_60%)]" />
      <motion.div
        animate={{ opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-1/2 top-[-320px] h-[820px] w-[820px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
      />
      <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
    </div>
  );
}

function GlassPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-3xl border border-white/12 bg-white/6 backdrop-blur-xl',
        'shadow-[0_28px_90px_rgba(0,0,0,0.45)]',
        className,
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

function Skeleton() {
  return (
    <div className="w-full max-w-md rounded-3xl border border-white/12 bg-white/6 p-7 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
      <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
      <div className="mt-3 h-3 w-64 animate-pulse rounded bg-white/10" />
      <div className="mt-6 h-10 w-full animate-pulse rounded-2xl bg-white/10" />
      <div className="mt-3 h-10 w-full animate-pulse rounded-2xl bg-white/10" />
    </div>
  );
}