'use client';

// =====================================================================
//  Panel de cobro por QR (lo usan el CU09 y el CU13)
//  Muestra el QR del negocio (public/qr-cobro.png, el que entrega el banco)
//  y el monto exacto. El Encargado confirma cuando ve el pago acreditado
//  en la app del banco: el sistema no se conecta al banco.
// =====================================================================

import { useEffect, useState } from 'react';

const QR_COBRO_NEGOCIO = '/qr-cobro.png';

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cobro por QR: muestra el QR y el monto a pagar. El cajero confirma cuando
 * ve el pago acreditado en la app del banco; recién entonces se registra la venta.
 */
export function PanelQr({
  total,
  confirmado,
  onConfirmar,
}: {
  total: number;
  confirmado: boolean;
  onConfirmar: (v: boolean) => void;
}) {
  const [usarImagenNegocio, setUsarImagenNegocio] = useState(true);
  const [qrGenerado, setQrGenerado] = useState<string | null>(null);
  const monto = total.toFixed(2);

  // QR con los datos del cobro (se usa si no existe public/qr-cobro.png)
  useEffect(() => {
    if (usarImagenNegocio) return;
    let vigente = true;
    const contenido = `SmartService | Cobro por QR | Monto: Bs ${monto} | ${new Date().toLocaleString('es-BO')}`;
    import('qrcode')
      .then((m) => ((m as any).default ?? m).toDataURL(contenido, { width: 260, margin: 1 }) as Promise<string>)
      .then((url) => vigente && setQrGenerado(url))
      .catch(() => vigente && setQrGenerado(null));
    return () => {
      vigente = false;
    };
  }, [usarImagenNegocio, monto]);

  return (
    <div className="rounded-xl border border-[#8cd600]/50 bg-[#8cd600]/5 p-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2">
          {usarImagenNegocio ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={QR_COBRO_NEGOCIO}
              alt="QR de cobro del negocio"
              className="h-full w-full object-contain"
              onError={() => setUsarImagenNegocio(false)}
            />
          ) : qrGenerado ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrGenerado} alt={`QR de cobro por Bs ${monto}`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-slate-400">Generando QR…</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-medium text-slate-600">Monto a pagar por QR</p>
          <p className="text-3xl font-bold text-slate-900">{bs(total)}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-left text-xs text-slate-500">
            <li>El cliente escanea el QR con la app de su banco.</li>
            <li>Paga exactamente {bs(total)}.</li>
            <li>Verifique el pago acreditado en la app del negocio y confírmelo aquí.</li>
          </ol>
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => onConfirmar(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#8cd600]"
            />
            <span>
              Confirmo que recibí el pago por QR de <strong>{bs(total)}</strong>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
