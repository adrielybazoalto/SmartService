-- ============================================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS (DISEÑO FÍSICO)
-- PROYECTO: SISTEMA DE GESTIÓN DE SERVICIOS DE SEGURIDAD
-- ============================================================


-- 1. TABLAS INDEPENDIENTES
--    Sin llaves foráneas

-- Tabla: ROL

CREATE TABLE ROL (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion TEXT
);

-- Tabla: MODULO

CREATE TABLE MODULO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

-- Tabla: ACCION

CREATE TABLE ACCION (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

-- Tabla: FUNCION

CREATE TABLE FUNCION (
    id SERIAL PRIMARY KEY,
    modulo_id INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,

    FOREIGN KEY (modulo_id)
        REFERENCES MODULO(id)
        ON DELETE RESTRICT
);

-- Tabla: CLIENTE

CREATE TABLE CLIENTE (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo_cliente VARCHAR(30) NOT NULL,
    razon_social VARCHAR(150),
    documento_identidad VARCHAR(30) UNIQUE,
    correo VARCHAR(100),
    telefono VARCHAR(20),
    telefono_alternativo VARCHAR(20),
    fecha_registro DATE DEFAULT CURRENT_DATE
);

-- Tabla: CATEGORIA_PRODUCTO

CREATE TABLE CATEGORIA_PRODUCTO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT
);

-- Tabla: PRODUCTO

CREATE TABLE PRODUCTO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion_tecnica TEXT,
    unidad_medida VARCHAR(30),
    margen_ganancia NUMERIC(10,2)
        CHECK (margen_ganancia >= 0),
    precio_compra_actual NUMERIC(10,2) NOT NULL
        CHECK (precio_compra_actual >= 0),
    stock_disponible NUMERIC(10,2) DEFAULT 0
        CHECK (stock_disponible >= 0),
    stock_minimo NUMERIC(10,2) DEFAULT 0
        CHECK (stock_minimo >= 0),
    categoria_id INTEGER NOT NULL,

    FOREIGN KEY (categoria_id)
        REFERENCES CATEGORIA_PRODUCTO(id)
        ON DELETE RESTRICT
);

-- Tabla: PROVEEDOR

CREATE TABLE PROVEEDOR (
    id SERIAL PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    nit VARCHAR(30) UNIQUE NOT NULL,
    contacto VARCHAR(100),
    telefono VARCHAR(20),
    correo VARCHAR(100)
);

-- Tabla: SERVICIO

CREATE TABLE SERVICIO (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_hora_base NUMERIC(10,2) NOT NULL
        CHECK (precio_hora_base >= 0)
);


-- 2. TABLAS DE NIVEL 1
--    Dependen de las tablas independientes

-- Tabla: ROL_FUNCION
-- Relación entre ROL, FUNCION y ACCION

CREATE TABLE ROL_FUNCION (
    rol_id INTEGER NOT NULL,
    funcion_id INTEGER NOT NULL,
    accion_id INTEGER NOT NULL,
    descripcion TEXT,
	
    PRIMARY KEY (rol_id, funcion_id, accion_id),

    FOREIGN KEY (rol_id)
        REFERENCES ROL(id)
        ON DELETE CASCADE,

    FOREIGN KEY (funcion_id)
        REFERENCES FUNCION(id)
        ON DELETE CASCADE,

    FOREIGN KEY (accion_id)
        REFERENCES ACCION(id)
        ON DELETE CASCADE
);

-- Tabla: USUARIO

CREATE TABLE USUARIO (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    estado BOOLEAN DEFAULT TRUE,

    FOREIGN KEY (rol_id)
        REFERENCES ROL(id)
        ON DELETE RESTRICT
);

-- Tabla: ESTABLECIMIENTO

CREATE TABLE ESTABLECIMIENTO (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    nombre_establecimiento VARCHAR(150) NOT NULL,
    direccion TEXT,
    tipo_inmueble VARCHAR(50),
    latitud NUMERIC(10,7),
    longitud NUMERIC(10,7),

    FOREIGN KEY (cliente_id)
        REFERENCES CLIENTE(id)
        ON DELETE CASCADE
);

-- Tabla: PROVEEDOR - PRODUCTO
-- Relación muchos a muchos

CREATE TABLE PRODUCTO_PROVEEDOR (
    producto_id INTEGER NOT NULL,
    proveedor_id INTEGER NOT NULL,
    precio_compra NUMERIC(10,2) NOT NULL
        CHECK (precio_compra >= 0),
    codigo_item_proveedor VARCHAR(100),

    PRIMARY KEY (producto_id, proveedor_id),

    FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE CASCADE,

    FOREIGN KEY (proveedor_id)
        REFERENCES PROVEEDOR(id)
        ON DELETE CASCADE
);

-- Tabla: SISTEMA_INSTALADO

CREATE TABLE SISTEMA_INSTALADO (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER,
    establecimiento_id INTEGER NOT NULL,
    nombre_sistema VARCHAR(150) NOT NULL,
    fecha_instalacion DATE,
    numero_serie VARCHAR(100),
    periodicidad_meses INTEGER DEFAULT 6
        CHECK (periodicidad_meses > 0),
    fecha_ultimo_mantenimiento DATE,
    fecha_proximo_mantenimiento DATE,
    observaciones TEXT,

    FOREIGN KEY (establecimiento_id)
        REFERENCES ESTABLECIMIENTO(id)
        ON DELETE CASCADE
);


-- 3. TABLAS DE NIVEL 2
--    Procesos principales del sistema

-- Tabla: BITACORA

CREATE TABLE BITACORA (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accion VARCHAR(100) NOT NULL,
    descripcion TEXT,

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
);

-- Tabla: TOKEN_RECUPERACION

CREATE TABLE TOKEN_RECUPERACION (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    token VARCHAR(255) NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TIMESTAMP NOT NULL,
    usado BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
);

-- Tabla: MOVIMIENTO_KARDEX

CREATE TABLE MOVIMIENTO_KARDEX (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo_movimiento VARCHAR(20) NOT NULL,
    cantidad NUMERIC(10,2) NOT NULL
        CHECK (cantidad > 0),
    stock_anterior NUMERIC(10,2) NOT NULL
        CHECK (stock_anterior >= 0),
    origen_movimiento VARCHAR(100),
    fecha_movimiento TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
    observacion TEXT,
    CHECK (
        tipo_movimiento IN
        ('ENTRADA', 'SALIDA', 'AJUSTE')
    ),

    FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
);

-- Tabla: COTIZACION

CREATE TABLE COTIZACION (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    establecimiento_id INTEGER,
    usuario_id INTEGER NOT NULL,
    numero_cotizacion VARCHAR(50) UNIQUE NOT NULL,
    fecha_emision DATE DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(30) DEFAULT 'PENDIENTE',
    total NUMERIC(12,2) DEFAULT 0
        CHECK (total >= 0),
    CHECK (
        estado IN
        ('PENDIENTE', 'APROBADA', 'RECHAZADA')
    ),

    FOREIGN KEY (cliente_id)
        REFERENCES CLIENTE(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (establecimiento_id)
        REFERENCES ESTABLECIMIENTO(id)
        ON DELETE SET NULL,

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
);

-- Tabla: DETALLE_COTIZACION_PRODUCTO

CREATE TABLE DETALLE_COTIZACION_PRODUCTO (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad NUMERIC(10,2) NOT NULL
        CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL
        CHECK (precio_unitario >= 0),
    subtotal NUMERIC(12,2) NOT NULL
        CHECK (subtotal >= 0),

    FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE CASCADE,

    FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT
);

-- Tabla: DETALLE_COTIZACION_SERVICIO

CREATE TABLE DETALLE_COTIZACION_SERVICIO (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER NOT NULL,
    servicio_id INTEGER NOT NULL,
    horas_estimadas NUMERIC(10,2) NOT NULL
        CHECK (horas_estimadas > 0),
    precio_hora NUMERIC(10,2) NOT NULL
        CHECK (precio_hora >= 0),
    subtotal NUMERIC(12,2) NOT NULL
        CHECK (subtotal >= 0),

    FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE CASCADE,

    FOREIGN KEY (servicio_id)
        REFERENCES SERVICIO(id)
        ON DELETE RESTRICT
);

-- Tabla: ORDEN_TRABAJO

CREATE TABLE ORDEN_TRABAJO (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER,
    codigo_orden VARCHAR(50) UNIQUE NOT NULL,
    tipo_trabajo VARCHAR(100) NOT NULL,
    estado VARCHAR(30) DEFAULT 'PROGRAMADA',
    fecha_programada DATE,
    fecha_inicio_real TIMESTAMP,
    horas_fin_real NUMERIC(10,2),
    observaciones_tecnico TEXT,

    FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE SET NULL
);

-- Tabla: ORDEN_TRABAJO_TECNICO
-- Relación entre órdenes y técnicos

CREATE TABLE ORDEN_TRABAJO_TECNICO (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    es_lider BOOLEAN DEFAULT FALSE,
    UNIQUE (orden_trabajo_id, usuario_id),

    FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE CASCADE,

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
);

-- Tabla: CARGA_HORARIA_TECNICO

CREATE TABLE CARGA_HORARIA_TECNICO (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    dia_semana VARCHAR(20) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    CHECK (hora_fin > hora_inicio),

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
);

-- Tabla: BLOQUEO_TECNICO

CREATE TABLE BLOQUEO_TECNICO (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_fin TIMESTAMP NOT NULL,
    motivo VARCHAR(255),
    tipo VARCHAR(50),
    CHECK (fecha_fin > fecha_inicio),

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE CASCADE
);

-- Tabla: DETALLE_CONSUMO_MATERIAL

CREATE TABLE DETALLE_CONSUMO_MATERIAL (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad_utilizada NUMERIC(10,2) NOT NULL
        CHECK (cantidad_utilizada > 0),
    observacion TEXT,
    fecha_registro TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE CASCADE,

    FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT
);

-- Tabla: NOTA_SERVICIO

CREATE TABLE NOTA_SERVICIO (
    id SERIAL PRIMARY KEY,
    orden_trabajo_id INTEGER NOT NULL,
    numero_nota VARCHAR(50) UNIQUE NOT NULL,
    anticipo_pagado NUMERIC(12,2) DEFAULT 0
        CHECK (anticipo_pagado >= 0),
    fecha_emision DATE DEFAULT CURRENT_DATE,
    estado VARCHAR(30) DEFAULT 'PENDIENTE',
    monto_total NUMERIC(12,2) NOT NULL
        CHECK (monto_total >= 0),

    FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE CASCADE
);

-- Tabla: MANTENIMIENTO_TICKET

CREATE TABLE MANTENIMIENTO_TICKET (
    id SERIAL PRIMARY KEY,
    sistema_instalado_id INTEGER NOT NULL,
    orden_trabajo_id INTEGER,
    tipo_mantenimiento VARCHAR(30) NOT NULL,
    nivel_urgencia VARCHAR(30),
    descripcion_incidencia TEXT NOT NULL,
    fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(30) DEFAULT 'ABIERTO',
    CHECK (
        tipo_mantenimiento IN
        ('PREVENTIVO', 'CORRECTIVO')
    ),

    FOREIGN KEY (sistema_instalado_id)
        REFERENCES SISTEMA_INSTALADO(id)
        ON DELETE CASCADE,

    FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE SET NULL
);

-- Tabla: ALERTA_NOTIFICACION

CREATE TABLE ALERTA_NOTIFICACION (
    id SERIAL PRIMARY KEY,
    sistema_instalado_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    fecha_alerta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leido BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (sistema_instalado_id)
        REFERENCES SISTEMA_INSTALADO(id)
        ON DELETE CASCADE
);

--    Ventas y facturación

-- Tabla: CAJA

CREATE TABLE CAJA (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP,
    monto_inicial NUMERIC(12,2) NOT NULL
        CHECK (monto_inicial >= 0),
    monto_final_sistema NUMERIC(12,2)
        CHECK (monto_final_sistema >= 0),
    monto_final_real NUMERIC(12,2)
        CHECK (monto_final_real >= 0),
    estado VARCHAR(30) DEFAULT 'ABIERTA',

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT
);

-- Tabla: VENTA

CREATE TABLE VENTA (
    id SERIAL PRIMARY KEY,
    caja_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    cotizacion_id INTEGER,
    orden_trabajo_id INTEGER,
    tipo_comprobante VARCHAR(50),
    nro_comprobante VARCHAR(50),
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal NUMERIC(12,2) NOT NULL
        CHECK (subtotal >= 0),
    descuento NUMERIC(12,2) DEFAULT 0
        CHECK (descuento >= 0),
    total NUMERIC(12,2) NOT NULL
        CHECK (total >= 0),
    estado VARCHAR(30) DEFAULT 'EMITIDA',

    FOREIGN KEY (caja_id)
        REFERENCES CAJA(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (cliente_id)
        REFERENCES CLIENTE(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (usuario_id)
        REFERENCES USUARIO(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (cotizacion_id)
        REFERENCES COTIZACION(id)
        ON DELETE SET NULL,

    FOREIGN KEY (orden_trabajo_id)
        REFERENCES ORDEN_TRABAJO(id)
        ON DELETE SET NULL
);

-- Tabla: DETALLE_VENTA

CREATE TABLE DETALLE_VENTA (
    id SERIAL PRIMARY KEY,
    venta_id INTEGER NOT NULL,
    producto_id INTEGER,
    servicio_id INTEGER,
    cantidad NUMERIC(10,2) NOT NULL
        CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL
        CHECK (precio_unitario >= 0),
    subtotal NUMERIC(12,2) NOT NULL
        CHECK (subtotal >= 0),

    -- Cada detalle debe corresponder a PRODUCTO
    -- o a SERVICIO, pero no a ambos.
    CHECK (
        (producto_id IS NOT NULL AND servicio_id IS NULL)
        OR
        (producto_id IS NULL AND servicio_id IS NOT NULL)
    ),

    FOREIGN KEY (venta_id)
        REFERENCES VENTA(id)
        ON DELETE CASCADE,

    FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (servicio_id)
        REFERENCES SERVICIO(id)
        ON DELETE RESTRICT
);

-- Tabla: IMAGEN_PRODUCTO

CREATE TABLE IMAGEN_PRODUCTO (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    url_imagen TEXT NOT NULL,
    es_principal BOOLEAN DEFAULT FALSE,
    orden INTEGER DEFAULT 1,

    FOREIGN KEY (producto_id)
        REFERENCES PRODUCTO(id)
        ON DELETE CASCADE
);

-- 5. RESTRICCIONES ADICIONALES

-- Evitar nombres de rol repetidos
ALTER TABLE ROL
ADD CONSTRAINT uq_rol_nombre
UNIQUE (nombre);


-- Evitar nombres de módulos repetidos
ALTER TABLE MODULO
ADD CONSTRAINT uq_modulo_nombre
UNIQUE (nombre);


-- Evitar nombres de acciones repetidas
ALTER TABLE ACCION
ADD CONSTRAINT uq_accion_nombre
UNIQUE (nombre);


-- Evitar nombres de categorías repetidos
ALTER TABLE CATEGORIA_PRODUCTO
ADD CONSTRAINT uq_categoria_nombre
UNIQUE (nombre);


-- Evitar números de serie repetidos
ALTER TABLE SISTEMA_INSTALADO
ADD CONSTRAINT uq_sistema_numero_serie
UNIQUE (numero_serie);


-- Evitar códigos de proveedor repetidos
ALTER TABLE PRODUCTO_PROVEEDOR
ADD CONSTRAINT uq_codigo_item_proveedor
UNIQUE (proveedor_id, codigo_item_proveedor);

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================