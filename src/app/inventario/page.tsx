import Link from 'next/link'
import {
  listarCategoriasAction,
  listarStockCriticoAction,
  obtenerCatalogoAction,
} from '@/app/actions/inventario'
import { obtenerCapacidadesInventario } from './acceso'
import { CatalogoProductos } from './catalogo-productos'
import { InsigniaCU16 } from './componentes'
import { FiltrosInventario, type ValoresFiltros } from './filtros-inventario'
import { formatoCantidad } from './formato'

export const metadata = {
  title: 'Inventario — SmartService',
}

interface PageProps {
  searchParams: Promise<{ texto?: string; categoria?: string; estado?: string; critico?: string }>
}

const unico = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/**
 * CU16 — Gestionar Inventario y Movimientos de Kárdex (pantalla principal).
 * Todos los datos llegan de las Server Actions de CU16 (BD real); la pantalla
 * no muestra datos de ejemplo. Encargado: consulta. Administrador: gestión.
 */
export default async function InventarioPage({ searchParams }: PageProps) {
  const params = await searchParams
  const valores: ValoresFiltros = {
    texto: unico(params.texto).slice(0, 100),
    categoria: /^\d+$/.test(unico(params.categoria)) ? unico(params.categoria) : '',
    estado: unico(params.estado) === 'todos' ? 'todos' : '',
    critico: unico(params.critico) === '1',
  }

  const [catalogo, categorias, criticos, capacidades] = await Promise.all([
    obtenerCatalogoAction({
      ...(valores.texto && { texto: valores.texto }),
      ...(valores.categoria && { categoria_id: valores.categoria }),
      incluir_inactivos: valores.estado === 'todos',
      solo_criticos: valores.critico,
    }),
    listarCategoriasAction(),
    listarStockCriticoAction(),
    obtenerCapacidadesInventario(),
  ])

  const listaCategorias = categorias.ok ? categorias.data : []
  const listaCriticos = criticos.ok ? criticos.data : []
  const hayFiltros = Boolean(valores.texto || valores.categoria || valores.estado || valores.critico)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="tarjeta flex flex-col gap-1.5 p-5 sm:p-6">
        <InsigniaCU16 />
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Inventario</h1>
        <p className="text-sm text-slate-500">
          Catálogo de productos con costos, márgenes y existencias. Cada cambio de stock queda registrado en el kárdex.
        </p>
      </header>

      {/* Resumen: solo cifras calculadas con los datos devueltos por la BD */}
      {catalogo.ok && (
        <section aria-label="Resumen" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="tarjeta p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{hayFiltros ? 'Productos encontrados' : 'Productos activos'}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{catalogo.data.length}</p>
          </div>
          <div className={`tarjeta p-4 ${listaCriticos.length > 0 ? 'border-rose-200 bg-rose-50/60' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stock crítico</p>
            <p className={`mt-1 text-2xl font-bold ${listaCriticos.length > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {criticos.ok ? listaCriticos.length : '—'}
            </p>
          </div>
          <div className="tarjeta p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Categorías</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{categorias.ok ? listaCategorias.length : '—'}</p>
          </div>
        </section>
      )}

      {/* Alerta de stock crítico (RF16) */}
      {listaCriticos.length > 0 && (
        <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold">
                ⚠ {listaCriticos.length} producto{listaCriticos.length === 1 ? '' : 's'} con stock en o por debajo del mínimo
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {listaCriticos.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    {p.nombre} — {formatoCantidad(p.stockDisponible)} / mín. {formatoCantidad(p.stockMinimo)} {p.unidadMedida}
                  </li>
                ))}
                {listaCriticos.length > 5 && <li>y {listaCriticos.length - 5} más…</li>}
              </ul>
            </div>
            {!valores.critico && (
              <Link href="/inventario?critico=1" className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100">
                Ver solo críticos
              </Link>
            )}
          </div>
        </section>
      )}

      <FiltrosInventario key={JSON.stringify(valores)} valores={valores} categorias={listaCategorias} />

      {!categorias.ok && <p className="mensaje-error">⚠ {categorias.mensaje}</p>}

      {catalogo.ok ? (
        <CatalogoProductos productos={catalogo.data} categorias={listaCategorias} capacidades={capacidades} />
      ) : (
        <p role="alert" className="mensaje-error">
          ⚠ {catalogo.mensaje}
        </p>
      )}
    </main>
  )
}
