import type { T2Qator } from '../api/supabase';
import type { BajarilmadiQator } from '../api/t2-bajarilmadi';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';
import type { JurnalHolat } from './fakt-jurnal';

/**
 * Fakt Studio yig'indisi (egasi 2026-10-24): fakt kiritish ekranida doimiy ko'rinadigan hisob.
 * Faqat o'qiydi - smeta qatorlari o'zgarmaydi. Narx NDS siz; pul to'qilmaydi:
 * summasi noma'lum (null) qator 0 emas, kesimning `summasizSoni` da hisoblanadi.
 */
const BARG = new Set(['rs', 'mat', 'ob']);

export type FaktYigindi = {
  /** Jami fakt (ustamasiz) va kat kesimi - SummaJuft ustamalini shundan hisoblaydi. */
  faktKesim: KatKesim; faktUstamasiz: number;
  /** Smetada yo'q yangi ishlar (qo'shimcha/zamena): soni va ulardagi fakt summasi. */
  yangiSoni: number; yangiKesim: KatKesim; yangiUstamasiz: number;
  /** Bajarilmaydigan hajmlar: pozitsiya soni, narxi ma'lum qismining summasi va narxsiz soni. */
  bajarilmadiSoni: number; bajarilmadiKesim: KatKesim; bajarilmadiUstamasiz: number; bajarilmadiNarxsiz: number;
};

type Qator = Pick<T2Qator, 'id' | 'tur' | 'kat' | 'ota_id' | 'qoshimcha' | 'zamena'>;

export function faktYigindiHisobla(
  rows: readonly Qator[],
  states: readonly JurnalHolat[],
  bajarilmadi: readonly Pick<BajarilmadiQator, 'qator_id' | 'bajarilmagan_hajm' | 'holat'>[] = [],
): FaktYigindi {
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ildiz = (r: Qator): boolean => !!r.qoshimcha || !!r.zamena;
  /** Yangi: o'zi yoki ota-bobosi qo'shimcha/zamena. */
  const yangiMi = (r: Qator): boolean => {
    let p: Qator | undefined = r; let n = 0;
    while (p && n++ < 50) { if (ildiz(p)) return true; p = p.ota_id != null ? byId.get(p.ota_id) : undefined; }
    return false;
  };
  const son = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const faktKesim = bosKatKesim(); const yangiKesim = bosKatKesim();
  let faktUstamasiz = 0; let yangiUstamasiz = 0; let yangiSoni = 0;
  for (const r of rows) {
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    // Yangi pozitsiya = qo'shimcha/zamena ildizi (ota-bobosi yangi bo'lgan resurslar alohida sanalmaydi).
    if (ildiz(r) && (r.tur === 'bl' || r.tur === 'mat' || r.tur === 'ob') && !(ota && yangiMi(ota))) yangiSoni++;
    if (!BARG.has(r.tur ?? '')) continue;
    const s = son(holat.get(r.id)?.fakt_summa);
    katKesimgaQosh(faktKesim, r.kat, s);
    if (s != null) faktUstamasiz += s;
    if (yangiMi(r)) { katKesimgaQosh(yangiKesim, r.kat, s); if (s != null) yangiUstamasiz += s; }
  }
  const bajarilmadiKesim = bosKatKesim();
  let bajarilmadiUstamasiz = 0; let bajarilmadiNarxsiz = 0; let bajarilmadiSoni = 0;
  for (const b of bajarilmadi) {
    if (b.holat !== 'faol') continue;
    bajarilmadiSoni++;
    const narx = son(holat.get(b.qator_id)?.smeta_narx);
    if (narx == null) { bajarilmadiNarxsiz++; continue; }
    const summa = Number(b.bajarilmagan_hajm) * narx;
    bajarilmadiUstamasiz += summa; katKesimgaQosh(bajarilmadiKesim, byId.get(b.qator_id)?.kat, summa);
  }
  return { faktKesim, faktUstamasiz, yangiSoni, yangiKesim, yangiUstamasiz, bajarilmadiSoni, bajarilmadiKesim, bajarilmadiUstamasiz, bajarilmadiNarxsiz };
}

/** Faol «bajarilmadi» hajmlari: qator_id -> jami bajarilmagan hajm. */
export function bajarilmadiHajmlar(royxat: readonly Pick<BajarilmadiQator, 'qator_id' | 'bajarilmagan_hajm' | 'holat'>[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of royxat) if (b.holat === 'faol') m.set(b.qator_id, (m.get(b.qator_id) ?? 0) + Number(b.bajarilmagan_hajm || 0));
  return m;
}

/** «Bajarilmaydi» uchun taklif hajm: smeta - fakt - belgilangan (manfiy emas); smeta noma'lum bo'lsa null (qo'lda kiritiladi). */
export function bajarilmadiTaklif(smeta: number | null | undefined, fakt: number, belgilangan: number): number | null {
  if (smeta == null || !Number.isFinite(Number(smeta))) return null;
  const q = Number(smeta) - fakt - belgilangan;
  return q > 1e-9 ? Math.round(q * 1e6) / 1e6 : 0;
}

/** Zamena yangi ishi saqlangach asl ishning qancha hajmi almashtirilganini belgilash (PR #115: sbT2ZamenaAlmashtirishBelgila). */
export type AlmashtirishBelgilaFn = (yangiQatorId: number, hajm: number) => Promise<{ ok: boolean; error?: string }>;
