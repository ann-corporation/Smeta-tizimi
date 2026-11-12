/**
 * t2-loyiha-smeta.ts — Loyiha <-> Smeta <-> Fakt solishtirma klienti. Shlyuz: /api/loyiha-smeta (ruxsat va a'zolik serverda).
 */
import { yangiOperationId } from './supabase';
import type { FarqMiqdor, QarorTuri } from '../lib/loyiha-smeta/farq';
import type { SmetaQator } from '../lib/loyiha-smeta/moslash';
import type { Element } from '../lib/loyiha-smeta/profil';
import { eskirganBolimlar, tahrirJami, tahrirJuftligi, tahrirQatorlari, type TahrirFarqDB, type TahrirQarorTuri } from '../lib/loyiha-smeta/tahrir-farq';
import type { TahrirMalumot } from '../lib/loyiha-smeta/tahrir-jarvis';

export type Javob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
type Xom = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, init);
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

async function oqi<T>(bolim: string, kompaniyaId: number, obyektId: number, qosh: Record<string, number> = {}): Promise<Javob<T>> {
  const q = new URLSearchParams({ bolim, kompaniya_id: String(kompaniyaId), obyekt_id: String(obyektId), ...Object.fromEntries(Object.entries(qosh).map(([k, v]) => [k, String(v)])) });
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
export const loyihaXaritaOl = (k: number, o: number) => oqi<{ xarita: { varaq: string; bolim_qator_id: number; manba: 'qolda' | 'taklif' }[] }>('xarita', k, o);
export const loyihaXaritaYoz = (k: number, p: { obyektId: number; varaq: string; bolimId: number; harakat: 'qosh' | 'ochir'; manba?: 'qolda' | 'taklif'; sabab?: string }) =>
  yoz('xarita', k, { obyekt_id: p.obyektId, varaq: p.varaq, bolim_qator_id: p.bolimId, harakat: p.harakat, manba: p.manba ?? 'qolda', sabab: p.sabab ?? null });
export const loyihaSmetaOl = (k: number, o: number) => oqi<{ qatorlar: (SmetaQator & { versiya?: number | null })[] }>('smeta', k, o);

export type YozElement = Pick<Element, 'nom' | 'belgi' | 'birlik' | 'miqdor' | 'tur' | 'ishonch'> & { manba_r2?: string | null; manba_sahifa?: number | null; manba_ref?: string | null };
export const loyihaYoz = (k: number, p: { obyektId: number; varaq: string; revizya: number; items: YozElement[]; toplamId?: number | null }) =>
  yoz<{ yangi?: number; ozgargan?: number; ayni?: number; olingan?: number; qayta?: boolean }>('yoz', k, { obyekt_id: p.obyektId, varaq: p.varaq, revizya: p.revizya, items: p.items, toplam_id: p.toplamId ?? null, operation_id: yangiOperationId() });
export const loyihaTasdiq = (k: number, ids: number[], holat: 'tasdiqlangan' | 'rad' | 'taklif') => yoz<{ yangilandi: number }>('tasdiq', k, { ids, holat });
export const loyihaBoglash = (k: number, p: { miqdorId: number; qatorId: number; ball?: number | null; sabab?: string; harakat: 'qosh' | 'ochir' }) =>
  yoz('boglash', k, { miqdor_id: p.miqdorId, qator_id: p.qatorId, ball: p.ball ?? null, sabab: p.sabab ?? null, harakat: p.harakat });
export const loyihaQaror = (k: number, p: { miqdorId: number; tur: QarorTuri; qatorId?: number | null; refJadval?: string | null; refId?: number | null; sabab?: string }) =>
  yoz('qaror', k, { miqdor_id: p.miqdorId, tur: p.tur, qator_id: p.qatorId ?? null, ref_jadval: p.refJadval ?? null, ref_id: p.refId ?? null, sabab: p.sabab ?? null });

/** Jarvis uchun: tasdiqlangan miqdorlar bo'yicha farqlar (farq.ts, hisob-yadro). Ma'lumot yo'q yoki xato bo'lsa null. */
export async function loyihaFarqMalumotOl(k: number, o: number): Promise<import('../lib/loyiha-smeta/jarvis').LoyihaFarqMalumot | null> {
  const [f, r, s, tahrir] = await Promise.all([loyihaFarqOl(k, o), loyihaRoyxatOl(k, o), loyihaSmetaOl(k, o), loyihaTahrirMalumotOl(k, o)]);
  if ((!f.ok || !s.ok) && !tahrir) return null;
  if (!f.ok || !s.ok) return { farqlar: [], taklifSoni: 0, tasdiqlanganSoni: 0, tahrir };
  const { farqlarniHisobla } = await import('../lib/loyiha-smeta/farq');
  const bogli = new Set(r.ok ? r.natija.miqdorlar.flatMap((x) => x.boglar) : []);
  const xr = await loyihaXaritaOl(k, o);
  const qolda = new Map<string, Set<number>>(); if (xr.ok) for (const x of xr.natija.xarita) qolda.set(x.varaq, new Set([...(qolda.get(x.varaq) ?? []), x.bolim_qator_id]));
  return { farqlar: farqlarniHisobla(f.natija.miqdorlar, s.natija.qatorlar, bogli, { qolda }), taklifSoni: f.natija.taklif_soni, tasdiqlanganSoni: f.natija.tasdiqlangan_soni, tahrir };
}
/* ───── Chizma TAHRIRLARI (ekspertiza, o'zgarish): farq, smeta asosi, qarorlar ───── */
export type TahrirQatori = { id: number; nom: string; sana: string | null; smeta_asosi: boolean; yaratildi: string; varaq_soni: number; element_soni: number };
export const loyihaTahrirRoyxatOl = (k: number, o: number) => oqi<{ tahrirlar: TahrirQatori[] }>('tahrir_royxat', k, o);
export const loyihaTahrirFarqOl = (k: number, o: number, eski: number, yangi: number) => oqi<TahrirFarqDB>('tahrir_farq', k, o, { eski_id: eski, yangi_id: yangi });
export const loyihaTahrirYarat = (k: number, p: { obyektId: number; nom: string; sana?: string | null }) => yoz<{ id: number; qayta?: boolean }>('tahrir_yarat', k, { obyekt_id: p.obyektId, nom: p.nom, sana: p.sana ?? null });
export const loyihaTahrirYoz = (k: number, p: { obyektId: number; tahrirId: number; varaq: string; revizya: number; items: YozElement[]; toplamId?: number | null }) =>
  yoz<{ yangi?: number; ozgargan?: number; ayni?: number; olingan?: number; qayta?: boolean }>('tahrir_yoz', k, { obyekt_id: p.obyektId, tahrir_id: p.tahrirId, varaq: p.varaq, revizya: p.revizya, items: p.items, toplam_id: p.toplamId ?? null, operation_id: yangiOperationId() });
export const loyihaTahrirAsos = (k: number, p: { obyektId: number; tahrirId: number }) => yoz('tahrir_asos', k, { obyekt_id: p.obyektId, tahrir_id: p.tahrirId });
export const loyihaTahrirQaror = (k: number, p: { obyektId: number; eskiId: number; yangiId: number; varaq: string; kalit: string; qaror: TahrirQarorTuri; sabab?: string }) =>
  yoz('tahrir_qaror', k, { obyekt_id: p.obyektId, eski_id: p.eskiId, yangi_id: p.yangiId, varaq: p.varaq, kalit: p.kalit, qaror: p.qaror, sabab: p.sabab ?? null });

/** Jarvis uchun: «smeta asosi» (bo'lmasa birinchi) ↔ oxirgi tahrir farqi. Ikkita tahrir bo'lmasa yoki xato bo'lsa null. */
export async function loyihaTahrirMalumotOl(k: number, o: number): Promise<TahrirMalumot | null> {
  const t = await loyihaTahrirRoyxatOl(k, o); if (!t.ok) return null;
  const j = tahrirJuftligi(t.natija.tahrirlar); if (!j) return null;
  const f = await loyihaTahrirFarqOl(k, o, j.eski, j.yangi); if (!f.ok) return null;
  const nom = (id: number) => t.natija.tahrirlar.find((x) => x.id === id)?.nom ?? String(id);
  const qatorlar = tahrirQatorlari(f.natija);
  return { eskiNom: nom(j.eski), yangiNom: nom(j.yangi), smetaEskirgan: j.smetaEskirgan, db: f.natija, qatorlar, bolimlar: eskirganBolimlar(qatorlar), jami: tahrirJami(f.natija, qatorlar) };
}
