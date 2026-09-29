import { PAQUETES } from '@/lib/navigation'

/**
 * Etiqueta de paquete y caso de uso para las cabeceras de pantalla.
 *
 * Renderiza, sobre el título de cada página, una insignia del estilo:
 *   P1: SEGURIDAD Y ACCESOS • CU03: ADMINISTRAR USUARIOS
 * El nombre del paquete se resuelve desde `lib/navigation.ts` (única fuente
 * de verdad), por lo que solo se pasa el id del paquete.
 */
export function PageHeaderBadge({
  paquete,
  cu,
  titulo,
}: {
  /** Id del paquete en lib/navigation.ts (p. ej. 'P1'). */
  paquete: string
  /** Caso de uso, p. ej. 'CU03'. */
  cu?: string
  /** Título del caso de uso en mayúsculas, p. ej. 'ADMINISTRAR USUARIOS'. */
  titulo?: string
}) {
  const nombrePaquete =
    PAQUETES.find((p) => p.id === paquete)?.nombre ?? 'PAQUETE'

  const partes = [`${paquete}: ${nombrePaquete}`, cu, titulo].filter(
    (parte): parte is string => Boolean(parte),
  )

  return (
    <span className="inline-flex w-fit flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-lime-200 bg-lime-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-lime-700">
      {partes.map((parte, indice) => (
        <span key={parte} className="inline-flex items-center gap-x-1.5">
          {indice > 0 && (
            <span aria-hidden="true" className="text-lime-500">
              •
            </span>
          )}
          {parte}
        </span>
      ))}
    </span>
  )
}