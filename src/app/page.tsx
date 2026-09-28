'use client'

import { useActionState, useState } from 'react'
import { validarCredenciales } from '@/app/actions/auth'
import Link from 'next/link'

/**
 * MÉTODOS DEL DIAGRAMA (Clase: IU Login):
 * 1. iniciarSesion(datos) -> Se ejecuta a través de useActionState(handleLoginAction)
 * 2. introducirDatos(correo, password) -> Se ejecuta al capturar formData.get()
 * 3. enviarFormulario() -> Se ejecuta al disparar el evento action={formAction} del <form>
 * 7. redirigirPanel() -> Se ejecuta mediante window.location.href = '/dashboard'
 */
async function handleLoginAction(
  prevState: any,
  formData: FormData
) {
  // Método: introducirDatos(correo, password)
  const correo = formData.get('correo') as string
  const password = formData.get('password') as string

  // Método: enviarFormulario() (Comunicación con el Backend)
  const resultado = await validarCredenciales(
    correo,
    password
  )

  if (!resultado.success) {
    return {
      success: false,
      error: resultado.error
    }
  }

  // Método: redirigirPanel()
  window.location.href = '/dashboard'

  return {
    success: true,
    error: null
  }
}

// PÁGINA DE LOGIN (Interfaz Gráfica)
export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    handleLoginAction,
    null
  )
  const [mostrarPassword, setMostrarPassword] = useState(false)
  
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#030712] text-white p-4 relative overflow-hidden">
      {/* Efectos de fondo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-indigo-900/10 blur-[100px] rounded-full pointer-events-none"></div>
      
      {/* Tarjeta */}
      <div className="w-full max-w-[460px] bg-[#090d16]/90 backdrop-blur-xl border border-[#17223b] rounded-[32px] p-8 sm:p-10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] relative z-10">
        
        {/* Logo y título */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center space-x-2 bg-[#0e1628] border border-[#1b2b4d] px-4 py-1.5 rounded-full mb-4 shadow-inner">
            <svg
              className="w-4 h-4 text-blue-400"
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
            <span className="text-[11px] font-bold tracking-widest text-blue-300 uppercase">
              SGARNET
            </span>
          </div>
          <h1 className="text-2xl sm:text-[30px] font-bold tracking-tight text-white mb-1">
            SmartService
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            Bienvenido de nuevo. Inicia sesión en tu cuenta
          </p>
        </div>

        {/* Formulario que ejecuta enviarFormulario() / iniciarSesion() */}
        <form
          action={formAction}
          className="space-y-4"
        >
          {/* Mensaje de error */}
          {state?.error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-400 p-3 rounded-xl text-xs sm:text-sm text-center">
              {state.error}
            </div>
          )}

          {/* Correo (Atributo de la UI) */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
              <svg
                className="w-5 h-5"
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
              type="email"
              name="correo"
              required
              autoComplete="email"
              className="w-full bg-[#0e1422] border border-[#1b253f] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-white placeholder-gray-500 outline-none transition-all shadow-inner"
              placeholder="Correo electrónico"
            />
          </div>

          {/* Contraseña (Atributo de la UI) */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
              <svg
                className="w-5 h-5"
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
              type={mostrarPassword ? 'text' : 'password'}
              name="password"
              required
              autoComplete="current-password"
              className="w-full bg-[#0e1422] border border-[#1b253f] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-2xl py-3.5 pl-12 pr-12 text-sm text-white placeholder-gray-500 outline-none transition-all shadow-inner"
              placeholder="Contraseña"
            />
            
            {/* Mostrar / ocultar contraseña */}
            <button
              type="button"
              onClick={() => setMostrarPassword(!mostrarPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            >
              <svg
                className="w-5 h-5"
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
          <div className="flex items-center justify-between text-xs sm:text-sm pt-1 px-1">
            <label className="flex items-center space-x-2 cursor-pointer text-gray-400 hover:text-gray-300">
              <input
                type="checkbox"
                name="recordarme"
                className="w-4 h-4 rounded bg-[#0e1422] border-[#1b253f] text-blue-600 focus:ring-0 cursor-pointer"
              />
              <span>Recordarme</span>
            </label>
            <Link
              href="/recuperar"
              className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white transition-all py-3.5 rounded-2xl font-medium text-sm mt-3 disabled:opacity-50 shadow-[0_0_25px_rgba(37,99,235,0.4)] cursor-pointer"
          >
            {isPending ? 'Validando...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Pie */}
        <div className="mt-8 text-center pt-4 border-t border-[#17223b]/60">
          <p className="text-[11px] sm:text-xs text-gray-500 tracking-wide">
            Personal autorizado: Administrador, Encargado y Técnico.
          </p>
        </div>

      </div>
    </main>
  )
}