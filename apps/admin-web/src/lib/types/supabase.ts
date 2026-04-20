export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          pin_hash: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          pin_hash?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          pin_hash?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      assignment_deliveries: {
        Row: {
          assignment_id: string
          branch_id: string
          created_at: string
          delivery_order: number
          id: string
          status: string
        }
        Insert: {
          assignment_id: string
          branch_id: string
          created_at?: string
          delivery_order?: number
          id?: string
          status?: string
        }
        Update: {
          assignment_id?: string
          branch_id?: string
          created_at?: string
          delivery_order?: number
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_deliveries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_items: {
        Row: {
          assignment_id: string | null
          created_at: string | null
          id: string
          product_id: string | null
          quantity: number
          total_weight: number | null
          unit_weight: number
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          total_weight?: number | null
          unit_weight: number
        }
        Update: {
          assignment_id?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          total_weight?: number | null
          unit_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "driver_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_load_items: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          product_id: string
          qty: number
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          product_id: string
          qty: number
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_load_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_load_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "assignment_load_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_loads: {
        Row: {
          assignment_id: string
          product_id: string
          qty: number
        }
        Insert: {
          assignment_id: string
          product_id: string
          qty?: number
        }
        Update: {
          assignment_id?: string
          product_id?: string
          qty?: number
        }
        Relationships: []
      }
      assignments: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          work_date?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_detail"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["driver_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_driver_id: string | null
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_driver_id?: string | null
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_driver_id?: string | null
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_driver_id_fkey"
            columns: ["actor_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_actor_driver_id_fkey"
            columns: ["actor_driver_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_detail"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "audit_events_actor_driver_id_fkey"
            columns: ["actor_driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "audit_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_product_prices: {
        Row: {
          branch_id: string
          price: number
          product_id: string
        }
        Insert: {
          branch_id: string
          price: number
          product_id: string
        }
        Update: {
          branch_id?: string
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_product_prices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_products: {
        Row: {
          branch_id: string
          enabled: boolean
          product_id: string
        }
        Insert: {
          branch_id: string
          enabled?: boolean
          product_id: string
        }
        Update: {
          branch_id?: string
          enabled?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          capacity: string
          company_id: string | null
          created_at: string
          id: string
          maps_url: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          capacity?: string
          company_id?: string | null
          created_at?: string
          id?: string
          maps_url: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          capacity?: string
          company_id?: string | null
          created_at?: string
          id?: string
          maps_url?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
          notes: string | null
          status: string | null
          tax_address: string | null
          tax_email: string | null
          tax_name: string | null
          tax_phone: string | null
          tax_rfc: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string | null
          tax_address?: string | null
          tax_email?: string | null
          tax_name?: string | null
          tax_phone?: string | null
          tax_rfc?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string | null
          tax_address?: string | null
          tax_email?: string | null
          tax_name?: string | null
          tax_phone?: string | null
          tax_rfc?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      client_groups: {
        Row: {
          address: string
          capacity: string | null
          company_id: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          capacity?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          capacity?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_prices: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          product_id: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          product_id?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          product_id?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_prices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          address: string
          company_name: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          processed_at: string | null
          processed_by: string | null
          requested_at: string | null
          requires_invoice: boolean | null
          status: string | null
          tax_address: string | null
          tax_email: string | null
          tax_name: string | null
          tax_phone: string | null
          tax_rfc: string | null
        }
        Insert: {
          address: string
          company_name?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string | null
          requires_invoice?: boolean | null
          status?: string | null
          tax_address?: string | null
          tax_email?: string | null
          tax_name?: string | null
          tax_phone?: string | null
          tax_rfc?: string | null
        }
        Update: {
          address?: string
          company_name?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string | null
          requires_invoice?: boolean | null
          status?: string | null
          tax_address?: string | null
          tax_email?: string | null
          tax_name?: string | null
          tax_phone?: string | null
          tax_rfc?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          capacity: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          requires_invoice: boolean | null
          status: string | null
          tax_address: string | null
          tax_email: string | null
          tax_name: string | null
          tax_phone: string | null
          tax_rfc: string | null
          total_orders: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address: string
          capacity?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          requires_invoice?: boolean | null
          status?: string | null
          tax_address?: string | null
          tax_email?: string | null
          tax_name?: string | null
          tax_phone?: string | null
          tax_rfc?: string | null
          total_orders?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string
          capacity?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          requires_invoice?: boolean | null
          status?: string | null
          tax_address?: string | null
          tax_email?: string | null
          tax_name?: string | null
          tax_phone?: string | null
          tax_rfc?: string | null
          total_orders?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_orders: {
        Row: {
          client_group_id: string | null
          client_id: string | null
          created_at: string | null
          delivery_date: string | null
          delivery_time: string | null
          folio: string | null
          id: string
          special_instructions: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
          urgent: boolean | null
        }
        Insert: {
          client_group_id?: string | null
          client_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          folio?: string | null
          id?: string
          special_instructions?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          urgent?: boolean | null
        }
        Update: {
          client_group_id?: string | null
          client_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          folio?: string | null
          id?: string
          special_instructions?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          urgent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_orders_client_group_id_fkey"
            columns: ["client_group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_products: {
        Row: {
          activo: boolean
          created_at: string
          customer_id: string
          id: string
          precio_override: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          customer_id: string
          id?: string
          precio_override?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          customer_id?: string
          id?: string
          precio_override?: number | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_order_detail"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          activo: boolean
          capacidad_equipo: string
          created_at: string
          diner_id: string | null
          id: string
          maps_url: string | null
          nombre: string
          profile_id: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          capacidad_equipo?: string
          created_at?: string
          diner_id?: string | null
          id?: string
          maps_url?: string | null
          nombre: string
          profile_id?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          capacidad_equipo?: string
          created_at?: string
          diner_id?: string | null
          id?: string
          maps_url?: string | null
          nombre?: string
          profile_id?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_diner_id_fkey"
            columns: ["diner_id"]
            isOneToOne: false
            referencedRelation: "diners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assignment_id: string
          canceled_reason: string | null
          created_at: string
          customer_id: string
          customer_nombre_snapshot: string | null
          delivered_at: string | null
          diner_nombre_snapshot: string | null
          folio: string
          id: string
          maps_url_snapshot: string | null
          order_id: string | null
          route_id: string | null
          status: string
          total_expected: number
          total_real: number
          updated_at: string
        }
        Insert: {
          assignment_id: string
          canceled_reason?: string | null
          created_at?: string
          customer_id: string
          customer_nombre_snapshot?: string | null
          delivered_at?: string | null
          diner_nombre_snapshot?: string | null
          folio?: string
          id?: string
          maps_url_snapshot?: string | null
          order_id?: string | null
          route_id?: string | null
          status?: string
          total_expected?: number
          total_real?: number
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          canceled_reason?: string | null
          created_at?: string
          customer_id?: string
          customer_nombre_snapshot?: string | null
          delivered_at?: string | null
          diner_nombre_snapshot?: string | null
          folio?: string
          id?: string
          maps_url_snapshot?: string | null
          order_id?: string | null
          route_id?: string | null
          status?: string
          total_expected?: number
          total_real?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_order_detail"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_detail"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "deliveries_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["route_id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          precio_aplicado: number
          product_id: string
          qty_assigned: number
          qty_real: number | null
          subtotal_expected: number | null
          subtotal_real: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          precio_aplicado: number
          product_id: string
          qty_assigned: number
          qty_real?: number | null
          subtotal_expected?: number | null
          subtotal_real?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          precio_aplicado?: number
          product_id?: string
          qty_assigned?: number
          qty_real?: number | null
          subtotal_expected?: number | null
          subtotal_real?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_detail"
            referencedColumns: ["delivery_id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "v_driver_deliveries_today"
            referencedColumns: ["delivery_id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_route_progress: {
        Row: {
          actual_duration: unknown
          completed_deliveries: number
          created_at: string | null
          current_stop: number | null
          driver_id: string | null
          estimated_duration: unknown
          id: string
          progress_percent: number | null
          route_completed_at: string | null
          route_date: string
          route_notes: string | null
          route_started_at: string | null
          status: string | null
          total_deliveries: number
          updated_at: string | null
        }
        Insert: {
          actual_duration?: unknown
          completed_deliveries?: number
          created_at?: string | null
          current_stop?: number | null
          driver_id?: string | null
          estimated_duration?: unknown
          id?: string
          progress_percent?: number | null
          route_completed_at?: string | null
          route_date?: string
          route_notes?: string | null
          route_started_at?: string | null
          status?: string | null
          total_deliveries?: number
          updated_at?: string | null
        }
        Update: {
          actual_duration?: unknown
          completed_deliveries?: number
          created_at?: string | null
          current_stop?: number | null
          driver_id?: string | null
          estimated_duration?: unknown
          id?: string
          progress_percent?: number | null
          route_completed_at?: string | null
          route_date?: string
          route_notes?: string | null
          route_started_at?: string | null
          status?: string | null
          total_deliveries?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      diners: {
        Row: {
          activo: boolean
          cantidad_clientes: number
          created_at: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cantidad_clientes?: number
          created_at?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cantidad_clientes?: number
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_assignments: {
        Row: {
          assigned_by: string | null
          assignment_date: string
          created_at: string | null
          driver_id: string | null
          id: string
          notes: string | null
          status: string | null
          total_products: number | null
          total_weight: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          assignment_date?: string
          created_at?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          total_products?: number | null
          total_weight?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          assignment_date?: string
          created_at?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          total_products?: number | null
          total_weight?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      driver_stock: {
        Row: {
          assigned_qty: number
          available_qty: number | null
          driver_id: string
          product_id: string
          updated_at: string
          used_qty: number
        }
        Insert: {
          assigned_qty?: number
          available_qty?: number | null
          driver_id: string
          product_id: string
          updated_at?: string
          used_qty?: number
        }
        Update: {
          assigned_qty?: number
          available_qty?: number | null
          driver_id?: string
          product_id?: string
          updated_at?: string
          used_qty?: number
        }
        Relationships: []
      }
      drivers: {
        Row: {
          activo: boolean
          created_at: string
          current_status: string
          id: string
          nombre: string
          pin_hash: string
          profile_id: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          current_status?: string
          id?: string
          nombre: string
          pin_hash: string
          profile_id: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          current_status?: string
          id?: string
          nombre?: string
          pin_hash?: string
          profile_id?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_folio_sequence: {
        Row: {
          current_value: number
          digits: number
          id: boolean
          updated_at: string
        }
        Insert: {
          current_value?: number
          digits?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          current_value?: number
          digits?: number
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      new_client_requests: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          is_company: boolean
          maps_url: string
          name: string
          notes: string | null
          phone: string | null
          status: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          is_company?: boolean
          maps_url: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          is_company?: boolean
          maps_url?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      new_customer_requests: {
        Row: {
          comedor_nombre: string | null
          created_at: string
          factura_comedor: boolean
          id: string
          maps_url: string | null
          nombre: string
          notes: string | null
          status: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          comedor_nombre?: string | null
          created_at?: string
          factura_comedor?: boolean
          id?: string
          maps_url?: string | null
          nombre: string
          notes?: string | null
          status?: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          comedor_nombre?: string | null
          created_at?: string
          factura_comedor?: boolean
          id?: string
          maps_url?: string | null
          nombre?: string
          notes?: string | null
          status?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          related_entity_id: string | null
          related_entity_type: string | null
          target_customer_id: string | null
          target_driver_id: string | null
          target_profile_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          related_entity_id?: string | null
          related_entity_type?: string | null
          target_customer_id?: string | null
          target_driver_id?: string | null
          target_profile_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          related_entity_id?: string | null
          related_entity_type?: string | null
          target_customer_id?: string | null
          target_driver_id?: string | null
          target_profile_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_target_customer_id_fkey"
            columns: ["target_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_customer_id_fkey"
            columns: ["target_customer_id"]
            isOneToOne: false
            referencedRelation: "v_order_detail"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "notifications_target_driver_id_fkey"
            columns: ["target_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_driver_id_fkey"
            columns: ["target_driver_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_detail"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "notifications_target_driver_id_fkey"
            columns: ["target_driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "notifications_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_sync: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string
          error_message: string | null
          id: string
          last_sync_attempt: string | null
          odoo_id: number | null
          sync_data: Json | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          last_sync_attempt?: string | null
          odoo_id?: number | null
          sync_data?: Json | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          last_sync_attempt?: string | null
          odoo_id?: number | null
          sync_data?: Json | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          precio_aplicado: number
          product_id: string
          qty: number
          subtotal: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          precio_aplicado: number
          product_id: string
          qty: number
          subtotal?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          precio_aplicado?: number
          product_id?: string
          qty?: number
          subtotal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_detail"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_order_detail"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      products: {
        Row: {
          activo: boolean
          created_at: string
          ice_type: string
          id: string
          kg_por_unidad: number
          kind: string
          nombre: string
          precio_base: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          ice_type?: string
          id?: string
          kg_por_unidad: number
          kind: string
          nombre: string
          precio_base?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          ice_type?: string
          id?: string
          kg_por_unidad?: number
          kind?: string
          nombre?: string
          precio_base?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          role: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id: string
          nombre: string
          role: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          reason: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          reason: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      routes: {
        Row: {
          assignment_id: string
          created_at: string
          ended_at: string | null
          id: string
          km_end: number | null
          km_start: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          km_end?: number | null
          km_start?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          km_end?: number | null
          km_start?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["assignment_id"]
          },
        ]
      }
      shrinkage: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          reason: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          reason: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      stock: {
        Row: {
          driver_id: string | null
          id: string
          product_id: string | null
          quantity: number | null
          updated_at: string | null
        }
        Insert: {
          driver_id?: string | null
          id?: string
          product_id?: string | null
          quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          driver_id?: string | null
          id?: string
          product_id?: string | null
          quantity?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          notes: string | null
          product_id: string | null
          qty: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          product_id?: string | null
          qty: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string | null
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      thermal_printers: {
        Row: {
          activo: boolean
          connection_type: string
          created_at: string
          driver_id: string | null
          id: string
          last_connection: string | null
          mac_address: string | null
          printer_name: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          connection_type?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          last_connection?: string | null
          mac_address?: string | null
          printer_name: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          connection_type?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          last_connection?: string | null
          mac_address?: string | null
          printer_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thermal_printers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thermal_printers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_detail"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "thermal_printers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["driver_id"]
          },
        ]
      }
    }
    Views: {
      v_admin_dashboard: {
        Row: {
          clientes_activos: number | null
          comedores_activos: number | null
          drivers_activos: number | null
          entregas_completadas_hoy: number | null
          entregas_hoy: number | null
          pedidos_nuevos: number | null
          productos_activos: number | null
          solicitudes_clientes_nuevos: number | null
          total_real_hoy: number | null
        }
        Relationships: []
      }
      v_delivery_detail: {
        Row: {
          canceled_reason: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_id: string | null
          diner_name: string | null
          driver_id: string | null
          driver_name: string | null
          folio: string | null
          items: Json | null
          maps_url: string | null
          status: string | null
          total_expected: number | null
          total_real: number | null
          work_date: string | null
        }
        Relationships: []
      }
      v_driver_dashboard_today: {
        Row: {
          assignment_id: string | null
          assignment_status: string | null
          canceladas: number | null
          completadas: number | null
          current_status: string | null
          driver_id: string | null
          driver_name: string | null
          ended_at: string | null
          km_end: number | null
          km_start: number | null
          progress_percent: number | null
          route_id: string | null
          route_status: string | null
          started_at: string | null
          total_activo: number | null
          total_esperado: number | null
          total_real: number | null
          work_date: string | null
        }
        Relationships: []
      }
      v_driver_deliveries_today: {
        Row: {
          customer_name: string | null
          delivered_at: string | null
          delivery_id: string | null
          diner_name: string | null
          driver_id: string | null
          folio: string | null
          maps_url: string | null
          status: string | null
          total_expected: number | null
          total_real: number | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_delivery_detail"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_dashboard_today"
            referencedColumns: ["driver_id"]
          },
        ]
      }
      v_order_detail: {
        Row: {
          capacidad_equipo: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          diner_name: string | null
          items: Json | null
          maps_url: string | null
          notes: string | null
          order_id: string | null
          status: string | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_assignment: {
        Args: { p_driver_id: string; p_work_date: string }
        Returns: undefined
      }
      assign_new_deliveries_to_route: {
        Args: { p_delivery_ids: string[]; p_driver_id: string }
        Returns: undefined
      }
      assign_stock_to_driver: {
        Args: {
          p_created_by?: string
          p_driver_id: string
          p_product_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      cancel_delivery: {
        Args: { p_admin_user: string; p_delivery_id: string; p_reason: string }
        Returns: undefined
      }
      complete_delivery:
        | {
            Args: {
              p_client_comments?: string
              p_delivered_qty: number
              p_delivery_id: string
              p_driver_comments?: string
              p_extra_qty?: number
              p_missing_qty?: number
            }
            Returns: undefined
          }
        | {
            Args: { p_delivery_id: string; p_driver_id: string; p_items: Json }
            Returns: undefined
          }
      complete_delivery_stock: {
        Args: { p_delivery_id: string }
        Returns: undefined
      }
      create_assignment: {
        Args: {
          p_admin_user: string
          p_deliveries: Json
          p_driver_id: string
          p_loads: Json
          p_work_date: string
        }
        Returns: string
      }
      create_driver_user: {
        Args: { p_email: string; p_name: string; p_pin: string }
        Returns: string
      }
      current_customer_id: { Args: never; Returns: string }
      current_driver_id: { Args: never; Returns: string }
      current_profile_role: { Args: never; Returns: string }
      finish_route: {
        Args: { p_driver_id: string; p_km_end: number; p_work_date: string }
        Returns: undefined
      }
      fn_cancel_delivery: {
        Args: { p_delivery_id: string; p_reason: string }
        Returns: undefined
      }
      fn_confirm_delivery: {
        Args: { p_delivery_id: string; p_items: Json }
        Returns: undefined
      }
      fn_convert_order_to_deliveries: {
        Args: { p_driver_id: string; p_order_id: string; p_work_date: string }
        Returns: string
      }
      fn_finish_route: {
        Args: { p_assignment_id: string; p_km_end: number }
        Returns: undefined
      }
      fn_start_route: {
        Args: { p_assignment_id: string; p_km_start: number }
        Returns: string
      }
      generate_delivery_folio: { Args: never; Returns: string }
      generate_single_gi_folio: { Args: never; Returns: string }
      hash_pin: { Args: { p_pin: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_customer: { Args: never; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      next_gi_folio: { Args: never; Returns: string }
      normalize_text: { Args: { v: string }; Returns: string }
      reserve_delivery_folios: { Args: { count: number }; Returns: string[] }
      resolve_branch_price: {
        Args: { p_branch_id: string; p_product_id: string }
        Returns: number
      }
      set_user_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      start_delivery_route: {
        Args: { p_driver_id: string; p_route_notes?: string }
        Returns: string
      }
      start_route: {
        Args: { p_driver_id: string; p_km_start: number; p_work_date: string }
        Returns: undefined
      }
      verify_pin: { Args: { p_hash: string; p_pin: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
