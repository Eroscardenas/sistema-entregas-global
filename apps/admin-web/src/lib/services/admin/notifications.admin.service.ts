import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['notifications']['Row'];

export class NotificationsAdminService {
  constructor(private sb: SB) {}

  async list(limit = 100) {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async listByProfile(profileId: string, limit = 50) {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('target_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async listByCustomer(customerId: string, limit = 50) {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('target_customer_id', customerId)
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
