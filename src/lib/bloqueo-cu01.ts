/**
 * ⚙️ CONFIGURACIÓN CU01 — Bloqueo temporal por intentos fallidos (Login)
 * ======================================================================
 * Edita estos dos valores para ajustar la política de bloqueo.
 * No hace falta tocar nada más: la lógica de `loginAction` y los mensajes
 * del formulario se adaptan automáticamente a lo que definas aquí.
 *
 * - En desarrollo, Turbopack recarga el cambio al guardar (si el dev server
 *   ya está corriendo, basta guardar el archivo).
 * - En producción, estos valores quedan compilados en el build.
 * - NO requiere cambios en la BD: las columnas `intentos_fallidos` y
 *   `bloqueado_hasta` solo guardan el estado real; esta configuración define
 *   la política (límite y duración).
 */
export const CU01 = {
  /** Máximo de contraseñas incorrectas consecutivas antes de bloquear la cuenta. */
  maxIntentos: 3,

  /** Duración del bloqueo, en minutos. */
  minutosBloqueo: 1,
} as const