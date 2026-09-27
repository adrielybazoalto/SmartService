'use client'

import { useActionState, useState } from 'react'
import { loginAction } from './actions/auth'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#090d16] font-sans text-slate-100 antialiased px-4 py-8">
      
      {/* EFECTO DE FONDO: Gradient Glow Radial Azul Profundo (Equilibrado) */}
      <div 
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(circle at 50% 35%, rgba(14, 116, 144, 0.18) 0%, rgba(30, 58, 138, 0.14) 35%, rgba(9, 13, 22, 0.95) 70%),
            radial-gradient(circle at 80% 10%, rgba(29, 78, 216, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 20% 90%, rgba(15, 23, 42, 0.8) 0%, transparent 50%)
          `
        }}
      />

      {/* Sombra suave de textura en cuadrícula */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:3rem_3rem]"></div>

      {/* TARJETA DE LOGIN CON ESTRUCTURA EXACTA DE LA IMAGEN */}
      <div className="relative z-10 w-full max-w-sm space-y-6 rounded-3xl bg-[#0f172a]/80 p-8 shadow-2xl backdrop-blur-xl border border-blue-900/40">
        
        {/* LOGO Y ENCABEZADO */}
        <div className="flex flex-col items-center text-center">
          {/* Logo Empresa Sgarnet */}
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-950 via-blue-900 to-cyan-700 text-cyan-300 border border-cyan-500/30 shadow-md">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-widest text-slate-300">SGARNET</span>
          </div>

          {/* Nombre del Sistema */}
          <h1 className="text-2xl font-black text-white tracking-tight sm:text-3xl">
            SmartService
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Bienvenido de nuevo. Inicia sesión en tu cuenta
          </p>
        </div>

        {/* ALERTA DE ERROR DE CREDENCIALES (Estilo Imagen) */}
        {state?.errors?.correo && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-red-950/40 p-3.5 text-xs text-red-300 border border-red-800/40 backdrop-blur-md">
            <svg className="h-5 w-5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeWidth="2" d="M12 8v4m0 4h.01" />
            </svg>
            <span>Usuario o contraseña incorrectos</span>
          </div>
        )}

        {/* FORMULARIO */}
        <form action={formAction} className="space-y-4" noValidate>
          
          {/* Campo Correo / Nombre de usuario */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <input
              id="correo"
              name="correo"
              type="email"
              placeholder="Correo electrónico o nombre de usuario"
              className="w-full rounded-2xl border border-slate-800 bg-[#0b1329]/90 py-3 pl-11 pr-4 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          {/* Campo Contraseña */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              className="w-full rounded-2xl border border-slate-800 bg-[#0b1329]/90 py-3 pl-11 pr-11 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 013.272-.563c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
                </svg>
              )}
            </button>
          </div>

          {/* Opciones Recordarme y Olvidaste tu contraseña */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-slate-400">
              <input
                type="checkbox"
                name="remember"
                className="h-3.5 w-3.5 rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500/20"
              />
              Recordarme
            </label>
            <button
              type="button"
              onClick={() => setShowRecoveryModal(true)}
              className="text-cyan-400 hover:text-cyan-300 transition hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {/* Botón Iniciar sesión */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-700 hover:from-blue-600 hover:to-cyan-600 py-3 text-xs font-semibold text-white shadow-xl shadow-blue-950/50 transition active:scale-[0.99] disabled:opacity-50"
          >
            {isPending ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Pie Informativo */}
        <div className="pt-1 text-center text-[11px] text-slate-500">
          Personal autorizado: Administrador, Encargado y Técnico.
        </div>
      </div>

      {/* MODAL DE SOPORTE PARA RECUPERACIÓN */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-[#0f172a] p-6 border border-blue-900/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Restablecer Contraseña</h3>
              <button 
                onClick={() => setShowRecoveryModal(false)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Por políticas de seguridad de <strong className="text-cyan-400">Sgarnet</strong>, el restablecimiento de credenciales debe ser gestionado por el Administrador del Sistema o Soporte TI.
            </p>

            <div className="rounded-2xl bg-slate-900/80 p-3 border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400">Contacto de Soporte:</div>
              <div className="font-mono text-cyan-300">soporte@sgarnet.com</div>
            </div>

            <button
              type="button"
              onClick={() => setShowRecoveryModal(false)}
              className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-white transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </div>
  )
}