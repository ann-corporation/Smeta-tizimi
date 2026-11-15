/**
 * Eval mantig'i (sof, tarmoqsiz): kutilgan ishlar (tasdiqlangan smeta) vs joriy leksik matcher (nomzodlarTop).
 * Maxfiylik: bu modul hech narsani chop etmaydi/saqlamaydi — hisobot yozish `mahalliy.ts` da, repodan TASHQARIDA.
 */
import type { NormWork } from '../../catalog-extraction/norm-catalog';
import { yigindi2 } from '../../hisob-yadro';
import { birlikNormal, type Birlik } from '../../smeta-ai/protokol';
import { nomzodlarTop, type AiKatalog } from '../../smeta-ai/worker';

/** MVP chegaralari (docs/architecture/SMETA_USTASI_V1.md §5). */
export const CHEGARA = { top3: 0.7, recall: 0.7, jamiFoiz: 15, jamiKeyslarulushi: 0.6 } as const;

export type KutilganIsh = { shifr: string | null; nom: string; birlik: string | null; summa: number | null };
export type Keys = { nom: string; matn: string; kutilgan: KutilganIsh[]; hosil?: Array<{ kod: string | null; summa: number | null }> };

/** "Е06-01-001-22", "ГЭСН06-01-001-22*1,15", "06-01-001-22" -> "06-01-001-22"; kodga o'xshamasa null. */
export function kodKalit(s: string | null | undefined): string | null {
  const t = String(s ?? '').trim().split(/[*\s(]/)[0].replace(/^[A-Za-zЀ-ӿ.]+[-\s]*/, '').replace(/[–—]/g, '-');
  return /^\d{1,3}(?:-\d+){1,4}$/.test(t) ? t : null;
}

/** "100 м3", "1000 шт", "м2" -> Birlik; tanilmasa null (bunday ish baholanmaydi: birlik filtri noto'g'ri qirqadi). */
export function birlikOl(v: string | null | undefined): Birlik | null {
  const t = String(v ?? '').trim().replace(/^[\d\s.,]+(?=\S)/, '');
  return birlikNormal(t) ?? birlikNormal(t.split(/[\s,;()/]+/)[0]);
}

export type IshNatija = { nom: string; kod: string; top1: boolean; top3: boolean; top15: boolean; katalogda: boolean };
export type KeysNatija = {
  keys: string; jami: number; baholangan: number; katalogdaYoq: number; birlikNomalum: number; kodsiz: number;
  top1: number | null; top3: number | null; top15: number | null;
  /** Hosil qilingan ro'yxat berilgan bo'lsa: kutilgan kodlarning hosil ro'yxatda bo'lish ulushi. */
  recall: number | null;
  /** Hosil summa / kutilgan summa - 1 (foiz), yoki null. */
  jamiFarqFoiz: number | null;
  ishlar: IshNatija[];
};

const ulush = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

export function keysniBaholash(keys: Keys, katalog: AiKatalog): KeysNatija {
  const works = katalog.allWorks?.() ?? [];
  const kodlar = new Set(works.map((w: NormWork) => kodKalit(w.code)).filter((x): x is string => !!x));
  const ishlar: IshNatija[] = [];
  let kodsiz = 0, birlikNomalum = 0, katalogdaYoq = 0;
  for (const k of keys.kutilgan) {
    const kod = kodKalit(k.shifr);
    if (!kod) { kodsiz++; continue; }
    if (!kodlar.has(kod)) { katalogdaYoq++; continue; }
    const birlik = birlikOl(k.birlik);
    if (!birlik) { birlikNomalum++; continue; }
    const nomzodlar = nomzodlarTop(katalog, { qidiruv: [k.nom], birlik, tavsif: k.nom }, 15).map(n => kodKalit(n.kod));
    ishlar.push({ nom: k.nom, kod, top1: nomzodlar[0] === kod, top3: nomzodlar.slice(0, 3).includes(kod), top15: nomzodlar.includes(kod), katalogda: true });
  }
  const n = ishlar.length;
  const sum = (f: (i: IshNatija) => boolean) => ishlar.filter(f).length;
  let recall: number | null = null, jamiFarqFoiz: number | null = null;
  if (keys.hosil) {
    const hosilKod = new Set(keys.hosil.map(h => kodKalit(h.kod)).filter((x): x is string => !!x));
    const kutKod = [...new Set(keys.kutilgan.map(k => kodKalit(k.shifr)).filter((x): x is string => !!x))];
    recall = ulush(kutKod.filter(c => hosilKod.has(c)).length, kutKod.length);
    const kutJami = yigindi2(keys.kutilgan.map(k => k.summa)), hosJami = yigindi2(keys.hosil.map(h => h.summa));
    jamiFarqFoiz = kutJami > 0 && hosJami > 0 ? Math.round((hosJami / kutJami - 1) * 1000) / 10 : null;
  }
  return { keys: keys.nom, jami: keys.kutilgan.length, baholangan: n, katalogdaYoq, birlikNomalum, kodsiz,
    top1: ulush(sum(i => i.top1), n), top3: ulush(sum(i => i.top3), n), top15: ulush(sum(i => i.top15), n), recall, jamiFarqFoiz, ishlar };
}

export type Yigindi = {
  keyslar: number; baholanganIshlar: number; top1: number | null; top3: number | null; top15: number | null;
  recallOrtacha: number | null; jamiMosKeyslar: number | null;
  /** MVP chegarasi: true/false, hisoblab bo'lmasa null (masalan hosil ro'yxat yo'q). */
  otdi: { top3: boolean | null; recall: boolean | null; jami: boolean | null };
};

export function yigish(r: KeysNatija[]): Yigindi {
  const ishlar = r.flatMap(x => x.ishlar);
  const n = ishlar.length;
  const f = (g: (i: IshNatija) => boolean) => ulush(ishlar.filter(g).length, n);
  const recalls = r.map(x => x.recall).filter((x): x is number => x != null);
  const jamilar = r.map(x => x.jamiFarqFoiz).filter((x): x is number => x != null);
  const recallOrtacha = recalls.length ? Math.round((recalls.reduce((a, b) => a + b, 0) / recalls.length) * 1000) / 1000 : null;
  const jamiMosKeyslar = jamilar.length ? ulush(jamilar.filter(x => Math.abs(x) <= CHEGARA.jamiFoiz).length, jamilar.length) : null;
  const top3 = f(i => i.top3);
  return { keyslar: r.length, baholanganIshlar: n, top1: f(i => i.top1), top3, top15: f(i => i.top15), recallOrtacha, jamiMosKeyslar,
    otdi: { top3: top3 == null ? null : top3 >= CHEGARA.top3, recall: recallOrtacha == null ? null : recallOrtacha >= CHEGARA.recall,
      jami: jamiMosKeyslar == null ? null : jamiMosKeyslar >= CHEGARA.jamiKeyslarulushi } };
}

const foiz = (x: number | null) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
export function hisobotMd(r: KeysNatija[], y: Yigindi, meta: { sana: string; katalog: string }): string {
  const q = (b: boolean | null) => (b == null ? 'n/a' : b ? 'OTDI' : 'OTMADI');
  const qatorlar = r.map(x => `| ${x.keys} | ${x.jami} | ${x.baholangan} | ${x.katalogdaYoq} | ${foiz(x.top1)} | ${foiz(x.top3)} | ${foiz(x.top15)} | ${foiz(x.recall)} | ${x.jamiFarqFoiz == null ? 'n/a' : `${x.jamiFarqFoiz}%`} |`);
  return [`# Smeta ustasi eval (baseline: leksik matcher)`, ``, `Sana: ${meta.sana} · Katalog: ${meta.katalog}`, ``,
    `| Ko'rsatkich | Qiymat | MVP chegarasi | Natija |`, `|---|---|---|---|`,
    `| top-1 | ${foiz(y.top1)} | - | - |`,
    `| top-3 | ${foiz(y.top3)} | >= ${CHEGARA.top3 * 100}% | ${q(y.otdi.top3)} |`,
    `| top-15 (nomzod recall) | ${foiz(y.top15)} | - | - |`,
    `| ish recall (hosil ro'yxat) | ${foiz(y.recallOrtacha)} | >= ${CHEGARA.recall * 100}% | ${q(y.otdi.recall)} |`,
    `| jami +-${CHEGARA.jamiFoiz}% keyslar ulushi | ${foiz(y.jamiMosKeyslar)} | >= ${CHEGARA.jamiKeyslarulushi * 100}% | ${q(y.otdi.jami)} |`, ``,
    `Keyslar: ${y.keyslar} · baholangan ishlar: ${y.baholanganIshlar}. "Katalogda yo'q" ishlar (kod katalogda topilmadi) va kodsiz/birliksiz ishlar maxrajdan chiqarilgan — alohida ustunda.`, ``,
    `| Keys | Ishlar | Baholangan | Katalogda yo'q | top-1 | top-3 | top-15 | recall | jami farqi |`, `|---|---|---|---|---|---|---|---|---|`, ...qatorlar, ``].join('\n');
}

/** Soxta/lokal katalog: [{id, code, name, unitCode?, table?}] — fixture va tarmoqsiz sinov uchun. */
export type SodaIsh = { id: string; code: string; name: string; unitCode?: string | null; table?: string | null };
export function sodaKatalog(works: SodaIsh[]): AiKatalog {
  const w: NormWork[] = works.map(x => ({ id: x.id, code: x.code, name: x.name, bookType: null, collection: null, section: null, subsection: null, tableCode: x.table ?? null, unitCode: x.unitCode ?? null }));
  const byId = new Map(works.map(x => [x.id, x]));
  return {
    detail: () => { throw new Error('SODA_KATALOG_DETAIL_YOQ'); },
    search: (q: string) => { const ws = q.toLowerCase().split(/\s+/).filter(Boolean); const rows = w.filter(x => ws.every(s => (x.name ?? '').toLowerCase().includes(s))); return { rows, total: rows.length }; },
    unit: () => null, load: async () => undefined, tableLabel: (id: string) => byId.get(id)?.table ?? null,
    manifest: { revision: 'soda' }, allWorks: () => w, collectionTitle: () => null,
  } as unknown as AiKatalog;
}
