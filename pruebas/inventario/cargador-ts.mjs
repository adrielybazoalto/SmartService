// ============================================================
// Cargador de módulos para probar el backend de CU16 con Node.js (>= 22.15),
// SIN Next.js, SIN red y SIN base de datos:
//
//   1. Resuelve los alias '@/…' hacia src/ y los imports relativos sin
//      extensión hacia sus archivos .ts (Node ejecuta TypeScript quitando
//      los tipos: "type stripping").
//   2. Sustituye por dobles de prueba (carpeta dobles/) SOLO las piezas que
//      dependen del entorno de Next o de Supabase: sesión, permisos de ruta,
//      cliente Supabase, next/headers, next/cache y react.cache.
//
// Se importa antes de cargar cualquier módulo de src/ (con import dinámico).
// ============================================================
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = fileURLToPath(new URL('../../src/', import.meta.url))
const DOBLES = new URL('./dobles/', import.meta.url)

const SUSTITUCIONES = {
  '@/lib/auth': 'auth.mjs',
  '@/lib/permisos': 'permisos.mjs',
  '@/lib/supabase/service': 'supabase-service.mjs',
  'next/headers': 'next-headers.mjs',
  'next/cache': 'next-cache.mjs',
  react: 'react.mjs',
}

function archivoTs(base) {
  for (const candidato of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidato)) return pathToFileURL(candidato).href
  }
  return null
}

registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador in SUSTITUCIONES) {
      return { url: new URL(SUSTITUCIONES[especificador], DOBLES).href, shortCircuit: true }
    }
    if (especificador.startsWith('@/')) {
      const url = archivoTs(join(SRC, especificador.slice(2)))
      if (url) return { url, shortCircuit: true }
    }
    const relativo = especificador.startsWith('./') || especificador.startsWith('../')
    if (relativo && contexto.parentURL?.startsWith('file:') && !/\.[cm]?[jt]sx?$/.test(especificador)) {
      const url = archivoTs(join(dirname(fileURLToPath(contexto.parentURL)), especificador))
      if (url) return { url, shortCircuit: true }
    }
    return siguiente(especificador, contexto)
  },
})
