import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['notifications']['Row'];

export class NotificationsDriverService {
  constructor(private sb: SB) {}

  async listByUser(userId: string, limit = 50) {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('target_profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async listByDriver(driverId: string, limit = 50) {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('target_driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async markRead(id: string) {
    const { data, error } = await this.sb
      .from('notifications')
      .update({ read: true } as any)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }
}
