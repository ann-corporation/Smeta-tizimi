import type { NavIkonka } from './sahifa';
/**
 * ISH JOYLARI (ekotizim V2 §2): 7 ta yopiq ish joyi + `sotuv` (faqat modul yoqilganda) + `platforma` (faqat superadmin, menyuda emas).
 * Sof ma'lumot (React yo'q).
 */
export const ISH_JOYLARI = ['bugun', 'obyekt', 'hujjatlar', 'taminot', 'moliya', 'tomonlar', 'kompaniya', 'sotuv', 'platforma'] as const;
export type IshJoyi = (typeof ISH_JOYLARI)[number];

/** Menyuda ko'rinadigan 7 asosiy ish joyi (sotuv — modulga bog'liq, platforma — menyuda yo'q). */
export const ASOSIY_ISH_JOYLARI: readonly IshJoyi[] = ['bugun', 'obyekt', 'hujjatlar', 'taminot', 'moliya', 'tomonlar', 'kompaniya'];

/** Ish joyi menyu ma'lumoti: nom, ikonka (NavIkonka kaliti), bir qatorli tavsif va sidebar tartibi. «Bugun» — rol bosh sahifasi. */
export type IshJoyiMeta = { nom: string; ikonka: NavIkonka; tavsif: string; tartib: number; sinonimlar: readonly string[];
  /** Ommaviy mahsulot (Bozor, Tender, Yuk tashish): o'z ommaviy manzili (login'siz) bor; admin menyuda — a'zolar uchun kirish nuqtasi. Faqat ma'lumot, kod o'zgarmaydi. */
  ommaviy?: { yol: string };
};

export const ISH_JOYI_META: Readonly<Record<IshJoyi, IshJoyiMeta>> = {
  bugun: { nom: 'Bugun', ikonka: 'LayoutDashboard', tavsif: 'Mening ishlarim, kirgan hujjatlar va navbat', tartib: 1, sinonimlar: ['bugun', 'bosh sahifa', 'сегодня', 'главная'] },
  obyekt: { nom: 'Obyekt', ikonka: 'Building2', tavsif: 'Smeta, narx, fakt, F2 va nakopitelniy', tartib: 2, sinonimlar: ['obyekt', 'smeta', 'fakt', 'f2', 'объект'] },
  hujjatlar: { nom: 'Hujjatlar', ikonka: 'FileStack', tavsif: 'Hujjatlar, AOSR, chizmalar, nazorat', tartib: 3, sinonimlar: ['hujjatlar', 'hujjat', 'документы'] },
  taminot: { nom: 'Ta‘minot', ikonka: 'Truck', tavsif: 'Sklad, zayavka, tender, kadrlar va texnika', tartib: 4, sinonimlar: ['taminot', 'sklad', 'zayavka', 'снабжение'] },
  moliya: { nom: 'Moliya', ikonka: 'Briefcase', tavsif: 'To‘lov, xarajat, shartnoma, qarzdorlik', tartib: 5, sinonimlar: ['moliya', 'shartnoma', 'tolov', 'финансы'] },
  tomonlar: { nom: 'Tomonlar', ikonka: 'Users', tavsif: 'Buyurtmachi, kontragent, kiruvchi hujjatlar', tartib: 6, sinonimlar: ['tomonlar', 'kontragent', 'buyurtmachi', 'стороны'] },
  kompaniya: { nom: 'Kompaniya', ikonka: 'Settings', tavsif: 'A‘zolar, rollar, sozlamalar, ruxsatlar', tartib: 7, sinonimlar: ['kompaniya', 'sozlama', 'ruxsat', 'компания'] },
  sotuv: { nom: 'Uy sotish', ikonka: 'Building2', tavsif: 'Shaxmatka, bron, bitim (modul yoqilganda)', tartib: 8, sinonimlar: ['sotuv', 'uy sotish', 'продажа'] },
  platforma: { nom: 'Platforma', ikonka: 'Crown', tavsif: 'Faqat platforma superadmini', tartib: 9, sinonimlar: ['platforma'] },
};