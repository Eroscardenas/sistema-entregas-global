import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['drivers']['Row'];

type Insert =
  import('@/lib/types/supabase').Database['public']['Tables']['drivers']['Insert'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['drivers']['Update'];

export class DriversAdminService {
  constructor(private sb: SB) {}

  /**
   * Listar choferes
   */
  async list(params?: { activo?: boolean; current_status?: string }) {
    let q = this.sb
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });

    if (params?.activo !== undefined) {
      q = q.eq('activo', params.activo);
    }

    if (params?.current_status) {
      q = q.eq('current_status', params.current_status);
    }

    const { data, error } = await q;
    throwIfError(error);
    return (data ?? []) as Row[];
  }

  /**
   * Crear chofer
   * NOTA: pin_hash debe venir ya hasheado (no guardes PIN plano)
   */
  async create(input: {
    nombre: string;
    profile_id: string;
    pin_hash: string;
    telefono?: string | null;
  }) {
    const payload: Insert = {
      nombre: input.nombre,
      profile_id: input.profile_id,
      pin_hash: input.pin_hash,
      telefono: input.telefono ?? null,
      activo: true,
      current_status: 'available',
    };

    const { data, error } = await this.sb
      .from('drivers')
      .insert(payload)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  /**
   * Actualizar chofer
   */
  async update(id: string, patch: Update) {
    const { data, error } = await this.sb
      .from('drivers')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  /**
   * Activar / desactivar
   */
  async setActivo(id: string, activo: boolean) {
    return this.update(id, { activo });
  }

  /**
   * Cambiar estado operativo (available, on_route, etc)
   */
  async setCurrentStatus(id: string, current_status: string) {
    return this.update(id, { current_status });
  }

  /**
   * Eliminar (soft delete recomendado → usar setActivo(false))
   */
  async delete(id: string) {
    const { error } = await this.sb.from('drivers').delete().eq('id', id);
    throwIfError(error);
  }
}
