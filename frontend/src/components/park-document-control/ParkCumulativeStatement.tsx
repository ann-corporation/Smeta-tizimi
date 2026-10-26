import type { ParkCalculationResult } from '../../lib/park-document-control';

const money = (amount: number | null, currency: string) => amount === null ? 'Aniqlanmagan' : new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 2 }).format(amount) + ` ${currency}`;

/** Read-only two-panel F2/nakopitelniy view. Parent supplies canonical data. */
export function ParkCumulativeStatement({ result }: { result: ParkCalculationResult }) {
  return <section aria-label="F2 nakopitelniy hisobi" className="grid gap-4 lg:grid-cols-2">
    <div className="rounded-xl border border-border bg-surface-2 p-4"><p className="text-xs text-text-mute">OLDINGI · JORIY · NAKOPITELNIY</p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm"><div><dt className="text-text-mute">Oldingi</dt><dd>{money(result.previousEstimateValue, result.currency)}</dd></div><div><dt className="text-text-mute">Joriy F2</dt><dd>{money(result.currentEstimateValue, result.currency)}</dd></div><div><dt className="text-text-mute">Nakopitelniy</dt><dd className="font-semibold text-ok">{money(result.cumulativeEstimateValue, result.currency)}</dd></div></dl>
      <p className="mt-3 text-xs text-text-mute">Qolgan tasdiqlangan qiymat: <b className="text-text">{money(result.remainingEstimateValue, result.currency)}</b></p></div>
    <div className="rounded-xl border border-border bg-surface-2 p-4"><p className="text-xs text-text-mute">NARX ASOSLARI AJRATILGAN</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-text-mute">Real ijro/material</dt><dd>{money(result.actualValue, result.currency)}</dd></div><div><dt className="text-text-mute">Narx farqi</dt><dd className={result.priceVariance && result.priceVariance > 0 ? 'text-warn' : 'text-ok'}>{money(result.priceVariance, result.currency)}</dd></div></dl>
      <p className="mt-3 text-xs text-text-mute">Real narx estimate/reference narxni o‘zgartirmaydi. Hujjat farqi har davr kesimida alohida ko‘rsatiladi.</p></div>
  </section>;
}
