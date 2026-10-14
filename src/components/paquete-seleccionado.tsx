'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/** Valor de selección que representa «todos los paquetes». */
export const TODOS = 'TODOS'

interface PaqueteSeleccionadoCtx {
  /** Id del paquete seleccionado ('P1'…'P4') o `TODOS`. */
  seleccionado: string
  /** Cambia el paquete seleccionado (lo comparten Sidebar y Dashboard). */
  seleccionar: (id: string) => void
}

const Ctx = createContext<PaqueteSeleccionadoCtx | null>(null)

/**
 * Estado compartido del paquete funcional seleccionado.
 *
 * Se monta en `SidebarLayout` (Server Component) envolviendo al Sidebar y al
 * contenido principal, de modo que el Client Component del menú lateral y el
 * panel de tarjetas del Dashboard lean y escriban la misma selección: al
 * pulsar una cabecera en el menú o una pestaña en el Dashboard, las tarjetas
 * mostradas se actualizan de inmediato.
 */
export function PaqueteSeleccionadoProvider({ children }: { children: ReactNode }) {
  const [seleccionado, setSeleccionado] = useState<string>(TODOS)

  return (
    <Ctx.Provider value={{ seleccionado, seleccionar: setSeleccionado }}>
      {children}
    </Ctx.Provider>
  )
}

/** Acceso al paquete seleccionado; falla si no hay provider (error de montaje). */
export function usePaqueteSeleccionado(): PaqueteSeleccionadoCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error(
      'usePaqueteSeleccionado debe usarse dentro de <PaqueteSeleccionadoProvider>.',
    )
  }
  return ctx
}
