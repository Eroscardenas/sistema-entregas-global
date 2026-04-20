// src/lib/types/dtos.ts

export type EquipmentCapacity = '20' | '40' | '50' | '60' | '100' | '150' | 'N/A';
export type ProductKind = 'bolsa' | 'barra';

/** Drivers */
export type CreateDriverInput = {
  nombre: string;
  telefono?: string | null;
  pin: string;
  activo?: boolean;
};

export type UpdateDriverInput = Partial<{
  nombre: string;
  telefono: string | null;
  pin: string;
  activo: boolean;
  current_status: 'available' | 'on_route' | 'offline';
}>;

/** Diners */
export type CreateDinerInput = {
  nombre: string;
  cantidad_clientes?: number;
  activo?: boolean;
};

export type UpdateDinerInput = Partial<{
  nombre: string;
  cantidad_clientes: number;
  activo: boolean;
}>;

/** Customers */
export type CreateCustomerInput = {
  nombre: string;
  telefono?: string | null;
  maps_url?: string | null;
  diner_id?: string | null;
  capacidad_equipo?: EquipmentCapacity;
  activo?: boolean;
};

export type UpdateCustomerInput = Partial<{
  nombre: string;
  telefono: string | null;
  maps_url: string | null;
  diner_id: string | null;
  capacidad_equipo: EquipmentCapacity;
  activo: boolean;
}>;

/** Products */
export type CreateProductInput = {
  nombre: string;
  kind: ProductKind;
  ice_type?: string;
  kg_por_unidad: number;
  precio_base?: number;
  stock_actual?: number;
  active?: boolean;
};

export type UpdateProductInput = Partial<{
  nombre: string;
  kind: ProductKind;
  ice_type: string;
  kg_por_unidad: number;
  precio_base: number;
  stock_actual: number;
  active: boolean;
}>;

/** Orders */
export type CreateOrderItemInput = {
  product_id: string;
  qty: number;
  precio_aplicado: number;
};

export type CreateOrderInput = {
  customer_id: string;
  notes?: string | null;
  items: CreateOrderItemInput[];
};

/** Deliveries */
export type ConfirmDeliveryItemInput = {
  product_id: string;
  qty_real: number;
};

export type ConfirmDeliveryInput = {
  delivery_id: string;
  items: ConfirmDeliveryItemInput[];
  payment_method?: 'EFECTIVO' | 'CREDITO';
};