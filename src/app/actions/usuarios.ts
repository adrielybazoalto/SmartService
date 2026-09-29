"use server";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { registrarBitacora } from "@/backend/bitacora";

export interface RolEntity {
  id: number;
  nombre: string;
  descripcion?: string;
}

export interface UsuarioEntity {
  id: number;
  rol_id: number;
  nombre: string;
  correo: string;
  password?: string;
  telefono?: string;
  estado: boolean;
  rol?: RolEntity;
}

export interface BitacoraEntity {
  id: number;
  usuario_id: number;
  fecha_hora: string;
  accion: string;
  descripcion: string;
}

export interface RespuestaAccion {
  ok: boolean;
  mensaje: string;
  data?: any;
}

let ROLES_DATA: RolEntity[] = [
  { id: 1, nombre: "ADMINISTRADOR", descripcion: "Administrador general del sistema" },
  { id: 2, nombre: "ENCARGADO", descripcion: "Encargado de gestionar clientes, cotizaciones e inventario" },
  { id: 3, nombre: "TECNICO", descripcion: "Técnico encargado de ejecutar órdenes de trabajo y mantenimientos" },
];

let USUARIOS_DATA: UsuarioEntity[] = [
  { id: 1, rol_id: 1, nombre: "Carlos Mendoza", correo: "carlos@empresa.com", telefono: "70000001", estado: true, rol: ROLES_DATA[0] },
  { id: 2, rol_id: 2, nombre: "María Fernández", correo: "maria@empresa.com", telefono: "70000002", estado: true, rol: ROLES_DATA[1] },
  { id: 3, rol_id: 3, nombre: "Juan Pérez", correo: "juan@empresa.com", telefono: "70000003", estado: true, rol: ROLES_DATA[2] },
  { id: 4, rol_id: 3, nombre: "Pedro Ramírez", correo: "pedro@empresa.com", telefono: "70000004", estado: true, rol: ROLES_DATA[2] },
  { id: 5, rol_id: 3, nombre: "Luis Fernández", correo: "luis@empresa.com", telefono: "70000005", estado: true, rol: ROLES_DATA[2] },
  { id: 6, rol_id: 3, nombre: "Diego Castillo", correo: "diego@empresa.com", telefono: "70000006", estado: true, rol: ROLES_DATA[2] },
];

async function registrarAuditoria(accion: string, detalle: string) {
  // Trazabilidad en terminal (desarrollo) — respeta el formato histórico.
  console.log("📝 [AUDITORÍA BITÁCORA CU06]:", { accion, detalle });

  // PERSISTENCIA REAL en la tabla BITACORA (Supabase). El usuario_id siempre
  // proviene de la sesión activa; si no hay sesión, se omite (nunca se inventa
  // un id, que rompería la clave foránea usuario_id → usuario.id).
  try {
    const usuario = await getCurrentUser();
    if (!usuario) {
      console.warn("[BITÁCORA] Sin usuario en sesión; auditoría omitida:", accion);
      return;
    }
    const db = getSupabaseServiceClient();
    await registrarBitacora(db, {
      usuario_id: usuario.id,
      accion,
      descripcion: detalle,
    });
  } catch (e) {
    console.error("Error al registrar en bitácora:", e);
  }
}

export async function listarUsuarios(): Promise<UsuarioEntity[]> {
  return [...USUARIOS_DATA];
}

export async function obtenerRolesActivos(): Promise<RolEntity[]> {
  return [...ROLES_DATA];
}

export async function registrarUsuario(
  nombre: string,
  correo: string,
  contrasena: string,
  telefono: string,
  rol_id: number
): Promise<RespuestaAccion> {
  if (!nombre?.trim() || !correo?.trim() || !contrasena?.trim() || !rol_id) {
    return { ok: false, mensaje: "Todos los campos obligatorios deben ser completados." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo.trim())) {
    return { ok: false, mensaje: "El formato del correo electrónico no es válido." };
  }

  const existe = USUARIOS_DATA.some(
    (u) => u.correo.toLowerCase() === correo.trim().toLowerCase()
  );
  if (existe) {
    return { ok: false, mensaje: "El correo electrónico ya se encuentra registrado." };
  }

  const rol = ROLES_DATA.find((r) => r.id === Number(rol_id));
  const nuevoUsuario: UsuarioEntity = {
    id: USUARIOS_DATA.length ? Math.max(...USUARIOS_DATA.map((u) => u.id)) + 1 : 1,
    rol_id: Number(rol_id),
    nombre: nombre.trim(),
    correo: correo.trim().toLowerCase(),
    telefono: telefono.trim(),
    estado: true,
    rol,
  };

  USUARIOS_DATA.push(nuevoUsuario);

  await registrarAuditoria(
    "REGISTRO_USUARIO",
    `Se registró una nueva cuenta para: ${nuevoUsuario.nombre} (${nuevoUsuario.correo}) con rol ${rol?.nombre}`
  );

  return { ok: true, mensaje: "Usuario registrado exitosamente.", data: nuevoUsuario };
}

export async function actualizarUsuario(
  usuarioId: number,
  datos: { nombre: string; correo: string; telefono: string; rol_id: number }
): Promise<RespuestaAccion> {
  const index = USUARIOS_DATA.findIndex((u) => u.id === usuarioId);
  if (index === -1) {
    return { ok: false, mensaje: "El usuario a actualizar no existe en el sistema." };
  }

  const correoEnUso = USUARIOS_DATA.some(
    (u) => u.id !== usuarioId && u.correo.toLowerCase() === datos.correo.trim().toLowerCase()
  );
  if (correoEnUso) {
    return { ok: false, mensaje: "El correo electrónico ya está registrado por otro usuario." };
  }

  const rol = ROLES_DATA.find((r) => r.id === Number(datos.rol_id));
  USUARIOS_DATA[index] = {
    ...USUARIOS_DATA[index],
    nombre: datos.nombre.trim(),
    correo: datos.correo.trim().toLowerCase(),
    telefono: datos.telefono.trim(),
    rol_id: Number(datos.rol_id),
    rol,
  };

  await registrarAuditoria(
    "MODIFICACION_USUARIO",
    `Se actualizaron los datos del usuario: ${datos.nombre} (ID: ${usuarioId})`
  );

  return { ok: true, mensaje: "Datos del usuario actualizados correctamente." };
}

export async function cambiarEstadoCuenta(
  usuarioId: number,
  nuevoEstado: boolean
): Promise<RespuestaAccion> {
  const usuario = USUARIOS_DATA.find((u) => u.id === usuarioId);
  if (!usuario) {
    return { ok: false, mensaje: "Usuario no encontrado." };
  }

  if (usuarioId === 1 && !nuevoEstado) {
    return { ok: false, mensaje: "Acción denegada: No se puede desactivar al Administrador Principal." };
  }

  usuario.estado = nuevoEstado;

  await registrarAuditoria(
    "CAMBIO_ESTADO",
    `Se cambió el estado del usuario ${usuario.nombre} (ID: ${usuarioId}) a ${nuevoEstado ? "ACTIVO" : "INACTIVO"}`
  );

  return {
    ok: true,
    mensaje: `Cuenta de ${usuario.nombre} ${nuevoEstado ? "activada" : "desactivada"} exitosamente.`,
  };
}
