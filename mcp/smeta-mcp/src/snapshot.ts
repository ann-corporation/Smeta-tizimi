/**
 * `snapshot` sxemasi (boshqa agent yozmoqda): snapshot.ol(p_obyekt_id,p_sabab,p_izoh,p_muallif)→bigint,
 * snapshot.royxat(p_obyekt_id), snapshot.farq(p_snapshot_id,p_obyekt_id), snapshot.qaytar(p_snapshot_id,p_tasdiq).
 * Prodda hali bo'lmasligi mumkin — «mavjud bo'lsa chaqir, bo'lmasa ogohlantir». Named notation, turlar Postgres'ga qoldiriladi.
 */
import type { Mijoz } from './db';
import { snapshotSovuqTikla } from './snapshot-r2';

export const SNAPSHOT_YOQ = 'snapshot sxemasi (snapshot.ol) bazada hali yo\'q — amal SNAPSHOTSIZ bajarildi. Qaytarish uchun qo\'lda nusxa yoki tranzaksiya tarixiga tayaning.';

export async function snapshotFunksiyaBor(m: Mijoz, nom: 'ol' | 'royxat' | 'farq' | 'qaytar'): Promise<boolean> {
  const r = await m.query<{ bor: boolean }>(
    "select exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'snapshot' and p.proname = $1) as bor", [nom]);
  return !!r.rows[0]?.bor;
}

export type SnapshotNatija = { id: number | null; ogohlantirish?: string };

export async function snapshotOl(m: Mijoz, obyektId: number, sabab: string, izoh: string | null, muallif: string): Promise<SnapshotNatija> {
  if (!(await snapshotFunksiyaBor(m, 'ol'))) return { id: null, ogohlantirish: SNAPSHOT_YOQ };
  const r = await m.query<{ id: string | number | null }>(
    'select snapshot.ol(p_obyekt_id => $1::bigint, p_sabab => $2::text, p_izoh => $3::text, p_muallif => $4::text) as id',
    [obyektId, sabab, izoh, muallif]);
  const id = r.rows[0]?.id;
  return { id: id == null ? null : Number(id) };
}

export async function snapshotChaqir(m: Mijoz, nom: 'royxat' | 'farq' | 'qaytar', args: Record<string, unknown>): Promise<unknown> {
  if (!(await snapshotFunksiyaBor(m, nom))) throw new Error(`snapshot.${nom} bazada hali yo'q (snapshot sxemasi prodga qo'llanmagan).`);
  // Saqlash dietasi: eski snapshot bloklari R2 da bo'lishi mumkin — farq/qaytar o'qishdan oldin shu tranzaksiyada tiklanadi
  // (farq — doim ROLLBACK: tiklash ham qaytariladi, keyingi chaqiruvda yana R2 dan olinadi; qaytar — COMMIT bilan qoladi).
  if ((nom === 'farq' || nom === 'qaytar') && Number.isSafeInteger(args.p_snapshot_id)) await snapshotSovuqTikla(m, args.p_snapshot_id as number);
  const params: unknown[] = [];
  const qism = Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => {
    if (!/^p_[a-z_]+$/.test(k)) throw new Error(`Yaroqsiz argument: ${k}`);
    params.push(v);
    return `${k} => $${params.length}`;
  });
  const r = await m.query(`select * from snapshot.${nom}(${qism.join(', ')})`, params);
  return r.rows;
}
