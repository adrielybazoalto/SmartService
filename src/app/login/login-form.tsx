'use client'

import { useActionState } from 'react'
import {
  loginAction,
  type LoginActionState,
} from '@/app/actions/auth'

const estadoInicial: LoginActionState = { ok: false }

const inputClase =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900'
const etiqueta = 'mb-1 block text-sm font-medium'

export function LoginForm({ destino }: { destino: string }) {
  const [state, formAction, pendiente] = useActionState(loginAction, estadoInicial)

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold tracking-tight">SmartService</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Inicia sesión en tu cuenta
      </p>

      {state.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={destino} />

        <div>
          <label htmlFor="email" className={etiqueta}>
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="correo@sgarnet.bo"
            className={inputClase}
          />
        </div>

        <div>
          <label htmlFor="password" className={etiqueta}>
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={inputClase}
          />
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="mt-2 w-full rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          {pendiente ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}