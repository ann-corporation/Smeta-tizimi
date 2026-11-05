/**
 * Ish kartasi (migratsiya 20261203000600). O'qish: /api/sb `ish_kartasi_ol_v1` (STABLE, GET; a'zolik + smeta.read RPC ichida).
 * Yozish: /api/sb-yoz `ish_kartasi_saqla_v1`, `ish_kartasi_arxiv_v1`, `ish_kartasi_ulush_saqla_v1` (smeta.write, idempotent operation_id, CAS).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';
import type { AmaliyBirlik, BogRol, Bosqich, BosqichUlush, KartaParametr, KartaTur, MatGuruh, Qamrov, SmetaQator } from '../lib/ish-kartasi';

export type KartaBogYozuv = {
  id?: number; qator_id: number | null; obyekt_id: number; rol: BogRol; koef: number | null;
  koef_usul: 'qolda' | 'parametr' | 'nisbat'; bosqich: Bosqich | null; material_guruh: MatGuruh | null;
  kod?: string | null; nom?: string | null; birlik?: string | null; manba?: 'qolda' | 'avto' | 'ai_loyiha'; ishonch?: number | null; tartib?: number;
};

export type IshKarta = {
  id: number; nom: string; tur: KartaTur; birlik: AmaliyBirlik; parametrlar: KartaParametr;
  bosqich_ulush: BosqichUlush | null; qamrov: Partial<Qamrov> | null;
  naryad_narx: number | null; naryad_sana: string | null; usta_nom: string | null; usta_kontragent_id: number | null;
  manba: 'qolda' | 'ai_loyiha'; ishonch: number | null; manba_hujjat_id: number | null; manba_sahifa: number | null;
  izoh: string | null; holat: 'faol' | 'arxiv'; versiya: number; bog: KartaBogYozuv[];
};
export type KompaniyaUlush = { tur: KartaTur; ulush: BosqichUlush; manba: string; versiya: number };

type OqishJavob<T> = { ok: boolean; code?: string } & T;

async function ol<T>(kompaniyaId: number, bolim: string, filtr: Record<string, unknown>): Promise<OqishJavob<T> | null> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'ish_kartasi_ol_v1', kompaniya_id: kompaniyaId, bolim, filtr }),
    });
    const j = await r.json() as { ok: boolean; natija?: OqishJavob<T> };
    return j.ok && j.natija?.ok ? j.natija : null;
  } catch { return null; }
}

const son = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);

/** Server qatori → toza son maydonlar (NUMERIC matn bo'lib kelishi mumkin; null qoladi). */
export function qatorTozala(x: SmetaQator): SmetaQator {
  return {
    ...x, hajm: son(x.hajm), summa: son(x.summa),
    bolalar: (x.bolalar ?? []).map((b) => ({ ...b, hajm: son(b.hajm), summa: son(b.summa), norma: son(b.norma), narx: son(b.narx) })),
  };
}

export async function kartalarOl(kompaniyaId: number): Promise<{ kartalar: IshKarta[]; ulushlar: KompaniyaUlush[] } | null> {
  const r = await ol<{ kartalar: IshKarta[]; ulushlar: KompaniyaUlush[] }>(kompaniyaId, 'kartalar', {});
  if (!r) return null;
  return {
    kartalar: (r.kartalar ?? []).map((k) => ({ ...k, naryad_narx: son(k.naryad_narx), bog: (k.bog ?? []).map((b) => ({ ...b, koef: son(b.koef) })) })),
    ulushlar: r.ulushlar ?? [],
  };
}

export async function qatorlarOl(kompaniyaId: number, ids: number[], qoshni = false): Promise<{ qatorlar: SmetaQator[]; qoshnilar: SmetaQator[] } | null> {
  const r = await ol<{ qatorlar: SmetaQator[]; qoshnilar: SmetaQator[] }>(kompaniyaId, 'qatorlar', { ids: ids.slice(0, 200), qoshni });
  if (!r) return null;
  return { qatorlar: (r.qatorlar ?? []).map(qatorTozala), qoshnilar: (r.qoshnilar ?? []).map(qatorTozala) };
}

export async function smetadanQidir(kompaniyaId: number, q: string): Promise<SmetaQator[] | null> {
  const r = await ol<{ qatorlar: SmetaQator[] }>(kompaniyaId, 'qidir', { q: q.slice(0, 100) });
  return r ? (r.qatorlar ?? []).map(qatorTozala) : null;
}

export function kartaSaqla(p: {
  kompaniyaId: number; id: number | null; kutilganVersiya: number | null; operationId: string;
  karta: Omit<IshKarta, 'id' | 'versiya' | 'holat' | 'bog'>; bog: KartaBogYozuv[];
}): Promise<AktNatija & { id?: number; versiya?: number; code?: string }> {
  return yozAmali({
    amal: 'ish_kartasi_saqla_v1', kompaniya_id: p.kompaniyaId, karta_id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
    karta: p.karta, bog: p.bog.map((b) => ({ qator_id: b.qator_id, rol: b.rol, koef: b.koef, koef_usul: b.koef_usul, bosqich: b.bosqich, material_guruh: b.material_guruh, manba: b.manba ?? 'qolda', ishonch: b.ishonch ?? null })),
  });
}

export function kartaArxiv(p: { kompaniyaId: number; id: number; kutilganVersiya: number; operationId: string }) {
  return yozAmali({ amal: 'ish_kartasi_arxiv_v1', kompaniya_id: p.kompaniyaId, karta_id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId });
}

export function ulushSaqla(p: { kompaniyaId: number; tur: KartaTur; ulush: BosqichUlush; kutilganVersiya: number | null; operationId: string }) {
  return yozAmali({ amal: 'ish_kartasi_ulush_saqla_v1', kompaniya_id: p.kompaniyaId, tur: p.tur, ulush: p.ulush, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId });
}
