export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: 'admin' | 'driver' | 'customer';
          nombre: string;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: 'admin' | 'driver' | 'customer';
          nombre: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: 'admin' | 'driver' | 'customer';
          nombre?: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      drivers: {
        Row: {
          id: string;
          profile_id: string;
          nombre: string;
          pin_hash: string;
          telefono: string | null;
          activo: boolean;
          current_status: 'available' | 'on_route' | 'offline';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          nombre: string;
          pin_hash: string;
          telefono?: string | null;
          activo?: boolean;
          current_status?: 'available' | 'on_route' | 'offline';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          nombre?: string;
          pin_hash?: string;
          telefono?: string | null;
          activo?: boolean;
          current_status?: 'available' | 'on_route' | 'offline';
          created_at?: string;
          updated_at?: string;
        };
      };

      diners: {
        Row: {
          id: string;
          nombre: string;
          cantidad_clientes: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          cantidad_clientes?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          cantidad_clientes?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      customers: {
        Row: {
          id: string;
          profile_id: string | null;
          diner_id: string | null;
          nombre: string;
          telefono: string | null;
          maps_url: string | null;
          capacidad_equipo: '20' | '40' | '50' | '60' | '100' | '150' | 'N/A';
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          diner_id?: string | null;
          nombre: string;
          telefono?: string | null;
          maps_url?: string | null;
          capacidad_equipo?: '20' | '40' | '50' | '60' | '100' | '150' | 'N/A';
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          diner_id?: string | null;
          nombre?: string;
          telefono?: string | null;
          maps_url?: string | null;
          capacidad_equipo?: '20' | '40' | '50' | '60' | '100' | '150' | 'N/A';
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      products: {
        Row: {
          id: string;
          nombre: string;
          kind: 'bolsa' | 'barra';
          ice_type: string;
          kg_por_unidad: number;
          precio_base: number;
          stock_actual: number;
          active: boolean;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          kind: 'bolsa' | 'barra';
          ice_type?: string;
          kg_por_unidad: number;
          precio_base?: number;
          stock_actual?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          kind?: 'bolsa' | 'barra';
          ice_type?: string;
          kg_por_unidad?: number;
          precio_base?: number;
          stock_actual?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      customer_products: {
        Row: {
          id: string;
          customer_id: string;
          product_id: string;
          precio_override: number | null;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          product_id: string;
          precio_override?: number | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          product_id?: string;
          precio_override?: number | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      new_customer_requests: {
        Row: {
          id: string;
          nombre: string;
          telefono: string | null;
          maps_url: string | null;
          factura_comedor: boolean;
          comedor_nombre: string | null;
          notes: string | null;
          status: 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO';
          reviewed_at: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          telefono?: string | null;
          maps_url?: string | null;
          factura_comedor?: boolean;
          comedor_nombre?: string | null;
          notes?: string | null;
          status?: 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO';
          reviewed_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          telefono?: string | null;
          maps_url?: string | null;
          factura_comedor?: boolean;
          comedor_nombre?: string | null;
          notes?: string | null;
          status?: 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO';
          reviewed_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      public_order_requests: {
        Row: {
          id: string;
          nombre: string;
          telefono: string | null;
          fecha_requerida: string;
          notes: string | null;
          status: 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO' | 'ATENDIDO';
          reviewed_at: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          telefono?: string | null;
          fecha_requerida: string;
          notes?: string | null;
          status?: 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO' | 'ATENDIDO';
          reviewed_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          telefono?: string | null;
          fecha_requerida?: string;
          notes?: string | null;
          status?: 'NUEVO' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO' | 'ATENDIDO';
          reviewed_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      public_order_request_items: {
        Row: {
          id: string;
          request_id: string;
          product_name: string;
          qty: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          product_name: string;
          qty: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          product_name?: string;
          qty?: number;
          created_at?: string;
        };
      };

      orders: {
        Row: {
          id: string;
          customer_id: string;
          status:
            | 'NUEVO'
            | 'VISTO'
            | 'EN_VALIDACION'
            | 'APROBADO'
            | 'ASIGNADO'
            | 'RECHAZAZADO'
            | 'RECHAZADO'
            | 'CANCELADO';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          status?:
            | 'NUEVO'
            | 'VISTO'
            | 'EN_VALIDACION'
            | 'APROBADO'
            | 'ASIGNADO'
            | 'RECHAZAZADO'
            | 'RECHAZADO'
            | 'CANCELADO';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          status?:
            | 'NUEVO'
            | 'VISTO'
            | 'EN_VALIDACION'
            | 'APROBADO'
            | 'ASIGNADO'
            | 'RECHAZAZADO'
            | 'RECHAZADO'
            | 'CANCELADO';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          qty: number;
          precio_aplicado: number;
          subtotal: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          qty: number;
          precio_aplicado: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          qty?: number;
          precio_aplicado?: number;
          created_at?: string;
        };
      };

      assignments: {
        Row: {
          id: string;
          driver_id: string;
          work_date: string;
          status: 'ACTIVA' | 'CERRADA' | 'CANCELADA';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          work_date?: string;
          status?: 'ACTIVA' | 'CERRADA' | 'CANCELADA';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string;
          work_date?: string;
          status?: 'ACTIVA' | 'CERRADA' | 'CANCELADA';
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      assignment_load_items: {
        Row: {
          id: string;
          assignment_id: string;
          product_id: string;
          qty: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          product_id: string;
          qty: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          assignment_id?: string;
          product_id?: string;
          qty?: number;
          created_at?: string;
        };
      };

      routes: {
        Row: {
          id: string;
          assignment_id: string;
          km_start: number | null;
          km_end: number | null;
          started_at: string | null;
          ended_at: string | null;
          status: 'NO_INICIADA' | 'EN_RUTA' | 'FINALIZADA';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          km_start?: number | null;
          km_end?: number | null;
          started_at?: string | null;
          ended_at?: string | null;
          status?: 'NO_INICIADA' | 'EN_RUTA' | 'FINALIZADA';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assignment_id?: string;
          km_start?: number | null;
          km_end?: number | null;
          started_at?: string | null;
          ended_at?: string | null;
          status?: 'NO_INICIADA' | 'EN_RUTA' | 'FINALIZADA';
          created_at?: string;
          updated_at?: string;
        };
      };

      deliveries: {
        Row: {
          id: string;
          assignment_id: string;
          route_id: string | null;
          customer_id: string;
          order_id: string | null;
          folio: string;
          status: 'PENDIENTE' | 'ENTREGADA' | 'CANCELADA';
          canceled_reason: string | null;
          delivered_at: string | null;
          customer_nombre_snapshot: string | null;
          diner_nombre_snapshot: string | null;
          maps_url_snapshot: string | null;
          total_expected: number;
          total_real: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          route_id?: string | null;
          customer_id: string;
          order_id?: string | null;
          status?: 'PENDIENTE' | 'ENTREGADA' | 'CANCELADA';
          canceled_reason?: string | null;
          delivered_at?: string | null;
          customer_nombre_snapshot?: string | null;
          diner_nombre_snapshot?: string | null;
          maps_url_snapshot?: string | null;
          total_expected?: number;
          total_real?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assignment_id?: string;
          route_id?: string | null;
          customer_id?: string;
          order_id?: string | null;
          folio?: string;
          status?: 'PENDIENTE' | 'ENTREGADA' | 'CANCELADA';
          canceled_reason?: string | null;
          delivered_at?: string | null;
          customer_nombre_snapshot?: string | null;
          diner_nombre_snapshot?: string | null;
          maps_url_snapshot?: string | null;
          total_expected?: number;
          total_real?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      delivery_items: {
        Row: {
          id: string;
          delivery_id: string;
          product_id: string;
          qty_assigned: number;
          qty_real: number | null;
          precio_aplicado: number;
          subtotal_expected: number;
          subtotal_real: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          delivery_id: string;
          product_id: string;
          qty_assigned: number;
          qty_real?: number | null;
          precio_aplicado: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          delivery_id?: string;
          product_id?: string;
          qty_assigned?: number;
          qty_real?: number | null;
          precio_aplicado?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };

    Views: {
      v_admin_dashboard: { Row: any };
      v_driver_dashboard_today: { Row: any };
      v_driver_deliveries_today: { Row: any };
      v_order_detail: { Row: any };
      v_delivery_detail: { Row: any };
      v_active_new_customer_requests: { Row: any };
      v_active_public_order_requests: { Row: any };
      v_recent_public_order_requests: { Row: any };
    };
  };
};