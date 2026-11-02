/**
 * Obyekt imzochilarini hujjat imzo nomlariga aylantirish — sof mantiq (UI/tarmoqdan mustaqil).
 * Har rol uchun ustunlik: tayinlangan imzochi (server merosi: razdel → obyekt → loyiha; razdel konteksti bo'lmasa obyekt)
 * > shartnoma tomoni (tashkilot nomi) > bo'sh (hujjatda chiziq).
 * `tuzuvchi` / `tekshiruvchi` — hujjatni tayyorlovchining o'z odamlari: kompaniya sukut qiymatidan, obyektga bog'lanmaydi.
 * Nom hech qachon o'ylab topilmaydi; bo'sh qator — «qiymat yo'q», nol emas.
 */
import type { ImzoNomlar } from './hujjat-yozuvchi/imzo';
import type { ImzochiMaydonlar, ImzochiRol, ObyektImzochi } from '../api/obyekt-imzochi';
import type { Liniya } from '../api/t2-shartnoma-liniya';
import { imzoNomlariTomonlardan } from './shartnoma-liniya';

/** Hujjat imzo blokidagi tomonlar (loyihachi imzo blokida yo'q). */
export const IMZO_TOMONLARI = ['zakazchik', 'pudratchi', 'subpudratchi', 'texnadzor'] as const satisfies readonly (keyof ImzoNomlar & ImzochiRol)[];
export type ImzoTomonKalit = (typeof IMZO_TOMONLARI)[number];

/** «tashkilot, lavozim, F.I.O.» — bo'shlari tashlanadi; hammasi bo'sh bo'lsa NULL (chiziq chiqadi). */
export function imzochiMatni(m: ImzochiMaydonlar | null | undefined): string | null {
  const s = [m?.tashkilot, m?.lavozim, m?.fio].map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
  return s || null;
}

/** Obyektning shartnomalaridan (asosiy + qo'shimcha) tomon tashkilotlari nomi. */
export function shartnomaImzoNomlari(l: Liniya | null | undefined, obyektId: number): ImzoNomlar {
  if (!l) return {};
  const ob = l.obyektlar.find((o) => o.id === obyektId);
  const asosiy = l.shartnomalar.find((s) => s.id === ob?.asosiy_shartnoma_id);
  const qoshimcha = l.shartnomalar.filter((s) => !s.asosiy && s.obyektlar.includes(obyektId));
  return imzoNomlariTomonlardan([...(asosiy?.tomonlar ?? []), ...qoshimcha.flatMap((s) => s.tomonlar)]);
}

export type ImzoManbalari = {
  imzochilar?: readonly ObyektImzochi[] | null;
  /** Shartnoma tomonlaridan olingan tashkilot nomlari (zaxira). */
  shartnoma?: ImzoNomlar | null;
  /** Kompaniya sukut qiymatlari (faqat tuzuvchi/tekshiruvchi olinadi). */
  kompaniya?: ImzoNomlar | null;
};

export function obyektImzoNomlari({ imzochilar, shartnoma, kompaniya }: ImzoManbalari): ImzoNomlar {
  const out: ImzoNomlar = {};
  for (const k of IMZO_TOMONLARI) {
    const qator = imzochilar?.find((x) => x.rol === k)?.effektiv;
    const v = imzochiMatni(qator) ?? ((shartnoma?.[k] ?? '').trim() || null);
    if (v) out[k] = v;
  }
  for (const k of ['tuzuvchi', 'tekshiruvchi'] as const) {
    const v = (kompaniya?.[k] ?? '').trim();
    if (v) out[k] = v;
  }
  return out;
}
