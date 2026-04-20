import type { OrderStatus } from '@/lib/types/enums';

export type OrderItemDTO = {
  product_id: string;
  qty: number;
  precio_aplicado: number;
};

export type OrderDTO = {
  id: string;
  customer_id: string;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
};
