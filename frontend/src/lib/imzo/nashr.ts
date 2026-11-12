/**
 * lib/imzo/nashr.ts - MANBA QR: tizim chiqargan HAR xlsx eksport (hujjat dvigateli o'tadigan hammasi) QR oladi.
 *
 * MARKAZIY NUQTA: `downloadBlob` (construction-document-control/export/download-helper.ts) - fayl foydalanuvchiga beriladigan yagona yo'l
 * (tizim imzosi ham shu yerda qo'yiladi). Eksport qilganda:
 *   1. kanonik mazmun xeshi hisoblanadi (mazmun.ts) - Excel qayta saqlansa ham o'zgarmaydi;
 *   2. /api/imzo nashr_tayyor: shu mazmun (kompaniya + tur + xesh) avval chiqarilgan bo'lsa MAVJUD token qaytadi (yangi yozuv ochilmaydi);
 *   3. xlsx oxiriga «IMZO» varag'i: QR (`/t/<token>`) - qog'ozda skaner qilinsa Excel nusxa tizimdan ochiladi/yuklanadi;
 *   4. nusxa hali saqlanmagan bo'lsa R2 ga yuklanadi (t2_document_registry, turi 'nashr') va nashrga biriktiriladi.
 * Token faqat birinchi eksportda yechiladi (chaqiruvchi hujjatTokenBilan); QR orqali qayta yuklab olish bepul (hujjat-ol: 'nashr' pullik tur emas).
 * Tarmoq/server xatosida fayl QR siz (faqat tizim imzosi bilan) beriladi - eksport hech qachon to'xtamaydi.
 */
import { hujjatMazmunXeshi, imzoVaraqiBormi, xlsxMi } from './mazmun';
import { imzoVaraqQosh } from './qr-varaq';
import { nashrKompaniyasi } from './nashr-kontekst';

export type NashrMeta = { turi?: string; obyektId?: number | null; atama?: string };

/** Fayl nomidan hujjat turi kaliti: «F2_Obyekt_5.xlsx» -> «f2». */
export function turiFaylNomidan(nom: string): string {
  const w = nom.replace(/\.[A-Za-z0-9]+$/, '').match(/^[\p{L}\p{N}-]+/u)?.[0] ?? 'hujjat';
  return w.toLowerCase().slice(0, 40) || 'hujjat';
}

export type NashrAdapter = {
  tayyor: (b: { kompaniya_id: number; obyekt_id: number | null; turi: string; atama: string; mazmun_xesh: string }) => Promise<{ ok: true; token: string; yangi: boolean; hujjat_id: number | null } | { ok: false }>;
  yukla: (b: { bytes: Uint8Array; nom: string; kompaniyaId: number; obyektId: number | null }) => Promise<number | null>;
  biriktir: (token: string, hujjatId: number) => Promise<boolean>;
  origin: () => string;
};

/** Nashr: QR li xlsx baytlarini qaytaradi; qo'llab bo'lmasa (xlsx emas, kontekst yo'q, xato) - null. */
export async function nashrQoy(bytes: Uint8Array, filename: string, meta: NashrMeta | undefined, a: NashrAdapter): Promise<Uint8Array | null> {
  const kompaniyaId = nashrKompaniyasi();
  // IMZO varag'i bor fayl (imzolangan nusxa) qayta shtamplanmaydi: imzo qatorlari yo'qolmasin
  if (!kompaniyaId || !/\.(xlsx|xlsm)$/i.test(filename) || !xlsxMi(bytes) || imzoVaraqiBormi(bytes)) return null;
  try {
    const xesh = await hujjatMazmunXeshi(bytes);
    const atama = (meta?.atama ?? filename.replace(/\.[A-Za-z0-9]+$/, '')).slice(0, 160);
    const r = await a.tayyor({ kompaniya_id: kompaniyaId, obyekt_id: meta?.obyektId ?? null, turi: meta?.turi ?? turiFaylNomidan(filename), atama, mazmun_xesh: xesh });
    if (!r.ok) return null;
    const kop = imzoVaraqQosh(bytes, { imzolar: [], kutilmoqda: [], origin: a.origin(), mazmunXesh: xesh, manbaToken: r.token });
    if (!kop) return null;
    if (!r.hujjat_id) {
      const id = await a.yukla({ bytes: kop, nom: filename, kompaniyaId, obyektId: meta?.obyektId ?? null }).catch(() => null);
      if (id) await a.biriktir(r.token, id).catch(() => false);
    }
    return kop;
  } catch { return null; }
}
