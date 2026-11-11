/**
 * Tenant doirasi (masofaviy server): tool argumentlaridagi HAR id (obyekt, qator, akt, snapshot, shartnoma, loyiha, kompaniya)
 * bazada kompaniyaga aylantiriladi va foydalanuvchi vakolati bilan solishtiriladi. Topilmagan id — rad (mavjudlik oshkor
 * qilinmaydi). Umumiy toollar ham ichida obyekt bo'yicha cheklaydi — bu himoyaning ikkinchi qatlami.
 */
import type { Mijoz } from '../../smeta-mcp/src/db';

export type Tur = 'obyekt' | 'qator' | 'akt' | 'snapshot' | 'shartnoma' | 'loyiha' | 'kompaniya' | 'bajarilmadi';
export type Havolalar = Record<Tur, Set<number>>;

const KALIT: Record<string, Tur> = {
  obyekt_id: 'obyekt', obyekt_idlar: 'obyekt', manba_obyekt_id: 'obyekt',
  qator_id: 'qator', qator_idlar: 'qator', almashtirilayotgan_qator_id: 'qator', ota_id: 'qator', ota_qator_id: 'qator', bolim_id: 'qator',
  zamena_qator_id: 'qator', olib_tashla: 'qator', qosh_mumkindan: 'qator',
  akt_id: 'akt', akt_idlar: 'akt',
  snapshot_id: 'snapshot', shartnoma_id: 'shartnoma', loyiha_id: 'loyiha', kompaniya_id: 'kompaniya', bekor_idlar: 'bajarilmadi',
};
/** Kalitlari qator id si bo'lgan yozuvlar ({ "123": narx }). */
const QATOR_KALITLI = new Set(['narx_override', 'narxlar']);
/** Ildizdagi `id` qaysi tur (tool bo'yicha). */
const ILDIZ_ID: Record<string, Tur> = { qator: 'qator' };

const bosh = (): Havolalar => ({ obyekt: new Set(), qator: new Set(), akt: new Set(), snapshot: new Set(), shartnoma: new Set(), loyiha: new Set(), kompaniya: new Set(), bajarilmadi: new Set() });
const idmi = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

export function havolalarYig(tool: string, args: unknown): Havolalar {
  const h = bosh();
  const qosh = (t: Tur, v: unknown) => { if (idmi(v)) h[t].add(v); else if (Array.isArray(v)) for (const x of v) if (idmi(x)) h[t].add(x); };
  const yur = (x: unknown, ildiz: boolean, chuqur: number) => {
    if (chuqur > 6 || x == null || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) yur(y, false, chuqur + 1); return; }
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (ildiz && k === 'id' && ILDIZ_ID[tool]) qosh(ILDIZ_ID[tool], v);
      const t = KALIT[k];
      if (t) qosh(t, v);
      if (QATOR_KALITLI.has(k) && v && typeof v === 'object' && !Array.isArray(v)) for (const kk of Object.keys(v)) if (/^\d+$/.test(kk)) qosh('qator', Number(kk));
      if (v && typeof v === 'object') yur(v, false, chuqur + 1);
    }
  };
  yur(args, true, 0);
  return h;
}

export const havolaSoni = (h: Havolalar) => Object.values(h).reduce((s, x) => s + x.size, 0);

/** Har havolani kompaniyaga aylantiradi. Natija: kompaniyalar to'plami yoki topilmagan havola. */
export async function kompaniyalargaAylantir(m: Mijoz, h: Havolalar): Promise<{ kompaniyalar: Set<number>; topilmadi: string[] }> {
  const arr = (t: Tur) => [...h[t]];
  const sorovlar: Array<[Tur, string]> = [
    ['obyekt', 'select o.id, o.kompaniya_id from public.t2_obyekt o where o.id = any($1::bigint[])'],
    ['qator', 'select q.id, o.kompaniya_id from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id where q.id = any($1::bigint[])'],
    ['akt', 'select a.id, coalesce(o.kompaniya_id, a.kompaniya_id) as kompaniya_id from public.t2_akt a left join public.t2_obyekt o on o.id = a.obyekt_id where a.id = any($1::bigint[])'],
    ['snapshot', 'select s.id, s.kompaniya_id from snapshot.obyekt_snapshot s where s.id = any($1::bigint[])'],
    ['shartnoma', 'select s.id, s.kompaniya_id from public.t2_shartnoma s where s.id = any($1::bigint[])'],
    ['loyiha', 'select l.id, l.kompaniya_id from public.t2_loyiha l where l.id = any($1::bigint[])'],
    ['kompaniya', 'select k.id, k.id as kompaniya_id from public.t2_kompaniya k where k.id = any($1::bigint[])'],
    ['bajarilmadi', 'select b.id, b.kompaniya_id from public.t2_qator_bajarilmadi b where b.id = any($1::bigint[])'],
  ];
  const kompaniyalar = new Set<number>();
  const topilmadi: string[] = [];
  for (const [t, sql] of sorovlar) {
    const ids = arr(t);
    if (!ids.length) continue;
    const r = await m.query<{ id: number | string; kompaniya_id: number | string | null }>(sql, [ids]);
    const bor = new Map(r.rows.map((x) => [Number(x.id), x.kompaniya_id == null ? null : Number(x.kompaniya_id)]));
    for (const id of ids) {
      const k = bor.get(id);
      if (k == null) topilmadi.push(`${t}#${id}`); else kompaniyalar.add(k);
    }
  }
  return { kompaniyalar, topilmadi };
}
