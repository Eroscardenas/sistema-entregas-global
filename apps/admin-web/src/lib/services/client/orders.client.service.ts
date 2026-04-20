/* import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Order = import('@/lib/types/supabase').Database['public']['Tables']['customer_orders']['Row'];

export class OrdersClientService {
  constructor(private sb: SB) {}

  async create(input: {
    client_group_id?: string | null;
    client_id?: string | null;
    delivery_date?: string | null;
    delivery_time?: string | null;
    urgent?: boolean;
    special_instructions?: string | null;
    items: Array<{ product_id: string; quantity: number; unit_price: number }>;
  }) {
    const { data: order, error: e1 } = await this.sb
      .from('customer_orders')
      .insert({
        client_group_id: input.client_group_id ?? null,
        client_id: input.client_id ?? null,
        delivery_date: input.delivery_date ?? null,
        delivery_time: input.delivery_time ?? null,
        urgent: input.urgent ?? false,
        special_instructions: input.special_instructions ?? null,
        status: 'pending',
      })
      .select('*')
      .single();
    throwIfError(e1);

    const rows = input.items.map((it) => ({
      order_id: (order as Order).id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
    }));

    const { error: e2 } = await this.sb.from('order_items').insert(rows);
    throwIfError(e2);

    return order as Order;
  }
}
*/