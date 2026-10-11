'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  actualizarProveedor,
  crearProveedor,
  type Proveedor,
  type ProveedorInput,
} from '@/app/actions/proveedores';

type Props = {
  proveedor: Proveedor | null; // null = nuevo
  onClose: () => void;
  onGuardado: (proveedor: Proveedor, esNuevo: boolean) => void;
};

type Errores = Partial<Record<keyof ProveedorInput, string>>;

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validar(v: ProveedorInput): Errores {
  const e: Errores = {};
  if (v.razon_social.trim().length < 3) e.razon_social = 'Mínimo 3 caracteres';
  if (!/^[0-9A-Za-z-]{5,50}$/.test(v.nit.trim())) e.nit = 'NIT inválido (5 a 50 caracteres, sin espacios)';
  if (v.correo?.trim() && !EMAIL_RE.test(v.correo.trim())) e.correo = 'Correo inválido';
  if (v.telefono?.trim() && !/^[0-9+\s()-]{6,30}$/.test(v.telefono.trim())) e.telefono = 'Teléfono inválido';
  return e;
}

export default function ProveedorForm({ proveedor, onClose, onGuardado }: Props) {
  const esNuevo = !proveedor;
  const [valores, setValores] = useState<ProveedorInput>({
    razon_social: proveedor?.razon_social ?? '',
    nit: proveedor?.nit ?? '',
    contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '',
    correo: proveedor?.correo ?? '',
    direccion: proveedor?.direccion ?? '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !guardando && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guardando, onClose]);

  const cambiar = (campo: keyof ProveedorInput, valor: string) => {
    const nuevos = { ...valores, [campo]: valor };
    setValores(nuevos);
    if (tocado) setErrores(validar(nuevos));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTocado(true);
    setErrorServidor(null);
    const errs = validar(valores);
    setErrores(errs);
    if (Object.keys(errs).length) return;

    setGuardando(true);
    const res = esNuevo ? await crearProveedor(valores) : await actualizarProveedor(proveedor!.id, valores);
    setGuardando(false);

    if (!res.ok) {
      // Ubica el error del NIT junto a su campo
      if (/NIT/i.test(res.error)) setErrores((prev) => ({ ...prev, nit: res.error }));
      else setErrorServidor(res.error);
      return;
    }
    onGuardado(res.data, esNuevo);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !guardando && onClose()}
    >
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proveedor</p>
            <h2 className="text-xl font-bold text-slate-900">{esNuevo ? 'Nuevo proveedor' : 'Editar proveedor'}</h2>
          </div>
          <button onClick={onClose} disabled={guardando} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <form onSubmit={enviar} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Razón social" requerido error={errores.razon_social} className="sm:col-span-2">
              <input
                autoFocus
                value={valores.razon_social}
                onChange={(e) => cambiar('razon_social', e.target.value)}
                maxLength={200}
                placeholder="Distribuidora Andina S.R.L."
                className={inputCls}
              />
            </Campo>
            <Campo etiqueta="NIT" requerido error={errores.nit}>
              <input
                value={valores.nit}
                onChange={(e) => cambiar('nit', e.target.value.replace(/\s/g, ''))}
                maxLength={50}
                inputMode="numeric"
                placeholder="1023456789"
                className={inputCls}
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Persona de contacto" error={errores.contacto}>
              <input
                value={valores.contacto ?? ''}
                onChange={(e) => cambiar('contacto', e.target.value)}
                maxLength={150}
                placeholder="Nombre y apellido"
                className={inputCls}
              />
            </Campo>
            <Campo etiqueta="Teléfono" error={errores.telefono}>
              <input
                type="tel"
                value={valores.telefono ?? ''}
                onChange={(e) => cambiar('telefono', e.target.value)}
                maxLength={30}
                placeholder="+591 70000000"
                className={inputCls}
              />
            </Campo>
          </div>

          <Campo etiqueta="Correo electrónico" error={errores.correo}>
            <input
              type="email"
              value={valores.correo ?? ''}
              onChange={(e) => cambiar('correo', e.target.value)}
              maxLength={150}
              placeholder="ventas@proveedor.com"
              className={inputCls}
            />
          </Campo>

          <Campo etiqueta="Dirección" error={errores.direccion}>
            <textarea
              rows={2}
              value={valores.direccion ?? ''}
              onChange={(e) => cambiar('direccion', e.target.value)}
              maxLength={255}
              placeholder="Av. / Calle, número, zona, ciudad"
              className={`${inputCls} resize-none`}
            />
          </Campo>

          {errorServidor && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {errorServidor}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={guardando} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />}
              {esNuevo ? 'Registrar proveedor' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  requerido,
  error,
  className = '',
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {etiqueta} {requerido && <span className="text-red-500">*</span>}
      </span>
      <span className={error ? '[&_input]:border-red-300 [&_textarea]:border-red-300' : ''}>{children}</span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
