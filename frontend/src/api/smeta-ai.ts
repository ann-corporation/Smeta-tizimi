/** Client for /api/smeta-ai (Smetachi AI worker — proposals only). */
import type { NormaTajriba } from '../lib/smeta-ai/tajriba';
import type { IshNiyati, KoefSorovi, KoefTanlov, KpOqish, NarxSorovi, NarxTanlov, SuhbatJavobi, SuhbatXabari, Tanlov, TanlovSorovi } from '../lib/smeta-ai/protokol';

export type AiXato = { ok: false; code: string; message?: string };
async function post<T>(body: unknown): Promise<T | AiXato> {
  try {
    const r = await fetch('/api/smeta-ai', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as T | AiXato | null;
    return j ?? { ok: false, code: 'NETWORK' };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
/** `smeta` — the estimate being built as text (lib/smeta-studio/ai-kontekst), so the model reads the whole draft. */
export const smetachiSuhbat = (kompaniyaId: number, xabarlar: SuhbatXabari[], ishlar: IshNiyati[], obyekt: string, smeta?: string,
  fayl?: { mimeType?: string; data?: string; nom: string; matn?: string } | null) =>
  post<{ ok: true; model: string; xom?: string; tushunildi?: boolean; ogohlantirish?: string } & SuhbatJavobi>({ amal: 'suhbat', kompaniya_id: kompaniyaId, xabarlar, ishlar, obyekt, smeta,
    ...(fayl?.matn ? { hujjat_matn: fayl.matn, hujjat_nom: fayl.nom } : fayl?.data ? { fayl: { mimeType: fayl.mimeType, data: fayl.data, nom: fayl.nom } } : {}) });
/**
 * Estimator memory on three levels (owner 2026-10-16: "AI xotirasi kompaniya, foydalanuvchi va butun tizim darajasida bo'lsin"):
 * «foydalanuvchi» — only this person's style, «kompaniya» — every user of the company, «tizim» — the whole platform (superadmin).
 */
export type XotiraDaraja = 'foydalanuvchi' | 'kompaniya' | 'tizim';
export type XotiraYozuv = { kalit: string; mazmun: string; yangilandi?: string; daraja: XotiraDaraja };
export async function smetaXotirasi(kompaniyaId: number): Promise<{ yozuvlar: XotiraYozuv[]; superadmin: boolean }> {
  const j = await post<{ ok: true; tizim?: XotiraYozuv[]; kompaniya?: XotiraYozuv[]; foydalanuvchi?: XotiraYozuv[]; superadmin?: boolean }>({ amal: 'xotira', kompaniya_id: kompaniyaId });
  if (!j.ok) return { yozuvlar: [], superadmin: false };
  const d = (l: XotiraYozuv[] | undefined, daraja: XotiraDaraja) => (l ?? []).filter(x => x.kalit?.startsWith('smeta.') && x.mazmun && x.mazmun !== '-').map(x => ({ ...x, daraja }));
  return { yozuvlar: [...d(j.foydalanuvchi, 'foydalanuvchi'), ...d(j.kompaniya, 'kompaniya'), ...d(j.tizim, 'tizim')], superadmin: j.superadmin === true };
}
export async function smetaXotiraYoz(kompaniyaId: number, mazmun: string, daraja: XotiraDaraja = 'kompaniya', kalit?: string): Promise<boolean> {
  const k = kalit ?? `smeta.${[...mazmun].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36)}`;
  const j = await post<{ ok: boolean }>({ amal: 'xotira_yoz', kompaniya_id: kompaniyaId, daraja, kalit: k, mazmun: mazmun.slice(0, 1500) });
  return j.ok === true;
}
/** Every norm the estimator put into the estimate — the platform learns which norm practitioners use for which work. */
export const smetaTajribaYoz = (kompaniyaId: number, tanlovlar: Array<{ kod: string; tavsif: string; birlik: string; koef?: string; manba: 'ai' | 'qolda' }>) =>
  post<{ ok: true; yozildi: number }>({ amal: 'tajriba_yoz', kompaniya_id: kompaniyaId, tanlovlar });
/** AI picks normative coefficients that match the stated work conditions (codes only from the list sent). */
export const smetachiKoefTanla = (kompaniyaId: number, sharoit: string, sorovlar: KoefSorovi[]) =>
  post<{ ok: true; tanlovlar: KoefTanlov[]; savol: string | null }>({ amal: 'koef_tanla', kompaniya_id: kompaniyaId, sharoit, sorovlar });
/** AI reads a КП / price list (PDF or image as base64, or table text). Nothing is stored by this call. */
export const smetachiKpOqi = (kompaniyaId: number, p: { fayl?: { mimeType: string; data: string }; matn?: string }) =>
  post<{ ok: true; kp: KpOqish; model: string }>({ amal: 'kp_oqi', kompaniya_id: kompaniyaId, ...p });
export const smetachiTanla = (kompaniyaId: number, sorovlar: TanlovSorovi[]) =>
  post<{ ok: true; tanlovlar: Tanlov[]; tajriba?: Record<string, NormaTajriba> }>({ amal: 'tanla', kompaniya_id: kompaniyaId, sorovlar });
/** AI picks a price candidate per resource among the ones the browser found (catalogue / company estimates). */
export const smetachiNarxTanla = (kompaniyaId: number, sorovlar: NarxSorovi[], hudud: string | null) =>
  post<{ ok: true; tanlovlar: NarxTanlov[] }>({ amal: 'narx_tanla', kompaniya_id: kompaniyaId, sorovlar, hudud });
