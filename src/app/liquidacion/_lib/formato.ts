// Formato de montos y fechas usado por las pantallas y el PDF del CU13.

const moneda = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearBs(monto: number): string {
  return `Bs ${moneda.format(monto)}`;
}

export function formatearFecha(fecha: string | null): string {
  if (!fecha) return "—";
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatearFechaHora(fecha: string | null): string {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ETIQUETAS_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  QR: "QR",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta (Stripe)",
};

export function etiquetaMetodoPago(metodo: string | null | undefined): string {
  return metodo ? ETIQUETAS_PAGO[metodo.toUpperCase()] ?? metodo : "—";
}
