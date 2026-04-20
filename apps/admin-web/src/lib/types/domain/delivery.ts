import type { DeliveryStatus } from '@/lib/types/enums';

export type DeliveryItemDTO = {
  product_id: string;
  qty_assigned: number;
  qty_real: number | null;
  precio_aplicado: number;
  subtotal_expected: number;
  subtotal_real: number;
};

export type DeliveryDTO = {
  id: string;
  assignment_id: string;
  route_id: string | null;
  customer_id: string;
  order_id: string | null;
  folio: string;
  status: DeliveryStatus;
  delivered_at: string | null;

  customer_nombre_snapshot: string | null;
  diner_nombre_snapshot: string | null;
  maps_url_snapshot: string | null;

  total_expected: number;
  total_real: number;
};
