/**
 * «Modullarim» — foydalanuvchining O'Z tanlagan ilovalari (Telegram modeli). Veb, Android, Windows va Telegram bot BIR XIL
 * server endpointdan (`/api/modullarim`) foydalanadi; kodlar Android katalogi (core/data/Modules.kt) bilan bir xil.
 *
 * Bu faqat KO'RINISH tanlovi: ruxsat berMAYDI. Menyuda sahifa ko'rinishi uchun avval kompaniya ruxsati (navFiltr) o'tishi shart;
 * tanlov uni faqat yana toraytiradi. Hech narsa tanlanmagan (yoki faqat veb katalogida yo'q kodlar) — filtr YO'Q, hamma ko'rinadi.
 * SOF MA'LUMOT (React/tarmoq importi yo'q).
 */

export type ModulTa = {
  kod: string;
  nom: string;
  izoh: string;
  /** Shu modulga tegishli veb sahifa yo'llari (prefiks). */
  yollar: readonly string[];
  /** Doim ko'rinadigan yadro (kompaniya sozlamasi): tanlovdan qat'i nazar yashirilmaydi. */
  doim?: true;
};

export const MODUL_KATALOGI: readonly ModulTa[] = [
  { kod: 'bugun', nom: 'Bugun', izoh: 'Bugungi ishlar va topshiriqlar', yollar: ['/admin/bugun'] },
  { kod: 'obyektlar', nom: 'Obyektlar', izoh: 'Obyektlar ro‘yxati va holati', yollar: ['/admin/obyektlar'] },
  { kod: 'smeta', nom: 'Smeta', izoh: 'Smeta studiyasi', yollar: ['/admin/smeta-studio'] },
  { kod: 'narx', nom: 'Narxlar', izoh: 'Narx katalogi va manbalar', yollar: ['/admin/narxlar'] },
  { kod: 'fakt', nom: 'Fakt', izoh: 'Bajarilgan ish faktini kiritish', yollar: ['/admin/fakt'] },
  { kod: 'foto', nom: 'Foto', izoh: 'Foto dalillar', yollar: ['/admin/foto'] },
  { kod: 'f2', nom: 'F2 tayyorlash', izoh: 'F2 qoralamasi va tasdiq', yollar: ['/admin/f2-tayyorlash', '/admin/f2'] },
  { kod: 'f2reestr', nom: 'F2 reestri', izoh: 'Tasdiqlangan F2 lar', yollar: ['/admin/f2-reestr'] },
  { kod: 'nakop', nom: 'Nakopitelniy', izoh: 'Forma 3 va nakopitelniy', yollar: ['/admin/nakopitelniy'] },
  { kod: 'moliya', nom: 'Moliya', izoh: 'To‘lov, xarajat, shartnoma', yollar: ['/admin/moliya'] },
  { kod: 'buxgalteriya', nom: 'Buxgalteriya', izoh: 'Provodka jurnali va hisobotlar', yollar: ['/admin/buxgalteriya'] },
  { kod: 'hujjat', nom: 'Hujjat aylanishi', izoh: 'Hujjatlar va tomonlar', yollar: ['/admin/hujjat-aylanish'] },
  { kod: 'aosr', nom: 'АОСР', izoh: 'Yashirin ishlar akti', yollar: ['/admin/aosr'] },
  { kod: 'tender', nom: 'Xarid va tender', izoh: 'Zayavka, tender, birja', yollar: ['/admin/tender', '/admin/zayavka'] },
  { kod: 'logistika', nom: 'Logistika', izoh: 'Ta‘minot, reys, ombor', yollar: ['/admin/logistika'] },
  { kod: 'ombor', nom: 'Ombor', izoh: 'Ombor kirim-chiqimi', yollar: ['/admin/logistika'] },
  { kod: 'hr', nom: 'Kadrlar', izoh: 'Xodimlar, tabel, texnika', yollar: ['/admin/erp', '/admin/hr'] },
  { kod: 'sotuv', nom: 'Uy sotish', izoh: 'Shaxmatka, bron, bitim', yollar: ['/admin/sotuv'] },
  { kod: 'rahbar', nom: 'Rahbar paneli', izoh: 'Rahbar uchun umumiy ko‘rinish', yollar: ['/admin/pult'] },
  { kod: 'hisobot', nom: 'Hisobotlar', izoh: 'Boshqaruv hisobotlari', yollar: ['/admin/dashboard'] },
  { kod: 'kompaniya', nom: 'Kompaniya', izoh: 'A‘zolar va kompaniya sozlamalari', yollar: ['/admin/kompaniya'], doim: true },
];

export const MODUL_MAP: Readonly<Record<string, ModulTa>> = Object.fromEntries(MODUL_KATALOGI.map((m) => [m.kod, m]));

const yolOstimi = (yol: string, asos: string) => yol === asos || yol.startsWith(asos + '/');

/** Katalogdagi HAR QANDAY modulga tegishli yo'l (doim-yadro bundan mustasno). Katalogda yo'q sahifa — umumiy: tanlov unga tegmaydi. */
const TANLANADIGAN_YOLLAR: readonly string[] = MODUL_KATALOGI.filter((m) => !m.doim).flatMap((m) => m.yollar);

/**
 * Tanlov bo'yicha menyu filtri. `null` — filtr yo'q (hech narsa tanlanmagan yoki tanlov faqat veb katalogida yo'q kodlardan iborat).
 * Aks holda: katalogga tegishli sahifa faqat tanlangan modul yo'llaridan biriga mos bo'lsa ko'rinadi; katalogga tegishli bo'lmagan
 * sahifalar (akkaunt, ish joylarim va h.k.) doim ko'rinadi.
 */
export function tanlovFiltr(tanlangan: readonly string[] | null | undefined): ((yol: string) => boolean) | null {
  const veb = (tanlangan ?? []).filter((k) => !!MODUL_MAP[k]);
  if (!veb.length) return null;
  const ochiq = veb.flatMap((k) => MODUL_MAP[k].yollar);
  return (yol) => !TANLANADIGAN_YOLLAR.some((a) => yolOstimi(yol, a)) || ochiq.some((a) => yolOstimi(yol, a));
}

/** Tanlash oynasida ko'rsatiladigan modullar: faqat kamida bitta sahifasi shu foydalanuvchiga (ruxsat bo'yicha) ko'rinadiganlari. */
export function tanlanadiganModullar(korinadiganYollar: readonly string[]): ModulTa[] {
  return MODUL_KATALOGI.filter((m) => !m.doim && m.yollar.some((a) => korinadiganYollar.some((y) => yolOstimi(y, a))));
}

export type Tanlov = { tanlangan: string[]; tartib: string[]; versiya: number };
export const BOSH_TANLOV: Tanlov = { tanlangan: [], tartib: [], versiya: 0 };

/** Modulni tanlovga qo'shadi/olib tashlaydi. Veb katalogida yo'q kodlar (Android ning `jarvis`, `tasdiq`, …) SAQLANADI. */
export function tanlovAlmashtir(t: Tanlov, kod: string): Tanlov {
  const bor = t.tanlangan.includes(kod);
  return bor
    ? { ...t, tanlangan: t.tanlangan.filter((k) => k !== kod) }
    : { ...t, tanlangan: [...t.tanlangan, kod], tartib: t.tartib.includes(kod) ? t.tartib : [...t.tartib, kod] };
}

/** Hamma veb modullarni tanlovdan olib tashlaydi (filtr yo'q → hammasi ko'rinadi); veb bo'lmagan kodlar saqlanadi. */
export function tanlovTozala(t: Tanlov): Tanlov {
  return { ...t, tanlangan: t.tanlangan.filter((k) => !MODUL_MAP[k]) };
}
