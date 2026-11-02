import { obtenerOrdenesTrabajoAccion, obtenerOrdenesTecnicoAccion } from '@/app/actions/ordenes-trabajo'
import { getCurrentUser } from '@/lib/auth'
import { tieneAccionModulo } from '@/lib/permisos'
import { IU_GestionarOrdenesTrabajo } from './iu-gestionar-ordenes-trabajo'

export const metadata = {
  title: 'Órdenes de Trabajo — SmartService',
}

export default async function OrdenesTrabajoPage() {
  const user = await getCurrentUser()
  const esTecnico = user?.rol?.nombre?.toUpperCase().includes('TECNICO') || false

  let resultado
  if (esTecnico) {
    resultado = await obtenerOrdenesTecnicoAccion()
  } else {
    resultado = await obtenerOrdenesTrabajoAccion()
  }

  const ordenes = resultado.ok ? resultado.data : []
  const [gestionar, liquidar, crearOrden] = await Promise.all([
    tieneAccionModulo('ASIGNAR_TECNICOS', 'ACTUALIZAR'),
    tieneAccionModulo('NOTAS_SERVICIO', 'LEER'),
    tieneAccionModulo('ORDENES_TRABAJO', 'CREAR'),
  ])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="tarjeta flex flex-col gap-1.5 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            CU12
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Órdenes de Trabajo y Reporte de Campo</h1>
        <p className="text-sm text-slate-500">
          Gestión de órdenes, marcas de tiempo, diagnóstico de campo y consumo de materiales.
        </p>
      </header>

      <IU_GestionarOrdenesTrabajo
        ordenes={ordenes}
        esTecnico={esTecnico}
        usuarioId={user?.id || 0}
        permisos={{ gestionar, liquidar, crearOrden }}
      />
    </main>
  )
}
