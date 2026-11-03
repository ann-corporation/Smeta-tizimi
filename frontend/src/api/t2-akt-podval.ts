/**
 * t2-akt-podval.ts — F2 hujjat podvali (egasi 2026-11-03). O'qish: /api/sb {soro:'akt_podval_ol_v1'|'akt_podval_nomzod_v1'};
 * yozish: /api/sb-yoz {amal:'akt_podval_yoz_v1'} (import / storno nusxasi / backfill). Actor sessiyadan.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';
import type { AktPodvalQator, AktPodvalYuk } from '../lib/akt-podval';
import { aktPodvalRpcYuki } from '../lib/akt-podval';
import { f2StornoAktIdlari } from './t2-f2-storno';

async function soroOqi<T>(body: Record<string, unknown>): Promise<{ ok: boolean; natija?: T; error?: string }> {
  const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

/** Obyektning barcha (akt, blok) podvallari. Xato — bo'sh ro'yxat emas, `ok:false` (NULL ≠ "podval yo'q"). */
export async function aktPodvallariniOl(obyektId: number): Promise<{ ok: boolean; podvallar: AktPodvalQator[]; error?: string }> {
  const r = await soroOqi<{ ok?: boolean; podvallar?: AktPodvalQator[]; code?: string }>({ soro: 'akt_podval_ol_v1', obyekt_id: obyektId });
  const n = r.natija;
  if (!r.ok || !n || n.ok === false) return { ok: false, podvallar: [], error: r.error || n?.code || 'PODVAL_OQILMADI' };
  return { ok: true, podvallar: n.podvallar ?? [] };
}

export type PodvalNomzod = {
  akt_id: number; raqam: string | null; oy: string | null; holat: string; qator_soni: number; pryamye: number | null;
  podval_manba: 'import' | 'storno' | 'smeta' | 'backfill' | null;
  reestr_qqssiz: number | null; reestr_qqs: number | null; reestr_qqs_bilan: number | null;
};
export async function podvalNomzodlari(obyektId: number): Promise<{ ok: boolean; aktlar: PodvalNomzod[]; error?: string }> {
  const r = await soroOqi<{ ok?: boolean; aktlar?: PodvalNomzod[]; code?: string }>({ soro: 'akt_podval_nomzod_v1', obyekt_id: obyektId });
  const n = r.natija;
  if (!r.ok || !n || n.ok === false) return { ok: false, aktlar: [], error: r.error || n?.code || 'NOMZOD_OQILMADI' };
  return { ok: true, aktlar: n.aktlar ?? [] };
}

type YozNatija = AktNatija & { code?: string; podval_yoq?: boolean; yoq_kodlar?: string[] };

/** Hujjatning o'z podvalini yozadi (manba: import — yangi qoralama; backfill — tasdiqlangan F2). */
export function aktPodvalYoz(p: { kompaniyaId: number; aktId: number; blok?: string; manba: 'import' | 'smeta' | 'backfill'; podval: AktPodvalYuk }): Promise<YozNatija> {
  return yozAmali({ amal: 'akt_podval_yoz_v1', kompaniya_id: p.kompaniyaId, akt_id: p.aktId, blok: p.blok ?? '', manba: p.manba, podval: aktPodvalRpcYuki(p.podval) }) as Promise<YozNatija>;
}

export type StornoTarqatNatija = { topildi: number; yangilandi: number; podvalYoq: number; xato: number };

/**
 * Podval tiklangandan keyin: shu aktning mavjud TASDIQLANMAGAN (qoralama) storno aktlariga (qatorlari `raw_snapshot.stornoOf` = akt id,
 * blok = akt id) podvalni ishora-teskari nusxalaydi (`akt_podval_yoz_v1`, manba storno). Tasdiqlangan/bekor stornolarga tegilmaydi.
 */
export async function aktPodvalStornoQoralamalarga(p: { kompaniyaId: number; obyektId: number; manbaAktId: number }): Promise<StornoTarqatNatija> {
  const [idlar, nomzod] = await Promise.all([f2StornoAktIdlari(p.manbaAktId, p.obyektId), podvalNomzodlari(p.obyektId)]);
  if (!nomzod.ok) throw new Error('NOMZOD_OQILMADI');
  const qoralama = new Set(nomzod.aktlar.filter((a) => a.holat === 'qoralama').map((a) => a.akt_id));
  const nishon = idlar.filter((id) => id !== p.manbaAktId && qoralama.has(id));
  const n: StornoTarqatNatija = { topildi: nishon.length, yangilandi: 0, podvalYoq: 0, xato: 0 };
  for (const aktId of nishon) {
    const r = await aktPodvalStornoNusxa({ kompaniyaId: p.kompaniyaId, aktId, manbaAktId: p.manbaAktId }).catch(() => null);
    if (!r?.ok) n.xato++; else if (r.podval_yoq) n.podvalYoq++; else n.yangilandi++;
  }
  return n;
}

/** Storno qoralamasi uchun manba aktning podvalini ishora-teskari nusxalaydi (`blok` = manba akt id). Manbada podval yo'q — `podval_yoq`. */
export function aktPodvalStornoNusxa(p: { kompaniyaId: number; aktId: number; manbaAktId: number }): Promise<YozNatija> {
  return yozAmali({ amal: 'akt_podval_yoz_v1', kompaniya_id: p.kompaniyaId, akt_id: p.aktId, blok: String(p.manbaAktId), manba: 'storno', manba_akt_id: p.manbaAktId }) as Promise<YozNatija>;
}
