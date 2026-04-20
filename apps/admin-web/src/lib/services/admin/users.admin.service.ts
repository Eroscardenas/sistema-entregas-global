import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['app_users']['Row'];

type Insert =
  import('@/lib/types/supabase').Database['public']['Tables']['app_users']['Insert'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['app_users']['Update'];

export class UsersAdminService {
  constructor(private sb: SB) {}

  async list(params?: { role?: string; active?: boolean }) {
    let q = this.sb
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (params?.role) q = q.eq('role', params.role);
    if (typeof params?.active === 'boolean') q = q.eq('active', params.active);

    const { data, error } = await q;
    throwIfError(error);
    return (data ?? []) as Row[];
  }

  /**
   * Crear usuario
   * NOTA: tu DB usa pin_hash (NO guardes PIN plano)
   */
  async create(input: {
    name: string;
    role: string;
    pin_hash?: string | null;
    email?: string | null;
    phone?: string | null;
    active?: boolean;
  }) {
    const payload: Insert = {
      name: input.name,
      role: input.role,
      pin_hash: input.pin_hash ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      active: input.active ?? true,
    };

    const { data, error } = await this.sb
      .from('app_users')
      .insert(payload)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async update(id: string, patch: Update) {
    const { data, error } = await this.sb
      .from('app_users')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async setActive(id: string, active: boolean) {
    return this.update(id, { active });
  }

  async setRole(id: string, role: string) {
    return this.update(id, { role });
  }

  async setPinHash(id: string, pin_hash: string | null) {
    return this.update(id, { pin_hash });
  }

  async delete(id: string) {
    // recomendado: soft delete con setActive(false)
    const { error } = await this.sb.from('app_users').delete().eq('id', id);
    throwIfError(error);
  }
}
