'use client'

import { useImperativeHandle, useState, type Ref } from 'react'
import { buscarSistemasPorVozAccion, crearTicketAccion } from '@/app/actions/tickets'
import { MSG_NO_ENTENDIDO } from '@/lib/voz/mensajes'
import {
  ETIQUETA_TIPO,
  ETIQUETA_URGENCIA,
  TIPOS_TICKET,
  URGENCIAS_TICKET,
  type OrigenTicket,
  type TipoTicket,
  type UrgenciaTicket,
} from '@/backend/tickets/constantes'
import { parseTicketCommand } from '@/backend/tickets/comandos-voz'
import { etiquetaSistema } from '@/backend/tickets/busqueda'
import { crearTicketSchema } from '@/backend/tickets/schema'
import type { SistemaOpcion } from '@/backend/tickets/types'
import { SelectorSistema } from './selector-sistema'

type Campo = 'sistema' | 'tipo' | 'urgencia' | 'descripcion'
type Errores = Partial<Record<Campo | 'general', string>>
type Aviso = { tipo: 'info' | 'error'; texto: string } | null

const CAMPO_DE_RUTA: Record<string, Campo> = {
  sistema_instalado_id: 'sistema',
  tipo_mantenimiento: 'tipo',
  nivel_urgencia: 'urgencia',
  descripcion_incidencia: 'descripcion',
}

const RESALTE = 'ring-2 ring-lime-400 bg-lime-50'

function EtiquetaVoz({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <span className="ml-2 rounded-full bg-lime-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-lime-900">por voz</span>
}

/** Lo que la página puede pedirle al formulario: el micrófono está en la cabecera. */
export interface FormularioTicketHandle {
  dictar: (texto: string) => void
}

/** Nuevo Ticket (CU18, pasos 2 a 4) con dictado por voz. Nunca guarda solo: confirma el usuario. */
export function FormularioTicket({
  sistemas,
  onCancelar,
  onCreado,
  ref,
}: {
  sistemas: SistemaOpcion[]
  onCancelar: () => void
  onCreado: (mensaje: string) => void
  ref?: Ref<FormularioTicketHandle>
}) {
  const [sistemaId, setSistemaId] = useState<number | null>(null)
  const [tipo, setTipo] = useState<TipoTicket | ''>('')
  const [urgencia, setUrgencia] = useState<UrgenciaTicket | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [origen, setOrigen] = useState<OrigenTicket>('MANUAL')
  const [porVoz, setPorVoz] = useState<ReadonlySet<Campo>>(new Set())
  const [coincidencias, setCoincidencias] = useState<SistemaOpcion[]>([])
  const [aviso, setAviso] = useState<Aviso>(null)
  const [procesandoVoz, setProcesandoVoz] = useState(false)
  const [enviando, setEnviando] = useState(false)

  /** Un campo editado a mano deja de estar resaltado como "por voz". */
  function editado(campo: Campo) {
    setErrores((e) => ({ ...e, [campo]: undefined, general: undefined }))
    if (porVoz.has(campo)) {
      const siguiente = new Set(porVoz)
      siguiente.delete(campo)
      setPorVoz(siguiente)
    }
  }

  async function alDictar(texto: string) {
    const cmd = parseTicketCommand(texto)
    if (cmd.camposDetectados.length === 0) {
      setAviso({ tipo: 'error', texto: MSG_NO_ENTENDIDO })
      return
    }

    const marcados = new Set<Campo>()
    const notas: string[] = []
    if (cmd.tipo) {
      setTipo(cmd.tipo)
      marcados.add('tipo')
    }
    if (cmd.urgencia) {
      setUrgencia(cmd.urgencia)
      marcados.add('urgencia')
    }
    if (cmd.descripcion) {
      setDescripcion(cmd.descripcion)
      marcados.add('descripcion')
    }

    setCoincidencias([])
    if (cmd.clienteTexto || cmd.sistemaTexto) {
      setProcesandoVoz(true)
      const r = await buscarSistemasPorVozAccion({ clienteTexto: cmd.clienteTexto, sistemaTexto: cmd.sistemaTexto })
      setProcesandoVoz(false)
      const buscado = [cmd.clienteTexto, cmd.sistemaTexto].filter(Boolean).join(' / ')
      if (!r.ok) {
        notas.push(r.error)
      } else if (r.data.length === 1) {
        setSistemaId(r.data[0].id)
        marcados.add('sistema')
      } else if (r.data.length > 1) {
        setSistemaId(null)
        setCoincidencias(r.data)
        notas.push(`Hay ${r.data.length} sistemas que coinciden con «${buscado}»: elija uno de la lista.`)
      } else {
        setSistemaId(null)
        notas.push(`No se encontró un sistema instalado para «${buscado}»: selecciónelo manualmente.`)
      }
    }

    setPorVoz(marcados)
    setOrigen('VOZ')
    setErrores({})
    setAviso({
      tipo: 'info',
      texto: [...notas, 'Revise los campos resaltados y confirme con «Registrar ticket».'].join(' '),
    })
  }

  useImperativeHandle(ref, () => ({ dictar: (texto: string) => void alDictar(texto) }))

  function elegirCoincidencia(s: SistemaOpcion) {
    setSistemaId(s.id)
    setCoincidencias([])
    setPorVoz(new Set([...porVoz, 'sistema']))
    setErrores((e) => ({ ...e, sistema: undefined }))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const datos = {
      sistema_instalado_id: sistemaId ?? undefined,
      tipo_mantenimiento: tipo || undefined,
      nivel_urgencia: urgencia || undefined,
      descripcion_incidencia: descripcion,
      origen,
    }
    const parsed = crearTicketSchema.safeParse(datos)
    if (!parsed.success) {
      const nuevos: Errores = {}
      for (const issue of parsed.error.issues) {
        const campo = CAMPO_DE_RUTA[String(issue.path[0])]
        if (campo && !nuevos[campo]) nuevos[campo] = issue.message
      }
      setErrores(nuevos)
      return
    }

    setEnviando(true)
    const r = await crearTicketAccion(parsed.data)
    setEnviando(false)
    if (!r.ok) {
      setErrores({ general: r.error })
      return
    }
    onCreado(r.mensaje)
  }

  if (sistemas.length === 0) {
    return (
      <section className="tarjeta flex flex-col gap-3 p-5" aria-labelledby="titulo-sin-sistemas">
        <h2 id="titulo-sin-sistemas" className="text-lg font-bold text-slate-900">
          No hay sistemas instalados
        </h2>
        <p className="text-sm text-slate-600">
          Para registrar un ticket debe existir al menos un sistema instalado en un establecimiento activo de un cliente
          activo. Registre primero el sistema instalado y vuelva a intentarlo.
        </p>
        <button type="button" onClick={onCancelar} className="cursor-pointer self-start rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Cerrar
        </button>
      </section>
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="tarjeta flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="titulo-nuevo-ticket">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="titulo-nuevo-ticket" className="text-lg font-bold text-slate-900">
            Nuevo Ticket
          </h2>
          <p className="text-sm text-slate-500">
            Complete el formulario o díctelo con el micrófono de arriba; el ticket solo se guarda al confirmar.
          </p>
        </div>
        {procesandoVoz && <p className="text-xs text-slate-500" aria-live="polite">Buscando el sistema dictado…</p>}
      </div>

      {aviso && (
        <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={aviso.tipo === 'error' ? 'mensaje-error' : 'rounded-xl border border-lime-200 bg-lime-50 p-3 text-sm text-lime-900'}>
          {aviso.texto}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">
          Sistema instalado *<EtiquetaVoz visible={porVoz.has('sistema')} />
        </span>
        {coincidencias.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-sm font-medium text-amber-900">Coincidencias del dictado:</p>
            <ul className="flex flex-col gap-1">
              {coincidencias.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => elegirCoincidencia(s)}
                    className="w-full cursor-pointer rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-lime-50"
                  >
                    {etiquetaSistema(s)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SelectorSistema
          sistemas={sistemas}
          valor={sistemaId}
          onCambiar={(id) => {
            setSistemaId(id)
            setCoincidencias([])
            editado('sistema')
          }}
          resaltado={porVoz.has('sistema')}
          error={errores.sistema}
        />
        {errores.sistema && (
          <p role="alert" className="text-sm text-red-700">
            {errores.sistema}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Tipo de mantenimiento *<EtiquetaVoz visible={porVoz.has('tipo')} />
          </span>
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as TipoTicket | '')
              editado('tipo')
            }}
            aria-invalid={Boolean(errores.tipo)}
            className={`campo-select ${porVoz.has('tipo') ? RESALTE : ''}`}
          >
            <option value="">Seleccione…</option>
            {TIPOS_TICKET.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
          {errores.tipo && <span role="alert" className="text-sm text-red-700">{errores.tipo}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            Nivel de urgencia *<EtiquetaVoz visible={porVoz.has('urgencia')} />
          </span>
          <select
            value={urgencia}
            onChange={(e) => {
              setUrgencia(e.target.value as UrgenciaTicket | '')
              editado('urgencia')
            }}
            aria-invalid={Boolean(errores.urgencia)}
            className={`campo-select ${porVoz.has('urgencia') ? RESALTE : ''}`}
          >
            <option value="">Seleccione…</option>
            {URGENCIAS_TICKET.map((u) => (
              <option key={u} value={u}>
                {ETIQUETA_URGENCIA[u]}
              </option>
            ))}
          </select>
          {errores.urgencia && <span role="alert" className="text-sm text-red-700">{errores.urgencia}</span>}
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">
          Descripción de la incidencia *<EtiquetaVoz visible={porVoz.has('descripcion')} />
        </span>
        <textarea
          value={descripcion}
          onChange={(e) => {
            setDescripcion(e.target.value)
            editado('descripcion')
          }}
          rows={4}
          maxLength={2000}
          aria-invalid={Boolean(errores.descripcion)}
          placeholder="Describa el problema o el mantenimiento requerido…"
          className={`campo-input ${porVoz.has('descripcion') ? RESALTE : ''}`}
        />
        {errores.descripcion && <span role="alert" className="text-sm text-red-700">{errores.descripcion}</span>}
      </label>

      {errores.general && (
        <p role="alert" className="mensaje-error">
          {errores.general}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancelar} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={enviando || procesandoVoz} className="btn-primario">
          {enviando ? 'Registrando…' : 'Registrar ticket'}
        </button>
      </div>
    </form>
  )
}
