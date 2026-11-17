/**
 * Omborchi gateway mijozi — YAGONA server nuqtasi `/api/ombor-buyruq` (web, Android va Telegram bir xil mantiqdan foydalanadi).
 * Shartnoma: frontend/functions/api/ombor-buyruq.ts. Aktor sessiyadan olinadi; mijoz hech qachon actor_id yubormaydi.
 */
export type OmborGuruh = {
  kalit: string; nomi: string; birligi: string; tur: string | null; kirim: number; chiqim: number; qoldiq: number;
  variantlar_soni: number; harakatlar: number; oxirgi_sana: string | null; ball: number;
};
export type OmborQoldiq = { ok: true; jami: number; limit: number; offset: number; turlar: string[]; qatorlar: OmborGuruh[] };
export type OmborHarakat = {
  id: number; sana: string; operatsiya: 'prixod' | 'rasxod'; nomi: string; birligi: string; obyomi: number; postavshik: string | null;
  qabul_qiluvchi: string | null; qabul_turi: string | null; izoh: string | null; tur: string | null; sf_tasdiq: string | null; manba: string; teskari: boolean; yaratildi: string;
};
export type OmborRoyxat = { ok: true; jami: number; limit: number; offset: number; qatorlar: OmborHarakat[] };
export type OmborTarix = { ok: true; jami: number; kirim: number; chiqim: number; qatorlar: OmborHarakat[] };
export type OmborXato = { ok: false; code?: string; xabar?: string };
export type OmborFiltr = { qidir?: string; birlik?: string; tur?: string; musbat?: '1' | '0'; tartib?: 'nom' | 'qoldiq'; dan?: string; gacha?: string; operatsiya?: 'prixod' | 'rasxod'; yetkazuvchi?: string };

export type OmborNomzod = { nomi: string; birligi: string; qoldiq: number; ball: number; kalit: string; variantlar_soni: number };
/** Eslatma: shu ombor oldin kiritgan material (variant guruhi emas): nom, birlik, oxirgi yetkazuvchi / qabul qiluvchi, narx (bo'lsa). */
export type OmborEslatma = { nomi: string; birligi: string; soni: number; oxirgi_sana: string | null; postavshik: string | null; qabul_qiluvchi: string | null; narx: number | null };
export type OmborBuyruqNatija = {
  ok: true; holat: string; matn?: string; llm?: boolean; ai_xabar?: string; token?: string; sana?: string; jami?: number; hisobot?: OmborHisobotQisqa;
  buyruq?: { amal: string; nomi: string | null; miqdor: number | null; birlik: string | null };
  preview?: Record<string, unknown>; nomzodlar?: OmborNomzod[]; nomzodlar_yozuv?: OmborHarakat[]; nomzodlar_obyekt?: { id: number; nom: string }[];
  material?: OmborNomzod; tarix?: OmborTarix; yetishmaydi?: string[]; hozirgi_qoldiq?: number; sorlagan?: number;
};

/** Aqlli taklif (kirim/chiqim): shu ombor tarixidan material, birlik, odatiy miqdor, narx (QQS siz/bilan), yetkazuvchi. */
export type OmborTaklif = {
  nomi: string; birligi: string; soni: number; oxirgi_sana: string | null; miqdor_oxirgi: number | null; miqdor_median: number | null;
  narx_oxirgi: number | null; narx_ortacha: number | null; narx_oxirgi_qqs: number | null; narx_ortacha_qqs: number | null;
  kontragent: string | null; kontragent_oxirgi: string | null; kontragentlar: { nomi: string; soni: number }[]; ball: number; qoldiq?: number | null;
};
export type OmborKontragentTaklif = { nomi: string; soni: number; oxirgi_sana: string | null; materiallar: { nomi: string; birligi: string; soni: number; miqdor_median: number | null; narx_oxirgi: number | null }[] };
export type OmborTakliflar = { ok: true; tur: 'prixod' | 'chiqim'; qqs_foiz: number; takliflar: OmborTaklif[]; kontragentlar: OmborKontragentTaklif[] };

export type DavrBelgisi = 'bugun' | 'kecha' | 'hafta' | 'otgan_hafta' | 'oy' | 'otgan_oy' | 'yil' | 'hammasi' | 'ixtiyoriy';
export type OmborHisobotFiltr = { davr?: DavrBelgisi; dan?: string; gacha?: string; qidir?: string; yetkazuvchi?: string; qabul?: string; obyekt?: string; operatsiya?: 'prixod' | 'rasxod' };
export type OmborHisobotJami = {
  kirim_soni: number; chiqim_soni: number; birliklar: { birligi: string; kirim: number; chiqim: number }[];
  kirim_summa: number; kirim_summa_qqs: number; chiqim_summa: number | null; chiqim_summa_qqs: number | null; narxsiz_soni: number; qqs_foiz: number;
};
export type OmborHisobotQator = {
  id: number; sana: string; operatsiya: 'prixod' | 'rasxod'; nomi: string; birligi: string; obyomi: number; kontragent: string | null;
  obyekt_id: number | null; obyekt?: string | null; narx: number | null; summa: number | null; summa_qqs: number | null; izoh: string | null;
};
export type OmborHisobot = { ok: true; davr: { belgi: string; dan: string | null; gacha: string | null }; jami: OmborHisobotJami; chetlatilgan: number; jami_qator: number; limit: number; offset: number; qatorlar: OmborHisobotQator[] };
export type OmborHisobotQisqa = { davr: { dan: string | null; gacha: string | null }; jami: OmborHisobotJami; chetlatilgan: number; qator_soni: number; qatorlar: OmborHisobotQator[] };

async function chaqir<T>(tana: Record<string, unknown> | FormData, ms = 45_000): Promise<T | OmborXato> {
  const ac = new AbortController(); const id = setTimeout(() => ac.abort(), ms);
  try {
    const forma = tana instanceof FormData;
    const r = await fetch('/api/ombor-buyruq', { method: 'POST', credentials: 'same-origin', signal: ac.signal,
      ...(forma ? { body: tana } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tana) }) });
    const j = await r.json().catch(() => null) as (T & { ok?: boolean; code?: string; xabar?: string }) | null;
    if (!j) return { ok: false, code: 'HTTP_' + r.status };
    return j;
  } catch { return { ok: false, code: 'NETWORK' }; } finally { clearTimeout(id); }
}
const asos = (kompaniyaId: number, skladId: number) => ({ kompaniya_id: kompaniyaId, sklad_id: skladId });

export const omborKontekst = () => chaqir<{ ok: true; omborlar: { id: number; kompaniya_id: number; nomi: string; yozish: boolean }[] }>({ amal: 'kontekst' });
export const omborQoldiq = (k: number, s: number, filtr: OmborFiltr = {}, limit = 50, offset = 0) =>
  chaqir<OmborQoldiq>({ amal: 'qoldiq', ...asos(k, s), filtr, limit, offset });
/** Istalgan sanadagi ostatka (shu kun oxirigacha); sana bo'sh — hozirgi ostatka. Javob shakli `omborQoldiq` bilan bir xil. */
export const omborQoldiqSana = (k: number, s: number, sana: string, filtr: OmborFiltr = {}, limit = 50, offset = 0) =>
  chaqir<OmborQoldiq & { sana?: string }>({ amal: 'qoldiq', ...asos(k, s), sana, filtr, limit, offset });
/** Narxsiz yozilgan kirimga keyin narx qo'yish (QQS siz, birlik uchun). */
export const omborNarxQoy = (k: number, s: number, harakatId: number, narx: string) =>
  chaqir<{ ok: true; harakat_id: number; narx: number }>({ amal: 'narx_qoy', ...asos(k, s), harakat_id: harakatId, narx });
export const omborTaklif = (k: number, s: number, q: string, tur: 'prixod' | 'chiqim', yetkazuvchi?: string, limit = 6) =>
  chaqir<OmborTakliflar>({ amal: 'taklif', ...asos(k, s), q, tur, ...(yetkazuvchi ? { yetkazuvchi } : {}), limit });
export const omborHisobot = (k: number, s: number, filtr: OmborHisobotFiltr = {}, limit = 100, offset = 0) =>
  chaqir<OmborHisobot>({ amal: 'hisobot', ...asos(k, s), filtr, limit, offset });
export const omborRoyxat =(k: number, s: number, filtr: OmborFiltr = {}, limit = 50, offset = 0) =>
  chaqir<OmborRoyxat>({ amal: 'royxat', ...asos(k, s), filtr, limit, offset });
export const omborTarix = (k: number, s: number, kalit: string, birlik: string, limit = 100, offset = 0) =>
  chaqir<OmborTarix>({ amal: 'tarix', ...asos(k, s), kalit, birlik, limit, offset });
export const omborEslatma = (k: number, s: number, q: string, limit = 8) =>
  chaqir<{ ok: true; takliflar: OmborEslatma[] }>({ amal: 'eslatma', ...asos(k, s), q, limit });
export type YozInput = { operatsiya: 'prixod' | 'chiqim'; nomi: string; birligi: string; miqdor: string; /** birlik narxi QQS siz (faqat kirim) */ narx?: string; /** narx QQS bilanmi/sizmi (server QQS siz ga keltiradi) */ narx_rejim?: 'bilan' | 'siz'; sana?: string; kontragent?: string; tur?: string; izoh?: string; obyekt_id?: number | null; operation_id: string };
export const omborYoz = (k: number, s: number, y: YozInput) =>
  chaqir<{ ok: true; takror?: boolean; harakat_id: number; qoldiq_keyin?: number }>({ amal: 'yoz', ...asos(k, s), ...y });
export const omborTuzat = (k: number, s: number, p: { harakat_id: number; yangi: Record<string, unknown> | null; sabab: string; operation_id: string }) =>
  chaqir<{ ok: true; takror?: boolean; teskari_id: number; yangi_id?: number }>({ amal: 'tuzat', ...asos(k, s), ...p });
export const omborAlias = (k: number, s: number, kanonik: string, variantlar: string[], operationId: string) =>
  chaqir<{ ok: true; variantlar: number }>({ amal: 'alias', ...asos(k, s), kanonik, variantlar, operation_id: operationId });
export const omborTahlilMatn = (k: number, s: number, matn: string, tanlov?: { nomi: string; birligi: string }, narxRejim?: 'bilan' | 'siz') =>
  chaqir<OmborBuyruqNatija>({ amal: 'tahlil', ...asos(k, s), matn, ...(tanlov ? { tanlov } : {}), ...(narxRejim ? { narx_rejim: narxRejim } : {}) });
export function omborTahlilOvoz(k: number, s: number, audio: Blob, til = 'auto') {
  const f = new FormData();
  f.set('amal', 'tahlil'); f.set('kompaniya_id', String(k)); f.set('sklad_id', String(s)); f.set('til', til); f.set('audio', audio, 'ombor-audio');
  return chaqir<OmborBuyruqNatija>(f, 90_000);
}
export const omborTasdiq = (k: number, s: number, token: string) =>
  chaqir<{ ok: true; takror?: boolean; harakat_id?: number; teskari_id?: number }>({ amal: 'tasdiq', ...asos(k, s), token });

/** Ostatka yoki kirim-chiqim hisoboti .xlsx (server yasaydi; token serverda yechiladi). Fayl baytlari yoki xato. */
export async function omborEksport(k: number, s: number, filtr: OmborFiltr | OmborHisobotFiltr = {}, tur: 'qoldiq' | 'hisobot' = 'qoldiq', sana?: string): Promise<{ ok: true; blob: Blob; faylNomi: string } | OmborXato> {
  try {
    const r = await fetch('/api/ombor-buyruq', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'eksport', ...asos(k, s), filtr, ...(tur === 'hisobot' ? { tur } : {}), ...(sana ? { sana } : {}) }) });
    if (!r.ok) { const j = await r.json().catch(() => null) as { code?: string; xato?: string } | null; return { ok: false, code: j?.code ?? 'HTTP_' + r.status, xabar: j?.xato }; }
    const nom = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'ostatka.xlsx';
    return { ok: true, blob: await r.blob(), faylNomi: nom };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
