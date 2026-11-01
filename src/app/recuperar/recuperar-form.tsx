'use client'

import { useActionState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  restablecerContrasenaAction,
  solicitarRecuperacionAction,
  type RestablecerContrasenaState,
  type SolicitarRecuperacionState,
} from '@/app/actions/recuperar'
import { PageHeaderBadge } from '@/components/page-header-badge'

const estadoSolicitud: SolicitarRecuperacionState = { ok: false }
const estadoRestablecer: RestablecerContrasenaState = { ok: false }

const inputClase =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50'

function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#F4F5F7] p-4 text-slate-900">
      {/* Efectos de fondo */}
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-300/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-[350px] w-[350px] rounded-full bg-emerald-200/30 blur-[100px]" />

      <div className="relative z-10 w-full max-w-[460px] rounded-[32px] border border-slate-200/60 bg-white p-8 shadow-xl shadow-slate-200/60 backdrop-blur-xl sm:p-10">
        {/* Logo y título */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex items-center rounded-full border border-lime-200 bg-lime-50 px-4 py-1.5 shadow-sm">
            <svg
              className="h-4 w-4 text-lime-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              />
            </svg>
            <span className="ml-2 text-[11px] font-bold uppercase tracking-widest text-lime-800">
              SGARNET
            </span>
          </div>
          <PageHeaderBadge paquete="P1" cu="CU02" />
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">
            Recuperar contraseña
          </h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            Restablece el acceso a tu cuenta de SmartService
          </p>
        </div>

        {children}

        {/* Pie */}
        <div className="mt-8 border-t border-slate-100 pt-4 text-center">
          <Link
            href="/login"
            className="text-xs font-medium text-lime-700 transition-colors hover:text-lime-800 sm:text-sm"
          >
            ← Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  )
}

/** Formulario 1 (mostrarFormularioEmail): correo registrado + enviar enlace. */
function FormularioEmail({ errorInicial }: { errorInicial?: string }) {
  const [state, formAction, pendiente] = useActionState(
    solicitarRecuperacionAction,
    estadoSolicitud,
  )

  // Resultado exitoso (mostrarResultado)
  if (state.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Revisa tu correo: enviamos un enlace para restablecer tu contraseña a{' '}
          <span className="font-medium text-emerald-900">{state.correo}</span>.
        </div>
        <p className="text-center text-xs text-slate-500">
          El enlace caduca en 15 minutos y solo puede usarse una vez. Si no lo encuentras en tu bandeja de entrada, revisa tu carpeta de correo no deseado o spam.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Excepciones: correo no encontrado / enlace expirado */}
      {(errorInicial || state.error) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-700 sm:text-sm">
          {errorInicial ?? state.error}
        </div>
      )}

      <div>
        <input
          id="correo"
          name="correo"
          type="email"
          required
          autoComplete="email"
          aria-label="Correo electrónico registrado"
          className={inputClase}
          placeholder="Correo electrónico registrado"
        />
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-2 w-full cursor-pointer rounded-2xl bg-lime-400 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_4px_20px_rgba(163,230,53,0.35)] transition-all hover:bg-lime-300 disabled:opacity-50"
      >
        {pendiente ? 'Enviando…' : 'Enviar enlace de recuperación'}
      </button>
    </form>
  )
}

/** Formulario 2 (mostrarFormularioNuevaContrasena): nueva clave + confirmar. */
function FormularioNuevaContrasena({ token }: { token: string }) {
  const [state, formAction, pendiente] = useActionState(
    restablecerContrasenaAction,
    estadoRestablecer,
  )

  // Resultado exitoso (mostrarResultado)
  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Contraseña restablecida correctamente. Ya puedes iniciar sesión con
          tu nueva clave.
        </div>
        <Link
          href="/login"
          className="block w-full cursor-pointer rounded-2xl bg-lime-400 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_4px_20px_rgba(163,230,53,0.35)] transition-all hover:bg-lime-300"
        >
          Iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-700 sm:text-sm">
          {state.error}
        </div>
      )}

      <div>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          required
          autoComplete="new-password"
          aria-label="Nueva contraseña"
          className={inputClase}
          placeholder="Nueva contraseña"
        />
        <p className="mt-2 px-1 text-xs text-slate-500">
          Mínimo 8 caracteres, al menos una mayúscula, una minúscula, un número y un
          carácter especial.
        </p>
      </div>

      <div>
        <input
          id="confirmacion"
          name="confirmacion"
          type="password"
          required
          autoComplete="new-password"
          aria-label="Confirmar nueva contraseña"
          className={inputClase}
          placeholder="Confirmar nueva contraseña"
        />
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-2 w-full cursor-pointer rounded-2xl bg-lime-400 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_4px_20px_rgba(163,230,53,0.35)] transition-all hover:bg-lime-300 disabled:opacity-50"
      >
        {pendiente ? 'Guardando…' : 'Restablecer contraseña'}
      </button>
    </form>
  )
}

export function RecuperarForm({
  modo,
  token,
  errorInicial,
}: {
  modo: 'email' | 'nueva-contrasena'
  token?: string
  errorInicial?: string
}) {
  return (
    <Tarjeta>
      {modo === 'nueva-contrasena' && token ? (
        <FormularioNuevaContrasena token={token} />
      ) : (
        <FormularioEmail errorInicial={errorInicial} />
      )}
    </Tarjeta>
  )
}
