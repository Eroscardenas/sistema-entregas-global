'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAdminGuard } from '@/lib/hooks/useAdminGuard';
import { useAdminAuth } from '@/lib/hooks/useAdminAuth';
import { PATHS } from '@/lib/constants/paths';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-neutral-800 animate-pulse" />
          <div className="flex-1">
            <div className="h-3 w-40 rounded bg-neutral-800 animate-pulse" />
            <div className="mt-2 h-3 w-56 rounded bg-neutral-800 animate-pulse" />
          </div>
        </div>
        <div className="mt-6 h-10 w-full rounded-xl bg-neutral-800 animate-pulse" />
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const guard = useAdminGuard();
  const { signOut, loading: signingOut } = useAdminAuth();

  const isLogin = pathname === '/admin/login';

  if (!isLogin && guard.loading) return <LoadingScreen />;

  if (isLogin) {
    return <>{children}</>;
  }

  if (!guard.isAuthed) return <LoadingScreen />;

  const name =
    guard.adminUser?.nombre?.trim() ||
    guard.adminUser?.email?.split('@')[0] ||
    'Admin';

  const email = guard.adminUser?.email ?? '';

  async function onLogout() {
    const res = await signOut();
    if (res.ok) router.replace('/admin/login');
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 font-bold text-neutral-950">
              A
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Panel Admin</div>
              <div className="text-xs text-neutral-400">Sistema de Entregas</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{name}</div>
              <div className="text-xs text-neutral-400">{email}</div>
            </div>

            <button
              type="button"
              onClick={() => router.push(PATHS.admin.dashboard)}
              className="hidden rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm hover:bg-neutral-900 sm:inline-flex"
            >
              Dashboard
            </button>

            <button
              type="button"
              onClick={onLogout}
              disabled={signingOut}
              className={cx(
                'rounded-xl px-3 py-2 text-sm font-medium transition',
                signingOut
                  ? 'cursor-not-allowed bg-neutral-800 text-neutral-500'
                  : 'bg-neutral-100 text-neutral-950 hover:bg-white',
              )}
            >
              {signingOut ? 'Saliendo…' : 'Salir'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}