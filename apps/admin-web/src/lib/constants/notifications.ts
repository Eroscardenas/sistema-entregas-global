export const NOTIFICATION_TYPES = [
  'new_order',
  'order_status',
  'new_customer_request',
  'delivery_update',
  'route_started',
  'route_finished',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  new_order: 'Nuevo pedido',
  order_status: 'Estatus pedido',
  new_customer_request: 'Nuevo cliente',
  delivery_update: 'Actualización entrega',
  route_started: 'Ruta iniciada',
  route_finished: 'Ruta finalizada',
  system: 'Sistema',
};
