/**
 * Registro declarativo de los formularios de creación/registro de P1..P4.
 *
 * Cada esquema describe los campos que el asistente de voz puede rellenar.
 * Las opciones de catálogos de base de datos (clientes, técnicos, productos…)
 * se completan en cada formulario mediante `opcionesPorCampo` del hook
 * `useVozFormulario`; aquí sólo se declaran las opciones fijas/enum.
 */

import type { EsquemaFormularioVoz, OpcionVoz } from './extractor-formularios'

function opciones(...pares: Array<[string, string, string[]?]>): OpcionVoz[] {
  return pares.map(([valor, etiqueta, sinonimos]) => ({ valor, etiqueta, sinonimos }))
}

const ROLES = opciones(
  ['ADMINISTRADOR', 'Administrador', ['admin', 'administrador general']],
  ['ENCARGADO', 'Encargado', ['supervisor', 'jefe']],
  ['TECNICO', 'Técnico', ['tecnico', 'técnico de campo']],
)

const URGENCIAS = opciones(
  ['BAJA', 'Baja', ['prioridad baja']],
  ['MEDIA', 'Media', ['prioridad media', 'normal']],
  ['ALTA', 'Alta', ['prioridad alta']],
  ['CRITICA', 'Crítica', ['critica', 'urgente', 'emergencia', 'prioridad crítica']],
)

const TIPOS_TICKET = opciones(
  ['CORRECTIVO', 'Correctivo', ['correctiva', 'reparación', 'reparacion', 'falla', 'avería', 'averia']],
  ['PREVENTIVO', 'Preventivo', ['preventiva', 'mantenimiento preventivo', 'revisión', 'revision']],
)

const METODOS_PAGO = opciones(
  ['EFECTIVO', 'Efectivo', ['cash', 'contado']],
  ['QR', 'QR', ['qr simple', 'código qr', 'codigo qr']],
  ['TRANSFERENCIA', 'Transferencia', ['transference', 'banco']],
  ['TARJETA', 'Tarjeta', ['tarjeta de crédito', 'tarjeta de debito', 'credito', 'debito']],
)

const COMPROBANTES = opciones(
  ['NOTA_VENTA', 'Nota de venta', ['nota de venta', 'factura']],
  ['RECIBO', 'Recibo', ['recibo de caja']],
)

const TIPOS_DOCUMENTO_COMPRA = opciones(
  ['FACTURA', 'Factura', ['factura de compra']],
  ['NOTA', 'Nota', ['nota de compra', 'nota de entrega']],
)

const TIPOS_REPORTE = opciones(
  ['RESUMEN_GENERAL', 'Resumen general', ['resumen', 'general']],
  ['INGRESOS', 'Ingresos', ['ventas', 'reporte de ventas']],
  ['SERVICIOS', 'Servicios', ['reporte de servicios']],
  ['ROTACION_INVENTARIO', 'Rotación de inventario', ['rotacion de inventario', 'rotación']],
  ['INVENTARIO_CRITICO', 'Inventario crítico', ['inventario critico', 'stock crítico', 'stock critico']],
  ['RENDIMIENTO_TECNICO', 'Rendimiento técnico', ['rendimiento tecnico', 'por técnico']],
  ['PROVEEDORES', 'Proveedores', ['reporte de proveedores']],
)

const ATAJOS_REPORTE = opciones(
  ['HOY', 'Hoy', ['de hoy']],
  ['ESTA_SEMANA', 'Esta semana', ['semana actual']],
  ['ESTE_MES', 'Este mes', ['mes actual']],
  ['MES_ANTERIOR', 'Mes anterior', ['mes pasado']],
  ['ESTE_ANIO', 'Este año', ['este anio', 'año actual']],
)

const TIPOS_AUSENCIA = opciones(
  ['VACACIONES', 'Vacaciones', ['vacación', 'vacacion']],
  ['BAJA_MEDICA', 'Baja médica', ['baja medica', 'baja', 'enfermedad']],
  ['PERMISO_PARTICULAR', 'Permiso particular', ['permiso', 'permiso personal']],
  ['FERIADO', 'Feriado', ['feriado', 'día libre', 'dia libre']],
  ['CAPACITACION', 'Capacitación', ['capacitacion', 'curso', 'entrenamiento']],
)

export const ESQUEMAS_FORMULARIOS: EsquemaFormularioVoz[] = [
  // ───────────────────────── P1 ─────────────────────────
  {
    id: 'crear-usuario',
    etiqueta: 'Nuevo usuario',
    ruta: '/usuarios',
    sinonimos: ['usuario', 'usuarios', 'nuevo usuario', 'registrar usuario'],
    campos: [
      { nombre: 'txtNombre', etiqueta: 'Nombre completo', sinonimos: ['llamado', 'llamada', 'se llama', 'nombre'], tipo: 'texto', requerido: true },
      { nombre: 'txtCorreo', etiqueta: 'Correo electrónico', sinonimos: ['correo', 'email', 'e-mail'], tipo: 'email', requerido: true },
      { nombre: 'txtPassword', etiqueta: 'Contraseña', sinonimos: ['password', 'clave'], tipo: 'texto', requerido: true, capitalizar: false },
      { nombre: 'txtTelefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'celular', 'móvil', 'movil'], tipo: 'telefono' },
      { nombre: 'cboRol', etiqueta: 'Rol', sinonimos: ['rol', 'perfil', 'tipo de usuario'], tipo: 'select', requerido: true, opciones: ROLES },
    ],
  },
  {
    id: 'crear-rol',
    etiqueta: 'Nuevo rol',
    ruta: '/roles',
    sinonimos: ['rol', 'roles', 'nuevo rol', 'crear rol'],
    campos: [
      { nombre: 'nombreRol', etiqueta: 'Nombre del rol', sinonimos: ['nombre', 'llamado'], tipo: 'texto', requerido: true },
      { nombre: 'descripcionRol', etiqueta: 'Descripción', sinonimos: ['descripcion', 'detalle'], tipo: 'texto' },
    ],
  },
  {
    id: 'editar-perfil',
    etiqueta: 'Datos personales del perfil',
    ruta: '/perfil',
    sinonimos: ['perfil', 'mis datos', 'datos personales'],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', sinonimos: ['llamado', 'nombre completo'], tipo: 'texto', requerido: true },
      { nombre: 'telefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'celular'], tipo: 'telefono' },
    ],
  },

  // ───────────────────────── P2 ─────────────────────────
  {
    id: 'crear-cliente',
    etiqueta: 'Nuevo cliente',
    ruta: '/clientes',
    sinonimos: ['cliente', 'clientes', 'nuevo cliente', 'registrar cliente'],
    campos: [
      { nombre: 'tipoCliente', etiqueta: 'Tipo de cliente', sinonimos: ['tipo', 'natural', 'jurídico'], tipo: 'select', requerido: true,
        opciones: opciones(['NATURAL', 'Persona natural', ['natural', 'persona natural']], ['JURIDICO', 'Persona jurídica', ['juridico', 'jurídica', 'empresa', 'jurídico']]) },
      { nombre: 'documento', etiqueta: 'Documento o NIT', sinonimos: ['documento', 'nit', 'ci', 'cedula', 'cédula'], tipo: 'texto', capitalizar: false },
      { nombre: 'nombreRazonSocial', etiqueta: 'Razón social', sinonimos: ['razon social', 'nombre', 'llamado', 'cliente'], tipo: 'texto', requerido: true },
      { nombre: 'telefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'celular'], tipo: 'telefono' },
      { nombre: 'correo', etiqueta: 'Correo electrónico', sinonimos: ['correo', 'email'], tipo: 'email' },
      { nombre: 'nombreEstablecimiento', etiqueta: 'Nombre del establecimiento', sinonimos: ['establecimiento', 'sucursal', 'local'], tipo: 'texto', requerido: true },
      { nombre: 'tipoInmueble', etiqueta: 'Tipo de inmueble', sinonimos: ['inmueble'], tipo: 'select',
        opciones: opciones(['CASA', 'Casa'], ['DEPARTAMENTO', 'Departamento', ['depto', 'piso']], ['LOCAL COMERCIAL', 'Local comercial', ['local']], ['OFICINA', 'Oficina'], ['BODEGA', 'Bodega', ['almacén', 'almacen']], ['OTRO', 'Otro']) },
      { nombre: 'direccion', etiqueta: 'Dirección', sinonimos: ['direccion', 'domicilio'], tipo: 'texto', requerido: true },
      { nombre: 'latitud', etiqueta: 'Latitud', tipo: 'numero' },
      { nombre: 'longitud', etiqueta: 'Longitud', tipo: 'numero' },
    ],
  },
  {
    id: 'anticipo-cotizacion',
    etiqueta: 'Registrar anticipo de cotización',
    ruta: '/cotizaciones',
    sinonimos: ['anticipo', 'cotización', 'cotizacion', 'aprobar cotización'],
    campos: [
      { nombre: 'montoTexto', etiqueta: 'Monto del anticipo', sinonimos: ['monto', 'valor', 'anticipo'], tipo: 'numero', requerido: true },
      { nombre: 'metodo', etiqueta: 'Método de pago', sinonimos: ['metodo', 'pago', 'forma de pago'], tipo: 'select', requerido: true, opciones: METODOS_PAGO },
      { nombre: 'referencia', etiqueta: 'Referencia', sinonimos: ['referencia', 'comprobante', 'número de operación'], tipo: 'texto' },
    ],
  },
  {
    id: 'convertir-ot',
    etiqueta: 'Programar orden de trabajo',
    ruta: '/cotizaciones',
    sinonimos: ['orden de trabajo desde cotización', 'crear orden desde cotización', 'programar orden'],
    campos: [
      { nombre: 'fechaProgramada', etiqueta: 'Fecha programada', sinonimos: ['fecha', 'para el día', 'dia'], tipo: 'fecha', requerido: true },
      { nombre: 'horaInicio', etiqueta: 'Hora de inicio', sinonimos: ['hora inicio', 'desde las', 'empieza a las'], tipo: 'hora', requerido: true },
      { nombre: 'horaFin', etiqueta: 'Hora de fin', sinonimos: ['hora fin', 'hasta las', 'termina a las'], tipo: 'hora', requerido: true },
    ],
  },
  {
    id: 'crear-cotizacion',
    etiqueta: 'Nueva cotización',
    ruta: '/cotizaciones/nuevo',
    sinonimos: ['nueva cotización', 'nueva cotizacion', 'emitir cotización', 'cotización'],
    campos: [
      { nombre: 'clienteId', etiqueta: 'Cliente', sinonimos: ['cliente', 'razón social'], tipo: 'catalogo', requerido: true },
      { nombre: 'establecimientoId', etiqueta: 'Establecimiento', sinonimos: ['establecimiento', 'sucursal'], tipo: 'catalogo', requerido: true },
      { nombre: 'cantidad', etiqueta: 'Cantidad de productos', sinonimos: ['cantidad', 'productos'], tipo: 'numero' },
      { nombre: 'horasEstimadas', etiqueta: 'Horas estimadas de servicios', sinonimos: ['horas', 'horas estimadas', 'servicios'], tipo: 'numero' },
    ],
  },
  {
    id: 'registrar-venta',
    etiqueta: 'Nueva venta',
    ruta: '/ventas',
    sinonimos: ['venta', 'ventas', 'nueva venta', 'registrar venta'],
    campos: [
      { nombre: 'clienteId', etiqueta: 'Cliente', sinonimos: ['cliente', 'razón social'], tipo: 'catalogo' },
      { nombre: 'tipoComprobante', etiqueta: 'Tipo de comprobante', sinonimos: ['comprobante'], tipo: 'select', requerido: true, opciones: COMPROBANTES },
      { nombre: 'tipoPago', etiqueta: 'Método de pago', sinonimos: ['pago', 'metodo de pago', 'forma de pago'], tipo: 'select', requerido: true, opciones: METODOS_PAGO },
      { nombre: 'descuento', etiqueta: 'Descuento', sinonimos: ['descuento', 'rebaja'], tipo: 'numero' },
      { nombre: 'efectivoRecibido', etiqueta: 'Efectivo recibido', sinonimos: ['efectivo recibido', 'paga con', 'recibido'], tipo: 'numero' },
      { nombre: 'referenciaTransferencia', etiqueta: 'Referencia de transferencia', sinonimos: ['referencia', 'comprobante', 'operación'], tipo: 'texto' },
    ],
  },
  {
    id: 'arqueo-caja',
    etiqueta: 'Apertura o cierre de caja',
    ruta: '/ventas',
    sinonimos: ['caja', 'arqueo', 'apertura de caja', 'cierre de caja'],
    campos: [
      { nombre: 'monto', etiqueta: 'Monto', sinonimos: ['monto', 'fondo', 'efectivo', 'valor'], tipo: 'numero', requerido: true },
      { nombre: 'observacion', etiqueta: 'Observación', sinonimos: ['observacion', 'nota', 'comentario'], tipo: 'texto' },
    ],
  },
  {
    id: 'registrar-abono',
    etiqueta: 'Registrar abono',
    ruta: '/ventas',
    sinonimos: ['abono', 'registrar abono', 'pago a cuenta'],
    campos: [
      { nombre: 'ordenId', etiqueta: 'Orden de trabajo', sinonimos: ['orden', 'orden de trabajo', 'código de orden'], tipo: 'catalogo', requerido: true },
      { nombre: 'montoTxt', etiqueta: 'Monto del abono', sinonimos: ['monto', 'abono', 'valor'], tipo: 'numero', requerido: true },
      { nombre: 'metodo', etiqueta: 'Método de pago', sinonimos: ['pago', 'metodo'], tipo: 'select', requerido: true, opciones: METODOS_PAGO },
      { nombre: 'referencia', etiqueta: 'Referencia', sinonimos: ['referencia', 'comprobante'], tipo: 'texto' },
    ],
  },
  {
    id: 'crear-proveedor',
    etiqueta: 'Nuevo proveedor',
    ruta: '/proveedores',
    sinonimos: ['proveedor', 'proveedores', 'nuevo proveedor', 'mayorista'],
    campos: [
      { nombre: 'razon_social', etiqueta: 'Razón social', sinonimos: ['razon social', 'nombre', 'llamado', 'proveedor'], tipo: 'texto', requerido: true },
      { nombre: 'nit', etiqueta: 'NIT', sinonimos: ['nit', 'documento', 'ruc'], tipo: 'texto', requerido: true, capitalizar: false },
      { nombre: 'contacto', etiqueta: 'Persona de contacto', sinonimos: ['contacto', 'representante'], tipo: 'texto' },
      { nombre: 'telefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'celular'], tipo: 'telefono' },
      { nombre: 'correo', etiqueta: 'Correo electrónico', sinonimos: ['correo', 'email'], tipo: 'email' },
      { nombre: 'direccion', etiqueta: 'Dirección', sinonimos: ['direccion', 'domicilio'], tipo: 'texto' },
    ],
  },
  {
    id: 'agregar-producto-proveedor',
    etiqueta: 'Agregar producto al catálogo del proveedor',
    ruta: '/proveedores',
    sinonimos: ['catálogo del proveedor', 'catalogo del proveedor', 'agregar producto al proveedor'],
    campos: [
      { nombre: 'productoId', etiqueta: 'Producto', sinonimos: ['producto', 'íitem', 'item'], tipo: 'catalogo', requerido: true },
      { nombre: 'codigo', etiqueta: 'Código de ítem', sinonimos: ['codigo', 'código'], tipo: 'texto', capitalizar: false },
      { nombre: 'precio', etiqueta: 'Precio de compra', sinonimos: ['precio', 'costo', 'valor'], tipo: 'numero', requerido: true },
    ],
  },
  {
    id: 'registrar-compra',
    etiqueta: 'Nueva compra',
    ruta: '/compras/nueva',
    sinonimos: ['nueva compra', 'registrar compra', 'compra'],
    campos: [
      { nombre: 'proveedorId', etiqueta: 'Proveedor', sinonimos: ['proveedor', 'mayorista'], tipo: 'catalogo', requerido: true },
      { nombre: 'tipoDocumento', etiqueta: 'Tipo de documento', sinonimos: ['documento', 'tipo de documento'], tipo: 'select', requerido: true, opciones: TIPOS_DOCUMENTO_COMPRA },
      { nombre: 'nroDocumento', etiqueta: 'Número de documento', sinonimos: ['número de factura', 'numero de factura', 'factura', 'nro documento', 'documento'], tipo: 'texto', requerido: true, capitalizar: false },
      { nombre: 'fechaCompra', etiqueta: 'Fecha de compra', sinonimos: ['fecha', 'dia', 'día'], tipo: 'fecha', requerido: true },
      { nombre: 'observacion', etiqueta: 'Observaciones', sinonimos: ['observacion', 'nota', 'comentario'], tipo: 'texto' },
      { nombre: 'cantidad', etiqueta: 'Cantidad', sinonimos: ['cantidad', 'unidades'], tipo: 'numero' },
      { nombre: 'costoUnitario', etiqueta: 'Costo unitario', sinonimos: ['costo', 'precio', 'costo unitario'], tipo: 'numero' },
    ],
  },
  {
    id: 'crear-producto',
    etiqueta: 'Nuevo producto',
    ruta: '/inventario',
    sinonimos: ['producto', 'productos', 'nuevo producto', 'inventario'],
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', sinonimos: ['codigo', 'código'], tipo: 'texto', requerido: true, capitalizar: false },
      { nombre: 'nombre', etiqueta: 'Nombre', sinonimos: ['nombre', 'llamado', 'producto'], tipo: 'texto', requerido: true },
      { nombre: 'descripcion_tecnica', etiqueta: 'Descripción técnica', sinonimos: ['descripcion', 'descripción', 'detalle'], tipo: 'texto' },
      { nombre: 'unidad_medida', etiqueta: 'Unidad de medida', sinonimos: ['unidad', 'medida'], tipo: 'select', requerido: true,
        opciones: opciones(['unidad', 'Unidad'], ['metro', 'Metro'], ['rollo', 'Rollo'], ['caja', 'Caja'], ['par', 'Par']) },
      { nombre: 'categoria_id', etiqueta: 'Categoría', sinonimos: ['categoria', 'categoría'], tipo: 'catalogo', requerido: true },
      { nombre: 'precio_compra_actual', etiqueta: 'Precio de compra', sinonimos: ['precio', 'costo'], tipo: 'numero' },
      { nombre: 'margen_ganancia', etiqueta: 'Margen de ganancia', sinonimos: ['margen', 'ganancia', 'porcentaje'], tipo: 'numero' },
      { nombre: 'stock_minimo', etiqueta: 'Stock mínimo', sinonimos: ['stock minimo', 'stock mínimo', 'mínimo', 'minimo'], tipo: 'numero' },
    ],
  },
  {
    id: 'crear-categoria',
    etiqueta: 'Nueva categoría',
    ruta: '/inventario',
    sinonimos: ['categoría', 'categoria', 'nueva categoría'],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', sinonimos: ['nombre', 'llamado', 'categoría'], tipo: 'texto', requerido: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', sinonimos: ['descripcion', 'detalle'], tipo: 'texto' },
    ],
  },
  {
    id: 'inventario-inicial',
    etiqueta: 'Inventario inicial',
    ruta: '/inventario',
    sinonimos: ['inventario inicial', 'stock inicial', 'ingresar stock inicial'],
    campos: [
      { nombre: 'cantidad', etiqueta: 'Cantidad inicial', sinonimos: ['cantidad', 'stock', 'unidades'], tipo: 'numero', requerido: true },
      { nombre: 'observacion', etiqueta: 'Observación', sinonimos: ['observacion', 'nota'], tipo: 'texto' },
    ],
  },
  {
    id: 'ajuste-inventario',
    etiqueta: 'Ajuste por conteo físico',
    ruta: '/inventario',
    sinonimos: ['ajuste', 'conteo físico', 'conteo fisico', 'ajuste de inventario'],
    campos: [
      { nombre: 'stockContado', etiqueta: 'Stock contado', sinonimos: ['stock', 'cantidad', 'contado'], tipo: 'numero', requerido: true },
      { nombre: 'justificacion', etiqueta: 'Motivo o justificación', sinonimos: ['motivo', 'justificacion', 'justificación', 'razón', 'razon'], tipo: 'texto', requerido: true },
    ],
  },
  {
    id: 'crear-servicio',
    etiqueta: 'Nuevo servicio técnico',
    ruta: '/servicios',
    sinonimos: ['servicio', 'servicios', 'nuevo servicio', 'servicio técnico'],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre del servicio', sinonimos: ['nombre', 'llamado', 'servicio'], tipo: 'texto', requerido: true },
      { nombre: 'tarifa', etiqueta: 'Tarifa por hora', sinonimos: ['tarifa', 'precio', 'costo', 'valor por hora'], tipo: 'numero', requerido: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', sinonimos: ['descripcion', 'detalle'], tipo: 'texto' },
    ],
  },

  // ───────────────────────── P3 ─────────────────────────
  {
    id: 'configurar-jornada',
    etiqueta: 'Configurar jornada del técnico',
    ruta: '/personal-tecnico',
    sinonimos: ['jornada', 'horario', 'configurar jornada'],
    campos: [
      { nombre: 'tecnicoId', etiqueta: 'Técnico', sinonimos: ['tecnico', 'técnico', 'personal'], tipo: 'catalogo', requerido: true },
      { nombre: 'diaSemana', etiqueta: 'Días de actividad', sinonimos: ['días', 'dias', 'semana', 'jornada'], tipo: 'select', requerido: true,
        opciones: opciones(
          ['Lunes a Viernes', 'Lunes a viernes', ['lunes a viernes', 'semana laboral']],
          ['Lunes a Sábado', 'Lunes a sábado', ['lunes a sabado']],
          ['Lunes a Domingo', 'Lunes a domingo', ['toda la semana']],
          ['Fines de Semana', 'Fines de semana', ['fin de semana', 'fines de semana']],
        ) },
      { nombre: 'horaInicio', etiqueta: 'Hora de ingreso', sinonimos: ['hora de ingreso', 'entrada', 'desde las'], tipo: 'hora', requerido: true },
      { nombre: 'horaFin', etiqueta: 'Hora de salida', sinonimos: ['hora de salida', 'salida', 'hasta las'], tipo: 'hora', requerido: true },
    ],
  },
  {
    id: 'registrar-bloqueo',
    etiqueta: 'Registrar bloqueo de agenda',
    ruta: '/personal-tecnico',
    sinonimos: ['bloqueo', 'ausencia', 'bloqueo de agenda'],
    campos: [
      { nombre: 'tecnicoId', etiqueta: 'Técnico', sinonimos: ['tecnico', 'técnico'], tipo: 'catalogo', requerido: true },
      { nombre: 'tipoBloqueo', etiqueta: 'Tipo de ausencia', sinonimos: ['ausencia', 'tipo', 'motivo'], tipo: 'select', requerido: true, opciones: TIPOS_AUSENCIA },
      { nombre: 'fechaInicio', etiqueta: 'Fecha y hora de inicio', sinonimos: ['inicio', 'desde', 'fecha inicio'], tipo: 'fecha', requerido: true },
      { nombre: 'fechaFin', etiqueta: 'Fecha y hora de fin', sinonimos: ['fin', 'hasta', 'fecha fin'], tipo: 'fecha', requerido: true },
      { nombre: 'motivo', etiqueta: 'Motivo', sinonimos: ['motivo', 'justificación', 'justificacion', 'razón', 'razon'], tipo: 'texto', requerido: true },
    ],
  },
  {
    id: 'asignar-cuadrilla',
    etiqueta: 'Asignar cuadrilla',
    ruta: '/asignar-tecnicos',
    sinonimos: ['cuadrilla', 'asignar técnicos', 'asignar tecnicos', 'asignación'],
    campos: [
      { nombre: 'tecnicos', etiqueta: 'Técnicos asignados', sinonimos: ['técnicos', 'tecnicos', 'cuadrilla', 'personal'], tipo: 'catalogo', multi: true, requerido: true },
      { nombre: 'liderId', etiqueta: 'Líder de la cuadrilla', sinonimos: ['líder', 'lider', 'jefe', 'responsable'], tipo: 'catalogo', requerido: true },
    ],
  },
  {
    id: 'crear-orden-correctiva',
    etiqueta: 'Nueva orden correctiva',
    ruta: '/ordenes-trabajo',
    sinonimos: ['orden correctiva', 'nueva orden', 'orden de trabajo', 'crear orden'],
    campos: [
      { nombre: 'tipoTrabajo', etiqueta: 'Tipo de trabajo', sinonimos: ['trabajo', 'tipo de trabajo', 'descripción'], tipo: 'texto', requerido: true },
      { nombre: 'fecha', etiqueta: 'Fecha programada', sinonimos: ['fecha', 'día', 'dia', 'programada'], tipo: 'fecha', requerido: true },
      { nombre: 'horaInicio', etiqueta: 'Hora de inicio', sinonimos: ['hora inicio', 'desde las', 'empieza a las'], tipo: 'hora', requerido: true },
      { nombre: 'horaFin', etiqueta: 'Hora de fin', sinonimos: ['hora fin', 'hasta las', 'termina a las'], tipo: 'hora', requerido: true },
    ],
  },
  {
    id: 'reporte-campo',
    etiqueta: 'Reporte de campo',
    ruta: '/ordenes-trabajo',
    sinonimos: ['reporte de campo', 'diagnóstico', 'diagnostico', 'finalizar orden'],
    campos: [
      { nombre: 'diagnostico', etiqueta: 'Diagnóstico', sinonimos: ['diagnostico', 'diagnóstico', 'falla', 'solución', 'solucion'], tipo: 'texto', requerido: true },
      { nombre: 'productoId', etiqueta: 'Material adicional', sinonimos: ['material', 'producto', 'insumo'], tipo: 'catalogo' },
      { nombre: 'cantidadMaterial', etiqueta: 'Cantidad del material', sinonimos: ['cantidad', 'unidades'], tipo: 'numero' },
      { nombre: 'obsMaterial', etiqueta: 'Observación del material', sinonimos: ['observación', 'observacion', 'nota'], tipo: 'texto' },
    ],
  },
  {
    id: 'liquidar-orden',
    etiqueta: 'Liquidación de orden de trabajo',
    ruta: '/liquidacion',
    sinonimos: ['liquidación', 'liquidacion', 'nota de servicio', 'cobrar saldo'],
    campos: [
      { nombre: 'servicioId', etiqueta: 'Servicio aplicado', sinonimos: ['servicio', 'servicio técnico'], tipo: 'catalogo' },
      { nombre: 'anticipoTexto', etiqueta: 'Anticipo', sinonimos: ['anticipo', 'entregado', 'pago previo'], tipo: 'numero' },
      { nombre: 'metodoPago', etiqueta: 'Método de pago', sinonimos: ['pago', 'metodo', 'forma de pago'], tipo: 'select', opciones: METODOS_PAGO },
      { nombre: 'referencia', etiqueta: 'Referencia', sinonimos: ['referencia', 'comprobante', 'operación'], tipo: 'texto' },
    ],
  },

  // ───────────────────────── P4 ─────────────────────────
  {
    id: 'crear-ticket',
    etiqueta: 'Nuevo ticket de soporte',
    ruta: '/tickets-soporte',
    sinonimos: ['ticket', 'tickets', 'incidencia', 'nuevo ticket', 'crear ticket', 'reportar falla'],
    campos: [
      { nombre: 'sistemaId', etiqueta: 'Sistema instalado', sinonimos: ['sistema', 'equipo', 'cámara', 'camara', 'alarma'], tipo: 'catalogo' },
      { nombre: 'clienteTexto', etiqueta: 'Cliente', sinonimos: ['cliente', 'razón social', 'hotel', 'empresa'], tipo: 'catalogo' },
      { nombre: 'tipo', etiqueta: 'Tipo de mantenimiento', sinonimos: ['tipo', 'mantenimiento'], tipo: 'select', requerido: true, opciones: TIPOS_TICKET },
      { nombre: 'urgencia', etiqueta: 'Nivel de urgencia', sinonimos: ['urgencia', 'prioridad', 'urgente'], tipo: 'select', requerido: true, opciones: URGENCIAS },
      { nombre: 'descripcion', etiqueta: 'Descripción de la incidencia', sinonimos: ['descripción', 'descripcion', 'falla', 'incidencia', 'problema', 'síntoma', 'sintoma'], tipo: 'texto', requerido: true },
    ],
  },
  {
    id: 'derivar-ticket-ot',
    etiqueta: 'Derivar ticket a orden de trabajo',
    ruta: '/tickets-soporte',
    sinonimos: ['derivar ticket', 'derivar a orden', 'derivar a ot'],
    campos: [
      { nombre: 'fecha', etiqueta: 'Fecha programada', sinonimos: ['fecha', 'día', 'dia'], tipo: 'fecha', requerido: true },
      { nombre: 'horaInicio', etiqueta: 'Hora de inicio', sinonimos: ['hora inicio', 'desde las'], tipo: 'hora', requerido: true },
      { nombre: 'horaFin', etiqueta: 'Hora de fin', sinonimos: ['hora fin', 'hasta las'], tipo: 'hora', requerido: true },
    ],
  },
  {
    id: 'generar-reporte',
    etiqueta: 'Generar reporte',
    ruta: '/reportes',
    sinonimos: ['reporte', 'reportes', 'generar reporte', 'estadística', 'estadistica'],
    campos: [
      { nombre: 'tipo', etiqueta: 'Tipo de reporte', sinonimos: ['tipo', 'reporte'], tipo: 'select', requerido: true, opciones: TIPOS_REPORTE },
      { nombre: 'tecnicoId', etiqueta: 'Técnico', sinonimos: ['técnico', 'tecnico', 'por técnico'], tipo: 'catalogo' },
      { nombre: 'categoriaId', etiqueta: 'Categoría', sinonimos: ['categoría', 'categoria'], tipo: 'catalogo' },
      { nombre: 'atajo', etiqueta: 'Período', sinonimos: ['periodo', 'período', 'fecha', 'rango'], tipo: 'select', opciones: ATAJOS_REPORTE },
      { nombre: 'desde', etiqueta: 'Desde', sinonimos: ['desde'], tipo: 'fecha' },
      { nombre: 'hasta', etiqueta: 'Hasta', sinonimos: ['hasta'], tipo: 'fecha' },
    ],
  },
]

export function esquemaPorId(id: string): EsquemaFormularioVoz | undefined {
  return ESQUEMAS_FORMULARIOS.find((e) => e.id === id)
}

export function esquemasPorRuta(ruta: string): EsquemaFormularioVoz[] {
  return ESQUEMAS_FORMULARIOS.filter(
    (e) => ruta === e.ruta || ruta.startsWith(`${e.ruta}/`),
  )
}
