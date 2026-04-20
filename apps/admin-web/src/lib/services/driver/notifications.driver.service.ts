import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['notifications']['Row'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['notifications']['Update'];

export class NotificationsDriverService {
  constructor(private sb: SB) {}

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

  async unread(userId: string, limit = 100) {
    if (!userId) throw new Error('userId requerido');

    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async unreadCount(userId: string) {
    if (!userId) throw new Error('userId requerido');

    const { count, error } = await this.sb
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    throwIfError(error);
    return count ?? 0;
  }

  async markAsRead(id: string) {
    const patch: Update = { read: true };

    const { data, error } = await this.sb
      .from('notifications')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async markAllAsRead(userId: string) {
    const patch: Update = { read: true };

    const { error } = await this.sb
      .from('notifications')
      .update(patch)
      .eq('user_id', userId)
      .eq('read', false);

    throwIfError(error);
  }

  async delete(id: string) {
    const { error } = await this.sb.from('notifications').delete().eq('id', id);
    throwIfError(error);
  }
}
