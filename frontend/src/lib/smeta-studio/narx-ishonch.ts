/**
 * Narx ishonchini kuchaytiruvchi (egasi 2026-10-17: "har narsaga ruxsat so'rayveradi, to'g'ri topganini ham tasdiqla deydi …
 * tizim butun yuklangan smetalardan o'rgansin, uverennostni maksimal oshirsin — tizim darajasida").
 *
 * AI ning o'rta ishonchli tanlovi faqat OBYEKTIV dalil bo'lsa avtomatik qo'llanadi:
 *   1) platforma smetachilari shu resursga shu manba qatorini kamida 2 marta tasdiqlagan (rad etishdan 3 barobar ko'p);
 *   2) narx yuklangan barcha smetalardagi amaliyotga mos (≥ 5 kuzatuv, ≥ 2 kompaniya — baza hukmi, raqamlar oshkor emas).
 * Va aksincha, yuqori ishonch ham so'raladi, agar smetachilar bu manbani ko'proq rad etgan bo'lsa yoki narx amaliyotdan
 * keskin farq qilsa (≥ 10 kuzatuv). Hech qanday dalil bo'lmasa — AI ning o'z hukmi o'zgarmaydi ("mujmal bo'lsa so'rasin").
 * Kompaniya smetasidan olingan narx hech qachon avtomatik qo'yilmaydi (egasi 2026-10-15) — bu qoida bu yerda ham saqlanadi.
 */
import { birlikKalit, nomKalit } from '../narx-katalog/kalit';
import type { NarxTanlov } from '../smeta-ai/protokol';
import type { NarxNomzod } from './narx-yigish';

export type NarxTajriba = {
  tanlovlar?: Array<{ manba: string; qabul: number; rad: number; kompaniya_soni: number }>;
  kuzatuv?: number; kompaniya_soni?: number; mos?: boolean;
  p25?: number; mediana?: number; p75?: number;
};
export type Ishonch = NarxTanlov['ishonch'];

/** t2_qator.nom_key|birlik_key bilan bir xil kalit — yuklangan smetalardagi shu resurs qatorlari. */
export const resursKaliti = (nom: string, birlik: string | null) => `${nomKalit(nom)}|${birlikKalit(birlik)}`;
/** Manba qatori kaliti (katalog revizyasidan mustaqil): manbadagi nom va birlik. */
export const manbaKaliti = (n: Pick<NarxNomzod, 'row'>) => `${nomKalit(n.row.nom)}|${birlikKalit(n.row.birlik)}`;

const son = (v: number) => v.toLocaleString('ru-RU');

export function ishonchniKuchaytir(nomzod: NarxNomzod | null, ishonch: Ishonch, t: NarxTajriba | null | undefined):
  { ishonch: Ishonch; dalil: string | null } {
  if (!nomzod || nomzod.tur === 'kompaniya' || ishonch === 'past' || !t) return { ishonch, dalil: null };
  const tan = t.tanlovlar?.find(x => x.manba === manbaKaliti(nomzod));
  const kuz = t.kuzatuv ?? 0, komp = t.kompaniya_soni ?? 0;
  // So'rashga qaytaradigan dalillar (xato narx smetaga jim tushmasin).
  if (tan && tan.rad >= 2 && tan.rad > tan.qabul)
    return { ishonch: 'orta', dalil: `smetachilar bu manba qatorini ${tan.rad} marta rad etgan` };
  if (t.mos === false && kuz >= 10)
    return { ishonch: 'orta', dalil: `narx yuklangan smetalardagi amaliyotdan keskin farq qiladi (${son(kuz)} kuzatuv, ${komp} kompaniya)` };
  if (ishonch === 'yuqori') return { ishonch, dalil: null };
  // O'rta → yuqori: tizim tajribasi tasdiqlaydi.
  if (tan && tan.qabul >= 2 && tan.qabul >= 3 * tan.rad)
    return { ishonch: 'yuqori', dalil: `smetachilar shu manbani ${tan.qabul} marta tasdiqlagan (${tan.kompaniya_soni} kompaniya)` };
  if (t.mos === true)
    return { ishonch: 'yuqori', dalil: `narx yuklangan smetalardagi amaliyotga mos (${son(kuz)} kuzatuv, ${komp} kompaniya)` };
  return { ishonch, dalil: null };
}
