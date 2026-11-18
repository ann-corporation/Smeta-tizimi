/**
 * t2-hujjat-maydoni.ts - Hujjat maydoni (Hujjatlarim / Kompaniya diski) mijoz API (web; Android/Windows shu endpointlarni /api/mobil/bff orqali oladi).
 * Aktor serverda sessiyadan; mijoz hech qachon actor_id yubormaydi. Baytlar - R2 (yuklash: /api/hujjat-maydoni-yukla, olish: /api/hujjat-maydoni-ol).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { HM_KATTA_CHEGARA, hmYuklaKatta } from './t2-hujjat-maydoni-2';

export type Kvota = { ishlatilgan: number; limit: number; chegara: number; ortiqcha: boolean; foiz: number | null };
/** 	izim - tizim papkasi (o'chirib/ko'chirib/nomlab bo'lmaydi; server majburlaydi: TIZIM_PAPKA). */
export type HmPapka = { id: number; nom: string; tizim?: boolean };
export type HmFayl = { id: number; nom: string; mime: string; bayt: number | null; versiya: number | null; yangilandi: string; savatda: string | null; qulf_kim: number | null; qulf_ism: string | null; izohlar: number;
  /** Tizim hujjati (F-2, F-3, nakopitelniy ...): manba - qayerdan yasalgani (Tizimda ochish). */
  tizim_hujjat?: boolean; manba_turi?: string | null; manba_id?: number | null; hujjat_kalit?: string | null; obyekt_id?: number | null; shartnoma_id?: number | null };
export type HmRoyxat = { ok: true; daraja: number; kompaniya_id: number | null; shaxsiy: boolean; yol: HmPapka[]; papkalar: HmPapka[]; fayllar: HmFayl[]; kvota: Kvota };
export type HmVersiya = { raqam: number; bayt: number; mime: string; yaratildi: string; kim: string | null; joriy: boolean };
export type HmIzoh = { id: number; muallif_id: number; ism: string | null; matn: string; eslatilgan: number[]; yaratildi: string };
export type HmOdam = { id: number; ism: string; rol: string | null };
export type HmUlash = { id: number; subyekt_turi: string; subyekt_id: number | null; rol: string | null; daraja: string; tugaydi: string | null; nom: string | null };
export type HmFaoliyat = { id: number; amal: string; tafsilot: string | null; vaqt: string; fayl_id: number | null; ism: string | null };
export type HmTizimHujjat = { document_id: number; nom: string; tur: string; versiya: number | null; mime: string | null; bayt: number | null; sana: string; oxirgi: boolean };
export type HmUlashilgan = { turi: 'fayl' | 'papka'; id: number; daraja: string; tugaydi: string | null; nom: string; mime: string | null; bergan: string | null };
export type HmAdmin = {
  ok: true; kvota: Kvota; savat_bayt: number; eski_versiya_bayt: number; top_papkalar: Array<{ papka_id: number | null; nom: string; bayt: number }>;
  trafik: { chiqish: number; kirish: number; bepul: number }; reja: { kod: string; nom: string; tugaydi: string } | null;
  hisob: Array<{ sana: string; tur: string; bayt: number; token: number; holat: string }>;
};
export type HmYuklaFn = (f: File) => Promise<HmNatija<{ ok: true }>>;
export type HmXato = { ok: false; code: string; xato?: string; tarif_yol?: string; ishlatilgan?: number; limit?: number };
export type HmNatija<T> = T | HmXato;

const URL_ = '/api/hujjat-maydoni';
const qs = (o: Record<string, string | number | boolean | null | undefined>) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v === true ? 1 : v))}`).join('&');

async function oqi<T>(amal: string, p: Record<string, string | number | boolean | null | undefined> = {}): Promise<HmNatija<T>> {
  try {
    const r = await vaqtliOqish(`${URL_}?${qs({ amal, ...p })}`, { credentials: 'same-origin' });
    return await r.json() as HmNatija<T>;
  } catch (e) { return { ok: false, code: 'TARMOQ', xato: e instanceof Error ? e.message : 'Aloqa xatosi' }; }
}
async function yoz<T = { ok: true }>(body: Record<string, unknown>): Promise<HmNatija<T>> {
  try {
    const r = await fetch(URL_, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json() as HmNatija<T>;
  } catch (e) { return { ok: false, code: 'TARMOQ', xato: e instanceof Error ? e.message : 'Aloqa xatosi' }; }
}

export const hmRoyxat = (p: { kompaniyaId?: number | null; papkaId?: number | null; savat?: boolean }) => oqi<HmRoyxat>('royxat', { kompaniya_id: p.kompaniyaId, papka_id: p.papkaId, savat: p.savat });
/** Eski /admin/documents?document_id= havolasi: registry hujjat id si -> Diskdagi fayl va papka. */
/** «Biriktirilmagan» papka (Disk A4): fayllar + har biriga taklif; ko'chirish; AI taklifi (token yechiladi). */
export type HmYetimTaklif = { faylId: number; daraja: 'aniq' | 'taxminiy' | 'yoq'; manba: 'metadata' | 'nom' | 'ai' | null; loyihaId: number | null; obyektId: number | null; loyihaNom: string | null; obyektNom: string | null; ball: number };
export type HmYetimFayl = { id: number; nom: string; bayt: number | null; versiya: number | null; yangilandi: string | null; hujjat_turi: string | null; taklif: HmYetimTaklif };
export type HmYetim = { ok: true; papka_id: number | null; daraja: number; fayllar: HmYetimFayl[]; obyektlar: Array<{ id: number; nom: string; loyiha_id: number; loyiha_nom: string | null }>; loyihalar: Array<{ id: number; nom: string }> };
export const hmYetim = (kompaniyaId: number) => oqi<HmYetim>('yetim', { kompaniya_id: kompaniyaId });
export const hmYetimKochir = (kompaniyaId: number, faylId: number, loyihaId: number | null, obyektId: number | null) => yoz<{ ok: true; fayl_id: number; papka_id: number }>({ amal: 'yetim_kochir', kompaniya_id: kompaniyaId, fayl_id: faylId, loyiha_id: loyihaId, obyekt_id: obyektId });
export const hmYetimAi = (kompaniyaId: number, faylIdlar: number[]) => yoz<{ ok: true; takliflar: HmYetimTaklif[]; ai_chaqirildi: boolean }>({ amal: 'yetim_ai', kompaniya_id: kompaniyaId, fayl_idlar: faylIdlar });
export const hmRegistryJoy = (registryId: number) => oqi<{ ok: true; fayl_id: number; papka_id: number | null; kompaniya_id: number | null; savatda: boolean; nom: string }>('registry_joy', { registry_id: registryId });
export const hmUlashilgan = () => oqi<{ ok: true; royxat: HmUlashilgan[] }>('ulashilgan');
export const hmVersiyalar = (faylId: number) => oqi<{ ok: true; versiyalar: HmVersiya[] }>('versiyalar', { fayl_id: faylId });
export const hmIzohlar = (faylId: number) => oqi<{ ok: true; izohlar: HmIzoh[] }>('izoh', { fayl_id: faylId });
export const hmUlashRoyxat = (turi: 'fayl' | 'papka', id: number) => oqi<{ ok: true; havola_ruxsat: boolean; royxat: HmUlash[] }>('ulashish', { nishon_turi: turi, nishon_id: id });
export const hmFaoliyat = (p: { kompaniyaId?: number | null; faylId?: number | null }) => oqi<{ ok: true; royxat: HmFaoliyat[] }>('faoliyat', { kompaniya_id: p.kompaniyaId, fayl_id: p.faylId });
export const hmQidir = (q: string, kompaniyaId?: number | null) => oqi<{ ok: true; royxat: Array<{ id: number; nom: string; mime: string; yangilandi: string; papka_id: number | null; mos?: 'nom' | 'matn'; parcha?: string | null }> }>('qidir', { q, kompaniya_id: kompaniyaId });
export const hmTizim = (kompaniyaId: number) => oqi<{ ok: true; royxat: HmTizimHujjat[] }>('tizim', { kompaniya_id: kompaniyaId });
export const hmOdamlar = (kompaniyaId: number | null, q: string) => oqi<{ ok: true; royxat: HmOdam[] }>('odamlar', { kompaniya_id: kompaniyaId, q });
export const hmAdmin = (kompaniyaId: number | null) => oqi<HmAdmin>('admin', { kompaniya_id: kompaniyaId });
export const hmSozlama = (kompaniyaId: number) => oqi<{ ok: true; havola_ruxsat: boolean; ortiqcha: boolean }>('sozlama', { kompaniya_id: kompaniyaId });

export const hmPapka = (kompaniyaId: number | null, op: 'yarat' | 'nomla' | 'kochir' | 'ochir', p: { papkaId?: number | null; nom?: string; otaId?: number | null }) =>
  yoz({ amal: 'papka', kompaniya_id: kompaniyaId, op, papka_id: p.papkaId, nom: p.nom, ota_id: p.otaId });
export type FaylOp = 'nomla' | 'kochir' | 'savat' | 'tikla' | 'qulf' | 'qulf_och' | 'versiya_qaytar';
export const hmFaylAmal = (faylId: number, op: FaylOp, p: { nom?: string; papkaId?: number | null; raqam?: number } = {}) =>
  yoz({ amal: 'fayl', fayl_id: faylId, op, nom: p.nom, papka_id: p.papkaId, raqam: p.raqam });
export const hmIzohYoz = (faylId: number, matn: string, eslatilgan: number[]) => yoz<{ ok: true; izohlar: HmIzoh[] }>({ amal: 'izoh', fayl_id: faylId, matn, eslatilgan });
export const hmUlash = (p: { nishonTuri: 'fayl' | 'papka'; nishonId: number; subyektTuri: 'foydalanuvchi' | 'rol' | 'kompaniya' | 'havola'; subyektId?: number | null; rol?: string; daraja?: string; muddatSoat?: number }) =>
  yoz<{ ok: true; havola?: string; tugaydi?: string }>({ amal: 'ulash', op: 'bering', nishon_turi: p.nishonTuri, nishon_id: p.nishonId, subyekt_turi: p.subyektTuri, subyekt_id: p.subyektId, rol: p.rol, daraja: p.daraja, muddat_soat: p.muddatSoat });
export const hmUlashBekor = (ulashId: number) => yoz({ amal: 'ulash', op: 'bekor', ulash_id: ulashId });
export const hmSozlamaYoz = (kompaniyaId: number, p: { havolaRuxsat?: boolean; ortiqcha?: boolean }) => yoz({ amal: 'sozlama', kompaniya_id: kompaniyaId, havola_ruxsat: p.havolaRuxsat, ortiqcha: p.ortiqcha });
export const hmAbadiy = (faylId: number) => yoz({ amal: 'abadiy', fayl_id: faylId });
export const hmBosh = (kompaniyaId: number | null, tur: 'savat' | 'eski_versiyalar') => yoz({ amal: 'bosh', kompaniya_id: kompaniyaId, tur });
export const hmRejaOl = (kompaniyaId: number, tarifKod: string, oylar: number) => yoz<{ ok: true; token: number; tugaydi: string }>({ amal: 'reja', kompaniya_id: kompaniyaId, tarif_kod: tarifKod, oylar, operation_id: crypto.randomUUID() });

export async function hmYukla(p: { file: File; kompaniyaId?: number | null; papkaId?: number | null; faylId?: number | null }): Promise<HmNatija<{ ok: true; fayl_id: number; raqam: number; ozgarmadi?: boolean }>> {
  if (p.file.size > HM_KATTA_CHEGARA) return hmYuklaKatta(p); // > 90 MB: bo'lakli yuklash
  const f = new FormData();
  f.set('fayl', p.file); f.set('operation_id', crypto.randomUUID());
  if (p.kompaniyaId) f.set('kompaniya_id', String(p.kompaniyaId));
  if (p.papkaId) f.set('papka_id', String(p.papkaId));
  if (p.faylId) f.set('fayl_id', String(p.faylId));
  try {
    const r = await fetch('/api/hujjat-maydoni-yukla', { method: 'POST', credentials: 'same-origin', body: f });
    return await r.json();
  } catch (e) { return { ok: false, code: 'TARMOQ', xato: e instanceof Error ? e.message : 'Aloqa xatosi' }; }
}

export const hmOlUrl = (faylId: number, v?: number, korish = false) => `/api/hujjat-maydoni-ol?${qs({ id: faylId, v, korish })}`;
export async function hmBaytlar(faylId: number, v?: number): Promise<{ bayt: Uint8Array; mime: string } | null> {
  const r = await fetch(hmOlUrl(faylId, v), { credentials: 'same-origin' });
  if (!r.ok) return null;
  return { bayt: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('Content-Type') || 'application/octet-stream' };
}

export const hmHajm = (b: number | null | undefined) => {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};
export const hmKvotaHolat = (k: Kvota | undefined | null): 'ok' | 'ogoh80' | 'ogoh95' | 'toldi' => {
  if (!k || !k.limit) return 'ok';
  const f = (k.ishlatilgan * 100) / k.limit;
  return f >= 100 ? 'toldi' : f >= 95 ? 'ogoh95' : f >= 80 ? 'ogoh80' : 'ok';
};
export const hmDarajaNomi = (d: string) => (d === 'tahrir' ? 'Tahrirlash' : d === 'izoh' ? 'Izoh qoldirish' : 'Ko‘rish');

