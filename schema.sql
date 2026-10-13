-- ============================================================
-- REINICIO TOTAL DEL ESQUEMA
-- ============================================================
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

BEGIN;

-- ============================================================
-- SISTEMA DE GESTIÓN DE SERVICIOS DE SEGURIDAD
-- PostgreSQL
-- ============================================================

-- ============================================================
-- 1. SEGURIDAD Y CONTROL DE ACCESO
-- ============================================================

CREATE TABLE ROL (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

CREATE TABLE MODULO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

-- Permiso a nivel de módulo/ruta (RBAC por rutas: /usuarios, /roles, ...)
CREATE TABLE PERMISO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    ruta VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

-- Asignación rol -> permiso (matriz RBAC editable en el futuro desde /roles)
CREATE TABLE ROL_PERMISO (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER NOT NULL,
    permiso_id INTEGER NOT NULL,

    CONSTRAINT fk_rol_permiso_rol
        FOREIGN KEY (rol_id)
        REFERENCES ROL(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_rol_permiso_permiso
        FOREIGN KEY (permiso_id)
        REFERENCES PERMISO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT uq_rol_permiso
        UNIQUE (rol_id, permiso_id)
);

CREATE TABLE ACCION (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE FUNCION (
    id SERIAL PRIMARY KEY,
    modulo_id INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),

    CONSTRAINT fk_funcion_modulo
        FOREIGN KEY (modulo_id)
        REFERENCES MODULO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

CREATE TABLE ROL_FUNCION (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER NOT NULL,
    funcion_id INTEGER NOT NULL,
    accion_id INTEGER NOT NULL,
    descripcion VARCHAR(255),

    CONSTRAINT fk_rol_funcion_rol
        FOREIGN KEY (rol_id)
        REFERENCES ROL(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_rol_funcion_funcion
        FOREIGN KEY (funcion_id)
        REFERENCES FUNCION(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_rol_funcion_accion
        FOREIGN KEY (accion_id)
        REFERENCES ACCION(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT uq_rol_funcion
        UNIQUE (rol_id, funcion_id, accion_id)
);

CREATE TABLE USUARIO (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,
    telefono VARCHAR(30),
    estado BOOLEAN NOT NULL DEFAULT TRUE,
    version_sesion INTEGER NOT NULL DEFAULT 0,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,

    CONSTRAINT fk_usuario_rol
        FOREIGN KEY (rol_id)
        REFERENCES ROL(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

CREATE TABLE TOKEN_RECUPERACION (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    hash_token TEXT NOT NULL UNIQUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TIMESTAMP NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_token_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE TABLE BITACORA (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accion VARCHAR(100) NOT NULL,
    descripcion TEXT,
    ip VARCHAR(45),

    CONSTRAINT fk_bitacora_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ============================================================
-- 2. DISPONIBILIDAD DE TÉCNICOS
-- ============================================================

CREATE TABLE CARGA_HORARIA_TECNICO (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    dia_semana VARCHAR(20) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_carga_horaria_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_horario_tecnico
        CHECK (hora_fin > hora_inicio)
);

CREATE TABLE BLOQUEO_TECNICO (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_fin TIMESTAMP NOT NULL,
    motivo VARCHAR(255),
    tipo VARCHAR(50),

    CONSTRAINT fk_bloqueo_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_fecha_bloqueo
        CHECK (fecha_fin > fecha_inicio)
);

-- ============================================================
-- 3. CLIENTES Y ESTABLECIMIENTOS
-- ============================================================

CREATE TABLE CLIENTE (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo_cliente VARCHAR(30) NOT NULL,
    razon_social VARCHAR(200),
    documento_identidad VARCHAR(50) UNIQUE,
    correo VARCHAR(150),
    telefono VARCHAR(30),
    telefono_alternativo VARCHAR(30),
    fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE ESTABLECIMIENTO (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    nombre_establecimiento VARCHAR(150) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    tipo_inmueble VARCHAR(100),
    latitud NUMERIC(10,7),
    longitud NUMERIC(10,7),

    CONSTRAINT fk_establecimiento_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES CLIENTE(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ============================================================
-- 4. CATÁLOGO E INVENTARIO
-- ============================================================

CREATE TABLE CATEGORIA_PRODUCTO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

CREATE TABLE PRODUCTO (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion_tecnica TEXT,
    unidad_medida VARCHAR(50) NOT NULL,
    margen_ganancia NUMERIC(10,2) NOT NULL DEFAULT 0,
    precio_compra_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_disponible NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT fk_producto_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES CATEGORIA_PRODUCTO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_producto_margen
        CHECK (margen_ganancia >= 0),

    CONSTRAINT chk_producto_precio
        CHECK (precio_compra_actual >= 0),

    CONSTRAINT chk_producto_stock
        CHECK (stock_disponible >= 0),

    CONSTRAINT chk_producto_stock_minimo
        CHECK (stock_minimo >= 0)
);

CREATE TABLE PROVEEDOR (
    id SERIAL PRIMARY KEY,
    razon_social VARCHAR(200) NOT NULL,
    nit VARCHAR(50) UNIQUE,
    contacto VARCHAR(150),
    telefono VARCHAR(30),
    correo VARCHAR(150)
);

CREATE TABLE PRODUCTO_PROVEEDOR (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    proveedor_id INTEGER NOT NULL,
    precio_compra NUMERIC(12,2) NOT NULL DEFAULT 0,
    codigo_item_proveedor VARCHAR(100),

    CONSTRAINT fk_producto_proveedor_producto
        FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_producto_proveedor_proveedor
        FOREIGN KEY (proveedor_id)
        REFERENCES PROVEEDOR(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT uq_producto_proveedor
        UNIQUE (producto_id, proveedor_id),

    CONSTRAINT chk_precio_proveedor
        CHECK (precio_compra >= 0)
);

CREATE TABLE IMAGEN_PRODUCTO (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    url_imagen VARCHAR(500) NOT NULL,
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    orden INTEGER DEFAULT 1,

    CONSTRAINT fk_imagen_producto
        FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_orden_imagen
        CHECK (orden >= 1)
);

-- ============================================================
-- 5. SERVICIOS
-- ============================================================

CREATE TABLE SERVICIO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL ,
    descripcion TEXT,
    precio_hora_base NUMERIC(12,2) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT servicio_nombre_key UNIQUE (nombre),
    CONSTRAINT chk_precio_hora CHECK (precio_hora_base > 0)
);

-- ============================================================
-- 6. SISTEMAS INSTALADOS
-- ============================================================

CREATE TABLE SISTEMA_INSTALADO (
    id SERIAL PRIMARY KEY,
    establecimiento_id INTEGER NOT NULL,
    orden_trabajo_id INTEGER,
    nombre_sistema VARCHAR(150) NOT NULL,
    fecha_instalacion DATE NOT NULL,
    numero_serie VARCHAR(100),
    periodicidad_meses INTEGER NOT NULL DEFAULT 6,
    fecha_ultimo_mantenimiento DATE,
    fecha_proximo_mantenimiento DATE,
    observaciones TEXT,

    CONSTRAINT fk_sistema_establecimiento
        FOREIGN KEY (establecimiento_id)
        REFERENCES ESTABLECIMIENTO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_periodicidad
        CHECK (periodicidad_meses > 0)
);

-- ============================================================
-- 7. COTIZACIONES
-- ============================================================

CREATE TABLE COTIZACION (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    establecimiento_id INTEGER,
    usuario_id INTEGER NOT NULL,
    numero_cotizacion VARCHAR(50) NOT NULL UNIQUE,
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    total NUMERIC(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT fk_cotizacion_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES CLIENTE(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_cotizacion_establecimiento
        FOREIGN KEY (establecimiento_id)
        REFERENCES ESTABLECIMIENTO(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_cotizacion_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_cotizacion_total
        CHECK (total >= 0),

    CONSTRAINT chk_cotizacion_fechas
        CHECK (
            fecha_vencimiento IS NULL
            OR fecha_vencimiento >= fecha_emision
        )
);

CREATE TABLE DETALLE_COTIZACION_PRODUCTO (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad NUMERIC(12,2) NOT NULL,
    precio_unitario NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_detalle_cot_producto_cotizacion
        FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_detalle_cot_producto_producto
        FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_detalle_cot_producto_cantidad
        CHECK (cantidad > 0),

    CONSTRAINT chk_detalle_cot_producto_precio
        CHECK (precio_unitario >= 0),

    CONSTRAINT chk_detalle_cot_producto_subtotal
        CHECK (subtotal >= 0)
);

CREATE TABLE DETALLE_COTIZACION_SERVICIO (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER NOT NULL,
    servicio_id INTEGER NOT NULL,
    horas_estimadas NUMERIC(10,2) NOT NULL,
    precio_hora NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_detalle_cot_servicio_cotizacion
        FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_detalle_cot_servicio_servicio
        FOREIGN KEY (servicio_id)
        REFERENCES SERVICIO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_horas_estimadas
        CHECK (horas_estimadas > 0),

    CONSTRAINT chk_precio_hora_detalle
        CHECK (precio_hora >= 0),

    CONSTRAINT chk_subtotal_servicio
        CHECK (subtotal >= 0)
);

-- ============================================================
-- 8. MANTENIMIENTO
-- ============================================================

CREATE TABLE MANTENIMIENTO_TICKET (
    id SERIAL PRIMARY KEY,
    sistema_instalado_id INTEGER NOT NULL,
    tipo_mantenimiento VARCHAR(30) NOT NULL,
    nivel_urgencia VARCHAR(30),
    descripcion_incidencia TEXT NOT NULL,
    fecha_reporte TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(30) NOT NULL DEFAULT 'ABIERTO',

    CONSTRAINT fk_ticket_sistema
        FOREIGN KEY (sistema_instalado_id)
        REFERENCES SISTEMA_INSTALADO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ============================================================
-- 9. ÓRDENES DE TRABAJO
-- ============================================================

CREATE TABLE ORDEN_TRABAJO (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER,
    mantenimiento_ticket_id INTEGER,
    codigo_orden VARCHAR(50) NOT NULL UNIQUE,
    tipo_trabajo VARCHAR(100) NOT NULL,
    estado VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADA',
    fecha_inicio_programada TIMESTAMP,
    fecha_fin_programada TIMESTAMP,
    fecha_inicio_real TIMESTAMP,
    fecha_fin_real TIMESTAMP,
    observaciones_tecnico TEXT,

    CONSTRAINT fk_orden_cotizacion
        FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_orden_ticket
        FOREIGN KEY (mantenimiento_ticket_id)
        REFERENCES MANTENIMIENTO_TICKET(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT uq_orden_ticket
        UNIQUE (mantenimiento_ticket_id),

    CONSTRAINT chk_fechas_programadas
        CHECK (
            fecha_fin_programada IS NULL
            OR fecha_inicio_programada IS NULL
            OR fecha_fin_programada >= fecha_inicio_programada
        ),

    CONSTRAINT chk_fechas_reales
        CHECK (
            fecha_fin_real IS NULL
            OR fecha_inicio_real IS NULL
            OR fecha_fin_real >= fecha_inicio_real
        )
);

-- Clave foránea diferida para SISTEMA_INSTALADO
ALTER TABLE SISTEMA_INSTALADO
ADD CONSTRAINT fk_sistema_orden
FOREIGN KEY (orden_trabajo_id)
REFERENCES ORDEN_TRABAJO(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- ============================================================
-- 10. TÉCNICOS ASIGNADOS
-- ============================================================

CREATE TABLE ORDEN_TRABAJO_TECNICO (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    es_lider BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_orden_tecnico_orden
        FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_orden_tecnico_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT uq_orden_tecnico
        UNIQUE (orden_trabajo_id, usuario_id)
);

-- ============================================================
-- 11. CONSUMO DE MATERIALES
-- ============================================================

CREATE TABLE DETALLE_CONSUMO_MATERIAL (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad_utilizada NUMERIC(12,2) NOT NULL,
    observacion TEXT,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_consumo_orden
        FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_consumo_producto
        FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_cantidad_consumida
        CHECK (cantidad_utilizada > 0)
);

-- ============================================================
-- 12. NOTA DE SERVICIO
-- ============================================================

CREATE TABLE NOTA_SERVICIO (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER NOT NULL,
    numero_nota VARCHAR(50) NOT NULL UNIQUE,
    anticipo_pagado NUMERIC(12,2) NOT NULL DEFAULT 0,
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    estado VARCHAR(30) NOT NULL,
    monto_total NUMERIC(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT fk_nota_orden
        FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT uq_nota_orden
        UNIQUE (orden_trabajo_id),

    CONSTRAINT chk_anticipo
        CHECK (anticipo_pagado >= 0),

    CONSTRAINT chk_monto_nota
        CHECK (monto_total >= 0)
);

-- ============================================================
-- 13. ALERTAS
-- ============================================================

CREATE TABLE ALERTA_NOTIFICACION (
    id SERIAL PRIMARY KEY,
    sistema_instalado_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    fecha_alerta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leido BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_alerta_sistema
        FOREIGN KEY (sistema_instalado_id)
        REFERENCES SISTEMA_INSTALADO(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ============================================================
-- 14. CAJA
-- ============================================================

CREATE TABLE CAJA (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    fecha_apertura TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP,
    monto_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
    monto_final_sistema NUMERIC(12,2),
    monto_final_real NUMERIC(12,2),
    estado VARCHAR(30) NOT NULL DEFAULT 'ABIERTA',

    CONSTRAINT fk_caja_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_monto_inicial
        CHECK (monto_inicial >= 0),

    CONSTRAINT chk_monto_final_sistema
        CHECK (
            monto_final_sistema IS NULL
            OR monto_final_sistema >= 0
        ),

    CONSTRAINT chk_monto_final_real
        CHECK (
            monto_final_real IS NULL
            OR monto_final_real >= 0
        ),

    CONSTRAINT chk_fecha_cierre
        CHECK (
            fecha_cierre IS NULL
            OR fecha_cierre >= fecha_apertura
        )
);

-- ============================================================
-- 15. VENTAS
-- ============================================================

CREATE TABLE VENTA (
    id SERIAL PRIMARY KEY,
    caja_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    cotizacion_id INTEGER,
    orden_trabajo_id INTEGER,
    tipo_comprobante VARCHAR(50) NOT NULL,
    nro_comprobante VARCHAR(50),
    fecha_emision TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado VARCHAR(30) NOT NULL DEFAULT 'EMITIDA',

    CONSTRAINT fk_venta_caja
        FOREIGN KEY (caja_id)
        REFERENCES CAJA(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_venta_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES CLIENTE(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_venta_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_venta_cotizacion
        FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_venta_orden
        FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT chk_venta_subtotal
        CHECK (subtotal >= 0),

    CONSTRAINT chk_venta_descuento
        CHECK (descuento >= 0),

    CONSTRAINT chk_venta_total
        CHECK (total >= 0)
);

-- ============================================================
-- 16. DETALLE DE VENTA
-- ============================================================

CREATE TABLE DETALLE_VENTA (
    id SERIAL PRIMARY KEY,
    venta_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad NUMERIC(12,2) NOT NULL,
    precio_unitario NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_detalle_venta_venta
        FOREIGN KEY (venta_id)
        REFERENCES VENTA(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_detalle_venta_producto
        FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_detalle_venta_cantidad
        CHECK (cantidad > 0),

    CONSTRAINT chk_detalle_venta_precio
        CHECK (precio_unitario >= 0),

    CONSTRAINT chk_detalle_venta_subtotal
        CHECK (subtotal >= 0)
);

-- ============================================================
-- 17. KARDEX
-- ============================================================

CREATE TABLE MOVIMIENTO_KARDEX (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo_movimiento VARCHAR(30) NOT NULL,
    cantidad NUMERIC(12,2) NOT NULL,
    stock_anterior NUMERIC(12,2) NOT NULL,
    origen_movimiento VARCHAR(100),
    fecha_movimiento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacion TEXT,

    CONSTRAINT fk_kardex_producto
        FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_kardex_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_kardex_tipo
        CHECK (
            tipo_movimiento IN ('ENTRADA', 'SALIDA', 'AJUSTE')
        ),

    CONSTRAINT chk_kardex_cantidad
        CHECK (cantidad > 0),

    CONSTRAINT chk_kardex_stock
        CHECK (stock_anterior >= 0)
);

-- ============================================================
-- 18. ÍNDICES DE RENDIMIENTO
-- ============================================================

CREATE INDEX idx_usuario_rol ON USUARIO(rol_id);
CREATE INDEX idx_token_usuario ON TOKEN_RECUPERACION(usuario_id);
CREATE INDEX idx_rol_permiso_rol ON ROL_PERMISO(rol_id);
CREATE INDEX idx_rol_permiso_permiso ON ROL_PERMISO(permiso_id);
CREATE INDEX idx_bitacora_usuario ON BITACORA(usuario_id);
CREATE INDEX idx_carga_usuario ON CARGA_HORARIA_TECNICO(usuario_id);
CREATE INDEX idx_bloqueo_usuario ON BLOQUEO_TECNICO(usuario_id);
CREATE INDEX idx_establecimiento_cliente ON ESTABLECIMIENTO(cliente_id);
CREATE INDEX idx_producto_categoria ON PRODUCTO(categoria_id);
CREATE INDEX idx_producto_proveedor_producto ON PRODUCTO_PROVEEDOR(producto_id);
CREATE INDEX idx_producto_proveedor_proveedor ON PRODUCTO_PROVEEDOR(proveedor_id);
CREATE INDEX idx_imagen_producto ON IMAGEN_PRODUCTO(producto_id);
CREATE INDEX idx_sistema_establecimiento ON SISTEMA_INSTALADO(establecimiento_id);
CREATE INDEX idx_sistema_orden ON SISTEMA_INSTALADO(orden_trabajo_id);
CREATE INDEX idx_cotizacion_cliente ON COTIZACION(cliente_id);
CREATE INDEX idx_cotizacion_usuario ON COTIZACION(usuario_id);
CREATE INDEX idx_cotizacion_establecimiento ON COTIZACION(establecimiento_id);
CREATE INDEX idx_detalle_cot_producto_cotizacion ON DETALLE_COTIZACION_PRODUCTO(cotizacion_id);
CREATE INDEX idx_detalle_cot_servicio_cotizacion ON DETALLE_COTIZACION_SERVICIO(cotizacion_id);
CREATE INDEX idx_orden_cotizacion ON ORDEN_TRABAJO(cotizacion_id);
CREATE INDEX idx_orden_tecnico_usuario ON ORDEN_TRABAJO_TECNICO(usuario_id);
CREATE INDEX idx_consumo_orden ON DETALLE_CONSUMO_MATERIAL(orden_trabajo_id);
CREATE INDEX idx_consumo_producto ON DETALLE_CONSUMO_MATERIAL(producto_id);
CREATE INDEX idx_ticket_sistema ON MANTENIMIENTO_TICKET(sistema_instalado_id);
CREATE INDEX idx_alerta_sistema ON ALERTA_NOTIFICACION(sistema_instalado_id);
CREATE INDEX idx_caja_usuario ON CAJA(usuario_id);
CREATE INDEX idx_venta_cliente ON VENTA(cliente_id);
CREATE INDEX idx_venta_usuario ON VENTA(usuario_id);
CREATE INDEX idx_detalle_venta_venta ON DETALLE_VENTA(venta_id);
CREATE INDEX idx_detalle_venta_producto ON DETALLE_VENTA(producto_id);
CREATE INDEX idx_kardex_producto ON MOVIMIENTO_KARDEX(producto_id);
CREATE INDEX idx_kardex_usuario ON MOVIMIENTO_KARDEX(usuario_id);

COMMIT;