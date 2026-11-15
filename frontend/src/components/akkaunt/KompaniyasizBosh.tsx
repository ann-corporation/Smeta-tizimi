/**
 * KompaniyasizBosh — kompaniyasi yo'q foydalanuvchining foydali bosh ekrani (Telegram modeli: kompaniyasiz ham ishlash mumkin).
 * Xato emas: kelgan takliflar (@username/telefon bo'yicha), profil va @username, kompaniya ochish/qo'shilish (yuqoridagi karta).
 * Modullarim tanlovi kompaniya bilan bog'langan (server kompaniya bo'yicha saqlaydi) — shuning uchun bu yerda faqat eslatma.
 */
import { Link } from 'react-router-dom';
import { AtSign, LayoutGrid, UserRound } from 'lucide-react';
import { t } from '../../i18n/til';
import { KelganTakliflar } from '../username/KelganTakliflar';
import { Karta } from './AkkauntUi';

const PLITKALAR = [
  { yol: '/admin/akkaunt?bolim=profil', nom: 'Profil va @username', izoh: 'Ismingiz va @username — odamlar sizni shu orqali topadi.', Ikon: AtSign },
  { yol: '/admin/akkaunt?bolim=kirish', nom: 'Kirish usullari', izoh: 'Telefon, Telegram, Google va email — bitta hisob.', Ikon: UserRound },
  { yol: '/admin/akkaunt?bolim=modullarim', nom: 'Modullarim', izoh: 'Kompaniyaga qo‘shilgach, kerakli modullarni o‘zingiz tanlaysiz.', Ikon: LayoutGrid },
] as const;

export function KompaniyasizBosh() {
  return (
    <div className="flex flex-col gap-4" data-testid="kompaniyasiz-bosh">
      <KelganTakliflar />
      <Karta sarlavha="Kompaniyasiz ham ishlashingiz mumkin" tavsif="Kompaniya ochish yoki taklif bilan qo‘shilish — yuqoridagi kartada. Hozircha shaxsiy sozlamalaringiz tayyor:">
        <ul className="grid gap-2 m-0 p-0 list-none" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
          {PLITKALAR.map(({ yol, nom, izoh, Ikon }) => (
            <li key={yol}>
              <Link to={yol} className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 no-underline focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
                <Ikon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text">{t(nom)}</span>
                  <span className="block text-[11px] text-text-dim">{t(izoh)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Karta>
    </div>
  );
}