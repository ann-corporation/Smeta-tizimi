/**
 * Lug'at yig'uvchisi: asosiy `ru.json`/`en.json` + `qism/*.json` bo'laklari.
 *
 * Nega bo'laklar: bir vaqtda bir necha PR yangi matn qo'shganda hammasi `ru.json`/`en.json` oxiriga yozib,
 * har safar birlashtirishda ziddiyat chiqarardi. Endi har yangi ish o'z faylini qo'shadi —
 * `qism/<mavzu>.json`, ko'rinishi: `{ "o'zbekcha kalit": { "ru": "...", "en": "..." } }`.
 * Bir kalit ikki joyda bo'lsa — asosiy lug'at ustun (bo'lak eski tarjimani jim almashtirmaydi).
 */
import ruAsos from './ru.json';
import enAsos from './en.json';

export type Lugat = Record<string, string>;
export type QismLugat = Record<string, { ru: string; en: string }>;

const qismlar = import.meta.glob<QismLugat>('./qism/*.json', { eager: true, import: 'default' });

function yig(): { ru: Lugat; en: Lugat } {
  const ru: Lugat = {};
  const en: Lugat = {};
  for (const fayl of Object.keys(qismlar).sort()) {
    for (const [kalit, tarjima] of Object.entries(qismlar[fayl])) {
      if (tarjima?.ru != null) ru[kalit] = tarjima.ru;
      if (tarjima?.en != null) en[kalit] = tarjima.en;
    }
  }
  return { ru: { ...ru, ...(ruAsos as Lugat) }, en: { ...en, ...(enAsos as Lugat) } };
}

const LUGAT = yig();
export const LUGAT_RU: Lugat = LUGAT.ru;
export const LUGAT_EN: Lugat = LUGAT.en;
