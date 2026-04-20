import type { SB } from '../_sb';
import { throwIfError } from '../_errors';
import { isoDate } from '../_helpers';

type Assignment = import('@/lib/types/supabase').Database['public']['Tables']['driver_assignments']['Row'];
type Item = import('@/lib/types/supabase').Database['public']['Tables']['assignment_items']['Row'];

export class AssignmentsAdminService {
  constructor(private sb: SB) {}

  async create(input: { driver_id: string; date?: string; notes?: string | null; assigned_by?: string | null }) {
    const { data, error } = await this.sb
      .from('driver_assignments')
      .insert({
        driver_id: input.driver_id,
        assignment_date: input.date ?? isoDate(),
        status: 'pending',
        notes: input.notes ?? null,
        assigned_by: input.assigned_by ?? null,
      })
      .select('*')
      .single();
    throwIfError(error);
    return data as Assignment;
  }

  async listByDate(date = isoDate()) {
    const { data, error } = await this.sb
      .from('driver_assignments')
      .select('*')
      .eq('assignment_date', date)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return (data ?? []) as Assignment[];
  }

  async listByDriver(driverId: string, date = isoDate()) {
    const { data, error } = await this.sb
      .from('driver_assignments')
      .select('*')
      .eq('driver_id', driverId)
      .eq('assignment_date', date)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return (data ?? []) as Assignment[];
  }

  async items(assignmentId: string) {
    const { data, error } = await this.sb.from('assignment_items').select('*').eq('assignment_id', assignmentId);
    throwIfError(error);
    return (data ?? []) as Item[];
  }

  async addItem(input: { assignment_id: string; product_id: string; quantity: number; unit_weight: number }) {
    const { data, error } = await this.sb
      .from('assignment_items')
      .insert({
        assignment_id: input.assignment_id,
        product_id: input.product_id,
        quantity: input.quantity,
        unit_weight: input.unit_weight,
      })
      .select('*')
      .single();
    throwIfError(error);
    return data as Item;
  }

  async setStatus(id: string, status: Assignment['status']) {
    const { data, error } = await this.sb
      .from('driver_assignments')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    throwIfError(error);
    return data as Assignment;
  }
}
