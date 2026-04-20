import { z } from 'zod';
import { DELIVERY_RULES } from '@/lib/constants';
import { zUuid } from './common';

export const DeliveryConfirmItemSchema = z.object({
  product_id: zUuid,
  qty_real: z.number().int().min(DELIVERY_RULES.MIN_QTY_REAL).max(DELIVERY_RULES.MAX_QTY_REAL),
});

export const DeliveryConfirmSchema = z.object({
  delivery_id: zUuid,
  items: z.array(DeliveryConfirmItemSchema).min(1),
});

export const DeliveryCancelSchema = z.object({
  delivery_id: zUuid,
  reason: z.string().trim().min(2).max(DELIVERY_RULES.CANCEL_REASON_MAX),
});

export type DeliveryConfirmInput = z.infer<typeof DeliveryConfirmSchema>;
export type DeliveryCancelInput = z.infer<typeof DeliveryCancelSchema>;
