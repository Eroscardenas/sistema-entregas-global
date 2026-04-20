export type DriverStatus = 'available' | 'on_route' | 'offline' | string;

export type DriverRow = {
  id: string;
  profile_id: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  current_status: DriverStatus;
  created_at: string;
  updated_at: string;

  profiles?: { id: string; role: string; nombre: string; activo: boolean } | null;
};