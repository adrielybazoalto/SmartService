import Link from 'next/link'
import { listarComprasAction, listarProveedoresCompraAction } from '@/app/actions/compras'
import { fechaHoyNegocio } from '@/backend/compras/reglas'
import { formatoBs } from '../inventario/formato'
import { obtenerCapacidadesCompras } from './acceso'
import { EtiquetaDocumento, InsigniaCU15 } from './componentes'
import { FiltrosCompras } from './filtros-compras'
import { formatoFechaCompra, hayFiltrosCompras, leerFiltrosCompras, LIMITE_LISTADO, sumaImportes, type ParametrosUrl } from './logica'

export const metadata = {
  title: 'Compras — SmartService',
}

interface PageProps {
  searchParams: Promise<ParametrosUrl>
}

/**
 * CU15 — Registrar Compras de Equipos e Insumos (pantalla principal).
 * Listado de compras registradas con filtros por proveedor, documento y rango
 * de fechas. Todos los datos llegan de las Server Actions de CU15 (BD real).
 */
export default async function ComprasPage({ searchParams }: PageProps) {
  const { valores, filtros } = leerFiltrosCompras(await searchParams)
  const [compras, proveedores, capacidades] = await Promise.all([
    listarComprasAction(filtros),
    listarProveedoresCompraAction(),
    obtenerCapacidadesCompras(),
  ])
  const filtrando = hayFiltrosCompras(valores)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="tarjeta flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="flex flex-col gap-1.5">
          <InsigniaCU15 />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Compras</h1>
          <p className="text-sm text-slate-500">
            Compras de equipos e insumos a proveedores. Cada compra ingresa al almacén y queda registrada en el kárdex.
          </p>
        </div>
        {capacidades.registrar && (
          <Link href="/compras/nueva" className="btn-primario shrink-0">
            <span className="text-lg leading-none">+</span> Registrar compra
          </Link>
        )}
      </header>

      {/* Resumen: solo cifras calculadas con las compras devueltas por la BD */}
      {compras.ok && compras.data.length > 0 && (
        <section aria-label="Resumen" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="tarjeta p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {filtrando ? 'Compras encontradas' : 'Compras recientes'}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{compras.data.length}</p>
          </div>
          <div className="tarjeta p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Importe del listado</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatoBs(sumaImportes(compras.data.map((c) => c.total)))}</p>
          </div>
        </section>
      )}

      <FiltrosCompras
        key={JSON.stringify(valores)}
        valores={valores}
        proveedores={proveedores.ok ? proveedores.data : []}
        hoy={fechaHoyNegocio()}
      />
      {!proveedores.ok && <p className="mensaje-error">⚠ {proveedores.mensaje}</p>}

      {!compras.ok ? (
        <p role="alert" className="mensaje-error">
          ⚠ {compras.mensaje}
        </p>
      ) : compras.data.length === 0 ? (
        <div className="tarjeta flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-slate-500">
            {filtrando ? 'No hay compras que coincidan con los filtros.' : 'Todavía no hay compras registradas.'}
          </p>
          {capacidades.registrar && !filtrando && (
            <Link href="/compras/nueva" className="btn-primario">
              Registrar la primera compra
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="tarjeta hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Compras registradas, de la más reciente a la más antigua</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-4 py-3">N.º</th>
                    <th scope="col" className="px-4 py-3">Fecha</th>
                    <th scope="col" className="px-4 py-3">Proveedor</th>
                    <th scope="col" className="px-4 py-3">Documento</th>
                    <th scope="col" className="px-4 py-3 text-right">Productos</th>
                    <th scope="col" className="px-4 py-3 text-right">Total</th>
                    <th scope="col" className="px-4 py-3">Responsable</th>
                    <th scope="col" className="px-4 py-3 text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {compras.data.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">#{c.id}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatoFechaCompra(c.fechaCompra)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.proveedor.razonSocial ?? `Proveedor ${c.proveedor.id}`}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <EtiquetaDocumento tipo={c.tipoDocumento} />
                          <span className="font-mono text-slate-700">{c.nroDocumento}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{c.cantidadLineas}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">{formatoBs(c.total)}</td>
                      <td className="px-4 py-3 text-slate-600">{c.responsable.nombre ?? `Usuario ${c.responsable.id}`}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/compras/${c.id}`}
                          className="rounded-lg bg-lime-100 px-2.5 py-1.5 text-xs font-medium text-lime-800 transition-colors hover:bg-lime-200"
                          aria-label={`Ver detalle de la compra ${c.id}`}
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {compras.data.map((c) => (
              <li key={c.id}>
                <Link href={`/compras/${c.id}`} className="tarjeta block p-4 transition-colors hover:border-lime-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{c.proveedor.razonSocial ?? `Proveedor ${c.proveedor.id}`}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <EtiquetaDocumento tipo={c.tipoDocumento} />
                        <span className="font-mono">{c.nroDocumento}</span>
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-bold text-slate-900">{formatoBs(c.total)}</p>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    #{c.id} · {formatoFechaCompra(c.fechaCompra)} · {c.cantidadLineas} producto{c.cantidadLineas === 1 ? '' : 's'} ·{' '}
                    {c.responsable.nombre ?? `Usuario ${c.responsable.id}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {compras.data.length >= LIMITE_LISTADO && (
            <p className="text-xs text-slate-500">
              Se muestran las {LIMITE_LISTADO} compras más recientes. Use los filtros para acotar la búsqueda.
            </p>
          )}
        </>
      )}

      {!capacidades.registrar && <p className="text-xs text-slate-500">Tu rol tiene acceso de solo consulta a las compras.</p>}
    </main>
  )
}
