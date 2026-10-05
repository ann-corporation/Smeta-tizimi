/**
 * Tomon (zakazchik ↔ pudratchi …) sahifalari uchun umumiy UI komponentlari. Komponent bo'lmagan yordamchilar —
 * tomon-yordam.ts. Hamma matn t() orqali; ruxsat serverda — bu yerda faqat ko'rinish.
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n/til';
import type { AloqaHolat, TaqdimHolat } from '../../api/t2-tomon';

const ALOQA_NOMI: Record<AloqaHolat, string> = {
  taklif: 'Taklif (javob kutilmoqda)', faol: 'Faol', toxtatilgan: 'To‘xtatilgan', yopilgan: 'Yopilgan', rad: 'Rad etilgan', bekor: 'Bekor qilingan',
};
const TAQDIM_NOMI: Record<TaqdimHolat, string> = {
  yuborilgan: 'Yuborilgan', ko_rilmoqda: 'Ko‘rib chiqilmoqda', qabul: 'Qabul qilingan', rad: 'Rad etilgan', tuzatish: 'Tuzatish so‘ralgan', qaytarilgan: 'Qaytarib olingan',
};
const RANG: Record<string, string> = {
  faol: 'bg-ok/15 text-ok', qabul: 'bg-ok/15 text-ok',
  taklif: 'bg-warn/15 text-warn', yuborilgan: 'bg-warn/15 text-warn', ko_rilmoqda: 'bg-accent/15 text-accent', tuzatish: 'bg-warn/15 text-warn', toxtatilgan: 'bg-warn/15 text-warn',
  rad: 'bg-danger/15 text-danger', yopilgan: 'bg-surface-2 text-text-dim', bekor: 'bg-surface-2 text-text-dim', qaytarilgan: 'bg-surface-2 text-text-dim',
};

export function HolatBelgi({ holat, turi }: { holat: string; turi: 'aloqa' | 'taqdim' }) {
  const nom = turi === 'aloqa' ? ALOQA_NOMI[holat as AloqaHolat] : TAQDIM_NOMI[holat as TaqdimHolat];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${RANG[holat] ?? 'bg-surface-2 text-text-dim'}`}>{nom ? t(nom) : holat}</span>;
}

export function Bolim({ sarlavha, children, amal }: { sarlavha: string; children: ReactNode; amal?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{t(sarlavha)}</h2>{amal}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
