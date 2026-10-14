/**
 * CONFIGURACIÓN DE NAVEGACIÓN POR PAQUETES (Ciclo 2 — sistema unificado).
 *
 * Única fuente de verdad del alcance del sistema: el Sidebar y el Dashboard
 * se construyen a partir de este arreglo. Para habilitar un paquete en un
 * ciclo futuro solo hay que cambiar `habilitado: true` (y agregar sus items).
 *
 * Estructura oficial de 4 paquetes funcionales:
 * P1: SEGURIDAD Y GESTIÓN DE ACCESOS → habilitado
 *     (CU01, CU03–CU06; CU02 es público).
 * P2: GESTIÓN COMERCIAL, CLIENTES, CATÁLOGO Y VENTAS → habilitado
 *     (CU07 clientes, CU09 ventas, CU14 proveedores, CU15 compras,
 *      CU16 inventario, CU17 servicios).
 * P3: PERSONAL TÉCNICO Y LOGÍSTICA DE CAMPO → deshabilitado
 *     (CU10–CU13, aún sin pantallas).
 * P4: POST-VENTA, ALERTAS Y REPORTES GERENCIALES → deshabilitado
 *     (CU18–CU20, aún sin pantallas).
 *
 * La visibilidad de cada ítem además depende del permiso activo del rol en
 * la BD (PERMISO ⋈ ROL_PERMISO, ver lib/permisos.ts).
 */

export interface ItemNav {
  /** Identificador único del ítem (p. ej. 'usuarios'). */
  id: string
  /** Etiqueta mostrada en el Sidebar / tarjeta del Dashboard. */
  etiqueta: string
  /** Ruta de navegación (solo para ítems de paquetes habilitados). */
  ruta: string
  /**
   * Clave del permiso en PERMISO.nombre (RBAC en BD) e ícono del módulo.
   * Cadena vacía = siempre visible (p. ej. Inicio).
   */
  clave: string
  /** Caso de uso asociado (CU01…CU20), si aplica. */
  cu?: string
  /** Breve descripción mostrada en las tarjetas del Dashboard. */
  descripcion?: string
}

export interface PaqueteNav {
  /** Identificador del paquete (P1…P4). */
  id: string
  /** Nombre del paquete (p. ej. 'SEGURIDAD Y GESTIÓN DE ACCESOS'). */
  nombre: string
  /** true = se muestra y navega; false = ítem bloqueado sin enlace. */
  habilitado: boolean
  items: ItemNav[]
}

export const PAQUETES: PaqueteNav[] = [
  {
    id: 'P1',
    nombre: 'SEGURIDAD Y GESTIÓN DE ACCESOS',
    habilitado: true,
    items: [
      {
        id: 'inicio',
        etiqueta: 'Inicio / Dashboard',
        ruta: '/',
        clave: '',
        cu: 'CU01',
        descripcion: 'Panel principal con acceso a los módulos de tu rol.',
      },
      {
        id: 'usuarios',
        etiqueta: 'Usuarios (CU03)',
        ruta: '/usuarios',
        clave: 'USUARIOS',
        cu: 'CU03',
        descripcion: 'Gestión de cuentas internas y asignación de roles.',
      },
      {
        id: 'roles',
        etiqueta: 'Roles y Permisos (CU04)',
        ruta: '/roles',
        clave: 'ROLES',
        cu: 'CU04',
        descripcion: 'Roles y matriz de permisos por módulo, editable en la BD.',
      },
      {
        id: 'perfil',
        etiqueta: 'Mi Perfil (CU05)',
        ruta: '/perfil',
        clave: 'PERFIL',
        cu: 'CU05',
        descripcion: 'Configura tus datos personales y cambia tu contraseña.',
      },
      {
        id: 'bitacora',
        etiqueta: 'Bitácora (CU06)',
        ruta: '/bitacora',
        clave: 'BITACORA',
        cu: 'CU06',
        descripcion: 'Auditoría de eventos y accesos al sistema.',
      },
    ],
  },
  {
    id: 'P2',
    nombre: 'GESTIÓN COMERCIAL, CLIENTES, CATÁLOGO Y VENTAS',
    habilitado: true,
    items: [
      {
        id: 'clientes',
        etiqueta: 'Clientes y Establecimientos (CU07)',
        ruta: '/clientes',
        clave: 'CLIENTES',
        cu: 'CU07',
        descripcion: 'Registro y consulta de clientes con sus establecimientos.',
      },
      {
        id: 'ventas',
        etiqueta: 'Ventas y Caja (CU09)',
        ruta: '/ventas',
        clave: 'VENTAS',
        cu: 'CU09',
        descripcion: 'Registro de ventas en mostrador, turnos y arqueo de caja.',
      },
      {
        id: 'proveedores',
        etiqueta: 'Proveedores y Mayoristas (CU14)',
        ruta: '/proveedores',
        clave: 'PROVEEDORES',
        cu: 'CU14',
        descripcion: 'Proveedores, catálogo de mayoristas y comparación de precios.',
      },
      {
        id: 'compras',
        etiqueta: 'Compras de Equipos e Insumos (CU15)',
        ruta: '/compras',
        clave: 'COMPRAS',
        cu: 'CU15',
        descripcion: 'Registro de compras a proveedores con su detalle de productos.',
      },
      {
        id: 'inventario',
        etiqueta: 'Inventario y Kárdex (CU16)',
        ruta: '/inventario',
        clave: 'INVENTARIO',
        cu: 'CU16',
        descripcion: 'Stock, movimientos de kárdex, ajustes e inventario inicial.',
      },
      {
        id: 'servicios',
        etiqueta: 'Catálogo de Servicios (CU17)',
        ruta: '/servicios',
        clave: 'SERVICIOS',
        cu: 'CU17',
        descripcion: 'Catálogo de servicios técnicos y tarifas por hora.',
      },
    ],
  },
  {
    id: 'P3',
    nombre: 'PERSONAL TÉCNICO Y LOGÍSTICA DE CAMPO',
    habilitado: false,
    items: [],
  },
  {
    id: 'P4',
    nombre: 'POST-VENTA, ALERTAS Y REPORTES GERENCIALES',
    habilitado: false,
    items: [],
  },
]