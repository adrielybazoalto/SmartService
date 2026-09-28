'use client'

import { useActionState } from 'react'
import { iniciarSesion } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, formAction] = useActionState(iniciarSesion, null)

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <form action={formAction} className="bg-slate-900 p-8 rounded-xl shadow-xl w-96 space-y-4">
        <h1 className="text-2xl font-bold text-center mb-6">SmartService</h1>
        
        {state?.errors?.correo && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded text-sm">
            {state.errors.correo}
          </div>
        )}

        <div>
          <label className="block text-sm mb-1">Correo electrónico</label>
          <input 
            type="email" 
            name="correo" 
            required 
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
            placeholder="correo@ejemplo.com"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Contraseña</label>
          <input 
            type="password" 
            name="password" 
            required 
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
            placeholder="••••••••"
          />
        </div>

        <button 
          type="submit" 
          className="w-full bg-blue-600 hover:bg-blue-500 transition-colors p-2 rounded font-semibold mt-4"
        >
          Iniciar sesión
        </button>
      </form>
    </main>
  )
}