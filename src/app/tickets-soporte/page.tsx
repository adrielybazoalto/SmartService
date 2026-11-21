import { listarSistemasTicketAccion, listarTicketsAccion } from '@/app/actions/tickets'
import { tieneAccionModulo } from '@/lib/permisos'
import { IU_GestionarTickets } from './iu-gestionar-tickets'

export const metadata = {
  title: 'Tickets de Soporte — SmartService',
}

export default async function TicketsSoportePage({
  searchParams,
}: {
  // Filtros que puede enviar el asistente de navegación por voz (CU18).
  searchParams: Promise<{ estado?: string; urgencia?: string; accion?: string }>
}) {
  const filtrosVoz = await searchParams
  const [crear, actualizar, crearOrden] = await Promise.all([
    tieneAccionModulo('MANTENIMIENTO_TICKETS', 'CREAR'),
    tieneAccionModulo('MANTENIMIENTO_TICKETS', 'ACTUALIZAR'),
    tieneAccionModulo('ORDENES_TRABAJO', 'CREAR'),
  ])

  const [tickets, sistemas] = await Promise.all([
    listarTicketsAccion(),
    crear ? listarSistemasTicketAccion() : Promise.resolve(null),
  ])

  const errorCarga = !tickets.ok ? tickets.error : sistemas && !sistemas.ok ? sistemas.error : null

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* La cabecera está en IU_GestionarTickets; la voz la aporta el asistente global */}
      <IU_GestionarTickets
        key={`${filtrosVoz.estado ?? ''}|${filtrosVoz.urgencia ?? ''}|${filtrosVoz.accion ?? ''}`}
        tickets={tickets.ok ? tickets.data : []}
        sistemas={sistemas && sistemas.ok ? sistemas.data : []}
        errorCarga={errorCarga}
        permisos={{ crear, actualizar, derivar: crear && crearOrden }}
        filtrosVoz={filtrosVoz}
      />
    </main>
  )
}
