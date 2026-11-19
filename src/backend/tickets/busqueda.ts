/**
 * CU18 — Resolución del sistema instalado a partir del dictado. Función PURA
 * (sin servidor): equivale a un ILIKE '%texto%' sobre cliente.nombre,
 * cliente.razon_social, establecimiento.nombre_establecimiento y
 * sistema_instalado.nombre_sistema, pero sin distinguir tildes ni singular/plural
 * ("camaras" encuentra "Cámara IP"), porque el dictado llega sin tildes.
 */
import { sinTildes } from '@/lib/voz/normalizar'

export interface SistemaBuscable {
  id: number
  nombre_sistema: string
  numero_serie: string | null
  establecimiento: { id: number; nombre: string }
  cliente: { id: number; nombre: string; razon_social: string | null }
}

const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'para', 'su', 'sus'])

/** Raíz simple: quita la -s / -es final de palabras largas (camaras -> camara). */
function raiz(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith('es') && !palabra.endsWith('ees')) return palabra.slice(0, -2)
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1)
  return palabra
}

function palabrasClave(texto: string): string[] {
  return sinTildes(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p && !VACIAS.has(p))
    .map(raiz)
}

/** Todas las palabras del texto buscado aparecen (como subcadena) en el texto del registro. */
function contieneTodas(buscado: string, registro: string): boolean {
  const claves = palabrasClave(buscado)
  if (claves.length === 0) return false
  const destino = palabrasClave(registro).join(' ')
  return claves.every((c) => destino.includes(c))
}

/** Etiqueta "Cliente > Establecimiento > Sistema". */
export function etiquetaSistema(s: SistemaBuscable): string {
  return `${s.cliente.nombre} > ${s.establecimiento.nombre} > ${s.nombre_sistema}`
}

/**
 * Sistemas que coinciden con lo dictado. Sin ningún texto devuelve [], para
 * que el campo quede vacío.
 */
export function filtrarSistemasPorTexto(
  sistemas: readonly SistemaBuscable[],
  textos: { clienteTexto?: string | null; sistemaTexto?: string | null },
): SistemaBuscable[] {
  const cliente = textos.clienteTexto?.trim() ?? ''
  const sistema = textos.sistemaTexto?.trim() ?? ''
  if (!cliente && !sistema) return []

  return sistemas.filter((s) => {
    const textoCliente = `${s.cliente.nombre} ${s.cliente.razon_social ?? ''} ${s.establecimiento.nombre}`
    const okCliente = !cliente || contieneTodas(cliente, textoCliente)
    const okSistema = !sistema || contieneTodas(sistema, `${s.nombre_sistema} ${s.numero_serie ?? ''}`)
    return okCliente && okSistema
  })
}

/** Filtro del selector buscable: por cualquier parte de la etiqueta o el número de serie. */
export function filtrarSistemasLibre(sistemas: readonly SistemaBuscable[], consulta: string): SistemaBuscable[] {
  if (!consulta.trim()) return [...sistemas]
  return sistemas.filter((s) => contieneTodas(consulta, `${etiquetaSistema(s)} ${s.cliente.razon_social ?? ''} ${s.numero_serie ?? ''}`))
}
