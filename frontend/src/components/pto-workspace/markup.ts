import type { T2Obyekt } from '../../api/supabase';
import type { Liniya } from '../../api/t2-shartnoma-liniya';
import { NAKRUTKA_KOEF_KODLAR, type t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { podvalTanla, serverCatsKatga, type PodvalYozuv } from '../../api/t2-nakrutka-podval';
import { podvalgaKoefQoy, podvalHisobla, podvalTekshir } from '../../lib/nakrutka-konstruktor';
import type { Aggregate } from './hierarchy';

export function effectiveContract(line: Liniya, objectId: number): number | null | undefined {
  const o = line.obyektlar.find(x => x.id === objectId);
  const candidates = line.shartnomalar.filter(s => s.loyiha_id === o?.loyiha_id && s.obyektlar.includes(objectId));
  return candidates.find(s => s.id === o?.asosiy_shartnoma_id)?.id
    ?? (candidates.length === 1 ? candidates[0].id : candidates.length === 0 ? null : undefined);
}
export const markupKey = (objectId: number, contractId: number | null | undefined) => `${objectId}:${contractId ?? 'company'}`;

/** Reuse the actual server cascade and document constructor; never infer a global percentage. */
export function markupAmount(object: T2Obyekt, result: Awaited<ReturnType<typeof t2ObyektNakrutka>>, podvals: PodvalYozuv[], contractId: number | null): number | null {
  if (object.jami == null || !Number.isFinite(object.jami) || !result.ok || result.obyekt_id !== object.id
    || result.shartnoma_id !== contractId || !result.cats || !result.nakrutka || !result.koeffitsientlar) return null;
  if (!Object.values(result.cats).every(Number.isFinite)
    || !NAKRUTKA_KOEF_KODLAR.every(k => Number.isFinite(result.koeffitsientlar![k]))
    || !Number.isFinite(result.nakrutka.pryamye)
    || Math.abs(result.nakrutka.pryamye - object.jami) > 0.02) return null;
  const record = podvalTanla(podvals, {obyektId:object.id,shartnomaId:contractId});
  if (!record) return Number.isFinite(result.nakrutka.vsego) ? result.nakrutka.vsego : null;
  const podval = podvalgaKoefQoy({versiya:1,nom:record.nom,qatorlar:record.qatorlar},result.koeffitsientlar);
  if (podvalTekshir(podval).length) return null;
  const total = podvalHisobla(podval,serverCatsKatga(result.cats)).vsego;
  return total != null && Number.isFinite(total) ? total : null;
}

export function aggregateMarkup(ids: readonly number[], objects: readonly T2Obyekt[], value: (id:number) => number | null | undefined): Aggregate {
  const byId = new Map(objects.map(o => [o.id,o]));
  const unique = [...new Set(ids)];
  let known=0,present=0,unknown=0;
  for (const id of unique) {
    const amount = value(id), object = byId.get(id);
    if (amount == null || !Number.isFinite(amount)) unknown++;
    else {known+=amount;present++;if (!object || object.narxsiz == null || object.narxsiz > 0) unknown++;}
  }
  return {known:Math.round(known*100)/100,present,unknown,total:unique.length};
}
