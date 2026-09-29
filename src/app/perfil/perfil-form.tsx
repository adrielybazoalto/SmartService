'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import {
  actualizarPerfilAction,
  cambiarContrasenaAction,
  type CambiarContrasenaState,
  type PerfilActionState,
} from '@/app/actions/perfil'

const perfilInicial: PerfilActionState = { ok: false }
const contrasenaInicial: CambiarContrasenaState = { ok: false }

const inputClase =
  'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const inputSoloLectura =
  'w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-500'
const etiqueta = 'mb-1 block text-sm font-medium text-slate-300'
const mensajeExito =
  'rounded-xl border border-emerald-800/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300'
const mensajeError =
  'rounded-xl border border-rose-800/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-300'
const botonClase =
  'mt-2 cursor-pointer rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-500 disabled:opacity-50'

export function PerfilForm({
  nombre,
  telefono,
  correo,
  rol,
  estado,
}: {
  nombre: string
  telefono: string | null
  correo: string
  rol: string
  estado: boolean
}) {
  const [state, formAction, pendiente] = useActionState(
    actualizarPerfilAction,
    perfilInicial,
  )
  const [pwState, pwFormAction, pwPendiente] = useActionState(
    cambiarContrasenaAction,
    contrasenaInicial,
  )

  return (
    <div className="flex flex-col gap-6">
      {state.ok && (
        <p className={mensajeExito}>
          Perfil actualizado correctamente.
        </p>
      )}
      {state.error && <p className={mensajeError}>{state.error}</p>}

      {/* ===== Datos personales (CU05) ===== */}
      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
      >
        {/* Datos de solo lectura (CU05: correo, rol y estado no se editan) */}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 block text-sm font-semibold">
            Información de la cuenta
          </legend>

          <div>
            <label htmlFor="correo" className={etiqueta}>
              Correo (solo lectura)
            </label>
            <input
              id="correo"
              className={inputSoloLectura}
              value={correo}
              readOnly
              tabIndex={-1}
            />
          </div>

          <div>
            <label htmlFor="rol" className={etiqueta}>
              Rol (solo lectura)
            </label>
            <input id="rol" className={inputSoloLectura} value={rol} readOnly tabIndex={-1} />
          </div>

          <div>
            <label htmlFor="estado" className={etiqueta}>
              Estado (solo lectura)
            </label>
            <input
              id="estado"
              className={inputSoloLectura}
              value={estado ? 'Activo' : 'Inactivo'}
              readOnly
              tabIndex={-1}
            />
          </div>
        </fieldset>

        <hr className="border-slate-800" />

        {/* Campos editables (CU05) */}
        <div>
          <label htmlFor="nombre" className={etiqueta}>
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            minLength={2}
            maxLength={150}
            defaultValue={nombre}
            className={inputClase}
          />
        </div>

        <div>
          <label htmlFor="telefono" className={etiqueta}>
            Teléfono
          </label>
          <input
            id="telefono"
            name="telefono"
            type="tel"
            maxLength={20}
            defaultValue={telefono ?? ''}
            className={inputClase}
          />
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className={botonClase}
        >
          {pendiente ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {/* ===== Cambiar contraseña (CU05) ===== */}
      <form
        action={pwFormAction}
        className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
      >
        <h2 className="text-sm font-semibold">Cambiar contraseña</h2>

        {pwState.ok && (
          <p className={mensajeExito}>Contraseña cambiada correctamente.</p>
        )}
        {pwState.error && <p className={mensajeError}>{pwState.error}</p>}

        <div>
          <label htmlFor="contrasena_actual" className={etiqueta}>
            Contraseña actual
          </label>
          <input
            id="contrasena_actual"
            name="contrasena_actual"
            type="password"
            required
            autoComplete="current-password"
            className={inputClase}
          />
        </div>

        <div>
          <label htmlFor="contrasena_nueva" className={etiqueta}>
            Nueva contraseña
          </label>
          <input
            id="contrasena_nueva"
            name="contrasena_nueva"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            className={inputClase}
          />
          <p className="mt-1 text-xs text-slate-400">
            Debe contener al menos 8 caracteres, mayúscula, minúscula, número y un
            carácter especial.
          </p>
        </div>

        <div>
          <label htmlFor="confirmacion" className={etiqueta}>
            Confirmar nueva contraseña
          </label>
          <input
            id="confirmacion"
            name="confirmacion"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            className={inputClase}
          />
        </div>

        <button
          type="submit"
          disabled={pwPendiente}
          className={botonClase}
        >
          {pwPendiente ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </form>

      <Link
        href="/"
        className="text-center text-sm text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
      >
        ← Volver al inicio
      </Link>
    </div>
  )
}