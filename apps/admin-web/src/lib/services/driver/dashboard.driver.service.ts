import type { SB } from '../_sb';
import { throwIfError } from '../_errors';
import { isoDate } from '../_helpers';

type DriverDashboard =
  import('@/lib/types/supabase').Database['public']['Views']['v_driver_dashboard_today']['Row'];

type DriverDeliveryToday =
  import('@/lib/types/supabase').Database['public']['Views']['v_driver_deliveries_today']['Row'];

type RouteProgress =
  import('@/lib/types/supabase').Database['public']['Tables']['delivery_route_progress']['Row'];

export class DashboardDriverService {
  constructor(private sb: SB) {}

  /**
   * Dashboard del chofer (hoy)
   * Usa la view REAL tipada: v_driver_dashboard_today
   */
  async dashboard(driverId: string) {
    const { data, error } = await this.sb
      .from('v_driver_dashboard_today')
      .select('*')
      .eq('driver_id', driverId)
      .maybeSingle();

    throwIfError(error);
    return (data ?? null) as DriverDashboard | null;
  }

  /**
   * Progreso de ruta del chofer (hoy) desde tabla real
   * (tu types no tiene delivery_route_progress_view)
   */
  async routeProgress(driverId: string, date = isoDate()) {
    const { data, error } = await this.sb
      .from('delivery_route_progress')
      .select('*')
      .eq('driver_id', driverId)
      .eq('route_date', date)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    throwIfError(error);
    return (data ?? null) as RouteProgress | null;
  }

  /**
   * Entregas del día (para lista en app del chofer)
   * Usa view REAL: v_driver_deliveries_today
   */
  async deliveriesToday(driverId: string) {
    const { data, error } = await this.sb
      .from('v_driver_deliveries_today')
      .select('*')
      .eq('driver_id', driverId)
      .order('delivery_order', { ascending: true });

    throwIfError(error);
    return (data ?? []) as DriverDeliveryToday[];
  }
}
