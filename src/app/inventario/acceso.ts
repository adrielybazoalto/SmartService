import { exigirAccesoInventario, type AccionInventario } from '@/backend/inventario'

/**
 * Qué operaciones de CU16 puede ver el usuario en la interfaz. SOLO decide qué
 * botones se muestran: cada Server Action vuelve a verificar sesión y permisos
 * en el servidor (exigirAccesoInventario), y la BD vuelve a verificar los
 * movimientos de kárdex. Módulo de servidor: lo importan solo Server Components.
 */
export interface CapacidadesInventario {
  crear: boolean
  actualizar: boolean
  eliminar: boolean
  procesar: boolean
}

async function puede(accion: AccionInventario): Promise<boolean> {
  try {
    await exigirAccesoInventario(accion)
    return true
  } catch {
    return false
  }
}

export async function obtenerCapacidadesInventario(): Promise<CapacidadesInventario> {
  const [crear, actualizar, eliminar, procesar] = await Promise.all([
    puede('CREAR'),
    puede('ACTUALIZAR'),
    puede('ELIMINAR'),
    puede('PROCESAR'),
  ])
  return { crear, actualizar, eliminar, procesar }
}
