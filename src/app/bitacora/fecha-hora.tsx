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
  /** Timestamp desde la BD: "2026-09-28T23:43:31.570184" (TIMESTAMP sin zona, UTC). */
  fecha: string
}

/**
 * BITACORA.fecha_hora es TIMESTAMP (sin zona) y guarda un instante UTC
 * (CURRENT_TIMESTAMP); PostgREST lo devuelve ingénuo ("...T23:43:31" sin Z).
 * Pasarlo directo a `new Date` hace que el navegador lo interprete como hora
 * LOCAL (reloj 4 h adelantado en La Paz, o desfasado en otra zona). Aquí se
 * ancla a UTC explícitamente —respetando el offset si la columna llegara a ser
 * timestamptz— para luego formatearlo en America/La_Paz (UTC-4).
 */
function aInstanteUTC(fecha: string): Date {
  const base = fecha.trim().replace(' ', 'T')
  const tieneZona = /(Z|[+-]\d{2}:\d{2})$/.test(base)
  return new Date(tieneZona ? base : `${base}Z`)
}

function formatearEnLaPaz(fecha: string): string {
  const instante = aInstanteUTC(fecha)
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