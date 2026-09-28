import { requireUser } from '@/lib/auth'
import type { Db } from '@/lib/supabase/types'
import { hashContrasena, verificarContrasena } from '@/lib/password'
import { registrarBitacora } from '@/backend/bitacora'
import {
  actualizarPerfilSchema,
  actualizarUsuarioSchema,
  asignarPermisoSchema,
  cambiarContrasenaSchema,
  crearRolSchema,
  crearUsuarioSchema,
  type ActualizarPerfilInput,
  type ActualizarUsuarioInput,
  type AsignarPermisoInput,
  type CambiarContrasenaInput,
  type CrearRolInput,
  type CrearUsuarioInput,
} from './schema'
import type { NuevoRol, NuevoRolFuncion, PerfilUsuario, Rol, Usuario } from './types'

// ---------------------------------------------------------------------------
// ROLES
// ---------------------------------------------------------------------------

export async function listarRoles(db: Db): Promise<Rol[]> {
  const { data, error } = await db.from('rol').select('*').order('id', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los roles: ${error.message}`)
  return data
}

export async function crearRol(db: Db, input: CrearRolInput): Promise<Rol> {
  const parsed = crearRolSchema.parse(input)
  const { data, error } = await db.from('rol').insert(parsed as NuevoRol).select().single()
  if (error) throw new Error(`No se pudo crear el rol: ${error.message}`)
  return data
}

export async function actualizarRol(db: Db, id: number, input: Partial<CrearRolInput>): Promise<Rol> {
  const parsed = crearRolSchema.partial().parse(input)
  const { data, error } = await db.from('rol').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el rol: ${error.message}`)
  return data
}

export async function eliminarRol(db: Db, id: number): Promise<void> {
  const { error } = await db.from('rol').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el rol: ${error.message}`)
}

// ---------------------------------------------------------------------------
// PERMISOS (ROL_FUNCION)
// ---------------------------------------------------------------------------

export async function asignarPermiso(db: Db, input: AsignarPermisoInput): Promise<void> {
  const parsed = asignarPermisoSchema.parse(input)
  const { error } = await db.from('rol_funcion').insert(parsed as NuevoRolFuncion)
  if (error) throw new Error(`No se pudo asignar el permiso: ${error.message}`)
}

export async function listarPermisosDelRol(db: Db, rolId: number) {
  const { data, error } = await db
    .from('rol_funcion')
    .select('*, funcion(*), accion(*)')
    .eq('rol_id', rolId)
  if (error) throw new Error(`No se pudieron cargar los permisos: ${error.message}`)
  return data
}

// ---------------------------------------------------------------------------
// USUARIOS
// ---------------------------------------------------------------------------

export async function listarUsuarios(db: Db): Promise<Usuario[]> {
  const { data, error } = await db.from('usuario').select('*').order('id', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`)
  return data
}

export async function getUsuarioPorId(db: Db, id: number): Promise<Usuario> {
  const { data, error } = await db.from('usuario').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el usuario: ${error.message}`)
  return data
}

export async function getUsuarioPorCorreo(db: Db, correo: string): Promise<Usuario | null> {
  const { data, error } = await db
    .from('usuario')
    .select('*')
    .eq('correo', correo.toLowerCase())
    .maybeSingle()
  if (error) throw new Error(`No se pudo consultar el usuario: ${error.message}`)
  return data
}

/** Usuario de NEGOCIO de la sesión activa (JWT propia, cookie firmada). */
export async function getUsuarioAutenticado(): Promise<Usuario> {
  return requireUser()
}

// ---------------------------------------------------------------------------
// PERFIL PERSONAL (CU05)
// ---------------------------------------------------------------------------

/** Perfil del usuario autenticado con el nombre de su rol. */
export async function getPerfil(db: Db): Promise<PerfilUsuario> {
  const usuario = await requireUser()

  const { data, error } = await db
    .from('usuario')
    .select('*, rol(nombre)')
    .eq('id', usuario.id)
    .single()
  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`)
  return data as PerfilUsuario
}

/**
 * Actualiza nombre y teléfono del propio perfil (CU05).
 * El correo, el rol y el estado no se tocan aquí (solo lectura).
 * Registra OBLIGATORIAMENTE el evento `ACTUALIZAR_PERFIL` en BITACORA.
 */
export async function actualizarPerfil(
  db: Db,
  usuarioId: number,
  input: ActualizarPerfilInput,
): Promise<Usuario> {
  const parsed = actualizarPerfilSchema.parse(input)

  // Estado previo para describir el cambio en la bitácora
  const { data: previo, error: errPrev } = await db
    .from('usuario')
    .select('*')
    .eq('id', usuarioId)
    .maybeSingle()
  if (errPrev || !previo) throw new Error('No se encontró el usuario.')

  const { data, error } = await db
    .from('usuario')
    .update({ nombre: parsed.nombre, telefono: parsed.telefono ?? null })
    .eq('id', usuarioId)
    .select()
    .single()
  if (error) throw new Error(`No se pudo actualizar el perfil: ${error.message}`)

  // BITÁCORA (CU05): registro obligatorio con la descripción del cambio
  const telefonoPrev = previo.telefono ?? null
  const telefonoNuevo = parsed.telefono ?? null
  const cambios: string[] = []
  if (previo.nombre !== parsed.nombre) {
    cambios.push(`nombre "${previo.nombre}" → "${parsed.nombre}"`)
  }
  if (telefonoPrev !== telefonoNuevo) {
    cambios.push(`teléfono "${telefonoPrev ?? '—'}" → "${telefonoNuevo ?? '—'}"`)
  }
  const descripcion =
    cambios.length > 0
      ? `Perfil actualizado: ${cambios.join('; ')}.`
      : 'Perfil actualizado (sin cambios detectados en nombre ni teléfono).'

  await registrarBitacora(db, {
    usuario_id: usuarioId,
    accion: 'ACTUALIZAR_PERFIL',
    descripcion,
  })

  return data
}

/**
 * Crea un usuario del sistema. `contrasena` llega en texto plano SOLO desde
 * el Server Action; aquí se guarda su hash bcrypt (bcryptjs) en la BD.
 */
export async function crearUsuario(db: Db, input: CrearUsuarioInput): Promise<Usuario> {
  const parsed = crearUsuarioSchema.parse(input)
  const contrasenaHash = await hashContrasena(parsed.contrasena)

  const { data, error } = await db
    .from('usuario')
    .insert({
      ...parsed,
      correo: parsed.correo.toLowerCase(),
      contrasena: contrasenaHash,
    })
    .select()
    .single()
  if (error) throw new Error(`No se pudo registrar el usuario: ${error.message}`)
  return data
}

export async function actualizarUsuario(
  db: Db,
  id: number,
  input: ActualizarUsuarioInput,
): Promise<Usuario> {
  const parsed = actualizarUsuarioSchema.parse(input)
  const { contrasena, ...resto } = parsed

  let updates: ActualizarUsuarioInput = { ...resto }
  if (contrasena !== undefined) {
    updates = { ...updates, contrasena: await hashContrasena(contrasena) }
  }

  const { data, error } = await db.from('usuario').update(updates).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el usuario: ${error.message}`)
  return data
}

/** Cambia la contraseña del propio perfil tras verificar la actual. */
export async function cambiarContrasena(
  db: Db,
  usuarioId: number,
  input: CambiarContrasenaInput,
): Promise<void> {
  const parsed = cambiarContrasenaSchema.parse(input)

  const { data: usuario, error: errGet } = await db
    .from('usuario')
    .select('contrasena')
    .eq('id', usuarioId)
    .maybeSingle()
  if (errGet || !usuario) throw new Error('El usuario no existe.')

  const valido = await verificarContrasena(parsed.contrasenaActual, usuario.contrasena)
  if (!valido) throw new Error('La contraseña actual es incorrecta.')

  const { error } = await db
    .from('usuario')
    .update({ contrasena: await hashContrasena(parsed.contrasenaNueva) })
    .eq('id', usuarioId)
  if (error) throw new Error(`No se pudo actualizar la contraseña: ${error.message}`)
}

/** Elimina la fila USUARIO (ya no hay credencial en Supabase Auth). */
export async function eliminarUsuario(db: Db, id: number): Promise<void> {
  const { error } = await db.from('usuario').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el usuario: ${error.message}`)
}