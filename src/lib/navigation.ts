/**
 * CONFIGURACIÓN DE NAVEGACIÓN POR PAQUETES (Ciclo 1 — P1 habilitado).
 *
 * Única fuente de verdad del alcance del sistema: el Sidebar y el Dashboard
 * se construyen a partir de este arreglo. Para habilitar un paquete en un
 * ciclo futuro solo hay que cambiar `habilitado: true` (y agregar sus items).
 *
 * P1: SEGURIDAD Y ACCESOS → habilitado (CU01, CU03–CU06).
 * P2: GESTIÓN DE PERSONAL TÉCNICO → deshabilitado (sin rutas aún).
 * P3: CLIENTES, VENTAS Y COTIZACIONES → habilitado SOLO con CU07
 *     (Gestionar Clientes y Establecimientos); cotizaciones/ventas/caja
 *     siguen sin rutas en este ciclo.
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
  /** Caso de uso asociado (CU01…CU06), si aplica. */
  cu?: string
  /** Breve descripción mostrada en las tarjetas del Dashboard. */
  descripcion?: string
}

export interface PaqueteNav {
  /** Identificador del paquete (P1…P3). */
  id: string
  /** Nombre del paquete (p. ej. 'SEGURIDAD Y ACCESOS'). */
  nombre: string
  /** true = se muestra y navega; false = ítem bloqueado sin enlace. */
  habilitado: boolean
  items: ItemNav[]
}

export const PAQUETES: PaqueteNav[] = [
  {
    id: 'P1',
    nombre: 'SEGURIDAD Y ACCESOS',
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
    nombre: 'GESTIÓN DE PERSONAL TÉCNICO',
    habilitado: false,
    items: [],
  },
  {
    id: 'P3',
    nombre: 'CLIENTES, VENTAS Y COTIZACIONES',
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
    ],
  },
]