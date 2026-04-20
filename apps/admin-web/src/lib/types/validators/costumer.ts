import { z } from 'zod';
import { CUSTOMER_RULES } from '@/lib/constants';
import { zEquipmentCapacity, zMapsUrl, zPhone, zUuid } from './common';

export const CustomerCreateSchema = z.object({
  diner_id: zUuid.optional().nullable(),
  nombre: z.string().trim().min(CUSTOMER_RULES.NAME_MIN).max(CUSTOMER_RULES.NAME_MAX),
  telefono: zPhone,
  maps_url: zMapsUrl,
  capacidad_equipo: zEquipmentCapacity.default('N/A'),
  activo: z.boolean().default(true),
});

export const CustomerUpdateSchema = CustomerCreateSchema.partial().extend({
  id: zUuid,
});

export type CustomerCreateInput = z.infer<typeof CustomerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateSchema>;
