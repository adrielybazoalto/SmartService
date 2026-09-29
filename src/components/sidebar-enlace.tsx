'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconoModulo } from '@/components/icono-modulo'

/**
 * Ítem del menú del Sidebar (estilo Instagram): ícono a la izquierda +
 * etiqueta a la derecha. Detecta el módulo activo con `usePathname` y lo
 * resalta con fondo azul oscuro (bg-slate-800, texto blanco); el hover usa
 * gris/azul oscuro tenue.
 */
export function EnlaceSidebar({
  ruta,
  etiqueta,
  clave,
}: {
  ruta: string
  etiqueta: string
  clave: string
}) {
  const pathname = usePathname()
  const activo = pathname === ruta || pathname.startsWith(`${ruta}/`)

  return (
    <Link
      href={ruta}
      aria-current={activo ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        activo
          ? 'bg-slate-800 text-white'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
      }`}
    >
      <IconoModulo clave={clave} className="h-5 w-5 shrink-0" />
      <span className="truncate">{etiqueta}</span>
    </Link>
  )
}