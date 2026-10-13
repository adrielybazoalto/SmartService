// Doble de react: `cache` sin memoización (cada prueba es una petición nueva).
export const cache = (fn) => fn
