'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { CategoriaDTO, ProductoInventarioDTO } from '@/backend/inventario/types'
import type { CapacidadesInventario } from './acceso'
import { EstadoProducto, FotoProducto } from './componentes'
import { DetalleProducto } from './detalle-producto'
import { formatoBs, formatoCantidad, formatoNumero, precioVentaReferencial } from './formato'
import {
  ConfirmarDesactivacion,
  FormularioAjuste,
  FormularioCategoria,
  FormularioInventarioInicial,
  FormularioProducto,
} from './formularios'

type Dialogo =
  | { tipo: 'nuevo' }
  | { tipo: 'categoria' }
  | { tipo: 'detalle' | 'editar' | 'inicial' | 'ajuste' | 'desactivar'; producto: ProductoInventarioDTO }
  | null

function MiniaturaProducto({
  producto,
  className = 'h-10 w-10',
}: {
  producto: ProductoInventarioDTO
  className?: string
}) {
  const { imagenPrincipal } = producto
  const src = imagenPrincipal?.urlImagen
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    setErrorCarga(false)
  }, [src])

  if (!src || errorCarga) {
    return (
      <div
        className={`flex ${className} shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-400 border border-slate-200/60`}
        aria-label={`Sin imagen: ${producto.nombre}`}
      >
        📦
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={producto.nombre}
      className={`${className} shrink-0 rounded-lg object-cover border border-slate-200 bg-white`}
      onError={() => setErrorCarga(true)}
    />
  )
}

/**
 * Catálogo de CU16 con las acciones que permite el rol. Las mutaciones llaman
 * a las Server Actions; éstas revalidan /inventario, así que la lista se
 * actualiza con los datos reales de la BD en la misma respuesta.
 */
export function CatalogoProductos({
  productos,
  categorias,
  capacidades,
}: {
  productos: ProductoInventarioDTO[]
  categorias: CategoriaDTO[]
  capacidades: CapacidadesInventario
}) {
  const router = useRouter()
  const [lista, setLista] = useState<ProductoInventarioDTO[]>(productos)
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [exito, setExito] = useState<string | null>(null)
  const cerrar = useCallback(() => setDialogo(null), [])
  const alExito = useCallback(
    (mensaje: string, productoActualizado?: ProductoInventarioDTO) => {
      setDialogo(null)
      setExito(mensaje)
      if (productoActualizado) {
        setLista((anterior) => {
          const existe = anterior.some((p) => p.id === productoActualizado.id)
          if (existe) {
            return anterior.map((p) => (p.id === productoActualizado.id ? productoActualizado : p))
          }
          return [productoActualizado, ...anterior]
        })
      }
      router.refresh()
    },
    [router],
  )

  useEffect(() => {
    setLista(productos)
  }, [productos])

  useEffect(() => {
    if (!exito) return
    const t = setTimeout(() => setExito(null), 6000)
    return () => clearTimeout(t)
  }, [exito])

  const puedeGestionar = capacidades.actualizar || capacidades.eliminar || capacidades.procesar

  return (
    <>
      {(capacidades.crear || exito) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="status" aria-live="polite" className="min-h-0 flex-1">
            {exito && <p className="mensaje-exito">✓ {exito}</p>}
          </div>
          {capacidades.crear && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setDialogo({ tipo: 'categoria' })}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                Nueva categoría
              </button>
              <button
                type="button"
                onClick={() => setDialogo({ tipo: 'nuevo' })}
                disabled={categorias.length === 0}
                title={categorias.length === 0 ? 'Primero registre una categoría' : undefined}
                className="btn-primario"
              >
                <span className="text-lg leading-none">+</span> Nuevo producto
              </button>
            </div>
          )}
        </div>
      )}

      {lista.length === 0 ? (
        <p className="tarjeta px-4 py-8 text-center text-sm text-slate-500">
          No hay productos que coincidan con los filtros.
        </p>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="tarjeta hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Catálogo de productos con existencias</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-4 py-3">Producto</th>
                    <th scope="col" className="px-4 py-3 text-right">P. compra</th>
                    <th scope="col" className="px-4 py-3 text-right">Margen</th>
                    <th scope="col" className="px-4 py-3 text-right">P. venta ref.</th>
                    <th scope="col" className="px-4 py-3 text-right">Stock / mín.</th>
                    <th scope="col" className="px-4 py-3">Estado</th>
                    <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lista.map((p) => (
                    <tr key={p.id} className={`transition-colors hover:bg-slate-50/80 ${p.activo && p.critico ? 'bg-rose-50/40' : ''} ${p.activo ? '' : 'text-slate-400'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
<<<<<<< HEAD
                          <MiniaturaProducto producto={p} className="h-10 w-10" />
                          <div className="min-w-0">
                            <p className={`font-medium ${p.activo ? 'text-slate-900' : 'text-slate-500'}`}>{p.nombre}</p>
=======
                          <MiniaturaProducto producto={p} abrir={setDialogo} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setDialogo({ tipo: 'detalle', producto: p })}
                              className={`cursor-pointer text-left font-medium hover:underline ${p.activo ? 'text-slate-900' : 'text-slate-500'}`}
                            >
                              {p.nombre}
                            </button>
>>>>>>> a13eeaf (feat(cu16): fotografías de producto, pruebas de integración y pendientes)
                            <p className="text-xs text-slate-500">
                              <span className="font-mono">{p.codigo ?? 's/c'}</span> · {p.categoria?.nombre ?? 'Sin categoría'} · {p.unidadMedida}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatoBs(p.precioCompraActual)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatoNumero(p.margenGanancia)} %</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatoBs(precioVentaReferencial(p.precioCompraActual, p.margenGanancia))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className={`font-semibold ${p.activo && p.critico ? 'text-rose-700' : ''}`}>{formatoCantidad(p.stockDisponible)}</span>
                        <span className="text-slate-400"> / {formatoCantidad(p.stockMinimo)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <EstadoProducto activo={p.activo} critico={p.critico} />
                      </td>
                      <td className="px-4 py-3">
                        <AccionesProducto producto={p} capacidades={capacidades} abrir={setDialogo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {lista.map((p) => (
              <li key={p.id} className={`tarjeta p-4 ${p.activo && p.critico ? 'border-rose-200' : ''}`}>
                <div className="flex items-start justify-between gap-3">
<<<<<<< HEAD
                  <div className="flex items-center gap-3 min-w-0">
                    <MiniaturaProducto producto={p} className="h-11 w-11" />
=======
                  <div className="flex min-w-0 items-center gap-3">
                    <MiniaturaProducto producto={p} abrir={setDialogo} />
>>>>>>> a13eeaf (feat(cu16): fotografías de producto, pruebas de integración y pendientes)
                    <div className="min-w-0">
                      <p className={`font-semibold ${p.activo ? 'text-slate-900' : 'text-slate-500'}`}>{p.nombre}</p>
                      <p className="truncate text-xs text-slate-500">
                        <span className="font-mono">{p.codigo ?? 's/c'}</span> · {p.categoria?.nombre ?? 'Sin categoría'}
                      </p>
                    </div>
                  </div>
                  <EstadoProducto activo={p.activo} critico={p.critico} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="text-slate-500">Stock</dt>
                    <dd className={`text-sm font-bold ${p.activo && p.critico ? 'text-rose-700' : 'text-slate-900'}`}>
                      {formatoCantidad(p.stockDisponible)} <span className="font-normal text-slate-400">{p.unidadMedida}</span>
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="text-slate-500">Mínimo</dt>
                    <dd className="text-sm font-semibold text-slate-700">{formatoCantidad(p.stockMinimo)}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="text-slate-500">P. compra</dt>
                    <dd className="text-sm font-semibold text-slate-700">{formatoBs(p.precioCompraActual)}</dd>
                  </div>
                </dl>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <AccionesProducto producto={p} capacidades={capacidades} abrir={setDialogo} movil />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!puedeGestionar && !capacidades.crear && (
        <p className="text-xs text-slate-500">Tu rol tiene acceso de solo consulta al inventario.</p>
      )}

      {dialogo?.tipo === 'detalle' && <DetalleProducto producto={dialogo.producto} onCerrar={cerrar} />}
      {dialogo?.tipo === 'nuevo' && <FormularioProducto producto={null} categorias={categorias} onCerrar={cerrar} onExito={alExito} />}
      {dialogo?.tipo === 'editar' && <FormularioProducto producto={dialogo.producto} categorias={categorias} onCerrar={cerrar} onExito={alExito} />}
      {dialogo?.tipo === 'categoria' && <FormularioCategoria onCerrar={cerrar} onExito={alExito} />}
      {dialogo?.tipo === 'inicial' && <FormularioInventarioInicial producto={dialogo.producto} onCerrar={cerrar} onExito={alExito} />}
      {dialogo?.tipo === 'ajuste' && <FormularioAjuste producto={dialogo.producto} onCerrar={cerrar} onExito={alExito} />}
      {dialogo?.tipo === 'desactivar' && <ConfirmarDesactivacion producto={dialogo.producto} onCerrar={cerrar} onExito={alExito} />}
    </>
  )
}

function AccionesProducto({
  producto: p,
  capacidades,
  abrir,
  movil = false,
}: {
  producto: ProductoInventarioDTO
  capacidades: CapacidadesInventario
  abrir: (d: Dialogo) => void
  movil?: boolean
}) {
  const boton = 'cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors'
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${movil ? '' : 'justify-end'}`}>
      {/* En escritorio el detalle se abre desde la foto o el nombre (la columna no se desborda) */}
      {movil && (
        <button type="button" onClick={() => abrir({ tipo: 'detalle', producto: p })} className={`${boton} text-slate-600 hover:bg-slate-100`}>
          Detalle
        </button>
      )}
      <Link href={`/inventario/kardex/${p.id}`} className={`${boton} bg-lime-100 text-lime-800 hover:bg-lime-200`}>
        Kárdex
      </Link>
      {capacidades.actualizar && (
        <button type="button" onClick={() => abrir({ tipo: 'editar', producto: p })} className={`${boton} text-slate-600 hover:bg-slate-100`}>
          Editar
        </button>
      )}
      {capacidades.procesar && p.activo && p.stockDisponible === 0 && (
        <button type="button" onClick={() => abrir({ tipo: 'inicial', producto: p })} className={`${boton} text-sky-700 hover:bg-sky-50`}>
          Inv. inicial
        </button>
      )}
      {capacidades.procesar && p.activo && (
        <button type="button" onClick={() => abrir({ tipo: 'ajuste', producto: p })} className={`${boton} text-amber-700 hover:bg-amber-50`}>
          Ajuste
        </button>
      )}
      {capacidades.eliminar && p.activo && (
        <button type="button" onClick={() => abrir({ tipo: 'desactivar', producto: p })} className={`${boton} text-rose-600 hover:bg-rose-50`}>
          Desactivar
        </button>
      )}
    </div>
  )
}

/** Foto principal en el catálogo; al pulsarla abre el detalle con todas las fotos. */
function MiniaturaProducto({ producto: p, abrir }: { producto: ProductoInventarioDTO; abrir: (d: Dialogo) => void }) {
  const total = (p.imagenPrincipal ? 1 : 0) + p.imagenesAdicionales.length
  return (
    <button
      type="button"
      onClick={() => abrir({ tipo: 'detalle', producto: p })}
      aria-label={`Ver detalle y fotografías de ${p.nombre}`}
      className="relative shrink-0 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-lime-500"
    >
      <FotoProducto key={p.imagenPrincipal?.url ?? 'sin-foto'} url={p.imagenPrincipal?.url ?? null} nombre="" className={`h-12 w-12 ${p.activo ? '' : 'opacity-60'}`} />
      {total > 1 && (
        <span aria-hidden="true" className="absolute -bottom-1 -right-1 rounded-full bg-slate-800 px-1.5 text-[10px] font-semibold leading-4 text-white">
          {total}
        </span>
      )}
    </button>
  )
}
