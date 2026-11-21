// ============================================================
// Pruebas del motor de lenguaje natural del Asistente de Navegación
// por Voz global (solo ADMINISTRADOR). TypeScript real con Node.js.
//
// Ejecutar desde la raíz: node pruebas/voz/navegacion-global.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const { interpretarComandoVoz, listarDestinosVoz } = await import(
  '@/lib/voz/intenciones-navegacion'
)
const { PAQUETES } = await import('@/lib/navigation')

let pasan = 0
let fallan = 0

function prueba(nombre, fn) {
  try {
    fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  }
}

function destino(frase) {
  const r = interpretarComandoVoz(frase)
  if (r.tipo !== 'navegacion') throw new Error(`sin intención para «${frase}»`)
  return r
}

function igual(real, esperado, campo = '') {
  if (real !== esperado) throw new Error(`${campo} esperado ${esperado}, recibido ${real}`)
}

// ---------------------------------------------------------------------
// Ejemplos del enunciado
// ---------------------------------------------------------------------
prueba('«Llévame a ver los tickets de soporte» → /tickets-soporte (CU18)', () => {
  const r = destino('Llévame a ver los tickets de soporte')
  igual(r.ruta, '/tickets-soporte', 'ruta')
  igual(r.cu, 'CU18', 'cu')
})

prueba('«Quiero revisar las incidencias» → /tickets-soporte', () => {
  igual(destino('Quiero revisar las incidencias').ruta, '/tickets-soporte')
})

prueba('«Abre las órdenes de trabajo» → /ordenes-trabajo (CU12)', () => {
  const r = destino('Abre las órdenes de trabajo')
  igual(r.ruta, '/ordenes-trabajo', 'ruta')
  igual(r.cu, 'CU12', 'cu')
})

prueba('«Ver trabajos pendientes» → /ordenes-trabajo?estado=PROGRAMADA', () => {
  const r = destino('Ver trabajos pendientes')
  igual(r.ruta, '/ordenes-trabajo', 'ruta')
  igual(r.filtros.estado, 'PROGRAMADA', 'estado')
})

prueba('«Muéstrame las alertas preventivas» → /alertas (CU19)', () => {
  const r = destino('Muéstrame las alertas preventivas')
  igual(r.ruta, '/alertas', 'ruta')
  igual(r.cu, 'CU19', 'cu')
})

prueba('«Quiero ver los reportes gerenciales» → /reportes (CU20)', () => {
  const r = destino('Quiero ver los reportes gerenciales')
  igual(r.ruta, '/reportes', 'ruta')
  igual(r.cu, 'CU20', 'cu')
})

prueba('«Estadísticas» → /reportes', () => {
  igual(destino('Estadísticas').ruta, '/reportes')
})

// ---------------------------------------------------------------------
// Filtros y acciones dentro de la frase
// ---------------------------------------------------------------------
prueba('«muéstrame tickets abiertos» → ?estado=ABIERTO', () => {
  const r = destino('muéstrame tickets abiertos')
  igual(r.ruta, '/tickets-soporte', 'ruta')
  igual(r.filtros.estado, 'ABIERTO', 'estado')
})

prueba('«tickets de urgencia crítica» → ?urgencia=CRITICA', () => {
  const r = destino('tickets de urgencia crítica')
  igual(r.filtros.urgencia, 'CRITICA', 'urgencia')
})

prueba('«crear nuevo ticket» → ?accion=crear', () => {
  const r = destino('crear nuevo ticket')
  igual(r.ruta, '/tickets-soporte', 'ruta')
  igual(r.filtros.accion, 'crear', 'accion')
})

prueba('«reporte de ventas de este mes» → ?tipo=INGRESOS&atajo=ESTE_MES', () => {
  const r = destino('reporte de ventas de este mes')
  igual(r.filtros.tipo, 'INGRESOS', 'tipo')
  igual(r.filtros.atajo, 'ESTE_MES', 'atajo')
})

prueba('«alertas vencidas, todas» → ?filtro=todas', () => {
  const r = destino('alertas vencidas, todas')
  igual(r.filtros.filtro, 'todas', 'filtro')
})

prueba('«inventario con stock crítico» → ?critico=1', () => {
  igual(destino('inventario con stock crítico').filtros.critico, '1', 'critico')
})

// ---------------------------------------------------------------------
// Cobertura de TODOS los módulos del menú (P1..P4)
// ---------------------------------------------------------------------
const FRAS_POR_ID = {
  inicio: 'todos los módulos',
  usuarios: 'ir a usuarios',
  roles: 'abrir roles y permisos',
  perfil: 'mi perfil',
  bitacora: 'ver la bitácora',
  clientes: 'ir a clientes',
  cotizaciones: 'ver las cotizaciones',
  ventas: 'abrir ventas y caja',
  proveedores: 'mostrar proveedores',
  compras: 'ir a compras',
  inventario: 'muéstrame el inventario',
  servicios: 'catálogo de servicios',
  'personal-tecnico': 'ver el personal técnico',
  'asignar-tecnicos': 'asignar técnicos',
  'ordenes-trabajo': 'órdenes de trabajo',
  liquidacion: 'notas de servicio',
  'tickets-soporte': 'tickets de soporte',
  alertas: 'alertas preventivas',
  reportes: 'reportes gerenciales',
}

prueba('todos los ítems habilitados de PAQUETES son navegables por voz', () => {
  const items = PAQUETES.filter((p) => p.habilitado).flatMap((p) => p.items)
  for (const item of items) {
    const frase = FRAS_POR_ID[item.id]
    if (!frase) throw new Error(`falta frase de prueba para ${item.id}`)
    const r = destino(frase)
    igual(r.ruta, item.ruta, `ruta de ${item.id}`)
  }
})

prueba('el catálogo expone las 19 rutas del menú más 2 atajos de alta', () => {
  const esperados = PAQUETES.filter((p) => p.habilitado).reduce((n, p) => n + p.items.length, 0)
  igual(listarDestinosVoz().length, esperados + 2, 'número de destinos')
})

prueba('frase sin intención devuelve mensaje claro en español', () => {
  const r = interpretarComandoVoz('blablabla no entiendo nada')
  igual(r.tipo, 'no-entendido', 'tipo')
  if (r.tipo === 'no-entendido') {
    if (!r.mensaje.includes('No entendí')) throw new Error('mensaje incorrecto')
  }
})

console.log(`\n${pasan} pasan, ${fallan} fallan`)
if (fallan > 0) process.exitCode = 1
