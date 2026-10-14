import Link from 'next/link'
import { obtenerKardexAction } from '@/app/actions/inventario'
import { FechaHoraBolivia } from '@/app/bitacora/fecha-hora'
import type { MovimientoKardexDTO } from '@/backend/inventario/types'
import { InsigniaCU16 } from '../../componentes'
import { etiquetaMovimiento, formatoCantidad } from '../../formato'

export const metadata = {
  title: 'Kárdex — SmartService',
}

interface PageProps {
  params: Promise<{ productoId: string }>
}

/** Color del motivo: entradas en verde, salidas en ámbar, histórico sin clasificar en gris. */
function claseSentido(sentido: MovimientoKardexDTO['sentido']): string {
  if (sentido === 1) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (sentido === -1) return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function Cantidad({ m }: { m: MovimientoKardexDTO }) {
  const signo = m.sentido === 1 ? '+' : m.sentido === -1 ? '−' : ''
  const color = m.sentido === 1 ? 'text-emerald-700' : m.sentido === -1 ? 'text-amber-700' : 'text-slate-600'
  return (
    <span className={`font-semibold ${color}`}>
      {signo}
      {formatoCantidad(m.cantidad)}
    </span>
  )
}

/**
 * CU16 — Kárdex de un producto en orden cronológico (más antiguo primero):
 * motivo, cantidad, stock anterior → resultante, documento y responsable.
 * Solo lectura: el kárdex es inalterable.
 */
export default async function KardexPage({ params }: PageProps) {
  const { productoId } = await params
  const r = await obtenerKardexAction({ producto_id: productoId })

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Link href="/inventario" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Volver al inventario
        </Link>
      </div>

      <header className="tarjeta flex flex-col gap-1.5 p-5 sm:p-6">
        <InsigniaCU16 />
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Kárdex{r.ok ? ` · ${r.data.producto.nombre}` : ''}
        </h1>
        {r.ok && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>
              Código: <span className="font-mono text-slate-700">{r.data.producto.codigo ?? 's/c'}</span>
            </span>
            <span>
              Stock actual: <strong className="text-slate-900">{formatoCantidad(r.data.producto.stockDisponible)}</strong>
            </span>
            {!r.data.producto.activo && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Producto inactivo</span>
            )}
          </div>
        )}
      </header>

      {!r.ok ? (
        <p role="alert" className="mensaje-error">
          ⚠ {r.mensaje}
        </p>
      ) : r.data.movimientos.length === 0 ? (
        <p className="tarjeta px-4 py-8 text-center text-sm text-slate-500">
          Este producto todavía no tiene movimientos de kárdex.
        </p>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="tarjeta hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Movimientos de kárdex en orden cronológico</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-4 py-3">Fecha y hora</th>
                    <th scope="col" className="px-4 py-3">Movimiento</th>
                    <th scope="col" className="px-4 py-3 text-right">Cantidad</th>
                    <th scope="col" className="px-4 py-3 text-right">Stock anterior</th>
                    <th scope="col" className="px-4 py-3 text-right">Stock resultante</th>
                    <th scope="col" className="px-4 py-3">Documento</th>
                    <th scope="col" className="px-4 py-3">Responsable</th>
                    <th scope="col" className="px-4 py-3">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.data.movimientos.map((m) => (
                    <tr key={m.id} className="align-top hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        <FechaHoraBolivia fecha={m.fecha} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-lg border px-2 py-0.5 text-xs font-semibold ${claseSentido(m.sentido)}`}>
                          {etiquetaMovimiento(m.tipo, m.motivo)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Cantidad m={m} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatoCantidad(m.stockAnterior)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                        {m.stockResultante === null ? <span className="font-normal text-slate-400" title="Movimiento anterior a CU16">—</span> : formatoCantidad(m.stockResultante)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{m.documento ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{m.responsable.nombre ?? `Usuario ${m.responsable.id}`}</td>
                      <td className="max-w-xs px-4 py-3 text-slate-500">{m.observacion ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Móvil: línea de tiempo */}
          <ol className="space-y-3 md:hidden">
            {r.data.movimientos.map((m) => (
              <li key={m.id} className="tarjeta p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-block rounded-lg border px-2 py-0.5 text-xs font-semibold ${claseSentido(m.sentido)}`}>
                    {etiquetaMovimiento(m.tipo, m.motivo)}
                  </span>
                  <span className="text-xs text-slate-500">
                    <FechaHoraBolivia fecha={m.fecha} />
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <Cantidad m={m} />
                  <span className="text-slate-500">
                    {' '}· {formatoCantidad(m.stockAnterior)} → {m.stockResultante === null ? '—' : formatoCantidad(m.stockResultante)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {m.documento ? `${m.documento} · ` : ''}
                  {m.responsable.nombre ?? `Usuario ${m.responsable.id}`}
                </p>
                {m.observacion && <p className="mt-1 text-xs text-slate-500">{m.observacion}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
