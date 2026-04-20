import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row = import('@/lib/types/supabase').Database['public']['Tables']['client_requests']['Row'];

export class ClientRequestsAdminService {
  constructor(private sb: SB) {}

  async list(params?: { status?: Row['status'] }) {
    const q = this.sb.from('client_requests').select('*').order('requested_at', { ascending: false });
    if (params?.status) q.eq('status', params.status);
    const { data, error } = await q;
    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async update(id: string, patch: Partial<Row>) {
    const { data, error } = await this.sb.from('client_requests').update(patch).eq('id', id).select('*').single();
    throwIfError(error);
    return data as Row;
  }

  async setStatus(id: string, status: Row['status'], processedBy?: string | null) {
    return this.update(id, {
      status,
      processed_by: processedBy ?? null,
      processed_at: new Date().toISOString(),
    } as any);
  }
}
