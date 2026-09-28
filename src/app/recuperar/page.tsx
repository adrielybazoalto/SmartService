import type { Metadata } from 'next'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { ControlRecuperarContrasena } from '@/backend/recuperar'
import { RecuperarForm } from './recuperar-form'

export const metadata: Metadata = {
  title: 'Recuperar contraseña — SmartService',
}

/**
 * CU02 — IURecuperarContrasena.
 * Sin token: muestra el Formulario 1 (correo). Con token: valida el enlace
 * (verificarEnlace) y muestra el Formulario 2 (nueva contraseña); si el enlace
 * expiró o ya se usó, muestra la excepción y vuelve al Formulario 1.
 */
export default async function PaginaRecuperar({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const db = getSupabaseServiceClient()

  if (token) {
    try {
      await ControlRecuperarContrasena.verificarEnlace(db, token)
      return <RecuperarForm modo="nueva-contrasena" token={token} />
    } catch (e) {
      const error =
        e instanceof Error ? e.message : 'Enlace expirado, reinicie el proceso'
      return <RecuperarForm modo="email" errorInicial={error} />
    }
  }

  return <RecuperarForm modo="email" />
}