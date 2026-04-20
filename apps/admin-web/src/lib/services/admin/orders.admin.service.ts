import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Order = import('@/lib/types/supabase').Database['public']['Tables']['customer_orders']['Row'];
type Item = import('@/lib/types/supabase').Database['public']['Tables']['order_items']['Row'];

export class OrdersAdminService {
  constructor(private sb: SB) {}

  async list(params?: { status?: Order['status']; urgent?: boolean }) {
    const q = this.sb.from('customer_orders').select('*').order('created_at', { ascending: false });
    if (params?.status) q.eq('status', params.status);
    if (typeof params?.urgent === 'boolean') q.eq('urgent', params.urgent);
    const { data, error } = await q;
    throwIfError(error);
    return (data ?? []) as Order[];
  }

  async get(orderId: string) {
    const { data, error } = await this.sb.from('customer_orders').select('*').eq('id', orderId).single();
    throwIfError(error);
    return data as Order;
  }

  async items(orderId: string) {
    const { data, error } = await this.sb.from('order_items').select('*').eq('order_id', orderId);
    throwIfError(error);
    return (data ?? []) as Item[];
  }

  async setStatus(orderId: string, status: Order['status']) {
    const { data, error } = await this.sb
      .from('customer_orders')
      .update({ status })
      .eq('id', orderId)
      .select('*')
      .single();
    throwIfError(error);
    return data as Order;
  }
}
