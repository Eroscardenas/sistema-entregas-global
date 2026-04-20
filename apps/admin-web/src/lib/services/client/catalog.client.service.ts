/*import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

export class CatalogClientService {
  constructor(private sb: SB) {}

  async products() {
    const { data, error } = await this.sb.from('products').select('*').eq('active', true).order('name');
    throwIfError(error);
    return data ?? [];
  }

  async groupPrices(groupId: string) {
    const { data, error } = await this.sb.from('client_groups_view').select('*').eq('id', groupId).single();
    throwIfError(error);
    return data; // incluye product_prices json
  }
}
  */
