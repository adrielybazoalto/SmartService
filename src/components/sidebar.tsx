import type { ReactNode } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { SidebarShell } from '@/components/sidebar-shell'

/**
 * LAYOUT GLOBAL (Sidebar izquierda + contenido) — tema claro "PULSE".
 *
 * Este Server Component resuelve la sesión y los permisos del rol y delega el
 * comportamiento responsive en `SidebarShell` (Client Component):
 *
 *   - Móvil/tablet (< md, 768 px): el Sidebar es un panel deslizante
 *     (off-canvas) que se abre con el botón hamburguesa.
 *   - md+ (≥ 768 px): el Sidebar queda fijo a la izquierda.
 *
 * La navegación por paquetes (ver lib/navigation.ts) se delega en
 * `NavegacionPaquetes`, un Client Component en formato acordeón:
 *
 *   P1 / P2 → paquetes habilitados; muestran SOLO los ítems cuyo permiso
 *             tiene LEER en ROL_FUNCION (BD).
 *   P3 / P4 → paquetes deshabilitados en este ciclo: al desplegarlos indican
 *             «Bloqueado · sin permisos», sin enlaces.
 *
 * Sin sesión activa se devuelve la página tal cual (login, recuperar).
 */
export async function SidebarLayout({ children }: { children: ReactNode }) {
  const usuario = await getCurrentUser()
  if (!usuario) return <>{children}</>

  const permisos = await getPermisosDeRol(usuario.rol_id)

  return (
    <SidebarShell
      nombre={usuario.nombre}
      rolNombre={usuario.rol?.nombre}
      permisos={permisos}
    >
      {children}
    </SidebarShell>
  )
}
