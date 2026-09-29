import { moduloPorRuta } from '@/lib/permisos'
import { IconoModulo } from '@/components/icono-modulo'

/**
 * Pantalla provisional para los módulos que aún no tienen implementación
 * (cotizaciones, órdenes de trabajo, caja, ventas). La ruta ya está protegida
 * por su layout RBAC; esta tarjeta evita 404 mientras se desarrollan.
 */
export default function ModuloEnConstruccion({ ruta }: { ruta: string }) {
  const modulo = moduloPorRuta(ruta)
  if (!modulo) return null

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-slate-950 px-4 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-800/40 bg-blue-950/50 text-blue-400">
        <IconoModulo clave={modulo.clave} className="h-8 w-8" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
        {modulo.etiqueta}
      </h1>
      <p className="max-w-md text-slate-400">{modulo.descripcion}</p>
      <p className="text-sm text-slate-500">
        Este módulo está en construcción y estará disponible próximamente.
      </p>
    </main>
  )
}