import { redirect } from 'next/navigation'
import { ErrorCompras, exigirAccesoCompras } from '@/backend/compras'

/**
 * Protección de /compras (CU15): sesión válida + permiso de ruta COMPRAS +
 * acción LEER sobre 'Compras'. Técnico → sin acceso.
 *
 * Usa el chequeo específico del dominio (exigirAccesoCompras), más estricto
 * que requerirAccesoModulo('/compras'): además del permiso de ruta valida la
 * acción de ROL_FUNCION. Las Server Actions vuelven a verificar cada operación.
 */
export default async function LayoutCompras({ children }: { children: React.ReactNode }) {
  let destino: string | null = null
  try {
    await exigirAccesoCompras('LEER')
  } catch (e) {
    destino = e instanceof ErrorCompras && e.codigo === 'SIN_SESION' ? '/login' : '/?aviso=sin_permiso'
  }
  // redirect() fuera del try: lanza una excepción de control que no debe capturarse
  if (destino) redirect(destino)
  return children
}
