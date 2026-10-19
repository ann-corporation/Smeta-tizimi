import { moneyMinor, moneyText } from './model';

export type PricePolicy = {
  /** Итоговая договорная цена за единицу или этап. Валюта не угадывается. */
  amount: string | null; currency: string;
  vat: 'included' | 'excluded' | 'exempt' | null; vatPercent: string | null;
  markup: 'included' | 'excluded' | null; markupPercent: string | null;
  /** Для валютной цены курс UZS за одну единицу валюты, с датой и документом. */
  exchange: { rate: string; date: string; reference: string } | null;
  reference: string;
};
const SCALE = 1_000_000n;
function decimal(v: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(v)) throw new Error('DECIMAL_INVALID');
  const [whole, fraction = ''] = v.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}
function round(n: bigint, d: bigint): bigint { return (n + d / 2n) / d; }

export type ContractClosure =
  | { mode: 'unit'; planned: string; previous: string; current: string }
  | { mode: 'milestone'; planned: string; previous: string; current: string }
  | { mode: 'amount'; planned: string; previous: string; current: string };

/** Отдельный расчёт договора; не подменяет сертифицированную стоимость исторического Ф2.
 * Суммовое закрытие — денежное освоение, не физический процент. */
export function valueContractClosure(policy: PricePolicy, closure: ContractClosure) {
  const blockers: string[] = [];
  if (!policy.reference.trim()) blockers.push('PRICE_EVIDENCE_REQUIRED');
  if (policy.amount == null && closure.mode !== 'amount') blockers.push('PRICE_UNKNOWN');
  if (!policy.vat) blockers.push('VAT_UNKNOWN');
  if (!policy.markup) blockers.push('MARKUP_UNKNOWN');
  if (!/^[A-Z]{3}$/.test(policy.currency)) blockers.push('CURRENCY_INVALID');
  const planned = decimal(closure.planned), prev = decimal(closure.previous), current = decimal(closure.current);
  if (planned <= 0n) blockers.push('PLAN_REQUIRED');
  if (prev + current > planned) blockers.push('OVER_PLAN');
  // Этапы закрываются как самостоятельные единицы, частичное закрытие оформляется отдельными этапами.
  if (closure.mode === 'milestone' && (planned % SCALE || prev % SCALE || current % SCALE)) blockers.push('MILESTONE_MUST_BE_WHOLE');
  const exchangeDate = policy.exchange?.date;
  const validDate = exchangeDate != null && /^\d{4}-\d{2}-\d{2}$/.test(exchangeDate) &&
    Number.isFinite(Date.parse(`${exchangeDate}T00:00:00Z`)) && new Date(`${exchangeDate}T00:00:00Z`).toISOString().slice(0, 10) === exchangeDate;
  if (policy.currency !== 'UZS' && (!policy.exchange || !policy.exchange.reference.trim() || !validDate)) blockers.push('EXCHANGE_EVIDENCE_REQUIRED');
  if (policy.vat === 'excluded' && policy.vatPercent == null) blockers.push('VAT_RATE_REQUIRED');
  if (policy.markup === 'excluded' && policy.markupPercent == null) blockers.push('MARKUP_RATE_REQUIRED');
  if (blockers.length) return { ok: false as const, blockers };
  let amount: bigint;
  if (closure.mode === 'amount') {
    // Денежное закрытие: current — сумма в валюте договора, price не участвует.
    amount = moneyMinor(closure.current);
  } else {
    const price = moneyMinor(policy.amount!);
    if (price < 0n) return { ok: false as const, blockers: ['PRICE_NEGATIVE'] };
    amount = round(price * current, SCALE);
  }
  if (policy.currency !== 'UZS') {
    const rate = decimal(policy.exchange!.rate);
    if (rate <= 0n) return { ok: false as const, blockers: ['EXCHANGE_RATE_REQUIRED'] };
    amount = round(amount * rate, SCALE);
  }
  const base = amount;
  // Правило договора задаётся явно; проценты применяются поэтапно, каждый этап до тиына.
  const markup = policy.markup === 'excluded' ? round(base * decimal(policy.markupPercent!), 100n * SCALE) : 0n;
  const beforeVat = base + markup;
  const vat = policy.vat === 'excluded' ? round(beforeVat * decimal(policy.vatPercent!), 100n * SCALE) : 0n;
  return { ok: true as const, base: moneyText(base), addedMarkup: moneyText(markup), addedVat: moneyText(vat), payable: moneyText(beforeVat + vat),
    /** Финансовый % нельзя выдавать за строительную готовность. */
    progressKind: closure.mode === 'amount' ? 'financial' as const : closure.mode === 'milestone' ? 'accepted_milestones' as const : 'quantity' as const,
    progressPercent: planned ? String(Number((prev + current) * 10000n / planned) / 100) : null,
  };
}
