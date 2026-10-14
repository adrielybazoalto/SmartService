'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import type { ProductoInventarioDTO } from '@/backend/inventario/types'
import { EstadoProducto, FotoProducto, Modal } from './componentes'
import { formatoBs, formatoCantidad, formatoNumero, precioVentaReferencial } from './formato'

/**
 * Detalle de un producto (CU16, solo lectura): fotografía principal y las
 * demás en su orden, más los datos del catálogo. Disponible para todo rol con
 * acceso de consulta al inventario; no modifica nada.
 */
export function DetalleProducto({ producto: p, onCerrar }: { producto: ProductoInventarioDTO; onCerrar: () => void }) {
  const fotos = p.imagenPrincipal ? [p.imagenPrincipal, ...p.imagenesAdicionales] : p.imagenesAdicionales
  const [seleccion, setSeleccion] = useState(0)
  const actual = fotos[seleccion] ?? null

  return (
    <Modal titulo={p.nombre} subtitulo={`${p.codigo ?? 's/c'} · ${p.categoria?.nombre ?? 'Sin categoría'}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <section aria-label="Fotografías">
          <FotoProducto
            key={actual?.id ?? 'sin-foto'}
            url={actual?.url ?? null}
            nombre={actual ? `${p.nombre} — foto ${seleccion + 1} de ${fotos.length}` : p.nombre}
            ajuste="contain"
            className="h-64 w-full rounded-xl sm:h-80"
          />
          {fotos.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {fotos.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSeleccion(i)}
                    aria-label={`Ver foto ${i + 1}${f === p.imagenPrincipal ? ' (principal)' : ''}`}
                    aria-pressed={i === seleccion}
                    className={`cursor-pointer rounded-lg p-0.5 transition-shadow ${i === seleccion ? 'ring-2 ring-lime-500' : 'ring-1 ring-transparent hover:ring-slate-300'}`}
                  >
                    <FotoProducto url={f.url} nombre="" className="h-14 w-14" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fotos.length === 0 && <p className="mt-2 text-xs text-slate-500">Este producto no tiene fotografías registradas.</p>}
        </section>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <Dato etiqueta="Estado">
            <EstadoProducto activo={p.activo} critico={p.critico} />
          </Dato>
          <Dato etiqueta="Unidad">{p.unidadMedida}</Dato>
          <Dato etiqueta="Stock / mín.">
            <span className={p.activo && p.critico ? 'text-rose-700' : ''}>{formatoCantidad(p.stockDisponible)}</span>
            <span className="font-normal text-slate-400"> / {formatoCantidad(p.stockMinimo)}</span>
          </Dato>
          <Dato etiqueta="P. compra">{formatoBs(p.precioCompraActual)}</Dato>
          <Dato etiqueta="Margen">{formatoNumero(p.margenGanancia)} %</Dato>
          <Dato etiqueta="P. venta ref.">{formatoBs(precioVentaReferencial(p.precioCompraActual, p.margenGanancia))}</Dato>
        </dl>

        {p.descripcionTecnica && (
          <div>
            <p className="text-xs font-semibold text-slate-600">Descripción técnica</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{p.descripcionTecnica}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-100"
          >
            Cerrar
          </button>
          <Link href={`/inventario/kardex/${p.id}`} className="btn-primario">
            Ver kárdex
          </Link>
        </div>
      </div>
    </Modal>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{children}</dd>
    </div>
  )
}
