import type { T2Qator } from '../api/supabase';
import type { BajarilmadiQator } from '../api/t2-bajarilmadi';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';
import type { JurnalHolat } from './fakt-jurnal';
import { ochiqQoldiq } from './zamena-qoldiq';
import { chiqarilganmi } from './resurs-amal';
import { faktSummaF2Narxda, katJami, qatorSumma, yigindi2 } from './hisob-yadro';
import { svodKorinishKesimi, yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';

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
  /** Narx qoidasi: fakt summasi tasdiqlangan F2 birlik narxida hisoblangan pozitsiyalar soni. */
  faktF2Narxda: number;
};

type Qator = Pick<T2Qator, 'id' | 'tur' | 'kat' | 'ota_id' | 'qoshimcha' | 'zamena'>;

export function faktYigindiHisobla(
  rows: readonly Qator[],
  states: readonly JurnalHolat[],
  bajarilmadi: readonly Pick<BajarilmadiQator, 'qator_id' | 'bajarilmagan_hajm' | 'holat'>[] = [],
  /** Svod yaxlit (server) — bo'lim fakti yaxlit summaga masshtablanadi (`svodKorinishKesimi`). */
  svod?: SvodYaxlit | null,
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
  type El = { id: number; kat: string | null; summa: number | null; smeta: number | null };
  const faktEl: El[] = []; const yangiEl: El[] = []; let yangiSoni = 0; let faktF2Narxda = 0;
  // Ishdan chiqarilgan resurs (faol «bajarilmaydi» butun smeta hajmini qoplaydi; lib/resurs-amal) — F2 ga kirmaydi,
  // norma × ish faktidan hosila fakt summasi ham jamiga qo'shilmaydi.
  const bajMap = bajarilmadiHajmlar(bajarilmadi);
  for (const r of rows) {
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    // Yangi pozitsiya = qo'shimcha/zamena ildizi (ota-bobosi yangi bo'lgan resurslar alohida sanalmaydi).
    if (ildiz(r) && (r.tur === 'bl' || r.tur === 'mat' || r.tur === 'ob') && !(ota && yangiMi(ota))) yangiSoni++;
    if (!BARG.has(r.tur ?? '')) continue;
    if (bajMap.has(r.id) && chiqarilganmi(son(holat.get(r.id)?.smeta_hajm), bajMap.get(r.id))) continue;
    // Fakt summasi — yadro narx qoidasi: tasdiqlangan F2 bor qatorda F2 birlik narxida (hajm yozilganidek, NULL — NULL).
    const h = holat.get(r.id);
    const fq = faktSummaF2Narxda(son(h?.fakt_hajm), son(h?.f2_hajm), son(h?.f2_summa), son(h?.fakt_summa));
    if (fq.manba === 'f2' && fq.summa != null) faktF2Narxda++;
    const e = { id: r.id, kat: r.kat ?? null, summa: fq.summa, smeta: son(h?.smeta_summa) };
    faktEl.push(e);
    if (yangiMi(r)) yangiEl.push(e);
  }
  // Kesim va jami — yadrodan (`svodKorinishKesimi`): svod bo'limi yaxlit × (fakt / BUTUN bo'lim smetasi), ustama yo'q.
  const bolimSmeta = new Map<number, number>();
  for (const b of svod?.bolimlar ?? []) {
    const ids = yaxlitQatorIdlari(rows, { ...svod!, bolimlar: [b] });
    bolimSmeta.set(Number(b.qator_id), yigindi2(rows.filter((r) => ids.has(r.id) && BARG.has(r.tur ?? '')).map((r) => son(holat.get(r.id)?.smeta_summa))));
  }
  const f = { id: (e: El) => e.id, kat: (e: El) => e.kat, summa: (e: El) => e.summa, smeta: (e: El) => e.smeta };
  const faktKesim = svodKorinishKesimi(rows, faktEl, f, svod, { bolimSmeta });
  const yangiKesim = svodKorinishKesimi(rows, yangiEl, f, svod, { bolimSmeta });
  const jami = (k: KatKesim) => yigindi2([katJami(k.summalar), k.nomalum, k.yaxlit?.qqssiz]);  const bajarilmadiKesim = bosKatKesim();
  const bajL: number[] = []; let bajarilmadiNarxsiz = 0; let bajarilmadiSoni = 0;
  for (const b of bajarilmadi) {
    if (b.holat !== 'faol') continue;
    bajarilmadiSoni++;
    const narx = son(holat.get(b.qator_id)?.smeta_narx);
    // NULL ≠ 0: narx noma'lum — summa noma'lum (sanaladi). Summa = ROUND(hajm × narx, 2) — yadro.
    const summa = qatorSumma(Number(b.bajarilmagan_hajm), narx);
    if (summa == null) { bajarilmadiNarxsiz++; continue; }
    bajL.push(summa); katKesimgaQosh(bajarilmadiKesim, byId.get(b.qator_id)?.kat, summa);
  }
  return { faktKesim, faktUstamasiz: jami(faktKesim), yangiSoni, yangiKesim, yangiUstamasiz: jami(yangiKesim), bajarilmadiSoni, bajarilmadiKesim, bajarilmadiUstamasiz: yigindi2(bajL), bajarilmadiNarxsiz, faktF2Narxda };
}

/** Faol «bajarilmadi» hajmlari: qator_id -> jami bajarilmagan hajm. */
export function bajarilmadiHajmlar(royxat: readonly Pick<BajarilmadiQator, 'qator_id' | 'bajarilmagan_hajm' | 'holat'>[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of royxat) if (b.holat === 'faol') m.set(b.qator_id, (m.get(b.qator_id) ?? 0) + Number(b.bajarilmagan_hajm || 0));
  return m;
}

/** «Bajarilmaydi» uchun taklif hajm = OCHIQ qoldiq (`ochiqQoldiq`: smeta − fakt − almashtirilgan − belgilangan; manfiy emas); smeta noma'lum bo'lsa null (qo'lda kiritiladi). */
export function bajarilmadiTaklif(smeta: number | null | undefined, fakt: number, belgilangan: number, almashtirilgan?: number | null): number | null {
  const q = ochiqQoldiq({ smeta, fakt, bajarilmaydi: belgilangan, almashtirilgan }, 'fakt');
  if (q == null) return null;
  return q > 1e-9 ? Math.round(q * 1e6) / 1e6 : 0;
}

/** Zamena yangi ishi saqlangach asl ishning qancha hajmi almashtirilganini belgilash (PR #115: sbT2ZamenaAlmashtirishBelgila). */
export type AlmashtirishBelgilaFn = (yangiQatorId: number, hajm: number) => Promise<{ ok: boolean; error?: string }>;

const MANBA_TARTIB = ['smeta_obyekt', 'smeta_shartnoma', 'smeta', 'katalog', 'qolda'] as const;
/** Narx variantlari: ishonchli manba oldin (shu smeta > shartnoma > boshqa > katalog); bir xil manba+narx takrori olib tashlanadi. Narx to'qilmaydi. */
export function narxVariantlariTartibla<T extends { manba: string; narx: number }>(v: readonly T[]): T[] {
  const korilgan = new Set<string>();
  return [...v]
    .filter((x) => Number.isFinite(x.narx) && x.narx > 0)
    .sort((a, b) => MANBA_TARTIB.indexOf(a.manba as never) - MANBA_TARTIB.indexOf(b.manba as never))
    .filter((x) => { const k = `${x.manba}|${x.narx}`; if (korilgan.has(k)) return false; korilgan.add(k); return true; });
}

/** Tanlangan narx bo'yicha qator summalari (ustamasiz + kat kesimi ustamali hisob uchun). Smeta hajmi noma'lum bo'lsa smeta summasi null. */
export function narxsizSummalar(kat: string | null | undefined, fakt: number, smeta: number | null, narx: number) {
  const faktSumma = fakt * narx; const faktKesim = bosKatKesim(); katKesimgaQosh(faktKesim, kat, faktSumma);
  if (smeta == null) return { faktSumma, faktKesim, smetaSumma: null, smetaKesim: null };
  const smetaSumma = smeta * narx; const smetaKesim = bosKatKesim(); katKesimgaQosh(smetaKesim, kat, smetaSumma);
  return { faktSumma, faktKesim, smetaSumma, smetaKesim };
}

/** Fakt oynasida narxlash taklif qilinadigan qator: material/uskuna va smeta narxi noma'lum (NULL; 0 emas). */
export function narxlashMumkin(tur: string, smetaNarx: number | null | undefined): boolean {
  return (tur === 'mat' || tur === 'ob') && smetaNarx == null;
}
