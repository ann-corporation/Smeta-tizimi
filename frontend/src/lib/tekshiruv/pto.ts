/**
 * lib/tekshiruv/pto.ts - texnadzor takliflarining PTO tomoni: xulosa va «Qabul» ning F-2 ga ta'siri QADAMLARI.
 * Sof mantiq. Hech narsa yozmaydi: har qadam mavjud /api/f2-buyruq vositasi (preview -> tasdiq) ga beriladi.
 *   - taklif hajm          -> f2_qoralama_tahrir { ozgartir: [{ qator_id, hajm }] }
 *   - olib tashlansin      -> f2_qoralama_tahrir { olib_tashla } + bajarilmadi { belgila } (asl smeta const: qator smetada qoladi, faqat F-2 dan chiqadi)
 *   - qabul/izoh/hujjat/qo'shish -> yozuvsiz (faqat qaror; qator qo'shish muharrirda qo'lda)
 */
import type { Bayroq, Qaror, Rang } from './yadro';

export type AktTaklif = {
  id: number; tekshiruv_id: number; qator_id: number; kod: string | null; nom: string | null; birlik: string | null; bayroq: Bayroq | null; izoh: string | null;
  taklif_hajm: number | null; rang: Rang | null; hujjat_turi: string | null; qosh: boolean; qaror: Qaror; qaror_sabab: string | null; hujjat_id: number | null;
  joriy_hajm: number | null; akt_versiya: number; eskirgan: boolean;
};
export type AktTakliflari = {
  ok: true; akt: { id: number; versiya: number; holat: string; lifecycle_status: string | null };
  tekshiruvlar: Array<{ id: number; tekshiruvchi: string; holat: string; izoh: string | null; akt_versiya: number; eskirgan: boolean; yangilandi: string; token: string }>;
  takliflar: AktTaklif[];
};
export type QabulQadam = { nom: 'f2_qoralama_tahrir' | 'bajarilmadi'; args: Record<string, unknown> };

export function takliflarXulosasi(t: readonly Pick<AktTaklif, 'qaror' | 'bayroq' | 'hujjat_id'>[]): { jami: number; hal: number; hujjatKutilmoqda: number } {
  return {
    jami: t.length, hal: t.filter((x) => x.qaror !== 'kutilmoqda').length,
    hujjatKutilmoqda: t.filter((x) => x.bayroq === 'hujjat_kerak' && x.hujjat_id == null && x.qaror !== 'rad').length,
  };
}

/** `qoralama` bo'lmasa (tasdiqlangan/yuborilgan F-2) yozuv qadami yo'q - faqat qaror. */
export function qabulQadamlari(x: Pick<AktTaklif, 'qator_id' | 'bayroq' | 'taklif_hajm' | 'qosh' | 'izoh'>, k: { aktId: number; obyektId: number; versiya: number; qoralama?: boolean }): QabulQadam[] {
  if (k.qoralama === false || x.qosh) return [];
  if (x.bayroq === 'olib_tashlansin') {
    return [
      { nom: 'f2_qoralama_tahrir', args: { akt_id: k.aktId, olib_tashla: [x.qator_id], kutilgan_versiya: k.versiya } },
      { nom: 'bajarilmadi', args: { obyekt_id: k.obyektId, amal: 'belgila', qatorlar: [{ qator_id: x.qator_id }], sabab_kod: 'texnik_sabab', sabab_izoh: 'Texnadzor taklifi' } },
    ];
  }
  if (x.taklif_hajm != null) return [{ nom: 'f2_qoralama_tahrir', args: { akt_id: k.aktId, ozgartir: [{ qator_id: x.qator_id, hajm: x.taklif_hajm }], kutilgan_versiya: k.versiya } }];
  return [];
}