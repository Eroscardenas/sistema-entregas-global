import type { EquipmentCapacity } from '@/lib/types/enums';

export type CustomerDTO = {
  id: string;
  diner_id: string | null;
  nombre: string;
  telefono: string | null;
  maps_url: string | null;
  capacidad_equipo: EquipmentCapacity;
  activo: boolean;
};
