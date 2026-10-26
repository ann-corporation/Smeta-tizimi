/** Resurs kategoriyasi nishoni (ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ/БЕЗСКЛАД) — rangli, bir xil ko'rinish uchun yagona joy. */
/* Firuza: ranglar dizayn tokenlaridan (kat-chel / kat-mash / kat-mat / kat-ob) — dizayn/firuza.css. */
const KAT_RANG: Record<string, string> = {
  ЧЕЛ: 'fz-kat--chel',
  МАШ: 'fz-kat--mash',
  МАТ: 'fz-kat--mat',
  ОБ: 'fz-kat--ob',
};

function katRang(kat: string | null | undefined): string {
  return KAT_RANG[String(kat ?? '').trim().toUpperCase()] ?? '';
}

export function KatNishon({ kat, className = '' }: { kat: string | null | undefined; className?: string }) {
  const k = String(kat ?? '').trim();
  if (!k) return null;
  return <span className={`fz-kat ${katRang(k)} ${className}`} data-testid="kat-nishon">{k}</span>;
}
