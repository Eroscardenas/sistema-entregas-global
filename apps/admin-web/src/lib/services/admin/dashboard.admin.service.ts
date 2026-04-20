import type { SB } from '../_sb';
import { throwIfError } from '../_errors';
import { isoDate } from '../_helpers';

export class DashboardAdminService {
  constructor(private sb: SB) {}

  async summary() {
    // ✅ en tus types existe: v_admin_dashboard
    const { data, error } = await this.sb
      .from('v_admin_dashboard')
      .select('*')
      .single();

    throwIfError(error);
    return data;
  }

  async liveRoutes(date = isoDate()) {
    // ✅ en tus types NO existe delivery_route_progress_view
    // así que lo sacamos de la tabla delivery_route_progress + join a drivers
    // (y si luego quieres una view "v_live_routes", la creamos y regeneras types)

    const { data, error } = await this.sb
      .from('delivery_route_progress')
      .select(
        `
        *,
        drivers:driver_id (
          id,
          first_name,
          last_name,
          verification_code,
          current_status
        )
      `
      )
      .eq('route_date', date)
      .order('updated_at', { ascending: false });

    throwIfError(error);
    return data ?? [];
  }
}
