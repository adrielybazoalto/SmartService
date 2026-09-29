/**
 * Badge del rol del usuario — sistema de diseño (tema claro "PULSE"):
 *  ADMINISTRADOR → azul pastel
 *  ENCARGADO     → celeste pastel
 *  TECNICO       → verde/menta pastel
 */
const CLASES_ROLES: Record<string, string> = {
  ADMINISTRADOR: 'border-blue-200 bg-blue-100 text-blue-800',
  ENCARGADO: 'border-sky-200 bg-sky-100 text-sky-800',
  TECNICO: 'border-emerald-200 bg-emerald-100 text-emerald-800',
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
    'border-slate-200 bg-slate-100 text-slate-700'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${clases} ${className}`}
    >
      {rol ?? 'Sin rol'}
    </span>
  )
}