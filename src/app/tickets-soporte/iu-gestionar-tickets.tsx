'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { cambiarEstadoTicketAccion, derivarTicketAccion } from '@/app/actions/tickets'
import { ModalVentana } from '@/app/ordenes-trabajo/modal-ventana'
import { VoiceButton } from '@/components/voz/voice-button'
import { MSG_NO_ENTENDIDO } from '@/lib/voz/mensajes'
import { formatearFechaHora } from '@/lib/fechas'
import {
  ESTADOS_DERIVABLES,
  ESTADOS_TICKET,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  ETIQUETA_URGENCIA,
  TRANSICIONES_TICKET,
  URGENCIAS_TICKET,
  type EstadoTicket,
  type UrgenciaTicket,
} from '@/backend/tickets/constantes'
import { esComandoFiltro, parseFilterCommand } from '@/backend/tickets/comandos-voz'
import type { SistemaOpcion, TicketListado } from '@/backend/tickets/types'
import { FormularioTicket, type FormularioTicketHandle } from './formulario-ticket'

export interface PermisosTickets {
  crear: boolean
  actualizar: boolean
  derivar: boolean
}

type Mensaje = { tipo: 'exito' | 'error'; texto: string } | null

const COLOR_URGENCIA: Record<UrgenciaTicket, string> = {
  BAJA: 'bg-sky-100 text-sky-800 border-sky-200',
  MEDIA: 'bg-amber-100 text-amber-800 border-amber-200',
  ALTA: 'bg-orange-100 text-orange-800 border-orange-200',
  CRITICA: 'bg-red-100 text-red-800 border-red-300',
}

const COLOR_ESTADO: Record<EstadoTicket, string> = {
  ABIERTO: 'bg-blue-100 text-blue-800',
  EN_PROCESO: 'bg-amber-100 text-amber-800',
  RESUELTO: 'bg-emerald-100 text-emerald-800',
  CANCELADO: 'bg-slate-200 text-slate-700',
}

const ETIQUETA_ACCION: Record<EstadoTicket, string> = {
  ABIERTO: 'Reabrir',
  EN_PROCESO: 'En Proceso',
  RESUELTO: 'Resuelto',
  CANCELADO: 'Cancelar',
}

function BadgeUrgencia({ urgencia }: { urgencia: UrgenciaTicket | null }) {
  if (!urgencia) return <span className="text-xs text-slate-400">—</span>
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COLOR_URGENCIA[urgencia]}`}>
      {ETIQUETA_URGENCIA[urgencia]}
    </span>
  )
}

function BadgeEstado({ estado }: { estado: EstadoTicket }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ESTADO[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

/** IU_GestionarTickets (CU18): listado con filtros (también por voz), estados y derivación a OT. */
export function IU_GestionarTickets({
  tickets,
  sistemas,
  errorCarga,
  permisos,
}: {
  tickets: TicketListado[]
  sistemas: SistemaOpcion[]
  errorCarga: string | null
  permisos: PermisosTickets
}) {
  const [filtroEstado, setFiltroEstado] = useState<EstadoTicket | ''>('')
  const [filtroUrgencia, setFiltroUrgencia] = useState<UrgenciaTicket | ''>('')
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [derivando, setDerivando] = useState<TicketListado | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const formulario = useRef<FormularioTicketHandle>(null)

  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(null), 6000)
    return () => clearTimeout(t)
  }, [mensaje])

  const visibles = useMemo(
    () =>
      tickets.filter(
        (t) => (!filtroEstado || t.estado === filtroEstado) && (!filtroUrgencia || t.urgencia === filtroUrgencia),
      ),
    [tickets, filtroEstado, filtroUrgencia],
  )

  function filtrarPorVoz(texto: string) {
    const cmd = parseFilterCommand(texto)
    if (cmd.limpiar) {
      setFiltroEstado('')
      setFiltroUrgencia('')
      setMensaje({ tipo: 'exito', texto: 'Filtros quitados: se muestran todos los tickets.' })
      return
    }
    if (cmd.camposDetectados.length === 0) {
      setMensaje({ tipo: 'error', texto: MSG_NO_ENTENDIDO })
      return
    }
    setFiltroEstado(cmd.estado ?? '')
    setFiltroUrgencia(cmd.urgencia ?? '')
    const partes = [
      cmd.estado && `estado ${ETIQUETA_ESTADO[cmd.estado]}`,
      cmd.urgencia && `urgencia ${ETIQUETA_URGENCIA[cmd.urgencia]}`,
    ].filter(Boolean)
    setMensaje({ tipo: 'exito', texto: `Filtro por voz: ${partes.join(' y ')}.` })
  }

  /** Micrófono de la cabecera: «mostrar…/filtrar…» filtra el listado; lo demás dicta un ticket nuevo. */
  function alDictar(texto: string) {
    if (!permisos.crear || esComandoFiltro(texto)) {
      filtrarPorVoz(texto)
      return
    }
    if (sistemas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'No hay sistemas instalados activos: no se puede registrar un ticket.' })
      return
    }
    // Abre el formulario (si estaba cerrado) antes de pasarle lo dictado
    if (!formularioAbierto) flushSync(() => setFormularioAbierto(true))
    formulario.current?.dictar(texto)
  }

  async function cambiarEstado(ticket: TicketListado, estado: EstadoTicket) {
    if (estado === 'CANCELADO' && !window.confirm(`¿Cancelar el ticket ${ticket.codigo}?`)) return
    setOcupado(ticket.id)
    const r = await cambiarEstadoTicketAccion(ticket.id, estado)
    setOcupado(null)
    setMensaje(
      r.ok
        ? { tipo: 'exito', texto: `Ticket ${ticket.codigo}: ${ETIQUETA_ESTADO[estado]}.` }
        : { tipo: 'error', texto: r.error },
    )
  }

  function acciones(ticket: TicketListado) {
    const transiciones = permisos.actualizar ? TRANSICIONES_TICKET[ticket.estado] : []
    const puedeDerivar = permisos.derivar && !ticket.orden && ESTADOS_DERIVABLES.includes(ticket.estado)
    return (
      <div className="flex flex-wrap gap-1.5">
        {transiciones.map((estado) => (
          <button
            key={estado}
            type="button"
            disabled={ocupado === ticket.id}
            onClick={() => cambiarEstado(ticket, estado)}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
              estado === 'CANCELADO'
                ? 'border-red-200 text-red-700 hover:bg-red-50'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {ETIQUETA_ACCION[estado]}
          </button>
        ))}
        {ticket.orden ? (
          <button
            type="button"
            disabled
            title={`El ticket ya fue derivado a la Orden de Trabajo ${ticket.orden.codigo_orden}`}
            className="cursor-not-allowed rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
          >
            OT {ticket.orden.codigo_orden}
          </button>
        ) : (
          puedeDerivar && (
            <button
              type="button"
              disabled={ocupado === ticket.id}
              onClick={() => setDerivando(ticket)}
              className="cursor-pointer rounded-lg border border-lime-300 bg-lime-50 px-2.5 py-1 text-xs font-semibold text-lime-800 hover:bg-lime-100 disabled:opacity-50"
            >
              Derivar a OT
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="tarjeta flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              CU18
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Tickets de Soporte y Mantenimientos</h1>
          <p className="text-sm text-slate-500">
            Registro de incidencias sobre los sistemas instalados, seguimiento de su estado y derivación a órdenes de trabajo.
            {permisos.crear
              ? ' Con el micrófono puede dictar un ticket nuevo o filtrar el listado («mostrar tickets abiertos»).'
              : ' Con el micrófono puede filtrar el listado («mostrar tickets abiertos»).'}
          </p>
        </div>
        <VoiceButton
          redondo
          etiqueta={permisos.crear ? 'Dictar ticket o filtrar por voz' : 'Filtrar por voz'}
          onResult={alDictar}
          ayuda={
            permisos.crear
              ? 'Ej.: «Correctivo, cliente Hotel Las Palmeras, las cámaras no graban, urgencia alta» o «mostrar tickets abiertos»'
              : 'Ej.: «mostrar tickets abiertos de urgencia crítica»'
          }
          className="shrink-0"
        />
      </header>

      {mensaje && (
        <div
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
          className={`fixed inset-x-4 bottom-4 z-50 shadow-lg sm:left-auto sm:right-6 sm:max-w-md ${
            mensaje.tipo === 'error' ? 'mensaje-error' : 'mensaje-exito'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {errorCarga && (
        <p role="alert" className="mensaje-error">
          {errorCarga}
        </p>
      )}

      {formularioAbierto ? (
        <FormularioTicket
          ref={formulario}
          sistemas={sistemas}
          onCancelar={() => setFormularioAbierto(false)}
          onCreado={(texto) => {
            setFormularioAbierto(false)
            setMensaje({ tipo: 'exito', texto })
          }}
        />
      ) : null}

      <section className="tarjeta flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="titulo-listado">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <h2 id="titulo-listado" className="sr-only">
              Listado de tickets
            </h2>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Estado</span>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as EstadoTicket | '')}
                className="campo-select sm:w-44"
              >
                <option value="">Todos</option>
                {ESTADOS_TICKET.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO[e]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Urgencia</span>
              <select
                value={filtroUrgencia}
                onChange={(e) => setFiltroUrgencia(e.target.value as UrgenciaTicket | '')}
                className="campo-select sm:w-44"
              >
                <option value="">Todas</option>
                {URGENCIAS_TICKET.map((u) => (
                  <option key={u} value={u}>
                    {ETIQUETA_URGENCIA[u]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {permisos.crear && !formularioAbierto && (
            <button type="button" onClick={() => setFormularioAbierto(true)} className="btn-primario self-start lg:self-auto">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo Ticket
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500" aria-live="polite">
          {visibles.length} de {tickets.length} ticket(s)
        </p>

        {visibles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {tickets.length === 0 ? 'Aún no hay tickets registrados.' : 'Ningún ticket coincide con los filtros.'}
          </p>
        ) : (
          <>
            {/* Celular: tarjetas */}
            <ul className="flex flex-col gap-3 md:hidden">
              {visibles.map((t) => (
                <li key={t.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-900">{t.codigo}</p>
                      <p className="text-xs text-slate-500">{formatearFechaHora(t.fecha_reporte)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <BadgeEstado estado={t.estado} />
                      <BadgeUrgencia urgencia={t.urgencia} />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-800">
                    {t.cliente.nombre} &gt; {t.establecimiento.nombre}
                  </p>
                  <p className="text-sm text-slate-600">
                    {t.sistema.nombre} · {ETIQUETA_TIPO[t.tipo]}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{t.descripcion}</p>
                  <div className="mt-3">
                    {acciones(t)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Escritorio: tabla */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2">Ticket</th>
                    <th scope="col" className="px-3 py-2">Cliente</th>
                    <th scope="col" className="px-3 py-2">Establecimiento</th>
                    <th scope="col" className="px-3 py-2">Sistema</th>
                    <th scope="col" className="px-3 py-2">Tipo</th>
                    <th scope="col" className="px-3 py-2">Urgencia</th>
                    <th scope="col" className="px-3 py-2">Estado</th>
                    <th scope="col" className="px-3 py-2">Fecha</th>
                    <th scope="col" className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibles.map((t) => (
                    <tr key={t.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-mono font-semibold text-slate-900">{t.codigo}</p>
                        <p className="max-w-56 text-xs text-slate-500" title={t.descripcion}>
                          {t.descripcion.length > 80 ? `${t.descripcion.slice(0, 80)}…` : t.descripcion}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-800">{t.cliente.nombre}</td>
                      <td className="px-3 py-3 text-slate-600">{t.establecimiento.nombre}</td>
                      <td className="px-3 py-3 text-slate-600">{t.sistema.nombre}</td>
                      <td className="px-3 py-3 text-slate-600">{ETIQUETA_TIPO[t.tipo]}</td>
                      <td className="px-3 py-3"><BadgeUrgencia urgencia={t.urgencia} /></td>
                      <td className="px-3 py-3"><BadgeEstado estado={t.estado} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatearFechaHora(t.fecha_reporte)}</td>
                      <td className="px-3 py-3">{acciones(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tickets.some((t) => t.orden) && (
          <p className="text-xs text-slate-500">
            Las órdenes derivadas se gestionan en <Link href="/ordenes-trabajo" className="underline">Órdenes de Trabajo (CU12)</Link>.
          </p>
        )}
      </section>

      {derivando && (
        <ModalVentana
          titulo={`Derivar ${derivando.codigo} a Orden de Trabajo`}
          onCerrar={() => setDerivando(null)}
          onConfirmar={async (d) => {
            const r = await derivarTicketAccion({
              ticketId: derivando.id,
              fecha_programada: d.fecha,
              hora_inicio: d.horaInicio,
              hora_fin: d.horaFin,
            })
            if (!r.ok) return r.error
            setDerivando(null)
            setMensaje({ tipo: 'exito', texto: r.mensaje })
            return null
          }}
        />
      )}
    </div>
  )
}
