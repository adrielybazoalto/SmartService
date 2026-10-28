'use client'

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react'
import { PageHeaderBadge } from '@/components/page-header-badge'
import {
  listarTecnicos,
  obtenerResumenPersonalTecnico,
  obtenerBloqueosTecnico,
  guardarJornada,
  registrarBloqueo,
  eliminarBloqueoAction,
} from '@/app/actions/jornadas'
import type { TecnicoResumen, BloqueoTecnico } from '@/backend/personal-tecnico'
import {
  Clock,
  UserCheck,
  Ban,
  AlertCircle,
  CheckCircle2,
  Search,
  Users,
  ShieldCheck,
  History,
  Info,
  Calendar,
} from 'lucide-react'

const OPCIONES_DIAS = [
  'Lunes a Viernes',
  'Lunes a Sábado',
  'Lunes a Domingo',
  'Fines de Semana',
] as const

const TIPOS_AUSENCIA = [
  'Permiso Particular',
  'Vacaciones',
  'Baja Médica',
  'Capacitación',
  'Misión Oficial',
] as const

export default function GestionJornadasPage() {
  const [tecnicos, setTecnicos] = useState<{ id: number; nombre: string; correo: string }[]>([])
  const [resumenGlobal, setResumenGlobal] = useState<TecnicoResumen[]>([])
  const [selectedTecnico, setSelectedTecnico] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [cargandoBloqueos, setCargandoBloqueos] = useState(false)

  const [pestanaActiva, setPestanaActiva] = useState<'resumen' | 'configurar'>('resumen')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'disponibles' | 'bloqueados'>('todos')

  // Formulario Jornada
  const [diaSemana, setDiaSemana] = useState('Lunes a Viernes')
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFin, setHoraFin] = useState('18:00')

  // Formulario Bloqueo
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [motivo, setMotivo] = useState('')
  const [tipoBloqueo, setTipoBloqueo] = useState<string>('Permiso Particular')

  const [bloqueosTecnico, setBloqueosTecnico] = useState<BloqueoTecnico[]>([])
  const [mensaje, setMensaje] = useState<{ text: string; type: 'success' | 'error' | '' }>({
    text: '',
    type: '',
  })

  // Transiciones de servidor
  const [isPendingJornada, startTransitionJornada] = useTransition()
  const [isPendingBloqueo, startTransitionBloqueo] = useTransition()
  const [bloqueoEliminandoId, setBloqueoEliminandoId] = useState<number | null>(null)

  // Carga sincronizada desde la base de datos
  const recargarDatos = useCallback(async () => {
    try {
      setCargando(true)
      const [listaTech, resumen] = await Promise.all([
        listarTecnicos(),
        obtenerResumenPersonalTecnico(),
      ])
      setTecnicos(listaTech || [])
      setResumenGlobal(resumen || [])
    } catch (err) {
      console.error(err)
      setMensaje({ text: 'Error al sincronizar datos con el servidor.', type: 'error' })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargarDatos()
  }, [recargarDatos])

  // Carga dinámica de bloqueos de un colaborador específico
  const cargarBloqueosTecnico = useCallback(async (techId: number) => {
    try {
      setCargandoBloqueos(true)
      const bloqList = await obtenerBloqueosTecnico(techId)
      setBloqueosTecnico(bloqList || [])
    } catch (err) {
      console.error(err)
    } finally {
      setCargandoBloqueos(false)
    }
  }, [])

  // Al cambiar el técnico seleccionado, cargar sus datos de jornada y su historial de bloqueos
  useEffect(() => {
    if (selectedTecnico === null) {
      setBloqueosTecnico([])
      return
    }

    const techInfo = resumenGlobal.find((t) => t.id === selectedTecnico)
    if (techInfo?.jornadaData) {
      setDiaSemana(techInfo.jornadaData.dia_semana)
      setHoraInicio(techInfo.jornadaData.hora_inicio)
      setHoraFin(techInfo.jornadaData.hora_fin)
    } else {
      setDiaSemana('Lunes a Viernes')
      setHoraInicio('08:00')
      setHoraFin('18:00')
    }

    cargarBloqueosTecnico(selectedTecnico)
  }, [selectedTecnico, resumenGlobal, cargarBloqueosTecnico])

  // Acción rápida desde la tabla global: ir a configurar y seleccionar al técnico
  const irAGestionarAgenda = (techId: number) => {
    setSelectedTecnico(techId)
    setPestanaActiva('configurar')
    cargarBloqueosTecnico(techId)
  }

  // Filtrado de la lista en memoria
  const tecnicosFiltrados = useMemo(() => {
    return resumenGlobal.filter((t) => {
      const coincideTexto =
        t.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        t.correo.toLowerCase().includes(filtroTexto.toLowerCase())

      if (!coincideTexto) return false

      if (filtroEstado === 'disponibles') return !t.bloqueado
      if (filtroEstado === 'bloqueados') return t.bloqueado
      return true
    })
  }, [resumenGlobal, filtroTexto, filtroEstado])

  // Contadores métricas en tiempo real
  const totalTecnicos = resumenGlobal.length
  const totalDisponibles = resumenGlobal.filter((t) => !t.bloqueado).length
  const totalBloqueados = resumenGlobal.filter((t) => t.bloqueado).length

  // Manejo de envío de Carga Horaria
  const handleJornadaSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTecnico) {
      setMensaje({ text: 'Por favor, seleccione un técnico primero.', type: 'error' })
      return
    }

    if (diaSemana.trim().length > 20) {
      setMensaje({
        text: 'El campo de días no puede superar los 20 caracteres (límite de base de datos).',
        type: 'error',
      })
      return
    }

    if (horaFin <= horaInicio) {
      setMensaje({
        text: 'La hora de salida debe ser posterior a la hora de ingreso.',
        type: 'error',
      })
      return
    }

    startTransitionJornada(async () => {
      const res = await guardarJornada(selectedTecnico, diaSemana.trim(), horaInicio, horaFin)
      if (res.success) {
        // 1. Recargar datos del servidor inmediatamente
        await recargarDatos()

        // 2. Redireccionar / cambiar automáticamente de pestaña hacia el "Listado y Estado Global"
        setPestanaActiva('resumen')

        // 3. Notificación de éxito
        setMensaje({ text: res.message, type: 'success' })
      } else {
        setMensaje({ text: res.message, type: 'error' })
      }
    })
  }

  // REQUERIMIENTO 1: Registrar Bloqueo con redirección y refresco inmediato
  const handleBloqueoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTecnico) {
      setMensaje({ text: 'Por favor, seleccione un técnico primero.', type: 'error' })
      return
    }

    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      setMensaje({
        text: 'La fecha y hora de fin deben ser posteriores a las de inicio.',
        type: 'error',
      })
      return
    }

    const techId = selectedTecnico
    const motivoTexto = motivo.trim()
    const tipoTexto = tipoBloqueo

    startTransitionBloqueo(async () => {
      const res = await registrarBloqueo(
        techId,
        fechaInicio,
        fechaFin,
        motivoTexto,
        tipoTexto,
      )

      if (res.success) {
        // 1. Limpiar campos del formulario
        setFechaInicio('')
        setFechaFin('')
        setMotivo('')

        // 2. Actualización de estado inmediata en memoria (optimista)
        const detalleNuevo = motivoTexto ? `${tipoTexto} (${motivoTexto})` : tipoTexto
        setResumenGlobal((prev) =>
          prev.map((t) =>
            t.id === techId
              ? {
                  ...t,
                  bloqueado: true,
                  detalleBloqueo: detalleNuevo,
                }
              : t,
          ),
        )

        // 3. Sincronizar de forma inmediata con la BD
        await recargarDatos()

        // 4. Cambiar automáticamente a la pestaña de "Listado y Estado Global"
        setPestanaActiva('resumen')

        // 5. Mensaje de confirmación
        setMensaje({
          text: 'Bloqueo registrado exitosamente. El técnico ahora figura como Bloqueado.',
          type: 'success',
        })
      } else {
        setMensaje({ text: res.message, type: 'error' })
      }
    })
  }

  // REQUERIMIENTO 2: Eliminar Bloqueo y reactivación inmediata de agenda
  const eliminarBloqueo = async (bloqueoId: number) => {
    if (!confirm('¿Confirma cancelar este bloqueo y restablecer la disponibilidad del técnico?')) {
      return
    }

    setBloqueoEliminandoId(bloqueoId)
    try {
      const res = await eliminarBloqueoAction(bloqueoId)
      if (res.success) {
        setMensaje({ text: res.message, type: 'success' })

        // 1. Quitar de la lista local de bloqueos del técnico de inmediato
        const nuevaLista = bloqueosTecnico.filter((b) => b.id !== bloqueoId)
        setBloqueosTecnico(nuevaLista)

        // 2. Si ya no le quedan bloqueos vigentes al técnico, actualizar de inmediato el estado global
        if (selectedTecnico) {
          const ahoraMs = Date.now()
          const tieneBloqueosVigentes = nuevaLista.some((b) => {
            const fin = new Date(b.fecha_fin).getTime()
            return fin >= ahoraMs
          })

          if (!tieneBloqueosVigentes) {
            setResumenGlobal((prev) =>
              prev.map((t) =>
                t.id === selectedTecnico
                  ? {
                      ...t,
                      bloqueado: false,
                      detalleBloqueo: 'Disponible',
                      bloqueoActivo: null,
                    }
                  : t,
              ),
            )
          }
        }

        // 3. Sincronizar con la base de datos para asegurar consistencia
        await recargarDatos()
      } else {
        setMensaje({ text: res.message, type: 'error' })
      }
    } catch (err) {
      console.error(err)
      setMensaje({ text: 'Error al cancelar el bloqueo.', type: 'error' })
    } finally {
      setBloqueoEliminandoId(null)
    }
  }

  const tecnicoActual = useMemo(
    () => resumenGlobal.find((t) => t.id === selectedTecnico),
    [resumenGlobal, selectedTecnico],
  )

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Cabecera oficial corporativa con PageHeaderBadge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <PageHeaderBadge
            paquete="P3"
            cu="CU10"
            titulo="DISPONIBILIDAD Y JORNADAS DEL PERSONAL"
          />
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">
            Gestión de Disponibilidad y Jornadas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Supervisa el estado de la cuadrilla técnica, programa turnos laborales y administra bloqueos o ausencias.
          </p>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex items-center bg-gray-100 p-1.5 rounded-xl border border-gray-200 shadow-inner">
          <button
            onClick={() => setPestanaActiva('resumen')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              pestanaActiva === 'resumen'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4 text-lime-600" />
            Listado y Estado Global
          </button>
          <button
            onClick={() => setPestanaActiva('configurar')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              pestanaActiva === 'configurar'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4 text-lime-600" />
            Configurar y Bloquear
          </button>
        </div>
      </div>

      {/* Alertas de Notificación */}
      {mensaje.text && (
        <div
          className={`flex items-start justify-between p-4 rounded-xl border text-sm font-medium transition-all ${
            mensaje.type === 'success'
              ? 'bg-lime-50 border-lime-200 text-lime-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {mensaje.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-lime-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{mensaje.text}</span>
          </div>
          <button
            onClick={() => setMensaje({ text: '', type: '' })}
            className="text-xs font-semibold text-gray-500 hover:text-gray-900 ml-4 underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* VISTA 1: LISTADO Y ESTADO GLOBAL */}
      {pestanaActiva === 'resumen' && (
        <div className="space-y-6">
          {/* Tarjetas de Métricas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-gray-500">Técnicos Registrados</p>
                <p className="text-2xl font-black text-gray-900 mt-1">{totalTecnicos}</p>
              </div>
              <div className="p-3 bg-gray-100 text-gray-700 rounded-xl">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-lime-700">Disponibles Ahora</p>
                <p className="text-2xl font-black text-lime-700 mt-1">{totalDisponibles}</p>
              </div>
              <div className="p-3 bg-lime-100 text-lime-700 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-red-700">Bloqueados / Ausentes</p>
                <p className="text-2xl font-black text-red-700 mt-1">{totalBloqueados}</p>
              </div>
              <div className="p-3 bg-red-100 text-red-700 rounded-xl">
                <Ban className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Tabla con Filtros */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Estado de Disponibilidad en Tiempo Real</h2>
                <p className="text-xs text-gray-500">Supervisa en tiempo real si el técnico se encuentra operativo o bloqueado.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Buscador */}
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o correo..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-lime-500 w-52 sm:w-64"
                  />
                </div>

                {/* Filtro por estado */}
                <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setFiltroEstado('todos')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      filtroEstado === 'todos' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    Todos ({totalTecnicos})
                  </button>
                  <button
                    onClick={() => setFiltroEstado('disponibles')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      filtroEstado === 'disponibles' ? 'bg-white shadow text-lime-700' : 'text-gray-600'
                    }`}
                  >
                    Disponibles ({totalDisponibles})
                  </button>
                  <button
                    onClick={() => setFiltroEstado('bloqueados')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      filtroEstado === 'bloqueados' ? 'bg-white shadow text-red-700' : 'text-gray-600'
                    }`}
                  >
                    Bloqueados ({totalBloqueados})
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600 uppercase text-xs font-bold tracking-wider">
                    <th className="p-4">Técnico</th>
                    <th className="p-4">Correo</th>
                    <th className="p-4">Jornada Laboral Configurada</th>
                    <th className="p-4">Estado Actual</th>
                    <th className="p-4 text-center">Acción rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cargando ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                        Cargando estado del personal técnico...
                      </td>
                    </tr>
                  ) : tecnicosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                        No se encontraron técnicos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    tecnicosFiltrados.map((tech) => (
                      <tr key={tech.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-gray-900">{tech.nombre}</div>
                          <div className="text-xs text-gray-400">ID Técnico: #{tech.id}</div>
                        </td>
                        <td className="p-4 text-gray-600 font-mono text-xs">{tech.correo}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-800">
                            <Clock className="w-3.5 h-3.5 text-gray-500" />
                            {tech.jornada}
                          </span>
                        </td>
                        <td className="p-4">
                          {tech.bloqueado ? (
                            <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-800 font-bold px-3 py-1 rounded-full text-xs">
                              🔴 Bloqueado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-lime-100 text-lime-800 font-bold px-3 py-1 rounded-full text-xs">
                              🟢 Disponible
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => irAGestionarAgenda(tech.id)}
                            className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-800 font-bold px-3.5 py-1.5 rounded-xl text-xs transition-all shadow-sm"
                          >
                            Gestionar Agenda
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VISTA 2: CONFIGURACIÓN, EDICIÓN Y GESTIÓN DE BLOQUEOS */}
      {pestanaActiva === 'configurar' && (
        <div className="space-y-6">
          {/* Selector de Técnico */}
          <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Seleccionar Personal Técnico a Configurar:
            </label>
            <select
              className="w-full border border-gray-300 p-3.5 rounded-xl bg-gray-50 text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-lime-500 focus:bg-white text-sm"
              value={selectedTecnico ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                setSelectedTecnico(id)
                cargarBloqueosTecnico(id)
              }}
            >
              <option value="" disabled>
                -- Seleccione un técnico de la lista --
              </option>
              {tecnicos.map((tec) => (
                <option key={tec.id} value={tec.id}>
                  {tec.nombre} — ({tec.correo})
                </option>
              ))}
            </select>

            {tecnicoActual && (
              <div className="mt-4 p-3.5 bg-lime-50 border border-lime-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-lime-900">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-lime-600 shrink-0" />
                  <span>
                    <strong>Horario configurado:</strong> {tecnicoActual.jornada}
                  </span>
                </div>
                <span
                  className={`font-bold px-2.5 py-1 rounded-md text-xs w-fit ${
                    tecnicoActual.bloqueado ? 'bg-red-100 text-red-800' : 'bg-lime-200 text-lime-800'
                  }`}
                >
                  {tecnicoActual.bloqueado
                    ? '🔴 Bloqueado'
                    : '🟢 Disponible'}
                </span>
              </div>
            )}
          </div>

          {selectedTecnico ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Formulario 1: Carga Horaria (Jornada) */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-lime-100 text-lime-800 rounded-xl font-bold">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">Configurar / Editar Jornada</h2>
                        <p className="text-xs text-gray-500">Asigna los días y horas de actividad del técnico.</p>
                      </div>
                    </div>

                    <form onSubmit={handleJornadaSubmit} className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-bold text-gray-700 uppercase">
                            Días de Actividad:
                          </label>
                          <span className="text-[10px] text-gray-400">
                            {diaSemana.length}/20 caracteres
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={20}
                          value={diaSemana}
                          onChange={(e) => setDiaSemana(e.target.value)}
                          className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-lime-500 focus:outline-none"
                          required
                        />

                        {/* Botones de selección rápida */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {OPCIONES_DIAS.map((opc) => (
                            <button
                              type="button"
                              key={opc}
                              onClick={() => setDiaSemana(opc)}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                                diaSemana === opc
                                  ? 'bg-lime-100 border-lime-300 text-lime-800 font-bold'
                                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              {opc}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            Hora Ingreso:
                          </label>
                          <input
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                            className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-lime-500 focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            Hora Salida:
                          </label>
                          <input
                            type="time"
                            value={horaFin}
                            onChange={(e) => setHoraFin(e.target.value)}
                            className="w-full border border-gray-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-lime-500 focus:outline-none"
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isPendingJornada}
                        className="w-full mt-2 bg-[#b5ef35] hover:bg-[#a3df25] disabled:opacity-50 text-gray-900 font-bold py-3 px-4 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2"
                      >
                        <Clock className="w-4 h-4" />
                        {isPendingJornada ? 'Guardando horario...' : 'Guardar / Actualizar Horario'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Formulario 2: Registrar Bloqueo */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-red-100 text-red-800 rounded-xl font-bold">
                        <Ban className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">Registrar Bloqueo de Agenda</h2>
                        <p className="text-xs text-gray-500">Inhabilita al colaborador para asignación de órdenes de trabajo.</p>
                      </div>
                    </div>

                    <form onSubmit={handleBloqueoSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                          Tipo de Ausencia:
                        </label>
                        <select
                          value={tipoBloqueo}
                          onChange={(e) => setTipoBloqueo(e.target.value)}
                          className="w-full border border-gray-300 p-3 rounded-xl text-sm bg-white focus:ring-2 focus:ring-lime-500 focus:outline-none"
                        >
                          {TIPOS_AUSENCIA.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            Fecha y Hora Inicio:
                          </label>
                          <input
                            type="datetime-local"
                            value={fechaInicio}
                            onChange={(e) => setFechaInicio(e.target.value)}
                            className="w-full border border-gray-300 p-2.5 rounded-xl text-xs focus:ring-2 focus:ring-lime-500 focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            Fecha y Hora Fin:
                          </label>
                          <input
                            type="datetime-local"
                            value={fechaFin}
                            onChange={(e) => setFechaFin(e.target.value)}
                            className="w-full border border-gray-300 p-2.5 rounded-xl text-xs focus:ring-2 focus:ring-lime-500 focus:outline-none"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                          Motivo / Justificación:
                        </label>
                        <textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          maxLength={255}
                          className="w-full border border-gray-300 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-lime-500 focus:outline-none"
                          placeholder="Ej. Permiso de salud particular, vacaciones anuales, etc."
                          rows={2}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isPendingBloqueo}
                        className="w-full bg-[#b5ef35] hover:bg-[#a3df25] disabled:opacity-50 text-gray-900 font-bold py-3 px-4 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2"
                      >
                        <Ban className="w-4 h-4" />
                        {isPendingBloqueo ? 'Registrando bloqueo...' : 'Registrar Bloqueo de Agenda'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* REQUERIMIENTO 2: Panel Dinámico de Desbloqueo */}
              <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-700" />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Historial de Bloqueos del Técnico
                      </h3>
                      <p className="text-xs text-gray-500">
                        Bloqueos vigentes e históricos asociados a {tecnicoActual?.nombre ?? 'este colaborador'}.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">
                    {bloqueosTecnico.length} registro(s)
                  </span>
                </div>

                {cargandoBloqueos ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    Cargando bloqueos vigentes...
                  </div>
                ) : bloqueosTecnico.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl">
                    Este técnico no tiene bloqueos activos y se encuentra disponible.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                          <th className="p-3">Estado</th>
                          <th className="p-3">Tipo</th>
                          <th className="p-3">Motivo</th>
                          <th className="p-3">Desde</th>
                          <th className="p-3">Hasta</th>
                          <th className="p-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bloqueosTecnico.map((bloq) => {
                          const ahoraMs = Date.now()
                          const iniMs = new Date(bloq.fecha_inicio).getTime()
                          const finMs = new Date(bloq.fecha_fin).getTime()
                          const esActivo = ahoraMs >= iniMs && ahoraMs <= finMs
                          const esFuturo = ahoraMs < iniMs

                          return (
                            <tr key={bloq.id} className="hover:bg-gray-50 transition-colors">
                              <td className="p-3">
                                {esActivo && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                    En curso
                                  </span>
                                )}
                                {esFuturo && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                                    Programado
                                  </span>
                                )}
                                {!esActivo && !esFuturo && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                    Finalizado
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{bloq.tipo}</td>
                              <td className="p-3 text-gray-600 max-w-xs truncate">{bloq.motivo}</td>
                              <td className="p-3 text-gray-600 text-xs">
                                {new Date(bloq.fecha_inicio).toLocaleString()}
                              </td>
                              <td className="p-3 text-gray-600 text-xs">
                                {new Date(bloq.fecha_fin).toLocaleString()}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => eliminarBloqueo(bloq.id)}
                                  disabled={bloqueoEliminandoId === bloq.id}
                                  className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-xl text-xs transition-all border border-red-200 shadow-sm disabled:opacity-50"
                                >
                                  {bloqueoEliminandoId === bloq.id ? (
                                    <>
                                      <span className="animate-spin text-xs">⏳</span>
                                      Cancelando...
                                    </>
                                  ) : (
                                    <>
                                      <span>🔓</span> Desbloquear / Cancelar Ausencia
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 p-12 rounded-2xl text-center text-gray-500 shadow-sm">
              <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-700">Ningún técnico seleccionado</p>
              <p className="text-xs text-gray-400 mt-1">
                Seleccione un técnico arriba o haga clic en &quot;Gestionar Agenda&quot; desde el listado global.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}