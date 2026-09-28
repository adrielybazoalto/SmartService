"use server";

export interface RolEntity {
  id: number;
  nombre: string;
  descripcion: string;
  letra: string;
  colorBadge: string;
}

export interface PermisoItem {
  id: string;
  nombre: string;
}

export interface ModuloGranular {
  id: number;
  codigo: string;
  nombre: string;
  permisosDisponibles: PermisoItem[];
}

export interface RespuestaAccionRoles {
  ok: boolean;
  mensaje: string;
  data?: any;
}

// Catálogo de roles
const ROLES_CATALOGO: RolEntity[] = [
  {
    id: 1,
    nombre: "ADMINISTRADOR",
    descripcion: "Acceso total a todos los módulos y configuración global del sistema.",
    letra: "A",
    colorBadge: "bg-purple-100 text-purple-700 border-purple-300",
  },
  {
    id: 2,
    nombre: "ENCARGADO",
    descripcion: "Gestión de personal, clientes, inventario, cotizaciones, ventas y supervisión de órdenes.",
    letra: "E",
    colorBadge: "bg-blue-100 text-blue-700 border-blue-300",
  },
  {
    id: 3,
    nombre: "TECNICO",
    descripcion: "Consulta de agenda, inventario y registro operativo en órdenes de trabajo y mantenimiento.",
    letra: "T",
    colorBadge: "bg-emerald-100 text-emerald-700 border-emerald-300",
  },
];

// Catálogo de los 8 módulos con permisos granulares (NO exportar como variable en use server)
const MODULOS_GRANULARES: ModuloGranular[] = [
  {
    id: 1,
    codigo: "seguridad",
    nombre: "Seguridad y Accesos",
    permisosDisponibles: [
      { id: "ver_usuarios", nombre: "Ver usuarios" },
      { id: "crear_usuarios", nombre: "Crear usuarios" },
      { id: "editar_usuarios", nombre: "Editar usuarios" },
      { id: "activar_desactivar", nombre: "Activar/desactivar" },
      { id: "gestionar_roles", nombre: "Gestionar roles" },
      { id: "ver_bitacora", nombre: "Ver bitácora" },
    ],
  },
  {
    id: 2,
    codigo: "personal_tecnico",
    nombre: "Personal Técnico",
    permisosDisponibles: [
      { id: "ver_tecnicos", nombre: "Ver técnicos" },
      { id: "gestionar_jornadas", nombre: "Gestionar jornadas" },
      { id: "registrar_bloqueos", nombre: "Registrar bloqueos" },
      { id: "verificar_disponibilidad", nombre: "Verificar disponibilidad" },
    ],
  },
  {
    id: 3,
    codigo: "clientes",
    nombre: "Clientes y Establecimientos",
    permisosDisponibles: [
      { id: "ver_clientes", nombre: "Ver clientes" },
      { id: "registrar_clientes", nombre: "Registrar clientes" },
      { id: "editar_clientes", nombre: "Editar clientes" },
      { id: "gestionar_establecimientos", nombre: "Gestionar establecimientos" },
    ],
  },
  {
    id: 4,
    codigo: "inventario",
    nombre: "Catálogo e Inventario",
    permisosDisponibles: [
      { id: "ver_productos", nombre: "Ver productos" },
      { id: "crear_editar_productos", nombre: "Crear/editar productos" },
      { id: "gestionar_proveedores", nombre: "Gestionar proveedores" },
      { id: "movimientos_kardex", nombre: "Movimientos de Kárdex" },
    ],
  },
  {
    id: 5,
    codigo: "cotizaciones",
    nombre: "Cotizaciones y Servicios",
    permisosDisponibles: [
      { id: "ver_cotizaciones", nombre: "Ver cotizaciones" },
      { id: "crear_cotizaciones", nombre: "Crear cotizaciones" },
      { id: "editar_cotizaciones", nombre: "Editar cotizaciones" },
      { id: "aprobar_rechazar", nombre: "Aprobar/rechazar cotizaciones" },
      { id: "generar_pdf", nombre: "Generar PDF" },
    ],
  },
  {
    id: 6,
    codigo: "ventas_caja",
    nombre: "Ventas y Caja",
    permisosDisponibles: [
      { id: "ver_ventas", nombre: "Ver ventas" },
      { id: "registrar_venta", nombre: "Registrar venta" },
      { id: "abrir_cerrar_caja", nombre: "Abrir/cerrar caja" },
      { id: "realizar_arqueo", nombre: "Realizar arqueo" },
    ],
  },
  {
    id: 7,
    codigo: "ordenes_trabajo",
    nombre: "Órdenes de Trabajo",
    permisosDisponibles: [
      { id: "ver_ordenes", nombre: "Ver órdenes" },
      { id: "crear_ordenes", nombre: "Crear órdenes" },
      { id: "asignar_tecnicos", nombre: "Asignar técnicos" },
      { id: "cambiar_estado_ot", nombre: "Cambiar estado" },
      { id: "registrar_trabajo_materiales", nombre: "Registrar trabajo/materiales" },
    ],
  },
  {
    id: 8,
    codigo: "mantenimiento_alertas",
    nombre: "Mantenimiento y Alertas",
    permisosDisponibles: [
      { id: "ver_mantenimientos", nombre: "Ver mantenimientos" },
      { id: "ver_tickets", nombre: "Ver tickets" },
      { id: "programar_mantenimiento", nombre: "Programar mantenimiento" },
      { id: "visualizar_alertas", nombre: "Visualizar alertas" },
    ],
  },
];

// Matriz inicial de asignaciones
let MATRIZ_ASIGNADA: { [rolId: number]: { [moduloCodigo: string]: string[] } } = {
  1: {
    seguridad: ["ver_usuarios", "crear_usuarios", "editar_usuarios", "activar_desactivar", "gestionar_roles", "ver_bitacora"],
    personal_tecnico: ["ver_tecnicos", "gestionar_jornadas", "registrar_bloqueos", "verificar_disponibilidad"],
    clientes: ["ver_clientes", "registrar_clientes", "editar_clientes", "gestionar_establecimientos"],
    inventario: ["ver_productos", "crear_editar_productos", "gestionar_proveedores", "movimientos_kardex"],
    cotizaciones: ["ver_cotizaciones", "crear_cotizaciones", "editar_cotizaciones", "aprobar_rechazar", "generar_pdf"],
    ventas_caja: ["ver_ventas", "registrar_venta", "abrir_cerrar_caja", "realizar_arqueo"],
    ordenes_trabajo: ["ver_ordenes", "crear_ordenes", "asignar_tecnicos", "cambiar_estado_ot", "registrar_trabajo_materiales"],
    mantenimiento_alertas: ["ver_mantenimientos", "ver_tickets", "programar_mantenimiento", "visualizar_alertas"],
  },
  2: {
    seguridad: ["ver_usuarios"],
    personal_tecnico: ["ver_tecnicos", "gestionar_jornadas", "registrar_bloqueos", "verificar_disponibilidad"],
    clientes: ["ver_clientes", "registrar_clientes", "editar_clientes", "gestionar_establecimientos"],
    inventario: ["ver_productos", "crear_editar_productos", "gestionar_proveedores", "movimientos_kardex"],
    cotizaciones: ["ver_cotizaciones", "crear_cotizaciones", "editar_cotizaciones", "aprobar_rechazar", "generar_pdf"],
    ventas_caja: ["ver_ventas", "registrar_venta", "abrir_cerrar_caja", "realizar_arqueo"],
    ordenes_trabajo: ["ver_ordenes", "crear_ordenes", "asignar_tecnicos", "cambiar_estado_ot"],
    mantenimiento_alertas: ["ver_mantenimientos", "ver_tickets", "programar_mantenimiento", "visualizar_alertas"],
  },
  3: {
    seguridad: [],
    personal_tecnico: ["ver_tecnicos", "verificar_disponibilidad"],
    clientes: ["ver_clientes"],
    inventario: ["ver_productos"],
    cotizaciones: ["ver_cotizaciones"],
    ventas_caja: [],
    ordenes_trabajo: ["ver_ordenes", "cambiar_estado_ot", "registrar_trabajo_materiales"],
    mantenimiento_alertas: ["ver_mantenimientos", "ver_tickets", "visualizar_alertas"],
  },
};

// Función asíncrona de auditoría
async function registrarAuditoria(accion: string, detalle: string) {
  const log = {
    id: Date.now(),
    usuario_id: 1,
    fecha_hora: new Date().toISOString(),
    accion,
    descripcion: detalle,
  };
  console.log("📝 [BITACORA CU04/CU06]:", log);
}

// Server Action para obtener los datos
export async function fetchRolesYPermisos(): Promise<{
  roles: RolEntity[];
  modulos: ModuloGranular[];
  matriz: { [rolId: number]: { [moduloCodigo: string]: string[] } };
}> {
  return {
    roles: JSON.parse(JSON.stringify(ROLES_CATALOGO)),
    modulos: JSON.parse(JSON.stringify(MODULOS_GRANULARES)),
    matriz: JSON.parse(JSON.stringify(MATRIZ_ASIGNADA)),
  };
}

// Server Action para guardar
export async function postAsignacionPermiso(
  rolId: number,
  nuevaMatrizDelRol: { [moduloCodigo: string]: string[] }
): Promise<RespuestaAccionRoles> {
  const rol = ROLES_CATALOGO.find((r) => r.id === rolId);
  if (!rol) {
    return { ok: false, mensaje: "El rol seleccionado no es válido." };
  }

  if (rolId === 1) {
    return {
      ok: false,
      mensaje: "Aviso de seguridad: El rol Administrador Principal no puede perder permisos del sistema.",
    };
  }

  MATRIZ_ASIGNADA[rolId] = JSON.parse(JSON.stringify(nuevaMatrizDelRol));

  await registrarAuditoria(
    "CONFIGURAR_ROLES_PERMISOS",
    `Se actualizaron los permisos específicos para el rol: ${rol.nombre}`
  );

  return {
    ok: true,
    mensaje: `Permisos para el rol ${rol.nombre} actualizados y registrados en bitácora correctamente.`,
  };
}