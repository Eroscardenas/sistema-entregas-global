import {
  ROLES,
  PRODUCT_KIND,
  ICE_TYPES,
  EQUIPMENT_CAPACITY,
  ORDER_STATUS,
  ASSIGNMENT_STATUS,
  ROUTE_STATUS,
  DELIVERY_STATUS,
  NOTIFICATION_TYPES,
} from '@/lib/constants';

export type Role = (typeof ROLES)[number];

export type ProductKind = (typeof PRODUCT_KIND)[number];
export type IceType = (typeof ICE_TYPES)[number];

export type EquipmentCapacity = (typeof EQUIPMENT_CAPACITY)[number];

export type OrderStatus = (typeof ORDER_STATUS)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number];
export type RouteStatus = (typeof ROUTE_STATUS)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUS)[number];

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
