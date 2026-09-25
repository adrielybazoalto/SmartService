import { requireUser } from '@/lib/auth'
import type { Db } from '@/lib/supabase/types'
import {
  actualizarUsuarioSchema,
  asignarPermisoSchema,
  crearRolSchema,
  crearUsuarioSchema,
  type ActualizarUsuarioInput,
  type AsignarPermisoInput,
  type CrearRolInput,
  type CrearUsuarioInput,
} from './schema'
import type { NuevoRol, NuevoRolFuncion, Rol, Usuario } from './types'

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

/**
 * Usuario de NEGOCIO vinculado a la sesión activa de Supabase Auth
 * (por auth_uid o, en su defecto, por correo). Requiere sesión.
 */
export async function getUsuarioAutenticado(db: Db): Promise<Usuario> {
  const user = await requireUser()

  const filtros = [`auth_uid.eq.${user.id}`]
  if (user.email) filtros.push(`correo.eq.${user.email}`)

  const { data, error } = await db.from('usuario').select('*').or(filtros.join(',')).maybeSingle()
  if (error) throw new Error(`No se pudo cargar tu perfil: ${error.message}`)
  if (!data) {
    throw new Error('Tu cuenta de Supabase Auth no está vinculada a un usuario del sistema.')
  }
  return data
}

/**
 * Crea la credencial en Supabase Auth (email confirmado) y registra la fila
 * USUARIO vinculada por auth_uid. Requiere cliente con SERVICE ROLE.
 */
export async function crearUsuarioConAuth(
  db: Db,
  input: CrearUsuarioInput,
  password: string,
): Promise<Usuario> {
  const parsed = crearUsuarioSchema.parse(input)

  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: parsed.correo,
    password,
    email_confirm: true,
  })
  if (authError) throw new Error(`No se pudo crear la cuenta de acceso: ${authError.message}`)

  const { data, error } = await db
    .from('usuario')
    .insert({
      ...parsed,
      correo: parsed.correo.toLowerCase(),
      contrasena: null,
      auth_uid: authData.user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`No se pudo registrar el usuario: ${error.message}`)
  return data
}

/** Registra solo la fila USUARIO (usuarios de negocio sin credencial Auth inicial). */
export async function crearUsuario(db: Db, input: CrearUsuarioInput): Promise<Usuario> {
  const parsed = crearUsuarioSchema.parse(input)
  const { data, error } = await db
    .from('usuario')
    .insert({ ...parsed, correo: parsed.correo.toLowerCase(), contrasena: null })
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
  const { data, error } = await db.from('usuario').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el usuario: ${error.message}`)
  return data
}

/** Elimina fila USUARIO y su credencial en Supabase Auth (admin / service role). */
export async function eliminarUsuario(db: Db, id: number): Promise<void> {
  const { data: usuario, error: errGet } = await db
    .from('usuario')
    .select('auth_uid')
    .eq('id', id)
    .maybeSingle()
  if (errGet) throw new Error(`No se pudo consultar el usuario: ${errGet.message}`)
  if (!usuario) throw new Error('El usuario no existe.')

  if (usuario.auth_uid) {
    const { error: errAuth } = await db.auth.admin.deleteUser(usuario.auth_uid)
    if (errAuth) throw new Error(`No se pudo eliminar la cuenta de acceso: ${errAuth.message}`)
  }

  const { error } = await db.from('usuario').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el usuario: ${error.message}`)
}