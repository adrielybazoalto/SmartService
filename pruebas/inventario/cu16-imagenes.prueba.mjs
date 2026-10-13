// ============================================================
// Pruebas de FOTOGRAFÍAS de CU16 (IMAGEN_PRODUCTO, solo lectura).
//
// Ejecuta el código TypeScript REAL de src/backend/inventario y
// src/app/actions/inventario.ts con el mismo cargador y dobles que
// cu16-backend.prueba.mjs: cliente Supabase FALSO, sin red, sin BD, sin .env.
//
// Cubre: orden de las fotos, elección de la principal, URL inválidas
// (respaldo), consulta embebida desde PRODUCTO, permisos por rol y que CU16
// nunca escribe en IMAGEN_PRODUCTO. El renderizado (<img>/respaldo) no se
// ejecuta aquí: Node no carga .tsx.
//
// Ejecutar desde la raíz:  node pruebas/inventario/cu16-imagenes.prueba.mjs
// ============================================================
import './cargador-ts.mjs'

const R = await import('@/backend/inventario/reglas')
const A = await import('@/app/actions/inventario')

let pasan = 0
let fallan = 0
async function prueba(nombre, fn) {
  const err = console.error
  const warn = console.warn
  console.error = () => {}
  console.warn = () => {}
  try {
    await fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  } finally {
    console.error = err
    console.warn = warn
  }
}
const afirmar = (c, d) => { if (!c) throw new Error(d) }
const json = JSON.stringify

// ------------------------------------------------------- cliente Supabase falso
function dbFalsa(responder) {
  const llamadas = []
  return {
    llamadas,
    from(tabla) {
      const reg = { tabla, ops: [] }
      llamadas.push(reg)
      const proxy = new Proxy(function () {}, {
        get(_, prop) {
          if (prop === 'then') return (ok, ko) => Promise.resolve().then(() => responder(reg)).then(ok, ko)
          return (...args) => {
            reg.ops.push([prop, ...args])
            return proxy
          }
        },
      })
      return proxy
    },
    async rpc(fn, args) {
      const reg = { rpc: fn, args }
      llamadas.push(reg)
      return responder(reg)
    },
  }
}
const op = (reg, nombre) => reg.ops?.find((o) => o[0] === nombre)
const ok = (data) => ({ data, error: null })

const INV = 'Catálogo e Inventario'
const MATRIZ = {
  1: ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR'].map((a) => ({ funcion: { nombre: INV }, accion: { nombre: a } })),
  2: [{ funcion: { nombre: INV }, accion: { nombre: 'LEER' } }],
  3: [{ funcion: { nombre: 'Órdenes de Trabajo' }, accion: { nombre: 'LEER' } }],
}
const PERMISOS_RUTA = { 1: ['INVENTARIO'], 2: ['INVENTARIO'], 3: ['PERFIL'] }
const ADMIN = { id: 1, rol_id: 1, nombre: 'Admin', estado: true }
const ENCARGADO = { id: 2, rol_id: 2, nombre: 'Encargada', estado: true }
const TECNICO = { id: 3, rol_id: 3, nombre: 'Técnico', estado: true }

const img = (id, url, es_principal = false, orden = 1) => ({ id, url_imagen: url, es_principal, orden })
const FILA = {
  id: 7, codigo: 'CAM-01', nombre: 'Cámara IP', descripcion_tecnica: null, unidad_medida: 'unidad',
  margen_ganancia: '30.00', precio_compra_actual: '95.00', stock_disponible: '3.00', stock_minimo: '5.00',
  estado: true, categoria_producto: { id: 1, nombre: 'Cámaras' },
}

function escenario(usuario, productos) {
  const db = dbFalsa((reg) => {
    if (reg.tabla === 'rol_funcion') return ok(MATRIZ[op(reg, 'eq')?.[2]] ?? [])
    if (reg.tabla === 'producto') return ok(productos)
    throw new Error(`consulta no prevista: ${reg.tabla ?? reg.rpc}`)
  })
  globalThis.__cu16 = { usuario, permisosRuta: PERMISOS_RUTA, db, cabeceras: {}, revalidadas: [] }
  return db
}

// ======================================================= 1. Reglas puras
await prueba('URL válidas: https, http y ruta del sitio', () => {
  for (const u of ['https://cdn.ejemplo.com/a.jpg', 'http://127.0.0.1:3000/x.png', '/productos/cam.webp', '  https://e.com/b.png  ']) {
    afirmar(R.esUrlImagenValida(u), u)
  }
})
await prueba('URL inválidas: vacía, null, javascript:, data:, //host, ftp:, texto y > 500 caracteres', () => {
  const malas = [null, undefined, '', '   ', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.com/a.png', '/\\evil.com', 'ftp://h/a.png', 'foto.jpg', 'https://e.com/' + 'a'.repeat(500)]
  for (const u of malas) afirmar(!R.esUrlImagenValida(u), json(u))
})
await prueba('Orden: principal primero y adicionales por `orden` ascendente', () => {
  const r = R.separarImagenes([img(1, 'https://e.com/3.jpg', false, 3), img(2, 'https://e.com/p.jpg', true, 2), img(3, 'https://e.com/1.jpg', false, 1)])
  afirmar(r.principal?.id === 2 && r.principal.esPrincipal, json(r.principal))
  afirmar(json(r.adicionales.map((i) => i.id)) === '[3,1]', json(r.adicionales))
})
await prueba('Orden: `orden` NULL va al final y los empates se resuelven por id', () => {
  const r = R.separarImagenes([img(9, 'https://e.com/n.jpg', false, null), img(5, 'https://e.com/b.jpg', false, 2), img(4, 'https://e.com/a.jpg', false, 2), img(8, 'https://e.com/c.jpg', false, 1)])
  afirmar(r.principal?.id === 8, json(r.principal))
  afirmar(json(r.adicionales.map((i) => i.id)) === '[4,5,9]', json(r.adicionales))
  afirmar(r.adicionales[2].orden === null, 'orden NULL se conserva como null')
})
await prueba('Sin ninguna marcada como principal: se usa la primera por orden', () => {
  const r = R.separarImagenes([img(2, 'https://e.com/2.jpg', false, 2), img(1, 'https://e.com/1.jpg', false, 1)])
  afirmar(r.principal?.id === 1 && !r.principal.esPrincipal && r.adicionales.length === 1, json(r))
})
await prueba('Dos marcadas como principal (dato incoherente): gana la de menor orden, la otra pasa a adicionales', () => {
  const r = R.separarImagenes([img(1, 'https://e.com/1.jpg', true, 5), img(2, 'https://e.com/2.jpg', true, 1)])
  afirmar(r.principal?.id === 2 && r.adicionales.length === 1 && r.adicionales[0].id === 1, json(r))
})
await prueba('URL inválida se omite; si era la principal, el catálogo usa la siguiente válida', () => {
  const r = R.separarImagenes([img(1, 'javascript:alert(1)', true, 1), img(2, '', false, 2), img(3, 'https://e.com/ok.jpg', false, 3)])
  afirmar(r.principal?.id === 3 && r.adicionales.length === 0, json(r))
})
await prueba('Sin fotos (lista vacía, null o undefined) → principal null y sin adicionales (respaldo)', () => {
  for (const v of [[], null, undefined]) {
    const r = R.separarImagenes(v)
    afirmar(r.principal === null && r.adicionales.length === 0, json(v))
  }
})
await prueba('La URL se entrega recortada y el DTO no expone columnas crudas', () => {
  const r = R.separarImagenes([img(1, '  https://e.com/a.jpg ', true, 1)])
  afirmar(json(r.principal) === json({ id: 1, url: 'https://e.com/a.jpg', esPrincipal: true, orden: 1 }), json(r.principal))
})
await prueba('No altera el arreglo recibido', () => {
  const filas = [img(2, 'https://e.com/2.jpg', false, 2), img(1, 'https://e.com/1.jpg', false, 1)]
  const copia = json(filas)
  R.separarImagenes(filas)
  afirmar(json(filas) === copia, 'el arreglo original cambió')
})

// ======================================================= 2. Consulta y DTO
await prueba('Catálogo: consulta IMAGEN_PRODUCTO embebida en PRODUCTO (una sola consulta, sin tabla aparte)', async () => {
  const db = escenario(ADMIN, [{ ...FILA, imagen_producto: [] }])
  const r = await A.obtenerCatalogoAction()
  afirmar(r.ok, json(r))
  const consulta = db.llamadas.find((l) => l.tabla === 'producto')
  const select = op(consulta, 'select')?.[1] ?? ''
  afirmar(/imagen_producto\(id, url_imagen, es_principal, orden\)/.test(select), select)
  afirmar(!db.llamadas.some((l) => l.tabla === 'imagen_producto'), 'no debe consultar imagen_producto por separado')
})
await prueba('Catálogo: DTO con foto principal y adicionales en orden', async () => {
  escenario(ADMIN, [{ ...FILA, imagen_producto: [img(11, 'https://e.com/b.jpg', false, 2), img(10, 'https://e.com/p.jpg', true, 1), img(12, 'https://e.com/c.jpg', false, 3)] }])
  const r = await A.obtenerCatalogoAction()
  const p = r.ok && r.data[0]
  afirmar(p && p.imagenPrincipal?.url === 'https://e.com/p.jpg', json(p?.imagenPrincipal))
  afirmar(json(p.imagenesAdicionales.map((i) => i.id)) === '[11,12]', json(p.imagenesAdicionales))
})
await prueba('Catálogo: producto sin fotos o sin la relación (respuesta antigua) → respaldo, sin error', async () => {
  escenario(ADMIN, [{ ...FILA, imagen_producto: [] }, { ...FILA, id: 8, nombre: 'Cable' }, { ...FILA, id: 9, nombre: 'Sensor', imagen_producto: null }])
  const r = await A.obtenerCatalogoAction()
  afirmar(r.ok && r.data.length === 3, json(r))
  afirmar(r.data.every((p) => p.imagenPrincipal === null && p.imagenesAdicionales.length === 0), json(r.data))
})
await prueba('Catálogo: los demás datos del producto no cambian al agregar fotos', async () => {
  escenario(ADMIN, [{ ...FILA, imagen_producto: [img(1, 'https://e.com/a.jpg', true, 1)] }])
  const r = await A.obtenerCatalogoAction()
  const p = r.ok && r.data[0]
  afirmar(p && p.id === 7 && p.codigo === 'CAM-01' && p.stockDisponible === 3 && p.critico === true && p.categoria?.nombre === 'Cámaras', json(p))
})

// ======================================================= 3. Permisos y solo lectura
await prueba('Encargado (solo LEER) ve las fotos del catálogo', async () => {
  escenario(ENCARGADO, [{ ...FILA, imagen_producto: [img(1, 'https://e.com/a.jpg', true, 1)] }])
  const r = await A.obtenerCatalogoAction()
  afirmar(r.ok && r.data[0].imagenPrincipal?.id === 1, json(r))
})
await prueba('Técnico (sin permiso INVENTARIO) no obtiene productos ni fotos', async () => {
  const db = escenario(TECNICO, [{ ...FILA, imagen_producto: [img(1, 'https://e.com/a.jpg', true, 1)] }])
  const r = await A.obtenerCatalogoAction()
  afirmar(!r.ok && !db.llamadas.some((l) => l.tabla === 'producto'), json(r))
})
await prueba('CU16 nunca escribe en IMAGEN_PRODUCTO (sin insert/update/delete/upsert)', async () => {
  const db = escenario(ADMIN, [{ ...FILA, imagen_producto: [img(1, 'https://e.com/a.jpg', true, 1)] }])
  await A.obtenerCatalogoAction()
  await A.obtenerCatalogoAction({ solo_criticos: true })
  const escrituras = db.llamadas.filter((l) => l.ops?.some((o) => ['insert', 'update', 'delete', 'upsert'].includes(o[0])))
  afirmar(escrituras.length === 0, json(escrituras))
})

console.log(`\nTOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exitCode = fallan === 0 ? 0 : 1
