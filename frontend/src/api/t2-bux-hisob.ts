/**
 * Buxgalteriya (egasi 2026-11-04) — hisoblar rejasi, o'zgarmas jurnal, avto-provodka, kontragent hisob-kitobi, ОСВ, QQS reyestri, bank/kassa.
 * O'qish: /api/sb `bux_*_v1` (stable; a'zolik + rol + accounting.read). Yozish: /api/sb-yoz `bux_*` (idempotent operation_id; accounting.write/approve RPC ichida).
 * Summalar QQS bilan; null = noma'lum (0 emas); minus ruxsat (storno).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';

export type BuxHisob = { kod: string; nom_uz: string; nom_ru: string; tur: string; kontragent_analitika: boolean; faol: boolean; standart: boolean; tekshirilsin?: boolean };
export type BuxMoslik = { kalit: string; dt_kod: string | null; kt_kod: string | null; qiymat: number | null; izoh: string | null };
export type BuxDavr = { oy: string; holat: 'yopiq' | 'ochiq'; izoh: string | null; yangilandi: string };
export type BuxHolat = {
  ok: true; boshlangan: boolean; hisoblar: BuxHisob[]; moslik: BuxMoslik[]; davrlar: BuxDavr[]; provodka_soni: number; oxirgi_sana: string | null;
};
export type BuxProvodka = {
  id: number; sana: string; dt: string; kt: string; summa: number; kontragent_id: number | null; kontragent: string | null; shartnoma_id: number | null;
  shartnoma_raqam: string | null; obyekt_id: number | null; manba_tur: string; manba_id: number | null; hujjat: string | null; qism: string; tur: 'avto' | 'qolda' | 'storno';
  storno_id: number | null; izoh: string | null;
};
export type BuxJurnal = { ok: true; jami: number; limit: number; qatorlar: BuxProvodka[] };
export type BuxOsvQator = { kod: string; nom_uz: string | null; nom_ru: string | null; tur: string | null; ochilish: number; dt: number; kt: number; yopilish: number };
export type BuxOsv = { ok: true; dan: string; gacha: string; qatorlar: BuxOsvQator[]; jami_dt: number; jami_kt: number; jami_ochilish: number };
export type BuxKontragentQator = {
  kontragent_id: number | null; kontragent: string | null; inn: string | null; kod: string; nom_uz: string | null; nom_ru: string | null;
  ochilish: number; dt: number; kt: number; yopilish: number;
};
export type BuxHujjatQator = {
  sana: string; hisob: string; manba_tur: string; manba_id: number | null; hujjat: string | null; shartnoma_id: number | null; shartnoma_raqam: string | null;
  dt: number; kt: number; izoh: string | null;
};
export type BuxKontragent = {
  ok: true; dan: string; gacha: string; qatorlar: BuxKontragentQator[]; hujjatlar: BuxHujjatQator[] | null;
  kontragent: { id: number; nom: string; inn: string | null } | null; kompaniya: { nom: string | null; inn: string | null } | null;
};
export type BuxNdsQator = { sana: string; hujjat: string | null; manba_tur: string; manba_id: number; kontragent: string | null; inn: string | null; shartnoma_raqam: string | null; asos: number; nds: number; jami: number };
export type BuxNds = { ok: true; dan: string; gacha: string; sotuv: BuxNdsQator[]; xarid: BuxNdsQator[] };
export type BuxTolov = {
  id: number; sana: string; summa: number; tur: string; hujjat_raqam: string | null; izoh: string | null; manba: string | null; shartnoma_id: number; shartnoma_raqam: string;
  asosiy: boolean; kontragent_id: number | null; kontragent: string | null; obyekt_id: number | null; yonalish: 'kirim' | 'chiqim'; provodkada: boolean;
};
export type BuxShartnoma = { id: number; raqam: string; nom: string | null; asosiy: boolean; kontragent_id: number | null; kontragent: string | null; inn: string | null };
export type BuxTolovRoyxat = { ok: true; limit: number; tolovlar: BuxTolov[]; shartnomalar: BuxShartnoma[] };

export type BuxKartochkaQator = {
  id: number; sana: string; korr: string; dt: number; kt: number; saldo: number; kontragent_id: number | null; kontragent: string | null; shartnoma_id: number | null;
  shartnoma_raqam: string | null; manba_tur: string; manba_id: number | null; hujjat: string | null; qism: string; tur: 'avto' | 'qolda' | 'storno'; izoh: string | null;
};
export type BuxKartochka = {
  ok: true; hisob: { kod: string; nom_uz: string; nom_ru: string; tur: string } | null; dan: string; gacha: string; ochilish: number; dt: number; kt: number; yopilish: number;
  jami: number; limit: number; qatorlar: BuxKartochkaQator[];
};
export type BuxSozlama = { ok: true; shablon: string; davr_blok: boolean; tekshirilsin: number; shablonlar: Array<{ shablon: string; qoidalar: number; yoqilgan: number }> };
export type BuxFiltr = { dan?: string | null; gacha?: string | null; kontragent_id?: number | null; shartnoma_id?: number | null; hisob?: string | null; limit?: number };

async function oqi<T>(soro: string, kompaniyaId: number, f: BuxFiltr = {}): Promise<{ ok: true; natija: T } | { ok: false; error: string }> {
  try {
    const body: Record<string, unknown> = { soro, kompaniya_id: kompaniyaId };
    for (const [k, v] of Object.entries(f)) if (v != null && v !== '') body[k] = v;
    const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json() as { ok: boolean; natija?: T; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'Buxgalteriya ma’lumotini o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export const buxHolatOl = (k: number) => oqi<BuxHolat>('bux_holat_v1', k);
export const buxJurnalOl = (k: number, f: BuxFiltr) => oqi<BuxJurnal>('bux_jurnal_v1', k, f);
export const buxOsvOl = (k: number, f: BuxFiltr) => oqi<BuxOsv>('bux_osv_v1', k, f);
export const buxKontragentOl = (k: number, f: BuxFiltr) => oqi<BuxKontragent>('bux_kontragent_v1', k, f);
export const buxKartochkaOl = (k: number, f: BuxFiltr) => oqi<BuxKartochka>('bux_kartochka_v1', k, f);
export const buxSozlamaOl = (k: number) => oqi<BuxSozlama>('bux_sozlama_v1', k);
export const buxNdsOl = (k: number, f: BuxFiltr) => oqi<BuxNds>('bux_nds_v1', k, f);
export const buxTolovOl = (k: number, f: BuxFiltr) => oqi<BuxTolovRoyxat>('bux_tolov_v1', k, f);

type YozNatija = AktNatija & { code?: string; xabar?: string };
export type AvtoNatija = YozNatija & {
  dry?: boolean; yangi?: number; storno?: number; yopiq_davr_ogohlantirish?: number; yopiq_davr_otkazildi?: number; xarajat_kategoriyasiz?: number; oylar?: string[]; f3_summasiz?: number; asos_summasiz?: number;
};

export const buxBoshlash = (kompaniyaId: number, operationId: string): Promise<YozNatija> =>
  yozAmali({ amal: 'bux_boshlash_v1', kompaniya_id: kompaniyaId, operation_id: operationId });
export const buxHisobSaqla = (p: { kompaniyaId: number; kod: string; nomUz: string; nomRu: string; tur: string; kontragentAnalitika: boolean; faol: boolean; operationId: string }): Promise<YozNatija> =>
  yozAmali({ amal: 'bux_hisob_saqla_v1', kompaniya_id: p.kompaniyaId, kod: p.kod, nom_uz: p.nomUz, nom_ru: p.nomRu, tur: p.tur, kontragent_analitika: p.kontragentAnalitika, faol: p.faol, operation_id: p.operationId });
export const buxMoslikSaqla = (p: { kompaniyaId: number; kalit: string; dtKod: string | null; ktKod: string | null; qiymat: number | null; operationId: string }): Promise<YozNatija> =>
  yozAmali({ amal: 'bux_moslik_saqla_v1', kompaniya_id: p.kompaniyaId, kalit: p.kalit, dt_kod: p.dtKod, kt_kod: p.ktKod, qiymat: p.qiymat, operation_id: p.operationId });
export const buxAvto = (kompaniyaId: number, dry: boolean, operationId: string): Promise<AvtoNatija> =>
  yozAmali({ amal: 'bux_avto_v1', kompaniya_id: kompaniyaId, dry, operation_id: operationId }) as Promise<AvtoNatija>;
export const buxQolda = (p: { kompaniyaId: number; sana: string; dtKod: string; ktKod: string; summa: number; kontragentId?: number | null; shartnomaId?: number | null; obyektId?: number | null; izoh?: string | null; operationId: string }): Promise<YozNatija & { id?: number; yopiq_davr_ogohlantirish?: boolean }> =>
  yozAmali({ amal: 'bux_qolda_v1', kompaniya_id: p.kompaniyaId, sana: p.sana, dt_kod: p.dtKod, kt_kod: p.ktKod, summa: p.summa, kontragent_id: p.kontragentId ?? null,
    shartnoma_id: p.shartnomaId ?? null, obyekt_id: p.obyektId ?? null, izoh: p.izoh ?? null, operation_id: p.operationId });
export const buxStorno = (p: { kompaniyaId: number; provodkaId: number; izoh?: string | null; operationId: string }): Promise<YozNatija> =>
  yozAmali({ amal: 'bux_storno_v1', kompaniya_id: p.kompaniyaId, provodka_id: p.provodkaId, izoh: p.izoh ?? null, operation_id: p.operationId });
export const buxDavr = (p: { kompaniyaId: number; oy: string; amal: 'yop' | 'och'; tasdiq: boolean; izoh?: string | null; operationId: string }): Promise<YozNatija & { ogohlantirishlar?: Array<{ kod: string; xabar: string }> }> =>
  yozAmali({ amal: 'bux_davr_v1', kompaniya_id: p.kompaniyaId, oy: p.oy, davr_amal: p.amal, tasdiq: p.tasdiq, izoh: p.izoh ?? null, operation_id: p.operationId });

export const buxShablonTanla = (kompaniyaId: number, shablon: string, operationId: string): Promise<YozNatija & { moslik_qoshildi?: number }> =>
  yozAmali({ amal: 'bux_shablon_tanla_v1', kompaniya_id: kompaniyaId, shablon, operation_id: operationId });
export const buxDavrBlok = (kompaniyaId: number, blok: boolean, operationId: string): Promise<YozNatija> =>
  yozAmali({ amal: 'bux_davr_blok_v1', kompaniya_id: kompaniyaId, blok, operation_id: operationId });
export const buxHisobTasdiq = (kompaniyaId: number, kodlar: string[], operationId: string): Promise<YozNatija & { tasdiqlandi?: number }> =>
  yozAmali({ amal: 'bux_hisob_tasdiq_v1', kompaniya_id: kompaniyaId, kodlar, operation_id: operationId });

export type BankYuk = { kalit: string; sana: string; summa: number; yonalish: 'kirim' | 'chiqim'; shartnoma_id: number; hujjat_raqam?: string | null; izoh?: string | null };
export const buxBankImport = (p: { kompaniyaId: number; qatorlar: ReadonlyArray<BankYuk>; operationId: string }): Promise<Omit<YozNatija, 'takror'> & { yangi?: number; takror?: number; xato?: number }> =>
  yozAmali({ amal: 'bux_bank_import_v1', kompaniya_id: p.kompaniyaId, qatorlar: p.qatorlar, operation_id: p.operationId }) as unknown as Promise<Omit<YozNatija, 'takror'> & { yangi?: number; takror?: number; xato?: number }>;

/** Xato kodini oddiy so'zga aylantiradi. */
export function buxXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  if (/PERMISSION_DENIED|insufficient_privilege/i.test(m)) return 'Bu amal uchun buxgalteriya ruxsati kerak.';
  if (/BOSHLANMAGAN/.test(m)) return 'Avval hisoblar rejasini yarating («Boshlash»).';
  if (/HISOB_NOTOGRI/.test(m)) return 'Hisob kodi noto‘g‘ri yoki faol emas (Debet va Kredit har xil bo‘lishi kerak).';
  if (/HISOB_MOSLIKDA/.test(m)) return 'Bu hisob avto-provodka qoidasida ishlatiladi — avval qoidani o‘zgartiring.';
  if (/AVTO_STORNO_MUMKIN_EMAS/.test(m)) return 'Avtomatik provodka hujjat orqali o‘zgaradi: hujjatni tuzating, keyin «Hujjatlardan yangilash».';
  if (/ALLAQACHON_STORNO/.test(m)) return 'Bu provodka allaqachon storno qilingan.';
  if (/BUX_DAVR_YOPIQ/.test(m)) return 'Bu oy yopilgan: provodka yozilmaydi. Davrni qayta oching yoki keyingi oyga yozing.';
  if (/SHABLON_YOQ/.test(m)) return 'Bunday qoida shabloni yo‘q.';
  if (/HISOB_KERAK/.test(m)) return 'Kartochka uchun hisobni tanlang.';
  if (/SANA_SUMMA/.test(m)) return 'Sana va summa (0 emas) kiritilishi kerak.';
  if (/KALIT_YOQ|QIYMAT_0_100/.test(m)) return 'Qoida qiymati noto‘g‘ri.';
  return r?.xabar || r?.error || r?.code || 'Saqlab bo‘lmadi.';
}
