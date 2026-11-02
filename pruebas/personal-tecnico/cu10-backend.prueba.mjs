// ============================================================
// Pruebas del BACKEND de CU10 (Configurar Jornadas y Bloqueos).
//
// Ejecuta el código TypeScript REAL con Node.js y un cliente Supabase FALSO que
// registra cada escritura. No usa red, Supabase ni base de datos.
//
// Ejecutar desde la raíz:  node pruebas/personal-tecnico/cu10-backend.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const S = await import('@/backend/personal-tecnico/service')
const { TIPOS_AUSENCIA } = await import('@/backend/personal-tecnico/schema')

let pasan = 0
let fallan = 0
const errorOriginal = console.error
async function prueba(nombre, fn) {
  const silenciados = []
  console.error = (...a) => silenciados.push(a)
  try {
    await fn(silenciados)
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  } finally {
    console.error = errorOriginal
  }
}
function igual(real, esperado) {
  const [a, b] = [JSON.stringify(real), JSON.stringify(esperado)]
  if (a !== b) throw new Error(`esperado ${b}, recibido ${a}`)
}

const TECNICO = { estado: true, rol: { nombre: 'TECNICO' } }

/** Cliente falso: `usuario` y `bloqueo` responden a las lecturas; `escrituras` registra las demás. */
function dbFalsa({ usuario = TECNICO, bloqueo = null, errorEscritura = null, borrados = [{ id: 1 }], rolId = 7 } = {}) {
  const escrituras = []
  const filtros = []
  const db = {
    from(tabla) {
      let operacion = null
      const q = {
        select: () => q,
        eq(c, v) { filtros.push([tabla, c, v]); return q },
        order: () => q,
        limit: () => q,
        insert(x) { escrituras.push(['insert', tabla, x]); operacion = 'insert'; return q },
        update(x) { escrituras.push(['update', tabla, x]); operacion = 'update'; return q },
        delete() { escrituras.push(['delete', tabla]); operacion = 'delete'; return q },
        maybeSingle: async () => {
          if (tabla === 'usuario') return { data: usuario, error: null }
          if (tabla === 'rol') return { data: rolId ? { id: rolId } : null, error: null }
          if (tabla === 'bloqueo_tecnico') return { data: bloqueo, error: null }
          return { data: null, error: null }
        },
        then: (ok) => ok(operacion === 'delete'
          ? { data: errorEscritura ? null : borrados, error: errorEscritura }
          : { data: [], error: errorEscritura }),
      }
      return q
    },
  }
  return { db, escrituras, filtros }
}

const JORNADA = { usuario_id: 5, dia_semana: 'Lunes a Viernes', hora_inicio: '08:00', hora_fin: '18:00' }
const BLOQUEO = { usuario_id: 5, fecha_inicio: '2026-11-03T08:00', fecha_fin: '2026-11-03T12:00', motivo: 'Trámite', tipo: 'Feriado' }

// ---------- Técnico activo ----------
for (const [nombre, usuario] of [
  ['usuario inexistente', null],
  ['usuario inactivo', { ...TECNICO, estado: false }],
  ['usuario de otro rol', { estado: true, rol: { nombre: 'ENCARGADO' } }],
]) {
  await prueba(`Jornada: rechaza ${nombre}`, async () => {
    const d = dbFalsa({ usuario })
    igual(await S.guardarJornada(d.db, JORNADA), { success: false, message: 'El usuario seleccionado no es un técnico activo' })
    igual(d.escrituras, [])
  })
  await prueba(`Bloqueo: rechaza ${nombre}`, async () => {
    const d = dbFalsa({ usuario })
    igual(await S.registrarBloqueo(d.db, BLOQUEO), { success: false, message: 'El usuario seleccionado no es un técnico activo' })
    igual(d.escrituras, [])
  })
}
await prueba('Listar técnicos: busca el rol por nombre, no rol_id = 3', async () => {
  const d = dbFalsa({ rolId: 42 })
  await S.listarTecnicos(d.db)
  igual(d.filtros.filter(([t, c]) => t === 'rol' || c === 'rol_id'), [['rol', 'nombre', 'TECNICO'], ['usuario', 'rol_id', 42]])
})

// ---------- Tipos de ausencia ----------
await prueba('Tipos de ausencia del documento', () => {
  igual([...TIPOS_AUSENCIA], ['Vacaciones', 'Baja Médica', 'Permiso Particular', 'Feriado', 'Capacitación'])
})
for (const tipo of TIPOS_AUSENCIA) {
  await prueba(`Bloqueo: acepta ${tipo}`, async () => {
    igual((await S.registrarBloqueo(dbFalsa().db, { ...BLOQUEO, tipo })).success, true)
  })
}
await prueba('Bloqueo: rechaza Misión Oficial', async () => {
  const d = dbFalsa()
  igual((await S.registrarBloqueo(d.db, { ...BLOQUEO, tipo: 'Misión Oficial' })).success, false)
  igual(d.escrituras, [])
})

// ---------- Días ----------
for (const dias of ['Lunes a Viernes', 'Lunes a Sábado', 'Lunes a Domingo', 'Fines de Semana']) {
  await prueba(`Jornada: acepta ${dias}`, async () => {
    igual((await S.guardarJornada(dbFalsa().db, { ...JORNADA, dia_semana: dias })).success, true)
  })
}
await prueba('Jornada: rechaza días no reconocidos', async () => {
  const d = dbFalsa()
  const r = await S.guardarJornada(d.db, { ...JORNADA, dia_semana: 'Cuando pueda' })
  igual(r, { success: false, message: "Días no reconocidos. Use por ejemplo 'Lunes a Viernes' o 'Lunes, Miércoles y Viernes'" })
  igual(d.escrituras, [])
})

// ---------- Fechas ----------
await prueba('Bloqueo: guarda la fecha tal cual, sin pasar a UTC', async () => {
  const d = dbFalsa()
  await S.registrarBloqueo(d.db, BLOQUEO)
  const [, , fila] = d.escrituras[0]
  igual([fila.fecha_inicio, fila.fecha_fin], ['2026-11-03T08:00', '2026-11-03T12:00'])
})
await prueba('Bloqueo: fin no posterior al inicio', async () => {
  const r = await S.registrarBloqueo(dbFalsa().db, { ...BLOQUEO, fecha_fin: BLOQUEO.fecha_inicio })
  igual(r, { success: false, message: 'La fecha y hora de fin deben ser posteriores a las de inicio' })
})
await prueba('Bloqueo: rechaza fechas con zona horaria', async () => {
  const r = await S.registrarBloqueo(dbFalsa().db, { ...BLOQUEO, fecha_inicio: '2026-11-03T08:00:00.000Z' })
  igual(r.success, false)
})

// ---------- Eliminar bloqueo ----------
const FILA = { tipo: 'Feriado', fecha_inicio: '2026-11-03T08:00:00', fecha_fin: '2026-11-03T12:00:00', usuario: { nombre: 'Ana' } }
await prueba('Eliminar: inexistente no borra', async () => {
  const d = dbFalsa({ bloqueo: null })
  igual(await S.eliminarBloqueo(d.db, 1), { success: false, message: 'El bloqueo no existe o ya fue eliminado' })
  igual(d.escrituras, [])
})
await prueba('Eliminar: si otro lo borró antes, avisa', async () => {
  const d = dbFalsa({ bloqueo: FILA, borrados: [] })
  igual(await S.eliminarBloqueo(d.db, 1), { success: false, message: 'El bloqueo no existe o ya fue eliminado' })
})
await prueba('Eliminar: devuelve técnico, tipo y fechas para la bitácora', async () => {
  const r = await S.eliminarBloqueo(dbFalsa({ bloqueo: FILA }).db, 1)
  igual(r.success, true)
  igual(r.detalle, 'técnico Ana, tipo Feriado, del 2026-11-03 08:00 al 2026-11-03 12:00')
})

// ---------- Mensajes ----------
const ERROR_BD = { message: 'duplicate key value violates unique constraint "secreto"' }
await prueba('Mensajes: el error de la base no llega al usuario', async (log) => {
  for (const r of [
    await S.guardarJornada(dbFalsa({ errorEscritura: ERROR_BD }).db, JORNADA),
    await S.registrarBloqueo(dbFalsa({ errorEscritura: ERROR_BD }).db, BLOQUEO),
    await S.eliminarBloqueo(dbFalsa({ bloqueo: FILA, errorEscritura: ERROR_BD }).db, 1),
  ]) {
    igual(r.success, false)
    if (r.message.includes('secreto')) throw new Error(r.message)
  }
  igual(log.length, 3)
})

console.log(`TOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exit(fallan ? 1 : 0)
