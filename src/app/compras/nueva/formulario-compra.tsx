'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type FormEvent } from 'react'
import {
  listarProductosCompraAction,
  registrarCompraAction,
  verificarDocumentoCompraAction,
} from '@/app/actions/compras'
import type { RegistrarCompraInput } from '@/backend/compras/schema'
import { MAX_LINEAS_COMPRA, type ProductoCompraDTO, type ProveedorCompraDTO } from '@/backend/compras/types'
import { AccionesFormulario, Campo, ErrorFormulario, Modal, Spinner } from '../../inventario/componentes'
import { formatoBs, formatoCantidad } from '../../inventario/formato'
import { EtiquetaDocumento } from '../componentes'
import {
  costoSugerido,
  crearCandadoEnvio,
  documentoAVerificar,
  filtrarProductos,
  formatoFechaCompra,
  leerImporte,
  resumenFormulario,
  validarCompra,
  type LineaFormulario,
  type ValoresCompra,
} from '../logica'

/**
 * Formulario de CU15 (pasos 2–6 del flujo): proveedor, documento, fecha,
 * productos con cantidad y costo, subtotales y total, confirmación y registro.
 *
 * NO escribe stock ni kárdex: envía la compra a registrarCompraAction, que
 * llama a fn_registrar_compra (una sola transacción en la BD). Valida en el
 * cliente con el mismo esquema Zod del backend solo para mostrar errores.
 */

type EstadoDocumento =
  | { estado: 'sin_verificar' }
  | { estado: 'verificando'; clave: string }
  | { estado: 'disponible'; clave: string }
  | { estado: 'duplicado'; clave: string; compraId: number | null }
  | { estado: 'no_verificado'; clave: string }

const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Intente nuevamente.'

export function FormularioCompra({
  proveedores,
  productosIniciales,
  errorProductosInicial,
  hoy,
}: {
  proveedores: ProveedorCompraDTO[]
  productosIniciales: ProductoCompraDTO[]
  errorProductosInicial: string | null
  hoy: string
}) {
  const router = useRouter()
  const [v, setV] = useState<ValoresCompra>({
    proveedorId: '',
    fechaCompra: hoy,
    tipoDocumento: '',
    nroDocumento: '',
    observacion: '',
    lineas: [],
  })
  const [productos, setProductos] = useState(productosIniciales)
  const [errorProductos, setErrorProductos] = useState(errorProductosInicial)
  const [cargandoProductos, setCargandoProductos] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [documento, setDocumento] = useState<EstadoDocumento>({ estado: 'sin_verificar' })
  /** Entrada exacta que se confirmó (lo que se envía es lo que se vio). */
  const [aConfirmar, setAConfirmar] = useState<RegistrarCompraInput | null>(null)
  const [registrada, setRegistrada] = useState<number | null>(null)
  const [pendiente, iniciar] = useTransition()

  // Candado síncrono contra doble clic / doble Enter (ver crearCandadoEnvio)
  const [candado] = useState(crearCandadoEnvio)
  // Descarta respuestas viejas si el usuario cambia de proveedor o documento rápido
  const peticionProductos = useRef(0)
  const claveDocumento = useRef('')

  const porId = new Map(productos.map((p) => [p.id, p]))
  const proveedor = proveedores.find((p) => String(p.id) === v.proveedorId) ?? null
  const { subtotales, total, completas } = resumenFormulario(v.lineas)
  const enLineas = new Set(v.lineas.map((l) => l.productoId))
  const resultados = busqueda.trim() ? filtrarProductos(productos, busqueda) : []
  const bloqueado = pendiente || registrada !== null
  const limiteLineas = v.lineas.length >= MAX_LINEAS_COMPRA

  function limpiarError(...rutas: string[]) {
    if (!rutas.some((r) => errores[r])) return
    setErrores((e) => {
      const copia = { ...e }
      for (const r of rutas) delete copia[r]
      return copia
    })
  }

  // ------------------------------------------------- aviso de duplicado

  async function verificarDocumento(datos: Pick<ValoresCompra, 'proveedorId' | 'tipoDocumento' | 'nroDocumento'>) {
    const doc = documentoAVerificar(datos)
    claveDocumento.current = doc?.clave ?? ''
    if (!doc) {
      setDocumento({ estado: 'sin_verificar' })
      return
    }
    setDocumento({ estado: 'verificando', clave: doc.clave })
    try {
      const r = await verificarDocumentoCompraAction(doc.entrada)
      if (claveDocumento.current !== doc.clave) return
      if (!r.ok) setDocumento({ estado: 'no_verificado', clave: doc.clave })
      else if (r.data.disponible) setDocumento({ estado: 'disponible', clave: doc.clave })
      else setDocumento({ estado: 'duplicado', clave: doc.clave, compraId: r.data.compraId })
    } catch {
      if (claveDocumento.current === doc.clave) setDocumento({ estado: 'no_verificado', clave: doc.clave })
    }
  }

  // ------------------------------------------------------------ proveedor

  async function cambiarProveedor(proveedorId: string) {
    const siguiente = { ...v, proveedorId }
    setV(siguiente)
    limpiarError('proveedor_id')
    void verificarDocumento(siguiente)
    // Recarga el catálogo con el precio pactado de este proveedor (referencia de costo)
    const n = ++peticionProductos.current
    setCargandoProductos(true)
    try {
      const r = await listarProductosCompraAction(proveedorId ? { proveedor_id: proveedorId } : {})
      if (n !== peticionProductos.current) return
      if (r.ok) {
        setProductos(r.data)
        setErrorProductos(null)
      } else {
        setErrorProductos(r.mensaje)
      }
    } catch {
      if (n === peticionProductos.current) setErrorProductos(MENSAJE_SIN_CONEXION)
    } finally {
      if (n === peticionProductos.current) setCargandoProductos(false)
    }
  }

  // --------------------------------------------------------------- líneas

  function agregarProducto(p: ProductoCompraDTO) {
    if (enLineas.has(p.id) || limiteLineas) return
    setV((a) => ({ ...a, lineas: [...a.lineas, { productoId: p.id, cantidad: '', costoUnitario: costoSugerido(p) }] }))
    setBusqueda('')
    limpiarError('items')
    // Lleva el foco a la cantidad de la nueva línea
    setTimeout(() => document.getElementById(`linea-${p.id}-cantidad`)?.focus(), 0)
  }

  function cambiarLinea(indice: number, campo: 'cantidad' | 'costoUnitario', valor: string) {
    setV((a) => ({ ...a, lineas: a.lineas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)) }))
    limpiarError(`items.${indice}.${campo === 'cantidad' ? 'cantidad' : 'costo_unitario'}`, 'items')
  }

  function quitarLinea(indice: number) {
    setV((a) => ({ ...a, lineas: a.lineas.filter((_, i) => i !== indice) }))
    // Los errores por línea están indexados: se recalculan al volver a enviar
    setErrores((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('items'))))
  }

  // ---------------------------------------------------- revisar y registrar

  function alRevisar(e: FormEvent) {
    e.preventDefault()
    if (bloqueado) return
    setErrorServidor(null)
    const r = validarCompra(v)
    if (!r.ok) {
      setErrores(r.errores)
      setErrorServidor(r.errores._ ?? 'Revise los campos marcados antes de continuar.')
      return
    }
    setErrores({})
    if (documento.estado === 'duplicado') {
      setErrores({ nro_documento: 'Documento ya registrado: ese número de factura o nota ya existe para el proveedor' })
      return
    }
    setAConfirmar(r.entrada)
  }

  function confirmarRegistro(e: FormEvent) {
    e.preventDefault()
    const entrada = aConfirmar
    if (!entrada || !candado.tomar()) return
    setErrorServidor(null)
    iniciar(async () => {
      try {
        const r = await registrarCompraAction(entrada)
        if (r.ok) {
          candado.finalizar()
          setRegistrada(r.data.compraId)
          setAConfirmar(null)
          router.replace(`/compras/${r.data.compraId}?registrada=1`)
          return
        }
        candado.liberar()
        setAConfirmar(null)
        setErrorServidor(r.mensaje)
        if (/documento ya registrado/i.test(r.mensaje)) {
          setDocumento({ estado: 'duplicado', clave: claveDocumento.current, compraId: null })
          setErrores({ nro_documento: r.mensaje })
        }
      } catch {
        // La compra pudo o no confirmarse; reintentar es seguro: la BD rechaza el documento repetido
        candado.liberar()
        setAConfirmar(null)
        setErrorServidor(`${MENSAJE_SIN_CONEXION} Si la compra llegó a registrarse, aparecerá en el listado y el sistema rechazará el documento repetido.`)
      }
    })
  }

  // ------------------------------------------------------------------ vista

  if (proveedores.length === 0) {
    return (
      <div className="tarjeta flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-slate-600">No hay proveedores activos registrados. Se necesita al menos uno para registrar una compra.</p>
        <Link href="/compras" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Volver a compras
        </Link>
      </div>
    )
  }

  const describir = (ruta: string) => (errores[ruta] ? { 'aria-invalid': true, 'aria-describedby': `${ruta.replace(/\./g, '-')}-error` } : {})
  const etiqueta = 'mb-1 block text-xs font-semibold text-slate-600'

  return (
    <>
      <form onSubmit={alRevisar} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <fieldset disabled={bloqueado} className="flex min-w-0 flex-col gap-6">
          {/* ---------------------------------------- datos del documento */}
          <section aria-labelledby="sec-documento" className="tarjeta p-5 sm:p-6">
            <h2 id="sec-documento" className="text-base font-bold text-slate-900">
              1. Proveedor y documento
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo etiqueta="Proveedor" htmlFor="proveedor_id" obligatorio error={errores.proveedor_id}>
                  <select
                    id="proveedor_id"
                    value={v.proveedorId}
                    onChange={(e) => void cambiarProveedor(e.target.value)}
                    className="campo-select"
                    {...describir('proveedor_id')}
                  >
                    <option value="">Seleccione un proveedor activo…</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.razonSocial}
                        {p.nit ? ` — NIT ${p.nit}` : ''}
                      </option>
                    ))}
                  </select>
                </Campo>
                {proveedor && (proveedor.contacto || proveedor.telefono) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[proveedor.contacto, proveedor.telefono].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <fieldset>
                <legend className={etiqueta}>
                  Tipo de documento<span className="text-rose-500"> *</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['FACTURA', 'NOTA'] as const).map((tipo) => (
                    <label
                      key={tipo}
                      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-lime-300 ${
                        v.tipoDocumento === tipo
                          ? 'border-lime-400 bg-lime-50 text-slate-900'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tipo_documento"
                        value={tipo}
                        checked={v.tipoDocumento === tipo}
                        aria-describedby={errores.tipo_documento ? 'tipo_documento-error' : undefined}
                        onChange={() => {
                          const siguiente = { ...v, tipoDocumento: tipo }
                          setV(siguiente)
                          limpiarError('tipo_documento')
                          void verificarDocumento(siguiente)
                        }}
                        className="sr-only"
                      />
                      {tipo === 'FACTURA' ? 'Factura' : 'Nota'}
                    </label>
                  ))}
                </div>
                {errores.tipo_documento && (
                  <p id="tipo_documento-error" className="mt-1 text-xs font-medium text-rose-600">
                    {errores.tipo_documento}
                  </p>
                )}
              </fieldset>

              <div>
                <Campo etiqueta="Número de factura o nota" htmlFor="nro_documento" obligatorio error={errores.nro_documento}>
                  <input
                    id="nro_documento"
                    value={v.nroDocumento}
                    onChange={(e) => {
                      setV({ ...v, nroDocumento: e.target.value })
                      limpiarError('nro_documento')
                      if (documento.estado !== 'sin_verificar') {
                        claveDocumento.current = ''
                        setDocumento({ estado: 'sin_verificar' })
                      }
                    }}
                    onBlur={() => void verificarDocumento(v)}
                    maxLength={50}
                    autoComplete="off"
                    placeholder="Ej. 001-2345"
                    className="campo-input font-mono"
                    {...describir('nro_documento')}
                  />
                </Campo>
                <AvisoDocumento documento={documento} />
              </div>

              <Campo etiqueta="Fecha de compra" htmlFor="fecha_compra" obligatorio error={errores.fecha_compra} ayuda="No puede ser una fecha futura.">
                <input
                  id="fecha_compra"
                  type="date"
                  value={v.fechaCompra}
                  max={hoy}
                  onChange={(e) => {
                    setV({ ...v, fechaCompra: e.target.value })
                    limpiarError('fecha_compra')
                  }}
                  className="campo-input"
                  {...describir('fecha_compra')}
                />
              </Campo>

              <div className="sm:col-span-2">
                <Campo
                  etiqueta="Observaciones"
                  htmlFor="observacion"
                  error={errores.observacion}
                  ayuda={`${v.observacion.length}/1000 · opcional`}
                >
                  <textarea
                    id="observacion"
                    value={v.observacion}
                    onChange={(e) => {
                      setV({ ...v, observacion: e.target.value })
                      limpiarError('observacion')
                    }}
                    rows={2}
                    maxLength={1000}
                    className="campo-input"
                    {...describir('observacion')}
                  />
                </Campo>
              </div>
            </div>
          </section>

          {/* --------------------------------------------------- productos */}
          <section aria-labelledby="sec-productos" className="tarjeta p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="sec-productos" className="text-base font-bold text-slate-900">
                2. Productos comprados
              </h2>
              <p className="text-xs text-slate-500">
                {v.lineas.length} / {MAX_LINEAS_COMPRA} líneas
              </p>
            </div>

            {/* Búsqueda */}
            <div className="relative mt-4">
              <label htmlFor="buscar-producto" className={etiqueta}>
                Buscar producto
              </label>
              <div className="relative">
                <input
                  id="buscar-producto"
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter agrega el primer resultado en lugar de enviar el formulario
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const primero = resultados.find((p) => !enLineas.has(p.id))
                      if (primero) agregarProducto(primero)
                    }
                  }}
                  maxLength={100}
                  autoComplete="off"
                  placeholder={limiteLineas ? 'Se alcanzó el máximo de líneas' : 'Nombre o código del producto…'}
                  disabled={limiteLineas}
                  aria-controls="resultados-productos"
                  className="campo-input pr-10"
                />
                {cargandoProductos && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Spinner />
                  </span>
                )}
              </div>
              {errorProductos && <p className="mt-2 text-xs font-medium text-rose-600">⚠ {errorProductos}</p>}

              {busqueda.trim() && (
                <ul id="resultados-productos" aria-label="Resultados de la búsqueda" className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  {resultados.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-slate-500">
                      {productos.length === 0 ? 'No hay productos activos en el catálogo.' : 'Ningún producto activo coincide con la búsqueda.'}
                    </li>
                  ) : (
                    resultados.map((p) => {
                      const agregado = enLineas.has(p.id)
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{p.nombre}</p>
                            <p className="truncate text-xs text-slate-500">
                              <span className="font-mono">{p.codigo ?? 's/c'}</span> · Stock {formatoCantidad(p.stockDisponible)} {p.unidadMedida}
                              {p.precioPactado !== null && ` · Pactado ${formatoBs(p.precioPactado)}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => agregarProducto(p)}
                            disabled={agregado || limiteLineas}
                            className="shrink-0 cursor-pointer rounded-lg bg-lime-100 px-2.5 py-1.5 text-xs font-semibold text-lime-800 transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            {agregado ? 'Agregado' : '+ Agregar'}
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              )}
            </div>

            {errores.items && (
              <p id="items-error" role="alert" className="mt-3 text-xs font-medium text-rose-600">
                {errores.items}
              </p>
            )}

            {/* Líneas */}
            {v.lineas.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Aún no agregó productos. Búsquelos por nombre o código.
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {v.lineas.map((l, i) => (
                  <FilaLinea
                    key={l.productoId}
                    indice={i}
                    linea={l}
                    producto={porId.get(l.productoId) ?? null}
                    subtotal={subtotales[i]}
                    errores={errores}
                    onCambiar={cambiarLinea}
                    onQuitar={quitarLinea}
                  />
                ))}
              </ol>
            )}
          </section>
        </fieldset>

        {/* ------------------------------------------------------- resumen */}
        <aside aria-label="Resumen de la compra" className="tarjeta flex flex-col gap-4 p-5 lg:sticky lg:top-6">
          <h2 className="text-base font-bold text-slate-900">Resumen</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Proveedor</dt>
              <dd className="text-right font-medium text-slate-800">{proveedor?.razonSocial ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Documento</dt>
              <dd className="text-right font-medium text-slate-800">
                {v.tipoDocumento ? `${v.tipoDocumento === 'FACTURA' ? 'Factura' : 'Nota'} ${v.nroDocumento.trim()}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Productos</dt>
              <dd className="text-right font-medium text-slate-800">
                {v.lineas.length}
                {completas < v.lineas.length && <span className="text-xs font-normal text-amber-600"> ({v.lineas.length - completas} incompleta{v.lineas.length - completas === 1 ? '' : 's'})</span>}
              </dd>
            </div>
          </dl>
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-white" aria-live="polite">
            <p className="text-xs uppercase tracking-wider text-slate-300">Total de la compra</p>
            <p className="mt-0.5 text-2xl font-bold">{formatoBs(total)}</p>
          </div>
          <p className="text-xs text-slate-500">
            Al registrar, el sistema ingresa los productos al almacén: actualiza el stock y genera una entrada «Compra» en el kárdex de cada uno.
          </p>
          <ErrorFormulario mensaje={errorServidor} />
          {registrada !== null ? (
            <p role="status" className="mensaje-exito">
              ✓ Compra #{registrada} registrada. Abriendo el comprobante…
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <button type="submit" disabled={bloqueado || v.lineas.length === 0} className="btn-primario w-full">
                Revisar y registrar
              </button>
              <Link href="/compras" className="rounded-xl px-4 py-2 text-center text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">
                Cancelar
              </Link>
            </div>
          )}
        </aside>
      </form>

      {aConfirmar && (
        <ConfirmarCompra
          entrada={aConfirmar}
          proveedor={proveedor}
          productos={porId}
          pendiente={pendiente}
          onConfirmar={confirmarRegistro}
          onCerrar={() => {
            if (!pendiente) setAConfirmar(null)
          }}
        />
      )}
    </>
  )
}

// ======================================================================= piezas

function AvisoDocumento({ documento }: { documento: EstadoDocumento }) {
  switch (documento.estado) {
    case 'verificando':
      return (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Spinner /> Verificando documento…
        </p>
      )
    case 'disponible':
      return <p className="mt-1 text-xs font-medium text-emerald-700">✓ Documento no registrado para este proveedor.</p>
    case 'duplicado':
      return (
        <p role="alert" className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
          ⚠ Documento ya registrado para este proveedor
          {documento.compraId !== null && (
            <>
              {' '}
              (
              <Link href={`/compras/${documento.compraId}`} target="_blank" className="underline hover:text-amber-900">
                ver compra #{documento.compraId}
              </Link>
              )
            </>
          )}
          .
        </p>
      )
    case 'no_verificado':
      return <p className="mt-1 text-xs text-slate-500">No se pudo verificar ahora; se comprobará al registrar.</p>
    default:
      return null
  }
}

function FilaLinea({
  indice,
  linea,
  producto,
  subtotal,
  errores,
  onCambiar,
  onQuitar,
}: {
  indice: number
  linea: LineaFormulario
  producto: ProductoCompraDTO | null
  subtotal: number | null
  errores: Record<string, string>
  onCambiar: (indice: number, campo: 'cantidad' | 'costoUnitario', valor: string) => void
  onQuitar: (indice: number) => void
}) {
  const idCantidad = `linea-${linea.productoId}-cantidad`
  const idCosto = `linea-${linea.productoId}-costo`
  const errCantidad = errores[`items.${indice}.cantidad`] ?? errores[`items.${indice}.producto_id`]
  const errCosto = errores[`items.${indice}.costo_unitario`]
  const nombre = producto?.nombre ?? `Producto #${linea.productoId}`

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            <span className="mr-1.5 text-slate-400">{indice + 1}.</span>
            {nombre}
          </p>
          {producto && (
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="font-mono">{producto.codigo ?? 's/c'}</span> · Stock actual {formatoCantidad(producto.stockDisponible)} {producto.unidadMedida} · Último
              costo {formatoBs(producto.precioCompraActual)}
              {producto.precioPactado !== null && ` · Pactado ${formatoBs(producto.precioPactado)}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onQuitar(indice)}
          aria-label={`Quitar ${nombre}`}
          className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          Quitar
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <div>
          <label htmlFor={idCantidad} className="mb-1 block text-xs font-semibold text-slate-600">
            Cantidad{producto ? ` (${producto.unidadMedida})` : ''}
            <span className="text-rose-500"> *</span>
          </label>
          <input
            id={idCantidad}
            inputMode="decimal"
            value={linea.cantidad}
            onChange={(e) => onCambiar(indice, 'cantidad', e.target.value)}
            placeholder="0"
            className="campo-input text-right"
            aria-invalid={errCantidad ? true : undefined}
            aria-describedby={errCantidad ? `${idCantidad}-error` : undefined}
          />
          {errCantidad && (
            <p id={`${idCantidad}-error`} className="mt-1 text-xs font-medium text-rose-600">
              {errCantidad}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={idCosto} className="mb-1 block text-xs font-semibold text-slate-600">
            Costo unitario (Bs)<span className="text-rose-500"> *</span>
          </label>
          <input
            id={idCosto}
            inputMode="decimal"
            value={linea.costoUnitario}
            onChange={(e) => onCambiar(indice, 'costoUnitario', e.target.value)}
            placeholder="0,00"
            className="campo-input text-right"
            aria-invalid={errCosto ? true : undefined}
            aria-describedby={errCosto ? `${idCosto}-error` : undefined}
          />
          {errCosto && (
            <p id={`${idCosto}-error`} className="mt-1 text-xs font-medium text-rose-600">
              {errCosto}
            </p>
          )}
        </div>
        <div className="col-span-2 flex items-end justify-between rounded-xl bg-white px-3 py-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-center">
          <span className="text-xs text-slate-500">Subtotal</span>
          <span className={`text-sm font-bold ${subtotal === null ? 'text-slate-400' : 'text-slate-900'}`}>
            {subtotal === null ? '—' : formatoBs(subtotal)}
          </span>
        </div>
      </div>
    </li>
  )
}

function ConfirmarCompra({
  entrada,
  proveedor,
  productos,
  pendiente,
  onConfirmar,
  onCerrar,
}: {
  entrada: RegistrarCompraInput
  proveedor: ProveedorCompraDTO | null
  productos: Map<number, ProductoCompraDTO>
  pendiente: boolean
  onConfirmar: (e: FormEvent) => void
  onCerrar: () => void
}) {
  const lineas = entrada.items.map((i) => ({
    productoId: Number(i.producto_id),
    cantidad: String(i.cantidad),
    costoUnitario: String(i.costo_unitario),
  }))
  const { subtotales, total } = resumenFormulario(lineas)

  return (
    <Modal titulo="¿Registrar la compra?" subtitulo="Revise los datos: una compra registrada no se puede modificar." onCerrar={onCerrar} bloqueado={pendiente}>
      <form onSubmit={onConfirmar} className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">Proveedor</dt>
            <dd className="font-semibold text-slate-900">{proveedor?.razonSocial ?? `Proveedor ${String(entrada.proveedor_id)}`}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">Documento</dt>
            <dd className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
              <EtiquetaDocumento tipo={String(entrada.tipo_documento)} />
              <span className="font-mono">{String(entrada.nro_documento).trim()}</span>
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">Fecha de compra</dt>
            <dd className="font-semibold text-slate-900">{formatoFechaCompra(String(entrada.fecha_compra))}</dd>
          </div>
        </dl>

        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
          {lineas.map((l, i) => {
            const p = productos.get(l.productoId)
            const cantidad = leerImporte(l.cantidad) ?? 0
            const costo = leerImporte(l.costoUnitario) ?? 0
            return (
              <li key={l.productoId} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{p?.nombre ?? `Producto #${l.productoId}`}</p>
                  <p className="text-xs text-slate-500">
                    {formatoCantidad(cantidad)} {p?.unidadMedida ?? ''} × {formatoBs(costo)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-slate-900">{formatoBs(subtotales[i] ?? 0)}</p>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm">Total ({lineas.length} producto{lineas.length === 1 ? '' : 's'})</span>
          <span className="text-xl font-bold">{formatoBs(total)}</span>
        </div>
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Se actualizará el stock y se registrará una entrada «Compra» en el kárdex de cada producto.
        </p>
        <AccionesFormulario pendiente={pendiente} textoEnviar="Confirmar y registrar" textoPendiente="Registrando compra…" onCancelar={onCerrar} />
      </form>
    </Modal>
  )
}
