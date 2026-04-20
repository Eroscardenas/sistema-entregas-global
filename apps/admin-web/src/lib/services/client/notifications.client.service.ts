import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['notifications']['Row'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['notifications']['Update'];

export class NotificationsClientService {
  constructor(private sb: SB) {}

  /**
   * Listar notificaciones del usuario
   */
  async list(userId: string, limit = 50) {
    if (!userId) throw new Error('userId requerido');

    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  /**
   * Obtener no leídas
   */
  async unread(userId: string) {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  /**
   * Marcar una como leída
   */
  async markAsRead(id: string) {
    const payload: Update = {
      read: true,
    };

    const { data, error } = await this.sb
      .from('notifications')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  /**
   * Marcar todas como leídas
   */
  async markAllAsRead(userId: string) {
    const payload: Update = {
      read: true,
    };

    const { error } = await this.sb
      .from('notifications')
      .update(payload)
      .eq('user_id', userId)
      .eq('read', false);

    throwIfError(error);
  }

  /**
   * Eliminar notificación
   */
  async delete(id: string) {
    const { error } = await this.sb
      .from('notifications')
      .delete()
      .eq('id', id);

    throwIfError(error);
  }
}
