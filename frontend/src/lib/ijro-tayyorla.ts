/**
 * IJRO HUJJATLARINI TAYYORLASH VA TARTIBLASH — sof mantiq (tarmoq/UI yo'q).
 *  1) «Nima yetishmayapti»: АОSR siz yashirin ishlar smeta razdeli bo'yicha guruhlanadi;
 *  2) guruhdan АОSR qoralamasi (mavjud `qoralamaTanlangandan` + fakt sanalari + imzochilar) — holat DOIM 'yangi';
 *  3) reestr tartibi: razdel tartibi → ish sanasi → akt raqami; raqam bo'shliqlari/takrorlari.
 * Yangi biznes qoida yo'q: coverage/fakt/imzochi ma'lumoti o'qiladi; noma'lum — bo'sh (o'ylab topilmaydi).
 */
import type { AosrCoverage } from '../api/t2-aosr';
import type { AosrKomissiyaYozuv, AosrMalumot, AosrV2 } from '../api/t2-ijro';
import type { ObyektImzochi } from '../api/obyekt-imzochi';
import { aosrKomissiyaTartibi } from './aosr-export';
import { qoralamaTanlangandan } from './aosr-qoralama';
import { materialTokenlar } from './ijro-qoida';

import { RAZDELSIZ, razdelXaritasi, type QatorMeta, type RazdelInfo } from './razdel-xaritasi';
export { RAZDELSIZ };
export type { QatorMeta, RazdelInfo };

const resursmi = (c: { kat?: string | null }) => c.kat === 'mat' || c.kat === 'ob';

/** Razdel yo'llarini solishtirish: yo'l — tartib raqamlari zanjiri (ildizdan). */
export function yolSolishtir(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1; const y = b[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

export { razdelXaritasi };

/* ── 1. «Nima yetishmayapti» ─────────────────────────────────────── */
export type YetishmaydiGuruh = {
  razdelId: number | null; nom: string; yol: readonly number[];
  /** АОСР siz yashirin ishlar. */
  ishlar: AosrCoverage[];
  /** Ishlarga tegishli resurslar (material/uskuna, fakt>0) — qoralamada 3-bo'limga tushadi. */
  resurslar: { ishId: number; c: AosrCoverage }[];
};

export function yetishmayotganlar(coverage: readonly AosrCoverage[], meta: readonly QatorMeta[]): YetishmaydiGuruh[] {
  const rz = razdelXaritasi(meta);
  const kerak = coverage.filter((c) => c.yashirin && !c.akt_bor);
  const ids = new Set(kerak.map((c) => c.qator_id));
  const ota = new Map(meta.map((m) => [m.id, m.ota_id] as const));
  const guruhlar = new Map<number | null, YetishmaydiGuruh>();
  const guruh = (id: number) => {
    const r = rz.get(id) ?? RAZDELSIZ;
    let g = guruhlar.get(r.id);
    if (!g) { g = { razdelId: r.id, nom: r.nom, yol: r.yol, ishlar: [], resurslar: [] }; guruhlar.set(r.id, g); }
    return g;
  };
  for (const c of kerak) guruh(c.qator_id).ishlar.push(c);
  for (const c of coverage) {
    if (!resursmi(c) || ids.has(c.qator_id)) continue;
    const o = ota.get(c.qator_id);
    if (o != null && ids.has(o)) guruh(o).resurslar.push({ ishId: o, c });
  }
  return [...guruhlar.values()].sort((a, b) => yolSolishtir(a.yol, b.yol));
}

/* ── 2. Qoralama ─────────────────────────────────────────────────── */
export type FaktAktSana = { id: number; sana: string | null };
export type FaktAktQatorLink = { akt_id: number; qator_id: number };

/** Berilgan qatorlar bo'yicha fakt hujjatlarining eng erta / eng kech sanasi (bo'sh — null). */
export function sanaOraligi(qatorIds: readonly number[], links: readonly FaktAktQatorLink[], aktlar: readonly FaktAktSana[]): { boshlanish: string | null; tugash: string | null } {
  const set = new Set(qatorIds);
  const sana = new Map(aktlar.map((a) => [a.id, a.sana ? a.sana.slice(0, 10) : null] as const));
  const sanalar = links.filter((l) => set.has(l.qator_id)).map((l) => sana.get(l.akt_id) ?? null).filter((s): s is string => !!s).sort();
  return { boshlanish: sanalar[0] ?? null, tugash: sanalar[sanalar.length - 1] ?? null };
}

const IMZO_ROL: Record<string, 'smo' | 'subpudratchi' | 'bosh_pudratchi' | 'texnadzor' | 'loyihachi'> = {
  texnadzor: 'texnadzor', loyihachi: 'loyihachi', subpudratchi: 'subpudratchi', pudratchi: 'smo',
};

/** `t2_obyekt_imzochi` (meros bilan hisoblangan effektiv yozuvlar) → АОСР komissiyasi. Nom o'ylab topilmaydi. */
export function komissiyaImzochilardan(imzochilar: readonly ObyektImzochi[] | null | undefined): { komissiya: AosrKomissiyaYozuv[]; blank: 'subpudratchili' | 'subpudratchisiz' } {
  const bor = (rol: string) => imzochilar?.find((x) => x.rol === rol)?.effektiv ?? null;
  const blank = bor('subpudratchi') ? 'subpudratchili' : 'subpudratchisiz';
  const azolar: AosrKomissiyaYozuv[] = [];
  for (const x of imzochilar ?? []) {
    const e = x.effektiv; const rol = IMZO_ROL[x.rol];
    if (!e || !rol || (rol === 'subpudratchi' && blank !== 'subpudratchili')) continue;
    azolar.push({
      rol: rol === 'smo' && blank === 'subpudratchili' ? 'bosh_pudratchi' : rol,
      ...(e.tashkilot ? { tashkilot: e.tashkilot } : {}), ...(e.fio ? { fio: e.fio } : {}), ...(e.lavozim ? { lavozim: e.lavozim } : {}),
    });
  }
  return {
    komissiya: aosrKomissiyaTartibi(blank, azolar).map((k) => ({
      rol: String(k.rol), ...(k.tashkilot ? { tashkilot: k.tashkilot } : {}), ...(k.fio ? { fio: k.fio } : {}), ...(k.lavozim ? { lavozim: k.lavozim } : {}),
    })),
    blank,
  };
}

export type QoralamaOpsiya = {
  raqam: string;
  sanalar?: { boshlanish: string | null; tugash: string | null };
  imzochilar?: readonly ObyektImzochi[] | null;
  /** Imzochi kiritilmagan bo'lsa — oxirgi aktning sukut qiymatlari. */
  sukut?: { komissiya?: AosrKomissiyaYozuv[]; blank?: 'subpudratchili' | 'subpudratchisiz'; loyihaTashkiloti?: string | null };
};

/** Tanlangan yashirin ishlar (bitta razdel) → bitta АОSR qoralamasi; holat DOIM 'yangi' (tasdiqlanmaydi). */
export function qoralamaGuruhdan(g: Pick<YetishmaydiGuruh, 'nom' | 'resurslar'>, tanlangan: readonly AosrCoverage[], o: QoralamaOpsiya): AosrMalumot {
  const resurslar = g.resurslar.filter((r) => tanlangan.some((t) => t.qator_id === r.ishId)).map((r) => r.c);
  const bazaMalumot = qoralamaTanlangandan([...tanlangan, ...resurslar]);
  const ishSoni = tanlangan.filter((c) => !resursmi(c)).length;
  const imzo = o.imzochilar?.some((x) => x.effektiv) ? komissiyaImzochilardan(o.imzochilar) : null;
  return {
    tur: 'aosr', holat: 'yangi', raqam: o.raqam,
    ...bazaMalumot,
    materiallar: materialTokenlar(bazaMalumot.materiallar).join('; '),
    ish_nomi: ishSoni > 1 && g.nom ? g.nom : bazaMalumot.ish_nomi,
    sana: o.sanalar?.tugash ?? undefined, boshlanish_sana: o.sanalar?.boshlanish ?? undefined, tugash_sana: o.sanalar?.tugash ?? undefined,
    blank_varianti: imzo?.blank ?? o.sukut?.blank ?? 'subpudratchisiz',
    loyiha_tashkiloti: o.sukut?.loyihaTashkiloti ?? '', chetlanishlar: 'Нет',
    komissiya: imzo?.komissiya ?? o.sukut?.komissiya ?? aosrKomissiyaTartibi('subpudratchisiz', []).map((k) => ({ rol: String(k.rol) })),
  };
}

/* ── 3. Reestr tartibi ───────────────────────────────────────────── */
const raqamSoni = (r: string | null | undefined): number | null => {
  const m = /\d+/.exec(String(r ?? '')); return m ? Number(m[0]) : null;
};

export type AosrTartibMeta = { razdel: RazdelInfo; ishSana: string | null };

/** АОSR → razdel (bog'langan qatorlarning eng birinchisi) va ish sanasi. */
export function aosrTartibMeta(a: Pick<AosrV2, 'id' | 'sana' | 'boshlanish_sana'>, qatorIds: readonly number[], rz: ReadonlyMap<number, RazdelInfo>): AosrTartibMeta {
  const r = qatorIds.map((q) => rz.get(q)).filter((x): x is RazdelInfo => !!x && x.id != null).sort((x, y) => yolSolishtir(x.yol, y.yol))[0] ?? RAZDELSIZ;
  return { razdel: r, ishSana: a.boshlanish_sana ?? a.sana ?? null };
}

/** Tartib: razdel tartibi → ish sanasi → raqam → id. Razdelsiz/sanasiz — oxirida. */
export function aosrTartibla<T extends Pick<AosrV2, 'id' | 'raqam'>>(aktlar: readonly T[], meta: ReadonlyMap<number, AosrTartibMeta>): T[] {
  return aktlar.slice().sort((a, b) => {
    const x = meta.get(a.id); const y = meta.get(b.id);
    return yolSolishtir(x?.razdel.yol ?? RAZDELSIZ.yol, y?.razdel.yol ?? RAZDELSIZ.yol)
      || (x?.ishSana ?? '9999').localeCompare(y?.ishSana ?? '9999')
      || (raqamSoni(a.raqam) ?? Infinity) - (raqamSoni(b.raqam) ?? Infinity)
      || a.id - b.id;
  });
}

/** Akt raqamlaridagi bo'shliqlar (1..max orasida yo'q) va takrorlar — faqat raqamli raqamlar. */
export function raqamTekshiruv(aktlar: readonly Pick<AosrV2, 'raqam'>[]): { yoq: number[]; takror: number[] } {
  const soni = aktlar.map((a) => raqamSoni(a.raqam)).filter((n): n is number => n != null && n > 0);
  const bor = new Set<number>(); const takror = new Set<number>();
  for (const n of soni) { if (bor.has(n)) takror.add(n); bor.add(n); }
  const max = soni.length ? Math.max(...soni) : 0;
  const yoq: number[] = [];
  for (let i = 1; i <= max; i++) if (!bor.has(i)) yoq.push(i);
  return { yoq, takror: [...takror].sort((a, b) => a - b) };
}
