/**
 * t2-loyiha-smeta.ts — Loyiha <-> Smeta <-> Fakt solishtirma klienti. Shlyuz: /api/loyiha-smeta (ruxsat va a'zolik serverda).
 */
import { yangiOperationId } from './supabase';
import type { FarqMiqdor, QarorTuri } from '../lib/loyiha-smeta/farq';
import type { SmetaQator } from '../lib/loyiha-smeta/moslash';
import type { Element } from '../lib/loyiha-smeta/profil';

export type Javob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
type Xom = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, init);
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

async function oqi<T>(bolim: string, kompaniyaId: number, obyektId: number): Promise<Javob<T>> {
  const q = new URLSearchParams({ bolim, kompaniya_id: String(kompaniyaId), obyekt_id: String(obyektId) });
  const d = await chaqir('/api/loyiha-smeta?' + q.toString(), { credentials: 'same-origin' });
  return d.ok === false ? { ok: false, error: d.error || 'Xato', code: d.code } : { ok: true, natija: d as unknown as T };
}

async function yoz<T = Record<string, unknown>>(amal: string, kompaniyaId: number, yuk: Record<string, unknown>): Promise<Javob<T>> {
  const d = await chaqir('/api/loyiha-smeta', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, kompaniya_id: kompaniyaId, ...yuk }) });
  return d.ok === false ? { ok: false, error: d.error || 'Xato', code: d.code } : { ok: true, natija: d as unknown as T };
}

export type MiqdorQatori = {
  id: number; varaq: string; revizya: number; nom: string; belgi: string | null; birlik: string; miqdor: number | null; tur: Element['tur'];
  manba_r2: string | null; manba_sahifa: number | null; manba_ref: string | null; ishonch: number | null; holat: 'taklif' | 'tasdiqlangan' | 'rad';
  eskirgan: boolean; revizya_farq: 'yangi' | 'ozgargan' | 'ayni' | 'olingan' | null; oldingi_miqdor: number | null; boglar: number[]; qaror: QarorTuri | null;
};

export const loyihaRoyxatOl = (k: number, o: number) => oqi<{ miqdorlar: MiqdorQatori[] }>('royxat', k, o);
export const loyihaFarqOl = (k: number, o: number) => oqi<{ taklif_soni: number; tasdiqlangan_soni: number; miqdorlar: FarqMiqdor[] }>('farq', k, o);
export const loyihaSmetaOl = (k: number, o: number) => oqi<{ qatorlar: (SmetaQator & { versiya?: number | null })[] }>('smeta', k, o);

export type YozElement = Pick<Element, 'nom' | 'belgi' | 'birlik' | 'miqdor' | 'tur' | 'ishonch'> & { manba_r2?: string | null; manba_sahifa?: number | null; manba_ref?: string | null };
export const loyihaYoz = (k: number, p: { obyektId: number; varaq: string; revizya: number; items: YozElement[]; toplamId?: number | null }) =>
  yoz<{ yangi?: number; ozgargan?: number; ayni?: number; olingan?: number; qayta?: boolean }>('yoz', k, { obyekt_id: p.obyektId, varaq: p.varaq, revizya: p.revizya, items: p.items, toplam_id: p.toplamId ?? null, operation_id: yangiOperationId() });
export const loyihaTasdiq = (k: number, ids: number[], holat: 'tasdiqlangan' | 'rad' | 'taklif') => yoz<{ yangilandi: number }>('tasdiq', k, { ids, holat });
export const loyihaBoglash = (k: number, p: { miqdorId: number; qatorId: number; ball?: number | null; sabab?: string; harakat: 'qosh' | 'ochir' }) =>
  yoz('boglash', k, { miqdor_id: p.miqdorId, qator_id: p.qatorId, ball: p.ball ?? null, sabab: p.sabab ?? null, harakat: p.harakat });
export const loyihaQaror = (k: number, p: { miqdorId: number; tur: QarorTuri; qatorId?: number | null; refJadval?: string | null; refId?: number | null; sabab?: string }) =>
  yoz('qaror', k, { miqdor_id: p.miqdorId, tur: p.tur, qator_id: p.qatorId ?? null, ref_jadval: p.refJadval ?? null, ref_id: p.refId ?? null, sabab: p.sabab ?? null });
