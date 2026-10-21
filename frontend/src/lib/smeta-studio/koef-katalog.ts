/**
 * Normativ ish sharoiti koeffitsientlari (egasi 2026-10-15). Manba: ABC Base 2017 — 00-ppr (koeffitsient: Кзтр/Кэм/Кмр,
 * qo'llanish sharti, ТЧ bandi) va 00-amen (qaysi norma jadvaliga qaysi koeffitsient qo'llanadi). Ish qo'shilganda shu ishning
 * jadvaliga tegishli koeffitsientlar TAKLIF sifatida ko'rsatiladi; hech biri qabul qilinmaguncha hisobga kirmaydi.
 */
import type { CoefScope, WorkCoefficient } from './model';

/**
 * op: MUL — a plain multiplier of the stated norms; SHART — needs a parameter ("на каждые 100 мм", "добавлять 0,5 % на каждый
 * метр сверх 15 м"): never converted to a multiplier (Codex audit 2026-10-15: 0,005 as a multiplier would cut labour 200×).
 * jt: the tables (and rows) the condition text itself names — the rule applies only there.
 */
export type KoefYozuv = { a: string; t: string; s: string; q: string; k: Partial<Record<'ЧЕЛ' | 'МАШ' | 'МАТ', number>>; op?: 'MUL' | 'SHART';
  jt?: Array<{ s: number; t1: number; t2: number; r?: Array<[number, number]> }> };
export type KoefKatalog = { schema: string; manba: string; koef: Record<string, KoefYozuv>; jadval: Record<string, string[]> };
export type KoefNomzod = { kod: string; yozuv: KoefYozuv };

/** "E1-1-3-12" / "Е20-5-2-2" → ["1-1-3", "1-1-3-12"] (table key and row key of the reference). */
export function jadvalKalitlari(code: string | null | undefined): string[] {
  const m = /^[EЕ](\d+)-(\d+)-(\d+)(?:-(\d+))?$/.exec((code ?? '').trim());
  if (!m) return [];
  const t = `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}`;
  return m[4] ? [t, `${t}-${Number(m[4])}`] : [t];
}

/** The work lies inside the tables/rows the condition text names (no list = the reference link decides). */
export function jadvalIchida(y: KoefYozuv, code: string | null | undefined): boolean {
  if (!y.jt?.length) return true;
  const m = /^[EЕ](\d+)-(\d+)-(\d+)(?:-(\d+))?$/.exec((code ?? '').trim());
  if (!m) return false;
  const s = Number(m[2]), t = Number(m[3]), r = m[4] == null ? null : Number(m[4]);
  return y.jt.some(j => j.s === s && t >= j.t1 && t <= j.t2 && (!j.r || (r != null && j.r.some(([a, b]) => r >= a && r <= b))));
}

/** Every normative coefficient applicable to a work (table-level ∪ row-level, limited by the condition's own table list). */
export function ishKoeffitsientlari(kat: KoefKatalog, code: string | null | undefined): KoefNomzod[] {
  const seen = new Set<string>();
  const out: KoefNomzod[] = [];
  for (const key of jadvalKalitlari(code)) for (const kod of kat.jadval[key] ?? []) {
    const yozuv = kat.koef[kod];
    if (yozuv && !seen.has(kod) && jadvalIchida(yozuv, code)) { seen.add(kod); out.push({ kod, yozuv }); }
  }
  return out;
}
/** A rule that needs a parameter is shown, never applied as a number. */
export const qollanadi = (n: KoefNomzod) => (n.yozuv.op ?? 'MUL') === 'MUL';

const idOf = (kod: string, scope: string) => `n${[...`${kod}|${scope}`].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36)}`;
/**
 * One normative record → coefficients in the studio model. Кзтр/Кэм/Кмр equal → one coefficient (ALL or ЧЕЛ+МАШ);
 * different values → one per resource kind. Кмр = 0 (materials not counted, e.g. demolition) is kept as МАТ × 0.
 */
export function koefgaAylantir(n: KoefNomzod, accepted = false): WorkCoefficient[] {
  if (!qollanadi(n)) return [];
  const { k } = n.yozuv;
  const evidence = `${n.kod} · ${n.yozuv.a}: ${n.yozuv.s || n.yozuv.q}`.slice(0, 300);
  const name = (n.yozuv.t || n.kod).slice(0, 300);
  const mk = (scope: CoefScope, v: number): WorkCoefficient => ({ id: idOf(n.kod, scope), name, value: String(v), scope, evidence, origin: 'NORM', accepted });
  const ch = k['ЧЕЛ'], ma = k['МАШ'], mt = k['МАТ'];
  if (ch != null && ch === ma && ch === mt) return [mk('ALL', ch)];
  const out: WorkCoefficient[] = [];
  if (ch != null && ch === ma) out.push(mk('ЧЕЛ+МАШ', ch));
  else { if (ch != null) out.push(mk('ЧЕЛ', ch)); if (ma != null) out.push(mk('МАШ', ma)); }
  if (mt != null) out.push(mk('МАТ', mt));
  return out;
}

let cached: Promise<KoefKatalog> | null = null;
/** Loaded once per page session (≈1 MB, immutable HTTP cache); a failed load can be retried. */
export function koefKatalogi(fetcher: (u: string) => Promise<Response> = u => fetch(u, { credentials: 'same-origin' })): Promise<KoefKatalog> {
  if (!cached) cached = (async () => {
    const cur = await fetcher('/api/koef-katalog?f=current');
    if (!cur.ok) throw new Error('KOEF_CATALOG_UNAVAILABLE');
    const { revision } = await cur.json() as { revision: string };
    if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error('KOEF_REVISION_INVALID');
    const r = await fetcher(`/api/koef-katalog?rev=${revision}`);
    if (!r.ok) throw new Error('KOEF_CATALOG_UNAVAILABLE');
    const kat = await r.json() as KoefKatalog;
    if (kat.schema !== 'koef-katalog-v1') throw new Error('KOEF_SCHEMA_INVALID');
    return kat;
  })().catch(e => { cached = null; throw e; });
  return cached;
}
