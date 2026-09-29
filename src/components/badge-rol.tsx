/**
 * Badge del rol del usuario — sistema de diseño (tema azul/oscuro):
 *  ADMINISTRADOR → azul neón
 *  ENCARGADO     → celeste
 *  TECNICO       → verde/turquesa
 */
const CLASES_ROLES: Record<string, string> = {
  ADMINISTRADOR: 'border-blue-800/50 bg-blue-950/60 text-blue-400',
  ENCARGADO: 'border-sky-800/50 bg-sky-950/60 text-sky-400',
  TECNICO: 'border-emerald-800/50 bg-emerald-950/60 text-emerald-400',
}

export function BadgeRol({
  rol,
  className = '',
}: {
  rol?: string | null
  className?: string
}) {
  const clases =
    CLASES_ROLES[(rol ?? '').trim().toUpperCase()] ??
    'border-slate-700 bg-slate-800/60 text-slate-300'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${clases} ${className}`}
    >
      {rol ?? 'Sin rol'}
    </span>
  )
}