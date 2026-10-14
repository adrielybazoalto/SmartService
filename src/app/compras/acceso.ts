import { exigirAccesoCompras } from '@/backend/compras'
import { exigirAccesoInventario } from '@/backend/inventario'

/**
 * Qué puede ver el usuario en la interfaz de CU15. SOLO decide qué botones y
 * enlaces se muestran: cada Server Action vuelve a verificar sesión y permisos
 * en el servidor (exigirAccesoCompras) y fn_registrar_compra vuelve a
 * verificar 'Compras'/'CREAR' en la BD. Módulo de servidor: lo importan solo
 * Server Components.
 */
export interface CapacidadesCompras {
  /** Registrar compras (CREAR sobre 'Compras'). */
  registrar: boolean
  /** Enlace al kárdex del producto (LEER sobre 'Catálogo e Inventario', CU16). */
  verKardex: boolean
}

async function puede(verificar: () => Promise<unknown>): Promise<boolean> {
  try {
    await verificar()
    return true
  } catch {
    return false
  }
}

export async function obtenerCapacidadesCompras(): Promise<CapacidadesCompras> {
  const [registrar, verKardex] = await Promise.all([
    puede(() => exigirAccesoCompras('CREAR')),
    puede(() => exigirAccesoInventario('LEER')),
  ])
  return { registrar, verKardex }
}
