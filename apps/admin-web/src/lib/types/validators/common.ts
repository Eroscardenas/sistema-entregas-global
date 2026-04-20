import { z } from 'zod';
import { EQUIPMENT_CAPACITY, PRODUCT_KIND, ORDER_STATUS, ASSIGNMENT_STATUS, ROUTE_STATUS, DELIVERY_STATUS, ICE_TYPES } from '@/lib/constants';

export const zUuid = z.string().uuid();

export const zPhone = z
  .string()
  .trim()
  .min(7, 'Teléfono muy corto')
  .max(20, 'Teléfono muy largo')
  .optional()
  .nullable();

export const zMapsUrl = z
  .string()
  .trim()
  .max(500, 'URL demasiado larga')
  .url('URL inválida')
  .optional()
  .nullable();

export const zEquipmentCapacity = z.enum(EQUIPMENT_CAPACITY);

export const zProductKind = z.enum(PRODUCT_KIND);

// Si quieres permitir texto libre: cambia a z.string().min(1)
// Para MVP PRO: controlado en UI:
export const zIceType = z.enum(ICE_TYPES).or(z.string().min(1));

export const zOrderStatus = z.enum(ORDER_STATUS);
export const zAssignmentStatus = z.enum(ASSIGNMENT_STATUS);
export const zRouteStatus = z.enum(ROUTE_STATUS);
export const zDeliveryStatus = z.enum(DELIVERY_STATUS);
