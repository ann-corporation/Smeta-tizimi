import { obyektTanla, type PulObyekt } from '../agent-pul-javob';
import type { RpcNatija, Yuk } from '../agent-rpc';
import type { JarvisText } from './reply-language';

export type JarvisReadRpc = (name: string, body: Yuk) => Promise<RpcNatija>;
export type JarvisObjectScope = { actor: number; company: number; question: string; history: unknown; objectId: number | null; text?: JarvisText };

function readObjects(data: Yuk): PulObyekt[] | null {
  const rows = (data.fakt as { obyektlar?: unknown } | undefined)?.obyektlar;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((row: Partial<PulObyekt> | null) =>
    row && typeof row.id === 'number' && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.nom === 'string'
      ? [{ id: row.id, nom: row.nom }] : []);
}

export async function resolveJarvisObject(rpc: JarvisReadRpc, scope: JarvisObjectScope) {
  const read = (id: number | null) => rpc('t2_agent_fakt_v1', {
    p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_kategoriyalar: ['obyektlar'], p_obyekt_id: id,
  });
  const list = await read(null);
  if (!list.ok) return list.status === 403 ? { tur: 'denied' as const } : { tur: 'unavailable' as const };
  const objects = readObjects(list.data);
  if (!objects) return { tur: 'unavailable' as const };
  const selected = obyektTanla(scope.question, scope.history, objects, scope.objectId);
  if (selected.tur !== 'yoq' || scope.objectId === null) return selected;

  // The company snapshot is capped. Verify the current page's object directly when it is absent.
  const current = await read(scope.objectId);
  if (!current.ok) return current.status === 403 ? { tur: 'denied' as const } : selected;
  const verified = readObjects(current.data)?.find(row => row.id === scope.objectId);
  return verified ? { tur: 'bor' as const, obyekt: verified } : selected;
}
