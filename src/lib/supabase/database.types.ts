// ============================================================
// TIPOS GENERADOS MANUALMENTE A PARTIR DE `schema.sql`
// (Servicios de Seguridad) — re-sincronizados con el reset de `schema.sql`
// (auth_uid retirado; `contrasena` = hash bcryptjs NOT NULL; ROL_FUNCION y
// PRODUCTO_PROVEEDOR con `id` serial; DETALLE_VENTA solo producto;
// ORDEN_TRABAJO con mantenimiento_ticket_id y fechas programadas/real)
// NOTA: cuando tengas acceso CLI, regenérate con:
//   supabase gen types typescript --project-id <ref> --schema public
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      rol: {
        Row: { id: number; nombre: string; descripcion: string | null }
        Insert: { id?: number; nombre: string; descripcion?: string | null }
        Update: { id?: number; nombre?: string; descripcion?: string | null }
        Relationships: []
      }
      modulo: {
        Row: { id: number; nombre: string }
        Insert: { id?: number; nombre: string }
        Update: { id?: number; nombre?: string }
        Relationships: []
      }
      accion: {
        Row: { id: number; nombre: string }
        Insert: { id?: number; nombre: string }
        Update: { id?: number; nombre?: string }
        Relationships: []
      }
      funcion: {
        Row: { id: number; nombre: string; descripcion: string | null; modulo_id: number }
        Insert: { id?: number; nombre: string; descripcion?: string | null; modulo_id: number }
        Update: { id?: number; nombre?: string; descripcion?: string | null; modulo_id?: number }
        Relationships: [
          {
            foreignKeyName: 'funcion_modulo_id_fkey'
            columns: ['modulo_id']
            isOneToOne: false
            referencedRelation: 'modulo'
            referencedColumns: ['id']
          },
        ]
      }
      cliente: {
        Row: {
          id: number
          nombre: string
          tipo_cliente: string
          razon_social: string | null
          documento_identidad: string | null
          correo: string | null
          telefono: string | null
          telefono_alternativo: string | null
          fecha_registro: string
        }
        Insert: {
          id?: number
          nombre: string
          tipo_cliente: string
          razon_social?: string | null
          documento_identidad?: string | null
          correo?: string | null
          telefono?: string | null
          telefono_alternativo?: string | null
          fecha_registro?: string
        }
        Update: {
          id?: number
          nombre?: string
          tipo_cliente?: string
          razon_social?: string | null
          documento_identidad?: string | null
          correo?: string | null
          telefono?: string | null
          telefono_alternativo?: string | null
          fecha_registro?: string
        }
        Relationships: []
      }
      categoria_producto: {
        Row: { id: number; nombre: string; descripcion: string | null }
        Insert: { id?: number; nombre: string; descripcion?: string | null }
        Update: { id?: number; nombre?: string; descripcion?: string | null }
        Relationships: []
      }
      producto: {
        Row: {
          id: number
          nombre: string
          descripcion_tecnica: string | null
          unidad_medida: string
          margen_ganancia: string
          precio_compra_actual: string
          stock_disponible: string
          stock_minimo: string
          categoria_id: number
        }
        Insert: {
          id?: number
          nombre: string
          descripcion_tecnica?: string | null
          unidad_medida: string
          margen_ganancia?: string
          precio_compra_actual?: string
          stock_disponible?: string
          stock_minimo?: string
          categoria_id: number
        }
        Update: {
          id?: number
          nombre?: string
          descripcion_tecnica?: string | null
          unidad_medida?: string
          margen_ganancia?: string
          precio_compra_actual?: string
          stock_disponible?: string
          stock_minimo?: string
          categoria_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'producto_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categoria_producto'
            referencedColumns: ['id']
          },
        ]
      }
      proveedor: {
        Row: {
          id: number
          razon_social: string
          nit: string | null
          contacto: string | null
          telefono: string | null
          correo: string | null
        }
        Insert: {
          id?: number
          razon_social: string
          nit?: string | null
          contacto?: string | null
          telefono?: string | null
          correo?: string | null
        }
        Update: {
          id?: number
          razon_social?: string
          nit?: string | null
          contacto?: string | null
          telefono?: string | null
          correo?: string | null
        }
        Relationships: []
      }
      servicio: {
        Row: { id: number; nombre: string; descripcion: string | null; precio_hora_base: string }
        Insert: {
          id?: number
          nombre: string
          descripcion?: string | null
          precio_hora_base: string
        }
        Update: {
          id?: number
          nombre?: string
          descripcion?: string | null
          precio_hora_base?: string
        }
        Relationships: []
      }
      rol_funcion: {
        Row: {
          id: number
          rol_id: number
          funcion_id: number
          accion_id: number
          descripcion: string | null
        }
        Insert: {
          id?: number
          rol_id: number
          funcion_id: number
          accion_id: number
          descripcion?: string | null
        }
        Update: {
          id?: number
          rol_id?: number
          funcion_id?: number
          accion_id?: number
          descripcion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'rol_funcion_rol_id_fkey'
            columns: ['rol_id']
            isOneToOne: false
            referencedRelation: 'rol'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rol_funcion_funcion_id_fkey'
            columns: ['funcion_id']
            isOneToOne: false
            referencedRelation: 'funcion'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rol_funcion_accion_id_fkey'
            columns: ['accion_id']
            isOneToOne: false
            referencedRelation: 'accion'
            referencedColumns: ['id']
          },
        ]
      }
      usuario: {
        Row: {
          id: number
          rol_id: number
          nombre: string
          correo: string
          contrasena: string
          telefono: string | null
          estado: boolean
          version_sesion: number
        }
        Insert: {
          id?: number
          rol_id: number
          nombre: string
          correo: string
          contrasena: string
          telefono?: string | null
          estado?: boolean
          version_sesion?: number
        }
        Update: {
          id?: number
          rol_id?: number
          nombre?: string
          correo?: string
          contrasena?: string
          telefono?: string | null
          estado?: boolean
          version_sesion?: number
        }
        Relationships: [
          {
            foreignKeyName: 'usuario_rol_id_fkey'
            columns: ['rol_id']
            isOneToOne: false
            referencedRelation: 'rol'
            referencedColumns: ['id']
          },
        ]
      }
      establecimiento: {
        Row: {
          id: number
          cliente_id: number
          nombre_establecimiento: string
          direccion: string
          tipo_inmueble: string | null
          latitud: string | null
          longitud: string | null
        }
        Insert: {
          id?: number
          cliente_id: number
          nombre_establecimiento: string
          direccion: string
          tipo_inmueble?: string | null
          latitud?: string | null
          longitud?: string | null
        }
        Update: {
          id?: number
          cliente_id?: number
          nombre_establecimiento?: string
          direccion?: string
          tipo_inmueble?: string | null
          latitud?: string | null
          longitud?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'establecimiento_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'cliente'
            referencedColumns: ['id']
          },
        ]
      }
      producto_proveedor: {
        Row: {
          id: number
          producto_id: number
          proveedor_id: number
          precio_compra: string
          codigo_item_proveedor: string | null
        }
        Insert: {
          id?: number
          producto_id: number
          proveedor_id: number
          precio_compra: string
          codigo_item_proveedor?: string | null
        }
        Update: {
          id?: number
          producto_id?: number
          proveedor_id?: number
          precio_compra?: string
          codigo_item_proveedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'producto_proveedor_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'producto'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'producto_proveedor_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedor'
            referencedColumns: ['id']
          },
        ]
      }
      sistema_instalado: {
        Row: {
          id: number
          orden_trabajo_id: number | null
          establecimiento_id: number
          nombre_sistema: string
          fecha_instalacion: string
          numero_serie: string | null
          periodicidad_meses: number
          fecha_ultimo_mantenimiento: string | null
          fecha_proximo_mantenimiento: string | null
          observaciones: string | null
        }
        Insert: {
          id?: number
          orden_trabajo_id?: number | null
          establecimiento_id: number
          nombre_sistema: string
          fecha_instalacion: string
          numero_serie?: string | null
          periodicidad_meses?: number
          fecha_ultimo_mantenimiento?: string | null
          fecha_proximo_mantenimiento?: string | null
          observaciones?: string | null
        }
        Update: {
          id?: number
          orden_trabajo_id?: number | null
          establecimiento_id?: number
          nombre_sistema?: string
          fecha_instalacion?: string
          numero_serie?: string | null
          periodicidad_meses?: number
          fecha_ultimo_mantenimiento?: string | null
          fecha_proximo_mantenimiento?: string | null
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sistema_instalado_establecimiento_id_fkey'
            columns: ['establecimiento_id']
            isOneToOne: false
            referencedRelation: 'establecimiento'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fk_sistema_orden'
            columns: ['orden_trabajo_id']
            isOneToOne: false
            referencedRelation: 'orden_trabajo'
            referencedColumns: ['id']
          },
        ]
      }
      bitacora: {
        Row: {
          id: number
          usuario_id: number
          fecha_hora: string
          accion: string
          descripcion: string | null
        }
        Insert: {
          id?: number
          usuario_id: number
          fecha_hora?: string
          accion: string
          descripcion?: string | null
        }
        Update: {
          id?: number
          usuario_id?: number
          fecha_hora?: string
          accion?: string
          descripcion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bitacora_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      token_recuperacion: {
        Row: {
          id: number
          usuario_id: number
          hash_token: string
          fecha_creacion: string
          fecha_expiracion: string
          usado: boolean
        }
        Insert: {
          id?: number
          usuario_id: number
          hash_token: string
          fecha_creacion?: string
          fecha_expiracion: string
          usado?: boolean
        }
        Update: {
          id?: number
          usuario_id?: number
          hash_token?: string
          fecha_creacion?: string
          fecha_expiracion?: string
          usado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'token_recuperacion_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      movimiento_kardex: {
        Row: {
          id: number
          producto_id: number
          usuario_id: number
          tipo_movimiento: string
          cantidad: string
          stock_anterior: string
          origen_movimiento: string | null
          fecha_movimiento: string
          observacion: string | null
        }
        Insert: {
          id?: number
          producto_id: number
          usuario_id: number
          tipo_movimiento: string
          cantidad: string
          stock_anterior: string
          origen_movimiento?: string | null
          fecha_movimiento?: string
          observacion?: string | null
        }
        Update: {
          id?: number
          producto_id?: number
          usuario_id?: number
          tipo_movimiento?: string
          cantidad?: string
          stock_anterior?: string
          origen_movimiento?: string | null
          fecha_movimiento?: string
          observacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'movimiento_kardex_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'producto'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimiento_kardex_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      cotizacion: {
        Row: {
          id: number
          cliente_id: number
          establecimiento_id: number | null
          usuario_id: number
          numero_cotizacion: string
          fecha_emision: string
          fecha_vencimiento: string | null
          estado: string
          total: string
        }
        Insert: {
          id?: number
          cliente_id: number
          establecimiento_id?: number | null
          usuario_id: number
          numero_cotizacion: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          estado?: string
          total?: string
        }
        Update: {
          id?: number
          cliente_id?: number
          establecimiento_id?: number | null
          usuario_id?: number
          numero_cotizacion?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          estado?: string
          total?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cotizacion_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'cliente'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cotizacion_establecimiento_id_fkey'
            columns: ['establecimiento_id']
            isOneToOne: false
            referencedRelation: 'establecimiento'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cotizacion_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      detalle_cotizacion_producto: {
        Row: {
          id: number
          cotizacion_id: number
          producto_id: number
          cantidad: string
          precio_unitario: string
          subtotal: string
        }
        Insert: {
          id?: number
          cotizacion_id: number
          producto_id: number
          cantidad: string
          precio_unitario: string
          subtotal: string
        }
        Update: {
          id?: number
          cotizacion_id?: number
          producto_id?: number
          cantidad?: string
          precio_unitario?: string
          subtotal?: string
        }
        Relationships: [
          {
            foreignKeyName: 'detalle_cotizacion_producto_cotizacion_id_fkey'
            columns: ['cotizacion_id']
            isOneToOne: false
            referencedRelation: 'cotizacion'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'detalle_cotizacion_producto_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'producto'
            referencedColumns: ['id']
          },
        ]
      }
      detalle_cotizacion_servicio: {
        Row: {
          id: number
          cotizacion_id: number
          servicio_id: number
          horas_estimadas: string
          precio_hora: string
          subtotal: string
        }
        Insert: {
          id?: number
          cotizacion_id: number
          servicio_id: number
          horas_estimadas: string
          precio_hora: string
          subtotal: string
        }
        Update: {
          id?: number
          cotizacion_id?: number
          servicio_id?: number
          horas_estimadas?: string
          precio_hora?: string
          subtotal?: string
        }
        Relationships: [
          {
            foreignKeyName: 'detalle_cotizacion_servicio_cotizacion_id_fkey'
            columns: ['cotizacion_id']
            isOneToOne: false
            referencedRelation: 'cotizacion'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'detalle_cotizacion_servicio_servicio_id_fkey'
            columns: ['servicio_id']
            isOneToOne: false
            referencedRelation: 'servicio'
            referencedColumns: ['id']
          },
        ]
      }
      orden_trabajo: {
        Row: {
          id: number
          cotizacion_id: number | null
          mantenimiento_ticket_id: number | null
          codigo_orden: string
          tipo_trabajo: string
          estado: string
          fecha_inicio_programada: string | null
          fecha_fin_programada: string | null
          fecha_inicio_real: string | null
          fecha_fin_real: string | null
          observaciones_tecnico: string | null
        }
        Insert: {
          id?: number
          cotizacion_id?: number | null
          mantenimiento_ticket_id?: number | null
          codigo_orden: string
          tipo_trabajo: string
          estado?: string
          fecha_inicio_programada?: string | null
          fecha_fin_programada?: string | null
          fecha_inicio_real?: string | null
          fecha_fin_real?: string | null
          observaciones_tecnico?: string | null
        }
        Update: {
          id?: number
          cotizacion_id?: number | null
          mantenimiento_ticket_id?: number | null
          codigo_orden?: string
          tipo_trabajo?: string
          estado?: string
          fecha_inicio_programada?: string | null
          fecha_fin_programada?: string | null
          fecha_inicio_real?: string | null
          fecha_fin_real?: string | null
          observaciones_tecnico?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'orden_trabajo_cotizacion_id_fkey'
            columns: ['cotizacion_id']
            isOneToOne: false
            referencedRelation: 'cotizacion'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orden_trabajo_mantenimiento_ticket_id_fkey'
            columns: ['mantenimiento_ticket_id']
            isOneToOne: false
            referencedRelation: 'mantenimiento_ticket'
            referencedColumns: ['id']
          },
        ]
      }
      orden_trabajo_tecnico: {
        Row: {
          id: number
          orden_trabajo_id: number
          usuario_id: number
          es_lider: boolean
        }
        Insert: {
          id?: number
          orden_trabajo_id: number
          usuario_id: number
          es_lider?: boolean
        }
        Update: {
          id?: number
          orden_trabajo_id?: number
          usuario_id?: number
          es_lider?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'orden_trabajo_tecnico_orden_trabajo_id_fkey'
            columns: ['orden_trabajo_id']
            isOneToOne: false
            referencedRelation: 'orden_trabajo'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orden_trabajo_tecnico_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      carga_horaria_tecnico: {
        Row: {
          id: number
          usuario_id: number
          dia_semana: string
          hora_inicio: string
          hora_fin: string
          activo: boolean
        }
        Insert: {
          id?: number
          usuario_id: number
          dia_semana: string
          hora_inicio: string
          hora_fin: string
          activo?: boolean
        }
        Update: {
          id?: number
          usuario_id?: number
          dia_semana?: string
          hora_inicio?: string
          hora_fin?: string
          activo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'carga_horaria_tecnico_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      bloqueo_tecnico: {
        Row: {
          id: number
          usuario_id: number
          fecha_inicio: string
          fecha_fin: string
          motivo: string | null
          tipo: string | null
        }
        Insert: {
          id?: number
          usuario_id: number
          fecha_inicio: string
          fecha_fin: string
          motivo?: string | null
          tipo?: string | null
        }
        Update: {
          id?: number
          usuario_id?: number
          fecha_inicio?: string
          fecha_fin?: string
          motivo?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bloqueo_tecnico_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      detalle_consumo_material: {
        Row: {
          id: number
          orden_trabajo_id: number
          producto_id: number
          cantidad_utilizada: string
          observacion: string | null
          fecha_registro: string
        }
        Insert: {
          id?: number
          orden_trabajo_id: number
          producto_id: number
          cantidad_utilizada: string
          observacion?: string | null
          fecha_registro?: string
        }
        Update: {
          id?: number
          orden_trabajo_id?: number
          producto_id?: number
          cantidad_utilizada?: string
          observacion?: string | null
          fecha_registro?: string
        }
        Relationships: [
          {
            foreignKeyName: 'detalle_consumo_material_orden_trabajo_id_fkey'
            columns: ['orden_trabajo_id']
            isOneToOne: false
            referencedRelation: 'orden_trabajo'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'detalle_consumo_material_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'producto'
            referencedColumns: ['id']
          },
        ]
      }
      nota_servicio: {
        Row: {
          id: number
          orden_trabajo_id: number
          numero_nota: string
          anticipo_pagado: string
          fecha_emision: string
          estado: string
          monto_total: string
        }
        Insert: {
          id?: number
          orden_trabajo_id: number
          numero_nota: string
          anticipo_pagado?: string
          fecha_emision?: string
          estado: string
          monto_total: string
        }
        Update: {
          id?: number
          orden_trabajo_id?: number
          numero_nota?: string
          anticipo_pagado?: string
          fecha_emision?: string
          estado?: string
          monto_total?: string
        }
        Relationships: [
          {
            foreignKeyName: 'nota_servicio_orden_trabajo_id_fkey'
            columns: ['orden_trabajo_id']
            isOneToOne: false
            referencedRelation: 'orden_trabajo'
            referencedColumns: ['id']
          },
        ]
      }
      mantenimiento_ticket: {
        Row: {
          id: number
          sistema_instalado_id: number
          tipo_mantenimiento: string
          nivel_urgencia: string | null
          descripcion_incidencia: string
          fecha_reporte: string
          estado: string
        }
        Insert: {
          id?: number
          sistema_instalado_id: number
          tipo_mantenimiento: string
          nivel_urgencia?: string | null
          descripcion_incidencia: string
          fecha_reporte?: string
          estado?: string
        }
        Update: {
          id?: number
          sistema_instalado_id?: number
          tipo_mantenimiento?: string
          nivel_urgencia?: string | null
          descripcion_incidencia?: string
          fecha_reporte?: string
          estado?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mantenimiento_ticket_sistema_instalado_id_fkey'
            columns: ['sistema_instalado_id']
            isOneToOne: false
            referencedRelation: 'sistema_instalado'
            referencedColumns: ['id']
          },
        ]
      }
      alerta_notificacion: {
        Row: {
          id: number
          sistema_instalado_id: number
          mensaje: string
          fecha_alerta: string
          leido: boolean
        }
        Insert: {
          id?: number
          sistema_instalado_id: number
          mensaje: string
          fecha_alerta?: string
          leido?: boolean
        }
        Update: {
          id?: number
          sistema_instalado_id?: number
          mensaje?: string
          fecha_alerta?: string
          leido?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'alerta_notificacion_sistema_instalado_id_fkey'
            columns: ['sistema_instalado_id']
            isOneToOne: false
            referencedRelation: 'sistema_instalado'
            referencedColumns: ['id']
          },
        ]
      }
      caja: {
        Row: {
          id: number
          usuario_id: number
          fecha_apertura: string
          fecha_cierre: string | null
          monto_inicial: string
          monto_final_sistema: string | null
          monto_final_real: string | null
          estado: string
        }
        Insert: {
          id?: number
          usuario_id: number
          fecha_apertura?: string
          fecha_cierre?: string | null
          monto_inicial?: string
          monto_final_sistema?: string | null
          monto_final_real?: string | null
          estado?: string
        }
        Update: {
          id?: number
          usuario_id?: number
          fecha_apertura?: string
          fecha_cierre?: string | null
          monto_inicial?: string
          monto_final_sistema?: string | null
          monto_final_real?: string | null
          estado?: string
        }
        Relationships: [
          {
            foreignKeyName: 'caja_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
        ]
      }
      venta: {
        Row: {
          id: number
          caja_id: number
          cliente_id: number
          usuario_id: number
          cotizacion_id: number | null
          orden_trabajo_id: number | null
          tipo_comprobante: string
          nro_comprobante: string | null
          fecha_emision: string
          subtotal: string
          descuento: string
          total: string
          estado: string
        }
        Insert: {
          id?: number
          caja_id: number
          cliente_id: number
          usuario_id: number
          cotizacion_id?: number | null
          orden_trabajo_id?: number | null
          tipo_comprobante: string
          nro_comprobante?: string | null
          fecha_emision?: string
          subtotal: string
          descuento?: string
          total: string
          estado?: string
        }
        Update: {
          id?: number
          caja_id?: number
          cliente_id?: number
          usuario_id?: number
          cotizacion_id?: number | null
          orden_trabajo_id?: number | null
          tipo_comprobante?: string
          nro_comprobante?: string | null
          fecha_emision?: string
          subtotal?: string
          descuento?: string
          total?: string
          estado?: string
        }
        Relationships: [
          {
            foreignKeyName: 'venta_caja_id_fkey'
            columns: ['caja_id']
            isOneToOne: false
            referencedRelation: 'caja'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'cliente'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'usuario'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_cotizacion_id_fkey'
            columns: ['cotizacion_id']
            isOneToOne: false
            referencedRelation: 'cotizacion'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_orden_trabajo_id_fkey'
            columns: ['orden_trabajo_id']
            isOneToOne: false
            referencedRelation: 'orden_trabajo'
            referencedColumns: ['id']
          },
        ]
      }
      detalle_venta: {
        Row: {
          id: number
          venta_id: number
          producto_id: number
          cantidad: string
          precio_unitario: string
          subtotal: string
        }
        Insert: {
          id?: number
          venta_id: number
          producto_id: number
          cantidad: string
          precio_unitario: string
          subtotal: string
        }
        Update: {
          id?: number
          venta_id?: number
          producto_id?: number
          cantidad?: string
          precio_unitario?: string
          subtotal?: string
        }
        Relationships: [
          {
            foreignKeyName: 'detalle_venta_venta_id_fkey'
            columns: ['venta_id']
            isOneToOne: false
            referencedRelation: 'venta'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'detalle_venta_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'producto'
            referencedColumns: ['id']
          },
        ]
      }
      imagen_producto: {
        Row: {
          id: number
          producto_id: number
          url_imagen: string
          es_principal: boolean
          orden: number
        }
        Insert: {
          id?: number
          producto_id: number
          url_imagen: string
          es_principal?: boolean
          orden?: number
        }
        Update: {
          id?: number
          producto_id?: number
          url_imagen?: string
          es_principal?: boolean
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: 'imagen_producto_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'producto'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}