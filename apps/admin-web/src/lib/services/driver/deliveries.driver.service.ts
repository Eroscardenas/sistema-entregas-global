import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Delivery =
  import('@/lib/types/supabase').Database['public']['Tables']['deliveries']['Row'];

export class DeliveriesDriverService {
  constructor(private sb: SB) {}

  async listActive(driverId: string) {
    const { data: assignments, error: assignmentsError } = await this.sb
      .from('assignments')
      .select('id')
      .eq('driver_id', driverId)
      .in('status', ['ACTIVA', 'EN_RUTA'] as any);

    throwIfError(assignmentsError);

    const assignmentIds = (assignments ?? []).map((x) => x.id);

    if (assignmentIds.length === 0) {
      return [] as Delivery[];
    }

    const { data, error } = await this.sb
      .from('deliveries')
      .select('*')
      .in('assignment_id', assignmentIds)
      .in('status', ['assigned', 'in_progress'] as any)
      .order('created_at', { ascending: true });

    throwIfError(error);
    return (data ?? []) as Delivery[];
  }

  async getDetail(deliveryId: string) {
    const { data, error } = await this.sb
      .from('v_delivery_detail')
      .select('*')
      .eq('delivery_id', deliveryId)
      .single();

    throwIfError(error);
    return data;
  }

  async start(deliveryId: string) {
    const { data, error } = await this.sb
      .from('deliveries')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', deliveryId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Delivery;
  }

  async finish(deliveryId: string) {
    const { data, error } = await this.sb
      .from('deliveries')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', deliveryId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Delivery;
  }
}
