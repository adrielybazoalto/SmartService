'use client'

import { useEffect, useState } from 'react'

/** Opciones fijas: hora local de Bolivia (UTC-4), independiente de la zona del servidor. */
const OPCIONES_HORA: Intl.DateTimeFormatOptions = {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
}

interface FechaHoraBoliviaProps {
  /** Timestamp ISO (p. ej. "2026-09-28T19:30:00+00:00") desde la BD. */
  fecha: string
}

function formatearEnLaPaz(fecha: string): string {
  const instante = new Date(fecha)
  if (Number.isNaN(instante.getTime())) return fecha
  return instante.toLocaleString('es-BO', OPCIONES_HORA)
}

/**
 * Fecha y hora en la zona horaria de Bolivia (America/La_Paz).
 * Se formatea SOLO en el cliente, después del montaje (useEffect): el servidor
 * y el primer render del cliente muestran el mismo placeholder, evitando
 * hydration mismatch, y la hora local siempre corresponde a UTC-4 tanto en el
 * servidor (UTC) como en cualquier navegador.
 */
export function FechaHoraBolivia({ fecha }: FechaHoraBoliviaProps) {
  const [formateado, setFormateado] = useState<string | null>(null)

  useEffect(() => {
    setFormateado(formatearEnLaPaz(fecha))
  }, [fecha])

  return <span className="whitespace-nowrap">{formateado ?? '—'}</span>
}