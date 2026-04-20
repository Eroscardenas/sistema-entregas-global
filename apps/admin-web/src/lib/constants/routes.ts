export const ROUTE_STATUS = ['NO_INICIADA', 'EN_RUTA', 'FINALIZADA'] as const;
export type RouteStatus = (typeof ROUTE_STATUS)[number];

export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  NO_INICIADA: 'No iniciada',
  EN_RUTA: 'En ruta',
  FINALIZADA: 'Finalizada',
};

export const ROUTE_RULES = {
  KM_MIN: 0,
  KM_MAX: 9999999,
} as const;
