// lib/constants/paths.ts
// ✅ PATHS — Global Ice (Admin + Driver + Customer)
// ✅ SIN rutas dinámicas tipo /detail/[id]
// ✅ Usamos querystring cuando se necesite
// ✅ Alineado al flujo actual:
// - Solicitudes: /admin/solicitudes
// - Pedidos: /admin/pedidos
// - Cliente sin login

export const PATHS = {
  admin: {
    // ===== Auth =====
    login: '/admin/login',

    // ===== Core =====
    dashboard: '/admin/dashboard',

    // ===== Catálogos =====
    usuarios: '/admin/usuarios',
    clientes: '/admin/clientes',
    comedores: '/admin/usuarios/comedores',
    choferes: '/admin/choferes',
    productos: '/admin/productos',

    // ===== Bandejas =====
    solicitudes: '/admin/solicitudes',
    nuevosClientes: '/admin/solicitudes', // alias de compatibilidad
    pedidos: '/admin/pedidos',

    // ===== Operación =====
    asignaciones: '/admin/asignaciones',

    // ===== Reportes =====
    reportes: '/admin/reportes',

    // ===== Details (querystring) =====
    pedidoDetail: (id: string) =>
      `/admin/pedidos/detail?id=${encodeURIComponent(id)}`,

    solicitudDetail: (id: string) =>
      `/admin/solicitudes/detail?id=${encodeURIComponent(id)}`,

    // ===== Helpers asignaciones =====
    asignacionesWith: (params?: { date?: string; driverId?: string }) => {
      const qs = new URLSearchParams();

      if (params?.date) qs.set('date', params.date);
      if (params?.driverId) qs.set('driverId', params.driverId);

      const s = qs.toString();
      return s ? `/admin/asignaciones?${s}` : '/admin/asignaciones';
    },

    // ===== Helpers bandejas =====
    pedidosWith: (params?: {
      status?: string;
      q?: string;
      date?: string;
    }) => {
      const qs = new URLSearchParams();

      if (params?.status) qs.set('status', params.status);
      if (params?.q) qs.set('q', params.q);
      if (params?.date) qs.set('date', params.date);

      const s = qs.toString();
      return s ? `/admin/pedidos?${s}` : '/admin/pedidos';
    },

    solicitudesWith: (params?: {
      status?: string;
      q?: string;
    }) => {
      const qs = new URLSearchParams();

      if (params?.status) qs.set('status', params.status);
      if (params?.q) qs.set('q', params.q);

      const s = qs.toString();
      return s ? `/admin/solicitudes?${s}` : '/admin/solicitudes';
    },
  },

  driver: {
    dashboard: '/driver/dashboard',
    support: '/driver/support',
    printer: '/driver/printer',
  },

  customer: {
    home: '/customer',
    signup: '/customer/signup',
    pedidos: '/customer/pedidos',
    order: '/customer/pedidos',
    whatsapp: '/customer/whatsapp',
  },
} as const;

export type Paths = typeof PATHS;