'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  loginAction,
  type LoginActionState,
} from '@/app/actions/auth'

const estadoInicial: LoginActionState = { ok: false }

/**
 * IU Login (CU01) — diseño visual PULSE (tema claro, verde menta) aplicado
 * sobre la Server Action `loginAction` existente (valida con bcrypt + crea la
 * sesión JWT propia). Los nombres de los campos siguen los que lee la acción:
 * `email` y `password`.
 */
export function LoginForm({ destino }: { destino: string }) {
  const [state, formAction, pendiente] = useActionState(loginAction, estadoInicial)
  const [mostrarPassword, setMostrarPassword] = useState(false)

  const inputClase =
    'w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50'

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#F4F5F7] p-4 text-slate-900">
      {/* Efectos de fondo */}
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-300/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-[350px] w-[350px] rounded-full bg-emerald-200/30 blur-[100px]" />

      {/* Tarjeta */}
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
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">
            SmartService
          </h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            Bienvenido de nuevo. Inicia sesión en tu cuenta
          </p>
        </div>

        {/* Formulario — ejecuta la Server Action de autenticación */}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={destino} />

          {/* Mensaje de error */}
          {state.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-700 sm:text-sm">
              {state.error}
            </div>
          )}

          {/* Correo */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-label="Correo electrónico"
              className={inputClase}
              placeholder="Correo electrónico"
            />
          </div>

          {/* Contraseña */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <input
              id="password"
              name="password"
              type={mostrarPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              aria-label="Contraseña"
              className={`${inputClase} pr-12`}
              placeholder="Contraseña"
            />

            {/* Mostrar / ocultar contraseña */}
            <button
              type="button"
              onClick={() => setMostrarPassword(!mostrarPassword)}
              aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-4 text-slate-400 transition-colors hover:text-slate-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mostrarPassword ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                )}
              </svg>
            </button>
          </div>

          {/* Opciones */}
          <div className="flex items-center justify-between px-1 pt-1 text-xs sm:text-sm">
            <label className="flex cursor-pointer items-center space-x-2 text-slate-500 transition-colors hover:text-slate-700">
              <input
                type="checkbox"
                name="recordarme"
                className="h-4 w-4 cursor-pointer rounded border-slate-300 bg-white accent-lime-500 focus:ring-0"
              />
              <span>Recordarme</span>
            </label>
            <Link
              href="/recuperar"
              className="font-medium text-lime-700 transition-colors hover:text-lime-800"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={pendiente}
            className="mt-3 w-full cursor-pointer rounded-2xl bg-lime-400 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_4px_20px_rgba(163,230,53,0.35)] transition-all hover:bg-lime-300 disabled:opacity-50"
          >
            {pendiente ? 'Validando...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Pie */}
        <div className="mt-8 border-t border-slate-100 pt-4 text-center">
          <p className="text-[11px] tracking-wide text-slate-500 sm:text-xs">
            Personal autorizado: Administrador, Encargado y Técnico.
          </p>
        </div>
      </div>
    </main>
  )
}