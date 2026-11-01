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
 *     (CU07 clientes, CU08 cotizaciones, CU09 ventas, CU14 proveedores,
 *      CU15 compras, CU16 inventario, CU17 servicios).
 * P3: PERSONAL TÉCNICO Y LOGÍSTICA DE CAMPO → habilitado
 *     (CU10 personal técnico, CU11 asignar técnicos, CU12 órdenes, CU13 notas).
 * P4: POST-VENTA, ALERTAS Y REPORTES GERENCIALES → deshabilitado
 *     (CU18–CU20, aún sin pantallas).
 *
 * La visibilidad de cada ítem además depende del permiso activo del rol en
 * la BD (ROL_FUNCION ⋈ FUNCION, acción LEER, ver lib/permisos.ts).
 */

export interface ItemNav {
  /** Identificador único del ítem (p. ej. 'usuarios'). */
  id: string
  /** Etiqueta mostrada en el Sidebar / tarjeta del Dashboard. */
  etiqueta: string
  /** Ruta de navegación (solo para ítems de paquetes habilitados). */
  ruta: string
  /**
   * Clave del módulo en FUNCION.clave (RBAC en BD) e ícono del módulo.
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
        id: 'cotizaciones',
        etiqueta: 'Cotizaciones (CU08)',
        ruta: '/cotizaciones',
        clave: 'COTIZACIONES',
        cu: 'CU08',
        descripcion: 'Gestión de cotizaciones, proformas y presupuestos para clientes.',
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
    habilitado: true,
    items: [
      {
        id: 'personal-tecnico',
        etiqueta: 'Disponibilidad y Jornadas (CU10)',
        ruta: '/personal-tecnico',
        clave: 'PERSONAL_TECNICO',
        cu: 'CU10',
        descripcion: 'Supervisión de técnicos, horarios de trabajo y control de ausencias.',
      },
      {
        id: 'asignar-tecnicos',
        etiqueta: 'Asignar Técnicos (CU11)',
        ruta: '/asignar-tecnicos',
        clave: 'ASIGNAR_TECNICOS',
        cu: 'CU11',
        descripcion: 'Programación y asignación de cuadrillas técnicas a órdenes de trabajo.',
      },
      {
        id: 'ordenes-trabajo',
        etiqueta: 'Órdenes de Trabajo (CU12)',
        ruta: '/ordenes-trabajo',
        clave: 'ORDENES_TRABAJO',
        cu: 'CU12',
        descripcion: 'Gestión de órdenes de trabajo, marcas de tiempo y reporte de campo.',
      },
          {
        id: 'liquidacion',
        etiqueta: 'Notas de Servicio y Liquidación (CU13)',
        ruta: '/liquidacion',
        clave: 'NOTAS_SERVICIO',
        cu: 'CU13',
        descripcion: 'Liquidación de órdenes finalizadas y emisión de notas de servicio.',
      },
    ],
  },
  {
    id: 'P4',
    nombre: 'POST-VENTA, ALERTAS Y REPORTES GERENCIALES',
    habilitado: false,
    items: [],
  },
]

// ---------------------------------------------------------------------------
// Catálogo de módulos RBAC — DERIVADO de PAQUETES (única fuente de verdad).
//
// `MODULOS` es la vista que consume el RBAC (lib/permisos.ts): una entrada por
// ítem con clave de permiso, en el orden de PAQUETES. Se derivan solo los
// ítems de paquetes HABILITADOS y con clave no vacía (excluye "Inicio", que no
// aplica RBAC, y el paquete P4 aún sin pantallas). Así, habilitar un
// paquete en PAQUETES actualiza el menú, el panel y el RBAC a la vez.
// ---------------------------------------------------------------------------

/** Módulo registrado en el catálogo RBAC (ruta con su clave de permiso). */
export interface ModuloRegistrado {
  /** Clave del módulo en FUNCION.clave (p. ej. 'USUARIOS'). */
  clave: string
  ruta: string
  etiqueta: string
  /** Breve descripción mostrada en las tarjetas del panel principal. */
  descripcion: string
}

export const MODULOS: ModuloRegistrado[] = PAQUETES.filter(
  (paquete) => paquete.habilitado,
).flatMap((paquete) =>
  paquete.items
    .filter((item) => item.clave !== '')
    .map((item) => ({
      clave: item.clave,
      ruta: item.ruta,
      etiqueta: item.etiqueta,
      descripcion: item.descripcion ?? '',
    })),
)

/** Módulos que el rol ADMINISTRADOR nunca puede perder (CU04). */
export const MODULOS_PROTEGIDOS_ADMIN = ['ROLES', 'USUARIOS']
export const ACCIONES_PROTEGIDAS_ADMIN = ['LEER', 'ACTUALIZAR']

/** ¿Esta asignación le quita al Administrador un módulo protegido? */
export function quitaModuloProtegido(rolNombre: string, claves: string[]): boolean {
  return rolNombre === 'ADMINISTRADOR' && MODULOS_PROTEGIDOS_ADMIN.some((c) => !claves.includes(c))
}

export function moduloPorRuta(ruta: string): ModuloRegistrado | undefined {
  return MODULOS.find((m) => m.ruta === ruta)
}