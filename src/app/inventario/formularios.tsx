'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import type { z } from 'zod'
import {
  desactivarProductoAction,
  modificarProductoAction,
  registrarAjusteAction,
  registrarCategoriaAction,
  registrarInventarioInicialAction,
  registrarProductoAction,
} from '@/app/actions/inventario'
import {
  modificarProductoSchema,
  productoIdSchema,
  registrarAjusteSchema,
  registrarCategoriaSchema,
  registrarInventarioInicialSchema,
  registrarProductoSchema,
  type ModificarProductoInput,
} from '@/backend/inventario/schema'
import type {
  CategoriaDTO,
  ProductoInventarioDTO,
  ResultadoInventario,
  ResultadoMovimientoDTO,
} from '@/backend/inventario/types'
import { AccionesFormulario, Campo, ErrorFormulario, Modal } from './componentes'
import { formatoBs, formatoCantidad, formatoNumero, precioVentaReferencial } from './formato'

/**
 * Formularios de CU16. Validan en el cliente con los MISMOS esquemas Zod del
 * backend (solo para mostrar errores por campo antes de enviar); la Server
 * Action vuelve a validar todo y su respuesta es la que manda.
 */

type Errores = Record<string, string>

/** Primer mensaje de cada campo (path[0]); los errores sin campo van a `_`. */
function erroresPorCampo(error: z.ZodError): Errores {
  const errores: Errores = {}
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? '_')
    errores[campo] ??= issue.message
  }
  return errores
}

/** Envío común: validación local → Server Action → éxito / error del servidor. */
function useEnvio<T>(onExito: (mensaje: string, data: T) => void) {
  const [pendiente, iniciar] = useTransition()
  const [errores, setErrores] = useState<Errores>({})
  const [errorServidor, setErrorServidor] = useState<string | null>(null)

  function enviar(validacion: z.ZodSafeParseResult<unknown>, accion: () => Promise<ResultadoInventario<T>>) {
    setErrorServidor(null)
    if (!validacion.success) {
      const e = erroresPorCampo(validacion.error)
      setErrores(e)
      if (e._) setErrorServidor(e._)
      return
    }
    setErrores({})
    iniciar(async () => {
      try {
        const r = await accion()
        if (r.ok) onExito(r.mensaje, r.data)
        else setErrorServidor(r.mensaje)
      } catch {
        setErrorServidor('No se pudo conectar con el servidor. Intente nuevamente.')
      }
    })
  }
  return { pendiente, errores, errorServidor, enviar }
}

const describir = (campo: string, errores: Errores) =>
  errores[campo] ? { 'aria-invalid': true, 'aria-describedby': `${campo}-error` } : {}

// ======================================================= producto (alta/edición)

interface ValoresProducto {
  codigo: string
  nombre: string
  descripcion_tecnica: string
  unidad_medida: string
  categoria_id: string
  precio_compra_actual: string
  margen_ganancia: string
  stock_minimo: string
  url_imagen: string
}

function valoresDe(p: ProductoInventarioDTO | null): ValoresProducto {
  return {
    codigo: p?.codigo ?? '',
    nombre: p?.nombre ?? '',
    descripcion_tecnica: p?.descripcionTecnica ?? '',
    unidad_medida: p?.unidadMedida ?? 'unidad',
    categoria_id: p?.categoria ? String(p.categoria.id) : '',
    precio_compra_actual: p ? p.precioCompraActual.toFixed(2) : '',
    margen_ganancia: p ? p.margenGanancia.toFixed(2) : '',
    stock_minimo: p ? String(p.stockMinimo) : '',
    url_imagen: p?.imagenUrl ?? p?.url_imagen ?? '',
  }
}

function VistaPreviaImagen({ url }: { url: string }) {
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    setErrorCarga(false)
  }, [url])

  if (errorCarga) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-base text-amber-600">
          ⚠️
        </div>
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-amber-800">No se pudo cargar la imagen</p>
          <p className="text-[11px] text-amber-700 leading-tight mt-0.5">
            Asegúrate de ingresar un enlace directo a la imagen (.jpg, .png, .webp) o utiliza «Adjuntar» para cargar el archivo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
      <img
        src={url}
        alt="Vista previa"
        className="h-16 w-16 shrink-0 rounded-lg object-cover border border-slate-200 bg-white"
        onError={() => setErrorCarga(true)}
      />
      <div className="min-w-0 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Vista previa</p>
        <p className="truncate text-[11px] text-slate-400">
          {url.startsWith('data:') ? 'Imagen local cargada' : url}
        </p>
      </div>
    </div>
  )
}

export function FormularioProducto({
  producto,
  categorias,
  onCerrar,
  onExito,
}: {
  /** null = alta; producto = edición. */
  producto: ProductoInventarioDTO | null
  categorias: CategoriaDTO[]
  onCerrar: () => void
  onExito: (mensaje: string, producto?: ProductoInventarioDTO) => void
}) {
  const edicion = producto !== null
  const iniciales = valoresDe(producto)
  const [v, setV] = useState<ValoresProducto>(iniciales)
  const { pendiente, errores, errorServidor, enviar } = useEnvio<ProductoInventarioDTO>((m, data) => onExito(m, data))
  const cambiar = (campo: keyof ValoresProducto) => (e: { target: { value: string } }) =>
    setV((anterior) => ({ ...anterior, [campo]: e.target.value }))

  const precio = Number(v.precio_compra_actual)
  const margen = Number(v.margen_ganancia)
  const ventaRef =
    v.precio_compra_actual.trim() && Number.isFinite(precio) && Number.isFinite(margen)
      ? precioVentaReferencial(precio, v.margen_ganancia.trim() ? margen : 0)
      : null

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (!edicion) {
      // Alta: vacíos opcionales → valor por defecto del esquema (0 / null)
      const entrada = {
        codigo: v.codigo,
        nombre: v.nombre,
        unidad_medida: v.unidad_medida,
        categoria_id: v.categoria_id,
        descripcion_tecnica: v.descripcion_tecnica || null,
        ...(v.precio_compra_actual.trim() && { precio_compra_actual: v.precio_compra_actual }),
        ...(v.margen_ganancia.trim() && { margen_ganancia: v.margen_ganancia }),
        ...(v.stock_minimo.trim() && { stock_minimo: v.stock_minimo }),
        ...(v.url_imagen.trim() && { url_imagen: v.url_imagen.trim() }),
      }
      enviar(registrarProductoSchema.safeParse(entrada), () => registrarProductoAction(entrada))
      return
    }
    // Edición: solo los campos que cambiaron
    const cambio = (campo: keyof ValoresProducto) => v[campo] !== iniciales[campo]
    const entrada: ModificarProductoInput = {
      producto_id: producto.id,
      ...(cambio('codigo') && { codigo: v.codigo }),
      ...(cambio('nombre') && { nombre: v.nombre }),
      ...(cambio('descripcion_tecnica') && { descripcion_tecnica: v.descripcion_tecnica || null }),
      ...(cambio('unidad_medida') && { unidad_medida: v.unidad_medida }),
      ...(cambio('categoria_id') && { categoria_id: v.categoria_id }),
      ...(cambio('precio_compra_actual') && { precio_compra_actual: v.precio_compra_actual }),
      ...(cambio('margen_ganancia') && { margen_ganancia: v.margen_ganancia }),
      ...(cambio('stock_minimo') && { stock_minimo: v.stock_minimo }),
      ...(cambio('url_imagen') && { url_imagen: v.url_imagen.trim() || null }),
    }
    enviar(modificarProductoSchema.safeParse(entrada), () => modificarProductoAction(entrada))
  }

  return (
    <Modal
      titulo={edicion ? 'Editar producto y precios' : 'Nuevo producto'}
      subtitulo={edicion ? `${producto.codigo ?? 's/c'} · ${producto.nombre}` : 'El producto se registra con stock 0: las existencias entran por el kárdex.'}
      onCerrar={onCerrar}
      bloqueado={pendiente}
    >
      <form onSubmit={alEnviar} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo etiqueta="Código" htmlFor="codigo" obligatorio error={errores.codigo} ayuda="Ej. CAM-IP-01 (se guarda en mayúsculas)">
            <input id="codigo" value={v.codigo} onChange={cambiar('codigo')} maxLength={50} autoComplete="off" className="campo-input uppercase" {...describir('codigo', errores)} />
          </Campo>
          <Campo etiqueta="Unidad de medida" htmlFor="unidad_medida" obligatorio error={errores.unidad_medida}>
            <input id="unidad_medida" value={v.unidad_medida} onChange={cambiar('unidad_medida')} maxLength={50} list="unidades" className="campo-input" {...describir('unidad_medida', errores)} />
            <datalist id="unidades">
              <option value="unidad" />
              <option value="metro" />
              <option value="rollo" />
              <option value="caja" />
              <option value="par" />
            </datalist>
          </Campo>
        </div>

        <Campo etiqueta="Nombre" htmlFor="nombre" obligatorio error={errores.nombre}>
          <input id="nombre" value={v.nombre} onChange={cambiar('nombre')} maxLength={150} className="campo-input" {...describir('nombre', errores)} />
        </Campo>

        <Campo etiqueta="Categoría" htmlFor="categoria_id" obligatorio error={errores.categoria_id}>
          <select id="categoria_id" value={v.categoria_id} onChange={cambiar('categoria_id')} className="campo-select" {...describir('categoria_id', errores)}>
            <option value="">Seleccione una categoría…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Descripción técnica" htmlFor="descripcion_tecnica" error={errores.descripcion_tecnica}>
          <textarea id="descripcion_tecnica" value={v.descripcion_tecnica} onChange={cambiar('descripcion_tecnica')} rows={2} maxLength={2000} className="campo-input" {...describir('descripcion_tecnica', errores)} />
        </Campo>

        <Campo etiqueta="Imagen del producto" htmlFor="url_imagen" error={errores.url_imagen} ayuda="Ingresa un enlace directo a la imagen (.jpg, .png, .webp) o adjunta un archivo">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                id="url_imagen"
                value={v.url_imagen}
                onChange={cambiar('url_imagen')}
                placeholder="https://... o ruta directa de imagen"
                className="campo-input flex-1"
                {...describir('url_imagen', errores)}
              />
              <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0">
                <span>📁 Adjuntar</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0]
                    if (archivo) {
                      const lector = new FileReader()
                      lector.onload = (evento) => {
                        const resultado = evento.target?.result as string
                        if (resultado) {
                          setV((anterior) => ({ ...anterior, url_imagen: resultado }))
                        }
                      }
                      lector.readAsDataURL(archivo)
                    }
                  }}
                />
              </label>
              {v.url_imagen && (
                <button
                  type="button"
                  onClick={() => setV((anterior) => ({ ...anterior, url_imagen: '' }))}
                  className="cursor-pointer rounded-xl border border-slate-200 px-2.5 py-2 text-xs text-rose-600 hover:bg-rose-50"
                  title="Quitar imagen"
                >
                  ✕
                </button>
              )}
            </div>

            {v.url_imagen && <VistaPreviaImagen url={v.url_imagen} />}
          </div>
        </Campo>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo etiqueta="Precio de compra (Bs)" htmlFor="precio_compra_actual" error={errores.precio_compra_actual}>
            <input id="precio_compra_actual" inputMode="decimal" value={v.precio_compra_actual} onChange={cambiar('precio_compra_actual')} placeholder="0,00" className="campo-input" {...describir('precio_compra_actual', errores)} />
          </Campo>
          <Campo etiqueta="Margen (%)" htmlFor="margen_ganancia" error={errores.margen_ganancia}>
            <input id="margen_ganancia" inputMode="decimal" value={v.margen_ganancia} onChange={cambiar('margen_ganancia')} placeholder="0" className="campo-input" {...describir('margen_ganancia', errores)} />
          </Campo>
          <Campo etiqueta="Stock mínimo" htmlFor="stock_minimo" error={errores.stock_minimo}>
            <input id="stock_minimo" inputMode="decimal" value={v.stock_minimo} onChange={cambiar('stock_minimo')} placeholder="0" className="campo-input" {...describir('stock_minimo', errores)} />
          </Campo>
        </div>
        <p className="text-xs text-slate-500">
          Use punto como separador decimal (ej. 95.50).
          {ventaRef !== null && (
            <>
              {' '}Precio de venta referencial: <strong className="text-slate-700">{formatoBs(ventaRef)}</strong>
            </>
          )}
        </p>
        {edicion && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            El stock ({formatoCantidad(producto.stockDisponible)} {producto.unidadMedida}) no se edita aquí: use inventario inicial o un ajuste por conteo físico.
          </p>
        )}

        <ErrorFormulario mensaje={errorServidor} />
        <AccionesFormulario pendiente={pendiente} textoEnviar={edicion ? 'Guardar cambios' : 'Registrar producto'} onCancelar={onCerrar} />
      </form>
    </Modal>
  )
}

// ================================================================== categoría

export function FormularioCategoria({ onCerrar, onExito }: { onCerrar: () => void; onExito: (mensaje: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const { pendiente, errores, errorServidor, enviar } = useEnvio<CategoriaDTO>((m) => onExito(m))

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    const entrada = { nombre, descripcion: descripcion || null }
    enviar(registrarCategoriaSchema.safeParse(entrada), () => registrarCategoriaAction(entrada))
  }

  return (
    <Modal titulo="Nueva categoría" onCerrar={onCerrar} bloqueado={pendiente}>
      <form onSubmit={alEnviar} noValidate className="space-y-4">
        <Campo etiqueta="Nombre" htmlFor="cat-nombre" obligatorio error={errores.nombre}>
          <input id="cat-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} className="campo-input" {...describir('nombre', errores)} />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="cat-descripcion" error={errores.descripcion}>
          <input id="cat-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={255} className="campo-input" />
        </Campo>
        <ErrorFormulario mensaje={errorServidor} />
        <AccionesFormulario pendiente={pendiente} textoEnviar="Registrar categoría" onCancelar={onCerrar} />
      </form>
    </Modal>
  )
}

// =========================================================== inventario inicial

export function FormularioInventarioInicial({
  producto,
  onCerrar,
  onExito,
}: {
  producto: ProductoInventarioDTO
  onCerrar: () => void
  onExito: (mensaje: string) => void
}) {
  const [cantidad, setCantidad] = useState('')
  const [observacion, setObservacion] = useState('')
  const { pendiente, errores, errorServidor, enviar } = useEnvio((m: string, d: ResultadoMovimientoDTO) =>
    onExito(`${m} Stock de «${producto.nombre}»: ${formatoCantidad(d.stockResultante)} ${producto.unidadMedida}.`),
  )

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    const entrada = { producto_id: producto.id, cantidad, observacion: observacion || null }
    enviar(registrarInventarioInicialSchema.safeParse(entrada), () => registrarInventarioInicialAction(entrada))
  }

  return (
    <Modal titulo="Inventario inicial" subtitulo={`${producto.codigo ?? 's/c'} · ${producto.nombre}`} onCerrar={onCerrar} bloqueado={pendiente}>
      <form onSubmit={alEnviar} noValidate className="space-y-4">
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Solo para productos sin movimientos previos y con stock 0. Se registra una ENTRADA «Inventario inicial» en el kárdex.
        </p>
        <Campo etiqueta={`Cantidad inicial (${producto.unidadMedida})`} htmlFor="ini-cantidad" obligatorio error={errores.cantidad}>
          <input id="ini-cantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="campo-input" {...describir('cantidad', errores)} />
        </Campo>
        <Campo etiqueta="Observación" htmlFor="ini-observacion" error={errores.observacion}>
          <textarea id="ini-observacion" value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} maxLength={1000} className="campo-input" />
        </Campo>
        <ErrorFormulario mensaje={errorServidor} />
        <AccionesFormulario pendiente={pendiente} textoEnviar="Registrar inventario inicial" onCancelar={onCerrar} />
      </form>
    </Modal>
  )
}

// ============================================================ ajuste por conteo

export function FormularioAjuste({
  producto,
  onCerrar,
  onExito,
}: {
  producto: ProductoInventarioDTO
  onCerrar: () => void
  onExito: (mensaje: string) => void
}) {
  const [stockContado, setStockContado] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const { pendiente, errores, errorServidor, enviar } = useEnvio(
    (m: string, d: ResultadoMovimientoDTO) =>
      onExito(`${m} «${producto.nombre}»: ${formatoCantidad(d.stockAnterior)} → ${formatoCantidad(d.stockResultante)} (${d.motivo === 'AJUSTE_POSITIVO' ? 'ajuste positivo' : 'ajuste negativo'}).`),
  )

  const contado = Number(stockContado)
  const valido = stockContado.trim() !== '' && Number.isFinite(contado) && contado >= 0
  const diferencia = valido ? Math.round((contado - producto.stockDisponible) * 100) / 100 : null
  const largo = justificacion.trim().length

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    const entrada = { producto_id: producto.id, stock_contado: stockContado, justificacion }
    enviar(registrarAjusteSchema.safeParse(entrada), () => registrarAjusteAction(entrada))
  }

  return (
    <Modal titulo="Ajuste por conteo físico" subtitulo={`${producto.codigo ?? 's/c'} · ${producto.nombre}`} onCerrar={onCerrar} bloqueado={pendiente}>
      <form onSubmit={alEnviar} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Stock en sistema</p>
            <p className="text-lg font-bold text-slate-900">
              {formatoCantidad(producto.stockDisponible)} <span className="text-xs font-normal text-slate-500">{producto.unidadMedida}</span>
            </p>
          </div>
          <div
            aria-live="polite"
            className={`rounded-xl px-3 py-2 ${diferencia === null || diferencia === 0 ? 'bg-slate-50' : diferencia > 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}
          >
            <p className="text-xs text-slate-500">Diferencia</p>
            <p className={`text-lg font-bold ${diferencia === null || diferencia === 0 ? 'text-slate-400' : diferencia > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {diferencia === null ? '—' : diferencia === 0 ? 'Sin diferencia' : `${diferencia > 0 ? '+' : ''}${formatoNumero(diferencia)}`}
            </p>
            {diferencia !== null && diferencia !== 0 && (
              <p className="text-xs text-slate-500">{diferencia > 0 ? 'Ajuste positivo (entrada)' : 'Ajuste negativo (salida)'}</p>
            )}
          </div>
        </div>
        <Campo etiqueta={`Stock contado (${producto.unidadMedida})`} htmlFor="aj-contado" obligatorio error={errores.stock_contado} ayuda="Cantidad real encontrada en el conteo físico.">
          <input id="aj-contado" inputMode="decimal" value={stockContado} onChange={(e) => setStockContado(e.target.value)} className="campo-input" {...describir('stock_contado', errores)} />
        </Campo>
        <Campo etiqueta="Motivo / justificación" htmlFor="aj-justificacion" obligatorio error={errores.justificacion} ayuda={`${largo}/1000 · mínimo 10 caracteres`}>
          <textarea id="aj-justificacion" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} rows={3} maxLength={1000} placeholder="Ej. Conteo físico mensual: 2 unidades dañadas retiradas" className="campo-input" {...describir('justificacion', errores)} />
        </Campo>
        <ErrorFormulario mensaje={errorServidor} />
        <AccionesFormulario pendiente={pendiente} textoEnviar="Registrar ajuste" onCancelar={onCerrar} deshabilitado={diferencia === 0} />
      </form>
    </Modal>
  )
}

// =============================================================== desactivación

export function ConfirmarDesactivacion({
  producto,
  onCerrar,
  onExito,
}: {
  producto: ProductoInventarioDTO
  onCerrar: () => void
  onExito: (mensaje: string) => void
}) {
  const { pendiente, errorServidor, enviar } = useEnvio<ProductoInventarioDTO>((m) => onExito(`${m} «${producto.nombre}» ya no aparecerá en el catálogo activo.`))

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    const entrada = { producto_id: producto.id }
    enviar(productoIdSchema.safeParse(entrada), () => desactivarProductoAction(entrada))
  }

  return (
    <Modal titulo="¿Desactivar producto?" onCerrar={onCerrar} bloqueado={pendiente}>
      <form onSubmit={alEnviar} className="space-y-4">
        <p className="text-sm text-slate-600">
          Se desactivará <strong className="text-slate-900">{producto.nombre}</strong> ({producto.codigo ?? 's/c'}). No se elimina:
          conserva su kárdex y su historial, pero deja de estar disponible para nuevas operaciones.
        </p>
        {producto.stockDisponible > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Aún tiene {formatoCantidad(producto.stockDisponible)} {producto.unidadMedida} en stock.
          </p>
        )}
        <ErrorFormulario mensaje={errorServidor} />
        <AccionesFormulario pendiente={pendiente} textoEnviar="Sí, desactivar" textoPendiente="Desactivando…" onCancelar={onCerrar} peligro />
      </form>
    </Modal>
  )
}
