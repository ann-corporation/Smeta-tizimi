/** Resurs kategoriyasi nishoni (ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ/БЕЗСКЛАД) — rangli, bir xil ko'rinish uchun yagona joy. */
const KAT_RANG: Record<string, string> = {
  ЧЕЛ: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  МАШ: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  МАТ: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ОБ: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

function katRang(kat: string | null | undefined): string {
  return KAT_RANG[String(kat ?? '').trim().toUpperCase()] ?? 'bg-surface-2 text-text-dim';
}

export function KatNishon({ kat, className = '' }: { kat: string | null | undefined; className?: string }) {
  const k = String(kat ?? '').trim();
  if (!k) return null;
  return <span className={`inline-flex shrink-0 items-center rounded px-1 font-mono text-[10px] font-semibold leading-4 ${katRang(k)} ${className}`} data-testid="kat-nishon">{k}</span>;
}
