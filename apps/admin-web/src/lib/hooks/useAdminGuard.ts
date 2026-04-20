'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { PATHS } from '@/lib/constants/paths';

type AdminProfileRow = {
  id: string;
  role: string;
  nombre: string;
  activo: boolean;
};

export type AdminUser = {
  id: string;
  role: string;
  nombre: string;
  activo: boolean;
  email: string | null;
};

function isAdminRole(role: string | null | undefined) {
  return role === 'admin';
}

async function fetchAdminProfileById(userId: string) {
  const { data, error } = await supabaseBrowser
    .from('profiles')
    .select('id, role, nombre, activo')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as AdminProfileRow | null;
}

export function useAdminGuard() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setLoading(true);

        const { data, error } = await supabaseBrowser.auth.getSession();
        if (error) throw error;

        const sessionUser = data.session?.user ?? null;
        const userId = sessionUser?.id ?? null;
        const email = sessionUser?.email ?? null;

        if (!userId) {
          if (pathname?.startsWith('/admin') && pathname !== '/admin/login') {
            router.replace('/admin/login');
          }

          if (alive) {
            setAdminUser(null);
            setLoading(false);
          }
          return;
        }

        const profile = await fetchAdminProfileById(userId);

        if (!profile || profile.activo === false || !isAdminRole(profile.role)) {
          await supabaseBrowser.auth.signOut();

          if (pathname?.startsWith('/admin') && pathname !== '/admin/login') {
            router.replace('/admin/login');
          }

          if (alive) {
            setAdminUser(null);
            setLoading(false);
          }
          return;
        }

        const normalizedAdminUser: AdminUser = {
          id: profile.id,
          role: profile.role,
          nombre: profile.nombre,
          activo: profile.activo,
          email,
        };

        if (pathname === '/admin/login') {
          router.replace(PATHS.admin.dashboard);
        }

        if (alive) {
          setAdminUser(normalizedAdminUser);
          setLoading(false);
        }
      } catch {
        await supabaseBrowser.auth.signOut();

        if (pathname?.startsWith('/admin') && pathname !== '/admin/login') {
          router.replace('/admin/login');
        }

        if (alive) {
          setAdminUser(null);
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      alive = false;
    };
  }, [router, pathname]);

  return useMemo(
    () => ({
      loading,
      adminUser,
      isAuthed: !!adminUser,
    }),
    [loading, adminUser]
  );
}