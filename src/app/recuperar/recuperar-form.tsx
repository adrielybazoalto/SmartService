'use client'

import { useActionState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  restablecerContrasenaAction,
  solicitarRecuperacionAction,
  type RestablecerContrasenaState,
  type SolicitarRecuperacionState,
} from '@/app/actions/recuperar'

const estadoSolicitud: SolicitarRecuperacionState = { ok: false }
const estadoRestablecer: RestablecerContrasenaState = { ok: false }

const inputClase =
  'w-full rounded-2xl border border-[#1b253f] bg-[#0e1422] py-3.5 px-4 text-sm text-white shadow-inner outline-none transition-all placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#030712] p-4 text-white">
      {/* Efectos de fondo */}
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-[350px] w-[350px] rounded-full bg-indigo-900/10 blur-[100px]" />

      <div className="relative z-10 w-full max-w-[460px] rounded-[32px] border border-[#17223b] bg-[#090d16]/90 p-8 shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-10">
        {/* Logo y título */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex items-center rounded-full border border-[#1b2b4d] bg-[#0e1628] px-4 py-1.5 shadow-inner">
            <svg
              className="h-4 w-4 text-blue-400"
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
            <span className="ml-2 text-[11px] font-bold uppercase tracking-widest text-blue-300">
              SGARNET
            </span>
          </div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-white sm:text-[30px]">
            Recuperar contraseña
          </h1>
          <p className="text-xs text-gray-400 sm:text-sm">
            Restablece el acceso a tu cuenta de SmartService
          </p>
        </div>

        {children}

        {/* Pie */}
        <div className="mt-8 border-t border-[#17223b]/60 pt-4 text-center">
          <Link
            href="/login"
            className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300 sm:text-sm"
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
  if (state.ok && state.enlace) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Revisa tu correo: enviamos un enlace para restablecer tu contraseña a{' '}
          <span className="font-medium text-emerald-200">{state.correo}</span>.
        </div>

        {/* Simulador: no hay SMTP configurado, el enlace se muestra aquí */}
        <div className="rounded-xl border border-[#1b253f] bg-[#0e1422] p-4 text-xs text-gray-400">
          <p className="font-semibold text-gray-300">
            Simulador de correo (sin SMTP)
          </p>
          <a
            href={state.enlace}
            className="mt-1 block break-all text-blue-400 transition-colors hover:text-blue-300"
          >
            {state.enlace}
          </a>
          <p className="mt-2">
            El enlace caduca en 15 minutos y solo puede usarse una vez.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Excepciones: correo no encontrado / enlace expirado */}
      {(errorInicial || state.error) && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-center text-xs text-red-400 sm:text-sm">
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
        className="mt-2 w-full cursor-pointer rounded-2xl bg-blue-600 py-3.5 text-sm font-medium text-white shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 disabled:opacity-50"
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
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Contraseña restablecida correctamente. Ya puedes iniciar sesión con
          tu nueva clave.
        </div>
        <Link
          href="/login"
          className="block w-full cursor-pointer rounded-2xl bg-blue-600 py-3.5 text-sm font-medium text-white shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500"
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
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-center text-xs text-red-400 sm:text-sm">
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
        <p className="mt-2 px-1 text-xs text-gray-500">
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
        className="mt-2 w-full cursor-pointer rounded-2xl bg-blue-600 py-3.5 text-sm font-medium text-white shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 disabled:opacity-50"
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