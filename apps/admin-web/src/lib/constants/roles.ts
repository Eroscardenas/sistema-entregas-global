export const ROLES = ['admin', 'driver', 'customer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  driver: 'Chofer',
  customer: 'Cliente',
};
