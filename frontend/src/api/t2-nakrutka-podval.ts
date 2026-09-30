/**
 * t2-nakrutka-podval.ts — nakrutka podval konstruktori (egasi Q6, 2026-10-01).
 * Migratsiya: 20261105110000_t2_nakrutka_podval_v1. Tuzilma: lib/nakrutka-konstruktor.ts.
 *
 * Hal qilish tartibi (hujjatlar va sahifalar shu funksiyadan oladi — BITTA manba):
 *   obyekt podvali → shartnoma podvali → kompaniya podvali → null (standart kaskad, koeffitsientlardan).
 */
import { sbOqi } from './supabase';
import type { Podval, PodvalQator } from '../lib/nakrutka-konstruktor';

export type PodvalYozuv = {
  id: number; kompaniya_id: number; obyekt_id: number | null; obyekt: string | null;
  shartnoma_id: number | null; shartnoma: string | null;
  nom: string; qatorlar: PodvalQator[]; versiya: number; kim: string | null;
  yaratildi: string; yangilandi: string;
};

export type PodvalDoira = { obyektId?: number | null; shartnomaId?: number | null };

export function sbPodvallarOl(kompaniyaId: number) {
  return sbOqi<PodvalYozuv>({ jadval: 't2_nakrutka_podval_royxat', filtr: 'kompaniya_id=eq.' + kompaniyaId, tartib: 'yangilandi.desc', limit: 500 });
}

/** Doira bo'yicha amaldagi podval (maxsus bo'lmasa — null, ya'ni standart). */
export function podvalTanla(royxat: readonly PodvalYozuv[], d: PodvalDoira): PodvalYozuv | null {
  if (d.obyektId) { const o = royxat.find((p) => p.obyekt_id === d.obyektId); if (o) return o; }
  if (d.shartnomaId) { const s = royxat.find((p) => p.shartnoma_id === d.shartnomaId && p.obyekt_id == null); if (s) return s; }
  return royxat.find((p) => p.obyekt_id == null && p.shartnoma_id == null) ?? null;
}

/** Amaldagi maxsus podval (hujjat eksportlari uchun): null — standart kaskad. */
export async function amaldagiPodval(kompaniyaId: number, d: PodvalDoira): Promise<Podval | null> {
  const r = await sbPodvallarOl(kompaniyaId);
  const p = r.ok ? podvalTanla(r.qatorlar ?? [], d) : null;
  return p ? { versiya: 1, nom: p.nom, qatorlar: p.qatorlar } : null;
}

type Natija = { ok: boolean; error?: string; sabab?: string; id?: number; versiya?: number; bordagi_versiya?: number };

async function yoz(yuk: Record<string, unknown>): Promise<Natija> {
  try {
    const r = await fetch('/api/sb-yoz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
    return (await r.json()) as Natija;
  } catch (e) {
    return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

export function sbPodvalSaqla(p: { kompaniyaId: number; doira: PodvalDoira; nom: string; qatorlar: PodvalQator[]; id?: number; kutilganVersiya?: number; operationId?: string }) {
  return yoz({
    amal: 'nakrutka_podval_saqla', kompaniya_id: p.kompaniyaId, obyekt_id: p.doira.obyektId ?? null, shartnoma_id: p.doira.shartnomaId ?? null,
    nom: p.nom, qatorlar: p.qatorlar, id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
  });
}

/** Maxsus podvalni o'chirish (faolsizlantirish) — doira standartga qaytadi, tarix saqlanadi. */
export function sbPodvalOchir(kompaniyaId: number, id: number, kutilganVersiya: number) {
  return yoz({ amal: 'nakrutka_podval_ochir', kompaniya_id: kompaniyaId, id, kutilgan_versiya: kutilganVersiya });
}

/** Hujjat yasashdan oldin: obyekt uchun amaldagi maxsus podval (xato bo'lsa — null, standart). */
export async function obyektPodvali(kompaniyaId: number | null | undefined, obyektId: number, shartnomaId?: number | null): Promise<Podval | null> {
  if (!kompaniyaId) return null;
  try { return await amaldagiPodval(kompaniyaId, { obyektId, shartnomaId: shartnomaId ?? null }); } catch { return null; }
}

/** Server kategoriya bucketi (МАТ = МАТ+КАБ+М/К+БЕЗ СКЛАД) → konstruktor kategoriyalari. */
export function serverCatsKatga(c: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number }) {
  return { ЧЕЛ: c.chel, МАШ: c.mash, МАТ: c.mat - c.kab - c.mk - c.bez, ОБ: c.ob, КАБ: c.kab, 'М/К': c.mk, 'БЕЗ СКЛАД': c.bez };
}
