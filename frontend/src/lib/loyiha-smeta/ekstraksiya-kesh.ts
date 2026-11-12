/**
 * ekstraksiya-kesh.ts — pdf.js ning XOM natijasi (matn elementlari) R2 ga gzip bilan saqlanadi (`/api/loyiha-ekstraksiya`); shu PDF (sha256) qayta
 * tanlansa tahlil qayta bajarilmaydi. Format v1: kompakt massivlar [s, x, y, w, h, sahifa], bir xonali yaxlitlash.
 */
import type { MatnBo } from './jadval';

export const EKSTRAKSIYA_FORMAT = 1;
export const manbaR2 = (kompaniyaId: number, sha: string) => `r2:loyiha-ekstraksiya/k${kompaniyaId}/${sha}.json.gz`;

type Paket = { v: number; items: [string, number, number, number, number, number][] };
const r1 = (n: number) => Math.round(n * 10) / 10;

export const paketla = (items: MatnBo[]): Paket => ({ v: EKSTRAKSIYA_FORMAT, items: items.map((i) => [i.s, r1(i.x), r1(i.y), r1(i.w), r1(i.h), i.sahifa]) });
export function paketdanOl(p: unknown): MatnBo[] | null {
  const x = p as Paket;
  if (!x || x.v !== EKSTRAKSIYA_FORMAT || !Array.isArray(x.items)) return null;
  const out: MatnBo[] = [];
  for (const a of x.items) {
    if (!Array.isArray(a) || typeof a[0] !== 'string' || a.slice(1).some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
    out.push({ s: a[0], x: a[1], y: a[2], w: a[3], h: a[4], sahifa: a[5] });
  }
  return out;
}

async function siq(matn: string): Promise<Uint8Array> {
  const s = new Blob([matn]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function yoz(b: ArrayBuffer): Promise<string> {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}

/** Keshdan o'qiydi; yo'q/yaroqsiz bo'lsa null (xato tashlamaydi — tahlil oddiy yo'l bilan bajariladi). */
export async function keshdanOl(kompaniyaId: number, sha: string): Promise<MatnBo[] | null> {
  try {
    const r = await fetch(`/api/loyiha-ekstraksiya?kompaniya_id=${kompaniyaId}&sha=${sha}`);
    if (!r.ok) return null;
    return paketdanOl(JSON.parse(await yoz(await r.arrayBuffer())));
  } catch { return null; }
}

/** Keshga yozadi (xato bo'lsa jim: kesh ixtiyoriy). */
export async function keshgaSaqla(kompaniyaId: number, sha: string, items: MatnBo[]): Promise<boolean> {
  try {
    const bayt = await siq(JSON.stringify(paketla(items)));
    const r = await fetch(`/api/loyiha-ekstraksiya?kompaniya_id=${kompaniyaId}&sha=${sha}`, { method: 'PUT', headers: { 'Content-Type': 'application/gzip' }, body: bayt as BodyInit });
    return r.ok;
  } catch { return false; }
}
