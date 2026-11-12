/**
 * Bozor (P1) — gateway mijozi: `/api/bozor` (kirgan foydalanuvchi), `/api/bozor-ochiq` (kirmasdan, GET), `/api/bozor-rasm` (foto).
 * Actor sessiyadan; sotuvchi kompaniyasiz (yakka) ishlaydi. Narx QQS siz; NULL = noma'lum. Server: 20261216500000_t2_bozor_p1_v1.
 */
import { yangiOperationId } from './supabase';
import type { ElonTur } from '../lib/bozor/katalog';

export type BzNatija<T> = { ok: true; natija: T } | { ok: false; code: string };
export type SotuvchiReyting = { ortacha: number | null; soni: number };
export type OchiqElon = {
  id: number; tur: ElonTur; sarlavha: string; kategoriya: string | null; birlik: string; narx_qqs_siz: number | null; qqs_bor: boolean; min_hajm: number | null;
  hudud: string | null; radius_km: number | null; rasmlar: string[]; yaratildi: string; sotuvchi_id: number; sotuvchi_nom: string; sotuvchi_tur: string;
  sotuvchi_reyting: number | null; sotuvchi_baho_soni: number;
};
export type ElonTafsilot = {
  elon: Omit<OchiqElon, 'sotuvchi_id' | 'sotuvchi_nom' | 'sotuvchi_tur' | 'sotuvchi_reyting' | 'sotuvchi_baho_soni'> & { tavsif: string | null };
  sotuvchi: { id: number; nom: string; tur: string; hudud: string | null; reyting: SotuvchiReyting };
};
export type SotuvchiSahifa = {
  sotuvchi: { id: number; nom: string; tur: string; hudud: string | null; tavsif: string | null; yaratildi: string; reyting: SotuvchiReyting };
  elonlar: Array<Pick<OchiqElon, 'id' | 'tur' | 'sarlavha' | 'birlik' | 'narx_qqs_siz' | 'qqs_bor' | 'hudud' | 'rasmlar'>>;
  baholar: Array<{ ball: number; izoh: string | null; yaratildi: string }>;
};
export type Profil = { foydalanuvchi_id: number; kompaniya_id: number | null; tur: 'yakka' | 'firma' | 'usta'; nom: string; telefon: string | null; hudud: string | null; tavsif: string | null; reyting: SotuvchiReyting };
export type MeningElon = { id: number; tur: ElonTur; holat: 'qoralama' | 'faol' | 'toxtatilgan' | 'yashirin'; sarlavha: string; birlik: string; narx_qqs_siz: number | null; qqs_bor: boolean; hudud: string | null; rasmlar: string[]; shikoyat_soni: number; yashirin_sabab: string | null };
export type MeningTaklif = { id: number; sorov_id: number; narx_qqs_siz: number; muddat_kun: number | null; yetkazish: boolean; holat: string; sorov_nom: string; birlik: string; hajm: number; sorov_holat: string };
export type MeningBuyurtma = { id: number; nom: string; birlik: string; hajm: number; holat: string; narx_qqs_siz: number; hudud: string | null; buyurtma_bor: boolean; baholangan: boolean };
export type OchiqSorov = { id: number; tur: ElonTur; nom: string; birlik: string; hajm: number; hudud: string | null; muddat_sana: string | null; taklif_soni: number; mening_narxim: number | null };
export type SorovQator = { id: number; tur: ElonTur; nom: string; birlik: string; hajm: number; hudud: string | null; holat: string; taklif_soni: number; urtacha_narx: number | null; buyurtma_id: number | null; baholangan: boolean };
export type TaqqosTaklif = { id: number; sotuvchi_id: number; sotuvchi_nom: string; sotuvchi_tur: string; kompaniyali: boolean; narx_qqs_siz: number; muddat_kun: number | null; yetkazish: boolean; izoh: string | null; holat: string; reyting: number | null; reyting_soni: number };
export type Taqqos = { sorov: { id: number; nom: string; birlik: string; hajm: number; holat: string; hudud: string | null; buyurtma_id: number | null; narx_manba_id: number | null }; urtacha: number | null; soni: number; ogohlantirish: 'urtacha' | null; takliflar: TaqqosTaklif[] };
export type Golib = { sorov_id: number; buyurtma_id: number | null; narx_manba_id: number | null; urtacha: number | null; soni: number; ogohlantirish: 'urtacha' | null; takror?: boolean };
export type ModElon = { id: number; sarlavha: string; tur: ElonTur; holat: string; shikoyat_soni: number; yashirin_sabab: string | null; narx_qqs_siz: number | null; birlik: string; sotuvchi_nom: string; sabablar: string[] };

function ochish<T>(j: { ok?: boolean; natija?: T & { ok?: boolean; code?: string }; code?: string } | null, status: number): BzNatija<T> {
  if (!j?.ok || !j.natija) return { ok: false, code: j?.code ?? 'HTTP_' + status };
  if ((j.natija as { ok?: boolean }).ok === false) return { ok: false, code: (j.natija as { code?: string }).code ?? 'XATO' };
  return { ok: true, natija: j.natija };
}
async function chaqir<T>(amal: string, body: Record<string, unknown>): Promise<BzNatija<T>> {
  try {
    const r = await fetch('/api/bozor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ amal, ...body }) });
    return ochish<T>(await r.json().catch(() => null), r.status);
  } catch { return { ok: false, code: 'NETWORK' }; }
}
const yoz = <T>(amal: string, data: Record<string, unknown>, kompaniyaId?: number, operationId: string = yangiOperationId()) =>
  chaqir<T>(amal, { data, operation_id: operationId, ...(kompaniyaId != null ? { kompaniya_id: kompaniyaId } : {}) });

async function ochiq<T>(p: Record<string, string | string[] | number | undefined>): Promise<BzNatija<T>> {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) { if (v == null || v === '') continue; for (const x of Array.isArray(v) ? v : [v]) u.append(k, String(x)); }
  try {
    const r = await fetch('/api/bozor-ochiq?' + u.toString());
    return ochish<T>(await r.json().catch(() => null), r.status);
  } catch { return { ok: false, code: 'NETWORK' }; }
}

/* Kirmasdan */
export const bzQidir = (f: { q?: string[]; tur?: string; kategoriya?: string; hudud?: string; offset?: number }) => ochiq<{ elonlar: OchiqElon[] }>({ amal: 'qidir', ...f });
export const bzElon = (id: number) => ochiq<ElonTafsilot>({ amal: 'elon', id });
export const bzSotuvchi = (id: number) => ochiq<SotuvchiSahifa>({ amal: 'sotuvchi', id });
export const bzFiltr = () => ochiq<{ kategoriyalar: Array<{ kalit: string; soni: number }>; hududlar: Array<{ nom: string; soni: number }> }>({ amal: 'filtr' });
export const bzRasmUrl = (kalit: string) => '/api/bozor-rasm?k=' + encodeURIComponent(kalit);

/* Sotuvchi */
export const bzProfilOl = () => chaqir<{ profil: Profil | null; sozlama?: Record<string, unknown> }>('profil_ol', {});
export const bzProfilSaqla = (d: { nom: string; tur: string; telefon?: string; hudud?: string; tavsif?: string; kompaniya_id?: number | null }) => yoz<{ foydalanuvchi_id: number }>('profil_saqla', d);
export type ElonForma = { id?: number; tur: ElonTur; holat?: 'qoralama' | 'faol' | 'toxtatilgan'; sarlavha: string; tavsif?: string; kategoriya?: string; birlik: string; narx_qqs_siz?: string | number | null; qqs_bor?: boolean; min_hajm?: string | number | null; hudud?: string; radius_km?: number | null; rasmlar?: string[] };
export const bzElonSaqla = (d: ElonForma) => yoz<{ id: number; holat: string }>('elon_saqla', d as unknown as Record<string, unknown>);
export const bzElonHolat = (id: number, holat: 'faol' | 'toxtatilgan' | 'qoralama') => yoz<{ id: number; holat: string }>('elon_holat', { id, holat });
export const bzKabinet = () => chaqir<{ elonlar: MeningElon[]; takliflar: MeningTaklif[]; buyurtmalar: MeningBuyurtma[] }>('kabinet', {});
export const bzSorovOchiq = (hudud?: string) => chaqir<{ sorovlar: OchiqSorov[] }>('sorov_ochiq', { data: hudud ? { hudud } : {} });
export const bzTaklifBer = (d: { sorov_id: number; narx_qqs_siz: string | number; muddat_kun?: number; yetkazish?: boolean; izoh?: string; elon_id?: number }) => yoz<{ id: number }>('taklif_ber', d);
export const bzYetkazildi = (sorovId: number) => yoz<{ holat: string }>('yetkazildi', { sorov_id: sorovId });
export const bzBaho = (sorovId: number, ball: number, izoh?: string) => yoz<{ sorov_id: number }>('baho', { sorov_id: sorovId, ball, ...(izoh ? { izoh } : {}) });
export const bzShikoyat = (elonId: number, sabab: string) => yoz<{ yashirildi: boolean }>('shikoyat', { elon_id: elonId, sabab });
export async function bzRasmYukla(fayl: File): Promise<BzNatija<{ r2_kalit: string }>> {
  const f = new FormData(); f.append('fayl', fayl); f.append('operation_id', yangiOperationId());
  try {
    const r = await fetch('/api/bozor-rasm', { method: 'POST', body: f, credentials: 'same-origin' });
    const j = await r.json().catch(() => null) as { ok?: boolean; r2_kalit?: string; code?: string } | null;
    return j?.ok && j.r2_kalit ? { ok: true, natija: { r2_kalit: j.r2_kalit } } : { ok: false, code: j?.code ?? 'HTTP_' + r.status };
  } catch { return { ok: false, code: 'NETWORK' }; }
}

/* Xaridor (kompaniya) */
export type SorovForma = { nom: string; birlik: string; hajm: number | string; hudud?: string; resurs_kodi?: string; zayavka_id?: number | null; obyekt_id?: number | null; tur?: ElonTur; muddat_sana?: string };
export const bzSorovYarat = (kompaniyaId: number, d: SorovForma) => yoz<{ id: number }>('sorov_yarat', d as unknown as Record<string, unknown>, kompaniyaId);
export const bzSorovRoyxat = (kompaniyaId: number) => chaqir<{ sorovlar: SorovQator[] }>('sorov_royxat', { kompaniya_id: kompaniyaId });
export const bzTaqqos = (kompaniyaId: number, sorovId: number) => chaqir<Taqqos>('taqqos', { kompaniya_id: kompaniyaId, data: { sorov_id: sorovId } });
export const bzGolibTanla = (kompaniyaId: number, sorovId: number, taklifId: number) => yoz<Golib>('golib_tanla', { sorov_id: sorovId, taklif_id: taklifId }, kompaniyaId);
export const bzQabul = (kompaniyaId: number, sorovId: number) => yoz<{ holat: string }>('qabul', { sorov_id: sorovId }, kompaniyaId);

/* Moderator */
export const bzModRoyxat = () => chaqir<{ elonlar: ModElon[] }>('mod_royxat', {});
export const bzModYashir = (elonId: number, yashir: boolean, sabab?: string) => yoz<{ holat: string }>('mod_yashir', { elon_id: elonId, yashir, ...(sabab ? { sabab } : {}) });
