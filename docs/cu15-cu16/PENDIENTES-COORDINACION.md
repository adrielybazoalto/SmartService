# Pendientes de coordinación con el equipo (CU15 / CU16)

Problemas detectados durante la validación de CU15/CU16 que pertenecen a código
**compartido**. No se corrigieron desde la rama `dev-jorge` para no modificar
módulos ajenos; se documentan aquí para acordar quién los resuelve.

## 1. La barra lateral no se adapta a pantallas móviles

- **Archivo:** `src/components/sidebar.tsx` (`SidebarLayout`), usado por todas las pantallas con sesión.
- **Causa:** el `<aside>` usa siempre `sticky top-0 h-screen w-64` (256 px fijos), sin variantes
  responsive (`hidden md:flex`, menú desplegable, etc.).
- **Efecto:** en un teléfono (≈ 390 px de ancho) la barra ocupa unos dos tercios de la pantalla y el
  contenido queda comprimido en una columna de ~130 px: títulos cortados, tarjetas y filtros
  apilados letra por letra. Afecta a todos los módulos (no solo a Inventario o Compras).
- **Cómo se detectó:** revisión con navegador headless a 390×844 (validación de fotografías de CU16,
  13/10/2026), con datos ficticios y sin conexión a Supabase.
- **Lo que sí funciona:** los modales de CU16 (detalle con fotografías, formularios) son `fixed inset-0`
  y se muestran a todo el ancho, así que siguen siendo usables.
- **Propuesta (para decidir en equipo):** ocultar la barra bajo `md` (`hidden md:flex`) y añadir un botón
  de menú que la abra como panel superpuesto en móvil. Requiere un componente cliente para el estado
  abierto/cerrado; el resto de `SidebarLayout` puede seguir siendo de servidor.

## 2. Salto de línea en la columna de acciones del catálogo de Inventario (menor)

- En escritorio (1366 px con la barra lateral), las acciones del Administrador
  (Kárdex · Editar · Ajuste · Desactivar) ocupan dos líneas. Ya ocurría antes de añadir las
  fotografías. Es un ajuste de CU16 que puede hacerse en `src/app/inventario/catalogo-productos.tsx`
  si el equipo lo considera necesario.

## 3. Revisión en desarrollo: usar `localhost`, no `127.0.0.1`

- Next.js 16 bloquea por defecto los recursos de desarrollo (`/_next/hmr`) desde orígenes no
  permitidos. Al abrir `http://127.0.0.1:<puerto>` la página no termina de hidratar y los botones
  no responden. Con `http://localhost:<puerto>` funciona. Alternativa: `allowedDevOrigins` en
  `next.config.ts` (archivo compartido; no se modificó).
