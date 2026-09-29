'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconoModulo } from '@/components/icono-modulo'

/**
 * Ítem del menú del Sidebar (estilo Instagram): ícono a la izquierda +
 * etiqueta a la derecha. Detecta el módulo activo con `usePathname` para
 * resaltarlo (píldora blanca) y usa hover gris oscuro.
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
          ? 'bg-white text-black'
          : 'text-zinc-400 hover:bg-neutral-900 hover:text-white'
      }`}
    >
      <IconoModulo clave={clave} className="h-5 w-5 shrink-0" />
      <span className="truncate">{etiqueta}</span>
    </Link>
  )
}