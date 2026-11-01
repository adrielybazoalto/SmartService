'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { getCurrentUser } from '@/lib/auth'
import { exigirPermiso, tieneAccionModulo, type AccionPermiso } from '@/lib/permisos'
import {
  MSG_FALTA_MIGRACION,
  confirmarAnticipoTarjeta,
  faltaMigracionAnticipo,
  iniciarAnticipoTarjeta,
} from '@/backend/cotizaciones/anticipo-tarjeta'
import {
  guardarCotizacion,
  listarClientes,
  listarCotizaciones,
  listarEstablecimientosDeCliente,
  listarProductosCotizables,
  listarServiciosCotizables,
  obtenerCotizacionCompleta,
  rechazarCotizacion,
} from '@/backend/cotizaciones/service'
import type { GuardarCotizacionInput } from '@/backend/cotizaciones/schema'
import { PasarelaPago, obtenerUrlBase } from '@/backend/pagos/pasarela-pago'

const CLAVE_MODULO = 'COTIZACIONES'
const MSG_SIN_PERMISO = 'No autorizado: tu rol no tiene el permiso de este módulo.'

/** Exige la acción y devuelve el cliente de la base. Capa delgada: la lógica va en el backend. */
async function contexto(accion: AccionPermiso = 'LEER') {
  const usuario = await exigirPermiso(CLAVE_MODULO, accion)
  return { db: getSupabaseServiceClient(), usuarioId: usuario.id }
}

// Para mostrar en la lista solo los botones que el rol puede usar
export async function permisosCotizacionesAccion() {
  const [crear, actualizar, crearOrden, procesar] = await Promise.all([
    tieneAccionModulo(CLAVE_MODULO, 'CREAR'),
    tieneAccionModulo(CLAVE_MODULO, 'ACTUALIZAR'),
    tieneAccionModulo('ORDENES_TRABAJO', 'CREAR'),
    puedeProcesarCotizacionesAccion(),
  ])
  return { crear, actualizar, crearOrden, procesar }
}

// Cambiar el estado es PROCESAR: LEER también lo tiene el Técnico.
export async function puedeProcesarCotizacionesAccion() {
  return tieneAccionModulo(CLAVE_MODULO, 'PROCESAR')
}

// Obtener lista de clientes
export async function obtenerClientesAccion() {
  const { db } = await contexto()
  return listarClientes(db)
}

// Obtener establecimientos por cliente
export async function obtenerEstablecimientosPorClienteAccion(clienteId: number) {
  const { db } = await contexto()
  const cId = Number(clienteId)
  if (!cId || isNaN(cId)) return []
  return listarEstablecimientosDeCliente(db, cId)
}

// Obtener productos activos con imagen
export async function obtenerProductosConImagen() {
  const { db } = await contexto()
  return listarProductosCotizables(db)
}

// Obtener servicios técnicos activos
export async function obtenerServiciosTecnicosAccion() {
  const { db } = await contexto()
  return listarServiciosCotizables(db)
}

// Obtener lista completa de cotizaciones con nombre de cliente
export async function obtenerCotizacionesAccion() {
  const { db } = await contexto()
  return listarCotizaciones(db)
}

// Obtener cotización individual por ID con su detalle completo (productos y servicios)
export async function obtenerCotizacionPorIdAccion(id: number) {
  const { db } = await contexto()
  return obtenerCotizacionCompleta(db, id)
}

// Aprobar la cotización y registrar el anticipo en una transacción (fn_aprobar_cotizacion).
// El usuario sale de la sesión, nunca del formulario.
export async function aprobarCotizacionAccion(
  id: number,
  anticipo: { monto: number; metodo: string | null; referencia: string | null },
) {
  try {
    const usuario = await getCurrentUser()
    if (!usuario) throw new Error('Sesión expirada. Vuelva a iniciar sesión.')
    if (!(await puedeProcesarCotizacionesAccion())) throw new Error(MSG_SIN_PERMISO)

    // database.types.ts aún no declara las funciones SQL (se regenera en la Fase 10)
    const supabase = getSupabaseServiceClient() as unknown as SupabaseClient
    const { error } = await supabase.rpc('fn_aprobar_cotizacion', {
      p_usuario_id: usuario.id,
      p_cotizacion_id: id,
      p_anticipo: anticipo.monto,
      p_metodo: anticipo.metodo,
      p_referencia: anticipo.referencia,
      p_ip: await obtenerIpOrigen(),
    })
    if (error) throw new Error(faltaMigracionAnticipo(error) ? MSG_FALTA_MIGRACION : error.message)
    return { success: true, message: 'Cotización aprobada.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo aprobar la cotización.'
    console.error('Error al aprobar cotización:', message)
    return { success: false, message }
  }
}

// Anticipo con tarjeta: crea el cobro en Stripe y devuelve su enlace
export async function iniciarAnticipoTarjetaAction(cotizacionId: number, monto: number) {
  try {
    if (!(await getCurrentUser())) throw new Error('Sesión expirada. Vuelva a iniciar sesión.')
    if (!(await puedeProcesarCotizacionesAccion())) throw new Error(MSG_SIN_PERMISO)

    const db = getSupabaseServiceClient() as unknown as SupabaseClient
    const { url } = await iniciarAnticipoTarjeta(db, new PasarelaPago(), { cotizacionId, monto }, await obtenerUrlBase())
    return { success: true, message: 'Redirigiendo a la pasarela de pago', url }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo iniciar el pago con tarjeta.'
    console.error('Error al iniciar anticipo con tarjeta:', message)
    return { success: false, message, url: null }
  }
}

// Al volver de Stripe: verifica el pago y recién entonces aprueba la cotización
export async function confirmarAnticipoTarjetaAction(sessionId: string) {
  try {
    const usuario = await getCurrentUser()
    if (!usuario) throw new Error('Sesión expirada. Vuelva a iniciar sesión.')
    if (!(await puedeProcesarCotizacionesAccion())) throw new Error(MSG_SIN_PERMISO)

    const db = getSupabaseServiceClient() as unknown as SupabaseClient
    await confirmarAnticipoTarjeta(db, new PasarelaPago(), {
      sessionId: String(sessionId),
      usuarioId: usuario.id,
      ip: await obtenerIpOrigen(),
    })
    return { success: true, message: 'Pago con tarjeta confirmado: cotización aprobada.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo confirmar el pago con tarjeta.'
    console.error('Error al confirmar anticipo con tarjeta:', message)
    return { success: false, message }
  }
}

// Rechazar cotización: solo desde PENDIENTE. Aprobar pasa por aprobarCotizacionAccion.
export async function rechazarCotizacionAccion(id: number) {
  const { db, usuarioId } = await contexto('PROCESAR')
  await rechazarCotizacion(db, id, { usuarioId, ip: await obtenerIpOrigen() })
  return { success: true }
}

// Registrar nueva cotización. El usuario sale de la sesión y los precios los calcula la base.
export async function crearCotizacionCompletaAccion(datos: GuardarCotizacionInput) {
  try {
    const { db, usuarioId } = await contexto('CREAR')
    const c = await guardarCotizacion(db, datos, { usuarioId, ip: await obtenerIpOrigen() })
    return { success: true, message: `Cotización ${c.numero_cotizacion} creada con éxito.` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la cotización.'
    console.error('Error al crear cotización:', message)
    return { success: false, message }
  }
}

// Actualizar cotización: solo en PENDIENTE. El estado no se edita aquí.
export async function actualizarCotizacionCompletaAccion(cotizacionId: number, datos: GuardarCotizacionInput) {
  try {
    const { db, usuarioId } = await contexto('ACTUALIZAR')
    await guardarCotizacion(db, datos, { usuarioId, ip: await obtenerIpOrigen(), cotizacionId })
    return { success: true, message: 'Cotización actualizada con éxito.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar la cotización.'
    console.error('Error al actualizar cotización:', message)
    return { success: false, message }
  }
}
