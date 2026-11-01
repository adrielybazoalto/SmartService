// ============================================================
// Pruebas de los controles mínimos de la Fase 4: permiso del módulo en las
// Server Actions.
//
// Ejecuta el código TypeScript REAL con Node.js, con dobles de sesión, permisos
// y Supabase. No usa red ni base de datos.
//
// Ejecutar desde la raíz:  node pruebas/ordenes/fase4-permisos.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const V = await import('@/app/actions/ventas')
const P = await import('@/app/actions/proveedores')
const J = await import('@/app/actions/jornadas')
const O = await import('@/app/actions/ordenes-trabajo')
const C = await import('@/app/actions/cotizaciones')

let pasan = 0
let fallan = 0
const errorOriginal = console.error
async function prueba(nombre, fn) {
  console.error = () => {}
  try {
    await fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  } finally {
    console.error = errorOriginal
  }
}

const NO_AUTORIZADO = /No autorizado: tu rol no tiene el permiso de este módulo/

/** Cliente que falla la prueba si la acción llega a tocar la base. */
const dbProhibida = new Proxy({}, {
  get() {
    throw new Error('la acción llegó a la base sin permiso')
  },
})
/** Acciones reales del Técnico: las operaciones de abajo que no le tocan deben rechazarse. */
const TECNICO = ['COTIZACIONES:LEER', 'ORDENES_TRABAJO:LEER', 'ORDENES_TRABAJO:ACTUALIZAR', 'ORDENES_TRABAJO:PROCESAR', 'PERFIL:LEER']
const sinPermiso = () => {
  globalThis.__cu16 = { db: dbProhibida, accionesPermitidas: TECNICO, usuario: { id: 3, rol: { nombre: 'TECNICO' } } }
}

/** La acción debe rechazarse, lanzando o devolviendo el error, sin tocar la base. */
async function rechaza(nombre, fn) {
  await prueba(nombre, async () => {
    sinPermiso()
    let texto = ''
    try {
      const r = await fn()
      texto = String(r?.error ?? r?.message ?? '')
    } catch (e) {
      texto = e.message
    }
    if (!NO_AUTORIZADO.test(texto)) throw new Error(`no se rechazó: ${texto || 'sin error'}`)
  })
}

await rechaza('Ventas: obtenerDatosVentas', () => V.obtenerDatosVentas())
await rechaza('Ventas: registrarVentaAction', () => V.registrarVentaAction({}))
await rechaza('Ventas: anularVentaAction', () => V.anularVentaAction(1, 'x'))
await rechaza('Proveedores: listar', () => P.listarProveedoresAction())
await rechaza('Proveedores: registrar', () => P.registrarProveedorAction({}))
await rechaza('Jornadas: listarTecnicos', () => J.listarTecnicos())
await rechaza('Jornadas: obtenerResumenPersonalTecnico', () => J.obtenerResumenPersonalTecnico())
await rechaza('Jornadas: obtenerBloqueosTecnico', () => J.obtenerBloqueosTecnico(1))
await rechaza('Jornadas: guardarJornada', () => J.guardarJornada(1, 'Lunes a Viernes', '08:00', '18:00'))
await rechaza('Jornadas: registrarBloqueo', () => J.registrarBloqueo(1, 'a', 'b', 'c', 'd'))
await rechaza('Jornadas: eliminarBloqueoAction', () => J.eliminarBloqueoAction(1))
await rechaza('Órdenes: el Técnico no convierte cotizaciones', () => O.convertirCotizacionAOrdenAccion(1, {}))
await rechaza('Órdenes: el Técnico no cambia la ventana', () => O.actualizarVentanaOrdenAccion(1, '2026-11-02', '08:00', '09:00'))
await rechaza('Órdenes: el Técnico no cancela', () => O.cancelarOrdenAccion(1))
await rechaza('Cotizaciones: eliminarCotizacionAccion', () => C.eliminarCotizacionAccion(1))
await rechaza('Cotizaciones: generarSiguienteNumeroCotizacionAccion', () => C.generarSiguienteNumeroCotizacionAccion())
await rechaza('Cotizaciones: crearCotizacionCompletaAccion', () => C.crearCotizacionCompletaAccion({ productos: [], servicios: [] }))
await rechaza('Cotizaciones: actualizarCotizacionCompletaAccion', () => C.actualizarCotizacionCompletaAccion(1, { productos: [], servicios: [] }))

console.log(`TOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exit(fallan ? 1 : 0)
