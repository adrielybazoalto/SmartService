'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { getCurrentUser } from '@/lib/auth'
import { tieneAccionModulo, tienePermisoModulo } from '@/lib/permisos'
import {
  MSG_FALTA_MIGRACION,
  confirmarAnticipoTarjeta,
  faltaMigracionAnticipo,
  iniciarAnticipoTarjeta,
} from '@/backend/cotizaciones/anticipo-tarjeta'
import { PasarelaPago, obtenerUrlBase } from '@/backend/pagos/pasarela-pago'

const CLAVE_MODULO = 'COTIZACIONES'
const MSG_SIN_PERMISO = 'No autorizado: tu rol no tiene el permiso de este módulo.'

async function exigirModulo() {
  if (!(await tienePermisoModulo('/cotizaciones'))) throw new Error(MSG_SIN_PERMISO)
}

// Cambiar el estado es PROCESAR: LEER también lo tiene el Técnico.
export async function puedeProcesarCotizacionesAccion() {
  return tieneAccionModulo(CLAVE_MODULO, 'PROCESAR')
}

// Obtener lista de clientes
export async function obtenerClientesAccion() {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  const { data } = await supabase.from('cliente').select('id, nombre, documento_identidad')
  return data || []
}

// Obtener establecimientos por cliente
export async function obtenerEstablecimientosPorClienteAccion(clienteId: number) {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  const cId = Number(clienteId)
  if (!cId || isNaN(cId)) return []
  const { data, error } = await supabase
    .from('establecimiento')
    .select('*')
    .eq('cliente_id', cId)
    .order('id', { ascending: true })

  if (error) {
    console.error('Error al obtener establecimientos por cliente:', error.message)
    return []
  }
  return data || []
}

// Obtener productos activos con imagen
export async function obtenerProductosConImagen() {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  const { data } = await supabase
    .from('producto')
    .select(`
      id,
      nombre,
      precio_compra_actual,
      margen_ganancia,
      stock_disponible,
      imagen_producto (url_imagen)
    `)
  return data || []
}

// Obtener servicios técnicos
export async function obtenerServiciosTecnicosAccion() {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  const { data } = await supabase.from('servicio').select('*')
  return data || []
}

// Obtener lista completa de cotizaciones con nombre de cliente
export async function obtenerCotizacionesAccion() {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('cotizacion')
    .select(`
      *,
      cliente:cliente_id (nombre)
    `)
    .order('id', { ascending: false })

  if (error) {
    console.error('Error al obtener cotizaciones:', error.message)
    return []
  }
  return data || []
}

// Obtener cotización individual por ID con su detalle completo (productos y servicios)
export async function obtenerCotizacionPorIdAccion(id: number) {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  
  // 1. Obtener cabecera de cotización
  const { data: cot, error: errCot } = await supabase
    .from('cotizacion')
    .select('*')
    .eq('id', id)
    .single()

  if (errCot || !cot) return null

  // Obtener datos completos del cliente de forma segura
  let clienteData: any = { id: cot.cliente_id, nombre: `Cliente #${cot.cliente_id}` }
  if (cot.cliente_id) {
    const { data: cli } = await supabase
      .from('cliente')
      .select('*')
      .eq('id', cot.cliente_id)
      .single()
    if (cli) {
      clienteData = cli
    }
  }

  // Obtener datos del establecimiento / sucursal asociado
  let establecimientoData: any = null
  if (cot.establecimiento_id) {
    const { data: est } = await supabase
      .from('establecimiento')
      .select('*')
      .eq('id', cot.establecimiento_id)
      .single()
    if (est) {
      establecimientoData = est
    }
  } else if (cot.cliente_id) {
    // Si la cotización no tiene establecimiento_id explícito, obtener el establecimiento principal o primero del cliente
    const { data: ests } = await supabase
      .from('establecimiento')
      .select('*')
      .eq('cliente_id', cot.cliente_id)
      .order('id', { ascending: true })
      .limit(1)
    if (ests && ests.length > 0) {
      establecimientoData = ests[0]
    }
  }

  // 2. Obtener productos relacionados
  const { data: prods } = await supabase
    .from('detalle_cotizacion_producto')
    .select('*, producto:producto_id(nombre)')
    .eq('cotizacion_id', id)

    // 3. Obtener servicios relacionados (tabla única detalle_cotizacion_servicio;
  //    la tabla duplicada detalle_cotizacion_service se eliminó)
  const { data: servs } = await supabase
    .from('detalle_cotizacion_servicio')
    .select('*, servicio:servicio_id(nombre)')
    .eq('cotizacion_id', id)

  return {
    ...cot,
    cliente: clienteData,
    establecimiento: establecimientoData,
    productos: prods || [],
    servicios: servs || []
  }
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
export async function cambiarEstadoCotizacionAccion(id: number, nuevoEstado: string) {
  if (nuevoEstado !== 'RECHAZADA') throw new Error('Estado no permitido')
  if (!(await puedeProcesarCotizacionesAccion())) throw new Error(MSG_SIN_PERMISO)

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('cotizacion')
    .update({ estado: nuevoEstado })
    .eq('id', id)
    .eq('estado', 'PENDIENTE')
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Solo se pueden rechazar cotizaciones en estado PENDIENTE')

  try {
    const u = (await getCurrentUser()) as any
    const usuarioId = Number(u?.id ?? u?.uid) || 1
    const ip = await obtenerIpOrigen()
    await supabase.from('bitacora').insert({
      usuario_id: usuarioId,
      accion: 'CAMBIAR_ESTADO_COTIZACION',
      descripcion: `Se cambió el estado de la cotización #${id} a ${nuevoEstado}.`,
      ip,
    })
  } catch (e) {
    console.warn('[Cotizaciones] Error al auditar cambio de estado:', e)
  }

  return { success: true }
}

// Eliminar cotización
export async function eliminarCotizacionAccion(id: number) {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  // Borrarla perdería el registro del dinero recibido
  const { data: cot } = await supabase.from('cotizacion').select('anticipo_monto').eq('id', id).maybeSingle()
  if (Number(cot?.anticipo_monto ?? 0) > 0) {
    throw new Error('No se puede eliminar una cotización con anticipo registrado')
  }

  const { error } = await supabase
    .from('cotizacion')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  try {
    const u = (await getCurrentUser()) as any
    const usuarioId = Number(u?.id ?? u?.uid) || 1
    const ip = await obtenerIpOrigen()
    await supabase.from('bitacora').insert({
      usuario_id: usuarioId,
      accion: 'ELIMINAR_COTIZACION',
      descripcion: `Se eliminó la cotización #${id}.`,
      ip,
    })
  } catch (e) {
    console.warn('[Cotizaciones] Error al auditar eliminación:', e)
  }

  return { success: true }
}

// Generar el siguiente correlativo único dinámico para cotización (ej. COT-2026-0006)
export async function generarSiguienteNumeroCotizacionAccion(offset: number = 0): Promise<string> {
  await exigirModulo()
  const supabase = getSupabaseServiceClient()
  const anioActual = new Date().getFullYear()
  const prefijo = `COT-${anioActual}-`

  const { data: cotizaciones } = await supabase
    .from('cotizacion')
    .select('numero_cotizacion')
    .like('numero_cotizacion', `${prefijo}%`)

  let maxSecuencia = 0
  if (cotizaciones && cotizaciones.length > 0) {
    for (const c of cotizaciones) {
      if (c.numero_cotizacion) {
        const match = c.numero_cotizacion.match(/COT-\d{4}-(\d+)/i) || c.numero_cotizacion.match(/(\d+)$/)
        if (match && match[1]) {
          const num = parseInt(match[1], 10)
          if (!isNaN(num) && num > maxSecuencia) {
            maxSecuencia = num
          }
        }
      }
    }
  }

  const siguienteSecuencia = maxSecuencia + 1 + offset
  return `${prefijo}${String(siguienteSecuencia).padStart(4, '0')}`
}

// Registrar nueva cotización completa (Equipos + Servicios)
export async function crearCotizacionCompletaAccion(formData: {
  cliente_id: number;
  establecimiento_id: number;
  usuario_id: number;
  productos: { producto_id: number; cantidad: number; precio_unitario: number; subtotal: number }[];
  servicios: { servicio_id: number; horas_estimadas: number; precio_hora: number; subtotal: number }[];
  total: number;
}) {
  const supabase = getSupabaseServiceClient()
  try {
    await exigirModulo()
    const fechaEmision = new Date().toISOString().split('T')[0]
    const fechaVencimiento = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Generar correlativo dinámico con reintento automático ante colisión de clave única (23505)
    let cotData: any = null
    let cotError: any = null
    let correlativo = ''
    const maxIntentos = 5

    for (let intento = 0; intento < maxIntentos; intento++) {
      correlativo = await generarSiguienteNumeroCotizacionAccion(intento)

      const res = await supabase
        .from('cotizacion')
        .insert({
          cliente_id: formData.cliente_id,
          establecimiento_id: formData.establecimiento_id ? Number(formData.establecimiento_id) : null,
          usuario_id: formData.usuario_id,
          numero_cotizacion: correlativo,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          estado: 'PENDIENTE',
          total: formData.total as any
        })
        .select()
        .single()

      if (res.error) {
        if (
          res.error.code === '23505' ||
          res.error.message?.includes('cotizacion_numero_cotizacion_key') ||
          res.error.message?.includes('duplicate key value')
        ) {
          console.warn(`[Cotizaciones] Colisión detectada con correlativo ${correlativo}, reintentando (${intento + 1}/${maxIntentos})...`)
          continue
        }
        cotError = res.error
        break
      }

      cotData = res.data
      cotError = null
      break
    }

    if (cotError || !cotData) {
      throw cotError || new Error('No se pudo generar un número de cotización único tras varios intentos.')
    }

    const cotizacionId = cotData.id

    if (formData.productos.length > 0) {
      const prodsToInsert = formData.productos.map(p => ({
        cotizacion_id: cotizacionId,
        producto_id: p.producto_id,
        cantidad: p.cantidad as any,
        precio_unitario: p.precio_unitario as any,
        subtotal: p.subtotal as any
      }))
      await supabase.from('detalle_cotizacion_producto').insert(prodsToInsert)
    }

    if (formData.servicios.length > 0) {
      const servsToInsert = formData.servicios.map(s => ({
        cotizacion_id: cotizacionId,
        servicio_id: s.servicio_id,
        horas_estimadas: s.horas_estimadas as any,
        precio_hora: s.precio_hora as any,
        subtotal: s.subtotal as any
      }))
      await supabase.from('detalle_cotizacion_servicio').insert(servsToInsert)
    }

    const ipCreacion = await obtenerIpOrigen()
    await supabase.from('bitacora').insert({
      usuario_id: formData.usuario_id,
      accion: 'CREAR_COTIZACION',
      descripcion: `Se creó la cotización ${correlativo} con estado PENDIENTE.`,
      ip: ipCreacion
    })

    return { success: true, message: `Cotización ${correlativo} creada con éxito.` }
  } catch (error: any) {
    console.error('Error al crear cotización:', error.message)
    return { success: false, message: error.message }
  }
}

// Actualizar cotización existente (Equipos + Servicios + Estado)
export async function actualizarCotizacionCompletaAccion(cotizacionId: number, formData: {
  cliente_id: number;
  establecimiento_id: number;
  usuario_id: number;
  productos: { producto_id: number; cantidad: number; precio_unitario: number; subtotal: number }[];
  servicios: { servicio_id: number; horas_estimadas: number; precio_hora: number; subtotal: number }[];
  total: number;
}) {
  const supabase = getSupabaseServiceClient()
  try {
    await exigirModulo()
    // El estado no se edita aquí: aprobar exige registrar el anticipo
    const { data: actual } = await supabase.from('cotizacion').select('anticipo_monto').eq('id', cotizacionId).maybeSingle()
    if (formData.total < Number(actual?.anticipo_monto ?? 0)) {
      throw new Error('El total no puede ser menor que el anticipo registrado')
    }

    // 1. Actualizar cabecera
    const { error: cotError } = await supabase
      .from('cotizacion')
      .update({
        cliente_id: formData.cliente_id,
        establecimiento_id: formData.establecimiento_id ? Number(formData.establecimiento_id) : null,
        total: String(formData.total)
      })
      .eq('id', cotizacionId)

    if (cotError) throw cotError

    // 2. Limpiar detalles anteriores
    await supabase.from('detalle_cotizacion_producto').delete().eq('cotizacion_id', cotizacionId)
    await supabase.from('detalle_cotizacion_servicio').delete().eq('cotizacion_id', cotizacionId)

    // 3. Insertar nuevos productos
    if (formData.productos.length > 0) {
      const prodsToInsert = formData.productos.map(p => ({
        cotizacion_id: cotizacionId,
        producto_id: p.producto_id,
        cantidad: p.cantidad as any,
        precio_unitario: p.precio_unitario as any,
        subtotal: p.subtotal as any
      }))
      await supabase.from('detalle_cotizacion_producto').insert(prodsToInsert)
    }

    // 4. Insertar nuevos servicios
    if (formData.servicios.length > 0) {
      const servsToInsert = formData.servicios.map(s => ({
        cotizacion_id: cotizacionId,
        servicio_id: s.servicio_id,
        horas_estimadas: s.horas_estimadas as any,
        precio_hora: s.precio_hora as any,
        subtotal: s.subtotal as any
      }))
      await supabase.from('detalle_cotizacion_servicio').insert(servsToInsert)
    }

    // 5. Bitácora
    const ipActualizacion = await obtenerIpOrigen()
    await supabase.from('bitacora').insert({
      usuario_id: formData.usuario_id,
      accion: 'ACTUALIZAR_COTIZACION',
      descripcion: `Se actualizó la cotización #${cotizacionId} con nuevo total Bs. ${formData.total}.`,
      ip: ipActualizacion
    })

    return { success: true, message: 'Cotización actualizada con éxito.' }
  } catch (error: any) {
    console.error('Error al actualizar cotización:', error.message)
    return { success: false, message: error.message }
  }
} 