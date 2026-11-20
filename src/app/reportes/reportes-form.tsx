'use client'

// =====================================================================
//  CU20 - ReportesForm (frontera con el Administrador)
//  seleccionarTipo · seleccionarAtajo · generarReporte · exportarPDF · exportarExcel
// =====================================================================

import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { generarReporteAction, registrarExportacion } from '@/app/actions/reportes'
import {
  ATAJOS,
  NOMBRE_ATAJO,
  NOMBRE_REPORTE,
  TIPOS_REPORTE,
  type Atajo,
  type FormatoExportacion,
  type OpcionFiltro,
  type ReporteGenerado,
  type TipoReporte,
} from '@/backend/reportes/types'
import { SIN_PERIODO, USA_CATEGORIA, USA_TECNICO, calcularRangoAtajo, hoyBolivia } from '@/backend/reportes/reglas'
import { MENSAJES } from '@/backend/reportes/errores'
import { armarContenido, formatearValor, textoPeriodo, type Grafico } from './_lib/contenido'

/** Para qué sirve cada reporte (ayuda al elegir). */
const AYUDA: Record<TipoReporte, string> = {
  RESUMEN_GENERAL: 'Ingresos, compras y balance operativo, con los indicadores principales del período.',
  INGRESOS: 'Total recaudado por método de pago y por origen (ventas, cobros de órdenes y anticipos).',
  SERVICIOS: 'Servicios de las cotizaciones aprobadas, ordenados por frecuencia.',
  ROTACION_INVENTARIO: 'Todos los productos activos: cuánto salió en órdenes y ventas, stock, valor en bodega y si su rotación es alta, baja o sin movimiento.',
  INVENTARIO_CRITICO: 'Productos activos con stock mínimo definido y stock igual o menor a ese mínimo. Es el estado actual: no pide fechas.',
  RENDIMIENTO_TECNICO: 'Horas programadas contra horas reales por técnico y su porcentaje de cumplimiento.',
  PROVEEDORES: 'Compras a cada proveedor y margen bruto estimado de los productos que provee.',
}

type Aviso = { tipo: 'exito' | 'error'; texto: string } | null

export function ReportesForm({
  tecnicos,
  categorias,
  puedeExportar,
  errorInicial,
}: {
  tecnicos: OpcionFiltro[]
  categorias: OpcionFiltro[]
  puedeExportar: boolean
  errorInicial: string | null
}) {
  const inicial = calcularRangoAtajo('ESTE_MES')
  const [tipo, setTipo] = useState<TipoReporte | ''>('')
  const [atajo, setAtajo] = useState<Atajo | null>('ESTE_MES')
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [tecnicoId, setTecnicoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [reporte, setReporte] = useState<ReporteGenerado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [exportando, setExportando] = useState<FormatoExportacion | null>(null)
  const [aviso, setAviso] = useState<Aviso>(errorInicial ? { tipo: 'error', texto: errorInicial } : null)

  const pidePeriodo = tipo !== '' && !SIN_PERIODO.includes(tipo)
  const hoy = hoyBolivia()

  /** Paso 4: tipo de reporte. FA4: al cambiar parámetros se vuelve a generar. */
  function seleccionarTipo(nuevo: TipoReporte | '') {
    setTipo(nuevo)
    setAviso(null)
  }

  /** FA1: el atajo completa las fechas; si luego se edita una fecha, queda personalizado. */
  function seleccionarAtajo(nuevo: Atajo) {
    const rango = calcularRangoAtajo(nuevo)
    setAtajo(nuevo)
    setDesde(rango.desde)
    setHasta(rango.hasta)
  }

  /** Pasos 6 a 9: pide el reporte al servidor y lo muestra. */
  async function generarReporte() {
    setAviso(null)
    if (!tipo) {
      setAviso({ tipo: 'error', texto: MENSAJES.FALTA_TIPO })
      return
    }
    setCargando(true)
    const r = await generarReporteAction({
      tipo,
      desde: pidePeriodo ? desde : null,
      hasta: pidePeriodo ? hasta : null,
      tecnicoId: USA_TECNICO.includes(tipo) ? tecnicoId || null : null,
      categoriaId: USA_CATEGORIA.includes(tipo) ? categoriaId || null : null,
    })
    setCargando(false)
    if (!r.ok) {
      setReporte(null)
      setAviso({ tipo: 'error', texto: r.error })
      return
    }
    setReporte(r.data)
  }

  /** Pasos 11 a 13: registra la exportación (bitácora) y descarga el archivo. */
  async function exportar(formato: FormatoExportacion) {
    if (!reporte) {
      setAviso({ tipo: 'error', texto: MENSAJES.SIN_REPORTE })
      return
    }
    setExportando(formato)
    setAviso(null)
    try {
      const r = await registrarExportacion(reporte.filtros, formato)
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.error })
        return
      }
      if (formato === 'PDF') await exportarPDF(reporte)
      else await exportarExcel(reporte)
      setAviso({ tipo: 'exito', texto: `Reporte exportado a ${formato === 'PDF' ? 'PDF' : 'Excel'}.` })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo generar el archivo.' })
    } finally {
      setExportando(null)
    }
  }

  const contenido = reporte ? armarContenido(reporte) : null

  return (
    <div className="flex flex-col gap-6">
      <header className="tarjeta flex flex-col gap-1.5 p-5 sm:p-6">
        <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          CU20
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Reportes Gerenciales</h1>
        <p className="text-sm text-slate-500">
          Elija el reporte y el período, genere los resultados y expórtelos a PDF o Excel. Los reportes se
          calculan en el momento con la información registrada; no se guardan.
        </p>
      </header>

      {/* ---------------- Parámetros (pasos 4 y 5) ---------------- */}
      <section className="tarjeta flex flex-col gap-5 p-4 sm:p-5" aria-labelledby="titulo-parametros">
        <h2 id="titulo-parametros" className="text-base font-semibold text-slate-900">Parámetros del reporte</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Tipo de reporte
            <select
              className="campo-select"
              value={tipo}
              onChange={(e) => seleccionarTipo(e.target.value as TipoReporte | '')}
            >
              <option value="">Seleccione…</option>
              {TIPOS_REPORTE.map((t) => (
                <option key={t} value={t}>{NOMBRE_REPORTE[t]}</option>
              ))}
            </select>
            {tipo && <span className="text-xs font-normal text-slate-500">{AYUDA[tipo]}</span>}
          </label>

          {tipo && USA_TECNICO.includes(tipo) && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Técnico
              <select className="campo-select" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                <option value="">Todos los técnicos activos</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
          )}

          {tipo && USA_CATEGORIA.includes(tipo) && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Categoría de producto
              <select className="campo-select" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
        </div>

        {pidePeriodo && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atajos de período">
              {ATAJOS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => seleccionarAtajo(a)}
                  aria-pressed={atajo === a}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    atajo === a
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {NOMBRE_ATAJO[a]}
                </button>
              ))}
              {atajo === null && (
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                  Personalizado
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Desde
                <input
                  type="date"
                  className="campo-input"
                  value={desde}
                  max={hoy}
                  onChange={(e) => { setDesde(e.target.value); setAtajo(null) }}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Hasta
                <input
                  type="date"
                  className="campo-input"
                  value={hasta}
                  max={hoy}
                  onChange={(e) => { setHasta(e.target.value); setAtajo(null) }}
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Máximo 12 meses. Hasta 31 días se agrupa por día; más, por mes. Para un año cerrado use del
              01/01 al 31/12.
            </p>
          </div>
        )}

        <div>
          <button type="button" className="btn-primario" onClick={generarReporte} disabled={cargando}>
            {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Generar reporte
          </button>
        </div>
      </section>

      {aviso && (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
            aviso.tipo === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {aviso.tipo === 'error' && <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {aviso.texto}
        </p>
      )}

      {/* ---------------- Resultados (paso 9) ---------------- */}
      {reporte && contenido && (
        <section className="tarjeta flex flex-col gap-5 p-4 sm:p-5" aria-labelledby="titulo-reporte">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="titulo-reporte" className="text-lg font-semibold text-slate-900">{reporte.titulo}</h2>
              <p className="text-sm text-slate-600">{textoPeriodo(reporte)}</p>
              {reporte.filtrosTexto.map((f) => <p key={f} className="text-sm text-slate-600">{f}</p>)}
              <p className="text-xs text-slate-400">
                Generado el {reporte.fechaEmision.slice(0, 16)} por {reporte.emitidoPor}
              </p>
            </div>
            {puedeExportar && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportar('PDF')}
                  disabled={exportando !== null}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportando === 'PDF' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Exportar a PDF
                </button>
                <button
                  type="button"
                  onClick={() => exportar('EXCEL')}
                  disabled={exportando !== null}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportando === 'EXCEL' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Exportar a Excel
                </button>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {contenido.indicadores.map((ind) => (
              <div key={ind.etiqueta} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs font-semibold uppercase text-slate-500">{ind.etiqueta}</dt>
                <dd
                  className={`text-xl font-bold ${
                    ind.signo && ind.valor !== null
                      ? ind.valor < 0 ? 'text-red-700' : 'text-emerald-700'
                      : 'text-slate-800'
                  }`}
                >
                  {formatearValor(ind.valor, ind.tipo)}
                </dd>
              </div>
            ))}
          </dl>

          {contenido.nota && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{contenido.nota}</p>
          )}

          {contenido.grafico && contenido.grafico.barras.length > 0 && (
            <GraficoBarras grafico={contenido.grafico} />
          )}

          {contenido.tablas.map((t) => (
            <div key={t.titulo} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{t.titulo}</h3>
              {t.filas.length === 0 ? (
                <p className="text-sm text-slate-400">Sin registros en el período.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        {t.columnas.map((c) => (
                          <th key={c.titulo} className={`px-3 py-2 font-semibold ${c.tipo === 'texto' ? 'text-left' : 'text-right'}`}>
                            {c.titulo}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {t.filas.map((f, i) => (
                        <tr key={i}>
                          {f.map((v, j) => (
                            <td key={j} className={`px-3 py-2 ${t.columnas[j].tipo === 'texto' ? 'text-left' : 'text-right tabular-nums'}`}>
                              {formatearValor(v, t.columnas[j].tipo)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {t.total && (
                      <tfoot className="bg-slate-50 font-semibold">
                        <tr>
                          {t.total.map((v, j) => (
                            <td key={j} className={`px-3 py-2 ${t.columnas[j].tipo === 'texto' ? 'text-left' : 'text-right tabular-nums'}`}>
                              {formatearValor(v, t.columnas[j].tipo)}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          ))}

          {reporte.tipo === 'RESUMEN_GENERAL' && (
            <p className="text-xs text-slate-400">
              El balance es operativo: ingresos menos compras a proveedores. No incluye sueldos, alquileres ni
              otros gastos que no se registran en el sistema.
            </p>
          )}
        </section>
      )}
    </div>
  )
}

/** Exportar a PDF y Excel: se cargan solo cuando se usan. */
async function exportarPDF(r: ReporteGenerado) {
  const { exportarPDF: pdf } = await import('./_lib/exportar-pdf')
  await pdf(r)
}

async function exportarExcel(r: ReporteGenerado) {
  const { exportarExcel: excel } = await import('./_lib/exportar-excel')
  excel(r)
}

/** Gráfico de barras simple (sin librerías). Una o dos series. */
function GraficoBarras({ grafico }: { grafico: Grafico }) {
  const maximo = Math.max(1, ...grafico.barras.map((b) => Math.max(b.valor, b.valor2 ?? 0)))
  const alto = (v: number) => `${Math.max(1, (v / maximo) * 100)}%`
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-800">
        {grafico.titulo}
        {grafico.series && (
          <span className="flex items-center gap-3 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-800" />{grafico.series[0]}</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-lime-500" />{grafico.series[1]}</span>
          </span>
        )}
      </figcaption>
      <div className="overflow-x-auto">
        <div className="flex h-48 min-w-full items-end gap-1.5 border-b border-slate-200 pb-0.5" style={{ minWidth: grafico.barras.length * 34 }}>
          {grafico.barras.map((b, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
              <div
                className="w-full max-w-8 rounded-t bg-sky-800"
                style={{ height: alto(b.valor) }}
                title={`${b.etiqueta}: ${formatearValor(b.valor, grafico.tipo)}`}
              />
              {b.valor2 !== undefined && (
                <div
                  className="w-full max-w-8 rounded-t bg-lime-500"
                  style={{ height: alto(b.valor2) }}
                  title={`${b.etiqueta}: ${formatearValor(b.valor2, grafico.tipo)}`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex min-w-full gap-1.5 pt-1" style={{ minWidth: grafico.barras.length * 34 }}>
          {grafico.barras.map((b, i) => (
            <span key={i} className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-500" title={b.etiqueta}>
              {b.etiqueta}
            </span>
          ))}
        </div>
      </div>
    </figure>
  )
}
