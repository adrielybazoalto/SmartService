import type { Metadata } from 'next'
import { getPerfil } from '@/backend/usuarios'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { PerfilForm } from './perfil-form'

export const metadata: Metadata = {
  title: 'Mi Perfil — SmartService',
}

export default async function PaginaPerfil() {
  const db = getSupabaseServiceClient()
  const perfil = await getPerfil(db)

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Configuración de perfil</h1>
        <p className="mt-1 text-sm text-slate-400">
          CU05 — Edita tus datos personales y cambia tu contraseña.
        </p>
      </header>

      <PerfilForm
        nombre={perfil.nombre}
        telefono={perfil.telefono}
        correo={perfil.correo}
        rol={perfil.rol?.nombre ?? '—'}
        estado={perfil.estado}
      />
    </main>
  )
}