/**
 * Kichik ABC (egasi, 2026-10-01): ish turi / resurs kutubxonalari — yuklangan smetalarning o'zidan
 * (yangi smeta yuklanishi bilan avtomatik kengayadi) + katalog; narx takliflari; ШНК tuzilishida saqlash.
 * O'qish: /api/sb (OQISH_RPC, GET → faqat stable funksiyalar). Yozish: /api/sb-yoz `ish_abc_saqla_v1`.
 */
import { yozAmali, type AktNatija } from './supabase';

export type Kat = 'ЧЕЛ' | 'МАШ' | 'МАТ' | 'ОБ';
export type NarxManba = 'smeta_obyekt' | 'smeta_shartnoma' | 'smeta' | 'katalog' | 'qolda';

export type IshTuriVariant = {
  manba: 'smeta' | 'katalog'; qator_id?: number; ish_turi_id?: number;
  kod: string | null; nom: string; birlik: string | null;
  soni?: number; shu_obyekt?: boolean; narx?: number | null;
  sostav: Array<{ tur: string; kat: string | null; kod: string | null; nom: string; birlik: string | null; norma: number | null; narx: number | null }>;
};

export type ResursVariant = {
  manba: 'smeta' | 'katalog'; kat: string | null; kod: string | null; nom: string; birlik: string | null;
  narx: number | null; narx_manba: NarxManba; soni?: number; shu_obyekt?: boolean; manba_nom?: string;
};

export type NarxVariant = { manba: NarxManba; narx: number; izoh: string };

async function soroOqi<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json() as { ok: boolean; natija?: T };
    return j.ok ? (j.natija ?? null) : null;
  } catch { return null; }
}

export async function ishTuriQidir(obyektId: number, q: string): Promise<IshTuriVariant[]> {
  return (await soroOqi<IshTuriVariant[]>({ soro: 'ish_turi_qidir_v1', obyekt_id: obyektId, q })) ?? [];
}

export async function resursQidir(obyektId: number, q: string, kat?: Kat | ''): Promise<ResursVariant[]> {
  return (await soroOqi<ResursVariant[]>({ soro: 'resurs_qidir_v1', obyekt_id: obyektId, q, kat: kat || '' })) ?? [];
}

/** Har resurs uchun narx variantlari: shu smeta (RES) → boshqa smetalar → katalog. Natija indeks bo'yicha. */
export async function narxTakliflari(obyektId: number, items: Array<{ nom: string; birlik: string }>): Promise<NarxVariant[][]> {
  if (!items.length) return [];
  const r = await soroOqi<Array<{ i: number; variantlar: NarxVariant[] }>>({ soro: 'resurs_narx_taklif_v1', obyekt_id: obyektId, items });
  const out: NarxVariant[][] = items.map(() => []);
  for (const x of r ?? []) if (out[x.i]) out[x.i] = x.variantlar ?? [];
  return out;
}

export type AbcSaqlaInput = {
  kompaniyaId: number; obyektId: number;
  command: 'additional' | 'replacement' | 'resurs_zamena';
  otaQatorId?: number | null; almashtirilayotganQatorId?: number | null; kutilganVersiya?: number | null;
  ish?: { kod?: string | null; nom: string; birlik: string; hajm: number } | null;
  /** norma bo'lsa — hajm = norma × ish hajmi; norma yo'q bo'lsa — aniq sarflangan hajm (normasiz resurs). */
  resurslar: Array<{ kat: Kat; kod?: string | null; nom: string; birlik: string; norma: number | null; hajm?: number | null; narx: number | null; narx_manba: NarxManba }>;
  faktHajm?: number | null; sana?: string | null; sabab: string; operationId: string;
};

export function ishAbcSaqla(p: AbcSaqlaInput): Promise<AktNatija & { resurs_ids?: number[]; code?: string }> {
  return yozAmali({
    amal: 'ish_abc_saqla_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, command: p.command,
    ota_qator_id: p.otaQatorId ?? null, almashtirilayotgan_qator_id: p.almashtirilayotganQatorId ?? null,
    kutilgan_versiya: p.kutilganVersiya ?? null, ish: p.ish ?? null, resurslar: p.resurslar,
    fakt_hajm: p.faktHajm ?? null, sana: p.sana ?? null, sabab: p.sabab, operation_id: p.operationId,
  });
}

/** Qo'shilgan ish/zamenani o'chirish (asliga qaytarish). Smeta qatorlari — o'zgarmas (server rad etadi). */
export function ishAbcOchir(p: { kompaniyaId: number; obyektId: number; qatorId: number; sabab?: string; operationId: string }): Promise<AktNatija & { code?: string; ochirildi?: number }> {
  return yozAmali({ amal: 'qator_ish_abc_ochir_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, qator_id: p.qatorId, sabab: p.sabab ?? null, operation_id: p.operationId });
}

/** Tahrirlash = shu joyda almashtirish (bitta tranzaksiya). */
export function ishAbcTahrir(p: Omit<AbcSaqlaInput, 'command' | 'otaQatorId' | 'almashtirilayotganQatorId' | 'kutilganVersiya'> & { qatorId: number }): Promise<AktNatija & { code?: string }> {
  return yozAmali({
    amal: 'qator_ish_abc_tahrir_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, qator_id: p.qatorId,
    ish: p.ish ?? null, resurslar: p.resurslar, fakt_hajm: p.faktHajm ?? null, sana: p.sana ?? null, sabab: p.sabab, operation_id: p.operationId,
  });
}

/** Smeta RESURSI o'rniga ish(lar) — masalan ГПС ni buyurtmachi bergan: material emas, qazib olish va tashish ishlari.
 *  `eskiQatorId` — shu resursning oldingi ish zamenasini almashtirish (tahrirlash). Asl resurs o'zgarmaydi. */
export type ResursIshInput = { ish: { kod?: string | null; nom: string; birlik: string; hajm: number }; resurslar: AbcSaqlaInput['resurslar'] };
export function resursIshZamena(p: { kompaniyaId: number; obyektId: number; resursQatorId: number; ishlar: ResursIshInput[]; sabab: string; operationId: string; eskiQatorId?: number | null }):
  Promise<AktNatija & { code?: string; qator_id?: number; qator_idlar?: number[]; resurs_idlar?: number[][] }> {
  return yozAmali({ amal: 'qator_resurs_ish_zamena_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, resurs_qator_id: p.resursQatorId,
    ishlar: p.ishlar, sabab: p.sabab, operation_id: p.operationId, eski_qator_id: p.eskiQatorId ?? null });
}

/** Qo'shilgan qatorni (bolalari bilan) boshqa joyga ko'chirish: `yangiOtaId` ichiga, `keyinQatorId` dan keyin (yo'q — boshiga). */
export function qoshilganKochir(p: { kompaniyaId: number; obyektId: number; qatorId: number; yangiOtaId: number; keyinQatorId?: number | null; operationId: string }): Promise<AktNatija & { code?: string }> {
  return yozAmali({ amal: 'qator_qoshilgan_kochir_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, qator_id: p.qatorId,
    yangi_ota_id: p.yangiOtaId, keyin_qator_id: p.keyinQatorId ?? null, operation_id: p.operationId });
}

export function abcXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  if (/QATOR_TARIXDA|TASDIQLANGAN_OZGARISH/.test(m)) return 'Bu qator hujjat tarixida ishlatilgan. Asl tarix saqlanadi — tuzatish hujjati kerak.';
  if (/OPERATION_SCOPE_MISMATCH/.test(m)) return 'Bu amal boshqa ma’lumot bilan yuborilgan. Jadvalni yangilab, qayta tekshiring.';
  if (/ZAMENA_JOYI/.test(m)) return 'Zamena o‘zi almashtirgan qator yonida turadi — faqat shu bo‘lim ichida tartibini o‘zgartirish mumkin.';
  if (/TUZILMA_NOTOGRI|JOY_NOTOGRI/.test(m)) return 'Bu joyga ko‘chirib bo‘lmaydi: ish — faqat bo‘limga, resurs — ishga yoki bo‘limga.';
  if (/RESURS_QOSHILGAN/.test(m)) return 'Bu resursni o‘zingiz qo‘shgansiz — uni tahrirlang yoki o‘chiring.';
  if (/RESURS_ISHSIZ|BOLIM_NOT_FOUND/.test(m)) return 'Resursning ishi yoki bo‘limi topilmadi — ish zamenasi uchun joy aniqlanmadi.';
  if (/SMETA_QATORI_OZGARMAS/.test(m)) return 'Smetaning asl qatori o‘chirilmaydi va o‘zgartirilmaydi.';
  if (/F2_DA/.test(m)) return 'Bu qator F2 aktida — avval F2 ni bekor qiling.';
  if (/BOGLANGAN/.test(m)) return 'Qatorga АОСР / laboratoriya / narx dalili bog‘langan — avval ularni yeching.';
  if (/STALE_VERSION/.test(m)) return 'Smeta shu orada o‘zgargan — jadvalni yangilab qayta urinib ko‘ring.';
  if (/RESURS_INVALID/.test(m)) return 'Har resursda nom, birlik va norma yoki aniq hajm (> 0) bo‘lishi shart.';
  if (/ISH_HAJM_REQUIRED/.test(m)) return 'Ish hajmi (> 0) kiritilmagan.';
  if (/TREE_STRUCTURE_INVALID|REPLACEMENT_SCOPE_INVALID/.test(m)) return 'Tanlangan bo‘lim yoki qator bu amal uchun mos emas.';
  if (/WRITE_ROLE_REQUIRED/.test(m)) return 'Bu amal uchun PTO, rahbar yoki admin roli kerak.';
  return r?.error || r?.xabar || r?.code || 'Saqlab bo‘lmadi.';
}
