import Link from 'next/link'
import { listarProductosCompraAction, listarProveedoresCompraAction } from '@/app/actions/compras'
import { fechaHoyNegocio } from '@/backend/compras/reglas'
import { obtenerCapacidadesCompras } from '../acceso'
import { InsigniaCU15 } from '../componentes'
import { FormularioCompra } from './formulario-compra'

export const metadata = {
  title: 'Registrar compra — SmartService',
}

/**
 * CU15 — Registrar compra. El layout ya exige LEER; aquí se exige además
 * CREAR para mostrar el formulario (registrarCompraAction lo vuelve a exigir
 * en el servidor y fn_registrar_compra en la BD).
 */
export default async function NuevaCompraPage() {
  const { registrar } = await obtenerCapacidadesCompras()

  const [proveedores, productos] = registrar
    ? await Promise.all([listarProveedoresCompraAction(), listarProductosCompraAction()])
    : [null, null]

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Link href="/compras" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Volver a compras
        </Link>
      </div>

      <header className="tarjeta flex flex-col gap-1.5 p-5 sm:p-6">
        <InsigniaCU15 />
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Registrar compra</h1>
        <p className="text-sm text-slate-500">
          Registre la factura o nota del proveedor con los productos recibidos. Los campos con <span className="text-rose-500">*</span> son
          obligatorios.
        </p>
      </header>

      {!registrar ? (
        <p role="alert" className="mensaje-error">
          ⚠ Tu rol no tiene permiso para registrar compras. Solo puedes consultar el listado.
        </p>
      ) : !proveedores?.ok ? (
        <p role="alert" className="mensaje-error">
          ⚠ {proveedores?.mensaje ?? 'No se pudieron cargar los proveedores.'}
        </p>
      ) : (
        <FormularioCompra
          proveedores={proveedores.data}
          productosIniciales={productos?.ok ? productos.data : []}
          errorProductosInicial={productos && !productos.ok ? productos.mensaje : null}
          hoy={fechaHoyNegocio()}
        />
      )}
    </main>
  )
}
