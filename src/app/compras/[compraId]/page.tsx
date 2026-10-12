import Link from 'next/link'
import { obtenerComprobanteIngresoAction } from '@/app/actions/compras'
import { FechaHoraBolivia } from '@/app/bitacora/fecha-hora'
import { formatoBs, formatoCantidad } from '../../inventario/formato'
import { obtenerCapacidadesCompras } from '../acceso'
import { BotonImprimir, EtiquetaDocumento, InsigniaCU15 } from '../componentes'
import { etiquetaTipoDocumento, formatoFechaCompra } from '../logica'

export const metadata = {
  title: 'Comprobante de compra — SmartService',
}

interface PageProps {
  params: Promise<{ compraId: string }>
  searchParams: Promise<{ registrada?: string | string[] }>
}

/**
 * Impresión del comprobante sin dependencias: oculta la barra lateral
 * compartida (<aside> del layout raíz) y los controles marcados con
 * `print:hidden`. Solo se aplica mientras esta página está montada.
 */
const ESTILOS_IMPRESION = `
@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; }
  aside { display: none !important; }
  .comprobante-compra { border: 0 !important; box-shadow: none !important; padding: 0 !important; }
  .comprobante-compra tr { break-inside: avoid; }
}
`

/**
 * CU15 — Detalle de una compra = comprobante de ingreso a almacén (paso 7):
 * cabecera, proveedor, documento, responsable, líneas con costo histórico y el
 * movimiento de kárdex (stock anterior → resultante) generado por cada línea.
 * Solo lectura: una compra registrada no se modifica.
 */
export default async function DetalleCompraPage({ params, searchParams }: PageProps) {
  const [{ compraId }, { registrada }] = await Promise.all([params, searchParams])
  const idValido = /^\d{1,10}$/.test(compraId)
  const [r, capacidades] = await Promise.all([
    idValido ? obtenerComprobanteIngresoAction({ compra_id: compraId }) : null,
    obtenerCapacidadesCompras(),
  ])
  const recienRegistrada = registrada === '1'

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8 print:max-w-none print:p-0">
      <style>{ESTILOS_IMPRESION}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/compras" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Volver a compras
        </Link>
        {r?.ok && (
          <div className="flex flex-wrap gap-2">
            {capacidades.registrar && (
              <Link
                href="/compras/nueva"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                Registrar otra compra
              </Link>
            )}
            <BotonImprimir />
          </div>
        )}
      </div>

      {!r || !r.ok ? (
        <div role="alert" className="mensaje-error">
          <p className="font-semibold">⚠ {!r ? 'La compra solicitada no existe.' : r.mensaje}</p>
          <p className="mt-1">Revise el número de compra o búsquela en el listado.</p>
        </div>
      ) : (
        <>
          {recienRegistrada && (
            <p role="status" className="mensaje-exito print:hidden">
              ✓ Compra registrada. El stock y el kárdex de {r.data.lineas.length === 1 ? 'su producto' : `sus ${r.data.lineas.length} productos`} se
              actualizaron.
            </p>
          )}

          <article aria-labelledby="titulo-comprobante" className="comprobante-compra tarjeta flex flex-col gap-6 p-5 sm:p-8">
            {/* Encabezado */}
            <header className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <InsigniaCU15 />
                <p className="hidden text-sm font-bold tracking-wider text-slate-900 print:block">SMARTSERVICE</p>
                <h1 id="titulo-comprobante" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Comprobante de ingreso a almacén
                </h1>
                <p className="text-sm text-slate-500">Compra de equipos e insumos</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 sm:text-right print:bg-transparent print:p-0">
                <p className="text-xs uppercase tracking-wider text-slate-500">Compra N.º</p>
                <p className="font-mono text-2xl font-bold text-slate-900">#{r.data.compraId}</p>
              </div>
            </header>

            {/* Datos de la compra */}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
              <Dato titulo="Proveedor">
                <span className="font-semibold text-slate-900">{r.data.proveedor.razonSocial || `Proveedor ${r.data.proveedor.id}`}</span>
                {r.data.proveedor.nit && <span className="block text-xs text-slate-500">NIT {r.data.proveedor.nit}</span>}
              </Dato>
              <Dato titulo="Documento de respaldo">
                <span className="inline-flex items-center gap-2">
                  <EtiquetaDocumento tipo={r.data.tipoDocumento} />
                  <span className="font-mono font-semibold text-slate-900">{r.data.nroDocumento}</span>
                </span>
                <span className="block text-xs text-slate-500">{etiquetaTipoDocumento(r.data.tipoDocumento)} del proveedor</span>
              </Dato>
              <Dato titulo="Fecha de compra">
                <span className="font-semibold text-slate-900">{formatoFechaCompra(r.data.fechaCompra)}</span>
              </Dato>
              <Dato titulo="Fecha y hora de registro">
                <span className="text-slate-800">
                  <FechaHoraBolivia fecha={r.data.fechaRegistro} />
                </span>
              </Dato>
              <Dato titulo="Responsable">
                <span className="text-slate-800">{r.data.responsable.nombre ?? `Usuario ${r.data.responsable.id}`}</span>
              </Dato>
              <Dato titulo="Ingreso a almacén">
                <span className="text-slate-800">
                  {r.data.lineas.filter((l) => l.movimientoId !== null).length} de {r.data.lineas.length} línea
                  {r.data.lineas.length === 1 ? '' : 's'} con entrada en kárdex
                </span>
              </Dato>
              {r.data.observacion && (
                <div className="sm:col-span-2 lg:col-span-3 print:col-span-3">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Observaciones</dt>
                  <dd className="mt-1 whitespace-pre-line text-slate-700">{r.data.observacion}</dd>
                </div>
              )}
            </dl>

            {/* Productos: tabla (escritorio e impresión) */}
            <section aria-labelledby="titulo-productos">
              <h2 id="titulo-productos" className="mb-3 text-base font-bold text-slate-900">
                Productos ingresados
              </h2>

              <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block print:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th scope="col" className="px-3 py-2.5">Producto</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Cantidad</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Costo unit.</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Subtotal</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Stock ant. → result.</th>
                      <th scope="col" className="px-3 py-2.5">Kárdex</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.data.lineas.map((l) => (
                      <tr key={l.productoId} className="align-top">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-900">{l.producto}</p>
                          <p className="font-mono text-xs text-slate-500">{l.codigo ?? 's/c'}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-800">
                          {formatoCantidad(l.cantidad)} <span className="text-xs text-slate-500">{l.unidadMedida ?? ''}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-800">{formatoBs(l.costoUnitario)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-slate-900">{formatoBs(l.subtotal)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                          <Stock anterior={l.stockAnterior} resultante={l.stockResultante} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                          <Movimiento productoId={l.productoId} movimientoId={l.movimientoId} enlazar={capacidades.verKardex} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <th scope="row" colSpan={3} className="px-3 py-3 text-right text-sm font-semibold text-slate-600">
                        Importe total
                      </th>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-lg font-bold text-slate-900">{formatoBs(r.data.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Móvil: tarjetas */}
              <ul className="space-y-3 md:hidden print:hidden">
                {r.data.lineas.map((l) => (
                  <li key={l.productoId} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{l.producto}</p>
                        <p className="font-mono text-xs text-slate-500">{l.codigo ?? 's/c'}</p>
                      </div>
                      <p className="shrink-0 font-bold text-slate-900">{formatoBs(l.subtotal)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {formatoCantidad(l.cantidad)} {l.unidadMedida ?? ''} × {formatoBs(l.costoUnitario)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>
                        Stock: <Stock anterior={l.stockAnterior} resultante={l.stockResultante} />
                      </span>
                      <Movimiento productoId={l.productoId} movimientoId={l.movimientoId} enlazar={capacidades.verKardex} />
                    </p>
                  </li>
                ))}
                <li className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                  <span className="text-sm">Importe total</span>
                  <span className="text-lg font-bold">{formatoBs(r.data.total)}</span>
                </li>
              </ul>
            </section>
          </article>
        </>
      )}
    </main>
  )
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function Stock({ anterior, resultante }: { anterior: number | null; resultante: number | null }) {
  if (anterior === null || resultante === null) return <span className="text-slate-400">—</span>
  return (
    <span>
      {formatoCantidad(anterior)} → <strong className="text-slate-900">{formatoCantidad(resultante)}</strong>
    </span>
  )
}

function Movimiento({ productoId, movimientoId, enlazar }: { productoId: number; movimientoId: number | null; enlazar: boolean }) {
  if (movimientoId === null) return <span className="text-slate-400">Sin movimiento</span>
  const texto = `Entrada «Compra» #${movimientoId}`
  if (!enlazar) return <span className="text-emerald-700">{texto}</span>
  return (
    <Link href={`/inventario/kardex/${productoId}`} className="font-medium text-emerald-700 underline-offset-2 hover:underline print:no-underline">
      {texto}
    </Link>
  )
}
