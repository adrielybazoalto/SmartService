import Link from 'next/link'
import type { ModuloRegistrado } from '@/lib/permisos'
import { IconoModulo } from '@/components/icono-modulo'

/** Tarjeta de acceso directo a un módulo permitido (panel principal). */
export function TarjetaModulo({ modulo }: { modulo: ModuloRegistrado }) {
  return (
    <article className="tarjeta flex flex-col gap-4 p-5 transition-all hover:border-lime-300/70 hover:shadow-md hover:shadow-slate-200/60">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-lime-200 bg-lime-100 text-lime-700">
          <IconoModulo clave={modulo.clave} className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold leading-tight text-slate-900">
          {modulo.etiqueta}
        </h2>
      </div>

      <p className="text-sm text-slate-500">{modulo.descripcion}</p>

      <Link
        href={modulo.ruta}
        className="btn-primario mt-auto"
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