/**
 * Hujjat imzochilari klienti (egasi, 2026-10-26): har tomon (buyurtmachi, pudratchi, subpudratchi, texnadzor)
 * o'z imzochisini O'ZI tayinlaydi — loyiha, obyekt yoki razdel darajasida (meros: razdel → obyekt → loyiha → bo'sh).
 * Shlyuz: /api/tomon (bolim `imzochilar`, `imzochi_tarix`; amal `imzochi_saqla`); ruxsat serverda.
 */
import { tomonOqi, tomonYoz, type TomonJavob } from './t2-tomon';

export type ImzochiRol = 'zakazchik' | 'pudratchi' | 'subpudratchi' | 'texnadzor' | 'loyihachi';
export type ImzochiManba = 'ozi' | 'kiritilgan';
export type ImzochiDaraja = 'loyiha' | 'obyekt' | 'razdel';

/** Bitta darajadagi saqlangan yozuv. */
export type ImzochiYozuv = {
  daraja: ImzochiDaraja; razdel_id: number | null;
  tashkilot: string | null; lavozim: string | null; fio: string | null;
  manba: ImzochiManba; tomon_kompaniya_id: number | null; yangilangan_at: string | null;
};
export type ObyektImzochi = {
  rol: ImzochiRol;
  /** Meros bo'yicha amaldagi yozuv (razdel → obyekt → loyiha); NULL — hech qayerda kiritilmagan. */
  effektiv: ImzochiYozuv | null;
  qatlamlar: Record<ImzochiDaraja, ImzochiYozuv | null>;
  /** Chaqiruvchi shu darajaga yoza oladimi. */
  yozish: Record<ImzochiDaraja, boolean>;
};
export type ObyektImzochilar = {
  obyekt_id: number; loyiha_id: number | null; razdel_id: number | null;
  /** Chaqiruvchi kompaniyaning shu obyektdagi tomoni; aniqlanmasa NULL (faqat ko'radi). */
  mening_tomonim: ImzochiRol | null;
  egasi: boolean;
  imzochilar: ObyektImzochi[];
};
export type ImzochiMaydonlar = { tashkilot?: string | null; lavozim?: string | null; fio?: string | null };
export type ImzochiTarixQator = { rol: ImzochiRol; tashkilot: string | null; lavozim: string | null; fio: string | null; oxirgi_at: string };

export const obyektImzochilarOl = (kompaniyaId: number, obyektId: number, razdelId?: number | null): Promise<TomonJavob<ObyektImzochilar>> =>
  tomonOqi<ObyektImzochilar>('imzochilar', kompaniyaId, { obyekt_id: obyektId, razdel_id: razdelId ?? null });

/** Kompaniya oldin qo'lda kiritgan nomlar (eng yangisi birinchi) — takliflar uchun. */
export const imzochiTarixOl = async (kompaniyaId: number): Promise<ImzochiTarixQator[]> => {
  const r = await tomonOqi<{ tarix?: ImzochiTarixQator[] }>('imzochi_tarix', kompaniyaId);
  return r.ok && Array.isArray(r.natija.tarix) ? r.natija.tarix : [];
};

/** Uchala maydon bo'sh bo'lsa server SHU darajadagi qatorni o'chiradi (quyi daraja → yuqori daraja merosi qaytadi). */
export const obyektImzochiSaqla = (kompaniyaId: number, obyektId: number, rol: ImzochiRol, daraja: ImzochiDaraja, razdelId: number | null, m: ImzochiMaydonlar) =>
  tomonYoz<{ ok: true; manba: ImzochiManba | null }>('imzochi_saqla', kompaniyaId, {
    obyekt_id: obyektId, rol, daraja, razdel_id: daraja === 'razdel' ? razdelId : null,
    tashkilot: m.tashkilot ?? null, lavozim: m.lavozim ?? null, fio: m.fio ?? null, operation_id: crypto.randomUUID(),
  });
