'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconoModulo } from '@/components/icono-modulo'

/**
 * Ítem del menú del Sidebar (estilo Instagram): ícono a la izquierda +
 * etiqueta a la derecha. Detecta el módulo activo con `usePathname` y lo
 * resalta con la píldora verde menta redondeada (texto oscuro legible);
 * el hover usa gris claro.
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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        activo
          ? 'bg-[#BDEB9D] font-semibold text-slate-900'
          : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <IconoModulo clave={clave} className="h-5 w-5 shrink-0" />
      <span className="truncate">{etiqueta}</span>
    </Link>
  )
}