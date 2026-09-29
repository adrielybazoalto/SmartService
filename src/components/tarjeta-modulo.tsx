import Link from 'next/link'
import type { ModuloRegistrado } from '@/lib/permisos'
import { IconoModulo } from '@/components/icono-modulo'

/** Tarjeta de acceso directo a un módulo permitido (panel principal). */
export function TarjetaModulo({ modulo }: { modulo: ModuloRegistrado }) {
  return (
    <article className="tarjeta flex flex-col gap-4 p-5 transition-all hover:border-blue-800/60 hover:shadow-blue-900/20">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-800/40 bg-blue-950/50 text-blue-400">
          <IconoModulo clave={modulo.clave} className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold leading-tight text-slate-100">
          {modulo.etiqueta}
        </h2>
      </div>

      <p className="text-sm text-slate-400">{modulo.descripcion}</p>

      <Link
        href={modulo.ruta}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-500"
      >
        Ingresar
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </Link>
    </article>
  )
}