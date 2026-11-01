'use client';

// =====================================================================
//  Panel de cobro por TRANSFERENCIA bancaria (lo usan el CU09 y el CU13)
//  Muestra la cuenta de la empresa y el monto exacto. El Encargado revisa
//  en la app del banco que el dinero llegó, escribe el número de referencia
//  del comprobante y confirma. El sistema no se conecta al banco.
//
//  La cuenta se configura en .env.local:
//    NEXT_PUBLIC_COBRO_BANCO, NEXT_PUBLIC_COBRO_CUENTA, NEXT_PUBLIC_COBRO_TITULAR
// =====================================================================

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const CUENTA_COBRO = {
  banco: process.env.NEXT_PUBLIC_COBRO_BANCO || 'Banco (configurar en .env.local)',
  cuenta: process.env.NEXT_PUBLIC_COBRO_CUENTA || '0000-000000 (demostración)',
  titular: process.env.NEXT_PUBLIC_COBRO_TITULAR || 'SgarNet - Seguridad Electrónica',
};

export function PanelTransferencia({
  total,
  referencia,
  onReferencia,
  confirmado,
  onConfirmar,
}: {
  total: number;
  referencia: string;
  onReferencia: (v: string) => void;
  confirmado: boolean;
  onConfirmar: (v: boolean) => void;
}) {
  const falta = referencia.trim() === '';
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
      <p className="font-medium text-slate-600">Monto a transferir</p>
      <p className="text-3xl font-bold text-slate-900">{bs(total)}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-slate-500">Banco</dt>
        <dd className="font-medium">{CUENTA_COBRO.banco}</dd>
        <dt className="text-slate-500">Cuenta</dt>
        <dd className="font-mono font-medium">{CUENTA_COBRO.cuenta}</dd>
        <dt className="text-slate-500">Titular</dt>
        <dd className="font-medium">{CUENTA_COBRO.titular}</dd>
      </dl>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-600">N° de referencia del comprobante *</span>
        <input
          value={referencia}
          onChange={(e) => onReferencia(e.target.value.slice(0, 60))}
          placeholder="Ej.: TRX-458921"
          className={`w-full rounded-lg border bg-white px-3 py-2 font-mono ${falta ? 'border-red-300' : 'border-gray-200'}`}
        />
      </label>
      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2">
        <input
          type="checkbox"
          checked={confirmado}
          disabled={falta}
          onChange={(e) => onConfirmar(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Confirmo que la transferencia de <strong>{bs(total)}</strong> llegó a la cuenta de la empresa
        </span>
      </label>
    </div>
  );
}
