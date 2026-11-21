'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CalendarOff,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Wrench,
} from 'lucide-react'
import { marcarAlertaLeidaAccion } from '@/app/actions/alertas'
import { formatearFechaHora } from '@/lib/fechas'
import type { AlertaPreventiva, UrgenciaAlerta } from '@/backend/alertas'

export interface PermisosAlertas {
  actualizar: boolean
}

const URGENCIA: Record<
  UrgenciaAlerta,
  { texto: string; clase: string; Icono: typeof AlertTriangle }
> = {
  VENCIDO: {
    texto: 'Vencido',
    clase: 'border-red-200 bg-red-50 text-red-700',
    Icono: AlertTriangle,
  },
  PROXIMO: {
    texto: 'Próximo a vencer',
    clase: 'border-amber-200 bg-amber-50 text-amber-800',
    Icono: Clock,
  },
  VIGENTE: {
    texto: 'Programado',
    clase: 'border-sky-200 bg-sky-50 text-sky-800',
    Icono: CalendarClock,
  },
  SIN_FECHA: {
    texto: 'Sin fecha',
    clase: 'border-slate-200 bg-slate-50 text-slate-600',
    Icono: CalendarOff,
  },
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' (sin pasar por zonas horarias). */
function fechaCorta(fecha: string | null, vacio = 'Sin fecha programada'): string {
  if (!fecha) return vacio
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

function textoDias(dias: number | null): string {
  if (dias === null) return 'Sin fecha de próximo mantenimiento'
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día(s)`
  if (dias === 0) return 'Vence hoy'
  return `Faltan ${dias} día(s)`
}

type Aviso = { tipo: 'exito' | 'error'; texto: string } | null

export function IUAlertasPreventivas({
  alertasIniciales,
  permisos,
  errorInicial,
  filtroInicial,
}: {
  alertasIniciales: AlertaPreventiva[]
  permisos: PermisosAlertas
  errorInicial: string | null
  /** Filtro solicitado por voz (?filtro=pendientes|todas). */
  filtroInicial?: string
}) {
  const filtroValido = filtroInicial === 'todas' ? 'todas' : 'pendientes'
  const [alertas, setAlertas] = useState(alertasIniciales)
  const [filtro, setFiltro] = useState<'pendientes' | 'todas'>(filtroValido)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [aviso, setAviso] = useState<Aviso>(
    errorInicial ? { tipo: 'error', texto: errorInicial } : null,
  )

  const pendientes = alertas.filter((a) => !a.leido)
  const vencidas = pendientes.filter((a) => a.urgencia === 'VENCIDO').length
  const proximas = pendientes.filter((a) => a.urgencia === 'PROXIMO').length
  const visibles = filtro === 'pendientes' ? pendientes : alertas

  async function marcarLeida(alerta: AlertaPreventiva) {
    setOcupada(alerta.id)
    const r = await marcarAlertaLeidaAccion(alerta.id)
    setOcupada(null)
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error })
      return
    }
    setAlertas((prev) => prev.map((a) => (a.id === alerta.id ? { ...a, leido: true } : a)))
    setAviso({ tipo: 'exito', texto: `Alerta #${alerta.id} marcada como leída.` })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="tarjeta flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            CU19
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Alertas Preventivas
          </h1>
          <p className="text-sm text-slate-500">
            Mantenimientos preventivos vencidos o próximos a vencer según la fecha programada de
            cada sistema instalado. Las alertas se generan automáticamente todos los días.
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
            <dt className="text-xs font-semibold uppercase text-red-700">Vencidas</dt>
            <dd className="text-xl font-bold text-red-800">{vencidas}</dd>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
            <dt className="text-xs font-semibold uppercase text-amber-700">Próximas a vencer</dt>
            <dd className="text-xl font-bold text-amber-800">{proximas}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <dt className="text-xs font-semibold uppercase text-slate-600">Pendientes</dt>
            <dd className="text-xl font-bold text-slate-800">{pendientes.length}</dd>
          </div>
        </dl>
      </header>

      {aviso && (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border p-3 text-sm ${
            aviso.tipo === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <section className="tarjeta flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="titulo-alertas">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-alertas" className="text-base font-semibold text-slate-900">
            {filtro === 'pendientes' ? 'Alertas pendientes' : 'Todas las alertas'}
          </h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar alertas">
            <button
              type="button"
              onClick={() => setFiltro('pendientes')}
              aria-pressed={filtro === 'pendientes'}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                filtro === 'pendientes'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Pendientes ({pendientes.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro('todas')}
              aria-pressed={filtro === 'todas'}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                filtro === 'todas'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Todas ({alertas.length})
            </button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 p-10 text-center">
            <BellOff className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-600">
              No existen alertas de mantenimiento preventivo pendientes
            </p>
            {filtro === 'pendientes' && alertas.length > 0 && (
              <p className="text-xs text-slate-400">
                Hay {alertas.length} alerta(s) leída(s): consúltelas en «Todas».
              </p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibles.map((alerta) => (
              <li
                key={alerta.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 sm:p-5 ${
                  alerta.leido ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeUrgencia urgencia={alerta.urgencia} />
                      <span className="text-xs font-medium text-slate-400">Alerta #{alerta.id}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          alerta.leido
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-lime-100 text-lime-800'
                        }`}
                      >
                        {alerta.leido ? <Check className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                        {alerta.leido ? 'Leída' : 'Pendiente'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{alerta.cliente.nombre}</p>
                    <p className="text-sm text-slate-600">
                      {alerta.establecimiento.nombre} ·{' '}
                      <span className="font-medium text-slate-800">{alerta.sistema.nombre}</span>
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase text-slate-400">
                      Próximo mantenimiento
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {fechaCorta(alerta.sistema.fecha_proximo_mantenimiento)}
                    </p>
                    <p className="text-xs text-slate-500">{textoDias(alerta.dias_restantes)}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-700">{alerta.mensaje}</p>

                <p className="text-xs text-slate-400">
                  Generada: {formatearFechaHora(alerta.fecha_alerta)}
                </p>

                <details className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Ver detalles del sistema instalado
                  </summary>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <dt className="inline font-semibold text-slate-700">Sistema: </dt>
                      <dd className="inline">{alerta.sistema.nombre}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-700">N° de serie: </dt>
                      <dd className="inline">{alerta.sistema.numero_serie ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-700">Periodicidad: </dt>
                      <dd className="inline">{alerta.sistema.periodicidad_meses} mes(es)</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-700">Último mantenimiento: </dt>
                      <dd className="inline">
                        {fechaCorta(alerta.sistema.fecha_ultimo_mantenimiento, '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-700">Establecimiento: </dt>
                      <dd className="inline">{alerta.establecimiento.nombre}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-700">Cliente: </dt>
                      <dd className="inline">{alerta.cliente.nombre}</dd>
                    </div>
                  </dl>
                </details>

                <div className="flex flex-wrap items-center gap-2">
                  {!alerta.leido && permisos.actualizar && (
                    <button
                      type="button"
                      onClick={() => marcarLeida(alerta)}
                      disabled={ocupada === alerta.id}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-lime-300 bg-lime-50 px-3 py-1.5 text-xs font-semibold text-lime-800 hover:bg-lime-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ocupada === alerta.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {ocupada === alerta.id ? 'Guardando…' : 'Marcar como leída'}
                    </button>
                  )}

                  <Link
                    href="/tickets-soporte"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    title="Abrir Tickets de Soporte (CU18) para coordinar la visita o el mantenimiento"
                  >
                    <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                    Coordinar mantenimiento
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-slate-500">
          La coordinación de la visita se realiza en{' '}
          <Link href="/tickets-soporte" className="underline">
            Tickets de Soporte (CU18)
          </Link>
          ; desde allí puede derivarse a una Orden de Trabajo (CU12).
        </p>
      </section>
    </div>
  )
}

function BadgeUrgencia({ urgencia }: { urgencia: UrgenciaAlerta }) {
  const { texto, clase, Icono } = URGENCIA[urgencia]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${clase}`}
    >
      <Icono className="h-3.5 w-3.5" aria-hidden="true" />
      {texto}
    </span>
  )
}
