import type { PulObyekt } from '../agent-pul-javob';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';

type Alias = { kind: 'lot' | 'contract' | 'ambiguous'; value: string };
const normalized = (s: string) => s.toLowerCase().replace(/[‐‑–—]/g, '-');
const pattern = /(?:^|[^\p{L}\p{N}])(?:(\d+)\s*-?\s*(?:lot|лот)(?!\p{L})|(?:lot|лот)\s*(?:№|#)?\s*(\d+)(?![\p{L}\p{N}])|(?:shartnoma|шартнома|договор)\s*(?:№|#)?\s*([\p{L}\p{N}][\p{L}\p{N}./-]{0,59}))/gu;
function aliases(s: string): Alias[] {
  return Array.from(normalized(s).matchAll(pattern), m => ({ kind: m[1] || m[2] ? 'lot' : 'contract',
    value: (m[1] || m[2] || m[3]).replace(/\.$/, '') }));
}

/** Bare № belongs to an act in an F2 question; it is a contract only after an explicit contract word. */
export function contractAlias(question: string): Alias | null {
  const q = normalized(question);
  const explicit = aliases(q);
  if (explicit.length > 1) return { kind: 'ambiguous', value: '' };
  if (explicit.length === 1) return explicit[0];
  if (/(?:f-?2|ф-?2|forma|форма|кс-?2)/u.test(q)) return null;
  const bare = /(?:№|#)\s*([\p{L}\p{N}][\p{L}\p{N}./-]{0,59})/u.exec(q)?.[1];
  return bare ? { kind: 'contract', value: bare.replace(/\.$/, '') } : null;
}

type Contract = { id: number; raqam: string; nom: string | null; obyektlar: number[] };
type Failure = 'denied' | 'unavailable' | 'yoq' | 'noaniq';
type Result = { tur: 'bor'; contract: { id: number; label: string }; objects: PulObyekt[] } |
  { [K in Failure]: { tur: K } }[Failure];
const id = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isContract = (row: unknown): row is Contract => record(row) && id(row.id) && typeof row.raqam === 'string' &&
  (row.nom === null || typeof row.nom === 'string') && Array.isArray(row.obyektlar) && row.obyektlar.every(id);
const isObject = (row: unknown): row is PulObyekt => record(row) && id(row.id) && typeof row.nom === 'string';

export async function resolveJarvisContract(rpc: JarvisReadRpc, scope: JarvisObjectScope, alias: Alias): Promise<Result> {
  if (alias.kind === 'ambiguous') return { tur: 'noaniq' };
  const result = await rpc('t2_shartnoma_liniya_v1', { p_actor_id: scope.actor, p_kompaniya_id: scope.company }).catch(() => null);
  if (!result?.ok) return { tur: result?.status === 403 ? 'denied' : 'unavailable' };
  const { shartnomalar, obyektlar } = result.data;
  if (!Array.isArray(shartnomalar) || !shartnomalar.every(isContract) ||
      !Array.isArray(obyektlar) || !obyektlar.every(isObject)) return { tur: 'unavailable' };
  const contracts = shartnomalar.filter(row => alias.kind === 'contract' ? normalized(row.raqam).trim() === alias.value :
    aliases(`${row.raqam} ${row.nom ?? ''}`).some(value => value.kind === 'lot' && value.value === alias.value));
  if (contracts.length !== 1) return { tur: contracts.length ? 'noaniq' : 'yoq' };
  const contract = contracts[0];
  const wanted = new Set(contract.obyektlar);
  const objects = obyektlar.filter(row => wanted.has(row.id));
  // Missing or duplicate source IDs are not silently converted into a partial successful scope.
  if (objects.length !== wanted.size || new Set(objects.map(row => row.id)).size !== objects.length) return { tur: 'unavailable' };
  return { tur: 'bor', contract: { id: contract.id, label: contract.raqam }, objects };
}
