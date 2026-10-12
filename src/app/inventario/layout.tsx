import { redirect } from 'next/navigation'
import { ErrorInventario, exigirAccesoInventario } from '@/backend/inventario'

/**
 * Protección de /inventario (CU16): sesión válida + permiso de ruta INVENTARIO
 * + acción LEER sobre 'Catálogo e Inventario'.
 *
 * No usa requerirAccesoModulo('/inventario'): '/inventario' aún no está en
 * MODULOS (lib/permisos.ts) y esa función deja pasar las rutas no registradas.
 * Las Server Actions vuelven a verificar cada operación.
 */
export default async function LayoutInventario({ children }: { children: React.ReactNode }) {
  let destino: string | null = null
  try {
    await exigirAccesoInventario('LEER')
  } catch (e) {
    destino = e instanceof ErrorInventario && e.codigo === 'SIN_SESION' ? '/login' : '/?aviso=sin_permiso'
  }
  // redirect() fuera del try: lanza una excepción de control que no debe capturarse
  if (destino) redirect(destino)
  return children
}
